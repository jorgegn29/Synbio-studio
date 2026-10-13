# SynBio-LLVM Web Demo 🧬

**Interactive Genetic Circuit IDE — in your browser.**

> Diseña, compila y simula circuitos genéticos sin instalar nada.

## ✨ Características

| Feature | Descripción |
|---------|-------------|
| **Monaco Editor** | Editor de código con syntax highlighting completo para BioScript |
| **Compilador en tiempo real** | Parser + validador con 7+ tipos de diagnósticos |
| **Visualización SBOL** | Diagramas SVG de circuitos con partes estándar |
| **Simulación Gillespie** | Simulación estocástica con parámetros reales (Elowitz 2000) |
| **Exportar** | SBOL 3.0 XML, FASTA, GenBank |
| **6 ejemplos** | Hello Biology, Toggle Switch, Repressilator, Biosensor, AND Gate, Quorum Sensing |

## 🚀 Desarrollo local

```bash
cd web-demo
npm install
npm run dev
# → http://localhost:3000
```

## 📦 Build para producción

```bash
npm run build
# Genera static site en /out
```

## 🌐 Deploy

El deploy a GitHub Pages es automático via el workflow `.github/workflows/deploy-demo.yml` al hacer push a `main`.

## 🏗️ Stack

- **Next.js 14** — React framework con static export
- **Monaco Editor** — El mismo editor de VS Code
- **Tailwind CSS** — Diseño responsivo con tema bio oscuro
- **TypeScript** — Type-safe en todo el proyecto
- **Canvas API** — Gráficas de simulación de alto rendimiento

## 📁 Estructura

```
web-demo/
├── src/
│   ├── app/
│   │   ├── layout.tsx       # Root layout + fonts + metadata
│   │   ├── page.tsx         # Página principal (orquestador)
│   │   └── globals.css      # Estilos globales + tema bio
│   ├── components/
│   │   ├── Header.tsx       # Navegación superior
│   │   ├── BioEditor.tsx    # Monaco Editor wrapper
│   │   ├── ExamplesPanel.tsx# Panel lateral de ejemplos
│   │   ├── CircuitView.tsx  # Visualización SVG de circuitos
│   │   ├── SimulationView.tsx # Gráfica de simulación Gillespie
│   │   ├── DiagnosticsView.tsx # Panel de errores/warnings
│   │   └── ExportModal.tsx  # Modal de exportación
│   └── lib/
│       ├── compiler.ts      # BioScript lexer + parser + validator
│       ├── simulator.ts     # Gillespie SSA engine
│       ├── examples.ts      # 6 circuitos pre-cargados
│       └── monaco-bioscript.ts # Language definition para Monaco
├── tailwind.config.ts       # Tema bio con colores DNA
├── next.config.js           # Static export para GitHub Pages
└── package.json
```

## 📊 Métricas

- **14 archivos** de código fuente
- **~2,500 líneas** de TypeScript/TSX
- **7 tipos de diagnósticos** del compilador
- **6 ejemplos** con papers científicos reales citados
- **3 formatos de exportación** (SBOL 3.0, FASTA, GenBank)
- **0 dependencias de servidor** — 100% estático
