/**
 * BioScript circuit parser and local sequence catalog.
 *
 * Headless (no VS Code dependency) so unit tests, protocol generation,
 * and plasmid assembly can resolve parts and transcription units.
 *
 * Sequences for registry parts match the sequences shipped in parts-library.ts.
 * RBS B0030, B0033, and B0035 are the Weiss/iGEM family members that catalog
 * does not list. bp is always the sequence length.
 */

export interface SequenceEntry {
    seq: string;
    type: string;
    name: string;
    bp: number;
}

export interface ParsedConnection {
    type: 'activation' | 'repression';
    from: string;
    to: string;
}

export interface ParsedTU {
    name: string;
    promoter?: string;
    rbs?: string;
    gene?: string;
    protein?: string;
    terminator?: string;
    lineStart: number;
    lineEnd: number;
}

export interface ParsedCircuit {
    name: string;
    transcriptionUnits: ParsedTU[];
    connections: ParsedConnection[];
    hasKillSwitch: boolean;
    killSwitchToxin?: string;
    killSwitchAntitoxin?: string;
    lineStart: number;
    lineEnd: number;
}

function part(type: string, name: string, seq: string): SequenceEntry {
    const clean = seq.replace(/\s+/g, '').toUpperCase();
    return { type, name, seq: clean, bp: clean.length };
}

const GFP = part(
    'cds',
    'GFP',
    'ATGCGTAAAGGAGAAGAACTTTTCACTGGAGTTGTCCCAATTCTTGTTGAATTAGATGGTGATGTTAATGGGCACAAATTTTCTGTCAGTGGAGAGGGTGAAGGTGATGCAACATACGGAAAACTTACCCTTAAATTTATTTGCACTACTGGAAAACTACCTGTTCCATGGCCAACACTTGTCACTACTTTCGGTTATGGTGTTCAATGCTTTGCGAGATACCCAGATCATATGAAACAGCATGACTTTTTCAAGAGTGCCATGCCCGAAGGTTATGTACAGGAAAGAACTATATTTTTCAAAGATGACGGGAACTACAAGACACGTGCTGAAGTCAAGTTTGAAGGTGATACCCTTGTTAATAGAATCGAGTTAAAAGGTATTGATTTTAAAGAAGATGGAAACATTCTTGGACACAAATTGGAATACAACTATAACTCACACAATGTATACATCATGGCAGACAAACAAAAGAATGGAATCAAAGTTAACTTCAAAATTAGACACAACATTGAAGATGGAAGCGTTCAACTAGCAGACCATTATCAACAAAATACTCCAATTGGCGATGGCCCTGTCCTTTTACCAGACAACCATTACCTGTCCACACAATCTGCCCTTTCGAAAGATCCCAACGAAAAGAGAGACCACATGGTCCTTCTTGAGTTTGTAACAGCTGCTGGGATTACACATGGCATGGATGAACTATACAAATAATAA',
);

const LACI = part(
    'cds',
    'LacI',
    'ATGAAACCAGTAACGTTATACGATGTCGCAGAGTATGCCGGTGTCTCTTATCAGACCGTTTCCCGCGTGGTGAACCAGGCCAGCCACGTTTCTGCGAAAACGCGGGAAAAAGTGGAAGCGGCGATGGCGGAGCTGAATTACATTCCCAACCGCGTGGCACAACAACTGGCGGGCAAACAGTCGTTGCTG',
);

const TETR = part(
    'cds',
    'TetR',
    'ATGTCTAGATTAGATAAAAGTAAAGTGATTAACAGCGCATTAGAGCTGCTTAATGAGGTCGGAATCGAAGGTTTAACAACC',
);

const CI = part(
    'cds',
    'cI',
    'ATGAGCACAAAAAAGAAACCATTAACACAAGAGCAGCTTGAGGACGCACGTCGCCTTAAAGCAATTTATGAAAAAAA',
);

export const SEQUENCE_DB: Record<string, SequenceEntry> = {
    // RBS — B0031/B0032/B0034 from the parts catalog; B0030/B0033/B0035 from the Weiss RBS family.
    B0030: part('rbs', 'B0030', 'ATTAAAGAGGAGAAA'),
    B0031: part('rbs', 'B0031', 'TCACACAGGAAAG'),
    B0032: part('rbs', 'B0032', 'TCACACAGGAAAG'),
    B0033: part('rbs', 'B0033', 'TCACACAGGAC'),
    B0034: part('rbs', 'B0034', 'AAAGAGGAGAAA'),
    B0035: part('rbs', 'B0035', 'ATTAAAGAGGAGAAG'),

    // Terminators. B0015 is the B0010+B0012 double terminator and is longer than B0010.
    B0010: part('terminator', 'B0010', 'CCAGGCATCAAATAAAACGAAAGGCTCAGTCGAAAGACTGGGCCTTTCGTTTTATCTGTTGTTTGTCGGTGAACGCTCTC'),
    B0012: part('terminator', 'B0012', 'TCACACTGGCTCACCTTCGGGTGGGCCTTTCTGCGTTTATA'),
    B0015: part('terminator', 'B0015', 'CCAGGCATCAAATAAAACGAAAGGCTCAGTCGAAAGACTGGGCCTTTCGTTTTATCTGTTGTTTGTCGGTGAACGCTCTCTACTAGAGTCACACTGGCTCACCTTCGGGTGGGCCTTTCTGCGTTTATA'),

    // Promoters. pT7 includes the transcribed GGG so the cloned promoter is >= 19 bp.
    pLac: part('promoter', 'pLac', 'CAATACGCAAACCGCCTCTCCCCGCGCGTTGGCCGATTCATTAATGCAGCTGGCACGACAGGTTTCCCGACTGGAAAGCGGGCAGTGAGCGCAACGCAATTAATGTGAGTTAGCTCACTCATTAGGCACCCCAGGCTTTACACTTTATGCTTCCGGCTCGTATGTTGTGTGGAATTGTGAGCGGATAACAATTTCACACAGGAAACAGCTATGACCATG'),
    pTet: part('promoter', 'pTet', 'TCCCTATCAGTGATAGAGATTGACATCCCTATCAGTGATAGAGATACTGAGCAC'),
    pBAD: part('promoter', 'pBAD', 'ACATTGATTATTTGCACGGCGTCACACTTTGCTATGCCATAGCATTTTTATCCATAAGATTAGCGGATCCTACCTGACGCTTTTTATCGCAACTCTCTACTGTTTCTCCATACCCGTTTTTTTGGGCTAGC'),
    pT7: part('promoter', 'pT7', 'TAATACGACTCACTATAGGGAGA'),
    pLambda: part('promoter', 'pLambda', 'TAACACCGTGCGTGTTGACTATTTTACCTCTGGCGGTGATAATGGTTGC'),

    GFP,
    eGFP: { ...GFP, name: 'eGFP' },
    gfp: { ...GFP, name: 'gfp' },
    LacI: LACI,
    lacI: { ...LACI, name: 'lacI' },
    TetR: TETR,
    tetR: { ...TETR, name: 'tetR' },
    cI: CI,

    // RFC 10 BioBrick flanks used by the assembly planner.
    __BIOBRICK_PREFIX: part('prefix', 'BioBrick prefix', 'GAATTCGCGGCCGCTTCTAGAG'),
    __BIOBRICK_SUFFIX: part('suffix', 'BioBrick suffix', 'TACTAGTAGCGGCCGCTGCAG'),
};

function stripComment(line: string): string {
    let inString = false;
    let quote = '';
    for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (inString) {
            if (ch === '\\') {
                i += 1;
                continue;
            }
            if (ch === quote) inString = false;
            continue;
        }
        if (ch === '"' || ch === "'") {
            inString = true;
            quote = ch;
            continue;
        }
        if (ch === '/' && line[i + 1] === '/') return line.slice(0, i);
    }
    return line;
}

function readField(text: string, field: string): string | undefined {
    const match = text.match(new RegExp(`\\b${field}\\s*:\\s*([A-Za-z_][\\w]*)`));
    return match?.[1];
}

interface OpenBlock {
    kind: 'circuit' | 'promoter' | 'gene' | 'kill_switch' | 'other';
}

interface OpenGene {
    name: string;
    lineStart: number;
    text: string;
}

/**
 * Parse `circuit` blocks into transcription units, regulatory connections,
 * and kill-switch declarations. Malformed or unclosed input does not throw.
 *
 * `->` is activation and `~>` is repression. A transcription unit is a
 * `gene` block, carrying the promoter declared before it.
 */
export function parseCircuits(source: string): ParsedCircuit[] {
    if (!source || !source.trim() || !/\bcircuit\b/.test(source)) return [];

    const lines = source.replace(/\r\n/g, '\n').split('\n');
    const circuits: ParsedCircuit[] = [];
    let circuit: ParsedCircuit | null = null;
    const stack: OpenBlock[] = [];
    let pendingPromoter: string | undefined;
    let gene: OpenGene | null = null;

    const finishGene = (lineEnd: number) => {
        if (!circuit || !gene) return;
        circuit.transcriptionUnits.push({
            name: gene.name,
            promoter: pendingPromoter,
            rbs: readField(gene.text, 'rbs'),
            gene: gene.name,
            protein: gene.name,
            terminator: readField(gene.text, 'terminator'),
            lineStart: gene.lineStart,
            lineEnd,
        });
        gene = null;
    };

    const absorbCircuitStatement = (statement: string) => {
        if (!circuit) return;
        const text = statement.trim();
        if (!text) return;
        const repression = text.match(/^([A-Za-z_][\w]*)\s*~>\s*([A-Za-z_][\w]*)/);
        const activation = text.match(/^([A-Za-z_][\w]*)\s*->\s*([A-Za-z_][\w]*)/);
        if (repression) {
            circuit.connections.push({ type: 'repression', from: repression[1], to: repression[2] });
        } else if (activation) {
            circuit.connections.push({ type: 'activation', from: activation[1], to: activation[2] });
        }
    };

    const readKillSwitch = (text: string) => {
        if (!circuit) return;
        const toxin = readField(text, 'toxin');
        const antitoxin = readField(text, 'antitoxin');
        if (toxin) circuit.killSwitchToxin = toxin;
        if (antitoxin) circuit.killSwitchAntitoxin = antitoxin;
    };

    for (let index = 0; index < lines.length; index++) {
        const lineNo = index + 1;
        const raw = stripComment(lines[index]);
        const tokens = raw.split(/([{}])/);
        let buffer = '';

        for (const token of tokens) {
            if (token === '{') {
                const header = buffer.trim();
                buffer = '';
                if (!circuit) {
                    const nameMatch = header.match(/circuit\s+([A-Za-z_][\w]*)/);
                    if (!nameMatch) continue;
                    circuit = {
                        name: nameMatch[1],
                        transcriptionUnits: [],
                        connections: [],
                        hasKillSwitch: false,
                        lineStart: lineNo,
                        lineEnd: lineNo,
                    };
                    pendingPromoter = undefined;
                    stack.push({ kind: 'circuit' });
                    continue;
                }

                if (stack.length === 1 && stack[0].kind === 'circuit') {
                    const promoter = header.match(/^promoter\s+([A-Za-z_][\w]*)/);
                    const geneMatch = header.match(/^gene\s+([A-Za-z_][\w]*)/);
                    if (promoter) {
                        pendingPromoter = promoter[1];
                        stack.push({ kind: 'promoter' });
                    } else if (geneMatch) {
                        gene = { name: geneMatch[1], lineStart: lineNo, text: header };
                        stack.push({ kind: 'gene' });
                    } else if (/^kill_switch\b/.test(header)) {
                        circuit.hasKillSwitch = true;
                        readKillSwitch(header);
                        stack.push({ kind: 'kill_switch' });
                    } else {
                        stack.push({ kind: 'other' });
                    }
                } else {
                    if (gene && stack[stack.length - 1]?.kind === 'gene') gene.text += ` ${header}`;
                    stack.push({ kind: 'other' });
                }
                continue;
            }

            if (token === '}') {
                const top = stack.pop();
                const trailing = buffer;
                buffer = '';
                if (top?.kind === 'gene') {
                    if (gene) gene.text += `\n${trailing}`;
                    finishGene(lineNo);
                } else if (top?.kind === 'kill_switch') {
                    readKillSwitch(trailing);
                } else if (top?.kind === 'circuit' && circuit) {
                    absorbCircuitStatement(trailing);
                    circuit.lineEnd = lineNo;
                    circuits.push(circuit);
                    circuit = null;
                    gene = null;
                    pendingPromoter = undefined;
                }
                continue;
            }

            buffer += token;
        }

        const statement = buffer.trim();
        if (!statement || !circuit) continue;
        const top = stack[stack.length - 1];
        if (top?.kind === 'circuit' && stack.length === 1) {
            absorbCircuitStatement(statement);
        } else if (top?.kind === 'gene' && gene) {
            gene.text += `\n${statement}`;
        } else if (top?.kind === 'kill_switch') {
            readKillSwitch(statement);
        }
    }

    if (gene) finishGene(lines.length || 1);
    if (circuit) {
        circuit.lineEnd = lines.length || 1;
        circuits.push(circuit);
    }
    return circuits;
}
