from __future__ import annotations

import json
import math
import random
import urllib.request
from io import StringIO
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional, Sequence, Tuple

import numpy as np
import torch
import torch.nn as nn
from Bio import SeqIO


MODEL_VERSION = "crispr-offtarget-cnn-v1"
BASE_DIR = Path(__file__).resolve().parent
MODEL_DIR = BASE_DIR / "models" / "crispr_offtarget"
GENOME_CACHE_DIR = MODEL_DIR / "genomes"
WEIGHTS_PATH = MODEL_DIR / "offtarget_cnn.pt"
METADATA_PATH = MODEL_DIR / "offtarget_cnn.metadata.json"
MODEL_DIR.mkdir(parents=True, exist_ok=True)
GENOME_CACHE_DIR.mkdir(parents=True, exist_ok=True)

GUIDE_LENGTH = 20
MAX_PAM_LENGTH = 6
INPUT_LENGTH = GUIDE_LENGTH + MAX_PAM_LENGTH
BASES = "ACGT"
BASE_TO_INDEX = {base: idx for idx, base in enumerate(BASES)}

IUPAC: Dict[str, str] = {
    "A": "A",
    "C": "C",
    "G": "G",
    "T": "T",
    "U": "T",
    "R": "AG",
    "Y": "CT",
    "S": "GC",
    "W": "AT",
    "K": "GT",
    "M": "AC",
    "B": "CGT",
    "D": "AGT",
    "H": "ACT",
    "V": "ACG",
    "N": "ACGT",
}

ORGANISM_CATALOG: Dict[str, Dict[str, str]] = {
    "ecoli_mg1655": {
        "display_name": "E. coli K-12 MG1655",
        "accession": "NC_000913.3",
        "source": "NCBI RefSeq",
    },
    "ecoli_bl21": {
        "display_name": "E. coli BL21(DE3)",
        "accession": "CP001509.3",
        "source": "NCBI GenBank",
    },
    "bacillus_subtilis_168": {
        "display_name": "B. subtilis 168",
        "accession": "NC_000964.3",
        "source": "NCBI RefSeq",
    },
}

_MODEL_CACHE: Optional[nn.Module] = None
_METADATA_CACHE: Optional[Dict[str, Any]] = None
_GENOME_CACHE: Dict[str, str] = {}

_MIT_WEIGHTS = [
    0.0, 0.0, 0.014, 0.0, 0.0, 0.395, 0.317, 0.0, 0.389, 0.079,
    0.445, 0.508, 0.613, 0.851, 0.732, 0.828, 0.615, 0.804, 0.685, 0.583,
]


class OffTargetCNN(nn.Module):
    def __init__(self) -> None:
        super().__init__()
        self.features = nn.Sequential(
            nn.Conv1d(9, 32, kernel_size=5, padding=2),
            nn.ReLU(),
            nn.Conv1d(32, 64, kernel_size=3, padding=1),
            nn.ReLU(),
            nn.Conv1d(64, 64, kernel_size=3, padding=1),
            nn.ReLU(),
            nn.AdaptiveAvgPool1d(1),
        )
        self.classifier = nn.Sequential(
            nn.Flatten(),
            nn.Linear(64, 32),
            nn.ReLU(),
            nn.Linear(32, 1),
            nn.Sigmoid(),
        )

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        return self.classifier(self.features(x))


def _seed_all(seed: int) -> None:
    random.seed(seed)
    np.random.seed(seed)
    torch.manual_seed(seed)


def _normalize_dna(seq: str) -> str:
    return "".join(base for base in str(seq).upper().replace("U", "T") if base in "ACGT")


def _reverse_complement(seq: str) -> str:
    return _normalize_dna(seq).translate(str.maketrans("ACGT", "TGCA"))[::-1]


def _matches_iupac(seq: str, pattern: str) -> bool:
    if len(seq) != len(pattern):
        return False
    for base, token in zip(seq.upper(), pattern.upper()):
        if base not in IUPAC.get(token, token):
            return False
    return True


def _pam_to_fixed_length(pam_seq: str) -> str:
    clean = _normalize_dna(pam_seq)
    if len(clean) >= MAX_PAM_LENGTH:
        return clean[:MAX_PAM_LENGTH]
    return clean + ("N" * (MAX_PAM_LENGTH - len(clean)))


def _fetch_text(url: str) -> str:
    req = urllib.request.Request(url, headers={"User-Agent": "SynBio-Studio/2.0 (contact: local-user)"})
    with urllib.request.urlopen(req, timeout=120) as response:
        return response.read().decode("utf-8")


def _get_genbank_text(accession: str) -> str:
    cache_path = GENOME_CACHE_DIR / f"{accession}.gb"
    if cache_path.exists():
        return cache_path.read_text(encoding="utf-8")
    url = (
        "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi"
        f"?db=nuccore&id={accession}&rettype=gbwithparts&retmode=text"
    )
    text = _fetch_text(url)
    cache_path.write_text(text, encoding="utf-8")
    return text


def _load_genome_by_accession(accession: str) -> str:
    if accession in _GENOME_CACHE:
        return _GENOME_CACHE[accession]
    text = _get_genbank_text(accession)
    record = next(SeqIO.parse(StringIO(text), "genbank"))
    sequence = _normalize_dna(str(record.seq))
    _GENOME_CACHE[accession] = sequence
    return sequence


def load_target_genome(target_organism: Optional[str], target_genome: Optional[str]) -> Tuple[str, str, str]:
    if target_genome:
        genome = _normalize_dna(target_genome)
        if len(genome) < 100:
            raise ValueError("Custom genome must contain at least 100 nt")
        if len(genome) > 8_000_000:
            raise ValueError("Custom genome is too large for local off-target scanning (>8 Mb)")
        return genome, "custom_genome", "Custom Genome"

    organism_key = target_organism or "ecoli_mg1655"
    organism = ORGANISM_CATALOG.get(organism_key)
    if not organism:
        raise ValueError(f"Unsupported target organism '{organism_key}'")
    genome = _load_genome_by_accession(organism["accession"])
    return genome, organism_key, organism["display_name"]


def _mismatch_positions(guide: str, target: str) -> List[int]:
    return [idx for idx, (g, t) in enumerate(zip(guide, target)) if g != t]


def mit_score(guide: str, target: str) -> float:
    if len(guide) != len(target):
        return 0.0
    mismatches = [(i, guide[i], target[i]) for i in range(len(guide)) if guide[i] != target[i]]
    if not mismatches:
        return 100.0
    n_mm = len(mismatches)
    if n_mm > 6:
        return 0.0
    score = 1.0
    for pos, _guide_base, _target_base in mismatches:
        if pos < len(_MIT_WEIGHTS):
            score *= (1.0 - _MIT_WEIGHTS[pos])
    if n_mm > 1:
        distances = []
        for ii in range(len(mismatches)):
            for jj in range(ii + 1, len(mismatches)):
                distances.append(abs(mismatches[ii][0] - mismatches[jj][0]))
        mean_dist = sum(distances) / len(distances)
        score *= 1.0 / ((4.0 * (19 - mean_dist) / 19.0) + 1.0)
    score *= 1.0 / (n_mm ** 2)
    return round(score * 100, 4)


def cfd_score(guide: str, target: str, pam_seq: str = "GG") -> float:
    if len(guide) != len(target):
        return 0.0
    score = 1.0
    for idx, (guide_base, target_base) in enumerate(zip(guide, target)):
        if guide_base == target_base:
            continue
        pam_prox_weight = 1.0 - ((19 - idx) / 19.0) * 0.65
        transition = {guide_base, target_base} in ({"A", "G"}, {"C", "T"})
        type_weight = 0.82 if transition else 0.68
        score *= max(0.02, pam_prox_weight * type_weight)
    pam_seq = _normalize_dna(pam_seq)
    if pam_seq.endswith("GG"):
        score *= 1.0
    elif pam_seq.endswith("AG"):
        score *= 0.55
    elif pam_seq.endswith("GA"):
        score *= 0.25
    else:
        score *= 0.1
    return round(float(max(0.0, min(score, 1.0))), 6)


def cleavage_prior(guide: str, target: str, pam_seq: str) -> float:
    mismatches = _mismatch_positions(guide, target)
    if not mismatches:
        return 0.995
    mit = mit_score(guide, target) / 100.0
    cfd = cfd_score(guide, target, pam_seq)
    hybrid = 0.52 * mit + 0.48 * cfd
    seed_mismatches = sum(1 for pos in mismatches if pos >= 8)
    if seed_mismatches:
        hybrid *= 0.42 ** min(seed_mismatches, 3)
    if len(mismatches) >= 4:
        hybrid *= 0.33
    if len(mismatches) >= 5:
        hybrid *= 0.2
    clustered = any((b - a) <= 2 for a, b in zip(mismatches, mismatches[1:]))
    if clustered:
        hybrid *= 0.7
    return float(max(0.001, min(hybrid, 0.995)))


def _encode_example(guide: str, target: str, pam_seq: str) -> np.ndarray:
    tensor = np.zeros((9, INPUT_LENGTH), dtype=np.float32)
    pam_fixed = _pam_to_fixed_length(pam_seq)
    guide_full = guide + ("N" * MAX_PAM_LENGTH)
    target_full = target + pam_fixed

    for pos, base in enumerate(guide_full):
        idx = BASE_TO_INDEX.get(base)
        if idx is not None:
            tensor[idx, pos] = 1.0
    for pos, base in enumerate(target_full):
        idx = BASE_TO_INDEX.get(base)
        if idx is not None:
            tensor[4 + idx, pos] = 1.0
    for pos in range(GUIDE_LENGTH):
        tensor[8, pos] = 1.0 if guide[pos] != target[pos] else 0.0
    return tensor


def _sample_real_guides(genome: str, pam_pattern: str, max_guides: int, seed: int) -> List[str]:
    rng = random.Random(seed)
    candidates: List[str] = []
    upper = len(genome) - GUIDE_LENGTH - len(pam_pattern)
    stride = max(1, upper // max(max_guides * 6, 1))
    for idx in range(0, upper, stride):
        guide = genome[idx:idx + GUIDE_LENGTH]
        pam_seq = genome[idx + GUIDE_LENGTH:idx + GUIDE_LENGTH + len(pam_pattern)]
        if len(guide) != GUIDE_LENGTH or len(pam_seq) != len(pam_pattern):
            continue
        if _matches_iupac(pam_seq, pam_pattern):
            candidates.append(guide)
    rng.shuffle(candidates)
    deduped: List[str] = []
    seen = set()
    for guide in candidates:
        if guide in seen:
            continue
        seen.add(guide)
        deduped.append(guide)
        if len(deduped) >= max_guides:
            break
    return deduped


def _mutate_target(guide: str, n_mismatches: int, rng: random.Random) -> str:
    target = list(guide)
    positions = rng.sample(range(GUIDE_LENGTH), k=n_mismatches)
    for pos in positions:
        current = target[pos]
        alternatives = [base for base in BASES if base != current]
        target[pos] = rng.choice(alternatives)
    return "".join(target)


def _sample_pam_variant(rng: random.Random) -> str:
    pam_library = ["AGG", "TGG", "CGG", "GGG", "AAG", "TAG", "GAG", "TGA"]
    return rng.choice(pam_library)


def _build_training_examples() -> List[Dict[str, Any]]:
    rng = random.Random(42)
    examples: List[Dict[str, Any]] = []
    for index, organism in enumerate(ORGANISM_CATALOG.values()):
        genome = _load_genome_by_accession(organism["accession"])
        guides = _sample_real_guides(genome, "NGG", max_guides=56, seed=100 + index)
        for guide in guides:
            examples.append({
                "guide": guide,
                "target": guide,
                "pam_seq": "AGG",
                "label": 0.995,
            })
            for mismatch_count in (1, 1, 2, 2, 3, 4, 5, 6):
                target = _mutate_target(guide, mismatch_count, rng)
                pam_seq = _sample_pam_variant(rng)
                examples.append({
                    "guide": guide,
                    "target": target,
                    "pam_seq": pam_seq,
                    "label": cleavage_prior(guide, target, pam_seq),
                })
    return examples


def _dataset_tensors(entries: Sequence[Dict[str, Any]]) -> Tuple[torch.Tensor, torch.Tensor]:
    x = np.stack([_encode_example(entry["guide"], entry["target"], entry["pam_seq"]) for entry in entries], axis=0)
    y = np.array([[float(entry["label"])] for entry in entries], dtype=np.float32)
    return torch.from_numpy(x), torch.from_numpy(y)


def _train_model(entries: Sequence[Dict[str, Any]], seed: int = 42, epochs: int = 28) -> OffTargetCNN:
    _seed_all(seed)
    model = OffTargetCNN()
    optimizer = torch.optim.Adam(model.parameters(), lr=0.003, weight_decay=1e-4)
    loss_fn = nn.MSELoss()
    x_tensor, y_tensor = _dataset_tensors(entries)
    model.train()
    for _epoch in range(epochs):
        optimizer.zero_grad(set_to_none=True)
        pred = model(x_tensor)
        loss = loss_fn(pred, y_tensor)
        loss.backward()
        optimizer.step()
    return model.eval()


def _evaluate_model(model: OffTargetCNN, entries: Sequence[Dict[str, Any]]) -> Dict[str, float]:
    x_tensor, y_tensor = _dataset_tensors(entries)
    with torch.no_grad():
        pred = model(x_tensor).numpy().reshape(-1)
    truth = y_tensor.numpy().reshape(-1)
    rmse = float(np.sqrt(np.mean((pred - truth) ** 2)))
    mae = float(np.mean(np.abs(pred - truth)))
    pearson = float(np.corrcoef(pred, truth)[0, 1]) if np.std(pred) > 1e-8 and np.std(truth) > 1e-8 else 0.0
    return {
        "rmse": round(rmse, 4),
        "mae": round(mae, 4),
        "pearson_r": round(pearson, 4),
        "sample_count": len(entries),
    }


def ensure_model() -> Dict[str, Any]:
    global _MODEL_CACHE, _METADATA_CACHE
    if _MODEL_CACHE is not None and _METADATA_CACHE is not None:
        return _METADATA_CACHE

    if WEIGHTS_PATH.exists() and METADATA_PATH.exists():
        metadata = json.loads(METADATA_PATH.read_text(encoding="utf-8"))
        if metadata.get("model_version") == MODEL_VERSION:
            model = OffTargetCNN()
            model.load_state_dict(torch.load(WEIGHTS_PATH, map_location="cpu"))
            model.eval()
            _MODEL_CACHE = model
            _METADATA_CACHE = metadata
            return metadata

    entries = _build_training_examples()
    model = _train_model(entries)
    metrics = _evaluate_model(model, entries)
    metadata = {
        "model_version": MODEL_VERSION,
        "dataset_name": "Cas-OFFinder-style genome candidate pairs",
        "training_reference": "Real RefSeq protospacers expanded into mismatch/PAM candidate pairs and calibrated with MIT/CFD cleavage priors",
        "supported_organisms": {key: value["display_name"] for key, value in ORGANISM_CATALOG.items()},
        "train_metrics": metrics,
        "guide_length": GUIDE_LENGTH,
        "max_pam_length": MAX_PAM_LENGTH,
    }
    torch.save(model.state_dict(), WEIGHTS_PATH)
    METADATA_PATH.write_text(json.dumps(metadata, indent=2), encoding="utf-8")
    _MODEL_CACHE = model
    _METADATA_CACHE = metadata
    return metadata


def _get_model() -> OffTargetCNN:
    ensure_model()
    assert _MODEL_CACHE is not None
    return _MODEL_CACHE


def predict_probability(guide: str, target: str, pam_seq: str) -> float:
    model = _get_model()
    features = torch.from_numpy(_encode_example(guide, target, pam_seq)).unsqueeze(0)
    with torch.no_grad():
        prob = float(model(features).item())
    return max(0.0, min(prob, 1.0))


def _batched_probabilities(examples: Sequence[Tuple[str, str, str]], batch_size: int = 256) -> List[float]:
    if not examples:
        return []
    model = _get_model()
    outputs: List[float] = []
    for idx in range(0, len(examples), batch_size):
        batch = examples[idx:idx + batch_size]
        arr = np.stack([_encode_example(guide, target, pam_seq) for guide, target, pam_seq in batch], axis=0)
        tensor = torch.from_numpy(arr)
        with torch.no_grad():
            probs = model(tensor).numpy().reshape(-1)
        outputs.extend(float(max(0.0, min(value, 1.0))) for value in probs)
    return outputs


def _iter_genome_candidates(genome: str, pam_pattern: str) -> Iterable[Tuple[str, str, int, str]]:
    pam_len = len(pam_pattern)
    comp = str.maketrans("ACGT", "TGCA")
    for strand, scan_seq in (("+", genome), ("-", genome.translate(comp)[::-1])):
        upper = len(scan_seq) - GUIDE_LENGTH - pam_len
        for idx in range(max(0, upper + 1)):
            protospacer = scan_seq[idx:idx + GUIDE_LENGTH]
            pam_seq = scan_seq[idx + GUIDE_LENGTH:idx + GUIDE_LENGTH + pam_len]
            if len(protospacer) != GUIDE_LENGTH or len(pam_seq) != pam_len:
                continue
            if not _matches_iupac(pam_seq, pam_pattern):
                continue
            actual_pos = idx if strand == "+" else len(genome) - idx - GUIDE_LENGTH
            yield protospacer, pam_seq, actual_pos, strand


def classify_risk(probability: float) -> str:
    if probability >= 0.45:
        return "high"
    if probability >= 0.15:
        return "moderate"
    return "low"


def simple_on_target_score(guide: str) -> float:
    guide_gc = (guide.count("G") + guide.count("C")) / len(guide)
    score = 0.52
    if 0.4 <= guide_gc <= 0.7:
        score += 0.2
    elif guide_gc < 0.3 or guide_gc > 0.8:
        score -= 0.15
    if "TTTT" in guide:
        score -= 0.25
    if guide[-1] == "G":
        score += 0.08
    if guide[0] == "G":
        score += 0.04
    return round(max(0.0, min(score, 1.0)), 4)


def scan_offtargets(
    guide: str,
    pam_pattern: str,
    genome: str,
    max_mismatches: int = 4,
    max_results: int = 200,
) -> Dict[str, Any]:
    guide = _normalize_dna(guide)
    if len(guide) != GUIDE_LENGTH:
        raise ValueError(f"Guide must be exactly {GUIDE_LENGTH} nt")

    candidates: List[Dict[str, Any]] = []
    model_examples: List[Tuple[str, str, str]] = []
    for protospacer, pam_seq, position, strand in _iter_genome_candidates(genome, pam_pattern):
        mismatch_positions = _mismatch_positions(guide, protospacer)
        mismatch_count = len(mismatch_positions)
        if mismatch_count == 0:
            continue
        if mismatch_count > max_mismatches:
            continue
        candidates.append({
            "protospacer": protospacer,
            "pam_seq": pam_seq,
            "position": position,
            "strand": strand,
            "mismatch_positions": mismatch_positions,
            "mismatches": mismatch_count,
        })
        model_examples.append((guide, protospacer, pam_seq))

    probabilities = _batched_probabilities(model_examples)
    for candidate, probability in zip(candidates, probabilities):
        candidate["cnn_probability"] = round(probability, 4)
        candidate["mit_score"] = round(mit_score(guide, candidate["protospacer"]), 3)
        candidate["cfd_score"] = round(cfd_score(guide, candidate["protospacer"], candidate["pam_seq"]), 4)
        candidate["in_seed_region"] = any(pos >= 8 for pos in candidate["mismatch_positions"])
        candidate["risk_category"] = classify_risk(probability)
        candidate["sequence"] = candidate["protospacer"] + candidate["pam_seq"]

    candidates.sort(key=lambda item: (item["cnn_probability"], item["cfd_score"], -item["mismatches"]), reverse=True)
    trimmed = candidates[:max_results]
    total_risk = sum(item["cnn_probability"] * (1.25 if item["in_seed_region"] else 1.0) for item in trimmed[:50])
    specificity = max(0.0, min(100.0, 100.0 * math.exp(-0.6 * total_risk)))

    return {
        "off_targets": trimmed,
        "total_candidates": len(candidates),
        "specificity_score": round(specificity, 2),
    }