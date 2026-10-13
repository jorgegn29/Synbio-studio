import { detectToxicExpressionBurden } from './bio-linter-rules';

export const CONTEXTUAL_TOXIC_BURDEN_MODE = {
    id: 'ProtTox-003',
    name: 'Promotor fuerte impulsando toxina en E. coli',
    description: 'Una toxina o proteína potencialmente letal bajo un promotor fuerte en E. coli combina burden extremo con pérdida rápida de viabilidad. Suele colapsar el cultivo antes de una caracterización útil.',
    probability: 0.91,
    severity: 'critical' as const,
    evidence: [
        { citation: 'Ceroni F et al. Nat Methods 2015;12(5):415-418', finding: 'La sobreexpresión heteróloga fuerte desvía recursos y compromete fuertemente el crecimiento bacteriano.', failureRate: 78 },
        { citation: 'Bernard P, Couturier M. J Mol Biol 1992;226:735-745', finding: 'CcdB intoxica E. coli por inhibición de DNA girasa; la expresión sin control reduce drásticamente la viabilidad.', failureRate: 90 },
    ],
    fixes: [
        'Cambiar a un promotor inducible (pBAD o pTet) o reducir la fuerza a J23106/J23116 antes de construir.',
        'Medir OD600 y CFU en cultivo corto para cuantificar impacto de crecimiento antes de escalar.',
        'Mantener la toxina desacoplada de la fase de crecimiento usando un trigger de inducción o un kill-switch dedicado.',
    ],
    affectedParts: ['J23100', 'J23101', 'pT7', 'pTac', 'pTrc', 'pLacUV5', 'CcdB', 'MazF', 'RelE', 'ParE'],
};

export interface ContextualToxicBurdenFailure {
    id: string;
    name: string;
    description: string;
    probability: number;
    severity: 'critical';
    triggeredBy: string;
    lineNumber: number;
    partName?: string;
    suggestion: string;
}

export function detectContextualBurdenFailures(code: string): ContextualToxicBurdenFailure[] {
    return detectToxicExpressionBurden(code).map(finding => {
        const promoterName = finding.message.match(/promotor fuerte '([^']+)'/)?.[1];
        const toxicLabel = finding.message.match(/proteína potencialmente tóxica '([^']+)'/)?.[1];

        return {
            id: CONTEXTUAL_TOXIC_BURDEN_MODE.id,
            name: CONTEXTUAL_TOXIC_BURDEN_MODE.name,
            description: CONTEXTUAL_TOXIC_BURDEN_MODE.description,
            probability: CONTEXTUAL_TOXIC_BURDEN_MODE.probability,
            severity: CONTEXTUAL_TOXIC_BURDEN_MODE.severity,
            triggeredBy: `Promotor fuerte "${promoterName ?? 'desconocido'}" impulsando carga tóxica "${toxicLabel ?? 'desconocida'}" en E. coli`,
            lineNumber: finding.line,
            partName: promoterName,
            suggestion: CONTEXTUAL_TOXIC_BURDEN_MODE.fixes[0],
        };
    });
}