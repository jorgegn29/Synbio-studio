# 🔬 Compilar tu Circuito

El compilador SynBio-LLVM transforma tu código BioScript en formatos estándar de biología sintética.

## Formatos de Salida

| Formato | Uso |
|---------|-----|
| **SBOL 3.0** | Estándar international (XML/RDF) |
| **FASTA** | Secuencias para pedidos de ADN |
| **GenBank** | Compatible con Benchling, SnapGene |
| **CSV** | Datos tabulares para análisis |

## Cómo compilar

- **Atajo**: `Ctrl+Shift+B`
- **Comando**: `Ctrl+Shift+P` → "SynBio: Compilar Circuito Genético"

## Qué hace el compilador
1. **Análisis léxico** — tokeniza tu código BioScript
2. **Parsing** — construye un AST tipado
3. **Bio-IR** — genera representación intermedia biológica
4. **Validación** — verifica reglas de diseño (13 reglas)
5. **CodeGen** — genera SBOL/FASTA/GenBank
6. **Insulation** — inserta terminadores/spacers automáticamente
