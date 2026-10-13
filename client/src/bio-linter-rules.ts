export interface BioLinterFinding {
    code: string;
    line: number;
    startChar: number;
    endChar: number;
    message: string;
}

const STRONG_PROMOTERS = new Set([
    'J23100',
    'J23101',
    'pT7',
    'pTac',
    'pTrc',
    'pLacUV5',
]);

const TOXIC_PROTEIN_PATTERN = /\b(?:toxin|ccdb|mazf|rele|pare|hok|barnase|colicin|holin)\b/i;
const TOXIC_PROTEIN_LABELS = ['ccdb', 'mazf', 'rele', 'pare', 'hok', 'barnase', 'colicin', 'holin', 'toxin'];
const TOXIC_PROTEIN_DISPLAY_NAMES: Record<string, string> = {
    ccdb: 'CcdB',
    mazf: 'MazF',
    rele: 'RelE',
    pare: 'ParE',
    hok: 'Hok',
    barnase: 'Barnase',
    colicin: 'Colicin',
    holin: 'Holin',
    toxin: 'toxin',
};
const ECOLI_CHASSIS_PATTERN = /\b(?:ecoli(?:_[a-z0-9]+)?|escherichia\s+coli(?:\s+k-?12)?|dh5alpha|bl21(?:_de3)?|mg1655|top10|nissle1917)\b/i;
const HOST_DECLARATION_PATTERN = /(?:host|organism)\s*:\s*(?:"([^"]+)"|'([^']+)'|([A-Za-z0-9_.-]+))/i;

interface GeneContext {
    geneName: string;
    geneLine: number;
    promoterName?: string;
    promoterLine: number;
    toxicLabel?: string;
}

interface PromoterReference {
    promoterName?: string;
    promoterLine: number;
}

export function isEcoliChassis(chassis: string): boolean {
    return ECOLI_CHASSIS_PATTERN.test(chassis.trim());
}

export function isStrongPromoter(promoterName: string, promoterStrengths?: Map<string, number>): boolean {
    const explicitStrength = promoterStrengths?.get(promoterName);
    if (typeof explicitStrength === 'number') {
        return explicitStrength >= 0.8;
    }

    return STRONG_PROMOTERS.has(promoterName);
}

export function detectToxicExpressionBurden(text: string): BioLinterFinding[] {
    const lines = text.split('\n');
    const host = detectHost(lines);

    if (!host || !isEcoliChassis(host)) {
        return [];
    }

    const promoterStrengths = collectPromoterStrengths(lines);
    const genes = collectGeneContexts(lines);

    return genes
        .filter(gene => gene.promoterName && gene.toxicLabel && isStrongPromoter(gene.promoterName, promoterStrengths))
        .map(gene => {
            const targetLine = gene.promoterLine >= 0 ? gene.promoterLine : gene.geneLine;
            const marker = gene.promoterName || gene.toxicLabel || gene.geneName;
            const { startChar, endChar } = findHighlightRange(lines[targetLine] || '', marker);

            return {
                code: 'BIO-W060',
                line: targetLine,
                startChar,
                endChar,
                message: `Warning biológico: alta probabilidad de carga metabólica extrema; el promotor fuerte '${gene.promoterName}' está impulsando la proteína potencialmente tóxica '${gene.toxicLabel}' en el chasis '${host}'. El crecimiento celular podría verse comprometido.`,
            };
        });
}

function detectHost(lines: string[]): string | undefined {
    for (const line of lines) {
        const match = line.match(HOST_DECLARATION_PATTERN);
        if (match) {
            return match[1] || match[2] || match[3];
        }
    }

    return undefined;
}

function collectPromoterStrengths(lines: string[]): Map<string, number> {
    const promoterStrengths = new Map<string, number>();

    for (let i = 0; i < lines.length; i++) {
        const trimmed = lines[i].trim();
        const promoterMatch = trimmed.match(/^promoter\s+(\w+)/i);
        if (!promoterMatch) {
            continue;
        }

        const promoterName = promoterMatch[1];
        const strength = findPromoterStrength(lines, i);
        if (typeof strength === 'number') {
            promoterStrengths.set(promoterName, strength);
        }
    }

    return promoterStrengths;
}

function findPromoterStrength(lines: string[], startLine: number): number | undefined {
    for (let i = startLine; i < Math.min(startLine + 6, lines.length); i++) {
        const trimmed = lines[i].trim();
        const strengthMatch = trimmed.match(/strength\s*:\s*([\d.]+)/i);
        if (strengthMatch) {
            return Number.parseFloat(strengthMatch[1]);
        }

        if (i > startLine && /^(promoter|gene|circuit|rule|kill_switch)\s+\w+/i.test(trimmed)) {
            break;
        }

        if (i > startLine && trimmed === '}') {
            break;
        }
    }

    return undefined;
}

function collectGeneContexts(lines: string[]): GeneContext[] {
    const contexts: GeneContext[] = [];

    for (let i = 0; i < lines.length; i++) {
        const trimmed = lines[i].trim();
        const geneMatch = trimmed.match(/^gene\s+(\w+)/i);
        if (!geneMatch) {
            continue;
        }

        const geneName = geneMatch[1];
        const nearestPromoter = findNearestPromoter(lines, i);
        let promoterName = nearestPromoter.promoterName;
        let promoterLine = nearestPromoter.promoterLine;
        let toxicLabel = extractToxicLabel(trimmed) || extractToxicLabel(geneName);

        for (let j = i; j < Math.min(i + 12, lines.length); j++) {
            const geneLine = lines[j].trim();

            if (j > i && /^(gene|circuit)\s+\w+/i.test(geneLine)) {
                break;
            }

            if (!promoterName) {
                const promoterMatch = geneLine.match(/promoter\s*:\s*(\w+)/i);
                if (promoterMatch) {
                    promoterName = promoterMatch[1];
                    promoterLine = j;
                }
            }

            if (!toxicLabel) {
                toxicLabel = extractToxicLabel(geneLine);
            }

            if (j > i && geneLine === '}') {
                break;
            }
        }

        contexts.push({
            geneName,
            geneLine: i,
            promoterName,
            promoterLine,
            toxicLabel,
        });
    }

    return contexts;
}

function findNearestPromoter(lines: string[], geneLine: number): PromoterReference {
    let promoterRef = findPromoterAssignment(lines, geneLine, 12);

    if (promoterRef.promoterName) {
        return promoterRef;
    }

    promoterRef = findStandalonePromoter(lines, geneLine, -4);
    if (promoterRef.promoterName) {
        return promoterRef;
    }

    return findStandalonePromoter(lines, geneLine, 4);
}

function findPromoterAssignment(lines: string[], geneLine: number, maxDistance: number): PromoterReference {
    for (let offset = 0; offset <= maxDistance; offset++) {
        const index = geneLine + offset;
        if (index >= lines.length) {
            break;
        }

        const trimmed = lines[index].trim();
        const promoterMatch = trimmed.match(/promoter\s*:\s*(\w+)/i);
        if (promoterMatch) {
            return { promoterName: promoterMatch[1], promoterLine: index };
        }

        if (offset > 0 && /^(gene|circuit)\s+\w+/i.test(trimmed)) {
            break;
        }
    }

    return { promoterLine: -1 };
}

function findStandalonePromoter(lines: string[], geneLine: number, windowSize: number): PromoterReference {
    const step = windowSize < 0 ? -1 : 1;

    for (let offset = step; Math.abs(offset) <= Math.abs(windowSize); offset += step) {
        const index = geneLine + offset;
        if (index < 0 || index >= lines.length) {
            continue;
        }

        const trimmed = lines[index].trim();
        const promoterMatch = trimmed.match(/^promoter\s+(\w+)\b/i);
        if (promoterMatch) {
            return { promoterName: promoterMatch[1], promoterLine: index };
        }

        if (/^(circuit|gene)\s+\w+/i.test(trimmed) && offset !== step) {
            break;
        }
    }

    return { promoterLine: -1 };
}

function extractToxicLabel(value: string): string | undefined {
    const normalized = value.replace(/[_-]+/g, ' ').toLowerCase();

    for (const label of TOXIC_PROTEIN_LABELS) {
        if (normalized.match(new RegExp(`\\b${label}\\b`, 'i'))) {
            return TOXIC_PROTEIN_DISPLAY_NAMES[label] ?? label;
        }
    }

    return value.match(TOXIC_PROTEIN_PATTERN)?.[0];
}

function findHighlightRange(line: string, marker: string): { startChar: number; endChar: number } {
    const start = line.indexOf(marker);
    if (start >= 0) {
        return { startChar: start, endChar: start + marker.length };
    }

    return { startChar: 0, endChar: Math.max(1, marker.length) };
}