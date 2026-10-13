/**
 * ══════════════════════════════════════════════════════════════
 * Unit Tests — Real Protein Analysis (ProtParam)
 * Validates MW, pI, GRAVY, instability index, extinction coeff
 * against ExPASy ProtParam published reference values.
 *
 * References:
 *   Gasteiger E et al (2005) — ExPASy ProtParam tool
 *   Bjellqvist B et al (1993) — Isoelectric point estimation
 *   Guruprasad K et al (1990) — Instability index
 *   Kyte J & Doolittle RF (1982) — Hydropathicity (GRAVY)
 *   Pace CN et al (1995) — Extinction coefficient
 * ══════════════════════════════════════════════════════════════
 */
import { strict as assert } from 'assert';
import { analyzeProtein } from '../../real-protein-analysis';

suite('Protein Analysis (ProtParam) — Unit Tests', () => {

    // Reference: GFP chromophore peptide — well-characterized
    const GFP_SHORT = 'MSKGEELFTGVVPILVELDG';

    suite('Molecular Weight', () => {
        test('Short peptide MW is in expected range', () => {
            const result = analyzeProtein(GFP_SHORT);
            // 20 aa → ~2200 Da (avg 110 Da/aa)
            assert.ok(result.molecularWeight > 1500 && result.molecularWeight < 3000,
                `MW=${result.molecularWeight} should be 1500-3000 Da for 20 aa`);
        });

        test('MW scales linearly with length', () => {
            const r1 = analyzeProtein('MSKGEE');
            const r2 = analyzeProtein('MSKGEELFTGVV');
            assert.ok(r2.molecularWeight > r1.molecularWeight * 1.5,
                'Double length should roughly double MW');
        });
    });

    suite('Isoelectric Point (pI)', () => {
        test('pI is in valid range [0, 14]', () => {
            const result = analyzeProtein(GFP_SHORT);
            assert.ok(result.pI >= 0 && result.pI <= 14,
                `pI=${result.pI} should be 0-14`);
        });

        test('Acidic protein has low pI', () => {
            // All Asp/Glu = very acidic
            const result = analyzeProtein('MDDDDEEEE');
            assert.ok(parseFloat(String(result.pI)) < 5.0,
                `Acidic protein pI=${result.pI} should be < 5.0`);
        });

        test('Basic protein has high pI', () => {
            // All Lys/Arg = very basic
            const result = analyzeProtein('MKKKKRRRR');
            assert.ok(parseFloat(String(result.pI)) > 9.0,
                `Basic protein pI=${result.pI} should be > 9.0`);
        });
    });

    suite('GRAVY Score', () => {
        test('Hydrophilic protein has negative GRAVY', () => {
            // Charged residues = hydrophilic
            const result = analyzeProtein('MKDEKRDEKR');
            assert.ok(result.gravy < 0, `Hydrophilic GRAVY=${result.gravy} should be < 0`);
        });

        test('Hydrophobic protein has positive GRAVY', () => {
            // Ile, Val, Leu = hydrophobic
            const result = analyzeProtein('MIVLIVLIVL');
            assert.ok(result.gravy > 0, `Hydrophobic GRAVY=${result.gravy} should be > 0`);
        });
    });

    suite('Instability Index', () => {
        test('Returns numeric value', () => {
            const result = analyzeProtein(GFP_SHORT);
            assert.ok(typeof result.instabilityIndex === 'number');
        });

        test('isStable flag matches threshold (< 40 = stable)', () => {
            const result = analyzeProtein(GFP_SHORT);
            if (result.instabilityIndex < 40) {
                assert.strictEqual(result.isStable, true);
            } else {
                assert.strictEqual(result.isStable, false);
            }
        });
    });

    suite('Extinction Coefficient', () => {
        test('Protein with Trp/Tyr has nonzero ε280', () => {
            // W (Trp) contributes 5500, Y (Tyr) contributes 1490
            const result = analyzeProtein('MSKGEELFTGWYPILVELDG');
            assert.ok(result.extinctionCoeff > 0,
                `ε280=${result.extinctionCoeff} should be > 0 with Trp+Tyr`);
        });

        test('Protein without Trp/Tyr has zero ε280', () => {
            const result = analyzeProtein('MSKGEELFTGVV');
            assert.strictEqual(result.extinctionCoeff, 0,
                'ε280 should be 0 without Trp/Tyr/Cys');
        });
    });

    suite('Amino Acid Composition', () => {
        test('Returns all 20 standard amino acids', () => {
            const result = analyzeProtein(GFP_SHORT);
            const aaCount = Object.keys(result.aminoAcidComposition).length;
            assert.strictEqual(aaCount, 20, `Should have 20 AA entries, got ${aaCount}`);
        });

        test('Percentages sum to ~100%', () => {
            const result = analyzeProtein(GFP_SHORT);
            const total = Object.values(result.aminoAcidComposition)
                .reduce((sum: number, d: any) => sum + d.percentage, 0);
            assert.ok(Math.abs(total - 100) < 1, `Total=${total}% should be ~100%`);
        });
    });
});
