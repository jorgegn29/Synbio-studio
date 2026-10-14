#!/usr/bin/env python3
"""COPASI time courses for the TetR inverter and the pLac GFP cassette.

Rate laws are substance/time, so mRNA and protein move on the degradation
timescales (minutes and about an hour), not to steady state within 1 second.
"""

import json
import sys
from pathlib import Path

import basico


DURATION = 8 * 3600
STEP = 10


def series(frame, species):
    column = None
    needle = species.lower()
    for name in frame.columns:
        label = str(name).lower().replace(" ", "")
        if needle in label:
            column = name
            break
    if column is None:
        raise SystemExit(f"missing species {species} in {list(frame.columns)}")
    times = [float(t) for t in frame.index]
    values = [float(v) for v in frame[column]]
    return times, values


def value_at(times, values, target):
    best = min(range(len(times)), key=lambda i: abs(times[i] - target))
    return values[best], times[best]


def time_to_cross(times, values, start, goal, falling):
    begin = next(i for i, t in enumerate(times) if t >= start - 1e-6)
    for index in range(begin, len(times)):
        if falling and values[index] <= goal:
            return times[index] - start
        if not falling and values[index] >= goal:
            return times[index] - start
    return None


def simulate(path):
    basico.load_model(str(path))
    frame = basico.run_time_course(
        duration=DURATION,
        intervals=DURATION // STEP,
        automatic=False,
        method="deterministic",
    )
    return frame


def peak_after(times, values, start):
    begin = next(i for i, t in enumerate(times) if t >= start - 1e-6)
    peak_i = max(range(begin, len(times)), key=lambda i: values[i])
    return times[peak_i], values[peak_i]


def check_inverter(path):
    frame = simulate(path)
    mrna_t, mrna = series(frame, "mrna")
    prot_t, prot = series(frame, "protein")
    early, _ = value_at(mrna_t, mrna, 10.0)
    before, before_t = value_at(mrna_t, mrna, 300.0)
    if before <= 0 or early >= 0.2 * before:
        raise SystemExit(
            f"inverter mRNA reached steady state too fast: t=10s {early}, t=300s {before}"
        )
    final_m = mrna[-1]
    decay = time_to_cross(
        mrna_t,
        mrna,
        before_t,
        final_m + 0.5 * (before - final_m),
        falling=True,
    )
    peak_t, peak_p = peak_after(prot_t, prot, 300.0)
    final_p = prot[-1]
    prot_half = time_to_cross(
        prot_t,
        prot,
        peak_t,
        final_p + 0.5 * (peak_p - final_p),
        falling=True,
    )
    report = {
        "file": path.name,
        "mrna_ratio_10s_over_300s": early / before,
        "mrna_decay_half_time_s": decay,
        "protein_peak_time_s": peak_t,
        "protein_decay_half_time_s": prot_half,
    }
    if decay is None or not 120 <= decay <= 1800:
        raise SystemExit(f"inverter mRNA half-time out of range: {report}")
    if prot_half is None or not 1200 <= prot_half <= 4 * 3600:
        raise SystemExit(f"inverter protein half-time out of range: {report}")
    return report


def check_gfp(path):
    frame = simulate(path)
    mrna_t, mrna = series(frame, "mrna")
    prot_t, prot = series(frame, "protein")
    base_m, _ = value_at(mrna_t, mrna, 300.0)
    end_m, _ = value_at(mrna_t, mrna, DURATION)
    base_p, _ = value_at(prot_t, prot, 300.0)
    end_p, _ = value_at(prot_t, prot, DURATION)
    if end_m <= base_m * 2 or end_p <= base_p * 2:
        raise SystemExit(
            f"GFP cassette did not induce: mRNA {base_m}->{end_m}, protein {base_p}->{end_p}"
        )
    mrna_half = time_to_cross(mrna_t, mrna, 300.0, base_m + 0.5 * (end_m - base_m), falling=False)
    prot_half = time_to_cross(prot_t, prot, 300.0, base_p + 0.5 * (end_p - base_p), falling=False)
    early, _ = value_at(prot_t, prot, 360.0)
    report = {
        "file": path.name,
        "mrna_induction_half_time_s": mrna_half,
        "protein_induction_half_time_s": prot_half,
        "protein_just_after_step": early,
        "protein_final": end_p,
    }
    if mrna_half is None or not 120 <= mrna_half <= 1800:
        raise SystemExit(f"GFP mRNA half-time out of range: {report}")
    if prot_half is None or not 1200 <= prot_half <= 4 * 3600:
        raise SystemExit(f"GFP protein half-time out of range: {report}")
    if early <= 0 or early >= 0.05 * end_p:
        raise SystemExit(f"GFP protein is not on an hour-scale rise after IPTG: {report}")
    return report


def main() -> int:
    folder = Path(sys.argv[1] if len(sys.argv) > 1 else ".")
    reports = [
        check_inverter(folder / "inverter.sbml"),
        check_gfp(folder / "gfp_cassette_demo.sbml"),
    ]
    print(json.dumps(reports, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
