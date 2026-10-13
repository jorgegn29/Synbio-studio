/**
 * SynBio-LLVM — Tablas de Uso de Codones Reales
 * 
 * Datos de frecuencia de codones obtenidos de la base de datos Kazusa:
 *   Nakamura, Y., Gojobori, T. & Ikemura, T. (2000).
 *   "Codon usage tabulated from international DNA sequence databases: 
 *    status for the year 2000."
 *   Nucleic Acids Research, 28(1), 292.
 *   DOI: 10.1093/nar/28.1.292
 * 
 * Fuente online: https://www.kazusa.or.jp/codon/
 * 
 * Los valores representan la fracción de uso de cada codón sinónimo
 * (frecuencia relativa dentro de cada grupo de aminoácidos).
 * Datos extraídos de GenBank Release, codificado a partir de CDS anotadas.
 * 
 * Formato: { codon: [aminoácido, fracción_por_1000, frecuencia_relativa] }
 * frecuencia_relativa = fracción del codón entre los sinónimos del mismo aa
 */

// ── Tipos ──────────────────────────────────────────────────────────────

export interface CodonEntry {
    aminoAcid: string;          // Aminoácido de 3 letras
    aminoAcidSingle: string;    // Aminoácido de 1 letra
    frequency: number;          // Frecuencia por 1000 codones
    fraction: number;            // Fracción relativa entre sinónimos (0-1)
}

export type CodonTable = Record<string, CodonEntry>;

// ── Código genético estándar ───────────────────────────────────────────
// NCBI Translation Table 1 (Standard Code)
// https://www.ncbi.nlm.nih.gov/Taxonomy/Utils/wprintgc.cgi

export const GENETIC_CODE: Record<string, { aa3: string; aa1: string }> = {
    'TTT': { aa3: 'Phe', aa1: 'F' }, 'TTC': { aa3: 'Phe', aa1: 'F' },
    'TTA': { aa3: 'Leu', aa1: 'L' }, 'TTG': { aa3: 'Leu', aa1: 'L' },
    'CTT': { aa3: 'Leu', aa1: 'L' }, 'CTC': { aa3: 'Leu', aa1: 'L' },
    'CTA': { aa3: 'Leu', aa1: 'L' }, 'CTG': { aa3: 'Leu', aa1: 'L' },
    'ATT': { aa3: 'Ile', aa1: 'I' }, 'ATC': { aa3: 'Ile', aa1: 'I' },
    'ATA': { aa3: 'Ile', aa1: 'I' }, 'ATG': { aa3: 'Met', aa1: 'M' },
    'GTT': { aa3: 'Val', aa1: 'V' }, 'GTC': { aa3: 'Val', aa1: 'V' },
    'GTA': { aa3: 'Val', aa1: 'V' }, 'GTG': { aa3: 'Val', aa1: 'V' },
    'TCT': { aa3: 'Ser', aa1: 'S' }, 'TCC': { aa3: 'Ser', aa1: 'S' },
    'TCA': { aa3: 'Ser', aa1: 'S' }, 'TCG': { aa3: 'Ser', aa1: 'S' },
    'CCT': { aa3: 'Pro', aa1: 'P' }, 'CCC': { aa3: 'Pro', aa1: 'P' },
    'CCA': { aa3: 'Pro', aa1: 'P' }, 'CCG': { aa3: 'Pro', aa1: 'P' },
    'ACT': { aa3: 'Thr', aa1: 'T' }, 'ACC': { aa3: 'Thr', aa1: 'T' },
    'ACA': { aa3: 'Thr', aa1: 'T' }, 'ACG': { aa3: 'Thr', aa1: 'T' },
    'GCT': { aa3: 'Ala', aa1: 'A' }, 'GCC': { aa3: 'Ala', aa1: 'A' },
    'GCA': { aa3: 'Ala', aa1: 'A' }, 'GCG': { aa3: 'Ala', aa1: 'A' },
    'TAT': { aa3: 'Tyr', aa1: 'Y' }, 'TAC': { aa3: 'Tyr', aa1: 'Y' },
    'TAA': { aa3: 'Stop', aa1: '*' }, 'TAG': { aa3: 'Stop', aa1: '*' },
    'CAT': { aa3: 'His', aa1: 'H' }, 'CAC': { aa3: 'His', aa1: 'H' },
    'CAA': { aa3: 'Gln', aa1: 'Q' }, 'CAG': { aa3: 'Gln', aa1: 'Q' },
    'AAT': { aa3: 'Asn', aa1: 'N' }, 'AAC': { aa3: 'Asn', aa1: 'N' },
    'AAA': { aa3: 'Lys', aa1: 'K' }, 'AAG': { aa3: 'Lys', aa1: 'K' },
    'GAT': { aa3: 'Asp', aa1: 'D' }, 'GAC': { aa3: 'Asp', aa1: 'D' },
    'GAA': { aa3: 'Glu', aa1: 'E' }, 'GAG': { aa3: 'Glu', aa1: 'E' },
    'TGT': { aa3: 'Cys', aa1: 'C' }, 'TGC': { aa3: 'Cys', aa1: 'C' },
    'TGA': { aa3: 'Stop', aa1: '*' }, 'TGG': { aa3: 'Trp', aa1: 'W' },
    'CGT': { aa3: 'Arg', aa1: 'R' }, 'CGC': { aa3: 'Arg', aa1: 'R' },
    'CGA': { aa3: 'Arg', aa1: 'R' }, 'CGG': { aa3: 'Arg', aa1: 'R' },
    'AGT': { aa3: 'Ser', aa1: 'S' }, 'AGC': { aa3: 'Ser', aa1: 'S' },
    'AGA': { aa3: 'Arg', aa1: 'R' }, 'AGG': { aa3: 'Arg', aa1: 'R' },
    'GGT': { aa3: 'Gly', aa1: 'G' }, 'GGC': { aa3: 'Gly', aa1: 'G' },
    'GGA': { aa3: 'Gly', aa1: 'G' }, 'GGG': { aa3: 'Gly', aa1: 'G' },
};

// ── Tablas de uso de codones por organismo ─────────────────────────────

/**
 * Escherichia coli K-12 substr. MG1655
 * Kazusa ID: 83333
 * GenBank: U00096 (4,639 CDS, 1,362,996 codones)
 * 
 * Datos: https://www.kazusa.or.jp/codon/cgi-bin/showcodon.cgi?species=83333
 */
export const ECOLI_K12_CODON_TABLE: CodonTable = {
    // Phe (F)
    'TTT': { aminoAcid: 'Phe', aminoAcidSingle: 'F', frequency: 22.0, fraction: 0.58 },
    'TTC': { aminoAcid: 'Phe', aminoAcidSingle: 'F', frequency: 16.2, fraction: 0.42 },
    // Leu (L) - 6 codones
    'TTA': { aminoAcid: 'Leu', aminoAcidSingle: 'L', frequency: 13.7, fraction: 0.13 },
    'TTG': { aminoAcid: 'Leu', aminoAcidSingle: 'L', frequency: 13.4, fraction: 0.13 },
    'CTT': { aminoAcid: 'Leu', aminoAcidSingle: 'L', frequency: 11.0, fraction: 0.10 },
    'CTC': { aminoAcid: 'Leu', aminoAcidSingle: 'L', frequency: 10.9, fraction: 0.10 },
    'CTA': { aminoAcid: 'Leu', aminoAcidSingle: 'L', frequency: 3.9, fraction: 0.04 },
    'CTG': { aminoAcid: 'Leu', aminoAcidSingle: 'L', frequency: 52.7, fraction: 0.50 },  // ← codón preferido
    // Ile (I)
    'ATT': { aminoAcid: 'Ile', aminoAcidSingle: 'I', frequency: 30.1, fraction: 0.51 },
    'ATC': { aminoAcid: 'Ile', aminoAcidSingle: 'I', frequency: 24.6, fraction: 0.42 },
    'ATA': { aminoAcid: 'Ile', aminoAcidSingle: 'I', frequency: 4.5, fraction: 0.07 },
    // Met (M) - codón único
    'ATG': { aminoAcid: 'Met', aminoAcidSingle: 'M', frequency: 27.8, fraction: 1.00 },
    // Val (V)
    'GTT': { aminoAcid: 'Val', aminoAcidSingle: 'V', frequency: 18.3, fraction: 0.26 },
    'GTC': { aminoAcid: 'Val', aminoAcidSingle: 'V', frequency: 15.1, fraction: 0.22 },
    'GTA': { aminoAcid: 'Val', aminoAcidSingle: 'V', frequency: 10.9, fraction: 0.15 },
    'GTG': { aminoAcid: 'Val', aminoAcidSingle: 'V', frequency: 25.9, fraction: 0.37 },
    // Ser (S) - 6 codones
    'TCT': { aminoAcid: 'Ser', aminoAcidSingle: 'S', frequency: 8.6, fraction: 0.15 },
    'TCC': { aminoAcid: 'Ser', aminoAcidSingle: 'S', frequency: 8.6, fraction: 0.15 },
    'TCA': { aminoAcid: 'Ser', aminoAcidSingle: 'S', frequency: 7.2, fraction: 0.12 },
    'TCG': { aminoAcid: 'Ser', aminoAcidSingle: 'S', frequency: 8.9, fraction: 0.15 },
    'AGT': { aminoAcid: 'Ser', aminoAcidSingle: 'S', frequency: 8.8, fraction: 0.15 },
    'AGC': { aminoAcid: 'Ser', aminoAcidSingle: 'S', frequency: 16.1, fraction: 0.28 },
    // Pro (P)
    'CCT': { aminoAcid: 'Pro', aminoAcidSingle: 'P', frequency: 7.0, fraction: 0.16 },
    'CCC': { aminoAcid: 'Pro', aminoAcidSingle: 'P', frequency: 5.5, fraction: 0.12 },
    'CCA': { aminoAcid: 'Pro', aminoAcidSingle: 'P', frequency: 8.4, fraction: 0.19 },
    'CCG': { aminoAcid: 'Pro', aminoAcidSingle: 'P', frequency: 23.2, fraction: 0.53 },  // ← preferido en E. coli
    // Thr (T)
    'ACT': { aminoAcid: 'Thr', aminoAcidSingle: 'T', frequency: 9.0, fraction: 0.17 },
    'ACC': { aminoAcid: 'Thr', aminoAcidSingle: 'T', frequency: 23.4, fraction: 0.44 },
    'ACA': { aminoAcid: 'Thr', aminoAcidSingle: 'T', frequency: 7.1, fraction: 0.13 },
    'ACG': { aminoAcid: 'Thr', aminoAcidSingle: 'T', frequency: 14.4, fraction: 0.27 },
    // Ala (A)
    'GCT': { aminoAcid: 'Ala', aminoAcidSingle: 'A', frequency: 15.3, fraction: 0.16 },
    'GCC': { aminoAcid: 'Ala', aminoAcidSingle: 'A', frequency: 25.5, fraction: 0.27 },
    'GCA': { aminoAcid: 'Ala', aminoAcidSingle: 'A', frequency: 20.1, fraction: 0.21 },
    'GCG': { aminoAcid: 'Ala', aminoAcidSingle: 'A', frequency: 33.7, fraction: 0.36 },
    // Tyr (Y)
    'TAT': { aminoAcid: 'Tyr', aminoAcidSingle: 'Y', frequency: 16.2, fraction: 0.57 },
    'TAC': { aminoAcid: 'Tyr', aminoAcidSingle: 'Y', frequency: 12.2, fraction: 0.43 },
    // Stop (*)
    'TAA': { aminoAcid: 'Stop', aminoAcidSingle: '*', frequency: 2.0, fraction: 0.61 },
    'TAG': { aminoAcid: 'Stop', aminoAcidSingle: '*', frequency: 0.2, fraction: 0.09 },
    'TGA': { aminoAcid: 'Stop', aminoAcidSingle: '*', frequency: 1.0, fraction: 0.30 },
    // His (H)
    'CAT': { aminoAcid: 'His', aminoAcidSingle: 'H', frequency: 12.8, fraction: 0.57 },
    'CAC': { aminoAcid: 'His', aminoAcidSingle: 'H', frequency: 9.7, fraction: 0.43 },
    // Gln (Q)
    'CAA': { aminoAcid: 'Gln', aminoAcidSingle: 'Q', frequency: 15.3, fraction: 0.35 },
    'CAG': { aminoAcid: 'Gln', aminoAcidSingle: 'Q', frequency: 29.0, fraction: 0.65 },
    // Asn (N)
    'AAT': { aminoAcid: 'Asn', aminoAcidSingle: 'N', frequency: 17.7, fraction: 0.45 },
    'AAC': { aminoAcid: 'Asn', aminoAcidSingle: 'N', frequency: 21.7, fraction: 0.55 },
    // Lys (K)
    'AAA': { aminoAcid: 'Lys', aminoAcidSingle: 'K', frequency: 33.6, fraction: 0.76 },
    'AAG': { aminoAcid: 'Lys', aminoAcidSingle: 'K', frequency: 10.3, fraction: 0.24 },
    // Asp (D)
    'GAT': { aminoAcid: 'Asp', aminoAcidSingle: 'D', frequency: 32.2, fraction: 0.63 },
    'GAC': { aminoAcid: 'Asp', aminoAcidSingle: 'D', frequency: 19.1, fraction: 0.37 },
    // Glu (E)
    'GAA': { aminoAcid: 'Glu', aminoAcidSingle: 'E', frequency: 39.6, fraction: 0.69 },
    'GAG': { aminoAcid: 'Glu', aminoAcidSingle: 'E', frequency: 18.0, fraction: 0.31 },
    // Cys (C)
    'TGT': { aminoAcid: 'Cys', aminoAcidSingle: 'C', frequency: 5.2, fraction: 0.45 },
    'TGC': { aminoAcid: 'Cys', aminoAcidSingle: 'C', frequency: 6.5, fraction: 0.55 },
    // Trp (W) - codón único
    'TGG': { aminoAcid: 'Trp', aminoAcidSingle: 'W', frequency: 15.2, fraction: 1.00 },
    // Arg (R) - 6 codones
    'CGT': { aminoAcid: 'Arg', aminoAcidSingle: 'R', frequency: 20.9, fraction: 0.36 },  // ← preferido en E. coli
    'CGC': { aminoAcid: 'Arg', aminoAcidSingle: 'R', frequency: 21.6, fraction: 0.38 },
    'CGA': { aminoAcid: 'Arg', aminoAcidSingle: 'R', frequency: 3.6, fraction: 0.06 },
    'CGG': { aminoAcid: 'Arg', aminoAcidSingle: 'R', frequency: 5.4, fraction: 0.10 },
    'AGA': { aminoAcid: 'Arg', aminoAcidSingle: 'R', frequency: 2.1, fraction: 0.04 },
    'AGG': { aminoAcid: 'Arg', aminoAcidSingle: 'R', frequency: 1.2, fraction: 0.02 },
    // Gly (G)
    'GGT': { aminoAcid: 'Gly', aminoAcidSingle: 'G', frequency: 24.7, fraction: 0.34 },
    'GGC': { aminoAcid: 'Gly', aminoAcidSingle: 'G', frequency: 29.6, fraction: 0.41 },
    'GGA': { aminoAcid: 'Gly', aminoAcidSingle: 'G', frequency: 8.0, fraction: 0.11 },
    'GGG': { aminoAcid: 'Gly', aminoAcidSingle: 'G', frequency: 11.3, fraction: 0.15 },
};

/**
 * Saccharomyces cerevisiae S288C
 * Kazusa ID: 4932
 * GenBank: 6,000+ CDS
 * 
 * Datos: https://www.kazusa.or.jp/codon/cgi-bin/showcodon.cgi?species=4932
 */
export const YEAST_S288C_CODON_TABLE: CodonTable = {
    'TTT': { aminoAcid: 'Phe', aminoAcidSingle: 'F', frequency: 26.1, fraction: 0.59 },
    'TTC': { aminoAcid: 'Phe', aminoAcidSingle: 'F', frequency: 18.4, fraction: 0.41 },
    'TTA': { aminoAcid: 'Leu', aminoAcidSingle: 'L', frequency: 26.2, fraction: 0.28 },
    'TTG': { aminoAcid: 'Leu', aminoAcidSingle: 'L', frequency: 27.2, fraction: 0.29 },  // ← preferido
    'CTT': { aminoAcid: 'Leu', aminoAcidSingle: 'L', frequency: 12.3, fraction: 0.13 },
    'CTC': { aminoAcid: 'Leu', aminoAcidSingle: 'L', frequency: 5.4, fraction: 0.06 },
    'CTA': { aminoAcid: 'Leu', aminoAcidSingle: 'L', frequency: 13.5, fraction: 0.14 },
    'CTG': { aminoAcid: 'Leu', aminoAcidSingle: 'L', frequency: 10.5, fraction: 0.11 },
    'ATT': { aminoAcid: 'Ile', aminoAcidSingle: 'I', frequency: 30.1, fraction: 0.46 },
    'ATC': { aminoAcid: 'Ile', aminoAcidSingle: 'I', frequency: 17.2, fraction: 0.26 },
    'ATA': { aminoAcid: 'Ile', aminoAcidSingle: 'I', frequency: 17.8, fraction: 0.27 },
    'ATG': { aminoAcid: 'Met', aminoAcidSingle: 'M', frequency: 20.9, fraction: 1.00 },
    'GTT': { aminoAcid: 'Val', aminoAcidSingle: 'V', frequency: 22.1, fraction: 0.39 },  // ← preferido
    'GTC': { aminoAcid: 'Val', aminoAcidSingle: 'V', frequency: 11.8, fraction: 0.21 },
    'GTA': { aminoAcid: 'Val', aminoAcidSingle: 'V', frequency: 11.8, fraction: 0.21 },
    'GTG': { aminoAcid: 'Val', aminoAcidSingle: 'V', frequency: 10.8, fraction: 0.19 },
    'TCT': { aminoAcid: 'Ser', aminoAcidSingle: 'S', frequency: 23.5, fraction: 0.26 },  // ← preferido
    'TCC': { aminoAcid: 'Ser', aminoAcidSingle: 'S', frequency: 14.2, fraction: 0.16 },
    'TCA': { aminoAcid: 'Ser', aminoAcidSingle: 'S', frequency: 18.7, fraction: 0.21 },
    'TCG': { aminoAcid: 'Ser', aminoAcidSingle: 'S', frequency: 8.6, fraction: 0.10 },
    'AGT': { aminoAcid: 'Ser', aminoAcidSingle: 'S', frequency: 14.2, fraction: 0.16 },
    'AGC': { aminoAcid: 'Ser', aminoAcidSingle: 'S', frequency: 9.8, fraction: 0.11 },
    'CCT': { aminoAcid: 'Pro', aminoAcidSingle: 'P', frequency: 13.5, fraction: 0.31 },
    'CCC': { aminoAcid: 'Pro', aminoAcidSingle: 'P', frequency: 6.8, fraction: 0.15 },
    'CCA': { aminoAcid: 'Pro', aminoAcidSingle: 'P', frequency: 18.3, fraction: 0.42 },  // ← preferido
    'CCG': { aminoAcid: 'Pro', aminoAcidSingle: 'P', frequency: 5.3, fraction: 0.12 },
    'ACT': { aminoAcid: 'Thr', aminoAcidSingle: 'T', frequency: 20.3, fraction: 0.35 },  // ← preferido
    'ACC': { aminoAcid: 'Thr', aminoAcidSingle: 'T', frequency: 12.7, fraction: 0.22 },
    'ACA': { aminoAcid: 'Thr', aminoAcidSingle: 'T', frequency: 17.8, fraction: 0.30 },
    'ACG': { aminoAcid: 'Thr', aminoAcidSingle: 'T', frequency: 8.0, fraction: 0.14 },
    'GCT': { aminoAcid: 'Ala', aminoAcidSingle: 'A', frequency: 21.2, fraction: 0.38 },  // ← preferido
    'GCC': { aminoAcid: 'Ala', aminoAcidSingle: 'A', frequency: 12.6, fraction: 0.22 },
    'GCA': { aminoAcid: 'Ala', aminoAcidSingle: 'A', frequency: 16.2, fraction: 0.29 },
    'GCG': { aminoAcid: 'Ala', aminoAcidSingle: 'A', frequency: 6.2, fraction: 0.11 },
    'TAT': { aminoAcid: 'Tyr', aminoAcidSingle: 'Y', frequency: 18.8, fraction: 0.56 },
    'TAC': { aminoAcid: 'Tyr', aminoAcidSingle: 'Y', frequency: 14.8, fraction: 0.44 },
    'TAA': { aminoAcid: 'Stop', aminoAcidSingle: '*', frequency: 1.1, fraction: 0.48 },
    'TAG': { aminoAcid: 'Stop', aminoAcidSingle: '*', frequency: 0.5, fraction: 0.22 },
    'TGA': { aminoAcid: 'Stop', aminoAcidSingle: '*', frequency: 0.7, fraction: 0.30 },
    'CAT': { aminoAcid: 'His', aminoAcidSingle: 'H', frequency: 13.7, fraction: 0.64 },
    'CAC': { aminoAcid: 'His', aminoAcidSingle: 'H', frequency: 7.8, fraction: 0.36 },
    'CAA': { aminoAcid: 'Gln', aminoAcidSingle: 'Q', frequency: 27.3, fraction: 0.69 },  // ← preferido
    'CAG': { aminoAcid: 'Gln', aminoAcidSingle: 'Q', frequency: 12.1, fraction: 0.31 },
    'AAT': { aminoAcid: 'Asn', aminoAcidSingle: 'N', frequency: 35.7, fraction: 0.59 },
    'AAC': { aminoAcid: 'Asn', aminoAcidSingle: 'N', frequency: 24.8, fraction: 0.41 },
    'AAA': { aminoAcid: 'Lys', aminoAcidSingle: 'K', frequency: 41.9, fraction: 0.58 },
    'AAG': { aminoAcid: 'Lys', aminoAcidSingle: 'K', frequency: 30.8, fraction: 0.42 },
    'GAT': { aminoAcid: 'Asp', aminoAcidSingle: 'D', frequency: 37.6, fraction: 0.65 },
    'GAC': { aminoAcid: 'Asp', aminoAcidSingle: 'D', frequency: 20.2, fraction: 0.35 },
    'GAA': { aminoAcid: 'Glu', aminoAcidSingle: 'E', frequency: 45.6, fraction: 0.70 },  // ← preferido
    'GAG': { aminoAcid: 'Glu', aminoAcidSingle: 'E', frequency: 19.2, fraction: 0.30 },
    'TGT': { aminoAcid: 'Cys', aminoAcidSingle: 'C', frequency: 8.1, fraction: 0.63 },
    'TGC': { aminoAcid: 'Cys', aminoAcidSingle: 'C', frequency: 4.8, fraction: 0.37 },
    'TGG': { aminoAcid: 'Trp', aminoAcidSingle: 'W', frequency: 10.4, fraction: 1.00 },
    'CGT': { aminoAcid: 'Arg', aminoAcidSingle: 'R', frequency: 6.4, fraction: 0.14 },
    'CGC': { aminoAcid: 'Arg', aminoAcidSingle: 'R', frequency: 2.6, fraction: 0.06 },
    'CGA': { aminoAcid: 'Arg', aminoAcidSingle: 'R', frequency: 3.0, fraction: 0.07 },
    'CGG': { aminoAcid: 'Arg', aminoAcidSingle: 'R', frequency: 1.7, fraction: 0.04 },
    'AGA': { aminoAcid: 'Arg', aminoAcidSingle: 'R', frequency: 21.3, fraction: 0.48 },  // ← preferido
    'AGG': { aminoAcid: 'Arg', aminoAcidSingle: 'R', frequency: 9.2, fraction: 0.21 },
    'GGT': { aminoAcid: 'Gly', aminoAcidSingle: 'G', frequency: 23.9, fraction: 0.47 },  // ← preferido
    'GGC': { aminoAcid: 'Gly', aminoAcidSingle: 'G', frequency: 9.8, fraction: 0.19 },
    'GGA': { aminoAcid: 'Gly', aminoAcidSingle: 'G', frequency: 10.9, fraction: 0.22 },
    'GGG': { aminoAcid: 'Gly', aminoAcidSingle: 'G', frequency: 6.0, fraction: 0.12 },
};

/**
 * Bacillus subtilis str. 168
 * Kazusa ID: 224308
 * GenBank: AL009126 (4,174 CDS)
 * 
 * Datos: https://www.kazusa.or.jp/codon/cgi-bin/showcodon.cgi?species=224308
 */
export const BSUBTILIS_168_CODON_TABLE: CodonTable = {
    'TTT': { aminoAcid: 'Phe', aminoAcidSingle: 'F', frequency: 28.2, fraction: 0.62 },
    'TTC': { aminoAcid: 'Phe', aminoAcidSingle: 'F', frequency: 17.2, fraction: 0.38 },
    'TTA': { aminoAcid: 'Leu', aminoAcidSingle: 'L', frequency: 22.8, fraction: 0.22 },
    'TTG': { aminoAcid: 'Leu', aminoAcidSingle: 'L', frequency: 14.7, fraction: 0.14 },
    'CTT': { aminoAcid: 'Leu', aminoAcidSingle: 'L', frequency: 24.1, fraction: 0.23 },  // ← preferido
    'CTC': { aminoAcid: 'Leu', aminoAcidSingle: 'L', frequency: 10.5, fraction: 0.10 },
    'CTA': { aminoAcid: 'Leu', aminoAcidSingle: 'L', frequency: 7.2, fraction: 0.07 },
    'CTG': { aminoAcid: 'Leu', aminoAcidSingle: 'L', frequency: 24.5, fraction: 0.24 },
    'ATT': { aminoAcid: 'Ile', aminoAcidSingle: 'I', frequency: 34.5, fraction: 0.47 },
    'ATC': { aminoAcid: 'Ile', aminoAcidSingle: 'I', frequency: 20.6, fraction: 0.28 },
    'ATA': { aminoAcid: 'Ile', aminoAcidSingle: 'I', frequency: 18.3, fraction: 0.25 },
    'ATG': { aminoAcid: 'Met', aminoAcidSingle: 'M', frequency: 24.7, fraction: 1.00 },
    'GTT': { aminoAcid: 'Val', aminoAcidSingle: 'V', frequency: 20.2, fraction: 0.30 },
    'GTC': { aminoAcid: 'Val', aminoAcidSingle: 'V', frequency: 14.8, fraction: 0.22 },
    'GTA': { aminoAcid: 'Val', aminoAcidSingle: 'V', frequency: 18.2, fraction: 0.27 },
    'GTG': { aminoAcid: 'Val', aminoAcidSingle: 'V', frequency: 14.4, fraction: 0.21 },
    'TCT': { aminoAcid: 'Ser', aminoAcidSingle: 'S', frequency: 12.2, fraction: 0.19 },
    'TCC': { aminoAcid: 'Ser', aminoAcidSingle: 'S', frequency: 8.5, fraction: 0.13 },
    'TCA': { aminoAcid: 'Ser', aminoAcidSingle: 'S', frequency: 16.7, fraction: 0.26 },  // ← preferido
    'TCG': { aminoAcid: 'Ser', aminoAcidSingle: 'S', frequency: 5.8, fraction: 0.09 },
    'AGT': { aminoAcid: 'Ser', aminoAcidSingle: 'S', frequency: 12.2, fraction: 0.19 },
    'AGC': { aminoAcid: 'Ser', aminoAcidSingle: 'S', frequency: 9.0, fraction: 0.14 },
    'CCT': { aminoAcid: 'Pro', aminoAcidSingle: 'P', frequency: 8.4, fraction: 0.23 },
    'CCC': { aminoAcid: 'Pro', aminoAcidSingle: 'P', frequency: 3.7, fraction: 0.10 },
    'CCA': { aminoAcid: 'Pro', aminoAcidSingle: 'P', frequency: 14.4, fraction: 0.39 },  // ← preferido
    'CCG': { aminoAcid: 'Pro', aminoAcidSingle: 'P', frequency: 10.4, fraction: 0.28 },
    'ACT': { aminoAcid: 'Thr', aminoAcidSingle: 'T', frequency: 11.4, fraction: 0.19 },
    'ACC': { aminoAcid: 'Thr', aminoAcidSingle: 'T', frequency: 11.7, fraction: 0.20 },
    'ACA': { aminoAcid: 'Thr', aminoAcidSingle: 'T', frequency: 22.1, fraction: 0.37 },  // ← preferido
    'ACG': { aminoAcid: 'Thr', aminoAcidSingle: 'T', frequency: 14.8, fraction: 0.25 },
    'GCT': { aminoAcid: 'Ala', aminoAcidSingle: 'A', frequency: 17.0, fraction: 0.22 },
    'GCC': { aminoAcid: 'Ala', aminoAcidSingle: 'A', frequency: 13.7, fraction: 0.18 },
    'GCA': { aminoAcid: 'Ala', aminoAcidSingle: 'A', frequency: 27.1, fraction: 0.36 },  // ← preferido
    'GCG': { aminoAcid: 'Ala', aminoAcidSingle: 'A', frequency: 18.7, fraction: 0.25 },
    'TAT': { aminoAcid: 'Tyr', aminoAcidSingle: 'Y', frequency: 21.5, fraction: 0.57 },
    'TAC': { aminoAcid: 'Tyr', aminoAcidSingle: 'Y', frequency: 16.2, fraction: 0.43 },
    'TAA': { aminoAcid: 'Stop', aminoAcidSingle: '*', frequency: 2.3, fraction: 0.56 },
    'TAG': { aminoAcid: 'Stop', aminoAcidSingle: '*', frequency: 0.4, fraction: 0.10 },
    'TGA': { aminoAcid: 'Stop', aminoAcidSingle: '*', frequency: 1.4, fraction: 0.34 },
    'CAT': { aminoAcid: 'His', aminoAcidSingle: 'H', frequency: 13.8, fraction: 0.59 },
    'CAC': { aminoAcid: 'His', aminoAcidSingle: 'H', frequency: 9.6, fraction: 0.41 },
    'CAA': { aminoAcid: 'Gln', aminoAcidSingle: 'Q', frequency: 22.2, fraction: 0.61 },  // ← preferido
    'CAG': { aminoAcid: 'Gln', aminoAcidSingle: 'Q', frequency: 14.4, fraction: 0.39 },
    'AAT': { aminoAcid: 'Asn', aminoAcidSingle: 'N', frequency: 25.3, fraction: 0.53 },
    'AAC': { aminoAcid: 'Asn', aminoAcidSingle: 'N', frequency: 22.1, fraction: 0.47 },
    'AAA': { aminoAcid: 'Lys', aminoAcidSingle: 'K', frequency: 42.7, fraction: 0.70 },  // ← preferido
    'AAG': { aminoAcid: 'Lys', aminoAcidSingle: 'K', frequency: 18.2, fraction: 0.30 },
    'GAT': { aminoAcid: 'Asp', aminoAcidSingle: 'D', frequency: 30.8, fraction: 0.58 },
    'GAC': { aminoAcid: 'Asp', aminoAcidSingle: 'D', frequency: 22.5, fraction: 0.42 },
    'GAA': { aminoAcid: 'Glu', aminoAcidSingle: 'E', frequency: 41.6, fraction: 0.64 },  // ← preferido
    'GAG': { aminoAcid: 'Glu', aminoAcidSingle: 'E', frequency: 23.2, fraction: 0.36 },
    'TGT': { aminoAcid: 'Cys', aminoAcidSingle: 'C', frequency: 5.9, fraction: 0.55 },
    'TGC': { aminoAcid: 'Cys', aminoAcidSingle: 'C', frequency: 4.9, fraction: 0.45 },
    'TGG': { aminoAcid: 'Trp', aminoAcidSingle: 'W', frequency: 10.7, fraction: 1.00 },
    'CGT': { aminoAcid: 'Arg', aminoAcidSingle: 'R', frequency: 10.2, fraction: 0.20 },
    'CGC': { aminoAcid: 'Arg', aminoAcidSingle: 'R', frequency: 12.3, fraction: 0.24 },
    'CGA': { aminoAcid: 'Arg', aminoAcidSingle: 'R', frequency: 7.2, fraction: 0.14 },
    'CGG': { aminoAcid: 'Arg', aminoAcidSingle: 'R', frequency: 6.4, fraction: 0.13 },
    'AGA': { aminoAcid: 'Arg', aminoAcidSingle: 'R', frequency: 10.6, fraction: 0.21 },
    'AGG': { aminoAcid: 'Arg', aminoAcidSingle: 'R', frequency: 4.0, fraction: 0.08 },
    'GGT': { aminoAcid: 'Gly', aminoAcidSingle: 'G', frequency: 17.1, fraction: 0.25 },
    'GGC': { aminoAcid: 'Gly', aminoAcidSingle: 'G', frequency: 16.1, fraction: 0.24 },
    'GGA': { aminoAcid: 'Gly', aminoAcidSingle: 'G', frequency: 22.3, fraction: 0.33 },  // ← preferido
    'GGG': { aminoAcid: 'Gly', aminoAcidSingle: 'G', frequency: 12.2, fraction: 0.18 },
};

/**
 * Homo sapiens (humano) - para referencia y comparación
 * Kazusa ID: 9606
 * 
 * Datos: https://www.kazusa.or.jp/codon/cgi-bin/showcodon.cgi?species=9606
 */
export const HUMAN_CODON_TABLE: CodonTable = {
    'TTT': { aminoAcid: 'Phe', aminoAcidSingle: 'F', frequency: 17.6, fraction: 0.45 },
    'TTC': { aminoAcid: 'Phe', aminoAcidSingle: 'F', frequency: 20.3, fraction: 0.55 },
    'TTA': { aminoAcid: 'Leu', aminoAcidSingle: 'L', frequency: 7.7, fraction: 0.07 },
    'TTG': { aminoAcid: 'Leu', aminoAcidSingle: 'L', frequency: 12.9, fraction: 0.13 },
    'CTT': { aminoAcid: 'Leu', aminoAcidSingle: 'L', frequency: 13.2, fraction: 0.13 },
    'CTC': { aminoAcid: 'Leu', aminoAcidSingle: 'L', frequency: 19.6, fraction: 0.20 },
    'CTA': { aminoAcid: 'Leu', aminoAcidSingle: 'L', frequency: 7.2, fraction: 0.07 },
    'CTG': { aminoAcid: 'Leu', aminoAcidSingle: 'L', frequency: 39.6, fraction: 0.40 },  // ← preferido
    'ATT': { aminoAcid: 'Ile', aminoAcidSingle: 'I', frequency: 16.0, fraction: 0.36 },
    'ATC': { aminoAcid: 'Ile', aminoAcidSingle: 'I', frequency: 20.8, fraction: 0.48 },  // ← preferido
    'ATA': { aminoAcid: 'Ile', aminoAcidSingle: 'I', frequency: 7.5, fraction: 0.17 },
    'ATG': { aminoAcid: 'Met', aminoAcidSingle: 'M', frequency: 22.0, fraction: 1.00 },
    'GTT': { aminoAcid: 'Val', aminoAcidSingle: 'V', frequency: 11.0, fraction: 0.18 },
    'GTC': { aminoAcid: 'Val', aminoAcidSingle: 'V', frequency: 14.5, fraction: 0.24 },
    'GTA': { aminoAcid: 'Val', aminoAcidSingle: 'V', frequency: 7.1, fraction: 0.11 },
    'GTG': { aminoAcid: 'Val', aminoAcidSingle: 'V', frequency: 28.1, fraction: 0.47 },  // ← preferido
    'TCT': { aminoAcid: 'Ser', aminoAcidSingle: 'S', frequency: 15.2, fraction: 0.18 },
    'TCC': { aminoAcid: 'Ser', aminoAcidSingle: 'S', frequency: 17.7, fraction: 0.22 },
    'TCA': { aminoAcid: 'Ser', aminoAcidSingle: 'S', frequency: 12.2, fraction: 0.15 },
    'TCG': { aminoAcid: 'Ser', aminoAcidSingle: 'S', frequency: 4.4, fraction: 0.06 },
    'AGT': { aminoAcid: 'Ser', aminoAcidSingle: 'S', frequency: 12.1, fraction: 0.15 },
    'AGC': { aminoAcid: 'Ser', aminoAcidSingle: 'S', frequency: 19.5, fraction: 0.24 },  // ← preferido
    'CCT': { aminoAcid: 'Pro', aminoAcidSingle: 'P', frequency: 17.5, fraction: 0.28 },
    'CCC': { aminoAcid: 'Pro', aminoAcidSingle: 'P', frequency: 19.8, fraction: 0.33 },  // ← preferido
    'CCA': { aminoAcid: 'Pro', aminoAcidSingle: 'P', frequency: 16.9, fraction: 0.27 },
    'CCG': { aminoAcid: 'Pro', aminoAcidSingle: 'P', frequency: 6.9, fraction: 0.11 },
    'ACT': { aminoAcid: 'Thr', aminoAcidSingle: 'T', frequency: 13.1, fraction: 0.24 },
    'ACC': { aminoAcid: 'Thr', aminoAcidSingle: 'T', frequency: 18.9, fraction: 0.36 },  // ← preferido
    'ACA': { aminoAcid: 'Thr', aminoAcidSingle: 'T', frequency: 15.1, fraction: 0.28 },
    'ACG': { aminoAcid: 'Thr', aminoAcidSingle: 'T', frequency: 6.1, fraction: 0.12 },
    'GCT': { aminoAcid: 'Ala', aminoAcidSingle: 'A', frequency: 18.4, fraction: 0.26 },
    'GCC': { aminoAcid: 'Ala', aminoAcidSingle: 'A', frequency: 27.7, fraction: 0.40 },  // ← preferido
    'GCA': { aminoAcid: 'Ala', aminoAcidSingle: 'A', frequency: 15.8, fraction: 0.23 },
    'GCG': { aminoAcid: 'Ala', aminoAcidSingle: 'A', frequency: 7.4, fraction: 0.11 },
    'TAT': { aminoAcid: 'Tyr', aminoAcidSingle: 'Y', frequency: 12.2, fraction: 0.43 },
    'TAC': { aminoAcid: 'Tyr', aminoAcidSingle: 'Y', frequency: 15.3, fraction: 0.57 },
    'TAA': { aminoAcid: 'Stop', aminoAcidSingle: '*', frequency: 1.0, fraction: 0.28 },
    'TAG': { aminoAcid: 'Stop', aminoAcidSingle: '*', frequency: 0.8, fraction: 0.20 },
    'TGA': { aminoAcid: 'Stop', aminoAcidSingle: '*', frequency: 1.6, fraction: 0.52 },
    'CAT': { aminoAcid: 'His', aminoAcidSingle: 'H', frequency: 10.9, fraction: 0.41 },
    'CAC': { aminoAcid: 'His', aminoAcidSingle: 'H', frequency: 15.1, fraction: 0.59 },  // ← preferido
    'CAA': { aminoAcid: 'Gln', aminoAcidSingle: 'Q', frequency: 12.3, fraction: 0.25 },
    'CAG': { aminoAcid: 'Gln', aminoAcidSingle: 'Q', frequency: 34.2, fraction: 0.75 },  // ← preferido
    'AAT': { aminoAcid: 'Asn', aminoAcidSingle: 'N', frequency: 17.0, fraction: 0.46 },
    'AAC': { aminoAcid: 'Asn', aminoAcidSingle: 'N', frequency: 19.1, fraction: 0.54 },
    'AAA': { aminoAcid: 'Lys', aminoAcidSingle: 'K', frequency: 24.4, fraction: 0.42 },
    'AAG': { aminoAcid: 'Lys', aminoAcidSingle: 'K', frequency: 31.9, fraction: 0.58 },  // ← preferido
    'GAT': { aminoAcid: 'Asp', aminoAcidSingle: 'D', frequency: 21.8, fraction: 0.46 },
    'GAC': { aminoAcid: 'Asp', aminoAcidSingle: 'D', frequency: 25.1, fraction: 0.54 },
    'GAA': { aminoAcid: 'Glu', aminoAcidSingle: 'E', frequency: 29.0, fraction: 0.42 },
    'GAG': { aminoAcid: 'Glu', aminoAcidSingle: 'E', frequency: 39.6, fraction: 0.58 },  // ← preferido
    'TGT': { aminoAcid: 'Cys', aminoAcidSingle: 'C', frequency: 10.6, fraction: 0.45 },
    'TGC': { aminoAcid: 'Cys', aminoAcidSingle: 'C', frequency: 12.6, fraction: 0.55 },
    'TGG': { aminoAcid: 'Trp', aminoAcidSingle: 'W', frequency: 13.2, fraction: 1.00 },
    'CGT': { aminoAcid: 'Arg', aminoAcidSingle: 'R', frequency: 4.5, fraction: 0.08 },
    'CGC': { aminoAcid: 'Arg', aminoAcidSingle: 'R', frequency: 10.4, fraction: 0.19 },
    'CGA': { aminoAcid: 'Arg', aminoAcidSingle: 'R', frequency: 6.2, fraction: 0.11 },
    'CGG': { aminoAcid: 'Arg', aminoAcidSingle: 'R', frequency: 11.4, fraction: 0.21 },
    'AGA': { aminoAcid: 'Arg', aminoAcidSingle: 'R', frequency: 12.2, fraction: 0.20 },
    'AGG': { aminoAcid: 'Arg', aminoAcidSingle: 'R', frequency: 12.0, fraction: 0.20 },
    'GGT': { aminoAcid: 'Gly', aminoAcidSingle: 'G', frequency: 10.8, fraction: 0.16 },
    'GGC': { aminoAcid: 'Gly', aminoAcidSingle: 'G', frequency: 22.2, fraction: 0.34 },  // ← preferido
    'GGA': { aminoAcid: 'Gly', aminoAcidSingle: 'G', frequency: 16.5, fraction: 0.25 },
    'GGG': { aminoAcid: 'Gly', aminoAcidSingle: 'G', frequency: 16.5, fraction: 0.25 },
};

// ── Funciones de cálculo ───────────────────────────────────────────────

/**
 * Obtiene la tabla de codones para un organismo
 */
export function getCodonTable(organism: string): CodonTable {
    const org = organism.toLowerCase();
    if (org.includes('ecoli') || org.includes('e. coli') || org.includes('coli')) {
        return ECOLI_K12_CODON_TABLE;
    }
    if (org.includes('yeast') || org.includes('cerevisiae') || org.includes('s288c')) {
        return YEAST_S288C_CODON_TABLE;
    }
    if (org.includes('subtilis') || org.includes('bacillus')) {
        return BSUBTILIS_168_CODON_TABLE;
    }
    if (org.includes('human') || org.includes('sapiens') || org.includes('homo')) {
        return HUMAN_CODON_TABLE;
    }
    return ECOLI_K12_CODON_TABLE; // default
}

/**
 * Calcula el Codon Adaptation Index (CAI) real
 * 
 * Basado en:
 *   Sharp, P.M. & Li, W.H. (1987).
 *   "The codon adaptation index — a measure of directional synonymous 
 *    codon usage bias, and its potential applications."
 *   Nucleic Acids Research, 15(3), 1281–1295.
 *   DOI: 10.1093/nar/15.3.1281
 * 
 * CAI = exp( (1/L) × Σ ln(w_i) )
 * donde w_i = f(c_i) / max(f(c_j)) para codones sinónimos
 * L = número de codones (excluyendo Met, Trp, Stop)
 * 
 * @param dnaSequence - Secuencia de DNA codificante (CDS)
 * @param organism - Organismo para la tabla de referencia
 * @returns CAI entre 0 y 1
 */
export function calculateCAI(dnaSequence: string, organism: string): number {
    const seq = dnaSequence.toUpperCase().replace(/[^ACGT]/g, '');
    const table = getCodonTable(organism);

    // Calcular w_i (relative adaptiveness) para cada codón
    // w_i = fraction(codon) / max_fraction(synonymous_codons)
    const maxFractions = calculateMaxFractions(table);

    let sumLnW = 0;
    let L = 0;

    for (let i = 0; i + 2 < seq.length; i += 3) {
        const codon = seq.substring(i, i + 3);
        const entry = table[codon];
        if (!entry) continue;

        // Excluir Met (ATG), Trp (TGG) y Stop — tienen un solo codón
        if (entry.aminoAcidSingle === 'M' || entry.aminoAcidSingle === 'W' || entry.aminoAcidSingle === '*') {
            continue;
        }

        const maxFrac = maxFractions[entry.aminoAcidSingle];
        if (!maxFrac || maxFrac === 0) continue;

        const w = entry.fraction / maxFrac;
        if (w > 0) {
            sumLnW += Math.log(w);
            L++;
        }
    }

    if (L === 0) return 0;

    const cai = Math.exp(sumLnW / L);
    return Math.round(cai * 1000) / 1000;
}

/**
 * Calcula la fracción máxima para cada aminoácido (para CAI)
 */
function calculateMaxFractions(table: CodonTable): Record<string, number> {
    const maxFracs: Record<string, number> = {};
    for (const entry of Object.values(table)) {
        if (!maxFracs[entry.aminoAcidSingle] || entry.fraction > maxFracs[entry.aminoAcidSingle]) {
            maxFracs[entry.aminoAcidSingle] = entry.fraction;
        }
    }
    return maxFracs;
}

/**
 * Optimiza codones de una secuencia de DNA para un organismo dado
 * Reemplaza cada codón por el sinónimo más frecuente en el organismo objetivo
 * 
 * @returns Secuencia optimizada y estadísticas
 */
export function optimizeCodons(
    dnaSequence: string,
    organism: string
): { optimized: string; originalCAI: number; optimizedCAI: number; changedCodons: number; totalCodons: number } {
    const seq = dnaSequence.toUpperCase().replace(/[^ACGT]/g, '');
    const table = getCodonTable(organism);

    // Crear mapa de aminoácido → codón más frecuente
    const bestCodons: Record<string, string> = {};
    for (const [codon, entry] of Object.entries(table)) {
        const aa = entry.aminoAcidSingle;
        if (!bestCodons[aa] || entry.fraction > (table[bestCodons[aa]]?.fraction || 0)) {
            bestCodons[aa] = codon;
        }
    }

    let optimized = '';
    let changed = 0;
    let total = 0;

    for (let i = 0; i + 2 < seq.length; i += 3) {
        const codon = seq.substring(i, i + 3);
        const entry = table[codon];
        total++;

        if (entry) {
            const best = bestCodons[entry.aminoAcidSingle];
            if (best && best !== codon) {
                optimized += best;
                changed++;
            } else {
                optimized += codon;
            }
        } else {
            optimized += codon; // codón desconocido, mantener
        }
    }

    // Manejar bases sobrantes
    const remainder = seq.length % 3;
    if (remainder > 0) {
        optimized += seq.substring(seq.length - remainder);
    }

    return {
        optimized,
        originalCAI: calculateCAI(seq, organism),
        optimizedCAI: calculateCAI(optimized, organism),
        changedCodons: changed,
        totalCodons: total
    };
}

/**
 * Traduce secuencia de DNA a proteína
 */
export function translateDNA(dnaSequence: string): string {
    const seq = dnaSequence.toUpperCase().replace(/[^ACGT]/g, '');
    let protein = '';
    for (let i = 0; i + 2 < seq.length; i += 3) {
        const codon = seq.substring(i, i + 3);
        const entry = GENETIC_CODE[codon];
        if (!entry) {
            protein += 'X';
        } else if (entry.aa1 === '*') {
            break; // Stop codon
        } else {
            protein += entry.aa1;
        }
    }
    return protein;
}
