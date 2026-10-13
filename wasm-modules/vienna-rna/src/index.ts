/**
 * ViennaRNA WebAssembly Interface
 * 
 * Este módulo proporciona una interfaz TypeScript para ViennaRNA compilado a WASM.
 * Calcula estructuras secundarias de RNA, energía libre ΔG, y probabilidades de pares de bases.
 */

import { FallbackRNAFolder } from './fallback-folder';

// ============================================================================
// TIPOS E INTERFACES
// ============================================================================

/** Resultado del plegado de RNA */
export interface RNAFoldResult {
    /** Secuencia de RNA de entrada */
    sequence: string;
    /** Estructura secundaria en notación dot-bracket */
    structure: string;
    /** Energía libre mínima (ΔG) en kcal/mol */
    mfe: number;
    /** Temperatura en °C */
    temperature: number;
    /** Longitud de la secuencia */
    length: number;
}

/** Par de bases con probabilidad */
export interface BasePair {
    /** Posición i (0-indexed) */
    i: number;
    /** Posición j (0-indexed) */
    j: number;
    /** Probabilidad del par (0-1) */
    probability: number;
}

/** Mapa de calor de probabilidades de pares de bases */
export interface BasePairProbabilityMap {
    /** Secuencia de RNA */
    sequence: string;
    /** Matriz de probabilidades (i,j) */
    matrix: number[][];
    /** Lista de pares significativos (prob > umbral) */
    significantPairs: BasePair[];
    /** Energía del ensemble */
    ensembleEnergy: number;
}

/** Detección de horquillas (hairpins) */
export interface HairpinDetection {
    /** Posición inicial en la secuencia */
    start: number;
    /** Posición final en la secuencia */
    end: number;
    /** Longitud del stem (tallo) */
    stemLength: number;
    /** Longitud del loop (bucle) */
    loopLength: number;
    /** Secuencia del stem 5' */
    stem5: string;
    /** Secuencia del loop */
    loop: string;
    /** Secuencia del stem 3' */
    stem3: string;
    /** Energía libre de la horquilla */
    energy: number;
    /** ¿Es problemática para un RBS? */
    isProblematicForRBS: boolean;
    /** Razón por la que es problemática */
    reason?: string;
}

/** Análisis de RBS (Ribosome Binding Site) */
export interface RBSAnalysis {
    /** Secuencia del RBS */
    sequence: string;
    /** Estructura predicha */
    structure: string;
    /** Energía libre */
    mfe: number;
    /** Horquillas detectadas */
    hairpins: HairpinDetection[];
    /** ¿El RBS tiene estructura problemática? */
    hasProblematicStructure: boolean;
    /** Score de accesibilidad (0-1, 1 = totalmente accesible) */
    accessibilityScore: number;
    /** Warnings para el linter */
    warnings: RBSWarning[];
}

/** Warning de RBS para el linter */
export interface RBSWarning {
    /** Tipo de warning */
    type: 'hairpin' | 'low_accessibility' | 'high_energy' | 'sd_sequestered';
    /** Mensaje descriptivo */
    message: string;
    /** Severidad: 'warning' | 'error' */
    severity: 'warning' | 'error';
    /** Posición en el código fuente */
    position?: { start: number; end: number };
    /** Sugerencia de corrección */
    suggestion?: string;
}

/** Configuración del motor de plegado */
export interface ViennaRNAConfig {
    /** Temperatura en °C (default: 37) */
    temperature?: number;
    /** Usar WASM si está disponible (default: true) */
    useWasm?: boolean;
    /** Umbral de probabilidad para pares significativos (default: 0.01) */
    probabilityThreshold?: number;
    /** Energía máxima para considerar estructura estable (default: -5 kcal/mol) */
    stabilityThreshold?: number;
}

// ============================================================================
// CLASE PRINCIPAL: ViennaRNAEngine
// ============================================================================

export class ViennaRNAEngine {
    private wasmModule: any = null;
    private wasmLoaded: boolean = false;
    private fallbackFolder: FallbackRNAFolder;
    private config: Required<ViennaRNAConfig>;

    constructor(config: ViennaRNAConfig = {}) {
        this.config = {
            temperature: config.temperature ?? 37,
            useWasm: config.useWasm ?? true,
            probabilityThreshold: config.probabilityThreshold ?? 0.01,
            stabilityThreshold: config.stabilityThreshold ?? -5
        };
        this.fallbackFolder = new FallbackRNAFolder(this.config.temperature);
    }

    /**
     * Inicializa el módulo WASM de ViennaRNA
     */
    async initialize(): Promise<boolean> {
        if (this.wasmLoaded) return true;

        if (!this.config.useWasm) {
            console.log('ViennaRNA WASM disabled, using fallback');
            return false;
        }

        try {
            // Intentar cargar el módulo WASM
            const wasmPath = new URL('../wasm/vienna_rna.wasm', import.meta.url);
            const response = await fetch(wasmPath);
            
            if (!response.ok) {
                throw new Error(`Failed to fetch WASM: ${response.status}`);
            }

            const wasmBuffer = await response.arrayBuffer();
            const wasmModule = await WebAssembly.instantiate(wasmBuffer, {
                env: {
                    memory: new WebAssembly.Memory({ initial: 256, maximum: 512 }),
                    // Funciones de soporte que ViennaRNA necesita
                    __assert_fail: () => { throw new Error('Assertion failed'); },
                    __cxa_throw: () => { throw new Error('Exception thrown'); },
                    abort: () => { throw new Error('Aborted'); },
                    emscripten_memcpy_big: (_dest: number, _src: number, _num: number) => {
                        // Implementación de memcpy
                    }
                }
            });

            this.wasmModule = wasmModule.instance.exports;
            this.wasmLoaded = true;
            console.log('ViennaRNA WASM loaded successfully');
            return true;
        } catch (error) {
            console.warn('ViennaRNA WASM not available, using fallback:', error);
            this.wasmLoaded = false;
            return false;
        }
    }

    /**
     * Pliega una secuencia de RNA y retorna la estructura de mínima energía libre (MFE)
     */
    async fold(sequence: string): Promise<RNAFoldResult> {
        const cleanSequence = this.cleanSequence(sequence);

        if (this.wasmLoaded && this.wasmModule) {
            return this.foldWasm(cleanSequence);
        } else {
            return this.fallbackFolder.fold(cleanSequence);
        }
    }

    /**
     * Calcula la matriz de probabilidades de pares de bases
     */
    async calculateBasePairProbabilities(sequence: string): Promise<BasePairProbabilityMap> {
        const cleanSequence = this.cleanSequence(sequence);

        if (this.wasmLoaded && this.wasmModule) {
            return this.calculateBppWasm(cleanSequence);
        } else {
            return this.fallbackFolder.calculateBasePairProbabilities(cleanSequence);
        }
    }

    /**
     * Detecta horquillas (hairpins) en una secuencia de RNA
     */
    async detectHairpins(sequence: string): Promise<HairpinDetection[]> {
        const foldResult = await this.fold(sequence);
        return this.parseHairpinsFromStructure(sequence, foldResult.structure);
    }

    /**
     * Analiza un RBS para detectar estructuras problemáticas
     * Esta es la función principal para el linter termodinámico
     */
    async analyzeRBS(sequence: string, contextBefore: string = '', contextAfter: string = ''): Promise<RBSAnalysis> {
        // Analizar el RBS con contexto (para ver interacciones con secuencias adyacentes)
        const fullSequence = contextBefore + sequence + contextAfter;
        const rbsStart = contextBefore.length;
        const rbsEnd = rbsStart + sequence.length;

        const foldResult = await this.fold(fullSequence);
        const bpp = await this.calculateBasePairProbabilities(fullSequence);
        const hairpins = await this.detectHairpins(fullSequence);

        // Filtrar horquillas que afectan al RBS
        const rbsHairpins = hairpins.filter(h => 
            (h.start >= rbsStart && h.start < rbsEnd) ||
            (h.end > rbsStart && h.end <= rbsEnd) ||
            (h.start < rbsStart && h.end > rbsEnd)
        );

        // Marcar horquillas problemáticas
        for (const hairpin of rbsHairpins) {
            this.evaluateHairpinForRBS(hairpin, sequence, rbsStart);
        }

        // Calcular accesibilidad del Shine-Dalgarno
        const sdAccessibility = this.calculateSDAccessibility(sequence, foldResult.structure.slice(rbsStart, rbsEnd), bpp, rbsStart);

        // Generar warnings
        const warnings = this.generateRBSWarnings(rbsHairpins, sdAccessibility, foldResult.mfe);

        return {
            sequence,
            structure: foldResult.structure.slice(rbsStart, rbsEnd),
            mfe: foldResult.mfe,
            hairpins: rbsHairpins,
            hasProblematicStructure: rbsHairpins.some(h => h.isProblematicForRBS) || sdAccessibility < 0.7,
            accessibilityScore: sdAccessibility,
            warnings
        };
    }

    /**
     * Genera un mapa de calor de colores para visualización
     */
    generateHeatmapColors(bpp: BasePairProbabilityMap): string[][] {
        const n = bpp.sequence.length;
        const colors: string[][] = Array(n).fill(null).map(() => Array(n).fill('#ffffff'));

        for (let i = 0; i < n; i++) {
            for (let j = i + 1; j < n; j++) {
                const prob = bpp.matrix[i][j];
                if (prob > this.config.probabilityThreshold) {
                    colors[i][j] = this.probabilityToColor(prob);
                    colors[j][i] = colors[i][j]; // Simétrico
                }
            }
        }

        return colors;
    }

    // ========================================================================
    // MÉTODOS PRIVADOS
    // ========================================================================

    private cleanSequence(sequence: string): string {
        // Convertir T a U (DNA → RNA) y limpiar
        return sequence
            .toUpperCase()
            .replace(/T/g, 'U')
            .replace(/[^ACGU]/g, '');
    }

    private async foldWasm(sequence: string): Promise<RNAFoldResult> {
        // Llamada real al WASM de ViennaRNA
        // Esta implementación se completará cuando el WASM esté compilado
        const ptr = this.wasmModule.allocate_sequence(sequence.length);
        
        // Copiar secuencia a memoria WASM
        const encoder = new TextEncoder();
        const bytes = encoder.encode(sequence + '\0');
        new Uint8Array(this.wasmModule.memory.buffer, ptr, bytes.length).set(bytes);

        // Llamar a la función de plegado
        const resultPtr = this.wasmModule.rna_fold(ptr, this.config.temperature);

        // Leer resultado
        const structurePtr = this.wasmModule.get_structure(resultPtr);
        const mfe = this.wasmModule.get_mfe(resultPtr);
        
        const decoder = new TextDecoder();
        const structureBytes = new Uint8Array(
            this.wasmModule.memory.buffer,
            structurePtr,
            sequence.length
        );
        const structure = decoder.decode(structureBytes);

        // Liberar memoria
        this.wasmModule.free_result(resultPtr);
        this.wasmModule.free_sequence(ptr);

        return {
            sequence,
            structure,
            mfe,
            temperature: this.config.temperature,
            length: sequence.length
        };
    }

    private async calculateBppWasm(sequence: string): Promise<BasePairProbabilityMap> {
        // Implementación WASM para matriz de probabilidades
        // Se completará cuando el WASM esté compilado
        return this.fallbackFolder.calculateBasePairProbabilities(sequence);
    }

    private parseHairpinsFromStructure(sequence: string, structure: string): HairpinDetection[] {
        const hairpins: HairpinDetection[] = [];
        const stack: number[] = [];

        for (let i = 0; i < structure.length; i++) {
            if (structure[i] === '(') {
                stack.push(i);
            } else if (structure[i] === ')') {
                if (stack.length > 0) {
                    const j = stack.pop()!;
                    
                    // Detectar si es un hairpin simple (no tiene pares internos)
                    let isSimpleHairpin = true;
                    for (let k = j + 1; k < i; k++) {
                        if (structure[k] === '(' || structure[k] === ')') {
                            isSimpleHairpin = false;
                            break;
                        }
                    }

                    if (isSimpleHairpin && stack.length === 0) {
                        // Contar la longitud del stem
                        let stemLen = 1;
                        while (j - stemLen >= 0 && i + stemLen < structure.length &&
                               structure[j - stemLen] === '(' && structure[i + stemLen] === ')') {
                            stemLen++;
                        }

                        const start = j - stemLen + 1;
                        const end = i + stemLen - 1;
                        const loopStart = j + 1;
                        const loopEnd = i - 1;
                        const loopLen = loopEnd - loopStart + 1;

                        if (loopLen >= 3) { // Los loops válidos tienen al menos 3 nt
                            hairpins.push({
                                start,
                                end: end + 1,
                                stemLength: stemLen,
                                loopLength: loopLen,
                                stem5: sequence.slice(start, start + stemLen),
                                loop: sequence.slice(loopStart, loopEnd + 1),
                                stem3: sequence.slice(end - stemLen + 2, end + 1),
                                energy: this.estimateHairpinEnergy(stemLen, loopLen),
                                isProblematicForRBS: false
                            });
                        }
                    }
                }
            }
        }

        return hairpins;
    }

    private estimateHairpinEnergy(stemLength: number, loopLength: number): number {
        // Estimación simplificada de energía de hairpin
        // Basada en parámetros de Turner
        const stemEnergy = stemLength * -1.5; // ~1.5 kcal/mol por par de bases
        
        // Penalización por tamaño del loop
        let loopEnergy: number;
        if (loopLength <= 3) loopEnergy = 5.4;
        else if (loopLength === 4) loopEnergy = 5.6;
        else if (loopLength === 5) loopEnergy = 5.7;
        else if (loopLength === 6) loopEnergy = 5.4;
        else loopEnergy = 5.4 + 1.75 * Math.log(loopLength / 6);

        return stemEnergy + loopEnergy;
    }

    private evaluateHairpinForRBS(hairpin: HairpinDetection, rbsSequence: string, rbsStart: number): void {
        // Buscar la secuencia Shine-Dalgarno (AGGAGG o variantes)
        const sdPatterns = ['AGGAGG', 'AGGAG', 'GGAGG', 'AGGA', 'GAGG'];
        
        for (const sd of sdPatterns) {
            const sdPos = rbsSequence.toUpperCase().replace(/T/g, 'U').indexOf(sd);
            if (sdPos !== -1) {
                const sdAbsStart = rbsStart + sdPos;
                const sdAbsEnd = sdAbsStart + sd.length;

                // ¿El hairpin secuestra parte del Shine-Dalgarno?
                if ((hairpin.start <= sdAbsStart && hairpin.end >= sdAbsStart) ||
                    (hairpin.start <= sdAbsEnd && hairpin.end >= sdAbsEnd) ||
                    (hairpin.start >= sdAbsStart && hairpin.end <= sdAbsEnd)) {
                    
                    hairpin.isProblematicForRBS = true;
                    hairpin.reason = `Hairpin secuestra la secuencia Shine-Dalgarno (${sd}), reduciendo eficiencia de traducción`;
                    return;
                }
            }
        }

        // Hairpins muy estables cerca del start codon también son problemáticos
        if (hairpin.energy < -8 && hairpin.stemLength >= 5) {
            hairpin.isProblematicForRBS = true;
            hairpin.reason = `Hairpin muy estable (ΔG = ${hairpin.energy.toFixed(1)} kcal/mol) puede impedir acceso del ribosoma`;
        }
    }

    private calculateSDAccessibility(
        rbsSequence: string, 
        rbsStructure: string, 
        _bpp: BasePairProbabilityMap,
        _rbsStart: number
    ): number {
        // Buscar la región Shine-Dalgarno
        const sdPatterns = ['AGGAGG', 'AGGAG', 'GGAGG', 'AGGA', 'GAGG'];
        
        for (const sd of sdPatterns) {
            const sdPos = rbsSequence.toUpperCase().replace(/T/g, 'U').indexOf(sd);
            if (sdPos !== -1) {
                // Calcular fracción de nucleótidos no apareados en el SD
                let unpairedCount = 0;
                for (let i = sdPos; i < sdPos + sd.length; i++) {
                    if (rbsStructure[i] === '.') {
                        unpairedCount++;
                    }
                }
                return unpairedCount / sd.length;
            }
        }

        // Si no hay SD, calcular accesibilidad general
        const unpaired = rbsStructure.split('').filter(c => c === '.').length;
        return unpaired / rbsStructure.length;
    }

    private generateRBSWarnings(
        hairpins: HairpinDetection[],
        sdAccessibility: number,
        mfe: number
    ): RBSWarning[] {
        const warnings: RBSWarning[] = [];

        // Warnings por horquillas problemáticas
        for (const hairpin of hairpins) {
            if (hairpin.isProblematicForRBS) {
                warnings.push({
                    type: 'hairpin',
                    message: hairpin.reason || 'Hairpin detectado en región RBS',
                    severity: hairpin.energy < -10 ? 'error' : 'warning',
                    position: { start: hairpin.start, end: hairpin.end },
                    suggestion: 'Considera usar un RBS diferente o añadir un insulator'
                });
            }
        }

        // Warning por baja accesibilidad del SD
        if (sdAccessibility < 0.5) {
            warnings.push({
                type: 'sd_sequestered',
                message: `Shine-Dalgarno secuestrado (accesibilidad: ${(sdAccessibility * 100).toFixed(0)}%)`,
                severity: 'error',
                suggestion: 'La secuencia Shine-Dalgarno está apareada. Usa un RBS con mejor contexto estructural'
            });
        } else if (sdAccessibility < 0.7) {
            warnings.push({
                type: 'low_accessibility',
                message: `Baja accesibilidad del RBS (${(sdAccessibility * 100).toFixed(0)}%)`,
                severity: 'warning',
                suggestion: 'Considera optimizar la secuencia flanqueante para reducir estructura secundaria'
            });
        }

        // Warning por estructura muy estable
        if (mfe < this.config.stabilityThreshold) {
            warnings.push({
                type: 'high_energy',
                message: `Estructura secundaria muy estable (ΔG = ${mfe.toFixed(1)} kcal/mol)`,
                severity: 'warning',
                suggestion: 'La estructura secundaria fuerte puede reducir la eficiencia de traducción'
            });
        }

        return warnings;
    }

    private probabilityToColor(probability: number): string {
        // Escala de colores: blanco → amarillo → naranja → rojo
        const r = 255;
        const g = Math.round(255 * (1 - probability * 0.7));
        const b = Math.round(255 * (1 - probability));
        return `rgb(${r},${g},${b})`;
    }
}

// ============================================================================
// EXPORTS
// ============================================================================

export { FallbackRNAFolder } from './fallback-folder';

// Factory function
export function createViennaRNAEngine(config?: ViennaRNAConfig): ViennaRNAEngine {
    return new ViennaRNAEngine(config);
}
