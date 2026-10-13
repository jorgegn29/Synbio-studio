import { EXAMPLES } from './examples';
import { sequenceForPart, type GeneticPart } from './compiler';

export const INVERTER_SOURCE = `circuit inverter {
    promoter: J23101   // Anderson 2009, RPU 0.70
    rbs: B0034
    gene tetR {
        sequence: "ATGTCTAGATTAGATAAAAGTAAAGTGATTAACAGCGCATTAGAGCTGCTTAATGAGGTCGGAATCGAAGGTTTAACAACC"
        product: TetR
    }
    terminator: B0015
}
`;

export const CONSTRUCT_SOURCE = `// plasmid circular constructo — 12 parts, backbone plus regulatory links
circuit constructo {
    J23101 -> B0034 -> tetR -> B0015
    pTet -> B0032 -> GFP -> B0010
    pLac -> B0030 -> LacI -> B0012
}
`;

export interface StudioFile {
  name: string;
  language: 'bioscript' | 'yaml' | 'json';
  contents: string;
}

export const BUILD_FILE = `version: 1
steps:
  - compile
  - simulate-ssa
  - simulate-ode
  - fba
  - protocol
`;

export function starterFiles(): StudioFile[] {
  return [
    { name: 'inverter.bio', language: 'bioscript', contents: INVERTER_SOURCE },
    { name: 'constructo.bio', language: 'bioscript', contents: CONSTRUCT_SOURCE },
    { name: 'hello-biology.bio', language: 'bioscript', contents: EXAMPLES[0].code },
    { name: 'project.synbio', language: 'json', contents: JSON.stringify({ name: 'Proyecto Synbio', format: 'project.synbio', files: ['inverter.bio', 'constructo.bio', 'hello-biology.bio'] }, null, 2) },
    { name: 'synbio.build.yaml', language: 'yaml', contents: BUILD_FILE },
  ];
}

export interface CatalogPart {
  name: string;
  type: GeneticPart['type'];
  group: 'Reguladores' | 'Traduccion' | 'CDS/Genes' | 'Marcadores';
  note: string;
}

export const CATALOG: CatalogPart[] = [
  { name: 'J23101', type: 'promoter', group: 'Reguladores', note: 'Anderson constitutive, RPU 0.70' },
  { name: 'J23100', type: 'promoter', group: 'Reguladores', note: 'Anderson constitutive, RPU 1.00' },
  { name: 'J23106', type: 'promoter', group: 'Reguladores', note: 'Anderson constitutive, RPU 0.47' },
  { name: 'pLac', type: 'promoter', group: 'Reguladores', note: 'Lac promoter, repressed by LacI' },
  { name: 'pTet', type: 'promoter', group: 'Reguladores', note: 'Tet promoter, repressed by TetR' },
  { name: 'pBad', type: 'promoter', group: 'Reguladores', note: 'araBAD promoter' },
  { name: 'pT7', type: 'promoter', group: 'Reguladores', note: 'T7 promoter' },
  { name: 'B0034', type: 'rbs', group: 'Traduccion', note: 'Strong RBS' },
  { name: 'B0032', type: 'rbs', group: 'Traduccion', note: 'Medium RBS' },
  { name: 'B0030', type: 'rbs', group: 'Traduccion', note: 'Medium-weak RBS' },
  { name: 'rbs_strong', type: 'rbs', group: 'Traduccion', note: 'Alias of B0034' },
  { name: 'rbs_medium', type: 'rbs', group: 'Traduccion', note: 'Medium RBS' },
  { name: 'rbs_weak', type: 'rbs', group: 'Traduccion', note: 'Weak RBS' },
  { name: 'tetR', type: 'cds', group: 'CDS/Genes', note: 'TetR repressor fragment from the parts catalog' },
  { name: 'LacI', type: 'cds', group: 'CDS/Genes', note: 'LacI fragment from the parts catalog' },
  { name: 'GFP', type: 'reporter', group: 'Marcadores', note: 'E0040 GFP coding sequence' },
  { name: 'RFP', type: 'reporter', group: 'Marcadores', note: 'Reporter name; sequence is absent unless you paste one' },
  { name: 'B0015', type: 'terminator', group: 'Reguladores', note: 'Double terminator' },
  { name: 'B0010', type: 'terminator', group: 'Reguladores', note: 'Terminator' },
  { name: 'B0012', type: 'terminator', group: 'Reguladores', note: 'Terminator' },
];

export function catalogSequence(name: string): string | undefined {
  return sequenceForPart(name);
}

export interface OrganismCard {
  name: string;
  group: string;
  bsl: number;
  note: string;
}

export const ORGANISMS: OrganismCard[] = [
  { name: 'E. coli K-12 MG1655', group: 'Bacterias', bsl: 1, note: 'NIH III-F-6, genome U00096' },
  { name: 'E. coli DH5α', group: 'Bacterias', bsl: 1, note: 'Cloning strain, no flagellar assembly' },
  { name: 'E. coli BL21(DE3)', group: 'Bacterias', bsl: 1, note: 'T7 expression host' },
  { name: 'B. subtilis 168', group: 'Bacterias', bsl: 1, note: 'Kazusa codon table in the client' },
  { name: 'S. cerevisiae S288C', group: 'Levaduras', bsl: 1, note: 'GRAS, Kazusa 4932' },
  { name: 'P. pastoris', group: 'Levaduras', bsl: 1, note: 'Methylotrophic yeast, schematic atlas only' },
  { name: 'Cell-free TXTL', group: 'Cell-free', bsl: 1, note: 'No chassis genome; reactions stay in the model' },
];

export const LITERATURE = [
  { id: 'gillespie', cite: 'Gillespie, D.T. (1977) J. Phys. Chem. 81:2340. Exact stochastic simulation.', topic: 'SSA' },
  { id: 'elowitz', cite: 'Elowitz & Leibler (2000) Nature 403:335. Repressilator.', topic: 'SSA rates' },
  { id: 'orth', cite: 'Orth, Thiele & Palsson (2010) Nat Biotechnol 28:245. What is FBA?', topic: 'FBA' },
  { id: 'santalucia', cite: 'SantaLucia (1998) PNAS 95:1460. Nearest-neighbor thermodynamics.', topic: 'Tm' },
  { id: 'salis', cite: 'Salis, Mirsky & Voigt (2009) Nat Biotechnol 27:946. RBS calculator.', topic: 'RBS' },
  { id: 'sharp', cite: 'Sharp & Li (1987) Nucleic Acids Res 15:1281. Codon adaptation index.', topic: 'CAI' },
  { id: 'kazusa', cite: 'Nakamura, Gojobori & Ikemura (2000) Nucleic Acids Res 28:292.', topic: 'Codons' },
  { id: 'anderson', cite: 'Kelly et al. (2009) J Biol Eng 3:4. Anderson promoter library.', topic: 'Promoters' },
];

export interface HypNode {
  id: string;
  parentId: string | null;
  name: string;
  tipo: string;
  meta: string;
  hipotesis: string;
}

export function initialHypotheses(): HypNode[] {
  return [
    { id: 'root', parentId: null, name: 'Programa principal', tipo: 'programa', meta: 'Definir el circuito', hipotesis: 'Un inversor TetR constituye una puerta NOT.' },
    { id: 'rama-a', parentId: 'root', name: 'Rama A', tipo: 'diseno', meta: 'Compilar inverter.bio', hipotesis: 'J23101-B0034-tetR-B0015 expresa TetR de forma constitutiva.' },
  ];
}

export interface AtlasLayer {
  id: string;
  group: string;
  name: string;
  description: string;
  color: string;
  size: string;
  x: number;
  y: number;
  z: number;
}

export const ECOLI_LAYERS: AtlasLayer[] = [
  { id: 'om', group: 'Envoltura', name: 'Membrana externa', description: 'LPS y porinas. Corte anatómico esquemático, no una tomografía.', color: '#8b5a2b', size: '~2 µm de largo celular', x: 0, y: 0, z: 0 },
  { id: 'peri', group: 'Envoltura', name: 'Periplasma', description: 'Espacio entre OM e IM, peptidoglicano.', color: '#d2a679', size: '15–20 nm', x: 0, y: 0, z: 1 },
  { id: 'im', group: 'Envoltura', name: 'Membrana interna', description: 'Bicapa donde se insertan transportadores.', color: '#c47b3a', size: '~7 nm', x: 0, y: 0, z: 2 },
  { id: 'cyto', group: 'Interior', name: 'Citoplasma', description: 'Volumen de reacción del modelo ODE/SSA.', color: '#6ea8fe', size: 'volumen ~1 fL', x: 0, y: 0, z: 3 },
  { id: 'nuc', group: 'Interior', name: 'Nucleoide', description: 'Cromosoma condensado. DH5α no es un corte cryo-EM.', color: '#f1e3a0', size: 'región central', x: 0, y: 4, z: 4 },
  { id: 'rib', group: 'Interior', name: 'Ribosomas 70S', description: 'Traducción bacteriana. No se dibujan 10^4 copias; el punto representa la población.', color: '#3fb950', size: '~20 nm', x: 18, y: 8, z: 5 },
  { id: 'surf', group: 'Superficie', name: 'Superficie', description: 'DH5α no ensambla flagelo. No se inventa un flagelo.', color: '#8b949e', size: 'envoltura', x: 0, y: -6, z: 1 },
];

export const PICHIA_LAYERS: AtlasLayer[] = [
  { id: 'wall', group: 'Envoltura', name: 'Pared', description: 'Pared de levadura, esquemática.', color: '#b08968', size: 'célula 2–5 µm', x: 0, y: 0, z: 0 },
  { id: 'pm', group: 'Envoltura', name: 'Membrana plasmática', description: 'Límite del citoplasma.', color: '#e6b17e', size: '~8 nm', x: 0, y: 0, z: 1 },
  { id: 'nuc', group: 'Interior', name: 'Núcleo', description: 'Compartimento nuclear, no un mapa de poros.', color: '#f1e3a0', size: '~1 µm', x: 0, y: -4, z: 3 },
  { id: 'vac', group: 'Interior', name: 'Vacuola', description: 'Vacuola grande típica de levadura.', color: '#58a6ff', size: 'fracción grande del volumen', x: 16, y: 6, z: 2 },
  { id: 'mit', group: 'Interior', name: 'Mitocondria', description: 'Orgánulo esquemático, no una reconstrucción.', color: '#f85149', size: '~0.5 µm', x: -18, y: 8, z: 3 },
  { id: 'er', group: 'Interior', name: 'RE', description: 'Retículo alrededor del núcleo.', color: '#d2a8ff', size: 'red', x: 0, y: -2, z: 2 },
  { id: 'rib', group: 'Interior', name: 'Ribosomas 80S', description: 'Traducción eucariota.', color: '#3fb950', size: '~25–30 nm', x: 10, y: -10, z: 4 },
];

export interface ToolMeta {
  id: string;
  name: string;
  group: string;
}

export const TOOLBOX: ToolMeta[] = [
  ['circuit-workbench', 'Genetic Circuit Workbench', 'Diseño genético'],
  ['codon', 'Codon Engineering Studio', 'Diseño genético'],
  ['promoter', 'Promoter Engineering', 'Diseño genético'],
  ['rbs', 'RBS Engineering', 'Diseño genético'],
  ['restriction', 'Restriction Mapping', 'Diseño genético'],
  ['plasmid-viewer', 'Plasmid Map Viewer', 'Diseño genético'],
  ['gibson', 'Gibson Assembly', 'Diseño genético'],
  ['golden-gate', 'Golden Gate Planner', 'Diseño genético'],
  ['blast', 'BLAST Search (catálogo local)', 'Análisis de secuencias'],
  ['orf', 'ORF Finder', 'Análisis de secuencias'],
  ['gc', 'GC Content Analyzer', 'Análisis de secuencias'],
  ['primers', 'Primer Designer', 'Análisis de secuencias'],
  ['align', 'Sequence Aligner', 'Análisis de secuencias'],
  ['tm', 'Tm Calculator', 'Análisis de secuencias'],
  ['repeats', 'Repeat Finder', 'Análisis de secuencias'],
  ['ssa', 'Gillespie SSA', 'Simulación'],
  ['ode', 'ODE Solver', 'Simulación'],
  ['fba', 'FBA', 'Simulación'],
  ['crispr', 'CRISPR guide scan', 'Simulación'],
  ['growth', 'Growth Predictor', 'Simulación'],
  ['debugger', 'Circuit Debugger', 'Simulación'],
  ['pathway', 'Pathway Analyzer', 'Simulación'],
  ['biosecurity', 'Biosecurity Scanner', 'Seguridad'],
  ['bsl', 'BSL Classifier', 'Seguridad'],
  ['toxin', 'Toxin Detector', 'Seguridad'],
  ['kill-switch', 'Kill Switch Designer', 'Seguridad'],
  ['containment', 'Containment Checker', 'Seguridad'],
  ['export-compliance', 'Export Compliance', 'Seguridad'],
  ['protocol', 'Protocol Generator', 'Laboratorio'],
  ['eln', 'ELN Manager', 'Laboratorio'],
  ['inventory', 'Parts Inventory', 'Laboratorio'],
  ['plate', 'Plate Designer', 'Laboratorio'],
  ['equipment', 'Equipment Tracker', 'Laboratorio'],
  ['opentrons', 'Opentrons protocol', 'Laboratorio'],
  ['hamilton', 'Hamilton worklist', 'Laboratorio'],
  ['copilot', 'Design Oracle', 'AI / reglas'],
  ['autocorrect', 'Auto-Corrector', 'AI / reglas'],
  ['rules', 'Design Rule Checker', 'AI / reglas'],
  ['optimizer', 'Design Optimizer', 'AI / reglas'],
  ['protein', 'Protein properties', 'AI / reglas'],
  ['rna', 'RNA fold (Nussinov)', 'AI / reglas'],
  ['anomaly', 'Anomaly Detector', 'AI / reglas'],
  ['moat', 'Run summary', 'Datos'],
  ['logger', 'Experiment Logger', 'Datos'],
  ['stats', 'Statistics', 'Datos'],
  ['export', 'Export Manager', 'Datos'],
  ['import', 'Import Wizard', 'Datos'],
  ['build', 'Build System', 'Datos'],
  ['benchling', 'Benchling prep', 'Datos'],
  ['marketplace', 'Extension Marketplace', 'Datos'],
  ['igem', 'iGEM catalog (local)', 'Registros'],
  ['addgene', 'Vector cards', 'Registros'],
  ['synbiohub', 'SynBioHub export', 'Registros'],
  ['ncbi', 'NCBI (local only)', 'Registros'],
  ['uniprot', 'Protein record (local)', 'Registros'],
].map(([id, name, group]) => ({ id, name, group }));

export function insertPart(source: string, name: string, type: GeneticPart['type']): string {
  if (source.includes('promoter:') && type === 'promoter') return source.replace(/promoter:\s*[A-Za-z0-9_]+/, `promoter: ${name}`);
  if (source.includes('rbs:') && type === 'rbs') return source.replace(/rbs:\s*[A-Za-z0-9_]+/, `rbs: ${name}`);
  if (source.includes('terminator:') && type === 'terminator') return source.replace(/terminator:\s*[A-Za-z0-9_]+/, `terminator: ${name}`);
  if (source.includes('->')) {
    if (type === 'terminator') return source.replace(/->\s*([A-Za-z0-9_]+)/, `-> $1 -> ${name}`);
    return source.replace(/->\s*(term_[A-Za-z0-9_]+|B001[0-9])/, `-> ${name} -> $1`);
  }
  return source.replace(/\n\}(\s*)$/, `\n    ${name}\n}$1`);
}

export function removePart(source: string, name: string): string {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return source
    .replace(new RegExp(`\\s*->\\s*${escaped}\\b`), '')
    .replace(new RegExp(`\\b${escaped}\\s*->\\s*`), '')
    .replace(new RegExp(`(promoter|rbs|terminator):\\s*${escaped}`), '$1: EMPTY');
}

export function renamePart(source: string, from: string, to: string): string {
  const escaped = from.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return source.replace(new RegExp(`\\b${escaped}\\b`), to);
}

export function annotatePart(source: string, name: string, note: string): string {
  const safe = note.replace(/[/*]/g, ' ').slice(0, 80);
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return source.replace(new RegExp(`\\b${escaped}\\b`), `${name} /* ${safe} */`);
}

export function lineDiff(before: string, after: string, label: string): string {
  const a = before.split('\n');
  const b = after.split('\n');
  const out = [`--- ${label} (saved)`, `+++ ${label} (buffer)`];
  const max = Math.max(a.length, b.length);
  for (let i = 0; i < max; i++) {
    if (a[i] === b[i]) continue;
    if (a[i] !== undefined) out.push(`- ${a[i]}`);
    if (b[i] !== undefined) out.push(`+ ${b[i]}`);
  }
  return out.length === 2 ? 'Sin diferencias contra la última copia guardada.' : out.join('\n');
}

export function hashText(value: string): string {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}
