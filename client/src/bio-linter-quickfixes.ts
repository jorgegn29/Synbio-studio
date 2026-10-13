export interface BioLinterPromoterQuickFix {
    title: string;
    replacement: string;
    preferred: boolean;
}

const BIO_LINTER_PROMOTER_FIXES: BioLinterPromoterQuickFix[] = [
    { title: '🔁 Sustituir por pBAD (inducible)', replacement: 'pBAD', preferred: true },
    { title: '🔁 Sustituir por pTet (inducible)', replacement: 'pTet', preferred: false },
    { title: '🔁 Reducir a J23106 (constitutivo medio)', replacement: 'J23106', preferred: false },
];

export function getBioLinterPromoterQuickFixes(currentPromoter: string): BioLinterPromoterQuickFix[] {
    return BIO_LINTER_PROMOTER_FIXES.filter(fix => fix.replacement !== currentPromoter.trim());
}