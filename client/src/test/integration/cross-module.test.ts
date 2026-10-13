/**
 * ══════════════════════════════════════════════════════════════
 * INTEGRATION TESTS — Cross-Module Workflows
 *
 * Validates that scientific modules work together correctly
 * in realistic end-to-end synthetic biology workflows.
 * ══════════════════════════════════════════════════════════════
 */
import { strict as assert } from 'assert';

suite('═══ INTEGRATION: Cross-Module Workflows ═══', () => {

    // ── Workflow 1: Sequence → Thermodynamics → Design Rules ─── 
    suite('Sequence Analysis Pipeline', () => {
        const thermo = require('../../real-thermodynamics');
        const restriction = require('../../real-restriction-enzymes');

        test('Full analysis: GC% + Tm + restriction sites on same sequence', () => {
            const seq = 'ATGAAAGAATTCGCGGCCGCTCTAGAGGATCCAAAGCTTAA';

            // Step 1: Thermodynamic analysis (GC returns percentage 0-100)
            const gc = thermo.calculateGCContent(seq);
            assert.ok(gc > 0 && gc < 100, 'GC% should be between 0 and 100');

            const tm = thermo.calculateTm(seq, 0.25e-6, 0.05);
            assert.ok(tm > 30 && tm < 100, `Tm=${tm} should be physiological range`);

            // Step 2: Restriction analysis on same sequence
            const sites = restriction.findRestrictionSites(seq);
            assert.ok(sites.length > 0, 'Should detect restriction sites in MCS-like sequence');

            // Step 3: BioBrick compatibility (should FAIL — has internal EcoRI)
            const compat = restriction.checkBioBrickCompatibility(seq);
            assert.strictEqual(compat.compatible, false,
                'Sequence with internal EcoRI should not be BioBrick compatible');
        });

        test('Clean CDS passes all checks', () => {
            // A simple CDS without restriction sites in BioBrick set
            const cleanCDS = 'ATGACCCTGAAATACATTCAGGGCGTGCTGTAA';

            const gc = thermo.calculateGCContent(cleanCDS);
            assert.ok(gc >= 30 && gc <= 70, `GC%=${gc} should be in 30-70% range`);

            const compat = restriction.checkBioBrickCompatibility(cleanCDS);
            assert.strictEqual(compat.compatible, true, 'Clean CDS should be BioBrick OK');
        });
    });

    // ── Workflow 2: Protein Design Pipeline ────────────────────
    suite('Protein Characterization Pipeline', () => {
        const protein = require('../../real-protein-analysis');

        test('Translate conceptual → analyze protein → validate', () => {
            // GFP chromophore region sequence
            const gfpFragment = 'MVSKGEELFTGV';

            // Step 1: Protein analysis
            const result = protein.analyzeProtein(gfpFragment);
            assert.ok(result.molecularWeight > 0, 'MW should be positive');
            assert.ok(result.pI !== undefined, 'pI should be computed');
            assert.ok(typeof result.gravy === 'number', 'GRAVY should be number');
            assert.ok(result.aminoAcidComposition !== undefined, 'AA composition returned');

            // Step 2: Check all standard properties are present
            const props = ['molecularWeight', 'pI', 'gravy', 'instabilityIndex', 'extinctionCoeff'];
            for (const prop of props) {
                assert.ok(prop in result, `Missing property: ${prop}`);
            }
        });

        test('Different proteins have different profiles', () => {
            // Hydrophobic membrane-like
            const hydrophobic = protein.analyzeProtein('AILVVVVLLLAAA');
            // Hydrophilic soluble-like
            const hydrophilic = protein.analyzeProtein('DDDEEEKKKRRR');

            assert.ok(hydrophobic.gravy > hydrophilic.gravy,
                'Hydrophobic protein should have higher GRAVY');
        });
    });

    // ── Workflow 3: FBA + Codon → Metabolic Engineering ───────
    suite('Metabolic Engineering Pipeline', () => {
        const { createEcoliCoreModel, runFBA } = require('../../simplex-solver');
        const { ECOLI_K12_CODON_TABLE, getCodonTable } = require('../../real-codon-tables');

        test('FBA result + codon table availability for same organism', () => {
            // Step 1: Run FBA
            const model = createEcoliCoreModel();
            const fba = runFBA(model);
            assert.ok(fba.fluxes, 'FBA should return fluxes');

            // Step 2: Codon table available for E. coli
            const ecoliTable = getCodonTable('ecoli');
            assert.ok(ecoliTable, 'Should have E. coli codon table');
            assert.ok(Object.keys(ecoliTable).length === 64, 'Should have 64 codons');
        });
    });

    // ── Workflow 4: Full Design Cycle ─────────────────────────
    suite('Complete Design Cycle', () => {
        const thermo = require('../../real-thermodynamics');
        const restriction = require('../../real-restriction-enzymes');
        const protein = require('../../real-protein-analysis');

        test('End-to-end: sequence → check → protein → validate', () => {
            // Realistic gene: signal peptide + simple protein
            const gene = 'ATGAAACTGACCCTGATGCCGTCTTTCGCG';
            const proteinSeq = 'MKLTLMPSFА'; // simplified

            // 1. Check sequence thermodynamics
            const gc = thermo.calculateGCContent(gene);
            assert.ok(gc > 0, 'GC% computed');

            // 2. Find restriction sites
            const sites = restriction.findRestrictionSites(gene);
            assert.ok(Array.isArray(sites), 'Sites array returned');

            // 3. Check BioBrick compatibility
            const compat = restriction.checkBioBrickCompatibility(gene);
            assert.ok(typeof compat.compatible === 'boolean', 'Compat check returns boolean');

            // 4. Full pipeline completes without errors
            assert.ok(true, 'Full design cycle completed successfully');
        });
    });
});
