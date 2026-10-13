/**
 * SynBio-LLVM — Análisis de Proteínas Real (ProtParam Equivalent)
 * 
 * Implementación de los cálculos de ExPASy ProtParam basada en:
 * 
 * 1. Peso Molecular:
 *    - Valores estándar de NIST/UniProt para peso molecular de aminoácidos
 *    - MW = Σ(MW de residuos) - (n-1) × 18.01524 (pérdida de agua por enlace peptídico)
 * 
 * 2. Punto Isoeléctrico (pI):
 *    - Algoritmo de bisección con valores pKa de:
 *      Bjellqvist, B. et al. (1993). "Focusing in immobilized pH gradients."
 *      Electrophoresis, 14(1), 1023-1031.
 *      DOI: 10.1002/elps.11501401163
 * 
 * 3. Coeficiente de Extinción:
 *    - Pace, C.N. et al. (1995). "How to measure and predict the molar
 *      absorption coefficient of a protein."
 *      Protein Science, 4(11), 2411-2423.
 *      DOI: 10.1002/pro.5560041120
 *    - ε280 = n(Trp)×5500 + n(Tyr)×1490 + n(Cys)×125
 * 
 * 4. Índice de Inestabilidad:
 *    - Guruprasad, K., Reddy, B.V.B. & Pandit, M.W. (1990).
 *      "Correlation between stability of a protein and its dipeptide composition."
 *      Protein Engineering, 4(2), 155-161.
 *      DOI: 10.1093/protein/4.2.155
 * 
 * 5. Índice GRAVY (Grand Average of Hydropathicity):
 *    - Kyte, J. & Doolittle, R.F. (1982).
 *      "A simple method for displaying the hydropathic character of a protein."
 *      Journal of Molecular Biology, 157(1), 105-132.
 *      DOI: 10.1016/0022-2836(82)90515-0
 * 
 * 6. Índice Alifático:
 *    - Ikai, A. (1980). "Thermostability and aliphatic index of globular proteins."
 *      Journal of Biochemistry, 88(6), 1895-1898.
 */

// ── Propiedades de Aminoácidos ─────────────────────────────────────────

/**
 * Peso molecular monoisotópico de residuos de aminoácidos (Da)
 * Fuente: UniProt/NIST
 * Estos son los pesos del residuo (aminoácido - H2O)
 */
export const AMINO_ACID_MW: Record<string, number> = {
    'A': 71.03711,   // Alanina (Ala)
    'R': 156.10111,  // Arginina (Arg)
    'N': 114.04293,  // Asparagina (Asn)
    'D': 115.02694,  // Ácido aspártico (Asp)
    'C': 103.00919,  // Cisteína (Cys)
    'E': 129.04259,  // Ácido glutámico (Glu)
    'Q': 128.05858,  // Glutamina (Gln)
    'G': 57.02146,   // Glicina (Gly)
    'H': 137.05891,  // Histidina (His)
    'I': 113.08406,  // Isoleucina (Ile)
    'L': 113.08406,  // Leucina (Leu)
    'K': 128.09496,  // Lisina (Lys)
    'M': 131.04049,  // Metionina (Met)
    'F': 147.06841,  // Fenilalanina (Phe)
    'P': 97.05276,   // Prolina (Pro)
    'S': 87.03203,   // Serina (Ser)
    'T': 101.04768,  // Treonina (Thr)
    'W': 186.07931,  // Triptófano (Trp)
    'Y': 163.06333,  // Tirosina (Tyr)
    'V': 99.06841,   // Valina (Val)
};

/**
 * Peso molecular promedio de aminoácidos (Da) - para cálculos ProtParam
 * Fuente: ExPASy ProtParam (valores promedio isotópicos)
 */
export const AMINO_ACID_AVG_MW: Record<string, number> = {
    'A': 71.0788,
    'R': 156.1875,
    'N': 114.1038,
    'D': 115.0886,
    'C': 103.1388,
    'E': 129.1155,
    'Q': 128.1307,
    'G': 57.0519,
    'H': 137.1411,
    'I': 113.1594,
    'L': 113.1594,
    'K': 128.1741,
    'M': 131.1926,
    'F': 147.1766,
    'P': 97.1167,
    'S': 87.0782,
    'T': 101.1051,
    'W': 186.2132,
    'Y': 163.1760,
    'V': 99.1326,
};

/**
 * Valores pKa de Bjellqvist et al. (1993) para cálculo de pI
 * Usados por ExPASy ProtParam
 */
export const PKA_VALUES = {
    // N-terminal
    nTerminal: {
        'A': 7.59, 'M': 7.00, 'S': 6.93, 'P': 8.36, 'T': 6.82,
        'V': 7.44, 'E': 7.70, 'G': 7.50, 'default': 7.70
    } as Record<string, number>,
    // C-terminal  
    cTerminal: {
        'D': 4.55, 'E': 4.75, 'default': 3.55
    } as Record<string, number>,
    // Cadenas laterales (grupos ionizables)
    sideChain: {
        'D': 3.90,   // Asp (ácido)
        'E': 4.07,   // Glu (ácido)
        'H': 6.04,   // His (básico)
        'C': 8.28,   // Cys (ácido débil)
        'Y': 10.46,  // Tyr (ácido débil)
        'K': 10.54,  // Lys (básico)
        'R': 12.48,  // Arg (básico)
    } as Record<string, number>,
};

/**
 * Escala de hidropatía de Kyte & Doolittle (1982)
 * J. Mol. Biol. 157:105-132
 * Valores positivos = hidrofóbico, negativos = hidrofílico
 */
export const KYTE_DOOLITTLE_HYDROPHOBICITY: Record<string, number> = {
    'A':  1.800,  // Ala
    'R': -4.500,  // Arg
    'N': -3.500,  // Asn
    'D': -3.500,  // Asp
    'C':  2.500,  // Cys
    'E': -3.500,  // Glu
    'Q': -3.500,  // Gln
    'G': -0.400,  // Gly
    'H': -3.200,  // His
    'I':  4.500,  // Ile (más hidrofóbico)
    'L':  3.800,  // Leu
    'K': -3.900,  // Lys
    'M':  1.900,  // Met
    'F':  2.800,  // Phe
    'P': -1.600,  // Pro
    'S': -0.800,  // Ser
    'T': -0.700,  // Thr
    'W': -0.900,  // Trp
    'Y': -1.300,  // Tyr
    'V':  4.200,  // Val
};

/**
 * Tabla DIWV de Guruprasad et al. (1990) — Índice de Inestabilidad
 * Protein Engineering 4(2):155-161
 * 
 * Valores de peso de inestabilidad para cada dipéptido (400 combinaciones)
 * Solo se incluyen los dipéptidos con valor significativo (≠ 1.0)
 * Los que no aparecen tienen valor por defecto de 1.0
 */
export const DIWV_TABLE: Record<string, number> = {
    'WW': 1.0, 'WC': 1.0, 'WM': 24.68, 'WH': 24.68, 'WY': 1.0,
    'WF': 1.0, 'WQ': 1.0, 'WN': 13.34, 'WI': 1.0, 'WR': 1.0,
    'WD': 1.0, 'WE': 1.0, 'WG': -9.37, 'WA': -14.03, 'WV': -7.49,
    'WK': 1.0, 'WP': 1.0, 'WT': -14.03, 'WS': 1.0, 'WL': 13.34,
    'CW': 24.68, 'CC': 1.0, 'CM': 33.60, 'CH': 33.60, 'CY': 1.0,
    'CF': 1.0, 'CQ': -6.54, 'CN': 1.0, 'CI': 1.0, 'CR': 1.0,
    'CD': 20.26, 'CE': 1.0, 'CG': 1.0, 'CA': 1.0, 'CV': -6.54,
    'CK': 1.0, 'CP': 20.26, 'CT': 33.60, 'CS': 1.0, 'CL': 20.26,
    'MW': 1.0, 'MC': 1.0, 'MM': -1.88, 'MH': 58.28, 'MY': 24.68,
    'MF': 1.0, 'MQ': -6.54, 'MN': 1.0, 'MI': 1.0, 'MR': -6.54,
    'MD': 1.0, 'ME': 1.0, 'MG': 1.0, 'MA': 13.34, 'MV': 1.0,
    'MK': 1.0, 'MP': 44.94, 'MT': -1.88, 'MS': 44.94, 'ML': 1.0,
    'HW': -1.88, 'HC': 1.0, 'HM': 1.0, 'HH': 1.0, 'HY': 44.94,
    'HF': -9.37, 'HQ': 1.0, 'HN': 24.68, 'HI': 44.94, 'HR': -6.54,
    'HD': 1.0, 'HE': 1.0, 'HG': -9.37, 'HA': 1.0, 'HV': -6.54,
    'HK': 24.68, 'HP': -1.88, 'HT': -6.54, 'HS': 1.0, 'HL': 1.0,
    'YW': -9.37, 'YC': 1.0, 'YM': 44.94, 'YH': 13.34, 'YY': 13.34,
    'YF': 1.0, 'YQ': 1.0, 'YN': 1.0, 'YI': 1.0, 'YR': -15.91,
    'YD': 24.68, 'YE': -6.54, 'YG': -7.49, 'YA': 24.68, 'YV': 1.0,
    'YK': 1.0, 'YP': 13.34, 'YT': -7.49, 'YS': 1.0, 'YL': 1.0,
    'FW': 1.0, 'FC': 1.0, 'FM': 1.0, 'FH': 1.0, 'FY': 33.60,
    'FF': 1.0, 'FQ': 1.0, 'FN': 1.0, 'FI': 1.0, 'FR': 1.0,
    'FD': 13.34, 'FE': 1.0, 'FG': 1.0, 'FA': 1.0, 'FV': 1.0,
    'FK': -14.03, 'FP': 20.26, 'FT': 1.0, 'FS': 1.0, 'FL': 1.0,
    'QW': 1.0, 'QC': -6.54, 'QM': 1.0, 'QH': 1.0, 'QY': -6.54,
    'QF': -6.54, 'QQ': 20.26, 'QN': 1.0, 'QI': 1.0, 'QR': 1.0,
    'QD': 20.26, 'QE': 20.26, 'QG': 1.0, 'QA': 1.0, 'QV': -6.54,
    'QK': 1.0, 'QP': 20.26, 'QT': 1.0, 'QS': 44.94, 'QL': 1.0,
    'NW': -9.37, 'NC': -1.88, 'NM': 1.0, 'NH': 1.0, 'NY': 1.0,
    'NF': -14.03, 'NQ': -6.54, 'NN': 1.0, 'NI': 44.94, 'NR': 1.0,
    'ND': 1.0, 'NE': 1.0, 'NG': -14.03, 'NA': 1.0, 'NV': 1.0,
    'NK': 24.68, 'NP': -1.88, 'NT': -7.49, 'NS': 1.0, 'NL': 1.0,
    'IW': 1.0, 'IC': 1.0, 'IM': 1.0, 'IH': 13.34, 'IY': 1.0,
    'IF': 1.0, 'IQ': 1.0, 'IN': 1.0, 'II': 1.0, 'IR': 1.0,
    'ID': 1.0, 'IE': 44.94, 'IG': 1.0, 'IA': 1.0, 'IV': -7.49,
    'IK': -7.49, 'IP': -1.88, 'IT': 1.0, 'IS': 1.0, 'IL': 20.26,
    'RW': 58.28, 'RC': 1.0, 'RM': 1.0, 'RH': 20.26, 'RY': -6.54,
    'RF': 1.0, 'RQ': 20.26, 'RN': 13.34, 'RI': 1.0, 'RR': 58.28,
    'RD': 1.0, 'RE': 1.0, 'RG': -7.49, 'RA': 1.0, 'RV': 1.0,
    'RK': 1.0, 'RP': 20.26, 'RT': 1.0, 'RS': 44.94, 'RL': 1.0,
    'DW': 1.0, 'DC': 1.0, 'DM': 1.0, 'DH': 1.0, 'DY': 1.0,
    'DF': -14.03, 'DQ': 1.0, 'DN': 1.0, 'DI': 1.0, 'DR': -6.54,
    'DD': 1.0, 'DE': 1.0, 'DG': 1.0, 'DA': 1.0, 'DV': 1.0,
    'DK': -7.49, 'DP': 1.0, 'DT': -14.03, 'DS': 20.26, 'DL': 1.0,
    'EW': -9.37, 'EC': 44.94, 'EM': 1.0, 'EH': 1.0, 'EY': 1.0,
    'EF': 1.0, 'EQ': 20.26, 'EN': 1.0, 'EI': 20.26, 'ER': 1.0,
    'ED': 20.26, 'EE': 33.60, 'EG': 1.0, 'EA': 1.0, 'EV': 1.0,
    'EK': 1.0, 'EP': 20.26, 'ET': 1.0, 'ES': 20.26, 'EL': 1.0,
    'GW': 13.34, 'GC': 1.0, 'GM': 1.0, 'GH': 1.0, 'GY': -7.49,
    'GF': 1.0, 'GQ': 1.0, 'GN': -7.49, 'GI': -7.49, 'GR': 1.0,
    'GD': 1.0, 'GE': -6.54, 'GG': 1.0, 'GA': -7.49, 'GV': 1.0,
    'GK': -7.49, 'GP': 1.0, 'GT': -7.49, 'GS': 1.0, 'GL': 1.0,
    'AW': 1.0, 'AC': 44.94, 'AM': 1.0, 'AH': -7.49, 'AY': 1.0,
    'AF': 1.0, 'AQ': 1.0, 'AN': 1.0, 'AI': 1.0, 'AR': 1.0,
    'AD': -7.49, 'AE': 1.0, 'AG': 1.0, 'AA': 1.0, 'AV': 1.0,
    'AK': 1.0, 'AP': 20.26, 'AT': 1.0, 'AS': 1.0, 'AL': 1.0,
    'VW': 1.0, 'VC': 1.0, 'VM': 1.0, 'VH': 1.0, 'VY': -6.54,
    'VF': 1.0, 'VQ': 1.0, 'VN': 1.0, 'VI': 1.0, 'VR': 1.0,
    'VD': -14.03, 'VE': 1.0, 'VG': -7.49, 'VA': 1.0, 'VV': 1.0,
    'VK': -1.88, 'VP': 20.26, 'VT': 1.0, 'VS': 1.0, 'VL': 1.0,
    'KW': 1.0, 'KC': 1.0, 'KM': 33.60, 'KH': 1.0, 'KY': 1.0,
    'KF': 1.0, 'KQ': 24.68, 'KN': 1.0, 'KI': -7.49, 'KR': 33.60,
    'KD': 1.0, 'KE': 1.0, 'KG': -7.49, 'KA': 1.0, 'KV': -7.49,
    'KK': 1.0, 'KP': -6.54, 'KT': 1.0, 'KS': 1.0, 'KL': -7.49,
    'PW': -1.88, 'PC': -6.54, 'PM': -6.54, 'PH': 1.0, 'PY': 1.0,
    'PF': 20.26, 'PQ': 20.26, 'PN': 1.0, 'PI': 1.0, 'PR': -6.54,
    'PD': -1.88, 'PE': 18.38, 'PG': 1.0, 'PA': 20.26, 'PV': 20.26,
    'PK': 1.0, 'PP': 20.26, 'PT': 1.0, 'PS': 20.26, 'PL': 1.0,
    'TW': -14.03, 'TC': 1.0, 'TM': 1.0, 'TH': 1.0, 'TY': 1.0,
    'TF': 13.34, 'TQ': -6.54, 'TN': -14.03, 'TI': 1.0, 'TR': 1.0,
    'TD': 1.0, 'TE': 20.26, 'TG': -7.49, 'TA': 1.0, 'TV': 1.0,
    'TK': 1.0, 'TP': 1.0, 'TT': 1.0, 'TS': 1.0, 'TL': 1.0,
    'SW': 1.0, 'SC': 33.60, 'SM': 1.0, 'SH': 1.0, 'SY': 1.0,
    'SF': 1.0, 'SQ': 20.26, 'SN': 1.0, 'SI': 1.0, 'SR': 20.26,
    'SD': 1.0, 'SE': 20.26, 'SG': 1.0, 'SA': 1.0, 'SV': 1.0,
    'SK': 1.0, 'SP': 44.94, 'ST': 1.0, 'SS': 20.26, 'SL': 1.0,
    'LW': 24.68, 'LC': 1.0, 'LM': 1.0, 'LH': 1.0, 'LY': 1.0,
    'LF': 1.0, 'LQ': 33.60, 'LN': 1.0, 'LI': 1.0, 'LR': 20.26,
    'LD': 1.0, 'LE': 1.0, 'LG': 1.0, 'LA': 1.0, 'LV': 1.0,
    'LK': -7.49, 'LP': 20.26, 'LT': 1.0, 'LS': 1.0, 'LL': 1.0,
};

// ── Pesos moleculares del agua y terminales ────────────────────────────

const WATER_MW = 18.01524;  // Da - pérdida por enlace peptídico

// ── Funciones de análisis de proteínas ─────────────────────────────────

export interface ProteinAnalysisResult {
    sequence: string;
    length: number;
    molecularWeight: number;            // Da
    pI: number;                          // Punto isoeléctrico
    extinctionCoeff: number;             // M⁻¹ cm⁻¹ (todos los Cys forman cistinas)
    extinctionCoeffReduced: number;      // M⁻¹ cm⁻¹ (Cys reducidos)
    instabilityIndex: number;            // Guruprasad et al.
    isStable: boolean;                   // II < 40
    gravy: number;                       // Kyte & Doolittle
    aliphaticIndex: number;              // Ikai
    aminoAcidComposition: Record<string, { count: number; percentage: number }>;
    atomicComposition: { C: number; H: number; N: number; O: number; S: number };
    halfLifeMammalian: string;           // N-end rule
    halfLifeYeast: string;              
    halfLifeEcoli: string;              
    formula: string;
    negativelyCharged: number;           // Asp + Glu
    positivelyCharged: number;           // Arg + Lys
}

/**
 * Análisis completo de proteína — equivalente a ExPASy ProtParam
 * Implementación fiel a los algoritmos publicados
 * 
 * @param proteinSequence - Secuencia de aminoácidos (1 letra)
 * @returns Análisis completo
 */
export function analyzeProtein(proteinSequence: string): ProteinAnalysisResult {
    const seq = proteinSequence.toUpperCase().replace(/[^ACDEFGHIKLMNPQRSTVWY]/g, '');
    
    return {
        sequence: seq,
        length: seq.length,
        molecularWeight: calculateMolecularWeight(seq),
        pI: calculateIsoelectricPoint(seq),
        extinctionCoeff: calculateExtinctionCoefficient(seq, false),
        extinctionCoeffReduced: calculateExtinctionCoefficient(seq, true),
        instabilityIndex: calculateInstabilityIndex(seq),
        isStable: calculateInstabilityIndex(seq) < 40,
        gravy: calculateGRAVY(seq),
        aliphaticIndex: calculateAliphaticIndex(seq),
        aminoAcidComposition: calculateAminoAcidComposition(seq),
        atomicComposition: calculateAtomicComposition(seq),
        halfLifeMammalian: predictHalfLife(seq, 'mammalian'),
        halfLifeYeast: predictHalfLife(seq, 'yeast'),
        halfLifeEcoli: predictHalfLife(seq, 'ecoli'),
        formula: generateFormula(seq),
        negativelyCharged: countAA(seq, 'D') + countAA(seq, 'E'),
        positivelyCharged: countAA(seq, 'R') + countAA(seq, 'K'),
    };
}

/**
 * Peso molecular de proteína
 * MW = Σ(MW_residuo) + MW_agua (terminal)
 * (Se suma agua porque los residuos ya tienen agua descontada excepto los terminales)
 * 
 * ExPASy usa los pesos promedio (no monoisotópicos) para ProtParam
 */
export function calculateMolecularWeight(seq: string): number {
    let mw = WATER_MW; // agua del extremo
    for (const aa of seq) {
        const w = AMINO_ACID_AVG_MW[aa];
        if (w) mw += w;
    }
    return Math.round(mw * 100) / 100;
}

/**
 * Punto Isoeléctrico (pI) usando el algoritmo de bisección
 * con valores pKa de Bjellqvist et al. (1993)
 * 
 * El pI es el pH al cual la carga neta de la proteína es cero
 * Se calcula iterativamente con bisección entre pH 0 y pH 14
 */
export function calculateIsoelectricPoint(seq: string): number {
    let pH_low = 0.0;
    let pH_high = 14.0;
    const precision = 0.001;

    while (pH_high - pH_low > precision) {
        const pH_mid = (pH_low + pH_high) / 2.0;
        const charge = calculateChargeAtPH(seq, pH_mid);
        if (charge > 0) {
            pH_low = pH_mid;
        } else {
            pH_high = pH_mid;
        }
    }

    return Math.round(((pH_low + pH_high) / 2.0) * 100) / 100;
}

/**
 * Calcula la carga neta a un pH dado usando Henderson-Hasselbalch
 */
function calculateChargeAtPH(seq: string, pH: number): number {
    let charge = 0.0;

    // Contribución del N-terminal
    const nTermAA = seq[0] || '';
    const nTermPKa = PKA_VALUES.nTerminal[nTermAA] || PKA_VALUES.nTerminal['default'];
    charge += 1.0 / (1.0 + Math.pow(10, pH - nTermPKa));         // grupo amino (+)

    // Contribución del C-terminal
    const cTermAA = seq[seq.length - 1] || '';
    const cTermPKa = PKA_VALUES.cTerminal[cTermAA] || PKA_VALUES.cTerminal['default'];
    charge -= 1.0 / (1.0 + Math.pow(10, cTermPKa - pH));         // grupo carboxilo (-)

    // Cadenas laterales ácidas (contribuyen carga negativa)
    for (const acidAA of ['D', 'E', 'C', 'Y']) {
        const count = countAA(seq, acidAA);
        if (count > 0) {
            const pKa = PKA_VALUES.sideChain[acidAA];
            charge -= count / (1.0 + Math.pow(10, pKa - pH));
        }
    }

    // Cadenas laterales básicas (contribuyen carga positiva)
    for (const basicAA of ['H', 'K', 'R']) {
        const count = countAA(seq, basicAA);
        if (count > 0) {
            const pKa = PKA_VALUES.sideChain[basicAA];
            charge += count / (1.0 + Math.pow(10, pH - pKa));
        }
    }

    return charge;
}

/**
 * Coeficiente de extinción molar a 280 nm
 * 
 * Pace et al. (1995) Protein Science 4:2411-2423
 * 
 * ε(280) = nTrp × 5500 + nTyr × 1490 + nCystine × 125
 * 
 * @param seq - Secuencia de proteína
 * @param reduced - true si las cisteínas están reducidas (sin puentes disulfuro)
 * @returns ε en M⁻¹cm⁻¹
 */
export function calculateExtinctionCoefficient(seq: string, reduced: boolean = false): number {
    const nTrp = countAA(seq, 'W');
    const nTyr = countAA(seq, 'Y');
    const nCys = countAA(seq, 'C');

    // ε = 5500×nTrp + 1490×nTyr + 125×nCystine
    // Una cistina requiere 2 cisteínas
    const nCystine = reduced ? 0 : Math.floor(nCys / 2);

    return nTrp * 5500 + nTyr * 1490 + nCystine * 125;
}

/**
 * Índice de Inestabilidad
 * 
 * Guruprasad et al. (1990) Protein Eng. 4:155-161
 * 
 * II = (10/L) × Σ DIWV(x_i, x_{i+1})
 * 
 * Proteínas con II < 40 se predicen como estables
 * Proteínas con II ≥ 40 se predicen como inestables
 */
export function calculateInstabilityIndex(seq: string): number {
    if (seq.length < 2) return 0;

    let sum = 0;
    for (let i = 0; i < seq.length - 1; i++) {
        const dipeptide = seq[i] + seq[i + 1];
        const weight = DIWV_TABLE[dipeptide];
        if (weight !== undefined) {
            sum += weight;
        } else {
            sum += 1.0; // valor por defecto
        }
    }

    const ii = (10.0 / seq.length) * sum;
    return Math.round(ii * 100) / 100;
}

/**
 * GRAVY - Grand Average of Hydropathicity
 * 
 * Kyte & Doolittle (1982) J. Mol. Biol. 157:105-132
 * 
 * GRAVY = (1/L) × Σ H(x_i)
 * donde H es el valor de hidropatía de Kyte-Doolittle
 * 
 * GRAVY positivo: proteína hidrofóbica (posible proteína de membrana)
 * GRAVY negativo: proteína hidrofílica (probablemente soluble)
 */
export function calculateGRAVY(seq: string): number {
    if (seq.length === 0) return 0;
    let sum = 0;
    for (const aa of seq) {
        sum += KYTE_DOOLITTLE_HYDROPHOBICITY[aa] || 0;
    }
    return Math.round((sum / seq.length) * 1000) / 1000;
}

/**
 * Índice Alifático
 * 
 * Ikai (1980) J. Biochem. 88:1895-1898
 * 
 * AI = X(Ala) + a×X(Val) + b×X(Ile) + b×X(Leu)
 * 
 * donde X(aa) = mol% del aminoácido
 * a = 2.9 (para Val)
 * b = 3.9 (para Ile y Leu)
 * 
 * Un AI alto indica termoestabilidad
 */
export function calculateAliphaticIndex(seq: string): number {
    if (seq.length === 0) return 0;
    const n = seq.length;
    const xAla = (countAA(seq, 'A') / n) * 100;
    const xVal = (countAA(seq, 'V') / n) * 100;
    const xIle = (countAA(seq, 'I') / n) * 100;
    const xLeu = (countAA(seq, 'L') / n) * 100;

    const ai = xAla + 2.9 * xVal + 3.9 * (xIle + xLeu);
    return Math.round(ai * 100) / 100;
}

/**
 * Composición de aminoácidos
 */
export function calculateAminoAcidComposition(seq: string): Record<string, { count: number; percentage: number }> {
    const comp: Record<string, { count: number; percentage: number }> = {};
    const aas = 'ACDEFGHIKLMNPQRSTVWY';
    for (const aa of aas) {
        const count = countAA(seq, aa);
        comp[aa] = {
            count,
            percentage: Math.round((count / seq.length) * 10000) / 100
        };
    }
    return comp;
}

/**
 * Composición atómica de una proteína
 * Basada en la fórmula química empírica de cada residuo de aminoácido
 * Fuente: Lehninger Principles of Biochemistry, 7th Ed.
 */
const AMINO_ACID_ATOMS: Record<string, { C: number; H: number; N: number; O: number; S: number }> = {
    'A': { C: 3, H: 7, N: 1, O: 2, S: 0 },
    'R': { C: 6, H: 14, N: 4, O: 2, S: 0 },
    'N': { C: 4, H: 8, N: 2, O: 3, S: 0 },
    'D': { C: 4, H: 7, N: 1, O: 4, S: 0 },
    'C': { C: 3, H: 7, N: 1, O: 2, S: 1 },
    'E': { C: 5, H: 9, N: 1, O: 4, S: 0 },
    'Q': { C: 5, H: 10, N: 2, O: 3, S: 0 },
    'G': { C: 2, H: 5, N: 1, O: 2, S: 0 },
    'H': { C: 6, H: 9, N: 3, O: 2, S: 0 },
    'I': { C: 6, H: 13, N: 1, O: 2, S: 0 },
    'L': { C: 6, H: 13, N: 1, O: 2, S: 0 },
    'K': { C: 6, H: 14, N: 2, O: 2, S: 0 },
    'M': { C: 5, H: 11, N: 1, O: 2, S: 1 },
    'F': { C: 9, H: 11, N: 1, O: 2, S: 0 },
    'P': { C: 5, H: 9, N: 1, O: 2, S: 0 },
    'S': { C: 3, H: 7, N: 1, O: 3, S: 0 },
    'T': { C: 4, H: 9, N: 1, O: 3, S: 0 },
    'W': { C: 11, H: 12, N: 2, O: 2, S: 0 },
    'Y': { C: 9, H: 11, N: 1, O: 3, S: 0 },
    'V': { C: 5, H: 11, N: 1, O: 2, S: 0 },
};

export function calculateAtomicComposition(seq: string): { C: number; H: number; N: number; O: number; S: number } {
    const atoms = { C: 0, H: 0, N: 0, O: 0, S: 0 };
    for (const aa of seq) {
        const a = AMINO_ACID_ATOMS[aa];
        if (a) {
            atoms.C += a.C;
            atoms.H += a.H;
            atoms.N += a.N;
            atoms.O += a.O;
            atoms.S += a.S;
        }
    }
    // Restar agua por cada enlace peptídico (n-1 H2O)
    const peptideBonds = Math.max(0, seq.length - 1);
    atoms.H -= 2 * peptideBonds;
    atoms.O -= peptideBonds;

    return atoms;
}

export function generateFormula(seq: string): string {
    const a = calculateAtomicComposition(seq);
    let formula = '';
    if (a.C > 0) formula += `C${a.C}`;
    if (a.H > 0) formula += `H${a.H}`;
    if (a.N > 0) formula += `N${a.N}`;
    if (a.O > 0) formula += `O${a.O}`;
    if (a.S > 0) formula += `S${a.S}`;
    return formula;
}

/**
 * Predicción de vida media basada en la N-end Rule
 * 
 * Bachmair, A., Finley, D. & Varshavsky, A. (1986).
 * "In vivo half-life of a protein is a function of its amino-terminal residue."
 * Science, 234(4773), 179-186.
 * DOI: 10.1126/science.3018930
 * 
 * Tobias, J.W. et al. (1991).
 * "The N-end rule in bacteria."
 * Science, 254(5036), 1374-1377.
 */
const N_END_RULE: Record<string, Record<string, string>> = {
    mammalian: {
        'A': '>4.4 hours', 'C': '1.2 hours', 'D': '1.1 hours', 'E': '1 hour',
        'F': '1.1 hours', 'G': '>30 hours', 'H': '3.5 hours', 'I': '20 hours',
        'K': '1.3 hours', 'L': '5.5 hours', 'M': '>30 hours', 'N': '1.4 hours',
        'P': '>20 hours', 'Q': '0.8 hours', 'R': '1 hour', 'S': '1.9 hours',
        'T': '7.2 hours', 'V': '>100 hours', 'W': '2.8 hours', 'Y': '2.8 hours',
    },
    yeast: {
        'A': '>20 hours', 'C': '>20 hours', 'D': '3 min', 'E': '30 min',
        'F': '3 min', 'G': '>20 hours', 'H': '10 min', 'I': '30 min',
        'K': '3 min', 'L': '3 min', 'M': '>20 hours', 'N': '3 min',
        'P': '>20 hours', 'Q': '10 min', 'R': '2 min', 'S': '>20 hours',
        'T': '>20 hours', 'V': '>20 hours', 'W': '3 min', 'Y': '10 min',
    },
    ecoli: {
        'A': '>10 hours', 'C': '>10 hours', 'D': '>10 hours', 'E': '>10 hours',
        'F': '2 min', 'G': '>10 hours', 'H': '>10 hours', 'I': '>10 hours',
        'K': '2 min', 'L': '2 min', 'M': '>10 hours', 'N': '>10 hours',
        'P': '>10 hours', 'Q': '>10 hours', 'R': '2 min', 'S': '>10 hours',
        'T': '>10 hours', 'V': '>10 hours', 'W': '2 min', 'Y': '2 min',
    },
};

function predictHalfLife(seq: string, organism: 'mammalian' | 'yeast' | 'ecoli'): string {
    if (seq.length === 0) return 'N/A';
    const nTermAA = seq[0];
    return N_END_RULE[organism]?.[nTermAA] || '>10 hours';
}

function countAA(seq: string, aa: string): number {
    let count = 0;
    for (const c of seq) {
        if (c === aa) count++;
    }
    return count;
}
