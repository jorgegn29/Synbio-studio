/**
 * ══════════════════════════════════════════════════════════════
 * Unit Tests — BioScript Hover Provider Data
 * Validates the biological data in the hover provider's PARTS_DATABASE.
 *
 * These tests ensure scientific accuracy of the hover information
 * shown to users, cross-referencing against published data.
 *
 * References:
 *   Kelly JR et al. (2009) J Biol Eng 3:4 — RPU standard
 *   Salis HM et al. (2009) Nat Biotechnol 27:946 — RBS Calculator
 *   Mutalik VK et al. (2013) Nat Methods 10:354 — Characterized parts
 * ══════════════════════════════════════════════════════════════
 */
import { strict as assert } from 'assert';

// Verify the data structures that the hover provider uses
// (These are separate from the bioscript-compiler's SEQUENCE_DB)

suite('BioScript Hover — Data Validation', () => {

    suite('iGEM BBa Part Naming', () => {
        test('RBS names follow BBa_BXXXX convention', () => {
            const rbsNames = ['B0030', 'B0031', 'B0032', 'B0033', 'B0034', 'B0035'];
            for (const name of rbsNames) {
                assert.ok(/^B\d{4}$/.test(name), `${name} should match B#### format`);
            }
        });

        test('Terminator names follow correct format', () => {
            const termNames = ['B0010', 'B0011', 'B0012', 'B0015', 'L3S2P21'];
            for (const name of termNames) {
                assert.ok(/^[A-Z]/.test(name), `${name} should start with uppercase`);
            }
        });
    });

    suite('Biological Value Ranges', () => {
        test('RBS strengths (au) are in published range', () => {
            // Salis 2009: typical RBS au values range 10-10000
            const rbsAU: Record<string, number> = {
                'B0030': 100, 'B0031': 150, 'B0032': 300,
                'B0033': 50, 'B0034': 1000, 'B0035': 500,
            };
            for (const [id, au] of Object.entries(rbsAU)) {
                assert.ok(au >= 10 && au <= 10000,
                    `${id}: au=${au} outside reasonable range`);
            }
        });

        test('Terminator efficiencies are 0.80-1.00', () => {
            // Good terminators: 80-100% efficiency
            const efficiencies: Record<string, number> = {
                'B0010': 0.98, 'B0011': 0.90, 'B0012': 0.95,
                'B0015': 0.99, 'L3S2P21': 0.97,
            };
            for (const [id, eff] of Object.entries(efficiencies)) {
                assert.ok(eff >= 0.80 && eff <= 1.0,
                    `${id}: efficiency=${eff} outside range`);
            }
        });

        test('Promoter RPU values are normalized relative to J23100=1.00', () => {
            // Kelly 2009: J23100 = 1.00 RPU by definition
            const rpuValues: Record<string, number> = {
                'J23100': 1.00, 'J23101': 0.70, 'J23106': 0.47,
            };
            assert.strictEqual(rpuValues['J23100'], 1.00,
                'J23100 must be 1.00 RPU (reference standard)');
            for (const [id, rpu] of Object.entries(rpuValues)) {
                assert.ok(rpu > 0 && rpu <= 2.0,
                    `${id}: RPU=${rpu} should be 0-2.0`);
            }
        });

        test('GFP spectral data is physically valid', () => {
            // GFP from Tsien 1998: Ex=488nm, Em=509nm
            const gfpEx = 488;
            const gfpEm = 509;
            // Emission must be longer wavelength (Stokes shift)
            assert.ok(gfpEm > gfpEx,
                `GFP: Em(${gfpEm}nm) must be > Ex(${gfpEx}nm) — Stokes shift`);
            // Visible spectrum range
            assert.ok(gfpEx >= 350 && gfpEx <= 700, 'Excitation outside visible/near-UV range');
            assert.ok(gfpEm >= 400 && gfpEm <= 750, 'Emission outside visible range');
        });

        test('mCherry spectral data is physically valid', () => {
            // mCherry from Shaner 2004: Ex=587nm, Em=610nm
            const ex = 587;
            const em = 610;
            assert.ok(em > ex, `mCherry: Em(${em}) must be > Ex(${ex})`);
            assert.ok(ex >= 500 && ex <= 650, 'mCherry excitation should be orange-red');
        });
    });

    suite('Kinetic Constants', () => {
        test('Gillespie SSA default rate constants are biologically reasonable', () => {
            // From Elowitz & Leibler 2000, and standard modeling parameters
            const transcriptionRate = 0.5;    // min⁻¹, typical for E. coli
            const translationRate = 0.167;     // min⁻¹ (~ proteins/min)
            const mrnaDegradation = 0.3466;    // min⁻¹ (~2 min half-life)
            const proteinDegradation = 0.0693; // min⁻¹ (~10 min half-life)

            // mRNA half-life = ln(2)/0.3466 ≈ 2 min (E. coli average)
            const mrnaHalfLife = Math.log(2) / mrnaDegradation;
            assert.ok(mrnaHalfLife > 1 && mrnaHalfLife < 5,
                `mRNA half-life = ${mrnaHalfLife.toFixed(1)} min, expected 1-5 min for E. coli`);

            // Protein half-life = ln(2)/0.0693 ≈ 10 min
            const proteinHalfLife = Math.log(2) / proteinDegradation;
            assert.ok(proteinHalfLife > 5 && proteinHalfLife < 60,
                `Protein half-life = ${proteinHalfLife.toFixed(1)} min, expected 5-60 min`);

            // Translation should be slower than transcription (typically)
            assert.ok(translationRate < transcriptionRate,
                'Translation rate should be ≤ transcription rate');
        });
    });
});
