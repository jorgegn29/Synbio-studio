/**
 * Fallback RNA Folder
 * 
 * Implementación JavaScript pura del algoritmo de Nussinov para predicción
 * de estructura secundaria de RNA. Se usa cuando ViennaRNA WASM no está disponible.
 * 
 * Es menos preciso que ViennaRNA pero funciona en cualquier entorno JS.
 */

import type { RNAFoldResult, BasePairProbabilityMap, BasePair } from './index';

// Parámetros termodinámicos simplificados (Turner 2004)
const STACK_ENERGIES: Record<string, number> = {
    // Formato: 'XY/WZ' donde X-W y Y-Z son pares de bases apilados
    'CG/CG': -3.30, 'CG/GC': -2.40, 'CG/GU': -2.10, 'CG/UG': -1.40,
    'CG/AU': -2.10, 'CG/UA': -2.10, 'GC/CG': -2.40, 'GC/GC': -3.30,
    'GC/GU': -1.40, 'GC/UG': -2.10, 'GC/AU': -2.20, 'GC/UA': -2.10,
    'GU/CG': -2.10, 'GU/GC': -1.40, 'GU/GU': -0.50, 'GU/UG': -1.30,
    'GU/AU': -1.40, 'GU/UA': -0.60, 'UG/CG': -1.40, 'UG/GC': -2.10,
    'UG/GU': -1.30, 'UG/UG': -0.50, 'UG/AU': -0.60, 'UG/UA': -1.40,
    'AU/CG': -2.10, 'AU/GC': -2.20, 'AU/GU': -1.40, 'AU/UG': -0.60,
    'AU/AU': -0.90, 'AU/UA': -1.10, 'UA/CG': -2.10, 'UA/GC': -2.10,
    'UA/GU': -0.60, 'UA/UG': -1.40, 'UA/AU': -1.10, 'UA/UA': -0.90
};

// Penalizaciones de loops — Turner 2004 parameters (disponibles para cálculos avanzados)
export const HAIRPIN_LOOP_PENALTY: number[] = [
    Infinity, Infinity, Infinity, // 0, 1, 2 nucleótidos (no válidos)
    5.4, 5.6, 5.7, 5.4, 5.9, 5.6, 6.4, // 3-9 nucleótidos
    6.5, 6.6, 6.7, 6.8, 6.9, 7.0, 7.1, 7.2, 7.3, 7.4, // 10-19
    7.4, 7.5, 7.5, 7.6, 7.6, 7.7, 7.7, 7.8, 7.8, 7.8  // 20-29
];

export const INTERIOR_LOOP_PENALTY: number[] = [
    Infinity, Infinity, // 0, 1 nucleótidos
    4.1, 5.1, 4.9, 5.2, 5.0, 5.6, 5.7, 6.0, // 2-9
    6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7, 6.8, 6.9, 7.0  // 10-19
];

export const BULGE_PENALTY: number[] = [
    Infinity, 3.8, 2.8, 3.2, 3.6, 4.0, 4.4, 4.6, 4.7, 4.8, 4.9
];

export const MULTILOOP_PENALTY = 4.6; // Penalización base por multiloop
export const MULTILOOP_BRANCH = 0.4; // Por cada rama en multiloop

export class FallbackRNAFolder {
    private temperature: number;
    private RT: number; // R * T en kcal/mol

    constructor(temperature: number = 37) {
        this.temperature = temperature;
        // R = 0.001987 kcal/(mol·K), T en Kelvin
        this.RT = 0.001987 * (temperature + 273.15);
    }

    /**
     * Plegado de RNA usando el algoritmo de Nussinov modificado
     * con parámetros termodinámicos simplificados
     */
    fold(sequence: string): RNAFoldResult {
        const n = sequence.length;
        if (n === 0) {
            return { sequence, structure: '', mfe: 0, temperature: this.temperature, length: 0 };
        }

        // Matriz de energía mínima DP
        const dp: number[][] = Array(n).fill(null).map(() => Array(n).fill(0));
        
        // Matriz de traceback
        const trace: Array<Array<{type: string; k?: number}>> = 
            Array(n).fill(null).map(() => Array(n).fill({type: 'none'}));

        // Llenar matriz DP (diagonal hacia arriba)
        for (let len = 1; len < n; len++) {
            for (let i = 0; i < n - len; i++) {
                const j = i + len;
                
                // Caso 1: j no apareado
                dp[i][j] = dp[i][j-1];
                trace[i][j] = {type: 'unpaired_j'};

                // Caso 2: i y j forman par de bases
                if (this.canPair(sequence[i], sequence[j]) && j - i > 3) {
                    const pairEnergy = this.pairEnergy(sequence, i, j);
                    const innerEnergy = i + 1 <= j - 1 ? dp[i+1][j-1] : 0;
                    const totalEnergy = pairEnergy + innerEnergy;
                    
                    if (totalEnergy < dp[i][j]) {
                        dp[i][j] = totalEnergy;
                        trace[i][j] = {type: 'pair'};
                    }
                }

                // Caso 3: bifurcación
                for (let k = i; k < j; k++) {
                    const bifurcationEnergy = dp[i][k] + dp[k+1][j];
                    if (bifurcationEnergy < dp[i][j]) {
                        dp[i][j] = bifurcationEnergy;
                        trace[i][j] = {type: 'bifurcation', k};
                    }
                }
            }
        }

        // Traceback para obtener estructura
        const structure = this.traceback(trace, sequence, 0, n - 1);
        
        return {
            sequence,
            structure,
            mfe: dp[0][n-1],
            temperature: this.temperature,
            length: n
        };
    }

    /**
     * Calcula la matriz de probabilidades de pares de bases
     * usando la función de partición
     */
    calculateBasePairProbabilities(sequence: string): BasePairProbabilityMap {
        const n = sequence.length;
        if (n === 0) {
            return {
                sequence,
                matrix: [],
                significantPairs: [],
                ensembleEnergy: 0
            };
        }

        // Función de partición forward (Q) y backward (Qb)
        const Q: number[][] = Array(n).fill(null).map(() => Array(n).fill(0));
        const Qb: number[][] = Array(n).fill(null).map(() => Array(n).fill(0));
        
        // Inicialización
        for (let i = 0; i < n; i++) {
            Q[i][i] = 1;
            if (i < n - 1) {
                Q[i][i+1] = 1;
            }
        }

        // Llenar Q y Qb
        for (let len = 2; len < n; len++) {
            for (let i = 0; i < n - len; i++) {
                const j = i + len;
                
                // Qb[i][j]: partición con i-j pareados
                if (this.canPair(sequence[i], sequence[j]) && j - i > 3) {
                    const energy = this.pairEnergy(sequence, i, j);
                    const boltzmann = Math.exp(-energy / this.RT);
                    const innerQ = i + 1 <= j - 1 ? Q[i+1][j-1] : 1;
                    Qb[i][j] = boltzmann * innerQ;
                }

                // Q[i][j]: partición total
                Q[i][j] = Q[i][j-1]; // j no apareado
                for (let k = i; k < j; k++) {
                    if (this.canPair(sequence[k], sequence[j]) && j - k > 3) {
                        const leftQ = k > i ? Q[i][k-1] : 1;
                        Q[i][j] += leftQ * Qb[k][j];
                    }
                }
            }
        }

        // Calcular matriz de probabilidades
        const totalQ = Q[0][n-1];
        const matrix: number[][] = Array(n).fill(null).map(() => Array(n).fill(0));
        const significantPairs: BasePair[] = [];

        // Probabilidad exterior
        const Qext: number[][] = Array(n).fill(null).map(() => Array(n).fill(0));
        
        // Inicializar Qext
        for (let i = 0; i < n; i++) {
            Qext[i][i] = 1;
        }

        // Calcular probabilidades de pares
        for (let i = 0; i < n; i++) {
            for (let j = i + 4; j < n; j++) {
                if (this.canPair(sequence[i], sequence[j]) && Qb[i][j] > 0) {
                    // Probabilidad = (contribuciones externas) * Qb[i][j] / Z
                    const leftQ = i > 0 ? Q[0][i-1] : 1;
                    const rightQ = j < n - 1 ? Q[j+1][n-1] : 1;
                    const prob = (leftQ * Qb[i][j] * rightQ) / totalQ;
                    
                    if (prob > 0.001 && prob <= 1) {
                        matrix[i][j] = prob;
                        matrix[j][i] = prob;
                        
                        if (prob > 0.01) {
                            significantPairs.push({ i, j, probability: prob });
                        }
                    }
                }
            }
        }

        // Energía del ensemble
        const ensembleEnergy = -this.RT * Math.log(totalQ);

        return {
            sequence,
            matrix,
            significantPairs: significantPairs.sort((a, b) => b.probability - a.probability),
            ensembleEnergy
        };
    }

    /**
     * Verifica si dos nucleótidos pueden formar par de bases
     */
    private canPair(a: string, b: string): boolean {
        const pairs: Record<string, string[]> = {
            'A': ['U'],
            'U': ['A', 'G'],
            'G': ['C', 'U'],
            'C': ['G']
        };
        return pairs[a]?.includes(b) || false;
    }

    /**
     * Calcula la energía de un par de bases en contexto
     */
    private pairEnergy(sequence: string, i: number, j: number): number {
        const a = sequence[i];
        const b = sequence[j];
        
        // Energía base del par
        let energy = this.basePairEnergy(a, b);

        // Si hay apilamiento, añadir energía de stack
        if (i > 0 && j < sequence.length - 1) {
            if (this.canPair(sequence[i-1], sequence[j+1])) {
                const stackKey = `${sequence[i-1]}${a}/${b}${sequence[j+1]}`;
                const reverseKey = `${b}${sequence[j+1]}/${sequence[i-1]}${a}`;
                energy += (STACK_ENERGIES[stackKey] || STACK_ENERGIES[reverseKey] || -1.5);
            }
        }

        return energy;
    }

    /**
     * Energía base de un par de bases
     */
    private basePairEnergy(a: string, b: string): number {
        const pair = a + b;
        const energies: Record<string, number> = {
            'AU': -0.9, 'UA': -0.9,
            'GC': -2.4, 'CG': -2.4,
            'GU': -0.5, 'UG': -0.5
        };
        return energies[pair] || 0;
    }

    /**
     * Traceback para reconstruir la estructura
     */
    private traceback(
        trace: Array<Array<{type: string; k?: number}>>,
        sequence: string,
        i: number,
        j: number
    ): string {
        if (i > j) return '';
        if (i === j) return '.';

        const result = Array(j - i + 1).fill('.');
        this.tracebackRecursive(trace, sequence, i, j, result, i);
        return result.join('');
    }

    private tracebackRecursive(
        trace: Array<Array<{type: string; k?: number}>>,
        sequence: string,
        i: number,
        j: number,
        result: string[],
        offset: number
    ): void {
        if (i > j) return;
        if (i === j) return;

        const cell = trace[i][j];

        switch (cell.type) {
            case 'none':
            case 'unpaired_j':
                this.tracebackRecursive(trace, sequence, i, j-1, result, offset);
                break;
            
            case 'pair':
                result[i - offset] = '(';
                result[j - offset] = ')';
                this.tracebackRecursive(trace, sequence, i+1, j-1, result, offset);
                break;
            
            case 'bifurcation':
                const k = cell.k!;
                this.tracebackRecursive(trace, sequence, i, k, result, offset);
                this.tracebackRecursive(trace, sequence, k+1, j, result, offset);
                break;
        }
    }
}
