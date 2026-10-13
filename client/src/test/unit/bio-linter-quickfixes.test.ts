import { strict as assert } from 'assert';
import { getBioLinterPromoterQuickFixes } from '../../bio-linter-quickfixes';

suite('Bio-Linter Quick Fixes — BIO-W060', () => {
    test('Offers pBAD, pTet y J23106 for strong toxic promoter warnings', () => {
        const fixes = getBioLinterPromoterQuickFixes('J23100');

        assert.deepStrictEqual(
            fixes.map(fix => fix.replacement),
            ['pBAD', 'pTet', 'J23106'],
        );
        assert.strictEqual(fixes[0].preferred, true);
    });

    test('Omits the promoter already present in the diagnostic range', () => {
        const fixes = getBioLinterPromoterQuickFixes('pTet');

        assert.deepStrictEqual(
            fixes.map(fix => fix.replacement),
            ['pBAD', 'J23106'],
        );
    });
});