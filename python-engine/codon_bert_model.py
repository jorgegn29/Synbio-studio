from __future__ import annotations

import hashlib
import json
import math
import random
import re
import urllib.request
from collections import Counter, defaultdict
from io import StringIO
from pathlib import Path
from typing import Any, Dict, List, Optional, Sequence, Tuple

import torch
import torch.nn as nn
import torch.nn.functional as F
from Bio import SeqIO


MODEL_VERSION = "codonbert-ecoli-v1"
BASE_DIR = Path(__file__).resolve().parent
MODEL_DIR = BASE_DIR / "models" / "codonbert"
GENOME_CACHE_DIR = MODEL_DIR / "genomes"
CORPUS_CACHE_DIR = MODEL_DIR / "corpora"
MODEL_DIR.mkdir(parents=True, exist_ok=True)
GENOME_CACHE_DIR.mkdir(parents=True, exist_ok=True)
CORPUS_CACHE_DIR.mkdir(parents=True, exist_ok=True)

START_TOKEN = "[CLS]"
END_TOKEN = "[SEP]"
MASK_TOKEN = "[MASK]"
PAD_TOKEN = "[PAD]"

GENETIC_CODE: Dict[str, str] = {
    "TTT": "F", "TTC": "F", "TTA": "L", "TTG": "L", "CTT": "L", "CTC": "L", "CTA": "L", "CTG": "L",
    "ATT": "I", "ATC": "I", "ATA": "I", "ATG": "M", "GTT": "V", "GTC": "V", "GTA": "V", "GTG": "V",
    "TCT": "S", "TCC": "S", "TCA": "S", "TCG": "S", "AGT": "S", "AGC": "S", "CCT": "P", "CCC": "P",
    "CCA": "P", "CCG": "P", "ACT": "T", "ACC": "T", "ACA": "T", "ACG": "T", "GCT": "A", "GCC": "A",
    "GCA": "A", "GCG": "A", "TAT": "Y", "TAC": "Y", "CAT": "H", "CAC": "H", "CAA": "Q", "CAG": "Q",
    "AAT": "N", "AAC": "N", "AAA": "K", "AAG": "K", "GAT": "D", "GAC": "D", "GAA": "E", "GAG": "E",
    "TGT": "C", "TGC": "C", "TGG": "W", "CGT": "R", "CGC": "R", "CGA": "R", "CGG": "R", "AGA": "R",
    "AGG": "R", "GGT": "G", "GGC": "G", "GGA": "G", "GGG": "G", "TAA": "*", "TAG": "*", "TGA": "*",
}
AA_TO_CODONS: Dict[str, List[str]] = defaultdict(list)
for _codon, _aa in GENETIC_CODE.items():
    AA_TO_CODONS[_aa].append(_codon)

VOCAB = [PAD_TOKEN, MASK_TOKEN, START_TOKEN, END_TOKEN] + sorted(GENETIC_CODE.keys())
TOKEN_TO_ID = {token: idx for idx, token in enumerate(VOCAB)}
ID_TO_TOKEN = {idx: token for token, idx in TOKEN_TO_ID.items()}

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

DEFAULT_RESTRICTION_SITES = {
    "EcoRI": "GAATTC",
    "BamHI": "GGATCC",
    "HindIII": "AAGCTT",
    "XbaI": "TCTAGA",
    "SpeI": "ACTAGT",
    "PstI": "CTGCAG",
    "NotI": "GCGGCCGC",
}


def _normalize_dna(seq: str) -> str:
    return "".join(base for base in str(seq).upper() if base in "ACGT")


def _validate_cds(seq: str) -> str:
    clean = _normalize_dna(seq)
    if len(clean) < 30 or len(clean) % 3 != 0:
        raise ValueError("CDS must be at least 30 nt and divisible by 3")
    protein = translate_cds(clean)
    if "*" in protein[:-1]:
        raise ValueError("CDS contains internal stop codons")
    return clean


def cds_to_codons(seq: str) -> List[str]:
    clean = _normalize_dna(seq)
    return [clean[i:i + 3] for i in range(0, len(clean), 3) if len(clean[i:i + 3]) == 3]


def translate_cds(seq: str) -> str:
    codons = cds_to_codons(seq)
    return "".join(GENETIC_CODE.get(codon, "X") for codon in codons)


def protein_to_seed_cds(protein: str, codon_weights: Dict[str, float]) -> str:
    dna: List[str] = []
    for aa in protein:
        codons = AA_TO_CODONS.get(aa, [])
        if not codons:
            dna.append("NNN")
            continue
        best = max(codons, key=lambda codon: codon_weights.get(codon, 1e-6))
        dna.append(best)
    return "".join(dna)


def calc_gc_content(seq: str) -> float:
    clean = _normalize_dna(seq)
    return (clean.count("G") + clean.count("C")) / len(clean) if clean else 0.0


def _make_cai_weights(corpus: Sequence[str]) -> Dict[str, float]:
    counts = Counter()
    aa_counts: Dict[str, Counter[str]] = defaultdict(Counter)
    for seq in corpus:
        for codon in cds_to_codons(seq):
            aa = GENETIC_CODE.get(codon)
            if aa is None or aa == "*":
                continue
            counts[codon] += 1
            aa_counts[aa][codon] += 1
    weights: Dict[str, float] = {}
    for aa, codon_counts in aa_counts.items():
        if not codon_counts:
            continue
        max_count = max(codon_counts.values())
        for codon in AA_TO_CODONS[aa]:
            weights[codon] = codon_counts.get(codon, 1) / max_count
    return weights


def calculate_cai(seq: str, cai_weights: Dict[str, float]) -> float:
    values = []
    for codon in cds_to_codons(seq):
        aa = GENETIC_CODE.get(codon)
        if aa is None or aa == "*":
            continue
        values.append(max(cai_weights.get(codon, 1e-3), 1e-3))
    if not values:
        return 0.0
    return math.exp(sum(math.log(value) for value in values) / len(values))


def _count_rare_codons(seq: str, codon_weights: Dict[str, float], threshold: float = 0.18) -> int:
    return sum(1 for codon in cds_to_codons(seq) if codon_weights.get(codon, 0.0) < threshold)


def _restriction_site_hits(seq: str, restriction_sites: Dict[str, str]) -> List[str]:
    hits = []
    for name, site in restriction_sites.items():
        if site in seq:
            hits.append(name)
    return hits


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


def _parse_refseq_corpus(accession: str, max_genes: int = 320) -> List[Dict[str, Any]]:
    cache_path = CORPUS_CACHE_DIR / f"{accession}-{max_genes}.json"
    if cache_path.exists():
        return json.loads(cache_path.read_text(encoding="utf-8"))

    record = SeqIO.read(StringIO(_get_genbank_text(accession)), "genbank")
    entries: List[Dict[str, Any]] = []
    for feature in record.features:
        if feature.type != "CDS":
            continue
        try:
            seq = _normalize_dna(str(feature.extract(record.seq)))
        except Exception:
            continue
        if len(seq) < 90 or len(seq) > 2400 or len(seq) % 3 != 0:
            continue
        protein = translate_cds(seq)
        if protein.endswith("*"):
            protein = protein[:-1]
        if "*" in protein or "X" in protein or len(protein) < 30:
            continue

        qualifiers = feature.qualifiers
        entries.append({
            "locus_tag": (qualifiers.get("locus_tag") or [""])[0],
            "gene": (qualifiers.get("gene") or [""])[0],
            "product": (qualifiers.get("product") or [""])[0],
            "sequence": seq,
            "protein": protein,
            "length_nt": len(seq),
            "length_aa": len(protein),
        })

    entries.sort(key=lambda item: (item["length_aa"], item["gene"] or item["locus_tag"]))
    if len(entries) > max_genes:
        step = len(entries) / max_genes
        entries = [entries[min(int(i * step), len(entries) - 1)] for i in range(max_genes)]

    cache_path.write_text(json.dumps(entries, indent=2), encoding="utf-8")
    return entries


class TinyCodonBERT(nn.Module):
    def __init__(self, vocab_size: int, d_model: int = 96, n_heads: int = 4, n_layers: int = 2, max_len: int = 256):
        super().__init__()
        self.token_embedding = nn.Embedding(vocab_size, d_model)
        self.position_embedding = nn.Embedding(max_len, d_model)
        encoder_layer = nn.TransformerEncoderLayer(
            d_model=d_model,
            nhead=n_heads,
            dim_feedforward=d_model * 4,
            dropout=0.1,
            batch_first=True,
            activation="gelu",
        )
        self.encoder = nn.TransformerEncoder(encoder_layer, num_layers=n_layers)
        self.norm = nn.LayerNorm(d_model)
        self.head = nn.Linear(d_model, vocab_size)
        self.max_len = max_len

    def forward(self, input_ids: torch.Tensor, attention_mask: torch.Tensor) -> torch.Tensor:
        positions = torch.arange(input_ids.size(1), device=input_ids.device).unsqueeze(0)
        hidden = self.token_embedding(input_ids) + self.position_embedding(positions)
        key_padding_mask = attention_mask == 0
        hidden = self.encoder(hidden, src_key_padding_mask=key_padding_mask)
        hidden = self.norm(hidden)
        return self.head(hidden)


def _sequence_to_ids(seq: str, max_len: int) -> List[int]:
    tokens = [START_TOKEN] + cds_to_codons(seq) + [END_TOKEN]
    tokens = tokens[:max_len - 1] + [END_TOKEN] if len(tokens) >= max_len else tokens
    return [TOKEN_TO_ID[token] for token in tokens]


def _build_training_examples(corpus: Sequence[str], max_len: int) -> List[List[int]]:
    examples: List[List[int]] = []
    for seq in corpus:
        codons = cds_to_codons(seq)
        if len(codons) + 2 <= max_len:
            examples.append(_sequence_to_ids(seq, max_len))
            continue
        window = max_len - 2
        stride = max(window // 2, 48)
        for start in range(0, len(codons), stride):
            chunk = codons[start:start + window]
            if len(chunk) < 24:
                break
            tokens = [START_TOKEN] + chunk + [END_TOKEN]
            examples.append([TOKEN_TO_ID[token] for token in tokens])
    return examples


def _collate_batch(examples: Sequence[List[int]], max_len: int, mask_prob: float = 0.15) -> Tuple[torch.Tensor, torch.Tensor, torch.Tensor]:
    batch_size = len(examples)
    input_ids = torch.full((batch_size, max_len), TOKEN_TO_ID[PAD_TOKEN], dtype=torch.long)
    labels = torch.full((batch_size, max_len), -100, dtype=torch.long)
    attention_mask = torch.zeros((batch_size, max_len), dtype=torch.long)

    for row, example in enumerate(examples):
        size = min(len(example), max_len)
        input_ids[row, :size] = torch.tensor(example[:size], dtype=torch.long)
        attention_mask[row, :size] = 1
        for col in range(1, size - 1):
            token_id = input_ids[row, col].item()
            token = ID_TO_TOKEN[token_id]
            if token in (PAD_TOKEN, START_TOKEN, END_TOKEN) or token not in GENETIC_CODE:
                continue
            if random.random() < mask_prob:
                labels[row, col] = token_id
                input_ids[row, col] = TOKEN_TO_ID[MASK_TOKEN]

    return input_ids, attention_mask, labels


def _train_model(
    corpus: Sequence[str],
    epochs: int,
    seed: int,
    learning_rate: float = 2e-3,
    max_len: int = 256,
    initial_state_dict: Optional[Dict[str, torch.Tensor]] = None,
) -> Tuple[TinyCodonBERT, Dict[str, Any]]:
    random.seed(seed)
    torch.manual_seed(seed)

    model = TinyCodonBERT(vocab_size=len(VOCAB), max_len=max_len)
    if initial_state_dict is not None:
        model.load_state_dict(initial_state_dict)
    optimizer = torch.optim.AdamW(model.parameters(), lr=learning_rate, weight_decay=1e-4)
    examples = _build_training_examples(corpus, max_len)
    if not examples:
        raise ValueError("Corpus is empty after preprocessing")

    batch_size = 16
    epoch_losses: List[float] = []
    model.train()
    for _ in range(epochs):
        random.shuffle(examples)
        losses = []
        for idx in range(0, len(examples), batch_size):
            batch = examples[idx:idx + batch_size]
            input_ids, attention_mask, labels = _collate_batch(batch, max_len=max_len)
            if int((labels != -100).sum().item()) == 0:
                continue
            optimizer.zero_grad(set_to_none=True)
            logits = model(input_ids, attention_mask)
            loss = F.cross_entropy(logits.view(-1, logits.size(-1)), labels.view(-1), ignore_index=-100)
            loss.backward()
            optimizer.step()
            losses.append(float(loss.item()))
        epoch_losses.append(sum(losses) / max(len(losses), 1))

    return model.eval(), {
        "epochs": epochs,
        "example_count": len(examples),
        "epoch_losses": [round(value, 4) for value in epoch_losses],
    }


def _artifact_paths(tag: str) -> Tuple[Path, Path]:
    base = MODEL_DIR / tag
    return base.with_suffix(".pt"), base.with_suffix(".json")


def _save_artifact(model: TinyCodonBERT, metadata: Dict[str, Any], tag: str) -> Dict[str, Any]:
    model_path, meta_path = _artifact_paths(tag)
    torch.save({"state_dict": model.state_dict()}, model_path)
    meta_path.write_text(json.dumps(metadata, indent=2), encoding="utf-8")
    return metadata


def _load_artifact(tag: str) -> Tuple[TinyCodonBERT, Dict[str, Any]]:
    model_path, meta_path = _artifact_paths(tag)
    metadata = json.loads(meta_path.read_text(encoding="utf-8"))
    model = TinyCodonBERT(vocab_size=len(VOCAB), max_len=int(metadata.get("max_len", 256)))
    payload = torch.load(model_path, map_location="cpu")
    model.load_state_dict(payload["state_dict"])
    return model.eval(), metadata


def _build_local_window_ids(codons: Sequence[str], center_index: int, max_len: int = 256) -> Tuple[List[int], int]:
    window = max_len - 2
    start = max(0, center_index - window // 2)
    end = min(len(codons), start + window)
    start = max(0, end - window)
    local_codons = list(codons[start:end])
    local_position = center_index - start + 1
    tokens = [START_TOKEN] + local_codons + [END_TOKEN]
    return [TOKEN_TO_ID[token] for token in tokens], local_position


def ensure_pretrained_model(max_genes: int = 320) -> Dict[str, Any]:
    tag = f"{MODEL_VERSION}-pretrained"
    model_path, meta_path = _artifact_paths(tag)
    if model_path.exists() and meta_path.exists():
        _, metadata = _load_artifact(tag)
        return metadata

    organism = ORGANISM_CATALOG["ecoli_mg1655"]
    corpus_entries = _parse_refseq_corpus(organism["accession"], max_genes=max_genes)
    corpus = [entry["sequence"] for entry in corpus_entries]
    model, training = _train_model(corpus, epochs=2, seed=13)
    codon_weights = _make_cai_weights(corpus)
    metadata = {
        "model_version": MODEL_VERSION,
        "tag": tag,
        "pretrained_on": "ecoli_mg1655",
        "display_name": organism["display_name"],
        "accession": organism["accession"],
        "source": organism["source"],
        "max_len": 256,
        "corpus_gene_count": len(corpus_entries),
        "training": training,
        "codon_weights": codon_weights,
        "genes_preview": [
            {
                "gene": entry["gene"],
                "locus_tag": entry["locus_tag"],
                "product": entry["product"],
                "length_aa": entry["length_aa"],
            }
            for entry in corpus_entries[:12]
        ],
    }
    return _save_artifact(model, metadata, tag)


def _custom_corpus_key(custom_cds: Sequence[str]) -> str:
    digest = hashlib.sha256("|".join(sorted(custom_cds)).encode("utf-8")).hexdigest()
    return digest[:12]


def ensure_target_model(target_organism: str, custom_target_cds: Optional[Sequence[str]] = None, max_genes: int = 320) -> Dict[str, Any]:
    ensure_pretrained_model(max_genes=max_genes)
    custom_target_cds = list(custom_target_cds or [])

    if not custom_target_cds and target_organism == "ecoli_mg1655":
        model, metadata = _load_artifact(f"{MODEL_VERSION}-pretrained")
        return {"model": model, "metadata": metadata, "corpus": None}

    if custom_target_cds:
        validated = [_validate_cds(seq) for seq in custom_target_cds]
        corpus_entries = [{
            "gene": f"custom_{idx + 1}",
            "locus_tag": f"custom_{idx + 1}",
            "product": "user supplied CDS",
            "sequence": seq,
            "protein": translate_cds(seq).rstrip("*"),
            "length_aa": len(seq) // 3,
        } for idx, seq in enumerate(validated)]
        target_label = f"custom-{_custom_corpus_key(validated)}"
        display_name = "Custom CDS corpus"
        source = "User supplied"
    else:
        organism = ORGANISM_CATALOG.get(target_organism)
        if organism is None:
            raise ValueError(f"Unsupported target organism: {target_organism}")
        corpus_entries = _parse_refseq_corpus(organism["accession"], max_genes=max_genes)
        target_label = target_organism
        display_name = organism["display_name"]
        source = organism["source"]

    tag = f"{MODEL_VERSION}-finetuned-{target_label}"
    model_path, meta_path = _artifact_paths(tag)
    if model_path.exists() and meta_path.exists():
        model, metadata = _load_artifact(tag)
        return {"model": model, "metadata": metadata, "corpus": corpus_entries}

    base_model, base_metadata = _load_artifact(f"{MODEL_VERSION}-pretrained")
    corpus = [entry["sequence"] for entry in corpus_entries]
    finetuned_model, training = _train_model(
        corpus,
        epochs=1,
        seed=17,
        learning_rate=9e-4,
        max_len=int(base_metadata.get("max_len", 256)),
        initial_state_dict=base_model.state_dict(),
    )
    codon_weights = _make_cai_weights(corpus)
    metadata = {
        "model_version": MODEL_VERSION,
        "tag": tag,
        "pretrained_on": "ecoli_mg1655",
        "fine_tuned_on": target_label,
        "display_name": display_name,
        "source": source,
        "max_len": int(base_metadata.get("max_len", 256)),
        "corpus_gene_count": len(corpus_entries),
        "training": training,
        "codon_weights": codon_weights,
        "genes_preview": [
            {
                "gene": entry["gene"],
                "locus_tag": entry["locus_tag"],
                "product": entry["product"],
                "length_aa": entry["length_aa"],
            }
            for entry in corpus_entries[:12]
        ],
    }
    metadata = _save_artifact(finetuned_model, metadata, tag)
    return {"model": finetuned_model, "metadata": metadata, "corpus": corpus_entries}


def _masked_token_probs(model: TinyCodonBERT, codons: Sequence[str], position: int) -> torch.Tensor:
    token_ids, local_position = _build_local_window_ids(codons, position, max_len=model.max_len)
    masked = list(token_ids)
    masked[local_position] = TOKEN_TO_ID[MASK_TOKEN]
    input_ids = torch.tensor([masked], dtype=torch.long)
    attention_mask = (input_ids != TOKEN_TO_ID[PAD_TOKEN]).long()
    with torch.no_grad():
        logits = model(input_ids, attention_mask)[0, local_position]
        return torch.softmax(logits, dim=-1)


def _pseudo_likelihood(model: TinyCodonBERT, cds_sequence: str) -> Tuple[float, List[float]]:
    codons = cds_to_codons(cds_sequence)
    codon_probs: List[float] = []
    for position, codon in enumerate(codons):
        if codon not in GENETIC_CODE:
            continue
        probs = _masked_token_probs(model, codons, position)
        codon_probs.append(float(probs[TOKEN_TO_ID[codon]].item()))
    mean_prob = sum(codon_probs) / max(len(codon_probs), 1)
    return mean_prob, codon_probs


def _window_penalty(context_seq: str, candidate: str, restriction_sites: Dict[str, str]) -> float:
    penalty = 0.0
    combined = context_seq + candidate
    if len(context_seq) >= 3 and context_seq[-3:] == candidate:
        penalty += 0.35
    if any(site in combined[-12:] for site in restriction_sites.values()):
        penalty += 0.7
    if re.search(r"A{5,}|T{5,}|G{5,}|C{5,}", combined[-12:]):
        penalty += 0.4
    return penalty


def _score_expression(model: TinyCodonBERT, seq: str, cai_weights: Dict[str, float], restriction_sites: Dict[str, str]) -> Dict[str, Any]:
    lm_score, codon_probs = _pseudo_likelihood(model, seq)
    cai = calculate_cai(seq, cai_weights)
    gc = calc_gc_content(seq)
    rare_codons = _count_rare_codons(seq, cai_weights)
    restriction_hits = _restriction_site_hits(seq, restriction_sites)
    gc_balance = 1.0 - min(abs(gc - 0.52) / 0.35, 1.0)
    rare_score = 1.0 - min(rare_codons / max(len(cds_to_codons(seq)), 1), 1.0)
    restriction_score = 1.0 - min(len(restriction_hits) * 0.2, 1.0)
    expression = max(0.0, min(1.0, 0.5 * lm_score + 0.25 * cai + 0.15 * gc_balance + 0.1 * rare_score * restriction_score))
    return {
        "expression_score": expression,
        "lm_score": lm_score,
        "mean_masked_probability": lm_score,
        "cai": cai,
        "gc_content": gc,
        "rare_codons": rare_codons,
        "restriction_hits": restriction_hits,
        "codon_probabilities": codon_probs,
    }


def optimize_cds_with_model(
    model: TinyCodonBERT,
    protein_sequence: str,
    starting_cds: Optional[str],
    cai_weights: Dict[str, float],
    restriction_sites: Optional[Dict[str, str]] = None,
    passes: int = 2,
) -> Tuple[str, List[Dict[str, Any]]]:
    restriction_sites = restriction_sites or DEFAULT_RESTRICTION_SITES
    if starting_cds:
        current = _validate_cds(starting_cds)
    else:
        current = protein_to_seed_cds(protein_sequence, cai_weights)

    current_codons = cds_to_codons(current)
    changes: List[Dict[str, Any]] = []

    for _ in range(passes):
        for idx, aa in enumerate(protein_sequence):
            synonyms = AA_TO_CODONS.get(aa, [])
            if len(synonyms) <= 1:
                continue
            probs = _masked_token_probs(model, current_codons, idx)
            context_seq = "".join(current_codons[:idx])
            scored: List[Tuple[float, str]] = []
            for codon in synonyms:
                token_id = TOKEN_TO_ID[codon]
                model_score = float(math.log(max(float(probs[token_id].item()), 1e-8)))
                cai_score = math.log(max(cai_weights.get(codon, 1e-4), 1e-4))
                penalty = _window_penalty(context_seq, codon, restriction_sites)
                total = 0.72 * model_score + 0.22 * cai_score - penalty
                scored.append((total, codon))
            scored.sort(reverse=True)
            best_score, best_codon = scored[0]
            if best_codon != current_codons[idx]:
                changes.append({
                    "position": idx + 1,
                    "amino_acid": aa,
                    "from": current_codons[idx],
                    "to": best_codon,
                    "delta_score": round(best_score - scored[-1][0], 4),
                })
                current_codons[idx] = best_codon

    return "".join(current_codons), changes


def run_codon_optimization(
    protein_sequence: Optional[str],
    cds_sequence: Optional[str],
    target_organism: str,
    custom_target_cds: Optional[Sequence[str]] = None,
    avoid_restriction_sites: Optional[Sequence[str]] = None,
) -> Dict[str, Any]:
    if not protein_sequence and not cds_sequence:
        raise ValueError("Provide either protein_sequence or cds_sequence")

    custom_target_cds = list(custom_target_cds or [])
    restriction_sites = {
        name: site
        for name, site in DEFAULT_RESTRICTION_SITES.items()
        if not avoid_restriction_sites or name in set(avoid_restriction_sites)
    }
    if not restriction_sites:
        restriction_sites = DEFAULT_RESTRICTION_SITES

    target_bundle = ensure_target_model(target_organism, custom_target_cds=custom_target_cds)
    model = target_bundle["model"]
    metadata = target_bundle["metadata"]
    cai_weights = {key: float(value) for key, value in metadata.get("codon_weights", {}).items()}

    original_cds = _validate_cds(cds_sequence) if cds_sequence else None
    protein = str(protein_sequence or "").strip().upper()
    if original_cds:
        protein = translate_cds(original_cds).rstrip("*")
    if not protein:
        raise ValueError("Protein sequence is empty after validation")
    if re.search(r"[^ACDEFGHIKLMNPQRSTVWY*]", protein):
        raise ValueError("Protein sequence contains invalid amino-acid symbols")

    seed_cds = original_cds or protein_to_seed_cds(protein, cai_weights)
    optimized_cds, changes = optimize_cds_with_model(
        model=model,
        protein_sequence=protein.rstrip("*"),
        starting_cds=seed_cds,
        cai_weights=cai_weights,
        restriction_sites=restriction_sites,
    )
    original_metrics = _score_expression(model, seed_cds, cai_weights, restriction_sites)
    optimized_metrics = _score_expression(model, optimized_cds, cai_weights, restriction_sites)

    return {
        "model_version": metadata["model_version"],
        "pretrained_on": metadata.get("pretrained_on"),
        "fine_tuned_on": metadata.get("fine_tuned_on", metadata.get("pretrained_on")),
        "target_display_name": metadata.get("display_name"),
        "corpus_gene_count": metadata.get("corpus_gene_count"),
        "source": metadata.get("source"),
        "protein_sequence": protein.rstrip("*"),
        "original_cds": seed_cds,
        "optimized_cds": optimized_cds,
        "translation_preserved": translate_cds(seed_cds).rstrip("*") == translate_cds(optimized_cds).rstrip("*"),
        "original_metrics": original_metrics,
        "optimized_metrics": optimized_metrics,
        "score_gain": round(optimized_metrics["expression_score"] - original_metrics["expression_score"], 4),
        "cai_gain": round(optimized_metrics["cai"] - original_metrics["cai"], 4),
        "gc_delta": round(optimized_metrics["gc_content"] - original_metrics["gc_content"], 4),
        "rare_codon_delta": optimized_metrics["rare_codons"] - original_metrics["rare_codons"],
        "changes": changes[:80],
        "training_summary": metadata.get("training", {}),
        "genes_preview": metadata.get("genes_preview", []),
    }