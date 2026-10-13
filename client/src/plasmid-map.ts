// ============================================================================
// Plasmid Map Viewer — Visualización circular/linear de plásmidos
// SVG interactivo con anotaciones, sitios de restricción, ORFs, features
// Basado en estándares SBOL Visual (Myers et al. 2017 ACS Synth Biol)
// ============================================================================
import * as vscode from 'vscode';

// ──────────────────────────────────────────────────────────────────────────────
// Vectores comunes de clonación — datos reales
// ──────────────────────────────────────────────────────────────────────────────
export interface PlasmidVector {
    name: string;
    size: number; // bp
    features: PlasmidFeature[];
    origin: string;
    resistance: string[];
    description: string;
}

export interface PlasmidFeature {
    name: string;
    type: 'promoter' | 'gene' | 'terminator' | 'origin' | 'resistance' | 'mcs' | 'reporter' | 'tag' | 'operator' | 'rbs';
    start: number;
    end: number;
    strand: '+' | '-';
    color: string;
    description: string;
}

export const COMMON_VECTORS: Record<string, PlasmidVector> = {
    pUC19: {
        name: 'pUC19',
        size: 2686,
        origin: 'pMB1 (high copy, ~500-700)',
        resistance: ['Ampicillin (bla)'],
        description: 'Vector de clonación de alto número de copias. Yanisch-Perron et al. 1985 Gene.',
        features: [
            { name: 'lacZ-α', type: 'reporter', start: 396, end: 816, strand: '+', color: '#2196F3', description: 'β-galactosidasa fragmento α (blue/white screening)' },
            { name: 'MCS', type: 'mcs', start: 396, end: 452, strand: '+', color: '#FF9800', description: 'Multiple Cloning Site (13 sitios únicos)' },
            { name: 'Plac', type: 'promoter', start: 507, end: 568, strand: '+', color: '#4CAF50', description: 'Promotor lac, inducible por IPTG' },
            { name: 'bla (AmpR)', type: 'resistance', start: 1629, end: 2489, strand: '-', color: '#F44336', description: 'β-lactamasa, resistencia a ampicilina' },
            { name: 'ori (pMB1)', type: 'origin', start: 900, end: 1534, strand: '+', color: '#9C27B0', description: 'Origen de replicación pMB1, alto número de copias' },
        ]
    },
    pET28a: {
        name: 'pET-28a(+)',
        size: 5369,
        origin: 'pBR322 (medium copy, ~15-20)',
        resistance: ['Kanamycin (kan)'],
        description: 'Vector de expresión T7. Studier & Moffatt 1986 J Mol Biol. Novagen/EMD Millipore.',
        features: [
            { name: 'T7 promoter', type: 'promoter', start: 370, end: 386, strand: '+', color: '#4CAF50', description: 'Promotor T7, requiere BL21(DE3)' },
            { name: 'T7 terminator', type: 'terminator', start: 26, end: 72, strand: '+', color: '#795548', description: 'Terminador T7' },
            { name: 'lacI', type: 'gene', start: 773, end: 1855, strand: '-', color: '#03A9F4', description: 'Represor lac para regulación IPTG' },
            { name: 'kan', type: 'resistance', start: 3995, end: 4810, strand: '+', color: '#F44336', description: 'Aminoglucósido fosfotransferasa (KanR)' },
            { name: 'ori (pBR322)', type: 'origin', start: 3198, end: 3832, strand: '+', color: '#9C27B0', description: 'Origen de replicación pBR322' },
            { name: 'f1 ori', type: 'origin', start: 4903, end: 5358, strand: '+', color: '#E91E63', description: 'Origen de replicación fago f1 (ssDNA)' },
            { name: 'His-tag (N)', type: 'tag', start: 270, end: 288, strand: '+', color: '#FF5722', description: '6xHis tag N-terminal' },
            { name: 'His-tag (C)', type: 'tag', start: 140, end: 158, strand: '+', color: '#FF5722', description: '6xHis tag C-terminal' },
            { name: 'lac operator', type: 'operator', start: 387, end: 410, strand: '+', color: '#CDDC39', description: 'Operador lac, represión por LacI' },
            { name: 'RBS', type: 'rbs', start: 303, end: 315, strand: '+', color: '#009688', description: 'Ribosome Binding Site' },
            { name: 'MCS', type: 'mcs', start: 158, end: 270, strand: '+', color: '#FF9800', description: 'Multiple Cloning Site (NcoI → XhoI)' },
        ]
    },
    pSB1C3: {
        name: 'pSB1C3',
        size: 2070,
        origin: 'pMB1 (high copy)',
        resistance: ['Chloramphenicol (cat)'],
        description: 'Vector estándar iGEM. Backbone de competencia de la iGEM Foundation.',
        features: [
            { name: 'cat (CmR)', type: 'resistance', start: 1108, end: 1767, strand: '-', color: '#F44336', description: 'Cloranfenicol acetiltransferasa' },
            { name: 'ori (pMB1)', type: 'origin', start: 1, end: 600, strand: '+', color: '#9C27B0', description: 'Origen de replicación pMB1' },
            { name: 'BioBrick prefix', type: 'mcs', start: 1000, end: 1020, strand: '+', color: '#FF9800', description: 'EcoRI-NotI-XbaI prefix' },
            { name: 'BioBrick suffix', type: 'mcs', start: 1060, end: 1080, strand: '+', color: '#FF9800', description: 'SpeI-NotI-PstI suffix' },
        ]
    },
    pBAD33: {
        name: 'pBAD33',
        size: 5352,
        origin: 'p15A (medium copy, ~10-12)',
        resistance: ['Chloramphenicol (cat)'],
        description: 'Vector de expresión arabinosa. Guzman et al. 1995 J Bacteriol.',
        features: [
            { name: 'araBAD promoter', type: 'promoter', start: 230, end: 300, strand: '+', color: '#4CAF50', description: 'Promotor PBAD, inducible por L-arabinosa' },
            { name: 'araC', type: 'gene', start: 310, end: 1200, strand: '-', color: '#03A9F4', description: 'Regulador AraC' },
            { name: 'rrnB T1 terminator', type: 'terminator', start: 1300, end: 1370, strand: '+', color: '#795548', description: 'Terminador rrnB T1' },
            { name: 'cat (CmR)', type: 'resistance', start: 3600, end: 4260, strand: '-', color: '#F44336', description: 'Cloranfenicol acetiltransferasa' },
            { name: 'ori (p15A)', type: 'origin', start: 4400, end: 5100, strand: '+', color: '#9C27B0', description: 'Origen p15A, compatible con pMB1' },
        ]
    },
    pACYCDuet_1: {
        name: 'pACYCDuet-1',
        size: 4008,
        origin: 'P15A (medium copy, ~10-12)',
        resistance: ['Chloramphenicol (cat)'],
        description: 'Vector de co-expresión dual con dos MCS. Novagen/EMD Millipore.',
        features: [
            { name: 'T7-1 promoter', type: 'promoter', start: 209, end: 225, strand: '+', color: '#4CAF50', description: 'Primer promotor T7 para MCS1' },
            { name: 'T7-2 promoter', type: 'promoter', start: 851, end: 867, strand: '+', color: '#8BC34A', description: 'Segundo promotor T7 para MCS2' },
            { name: 'MCS-1', type: 'mcs', start: 225, end: 340, strand: '+', color: '#FF9800', description: 'Multiple Cloning Site 1 (6xHis)' },
            { name: 'MCS-2', type: 'mcs', start: 867, end: 970, strand: '+', color: '#FFC107', description: 'Multiple Cloning Site 2 (S-tag)' },
            { name: 'lacI', type: 'gene', start: 1200, end: 2280, strand: '-', color: '#03A9F4', description: 'Represor lac' },
            { name: 'cat (CmR)', type: 'resistance', start: 2700, end: 3360, strand: '-', color: '#F44336', description: 'Cloranfenicol acetiltransferasa' },
            { name: 'ori (P15A)', type: 'origin', start: 3500, end: 3900, strand: '+', color: '#9C27B0', description: 'Origen P15A' },
        ]
    },
    pRS426: {
        name: 'pRS426',
        size: 5726,
        origin: '2μ (high copy yeast)',
        resistance: ['Ampicillin (bla)'],
        description: 'Vector shuttle E. coli/S. cerevisiae con marcador URA3. Christianson et al. 1992 Gene.',
        features: [
            { name: 'URA3', type: 'gene', start: 200, end: 1000, strand: '+', color: '#2196F3', description: 'Marcador URA3 (auxotrofía uracilo)' },
            { name: '2μ origin', type: 'origin', start: 1200, end: 2500, strand: '+', color: '#9C27B0', description: 'Origen de replicación 2μ (levadura)' },
            { name: 'bla (AmpR)', type: 'resistance', start: 3200, end: 4060, strand: '-', color: '#F44336', description: 'β-lactamasa (selección en E. coli)' },
            { name: 'ori (pMB1)', type: 'origin', start: 4200, end: 4800, strand: '+', color: '#E91E63', description: 'Origen pMB1 (replicación en E. coli)' },
            { name: 'MCS', type: 'mcs', start: 30, end: 150, strand: '+', color: '#FF9800', description: 'Multiple Cloning Site' },
        ]
    }
};

// ──────────────────────────────────────────────────────────────────────────────
// Clase principal del Plasmid Map Viewer
// ──────────────────────────────────────────────────────────────────────────────
export class PlasmidMapViewer {
    private panel: vscode.WebviewPanel | undefined;

    constructor(private context: vscode.ExtensionContext) {}

    show(): void {
        if (this.panel) {
            this.panel.reveal();
            return;
        }

        this.panel = vscode.window.createWebviewPanel(
            'synbioPlasmidMap',
            '🧬 Mapa de Plásmido',
            vscode.ViewColumn.Two,
            { enableScripts: true, retainContextWhenHidden: true }
        );

        this.panel.webview.html = this.getWebviewContent();

        this.panel.webview.onDidReceiveMessage(msg => {
            switch (msg.type) {
                case 'selectVector':
                    this.sendVectorData(msg.vectorId);
                    break;
                case 'exportSVG':
                    this.exportSVG(msg.svg);
                    break;
                case 'parseFromEditor':
                    this.parseCurrentEditor();
                    break;
            }
        });

        this.panel.onDidDispose(() => { this.panel = undefined; });
    }

    private sendVectorData(vectorId: string): void {
        const vector = COMMON_VECTORS[vectorId];
        if (vector && this.panel) {
            this.panel.webview.postMessage({ type: 'vectorData', vector });
        }
    }

    private async exportSVG(svgContent: string): Promise<void> {
        const uri = await vscode.window.showSaveDialog({
            filters: { 'SVG': ['svg'] },
            defaultUri: vscode.Uri.file('plasmid-map.svg')
        });
        if (uri) {
            await vscode.workspace.fs.writeFile(uri, Buffer.from(svgContent, 'utf8'));
            vscode.window.showInformationMessage(`Mapa de plásmido exportado: ${uri.fsPath}`);
        }
    }

    private async parseCurrentEditor(): Promise<void> {
        const editor = vscode.window.activeTextEditor;
        if (!editor) { return; }
        const text = editor.document.getText();
        const features = this.parseBioFileForFeatures(text);
        if (this.panel && features.length > 0) {
            const customVector: PlasmidVector = {
                name: editor.document.fileName.split(/[/\\]/).pop() || 'Custom',
                size: this.estimateSize(features),
                features,
                origin: 'Detected from .bio file',
                resistance: [],
                description: 'Plásmido construido desde archivo .bio'
            };
            this.panel.webview.postMessage({ type: 'vectorData', vector: customVector });
        }
    }

    private parseBioFileForFeatures(text: string): PlasmidFeature[] {
        const features: PlasmidFeature[] = [];
        let pos = 0;
        const lines = text.split('\n');

        for (const line of lines) {
            const geneMatch = line.match(/\bgene\s+(\w+)/i);
            if (geneMatch) {
                const len = 900; // estimado CDS promedio
                features.push({
                    name: geneMatch[1], type: 'gene', start: pos, end: pos + len,
                    strand: '+', color: '#2196F3', description: `Gen ${geneMatch[1]}`
                });
                pos += len + 50;
            }
            const promMatch = line.match(/\bpromoter\s+(\w+)/i);
            if (promMatch) {
                features.push({
                    name: promMatch[1], type: 'promoter', start: pos, end: pos + 150,
                    strand: '+', color: '#4CAF50', description: `Promotor ${promMatch[1]}`
                });
                pos += 200;
            }
            const termMatch = line.match(/\bterminator\s+(\w+)/i);
            if (termMatch) {
                features.push({
                    name: termMatch[1], type: 'terminator', start: pos, end: pos + 80,
                    strand: '+', color: '#795548', description: `Terminador ${termMatch[1]}`
                });
                pos += 130;
            }
        }
        return features;
    }

    private estimateSize(features: PlasmidFeature[]): number {
        if (features.length === 0) { return 3000; }
        const maxEnd = Math.max(...features.map(f => f.end));
        return Math.max(maxEnd + 500, 2000);
    }

    private getWebviewContent(): string {
        const vectorOptions = Object.entries(COMMON_VECTORS)
            .map(([id, v]) => `<option value="${id}">${v.name} (${v.size} bp) — ${v.resistance.join(', ')}</option>`)
            .join('\n');

        return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Plasmid Map Viewer</title>
<style>
:root {
    --bg: #1e1e2e; --surface: #181825; --text: #cdd6f4;
    --accent: #89b4fa; --border: #313244; --green: #a6e3a1;
    --red: #f38ba8; --yellow: #f9e2af; --mauve: #cba6f7;
}
* { margin: 0; padding: 0; box-sizing: border-box; }
body { font-family: 'Segoe UI', system-ui, sans-serif; background: var(--bg); color: var(--text); padding: 16px; }
.header { display: flex; align-items: center; gap: 16px; margin-bottom: 16px; flex-wrap: wrap; }
.header h1 { font-size: 18px; color: var(--accent); }
select, button { background: var(--surface); color: var(--text); border: 1px solid var(--border); padding: 8px 16px; border-radius: 6px; font-size: 13px; cursor: pointer; }
select:hover, button:hover { border-color: var(--accent); }
button.primary { background: var(--accent); color: var(--bg); font-weight: 600; }
.controls { display: flex; gap: 8px; flex-wrap: wrap; }
.map-container { display: flex; gap: 16px; flex-wrap: wrap; }
.svg-panel { flex: 1; min-width: 450px; background: var(--surface); border: 1px solid var(--border); border-radius: 12px; padding: 20px; text-align: center; }
.info-panel { width: 320px; background: var(--surface); border: 1px solid var(--border); border-radius: 12px; padding: 16px; overflow-y: auto; max-height: 600px; }
.info-panel h3 { color: var(--accent); margin-bottom: 12px; font-size: 15px; }
.vector-info { margin-bottom: 16px; }
.vector-info .stat { display: flex; justify-content: space-between; padding: 6px 0; border-bottom: 1px solid var(--border); font-size: 12px; }
.vector-info .stat .label { color: #a6adc8; }
.feature-list { list-style: none; }
.feature-list li { padding: 8px; margin-bottom: 4px; border-radius: 6px; border-left: 4px solid transparent; font-size: 12px; cursor: pointer; transition: background 0.2s; }
.feature-list li:hover { background: rgba(137,180,250,0.1); }
.feature-list li .feat-name { font-weight: 600; }
.feature-list li .feat-range { color: #a6adc8; font-size: 11px; }
.feature-list li .feat-desc { color: #bac2de; font-size: 11px; margin-top: 2px; }
.view-toggle { display: flex; gap: 4px; }
.view-toggle button { padding: 6px 14px; font-size: 12px; }
.view-toggle button.active { background: var(--accent); color: var(--bg); }
svg text { font-family: 'Segoe UI', sans-serif; }
.legend { margin-top: 16px; display: flex; flex-wrap: wrap; gap: 8px; }
.legend-item { display: flex; align-items: center; gap: 4px; font-size: 11px; }
.legend-dot { width: 12px; height: 12px; border-radius: 3px; }
</style>
</head>
<body>
<div class="header">
    <h1>🧬 Mapa de Plásmido</h1>
    <select id="vectorSelect">
        <option value="">— Seleccionar vector —</option>
        ${vectorOptions}
    </select>
    <div class="controls">
        <button onclick="parseFromEditor()">📄 Desde Editor</button>
        <div class="view-toggle">
            <button id="btnCircular" class="active" onclick="setView('circular')">Circular</button>
            <button id="btnLinear" onclick="setView('linear')">Linear</button>
        </div>
        <button onclick="exportSVG()">💾 Exportar SVG</button>
    </div>
</div>
<div class="map-container">
    <div class="svg-panel">
        <div id="svgContainer"></div>
    </div>
    <div class="info-panel">
        <h3 id="vectorName">Selecciona un vector</h3>
        <div class="vector-info" id="vectorInfo"></div>
        <h3>Features</h3>
        <ul class="feature-list" id="featureList"></ul>
        <div class="legend">
            <div class="legend-item"><div class="legend-dot" style="background:#4CAF50"></div>Promotor</div>
            <div class="legend-item"><div class="legend-dot" style="background:#2196F3"></div>Gen/CDS</div>
            <div class="legend-item"><div class="legend-dot" style="background:#795548"></div>Terminador</div>
            <div class="legend-item"><div class="legend-dot" style="background:#F44336"></div>Resistencia</div>
            <div class="legend-item"><div class="legend-dot" style="background:#9C27B0"></div>Origen</div>
            <div class="legend-item"><div class="legend-dot" style="background:#FF9800"></div>MCS</div>
            <div class="legend-item"><div class="legend-dot" style="background:#FF5722"></div>Tag</div>
            <div class="legend-item"><div class="legend-dot" style="background:#CDDC39"></div>Operador</div>
            <div class="legend-item"><div class="legend-dot" style="background:#009688"></div>RBS</div>
        </div>
    </div>
</div>

<script>
const vscode = acquireVsCodeApi();
let currentVector = null;
let currentView = 'circular';

document.getElementById('vectorSelect').addEventListener('change', (e) => {
    const id = e.target.value;
    if (id) vscode.postMessage({ type: 'selectVector', vectorId: id });
});

function setView(view) {
    currentView = view;
    document.getElementById('btnCircular').classList.toggle('active', view === 'circular');
    document.getElementById('btnLinear').classList.toggle('active', view === 'linear');
    if (currentVector) renderMap(currentVector);
}

function parseFromEditor() {
    vscode.postMessage({ type: 'parseFromEditor' });
}

function exportSVG() {
    const svg = document.querySelector('#svgContainer svg');
    if (svg) {
        vscode.postMessage({ type: 'exportSVG', svg: svg.outerHTML });
    }
}

window.addEventListener('message', (event) => {
    const msg = event.data;
    if (msg.type === 'vectorData') {
        currentVector = msg.vector;
        renderMap(msg.vector);
        renderInfo(msg.vector);
    }
});

function renderMap(vector) {
    if (currentView === 'circular') renderCircular(vector);
    else renderLinear(vector);
}

function renderCircular(vector) {
    const W = 500, H = 500;
    const cx = W / 2, cy = H / 2, R = 180;
    let svg = \`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 \${W} \${H}" width="\${W}" height="\${H}">\`;

    // Background
    svg += \`<rect width="\${W}" height="\${H}" fill="#181825" rx="12"/>\`;

    // Main backbone circle
    svg += \`<circle cx="\${cx}" cy="\${cy}" r="\${R}" fill="none" stroke="#585b70" stroke-width="3"/>\`;

    // Size label
    svg += \`<text x="\${cx}" y="\${cy - 10}" text-anchor="middle" fill="#cdd6f4" font-size="16" font-weight="bold">\${vector.name}</text>\`;
    svg += \`<text x="\${cx}" y="\${cy + 12}" text-anchor="middle" fill="#a6adc8" font-size="13">\${vector.size} bp</text>\`;

    // Tick marks every 500bp
    const tickInterval = vector.size > 5000 ? 1000 : 500;
    for (let bp = 0; bp < vector.size; bp += tickInterval) {
        const angle = (bp / vector.size) * 2 * Math.PI - Math.PI / 2;
        const x1 = cx + (R - 5) * Math.cos(angle);
        const y1 = cy + (R - 5) * Math.sin(angle);
        const x2 = cx + (R + 5) * Math.cos(angle);
        const y2 = cy + (R + 5) * Math.sin(angle);
        svg += \`<line x1="\${x1}" y1="\${y1}" x2="\${x2}" y2="\${y2}" stroke="#6c7086" stroke-width="1"/>\`;
        const tx = cx + (R + 18) * Math.cos(angle);
        const ty = cy + (R + 18) * Math.sin(angle);
        svg += \`<text x="\${tx}" y="\${ty}" text-anchor="middle" fill="#6c7086" font-size="8">\${bp}</text>\`;
    }

    // Features as arcs
    vector.features.forEach((feat, i) => {
        const startAngle = (feat.start / vector.size) * 2 * Math.PI - Math.PI / 2;
        const endAngle = (feat.end / vector.size) * 2 * Math.PI - Math.PI / 2;
        const innerR = feat.strand === '+' ? R + 8 : R - 20;
        const outerR = feat.strand === '+' ? R + 20 : R - 8;
        const midR = (innerR + outerR) / 2;

        // Arc path
        const x1 = cx + innerR * Math.cos(startAngle);
        const y1 = cy + innerR * Math.sin(startAngle);
        const x2 = cx + outerR * Math.cos(startAngle);
        const y2 = cy + outerR * Math.sin(startAngle);
        const x3 = cx + outerR * Math.cos(endAngle);
        const y3 = cy + outerR * Math.sin(endAngle);
        const x4 = cx + innerR * Math.cos(endAngle);
        const y4 = cy + innerR * Math.sin(endAngle);

        const largeArc = (endAngle - startAngle) > Math.PI ? 1 : 0;

        svg += \`<path d="M\${x1},\${y1} L\${x2},\${y2} A\${outerR},\${outerR} 0 \${largeArc} 1 \${x3},\${y3} L\${x4},\${y4} A\${innerR},\${innerR} 0 \${largeArc} 0 \${x1},\${y1}" fill="\${feat.color}" opacity="0.85" stroke="\${feat.color}" stroke-width="0.5" data-feat="\${i}">
            <title>\${feat.name}: \${feat.start}-\${feat.end} (\${feat.strand}) — \${feat.description}</title>
        </path>\`;

        // Label
        const midAngle = (startAngle + endAngle) / 2;
        const labelR = feat.strand === '+' ? outerR + 14 : innerR - 14;
        const lx = cx + labelR * Math.cos(midAngle);
        const ly = cy + labelR * Math.sin(midAngle);
        const angleLen = endAngle - startAngle;

        if (angleLen > 0.2) {
            const rotation = (midAngle * 180 / Math.PI);
            const flipText = rotation > 90 || rotation < -90;
            svg += \`<text x="\${lx}" y="\${ly}" text-anchor="middle" fill="\${feat.color}" font-size="9" font-weight="600" transform="rotate(\${flipText ? rotation + 180 : rotation}, \${lx}, \${ly})">\${feat.name}</text>\`;
        }

        // Direction arrow (for genes)
        if (feat.type === 'gene' || feat.type === 'resistance' || feat.type === 'reporter') {
            const arrowAngle = feat.strand === '+' ? endAngle : startAngle;
            const dir = feat.strand === '+' ? 1 : -1;
            const ax = cx + midR * Math.cos(arrowAngle);
            const ay = cy + midR * Math.sin(arrowAngle);
            svg += \`<polygon points="\${ax},\${ay - 4} \${ax + 6 * dir},\${ay} \${ax},\${ay + 4}" fill="\${feat.color}" opacity="0.9"/>\`;
        }
    });

    // Position 1 marker
    const p1x = cx, p1y = cy - R;
    svg += \`<circle cx="\${p1x}" cy="\${p1y}" r="3" fill="#f9e2af"/>\`;
    svg += \`<text x="\${p1x + 8}" y="\${p1y + 3}" fill="#f9e2af" font-size="9" font-weight="bold">1</text>\`;

    svg += \`</svg>\`;
    document.getElementById('svgContainer').innerHTML = svg;
}

function renderLinear(vector) {
    const W = 500, H = 200;
    const margin = 40, lineY = H / 2;
    const lineW = W - 2 * margin;

    let svg = \`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 \${W} \${H}" width="\${W}" height="\${H}">\`;
    svg += \`<rect width="\${W}" height="\${H}" fill="#181825" rx="12"/>\`;

    // Backbone line
    svg += \`<line x1="\${margin}" y1="\${lineY}" x2="\${W - margin}" y2="\${lineY}" stroke="#585b70" stroke-width="3"/>\`;

    // Scale
    const tickInterval = vector.size > 5000 ? 1000 : 500;
    for (let bp = 0; bp <= vector.size; bp += tickInterval) {
        const x = margin + (bp / vector.size) * lineW;
        svg += \`<line x1="\${x}" y1="\${lineY - 5}" x2="\${x}" y2="\${lineY + 5}" stroke="#6c7086" stroke-width="1"/>\`;
        svg += \`<text x="\${x}" y="\${lineY + 18}" text-anchor="middle" fill="#6c7086" font-size="8">\${bp}</text>\`;
    }

    // Features as rectangles
    vector.features.forEach((feat, i) => {
        const x1 = margin + (feat.start / vector.size) * lineW;
        const x2 = margin + (feat.end / vector.size) * lineW;
        const fw = Math.max(x2 - x1, 4);
        const fy = feat.strand === '+' ? lineY - 28 : lineY + 8;
        const fh = 20;

        // Feature rectangle with arrow
        if (feat.type === 'gene' || feat.type === 'resistance' || feat.type === 'reporter') {
            const arrowW = Math.min(8, fw / 3);
            const dir = feat.strand === '+' ? 1 : -1;
            if (feat.strand === '+') {
                svg += \`<path d="M\${x1},\${fy} L\${x2 - arrowW},\${fy} L\${x2},\${fy + fh / 2} L\${x2 - arrowW},\${fy + fh} L\${x1},\${fy + fh} Z" fill="\${feat.color}" opacity="0.85">
                    <title>\${feat.name}: \${feat.start}-\${feat.end} — \${feat.description}</title></path>\`;
            } else {
                svg += \`<path d="M\${x1 + arrowW},\${fy} L\${x2},\${fy} L\${x2},\${fy + fh} L\${x1 + arrowW},\${fy + fh} L\${x1},\${fy + fh / 2} Z" fill="\${feat.color}" opacity="0.85">
                    <title>\${feat.name}: \${feat.start}-\${feat.end} — \${feat.description}</title></path>\`;
            }
        } else {
            svg += \`<rect x="\${x1}" y="\${fy}" width="\${fw}" height="\${fh}" rx="3" fill="\${feat.color}" opacity="0.85">
                <title>\${feat.name}: \${feat.start}-\${feat.end} — \${feat.description}</title></rect>\`;
        }

        // Label
        const midX = (x1 + x2) / 2;
        if (fw > 30) {
            svg += \`<text x="\${midX}" y="\${feat.strand === '+' ? fy - 4 : fy + fh + 12}" text-anchor="middle" fill="\${feat.color}" font-size="8" font-weight="600">\${feat.name}</text>\`;
        }
    });

    // Title
    svg += \`<text x="\${W / 2}" y="20" text-anchor="middle" fill="#cdd6f4" font-size="14" font-weight="bold">\${vector.name} (\${vector.size} bp)</text>\`;

    svg += \`</svg>\`;
    document.getElementById('svgContainer').innerHTML = svg;
}

function renderInfo(vector) {
    document.getElementById('vectorName').textContent = vector.name;

    let html = \`
        <div class="stat"><span class="label">Tamaño</span><span>\${vector.size} bp</span></div>
        <div class="stat"><span class="label">Origen</span><span>\${vector.origin}</span></div>
        <div class="stat"><span class="label">Resistencia</span><span>\${vector.resistance.join(', ')}</span></div>
        <div class="stat"><span class="label">Features</span><span>\${vector.features.length}</span></div>
        <div class="stat"><span class="label">Descripción</span><span style="font-size:11px">\${vector.description}</span></div>
    \`;
    document.getElementById('vectorInfo').innerHTML = html;

    const list = document.getElementById('featureList');
    list.innerHTML = vector.features.map((f, i) => \`
        <li style="border-left-color: \${f.color}" data-feat="\${i}">
            <div class="feat-name">\${f.name}</div>
            <div class="feat-range">\${f.start}–\${f.end} bp (\${f.strand}) · \${f.type}</div>
            <div class="feat-desc">\${f.description}</div>
        </li>
    \`).join('');
}
</script>
</body>
</html>`;
    }
}
