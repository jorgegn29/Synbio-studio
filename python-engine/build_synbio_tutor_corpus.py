from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any, Dict, Iterable, List, Tuple

from synbio_tutor_curated_library import build_curated_entries


MODULE_DIR = Path(__file__).resolve().parent
ROOT_DIR = MODULE_DIR.parent
DATASET_PATH = MODULE_DIR / "data" / "synbio_tutor_dataset.json"

ROOT_DOCS = [
    ROOT_DIR / "README.md",
    ROOT_DIR / "TECHNICAL_README.md",
    ROOT_DIR / "README-GITHUB.md",
]
CLIENT_DOCS_DIR = ROOT_DIR / "client" / "docs"
CLIENT_SRC_DIR = ROOT_DIR / "client" / "src"
STUDIO_PANELS_DIR = ROOT_DIR / "synbio-studio" / "src" / "panels"
PYTHON_ENGINE_DIR = ROOT_DIR / "python-engine"


TOPIC_KEYWORDS: List[Tuple[str, List[str]]] = [
    ("studio_biosafety", ["biosafety", "biosecurity", "bsl", "audit", "moat", "safety"]),
    ("studio_simulation", ["gillespie", "simulation", "stochastic", "ode", "growth", "digital-twin", "multiscale", "sim-"] ),
    ("backend_ml_models", ["crispr", "promoter", "codon", "esmfold", "protein", "rna", "alphafold", "ml", "predictor"]),
    ("vscode_editor_intelligence", ["completion", "hover", "diagnostics", "symbols", "codelens", "intellisense", "outline", "minimap", "diff"]),
    ("cross_compile_pipeline", ["compiler", "compile", "export", "sbol", "sbml", "fasta", "build"]),
    ("studio_navigation", ["explorer", "workspace", "project", "dashboard", "tutorial", "workflow", "terminal"]),
    ("vscode_productivity", ["snippet", "bookmark", "multicursor", "layout", "cache"]),
    ("cross_architecture", ["app", "engine", "integration", "marketplace", "collaborative", "git", "studio"]),
    ("backend_python_engine", ["python", "fba", "blast", "api"]),
]


ENTRY_BLUEPRINTS: List[Tuple[str, str, str]] = [
    ("overview", "What does {entity} do in SynBio Studio?", "{entity} is a {kind_phrase} in SynBio Studio. {summary} It belongs to the {area} surface of the product and should be understood as part of the local toolchain rather than as a generic external service."),
    ("usage", "When should I use {entity}?", "Use {entity} when you need {usage_phrase}. {summary} In practice this is relevant when the user is already inside {area} workflows and needs a focused tool rather than a broad tutorial."),
    ("integration", "How does {entity} fit into the SynBio Studio architecture?", "{entity} lives at {relative_path}. That placement means it participates in the {area} layer of SynBio Studio. {summary} It should be read as one piece of the Studio shell that coordinates UI panels, scientific engines, and backend calls."),
    ("troubleshooting", "If {entity} is not behaving as expected, what should I check first?", "When {entity} is not behaving as expected, first verify that the relevant UI flow, backend dependency, and data inputs are present. {summary} Because it sits in {relative_path}, failures may come from missing panel state, menu routing, or backend availability rather than from a single algorithmic bug."),
    ("difference", "How is {entity} different from other SynBio Studio tools?", "{entity} should be distinguished by its role in {area}. {summary} The safest mental model is that it addresses one constrained surface of the Studio rather than replacing the entire workflow stack."),
    ("inputs", "What kind of inputs or context does {entity} usually work with?", "{entity} typically works with the state and data available to the {area} layer. {summary} Users should expect it to consume current editor context, panel state, or backend responses depending on the workflow."),
    ("outputs", "What does {entity} usually produce for the user?", "{entity} usually produces a focused output inside SynBio Studio, such as a panel result, visualisation, derived analysis, or workflow action. {summary} It is designed to feed the broader Studio experience rather than act as an isolated script."),
    ("location", "Where is {entity} implemented in the project?", "{entity} is implemented at {relative_path}. {summary} That file location matters because it shows whether the capability belongs to SynBio Studio panels, the VS Code extension, documentation, or the Python engine."),
    ("beginner", "I am new to SynBio Studio. Why should I care about {entity}?", "A beginner should care about {entity} because it exposes one concrete capability of SynBio Studio without requiring them to understand the whole codebase first. {summary} It is one of the building blocks that makes the Studio feel like a domain-specific IDE rather than a plain editor."),
    ("expert", "From an expert perspective, what is the role of {entity}?", "From an expert perspective, {entity} is important because it formalises one slice of the SynBio Studio workflow inside a named module or panel. {summary} That makes the system easier to navigate, reason about, and extend."),
    ("workflow", "How does {entity} contribute to the user workflow in SynBio Studio?", "{entity} contributes to the workflow by handling part of the {area} experience. {summary} In the Studio this matters because different panels and engines cooperate rather than living as one monolithic module."),
    ("comparison", "Is {entity} more about UI, scientific analysis, or infrastructure?", "{entity} is best understood as a {kind_phrase}. {summary} That means it leans on {area} concerns, even when it also touches adjacent layers like backend APIs or navigation."),
    ("value", "Why does the project include {entity} instead of a simpler generic tool?", "The project includes {entity} because SynBio Studio is trying to be a domain IDE with explicit modules for specialist tasks. {summary} A simpler generic tool would hide domain assumptions that the Studio wants to make explicit."),
    ("maintenance", "If I want to maintain or extend {entity}, what should I understand first?", "To maintain or extend {entity}, start by understanding its file location, how it is invoked, and which user workflow it supports. {summary} The first engineering question is usually not the algorithm alone but how the panel or module plugs into the rest of the Studio shell."),
    ("routing", "How would the tutor explain {entity} to someone who is lost inside SynBio Studio?", "The tutor should explain {entity} as a concrete part of the {area} surface in SynBio Studio. {summary} It is useful to describe what it is for, when to open it, and how it relates to neighbouring panels or backend endpoints."),
    ("architecture-deep", "What architectural lesson does {entity} reveal about SynBio Studio?", "{entity} reveals that SynBio Studio is organised as a set of named engines and panels rather than a flat UI. {summary} This makes the product easier to scale, and it is exactly the kind of structure an internal tutor should be able to explain."),
    ("purpose", "What problem is {entity} trying to solve inside the product?", "Inside the product, {entity} is trying to solve a specific problem within {area}. {summary} Its existence signals that this problem is important enough to deserve a dedicated module or panel instead of being buried inside a generic menu."),
    ("trust", "How should I trust or interpret what {entity} gives me?", "You should trust {entity} according to the kind of role it plays: UI modules help navigation, scientific engines provide specialised analysis, and backend adapters expose local computation. {summary} The tutor should always explain the output in terms of scope and intended use rather than pretending every module is authoritative on everything."),
]


def humanize_slug(value: str) -> str:
    tokens = re.split(r"[-_\s]+", value)
    return " ".join(token.capitalize() if token.islower() else token for token in tokens if token)


def summarize_file(path: Path) -> str:
    try:
        lines = path.read_text(encoding="utf-8", errors="ignore").splitlines()
    except Exception:
        return "This source exists in the repository and contributes to a named capability in the product."

    meaningful: List[str] = []
    for raw in lines[:40]:
        text = raw.strip().strip("/*#- ")
        if not text:
            continue
        if text.startswith(("import ", "from ", "const ", "let ", "var ", "export ", "window.")):
            continue
        if len(text) < 8:
            continue
        meaningful.append(text)
        if len(meaningful) >= 2:
            break

    if meaningful:
        return " ".join(meaningful)

    return "The filename and location show that this source is a concrete part of the SynBio toolchain."


def detect_topic(stem: str, relative_path: str) -> str:
    haystack = f"{stem} {relative_path}".lower()
    is_studio = "synbio-studio/src/panels" in relative_path.lower()
    is_vscode = "client/src" in relative_path.lower()
    is_backend = "python-engine" in relative_path.lower()

    for topic, keywords in TOPIC_KEYWORDS:
        if any(keyword in haystack for keyword in keywords):
            if topic.startswith("studio_") and is_vscode:
                return topic.replace("studio_", "vscode_") if topic.replace("studio_", "vscode_") != "vscode_simulation" else "vscode_editor_intelligence"
            if topic.startswith("vscode_") and is_studio:
                return topic.replace("vscode_", "studio_") if topic.replace("vscode_", "studio_") != "studio_productivity" else "studio_navigation"
            if topic.startswith("backend_") and not is_backend and is_studio:
                return "studio_python_api"
            return topic

    if is_studio:
        return "studio_navigation"
    if is_vscode:
        return "vscode_editor_intelligence"
    if is_backend:
        return "backend_python_engine"
    return "cross_architecture"


def area_from_path(relative_path: str) -> str:
    lowered = relative_path.lower()
    if "synbio-studio/src/panels" in lowered:
        return "SynBio Studio panel"
    if "client/src" in lowered:
        return "VS Code extension"
    if "client/docs" in lowered or lowered.endswith("readme.md"):
        return "documentation"
    if "python-engine" in lowered:
        return "Python engine"
    return "project"


def kind_phrase_for(path: Path, relative_path: str) -> str:
    lowered = relative_path.lower()
    if lowered.endswith(".md"):
        return "documentation source"
    if "src/panels" in lowered:
        return "panel engine"
    if path.suffix == ".ts":
        return "TypeScript module"
    if path.suffix == ".py":
        return "Python module"
    return "source module"


def usage_phrase_for(entity: str, topic: str, area: str) -> str:
    usage_map = {
        "studio_biosafety": "biosecurity review, compliance checks, or safety interpretation inside SynBio Studio",
        "studio_simulation": "simulation, trajectory interpretation, or model execution inside SynBio Studio",
        "backend_ml_models": "prediction, model-assisted ranking, or interpreting ML endpoints",
        "vscode_editor_intelligence": "editor assistance such as diagnostics, completion, or structure awareness inside the extension",
        "cross_compile_pipeline": "compilation, export, or transformation of biological code",
        "studio_navigation": "navigation, discovery, onboarding, or panel access inside SynBio Studio",
        "vscode_productivity": "editing faster with shortcuts, snippets, or focused UI helpers inside the extension",
        "backend_python_engine": "backend execution, local scientific APIs, or model serving",
        "cross_architecture": f"understanding how the {area} surface is organised",
        "studio_python_api": "calling scientific and AI endpoints from the Studio shell",
        "studio_design": "design, review, or visualisation tasks inside SynBio Studio",
        "studio_structure": "RNA or protein structure analysis inside SynBio Studio",
        "studio_workflows": "guided workflows and panel orchestration inside SynBio Studio",
        "studio_lab_automation": "lab automation, notebooking, or execution-linked tasks inside SynBio Studio",
        "studio_data": "data-rich scientific analysis surfaces in SynBio Studio",
        "vscode_ai_assistance": "local design help and predictive assistance inside the extension",
        "vscode_navigation": "discovering and opening extension capabilities in VS Code",
        "vscode_editor": "working from the VS Code editor with domain-specific analysis",
        "vscode_biosafety": "running biosecurity checks from the VS Code extension",
    }
    return usage_map.get(topic, f"understanding or using {entity}")


def build_variations(entity: str, blueprint_name: str, relative_path: str, topic: str) -> List[str]:
    stem_text = humanize_slug(Path(relative_path).stem)
    return [
        f"{entity} synbio studio",
        f"{entity} {blueprint_name}",
        f"{stem_text} in synbio studio",
        f"{topic} {entity}",
        f"how does {entity.lower()} work",
    ]


def make_entry(entry_id: str, question: str, answer: str, topic: str, intent: str, relative_path: str, variations: List[str]) -> Dict[str, Any]:
    return {
        "id": entry_id,
        "intent": intent,
        "topic": topic,
        "audience": "all" if intent in {"architecture", "routing"} else "intermediate",
        "question": question,
        "answer": answer,
        "tags": [topic, intent, "synbio studio", Path(relative_path).stem],
        "variations": variations,
        "sources": [{
            "path": relative_path.replace('\\', '/'),
            "line_start": 1,
            "line_end": 40,
        }],
    }


def build_generated_entries_for_file(path: Path) -> List[Dict[str, Any]]:
    relative_path = path.relative_to(ROOT_DIR).as_posix()
    stem = path.stem.replace(".", "-")
    entity = humanize_slug(stem)
    topic = detect_topic(stem, relative_path)
    summary = summarize_file(path)
    area = area_from_path(relative_path)
    kind_phrase = kind_phrase_for(path, relative_path)
    usage_phrase = usage_phrase_for(entity, topic, area)

    entries: List[Dict[str, Any]] = []
    for blueprint_name, question_template, answer_template in ENTRY_BLUEPRINTS:
        question = question_template.format(entity=entity)
        answer = answer_template.format(
            entity=entity,
            kind_phrase=kind_phrase,
            summary=summary,
            area=area,
            relative_path=relative_path,
            usage_phrase=usage_phrase,
        )
        entry_id = f"generated-{stem}-{blueprint_name}"
        entries.append(
            make_entry(
                entry_id=entry_id,
                question=question,
                answer=answer,
                topic=topic,
                intent=blueprint_name,
                relative_path=relative_path,
                variations=build_variations(entity, blueprint_name, relative_path, topic),
            )
        )
    return entries


def iter_sources() -> Iterable[Path]:
    for path in ROOT_DOCS:
        if path.exists():
            yield path
    if CLIENT_DOCS_DIR.exists():
        yield from sorted(CLIENT_DOCS_DIR.glob("*.md"))
    if CLIENT_SRC_DIR.exists():
        yield from sorted(CLIENT_SRC_DIR.glob("*.ts"))
    if STUDIO_PANELS_DIR.exists():
        yield from sorted(STUDIO_PANELS_DIR.glob("*.js"))
    if PYTHON_ENGINE_DIR.exists():
        yield from sorted(PYTHON_ENGINE_DIR.glob("*.py"))


def load_seed_entries() -> List[Dict[str, Any]]:
    if not DATASET_PATH.exists():
        return []
    with DATASET_PATH.open("r", encoding="utf-8") as fh:
        payload = json.load(fh)

    seed_entries: List[Dict[str, Any]] = []
    for entry in payload.get("entries", []):
        if str(entry.get("id", "")).startswith("generated-"):
            continue
        normalized = dict(entry)
        sources = normalized.get("sources", [])
        source_path = str(sources[0].get("path", "")) if sources else ""
        if source_path.startswith("synbio-studio/"):
            prefix = "studio"
        elif source_path.startswith("client/src/") or source_path.startswith("client/docs/"):
            prefix = "vscode"
        elif source_path.startswith("python-engine/"):
            prefix = "backend"
        else:
            prefix = "cross"

        legacy_topic = str(normalized.get("topic", "cross_architecture"))
        legacy_map = {
            "getting_started": f"{prefix}_navigation" if prefix in {"studio", "vscode"} else "cross_architecture",
            "bioscript_basics": "vscode_editor_intelligence",
            "bioscript_language": "vscode_editor_intelligence",
            "compile_pipeline": "cross_compile_pipeline",
            "simulation": "studio_simulation" if prefix == "studio" else "cross_architecture",
            "biosafety": "studio_biosafety" if prefix == "studio" else "vscode_biosafety",
            "architecture": "cross_architecture",
            "design_assistant": "vscode_ai_assistance",
            "python_engine": "backend_python_engine",
            "ml_models": "backend_ml_models",
            "navigation": f"{prefix}_navigation" if prefix in {"studio", "vscode"} else "cross_architecture",
            "productivity": "vscode_productivity",
            "lsp_server": "vscode_editor_intelligence",
            "ai_strategy": "cross_architecture",
        }
        normalized["topic"] = legacy_map.get(legacy_topic, "cross_architecture")
        seed_entries.append(normalized)

    return seed_entries


def build_dataset() -> Dict[str, Any]:
    seed_entries = load_seed_entries()
    curated_entries = build_curated_entries()
    generated_entries: List[Dict[str, Any]] = []
    for path in iter_sources():
        generated_entries.extend(build_generated_entries_for_file(path))

    entries = seed_entries + curated_entries + generated_entries
    dataset = {
        "dataset_name": "SynBio Tutor Knowledge Base",
        "version": "0.3.0",
        "description": "Large tutor corpus grounded in SynBio-LLVM and SynBio Studio, mixing legacy seed entries, manually curated module explanations, real-user-style questions, and generated coverage from project sources.",
        "entry_generation": {
            "seed_entries": len(seed_entries),
            "curated_entries": len(curated_entries),
            "generated_entries": len(generated_entries),
            "source_file_count": len(list(iter_sources())),
        },
        "entries": entries,
    }
    return dataset


def main() -> None:
    dataset = build_dataset()
    DATASET_PATH.parent.mkdir(parents=True, exist_ok=True)
    with DATASET_PATH.open("w", encoding="utf-8") as fh:
        json.dump(dataset, fh, indent=2, ensure_ascii=False)
    print(json.dumps({
        "dataset_name": dataset["dataset_name"],
        "version": dataset["version"],
        "entry_generation": dataset["entry_generation"],
        "entry_count": len(dataset["entries"]),
    }, ensure_ascii=False))


if __name__ == "__main__":
    main()