/**
 * ══════════════════════════════════════════════════════════════════
 * SynBio-LLVM — Real-Time Sequence Intelligence Dashboard (Fase 17)
 *
 * Panel WebView que actualiza EN TIEMPO REAL mientras el usuario
 * escribe secuencias de DNA/RNA/Proteína:
 *
 *   1. ORF Finder — detecta marcos de lectura abiertos (6 frames)
 *   2. Restriction Map — sitios de restricción con fragmentos esperados
 *   3. GC% Sliding Window — gráfico de contenido GC en ventana móvil
 *   4. Codon Usage Heatmap — adaptación de codones al host seleccionado
 *   5. CpG Islands — detección de islas CpG
 *   6. Repeat Finder — repeticiones directas/invertidas
 *   7. Motif Scanner — promotores, RBS, terminadores, señales de poly-A
 *   8. Translation — traducción en los 6 frames con start/stop highlighting
 *   9. Sequence Stats — longitud, MW, Tm, GC%, AT%, dinucleotide freq
 *  10. Quality Warnings — alertas de secuencia problemáticas
 *
 * Todo se recalcula con debounce de 300ms mientras se escribe.
 *
 * Referencias:
 *   - REBASE: Roberts RJ et al. Nucleic Acids Res 2023
 *   - Codon usage: Nakamura Y et al. Nucleic Acids Res 2000
 *   - CpG Islands: Gardiner-Garden M, Frommer M. J Mol Biol 1987
 * ══════════════════════════════════════════════════════════════════
 */
import * as vscode from 'vscode';

// ── Codon Table (E. coli K12) ──────────────────────────────────────────

const CODON_TABLE: Record<string, string> = {
    'TTT':'F','TTC':'F','TTA':'L','TTG':'L','CTT':'L','CTC':'L','CTA':'L','CTG':'L',
    'ATT':'I','ATC':'I','ATA':'I','ATG':'M','GTT':'V','GTC':'V','GTA':'V','GTG':'V',
    'TCT':'S','TCC':'S','TCA':'S','TCG':'S','CCT':'P','CCC':'P','CCA':'P','CCG':'P',
    'ACT':'T','ACC':'T','ACA':'T','ACG':'T','GCT':'A','GCC':'A','GCA':'A','GCG':'A',
    'TAT':'Y','TAC':'Y','TAA':'*','TAG':'*','CAT':'H','CAC':'H','CAA':'Q','CAG':'Q',
    'AAT':'N','AAC':'N','AAA':'K','AAG':'K','GAT':'D','GAC':'D','GAA':'E','GAG':'E',
    'TGT':'C','TGC':'C','TGA':'*','TGG':'W','CGT':'R','CGC':'R','CGA':'R','CGG':'R',
    'AGT':'S','AGC':'S','AGA':'R','AGG':'R','GGT':'G','GGC':'G','GGA':'G','GGG':'G',
};

// Codon usage frequency per 1000 codons (E. coli K12 — Kazusa)
const ECOLI_CODON_FREQ: Record<string, number> = {
    'TTT':22.0,'TTC':16.5,'TTA':13.7,'TTG':13.4,'CTT':11.0,'CTC':11.1,'CTA':3.9,'CTG':52.7,
    'ATT':30.3,'ATC':25.1,'ATA':4.5,'ATG':27.8,'GTT':18.3,'GTC':15.2,'GTA':10.9,'GTG':26.3,
    'TCT':8.6,'TCC':8.8,'TCA':7.2,'TCG':8.8,'CCT':7.1,'CCC':5.5,'CCA':8.4,'CCG':23.2,
    'ACT':9.0,'ACC':23.4,'ACA':7.1,'ACG':14.4,'GCT':15.5,'GCC':25.5,'GCA':20.1,'GCG':33.5,
    'TAT':16.2,'TAC':12.2,'TAA':2.0,'TAG':0.3,'CAT':12.8,'CAC':9.7,'CAA':15.3,'CAG':28.8,
    'AAT':17.7,'AAC':21.7,'AAA':33.6,'AAG':10.3,'GAT':32.2,'GAC':19.1,'GAA':39.6,'GAG':17.8,
    'TGT':5.2,'TGC':6.5,'TGA':1.0,'TGG':15.2,'CGT':20.9,'CGC':21.9,'CGA':3.6,'CGG':5.6,
    'AGT':8.8,'AGC':16.0,'AGA':2.1,'AGG':1.2,'GGT':24.6,'GGC':29.5,'GGA':8.0,'GGG':11.3,
};

// ── Restriction Enzyme Database (top 50 most used) ─────────────────────

interface RestrictionEnzyme {
    name: string;
    sequence: string;     // recognition sequence (IUPAC)
    cutSense: number;     // cut position on sense strand (0-based from start of recognition)
    cutAntiSense: number; // cut position on antisense strand
    isoschizomers?: string[];
    supplier: string;
}

const RESTRICTION_ENZYMES: RestrictionEnzyme[] = [
    { name: 'EcoRI',   sequence: 'GAATTC', cutSense: 1, cutAntiSense: 5, supplier: 'NEB R3101' },
    { name: 'BamHI',   sequence: 'GGATCC', cutSense: 1, cutAntiSense: 5, supplier: 'NEB R3136' },
    { name: 'HindIII', sequence: 'AAGCTT', cutSense: 1, cutAntiSense: 5, supplier: 'NEB R3104' },
    { name: 'XbaI',    sequence: 'TCTAGA', cutSense: 1, cutAntiSense: 5, supplier: 'NEB R0145' },
    { name: 'SpeI',    sequence: 'ACTAGT', cutSense: 1, cutAntiSense: 5, supplier: 'NEB R3133' },
    { name: 'PstI',    sequence: 'CTGCAG', cutSense: 5, cutAntiSense: 1, supplier: 'NEB R3140' },
    { name: 'NotI',    sequence: 'GCGGCCGC', cutSense: 2, cutAntiSense: 6, supplier: 'NEB R3189' },
    { name: 'SalI',    sequence: 'GTCGAC', cutSense: 1, cutAntiSense: 5, supplier: 'NEB R3138' },
    { name: 'NcoI',    sequence: 'CCATGG', cutSense: 1, cutAntiSense: 5, supplier: 'NEB R3193' },
    { name: 'NdeI',    sequence: 'CATATG', cutSense: 2, cutAntiSense: 4, supplier: 'NEB R0111' },
    { name: 'BglII',   sequence: 'AGATCT', cutSense: 1, cutAntiSense: 5, supplier: 'NEB R0144' },
    { name: 'KpnI',    sequence: 'GGTACC', cutSense: 5, cutAntiSense: 1, supplier: 'NEB R3142' },
    { name: 'SacI',    sequence: 'GAGCTC', cutSense: 5, cutAntiSense: 1, supplier: 'NEB R3156' },
    { name: 'XhoI',    sequence: 'CTCGAG', cutSense: 1, cutAntiSense: 5, supplier: 'NEB R0146' },
    { name: 'ClaI',    sequence: 'ATCGAT', cutSense: 2, cutAntiSense: 4, supplier: 'NEB R0197' },
    { name: 'ApaI',    sequence: 'GGGCCC', cutSense: 5, cutAntiSense: 1, supplier: 'NEB R0114' },
    { name: 'NheI',    sequence: 'GCTAGC', cutSense: 1, cutAntiSense: 5, supplier: 'NEB R3131' },
    { name: 'MluI',    sequence: 'ACGCGT', cutSense: 1, cutAntiSense: 5, supplier: 'NEB R3198' },
    { name: 'SphI',    sequence: 'GCATGC', cutSense: 5, cutAntiSense: 1, supplier: 'NEB R3182' },
    { name: 'BsaI',    sequence: 'GGTCTC', cutSense: 7, cutAntiSense: 11, supplier: 'NEB R3733' },
    { name: 'BpiI',    sequence: 'GAAGAC', cutSense: 8, cutAntiSense: 12, supplier: 'Thermo ER1012' },
    { name: 'BsmBI',   sequence: 'CGTCTC', cutSense: 7, cutAntiSense: 11, supplier: 'NEB R0739' },
    { name: 'SapI',    sequence: 'GCTCTTC', cutSense: 8, cutAntiSense: 11, supplier: 'NEB R0569' },
    { name: 'AvrII',   sequence: 'CCTAGG', cutSense: 1, cutAntiSense: 5, supplier: 'NEB R0174' },
    { name: 'ScaI',    sequence: 'AGTACT', cutSense: 3, cutAntiSense: 3, supplier: 'NEB R3122' },
    { name: 'EcoRV',   sequence: 'GATATC', cutSense: 3, cutAntiSense: 3, supplier: 'NEB R3195' },
    { name: 'SmaI',    sequence: 'CCCGGG', cutSense: 3, cutAntiSense: 3, supplier: 'NEB R0141' },
    { name: 'HpaI',    sequence: 'GTTAAC', cutSense: 3, cutAntiSense: 3, supplier: 'NEB R0105' },
    { name: 'DpnI',    sequence: 'GATC',   cutSense: 2, cutAntiSense: 2, supplier: 'NEB R0176' },
    { name: 'MboI',    sequence: 'GATC',   cutSense: 0, cutAntiSense: 4, supplier: 'NEB R0147' },
    { name: 'AgeI',    sequence: 'ACCGGT', cutSense: 1, cutAntiSense: 5, supplier: 'NEB R3552' },
    { name: 'BclI',    sequence: 'TGATCA', cutSense: 1, cutAntiSense: 5, supplier: 'NEB R0160' },
    { name: 'BstBI',   sequence: 'TTCGAA', cutSense: 2, cutAntiSense: 4, supplier: 'NEB R0519' },
    { name: 'FseI',    sequence: 'GGCCGGCC', cutSense: 6, cutAntiSense: 2, supplier: 'NEB R0588' },
    { name: 'PacI',    sequence: 'TTAATTAA', cutSense: 5, cutAntiSense: 3, supplier: 'NEB R0547' },
    { name: 'AscI',    sequence: 'GGCGCGCC', cutSense: 2, cutAntiSense: 6, supplier: 'NEB R0558' },
    { name: 'PmeI',    sequence: 'GTTTAAAC', cutSense: 4, cutAntiSense: 4, supplier: 'NEB R0560' },
    { name: 'SwaI',    sequence: 'ATTTAAAT', cutSense: 4, cutAntiSense: 4, supplier: 'NEB R0604' },
    { name: 'StuI',    sequence: 'AGGCCT', cutSense: 3, cutAntiSense: 3, supplier: 'NEB R0187' },
    { name: 'AflII',   sequence: 'CTTAAG', cutSense: 1, cutAntiSense: 5, supplier: 'NEB R0520' },
];

// ── Motif Patterns ─────────────────────────────────────────────────────

interface SequenceMotif {
    name: string;
    pattern: RegExp;
    type: 'promoter' | 'rbs' | 'terminator' | 'signal' | 'regulatory';
    description: string;
}

const SEQUENCE_MOTIFS: SequenceMotif[] = [
    { name: 'Pribnow Box (-10)', pattern: /TA[ATGC]AAT/gi, type: 'promoter', description: 'σ70 -10 element consensus (E. coli)' },
    { name: '-35 Element', pattern: /TTGAC[ATGC]/gi, type: 'promoter', description: 'σ70 -35 element consensus (E. coli)' },
    { name: 'Shine-Dalgarno (RBS)', pattern: /A{0,1}GGA[GA][GA]/gi, type: 'rbs', description: 'Ribosome binding site – Shine-Dalgarno sequence' },
    { name: 'Rho-independent terminator', pattern: /[GC]{4,}[ATGC]{3,6}[GC]{4,}[T]{4,}/gi, type: 'terminator', description: 'GC-rich stem-loop followed by U-tract' },
    { name: 'TATA Box', pattern: /TATA[AT]A[AT]/gi, type: 'promoter', description: 'Eukaryotic TATA box (RNA Pol II)' },
    { name: 'Kozak Sequence', pattern: /[AG]CCATGG/gi, type: 'signal', description: 'Kozak consensus for eukaryotic translation initiation' },
    { name: 'Poly-A Signal', pattern: /AATAAA/gi, type: 'signal', description: 'Polyadenylation signal (eukaryotic)' },
    { name: 'lac Operator', pattern: /AATTGTGAGCG[GC]ATAACAAT[T]/gi, type: 'regulatory', description: 'lac operon operator sequence' },
    { name: 'tet Operator', pattern: /TCCC[ATGC]ATCAGTGATAGAGA/gi, type: 'regulatory', description: 'tet operon operator (TetR binding)' },
    { name: 'CRP/CAP Binding', pattern: /TGTGA[ATGC]{6}TCACA/gi, type: 'regulatory', description: 'CRP/CAP protein binding site' },
    { name: 'Chi Recombination', pattern: /GCTGGTGG/gi, type: 'signal', description: 'RecBCD Chi site — hotspot for recombination' },
];

// ── ORF Finder ─────────────────────────────────────────────────────────

interface ORF {
    frame: number;        // +1, +2, +3, -1, -2, -3
    start: number;        // position in original sequence
    end: number;
    length: number;       // in codons
    protein: string;      // translated sequence
    startCodon: string;
    hasStopCodon: boolean;
}

function reverseComplement(seq: string): string {
    const comp: Record<string, string> = { A:'T', T:'A', G:'C', C:'G', a:'t', t:'a', g:'c', c:'g' };
    return seq.split('').reverse().map(c => comp[c] || c).join('');
}

function translateDNA(dna: string): string {
    const protein: string[] = [];
    const upper = dna.toUpperCase();
    for (let i = 0; i + 2 < upper.length; i += 3) {
        const codon = upper.substring(i, i + 3);
        protein.push(CODON_TABLE[codon] || 'X');
    }
    return protein.join('');
}

function findORFs(sequence: string, minCodons: number = 30): ORF[] {
    const orfs: ORF[] = [];
    const clean = sequence.replace(/[^ATGCatgc]/g, '');
    const upper = clean.toUpperCase();
    const rc = reverseComplement(upper);

    const startCodons = ['ATG', 'GTG', 'TTG']; // bacterial start codons
    const stopCodons = ['TAA', 'TAG', 'TGA'];

    for (let strand = 0; strand < 2; strand++) {
        const seq = strand === 0 ? upper : rc;
        for (let frame = 0; frame < 3; frame++) {
            let inORF = false;
            let orfStart = 0;
            let orfSeq = '';

            for (let i = frame; i + 2 < seq.length; i += 3) {
                const codon = seq.substring(i, i + 3);

                if (!inORF && startCodons.includes(codon)) {
                    inORF = true;
                    orfStart = i;
                    orfSeq = codon;
                } else if (inORF) {
                    orfSeq += codon;
                    if (stopCodons.includes(codon)) {
                        const codons = orfSeq.length / 3;
                        if (codons >= minCodons) {
                            const frameLabel = strand === 0 ? (frame + 1) : -(frame + 1);
                            const actualStart = strand === 0 ? orfStart : (seq.length - orfStart - orfSeq.length);
                            orfs.push({
                                frame: frameLabel,
                                start: actualStart,
                                end: actualStart + orfSeq.length - 1,
                                length: codons,
                                protein: translateDNA(orfSeq),
                                startCodon: orfSeq.substring(0, 3),
                                hasStopCodon: true,
                            });
                        }
                        inORF = false;
                        orfSeq = '';
                    }
                }
            }
            // Handle ORF without stop codon (end of sequence)
            if (inORF && orfSeq.length / 3 >= minCodons) {
                const frameLabel = strand === 0 ? (frame + 1) : -(frame + 1);
                const actualStart = strand === 0 ? orfStart : (clean.length - orfStart - orfSeq.length);
                orfs.push({
                    frame: frameLabel,
                    start: actualStart,
                    end: actualStart + orfSeq.length - 1,
                    length: Math.floor(orfSeq.length / 3),
                    protein: translateDNA(orfSeq),
                    startCodon: orfSeq.substring(0, 3),
                    hasStopCodon: false,
                });
            }
        }
    }
    return orfs.sort((a, b) => b.length - a.length);
}

// ── Restriction Site Finder ────────────────────────────────────────────

interface RestrictionSite {
    enzyme: RestrictionEnzyme;
    position: number;
    strand: '+' | '-';
}

function findRestrictionSites(sequence: string): RestrictionSite[] {
    const sites: RestrictionSite[] = [];
    const upper = sequence.toUpperCase().replace(/[^ATGC]/g, '');

    for (const enzyme of RESTRICTION_ENZYMES) {
        const rec = enzyme.sequence.toUpperCase();
        // Find on sense strand
        let pos = upper.indexOf(rec);
        while (pos !== -1) {
            sites.push({ enzyme, position: pos, strand: '+' });
            pos = upper.indexOf(rec, pos + 1);
        }
        // Find on antisense
        const rc = reverseComplement(rec);
        if (rc !== rec) {
            pos = upper.indexOf(rc);
            while (pos !== -1) {
                sites.push({ enzyme, position: pos, strand: '-' });
                pos = upper.indexOf(rc, pos + 1);
            }
        }
    }
    return sites.sort((a, b) => a.position - b.position);
}

// ── GC% Sliding Window ────────────────────────────────────────────────

function computeGCWindow(sequence: string, windowSize: number = 50): number[] {
    const clean = sequence.toUpperCase().replace(/[^ATGC]/g, '');
    const result: number[] = [];
    if (clean.length < windowSize) {
        const gc = (clean.match(/[GC]/g) || []).length;
        return [gc / clean.length * 100];
    }
    for (let i = 0; i <= clean.length - windowSize; i++) {
        const window = clean.substring(i, i + windowSize);
        const gc = (window.match(/[GC]/g) || []).length;
        result.push(gc / windowSize * 100);
    }
    return result;
}

// ── CpG Island Detection ──────────────────────────────────────────────

interface CpGIsland {
    start: number;
    end: number;
    length: number;
    gcPercent: number;
    observedExpectedCpG: number;
}

function findCpGIslands(sequence: string, minLength: number = 200): CpGIsland[] {
    const upper = sequence.toUpperCase().replace(/[^ATGC]/g, '');
    const islands: CpGIsland[] = [];
    const windowSize = Math.min(minLength, upper.length);

    for (let start = 0; start <= upper.length - windowSize; start += 10) {
        let end = start + windowSize;
        while (end <= upper.length) {
            const region = upper.substring(start, end);
            const gc = (region.match(/[GC]/g) || []).length / region.length;
            const cCount = (region.match(/C/g) || []).length;
            const gCount = (region.match(/G/g) || []).length;
            const cpgCount = (region.match(/CG/g) || []).length;
            const expected = (cCount * gCount) / region.length;
            const obsExp = expected > 0 ? cpgCount / expected : 0;

            if (gc >= 0.5 && obsExp >= 0.6 && (end - start) >= minLength) {
                islands.push({
                    start, end, length: end - start,
                    gcPercent: gc * 100,
                    observedExpectedCpG: obsExp,
                });
                start = end;
                break;
            }
            end += 10;
        }
    }
    return islands;
}

// ── Repeat Finder ──────────────────────────────────────────────────────

interface SequenceRepeat {
    type: 'direct' | 'inverted' | 'tandem';
    sequence: string;
    positions: number[];
    length: number;
}

function findRepeats(sequence: string, minLen: number = 10): SequenceRepeat[] {
    const upper = sequence.toUpperCase().replace(/[^ATGC]/g, '');
    const repeats: SequenceRepeat[] = [];
    const seen = new Set<string>();

    for (let len = minLen; len <= Math.min(30, upper.length / 2); len++) {
        for (let i = 0; i <= upper.length - len; i++) {
            const sub = upper.substring(i, i + len);
            if (seen.has(sub)) { continue; }

            // Direct repeats
            const positions: number[] = [];
            let pos = upper.indexOf(sub);
            while (pos !== -1) {
                positions.push(pos);
                pos = upper.indexOf(sub, pos + 1);
            }
            if (positions.length >= 2) {
                seen.add(sub);
                repeats.push({ type: 'direct', sequence: sub, positions, length: len });
            }

            // Inverted repeats
            const rc = reverseComplement(sub);
            if (rc !== sub) {
                const invPos: number[] = [];
                pos = upper.indexOf(rc);
                while (pos !== -1) {
                    invPos.push(pos);
                    pos = upper.indexOf(rc, pos + 1);
                }
                if (invPos.length > 0 && positions.length > 0) {
                    repeats.push({ type: 'inverted', sequence: sub, positions: [...positions, ...invPos], length: len });
                }
            }
        }
    }
    return repeats.sort((a, b) => b.length - a.length).slice(0, 20);
}

// ── Codon Usage Analysis ───────────────────────────────────────────────

interface CodonUsage {
    codon: string;
    aminoAcid: string;
    count: number;
    frequency: number;    // per 1000
    hostFreq: number;     // host organism frequency
    adaptation: number;   // ratio (0-1, 1 = perfectly adapted)
    isRare: boolean;      // frequency < 10% of max for that AA
}

function analyzeCodonUsage(dna: string): { codons: CodonUsage[]; cai: number } {
    const clean = dna.toUpperCase().replace(/[^ATGC]/g, '');
    const counts: Record<string, number> = {};
    let totalCodons = 0;

    for (let i = 0; i + 2 < clean.length; i += 3) {
        const codon = clean.substring(i, i + 3);
        if (CODON_TABLE[codon]) {
            counts[codon] = (counts[codon] || 0) + 1;
            totalCodons++;
        }
    }

    const codons: CodonUsage[] = [];
    // Group by AA to find max frequency
    const aaMaxFreq: Record<string, number> = {};
    for (const [codon, aa] of Object.entries(CODON_TABLE)) {
        const freq = ECOLI_CODON_FREQ[codon] || 0;
        if (!aaMaxFreq[aa] || freq > aaMaxFreq[aa]) { aaMaxFreq[aa] = freq; }
    }

    let caiSum = 0;
    let caiCount = 0;

    for (const [codon, aa] of Object.entries(CODON_TABLE)) {
        const count = counts[codon] || 0;
        const frequency = totalCodons > 0 ? (count / totalCodons) * 1000 : 0;
        const hostFreq = ECOLI_CODON_FREQ[codon] || 0;
        const maxFreq = aaMaxFreq[aa] || 1;
        const adaptation = maxFreq > 0 ? hostFreq / maxFreq : 0;
        const isRare = adaptation < 0.1 && aa !== '*';

        if (count > 0) {
            caiSum += Math.log(Math.max(adaptation, 0.01));
            caiCount++;
        }

        codons.push({ codon, aminoAcid: aa, count, frequency, hostFreq, adaptation, isRare });
    }

    const cai = caiCount > 0 ? Math.exp(caiSum / caiCount) : 0;
    return { codons, cai };
}

// ── Sequence Statistics ────────────────────────────────────────────────

interface SequenceStats {
    length: number;
    gcPercent: number;
    atPercent: number;
    molecularWeight: number;   // Da (dsDNA)
    meltingTm: number;         // °C (basic formula)
    aCount: number; tCount: number; gCount: number; cCount: number;
    dinucleotideFreq: Record<string, number>;
    isDNA: boolean;
    isProtein: boolean;
}

function computeStats(sequence: string): SequenceStats {
    const clean = sequence.replace(/[\s\n\r\d>]/g, '').toUpperCase();
    const dnaChars = (clean.match(/[ATGC]/g) || []).length;
    const proteinChars = (clean.match(/[ACDEFGHIKLMNPQRSTVWY]/g) || []).length;
    const isDNA = dnaChars / clean.length > 0.9;
    const isProtein = !isDNA && proteinChars / clean.length > 0.8;

    if (isDNA) {
        const a = (clean.match(/A/g) || []).length;
        const t = (clean.match(/T/g) || []).length;
        const g = (clean.match(/G/g) || []).length;
        const c = (clean.match(/C/g) || []).length;
        const total = a + t + g + c;

        // Dinucleotide frequencies
        const dinuc: Record<string, number> = {};
        const bases = ['A', 'T', 'G', 'C'];
        for (const b1 of bases) {
            for (const b2 of bases) {
                const di = b1 + b2;
                const regex = new RegExp(di, 'g');
                dinuc[di] = (clean.match(regex) || []).length;
            }
        }

        // MW dsDNA: avg 660 Da per bp
        const mw = total * 660;

        // Basic Tm (Wallace rule for <20bp, adjusted for longer)
        let tm: number;
        if (total < 20) {
            tm = 2 * (a + t) + 4 * (g + c);
        } else {
            tm = 64.9 + 41 * (g + c - 16.4) / total;
        }

        return {
            length: total, gcPercent: total > 0 ? (g + c) / total * 100 : 0,
            atPercent: total > 0 ? (a + t) / total * 100 : 0,
            molecularWeight: mw, meltingTm: tm,
            aCount: a, tCount: t, gCount: g, cCount: c,
            dinucleotideFreq: dinuc, isDNA: true, isProtein: false,
        };
    }

    return {
        length: clean.length, gcPercent: 0, atPercent: 0,
        molecularWeight: clean.length * 110, meltingTm: 0,
        aCount: 0, tCount: 0, gCount: 0, cCount: 0,
        dinucleotideFreq: {}, isDNA: false, isProtein,
    };
}

// ── Quality Warnings ───────────────────────────────────────────────────

interface QualityWarning {
    severity: 'info' | 'warning' | 'error';
    message: string;
    position?: number;
}

function checkQuality(sequence: string, stats: SequenceStats): QualityWarning[] {
    const warnings: QualityWarning[] = [];
    const clean = sequence.toUpperCase().replace(/[^ATGC]/g, '');

    if (!stats.isDNA) { return warnings; }

    // GC content warnings
    if (stats.gcPercent > 65) {
        warnings.push({ severity: 'warning', message: `GC% muy alto (${stats.gcPercent.toFixed(1)}%) — problemas de cloning/PCR posibles` });
    }
    if (stats.gcPercent < 30) {
        warnings.push({ severity: 'warning', message: `GC% muy bajo (${stats.gcPercent.toFixed(1)}%) — inestabilidad de mRNA probable` });
    }

    // Homopolymer runs
    const polyA = clean.match(/A{6,}/g);
    const polyT = clean.match(/T{6,}/g);
    const polyG = clean.match(/G{6,}/g);
    const polyC = clean.match(/C{6,}/g);
    if (polyA) { warnings.push({ severity: 'warning', message: `Homopolímero poly-A (${polyA[0].length}nt) — puede causar slippage/frameshift` }); }
    if (polyT) { warnings.push({ severity: 'warning', message: `Homopolímero poly-T (${polyT[0].length}nt) — puede interferir con terminación` }); }
    if (polyG) { warnings.push({ severity: 'error', message: `Homopolímero poly-G (${polyG[0].length}nt) — ⚠️ G-quadruplex probable, evitar` }); }
    if (polyC) { warnings.push({ severity: 'warning', message: `Homopolímero poly-C (${polyC[0].length}nt) — secundaria estable posible` }); }

    // BioBrick forbidden sites
    const biobrickSites = ['GAATTC', 'TCTAGA', 'ACTAGT', 'CTGCAG', 'GCGGCCGC'];
    const biobrickNames = ['EcoRI', 'XbaI', 'SpeI', 'PstI', 'NotI'];
    for (let i = 0; i < biobrickSites.length; i++) {
        if (clean.includes(biobrickSites[i])) {
            warnings.push({
                severity: 'error',
                message: `Sitio BioBrick interno: ${biobrickNames[i]} (${biobrickSites[i]}) — incompatible con BioBrick Assembly`,
                position: clean.indexOf(biobrickSites[i]),
            });
        }
    }

    // BsaI sites (Golden Gate incompatibility)
    if (clean.includes('GGTCTC') || clean.includes('GAGACC')) {
        warnings.push({ severity: 'error', message: 'Sitio BsaI interno — incompatible con Golden Gate Assembly' });
    }

    // Early stop codons in frame +1
    let hasStop = false;
    for (let i = 0; i + 2 < clean.length; i += 3) {
        const codon = clean.substring(i, i + 3);
        if (['TAA', 'TAG', 'TGA'].includes(codon) && i > 0 && i < clean.length - 10) {
            if (!hasStop) {
                warnings.push({ severity: 'info', message: `Stop codon interno en frame +1 posición ${i + 1}` });
                hasStop = true;
            }
        }
    }

    // Rare codons (E. coli)
    const rareCodons = ['AGA', 'AGG', 'ATA', 'CTA', 'CGA', 'CGG'];
    let rareCount = 0;
    for (let i = 0; i + 2 < clean.length; i += 3) {
        if (rareCodons.includes(clean.substring(i, i + 3))) { rareCount++; }
    }
    const totalCodons = Math.floor(clean.length / 3);
    if (totalCodons > 0 && rareCount / totalCodons > 0.1) {
        warnings.push({
            severity: 'warning',
            message: `${rareCount} codones raros de E. coli (${(rareCount / totalCodons * 100).toFixed(1)}%) — considerar optimización de codones`,
        });
    }

    return warnings;
}

// ── Clase Principal ─────────────────────────────────────────────────────

export class SequenceIntelligence implements vscode.Disposable {
    private panel: vscode.WebviewPanel | undefined;
    private disposables: vscode.Disposable[] = [];
    private updateTimer: NodeJS.Timeout | undefined;
    private statusBarItem: vscode.StatusBarItem;

    constructor(private context: vscode.ExtensionContext) {
        this.statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 200);
        this.statusBarItem.command = 'synbio.sequenceIntelligence';
        this.statusBarItem.tooltip = 'SynBio: Sequence Intelligence — Análisis en tiempo real';
    }

    activate(): void {
        this.disposables.push(
            vscode.commands.registerCommand('synbio.sequenceIntelligence', () => this.openPanel()),
            vscode.commands.registerCommand('synbio.orfFinder', () => this.quickORFAnalysis()),
            vscode.commands.registerCommand('synbio.restrictionMap', () => this.quickRestrictionMap()),
            vscode.commands.registerCommand('synbio.codonUsageAnalysis', () => this.quickCodonAnalysis()),
        );

        // Real-time update on text change
        this.disposables.push(
            vscode.workspace.onDidChangeTextDocument(e => {
                if (this.panel && e.document === vscode.window.activeTextEditor?.document) {
                    this.scheduleUpdate();
                }
            }),
            vscode.window.onDidChangeActiveTextEditor(e => {
                if (this.panel && e) { this.scheduleUpdate(); }
            }),
        );

        // Update status bar with sequence info
        this.disposables.push(
            vscode.window.onDidChangeTextEditorSelection(e => {
                this.updateStatusBarSelection(e);
            }),
        );

        this.statusBarItem.show();
    }

    private updateStatusBarSelection(e: vscode.TextEditorSelectionChangeEvent): void {
        const sel = e.textEditor.selection;
        if (sel.isEmpty) {
            this.statusBarItem.text = '$(beaker) Seq Intel';
            return;
        }
        const text = e.textEditor.document.getText(sel);
        const clean = text.replace(/[^ATGCatgc]/g, '');
        if (clean.length < 3) { return; }

        const gc = (clean.toUpperCase().match(/[GC]/g) || []).length / clean.length * 100;
        this.statusBarItem.text = `$(beaker) ${clean.length}bp | GC:${gc.toFixed(1)}%`;
    }

    private scheduleUpdate(): void {
        if (this.updateTimer) { clearTimeout(this.updateTimer); }
        this.updateTimer = setTimeout(() => this.updatePanel(), 300);
    }

    private openPanel(): void {
        if (this.panel) { this.panel.reveal(); this.updatePanel(); return; }

        this.panel = vscode.window.createWebviewPanel(
            'sequenceIntelligence', '🧬 Sequence Intelligence Dashboard',
            vscode.ViewColumn.Beside,
            { enableScripts: true, retainContextWhenHidden: true },
        );
        this.panel.onDidDispose(() => { this.panel = undefined; });
        this.updatePanel();
    }

    private updatePanel(): void {
        if (!this.panel) { return; }
        const editor = vscode.window.activeTextEditor;
        if (!editor) { return; }

        // Get selected text or extract sequences from document
        let sequence = '';
        if (!editor.selection.isEmpty) {
            sequence = editor.document.getText(editor.selection);
        } else {
            sequence = this.extractSequence(editor.document.getText());
        }

        if (!sequence || sequence.length < 10) {
            this.panel.webview.html = this.buildEmptyHtml();
            return;
        }

        const stats = computeStats(sequence);
        const orfs = stats.isDNA ? findORFs(sequence) : [];
        const sites = stats.isDNA ? findRestrictionSites(sequence) : [];
        const gcWindow = stats.isDNA ? computeGCWindow(sequence) : [];
        const cpgIslands = stats.isDNA ? findCpGIslands(sequence, 100) : [];
        const repeats = stats.isDNA ? findRepeats(sequence) : [];
        const codonUsage = stats.isDNA ? analyzeCodonUsage(sequence) : null;
        const motifs = stats.isDNA ? this.findMotifs(sequence) : [];
        const warnings = stats.isDNA ? checkQuality(sequence, stats) : [];

        this.panel.webview.html = this.buildDashboardHtml(
            sequence, stats, orfs, sites, gcWindow, cpgIslands, repeats, codonUsage, motifs, warnings
        );
    }

    private extractSequence(text: string): string {
        // Extract DNA sequences from BioScript or FASTA
        const fastaMatch = text.match(/>[^\n]*\n([ATGCatgcNnRrYySsWwKkMmBbDdHhVv\s\n]+)/);
        if (fastaMatch) { return fastaMatch[1].replace(/\s/g, ''); }

        // Look for sequence blocks in BioScript
        const seqMatch = text.match(/sequence\s*[:=]\s*"([ATGCatgc\s]+)"/i);
        if (seqMatch) { return seqMatch[1].replace(/\s/g, ''); }

        // Try to extract any long DNA-like string
        const dnaBlocks = text.match(/[ATGCatgc]{20,}/g);
        if (dnaBlocks) { return dnaBlocks.sort((a, b) => b.length - a.length)[0]; }

        return '';
    }

    private findMotifs(sequence: string): { motif: SequenceMotif; position: number }[] {
        const found: { motif: SequenceMotif; position: number }[] = [];
        const upper = sequence.toUpperCase();

        for (const motif of SEQUENCE_MOTIFS) {
            let match;
            const regex = new RegExp(motif.pattern.source, 'gi');
            while ((match = regex.exec(upper)) !== null) {
                found.push({ motif, position: match.index });
            }
        }
        return found.sort((a, b) => a.position - b.position);
    }

    // ── Quick Commands ─────────────────────────────────────────────────

    private async quickORFAnalysis(): Promise<void> {
        const editor = vscode.window.activeTextEditor;
        if (!editor) { return; }
        const seq = editor.selection.isEmpty
            ? this.extractSequence(editor.document.getText())
            : editor.document.getText(editor.selection);

        const orfs = findORFs(seq);
        if (orfs.length === 0) {
            vscode.window.showInformationMessage('No se encontraron ORFs ≥30 codones.');
            return;
        }

        const items = orfs.slice(0, 20).map(o => ({
            label: `Frame ${o.frame > 0 ? '+' : ''}${o.frame} | ${o.length} codones (${o.length * 3} bp)`,
            description: `pos ${o.start + 1}-${o.end + 1} | ${o.startCodon} → ${o.hasStopCodon ? 'stop' : 'no stop'}`,
            detail: o.protein.substring(0, 60) + (o.protein.length > 60 ? '...' : ''),
        }));

        const pick = await vscode.window.showQuickPick(items, {
            placeHolder: `${orfs.length} ORFs encontrados — selecciona uno para copiar la proteína`,
        });
        if (pick) {
            const idx = items.indexOf(pick);
            await vscode.env.clipboard.writeText(orfs[idx].protein);
            vscode.window.showInformationMessage(`Proteína copiada (${orfs[idx].length} aa)`);
        }
    }

    private async quickRestrictionMap(): Promise<void> {
        const editor = vscode.window.activeTextEditor;
        if (!editor) { return; }
        const seq = editor.selection.isEmpty
            ? this.extractSequence(editor.document.getText())
            : editor.document.getText(editor.selection);

        const sites = findRestrictionSites(seq);

        // Group by enzyme
        const grouped = new Map<string, number[]>();
        for (const s of sites) {
            const arr = grouped.get(s.enzyme.name) || [];
            arr.push(s.position + 1);
            grouped.set(s.enzyme.name, arr);
        }

        // Show unique cutters first
        const items = [...grouped.entries()]
            .sort((a, b) => a[1].length - b[1].length)
            .map(([name, positions]) => ({
                label: `${positions.length === 1 ? '$(check)' : '$(error)'} ${name} — ${positions.length} corte(s)`,
                description: positions.slice(0, 5).join(', ') + (positions.length > 5 ? '...' : ''),
                detail: `${RESTRICTION_ENZYMES.find(e => e.name === name)?.sequence} | Unique cutter: ${positions.length === 1 ? 'SÍ ✓' : 'NO'}`,
            }));

        const notCutting = RESTRICTION_ENZYMES.filter(e => !grouped.has(e.name)).length;
        await vscode.window.showQuickPick(items, {
            placeHolder: `${grouped.size} enzimas cortan (${notCutting} no cortan) — enzimas únicas marcadas con ✓`,
        });
    }

    private async quickCodonAnalysis(): Promise<void> {
        const editor = vscode.window.activeTextEditor;
        if (!editor) { return; }
        const seq = editor.selection.isEmpty
            ? this.extractSequence(editor.document.getText())
            : editor.document.getText(editor.selection);

        const { codons, cai } = analyzeCodonUsage(seq);
        const rare = codons.filter(c => c.isRare && c.count > 0);

        const msg = `CAI = ${cai.toFixed(3)} | ${rare.length} codones raros usados`;
        const action = await vscode.window.showInformationMessage(
            msg, 'Ver Dashboard Completo',
        );
        if (action) { this.openPanel(); }
    }

    // ── HTML Builders ──────────────────────────────────────────────────

    private buildEmptyHtml(): string {
        return `<!DOCTYPE html><html><head><meta charset="UTF-8">
<style>body{background:#1a1a2e;color:#a6adc8;font-family:'Segoe UI',sans-serif;display:flex;align-items:center;justify-content:center;min-height:400px;text-align:center}
h2{color:#89b4fa}p{max-width:500px}</style></head>
<body><div><h2>🧬 Sequence Intelligence Dashboard</h2>
<p>Selecciona una secuencia de DNA en el editor o abre un archivo con secuencias (.fasta, .bio, .bioscript) para ver el análisis en tiempo real.</p>
<p style="font-size:12px;color:#6c7086">El panel se actualiza automáticamente cada 300ms mientras escribes.</p>
</div></body></html>`;
    }

    private buildDashboardHtml(
        sequence: string, stats: SequenceStats, orfs: ORF[],
        sites: RestrictionSite[], gcWindow: number[],
        cpgIslands: CpGIsland[], repeats: SequenceRepeat[],
        codonUsage: { codons: CodonUsage[]; cai: number } | null,
        motifs: { motif: SequenceMotif; position: number }[],
        warnings: QualityWarning[]
    ): string {
        // Group restriction sites by enzyme
        const siteMap = new Map<string, number[]>();
        for (const s of sites) {
            const arr = siteMap.get(s.enzyme.name) || [];
            arr.push(s.position);
            siteMap.set(s.enzyme.name, arr);
        }
        const uniqueCutters = [...siteMap.entries()].filter(([, p]) => p.length === 1);

        // GC chart as SVG
        const gcSvg = this.buildGCChart(gcWindow);

        // ORF table
        const orfRows = orfs.slice(0, 15).map(o => {
            const col = o.frame > 0 ? '#a6e3a1' : '#f38ba8';
            return `<tr>
                <td style="color:${col}">${o.frame > 0 ? '+' : ''}${o.frame}</td>
                <td>${o.start + 1}</td><td>${o.end + 1}</td>
                <td><strong>${o.length}</strong> (${o.length * 3}bp)</td>
                <td>${o.startCodon}</td><td>${o.hasStopCodon ? '✓' : '✗'}</td>
                <td style="font-family:monospace;font-size:10px">${o.protein.substring(0, 30)}${o.protein.length > 30 ? '…' : ''}</td>
            </tr>`;
        }).join('');

        // Restriction sites table
        const siteRows = [...siteMap.entries()]
            .sort((a, b) => a[1].length - b[1].length)
            .slice(0, 30)
            .map(([name, positions]) => {
                const enzyme = RESTRICTION_ENZYMES.find(e => e.name === name)!;
                const isUnique = positions.length === 1;
                return `<tr style="${isUnique ? 'background:#27ae6022' : ''}">
                    <td><strong>${name}</strong></td>
                    <td style="font-family:monospace">${enzyme.sequence}</td>
                    <td>${positions.length}</td>
                    <td>${positions.slice(0, 6).map(p => p + 1).join(', ')}${positions.length > 6 ? '…' : ''}</td>
                    <td>${isUnique ? '✅ Unique' : ''}</td>
                </tr>`;
            }).join('');

        // Codon heatmap
        let codonHeatmap = '';
        if (codonUsage) {
            const aminoAcids = [...new Set(Object.values(CODON_TABLE))].filter(a => a !== '*').sort();
            codonHeatmap = aminoAcids.map(aa => {
                const codonsForAA = codonUsage.codons.filter(c => c.aminoAcid === aa && c.count > 0);
                if (codonsForAA.length === 0) { return ''; }
                const cells = codonsForAA.map(c => {
                    const hue = c.adaptation > 0.5 ? 120 : c.adaptation > 0.2 ? 60 : 0;
                    const sat = 80;
                    const light = Math.max(15, 50 - c.adaptation * 35);
                    return `<span title="${c.codon}: ${c.count}x, adaptation=${c.adaptation.toFixed(2)}"
                        style="display:inline-block;width:42px;text-align:center;padding:3px;margin:1px;
                        background:hsl(${hue},${sat}%,${light}%);border-radius:3px;font-family:monospace;
                        font-size:10px;color:white">${c.codon}<br>${c.count}</span>`;
                }).join('');
                return `<div style="margin:2px 0"><span style="display:inline-block;width:20px;font-weight:bold;color:#89b4fa">${aa}</span>${cells}</div>`;
            }).filter(Boolean).join('');
        }

        // Warnings
        const warningHtml = warnings.map(w => {
            const icon = w.severity === 'error' ? '🔴' : w.severity === 'warning' ? '🟡' : 'ℹ️';
            return `<li>${icon} ${w.message}</li>`;
        }).join('');

        // Motifs
        const motifRows = motifs.slice(0, 20).map(m => {
            const colors: Record<string, string> = {
                promoter: '#89b4fa', rbs: '#a6e3a1', terminator: '#f38ba8',
                signal: '#f9e2af', regulatory: '#cba6f7',
            };
            return `<tr>
                <td style="color:${colors[m.motif.type] || '#cdd6f4'}">${m.motif.name}</td>
                <td>${m.motif.type}</td>
                <td>${m.position + 1}</td>
                <td style="font-size:11px;color:#a6adc8">${m.motif.description}</td>
            </tr>`;
        }).join('');

        // Repeats
        const repeatRows = repeats.slice(0, 10).map(r => `
            <tr>
                <td style="color:${r.type === 'inverted' ? '#f38ba8' : '#a6e3a1'}">${r.type}</td>
                <td style="font-family:monospace;font-size:10px">${r.sequence.substring(0, 20)}${r.sequence.length > 20 ? '…' : ''}</td>
                <td>${r.length}bp</td>
                <td>${r.positions.length}x</td>
            </tr>`).join('');

        return `<!DOCTYPE html>
<html lang="es"><head><meta charset="UTF-8">
<title>Sequence Intelligence</title>
<style>
body{background:#1a1a2e;color:#cdd6f4;font-family:'Segoe UI',sans-serif;margin:0;padding:16px;font-size:13px}
h1{color:#89b4fa;font-size:20px;margin:0 0 4px 0;border-bottom:1px solid #313244;padding-bottom:8px}
h2{color:#89dceb;font-size:14px;margin:16px 0 6px 0;padding:4px 8px;background:#181825;border-radius:4px}
table{width:100%;border-collapse:collapse;margin:4px 0}
th{background:#181825;color:#a6adc8;font-size:11px;text-transform:uppercase;padding:4px 6px;text-align:left}
td{padding:4px 6px;border-bottom:1px solid #11111b;font-size:12px}
.stat-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(110px,1fr));gap:8px;margin:8px 0}
.stat-box{background:#181825;padding:10px;border-radius:6px;text-align:center}
.stat-value{font-size:20px;font-weight:bold;color:#89b4fa}
.stat-label{font-size:10px;color:#6c7086;text-transform:uppercase;margin-top:2px}
.badge{padding:2px 6px;border-radius:8px;font-size:10px;font-weight:bold;color:white}
.section{margin:12px 0;background:#1e1e2e;border-radius:8px;padding:12px}
svg{width:100%;max-height:120px}
</style></head>
<body>
<h1>🧬 Sequence Intelligence Dashboard</h1>
<p style="color:#6c7086;font-size:11px;margin:0">${stats.length.toLocaleString()}${stats.isDNA ? 'bp DNA' : stats.isProtein ? 'aa Protein' : ' characters'} | Actualización en tiempo real (300ms)</p>

<!-- ═══ STATS ═══ -->
<div class="stat-grid">
    <div class="stat-box"><div class="stat-value">${stats.length.toLocaleString()}</div><div class="stat-label">${stats.isDNA ? 'Base Pairs' : 'Residues'}</div></div>
    ${stats.isDNA ? `
    <div class="stat-box"><div class="stat-value">${stats.gcPercent.toFixed(1)}%</div><div class="stat-label">GC Content</div></div>
    <div class="stat-box"><div class="stat-value">${stats.meltingTm.toFixed(1)}°</div><div class="stat-label">Tm (°C)</div></div>
    <div class="stat-box"><div class="stat-value">${(stats.molecularWeight / 1000).toFixed(1)}k</div><div class="stat-label">MW (Da)</div></div>
    <div class="stat-box"><div class="stat-value">${orfs.length}</div><div class="stat-label">ORFs (≥30aa)</div></div>
    <div class="stat-box"><div class="stat-value">${siteMap.size}</div><div class="stat-label">Restriction Sites</div></div>
    <div class="stat-box"><div class="stat-value">${uniqueCutters.length}</div><div class="stat-label">Unique Cutters</div></div>
    ${codonUsage ? `<div class="stat-box"><div class="stat-value">${codonUsage.cai.toFixed(3)}</div><div class="stat-label">CAI (E.coli)</div></div>` : ''}
    ` : ''}
</div>

${warnings.length > 0 ? `
<div class="section" style="border-left:3px solid #f38ba8">
<h2>⚠️ Quality Warnings (${warnings.length})</h2>
<ul style="padding-left:20px;margin:4px 0">${warningHtml}</ul>
</div>` : '<div class="section" style="border-left:3px solid #a6e3a1"><p style="margin:4px">✅ No quality warnings detected</p></div>'}

${stats.isDNA ? `
<!-- ═══ GC% SLIDING WINDOW ═══ -->
<div class="section">
<h2>📊 GC% Sliding Window (50bp)</h2>
${gcSvg}
</div>

<!-- ═══ ORFs ═══ -->
<div class="section">
<h2>🔬 Open Reading Frames (${orfs.length} found, ≥30 codons)</h2>
${orfs.length > 0 ? `<table>
<thead><tr><th>Frame</th><th>Start</th><th>End</th><th>Length</th><th>Start Codon</th><th>Stop</th><th>Protein</th></tr></thead>
<tbody>${orfRows}</tbody></table>` : '<p style="color:#6c7086">No ORFs ≥30 codones encontrados</p>'}
</div>

<!-- ═══ RESTRICTION MAP ═══ -->
<div class="section">
<h2>✂️ Restriction Map (${siteMap.size} enzymes, ${sites.length} sites)</h2>
${siteMap.size > 0 ? `<table>
<thead><tr><th>Enzyme</th><th>Recognition</th><th>Cuts</th><th>Positions</th><th>Status</th></tr></thead>
<tbody>${siteRows}</tbody></table>` : '<p style="color:#6c7086">No restriction sites found</p>'}
</div>

<!-- ═══ CODON USAGE HEATMAP ═══ -->
${codonUsage ? `<div class="section">
<h2>🎨 Codon Usage Heatmap (E. coli K12) — CAI = ${codonUsage.cai.toFixed(3)}</h2>
<p style="font-size:10px;color:#6c7086">🟢 Well-adapted | 🟡 Moderate | 🔴 Rare codon — hover for details</p>
${codonHeatmap}
</div>` : ''}

<!-- ═══ MOTIFS ═══ -->
${motifs.length > 0 ? `<div class="section">
<h2>🔍 Sequence Motifs (${motifs.length} found)</h2>
<table><thead><tr><th>Motif</th><th>Type</th><th>Position</th><th>Description</th></tr></thead>
<tbody>${motifRows}</tbody></table>
</div>` : ''}

<!-- ═══ REPEATS ═══ -->
${repeats.length > 0 ? `<div class="section">
<h2>🔄 Repeats Detected (${repeats.length} found)</h2>
<table><thead><tr><th>Type</th><th>Sequence</th><th>Length</th><th>Occurrences</th></tr></thead>
<tbody>${repeatRows}</tbody></table>
</div>` : ''}

<!-- ═══ CpG ISLANDS ═══ -->
${cpgIslands.length > 0 ? `<div class="section">
<h2>🏝️ CpG Islands (${cpgIslands.length} found)</h2>
<table><thead><tr><th>Start</th><th>End</th><th>Length</th><th>GC%</th><th>Obs/Exp CpG</th></tr></thead>
<tbody>${cpgIslands.map(i => `<tr><td>${i.start + 1}</td><td>${i.end}</td><td>${i.length}bp</td><td>${i.gcPercent.toFixed(1)}%</td><td>${i.observedExpectedCpG.toFixed(2)}</td></tr>`).join('')}</tbody></table>
</div>` : ''}

<!-- ═══ NUCLEOTIDE COMPOSITION ═══ -->
<div class="section">
<h2>📐 Nucleotide Composition</h2>
<div style="display:flex;gap:16px;flex-wrap:wrap">
    <div style="flex:1;min-width:100px">
        <div style="display:flex;height:20px;border-radius:4px;overflow:hidden">
            <div style="width:${stats.aCount / stats.length * 100}%;background:#a6e3a1" title="A: ${stats.aCount}"></div>
            <div style="width:${stats.tCount / stats.length * 100}%;background:#f9e2af" title="T: ${stats.tCount}"></div>
            <div style="width:${stats.gCount / stats.length * 100}%;background:#89b4fa" title="G: ${stats.gCount}"></div>
            <div style="width:${stats.cCount / stats.length * 100}%;background:#f38ba8" title="C: ${stats.cCount}"></div>
        </div>
        <div style="display:flex;justify-content:space-between;font-size:10px;margin-top:2px">
            <span style="color:#a6e3a1">A: ${stats.aCount} (${(stats.aCount/stats.length*100).toFixed(1)}%)</span>
            <span style="color:#f9e2af">T: ${stats.tCount} (${(stats.tCount/stats.length*100).toFixed(1)}%)</span>
            <span style="color:#89b4fa">G: ${stats.gCount} (${(stats.gCount/stats.length*100).toFixed(1)}%)</span>
            <span style="color:#f38ba8">C: ${stats.cCount} (${(stats.cCount/stats.length*100).toFixed(1)}%)</span>
        </div>
    </div>
</div>
</div>

` : '<!-- Not DNA — limited analysis available -->'}

<p style="font-size:10px;color:#45475a;text-align:center;margin-top:16px">SynBio-LLVM Sequence Intelligence v1.0 — 40 restriction enzymes × 11 motifs × 6 ORF frames</p>
</body></html>`;
    }

    private buildGCChart(gcWindow: number[]): string {
        if (gcWindow.length < 2) { return '<p style="color:#6c7086">Secuencia demasiado corta para ventana GC</p>'; }

        const width = 800;
        const height = 100;
        const step = width / gcWindow.length;
        const maxGC = Math.max(...gcWindow, 60);
        const minGC = Math.min(...gcWindow, 40);
        const range = maxGC - minGC || 1;

        const points = gcWindow.map((gc, i) => {
            const x = i * step;
            const y = height - ((gc - minGC) / range) * height;
            return `${x.toFixed(1)},${y.toFixed(1)}`;
        }).join(' ');

        // 50% line
        const y50 = height - ((50 - minGC) / range) * height;

        return `<svg viewBox="0 0 ${width} ${height + 20}" style="width:100%;background:#181825;border-radius:6px;padding:4px">
            <line x1="0" y1="${y50.toFixed(1)}" x2="${width}" y2="${y50.toFixed(1)}" stroke="#f38ba888" stroke-dasharray="4"/>
            <text x="2" y="${y50 - 2}" fill="#f38ba8" font-size="9">50%</text>
            <text x="2" y="10" fill="#6c7086" font-size="9">${maxGC.toFixed(0)}%</text>
            <text x="2" y="${height}" fill="#6c7086" font-size="9">${minGC.toFixed(0)}%</text>
            <polyline points="${points}" fill="none" stroke="#89b4fa" stroke-width="1.5"/>
        </svg>`;
    }

    dispose(): void {
        this.statusBarItem.dispose();
        this.panel?.dispose();
        if (this.updateTimer) { clearTimeout(this.updateTimer); }
        this.disposables.forEach(d => d.dispose());
    }
}
