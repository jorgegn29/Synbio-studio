/**
 * ══════════════════════════════════════════════════════════════
 * Unit Tests — Real Restriction Enzymes
 * Validates recognition sites, cut positions and BioBrick compat
 * against NEB / REBASE published data.
 *
 * References:
 *   Roberts RJ et al (2015) Nucleic Acids Res 43:D298 — REBASE
 *   Knight T (2003) MIT AI Lab — BioBrick RFC[10]
 * ══════════════════════════════════════════════════════════════
 */
import { strict as assert } from 'assert';
import { findRestrictionSites, checkBioBrickCompatibility, generateRestrictionMap } from '../../real-restriction-enzymes';

suite('Restriction Enzymes — Unit Tests', () => {

    suite('findRestrictionSites', () => {
        test('EcoRI (GAATTC) found in correct position', () => {
            const seq = 'AAAGAATTCAAA';
            const sites = findRestrictionSites(seq);
            const eco = sites.filter(s => s.enzyme === 'EcoRI');
            assert.ok(eco.length >= 1, 'Should find EcoRI');
            assert.strictEqual(eco[0].position, 3);
        });

        test('BamHI (GGATCC) detected', () => {
            const seq = 'TTTGGATCCAAA';
            const sites = findRestrictionSites(seq);
            const bam = sites.filter(s => s.enzyme === 'BamHI');
            assert.ok(bam.length >= 1, 'Should find BamHI');
        });

        test('Multiple sites in same sequence', () => {
            const seq = 'GAATTCAAAGAATTC';
            const sites = findRestrictionSites(seq);
            const eco = sites.filter(s => s.enzyme === 'EcoRI');
            assert.ok(eco.length >= 2, `Should find ≥2 EcoRI sites, found ${eco.length}`);
        });

        test('No sites in random sequence', () => {
            const seq = 'AAAAAAAAAA';
            const sites = findRestrictionSites(seq);
            assert.strictEqual(sites.length, 0, 'Should find no sites in poly-A');
        });

        test('Returns strand information', () => {
            const seq = 'GAATTC';
            const sites = findRestrictionSites(seq);
            assert.ok(sites.length > 0);
            assert.ok(sites[0].strand !== undefined, 'Should have strand info');
        });
    });

    suite('BioBrick Compatibility RFC[10]', () => {
        test('Sequence without BioBrick sites is compatible', () => {
            const result = checkBioBrickCompatibility('ATGAAACCCGGGTAA');
            assert.strictEqual(result.compatible, true);
        });

        test('Internal EcoRI makes incompatible', () => {
            const result = checkBioBrickCompatibility('ATGGAATTCTAA');
            assert.strictEqual(result.compatible, false);
            assert.ok(result.violations.length > 0);
        });

        test('Internal SpeI makes incompatible', () => {
            const result = checkBioBrickCompatibility('ATGACTAGTTAA');
            assert.strictEqual(result.compatible, false);
        });
    });

    suite('generateRestrictionMap', () => {
        test('Returns string output', () => {
            const map = generateRestrictionMap('GAATTCATGCCTGCAGATCTAGA');
            assert.ok(typeof map === 'string');
            assert.ok(map.length > 0);
        });
    });
});
