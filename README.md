# SynBio Studio

Open-source toolkit for writing genetic-circuit designs in BioScript and compiling them to exchange formats. The license is [AGPL-3.0](LICENSE).

[![DOI](https://zenodo.org/badge/DOI/10.5281/zenodo.23436206.svg)](https://doi.org/10.5281/zenodo.23436206)
[![License](https://img.shields.io/badge/license-AGPL--3.0-green)](LICENSE)

This README describes the source in this repository. The Electron desktop tree referred to in older drafts (`synbio-studio/`) is not published here. Older notes in [TECHNICAL_README.md](TECHNICAL_README.md), [README-IMPACTO.md](README-IMPACTO.md), [README-GITHUB.md](README-GITHUB.md), and [client/README.md](client/README.md) are design notes. They are not a feature inventory, and this repository does not report laboratory validation.

## Try it

**Windows installer (primary).** The packaged Windows application is the zip attached to the latest GitHub release:

[github.com/jorgegn29/Synbio-studio/releases/latest](https://github.com/jorgegn29/Synbio-studio/releases/latest)

The asset name is `SynBio-Studio-1.0.0-Windows-x64-Setup.zip` (release v1.0.3). That file is the installer package. Its Electron sources are not in this repository, so the sections below describe only the code a reader can build from this tree.

**Author's current desktop build.** On 9 November 2026 Jorge Guillem Najarro described three desks in the desktop application he is currently building: Fold Studio Core, Protein Design Studio, and Construct Forensics. [docs/desktop-current-build.md](docs/desktop-current-build.md) records that account, including the inputs, the included 1BRS and synthetic forensic examples, and the limits he stated. It describes his current build. A static inspection of the v1.0.3 zip did not find those three desks, so the published download does not provide them.

**Browser preview (secondary).** A hosted preview of the interface is at <https://huggingface.co/spaces/jorgegn29/synbio-studio>. The same preview can be built locally from [`web-demo/`](web-demo/).

## Quick examples

Two short tutorials use only code that is in this repository. Each README has the commands and a sample of the output.

- [Repressilator](examples/repressilator/README.md): BioScript compiled with `synbio-lsp`, then an ODE repressilator and a seeded Gillespie cassette through the Python engine, with a plot.
- [CRISPR guides and a biosafety scan](examples/crispr-biosafety/README.md): SpCas9 guide search on a 117 bp EGFP fragment, then the keyword scanner on two `.bio` files.

GitHub Actions runs both scripts on Ubuntu. The repressilator script needs a local `synbio-lsp` binary (`cargo build --manifest-path server/Cargo.toml`), SciPy, and matplotlib. The CRISPR script needs Node and `npm ci`.

## What is in this repository

| Path | Role |
|------|------|
| [`server/`](server/) | Rust language server and BioScript compiler (`synbio-lsp`) |
| [`client/`](client/) | TypeScript libraries and headless tests aimed at a VS Code extension |
| [`python-engine/`](python-engine/) | Local FastAPI service for simulation and optional models |
| [`web-demo/`](web-demo/) | Next.js browser preview |
| [`examples/`](examples/) | BioScript examples compiled by the Rust tests |
| [`paper/`](paper/) | Draft Journal of Open Source Software paper |

### Rust compiler and language server

`server/` is a binary named `synbio-lsp`.

- With no arguments it speaks the Language Server Protocol on stdin/stdout (completion, hover, diagnostics).
- `synbio-lsp --compile-full` reads BioScript from stdin and writes one JSON object to stdout.

The compiler parses BioScript, lowers it through its own intermediate representation, and can emit:

- SBOL 3 RDF/XML
- SBML
- FASTA and GenBank
- LLVM IR as text (the crate does not link against LLVM and does not run LLVM passes)
- an OpenTrons Python protocol script generated from the circuit
- a Markdown protocol
- a synthesis cost figure computed from fixed per-base amounts in `server/src/compiler/targets.rs` (this is not a live vendor quote)

Example files `examples/hello-biology.bio`, `examples/test-lsp-real.bio`, `examples/test-extension.bio`, and `examples/DEMO-complete-circuit.bioscript` are compiled by `cargo test`. When `sbol3` and `python-libsbml` import successfully, that test also runs [scripts/validate_exports.py](scripts/validate_exports.py). Without those packages the schema check is skipped. Continuous integration installs them.

### TypeScript client

`client/src/` contains modules for codon optimisation, a design-rule checker, a biosecurity scanner, CRISPR guide design, cloning-strategy planning, nearest-neighbour thermodynamics, restriction sites, protein properties, and a small flux-balance solver, plus further modules that import the VS Code API.

Headless Mocha tests cover the modules that do not need VS Code. The extension entry point [`client/src/extension.ts`](client/src/extension.ts) is empty, and [`client/package.json`](client/package.json) does not register a language, a grammar, or commands. Building the extension does not currently expose those modules inside the editor. The extension-host suite (`npm run test:e2e` in `client/`) is separate from the default tests and needs a VS Code test host.

### Python engine

[`python-engine/server.py`](python-engine/server.py) is a FastAPI application. It listens on `127.0.0.1:8765` unless `--host` or `--port` is set. Interactive docs are at `http://127.0.0.1:8765/docs`.

Endpoints that run with the base install (NumPy and SciPy):

| Endpoint | Behaviour |
|----------|-----------|
| `POST /api/compile` | A Python parser in this file. It emits its own LLVM-like text and SBOL-like XML. It is not the Rust compiler, and this XML is not the document checked by pySBOL3. |
| `POST /api/simulate/ode` | Deterministic integration with `scipy.integrate.solve_ivp`. |
| `POST /api/simulate/ssa` | Gillespie simulation. Uses GillesPy2 when that package imports; otherwise a built-in stochastic simulation algorithm. |

Endpoints that need an extra program or Python extra:

| Endpoint | Requirement |
|----------|-------------|
| `POST /api/fba` | COBRApy and a model file under `python-engine/models/` (the server can try to download a BiGG model) |
| `POST /api/alignment/msa` | `muscle` or `clustalo` on `PATH` |
| `POST /api/blast/local` | BLAST+ (`blastn` / `blastp`) on `PATH` |
| `POST /api/structure/rnafold` | The ViennaRNA Python package, or the `RNAfold` executable. If neither is present, a Nussinov fold is returned and the response says so. The reported energy in that fallback is a pair-count approximation. |
| `POST /api/structure/esmfold` | Optional local helper that sends the sequence to Meta's public ESMFold API |
| `GET /api/databases/igem/{part_id}` | HTTP client; contacts the iGEM registry |
| `POST /api/ml/promoter_strength`, `/api/ml/codon_optimize`, `/api/ml/crispr_offtarget`, `/api/ml/inverse_design`, `/api/ai/tutor/ask` | Optional Python modules and files under `python-engine/models/`. A missing import disables that route. |

[`python-engine/pyproject.toml`](python-engine/pyproject.toml) is the install definition. `requirements.txt` and `python-engine/requirements.txt` still list a wider set, including PyTorch and TensorFlow, which are optional extras rather than requirements of the default engine.

### Browser preview

[`web-demo/`](web-demo/) is a Next.js application with an in-browser BioScript path. Build and hosting details are in [web-demo/README.md](web-demo/README.md). The Hugging Face Space above is the public preview.

## Install from source (Linux and macOS)

These steps build the public source. They do not rebuild the Windows zip.

Prerequisites:

- Git
- Node.js 18 or newer
- Rust, installed with [rustup](https://rustup.rs/). The crate is edition 2021, and `server/Cargo.lock` pulls a dependency that needs Rust 1.85 or newer (Cargo edition 2024). `rustup update stable` is the practical way to get it.
- Python 3.10 or newer
- A C toolchain only if pip has to build a wheel from source (NumPy and SciPy publish wheels for common Linux and macOS versions)

```bash
git clone https://github.com/jorgegn29/Synbio-studio.git
cd Synbio-studio
npm ci
cargo build --release --manifest-path server/Cargo.toml
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -U pip
python -m pip install -e "./python-engine[dev]"
```

Optional pieces:

```bash
# Schema checks used by the Rust export test and by CI
python -m pip install 'sbol3==1.2' python-libsbml

# FBA, GillesPy2, Biopython, and the iGEM HTTP client
python -m pip install -e "./python-engine[bio]"

# Local model endpoints. This extra is large.
python -m pip install -e "./python-engine[ml]"

# Browser preview
cd web-demo && npm ci && npm run dev
```

Run the compiler and the engine from the repository root, with the virtual environment active:

```bash
./server/target/release/synbio-lsp --compile-full < examples/hello-biology.bio
python python-engine/server.py
```

On Windows, the packaged zip is the intended way to try the application. The same source commands work in PowerShell if `python` is on `PATH` and the virtual environment is activated with `.\.venv\Scripts\Activate.ps1`.

## Running tests

From the repository root, after the install above:

```bash
npm test
```

That command runs three suites, in order:

| Script | What it runs |
|--------|----------------|
| `npm run test:client` | Mocha in `client/`: unit, integration, performance, benchmark, and smoke tests. These do not launch VS Code. |
| `npm run test:rust` | `cargo test --manifest-path server/Cargo.toml` |
| `npm run test:python` | `python3 -m pytest python-engine` (the engine gauntlet: health, the Python compile endpoint, one ODE model, a seeded SSA pair, and rejection of an unsafe rate law) |

Run a single suite with `npm run test:client`, `npm run test:rust`, or `npm run test:python`.

The extension-host suite is not part of `npm test`:

```bash
npm run test:e2e --workspace client
```

SBOL and SBML schema validation inside `cargo test` runs only when `python3 -c "import sbol3, libsbml"` succeeds. Install the packages shown above to include that check. Continuous integration installs them and treats a missing import as a failure.

## Support

The maintainer is **Jorge Guillem Najarro** ([ORCID 0009-0001-7272-2817](https://orcid.org/0009-0001-7272-2817)).

- Bug reports, scientific corrections, and feature requests: [GitHub Issues](https://github.com/jorgegn29/Synbio-studio/issues). Templates are in `.github/ISSUE_TEMPLATE/`.
- Security reports: follow [SECURITY.md](SECURITY.md). Do not open a public issue for a vulnerability in the biosecurity checks.
- There is one maintainer. Issues filed on GitHub are answered on a best-effort basis, with no promised turnaround.

Please include a minimal `.bio` file, the command you ran, and the operating system when you report a compiler or engine bug.

## Services

Need consulting, custom integration, training, or paid support? See [SERVICES.md](SERVICES.md).

## Governance

Jorge Guillem Najarro is the maintainer and the author recorded in [CITATION.cff](CITATION.cff). He reviews pull requests to this repository. The project has no other committers listed here and no institutional governance board.

- License: [GNU AGPL-3.0](LICENSE). Contributions are accepted under that license.
- Community standards: [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md).
- How to contribute, including the rule that numerical constants need a primary citation: [CONTRIBUTING.md](CONTRIBUTING.md).
- Scientific corrections have their own issue template (`.github/ISSUE_TEMPLATE/scientific_correction.md`).

Outputs of the compiler and the engine are computational. This repository does not report a laboratory validation, a clinical use, or a certification against biosafety regulations.

## How to cite

Guillem Najarro, J. (2026). SynBio Studio (v1.0.3). Zenodo. <https://doi.org/10.5281/zenodo.23436206>

```bibtex
@software{GuillemNajarro2026,
  author    = {Guillem Najarro, Jorge},
  title     = {jorgegn29/Synbio-studio: SynBio Studio v1.0.3},
  year      = {2026},
  publisher = {Zenodo},
  version   = {v1.0.3},
  doi       = {10.5281/zenodo.23436206},
  url       = {https://github.com/jorgegn29/Synbio-studio}
}
```

A draft paper for a future Journal of Open Source Software submission is in [paper/paper.md](paper/paper.md). The AI-usage disclosure in that draft is still a TODO for the author.
