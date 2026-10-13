# ✏️ Crear un Circuito Genético

Un circuito genético en BioScript se compone de **Transcription Units (TUs)**:

```bioscript
circuit MiCircuito {
    transcription_unit TU_1 {
        promoter: J23100     // promotor constitutivo
        rbs: B0034           // sitio de unión al ribosoma
        gene: GFP { ... }    // gen a expresar
        terminator: B0015    // terminador doble
    }
}
```

## Cada TU necesita (en orden):
1. **Promoter** — controla cuándo se expresa
2. **RBS** — controla cuánto se traduce
3. **Gene** — la proteína que produces
4. **Terminator** — señal de parada transcripcional

## Quick Start
- `Ctrl+Shift+P` → "SynBio: Tour Guiado" para un archivo con tutorial incluido
