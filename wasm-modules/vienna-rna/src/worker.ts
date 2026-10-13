/**
 * Web Worker para cálculos de RNA
 * 
 * Ejecuta los cálculos de plegado en un thread separado para no bloquear
 * la interfaz de usuario del editor.
 */

import { ViennaRNAEngine, type RNAFoldResult, type BasePairProbabilityMap, type RBSAnalysis, type ViennaRNAConfig } from './index';

// ============================================================================
// TIPOS DE MENSAJES
// ============================================================================

export type WorkerRequestType = 
    | 'initialize'
    | 'fold'
    | 'calculateBpp'
    | 'analyzeRBS'
    | 'detectHairpins'
    | 'batchFold';

export interface WorkerRequest {
    id: string;
    type: WorkerRequestType;
    payload: any;
}

export interface WorkerResponse {
    id: string;
    success: boolean;
    result?: any;
    error?: string;
    timing?: {
        start: number;
        end: number;
        duration: number;
    };
}

// ============================================================================
// WORKER IMPLEMENTATION
// ============================================================================

let engine: ViennaRNAEngine | null = null;
let isInitialized = false;

// Listener principal del worker
self.onmessage = async (event: MessageEvent<WorkerRequest>) => {
    const { id, type, payload } = event.data;
    const startTime = performance.now();

    try {
        let result: any;

        switch (type) {
            case 'initialize':
                result = await handleInitialize(payload);
                break;
            case 'fold':
                result = await handleFold(payload);
                break;
            case 'calculateBpp':
                result = await handleCalculateBpp(payload);
                break;
            case 'analyzeRBS':
                result = await handleAnalyzeRBS(payload);
                break;
            case 'detectHairpins':
                result = await handleDetectHairpins(payload);
                break;
            case 'batchFold':
                result = await handleBatchFold(payload);
                break;
            default:
                throw new Error(`Unknown request type: ${type}`);
        }

        const endTime = performance.now();
        
        const response: WorkerResponse = {
            id,
            success: true,
            result,
            timing: {
                start: startTime,
                end: endTime,
                duration: endTime - startTime
            }
        };

        self.postMessage(response);

    } catch (error) {
        const endTime = performance.now();
        
        const response: WorkerResponse = {
            id,
            success: false,
            error: error instanceof Error ? error.message : String(error),
            timing: {
                start: startTime,
                end: endTime,
                duration: endTime - startTime
            }
        };

        self.postMessage(response);
    }
};

// ============================================================================
// HANDLERS
// ============================================================================

async function handleInitialize(config?: ViennaRNAConfig): Promise<boolean> {
    engine = new ViennaRNAEngine(config);
    isInitialized = await engine.initialize();
    return isInitialized;
}

async function handleFold(payload: { sequence: string }): Promise<RNAFoldResult> {
    ensureInitialized();
    return engine!.fold(payload.sequence);
}

async function handleCalculateBpp(payload: { sequence: string }): Promise<BasePairProbabilityMap> {
    ensureInitialized();
    return engine!.calculateBasePairProbabilities(payload.sequence);
}

async function handleAnalyzeRBS(payload: { 
    sequence: string; 
    contextBefore?: string; 
    contextAfter?: string 
}): Promise<RBSAnalysis> {
    ensureInitialized();
    return engine!.analyzeRBS(
        payload.sequence,
        payload.contextBefore || '',
        payload.contextAfter || ''
    );
}

async function handleDetectHairpins(payload: { sequence: string }): Promise<any[]> {
    ensureInitialized();
    return engine!.detectHairpins(payload.sequence);
}

async function handleBatchFold(payload: { sequences: string[] }): Promise<RNAFoldResult[]> {
    ensureInitialized();
    
    // Procesar en lotes para reportar progreso
    const results: RNAFoldResult[] = [];
    const total = payload.sequences.length;
    
    for (let i = 0; i < total; i++) {
        const result = await engine!.fold(payload.sequences[i]);
        results.push(result);
        
        // Reportar progreso cada 10%
        if (i % Math.ceil(total / 10) === 0) {
            self.postMessage({
                type: 'progress',
                current: i + 1,
                total,
                percent: ((i + 1) / total) * 100
            });
        }
    }
    
    return results;
}

function ensureInitialized(): void {
    if (!engine) {
        // Auto-inicializar con configuración por defecto
        engine = new ViennaRNAEngine();
    }
}

// ============================================================================
// EXPORT TYPES
// ============================================================================

export type { RNAFoldResult, BasePairProbabilityMap, RBSAnalysis };
