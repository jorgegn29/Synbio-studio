from __future__ import annotations

import json
import math
import re
import unicodedata
from dataclasses import dataclass
from datetime import datetime, timezone
from difflib import SequenceMatcher
from pathlib import Path
from typing import Any, Dict, List, Optional, Sequence, Tuple

import numpy as np

try:
    import tensorflow as tf
except Exception:
    tf = None


MODULE_DIR = Path(__file__).resolve().parent
DATASET_PATH = MODULE_DIR / "data" / "synbio_tutor_dataset.json"
MODEL_DIR = MODULE_DIR / "models" / "synbio_tutor"
MODEL_PATH = MODEL_DIR / "topic_classifier.keras"
METADATA_PATH = MODEL_DIR / "topic_classifier.metadata.json"

HAS_TENSORFLOW = tf is not None
_MODEL: Optional[Any] = None
_METADATA: Optional[Dict[str, Any]] = None

SEMANTIC_ALIASES: Dict[str, List[str]] = {
    "bioseguridad": ["biosafety", "biosecurity", "compliance", "bsl"],
    "biosafety": ["bioseguridad", "biosecurity", "compliance"],
    "biosecurity": ["bioseguridad", "biosafety", "compliance"],
    "seguridad": ["safety", "compliance"],
    "simulacion": ["simulation", "ode", "ssa"],
    "simulation": ["simulacion", "ode", "ssa"],
    "estructura": ["structure", "folding"],
    "promotores": ["promoter", "promoters"],
    "promotor": ["promoter", "promoters"],
    "crispr": ["offtarget", "guide", "editing"],
    "ia": ["ai", "tutor"],
    "tutor": ["ai", "assistant"],
    "extension": ["vscode", "editor"],
    "editor": ["vscode", "extension"],
    "barra": ["sidebar", "explorer"],
    "lateral": ["sidebar", "explorer"],
    "backend": ["python", "api", "fastapi", "server"],
    "endpoint": ["api", "backend", "server"],
    "api": ["endpoint", "backend", "fastapi"],
}

TOPIC_HINTS: Dict[str, List[str]] = {
    "studio_python_api": ["synbio studio", "python api", "promoter", "promotores", "codon", "crispr", "inverse design", "tutor ai", "panel"],
    "studio_biosafety": ["synbio studio", "bioseguridad", "biosafety", "biosecurity", "bsl", "compliance", "kill switch", "riesgo"],
    "studio_simulation": ["synbio studio", "simulacion", "simulation", "ode", "ssa", "trajectory"],
    "studio_navigation": ["synbio studio", "tutorial", "tutorials", "workflow", "workspace", "project", "dashboard"],
    "studio_design": ["synbio studio", "sbol", "plasmid", "design review", "visual", "circuito visual"],
    "studio_structure": ["synbio studio", "rna", "protein", "proteina", "estructura", "folding"],
    "studio_lab_automation": ["synbio studio", "opentrons", "lab notebook", "automatizacion", "automation"],
    "studio_data": ["synbio studio", "fba", "blast", "ngs", "metabol"],
    "vscode_ai_assistance": ["vs code", "vscode", "extension", "design assistant", "failure predictor", "corregir circuitos"],
    "vscode_navigation": ["vs code", "vscode", "extension", "explorer", "sidebar", "barra lateral"],
    "vscode_editor": ["vs code", "vscode", "editor", "sequence", "secuencia"],
    "vscode_editor_intelligence": ["vs code", "vscode", "completion", "hover", "diagnostics", "symbols", "codelens"],
    "vscode_biosafety": ["vs code", "vscode", "extension", "bioseguridad", "biosafety", "scanner"],
    "vscode_productivity": ["vs code", "vscode", "snippet", "cache", "bookmark", "productivity"],
    "backend_python_engine": ["backend", "python engine", "server", "endpoint", "api", "fastapi", "localhost", "127.0.0.1", "8765"],
    "backend_ml_models": ["backend", "model", "ml", "tensorflow", "keras", "promoter", "crispr", "codon", "esmfold"],
    "cross_compile_pipeline": ["compile", "compiler", "compilar", "export", "sbol", "sbml", "fasta"],
    "cross_architecture": ["architecture", "arquitectura", "integration", "integracion", "shell", "electron"],
}

SURFACE_HINTS: Dict[str, List[str]] = {
    "studio": ["synbio studio", "studio", "panel", "pestana", "pestaña", "shell"],
    "vscode": ["vs code", "vscode", "extension", "editor", "sidebar", "barra lateral"],
    "backend": ["backend", "server", "endpoint", "api", "fastapi", "localhost", "127.0.0.1", "python engine"],
}


@dataclass
class RankedEntry:
    entry: Dict[str, Any]
    score: float


def load_dataset() -> Dict[str, Any]:
    with DATASET_PATH.open("r", encoding="utf-8") as fh:
        return json.load(fh)


def _normalize_text(text: str) -> str:
    normalized = unicodedata.normalize("NFKD", text or "")
    ascii_text = "".join(ch for ch in normalized if not unicodedata.combining(ch))
    return ascii_text.lower().strip()


def _tokenize(text: str) -> List[str]:
    normalized_text = _normalize_text(text)
    tokens = re.findall(r"[a-z0-9_]+", normalized_text)
    expanded = list(tokens)
    for token in tokens:
        expanded.extend(SEMANTIC_ALIASES.get(token, []))
    for phrase, aliases in SEMANTIC_ALIASES.items():
        if " " in phrase and phrase in normalized_text:
            expanded.extend(aliases)
    return expanded


def _entry_search_text(entry: Dict[str, Any]) -> str:
    parts = [entry.get("question", ""), entry.get("answer", "")]
    parts.extend(entry.get("tags", []))
    parts.extend(entry.get("variations", []))
    parts.append(str(entry.get("topic", "")).replace("_", " "))
    parts.append(str(entry.get("intent", "")).replace("_", " "))
    return " ".join(parts)


def _score_overlap(query_tokens: Sequence[str], candidate_tokens: Sequence[str]) -> Tuple[float, float]:
    query_set = set(query_tokens)
    candidate_set = set(candidate_tokens)
    if not query_set or not candidate_set:
        return 0.0, 0.0
    overlap = len(query_set & candidate_set) / len(query_set | candidate_set)
    containment = len(query_set & candidate_set) / len(query_set)
    return overlap, containment


def _build_training_examples(dataset: Dict[str, Any]) -> Tuple[List[str], List[int], List[str]]:
    entries = dataset["entries"]
    class_names = sorted({entry["topic"] for entry in entries})
    class_to_index = {name: idx for idx, name in enumerate(class_names)}
    texts: List[str] = []
    labels: List[int] = []

    for entry in entries:
        training_texts = [entry["question"], *entry.get("variations", [])]
        suffix = " ".join(entry.get("tags", []))
        for item in training_texts:
            texts.append(f"{item} {suffix} {entry['topic'].replace('_', ' ')}")
            labels.append(class_to_index[entry["topic"]])

    return texts, labels, class_names


def _surface_bonus(topic: str, question_normalized: str) -> float:
    bonus = 0.0
    if any(hint in question_normalized for hint in SURFACE_HINTS["studio"]):
        bonus += 0.18 if topic.startswith("studio_") else -0.06
    if any(hint in question_normalized for hint in SURFACE_HINTS["vscode"]):
        bonus += 0.18 if topic.startswith("vscode_") else -0.06
    if any(hint in question_normalized for hint in SURFACE_HINTS["backend"]):
        bonus += 0.18 if topic.startswith("backend_") else -0.04
    return bonus


def _heuristic_topic_scores(question: str, class_names: Sequence[str]) -> Dict[str, float]:
    normalized_question = _normalize_text(question)
    scores: Dict[str, float] = {name: 0.0 for name in class_names}

    for topic, hints in TOPIC_HINTS.items():
        if topic not in scores:
            continue
        match_count = sum(1 for hint in hints if hint in normalized_question)
        if match_count:
            scores[topic] += min(0.75, 0.16 * match_count)
        scores[topic] += _surface_bonus(topic, normalized_question)

    if "bioseguridad" in normalized_question or "biosafety" in normalized_question or "biosecurity" in normalized_question:
        if any(hint in normalized_question for hint in SURFACE_HINTS["vscode"]):
            scores["vscode_biosafety"] = max(scores.get("vscode_biosafety", 0.0), 0.82)
        else:
            scores["studio_biosafety"] = max(scores.get("studio_biosafety", 0.0), 0.82)

    if "python engine" in normalized_question or ("endpoint" in normalized_question and "studio" in normalized_question):
        scores["backend_python_engine"] = max(scores.get("backend_python_engine", 0.0), 0.7)
        scores["studio_python_api"] = max(scores.get("studio_python_api", 0.0), 0.74)

    return {name: max(0.0, min(score, 0.99)) for name, score in scores.items()}


def _has_surface_context(question: str) -> bool:
    normalized_question = _normalize_text(question)
    return any(
        hint in normalized_question
        for hints in SURFACE_HINTS.values()
        for hint in hints
    )


def _fallback_metadata(dataset: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "mode": "retrieval-only",
        "tensorflow_available": False,
        "dataset_name": dataset["dataset_name"],
        "entry_count": len(dataset["entries"]),
        "topic_count": len({entry["topic"] for entry in dataset["entries"]}),
        "trained_examples": sum(1 + len(entry.get("variations", [])) for entry in dataset["entries"]),
        "class_names": sorted({entry["topic"] for entry in dataset["entries"]}),
        "model_version": "heuristic-retrieval",
    }


def _choose_model_config(entry_count: int, text_count: int, topic_count: int) -> Dict[str, Any]:
    if entry_count >= 3000:
        return {
            "max_tokens": 24000,
            "sequence_length": 72,
            "embedding_dim": 64,
            "hidden_units": 128,
            "batch_size": 32,
            "epochs": 28,
            "learning_rate": 0.003,
        }
    if entry_count >= 1000:
        return {
            "max_tokens": 16000,
            "sequence_length": 64,
            "embedding_dim": 48,
            "hidden_units": 96,
            "batch_size": 24,
            "epochs": 36,
            "learning_rate": 0.004,
        }
    if entry_count >= 250:
        return {
            "max_tokens": 8000,
            "sequence_length": 56,
            "embedding_dim": 40,
            "hidden_units": 80,
            "batch_size": 16,
            "epochs": 50,
            "learning_rate": 0.006,
        }
    return {
        "max_tokens": 4000,
        "sequence_length": 48,
        "embedding_dim": 32,
        "hidden_units": 64,
        "batch_size": 8,
        "epochs": 90,
        "learning_rate": 0.01,
    }


def train_topic_model(force: bool = False) -> Dict[str, Any]:
    global _MODEL, _METADATA

    dataset = load_dataset()
    if not HAS_TENSORFLOW:
        _MODEL = None
        _METADATA = _fallback_metadata(dataset)
        return _METADATA

    if not force and MODEL_PATH.exists() and METADATA_PATH.exists():
        _MODEL = tf.keras.models.load_model(MODEL_PATH)
        with METADATA_PATH.open("r", encoding="utf-8") as fh:
            _METADATA = json.load(fh)
        return _METADATA

    MODEL_DIR.mkdir(parents=True, exist_ok=True)
    texts, labels, class_names = _build_training_examples(dataset)
    model_config = _choose_model_config(len(dataset["entries"]), len(texts), len(class_names))

    tf.keras.utils.set_random_seed(42)
    vectorizer = tf.keras.layers.TextVectorization(
        max_tokens=model_config["max_tokens"],
        output_mode="int",
        output_sequence_length=model_config["sequence_length"],
        standardize="lower_and_strip_punctuation",
    )
    vectorizer.adapt(tf.data.Dataset.from_tensor_slices(texts).batch(8))

    model = tf.keras.Sequential(
        [
            tf.keras.Input(shape=(1,), dtype=tf.string),
            vectorizer,
            tf.keras.layers.Embedding(model_config["max_tokens"], model_config["embedding_dim"]),
            tf.keras.layers.GlobalAveragePooling1D(),
            tf.keras.layers.Dense(model_config["hidden_units"], activation="relu"),
            tf.keras.layers.Dropout(0.15),
            tf.keras.layers.Dense(len(class_names), activation="softmax"),
        ],
        name="synbio_tutor_topic_classifier",
    )
    model.compile(
        optimizer=tf.keras.optimizers.Adam(learning_rate=model_config["learning_rate"]),
        loss="sparse_categorical_crossentropy",
        metrics=["accuracy"],
    )
    history = model.fit(
        np.array(texts, dtype=object),
        np.array(labels, dtype=np.int32),
        epochs=model_config["epochs"],
        verbose=0,
        batch_size=model_config["batch_size"],
    )

    final_accuracy = float(history.history["accuracy"][-1]) if history.history.get("accuracy") else 0.0
    model.save(MODEL_PATH)

    _MODEL = model
    _METADATA = {
        "mode": "keras-retrieval",
        "tensorflow_available": True,
        "tensorflow_version": tf.__version__,
        "dataset_name": dataset["dataset_name"],
        "entry_count": len(dataset["entries"]),
        "topic_count": len(class_names),
        "trained_examples": len(texts),
        "class_names": class_names,
        "train_accuracy": round(final_accuracy, 4),
        "trained_at": datetime.now(timezone.utc).isoformat(),
        "model_version": "synbio-tutor-topic-v1",
        "model_config": model_config,
    }
    with METADATA_PATH.open("w", encoding="utf-8") as fh:
        json.dump(_METADATA, fh, indent=2)

    return _METADATA


def ensure_tutor_model() -> Dict[str, Any]:
    global _MODEL, _METADATA

    if _METADATA is not None:
        return _METADATA

    dataset = load_dataset()
    if not HAS_TENSORFLOW:
        _METADATA = _fallback_metadata(dataset)
        return _METADATA

    if MODEL_PATH.exists() and METADATA_PATH.exists():
        _MODEL = tf.keras.models.load_model(MODEL_PATH)
        with METADATA_PATH.open("r", encoding="utf-8") as fh:
            _METADATA = json.load(fh)
        return _METADATA

    return train_topic_model(force=True)


def _predict_topic(question: str) -> Tuple[str, float, Dict[str, float]]:
    metadata = ensure_tutor_model()
    class_names = metadata.get("class_names", [])
    heuristic_scores = _heuristic_topic_scores(question, class_names)
    heuristic_top_topic = max(heuristic_scores, key=heuristic_scores.get) if heuristic_scores else "unknown"
    heuristic_top_score = heuristic_scores.get(heuristic_top_topic, 0.0)
    if not class_names:
        return "unknown", 0.0, {}

    if not HAS_TENSORFLOW or _MODEL is None:
        if not heuristic_scores:
            return "unknown", 0.0, {}
        return heuristic_top_topic, heuristic_top_score, heuristic_scores

    probabilities = _MODEL.predict(np.array([question], dtype=object), verbose=0)[0]
    blended_scores: Dict[str, float] = {}
    for idx, class_name in enumerate(class_names):
        model_score = float(probabilities[idx])
        heuristic_score = heuristic_scores.get(class_name, 0.0)
        blended_scores[class_name] = max(0.0, min((0.72 * model_score) + (0.28 * heuristic_score), 0.999))

    top_topic = max(blended_scores, key=blended_scores.get)
    top_score = float(blended_scores[top_topic])
    if _has_surface_context(question) and heuristic_top_score >= 0.6 and heuristic_top_topic != top_topic:
        top_topic = heuristic_top_topic
        top_score = heuristic_top_score

    score_map = {name: round(score, 4) for name, score in blended_scores.items()}
    if heuristic_top_topic in score_map:
        score_map[heuristic_top_topic] = round(max(score_map[heuristic_top_topic], heuristic_top_score), 4)
    return top_topic, top_score, score_map


def _rank_entries(question: str, audience: str, predicted_topic: str, topic_confidence: float) -> List[RankedEntry]:
    dataset = load_dataset()
    query_normalized = _normalize_text(question)
    query_tokens = _tokenize(question)
    heuristic_scores = _heuristic_topic_scores(question, {entry["topic"] for entry in dataset["entries"]})
    ranked: List[RankedEntry] = []

    for entry in dataset["entries"]:
        candidate_text = _entry_search_text(entry)
        candidate_tokens = _tokenize(candidate_text)
        overlap, containment = _score_overlap(query_tokens, candidate_tokens)
        fuzzy = SequenceMatcher(None, query_normalized, _normalize_text(entry.get("question", ""))).ratio()
        topic_bonus = 0.22 * topic_confidence if entry.get("topic") == predicted_topic else 0.0
        heuristic_topic_bonus = 0.26 * heuristic_scores.get(entry.get("topic", ""), 0.0)
        audience_bonus = 0.04 if audience in {entry.get("audience"), "all"} else 0.0
        tag_bonus = 0.0
        for tag in entry.get("tags", []):
            tag_text = _normalize_text(tag)
            if tag_text and tag_text in query_normalized:
                tag_bonus += 0.03

        surface_bonus = 0.0
        if any(hint in query_normalized for hint in SURFACE_HINTS["studio"]):
            surface_bonus += 0.08 if entry.get("topic", "").startswith("studio_") else -0.03
        if any(hint in query_normalized for hint in SURFACE_HINTS["vscode"]):
            surface_bonus += 0.08 if entry.get("topic", "").startswith("vscode_") else -0.03
        if any(hint in query_normalized for hint in SURFACE_HINTS["backend"]):
            surface_bonus += 0.08 if entry.get("topic", "").startswith("backend_") else -0.02

        score = (0.42 * overlap) + (0.28 * containment) + (0.18 * fuzzy) + topic_bonus + heuristic_topic_bonus + audience_bonus + min(tag_bonus, 0.12) + surface_bonus
        if any(word in _normalize_text(entry.get("answer", "")) for word in query_tokens[:4]):
            score += 0.03

        ranked.append(RankedEntry(entry=entry, score=min(score, 0.995)))

    ranked.sort(key=lambda item: item.score, reverse=True)
    return ranked


def answer_tutor_question(question: str, audience: str = "beginner", max_results: int = 3) -> Dict[str, Any]:
    clean_question = str(question or "").strip()
    if len(clean_question) < 4:
        raise ValueError("Question is too short for the SynBio tutor")

    metadata = ensure_tutor_model()
    predicted_topic, topic_confidence, topic_scores = _predict_topic(clean_question)
    ranked = _rank_entries(clean_question, audience, predicted_topic, topic_confidence)
    best = ranked[0]
    related = [
        {
            "question": item.entry["question"],
            "topic": item.entry["topic"],
            "score": round(item.score, 3),
        }
        for item in ranked[1:max_results + 1]
    ]

    return {
        "question": clean_question,
        "answer": best.entry["answer"],
        "confidence": round(best.score, 3),
        "matched_topic": best.entry["topic"],
        "matched_intent": best.entry["intent"],
        "mode": metadata["mode"],
        "sources": best.entry.get("sources", []),
        "related_questions": related,
        "model_info": {
            "dataset_name": metadata["dataset_name"],
            "tensorflow_available": metadata["tensorflow_available"],
            "model_version": metadata["model_version"],
            "model_config": metadata.get("model_config", {}),
            "predicted_topic": predicted_topic,
            "predicted_topic_confidence": round(topic_confidence, 3),
            "top_topic_scores": dict(sorted(topic_scores.items(), key=lambda item: item[1], reverse=True)[:3]),
            "entry_count": metadata["entry_count"],
            "topic_count": metadata["topic_count"],
        },
    }


if __name__ == "__main__":
    payload = train_topic_model(force=True)
    print(json.dumps(payload, indent=2))