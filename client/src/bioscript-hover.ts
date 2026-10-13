/**
 * BioScript HoverProvider — Datos biológicos reales al pasar el ratón
 *
 * Hover sobre cualquier parte estándar (RBS, promotor, terminador, reporter,
 * proteína, chassis) muestra: secuencia, fuerza/eficiencia medida, referencia
 * bibliográfica, enlace iGEM, y contexto funcional.
 *
 * Base de datos curada del iGEM Registry, publicaciones peer-reviewed, y
 * datos medidos del Salis Lab / Voigt Lab / Endy Lab.
 *
 * Referencias clave:
 *   - iGEM Registry of Standard Biological Parts (parts.igem.org)
 *   - Salis HM et al. (2009) Nat Biotechnol 27:946-950
 *   - Mutalik VK et al. (2013) Nat Methods 10:354-360
 *   - Anderson JC et al. (2006) J Biol Eng 1:13
 *   - Lutz R & Bujard H (1997) Nucleic Acids Res 25:1203-1210
 *   - Elowitz MB & Leibler S (2000) Nature 403:335-338
 *   - Chen YJ et al. (2013) Nat Methods 10:659-664
 */

import * as vscode from 'vscode';

// ════════════════════════════════════════════════════════════════════════════
// BASE DE DATOS DE PARTES — Secuencias y datos medidos reales
// ════════════════════════════════════════════════════════════════════════════

interface PartInfo {
    type: string;
    name: string;
    description: string;
    sequence?: string;
    length?: number;
    strength?: string;
    value?: string;
    reference: string;
    igem?: string;
    notes?: string;
}

const PARTS_DATABASE: Record<string, PartInfo> = {
    // ── RBS (Ribosome Binding Sites) ─────────────────────────────────────
    'B0030': {
        type: '🔵 RBS',
        name: 'B0030',
        description: 'RBS débil — Community Collection',
        sequence: 'ATTAAAGAGGAGAAA',
        length: 15,
        strength: 'weak',
        value: '~100 au (RPU ≈ 0.07)',
        reference: 'iGEM Registry; Mutalik VK et al. (2013) Nat Methods 10:354-360',
        igem: 'http://parts.igem.org/Part:BBa_B0030',
        notes: 'Baja tasa de iniciación. Útil para expresión controlada de proteínas tóxicas.'
    },
    'B0031': {
        type: '🔵 RBS',
        name: 'B0031',
        description: 'RBS débil — Community Collection',
        sequence: 'TCACACAGGAAAG',
        length: 13,
        strength: 'weak',
        value: '~150 au (RPU ≈ 0.12)',
        reference: 'iGEM Registry; Salis HM et al. (2009) Nat Biotechnol 27:946-950',
        igem: 'http://parts.igem.org/Part:BBa_B0031',
        notes: 'Secuencia Shine-Dalgarno subóptima. Para genes de mantenimiento.'
    },
    'B0032': {
        type: '🔵 RBS',
        name: 'B0032',
        description: 'RBS medio — Anderson Collection',
        sequence: 'TCACACAGGAAAGTACTAG',
        length: 19,
        strength: 'medium',
        value: '~300 au (RPU ≈ 0.30)',
        reference: 'Anderson JC (2006); Salis HM et al. (2009) Nat Biotechnol 27:946-950',
        igem: 'http://parts.igem.org/Part:BBa_B0032',
        notes: 'Compromiso expresión/carga metabólica. Buen default para circuitos de regulación.'
    },
    'B0033': {
        type: '🔵 RBS',
        name: 'B0033',
        description: 'RBS muy débil — Community Collection',
        sequence: 'TCACACAGGACTAG',
        length: 14,
        strength: 'very weak',
        value: '~50 au (RPU ≈ 0.04)',
        reference: 'iGEM Registry',
        igem: 'http://parts.igem.org/Part:BBa_B0033',
        notes: 'RBS más débil del registro. Para expresión basal mínima.'
    },
    'B0034': {
        type: '🔵 RBS',
        name: 'B0034',
        description: 'RBS fuerte — Estándar de la comunidad iGEM',
        sequence: 'AAAGAGGAGAAA',
        length: 12,
        strength: 'strong',
        value: '~1000 au (RPU ≈ 1.00) — Referencia',
        reference: 'Elowitz MB & Leibler S (2000) Nature 403:335; Salis Lab calibration',
        igem: 'http://parts.igem.org/Part:BBa_B0034',
        notes: 'El RBS de referencia. RPU = 1.0 por definición. Secuencia canónica Shine-Dalgarno. Spacing óptimo de 6-7 nt al ATG.'
    },
    'B0035': {
        type: '🔵 RBS',
        name: 'B0035',
        description: 'RBS medio-fuerte — Community Collection',
        sequence: 'ATTAAAGAGGAGAAATACTAG',
        length: 20,
        strength: 'medium-strong',
        value: '~500 au (RPU ≈ 0.50)',
        reference: 'iGEM Registry; Mutalik VK et al. (2013)',
        igem: 'http://parts.igem.org/Part:BBa_B0035',
        notes: 'Intermedio entre B0032 y B0034. Buena opción para expresión moderada-alta.'
    },

    // ── Terminadores ─────────────────────────────────────────────────────
    'B0010': {
        type: '🔴 Terminador',
        name: 'B0010',
        description: 'Terminador T1 del rrnB de E. coli',
        sequence: 'CCAGGCATCAAATAAAACGAAAGGCTCAGTCGAAAGACTGGGCCTTTCGTTTTATCTGTTGTTTGTCGGTGAAC',
        length: 72,
        strength: 'high',
        value: 'Eficiencia: 98% (Forward), 99% (Reverse)',
        reference: 'Chen YJ et al. (2013) Nat Methods 10:659-664',
        igem: 'http://parts.igem.org/Part:BBa_B0010',
        notes: 'Terminador Rho-independiente. Estructura stem-loop estable (ΔG ≈ -11.5 kcal/mol).'
    },
    'B0011': {
        type: '🔴 Terminador',
        name: 'B0011',
        description: 'Terminador del lacZ (lacZα fragment)',
        sequence: 'AATTGTGAGCGGATAACAATTGACATTGTGAGCGGATAACAAGATACTGAG',
        length: 50,
        strength: 'medium',
        value: 'Eficiencia: 90%',
        reference: 'iGEM Registry; Chen YJ et al. (2013)',
        igem: 'http://parts.igem.org/Part:BBa_B0011',
        notes: 'Terminador moderado. Útil cuando se necesita algo de read-through controlado.'
    },
    'B0012': {
        type: '🔴 Terminador',
        name: 'B0012',
        description: 'Terminador TE del fago T7',
        sequence: 'TCACACTGGCTCACCTTCGGGTGGGCCTTTCTGCGTTTATA',
        length: 41,
        strength: 'high',
        value: 'Eficiencia: 95%',
        reference: 'Chen YJ et al. (2013) Nat Methods 10:659-664',
        igem: 'http://parts.igem.org/Part:BBa_B0012',
        notes: 'Derivado de T7. Funciona bien en contexto policistrónico.'
    },
    'B0015': {
        type: '🔴 Terminador',
        name: 'B0015',
        description: 'Terminador doble (B0010 + B0012) — Estándar iGEM',
        sequence: 'CCAGGCATCAAATAAAACGAAAGGCTCAGTCGAAAGACTGGGCCTTTCGTTTTATCTGTTGTTTGTCGGTGAACTCACACTGGCTCACCTTCGGGTGGGCCTTTCTGCGTTTATA',
        length: 112,
        strength: 'very high',
        value: 'Eficiencia: >99% (doble terminador)',
        reference: 'Elowitz & Leibler (2000); Chen YJ et al. (2013)',
        igem: 'http://parts.igem.org/Part:BBa_B0015',
        notes: 'Combinación B0010+B0012. El terminador más fiable del registro iGEM. Usado en el Repressilator original.'
    },
    'L3S2P21': {
        type: '🔴 Terminador',
        name: 'L3S2P21',
        description: 'Terminador sintético del set de Chen et al.',
        sequence: 'CTCGGTACCAAATTCCAGAAAAGAGGCCTCCCGAAAGGGGGGCCTTTTTTCGTTTTGGTCC',
        length: 60,
        strength: 'high',
        value: 'Eficiencia: 97%',
        reference: 'Chen YJ et al. (2013) Nat Methods 10:659-664',
        igem: 'http://parts.igem.org/Part:BBa_L3S2P21',
        notes: 'Diseñado computacionalmente. Alta ortogonalidad con otros terminadores.'
    },

    // ── Promotores ───────────────────────────────────────────────────────
    'pLac': {
        type: '🟢 Promotor',
        name: 'pLac (R0010)',
        description: 'Promotor lac — regulado por LacI, inducible con IPTG',
        sequence: 'CAATACGCAAACCGCCTCTCCCCGCGCGTTGGCCGATTCATTAATGCAGCTGGCACGACAGGTTTCCCGACTGGAAAGCGGGCAGTGAGCGCAACGCAATTAATGTGAGTTAGCTCACTCATTAGGCACCCCAGGCTTTACACTTTATGCTTCCGGCTCGTATGTTGTGTGGAATTGTGAGCGGATAACAATTTCACACAGG',
        length: 200,
        strength: 'medium-strong (reprimido: ~0.1 RPU, inducido con 1mM IPTG: ~5.0 RPU)',
        value: 'Ratio inducción: ~50x',
        reference: 'Lutz R & Bujard H (1997) Nucleic Acids Res 25:1203; Elowitz & Leibler (2000)',
        igem: 'http://parts.igem.org/Part:BBa_R0010',
        notes: 'Promotor híbrido. Operadores lacO1/lacO2. Reprimido por LacI tetramérico. IPTG impide unión de LacI permitiendo transcripción.'
    },
    'pTet': {
        type: '🟢 Promotor',
        name: 'pTet (R0040)',
        description: 'Promotor tet — regulado por TetR, inducible con aTc',
        sequence: 'TCCCTATCAGTGATAGAGATTGACATCCCTATCAGTGATAGAGATACTGAGCAC',
        length: 53,
        strength: 'medium-strong (reprimido: ~0.02 RPU, inducido con 100ng/ml aTc: ~4.0 RPU)',
        value: 'Ratio inducción: ~200x',
        reference: 'Lutz R & Bujard H (1997); Gardner TS et al. (2000) Nature 403:339',
        igem: 'http://parts.igem.org/Part:BBa_R0040',
        notes: 'Dos operadores tetO. Reprimido por dímero TetR. aTc (anhidrotetraciclina) libera TetR. Mayor rango dinámico que pLac.'
    },
    'pBAD': {
        type: '🟢 Promotor',
        name: 'pBAD (I0500)',
        description: 'Promotor araBAD — regulado por AraC, inducible con L-arabinosa',
        sequence: 'ACTTTTCATACTCCCGCCATTCAGAGAAGAAACCAATTGTCCATATTGCATCAGACATTGCCGTCACTGCGTCTTTTACTGGCTCTTCTCGCTAACCAAACCGGTAACCCCGCTTATTAAAAGCATTCTGTAACAAAGCGGGACCAAAGCCATGACAAAAACGCGTAACAAAAGTGTCTATAATCACGGCAGAAAAGTCCACATTGATTATTTGCACGGCGTCACACTTTGCTATGCCATAGCATTTTTATCCATAAGATTAGCGGATCCTACCTGACGCTTTTTATCGCAACTCTCTACTGTTTCTCCATACCCGTTTTTTTGGGCTAGC',
        length: 310,
        strength: 'strong (reprimido: ~0.001 RPU, inducido con 0.2% arabinosa: ~8.0 RPU)',
        value: 'Ratio inducción: ~8000x',
        reference: 'Guzman LM et al. (1995) J Bacteriol 177:4121; Schleif R (2000) Trends Genet 16:559',
        igem: 'http://parts.igem.org/Part:BBa_I0500',
        notes: 'Regulación dual por AraC: represión en ausencia, activación en presencia de arabinosa. Catabolite-sensitive (CRP).'
    },
    'pT7': {
        type: '🟢 Promotor',
        name: 'pT7',
        description: 'Promotor del bacteriófago T7 — requiere T7 RNAP',
        sequence: 'TAATACGACTCACTATAGGG',
        length: 19,
        strength: 'very strong (con T7 RNAP: ~100 RPU)',
        value: '~100 RPU con T7 RNAP (BL21(DE3))',
        reference: 'Studier FW & Moffatt BA (1986) J Mol Biol 189:113',
        igem: 'http://parts.igem.org/Part:BBa_I712074',
        notes: 'Promotor más fuerte disponible. Reconocido por T7 RNA polimerasa, NO por σ70. Solo funciona en cepas con T7 RNAP (ej: BL21-DE3).'
    },
    'pConst': {
        type: '🟢 Promotor',
        name: 'pConst (J23100)',
        description: 'Promotor constitutivo fuerte — Anderson Promoter Library',
        sequence: 'TTGACGGCTAGCTCAGTCCTAGGTACAGTGCTAGC',
        length: 35,
        strength: 'strong (constitutivo)',
        value: '~1.0 RPU (referencia Anderson)',
        reference: 'Anderson JC et al. (2006); iGEM Registry Anderson Collection',
        igem: 'http://parts.igem.org/Part:BBa_J23100',
        notes: 'El más fuerte de la librería Anderson de 20 promotores constitutivos. σ70-dependiente.'
    },
    'J23100': {
        type: '🟢 Promotor',
        name: 'J23100',
        description: 'Promotor constitutivo — el más fuerte de la Anderson Library',
        sequence: 'TTGACGGCTAGCTCAGTCCTAGGTACAGTGCTAGC',
        length: 35,
        strength: 'strong (1.00 RPU — referencia)',
        value: '1.00 RPU',
        reference: 'Anderson JC et al. (2006) J Biol Eng 1:13; Kelly JR et al. (2009)',
        igem: 'http://parts.igem.org/Part:BBa_J23100',
        notes: 'Referencia de la Anderson Promoter Library. 20 variants con fuerza de 0.03 a 1.00 RPU.'
    },
    'J23101': {
        type: '🟢 Promotor',
        name: 'J23101',
        description: 'Promotor constitutivo moderado — Anderson Library',
        sequence: 'TTTACAGCTAGCTCAGTCCTAGGTATTATGCTAGC',
        length: 35,
        strength: 'medium (0.70 RPU)',
        value: '0.70 RPU',
        reference: 'Anderson JC et al. (2006) J Biol Eng 1:13',
        igem: 'http://parts.igem.org/Part:BBa_J23101',
        notes: '70% de la fuerza del J23100. Útil para balancear expresión en circuitos.'
    },
    'J23106': {
        type: '🟢 Promotor',
        name: 'J23106',
        description: 'Promotor constitutivo medio — Anderson Library',
        sequence: 'TTTACAGCTAGCTCAGTCCTAGGGACTATGCTAGC',
        length: 35,
        strength: 'medium (0.47 RPU)',
        value: '0.47 RPU',
        reference: 'Anderson JC et al. (2006) J Biol Eng 1:13',
        igem: 'http://parts.igem.org/Part:BBa_J23106',
    },
    'J23116': {
        type: '🟢 Promotor',
        name: 'J23116',
        description: 'Promotor constitutivo débil — Anderson Library',
        sequence: 'TTGACAGCTAGCTCAGTCCTAGGGACAGTGCTAGC',
        length: 35,
        strength: 'weak (0.16 RPU)',
        value: '0.16 RPU',
        reference: 'Anderson JC et al. (2006) J Biol Eng 1:13',
        igem: 'http://parts.igem.org/Part:BBa_J23116',
    },
    'J23119': {
        type: '🟢 Promotor',
        name: 'J23119',
        description: 'Promotor constitutivo fuerte — Anderson Library (2do más fuerte)',
        sequence: 'TTGACAGCTAGCTCAGTCCTAGGTATAGTGCTAGC',
        length: 35,
        strength: 'strong (0.93 RPU)',
        value: '0.93 RPU',
        reference: 'Anderson JC et al. (2006) J Biol Eng 1:13',
        igem: 'http://parts.igem.org/Part:BBa_J23119',
    },
    'pCI': {
        type: '🟢 Promotor',
        name: 'pCI (R0051)',
        description: 'Promotor λ pR — regulado por CI (lambda repressor)',
        sequence: 'TAACACCGTGCGTGTTGACTATTTTACCTCTGGCGGTGATAATGGTTGC',
        length: 48,
        strength: 'strong (reprimido por CI: ~0.01 RPU, libre: ~3.5 RPU)',
        value: 'Ratio represión: ~350x',
        reference: 'Elowitz & Leibler (2000) Nature 403:335; Ptashne M (2004) A Genetic Switch',
        igem: 'http://parts.igem.org/Part:BBa_R0051',
        notes: 'Promotor pR del fago λ. Regulado por CI repressor (cooperatividad, n=2). Usado en el Repressilator.'
    },
    'pLux': {
        type: '🟢 Promotor',
        name: 'pLux (R0062)',
        description: 'Promotor lux — activado por LuxR+AHL (quorum sensing)',
        sequence: 'ACCTGTAGGATCGTACAGGTTTACGCAAGAAAATGGTTTGTTATAGTCGAATAAA',
        length: 54,
        strength: 'strong (con AHL: ~5.0 RPU, sin AHL: ~0.01 RPU)',
        value: 'Activado por 3OC6-HSL (AHL) + LuxR',
        reference: 'Canton B et al. (2008) Nat Biotechnol 26:787',
        igem: 'http://parts.igem.org/Part:BBa_R0062',
        notes: 'Base del sistema de quorum sensing. LuxR se activa al unir AHL y dimeriza para activar transcripción.'
    },
    'pTrc': {
        type: '🟢 Promotor',
        name: 'pTrc',
        description: 'Promotor trc — híbrido trp/lac, inducible con IPTG',
        sequence: 'TTGACAATTAATCATCCGGCTCGTATAATGTGTGG',
        length: 34,
        strength: 'strong (inducido: ~6.0 RPU)',
        value: '~6.0 RPU inducido con IPTG',
        reference: 'Brosius J et al. (1985) J Biol Chem 260:3539',
        igem: 'http://parts.igem.org/Part:BBa_J56012',
        notes: 'Híbrido entre promotores trp y lac. Más fuerte que pLac. Regulado por LacI.'
    },
    'pTac': {
        type: '🟢 Promotor',
        name: 'pTac',
        description: 'Promotor tac — híbrido trp/lac, fuerte',
        sequence: 'TTGACAATTAATCATCGGCTCGTATAATGTGTGGA',
        length: 35,
        strength: 'very strong (inducido: ~8.0 RPU)',
        value: '~8.0 RPU inducido',
        reference: 'de Boer HA et al. (1983) PNAS 80:21',
        notes: 'Similar a pTrc pero con spacing -10/-35 óptimo. Uno de los promotores más fuertes regulables.'
    },
    'pRha': {
        type: '🟢 Promotor',
        name: 'pRha',
        description: 'Promotor rhaBAD — inducible con L-rhamnosa',
        sequence: 'GATTGCGAATACCCAGCAATGGCGTCGGATGCACTGAAGCAATTTCTACTGGCGGGTGCCGATGA',
        length: 64,
        strength: 'medium (inducido: ~2.0 RPU)',
        value: '~2.0 RPU con rhamnosa',
        reference: 'Haldimann A et al. (1998) J Bacteriol 180:1277',
        notes: 'Regulación positiva por RhaR+RhaS. No afectado por catabolito represión. Buena ortogonalidad con pLac/pBAD.'
    },

    // ── Reporters / Proteínas ────────────────────────────────────────────
    'GFP': {
        type: '🟡 Reporter',
        name: 'GFP (E0040)',
        description: 'Green Fluorescent Protein — Aequorea victoria',
        sequence: 'ATGCGTAAAGGAGAAGAACTTTTCACTGGAGTTGTCCCAATTCTTGTTGAATTAGATGGTGATGTTAATGGGCACAAATTTTCTGTCAGTGGAGAGGGTGAAGGTGATGCAACATACGGAAAACTTACCCTTAAATTTATTTGCACTACTGGAAAACTACCTGTTCCATGGCCAACACTTGTCACTACTTTCGGTTATGGTGTTCAATGCTTTGCGAGATACCCAGATCATATGAAACAGCATGACTTTTTCAAGAGTGCCATGCCCGAAGGTTATGTACAGGAAAGAACTATATTTTTCAAAGATGACGGGAACTACAAGACACGTGCTGAAGTCAAGTTTGAAGGTGATACCCTTGTTAATAGAATCGAGTTAAAAGGTATTGATTTTAAAGAAGATGGAAACATTCTTGGACACAAATTGGAATACAACTATAACTCACACAATGTATACATCATGGCAGACAAACAAAAGAATGGAATCAAAGTTAACTTCAAAATTAGACACAACATTGAAGATGGAAGCGTTCAACTAGCAGACCATTATCAACAAAATACTCCAATTGGCGATGGCCCTGTCCTTTTACCAGACAACCATTACCTGTCCACACAATCTGCCCTTTCGAAAGATCCCAACGAAAAGAGAGACCACATGGTCCTTCTTGAGTTTGTAACAGCTGCTGGGATTACACATGGCATGGATGAACTATACAAATAA',
        length: 720,
        value: 'Ex/Em: 395,475/509 nm | ε = 21,000 M⁻¹cm⁻¹ | QY = 0.77',
        reference: 'Chalfie M et al. (1994) Science 263:802; Tsien RY (1998) Annu Rev Biochem',
        igem: 'http://parts.igem.org/Part:BBa_E0040',
        notes: 'GFPmut3b (S65G, S72A). Maduración: ~30 min a 37°C. El reporter más usado en biología sintética.'
    },
    'sfGFP': {
        type: '🟡 Reporter',
        name: 'sfGFP',
        description: 'Superfolder GFP — plegamiento ultra-rápido',
        length: 714,
        value: 'Ex/Em: 485/510 nm | ε = 83,300 M⁻¹cm⁻¹ | QY = 0.65 | Maduración: ~6 min',
        reference: 'Pédelacq JD et al. (2006) Nat Biotechnol 24:79',
        notes: '6 mutaciones de plegamiento sobre GFP. Mucho más brillante y estable. Preferido para cuantificación.'
    },
    'eGFP': {
        type: '🟡 Reporter',
        name: 'eGFP',
        description: 'Enhanced GFP — optimizado para mamíferos',
        length: 720,
        value: 'Ex/Em: 488/507 nm | ε = 55,900 M⁻¹cm⁻¹ | QY = 0.60',
        reference: 'Yang TT et al. (1996) J Biol Chem 271:14',
        notes: 'Mutaciones F64L, S65T. Codon-optimizado para mamíferos. Estándar en cell biology.'
    },
    'RFP': {
        type: '🟡 Reporter',
        name: 'RFP (E1010)',
        description: 'Red Fluorescent Protein (mRFP1) — Discosoma sp.',
        length: 672,
        value: 'Ex/Em: 584/607 nm | ε = 50,000 M⁻¹cm⁻¹ | QY = 0.25',
        reference: 'Campbell RE et al. (2002) PNAS 99:7877',
        igem: 'http://parts.igem.org/Part:BBa_E1010',
        notes: 'Derivado monomérico de DsRed. Maduración lenta (~1h). Para dual-color con GFP.'
    },
    'mCherry': {
        type: '🟡 Reporter',
        name: 'mCherry',
        description: 'mCherry — RFP monomérico de segunda generación',
        length: 711,
        value: 'Ex/Em: 587/610 nm | ε = 72,000 M⁻¹cm⁻¹ | QY = 0.22 | Maduración: ~15 min',
        reference: 'Shaner NC et al. (2004) Nat Biotechnol 22:1567',
        notes: 'Mejor fotostabilidad que mRFP1. Maduración rápida. El reporter rojo de elección.'
    },
    'BFP': {
        type: '🟡 Reporter',
        name: 'BFP',
        description: 'Blue Fluorescent Protein',
        length: 714,
        value: 'Ex/Em: 383/448 nm | ε = 31,000 M⁻¹cm⁻¹ | QY = 0.26',
        reference: 'Heim R & Tsien RY (1996) Curr Biol 6:178',
        notes: 'GFP Y66H. Baja brillantez, fotobleaching rápido. Considerar mTagBFP2 como alternativa.'
    },
    'YFP': {
        type: '🟡 Reporter',
        name: 'YFP',
        description: 'Yellow Fluorescent Protein',
        length: 720,
        value: 'Ex/Em: 514/527 nm | ε = 83,400 M⁻¹cm⁻¹ | QY = 0.61',
        reference: 'Nagai T et al. (2002) Nat Biotechnol 20:87',
        notes: 'GFP T203Y. Alta brillantez pero sensible a acidification y Cl⁻.'
    },
    'CFP': {
        type: '🟡 Reporter',
        name: 'CFP',
        description: 'Cyan Fluorescent Protein',
        length: 714,
        value: 'Ex/Em: 434/477 nm | ε = 32,500 M⁻¹cm⁻¹ | QY = 0.40',
        reference: 'Heim R & Tsien RY (1996) Curr Biol 6:178',
        notes: 'GFP Y66W. Para FRET con YFP. Considerar mCerulean3 como alternativa moderna.'
    },
    'mVenus': {
        type: '🟡 Reporter',
        name: 'mVenus',
        description: 'mVenus — YFP mejorado, fast-maturing',
        length: 720,
        value: 'Ex/Em: 515/528 nm | ε = 92,200 M⁻¹cm⁻¹ | QY = 0.57 | Maduración: ~20 min',
        reference: 'Nagai T et al. (2002) Nat Biotechnol 20:87',
        notes: 'Mutante F46L de Venus. Monomérico real. Excelente para cuantificación in vivo.'
    },
    'LuxAB': {
        type: '🟡 Reporter',
        name: 'LuxAB',
        description: 'Luciferasa bacteriana — Vibrio fischeri',
        length: 2040,
        value: 'Bioluminiscencia: λmax = 490 nm | No requiere excitación | Sustrato: FMNH₂ + aldehído',
        reference: 'Meighen EA (1991) Microbiol Rev 55:123',
        notes: 'Reporter bioluminiscente. No requiere luz de excitación → menos autofluorescencia. Requiere luxCDE para sustrato endógeno.'
    },

    // ── Proteínas reguladoras ────────────────────────────────────────────
    'LacI': {
        type: '⚙️ Regulador',
        name: 'LacI (C0012)',
        description: 'Lac repressor — Inhibidor alostérico del operón lac',
        length: 1083,
        value: 'KD(operador) ≈ 10⁻¹¹ M | KD(IPTG) ≈ 10⁻⁶ M | Cooperatividad: tetramérico',
        reference: 'Lewis M et al. (1996) Science 271:1247; Jacob F & Monod J (1961) J Mol Biol',
        igem: 'http://parts.igem.org/Part:BBa_C0012',
        notes: 'El paradigma de regulación genética. Tetrámero que une dos operadores simultáneamente (looping). IPTG inhibe unión a DNA.'
    },
    'TetR': {
        type: '⚙️ Regulador',
        name: 'TetR (C0040)',
        description: 'Tet repressor — dímero, regulado por tetraciclina/aTc',
        length: 624,
        value: 'KD(tetO) ≈ 10⁻¹¹ M | KD(aTc) ≈ 10⁻⁹ M | Dimérico',
        reference: 'Hillen W & Berens C (1994) Annu Rev Microbiol 48:345',
        igem: 'http://parts.igem.org/Part:BBa_C0040',
        notes: 'Dímero tipo HTH. aTc provoca cambio conformacional que libera DNA. Rango dinámico >200x. Ortogonal a LacI.'
    },
    'AraC': {
        type: '⚙️ Regulador',
        name: 'AraC (C0080)',
        description: 'Regulador ara — dual: represor sin arabinosa, activador con arabinosa',
        length: 870,
        value: 'Regulación dual | KD(arabinosa) ≈ 10⁻⁶ M',
        reference: 'Schleif R (2000) Trends Genet 16:559; Schleif R (2010) FEMS Microbiol Rev',
        igem: 'http://parts.igem.org/Part:BBa_C0080',
        notes: 'Dímero. Sin arabinosa: forma loop represivo. Con arabinosa: activa transcripción de pBAD. No inducible con glucosa (catabolite repression).'
    },
    'CI': {
        type: '⚙️ Regulador',
        name: 'CI (λ repressor, C0051)',
        description: 'Lambda CI repressor — base del switch genético λ',
        length: 714,
        value: 'KD(OR1) ≈ 5×10⁻⁹ M | cooperatividad n=2 | Switch bistable',
        reference: 'Ptashne M (2004) A Genetic Switch; Elowitz & Leibler (2000)',
        igem: 'http://parts.igem.org/Part:BBa_C0051',
        notes: 'Opera como dímero cooperativo en operadores OR1/OR2/OR3. Base del switch λ (lisogenia/lisis). Termoestable normal, termosensible en CI857.'
    },
    'LuxR': {
        type: '⚙️ Regulador',
        name: 'LuxR (C0062)',
        description: 'Receptor de AHL — quorum sensing de V. fischeri',
        length: 756,
        value: 'KD(AHL) ≈ 10⁻⁸ M | Requiere 3OC6-HSL para activación',
        reference: 'Canton B et al. (2008) Nat Biotechnol 26:787',
        igem: 'http://parts.igem.org/Part:BBa_C0062',
        notes: 'Se pliega con AHL → dimeriza → activa pLux. Sin AHL el monómero es inestable (degradación rápida).'
    },
    'Cas9': {
        type: '⚙️ Nucleasa',
        name: 'Cas9 (S. pyogenes)',
        description: 'CRISPR-associated protein 9 — nucleasa guiada por RNA',
        length: 4104,
        value: 'PAM: 5\'-NGG-3\' | Corte: dsDNA blunt-end, 3bp upstream PAM',
        reference: 'Jinek M et al. (2012) Science 337:816; Doudna JA & Charpentier E (2014) Science',
        notes: 'La nucleasa CRISPR más usada. 1368 aa, 158 kDa. Requiere sgRNA (crRNA+tracrRNA). Para knock-outs, inserciones (con donor template), CRISPRi/a.'
    },
    'dCas9': {
        type: '⚙️ Regulador (CRISPRi)',
        name: 'dCas9 (dead Cas9)',
        description: 'Cas9 catalíticamente inactivo — para CRISPRi/CRISPRa',
        length: 4104,
        value: 'Mutaciones D10A + H840A → sin actividad nucleasa | Bloqueo estérico de RNAP',
        reference: 'Qi LS et al. (2013) Cell 152:1173',
        notes: 'dCas9 bloquea transcripción por interferencia estérica (CRISPRi, represión ~100x). Fusión con VP64/p65/Rta para CRISPRa (activación).'
    },
    'CcdB': {
        type: '☠️ Toxina',
        name: 'CcdB',
        description: 'Toxina CcdB — sistema toxina-antitoxina tipo II (plásmido F)',
        length: 306,
        value: 'IC₅₀ ≈ 5 nM | Diana: DNA girasa (GyrA) | Letal en E. coli silvestre',
        reference: 'Bernard P & Couturier M (1992) J Mol Biol 226:735',
        notes: 'Envenena DNA girasa → doble-strand breaks → muerte celular. Contrarestado por CcdA (antitoxina). Usado en kill switches y selección negativa (Gateway cloning).'
    },
    'CcdA': {
        type: '🛡️ Antitoxina',
        name: 'CcdA',
        description: 'Antitoxina CcdA — neutraliza CcdB',
        length: 216,
        value: 'KD(CcdB) ≈ 10⁻⁸ M | Vida media corta (~30 min, degradación por Lon)',
        reference: 'Van Melderen L et al. (1994) Mol Microbiol 11:1151',
        notes: 'Neutraliza CcdB por contacto directo. Degradada rápidamente por proteasa Lon → la toxina se acumula si no se expresa continuamente.'
    },

    // ── Chassis / Organismos ─────────────────────────────────────────────
    'ecoli_k12': {
        type: '🦠 Chassis',
        name: 'E. coli K-12',
        description: 'Cepa de laboratorio estándar — BSL-1',
        value: 'BSL-1 | Genoma: 4.6 Mb | Tiempo de duplicación: ~20 min (LB, 37°C)',
        reference: 'Blattner FR et al. (1997) Science 277:1453',
        notes: 'La cepa de laboratorio más usada en biología sintética. No patogénica, bien caracterizada, >50,000 publicaciones.'
    },
    'ecoli_dh5alpha': {
        type: '🦠 Chassis',
        name: 'E. coli DH5α',
        description: 'Cepa de clonación — alto rendimiento de plásmidos',
        value: 'BSL-1 | recA1, endA1 | Eficiencia de transformación: ~10⁹ CFU/μg',
        reference: 'Taylor RG et al. (1993) Nucleic Acids Res 21:1677',
        notes: 'Genotipo: fhuA2 Δ(argF-lacZ)U169 phoA glnV44 Φ80Δ(lacZ)M15 gyrA96 recA1 relA1 endA1 thi-1 hsdR17. Para clonación y mantenimiento de plásmidos.'
    },
    'ecoli_bl21': {
        type: '🦠 Chassis',
        name: 'E. coli BL21(DE3)',
        description: 'Cepa de expresión — T7 RNAP integrada',
        value: 'BSL-1 | T7 RNAP bajo lacUV5 | Deficiente en Lon y OmpT proteasas',
        reference: 'Studier FW & Moffatt BA (1986) J Mol Biol 189:113',
        notes: 'Para expresión con pT7. T7 RNAP integrada en cromosoma bajo control lacUV5 (inducible con IPTG). Menos proteasas → mayor yield de proteína recombinante.'
    },
};

// ── Keywords del lenguaje BioScript ──────────────────────────────────────
const KEYWORD_DOCS: Record<string, { description: string; example: string }> = {
    'circuit': {
        description: 'Define un circuito genético — contenedor principal de unidades transcripcionales, conexiones regulatorias y sistemas de seguridad.',
        example: 'circuit MiCircuito {\n    promoter pLac;\n    rbs: B0034;\n    gene gfp: Protein = GFP;\n    terminator: B0015;\n}'
    },
    'gene': {
        description: 'Declara un gen codificante con su producto proteico.',
        example: 'gene lacI: Protein = LacI;'
    },
    'promoter': {
        description: 'Declara un promotor (regulador de transcripción). Puede ser constitutivo o regulado.',
        example: 'promoter pLac;  // Regulado por LacI, inducible con IPTG'
    },
    'rbs': {
        description: 'Sitio de unión al ribosoma (Ribosome Binding Site). Controla la tasa de traducción.',
        example: 'rbs: B0034;  // RBS fuerte, ~1000 au'
    },
    'terminator': {
        description: 'Terminador de transcripción. Detiene la RNA polimerasa con eficiencia determinada.',
        example: 'terminator: B0015;  // Doble terminador, eficiencia >99%'
    },
    'kill_switch': {
        description: 'Sistema de biocontención — mecanismo de seguridad que mata la célula bajo condiciones específicas.',
        example: 'kill_switch {\n    trigger: absence(IPTG),\n    toxin: CcdB,\n    antitoxin: CcdA,\n    delay: 2hr\n}'
    },
    'host': {
        description: 'Declara el organismo chassis donde se expresará el circuito.',
        example: 'host ecoli_k12;  // E. coli K-12, BSL-1'
    },
    'rule': {
        description: 'Define una regla lógica o constraint del circuito.',
        example: 'rule NoOverlap: gene1.promoter != gene2.promoter;'
    },
};

// ════════════════════════════════════════════════════════════════════════════
// HOVER PROVIDER
// ════════════════════════════════════════════════════════════════════════════

export class BioScriptHoverProvider implements vscode.HoverProvider {

    provideHover(
        document: vscode.TextDocument,
        position: vscode.Position,
        _token: vscode.CancellationToken
    ): vscode.ProviderResult<vscode.Hover> {
        const wordRange = document.getWordRangeAtPosition(position, /[A-Za-z_][A-Za-z0-9_]*/);
        if (!wordRange) { return null; }

        const word = document.getText(wordRange);
        const line = document.lineAt(position.line).text;

        // 1. Check parts database
        const partInfo = PARTS_DATABASE[word];
        if (partInfo) {
            return new vscode.Hover(this.buildPartHover(partInfo), wordRange);
        }

        // 2. Check keyword documentation
        const kwDoc = KEYWORD_DOCS[word];
        if (kwDoc) {
            return new vscode.Hover(this.buildKeywordHover(word, kwDoc), wordRange);
        }

        // 3. Check for inline part references (rbs: XXXX, terminator: XXXX)
        const refMatch = line.match(/(?:rbs|terminator|promoter):\s*(\w+)/);
        if (refMatch && refMatch[1] === word) {
            const refPart = PARTS_DATABASE[refMatch[1]];
            if (refPart) {
                return new vscode.Hover(this.buildPartHover(refPart), wordRange);
            }
        }

        // 4. Check for chassis/host references
        const hostMatch = line.match(/host\s+(\w+)/);
        if (hostMatch && hostMatch[1] === word) {
            const chassisInfo = PARTS_DATABASE[word];
            if (chassisInfo) {
                return new vscode.Hover(this.buildPartHover(chassisInfo), wordRange);
            }
        }

        // 5. Check for protein assignments (gene xxx: Protein = YYY)
        const protMatch = line.match(/=\s*(\w+)/);
        if (protMatch && protMatch[1] === word) {
            const protInfo = PARTS_DATABASE[word];
            if (protInfo) {
                return new vscode.Hover(this.buildPartHover(protInfo), wordRange);
            }
        }

        return null;
    }

    private buildPartHover(part: PartInfo): vscode.MarkdownString[] {
        const md = new vscode.MarkdownString();
        md.isTrusted = true;
        md.supportHtml = true;

        // Header
        md.appendMarkdown(`## ${part.type}  \`${part.name}\`\n\n`);
        md.appendMarkdown(`*${part.description}*\n\n`);

        // Data table
        md.appendMarkdown('---\n\n');

        if (part.value) {
            md.appendMarkdown(`**📊 Datos medidos:** ${part.value}\n\n`);
        }
        if (part.strength) {
            md.appendMarkdown(`**💪 Fuerza:** ${part.strength}\n\n`);
        }
        if (part.length) {
            md.appendMarkdown(`**📏 Longitud:** ${part.length} bp\n\n`);
        }

        // Sequence (truncated for long ones)
        if (part.sequence) {
            const seq = part.sequence.length > 80
                ? part.sequence.substring(0, 40) + '...' + part.sequence.substring(part.sequence.length - 40)
                : part.sequence;
            md.appendMarkdown(`**🧬 Secuencia:**\n\`\`\`\n${seq}\n\`\`\`\n\n`);
        }

        // Notes
        if (part.notes) {
            md.appendMarkdown(`**📝 Notas:** ${part.notes}\n\n`);
        }

        // Reference
        md.appendMarkdown('---\n\n');
        md.appendMarkdown(`**📚 Ref:** ${part.reference}\n\n`);

        // iGEM link
        if (part.igem) {
            md.appendMarkdown(`**🔗 iGEM:** [${part.name} en el Registry](${part.igem})\n\n`);
        }

        return [md];
    }

    private buildKeywordHover(word: string, doc: { description: string; example: string }): vscode.MarkdownString[] {
        const md = new vscode.MarkdownString();
        md.isTrusted = true;

        md.appendMarkdown(`## 🔑 \`${word}\` — BioScript keyword\n\n`);
        md.appendMarkdown(`${doc.description}\n\n`);
        md.appendMarkdown(`**Ejemplo:**\n\`\`\`bioscript\n${doc.example}\n\`\`\`\n`);

        return [md];
    }
}

// ════════════════════════════════════════════════════════════════════════════
// REGISTRATION
// ════════════════════════════════════════════════════════════════════════════

export function registerBioScriptHover(context: vscode.ExtensionContext): void {
    const provider = new BioScriptHoverProvider();
    context.subscriptions.push(
        vscode.languages.registerHoverProvider(
            { language: 'bioscript', scheme: 'file' },
            provider
        ),
        vscode.languages.registerHoverProvider(
            { language: 'bioscript', scheme: 'untitled' },
            provider
        )
    );
    console.log('🧬 SynBio-LLVM: HoverProvider registrado — datos biológicos reales en hover');
}
