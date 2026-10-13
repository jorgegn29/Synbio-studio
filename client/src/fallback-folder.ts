/**
 * Fallback RNA Folder - Versión para Node.js/VS Code Extension
 * 
 * Implementación JavaScript pura del algoritmo de Nussinov para predicción
 * de estructura secundaria de RNA. Funciona en cualquier entorno JS.
 */

// Parámetros termodinámicos simplificados (Turner 2004)
const STACK_ENERGIES: Record<string, number> = {
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

export interface RNAFoldResult {
    sequence: string;
    structure: string;
    mfe: number;
    temperature: number;
    length: number;
}

export class FallbackRNAFolder {
    private temperature: number;
    private RT: number;

    constructor(temperature: number = 37) {
        this.temperature = temperature;
        this.RT = 0.001987 * (temperature + 273.15);
    }

    /**
     * Plegado de RNA usando el algoritmo de Nussinov modificado
     */
    fold(sequence: string): RNAFoldResult {
        // Limpiar secuencia
        const cleanSeq = sequence.toUpperCase().replace(/T/g, 'U').replace(/[^ACGU]/g, '');
        const n = cleanSeq.length;
        
        if (n === 0) {
            return { sequence: cleanSeq, structure: '', mfe: 0, temperature: this.temperature, length: 0 };
        }

        // Matriz de energía mínima DP
        const dp: number[][] = Array(n).fill(null).map(() => Array(n).fill(0));
        const trace: Array<Array<{type: string; k?: number}>> = 
            Array(n).fill(null).map(() => Array(n).fill({type: 'none'}));

        // Llenar matriz DP
        for (let len = 1; len < n; len++) {
            for (let i = 0; i < n - len; i++) {
                const j = i + len;
                
                // Caso 1: j no apareado
                dp[i][j] = dp[i][j-1];
                trace[i][j] = {type: 'unpaired_j'};

                // Caso 2: i y j forman par
                if (this.canPair(cleanSeq[i], cleanSeq[j]) && j - i > 3) {
                    const pairEnergy = this.pairEnergy(cleanSeq, i, j);
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

        const structure = this.traceback(trace, cleanSeq, 0, n - 1);
        
        return {
            sequence: cleanSeq,
            structure,
            mfe: dp[0][n-1],
            temperature: this.temperature,
            length: n
        };
    }

    private canPair(a: string, b: string): boolean {
        const pairs: Record<string, string[]> = {
            'A': ['U'],
            'U': ['A', 'G'],
            'G': ['C', 'U'],
            'C': ['G']
        };
        return pairs[a]?.includes(b) || false;
    }

    private pairEnergy(sequence: string, i: number, j: number): number {
        const a = sequence[i];
        const b = sequence[j];
        let energy = this.basePairEnergy(a, b);

        if (i > 0 && j < sequence.length - 1) {
            if (this.canPair(sequence[i-1], sequence[j+1])) {
                const stackKey = `${sequence[i-1]}${a}/${b}${sequence[j+1]}`;
                const reverseKey = `${b}${sequence[j+1]}/${sequence[i-1]}${a}`;
                energy += (STACK_ENERGIES[stackKey] || STACK_ENERGIES[reverseKey] || -1.5);
            }
        }

        return energy;
    }

    private basePairEnergy(a: string, b: string): number {
        const pair = a + b;
        const energies: Record<string, number> = {
            'AU': -0.9, 'UA': -0.9,
            'GC': -2.4, 'CG': -2.4,
            'GU': -0.5, 'UG': -0.5
        };
        return energies[pair] || 0;
    }

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
            case 'bifurcation': {
                const k = cell.k!;
                this.tracebackRecursive(trace, sequence, i, k, result, offset);
                this.tracebackRecursive(trace, sequence, k+1, j, result, offset);
                break;
            }
        }
    }
}
