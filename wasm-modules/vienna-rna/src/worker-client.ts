/**
 * Cliente del Web Worker para ViennaRNA
 * 
 * Proporciona una API asíncrona y amigable para comunicarse con el worker.
 */

import type { WorkerRequest, WorkerResponse, RNAFoldResult, BasePairProbabilityMap, RBSAnalysis } from './worker';
import type { ViennaRNAConfig } from './index';

export class ViennaRNAWorkerClient {
    private worker: Worker;
    private pendingRequests: Map<string, {
        resolve: (value: any) => void;
        reject: (reason: any) => void;
    }> = new Map();
    private requestId: number = 0;
    private onProgress?: (current: number, total: number, percent: number) => void;

    constructor(workerUrl?: string | URL) {
        // Crear el worker
        if (typeof Worker !== 'undefined') {
            const url = workerUrl || new URL('./worker.ts', import.meta.url);
            this.worker = new Worker(url, { type: 'module' });
            this.worker.onmessage = this.handleMessage.bind(this);
            this.worker.onerror = this.handleError.bind(this);
        } else {
            throw new Error('Web Workers not supported in this environment');
        }
    }

    /**
     * Inicializa el motor de ViennaRNA en el worker
     */
    async initialize(config?: ViennaRNAConfig): Promise<boolean> {
        return this.sendRequest('initialize', config);
    }

    /**
     * Pliega una secuencia de RNA y retorna la estructura MFE
     */
    async fold(sequence: string): Promise<RNAFoldResult> {
        return this.sendRequest('fold', { sequence });
    }

    /**
     * Calcula la matriz de probabilidades de pares de bases
     */
    async calculateBasePairProbabilities(sequence: string): Promise<BasePairProbabilityMap> {
        return this.sendRequest('calculateBpp', { sequence });
    }

    /**
     * Analiza un RBS para detectar estructuras problemáticas
     * Esta es la función principal para el linter termodinámico
     */
    async analyzeRBS(
        sequence: string, 
        contextBefore?: string, 
        contextAfter?: string
    ): Promise<RBSAnalysis> {
        return this.sendRequest('analyzeRBS', { 
            sequence, 
            contextBefore, 
            contextAfter 
        });
    }

    /**
     * Detecta horquillas en una secuencia
     */
    async detectHairpins(sequence: string): Promise<any[]> {
        return this.sendRequest('detectHairpins', { sequence });
    }

    /**
     * Pliega múltiples secuencias con reporte de progreso
     */
    async batchFold(
        sequences: string[], 
        onProgress?: (current: number, total: number, percent: number) => void
    ): Promise<RNAFoldResult[]> {
        this.onProgress = onProgress;
        const result = await this.sendRequest<RNAFoldResult[]>('batchFold', { sequences });
        this.onProgress = undefined;
        return result;
    }

    /**
     * Termina el worker
     */
    terminate(): void {
        this.worker.terminate();
        // Rechazar todas las solicitudes pendientes
        for (const [_id, { reject }] of this.pendingRequests) {
            reject(new Error('Worker terminated'));
        }
        this.pendingRequests.clear();
    }

    // ========================================================================
    // MÉTODOS PRIVADOS
    // ========================================================================

    private sendRequest<T>(type: string, payload?: any): Promise<T> {
        return new Promise((resolve, reject) => {
            const id = `req_${++this.requestId}`;
            
            this.pendingRequests.set(id, { resolve, reject });
            
            const request: WorkerRequest = {
                id,
                type: type as any,
                payload
            };
            
            this.worker.postMessage(request);
        });
    }

    private handleMessage(event: MessageEvent): void {
        const data = event.data;

        // Mensaje de progreso
        if (data.type === 'progress') {
            if (this.onProgress) {
                this.onProgress(data.current, data.total, data.percent);
            }
            return;
        }

        // Respuesta normal
        const response = data as WorkerResponse;
        const pending = this.pendingRequests.get(response.id);
        
        if (pending) {
            this.pendingRequests.delete(response.id);
            
            if (response.success) {
                pending.resolve(response.result);
            } else {
                pending.reject(new Error(response.error || 'Unknown worker error'));
            }
        }
    }

    private handleError(event: ErrorEvent): void {
        console.error('ViennaRNA Worker error:', event);
        
        // Rechazar todas las solicitudes pendientes
        for (const [_id, { reject }] of this.pendingRequests) {
            reject(new Error(`Worker error: ${event.message}`));
        }
        this.pendingRequests.clear();
    }
}

/**
 * Factory function para crear el cliente del worker
 */
export function createViennaRNAWorker(workerUrl?: string | URL): ViennaRNAWorkerClient {
    return new ViennaRNAWorkerClient(workerUrl);
}
