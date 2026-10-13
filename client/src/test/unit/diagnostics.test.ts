/**
 * ══════════════════════════════════════════════════════════════
 * Unit Tests — BioScript Diagnostics Provider
 * Validates diagnostic rules produce correct warnings/errors.
 *
 * Since BioScriptDiagnosticsProvider requires the vscode API,
 * these tests validate the supporting logic and known-parts databases
 * used by the diagnostics system.
 *
 * References:
 *   - iGEM Registry for part data
 *   - BMBL 6th Ed. for select agents
 *   - SantaLucia 1998 for GC content calculations
 * ══════════════════════════════════════════════════════════════
 */
import { strict as assert } from 'assert';
import { detectToxicExpressionBurden, isEcoliChassis, isStrongPromoter } from '../../bio-linter-rules';
import { calculateGCContent } from '../../real-thermodynamics';

// Replicate the known-parts databases from bioscript-diagnostics.ts for validation
const KNOWN_RBS: Record<string, { strength: string; au: number }> = {
    'B0030': { strength: 'weak', au: 100 },
    'B0031': { strength: 'weak', au: 150 },
    'B0032': { strength: 'medium', au: 300 },
    'B0033': { strength: 'weak', au: 50 },
    'B0034': { strength: 'strong', au: 1000 },
    'B0035': { strength: 'medium', au: 500 },
};

const KNOWN_TERMINATORS: Record<string, { efficiency: number }> = {
    'B0010': { efficiency: 0.98 },
    'B0011': { efficiency: 0.90 },
    'B0012': { efficiency: 0.95 },
    'B0015': { efficiency: 0.99 },
    'L3S2P21': { efficiency: 0.97 },
};

const SELECT_AGENTS = [
    'B_anthracis', 'Y_pestis', 'F_tularensis', 'C_botulinum', 'Ebola', 'SARS',
    'Variola', 'Marburg', 'Nipah', 'H5N1',
];

const CHASSIS_BSL: Record<string, number> = {
    'ecoli_k12': 1, 'ecoli_dh5alpha': 1, 'ecoli_bl21': 1,
    'agrobacterium_tumefaciens': 2, 'salmonella_typhimurium': 2,
};

suite('BioScript Diagnostics — Unit Tests', () => {

    suite('GC Content Thresholds (BIO-W040)', () => {
        test('Normal GC (50%) should NOT trigger diagnostic', () => {
            const gc = calculateGCContent('ATGCATGCATGC');
            // GC content ~50% — within 25-75 range, no warning
            assert.ok(gc >= 25 && gc <= 75, `GC=${gc}% should be in safe range`);
        });

        test('High GC (>75%) SHOULD trigger diagnostic', () => {
            const gc = calculateGCContent('GCGCGCGCGCGCGCGCGCGC');
            // 100% GC → should trigger BIO-W040
            assert.ok(gc > 75, `GC=${gc}% should be above threshold`);
        });

        test('Low GC (<25%) SHOULD trigger diagnostic', () => {
            const gc = calculateGCContent('AATATAATATAT');
            assert.ok(gc < 25, `GC=${gc}% should be below threshold`);
        });

        test('Borderline 40% is within safe range', () => {
            // AATTGC = 2GC/6 = 33.33%. Use AATGCG = 50%
            const gc = calculateGCContent('AATGCGATGCGA');
            assert.ok(gc >= 25 && gc <= 75, `GC=${gc}% should pass`);
        });

        test('calculateGCContent returns percentage NOT fraction', () => {
            const gc = calculateGCContent('GCGCGCGC');
            // Must return 100, not 1.0
            assert.ok(gc > 1, `GC should be percentage (got ${gc}), not fraction`);
            assert.ok(gc <= 100, `GC should be <=100 (got ${gc})`);
        });
    });

    suite('Known Parts Database', () => {
        test('RBS strength ordering is correct', () => {
            assert.ok(KNOWN_RBS['B0034'].au > KNOWN_RBS['B0032'].au,
                'B0034 (strong) should have higher au than B0032 (medium)');
            assert.ok(KNOWN_RBS['B0032'].au > KNOWN_RBS['B0033'].au,
                'B0032 (medium) should have higher au than B0033 (weak)');
        });

        test('B0034 is the standard reference RBS (1000 au)', () => {
            assert.strictEqual(KNOWN_RBS['B0034'].au, 1000);
            assert.strictEqual(KNOWN_RBS['B0034'].strength, 'strong');
        });

        test('All RBS have valid au values', () => {
            for (const [id, rbs] of Object.entries(KNOWN_RBS)) {
                assert.ok(rbs.au > 0 && rbs.au <= 10000, `${id}: au=${rbs.au} out of range`);
                assert.ok(['weak', 'medium', 'strong'].includes(rbs.strength),
                    `${id}: unknown strength "${rbs.strength}"`);
            }
        });

        test('Terminators efficiency is between 0 and 1', () => {
            for (const [id, term] of Object.entries(KNOWN_TERMINATORS)) {
                assert.ok(term.efficiency > 0 && term.efficiency <= 1,
                    `${id}: efficiency=${term.efficiency} out of range`);
            }
        });

        test('B0015 double terminator has highest efficiency', () => {
            const b0015 = KNOWN_TERMINATORS['B0015'];
            for (const [id, term] of Object.entries(KNOWN_TERMINATORS)) {
                if (id !== 'B0015') {
                    assert.ok(b0015.efficiency >= term.efficiency,
                        `B0015 (${b0015.efficiency}) should be >= ${id} (${term.efficiency})`);
                }
            }
        });
    });

    suite('Select Agents Database (BIO-S001)', () => {
        test('Contains CDC Category A agents', () => {
            assert.ok(SELECT_AGENTS.includes('B_anthracis'), 'B. anthracis missing');
            assert.ok(SELECT_AGENTS.includes('Y_pestis'), 'Y. pestis missing');
            assert.ok(SELECT_AGENTS.includes('Variola'), 'Variola missing');
            assert.ok(SELECT_AGENTS.includes('Ebola'), 'Ebola missing');
        });

        test('All entries are non-empty strings', () => {
            for (const agent of SELECT_AGENTS) {
                assert.ok(agent.length > 0, 'Empty select agent detected');
            }
        });
    });

    suite('Chassis BSL Levels', () => {
        test('E. coli lab strains are BSL-1', () => {
            assert.strictEqual(CHASSIS_BSL['ecoli_k12'], 1);
            assert.strictEqual(CHASSIS_BSL['ecoli_dh5alpha'], 1);
            assert.strictEqual(CHASSIS_BSL['ecoli_bl21'], 1);
        });

        test('Pathogenic strains are BSL-2', () => {
            assert.strictEqual(CHASSIS_BSL['agrobacterium_tumefaciens'], 2);
            assert.strictEqual(CHASSIS_BSL['salmonella_typhimurium'], 2);
        });

        test('No BSL-3+ organisms in standard chassis list', () => {
            for (const [org, bsl] of Object.entries(CHASSIS_BSL)) {
                assert.ok(bsl <= 2, `${org} has BSL-${bsl}, should be <=2 for standard chassis`);
            }
        });
    });

    suite('Diagnostic Pattern Detection', () => {
        test('snake_case regex works correctly', () => {
            const snakeCaseRx = /^[a-z][a-z0-9_]*$/;
            assert.ok(snakeCaseRx.test('my_circuit'), 'my_circuit should be snake_case');
            assert.ok(snakeCaseRx.test('repressilator'), 'repressilator should be snake_case');
            assert.ok(!snakeCaseRx.test('MyCircuit'), 'MyCircuit should NOT be snake_case');
            assert.ok(!snakeCaseRx.test('UPPERCASE'), 'UPPERCASE should NOT be snake_case');
        });

        test('BioBrick restriction site detection', () => {
            const bbSites: Record<string, string> = {
                'GAATTC': 'EcoRI', 'TCTAGA': 'XbaI', 'ACTAGT': 'SpeI', 'CTGCAG': 'PstI',
            };
            const testSeq = 'ATGCGAATTCATGCATGC'; // Contains EcoRI site
            const found: string[] = [];
            for (const [site, enzyme] of Object.entries(bbSites)) {
                if (testSeq.includes(site)) {
                    found.push(enzyme);
                }
            }
            assert.ok(found.includes('EcoRI'), 'Should detect EcoRI site GAATTC');
            assert.ok(!found.includes('XbaI'), 'Should not detect XbaI (not present)');
        });

        test('DNA sequence regex matches valid sequences', () => {
            const dnaRx = /["']([ACGTUacgtu]{10,})["']/;
            assert.ok(dnaRx.test('"ATGCATGCATGC"'), 'Should match 12-char DNA');
            assert.ok(dnaRx.test("'GCGATCGATCG'"), 'Should match single-quoted DNA');
            assert.ok(!dnaRx.test('"ATGCAT"'), 'Should NOT match <10 chars');
            assert.ok(!dnaRx.test('"Hello World"'), 'Should NOT match non-DNA text');
        });
    });

    suite('Bio-Linter Contextual Burden Warning (BIO-W060)', () => {
        test('Detects strong promoter plus toxic protein in E. coli chassis', () => {
            const code = `circuit toxic_expression {
    host: "ecoli_k12"

    gene toxin_ccdb {
        promoter: J23100
        rbs: B0034
        product: "CcdB"
        terminator: B0015
    }
}`;

            const findings = detectToxicExpressionBurden(code);

            assert.strictEqual(findings.length, 1, 'Expected one contextual burden warning');
            assert.strictEqual(findings[0].code, 'BIO-W060');
            assert.ok(findings[0].message.includes('carga metabólica extrema'));
            assert.ok(findings[0].message.includes('ecoli_k12'));
        });

        test('Supports custom strong promoters declared by strength', () => {
            const code = `circuit tuned_toxicity {
    organism: "Escherichia coli K-12"

    promoter pStress {
        strength: 0.92
    }

    gene toxin_module {
        promoter: pStress
        product: "MazF"
        terminator: B0015
    }
}`;

            const findings = detectToxicExpressionBurden(code);

            assert.strictEqual(findings.length, 1, 'Expected custom strong promoter to trigger warning');
            assert.ok(isStrongPromoter('pStress', new Map([['pStress', 0.92]])));
            assert.ok(isEcoliChassis('Escherichia coli K-12'));
        });

        test('Detects linear syntax with upstream standalone promoter', () => {
            const code = `circuit toxin_linear {
    host: "ecoli_k12"

    promoter J23100
    rbs: B0034
    gene ccdB_toxin
    terminator: B0015
}`;

            const findings = detectToxicExpressionBurden(code);

            assert.strictEqual(findings.length, 1, 'Expected standalone promoter syntax to trigger warning');
            assert.ok(findings[0].message.includes("'J23100'"));
        });

        test('Does not warn for non-toxic payloads or non-E. coli chassis', () => {
            const nonToxic = `circuit reporter {
    host: "ecoli_k12"

    gene reporter_gfp {
        promoter: J23100
        product: "GFP"
        terminator: B0015
    }
}`;

            const nonEcoli = `circuit toxic_yeast {
    host: "yeast_s288c"

    gene toxin_ccdb {
        promoter: J23100
        product: "CcdB"
        terminator: B0015
    }
}`;

            assert.strictEqual(detectToxicExpressionBurden(nonToxic).length, 0);
            assert.strictEqual(detectToxicExpressionBurden(nonEcoli).length, 0);
        });
    });
});
