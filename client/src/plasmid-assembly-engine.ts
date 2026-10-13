import { areEndsCompatible, checkBioBrickCompatibility, findRestrictionSites, RestrictionSite } from './real-restriction-enzymes';
import { parseCircuits, ParsedCircuit, ParsedTU, SEQUENCE_DB } from './bioscript-compiler';
import { COMMON_VECTORS, PlasmidFeature } from './plasmid-map';

export type PlannerAssemblyMethod = 'gibson' | 'golden-gate' | 'biobrick' | 'gateway' | 'in-fusion' | 'restriction-ligation';
export type SemanticPartRole = 'promoter' | 'rbs' | 'cds' | 'terminator' | 'origin' | 'marker' | 'regulator' | 'cassette' | 'scaffold';

interface SequenceRecord {
    seq: string;
    type: string;
    name: string;
    bp: number;
}

interface SourceBlock {
    kind: 'circuit' | 'module';
    name: string;
    body: string;
    lineStart: number;
}

interface DeclaredSymbol {
    type: string;
    value: string;
}

export interface SemanticAssemblyPart {
    alias: string;
    name: string;
    role: SemanticPartRole;
    sequence: string;
    bp: number;
    source: 'registry' | 'mapped-alias' | 'declared' | 'inline' | 'unresolved';
    note?: string;
}

export interface SemanticAssemblyFragment {
    id: string;
    name: string;
    blockName: string;
    lineStart: number;
    lineEnd: number;
    sequence: string;
    parts: SemanticAssemblyPart[];
    unresolvedParts: string[];
}

export interface SemanticAssemblyParseResult {
    fileLabel: string;
    fragments: SemanticAssemblyFragment[];
    warnings: string[];
    unresolvedSymbols: string[];
    insertSequence: string;
    explicitSequence: boolean;
}

export interface BackboneModel {
    name: string;
    vectorKey: keyof typeof COMMON_VECTORS;
    size: number;
    antibiotic: string;
    origin: string;
    copyNumber: string;
    insertStart: number;
    replacedLength: number;
    leftFlankSequence: string;
    rightFlankSequence: string;
    exactAssembly: boolean;
    notes: string[];
}

export interface AssemblyPrimer {
    name: string;
    fragmentName: string;
    type: 'forward' | 'reverse';
    sequence: string;
    tail: string;
    bindingSequence: string;
    tm: number;
    gcPercent: number;
    role: string;
}

export interface AssemblyMapFeature {
    name: string;
    type: PlasmidFeature['type'];
    start: number;
    end: number;
    strand: '+' | '-';
    color: string;
    description: string;
}

export interface JunctionValidation {
    name: string;
    status: 'ok' | 'warning' | 'blocked';
    basis: string;
    note: string;
}

export interface ColonyPcrAssay {
    name: string;
    purpose: string;
    forwardPrimer: string;
    reversePrimer: string;
    expectedBp: number;
}

export interface AssemblyPreview {
    backbone: BackboneModel;
    method: PlannerAssemblyMethod;
    exactAssembly: boolean;
    exactReason: string;
    fragments: SemanticAssemblyFragment[];
    insertSequence: string;
    insertLength: number;
    finalPlasmidSize: number;
    primers: AssemblyPrimer[];
    overhangs: string[];
    mapFeatures: AssemblyMapFeature[];
    junctions: JunctionValidation[];
    colonyPcr: ColonyPcrAssay[];
    verificationPlan: string[];
    biobrickViolations: RestrictionSite[];
    typeIisSites: RestrictionSite[];
    restrictionPair: string[];
    warnings: string[];
    unresolvedParts: string[];
    circularMapSvg: string;
    linearMapSvg: string;
}

const SEQUENCE_LIBRARY = SEQUENCE_DB as Record<string, SequenceRecord>;

const PART_ALIAS_MAP: Record<string, string> = {
    rbs_strong: 'B0034',
    rbs_medium: 'B0032',
    rbs_weak: 'B0031',
    term_B0015: 'B0015',
    term_T1: 'B0010',
    term_rrnB: 'B0010',
    dblTerm: 'B0015',
    RBS_B0034: 'B0034',
    eGFP: 'eGFP',
};

const STANDARD_GOLDEN_GATE_OVERHANGS = ['GGAG', 'AATG', 'AGGT', 'GCTT', 'CGCT', 'ACTA', 'TCCA', 'CTTA', 'GGCT', 'ACCG'];
const MCS_ENZYME_PANEL = ['EcoRI', 'BamHI', 'HindIII', 'KpnI', 'SacI', 'XbaI', 'PstI', 'NotI'];
const PUC19_MCS = 'GAATTCGAGCTCGGTACCCGGGGATCCTCTAGAGTCGACCTGCAGGCATGCAAGCTT';
const PUC19_LEFT_FLANK = PUC19_MCS.slice(0, 24);
const PUC19_RIGHT_FLANK = PUC19_MCS.slice(-24);

const BACKBONE_MODELS: BackboneModel[] = [
    {
        name: 'pSB1C3',
        vectorKey: 'pSB1C3',
        size: 2070,
        antibiotic: 'Chloramphenicol',
        origin: 'pMB1 high-copy',
        copyNumber: 'High',
        insertStart: 1021,
        replacedLength: 0,
        leftFlankSequence: SEQUENCE_LIBRARY.__BIOBRICK_PREFIX.seq,
        rightFlankSequence: SEQUENCE_LIBRARY.__BIOBRICK_SUFFIX.seq,
        exactAssembly: true,
        notes: ['Inserción exacta entre prefijo y sufijo BioBrick RFC10.'],
    },
    {
        name: 'pUC19',
        vectorKey: 'pUC19',
        size: 2686,
        antibiotic: 'Ampicillin',
        origin: 'pMB1 high-copy',
        copyNumber: 'High',
        insertStart: 396 + PUC19_LEFT_FLANK.length,
        replacedLength: PUC19_MCS.length - PUC19_LEFT_FLANK.length - PUC19_RIGHT_FLANK.length,
        leftFlankSequence: PUC19_LEFT_FLANK,
        rightFlankSequence: PUC19_RIGHT_FLANK,
        exactAssembly: true,
        notes: ['Inserción exacta sobre la MCS curada localmente para pUC19.'],
    },
    {
        name: 'pET-28a(+)',
        vectorKey: 'pET28a',
        size: 5369,
        antibiotic: 'Kanamycin',
        origin: 'pBR322 medium-copy',
        copyNumber: 'Medium',
        insertStart: 200,
        replacedLength: 80,
        leftFlankSequence: '',
        rightFlankSequence: '',
        exactAssembly: false,
        notes: ['Mapa exacto por features; para primers vectoriales hace falta cargar la secuencia backbone completa.'],
    },
    {
        name: 'pBAD33',
        vectorKey: 'pBAD33',
        size: 5352,
        antibiotic: 'Chloramphenicol',
        origin: 'p15A medium-copy',
        copyNumber: 'Medium',
        insertStart: 301,
        replacedLength: 50,
        leftFlankSequence: '',
        rightFlankSequence: '',
        exactAssembly: false,
        notes: ['Mapa exacto por features; primers vectoriales solo con secuencia backbone extendida.'],
    },
    {
        name: 'pACYCDuet-1',
        vectorKey: 'pACYCDuet_1',
        size: 4008,
        antibiotic: 'Chloramphenicol',
        origin: 'P15A medium-copy',
        copyNumber: 'Medium',
        insertStart: 225,
        replacedLength: 40,
        leftFlankSequence: '',
        rightFlankSequence: '',
        exactAssembly: false,
        notes: ['Modelo exacto de mapa por features; falta secuencia completa de MCS para cierre vectorial exacto.'],
    },
];

function cleanDNA(input: string): string {
    return input.replace(/[^ACGT]/gi, '').toUpperCase();
}

function computeTm(seq: string): number {
    const upper = cleanDNA(seq);
    if (upper.length < 14) {
        const at = (upper.match(/[AT]/g) || []).length;
        const gc = (upper.match(/[GC]/g) || []).length;
        return 2 * at + 4 * gc;
    }
    const at = (upper.match(/[AT]/g) || []).length;
    const gc = (upper.match(/[GC]/g) || []).length;
    return 64.9 + 41 * (gc - 16.4) / (at + gc);
}

function computeGC(seq: string): number {
    const upper = cleanDNA(seq);
    if (!upper) { return 0; }
    const gc = (upper.match(/[GC]/g) || []).length;
    return gc / upper.length * 100;
}

function reverseComplement(seq: string): string {
    const map: Record<string, string> = { A: 'T', T: 'A', C: 'G', G: 'C', N: 'N' };
    return cleanDNA(seq).split('').reverse().map(base => map[base] || 'N').join('');
}

function basename(filePath: string): string {
    const normalized = filePath.replace(/\\/g, '/');
    const parts = normalized.split('/');
    return parts[parts.length - 1] || filePath;
}

function stripInlineComments(line: string): string {
    return line.replace(/\/\/.*$/, '').replace(/#.*$/, '').trim();
}

function extractBlocks(source: string): SourceBlock[] {
    const lines = source.split(/\r?\n/);
    const blocks: SourceBlock[] = [];
    let current: { kind: 'circuit' | 'module'; name: string; bodyLines: string[]; depth: number; lineStart: number } | null = null;
    let depth = 0;

    for (let index = 0; index < lines.length; index += 1) {
        const raw = lines[index];
        const trimmed = stripInlineComments(raw);

        if (!current) {
            const match = trimmed.match(/^(?:safe\s+)?(circuit|module)\s+(\w+)\s*\{/i);
            if (match) {
                current = {
                    kind: match[1].toLowerCase() as 'circuit' | 'module',
                    name: match[2],
                    bodyLines: [],
                    depth,
                    lineStart: index + 1,
                };
            }
        } else {
            current.bodyLines.push(raw);
        }

        depth += (raw.match(/\{/g) || []).length;
        depth -= (raw.match(/\}/g) || []).length;

        if (current && depth <= current.depth) {
            blocks.push({
                kind: current.kind,
                name: current.name,
                body: current.bodyLines.join('\n'),
                lineStart: current.lineStart,
            });
            current = null;
        }
    }

    return blocks;
}

function parseDeclaredSymbols(body: string): Map<string, DeclaredSymbol> {
    const symbols = new Map<string, DeclaredSymbol>();
    let match: RegExpExecArray | null;
    const letRegex = /let\s+(\w+)\s*:\s*(Promoter|RBS|Protein|Gene|Terminator)\s*=\s*(\w+)/g;

    while ((match = letRegex.exec(body)) !== null) {
        symbols.set(match[1], { type: match[2], value: match[3] });
    }

    const seqRegex = /sequence\s+(\w+)\s*:\s*Gene\s*\{/g;
    while ((match = seqRegex.exec(body)) !== null) {
        symbols.set(match[1], { type: 'Gene', value: match[1] });
    }

    return symbols;
}

function parseInlineSequences(body: string): Map<string, SequenceRecord> {
    const sequences = new Map<string, SequenceRecord>();
    const blockRegex = /sequence\s+(\w+)\s*:\s*Gene\s*\{([\s\S]*?)\}/g;
    let match: RegExpExecArray | null;

    while ((match = blockRegex.exec(body)) !== null) {
        const symbol = match[1];
        const block = match[2];
        const dna = block.match(/(?:dna|sequence|cds)\s*:\s*"([ACGTacgt]+)"/);
        if (!dna) { continue; }
        const seq = cleanDNA(dna[1]);
        sequences.set(symbol, { seq, type: 'cds', name: symbol, bp: seq.length });
    }

    return sequences;
}

function normalizeRole(type: string | undefined): SemanticPartRole {
    switch ((type || '').toLowerCase()) {
        case 'promoter': return 'promoter';
        case 'rbs': return 'rbs';
        case 'terminator': return 'terminator';
        case 'origin': return 'origin';
        case 'marker':
        case 'resistance': return 'marker';
        case 'protein':
        case 'gene':
        case 'cds':
        case 'reporter': return 'cds';
        default: return 'cassette';
    }
}

function inferRoleFromName(name: string): SemanticPartRole {
    if (/^(B00\d+)/i.test(name) || /^rbs/i.test(name)) { return 'rbs'; }
    if (/^(B001\d|term)/i.test(name)) { return 'terminator'; }
    if (/^(J231|p[A-Z]|p[A-Za-z]+)/.test(name)) { return 'promoter'; }
    if (/(ori|origin)/i.test(name)) { return 'origin'; }
    return 'cds';
}

function resolveSequenceSymbol(
    token: string,
    declaredSymbols: Map<string, DeclaredSymbol>,
    inlineSequences: Map<string, SequenceRecord>,
): SemanticAssemblyPart {
    const declared = declaredSymbols.get(token);
    const symbol = declared?.value || token;
    const mapped = PART_ALIAS_MAP[symbol] || symbol;
    const inline = inlineSequences.get(symbol) || inlineSequences.get(token);
    const record = inline || SEQUENCE_LIBRARY[mapped];

    if (record) {
        return {
            alias: token,
            name: mapped,
            role: normalizeRole(declared?.type || record.type || inferRoleFromName(mapped)),
            sequence: cleanDNA(record.seq),
            bp: record.bp || cleanDNA(record.seq).length,
            source: inline ? 'inline' : mapped === symbol ? (declared ? 'declared' : 'registry') : 'mapped-alias',
            note: inline ? 'Secuencia inline resuelta desde el bloque sequence.' : undefined,
        };
    }

    return {
        alias: token,
        name: mapped,
        role: normalizeRole(declared?.type || inferRoleFromName(mapped)),
        sequence: '',
        bp: 0,
        source: 'unresolved',
        note: `No hay secuencia local para ${mapped}; la pieza requiere síntesis o una plantilla externa.`,
    };
}

function buildFragment(
    id: string,
    name: string,
    blockName: string,
    lineStart: number,
    lineEnd: number,
    parts: SemanticAssemblyPart[],
): SemanticAssemblyFragment {
    return {
        id,
        name,
        blockName,
        lineStart,
        lineEnd,
        sequence: parts.map(part => part.sequence).join(''),
        unresolvedParts: parts.filter(part => !part.sequence).map(part => part.name),
        parts,
    };
}

function parseArrowFragments(source: string): SemanticAssemblyFragment[] {
    const blocks = extractBlocks(source);
    const fragments: SemanticAssemblyFragment[] = [];

    for (const block of blocks) {
        const declaredSymbols = parseDeclaredSymbols(block.body);
        const inlineSequences = parseInlineSequences(block.body);
        const lines = block.body.split(/\r?\n/);
        let counter = 0;

        for (let offset = 0; offset < lines.length; offset += 1) {
            const stripped = stripInlineComments(lines[offset]);
            if (!stripped || !stripped.includes('->')) { continue; }
            if (/^(when|match|fn|if|else)\b/i.test(stripped) || /express\(|activate\(|bind\(|emit_|log_event|flip_toggle|compile\(/i.test(stripped)) {
                continue;
            }

            const tokens = stripped
                .split('->')
                .map(token => token.trim().replace(/[;,)]/g, ''))
                .filter(token => /^\w+$/.test(token));

            if (tokens.length < 3) { continue; }

            counter += 1;
            const parts = tokens.map(token => resolveSequenceSymbol(token, declaredSymbols, inlineSequences));
            fragments.push(buildFragment(
                `${block.name}_arrow_${counter}`,
                `${block.name}_TU${counter}`,
                block.name,
                block.lineStart + offset,
                block.lineStart + offset,
                parts,
            ));
        }
    }

    return fragments;
}

function parseSequentialFragments(source: string): SemanticAssemblyFragment[] {
    const circuits = parseCircuits(source);
    const fragments: SemanticAssemblyFragment[] = [];

    for (const circuit of circuits) {
        for (const tu of circuit.transcriptionUnits) {
            const parts: SemanticAssemblyPart[] = [];
            if (tu.promoter) { parts.push(resolveSequenceSymbol(tu.promoter, new Map(), new Map())); }
            if (tu.rbs) { parts.push(resolveSequenceSymbol(tu.rbs, new Map(), new Map())); }
            if (tu.protein || tu.gene) { parts.push(resolveSequenceSymbol(tu.protein || tu.gene || '', new Map(), new Map())); }
            if (tu.terminator) { parts.push(resolveSequenceSymbol(tu.terminator, new Map(), new Map())); }
            if (parts.length === 0) { continue; }
            fragments.push(buildFragment(
                `${circuit.name}_${tu.name}`,
                `${circuit.name}_${tu.name}`,
                circuit.name,
                tu.lineStart + 1,
                tu.lineEnd + 1,
                parts,
            ));
        }
    }

    return fragments;
}

function dedupeFragments(fragments: SemanticAssemblyFragment[]): SemanticAssemblyFragment[] {
    const seen = new Set<string>();
    const result: SemanticAssemblyFragment[] = [];

    for (const fragment of fragments) {
        const key = `${fragment.blockName}:${fragment.parts.map(part => `${part.alias}:${part.name}`).join('>')}`;
        if (seen.has(key)) { continue; }
        seen.add(key);
        result.push(fragment);
    }

    return result;
}

export function getBackboneModels(): BackboneModel[] {
    return BACKBONE_MODELS.map(model => ({ ...model }));
}

export function parseBioScriptAssembly(source: string, fileLabel: string): SemanticAssemblyParseResult {
    const arrowFragments = parseArrowFragments(source);
    const sequentialFragments = parseSequentialFragments(source);
    const fragments = dedupeFragments([...arrowFragments, ...sequentialFragments]);
    const unresolvedSymbols = Array.from(new Set(fragments.flatMap(fragment => fragment.unresolvedParts)));
    const warnings: string[] = [];

    if (fragments.length === 0) {
        const explicitSequence = cleanDNA(source).length >= 30;
        if (explicitSequence) {
            const sequence = cleanDNA(source);
            const fallbackPart: SemanticAssemblyPart = {
                alias: 'insert',
                name: 'selected_insert',
                role: 'cassette',
                sequence,
                bp: sequence.length,
                source: 'inline',
            };
            const fragment = buildFragment('raw_insert', basename(fileLabel), basename(fileLabel), 1, 1, [fallbackPart]);
            return {
                fileLabel,
                fragments: [fragment],
                warnings: [],
                unresolvedSymbols: [],
                insertSequence: sequence,
                explicitSequence: true,
            };
        }
        warnings.push('No se detectaron unidades transcripcionales ensamblables en el editor activo.');
    }

    if (unresolvedSymbols.length > 0) {
        warnings.push(`Hay ${unresolvedSymbols.length} símbolo(s) sin secuencia local: ${unresolvedSymbols.join(', ')}.`);
    }

    return {
        fileLabel,
        fragments,
        warnings,
        unresolvedSymbols,
        insertSequence: fragments.map(fragment => fragment.sequence).join(''),
        explicitSequence: fragments.every(fragment => fragment.sequence.length > 0) && fragments.length > 0,
    };
}

function chooseRestrictionPair(sequence: string): string[] {
    if (!sequence) { return []; }
    const available = MCS_ENZYME_PANEL.filter(enzyme => findRestrictionSites(sequence, [enzyme]).length === 0);
    for (let index = 0; index < available.length; index += 1) {
        for (let inner = index + 1; inner < available.length; inner += 1) {
            if (!areEndsCompatible(available[index], available[inner])) {
                return [available[index], available[inner]];
            }
        }
    }
    return available.slice(0, 2);
}

function bindingRegion(sequence: string, reverse = false, targetTm = 60): string {
    const clean = cleanDNA(sequence);
    if (!clean) { return ''; }
    let best = reverse ? clean.slice(-18) : clean.slice(0, 18);
    let bestDiff = Math.abs(computeTm(best) - targetTm);

    for (let length = 18; length <= Math.min(26, clean.length); length += 1) {
        const region = reverse ? clean.slice(clean.length - length) : clean.slice(0, length);
        const diff = Math.abs(computeTm(region) - targetTm);
        if (diff < bestDiff) {
            best = region;
            bestDiff = diff;
        }
    }

    return reverse ? reverseComplement(best) : best;
}

function mapRoleToFeatureType(role: SemanticPartRole): PlasmidFeature['type'] {
    switch (role) {
        case 'promoter': return 'promoter';
        case 'rbs': return 'rbs';
        case 'terminator': return 'terminator';
        case 'origin': return 'origin';
        case 'marker': return 'resistance';
        default: return 'gene';
    }
}

function featureColor(role: SemanticPartRole): string {
    switch (role) {
        case 'promoter': return '#4CAF50';
        case 'rbs': return '#009688';
        case 'terminator': return '#795548';
        case 'origin': return '#9C27B0';
        case 'marker': return '#F44336';
        default: return '#2196F3';
    }
}

function buildGibsonOrInFusionPrimers(
    fragments: SemanticAssemblyFragment[],
    method: PlannerAssemblyMethod,
    backbone: BackboneModel,
): { primers: AssemblyPrimer[]; overhangs: string[]; junctions: JunctionValidation[] } {
    const overlapLength = method === 'in-fusion' ? 15 : 25;
    const primers: AssemblyPrimer[] = [];
    const overhangs: string[] = [];
    const junctions: JunctionValidation[] = [];

    for (let index = 0; index < fragments.length; index += 1) {
        const fragment = fragments[index];
        if (!fragment.sequence) { continue; }

        const previousSequence = index === 0
            ? backbone.leftFlankSequence
            : fragments[index - 1].sequence;
        const nextSequence = index === fragments.length - 1
            ? backbone.rightFlankSequence
            : fragments[index + 1].sequence;

        const forwardTail = cleanDNA(previousSequence).slice(-overlapLength);
        const reverseTail = reverseComplement(cleanDNA(nextSequence).slice(0, overlapLength));
        const forwardBinding = bindingRegion(fragment.sequence, false);
        const reverseBinding = bindingRegion(fragment.sequence, true);
        const forwardPrimer = `${forwardTail}${forwardBinding}`;
        const reversePrimer = `${reverseTail}${reverseBinding}`;

        primers.push({
            name: `${fragment.name}_F`,
            fragmentName: fragment.name,
            type: 'forward',
            sequence: forwardPrimer,
            tail: forwardTail,
            bindingSequence: forwardBinding,
            tm: computeTm(forwardBinding),
            gcPercent: computeGC(forwardPrimer),
            role: method === 'gibson' ? 'Gibson overlap' : 'In-Fusion homology',
        });
        primers.push({
            name: `${fragment.name}_R`,
            fragmentName: fragment.name,
            type: 'reverse',
            sequence: reversePrimer,
            tail: reverseTail,
            bindingSequence: reverseBinding,
            tm: computeTm(reverseComplement(reverseBinding)),
            gcPercent: computeGC(reversePrimer),
            role: method === 'gibson' ? 'Gibson overlap' : 'In-Fusion homology',
        });

        if (forwardTail) { overhangs.push(forwardTail); }
        junctions.push({
            name: index === 0 ? `Vector → ${fragment.name}` : `${fragments[index - 1].name} → ${fragment.name}`,
            status: forwardTail.length >= overlapLength ? 'ok' : 'warning',
            basis: method === 'gibson' ? `${forwardTail.length} bp overlap` : `${forwardTail.length} bp homology`,
            note: forwardTail.length >= overlapLength
                ? 'Junction listo para ensamblaje isoterma.'
                : 'La región de homología es corta; conviene revisar el backbone seleccionado.',
        });
    }

    if (fragments.length > 0) {
        junctions.push({
            name: `${fragments[fragments.length - 1].name} → Vector`,
            status: backbone.rightFlankSequence.length >= overlapLength ? 'ok' : 'warning',
            basis: `${Math.min(backbone.rightFlankSequence.length, overlapLength)} bp de cierre vectorial`,
            note: backbone.rightFlankSequence.length >= overlapLength
                ? 'Cierre vectorial modelado con secuencia backbone curada.'
                : 'El cierre vectorial queda aproximado por falta de flanco exacto.',
        });
    }

    return { primers, overhangs, junctions };
}

function buildGoldenGatePrimers(fragments: SemanticAssemblyFragment[]): { primers: AssemblyPrimer[]; overhangs: string[]; junctions: JunctionValidation[] } {
    const primers: AssemblyPrimer[] = [];
    const overhangs = STANDARD_GOLDEN_GATE_OVERHANGS.slice(0, Math.max(2, fragments.length + 1));
    const junctions: JunctionValidation[] = [];

    for (let index = 0; index < fragments.length; index += 1) {
        const fragment = fragments[index];
        if (!fragment.sequence) { continue; }

        const leftOverhang = overhangs[index];
        const rightOverhang = overhangs[index + 1];
        const fwdBinding = bindingRegion(fragment.sequence, false);
        const revBinding = bindingRegion(fragment.sequence, true);
        const fwdTail = `AAGGTCTCN${leftOverhang}`;
        const revTail = `AAGAGACCN${reverseComplement(rightOverhang)}`;

        primers.push({
            name: `${fragment.name}_F_BsaI`,
            fragmentName: fragment.name,
            type: 'forward',
            sequence: `${fwdTail}${fwdBinding}`,
            tail: fwdTail,
            bindingSequence: fwdBinding,
            tm: computeTm(fwdBinding),
            gcPercent: computeGC(`${fwdTail}${fwdBinding}`),
            role: 'Golden Gate BsaI tail',
        });
        primers.push({
            name: `${fragment.name}_R_BsaI`,
            fragmentName: fragment.name,
            type: 'reverse',
            sequence: `${revTail}${revBinding}`,
            tail: revTail,
            bindingSequence: revBinding,
            tm: computeTm(reverseComplement(revBinding)),
            gcPercent: computeGC(`${revTail}${revBinding}`),
            role: 'Golden Gate BsaI tail',
        });

        junctions.push({
            name: index === 0 ? `Vector → ${fragment.name}` : `${fragments[index - 1].name} → ${fragment.name}`,
            status: leftOverhang === reverseComplement(leftOverhang) ? 'warning' : 'ok',
            basis: `Overhang ${leftOverhang}`,
            note: leftOverhang === reverseComplement(leftOverhang)
                ? 'Overhang palindrómico; conviene sustituirlo por uno más robusto.'
                : 'Overhang único asignado automáticamente.',
        });
    }

    if (fragments.length > 0) {
        junctions.push({
            name: `${fragments[fragments.length - 1].name} → Vector`,
            status: 'ok',
            basis: `Overhang ${overhangs[fragments.length]}`,
            note: 'Cierre vectorial con overhang final compatible.',
        });
    }

    return { primers, overhangs, junctions };
}

function buildDigestPrimers(
    insertSequence: string,
    method: PlannerAssemblyMethod,
    restrictionPair: string[],
): { primers: AssemblyPrimer[]; overhangs: string[]; junctions: JunctionValidation[] } {
    if (!insertSequence) {
        return { primers: [], overhangs: [], junctions: [] };
    }

    const forwardBinding = bindingRegion(insertSequence, false);
    const reverseBinding = bindingRegion(insertSequence, true);
    const leftTail = method === 'biobrick'
        ? 'GAATTCGCGGCCGCTTCTAGA'
        : `${restrictionPair[0] || 'GAATTC'}`;
    const rightTail = method === 'biobrick'
        ? 'TACTAGTAGCGGCCGCTGCAG'
        : `${restrictionPair[1] || 'CTGCAG'}`;

    const primers: AssemblyPrimer[] = [
        {
            name: 'Insert_F',
            fragmentName: 'Insert',
            type: 'forward',
            sequence: `${leftTail}${forwardBinding}`,
            tail: leftTail,
            bindingSequence: forwardBinding,
            tm: computeTm(forwardBinding),
            gcPercent: computeGC(`${leftTail}${forwardBinding}`),
            role: method === 'biobrick' ? 'BioBrick prefix' : 'Restriction tail',
        },
        {
            name: 'Insert_R',
            fragmentName: 'Insert',
            type: 'reverse',
            sequence: `${rightTail}${reverseBinding}`,
            tail: rightTail,
            bindingSequence: reverseBinding,
            tm: computeTm(reverseComplement(reverseBinding)),
            gcPercent: computeGC(`${rightTail}${reverseBinding}`),
            role: method === 'biobrick' ? 'BioBrick suffix' : 'Restriction tail',
        },
    ];

    const junctions: JunctionValidation[] = [
        {
            name: 'Vector → Insert',
            status: method === 'biobrick' ? 'ok' : restrictionPair.length === 2 ? 'ok' : 'warning',
            basis: method === 'biobrick' ? 'Prefix RFC10' : restrictionPair.join(' / ') || 'Par pendiente',
            note: method === 'biobrick'
                ? 'Entrada preparada para backbone BioBrick estándar.'
                : restrictionPair.length === 2
                    ? 'Par de digestión direccional resuelto automáticamente.'
                    : 'Hace falta confirmar las enzimas exactas del insert.',
        },
    ];

    return { primers, overhangs: restrictionPair, junctions };
}

function buildPrimersForAssembly(
    method: PlannerAssemblyMethod,
    backbone: BackboneModel,
    fragments: SemanticAssemblyFragment[],
    insertSequence: string,
    restrictionPair: string[],
): { primers: AssemblyPrimer[]; overhangs: string[]; junctions: JunctionValidation[] } {
    if (method === 'gibson' || method === 'in-fusion') {
        return buildGibsonOrInFusionPrimers(fragments, method, backbone);
    }
    if (method === 'golden-gate') {
        return buildGoldenGatePrimers(fragments);
    }
    return buildDigestPrimers(insertSequence, method, restrictionPair);
}

function buildMapFeatures(backbone: BackboneModel, fragments: SemanticAssemblyFragment[], insertLength: number): AssemblyMapFeature[] {
    const vector = COMMON_VECTORS[backbone.vectorKey];
    const shift = insertLength - backbone.replacedLength;
    const removedStart = backbone.insertStart;
    const removedEnd = backbone.insertStart + Math.max(backbone.replacedLength - 1, 0);
    const features: AssemblyMapFeature[] = [];

    for (const feature of vector.features) {
        if (backbone.replacedLength > 0 && feature.start <= removedEnd && feature.end >= removedStart) {
            if (feature.type === 'mcs') {
                continue;
            }
        }

        if (feature.start >= backbone.insertStart) {
            features.push({
                ...feature,
                start: feature.start + shift,
                end: feature.end + shift,
            });
            continue;
        }

        features.push({ ...feature });
    }

    if (insertLength > 0) {
        const insertStart = backbone.insertStart;
        const insertEnd = insertStart + insertLength - 1;
        features.push({
            name: 'Insert cassette',
            type: 'gene',
            start: insertStart,
            end: insertEnd,
            strand: '+',
            color: '#61d6c6',
            description: 'Constructo ensamblado in silico a partir del editor activo.',
        });

        let cursor = insertStart;
        for (const fragment of fragments) {
            if (!fragment.sequence) { continue; }
            const fragmentStart = cursor;
            const fragmentEnd = cursor + fragment.sequence.length - 1;
            features.push({
                name: fragment.name,
                type: 'gene',
                start: fragmentStart,
                end: fragmentEnd,
                strand: '+',
                color: '#8fb8ff',
                description: `Fragmento ensamblable ${fragment.blockName}.`,
            });

            let partOffset = 0;
            for (const part of fragment.parts) {
                if (!part.sequence) { continue; }
                features.push({
                    name: part.alias,
                    type: mapRoleToFeatureType(part.role),
                    start: fragmentStart + partOffset,
                    end: fragmentStart + partOffset + part.bp - 1,
                    strand: '+',
                    color: featureColor(part.role),
                    description: `${part.name} (${part.role})`,
                });
                partOffset += part.bp;
            }

            cursor = fragmentEnd + 1;
        }
    }

    return features.sort((left, right) => left.start - right.start);
}

function buildColonyPcr(backbone: BackboneModel, insertSequence: string): ColonyPcrAssay[] {
    if (!insertSequence || backbone.leftFlankSequence.length < 18 || backbone.rightFlankSequence.length < 18) {
        return [];
    }

    const leftVectorPrimer = backbone.leftFlankSequence.slice(-20);
    const rightVectorPrimer = reverseComplement(backbone.rightFlankSequence.slice(0, 20));
    const insertForward = insertSequence.slice(0, Math.min(22, insertSequence.length));
    const insertReverse = reverseComplement(insertSequence.slice(Math.max(0, insertSequence.length - 22)));

    return [
        {
            name: 'Colony PCR 5-prime junction',
            purpose: 'Confirmar la unión entre backbone y primer fragmento.',
            forwardPrimer: leftVectorPrimer,
            reversePrimer: insertReverse,
            expectedBp: Math.min(insertSequence.length, 320) + leftVectorPrimer.length,
        },
        {
            name: 'Colony PCR 3-prime junction',
            purpose: 'Confirmar la unión entre último fragmento y backbone.',
            forwardPrimer: insertForward,
            reversePrimer: rightVectorPrimer,
            expectedBp: Math.min(insertSequence.length, 320) + rightVectorPrimer.length,
        },
        {
            name: 'Insert size check',
            purpose: 'Verificar el tamaño total del cassette insertado.',
            forwardPrimer: leftVectorPrimer,
            reversePrimer: rightVectorPrimer,
            expectedBp: insertSequence.length + leftVectorPrimer.length + rightVectorPrimer.length,
        },
    ];
}

function buildVerificationPlan(
    method: PlannerAssemblyMethod,
    exactAssembly: boolean,
    colonyPcr: ColonyPcrAssay[],
    junctions: JunctionValidation[],
    restrictionPair: string[],
): string[] {
    const plan: string[] = [];
    plan.push(`1. Seleccionar 8-12 colonias después del ensamblaje ${method}.`);

    if (colonyPcr.length > 0) {
        plan.push(`2. Ejecutar ${colonyPcr.length} colony PCRs orientadas a junctions y tamaño del insert.`);
    } else {
        plan.push('2. Preparar colony PCR con primers backbone específicos tras cargar la secuencia exacta del vector.');
    }

    plan.push(`3. Confirmar ${junctions.filter(junction => junction.status !== 'blocked').length} junction(s) críticas por Sanger.`);

    if (restrictionPair.length === 2) {
        plan.push(`4. Verificar digestión diagnóstica con ${restrictionPair.join(' / ')} para confirmar orientación.`);
    } else {
        plan.push('4. Añadir una digestión diagnóstica con enzimas únicas del cassette final.');
    }

    plan.push(exactAssembly
        ? '5. El mapa del constructo final está curado con coordenadas exactas del backbone seleccionado.'
        : '5. El mapa del constructo se apoya en features backbone curadas; confirma la región MCS completa antes de pedir oligos vectoriales.');

    return plan;
}

function renderCircularMap(size: number, features: AssemblyMapFeature[], title: string): string {
    const width = 520;
    const height = 520;
    const cx = width / 2;
    const cy = height / 2;
    const radius = 182;
    let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="100%" height="100%">`;
    svg += `<rect width="${width}" height="${height}" rx="18" fill="#101926"/>`;
    svg += `<circle cx="${cx}" cy="${cy}" r="${radius}" fill="none" stroke="#45556f" stroke-width="4"/>`;
    svg += `<text x="${cx}" y="${cy - 6}" text-anchor="middle" fill="#edf2f7" font-size="18" font-weight="700">${title}</text>`;
    svg += `<text x="${cx}" y="${cy + 18}" text-anchor="middle" fill="#9bb0c8" font-size="14">${size} bp</text>`;

    const tick = size > 4000 ? 1000 : 500;
    for (let bp = 0; bp < size; bp += tick) {
        const angle = (bp / size) * Math.PI * 2 - Math.PI / 2;
        const x1 = cx + (radius - 4) * Math.cos(angle);
        const y1 = cy + (radius - 4) * Math.sin(angle);
        const x2 = cx + (radius + 8) * Math.cos(angle);
        const y2 = cy + (radius + 8) * Math.sin(angle);
        svg += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#60708c" stroke-width="1"/>`;
    }

    for (const feature of features) {
        const startAngle = (feature.start / size) * Math.PI * 2 - Math.PI / 2;
        const endAngle = (feature.end / size) * Math.PI * 2 - Math.PI / 2;
        const inner = feature.strand === '+' ? radius + 8 : radius - 18;
        const outer = feature.strand === '+' ? radius + 22 : radius - 4;
        const largeArc = endAngle - startAngle > Math.PI ? 1 : 0;
        const x1 = cx + inner * Math.cos(startAngle);
        const y1 = cy + inner * Math.sin(startAngle);
        const x2 = cx + outer * Math.cos(startAngle);
        const y2 = cy + outer * Math.sin(startAngle);
        const x3 = cx + outer * Math.cos(endAngle);
        const y3 = cy + outer * Math.sin(endAngle);
        const x4 = cx + inner * Math.cos(endAngle);
        const y4 = cy + inner * Math.sin(endAngle);

        svg += `<path d="M${x1},${y1} L${x2},${y2} A${outer},${outer} 0 ${largeArc} 1 ${x3},${y3} L${x4},${y4} A${inner},${inner} 0 ${largeArc} 0 ${x1},${y1}" fill="${feature.color}" opacity="0.88"><title>${feature.name} ${feature.start}-${feature.end}</title></path>`;

        if (feature.end - feature.start > Math.max(40, Math.round(size * 0.03))) {
            const mid = (startAngle + endAngle) / 2;
            const lx = cx + (outer + 16) * Math.cos(mid);
            const ly = cy + (outer + 16) * Math.sin(mid);
            svg += `<text x="${lx}" y="${ly}" fill="${feature.color}" font-size="9" text-anchor="middle">${feature.name}</text>`;
        }
    }

    svg += '</svg>';
    return svg;
}

function renderLinearMap(size: number, features: AssemblyMapFeature[], title: string): string {
    const width = 920;
    const height = 240;
    const margin = 42;
    const usable = width - margin * 2;
    const axisY = 130;
    let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="100%" height="100%">`;
    svg += `<rect width="${width}" height="${height}" rx="18" fill="#101926"/>`;
    svg += `<text x="${width / 2}" y="28" fill="#edf2f7" text-anchor="middle" font-size="18" font-weight="700">${title}</text>`;
    svg += `<line x1="${margin}" y1="${axisY}" x2="${width - margin}" y2="${axisY}" stroke="#60708c" stroke-width="4"/>`;

    const tick = size > 4000 ? 1000 : 500;
    for (let bp = 0; bp <= size; bp += tick) {
        const x = margin + (bp / size) * usable;
        svg += `<line x1="${x}" y1="${axisY - 6}" x2="${x}" y2="${axisY + 6}" stroke="#60708c" stroke-width="1"/>`;
        svg += `<text x="${x}" y="${axisY + 24}" fill="#9bb0c8" font-size="10" text-anchor="middle">${bp}</text>`;
    }

    for (const feature of features) {
        const x1 = margin + (feature.start / size) * usable;
        const x2 = margin + (feature.end / size) * usable;
        const y = feature.strand === '+' ? axisY - 34 : axisY + 10;
        const widthPx = Math.max(x2 - x1, 5);
        svg += `<rect x="${x1}" y="${y}" width="${widthPx}" height="18" rx="4" fill="${feature.color}" opacity="0.9"><title>${feature.name}</title></rect>`;
        if (widthPx > 36) {
            svg += `<text x="${x1 + widthPx / 2}" y="${feature.strand === '+' ? y - 4 : y + 30}" fill="#edf2f7" font-size="9" text-anchor="middle">${feature.name}</text>`;
        }
    }

    svg += '</svg>';
    return svg;
}

function buildExactReason(backbone: BackboneModel, unresolvedParts: string[]): string {
    if (!backbone.exactAssembly) {
        return backbone.notes[0] || 'El backbone seleccionado no tiene curada la secuencia completa de inserción.';
    }
    if (unresolvedParts.length > 0) {
        return `Hay partes sin secuencia exacta (${unresolvedParts.join(', ')}), así que el constructo final queda parcialmente resuelto.`;
    }
    return 'Backbone y cassette resueltos con coordenadas curadas para ensamblaje exacto de mapa y junctions.';
}

export function buildAssemblyPreview(
    parseResult: SemanticAssemblyParseResult,
    method: PlannerAssemblyMethod,
    backboneName: string,
): AssemblyPreview {
    const backbone = BACKBONE_MODELS.find(model => model.name === backboneName) || BACKBONE_MODELS[0];
    const insertSequence = parseResult.fragments.map(fragment => fragment.sequence).join('');
    const unresolvedParts = Array.from(new Set(parseResult.fragments.flatMap(fragment => fragment.unresolvedParts)));
    const typeIisSites = insertSequence ? findRestrictionSites(insertSequence, ['BsaI', 'BsmBI']) : [];
    const biobrickViolations = insertSequence ? checkBioBrickCompatibility(insertSequence).violations : [];
    const restrictionPair = insertSequence ? chooseRestrictionPair(insertSequence) : [];
    const { primers, overhangs, junctions } = buildPrimersForAssembly(method, backbone, parseResult.fragments, insertSequence, restrictionPair);
    const finalPlasmidSize = backbone.size - backbone.replacedLength + insertSequence.length;
    const mapFeatures = buildMapFeatures(backbone, parseResult.fragments, insertSequence.length);
    const colonyPcr = buildColonyPcr(backbone, insertSequence);
    const exactAssembly = backbone.exactAssembly && unresolvedParts.length === 0;
    const warnings = [...parseResult.warnings];

    if (method === 'golden-gate' && typeIisSites.length > 0) {
        warnings.push(`Golden Gate bloqueado por ${typeIisSites.length} sitio(s) internos BsaI/BsmBI.`);
    }
    if (method === 'biobrick' && biobrickViolations.length > 0) {
        warnings.push(`BioBrick RFC10 bloqueado por ${biobrickViolations.length} sitio(s) internos.`);
    }
    if (!backbone.exactAssembly) {
        warnings.push(backbone.notes[0]);
    }

    return {
        backbone,
        method,
        exactAssembly,
        exactReason: buildExactReason(backbone, unresolvedParts),
        fragments: parseResult.fragments,
        insertSequence,
        insertLength: insertSequence.length,
        finalPlasmidSize,
        primers,
        overhangs,
        mapFeatures,
        junctions,
        colonyPcr,
        verificationPlan: buildVerificationPlan(method, exactAssembly, colonyPcr, junctions, restrictionPair),
        biobrickViolations,
        typeIisSites,
        restrictionPair,
        warnings,
        unresolvedParts,
        circularMapSvg: renderCircularMap(finalPlasmidSize, mapFeatures, `${backbone.name} + insert`),
        linearMapSvg: renderLinearMap(finalPlasmidSize, mapFeatures, `${backbone.name} + insert`),
    };
}