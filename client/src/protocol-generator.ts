/**
 * SynBio-LLVM - Generador de Protocolos de Laboratorio
 * Compila circuitos BioScript modernos a SOPs wet-lab reproducibles.
 */

import * as vscode from 'vscode';

import { SEQUENCE_DB } from './bioscript-compiler';

type AssemblyMethod = 'gibson' | 'golden_gate' | 'biobrick' | 'restriction_ligation';
type ProtocolPartType = 'Promoter' | 'RBS' | 'CDS' | 'Terminator' | 'Other';

interface ProtocolPart {
    name: string;
    alias: string;
    type: ProtocolPartType;
    registryId: string;
    length: number;
    sequence: string;
    blockName: string;
    transcriptionUnit: string;
    source: 'registry' | 'mapped-alias' | 'declared' | 'unresolved';
    notes?: string;
}

interface ProtocolPrimer {
    code: string;
    name: string;
    fragmentName: string;
    type: 'forward' | 'reverse';
    sequence: string;
    tm: number;
    gcPercent: number;
    overlapLength: number;
    bindingLength: number;
    overlapTarget: string;
    unresolved?: boolean;
}

interface ProtocolConfig {
    assemblyMethod: AssemblyMethod;
    host: string;
    antibioticSelection: string;
    vector: string;
    competentCells: string;
    verificationMethod: string;
}

interface ProtocolStep {
    number: number;
    title: string;
    duration: string;
    temperature?: string;
    instructions: string[];
    tips: string[];
    safety: string[];
}

interface LabProtocol {
    title: string;
    date: string;
    method: AssemblyMethod;
    parts: ProtocolPart[];
    primers: ProtocolPrimer[];
    materials: string[];
    equipment: string[];
    steps: ProtocolStep[];
    totalTime: string;
    notes: string[];
}

interface ParsedBlock {
    kind: 'circuit' | 'module';
    name: string;
    parts: ProtocolPart[];
}

interface ParsedProtocolContext {
    title: string;
    blocks: ParsedBlock[];
    parts: ProtocolPart[];
    defaultConfig: ProtocolConfig;
}

interface DeclaredSymbol {
    type: string;
    value: string;
}

const PART_ALIAS_MAP: Record<string, string> = {
    rbs_strong: 'B0034',
    rbs_medium: 'B0032',
    rbs_weak: 'B0031',
    term_B0015: 'B0015',
    term_T1: 'B0010',
    term_rrnB: 'B0010',
    dblTerm: 'B0015',
    RBS_B0034: 'B0034',
    eGFP: 'GFP',
};

const ASSEMBLY_PROFILES: Record<AssemblyMethod, { name: string; overlapSize: number; totalTime: string }> = {
    gibson: { name: 'Gibson Assembly', overlapSize: 24, totalTime: '3-5 días' },
    golden_gate: { name: 'Golden Gate Assembly', overlapSize: 4, totalTime: '2-4 días' },
    biobrick: { name: 'BioBrick Standard Assembly', overlapSize: 0, totalTime: '4-7 días' },
    restriction_ligation: { name: 'Restriction-Ligation', overlapSize: 0, totalTime: '3-5 días' }
};

function stripInlineComments(line: string): string {
    return line.replace(/\/\/.*$/, '').replace(/#.*$/, '').trim();
}

function computeTm(seq: string): number {
    const upper = seq.toUpperCase();
    if (!upper) return 0;
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
    const upper = seq.toUpperCase();
    if (!upper) return 0;
    const gc = (upper.match(/[GC]/g) || []).length;
    return gc / upper.length * 100;
}

function reverseComplement(seq: string): string {
    const comp: Record<string, string> = { A: 'T', T: 'A', G: 'C', C: 'G', a: 't', t: 'a', g: 'c', c: 'g' };
    return seq.split('').reverse().map(char => comp[char] || char).join('');
}

function normalizeSequence(raw: string): string {
    return raw.replace(/[^ACGT]/gi, '').toUpperCase();
}

function normalizePartType(type: string | undefined, fallbackIndex: number, tokenCount: number): ProtocolPartType {
    switch ((type || '').toLowerCase()) {
        case 'promoter': return 'Promoter';
        case 'rbs': return 'RBS';
        case 'protein':
        case 'gene':
        case 'cds':
        case 'reporter':
        case 'regulatory':
            return 'CDS';
        case 'terminator': return 'Terminator';
        default:
            if (fallbackIndex === 0) return 'Promoter';
            if (fallbackIndex === tokenCount - 1) return 'Terminator';
            if (fallbackIndex === 1) return 'RBS';
            return 'CDS';
    }
}

function inferTypeFromRegistry(key: string | undefined): string | undefined {
    if (!key) return undefined;
    const entry = SEQUENCE_DB[key];
    if (entry) return entry.type;
    if (/^B00\d+/i.test(key)) return 'rbs';
    return undefined;
}

function resolvePartSymbol(symbol: string): { key: string; sequence: string; length: number; registryId: string; source: ProtocolPart['source'] } {
    const mapped = PART_ALIAS_MAP[symbol] || symbol;
    const entry = SEQUENCE_DB[mapped];
    if (entry) {
        return {
            key: mapped,
            sequence: normalizeSequence(entry.seq),
            length: entry.bp,
            registryId: mapped,
            source: mapped === symbol ? 'registry' : 'mapped-alias'
        };
    }

    return {
        key: mapped,
        sequence: '',
        length: 0,
        registryId: mapped,
        source: 'unresolved'
    };
}

function extractBlocks(source: string): Array<{ kind: 'circuit' | 'module'; name: string; body: string }> {
    const lines = source.split('\n');
    const blocks: Array<{ kind: 'circuit' | 'module'; name: string; body: string }> = [];
    let current: { kind: 'circuit' | 'module'; name: string; bodyLines: string[]; depth: number } | null = null;
    let depth = 0;

    for (const rawLine of lines) {
        const line = rawLine;
        const trimmed = stripInlineComments(rawLine);

        if (!current) {
            const match = trimmed.match(/^(?:safe\s+)?(circuit|module)\s+(\w+)\s*\{/i);
            if (match) {
                current = {
                    kind: match[1].toLowerCase() as 'circuit' | 'module',
                    name: match[2],
                    bodyLines: [],
                    depth
                };
            }
        } else {
            current.bodyLines.push(line);
        }

        const opens = (line.match(/\{/g) || []).length;
        const closes = (line.match(/\}/g) || []).length;
        depth += opens - closes;

        if (current && depth <= current.depth) {
            blocks.push({ kind: current.kind, name: current.name, body: current.bodyLines.join('\n') });
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

function buildPart(
    token: string,
    index: number,
    tokenCount: number,
    blockName: string,
    tuName: string,
    declaredSymbols: Map<string, DeclaredSymbol>
): ProtocolPart {
    const declared = declaredSymbols.get(token);
    const resolved = resolvePartSymbol(declared?.value || token);
    const inferredType = declared?.type || inferTypeFromRegistry(resolved.key);

    return {
        name: resolved.key,
        alias: token,
        type: normalizePartType(inferredType, index, tokenCount),
        registryId: resolved.registryId,
        length: resolved.length,
        sequence: resolved.sequence,
        blockName,
        transcriptionUnit: tuName,
        source: resolved.source === 'unresolved' && declared ? 'declared' : resolved.source,
        notes: resolved.source === 'unresolved'
            ? `No hay secuencia local para ${declared?.value || token}; se requerirá síntesis génica o recuperar la plantilla desde una colección externa.`
            : undefined
    };
}

function parseTranscriptionUnits(body: string, blockName: string): ProtocolPart[] {
    const declaredSymbols = parseDeclaredSymbols(body);
    const lines = body.split('\n');
    const parts: ProtocolPart[] = [];
    let tuCounter = 0;

    for (const rawLine of lines) {
        const line = stripInlineComments(rawLine);
        if (!line || !line.includes('->') || /^when\b/i.test(line) || /^match\b/i.test(line) || line.includes('express(')) {
            continue;
        }

        const tokens = line
            .split('->')
            .map(token => token.trim().replace(/[;,)]/g, ''))
            .filter(token => /^\w+$/.test(token));

        if (tokens.length < 2) {
            continue;
        }

        tuCounter += 1;
        const tuName = `TU${tuCounter}`;
        tokens.forEach((token, index) => {
            parts.push(buildPart(token, index, tokens.length, blockName, tuName, declaredSymbols));
        });
    }

    return parts;
}

function detectDefaultConfig(source: string): ProtocolConfig {
    const selection = source.match(/selection\s*:\s*"([^"]+)"/i)?.[1] || 'Ampicillin 100 µg/mL';
    const hostTag = source.match(/@host\s+([^\s]+)/i)?.[1];
    const chassisName = source.match(/chassis\s+(\w+)\s*:\s*Host/i)?.[1];
    const organism = source.match(/organism\s*:\s*"([^"]+)"/i)?.[1];
    const strain = source.match(/strain\s*:\s*"([^"]+)"/i)?.[1];
    const host = strain || organism || hostTag || chassisName || 'Escherichia coli';

    return {
        assemblyMethod: 'gibson',
        host,
        antibioticSelection: selection,
        vector: 'pSB1C3',
        competentCells: 'DH5α',
        verificationMethod: 'sanger'
    };
}

function getDemoParts(): ProtocolPart[] {
    return [
        {
            name: 'pLac', alias: 'promoter', type: 'Promoter', registryId: 'pLac', length: 200,
            sequence: normalizeSequence(SEQUENCE_DB.pLac.seq), blockName: 'DemoCircuit', transcriptionUnit: 'TU1', source: 'registry'
        },
        {
            name: 'B0034', alias: 'rbs_strong', type: 'RBS', registryId: 'B0034', length: 12,
            sequence: normalizeSequence(SEQUENCE_DB.B0034.seq), blockName: 'DemoCircuit', transcriptionUnit: 'TU1', source: 'mapped-alias'
        },
        {
            name: 'GFP', alias: 'reporter', type: 'CDS', registryId: 'GFP', length: 720,
            sequence: normalizeSequence(SEQUENCE_DB.GFP.seq), blockName: 'DemoCircuit', transcriptionUnit: 'TU1', source: 'registry'
        },
        {
            name: 'B0015', alias: 'term_B0015', type: 'Terminator', registryId: 'B0015', length: 112,
            sequence: normalizeSequence(SEQUENCE_DB.B0015.seq), blockName: 'DemoCircuit', transcriptionUnit: 'TU1', source: 'mapped-alias'
        }
    ];
}

function parseProtocolContextFromSource(source: string): ParsedProtocolContext {
    const blocks = extractBlocks(source)
        .map(block => ({
            kind: block.kind,
            name: block.name,
            parts: parseTranscriptionUnits(block.body, block.name)
        }))
        .filter(block => block.parts.length > 0);

    const parts = blocks.flatMap(block => block.parts);

    if (parts.length === 0) {
        const demoParts = getDemoParts();
        return {
            title: 'Demo SOP',
            blocks: [{ kind: 'circuit', name: 'DemoCircuit', parts: demoParts }],
            parts: demoParts,
            defaultConfig: detectDefaultConfig(source)
        };
    }

    return {
        title: blocks.map(block => block.name).join(' + '),
        blocks,
        parts,
        defaultConfig: detectDefaultConfig(source)
    };
}

function bindingRegion(sequence: string, fromEnd = false): string {
    if (!sequence) return '';
    let length = Math.min(18, sequence.length);
    while (length < Math.min(25, sequence.length)) {
        const candidate = fromEnd ? sequence.slice(sequence.length - length) : sequence.slice(0, length);
        if (computeTm(candidate) >= 58) break;
        length += 1;
    }

    return fromEnd ? sequence.slice(sequence.length - length) : sequence.slice(0, length);
}

function goldenGateOverhang(left?: ProtocolPart, right?: ProtocolPart): string {
    const leftSeed = left?.sequence ? left.sequence.slice(-2) : 'GG';
    const rightSeed = right?.sequence ? right.sequence.slice(0, 2) : 'AT';
    return `${leftSeed}${rightSeed}`.slice(0, 4).toUpperCase();
}

function buildPrimers(parts: ProtocolPart[], method: AssemblyMethod): ProtocolPrimer[] {
    const primers: ProtocolPrimer[] = [];
    let primerIndex = 1;

    for (let index = 0; index < parts.length; index += 1) {
        const part = parts[index];
        if (!part.sequence || part.sequence.length < 18) {
            primers.push({
                code: `P${primerIndex++}`,
                name: `${part.alias || part.name}_F`,
                fragmentName: part.alias || part.name,
                type: 'forward',
                sequence: '',
                tm: 0,
                gcPercent: 0,
                overlapLength: 0,
                bindingLength: 0,
                overlapTarget: 'unresolved',
                unresolved: true
            });
            primers.push({
                code: `P${primerIndex++}`,
                name: `${part.alias || part.name}_R`,
                fragmentName: part.alias || part.name,
                type: 'reverse',
                sequence: '',
                tm: 0,
                gcPercent: 0,
                overlapLength: 0,
                bindingLength: 0,
                overlapTarget: 'unresolved',
                unresolved: true
            });
            continue;
        }

        const previous = parts[index - 1];
        const next = parts[index + 1];
        let forwardOverlap = '';
        let reverseOverlap = '';

        if (method === 'gibson') {
            forwardOverlap = previous?.sequence ? previous.sequence.slice(-ASSEMBLY_PROFILES.gibson.overlapSize) : '';
            reverseOverlap = next?.sequence ? next.sequence.slice(0, ASSEMBLY_PROFILES.gibson.overlapSize) : '';
        } else if (method === 'golden_gate') {
            forwardOverlap = `GGTCTCA${goldenGateOverhang(previous, part)}`;
            reverseOverlap = `GGTCTCA${goldenGateOverhang(part, next)}`;
        } else if (method === 'biobrick') {
            forwardOverlap = 'GAATTCGCGGCCGCTTCTAGA';
            reverseOverlap = 'TACTAGTAGCGGCCGCTGCAG';
        } else {
            forwardOverlap = 'GAATTC';
            reverseOverlap = 'CTGCAG';
        }

        const fwdBinding = bindingRegion(part.sequence);
        const revBindingTemplate = bindingRegion(part.sequence, true);
        const revBinding = reverseComplement(revBindingTemplate);

        primers.push({
            code: `P${primerIndex++}`,
            name: `${part.alias || part.name}_F`,
            fragmentName: part.alias || part.name,
            type: 'forward',
            sequence: `${forwardOverlap}${fwdBinding}`,
            tm: computeTm(fwdBinding),
            gcPercent: computeGC(fwdBinding),
            overlapLength: forwardOverlap.length,
            bindingLength: fwdBinding.length,
            overlapTarget: previous?.alias || previous?.name || 'vector'
        });

        primers.push({
            code: `P${primerIndex++}`,
            name: `${part.alias || part.name}_R`,
            fragmentName: part.alias || part.name,
            type: 'reverse',
            sequence: `${reverseOverlap}${revBinding}`,
            tm: computeTm(revBindingTemplate),
            gcPercent: computeGC(revBindingTemplate),
            overlapLength: reverseOverlap.length,
            bindingLength: revBinding.length,
            overlapTarget: next?.alias || next?.name || 'vector'
        });
    }

    return primers;
}

function summarizeFragments(parts: ProtocolPart[]): string[] {
    return parts.map(part => {
        const label = `${part.alias} → ${part.name}`;
        if (part.length > 0) {
            return `${label} (${part.type}, ${part.length} bp, ${part.blockName}/${part.transcriptionUnit})`;
        }
        return `${label} (${part.type}, secuencia no resuelta; requiere síntesis o plantilla externa)`;
    });
}

export class ProtocolGenerator implements vscode.Disposable {
    private panel: vscode.WebviewPanel | undefined;
    private disposables: vscode.Disposable[] = [];
    private contextData: ParsedProtocolContext | undefined;

    constructor(private context: vscode.ExtensionContext) {}

    async show(): Promise<void> {
        if (this.panel) {
            this.panel.reveal();
            return;
        }

        const editor = vscode.window.activeTextEditor;
        const source = editor?.document.getText() || '';
        this.contextData = parseProtocolContextFromSource(source);

        this.panel = vscode.window.createWebviewPanel(
            'synbioProtocol',
            '🧪 Protocolo de Laboratorio',
            vscode.ViewColumn.Two,
            { enableScripts: true, retainContextWhenHidden: true }
        );

        this.panel.webview.html = this.getHTML(this.contextData);

        this.panel.webview.onDidReceiveMessage(async (msg) => {
            switch (msg.command) {
                case 'generate': {
                    const protocol = this.generateProtocol(this.contextData || parseProtocolContextFromSource(''), msg.config as ProtocolConfig);
                    this.panel?.webview.postMessage({ command: 'protocolReady', protocol });
                    break;
                }
                case 'exportMarkdown':
                    await this.exportMarkdown(msg.protocol as LabProtocol);
                    break;
                case 'exportPDF':
                    await this.exportMarkdown(msg.protocol as LabProtocol);
                    break;
            }
        }, undefined, this.disposables);

        this.panel.onDidDispose(() => { this.panel = undefined; }, null, this.disposables);
    }

    private generateProtocol(contextData: ParsedProtocolContext, config: ProtocolConfig): LabProtocol {
        const parts = contextData.parts;
        const primers = buildPrimers(parts, config.assemblyMethod);
        const totalLength = parts.reduce((sum, part) => sum + part.length, 0);
        const unresolved = parts.filter(part => !part.sequence);
        const profile = ASSEMBLY_PROFILES[config.assemblyMethod];
        const steps: ProtocolStep[] = [];
        let stepNumber = 1;

        steps.push({
            number: stepNumber++,
            title: 'Preparación del diseño y trazabilidad de fragmentos',
            duration: '20-30 min',
            instructions: [
                `Circuitos detectados: ${contextData.blocks.map(block => `${block.kind} ${block.name}`).join(', ')}`,
                `Vector planificado: ${config.vector}. Huésped previsto: ${config.host}. Selección: ${config.antibioticSelection}.`,
                'Confirmar que el orden biológico de ensamblaje coincide con las unidades transcripcionales del diseño:',
                ...summarizeFragments(parts).map(item => `  • ${item}`)
            ],
            tips: [
                'Congelar esta lista como anexo del cuaderno de laboratorio antes de pedir oligos o DNA.',
                'Si un fragmento aparece como no resuelto, convertirlo en orden de síntesis o localizar el plásmido plantilla antes de seguir.'
            ],
            safety: []
        });

        steps.push({
            number: stepNumber++,
            title: 'Diseño de primers y estrategia de amplificación',
            duration: '30-45 min',
            instructions: [
                `Método elegido: ${profile.name}.`,
                ...parts.flatMap((part) => {
                    const pair = primers.filter(primer => primer.fragmentName === (part.alias || part.name));
                    if (pair.some(primer => primer.unresolved)) {
                        return [
                            `  • ${part.alias} (${part.name}): no se diseñaron primers porque la secuencia no está disponible localmente. Plan recomendado: síntesis génica o recuperación desde un template validado.`
                        ];
                    }

                    const fwd = pair.find(primer => primer.type === 'forward');
                    const rev = pair.find(primer => primer.type === 'reverse');
                    return [
                        `  • Amplificar ${part.type.toLowerCase()} ${part.alias} (${part.name}) con ${fwd?.code}/${rev?.code}.`,
                        `    ${fwd?.code} ${fwd?.name}: ${fwd?.sequence} | Tm=${fwd?.tm.toFixed(1)}°C | annealing=${fwd?.bindingLength} nt | cola=${fwd?.overlapLength} nt hacia ${fwd?.overlapTarget}.`,
                        `    ${rev?.code} ${rev?.name}: ${rev?.sequence} | Tm=${rev?.tm.toFixed(1)}°C | annealing=${rev?.bindingLength} nt | cola=${rev?.overlapLength} nt hacia ${rev?.overlapTarget}.`
                    ];
                })
            ],
            tips: [
                'Mantener Tm de la región de annealing en 58-65°C y evitar hairpins o dímeros fuertes.',
                config.assemblyMethod === 'golden_gate'
                    ? 'Verificar ausencia de sitios internos de BsaI/BsmBI antes de pedir los oligos.'
                    : 'Usar colas de homología solo en 5\' y comprobar que cada unión tenga identidad única.'
            ],
            safety: []
        });

        steps.push({
            number: stepNumber++,
            title: 'PCR de amplificación de fragmentos',
            duration: '2-3 h',
            temperature: '98°C / 58-65°C / 72°C',
            instructions: [
                'Preparar una reacción de 50 µL por fragmento: 25 µL Q5 Hot Start 2X Master Mix, 2.5 µL primer forward 10 µM, 2.5 µL primer reverse 10 µM, 1 µL template, 19 µL agua libre de nucleasas.',
                `Ajustar extensión a ${Math.max(15, Math.ceil(totalLength / Math.max(parts.length, 1) / 1000 * 30))} s por kb del fragmento correspondiente.`,
                'Programa sugerido: 98°C 30 s; 30 ciclos de 98°C 10 s, annealing a la Tm más baja del par 20 s, 72°C según tamaño; extensión final 72°C 2-5 min.',
                'Cargar 5 µL de cada amplicón en gel de agarosa 1% para confirmar el tamaño esperado antes de purificar.'
            ],
            tips: [
                'Si el template es plasmídico, añadir digestión DpnI tras la PCR para reducir fondo.',
                'Separar físicamente pre-PCR y post-PCR para evitar contaminación cruzada.'
            ],
            safety: [
                'Usar SYBR Safe o GelRed en lugar de bromuro de etidio cuando sea posible.'
            ]
        });

        steps.push({
            number: stepNumber++,
            title: 'Purificación y cuantificación de fragmentos',
            duration: '30-45 min',
            instructions: [
                'Purificar los productos de PCR con columna o por extracción de gel si hay bandas inespecíficas.',
                'Eluir en 20-30 µL de agua o EB baja sal.',
                'Cuantificar cada fragmento por NanoDrop o fluorímetro y registrar concentraciones en ng/µL para el cálculo molar.'
            ],
            tips: [
                'Para ensamblajes multi-fragmento, priorizar fluorimetría si el DNA está por debajo de 20 ng/µL.'
            ],
            safety: [
                'Minimizar la exposición del DNA a UV; preferir transiluminador de luz azul.'
            ]
        });

        if (config.assemblyMethod === 'gibson') {
            steps.push({
                number: stepNumber++,
                title: 'Ensamblaje Gibson del constructo completo',
                duration: '15-60 min',
                temperature: '50°C',
                instructions: [
                    'Montar una reacción de 20 µL con 10 µL de Gibson Assembly Master Mix 2X y fragmentos en proporción equimolar.',
                    `Fragmentos a ensamblar en ${config.vector}: ${parts.map(part => part.alias || part.name).join(' + ')}.`,
                    'Usar 50 ng de vector linealizado y exceso molar 2:1 a 3:1 para cada inserto cuando haya 2-3 fragmentos; usar equimolaridad estricta para ensamblajes de 4 o más fragmentos.',
                    'Incubar 15 min si hay 2-3 fragmentos o 60 min para ensamblajes complejos; mantener en hielo al terminar.'
                ],
                tips: [
                    'No exceder 200 ng de DNA total por reacción.',
                    'Si el backbone supera 6 kb o los fragmentos tienen alta repetitividad, considerar NEBuilder HiFi.'
                ],
                safety: []
            });
        } else if (config.assemblyMethod === 'golden_gate') {
            steps.push({
                number: stepNumber++,
                title: 'Golden Gate con BsaI-HFv2',
                duration: '2-4 h',
                temperature: '37°C ↔ 16°C',
                instructions: [
                    'Preparar una reacción de 20 µL con 2 µL buffer ligasa 10X, 1 µL BsaI-HFv2, 1 µL T4 DNA ligase y 50-75 ng de cada fragmento.',
                    'Programar 30 ciclos de 37°C 1 min y 16°C 1 min; finalizar con 60°C 5 min e inactivación a 80°C 5 min.',
                    `Verificar que las uniones de 4 bp entre fragmentos ${parts.map(part => part.alias).join(', ')} sean únicas y no palindrómicas.`
                ],
                tips: [
                    'Si existe un sitio interno BsaI, domesticar la secuencia o pasar a BsmBI.',
                    'Mantener los overhangs de cada junction documentados en el registro del experimento.'
                ],
                safety: []
            });
        } else {
            steps.push({
                number: stepNumber++,
                title: config.assemblyMethod === 'biobrick' ? 'BioBrick RFC10' : 'Digestión y ligación clásica',
                duration: '3-16 h',
                temperature: '37°C / 16°C',
                instructions: [
                    config.assemblyMethod === 'biobrick'
                        ? 'Digestionar vector e inserto con EcoRI/XbaI/SpeI/PstI según orientación, purificar y ligar con T4 DNA ligase.'
                        : 'Elegir un par de enzimas de restricción compatibles, digerir backbone e inserto, desfosforilar el vector y ligar con T4 DNA ligase.',
                    `Registrar exactamente qué fragmentos se integran en ${config.vector} y conservar el mapa plasmídico final como referencia de verificación.`,
                    'Usar una relación molar inserto:vector de 3:1 como punto de partida.'
                ],
                tips: [
                    'Incluir control vector-only para estimar el background por auto-ligación.'
                ],
                safety: []
            });
        }

        steps.push({
            number: stepNumber++,
            title: 'Transformación bacteriana y selección',
            duration: '2 h + incubación overnight',
            temperature: '42°C heat-shock / 37°C recuperación',
            instructions: [
                `Transformar 2-5 µL del ensamblaje en ${config.competentCells}.`,
                'Incubar 30 min en hielo, heat-shock 42°C 45 s, volver a hielo 2 min, recuperar en 950 µL SOC durante 1 h a 37°C con agitación.',
                `Plaquear 100 µL y una placa concentrada sobre LB agar + ${config.antibioticSelection}.`,
                'Incubar 12-16 h a 37°C.'
            ],
            tips: [
                'Incluir un control positivo de transformación y un control negativo sin DNA.',
                'Trabajar con placas secas y precalentadas reduce spreading irregular.'
            ],
            safety: [
                'Desechar puntas, tubos y placas en contenedores biológicos para autoclave.'
            ]
        });

        steps.push({
            number: stepNumber++,
            title: 'Screening, colony PCR y verificación por secuenciación',
            duration: '1-2 días',
            instructions: [
                'Seleccionar 4-8 colonias aisladas y hacer réplica en una placa maestra.',
                'Realizar colony PCR con primers flanqueantes del inserto o primers que crucen junctions críticas.',
                `Enviar los minipreps positivos a secuenciación ${config.verificationMethod.toUpperCase()} y confirmar las junctions del ensamblaje completo de ${totalLength} bp.`,
                unresolved.length > 0
                    ? `Prestar especial atención a los fragmentos no resueltos en base local: ${unresolved.map(part => part.alias || part.name).join(', ')}.`
                    : 'Comparar la secuencia final con el diseño BioScript y archivar el resultado como lote validado.'
            ],
            tips: [
                'Para constructos >1.5 kb, añadir primers internos cada 600-700 bp.',
                'Si el constructo es crítico, considerar whole-plasmid sequencing.'
            ],
            safety: []
        });

        return {
            title: `SOP de ensamblaje para ${contextData.title}`,
            date: new Date().toISOString().split('T')[0],
            method: config.assemblyMethod,
            parts,
            primers,
            materials: [
                'Q5 Hot Start High-Fidelity 2X Master Mix o equivalente',
                config.assemblyMethod === 'gibson' ? 'Gibson Assembly Master Mix 2X (NEB E5510 o equivalente)' : 'Reactivos de ensamblaje compatibles con el método seleccionado',
                `Vector backbone ${config.vector}`,
                `Células competentes ${config.competentCells}`,
                `Placas LB + ${config.antibioticSelection}`,
                'SOC medium',
                'Kit de purificación de PCR / extracción de gel',
                'Kit de miniprep',
                'Agarosa, buffer TAE/TBE y ladder 1 kb',
                'Primers listados en el paso de diseño'
            ],
            equipment: [
                'Termociclador',
                'Microcentrífuga',
                'Transiluminador azul o UV',
                'Incubadora con agitación a 37°C',
                'Baño o bloque térmico a 42°C',
                'Nanodrop o fluorímetro',
                'Micropipetas calibradas'
            ],
            steps,
            totalTime: profile.totalTime,
            notes: [
                'Este SOP se ha generado a partir del diseño BioScript actualmente abierto en el editor.',
                `Partes detectadas: ${parts.length}. Fragmentos con secuencia local resuelta: ${parts.length - unresolved.length}/${parts.length}.`,
                'Registrar lotes de oligos, concentraciones finales y cualquier desviación experimental en el cuaderno de laboratorio.',
                'No ejecutar el protocolo sin revisión por personal entrenado y validación de bioseguridad del constructo.'
            ]
        };
    }

    private methodName(method: AssemblyMethod): string {
        return ASSEMBLY_PROFILES[method].name;
    }

    private async exportMarkdown(protocol: LabProtocol): Promise<void> {
        let md = `# ${protocol.title}\n\n`;
        md += `**Fecha:** ${protocol.date}  \n`;
        md += `**Método:** ${this.methodName(protocol.method)}  \n`;
        md += `**Tiempo estimado:** ${protocol.totalTime}\n\n`;

        md += `## Partes detectadas\n\n`;
        md += `| Alias | Parte resuelta | Tipo | Bloque | TU | Longitud | Estado |\n`;
        md += `|-------|----------------|------|--------|----|----------|--------|\n`;
        for (const part of protocol.parts) {
            md += `| ${part.alias} | ${part.name} | ${part.type} | ${part.blockName} | ${part.transcriptionUnit} | ${part.length || 'n/d'} | ${part.sequence ? 'resuelta' : 'no resuelta'} |\n`;
        }

        md += `\n## Primers\n\n`;
        md += `| Código | Nombre | Fragmento | Tipo | Tm | Longitud | Secuencia |\n`;
        md += `|--------|--------|-----------|------|----|----------|-----------|\n`;
        for (const primer of protocol.primers) {
            md += `| ${primer.code} | ${primer.name} | ${primer.fragmentName} | ${primer.type} | ${primer.unresolved ? 'n/d' : `${primer.tm.toFixed(1)}°C`} | ${primer.sequence.length || 'n/d'} | ${primer.sequence || 'No disponible'} |\n`;
        }

        md += `\n## Materiales\n\n`;
        for (const material of protocol.materials) md += `- ${material}\n`;

        md += `\n## Equipamiento\n\n`;
        for (const item of protocol.equipment) md += `- ${item}\n`;

        md += `\n## Procedimiento\n\n`;
        for (const step of protocol.steps) {
            md += `### Paso ${step.number}: ${step.title}\n\n`;
            md += `**Duración:** ${step.duration}`;
            if (step.temperature) md += `  |  **Temperatura:** ${step.temperature}`;
            md += `\n\n`;
            for (const instruction of step.instructions) md += `${instruction}\n`;
            if (step.tips.length > 0) {
                md += `\n> **Tips**\n`;
                for (const tip of step.tips) md += `> - ${tip}\n`;
            }
            if (step.safety.length > 0) {
                md += `\n> **Seguridad**\n`;
                for (const safety of step.safety) md += `> - ${safety}\n`;
            }
            md += `\n---\n\n`;
        }

        md += `## Notas\n\n`;
        for (const note of protocol.notes) md += `- ${note}\n`;

        const uri = await vscode.window.showSaveDialog({
            defaultUri: vscode.Uri.file('lab_protocol.md'),
            filters: { Markdown: ['md'] }
        });

        if (uri) {
            await vscode.workspace.fs.writeFile(uri, Buffer.from(md, 'utf-8'));
            const doc = await vscode.workspace.openTextDocument(uri);
            await vscode.window.showTextDocument(doc);
            vscode.window.showInformationMessage(`📋 Protocolo exportado: ${uri.fsPath}`);
        }
    }

    private getHTML(contextData: ParsedProtocolContext): string {
        const partsRows = contextData.parts.map(part =>
            `<tr><td>${part.alias}</td><td>${part.name}</td><td><span class="type-badge ${part.type.toLowerCase()}">${part.type}</span></td><td>${part.blockName}/${part.transcriptionUnit}</td><td>${part.length || 'n/d'}</td></tr>`
        ).join('');

        const selectionOptions = [
            'Ampicillin 100 µg/mL',
            'Kanamicina 50 µg/mL',
            'Cloranfenicol 25 µg/mL',
            'Spectinomicina 100 µg/mL'
        ].map(value => `<option value="${value}"${contextData.defaultConfig.antibioticSelection === value ? ' selected' : ''}>${value}</option>`).join('');

        return `<!DOCTYPE html>
<html lang="es"><head>
<meta charset="UTF-8">
<style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Segoe UI', sans-serif; background: #1e1e2e; color: #cdd6f4; padding: 20px; }
    h1 { font-size: 22px; color: #94e2d5; margin-bottom: 4px; }
    .subtitle { color: #6c7086; font-size: 13px; margin-bottom: 20px; }
    .config-section { background: #313244; border-radius: 12px; padding: 16px; margin-bottom: 16px; }
    .config-section h3 { color: #cba6f7; font-size: 14px; margin-bottom: 12px; }
    .summary { color: #bac2de; font-size: 12px; margin-bottom: 12px; line-height: 1.5; }
    .form-row { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 10px; }
    .form-group label { display: block; font-size: 11px; color: #a6adc8; margin-bottom: 4px; text-transform: uppercase; }
    .form-group select, .form-group input { width: 100%; background: #1e1e2e; color: #cdd6f4; border: 1px solid #45475a; border-radius: 6px; padding: 8px; font-size: 13px; }
    .form-group select:focus, .form-group input:focus { border-color: #94e2d5; outline: none; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 16px; }
    th { background: #45475a; color: #cdd6f4; padding: 8px 12px; font-size: 12px; text-align: left; }
    td { padding: 8px 12px; border-bottom: 1px solid #313244; font-size: 13px; }
    .type-badge { padding: 2px 8px; border-radius: 10px; font-size: 10px; font-weight: 600; }
    .type-badge.promoter { background: #fab38720; color: #fab387; }
    .type-badge.rbs { background: #a6e3a120; color: #a6e3a1; }
    .type-badge.cds { background: #89b4fa20; color: #89b4fa; }
    .type-badge.terminator { background: #f38ba820; color: #f38ba8; }
    .type-badge.other { background: #cba6f720; color: #cba6f7; }
    .gen-btn { width: 100%; padding: 12px; background: #94e2d5; color: #1e1e2e; border: none; border-radius: 8px; font-size: 14px; font-weight: 700; cursor: pointer; margin-top: 8px; }
    .gen-btn:hover { filter: brightness(1.1); }
    .protocol-output { display: none; margin-top: 20px; }
    .protocol-output.visible { display: block; }
    .step { background: #313244; border-radius: 10px; padding: 14px; margin-bottom: 10px; border-left: 3px solid #94e2d5; }
    .step-header { display: flex; align-items: center; gap: 10px; margin-bottom: 8px; }
    .step-num { background: #94e2d5; color: #1e1e2e; width: 28px; height: 28px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 13px; flex-shrink: 0; }
    .step-title { font-weight: 600; font-size: 14px; flex: 1; }
    .step-dur { font-size: 11px; color: #94e2d5; background: #94e2d520; padding: 2px 8px; border-radius: 10px; }
    .step-temp { font-size: 11px; color: #f9e2af; background: #f9e2af20; padding: 2px 8px; border-radius: 10px; }
    .step-body { font-size: 13px; color: #a6adc8; line-height: 1.6; white-space: pre-wrap; }
    .step-tip { background: #89b4fa15; border-left: 2px solid #89b4fa; padding: 6px 10px; margin-top: 8px; font-size: 12px; color: #89b4fa; border-radius: 0 6px 6px 0; }
    .step-safety { background: #f38ba815; border-left: 2px solid #f38ba8; padding: 6px 10px; margin-top: 6px; font-size: 12px; color: #f38ba8; border-radius: 0 6px 6px 0; }
    .export-bar { display: flex; gap: 8px; margin-top: 16px; }
    .exp-btn { padding: 8px 18px; border: 1px solid #45475a; background: #313244; color: #cdd6f4; border-radius: 8px; cursor: pointer; font-size: 12px; font-weight: 600; }
    .exp-btn:hover { background: #45475a; }
    .exp-btn.primary { background: #cba6f7; color: #1e1e2e; border-color: #cba6f7; }
</style>
</head><body>
    <h1>🧪 Generador de Protocolos de Laboratorio</h1>
    <p class="subtitle">Compila BioScript moderno a SOP reproducible con primers, Tm y pasos wet-lab</p>

    <div class="config-section">
        <h3>🧬 Diseño detectado</h3>
        <p class="summary">Bloques: ${contextData.blocks.map(block => `${block.kind} ${block.name}`).join(', ')}. Host detectado: ${contextData.defaultConfig.host}. Selección detectada: ${contextData.defaultConfig.antibioticSelection}.</p>
        <table><tr><th>Alias</th><th>Parte</th><th>Tipo</th><th>Ubicación</th><th>Longitud</th></tr>${partsRows}</table>
    </div>

    <div class="config-section">
        <h3>⚙️ Configuración del Protocolo</h3>
        <div class="form-row">
            <div class="form-group">
                <label>Método de Ensamblaje</label>
                <select id="method">
                    <option value="gibson" selected>Gibson Assembly</option>
                    <option value="golden_gate">Golden Gate</option>
                    <option value="biobrick">BioBrick</option>
                    <option value="restriction_ligation">Restriction-Ligation</option>
                </select>
            </div>
            <div class="form-group">
                <label>Células Competentes</label>
                <select id="cells">
                    <option value="DH5α"${contextData.defaultConfig.competentCells === 'DH5α' ? ' selected' : ''}>E. coli DH5α</option>
                    <option value="BL21(DE3)">E. coli BL21(DE3)</option>
                    <option value="TOP10">E. coli TOP10</option>
                    <option value="NEB 5-alpha">NEB 5-alpha</option>
                </select>
            </div>
        </div>
        <div class="form-row">
            <div class="form-group">
                <label>Selección Antibiótica</label>
                <select id="antibiotic">${selectionOptions}</select>
            </div>
            <div class="form-group">
                <label>Vector Backbone</label>
                <input type="text" id="vector" value="${contextData.defaultConfig.vector}" placeholder="ej: pSB1C3, pET-28a">
            </div>
        </div>
        <div class="form-row">
            <div class="form-group">
                <label>Host</label>
                <input type="text" id="host" value="${contextData.defaultConfig.host}">
            </div>
            <div class="form-group">
                <label>Verificación</label>
                <select id="verification">
                    <option value="sanger" selected>Sanger</option>
                    <option value="whole_plasmid">Whole plasmid sequencing</option>
                </select>
            </div>
        </div>
        <button class="gen-btn" onclick="generateProtocol()">🧪 Generar SOP reproducible</button>
    </div>

    <div class="protocol-output" id="protocolOutput"></div>

    <script>
        const vscode = acquireVsCodeApi();
        let currentProtocol = null;

        function generateProtocol() {
            const config = {
                assemblyMethod: document.getElementById('method').value,
                competentCells: document.getElementById('cells').value,
                antibioticSelection: document.getElementById('antibiotic').value,
                vector: document.getElementById('vector').value,
                host: document.getElementById('host').value,
                verificationMethod: document.getElementById('verification').value
            };
            vscode.postMessage({ command: 'generate', config });
        }

        window.addEventListener('message', event => {
            if (event.data.command === 'protocolReady') {
                currentProtocol = event.data.protocol;
                renderProtocol(currentProtocol);
            }
        });

        function renderProtocol(protocol) {
            const out = document.getElementById('protocolOutput');
            let html = '<h2 style="color:#94e2d5; margin-bottom:4px;">📋 ' + protocol.title + '</h2>';
            html += '<p style="color:#6c7086; font-size:12px; margin-bottom:16px;">Tiempo total estimado: ' + protocol.totalTime + ' | Generado: ' + protocol.date + '</p>';

            for (const step of protocol.steps) {
                html += '<div class="step"><div class="step-header">';
                html += '<div class="step-num">' + step.number + '</div>';
                html += '<span class="step-title">' + step.title + '</span>';
                html += '<span class="step-dur">⏱ ' + step.duration + '</span>';
                if (step.temperature) html += '<span class="step-temp">🌡 ' + step.temperature + '</span>';
                html += '</div>';
                html += '<div class="step-body">' + step.instructions.join('\n') + '</div>';
                if (step.tips.length > 0) html += '<div class="step-tip">💡 ' + step.tips.join(' | ') + '</div>';
                if (step.safety.length > 0) html += '<div class="step-safety">⚠️ ' + step.safety.join(' | ') + '</div>';
                html += '</div>';
            }

            html += '<div class="export-bar">';
            html += '<button class="exp-btn primary" onclick="exportMD()">📄 Exportar Markdown</button>';
            html += '</div>';

            out.innerHTML = html;
            out.classList.add('visible');
        }

        function exportMD() {
            if (currentProtocol) vscode.postMessage({ command: 'exportMarkdown', protocol: currentProtocol });
        }
    </script>
</body></html>`;
    }

    dispose(): void {
        this.panel?.dispose();
        this.disposables.forEach(disposable => disposable.dispose());
    }
}
