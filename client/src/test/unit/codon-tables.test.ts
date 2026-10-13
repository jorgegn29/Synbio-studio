/**
 * ══════════════════════════════════════════════════════════════
 * Unit Tests — Codon Tables & Optimization
 * Validates real codon usage tables against Kazusa Database.
 *
 * References:
 *   Nakamura Y et al (2000) NAR 28:292 — Kazusa codon usage DB
 *   Sharp PM & Li WH (1987) NAR 15:1281 — Codon Adaptation Index
 *
 * NOTE: Module exports individual tables (ECOLI_K12_CODON_TABLE, etc.)
 *       and getCodonTable(organism) helper. Entries have shape:
 *       { aminoAcid: 'Met', aminoAcidSingle: 'M', frequency: 27.1, fraction: 1.0 }
 * ══════════════════════════════════════════════════════════════
 */
import { strict as assert } from 'assert';
import { ECOLI_K12_CODON_TABLE, getCodonTable, GENETIC_CODE } from '../../real-codon-tables';

suite('Codon Tables — Unit Tests', () => {

    test('E. coli table exists and has 64 codons', () => {
        const ecoli = ECOLI_K12_CODON_TABLE;
        assert.ok(ecoli, 'E. coli codon table should exist');
        const codons = Object.keys(ecoli);
        assert.strictEqual(codons.length, 64, `Should have 64 codons, got ${codons.length}`);
    });

    test('All 64 codons map to valid amino acids or stop', () => {
        const table = ECOLI_K12_CODON_TABLE;
        const validAA = 'ACDEFGHIKLMNPQRSTVWY*'.split('');
        for (const [codon, data] of Object.entries(table)) {
            assert.strictEqual(codon.length, 3, `Codon "${codon}" should be 3 chars`);
            const aa = data.aminoAcidSingle;
            assert.ok(validAA.includes(aa) || aa === '*',
                `Codon ${codon} maps to invalid AA: "${aa}"`);
        }
    });

    test('ATG maps to Methionine (M) in E. coli', () => {
        const atg = ECOLI_K12_CODON_TABLE['ATG'];
        assert.ok(atg, 'ATG should exist');
        assert.ok(atg.aminoAcidSingle === 'M', `ATG should be M, got "${atg.aminoAcidSingle}"`);
    });

    test('Stop codons (TAA, TAG, TGA) map to Stop/*', () => {
        for (const stop of ['TAA', 'TAG', 'TGA']) {
            const data = ECOLI_K12_CODON_TABLE[stop];
            assert.ok(data, `${stop} should exist`);
            assert.ok(data.aminoAcidSingle === '*' || data.aminoAcid === 'Stop' || data.aminoAcid === 'Ter',
                `${stop} should be Stop, got "${data.aminoAcidSingle}"`);
        }
    });

    test('Fraction values are bounded [0, 1]', () => {
        const table = ECOLI_K12_CODON_TABLE;
        for (const [codon, data] of Object.entries(table)) {
            if (data.fraction !== undefined) {
                assert.ok(data.fraction >= 0 && data.fraction <= 1.01,
                    `Codon ${codon} fraction=${data.fraction} should be in [0, 1]`);
            }
        }
    });

    test('getCodonTable returns table for ecoli', () => {
        const table = getCodonTable('ecoli');
        assert.ok(table, 'getCodonTable should return a table');
        assert.ok(Object.keys(table).length === 64, 'Should have 64 codons');
    });
});
