/**
 * ══════════════════════════════════════════════════════════════
 * Unit Tests — BioScript FASTA Compiler
 * Validates circuit parsing, sequence resolution, and FASTA generation.
 *
 * Tests verify:
 *   - parseCircuits() correctly identifies circuits, TUs, connections
 *   - SEQUENCE_DB contains real sequences of expected lengths
 *   - Edge cases: empty circuits, missing parts, multiple circuits
 *
 * References:
 *   iGEM Registry — parts.igem.org
 *   Elowitz MB & Leibler S (2000) Nature 403:335 — Repressilator
 * ══════════════════════════════════════════════════════════════
 */
import { strict as assert } from 'assert';
import { parseCircuits, SEQUENCE_DB } from '../../bioscript-compiler';

suite('BioScript Compiler — Unit Tests', () => {

    // ── SEQUENCE DATABASE ──

    suite('Sequence Database', () => {
        test('Contains core RBS parts (B0030-B0035)', () => {
            const rbsParts = ['B0030', 'B0031', 'B0032', 'B0033', 'B0034', 'B0035'];
            for (const id of rbsParts) {
                assert.ok(SEQUENCE_DB[id], `Missing RBS: ${id}`);
                assert.strictEqual(SEQUENCE_DB[id].type, 'rbs');
                assert.ok(SEQUENCE_DB[id].seq.length > 0, `Empty sequence for ${id}`);
                assert.strictEqual(SEQUENCE_DB[id].seq.length, SEQUENCE_DB[id].bp,
                    `${id}: seq.length(${SEQUENCE_DB[id].seq.length}) != bp(${SEQUENCE_DB[id].bp})`);
            }
        });

        test('Contains core terminators (B0010, B0012, B0015)', () => {
            const terms = ['B0010', 'B0012', 'B0015'];
            for (const id of terms) {
                assert.ok(SEQUENCE_DB[id], `Missing terminator: ${id}`);
                assert.strictEqual(SEQUENCE_DB[id].type, 'terminator');
                assert.strictEqual(SEQUENCE_DB[id].seq.length, SEQUENCE_DB[id].bp);
            }
        });

        test('B0015 double terminator is longer than B0010 single', () => {
            assert.ok(SEQUENCE_DB['B0015'].bp > SEQUENCE_DB['B0010'].bp,
                `Double term B0015(${SEQUENCE_DB['B0015'].bp}bp) should be > B0010(${SEQUENCE_DB['B0010'].bp}bp)`);
        });

        test('Contains key promoters (pLac, pTet, pBAD, pT7)', () => {
            const promoters = ['pLac', 'pTet', 'pBAD', 'pT7'];
            for (const id of promoters) {
                assert.ok(SEQUENCE_DB[id], `Missing promoter: ${id}`);
                assert.strictEqual(SEQUENCE_DB[id].type, 'promoter');
                assert.ok(SEQUENCE_DB[id].bp >= 19, `Promoter ${id} too short: ${SEQUENCE_DB[id].bp}bp`);
            }
        });

        test('All sequences contain only valid DNA characters', () => {
            for (const [id, entry] of Object.entries(SEQUENCE_DB)) {
                const invalid = entry.seq.replace(/[ATGCatgc]/g, '');
                assert.strictEqual(invalid.length, 0,
                    `${id} has invalid chars: "${invalid}" in "${entry.seq.substring(0, 30)}..."`);
            }
        });

        test('All entries have consistent bp field', () => {
            for (const [id, entry] of Object.entries(SEQUENCE_DB)) {
                assert.strictEqual(entry.seq.length, entry.bp,
                    `${id}: seq.length=${entry.seq.length}, bp=${entry.bp}`);
            }
        });
    });

    // ── CIRCUIT PARSING ──

    suite('Circuit Parsing', () => {
        test('Parses empty circuit', () => {
            const source = 'circuit empty {\n}';
            const circuits = parseCircuits(source);
            assert.strictEqual(circuits.length, 1);
            assert.strictEqual(circuits[0].name, 'empty');
            assert.strictEqual(circuits[0].transcriptionUnits.length, 0);
        });

        test('Parses simple circuit with one TU', () => {
            const source = `
circuit simple {
    promoter pLac {}
    gene gfp {
        rbs: B0034
        terminator: B0015
    }
}`;
            const circuits = parseCircuits(source);
            assert.strictEqual(circuits.length, 1);
            assert.strictEqual(circuits[0].name, 'simple');
            assert.ok(circuits[0].transcriptionUnits.length >= 1,
                `Expected >=1 TU, got ${circuits[0].transcriptionUnits.length}`);

            const tu = circuits[0].transcriptionUnits[0];
            assert.strictEqual(tu.promoter, 'pLac');
        });

        test('Detects kill_switch', () => {
            const source = `
circuit withKS {
    promoter pLac {}
    gene gfp { rbs: B0034, terminator: B0015 }
    kill_switch {
        toxin: CcdB
        antitoxin: CcdA
    }
}`;
            const circuits = parseCircuits(source);
            assert.strictEqual(circuits[0].hasKillSwitch, true);
            assert.strictEqual(circuits[0].killSwitchToxin, 'CcdB');
            assert.strictEqual(circuits[0].killSwitchAntitoxin, 'CcdA');
        });

        test('Parses connections (activation and repression)', () => {
            const source = `
circuit toggle {
    promoter pLac {}
    gene lacI { rbs: B0034, terminator: B0015 }
    promoter pTet {}
    gene tetR { rbs: B0034, terminator: B0015 }
    LacI -> pTet
    TetR ~> pLac
}`;
            const circuits = parseCircuits(source);
            assert.ok(circuits[0].connections.length >= 2,
                `Expected >=2 connections, got ${circuits[0].connections.length}`);
            
            const activation = circuits[0].connections.find(c => c.type === 'activation');
            const repression = circuits[0].connections.find(c => c.type === 'repression');
            assert.ok(activation, 'Expected an activation connection');
            assert.ok(repression, 'Expected a repression connection');
        });

        test('Parses multiple circuits', () => {
            const source = `
circuit first {
    promoter pLac {}
    gene gfp { rbs: B0034, terminator: B0015 }
}

circuit second {
    promoter pTet {}
    gene rfp { rbs: B0032, terminator: B0010 }
}`;
            const circuits = parseCircuits(source);
            assert.strictEqual(circuits.length, 2);
            assert.strictEqual(circuits[0].name, 'first');
            assert.strictEqual(circuits[1].name, 'second');
        });

        test('Returns empty array for non-BioScript input', () => {
            const source = 'console.log("hello");\nconst x = 42;';
            const circuits = parseCircuits(source);
            assert.strictEqual(circuits.length, 0);
        });

        test('Handles repressilator circuit (3 TUs)', () => {
            const source = `
circuit repressilator {
    promoter pLac {}
    gene tetR { rbs: B0034, terminator: B0015 }
    
    promoter pTet {}
    gene cI { rbs: B0034, terminator: B0015 }
    
    promoter pLambda {}
    gene lacI { rbs: B0034, terminator: B0015 }
}`;
            const circuits = parseCircuits(source);
            assert.strictEqual(circuits.length, 1);
            assert.strictEqual(circuits[0].transcriptionUnits.length, 3,
                `Repressilator should have 3 TUs, got ${circuits[0].transcriptionUnits.length}`);
        });
    });

    // ── ROBUSTNESS ──

    suite('Robustness', () => {
        test('Handles empty string', () => {
            const circuits = parseCircuits('');
            assert.strictEqual(circuits.length, 0);
        });

        test('Handles unclosed circuit brace', () => {
            const source = 'circuit broken {\n    promoter pLac {}\n';
            // Should not throw, may produce partial result
            assert.doesNotThrow(() => parseCircuits(source));
        });

        test('Handles circuit with no genes', () => {
            const source = 'circuit empty_tu {\n    promoter pLac {}\n}';
            const circuits = parseCircuits(source);
            assert.strictEqual(circuits.length, 1);
        });

        test('Line numbers track correctly', () => {
            const source = `// comment
// another
circuit test {
    promoter pLac {}
    gene gfp { rbs: B0034, terminator: B0015 }
}`;
            const circuits = parseCircuits(source);
            assert.ok(circuits[0].lineStart >= 2, `Circuit should start at line >=2, got ${circuits[0].lineStart}`);
        });
    });
});
