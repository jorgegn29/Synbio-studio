/**
 * ══════════════════════════════════════════════════════════════
 * PERFORMANCE BENCHMARK TESTS — SynBio-LLVM
 *
 * Measures latency, throughput, and memory for all scientific
 * computation modules. Enforces regression thresholds.
 *
 * Thresholds:
 *   - Single sequence analysis: < 5ms (critical path)
 *   - Batch 1000 sequences: < 500ms
 *   - FBA solver: < 100ms
 *   - Protein analysis: < 10ms
 *   - Memory: < 50MB heap for batch ops
 * ══════════════════════════════════════════════════════════════
 */
import { strict as assert } from 'assert';
import { SynBioProfiler } from '../../perf-profiler';

suite('═══ PERFORMANCE BENCHMARKS ═══', () => {
    const profiler = new SynBioProfiler({
        warmupIterations: 5,
        benchmarkIterations: 50,
        warnThresholdMs: 50,
        failThresholdMs: 200,
    });

    // ── THERMODYNAMICS PERFORMANCE ──────────────────────────────
    suite('Thermodynamics Latency', () => {
        const { calculateDeltaG, calculateTm, calculateGCContent } = require('../../real-thermodynamics');

        test('GC% single sequence < 1ms', () => {
            const result = profiler.bench('GC Content (20bp)', () => {
                calculateGCContent('GCGATCGATCGCGATCGATC');
            }, 1);
            assert.ok(result.mean < 1, `GC% mean=${result.mean}ms, expected < 1ms`);
        });

        test('Tm calculation < 5ms', () => {
            const result = profiler.bench('Tm (25bp, NN model)', () => {
                calculateTm('GCGATCGATCGCGATCGATCGCGAT', 0.25e-6, 0.05);
            }, 5);
            assert.ok(result.mean < 5, `Tm mean=${result.mean}ms, expected < 5ms`);
        });

        test('ΔG calculation < 5ms', () => {
            const result = profiler.bench('ΔG° (30bp)', () => {
                calculateDeltaG('GCGATCGATCGCGATCGATCGCGATCGATC', 1.0, 37);
            }, 5);
            assert.ok(result.mean < 5, `ΔG mean=${result.mean}ms, expected < 5ms`);
        });

        test('Batch 1000 GC% calculations < 100ms', () => {
            const seqs = Array.from({ length: 1000 }, () => 'GCGATCGATCGCGATCGATC');
            const tp = profiler.throughput('GC% batch (1000 seqs)', seqs, (s) => {
                calculateGCContent(s);
            });
            assert.ok(tp.totalTimeMs < 100, `Batch 1000 GC% took ${tp.totalTimeMs}ms, expected < 100ms`);
            assert.ok(tp.itemsPerSec > 5000, `Throughput ${tp.itemsPerSec} seqs/sec, expected > 5000`);
        });
    });

    // ── PROTEIN ANALYSIS PERFORMANCE ────────────────────────────
    suite('Protein Analysis Latency', () => {
        const { analyzeProtein } = require('../../real-protein-analysis');

        test('Full ProtParam analysis < 10ms', () => {
            const result = profiler.bench('ProtParam (30aa)', () => {
                analyzeProtein('FVNQHLCGSHLVEALYLVCGERGFFYTPKT');
            }, 10);
            assert.ok(result.mean < 10, `ProtParam mean=${result.mean}ms, expected < 10ms`);
        });

        test('Batch 100 protein analyses < 500ms', () => {
            const proteins = Array.from({ length: 100 }, () => 'FVNQHLCGSHLVEALYLVCGERGFFYTPKT');
            const tp = profiler.throughput('ProtParam batch (100)', proteins, (p) => {
                analyzeProtein(p);
            });
            assert.ok(tp.totalTimeMs < 500, `Batch 100 proteins took ${tp.totalTimeMs}ms, expected < 500ms`);
        });
    });

    // ── RESTRICTION ENZYMES PERFORMANCE ─────────────────────────
    suite('Restriction Enzymes Latency', () => {
        const { findRestrictionSites, checkBioBrickCompatibility } = require('../../real-restriction-enzymes');

        test('findRestrictionSites (1KB sequence) < 10ms', () => {
            const seq = 'GATCGATCGATC'.repeat(85); // ~1020bp
            const result = profiler.bench('Restriction sites (1KB)', () => {
                findRestrictionSites(seq);
            }, 10);
            assert.ok(result.mean < 10, `Restriction scan mean=${result.mean}ms, expected < 10ms`);
        });

        test('BioBrick compatibility check < 5ms', () => {
            const result = profiler.bench('BioBrick compat check', () => {
                checkBioBrickCompatibility('ATGAAACCCTTTAGGCCCAAATTTGGG');
            }, 5);
            assert.ok(result.mean < 5, `BioBrick check mean=${result.mean}ms, expected < 5ms`);
        });
    });

    // ── FBA SOLVER PERFORMANCE ──────────────────────────────────
    suite('FBA Solver Latency', () => {
        const { createEcoliCoreModel, runFBA } = require('../../simplex-solver');

        test('E. coli core FBA < 100ms', () => {
            const model = createEcoliCoreModel();
            const result = profiler.bench('FBA (E. coli core)', () => {
                runFBA(model);
            }, 100);
            assert.ok(result.mean < 100, `FBA mean=${result.mean}ms, expected < 100ms`);
        });
    });

    // ── CODON OPTIMIZATION PERFORMANCE ──────────────────────────
    suite('Codon Tables Latency', () => {
        const { getCodonTable, calculateCAI } = require('../../real-codon-tables');

        test('getCodonTable lookup < 1ms', () => {
            const result = profiler.bench('Codon table lookup', () => {
                getCodonTable('ecoli');
            }, 1);
            assert.ok(result.mean < 1, `Codon lookup mean=${result.mean}ms, expected < 1ms`);
        });

        test('CAI calculation (300bp CDS) < 5ms', () => {
            const cds = 'ATGGCGATCGATCGCGATCGATCGCGATCGATCGCG'.repeat(10);
            const result = profiler.bench('CAI (300bp)', () => {
                calculateCAI(cds, 'ecoli');
            }, 5);
            assert.ok(result.mean < 5, `CAI mean=${result.mean}ms, expected < 5ms`);
        });
    });

    // ── MEMORY PROFILE ──────────────────────────────────────────
    suite('Memory Usage', () => {
        const { analyzeProtein } = require('../../real-protein-analysis');
        const { calculateGCContent } = require('../../real-thermodynamics');

        test('1000 analyses < 10MB heap growth', () => {
            const mem = profiler.benchMemory('1000 mixed analyses', () => {
                for (let i = 0; i < 500; i++) {
                    calculateGCContent('GCGATCGATCGCGATCGATC');
                    analyzeProtein('FVNQHLCGSHLVEALYLVCGER');
                }
            });
            const mbGrowth = mem.heapUsed / (1024 * 1024);
            assert.ok(Math.abs(mbGrowth) < 10,
                `Heap grew ${mbGrowth.toFixed(2)}MB, expected < 10MB`);
        });
    });

    // ── FINAL REPORT ────────────────────────────────────────────
    suiteTeardown(() => {
        console.log('\n' + profiler.report());
    });
});
