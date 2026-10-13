# 🛡️ Bioseguridad

SynBio-LLVM incluye herramientas de bioseguridad integradas según regulaciones internacionales.

## Clasificación BSL Automática

Según BMBL 6th Edition (CDC/NIH):
- **BSL-1**: Organismos no patógenos (E. coli K-12, S. cerevisiae)
- **BSL-2**: Patógenos moderados (S. aureus, P. aeruginosa) 
- **BSL-3**: Patógenos serios (M. tuberculosis)
- **BSL-4**: Agentes letales sin tratamiento

## Escáner de Bioseguridad

22 reglas contra:
- Lista de agentes selectos CDC/USDA
- Regulaciones NIH Dual Use Research
- Directivas EU 2000/54/EC
- Protocolo de Cartagena (CBD)

## Cómo usar
- `Ctrl+Shift+P` → "SynBio: Clasificar BSL"
- `Ctrl+Shift+P` → "SynBio: Biosecurity Scan"
- Revisa el panel "Estado de Bioseguridad" en la barra lateral

## Comando de Bioseguridad
El clasificador analiza tu organismo chassis y asigna nivel BSL automáticamente con citas a la sección específica del BMBL.
