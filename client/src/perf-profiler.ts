/**
 * ══════════════════════════════════════════════════════════════
 * SynBio-LLVM — Performance Profiling Utilities
 *
 * Provides high-resolution timing, memory tracking, and
 * throughput benchmarking for scientific computation modules.
 *
 * Features:
 *   - Microsecond-precision timing via performance.now()
 *   - Heap memory delta tracking
 *   - Throughput measurement (ops/sec, sequences/sec)
 *   - Statistical summary (mean, median, p95, p99, stddev)
 *   - Regression alert thresholds
 *   - Export to JSON for CI dashboards
 *
 * Usage:
 *   const profiler = new SynBioProfiler();
 *   profiler.bench('Tm calculation', () => calculateTm(seq));
 *   profiler.report();
 * ══════════════════════════════════════════════════════════════
 */

export interface BenchmarkResult {
    name: string;
    samples: number;
    mean: number;        // ms
    median: number;      // ms
    p95: number;         // ms
    p99: number;         // ms
    min: number;         // ms
    max: number;         // ms
    stddev: number;      // ms
    opsPerSec: number;
    heapDelta: number;   // bytes (approx)
    status: 'pass' | 'warn' | 'fail';
    threshold?: number;  // ms
}

export interface ProfilerConfig {
    warmupIterations: number;
    benchmarkIterations: number;
    warnThresholdMs: number;    // warn if mean exceeds this
    failThresholdMs: number;    // fail if mean exceeds this
}

const DEFAULT_CONFIG: ProfilerConfig = {
    warmupIterations: 10,
    benchmarkIterations: 100,
    warnThresholdMs: 50,
    failThresholdMs: 200,
};

export class SynBioProfiler {
    private results: BenchmarkResult[] = [];
    private config: ProfilerConfig;

    constructor(config: Partial<ProfilerConfig> = {}) {
        this.config = { ...DEFAULT_CONFIG, ...config };
    }

    /**
     * Benchmark a synchronous function.
     * Runs warmup iterations, then measures N iterations.
     */
    bench(name: string, fn: () => void, thresholdMs?: number): BenchmarkResult {
        const { warmupIterations, benchmarkIterations, warnThresholdMs, failThresholdMs } = this.config;

        // Warmup — let JIT/V8 optimize
        for (let i = 0; i < warmupIterations; i++) {
            fn();
        }

        // Force GC if available
        if (typeof global !== 'undefined' && (global as any).gc) {
            (global as any).gc();
        }

        const heapBefore = process.memoryUsage().heapUsed;
        const timings: number[] = [];

        for (let i = 0; i < benchmarkIterations; i++) {
            const start = performance.now();
            fn();
            const end = performance.now();
            timings.push(end - start);
        }

        const heapAfter = process.memoryUsage().heapUsed;
        const sorted = [...timings].sort((a, b) => a - b);

        const mean = timings.reduce((a, b) => a + b, 0) / timings.length;
        const median = sorted[Math.floor(sorted.length / 2)];
        const p95 = sorted[Math.floor(sorted.length * 0.95)];
        const p99 = sorted[Math.floor(sorted.length * 0.99)];
        const min = sorted[0];
        const max = sorted[sorted.length - 1];
        const variance = timings.reduce((acc, t) => acc + (t - mean) ** 2, 0) / timings.length;
        const stddev = Math.sqrt(variance);
        const opsPerSec = mean > 0 ? 1000 / mean : Infinity;

        const threshold = thresholdMs ?? failThresholdMs;
        let status: 'pass' | 'warn' | 'fail' = 'pass';
        if (mean > threshold) {
            status = 'fail';
        } else if (mean > (thresholdMs ?? warnThresholdMs)) {
            status = 'warn';
        }

        const result: BenchmarkResult = {
            name,
            samples: benchmarkIterations,
            mean: round(mean, 4),
            median: round(median, 4),
            p95: round(p95, 4),
            p99: round(p99, 4),
            min: round(min, 4),
            max: round(max, 4),
            stddev: round(stddev, 4),
            opsPerSec: round(opsPerSec, 1),
            heapDelta: heapAfter - heapBefore,
            status,
            threshold,
        };

        this.results.push(result);
        return result;
    }

    /**
     * Benchmark memory usage of a function (bytes allocated).
     */
    benchMemory(name: string, fn: () => any): { name: string; heapUsed: number; rss: number } {
        if (typeof global !== 'undefined' && (global as any).gc) {
            (global as any).gc();
        }
        const before = process.memoryUsage();
        fn();
        const after = process.memoryUsage();
        return {
            name,
            heapUsed: after.heapUsed - before.heapUsed,
            rss: after.rss - before.rss,
        };
    }

    /**
     * Measure throughput: how many items/sec can be processed.
     */
    throughput(name: string, items: any[], fn: (item: any) => void): {
        name: string;
        totalItems: number;
        totalTimeMs: number;
        itemsPerSec: number;
    } {
        const start = performance.now();
        for (const item of items) {
            fn(item);
        }
        const elapsed = performance.now() - start;

        return {
            name,
            totalItems: items.length,
            totalTimeMs: round(elapsed, 2),
            itemsPerSec: round((items.length / elapsed) * 1000, 1),
        };
    }

    /** Get all results */
    getResults(): BenchmarkResult[] {
        return [...this.results];
    }

    /** Check if any benchmarks failed their thresholds */
    hasFailures(): boolean {
        return this.results.some(r => r.status === 'fail');
    }

    /** Generate formatted text report */
    report(): string {
        const lines: string[] = [
            '╔══════════════════════════════════════════════════════════╗',
            '║        SynBio-LLVM Performance Benchmark Report        ║',
            '╚══════════════════════════════════════════════════════════╝',
            '',
        ];

        for (const r of this.results) {
            const icon = r.status === 'pass' ? '✓' : r.status === 'warn' ? '⚠' : '✗';
            lines.push(`  ${icon} ${r.name}`);
            lines.push(`    mean=${r.mean}ms  median=${r.median}ms  p95=${r.p95}ms  p99=${r.p99}ms`);
            lines.push(`    ops/sec=${r.opsPerSec}  stddev=${r.stddev}ms  heap_delta=${r.heapDelta}B`);
            lines.push('');
        }

        const passing = this.results.filter(r => r.status === 'pass').length;
        const warnings = this.results.filter(r => r.status === 'warn').length;
        const failures = this.results.filter(r => r.status === 'fail').length;
        lines.push(`  Summary: ${passing} pass, ${warnings} warn, ${failures} fail  (${this.results.length} total)`);

        return lines.join('\n');
    }

    /** Export results as JSON (for CI artifact upload) */
    toJSON(): string {
        return JSON.stringify({
            timestamp: new Date().toISOString(),
            nodeVersion: process.version,
            platform: process.platform,
            arch: process.arch,
            results: this.results,
        }, null, 2);
    }

    /** Clear all results */
    clear(): void {
        this.results = [];
    }
}

function round(n: number, decimals: number): number {
    const factor = Math.pow(10, decimals);
    return Math.round(n * factor) / factor;
}
