---
title: 'SynBio Studio: a BioScript compiler, language server, and local simulation engine for genetic circuits'
tags:
  - synthetic biology
  - genetic circuit design
  - SBOL
  - SBML
  - compiler
  - LLVM
authors:
  - name: Jorge Guillem Najarro
    orcid: 0009-0001-7272-2817
    affiliation: 1
affiliations:
  - name: Independent developer, Catarroja, Valencia, Spain
    index: 1
date: 2 November 2026
bibliography: paper.bib
---

# Summary

SynBio Studio is an open-source (AGPL-3.0) toolkit for writing genetic-circuit
designs in a domain-specific language, BioScript. This paper describes the
source published at
[github.com/jorgegn29/Synbio-studio](https://github.com/jorgegn29/Synbio-studio).
That tree contains a Rust language server and compiler (`server/`), a
TypeScript client (`client/`), a local Python engine (`python-engine/`,
FastAPI), and a Next.js browser preview (`web-demo/`). A packaged Windows
application is distributed as `SynBio-Studio-1.0.0-Windows-x64-Setup.zip` on
the GitHub release. The Electron sources for that package are not in this
repository. A browser preview is hosted at
[huggingface.co/spaces/jorgegn29/synbio-studio](https://huggingface.co/spaces/jorgegn29/synbio-studio).
Archived releases are on Zenodo [@GuillemNajarro2026].

The Rust compiler parses BioScript, lowers it through the compiler's own
intermediate representation, and can emit SBOL [@Galdzicki2014], SBML
[@Hucka2003], FASTA, GenBank, LLVM IR text [@Lattner2004], an OpenTrons
protocol script, and a Markdown protocol. The language server provides
completion, hover, and diagnostics over stdio. The emitted LLVM IR is text.
This repository does not link against the LLVM libraries or run LLVM passes.

The TypeScript tree contains modules for codon optimisation, a design-rule
checker, a biosecurity scanner, CRISPR guide design, cloning-strategy
planning, thermodynamics, restriction-site search, protein properties, and a
small flux-balance solver. Headless tests cover the modules that do not need
the VS Code API. The extension entry point, `client/src/extension.ts`, is
empty, and the extension manifest does not register a language or commands, so
opening this tree in VS Code does not yet expose those modules as editor
features.

The Python engine binds to localhost. It exposes deterministic ODE integration
and Gillespie stochastic simulation [@Gillespie1977] (GillesPy2 when that
package is installed, otherwise a built-in stochastic simulation algorithm).
Flux balance analysis [@Orth2010] runs when COBRApy and a model file are
present. RNA secondary-structure prediction uses ViennaRNA when that package
is installed, and otherwise a Nussinov approximation. Multiple sequence
alignment shells out to MUSCLE or Clustal Omega when one of those programs is
on the PATH. Optional modules load local files for promoter-strength
prediction, codon optimisation, CRISPR off-target scoring, and a constraint
solver for inverse circuit design. An ESMFold helper and an iGEM part lookup
call external services. They are not offline paths. No compiled ViennaRNA
WebAssembly binary is shipped in this repository.

# Statement of need

Designing a genetic circuit typically involves several disconnected tools: a
sequence editor or cloud notebook, a separate simulator, ad hoc scripts, and
manual conversion into exchange formats and laboratory protocols. Each hand-off
is a source of errors and makes designs hard to reproduce. Software
engineering solved a similar problem with tools that combine an editor, a
compiler, static analysis, and a debugger around a single source of truth.
SynBio Studio applies that model to synthetic biology. Its target users are
researchers, students, and small laboratories who want to write a circuit
once, check it, simulate it, and export SBOL and SBML without depending on a
commercial cloud service. The Rust compiler and the local Python endpoints can
run on a machine the user controls. Some optional endpoints download model
files or send a sequence to a public web service, so those calls have to be
chosen deliberately for unpublished designs.

The published source is a compiler, a language server, libraries, and a local
simulation service. It is not, by itself, a finished desktop IDE: the Electron
application distributed in the Windows zip is not part of this source tree,
and the VS Code extension entry point is not wired up.

# State of the field

Genetic design automation has a long history. TinkerCell [@Chandran2009]
introduced a modular CAD environment for synthetic biology, and iBioSim
[@Myers2009] couples circuit design with model analysis and simulation.
j5 [@Hillson2012] and DeviceEditor [@Chen2012] automate DNA assembly design
through a visual canvas. AutoBioCAD [@Rodrigo2013] demonstrated fully
automated biodesign of genetic circuits, from specification to sequence, and
is the closest precedent for SynBio Studio's compile-from-specification
approach. Cello [@Nielsen2016] showed that a hardware-description-style
language can be compiled into working DNA circuits. SBOL [@Galdzicki2014] and
SBML [@Hucka2003] provide the standards that allow these tools to interoperate.
Commercial platforms such as Benchling [@Benchling] offer integrated sequence
editing and data management, but they are proprietary and cloud-hosted.

SynBio Studio does not replace these tools. It contributes an open-source
BioScript compiler and language server, local simulation endpoints, and
TypeScript libraries aimed at an editor workflow, together in one AGPL-3.0
repository.

# Key features

- **BioScript compiler and language server:** a Rust binary (`synbio-lsp`)
  serves completion, hover, and diagnostics, and can compile a file from
  standard input (`--compile-full`) to JSON containing SBOL, SBML, FASTA,
  GenBank, LLVM IR text, an OpenTrons script, and a Markdown protocol.
- **Standards export:** the Rust SBOL and SBML emitters are checked with
  pySBOL3 and libSBML when those Python packages are installed. Continuous
  integration installs them. A local `cargo test` skips that check when they
  are absent.
- **TypeScript libraries:** codon optimisation, design-rule checks,
  biosecurity screening, CRISPR guide design, cloning-strategy planning, and
  the sequence and metabolism helpers listed above. Headless tests exercise
  the pure functions. The VS Code extension host does not load them yet.
- **Local simulation engine:** REST endpoints for ODE integration and
  Gillespie simulation, plus flux balance analysis, RNA folding, and multiple
  sequence alignment when the corresponding optional dependency or external
  program is installed.
- **Optional model files:** promoter strength, codon optimisation, CRISPR
  off-target scoring, and inverse circuit design. They are not imported unless
  their Python modules load, and their training is not re-evaluated in this
  paper.
- **Browser preview:** `web-demo/` is a Next.js application. The hosted
  preview linked from the README is a secondary way to look at the interface.
  The Windows release zip is the packaged application.
- **Testing:** headless Mocha tests for the client, `cargo test` for the Rust
  crate, and a pytest script for the Python engine. The VS Code extension-host
  suite is separate and is not part of the default test command.

# Acknowledgements

The author thanks the developers of the open standards and tools cited here,
especially the SBOL and SBML communities, on which interoperability depends.
This work received no specific funding.

# AI usage disclosure

> **TODO (author):** Replace this paragraph before submission. JOSS requires a
> statement that describes the nature and scope of any generative-AI
> assistance used for code, documentation, tests, and this paper, and that
> confirms the human author reviewed and validated the outputs and made the
> core design decisions. This draft was prepared with AI assistance. Do not
> submit the paper until this section is written in the author's own words.

<!-- TO BE COMPLETED BY THE AUTHOR: JOSS requires a statement describing
the nature and scope of any generative-AI assistance (code, docs, tests,
paper drafting) and confirming that the human author reviewed and validated
all outputs and made the core design decisions. This paper draft was prepared
with AI assistance. -->

# References
