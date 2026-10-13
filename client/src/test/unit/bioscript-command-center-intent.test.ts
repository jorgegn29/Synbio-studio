import { strict as assert } from 'assert';
import {
    inferBioScriptCommand,
    rankBioScriptCommandIntents,
    resolveBioScriptCommandParameters,
} from '../../bioscript-command-center-intent';

suite('BioScript Command Center — Intent Routing', () => {
    test('Infer compile intent for active circuit prompts', () => {
        const inferred = inferBioScriptCommand('compila el circuito actual a FASTA');
        assert.ok(inferred, 'Expected an inferred action');
        assert.strictEqual(inferred?.actionId, 'command.compileCircuit');
    });

    test('Infer client watch task from workspace prompts', () => {
        const inferred = inferBioScriptCommand('arranca el watch del cliente');
        assert.ok(inferred, 'Expected an inferred action');
        assert.strictEqual(inferred?.actionId, 'task.clientWatch');
    });

    test('Infer server terminal for backend terminal prompts', () => {
        const inferred = inferBioScriptCommand('abre terminal en server para cargo');
        assert.ok(inferred, 'Expected an inferred action');
        assert.strictEqual(inferred?.actionId, 'terminal.server');
    });

    test('Prioritize BioScript generation for design prompts', () => {
        const ranked = rankBioScriptCommandIntents('genera bioscript para un biosensor con kill switch', 3);
        assert.ok(ranked.length > 0, 'Expected ranked intents');
        assert.strictEqual(ranked[0].actionId, 'command.generateBioScript');
    });

    test('Route failure-analysis prompts to failure predictor', () => {
        const inferred = inferBioScriptCommand('depura el circuito y predice fallos');
        assert.ok(inferred, 'Expected an inferred action');
        assert.strictEqual(inferred?.actionId, 'command.predictFailures');
    });

    test('Resolve filename and new-file delivery for generated BioScript', () => {
        const params = resolveBioScriptCommandParameters(
            'genera bioscript para un biosensor de arseniato con kill switch en un archivo llamado arsenic_guard.bio',
            'command.generateBioScript'
        );

        assert.strictEqual(params.delivery, 'new-file');
        assert.strictEqual(params.fileNameHint, 'arsenic_guard.bio');
        assert.strictEqual(params.circuitNameHint, 'arsenic_guard');
    });

    test('Resolve host and inferred file name for new circuit prompts', () => {
        const params = resolveBioScriptCommandParameters(
            'crea un nuevo circuito para levadura con memoria metabolica',
            'command.newCircuit'
        );

        assert.strictEqual(params.delivery, 'new-file');
        assert.strictEqual(params.hostHint, 'yeast_s288c');
        assert.strictEqual(params.fileNameHint, 'levadura_memoria_metabolica.bio');
    });
});