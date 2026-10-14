# SynBio-LLVM — Compilador de Circuitos Genéticos

<p align="center">
  <strong>🧬 El primer IDE completo para programar biología sintética.</strong><br>
  Escribe circuitos genéticos en BioScript · Compila a ADN · Simula con Gillespie SSA · Exporta a SBOL 3.0
</p>

<p align="center">
  <img src="https://img.shields.io/badge/version-0.8.0-3fb950?style=flat-square" />
  <img src="https://img.shields.io/badge/VS%20Code-1.85+-58a6ff?style=flat-square&logo=visualstudiocode" />
  <img src="https://img.shields.io/badge/Rust-LSP%20Server-f85149?style=flat-square&logo=rust" />
  <img src="https://img.shields.io/badge/TypeScript-Extension-3178c6?style=flat-square&logo=typescript" />
  <img src="https://img.shields.io/badge/license-AGPL--3.0-d29922?style=flat-square" />
  <img src="https://img.shields.io/badge/commands-124-bc8cff?style=flat-square" />
  <img src="https://img.shields.io/badge/phases-18-f0883e?style=flat-square" />
</p>

---

## ✨ Características Principales

| Módulo | Descripción | Estado |
|--------|-------------|--------|
| 🧬 **BioScript Language** | Lenguaje tipado para circuitos genéticos con syntax highlighting, snippets y LSP | ✅ |
| 🦀 **Rust LSP Server** | Autocompletado, hover, diagnósticos en tiempo real | ✅ |
| 🎲 **Gillespie SSA** | Simulación estocástica exacta (Gillespie 1977) | ✅ |
| 📈 **ODE Solver (RK4)** | Simulación determinista con análisis de sensibilidad | ✅ |
| 🔬 **Visor Molecular 3D** | NGL Viewer integrado — proteínas y DNA desde RCSB PDB | ✅ |
| 🧪 **Optimización de Codones** | Tablas Kazusa reales para 4+ organismos, CAI score | ✅ |
| ✂️ **CRISPR Designer** | Diseño de gRNAs con scoring de eficiencia | ✅ |
| 🗺️ **Plasmid Map Viewer** | Visualización circular de plásmidos con ORFs y sitios de restricción | ✅ |
| 🛡️ **Bioseguridad** | 19+ reglas (NIH, WHO, EU), kill switch verification, audit trail | ✅ |
| 📊 **Flux Balance Analysis** | Simplex solver con modelo E. coli core | ✅ |
| 🧫 **Protocol Generator** | Gibson Assembly, PCR, purificación — volúmenes reales | ✅ |
| 🐛 **Genetic Debugger** | Step-through de circuitos con ODEs reales | ✅ |
| 🤖 **Scientific Copilot** | Asistente AI para diseño de circuitos | ✅ |
| 📋 **Experiment Planner** | Planificación de experimentos con timeline y checklist | ✅ |
| 🧬 **RNA Structure** | Predicción de estructura secundaria (Nussinov + Turner MFE) | ✅ |
| 🔬 **AlphaFold Lookup** | Consulta de estructuras 3D desde AlphaFold DB | ✅ |
| 📐 **Sequence Alignment** | Needleman-Wunsch, Smith-Waterman, dot plot | ✅ |
| 🧪 **Growth Curve Analyzer** | Análisis de curvas de crecimiento (Monod, logistic) | ✅ |
| 🔮 **Circuit Failure Predictor** | Predicción de fallos en circuitos genéticos | ✅ |
| 🧠 **Metabolic Digital Twin** | Gemelo digital metabólico en tiempo real | ✅ |

### 124 Comandos · 18 Fases · 65+ Módulos TypeScript

---

## 🚀 Instalación

### Desde VS Code Marketplace
1. Abre VS Code
2. `Ctrl+Shift+X` → Busca **SynBio-LLVM**
3. Instala y recarga

### Desde VSIX (manual)
```bash
code --install-extension synbio-llvm-client-0.8.0.vsix
```

---

## 📖 Uso Rápido

### 1. Crea un archivo `.bio`

```bioscript
circuit GFP_Reporter {
    promoter: BBa_J23100    // Anderson constitutive (strong)
    rbs:      BBa_B0034     // Standard RBS
    gene:     BBa_E0040     // GFP
    terminator: BBa_B0015   // Double terminator (>99.5%)

    organism: E_coli
    biosafety: BSL-1
}

sequence gfp = "ATGGTGAGCAAGGGCGAGGAGCTGTTCACCGGG"
```

### 2. Usa la paleta de comandos (`Ctrl+Shift+P`)

| Comando | Atajo | Descripción |
|---------|-------|-------------|
| `SynBio: Compilar Circuito` | `Ctrl+Shift+B` | Compila y valida |
| `SynBio: Simular (Gillespie)` | `Ctrl+Shift+G` | Simulación estocástica |
| `SynBio: Exportar SBOL` | — | Exporta a SBOL 3.0 XML |
| `SynBio: Exportar FASTA` | — | Genera FASTA multi-entry |
| `SynBio: Visor Molecular 3D` | — | Abre NGL Viewer |
| `SynBio: Depurar Circuito` | `F5` | Step-through genético |
| `SynBio: Bioseguridad Scan` | — | Escaneo de bioseguridad |
| `SynBio: RNA Structure` | — | Predicción MFE de RNA |
| `SynBio: AlphaFold Lookup` | — | Estructura 3D por UniProt ID |
| `SynBio: Alignment` | — | Alineamiento de secuencias |

---

## 🏗️ Arquitectura

```
SynBio-LLVM-Proyecto/
├── server/              # LSP Server (Rust + tower-lsp)
│   └── src/main.rs      # Parser, hover, completions
├── client/              # VS Code Extension (TypeScript)
│   ├── src/
│   │   ├── extension.ts           # Entry — 18 phases, 124 commands
│   │   ├── rna-structure-predictor.ts  # Nussinov + Turner + AlphaFold
│   │   ├── gillespie-simulator.ts # Stochastic simulation
│   │   ├── biosecurity-scanner.ts # 19+ detection rules
│   │   ├── circuit-failure-predictor.ts
│   │   ├── metabolic-digital-twin.ts
│   │   ├── ...65+ modules
│   │   └── test/
│   │       ├── unit/          # 8 unit test files
│   │       ├── integration/   # Cross-module tests
│   │       ├── smoke/         # Module health checks
│   │       ├── e2e/           # Command stability tests (124 cmds)
│   │       └── benchmarks/    # Scientific accuracy benchmarks
│   ├── syntaxes/        # TextMate grammar for BioScript
│   ├── snippets/        # 35+ code snippets
│   └── dist/            # Bundled extension (esbuild)
├── synbio-studio/       # Standalone IDE (Electron + Monaco)
│   ├── main.js          # Electron main process
│   ├── src/
│   │   ├── index.html   # IDE layout
│   │   ├── panels/
│   │   │   ├── app.js           # Monaco init, panel management
│   │   │   ├── circuit-canvas.js # SBOL Visual drag-and-drop
│   │   │   ├── sim-engine.js    # Gillespie SSA + RK4 ODE
│   │   │   ├── biosafety-engine.js # SecureDNA + Monte Carlo
│   │   │   ├── tool-panels.js   # 22 interactive tools
│   │   │   └── tool-panels-ext.js # 28 extended tools
│   │   └── styles/
│   └── package.json     # Electron Builder config
└── docs/                # Documentation
```

---

## 📊 Módulos Científicos

### Termodinámica (SantaLucia 1998)
- **ΔG** — Energía libre de Gibbs (nearest-neighbor)
- **Tm** — Temperatura de melting (SantaLucia unified)
- **ΔH/ΔS** — Entalpía y entropía
- **Hairpin** — Predicción de estructuras secundarias

### Simulación (Gillespie 1977 + RK4)
- **SSA** — Algoritmo exacto con τ exponencial
- **ODE** — Runge-Kutta 4th order
- **Sensitivity Analysis** — ±20% de parámetros
- **Digital Twin** — Gemelo digital en tiempo real

### RNA Structure (Nussinov + Turner 2004)
- **Nussinov Algorithm** — Maximización de pares de bases
- **Turner MFE** — Energías de stacking nearest-neighbor
- **Arc Diagram** — Visualización SVG interactiva
- **AlphaFold DB** — Lookup de estructuras 3D por UniProt ID

### Bioseguridad (NIH + WHO + EU)
- **19+ reglas** de detección de patógenos
- **Select Agent** screening (CDC/APHIS)
- **DURC** detection (gain-of-function)
- **Kill Switch** reliability simulation (Monte Carlo)
- **Audit Trail** — SHA-256 hash chain

---

## 🔬 Referencias Científicas

| Referencia | Uso |
|------------|-----|
| SantaLucia J. (1998) *PNAS* 95:1460 | Termodinámica DNA |
| Elowitz & Leibler (2000) *Nature* 403:335 | Repressilator |
| Gillespie DT. (1977) *J. Phys. Chem.* 81:2340 | SSA |
| Kelly JR et al. (2009) *J. Biol. Eng.* 3:4 | RPU |
| Salis HM et al. (2009) *Nat. Biotechnol.* 27:946 | RBS Calculator |
| Orth JD et al. (2010) *Nat. Biotechnol.* 28:245 | FBA |
| Turner & Mathews (2010) *NAR* 38:D280 | RNA thermo |
| Nussinov R et al. (1978) *SIAM J. Appl. Math.* 35:68 | RNA folding |
| Jumper J et al. (2021) *Nature* 596:583 | AlphaFold |

---

## ⚙️ Requisitos

- **VS Code** 1.85+
- **Windows** 10/11, **macOS** 12+, o **Linux**
- **Python** 3.9+ (opcional — motor de predicción de proteínas)

---

## 📝 Licencia

AGPL-3.0 — Libre para uso académico, investigación e industria.

---

<p align="center">
  <strong>🧬 SynBio-LLVM v0.8.0</strong> — Compilador de Sistemas Genéticos Dinámicos<br>
  <em>Escribe código, compila ADN.</em>
</p>
