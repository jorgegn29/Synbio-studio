"""Deterministic integration gauntlet for the local scientific API."""

import asyncio

import server
from fastapi import HTTPException


def test_health_compile_and_ode_pipeline():
    health = asyncio.run(server.health())
    assert health["status"] == "healthy"

    source = """
circuit gauntlet {
  host: "E_coli";
  promoter pTet;
  rbs B0034;
  gene sfGFP: Protein = GFP;
  terminator B0015;
  pTet -> B0034 -> sfGFP -> B0015;
}
"""
    compiled = asyncio.run(
        server.compile_bioscript(server.CompileRequest(source=source, target="all", optimisation_level=2))
    )
    assert compiled.success is True
    assert compiled.parts
    assert compiled.llvm_ir
    assert compiled.sbol

    model = {
        "species": [
            {"name": "mRNA", "initial": 0},
            {"name": "protein_immature", "initial": 0},
            {"name": "protein_mature", "initial": 0},
        ],
        "reactions": [
            {"name": "transcription", "reactants": {}, "products": {"mRNA": 1}, "rate_law": "k_txn"},
            {"name": "mrna_decay", "reactants": {"mRNA": 1}, "products": {}, "rate_law": "d_mRNA * mRNA"},
            {
                "name": "translation",
                "reactants": {"mRNA": 1},
                "products": {"mRNA": 1, "protein_immature": 1},
                "rate_law": "k_tln * mRNA",
            },
            {
                "name": "maturation",
                "reactants": {"protein_immature": 1},
                "products": {"protein_mature": 1},
                "rate_law": "k_mat * protein_immature",
            },
            {
                "name": "immature_decay",
                "reactants": {"protein_immature": 1},
                "products": {},
                "rate_law": "d_protein * protein_immature",
            },
            {
                "name": "mature_decay",
                "reactants": {"protein_mature": 1},
                "products": {},
                "rate_law": "d_protein * protein_mature",
            },
        ],
        "parameters": {
            "k_txn": 0.8,
            "k_tln": 1.4,
            "d_mRNA": 0.2,
            "d_protein": 0.05,
            "k_mat": 0.12,
        },
        "t_start": 0,
        "t_end": 120,
        "n_points": 241,
        "method": "RK45",
    }
    ode_result = asyncio.run(server.simulate_ode(server.ODERequest(**model)))
    assert ode_result.success is True
    assert len(ode_result.time) == 241
    assert ode_result.trajectories["mRNA"][-1] > 0
    assert ode_result.trajectories["protein_mature"][-1] > 0
    assert ode_result.trajectories["protein_mature"][-1] < (
        ode_result.trajectories["protein_immature"][-1]
        + ode_result.trajectories["protein_mature"][-1]
    )


def test_seeded_ssa_is_reproducible_with_available_solver():
    payload = {
        "species": [
            {"name": "mRNA", "initial": 0},
            {"name": "protein_immature", "initial": 0},
            {"name": "protein_mature", "initial": 0},
        ],
        "reactions": [
            {"name": "transcription", "reactants": {}, "products": {"mRNA": 1}, "rate": 0.8},
            {"name": "mrna_decay", "reactants": {"mRNA": 1}, "products": {}, "rate": 0.2},
            {
                "name": "translation",
                "reactants": {"mRNA": 1},
                "products": {"mRNA": 1, "protein_immature": 1},
                "rate": 1.4,
            },
            {
                "name": "maturation",
                "reactants": {"protein_immature": 1},
                "products": {"protein_mature": 1},
                "rate": 0.12,
            },
            {"name": "immature_decay", "reactants": {"protein_immature": 1}, "products": {}, "rate": 0.05},
            {"name": "mature_decay", "reactants": {"protein_mature": 1}, "products": {}, "rate": 0.05},
        ],
        "t_start": 0,
        "t_end": 30,
        "n_points": 61,
        "n_trajectories": 2,
        "seed": 2026,
        "algorithm": "SSA",
    }
    request = server.SSARequest(**payload)
    first = asyncio.run(server.simulate_ssa(request))
    second = asyncio.run(server.simulate_ssa(request))
    assert first.trajectories == second.trajectories


def test_ode_rate_laws_reject_attribute_traversal():
    request = server.ODERequest(
        species=[{"name": "A", "initial": 1}],
        reactions=[
            {
                "name": "unsafe",
                "reactants": {"A": 1},
                "products": {},
                "rate_law": "(1).__class__.__base__",
            }
        ],
        parameters={},
        t_end=1,
        n_points=10,
    )
    try:
        asyncio.run(server.simulate_ode(request))
    except HTTPException as error:
        assert error.status_code == 400
    else:
        raise AssertionError("Unsafe attribute traversal was accepted")
