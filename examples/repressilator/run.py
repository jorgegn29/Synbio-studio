#!/usr/bin/env python3
"""Compile the repressilator BioScript file, then simulate it.

The Rust compiler emits SBOL and SBML. It does not integrate the circuit.
The Python engine integrates an explicit model:

* ODE: the symmetric Elowitz repressilator (Hill repression). The ODE endpoint
  accepts arithmetic rate laws, so the Hill function can be written directly.
* Gillespie: one unregulated transcription-translation cassette. The SSA
  endpoint accepts a constant propensity per reaction, not a Hill function,
  so this stochastic run is not the repressed ring.

Both calls use the same functions as POST /api/simulate/ode and POST /api/simulate/ssa.
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
import subprocess
import sys
from pathlib import Path

logging.basicConfig(level=logging.WARNING)

REPO = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO / "python-engine"))

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
import server

HERE = Path(__file__).resolve().parent
SOURCE = HERE / "repressilator.bio"
OUT = HERE / "output"

# Dimensionless Elowitz & Leibler form:
#   dm_i/dt = -m_i + alpha / (1 + p_j^n) + alpha0
#   dp_i/dt = -beta * (p_i - m_i)
# Repression ring: p_cI -> lacI, p_lacI -> tetR, p_tetR -> cI.
ALPHA = 216.0
ALPHA0 = 0.216
BETA = 0.2
HILL = 2.0
T_END = 120.0
N_POINTS = 601


def compiler_binary() -> Path:
    env = os.environ.get("SYNBIO_LSP")
    candidates = []
    if env:
        candidates.append(Path(env))
    candidates.extend(
        [
            REPO / "server" / "target" / "debug" / "synbio-lsp",
            REPO / "server" / "target" / "release" / "synbio-lsp",
        ]
    )
    for path in candidates:
        if path.is_file() and os.access(path, os.X_OK):
            return path
    raise SystemExit(
        "synbio-lsp was not found. From the repository root run:\n"
        "  cargo build --manifest-path server/Cargo.toml"
    )


def compile_bioscript() -> dict:
    binary = compiler_binary()
    completed = subprocess.run(
        [str(binary), "--compile-full"],
        input=SOURCE.read_text(encoding="utf-8"),
        text=True,
        capture_output=True,
        check=False,
    )
    if completed.returncode != 0:
        raise SystemExit(f"compiler exit {completed.returncode}\n{completed.stderr}")
    try:
        result = json.loads(completed.stdout)
    except json.JSONDecodeError as exc:
        raise SystemExit(f"compiler did not return JSON: {exc}\n{completed.stdout[:400]}") from exc
    if not result.get("success"):
        raise SystemExit(f"compile failed: {result.get('errors')}")
    for key in ("sbol", "sbml"):
        text = result.get(key) or ""
        if "LacI" not in text or "TetR" not in text or "cI" not in text:
            raise SystemExit(f"{key} export is missing LacI, TetR, or cI")
    return result


def ode_request() -> server.ODERequest:
    species = [
        {"name": "m_laci", "initial": 0.2},
        {"name": "p_laci", "initial": 0.1},
        {"name": "m_tetr", "initial": 0.5},
        {"name": "p_tetr", "initial": 0.4},
        {"name": "m_ci", "initial": 1.2},
        {"name": "p_ci", "initial": 1.0},
    ]
    repressed_by = {"m_laci": "p_ci", "m_tetr": "p_laci", "m_ci": "p_tetr"}
    proteins = {"m_laci": "p_laci", "m_tetr": "p_tetr", "m_ci": "p_ci"}
    reactions = []
    for mrna, repressor in repressed_by.items():
        protein = proteins[mrna]
        reactions.append(
            {
                "name": f"txn_{mrna}",
                "reactants": {},
                "products": {mrna: 1},
                "rate_law": f"alpha0 + alpha / (1 + {repressor} ** n)",
            }
        )
        reactions.append(
            {
                "name": f"deg_{mrna}",
                "reactants": {mrna: 1},
                "products": {},
                "rate_law": mrna,
            }
        )
        reactions.append(
            {
                "name": f"tln_{protein}",
                "reactants": {},
                "products": {protein: 1},
                "rate_law": f"beta * {mrna}",
            }
        )
        reactions.append(
            {
                "name": f"deg_{protein}",
                "reactants": {protein: 1},
                "products": {},
                "rate_law": f"beta * {protein}",
            }
        )
    return server.ODERequest(
        species=species,
        reactions=reactions,
        parameters={"alpha": ALPHA, "alpha0": ALPHA0, "beta": BETA, "n": HILL},
        t_start=0.0,
        t_end=T_END,
        n_points=N_POINTS,
        method="RK45",
    )


def ssa_request() -> server.SSARequest:
    # Mass-action cassette. Same shape as the engine gauntlet, one seed.
    return server.SSARequest(
        species=[
            {"name": "mRNA", "initial": 0},
            {"name": "protein", "initial": 0},
        ],
        reactions=[
            {"name": "transcription", "reactants": {}, "products": {"mRNA": 1}, "rate": 0.8},
            {"name": "mrna_decay", "reactants": {"mRNA": 1}, "products": {}, "rate": 0.2},
            {
                "name": "translation",
                "reactants": {"mRNA": 1},
                "products": {"mRNA": 1, "protein": 1},
                "rate": 1.4,
            },
            {"name": "protein_decay", "reactants": {"protein": 1}, "products": {}, "rate": 0.05},
        ],
        t_start=0.0,
        t_end=30.0,
        n_points=61,
        n_trajectories=1,
        seed=2026,
        algorithm="SSA",
    )


def peak_times(time: list[float], values: list[float]) -> list[float]:
    peaks: list[float] = []
    for index in range(1, len(values) - 1):
        if values[index] > values[index - 1] and values[index] >= values[index + 1] and values[index] > 5:
            if not peaks or time[index] - peaks[-1] > 5:
                peaks.append(time[index])
    return peaks


def plot(ode: server.ODEResponse, ssa: server.SSAResponse, path: Path) -> None:
    figure, axes = plt.subplots(2, 1, figsize=(8, 6), constrained_layout=True)
    for name, color in (("p_laci", "#1b9e77"), ("p_tetr", "#d95f02"), ("p_ci", "#7570b3")):
        axes[0].plot(ode.time, ode.trajectories[name], label=name, color=color, linewidth=1.5)
    axes[0].set_title("ODE repressilator (Hill repression)")
    axes[0].set_xlabel("time (dimensionless)")
    axes[0].set_ylabel("protein")
    axes[0].legend(frameon=False)

    trajectory = ssa.trajectories[0]
    axes[1].plot(trajectory.time, trajectory.species["mRNA"], label="mRNA", color="#666666")
    axes[1].plot(trajectory.time, trajectory.species["protein"], label="protein", color="#1b9e77")
    axes[1].set_title("Gillespie SSA, one unregulated cassette (seed 2026)")
    axes[1].set_xlabel("time")
    axes[1].set_ylabel("molecule count")
    axes[1].legend(frameon=False)
    figure.savefig(path, dpi=120)
    plt.close(figure)


async def main() -> None:
    compiled = compile_bioscript()
    ode = await server.simulate_ode(ode_request())
    first = await server.simulate_ssa(ssa_request())
    second = await server.simulate_ssa(ssa_request())
    if not ode.success or not first.success:
        raise SystemExit("simulation endpoint returned success=false")
    if len(ode.time) != N_POINTS:
        raise SystemExit(f"expected {N_POINTS} ODE points, got {len(ode.time)}")
    if first.trajectories != second.trajectories:
        raise SystemExit("seeded SSA trajectories differed")

    peaks = peak_times(ode.time, ode.trajectories["p_laci"])
    p_max = max(ode.trajectories["p_laci"])
    if len(peaks) < 3 or p_max < 40:
        raise SystemExit(f"ODE did not oscillate: peaks={peaks} max={p_max}")
    protein_end = first.trajectories[0].species["protein"][-1]
    if protein_end <= 0:
        raise SystemExit("SSA protein count was still zero at the last sample")

    OUT.mkdir(exist_ok=True)
    plot_path = OUT / "repressilator.png"
    plot(ode, first, plot_path)
    summary = {
        "compiler": "synbio-lsp --compile-full",
        "sbol_characters": len(compiled["sbol"]),
        "sbml_characters": len(compiled["sbml"]),
        "ode_peaks_p_laci": [round(value, 2) for value in peaks],
        "ode_p_laci_max": round(p_max, 2),
        "ode_p_laci_final": round(ode.trajectories["p_laci"][-1], 2),
        "ssa_solver": first.solver_used,
        "ssa_protein_final": protein_end,
        "ssa_mrna_final": first.trajectories[0].species["mRNA"][-1],
        "plot": str(plot_path.relative_to(REPO)),
    }
    print(json.dumps(summary, indent=2))


if __name__ == "__main__":
    asyncio.run(main())
