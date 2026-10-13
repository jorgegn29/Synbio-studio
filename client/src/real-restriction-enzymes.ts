/**
 * SynBio-LLVM — Base de Datos Real de Enzimas de Restricción
 * 
 * Datos obtenidos de:
 * 
 * 1. REBASE - The Restriction Enzyme Database:
 *    Roberts, R.J., Vincze, T., Posfai, J. & Macelis, D. (2015).
 *    "REBASE—a database for DNA restriction and modification."
 *    Nucleic Acids Research, 43(D1), D298–D299.
 *    DOI: 10.1093/nar/gku1046
 *    http://rebase.neb.com
 * 
 * 2. New England Biolabs (NEB):
 *    https://www.neb.com/products/restriction-endonucleases
 * 
 * Formato de sitio de corte:
 *   La posición de corte se indica relativamente al sitio de reconocimiento
 *   Ej: EcoRI reconoce GAATTC, corta entre G^AATTC / CTTAA^G
 *   cutTop = 1 (corta después de la posición 1 en la cadena top: G|AATTC)
 *   cutBottom = 5 (corta después de la posición 5 en la cadena bottom: CTTAA|G)
 *   Overhang = 5' si cutTop < cutBottom
 *   Overhang = 3' si cutTop > cutBottom
 *   Blunt end si cutTop == cutBottom (o posiciones simétricas)
 * 
 * Compatibilidad de extremos:
 *   Enzimas con extremos cohesivos compatibles pueden ligarse entre sí
 *   Isoschizomers: enzimas diferentes que reconocen la misma secuencia
 *   Neoschizomers: reconocen la misma secuencia pero cortan diferente
 */

// ── Tipos ──────────────────────────────────────────────────────────────

export interface RestrictionEnzyme {
    name: string;
    recognitionSite: string;        // Secuencia de reconocimiento (IUPAC)
    cutTop: number;                  // Posición de corte cadena sense (1-based desde inicio del sitio)
    cutBottom: number;               // Posición de corte cadena antisense (1-based desde inicio del sitio)
    overhang: '5p' | '3p' | 'blunt'; // Tipo de extremo
    overhanLength: number;           // Longitud del extremo cohesivo
    overhanSequence: string;         // Secuencia del extremo generado (placeholder, depende del contexto)
    source: string;                  // Organismo fuente
    supplier: string[];              // Proveedores (NEB, Thermo, Takara, etc.)
    methylationSensitivity: string;  // Sensibilidad a metilación
    optimalTemp: number;             // Temperatura óptima (°C)
    heatInactivation: string;        // Condiciones de inactivación térmica
    bufferNEB: string;               // Buffer NEB recomendado
    isoschizomers: string[];         // Isoesquizómeros conocidos
    star: boolean;                   // ¿Muestra actividad *?
    price: string;                   // Categoría de precio (low/medium/high)
}

// ── Base de datos de enzimas de restricción ────────────────────────────
// Tipo II restriction endonucleases más utilizadas en biología sintética

export const RESTRICTION_ENZYMES: Record<string, RestrictionEnzyme> = {
    // ───── Enzimas para clonación clásica ─────

    'EcoRI': {
        name: 'EcoRI',
        recognitionSite: 'GAATTC',
        cutTop: 1,           // G^AATTC
        cutBottom: 5,        // CTTAA^G
        overhang: '5p',
        overhanLength: 4,
        overhanSequence: 'AATT',
        source: 'Escherichia coli RY13',
        supplier: ['NEB', 'Thermo Fisher', 'Takara', 'Promega'],
        methylationSensitivity: 'Blocked by EcoRI methylation (GAm6ATTC)',
        optimalTemp: 37,
        heatInactivation: '65°C for 20 min',
        bufferNEB: 'rCutsmart (formerly NEBuffer 2.1)',
        isoschizomers: ['Eco228I', 'MfeI (neoschizomer)'],
        star: true,
        price: 'low',
    },

    'BamHI': {
        name: 'BamHI',
        recognitionSite: 'GGATCC',
        cutTop: 1,           // G^GATCC
        cutBottom: 5,        // CCTAG^G
        overhang: '5p',
        overhanLength: 4,
        overhanSequence: 'GATC',
        source: 'Bacillus amyloliquefaciens H',
        supplier: ['NEB', 'Thermo Fisher', 'Takara', 'Promega'],
        methylationSensitivity: 'Blocked by dam methylation (GGm6ATCC)',
        optimalTemp: 37,
        heatInactivation: '65°C for 20 min',
        bufferNEB: 'rCutsmart',
        isoschizomers: ['AacI', 'AcaII'],
        star: true,
        price: 'low',
    },

    'HindIII': {
        name: 'HindIII',
        recognitionSite: 'AAGCTT',
        cutTop: 1,           // A^AGCTT
        cutBottom: 5,        // TTCGA^A
        overhang: '5p',
        overhanLength: 4,
        overhanSequence: 'AGCT',
        source: 'Haemophilus influenzae Rd',
        supplier: ['NEB', 'Thermo Fisher', 'Takara'],
        methylationSensitivity: 'Not sensitive to dam or dcm methylation',
        optimalTemp: 37,
        heatInactivation: '80°C for 20 min',
        bufferNEB: 'rCutsmart',
        isoschizomers: [],
        star: true,
        price: 'low',
    },

    'XbaI': {
        name: 'XbaI',
        recognitionSite: 'TCTAGA',
        cutTop: 1,           // T^CTAGA
        cutBottom: 5,        // AGATC^T
        overhang: '5p',
        overhanLength: 4,
        overhanSequence: 'CTAG',
        source: 'Xanthomonas badrii',
        supplier: ['NEB', 'Thermo Fisher', 'Takara'],
        methylationSensitivity: 'Blocked by dam methylation if overlapping',
        optimalTemp: 37,
        heatInactivation: '65°C for 20 min',
        bufferNEB: 'rCutsmart',
        isoschizomers: [],
        star: true,
        price: 'low',
    },

    'SpeI': {
        name: 'SpeI',
        recognitionSite: 'ACTAGT',
        cutTop: 1,           // A^CTAGT
        cutBottom: 5,        // TGATC^A
        overhang: '5p',
        overhanLength: 4,
        overhanSequence: 'CTAG',  // ¡Compatible con XbaI!
        source: 'Sphaerotilus sp.',
        supplier: ['NEB', 'Thermo Fisher'],
        methylationSensitivity: 'Not sensitive to dam or dcm',
        optimalTemp: 37,
        heatInactivation: '80°C for 20 min',
        bufferNEB: 'rCutsmart',
        isoschizomers: [],
        star: false,
        price: 'low',
    },

    'PstI': {
        name: 'PstI',
        recognitionSite: 'CTGCAG',
        cutTop: 5,           // CTGCA^G
        cutBottom: 1,        // G^ACGTC
        overhang: '3p',
        overhanLength: 4,
        overhanSequence: 'TGCA',
        source: 'Providencia stuartii 164',
        supplier: ['NEB', 'Thermo Fisher', 'Takara'],
        methylationSensitivity: 'Blocked by CpG methylation',
        optimalTemp: 37,
        heatInactivation: '80°C for 20 min',
        bufferNEB: 'rCutsmart',
        isoschizomers: ['BspMAI'],
        star: true,
        price: 'low',
    },

    'SalI': {
        name: 'SalI',
        recognitionSite: 'GTCGAC',
        cutTop: 1,           // G^TCGAC
        cutBottom: 5,        // CAGCT^G
        overhang: '5p',
        overhanLength: 4,
        overhanSequence: 'TCGA',
        source: 'Streptomyces albus G',
        supplier: ['NEB', 'Thermo Fisher', 'Takara'],
        methylationSensitivity: 'Not sensitive',
        optimalTemp: 37,
        heatInactivation: '65°C for 20 min',
        bufferNEB: 'rCutsmart',
        isoschizomers: [],
        star: true,
        price: 'low',
    },

    'NotI': {
        name: 'NotI',
        recognitionSite: 'GCGGCCGC',
        cutTop: 2,           // GC^GGCCGC
        cutBottom: 6,        // CGCCGG^CG
        overhang: '5p',
        overhanLength: 4,
        overhanSequence: 'GGCC',
        source: 'Nocardia otitidis-caviarum',
        supplier: ['NEB', 'Thermo Fisher', 'Takara'],
        methylationSensitivity: 'Blocked by CpG methylation',
        optimalTemp: 37,
        heatInactivation: '65°C for 20 min',
        bufferNEB: 'rCutsmart',
        isoschizomers: [],
        star: false,
        price: 'medium',
    },

    // ───── Enzimas para BioBrick Assembly (RFC10) ─────
    // EcoRI, XbaI, SpeI, PstI ya incluidas arriba

    // ───── Enzimas para Golden Gate Assembly (Type IIS) ─────

    'BsaI': {
        name: 'BsaI',
        recognitionSite: 'GGTCTC',   // Reconoce GGTCTC(1/5)
        cutTop: 7,           // GGTCTC(1)^ — corta 1 nt después del sitio
        cutBottom: 11,       // corta 5 nt después en la cadena complementaria
        overhang: '5p',
        overhanLength: 4,
        overhanSequence: 'NNNN',  // 4 nt overhang definido por secuencia flanqueante
        source: 'Bacillus stearothermophilus 6-55',
        supplier: ['NEB', 'Thermo Fisher'],
        methylationSensitivity: 'Not sensitive',
        optimalTemp: 37,
        heatInactivation: '65°C for 20 min',
        bufferNEB: 'rCutsmart',
        isoschizomers: ['Eco31I'],
        star: false,
        price: 'medium',
    },

    'BbsI': {
        name: 'BbsI',
        recognitionSite: 'GAAGAC',   // Reconoce GAAGAC(2/6)
        cutTop: 8,           // GAAGAC(2)^ — corta 2 nt después del sitio
        cutBottom: 12,
        overhang: '5p',
        overhanLength: 4,
        overhanSequence: 'NNNN',
        source: 'Undisclosed',
        supplier: ['NEB', 'Thermo Fisher'],
        methylationSensitivity: 'Not sensitive',
        optimalTemp: 37,
        heatInactivation: '65°C for 20 min',
        bufferNEB: 'NEBuffer 2.1',
        isoschizomers: ['BpiI', 'BpuAI'],
        star: false,
        price: 'medium',
    },

    'BsmBI': {
        name: 'BsmBI',
        recognitionSite: 'CGTCTC',   // Reconoce CGTCTC(1/5)
        cutTop: 7,
        cutBottom: 11,
        overhang: '5p',
        overhanLength: 4,
        overhanSequence: 'NNNN',
        source: 'Bacillus stearothermophilus',
        supplier: ['NEB'],
        methylationSensitivity: 'Not sensitive',
        optimalTemp: 55,
        heatInactivation: '80°C for 20 min',
        bufferNEB: 'NEBuffer 3.1',
        isoschizomers: ['Esp3I'],
        star: false,
        price: 'medium',
    },

    // ───── Enzimas comunes adicionales ─────

    'NcoI': {
        name: 'NcoI',
        recognitionSite: 'CCATGG',
        cutTop: 1,           // C^CATGG
        cutBottom: 5,        // GGTAC^C
        overhang: '5p',
        overhanLength: 4,
        overhanSequence: 'CATG',
        source: 'Nocardia corallina',
        supplier: ['NEB', 'Thermo Fisher', 'Takara'],
        methylationSensitivity: 'Blocked by dcm methylation',
        optimalTemp: 37,
        heatInactivation: '65°C for 20 min',
        bufferNEB: 'rCutsmart',
        isoschizomers: [],
        star: false,
        price: 'low',
    },

    'NdeI': {
        name: 'NdeI',
        recognitionSite: 'CATATG',
        cutTop: 2,           // CA^TATG
        cutBottom: 4,        // GTAT^AC
        overhang: '5p',
        overhanLength: 2,
        overhanSequence: 'TA',
        source: 'Neisseria denitrificans',
        supplier: ['NEB', 'Thermo Fisher', 'Takara'],
        methylationSensitivity: 'Blocked by dam methylation',
        optimalTemp: 37,
        heatInactivation: '65°C for 20 min',
        bufferNEB: 'rCutsmart',
        isoschizomers: [],
        star: false,
        price: 'low',
    },

    'EcoRV': {
        name: 'EcoRV',
        recognitionSite: 'GATATC',
        cutTop: 3,           // GAT^ATC
        cutBottom: 3,        // CTA^TAG
        overhang: 'blunt',
        overhanLength: 0,
        overhanSequence: '',
        source: 'Escherichia coli J62 pLG74',
        supplier: ['NEB', 'Thermo Fisher', 'Takara'],
        methylationSensitivity: 'Blocked by dam methylation (GATm6ATC)',
        optimalTemp: 37,
        heatInactivation: '80°C for 20 min',
        bufferNEB: 'rCutsmart',
        isoschizomers: [],
        star: false,
        price: 'low',
    },

    'SmaI': {
        name: 'SmaI',
        recognitionSite: 'CCCGGG',
        cutTop: 3,           // CCC^GGG
        cutBottom: 3,        // GGG^CCC
        overhang: 'blunt',
        overhanLength: 0,
        overhanSequence: '',
        source: 'Serratia marcescens Sb',
        supplier: ['NEB', 'Thermo Fisher', 'Takara'],
        methylationSensitivity: 'Blocked by CpG methylation',
        optimalTemp: 25,     // ¡Nota: 25°C, no 37°C!
        heatInactivation: '65°C for 20 min',
        bufferNEB: 'rCutsmart',
        isoschizomers: ['XmaI (neoschizomer, cuts C^CCGGG)'],
        star: true,
        price: 'low',
    },

    'KpnI': {
        name: 'KpnI',
        recognitionSite: 'GGTACC',
        cutTop: 5,           // GGTAC^C
        cutBottom: 1,        // C^CATGG
        overhang: '3p',
        overhanLength: 4,
        overhanSequence: 'GTAC',
        source: 'Klebsiella pneumoniae OK8',
        supplier: ['NEB', 'Thermo Fisher', 'Takara'],
        methylationSensitivity: 'Not affected',
        optimalTemp: 37,
        heatInactivation: '65°C for 20 min',
        bufferNEB: 'NEBuffer 1.1',
        isoschizomers: ['Acc65I (neoschizomer)'],
        star: false,
        price: 'low',
    },

    'SacI': {
        name: 'SacI',
        recognitionSite: 'GAGCTC',
        cutTop: 5,           // GAGCT^C
        cutBottom: 1,        // C^TCGAG
        overhang: '3p',
        overhanLength: 4,
        overhanSequence: 'AGCT',
        source: 'Streptomyces achromogenes',
        supplier: ['NEB', 'Thermo Fisher'],
        methylationSensitivity: 'Blocked by dcm methylation',
        optimalTemp: 37,
        heatInactivation: '65°C for 20 min',
        bufferNEB: 'rCutsmart',
        isoschizomers: ['Ecl136II'],
        star: false,
        price: 'low',
    },

    // ───── Enzimas para Gibson Assembly (linearización) ─────

    'DpnI': {
        name: 'DpnI',
        recognitionSite: 'GATC',       // Reconoce Gm6ATC (metilado)
        cutTop: 2,
        cutBottom: 2,
        overhang: 'blunt',
        overhanLength: 0,
        overhanSequence: '',
        source: 'Diplococcus pneumoniae',
        supplier: ['NEB', 'Thermo Fisher'],
        methylationSensitivity: 'Requires dam methylation (Gm6ATC)',
        optimalTemp: 37,
        heatInactivation: '80°C for 20 min',
        bufferNEB: 'rCutsmart',
        isoschizomers: [],
        star: false,
        price: 'low',
    },
};

// ── IUPAC código de bases ambiguas ─────────────────────────────────────
// Para matching de secuencias de reconocimiento

const IUPAC_MAP: Record<string, string> = {
    'A': 'A', 'C': 'C', 'G': 'G', 'T': 'T',
    'R': 'AG',  'Y': 'CT',  'S': 'GC',  'W': 'AT',
    'K': 'GT',  'M': 'AC',  'B': 'CGT', 'D': 'AGT',
    'H': 'ACT', 'V': 'ACG', 'N': 'ACGT',
};

// ── Funciones de análisis ──────────────────────────────────────────────

/**
 * Busca sitios de restricción en una secuencia de DNA
 * 
 * @param dnaSequence - Secuencia de DNA
 * @param enzymes - Lista de nombres de enzimas (o todas si no se especifica)
 * @returns Lista de sitios encontrados con posiciones
 */
export interface RestrictionSite {
    enzyme: string;
    position: number;       // 0-based en la cadena sense
    strand: '+' | '-';
    cutPositionTop: number; // posición absoluta de corte cadena top
    cutPositionBottom: number;
    recognitionSite: string;
    matchedSequence: string;
}

export function findRestrictionSites(
    dnaSequence: string,
    enzymeNames?: string[]
): RestrictionSite[] {
    const seq = dnaSequence.toUpperCase();
    const sites: RestrictionSite[] = [];
    const revComp = reverseComplement(seq);

    const enzymesToCheck = enzymeNames
        ? enzymeNames.filter(n => RESTRICTION_ENZYMES[n]).map(n => RESTRICTION_ENZYMES[n])
        : Object.values(RESTRICTION_ENZYMES);

    for (const enzyme of enzymesToCheck) {
        const pattern = buildRegexFromIUPAC(enzyme.recognitionSite);

        // Buscar en cadena sense (+)
        let match: RegExpExecArray | null;
        const regex = new RegExp(pattern, 'g');
        while ((match = regex.exec(seq)) !== null) {
            sites.push({
                enzyme: enzyme.name,
                position: match.index,
                strand: '+',
                cutPositionTop: match.index + enzyme.cutTop,
                cutPositionBottom: match.index + enzyme.cutBottom,
                recognitionSite: enzyme.recognitionSite,
                matchedSequence: match[0],
            });
            // Evitar matches solapados infinitos
            regex.lastIndex = match.index + 1;
        }

        // Buscar en cadena antisense (-) — en el complemento reverso
        // Solo si el sitio NO es palindrómico (para evitar duplicados)
        if (!isPalindromic(enzyme.recognitionSite)) {
            const regexRev = new RegExp(pattern, 'g');
            while ((match = regexRev.exec(revComp)) !== null) {
                const posInOriginal = seq.length - match.index - match[0].length;
                sites.push({
                    enzyme: enzyme.name,
                    position: posInOriginal,
                    strand: '-',
                    cutPositionTop: posInOriginal + (match[0].length - enzyme.cutBottom),
                    cutPositionBottom: posInOriginal + (match[0].length - enzyme.cutTop),
                    recognitionSite: enzyme.recognitionSite,
                    matchedSequence: match[0],
                });
                regexRev.lastIndex = match.index + 1;
            }
        }
    }

    // Ordenar por posición
    sites.sort((a, b) => a.position - b.position);
    return sites;
}

/**
 * Verifica si una secuencia de DNA es compatible con BioBrick RFC[10]
 * 
 * RFC[10] requiere que la secuencia no contenga sitios internos de:
 * EcoRI (GAATTC), XbaI (TCTAGA), SpeI (ACTAGT), PstI (CTGCAG), NotI (GCGGCCGC)
 */
export function checkBioBrickCompatibility(dnaSequence: string): {
    compatible: boolean;
    violations: RestrictionSite[];
} {
    const biobrickEnzymes = ['EcoRI', 'XbaI', 'SpeI', 'PstI', 'NotI'];
    const sites = findRestrictionSites(dnaSequence, biobrickEnzymes);
    return {
        compatible: sites.length === 0,
        violations: sites,
    };
}

/**
 * Verifica compatibilidad de extremos cohesivos entre dos enzimas
 */
export function areEndsCompatible(enzyme1: string, enzyme2: string): boolean {
    const e1 = RESTRICTION_ENZYMES[enzyme1];
    const e2 = RESTRICTION_ENZYMES[enzyme2];
    if (!e1 || !e2) return false;

    // Ambas deben generar el mismo tipo de overhang
    if (e1.overhang !== e2.overhang) return false;
    if (e1.overhang === 'blunt' && e2.overhang === 'blunt') return true;

    // Los extremos cohesivos deben ser complementarios
    return e1.overhanSequence === e2.overhanSequence;
}

/**
 * Genera mapa de restricción en formato texto
 */
export function generateRestrictionMap(
    dnaSequence: string,
    enzymeNames?: string[]
): string {
    const sites = findRestrictionSites(dnaSequence, enzymeNames);
    const lines: string[] = [];
    
    lines.push(`Mapa de Restricción — ${dnaSequence.length} bp`);
    lines.push('═'.repeat(60));
    
    if (sites.length === 0) {
        lines.push('No se encontraron sitios de restricción.');
        return lines.join('\n');
    }

    lines.push(`${sites.length} sitio(s) encontrado(s):\n`);
    
    // Agrupar por enzima
    const byEnzyme = new Map<string, RestrictionSite[]>();
    for (const site of sites) {
        if (!byEnzyme.has(site.enzyme)) {
            byEnzyme.set(site.enzyme, []);
        }
        byEnzyme.get(site.enzyme)!.push(site);
    }

    for (const [enzyme, enzSites] of byEnzyme) {
        const info = RESTRICTION_ENZYMES[enzyme];
        lines.push(`${enzyme} (${info.recognitionSite}) — ${enzSites.length} sitio(s):`);
        for (const site of enzSites) {
            lines.push(`  Posición ${site.position + 1} (cadena ${site.strand})`);
            lines.push(`    Corte: ${site.cutPositionTop}/${site.cutPositionBottom}`);
        }
        lines.push('');
    }

    return lines.join('\n');
}

// ── Utilidades ─────────────────────────────────────────────────────────

function buildRegexFromIUPAC(sequence: string): string {
    let regex = '';
    for (const base of sequence.toUpperCase()) {
        const expanded = IUPAC_MAP[base] || base;
        if (expanded.length > 1) {
            regex += `[${expanded}]`;
        } else {
            regex += expanded;
        }
    }
    return regex;
}

function isPalindromic(sequence: string): boolean {
    const rc = reverseComplement(sequence);
    return sequence.toUpperCase() === rc.toUpperCase();
}

function reverseComplement(seq: string): string {
    const complement: Record<string, string> = {
        'A': 'T', 'T': 'A', 'C': 'G', 'G': 'C',
        'R': 'Y', 'Y': 'R', 'S': 'S', 'W': 'W',
        'K': 'M', 'M': 'K', 'B': 'V', 'V': 'B',
        'D': 'H', 'H': 'D', 'N': 'N',
    };
    return seq.toUpperCase().split('').reverse().map(c => complement[c] || c).join('');
}

/**
 * Lista las enzimas disponibles con sus propiedades
 */
export function listAvailableEnzymes(): { name: string; site: string; overhang: string; temp: number }[] {
    return Object.values(RESTRICTION_ENZYMES).map(e => ({
        name: e.name,
        site: e.recognitionSite,
        overhang: e.overhang === 'blunt' ? 'Blunt' : e.overhang === '5p' ? "5' overhang" : "3' overhang",
        temp: e.optimalTemp,
    }));
}
