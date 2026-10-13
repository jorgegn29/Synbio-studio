# 📊 Simulación Gillespie SSA

Simula la dinámica estocástica de tu circuito genético usando el algoritmo de Gillespie (Stochastic Simulation Algorithm).

## Parámetros del modelo

Basados en Elowitz & Leibler (2000) Rep:
- **α (transcripción)**: 216 min⁻¹
- **γm (degradación mRNA)**: 0.3466 min⁻¹
- **γp (degradación proteína)**: 0.0693 min⁻¹

## Cómo simular

- **Atajo**: `Ctrl+Shift+S`
- **Comando**: `Ctrl+Shift+P` → "SynBio: Simular Circuito"

## Salida
- Gráfica temporal de concentraciones de mRNA y proteínas
- Análisis de período y amplitud de oscilaciones
- Estadísticas: media, varianza, coeficiente de variación

## Referencia
Gillespie, D.T. (1977). "Exact stochastic simulation of coupled chemical reactions." J. Phys. Chem. 81(25), 2340-2361.
