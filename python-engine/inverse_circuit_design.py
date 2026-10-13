from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Any, Dict, List, Optional, Sequence, Tuple


MODEL_VERSION = "inverse-circuit-csp-v1"


@dataclass(frozen=True)
class SensorSystem:
    key: str
    display_name: str
    category: str
    signal_label: str
    aliases: Tuple[str, ...]
    promoter: str
    promoter_part: str
    regulator: str
    regulator_part: str
    host_support: Tuple[str, ...]
    dynamic_range: float
    leakiness: float
    burden: float
    notes: str
    references: Tuple[str, ...]


@dataclass(frozen=True)
class Reporter:
    key: str
    display_name: str
    output_label: str
    aliases: Tuple[str, ...]
    gene: str
    part_id: str
    color: str
    maturity: float
    burden: float
    references: Tuple[str, ...]


@dataclass(frozen=True)
class Topology:
    key: str
    display_name: str
    behavior: str
    supported_conditions: Tuple[str, ...]
    input_count: int
    complexity: str
    dynamic_range_bonus: float
    leak_penalty_bonus: float
    burden_penalty: float
    references: Tuple[str, ...]


SENSOR_LIBRARY: Tuple[SensorSystem, ...] = (
    SensorSystem(
        key="arabinose_pbad",
        display_name="AraC / pBAD arabinose sensor",
        category="sugar",
        signal_label="arabinose",
        aliases=("arabinose", "arabinosa", "sugar", "azucar", "sugar presence"),
        promoter="pBAD",
        promoter_part="BBa_I0500",
        regulator="araC",
        regulator_part="BBa_C0080",
        host_support=("e_coli", "gram_negative"),
        dynamic_range=0.92,
        leakiness=0.14,
        burden=0.18,
        notes="Well-characterised sugar-inducible system with low basal expression in E. coli.",
        references=(
            "Schleif R. Trends Genet 16:559-565 (2000)",
            "iGEM BBa_I0500 / BBa_C0080",
        ),
    ),
    SensorSystem(
        key="rhamnose_prha",
        display_name="RhaS / pRhaBAD rhamnose sensor",
        category="sugar",
        signal_label="rhamnose",
        aliases=("rhamnose", "ramnosa"),
        promoter="pRhaBAD",
        promoter_part="BBa_K914003",
        regulator="rhaS",
        regulator_part="native RhaS",
        host_support=("e_coli",),
        dynamic_range=0.9,
        leakiness=0.1,
        burden=0.2,
        notes="Very tight sugar-inducible promoter often preferred when low leak matters.",
        references=(
            "Wegerer A et al. Appl Environ Microbiol 74: 2008",
            "iGEM pRhaBAD implementations",
        ),
    ),
    SensorSystem(
        key="xylose_pxylA",
        display_name="XylR / PxylA xylose sensor",
        category="sugar",
        signal_label="xylose",
        aliases=("xylose", "xilosa"),
        promoter="PxylA",
        promoter_part="BBa_K733002",
        regulator="xylR",
        regulator_part="native XylR",
        host_support=("bacillus", "e_coli"),
        dynamic_range=0.83,
        leakiness=0.19,
        burden=0.16,
        notes="Useful sugar-responsive promoter, especially in Bacillus subtilis chassis.",
        references=(
            "Bhavsar AP et al. Nucleic Acids Res 29:e14 (2001)",
            "B. subtilis xylose systems literature",
        ),
    ),
    SensorSystem(
        key="iptg_plac",
        display_name="LacI / pLac IPTG-lactose sensor",
        category="chemical",
        signal_label="IPTG/lactose",
        aliases=("iptg", "lactose", "lactosa"),
        promoter="pLac",
        promoter_part="BBa_R0010",
        regulator="lacI",
        regulator_part="BBa_C0012",
        host_support=("e_coli", "gram_negative"),
        dynamic_range=0.77,
        leakiness=0.27,
        burden=0.17,
        notes="Classic inducible system; convenient but usually leakier than pBAD or pRhaBAD.",
        references=(
            "Lutz R, Bujard H. Nucleic Acids Res 25:1203-1210 (1997)",
            "iGEM BBa_R0010 / BBa_C0012",
        ),
    ),
    SensorSystem(
        key="ahl_plux",
        display_name="LuxR / pLux quorum sensor",
        category="quorum",
        signal_label="AHL",
        aliases=("ahl", "quorum", "lux"),
        promoter="pLux",
        promoter_part="BBa_R0062",
        regulator="luxR",
        regulator_part="BBa_C0062",
        host_support=("e_coli", "gram_negative"),
        dynamic_range=0.88,
        leakiness=0.16,
        burden=0.2,
        notes="Canonical quorum-sensing input module for cell-density dependent circuits.",
        references=(
            "Basu S et al. Nature 434:1130-1134 (2005)",
            "iGEM BBa_R0062 / BBa_C0062",
        ),
    ),
)


REPORTER_LIBRARY: Tuple[Reporter, ...] = (
    Reporter(
        key="green_fluorescence",
        display_name="sfGFP reporter",
        output_label="green fluorescence",
        aliases=("green fluorescence", "fluorescencia verde", "gfp", "green", "verde", "fluorescent green"),
        gene="sfGFP",
        part_id="BBa_E0040",
        color="green",
        maturity=0.95,
        burden=0.18,
        references=(
            "Cormack BP et al. Gene 173:33-38 (1996)",
            "Pédelacq JD et al. Nat Biotechnol 24:79-88 (2006)",
        ),
    ),
    Reporter(
        key="red_fluorescence",
        display_name="mCherry reporter",
        output_label="red fluorescence",
        aliases=("red fluorescence", "fluorescencia roja", "red", "roja", "mcherry"),
        gene="mCherry",
        part_id="BBa_J06504",
        color="red",
        maturity=0.9,
        burden=0.21,
        references=(
            "Shaner NC et al. Nat Biotechnol 22:1567-1572 (2004)",
            "iGEM BBa_J06504",
        ),
    ),
    Reporter(
        key="luminescence",
        display_name="luxCDABE operon",
        output_label="luminescence",
        aliases=("luminescence", "bioluminescence", "luz", "light output"),
        gene="luxCDABE",
        part_id="BBa_K325909",
        color="white",
        maturity=0.78,
        burden=0.38,
        references=(
            "Winson MK et al. FEMS Microbiol Lett 163:193-202 (1998)",
            "iGEM lux operon constructs",
        ),
    ),
)


TOPOLOGY_LIBRARY: Tuple[Topology, ...] = (
    Topology(
        key="direct_sensor_reporter",
        display_name="Direct inducible sensor-reporter",
        behavior="Single-input transcriptional induction",
        supported_conditions=("presence",),
        input_count=1,
        complexity="basic",
        dynamic_range_bonus=0.06,
        leak_penalty_bonus=0.0,
        burden_penalty=0.04,
        references=(
            "Schleif R. Trends Genet 16:559-565 (2000)",
            "Kelly JR et al. J Biol Eng 3:4 (2009)",
        ),
    ),
    Topology(
        key="low_leak_filtered_sensor",
        display_name="Filtered low-leak sensor",
        behavior="Single-input induction with a tighter promoter choice and insulated expression cassette",
        supported_conditions=("presence",),
        input_count=1,
        complexity="intermediate",
        dynamic_range_bonus=0.11,
        leak_penalty_bonus=0.08,
        burden_penalty=0.07,
        references=(
            "Wegerer A et al. Appl Environ Microbiol 74 (2008)",
            "Mutalik VK et al. Nat Methods 10:347-353 (2013)",
        ),
    ),
    Topology(
        key="transcriptional_inverter",
        display_name="Transcriptional NOT gate",
        behavior="Output is OFF in presence of the input and ON in its absence",
        supported_conditions=("absence",),
        input_count=1,
        complexity="intermediate",
        dynamic_range_bonus=0.05,
        leak_penalty_bonus=0.03,
        burden_penalty=0.08,
        references=(
            "Stanton BC et al. Nat Chem Biol 10:99-105 (2014)",
            "Nielsen AAK et al. Science 352:aac7341 (2016)",
        ),
    ),
    Topology(
        key="toggle_memory",
        display_name="Toggle switch with memory",
        behavior="Bistable circuit retaining state after transient induction",
        supported_conditions=("memory",),
        input_count=1,
        complexity="advanced",
        dynamic_range_bonus=0.09,
        leak_penalty_bonus=0.02,
        burden_penalty=0.18,
        references=(
            "Gardner TS, Cantor CR, Collins JJ. Nature 403:339-342 (2000)",
        ),
    ),
)


HOST_ALIASES: Dict[str, Tuple[str, ...]] = {
    "e_coli": ("e. coli", "escherichia coli", "ecoli", "mg1655", "bl21"),
    "bacillus": ("bacillus", "b. subtilis", "subtilis"),
    "gram_negative": ("gram negative",),
    "yeast": ("yeast", "saccharomyces", "cerevisiae"),
}


def _normalize_text(text: str) -> str:
    return " ".join(str(text or "").lower().replace("á", "a").replace("é", "e").replace("í", "i").replace("ó", "o").replace("ú", "u").split())


def _resolve_host(text: str, explicit_host: Optional[str]) -> str:
    if explicit_host:
        return explicit_host
    for host, aliases in HOST_ALIASES.items():
        if any(alias in text for alias in aliases):
            return host
    return "e_coli"


def _detect_output(text: str) -> Reporter:
    for reporter in REPORTER_LIBRARY:
        if any(alias in text for alias in reporter.aliases):
            return reporter
    if "fluoresc" in text or "fluor" in text:
        return REPORTER_LIBRARY[0]
    return REPORTER_LIBRARY[0]


def _detect_condition(text: str) -> str:
    if any(term in text for term in ("memory", "memoria", "recordar", "remember", "persistent")):
        return "memory"
    if any(term in text for term in ("absence", "ausencia", "without", "sin ")):
        return "absence"
    return "presence"


def _detect_priorities(text: str) -> List[str]:
    priorities: List[str] = []
    if any(term in text for term in ("only", "solo", "strict", "sin fuga", "no leak", "leak")):
        priorities.append("low_leak")
    if any(term in text for term in ("strong", "fuerte", "high expression", "alto rango")):
        priorities.append("high_dynamic_range")
    if any(term in text for term in ("low burden", "baja carga", "minimal burden")):
        priorities.append("low_burden")
    return priorities


def _detect_signals(text: str, host: str) -> Tuple[List[SensorSystem], List[str]]:
    exact_matches: List[SensorSystem] = []
    assumptions: List[str] = []
    for sensor in SENSOR_LIBRARY:
        if any(alias in text for alias in sensor.aliases if alias not in ("sugar", "azucar")):
            exact_matches.append(sensor)

    if exact_matches:
        return [sensor for sensor in exact_matches if host in sensor.host_support or "gram_negative" in sensor.host_support or host == sensor.host_support[0]], assumptions

    if "sugar" in text or "azucar" in text:
        sugar_candidates = [sensor for sensor in SENSOR_LIBRARY if sensor.category == "sugar" and host in sensor.host_support]
        if not sugar_candidates:
            sugar_candidates = [sensor for sensor in SENSOR_LIBRARY if sensor.category == "sugar"]
        assumptions.append("'Sugar' was mapped to the best-characterised host-compatible sugar sensor because the phenotype did not specify arabinose, lactose, xylose, or rhamnose explicitly.")
        return sugar_candidates, assumptions

    generic = [sensor for sensor in SENSOR_LIBRARY if host in sensor.host_support]
    assumptions.append("No explicit input signal was detected; the solver returned host-compatible sensor modules as defaults.")
    return generic[:2], assumptions


def parse_design_problem(phenotype_text: str, host: Optional[str] = None) -> Dict[str, Any]:
    text = _normalize_text(phenotype_text)
    resolved_host = _resolve_host(text, host)
    reporter = _detect_output(text)
    condition = _detect_condition(text)
    priorities = _detect_priorities(text)
    sensors, assumptions = _detect_signals(text, resolved_host)
    return {
        "phenotype_text": phenotype_text.strip(),
        "normalized_text": text,
        "host": resolved_host,
        "condition": condition,
        "reporter": reporter,
        "candidate_sensors": sensors,
        "priorities": priorities,
        "assumptions": assumptions,
    }


def _supported_topologies(condition: str, priorities: Sequence[str]) -> List[Topology]:
    candidates = [topology for topology in TOPOLOGY_LIBRARY if condition in topology.supported_conditions]
    if condition == "presence" and "low_leak" in priorities:
        filtered = [topology for topology in candidates if topology.key == "low_leak_filtered_sensor"]
        if filtered:
            return filtered + [topology for topology in candidates if topology.key != "low_leak_filtered_sensor"]
    return candidates


def _host_match_score(sensor: SensorSystem, host: str) -> float:
    if host in sensor.host_support:
        return 1.0
    if host == "e_coli" and "gram_negative" in sensor.host_support:
        return 0.82
    return 0.55


def _compute_design_score(sensor: SensorSystem, reporter: Reporter, topology: Topology, host: str, priorities: Sequence[str], generic_input: bool) -> float:
    score = 0.28 * sensor.dynamic_range
    score += 0.22 * (1.0 - sensor.leakiness)
    score += 0.14 * (1.0 - sensor.burden)
    score += 0.12 * (1.0 - reporter.burden)
    score += 0.1 * reporter.maturity
    score += 0.1 * _host_match_score(sensor, host)
    score += topology.dynamic_range_bonus
    score += topology.leak_penalty_bonus * (1.0 - sensor.leakiness)
    score -= topology.burden_penalty
    if "low_leak" in priorities:
        score += 0.08 * (1.0 - sensor.leakiness)
    if "high_dynamic_range" in priorities:
        score += 0.07 * sensor.dynamic_range
    if "low_burden" in priorities:
        score += 0.07 * (1.0 - sensor.burden)
    if generic_input:
        score -= 0.04
    return round(max(0.0, min(score, 0.99)), 4)


def _design_bioscript(sensor: SensorSystem, reporter: Reporter, topology: Topology, host: str) -> str:
    if topology.key == "direct_sensor_reporter":
        return f'''// Inverse design generated by SynBio Studio CSP engine
// Topology: {topology.display_name}
// Host target: {host}
genetic_circuit phenotype_driven_sensor {{
    promoter pConst_reg (type: "constitutive", strength: 0.4) {{}} // regulator support cassette
    rbs rbs_reg (strength: 0.6) {{}}
    gene {sensor.regulator} (product: "{sensor.regulator}") {{}} // {sensor.regulator_part}
    terminator t_reg (efficiency: 0.98) {{}}

    promoter {sensor.promoter} (type: "inducible", inducer: "{sensor.signal_label}") {{}} // {sensor.promoter_part}
    rbs rbs_out (strength: 1.0) {{}} // BBa_B0034
    gene {reporter.gene} (product: "{reporter.display_name}") {{}} // {reporter.part_id}
    terminator t_out (efficiency: 0.98) {{}} // BBa_B0015
}}'''

    if topology.key == "low_leak_filtered_sensor":
        return f'''// Inverse design generated by SynBio Studio CSP engine
// Topology: {topology.display_name}
// Goal: suppress basal output while keeping inducible response
genetic_circuit phenotype_driven_filtered_sensor {{
    promoter pConst_reg (type: "constitutive", strength: 0.35) {{}}
    rbs rbs_reg (strength: 0.5) {{}}
    gene {sensor.regulator} (product: "{sensor.regulator}") {{}} // {sensor.regulator_part}
    terminator t_reg (efficiency: 0.98) {{}}

    insulator riboJ (type: "insulator") {{}} // Mutalik et al. 2013
    promoter {sensor.promoter} (type: "inducible", inducer: "{sensor.signal_label}") {{}} // {sensor.promoter_part}
    rbs rbs_out (strength: 0.8) {{}} // moderate to reduce burden and basal noise
    gene {reporter.gene} (product: "{reporter.display_name}") {{}} // {reporter.part_id}
    degradation_tag LVA (type: "protein_tag") {{}} // tighten OFF-state memory
    terminator t_out (efficiency: 0.98) {{}}
}}'''

    if topology.key == "transcriptional_inverter":
        return f'''// Inverse design generated by SynBio Studio CSP engine
// Topology: {topology.display_name}
genetic_circuit phenotype_driven_inverter {{
    promoter pConst_reg (type: "constitutive", strength: 0.35) {{}}
    rbs rbs_reg (strength: 0.6) {{}}
    gene {sensor.regulator} (product: "{sensor.regulator}") {{}}
    terminator t_reg (efficiency: 0.98) {{}}

    promoter {sensor.promoter} (type: "inducible", inducer: "{sensor.signal_label}") {{}}
    rbs rbs_rep (strength: 0.6) {{}}
    gene cI (product: "lambda_cI") {{}} // transcriptional inverter stage
    terminator t_mid (efficiency: 0.98) {{}}

    promoter pCI (type: "repressible", repressor: "cI") {{}}
    rbs rbs_out (strength: 1.0) {{}}
    gene {reporter.gene} (product: "{reporter.display_name}") {{}}
    terminator t_out (efficiency: 0.98) {{}}
}}'''

    return f'''// Inverse design generated by SynBio Studio CSP engine
// Topology: {topology.display_name}
genetic_circuit phenotype_memory_switch {{
    promoter p{sensor.promoter} (type: "inducible", inducer: "{sensor.signal_label}") {{}}
    rbs rbs_lacI (strength: 0.6) {{}}
    gene lacI (product: "LacI") {{}}
    terminator t1 (efficiency: 0.98) {{}}

    promoter pTet (type: "repressible", repressor: "LacI") {{}}
    rbs rbs_tetR (strength: 0.6) {{}}
    gene tetR (product: "TetR") {{}}
    terminator t2 (efficiency: 0.98) {{}}

    promoter pOutput (type: "repressible", repressor: "TetR") {{}}
    rbs rbs_out (strength: 1.0) {{}}
    gene {reporter.gene} (product: "{reporter.display_name}") {{}}
    terminator t3 (efficiency: 0.98) {{}}
}}'''


def _predicted_behavior(sensor: SensorSystem, reporter: Reporter, topology: Topology, condition: str) -> str:
    if condition == "presence":
        return f"{reporter.output_label.capitalize()} is predicted to increase when {sensor.signal_label} is present, with basal expression constrained by the selected promoter topology."
    if condition == "absence":
        return f"{reporter.output_label.capitalize()} is predicted to remain ON when {sensor.signal_label} is absent and to shut down when the input appears."
    return f"A bistable memory circuit is proposed so that a transient {sensor.signal_label} input can switch the system into a persistent {reporter.output_label} state."


def solve_inverse_design(phenotype_text: str, host: Optional[str] = None, max_designs: int = 3) -> Dict[str, Any]:
    problem = parse_design_problem(phenotype_text, host)
    reporter = problem["reporter"]
    sensors: List[SensorSystem] = problem["candidate_sensors"]
    topologies = _supported_topologies(problem["condition"], problem["priorities"])
    generic_input = any("sugar" in assumption.lower() for assumption in problem["assumptions"])

    candidates: List[Dict[str, Any]] = []
    for topology in topologies:
        for sensor in sensors:
            if topology.input_count != 1:
                continue
            if problem["host"] not in sensor.host_support and not (problem["host"] == "e_coli" and "gram_negative" in sensor.host_support):
                continue
            score = _compute_design_score(sensor, reporter, topology, problem["host"], problem["priorities"], generic_input)
            candidates.append({
                "score": score,
                "sensor": sensor,
                "reporter": reporter,
                "topology": topology,
            })

    if not candidates:
        raise ValueError("No feasible circuit was found for the requested phenotype and host constraints")

    candidates.sort(key=lambda item: item["score"], reverse=True)
    designs: List[Dict[str, Any]] = []
    for item in candidates[:max_designs]:
        sensor = item["sensor"]
        topology = item["topology"]
        references = list(dict.fromkeys(list(sensor.references) + list(reporter.references) + list(topology.references)))
        rationale = [
            f"Selected {sensor.display_name} because it matches the requested input and has dynamic range {sensor.dynamic_range:.2f} with leakiness {sensor.leakiness:.2f}.",
            f"Chosen topology {topology.display_name} because the phenotype implies a '{problem['condition']}' logic condition.",
            f"Reporter {reporter.display_name} satisfies the requested output phenotype '{reporter.output_label}'.",
        ]
        if problem["priorities"]:
            rationale.append(f"Scoring priorities applied: {', '.join(problem['priorities'])}.")
        if problem["assumptions"]:
            rationale.extend(problem["assumptions"])
        designs.append({
            "circuit_name": f"{sensor.key}__{topology.key}__{reporter.key}",
            "design_score": item["score"],
            "host": problem["host"],
            "input_signal": sensor.signal_label,
            "output": reporter.output_label,
            "topology": topology.display_name,
            "complexity": topology.complexity,
            "parts": [
                {
                    "type": "sensor_promoter",
                    "name": sensor.promoter,
                    "part_id": sensor.promoter_part,
                    "role": f"Detect {sensor.signal_label}",
                },
                {
                    "type": "regulator",
                    "name": sensor.regulator,
                    "part_id": sensor.regulator_part,
                    "role": "Transcription factor / sensor regulator",
                },
                {
                    "type": "reporter",
                    "name": reporter.gene,
                    "part_id": reporter.part_id,
                    "role": reporter.output_label,
                },
                {
                    "type": "terminator",
                    "name": "BBa_B0015",
                    "part_id": "BBa_B0015",
                    "role": "Strong double terminator",
                },
            ],
            "predicted_behavior": _predicted_behavior(sensor, reporter, topology, problem["condition"]),
            "constraints_satisfied": [
                f"Input condition: {problem['condition']}",
                f"Host support includes {problem['host']}",
                f"Output phenotype maps to {reporter.output_label}",
            ],
            "assumptions": problem["assumptions"],
            "rationale": rationale,
            "bioscript_code": _design_bioscript(sensor, reporter, topology, problem["host"]),
            "references": references,
        })

    best = designs[0]
    if best["design_score"] >= 0.82:
        interpretation = "High-confidence inverse design proposal with a strong match between requested phenotype and characterised biological parts."
    elif best["design_score"] >= 0.68:
        interpretation = "Good inverse design proposal, but at least one requirement required an engineering assumption or host-specific compromise."
    else:
        interpretation = "Feasible conceptual design found, but the phenotype is underspecified and should be narrowed before wet-lab build selection."

    return {
        "model_version": MODEL_VERSION,
        "method": "constraint-satisfaction search over curated sensor/reporter/topology library",
        "phenotype_text": problem["phenotype_text"],
        "host": problem["host"],
        "condition": problem["condition"],
        "priorities": problem["priorities"],
        "best_design": best,
        "alternative_designs": designs[1:max_designs],
        "interpretation": interpretation,
        "search_space_size": len(candidates),
        "candidate_sensor_count": len(sensors),
        "candidate_topology_count": len(topologies),
    }