# SynBio Studio, without the brochure

SynBio Studio is an open-source attempt to treat a genetic circuit as something you can write down, check, and hand to another program. The public repository is [github.com/jorgegn29/Synbio-studio](https://github.com/jorgegn29/Synbio-studio), licensed AGPL-3.0. The author is Jorge Guillem Najarro. A snapshot is on Zenodo as [10.5281/zenodo.23436206](https://doi.org/10.5281/zenodo.23436206).

This article describes the source a reader can clone. It is not a laboratory validation, a user study, or a finished desktop IDE. Older notes in the same repository have said those things. The code does not currently support them.

## What the clone actually builds

Four directories matter.

`server/` is a Rust binary, `synbio-lsp`. With no arguments it speaks the Language Server Protocol on stdin and stdout: completion, hover, and diagnostics for a small language called BioScript. `synbio-lsp --compile-full` reads BioScript from stdin and writes one JSON object. That object can carry SBOL, SBML, FASTA, GenBank, LLVM IR text, an OpenTrons Python script, and a Markdown protocol. The LLVM IR is text. The crate does not link against LLVM and does not run `opt` or `llc`. When `sbol3` and `python-libsbml` are installed, the Rust tests ask those libraries to check the SBOL and SBML. Without them the check is skipped. Continuous integration installs the validators.

`python-engine/` is a FastAPI app on `127.0.0.1:8765`. A fresh install can compile with its own parser, integrate ODEs, and run Gillespie's algorithm. That Python parser is not the Rust compiler. Its SBOL-like XML is not the document pySBOL3 checks. The ODE route takes species, reactions, and arithmetic rate laws and calls `scipy.integrate.solve_ivp`. The Gillespie route takes reactions whose propensities are constants. GillesPy2 is used when it imports. Otherwise a built-in direct method runs. Hill functions belong on the ODE route. They do not fit the SSA route.

Other routes need extra software or the network. Flux balance analysis needs COBRApy and a model file. Alignment needs MUSCLE or Clustal Omega. RNA folding uses ViennaRNA, or a Nussinov approximation whose energy is a pair count. BLAST needs BLAST+ on `PATH`. Promoter, codon, and CRISPR off-target models load only with their weight files. ESMFold and the iGEM lookup call the public internet.

`client/` is a TypeScript tree aimed at a VS Code extension: codon tables, thermodynamics, restriction sites, a small flux-balance solver, a design-rule checker, a CRISPR guide panel, a biosafety scanner, and more. Headless Mocha tests cover the modules that do not need VS Code. The extension entry point, `client/src/extension.ts`, is empty, and the manifest registers no language and no commands. Opening the folder does not load the panels. Their pure functions can still be imported. The second tutorial does that.

`web-demo/` is a Next.js preview, also hosted at [huggingface.co/spaces/jorgegn29/synbio-studio](https://huggingface.co/spaces/jorgegn29/synbio-studio). People who want an installer rather than a compiler can download `SynBio-Studio-1.0.0-Windows-x64-Setup.zip` from the latest GitHub release. The Electron sources of that zip are not in this repository.

## A repressilator, compiled and then integrated

`examples/repressilator/` is the short path through the compiler and the engine.

The BioScript file is one circuit: three transcription units and three repression links, LacI against pLac, TetR against pTet, and cI against a lambda promoter. The tutorial builds `synbio-lsp` and pipes the file into `--compile-full`. The script checks that both SBOL and SBML mention LacI, TetR, and cI. That is the compile step. It does not produce a time series. The compiler does not turn a repression arrow into a differential equation.

The script writes the equation itself and calls the same function as the ODE route. The model is the symmetric Elowitz and Leibler repressilator: messenger decays at rate 1, protein tracks messenger with `beta = 0.2`, and transcription is `alpha / (1 + p^n) + alpha0` with `alpha = 216`, `alpha0 = 0.216`, and `n = 2`. That is a textbook setting, not a new fit. LacI protein then shows three peaks inside 120 time units and a maximum above 50. matplotlib draws the three traces.

The lower panel is a Gillespie run of one unregulated cassette: transcription 0.8, messenger decay 0.2, translation 1.4, protein decay 0.05, seed 2026. The SSA route cannot express a Hill function, so this is birth and death, not a stochastic ring. On the built-in solver the last sample is 4 messenger molecules and 58 protein molecules. GillesPy2, if installed, can change those integers. The script checks that two runs with the same seed match and that the protein count is not still zero.

GitHub Actions runs this on Ubuntu after `cargo test`, with SciPy and matplotlib and without GillesPy2.

## Guides, and a scanner that searches for words

`examples/crispr-biosafety/` does not start VS Code. It imports `findGuideRNAs` from `client/src/crispr-guides.ts` and `scanBiosecurityText` from `client/src/biosecurity-rules.ts`, the functions behind the CRISPR panel and the biosafety panel.

The target is 117 bp from the 5' end of the usual EGFP coding sequence. The guide function looks for a 20 bp spacer next to an NGG protospacer-adjacent motif, on either strand. The score uses GC content, a few position preferences, homopolymer penalties, and a hairpin check against a fixed scaffold. Off-target counting walks only those 117 bp. It does not see a genome. The search returns 19 guides. The top spacer is `GGGCGAGGAGCTGTTCACCG` with PAM `GGG`, forward strand, position 11, overall score 87. That number ranks guides inside this heuristic. It is not a measured cutting efficiency.

The biosafety function lowercases each BioScript file and searches for substrings. A file longer than 50 characters with no `kill_switch` wording gets `STRUCT-001`. The EGFP fragment contains `cat` inside `GCCCATCCT`, and a chloramphenicol rule uses that three-letter pattern, so the clean design reports a chloramphenicol hit. That is the scanner's behavior, not a property of EGFP. The second file is named `EgfpGuideCcdB` and sets `product: "CcdB"`, so the CcdB rule fires twice, at high severity.

This is a keyword list with a citation on each rule. It does not align DNA to a select-agent database.

## What a badge should not say

The repository does not contain the Electron application older READMEs called SynBio Studio, and it does not contain "71 engines". The VS Code extension does not activate. Emitted LLVM IR is not assembled by LLVM in CI. The Python compile route and the Rust compile route disagree. Optional neural-net files are import guards plus weights, not a reported benchmark. Nothing here shows that a circuit designed in this tree grew, fluoresced, or edited a genome.

What is here is a BioScript compiler with standards-shaped exporters, a local ODE and Gillespie service, and TypeScript libraries you can test without an editor. The tutorials are there so a reader can see the edges.

Clone the repository and install Node 18 or newer, Rust 1.85 or newer, and Python 3.10 or newer. The README has the commands. The Windows zip is the packaged desktop build. The Hugging Face Space is the browser preview. Issues are best-effort, from one maintainer. Consulting, integration, training, and paid support are in `SERVICES.md`. The license stays AGPL-3.0 either way.
