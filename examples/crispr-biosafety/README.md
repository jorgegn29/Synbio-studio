# CRISPR guides and a biosafety keyword scan

This tutorial calls two TypeScript modules the VS Code panels already use.

- [`client/src/crispr-guides.ts`](../../client/src/crispr-guides.ts) searches a DNA string for SpCas9 guides (20 bp spacer, 3' `NGG`). The score is a short heuristic inspired by Doench et al. 2016 and Hsu et al. 2013. It is not Rule Set 2, and off-target counts are computed only inside the fragment you pass in.
- [`client/src/biosecurity-rules.ts`](../../client/src/biosecurity-rules.ts) scans design text for case-insensitive substrings (`ccdB`, `cat`, `bla`, and the other patterns in that file). It does not align the DNA to a pathogen database. A design longer than 50 characters with no kill-switch wording also gets finding `STRUCT-001`.

The target is the 5' end of the commonly used EGFP coding sequence, in [`egfp-target.dna`](egfp-target.dna) (117 bp).

## Commands

From the repository root:

```bash
npm ci
cd client && npx tsx ../examples/crispr-biosafety/run.ts
```

`npm ci` at the root installs the client workspace, including `tsx`.

## Expected output

The script prints JSON. A run of this tree produced:

```json
{
  "sequence_bp": 117,
  "guide_count": 19,
  "top_guides": [
    {
      "spacer": "GGGCGAGGAGCTGTTCACCG",
      "pam": "GGG",
      "strand": "+",
      "position": 11,
      "gc": 70,
      "on_target": 81,
      "off_target": 100,
      "overall": 87
    },
    {
      "spacer": "GACCAGGATGGGCACCACCC",
      "pam": "CGG",
      "strand": "-",
      "position": 31,
      "gc": 70,
      "on_target": 78,
      "off_target": 100,
      "overall": 86
    },
    {
      "spacer": "GCCGTCCAGCTCGACCAGGA",
      "pam": "TGG",
      "strand": "-",
      "position": 43,
      "gc": 70,
      "on_target": 75,
      "off_target": 100,
      "overall": 85
    }
  ],
  "scans": [
    {
      "file": "egfp-guide.bio",
      "findings": [
        "ABR003-L7 medium Resistencia a Cloranfenicol (CmR)",
        "STRUCT-001 medium Kill Switch No Detectado"
      ]
    },
    {
      "file": "egfp-guide-ccdb.bio",
      "findings": [
        "TOX001-L1 high Toxina CcdB",
        "TOX001-L7 high Toxina CcdB",
        "ABR003-L8 medium Resistencia a Cloranfenicol (CmR)",
        "STRUCT-001 medium Kill Switch No Detectado"
      ]
    }
  ]
}
```

Read those hits literally:

- `ABR003` fires because the letters `cat` occur inside the EGFP fragment (`GCCCATCCT`). The rule's pattern is the three letters `cat`, which the file also uses for a chloramphenicol resistance keyword. This fragment is not a chloramphenicol gene. The hit is how the current scanner behaves.
- `STRUCT-001` fires because neither design contains the text `kill_switch`.
- `TOX001` fires twice on `egfp-guide-ccdb.bio`: the circuit name `EgfpGuideCcdB` contains `CcdB`, and so does `product: "CcdB"`.

The script exits with an error if the top guide is not a 20 bp spacer with an `NGG` PAM, if the clean file misses `STRUCT-001` or `ABR003`, or if the CcdB file misses `TOX001`. GitHub Actions runs this command on Ubuntu.
