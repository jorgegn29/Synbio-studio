/**
 * ══════════════════════════════════════════════════════════════════
 * SynBio-LLVM — Cloning Strategy Planner (Fase 17)
 *
 * Planificador de estrategias de clonación:
 *   1. Selección de método de ensamblaje:
 *      - Gibson Assembly (overlap 20-40bp)
 *      - Golden Gate (BsaI/BpiI, 4bp overhangs)
 *      - BioBrick (EcoRI/XbaI/SpeI/PstI)
 *      - Gateway (attB/attP recombination)
 *      - In-Fusion (15bp overlap)
 *      - Restriction/Ligation clásica
 *   2. Planificación de fragmentos con solapamientos
 *   3. Auto-diseño de primers para cada fragmento
 *   4. Verificación de compatibilidad de overhangs
 *   5. Estimación de temperatura de annealing
 *   6. Worklist de pipeteo (master mix, volúmenes)
 *   7. Checklist de verificación post-clonación
 *   8. Visualización de la estrategia
 *
 * Soporta flujos de trabajo estándar en:
 *   - iGEM cloning
 *   - CIDAR MoClo
 *   - Addgene protocols
 * ══════════════════════════════════════════════════════════════════
 */
import * as vscode from 'vscode';
import { areEndsCompatible, checkBioBrickCompatibility, findRestrictionSites, RestrictionSite } from './real-restriction-enzymes';
import {
    AssemblyPreview,
    buildAssemblyPreview,
    getBackboneModels,
    parseBioScriptAssembly,
    PlannerAssemblyMethod,
    SemanticAssemblyParseResult,
} from './plasmid-assembly-engine';

// ── Types ──────────────────────────────────────────────────────────────

interface CloningProject {
    id: string;
    name: string;
    method: AssemblyMethod;
    vector: VectorInfo;
    inserts: InsertFragment[];
    primers: PrimerDesign[];
    protocol: ProtocolStep[];
    date: string;
}

type AssemblyMethod = PlannerAssemblyMethod;

interface VectorInfo {
    name: string;
    sequence: string;
    size: number;
    linearizationSites: string[];
    resistance: string;
    origin: string;
}

interface InsertFragment {
    id: string;
    name: string;
    sequence: string;
    size: number;
    sourceTemplate: string;
    overlapFwd: string;
    overlapRev: string;
}

interface PrimerDesign {
    name: string;
    sequence: string;
    tm: number;
    gcPercent: number;
    length: number;
    fragmentTarget: string;
    type: 'forward' | 'reverse';
    overlapRegion: string;
    bindingRegion: string;
}

interface ProtocolStep {
    step: number;
    title: string;
    description: string;
    duration: string;
    temperature: string;
    reagents: { name: string; volume: string }[];
    notes: string;
}

// ── Assembly Method Database ───────────────────────────────────────────

interface MethodInfo {
    name: string;
    fullName: string;
    overlapSize: number;
    maxFragments: number;
    enzyme: string;
    efficiency: string;
    cost: string;
    time: string;
    description: string;
    pros: string[];
    cons: string[];
    protocol: ProtocolStep[];
}

const ASSEMBLY_METHODS: Record<AssemblyMethod, MethodInfo> = {
    gibson: {
        name: 'Gibson Assembly',
        fullName: 'Gibson Assembly® (NEB E2611)',
        overlapSize: 30,
        maxFragments: 6,
        enzyme: 'Exonuclease + Polymerase + Ligase',
        efficiency: '95% (2 fragments), 80% (4+)',
        cost: '$$',
        time: '60 min + transformation',
        description: 'Isothermal assembly using T5 exonuclease, Phusion polymerase, and Taq ligase. Fragments joined by 20-40bp overlapping regions.',
        pros: ['Scarless assembly', 'Works with any overlaps', 'Single-tube reaction', 'High efficiency for 2-3 fragments'],
        cons: ['Repeats can cause mis-assembly', 'Cost per reaction higher than RE/Ligation', 'Longer overlaps needed for reliability'],
        protocol: [
            { step: 1, title: 'PCR Amplify Fragments', description: 'Amplify each fragment with overlap primers (30bp + 18-25bp binding)', duration: '1.5h', temperature: '98°C/55-65°C/72°C', reagents: [{ name: 'Q5 Hot Start 2x', volume: '25 µL' }, { name: 'Primer F', volume: '2.5 µL (10 µM)' }, { name: 'Primer R', volume: '2.5 µL (10 µM)' }, { name: 'Template', volume: '1 µL' }, { name: 'H₂O', volume: '19 µL' }], notes: 'Use Q5 for high fidelity. Run gel to verify. DpnI digest if template is plasmid.' },
            { step: 2, title: 'Gel Purify Fragments', description: 'Run 1% agarose gel, excise bands, purify with column kit', duration: '45 min', temperature: 'RT', reagents: [{ name: 'Agarose gel 1%', volume: '50 mL' }, { name: 'DNA Loading Dye', volume: '5 µL' }], notes: 'Use gel extraction kit. Elute in 20 µL H₂O.' },
            { step: 3, title: 'Gibson Assembly', description: 'Mix equimolar fragments with Gibson Assembly Master Mix', duration: '60 min', temperature: '50°C', reagents: [{ name: 'Gibson Assembly MM 2x', volume: '10 µL' }, { name: 'Fragment 1', volume: 'X µL (50-100 ng)' }, { name: 'Fragment 2', volume: 'X µL (equimolar)' }, { name: 'H₂O', volume: 'to 20 µL' }], notes: 'Use 50-100 ng vector + 3:1 molar ratio inserts. Total volume 20 µL.' },
            { step: 4, title: 'Transform', description: 'Transform 2 µL assembly into chemically competent cells', duration: '1.5h', temperature: '42°C (30s) → ice', reagents: [{ name: 'Competent cells', volume: '50 µL' }, { name: 'Assembly product', volume: '2 µL' }, { name: 'SOC', volume: '950 µL' }], notes: 'Heat shock 42°C 30s, recover in SOC 37°C 1h, plate on selective media.' },
            { step: 5, title: 'Colony PCR & Sequence', description: 'Screen colonies by PCR, sequence verify positives', duration: '3h', temperature: '95°C/55°C/72°C', reagents: [{ name: 'Taq 2x MM', volume: '10 µL' }, { name: 'Verification primers', volume: '2 µL' }], notes: 'Pick 8-12 colonies. Screen with junction-spanning primers.' },
        ],
    },
    'golden-gate': {
        name: 'Golden Gate',
        fullName: 'Golden Gate / BsaI Assembly',
        overlapSize: 4,
        maxFragments: 12,
        enzyme: 'BsaI (or BpiI/BbsI) + T4 Ligase',
        efficiency: '95% (4-6 fragments)',
        cost: '$',
        time: '2-5h (cycling) + transformation',
        description: 'Type IIS restriction enzyme-based assembly. BsaI cuts outside its recognition site, generating custom 4bp sticky ends.',
        pros: ['High parallelism (up to 12 fragments)', 'Cheap reagents', 'Standardized (MoClo/CIDAR)', 'One-pot reaction', 'Very high efficiency'],
        cons: ['BsaI sites must be absent from inserts', 'Only 4bp overhangs (256 possible)', 'Requires overhang compatibility design'],
        protocol: [
            { step: 1, title: 'Design Overhangs', description: 'Design compatible 4bp overhangs for each junction. Avoid palindromes and ensure uniqueness.', duration: '30 min', temperature: '-', reagents: [], notes: 'Use NEB Ligase Fidelity Viewer. Ensure no internal BsaI sites.' },
            { step: 2, title: 'Golden Gate Reaction', description: 'One-pot restriction-ligation cycling', duration: '3-5h', temperature: '37°C/16°C cycles (30/30 × 30)', reagents: [{ name: 'BsaI-HFv2', volume: '1 µL (20U)' }, { name: 'T4 DNA Ligase', volume: '1 µL (400U)' }, { name: 'T4 Ligase Buffer 10x', volume: '2 µL' }, { name: 'Parts (each)', volume: '75 ng' }, { name: 'H₂O', volume: 'to 20 µL' }], notes: '30 cycles: 37°C 1min, 16°C 1min. Then 50°C 5min, 80°C 5min.' },
            { step: 3, title: 'Transform', description: 'Transform 5 µL into competent cells', duration: '1.5h', temperature: '42°C', reagents: [{ name: 'Competent cells', volume: '50 µL' }, { name: 'GG product', volume: '5 µL' }], notes: 'Blue/white screening if using lacZ cassette.' },
        ],
    },
    biobrick: {
        name: 'BioBrick',
        fullName: 'BioBrick Standard Assembly (RFC10)',
        overlapSize: 0,
        maxFragments: 2,
        enzyme: 'EcoRI + XbaI + SpeI + PstI',
        efficiency: '70-90%',
        cost: '$',
        time: '4h + transformation',
        description: 'Standard assembly method from iGEM. Uses prefix (EcoRI/XbaI) and suffix (SpeI/PstI) to assemble parts sequentially.',
        pros: ['Simple and well-documented', 'Huge parts registry (iGEM)', 'No special enzymes', 'Standardized'],
        cons: ['NOT scarless (6bp scar)', 'Only 2 parts per reaction', 'Sequential assembly is slow', 'Scar can affect function'],
        protocol: [
            { step: 1, title: 'Digest Vector', description: 'Digest destination vector with EcoRI + SpeI', duration: '1h', temperature: '37°C', reagents: [{ name: 'Vector', volume: '500 ng' }, { name: 'EcoRI-HF', volume: '0.5 µL' }, { name: 'SpeI-HF', volume: '0.5 µL' }, { name: 'CutSmart 10x', volume: '2 µL' }, { name: 'H₂O', volume: 'to 20 µL' }], notes: 'Can use FastDigest for 15 min.' },
            { step: 2, title: 'Digest Insert', description: 'Digest insert part with EcoRI + XbaI', duration: '1h', temperature: '37°C', reagents: [{ name: 'Insert', volume: '500 ng' }, { name: 'EcoRI-HF', volume: '0.5 µL' }, { name: 'XbaI', volume: '0.5 µL' }], notes: 'XbaI/SpeI produce compatible sticky ends → mixed site (scar).' },
            { step: 3, title: 'Gel Purify', description: 'Gel purify both digested fragments', duration: '45 min', temperature: 'RT', reagents: [], notes: 'Agarose gel 1%, excise correct band' },
            { step: 4, title: 'Ligate + Transform', description: 'Ligate with T4 ligase, transform', duration: '2h', temperature: '16°C ligation, 42°C transform', reagents: [{ name: 'T4 DNA Ligase', volume: '1 µL' }, { name: 'T4 Buffer 10x', volume: '2 µL' }], notes: '3:1 insert:vector molar ratio. Ligate 16°C 2h or RT 10min.' },
        ],
    },
    gateway: {
        name: 'Gateway',
        fullName: 'Gateway® Cloning (Invitrogen)',
        overlapSize: 25,
        maxFragments: 4,
        enzyme: 'BP/LR Clonase (Int recombinase)',
        efficiency: '99%+ correct clones',
        cost: '$$$',
        time: '1h + transformation',
        description: 'Site-specific recombination using attB/attP (BP) or attL/attR (LR) sites. Extremely high fidelity.',
        pros: ['Highest efficiency', 'Directional', 'Easy to move between vectors', 'No restriction enzyme artifacts'],
        cons: ['25bp recombination scar', 'Expensive Clonase reagent', 'Limited to Gateway-compatible vectors', 'Less flexibility'],
        protocol: [
            { step: 1, title: 'BP Reaction (Entry Clone)', description: 'Recombine attB-PCR product with pDONR', duration: '1h', temperature: '25°C', reagents: [{ name: 'attB-PCR product', volume: '150 ng' }, { name: 'pDONR vector', volume: '150 ng' }, { name: 'BP Clonase II', volume: '2 µL' }], notes: 'Incubate 25°C 1h. Add 1 µL Proteinase K, 37°C 10min.' },
            { step: 2, title: 'LR Reaction (Destination)', description: 'Recombine entry clone with destination vector', duration: '1h', temperature: '25°C', reagents: [{ name: 'Entry clone', volume: '150 ng' }, { name: 'Destination vector', volume: '150 ng' }, { name: 'LR Clonase II', volume: '2 µL' }], notes: 'Transform → select on appropriate antibiotic.' },
        ],
    },
    'in-fusion': {
        name: 'In-Fusion',
        fullName: 'In-Fusion® HD Cloning (Takara)',
        overlapSize: 15,
        maxFragments: 5,
        enzyme: 'In-Fusion enzyme mix',
        efficiency: '95%+',
        cost: '$$',
        time: '15 min + transformation',
        description: 'Proprietary enzyme mix that joins DNA fragments with 15bp overlaps. Fastest assembly method.',
        pros: ['Only 15bp overlap needed', 'Very fast (15 min)', 'Scarless', 'Works with linearized vector'],
        cons: ['Proprietary reagent', 'Lower efficiency with >3 fragments', 'Cost per reaction'],
        protocol: [
            { step: 1, title: 'Prepare Fragments', description: 'PCR fragments with 15bp overlapping primers, linearize vector', duration: '2h', temperature: '98°C→72°C', reagents: [{ name: 'CloneAmp HiFi Mix', volume: '25 µL' }, { name: 'Primers', volume: '2 µL each' }], notes: '15bp overlap on each end matching adjacent fragment.' },
            { step: 2, title: 'In-Fusion Reaction', description: 'Mix fragments with In-Fusion enzyme', duration: '15 min', temperature: '50°C', reagents: [{ name: 'In-Fusion HD Mix 5x', volume: '2 µL' }, { name: 'Linearized vector', volume: '100 ng' }, { name: 'Insert', volume: 'X ng (equimolar)' }, { name: 'H₂O', volume: 'to 10 µL' }], notes: '50°C for exactly 15 min, then ice.' },
        ],
    },
    'restriction-ligation': {
        name: 'RE/Ligation',
        fullName: 'Traditional Restriction Enzyme / Ligation',
        overlapSize: 0,
        maxFragments: 3,
        enzyme: 'Restriction enzymes + T4 Ligase',
        efficiency: '60-80%',
        cost: '$',
        time: '3-5h + transformation',
        description: 'Classical cloning method using restriction enzymes to cut and T4 DNA ligase to join.',
        pros: ['Cheapest method', 'Well understood', 'Many available enzymes', 'Simple troubleshooting'],
        cons: ['Requires compatible sites', 'Not scarless', 'Lower efficiency', 'Background from self-ligation'],
        protocol: [
            { step: 1, title: 'Double Digest', description: 'Digest vector and insert with two RE', duration: '1h', temperature: '37°C', reagents: [{ name: 'RE 1', volume: '0.5 µL' }, { name: 'RE 2', volume: '0.5 µL' }, { name: 'CutSmart 10x', volume: '2 µL' }, { name: 'DNA', volume: '500 ng' }], notes: 'Check NEB Double Digest Finder for compatibility.' },
            { step: 2, title: 'Dephosphorylate Vector', description: 'CIP/SAP treatment to prevent self-ligation', duration: '30 min', temperature: '37°C', reagents: [{ name: 'rSAP', volume: '1 µL' }], notes: 'Reduces background colonies significantly.' },
            { step: 3, title: 'Gel Purify + Ligate', description: 'Gel purify both, ligate with T4 ligase', duration: '3h', temperature: '16°C', reagents: [{ name: 'T4 DNA Ligase', volume: '1 µL' }, { name: 'T4 Buffer 10x', volume: '2 µL' }], notes: '3:1 or 5:1 insert:vector molar ratio. Include vector-only control.' },
        ],
    },
};

// ── Primer Design Helpers ──────────────────────────────────────────────

function computeTm(seq: string): number {
    const upper = seq.toUpperCase();
    if (upper.length < 14) {
        // Wallace rule: Tm = 2(A+T) + 4(G+C)
        const at = (upper.match(/[AT]/g) || []).length;
        const gc = (upper.match(/[GC]/g) || []).length;
        return 2 * at + 4 * gc;
    }
    // Nearest-neighbor (simplified SantaLucia 1998)
    const at = (upper.match(/[AT]/g) || []).length;
    const gc = (upper.match(/[GC]/g) || []).length;
    return 64.9 + 41 * (gc - 16.4) / (at + gc);
}

function computeGC(seq: string): number {
    const upper = seq.toUpperCase();
    const gc = (upper.match(/[GC]/g) || []).length;
    return gc / upper.length * 100;
}

function reverseComplement(seq: string): string {
    const comp: Record<string, string> = { A: 'T', T: 'A', G: 'C', C: 'G', a: 't', t: 'a', g: 'c', c: 'g' };
    return seq.split('').reverse().map(c => comp[c] || c).join('');
}

function designOverlapPrimers(
    fragment: string, overlapFwd: string, overlapRev: string, method: AssemblyMethod,
): { fwd: PrimerDesign; rev: PrimerDesign } {
    // Binding region: 18-25bp from fragment ends with Tm 58-65°C
    let fwdBindLen = 18;
    while (fwdBindLen < 25 && computeTm(fragment.substring(0, fwdBindLen)) < 58) { fwdBindLen++; }
    const fwdBinding = fragment.substring(0, fwdBindLen);
    const fwdSeq = overlapFwd + fwdBinding;

    let revBindLen = 18;
    while (revBindLen < 25 && computeTm(fragment.substring(fragment.length - revBindLen)) < 58) { revBindLen++; }
    const revBinding = reverseComplement(fragment.substring(fragment.length - revBindLen));
    const revSeq = overlapRev + revBinding;

    return {
        fwd: {
            name: 'Fwd',
            sequence: fwdSeq, tm: computeTm(fwdBinding),
            gcPercent: computeGC(fwdBinding), length: fwdSeq.length,
            fragmentTarget: '', type: 'forward',
            overlapRegion: overlapFwd, bindingRegion: fwdBinding,
        },
        rev: {
            name: 'Rev',
            sequence: revSeq, tm: computeTm(reverseComplement(fragment.substring(fragment.length - revBindLen))),
            gcPercent: computeGC(revBinding), length: revSeq.length,
            fragmentTarget: '', type: 'reverse',
            overlapRegion: overlapRev, bindingRegion: revBinding,
        },
    };
}

// ── Live Construct Analysis ───────────────────────────────────────────

type PlannerSourceKind = 'none' | 'bioscript' | 'sequence' | 'text';
type ConstructPartKind = 'promoter' | 'rbs' | 'cds' | 'terminator' | 'origin' | 'marker' | 'regulator' | 'cassette';

interface ConstructPart {
    name: string;
    kind: ConstructPartKind;
    estimatedBp: number;
}

interface BackboneLibraryEntry {
    name: string;
    size: number;
    antibiotic: string;
    origin: string;
    copyNumber: string;
    idealInsertRange: [number, number];
    preferredMethods: AssemblyMethod[];
    keywords: string[];
    summary: string;
}

interface BackboneRecommendation {
    name: string;
    antibiotic: string;
    origin: string;
    rationale: string;
    fitScore: number;
}

interface MethodAssessment {
    key: AssemblyMethod;
    name: string;
    score: number;
    summary: string;
    reasons: string[];
    blockers: string[];
}

interface ActiveConstructAnalysis {
    fileName: string;
    sourceKind: PlannerSourceKind;
    sourceLabel: string;
    sourceText: string;
    explicitSequence: boolean;
    sequence: string;
    sequenceLength: number;
    estimatedLength: number;
    gcPercent: number | null;
    fragmentCount: number;
    sequenceSegments: number;
    parts: ConstructPart[];
    warnings: string[];
    typeIisSites: RestrictionSite[];
    biobrickViolations: RestrictionSite[];
    restrictionPair: string[];
    backbones: BackboneRecommendation[];
    methods: MethodAssessment[];
    semanticParse: SemanticAssemblyParseResult;
}

type PlannerPanelMode = 'compare' | 'gibson';
type GibsonAssessmentStatus = 'ok' | 'warning' | 'blocked';

interface GibsonOverlapAssessment {
    name: string;
    sequence: string;
    length: number;
    gcPercent: number;
    status: GibsonAssessmentStatus;
    note: string;
}

interface GibsonReactionItem {
    name: string;
    role: 'Vector' | 'Inserto';
    bp: number;
    pmol: number;
    ng: number;
    volumeFormula: string;
}

interface GibsonWorkbenchReport {
    overlapAssessments: GibsonOverlapAssessment[];
    reactionItems: GibsonReactionItem[];
    vectorPmol: number;
    insertPmol: number;
    totalPmol: number;
    totalNg: number;
    incubation: string;
    alerts: string[];
    strengths: string[];
    controls: string[];
}

const PART_PATTERNS: Array<{ pattern: RegExp; kind: ConstructPartKind; estimatedBp: number }> = [
    { pattern: /\bpromoter[\s:]+([A-Za-z_][\w-]*)/i, kind: 'promoter', estimatedBp: 80 },
    { pattern: /\blet\s+(\w+)\s*:\s*Promoter\b/i, kind: 'promoter', estimatedBp: 80 },
    { pattern: /\brbs[\s:]+([A-Za-z_][\w-]*)/i, kind: 'rbs', estimatedBp: 24 },
    { pattern: /\blet\s+(\w+)\s*:\s*RBS\b/i, kind: 'rbs', estimatedBp: 24 },
    { pattern: /\b(?:gene|protein|cds)\s+([A-Za-z_][\w-]*)/i, kind: 'cds', estimatedBp: 900 },
    { pattern: /\blet\s+(\w+)\s*:\s*(?:Gene|Protein)\b/i, kind: 'cds', estimatedBp: 900 },
    { pattern: /\bterminator[\s:]+([A-Za-z_][\w-]*)/i, kind: 'terminator', estimatedBp: 90 },
    { pattern: /\blet\s+(\w+)\s*:\s*Terminator\b/i, kind: 'terminator', estimatedBp: 90 },
    { pattern: /\b(?:origin|ori)[\s:]+([A-Za-z_][\w-]*)/i, kind: 'origin', estimatedBp: 650 },
    { pattern: /\b(?:selection|marker|resistance)[\s:]+([A-Za-z_][\w-]*)/i, kind: 'marker', estimatedBp: 850 },
    { pattern: /\b(?:repressor|activator|operator)\s+([A-Za-z_][\w-]*)/i, kind: 'regulator', estimatedBp: 120 },
];

const MCS_ENZYME_PANEL: string[] = ['EcoRI', 'BamHI', 'HindIII', 'KpnI', 'SacI', 'XbaI', 'PstI', 'NotI'];

const BACKBONE_LIBRARY: BackboneLibraryEntry[] = [
    {
        name: 'pUC19',
        size: 2686,
        antibiotic: 'Ampicillin',
        origin: 'pMB1 high-copy',
        copyNumber: 'High',
        idealInsertRange: [50, 2500],
        preferredMethods: ['gibson', 'restriction-ligation', 'golden-gate'],
        keywords: ['cloning', 'screening', 'library'],
        summary: 'Backbone de clonación general con MCS versátil y alto número de copias.',
    },
    {
        name: 'pSB1C3',
        size: 2070,
        antibiotic: 'Chloramphenicol',
        origin: 'pMB1 high-copy',
        copyNumber: 'High',
        idealInsertRange: [50, 2000],
        preferredMethods: ['biobrick', 'golden-gate', 'gibson'],
        keywords: ['igem', 'biobrick', 'registry'],
        summary: 'Backbone estándar iGEM para ensamblaje RFC10 y estandarización de partes.',
    },
    {
        name: 'pET-28a(+)',
        size: 5369,
        antibiotic: 'Kanamycin',
        origin: 'pBR322 medium-copy',
        copyNumber: 'Medium',
        idealInsertRange: [120, 3200],
        preferredMethods: ['gibson', 'golden-gate', 'restriction-ligation'],
        keywords: ['t7', 'his', 'expression', 'bl21'],
        summary: 'Vector de expresión T7 con opciones de His-tag y selección robusta.',
    },
    {
        name: 'pBAD33',
        size: 5352,
        antibiotic: 'Chloramphenicol',
        origin: 'p15A medium-copy',
        copyNumber: 'Medium',
        idealInsertRange: [120, 3000],
        preferredMethods: ['gibson', 'golden-gate', 'restriction-ligation'],
        keywords: ['arabinose', 'arac', 'pbad', 'tight'],
        summary: 'Vector de expresión PBAD para control fino e inducción por arabinosa.',
    },
    {
        name: 'pACYCDuet-1',
        size: 4008,
        antibiotic: 'Chloramphenicol',
        origin: 'P15A medium-copy',
        copyNumber: 'Medium',
        idealInsertRange: [250, 4200],
        preferredMethods: ['golden-gate', 'gibson', 'in-fusion'],
        keywords: ['coexpression', 'dual', 'multigene', 'operon'],
        summary: 'Backbone de coexpresión dual para ensamblajes con dos módulos o más.',
    },
];

function escapeHtml(value: string): string {
    return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function clampScore(score: number): number {
    return Math.max(0, Math.min(99, Math.round(score)));
}

function cleanDNA(input: string): string {
    return input.replace(/[^ACGT]/gi, '').toUpperCase();
}

function basename(filePath: string): string {
    const normalized = filePath.replace(/\\/g, '/');
    const segments = normalized.split('/');
    return segments[segments.length - 1] || filePath;
}

function inferSourceKind(languageId: string | undefined, source: string, explicitSequence: boolean): PlannerSourceKind {
    if (!source.trim()) { return 'none'; }
    if (languageId === 'bioscript' || /\b(circuit|module|promoter|gene|terminator|rbs)\b/i.test(source)) {
        return 'bioscript';
    }
    if (explicitSequence && cleanDNA(source).length >= Math.max(30, Math.floor(source.length * 0.6))) {
        return 'sequence';
    }
    return 'text';
}

function extractSequenceFromSource(source: string): { sequence: string; segmentCount: number } {
    const matches = source.match(/[ACGT]{20,}/gi) || [];
    if (matches.length === 0) {
        return { sequence: '', segmentCount: 0 };
    }
    return {
        sequence: matches.map(segment => segment.toUpperCase()).join(''),
        segmentCount: matches.length,
    };
}

function inferInsertPart(sequence: string): ConstructPart {
    const upper = sequence.toUpperCase();
    const stopCodons = ['TAA', 'TAG', 'TGA'];
    const looksLikeOrf = upper.startsWith('ATG') && upper.length % 3 === 0 && stopCodons.includes(upper.slice(-3));
    if (looksLikeOrf) {
        return { name: 'ORF insert', kind: 'cds', estimatedBp: upper.length };
    }
    if (upper.length <= 180) {
        return { name: 'Regulatory insert', kind: 'promoter', estimatedBp: upper.length };
    }
    return { name: 'DNA cassette', kind: 'cassette', estimatedBp: upper.length };
}

function parseConstructParts(source: string, sequence: string): ConstructPart[] {
    const parts: ConstructPart[] = [];
    const seen = new Set<string>();
    const lines = source.split(/\r?\n/);

    for (const line of lines) {
        for (const rule of PART_PATTERNS) {
            const match = line.match(rule.pattern);
            if (!match) { continue; }
            const name = match[1];
            const key = `${rule.kind}:${name}`;
            if (seen.has(key)) { continue; }
            seen.add(key);
            parts.push({ name, kind: rule.kind, estimatedBp: rule.estimatedBp });
        }
    }

    if (parts.length === 0 && sequence.length >= 30) {
        parts.push(inferInsertPart(sequence));
    } else if (parts.length === 0 && /\b(circuit|module)\b/i.test(source)) {
        parts.push({ name: 'Constructo BioScript', kind: 'cassette', estimatedBp: 1200 });
    }

    return parts;
}

function semanticPartsToConstructParts(parseResult: SemanticAssemblyParseResult): ConstructPart[] {
    const parts: ConstructPart[] = [];
    const seen = new Set<string>();

    for (const fragment of parseResult.fragments) {
        for (const part of fragment.parts) {
            const key = `${part.role}:${part.alias}:${part.name}`;
            if (seen.has(key)) { continue; }
            seen.add(key);
            parts.push({
                name: part.alias,
                kind: part.role === 'scaffold' ? 'cassette' : (part.role as ConstructPartKind),
                estimatedBp: part.bp || part.sequence.length || 0,
            });
        }
    }

    return parts;
}

function estimateFragmentCount(parts: ConstructPart[], explicitSequence: boolean, sequenceSegments: number): number {
    if (sequenceSegments > 1) { return sequenceSegments; }
    if (explicitSequence) { return 1; }
    const cdsCount = parts.filter(part => part.kind === 'cds').length;
    if (cdsCount > 0) { return cdsCount; }
    return Math.max(1, Math.ceil(parts.length / 4));
}

function chooseRestrictionPair(sequence: string): string[] {
    if (!sequence) { return []; }
    const absentEnzymes = MCS_ENZYME_PANEL.filter(enzyme => findRestrictionSites(sequence, [enzyme]).length === 0);
    for (let i = 0; i < absentEnzymes.length; i++) {
        for (let j = i + 1; j < absentEnzymes.length; j++) {
            if (!areEndsCompatible(absentEnzymes[i], absentEnzymes[j])) {
                return [absentEnzymes[i], absentEnzymes[j]];
            }
        }
    }
    return absentEnzymes.slice(0, 2);
}

function scoreBackbone(entry: BackboneLibraryEntry, sourceText: string, parts: ConstructPart[], estimatedLength: number, biobrickCompatible: boolean): BackboneRecommendation {
    let score = 42;
    const reasons: string[] = [];
    const lower = sourceText.toLowerCase();
    const cdsCount = parts.filter(part => part.kind === 'cds').length;

    if (estimatedLength >= entry.idealInsertRange[0] && estimatedLength <= entry.idealInsertRange[1]) {
        score += 20;
        reasons.push(`inserto ${estimatedLength} bp dentro del rango operativo`);
    }

    if (entry.keywords.some(keyword => lower.includes(keyword))) {
        score += 24;
        reasons.push(`alineado con el contexto ${entry.keywords.find(keyword => lower.includes(keyword))}`);
    }

    if (entry.name === 'pACYCDuet-1' && cdsCount >= 2) {
        score += 22;
        reasons.push('coexpresión multi-CDS');
    }

    if (entry.name === 'pSB1C3' && biobrickCompatible) {
        score += 10;
        reasons.push('compatible con ensamblaje RFC10');
    }

    if (reasons.length === 0) {
        reasons.push(entry.summary);
    }

    return {
        name: entry.name,
        antibiotic: entry.antibiotic,
        origin: entry.origin,
        rationale: reasons.join(' · '),
        fitScore: clampScore(score),
    };
}

function recommendBackbones(sourceText: string, parts: ConstructPart[], estimatedLength: number, biobrickCompatible: boolean): BackboneRecommendation[] {
    return BACKBONE_LIBRARY
        .map(entry => scoreBackbone(entry, sourceText, parts, estimatedLength, biobrickCompatible))
        .sort((left, right) => right.fitScore - left.fitScore)
        .slice(0, 3);
}

function detectWarnings(sequence: string, gcPercent: number | null, fragmentCount: number, explicitSequence: boolean): string[] {
    const warnings: string[] = [];
    if (!explicitSequence) {
        warnings.push('No hay secuencia explícita: la validación de sitios internos y primers queda pendiente.');
    }
    if (gcPercent !== null && (gcPercent < 35 || gcPercent > 65)) {
        warnings.push(`GC ${gcPercent.toFixed(1)}%: conviene revisar condiciones de PCR y diseño de overlaps.`);
    }
    if (sequence.length > 8000) {
        warnings.push('Constructo largo: prioriza un backbone estable y confirma integridad por digestión + secuenciación.');
    }
    if (/(A{8,}|T{8,}|G{8,}|C{8,})/.test(sequence)) {
        warnings.push('Se detectan homopolímeros largos; pueden complicar síntesis, PCR o secuenciación.');
    }
    if (fragmentCount >= 5) {
        warnings.push(`Ensamblaje de ${fragmentCount} fragmentos: controla equimolaridad y usa verificación de uniones.`);
    }
    return warnings;
}

function assessMethods(
    sourceText: string,
    explicitSequence: boolean,
    fragmentCount: number,
    gcPercent: number | null,
    typeIisSites: RestrictionSite[],
    biobrickViolations: RestrictionSite[],
    restrictionPair: string[],
    backbones: BackboneRecommendation[],
): MethodAssessment[] {
    const lower = sourceText.toLowerCase();
    const backboneName = backbones[0]?.name;
    const typeIisCount = typeIisSites.length;
    const biobrickCount = biobrickViolations.length;
    const methods: MethodAssessment[] = [];

    {
        let score = 68;
        const reasons = [
            `${fragmentCount} fragmento(s): Gibson funciona muy bien entre 1 y 6 fragmentos`,
            'No depende de sitios de restricción internos y permite ensamblaje scarless',
        ];
        const blockers: string[] = [];
        if (fragmentCount <= 6) { score += 22; } else { score -= (fragmentCount - 6) * 7; }
        if (!explicitSequence) { score -= 4; blockers.push('Añade secuencia explícita para cerrar el diseño de primers de solapamiento.'); }
        if (gcPercent !== null && gcPercent > 68) { score -= 6; blockers.push('GC alto: considera DMSO/betaína en la PCR de fragmentos.'); }
        if (backboneName) { reasons.push(`Encaja bien con el backbone recomendado ${backboneName}`); }
        methods.push({
            key: 'gibson',
            name: ASSEMBLY_METHODS.gibson.name,
            score: clampScore(score),
            summary: 'Ensamblaje sin cicatriz para insertos simples o cassettes modulares con overlaps de 20-40 bp.',
            reasons,
            blockers,
        });
    }

    {
        let score = 62;
        const reasons = [
            `Permite ensamblar hasta ${ASSEMBLY_METHODS['golden-gate'].maxFragments} fragmentos con overhangs definidos`,
        ];
        const blockers: string[] = [];
        if (fragmentCount >= 2 && fragmentCount <= 10) { score += 24; } else if (fragmentCount === 1) { score += 10; } else { score -= 15; }
        if (typeIisCount === 0 && explicitSequence) {
            score += 16;
            reasons.push('No se detectan sitios internos BsaI/BsmBI en la secuencia analizada.');
        }
        if (typeIisCount > 0) {
            score -= Math.min(42, typeIisCount * 14);
            blockers.push(`${typeIisCount} sitio(s) internos BsaI/BsmBI: requiere domesticar o cambiar de método.`);
        }
        if (!explicitSequence) {
            score -= 10;
            blockers.push('Falta secuencia explícita para validar Type IIS y overhangs reales.');
        }
        methods.push({
            key: 'golden-gate',
            name: ASSEMBLY_METHODS['golden-gate'].name,
            score: clampScore(score),
            summary: 'One-pot Type IIS de alta productividad, especialmente fuerte para ensamblaje modular y multi-fragmento.',
            reasons,
            blockers,
        });
    }

    {
        let score = 50;
        const reasons = ['Adecuado si buscas estandarización iGEM o ensamblaje secuencial RFC10.'];
        const blockers: string[] = [];
        if (fragmentCount <= 2) { score += 16; } else { score -= 20; blockers.push('BioBrick pierde tracción cuando el diseño supera 2 fragmentos por iteración.'); }
        if (biobrickCount === 0 && explicitSequence) {
            score += 20;
            reasons.push('No hay sitios internos EcoRI/XbaI/SpeI/PstI/NotI: compatible con RFC10.');
        }
        if (biobrickCount > 0) {
            score -= Math.min(36, biobrickCount * 8);
            blockers.push(`${biobrickCount} sitio(s) internos RFC10 detectados.`);
        }
        if (!explicitSequence) {
            score -= 10;
            blockers.push('Falta secuencia explícita para certificar compatibilidad RFC10.');
        }
        if (lower.includes('igem') || lower.includes('biobrick')) {
            score += 14;
            reasons.push('El contexto del diseño apunta a un flujo iGEM/BioBrick.');
        }
        methods.push({
            key: 'biobrick',
            name: ASSEMBLY_METHODS.biobrick.name,
            score: clampScore(score),
            summary: 'Montaje secuencial útil para estandarización de partes, pero menos eficiente en diseños complejos.',
            reasons,
            blockers,
        });
    }

    {
        let score = 58;
        const reasons = ['Solo necesita 15 bp de homología y suele ser rápido para 1-3 fragmentos.'];
        const blockers: string[] = [];
        if (fragmentCount <= 3) { score += 22; } else { score -= (fragmentCount - 3) * 9; }
        if (!explicitSequence) {
            score -= 4;
            blockers.push('Necesitas secuencia explícita para definir homología exacta con el vector linealizado.');
        }
        if (gcPercent !== null && gcPercent > 68) { score -= 5; }
        methods.push({
            key: 'in-fusion',
            name: ASSEMBLY_METHODS['in-fusion'].name,
            score: clampScore(score),
            summary: 'Alternativa rápida a Gibson cuando trabajas con pocos fragmentos y vector linealizado.',
            reasons,
            blockers,
        });
    }

    {
        let score = 46;
        const reasons = ['Sigue siendo válido cuando dispones de un par de sitios únicos y buscas un flujo barato y simple.'];
        const blockers: string[] = [];
        if (fragmentCount <= 2) { score += 12; } else { score -= 12; }
        if (restrictionPair.length === 2) {
            score += 24;
            reasons.push(`Par direccional libre de corte interno detectado: ${restrictionPair[0]} / ${restrictionPair[1]}.`);
        } else {
            score -= 18;
            blockers.push('No aparece un par claro de enzimas direccional sin cortes internos en el inserto.');
        }
        if (!explicitSequence) {
            score -= 8;
            blockers.push('Sin secuencia explícita no puede confirmarse ausencia de sitios internos.');
        }
        methods.push({
            key: 'restriction-ligation',
            name: ASSEMBLY_METHODS['restriction-ligation'].name,
            score: clampScore(score),
            summary: 'Clonación clásica útil cuando la secuencia ya es limpia para un doble digest dirigido.',
            reasons,
            blockers,
        });
    }

    {
        let score = 38;
        const reasons = ['Muy potente si ya estás en un pipeline entry/destination con att sites.'];
        const blockers: string[] = [];
        if (lower.includes('gateway') || /att[blrp]/i.test(sourceText)) {
            score += 34;
            reasons.push('El diseño ya menciona Gateway/att sites.');
        } else {
            blockers.push('Requiere vectores entry/destination y química Clonase específica.');
        }
        if (fragmentCount > 4) { score -= 10; }
        methods.push({
            key: 'gateway',
            name: ASSEMBLY_METHODS.gateway.name,
            score: clampScore(score),
            summary: 'Recombinación dirigida de alto rendimiento cuando el ecosistema Gateway ya está establecido.',
            reasons,
            blockers,
        });
    }

    return methods.sort((left, right) => right.score - left.score);
}

function buildAnalysisFromEditor(editor: vscode.TextEditor | undefined): ActiveConstructAnalysis {
    if (!editor) {
        const semanticParse = parseBioScriptAssembly('', 'Sin editor activo');
        return {
            fileName: 'Sin editor activo',
            sourceKind: 'none',
            sourceLabel: 'Sin editor activo',
            sourceText: '',
            explicitSequence: false,
            sequence: '',
            sequenceLength: 0,
            estimatedLength: 0,
            gcPercent: null,
            fragmentCount: 0,
            sequenceSegments: 0,
            parts: [],
            warnings: ['Abre un archivo .bio o selecciona una secuencia DNA para analizar el ensamblaje.'],
            typeIisSites: [],
            biobrickViolations: [],
            restrictionPair: [],
            backbones: [],
            methods: [],
            semanticParse,
        };
    }

    const selectedText = editor.selection.isEmpty ? '' : editor.document.getText(editor.selection);
    const source = selectedText || editor.document.getText();
    const semanticParse = parseBioScriptAssembly(source, editor.document.fileName);
    const extracted = extractSequenceFromSource(source);
    const semanticParts = semanticPartsToConstructParts(semanticParse);
    const parts = semanticParts.length > 0 ? semanticParts : parseConstructParts(source, extracted.sequence);
    const sequence = semanticParse.insertSequence || extracted.sequence;
    const explicitSequence = semanticParse.explicitSequence || sequence.length >= 30;
    const estimatedLength = explicitSequence
        ? sequence.length
        : Math.max(250, parts.reduce((sum, part) => sum + part.estimatedBp, 0));
    const gcPercent = explicitSequence ? computeGC(sequence) : null;
    const fragmentCount = semanticParse.fragments.length > 0
        ? semanticParse.fragments.length
        : estimateFragmentCount(parts, explicitSequence, extracted.segmentCount);
    const biobrickViolations = explicitSequence ? checkBioBrickCompatibility(sequence).violations : [];
    const typeIisSites = explicitSequence ? findRestrictionSites(sequence, ['BsaI', 'BsmBI']) : [];
    const restrictionPair = explicitSequence ? chooseRestrictionPair(sequence) : [];
    const warnings = [
        ...detectWarnings(sequence, gcPercent, fragmentCount, explicitSequence),
        ...semanticParse.warnings,
    ];
    const backbones = recommendBackbones(source, parts, estimatedLength, biobrickViolations.length === 0);
    const methods = assessMethods(
        source,
        explicitSequence,
        fragmentCount,
        gcPercent,
        typeIisSites,
        biobrickViolations,
        restrictionPair,
        backbones,
    );

    return {
        fileName: editor.document.fileName,
        sourceKind: inferSourceKind(editor.document.languageId, source, explicitSequence),
        sourceLabel: `${basename(editor.document.fileName)}${selectedText ? ' · selección' : ''}`,
        sourceText: source,
        explicitSequence,
        sequence,
        sequenceLength: sequence.length,
        estimatedLength,
        gcPercent,
        fragmentCount,
        sequenceSegments: extracted.segmentCount,
        parts,
        warnings,
        typeIisSites,
        biobrickViolations,
        restrictionPair,
        backbones,
        methods,
        semanticParse,
    };
}

function roundMetric(value: number, digits = 1): number {
    const factor = 10 ** digits;
    return Math.round(value * factor) / factor;
}

function gibsonStatusTone(status: GibsonAssessmentStatus): string {
    switch (status) {
        case 'ok': return 'excellent';
        case 'warning': return 'caution';
        default: return 'poor';
    }
}

function ngFromPmol(bp: number, pmol: number): number {
    return roundMetric(bp * 0.65 * pmol, 1);
}

function buildGibsonOverlapAssessments(
    analysis: ActiveConstructAnalysis,
    assembly: AssemblyPreview,
): GibsonOverlapAssessment[] {
    const overlapLength = ASSEMBLY_METHODS.gibson.overlapSize;
    const semanticFragments = analysis.semanticParse.fragments
        .filter(fragment => fragment.sequence.length > 0)
        .map(fragment => ({ name: fragment.name, sequence: cleanDNA(fragment.sequence) }));
    const fragments = semanticFragments.length > 0
        ? semanticFragments
        : assembly.insertSequence
            ? [{ name: basename(analysis.fileName).replace(/\.[^.]+$/, '') || 'Inserto', sequence: cleanDNA(assembly.insertSequence) }]
            : [];

    const rawOverlaps: Array<{ name: string; sequence: string }> = [];

    for (let index = 0; index < fragments.length; index += 1) {
        const previousSequence = index === 0
            ? cleanDNA(assembly.backbone.leftFlankSequence)
            : fragments[index - 1].sequence;
        rawOverlaps.push({
            name: index === 0 ? `Vector → ${fragments[index].name}` : `${fragments[index - 1].name} → ${fragments[index].name}`,
            sequence: previousSequence.slice(-overlapLength),
        });
    }

    if (fragments.length > 0) {
        rawOverlaps.push({
            name: `${fragments[fragments.length - 1].name} → Vector`,
            sequence: cleanDNA(assembly.backbone.rightFlankSequence).slice(0, overlapLength),
        });
    }

    const duplicateCounts = rawOverlaps.reduce((counts, overlap) => {
        if (overlap.sequence) {
            counts.set(overlap.sequence, (counts.get(overlap.sequence) || 0) + 1);
        }
        return counts;
    }, new Map<string, number>());

    return rawOverlaps.map(overlap => {
        const gcPercent = overlap.sequence ? computeGC(overlap.sequence) : 0;
        const notes: string[] = [];
        let status: GibsonAssessmentStatus = 'ok';

        if (!overlap.sequence) {
            status = 'blocked';
            notes.push('Falta flanco exacto o secuencia suficiente para cerrar esta junction.');
        } else {
            if (overlap.sequence.length < 20) {
                status = 'blocked';
                notes.push('Solapamiento demasiado corto para un Gibson robusto.');
            } else if (overlap.sequence.length < 25) {
                status = 'warning';
                notes.push('Solapamiento usable, pero por debajo del objetivo operativo de 25-30 bp.');
            } else if (overlap.sequence.length > 40) {
                status = 'warning';
                notes.push('Solapamiento más largo de lo habitual; revisa coste y Tm de los primers.');
            }

            if (gcPercent < 35 || gcPercent > 65) {
                status = status === 'blocked' ? 'blocked' : 'warning';
                notes.push(`GC ${gcPercent.toFixed(1)}% fuera de la ventana cómoda para homología isoterma.`);
            }

            if (/(A{6,}|T{6,}|G{6,}|C{6,})/.test(overlap.sequence)) {
                status = status === 'blocked' ? 'blocked' : 'warning';
                notes.push('Incluye un homopolímero largo; conviene rediseñar la homología.');
            }

            if ((duplicateCounts.get(overlap.sequence) || 0) > 1) {
                status = status === 'blocked' ? 'blocked' : 'warning';
                notes.push('Esta homología se repite en varias junctions y aumenta el riesgo de mis-assembly.');
            }
        }

        if (notes.length === 0) {
            notes.push('Junction equilibrada y lista para ensamblaje isoterma.');
        }

        return {
            name: overlap.name,
            sequence: overlap.sequence,
            length: overlap.sequence.length,
            gcPercent,
            status,
            note: notes.join(' '),
        };
    });
}

function buildGibsonWorkbenchReport(
    analysis: ActiveConstructAnalysis,
    assembly: AssemblyPreview,
): GibsonWorkbenchReport {
    const semanticFragments = analysis.semanticParse.fragments
        .filter(fragment => fragment.sequence.length > 0)
        .map(fragment => ({ name: fragment.name, bp: fragment.sequence.length }));
    const fragments = semanticFragments.length > 0
        ? semanticFragments
        : assembly.insertSequence
            ? [{ name: basename(analysis.fileName).replace(/\.[^.]+$/, '') || 'Inserto', bp: assembly.insertSequence.length }]
            : [];

    const overlapAssessments = buildGibsonOverlapAssessments(analysis, assembly);
    const vectorBp = Math.max(assembly.finalPlasmidSize - assembly.insertLength, 1);
    const fragmentCount = fragments.length;

    let vectorPmol = 0.02;
    let insertPmol = 0.04;
    let incubation = '50°C · 30 min';

    if (fragmentCount >= 5) {
        vectorPmol = 0.01;
        insertPmol = 0.02;
        incubation = '50°C · 60 min';
    } else if (fragmentCount >= 3) {
        vectorPmol = 0.015;
        insertPmol = 0.03;
        incubation = '50°C · 45 min';
    }

    const reactionItems: GibsonReactionItem[] = [
        {
            name: `${assembly.backbone.name} linealizado`,
            role: 'Vector',
            bp: vectorBp,
            pmol: vectorPmol,
            ng: ngFromPmol(vectorBp, vectorPmol),
            volumeFormula: 'ng objetivo / concentración stock (ng/µL)',
        },
        ...fragments.map(fragment => ({
            name: fragment.name,
            role: 'Inserto' as const,
            bp: fragment.bp,
            pmol: insertPmol,
            ng: ngFromPmol(fragment.bp, insertPmol),
            volumeFormula: 'ng objetivo / concentración stock (ng/µL)',
        })),
    ];

    const alerts: string[] = [];
    if (!analysis.explicitSequence) {
        alerts.push('Sin secuencia explícita el diseño Gibson queda aproximado; selecciona DNA o abre un constructo con secuencias resueltas.');
    }
    if (analysis.semanticParse.unresolvedSymbols.length > 0) {
        alerts.push(`Hay símbolos sin secuencia local: ${analysis.semanticParse.unresolvedSymbols.join(', ')}.`);
    }
    const blockedOverlaps = overlapAssessments.filter(overlap => overlap.status === 'blocked').length;
    if (blockedOverlaps > 0) {
        alerts.push(`${blockedOverlaps} junction(s) no alcanzan una homología suficiente para Gibson fiable.`);
    }
    if (!assembly.exactAssembly) {
        alerts.push(assembly.exactReason);
    }
    if (fragmentCount > ASSEMBLY_METHODS.gibson.maxFragments) {
        alerts.push(`El diseño usa ${fragmentCount} fragmentos; Gibson pierde fiabilidad por encima de ${ASSEMBLY_METHODS.gibson.maxFragments}.`);
    }
    if (assembly.colonyPcr.length === 0) {
        alerts.push('No hay colony PCR exacta para este backbone; usa primers vectoriales externos o un backbone con flancos curados.');
    }

    const strengths: string[] = [];
    if (analysis.explicitSequence) {
        strengths.push('Secuencia explícita disponible para cerrar homología, primers y sitios internos.');
    }
    if (overlapAssessments.length > 0 && overlapAssessments.every(overlap => overlap.status === 'ok')) {
        strengths.push('Todas las junctions modeladas quedan en una zona sólida para Gibson.');
    }
    if (fragmentCount > 0 && fragmentCount <= 4) {
        strengths.push(`La carga modular se mantiene en ${fragmentCount} fragmento(s), un rango fuerte para ensamblaje isoterma.`);
    }
    if (analysis.gcPercent !== null && analysis.gcPercent >= 40 && analysis.gcPercent <= 60) {
        strengths.push(`GC global ${analysis.gcPercent.toFixed(1)}%: buena ventana para PCR y ensamblaje.`);
    }

    const controls = [
        'Incluye un control de vector linealizado sin insertos para medir el fondo de colonias.',
        'Si la plantilla de PCR es plasmídica, trata con DpnI antes de purificar los amplicones.',
        'Purifica cada fragmento por columna o gel antes de cargarlo al master mix.',
        `Monta 10 µL de Gibson Assembly Master Mix 2x + DNA hasta 20 µL e incuba ${incubation}.`,
        'Transforma 2 µL de reacción en 50 µL de células competentes y recupera 1 h en SOC.',
        assembly.colonyPcr.length > 0
            ? `Criba ${assembly.colonyPcr.length} ensayo(s) de colony PCR antes de mandar positivos a Sanger.`
            : 'Confirma las uniones por PCR externa al vector y secuenciación Sanger.',
    ];

    const totalPmol = roundMetric(reactionItems.reduce((sum, item) => sum + item.pmol, 0), 3);
    const totalNg = roundMetric(reactionItems.reduce((sum, item) => sum + item.ng, 0), 1);

    return {
        overlapAssessments,
        reactionItems,
        vectorPmol,
        insertPmol,
        totalPmol,
        totalNg,
        incubation,
        alerts,
        strengths,
        controls,
    };
}

function scoreTone(score: number): string {
    if (score >= 80) { return 'excellent'; }
    if (score >= 60) { return 'good'; }
    if (score >= 40) { return 'caution'; }
    return 'poor';
}

// ── Main Class ─────────────────────────────────────────────────────────

export class CloningStrategyPlanner implements vscode.Disposable {
    private panel: vscode.WebviewPanel | undefined;
    private disposables: vscode.Disposable[] = [];
    private projects: CloningProject[] = [];
    private storageKey = 'synbio.cloningProjects';
    private selectedMethod: AssemblyMethod | undefined;
    private selectedBackbone: string | undefined;
    private panelMode: PlannerPanelMode = 'compare';

    constructor(private context: vscode.ExtensionContext) {
        this.projects = context.globalState.get<CloningProject[]>(this.storageKey, []);
    }

    private resolveMethod(analysis: ActiveConstructAnalysis): AssemblyMethod {
        const candidates = analysis.methods.map(method => method.key);
        if (this.selectedMethod && candidates.includes(this.selectedMethod)) {
            return this.selectedMethod;
        }
        this.selectedMethod = analysis.methods[0]?.key || 'gibson';
        return this.selectedMethod;
    }

    private resolveBackbone(analysis: ActiveConstructAnalysis): string {
        const available = getBackboneModels().map(model => model.name);
        if (this.selectedBackbone && available.includes(this.selectedBackbone)) {
            return this.selectedBackbone;
        }
        this.selectedBackbone = analysis.backbones[0]?.name || available[0];
        return this.selectedBackbone;
    }

    private buildCurrentAssembly(analysis: ActiveConstructAnalysis): AssemblyPreview {
        const method = this.resolveMethod(analysis);
        const backbone = this.resolveBackbone(analysis);
        return buildAssemblyPreview(analysis.semanticParse, method, backbone);
    }

    activate(): void {
        this.disposables.push(
            vscode.commands.registerCommand('synbio.cloningPlanner', () => this.show()),
            vscode.commands.registerCommand('synbio.assemblyMethodCompare', () => this.compareAssemblyMethods()),
            vscode.commands.registerCommand('synbio.cloningProtocol', () => this.showProtocol()),
            vscode.commands.registerCommand('synbio.designCloningPrimers', () => this.designPrimersUI()),
            vscode.window.onDidChangeActiveTextEditor(() => {
                if (this.panel) { this.renderPlanner(); }
            }),
            vscode.workspace.onDidChangeTextDocument(event => {
                if (this.panel && vscode.window.activeTextEditor && event.document === vscode.window.activeTextEditor.document) {
                    this.renderPlanner();
                }
            }),
        );
    }

    show(): void {
        this.panelMode = 'compare';
        this.openPlanner();
    }

    showGibsonWorkbench(): void {
        this.panelMode = 'gibson';
        this.selectedMethod = 'gibson';
        this.openPlanner();
    }

    private getPanelTitle(): string {
        return this.panelMode === 'gibson'
            ? '🧬 Workbench de Ensamblaje Gibson'
            : '🧬 Comparador de Métodos de Ensamblaje';
    }

    // ── Compare Assembly Methods ───────────────────────────────────────

    private async compareAssemblyMethods(): Promise<void> {
        this.panelMode = 'compare';
        this.openPlanner();
    }

    private openPlanner(): void {
        if (this.panel) {
            this.panel.title = this.getPanelTitle();
            this.panel.reveal();
        } else {
            this.panel = vscode.window.createWebviewPanel(
                'cloningPlanner',
                this.getPanelTitle(),
                vscode.ViewColumn.One,
                { enableScripts: true, retainContextWhenHidden: true },
            );
            this.panel.onDidDispose(() => { this.panel = undefined; });
            this.panel.webview.onDidReceiveMessage((msg: { command: string; data?: unknown }) => {
                void this.handleMsg(msg);
            });
        }
        this.renderPlanner();
    }

    private renderPlanner(): void {
        if (!this.panel) { return; }
        this.panel.title = this.getPanelTitle();
        const analysis = buildAnalysisFromEditor(vscode.window.activeTextEditor);
        if (this.panelMode === 'gibson') {
            this.selectedMethod = 'gibson';
        }
        const assembly = this.buildCurrentAssembly(analysis);
        this.panel.webview.html = this.panelMode === 'gibson'
            ? this.buildGibsonWorkbenchHtml(analysis, assembly)
            : this.buildComparisonHtml(analysis, assembly);
    }

    private async handleMsg(msg: { command: string; data?: unknown }): Promise<void> {
        switch (msg.command) {
            case 'setMethod': {
                if (typeof msg.data === 'string') {
                    this.selectedMethod = msg.data as AssemblyMethod;
                    this.renderPlanner();
                }
                break;
            }
            case 'setBackbone': {
                if (typeof msg.data === 'string') {
                    this.selectedBackbone = msg.data;
                    this.renderPlanner();
                }
                break;
            }
            case 'selectMethod': {
                if (typeof msg.data === 'string') {
                    await this.showProtocolForMethod(msg.data);
                }
                break;
            }
            case 'designPrimers': {
                if (typeof msg.data === 'string') {
                    this.selectedMethod = msg.data as AssemblyMethod;
                }
                const analysis = buildAnalysisFromEditor(vscode.window.activeTextEditor);
                await this.designPrimersUI(this.resolveMethod(analysis));
                break;
            }
            case 'refresh':
            case 'compare':
                this.renderPlanner();
                break;
            case 'openCompare':
                this.panelMode = 'compare';
                this.renderPlanner();
                break;
            case 'exportReport': {
                const analysis = buildAnalysisFromEditor(vscode.window.activeTextEditor);
                const assembly = this.buildCurrentAssembly(analysis);
                await this.exportAnalysisReport(analysis, assembly);
                break;
            }
        }
    }

    // ── Protocol Display ───────────────────────────────────────────────

    private async showProtocol(): Promise<void> {
        const picks = Object.entries(ASSEMBLY_METHODS).map(([_, method]) => ({
            label: method.name,
            description: `${method.maxFragments} frags max | ${method.time} | ${method.cost}`,
            detail: method.description.substring(0, 100),
        }));
        const pick = await vscode.window.showQuickPick(picks, { placeHolder: 'Selecciona método de ensamblaje' });
        if (!pick) { return; }

        const method = Object.entries(ASSEMBLY_METHODS).find(([, entry]) => entry.name === pick.label);
        if (!method) { return; }
        await this.showProtocolForMethod(method[0]);
    }

    private async showProtocolForMethod(methodKey: string): Promise<void> {
        const method = ASSEMBLY_METHODS[methodKey as AssemblyMethod];
        if (!method) { return; }

        const steps = method.protocol.map(step => {
            const reagentList = step.reagents.map(reagent => `  - ${reagent.name}: ${reagent.volume}`).join('\n');
            return `### Step ${step.step}: ${step.title}\n\n${step.description}\n\n**Duration:** ${step.duration} | **Temperature:** ${step.temperature}\n\n**Reagents:**\n${reagentList || '  _None_'}\n\n**Notes:** ${step.notes}\n`;
        }).join('\n---\n\n');

        const content = `# 🔬 ${method.fullName}\n\n${method.description}\n\n## Summary\n\n| Property | Value |\n|----------|-------|\n| **Max Fragments** | ${method.maxFragments} |\n| **Overlap Size** | ${method.overlapSize}bp |\n| **Enzyme** | ${method.enzyme} |\n| **Efficiency** | ${method.efficiency} |\n| **Time** | ${method.time} |\n| **Cost** | ${method.cost} |\n\n## Pros\n${method.pros.map(pro => `- ✅ ${pro}`).join('\n')}\n\n## Cons\n${method.cons.map(con => `- ⚠️ ${con}`).join('\n')}\n\n## Protocol\n\n${steps}\n\n---\n_Generated by SynBio-LLVM Cloning Strategy Planner_\n`;

        const doc = await vscode.workspace.openTextDocument({ content, language: 'markdown' });
        await vscode.window.showTextDocument(doc);
    }

    // ── Primer Design UI ───────────────────────────────────────────────

    private async designPrimersUI(preferredMethod?: AssemblyMethod): Promise<void> {
        const analysis = buildAnalysisFromEditor(vscode.window.activeTextEditor);
        if (preferredMethod) {
            this.selectedMethod = preferredMethod;
        }

        const assembly = this.buildCurrentAssembly(analysis);
        if (assembly.insertLength === 0 || assembly.primers.length === 0) {
            vscode.window.showErrorMessage('No hay suficientes secuencias resueltas para diseñar primers automáticos.');
            return;
        }

        const primerRows = assembly.primers.map(primer => [
            `## ${primer.name}`,
            `- Fragmento: ${primer.fragmentName}`,
            `- Tipo: ${primer.type}`,
            `- Rol: ${primer.role}`,
            `- Secuencia: ${primer.sequence}`,
            `- Cola 5': ${primer.tail || 'N/A'}`,
            `- Región de anclaje: ${primer.bindingSequence}`,
            `- Tm: ${primer.tm.toFixed(1)} °C`,
            `- GC: ${primer.gcPercent.toFixed(1)}%`,
        ].join('\n')).join('\n\n');

        const colonyRows = assembly.colonyPcr.length > 0
            ? assembly.colonyPcr.map(assay => `- ${assay.name}: ${assay.forwardPrimer} / ${assay.reversePrimer} → ${assay.expectedBp} bp (${assay.purpose})`).join('\n')
            : '- No disponible con el backbone actual; faltan flancos vectoriales exactos.';

        const content = `# Plan de Primers Automático\n\n` +
            `- Backbone: ${assembly.backbone.name}\n` +
            `- Método: ${ASSEMBLY_METHODS[assembly.method].name}\n` +
            `- Inserto: ${assembly.insertLength} bp\n` +
            `- Tamaño plasmídico final: ${assembly.finalPlasmidSize} bp\n` +
            `- Exactitud: ${assembly.exactAssembly ? 'Exacta' : 'Parcial'}\n\n` +
            `## Primers\n\n${primerRows}\n\n` +
            `## Junctions\n\n${assembly.junctions.map(junction => `- ${junction.name}: ${junction.status.toUpperCase()} — ${junction.basis}. ${junction.note}`).join('\n')}\n\n` +
            `## Colony PCR\n\n${colonyRows}\n\n` +
            `## Verificación\n\n${assembly.verificationPlan.map(step => `- ${step}`).join('\n')}\n`;

        const doc = await vscode.workspace.openTextDocument({ content, language: 'markdown' });
        await vscode.window.showTextDocument(doc);
    }

    private async exportAnalysisReport(analysis: ActiveConstructAnalysis, assembly: AssemblyPreview): Promise<void> {
        const parts = analysis.parts.length > 0
            ? analysis.parts.map(part => `- ${part.name} (${part.kind}, ~${part.estimatedBp} bp)`).join('\n')
            : '- Sin partes inferidas';
        const backbones = analysis.backbones.length > 0
            ? analysis.backbones.map(backbone => `- ${backbone.name} (${backbone.fitScore}/100) — ${backbone.antibiotic}, ${backbone.origin}. ${backbone.rationale}`).join('\n')
            : '- Sin recomendación de backbone';
        const methods = analysis.methods.length > 0
            ? analysis.methods.map(method => {
                const blockers = method.blockers.length > 0
                    ? `\nBloqueos:\n${method.blockers.map(blocker => `- ${blocker}`).join('\n')}`
                    : '';
                return `### ${method.name} — ${method.score}/100\n${method.summary}\n\nRazones:\n${method.reasons.map(reason => `- ${reason}`).join('\n')}${blockers}`;
            }).join('\n\n')
            : 'Sin métodos evaluados.';

        const fragments = analysis.semanticParse.fragments.length > 0
            ? analysis.semanticParse.fragments.map(fragment => `- ${fragment.name}: ${fragment.parts.map(part => `${part.alias} (${part.bp || 0} bp)`).join(' -> ')}${fragment.unresolvedParts.length > 0 ? ` | pendientes: ${fragment.unresolvedParts.join(', ')}` : ''}`).join('\n')
            : '- Sin fragmentos semánticos resueltos';

        const primerSummary = assembly.primers.length > 0
            ? assembly.primers.map(primer => `- ${primer.name}: ${primer.sequence} | ${primer.role} | Tm ${primer.tm.toFixed(1)} °C`).join('\n')
            : '- Sin primers generados';

        const colonySummary = assembly.colonyPcr.length > 0
            ? assembly.colonyPcr.map(assay => `- ${assay.name}: ${assay.expectedBp} bp | ${assay.purpose}`).join('\n')
            : '- Sin plan de colony PCR para el backbone actual';

        const content = `# Planificador de Ensamblaje Plasmídico\n\n` +
            `## Entrada\n- Fuente: ${analysis.sourceLabel}\n- Tipo: ${analysis.sourceKind}\n- Longitud ${analysis.explicitSequence ? 'analizada' : 'estimada'}: ${analysis.explicitSequence ? analysis.sequenceLength : analysis.estimatedLength} bp\n- Fragmentos previstos: ${analysis.fragmentCount}\n- GC: ${analysis.gcPercent !== null ? `${analysis.gcPercent.toFixed(1)}%` : 'N/D'}\n\n` +
            `## Arquitectura inferida\n${parts}\n\n` +
            `## Parseo semántico BioScript\n${fragments}\n\n` +
            `## Recomendación de backbones\n${backbones}\n\n` +
            `## Evaluación de métodos\n${methods}\n\n` +
            `## Ensamblaje activo\n- Backbone: ${assembly.backbone.name}\n- Método: ${ASSEMBLY_METHODS[assembly.method].name}\n- Inserto: ${assembly.insertLength} bp\n- Tamaño final plasmídico: ${assembly.finalPlasmidSize} bp\n- Exactitud: ${assembly.exactAssembly ? 'Exacta' : 'Parcial'}\n- Notas: ${assembly.exactReason}\n\n` +
            `## Primers automáticos\n${primerSummary}\n\n` +
            `## Junctions\n${assembly.junctions.map(junction => `- ${junction.name}: ${junction.status.toUpperCase()} — ${junction.basis}. ${junction.note}`).join('\n') || '- Sin junctions'}\n\n` +
            `## Colony PCR\n${colonySummary}\n\n` +
            `## Verificación post-clonación\n${assembly.verificationPlan.map(step => `- ${step}`).join('\n') || '- Sin plan de verificación'}\n\n` +
            `## Alertas\n${analysis.warnings.map(warning => `- ${warning}`).join('\n') || '- Sin alertas principales'}\n`;

        const doc = await vscode.workspace.openTextDocument({ content, language: 'markdown' });
        await vscode.window.showTextDocument(doc);
    }

    // ── Planner Panel ──────────────────────────────────────────────────

    private buildComparisonHtml(analysis: ActiveConstructAnalysis, assembly: AssemblyPreview): string {
        const methods = analysis.methods;
        const topMethod = methods.find(method => method.key === assembly.method) || methods[0];
        const architecture = analysis.semanticParse.fragments.length > 0
            ? analysis.semanticParse.fragments.map(fragment => `<span class="chip">${escapeHtml(fragment.name)} · ${fragment.sequence.length || fragment.parts.reduce((sum, part) => sum + part.bp, 0)} bp · ${fragment.parts.map(part => escapeHtml(part.alias)).join(' → ')}</span>`).join('')
            : analysis.parts.length > 0
                ? analysis.parts.map(part => `<span class="chip">${escapeHtml(part.name)} · ${escapeHtml(part.kind)} · ~${part.estimatedBp} bp</span>`).join('')
                : '<span class="muted">No se detectaron partes todavía.</span>';

        const backboneOptions = getBackboneModels().map(model => `<option value="${model.name}" ${model.name === assembly.backbone.name ? 'selected' : ''}>${model.name}</option>`).join('');
        const methodOptions = methods.map(method => `<option value="${method.key}" ${method.key === assembly.method ? 'selected' : ''}>${escapeHtml(method.name)} (${method.score}/100)</option>`).join('');

        const backboneCards = analysis.backbones.length > 0
            ? analysis.backbones.map(backbone => `
                <div class="backbone-card ${backbone.name === assembly.backbone.name ? 'recommended' : ''}">
                    <div class="backbone-head">
                        <strong>${escapeHtml(backbone.name)}</strong>
                        <span class="score ${scoreTone(backbone.fitScore)}">${backbone.fitScore}/100</span>
                    </div>
                    <div class="backbone-meta">${escapeHtml(backbone.antibiotic)} · ${escapeHtml(backbone.origin)}</div>
                    <p>${escapeHtml(backbone.rationale)}</p>
                    <div class="actions-row"><button onclick="setBackbone('${backbone.name}')">Usar backbone</button></div>
                </div>
            `).join('')
            : '<div class="empty">Sin backbone recomendado: abre un .bio o selecciona un inserto DNA.</div>';

        const warningBlock = analysis.warnings.length > 0
            ? `<div class="warnings">${analysis.warnings.map(warning => `<div class="warning">${escapeHtml(warning)}</div>`).join('')}</div>`
            : '';

        const methodCards = methods.length > 0
            ? methods.map(method => `
                <div class="method-card ${method.key === assembly.method ? 'recommended' : ''}">
                    <div class="method-top">
                        <div>
                            <div class="eyebrow">${escapeHtml(ASSEMBLY_METHODS[method.key].fullName)}</div>
                            <h3>${escapeHtml(method.name)}</h3>
                        </div>
                        <div class="score ${scoreTone(method.score)}">${method.score}/100</div>
                    </div>
                    <p>${escapeHtml(method.summary)}</p>
                    <div class="method-meta">
                        <span class="chip subtle">Máx ${ASSEMBLY_METHODS[method.key].maxFragments} fragmentos</span>
                        <span class="chip subtle">Overlap ${ASSEMBLY_METHODS[method.key].overlapSize} bp</span>
                        <span class="chip subtle">${escapeHtml(ASSEMBLY_METHODS[method.key].time)}</span>
                    </div>
                    <div class="reason-list">${method.reasons.map(reason => `<div class="reason">${escapeHtml(reason)}</div>`).join('')}</div>
                    ${method.blockers.length > 0 ? `<div class="blocker-list">${method.blockers.map(blocker => `<div class="blocker">${escapeHtml(blocker)}</div>`).join('')}</div>` : ''}
                    <div class="actions-row">
                        <button onclick="setMethod('${method.key}')">Activar método</button>
                        <button class="primary" onclick="selectMethod('${method.key}')">Ver protocolo</button>
                        <button onclick="designPrimers('${method.key}')">Diseñar primers</button>
                    </div>
                </div>
            `).join('')
            : '<div class="empty">Sin métodos evaluados.</div>';

        const decisionMatrix = methods.length > 0
            ? `<table>
                <tr>
                    <th>Parámetro</th>
                    ${methods.map(method => `<th>${escapeHtml(method.name)}</th>`).join('')}
                </tr>
                <tr>
                    <td>Ajuste al diseño actual</td>
                    ${methods.map(method => `<td>${method.score}/100</td>`).join('')}
                </tr>
                <tr>
                    <td>Scarless</td>
                    ${methods.map(method => `<td>${['gibson', 'in-fusion'].includes(method.key) ? 'Sí' : 'No'}</td>`).join('')}
                </tr>
                <tr>
                    <td>Max fragmentos</td>
                    ${methods.map(method => `<td>${ASSEMBLY_METHODS[method.key].maxFragments}</td>`).join('')}
                </tr>
                <tr>
                    <td>Coste</td>
                    ${methods.map(method => `<td>${escapeHtml(ASSEMBLY_METHODS[method.key].cost)}</td>`).join('')}
                </tr>
                <tr>
                    <td>Backbone activo</td>
                    ${methods.map(method => `<td>${method.key === assembly.method ? escapeHtml(assembly.backbone.name) : '—'}</td>`).join('')}
                </tr>
            </table>`
            : '';

        const compatibilityRow = analysis.explicitSequence
            ? `
                <div class="summary-card">
                    <span class="label">Type IIS</span>
                    <strong>${analysis.typeIisSites.length} sitio(s) BsaI/BsmBI</strong>
                    <span class="meta">${analysis.typeIisSites.length === 0 ? 'Golden Gate listo' : 'Requiere domesticación'}</span>
                </div>
                <div class="summary-card">
                    <span class="label">BioBrick RFC10</span>
                    <strong>${analysis.biobrickViolations.length === 0 ? 'Compatible' : `${analysis.biobrickViolations.length} conflicto(s)`}</strong>
                    <span class="meta">${analysis.biobrickViolations.length === 0 ? 'Sin sitios internos prohibidos' : 'EcoRI/XbaI/SpeI/PstI/NotI presentes'}</span>
                </div>
                <div class="summary-card">
                    <span class="label">Restricción clásica</span>
                    <strong>${assembly.restrictionPair.length === 2 ? assembly.restrictionPair.join(' / ') : 'Sin par claro'}</strong>
                    <span class="meta">Par direccional libre de corte interno</span>
                </div>
            `
            : `
                <div class="summary-card wide">
                    <span class="label">Estado de validación</span>
                    <strong>Falta secuencia explícita</strong>
                    <span class="meta">Se ha hecho análisis estructural; pega o selecciona DNA para validar sitios internos y primers.</span>
                </div>
            `;

        return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Comparador de Métodos de Ensamblaje</title>
<style>
:root{
    --bg:#0d1321;
    --panel:#121b2b;
    --panel-soft:#172338;
    --line:#26344b;
    --text:#edf2f7;
    --muted:#9bb0c8;
    --accent:#61d6c6;
    --accent-2:#8fb8ff;
    --good:#9ee493;
    --warn:#f3c969;
    --bad:#ff8f8f;
}
*{box-sizing:border-box}
body{margin:0;font-family:'Aptos','Segoe UI',sans-serif;background:radial-gradient(circle at top left, rgba(97,214,198,0.12), transparent 34%), linear-gradient(180deg, #0d1321 0%, #0a101b 100%);color:var(--text)}
.shell{padding:24px;display:grid;gap:18px}
.hero{display:grid;grid-template-columns:1.4fr 1fr;gap:18px}
.panel{background:linear-gradient(180deg, rgba(18,27,43,0.96), rgba(11,17,28,0.96));border:1px solid var(--line);border-radius:18px;padding:18px;box-shadow:0 18px 40px rgba(0,0,0,0.22)}
.hero h1{margin:0;font-size:26px;letter-spacing:0.02em}
.hero p{margin:10px 0 0;color:var(--muted);line-height:1.5}
.toolbar{display:flex;gap:10px;flex-wrap:wrap;margin-top:16px}
.selector{display:flex;flex-direction:column;gap:6px;font-size:12px;color:var(--muted)}
.selector select{background:#172338;color:var(--text);border:1px solid var(--line);padding:10px 12px;border-radius:14px;min-width:220px}
button{border:1px solid var(--line);background:#18243a;color:var(--text);padding:10px 14px;border-radius:999px;cursor:pointer;font-weight:600}
button:hover{border-color:var(--accent)}
button.primary{background:linear-gradient(135deg, var(--accent), #4ab3db);color:#07131f;border:none}
.summary-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:12px}
.summary-card{background:var(--panel-soft);border:1px solid rgba(143,184,255,0.14);border-radius:16px;padding:14px;display:flex;flex-direction:column;gap:8px;min-height:118px}
.summary-card.wide{grid-column:1 / -1}
.label{font-size:11px;text-transform:uppercase;letter-spacing:0.08em;color:var(--muted)}
.summary-card strong{font-size:18px}
.meta{font-size:12px;color:var(--muted);line-height:1.4}
.grid-2{display:grid;grid-template-columns:1fr 1fr;gap:18px}
.chip-row,.method-meta{display:flex;gap:8px;flex-wrap:wrap}
.chip{display:inline-flex;align-items:center;gap:6px;padding:6px 10px;border-radius:999px;background:rgba(97,214,198,0.14);border:1px solid rgba(97,214,198,0.2);font-size:12px;color:var(--text)}
.chip.subtle{background:#142032;border-color:#21324a;color:var(--muted)}
.muted{color:var(--muted)}
.warnings{display:grid;gap:8px}
.warning,.reason,.blocker{padding:10px 12px;border-radius:12px;font-size:13px;line-height:1.45}
.warning{background:rgba(243,201,105,0.12);border:1px solid rgba(243,201,105,0.2);color:#ffe49e}
.reason{background:rgba(143,184,255,0.09);border:1px solid rgba(143,184,255,0.12);color:#d5e4ff}
.blocker{background:rgba(255,143,143,0.1);border:1px solid rgba(255,143,143,0.16);color:#ffd0d0}
.backbone-stack,.method-stack{display:grid;gap:12px}
.backbone-card,.method-card{background:var(--panel-soft);border:1px solid #21324a;border-radius:16px;padding:16px}
.method-card.recommended,.backbone-card.recommended{border-color:rgba(97,214,198,0.38);box-shadow:0 0 0 1px rgba(97,214,198,0.12) inset}
.backbone-head,.method-top{display:flex;justify-content:space-between;gap:12px;align-items:flex-start}
.backbone-meta,.eyebrow{font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:0.08em;margin:6px 0 10px}
.method-card h3{margin:2px 0 0;font-size:18px}
.method-card p,.backbone-card p{margin:10px 0 0;color:var(--muted);line-height:1.5}
.score{padding:8px 10px;border-radius:999px;font-weight:700;font-size:12px;white-space:nowrap}
.score.excellent{background:rgba(158,228,147,0.16);color:var(--good)}
.score.good{background:rgba(97,214,198,0.16);color:var(--accent)}
.score.caution{background:rgba(243,201,105,0.16);color:var(--warn)}
.score.poor{background:rgba(255,143,143,0.16);color:var(--bad)}
.reason-list,.blocker-list{display:grid;gap:8px;margin-top:12px}
.actions-row{display:flex;gap:10px;flex-wrap:wrap;margin-top:14px}
table{width:100%;border-collapse:collapse;font-size:13px}
th,td{padding:10px 12px;border-bottom:1px solid var(--line);text-align:left}
th{color:var(--accent-2);font-size:12px;text-transform:uppercase;letter-spacing:0.06em}
.empty{padding:18px;border-radius:16px;background:var(--panel-soft);border:1px dashed var(--line);color:var(--muted)}
.map-wrap{margin-top:12px;min-height:260px}
@media (max-width: 980px){
    .hero,.grid-2,.summary-grid{grid-template-columns:1fr}
    .summary-card.wide{grid-column:auto}
}
</style>
</head>
<body>
<div class="shell">
    <section class="hero">
        <div class="panel">
            <div class="label">Diseño Genético</div>
            <h1>Comparador de Métodos de Ensamblaje</h1>
            <p>Parsea BioScript a fragmentos ensamblables reales, monta el cassette sobre el backbone elegido, diseña primers automáticos y valida junctions y colony PCR.</p>
            <div class="toolbar" style="margin-top:14px">
                <label class="selector">Backbone<select onchange="setBackbone(this.value)">${backboneOptions}</select></label>
                <label class="selector">Método<select onchange="setMethod(this.value)">${methodOptions}</select></label>
            </div>
            <div class="toolbar">
                <button class="primary" onclick="refreshPlanner()">Analizar editor activo</button>
                <button onclick="exportReport()">Exportar informe</button>
                <button onclick="designPrimers()">Diseñar primers</button>
            </div>
        </div>
        <div class="panel">
            <div class="label">Entrada actual</div>
            <h2 style="margin:6px 0 10px 0">${escapeHtml(analysis.sourceLabel)}</h2>
            <div class="chip-row">
                <span class="chip">Tipo: ${escapeHtml(analysis.sourceKind)}</span>
                <span class="chip">${analysis.explicitSequence ? `${analysis.sequenceLength} bp analizados` : `${analysis.estimatedLength} bp estimados`}</span>
                <span class="chip">${analysis.fragmentCount || 0} fragmento(s)</span>
                <span class="chip">GC ${analysis.gcPercent !== null ? `${analysis.gcPercent.toFixed(1)}%` : 'N/D'}</span>
            </div>
            ${topMethod ? `<p style="margin-top:14px;color:var(--muted)">Método activo: <strong style="color:var(--text)">${escapeHtml(topMethod.name)}</strong> con ${topMethod.score}/100. Backbone activo: <strong style="color:var(--text)">${escapeHtml(assembly.backbone.name)}</strong>.</p>` : '<p style="margin-top:14px;color:var(--muted)">Abre un .bio o selecciona DNA para generar recomendación.</p>'}
            <p style="margin-top:10px;color:var(--muted)">Exactitud del ensamblaje: <strong style="color:var(--text)">${assembly.exactAssembly ? 'Exacta' : 'Parcial'}</strong> · ${escapeHtml(assembly.exactReason)}</p>
        </div>
    </section>

    <section class="summary-grid panel">
        ${compatibilityRow}
    </section>

    <section class="grid-2">
        <div class="panel">
            <div class="label">Fragmentos Semánticos</div>
            <div class="chip-row" style="margin-top:12px">${architecture}</div>
            ${warningBlock}
        </div>
        <div class="panel">
            <div class="label">Backbones sugeridos</div>
            <div class="backbone-stack" style="margin-top:12px">${backboneCards}</div>
        </div>
    </section>

    <section class="grid-2">
        <div class="panel">
            <div class="label">Mapa Circular</div>
            <div class="map-wrap">${assembly.circularMapSvg}</div>
        </div>
        <div class="panel">
            <div class="label">Mapa Lineal</div>
            <div class="map-wrap">${assembly.linearMapSvg}</div>
        </div>
    </section>

    <section class="panel">
        <div class="label">Ranking de métodos</div>
        <div class="method-stack" style="margin-top:12px">${methodCards}</div>
    </section>

    <section class="grid-2">
        <div class="panel">
            <div class="label">Primers Automáticos</div>
            <div style="overflow:auto;margin-top:12px">${assembly.primers.length > 0 ? `<table>
                <tr><th>Primer</th><th>Fragmento</th><th>Rol</th><th>Tm</th><th>Secuencia</th></tr>
                ${assembly.primers.map(primer => `<tr><td>${escapeHtml(primer.name)}</td><td>${escapeHtml(primer.fragmentName)}</td><td>${escapeHtml(primer.role)}</td><td>${primer.tm.toFixed(1)} °C</td><td style="font-size:11px">${escapeHtml(primer.sequence)}</td></tr>`).join('')}
            </table>` : '<div class="empty">No hay primers automáticos disponibles con el contexto actual.</div>'}</div>
        </div>
        <div class="panel">
            <div class="label">Junctions y Overhangs</div>
            <div class="reason-list" style="margin-top:12px">${assembly.junctions.map(junction => `<div class="${junction.status === 'ok' ? 'reason' : junction.status === 'warning' ? 'warning' : 'blocker'}"><strong>${escapeHtml(junction.name)}</strong><br>${escapeHtml(junction.basis)} · ${escapeHtml(junction.note)}</div>`).join('') || '<div class="empty">Sin junctions calculadas.</div>'}</div>
            ${assembly.overhangs.length > 0 ? `<div class="chip-row" style="margin-top:12px">${assembly.overhangs.map(overhang => `<span class="chip subtle">${escapeHtml(overhang)}</span>`).join('')}</div>` : ''}
        </div>
    </section>

    <section class="grid-2">
        <div class="panel">
            <div class="label">Colony PCR</div>
            <div style="overflow:auto;margin-top:12px">${assembly.colonyPcr.length > 0 ? `<table>
                <tr><th>Ensayo</th><th>Objetivo</th><th>Amplicón</th></tr>
                ${assembly.colonyPcr.map(assay => `<tr><td>${escapeHtml(assay.name)}</td><td>${escapeHtml(assay.purpose)}</td><td>${assay.expectedBp} bp</td></tr>`).join('')}
            </table>` : '<div class="empty">No hay colony PCR exacta para este backbone; faltan flancos vectoriales curados.</div>'}</div>
        </div>
        <div class="panel">
            <div class="label">Verificación Post-Clonación</div>
            <div class="reason-list" style="margin-top:12px">${assembly.verificationPlan.map(step => `<div class="reason">${escapeHtml(step)}</div>`).join('')}</div>
        </div>
    </section>

    <section class="panel">
        <div class="label">Matriz de decisión</div>
        <div style="margin-top:12px;overflow:auto">${decisionMatrix || '<div class="empty">No hay suficiente contexto para construir la matriz.</div>'}</div>
    </section>
</div>

<script>
const vscode = acquireVsCodeApi();
function selectMethod(key) { vscode.postMessage({ command: 'selectMethod', data: key }); }
function setMethod(key) { vscode.postMessage({ command: 'setMethod', data: key }); }
function setBackbone(name) { vscode.postMessage({ command: 'setBackbone', data: name }); }
function designPrimers(key) { vscode.postMessage({ command: 'designPrimers', data: key || null }); }
function refreshPlanner() { vscode.postMessage({ command: 'refresh' }); }
function exportReport() { vscode.postMessage({ command: 'exportReport' }); }
</script>
</body>
</html>`;
    }

    private buildGibsonWorkbenchHtml(analysis: ActiveConstructAnalysis, assembly: AssemblyPreview): string {
        const report = buildGibsonWorkbenchReport(analysis, assembly);
        const gibson = analysis.methods.find(method => method.key === 'gibson');
        const backboneOptions = getBackboneModels().map(model => `<option value="${model.name}" ${model.name === assembly.backbone.name ? 'selected' : ''}>${model.name}</option>`).join('');
        const okOverlaps = report.overlapAssessments.filter(overlap => overlap.status === 'ok').length;
        const primerTable = assembly.primers.length > 0
            ? `<table>
                <tr><th>Primer</th><th>Fragmento</th><th>Tail</th><th>Binding</th><th>Tm</th><th>Secuencia completa</th></tr>
                ${assembly.primers.map(primer => `<tr><td>${escapeHtml(primer.name)}</td><td>${escapeHtml(primer.fragmentName)}</td><td style="font-size:11px">${escapeHtml(primer.tail || '—')}</td><td style="font-size:11px">${escapeHtml(primer.bindingSequence)}</td><td>${primer.tm.toFixed(1)} °C</td><td style="font-size:11px">${escapeHtml(primer.sequence)}</td></tr>`).join('')}
            </table>`
            : '<div class="empty">No hay primers Gibson resolubles con el contexto actual.</div>';
        const overlapTable = report.overlapAssessments.length > 0
            ? `<table>
                <tr><th>Junction</th><th>Homología</th><th>Longitud</th><th>GC</th><th>Estado</th><th>Lectura</th></tr>
                ${report.overlapAssessments.map(overlap => `<tr><td>${escapeHtml(overlap.name)}</td><td style="font-size:11px">${escapeHtml(overlap.sequence || '—')}</td><td>${overlap.length} bp</td><td>${overlap.sequence ? `${overlap.gcPercent.toFixed(1)}%` : 'N/D'}</td><td><span class="score ${gibsonStatusTone(overlap.status)}">${overlap.status.toUpperCase()}</span></td><td>${escapeHtml(overlap.note)}</td></tr>`).join('')}
            </table>`
            : '<div class="empty">No hay junctions suficientes para evaluar Gibson todavía.</div>';
        const reactionTable = report.reactionItems.length > 0
            ? `<table>
                <tr><th>Componente</th><th>Rol</th><th>Tamaño</th><th>Carga objetivo</th><th>Volumen</th></tr>
                ${report.reactionItems.map(item => `<tr><td>${escapeHtml(item.name)}</td><td>${item.role}</td><td>${item.bp} bp</td><td>${item.ng.toFixed(1)} ng · ${item.pmol.toFixed(3)} pmol</td><td>${escapeHtml(item.volumeFormula)}</td></tr>`).join('')}
            </table>
            <p style="margin-top:12px;color:var(--muted)">Cálculo: ng objetivo = bp × pmol × 0.65. Volumen real = ng objetivo / concentración stock.</p>`
            : '<div class="empty">Falta una secuencia resuelta para calcular la carga molar de Gibson.</div>';
        const colonyTable = assembly.colonyPcr.length > 0
            ? `<table>
                <tr><th>Ensayo</th><th>Objetivo</th><th>Amplicón</th></tr>
                ${assembly.colonyPcr.map(assay => `<tr><td>${escapeHtml(assay.name)}</td><td>${escapeHtml(assay.purpose)}</td><td>${assay.expectedBp} bp</td></tr>`).join('')}
            </table>`
            : '<div class="empty">Este backbone no tiene flancos suficientes para colony PCR exacta en el modelo actual.</div>';
        const alertBlock = report.alerts.length > 0
            ? report.alerts.map(alert => `<div class="warning">${escapeHtml(alert)}</div>`).join('')
            : '<div class="reason">Sin alertas críticas para el montaje Gibson actual.</div>';
        const strengthBlock = report.strengths.length > 0
            ? report.strengths.map(strength => `<div class="reason">${escapeHtml(strength)}</div>`).join('')
            : '<div class="empty">Aún no hay suficientes evidencias para dar una recomendación fuerte.</div>';
        const controlBlock = report.controls.map(control => `<div class="reason">${escapeHtml(control)}</div>`).join('');

        return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Workbench de Ensamblaje Gibson</title>
<style>
:root{
    --bg:#0d1321;
    --panel:#121b2b;
    --panel-soft:#172338;
    --line:#26344b;
    --text:#edf2f7;
    --muted:#9bb0c8;
    --accent:#61d6c6;
    --accent-2:#8fb8ff;
    --good:#9ee493;
    --warn:#f3c969;
    --bad:#ff8f8f;
}
*{box-sizing:border-box}
body{margin:0;font-family:'Aptos','Segoe UI',sans-serif;background:radial-gradient(circle at top left, rgba(97,214,198,0.12), transparent 34%), linear-gradient(180deg, #0d1321 0%, #0a101b 100%);color:var(--text)}
.shell{padding:24px;display:grid;gap:18px}
.hero{display:grid;grid-template-columns:1.35fr 1fr;gap:18px}
.panel{background:linear-gradient(180deg, rgba(18,27,43,0.96), rgba(11,17,28,0.96));border:1px solid var(--line);border-radius:18px;padding:18px;box-shadow:0 18px 40px rgba(0,0,0,0.22)}
.hero h1{margin:0;font-size:26px;letter-spacing:0.02em}
.hero p{margin:10px 0 0;color:var(--muted);line-height:1.5}
.toolbar{display:flex;gap:10px;flex-wrap:wrap;margin-top:16px}
.selector{display:flex;flex-direction:column;gap:6px;font-size:12px;color:var(--muted)}
.selector select{background:#172338;color:var(--text);border:1px solid var(--line);padding:10px 12px;border-radius:14px;min-width:220px}
button{border:1px solid var(--line);background:#18243a;color:var(--text);padding:10px 14px;border-radius:999px;cursor:pointer;font-weight:600}
button:hover{border-color:var(--accent)}
button.primary{background:linear-gradient(135deg, var(--accent), #4ab3db);color:#07131f;border:none}
.summary-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:12px}
.summary-card{background:var(--panel-soft);border:1px solid rgba(143,184,255,0.14);border-radius:16px;padding:14px;display:flex;flex-direction:column;gap:8px;min-height:118px}
.summary-card.wide{grid-column:span 2}
.label{font-size:11px;text-transform:uppercase;letter-spacing:0.08em;color:var(--muted)}
.summary-card strong{font-size:18px}
.meta{font-size:12px;color:var(--muted);line-height:1.4}
.grid-2{display:grid;grid-template-columns:1fr 1fr;gap:18px}
.chip-row{display:flex;gap:8px;flex-wrap:wrap}
.chip{display:inline-flex;align-items:center;gap:6px;padding:6px 10px;border-radius:999px;background:rgba(97,214,198,0.14);border:1px solid rgba(97,214,198,0.2);font-size:12px;color:var(--text)}
.muted{color:var(--muted)}
.warning,.reason,.blocker{padding:10px 12px;border-radius:12px;font-size:13px;line-height:1.45}
.warning{background:rgba(243,201,105,0.12);border:1px solid rgba(243,201,105,0.2);color:#ffe49e}
.reason{background:rgba(143,184,255,0.09);border:1px solid rgba(143,184,255,0.12);color:#d5e4ff}
.blocker{background:rgba(255,143,143,0.1);border:1px solid rgba(255,143,143,0.16);color:#ffd0d0}
.reason-list,.blocker-list{display:grid;gap:8px;margin-top:12px}
.score{padding:8px 10px;border-radius:999px;font-weight:700;font-size:12px;white-space:nowrap}
.score.excellent{background:rgba(158,228,147,0.16);color:var(--good)}
.score.good{background:rgba(97,214,198,0.16);color:var(--accent)}
.score.caution{background:rgba(243,201,105,0.16);color:var(--warn)}
.score.poor{background:rgba(255,143,143,0.16);color:var(--bad)}
.empty{padding:18px;border-radius:16px;background:var(--panel-soft);border:1px dashed var(--line);color:var(--muted)}
table{width:100%;border-collapse:collapse;font-size:13px}
th,td{padding:10px 12px;border-bottom:1px solid var(--line);text-align:left;vertical-align:top}
th{color:var(--accent-2);font-size:12px;text-transform:uppercase;letter-spacing:0.06em}
.map-wrap{margin-top:12px;min-height:260px}
@media (max-width: 980px){
    .hero,.grid-2,.summary-grid{grid-template-columns:1fr}
    .summary-card.wide{grid-column:auto}
}
</style>
</head>
<body>
<div class="shell">
    <section class="hero">
        <div class="panel">
            <div class="label">Diseño Genético</div>
            <h1>Workbench de Ensamblaje Gibson</h1>
            <p>Convierte el editor activo en un montaje Gibson real: valida homología entre junctions, propone carga molar por fragmento, genera primers con tail isoterma y deja listo el plan de cribado.</p>
            <div class="toolbar" style="margin-top:14px">
                <label class="selector">Backbone<select onchange="setBackbone(this.value)">${backboneOptions}</select></label>
            </div>
            <div class="toolbar">
                <button class="primary" onclick="refreshPlanner()">Analizar editor activo</button>
                <button onclick="selectMethod('gibson')">Ver protocolo Gibson</button>
                <button onclick="designPrimers('gibson')">Diseñar primers Gibson</button>
                <button onclick="openCompare()">Comparar métodos</button>
                <button onclick="exportReport()">Exportar informe</button>
            </div>
        </div>
        <div class="panel">
            <div class="label">Montaje actual</div>
            <div style="display:flex;justify-content:space-between;gap:12px;align-items:flex-start;margin-top:6px">
                <div>
                    <h2 style="margin:0">${escapeHtml(analysis.sourceLabel)}</h2>
                    <p style="margin-top:10px">Backbone activo: <strong style="color:var(--text)">${escapeHtml(assembly.backbone.name)}</strong><br>Exactitud: <strong style="color:var(--text)">${assembly.exactAssembly ? 'Exacta' : 'Parcial'}</strong> · ${escapeHtml(assembly.exactReason)}</p>
                </div>
                <div class="score ${gibson ? scoreTone(gibson.score) : 'caution'}">${gibson ? `${gibson.score}/100` : 'N/D'}</div>
            </div>
            <div class="chip-row" style="margin-top:12px">
                <span class="chip">${analysis.explicitSequence ? `${analysis.sequenceLength} bp resueltos` : `${analysis.estimatedLength} bp estimados`}</span>
                <span class="chip">${analysis.fragmentCount || 0} fragmento(s)</span>
                <span class="chip">GC ${analysis.gcPercent !== null ? `${analysis.gcPercent.toFixed(1)}%` : 'N/D'}</span>
            </div>
            <div class="reason-list">
                ${(gibson?.reasons || []).map(reason => `<div class="reason">${escapeHtml(reason)}</div>`).join('') || '<div class="empty">Sin razonamiento disponible todavía.</div>'}
                ${(gibson?.blockers || []).map(blocker => `<div class="blocker">${escapeHtml(blocker)}</div>`).join('')}
            </div>
        </div>
    </section>

    <section class="summary-grid panel">
        <div class="summary-card">
            <span class="label">Junctions sólidas</span>
            <strong>${okOverlaps}/${report.overlapAssessments.length || 0}</strong>
            <span class="meta">Homologías en rango operativo para Gibson.</span>
        </div>
        <div class="summary-card">
            <span class="label">Carga molar</span>
            <strong>${report.totalPmol.toFixed(3)} pmol</strong>
            <span class="meta">Vector ${report.vectorPmol.toFixed(3)} pmol · cada inserto ${report.insertPmol.toFixed(3)} pmol.</span>
        </div>
        <div class="summary-card">
            <span class="label">DNA total</span>
            <strong>${report.totalNg.toFixed(1)} ng</strong>
            <span class="meta">Objetivo teórico para una reacción de 20 µL.</span>
        </div>
        <div class="summary-card">
            <span class="label">Incubación</span>
            <strong>${escapeHtml(report.incubation)}</strong>
            <span class="meta">Ajustada al número de fragmentos del montaje actual.</span>
        </div>
    </section>

    <section class="grid-2">
        <div class="panel">
            <div class="label">Alertas críticas</div>
            <div class="reason-list" style="margin-top:12px">${alertBlock}</div>
        </div>
        <div class="panel">
            <div class="label">Puntos fuertes del diseño</div>
            <div class="reason-list" style="margin-top:12px">${strengthBlock}</div>
        </div>
    </section>

    <section class="grid-2">
        <div class="panel">
            <div class="label">Mapa Circular</div>
            <div class="map-wrap">${assembly.circularMapSvg}</div>
        </div>
        <div class="panel">
            <div class="label">Mapa Lineal</div>
            <div class="map-wrap">${assembly.linearMapSvg}</div>
        </div>
    </section>

    <section class="grid-2">
        <div class="panel">
            <div class="label">Setup de reacción Gibson</div>
            <div style="overflow:auto;margin-top:12px">${reactionTable}</div>
        </div>
        <div class="panel">
            <div class="label">Checklist experimental</div>
            <div class="reason-list" style="margin-top:12px">${controlBlock}</div>
        </div>
    </section>

    <section class="grid-2">
        <div class="panel">
            <div class="label">Junction QC</div>
            <div style="overflow:auto;margin-top:12px">${overlapTable}</div>
        </div>
        <div class="panel">
            <div class="label">Primers Gibson</div>
            <div style="overflow:auto;margin-top:12px">${primerTable}</div>
        </div>
    </section>

    <section class="grid-2">
        <div class="panel">
            <div class="label">Colony PCR</div>
            <div style="overflow:auto;margin-top:12px">${colonyTable}</div>
        </div>
        <div class="panel">
            <div class="label">Verificación post-clonación</div>
            <div class="reason-list" style="margin-top:12px">${assembly.verificationPlan.map(step => `<div class="reason">${escapeHtml(step)}</div>`).join('')}</div>
        </div>
    </section>
</div>

<script>
const vscode = acquireVsCodeApi();
function selectMethod(key) { vscode.postMessage({ command: 'selectMethod', data: key }); }
function setBackbone(name) { vscode.postMessage({ command: 'setBackbone', data: name }); }
function designPrimers(key) { vscode.postMessage({ command: 'designPrimers', data: key || null }); }
function refreshPlanner() { vscode.postMessage({ command: 'refresh' }); }
function exportReport() { vscode.postMessage({ command: 'exportReport' }); }
function openCompare() { vscode.postMessage({ command: 'openCompare' }); }
</script>
</body>
</html>`;
    }

    dispose(): void {
        this.panel?.dispose();
        this.disposables.forEach(disposable => disposable.dispose());
    }
}
