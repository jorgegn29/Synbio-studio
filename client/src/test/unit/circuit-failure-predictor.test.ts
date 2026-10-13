import { strict as assert } from 'assert';
import { detectContextualBurdenFailures } from '../../contextual-toxic-burden';

suite('Circuit Failure Predictor — Contextual Toxic Burden', () => {
    test('Triggers ProtTox-003 for strong promoter plus toxin in E. coli', () => {
        const code = `circuit toxic_expression {
    host: "ecoli_k12"

    gene toxin_ccdb {
        promoter: J23100
        rbs: B0034
        product: "CcdB"
        terminator: B0015
    }
}`;

        const failures = detectContextualBurdenFailures(code);

        assert.strictEqual(failures.length, 1, 'Expected one contextual failure');
        assert.strictEqual(failures[0].id, 'ProtTox-003');
        assert.strictEqual(failures[0].severity, 'critical');
        assert.strictEqual(failures[0].partName, 'J23100');
        assert.strictEqual(failures[0].lineNumber, 4);
        assert.ok(failures[0].triggeredBy.includes('CcdB'));
        assert.ok(failures[0].suggestion.includes('pBAD'));
    });

    test('Triggers ProtTox-003 for linear syntax in E. coli', () => {
        const code = `circuit toxin_linear {
    host: "ecoli_k12"

    promoter J23100
    rbs: B0034
    gene ccdB_toxin
    terminator: B0015
}`;

        const failures = detectContextualBurdenFailures(code);

        assert.strictEqual(failures.length, 1, 'Expected linear syntax to trigger contextual failure');
        assert.strictEqual(failures[0].id, 'ProtTox-003');
        assert.strictEqual(failures[0].partName, 'J23100');
        assert.strictEqual(failures[0].lineNumber, 3);
    });

    test('Does not trigger for non-toxic payloads or non-E. coli chassis', () => {
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

        assert.strictEqual(detectContextualBurdenFailures(nonToxic).length, 0);
        assert.strictEqual(detectContextualBurdenFailures(nonEcoli).length, 0);
    });
});