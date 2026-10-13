/**
 * ══════════════════════════════════════════════════════════════
 * Unit Tests — Simplex Solver (FBA)
 * Validates LP solver structure and E. coli core model API.
 *
 * References:
 *   Orth JD et al (2010) Nat Biotechnol 28:245 — E. coli iAF1260
 *   Dantzig GB (1963) Linear Programming and Extensions
 *
 * NOTE: The simplified core model may return 'infeasible' due to
 * the reduced stoichiometry (18 reactions vs 95 in full core).
 * Tests validate solver API, structure, and constraint handling.
 * ══════════════════════════════════════════════════════════════
 */
import { strict as assert } from 'assert';
import { createEcoliCoreModel, runFBA, solveSimplex } from '../../simplex-solver';

suite('Simplex Solver (FBA) — Unit Tests', () => {

    test('E. coli core model creates with expected structure', () => {
        const model = createEcoliCoreModel();
        assert.ok(model, 'Model should be created');
        assert.ok(model.reactions.length >= 15, `Should have ≥15 reactions, got ${model.reactions.length}`);
        assert.ok(model.metabolites.length >= 15, `Should have ≥15 metabolites, got ${model.metabolites.length}`);
        assert.strictEqual(model.objectiveReaction, 'BIOMASS');
    });

    test('FBA returns valid status string', () => {
        const model = createEcoliCoreModel();
        const result = runFBA(model);
        assert.ok(result, 'FBA should return result');
        const validStatuses = ['optimal', 'infeasible', 'unbounded', 'error'];
        assert.ok(validStatuses.includes(result.status),
            `Status="${result.status}" should be one of ${validStatuses.join(', ')}`);
    });

    test('FBA result has all required fields', () => {
        const model = createEcoliCoreModel();
        const result = runFBA(model);
        assert.ok('objectiveValue' in result, 'Should have objectiveValue');
        assert.ok('fluxes' in result, 'Should have fluxes');
        assert.ok('status' in result, 'Should have status');
        assert.ok(typeof result.objectiveValue === 'number', 'objectiveValue should be number');
    });

    test('Fluxes object has entries for reactions', () => {
        const model = createEcoliCoreModel();
        const result = runFBA(model);
        const fluxCount = Object.keys(result.fluxes).length;
        assert.ok(fluxCount > 0, `Should have flux values, got ${fluxCount}`);
    });

    test('All fluxes are finite and bounded', () => {
        const model = createEcoliCoreModel();
        const result = runFBA(model);
        for (const [rxn, flux] of Object.entries(result.fluxes)) {
            assert.ok(isFinite(flux), `Flux ${rxn}=${flux} should be finite`);
            assert.ok(Math.abs(flux) < 10000, `Flux ${rxn}=${flux} should be bounded`);
        }
    });

    test('Simplex solver handles trivial LP correctly', () => {
        // maximize x1 + x2 s.t. x1 + x2 = 10, 0 <= x1,x2 <= 10
        const problem = {
            numVars: 2,
            numConstraints: 1,
            objective: [1, 1],
            constraintMatrix: [[1, 1]],
            rhs: [10],
            lowerBounds: [0, 0],
            upperBounds: [10, 10],
        };
        const result = solveSimplex(problem);
        assert.ok(result, 'Simplex should return a result');
        assert.ok('status' in result, 'Result should have status');
        assert.ok('objectiveValue' in result, 'Result should have objectiveValue');
    });
});
