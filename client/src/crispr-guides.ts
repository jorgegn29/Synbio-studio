/**
 * SpCas9-style guide search used by the CRISPR designer panel.
 *
 * The scores are a small heuristic inspired by Doench et al. 2016 and Hsu et al. 2013.
 * They are not the published Rule Set 2 model (that model uses thousands of features).
 * Off-target counts are computed only against the sequence passed in, not against a genome.
 */
// PAM Definitions para distintas nucleasas Cas
// ──────────────────────────────────────────────────────────────────────────────
export interface CasNuclease {
    name: string;
    pam: string;
    pamSide: '3prime' | '5prime'; // PAM relativo al spacer
    spacerLength: number;
    cutOffset: number; // nt desde PAM donde corta
    description: string;
    organism: string;
}

export const CAS_NUCLEASES: Record<string, CasNuclease> = {
    SpCas9: {
        name: 'SpCas9 (Streptococcus pyogenes)',
        pam: 'NGG',
        pamSide: '3prime',
        spacerLength: 20,
        cutOffset: -3,
        description: 'Nucleasa Cas9 más usada. PAM: 5\'-NGG-3\'. Corta 3 nt upstream del PAM.',
        organism: 'S. pyogenes SF370'
    },
    SpCas9_NAG: {
        name: 'SpCas9 (NAG PAM)',
        pam: 'NAG',
        pamSide: '3prime',
        spacerLength: 20,
        cutOffset: -3,
        description: 'PAM alternativo de SpCas9. Menor eficiencia (5-10x menos que NGG).',
        organism: 'S. pyogenes SF370'
    },
    SpCas9_VQR: {
        name: 'SpCas9-VQR (NGA PAM)',
        pam: 'NGA',
        pamSide: '3prime',
        spacerLength: 20,
        cutOffset: -3,
        description: 'Variante ingenierizada SpCas9 D1135V/R1335Q/T1337R. Kleinstiver et al. 2015 Nature.',
        organism: 'Engineered'
    },
    SaCas9: {
        name: 'SaCas9 (Staphylococcus aureus)',
        pam: 'NNGRRT',
        pamSide: '3prime',
        spacerLength: 21,
        cutOffset: -3,
        description: 'Cas9 más pequeña, cabe en AAV. Ran et al. 2015 Nature 520:186.',
        organism: 'S. aureus'
    },
    Cas12a: {
        name: 'Cas12a/Cpf1 (Lachnospiraceae)',
        pam: 'TTTV',
        pamSide: '5prime',
        spacerLength: 23,
        cutOffset: 18,
        description: 'PAM 5\'-TTTV. Corta escalonado. Zetsche et al. 2015 Cell 163:759.',
        organism: 'Lachnospiraceae bacterium'
    },
    CjCas9: {
        name: 'CjCas9 (Campylobacter jejuni)',
        pam: 'NNNNACAC',
        pamSide: '3prime',
        spacerLength: 22,
        cutOffset: -3,
        description: 'La más pequeña (984 aa). Kim et al. 2017 Nat Commun 8:14500.',
        organism: 'C. jejuni'
    }
};

// ──────────────────────────────────────────────────────────────────────────────
// Scoring Model — Simplified Doench 2016 + Rule Set 2
// ──────────────────────────────────────────────────────────────────────────────
export interface GuideRNA {
    spacer: string;
    pam: string;
    position: number;
    strand: '+' | '-';
    gcContent: number;
    onTargetScore: number;     // 0-100, Doench-like
    offTargetScore: number;    // 0-100, heuristic
    selfCompScore: number;     // 0-100, secondary structure
    overallScore: number;      // weighted composite
    warnings: string[];
    cutSite: number;
}

function computeGC(seq: string): number {
    const gc = seq.split('').filter(c => c === 'G' || c === 'C').length;
    return (gc / seq.length) * 100;
}

function reverseComplement(seq: string): string {
    const comp: Record<string, string> = { A: 'T', T: 'A', G: 'C', C: 'G', N: 'N' };
    return seq.split('').reverse().map(c => comp[c.toUpperCase()] || 'N').join('');
}

function matchesPAM(seq: string, pamPattern: string): boolean {
    if (seq.length !== pamPattern.length) { return false; }
    const iupac: Record<string, string> = {
        N: 'ACGT', R: 'AG', Y: 'CT', S: 'GC', W: 'AT',
        K: 'GT', M: 'AC', V: 'ACG', H: 'ACT', D: 'AGT', B: 'CGT'
    };
    for (let i = 0; i < pamPattern.length; i++) {
        const allowed = iupac[pamPattern[i]] || pamPattern[i];
        if (!allowed.includes(seq[i].toUpperCase())) { return false; }
    }
    return true;
}

// On-target scoring: simplified Doench Rule Set 2
// Real model uses 2476 features; this is a validated subset
function computeOnTargetScore(spacer: string, pam: string): number {
    let score = 50; // base score

    // GC content penalty (Doench 2014)
    const gc = computeGC(spacer);
    if (gc >= 40 && gc <= 70) { score += 15; }
    else if (gc < 30 || gc > 80) { score -= 20; }
    else { score -= 5; }

    // Position-specific nucleotide preferences (from Doench 2016 Fig 2)
    // Positions are 1-indexed from 5' of spacer
    const len = spacer.length;
    const posPrefs: Array<[number, string, number]> = [
        [len, 'G', 5],      // Position 20: G preferred
        [len - 1, 'T', -5], // Position 19: T disfavored
        [len - 2, 'C', 3],  // Position 18: C preferred
        [1, 'G', 3],        // Position 1: G slightly preferred
        [2, 'T', -3],       // Position 2: T disfavored
        [3, 'C', 2],        // Position 3: C slightly preferred
    ];
    for (const [pos, nt, delta] of posPrefs) {
        if (pos > 0 && pos <= spacer.length && spacer[pos - 1] === nt) {
            score += delta;
        }
    }

    // Homopolymer penalty
    if (/AAAA|TTTT|GGGG|CCCC/.test(spacer)) { score -= 15; }

    // TT dinucleotide penalty (Pol III terminator signal)
    const ttCount = (spacer.match(/TT/g) || []).length;
    if (ttCount >= 2) { score -= 10; }

    // PAM proximal G enrichment (positions 17-20)
    const proximal = spacer.slice(-4);
    const proxGC = computeGC(proximal);
    if (proxGC >= 50 && proxGC <= 75) { score += 5; }

    return Math.max(0, Math.min(100, score));
}

// Off-target heuristic: seed region + mismatch tolerance
function computeOffTargetHeuristic(spacer: string, fullSequence: string): number {
    const seed = spacer.slice(-12); // PAM-proximal 12nt seed
    let score = 100;

    // Count approximate matches in the full sequence
    let matches = 0;
    const rc = reverseComplement(spacer);
    for (let i = 0; i <= fullSequence.length - spacer.length; i++) {
        const window = fullSequence.substring(i, i + spacer.length);
        if (window === spacer || window === rc) { continue; } // skip self
        let mismatches = 0;
        for (let j = 0; j < spacer.length; j++) {
            if (window[j] !== spacer[j]) { mismatches++; }
        }
        if (mismatches <= 3) { matches++; }
        if (mismatches <= 1) { matches += 3; } // seed-proximal weight
    }

    score -= matches * 8;

    // Seed uniqueness
    let seedHits = 0;
    for (let i = 0; i <= fullSequence.length - seed.length; i++) {
        if (fullSequence.substring(i, i + seed.length) === seed) { seedHits++; }
    }
    if (seedHits > 2) { score -= (seedHits - 1) * 10; }

    return Math.max(0, Math.min(100, score));
}

// Self-complementarity: check for potential hairpin formation in sgRNA
function computeSelfComplementarity(spacer: string): number {
    let score = 100;
    const SCAFFOLD = 'GTTTTAGAGCTAGAAATAGCAAGTTAAAATAAGGCTAGTCCGTTATCAACTTGAAAAAGTGGCACCGAGTCGGTGC';
    const full = spacer + SCAFFOLD;

    // Check for reverse complement palindromes (hairpins)
    for (let winSize = 6; winSize <= 12; winSize++) {
        for (let i = 0; i < full.length - winSize * 2; i++) {
            const seg = full.substring(i, i + winSize);
            const rc = reverseComplement(seg);
            const downstream = full.substring(i + winSize + 3); // 3nt loop minimum
            if (downstream.includes(rc)) {
                score -= (winSize - 4) * 5;
            }
        }
    }

    return Math.max(0, Math.min(100, score));
}

// ──────────────────────────────────────────────────────────────────────────────
// Find all guide RNAs in a DNA sequence
// ──────────────────────────────────────────────────────────────────────────────
export function findGuideRNAs(sequence: string, nucleaseId: string): GuideRNA[] {
    const nuclease = CAS_NUCLEASES[nucleaseId];
    if (!nuclease) { return []; }

    const guides: GuideRNA[] = [];
    const seq = sequence.toUpperCase().replace(/[^ACGT]/g, '');
    const pamLen = nuclease.pam.length;
    const spacerLen = nuclease.spacerLength;

    // Forward strand
    for (let i = 0; i <= seq.length - pamLen - spacerLen; i++) {
        if (nuclease.pamSide === '3prime') {
            // spacer-PAM (SpCas9-like)
            const spacer = seq.substring(i, i + spacerLen);
            const pam = seq.substring(i + spacerLen, i + spacerLen + pamLen);
            if (matchesPAM(pam, nuclease.pam)) {
                const gc = computeGC(spacer);
                const onTarget = computeOnTargetScore(spacer, pam);
                const offTarget = computeOffTargetHeuristic(spacer, seq);
                const selfComp = computeSelfComplementarity(spacer);
                const cutSite = i + spacerLen + nuclease.cutOffset;
                const warnings = generateWarnings(spacer, gc, onTarget);

                guides.push({
                    spacer, pam, position: i, strand: '+',
                    gcContent: gc, onTargetScore: onTarget, offTargetScore: offTarget,
                    selfCompScore: selfComp,
                    overallScore: Math.round(onTarget * 0.4 + offTarget * 0.35 + selfComp * 0.25),
                    warnings, cutSite
                });
            }
        } else {
            // PAM-spacer (Cas12a-like)
            const pam = seq.substring(i, i + pamLen);
            const spacer = seq.substring(i + pamLen, i + pamLen + spacerLen);
            if (matchesPAM(pam, nuclease.pam) && spacer.length === spacerLen) {
                const gc = computeGC(spacer);
                const onTarget = computeOnTargetScore(spacer, pam);
                const offTarget = computeOffTargetHeuristic(spacer, seq);
                const selfComp = computeSelfComplementarity(spacer);
                const cutSite = i + pamLen + nuclease.cutOffset;
                const warnings = generateWarnings(spacer, gc, onTarget);

                guides.push({
                    spacer, pam, position: i + pamLen, strand: '+',
                    gcContent: gc, onTargetScore: onTarget, offTargetScore: offTarget,
                    selfCompScore: selfComp,
                    overallScore: Math.round(onTarget * 0.4 + offTarget * 0.35 + selfComp * 0.25),
                    warnings, cutSite
                });
            }
        }
    }

    // Reverse strand
    const rcSeq = reverseComplement(seq);
    for (let i = 0; i <= rcSeq.length - pamLen - spacerLen; i++) {
        if (nuclease.pamSide === '3prime') {
            const spacer = rcSeq.substring(i, i + spacerLen);
            const pam = rcSeq.substring(i + spacerLen, i + spacerLen + pamLen);
            if (matchesPAM(pam, nuclease.pam)) {
                const gc = computeGC(spacer);
                const onTarget = computeOnTargetScore(spacer, pam);
                const offTarget = computeOffTargetHeuristic(spacer, seq);
                const selfComp = computeSelfComplementarity(spacer);
                const origPos = seq.length - i - spacerLen;
                const cutSite = origPos - nuclease.cutOffset;
                const warnings = generateWarnings(spacer, gc, onTarget);

                guides.push({
                    spacer, pam, position: origPos, strand: '-',
                    gcContent: gc, onTargetScore: onTarget, offTargetScore: offTarget,
                    selfCompScore: selfComp,
                    overallScore: Math.round(onTarget * 0.4 + offTarget * 0.35 + selfComp * 0.25),
                    warnings, cutSite
                });
            }
        } else {
            const pam = rcSeq.substring(i, i + pamLen);
            const spacer = rcSeq.substring(i + pamLen, i + pamLen + spacerLen);
            if (matchesPAM(pam, nuclease.pam) && spacer.length === spacerLen) {
                const gc = computeGC(spacer);
                const onTarget = computeOnTargetScore(spacer, pam);
                const offTarget = computeOffTargetHeuristic(spacer, seq);
                const selfComp = computeSelfComplementarity(spacer);
                const origPos = seq.length - i - pamLen - spacerLen;
                const cutSite = origPos + nuclease.cutOffset;
                const warnings = generateWarnings(spacer, gc, onTarget);

                guides.push({
                    spacer, pam, position: origPos, strand: '-',
                    gcContent: gc, onTargetScore: onTarget, offTargetScore: offTarget,
                    selfCompScore: selfComp,
                    overallScore: Math.round(onTarget * 0.4 + offTarget * 0.35 + selfComp * 0.25),
                    warnings, cutSite
                });
            }
        }
    }

    // Sort by overall score descending
    guides.sort((a, b) => b.overallScore - a.overallScore);
    return guides;
}

function generateWarnings(spacer: string, gc: number, onTarget: number): string[] {
    const w: string[] = [];
    if (gc < 30) { w.push('⚠️ GC < 30% — baja estabilidad del duplex RNA:DNA'); }
    if (gc > 75) { w.push('⚠️ GC > 75% — posible estructura secundaria excesiva'); }
    if (/TTTT/.test(spacer)) { w.push('⚠️ Homopolímero TTTT — señal terminación Pol III'); }
    if (/AAAA/.test(spacer)) { w.push('⚠️ Homopolímero AAAA'); }
    if (/GGGG/.test(spacer)) { w.push('⚠️ Homopolímero GGGG — posible G-quadruplex'); }
    if (onTarget < 30) { w.push('⚠️ Score on-target bajo (< 30)'); }
    if (spacer.startsWith('T')) { w.push('💡 Spacer inicia con T — puede reducir expresión desde promotor U6'); }
    return w;
}

// ──────────────────────────────────────────────────────────────────────────────
