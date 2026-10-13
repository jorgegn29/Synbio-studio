/**
 * ══════════════════════════════════════════════════════════════
 * Unit Tests — Real Thermodynamics Module
 * Validates ΔG°, Tm, GC% calculations against published data.
 *
 * References:
 *   SantaLucia J Jr (1998) PNAS 95:1460-1465 — Unified NN params
 *   Owczarzy R et al (2004) Biochemistry 43:3537 — Salt corrections
 *   Breslauer KJ et al (1986) PNAS 83:3746 — Original NN parameters
 *
 * NOTE: calculateGCContent returns percentage (0-100), NOT fraction.
 *       calculateDeltaG temperature param is °C, NOT Kelvin.
 * ══════════════════════════════════════════════════════════════
 */
import { strict as assert } from 'assert';
import { calculateDeltaG, calculateTm, calculateGCContent } from '../../real-thermodynamics';

suite('Real Thermodynamics — Unit Tests', () => {

    suite('GC Content', () => {
        test('Pure AT returns 0%', () => {
            assert.strictEqual(calculateGCContent('AAATTTTAAA'), 0);
        });
        test('Pure GC returns 100%', () => {
            assert.strictEqual(calculateGCContent('GGGCCCGGGC'), 100);
        });
        test('50% GC returns 50', () => {
            const gc = calculateGCContent('ATGC');
            assert.ok(Math.abs(gc - 50) < 1, `Expected ~50%, got ${gc}%`);
        });
        test('Empty sequence returns 0', () => {
            assert.strictEqual(calculateGCContent(''), 0);
        });
        test('Known sequence GCGATCGATCGC = 66.67%', () => {
            const gc = calculateGCContent('GCGATCGATCGC');
            assert.ok(Math.abs(gc - 66.67) < 1, `Expected ~66.67%, got ${gc}%`);
        });
    });

    suite('Melting Temperature (Tm)', () => {
        test('Short oligo (<14bp) uses Wallace Rule', () => {
            const tm = calculateTm('ATGCATGC', 0.25e-6, 0.05);
            assert.ok(tm > 15 && tm < 40, `Short oligo Tm=${tm} should be 15-40°C`);
        });

        test('Longer oligo uses SantaLucia NN model', () => {
            const tm = calculateTm('GCGATCGATCGC', 0.25e-6, 0.05);
            assert.ok(tm > 30 && tm < 70, `NN Tm=${tm} should be 30-70°C`);
        });

        test('High GC has higher Tm than low GC (same length)', () => {
            const tmHighGC = calculateTm('GCGCGCGCGCGCGCGC', 0.25e-6, 0.05);
            const tmLowGC  = calculateTm('ATATATATATATATATAT', 0.25e-6, 0.05);
            assert.ok(tmHighGC > tmLowGC, `High GC Tm=${tmHighGC} should > Low GC Tm=${tmLowGC}`);
        });

        test('Longer sequence has higher Tm (same composition bias)', () => {
            const tmShort = calculateTm('GCGATCGATCGC', 0.25e-6, 0.05);
            const tmLong  = calculateTm('GCGATCGATCGCGATCGATCGC', 0.25e-6, 0.05);
            assert.ok(tmLong > tmShort, `Long Tm=${tmLong} should > Short Tm=${tmShort}`);
        });
    });

    suite('Free Energy (ΔG°)', () => {
        test('Self-complementary palindrome has negative ΔG at 37°C', () => {
            const dG = calculateDeltaG('GCGATCGC', 1.0, 37);
            assert.ok(dG < 0, `ΔG=${dG} should be < 0 for paired sequence at 37°C`);
        });

        test('Longer stable duplex has more negative ΔG', () => {
            const dGshort = calculateDeltaG('GCGCGC', 1.0, 37);
            const dGlong  = calculateDeltaG('GCGCGCGCGC', 1.0, 37);
            assert.ok(dGlong < dGshort, `Longer ΔG=${dGlong} should be more negative than ${dGshort}`);
        });

        test('AT-rich has less negative ΔG than GC-rich (same length)', () => {
            const dGat = calculateDeltaG('ATATATATAT', 1.0, 37);
            const dGgc = calculateDeltaG('GCGCGCGCGC', 1.0, 37);
            assert.ok(dGgc < dGat, `GC ΔG=${dGgc} should be more negative than AT ΔG=${dGat}`);
        });
    });
});
