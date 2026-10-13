import * as vscode from 'vscode';

/**
 * SynBio-LLVM — AI Design Assistant (Enhanced)
 * 
 * Asistente de diseño con análisis de red regulatoria, estimación de carga
 * metabólica, score card de circuito, visualización de red y recomendación
 * multi-factor de partes iGEM.
 * 
 * Refs principales:
 *  - Alon U (2007) "An Introduction to Systems Biology" — motifs de red
 *  - Nielsen AAK et al. (2016) Science 352:aac7341 — genetic logic gates
 *  - Ceroni F et al. (2015) NAR 43:7648 — metabolic burden
 *  - Kelly JR et al. (2009) J Biol Eng 3:4 — RPU
 *  - Salis HM et al. (2009) Nat Biotechnol 27:946 — RBS Calculator
 */

// ── Tipos ──────────────────────────────────────────────────────────────

interface DesignSuggestion {
    type: 'part' | 'pattern' | 'optimization' | 'warning' | 'fix';
    title: string;
    description: string;
    code?: string;
    confidence: number; // 0-1
    category: string;
    references?: string[];
}

interface DesignPattern {
    name: string;
    description: string;
    components: string[];
    template: string;
    useCase: string;
    complexity: 'basic' | 'intermediate' | 'advanced';
    reference: string;
}

interface CompatibilityIssue {
    severity: 'error' | 'warning' | 'info';
    message: string;
    line: number;
    suggestion: string;
    ruleId: string;
}

interface PartRecommendation {
    partId: string;
    name: string;
    type: string;
    score: number;
    reason: string;
    sequence?: string;
    host?: string;
    reference?: string;
}

// ── Tipos para análisis de red ─────────────────────────────────────────

interface RegulatoryEdge {
    from: string;
    to: string;
    type: 'activation' | 'repression';
    promoter?: string;
    strength?: number;
}

interface ParsedComponent {
    kind: 'promoter' | 'rbs' | 'gene' | 'terminator' | 'kill_switch';
    name: string;
    line: number;
    properties: Record<string, string>;
}

interface NetworkMotif {
    type: 'negative_feedback' | 'positive_feedback' | 'ffl_coherent' | 'ffl_incoherent' |
          'toggle_switch' | 'repressilator' | 'cascade' | 'autorepression' | 'autoactivation';
    nodes: string[];
    description: string;
    reference: string;
    dynamicBehavior: string;
}

interface CircuitTopology {
    nodes: string[];
    edges: RegulatoryEdge[];
    motifs: NetworkMotif[];
    feedbackLoops: string[][];
    components: ParsedComponent[];
}

interface ScoreCategory {
    score: number;
    max: number;
    issues: string[];
    recommendations: string[];
}

interface CircuitScoreCard {
    overall: number;
    grade: 'A' | 'B' | 'C' | 'D' | 'F';
    structure: ScoreCategory;
    safety: ScoreCategory;
    expression: ScoreCategory;
    modularity: ScoreCategory;
    predictability: ScoreCategory;
}

interface MetabolicBurdenResult {
    totalBurden: number; // arbitrary units
    category: 'low' | 'moderate' | 'high' | 'critical';
    breakdown: { gene: string; burden: number; reason: string }[];
    recommendation: string;
    reference: string;
}

// ── Base de conocimiento IA ────────────────────────────────────────────

const DESIGN_PATTERNS: DesignPattern[] = [
    {
        name: 'Toggle Switch',
        description: 'Interruptor biestable con dos estados estables mutuamente excluyentes',
        components: ['promoter_inducible', 'repressor_A', 'promoter_inducible', 'repressor_B'],
        reference: 'Gardner TS, Cantor CR & Collins JJ (2000) Nature 403:339-342',
        template: `// Toggle Switch — Gardner TS, Cantor CR & Collins JJ (2000) Nature 403:339-342
// Strength values in RPU (Relative Promoter Units, Kelly et al. 2009 J Biol Eng 3:4)
genetic_circuit toggle_switch {
    // Estado A: LacI reprime TetR
    promoter pLac_TetR (type: "inducible", inducer: "IPTG") {} // BBa_R0010
    rbs rbs_tetR (strength: 0.6) {} // BBa_B0032 ≈ 0.6 RPU (Salis et al. 2009 Nat Biotechnol 27:946)
    gene tetR (product: "TetR") {} // UniProt P04483, 207 aa
    terminator term_A (efficiency: 0.98) {} // BBa_B0015 (Chen et al. 2013 Nucleic Acids Res 41:2541)

    // Estado B: TetR reprime LacI
    promoter pTet_LacI (type: "inducible", inducer: "aTc") {} // BBa_R0040
    rbs rbs_lacI (strength: 0.6) {} // BBa_B0032
    gene lacI (product: "LacI") {} // UniProt P03023, 360 aa
    terminator term_B (efficiency: 0.98) {} // BBa_B0015
}`,
        useCase: 'Memoria celular, decisiones binarias, almacenamiento de información digital',
        complexity: 'intermediate'
    },
    {
        name: 'Repressilator',
        description: 'Oscilador sintético con tres represores en cascada cíclica',
        components: ['promoter', 'repressor', 'promoter', 'repressor', 'promoter', 'repressor'],
        reference: 'Elowitz MB & Leibler S (2000) Nature 403:335-338',
        template: `// Repressilator — Elowitz MB & Leibler S (2000) Nature 403:335-338
// Period ≈ 160 min (Table S2: α=216 proteins/cell/mRNA, n=2, K=40 molecules)
genetic_circuit repressilator {
    promoter pLac (type: "repressible", repressor: "LacI") {} // PLlac-O1
    rbs rbs_tetR (strength: 0.3) {} // Weak RBS to match original construct
    gene tetR (product: "TetR") {} // UniProt P04483
    terminator t1 (efficiency: 0.98) {} // BBa_B0015

    promoter pTet (type: "repressible", repressor: "TetR") {} // PLtet-O1
    rbs rbs_cI (strength: 0.3) {} // Matched to repressilator stoichiometry
    gene cI (product: "cI") {} // Lambda cI, UniProt P03034
    terminator t2 (efficiency: 0.98) {} // BBa_B0015

    promoter pLambda (type: "repressible", repressor: "cI") {} // PR (lambda)
    rbs rbs_lacI (strength: 0.3) {} // Balanced expression
    gene lacI (product: "LacI") {} // UniProt P03023
    terminator t3 (efficiency: 0.98) {} // BBa_B0015
}`,
        useCase: 'Expresión periódica, relojes biológicos, sincronización celular',
        complexity: 'advanced'
    },
    {
        name: 'Sensor-Reporter',
        description: 'Circuito sensor con promotor inducible acoplado a gen reportero',
        components: ['promoter_inducible', 'rbs', 'reporter_gene', 'terminator'],
        reference: 'Schleif R (2000) Trends Genet 16:559',
        template: `// Sensor-Reporter — Schleif R (2000) Trends Genet 16:559 (arabinose system)
genetic_circuit biosensor {
    promoter pSensor (type: "inducible", inducer: "arabinose") {} // BBa_I0500/pBAD
    rbs rbs_strong (strength: 1.0) {} // BBa_B0034 = 1.0 RPU (Kelly et al. 2009)
    gene gfp (product: "GFP") {} // BBa_E0040, GFPmut3b (Cormack et al. 1996 Gene 173:33)
    terminator dblTerm (efficiency: 0.98) {} // BBa_B0015 (Chen et al. 2013 NAR)
}`,
        useCase: 'Detección de analitos, biosensores ambientales, diagnóstico',
        complexity: 'basic'
    },
    {
        name: 'Feed-Forward Loop',
        description: 'Motivo regulatorio de tipo I coherente con filtrado de señal',
        components: ['promoter', 'activator', 'promoter_dual', 'target_gene'],
        reference: 'Mangan S & Alon U (2003) PNAS 100:11980',
        template: `// Feed-Forward Loop Type 1 Coherent — Mangan S & Alon U (2003) PNAS 100:11980
// C1-FFL filters transient pulses; delay ~1 generation (Shen-Orr et al. 2002 Nat Genet 31:64)
genetic_circuit ffl_coherent {
    // Regulador maestro X
    promoter pConst_X (type: "constitutive", strength: 0.5) {} // ~0.5 RPU (Anderson library mid)
    rbs rbs_X (strength: 0.6) {} // BBa_B0032 ≈ 0.6 RPU
    gene regX (product: "RegX") {} // Transcription factor
    terminator t1 (efficiency: 0.98) {} // BBa_B0015

    // Regulador intermedio Y (activado por X)
    promoter pX (type: "inducible", activator: "RegX") {}
    rbs rbs_Y (strength: 0.6) {} // BBa_B0032
    gene regY (product: "RegY") {} // Second transcription factor
    terminator t2 (efficiency: 0.98) {} // BBa_B0015

    // Gen objetivo Z (requiere X AND Y)
    promoter pXY (type: "AND_gate", inputs: ["RegX", "RegY"]) {}
    rbs rbs_Z (strength: 1.0) {} // BBa_B0034 = 1.0 RPU — strong for output
    gene targetZ (product: "GFP") {} // BBa_E0040 reporter
    terminator t3 (efficiency: 0.98) {} // BBa_B0015
}`,
        useCase: 'Filtrado de pulsos transitorios, retardo temporal, robustez',
        complexity: 'advanced'
    },
    {
        name: 'Kill Switch',
        description: 'Mecanismo de seguridad con autodestrucción condicional',
        components: ['promoter_inducible', 'toxin', 'antitoxin', 'terminator'],
        reference: 'Chan CT et al. (2016) Nat Chem Biol 12:82',
        template: `// Kill Switch — CcdB/CcdA toxin-antitoxin system (Bernard & Couturier 1992 J Mol Biol 226:735)
// Ref: Chan CT et al. (2016) Nat Chem Biol 12:82 — synthetic biocontainment
genetic_circuit kill_switch {
    // Antitoxina constitutiva (mantiene la célula viva)
    promoter pConst (type: "constitutive", strength: 0.5) {} // Anderson mid-strength
    rbs rbs_anti (strength: 1.0) {} // BBa_B0034, strong for antitoxin excess
    gene antitoxin (product: "CcdA") {} // UniProt P62553, 72 aa, DNA gyrase protector
    terminator t1 (efficiency: 0.98) {} // BBa_B0015

    // Toxina activada por pérdida de señal
    promoter pSafe (type: "inducible", inducer: "absence_of_signal") {}
    rbs rbs_tox (strength: 0.6) {} // Moderate — avoid premature killing
    gene toxin (product: "CcdB") {} // UniProt P62554, 101 aa, gyrase poison (IC50 ≈ 10 nM)
    terminator t2 (efficiency: 0.98) {} // BBa_B0015
}`,
        useCase: 'Biocontención, seguridad biológica, liberación controlada',
        complexity: 'intermediate'
    },
    {
        name: 'Inverter (NOT Gate)',
        description: 'Puerta lógica NOT que invierte la señal de entrada',
        components: ['promoter_inducible', 'repressor', 'promoter_repressible', 'output'],
        reference: 'Stanton BC et al. (2014) Nat Chem Biol 10:99',
        template: `// NOT Gate (Inverter) — Stanton BC et al. (2014) Nat Chem Biol 10:99
// Ref: Nielsen AAK et al. (2016) Science 352:aac7341 — genetic logic gates
genetic_circuit not_gate {
    // Entrada: promotor inducible controla el represor
    promoter pInput (type: "inducible", inducer: "IPTG") {} // BBa_R0010
    rbs rbs_rep (strength: 0.6) {} // BBa_B0032, moderate expression
    gene repressor (product: "CI") {} // Lambda cI (UniProt P03034), strong repressor
    terminator t1 (efficiency: 0.98) {} // BBa_B0015

    // Salida invertida
    promoter pCI (type: "repressible", repressor: "CI") {} // PR (lambda)
    rbs rbs_out (strength: 1.0) {} // BBa_B0034 = 1.0 RPU — maximize output signal
    gene output (product: "GFP") {} // BBa_E0040, GFPmut3b
    terminator t2 (efficiency: 0.98) {} // BBa_B0015
}`,
        useCase: 'Lógica digital, inversión de señal, circuitos combinacionales',
        complexity: 'basic'
    }
];

// Sequences: first 35 bp prefix from iGEM Registry (http://parts.igem.org/)
// Full sequences available via iGEM API — these are previews for autocompletion.
// RPU values from Kelly JR et al. (2009) J Biol Eng 3:4
const PART_DATABASE: PartRecommendation[] = [
    // Promotores — Anderson library (iGEM, measured by Kelly et al. 2009)
    { partId: 'BBa_J23100', name: 'Anderson Strong', type: 'promoter', score: 0, reason: '1.0 RPU', sequence: 'TTGACGGCTAGCTCAGTCCTAGGTACAGTGCTAGC' },      // 35 bp, full = 35 bp
    { partId: 'BBa_J23106', name: 'Anderson Medium', type: 'promoter', score: 0, reason: '0.47 RPU', sequence: 'TTTACGGCTAGCTCAGTCCTAGGTATAGTGCTAGC' },     // 35 bp, full = 35 bp
    { partId: 'BBa_J23118', name: 'Anderson Weak', type: 'promoter', score: 0, reason: '0.06 RPU', sequence: 'TTGACAGCTAGCTCAGTCCTAGGGATTGTGCTAGC' },       // 35 bp, full = 35 bp
    { partId: 'BBa_R0010', name: 'pLac', type: 'promoter', score: 0, reason: 'LacI-repressed', sequence: 'CAATACGCAAACCGCCTCTCCCCGCGCGTTGGCCG' },              // preview, full = 200 bp
    { partId: 'BBa_R0040', name: 'pTetR', type: 'promoter', score: 0, reason: 'TetR-repressed', sequence: 'TCCCTATCAGTGATAGAGATTGACATCCCTATCAG' },             // preview, full = 54 bp
    { partId: 'BBa_I0500', name: 'pBad', type: 'promoter', score: 0, reason: 'AraC-activated', sequence: 'ACTTTTCATACTCCCGCCATTCAGAGAAGAAACCAATTG' },           // preview, full = 1200 bp
    // RBS — Salis HM et al. (2009) Nat Biotechnol 27:946
    { partId: 'BBa_B0034', name: 'RBS Strong (1.0 RPU)', type: 'rbs', score: 0, reason: '1.0 RPU reference', sequence: 'AAAGAGGAGAAA' },         // 12 bp, consensus Shine-Dalgarno
    { partId: 'BBa_B0032', name: 'RBS Medium (0.3 RPU)', type: 'rbs', score: 0, reason: '0.3 RPU', sequence: 'TCACACAGGAAAG' },                   // 13 bp
    { partId: 'BBa_B0031', name: 'RBS Weak (0.07 RPU)', type: 'rbs', score: 0, reason: '0.07 RPU', sequence: 'TCACACAGGAAACCTACT' },               // 17 bp
    // Terminadores — Chen YJ et al. (2013) Nucleic Acids Res 41:2541
    { partId: 'BBa_B0010', name: 'T1 (rrnB T1)', type: 'terminator', score: 0, reason: 'eff=0.97', sequence: 'CCAGGCATCAAATAAAACGAAAGGCTCAGTCGAAAGACTGGGCCTTTCGTTTTATCTGTTGTTTG' }, // 64 bp
    { partId: 'BBa_B0012', name: 'TE (rrnC)', type: 'terminator', score: 0, reason: 'eff=0.95', sequence: 'TCACACTGGCTCACCTTCGGGTGGGCCTTTCTGCGTTTATA' },                             // 41 bp
    { partId: 'BBa_B0015', name: 'B0010+B0012 double', type: 'terminator', score: 0, reason: 'eff=0.984', sequence: 'CCAGGCATCAAATAAAACGAAAGGCTCAGTCGAAAG' },                          // preview, full = 129 bp
    // Reporteros fluorescentes — secuencias: primeros 36 bp (preview)
    { partId: 'BBa_E0040', name: 'GFPmut3b', type: 'gene', score: 0, reason: 'Cormack 1996 Gene 173:33', sequence: 'ATGAGTAAAGGAGAAGAACTTTTCACTGGAGTTGTC' },     // preview, full = 720 bp
    { partId: 'BBa_E1010', name: 'mRFP1', type: 'gene', score: 0, reason: 'Campbell 2002 PNAS 99:7877', sequence: 'ATGGCGAGTAGCGAAGACGTTATCAAAGAGTTCATG' },       // preview, full = 672 bp
    { partId: 'BBa_K592009', name: 'YFP (Venus)', type: 'gene', score: 0, reason: 'Nagai 2002 Nat Biotechnol 20:87', sequence: 'ATGGTGAGCAAGGGCGAGGAGCTGTTCACCGGGGTG' }, // preview, full = 720 bp
    { partId: 'BBa_K592100', name: 'mTagBFP', type: 'gene', score: 0, reason: 'Subach 2008 Chem Biol 15:1116', sequence: 'ATGAGCGAGCTGATTAAGGAGAACATGCACATGAAG' }, // preview, full = 714 bp
];

// ── Reglas de compatibilidad expandidas ─────────────────────────────────

interface CompatibilityRule {
    id: string;
    name: string;
    check: (text: string, lines: string[]) => CompatibilityIssue[];
}

const COMPATIBILITY_RULES: CompatibilityRule[] = [
    {
        // Ceroni F et al. (2015) Nucleic Acids Res 43:7648 — metabolic burden from strong expression
        id: 'COMPAT-001',
        name: 'Metabolic burden from strong expression',
        check: (text, lines) => {
            const issues: CompatibilityIssue[] = [];
            for (let i = 0; i < lines.length; i++) {
                const strongProm = lines[i].match(/promoter\s+\w+.*strength:\s*(0\.[89]\d*|1\.0)/);
                if (strongProm) {
                    // Look for strong RBS within next 3 lines
                    for (let j = i + 1; j < Math.min(i + 4, lines.length); j++) {
                        const strongRBS = lines[j].match(/rbs\s+\w+.*strength:\s*(0\.[89]\d*|1\.0)/);
                        if (strongRBS) {
                            issues.push({
                                severity: 'warning',
                                message: `Promotor fuerte (${strongProm[1]}) + RBS fuerte (${strongRBS[1]}) en líneas ${i + 1}-${j + 1}: carga metabólica excesiva (Ceroni et al. 2015 NAR 43:7648)`,
                                line: j,
                                suggestion: 'Reduzca RBS a 0.3-0.6 RPU (BBa_B0032) para balancear expresión vs carga (Rosano & Ceccarelli 2014 Front Microbiol 5:172)',
                                ruleId: 'COMPAT-001'
                            });
                        }
                    }
                }
            }
            return issues;
        }
    },
    {
        // Chen YJ et al. (2013) Nucleic Acids Res 41:2541
        id: 'COMPAT-002',
        name: 'Transcriptional read-through',
        check: (_text, lines) => {
            const issues: CompatibilityIssue[] = [];
            let lastGeneLine = -1;
            for (let i = 0; i < lines.length; i++) {
                if (lines[i].match(/^\s*gene\s+/)) {
                    if (lastGeneLine >= 0) {
                        // Check if there's a terminator between this gene and the previous one
                        let hasTerm = false;
                        for (let j = lastGeneLine + 1; j < i; j++) {
                            if (lines[j].match(/^\s*terminator[:\s]+/)) { hasTerm = true; break; }
                        }
                        if (!hasTerm) {
                            issues.push({
                                severity: 'warning',
                                message: `Genes consecutivos sin terminador entre líneas ${lastGeneLine + 1} y ${i + 1} — read-through transcripcional`,
                                line: i,
                                suggestion: 'Inserte terminador ≥0.95 eff (BBa_B0015) entre TUs (Mutalik et al. 2013 Nat Chem Biol 9:431)',
                                ruleId: 'COMPAT-002'
                            });
                        }
                    }
                    lastGeneLine = i;
                }
            }
            return issues;
        }
    },
    {
        id: 'COMPAT-003',
        name: 'Inducer orthogonality check',
        check: (text, _lines) => {
            const issues: CompatibilityIssue[] = [];
            const inducers = new Set<string>();
            const matches = text.matchAll(/inducer:\s*"([^"]+)"/g);
            for (const m of matches) { inducers.add(m[1]); }
            if (inducers.size > 2) {
                issues.push({
                    severity: 'info',
                    message: `${inducers.size} inductores detectados (${[...inducers].join(', ')}). Verificar ortogonalidad cruzada`,
                    line: 0,
                    suggestion: 'IPTG/aTc/arabinose son ortogonales en E. coli (Meyer et al. 2019 Nat Chem Biol 15:196). Otros pueden tener crosstalk',
                    ruleId: 'COMPAT-003'
                });
            }
            return issues;
        }
    },
    {
        id: 'COMPAT-004',
        name: 'Host-part compatibility',
        check: (text, lines) => {
            const issues: CompatibilityIssue[] = [];
            for (let i = 0; i < lines.length; i++) {
                const hostMatch = lines[i].match(/host:\s*"([^"]+)"/);
                if (hostMatch) {
                    const host = hostMatch[1].toLowerCase();
                    if (host.includes('yeast') || host.includes('cerevisiae')) {
                        if (text.includes('pLac') || text.includes('pTet') || text.includes('BBa_R00')) {
                            issues.push({
                                severity: 'error',
                                message: `Promotores bacterianos detectados pero host es levadura (${hostMatch[1]})`,
                                line: i,
                                suggestion: 'Use promotores de levadura: pGAL1, pTEF1, pADH1, pGPD (Partow et al. 2010 Yeast 27:955)',
                                ruleId: 'COMPAT-004'
                            });
                        }
                    }
                    if (host.includes('mammal') || host.includes('hela') || host.includes('cho')) {
                        if (text.includes('BBa_B0034') || text.includes('Shine-Dalgarno')) {
                            issues.push({
                                severity: 'error',
                                message: 'RBS procarionte (Shine-Dalgarno) no funciona en células de mamífero',
                                line: i,
                                suggestion: 'En mamíferos use secuencia Kozak (GCCACCATGG) para inicio de traducción (Kozak 1987 NAR 15:8125)',
                                ruleId: 'COMPAT-004'
                            });
                        }
                    }
                }
            }
            return issues;
        }
    },
    {
        // Gyorgy A et al. (2015) Nat Biotechnol 33:1234 — resource competition
        id: 'COMPAT-005',
        name: 'Resource competition',
        check: (_text, lines) => {
            const issues: CompatibilityIssue[] = [];
            const geneCount = lines.filter(l => l.match(/^\s*gene\s+/)).length;
            const strongExpr = lines.filter(l => l.match(/strength:\s*(0\.[89]\d*|1\.0)/)).length;
            if (geneCount > 4 && strongExpr > 2) {
                issues.push({
                    severity: 'warning',
                    message: `${geneCount} genes con ${strongExpr} elementos de alta expresión — competencia por ribosomas y σ70`,
                    line: 0,
                    suggestion: 'Distribuya en múltiples plásmidos o reduzca expresión. Los recursos celulares son finitos (Gyorgy et al. 2015 Nat Biotechnol 33:1234)',
                    ruleId: 'COMPAT-005'
                });
            }
            return issues;
        }
    },
    {
        // Davis JH et al. (2011) Nat Biotechnol 29:1066 — insulator elements
        id: 'COMPAT-006',
        name: 'Transcriptional interference',
        check: (_text, lines) => {
            const issues: CompatibilityIssue[] = [];
            let consecutivePromoters = 0;
            let firstPromLine = -1;
            for (let i = 0; i < lines.length; i++) {
                if (lines[i].match(/^\s*promoter\s+/)) {
                    if (consecutivePromoters === 0) { firstPromLine = i; }
                    consecutivePromoters++;
                } else if (lines[i].match(/^\s*(gene|rbs|terminator)\s+/)) {
                    consecutivePromoters = 0;
                }
            }
            const promoterLines: number[] = [];
            for (let i = 0; i < lines.length; i++) {
                if (lines[i].match(/^\s*promoter\s+/)) { promoterLines.push(i); }
            }
            // Check for nearby promoters facing each other without insulator
            for (let i = 1; i < promoterLines.length; i++) {
                const gap = promoterLines[i] - promoterLines[i - 1];
                if (gap <= 3 && gap > 0) {
                    const hasInsulator = lines.slice(promoterLines[i - 1], promoterLines[i] + 1)
                        .some(l => l.match(/insulator|ribozyme/i));
                    if (!hasInsulator) {
                        issues.push({
                            severity: 'info',
                            message: `Promotores adyacentes (líneas ${promoterLines[i - 1] + 1}, ${promoterLines[i] + 1}) sin aislador — posible interferencia`,
                            line: promoterLines[i],
                            suggestion: 'Inserte un aislador ribozimático (Lou et al. 2012 Nat Biotechnol 30:1137) entre promotores adyacentes',
                            ruleId: 'COMPAT-006'
                        });
                    }
                }
            }
            return issues;
        }
    },
    {
        // Sleight SC et al. (2010) Nucleic Acids Res 38:2624 — genetic stability
        id: 'COMPAT-007',
        name: 'Genetic instability risk',
        check: (text, _lines) => {
            const issues: CompatibilityIssue[] = [];
            // Check for repeated sequences (same part used multiple times)
            const partNames: string[] = [];
            const partMatches = text.matchAll(/(promoter|rbs|terminator|gene)\s+(\w+)/g);
            for (const m of partMatches) { partNames.push(m[2]); }
            const nameCounts = new Map<string, number>();
            for (const n of partNames) { nameCounts.set(n, (nameCounts.get(n) || 0) + 1); }
            for (const [name, count] of nameCounts) {
                if (count >= 3) {
                    issues.push({
                        severity: 'warning',
                        message: `Parte "${name}" usada ${count} veces — riesgo de recombinación homóloga`,
                        line: 0,
                        suggestion: 'Use variantes de secuencia para la misma función (Sleight et al. 2010 NAR 38:2624). Alt: use terminadores/promotores diferentes con función similar',
                        ruleId: 'COMPAT-007'
                    });
                }
            }
            return issues;
        }
    },
    {
        // Segall-Shapiro TH et al. (2014) Mol Syst Biol 10:742 — modular design
        id: 'COMPAT-008',
        name: 'Missing promoter-RBS-gene-terminator structure',
        check: (_text, lines) => {
            const issues: CompatibilityIssue[] = [];
            for (let i = 0; i < lines.length; i++) {
                if (lines[i].match(/^\s*gene\s+/) && i > 0) {
                    // Check preceding line for RBS
                    let hasRBS = false;
                    for (let j = Math.max(0, i - 2); j < i; j++) {
                        if (lines[j].match(/^\s*rbs[:\s]+/)) { hasRBS = true; break; }
                    }
                    if (!hasRBS) {
                        issues.push({
                            severity: 'warning',
                            message: `Gen en línea ${i + 1} sin RBS precedente — traducción ineficiente o nula`,
                            line: i,
                            suggestion: 'Cada gen necesita un RBS para la traducción. Inserte rbs (BBa_B0034, 1.0 RPU) antes del gen',
                            ruleId: 'COMPAT-008'
                        });
                    }
                }
            }
            return issues;
        }
    }
];

// ── Analizador de Red Regulatoria ──────────────────────────────────────
// Basado en: Alon U (2007) "An Introduction to Systems Biology" Ch.4-6
// Motifs: Shen-Orr SS et al. (2002) Nat Genet 31:64

class RegulatoryNetworkAnalyzer {

    /**
     * Parsea código BioScript y extrae componentes estructurados
     */
    static parseComponents(text: string): ParsedComponent[] {
        const lines = text.split('\n');
        const components: ParsedComponent[] = [];
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();
            const match = line.match(/^(promoter|rbs|gene|terminator|kill_switch)\s+(\w+)\s*(.*)/);
            if (match) {
                const props: Record<string, string> = {};
                const propsStr = match[3];
                const propMatches = propsStr.matchAll(/(\w+):\s*"?([^",\s)]+)"?/g);
                for (const pm of propMatches) { props[pm[1]] = pm[2]; }
                // Also match quoted values
                const quotedMatches = propsStr.matchAll(/(\w+):\s*"([^"]+)"/g);
                for (const qm of quotedMatches) { props[qm[1]] = qm[2]; }
                components.push({ kind: match[1] as ParsedComponent['kind'], name: match[2], line: i, properties: props });
            }
        }
        return components;
    }

    /**
     * Construye grafo de interacciones regulatorias
     */
    static buildNetwork(text: string): CircuitTopology {
        const components = this.parseComponents(text);
        const edges: RegulatoryEdge[] = [];
        const nodeSet = new Set<string>();

        // 1. Extract gene products
        const geneProducts = new Map<string, string>(); // geneName -> proteinProduct
        for (const comp of components) {
            if (comp.kind === 'gene' && comp.properties['product']) {
                geneProducts.set(comp.name, comp.properties['product']);
                nodeSet.add(comp.properties['product']);
            }
        }

        // 2. Extract regulatory connections from promoters
        for (const comp of components) {
            if (comp.kind === 'promoter') {
                const repressor = comp.properties['repressor'];
                const activator = comp.properties['activator'];
                const inducer = comp.properties['inducer'];

                // Find which gene this promoter drives (next gene in sequence)
                const promIdx = components.indexOf(comp);
                let targetGene: ParsedComponent | undefined;
                for (let j = promIdx + 1; j < components.length; j++) {
                    if (components[j].kind === 'gene') { targetGene = components[j]; break; }
                    if (components[j].kind === 'promoter') break; // another TU
                }

                if (targetGene && targetGene.properties['product']) {
                    const targetProtein = targetGene.properties['product'];
                    const strength = comp.properties['strength'] ? parseFloat(comp.properties['strength']) : undefined;

                    if (repressor) {
                        nodeSet.add(repressor);
                        edges.push({ from: repressor, to: targetProtein, type: 'repression', promoter: comp.name, strength });
                    }
                    if (activator) {
                        nodeSet.add(activator);
                        edges.push({ from: activator, to: targetProtein, type: 'activation', promoter: comp.name, strength });
                    }
                }
            }
        }

        // 3. Check for activation/repression keywords in text patterns
        const lines = text.split('\n');
        for (const line of lines) {
            // Pattern: X -> Y (activation) or X ~> Y (repression)
            const actMatch = line.match(/(\w+)\s*->\s*(\w+)/);
            if (actMatch) {
                const from = actMatch[1], to = actMatch[2];
                if (geneProducts.has(from) || nodeSet.has(from)) {
                    nodeSet.add(from); nodeSet.add(to);
                    if (!edges.some(e => e.from === from && e.to === to)) {
                        edges.push({ from, to, type: 'activation' });
                    }
                }
            }
            const repMatch = line.match(/(\w+)\s*~>\s*(\w+)/);
            if (repMatch) {
                const from = repMatch[1], to = repMatch[2];
                nodeSet.add(from); nodeSet.add(to);
                if (!edges.some(e => e.from === from && e.to === to)) {
                    edges.push({ from, to, type: 'repression' });
                }
            }
        }

        const nodes = [...nodeSet];
        const motifs = this.detectMotifs(nodes, edges);
        const feedbackLoops = this.findFeedbackLoops(nodes, edges);

        return { nodes, edges, motifs, feedbackLoops, components };
    }

    /**
     * Detecta motifs de red — Alon U (2007), Shen-Orr SS et al. (2002) Nat Genet 31:64
     */
    static detectMotifs(nodes: string[], edges: RegulatoryEdge[]): NetworkMotif[] {
        const motifs: NetworkMotif[] = [];

        // 1. Auto-regulation
        for (const node of nodes) {
            const selfEdge = edges.find(e => e.from === node && e.to === node);
            if (selfEdge) {
                motifs.push({
                    type: selfEdge.type === 'repression' ? 'autorepression' : 'autoactivation',
                    nodes: [node],
                    description: selfEdge.type === 'repression'
                        ? `${node} se auto-reprime — respuesta acelerada, reduce ruido`
                        : `${node} se auto-activa — biestabilidad potencial, amplificación`,
                    reference: selfEdge.type === 'repression'
                        ? 'Rosenfeld N et al. (2002) JMB 323:785 — negative autoregulation speeds response'
                        : 'Becskei A et al. (2001) EMBO J 20:2528 — positive autoregulation',
                    dynamicBehavior: selfEdge.type === 'repression'
                        ? 'Reduce tiempo de respuesta ~5x, estabiliza expresión (CV↓)'
                        : 'Genera respuesta bimodal si ganancia > 1 (hiperfunción de Hill > 1)'
                });
            }
        }

        // 2. Toggle Switch (mutual repression A ⊣ B, B ⊣ A)
        for (let i = 0; i < edges.length; i++) {
            for (let j = i + 1; j < edges.length; j++) {
                if (edges[i].type === 'repression' && edges[j].type === 'repression' &&
                    edges[i].from === edges[j].to && edges[i].to === edges[j].from) {
                    motifs.push({
                        type: 'toggle_switch',
                        nodes: [edges[i].from, edges[i].to],
                        description: `Toggle Switch: ${edges[i].from} ⊣ ${edges[i].to} y ${edges[j].from} ⊣ ${edges[j].to}`,
                        reference: 'Gardner TS et al. (2000) Nature 403:339 — construction of a genetic toggle switch',
                        dynamicBehavior: 'Biestable: dos estados estables, transición por inductores. Requiere cooperatividad (n>1) para biestabilidad robusta'
                    });
                }
            }
        }

        // 3. Repressilator (3-node repression cycle A ⊣ B ⊣ C ⊣ A)
        for (const a of nodes) {
            for (const b of nodes) {
                if (b === a) continue;
                for (const c of nodes) {
                    if (c === a || c === b) continue;
                    const ab = edges.find(e => e.from === a && e.to === b && e.type === 'repression');
                    const bc = edges.find(e => e.from === b && e.to === c && e.type === 'repression');
                    const ca = edges.find(e => e.from === c && e.to === a && e.type === 'repression');
                    if (ab && bc && ca) {
                        // Avoid duplicate (ABC = BCA = CAB)
                        const sorted = [a, b, c].sort().join('-');
                        if (!motifs.some(m => m.type === 'repressilator' && m.nodes.sort().join('-') === sorted)) {
                            motifs.push({
                                type: 'repressilator',
                                nodes: [a, b, c],
                                description: `Repressilator: ${a} ⊣ ${b} ⊣ ${c} ⊣ ${a}`,
                                reference: 'Elowitz MB & Leibler S (2000) Nature 403:335 — synthetic oscillatory network',
                                dynamicBehavior: 'Oscilaciones sostenidas. Período ≈ 3×(τ_mRNA + τ_protein). Requiere balanceo de tasas de degradación'
                            });
                        }
                    }
                }
            }
        }

        // 4. Feed-Forward Loop (X→Y, X→Z, Y→Z)
        for (const x of nodes) {
            const xTargets = edges.filter(e => e.from === x);
            for (const ey of xTargets) {
                const y = ey.to;
                const yTargets = edges.filter(e => e.from === y);
                for (const ez of yTargets) {
                    const z = ez.to;
                    const xToZ = edges.find(e => e.from === x && e.to === z);
                    if (xToZ && z !== x && z !== y) {
                        // Classify: coherent (same sign) or incoherent (different sign)
                        const xySign = ey.type === 'activation' ? 1 : -1;
                        const yzSign = ez.type === 'activation' ? 1 : -1;
                        const xzSign = xToZ.type === 'activation' ? 1 : -1;
                        const isCoherent = (xySign * yzSign) === xzSign;
                        motifs.push({
                            type: isCoherent ? 'ffl_coherent' : 'ffl_incoherent',
                            nodes: [x, y, z],
                            description: isCoherent
                                ? `FFL Coherente: ${x}→${y}→${z}, ${x}→${z} (AND gate, filtro de pulsos)`
                                : `FFL Incoherente: ${x}→${y}⊣${z}, ${x}→${z} (generador de pulsos)`,
                            reference: isCoherent
                                ? 'Mangan S & Alon U (2003) PNAS 100:11980 — C1-FFL sign-sensitive delay'
                                : 'Mangan S et al. (2006) JMB 356:1073 — I1-FFL pulse generator',
                            dynamicBehavior: isCoherent
                                ? 'Filtrado de señales transitorias, retardo ON pero no OFF'
                                : 'Genera pulsos de actividad al activar X, respuesta no-monótona'
                        });
                    }
                }
            }
        }

        // 5. Simple cascade (A→B→C, no feedback)
        for (const a of nodes) {
            const aTargets = edges.filter(e => e.from === a);
            for (const ab of aTargets) {
                const b = ab.to;
                const bTargets = edges.filter(e => e.from === b);
                for (const bc of bTargets) {
                    const c = bc.to;
                    if (c !== a && c !== b) {
                        // Only if there's no feedback C→A
                        const feedback = edges.find(e => e.from === c && e.to === a);
                        if (!feedback) {
                            const existing = motifs.find(m => m.type === 'cascade' &&
                                m.nodes[0] === a && m.nodes[1] === b && m.nodes[2] === c);
                            if (!existing) {
                                motifs.push({
                                    type: 'cascade',
                                    nodes: [a, b, c],
                                    description: `Cascada: ${a}→${b}→${c} — señalización secuencial`,
                                    reference: 'Hooshangi S et al. (2005) PNAS 102:3581 — ultrasensitivity in cascades',
                                    dynamicBehavior: 'Cada etapa añade retardo (τ ~ ln2/γ). Cascadas largas amplifican ruido pero pueden generar ultrasensibilidad'
                                });
                            }
                        }
                    }
                }
            }
        }

        return motifs;
    }

    /**
     * Encuentra ciclos de retroalimentación usando DFS
     */
    static findFeedbackLoops(nodes: string[], edges: RegulatoryEdge[]): string[][] {
        const loops: string[][] = [];
        const adj = new Map<string, string[]>();
        for (const n of nodes) { adj.set(n, []); }
        for (const e of edges) {
            const targets = adj.get(e.from) || [];
            targets.push(e.to);
            adj.set(e.from, targets);
        }

        // DFS for cycles
        for (const start of nodes) {
            const visited = new Set<string>();
            const path: string[] = [];

            const dfs = (node: string) => {
                if (path.includes(node)) {
                    const cycleStart = path.indexOf(node);
                    const cycle = path.slice(cycleStart);
                    // Normalize to smallest-first to avoid duplicates
                    const sorted = [...cycle].sort();
                    const key = sorted.join('-');
                    if (!loops.some(l => [...l].sort().join('-') === key)) {
                        loops.push(cycle);
                    }
                    return;
                }
                if (visited.has(node)) return;
                visited.add(node);
                path.push(node);
                for (const next of (adj.get(node) || [])) {
                    dfs(next);
                }
                path.pop();
            };

            dfs(start);
        }
        return loops;
    }

    /**
     * Genera un SVG del diagrama de red regulatoria
     */
    static generateNetworkSVG(topology: CircuitTopology): string {
        const { nodes, edges } = topology;
        if (nodes.length === 0) return '<svg></svg>';

        const width = 500;
        const height = 400;
        const centerX = width / 2;
        const centerY = height / 2;
        const radius = Math.min(width, height) * 0.32;

        // Position nodes in a circle
        const positions = new Map<string, { x: number; y: number }>();
        nodes.forEach((node, i) => {
            const angle = (2 * Math.PI * i) / nodes.length - Math.PI / 2;
            positions.set(node, {
                x: centerX + radius * Math.cos(angle),
                y: centerY + radius * Math.sin(angle)
            });
        });

        let svg = `<svg viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg" style="background:#1e1e2e;border-radius:8px">`;
        svg += `<defs>`;
        svg += `<marker id="arrow-act" markerWidth="10" markerHeight="7" refX="10" refY="3.5" orient="auto"><polygon points="0 0, 10 3.5, 0 7" fill="#10b981"/></marker>`;
        svg += `<marker id="arrow-rep" markerWidth="10" markerHeight="10" refX="10" refY="5" orient="auto"><line x1="0" y1="0" x2="0" y2="10" stroke="#ef4444" stroke-width="2"/></marker>`;
        svg += `</defs>`;

        // Draw edges
        for (const edge of edges) {
            const from = positions.get(edge.from);
            const to = positions.get(edge.to);
            if (!from || !to) continue;

            // Shorten arrow to not overlap with node circle
            const dx = to.x - from.x;
            const dy = to.y - from.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            const nodeR = 28;
            const ratio1 = nodeR / dist;
            const ratio2 = 1 - (nodeR + 12) / dist;

            const x1 = from.x + dx * ratio1;
            const y1 = from.y + dy * ratio1;
            const x2 = from.x + dx * ratio2;
            const y2 = from.y + dy * ratio2;

            const color = edge.type === 'activation' ? '#10b981' : '#ef4444';
            const marker = edge.type === 'activation' ? 'arrow-act' : 'arrow-rep';
            const dash = edge.type === 'repression' ? ' stroke-dasharray="6,3"' : '';

            if (edge.from === edge.to) {
                // Self-loop
                const cx = from.x;
                const cy = from.y - 50;
                svg += `<path d="M ${from.x - 10} ${from.y - nodeR} C ${cx - 30} ${cy - 20}, ${cx + 30} ${cy - 20}, ${from.x + 10} ${from.y - nodeR}" stroke="${color}" fill="none" stroke-width="2" marker-end="url(#${marker})"${dash}/>`;
            } else {
                svg += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${color}" stroke-width="2" marker-end="url(#${marker})"${dash}/>`;
            }
        }

        // Draw nodes
        for (const node of nodes) {
            const pos = positions.get(node)!;
            svg += `<circle cx="${pos.x}" cy="${pos.y}" r="28" fill="#2a2a3e" stroke="#7c3aed" stroke-width="2"/>`;
            const fontSize = node.length > 5 ? 10 : 12;
            svg += `<text x="${pos.x}" y="${pos.y + 4}" text-anchor="middle" fill="#e2e8f0" font-size="${fontSize}" font-family="'Segoe UI',sans-serif" font-weight="600">${node}</text>`;
        }

        // Legend
        svg += `<g transform="translate(10, ${height - 50})">`;
        svg += `<line x1="0" y1="0" x2="25" y2="0" stroke="#10b981" stroke-width="2" marker-end="url(#arrow-act)"/>`;
        svg += `<text x="30" y="4" fill="#94a3b8" font-size="10">Activación</text>`;
        svg += `<line x1="0" y1="16" x2="25" y2="16" stroke="#ef4444" stroke-width="2" stroke-dasharray="6,3" marker-end="url(#arrow-rep)"/>`;
        svg += `<text x="30" y="20" fill="#94a3b8" font-size="10">Represión</text>`;
        svg += `</g>`;

        svg += `</svg>`;
        return svg;
    }
}

// ── Circuit Scorer ─────────────────────────────────────────────────────
// Evaluación cuantitativa basada en principios de ingeniería genética

class CircuitScorer {
    static score(text: string, lines: string[]): CircuitScoreCard {
        const structure = this.scoreStructure(text, lines);
        const safety = this.scoreSafety(text, lines);
        const expression = this.scoreExpression(text, lines);
        const modularity = this.scoreModularity(text, lines);
        const predictability = this.scorePredictability(text, lines);

        const overall = Math.round(
            (structure.score / structure.max * 25) +
            (safety.score / safety.max * 25) +
            (expression.score / expression.max * 20) +
            (modularity.score / modularity.max * 15) +
            (predictability.score / predictability.max * 15)
        );

        const grade: CircuitScoreCard['grade'] =
            overall >= 90 ? 'A' : overall >= 75 ? 'B' : overall >= 60 ? 'C' : overall >= 40 ? 'D' : 'F';

        return { overall, grade, structure, safety, expression, modularity, predictability };
    }

    private static scoreStructure(_text: string, lines: string[]): ScoreCategory {
        let score = 0;
        const max = 20;
        const issues: string[] = [];
        const recommendations: string[] = [];

        const promoters = lines.filter(l => l.match(/^\s*promoter\s+/)).length;
        const rbs = lines.filter(l => l.match(/^\s*rbs\s+/)).length;
        const genes = lines.filter(l => l.match(/^\s*gene\s+/)).length;
        const terms = lines.filter(l => l.match(/^\s*terminator\s+/)).length;

        if (promoters > 0) score += 4; else { issues.push('Sin promotor'); recommendations.push('Añada al menos un promotor'); }
        if (rbs >= genes) score += 4; else { issues.push(`RBS insuficientes (${rbs}/${genes})`); recommendations.push('Cada gen necesita RBS'); }
        if (genes > 0) score += 4; else { issues.push('Sin genes'); }
        if (terms >= Math.ceil(genes / 2)) score += 4; else { issues.push('Pocos terminadores'); recommendations.push('Añada terminadores entre TUs'); }
        if (promoters > 0 && rbs > 0 && genes > 0 && terms > 0) score += 4; // Complete TU

        return { score, max, issues, recommendations };
    }

    private static scoreSafety(text: string, lines: string[]): ScoreCategory {
        let score = 0;
        const max = 20;
        const issues: string[] = [];
        const recommendations: string[] = [];
        const genes = lines.filter(l => l.match(/^\s*gene\s+/)).length;

        if (text.includes('kill_switch')) { score += 8; } else if (genes > 1) { issues.push('Sin kill switch'); recommendations.push('Añada mecanismo de biocontención (Chan et al. 2016)'); }
        else { score += 4; } // Single gene doesn't need kill switch

        const hasToxin = text.match(/toxin|CcdB|MazF|RelE|Hok/i);
        const hasAntitoxin = text.match(/antitoxin|CcdA|MazE|RelB|Sok/i);
        if (hasToxin && hasAntitoxin) { score += 6; }
        else if (text.includes('kill_switch')) { score += 3; issues.push('Kill switch sin T/A definido'); }
        else { score += 2; }

        // Check for biological containment strategies
        if (text.match(/auxotrop|essential|synthetic_auxotrophy/i)) { score += 6; }
        else if (text.includes('kill_switch')) { score += 4; }
        else { recommendations.push('Considere auxotrofía sintética como contención adicional (Mandell et al. 2015 Nature 518:55)'); score += 2; }

        return { score, max, issues, recommendations };
    }

    private static scoreExpression(text: string, _lines: string[]): ScoreCategory {
        let score = 0;
        const max = 20;
        const issues: string[] = [];
        const recommendations: string[] = [];

        const strengths = [...text.matchAll(/strength:\s*([\d.]+)/g)].map(m => parseFloat(m[1]));
        if (strengths.length > 0) {
            const avg = strengths.reduce((a, b) => a + b, 0) / strengths.length;
            if (avg <= 0.8 && avg >= 0.2) { score += 8; } // Balanced
            else if (avg > 0.8) { score += 4; issues.push(`Expresión promedio alta (${avg.toFixed(2)})`); recommendations.push('Considere RBS más débiles'); }
            else { score += 4; issues.push('Expresión promedio baja'); }

            // Check variance (all similar = good design)
            const variance = strengths.reduce((s, v) => s + Math.pow(v - avg, 2), 0) / strengths.length;
            if (variance < 0.05) { score += 4; } else { score += 2; issues.push('Alta varianza en fuerzas de expresión'); }
        } else {
            score += 4; // No strengths specified (neutral)
        }

        if (text.includes('codon_optimized')) { score += 4; }
        else { score += 2; recommendations.push('Añada codon_optimized:true para mejorar traducción'); }

        if (text.match(/efficiency:\s*0\.9/)) { score += 4; } else { score += 2; }

        return { score, max, issues, recommendations };
    }

    private static scoreModularity(text: string, lines: string[]): ScoreCategory {
        let score = 0;
        const max = 20;
        const issues: string[] = [];
        const recommendations: string[] = [];

        // Has named circuits
        const circuits = text.match(/genetic_circuit\s+\w+/g);
        if (circuits && circuits.length > 0) { score += 6; } else { issues.push('Sin circuito nombrado'); score += 2; }

        // Each gene has a product defined
        const genes = lines.filter(l => l.match(/^\s*gene\s+/));
        const withProduct = genes.filter(l => l.includes('product:'));
        if (genes.length > 0 && withProduct.length === genes.length) { score += 6; }
        else if (withProduct.length > 0) { score += 3; issues.push('No todos los genes tienen product definido'); }
        else { recommendations.push('Defina product para cada gen'); }

        // Uses standard parts (BBa_ IDs)
        if (text.includes('BBa_')) { score += 4; }
        else { score += 1; recommendations.push('Use partes estandarizadas iGEM (BBa_xxxx)'); }

        // Comments present
        const comments = lines.filter(l => l.match(/\/\//));
        if (comments.length >= genes.length) { score += 4; }
        else { score += 2; recommendations.push('Añada comentarios para documentación'); }

        return { score, max, issues, recommendations };
    }

    private static scorePredictability(text: string, _lines: string[]): ScoreCategory {
        let score = 0;
        const max = 20;
        const issues: string[] = [];
        const recommendations: string[] = [];

        // Uses characterized parts
        if (text.match(/RPU|kelly|salis/i)) { score += 5; }
        else if (text.match(/strength:\s*[\d.]+/)) { score += 3; }
        else { recommendations.push('Use partes caracterizadas con valores RPU (Kelly et al. 2009)'); }

        // Terminator efficiency specified
        if (text.match(/efficiency:\s*[\d.]+/)) { score += 5; }
        else { score += 2; recommendations.push('Especifique eficiencia de terminadores'); }

        // Orthogonal parts (no repeated regulatory proteins)
        const regulators = [...text.matchAll(/(?:repressor|activator):\s*"([^"]+)"/g)].map(m => m[1]);
        const uniqueReg = new Set(regulators);
        if (regulators.length === uniqueReg.size) { score += 5; }
        else { score += 2; issues.push('Reguladores compartidos pueden causar crosstalk'); }

        // Has host specification
        if (text.match(/host:/)) { score += 5; }
        else { score += 1; recommendations.push('Especifique host para validación de compatibilidad'); }

        return { score, max, issues, recommendations };
    }
}

// ── Estimador de Carga Metabólica ──────────────────────────────────────
// Ceroni F et al. (2015) NAR 43:7648, Borkowski O et al. (2016) ACS Synth Biol 5:530

class MetabolicBurdenEstimator {
    /**
     * Estima carga metabólica relativa del circuito.
     * Modelo simplificado basado en:
     *  - Fuerza de promotor × fuerza de RBS ∝ tasa de síntesis proteica
     *  - Proteínas más grandes consumen más aminoácidos/energía
     *  - Referencia: 1 proteína de 300aa a 1.0 RPU ≈ 1 unidad de carga
     */
    static estimate(text: string): MetabolicBurdenResult {
        const lines = text.split('\n');
        const breakdown: { gene: string; burden: number; reason: string }[] = [];
        let totalBurden = 0;

        // Parse transcription units (promoter → rbs → gene sequences)
        let currentPromStrength = 0.5;
        let currentRBSStrength = 0.5;

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];

            const promMatch = line.match(/promoter\s+\w+.*strength:\s*([\d.]+)/);
            if (promMatch) { currentPromStrength = parseFloat(promMatch[1]); }

            const rbsMatch = line.match(/rbs\s+\w+.*strength:\s*([\d.]+)/);
            if (rbsMatch) { currentRBSStrength = parseFloat(rbsMatch[1]); }

            const geneMatch = line.match(/gene\s+(\w+)/);
            if (geneMatch) {
                const geneName = geneMatch[1];
                const product = line.match(/product:\s*"([^"]+)"/)?.[1] || geneName;
                // Estimate protein size (default 300 aa)
                const seqMatch = line.match(/sequence:\s*"([^"]+)"/);
                const proteinSize = seqMatch ? Math.round(seqMatch[1].length / 3) : 300;

                // Burden = promoterStrength × rbsStrength × (proteinSize/300)
                // Normalized so 1.0 RPU promoter + 1.0 RPU RBS + 300aa protein = 1.0 burden unit
                const burden = currentPromStrength * currentRBSStrength * (proteinSize / 300);
                totalBurden += burden;

                const reasons: string[] = [];
                if (currentPromStrength >= 0.8) reasons.push('promotor fuerte');
                if (currentRBSStrength >= 0.8) reasons.push('RBS fuerte');
                if (proteinSize > 500) reasons.push(`proteína grande (~${proteinSize}aa)`);
                if (reasons.length === 0) reasons.push('expresión moderada');

                breakdown.push({
                    gene: product,
                    burden: Math.round(burden * 100) / 100,
                    reason: reasons.join(', ')
                });

                // Reset for next TU
                currentPromStrength = 0.5;
                currentRBSStrength = 0.5;
            }
        }

        // Categorize overall burden
        // Ref: Ceroni 2015 — growth rate drops >20% with burden > 2.0 units
        const category: MetabolicBurdenResult['category'] =
            totalBurden < 1.0 ? 'low' :
            totalBurden < 2.0 ? 'moderate' :
            totalBurden < 3.5 ? 'high' : 'critical';

        const recommendations: Record<string, string> = {
            'low': 'Carga metabólica baja — no debería afectar crecimiento significativamente',
            'moderate': 'Carga moderada — monitoree tasa de crecimiento. Considere optimización de codones',
            'high': 'Carga alta — probable reducción de crecimiento >20% (Ceroni 2015). Reduzca expresión o use promotores más débiles',
            'critical': 'Carga crítica — riesgo de mutaciones de escape y pérdida del circuito. Redistribuya genes en múltiples cepas o reduzca expresión drásticamente'
        };

        return {
            totalBurden: Math.round(totalBurden * 100) / 100,
            category,
            breakdown,
            recommendation: recommendations[category],
            reference: 'Ceroni F et al. (2015) NAR 43:7648; Borkowski O et al. (2016) ACS Synth Biol 5:530'
        };
    }
}

// ── Clase principal ────────────────────────────────────────────────────

export class AIDesignAssistant implements vscode.Disposable {
    private panel: vscode.WebviewPanel | undefined;
    private context: vscode.ExtensionContext;
    private completionProvider: vscode.Disposable | undefined;
    private hoverProvider: vscode.Disposable | undefined;
    private codeActionProvider: vscode.Disposable | undefined;
    private diagnosticCollection: vscode.DiagnosticCollection;
    private debounceTimer: NodeJS.Timeout | undefined;

    constructor(context: vscode.ExtensionContext) {
        this.context = context;
        this.diagnosticCollection = vscode.languages.createDiagnosticCollection('synbio-ai');
        this.registerProviders();
        this.registerDocumentListeners();
    }

    /**
     * Registra proveedores de IntelliSense para archivos .bio
     */
    private registerProviders() {
        const bioSelector: vscode.DocumentSelector = { language: 'bioscript', scheme: 'file' };

        // Auto-completado inteligente
        this.completionProvider = vscode.languages.registerCompletionItemProvider(
            bioSelector,
            {
                provideCompletionItems: (doc, pos, token, ctx) => {
                    return this.provideCompletions(doc, pos);
                }
            },
            '.', ' ', '('
        );

        // Hover con información de partes
        this.hoverProvider = vscode.languages.registerHoverProvider(
            bioSelector,
            {
                provideHover: (doc, pos) => {
                    return this.provideHover(doc, pos);
                }
            }
        );

        // Code Actions (Quick Fixes)
        this.codeActionProvider = vscode.languages.registerCodeActionsProvider(
            bioSelector,
            {
                provideCodeActions: (doc: vscode.TextDocument, range: vscode.Range, context: vscode.CodeActionContext) => {
                    return this.provideCodeActions(doc, range, context);
                }
            },
            { providedCodeActionKinds: [vscode.CodeActionKind.QuickFix, vscode.CodeActionKind.Refactor] }
        );
    }

    /**
     * Escucha cambios y proporciona análisis en tiempo real
     */
    private registerDocumentListeners() {
        vscode.workspace.onDidChangeTextDocument(e => {
            if (e.document.languageId === 'bioscript') {
                if (this.debounceTimer) { clearTimeout(this.debounceTimer); }
                this.debounceTimer = setTimeout(() => {
                    this.analyzeDocument(e.document);
                }, 800);
            }
        });

        vscode.workspace.onDidOpenTextDocument(doc => {
            if (doc.languageId === 'bioscript') {
                this.analyzeDocument(doc);
            }
        });
    }

    /**
     * Proporciona auto-completado contextual
     */
    private provideCompletions(
        document: vscode.TextDocument,
        position: vscode.Position
    ): vscode.CompletionItem[] {
        const lineText = document.lineAt(position.line).text;
        const textBefore = lineText.substring(0, position.character);
        const items: vscode.CompletionItem[] = [];

        // Completar tipos de componentes
        if (textBefore.match(/^\s*$/)) {
            const components = [
                { label: 'promoter', detail: 'Promotor', snippet: 'promoter ${1:name} (type: "${2|constitutive,inducible,repressible|}"${3:, strength: ${4:0.5}}) {}' },
                { label: 'rbs', detail: 'Sitio de unión al ribosoma', snippet: 'rbs ${1:name} (strength: ${2:0.8}) {}' },
                { label: 'gene', detail: 'Gen / CDS', snippet: 'gene ${1:name} (product: "${2:Protein}") { sequence: "${3:ATG...}" }' },
                { label: 'terminator', detail: 'Terminador de transcripción', snippet: 'terminator ${1:name} (efficiency: ${2:0.95}) {}' },
                { label: 'genetic_circuit', detail: 'Nuevo circuito genético', snippet: 'genetic_circuit ${1:circuit_name} {\n\t$0\n}' },
                { label: 'kill_switch', detail: 'Interruptor de seguridad', snippet: 'kill_switch ${1:name} {\n\ttrigger: "${2|temperature,nutrient_absence,light|}"\n\ttoxin: "${3:CcdB}"\n\tantitoxin: "${4:CcdA}"\n}' },
                { label: 'host', detail: 'Organismo huésped', snippet: 'host: "${1|E. coli DH5α,E. coli BL21,S. cerevisiae,B. subtilis|}"' },
            ];

            for (const comp of components) {
                const item = new vscode.CompletionItem(comp.label, vscode.CompletionItemKind.Keyword);
                item.detail = `SynBio: ${comp.detail}`;
                item.insertText = new vscode.SnippetString(comp.snippet);
                item.documentation = new vscode.MarkdownString(`**${comp.detail}**\n\nComponente BioScript estándar.`);
                items.push(item);
            }
        }

        // Completar partes iGEM cuando se escribe promoter/rbs/gene/terminator
        if (textBefore.match(/promoter\s+$/)) {
            const promoters = PART_DATABASE.filter(p => p.type === 'promoter');
            for (const p of promoters) {
                const item = new vscode.CompletionItem(p.partId, vscode.CompletionItemKind.Reference);
                item.detail = `${p.name} (iGEM)`;
                item.insertText = new vscode.SnippetString(
                    `${p.partId.replace('BBa_', '')} (type: "\${1|constitutive,inducible,repressible|}") {}`
                );
                item.documentation = new vscode.MarkdownString(
                    `**${p.name}** (${p.partId})\n\nSecuencia: \`${p.sequence?.substring(0, 30)}...\``
                );
                items.push(item);
            }
        }

        if (textBefore.match(/rbs\s+$/)) {
            const rbsParts = PART_DATABASE.filter(p => p.type === 'rbs');
            for (const p of rbsParts) {
                const item = new vscode.CompletionItem(p.partId, vscode.CompletionItemKind.Reference);
                item.detail = `${p.name} (iGEM)`;
                item.insertText = new vscode.SnippetString(
                    `${p.partId.replace('BBa_', '')} (strength: \${1:0.8}) {}`
                );
                item.documentation = new vscode.MarkdownString(
                    `**${p.name}** (${p.partId})\n\nSecuencia: \`${p.sequence}\``
                );
                items.push(item);
            }
        }

        if (textBefore.match(/gene\s+$/)) {
            const geneParts = PART_DATABASE.filter(p => p.type === 'gene');
            for (const p of geneParts) {
                const item = new vscode.CompletionItem(p.partId, vscode.CompletionItemKind.Reference);
                item.detail = `${p.name} (iGEM)`;
                item.insertText = new vscode.SnippetString(
                    `${p.name.toLowerCase()} (product: "${p.name}") { sequence: "${p.sequence}" }`
                );
                item.documentation = new vscode.MarkdownString(
                    `**${p.name}** (${p.partId})\n\nReportero fluorescente del registro iGEM.`
                );
                items.push(item);
            }
        }

        if (textBefore.match(/terminator\s+$/)) {
            const termParts = PART_DATABASE.filter(p => p.type === 'terminator');
            for (const p of termParts) {
                const item = new vscode.CompletionItem(p.partId, vscode.CompletionItemKind.Reference);
                item.detail = `${p.name} (iGEM)`;
                item.insertText = new vscode.SnippetString(
                    `${p.partId.replace('BBa_', '')} (efficiency: \${1:0.95}) {}`
                );
                item.documentation = new vscode.MarkdownString(
                    `**${p.name}** (${p.partId})\n\nTerminador del registro iGEM.`
                );
                items.push(item);
            }
        }

        // Completar patrones de diseño
        if (textBefore.match(/^\s*\/\/\s*(pattern|patron|template)/i)) {
            for (const pattern of DESIGN_PATTERNS) {
                const item = new vscode.CompletionItem(
                    `Pattern: ${pattern.name}`,
                    vscode.CompletionItemKind.Snippet
                );
                item.detail = `[${pattern.complexity}] ${pattern.description}`;
                item.insertText = new vscode.SnippetString(pattern.template);
                item.documentation = new vscode.MarkdownString(
                    `## ${pattern.name}\n\n${pattern.description}\n\n**Uso:** ${pattern.useCase}\n\n**Complejidad:** ${pattern.complexity}`
                );
                items.push(item);
            }
        }

        // Completar propiedades dentro de paréntesis
        if (textBefore.match(/\(\s*$/) || textBefore.match(/,\s*$/)) {
            const propsLine = document.lineAt(position.line).text;
            if (propsLine.match(/promoter/)) {
                items.push(this.createPropertyCompletion('type', '"constitutive"', 'Tipo de promotor'));
                items.push(this.createPropertyCompletion('strength', '0.5', 'Fuerza de expresión (0-1)'));
                items.push(this.createPropertyCompletion('inducer', '"IPTG"', 'Molécula inductora'));
                items.push(this.createPropertyCompletion('repressor', '"LacI"', 'Proteína represora'));
            } else if (propsLine.match(/rbs/)) {
                items.push(this.createPropertyCompletion('strength', '0.8', 'Fuerza del RBS (0-1)'));
                items.push(this.createPropertyCompletion('spacing', '8', 'Espaciado en nucleótidos'));
            } else if (propsLine.match(/gene/)) {
                items.push(this.createPropertyCompletion('product', '"GFP"', 'Producto proteico'));
                items.push(this.createPropertyCompletion('codon_optimized', 'true', 'Optimización de codones'));
            } else if (propsLine.match(/terminator/)) {
                items.push(this.createPropertyCompletion('efficiency', '0.95', 'Eficiencia (0-1)'));
                items.push(this.createPropertyCompletion('bidirectional', 'true', 'Terminador bidireccional'));
            }
        }

        return items;
    }

    private createPropertyCompletion(name: string, defaultVal: string, desc: string): vscode.CompletionItem {
        const item = new vscode.CompletionItem(name, vscode.CompletionItemKind.Property);
        item.detail = desc;
        item.insertText = new vscode.SnippetString(`${name}: \${1:${defaultVal}}`);
        return item;
    }

    /**
     * Proporciona información al pasar el ratón sobre partes
     */
    private provideHover(
        document: vscode.TextDocument,
        position: vscode.Position
    ): vscode.Hover | undefined {
        const range = document.getWordRangeAtPosition(position, /[\w_]+/);
        if (!range) return undefined;
        const word = document.getText(range);

        // Buscar en base de datos de partes
        const part = PART_DATABASE.find(p => 
            p.partId === word || 
            p.partId.replace('BBa_', '') === word || 
            p.name.toLowerCase() === word.toLowerCase()
        );

        if (part) {
            const md = new vscode.MarkdownString();
            md.appendMarkdown(`### 🧬 ${part.name}\n\n`);
            md.appendMarkdown(`| Propiedad | Valor |\n|---|---|\n`);
            md.appendMarkdown(`| **ID iGEM** | ${part.partId} |\n`);
            md.appendMarkdown(`| **Tipo** | ${part.type} |\n`);
            if (part.sequence) {
                md.appendMarkdown(`| **Secuencia** | \`${part.sequence.substring(0, 40)}...\` |\n`);
                md.appendMarkdown(`| **Longitud** | ${part.sequence.length} bp |\n`);
            }
            md.isTrusted = true;
            return new vscode.Hover(md, range);
        }

        // Información para keywords del lenguaje
        const keywords: Record<string, string> = {
            'genetic_circuit': '🔬 **Circuito Genético**\n\nBloque principal que define un circuito sintético completo.',
            'promoter': '📢 **Promotor**\n\nSecuencia de ADN que inicia la transcripción de genes downstream.',
            'rbs': '🔗 **RBS (Ribosome Binding Site)**\n\nSecuencia que facilita la unión del ribosoma para iniciar la traducción.',
            'gene': '🧬 **Gen / CDS**\n\nSecuencia codificante que produce una proteína funcional.',
            'terminator': '🛑 **Terminador**\n\nSecuencia que señala el fin de la transcripción.',
            'kill_switch': '☠️ **Kill Switch**\n\nMecanismo de seguridad para contención biológica.',
            'host': '🦠 **Organismo Huésped**\n\nOrganismo donde se expresará el circuito genético.'
        };

        if (keywords[word]) {
            return new vscode.Hover(new vscode.MarkdownString(keywords[word]), range);
        }

        return undefined;
    }

    /**
     * Proporciona Quick Fixes y refactorizaciones
     */
    private provideCodeActions(
        document: vscode.TextDocument,
        range: vscode.Range,
        context: vscode.CodeActionContext
    ): vscode.CodeAction[] {
        const actions: vscode.CodeAction[] = [];

        for (const diag of context.diagnostics) {
            if (diag.source === 'SynBio AI') {
                // Generar fix automático basado en el mensaje
                if (diag.message.includes('sin RBS')) {
                    const fix = new vscode.CodeAction(
                        'Insertar RBS estándar (BBa_B0034)',
                        vscode.CodeActionKind.QuickFix
                    );
                    fix.edit = new vscode.WorkspaceEdit();
                    const insertPos = new vscode.Position(diag.range.start.line + 1, 0);
                    fix.edit.insert(document.uri, insertPos,
                        '    rbs rbs_standard (strength: 0.8) {}\n'
                    );
                    fix.diagnostics = [diag];
                    fix.isPreferred = true;
                    actions.push(fix);
                }

                if (diag.message.includes('sin terminador')) {
                    const fix = new vscode.CodeAction(
                        'Insertar terminador doble (BBa_B0015)',
                        vscode.CodeActionKind.QuickFix
                    );
                    fix.edit = new vscode.WorkspaceEdit();
                    const insertPos = new vscode.Position(diag.range.end.line + 1, 0);
                    fix.edit.insert(document.uri, insertPos,
                        '    terminator dblTerm (efficiency: 0.98) {}\n'
                    );
                    fix.diagnostics = [diag];
                    fix.isPreferred = true;
                    actions.push(fix);
                }

                if (diag.message.includes('sobrecarga metabólica')) {
                    const fix = new vscode.CodeAction(
                        'Reducir fuerza del RBS a 0.5',
                        vscode.CodeActionKind.QuickFix
                    );
                    fix.edit = new vscode.WorkspaceEdit();
                    // Buscar RBS con strength alto en el rango
                    for (let i = 0; i < document.lineCount; i++) {
                        const line = document.lineAt(i).text;
                        const rbsMatch = line.match(/rbs.*strength:\s*(0\.[89]\d*|1\.0)/);
                        if (rbsMatch) {
                            const startIdx = line.indexOf(rbsMatch[1]);
                            fix.edit.replace(document.uri,
                                new vscode.Range(i, startIdx, i, startIdx + rbsMatch[1].length),
                                '0.5'
                            );
                            break;
                        }
                    }
                    fix.diagnostics = [diag];
                    actions.push(fix);
                }
            }
        }

        // Refactorización: Extraer como unidad de transcripción
        const selectedText = document.getText(range);
        if (selectedText.includes('promoter') && selectedText.includes('gene')) {
            const extract = new vscode.CodeAction(
                'Extraer como unidad de transcripción independiente',
                vscode.CodeActionKind.Refactor
            );
            extract.command = {
                title: 'Extraer TU',
                command: 'synbio.aiAssistant',
                arguments: ['extract_tu', range]
            };
            actions.push(extract);
        }

        return actions;
    }

    /**
     * Analiza documento y genera diagnósticos IA
     */
    private analyzeDocument(document: vscode.TextDocument) {
        const text = document.getText();
        const lines = text.split('\n');
        const diagnostics: vscode.Diagnostic[] = [];

        // Ejecutar todas las reglas de compatibilidad (con líneas precisas)
        for (const rule of COMPATIBILITY_RULES) {
            const issues = rule.check(text, lines);
            for (const issue of issues) {
                const line = Math.min(issue.line, lines.length - 1);
                const diag = new vscode.Diagnostic(
                    new vscode.Range(line, 0, line, lines[line]?.length || 0),
                    `[${issue.ruleId}] ${issue.message}\n💡 ${issue.suggestion}`,
                    issue.severity === 'error' ? vscode.DiagnosticSeverity.Error :
                    issue.severity === 'warning' ? vscode.DiagnosticSeverity.Warning :
                    vscode.DiagnosticSeverity.Information
                );
                diag.source = 'SynBio AI';
                diagnostics.push(diag);
            }
        }

        // Detectar motifs de red y reportar
        const topology = RegulatoryNetworkAnalyzer.buildNetwork(text);
        for (const motif of topology.motifs) {
            const diag = new vscode.Diagnostic(
                new vscode.Range(0, 0, 0, lines[0]?.length || 0),
                `🔬 Motif detectado: ${motif.description}\n📊 Comportamiento: ${motif.dynamicBehavior}\n📚 Ref: ${motif.reference}`,
                vscode.DiagnosticSeverity.Information
            );
            diag.source = 'SynBio AI';
            diagnostics.push(diag);
        }

        this.diagnosticCollection.set(document.uri, diagnostics);
    }

    /**
     * Muestra el panel principal del asistente IA
     */
    async show() {
        if (this.panel) {
            this.panel.reveal(vscode.ViewColumn.Two);
            return;
        }

        this.panel = vscode.window.createWebviewPanel(
            'synbioAIAssistant',
            '🤖 AI Design Assistant',
            vscode.ViewColumn.Two,
            { enableScripts: true }
        );

        this.panel.webview.html = this.getWebviewContent();

        this.panel.webview.onDidReceiveMessage(async msg => {
            switch (msg.command) {
                case 'insertPattern':
                    await this.insertPattern(msg.patternIndex);
                    break;
                case 'analyzeCurrent':
                    await this.analyzeCurrentEditor();
                    break;
                case 'suggestParts':
                    await this.suggestPartsForContext(msg.context);
                    break;
                case 'explainCircuit':
                    await this.explainCurrentCircuit();
                    break;
                case 'optimizeSuggestions':
                    await this.generateOptimizationSuggestions();
                    break;
                case 'networkAnalysis':
                    await this.analyzeNetwork();
                    break;
                case 'scoreCard':
                    await this.generateScoreCard();
                    break;
                case 'metabolicBurden':
                    await this.estimateMetabolicBurden();
                    break;
            }
        });

        this.panel.onDidDispose(() => { this.panel = undefined; });
    }

    private async insertPattern(index: number) {
        const pattern = DESIGN_PATTERNS[index];
        if (!pattern) return;
        const editor = vscode.window.activeTextEditor;
        if (editor) {
            await editor.insertSnippet(new vscode.SnippetString(pattern.template));
            vscode.window.showInformationMessage(`🤖 Patrón "${pattern.name}" insertado`);
        }
    }

    private async analyzeCurrentEditor() {
        const editor = vscode.window.activeTextEditor;
        if (!editor) { vscode.window.showWarningMessage('Abra un archivo .bio para analizar'); return; }

        const text = editor.document.getText();
        const lines = text.split('\n');
        const suggestions: DesignSuggestion[] = [];

        // 1. Análisis estructural
        const promoters = lines.filter(l => l.match(/^\s*promoter\s+/)).length;
        const rbsCount = lines.filter(l => l.match(/^\s*rbs\s+/)).length;
        const genes = lines.filter(l => l.match(/^\s*gene\s+/)).length;
        const terms = lines.filter(l => l.match(/^\s*terminator\s+/)).length;

        if (promoters === 0 && genes > 0) {
            suggestions.push({ type: 'warning', title: 'Sin promotor', description: 'Sin promotor no hay transcripción. Añada al menos un promotor.', confidence: 1.0, category: 'Estructura' });
        }
        if (genes > 0 && rbsCount < genes) {
            suggestions.push({ type: 'optimization', title: 'RBS insuficientes', description: `${genes} genes pero ${rbsCount} RBS. Cada gen necesita su RBS para traducción. Ref: Salis et al. 2009 Nat Biotechnol 27:946.`, confidence: 0.95, category: 'Traducción' });
        }
        if (genes > 0 && terms < Math.ceil(genes / 2)) {
            suggestions.push({ type: 'optimization', title: 'Pocos terminadores', description: `${terms} terminadores para ${genes} genes. Sin terminadores hay read-through (Chen et al. 2013 NAR 41:2541).`, confidence: 0.9, category: 'Estructura' });
        }
        if (!text.includes('kill_switch') && genes > 2) {
            suggestions.push({ type: 'warning', title: 'Sin kill switch', description: 'Circuitos complejos (>2 genes) deberían incluir biocontención. Ref: Chan CT et al. 2016 Nat Chem Biol 12:82.', confidence: 0.85, category: 'Seguridad' });
        }

        // 2. Reglas de compatibilidad (con líneas precisas)
        for (const rule of COMPATIBILITY_RULES) {
            const issues = rule.check(text, lines);
            for (const issue of issues) {
                suggestions.push({
                    type: issue.severity === 'error' ? 'warning' : 'optimization',
                    title: `[${issue.ruleId}] ${issue.message.substring(0, 80)}`,
                    description: `${issue.message}\n\n💡 ${issue.suggestion}`,
                    confidence: 0.9,
                    category: 'Compatibilidad',
                    references: [issue.ruleId]
                });
            }
        }

        // 3. Análisis de red regulatoria
        const topology = RegulatoryNetworkAnalyzer.buildNetwork(text);
        for (const motif of topology.motifs) {
            suggestions.push({
                type: 'pattern',
                title: `Motif: ${motif.type.replace(/_/g, ' ')}`,
                description: `${motif.description}\n\n📊 Comportamiento: ${motif.dynamicBehavior}\n📚 ${motif.reference}`,
                confidence: 0.92,
                category: 'Topología de Red',
                references: [motif.reference]
            });
        }
        if (topology.feedbackLoops.length > 0) {
            for (const loop of topology.feedbackLoops) {
                suggestions.push({
                    type: 'pattern',
                    title: `Feedback loop: ${loop.join(' → ')} → ${loop[0]}`,
                    description: `Ciclo de retroalimentación detectado (${loop.length} nodos). Los feedback loops pueden generar oscilaciones, biestabilidad o homeostasis dependiendo del signo neto.`,
                    confidence: 0.88,
                    category: 'Topología de Red'
                });
            }
        }

        // 4. Score Card
        const scoreCard = CircuitScorer.score(text, lines);
        suggestions.unshift({
            type: 'optimization',
            title: `Score Card: ${scoreCard.overall}/100 (Grado ${scoreCard.grade})`,
            description: [
                `🏗️ Estructura: ${scoreCard.structure.score}/${scoreCard.structure.max}`,
                `🛡️ Seguridad: ${scoreCard.safety.score}/${scoreCard.safety.max}`,
                `📊 Expresión: ${scoreCard.expression.score}/${scoreCard.expression.max}`,
                `🧩 Modularidad: ${scoreCard.modularity.score}/${scoreCard.modularity.max}`,
                `🎯 Predictibilidad: ${scoreCard.predictability.score}/${scoreCard.predictability.max}`,
                ...scoreCard.structure.recommendations,
                ...scoreCard.safety.recommendations,
                ...scoreCard.expression.recommendations,
            ].join('\n'),
            confidence: 0.95,
            category: 'Score Card'
        });

        // 5. Carga metabólica
        const burden = MetabolicBurdenEstimator.estimate(text);
        if (burden.breakdown.length > 0) {
            const burdenEmoji = burden.category === 'low' ? '🟢' : burden.category === 'moderate' ? '🟡' : burden.category === 'high' ? '🟠' : '🔴';
            suggestions.push({
                type: burden.category === 'critical' ? 'warning' : 'optimization',
                title: `${burdenEmoji} Carga metabólica: ${burden.totalBurden} (${burden.category})`,
                description: `${burden.recommendation}\n\nDesglose por gen:\n${burden.breakdown.map(b => `• ${b.gene}: ${b.burden} (${b.reason})`).join('\n')}\n\n📚 ${burden.reference}`,
                confidence: 0.85,
                category: 'Carga Metabólica',
                references: [burden.reference]
            });
        }

        this.panel?.webview.postMessage({ command: 'analysisResult', suggestions });
    }

    /**
     * Análisis dedicado de red regulatoria con SVG
     */
    private async analyzeNetwork() {
        const editor = vscode.window.activeTextEditor;
        if (!editor) { vscode.window.showWarningMessage('Abra un archivo .bio para analizar'); return; }

        const text = editor.document.getText();
        const topology = RegulatoryNetworkAnalyzer.buildNetwork(text);
        const svg = RegulatoryNetworkAnalyzer.generateNetworkSVG(topology);

        this.panel?.webview.postMessage({
            command: 'networkResult',
            topology: {
                nodes: topology.nodes,
                edgeCount: topology.edges.length,
                edges: topology.edges.map(e => `${e.from} ${e.type === 'activation' ? '→' : '⊣'} ${e.to}`),
                motifs: topology.motifs,
                feedbackLoops: topology.feedbackLoops,
                svg
            }
        });
    }

    /**
     * Genera Score Card detallado
     */
    private async generateScoreCard() {
        const editor = vscode.window.activeTextEditor;
        if (!editor) { vscode.window.showWarningMessage('Abra un archivo .bio'); return; }

        const text = editor.document.getText();
        const lines = text.split('\n');
        const scoreCard = CircuitScorer.score(text, lines);

        this.panel?.webview.postMessage({ command: 'scoreCardResult', scoreCard });
    }

    /**
     * Estimación de carga metabólica dedicada
     */
    private async estimateMetabolicBurden() {
        const editor = vscode.window.activeTextEditor;
        if (!editor) { vscode.window.showWarningMessage('Abra un archivo .bio'); return; }

        const text = editor.document.getText();
        const burden = MetabolicBurdenEstimator.estimate(text);

        this.panel?.webview.postMessage({ command: 'burdenResult', burden });
    }

    private async suggestPartsForContext(ctx: string) {
        const ctxLower = ctx.toLowerCase();
        const editor = vscode.window.activeTextEditor;
        const editorText = editor?.document.getText().toLowerCase() || '';

        const parts = PART_DATABASE.map(p => {
            let score = 0;
            const reasons: string[] = [];

            // Factor 1: Type match (0.35)
            if (ctxLower.includes(p.type)) { score += 0.35; reasons.push('tipo coincide'); }

            // Factor 2: Name/keyword match (0.25)
            const nameWords = p.name.toLowerCase().split(/\s+/);
            for (const w of nameWords) {
                if (ctxLower.includes(w)) { score += 0.25; reasons.push(`"${w}" encontrado`); break; }
            }

            // Factor 3: Strength level match (0.2)
            if (ctxLower.includes('strong') || ctxLower.includes('fuerte') || ctxLower.includes('alto')) {
                if (p.reason.includes('1.0') || p.name.includes('Strong')) { score += 0.2; reasons.push('alta expresión'); }
            }
            if (ctxLower.includes('weak') || ctxLower.includes('débil') || ctxLower.includes('bajo')) {
                if (p.reason.includes('0.0') || p.name.includes('Weak')) { score += 0.2; reasons.push('baja expresión'); }
            }
            if (ctxLower.includes('medium') || ctxLower.includes('medio') || ctxLower.includes('moderado')) {
                if (p.name.includes('Medium') || p.reason.includes('0.3') || p.reason.includes('0.47')) {
                    score += 0.2; reasons.push('expresión media');
                }
            }

            // Factor 4: Context from editor (0.1)
            if (editorText.includes('inducible') && p.reason.includes('repressed')) { score += 0.1; reasons.push('compatible con inducible'); }
            if (editorText.includes('reporter') && (p.name.includes('GFP') || p.name.includes('RFP') || p.name.includes('YFP'))) {
                score += 0.1; reasons.push('reportero fluorescente');
            }

            // Factor 5: Specific molecule/function match (0.1)
            if (ctxLower.includes('gfp') && p.partId === 'BBa_E0040') { score += 0.3; reasons.push('GFP directo'); }
            if (ctxLower.includes('rfp') && p.partId === 'BBa_E1010') { score += 0.3; reasons.push('mRFP directo'); }
            if (ctxLower.includes('lac') && p.partId === 'BBa_R0010') { score += 0.3; reasons.push('pLac directo'); }
            if (ctxLower.includes('tet') && p.partId === 'BBa_R0040') { score += 0.3; reasons.push('pTetR directo'); }
            if (ctxLower.includes('arabinose') && p.partId === 'BBa_I0500') { score += 0.3; reasons.push('pBad directo'); }

            return {
                ...p,
                score: Math.min(score, 1.0),
                reason: reasons.length > 0 ? reasons.join(', ') : 'parte disponible en registro iGEM'
            };
        }).filter(p => p.score > 0.1).sort((a, b) => b.score - a.score).slice(0, 10);

        this.panel?.webview.postMessage({ command: 'partsResult', parts });
    }

    private async explainCurrentCircuit() {
        const editor = vscode.window.activeTextEditor;
        if (!editor) { vscode.window.showWarningMessage('Abra un archivo .bio para explicar'); return; }

        const text = editor.document.getText();
        const lines = text.split('\n');

        const circuitName = text.match(/genetic_circuit\s+(\w+)/)?.[1] || 'sin nombre';
        const promoters = lines.filter(l => l.match(/^\s*promoter\s+/));
        const genes = lines.filter(l => l.match(/^\s*gene\s+/));
        const terminators = lines.filter(l => l.match(/^\s*terminator\s+/));
        const rbsList = lines.filter(l => l.match(/^\s*rbs\s+/));

        // Analyze regulatory network
        const topology = RegulatoryNetworkAnalyzer.buildNetwork(text);
        const burden = MetabolicBurdenEstimator.estimate(text);

        const explanation = {
            name: circuitName,
            summary: `Circuito genético con ${promoters.length} promotor(es), ${rbsList.length} RBS, ${genes.length} gen(es) y ${terminators.length} terminador(es).`,
            components: [
                ...promoters.map(l => {
                    const name = l.match(/promoter\s+(\w+)/)?.[1] || '?';
                    const type = l.match(/type:\s*"([^"]+)"/)?.[1] || 'constitutive';
                    const strength = l.match(/strength:\s*([\d.]+)/)?.[1];
                    return `📢 Promotor **${name}** (${type}${strength ? `, ${strength} RPU` : ''})`;
                }),
                ...rbsList.map(l => {
                    const name = l.match(/rbs\s+(\w+)/)?.[1] || '?';
                    const strength = l.match(/strength:\s*([\d.]+)/)?.[1];
                    return `🔗 RBS **${name}**${strength ? ` (${strength} RPU)` : ''}`;
                }),
                ...genes.map(l => {
                    const name = l.match(/gene\s+(\w+)/)?.[1] || '?';
                    const product = l.match(/product:\s*"([^"]+)"/)?.[1] || '?';
                    return `🧬 Gen **${name}** → ${product}`;
                }),
                ...terminators.map(l => {
                    const name = l.match(/terminator\s+(\w+)/)?.[1] || '?';
                    const eff = l.match(/efficiency:\s*([\d.]+)/)?.[1] || '?';
                    return `🛑 Terminador **${name}** (eficiencia: ${eff})`;
                })
            ],
            flowDescription: this.describeCircuitFlow(text),
            networkInfo: {
                nodes: topology.nodes,
                edges: topology.edges.length,
                motifs: topology.motifs.map(m => ({
                    type: m.type,
                    description: m.description,
                    behavior: m.dynamicBehavior,
                    reference: m.reference
                })),
                feedbackLoops: topology.feedbackLoops
            },
            burdenCategory: burden.category,
            burdenTotal: burden.totalBurden,
            predictedBehavior: this.predictBehavior(topology, burden)
        };

        this.panel?.webview.postMessage({ command: 'explanationResult', explanation });
    }

    /**
     * Predice comportamiento dinámico cualitativo basado en topología y carga
     */
    private predictBehavior(topology: CircuitTopology, burden: MetabolicBurdenResult): string {
        const predictions: string[] = [];

        // Based on motifs
        for (const motif of topology.motifs) {
            switch (motif.type) {
                case 'toggle_switch':
                    predictions.push('⚡ Biestabilidad esperada — dos estados estables, transición inducible');
                    break;
                case 'repressilator':
                    predictions.push('🔄 Oscilaciones sostenidas esperadas — verificar balanceo de tasas');
                    break;
                case 'ffl_coherent':
                    predictions.push('⏱️ Retardo en activación (sign-sensitive delay) — filtra pulsos cortos');
                    break;
                case 'ffl_incoherent':
                    predictions.push('📈 Respuesta pulsátil al activar — pico seguido de adaptación');
                    break;
                case 'autorepression':
                    predictions.push('🎯 Respuesta rápida con ruido bajo — homeostasis mejorada');
                    break;
                case 'autoactivation':
                    predictions.push('🔀 Posible respuesta bimodal — distribución ON/OFF en población');
                    break;
                case 'cascade':
                    predictions.push('📊 Señalización secuencial con retardo acumulativo');
                    break;
            }
        }

        // Based on feedback loops
        if (topology.feedbackLoops.length > 0) {
            const negativeLoops = topology.feedbackLoops.filter(loop => {
                let signProduct = 1;
                for (let i = 0; i < loop.length; i++) {
                    const from = loop[i];
                    const to = loop[(i + 1) % loop.length];
                    const edge = topology.edges.find(e => e.from === from && e.to === to);
                    if (edge?.type === 'repression') signProduct *= -1;
                }
                return signProduct < 0;
            });
            if (negativeLoops.length > 0) {
                predictions.push(`🔁 ${negativeLoops.length} feedback loop(s) negativo(s) — estabilidad y homeostasis`);
            }
        }

        // Based on burden
        if (burden.category === 'high' || burden.category === 'critical') {
            predictions.push(`⚠️ Carga metabólica ${burden.category} (${burden.totalBurden}) — posible reducción de crecimiento y mutations de escape`);
        }

        if (predictions.length === 0) {
            if (topology.edges.length === 0) {
                predictions.push('📋 Circuito sin interacciones regulatorias detectadas — expresión constitutiva lineal');
            } else {
                predictions.push('📋 Comportamiento regulado estándar — analice el diagrama de red para más detalle');
            }
        }

        return predictions.join('\n');
    }

    private describeCircuitFlow(text: string): string {
        const hasInducible = text.includes('inducible');
        const hasRepressible = text.includes('repressible');
        const hasConstitutive = text.includes('constitutive');
        const parts: string[] = [];

        if (hasConstitutive) parts.push('expresión constitutiva basal');
        if (hasInducible) {
            const inducer = text.match(/inducer:\s*"([^"]+)"/)?.[1];
            parts.push(`expresión inducible${inducer ? ` por ${inducer}` : ''}`);
        }
        if (hasRepressible) {
            const repressor = text.match(/repressor:\s*"([^"]+)"/)?.[1];
            parts.push(`regulación negativa${repressor ? ` por ${repressor}` : ''}`);
        }

        return parts.length > 0
            ? `El circuito usa: ${parts.join(', ')}.`
            : 'Flujo regulatorio no determinado a partir del código.';
    }

    private async generateOptimizationSuggestions() {
        const editor = vscode.window.activeTextEditor;
        if (!editor) return;
        const text = editor.document.getText();
        const optimizations: DesignSuggestion[] = [];

        // Sugerir promotores balanceados
        const strengths = [...text.matchAll(/strength:\s*([\d.]+)/g)].map(m => parseFloat(m[1]));
        if (strengths.length > 0) {
            const avg = strengths.reduce((a, b) => a + b, 0) / strengths.length;
            if (avg > 0.8) {
                optimizations.push({
                    type: 'optimization', title: 'Balancear expresión',
                    description: `La fuerza promedio es ${avg.toFixed(2)}. Expresión muy alta puede causar toxicidad. Considere reducir algunos valores.`,
                    confidence: 0.85, category: 'Expresión'
                });
            }
        }

        // Verificar codon optimization
        if (!text.includes('codon_optimized')) {
            optimizations.push({
                type: 'optimization', title: 'Optimización de codones',
                description: 'No se detecta optimización de codones. Use la herramienta de optimización de codones (Ctrl+Shift+P → SynBio: Optimize Codons) para mejorar la expresión.',
                confidence: 0.7, category: 'Traducción'
            });
        }

        // RBS Calculator suggestion
        const rbsStrengths = [...text.matchAll(/rbs\s+\w+\s*\(strength:\s*([\d.]+)/g)].map(m => parseFloat(m[1]));
        if (rbsStrengths.some(s => s > 0.9)) {
            optimizations.push({
                type: 'optimization', title: 'Ajustar fuerza RBS',
                description: 'RBS > 1.0 RPU (BBa_B0034) puede causar inclusion bodies por saturación ribosomal. Use 0.3-0.6 RPU (BBa_B0032) para mejor solubilidad (Rosano & Ceccarelli 2014 Front Microbiol 5:172, Salis et al. 2009 Nat Biotechnol 27:946).',
                confidence: 0.8, category: 'Traducción'
            });
        }

        this.panel?.webview.postMessage({ command: 'optimizationsResult', optimizations });
    }

    private getWebviewContent(): string {
        return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>AI Design Assistant</title>
<style>
    :root { --bg: #1e1e2e; --surface: #2a2a3e; --primary: #7c3aed; --accent: #22d3ee;
            --success: #10b981; --warning: #f59e0b; --error: #ef4444; --text: #e2e8f0;
            --text2: #94a3b8; --border: #334155; }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Segoe UI', system-ui, sans-serif; background: var(--bg); color: var(--text); padding: 16px; }
    h1 { font-size: 1.5em; margin-bottom: 8px; display: flex; align-items: center; gap: 8px; }
    h2 { font-size: 1.1em; margin: 16px 0 8px; color: var(--accent); }
    h3 { font-size: 0.95em; margin: 10px 0 6px; color: var(--text); }
    .subtitle { color: var(--text2); font-size: 0.85em; margin-bottom: 16px; }
    .tabs { display: flex; gap: 4px; margin-bottom: 16px; flex-wrap: wrap; }
    .tab { padding: 8px 12px; border: 1px solid var(--border); background: var(--surface); color: var(--text2);
           border-radius: 6px; cursor: pointer; font-size: 0.8em; transition: all 0.2s; }
    .tab:hover { border-color: var(--primary); color: var(--text); }
    .tab.active { background: var(--primary); color: white; border-color: var(--primary); }
    .panel { display: none; }
    .panel.active { display: block; }
    .btn { padding: 8px 16px; border: none; border-radius: 6px; cursor: pointer; font-size: 0.85em;
           font-weight: 600; transition: all 0.2s; }
    .btn-primary { background: var(--primary); color: white; }
    .btn-primary:hover { background: #6d28d9; }
    .btn-accent { background: var(--accent); color: #000; }
    .btn-accent:hover { background: #06b6d4; }
    .btn-success { background: var(--success); color: #000; }
    .btn-sm { padding: 5px 12px; font-size: 0.8em; }
    .card { background: var(--surface); border: 1px solid var(--border); border-radius: 8px; padding: 14px; margin-bottom: 10px; }
    .card:hover { border-color: var(--primary); }
    .pattern-card { cursor: pointer; }
    .pattern-card .complexity { font-size: 0.7em; padding: 2px 8px; border-radius: 10px; font-weight: 600; }
    .complexity.basic { background: #10b981; color: #000; }
    .complexity.intermediate { background: #f59e0b; color: #000; }
    .complexity.advanced { background: #ef4444; color: white; }
    .pattern-name { font-weight: 700; font-size: 1.05em; display: flex; justify-content: space-between; align-items: center; }
    .pattern-desc { color: var(--text2); font-size: 0.85em; margin: 6px 0; }
    .pattern-use { font-size: 0.8em; color: var(--accent); }
    .pattern-ref { font-size: 0.75em; color: var(--text2); font-style: italic; margin-top: 4px; }
    .suggestion { border-left: 3px solid; padding-left: 12px; margin-bottom: 10px; }
    .suggestion.warning { border-color: var(--warning); }
    .suggestion.optimization { border-color: var(--accent); }
    .suggestion.pattern { border-color: var(--primary); }
    .suggestion.fix { border-color: var(--success); }
    .suggestion-title { font-weight: 600; font-size: 0.95em; }
    .suggestion-desc { color: var(--text2); font-size: 0.85em; margin-top: 4px; white-space: pre-line; }
    .confidence { font-size: 0.75em; color: var(--text2); }
    .actions-row { display: flex; gap: 8px; margin: 12px 0; flex-wrap: wrap; }
    .part-item { display: flex; justify-content: space-between; align-items: center; padding: 8px;
                 background: var(--surface); border-radius: 6px; margin-bottom: 6px; border: 1px solid var(--border); }
    .part-info { flex: 1; }
    .part-name { font-weight: 600; font-size: 0.9em; }
    .part-id { color: var(--text2); font-size: 0.8em; }
    .score-bar { width: 60px; height: 6px; background: var(--border); border-radius: 3px; overflow: hidden; }
    .score-fill { height: 100%; border-radius: 3px; }
    .explanation { line-height: 1.6; }
    .comp-item { padding: 4px 0; font-size: 0.9em; }
    .search-box { width: 100%; padding: 8px 12px; background: var(--surface); border: 1px solid var(--border);
                  border-radius: 6px; color: var(--text); font-size: 0.9em; margin-bottom: 10px; }
    .search-box:focus { outline: none; border-color: var(--primary); }
    .empty-state { text-align: center; padding: 30px; color: var(--text2); }
    .empty-state .icon { font-size: 2.5em; margin-bottom: 10px; }
    #results { min-height: 100px; }
    /* Score Card styles */
    .score-card { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 10px; margin: 12px 0; }
    .score-item { background: var(--surface); border: 1px solid var(--border); border-radius: 8px; padding: 12px; text-align: center; }
    .score-label { font-size: 0.8em; color: var(--text2); margin-bottom: 4px; }
    .score-value { font-size: 1.8em; font-weight: 700; }
    .score-detail { font-size: 0.75em; color: var(--text2); margin-top: 4px; }
    .grade { display: inline-block; font-size: 2.5em; font-weight: 800; padding: 8px 16px; border-radius: 12px; }
    .grade-A { background: #10b981; color: #000; }
    .grade-B { background: #22d3ee; color: #000; }
    .grade-C { background: #f59e0b; color: #000; }
    .grade-D { background: #f97316; color: #000; }
    .grade-F { background: #ef4444; color: white; }
    .overall-score { text-align: center; margin: 16px 0; }
    .overall-number { font-size: 1.2em; color: var(--text2); margin-top: 4px; }
    /* Motif card */
    .motif-card { background: var(--surface); border-left: 3px solid var(--primary); padding: 10px 12px; margin-bottom: 8px; border-radius: 0 6px 6px 0; }
    .motif-type { font-weight: 600; color: var(--accent); font-size: 0.9em; text-transform: capitalize; }
    .motif-desc { font-size: 0.85em; color: var(--text); margin: 4px 0; }
    .motif-behavior { font-size: 0.8em; color: var(--text2); }
    .motif-ref { font-size: 0.75em; color: var(--text2); font-style: italic; }
    /* Burden */
    .burden-meter { width: 100%; height: 24px; background: var(--border); border-radius: 12px; overflow: hidden; margin: 12px 0; }
    .burden-fill { height: 100%; border-radius: 12px; transition: width 0.5s; display: flex; align-items: center; justify-content: center; font-size: 0.75em; font-weight: 600; }
    .burden-low { background: var(--success); color: #000; }
    .burden-moderate { background: var(--warning); color: #000; }
    .burden-high { background: #f97316; color: #000; }
    .burden-critical { background: var(--error); color: white; }
    .burden-gene { display: flex; justify-content: space-between; padding: 6px 0; border-bottom: 1px solid var(--border); font-size: 0.85em; }
    /* Network SVG container */
    .network-svg { margin: 12px 0; border: 1px solid var(--border); border-radius: 8px; overflow: hidden; }
    .network-svg svg { width: 100%; height: auto; }
    .edge-list { font-size: 0.85em; color: var(--text2); margin: 8px 0; }
    .edge-item { padding: 2px 0; }
    .loop-badge { display: inline-block; background: var(--primary); color: white; padding: 2px 8px; border-radius: 10px; font-size: 0.75em; margin: 2px; }
    /* Recommendation list */
    .rec-item { padding: 4px 0 4px 16px; font-size: 0.85em; color: var(--text2); position: relative; }
    .rec-item::before { content: '💡'; position: absolute; left: 0; }
    .issue-item { padding: 4px 0 4px 16px; font-size: 0.85em; color: var(--warning); position: relative; }
    .issue-item::before { content: '⚠️'; position: absolute; left: 0; }
</style>
</head>
<body>
    <h1>🤖 AI Design Assistant</h1>
    <p class="subtitle">Análisis de red regulatoria, score card, carga metabólica y recomendaciones inteligentes</p>

    <div class="tabs">
        <div class="tab active" onclick="switchTab('analyze')">📊 Análisis</div>
        <div class="tab" onclick="switchTab('network')">🕸️ Red</div>
        <div class="tab" onclick="switchTab('patterns')">🧩 Patrones</div>
        <div class="tab" onclick="switchTab('parts')">🔧 Partes</div>
        <div class="tab" onclick="switchTab('explain')">📖 Explicar</div>
        <div class="tab" onclick="switchTab('optimize')">⚡ Optimizar</div>
    </div>

    <!-- Análisis -->
    <div id="tab-analyze" class="panel active">
        <div class="actions-row">
            <button class="btn btn-primary" onclick="analyzeCurrent()">🔍 Analizar Circuito</button>
            <button class="btn btn-accent" onclick="scoreCard()">📋 Score Card</button>
            <button class="btn btn-success" onclick="metabolicBurden()">🧪 Carga Metabólica</button>
        </div>
        <div id="analysis-results">
            <div class="empty-state">
                <div class="icon">🔬</div>
                <p>Analiza el circuito actual: topología de red, reglas de compatibilidad, score card y carga metabólica.</p>
            </div>
        </div>
        <div id="scorecard-results"></div>
        <div id="burden-results"></div>
    </div>

    <!-- Network -->
    <div id="tab-network" class="panel">
        <div class="actions-row">
            <button class="btn btn-primary" onclick="networkAnalysis()">🕸️ Analizar Red Regulatoria</button>
        </div>
        <div id="network-results">
            <div class="empty-state">
                <div class="icon">🕸️</div>
                <p>Construye el grafo de interacciones regulatorias, detecta motifs (toggle switch, repressilator, FFL, cascadas) y feedback loops.</p>
                <p style="font-size:0.8em;margin-top:8px;color:var(--text2)">Basado en: Alon U (2007) "An Introduction to Systems Biology" · Shen-Orr et al. (2002) Nat Genet 31:64</p>
            </div>
        </div>
    </div>

    <!-- Patrones -->
    <div id="tab-patterns" class="panel">
        <h2>Patrones de Diseño Genético</h2>
        <div id="patterns-list"></div>
    </div>

    <!-- Partes -->
    <div id="tab-parts" class="panel">
        <h2>Recomendador de Partes iGEM</h2>
        <input type="text" class="search-box" id="partSearch" placeholder="¿Qué necesita? (ej: 'strong promoter', 'gfp', 'arabinose', 'terminador'...)" onkeyup="if(event.key==='Enter')suggestParts()">
        <button class="btn btn-accent btn-sm" onclick="suggestParts()">🔍 Buscar partes</button>
        <p style="font-size:0.75em;color:var(--text2);margin-top:4px">Scoring multi-factor: tipo, nombre, nivel de expresión, contexto del editor, especificidad</p>
        <div id="parts-results" style="margin-top:12px;">
            <div class="empty-state">
                <div class="icon">🔧</div>
                <p>Describa lo que necesita y le recomendaré partes iGEM compatibles con scoring multi-factor.</p>
            </div>
        </div>
    </div>

    <!-- Explicar -->
    <div id="tab-explain" class="panel">
        <div class="actions-row">
            <button class="btn btn-primary" onclick="explainCircuit()">📖 Explicar Circuito Actual</button>
        </div>
        <div id="explanation-results">
            <div class="empty-state">
                <div class="icon">📖</div>
                <p>Explicación detallada: componentes, flujo regulatorio, motifs de red, predicción de comportamiento dinámico.</p>
            </div>
        </div>
    </div>

    <!-- Optimizar -->
    <div id="tab-optimize" class="panel">
        <div class="actions-row">
            <button class="btn btn-accent" onclick="getOptimizations()">⚡ Generar Sugerencias de Optimización</button>
        </div>
        <div id="optimization-results">
            <div class="empty-state">
                <div class="icon">⚡</div>
                <p>Sugerencias de optimización: expresión, codones, RBS, balanceo de carga.</p>
            </div>
        </div>
    </div>

<script>
    const vscode = acquireVsCodeApi();
    const patterns = ${JSON.stringify(DESIGN_PATTERNS)};

    function switchTab(name) {
        document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
        event.target.classList.add('active');
        document.getElementById('tab-' + name).classList.add('active');
    }

    // Patrones
    function renderPatterns() {
        const container = document.getElementById('patterns-list');
        container.innerHTML = patterns.map((p, i) => \`
            <div class="card pattern-card" onclick="insertPattern(\${i})">
                <div class="pattern-name">
                    \${p.name}
                    <span class="complexity \${p.complexity}">\${p.complexity}</span>
                </div>
                <div class="pattern-desc">\${p.description}</div>
                <div class="pattern-use">📌 \${p.useCase}</div>
                <div class="pattern-ref">📚 \${p.reference || ''}</div>
                <div style="margin-top:8px">
                    <button class="btn btn-primary btn-sm" onclick="event.stopPropagation();insertPattern(\${i})">
                        📋 Insertar en editor
                    </button>
                </div>
            </div>
        \`).join('');
    }

    function insertPattern(index) { vscode.postMessage({ command: 'insertPattern', patternIndex: index }); }
    function analyzeCurrent() { vscode.postMessage({ command: 'analyzeCurrent' }); }
    function suggestParts() {
        const ctx = document.getElementById('partSearch').value;
        if (ctx) vscode.postMessage({ command: 'suggestParts', context: ctx });
    }
    function explainCircuit() { vscode.postMessage({ command: 'explainCircuit' }); }
    function getOptimizations() { vscode.postMessage({ command: 'optimizeSuggestions' }); }
    function networkAnalysis() { vscode.postMessage({ command: 'networkAnalysis' }); }
    function scoreCard() { vscode.postMessage({ command: 'scoreCard' }); }
    function metabolicBurden() { vscode.postMessage({ command: 'metabolicBurden' }); }

    window.addEventListener('message', event => {
        const msg = event.data;
        switch(msg.command) {
            case 'analysisResult':
                renderSuggestions('analysis-results', msg.suggestions);
                break;
            case 'partsResult':
                renderParts(msg.parts);
                break;
            case 'explanationResult':
                renderExplanation(msg.explanation);
                break;
            case 'optimizationsResult':
                renderSuggestions('optimization-results', msg.optimizations);
                break;
            case 'networkResult':
                renderNetwork(msg.topology);
                break;
            case 'scoreCardResult':
                renderScoreCard(msg.scoreCard);
                break;
            case 'burdenResult':
                renderBurden(msg.burden);
                break;
        }
    });

    function renderSuggestions(containerId, suggestions) {
        const el = document.getElementById(containerId);
        if (!suggestions || suggestions.length === 0) {
            el.innerHTML = '<div class="card" style="text-align:center;color:var(--success)">✅ No se encontraron problemas. El diseño se ve bien.</div>';
            return;
        }
        el.innerHTML = suggestions.map(s => \`
            <div class="suggestion \${s.type}">
                <div class="suggestion-title">\${s.type === 'warning' ? '⚠️' : s.type === 'optimization' ? '💡' : s.type === 'pattern' ? '🧩' : '🔧'} \${s.title}</div>
                <div class="suggestion-desc">\${s.description}</div>
                <div class="confidence">Confianza: \${Math.round(s.confidence * 100)}% · \${s.category}</div>
            </div>
        \`).join('');
    }

    function renderParts(parts) {
        const el = document.getElementById('parts-results');
        if (!parts || parts.length === 0) {
            el.innerHTML = '<div class="card">No se encontraron partes relevantes. Intente con otros términos.</div>';
            return;
        }
        el.innerHTML = parts.map(p => {
            const pct = Math.round(p.score * 100);
            const color = pct >= 70 ? 'var(--success)' : pct >= 40 ? 'var(--accent)' : 'var(--warning)';
            return \`
            <div class="part-item">
                <div class="part-info">
                    <div class="part-name">\${p.name}</div>
                    <div class="part-id">\${p.partId} · \${p.type} · \${p.reason}</div>
                </div>
                <div style="text-align:right;min-width:80px">
                    <div class="score-bar"><div class="score-fill" style="width:\${pct}%;background:\${color}"></div></div>
                    <div style="font-size:0.7em;color:var(--text2);margin-top:2px">\${pct}% match</div>
                </div>
            </div>\`;
        }).join('');
    }

    function renderExplanation(exp) {
        const el = document.getElementById('explanation-results');
        let html = \`
            <div class="card explanation">
                <h2>🧬 \${exp.name}</h2>
                <p style="margin:8px 0;color:var(--text2)">\${exp.summary}</p>
                <h2>Componentes</h2>
                \${exp.components.map(c => '<div class="comp-item">' + c + '</div>').join('')}
                <h2 style="margin-top:12px">Flujo Regulatorio</h2>
                <p style="color:var(--text2)">\${exp.flowDescription}</p>\`;

        // Network info
        if (exp.networkInfo && exp.networkInfo.nodes.length > 0) {
            html += '<h2 style="margin-top:12px">🕸️ Red Regulatoria</h2>';
            html += '<p style="font-size:0.85em;color:var(--text2)">' + exp.networkInfo.nodes.length + ' nodos, ' + exp.networkInfo.edges + ' interacciones</p>';
            if (exp.networkInfo.motifs.length > 0) {
                html += '<h3>Motifs Detectados</h3>';
                for (const m of exp.networkInfo.motifs) {
                    html += '<div class="motif-card"><div class="motif-type">' + m.type.replace(/_/g, ' ') + '</div>';
                    html += '<div class="motif-desc">' + m.description + '</div>';
                    html += '<div class="motif-behavior">📊 ' + m.behavior + '</div>';
                    html += '<div class="motif-ref">📚 ' + m.reference + '</div></div>';
                }
            }
            if (exp.networkInfo.feedbackLoops.length > 0) {
                html += '<h3>Feedback Loops</h3>';
                for (const loop of exp.networkInfo.feedbackLoops) {
                    html += '<div style="margin:4px 0">';
                    loop.forEach(n => { html += '<span class="loop-badge">' + n + '</span> → '; });
                    html += '<span class="loop-badge">' + loop[0] + '</span></div>';
                }
            }
        }

        // Predicted behavior
        if (exp.predictedBehavior) {
            html += '<h2 style="margin-top:12px">🔮 Predicción de Comportamiento</h2>';
            html += '<p style="color:var(--text2);white-space:pre-line;font-size:0.9em">' + exp.predictedBehavior + '</p>';
        }

        // Burden summary
        if (exp.burdenTotal !== undefined) {
            const burdenColor = exp.burdenCategory === 'low' ? 'var(--success)' : exp.burdenCategory === 'moderate' ? 'var(--warning)' : 'var(--error)';
            html += '<h2 style="margin-top:12px">🧪 Carga Metabólica</h2>';
            html += '<p style="font-size:0.9em">Total: <span style="color:' + burdenColor + ';font-weight:700">' + exp.burdenTotal + '</span> (' + exp.burdenCategory + ')</p>';
        }

        html += '</div>';
        el.innerHTML = html;
    }

    function renderNetwork(topo) {
        const el = document.getElementById('network-results');
        if (!topo || topo.nodes.length === 0) {
            el.innerHTML = '<div class="card"><p style="color:var(--text2)">No se detectaron interacciones regulatorias. Asegúrese de que los promotores tengan propiedades repressor/activator y los genes tengan product definido.</p></div>';
            return;
        }

        let html = '<div class="card">';
        html += '<h3>🕸️ Grafo de Red Regulatoria</h3>';
        html += '<p style="font-size:0.85em;color:var(--text2)">' + topo.nodes.length + ' nodos (proteínas), ' + topo.edgeCount + ' interacciones</p>';

        // SVG diagram
        html += '<div class="network-svg">' + topo.svg + '</div>';

        // Edge list
        html += '<h3>Interacciones</h3>';
        html += '<div class="edge-list">';
        for (const e of topo.edges) {
            html += '<div class="edge-item">' + e + '</div>';
        }
        html += '</div>';

        // Motifs
        if (topo.motifs.length > 0) {
            html += '<h3>Motifs de Red Detectados</h3>';
            for (const m of topo.motifs) {
                html += '<div class="motif-card">';
                html += '<div class="motif-type">' + m.type.replace(/_/g, ' ') + ' (' + m.nodes.join(', ') + ')</div>';
                html += '<div class="motif-desc">' + m.description + '</div>';
                html += '<div class="motif-behavior">📊 ' + m.dynamicBehavior + '</div>';
                html += '<div class="motif-ref">📚 ' + m.reference + '</div>';
                html += '</div>';
            }
        }

        // Feedback loops
        if (topo.feedbackLoops.length > 0) {
            html += '<h3>Feedback Loops (' + topo.feedbackLoops.length + ')</h3>';
            for (const loop of topo.feedbackLoops) {
                html += '<div style="margin:4px 0">';
                loop.forEach(n => { html += '<span class="loop-badge">' + n + '</span> → '; });
                html += '<span class="loop-badge">' + loop[0] + '</span></div>';
            }
        }

        html += '</div>';
        el.innerHTML = html;
    }

    function renderScoreCard(sc) {
        const el = document.getElementById('scorecard-results');
        const cats = [
            { key: 'structure', label: '🏗️ Estructura', data: sc.structure },
            { key: 'safety', label: '🛡️ Seguridad', data: sc.safety },
            { key: 'expression', label: '📊 Expresión', data: sc.expression },
            { key: 'modularity', label: '🧩 Modularidad', data: sc.modularity },
            { key: 'predictability', label: '🎯 Predictibilidad', data: sc.predictability }
        ];

        let html = '<div class="card"><div class="overall-score">';
        html += '<span class="grade grade-' + sc.grade + '">' + sc.grade + '</span>';
        html += '<div class="overall-number">' + sc.overall + '/100 puntos</div></div>';

        html += '<div class="score-card">';
        for (const cat of cats) {
            const pct = Math.round((cat.data.score / cat.data.max) * 100);
            const color = pct >= 80 ? 'var(--success)' : pct >= 50 ? 'var(--warning)' : 'var(--error)';
            html += '<div class="score-item">';
            html += '<div class="score-label">' + cat.label + '</div>';
            html += '<div class="score-value" style="color:' + color + '">' + cat.data.score + '<span style="font-size:0.4em;color:var(--text2)">/' + cat.data.max + '</span></div>';
            html += '<div class="score-detail">' + pct + '%</div>';
            html += '</div>';
        }
        html += '</div>';

        // Issues and recommendations
        const allIssues = cats.flatMap(c => c.data.issues || []);
        const allRecs = cats.flatMap(c => c.data.recommendations || []);
        if (allIssues.length > 0) {
            html += '<h3>Problemas Detectados</h3>';
            for (const issue of allIssues) { html += '<div class="issue-item">' + issue + '</div>'; }
        }
        if (allRecs.length > 0) {
            html += '<h3>Recomendaciones</h3>';
            for (const rec of allRecs) { html += '<div class="rec-item">' + rec + '</div>'; }
        }
        html += '</div>';
        el.innerHTML = html;
    }

    function renderBurden(burden) {
        const el = document.getElementById('burden-results');
        const pct = Math.min((burden.totalBurden / 4.0) * 100, 100);
        const cls = 'burden-' + burden.category;

        let html = '<div class="card">';
        html += '<h3>🧪 Carga Metabólica Estimada</h3>';
        html += '<div class="burden-meter"><div class="burden-fill ' + cls + '" style="width:' + pct + '%">' + burden.totalBurden + ' unidades</div></div>';
        html += '<p style="font-size:0.9em;color:var(--text2)">' + burden.recommendation + '</p>';

        if (burden.breakdown.length > 0) {
            html += '<h3 style="margin-top:12px">Desglose por Gen</h3>';
            for (const b of burden.breakdown) {
                const bPct = Math.min((b.burden / 2.0) * 100, 100);
                const bColor = b.burden < 0.5 ? 'var(--success)' : b.burden < 1.0 ? 'var(--warning)' : 'var(--error)';
                html += '<div class="burden-gene"><span>' + b.gene + '</span><span style="color:' + bColor + '">' + b.burden + ' (' + b.reason + ')</span></div>';
            }
        }
        html += '<p style="font-size:0.75em;color:var(--text2);margin-top:10px;font-style:italic">📚 ' + burden.reference + '</p>';
        html += '</div>';
        el.innerHTML = html;
    }

    renderPatterns();
</script>
</body>
</html>`;
    }

    dispose() {
        this.panel?.dispose();
        this.completionProvider?.dispose();
        this.hoverProvider?.dispose();
        this.codeActionProvider?.dispose();
        this.diagnosticCollection.dispose();
        if (this.debounceTimer) clearTimeout(this.debounceTimer);
    }
}
