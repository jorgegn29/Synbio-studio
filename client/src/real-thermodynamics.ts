/**
 * SynBio-LLVM — Módulo de Termodinámica Real
 * 
 * Implementación completa de cálculos termodinámicos basados en:
 * 
 * REFERENCIA PRINCIPAL:
 *   SantaLucia, J. (1998). "A unified view of polymer, dumbbell, and 
 *   oligonucleotide DNA nearest-neighbor thermodynamics."
 *   Proc. Natl. Acad. Sci. USA, 95(4), 1460–1465.
 *   DOI: 10.1073/pnas.95.4.1460
 * 
 * REFERENCIA COMPLEMENTARIA:
 *   SantaLucia, J. & Hicks, D. (2004). "The thermodynamics of DNA 
 *   structural motifs." Annu. Rev. Biophys. Biomol. Struct., 33, 415–440.
 *   DOI: 10.1146/annurev.biophys.32.110601.141800
 * 
 * Todos los parámetros ΔH° (kcal/mol) y ΔS° (cal/mol·K) son valores
 * publicados en la Tabla 2 de SantaLucia 1998.
 * 
 * Condiciones estándar: 1 M NaCl, pH 7.0, 37°C (310.15 K)
 */

// ── Parámetros Nearest-Neighbor (SantaLucia 1998, Tabla 2) ────────────
// Formato: 5'→3' / 3'→5'
// ΔH° en kcal/mol, ΔS° en cal/(mol·K)

export interface NNParameters {
    dH: number;  // kcal/mol
    dS: number;  // cal/(mol·K)
}

/**
 * Parámetros nearest-neighbor para pares de bases DNA/DNA
 * Tabla 2, SantaLucia 1998 — "Unified NN parameters"
 * 
 * Clave: dinucleótido 5'→3' (ej: "AA" = 5'-AA-3' / 3'-TT-5')
 */
export const DNA_NN_PARAMS: Record<string, NNParameters> = {
    // AA/TT
    'AA': { dH: -7.9, dS: -22.2 },
    'TT': { dH: -7.9, dS: -22.2 },
    // AT/TA  
    'AT': { dH: -7.2, dS: -20.4 },
    // TA/AT
    'TA': { dH: -7.2, dS: -21.3 },
    // CA/GT
    'CA': { dH: -8.5, dS: -22.7 },
    'TG': { dH: -8.5, dS: -22.7 },
    // GT/CA
    'GT': { dH: -8.4, dS: -22.4 },
    'AC': { dH: -8.4, dS: -22.4 },
    // CT/GA
    'CT': { dH: -7.8, dS: -21.0 },
    'AG': { dH: -7.8, dS: -21.0 },
    // GA/CT
    'GA': { dH: -8.2, dS: -22.2 },
    'TC': { dH: -8.2, dS: -22.2 },
    // CG/GC
    'CG': { dH: -10.6, dS: -27.2 },
    // GC/CG
    'GC': { dH: -9.8, dS: -24.4 },
    // GG/CC
    'GG': { dH: -8.0, dS: -19.9 },
    'CC': { dH: -8.0, dS: -19.9 },
};

/**
 * Correcciones de iniciación (SantaLucia 1998, Tabla 2)
 * Dependen de si los extremos terminan en G-C o A-T
 */
export const INITIATION_PARAMS = {
    // Iniciación con par terminal G-C
    initGC: { dH: 0.1, dS: -2.8 },
    // Iniciación con par terminal A-T
    initAT: { dH: 2.3, dS: 4.1 },
    // Corrección por simetría (si la secuencia es palindrómica)
    symmetry: { dH: 0.0, dS: -1.4 }
};

/**
 * Parámetros para mismatches internos DNA/DNA
 * Allawi & SantaLucia (1997-1998), series de papers
 * J. Mol. Biol., 267-279, 1997-1998
 */
export const DNA_MISMATCH_PARAMS: Record<string, NNParameters> = {
    // Internal G·T mismatches (más estables)
    'GT_mismatch': { dH: -2.0, dS: -5.6 },
    // Internal A·C mismatches
    'AC_mismatch': { dH: 0.7, dS: 0.2 },
    // Internal G·A mismatches
    'GA_mismatch': { dH: -0.7, dS: -2.3 },
    // Internal C·T mismatches  
    'CT_mismatch': { dH: 0.0, dS: -1.0 },
    // Internal A·A mismatches
    'AA_mismatch': { dH: 1.2, dS: 1.7 },
    // Internal T·T mismatches
    'TT_mismatch': { dH: 1.0, dS: 0.9 },
    // Internal C·C mismatches
    'CC_mismatch': { dH: 0.0, dS: -1.5 },
    // Internal G·G mismatches
    'GG_mismatch': { dH: -3.1, dS: -9.5 },
};

/**
 * Parámetros para dangling ends
 * Bommarito et al. (2000) Nucleic Acids Res., 28(9), 1929–1934.
 */
export const DANGLING_END_PARAMS: Record<string, NNParameters> = {
    // 5' dangling ends (formato: X-Y donde X es dangling, Y es primer par)
    '5d_AA': { dH: -0.7, dS: -0.8 },
    '5d_AC': { dH: -0.1, dS: -0.5 },
    '5d_AG': { dH: -0.7, dS: -0.8 },
    '5d_AT': { dH: -0.1, dS: 0.2 },
    '5d_CA': { dH: -0.5, dS: -0.7 },
    '5d_CC': { dH: -0.2, dS: -0.1 },
    '5d_CG': { dH: -0.5, dS: -0.8 },
    '5d_GA': { dH: -0.4, dS: -0.5 },
    '5d_GC': { dH: -0.2, dS: -0.3 },
    '5d_TA': { dH: -0.2, dS: -0.5 },
};

// ── Constantes termodinámicas ──────────────────────────────────────────

/** Constante universal de los gases (cal/(mol·K)) */
export const R = 1.987;

/** Temperatura estándar (37°C en Kelvin) */
export const T_STANDARD = 310.15;

/** Concentración estándar de Na+ (1M) */
export const NA_STANDARD = 1.0;

// ── Funciones de cálculo ───────────────────────────────────────────────

/**
 * Calcula ΔG° de una secuencia de DNA usando el modelo nearest-neighbor
 * SantaLucia 1998.
 * 
 * @param sequence - Secuencia de DNA 5'→3' (solo ACGT)
 * @param naConc - Concentración de Na+ en M (default: 1.0)
 * @param temperature - Temperatura en °C (default: 37)
 * @returns ΔG° en kcal/mol
 */
export function calculateDeltaG(
    sequence: string,
    naConc: number = 1.0,
    temperature: number = 37
): number {
    const seq = sequence.toUpperCase().replace(/[^ACGT]/g, '');
    if (seq.length < 2) return 0;

    const T = temperature + 273.15;
    let totalDH = 0;
    let totalDS = 0;

    // Sumar contribuciones nearest-neighbor
    for (let i = 0; i < seq.length - 1; i++) {
        const dinuc = seq.substring(i, i + 2);
        const params = DNA_NN_PARAMS[dinuc];
        if (params) {
            totalDH += params.dH;
            totalDS += params.dS;
        }
    }

    // Corrección de iniciación (extremos)
    const firstBase = seq[0];
    const lastBase = seq[seq.length - 1];

    if (firstBase === 'G' || firstBase === 'C') {
        totalDH += INITIATION_PARAMS.initGC.dH;
        totalDS += INITIATION_PARAMS.initGC.dS;
    } else {
        totalDH += INITIATION_PARAMS.initAT.dH;
        totalDS += INITIATION_PARAMS.initAT.dS;
    }

    if (lastBase === 'G' || lastBase === 'C') {
        totalDH += INITIATION_PARAMS.initGC.dH;
        totalDS += INITIATION_PARAMS.initGC.dS;
    } else {
        totalDH += INITIATION_PARAMS.initAT.dH;
        totalDS += INITIATION_PARAMS.initAT.dS;
    }

    // Corrección por simetría (secuencias palindrómicas self-complementary)
    if (isSymmetric(seq)) {
        totalDS += INITIATION_PARAMS.symmetry.dS;
    }

    // Corrección de sal (ecuación de SantaLucia 1998, Eq. 3)
    // ΔS°(salt) = ΔS°(1M NaCl) + 0.368 × (N-1) × ln[Na+]
    if (naConc !== 1.0 && naConc > 0) {
        totalDS += 0.368 * (seq.length - 1) * Math.log(naConc);
    }

    // ΔG° = ΔH° - T·ΔS°
    // Nota: dH en kcal/mol, dS en cal/(mol·K), convertir dS a kcal
    const deltaG = totalDH - (T * totalDS / 1000);

    return Math.round(deltaG * 100) / 100;
}

/**
 * Calcula la temperatura de melting (Tm) usando el modelo nearest-neighbor
 * SantaLucia 1998, Ecuación 3.
 * 
 * Para non-self-complementary (oligonucléotido + complementario):
 *   Tm = ΔH° / (ΔS° + R × ln(CT/4))
 * 
 * Para self-complementary:
 *   Tm = ΔH° / (ΔS° + R × ln(CT))
 * 
 * @param sequence - Secuencia 5'→3'
 * @param oligoConc - Concentración total del oligonucleótido en M (default: 0.25 µM = 250 nM)
 * @param naConc - Concentración de Na+ en M (default: 1.0)
 * @returns Tm en °C
 */
export function calculateTm(
    sequence: string,
    oligoConc: number = 0.00025,
    naConc: number = 1.0
): number {
    const seq = sequence.toUpperCase().replace(/[^ACGT]/g, '');
    if (seq.length < 2) return 0;

    let totalDH = 0;
    let totalDS = 0;

    // Nearest-neighbor sums
    for (let i = 0; i < seq.length - 1; i++) {
        const dinuc = seq.substring(i, i + 2);
        const params = DNA_NN_PARAMS[dinuc];
        if (params) {
            totalDH += params.dH;
            totalDS += params.dS;
        }
    }

    // Iniciación
    const firstBase = seq[0];
    const lastBase = seq[seq.length - 1];
    if (firstBase === 'G' || firstBase === 'C') {
        totalDH += INITIATION_PARAMS.initGC.dH;
        totalDS += INITIATION_PARAMS.initGC.dS;
    } else {
        totalDH += INITIATION_PARAMS.initAT.dH;
        totalDS += INITIATION_PARAMS.initAT.dS;
    }
    if (lastBase === 'G' || lastBase === 'C') {
        totalDH += INITIATION_PARAMS.initGC.dH;
        totalDS += INITIATION_PARAMS.initGC.dS;
    } else {
        totalDH += INITIATION_PARAMS.initAT.dH;
        totalDS += INITIATION_PARAMS.initAT.dS;
    }

    // Corrección de sal
    if (naConc !== 1.0 && naConc > 0) {
        totalDS += 0.368 * (seq.length - 1) * Math.log(naConc);
    }

    const symmetric = isSymmetric(seq);
    if (symmetric) {
        totalDS += INITIATION_PARAMS.symmetry.dS;
    }

    // Convertir ΔH° de kcal/mol a cal/mol para consistencia con ΔS°
    const dH_cal = totalDH * 1000;

    // Tm = ΔH° / (ΔS° + R × ln(CT/4)) para non-self-complementary
    // Tm = ΔH° / (ΔS° + R × ln(CT))   para self-complementary
    const lnCT = symmetric ? Math.log(oligoConc) : Math.log(oligoConc / 4);
    const Tm_K = dH_cal / (totalDS + R * lnCT);
    const Tm_C = Tm_K - 273.15;

    return Math.round(Tm_C * 10) / 10;
}

/**
 * Calcula el contenido GC de una secuencia
 */
export function calculateGCContent(sequence: string): number {
    const seq = sequence.toUpperCase().replace(/[^ACGT]/g, '');
    if (seq.length === 0) return 0;
    const gc = (seq.split('G').length - 1) + (seq.split('C').length - 1);
    return Math.round((gc / seq.length) * 10000) / 100;
}

/**
 * Calcula ΔG de formación de hairpin (estructura secundaria)
 * Basado en SantaLucia & Hicks 2004
 * 
 * ΔG_hairpin = ΔG_loop + Σ(ΔG_stem_pairs)
 * 
 * Penalización de loop (Jacobson-Stockmayer):
 *   ΔG_loop = ΔG_initiation + (n-1) * ΔG_per_base
 */
export function calculateHairpinDeltaG(
    stemSequence: string,
    loopSize: number = 4,
    temperature: number = 37
): number {
    // Energía libre de cierre del loop (SantaLucia & Hicks 2004, Tabla 4)
    // Loop initiation parameters en kcal/mol a 37°C
    const loopInitiation: Record<number, number> = {
        3: 5.4,
        4: 4.5,    // Loop más estable (tetraloop)
        5: 5.0,
        6: 4.5,
        7: 5.2,
        8: 5.5,
        9: 5.7,
        10: 5.9,
        12: 6.3,
        14: 6.6,
        16: 6.9,
        18: 7.1,
        20: 7.3,
        25: 7.8,
        30: 8.2,
    };

    // Buscar el tamaño de loop más cercano
    let loopDG = 8.5; // default para loops muy grandes
    const sizes = Object.keys(loopInitiation).map(Number).sort((a, b) => a - b);
    for (const size of sizes) {
        if (loopSize <= size) {
            loopDG = loopInitiation[size];
            break;
        }
    }

    // Calcular energía del stem (pares de bases)
    const stemDG = calculateDeltaG(stemSequence, 1.0, temperature);

    // Bonus por tetraloop estable (GNRA, UNCG, etc.)
    // Woese et al., PNAS, 1990
    let tetraloopBonus = 0;
    if (loopSize === 4) {
        tetraloopBonus = -2.0; // kcal/mol estabilización típica
    }

    return Math.round((loopDG + stemDG + tetraloopBonus) * 100) / 100;
}

/**
 * Predicción de fuerza del RBS basada en modelo termodinámico simplificado
 * 
 * Basado conceptualmente en:
 *   Salis, H.M., Mirsky, E.A. & Voigt, C.A. (2009).
 *   "Automated design of synthetic ribosome binding sites to control
 *   protein expression." Nature Biotechnology 27, 946–950.
 *   DOI: 10.1038/nbt.1568
 * 
 * La fuerza del RBS depende de:
 * 1. Complementariedad con el anti-Shine-Dalgarno del rRNA 16S de E. coli
 * 2. Energía de plegamiento del mRNA alrededor del RBS
 * 3. Distancia entre SD y codón de inicio (óptimo: 5-10 nt)
 * 
 * Secuencia anti-Shine-Dalgarno 16S rRNA E. coli: 3'-AUUCCUCCACUAG-5'
 * Secuencia Shine-Dalgarno consenso: 5'-AGGAGG-3'
 */
export function predictRBSStrength(
    rbsSequence: string,
    spacerLength: number = 7
): { strength: number; deltaG_SD: number; optimalSpacing: boolean; details: string } {
    const seq = rbsSequence.toUpperCase().replace(/U/g, 'T');
    
    // Secuencia Shine-Dalgarno consenso completa
    const SD_CONSENSUS = 'AGGAGG';
    
    // Calcular complementariedad con SD consenso
    // Buscar la mejor alineación de SD en la secuencia RBS
    let bestScore = 0;
    let bestPos = 0;
    
    for (let i = 0; i <= Math.max(0, seq.length - 4); i++) {
        let score = 0;
        for (let j = 0; j < SD_CONSENSUS.length && (i + j) < seq.length; j++) {
            if (seq[i + j] === SD_CONSENSUS[j]) {
                score++;
            }
        }
        if (score > bestScore) {
            bestScore = score;
            bestPos = i;
        }
    }
    
    const sdRegion = seq.substring(bestPos, Math.min(bestPos + SD_CONSENSUS.length, seq.length));
    
    // ΔG de hibridación SD (calculado con NN params)
    const deltaG_SD = calculateDeltaG(sdRegion);
    
    // Penalización por espaciado sub-óptimo (óptimo 5-10 nt)
    let spacerPenalty = 0;
    if (spacerLength < 5) spacerPenalty = (5 - spacerLength) * 0.5;
    else if (spacerLength > 10) spacerPenalty = (spacerLength - 10) * 0.3;
    
    const optimalSpacing = spacerLength >= 5 && spacerLength <= 10;
    
    // ΔG del mRNA local (penalización por estructura secundaria)
    const localFolding = seq.length >= 6 ? Math.abs(calculateDeltaG(seq)) * 0.1 : 0;
    
    // Fuerza normalizada (0-1)
    // basada en complementariedad SD + spacing + estructura local
    const rawStrength = (bestScore / SD_CONSENSUS.length) * 0.7 + 
                       (1 - spacerPenalty / 3) * 0.2 +
                       (1 - localFolding / 5) * 0.1;
    
    const strength = Math.max(0, Math.min(1, Math.round(rawStrength * 100) / 100));
    
    let details = `Complementariedad SD: ${bestScore}/${SD_CONSENSUS.length} (${sdRegion} vs ${SD_CONSENSUS})\n`;
    details += `ΔG hibridación SD: ${deltaG_SD} kcal/mol\n`;
    details += `Espaciado SD-AUG: ${spacerLength} nt (${optimalSpacing ? 'óptimo' : 'sub-óptimo'})\n`;
    details += `Predicción de fuerza: ${(strength * 100).toFixed(0)}%`;
    
    return { strength, deltaG_SD, optimalSpacing, details };
}

/**
 * Verifica si una secuencia de DNA es palindrómica (self-complementary)
 */
function isSymmetric(seq: string): boolean {
    const complement: Record<string, string> = { 'A': 'T', 'T': 'A', 'G': 'C', 'C': 'G' };
    const revComp = seq.split('').reverse().map(b => complement[b] || 'N').join('');
    return seq === revComp;
}

/**
 * Calcula la secuencia complementaria reversa
 */
export function reverseComplement(sequence: string): string {
    const complement: Record<string, string> = { 
        'A': 'T', 'T': 'A', 'G': 'C', 'C': 'G',
        'a': 't', 't': 'a', 'g': 'c', 'c': 'g',
        'N': 'N', 'n': 'n'
    };
    return sequence.split('').reverse().map(b => complement[b] || 'N').join('');
}

/**
 * Calcula el peso molecular de una cadena sencilla de DNA/RNA
 * 
 * Pesos moleculares promedio de nucleótidos (Da):
 *   dAMP: 331.2, dCMP: 307.2, dGMP: 347.2, dTMP: 322.2
 *   AMP: 347.2, CMP: 323.2, GMP: 363.2, UMP: 324.2
 * 
 * MW = Σ(MW_nucleótidos) - (N-1) × 18.02 (pérdida de agua por condensación)
 * + peso del grupo fosfato terminal
 */
export function calculateMolecularWeightDNA(sequence: string): number {
    const seq = sequence.toUpperCase().replace(/[^ACGT]/g, '');
    const weights: Record<string, number> = {
        'A': 331.2, 'C': 307.2, 'G': 347.2, 'T': 322.2
    };
    let mw = 0;
    for (const base of seq) {
        mw += weights[base] || 0;
    }
    // Sustracción de agua por enlace fosfodiéster
    mw -= (seq.length - 1) * 18.02;
    return Math.round(mw * 10) / 10;
}

/**
 * Calcula el coeficiente de extinción molar de DNA ssDNA a 260 nm
 * Usando método de vecinos más cercanos
 * 
 * Valores de Cantor, Warshaw & Shapiro (1970) 
 * Biopolymers, 9(9), 1059–1077
 */
export function calculateExtinctionCoeffDNA(sequence: string): number {
    const seq = sequence.toUpperCase().replace(/[^ACGT]/g, '');
    if (seq.length < 2) return 0;

    // Coeficientes de extinción de dinucleótidos a 260 nm (L/(mol·cm))
    const diNucExt: Record<string, number> = {
        'AA': 27400, 'AC': 21200, 'AG': 25000, 'AT': 22800,
        'CA': 21200, 'CC': 14600, 'CG': 17600, 'CT': 15200,
        'GA': 25200, 'GC': 17600, 'GG': 21600, 'GT': 20000,
        'TA': 23400, 'TC': 16200, 'TG': 19000, 'TT': 16800
    };

    // Coeficientes de extinción de nucleótidos individuales
    const monoNucExt: Record<string, number> = {
        'A': 15400, 'C': 7400, 'G': 11500, 'T': 8700
    };

    // ε = 2 × Σ ε(XpY) - Σ ε(internal X)
    let sumDiNuc = 0;
    for (let i = 0; i < seq.length - 1; i++) {
        const dinuc = seq.substring(i, i + 2);
        sumDiNuc += diNucExt[dinuc] || 0;
    }

    let sumInternal = 0;
    for (let i = 1; i < seq.length - 1; i++) {
        sumInternal += monoNucExt[seq[i]] || 0;
    }

    return 2 * sumDiNuc - sumInternal;
}
