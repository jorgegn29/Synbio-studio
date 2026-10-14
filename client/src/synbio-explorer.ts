// ============================================================================
// SynBio Explorer — Mega TreeView Sidebar
//
// Panel masivo de exploración: 7 TreeView providers con cientos de items.
// Cada categoría tiene datos REALES de biología sintética con citas.
//
// TreeViews (7):
//   1. Project Components — archivos .bio + análisis estructural (11 categorías)
//   2. Toolbox — 55+ herramientas en 8 categorías
//   3. Parts Library — 150+ partes biológicas reales (18 categorías)
//   4. Organisms & Chassis — 30+ chassis en 7 categorías + datos reales
//   5. Safety & Compliance — BSL, biosecurity, audit, data integrity
//   6. Literature — 50+ papers fundamentales de SynBio (8 journals)
//   7. Quick Stats — métricas en vivo del workspace
//
// ============================================================================
import * as vscode from 'vscode';
import * as path from 'path';
import { extensionLang, translate, type Lang } from './locale';

function uiLang(): Lang {
  try {
    const configured = vscode.workspace.getConfiguration('synbio').get('uiLanguage', 'auto');
    return extensionLang(vscode.env.language, configured);
  } catch {
    return 'es';
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// Tree Item — icon/color contextual
// ──────────────────────────────────────────────────────────────────────────────
export class SynBioTreeItem extends vscode.TreeItem {
    constructor(
        public readonly label: string,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState,
        public readonly itemType: string,
        public readonly meta?: Record<string, any>
    ) {
        const lang = uiLang();
        const shown = translate(label, lang);
        super(shown, collapsibleState);
        this.label = shown;
        this.contextValue = itemType;
        this.iconPath = this.getIcon();
        if (meta?.command) {
            this.command = { command: meta.command, title: shown, arguments: meta.args || [] };
        }
        if (meta?.description) { this.description = translate(String(meta.description), lang); }
        if (meta?.tooltip) { this.tooltip = new vscode.MarkdownString(translate(String(meta.tooltip), lang)); }
    }

    private getIcon(): vscode.ThemeIcon {
        const map: Record<string, [string, string?]> = {
            'category':       ['symbol-folder'],
            'subcategory':    ['symbol-package'],
            'component':      ['symbol-class'],
            'tool':           ['tools'],
            'part':           ['symbol-interface', 'charts.green'],
            'part-promoter':  ['play-circle', 'charts.green'],
            'part-rbs':       ['symbol-numeric', 'charts.blue'],
            'part-gene':      ['symbol-method', 'charts.purple'],
            'part-terminator':['stop-circle', 'charts.red'],
            'part-reporter':  ['lightbulb', 'charts.yellow'],
            'part-repressor': ['close-all', 'charts.orange'],
            'part-sensor':    ['radio-tower', 'charts.blue'],
            'part-tag':       ['tag', 'charts.orange'],
            'safety':         ['shield', 'charts.yellow'],
            'safety-ok':      ['pass', 'testing.iconPassed'],
            'safety-warn':    ['warning', 'charts.yellow'],
            'safety-error':   ['error', 'charts.red'],
            'organism':       ['smiley', 'charts.green'],
            'file':           ['file-code'],
            'paper':          ['book', 'charts.blue'],
            'journal':        ['library', 'charts.purple'],
            'metric':         ['graph-line', 'charts.green'],
            'genome':         ['whole-word', 'charts.purple'],
            'readiness':      ['pulse', 'charts.green'],
            'status':         ['sync', 'charts.blue'],
            'issue-critical': ['error', 'charts.red'],
            'issue-warning':  ['warning', 'charts.yellow'],
            'issue-info':     ['info', 'charts.blue'],
            'action':         ['rocket', 'charts.green'],
            'strength':       ['check', 'testing.iconPassed'],
            'fix':            ['wrench', 'charts.orange'],
            'file-group':     ['files', 'charts.blue'],
        };
        const [icon, color] = map[this.itemType] || ['circle-outline'];
        return new vscode.ThemeIcon(icon, color ? new vscode.ThemeColor(color) : undefined);
    }
}

// ──────────────────────────────────────────────────────────────────────────────
// SHARED INCREMENTAL INDEX — single parse per file, watcher-driven updates
// ──────────────────────────────────────────────────────────────────────────────
interface FileIndexEntry {
    uri: vscode.Uri;
    components: ParsedComponent[];
    stats: { circuits: number; genes: number; promoters: number; rbs: number; terminators: number; proteins: number; pathways: number; tus: number; killSwitches: number; sequences: number };
    lineCount: number;
    baseCount: number;
    host?: string;
    hasRules: boolean;
    issues: ExplorerIssue[];
    strengths: string[];
    signals: WorkspaceSignal[];
}

interface ParsedComponent { name: string; type: string; file: string; filePath: string; line: number; }

interface ExplorerIssue {
    severity: 'critical' | 'warning' | 'info';
    title: string;
    detail: string;
    file?: string;
    filePath?: string;
    line?: number;
    actionCommand?: string;
    actionLabel?: string;
    fixKind?: ExplorerFixKind;
}

interface ExplorerAction {
    label: string;
    description: string;
    command: string;
    args?: any[];
}

interface IndexStatus {
    indexing: boolean;
    scannedFiles: number;
    indexedFiles: number;
    skippedFiles: number;
    totalFiles: number;
    lastIndexedAt?: number;
    message: string;
}

interface WorkspaceReadiness {
    score: number;
    level: string;
    statusLine: string;
    issues: ExplorerIssue[];
    strengths: string[];
    nextActions: ExplorerAction[];
}

type WorkspaceSignal = 't7' | 'secretion' | 'metabolic' | 'mammalian' | 'therapeutic' | 'yeast';

interface DesignPack {
    id: string;
    label: string;
    description: string;
    focus: string;
    rationale: string;
    snippet: string;
}

interface HostRecommendation {
    label: string;
    configValue: string;
    description: string;
    rationale: string;
    signals: WorkspaceSignal[];
}

type ExplorerFixKind = 'add-host' | 'add-promoter' | 'add-rbs' | 'add-terminator' | 'add-killswitch';

interface ExplorerFix {
    label: string;
    description: string;
    filePath: string;
    line: number;
    kind: ExplorerFixKind;
}

type SmartGoal = 'expression' | 'biosensing' | 'metabolic' | 'biocontainment' | 'secretion' | 'yeast';

interface SmartPartEntry {
    name: string;
    id: string;
    type: string;
    desc: string;
    rationale: string;
    strength?: string;
    citation?: string;
    hosts: string[];
    goals: SmartGoal[];
    fixKinds: ExplorerFixKind[];
}

const BIO_INDEX_EXCLUDE = '{**/node_modules/**,**/target/**,**/.git/**,**/coverage/**,**/dist/**,**/out/**,**/build/**,**/release/**}';
const MAX_INDEXED_BIO_FILES = 800;
const MAX_INDEXED_FILE_BYTES = 1_000_000;
const INDEX_BATCH_SIZE = 16;

const DESIGN_PACKS: DesignPack[] = [
    {
        id: 'sensor-reporter',
        label: 'Pack sensor -> reportero',
        description: 'Circuito corto para biosensado y validacion rapida',
        focus: 'Deteccion',
        rationale: 'Ideal cuando el workspace tiene promotores/sensores pero falta una salida clara.',
        snippet: `circuit sensor_reporter {
    host: "ecoli_k12"

    promoter pSensor {
        type: "inducible"
        inducer: "ligand"
    }

    gene gfp_output {
        promoter: pSensor
        rbs: B0034
        terminator: B0015
    }
}
`,
    },
    {
        id: 't7-expression',
        label: 'Pack expresion T7',
        description: 'Plantilla para expresion fuerte en BL21(DE3)',
        focus: 'Expresion proteica',
        rationale: 'Encaja cuando aparecen promotores T7, BL21(DE3) o objetivos de produccion proteica.',
        snippet: `circuit t7_expression {
    host: "ecoli_bl21"

    promoter pT7 {
        type: "inducible"
        inducer: "IPTG"
    }

    gene target_protein {
        promoter: pT7
        rbs: B0034
        tag: "His6"
        terminator: B0015
    }
}
`,
    },
    {
        id: 'metabolic-pathway',
        label: 'Pack pathway metabolico',
        description: 'Esqueleto para rutas con varias enzimas y balance de expresion',
        focus: 'Metabolic engineering',
        rationale: 'Sirve cuando el proyecto ya habla de pathways, FBA o produccion de metabolitos.',
        snippet: `pathway production_pathway {
    host: "pseudomonas_putida_kt2440"

    gene enzyme_a {
        promoter: J23110
        rbs: B0034
        terminator: B0015
    }

    gene enzyme_b {
        promoter: J23106
        rbs: B0032
        terminator: B0015
    }
}
`,
    },
    {
        id: 'contained-therapeutic',
        label: 'Pack terapeutico con contencion',
        description: 'Base para chassis sensible con kill switch incorporado',
        focus: 'Biocontencion',
        rationale: 'Sube el nivel cuando hay lenguaje de probiotic/therapeutic pero falta contencion explicita.',
        snippet: `circuit contained_therapeutic {
    host: "ecoli_nissle1917"

    promoter pSense {
        type: "inducible"
        inducer: "target_signal"
    }

    gene payload {
        promoter: pSense
        rbs: B0034
        terminator: B0015
    }

    kill_switch auxotrophy_guard {
        mechanism: "conditional_survival"
    }
}
`,
    },
];

const SMART_PARTS: SmartPartEntry[] = [
    { name: 'J23110', id: 'BBa_J23110', type: 'const_proms', desc: 'Promotor constitutivo balanceado para arranque rapido', rationale: 'Buen default cuando falta promotor y aun no hay contexto fuerte.', strength: '476 RPU', citation: 'Kelly et al. 2009', hosts: ['ecoli_k12', 'ecoli_bl21', 'ecoli_nissle1917', 'pseudomonas_putida_kt2440'], goals: ['expression', 'biosensing', 'metabolic'], fixKinds: ['add-promoter'] },
    { name: 'pLac', id: 'BBa_R0010', type: 'ind_proms', desc: 'Promotor inducible IPTG para pruebas controladas', rationale: 'Util para caracterizacion y validacion gradual.', citation: 'Lutz & Bujard 1997', hosts: ['ecoli_k12', 'ecoli_bl21'], goals: ['expression', 'biosensing'], fixKinds: ['add-promoter'] },
    { name: 'pT7', id: 'BBa_I712074', type: 'ind_proms', desc: 'Promotor T7 de expresion fuerte', rationale: 'Encaja con BL21(DE3) y contextos de expresion proteica.', strength: '~5000 RPU', citation: 'Studier & Moffatt 1986', hosts: ['ecoli_bl21'], goals: ['expression'], fixKinds: ['add-promoter'] },
    { name: 'pLux', id: 'BBa_R0062', type: 'ind_proms', desc: 'Promotor AHL para biosensado y quorum sensing', rationale: 'Buena entrada cuando el objetivo es deteccion o comunicacion.', citation: 'Canton et al. 2008', hosts: ['ecoli_k12', 'ecoli_nissle1917'], goals: ['biosensing'], fixKinds: ['add-promoter'] },
    { name: 'pGAL1', id: 'pGAL1', type: 'yeast_proms', desc: 'Promotor inducible de levadura', rationale: 'Opcion directa si el host o el objetivo ya apunta a levadura.', citation: 'Johnston & Davis 1984', hosts: ['yeast_s288c'], goals: ['yeast', 'expression'], fixKinds: ['add-promoter'] },
    { name: 'B0034', id: 'BBa_B0034', type: 'rbs', desc: 'RBS fuerte estandar', rationale: 'El baseline mas util cuando falta traduccion explicita.', strength: '1.0 au', citation: 'Elowitz & Leibler 2000', hosts: ['ecoli_k12', 'ecoli_bl21', 'ecoli_nissle1917', 'pseudomonas_putida_kt2440'], goals: ['expression', 'biosensing', 'metabolic'], fixKinds: ['add-rbs'] },
    { name: 'BCD2', id: 'BCD2', type: 'rbs', desc: 'RBS bicistronico robusto al contexto', rationale: 'Conviene si buscas traduccion mas estable y menos sensible al contexto.', citation: 'Mutalik et al. 2013', hosts: ['ecoli_k12', 'ecoli_bl21'], goals: ['expression', 'metabolic'], fixKinds: ['add-rbs'] },
    { name: 'B0015', id: 'BBa_B0015', type: 'terminators', desc: 'Terminador doble fuerte', rationale: 'Primer terminador a elegir para cortar read-through rapido.', strength: '0.984', citation: 'Chen et al. 2013', hosts: ['ecoli_k12', 'ecoli_bl21', 'ecoli_nissle1917', 'pseudomonas_putida_kt2440'], goals: ['expression', 'biosensing', 'metabolic'], fixKinds: ['add-terminator'] },
    { name: 'tCYC1', id: 'tCYC1', type: 'terminators', desc: 'Terminador de levadura', rationale: 'Mejor cierre si el objetivo es expresion en levadura.', hosts: ['yeast_s288c'], goals: ['yeast'], fixKinds: ['add-terminator'] },
    { name: 'sfGFP', id: 'sfGFP', type: 'reporters_fl', desc: 'Reportero verde de plegamiento rapido', rationale: 'Ideal para leer salida enseguida durante debug biologico.', citation: 'Pedelacq et al. 2006', hosts: ['ecoli_k12', 'ecoli_bl21', 'ecoli_nissle1917', 'pseudomonas_putida_kt2440'], goals: ['expression', 'biosensing'], fixKinds: [] },
    { name: 'mCherry', id: 'BBa_J06504', type: 'reporters_fl', desc: 'Reportero rojo monomerico', rationale: 'Util si ya tienes un canal verde ocupado o quieres multiplexar.', citation: 'Shaner et al. 2004', hosts: ['ecoli_k12', 'ecoli_bl21', 'ecoli_nissle1917'], goals: ['biosensing', 'expression'], fixKinds: [] },
    { name: 'pelB', id: 'pelB', type: 'signal_peps', desc: 'Peptido senal periplasmico', rationale: 'Buen empujon para contextos de secrecion en bacterias.', hosts: ['ecoli_k12', 'ecoli_bl21'], goals: ['secretion', 'expression'], fixKinds: [] },
    { name: 'His6', id: 'His6', type: 'purification', desc: 'Tag de purificacion IMAC', rationale: 'Suma trazabilidad y downstream facil en expresion proteica.', hosts: ['ecoli_bl21', 'yeast_s288c', 'human_hek293'], goals: ['expression', 'secretion'], fixKinds: [] },
    { name: 'GeneGuard', id: 'GeneGuard', type: 'killswitches', desc: 'Contencion multicapa', rationale: 'Sube mucho el liston cuando el riesgo del chassis o uso es sensible.', citation: 'Wright et al. 2015', hosts: ['ecoli_nissle1917', 'ecoli_k12'], goals: ['biocontainment'], fixKinds: ['add-killswitch'] },
    { name: 'MazF/MazE', id: 'MazF', type: 'killswitches', desc: 'Sistema toxin-antitoxin clasico', rationale: 'Fix rapido para anadir contencion declarada al diseno.', citation: 'Zhang et al. 2003', hosts: ['ecoli_k12', 'ecoli_nissle1917'], goals: ['biocontainment'], fixKinds: ['add-killswitch'] },
    { name: 'CcdB/CcdA', id: 'CcdB', type: 'killswitches', desc: 'Kill switch potente basado en girasa', rationale: 'Opcion de contencion fuerte en chassis bacterianos.', citation: 'Bernard & Couturier 1992', hosts: ['ecoli_k12', 'ecoli_nissle1917'], goals: ['biocontainment'], fixKinds: ['add-killswitch'] },
];

const HOST_RECOMMENDATIONS: HostRecommendation[] = [
    {
        label: 'BL21(DE3)',
        configValue: 'ecoli_bl21',
        description: 'Expresion proteica fuerte con eje T7',
        rationale: 'Recomendado cuando aparecen T7, pT7 o objetivos de expresion proteica.',
        signals: ['t7'],
    },
    {
        label: 'Pichia pastoris',
        configValue: 'yeast_s288c',
        description: 'Secrecion y produccion eucariotica',
        rationale: 'Conviene cuando el workspace habla de secrecion, peptidos senal o promotores de levadura.',
        signals: ['secretion', 'yeast'],
    },
    {
        label: 'Pseudomonas putida KT2440',
        configValue: 'pseudomonas_putida_kt2440',
        description: 'Metabolic engineering y tolerancia industrial',
        rationale: 'Encaja mejor con rutas metabolicas, tolerancia a solventes y chassis industrial.',
        signals: ['metabolic'],
    },
    {
        label: 'E. coli Nissle 1917',
        configValue: 'ecoli_nissle1917',
        description: 'Chassis sensible para probiotic/living therapeutics',
        rationale: 'Util cuando el proyecto apunta a delivery, gut o therapeutic payloads.',
        signals: ['therapeutic'],
    },
    {
        label: 'HEK293',
        configValue: 'human_hek293',
        description: 'Entorno mammalian para expresion y pruebas celulares',
        rationale: 'Tiene sentido con CMV, HEK, CHO o construcciones netamente mammalian.',
        signals: ['mammalian'],
    },
];

const INDEX_PATTERNS: Array<[RegExp, string, string]> = [
    [/\bcircuit\s+(\w+)/i, 'circuit', 'circuits'],
    [/\bgene\s+(\w+)/i, 'gene', 'genes'],
    [/\bpromoter[\s:]+(\w+)/i, 'promoter', 'promoters'],
    [/\bprotein\s+(\w+)/i, 'protein', 'proteins'],
    [/\bpathway\s+(\w+)/i, 'pathway', 'pathways'],
    [/\btranscription_unit\s+(\w+)/i, 'transcription_unit', 'tus'],
    [/\bkill_switch\s*(\w*)/i, 'kill_switch', 'killSwitches'],
    [/\brbs[\s:]+(\w+)/i, 'rbs', 'rbs'],
    [/\bterminator[\s:]+(\w+)/i, 'terminator', 'terminators'],
    [/\bsequence\s*:\s*"?([ATCG]{6,})/i, 'sequence', 'sequences'],
];

export class BioFileIndex implements vscode.Disposable {
    private static _instance: BioFileIndex | undefined;
    private readonly _entries = new Map<string, FileIndexEntry>();
    private readonly _onDidChange = new vscode.EventEmitter<void>();
    readonly onDidChange = this._onDidChange.event;
    private _watcher: vscode.FileSystemWatcher;
    private _ready: Promise<void>;
    private _generation = 0;
    private _status: IndexStatus = {
        indexing: true,
        scannedFiles: 0,
        indexedFiles: 0,
        skippedFiles: 0,
        totalFiles: 0,
        message: 'Preparando indice BioScript',
    };

    static instance(): BioFileIndex {
        if (!BioFileIndex._instance) BioFileIndex._instance = new BioFileIndex();
        return BioFileIndex._instance;
    }

    private constructor() {
        this._watcher = vscode.workspace.createFileSystemWatcher('**/*.bio');
        this._watcher.onDidCreate(uri => void this._indexFile(uri));
        this._watcher.onDidChange(uri => void this._indexFile(uri));
        this._watcher.onDidDelete(uri => {
            this._entries.delete(uri.fsPath);
            this._status.indexedFiles = this._entries.size;
            this._status.lastIndexedAt = Date.now();
            this._onDidChange.fire();
        });
        this._ready = this.rebuild();
    }

    async ready(): Promise<void> { await this._ready; }

    rebuild(): Promise<void> {
        this._ready = this._buildFull(++this._generation);
        return this._ready;
    }

    private async _buildFull(generation: number): Promise<void> {
        this._status = {
            indexing: true,
            scannedFiles: 0,
            indexedFiles: this._entries.size,
            skippedFiles: 0,
            totalFiles: 0,
            message: 'Buscando archivos .bio',
        };
        this._onDidChange.fire();

        try {
            const files = await vscode.workspace.findFiles('**/*.bio', BIO_INDEX_EXCLUDE, MAX_INDEXED_BIO_FILES);
            if (generation !== this._generation) return;

            const livePaths = new Set(files.map(file => file.fsPath));
            for (const knownPath of Array.from(this._entries.keys())) {
                if (!livePaths.has(knownPath)) this._entries.delete(knownPath);
            }

            this._status.totalFiles = files.length;
            this._status.message = files.length === MAX_INDEXED_BIO_FILES
                ? `Indexando primeros ${MAX_INDEXED_BIO_FILES} archivos .bio`
                : `Indexando ${files.length} archivos .bio`;
            this._onDidChange.fire();

            for (let offset = 0; offset < files.length; offset += INDEX_BATCH_SIZE) {
                const batch = files.slice(offset, offset + INDEX_BATCH_SIZE);
                await Promise.all(batch.map(file => this._indexFile(file, true)));
                if (generation !== this._generation) return;

                this._status.scannedFiles = Math.min(files.length, offset + batch.length);
                this._status.indexedFiles = this._entries.size;
                this._status.message = `Indexados ${this._status.scannedFiles}/${files.length} archivos .bio`;
                this._onDidChange.fire();
                await new Promise<void>(resolve => setTimeout(resolve, 0));
            }

            this._status.indexing = false;
            this._status.lastIndexedAt = Date.now();
            this._status.message = `Indice listo: ${this._entries.size} archivos activos`;
        } catch (error) {
            this._status.indexing = false;
            this._status.message = `No se pudo completar el indice: ${error instanceof Error ? error.message : 'error desconocido'}`;
        }
        this._onDidChange.fire();
    }

    private static _dec = new TextDecoder('utf-8');

    private async _indexFile(uri: vscode.Uri, silent = false): Promise<void> {
        try {
            const stat = await vscode.workspace.fs.stat(uri);
            if (stat.size > MAX_INDEXED_FILE_BYTES) {
                this._entries.delete(uri.fsPath);
                this._status.skippedFiles++;
                if (!silent) this._onDidChange.fire();
                return;
            }

            const raw = BioFileIndex._dec.decode(await vscode.workspace.fs.readFile(uri));
            const lines = raw.split('\n');
            const components: ParsedComponent[] = [];
            const stats = { circuits: 0, genes: 0, promoters: 0, rbs: 0, terminators: 0, proteins: 0, pathways: 0, tus: 0, killSwitches: 0, sequences: 0 };
            const fileName = path.basename(uri.fsPath);
            for (let i = 0; i < lines.length; i++) {
                for (const [re, type, statKey] of INDEX_PATTERNS) {
                    const m = lines[i].match(re);
                    if (m) {
                        components.push({ name: m[1] || type, type, file: fileName, filePath: uri.fsPath, line: i + 1 });
                        (stats as any)[statKey]++;
                    }
                }
            }
            const baseCount = (raw.match(/[ATCG]{20,}/gi) || []).reduce((a, s) => a + s.length, 0);
            const assessment = this._assessFile(uri, raw, components, stats, baseCount);
            this._entries.set(uri.fsPath, {
                uri,
                components,
                stats,
                lineCount: lines.length,
                baseCount,
                host: assessment.host,
                hasRules: assessment.hasRules,
                issues: assessment.issues,
                strengths: assessment.strengths,
                signals: assessment.signals,
            });
        } catch {
            this._entries.delete(uri.fsPath);
        }
        if (!silent) {
            this._status.indexedFiles = this._entries.size;
            this._status.lastIndexedAt = Date.now();
            this._status.message = `Actualizado: ${path.basename(uri.fsPath)}`;
            this._onDidChange.fire();
        }
    }

    private _assessFile(
        uri: vscode.Uri,
        raw: string,
        components: ParsedComponent[],
        stats: FileIndexEntry['stats'],
        baseCount: number,
    ): { host?: string; hasRules: boolean; issues: ExplorerIssue[]; strengths: string[]; signals: WorkspaceSignal[] } {
        const file = path.basename(uri.fsPath);
        const hostMatch = raw.match(/\bhost\s*:\s*["']?([\w.-]+)/i);
        const host = hostMatch?.[1];
        const hasRules = /\brule\b/i.test(raw);
        const issues: ExplorerIssue[] = [];
        const strengths: string[] = [];
        const signals = new Set<WorkspaceSignal>();
        const firstLine = (type: string) => components.find(component => component.type === type)?.line ?? 1;

        const addIssue = (
            severity: ExplorerIssue['severity'],
            title: string,
            detail: string,
            line = 1,
            actionCommand?: string,
            actionLabel?: string,
            fixKind?: ExplorerFixKind,
        ) => issues.push({ severity, title, detail, file, filePath: uri.fsPath, line, actionCommand, actionLabel, fixKind });

        if (stats.circuits + stats.tus + stats.pathways === 0) {
            addIssue('warning', 'Sin arquitectura principal', 'Define un circuito, transcription_unit o pathway para que el Explorer pueda razonar sobre el diseño.', 1, 'synbio.newCircuit', 'Crear circuito');
        }
        if (!host) {
            addIssue('warning', 'Host no declarado', 'El diseño no declara host; esto debilita predicciones de codones, seguridad y protocolos.', 1, 'synbio.openExample', 'Ver ejemplo', 'add-host');
        }
        if (stats.genes > 0 && stats.promoters === 0) {
            addIssue('critical', 'Genes sin promotores detectables', 'Hay genes, pero no se indexo ningun promotor asociado al diseño.', firstLine('gene'), 'synbio.partsLibrary', 'Elegir promotor', 'add-promoter');
        }
        if (stats.genes > 0 && stats.rbs === 0) {
            addIssue('warning', 'Genes sin RBS detectables', 'Falta senal de inicio de traduccion; revisa B0034, BCD o un RBS caracterizado.', firstLine('gene'), 'synbio.partsLibrary', 'Elegir RBS', 'add-rbs');
        }
        if (stats.genes > 0 && stats.terminators === 0) {
            addIssue('warning', 'Genes sin terminadores detectables', 'Anade terminadores para reducir read-through y comportamiento inesperado.', firstLine('gene'), 'synbio.partsLibrary', 'Elegir terminador', 'add-terminator');
        }
        if (baseCount > 5000 && stats.sequences === 0) {
            addIssue('info', 'ADN largo sin bloque sequence', 'Se detectan bases largas, pero ninguna declaracion sequence; encapsularlas mejora exportacion y analisis.', 1, 'synbio.sequenceAnalysis', 'Analizar secuencia');
        }
        if (stats.killSwitches === 0 && /\b(release|environment|probiotic|bioremediation|nissle)\b/i.test(raw)) {
            addIssue('warning', 'Aplicacion sensible sin contencion explicita', 'El texto sugiere uso ambiental o terapeutico; considera un kill switch y clasificacion BSL.', 1, 'synbio.biosafetyClassify', 'Clasificar BSL', 'add-killswitch');
        }

        if (/\bT7\b|BL21\(DE3\)|pT7/i.test(raw)) signals.add('t7');
        if (/\bsecret|secretion|pelB|ompA|dsbA|torA|alpha[-_ ]?mf|aMF\b/i.test(raw)) signals.add('secretion');
        if (stats.pathways > 0 || /\bflux|fba|metabolic|acetate|mevalonate|artemisinin\b/i.test(raw)) signals.add('metabolic');
        if (/\bHEK|CHO|mammalian|CMV|SV40|Kozak\b/i.test(raw)) signals.add('mammalian');
        if (/\btherapeutic|probiotic|nissle|gut|delivery\b/i.test(raw)) signals.add('therapeutic');
        if (/\byeast|gal1|tdh3|tef1|pichia|s288c|by4741\b/i.test(raw)) signals.add('yeast');

        if (host) strengths.push(`Host declarado: ${host}`);
        if (hasRules) strengths.push('Reglas geneticas declaradas');
        if (stats.promoters > 0 && stats.rbs > 0 && stats.terminators > 0) strengths.push('Cassette expresivo con promotor, RBS y terminador');
        if (stats.killSwitches > 0) strengths.push('Contencion biologica declarada');
        if (stats.sequences > 0) strengths.push('Secuencias explicitas disponibles para analisis');

        return { host, hasRules, issues, strengths, signals: Array.from(signals) };
    }

    /** Aggregated stats across all indexed files */
    getAggregateStats() {
        const t = { circuits: 0, genes: 0, promoters: 0, rbs: 0, terminators: 0, proteins: 0, pathways: 0, tus: 0, killSwitches: 0, sequences: 0, files: 0, lines: 0, bases: 0 };
        for (const e of this._entries.values()) {
            for (const k of Object.keys(e.stats) as Array<keyof typeof e.stats>) t[k] += e.stats[k];
            t.files++; t.lines += e.lineCount; t.bases += e.baseCount;
        }
        return t;
    }

    /** All parsed components across workspace */
    getAllComponents(): ParsedComponent[] {
        const result: ParsedComponent[] = [];
        for (const e of this._entries.values()) result.push(...e.components);
        return result;
    }

    /** All indexed file URIs */
    getFiles(): vscode.Uri[] {
        return Array.from(this._entries.values()).map(e => e.uri);
    }

    /** Full indexed entries for richer Explorer summaries */
    getEntries(): FileIndexEntry[] {
        return Array.from(this._entries.values());
    }

    getStatus(): IndexStatus {
        return { ...this._status, indexedFiles: this._entries.size };
    }

    getIssues(max = 20): ExplorerIssue[] {
        const weight: Record<ExplorerIssue['severity'], number> = { critical: 0, warning: 1, info: 2 };
        return this.getEntries()
            .flatMap(entry => entry.issues)
            .sort((a, b) => weight[a.severity] - weight[b.severity])
            .slice(0, max);
    }

    getSignals(): WorkspaceSignal[] {
        return Array.from(new Set(this.getEntries().flatMap(entry => entry.signals)));
    }

    getWorkspaceReadiness(): WorkspaceReadiness {
        const stats = this.getAggregateStats();
        const status = this.getStatus();
        const issues = this.getIssues(12);
        const strengths = Array.from(new Set(this.getEntries().flatMap(entry => entry.strengths))).slice(0, 6);

        if (stats.files === 0) {
            const emptyIssue: ExplorerIssue = {
                severity: 'critical',
                title: 'Workspace sin archivos BioScript',
                detail: 'Crea o abre un diseno .bio para activar el entorno experimental.',
                actionCommand: 'synbio.newCircuit',
                actionLabel: 'Crear diseno',
            };
            return {
                score: status.indexing ? 45 : 25,
                level: status.indexing ? 'Indexando' : 'Sin diseno',
                statusLine: status.indexing ? status.message : 'No hay material biologico indexado todavia',
                issues: [emptyIssue],
                strengths: status.indexing ? ['El indice esta trabajando en segundo plano'] : [],
                nextActions: [
                    { label: 'Crear diseno guiado', description: 'Arranca un circuito BioScript editable', command: 'synbio.newCircuit' },
                    { label: 'Abrir ejemplo validado', description: 'Carga un circuito de referencia para explorar', command: 'synbio.openExample' },
                ],
            };
        }

        let score = 100;
        for (const issue of issues) {
            if (issue.severity === 'critical') score -= 18;
            else if (issue.severity === 'warning') score -= 8;
            else score -= 2;
        }
        if (stats.circuits + stats.tus === 0) score -= 15;
        if (stats.genes > 0 && stats.promoters > 0 && stats.rbs > 0 && stats.terminators > 0) score += 6;
        if (stats.killSwitches > 0) score += 4;
        if (status.indexing) score -= 5;
        score = Math.max(5, Math.min(100, score));

        const level = score >= 85 ? 'Listo' : score >= 65 ? 'Revisar' : score >= 40 ? 'Incompleto' : 'Bloqueado';
        const statusLine = status.indexing
            ? `${status.message}; la vista ya usa resultados parciales`
            : `${stats.files} archivos, ${issues.length} puntos a revisar, ${strengths.length} fortalezas detectadas`;

        return {
            score,
            level,
            statusLine,
            issues,
            strengths,
            nextActions: this._buildNextActions(stats, issues),
        };
    }

    private _buildNextActions(stats: ReturnType<BioFileIndex['getAggregateStats']>, issues: ExplorerIssue[]): ExplorerAction[] {
        const actions: ExplorerAction[] = [];
        const push = (label: string, description: string, command: string, args?: any[]) => {
            if (!actions.some(action => action.command === command && action.label === label)) {
                actions.push({ label, description, command, args });
            }
        };

        const firstActionableIssue = issues.find(issue => issue.actionCommand);
        if (firstActionableIssue?.actionCommand) {
            push(firstActionableIssue.actionLabel ?? firstActionableIssue.title, firstActionableIssue.detail, firstActionableIssue.actionCommand);
        }
        if (stats.files > 0) push('Buscar activo biologico', 'Salta a circuitos, genes, partes o secuencias indexadas', 'synbio.searchComponents');
        if (stats.genes > 0 && stats.promoters > 0 && stats.rbs > 0 && stats.terminators > 0) {
            push('Compilar circuito', 'Genera salidas SBOL/FASTA/GenBank desde el diseno actual', 'synbio.compile');
            push('Generar protocolo', 'Convierte el diseno activo en SOP wet-lab', 'synbio.generateProtocol');
        }
        if (stats.killSwitches === 0 && stats.genes > 0) push('Revisar bioseguridad', 'Clasifica BSL y revisa contencion antes de avanzar', 'synbio.biosafetyClassify');
        if (stats.sequences > 0 || stats.bases > 0) push('Analizar secuencia', 'Revisa GC, ORFs, repeats y riesgos basicos', 'synbio.sequenceAnalysis');
        push('Abrir Command Center', 'Orquesta comandos, tareas y diagnostico desde una sola entrada', 'synbio.commandCenter');
        return actions.slice(0, 5);
    }

    dispose(): void {
        this._watcher.dispose();
        this._onDidChange.dispose();
        BioFileIndex._instance = undefined;
    }
}

// ──────────────────────────────────────────────────────────────────────────────
// 1. EXPERIMENT WORKSPACE — same shared index, framed for researchers
// ──────────────────────────────────────────────────────────────────────────────
export class ProjectComponentsProvider implements vscode.TreeDataProvider<SynBioTreeItem> {
    private _onDidChangeTreeData = new vscode.EventEmitter<SynBioTreeItem | undefined | null>();
    readonly onDidChangeTreeData = this._onDidChangeTreeData.event;
    private readonly _index = BioFileIndex.instance();

    constructor() {
        this._index.onDidChange(() => this.refresh());
    }

    refresh(): void { this._onDidChangeTreeData.fire(undefined); }
    dispose(): void { /* index singleton disposed via context.subscriptions */ }
    getTreeItem(el: SynBioTreeItem): vscode.TreeItem { return el; }

    async getChildren(el?: SynBioTreeItem): Promise<SynBioTreeItem[]> {
        if (!el) return this.getRoots();
        return this.getChildrenOf(el);
    }

    private getRoots(): SynBioTreeItem[] {
        const s = this._index.getAggregateStats();
        const readiness = this._index.getWorkspaceReadiness();
        const status = this._index.getStatus();
        return [
            new SynBioTreeItem(`Readiness ${readiness.score}/100 — ${readiness.level}`, vscode.TreeItemCollapsibleState.Expanded, 'readiness', {
                categoryId: 'readiness',
                description: status.indexing ? `${status.scannedFiles}/${status.totalFiles || '?'} indexados` : readiness.statusLine,
                tooltip: `### Readiness del workspace\n${readiness.statusLine}\n\nLa indexacion es incremental para mantener la UI fluida.`,
            }),
            this.cat(`Diseños experimentales (${s.circuits + s.tus})`, 'designs', `${s.files} archivos biológicos activos`),
            this.cat(`Regulación & control (${s.promoters + s.rbs + s.terminators + s.killSwitches})`, 'regulation', 'Promotores, RBS, terminadores y contención'),
            this.cat(`Funciones biológicas (${s.genes + s.proteins + s.pathways})`, 'functions', 'Genes, proteínas y rutas metabólicas'),
            this.cat(`Secuencias observables (${s.sequences})`, 'sequences', 'Fragmentos de ADN detectados en el workspace'),
            this.cat('Hosts recomendados', 'hosts', 'Chassis sugeridos segun el contenido del workspace'),
            this.cat('Design packs listos', 'packs', 'Plantillas accionables para subir el nivel del diseño'),
            this.cat(`Archivos de trabajo (${s.files})`, 'files', 'Abrir y revisar diseños .bio'),
            this.cat('Acciones para investigadores', 'actions', 'Entradas guiadas sin depender del editor de código'),
        ];
    }

    private cat(label: string, id: string, desc?: string, state = vscode.TreeItemCollapsibleState.Collapsed): SynBioTreeItem {
        return new SynBioTreeItem(label, state, 'category', { categoryId: id, description: desc });
    }

    private getChildrenOf(el: SynBioTreeItem): SynBioTreeItem[] {
        const catId = (el.meta as any)?.categoryId;
        const fileEntryPath = (el.meta as any)?.fileEntryPath as string | undefined;
        if (catId === 'readiness') {
            return this.getReadinessItems();
        }
        if (catId === 'hosts') {
            return this.getHostRecommendationItems();
        }
        if (catId === 'packs') {
            return this.getDesignPackItems();
        }
        if (fileEntryPath) {
            return this.getFileWorkbenchItems(fileEntryPath);
        }
        if (catId === 'files') {
            return this._index.getEntries().map(entry => {
                const name = path.basename(entry.uri.fsPath);
                const issueSummary = entry.issues.length > 0 ? `${entry.issues.length} alertas` : 'sin alertas';
                const componentSummary = `${entry.components.length} activos`;
                const hasWorkbench = entry.issues.length > 0 || this.getFixesForEntry(entry).length > 0;
                return new SynBioTreeItem(name, hasWorkbench ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.None, hasWorkbench ? 'file-group' : entry.issues.some(issue => issue.severity === 'critical') ? 'issue-critical' : 'file', {
                    command: hasWorkbench ? undefined : 'vscode.open', args: hasWorkbench ? undefined : [entry.uri],
                    description: `${componentSummary} | ${issueSummary}`,
                    tooltip: this.fileTooltip(entry),
                    fileEntryPath: entry.uri.fsPath,
                });
            });
        }
        if (catId === 'actions') {
            const readinessActions = this._index.getWorkspaceReadiness().nextActions.map(action => this.actionItem(action));
            return [
                ...readinessActions,
                new SynBioTreeItem('Nuevo diseño guiado', vscode.TreeItemCollapsibleState.None, 'tool', {
                    command: 'synbio.newCircuit',
                    description: 'Crear un circuito base con plantilla',
                    tooltip: '### Nuevo diseño guiado\nInicia un diseño experimental desde una plantilla lista para editar.'
                }),
                new SynBioTreeItem('Abrir ejemplo validado', vscode.TreeItemCollapsibleState.None, 'tool', {
                    command: 'synbio.openExample',
                    description: 'Cargar un ejemplo funcional del proyecto',
                    tooltip: '### Abrir ejemplo validado\nCarga un diseño de referencia para inspección biológica.'
                }),
                new SynBioTreeItem('Biblioteca de partes', vscode.TreeItemCollapsibleState.None, 'tool', {
                    command: 'workbench.view.extension.synbio-explorer',
                    description: 'Ir a las partes biológicas caracterizadas',
                    tooltip: '### Biblioteca de partes\nUsa la vista de partes para escoger promotores, reporteros y sensores sin escribir código.'
                }),
                new SynBioTreeItem('Generar protocolo', vscode.TreeItemCollapsibleState.None, 'tool', {
                    command: 'synbio.generateProtocol',
                    description: 'Traducir el diseño a pasos de laboratorio',
                    tooltip: '### Generar protocolo\nConvierte el diseño actual en una receta experimental utilizable en laboratorio.'
                }),
                new SynBioTreeItem('Revisar bioseguridad', vscode.TreeItemCollapsibleState.None, 'tool', {
                    command: 'synbio.biosafetyClassify',
                    description: 'Clasificación BSL y riesgos',
                    tooltip: '### Revisar bioseguridad\nEvalúa requisitos de contención y riesgos antes de ejecutar el experimento.'
                }),
            ];
        }

        return this.getResearchItems(catId);
    }

    private getReadinessItems(): SynBioTreeItem[] {
        const readiness = this._index.getWorkspaceReadiness();
        const status = this._index.getStatus();
        const items: SynBioTreeItem[] = [
            new SynBioTreeItem(status.indexing ? 'Indice trabajando en segundo plano' : 'Indice listo', vscode.TreeItemCollapsibleState.None, 'status', {
                description: status.indexing ? `${status.scannedFiles}/${status.totalFiles || '?'} archivos` : `${status.indexedFiles} archivos activos`,
                tooltip: `### Estado del indice\n${status.message}\n\nArchivos omitidos por tamano o exclusion: ${status.skippedFiles}`,
            }),
        ];

        if (readiness.strengths.length > 0) {
            for (const strength of readiness.strengths.slice(0, 3)) {
                items.push(new SynBioTreeItem(strength, vscode.TreeItemCollapsibleState.None, 'strength'));
            }
        }

        for (const issue of readiness.issues.slice(0, 5)) {
            items.push(this.issueItem(issue));
        }

        for (const action of readiness.nextActions.slice(0, 4)) {
            items.push(this.actionItem(action));
        }

        return items;
    }

    private issueItem(issue: ExplorerIssue): SynBioTreeItem {
        const itemType = issue.severity === 'critical' ? 'issue-critical' : issue.severity === 'warning' ? 'issue-warning' : 'issue-info';
        const command = issue.filePath ? 'synbio.revealDefinition' : issue.actionCommand;
        const args = issue.filePath ? [issue.filePath, issue.line ?? 1] : [];
        return new SynBioTreeItem(issue.title, vscode.TreeItemCollapsibleState.None, itemType, {
            command,
            args,
            description: issue.file ? `${issue.file}:${issue.line ?? 1}` : issue.actionLabel,
            tooltip: `### ${issue.title}\n${issue.detail}${issue.actionLabel ? `\n\nAccion sugerida: ${issue.actionLabel}` : ''}`,
        });
    }

    private actionItem(action: ExplorerAction): SynBioTreeItem {
        return new SynBioTreeItem(action.label, vscode.TreeItemCollapsibleState.None, 'action', {
            command: action.command,
            args: action.args,
            description: action.description,
            tooltip: `### ${action.label}\n${action.description}`,
        });
    }

    private fileTooltip(entry: FileIndexEntry): string {
        const lines = [
            `### ${path.basename(entry.uri.fsPath)}`,
            `- Activos indexados: ${entry.components.length}`,
            `- Lineas: ${entry.lineCount.toLocaleString()}`,
            `- Bases detectadas: ${entry.baseCount.toLocaleString()}`,
        ];
        if (entry.host) lines.push(`- Host: ${entry.host}`);
        if (entry.issues.length > 0) lines.push(`- Alertas: ${entry.issues.map(issue => issue.title).join('; ')}`);
        return lines.join('\n');
    }

    private getFileWorkbenchItems(filePath: string): SynBioTreeItem[] {
        const entry = this._index.getEntries().find(candidate => candidate.uri.fsPath === filePath);
        if (!entry) return [];

        const items: SynBioTreeItem[] = [
            new SynBioTreeItem('Abrir archivo', vscode.TreeItemCollapsibleState.None, 'file', {
                command: 'vscode.open',
                args: [entry.uri],
                description: path.dirname(vscode.workspace.asRelativePath(entry.uri)),
            }),
        ];

        for (const fix of this.getFixesForEntry(entry)) {
            items.push(new SynBioTreeItem(fix.label, vscode.TreeItemCollapsibleState.None, 'fix', {
                command: 'synbio.applyExplorerFix',
                args: [fix],
                description: `L${fix.line} · ${fix.description}`,
                tooltip: `### ${fix.label}\n${fix.description}\n\nArchivo: ${path.basename(fix.filePath)}:${fix.line}`,
            }));
        }

        for (const issue of entry.issues) {
            items.push(this.issueItem(issue));
        }

        return items;
    }

    private getFixesForEntry(entry: FileIndexEntry): ExplorerFix[] {
        return entry.issues
            .filter((issue): issue is ExplorerIssue & { filePath: string; fixKind: ExplorerFixKind } => Boolean(issue.filePath && issue.fixKind))
            .map(issue => ({
                label: explorerFixLabel(issue.fixKind, issue.line ?? 1),
                description: issue.detail,
                filePath: issue.filePath,
                line: issue.line ?? 1,
                kind: issue.fixKind,
            }));
    }

    private getHostRecommendationItems(): SynBioTreeItem[] {
        const recommendations = getRecommendedHosts(this._index);
        if (recommendations.length === 0) {
            return [this.actionItem({ label: 'Elegir host manualmente', description: 'Todavia no hay senales suficientes; abre Organismos & Chassis o fija synbio.hostOrganism', command: 'workbench.action.openSettings', args: ['synbio.hostOrganism'] })];
        }

        return recommendations.map(recommendation => new SynBioTreeItem(recommendation.label, vscode.TreeItemCollapsibleState.None, 'organism', {
            command: 'synbio.applyRecommendedHost',
            args: [recommendation],
            description: recommendation.description,
            tooltip: `### ${recommendation.label}\n${recommendation.description}\n\n${recommendation.rationale}`,
        }));
    }

    private getDesignPackItems(): SynBioTreeItem[] {
        const packs = getRelevantDesignPacks(this._index);
        return packs.map(pack => new SynBioTreeItem(pack.label, vscode.TreeItemCollapsibleState.None, 'tool', {
            command: 'synbio.insertDesignPack',
            args: [pack],
            description: pack.description,
            tooltip: `### ${pack.label}\n${pack.description}\n\n**Foco:** ${pack.focus}\n${pack.rationale}`,
        }));
    }

    private getResearchItems(catId: string): SynBioTreeItem[] {
        const groupMap: Record<string, string[]> = {
            designs: ['circuit', 'transcription_unit'],
            regulation: ['promoter', 'rbs', 'terminator', 'kill_switch'],
            functions: ['gene', 'protein', 'pathway'],
            sequences: ['sequence'],
        };

        const items = this._index.getAllComponents()
            .filter(component => groupMap[catId]?.includes(component.type))
            .map(component => this.toResearchItem(component, catId));
        return items.length > 0 ? items : [this.emptyResearchState(catId)];
    }

    private emptyResearchState(catId: string): SynBioTreeItem {
        const map: Record<string, ExplorerAction> = {
            designs: { label: 'Crear arquitectura experimental', description: 'No se detectan circuitos ni transcription units', command: 'synbio.newCircuit' },
            regulation: { label: 'Elegir parte regulatoria', description: 'Agrega promotores, RBS, terminadores o contencion', command: 'synbio.partsLibrary' },
            functions: { label: 'Abrir ejemplo con genes', description: 'Carga un circuito funcional para partir de una base verificable', command: 'synbio.openExample' },
            sequences: { label: 'Analizar secuencia activa', description: 'Usa el analizador cuando tengas secuencias o seleccion de ADN', command: 'synbio.sequenceAnalysis' },
        };
        return this.actionItem(map[catId] ?? { label: 'Abrir Command Center', description: 'Explora acciones disponibles', command: 'synbio.commandCenter' });
    }

    private toResearchItem(component: ParsedComponent, catId: string): SynBioTreeItem {
        const label = catId === 'sequences'
            ? `Secuencia ${component.name.slice(0, 18)}${component.name.length > 18 ? '…' : ''}`
            : component.name;

        const categorySummary: Record<string, string> = {
            designs: 'Diseño experimental',
            regulation: 'Elemento regulatorio',
            functions: 'Función biológica',
            sequences: 'Secuencia detectada',
        };

        const description = catId === 'sequences'
            ? `${component.name.length} nt — ${component.file}:${component.line}`
            : `${categorySummary[catId]} — ${component.file}:${component.line}`;

        const typeLabel = this.humanizeComponentType(component.type);
        return new SynBioTreeItem(label, vscode.TreeItemCollapsibleState.None, 'component', {
            description,
            command: 'synbio.revealDefinition', args: [component.filePath, component.line],
            tooltip: `### ${label}\n- **Categoría:** ${typeLabel}\n- **Archivo:** ${component.file}\n- **Línea:** ${component.line}\n- **Acción:** abrir contexto biológico completo`,
            filePath: component.filePath,
            line: component.line,
        });
    }

    private humanizeComponentType(type: string): string {
        const labels: Record<string, string> = {
            circuit: 'Circuito',
            transcription_unit: 'Transcription Unit',
            promoter: 'Promotor',
            rbs: 'RBS',
            terminator: 'Terminador',
            kill_switch: 'Kill switch',
            gene: 'Gen',
            protein: 'Proteína',
            pathway: 'Ruta metabólica',
            sequence: 'Secuencia',
        };
        return labels[type] || type;
    }
}

// ──────────────────────────────────────────────────────────────────────────────
// 2. TOOLBOX — 55+ herramientas en 8 categorías
// ──────────────────────────────────────────────────────────────────────────────
export class ToolboxProvider implements vscode.TreeDataProvider<SynBioTreeItem> {
    private _onDidChangeTreeData = new vscode.EventEmitter<SynBioTreeItem | undefined>();
    readonly onDidChangeTreeData = this._onDidChangeTreeData.event;
    refresh(): void { this._onDidChangeTreeData.fire(undefined); }
    getTreeItem(el: SynBioTreeItem): vscode.TreeItem { return el; }

    async getChildren(el?: SynBioTreeItem): Promise<SynBioTreeItem[]> {
        if (!el) return [
            this.cat('Flujo recomendado', 'priority', vscode.TreeItemCollapsibleState.Expanded),
            this.cat('Diseño & Construcción', 'design'),
            this.cat('Análisis de Secuencia', 'sequence'),
            this.cat('Análisis de Proteína', 'protein'),
            this.cat('Simulación & Modelado', 'simulation'),
            this.cat('Exportación & Formato', 'export'),
            this.cat('Seguridad & Compliance', 'security'),
            this.cat('Laboratorio & Protocolos', 'lab'),
            this.cat('IA & Automatización', 'ai'),
        ];
        return this.tools((el.meta as any)?.categoryId);
    }

    private cat(label: string, id: string, state = vscode.TreeItemCollapsibleState.Collapsed): SynBioTreeItem {
        return new SynBioTreeItem(label, state, 'category', { categoryId: id });
    }

    private tools(id: string): SynBioTreeItem[] {
        const t: Record<string, Array<[string, string, string]>> = {
            priority: [
                ['Buscar activos del workspace',    'synbio.searchComponents',        'Salto rapido a circuitos, genes y secuencias'],
                ['BioScript Command Center',        'synbio.commandCenter',           'Entrada unica para comandos y tareas'],
                ['Compilar Circuito',               'synbio.compile',                 'Salida SBOL/FASTA/GenBank'],
                ['Revisar Bioseguridad',            'synbio.biosafetyClassify',       'BSL, contencion y compliance'],
                ['Generar Protocolo',               'synbio.generateProtocol',        'SOP wet-lab desde el diseno activo'],
                ['Registrar Observación',           'synbio.recordObservation',       'Cierra el ciclo experimental'],
            ],
            design: [
                ['AI Design Assistant',           'synbio.aiAssistant',              'Diseño asistido por IA'],
                ['Tutor AI de SynBio',           'synbio.askTutor',                 'Tutoriales y explicaciones del código'],
                ['Vista Dividida Editor/Preview',  'synbio.splitView',                'Ctrl+Shift+V'],
                ['Workbench de Ensamblaje Gibson', 'synbio.gibsonAssemblyWorkbench', 'Solapamientos, carga molar, junctions, colony PCR'],
                ['Comparador de Métodos de Ensamblaje', 'synbio.plasmidMap',        'Gibson, Golden Gate, BioBrick, Gateway'],
                ['Diseñador CRISPR gRNA',         'synbio.crisprDesigner',           'Off-targets, scores'],
                ['Circuit Optimizer',             'synbio.optimizeCircuit',          'Optimización topológica'],
                ['Pathway Designer FBA',          'synbio.pathwayDesigner',          'Flux Balance Analysis'],
                ['Optimizar Codones (CAI)',       'synbio.optimizeCodons',           'E. coli, yeast, human'],
                ['Copiloto Científico',           'synbio.showCopilotAnalysis',      'Sugerencias con citas'],
                ['Auto-Corrector de Diseño',      'synbio.showAutoCorrectorReport',  '6 categorías de análisis'],
            ],
            sequence: [
                ['Análisis Completo Secuencia',    'synbio.sequenceAnalysis',         'GC%, ORFs, repeats'],
                ['Termodinámica ΔG/Tm/ΔH',        'synbio.thermodynamicCalc',        'SantaLucia NN model 1998'],
                ['Fuerza de RBS (Salis)',          'synbio.rbsStrength',              'Salis et al. 2009'],
                ['Mapa de Restricción',            'synbio.restrictionMap',           'NEB/REBASE 500+ enzimas'],
                ['BioBrick RFC[10] Check',         'synbio.biobrickCheck',            'EcoRI/XbaI/SpeI/PstI'],
            ],
            protein: [
                ['ProtParam ExPASy (MW, pI)',      'synbio.proteinProperties',        'MW, pI, GRAVY, ε280'],
                ['Visor Molecular 3D NGL',         'synbio.showMoleculeViewer',       'PDB/mmCIF viewer'],
                ['Predictor AlphaFold',            'synbio.analyzeProtein',           'Estructura 3D predicha'],
            ],
            simulation: [
                ['Simulación Gillespie SSA',       'synbio.simulate',                 'Ctrl+Shift+S estocástico'],
                ['Flux Balance Analysis (FBA)',     'synbio.runFBA',                   'Simplex LP, E. coli core'],
                ['Debug Step-Through',             'synbio.debugCircuit',             'F5 genetic debugger'],
                ['Test Suite de Circuito',         'synbio.runTests',                 'Assert, expect, mock'],
                ['Validación Wet-Lab',             'synbio.runWetLabValidation',      '5 casos publicados'],
                ['Aprendizaje Bayesiano',          'synbio.showLearningDashboard',    '12 priors de literatura'],
            ],
            export: [
                ['Exportar SBOL/FASTA/GenBank',    'synbio.export',                   '3 formatos estándar'],
                ['Exportar SBOL3 (JSON-LD)',       'synbio.exportSBOL3',              'Linked Data semántico'],
                ['Documentación Automática',       'synbio.autoDocumentation',        'Markdown, PDF, HTML'],
                ['Version Control Genético',       'synbio.versionControl',           'Diff, branch, merge'],
                ['Dashboard del Proyecto',         'synbio.dashboard',                'Métricas completas'],
            ],
            security: [
                ['Escaneo Bioseguridad',           'synbio.biosecurity',              'NIH/EU/WHO/BMBL6'],
                ['Clasificación BSL (1→4)',        'synbio.biosafetyClassify',        'BMBL 6th Edition'],
                ['Design Rule Checker (DRC)',      'synbio.toggleDRC',                'Reglas en tiempo real'],
                ['Audit Trail (SHA-256)',           'synbio.showAuditTrail',           'Cadena inmutable'],
                ['Verificar Audit Chain',          'synbio.verifyAuditChain',         'Integridad SHA-256'],
                ['Reporte de Compliance',          'synbio.complianceReport',         'NIH, EU GMO Directive'],
                ['Exportar Audit Trail',           'synbio.exportAuditTrail',         'JSONL formato'],
                ['Verificar Data Moat',            'synbio.verifyDataIntegrity',      'SHA-256 entries'],
            ],
            lab: [
                ['Protocolo de Laboratorio',       'synbio.generateProtocol',         'Gibson/GG/BioBrick'],
                ['Biblioteca de Partes iGEM',      'synbio.partsLibrary',             '20,000+ partes'],
                ['Dashboard Lab (ELN/LIMS)',       'synbio.showLabDashboard',         'Conexiones, inventario'],
                ['Inventario de Partes',           'synbio.showLabInventory',         'Freezer, location'],
                ['Sugerir Protocolos',             'synbio.suggestProtocols',         'Auto según diseño'],
                ['Registrar Observación',          'synbio.recordObservation',        'Para aprendizaje Bayes'],
                ['Compilar Circuito',              'synbio.compile',                  'Ctrl+Shift+B'],
            ],
            ai: [
                ['BioScript Command Center',       'synbio.commandCenter',           'Comandos, tareas y terminal conectados'],
                ['Copiloto Científico',            'synbio.showCopilotAnalysis',      'Sugerencias + citas'],
                ['Auto-Corrector Inteligente',     'synbio.showAutoCorrectorReport',  'P0-P3 fixes'],
                ['Data Moat (Base Científica)',     'synbio.showDataMoat',             'Datos propietarios'],
                ['Telemetría (GDPR)',              'synbio.toggleTelemetry',          'Opt-in, anónimo'],
                ['Onboarding / Tour',              'synbio.showOnboarding',           'Tutorial interactivo'],
            ],
        };
        return (t[id] || []).map(([label, cmd, desc]) =>
            new SynBioTreeItem(label, vscode.TreeItemCollapsibleState.None, 'tool', {
                command: cmd, description: desc,
                tooltip: `### ${label}\n**Comando:** \`${cmd}\`\n${desc}`
            })
        );
    }
}

// ──────────────────────────────────────────────────────────────────────────────
// 3. PARTS LIBRARY — 150+ partes biológicas reales en 18 categorías
// ──────────────────────────────────────────────────────────────────────────────
interface PartEntry { name: string; id: string; desc: string; strength?: string; citation?: string; }

export class PartsLibraryProvider implements vscode.TreeDataProvider<SynBioTreeItem> {
    private _onDidChangeTreeData = new vscode.EventEmitter<SynBioTreeItem | undefined>();
    readonly onDidChangeTreeData = this._onDidChangeTreeData.event;
    private readonly _index = BioFileIndex.instance();
    constructor() {
        this._index.onDidChange(() => this.refresh());
    }
    refresh(): void { this._onDidChangeTreeData.fire(undefined); }
    getTreeItem(el: SynBioTreeItem): vscode.TreeItem { return el; }

    async getChildren(el?: SynBioTreeItem): Promise<SynBioTreeItem[]> {
        if (!el) return [
            this.cat('Recomendadas ahora', 'smart_now', vscode.TreeItemCollapsibleState.Expanded),
            this.cat('Por host activo', 'smart_host', vscode.TreeItemCollapsibleState.Collapsed),
            this.cat('Por objetivo experimental', 'smart_goal', vscode.TreeItemCollapsibleState.Collapsed),
            this.cat('Para resolver alertas', 'smart_fix', vscode.TreeItemCollapsibleState.Collapsed),
            this.cat('Promotores Constitutivos (Anderson)', 'const_proms'),
            this.cat('Promotores Inducibles', 'ind_proms'),
            this.cat('Promotores de Levadura', 'yeast_proms'),
            this.cat('RBS (Ribosome Binding Sites)', 'rbs'),
            this.cat('Reporteros Fluorescentes', 'reporters_fl'),
            this.cat('Reporteros Enzimáticos', 'reporters_enz'),
            this.cat('Terminadores', 'terminators'),
            this.cat('Represores', 'repressors'),
            this.cat('Activadores', 'activators'),
            this.cat('Sensores / Quorum Sensing', 'sensors'),
            this.cat('Tags de Degradación', 'deg_tags'),
            this.cat('Tags de Purificación', 'purification'),
            this.cat('Péptidos Señal / Secreción', 'signal_peps'),
            this.cat('Orígenes de Replicación', 'origins'),
            this.cat('Resistencias a Antibióticos', 'resistance'),
            this.cat('Kill Switches / Bioseguridad', 'killswitches'),
            this.cat('Recombinasas / Integrases', 'recombinases'),
            this.cat('CRISPR Components', 'crispr'),
        ];
        if ((el.meta as any)?.categoryId === 'smart_now') return this.smartParts('smart_now');
        if ((el.meta as any)?.categoryId === 'smart_host') return this.smartParts('smart_host');
        if ((el.meta as any)?.categoryId === 'smart_goal') return this.smartParts('smart_goal');
        if ((el.meta as any)?.categoryId === 'smart_fix') return this.smartParts('smart_fix');
        return this.parts((el.meta as any)?.categoryId);
    }

    private cat(label: string, id: string, state = vscode.TreeItemCollapsibleState.Collapsed): SynBioTreeItem {
        return new SynBioTreeItem(label, state, 'category', { categoryId: id });
    }

    private smartParts(mode: 'smart_now' | 'smart_host' | 'smart_goal' | 'smart_fix'): SynBioTreeItem[] {
        const host = vscode.workspace.getConfiguration('synbio').get<string>('hostOrganism', 'ecoli_k12');
        const goals = inferExperimentalGoals(this._index);
        const fixKinds = this._index.getIssues(20)
            .map(issue => issue.fixKind)
            .filter((kind): kind is ExplorerFixKind => Boolean(kind));

        let parts: SmartPartEntry[] = [];
        if (mode === 'smart_now') {
            parts = getSmartPartRecommendations(this._index);
        } else if (mode === 'smart_host') {
            parts = SMART_PARTS.filter(part => part.hosts.includes(host)).slice(0, 8);
        } else if (mode === 'smart_goal') {
            parts = SMART_PARTS.filter(part => part.goals.some(goal => goals.includes(goal))).slice(0, 8);
        } else if (mode === 'smart_fix') {
            parts = SMART_PARTS.filter(part => part.fixKinds.some(kind => fixKinds.includes(kind))).slice(0, 8);
        }

        if (parts.length === 0) {
            return [new SynBioTreeItem('Sin sugerencias contextuales todavia', vscode.TreeItemCollapsibleState.None, 'issue-info', {
                description: 'La libreria inteligente se activa al detectar host, objetivos o alertas concretas',
            })];
        }

        return parts.map(part => this.smartPartItem(part, mode));
    }

    private smartPartItem(part: SmartPartEntry, mode: string): SynBioTreeItem {
        const descriptionPrefix = mode === 'smart_host'
            ? 'Host activo'
            : mode === 'smart_goal'
                ? 'Objetivo actual'
                : mode === 'smart_fix'
                    ? 'Fix sugerido'
                    : 'Recomendada';
        const icon = part.type.includes('prom') ? 'part-promoter'
            : part.type === 'rbs' ? 'part-rbs'
                : part.type.includes('terminator') ? 'part-terminator'
                    : part.type.includes('reporter') ? 'part-reporter'
                        : part.type.includes('kill') ? 'safety-warn'
                            : part.type.includes('signal') || part.type.includes('purification') ? 'part-tag'
                                : 'part';
        return new SynBioTreeItem(part.name, vscode.TreeItemCollapsibleState.None, icon, {
            description: `${descriptionPrefix} · ${part.strength || part.id}`,
            tooltip: `### ${part.name} (${part.id})\n${part.desc}\n\n${part.rationale}${part.citation ? `\n\nRef: ${part.citation}` : ''}`,
            command: 'synbio.insertPart',
            args: [{ name: part.name, id: part.id, type: part.type, desc: part.desc, strength: part.strength }],
            partId: part.id,
            partInfo: { name: part.name, id: part.id, type: part.type, desc: part.desc, strength: part.strength },
        });
    }

    private parts(catId: string): SynBioTreeItem[] {
        const db: Record<string, PartEntry[]> = {
            const_proms: [
                { name: 'J23100', id: 'BBa_J23100', desc: 'Más fuerte Anderson', strength: '2547 RPU', citation: 'Kelly et al. J Biol Eng 2009' },
                { name: 'J23101', id: 'BBa_J23101', desc: 'Referencia Anderson (1.0)', strength: '1000 RPU', citation: 'Kelly et al. J Biol Eng 2009' },
                { name: 'J23102', id: 'BBa_J23102', desc: 'Anderson fuerte', strength: '862 RPU' },
                { name: 'J23103', id: 'BBa_J23103', desc: 'Anderson débil', strength: '90 RPU' },
                { name: 'J23104', id: 'BBa_J23104', desc: 'Anderson medio-fuerte', strength: '750 RPU' },
                { name: 'J23105', id: 'BBa_J23105', desc: 'Anderson débil', strength: '128 RPU' },
                { name: 'J23106', id: 'BBa_J23106', desc: 'Anderson medio-alto', strength: '1185 RPU', citation: 'Kelly et al. J Biol Eng 2009' },
                { name: 'J23107', id: 'BBa_J23107', desc: 'Anderson medio', strength: '510 RPU' },
                { name: 'J23108', id: 'BBa_J23108', desc: 'Anderson medio-bajo', strength: '350 RPU' },
                { name: 'J23109', id: 'BBa_J23109', desc: 'Anderson bajo', strength: '134 RPU' },
                { name: 'J23110', id: 'BBa_J23110', desc: 'Anderson medio', strength: '476 RPU' },
                { name: 'J23111', id: 'BBa_J23111', desc: 'Anderson bajo', strength: '162 RPU' },
                { name: 'J23112', id: 'BBa_J23112', desc: 'Anderson muy débil', strength: '48 RPU' },
                { name: 'J23113', id: 'BBa_J23113', desc: 'Anderson débil', strength: '100 RPU' },
                { name: 'J23114', id: 'BBa_J23114', desc: 'Anderson bajo', strength: '256 RPU' },
                { name: 'J23115', id: 'BBa_J23115', desc: 'Anderson débil', strength: '152 RPU' },
                { name: 'J23116', id: 'BBa_J23116', desc: 'Anderson medio-bajo', strength: '290 RPU' },
                { name: 'J23117', id: 'BBa_J23117', desc: 'Anderson muy débil', strength: '30 RPU' },
                { name: 'J23118', id: 'BBa_J23118', desc: 'Anderson débil', strength: '138 RPU' },
                { name: 'J23119', id: 'BBa_J23119', desc: 'Más fuerte constitutivo iGEM', strength: '2750 RPU' },
            ],
            ind_proms: [
                { name: 'pLac (R0010)', id: 'BBa_R0010', desc: 'IPTG-inducible, LacI-reprimido', citation: 'Lutz & Bujard PNAS 1997' },
                { name: 'pLac-strong (R0011)', id: 'BBa_R0011', desc: 'pLac híbrido fuerte' },
                { name: 'pTet (R0040)', id: 'BBa_R0040', desc: 'aTc-inducible, TetR-reprimido', citation: 'Lutz & Bujard PNAS 1997' },
                { name: 'pBAD (I0500)', id: 'BBa_I0500', desc: 'L-arabinosa-inducible, AraC', citation: 'Guzman et al. J Bacteriol 1995' },
                { name: 'pT7', id: 'BBa_I712074', desc: 'T7 RNAP — REQUIERE BL21(DE3)', strength: '~5000 RPU', citation: 'Studier & Moffatt JMB 1986' },
                { name: 'pT7lac', id: 'pT7lac', desc: 'T7 + lac operator, doble control' },
                { name: 'pLux (R0062)', id: 'BBa_R0062', desc: 'AHL(3OC6HSL)-inducible, LuxR', citation: 'Canton et al. Nat Biotech 2008' },
                { name: 'pLas (R0079)', id: 'BBa_R0079', desc: '3OC12HSL-inducible, LasR' },
                { name: 'pSal (R0073)', id: 'BBa_R0073', desc: 'Salicilato-inducible, NahR' },
                { name: 'pRha', id: 'pRhaBAD', desc: 'L-ramnosa-inducible, tight' },
                { name: 'pCuO', id: 'pCuO', desc: 'Cu²⁺-inducible, CueR, biosensor' },
                { name: 'pArsR', id: 'pArsR', desc: 'Arsénico-inducible, biosensor' },
            ],
            yeast_proms: [
                { name: 'pGAL1', id: 'pGAL1', desc: 'Galactosa inducible (S. cerevisiae)', citation: 'Johnston & Davis PNAS 1984' },
                { name: 'pGAL10', id: 'pGAL10', desc: 'Galactosa inducible, bidireccional con GAL1' },
                { name: 'pTDH3 (GPD)', id: 'pTDH3', desc: 'Constitutivo muy fuerte', citation: 'Mumberg et al. Gene 1995' },
                { name: 'pTEF1', id: 'pTEF1', desc: 'Constitutivo fuerte' },
                { name: 'pADH1', id: 'pADH1', desc: 'Constitutivo medio' },
                { name: 'pCYC1', id: 'pCYC1', desc: 'Constitutivo débil' },
                { name: 'pPGK1', id: 'pPGK1', desc: 'Constitutivo fuerte' },
                { name: 'pMET25', id: 'pMET25', desc: 'Reprimible por metionina' },
            ],
            rbs: [
                { name: 'B0030', id: 'BBa_B0030', desc: 'RBS débil', strength: '0.07 au', citation: 'Mutalik et al. 2013' },
                { name: 'B0031', id: 'BBa_B0031', desc: 'RBS débil', strength: '0.07 au' },
                { name: 'B0032', id: 'BBa_B0032', desc: 'RBS medio-bajo', strength: '0.3 au', citation: 'Mutalik et al. 2013' },
                { name: 'B0033', id: 'BBa_B0033', desc: 'RBS muy débil', strength: '0.01 au' },
                { name: 'B0034', id: 'BBa_B0034', desc: 'RBS fuerte estándar', strength: '1.0 au', citation: 'Elowitz & Leibler 2000' },
                { name: 'B0035', id: 'BBa_B0035', desc: 'RBS medio', strength: '0.5 au' },
                { name: 'BCD2', id: 'BCD2', desc: 'Bicistronic — insensible a contexto', citation: 'Mutalik et al. 2013' },
                { name: 'BCD12', id: 'BCD12', desc: 'Bicistronic variante 12', citation: 'Mutalik et al. 2013' },
                { name: 'BCD22', id: 'BCD22', desc: 'Bicistronic variante 22, medio' },
            ],
            reporters_fl: [
                { name: 'GFPmut3b', id: 'BBa_E0040', desc: 'Green FP, 501/511nm', citation: 'Cormack et al. Gene 1996' },
                { name: 'sfGFP', id: 'sfGFP', desc: 'Superfolder GFP, plegamiento rápido', citation: 'Pédelacq et al. Nat Biotech 2006' },
                { name: 'eGFP', id: 'eGFP', desc: 'Enhanced GFP, F64L/S65T' },
                { name: 'mCherry', id: 'BBa_J06504', desc: 'Red FP mono, 587/610nm', citation: 'Shaner et al. Nat Methods 2004' },
                { name: 'mRFP1', id: 'BBa_E1010', desc: 'Red FP mono, 584/607nm' },
                { name: 'YFP (Venus)', id: 'BBa_E0030', desc: 'Yellow FP, 515/528nm', citation: 'Nagai et al. Nat Biotech 2002' },
                { name: 'CFP (eCFP)', id: 'BBa_E0020', desc: 'Cyan FP, 433/475nm' },
                { name: 'BFP', id: 'BBa_K592100', desc: 'Blue FP, 399/456nm' },
                { name: 'mNeonGreen', id: 'mNeonGreen', desc: 'Ultra-bright, 506/517nm', citation: 'Shaner et al. Nat Methods 2013' },
                { name: 'mScarlet', id: 'mScarlet', desc: 'Brightest RFP, 569/593nm', citation: 'Bindels et al. Nat Methods 2017' },
                { name: 'iRFP720', id: 'iRFP720', desc: 'Near-IR, 702/720nm, in vivo', citation: 'Shcherbakova & Bhatt 2012' },
            ],
            reporters_enz: [
                { name: 'LacZ (β-gal)', id: 'BBa_I732005', desc: 'β-galactosidasa, X-gal' },
                { name: 'Firefly Luciferase', id: 'BBa_J52008', desc: 'Bioluminiscencia, ATP-dep' },
                { name: 'NanoLuc', id: 'NanoLuc', desc: '150x más brillante', citation: 'Hall et al. ACS Chem Biol 2012' },
                { name: 'Lux operon', id: 'BBa_K325909', desc: 'luxCDABE, auto-luminiscencia' },
                { name: 'CAT', id: 'BBa_J31005', desc: 'Cloranfenicol acetiltransferasa' },
                { name: 'GUS (uidA)', id: 'GUS', desc: 'β-glucuronidasa, plantas' },
            ],
            terminators: [
                { name: 'B0015', id: 'BBa_B0015', desc: 'Doble (T1+TE), 98.4%', strength: '0.984', citation: 'Chen et al. 2013' },
                { name: 'B0010', id: 'BBa_B0010', desc: 'rrnB T1', strength: '0.97' },
                { name: 'B0012', id: 'BBa_B0012', desc: 'T7 TE', strength: '0.96' },
                { name: 'L3S2P21', id: 'L3S2P21', desc: 'Sintético, 99%', strength: '0.99', citation: 'Chen et al. 2013' },
                { name: 'L3S2P11', id: 'L3S2P11', desc: 'Sintético fuerte', strength: '0.98' },
                { name: 'L3S3P31', id: 'L3S3P31', desc: 'Sintético medio-fuerte', strength: '0.95' },
                { name: 'ECK120029600', id: 'ECK120029600', desc: 'E. coli nativo', strength: '0.94' },
                { name: 'tCYC1', id: 'tCYC1', desc: 'Terminador levadura' },
                { name: 'tADH1', id: 'tADH1', desc: 'Terminador levadura' },
            ],
            repressors: [
                { name: 'LacI', id: 'BBa_C0012', desc: 'IPTG-responsive', citation: 'Gardner et al. 2000' },
                { name: 'TetR', id: 'BBa_C0040', desc: 'aTc-responsive', citation: 'Gardner et al. 2000' },
                { name: 'cI (λ)', id: 'BBa_C0051', desc: 'Lambda cI repressilator', citation: 'Elowitz & Leibler 2000' },
                { name: 'cI ts', id: 'BBa_C0062ts', desc: 'Termosensible <37°C' },
                { name: 'AraC', id: 'BBa_C0080', desc: 'Dual activador/represor' },
                { name: 'CI434', id: 'BBa_C0084', desc: 'Phage 434, ortogonal a λcI' },
                { name: 'PhlF', id: 'PhlF', desc: 'DAPG-inducible', citation: 'Stanton et al. 2014' },
                { name: 'BM3R1', id: 'BM3R1', desc: 'Ortogonal Stanton', citation: 'Stanton et al. 2014' },
                { name: 'SrpR', id: 'SrpR', desc: 'CELLO-compatible', citation: 'Nielsen et al. 2016' },
                { name: 'AmtR', id: 'AmtR', desc: 'CELLO-compatible', citation: 'Nielsen et al. 2016' },
                { name: 'IcaRA', id: 'IcaRA', desc: 'Ortogonal Nielsen/Voigt' },
            ],
            activators: [
                { name: 'LuxR', id: 'BBa_C0062', desc: 'AHL activator', citation: 'Canton et al. 2008' },
                { name: 'LasR', id: 'BBa_C0078', desc: 'Long-chain AHL' },
                { name: 'RhlR', id: 'BBa_C0071', desc: 'C4-HSL responsive' },
                { name: 'OmpR', id: 'BBa_K112706', desc: 'Osmolarity TCS' },
                { name: 'NahR', id: 'NahR', desc: 'Salicylate-responsive' },
                { name: 'XylS', id: 'XylS', desc: 'Benzoate-responsive, Pm' },
                { name: 'CueR', id: 'CueR', desc: 'Cu²⁺ biosensor' },
            ],
            sensors: [
                { name: 'LuxR + pLux', id: 'BBa_F2620', desc: 'AHL receiver device', citation: 'Canton et al. 2008' },
                { name: 'LasR + pLas', id: 'BBa_T9002', desc: '3OC12HSL receiver' },
                { name: 'CpxR', id: 'BBa_K112707', desc: 'Envelope stress sensor' },
                { name: 'ArsR', id: 'ArsR', desc: 'Arsénico biosensor' },
                { name: 'MerR', id: 'MerR', desc: 'Mercurio Hg²⁺', citation: 'Brown et al. 1983' },
                { name: 'CadC', id: 'CadC', desc: 'Cadmio Cd²⁺' },
                { name: 'EnvZ/OmpR', id: 'EnvZ', desc: 'Osmosensor TCS' },
                { name: 'NarX/NarL', id: 'NarX', desc: 'Nitrate/nitrite sensor' },
            ],
            deg_tags: [
                { name: 'ssrA-LAA', id: 'ssrA_LAA', desc: 't½ ≈ 40 min', strength: '0.018 /min', citation: 'Andersen et al. 1998' },
                { name: 'ssrA-ASV', id: 'ssrA_ASV', desc: 't½ ≈ 95 min', strength: '0.0072 /min', citation: 'Andersen et al. 1998' },
                { name: 'ssrA-AAV', id: 'ssrA_AAV', desc: 't½ ≈ 141 min', strength: '0.005 /min', citation: 'Andersen et al. 1998' },
                { name: 'ssrA-LVA', id: 'ssrA_LVA', desc: 'Rápida alternativa' },
                { name: 'pdt#3', id: 'pdt3', desc: 'Cameron & Collins tag', citation: 'Cameron & Collins 2014' },
            ],
            purification: [
                { name: 'His6', id: 'His6', desc: '6×His, Ni-NTA IMAC' },
                { name: 'His10', id: 'His10', desc: '10×His, alta afinidad' },
                { name: 'GST', id: 'GST', desc: 'Glutathione S-transferasa' },
                { name: 'MBP', id: 'MBP', desc: 'Maltose Binding Protein' },
                { name: 'SUMO', id: 'SUMO', desc: 'Cleavable, solubilidad' },
                { name: 'Strep-tag II', id: 'StrepII', desc: 'WSHPQFEK, StrepTactin' },
                { name: 'FLAG', id: 'FLAG', desc: 'DYKDDDDK, antibody' },
                { name: 'TEV site', id: 'TEV', desc: 'ENLYFQ↓S cleavage' },
            ],
            signal_peps: [
                { name: 'pelB', id: 'pelB', desc: 'Sec pathway, periplasm' },
                { name: 'OmpA', id: 'OmpA', desc: 'Outer membrane signal' },
                { name: 'DsbA', id: 'DsbA', desc: 'Co-translational Sec' },
                { name: 'TorA', id: 'TorA', desc: 'TAT pathway, folded export' },
                { name: 'α-MF (yeast)', id: 'aMF', desc: 'Secretion en levadura' },
            ],
            origins: [
                { name: 'pMB1 (pBR322)', id: 'pBR322ori', desc: 'Medium ~20 copies' },
                { name: 'pUC ori', id: 'pUCori', desc: 'High ~500-700 copies' },
                { name: 'p15A', id: 'p15A', desc: 'Medium-low ~10, compatible ColE1' },
                { name: 'pSC101', id: 'pSC101', desc: 'Low ~5, temp-sensitive variant' },
                { name: 'ColE1', id: 'ColE1', desc: 'Medium ~15-20' },
                { name: 'R6K γ ori', id: 'R6K', desc: 'Conditional, requires π (pir+)' },
                { name: 'CEN/ARS', id: 'CEN_ARS', desc: 'Yeast low ~1-2 copies' },
                { name: '2μ', id: '2mu', desc: 'Yeast high ~10-40 copies' },
            ],
            resistance: [
                { name: 'AmpR (bla)', id: 'AmpR', desc: 'Ampicillin 100μg/mL' },
                { name: 'KanR', id: 'KanR', desc: 'Kanamycin 50μg/mL' },
                { name: 'CmR (cat)', id: 'CmR', desc: 'Chloramphenicol 25μg/mL' },
                { name: 'TetA', id: 'TetA', desc: 'Tetracycline 10μg/mL' },
                { name: 'SpecR', id: 'SpecR', desc: 'Spectinomycin 100μg/mL' },
                { name: 'GentR', id: 'GentR', desc: 'Gentamicin 10μg/mL' },
                { name: 'URA3 (yeast)', id: 'URA3', desc: 'Uracil, 5-FOA counter' },
                { name: 'LEU2 (yeast)', id: 'LEU2', desc: 'Leucine auxotrophy' },
            ],
            killswitches: [
                { name: 'CcdB/CcdA', id: 'CcdB', desc: 'DNA gyrase inhibitor', citation: 'Bernard & Couturier 1992' },
                { name: 'MazF/MazE', id: 'MazF', desc: 'mRNA interferase', citation: 'Zhang et al. 2003' },
                { name: 'RelE/RelB', id: 'RelE', desc: 'Ribosome mRNase' },
                { name: 'Holin/Antiholin', id: 'Holin', desc: 'Membrane lysis, phage' },
                { name: 'DNase I', id: 'DNaseI', desc: 'DNA degradation at death' },
                { name: 'GeneGuard', id: 'GeneGuard', desc: 'Triple containment', citation: 'Wright et al. 2015' },
            ],
            recombinases: [
                { name: 'Cre', id: 'Cre', desc: 'loxP sites', citation: 'Sauer & Henderson 1988' },
                { name: 'Flp', id: 'Flp', desc: 'FRT sites, S. cerevisiae' },
                { name: 'PhiC31', id: 'PhiC31', desc: 'attB/attP unidirectional', citation: 'Groth et al. 2000' },
                { name: 'Bxb1', id: 'Bxb1', desc: 'Logic gates, popular', citation: 'Bonnet et al. 2013' },
                { name: 'TP901', id: 'TP901', desc: 'Lactococcal phage' },
                { name: 'Lambda Int', id: 'LambdaInt', desc: 'E. coli integration' },
            ],
            crispr: [
                { name: 'SpCas9', id: 'SpCas9', desc: 'NGG PAM, 20bp guide', citation: 'Jinek et al. 2012' },
                { name: 'SaCas9', id: 'SaCas9', desc: 'NNGRRT PAM, smaller' },
                { name: 'Cas12a (Cpf1)', id: 'Cas12a', desc: 'TTTV PAM, staggered', citation: 'Zetsche et al. 2015' },
                { name: 'dCas9', id: 'dCas9', desc: 'CRISPRi/CRISPRa', citation: 'Qi et al. 2013' },
                { name: 'Base Editor BE3', id: 'BE3', desc: 'C→T, no DSB', citation: 'Komor et al. 2016' },
                { name: 'Prime Editor', id: 'PE', desc: 'Search-and-replace', citation: 'Anzalone et al. 2019' },
                { name: 'Cas13a', id: 'Cas13a', desc: 'RNA-targeting, SHERLOCK', citation: 'Abudayyeh et al. 2016' },
            ],
        };

        return (db[catId] || []).map(p => {
            const lines = [`### ${p.name} (${p.id})`, p.desc];
            if (p.strength) lines.push(`**Strength:** ${p.strength}`);
            if (p.citation) lines.push(`**Ref:** ${p.citation}`);
            lines.push(`\n[iGEM Registry](https://parts.igem.org/Part:${p.id})`);
            lines.push(`\n*Click to insert • Right-click for more actions*`);
            const icon = catId.includes('prom') ? 'part-promoter' : catId === 'rbs' ? 'part-rbs' :
                catId.includes('terminator') ? 'part-terminator' : catId.includes('reporter') ? 'part-reporter' :
                catId.includes('repressor') ? 'part-repressor' : catId.includes('sensor') ? 'part-sensor' :
                catId.includes('tag') || catId.includes('purification') ? 'part-tag' : 'part';
            return new SynBioTreeItem(p.name, vscode.TreeItemCollapsibleState.None, icon, {
                description: p.strength || p.id, tooltip: lines.join('\n'),
                command: 'synbio.insertPart', args: [{ name: p.name, id: p.id, type: catId, desc: p.desc, strength: p.strength }],
                partId: p.id, partInfo: { name: p.name, id: p.id, type: catId, desc: p.desc, strength: p.strength }
            });
        });
    }
}

// ──────────────────────────────────────────────────────────────────────────────
// 4. ORGANISMS & CHASSIS — 30+ chassis con datos reales
// ──────────────────────────────────────────────────────────────────────────────
export class OrganismsProvider implements vscode.TreeDataProvider<SynBioTreeItem> {
    private _onDidChangeTreeData = new vscode.EventEmitter<SynBioTreeItem | undefined>();
    readonly onDidChangeTreeData = this._onDidChangeTreeData.event;
    refresh(): void { this._onDidChangeTreeData.fire(undefined); }
    getTreeItem(el: SynBioTreeItem): vscode.TreeItem { return el; }

    async getChildren(el?: SynBioTreeItem): Promise<SynBioTreeItem[]> {
        if (!el) return [
            this.cat('Escherichia coli (Lab strains)', 'ecoli'),
            this.cat('Bacillus subtilis', 'bsub'),
            this.cat('Saccharomyces cerevisiae', 'yeast'),
            this.cat('Pseudomonas putida', 'pputida'),
            this.cat('Corynebacterium glutamicum', 'cglut'),
            this.cat('Mammalian cells', 'mammalian'),
            this.cat('Cell-Free Systems', 'cellfree'),
        ];
        return this.organisms((el.meta as any)?.categoryId);
    }

    private cat(label: string, id: string): SynBioTreeItem {
        return new SynBioTreeItem(label, vscode.TreeItemCollapsibleState.Collapsed, 'category', { categoryId: id });
    }

    private organisms(id: string): SynBioTreeItem[] {
        const db: Record<string, Array<[string, string, string]>> = {
            ecoli: [
                ['DH5α', 'Clonación estándar. recA1 endA1 lacZΔM15. No T7 RNAP.', 'BSL-1 | GRAS'],
                ['DH10B', 'Alta eficiencia (10⁹ CFU/μg). BAC libraries.', 'BSL-1'],
                ['TOP10', 'Similar DH10B, muy alta eficiencia.', 'BSL-1'],
                ['BL21(DE3)', 'Expresión T7. lon⁻ ompT⁻. Proteasa-deficiente.', 'BSL-1 | T7 RNAP'],
                ['BL21(DE3) pLysS', 'BL21 + T7 lisozima. Tight control.', 'BSL-1'],
                ['Rosetta(DE3)', 'BL21 + tRNAs raros (AGA AGG AUA CUA GGA CCC).', 'BSL-1 | Rare codons'],
                ['C41(DE3)', 'Tolerante a proteínas tóxicas membrana.', 'BSL-1'],
                ['MG1655', 'Wild-type K-12. Genoma de referencia.', 'BSL-1 | Reference'],
                ['W3110', 'K-12, producción industrial.', 'BSL-1 | Industrial'],
                ['Nissle 1917', 'Probiótico. Living therapeutics.', 'BSL-1'],
                ['BW25113', 'Base Keio collection (knockouts).', 'BSL-1'],
            ],
            bsub: [
                ['168', 'Referencia. trpC2. Modelo Gram+.', 'BSL-1 | GRAS'],
                ['PY79', 'Sporulation proficient.', 'BSL-1'],
                ['WB800N', '8 proteasas eliminadas. Secreción.', 'BSL-1'],
            ],
            yeast: [
                ['BY4741', 'Referencia haploide MATa. his3 leu2 met15 ura3.', 'BSL-1 | GRAS'],
                ['BY4742', 'Referencia haploide MATα.', 'BSL-1'],
                ['CEN.PK2-1C', 'Industrial/lab. Glucosa + galactosa.', 'BSL-1'],
                ['W303', 'Clásico. ade2 his3 leu2 trp1 ura3.', 'BSL-1'],
                ['S288C', 'Referencia genómica SGD.', 'BSL-1'],
                ['Pichia pastoris', 'Altísima secreción (g/L). AOX1 promoter.', 'BSL-1'],
            ],
            pputida: [
                ['KT2440', 'GRAS, tolera solventes. Bioremediación.', 'BSL-1 | GRAS'],
                ['EM42', 'Genoma reducido KT2440. Más estable.', 'BSL-1'],
            ],
            cglut: [
                ['ATCC 13032', 'Producción industrial L-Glu, L-Lys.', 'BSL-1 | GRAS'],
                ['MB001', 'Genoma reducido, sin profagos.', 'BSL-1'],
            ],
            mammalian: [
                ['HEK293T', 'SV40 T antigen. Transfección fácil.', 'BSL-2'],
                ['CHO-K1', 'Estándar biopharma producción.', 'BSL-1'],
                ['HeLa', 'Cervical carcinoma. Investigación.', 'BSL-2'],
                ['Jurkat', 'T-cell. Inmunología/señalización.', 'BSL-2'],
            ],
            cellfree: [
                ['PURE System', 'Reconstituted translation. Shimizu 2001.', 'BSL-1'],
                ['E. coli S30 Extract', 'Crude TX-TL. Barato, robusto.', 'BSL-1'],
                ['Wheat Germ Extract', 'Eukaryotic cell-free.', 'BSL-1'],
            ],
        };
        return (db[id] || []).map(([name, desc, tags]) =>
            new SynBioTreeItem(name, vscode.TreeItemCollapsibleState.None, 'organism', {
                description: tags, tooltip: `### ${name}\n${desc}\n\n**Tags:** ${tags}`
            })
        );
    }
}

// ──────────────────────────────────────────────────────────────────────────────
// 5. SAFETY & COMPLIANCE
// ──────────────────────────────────────────────────────────────────────────────
export class SafetyStatusProvider implements vscode.TreeDataProvider<SynBioTreeItem> {
    private _onDidChangeTreeData = new vscode.EventEmitter<SynBioTreeItem | undefined>();
    readonly onDidChangeTreeData = this._onDidChangeTreeData.event;
    private lastScanResults: SafetyScanResult | null = null;
    refresh(): void { this._onDidChangeTreeData.fire(undefined); }
    getTreeItem(el: SynBioTreeItem): vscode.TreeItem { return el; }
    updateScanResults(r: SafetyScanResult): void { this.lastScanResults = r; this.refresh(); }

    async getChildren(el?: SynBioTreeItem): Promise<SynBioTreeItem[]> {
        const bsl = vscode.workspace.getConfiguration('synbio').get<string>('biosafetyLevel', 'BSL-1');
        const auto = vscode.workspace.getConfiguration('synbio').get<boolean>('enableBiosecurityAutoScan', true);
        const meta = el?.meta as Record<string, unknown> | undefined;

        // ── sub-nodos ──────────────────────────────────────────────────────────
        if (meta?.['section'] === 'hallazgos') {
            return this._findingNodes(meta['severity'] as string);
        }
        if (meta?.['section'] === 'remediacion') {
            return this._remediationNodes();
        }
        if (meta?.['section'] === 'compliance') {
            return this._complianceNodes(bsl, auto);
        }
        if (meta?.['section'] === 'acciones') {
            return this._actionNodes();
        }
        if (el) return [];

        // ── raíz ──────────────────────────────────────────────────────────────
        const items: SynBioTreeItem[] = [];
        const r = this.lastScanResults;

        // — Panel de estado ———————————————————————————————————————————————————
        if (!r) {
            items.push(new SynBioTreeItem('⚡ Sin escaneo aún', vscode.TreeItemCollapsibleState.None, 'safety-warn', {
                description: 'Ejecuta un escaneo para ver el estado', tooltip: '### Cockpit de Seguridad\nNo hay resultados de escaneo todavía.',
                command: 'synbio.biosecurity'
            }));
        } else {
            const riskTotal = (r.risks ?? 0) + (r.warnings ?? 0);
            const statusIcon = r.passed ? '✅' : r.risks > 0 ? '🔴' : '🟡';
            const statusLabel = r.passed ? 'APROBADO' : r.risks > 0 ? `RIESGOS: ${r.risks}` : `ALERTAS: ${r.warnings}`;
            const elapsed = r.scanTimestamp ? Math.round((Date.now() - r.scanTimestamp) / 1000) : null;
            const elapsedStr = elapsed !== null ? (elapsed < 60 ? `hace ${elapsed}s` : `hace ${Math.round(elapsed / 60)}m`) : '';
            items.push(new SynBioTreeItem(`${statusIcon} ${statusLabel}`, vscode.TreeItemCollapsibleState.None, r.passed ? 'safety-ok' : 'safety-error', {
                description: elapsedStr,
                tooltip: `### Último escaneo\n**Resultado:** ${statusLabel}\n**Total hallazgos:** ${riskTotal}\n**BSL requerido:** ${r.bslRequired ?? '—'}\n**Archivo:** ${r.lastScannedFile ?? 'workspace'}`
            }));

            // BSL match check
            if (r.bslRequired && r.bslRequired !== bsl) {
                items.push(new SynBioTreeItem(`⛔ BSL requerido: ${r.bslRequired}`, vscode.TreeItemCollapsibleState.None, 'safety-error', {
                    description: `Tu lab: ${bsl} — INCOMPATIBLE`,
                    tooltip: `### Incompatibilidad BSL\nTu configuración de lab es **${bsl}** pero este diseño requiere **${r.bslRequired}**.\n\nActualiza \`synbio.biosafetyLevel\` en Settings.`
                }));
            }
        }

        // — Hallazgos por prioridad ————————————————————————————————————————————
        if (r) {
            const findings = r.findings ?? [];
            const critical = findings.filter(f => f.severity === 'critical');
            const high = findings.filter(f => f.severity === 'high');
            const medium = findings.filter(f => f.severity === 'medium');
            const low = findings.filter(f => f.severity === 'low');

            if (critical.length > 0) {
                items.push(new SynBioTreeItem(`🔴 Críticos (${critical.length})`, vscode.TreeItemCollapsibleState.Expanded, 'safety-error', {
                    section: 'hallazgos', severity: 'critical',
                    tooltip: `${critical.length} hallazgo(s) crítico(s) — requieren acción inmediata`
                }));
            }
            if (high.length > 0) {
                items.push(new SynBioTreeItem(`🟠 Alto riesgo (${high.length})`, vscode.TreeItemCollapsibleState.Expanded, 'safety-warn', {
                    section: 'hallazgos', severity: 'high',
                    tooltip: `${high.length} hallazgo(s) de alto riesgo`
                }));
            }
            if (medium.length > 0) {
                items.push(new SynBioTreeItem(`🟡 Riesgo medio (${medium.length})`, vscode.TreeItemCollapsibleState.Collapsed, 'safety-warn', {
                    section: 'hallazgos', severity: 'medium',
                    tooltip: `${medium.length} hallazgo(s) de riesgo medio`
                }));
            }
            if (low.length > 0) {
                items.push(new SynBioTreeItem(`🔵 Bajo riesgo (${low.length})`, vscode.TreeItemCollapsibleState.Collapsed, 'safety', {
                    section: 'hallazgos', severity: 'low',
                    tooltip: `${low.length} observación(es) de bajo riesgo`
                }));
            }
            if (findings.length === 0 && r.passed) {
                items.push(new SynBioTreeItem('✅ Sin hallazgos de riesgo', vscode.TreeItemCollapsibleState.None, 'safety-ok', {
                    description: 'Diseño limpio'
                }));
            }

            // — Remediación guiada ——————————————————————————————————————————————
            const needsRemediation = !r.passed || (r.findings ?? []).length > 0;
            if (needsRemediation) {
                items.push(new SynBioTreeItem('🛠 Remediación guiada', vscode.TreeItemCollapsibleState.Collapsed, 'category', {
                    section: 'remediacion',
                    tooltip: 'Pasos ordenados para resolver los hallazgos'
                }));
            }
        }

        // — Compliance & config ————————————————————————————————————————————————
        items.push(new SynBioTreeItem('📋 Estado de compliance', vscode.TreeItemCollapsibleState.Collapsed, 'category', {
            section: 'compliance',
            tooltip: 'Configuración BSL, auto-scan y auditoría'
        }));

        // — Acciones ——————————————————————————————————————————————————————————
        items.push(new SynBioTreeItem('⚙ Acciones', vscode.TreeItemCollapsibleState.Collapsed, 'category', {
            section: 'acciones',
            tooltip: 'Escanear, reportar, auditoría'
        }));

        return items;
    }

    private _findingNodes(severity: string): SynBioTreeItem[] {
        const findings = (this.lastScanResults?.findings ?? []).filter(f => f.severity === severity);
        if (findings.length === 0) {
            return [new SynBioTreeItem('Sin hallazgos en esta categoría', vscode.TreeItemCollapsibleState.None, 'safety-ok')];
        }
        return findings.map(f => {
            const locStr = f.file ? ` — ${f.file}${f.line !== undefined ? `:${f.line}` : ''}` : '';
            return new SynBioTreeItem(f.title, vscode.TreeItemCollapsibleState.None, 'safety-error', {
                description: locStr,
                tooltip: `### ${f.title}\n${f.description}\n\n**Recomendación:** ${f.recommendation}`
            });
        });
    }

    private _remediationNodes(): SynBioTreeItem[] {
        const r = this.lastScanResults;
        if (!r || !r.findings) return [];
        const findings = r.findings.slice().sort((a, b) => {
            const order: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };
            return (order[a.severity] ?? 4) - (order[b.severity] ?? 4);
        });
        return findings.map((f, i) =>
            new SynBioTreeItem(`${i + 1}. ${f.recommendation}`, vscode.TreeItemCollapsibleState.None, 'tool', {
                description: f.title,
                tooltip: `### Paso ${i + 1}: ${f.title}\n${f.recommendation}`
            })
        );
    }

    private _complianceNodes(bsl: string, auto: boolean): SynBioTreeItem[] {
        const r = this.lastScanResults;
        const bslMatch = !r?.bslRequired || r.bslRequired === bsl;
        return [
            new SynBioTreeItem(`Lab configurado: ${bsl}`, vscode.TreeItemCollapsibleState.None, 'safety', { description: bslMatch ? '✅ OK' : '⛔ Incompatible' }),
            new SynBioTreeItem(`Auto-scan: ${auto ? '✅ Activo' : '⛔ Desactivado'}`, vscode.TreeItemCollapsibleState.None, auto ? 'safety-ok' : 'safety-warn'),
            new SynBioTreeItem('🔗 Verificar cadena de auditoría', vscode.TreeItemCollapsibleState.None, 'tool', { command: 'synbio.verifyAuditChain' }),
            new SynBioTreeItem('📊 Ver Audit Trail', vscode.TreeItemCollapsibleState.None, 'tool', { command: 'synbio.showAuditTrail' }),
        ];
    }

    private _actionNodes(): SynBioTreeItem[] {
        return [
            new SynBioTreeItem('🔍 Ejecutar escaneo', vscode.TreeItemCollapsibleState.None, 'tool', { command: 'synbio.biosecurity', description: '⌘ acción principal' }),
            new SynBioTreeItem('📋 Reporte de compliance', vscode.TreeItemCollapsibleState.None, 'tool', { command: 'synbio.complianceReport' }),
            new SynBioTreeItem('📤 Exportar Audit Trail', vscode.TreeItemCollapsibleState.None, 'tool', { command: 'synbio.exportAuditTrail' }),
            new SynBioTreeItem('🔐 Verificar integridad de datos', vscode.TreeItemCollapsibleState.None, 'tool', { command: 'synbio.verifyDataIntegrity' }),
        ];
    }
}

export interface SafetyFinding {
    id: string;
    title: string;
    severity: 'critical' | 'high' | 'medium' | 'low';
    description: string;
    recommendation: string;
    line?: number;
    file?: string;
}
export interface SafetyScanResult {
    passed: boolean;
    warnings: number;
    risks: number;
    bslRequired?: string;
    findings?: SafetyFinding[];
    lastScannedFile?: string;
    scanTimestamp?: number;
}

// ──────────────────────────────────────────────────────────────────────────────
// 6. LITERATURE — 50+ papers fundamentales de SynBio
// ──────────────────────────────────────────────────────────────────────────────
export class LiteratureProvider implements vscode.TreeDataProvider<SynBioTreeItem> {
    private _onDidChangeTreeData = new vscode.EventEmitter<SynBioTreeItem | undefined>();
    readonly onDidChangeTreeData = this._onDidChangeTreeData.event;
    refresh(): void { this._onDidChangeTreeData.fire(undefined); }
    getTreeItem(el: SynBioTreeItem): vscode.TreeItem { return el; }

    async getChildren(el?: SynBioTreeItem): Promise<SynBioTreeItem[]> {
        if (!el) return [
            this.cat('Foundational Papers', 'foundational'),
            this.cat('Parts Characterization', 'parts'),
            this.cat('Design Automation (CAD)', 'cad'),
            this.cat('Genetic Circuits', 'circuits'),
            this.cat('Metabolic Engineering', 'metabolic'),
            this.cat('CRISPR & Genome Editing', 'crispr'),
            this.cat('Biosafety & Biosecurity', 'safety'),
            this.cat('Standards & Measurement', 'standards'),
        ];
        return this.papers((el.meta as any)?.categoryId);
    }

    private cat(label: string, id: string): SynBioTreeItem {
        return new SynBioTreeItem(label, vscode.TreeItemCollapsibleState.Collapsed, 'journal', { categoryId: id });
    }

    private papers(id: string): SynBioTreeItem[] {
        const db: Record<string, Array<[string, string, string, string]>> = {
            foundational: [
                ['Gardner et al. 2000', 'Genetic toggle switch in E. coli', 'Nature 403:339', 'https://doi.org/10.1038/35002131'],
                ['Elowitz & Leibler 2000', 'Repressilator: synthetic oscillator', 'Nature 403:335', 'https://doi.org/10.1038/35002125'],
                ['Endy 2005', 'Foundations for engineering biology', 'Nature 438:449', 'https://doi.org/10.1038/nature04342'],
                ['Andrianantoandro et al. 2006', 'Synthetic biology: new rules', 'Mol Syst Biol 2:2006.0028', ''],
                ['Khalil & Collins 2010', 'Applications come of age', 'Nat Rev Genet 11:367', ''],
                ['Cameron et al. 2014', 'Brief history of synthetic biology', 'Nat Rev Microbiol 12:381', ''],
            ],
            parts: [
                ['Kelly et al. 2009', 'BioBrick promoter measurement (RPU)', 'J Biol Eng 3:4', ''],
                ['Mutalik et al. 2013', 'Precise gene expression via TU arch', 'Nat Methods 10:354', ''],
                ['Chen et al. 2013', '582 terminators characterized', 'Nat Methods 10:659', ''],
                ['Salis et al. 2009', 'RBS Calculator', 'Nat Biotechnol 27:946', ''],
                ['Andersen et al. 1998', 'ssrA degradation tags GFP', 'AEM 64:2240', ''],
                ['Canton et al. 2008', 'Standard biological parts', 'Nat Biotechnol 26:787', ''],
                ['Ceroni et al. 2015', 'Metabolic burden quantified', 'Nat Methods 12:415', ''],
                ['Shaner et al. 2004', 'Improved monomeric FPs', 'Nat Methods 1:275', ''],
            ],
            cad: [
                ['Nielsen et al. 2016', 'Cello: genetic circuit automation', 'Science 352:aac7341', ''],
                ['Beal et al. 2020', 'Robust plate reader estimation', 'ACS Synth Biol 9:1481', ''],
                ['Hossain et al. 2020', 'Nonrepetitive parts automated design', 'Nat Biotechnol 38:1466', ''],
                ['Appleton et al. 2017', 'Design automation review', 'CSHP Biol 9:a023978', ''],
            ],
            circuits: [
                ['Stanton et al. 2014', 'Prokaryotic repressors mining', 'Nat Chem Biol 10:99', ''],
                ['Bonnet et al. 2013', 'Amplifying genetic logic gates', 'Science 340:599', ''],
                ['Friedland et al. 2009', 'Synthetic gene networks that count', 'Science 324:1199', ''],
                ['Stricker et al. 2008', 'Fast robust tunable oscillator', 'Nature 456:516', ''],
                ['Moon et al. 2012', 'Layered logic gates in cells', 'Nature 491:249', ''],
            ],
            metabolic: [
                ['Martin et al. 2003', 'Mevalonate pathway in E. coli', 'Nat Biotechnol 21:796', ''],
                ['Ro et al. 2006', 'Artemisinic acid in yeast', 'Nature 440:940', ''],
                ['Paddon et al. 2013', 'Semi-synthetic artemisinin', 'Nature 496:528', ''],
                ['Galanie et al. 2015', 'Opioids biosynthesis in yeast', 'Science 349:1095', ''],
                ['Orth et al. 2010', 'E. coli metabolism (iJO1366)', 'Mol Syst Biol 6:390', ''],
            ],
            crispr: [
                ['Jinek et al. 2012', 'Cas9 programmable endonuclease', 'Science 337:816', ''],
                ['Qi et al. 2013', 'CRISPRi gene regulation', 'Cell 152:1173', ''],
                ['Zetsche et al. 2015', 'Cpf1 / Cas12a', 'Cell 163:759', ''],
                ['Komor et al. 2016', 'Base editing C→T', 'Nature 533:420', ''],
                ['Anzalone et al. 2019', 'Prime Editing', 'Nature 576:149', ''],
            ],
            safety: [
                ['Wright et al. 2015', 'GeneGuard biocontainment', 'ACS Synth Biol 4:307', ''],
                ['Mandell et al. 2015', 'Synthetic amino acid auxotrophy', 'Nature 518:55', ''],
                ['Rovner et al. 2015', 'Recoded organisms containment', 'Nature 518:89', ''],
                ['Lee et al. 2018', 'Next-gen biocontainment', 'Nat Chem Biol 14:530', ''],
            ],
            standards: [
                ['Galdzicki et al. 2014', 'SBOL visual language', 'Nat Biotechnol 32:545', ''],
                ['Hillson et al. 2019', 'Global alliance biofoundries', 'Nat Commun 10:2040', ''],
            ],
        };
        return (db[id] || []).map(([title, desc, journal, doi]) =>
            new SynBioTreeItem(title, vscode.TreeItemCollapsibleState.None, 'paper', {
                description: journal,
                tooltip: `### ${title}\n${desc}\n\n**Journal:** ${journal}${doi ? `\n[DOI](${doi})` : ''}`
            })
        );
    }
}

// ──────────────────────────────────────────────────────────────────────────────
// 7. QUICK STATS — live workspace metrics from shared index + real counts
// ──────────────────────────────────────────────────────────────────────────────
interface QuickStatsSnapshot {
    synbioCmdCount: number;
    coverageLine: string;
    lastUpdated?: number;
    pending: boolean;
}

export class QuickStatsProvider implements vscode.TreeDataProvider<SynBioTreeItem> {
    private _onDidChangeTreeData = new vscode.EventEmitter<SynBioTreeItem | undefined>();
    readonly onDidChangeTreeData = this._onDidChangeTreeData.event;
    private readonly _index = BioFileIndex.instance();
    private _externalMetricsRefreshing = false;
    private _snapshot: QuickStatsSnapshot = {
        synbioCmdCount: 0,
        coverageLine: 'metricas externas pendientes',
        pending: true,
    };

    constructor() {
        this._index.onDidChange(() => this.refresh());
        void this.refreshExternalMetrics(true);
    }

    refresh(): void {
        this._onDidChangeTreeData.fire(undefined);
        void this.refreshExternalMetrics();
    }
    getTreeItem(el: SynBioTreeItem): vscode.TreeItem { return el; }

    async getChildren(): Promise<SynBioTreeItem[]> {
        const s = this._index.getAggregateStats();
        const status = this._index.getStatus();
        const readiness = this._index.getWorkspaceReadiness();
        const snapshot = this._snapshot;

        return [
            new SynBioTreeItem(`Readiness ${readiness.score}/100`, vscode.TreeItemCollapsibleState.None, 'readiness', { description: readiness.level }),
            new SynBioTreeItem(`${s.files} archivos .bio`, vscode.TreeItemCollapsibleState.None, 'metric', { description: status.indexing ? status.message : 'indice listo' }),
            new SynBioTreeItem(`${s.lines.toLocaleString()} lineas BioScript`, vscode.TreeItemCollapsibleState.None, 'metric'),
            new SynBioTreeItem(`${s.genes} genes definidos`, vscode.TreeItemCollapsibleState.None, 'metric'),
            new SynBioTreeItem(`${s.promoters + s.rbs + s.terminators} partes regulatorias`, vscode.TreeItemCollapsibleState.None, 'metric'),
            new SynBioTreeItem(`${s.tus} transcription units`, vscode.TreeItemCollapsibleState.None, 'metric'),
            new SynBioTreeItem(`${s.bases.toLocaleString()} bases de secuencia`, vscode.TreeItemCollapsibleState.None, 'metric'),
            new SynBioTreeItem(`${snapshot.synbioCmdCount} comandos SynBio`, vscode.TreeItemCollapsibleState.None, 'metric', { description: snapshot.pending ? 'actualizando' : 'cacheado' }),
            new SynBioTreeItem(snapshot.coverageLine, vscode.TreeItemCollapsibleState.None, 'metric'),
        ];
    }

    private async refreshExternalMetrics(force = false): Promise<void> {
        if (this._externalMetricsRefreshing) return;
        if (!force && this._snapshot.lastUpdated && Date.now() - this._snapshot.lastUpdated < 30_000) return;
        this._externalMetricsRefreshing = true;
        try {
            const [allCmds, testFiles, covFiles] = await Promise.all([
                vscode.commands.getCommands(true),
                vscode.workspace.findFiles('**/test/**/*.test.ts', BIO_INDEX_EXCLUDE, 250),
                vscode.workspace.findFiles('**/coverage/**/coverage-summary.json', BIO_INDEX_EXCLUDE, 1),
            ]);

            const synbioCmdCount = allCmds.filter(command => command.startsWith('synbio.')).length;
            const dec = new TextDecoder('utf-8');
            let testCount = 0;
            for (const file of testFiles) {
                try {
                    const content = dec.decode(await vscode.workspace.fs.readFile(file));
                    testCount += (content.match(/\bit\s*\(/g) || []).length;
                    testCount += (content.match(/\btest\s*\(/g) || []).length;
                } catch { /* skip unreadable test files */ }
            }

            let coverageLine = `${testCount} tests definidos`;
            if (covFiles.length > 0) {
                try {
                    const raw = dec.decode(await vscode.workspace.fs.readFile(covFiles[0]));
                    const summary = JSON.parse(raw);
                    const pct = summary?.total?.lines?.pct;
                    if (typeof pct === 'number') coverageLine = `${testCount} tests | ${pct.toFixed(0)}% line cov`;
                } catch { /* no coverage data available */ }
            }

            this._snapshot = { synbioCmdCount, coverageLine, lastUpdated: Date.now(), pending: false };
        } catch {
            this._snapshot = { ...this._snapshot, coverageLine: 'metricas externas no disponibles', pending: false };
        } finally {
            this._externalMetricsRefreshing = false;
            this._onDidChangeTreeData.fire(undefined);
        }
    }
}

// ──────────────────────────────────────────────────────────────────────────────
// REGISTER ALL 7 PROVIDERS
// ──────────────────────────────────────────────────────────────────────────────
export function registerSynBioExplorer(context: vscode.ExtensionContext): {
    projectComponents: ProjectComponentsProvider;
    toolbox: ToolboxProvider;
    partsLibrary: PartsLibraryProvider;
    organisms: OrganismsProvider;
    safetyStatus: SafetyStatusProvider;
    literature: LiteratureProvider;
    quickStats: QuickStatsProvider;
} {
    const index = BioFileIndex.instance();
    context.subscriptions.push(index);

    const projectComponents = new ProjectComponentsProvider();
    const toolbox = new ToolboxProvider();
    const partsLibrary = new PartsLibraryProvider();
    const organisms = new OrganismsProvider();
    const safetyStatus = new SafetyStatusProvider();
    const literature = new LiteratureProvider();
    const quickStats = new QuickStatsProvider();

    context.subscriptions.push(
        vscode.window.registerTreeDataProvider('synbio.projectComponents', projectComponents),
        vscode.window.registerTreeDataProvider('synbio.toolbox', toolbox),
        vscode.window.registerTreeDataProvider('synbio.partsLibrary', partsLibrary),
        vscode.window.registerTreeDataProvider('synbio.organisms', organisms),
        vscode.window.registerTreeDataProvider('synbio.safetyStatus', safetyStatus),
        vscode.window.registerTreeDataProvider('synbio.literature', literature),
        vscode.window.registerTreeDataProvider('synbio.quickStats', quickStats),
    );

    // ── Explorer commands ─────────────────────────────────────────────────
    context.subscriptions.push(
        // Refresh all providers
        vscode.commands.registerCommand('synbio.refreshExplorer', () => {
            void index.rebuild();
            projectComponents.refresh(); toolbox.refresh(); partsLibrary.refresh();
            organisms.refresh(); safetyStatus.refresh(); literature.refresh(); quickStats.refresh();
            vscode.window.showInformationMessage('SynBio Explorer actualizandose en segundo plano');
        }),

        // Navigate to exact definition line (click + context menu)
        vscode.commands.registerCommand('synbio.revealDefinition', async (filePathOrItem: string | SynBioTreeItem, line?: number) => {
            let fp: string, ln: number;
            if (typeof filePathOrItem === 'string') {
                fp = filePathOrItem; ln = line ?? 1;
            } else {
                fp = (filePathOrItem.meta as any)?.filePath;
                ln = (filePathOrItem.meta as any)?.line ?? 1;
                if (!fp) return;
            }
            const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(fp));
            const editor = await vscode.window.showTextDocument(doc);
            const pos = new vscode.Position(Math.max(0, ln - 1), 0);
            editor.selection = new vscode.Selection(pos, pos);
            editor.revealRange(new vscode.Range(pos, pos), vscode.TextEditorRevealType.InCenter);
        }),

        // Insert biological part into active bioscript editor (or show actions)
        vscode.commands.registerCommand('synbio.insertPart', async (partOrItem: any) => {
            let part: { name: string; id: string; type: string; desc: string; strength?: string };
            if (partOrItem instanceof SynBioTreeItem) {
                part = (partOrItem.meta as any)?.partInfo;
            } else {
                part = partOrItem;
            }
            if (!part) return;

            const editor = vscode.window.activeTextEditor;
            if (!editor || editor.document.languageId !== 'bioscript') {
                const pick = await vscode.window.showQuickPick(
                    ['Copiar ID de parte', 'Abrir en iGEM Registry', 'Copiar como BioScript'],
                    { placeHolder: `${part.name} (${part.id}) — ${part.desc}` }
                );
                if (pick === 'Copiar ID de parte') { await vscode.env.clipboard.writeText(part.id); vscode.window.showInformationMessage(`Copiado: ${part.id}`); }
                if (pick === 'Abrir en iGEM Registry') await vscode.env.openExternal(vscode.Uri.parse(`https://parts.igem.org/Part:${part.id}`));
                if (pick === 'Copiar como BioScript') { await vscode.env.clipboard.writeText(generatePartSnippet(part)); vscode.window.showInformationMessage(`BioScript de ${part.name} copiado`); }
                return;
            }
            const plain = generatePartSnippet(part);
            const escaped = plain.replace(/\$/g, '\\$').replace(/}/g, '\\}');
            await editor.insertSnippet(new vscode.SnippetString(escaped));
        }),

        // Copy name/label to clipboard (components, parts, organisms)
        vscode.commands.registerCommand('synbio.copyComponentName', async (item: SynBioTreeItem) => {
            await vscode.env.clipboard.writeText(item.label as string);
            vscode.window.showInformationMessage(`Copiado: ${item.label}`);
        }),

        // Open iGEM registry for a part
        vscode.commands.registerCommand('synbio.openPartRegistry', async (item: SynBioTreeItem) => {
            const id = (item.meta as any)?.partId;
            if (id) await vscode.env.openExternal(vscode.Uri.parse(`https://parts.igem.org/Part:${id}`));
        }),

        // Set host organism from tree item
        vscode.commands.registerCommand('synbio.setHostFromTree', async (item: SynBioTreeItem) => {
            const nameMap: Record<string, string> = {
                'DH5α': 'ecoli_dh5alpha', 'DH10B': 'ecoli_k12', 'TOP10': 'ecoli_k12',
                'BL21(DE3)': 'ecoli_bl21', 'BL21(DE3) pLysS': 'ecoli_bl21',
                'Rosetta(DE3)': 'ecoli_bl21', 'C41(DE3)': 'ecoli_bl21',
                'MG1655': 'ecoli_mg1655', 'W3110': 'ecoli_k12',
                'Nissle 1917': 'ecoli_nissle1917', 'BW25113': 'ecoli_k12',
                'BY4741': 'yeast_by4741', 'BY4742': 'yeast_by4741', 'S288C': 'yeast_s288c',
                'CEN.PK2-1C': 'yeast_s288c', 'W303': 'yeast_s288c',
                'Pichia pastoris': 'yeast_s288c',
                '168': 'bacillus_subtilis_168', 'PY79': 'bacillus_subtilis_168', 'WB800N': 'bacillus_subtilis_168',
                'KT2440': 'pseudomonas_putida_kt2440', 'EM42': 'pseudomonas_putida_kt2440',
                'ATCC 13032': 'corynebacterium_glutamicum', 'MB001': 'corynebacterium_glutamicum',
                'HEK293T': 'human_hek293', 'CHO-K1': 'cho_k1',
            };
            const name = item.label as string;
            const configVal = nameMap[name];
            if (configVal) {
                await vscode.workspace.getConfiguration('synbio').update('hostOrganism', configVal, vscode.ConfigurationTarget.Workspace);
                vscode.window.showInformationMessage(`Host organism → ${name} (${configVal})`);
            } else {
                vscode.window.showInformationMessage(`${name} — configura manualmente en Settings > synbio.hostOrganism`);
            }
        }),

        // Quick-pick search across research-facing workspace assets
        vscode.commands.registerCommand('synbio.searchComponents', async () => {
            const all = index.getAllComponents();
            const status = index.getStatus();
            if (all.length === 0) {
                vscode.window.showInformationMessage(status.indexing ? 'El indice BioScript sigue trabajando; prueba de nuevo en unos segundos.' : 'No hay activos biológicos indexados en el workspace.');
                return;
            }
            const items = all.map(c => ({ label: c.type === 'sequence' ? `Secuencia ${c.name.slice(0, 18)}${c.name.length > 18 ? '…' : ''}` : c.name, description: `${humanizeComponentType(c.type)} — ${c.file}:${c.line}`, detail: c.filePath, _comp: c }));
            const picked = await vscode.window.showQuickPick(items, { placeHolder: 'Buscar diseño, secuencia o activo biológico…', matchOnDescription: true });
            if (picked) await vscode.commands.executeCommand('synbio.revealDefinition', picked._comp.filePath, picked._comp.line);
        }),

        vscode.commands.registerCommand('synbio.showExplorerWorkQueue', async () => {
            const readiness = index.getWorkspaceReadiness();
            const picks: Array<vscode.QuickPickItem & { command?: string; args?: any[] }> = [
                ...readiness.nextActions.map(action => ({
                    label: action.label,
                    description: action.description,
                    command: action.command,
                    args: action.args,
                })),
                ...readiness.issues.map(issue => ({
                    label: issue.title,
                    description: issue.file ? `${issue.file}:${issue.line ?? 1}` : issue.actionLabel,
                    detail: issue.detail,
                    command: issue.filePath ? 'synbio.revealDefinition' : issue.actionCommand,
                    args: issue.filePath ? [issue.filePath, issue.line ?? 1] : [],
                })),
            ];
            if (picks.length === 0) {
                vscode.window.showInformationMessage(`Explorer readiness ${readiness.score}/100: sin acciones pendientes.`);
                return;
            }
            const picked = await vscode.window.showQuickPick(picks, {
                placeHolder: `Explorer readiness ${readiness.score}/100 — ${readiness.level}`,
                matchOnDescription: true,
                matchOnDetail: true,
            });
            if (picked?.command) await vscode.commands.executeCommand(picked.command, ...(picked.args ?? []));
        }),

        vscode.commands.registerCommand('synbio.copyExplorerSummary', async () => {
            const summary = buildExplorerSummary(index);
            await vscode.env.clipboard.writeText(summary);
            vscode.window.showInformationMessage('Resumen del SynBio Explorer copiado');
        }),

        vscode.commands.registerCommand('synbio.applyExplorerFix', async (fix: ExplorerFix) => {
            if (!fix?.filePath) return;

            const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(fix.filePath));
            const updated = applyExplorerFixToText(doc.getText(), fix);
            if (updated === doc.getText()) {
                vscode.window.showInformationMessage('Ese fix ya estaba aplicado o no encontro un punto de insercion valido.');
                return;
            }

            const edit = new vscode.WorkspaceEdit();
            const lastLine = Math.max(0, doc.lineCount - 1);
            const fullRange = new vscode.Range(new vscode.Position(0, 0), doc.lineAt(lastLine).range.end);
            edit.replace(doc.uri, fullRange, updated);
            await vscode.workspace.applyEdit(edit);
            await doc.save();

            const editor = await vscode.window.showTextDocument(doc);
            const targetLine = Math.max(0, Math.min(fix.line - 1, doc.lineCount - 1));
            const pos = new vscode.Position(targetLine, 0);
            editor.selection = new vscode.Selection(pos, pos);
            editor.revealRange(new vscode.Range(pos, pos), vscode.TextEditorRevealType.InCenter);
            vscode.window.showInformationMessage(`Fix aplicado: ${fix.label}`);
        }),

        vscode.commands.registerCommand('synbio.applyRecommendedHost', async (recommendation: HostRecommendation) => {
            if (!recommendation?.configValue) return;
            await vscode.workspace.getConfiguration('synbio').update('hostOrganism', recommendation.configValue, vscode.ConfigurationTarget.Workspace);
            vscode.window.showInformationMessage(`Host recomendado aplicado: ${recommendation.label}`);
        }),

        vscode.commands.registerCommand('synbio.insertDesignPack', async (pack: DesignPack) => {
            if (!pack?.snippet) return;
            const editor = vscode.window.activeTextEditor;
            if (!editor || editor.document.languageId !== 'bioscript') {
                const doc = await vscode.workspace.openTextDocument({ language: 'bioscript', content: pack.snippet });
                await vscode.window.showTextDocument(doc);
                return;
            }

            const escaped = pack.snippet.replace(/\$/g, '\\$').replace(/}/g, '\\}');
            await editor.insertSnippet(new vscode.SnippetString(escaped));
        }),
    );

    return { projectComponents, toolbox, partsLibrary, organisms, safetyStatus, literature, quickStats };
}

function humanizeComponentType(type: string): string {
    const labels: Record<string, string> = {
        circuit: 'Circuito',
        transcription_unit: 'Transcription Unit',
        promoter: 'Promotor',
        rbs: 'RBS',
        terminator: 'Terminador',
        kill_switch: 'Kill switch',
        gene: 'Gen',
        protein: 'Proteína',
        pathway: 'Ruta metabólica',
        sequence: 'Secuencia',
    };
    return labels[type] || type;
}

function buildExplorerSummary(index: BioFileIndex): string {
    const stats = index.getAggregateStats();
    const readiness = index.getWorkspaceReadiness();
    const status = index.getStatus();
    const issueLines = readiness.issues.length > 0
        ? readiness.issues.map(issue => `- [${issue.severity}] ${issue.title}${issue.file ? ` (${issue.file}:${issue.line ?? 1})` : ''}: ${issue.detail}`)
        : ['- Sin alertas principales.'];
    const actionLines = readiness.nextActions.length > 0
        ? readiness.nextActions.map(action => `- ${action.label}: ${action.description}`)
        : ['- Sin acciones pendientes.'];
    const strengthLines = readiness.strengths.length > 0
        ? readiness.strengths.map(strength => `- ${strength}`)
        : ['- Todavia no hay fortalezas indexadas.'];

    return [
        '# SynBio Explorer Summary',
        '',
        `Readiness: ${readiness.score}/100 (${readiness.level})`,
        `Indice: ${status.message}`,
        '',
        '## Workspace',
        `- Archivos .bio: ${stats.files}`,
        `- Lineas BioScript: ${stats.lines}`,
        `- Circuitos/TU: ${stats.circuits + stats.tus}`,
        `- Genes: ${stats.genes}`,
        `- Partes regulatorias: ${stats.promoters + stats.rbs + stats.terminators}`,
        `- Kill switches: ${stats.killSwitches}`,
        `- Bases detectadas: ${stats.bases}`,
        '',
        '## Fortalezas',
        ...strengthLines,
        '',
        '## Puntos debiles',
        ...issueLines,
        '',
        '## Siguiente trabajo',
        ...actionLines,
    ].join('\n');
}

function explorerFixLabel(kind: ExplorerFixKind, line: number): string {
    const labels: Record<ExplorerFixKind, string> = {
        'add-host': `Insertar host base en L${line}`,
        'add-promoter': `Insertar promotor aqui en L${line}`,
        'add-rbs': `Anadir RBS aqui en L${line}`,
        'add-terminator': `Anadir terminador en L${line}`,
        'add-killswitch': `Insertar kill switch de contencion`,
    };
    return labels[kind];
}

function applyExplorerFixToText(text: string, fix: ExplorerFix): string {
    switch (fix.kind) {
        case 'add-host':
            return applyHostFix(text);
        case 'add-promoter':
            return applyPromoterFix(text);
        case 'add-rbs':
            return applyGenePropertyFix(text, 'rbs: B0034;', /\brbs\s*:/i, [/\bpromoter\s*:/i]);
        case 'add-terminator':
            return applyGenePropertyFix(text, 'terminator: B0015;', /\bterminator\s*:/i, [/\bpromoter\s*:/i, /\brbs\s*:/i]);
        case 'add-killswitch':
            return applyKillSwitchFix(text);
        default:
            return text;
    }
}

function applyHostFix(text: string): string {
    if (/\bhost\s*:/i.test(text)) return text;
    const lineBreak = detectLineBreak(text);
    const lines = text.split(/\r?\n/);
    const architectureIndex = findArchitectureLine(lines);
    if (architectureIndex === -1) return text;
    const indent = getLineIndent(lines[architectureIndex]) + '    ';
    lines.splice(architectureIndex + 1, 0, `${indent}host: "ecoli_k12";`, '');
    return lines.join(lineBreak);
}

function applyPromoterFix(text: string): string {
    let updated = text;
    if (!/\bpromoter\s+\w+\s*;/i.test(text)) {
        const lineBreak = detectLineBreak(updated);
        const lines = updated.split(/\r?\n/);
        const architectureIndex = findArchitectureLine(lines);
        if (architectureIndex !== -1) {
            const hostIndex = architectureIndex + 1 < lines.length && /\bhost\s*:/i.test(lines[architectureIndex + 1]) ? architectureIndex + 1 : architectureIndex;
            const indent = getLineIndent(lines[architectureIndex]) + '    ';
            lines.splice(hostIndex + 1, 0, '', `${indent}promoter p_auto_const;`, '');
            updated = lines.join(lineBreak);
        }
    }
    return applyGenePropertyFix(updated, 'promoter: p_auto_const;', /\bpromoter\s*:/i, []);
}

function applyGenePropertyFix(text: string, propertyLine: string, propertyPattern: RegExp, preferredAfter: RegExp[]): string {
    const lineBreak = detectLineBreak(text);
    const lines = text.split(/\r?\n/);
    let changed = false;

    for (let index = 0; index < lines.length; index++) {
        const geneMatch = lines[index].match(/^(\s*)gene\s+\w+\s*\{/i);
        if (!geneMatch) continue;

        const closeIndex = findBlockCloseIndex(lines, index + 1);
        if (closeIndex === -1) continue;
        const blockLines = lines.slice(index + 1, closeIndex);
        if (blockLines.some(line => propertyPattern.test(line))) {
            index = closeIndex;
            continue;
        }

        let insertIndex = index + 1;
        for (let probe = index + 1; probe < closeIndex; probe++) {
            if (preferredAfter.some(pattern => pattern.test(lines[probe]))) {
                insertIndex = probe + 1;
            }
        }

        lines.splice(insertIndex, 0, `${geneMatch[1]}    ${propertyLine}`);
        changed = true;
        index = closeIndex + 1;
    }

    return changed ? lines.join(lineBreak) : text;
}

function applyKillSwitchFix(text: string): string {
    if (/\bkill_switch\b/i.test(text)) return text;
    const lineBreak = detectLineBreak(text);
    const lines = text.split(/\r?\n/);
    const architectureIndex = findArchitectureLine(lines);
    if (architectureIndex === -1) return text;
    const closingIndex = findLastClosingBrace(lines);
    if (closingIndex === -1) return text;
    const indent = getLineIndent(lines[architectureIndex]) + '    ';
    lines.splice(closingIndex, 0,
        '',
        `${indent}kill_switch {`,
        `${indent}    trigger: absence_of("arabinose"),`,
        `${indent}    mechanism: CcdB,`,
        `${indent}    delay: 2 hr`,
        `${indent}}`,
    );
    return lines.join(lineBreak);
}

function detectLineBreak(text: string): string {
    return text.includes('\r\n') ? '\r\n' : '\n';
}

function findArchitectureLine(lines: string[]): number {
    return lines.findIndex(line => /^\s*(circuit|transcription_unit|pathway)\s+\w+.*\{\s*$/i.test(line));
}

function findBlockCloseIndex(lines: string[], startIndex: number): number {
    for (let index = startIndex; index < lines.length; index++) {
        if (lines[index].trim() === '}') return index;
    }
    return -1;
}

function findLastClosingBrace(lines: string[]): number {
    for (let index = lines.length - 1; index >= 0; index--) {
        if (lines[index].trim() === '}') return index;
    }
    return -1;
}

function getLineIndent(line: string): string {
    return line.match(/^(\s*)/)?.[1] ?? '';
}

function getRelevantDesignPacks(index: BioFileIndex): DesignPack[] {
    const signals = new Set(index.getSignals());
    const stats = index.getAggregateStats();
    const issues = index.getIssues(10);
    const packs: DesignPack[] = [];

    const push = (id: string) => {
        const pack = DESIGN_PACKS.find(candidate => candidate.id === id);
        if (pack && !packs.some(existing => existing.id === pack.id)) packs.push(pack);
    };

    if (signals.has('t7')) push('t7-expression');
    if (signals.has('metabolic') || stats.pathways > 0) push('metabolic-pathway');
    if (signals.has('therapeutic') || issues.some(issue => issue.title.includes('contencion'))) push('contained-therapeutic');
    if (stats.genes > 0 || stats.promoters > 0) push('sensor-reporter');
    if (packs.length === 0) push('sensor-reporter');

    return packs.slice(0, 4);
}

function inferExperimentalGoals(index: BioFileIndex): SmartGoal[] {
    const stats = index.getAggregateStats();
    const signals = new Set(index.getSignals());
    const goals: SmartGoal[] = [];

    if (signals.has('t7')) goals.push('expression');
    if (signals.has('metabolic') || stats.pathways > 0) goals.push('metabolic');
    if (signals.has('therapeutic')) goals.push('biocontainment');
    if (signals.has('secretion')) goals.push('secretion');
    if (signals.has('yeast')) goals.push('yeast');
    if (stats.genes > 0 && !goals.includes('expression')) goals.push('expression');
    if (goals.length === 0) goals.push('biosensing');

    return Array.from(new Set(goals));
}

function getSmartPartRecommendations(index: BioFileIndex): SmartPartEntry[] {
    const host = vscode.workspace.getConfiguration('synbio').get<string>('hostOrganism', 'ecoli_k12');
    const goals = inferExperimentalGoals(index);
    const fixKinds = index.getIssues(20)
        .map(issue => issue.fixKind)
        .filter((kind): kind is ExplorerFixKind => Boolean(kind));

    return [...SMART_PARTS]
        .sort((left, right) => scoreSmartPart(right, host, goals, fixKinds) - scoreSmartPart(left, host, goals, fixKinds))
        .slice(0, 8);
}

function scoreSmartPart(part: SmartPartEntry, host: string, goals: SmartGoal[], fixKinds: ExplorerFixKind[]): number {
    let score = 0;
    if (part.hosts.includes(host)) score += 5;
    score += part.goals.filter(goal => goals.includes(goal)).length * 3;
    score += part.fixKinds.filter(kind => fixKinds.includes(kind)).length * 4;
    if (part.strength) score += 1;
    return score;
}

function getRecommendedHosts(index: BioFileIndex): HostRecommendation[] {
    const signals = new Set(index.getSignals());
    const recommendations = HOST_RECOMMENDATIONS.filter(recommendation => recommendation.signals.some(signal => signals.has(signal)));
    return recommendations.length > 0 ? recommendations.slice(0, 4) : HOST_RECOMMENDATIONS.slice(0, 2);
}

// ── Snippet generator for parts insertion ─────────────────────────────────────
function generatePartSnippet(part: { name: string; id: string; type: string; desc: string; strength?: string }): string {
    const safe = part.name.replace(/[^a-zA-Z0-9_]/g, '_').toLowerCase();
    const str = part.strength ? ` | strength: ${part.strength}` : '';
    const snippets: Record<string, string> = {
        const_proms:   `promoter ${safe} {\n    type: "constitutive"\n    // ${part.id} — ${part.desc}${str}\n}`,
        ind_proms:     `promoter ${safe} {\n    type: "inducible"\n    // ${part.id} — ${part.desc}\n}`,
        yeast_proms:   `promoter ${safe} {\n    type: "constitutive"\n    // Yeast: ${part.id} — ${part.desc}\n}`,
        rbs:           `    rbs: ${part.name}  // ${part.id}${str}`,
        reporters_fl:  `gene ${safe} {\n    // Fluorescent reporter: ${part.id} — ${part.desc}\n    rbs: B0034\n    terminator: B0015\n}`,
        reporters_enz: `gene ${safe} {\n    // Enzymatic reporter: ${part.id} — ${part.desc}\n    rbs: B0034\n    terminator: B0015\n}`,
        terminators:   `    terminator: ${part.name}  // ${part.id} eff=${part.strength || '?'}`,
        repressors:    `gene ${safe} {\n    // Repressor: ${part.id} — ${part.desc}\n    rbs: B0034\n    terminator: B0015\n}`,
        activators:    `gene ${safe} {\n    // Activator: ${part.id} — ${part.desc}\n    rbs: B0034\n    terminator: B0015\n}`,
        sensors:       `gene ${safe} {\n    // Sensor: ${part.id} — ${part.desc}\n    rbs: B0034\n    terminator: B0015\n}`,
        deg_tags:      `    degradation_tag: "${part.name}"  // ${part.id} — ${part.desc}${str}`,
        purification:  `    tag: "${part.name}"  // ${part.id} — ${part.desc}`,
        signal_peps:   `    signal_peptide: "${part.name}"  // ${part.id} — ${part.desc}`,
        origins:       `    origin: "${part.name}"  // ${part.id} — ${part.desc}`,
        resistance:    `    resistance: "${part.name}"  // ${part.id} — ${part.desc}`,
        killswitches:  `kill_switch ${safe} {\n    // ${part.id} — ${part.desc}\n    mechanism: "toxin-antitoxin"\n}`,
        recombinases:  `gene ${safe} {\n    // Recombinase: ${part.id} — ${part.desc}\n    rbs: B0034\n    terminator: B0015\n}`,
        crispr:        `gene ${safe} {\n    // CRISPR: ${part.id} — ${part.desc}\n    rbs: B0034\n    terminator: B0015\n}`,
    };
    return snippets[part.type] || `// ${part.name} (${part.id}) — ${part.desc}`;
}
