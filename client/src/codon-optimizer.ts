/**
 * SynBio-LLVM - Codon Optimizer UI
 * Interfaz WebView para optimización de codones según organismo huésped
 * Visualiza CAI, GC content, sitios de restricción y secuencia optimizada
 */

import * as vscode from 'vscode';
import { getCodonTable, calculateCAI, GENETIC_CODE, CodonTable } from './real-codon-tables';

/** Organismo huésped soportado */
interface HostOrganism {
    id: string;
    name: string;
    optimalGC: [number, number]; // rango ideal de GC%
    description: string;
}

/** Resultado de optimización de codones */
interface CodonOptResult {
    originalSequence: string;
    optimizedSequence: string;
    cai: number;
    gcContent: number;
    avoidedStructures: string[];
    improvements: string[];
    codonChanges: CodonChange[];
    stats: OptimizationStats;
}

interface CodonChange {
    position: number;
    aminoAcid: string;
    originalCodon: string;
    optimizedCodon: string;
    frequencyGain: number;
}

interface OptimizationStats {
    totalCodons: number;
    changedCodons: number;
    gcBefore: number;
    gcAfter: number;
    caiBefore: number;
    caiAfter: number;
    restrictionSitesRemoved: number;
    homopolymersRemoved: number;
}

const SUPPORTED_HOSTS: HostOrganism[] = [
    { id: 'ecoli_dh5alpha', name: 'E. coli DH5α', optimalGC: [45, 55], description: 'Cepa de clonación, alta eficiencia de transformación' },
    { id: 'ecoli_bl21', name: 'E. coli BL21(DE3)', optimalGC: [45, 55], description: 'Cepa de expresión con T7 RNA polimerasa' },
    { id: 'yeast_s288c', name: 'S. cerevisiae S288C', optimalGC: [35, 45], description: 'Levadura modelo, expresión eucariótica' },
    { id: 'bacillus_subtilis', name: 'B. subtilis 168', optimalGC: [40, 50], description: 'Gram-positivo, secreción de proteínas' },
];

/**
 * Construye tabla de codones en formato [codón, fracción][] por aminoácido
 * a partir de la tabla Kazusa real (real-codon-tables.ts).
 * 
 * Fuente: Nakamura, Y., Gojobori, T. & Ikemura, T. (2000).
 *         "Codon usage tabulated from international DNA sequence databases."
 *         Nucleic Acids Research, 28(1), 292.
 *         Datos: https://www.kazusa.or.jp/codon/
 */
function buildCodonLookup(hostId: string): Record<string, [string, number][]> {
    // Mapear hostId del UI al nombre que entiende getCodonTable()
    const organismMap: Record<string, string> = {
        'ecoli_dh5alpha': 'ecoli',
        'ecoli_bl21': 'ecoli',
        'yeast_s288c': 'cerevisiae',
        'bacillus_subtilis': 'subtilis',
    };
    const kazusaTable = getCodonTable(organismMap[hostId] || 'ecoli');
    const lookup: Record<string, [string, number][]> = {};

    for (const [codon, entry] of Object.entries(kazusaTable)) {
        const aa = entry.aminoAcidSingle;
        if (!lookup[aa]) lookup[aa] = [];
        lookup[aa].push([codon, entry.fraction]);
    }

    // Ordenar cada grupo por fracción descendente
    for (const aa of Object.keys(lookup)) {
        lookup[aa].sort((a, b) => b[1] - a[1]);
    }

    return lookup;
}

export class CodonOptimizerUI implements vscode.Disposable {
    private panel: vscode.WebviewPanel | undefined;
    private context: vscode.ExtensionContext;
    private disposables: vscode.Disposable[] = [];

    constructor(context: vscode.ExtensionContext) {
        this.context = context;
    }

    /** Abre el panel de optimización */
    async show(): Promise<void> {
        if (this.panel) {
            this.panel.reveal();
            return;
        }

        this.panel = vscode.window.createWebviewPanel(
            'synbioCodonOptimizer',
            '🧬 Optimizador de Codones',
            vscode.ViewColumn.Two,
            {
                enableScripts: true,
                retainContextWhenHidden: true,
            }
        );

        this.panel.webview.html = this.getWebviewHTML();

        this.panel.webview.onDidReceiveMessage(
            async (message) => {
                switch (message.command) {
                    case 'optimize':
                        await this.handleOptimize(message.sequence, message.host, message.options);
                        break;
                    case 'loadFromEditor':
                        await this.loadSequenceFromEditor();
                        break;
                    case 'exportFasta':
                        await this.exportToFasta(message.name, message.sequence);
                        break;
                    case 'copySequence':
                        await vscode.env.clipboard.writeText(message.sequence);
                        vscode.window.showInformationMessage('Secuencia copiada al portapapeles');
                        break;
                }
            },
            undefined,
            this.disposables
        );

        this.panel.onDidDispose(() => {
            this.panel = undefined;
        }, null, this.disposables);
    }

    /** Optimiza la secuencia de proteínas */
    private async handleOptimize(proteinSeq: string, hostId: string, options: { avoidRestriction: boolean; balanceGC: boolean; avoidHomopolymers: boolean }): Promise<void> {
        const cleanSeq = proteinSeq.replace(/\s+/g, '').toUpperCase();

        if (!/^[ACDEFGHIKLMNPQRSTVWY*]+$/.test(cleanSeq)) {
            this.panel?.webview.postMessage({ command: 'error', message: 'Secuencia contiene caracteres inválidos. Usa código de 1 letra (ACDEFGHIKLMNPQRSTVWY).' });
            return;
        }

        const host = SUPPORTED_HOSTS.find(h => h.id === hostId) || SUPPORTED_HOSTS[0];
        const result = this.optimizeLocally(cleanSeq, host, options);

        this.panel?.webview.postMessage({
            command: 'optimizationResult',
            result
        });
    }

    /** Motor local de optimización de codones — usa tablas Kazusa reales por organismo */
    private optimizeLocally(proteinSeq: string, host: HostOrganism, options: { avoidRestriction: boolean; balanceGC: boolean; avoidHomopolymers: boolean }): CodonOptResult {
        const table = buildCodonLookup(host.id); // Tabla real Kazusa para el organismo elegido
        const changes: CodonChange[] = [];
        let optimizedDNA = '';
        let naiveDNA = '';

        for (let i = 0; i < proteinSeq.length; i++) {
            const aa = proteinSeq[i];
            const codons = table[aa];

            if (!codons || codons.length === 0) {
                optimizedDNA += 'NNN';
                naiveDNA += 'NNN';
                continue;
            }

            // Traducción naive: primer codón
            naiveDNA += codons[0][0];

            // Selección inteligente
            let bestCodon = codons[0][0];
            let bestScore = -Infinity;

            for (const [codon, freq] of codons) {
                let score = freq * 100;

                // Evitar repeticiones con codón previo
                if (optimizedDNA.length >= 3 && optimizedDNA.slice(-3) === codon) {
                    score *= 0.5;
                }

                // Penalizar homopolímeros
                if (options.avoidHomopolymers && /^(.)\1\1$/.test(codon)) {
                    score *= 0.3;
                }

                // Balancear GC
                if (options.balanceGC) {
                    const gc = (codon.match(/[GC]/g) || []).length / 3;
                    if (gc >= 0.33 && gc <= 0.67) {
                        score *= 1.2;
                    }
                }

                // Evitar sitios de restricción
                if (options.avoidRestriction) {
                    const context = optimizedDNA.slice(-5) + codon;
                    if (this.containsRestrictionSite(context)) {
                        score *= 0.1;
                    }
                }

                if (score > bestScore) {
                    bestScore = score;
                    bestCodon = codon;
                }
            }

            optimizedDNA += bestCodon;

            // Registrar cambio si difiere del naive
            if (bestCodon !== codons[0][0]) {
                changes.push({
                    position: i + 1,
                    aminoAcid: aa,
                    originalCodon: codons[0][0],
                    optimizedCodon: bestCodon,
                    frequencyGain: bestScore / 100 - codons[0][1],
                });
            }
        }

        const gcBefore = this.calcGC(naiveDNA);
        const gcAfter = this.calcGC(optimizedDNA);
        const caiBefore = this.calcCAI(naiveDNA, host.id);
        const caiAfter = this.calcCAI(optimizedDNA, host.id);

        const avoidedStructures: string[] = [];
        const restrictionSites = [['EcoRI', 'GAATTC'], ['BamHI', 'GGATCC'], ['HindIII', 'AAGCTT'], ['PstI', 'CTGCAG'], ['SalI', 'GTCGAC'], ['XbaI', 'TCTAGA'], ['SpeI', 'ACTAGT'], ['NotI', 'GCGGCCGC']];
        let sitesRemoved = 0;
        for (const [name, site] of restrictionSites) {
            if (naiveDNA.includes(site) && !optimizedDNA.includes(site)) {
                avoidedStructures.push(`Eliminado sitio ${name} (${site})`);
                sitesRemoved++;
            } else if (!optimizedDNA.includes(site)) {
                avoidedStructures.push(`Sin sitio ${name}`);
            }
        }

        let homosRemoved = 0;
        for (const homo of ['AAAA', 'TTTT', 'GGGG', 'CCCC']) {
            if (naiveDNA.includes(homo) && !optimizedDNA.includes(homo)) {
                homosRemoved++;
            }
        }

        const improvements: string[] = [];
        if (caiAfter > caiBefore) {
            improvements.push(`CAI mejorado: ${(caiBefore * 100).toFixed(1)}% → ${(caiAfter * 100).toFixed(1)}% (+${((caiAfter - caiBefore) * 100).toFixed(1)}%)`);
        }
        if (Math.abs(gcAfter - 50) < Math.abs(gcBefore - 50)) {
            improvements.push(`GC% más equilibrado: ${gcBefore.toFixed(1)}% → ${gcAfter.toFixed(1)}%`);
        }
        if (sitesRemoved > 0) {
            improvements.push(`${sitesRemoved} sitios de restricción eliminados`);
        }
        if (homosRemoved > 0) {
            improvements.push(`${homosRemoved} homopolímeros eliminados`);
        }

        return {
            originalSequence: naiveDNA,
            optimizedSequence: optimizedDNA,
            cai: caiAfter,
            gcContent: gcAfter,
            avoidedStructures,
            improvements,
            codonChanges: changes,
            stats: {
                totalCodons: proteinSeq.length,
                changedCodons: changes.length,
                gcBefore,
                gcAfter,
                caiBefore,
                caiAfter,
                restrictionSitesRemoved: sitesRemoved,
                homopolymersRemoved: homosRemoved,
            }
        };
    }

    private calcGC(seq: string): number {
        const gc = (seq.match(/[GC]/gi) || []).length;
        return seq.length > 0 ? (gc / seq.length) * 100 : 0;
    }

    /**
     * CAI real basado en Sharp & Li (1987) — media geométrica
     * Delegamos al módulo real-codon-tables.ts que implementa:
     *   CAI = exp( (1/L) × Σ ln(w_i) )
     * con w_i = f(codon) / max(f(sinónimos))
     * 
     * Ref: Sharp, P.M. & Li, W.H. (1987). Nucleic Acids Res. 15(3):1281–1295.
     */
    private calcCAI(seq: string, hostId: string = 'ecoli'): number {
        // Mapear hostId del UI al nombre del organismo para calculateCAI
        const organismMap: Record<string, string> = {
            'ecoli_dh5alpha': 'ecoli',
            'ecoli_bl21': 'ecoli',
            'yeast_s288c': 'cerevisiae',
            'bacillus_subtilis': 'subtilis',
        };
        return calculateCAI(seq, organismMap[hostId] || 'ecoli');
    }

    /** Traducción reversa usando NCBI Standard Genetic Code (Table 1) */
    private reverseTranslate(codon: string): string {
        const entry = GENETIC_CODE[codon.toUpperCase()];
        return entry ? entry.aa1 : '?';
    }

    private containsRestrictionSite(seq: string): boolean {
        const sites = ['GAATTC', 'GGATCC', 'AAGCTT', 'CTGCAG', 'GTCGAC', 'TCTAGA', 'ACTAGT', 'GCGGCCGC'];
        return sites.some(s => seq.includes(s));
    }

    /** Carga secuencia desde el editor activo */
    private async loadSequenceFromEditor(): Promise<void> {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            this.panel?.webview.postMessage({ command: 'error', message: 'No hay editor activo' });
            return;
        }

        const text = editor.document.getText(editor.selection.isEmpty ? undefined : editor.selection);
        // Extraer secuencias de proteína de archivos .bio
        const proteinMatch = text.match(/protein\s*:\s*"?([A-Z*]+)"?/i) || text.match(/sequence\s*:\s*"?([A-Z*]+)"?/i);
        const sequence = proteinMatch ? proteinMatch[1] : text.replace(/[^A-Za-z*]/g, '').toUpperCase();

        this.panel?.webview.postMessage({ command: 'loadedSequence', sequence });
    }

    /** Exporta secuencia a FASTA */
    private async exportToFasta(name: string, sequence: string): Promise<void> {
        const uri = await vscode.window.showSaveDialog({
            defaultUri: vscode.Uri.file(`${name || 'optimized'}.fasta`),
            filters: { 'FASTA': ['fasta', 'fa'] }
        });

        if (uri) {
            const fastaContent = `>${name || 'optimized_sequence'}\n${sequence.match(/.{1,80}/g)?.join('\n') || sequence}\n`;
            await vscode.workspace.fs.writeFile(uri, Buffer.from(fastaContent, 'utf8'));
            vscode.window.showInformationMessage(`Secuencia exportada a ${uri.fsPath}`);
        }
    }

    private getWebviewHTML(): string {
        return `<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Optimizador de Codones</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: 'Segoe UI', Tahoma, sans-serif; background: #1e1e2e; color: #cdd6f4; padding: 20px; }
        
        .header { display: flex; align-items: center; gap: 12px; margin-bottom: 24px; }
        .header h1 { font-size: 22px; color: #89b4fa; }
        .header .badge { background: #313244; color: #a6adc8; padding: 4px 10px; border-radius: 12px; font-size: 11px; }

        .card { background: #313244; border-radius: 12px; padding: 20px; margin-bottom: 16px; border: 1px solid #45475a; }
        .card h3 { color: #89b4fa; margin-bottom: 12px; font-size: 15px; }

        label { display: block; color: #a6adc8; font-size: 13px; margin-bottom: 6px; }
        textarea { width: 100%; background: #1e1e2e; color: #cdd6f4; border: 1px solid #45475a; border-radius: 8px; padding: 12px; font-family: 'Cascadia Code', 'Fira Code', monospace; font-size: 13px; resize: vertical; min-height: 80px; }
        textarea:focus { border-color: #89b4fa; outline: none; }

        select { width: 100%; background: #1e1e2e; color: #cdd6f4; border: 1px solid #45475a; border-radius: 8px; padding: 10px 12px; font-size: 13px; cursor: pointer; }
        select:focus { border-color: #89b4fa; outline: none; }

        .checkbox-group { display: flex; flex-wrap: wrap; gap: 16px; margin-top: 8px; }
        .checkbox-group label { display: flex; align-items: center; gap: 6px; cursor: pointer; color: #cdd6f4; font-size: 13px; }
        input[type="checkbox"] { accent-color: #89b4fa; width: 16px; height: 16px; }

        .btn-row { display: flex; gap: 10px; margin-top: 16px; }
        .btn { padding: 10px 20px; border: none; border-radius: 8px; font-size: 14px; cursor: pointer; font-weight: 600; transition: all 0.2s; }
        .btn-primary { background: linear-gradient(135deg, #89b4fa, #74c7ec); color: #1e1e2e; }
        .btn-primary:hover { filter: brightness(1.1); transform: translateY(-1px); }
        .btn-secondary { background: #45475a; color: #cdd6f4; }
        .btn-secondary:hover { background: #585b70; }
        .btn:disabled { opacity: 0.5; cursor: not-allowed; }

        .results { display: none; }
        .results.visible { display: block; }

        .stats-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 12px; margin-bottom: 16px; }
        .stat-card { background: #1e1e2e; border-radius: 8px; padding: 14px; text-align: center; border: 1px solid #45475a; }
        .stat-value { font-size: 28px; font-weight: 700; color: #a6e3a1; }
        .stat-value.warn { color: #f9e2af; }
        .stat-value.bad { color: #f38ba8; }
        .stat-label { font-size: 11px; color: #a6adc8; margin-top: 4px; }
        .stat-delta { font-size: 12px; color: #a6e3a1; margin-top: 2px; }
        .stat-delta.negative { color: #f38ba8; }

        .sequence-display { background: #1e1e2e; border-radius: 8px; padding: 14px; margin-top: 12px; border: 1px solid #45475a; overflow-x: auto; }
        .sequence-display code { font-family: 'Cascadia Code', 'Fira Code', monospace; font-size: 12px; word-break: break-all; line-height: 1.6; }
        .codon { display: inline; }
        .codon.changed { background: rgba(166, 227, 161, 0.15); color: #a6e3a1; border-radius: 2px; }
        .codon.original { color: #6c7086; }

        .improvements-list { list-style: none; }
        .improvements-list li { padding: 6px 0; border-bottom: 1px solid #45475a; font-size: 13px; }
        .improvements-list li:last-child { border-bottom: none; }
        .improvements-list li::before { content: '✓ '; color: #a6e3a1; font-weight: bold; }

        .changes-table { width: 100%; border-collapse: collapse; margin-top: 8px; font-size: 12px; }
        .changes-table th { background: #1e1e2e; padding: 8px; text-align: left; color: #89b4fa; border-bottom: 2px solid #45475a; }
        .changes-table td { padding: 6px 8px; border-bottom: 1px solid #45475a; }
        .changes-table tr:hover { background: rgba(137, 180, 250, 0.05); }

        .gc-bar { height: 20px; background: #1e1e2e; border-radius: 10px; overflow: hidden; margin-top: 8px; position: relative; }
        .gc-fill { height: 100%; border-radius: 10px; transition: width 0.5s ease; }
        .gc-marker { position: absolute; top: -4px; width: 2px; height: 28px; background: #f9e2af; }
        .gc-range { position: absolute; top: 0; height: 100%; background: rgba(166, 227, 161, 0.15); border-left: 1px dashed #a6e3a1; border-right: 1px dashed #a6e3a1; }

        .spinner { display: inline-block; width: 16px; height: 16px; border: 2px solid #45475a; border-top-color: #89b4fa; border-radius: 50%; animation: spin 0.8s linear infinite; }
        @keyframes spin { to { transform: rotate(360deg); } }

        .error-msg { background: rgba(243, 139, 168, 0.1); border: 1px solid #f38ba8; border-radius: 8px; padding: 12px; color: #f38ba8; margin-top: 8px; display: none; }
        .error-msg.show { display: block; }

        .tabs { display: flex; gap: 2px; margin-bottom: 16px; }
        .tab { padding: 8px 16px; background: #45475a; color: #a6adc8; border: none; cursor: pointer; font-size: 13px; transition: all 0.2s; }
        .tab:first-child { border-radius: 8px 0 0 8px; }
        .tab:last-child { border-radius: 0 8px 8px 0; }
        .tab.active { background: #89b4fa; color: #1e1e2e; font-weight: 600; }
        .tab-content { display: none; }
        .tab-content.active { display: block; }
    </style>
</head>
<body>
    <div class="header">
        <h1>🧬 Optimizador de Codones</h1>
        <span class="badge">SynBio-LLVM v0.1</span>
    </div>

    <div class="card">
        <h3>📥 Secuencia de Proteína</h3>
        <label>Ingresa la secuencia de aminoácidos (código de 1 letra):</label>
        <textarea id="proteinInput" placeholder="MVKVYAPASSANMSVGFDVLGAAVTPVDGALLGDVVTVEAAETFSLNNLGRPVQ..." rows="3"></textarea>
        <div class="btn-row">
            <button class="btn btn-secondary" onclick="loadFromEditor()">📂 Cargar desde editor</button>
            <button class="btn btn-secondary" onclick="loadExample()">🧪 Ejemplo: GFP</button>
        </div>
    </div>

    <div class="card">
        <h3>🦠 Organismo Huésped</h3>
        <select id="hostSelect">
            <option value="ecoli_dh5alpha">E. coli DH5α — Cepa de clonación</option>
            <option value="ecoli_bl21">E. coli BL21(DE3) — Expresión con T7</option>
            <option value="yeast_s288c">S. cerevisiae S288C — Eucariótico</option>
            <option value="bacillus_subtilis">B. subtilis 168 — Gram-positivo</option>
        </select>
    </div>

    <div class="card">
        <h3>⚙️ Opciones de Optimización</h3>
        <div class="checkbox-group">
            <label><input type="checkbox" id="optRestriction" checked> Evitar sitios de restricción</label>
            <label><input type="checkbox" id="optGC" checked> Balancear contenido GC</label>
            <label><input type="checkbox" id="optHomopolymers" checked> Evitar homopolímeros</label>
        </div>
    </div>

    <div class="btn-row" style="margin-bottom: 24px;">
        <button class="btn btn-primary" id="optimizeBtn" onclick="runOptimization()">🚀 Optimizar Codones</button>
    </div>

    <div id="errorMsg" class="error-msg"></div>

    <div class="results" id="results">
        <div class="card">
            <h3>📊 Resultados de Optimización</h3>
            <div class="stats-grid" id="statsGrid"></div>

            <h3 style="margin-top: 16px;">📈 GC Content</h3>
            <div class="gc-bar" id="gcBar">
                <div class="gc-fill" id="gcFill"></div>
                <div class="gc-range" id="gcRange"></div>
            </div>
            <div style="display:flex; justify-content: space-between; font-size:11px; color:#6c7086; margin-top:4px;">
                <span>0%</span><span>25%</span><span>50%</span><span>75%</span><span>100%</span>
            </div>
        </div>

        <div class="card">
            <div class="tabs">
                <button class="tab active" onclick="switchTab('sequence')">Secuencia</button>
                <button class="tab" onclick="switchTab('changes')">Cambios</button>
                <button class="tab" onclick="switchTab('improvements')">Mejoras</button>
            </div>

            <div class="tab-content active" id="tab-sequence">
                <h3>🧬 Secuencia Optimizada</h3>
                <div class="sequence-display" id="seqDisplay"></div>
                <div class="btn-row" style="margin-top: 12px;">
                    <button class="btn btn-secondary" onclick="copySequence()">📋 Copiar</button>
                    <button class="btn btn-secondary" onclick="exportFasta()">💾 Exportar FASTA</button>
                </div>
            </div>

            <div class="tab-content" id="tab-changes">
                <h3>🔄 Codones Modificados</h3>
                <div id="changesContent"></div>
            </div>

            <div class="tab-content" id="tab-improvements">
                <h3>✅ Mejoras Aplicadas</h3>
                <ul class="improvements-list" id="improvementsList"></ul>
            </div>
        </div>
    </div>

    <script>
        const vscode = acquireVsCodeApi();
        let currentResult = null;

        function runOptimization() {
            const sequence = document.getElementById('proteinInput').value.trim();
            if (!sequence) { showError('Ingresa una secuencia de aminoácidos'); return; }
            
            const btn = document.getElementById('optimizeBtn');
            btn.disabled = true;
            btn.innerHTML = '<span class="spinner"></span> Optimizando...';
            hideError();

            vscode.postMessage({
                command: 'optimize',
                sequence: sequence,
                host: document.getElementById('hostSelect').value,
                options: {
                    avoidRestriction: document.getElementById('optRestriction').checked,
                    balanceGC: document.getElementById('optGC').checked,
                    avoidHomopolymers: document.getElementById('optHomopolymers').checked,
                }
            });
        }

        function loadFromEditor() {
            vscode.postMessage({ command: 'loadFromEditor' });
        }

        function loadExample() {
            // GFP (superfold) protein sequence
            document.getElementById('proteinInput').value = 'MSKGEELFTGVVPILVELDGDVNGHKFSVRGEGEGDATNGKLTLKFICTTGKLPVPWPTLVTTLTYGVQCFSRYPDHMKRHDFFKSAMPEGYVQERTISFKDDGTYKTRAEVKFEGDTLVNRIELKGIDFKEDGNILGHKLEYNFNSHNVYITADKQKNGIKANFKIRHNVEDGSVQLADHYQQNTPIGDGPVLLPDNHYLSTQSVLSKDPNEKRDHMVLLEFVTAAGITHGMDELYK';
        }

        function copySequence() {
            if (currentResult) {
                vscode.postMessage({ command: 'copySequence', sequence: currentResult.optimizedSequence });
            }
        }

        function exportFasta() {
            if (currentResult) {
                vscode.postMessage({ command: 'exportFasta', name: 'codon_optimized', sequence: currentResult.optimizedSequence });
            }
        }

        function switchTab(tab) {
            document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
            document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
            event.target.classList.add('active');
            document.getElementById('tab-' + tab).classList.add('active');
        }

        function showError(msg) {
            const el = document.getElementById('errorMsg');
            el.textContent = msg;
            el.classList.add('show');
        }

        function hideError() {
            document.getElementById('errorMsg').classList.remove('show');
        }

        function renderResults(result) {
            currentResult = result;
            const stats = result.stats;

            // Stats grid
            const caiClass = stats.caiAfter > 0.7 ? '' : stats.caiAfter > 0.5 ? 'warn' : 'bad';
            const gcClass = stats.gcAfter >= 40 && stats.gcAfter <= 60 ? '' : 'warn';

            document.getElementById('statsGrid').innerHTML = 
                '<div class="stat-card"><div class="stat-value ' + caiClass + '">' + (stats.caiAfter * 100).toFixed(1) + '%</div><div class="stat-label">CAI Score</div><div class="stat-delta">' + (stats.caiAfter > stats.caiBefore ? '↑' : '') + ' de ' + (stats.caiBefore * 100).toFixed(1) + '%</div></div>' +
                '<div class="stat-card"><div class="stat-value ' + gcClass + '">' + stats.gcAfter.toFixed(1) + '%</div><div class="stat-label">GC Content</div><div class="stat-delta">' + (Math.abs(stats.gcAfter-50) < Math.abs(stats.gcBefore-50) ? '↑ más equilibrado' : '') + '</div></div>' +
                '<div class="stat-card"><div class="stat-value">' + stats.changedCodons + '</div><div class="stat-label">Codones Modificados</div><div class="stat-delta">de ' + stats.totalCodons + ' totales</div></div>' +
                '<div class="stat-card"><div class="stat-value">' + stats.restrictionSitesRemoved + '</div><div class="stat-label">Sitios Eliminados</div><div class="stat-delta">sitios de restricción</div></div>';

            // GC bar
            const gcFill = document.getElementById('gcFill');
            gcFill.style.width = stats.gcAfter + '%';
            gcFill.style.background = (stats.gcAfter >= 40 && stats.gcAfter <= 60) ? 'linear-gradient(90deg, #a6e3a1, #94e2d5)' : 'linear-gradient(90deg, #f9e2af, #f38ba8)';
            document.getElementById('gcRange').style.left = '40%';
            document.getElementById('gcRange').style.width = '20%';

            // Sequence with highlights
            let seqHtml = '<code>';
            const naiveCodons = [];
            const optCodons = [];
            for (let i = 0; i + 3 <= result.originalSequence.length; i += 3) {
                naiveCodons.push(result.originalSequence.substring(i, i + 3));
                optCodons.push(result.optimizedSequence.substring(i, i + 3));
            }
            for (let i = 0; i < optCodons.length; i++) {
                const changed = naiveCodons[i] !== optCodons[i];
                seqHtml += '<span class="codon' + (changed ? ' changed' : '') + '">' + optCodons[i] + '</span>';
                if ((i + 1) % 20 === 0) seqHtml += '<br>';
                else if ((i + 1) % 10 === 0) seqHtml += '  ';
                else seqHtml += ' ';
            }
            seqHtml += '</code>';
            document.getElementById('seqDisplay').innerHTML = seqHtml;

            // Changes table
            if (result.codonChanges.length > 0) {
                let tableHtml = '<table class="changes-table"><thead><tr><th>Pos</th><th>AA</th><th>Original</th><th>Optimizado</th></tr></thead><tbody>';
                const maxShow = Math.min(result.codonChanges.length, 50);
                for (let i = 0; i < maxShow; i++) {
                    const c = result.codonChanges[i];
                    tableHtml += '<tr><td>' + c.position + '</td><td>' + c.aminoAcid + '</td><td style="color:#6c7086">' + c.originalCodon + '</td><td style="color:#a6e3a1">' + c.optimizedCodon + '</td></tr>';
                }
                if (result.codonChanges.length > 50) {
                    tableHtml += '<tr><td colspan="4" style="color:#a6adc8; text-align:center">... y ' + (result.codonChanges.length - 50) + ' cambios más</td></tr>';
                }
                tableHtml += '</tbody></table>';
                document.getElementById('changesContent').innerHTML = tableHtml;
            } else {
                document.getElementById('changesContent').innerHTML = '<p style="color:#a6adc8; padding: 12px;">Sin cambios necesarios — la secuencia ya está optimizada.</p>';
            }

            // Improvements list
            const list = document.getElementById('improvementsList');
            list.innerHTML = '';
            for (const imp of result.improvements) {
                const li = document.createElement('li');
                li.textContent = imp;
                list.appendChild(li);
            }
            for (const avoided of result.avoidedStructures) {
                const li = document.createElement('li');
                li.textContent = avoided;
                list.appendChild(li);
            }

            document.getElementById('results').classList.add('visible');
        }

        window.addEventListener('message', event => {
            const msg = event.data;
            switch (msg.command) {
                case 'optimizationResult':
                    document.getElementById('optimizeBtn').disabled = false;
                    document.getElementById('optimizeBtn').innerHTML = '🚀 Optimizar Codones';
                    renderResults(msg.result);
                    break;
                case 'loadedSequence':
                    document.getElementById('proteinInput').value = msg.sequence;
                    break;
                case 'error':
                    document.getElementById('optimizeBtn').disabled = false;
                    document.getElementById('optimizeBtn').innerHTML = '🚀 Optimizar Codones';
                    showError(msg.message);
                    break;
            }
        });
    </script>
</body>
</html>`;
    }

    dispose(): void {
        this.panel?.dispose();
        this.disposables.forEach(d => d.dispose());
    }
}
