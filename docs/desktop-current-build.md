# Fold Studio, Protein Design, and Construct Forensics

On 9 November 2026 Jorge Guillem Najarro described three workbenches in his current desktop application, and asked for that description to be published on GitHub. This page follows that account. It describes that current desktop build. It does not describe a numbered release, and it is not an independent test of that build.

The Electron sources are not in this repository. The Windows file on the latest GitHub release is still the installer from 13 October 2026, attached again to [release v1.0.3](https://github.com/jorgegn29/Synbio-studio/releases/tag/v1.0.3) (published 17 October 2026):

| Item | Value |
|------|--------|
| Asset | `SynBio-Studio-1.0.0-Windows-x64-Setup.zip` |
| SHA-256 | `175344bd6f1788d5f4e9ff1bf29680185a334c90d8cc0287cbf6c512c5493e55` |
| Installer header | SynBio Studio 1.0.0 (Inno Setup 6.7.0) |
| `package.json` inside `app.asar` | version 1.0.0 |

A static reading of that `app.asar` did not contain Fold Studio Core, Protein Design Studio, Construct Forensics, a bundled 1BRS structure, ProteinMPNN model files, or a `.synprotein.json` project. Downloading release v1.0.3 does not install these three workbenches. No later public release asset was available when this page was written.

The three workbenches belong to the desktop application. They are not part of the sibling VS Code extension in [`client/`](../client/). That extension's entry point does not register commands.

## A path through the three workbenches

This is the walkthrough given by the author for his current desktop build. The commands in the rest of this repository do not open these workbenches.

1. Open Fold Studio on the included 1BRS example. No separate structure file is required for that example.
2. Walk the chains and residues, measure distances, and inspect Cα contacts inside one chain and between chains. Export the contacts and their distances as CSV.
3. Send the structure to Protein Design Studio. Choose the chain to design and keep selected positions, or ranges of positions, fixed.
4. Generate 1 to 32 candidate sequences with ProteinMPNN, setting the temperature and the seed. Alternatively, edit mutations by hand, exclude amino acids, or import FASTA. Compare the candidates, see the substitutions on the structure, and review the sequence properties the workbench calculates.
5. Export FASTA, CSV, or JSON. Save the project as a `.synprotein.json` file and open that file later.
6. Send a designed sequence back to Fold Studio and request a prediction to compare with the original structure. That prediction depends on the ESMFold service being available.
7. When observed construct sequences exist, open Construct Forensics. Compare up to eight references with up to 24 samples in one batch. Accepted inputs are FASTA, GenBank, DNA pasted as text, and Sanger AB1 files. AB1 base calls are treated as partial reads.
8. The identity matrix reports exact matches, including a circular sequence that starts at another position or appears on the reverse strand. A sample assigned to one design that matches another reference in the batch is flagged.
9. The forensic bank shows differences with coordinates and bases, and a map of the matching stretches. It can locate substitutions, insertions, and deletions, and it marks possible inversions, duplications, or reordered blocks. Recognized GenBank annotations relate findings to regions of the design.
10. The lot-fingerprint view looks for small changes repeated among samples assigned to the same design. Save the case file and open it again. Export the matrix and the findings as CSV. The JSON report includes SHA-256 fingerprints of the sequences.

The 1BRS example and the forensic batch are included demonstrations. The forensic batch is synthetic data. For other work, load your own files and save the case files.

## Fold Studio Core

Fold Studio opens PDB and ENT structure files and includes the 1BRS example. It is the structural workbench: chains, residues, distances, and Cα contacts within and between chains, with a CSV export of contacts and distances.

It can hand a structure directly to Protein Design Studio. A designed sequence can be sent back so Fold Studio can request a prediction and compare it with the original structure. The author states that this prediction depends on the ESMFold service being available.

## Protein Design Studio

The workbench takes a structure from a PDB file, from Fold Studio, or from the included 1BRS example. The chosen chain is the design context. Positions can be kept fixed one by one or as ranges, and those positions are shown on the structure.

ProteinMPNN generates 1 to 32 candidate sequences. Temperature and seed are configurable. The same workbench accepts manual mutations, amino-acid exclusions, and imported FASTA sequences. Candidates can be compared; substitutions are shown on the structure; sequence properties are calculated for review.

Exports are FASTA, CSV, or JSON. A project is saved as `.synprotein.json`.

The author states that ProteinMPNN runs on the computer and that its code and weights are included with his application. Running it requires Python, PyTorch, and NumPy, and each computer needs a compatible Python environment. Designed sequences need experimental validation.

## Construct Forensics

Construct Forensics asks which observed sequence matches the expected design. One batch holds up to eight references and 24 samples. Inputs are FASTA, GenBank, pasted DNA, and Sanger AB1. AB1 base calls are partial reads.

The identity matrix recognizes an exact match when a circular sequence starts at another origin or is on the reverse strand. If a sample assigned to one design matches a different reference in the batch, the workbench flags that pair.

The forensic bank reports coordinates, bases, and matching blocks. It reports substitutions, insertions, and deletions, and it marks possible inversions, duplications, or reordered blocks as candidates. Recognized GenBank annotations connect findings to regions of the design. The lot fingerprint groups small changes shared by samples assigned to the same design.

The case file can be saved and reopened. The matrix and findings export as CSV. The JSON report includes SHA-256 fingerprints of the sequences.

Ambiguous or repetitive regions may remain unresolved. Inversions and duplications are candidates. The included forensic batch is synthetic.

## How the author places them in the application

The author describes the three workbenches as additions to tools already in his desktop application: the BioScript editor, the circuit canvas, simulation, Mapa Vivo, Atlas Translacional, Chassis Studio, Lab Run Center, and Results. Fold Studio explores a structure, Protein Design proposes sequences compatible with that structure, and Construct Forensics compares sequenced samples with the design references.

Those neighboring names are present as panels in the inspected v1.0.0 installer. In that same package, the Chassis Studio workbench text marks its view as conceptual and pre-laboratory. This page does not restate those panels as a feature inventory.

## Limits stated by the author

The workbenches organize and review computational results.

- A prediction requested from Fold Studio for a designed sequence depends on the ESMFold service.
- ProteinMPNN needs Python, PyTorch, and NumPy on that computer, even though the author says the model code and weights are included with his application.
- AB1 base calls are partial reads.
- Ambiguous or repetitive regions may stay unresolved.
- Inversions and duplications are marked as candidates.
- The 1BRS structure and the forensic batch are included demonstrations, and the forensic batch is synthetic.
- Designed sequences need experimental validation.

This repository does not report a laboratory confirmation of those sequences, a biosafety certification, or a measured economic result.

## What the public tree and the published installer do contain

These are separate surfaces. They are not the three workbenches above.

In this repository, [`POST /api/structure/esmfold`](../python-engine/server.py) is an optional helper that sends a protein sequence to Meta's public ESMFold API. The helper accepts 10 to 400 amino acids and needs the optional `httpx` install. It does not load 1BRS, overlay a design on a template, or run ProteinMPNN. [`python-engine/models/`](../python-engine/models/) does not contain ProteinMPNN weights. [`client/src/real-protein-analysis.ts`](../client/src/real-protein-analysis.ts) calculates ProtParam-style properties. [`client/src/sequence-alignment.ts`](../client/src/sequence-alignment.ts) implements pairwise alignment; the extension entry point does not register it.

In the inspected v1.0.0 installer, the protein-structure panel fetches models from AlphaFold DB or RCSB. Its ESMFold tab calls the public API through the packaged Python engine. The name ProteinMPNN appears there only as a link to <https://github.com/dauparas/ProteinMPNN>. The AB1 importer reads one chromatogram and can align it to one expected sequence; it does not run the batch comparison described above.
