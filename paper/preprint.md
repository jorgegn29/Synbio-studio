# SynBio Studio: a BioScript compiler, language server, and local simulation engine for genetic circuit design

Jorge Guillem Najarro ¹

¹ Independent developer, Catarroja, Valencia, Spain

ORCID: 0009-0001-7272-2817

Correspondence: guillemjorge94@gmail.com

Date: 2 November 2026

This manuscript is a preprint draft. It has not been peer reviewed.

## Abstract

SynBio Studio is an open-source (AGPL-3.0) toolkit that puts a textual design language, BioScript, in front of a compiler. The public repository contains a Rust language server and compiler, a TypeScript client library, a local FastAPI engine, and a Next.js preview. The compiler emits SBOL, SBML, FASTA, GenBank, LLVM IR as text, an OpenTrons script, and a Markdown protocol. It does not link against LLVM. The engine integrates ODEs with SciPy and runs Gillespie’s direct method with constant propensities, so Hill functions belong on the ODE route. Extra routes for flux balance analysis, RNA folding, alignment, and BLAST depend on optional programs. A keyword biosafety scan and a CRISPR guide heuristic ship as TypeScript modules with headless tests. The VS Code entry point is empty, so those modules are not editor commands yet. A Windows installer zip is on the GitHub release. Its Electron sources are not in the repository. No laboratory validation is reported. Release v1.0.3 is archived at Zenodo (10.5281/zenodo.23436206).

## 1. Introduction

A typical genetic-design session still crosses several programs. A researcher draws a construct in a sequence editor, copies the sequence into a simulator, and then reformats the same design for an exchange standard or a liquid handler. Each copy is a place where a part name, a strand, or a unit can drift. The design that was simulated is not always the design that was ordered. Software engineering reduced a similar class of mistakes by keeping one source file and deriving the other artefacts from it. Compilers, language servers, and test suites made that source checkable.

Design tools already cover parts of this loop. TinkerCell is a modular CAD environment (Chandran, Bergmann, and Sauro, 2009). iBioSim couples design with model analysis (Myers et al., 2009). j5 and DeviceEditor automate assembly from a canvas (Hillson, Rosengarten, and Keasling, 2012; Chen et al., 2012). AutoBioCAD goes from a specification to a sequence (Rodrigo and Jaramillo, 2013). Cello compiles a hardware-description style of specification into DNA that works in cells (Nielsen et al., 2016). SBOL and SBML are the exchange languages (Galdzicki et al., 2014; Hucka et al., 2003). Commercial platforms such as Benchling keep the design on a vendor server.

SynBio Studio does not replace that set. It adds an open-source path in which the source of truth is a text file in a small language, BioScript. A compiler derives SBOL and SBML from that file. A language server can check it while it is being edited. A local process can integrate an explicit dynamical model without uploading the sequence. The intended users are researchers, students, and small laboratories who want that loop on a machine they control.

Two limits belong in the first section, because they are easy to miss in a release badge. First, the Windows package distributed on GitHub is a binary. The Electron application that older project notes described is not in the public source tree, so a reviewer cannot audit that interface from the clone. Second, the VS Code extension manifest does not register a language or any commands, and the extension entry file is empty. The TypeScript modules exist and many of them have tests. They are not, today, a running editor extension. This preprint describes the source that is public.

## 2. Implementation

The repository is organised around four directories: `server/` (Rust), `client/` (TypeScript), `python-engine/` (Python), and `web-demo/` (Next.js). Release metadata on Zenodo is v1.0.3. The Rust crate and the npm workspace still say 1.0.1.

### 2.1 BioScript and the Rust compiler

`synbio-lsp` is the compiler binary. Invoked as `synbio-lsp --compile-full`, it reads a BioScript program from standard input and writes one JSON document to standard output. With no flag it speaks the Language Server Protocol on the same streams. The compile result can include SBOL, SBML, FASTA, GenBank, LLVM IR text, an OpenTrons Python script, a Markdown protocol, a cost estimate, diagnostics, and a short type-check summary.

The front end is a lexer and a recursive-descent parser. A circuit may be written as a braced block of transcription units. A unit is a chain of parts joined by `->`. A repression or other regulatory link uses `~>`. The small repressilator used as a worked example is three such units, LacI under pTet, TetR under pLac, and cI under a lambda promoter name, plus the three repression links that close the ring. That file compiles. Both the SBOL and the SBML strings in the JSON contain the names LacI, TetR, and cI. Compilation does not, by itself, produce a time series. Nothing in the compiler lowers a repression arrow into a rate law. The dynamical model in the example is written separately and sent to the Python engine.

SBOL from this binary is RDF/XML aimed at SBOL 3: absolute namespace URIs, DNA type SBO:0000251, Sequence Ontology roles, sequences, and `precedes` constraints. SBML is Level 3. The project’s export tests, when `sbol3` and `python-libsbml` import, run a Python validator over example circuits, including a TetR inverter and a pLac–GFP cassette. Those tests also require declared mole, second, and litre units, and they expect concentration-based kinetic laws to be scaled by compartment volume. A local `cargo test` skips the validator when the Python packages are absent. Continuous integration installs them and treats a missing import as a failure. The lockfile currently pulls a crate that needs Rust 1.85 or newer.

The LLVM backend writes textual IR. Promoters, ribosome binding sites, coding sequences, and regulatory links are mapped onto functions and constants in that text. The crate does not depend on the LLVM libraries. Continuous integration does not run `llvm-as` on the output. The IR should be treated as an export format until that check exists. The default target triple in the generator is a Windows triple. Callers who need another triple have to read that default before they assume the text is host-neutral.

The OpenTrons emitter writes a Python protocol script for a Golden Gate style assembly from the parts in the circuit. It has not been executed on an OT-2 in this repository. A cost figure multiplies length by fixed per-base amounts in the source. It is not a live vendor quote. A select-agent module in the same crate can refuse a program. It is separate from the TypeScript keyword scan below.

### 2.2 Language server

The server uses tower-lsp. Each document is checked by the parser plus a set of biological diagnostics, and the same process serves completion and hover. A full compile of the buffer can be returned as the same JSON as the command-line mode. The VS Code entry point does not start the binary, so a user launches `synbio-lsp` and points a client at it. That binary is still the implementation of completion, hover, and diagnostics.

### 2.3 Local Python engine

`python-engine/server.py` is a FastAPI application. It listens on `127.0.0.1` and port 8765 unless `--host` or `--port` is set. Interactive documentation is served at `/docs`. The process logs which optional imports succeeded. Missing libraries disable routes. They do not crash the process at startup.

Three routes work from the base install (NumPy, SciPy, FastAPI, Pydantic). `POST /api/compile` runs a Python tokenizer that is not the Rust compiler. It emits LLVM-like text and an SBOL-like XML document. That XML is not the file checked by pySBOL3. Callers who need the validated export should run `synbio-lsp`. `POST /api/simulate/ode` builds a stoichiometry matrix from the declared reactions and integrates the system with `scipy.integrate.solve_ivp`. Rate laws are parsed as Python expressions, restricted to arithmetic, comparisons, and a short list of math functions. Attribute access and imports are rejected. `POST /api/simulate/ssa` expects a positive constant propensity on each reaction. The propensity is multiplied by the combinatorial count of reactant molecules, which is mass-action structure. If GillesPy2 imports, that library runs the trajectory. Otherwise a built-in direct method does. Seeded repeats of the built-in method match. Hill repression cannot be expressed as one of these propensities, so a repressilator is an ODE model in this engine, and a Gillespie run of the same tutorial is an unregulated birth-and-death cassette.

Other routes are conditional. Flux balance analysis uses COBRApy and a model file, and can download a BiGG model on first use. Alignment calls MUSCLE or Clustal Omega. BLAST calls BLAST+. RNA folding uses ViennaRNA, then the `RNAfold` executable, then a Nussinov fold that reports −1.5 kcal/mol per pair and says ViennaRNA was absent. ESMFold sends the sequence to a public API. The iGEM route fetches a part over HTTP. Promoter, codon, and CRISPR off-target routes load local weight files or stay off. Inverse design here is a constraint solver over a small catalog, not a trained sequence model. This preprint does not re-score those files.

`python-engine/pyproject.toml` installs the server, NumPy, and SciPy by default. COBRApy, GillesPy2, PyTorch, and TensorFlow are extras. A root `requirements.txt` still lists the heavy libraries as if they were mandatory. The extras are the install path this preprint recommends.

### 2.4 TypeScript client

The client directory holds modules written for a VS Code extension: codon tables, nearest-neighbour thermodynamics, restriction sites, protein properties, a small flux-balance solver, a design-rule checker, a biosecurity scanner, a CRISPR guide designer, and a cloning-strategy planner. Headless Mocha tests run with `cargo test` and a Python gauntlet from `npm test`. They check the functions that import without the VS Code API, including published reference points for energies, sites, protein properties, and a small E. coli core solve. Passing tests show that the functions match the values those tests encode. They are not a wet-lab trial.

CRISPR guide design lives in `client/src/crispr-guides.ts`, which the panel module imports. `findGuideRNAs` scans a DNA string for a spacer next to a PAM. For SpCas9 that is 20 bp and a 3′ NGG. The score adds or subtracts a few terms for GC content, a handful of position preferences, homopolymers, and a hairpin check against a constant scaffold. Off-target counting walks only the sequence that was passed in. On a 117 bp fragment from the 5′ end of the commonly used EGFP coding sequence, the function returns 19 SpCas9 guides. The top spacer in that fragment is `GGGCGAGGAGCTGTTCACCG` with PAM `GGG`. The numeric score ranks guides inside this heuristic. It is not a measured cutting frequency, and it is not Doench Rule Set 2, which uses thousands of features (Doench et al., 2016).

The biosafety scan in `client/src/biosecurity-rules.ts` lowercases the design and searches for substrings such as `ccdB`, `bla`, and `cat`. A design longer than 50 characters with no `kill_switch` text gets another finding. On a file that embeds the EGFP fragment, the letters `cat` inside `GCCCATCCT` match the chloramphenicol rule, and the missing kill-switch wording is reported. A second file named `EgfpGuideCcdB` with product `"CcdB"` matches the CcdB rule twice. These are keyword hits. They are not a select-agent alignment, and the `cat` hit is not evidence of a resistance gene. Citations stored on the rules do not turn the matcher into a compliance determination.

The extension host does not load either module, because `client/src/extension.ts` is empty and `client/package.json` contributes only a language setting. A tutorial script imports the functions directly with `tsx`. That is the supported way to run them from a shell today.

### 2.5 Distribution and tests

The packaged desktop build for Windows is the zip on the latest GitHub release. Linux and macOS users build from source with Node.js 18 or newer, Rust 1.85 or newer, and Python 3.10 or newer. A Next.js app under `web-demo/` builds locally. The hosted preview is a Hugging Face Space.

GitHub Actions builds the client and runs its headless tests, builds the Rust crate on Linux, Windows, and macOS, and checks the Python engine. The Ubuntu Rust job runs the two tutorial scripts once they are on the default branch. A Python gauntlet checks health, the Python compile route, one ODE trajectory, a seeded SSA pair, and rejection of an unsafe rate law.

## 3. Worked examples

Two scripts in `examples/` are the executable form of the scope above. Both exit non-zero when their checks fail.

The repressilator script compiles the ring with `synbio-lsp --compile-full` and requires LacI, TetR, and cI in both SBOL and SBML. It then integrates the symmetric Elowitz and Leibler model (Elowitz and Leibler, 2000) on the ODE route: messenger decay 1, β = 0.2, α = 216, α₀ = 0.216, n = 2, with cI repressing lacI, LacI repressing tetR, and TetR repressing cI. On SciPy 1.18.1, LacI protein peaked near times 14.2, 44.6, and 83.0, with a maximum near 51. The script accepts any run with at least three peaks and a maximum above 40. A second panel is one Gillespie cassette (rates 0.8, 0.2, 1.4, and 0.05, seed 2026). On the built-in solver the last sample was 4 messenger molecules and 58 protein molecules. That panel is birth and death, not a stochastic ring. GillesPy2, if installed, can change the integers. Two runs with the same seed must match.

The CRISPR script reads the 117 bp EGFP fragment, calls `findGuideRNAs` for SpCas9, and checks the findings in section 2.4: the `cat` substring, the missing kill switch, and CcdB only on the second file.

## 4. What this software does not establish

The repository does not report a wet-lab experiment. Simulation output is the behaviour of the equations that were submitted, under the solver that was installed. The Windows installer cannot be reviewed from this source tree. The VS Code surface is not wired up, so a command that exists as a module is not a command a user can click. LLVM IR text is not an LLVM pipeline. Python SBOL is not Rust SBOL. Gillespie propensities are not arbitrary rate laws. The keyword scan is not a homology screen or a regulatory clearance. Guide scores are not editing efficiencies. Optional weight files are not a benchmark in this preprint.

The ESMFold route uploads a protein sequence. The iGEM route contacts a registry. A flux-balance model may be downloaded from BiGG on first use. Unpublished sequences should stay on the ODE, SSA, and Rust compiler paths unless a network call is intended. This work received no specific funding. Community issues are best-effort. Paid services listed in `SERVICES.md` are separate from the AGPL-3.0 licence.

## 5. Availability

Source code: https://github.com/jorgegn29/Synbio-studio

Archived release: Guillem Najarro, J. (2026). SynBio Studio (v1.0.3). Zenodo. https://doi.org/10.5281/zenodo.23436206

Windows installer: the asset on https://github.com/jorgegn29/Synbio-studio/releases/latest

Browser preview: https://huggingface.co/spaces/jorgegn29/synbio-studio

A project page with the same scope is published from `docs/` in the repository.

## 6. Competing interests

The author offers paid consulting, integration, training, and support around this software, as described in the repository’s `SERVICES.md`. The software itself is AGPL-3.0. That commercial offer did not change the licence or the contents of the public source described here.

## 7. Author contribution

Jorge Guillem Najarro designed the software and wrote this draft.

## 8. Acknowledgements

The implementation depends on SBOL, SBML, and the other open tools and standards cited below. This work received no specific funding.

## 9. AI-usage disclosure

> **TODO (author):** Replace this section before the manuscript is posted. State which parts of the code, tests, documentation, and this draft were produced with generative-AI assistance, what you reviewed yourself, and which design decisions were yours. Do not upload the preprint until this section is in your own words.

<!-- TO BE COMPLETED BY THE AUTHOR before bioRxiv submission. This draft was prepared with AI assistance. The human author must describe the scope of that assistance and confirm review of the scientific claims. -->

## References

Chandran, D., Bergmann, F. T., and Sauro, H. M. (2009). TinkerCell: modular CAD tool for synthetic biology. Journal of Biological Engineering 3, 19. https://doi.org/10.1186/1754-1611-3-19

Chen, J., Densmore, D., Ham, T. S., Keasling, J. D., and Hillson, N. J. (2012). DeviceEditor visual biological CAD canvas. Journal of Biological Engineering 6, 1. https://doi.org/10.1186/1754-1611-6-1

Doench, J. G., Fusi, N., Sullender, M., Hegde, M., Vaimberg, E. W., Donovan, K. F., Smith, I., Tothova, Z., Wilen, C., Orchard, R., Virgin, H. W., Listgarten, J., and Root, D. E. (2016). Optimized sgRNA design to maximize activity and minimize off-target effects of CRISPR-Cas9. Nature Biotechnology 34, 184–191. https://doi.org/10.1038/nbt.3437

Elowitz, M. B., and Leibler, S. (2000). A synthetic oscillatory network of transcriptional regulators. Nature 403, 335–338. https://doi.org/10.1038/35002125

Galdzicki, M., Clancy, K. P., Oberortner, E., et al. (2014). The Synthetic Biology Open Language (SBOL) provides a community standard for communicating designs in synthetic biology. Nature Biotechnology 32, 545–550. https://doi.org/10.1038/nbt.2891

Gillespie, D. T. (1977). Exact stochastic simulation of coupled chemical reactions. The Journal of Physical Chemistry 81, 2340–2361. https://doi.org/10.1021/j100540a008

Hillson, N. J., Rosengarten, R. D., and Keasling, J. D. (2012). j5 DNA assembly design automation software. ACS Synthetic Biology 1, 14–21. https://doi.org/10.1021/sb2000116

Hucka, M., Finney, A., Sauro, H. M., et al. (2003). The systems biology markup language (SBML): a medium for representation and exchange of biochemical network models. Bioinformatics 19, 524–531. https://doi.org/10.1093/bioinformatics/btg015

Lattner, C., and Adve, V. (2004). LLVM: a compilation framework for lifelong program analysis and transformation. In International Symposium on Code Generation and Optimization (CGO 2004), pp. 75–86. https://doi.org/10.1109/CGO.2004.1281665

Myers, C. J., Barker, N., Jones, K., Kuwahara, H., Madsen, C., and Nguyen, N.-P. D. (2009). iBioSim: a tool for the analysis and design of genetic circuits. Bioinformatics 25, 2848–2849. https://doi.org/10.1093/bioinformatics/btp457

Nielsen, A. A. K., Der, B. S., Shin, J., Vaidyanathan, P., Paralanov, V., Strychalski, E. A., Ross, D., Densmore, D., and Voigt, C. A. (2016). Genetic circuit design automation. Science 352, aac7341. https://doi.org/10.1126/science.aac7341

Orth, J. D., Thiele, I., and Palsson, B. Ø. (2010). What is flux balance analysis? Nature Biotechnology 28, 245–248. https://doi.org/10.1038/nbt.1614

Rodrigo, G., and Jaramillo, A. (2013). AutoBioCAD: full biodesign automation of genetic circuits. ACS Synthetic Biology 2, 230–236. https://doi.org/10.1021/sb300084h

Guillem Najarro, J. (2026). SynBio Studio (v1.0.3). Zenodo. https://doi.org/10.5281/zenodo.23436206
