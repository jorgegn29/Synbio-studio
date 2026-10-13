# Changelog — SynBio-LLVM

## [0.8.0] — 2025-01-25

### Added
- **RNA Structure Predictor** — Nussinov algorithm + Turner 2004 MFE with arc diagram visualization
- **AlphaFold DB Lookup** — Fetch 3D protein structures by UniProt ID
- **Circuit Canvas** — Interactive SBOL Visual 3.0 drag-and-drop designer (SynBio Studio)
- **E2E Test Suite** — Command stability tests for 124 commands
- **Sequence Intelligence** — Motif analysis, CpG islands, repeat finder
- **Experiment Planner** — Timeline, checklist, resource estimation
- **Plate Layout Designer** — 96/384-well plate design with serial dilution
- **Growth Curve Analyzer** — Monod/Logistic fitting, doubling time
- **Sequence Alignment** — Needleman-Wunsch, Smith-Waterman, dot plot
- **Cloning Strategy Planner** — Gibson, Golden Gate, restriction assembly comparison
- 4 new commands: `synbio.predictRNAStructure`, `synbio.predictRNAFromEditor`, `synbio.alphaFoldLookup`, `synbio.rnaQuickFold`

### Fixed
- Circuit Failure Predictor no longer scans `.ts` source files (only `.bio`)
- Biosecurity Scanner guards against non-BioScript files
- Removed redundant activation events from package.json

## [0.7.0] — 2025-01-15

### Added
- **Circuit Failure Predictor** — Leak detection, toxicity prediction
- **Metabolic Digital Twin** — Real-time metabolic simulation
- **LLM Bio Designer** — AI-assisted circuit design
- **NCBI Client** — GenBank search integration
- **ESMFold Client** — Protein structure prediction API
- **Registry Publisher** — Publish parts to registries
- **Primer Designer** — Tm-optimized primer design

## [0.6.0] — 2025-01-05

### Added
- SBOL Visual Real-Time Renderer (CodeLens)
- BioScript CodeLens, Diagnostics, Hover, Completion providers
- FASTA Compiler, DocumentSymbolProvider
- Onboarding, Audit Trail, Telemetry managers

## [0.5.0] — 2024-12-20

### Added
- 17-phase activation architecture
- Gillespie SSA simulator, ODE solver, FBA
- Biosafety classifier, Protocol generator
- Professional exporter (SBOL 3.0, FASTA, GenBank, CSV)
- Genetic debugger with step-through
- Scientific Copilot, Auto-corrector
- Parts library browser with 150+ parts
