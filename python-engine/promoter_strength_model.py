from __future__ import annotations

import base64
import hashlib
import json
import math
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import numpy as np
import onnxruntime as ort
import torch
import torch.nn as nn


MODEL_VERSION = "anderson-cnn-v2"
SEQUENCE_LENGTH = 35
BASES = "ACGT"
BASE_TO_INDEX = {base: idx for idx, base in enumerate(BASES)}

MODULE_DIR = Path(__file__).resolve().parent
DATASET_PATH = MODULE_DIR / "data" / "anderson_promoter_library.json"
MODEL_DIR = MODULE_DIR / "models"
ONNX_PATH = MODEL_DIR / "promoter_strength_anderson.onnx"
METADATA_PATH = MODEL_DIR / "promoter_strength_anderson.metadata.json"

_session_cache: Optional[ort.InferenceSession] = None
_metadata_cache: Optional[Dict[str, Any]] = None


class PromoterCNN(nn.Module):
    def __init__(self) -> None:
        super().__init__()
        self.features = nn.Sequential(
            nn.Conv1d(4, 16, kernel_size=5, padding=2),
            nn.ReLU(),
            nn.Conv1d(16, 32, kernel_size=3, padding=1),
            nn.ReLU(),
            nn.AdaptiveAvgPool1d(1),
        )
        self.regressor = nn.Sequential(
            nn.Flatten(),
            nn.Linear(32, 16),
            nn.ReLU(),
            nn.Linear(16, 1),
            nn.Sigmoid(),
        )

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        return self.regressor(self.features(x))


def _seed_all(seed: int) -> None:
    np.random.seed(seed)
    torch.manual_seed(seed)


def load_dataset() -> Dict[str, Any]:
    with DATASET_PATH.open("r", encoding="utf-8") as fh:
        return json.load(fh)


def normalize_sequence(seq: str) -> str:
    clean = "".join(base for base in seq.upper() if base in BASE_TO_INDEX)
    if len(clean) >= SEQUENCE_LENGTH:
        return clean[-SEQUENCE_LENGTH:]
    return clean + ("N" * (SEQUENCE_LENGTH - len(clean)))


def one_hot_encode(seq: str) -> np.ndarray:
    encoded = np.zeros((4, SEQUENCE_LENGTH), dtype=np.float32)
    norm = normalize_sequence(seq)
    for pos, base in enumerate(norm):
        idx = BASE_TO_INDEX.get(base)
        if idx is not None:
            encoded[idx, pos] = 1.0
    return encoded


def _measured_entries() -> List[Dict[str, Any]]:
    entries = load_dataset()["entries"]
    return [entry for entry in entries if entry["strength_rpu"] is not None]


def _dataset_tensors(entries: List[Dict[str, Any]]) -> Tuple[torch.Tensor, torch.Tensor]:
    x = np.stack([one_hot_encode(entry["sequence"]) for entry in entries], axis=0)
    y = np.array([[float(entry["strength_rpu"])] for entry in entries], dtype=np.float32)
    return torch.from_numpy(x), torch.from_numpy(y)


def _train_model(entries: List[Dict[str, Any]], seed: int, epochs: int) -> PromoterCNN:
    _seed_all(seed)
    model = PromoterCNN()
    optimizer = torch.optim.Adam(model.parameters(), lr=0.01, weight_decay=1e-4)
    loss_fn = nn.MSELoss()
    x_tensor, y_tensor = _dataset_tensors(entries)

    model.train()
    for _ in range(epochs):
        optimizer.zero_grad(set_to_none=True)
        pred = model(x_tensor)
        loss = loss_fn(pred, y_tensor)
        loss.backward()
        optimizer.step()

    return model.eval()


def _evaluate_predictions(y_true: np.ndarray, y_pred: np.ndarray) -> Dict[str, float]:
    y_true = y_true.reshape(-1)
    y_pred = y_pred.reshape(-1)
    rmse = float(np.sqrt(np.mean((y_true - y_pred) ** 2)))
    mae = float(np.mean(np.abs(y_true - y_pred)))
    if len(y_true) > 1 and np.std(y_true) > 1e-8 and np.std(y_pred) > 1e-8:
        pearson = float(np.corrcoef(y_true, y_pred)[0, 1])
    else:
        pearson = 0.0
    return {
        "rmse": round(rmse, 4),
        "mae": round(mae, 4),
        "pearson_r": round(pearson, 4),
    }


def _crossval_metrics(entries: List[Dict[str, Any]]) -> Dict[str, float]:
    if len(entries) < 4:
        return {"rmse": 0.0, "mae": 0.0, "pearson_r": 0.0}

    y_true: List[float] = []
    y_pred: List[float] = []
    for holdout_idx, holdout in enumerate(entries):
        train_entries = [entry for idx, entry in enumerate(entries) if idx != holdout_idx]
        model = _train_model(train_entries, seed=42 + holdout_idx, epochs=500)
        encoded = torch.from_numpy(one_hot_encode(holdout["sequence"])).unsqueeze(0)
        with torch.no_grad():
            prediction = float(model(encoded).item())
        y_true.append(float(holdout["strength_rpu"]))
        y_pred.append(prediction)
    return _evaluate_predictions(np.array(y_true), np.array(y_pred))


def _training_metrics(model: PromoterCNN, entries: List[Dict[str, Any]]) -> Dict[str, float]:
    x_tensor, y_tensor = _dataset_tensors(entries)
    with torch.no_grad():
        pred = model(x_tensor).numpy()
    metrics = _evaluate_predictions(y_tensor.numpy(), pred)
    metrics["sample_count"] = len(entries)
    return metrics


def _build_metadata(dataset: Dict[str, Any], metrics: Dict[str, float], crossval: Dict[str, float]) -> Dict[str, Any]:
    measured = [entry for entry in dataset["entries"] if entry["strength_rpu"] is not None]
    reference_only = [entry for entry in dataset["entries"] if entry["strength_rpu"] is None]
    return {
        "model_version": MODEL_VERSION,
        "dataset_name": dataset["dataset_name"],
        "source": dataset["source"],
        "reference": dataset["reference"],
        "sequence_length": SEQUENCE_LENGTH,
        "measured_entry_count": len(measured),
        "reference_only_count": len(reference_only),
        "train_metrics": metrics,
        "crossval_metrics": crossval,
        "entries": dataset["entries"],
    }


def ensure_artifacts() -> Dict[str, Any]:
    global _metadata_cache

    if METADATA_PATH.exists() and ONNX_PATH.exists():
        metadata = json.loads(METADATA_PATH.read_text(encoding="utf-8"))
        if metadata.get("model_version") == MODEL_VERSION:
            _metadata_cache = metadata
            return metadata

    dataset = load_dataset()
    entries = [entry for entry in dataset["entries"] if entry["strength_rpu"] is not None]
    model = _train_model(entries, seed=42, epochs=1200)
    train_metrics = _training_metrics(model, entries)
    crossval_metrics = _crossval_metrics(entries)

    MODEL_DIR.mkdir(parents=True, exist_ok=True)
    dummy = torch.zeros((1, 4, SEQUENCE_LENGTH), dtype=torch.float32)
    torch.onnx.export(
        model,
        dummy,
        str(ONNX_PATH),
        input_names=["input"],
        output_names=["predicted_strength"],
        opset_version=18,
    )

    metadata = _build_metadata(dataset, train_metrics, crossval_metrics)
    metadata["onnx_sha256"] = hashlib.sha256(ONNX_PATH.read_bytes()).hexdigest()
    METADATA_PATH.write_text(json.dumps(metadata, indent=2), encoding="utf-8")
    _metadata_cache = metadata
    return metadata


def load_metadata() -> Dict[str, Any]:
    global _metadata_cache
    if _metadata_cache is None:
        _metadata_cache = ensure_artifacts()
    return _metadata_cache


def load_model_base64() -> str:
    ensure_artifacts()
    return base64.b64encode(ONNX_PATH.read_bytes()).decode("ascii")


def _load_session() -> ort.InferenceSession:
    global _session_cache
    if _session_cache is None:
        ensure_artifacts()
        _session_cache = ort.InferenceSession(str(ONNX_PATH), providers=["CPUExecutionProvider"])
    return _session_cache


def _nearest_promoters(sequence: str, top_k: int = 3) -> List[Dict[str, Any]]:
    dataset = load_metadata()["entries"]
    norm = normalize_sequence(sequence)
    ranked = []
    for entry in dataset:
        other = normalize_sequence(entry["sequence"])
        dist = sum(1 for a, b in zip(norm, other) if a != b)
        ranked.append({
            "part_id": entry["part_id"],
            "strength_rpu": entry["strength_rpu"],
            "hamming_distance": dist,
            "sequence": entry["sequence"],
        })
    ranked.sort(key=lambda item: (item["hamming_distance"], 999 if item["strength_rpu"] is None else 0, item["part_id"]))
    return ranked[:top_k]


def predict_strength(sequence: str) -> Dict[str, Any]:
    metadata = load_metadata()
    norm = normalize_sequence(sequence)
    nearest = _nearest_promoters(norm)
    exact = next((item for item in nearest if item["hamming_distance"] == 0 and item["strength_rpu"] is not None), None)

    if exact is not None:
        predicted = float(exact["strength_rpu"])
        confidence = 0.99
        source = "exact-measurement"
    else:
        session = _load_session()
        input_name = session.get_inputs()[0].name
        output_name = session.get_outputs()[0].name
        x = one_hot_encode(norm)[None, :, :].astype(np.float32)
        predicted = float(session.run([output_name], {input_name: x})[0].reshape(-1)[0])
        min_distance = nearest[0]["hamming_distance"] if nearest else SEQUENCE_LENGTH
        rmse = float(metadata["crossval_metrics"].get("rmse", 0.2))
        confidence = max(0.2, min(0.95, 1.0 - (min_distance / SEQUENCE_LENGTH) * 0.7 - rmse * 0.8))
        source = "onnx-cnn"

    return {
        "predicted_strength": max(0.0, min(1.0, predicted)),
        "confidence": round(float(confidence), 4),
        "normalized_sequence": norm,
        "nearest_promoters": nearest,
        "exact_match": exact,
        "model_source": source,
        "metadata": metadata,
    }