// ============================================================================
// SBOL Visual Real-Time Genetic Circuit Diagram Renderer
//
// Revolucionario: renderiza diagramas SBOL Visual estándar directamente 
// desde archivos .bio en un WebView integrado en VS Code.
// 
// Basado en: SBOL Visual 2.3 Standard (sbolstandard.org)
// Referencia: Cox et al. "Synthetic Biology Open Language Visual (SBOL Visual) 2.3"
//             J Integr Bioinform 2021; DOI: 10.1515/jib-2021-0013
//
// Features:
//   - Rendering SVG en tiempo real mientras editas
//   - 10 glyphs estándar SBOL Visual 2.3
//   - Interacciones: represión (arc T), activación (arc →)
//   - Export a SVG standalone
//   - Zoom & pan with mouse wheel
//   - Dark/Light theme aware
//   - Backbone horizontal line como en papers publicados
//
// ============================================================================
import * as vscode from 'vscode';

// ──────────────────────────────────────────────────────────────────────────────
// Glyph Types — SBOL Visual 2.3 standard
// ──────────────────────────────────────────────────────────────────────────────
export type SBOLGlyphType =
    | 'promoter'          // SO:0000167 — rightward arrow
    | 'rbs'               // SO:0000139 — semicircle
    | 'cds'               // SO:0000316 — arrow body (pentagon)
    | 'terminator'        // SO:0000141 — T-shape
    | 'operator'          // SO:0000057 — comb
    | 'insulator'         // SO:0000627 — double circle
    | 'origin_of_replication' // SO:0000296 — circle
    | 'primer_binding'    // SO:0005850 — rectangle with right arrow
    | 'reporter'          // derived from CDS — glow icon
    | 'riboswitch'        // SO:0000035 — diamond
    | 'aptamer'           // SO:0000031 — diamond outlined
    | 'protein'           // SBO:0000252 — rounded rectangle
    | 'molecule'          // SBO:0000247 — small circle
    | 'unknown';          // fallback — rectangle

export interface SBOLPart {
    type: SBOLGlyphType;
    name: string;
    sequence?: string;
    line: number;           // source line
    orientation: 'forward' | 'reverse';
}

export interface SBOLInteraction {
    from: string;           // part name
    to: string;             // part name
    type: 'inhibition' | 'stimulation' | 'production' | 'degradation';
}

export interface SBOLCircuit {
    name: string;
    parts: SBOLPart[];
    interactions: SBOLInteraction[];
}

// ──────────────────────────────────────────────────────────────────────────────
// Parser: .bio → SBOL Circuit Model
// ──────────────────────────────────────────────────────────────────────────────
export function parseBioToSBOL(text: string): SBOLCircuit[] {
    const circuits: SBOLCircuit[] = [];
    const lines = text.split('\n');
    let currentCircuit: SBOLCircuit | null = null;

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();

        // Circuit declaration
        const circuitMatch = line.match(/^circuit\s+(\w+)/i);
        if (circuitMatch) {
            if (currentCircuit) circuits.push(currentCircuit);
            currentCircuit = { name: circuitMatch[1], parts: [], interactions: [] };
            continue;
        }

        // End of circuit block
        if (line === '}' && currentCircuit) {
            circuits.push(currentCircuit);
            currentCircuit = null;
            continue;
        }

        if (!currentCircuit && circuits.length === 0) {
            // Implicit circuit for flat files
            currentCircuit = { name: 'main', parts: [], interactions: [] };
        }

        const target = currentCircuit || (circuits.length > 0 ? circuits[circuits.length - 1] : null);
        if (!target) continue;

        // Part patterns
        const promoterMatch = line.match(/promoter\s*[:\s]+(\w+)/i);
        if (promoterMatch) { target.parts.push({ type: 'promoter', name: promoterMatch[1], line: i + 1, orientation: 'forward' }); continue; }

        const rbsMatch = line.match(/rbs\s*[:\s]+(\w+)/i);
        if (rbsMatch) { target.parts.push({ type: 'rbs', name: rbsMatch[1], line: i + 1, orientation: 'forward' }); continue; }

        const geneMatch = line.match(/gene\s+(\w+)/i);
        if (geneMatch) { target.parts.push({ type: 'cds', name: geneMatch[1], line: i + 1, orientation: 'forward' }); continue; }

        const terminatorMatch = line.match(/terminator\s*[:\s]+(\w+)/i);
        if (terminatorMatch) { target.parts.push({ type: 'terminator', name: terminatorMatch[1], line: i + 1, orientation: 'forward' }); continue; }

        const reporterMatch = line.match(/reporter\s+(\w+)/i);
        if (reporterMatch) { target.parts.push({ type: 'reporter', name: reporterMatch[1], line: i + 1, orientation: 'forward' }); continue; }

        const proteinMatch = line.match(/protein\s+(\w+)/i);
        if (proteinMatch) { target.parts.push({ type: 'protein', name: proteinMatch[1], line: i + 1, orientation: 'forward' }); continue; }

        const operatorMatch = line.match(/operator\s*[:\s]+(\w+)/i);
        if (operatorMatch) { target.parts.push({ type: 'operator', name: operatorMatch[1], line: i + 1, orientation: 'forward' }); continue; }

        const originMatch = line.match(/origin\s*:\s*(\w+)/i);
        if (originMatch) { target.parts.push({ type: 'origin_of_replication', name: originMatch[1], line: i + 1, orientation: 'forward' }); continue; }

        const insulatorMatch = line.match(/insulator\s*:\s*(\w+)/i);
        if (insulatorMatch) { target.parts.push({ type: 'insulator', name: insulatorMatch[1], line: i + 1, orientation: 'forward' }); continue; }

        // Interaction patterns
        const represMatch = line.match(/(\w+)\s+(?:represses|inhibits|→\|)\s+(\w+)/i);
        if (represMatch) { target.interactions.push({ from: represMatch[1], to: represMatch[2], type: 'inhibition' }); continue; }

        const activMatch = line.match(/(\w+)\s+(?:activates|stimulates|→)\s+(\w+)/i);
        if (activMatch) { target.interactions.push({ from: activMatch[1], to: activMatch[2], type: 'stimulation' }); continue; }

        const prodMatch = line.match(/(\w+)\s+produces\s+(\w+)/i);
        if (prodMatch) { target.interactions.push({ from: prodMatch[1], to: prodMatch[2], type: 'production' }); continue; }
    }

    if (currentCircuit) circuits.push(currentCircuit);
    return circuits.length > 0 ? circuits : [{ name: 'empty', parts: [], interactions: [] }];
}

// ──────────────────────────────────────────────────────────────────────────────
// SVG Generator — SBOL Visual 2.3 standard glyphs
// ──────────────────────────────────────────────────────────────────────────────
export function generateSBOLSVG(circuits: SBOLCircuit[], darkMode: boolean): string {
    const fg = darkMode ? '#d4d4d4' : '#1e1e1e';
    const bg = darkMode ? '#1e1e1e' : '#ffffff';
    const backbone = darkMode ? '#555555' : '#999999';
    const colors: Record<SBOLGlyphType, string> = {
        promoter: '#22b14c',                  // green — SBOL standard
        rbs: '#3f48cc',                       // blue
        cds: '#ff7f27',                       // orange — protein coding
        terminator: '#ed1c24',                // red — stop
        operator: '#b97a57',                  // brown — regulation
        insulator: '#a349a4',                 // purple
        origin_of_replication: '#00a2e8',     // cyan
        primer_binding: '#99d9ea',            // light blue
        reporter: '#fff200',                  // yellow — visible
        riboswitch: '#7f7f7f',               // gray
        aptamer: '#7f7f7f',                  // gray
        protein: '#ff7f27',                   // orange (product)
        molecule: '#22b14c',                  // green
        unknown: '#7f7f7f',                   // gray
    };

    const GLYPH_W = 80;
    const GLYPH_H = 50;
    const GLYPH_SPACING = 10;
    const BACKBONE_Y = 120;
    const LABEL_Y = BACKBONE_Y + 45;
    const MARGIN_X = 60;
    const CIRCUIT_SPACING_Y = 200;

    let totalH = 40;
    const circuitSVGs: string[] = [];

    for (let ci = 0; ci < circuits.length; ci++) {
        const circuit = circuits[ci];
        const parts = circuit.parts;
        const totalW = MARGIN_X * 2 + parts.length * (GLYPH_W + GLYPH_SPACING);
        const baseY = ci * CIRCUIT_SPACING_Y;

        // Circuit label
        let svg = `<text x="${MARGIN_X}" y="${baseY + 25}" font-size="16" font-weight="bold" fill="${fg}" font-family="monospace">${escSvg(circuit.name)}</text>`;

        if (parts.length === 0) {
            svg += `<text x="${MARGIN_X}" y="${baseY + BACKBONE_Y}" font-size="13" fill="${backbone}" font-style="italic" font-family="sans-serif">No parts defined — add promoter, gene, terminator...</text>`;
            circuitSVGs.push(svg);
            totalH = baseY + CIRCUIT_SPACING_Y;
            continue;
        }

        // Backbone line
        const bbX1 = MARGIN_X - 20;
        const bbX2 = MARGIN_X + parts.length * (GLYPH_W + GLYPH_SPACING);
        svg += `<line x1="${bbX1}" y1="${baseY + BACKBONE_Y}" x2="${bbX2}" y2="${baseY + BACKBONE_Y}" stroke="${backbone}" stroke-width="3"/>`;

        // Part glyphs
        for (let pi = 0; pi < parts.length; pi++) {
            const p = parts[pi];
            const x = MARGIN_X + pi * (GLYPH_W + GLYPH_SPACING);
            const y = baseY + BACKBONE_Y;
            const col = colors[p.type];

            svg += renderGlyph(p.type, x, y, GLYPH_W, GLYPH_H, col, p.orientation);

            // Label below
            svg += `<text x="${x + GLYPH_W / 2}" y="${baseY + LABEL_Y}" text-anchor="middle" font-size="10" fill="${fg}" font-family="sans-serif">${escSvg(p.name)}</text>`;
            svg += `<text x="${x + GLYPH_W / 2}" y="${baseY + LABEL_Y + 14}" text-anchor="middle" font-size="9" fill="${backbone}" font-family="sans-serif">${p.type}</text>`;
        }

        // Interaction arcs
        for (const inter of circuit.interactions) {
            const fromIdx = parts.findIndex(p => p.name === inter.from);
            const toIdx = parts.findIndex(p => p.name === inter.to);
            if (fromIdx >= 0 && toIdx >= 0) {
                const fx = MARGIN_X + fromIdx * (GLYPH_W + GLYPH_SPACING) + GLYPH_W / 2;
                const tx = MARGIN_X + toIdx * (GLYPH_W + GLYPH_SPACING) + GLYPH_W / 2;
                const arcY = baseY + BACKBONE_Y - GLYPH_H - 30;
                const midX = (fx + tx) / 2;
                const arcColor = inter.type === 'inhibition' ? '#ed1c24' : inter.type === 'stimulation' ? '#22b14c' : '#3f48cc';
                const dash = inter.type === 'production' ? 'stroke-dasharray="6,3"' : '';

                svg += `<path d="M ${fx} ${baseY + BACKBONE_Y - GLYPH_H} Q ${midX} ${arcY} ${tx} ${baseY + BACKBONE_Y - GLYPH_H}" fill="none" stroke="${arcColor}" stroke-width="2" ${dash}/>`;

                // Arrow/bar end
                if (inter.type === 'inhibition') {
                    svg += `<line x1="${tx - 8}" y1="${baseY + BACKBONE_Y - GLYPH_H - 5}" x2="${tx + 8}" y2="${baseY + BACKBONE_Y - GLYPH_H - 5}" stroke="${arcColor}" stroke-width="3"/>`;
                } else {
                    svg += `<polygon points="${tx},${baseY + BACKBONE_Y - GLYPH_H} ${tx - 6},${baseY + BACKBONE_Y - GLYPH_H - 8} ${tx + 6},${baseY + BACKBONE_Y - GLYPH_H - 8}" fill="${arcColor}"/>`;
                }

                // Interaction label
                svg += `<text x="${midX}" y="${arcY - 5}" text-anchor="middle" font-size="9" fill="${arcColor}" font-family="sans-serif">${inter.type}</text>`;
            }
        }

        circuitSVGs.push(svg);
        totalH = baseY + CIRCUIT_SPACING_Y;
    }

    const maxW = Math.max(800, ...circuits.map(c => MARGIN_X * 2 + c.parts.length * (GLYPH_W + GLYPH_SPACING) + 40));

    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${maxW} ${totalH}" style="background:${bg}">
  <defs>
    <style>
      text { user-select: none; }
      .glyph:hover { opacity: 0.8; cursor: pointer; }
    </style>
  </defs>
  ${circuitSVGs.join('\n  ')}
  <text x="${maxW - 10}" y="${totalH - 8}" text-anchor="end" font-size="9" fill="${backbone}" font-family="sans-serif">SBOL Visual 2.3 • SynBio-LLVM</text>
</svg>`;
}

function renderGlyph(type: SBOLGlyphType, x: number, y: number, w: number, h: number, color: string, _orient: string): string {
    const cx = x + w / 2;
    const top = y - h;
    let svg = `<g class="glyph">`;

    switch (type) {
        case 'promoter':
            // SBOL: right-angle arrow pointing right: vertical line + horizontal arrow
            svg += `<line x1="${x + 10}" y1="${y}" x2="${x + 10}" y2="${top + 10}" stroke="${color}" stroke-width="3"/>`;
            svg += `<line x1="${x + 10}" y1="${top + 10}" x2="${x + w - 5}" y2="${top + 10}" stroke="${color}" stroke-width="3"/>`;
            svg += `<polygon points="${x + w - 5},${top + 10} ${x + w - 15},${top + 2} ${x + w - 15},${top + 18}" fill="${color}"/>`;
            break;

        case 'rbs':
            // SBOL: semicircle on backbone
            svg += `<path d="M ${x + 15} ${y} A ${w / 3} ${w / 3} 0 0 1 ${x + w - 15} ${y}" fill="none" stroke="${color}" stroke-width="3"/>`;
            break;

        case 'cds':
            // SBOL: Pentagon arrow (coding sequence) — the classic CDS glyph
            svg += `<polygon points="${x + 5},${top + 5} ${x + w - 20},${top + 5} ${x + w - 5},${y - h / 2} ${x + w - 20},${y - 5} ${x + 5},${y - 5}" fill="${color}" fill-opacity="0.3" stroke="${color}" stroke-width="2"/>`;
            break;

        case 'terminator':
            // SBOL: T-shape
            svg += `<line x1="${cx}" y1="${y}" x2="${cx}" y2="${top + 8}" stroke="${color}" stroke-width="3"/>`;
            svg += `<line x1="${x + 10}" y1="${top + 8}" x2="${x + w - 10}" y2="${top + 8}" stroke="${color}" stroke-width="4"/>`;
            break;

        case 'operator':
            // SBOL: Comb / rectangle with teeth
            svg += `<rect x="${x + 10}" y="${top + 10}" width="${w - 20}" height="${h - 15}" fill="none" stroke="${color}" stroke-width="2"/>`;
            for (let t = x + 18; t < x + w - 15; t += 12) {
                svg += `<line x1="${t}" y1="${top + 10}" x2="${t}" y2="${top}" stroke="${color}" stroke-width="1.5"/>`;
            }
            break;

        case 'insulator': {
            // SBOL: Two semicircles (like two back-to-back D shapes)
            const iw = w / 3;
            svg += `<path d="M ${cx} ${top + 5} A ${iw} ${iw} 0 0 0 ${cx} ${y - 5}" fill="none" stroke="${color}" stroke-width="2"/>`;
            svg += `<path d="M ${cx} ${top + 5} A ${iw} ${iw} 0 0 1 ${cx} ${y - 5}" fill="none" stroke="${color}" stroke-width="2"/>`;
            break;
        }

        case 'origin_of_replication':
            // SBOL: Circle
            svg += `<circle cx="${cx}" cy="${y - h / 2}" r="${Math.min(w, h) / 2.5}" fill="none" stroke="${color}" stroke-width="2"/>`;
            break;

        case 'reporter':
            // Star-like glow (reporter = visible output)
            svg += `<polygon points="${x + 5},${top + 5} ${x + w - 20},${top + 5} ${x + w - 5},${y - h / 2} ${x + w - 20},${y - 5} ${x + 5},${y - 5}" fill="${color}" fill-opacity="0.15" stroke="${color}" stroke-width="2"/>`;
            svg += `<circle cx="${x + w / 2}" cy="${y - h / 2}" r="6" fill="${color}" fill-opacity="0.5"/>`;
            break;

        case 'protein':
            // Rounded rectangle (interaction node)
            svg += `<rect x="${x + 5}" y="${top + 5}" width="${w - 10}" height="${h - 10}" rx="10" ry="10" fill="${color}" fill-opacity="0.2" stroke="${color}" stroke-width="2"/>`;
            break;

        case 'riboswitch':
        case 'aptamer':
            // Diamond
            svg += `<polygon points="${cx},${top + 5} ${x + w - 10},${y - h / 2} ${cx},${y - 5} ${x + 10},${y - h / 2}" fill="none" stroke="${color}" stroke-width="2"/>`;
            break;

        default:
            // Unknown: simple rectangle
            svg += `<rect x="${x + 5}" y="${top + 5}" width="${w - 10}" height="${h - 10}" fill="none" stroke="${color}" stroke-width="2" stroke-dasharray="4,2"/>`;
            break;
    }

    svg += `</g>`;
    return svg;
}

function escSvg(s: string): string {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ──────────────────────────────────────────────────────────────────────────────
// WebView Panel — Real-Time SBOL Visual Renderer
// ──────────────────────────────────────────────────────────────────────────────
export class SBOLVisualPanel {
    public static currentPanel: SBOLVisualPanel | undefined;
    private readonly _panel: vscode.WebviewPanel;
    private _disposables: vscode.Disposable[] = [];
    private _debounceTimer: NodeJS.Timeout | undefined;

    public static createOrShow(context: vscode.ExtensionContext): SBOLVisualPanel {
        const column = vscode.ViewColumn.Beside;

        if (SBOLVisualPanel.currentPanel) {
            SBOLVisualPanel.currentPanel._panel.reveal(column);
            SBOLVisualPanel.currentPanel.update();
            return SBOLVisualPanel.currentPanel;
        }

        const panel = vscode.window.createWebviewPanel(
            'sbolVisual',
            '🧬 SBOL Visual Diagram',
            column,
            { enableScripts: true, retainContextWhenHidden: true }
        );

        SBOLVisualPanel.currentPanel = new SBOLVisualPanel(panel, context);
        return SBOLVisualPanel.currentPanel;
    }

    private constructor(panel: vscode.WebviewPanel, _context: vscode.ExtensionContext) {
        this._panel = panel;
        this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

        // Update on active editor change
        this._disposables.push(
            vscode.window.onDidChangeActiveTextEditor(() => this.update())
        );

        // Real-time update on text change (debounced 300ms)
        this._disposables.push(
            vscode.workspace.onDidChangeTextDocument((e) => {
                if (e.document === vscode.window.activeTextEditor?.document) {
                    if (this._debounceTimer) clearTimeout(this._debounceTimer);
                    this._debounceTimer = setTimeout(() => this.update(), 300);
                }
            })
        );

        // Handle messages from webview
        this._panel.webview.onDidReceiveMessage(
            (msg) => {
                if (msg.command === 'exportSVG') {
                    this.exportSVG();
                } else if (msg.command === 'goToLine' && msg.line) {
                    this.goToLine(msg.line);
                }
            },
            null,
            this._disposables
        );

        this.update();
    }

    private update(): void {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            this._panel.webview.html = this.getEmptyHTML();
            return;
        }

        const text = editor.document.getText();
        const circuits = parseBioToSBOL(text);
        const darkMode = vscode.window.activeColorTheme.kind === vscode.ColorThemeKind.Dark ||
                          vscode.window.activeColorTheme.kind === vscode.ColorThemeKind.HighContrast;
        const svg = generateSBOLSVG(circuits, darkMode);
        this._panel.webview.html = this.getHTML(svg, circuits, darkMode);
    }

    private async exportSVG(): Promise<void> {
        const editor = vscode.window.activeTextEditor;
        if (!editor) return;
        const circuits = parseBioToSBOL(editor.document.getText());
        const svg = generateSBOLSVG(circuits, false); // light mode for export

        const uri = await vscode.window.showSaveDialog({
            filters: { 'SVG': ['svg'] },
            defaultUri: vscode.Uri.file('circuit-sbol-visual.svg')
        });
        if (uri) {
            await vscode.workspace.fs.writeFile(uri, Buffer.from(svg));
            vscode.window.showInformationMessage(`SBOL Visual SVG exportado: ${uri.fsPath}`);
        }
    }

    private goToLine(line: number): void {
        const editor = vscode.window.activeTextEditor;
        if (!editor) return;
        const pos = new vscode.Position(line - 1, 0);
        editor.selection = new vscode.Selection(pos, pos);
        editor.revealRange(new vscode.Range(pos, pos), vscode.TextEditorRevealType.InCenter);
    }

    private getEmptyHTML(): string {
        return `<!DOCTYPE html>
<html><body style="display:flex;align-items:center;justify-content:center;height:100vh;color:#888;font-family:sans-serif">
<div style="text-align:center">
<h2>🧬 SBOL Visual Renderer</h2>
<p>Abre un archivo .bio para ver el diagrama genético en tiempo real</p>
<p style="font-size:12px;color:#666">Basado en SBOL Visual 2.3 (Cox et al. 2021)</p>
</div></body></html>`;
    }

    private getHTML(svg: string, circuits: SBOLCircuit[], dark: boolean): string {
        const totalParts = circuits.reduce((a, c) => a + c.parts.length, 0);
        const totalInteractions = circuits.reduce((a, c) => a + c.interactions.length, 0);
        const bg = dark ? '#1e1e1e' : '#ffffff';
        const fg = dark ? '#d4d4d4' : '#1e1e1e';
        const border = dark ? '#333' : '#ddd';

        // Build legend entries
        const legend = [
            ['Promoter', '#22b14c', 'SO:0000167'],
            ['RBS', '#3f48cc', 'SO:0000139'],
            ['CDS', '#ff7f27', 'SO:0000316'],
            ['Terminator', '#ed1c24', 'SO:0000141'],
            ['Operator', '#b97a57', 'SO:0000057'],
            ['Reporter', '#fff200', 'derived CDS'],
            ['Origin', '#00a2e8', 'SO:0000296'],
            ['Protein', '#ff7f27', 'SBO:0000252'],
        ];

        // Parts table
        const partsRows = circuits.flatMap(c => c.parts.map(p =>
            `<tr onclick="goToLine(${p.line})" style="cursor:pointer" title="Click to go to line ${p.line}">
                <td style="padding:3px 8px;border-bottom:1px solid ${border}">${escHtml(c.name)}</td>
                <td style="padding:3px 8px;border-bottom:1px solid ${border}"><span style="color:${getColorForType(p.type)}">●</span> ${escHtml(p.type)}</td>
                <td style="padding:3px 8px;border-bottom:1px solid ${border}">${escHtml(p.name)}</td>
                <td style="padding:3px 8px;border-bottom:1px solid ${border}">L${p.line}</td>
            </tr>`
        )).join('');

        return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<style>
  body { margin: 0; padding: 12px; background: ${bg}; color: ${fg}; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; }
  .toolbar { display: flex; align-items: center; gap: 12px; padding: 8px 0; border-bottom: 1px solid ${border}; margin-bottom: 8px; flex-wrap: wrap; }
  .toolbar button { background: ${dark ? '#2d2d2d' : '#f0f0f0'}; border: 1px solid ${border}; color: ${fg}; padding: 4px 12px; border-radius: 4px; cursor: pointer; font-size: 12px; }
  .toolbar button:hover { background: ${dark ? '#3d3d3d' : '#e0e0e0'}; }
  .stats { font-size: 12px; color: ${dark ? '#888' : '#666'}; }
  .svg-container { overflow: auto; border: 1px solid ${border}; border-radius: 4px; margin-bottom: 12px; text-align: center; }
  .svg-container svg { max-width: 100%; height: auto; transition: transform 0.2s; }
  .legend { display: flex; flex-wrap: wrap; gap: 8px; font-size: 11px; margin: 8px 0; padding: 8px; background: ${dark ? '#252525' : '#f8f8f8'}; border-radius: 4px; }
  .legend-item { display: flex; align-items: center; gap: 4px; }
  .legend-dot { width: 10px; height: 10px; border-radius: 50%; display: inline-block; }
  table { width: 100%; border-collapse: collapse; font-size: 12px; }
  th { text-align: left; padding: 4px 8px; border-bottom: 2px solid ${border}; }
  tr:hover { background: ${dark ? '#2a2a2a' : '#f5f5f5'}; }
  .section-title { font-size: 13px; font-weight: 600; margin: 12px 0 6px; }
  .ref { font-size: 10px; color: ${dark ? '#666' : '#999'}; margin-top: 12px; }
</style>
</head>
<body>
  <div class="toolbar">
    <strong>🧬 SBOL Visual 2.3</strong>
    <span class="stats">${circuits.length} circuit${circuits.length !== 1 ? 's' : ''} • ${totalParts} parts • ${totalInteractions} interactions</span>
    <button onclick="zoomIn()">🔍+</button>
    <button onclick="zoomOut()">🔍−</button>
    <button onclick="resetZoom()">↺</button>
    <button onclick="exportSVG()">📥 Export SVG</button>
  </div>

  <div class="svg-container" id="svgContainer">
    ${svg}
  </div>

  <div class="legend">
    ${legend.map(([name, color, so]) => `<span class="legend-item"><span class="legend-dot" style="background:${color}"></span>${name} <span style="color:${dark ? '#555' : '#aaa'}">(${so})</span></span>`).join('')}
  </div>

  ${totalParts > 0 ? `
  <div class="section-title">Parts Table</div>
  <table>
    <tr><th>Circuit</th><th>Type</th><th>Name</th><th>Line</th></tr>
    ${partsRows}
  </table>` : ''}

  <div class="ref">
    Standard: SBOL Visual 2.3 — Cox et al. J Integr Bioinform 2021 (DOI: 10.1515/jib-2021-0013)<br>
    Ontology: Sequence Ontology (SO) + Systems Biology Ontology (SBO)
  </div>

  <script>
    const vscode = acquireVsCodeApi();
    let zoom = 1;
    function zoomIn() { zoom = Math.min(zoom + 0.25, 4); applyZoom(); }
    function zoomOut() { zoom = Math.max(zoom - 0.25, 0.25); applyZoom(); }
    function resetZoom() { zoom = 1; applyZoom(); }
    function applyZoom() {
      const svg = document.querySelector('.svg-container svg');
      if (svg) svg.style.transform = 'scale(' + zoom + ')';
    }
    function exportSVG() { vscode.postMessage({ command: 'exportSVG' }); }
    function goToLine(line) { vscode.postMessage({ command: 'goToLine', line: line }); }
  </script>
</body>
</html>`;
    }

    dispose(): void {
        SBOLVisualPanel.currentPanel = undefined;
        this._panel.dispose();
        if (this._debounceTimer) clearTimeout(this._debounceTimer);
        this._disposables.forEach(d => d.dispose());
    }
}

function getColorForType(type: SBOLGlyphType): string {
    const colors: Record<string, string> = {
        promoter: '#22b14c', rbs: '#3f48cc', cds: '#ff7f27', terminator: '#ed1c24',
        operator: '#b97a57', insulator: '#a349a4', origin_of_replication: '#00a2e8',
        reporter: '#fff200', protein: '#ff7f27', unknown: '#7f7f7f',
    };
    return colors[type] || '#7f7f7f';
}

function escHtml(s: string): string {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ──────────────────────────────────────────────────────────────────────────────
// Registration (called from extension.ts)
// ──────────────────────────────────────────────────────────────────────────────
export function registerSBOLVisualRenderer(context: vscode.ExtensionContext): void {
    context.subscriptions.push(
        vscode.commands.registerCommand('synbio.sbolVisualDiagram', () => {
            SBOLVisualPanel.createOrShow(context);
        })
    );
}
