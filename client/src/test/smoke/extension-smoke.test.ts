/**
 * ══════════════════════════════════════════════════════════════
 * Smoke Test — Scientific Module Health Check
 * Verifies that all pure scientific modules (no vscode dependency)
 * load and execute without crash.
 * ══════════════════════════════════════════════════════════════
 */
import { strict as assert } from 'assert';

suite('Extension Smoke Tests', () => {

    test('Core scientific modules import without errors', () => {
        // Only test modules that DON'T depend on vscode
        const pureModules = [
            '../../real-thermodynamics',
            '../../real-restriction-enzymes',
            '../../real-protein-analysis',
            '../../real-codon-tables',
            '../../simplex-solver',
        ];
        for (const mod of pureModules) {
            assert.doesNotThrow(() => {
                require(mod);
            }, `Module ${mod} should import without errors`);
        }
    });

    test('Codon tables export expected organisms', () => {
        const { ECOLI_K12_CODON_TABLE, getCodonTable } = require('../../real-codon-tables');
        assert.ok(ECOLI_K12_CODON_TABLE, 'Should have E. coli table');
        assert.ok(Object.keys(ECOLI_K12_CODON_TABLE).length === 64, 'Should have 64 codons');
        const table = getCodonTable('ecoli');
        assert.ok(table, 'getCodonTable should return table');
    });

    test('Restriction enzyme database loads', () => {
        const { findRestrictionSites } = require('../../real-restriction-enzymes');
        assert.ok(typeof findRestrictionSites === 'function', 'Should export findRestrictionSites');
        const sites = findRestrictionSites('GAATTC');
        assert.ok(Array.isArray(sites), 'Should return array');
    });

    test('Thermodynamic functions are callable', () => {
        const { calculateDeltaG, calculateTm, calculateGCContent } = require('../../real-thermodynamics');
        assert.ok(typeof calculateDeltaG === 'function');
        assert.ok(typeof calculateTm === 'function');
        assert.ok(typeof calculateGCContent === 'function');
    });

    test('ProtParam analyzer returns structured result', () => {
        const { analyzeProtein } = require('../../real-protein-analysis');
        const result = analyzeProtein('MSKGEELFTGVVPILVELDG');
        assert.ok(result.molecularWeight > 0, 'Should have MW');
        assert.ok(result.pI !== undefined, 'Should have pI');
        assert.ok(result.gravy !== undefined, 'Should have GRAVY');
    });

    test('FBA solver produces valid output', () => {
        const { createEcoliCoreModel, runFBA } = require('../../simplex-solver');
        const model = createEcoliCoreModel();
        const result = runFBA(model);
        assert.ok(result.objectiveValue !== undefined, 'Should have objective');
        assert.ok(result.fluxes !== undefined, 'Should have fluxes');
        assert.ok(typeof result.status === 'string', 'Should have status string');
    });
});
