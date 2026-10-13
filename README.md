# SynBio-LLVM — Ecosistema completo para biología sintética programable

> **El IDE profesional de biología sintética**: diseña, compila, simula, revisa bioseguridad y prepara laboratorio en un solo flujo — desde BioScript hasta LLVM IR, SBOL, SBML y OpenTrons.

![Version](https://img.shields.io/badge/version-1.0.0-blue)
![License](https://img.shields.io/badge/license-MIT%20%2F%20AGPL--3.0-green)
![Platform](https://img.shields.io/badge/platform-Windows%20%7C%20Linux-purple)
![Code](https://img.shields.io/badge/código-~240k%20LOC-orange)

---

## Visión general

SynBio-LLVM trata los circuitos genéticos como **programas de software**. El ecosistema incluye:

| Componente | Descripción |
|------------|-------------|
| **[SynBio Studio](synbio-studio/)** | Aplicación de escritorio (Electron) — producto principal |
| **SynBio-LLVM Compiler** | BioScript → LLVM IR → SBOL / SBML / OpenTrons / protocolo |
| **Servidor LSP (Rust)** | Autocompletado, diagnósticos y análisis en tiempo real |
| **Motor Python / ML** | FastAPI local: FBA, Gillespie, CodonBERT, ESMFold, tutor IA |
| **Extensión VS Code** | Cliente alternativo con 27 comandos (`client/`) |

**Escala del código propio:** ~223.000 líneas JavaScript, ~16.300 líneas Rust, 71 motores en `synbio-studio/src/panels/`, 54 herramientas interactivas, 17 paneles de actividad.

---

## SynBio Studio — qué hace la plataforma

SynBio Studio es un **IDE de escritorio offline-first** para biología sintética. Integra en una sola aplicación lo que hoy suele requerir SnapGene + Benchling + simuladores + scripts Python + documentos sueltos.

### 17 paneles de actividad

| Panel | Capacidades principales |
|-------|-------------------------|
| **SynBio Explorer** | Proyecto, workspace multi-proyecto, archivos, 54 herramientas, 31 organismos, 50 papers, 40 recursos externos, modos DBTL (Diseño / Construcción / Análisis) |
| **Mapa Vivo** | Grafo operativo: hipótesis, constructos, variantes, evidencia, simulaciones, protocolos, riesgos, decisiones; conexión visual entre nodos |
| **Workflows guiados** | 6 flujos: biosensor, optimizar CDS, validar circuito, CRISPRi, ingeniería metabólica, construcción de plásmido |
| **Buscar** | Búsqueda semántica biológica (partes, circuitos, organismos, BSL, traits) |
| **Biblioteca de Partes** | 56+ partes en 10 categorías, motor de decisiones, inserción en editor/canvas |
| **Simulación** | ODE, Gillespie SSA, FBA, digital twin, GO/NO-GO, biological debugger, sensibilidad, ajuste a datos |
| **Diseñador de Circuitos** | Canvas visual + BioCAD con 14 pestañas de investigación, Design Oracle |
| **Lab Run Center** | Experimentos del día, DOE, inventario, protocolos |
| **Resultados** | Import CSV/FCS, QC, ranking de variantes, pre-lab gates |
| **Atlas Translacional** | Hipótesis, datasets, escenarios, ranking de candidatos, dossiers |
| **Bioseguridad** | DURC, BSL, QMRA, fault trees, ISO 31000, 40+ módulos de compliance |
| **Tutoriales** | Documentación integrada |
| **Diff/Merge biológico** | Comparación de versiones de diseños |
| **Bookmarks** | Navegación y marcadores |
| **Outline biológico** | Workbench estructural del diseño BioScript |
| **Git** | Control de versiones completo (status, commit, branch, stash, blame, diff) |
| **Configuración** | Tema, BSL, telemetría opt-in, bóveda de secretos, extensiones |

### 10 pestañas del panel inferior

| Pestaña | Salida |
|---------|--------|
| Output | Logs de compilación y LSP |
| Problems | Diagnósticos BioScript |
| Terminal | Shell integrado (xterm + node-pty) |
| Ports | Servicios locales |
| **LLVM IR** | Representación intermedia del compilador |
| **SBOL / SBML** | Estándares de intercambio biológico |
| **OpenTrons** | Protocolo JSON para OT-2 |
| **Cost** | Estimación de síntesis de ADN |
| **Protocol** | Protocolo wet-lab en texto |
| **Analysis** | Informe MIR de optimización |

### 54 herramientas del toolbox (8 familias)

#### Diseño genético (8)
Genetic Circuit Workbench · Codon Engineering Studio (CodonBERT) · Promoter Engineering · RBS Engineering · Restriction Mapping · Plasmid Map Viewer · Gibson Assembly · Golden Gate Planner

#### Análisis de secuencias (7)
BLAST Search · ORF Finder · GC Content Analyzer · Primer Designer · Sequence Aligner · Tm Calculator · Repeat Finder

#### Simulación (7)
Gillespie SSA · ODE Solver · FBA · CRISPR Simulator · Growth Predictor · Circuit Debugger · Pathway Analyzer

#### Seguridad (6)
Biosecurity Scanner · BSL Classifier · Toxin Detector · Kill Switch Designer · Containment Checker · Export Compliance

#### Laboratorio (7)
Protocol Generator · ELN Manager · Parts Inventory · Plate Designer · Equipment Tracker · Opentrons Control · Hamilton STAR

#### AI / ML (6)
Scientific Copilot · Auto-Corrector · Design Rule Checker · Design Optimizer · Protein Predictor · Anomaly Detector

#### Datos (8)
Data Moat Manager · Experiment Logger · Statistics Dashboard · Export Manager · Import Wizard · Build System (`synbio.build.yaml`) · Benchling Sync · Extension Marketplace

#### Registros (5)
iGEM Registry · Addgene Browser · SynBioHub · NCBI GenBank · UniProt Search

### Workbenches a pantalla completa

- **Mapa Vivo del Programa** — grafo de decisiones y trazabilidad del programa biológico
- **Atlas Translacional** — investigación traslacional e hipótesis clínicas
- **Workbench de Bioseguridad** — ingeniería de riesgo cuantitativa
- **Circuit Canvas + BioCAD** — diseño visual con 14 pestañas de análisis
- **Outline biológico** — estructura del diseño
- **Lab Notebook (ELN)** — protocolos, kanban, firmas, compliance
- **Design Review** — revisión formal de diseños
- **OpenTrons deck** — editor de deck y monitor de ejecución
- **Python API Engine** — cliente del motor científico local (FastAPI @ :8765)
- **Extension Marketplace** — extensiones `.synbio.vsix`

### Pipeline BioScript → laboratorio

```
BioScript (.bio)  →  Compilador  →  LLVM IR
                         ↓
              ┌──────────┼──────────┐
              ↓          ↓          ↓
           SBOL 3.0   SBML L3   OpenTrons JSON
              ↓          ↓          ↓
         Protocolo   Coste ADN   Análisis MIR
```

### Capacidades transversales

- **Editor Monaco** con LSP (Rust), IntelliSense, snippets, diagnósticos, minimapa, multicursor
- **Colaboración en tiempo real** (WebSocket + CRDT, presencia, chat)
- **Seguridad:** CSP, bóveda de secretos, sandbox de extensiones, telemetría opt-in (Sentry)
- **Instrumentos:** plate reader, FCS/citometría, NGS, import wizard
- **Estándares:** SBOL visual, FASTA, GenBank, ISA export, BioBrick RFC[10]
- **Distribución:** Windows (Inno + portable), Linux (AppImage/DEB/Snap)

---

## Compilador SynBio-LLVM y extensión VS Code

Además de SynBio Studio, el repositorio incluye el **compilador original** y una **extensión VS Code** con 27 comandos:

### Comandos VS Code (27)

| Fase | Comandos |
|------|----------|
| Core | `startServer`, `showDashboard`, `exportGenBank`, `exportFASTA`, `exportSBOL` |
| Simulación | `runSimulation`, `optimizeCodons`, `thermodynamics`, `restrictionAnalysis`, `proteinAnalysis` |
| Seguridad | `partsLibrary`, `biosecurityScan` |
| Profesional | `generateProtocol`, `designRuleCheck`, `runBioTests`, `geneticDebugger` |
| Avanzado | `aiAssistant`, `geneticVersionControl`, `autoDocumentation`, `pathwayDesigner` |

### Precisión científica

Todos los parámetros numéricos provienen de literatura publicada — **sin valores inventados**.

| Área | Fuente |
|------|--------|
| Cinética Repressilator | Elowitz & Leibier (2000) Nature 403:335 |
| Degradación mRNA/proteína | Bernstein et al. (2002); Andersen et al. (1998) |
| Termodinámica ADN | SantaLucia (1998) PNAS 95:1460 |
| Codones | Kazusa DB + CAI (Sharp & Li 1987) |
| Enzimas metabólicas | BRENDA (Schomburg et al. 2017) |
| Partes iGEM | Kelly et al. (2009) RPU standard |
| Bioseguridad | NIH Guidelines, 42 CFR §73, EU 2009/41/EC |

> Lista completa de 34+ referencias al final del documento original en [TECHNICAL_README.md](TECHNICAL_README.md).

---

## Arquitectura

```
┌─────────────────────────────────────────────────────────────────────┐
│                     SynBio Studio (Electron)                         │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌─────────┐ │
│  │ Explorer │ │ Mapa     │ │ Canvas   │ │ Simulac. │ │ Bio-    │ │
│  │ 54 tools │ │ Vivo     │ │ Circuit  │ │ + Twin   │ │ safety  │ │
│  └────┬─────┘ └────┬─────┘ └────┬─────┘ └────┬─────┘ └────┬────┘ │
│       └────────────┴────────────┴────────────┴──────────────┘       │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │ 71 motores JS: tool-panels, sim, blast, opentrons, git, …   │   │
│  └──────────────────────────┬───────────────────────────────────┘   │
└─────────────────────────────┼───────────────────────────────────────┘
                              │
         ┌────────────────────┼────────────────────┐
         │                    │                    │
  ┌──────┴──────┐    ┌────────┴────────┐  ┌─────┴──────┐
  │ Rust LSP    │    │ Compilador        │  │ Python ML  │
  │ synbio-lsp  │    │ BioScript→LLVM IR │  │ FastAPI    │
  │ ~16k LOC    │    │ SBOL/SBML/OT-2    │  │ CodonBERT  │
  └─────────────┘    └───────────────────┘  │ ESMFold    │
                                             └────────────┘
```

---

## Instalación

### SynBio Studio (recomendado)

```bash
cd synbio-studio
npm install
npm run build:lsp      # Compila servidor LSP (Rust)
npm run build:python   # Empaqueta motor Python (opcional)
npm start
```

### Extensión VS Code

```bash
cd server && cargo build --release
cd ../client && npm install && npm run build
code --extensionDevelopmentPath=./client
```

### Tests automatizados

```bash
cd synbio-studio
npm run test:program-map    # Mapa Vivo
npm run test:explorer       # SynBio Explorer (todos los botones)
npm run test:outline        # Outline biológico
npm run test:platform-gauntlet
```

---

## Estructura del repositorio

```
SynBio-LLVM-Proyecto/
├── synbio-studio/              # ★ Aplicación de escritorio principal
│   ├── src/panels/             # 71 motores (app.js, program-map, biosafety…)
│   ├── src/index.html          # Shell UI: 17 paneles + 10 bottom tabs
│   ├── main.js                 # Proceso Electron: Git, compile, IPC, vault
│   └── tests/                  # Gauntlets Electron automatizados
├── server/                     # Servidor LSP en Rust
├── client/                     # Extensión VS Code (TypeScript)
├── python-engine/              # Motor científico FastAPI + ML
├── README.md                   # Este archivo
├── README-IMPACTO.md           # Visión de impacto social y científico
├── TECHNICAL_README.md         # Documentación técnica detallada
└── ROADMAP.md                  # Hoja de ruta pública
```

---

## Comparación con herramientas existentes

| Capacidad | SynBio Studio | Benchling | SnapGene | Cello |
|-----------|:-------------:|:---------:|:--------:|:-----:|
| IDE de escritorio offline | ✅ | ❌ (cloud) | ✅ | ❌ |
| Lenguaje propio (BioScript) | ✅ | ❌ | ❌ | Verilog |
| Compilador → LLVM IR | ✅ | ❌ | ❌ | Parcial |
| 54 herramientas integradas | ✅ | Parcial | ❌ | ❌ |
| Simulación (ODE/SSA/FBA) | ✅ | ❌ | ❌ | Limitado |
| Mapa Vivo / trazabilidad | ✅ | ❌ | ❌ | ❌ |
| Bioseguridad cuantitativa | ✅ | ❌ | ❌ | ❌ |
| OpenTrons OT-2 | ✅ | Parcial | ❌ | ❌ |
| Git + colaboración RT | ✅ | Parcial | ❌ | ❌ |
| ELN + Lab Run Center | ✅ | ✅ | ❌ | ❌ |
| IA / ML integrada | ✅ | Parcial | ❌ | ❌ |
| Open source | ✅ AGPL | ❌ | ❌ | ✅ |
| Parámetros de 34+ papers | ✅ | N/A | N/A | Limitado |

---

## Catálogos integrados

| Catálogo | Cantidad |
|----------|----------|
| Herramientas del toolbox | 54 |
| Partes genéticas | 56+ (10 categorías) |
| Organismos / chassis | 31 (6 categorías) |
| Papers curados | 50 |
| Recursos externos | 40 |
| Workflows guiados | 6 |
| Motores / paneles JS | 71 |

---

## Documentación adicional

| Archivo | Contenido |
|---------|-----------|
| [synbio-studio/README.md](synbio-studio/README.md) | Visión del producto y casos de uso |
| [README-IMPACTO.md](README-IMPACTO.md) | Impacto en medicina, clima, educación, economía |
| [TECHNICAL_README.md](TECHNICAL_README.md) | Arquitectura técnica y APIs |
| [ROADMAP.md](ROADMAP.md) | Hoja de ruta |
| [synbio-studio/docs/PRESENTACION-EJECUTIVA-SYNBIO-STUDIO-EMPRESAS.md](synbio-studio/docs/PRESENTACION-EJECUTIVA-SYNBIO-STUDIO-EMPRESAS.md) | Dossier corporativo |

---

## Licencia

- **Repositorio raíz** (compilador, extensión VS Code, servidor Rust): [MIT](LICENSE)
- **SynBio Studio** (aplicación de escritorio): [AGPL-3.0](synbio-studio/package.json)

---

## Cita

```bibtex
@software{synbio_llvm_2026,
  title = {SynBio-LLVM: Compiler IDE and SynBio Studio for Genetic Circuit Design},
  year = {2026},
  url = {https://github.com/synbiostudio/synbio-studio},
  note = {Desktop IDE with BioScript compiler, 54 tools, LLVM IR, SBOL/SBML, and 34+ published parameter sources}
}
```
