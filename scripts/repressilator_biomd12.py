#!/usr/bin/env python3
"""Compare a BioScript repressilator export with BIOMD0000000012's equations.

The Rust test `biomd12_repressilator_export_oscillates` checks the same
relationship inside `cargo test`. This script is the standalone version.
It is not a required CI step. It needs the `synbio-lsp` binary
(`cargo build --manifest-path server/Cargo.toml`) and no third-party
Python packages.

BIOMD0000000012 (Elowitz and Leibler, Nature 2000) is in minutes.
The SBML export is in seconds, so every first-order rate is divided by 60.
`ps_a` is 0.5 transcripts per second from a free promoter and `ps_0` is
0.0005 from a fully repressed promoter, which is how that BioModels file
defines `a_tr` and `a0_tr`.
"""

from __future__ import annotations

import json
import math
import os
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
LN2 = math.log(2)
K_MRNA = LN2 / 2.0 / 60.0
K_PROT = LN2 / 10.0 / 60.0
K_TLN = 20.0 * LN2 / 2.0 / 60.0
K_TXN = 0.5 - 0.0005
K_LEAK = 0.0005

SOURCE = f"""
circuit Repressilator {{
    pLambda -> B0034 -> LacI -> B0015
    pLac -> B0034 -> TetR -> B0015
    pTet -> B0034 -> cI -> B0015
    LacI ~> pLac
    TetR ~> pTet
    cI ~> pLambda
    kinetics {{
        hill: 2
        K: 40
        k_txn: {K_TXN:.12f}
        k_tln: {K_TLN:.12f}
        k_leak: {K_LEAK:.12f}
        k_mRNA_deg: {K_MRNA:.12f}
        k_prot_deg: {K_PROT:.12f}
        TetR: {{ initial_mRNA: 20 }}
    }}
}}
"""

# State: LacI mRNA, LacI protein, TetR mRNA, TetR protein, cI mRNA, cI protein.
# cI protein represses LacI, LacI protein represses TetR, TetR protein represses cI.
REPRESSOR = (5, 1, 3)


def binary() -> Path | None:
    env = os.environ.get("SYNBIO_LSP")
    candidates = [Path(env)] if env else []
    candidates.extend(
        [
            ROOT / "server/target/release/synbio-lsp",
            ROOT / "server/target/debug/synbio-lsp",
        ]
    )
    for path in candidates:
        if path.is_file() and os.access(path, os.X_OK):
            return path
    return None


def compile_sbml(path: Path) -> str:
    completed = subprocess.run(
        [str(path), "--compile-full"],
        input=SOURCE,
        text=True,
        capture_output=True,
        check=False,
    )
    if completed.returncode != 0:
        raise SystemExit(completed.stderr or completed.stdout)
    payload = json.loads(completed.stdout)
    if not payload.get("success"):
        raise SystemExit(payload.get("errors"))
    return payload["sbml"]


def parameter(sbml: str, identifier: str) -> float:
    marker = f'id="{identifier}"'
    start = sbml.find(marker)
    if start < 0:
        raise SystemExit(f"missing SBML parameter {identifier}")
    window = sbml[start:]
    value_at = window.find('value="')
    if value_at < 0:
        raise SystemExit(f"parameter {identifier} has no value")
    value_at += 7
    end = window.find('"', value_at)
    return float(window[value_at:end])


def modifier(sbml: str, reaction: str) -> str:
    marker = f'<reaction id="{reaction}"'
    start = sbml.find(marker)
    end = sbml.find("</reaction>", start)
    block = sbml[start:end]
    key = 'modifierSpeciesReference species="'
    pos = block.find(key)
    if pos < 0:
        raise SystemExit(f"{reaction} has no modifier")
    pos += len(key)
    return block[pos : block.find('"', pos)]


def derive(state: list[float], rates: dict[str, float]) -> list[float]:
    out = [0.0] * 6
    kn = rates["K"] ** rates["n"]
    for gene in range(3):
        repressor = state[REPRESSOR[gene]]
        sn = repressor ** rates["n"]
        mrna = state[gene * 2]
        protein = state[gene * 2 + 1]
        out[gene * 2] = rates["k_leak"] + rates["k_txn"] * kn / (kn + sn) - rates["k_mrna"] * mrna
        out[gene * 2 + 1] = rates["k_tln"] * mrna - rates["k_prot"] * protein
    return out


def integrate(rates: dict[str, float], state: list[float]) -> tuple[float, float, list[float]]:
    dt = 1.0
    steps = 2000 * 60
    samples: list[float] = []
    peaks: list[float] = []
    previous = state[1]
    previous_slope = 0.0
    for step in range(steps):
        k1 = derive(state, rates)
        mid = [state[i] + 0.5 * dt * k1[i] for i in range(6)]
        k2 = derive(mid, rates)
        mid2 = [state[i] + 0.5 * dt * k2[i] for i in range(6)]
        k3 = derive(mid2, rates)
        end = [state[i] + dt * k3[i] for i in range(6)]
        k4 = derive(end, rates)
        state = [
            state[i] + dt * (k1[i] + 2 * k2[i] + 2 * k3[i] + k4[i]) / 6.0
            for i in range(6)
        ]
        minute = (step + 1) / 60.0
        if step % 30 == 0:
            samples.append(state[1])
        slope = state[1] - previous
        if minute >= 1000.0 and previous_slope > 0.0 and slope <= 0.0:
            peaks.append(minute)
        previous_slope = slope
        previous = state[1]
    if len(peaks) < 3:
        raise SystemExit(f"export did not oscillate; peaks={peaks}")
    period = sum(peaks[i + 1] - peaks[i] for i in range(len(peaks) - 1)) / (len(peaks) - 1)
    window = samples[len(samples) // 2 :]
    amplitude = max(window) - min(window)
    return period, amplitude, samples


def main() -> int:
    path = binary()
    if path is None:
        print(json.dumps({"skipped": True, "reason": "synbio-lsp binary was not found"}))
        return 0
    sbml = compile_sbml(path)
    expected = {
        "txn_pLac_TetR": "protein_pLambda_LacI",
        "txn_pTet_cI": "protein_pLac_TetR",
        "txn_pLambda_LacI": "protein_pTet_cI",
    }
    for reaction, protein in expected.items():
        found = modifier(sbml, reaction)
        if found != protein:
            raise SystemExit(f"{reaction} modifier is {found}, expected {protein}")
    if "regulator_" in sbml:
        raise SystemExit("export still contains an unlinked regulator species")
    rates = {
        "k_txn": parameter(sbml, "k_txn_pLac_TetR"),
        "k_tln": parameter(sbml, "k_tln_pLac_TetR"),
        "k_leak": parameter(sbml, "k_leak_pLac_TetR"),
        "k_mrna": parameter(sbml, "k_mRNA_deg"),
        "k_prot": parameter(sbml, "k_prot_deg"),
        "K": parameter(sbml, "K_hill"),
        "n": 2.0,
    }
    period, amplitude, samples = integrate(rates, [0.0, 0.0, 20.0, 0.0, 0.0, 0.0])
    reference_rates = {
        "k_txn": K_TXN,
        "k_tln": K_TLN,
        "k_leak": K_LEAK,
        "k_mrna": K_MRNA,
        "k_prot": K_PROT,
        "K": 40.0,
        "n": 2.0,
    }
    _, _, reference = integrate(reference_rates, [0.0, 0.0, 20.0, 0.0, 0.0, 0.0])
    square = sum((left - right) ** 2 for left, right in zip(samples, reference))
    nrmse = math.sqrt(square / len(samples)) / (max(reference) - min(reference))
    report = {
        "binary": str(path),
        "period_min": round(period, 2),
        "laci_amplitude": round(amplitude, 2),
        "nrmse_vs_biomd12_equations": nrmse,
    }
    print(json.dumps(report, indent=2))
    if not 110.0 < period < 140.0 or nrmse >= 1e-3 or amplitude < 1000.0:
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
