/**
 * SynBio-LLVM - Cache & Performance Module
 * Sistema de caché inteligente para compilaciones, análisis termodinámico
 * y resultados de optimización. Evita cómputos repetidos.
 */

import * as vscode from 'vscode';

/** Entrada de caché con TTL y metadata */
interface CacheEntry<T> {
    value: T;
    timestamp: number;
    ttl: number; // ms
    hits: number;
    hash: string;
    sizeEstimate: number;
}

/** Estadísticas de rendimiento */
export interface PerformanceStats {
    cacheHits: number;
    cacheMisses: number;
    hitRate: number;
    totalEntries: number;
    memoryEstimate: number; // bytes
    savedComputations: number;
    averageLatencySaved: number; // ms
}

/**
 * Caché LRU con TTL para resultados de compilación y análisis
 * Soporta hash de contenido para invalidación inteligente
 */
export class CompilationCache<T = unknown> {
    private cache = new Map<string, CacheEntry<T>>();
    private maxEntries: number;
    private defaultTTL: number;
    private hits = 0;
    private misses = 0;
    private savedTime = 0;

    constructor(maxEntries = 100, defaultTTLMs = 300_000) {
        this.maxEntries = maxEntries;
        this.defaultTTL = defaultTTLMs;
    }

    /** Almacena un resultado en caché */
    set(key: string, value: T, ttlMs?: number): void {
        // Evicción LRU si estamos llenos
        if (this.cache.size >= this.maxEntries) {
            this.evictOldest();
        }

        const hash = this.computeHash(key);
        const sizeEstimate = JSON.stringify(value).length * 2; // aprox bytes

        this.cache.set(key, {
            value,
            timestamp: Date.now(),
            ttl: ttlMs ?? this.defaultTTL,
            hits: 0,
            hash,
            sizeEstimate,
        });
    }

    /** Obtiene un resultado del caché */
    get(key: string): T | undefined {
        const entry = this.cache.get(key);
        if (!entry) {
            this.misses++;
            return undefined;
        }

        // Verificar TTL
        if (Date.now() - entry.timestamp > entry.ttl) {
            this.cache.delete(key);
            this.misses++;
            return undefined;
        }

        entry.hits++;
        this.hits++;
        return entry.value;
    }

    /** Verifica si una clave existe y es válida */
    has(key: string): boolean {
        const entry = this.cache.get(key);
        if (!entry) { return false; }
        if (Date.now() - entry.timestamp > entry.ttl) {
            this.cache.delete(key);
            return false;
        }
        return true;
    }

    /** Invalida entradas que matcheen un patrón */
    invalidatePattern(pattern: string | RegExp): number {
        const regex = typeof pattern === 'string' ? new RegExp(pattern) : pattern;
        let removed = 0;
        for (const key of this.cache.keys()) {
            if (regex.test(key)) {
                this.cache.delete(key);
                removed++;
            }
        }
        return removed;
    }

    /** Genera clave de caché desde contenido de documento */
    static documentKey(doc: vscode.TextDocument, prefix: string = ''): string {
        const content = doc.getText();
        const version = doc.version;
        let hash = 0;
        for (let i = 0; i < content.length; i++) {
            const char = content.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash |= 0;
        }
        return `${prefix}:${doc.uri.fsPath}:v${version}:h${hash}`;
    }

    /** Obtiene estadísticas de rendimiento */
    getStats(): PerformanceStats {
        const totalRequests = this.hits + this.misses;
        let memoryEstimate = 0;
        for (const entry of this.cache.values()) {
            memoryEstimate += entry.sizeEstimate;
        }

        return {
            cacheHits: this.hits,
            cacheMisses: this.misses,
            hitRate: totalRequests > 0 ? (this.hits / totalRequests) * 100 : 0,
            totalEntries: this.cache.size,
            memoryEstimate,
            savedComputations: this.hits,
            averageLatencySaved: this.hits > 0 ? this.savedTime / this.hits : 0,
        };
    }

    /** Registra tiempo ahorrado por un cache hit */
    recordTimeSaved(ms: number): void {
        this.savedTime += ms;
    }

    /** Limpia todo el caché */
    clear(): void {
        this.cache.clear();
        this.hits = 0;
        this.misses = 0;
        this.savedTime = 0;
    }

    /** Limpia entradas expiradas */
    prune(): number {
        const now = Date.now();
        let pruned = 0;
        for (const [key, entry] of this.cache.entries()) {
            if (now - entry.timestamp > entry.ttl) {
                this.cache.delete(key);
                pruned++;
            }
        }
        return pruned;
    }

    private evictOldest(): void {
        let oldestKey: string | null = null;
        let oldestTime = Infinity;
        let leastHits = Infinity;

        for (const [key, entry] of this.cache.entries()) {
            // Priorizar evicción: expirados > menos usado > más viejo
            const age = Date.now() - entry.timestamp;
            if (age > entry.ttl) {
                this.cache.delete(key);
                return;
            }
            if (entry.hits < leastHits || (entry.hits === leastHits && age > oldestTime - entry.timestamp)) {
                leastHits = entry.hits;
                oldestKey = key;
                oldestTime = entry.timestamp;
            }
        }

        if (oldestKey) {
            this.cache.delete(oldestKey);
        }
    }

    private computeHash(input: string): string {
        let hash = 0;
        for (let i = 0; i < input.length; i++) {
            const char = input.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash |= 0;
        }
        return hash.toString(36);
    }
}

/**
 * Debouncer para análisis en tiempo real
 * Agrupa múltiples ediciones rápidas en una sola operación
 */
export class AnalysisDebouncer {
    private timers = new Map<string, ReturnType<typeof setTimeout>>();
    private defaultDelay: number;

    constructor(defaultDelay = 300) {
        this.defaultDelay = defaultDelay;
    }

    /** Ejecuta una función con debounce por clave */
    debounce(key: string, fn: () => void, delayMs?: number): void {
        const existing = this.timers.get(key);
        if (existing) {
            clearTimeout(existing);
        }

        this.timers.set(key, setTimeout(() => {
            this.timers.delete(key);
            fn();
        }, delayMs ?? this.defaultDelay));
    }

    /** Cancela un debounce pendiente */
    cancel(key: string): void {
        const timer = this.timers.get(key);
        if (timer) {
            clearTimeout(timer);
            this.timers.delete(key);
        }
    }

    /** Cancela todos los debounces pendientes */
    cancelAll(): void {
        for (const timer of this.timers.values()) {
            clearTimeout(timer);
        }
        this.timers.clear();
    }

    dispose(): void {
        this.cancelAll();
    }
}

/**
 * Monitor de rendimiento para el pipeline de compilación
 * Mide tiempos de cada fase y detecta cuellos de botella
 */
export class PerformanceMonitor {
    private timings = new Map<string, number[]>();
    private activeTimers = new Map<string, number>();

    /** Inicia una medición */
    start(label: string): void {
        this.activeTimers.set(label, performance.now());
    }

    /** Finaliza una medición y registra el tiempo */
    end(label: string): number {
        const startTime = this.activeTimers.get(label);
        if (startTime === undefined) { return 0; }

        const elapsed = performance.now() - startTime;
        this.activeTimers.delete(label);

        if (!this.timings.has(label)) {
            this.timings.set(label, []);
        }
        this.timings.get(label)!.push(elapsed);

        return elapsed;
    }

    /** Obtiene resumen de tiempos por fase */
    getSummary(): Record<string, { avg: number; min: number; max: number; count: number }> {
        const summary: Record<string, { avg: number; min: number; max: number; count: number }> = {};

        for (const [label, times] of this.timings.entries()) {
            const avg = times.reduce((a, b) => a + b, 0) / times.length;
            summary[label] = {
                avg: Math.round(avg * 100) / 100,
                min: Math.round(Math.min(...times) * 100) / 100,
                max: Math.round(Math.max(...times) * 100) / 100,
                count: times.length,
            };
        }

        return summary;
    }

    /** Resetea todas las mediciones */
    reset(): void {
        this.timings.clear();
        this.activeTimers.clear();
    }
}

/**
 * Manager global de caché para toda la extensión
 * Coordina cachés de diferentes subsistemas
 */
export class CacheManager implements vscode.Disposable {
    readonly compilationCache: CompilationCache;
    readonly thermodynamicCache: CompilationCache;
    readonly codonOptCache: CompilationCache;
    readonly circuitOptCache: CompilationCache;
    readonly debouncer: AnalysisDebouncer;
    readonly perfMonitor: PerformanceMonitor;

    private pruneInterval: ReturnType<typeof setInterval>;
    private statusBarItem: vscode.StatusBarItem;
    private outputChannel: vscode.OutputChannel;

    constructor() {
        // Cachés especializados con diferentes TTL
        this.compilationCache = new CompilationCache(50, 600_000);       // 10 min
        this.thermodynamicCache = new CompilationCache(200, 300_000);    // 5 min
        this.codonOptCache = new CompilationCache(30, 900_000);          // 15 min
        this.circuitOptCache = new CompilationCache(20, 600_000);        // 10 min

        this.debouncer = new AnalysisDebouncer(350);
        this.perfMonitor = new PerformanceMonitor();

        this.outputChannel = vscode.window.createOutputChannel('SynBio Performance');
        this.statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 90);
        this.statusBarItem.command = 'synbio.showPerformance';

        // Limpieza periódica cada 2 minutos
        this.pruneInterval = setInterval(() => this.pruneAll(), 120_000);

        this.updateStatusBar();
    }

    /** Limpia entradas expiradas de todos los cachés */
    pruneAll(): void {
        const total = this.compilationCache.prune()
            + this.thermodynamicCache.prune()
            + this.codonOptCache.prune()
            + this.circuitOptCache.prune();

        if (total > 0) {
            this.outputChannel.appendLine(`[Cache] Purgadas ${total} entradas expiradas`);
        }
        this.updateStatusBar();
    }

    /** Invalida caché cuando un archivo cambia */
    invalidateForDocument(uri: vscode.Uri): void {
        const pattern = uri.fsPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        this.compilationCache.invalidatePattern(pattern);
        this.thermodynamicCache.invalidatePattern(pattern);
    }

    /** Actualiza barra de estado con hit rate */
    private updateStatusBar(): void {
        const stats = this.getGlobalStats();
        if (stats.cacheHits + stats.cacheMisses > 0) {
            this.statusBarItem.text = `$(database) Cache ${stats.hitRate.toFixed(0)}%`;
            this.statusBarItem.tooltip = `SynBio Cache: ${stats.totalEntries} entradas | ${stats.cacheHits} hits | ~${(stats.memoryEstimate / 1024).toFixed(0)} KB`;
            this.statusBarItem.show();
        }
    }

    /** Obtiene estadísticas combinadas de todos los cachés */
    getGlobalStats(): PerformanceStats {
        const caches = [
            this.compilationCache.getStats(),
            this.thermodynamicCache.getStats(),
            this.codonOptCache.getStats(),
            this.circuitOptCache.getStats(),
        ];

        return {
            cacheHits: caches.reduce((s, c) => s + c.cacheHits, 0),
            cacheMisses: caches.reduce((s, c) => s + c.cacheMisses, 0),
            hitRate: caches.reduce((s, c) => s + c.cacheHits, 0) /
                Math.max(1, caches.reduce((s, c) => s + c.cacheHits + c.cacheMisses, 0)) * 100,
            totalEntries: caches.reduce((s, c) => s + c.totalEntries, 0),
            memoryEstimate: caches.reduce((s, c) => s + c.memoryEstimate, 0),
            savedComputations: caches.reduce((s, c) => s + c.savedComputations, 0),
            averageLatencySaved: 0,
        };
    }

    /** Muestra panel de rendimiento */
    showPerformanceReport(): void {
        const stats = this.getGlobalStats();
        const perfSummary = this.perfMonitor.getSummary();

        let report = '═══ SynBio-LLVM Performance Report ═══\n\n';
        report += '📊 CACHÉ\n';
        report += `  Hits:     ${stats.cacheHits}\n`;
        report += `  Misses:   ${stats.cacheMisses}\n`;
        report += `  Hit Rate: ${stats.hitRate.toFixed(1)}%\n`;
        report += `  Entradas: ${stats.totalEntries}\n`;
        report += `  Memoria:  ~${(stats.memoryEstimate / 1024).toFixed(1)} KB\n\n`;

        report += '⏱️ TIEMPOS POR FASE\n';
        for (const [label, data] of Object.entries(perfSummary)) {
            report += `  ${label}:\n`;
            report += `    Promedio: ${data.avg.toFixed(1)} ms\n`;
            report += `    Min/Max:  ${data.min.toFixed(1)} / ${data.max.toFixed(1)} ms\n`;
            report += `    Ejecuciones: ${data.count}\n`;
        }

        this.outputChannel.clear();
        this.outputChannel.appendLine(report);
        this.outputChannel.show();
    }

    dispose(): void {
        clearInterval(this.pruneInterval);
        this.debouncer.dispose();
        this.compilationCache.clear();
        this.thermodynamicCache.clear();
        this.codonOptCache.clear();
        this.circuitOptCache.clear();
        this.statusBarItem.dispose();
        this.outputChannel.dispose();
    }
}
