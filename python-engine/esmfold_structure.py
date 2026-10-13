from __future__ import annotations

import math
from typing import Any, Dict, List, Optional


ESMFOLD_API = "https://api.esmatlas.com/foldSequence/v1/pdb/"
MAX_SEQUENCE_LENGTH = 400
AA_ALPHABET = set("ACDEFGHIKLMNPQRSTVWY")


def normalize_protein_sequence(sequence: str) -> str:
    return "".join(residue for residue in str(sequence).upper() if residue in AA_ALPHABET)


async def fetch_esmfold_pdb(sequence: str, httpx_module: Any) -> str:
    clean = normalize_protein_sequence(sequence)
    if len(clean) < 10:
        raise ValueError("Protein sequence must contain at least 10 amino acids")
    if len(clean) > MAX_SEQUENCE_LENGTH:
        raise ValueError(
            f"Protein sequence too long for free ESMFold API ({len(clean)} aa > {MAX_SEQUENCE_LENGTH} aa)"
        )

    async with httpx_module.AsyncClient(timeout=180.0, follow_redirects=True) as client:
        response = await client.post(
            ESMFOLD_API,
            content=clean,
            headers={
                "Content-Type": "application/x-www-form-urlencoded",
                "User-Agent": "SynBio-Studio/2.0",
            },
        )
        response.raise_for_status()
        return response.text


def parse_pdb_confidence(pdb_text: str) -> List[Dict[str, float]]:
    scores: List[Dict[str, float]] = []
    for line in pdb_text.splitlines():
        if not line.startswith("ATOM"):
            continue
        atom_name = line[12:16].strip()
        if atom_name != "CA":
            continue
        try:
            residue = int(line[22:26].strip())
            plddt = float(line[60:66].strip())
        except ValueError:
            continue
        scores.append({"residue": residue, "plddt": plddt})
    if scores and max(item["plddt"] for item in scores) <= 1.5:
        for item in scores:
            item["plddt"] *= 100.0
    for item in scores:
        item["plddt"] = round(item["plddt"], 3)
    return scores


def parse_secondary_structure(pdb_text: str) -> Dict[str, Any]:
    helix_residues = 0
    sheet_residues = 0
    confidence = parse_pdb_confidence(pdb_text)
    total_residues = len(confidence)

    for line in pdb_text.splitlines():
        if line.startswith("HELIX"):
            try:
                start = int(line[21:25].strip())
                end = int(line[33:37].strip())
            except ValueError:
                continue
            helix_residues += max(0, end - start + 1)
        elif line.startswith("SHEET"):
            try:
                start = int(line[22:26].strip())
                end = int(line[33:37].strip())
            except ValueError:
                continue
            sheet_residues += max(0, end - start + 1)

    coil_residues = max(0, total_residues - helix_residues - sheet_residues)
    return {
        "helix": helix_residues,
        "sheet": sheet_residues,
        "coil": coil_residues,
        "total": total_residues,
        "helix_fraction": round((helix_residues / total_residues) if total_residues else 0.0, 4),
        "sheet_fraction": round((sheet_residues / total_residues) if total_residues else 0.0, 4),
        "coil_fraction": round((coil_residues / total_residues) if total_residues else 0.0, 4),
    }


def _estimate_charge(sequence: str) -> int:
    positives = sum(sequence.count(aa) for aa in ("K", "R"))
    negatives = sum(sequence.count(aa) for aa in ("D", "E"))
    histidine = sequence.count("H") * 0.1
    return int(round(positives + histidine - negatives))


def analyze_protein_properties(sequence: str) -> Dict[str, Any]:
    clean = normalize_protein_sequence(sequence)
    composition = {aa: clean.count(aa) for aa in sorted(AA_ALPHABET) if clean.count(aa) > 0}

    try:
        from Bio.SeqUtils.ProtParam import ProteinAnalysis

        analysis = ProteinAnalysis(clean)
        extinction_reduced, extinction_oxidized = analysis.molar_extinction_coefficient()
        return {
            "length": len(clean),
            "molecular_weight": round(float(analysis.molecular_weight()), 3),
            "isoelectric_point": round(float(analysis.isoelectric_point()), 3),
            "charge": _estimate_charge(clean),
            "hydropathy_index": round(float(analysis.gravy()), 4),
            "extinction_coefficient_reduced": int(extinction_reduced),
            "extinction_coefficient_oxidized": int(extinction_oxidized),
            "instability_index": round(float(analysis.instability_index()), 3),
            "aromaticity": round(float(analysis.aromaticity()), 4),
            "composition": composition,
        }
    except Exception:
        aa_mass = {
            "A": 89.09, "C": 121.16, "D": 133.10, "E": 147.13, "F": 165.19,
            "G": 75.07, "H": 155.16, "I": 131.17, "K": 146.19, "L": 131.17,
            "M": 149.21, "N": 132.12, "P": 115.13, "Q": 146.15, "R": 174.20,
            "S": 105.09, "T": 119.12, "V": 117.15, "W": 204.23, "Y": 181.19,
        }
        total_mass = sum(aa_mass.get(aa, 0.0) for aa in clean) - max(0, len(clean) - 1) * 18.015
        hydro = {
            "A": 1.8, "C": 2.5, "D": -3.5, "E": -3.5, "F": 2.8,
            "G": -0.4, "H": -3.2, "I": 4.5, "K": -3.9, "L": 3.8,
            "M": 1.9, "N": -3.5, "P": -1.6, "Q": -3.5, "R": -4.5,
            "S": -0.8, "T": -0.7, "V": 4.2, "W": -0.9, "Y": -1.3,
        }
        hydropathy = sum(hydro.get(aa, 0.0) for aa in clean) / len(clean)
        return {
            "length": len(clean),
            "molecular_weight": round(total_mass, 3),
            "isoelectric_point": 7.0,
            "charge": _estimate_charge(clean),
            "hydropathy_index": round(hydropathy, 4),
            "extinction_coefficient_reduced": 0,
            "extinction_coefficient_oxidized": 0,
            "instability_index": 0.0,
            "aromaticity": round(sum(clean.count(aa) for aa in ("F", "W", "Y")) / len(clean), 4),
            "composition": composition,
        }


def summarise_confidence(confidence: List[Dict[str, float]]) -> Dict[str, Any]:
    if not confidence:
        return {
            "average_plddt": 0.0,
            "very_high": 0,
            "high": 0,
            "low": 0,
            "very_low": 0,
        }
    values = [item["plddt"] for item in confidence]
    return {
        "average_plddt": round(sum(values) / len(values), 3),
        "very_high": sum(1 for v in values if v >= 90),
        "high": sum(1 for v in values if 70 <= v < 90),
        "low": sum(1 for v in values if 50 <= v < 70),
        "very_low": sum(1 for v in values if v < 50),
    }


def interpret_structure(confidence_summary: Dict[str, Any], secondary_structure: Dict[str, Any]) -> str:
    avg_plddt = float(confidence_summary.get("average_plddt", 0.0))
    if avg_plddt >= 85:
        quality = "High-confidence ESMFold model suitable for domain-level interpretation."
    elif avg_plddt >= 70:
        quality = "Good fold-level confidence; loop regions may remain uncertain."
    elif avg_plddt >= 50:
        quality = "Moderate-confidence structure; use with caution beyond coarse topology."
    else:
        quality = "Low-confidence prediction; likely disordered or weakly constrained sequence."

    helix = secondary_structure.get("helix_fraction", 0.0) * 100
    sheet = secondary_structure.get("sheet_fraction", 0.0) * 100
    if helix > 45:
        architecture = "Predicted architecture is helix-rich."
    elif sheet > 25:
        architecture = "Predicted architecture contains substantial beta-sheet content."
    else:
        architecture = "Predicted architecture is mixed or loop-rich."
    return f"{quality} {architecture}"