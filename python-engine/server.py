"""
SynBio Studio - FastAPI Engine Server
======================================

Professional-grade computation backend for synthetic biology workflows.
Provides ODE/SSA simulation, local BLAST, MSA, RNA folding, FBA,
sequence compilation, synthesis complexity analysis, iGEM database proxy,
and ML-based prediction endpoints.

All endpoints degrade gracefully: when an optional dependency is missing
the server returns a clear error with installation instructions instead
of crashing.

Security
--------
  - Binds to 127.0.0.1 only (no network exposure)
  - CORS restricted to localhost origins
  - Subprocess calls are parameterised (no shell injection)
  - Sequence inputs are validated and sanitised

Usage
-----
  cd python-engine
  python server.py [--port 8765] [--host 127.0.0.1]
"""

from __future__ import annotations

import asyncio
import ast
import hashlib
import importlib
import json
import logging
import math
import os
import re
import shutil
import subprocess
import sys
import tempfile
import time
from collections import Counter
from enum import Enum
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple, Union
from uuid import uuid4

import numpy as np
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
import uvicorn

from inverse_circuit_design import solve_inverse_design

try:
    from codon_bert_model import ORGANISM_CATALOG as CODON_BERT_ORGANISMS
    from codon_bert_model import ensure_pretrained_model, run_codon_optimization
    HAS_CODON_BERT = True
except ImportError:
    CODON_BERT_ORGANISMS = {}
    ensure_pretrained_model = run_codon_optimization = None
    HAS_CODON_BERT = False

try:
    from crispr_offtarget_model import ORGANISM_CATALOG as CRISPR_ORGANISMS
    from crispr_offtarget_model import ensure_model as ensure_crispr_offtarget_model
    from crispr_offtarget_model import load_target_genome, scan_offtargets, simple_on_target_score
    HAS_CRISPR_MODEL = True
except ImportError:
    CRISPR_ORGANISMS = {}
    ensure_crispr_offtarget_model = load_target_genome = scan_offtargets = simple_on_target_score = None
    HAS_CRISPR_MODEL = False

try:
    from esmfold_structure import MAX_SEQUENCE_LENGTH as ESMFOLD_MAX_LENGTH
    from esmfold_structure import analyze_protein_properties, fetch_esmfold_pdb, interpret_structure
    from esmfold_structure import parse_pdb_confidence, parse_secondary_structure, summarise_confidence
    HAS_ESMFOLD_INTEGRATION = True
except ImportError:
    ESMFOLD_MAX_LENGTH = 1024
    analyze_protein_properties = fetch_esmfold_pdb = interpret_structure = None
    parse_pdb_confidence = parse_secondary_structure = summarise_confidence = None
    HAS_ESMFOLD_INTEGRATION = False

try:
    from promoter_strength_model import ensure_artifacts, load_metadata, load_model_base64, predict_strength
    HAS_PROMOTER_MODEL = True
except ImportError:
    ensure_artifacts = load_metadata = load_model_base64 = predict_strength = None
    HAS_PROMOTER_MODEL = False

try:
    from synbio_tutor_model import answer_tutor_question, ensure_tutor_model
    HAS_TUTOR_MODEL = True
except ImportError:
    answer_tutor_question = ensure_tutor_model = None
    HAS_TUTOR_MODEL = False

# ===========================================================================
# LOGGING
# ===========================================================================

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s  %(name)s - %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger("synbio-engine")

# ===========================================================================
# OPTIONAL DEPENDENCY PROBING
# ===========================================================================

def _try_import(name: str) -> bool:
    try:
        __import__(name)
        return True
    except ImportError:
        return False

HAS_SCIPY     = _try_import("scipy")
HAS_GILLESPY2 = _try_import("gillespy2") and hasattr(importlib.import_module("gillespy2"), "Model")
HAS_COBRA     = _try_import("cobra")
HAS_HTTPX     = _try_import("httpx")
HAS_SKLEARN   = _try_import("sklearn")
HAS_BIOPYTHON = _try_import("Bio")
HAS_VIENNA    = _try_import("RNA")

_dep_status = {
    "scipy":     HAS_SCIPY,
    "gillespy2": HAS_GILLESPY2,
    "cobra":     HAS_COBRA,
    "httpx":     HAS_HTTPX,
    "sklearn":   HAS_SKLEARN,
    "biopython": HAS_BIOPYTHON,
    "ViennaRNA": HAS_VIENNA,
    "codon_bert": HAS_CODON_BERT,
    "crispr_model": HAS_CRISPR_MODEL,
    "esmfold_integration": HAS_ESMFOLD_INTEGRATION,
    "promoter_model": HAS_PROMOTER_MODEL,
    "tutor_model": HAS_TUTOR_MODEL,
}
for dep, ok in _dep_status.items():
    logger.info("  %s %s", "OK" if ok else "MISSING", dep)

# ===========================================================================
# EXTERNAL TOOL PROBING (BLAST+, MUSCLE, ClustalOmega)
# ===========================================================================

def _which(tool: str) -> Optional[str]:
    return shutil.which(tool)

HAS_BLASTN   = _which("blastn") is not None
HAS_BLASTP   = _which("blastp") is not None
HAS_MAKEBLASTDB = _which("makeblastdb") is not None
HAS_MUSCLE   = _which("muscle") is not None
HAS_CLUSTALO = _which("clustalo") is not None

logger.info("  %s BLAST+ (blastn)", "OK" if HAS_BLASTN else "MISSING")
logger.info("  %s BLAST+ (blastp)", "OK" if HAS_BLASTP else "MISSING")
logger.info("  %s MUSCLE", "OK" if HAS_MUSCLE else "MISSING")
logger.info("  %s ClustalOmega", "OK" if HAS_CLUSTALO else "MISSING")

FBA_MODELS_DIR = Path(__file__).resolve().parent / "models"
FBA_MODEL_CACHE: Dict[str, Any] = {}
FBA_MODEL_CATALOG: Dict[str, Dict[str, Any]] = {
    "e_coli_core": {
        "display_name": "E. coli core",
        "json_name": "e_coli_core.json",
        "download_url": "https://bigg.ucsd.edu/static/models/e_coli_core.json",
        "default_objective": "BIOMASS_Ecoli_core_w_GAM",
        "default_substrate": "EX_glc__D_e",
        "default_oxygen": "EX_o2_e",
    },
    "iJO1366": {
        "display_name": "E. coli iJO1366",
        "json_name": "iJO1366.json",
        "download_url": "https://bigg.ucsd.edu/static/models/iJO1366.json",
        "default_objective": "BIOMASS_Ec_iJO1366_core_53p95M",
        "default_substrate": "EX_glc__D_e",
        "default_oxygen": "EX_o2_e",
    },
    "iML1515": {
        "display_name": "E. coli iML1515",
        "json_name": "iML1515.json",
        "download_url": "https://bigg.ucsd.edu/static/models/iML1515.json",
        "default_objective": "BIOMASS_Ec_iML1515_core_75p37M",
        "default_substrate": "EX_glc__D_e",
        "default_oxygen": "EX_o2_e",
    },
}

# ===========================================================================
# FASTAPI APP
# ===========================================================================

app = FastAPI(
    title="SynBio Studio - Engine Server",
    description="Professional computation backend for synthetic biology",
    version="2.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
)

app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=r"^(http://127\.0\.0\.1:\d+|http://localhost:\d+|file://.*)$",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

SIMULATION_JOB_TTL_SECONDS = 3600
SIMULATION_JOBS: Dict[str, Dict[str, Any]] = {}


def _prune_simulation_jobs() -> None:
    now = time.time()
    stale_ids = []
    for job_id, job in SIMULATION_JOBS.items():
      finished_at = job.get("finished_at")
      if finished_at and now - finished_at > SIMULATION_JOB_TTL_SECONDS:
          stale_ids.append(job_id)
    for job_id in stale_ids:
        SIMULATION_JOBS.pop(job_id, None)


def _serialize_model_result(result: Any) -> Any:
    if hasattr(result, "model_dump"):
        return result.model_dump()
    if hasattr(result, "dict"):
        return result.dict()
    return result


async def _run_simulation_job(job_id: str, kind: str, payload: Dict[str, Any]) -> None:
    job = SIMULATION_JOBS[job_id]
    job["status"] = "running"
    job["started_at"] = time.time()

    try:
        if kind == "ode":
            response = await simulate_ode(ODERequest(**payload))
        elif kind == "ssa":
            response = await simulate_ssa(SSARequest(**payload))
        else:
            raise ValueError(f"Unsupported simulation kind: {kind}")

        job["status"] = "completed"
        job["result"] = _serialize_model_result(response)
    except HTTPException as exc:
        job["status"] = "failed"
        job["error"] = exc.detail
    except Exception as exc:
        job["status"] = "failed"
        job["error"] = str(exc)
    finally:
        job["finished_at"] = time.time()
        _prune_simulation_jobs()


# ===========================================================================
# HEALTH
# ===========================================================================

@app.get("/")
async def root():
    return {
        "service": "SynBio Studio Engine",
        "version": "2.0.0",
        "status": "running",
        "dependencies": _dep_status,
        "tools": {
            "blastn": HAS_BLASTN,
            "blastp": HAS_BLASTP,
            "muscle": HAS_MUSCLE,
            "clustalo": HAS_CLUSTALO,
        },
    }

@app.get("/health")
async def health():
    return {"status": "healthy", "uptime": time.process_time()}


# ===========================================================================
# HELPERS
# ===========================================================================

_DNA_RE = re.compile(r"^[ACGTUNRYWSMKHBVDacgtunryWsmkhbvd\-\.]+$")
_PROTEIN_RE = re.compile(r"^[ACDEFGHIKLMNPQRSTVWY*acdefghiklmnpqrstvwy]+$")

def _validate_dna(seq: str, max_len: int = 500_000) -> str:
    seq = seq.strip().upper().replace(" ", "").replace("\n", "").replace("\r", "")
    if not seq:
        raise HTTPException(400, "Empty sequence")
    if len(seq) > max_len:
        raise HTTPException(400, f"Sequence too long ({len(seq)} > {max_len})")
    if not _DNA_RE.match(seq):
        raise HTTPException(400, "Invalid nucleotide characters")
    return seq

def _validate_protein(seq: str, max_len: int = 100_000) -> str:
    seq = seq.strip().upper().replace(" ", "").replace("\n", "").replace("\r", "")
    if not seq:
        raise HTTPException(400, "Empty sequence")
    if len(seq) > max_len:
        raise HTTPException(400, f"Sequence too long ({len(seq)} > {max_len})")
    if not _PROTEIN_RE.match(seq):
        raise HTTPException(400, "Invalid amino acid characters")
    return seq

def _require(dep_name: str, available: bool, install_hint: str):
    if not available:
        raise HTTPException(
            501,
            detail={
                "error": f"{dep_name} is not installed",
                "install": install_hint,
                "message": f"This endpoint requires {dep_name}. Install it and restart the server.",
            },
        )


# ###########################################################################
#  1. POST /api/compile - BioScript -> LLVM IR -> SBOL
# ###########################################################################

class CompileRequest(BaseModel):
    source: str = Field(..., description="BioScript source code")
    target: str = Field("all", description="Compilation target: llvm, sbol, or all")
    optimisation_level: int = Field(1, ge=0, le=3)

class CompileResponse(BaseModel):
    success: bool
    llvm_ir: Optional[str] = None
    sbol: Optional[str] = None
    parts: List[Dict[str, Any]] = []
    warnings: List[str] = []
    errors: List[str] = []
    compile_time_ms: float = 0.0


class _BioScriptCompiler:
    """Compiles BioScript source to LLVM IR and SBOL XML."""

    KEYWORDS = {
        "gene", "promoter", "rbs", "terminator", "circuit",
        "express", "repress", "activate", "regulate",
        "sequence", "protein", "part", "device",
    }

    def __init__(self, source: str, opt_level: int = 1):
        self.source = source
        self.opt_level = opt_level
        self.parts: List[Dict[str, Any]] = []
        self.warnings: List[str] = []
        self.errors: List[str] = []

    def _tokenise(self) -> List[Dict]:
        tokens = []
        i = 0
        src = self.source
        while i < len(src):
            if src[i] in " \t\r\n":
                i += 1
                continue
            if src[i] == "/" and i + 1 < len(src) and src[i + 1] == "/":
                while i < len(src) and src[i] != "\n":
                    i += 1
                continue
            if src[i] in ('"', "'"):
                q = src[i]
                i += 1
                start = i
                while i < len(src) and src[i] != q:
                    i += 1
                tokens.append({"type": "string", "value": src[start:i]})
                i += 1
                continue
            if src[i].isdigit():
                start = i
                while i < len(src) and (src[i].isdigit() or src[i] == "."):
                    i += 1
                tokens.append({"type": "number", "value": float(src[start:i])})
                continue
            if src[i].isalpha() or src[i] == "_":
                start = i
                while i < len(src) and (src[i].isalnum() or src[i] == "_"):
                    i += 1
                word = src[start:i]
                ttype = "keyword" if word.lower() in self.KEYWORDS else "ident"
                tokens.append({"type": ttype, "value": word.lower() if ttype == "keyword" else word})
                continue
            if src[i] in "{}();,=->:":
                tokens.append({"type": "punct", "value": src[i]})
                i += 1
                continue
            i += 1
        return tokens

    def _parse(self, tokens: List[Dict]):
        i = 0
        while i < len(tokens):
            t = tokens[i]
            if t["type"] == "keyword" and t["value"] in (
                "gene", "promoter", "rbs", "terminator", "part", "device",
            ):
                part_type = t["value"]
                i += 1
                name = tokens[i]["value"] if i < len(tokens) else "unnamed"
                i += 1
                seq = ""
                while i < len(tokens):
                    if tokens[i]["type"] == "string":
                        seq = tokens[i]["value"]
                        i += 1
                        break
                    elif tokens[i]["type"] == "punct" and tokens[i]["value"] == ";":
                        i += 1
                        break
                    elif tokens[i]["type"] == "punct" and tokens[i]["value"] == "{":
                        depth = 1
                        i += 1
                        block_tokens = []
                        while i < len(tokens) and depth > 0:
                            if tokens[i]["value"] == "{":
                                depth += 1
                            elif tokens[i]["value"] == "}":
                                depth -= 1
                            if depth > 0:
                                block_tokens.append(tokens[i])
                            i += 1
                        for bt in block_tokens:
                            if bt["type"] == "string":
                                seq = bt["value"]
                                break
                        break
                    else:
                        i += 1
                self.parts.append({
                    "type": part_type,
                    "name": name,
                    "sequence": seq.upper().replace(" ", ""),
                    "length": len(seq.replace(" ", "")),
                })
            elif t["type"] == "keyword" and t["value"] in ("express", "repress", "activate", "regulate"):
                i += 1
                source_name = tokens[i]["value"] if i < len(tokens) else ""
                i += 1
                while i < len(tokens) and tokens[i]["type"] == "punct":
                    i += 1
                target_name = tokens[i]["value"] if i < len(tokens) else ""
                i += 1
                self.parts.append({
                    "type": "interaction",
                    "kind": t["value"],
                    "source": source_name,
                    "target": target_name,
                })
            elif t["type"] == "keyword" and t["value"] == "circuit":
                i += 1
                name = tokens[i]["value"] if i < len(tokens) else "unnamed"
                i += 1
                self.parts.append({"type": "circuit", "name": name})
            else:
                i += 1

    def _emit_llvm_ir(self) -> str:
        lines = [
            "; SynBio Studio - LLVM IR output",
            "; Generated by BioScript compiler v2.0",
            f"; Optimisation level: O{self.opt_level}",
            f"; Parts: {len(self.parts)}",
            "",
            'target datalayout = "e-m:e-p270:32:32-p271:32:32-p272:64:64-i64:64-f80:128-n8:16:32:64-S128"',
            'target triple = "x86_64-unknown-linux-gnu"',
            "",
        ]

        for idx, part in enumerate(self.parts):
            if part.get("sequence"):
                seq = part["sequence"]
                lines.append(f'@.seq.{idx} = private unnamed_addr constant [{len(seq) + 1} x i8] c"{seq}\\00"')

        lines.append("")

        for idx, part in enumerate(self.parts):
            ptype = part.get("type", "unknown")
            name = part.get("name", "unnamed")
            lines.append(f"; Part {idx}: {ptype} '{name}'")

            if ptype in ("gene", "promoter", "rbs", "terminator", "part", "device"):
                seq_len = part.get("length", 0)
                lines.extend([
                    f"define void @part_{idx}_{name}() #0 {{",
                    f"  ; Type: {ptype}",
                    f"  ; Sequence length: {seq_len} bp",
                    f"  %seq_ptr = getelementptr [{seq_len + 1} x i8], [{seq_len + 1} x i8]* @.seq.{idx}, i64 0, i64 0" if seq_len > 0 else "  ; No sequence",
                    "  ret void",
                    "}",
                    "",
                ])
            elif ptype == "interaction":
                lines.extend([
                    f"define void @interaction_{idx}_{part.get('kind', 'unknown')}() #0 {{",
                    f"  ; {part.get('kind', '?')}: {part.get('source', '?')} -> {part.get('target', '?')}",
                    "  ret void",
                    "}",
                    "",
                ])
            elif ptype == "circuit":
                lines.extend([
                    f"define void @circuit_{name}() #0 {{",
                    "  ret void",
                    "}",
                    "",
                ])

        lines.extend([
            "attributes #0 = { noinline nounwind optnone }",
            "",
            '!llvm.module.flags = !{!0}',
            '!0 = !{i32 1, !"synbio-version", i32 2}',
        ])

        return "\n".join(lines)

    def _emit_sbol(self) -> str:
        ns = "http://sbols.org/v3#"
        lines = [
            '<?xml version="1.0" encoding="UTF-8"?>',
            f'<sbol:RDF xmlns:sbol="{ns}"',
            '          xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"',
            '          xmlns:dcterms="http://purl.org/dc/terms/"',
            '          xmlns:prov="http://www.w3.org/ns/prov#">',
            "",
        ]

        role_map = {
            "gene":       "http://identifiers.org/so/SO:0000704",
            "promoter":   "http://identifiers.org/so/SO:0000167",
            "rbs":        "http://identifiers.org/so/SO:0000139",
            "terminator": "http://identifiers.org/so/SO:0000141",
            "part":       "http://identifiers.org/so/SO:0000110",
            "device":     "http://identifiers.org/so/SO:0000804",
        }

        for part in self.parts:
            ptype = part.get("type", "")
            if ptype in role_map:
                name = part.get("name", "unnamed")
                role = role_map[ptype]
                seq = part.get("sequence", "")
                uri = f"https://synbiohub.org/user/synbio-studio/{name}"

                lines.extend([
                    f'  <sbol:Component rdf:about="{uri}">',
                    f'    <sbol:displayId>{name}</sbol:displayId>',
                    f'    <sbol:type rdf:resource="http://www.biopax.org/release/biopax-level3.owl#DnaRegion"/>',
                    f'    <sbol:role rdf:resource="{role}"/>',
                    f'    <dcterms:title>{name}</dcterms:title>',
                    f'    <dcterms:description>{ptype} part generated by SynBio Studio</dcterms:description>',
                ])
                if seq:
                    lines.extend([
                        '    <sbol:hasSequence>',
                        f'      <sbol:Sequence rdf:about="{uri}/seq">',
                        f'        <sbol:elements>{seq}</sbol:elements>',
                        '        <sbol:encoding rdf:resource="http://www.chem.qmul.ac.uk/iupac/misc/naseq.html"/>',
                        '      </sbol:Sequence>',
                        '    </sbol:hasSequence>',
                    ])
                lines.append('  </sbol:Component>')
                lines.append("")

        lines.append("</sbol:RDF>")
        return "\n".join(lines)

    def compile(self, target: str = "all") -> CompileResponse:
        t0 = time.perf_counter()
        tokens = self._tokenise()
        self._parse(tokens)

        if not self.parts:
            self.warnings.append("No parts found - source may be empty or unparseable")

        llvm_ir = self._emit_llvm_ir() if target in ("llvm", "all") else None
        sbol    = self._emit_sbol()    if target in ("sbol", "all") else None

        elapsed = (time.perf_counter() - t0) * 1000

        return CompileResponse(
            success=len(self.errors) == 0,
            llvm_ir=llvm_ir,
            sbol=sbol,
            parts=self.parts,
            warnings=self.warnings,
            errors=self.errors,
            compile_time_ms=round(elapsed, 2),
        )


@app.post("/api/compile", response_model=CompileResponse)
async def compile_bioscript(req: CompileRequest):
    """Compile BioScript source -> LLVM IR + SBOL XML."""
    if not req.source.strip():
        raise HTTPException(400, "Empty source")
    compiler = _BioScriptCompiler(req.source, req.optimisation_level)
    return compiler.compile(req.target)


# ###########################################################################
#  2. POST /api/simulate/ode - Deterministic ODE (scipy.integrate)
# ###########################################################################

class ODESpecies(BaseModel):
    name: str
    initial: float = Field(0.0, ge=0.0)

class ODEReaction(BaseModel):
    name: str
    reactants: Dict[str, int] = Field(default_factory=dict, description="species_name -> stoich coeff")
    products: Dict[str, int] = Field(default_factory=dict)
    rate_law: str = Field(..., description="Mathematical expression using species names, e.g. 'k1 * A'")

class ODERequest(BaseModel):
    species: List[ODESpecies]
    reactions: List[ODEReaction]
    parameters: Dict[str, float] = Field(default_factory=dict, description="Rate constants")
    t_start: float = 0.0
    t_end: float = 100.0
    n_points: int = Field(500, ge=10, le=50000)
    method: str = Field("RK45", description="Integrator: RK45, RK23, DOP853, Radau, BDF, LSODA")

class ODEResponse(BaseModel):
    success: bool
    time: List[float]
    trajectories: Dict[str, List[float]]
    message: str = ""


class SimulationJobRequest(BaseModel):
    kind: str = Field(..., description="ode or ssa")
    payload: Dict[str, Any] = Field(default_factory=dict)


# Allowed names in rate-law eval (restricted sandbox)
_SAFE_MATH = {
    "abs": abs, "min": min, "max": max,
    "exp": math.exp, "log": math.log, "log10": math.log10,
    "sqrt": math.sqrt, "pow": pow,
    "sin": math.sin, "cos": math.cos,
    "pi": math.pi, "e": math.e,
    "ceil": math.ceil, "floor": math.floor,
}

_FORBIDDEN_TOKENS = ("import", "__", "exec", "eval", "open", "os.", "sys.", "subprocess", "lambda")
_SAFE_IDENTIFIER = re.compile(r"^[A-Za-z_][A-Za-z0-9_]*$")
_ALLOWED_RATE_AST = (
    ast.Expression, ast.BinOp, ast.UnaryOp, ast.Call, ast.Name, ast.Load, ast.Constant,
    ast.Add, ast.Sub, ast.Mult, ast.Div, ast.Pow, ast.Mod, ast.USub, ast.UAdd,
    ast.Compare, ast.Lt, ast.LtE, ast.Gt, ast.GtE, ast.Eq, ast.NotEq, ast.IfExp,
)


def _compile_rate_law(expression: str, allowed_names: set[str], reaction_name: str):
    try:
        tree = ast.parse(expression, mode="eval")
    except SyntaxError as exc:
        raise HTTPException(400, f"Invalid rate_law syntax for {reaction_name}: {exc.msg}") from exc

    for node in ast.walk(tree):
        if not isinstance(node, _ALLOWED_RATE_AST):
            raise HTTPException(400, f"Unsupported construct in rate_law for {reaction_name}: {type(node).__name__}")
        if isinstance(node, ast.Name) and node.id not in allowed_names:
            raise HTTPException(400, f"Unknown name '{node.id}' in rate_law for {reaction_name}")
        if isinstance(node, ast.Call):
            if not isinstance(node.func, ast.Name) or node.func.id not in _SAFE_MATH or not callable(_SAFE_MATH[node.func.id]):
                raise HTTPException(400, f"Only approved math functions may be called in rate_law for {reaction_name}")
            if node.keywords:
                raise HTTPException(400, f"Keyword arguments are not allowed in rate_law for {reaction_name}")
        if isinstance(node, ast.Constant) and not isinstance(node.value, (int, float)):
            raise HTTPException(400, f"Only numeric constants are allowed in rate_law for {reaction_name}")

    return compile(tree, f"<rate_law:{reaction_name}>", "eval")


@app.post("/api/simulate/jobs")
async def create_simulation_job(req: SimulationJobRequest):
    """Create a background simulation job executed asynchronously on the Python backend."""
    kind = str(req.kind or "").lower().strip()
    if kind not in {"ode", "ssa"}:
        raise HTTPException(400, "Simulation job kind must be 'ode' or 'ssa'")

    _prune_simulation_jobs()
    job_id = f"sim-{kind}-{uuid4().hex[:12]}"
    SIMULATION_JOBS[job_id] = {
        "job_id": job_id,
        "kind": kind,
        "status": "queued",
        "created_at": time.time(),
        "started_at": None,
        "finished_at": None,
        "result": None,
        "error": None,
    }
    asyncio.create_task(_run_simulation_job(job_id, kind, dict(req.payload or {})))
    return {"success": True, "job_id": job_id, "kind": kind, "status": "queued"}


@app.get("/api/simulate/jobs/{job_id}")
async def get_simulation_job(job_id: str):
    """Retrieve status and result for a background simulation job."""
    _prune_simulation_jobs()
    job = SIMULATION_JOBS.get(job_id)
    if not job:
        raise HTTPException(404, f"Simulation job not found: {job_id}")
    return {"success": True, **job}


@app.post("/api/simulate/ode", response_model=ODEResponse)
async def simulate_ode(req: ODERequest):
    """Deterministic ODE simulation using scipy.integrate.solve_ivp."""
    _require("scipy", HAS_SCIPY, "pip install scipy")
    from scipy.integrate import solve_ivp

    species_names = [s.name for s in req.species]
    model_names = species_names + list(req.parameters.keys())
    invalid_names = [name for name in model_names if not _SAFE_IDENTIFIER.fullmatch(name) or "__" in name]
    if invalid_names:
        raise HTTPException(400, f"Invalid species or parameter identifier(s): {', '.join(invalid_names)}")
    reserved_names = sorted(set(model_names).intersection(_SAFE_MATH.keys() | {"t"}))
    if reserved_names:
        raise HTTPException(400, f"Species or parameter names collide with reserved math names: {', '.join(reserved_names)}")
    if len(set(species_names)) != len(species_names):
        raise HTTPException(400, "Species names must be unique")
    y0 = np.array([s.initial for s in req.species], dtype=np.float64)

    # Build stoichiometry matrix
    n_species = len(species_names)
    n_rxn = len(req.reactions)
    S = np.zeros((n_species, n_rxn), dtype=np.float64)

    for j, rxn in enumerate(req.reactions):
        for sp, coeff in rxn.reactants.items():
            if sp in species_names:
                S[species_names.index(sp), j] -= coeff
        for sp, coeff in rxn.products.items():
            if sp in species_names:
                S[species_names.index(sp), j] += coeff

    # Validate and compile rate laws
    rate_exprs = []
    allowed_rate_names = set(species_names) | set(req.parameters) | set(_SAFE_MATH) | {"t"}
    for rxn in req.reactions:
        raw = rxn.rate_law
        if any(kw in raw for kw in _FORBIDDEN_TOKENS):
            raise HTTPException(400, f"Forbidden construct in rate_law: {rxn.name}")
        rate_exprs.append(_compile_rate_law(raw, allowed_rate_names, rxn.name))

    def rhs(_t, y):
        env = {**_SAFE_MATH, **req.parameters, "t": _t}
        for k, name in enumerate(species_names):
            env[name] = max(y[k], 0.0)

        rates = np.zeros(n_rxn)
        for j, expr in enumerate(rate_exprs):
            try:
                rates[j] = float(eval(expr, {"__builtins__": {}}, env))  # noqa: S307 - AST-whitelisted expression
            except Exception:
                rates[j] = 0.0
        return S @ rates

    t_span = (req.t_start, req.t_end)
    t_eval = np.linspace(req.t_start, req.t_end, req.n_points)

    try:
        sol = solve_ivp(rhs, t_span, y0, method=req.method, t_eval=t_eval,
                        max_step=(req.t_end - req.t_start) / 100)
    except Exception as exc:
        raise HTTPException(500, f"Integration failed: {exc}")

    if not sol.success:
        return ODEResponse(success=False, time=[], trajectories={}, message=sol.message)

    trajectories = {}
    for i, name in enumerate(species_names):
        trajectories[name] = [round(float(v), 6) for v in sol.y[i]]

    return ODEResponse(
        success=True,
        time=[round(float(t), 6) for t in sol.t],
        trajectories=trajectories,
        message=f"Integrated with {req.method}, {len(sol.t)} points",
    )


# ###########################################################################
#  3. POST /api/simulate/ssa - Stochastic Simulation (Gillespie SSA)
# ###########################################################################

class SSASpecies(BaseModel):
    name: str
    initial: int = Field(0, ge=0)

class SSAReaction(BaseModel):
    name: str
    reactants: Dict[str, int] = Field(default_factory=dict)
    products: Dict[str, int] = Field(default_factory=dict)
    rate: float = Field(..., gt=0.0, description="Propensity rate constant")

class SSARequest(BaseModel):
    species: List[SSASpecies]
    reactions: List[SSAReaction]
    t_start: float = Field(0.0, ge=0.0)
    t_end: float = Field(100.0, gt=0.0)
    n_points: int = Field(501, ge=10, le=5000)
    n_trajectories: int = Field(1, ge=1, le=100)
    seed: Optional[int] = None
    algorithm: str = Field("SSA", description="SSA, TauLeaping, or TauHybrid")

class SSATrajectory(BaseModel):
    time: List[float]
    species: Dict[str, List[int]]

class SSASpeciesSummary(BaseModel):
    mean: List[float]
    std: List[float]
    min: List[int]
    max: List[int]
    final_mean: float
    final_std: float

class SSAAggregates(BaseModel):
    species: Dict[str, SSASpeciesSummary]

class SSAResponse(BaseModel):
    success: bool
    algorithm: str
    solver_used: str
    n_trajectories: int
    t_start: float
    t_end: float
    trajectories: List[SSATrajectory]
    aggregates: SSAAggregates
    warnings: List[str] = Field(default_factory=list)
    message: str = ""


def _simulate_builtin_ssa(req: SSARequest) -> SSAResponse:
    if req.algorithm != "SSA":
        raise HTTPException(503, f"{req.algorithm} requires a complete gillespy2 installation")

    species_names = [item.name for item in req.species]
    species_index = {name: index for index, name in enumerate(species_names)}
    sample_times = np.linspace(req.t_start, req.t_end, req.n_points)
    trajectories: List[SSATrajectory] = []
    event_cap = 1_000_000
    capped_runs = 0

    reaction_data = []
    for reaction in req.reactions:
        delta = np.zeros(len(species_names), dtype=np.int64)
        for name, stoichiometry in reaction.reactants.items():
            if name in species_index:
                delta[species_index[name]] -= int(stoichiometry)
        for name, stoichiometry in reaction.products.items():
            if name in species_index:
                delta[species_index[name]] += int(stoichiometry)
        reaction_data.append((reaction, delta))

    for replica in range(req.n_trajectories):
        seed = None if req.seed is None else int(req.seed) + replica
        rng = np.random.default_rng(seed)
        state = np.array([item.initial for item in req.species], dtype=np.int64)
        sampled = np.zeros((len(species_names), req.n_points), dtype=np.int64)
        sampled[:, 0] = state
        sample_index = 1
        current_time = float(req.t_start)
        event_count = 0

        while sample_index < req.n_points and event_count < event_cap:
            propensities = []
            for reaction, _delta in reaction_data:
                propensity = float(reaction.rate)
                for name, stoichiometry in reaction.reactants.items():
                    if name not in species_index:
                        propensity = 0.0
                        break
                    count = int(state[species_index[name]])
                    order = int(stoichiometry)
                    if count < order:
                        propensity = 0.0
                        break
                    propensity *= math.comb(count, order)
                propensities.append(max(0.0, propensity))

            total_propensity = float(sum(propensities))
            if total_propensity <= 0.0:
                sampled[:, sample_index:] = state[:, None]
                sample_index = req.n_points
                break

            event_time = current_time + float(rng.exponential(1.0 / total_propensity))
            while sample_index < req.n_points and sample_times[sample_index] <= event_time:
                sampled[:, sample_index] = state
                sample_index += 1
            if event_time > req.t_end:
                break

            threshold = float(rng.random()) * total_propensity
            cumulative = 0.0
            chosen = len(reaction_data) - 1
            for index, propensity in enumerate(propensities):
                cumulative += propensity
                if threshold <= cumulative:
                    chosen = index
                    break
            state = np.maximum(0, state + reaction_data[chosen][1])
            current_time = event_time
            event_count += 1

        if sample_index < req.n_points:
            sampled[:, sample_index:] = state[:, None]
        if event_count >= event_cap:
            capped_runs += 1

        trajectories.append(
            SSATrajectory(
                time=[round(float(value), 4) for value in sample_times],
                species={
                    name: [int(value) for value in sampled[index]]
                    for index, name in enumerate(species_names)
                },
            )
        )

    aggregates = {}
    for species in req.species:
        matrix = np.array([trajectory.species[species.name] for trajectory in trajectories], dtype=np.float64)
        aggregates[species.name] = SSASpeciesSummary(
            mean=[round(float(value), 4) for value in matrix.mean(axis=0)],
            std=[round(float(value), 4) for value in matrix.std(axis=0)],
            min=[int(value) for value in matrix.min(axis=0)],
            max=[int(value) for value in matrix.max(axis=0)],
            final_mean=round(float(matrix[:, -1].mean()), 4),
            final_std=round(float(matrix[:, -1].std()), 4),
        )

    warnings = ["gillespy2 unavailable or incomplete; used the built-in direct Gillespie SSA solver"]
    if capped_runs:
        warnings.append(f"{capped_runs} trajectory(ies) reached the {event_cap} event safety cap")
    return SSAResponse(
        success=True,
        algorithm="SSA",
        solver_used="SynBioDirectSSA",
        n_trajectories=len(trajectories),
        t_start=round(float(req.t_start), 4),
        t_end=round(float(req.t_end), 4),
        trajectories=trajectories,
        aggregates=SSAAggregates(species=aggregates),
        warnings=warnings,
        message=f"SSA completed with built-in solver, {len(trajectories)} trajectory(ies), {req.n_points} sampled points",
    )


@app.post("/api/simulate/ssa", response_model=SSAResponse)
async def simulate_ssa(req: SSARequest):
    """Stochastic simulation using gillespy2 (Gillespie SSA, Tau-Leaping)."""
    if not HAS_GILLESPY2:
        return _simulate_builtin_ssa(req)
    gillespy2 = importlib.import_module("gillespy2")
    warnings: List[str] = []

    if req.t_end <= req.t_start:
        raise HTTPException(400, "t_end must be greater than t_start")

    model = gillespy2.Model(name="SynBioModel")

    sp_map = {}
    for sp in req.species:
        g_sp = gillespy2.Species(name=sp.name, initial_value=sp.initial)
        model.add_species(g_sp)
        sp_map[sp.name] = g_sp

    param_map = {}
    for rxn in req.reactions:
        p = gillespy2.Parameter(name=f"k_{rxn.name}", expression=str(rxn.rate))
        model.add_parameter(p)
        param_map[rxn.name] = p

    for rxn in req.reactions:
        reactant_dict = {sp_map[s]: c for s, c in rxn.reactants.items() if s in sp_map}
        product_dict = {sp_map[s]: c for s, c in rxn.products.items() if s in sp_map}
        g_rxn = gillespy2.Reaction(
            name=rxn.name,
            reactants=reactant_dict,
            products=product_dict,
            rate=param_map[rxn.name],
        )
        model.add_reaction(g_rxn)

    model.timespan(np.linspace(req.t_start, req.t_end, req.n_points))

    # Choose solver
    algo_map = {
        "SSA": getattr(gillespy2, "SSACSolver", gillespy2.NumPySSASolver),
        "TauLeaping": getattr(gillespy2, "TauLeapingSolver", None),
        "TauHybrid": getattr(gillespy2, "TauHybridSolver", None),
    }
    if req.algorithm not in algo_map:
        raise HTTPException(400, f"Unknown SSA algorithm: {req.algorithm}")

    solver = algo_map[req.algorithm]
    if solver is None:
        raise HTTPException(503, f"Algorithm not available in installed gillespy2 build: {req.algorithm}")

    solver_used = getattr(solver, "__name__", req.algorithm)
    try:
        results = model.run(
            number_of_trajectories=req.n_trajectories,
            solver=solver,
            seed=req.seed,
        )
    except Exception as exc:
        fallback_solver = getattr(gillespy2, "NumPySSASolver", None)
        can_fallback = req.algorithm == "SSA" and fallback_solver is not None and solver is not fallback_solver
        if not can_fallback:
            raise HTTPException(500, f"SSA simulation failed: {exc}")

        warnings.append(f"Primary gillespy2 solver failed; using NumPySSASolver fallback. Root cause: {exc}")
        solver_used = getattr(fallback_solver, "__name__", "NumPySSASolver")
        try:
            results = model.run(
                number_of_trajectories=req.n_trajectories,
                solver=fallback_solver,
                seed=req.seed,
            )
        except Exception as fallback_exc:
            raise HTTPException(500, f"SSA simulation failed after fallback: {fallback_exc}")

    out_trajs = []
    if hasattr(results, "data") and isinstance(results.data, list):
        result_list = results.data
    elif isinstance(results, list):
        result_list = results
    else:
        result_list = [results]
    for traj in result_list:
        time_arr = [round(float(t), 4) for t in traj["time"]]
        sp_data = {}
        for sp in req.species:
            sp_data[sp.name] = [int(round(float(v))) for v in traj[sp.name]]
        out_trajs.append(SSATrajectory(time=time_arr, species=sp_data))

    aggregates = {}
    for sp in req.species:
        matrix = np.array([traj.species[sp.name] for traj in out_trajs], dtype=np.float64)
        aggregates[sp.name] = SSASpeciesSummary(
            mean=[round(float(v), 4) for v in matrix.mean(axis=0)],
            std=[round(float(v), 4) for v in matrix.std(axis=0)],
            min=[int(v) for v in matrix.min(axis=0)],
            max=[int(v) for v in matrix.max(axis=0)],
            final_mean=round(float(matrix[:, -1].mean()), 4),
            final_std=round(float(matrix[:, -1].std()), 4),
        )

    return SSAResponse(
        success=True,
        algorithm=req.algorithm,
        solver_used=solver_used,
        n_trajectories=len(out_trajs),
        t_start=round(float(req.t_start), 4),
        t_end=round(float(req.t_end), 4),
        trajectories=out_trajs,
        aggregates=SSAAggregates(species=aggregates),
        warnings=warnings,
        message=f"{req.algorithm} completed with gillespy2, solver={solver_used}, {len(out_trajs)} trajectory(ies), {req.n_points} sampled points",
    )


# ###########################################################################
#  4. POST /api/blast/local - Local BLAST+ search
# ###########################################################################

class BlastRequest(BaseModel):
    query: str = Field(..., description="FASTA-format or raw sequence")
    program: str = Field("blastn", description="blastn, blastp, blastx, tblastn, tblastx")
    database: str = Field("nt", description="BLAST database name or path")
    evalue: float = Field(1e-5, gt=0)
    max_hits: int = Field(50, ge=1, le=500)
    word_size: Optional[int] = None

class BlastHit(BaseModel):
    accession: str
    title: str
    evalue: float
    bit_score: float
    identity_pct: float
    query_cover_pct: float
    alignment_length: int
    mismatches: int
    gaps: int
    query_start: int
    query_end: int
    subject_start: int
    subject_end: int

class BlastResponse(BaseModel):
    success: bool
    program: str
    database: str
    hits: List[BlastHit]
    query_length: int
    message: str = ""


@app.post("/api/blast/local", response_model=BlastResponse)
async def blast_local(req: BlastRequest):
    """Run a local BLAST+ search via subprocess."""
    allowed_programs = {"blastn", "blastp", "blastx", "tblastn", "tblastx"}
    if req.program not in allowed_programs:
        raise HTTPException(400, f"Invalid BLAST program: {req.program}")

    tool_path = shutil.which(req.program)
    if not tool_path:
        raise HTTPException(
            501,
            f"{req.program} not found in PATH. Install BLAST+ from https://blast.ncbi.nlm.nih.gov/",
        )

    # Write query to temp file
    with tempfile.NamedTemporaryFile(mode="w", suffix=".fasta", delete=False) as qf:
        query_text = req.query.strip()
        if not query_text.startswith(">"):
            query_text = f">query\n{query_text}"
        qf.write(query_text)
        query_file = qf.name

    # Build command - all arguments explicitly parameterised (no shell)
    cmd = [
        tool_path,
        "-query", query_file,
        "-db", req.database,
        "-evalue", str(req.evalue),
        "-max_target_seqs", str(req.max_hits),
        "-outfmt", "6 saccver stitle evalue bitscore pident qcovs length mismatch gapopen qstart qend sstart send",
    ]
    if req.word_size:
        cmd.extend(["-word_size", str(req.word_size)])

    try:
        proc = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=300)
    except asyncio.TimeoutError:
        raise HTTPException(504, "BLAST search timed out (>5 min)")
    except Exception as exc:
        raise HTTPException(500, f"Failed to run BLAST: {exc}")
    finally:
        Path(query_file).unlink(missing_ok=True)

    if proc.returncode != 0:
        err_msg = stderr.decode(errors="replace").strip()
        raise HTTPException(500, f"BLAST error (exit {proc.returncode}): {err_msg}")

    # Parse tabular output
    hits = []
    raw_query = req.query.strip()
    query_seq = raw_query.split("\n", 1)[-1].replace("\n", "") if raw_query.startswith(">") else raw_query
    query_length = len(query_seq.replace(" ", ""))

    for line in stdout.decode(errors="replace").strip().split("\n"):
        if not line.strip():
            continue
        cols = line.split("\t")
        if len(cols) < 13:
            continue
        try:
            hits.append(BlastHit(
                accession=cols[0],
                title=cols[1][:200],
                evalue=float(cols[2]),
                bit_score=float(cols[3]),
                identity_pct=float(cols[4]),
                query_cover_pct=float(cols[5]) if cols[5] != "N/A" else 0.0,
                alignment_length=int(cols[6]),
                mismatches=int(cols[7]),
                gaps=int(cols[8]),
                query_start=int(cols[9]),
                query_end=int(cols[10]),
                subject_start=int(cols[11]),
                subject_end=int(cols[12]),
            ))
        except (ValueError, IndexError):
            continue

    return BlastResponse(
        success=True,
        program=req.program,
        database=req.database,
        hits=hits,
        query_length=query_length,
        message=f"{len(hits)} hit(s) found",
    )


# ###########################################################################
#  5. POST /api/alignment/msa - Multiple Sequence Alignment
# ###########################################################################

class MSARequest(BaseModel):
    sequences: Dict[str, str] = Field(..., description="name -> sequence")
    tool: str = Field("muscle", description="muscle or clustalo")
    output_format: str = Field("fasta", description="fasta, clustal, msf")

class MSAResponse(BaseModel):
    success: bool
    alignment: str
    tool_used: str
    n_sequences: int
    alignment_length: int
    message: str = ""


@app.post("/api/alignment/msa", response_model=MSAResponse)
async def alignment_msa(req: MSARequest):
    """Run MSA using MUSCLE or ClustalOmega via subprocess."""
    if len(req.sequences) < 2:
        raise HTTPException(400, "At least 2 sequences required for alignment")

    # Pick tool with fallback
    if req.tool == "muscle":
        tool_path = shutil.which("muscle")
        if not tool_path:
            tool_path = shutil.which("clustalo")
            if not tool_path:
                raise HTTPException(501, "Neither MUSCLE nor ClustalOmega found in PATH")
            req.tool = "clustalo"
    else:
        tool_path = shutil.which("clustalo")
        if not tool_path:
            tool_path = shutil.which("muscle")
            if not tool_path:
                raise HTTPException(501, "Neither ClustalOmega nor MUSCLE found in PATH")
            req.tool = "muscle"

    # Write input FASTA
    with tempfile.NamedTemporaryFile(mode="w", suffix=".fasta", delete=False) as f:
        for name, seq in req.sequences.items():
            safe_name = re.sub(r"[^a-zA-Z0-9_\-]", "_", name)[:80]
            f.write(f">{safe_name}\n{seq}\n")
        input_file = f.name

    output_file = input_file + ".aln"

    if req.tool == "muscle":
        cmd = [tool_path, "-align", input_file, "-output", output_file]
    else:
        fmt_map = {"fasta": "fasta", "clustal": "clu", "msf": "msf"}
        out_fmt = fmt_map.get(req.output_format, "fasta")
        cmd = [tool_path, "-i", input_file, "-o", output_file, f"--outfmt={out_fmt}", "--force"]

    try:
        proc = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        _, stderr_data = await asyncio.wait_for(proc.communicate(), timeout=120)
    except asyncio.TimeoutError:
        raise HTTPException(504, "MSA timed out (>2 min)")
    except Exception as exc:
        raise HTTPException(500, f"MSA failed: {exc}")
    finally:
        Path(input_file).unlink(missing_ok=True)

    if proc.returncode != 0 or not Path(output_file).exists():
        Path(output_file).unlink(missing_ok=True)
        err_msg = stderr_data.decode(errors="replace").strip() if stderr_data else "Unknown error"
        raise HTTPException(500, f"MSA error: {err_msg}")

    alignment_text = Path(output_file).read_text()
    Path(output_file).unlink(missing_ok=True)

    # Compute alignment length
    aln_len = 0
    for line in alignment_text.split("\n"):
        if line.startswith(">"):
            if aln_len > 0:
                break
            continue
        aln_len += len(line.strip())

    return MSAResponse(
        success=True,
        alignment=alignment_text,
        tool_used=req.tool,
        n_sequences=len(req.sequences),
        alignment_length=aln_len,
        message=f"Alignment completed with {req.tool}",
    )


# ###########################################################################
#  6. POST /api/structure/rnafold - RNA secondary structure
# ###########################################################################

class RNAFoldRequest(BaseModel):
    sequence: str
    temperature: float = Field(37.0, ge=0.0, le=100.0)
    constraint: Optional[str] = Field(None, description="Dot-bracket structure constraint")
    partition_function: bool = Field(False, description="Also compute partition function")
    suboptimal: bool = Field(False, description="Compute suboptimal structures")
    subopt_energy_range: float = Field(5.0, ge=0.1, le=50.0)

class RNASubstructure(BaseModel):
    structure: str
    energy: float

class RNAFoldResponse(BaseModel):
    sequence: str
    mfe_structure: str
    mfe: float
    ensemble_energy: Optional[float] = None
    ensemble_diversity: Optional[float] = None
    centroid_structure: Optional[str] = None
    centroid_energy: Optional[float] = None
    base_pair_probabilities: Optional[List[List[float]]] = None
    suboptimal: List[RNASubstructure] = []
    warnings: List[str] = []


class ESMFoldConfidenceBand(BaseModel):
    average_plddt: float
    very_high: int
    high: int
    low: int
    very_low: int


class ESMFoldResidueConfidence(BaseModel):
    residue: int
    plddt: float


class ESMFoldSecondaryStructure(BaseModel):
    helix: int
    sheet: int
    coil: int
    total: int
    helix_fraction: float
    sheet_fraction: float
    coil_fraction: float


class ESMFoldProteinProperties(BaseModel):
    length: int
    molecular_weight: float
    isoelectric_point: float
    charge: int
    hydropathy_index: float
    extinction_coefficient_reduced: int
    extinction_coefficient_oxidized: int
    instability_index: float
    aromaticity: float
    composition: Dict[str, int]


class ESMFoldRequest(BaseModel):
    sequence: str
    sequence_name: Optional[str] = Field(None, description="Optional protein identifier")


class ESMFoldResponse(BaseModel):
    sequence_name: str
    sequence: str
    sequence_length: int
    model: str
    source: str
    pdb_data: str
    confidence: ESMFoldConfidenceBand
    residue_confidence: List[ESMFoldResidueConfidence]
    secondary_structure: ESMFoldSecondaryStructure
    properties: ESMFoldProteinProperties
    interpretation: str


def _nussinov_fold(seq: str) -> Tuple[str, int]:
    """Nussinov dynamic programming for RNA secondary structure (fallback)."""
    n = len(seq)
    if n > 5000:
        seq = seq[:5000]
        n = 5000

    pairs = {("A", "U"), ("U", "A"), ("G", "C"), ("C", "G"), ("G", "U"), ("U", "G")}
    MIN_LOOP = 3

    dp = [[0] * n for _ in range(n)]

    for span in range(MIN_LOOP + 1, n):
        for i in range(n - span):
            j = i + span
            dp[i][j] = dp[i + 1][j]
            dp[i][j] = max(dp[i][j], dp[i][j - 1])
            if (seq[i], seq[j]) in pairs:
                val = (dp[i + 1][j - 1] if i + 1 <= j - 1 else 0) + 1
                dp[i][j] = max(dp[i][j], val)
            for k in range(i + 1, j):
                dp[i][j] = max(dp[i][j], dp[i][k] + dp[k + 1][j])

    # Traceback
    structure = ["."] * n

    def traceback(i, j):
        if i >= j:
            return
        if dp[i][j] == dp[i + 1][j]:
            traceback(i + 1, j)
        elif dp[i][j] == dp[i][j - 1]:
            traceback(i, j - 1)
        elif (seq[i], seq[j]) in pairs and dp[i][j] == (dp[i + 1][j - 1] if i + 1 <= j - 1 else 0) + 1:
            structure[i] = "("
            structure[j] = ")"
            traceback(i + 1, j - 1)
        else:
            for k in range(i + 1, j):
                if dp[i][j] == dp[i][k] + dp[k + 1][j]:
                    traceback(i, k)
                    traceback(k + 1, j)
                    break

    traceback(0, n - 1)
    return "".join(structure), dp[0][n - 1]


@app.post("/api/structure/rnafold", response_model=RNAFoldResponse)
async def structure_rnafold(req: RNAFoldRequest):
    """RNA secondary structure prediction via ViennaRNA or Nussinov fallback."""
    seq = _validate_dna(req.sequence, max_len=50000).replace("T", "U")
    warnings: List[str] = []

    # -- ViennaRNA Python binding --
    if HAS_VIENNA:
        RNA = importlib.import_module("RNA")

        md = RNA.md()
        md.temperature = req.temperature

        fc = RNA.fold_compound(seq, md)
        mfe_struct, mfe = fc.mfe()

        result = RNAFoldResponse(
            sequence=seq,
            mfe_structure=mfe_struct,
            mfe=round(mfe, 2),
            warnings=warnings,
        )

        if req.partition_function:
            pf_struct, pf_energy = fc.pf()
            result.ensemble_energy = round(pf_energy, 2)
            centroid = fc.centroid()
            if centroid and len(centroid) >= 2:
                result.centroid_structure = centroid[0]
                result.centroid_energy = round(centroid[1], 2)
            result.ensemble_diversity = round(fc.mean_bp_distance(), 2)

        if req.suboptimal:
            subopts = RNA.subopt(fc, int(req.subopt_energy_range * 100))
            if subopts:
                result.suboptimal = [
                    RNASubstructure(structure=s.structure, energy=round(s.energy, 2))
                    for s in subopts[:200]
                ]

        return result

    # -- CLI fallback: RNAfold --
    rnafold_path = shutil.which("RNAfold")
    if rnafold_path:
        warnings.append("Using RNAfold CLI (no Python binding)")
        cmd = [rnafold_path, "-T", str(req.temperature), "--noPS"]
        if req.partition_function:
            cmd.append("-p")

        try:
            proc = await asyncio.create_subprocess_exec(
                *cmd,
                stdin=asyncio.subprocess.PIPE,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )
            stdout, _ = await asyncio.wait_for(
                proc.communicate(input=seq.encode()), timeout=60,
            )
        except asyncio.TimeoutError:
            raise HTTPException(504, "RNAfold timed out")
        except Exception as exc:
            raise HTTPException(500, f"RNAfold failed: {exc}")

        lines = stdout.decode().strip().split("\n")
        mfe_struct = ""
        mfe_val = 0.0
        for line in lines:
            m = re.search(r"([.\(\)]+)\s+\(\s*(-?[\d.]+)\s*\)", line)
            if m:
                mfe_struct = m.group(1)
                mfe_val = float(m.group(2))
                break

        return RNAFoldResponse(
            sequence=seq,
            mfe_structure=mfe_struct,
            mfe=round(mfe_val, 2),
            warnings=warnings,
        )

    # -- Pure-Python Nussinov fallback --
    warnings.append("ViennaRNA not installed - using Nussinov algorithm (approximate)")
    mfe_struct, n_pairs = _nussinov_fold(seq)

    return RNAFoldResponse(
        sequence=seq,
        mfe_structure=mfe_struct,
        mfe=round(-1.5 * n_pairs, 2),
        warnings=warnings,
    )


@app.post("/api/structure/esmfold", response_model=ESMFoldResponse)
async def structure_esmfold(req: ESMFoldRequest):
    """Protein structure prediction using Meta's public ESMFold API."""
    _require("ESMFold integration", HAS_ESMFOLD_INTEGRATION, "install the optional structure dependencies")
    _require("httpx", HAS_HTTPX, "pip install httpx")
    protein = _validate_protein(req.sequence, max_len=ESMFOLD_MAX_LENGTH)
    httpx = importlib.import_module("httpx")

    try:
        pdb_text = await fetch_esmfold_pdb(protein, httpx)
    except ValueError as err:
        raise HTTPException(400, str(err)) from err
    except httpx.TimeoutException:
        raise HTTPException(504, "ESMFold API timed out")
    except httpx.HTTPStatusError as exc:
        raise HTTPException(exc.response.status_code, f"ESMFold API error: {exc.response.text[:300]}") from exc
    except Exception as err:
        raise HTTPException(502, f"Failed to reach ESMFold API: {err}") from err

    residue_confidence = parse_pdb_confidence(pdb_text)
    confidence_summary = summarise_confidence(residue_confidence)
    secondary_structure = parse_secondary_structure(pdb_text)
    properties = analyze_protein_properties(protein)
    interpretation = interpret_structure(confidence_summary, secondary_structure)

    return ESMFoldResponse(
        sequence_name=req.sequence_name or "Unnamed protein",
        sequence=protein,
        sequence_length=len(protein),
        model="ESMFold v1",
        source="Meta ESM Atlas",
        pdb_data=pdb_text,
        confidence=ESMFoldConfidenceBand(**confidence_summary),
        residue_confidence=[ESMFoldResidueConfidence(**item) for item in residue_confidence],
        secondary_structure=ESMFoldSecondaryStructure(**secondary_structure),
        properties=ESMFoldProteinProperties(**properties),
        interpretation=interpretation,
    )


# ###########################################################################
#  7. POST /api/fba - Flux Balance Analysis (COBRApy)
# ###########################################################################

class FBAReaction(BaseModel):
    id: str
    name: str = ""
    metabolites: Dict[str, float] = Field(..., description="metabolite_id -> stoich coefficient")
    lower_bound: float = 0.0
    upper_bound: float = 1000.0
    objective_coefficient: float = 0.0

class FBARequest(BaseModel):
    reactions: List[FBAReaction] = Field(default_factory=list)
    objective: Optional[str] = Field(None, description="Reaction ID to maximise")
    model_id: Optional[str] = Field(None, description="Genome-scale model: e_coli_core, iJO1366, iML1515, textbook")
    substrate: Optional[str] = Field(None, description="Primary substrate exchange reaction ID")
    substrate_uptake: float = Field(10.0, ge=0.0, le=1000.0, description="Absolute substrate uptake bound")
    oxygen_exchange: Optional[str] = Field(None, description="Oxygen exchange reaction ID")
    oxygen_uptake: Optional[float] = Field(20.0, ge=0.0, le=1000.0, description="Absolute oxygen uptake bound")
    knockouts: List[str] = Field(default_factory=list, description="Gene or reaction IDs to knock out")
    medium_overrides: Dict[str, float] = Field(default_factory=dict, description="Exchange reaction overrides: reaction_id -> uptake")
    include_all_fluxes: bool = Field(False, description="Return all fluxes instead of only the top-magnitude subset")
    top_n_fluxes: int = Field(150, ge=1, le=5000, description="Top absolute fluxes to return for large models")
    top_n_shadow_prices: int = Field(100, ge=1, le=5000, description="Top absolute shadow prices to return")

class FBAFlux(BaseModel):
    reaction_id: str
    reaction_name: str
    flux: float
    reduced_cost: float

class FBAShadowPrice(BaseModel):
    metabolite_id: str
    shadow_price: float

class FBAResponse(BaseModel):
    success: bool
    status: str
    objective_value: float
    fluxes: List[FBAFlux]
    shadow_prices: List[FBAShadowPrice]
    model_id: Optional[str] = None
    model_source: str = ""
    objective_reaction: Optional[str] = None
    applied_knockouts: List[str] = Field(default_factory=list)
    medium: Dict[str, float] = Field(default_factory=dict)
    reaction_count: int = 0
    metabolite_count: int = 0
    gene_count: int = 0
    summary: str = ""


async def _download_fba_model_json(model_id: str, target_path: Path) -> Path:
    meta = FBA_MODEL_CATALOG[model_id]
    if not HAS_HTTPX:
        raise HTTPException(503, f"Model {model_id} not available locally and httpx is missing for download")

    httpx = importlib.import_module("httpx")
    target_path.parent.mkdir(parents=True, exist_ok=True)
    tmp_path = target_path.with_suffix(target_path.suffix + ".download")

    try:
        async with httpx.AsyncClient(timeout=180.0, follow_redirects=True) as client:
            response = await client.get(meta["download_url"])
            response.raise_for_status()
            tmp_path.write_bytes(response.content)
            tmp_path.replace(target_path)
            logger.info("Downloaded FBA model %s to %s", model_id, target_path)
    except Exception as exc:
        if tmp_path.exists():
            tmp_path.unlink(missing_ok=True)
        raise HTTPException(502, f"Failed to download model {model_id}: {exc}")

    return target_path


async def _resolve_fba_model_path(model_id: str) -> Tuple[Path, str]:
    meta = FBA_MODEL_CATALOG.get(model_id)
    if not meta:
        raise HTTPException(400, f"Unknown genome-scale model: {model_id}")

    FBA_MODELS_DIR.mkdir(parents=True, exist_ok=True)
    model_path = FBA_MODELS_DIR / meta["json_name"]
    if model_path.exists():
        return model_path, "local-cache"

    model_path = await _download_fba_model_json(model_id, model_path)
    return model_path, "downloaded"


async def _load_fba_model(req: FBARequest, cobra_module: Any) -> Tuple[Any, str, Optional[str]]:
    model_id = req.model_id or ""
    cobra_io = importlib.import_module("cobra.io")

    if model_id == "textbook":
        load_model = getattr(cobra_io, "load_model")
        model = await asyncio.to_thread(load_model, "textbook")
        return model, "cobra.io", model_id

    if model_id:
        cache_key = f"named::{model_id}"
        if cache_key in FBA_MODEL_CACHE:
            return FBA_MODEL_CACHE[cache_key].copy(), "memory-cache", model_id

        load_model = getattr(cobra_io, "load_model", None)
        if load_model is not None:
            try:
                model = await asyncio.to_thread(load_model, model_id)
                if model_id in FBA_MODEL_CATALOG:
                    model_path = FBA_MODELS_DIR / FBA_MODEL_CATALOG[model_id]["json_name"]
                    if not model_path.exists():
                        try:
                            save_json_model = getattr(cobra_io, "save_json_model", None)
                            if save_json_model is not None:
                                model_path.parent.mkdir(parents=True, exist_ok=True)
                                await asyncio.to_thread(save_json_model, model, str(model_path))
                        except Exception as exc:
                            logger.warning("Could not persist local JSON cache for %s: %s", model_id, exc)
                FBA_MODEL_CACHE[cache_key] = model
                return model.copy(), "cobra.io", model_id
            except Exception as exc:
                logger.warning("cobra.io.load_model(%s) failed, falling back to JSON loading: %s", model_id, exc)

        load_json_model = getattr(cobra_io, "load_json_model")
        model_path, source = await _resolve_fba_model_path(model_id)
        model = await asyncio.to_thread(load_json_model, str(model_path))
        FBA_MODEL_CACHE[cache_key] = model
        return model.copy(), source, model_id

    if not req.reactions:
        raise HTTPException(400, "No reactions provided and no model_id specified")

    model = cobra_module.Model("custom_model")
    all_mets = set()
    for rxn_def in req.reactions:
        all_mets.update(rxn_def.metabolites.keys())

    met_objects = {mid: cobra_module.Metabolite(mid) for mid in all_mets}
    model.add_metabolites(list(met_objects.values()))

    for rxn_def in req.reactions:
        rxn = cobra_module.Reaction(rxn_def.id)
        rxn.name = rxn_def.name or rxn_def.id
        rxn.lower_bound = rxn_def.lower_bound
        rxn.upper_bound = rxn_def.upper_bound
        rxn.add_metabolites({met_objects[m]: c for m, c in rxn_def.metabolites.items()})
        rxn.objective_coefficient = rxn_def.objective_coefficient
        model.add_reactions([rxn])

    return model, "custom-network", None


def _apply_exchange_bound(model: Any, reaction_id: str, uptake: float) -> float:
    try:
        reaction = model.reactions.get_by_id(reaction_id)
    except KeyError as exc:
        raise HTTPException(400, f"Exchange reaction not found: {reaction_id}") from exc

    uptake = abs(float(uptake))
    reaction.lower_bound = -uptake
    return uptake


def _select_fluxes(model: Any, solution: Any, include_all: bool, limit: int) -> List[FBAFlux]:
    reactions = list(model.reactions)
    if not include_all:
        reactions = sorted(reactions, key=lambda rxn: abs(float(solution.fluxes[rxn.id])), reverse=True)[:limit]

    return [
        FBAFlux(
            reaction_id=rxn.id,
            reaction_name=rxn.name,
            flux=round(float(solution.fluxes[rxn.id]), 6),
            reduced_cost=round(float(solution.reduced_costs.get(rxn.id, 0.0)), 6) if hasattr(solution, "reduced_costs") else 0.0,
        )
        for rxn in reactions
    ]


def _select_shadow_prices(model: Any, solution: Any, limit: int) -> List[FBAShadowPrice]:
    if not hasattr(solution, "shadow_prices"):
        return []

    metabolites = sorted(
        model.metabolites,
        key=lambda met: abs(float(solution.shadow_prices.get(met.id, 0.0))),
        reverse=True,
    )[:limit]
    return [
        FBAShadowPrice(
            metabolite_id=met.id,
            shadow_price=round(float(solution.shadow_prices.get(met.id, 0.0)), 6),
        )
        for met in metabolites
    ]


@app.post("/api/fba", response_model=FBAResponse)
async def flux_balance_analysis(req: FBARequest):
    """Flux Balance Analysis using COBRApy with a real LP solver."""
    _require("cobra", HAS_COBRA, "pip install cobra")
    cobra = importlib.import_module("cobra")

    model, model_source, resolved_model_id = await _load_fba_model(req, cobra)
    objective_reaction = req.objective
    applied_medium: Dict[str, float] = {}
    applied_knockouts: List[str] = []

    try:
        with model:
            if resolved_model_id and not objective_reaction:
                objective_reaction = FBA_MODEL_CATALOG.get(resolved_model_id, {}).get("default_objective")

            if objective_reaction:
                try:
                    model.reactions.get_by_id(objective_reaction)
                except KeyError as exc:
                    raise HTTPException(400, f"Objective reaction not found: {objective_reaction}") from exc
                model.objective = objective_reaction

            substrate_rxn = req.substrate
            oxygen_rxn = req.oxygen_exchange
            if resolved_model_id in FBA_MODEL_CATALOG:
                substrate_rxn = substrate_rxn or FBA_MODEL_CATALOG[resolved_model_id]["default_substrate"]
                oxygen_rxn = oxygen_rxn or FBA_MODEL_CATALOG[resolved_model_id]["default_oxygen"]

            if substrate_rxn:
                applied_medium[substrate_rxn] = _apply_exchange_bound(model, substrate_rxn, req.substrate_uptake)

            if oxygen_rxn and req.oxygen_uptake is not None:
                applied_medium[oxygen_rxn] = _apply_exchange_bound(model, oxygen_rxn, req.oxygen_uptake)

            for exchange_id, uptake in req.medium_overrides.items():
                applied_medium[exchange_id] = _apply_exchange_bound(model, exchange_id, uptake)

            invalid_knockouts = []
            for target in req.knockouts:
                try:
                    model.genes.get_by_id(target).knock_out()
                    applied_knockouts.append(target)
                    continue
                except KeyError:
                    pass

                try:
                    model.reactions.get_by_id(target).knock_out()
                    applied_knockouts.append(target)
                    continue
                except KeyError:
                    invalid_knockouts.append(target)

            if invalid_knockouts:
                raise HTTPException(400, f"Unknown knockout targets: {', '.join(invalid_knockouts)}")

            solution = await asyncio.to_thread(model.optimize)
            reaction_count = len(model.reactions)
            metabolite_count = len(model.metabolites)
            gene_count = len(model.genes)
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(500, f"FBA solver failed: {exc}")

    if solution.status != "optimal":
        return FBAResponse(
            success=False,
            status=solution.status,
            objective_value=0.0,
            fluxes=[],
            shadow_prices=[],
            model_id=resolved_model_id,
            model_source=model_source,
            objective_reaction=objective_reaction,
            applied_knockouts=applied_knockouts,
            medium=applied_medium,
            reaction_count=reaction_count,
            metabolite_count=metabolite_count,
            gene_count=gene_count,
            summary=f"Solver status: {solution.status}",
        )

    fluxes = _select_fluxes(model, solution, req.include_all_fluxes, req.top_n_fluxes)
    shadow_prices = _select_shadow_prices(model, solution, req.top_n_shadow_prices)

    nonzero_flux_count = int((abs(solution.fluxes) > 1e-8).sum()) if hasattr(solution.fluxes, "sum") else 0
    summary = (
        f"Optimal value: {round(float(solution.objective_value), 6)} | "
        f"{nonzero_flux_count}/{reaction_count} non-zero fluxes | "
        f"model={resolved_model_id or 'custom'} source={model_source}"
    )

    return FBAResponse(
        success=True,
        status="optimal",
        objective_value=round(float(solution.objective_value), 6),
        fluxes=fluxes,
        shadow_prices=shadow_prices,
        model_id=resolved_model_id,
        model_source=model_source,
        objective_reaction=objective_reaction,
        applied_knockouts=applied_knockouts,
        medium=applied_medium,
        reaction_count=reaction_count,
        metabolite_count=metabolite_count,
        gene_count=gene_count,
        summary=summary,
    )


# ###########################################################################
#  8. POST /api/synthesize/complexity - Synthesis complexity analysis
# ###########################################################################

class SynthesisIssue(BaseModel):
    type: str
    severity: str  # error | warning | info
    position: Optional[int] = None
    length: Optional[int] = None
    description: str

class SynthesisRequest(BaseModel):
    sequence: str
    vendor: str = Field("generic", description="generic, twist, idt, geneart")

class SynthesisResponse(BaseModel):
    sequence_length: int
    gc_content: float
    complexity_score: float  # 0 (trivial) to 1 (very hard)
    estimated_cost_usd: Optional[float] = None
    estimated_days: Optional[int] = None
    synthesisable: bool
    issues: List[SynthesisIssue]
    fragments: List[Dict[str, Any]] = []
    restriction_sites: Dict[str, int] = {}


RESTRICTION_SITES = {
    "EcoRI": "GAATTC", "BamHI": "GGATCC", "HindIII": "AAGCTT",
    "XbaI": "TCTAGA", "SpeI": "ACTAGT", "PstI": "CTGCAG",
    "NotI": "GCGGCCGC", "BglII": "AGATCT", "SalI": "GTCGAC",
    "NdeI": "CATATG", "NcoI": "CCATGG", "XhoI": "CTCGAG",
    "BsaI": "GGTCTC", "BbsI": "GAAGAC", "SapI": "GCTCTTC",
}


@app.post("/api/synthesize/complexity", response_model=SynthesisResponse)
async def synthesize_complexity(req: SynthesisRequest):
    """Analyse DNA sequence for synthesis complexity and feasibility."""
    seq = _validate_dna(req.sequence)
    n = len(seq)
    issues: List[SynthesisIssue] = []
    complexity = 0.0

    # GC content
    gc = (seq.count("G") + seq.count("C")) / n if n > 0 else 0.0

    if gc < 0.25:
        issues.append(SynthesisIssue(type="gc_low", severity="warning",
                      description=f"Low GC content ({gc*100:.1f}%) - may reduce cloning efficiency"))
        complexity += 0.15
    elif gc > 0.7:
        issues.append(SynthesisIssue(type="gc_high", severity="warning",
                      description=f"High GC content ({gc*100:.1f}%) - may cause secondary structures"))
        complexity += 0.15
    if gc > 0.8 or gc < 0.15:
        if issues:
            issues[-1].severity = "error"
        complexity += 0.15

    # Homopolymer runs
    for base in "ACGT":
        pattern = base + "{8,}"
        for m in re.finditer(pattern, seq):
            run_len = m.end() - m.start()
            issues.append(SynthesisIssue(
                type="homopolymer",
                severity="warning" if run_len < 12 else "error",
                position=m.start(), length=run_len,
                description=f"{base}x{run_len} homopolymer at position {m.start()}",
            ))
            complexity += 0.05 * (run_len - 7)

    # Repeat regions
    for m in re.finditer(r"(.{4,15})\1{2,}", seq):
        unit = m.group(1)
        repeats = (m.end() - m.start()) // len(unit)
        issues.append(SynthesisIssue(
            type="repeat",
            severity="warning" if repeats < 5 else "error",
            position=m.start(), length=m.end() - m.start(),
            description=f"Tandem repeat ({unit[:8]})x{repeats} at {m.start()}",
        ))
        complexity += 0.03 * repeats

    # Local GC windows (100bp)
    window = 100
    for i in range(0, n - window, window // 2):
        w = seq[i:i + window]
        local_gc = (w.count("G") + w.count("C")) / len(w)
        if local_gc > 0.8:
            issues.append(SynthesisIssue(
                type="gc_window_high", severity="warning",
                position=i, length=window,
                description=f"Local GC {local_gc*100:.0f}% in {i}-{i+window}",
            ))
            complexity += 0.05
        elif local_gc < 0.15:
            issues.append(SynthesisIssue(
                type="gc_window_low", severity="warning",
                position=i, length=window,
                description=f"Local GC {local_gc*100:.0f}% in {i}-{i+window}",
            ))
            complexity += 0.05

    # Restriction sites
    re_sites: Dict[str, int] = {}
    for name, site in RESTRICTION_SITES.items():
        cnt = len(re.findall(site, seq))
        if cnt > 0:
            re_sites[name] = cnt

    # Palindromic sequences (potential hairpins)
    complement_table = str.maketrans("ACGT", "TGCA")
    for wsize in (12, 16, 20):
        for i in range(n - wsize):
            w = seq[i:i + wsize]
            rc = w.translate(complement_table)[::-1]
            search_region = seq[i + wsize:i + wsize + 50]
            pos = search_region.find(rc)
            if pos != -1:
                issues.append(SynthesisIssue(
                    type="hairpin", severity="warning",
                    position=i, length=wsize,
                    description=f"Potential hairpin ({wsize}bp stem) at {i}",
                ))
                complexity += 0.08
                break

    # Fragmentation strategy
    FRAG_SIZE = 1800
    OVERLAP = 40
    fragments: List[Dict[str, Any]] = []
    if n > FRAG_SIZE:
        nfrags = math.ceil(n / (FRAG_SIZE - OVERLAP))
        for fi in range(nfrags):
            start = fi * (FRAG_SIZE - OVERLAP)
            end = min(start + FRAG_SIZE, n)
            fragments.append({"index": fi, "start": start, "end": end, "length": end - start})
        issues.append(SynthesisIssue(
            type="fragmentation", severity="info",
            description=f"Sequence requires {nfrags} fragment(s) with {OVERLAP}bp overlaps",
        ))

    # Cost estimation
    price_per_bp = {"generic": 0.09, "twist": 0.07, "idt": 0.10, "geneart": 0.12}
    ppb = price_per_bp.get(req.vendor, 0.09)
    base_cost = n * ppb
    complexity_multiplier = 1.0 + complexity
    estimated_cost = round(base_cost * complexity_multiplier, 2)
    estimated_days = max(5, min(30, int(n / 500) + int(complexity * 10)))

    complexity = min(complexity, 1.0)
    synthesisable = not any(iss.severity == "error" for iss in issues)

    return SynthesisResponse(
        sequence_length=n,
        gc_content=round(gc, 4),
        complexity_score=round(complexity, 3),
        estimated_cost_usd=estimated_cost,
        estimated_days=estimated_days,
        synthesisable=synthesisable,
        issues=issues,
        fragments=fragments,
        restriction_sites=re_sites,
    )


# ###########################################################################
#  9. GET /api/databases/igem/{partId} - iGEM Registry proxy
# ###########################################################################

class IgemPartResponse(BaseModel):
    part_name: str
    short_desc: str
    description: str
    sequence: str
    part_type: str
    status: str
    categories: List[str]
    twins: List[str]
    parameters: Dict[str, Any]
    source: str


@app.get("/api/databases/igem/{part_id}", response_model=IgemPartResponse)
async def igem_part(part_id: str):
    """Proxy to the iGEM Parts Registry API."""
    _require("httpx", HAS_HTTPX, "pip install httpx")
    httpx = importlib.import_module("httpx")
    import xml.etree.ElementTree as ET

    # Sanitise part ID
    if not re.match(r"^[A-Za-z0-9_]+$", part_id):
        raise HTTPException(400, f"Invalid iGEM part ID: {part_id}")

    url = f"https://parts.igem.org/cgi/xml/part.cgi?part={part_id}"

    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.get(url)
            resp.raise_for_status()
    except httpx.TimeoutException:
        raise HTTPException(504, "iGEM API timed out")
    except httpx.HTTPStatusError as exc:
        raise HTTPException(exc.response.status_code, f"iGEM API error: {exc.response.status_code}")
    except Exception as exc:
        raise HTTPException(502, f"Failed to reach iGEM API: {exc}")

    try:
        xml_root = ET.fromstring(resp.text)
    except ET.ParseError:
        raise HTTPException(502, "Failed to parse iGEM XML response")

    part_el = xml_root.find(".//part")
    if part_el is None:
        raise HTTPException(404, f"Part {part_id} not found in iGEM Registry")

    def _text(tag: str, default: str = "") -> str:
        el = part_el.find(tag)
        return el.text.strip() if el is not None and el.text else default

    categories: List[str] = []
    cats_el = part_el.find("categories")
    if cats_el is not None:
        categories = [c.text for c in cats_el.findall("category") if c.text]

    twins_list: List[str] = []
    twins_el = part_el.find("twins")
    if twins_el is not None:
        twins_list = [t.text for t in twins_el.findall("twin") if t.text]

    return IgemPartResponse(
        part_name=_text("part_name", part_id),
        short_desc=_text("part_short_desc"),
        description=_text("part_short_desc"),
        sequence=_text("seq_data"),
        part_type=_text("part_type"),
        status=_text("part_status"),
        categories=categories,
        twins=twins_list,
        parameters={},
        source="iGEM Parts Registry",
    )


# ###########################################################################
#  10. POST /api/ml/promoter_strength - Promoter Strength Prediction
# ###########################################################################
#
# Uses a compact sequence CNN trained on the measured Anderson promoter library
# and exported to ONNX for client-side inference parity.

class PromoterRequest(BaseModel):
    sequence: str = Field(..., description="Promoter DNA sequence")
    organism: str = Field("e_coli", description="Target organism for context")

class PromoterResponse(BaseModel):
    sequence: str
    normalized_sequence: str
    predicted_strength: float  # 0.0 (silent) - 1.0 (very strong)
    confidence: float
    model_source: str
    dataset_name: str
    model_version: str
    features: Dict[str, Any]
    interpretation: str
    known_motifs: List[Dict[str, Any]]
    exact_match: Optional[Dict[str, Any]] = None
    nearest_promoters: List[Dict[str, Any]] = Field(default_factory=list)


class PromoterModelResponse(BaseModel):
    model_version: str
    dataset_name: str
    source: str
    reference: str
    sequence_length: int
    measured_entry_count: int
    train_metrics: Dict[str, Any]
    crossval_metrics: Dict[str, Any]
    entries: List[Dict[str, Any]]
    model_base64: str


def _extract_promoter_features(seq: str) -> Dict[str, float]:
    seq = seq.upper()
    n = len(seq)
    features: Dict[str, float] = {}

    features["gc_content"] = (seq.count("G") + seq.count("C")) / n if n > 0 else 0.0
    features["length"] = float(n)

    for d1 in "ACGT":
        for d2 in "ACGT":
            di = d1 + d2
            features[f"di_{di}"] = seq.count(di) / max(n - 1, 1)

    # TATA box score (consensus TATAAT)
    tata_consensus = "TATAAT"
    best_tata = 0
    for i in range(max(0, n - 50), n - len(tata_consensus)):
        score = sum(1 for a, b in zip(seq[i:i + 6], tata_consensus) if a == b)
        best_tata = max(best_tata, score)
    features["tata_score"] = best_tata / 6.0

    # -35 box score (consensus TTGACA)
    box35_consensus = "TTGACA"
    best_35 = 0
    for i in range(max(0, n - 70), max(0, n - 25)):
        score = sum(1 for a, b in zip(seq[i:i + 6], box35_consensus) if a == b)
        best_35 = max(best_35, score)
    features["box35_score"] = best_35 / 6.0

    features["spacer_approx"] = 17.0

    if n > 60:
        up_region = seq[:20]
        features["up_at_rich"] = (up_region.count("A") + up_region.count("T")) / len(up_region)
    else:
        features["up_at_rich"] = 0.5

    # Trimer entropy
    trimers = [seq[i:i + 3] for i in range(n - 2)]
    counts = Counter(trimers)
    total = sum(counts.values())
    entropy = -sum((c / total) * math.log2(c / total) for c in counts.values() if c > 0)
    features["trimer_entropy"] = entropy

    return features


@app.get("/api/ml/promoter_strength/model", response_model=PromoterModelResponse)
async def ml_promoter_strength_model():
    """Return the ONNX promoter model and metadata for client-side inference."""
    _require("promoter model", HAS_PROMOTER_MODEL, "install the optional ML dependencies")
    metadata = await asyncio.to_thread(ensure_artifacts)
    model_base64 = await asyncio.to_thread(load_model_base64)
    return PromoterModelResponse(
        model_version=metadata["model_version"],
        dataset_name=metadata["dataset_name"],
        source=metadata["source"],
        reference=metadata["reference"],
        sequence_length=metadata["sequence_length"],
        measured_entry_count=metadata["measured_entry_count"],
        train_metrics=metadata["train_metrics"],
        crossval_metrics=metadata["crossval_metrics"],
        entries=metadata["entries"],
        model_base64=model_base64,
    )


@app.post("/api/ml/promoter_strength", response_model=PromoterResponse)
async def ml_promoter_strength(req: PromoterRequest):
    """Predict promoter strength using the Anderson CNN/ONNX pipeline."""
    _require("promoter model", HAS_PROMOTER_MODEL, "install the optional ML dependencies")
    seq = _validate_dna(req.sequence, max_len=1000)

    if len(seq) < 20:
        raise HTTPException(400, "Promoter sequence too short (min 20 bp)")

    features = _extract_promoter_features(seq)
    prediction_result = await asyncio.to_thread(predict_strength, seq)
    metadata = prediction_result["metadata"]
    prediction = float(prediction_result["predicted_strength"])
    confidence = float(prediction_result["confidence"])

    known_motifs: List[Dict[str, Any]] = []
    if features["tata_score"] >= 0.67:
        known_motifs.append({"name": "TATA box", "consensus": "TATAAT", "score": round(features["tata_score"], 2)})
    if features["box35_score"] >= 0.67:
        known_motifs.append({"name": "-35 box", "consensus": "TTGACA", "score": round(features["box35_score"], 2)})

    known_promoters = {
        "TTGACA": "sigma70 -35 consensus",
        "TATAAT": "sigma70 -10 (Pribnow box)",
        "TTGCTT": "Possible sigma32 -35",
        "CCCCAT": "Possible sigma32 -10",
    }
    for motif, desc in known_promoters.items():
        if motif in seq:
            known_motifs.append({"name": desc, "motif": motif, "position": seq.index(motif)})

    nearest_promoters = [
        {
            "part_id": item["part_id"],
            "strength_rpu": item["strength_rpu"],
            "hamming_distance": item["hamming_distance"],
        }
        for item in prediction_result["nearest_promoters"]
    ]

    exact_match = prediction_result["exact_match"]
    if exact_match is not None:
        exact_match = {
            "part_id": exact_match["part_id"],
            "strength_rpu": exact_match["strength_rpu"],
            "hamming_distance": exact_match["hamming_distance"],
        }

    if prediction > 0.7:
        interp = f"Strong promoter (predicted strength {prediction:.2f}). High transcription expected."
    elif prediction > 0.4:
        interp = f"Moderate promoter (predicted strength {prediction:.2f}). Medium transcription level."
    elif prediction > 0.15:
        interp = f"Weak promoter (predicted strength {prediction:.2f}). Low transcription expected."
    else:
        interp = f"Very weak / inactive promoter (predicted strength {prediction:.2f}). Consider redesigning."

    return PromoterResponse(
        sequence=seq,
        normalized_sequence=prediction_result["normalized_sequence"],
        predicted_strength=round(prediction, 4),
        confidence=round(max(0.0, min(1.0, confidence)), 3),
        model_source=prediction_result["model_source"],
        dataset_name=metadata["dataset_name"],
        model_version=metadata["model_version"],
        features={
            **{k: round(v, 4) for k, v in features.items()},
            "crossval_rmse": metadata["crossval_metrics"]["rmse"],
            "crossval_pearson_r": metadata["crossval_metrics"]["pearson_r"],
        },
        interpretation=interp,
        known_motifs=known_motifs,
        exact_match=exact_match,
        nearest_promoters=nearest_promoters,
    )


# ###########################################################################
#  11. POST /api/ml/codon_optimize - Codon Optimization with CodonBERT
# ###########################################################################
#
# Uses a compact masked-codon transformer pre-trained on real E. coli MG1655
# CDS from RefSeq, then fine-tunes on a target organism genome or a user-
# supplied CDS corpus to rank synonymous codons by host-adaptation.

class CodonOptimizationRequest(BaseModel):
    protein_sequence: Optional[str] = Field(None, description="Protein sequence in one-letter amino-acid code")
    cds_sequence: Optional[str] = Field(None, description="Input CDS to synonymously optimize")
    target_organism: str = Field("ecoli_mg1655", description="Built-in organism key or custom corpus target")
    custom_target_cds: List[str] = Field(default_factory=list, description="Optional real CDS corpus for fine-tuning")
    avoid_restriction_sites: List[str] = Field(default_factory=lambda: ["EcoRI", "BamHI", "HindIII", "XbaI", "SpeI", "PstI", "NotI"])


class CodonOptimizationResponse(BaseModel):
    model_version: str
    pretrained_on: str
    fine_tuned_on: str
    target_display_name: str
    corpus_gene_count: int
    source: str
    supported_organisms: Dict[str, str]
    protein_sequence: str
    original_cds: str
    optimized_cds: str
    translation_preserved: bool
    score_gain: float
    cai_gain: float
    gc_delta: float
    rare_codon_delta: int
    original_metrics: Dict[str, Any]
    optimized_metrics: Dict[str, Any]
    changes: List[Dict[str, Any]]
    training_summary: Dict[str, Any]
    genes_preview: List[Dict[str, Any]]
    interpretation: str


@app.post("/api/ml/codon_optimize", response_model=CodonOptimizationResponse)
async def ml_codon_optimize(req: CodonOptimizationRequest):
    _require("codon BERT", HAS_CODON_BERT, "pip install torch transformers")
    if not req.protein_sequence and not req.cds_sequence:
        raise HTTPException(400, "Provide protein_sequence or cds_sequence")

    protein_sequence = None
    cds_sequence = None

    if req.protein_sequence:
        protein_sequence = _validate_protein(req.protein_sequence, max_len=10_000)
        protein_sequence = protein_sequence.rstrip("*")
    if req.cds_sequence:
        cds_sequence = _validate_dna(req.cds_sequence, max_len=30_000)
        if len(cds_sequence) % 3 != 0:
            raise HTTPException(400, "CDS length must be divisible by 3")
        if len(cds_sequence) < 30:
            raise HTTPException(400, "CDS too short for codon language modelling (min 30 nt)")

    custom_target_cds = []
    for seq in req.custom_target_cds:
        clean = _validate_dna(seq, max_len=30_000)
        if len(clean) % 3 != 0:
            raise HTTPException(400, "Every custom_target_cds entry must be divisible by 3")
        custom_target_cds.append(clean)

    if not custom_target_cds and req.target_organism not in CODON_BERT_ORGANISMS:
        raise HTTPException(
            400,
            {
                "error": f"Unsupported target organism: {req.target_organism}",
                "supported": list(CODON_BERT_ORGANISMS.keys()),
                "message": "Use a built-in organism key or provide custom_target_cds for fine-tuning.",
            },
        )

    try:
        await asyncio.to_thread(ensure_pretrained_model)
        result = await asyncio.to_thread(
            run_codon_optimization,
            protein_sequence,
            cds_sequence,
            req.target_organism,
            custom_target_cds,
            req.avoid_restriction_sites,
        )
    except ValueError as err:
        raise HTTPException(400, str(err)) from err
    except Exception as err:
        logger.exception("CodonBERT optimization failed")
        raise HTTPException(500, f"CodonBERT optimization failed: {err}") from err

    original_score = float(result["original_metrics"]["expression_score"])
    optimized_score = float(result["optimized_metrics"]["expression_score"])
    improvement = optimized_score - original_score
    if improvement > 0.08:
        interpretation = f"Strong host-adaptation gain predicted: {original_score:.3f} -> {optimized_score:.3f}."
    elif improvement > 0.02:
        interpretation = f"Moderate host-adaptation gain predicted: {original_score:.3f} -> {optimized_score:.3f}."
    elif improvement >= -0.01:
        interpretation = f"Near-neutral redesign: {original_score:.3f} -> {optimized_score:.3f}. Sequence is already host-compatible."
    else:
        interpretation = f"Optimization did not improve the CodonBERT host-fit score ({original_score:.3f} -> {optimized_score:.3f}). Review the target corpus."

    return CodonOptimizationResponse(
        model_version=result["model_version"],
        pretrained_on=result["pretrained_on"],
        fine_tuned_on=result["fine_tuned_on"],
        target_display_name=result["target_display_name"],
        corpus_gene_count=result["corpus_gene_count"],
        source=result["source"],
        supported_organisms={key: value["display_name"] for key, value in CODON_BERT_ORGANISMS.items()},
        protein_sequence=result["protein_sequence"],
        original_cds=result["original_cds"],
        optimized_cds=result["optimized_cds"],
        translation_preserved=bool(result["translation_preserved"]),
        score_gain=round(float(result["score_gain"]), 4),
        cai_gain=round(float(result["cai_gain"]), 4),
        gc_delta=round(float(result["gc_delta"]), 4),
        rare_codon_delta=int(result["rare_codon_delta"]),
        original_metrics={
            "expression_score": round(float(result["original_metrics"]["expression_score"]), 4),
            "lm_score": round(float(result["original_metrics"]["lm_score"]), 4),
            "cai": round(float(result["original_metrics"]["cai"]), 4),
            "gc_content": round(float(result["original_metrics"]["gc_content"]), 4),
            "rare_codons": int(result["original_metrics"]["rare_codons"]),
            "restriction_hits": result["original_metrics"]["restriction_hits"],
        },
        optimized_metrics={
            "expression_score": round(float(result["optimized_metrics"]["expression_score"]), 4),
            "lm_score": round(float(result["optimized_metrics"]["lm_score"]), 4),
            "cai": round(float(result["optimized_metrics"]["cai"]), 4),
            "gc_content": round(float(result["optimized_metrics"]["gc_content"]), 4),
            "rare_codons": int(result["optimized_metrics"]["rare_codons"]),
            "restriction_hits": result["optimized_metrics"]["restriction_hits"],
        },
        changes=result["changes"],
        training_summary=result["training_summary"],
        genes_preview=result["genes_preview"],
        interpretation=interpretation,
    )


# ###########################################################################
#  12. POST /api/ml/crispr_offtarget - CRISPR Off-Target Prediction
# ###########################################################################
#
# MIT CRISPR specificity score (Hsu et al., 2013) and CFD score
# (Doench et al., 2016) for off-target evaluation.

class CrisprOffTarget(BaseModel):
    sequence: str
    protospacer: str
    pam_sequence: str
    position: int
    strand: str
    mismatches: int
    mismatch_positions: List[int]
    mit_score: float  # 0-100
    cfd_score: float  # 0-1
    cnn_probability: float  # 0-1
    risk_category: str
    in_seed_region: bool

class CrisprRequest(BaseModel):
    guide: str = Field(..., description="20-nt guide RNA")
    pam: str = Field("NGG", description="PAM motif")
    target_organism: Optional[str] = Field("ecoli_mg1655", description="Built-in organism genome to scan")
    target_genome: Optional[str] = Field(None, description="Genome sequence to scan")
    max_mismatches: int = Field(4, ge=0, le=6)
    max_results: int = Field(100, ge=1, le=200)

class CrisprResponse(BaseModel):
    guide: str
    pam: str
    model_version: str
    model_dataset: str
    target_organism: str
    target_display_name: str
    genome_length_scanned: int
    guide_gc_content: float
    on_target_score: float
    off_targets: List[CrisprOffTarget]
    total_off_targets: int
    specificity_score: float  # 0-100
    recommendations: List[str]


class InverseDesignPart(BaseModel):
    type: str
    name: str
    part_id: str
    role: str


class InverseDesignCircuit(BaseModel):
    circuit_name: str
    design_score: float
    host: str
    input_signal: str
    output: str
    topology: str
    complexity: str
    parts: List[InverseDesignPart]
    predicted_behavior: str
    constraints_satisfied: List[str]
    assumptions: List[str]
    rationale: List[str]
    bioscript_code: str
    references: List[str]


class InverseDesignRequest(BaseModel):
    phenotype_text: str = Field(..., description="Desired phenotype in natural language")
    host: Optional[str] = Field(None, description="Optional chassis preference, e.g. e_coli or bacillus")
    max_designs: int = Field(3, ge=1, le=5)


class InverseDesignResponse(BaseModel):
    model_version: str
    method: str
    phenotype_text: str
    host: str
    condition: str
    priorities: List[str]
    interpretation: str
    search_space_size: int
    candidate_sensor_count: int
    candidate_topology_count: int
    best_design: InverseDesignCircuit
    alternative_designs: List[InverseDesignCircuit]


class TutorSource(BaseModel):
    path: str
    line_start: int
    line_end: int


class TutorRelatedQuestion(BaseModel):
    question: str
    topic: str
    score: float


class TutorAskRequest(BaseModel):
    question: str = Field(..., description="User question about SynBio tutorials or code")
    audience: str = Field("beginner", description="Expected audience level")
    max_results: int = Field(3, ge=1, le=5)


class TutorAskResponse(BaseModel):
    question: str
    answer: str
    confidence: float
    matched_topic: str
    matched_intent: str
    mode: str
    sources: List[TutorSource]
    related_questions: List[TutorRelatedQuestion]
    model_info: Dict[str, Any]


@app.post("/api/ml/crispr_offtarget", response_model=CrisprResponse)
async def ml_crispr_offtarget(req: CrisprRequest):
    """Predict CRISPR off-target sites using a CNN ranked on Cas-OFFinder-style genome candidates."""
    _require("CRISPR model", HAS_CRISPR_MODEL, "install the optional ML dependencies")
    guide = req.guide.strip().upper().replace("U", "T")
    if len(guide) != 20:
        raise HTTPException(400, f"Guide must be exactly 20 nt (got {len(guide)})")
    if not all(c in "ACGT" for c in guide):
        raise HTTPException(400, "Guide contains invalid nucleotides")

    pam = req.pam.upper()
    guide_gc = (guide.count("G") + guide.count("C")) / 20.0
    try:
        metadata = ensure_crispr_offtarget_model()
        genome, target_organism, target_display_name = load_target_genome(req.target_organism, req.target_genome)
        scan = scan_offtargets(
            guide=guide,
            pam_pattern=pam,
            genome=genome,
            max_mismatches=req.max_mismatches,
            max_results=req.max_results,
        )
    except ValueError as err:
        raise HTTPException(400, str(err)) from err
    except Exception as err:
        logger.exception("CRISPR off-target prediction failed")
        raise HTTPException(500, f"CRISPR off-target prediction failed: {err}") from err

    off_targets = [
        CrisprOffTarget(
            sequence=item["sequence"],
            protospacer=item["protospacer"],
            pam_sequence=item["pam_seq"],
            position=int(item["position"]),
            strand=item["strand"],
            mismatches=int(item["mismatches"]),
            mismatch_positions=list(item["mismatch_positions"]),
            mit_score=float(item["mit_score"]),
            cfd_score=float(item["cfd_score"]),
            cnn_probability=float(item["cnn_probability"]),
            risk_category=item["risk_category"],
            in_seed_region=bool(item["in_seed_region"]),
        )
        for item in scan["off_targets"]
    ]

    specificity = float(scan["specificity_score"])
    on_target = simple_on_target_score(guide)

    recommendations: List[str] = []
    if guide_gc < 0.3:
        recommendations.append("Low GC content - consider redesigning guide for better binding")
    if guide_gc > 0.8:
        recommendations.append("Very high GC content may cause off-target binding")
    if "TTTT" in guide:
        recommendations.append("Guide contains TTTT - may cause premature Pol III termination")
    if len(off_targets) > 10:
        recommendations.append(f"High number of off-targets ({len(off_targets)}) - consider a more specific guide")
    if specificity < 50:
        recommendations.append("Low specificity score - high off-target risk")
    high_risk_targets = [ot for ot in off_targets if ot.cnn_probability >= 0.45]
    if high_risk_targets:
        recommendations.append(f"{len(high_risk_targets)} high-risk off-target(s) predicted by the CNN - redesign recommended")
    seed_mm_targets = [ot for ot in off_targets if ot.in_seed_region and ot.mismatches <= 2]
    if seed_mm_targets:
        recommendations.append(f"{len(seed_mm_targets)} off-target(s) with <=2 mismatches in the seed region - cleavage risk remains meaningful")
    if not recommendations:
        recommendations.append("Guide looks good - acceptable specificity")

    return CrisprResponse(
        guide=guide,
        pam=pam,
        model_version=str(metadata.get("model_version", "unknown")),
        model_dataset=str(metadata.get("dataset_name", "unknown")),
        target_organism=target_organism,
        target_display_name=target_display_name,
        genome_length_scanned=len(genome),
        guide_gc_content=round(guide_gc, 3),
        on_target_score=round(on_target, 3),
        off_targets=off_targets,
        total_off_targets=int(scan.get("total_candidates", len(off_targets))),
        specificity_score=specificity,
        recommendations=recommendations,
    )


@app.post("/api/ml/inverse_design", response_model=InverseDesignResponse)
async def ml_inverse_design(req: InverseDesignRequest):
    """Propose genetic circuits from desired phenotype using a curated CSP search over real circuit motifs and parts."""
    phenotype_text = str(req.phenotype_text or "").strip()
    if len(phenotype_text) < 12:
        raise HTTPException(400, "Phenotype description is too short for inverse design")

    try:
        result = await asyncio.to_thread(
            solve_inverse_design,
            phenotype_text,
            req.host,
            req.max_designs,
        )
    except ValueError as err:
        raise HTTPException(400, str(err)) from err
    except Exception as err:
        logger.exception("Inverse circuit design failed")
        raise HTTPException(500, f"Inverse circuit design failed: {err}") from err

    def _circuit(payload: Dict[str, Any]) -> InverseDesignCircuit:
        return InverseDesignCircuit(
            circuit_name=payload["circuit_name"],
            design_score=float(payload["design_score"]),
            host=payload["host"],
            input_signal=payload["input_signal"],
            output=payload["output"],
            topology=payload["topology"],
            complexity=payload["complexity"],
            parts=[InverseDesignPart(**part) for part in payload["parts"]],
            predicted_behavior=payload["predicted_behavior"],
            constraints_satisfied=list(payload["constraints_satisfied"]),
            assumptions=list(payload["assumptions"]),
            rationale=list(payload["rationale"]),
            bioscript_code=payload["bioscript_code"],
            references=list(payload["references"]),
        )

    return InverseDesignResponse(
        model_version=result["model_version"],
        method=result["method"],
        phenotype_text=result["phenotype_text"],
        host=result["host"],
        condition=result["condition"],
        priorities=list(result["priorities"]),
        interpretation=result["interpretation"],
        search_space_size=int(result["search_space_size"]),
        candidate_sensor_count=int(result["candidate_sensor_count"]),
        candidate_topology_count=int(result["candidate_topology_count"]),
        best_design=_circuit(result["best_design"]),
        alternative_designs=[_circuit(item) for item in result["alternative_designs"]],
    )


@app.get("/api/ai/tutor/model")
async def ai_tutor_model():
    """Return SynBio tutor model metadata and availability."""
    _require("SynBio tutor", HAS_TUTOR_MODEL, "install the optional tutor dependencies")
    return await asyncio.to_thread(ensure_tutor_model)


@app.post("/api/ai/tutor/ask", response_model=TutorAskResponse)
async def ai_tutor_ask(req: TutorAskRequest):
    """Answer tutorial and codebase questions using a small local tutor model plus retrieval."""
    _require("SynBio tutor", HAS_TUTOR_MODEL, "install the optional tutor dependencies")
    try:
        result = await asyncio.to_thread(
            answer_tutor_question,
            req.question,
            req.audience,
            req.max_results,
        )
    except ValueError as err:
        raise HTTPException(400, str(err)) from err
    except Exception as err:
        logger.exception("SynBio tutor failed")
        raise HTTPException(500, f"SynBio tutor failed: {err}") from err

    return TutorAskResponse(
        question=result["question"],
        answer=result["answer"],
        confidence=float(result["confidence"]),
        matched_topic=result["matched_topic"],
        matched_intent=result["matched_intent"],
        mode=result["mode"],
        sources=[TutorSource(**item) for item in result["sources"]],
        related_questions=[TutorRelatedQuestion(**item) for item in result["related_questions"]],
        model_info=result["model_info"],
    )


# ===========================================================================
# LEGACY ENDPOINTS (backward compatibility)
# ===========================================================================

class ProteinSequence(BaseModel):
    sequence: str
    name: Optional[str] = "unnamed_protein"

class ProteinPrediction(BaseModel):
    sequence: str
    name: str
    predicted_structure: str
    confidence: float
    secondary_structure: str
    disorder_regions: List[tuple]
    hydrophobicity_plot: List[float]
    molecular_weight: float
    isoelectric_point: float
    instability_index: float
    warnings: List[str]


class _ProteinAnalyzer:
    AA_WEIGHTS = {
        'A': 89.1, 'R': 174.2, 'N': 132.1, 'D': 133.1, 'C': 121.2,
        'E': 147.1, 'Q': 146.2, 'G': 75.1, 'H': 155.2, 'I': 131.2,
        'L': 131.2, 'K': 146.2, 'M': 149.2, 'F': 165.2, 'P': 115.1,
        'S': 105.1, 'T': 119.1, 'W': 204.2, 'Y': 181.2, 'V': 117.1,
    }
    PK_VALUES = {
        'N_term': 9.69, 'C_term': 2.34,
        'K': 10.5, 'R': 12.5, 'H': 6.0,
        'D': 3.86, 'E': 4.25, 'C': 8.33, 'Y': 10.1,
    }
    HYDROPHOBICITY = {
        'A': 1.8, 'R': -4.5, 'N': -3.5, 'D': -3.5, 'C': 2.5,
        'E': -3.5, 'Q': -3.5, 'G': -0.4, 'H': -3.2, 'I': 4.5,
        'L': 3.8, 'K': -3.9, 'M': 1.9, 'F': 2.8, 'P': -1.6,
        'S': -0.8, 'T': -0.7, 'W': -0.9, 'Y': -1.3, 'V': 4.2,
    }
    HELIX_PROPENSITY = {
        'E': 1.53, 'A': 1.45, 'L': 1.34, 'M': 1.20, 'Q': 1.17,
        'K': 1.16, 'R': 1.21, 'H': 1.24, 'V': 1.14, 'I': 1.00,
        'F': 1.12, 'Y': 0.61, 'W': 1.14, 'T': 0.79, 'D': 0.98,
        'C': 0.77, 'N': 0.73, 'S': 0.79, 'P': 0.59, 'G': 0.53,
    }
    SHEET_PROPENSITY = {
        'V': 1.87, 'I': 1.60, 'Y': 1.47, 'F': 1.38, 'W': 1.37,
        'L': 1.22, 'T': 1.20, 'C': 1.30, 'M': 1.67, 'Q': 1.23,
        'A': 0.97, 'R': 0.90, 'G': 0.81, 'D': 0.80, 'K': 0.74,
        'S': 0.72, 'H': 0.80, 'N': 0.65, 'P': 0.62, 'E': 0.26,
    }

    @staticmethod
    def molecular_weight(seq):
        return sum(_ProteinAnalyzer.AA_WEIGHTS.get(aa, 0) for aa in seq.upper()) - (len(seq) - 1) * 18.015

    @staticmethod
    def isoelectric_point(seq):
        seq = seq.upper()
        counts = {aa: seq.count(aa) for aa in "KRHDECYY"}
        lo, hi = 0.0, 14.0
        pk = _ProteinAnalyzer.PK_VALUES
        for _ in range(100):
            mid = (lo + hi) / 2
            ch = 1 / (1 + 10 ** (mid - pk["N_term"]))
            ch += counts.get("K", 0) / (1 + 10 ** (mid - pk["K"]))
            ch += counts.get("R", 0) / (1 + 10 ** (mid - pk["R"]))
            ch += counts.get("H", 0) / (1 + 10 ** (mid - pk["H"]))
            ch -= 1 / (1 + 10 ** (pk["C_term"] - mid))
            ch -= counts.get("D", 0) / (1 + 10 ** (pk["D"] - mid))
            ch -= counts.get("E", 0) / (1 + 10 ** (pk["E"] - mid))
            ch -= counts.get("C", 0) / (1 + 10 ** (pk["C"] - mid))
            ch -= counts.get("Y", 0) / (1 + 10 ** (pk["Y"] - mid))
            if abs(ch) < 0.001:
                return mid
            lo, hi = (mid, hi) if ch > 0 else (lo, mid)
        return (lo + hi) / 2

    @staticmethod
    def secondary_structure(seq):
        seq = seq.upper()
        result = []
        w = 6
        for i in range(len(seq)):
            s, e = max(0, i - w // 2), min(len(seq), i + w // 2 + 1)
            win = seq[s:e]
            h = sum(_ProteinAnalyzer.HELIX_PROPENSITY.get(aa, 1.0) for aa in win) / len(win)
            sh = sum(_ProteinAnalyzer.SHEET_PROPENSITY.get(aa, 1.0) for aa in win) / len(win)
            result.append("H" if h > 1.05 and h > sh else "E" if sh > 1.05 else "C")
        return "".join(result)


@app.post("/predict/protein", response_model=ProteinPrediction)
async def predict_protein(protein: ProteinSequence):
    """Legacy protein analysis endpoint."""
    seq = _validate_protein(protein.sequence)
    pa = _ProteinAnalyzer
    mw = pa.molecular_weight(seq)
    pi = pa.isoelectric_point(seq)
    ss = pa.secondary_structure(seq)
    hydro = [
        round(sum(pa.HYDROPHOBICITY.get(aa, 0) for aa in seq[max(0, i - 4):i + 5]) / min(9, len(seq)), 2)
        for i in range(len(seq))
    ]
    warnings: List[str] = []
    if pi < 4 or pi > 10:
        warnings.append(f"Extreme pI ({pi:.2f})")
    return ProteinPrediction(
        sequence=seq, name=protein.name or "unnamed",
        predicted_structure=f"# Secondary structure: {ss}", confidence=0.5,
        secondary_structure=ss, disorder_regions=[], hydrophobicity_plot=hydro,
        molecular_weight=mw, isoelectric_point=pi, instability_index=0.0, warnings=warnings,
    )


# ===========================================================================
# MAIN
# ===========================================================================

if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="SynBio Studio Engine Server")
    parser.add_argument("--port", type=int, default=8765)
    parser.add_argument("--host", type=str, default="127.0.0.1")
    args = parser.parse_args()

    logger.info("Starting SynBio Studio Engine on %s:%d", args.host, args.port)
    logger.info("API docs: http://%s:%d/docs", args.host, args.port)

    uvicorn.run(app, host=args.host, port=args.port, log_level="info")
