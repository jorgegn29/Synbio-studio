# Repressilator: compile, then simulate

This tutorial uses two programs that are actually in the repository.

1. `synbio-lsp --compile-full` compiles [`repressilator.bio`](repressilator.bio) and emits SBOL and SBML.
2. The Python engine integrates an explicit model. The compiler does not build that model for you.

The ODE is the symmetric repressilator from Elowitz and Leibler (Nature, 2000), in dimensionless form:

```
dm_i/dt = -m_i + alpha / (1 + p_j^n) + alpha0
dp_i/dt = -beta * (p_i - m_i)
```

with `alpha = 216`, `alpha0 = 0.216`, `beta = 0.2`, and `n = 2`. LacI is repressed by cI, TetR by LacI, and cI by TetR. The ODE endpoint accepts arithmetic rate laws, so the Hill function is sent as text.

The Gillespie endpoint accepts a constant propensity per reaction, not a Hill function. The stochastic half of the script is therefore one unregulated transcription-translation cassette (transcription, decay, translation, protein decay), seeded with `2026`. It is not a stochastic repressilator.

## Commands

From the repository root, after the [Linux or macOS source install](../../README.md#install-from-source-linux-and-macos):

```bash
python -m pip install matplotlib
cargo build --manifest-path server/Cargo.toml
python examples/repressilator/run.py
```

`matplotlib` is only used to write the figure. The engine install (`pip install -e "./python-engine"`) already provides FastAPI, NumPy, and SciPy.

## Expected output

The script prints one JSON object and writes `examples/repressilator/output/repressilator.png`. On SciPy 1.18.1, NumPy 2.5.4, and the built-in SSA solver (`gillespy2` not installed), that JSON was:

```json
{
  "compiler": "synbio-lsp --compile-full",
  "sbol_characters": 25393,
  "sbml_characters": 12214,
  "ode_peaks_p_laci": [14.2, 44.6, 83.0],
  "ode_p_laci_max": 51.37,
  "ode_p_laci_final": 29.57,
  "ssa_solver": "SynBioDirectSSA",
  "ssa_protein_final": 58,
  "ssa_mrna_final": 4,
  "plot": "examples/repressilator/output/repressilator.png"
}
```

The pass checks, which GitHub Actions also runs on Ubuntu, are stricter than a screenshot and looser than those exact floats:

- SBOL and SBML both contain `LacI`, `TetR`, and `cI`.
- `p_laci` has at least three peaks and a maximum above 40.
- Two SSA runs with seed `2026` return the same trajectory, and the last protein count is greater than zero.
- The PNG file is written.

Peak times can shift slightly between SciPy releases. If `gillespy2` is installed, the engine uses it and `ssa_protein_final` can differ from 58. The figure has two panels: the three protein traces from the ODE, and mRNA plus protein from the seeded SSA.
