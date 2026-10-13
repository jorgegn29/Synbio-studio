/**
 * ══════════════════════════════════════════════════════════════════
 * SynBio-LLVM — 96/384-Well Plate Layout Designer (Fase 17)
 *
 * Diseñador visual de placas multipocillo:
 *   1. Vista interactiva 96-well (8×12) y 384-well (16×24)
 *   2. Drag-select asignación de muestras, controles, blancos
 *   3. Generación de pipetting map + worklist
 *   4. Plantillas de placa (dose-response, serial dilution, checkerboard)
 *   5. Import/export CSV para plate readers (Tecan, BioTek, BMG)
 *   6. Dilution calculator integrado
 *   7. Vinculación con Growth Curve Analyzer
 *
 * Usado a diario en:
 *   - Plate reader experiments (OD600, fluorescence, luminescence)
 *   - Serial dilution assays
 *   - Antibiotic susceptibility tests (MIC)
 *   - Combinatorial screening
 * ══════════════════════════════════════════════════════════════════
 */
import * as vscode from 'vscode';

// ── Types ──────────────────────────────────────────────────────────────

export interface PlateLayout {
    id: string;
    name: string;
    format: 96 | 384;
    date: string;
    wells: Record<string, WellInfo>;
    groups: SampleGroup[];
}

interface WellInfo {
    type: 'sample' | 'positive-control' | 'negative-control' | 'blank' | 'standard' | 'empty';
    sampleName: string;
    concentration?: string;
    dilution?: string;
    color: string;
    group?: string;
    notes?: string;
}

interface SampleGroup {
    name: string;
    color: string;
    type: WellInfo['type'];
    wells: string[];
}

// ── Plate Templates ────────────────────────────────────────────────────

interface PlateTemplate {
    name: string;
    description: string;
    groups: SampleGroup[];
    wellAssignments: Record<string, Partial<WellInfo>>;
}

const PLATE_TEMPLATES: PlateTemplate[] = [
    {
        name: 'Dose-Response (8-point)',
        description: '8-point dose-response + controls, triplicates',
        groups: [
            { name: 'Standards', color: '#89b4fa', type: 'standard', wells: [] },
            { name: 'Samples', color: '#a6e3a1', type: 'sample', wells: [] },
            { name: 'Pos Control', color: '#f9e2af', type: 'positive-control', wells: [] },
            { name: 'Neg Control', color: '#f38ba8', type: 'negative-control', wells: [] },
            { name: 'Blank', color: '#6c7086', type: 'blank', wells: [] },
        ],
        wellAssignments: (() => {
            const wa: Record<string, Partial<WellInfo>> = {};
            const rows = 'ABCDEFGH';
            // Columns 1-8: dose-response, 3 replicates per row
            for (let r = 0; r < 8; r++) {
                for (let c = 1; c <= 8; c++) {
                    wa[`${rows[r]}${c}`] = { type: 'sample', sampleName: `Dose ${c}`, concentration: `${10 ** (4 - c * 0.5)} µM`, color: '#a6e3a1' };
                }
            }
            // Col 9-10: pos control
            for (let r = 0; r < 8; r++) {
                wa[`${rows[r]}9`] = { type: 'positive-control', sampleName: 'Pos Ctrl', color: '#f9e2af' };
                wa[`${rows[r]}10`] = { type: 'positive-control', sampleName: 'Pos Ctrl', color: '#f9e2af' };
            }
            // Col 11: neg control
            for (let r = 0; r < 8; r++) {
                wa[`${rows[r]}11`] = { type: 'negative-control', sampleName: 'Neg Ctrl', color: '#f38ba8' };
            }
            // Col 12: blank
            for (let r = 0; r < 8; r++) {
                wa[`${rows[r]}12`] = { type: 'blank', sampleName: 'Blank', color: '#6c7086' };
            }
            return wa;
        })(),
    },
    {
        name: 'Serial Dilution (2-fold)',
        description: '2-fold serial dilution across columns',
        groups: [
            { name: 'Dilutions', color: '#89dceb', type: 'sample', wells: [] },
            { name: 'No Treatment', color: '#f38ba8', type: 'negative-control', wells: [] },
            { name: 'Blank', color: '#6c7086', type: 'blank', wells: [] },
        ],
        wellAssignments: (() => {
            const wa: Record<string, Partial<WellInfo>> = {};
            const rows = 'ABCDEFGH';
            for (let r = 0; r < 8; r++) {
                for (let c = 1; c <= 10; c++) {
                    const dilution = Math.pow(2, c - 1);
                    wa[`${rows[r]}${c}`] = { type: 'sample', sampleName: `Sample ${rows[r]}`, dilution: `1:${dilution}`, color: '#89dceb' };
                }
                wa[`${rows[r]}11`] = { type: 'negative-control', sampleName: 'No Treatment', color: '#f38ba8' };
                wa[`${rows[r]}12`] = { type: 'blank', sampleName: 'Media', color: '#6c7086' };
            }
            return wa;
        })(),
    },
    {
        name: 'Checkerboard (2 drugs)',
        description: 'Two-drug interaction checkerboard assay for synergy testing',
        groups: [
            { name: 'Drug A + B', color: '#cba6f7', type: 'sample', wells: [] },
            { name: 'Drug A only', color: '#89b4fa', type: 'sample', wells: [] },
            { name: 'Drug B only', color: '#a6e3a1', type: 'sample', wells: [] },
            { name: 'No Drug', color: '#f38ba8', type: 'negative-control', wells: [] },
        ],
        wellAssignments: (() => {
            const wa: Record<string, Partial<WellInfo>> = {};
            const rows = 'ABCDEFGH';
            for (let r = 0; r < 8; r++) {
                for (let c = 1; c <= 12; c++) {
                    const concA = r === 7 ? 0 : Math.pow(2, 6 - r);
                    const concB = c === 12 ? 0 : Math.pow(2, 11 - c);
                    const type = concA === 0 && concB === 0 ? 'negative-control' as const : 'sample' as const;
                    const color = concA === 0 && concB === 0 ? '#f38ba8' : concA === 0 ? '#a6e3a1' : concB === 0 ? '#89b4fa' : '#cba6f7';
                    wa[`${rows[r]}${c}`] = { type, sampleName: `A:${concA} B:${concB}`, color };
                }
            }
            return wa;
        })(),
    },
    {
        name: 'Growth Curve (12h)',
        description: '8 strains × 12 timepoints, triplicates',
        groups: [
            { name: 'Strain 1-4', color: '#89b4fa', type: 'sample', wells: [] },
            { name: 'Strain 5-8', color: '#a6e3a1', type: 'sample', wells: [] },
            { name: 'Blank', color: '#6c7086', type: 'blank', wells: [] },
        ],
        wellAssignments: (() => {
            const wa: Record<string, Partial<WellInfo>> = {};
            const rows = 'ABCDEFGH';
            for (let r = 0; r < 8; r++) {
                for (let c = 1; c <= 12; c++) {
                    wa[`${rows[r]}${c}`] = { type: r < 7 ? 'sample' : 'blank', sampleName: r < 7 ? `Strain ${r + 1}` : 'Blank', color: r < 4 ? '#89b4fa' : r < 7 ? '#a6e3a1' : '#6c7086' };
                }
            }
            return wa;
        })(),
    },
];

// ── Dilution Calculator ────────────────────────────────────────────────

function computeSerialDilution(startConc: number, factor: number, steps: number): number[] {
    const concs: number[] = [];
    let c = startConc;
    for (let i = 0; i < steps; i++) { concs.push(c); c /= factor; }
    return concs;
}

function computeDilution(stockConc: number, finalConc: number, finalVol: number): { stockVol: number; diluentVol: number } {
    // C1V1 = C2V2
    const stockVol = (finalConc * finalVol) / stockConc;
    return { stockVol, diluentVol: finalVol - stockVol };
}

// ── Plate Layout Designer ──────────────────────────────────────────────

export class PlateLayoutDesigner implements vscode.Disposable {
    private panel: vscode.WebviewPanel | undefined;
    private disposables: vscode.Disposable[] = [];
    private layouts: PlateLayout[] = [];
    private currentLayout: PlateLayout | undefined;
    private storageKey = 'synbio.plateLayouts';

    constructor(private context: vscode.ExtensionContext) {
        this.layouts = context.globalState.get<PlateLayout[]>(this.storageKey, []);
    }

    activate(): void {
        this.disposables.push(
            vscode.commands.registerCommand('synbio.plateDesigner', () => this.openDesigner()),
            vscode.commands.registerCommand('synbio.plateFromTemplate', () => this.createFromTemplate()),
            vscode.commands.registerCommand('synbio.dilutionCalculator', () => this.dilutionCalc()),
            vscode.commands.registerCommand('synbio.exportPlateCSV', () => this.exportCSV()),
        );
    }

    // ── Template Creation ──────────────────────────────────────────────

    private async createFromTemplate(): Promise<void> {
        const picks = PLATE_TEMPLATES.map(t => ({
            label: t.name, description: t.description,
        }));
        const pick = await vscode.window.showQuickPick(picks, {
            placeHolder: 'Selecciona plantilla de placa',
            title: '🧫 Plate Templates',
        });
        if (!pick) { return; }
        const template = PLATE_TEMPLATES.find(t => t.name === pick.label)!;

        const name = await vscode.window.showInputBox({
            prompt: 'Nombre de la placa',
            value: `${template.name} — ${new Date().toLocaleDateString('es-ES')}`,
        });
        if (!name) { return; }

        const wells: Record<string, WellInfo> = {};
        for (const [wellId, partial] of Object.entries(template.wellAssignments)) {
            wells[wellId] = {
                type: partial.type || 'empty',
                sampleName: partial.sampleName || '',
                concentration: partial.concentration,
                dilution: partial.dilution,
                color: partial.color || '#6c7086',
            };
        }

        this.currentLayout = {
            id: `PLT-${Date.now().toString(36).toUpperCase()}`,
            name, format: 96, date: new Date().toISOString(),
            wells, groups: template.groups,
        };
        this.layouts.push(this.currentLayout);
        await this.context.globalState.update(this.storageKey, this.layouts);
        this.openDesigner();
    }

    // ── Dilution Calculator ────────────────────────────────────────────

    private async dilutionCalc(): Promise<void> {
        const mode = await vscode.window.showQuickPick([
            { label: '🧪 C1V1 = C2V2', description: 'Simple dilution calculation' },
            { label: '📉 Serial Dilution', description: 'Generate serial dilution concentrations' },
        ], { placeHolder: 'Tipo de cálculo' });
        if (!mode) { return; }

        if (mode.label.includes('C1V1')) {
            const stock = await vscode.window.showInputBox({ prompt: 'Stock concentration (e.g. 10 mM)' });
            const final = await vscode.window.showInputBox({ prompt: 'Final concentration (e.g. 0.5 mM)' });
            const vol = await vscode.window.showInputBox({ prompt: 'Final volume (µL)', value: '200' });
            if (!stock || !final || !vol) { return; }

            const stockN = parseFloat(stock);
            const finalN = parseFloat(final);
            const volN = parseFloat(vol);
            const result = computeDilution(stockN, finalN, volN);

            vscode.window.showInformationMessage(
                `C1V1=C2V2: Stock = ${result.stockVol.toFixed(1)} µL, Diluent = ${result.diluentVol.toFixed(1)} µL → ${volN} µL at ${finalN} (from ${stockN})`,
            );
        } else {
            const start = await vscode.window.showInputBox({ prompt: 'Starting concentration', value: '1000' });
            const factor = await vscode.window.showInputBox({ prompt: 'Dilution factor', value: '2' });
            const steps = await vscode.window.showInputBox({ prompt: 'Number of steps', value: '10' });
            if (!start || !factor || !steps) { return; }

            const concs = computeSerialDilution(parseFloat(start), parseFloat(factor), parseInt(steps));
            const msg = concs.map((c, i) => `Step ${i + 1}: ${c >= 0.01 ? c.toFixed(2) : c.toExponential(2)}`).join(' | ');
            vscode.window.showInformationMessage(`Serial dilution: ${msg}`);
        }
    }

    // ── CSV Export ─────────────────────────────────────────────────────

    private async exportCSV(): Promise<void> {
        if (!this.currentLayout) {
            vscode.window.showWarningMessage('No hay placa activa. Crea una primero.');
            return;
        }

        const rows = this.currentLayout.format === 96 ? 8 : 16;
        const cols = this.currentLayout.format === 96 ? 12 : 24;
        const rowLabels = 'ABCDEFGHIJKLMNOP'.split('');

        let csv = 'Well,Row,Column,Type,Sample,Concentration,Dilution,Notes\n';
        for (let r = 0; r < rows; r++) {
            for (let c = 1; c <= cols; c++) {
                const wellId = `${rowLabels[r]}${c}`;
                const well = this.currentLayout.wells[wellId];
                if (well) {
                    csv += `${wellId},${rowLabels[r]},${c},${well.type},${well.sampleName},${well.concentration || ''},${well.dilution || ''},${well.notes || ''}\n`;
                } else {
                    csv += `${wellId},${rowLabels[r]},${c},empty,,,\n`;
                }
            }
        }

        const doc = await vscode.workspace.openTextDocument({ content: csv, language: 'csv' });
        await vscode.window.showTextDocument(doc);
    }

    // ── Designer Panel ─────────────────────────────────────────────────

    private openDesigner(): void {
        if (this.panel) { this.panel.reveal(); this.updateDesigner(); return; }

        this.panel = vscode.window.createWebviewPanel(
            'plateDesigner', '🧫 Plate Layout Designer',
            vscode.ViewColumn.One,
            { enableScripts: true, retainContextWhenHidden: true },
        );
        this.panel.onDidDispose(() => { this.panel = undefined; });
        this.panel.webview.onDidReceiveMessage(msg => this.handleMsg(msg));
        this.updateDesigner();
    }

    private async handleMsg(msg: { command: string; data?: unknown }): Promise<void> {
        switch (msg.command) {
            case 'setWell': {
                const d = msg.data as { well: string; type: string; sample: string; color: string };
                if (this.currentLayout) {
                    this.currentLayout.wells[d.well] = {
                        type: d.type as WellInfo['type'],
                        sampleName: d.sample,
                        color: d.color,
                    };
                    await this.context.globalState.update(this.storageKey, this.layouts);
                    this.updateDesigner();
                }
                break;
            }
            case 'setWells': {
                const d = msg.data as { wells: string[]; type: string; sample: string; color: string };
                if (this.currentLayout) {
                    for (const w of d.wells) {
                        this.currentLayout.wells[w] = {
                            type: d.type as WellInfo['type'],
                            sampleName: d.sample,
                            color: d.color,
                        };
                    }
                    await this.context.globalState.update(this.storageKey, this.layouts);
                    this.updateDesigner();
                }
                break;
            }
            case 'clearAll': {
                if (this.currentLayout) {
                    this.currentLayout.wells = {};
                    await this.context.globalState.update(this.storageKey, this.layouts);
                    this.updateDesigner();
                }
                break;
            }
            case 'newPlate': {
                const format = (msg.data as { format: number }).format;
                this.currentLayout = {
                    id: `PLT-${Date.now().toString(36).toUpperCase()}`,
                    name: `Plate ${this.layouts.length + 1}`,
                    format: format as 96 | 384,
                    date: new Date().toISOString(),
                    wells: {}, groups: [],
                };
                this.layouts.push(this.currentLayout);
                await this.context.globalState.update(this.storageKey, this.layouts);
                this.updateDesigner();
                break;
            }
            case 'loadTemplate': {
                await this.createFromTemplate();
                break;
            }
        }
    }

    private updateDesigner(): void {
        if (!this.panel) { return; }
        this.panel.webview.html = this.buildDesignerHtml();
    }

    private buildDesignerHtml(): string {
        const layout = this.currentLayout;
        const rows = layout?.format === 384 ? 16 : 8;
        const cols = layout?.format === 384 ? 24 : 12;
        const rowLabels = 'ABCDEFGHIJKLMNOP'.split('').slice(0, rows);
        const wellSize = layout?.format === 384 ? 20 : 36;

        // Build plate grid
        let plateHtml = '<table style="border-collapse:collapse;margin:8px auto">';
        // Header row
        plateHtml += '<tr><td style="width:24px"></td>';
        for (let c = 1; c <= cols; c++) {
            plateHtml += `<td style="text-align:center;font-size:10px;color:#6c7086;padding:2px">${c}</td>`;
        }
        plateHtml += '</tr>';

        for (let r = 0; r < rows; r++) {
            plateHtml += `<tr><td style="text-align:right;font-size:10px;color:#6c7086;padding:0 4px">${rowLabels[r]}</td>`;
            for (let c = 1; c <= cols; c++) {
                const wellId = `${rowLabels[r]}${c}`;
                const well = layout?.wells[wellId];
                const color = well?.color || '#313244';
                const title = well ? `${wellId}: ${well.sampleName} (${well.type})${well.concentration ? ' ' + well.concentration : ''}` : wellId;
                plateHtml += `<td>
                    <div class="well" data-well="${wellId}" style="width:${wellSize}px;height:${wellSize}px;border-radius:50%;background:${color};border:2px solid ${well ? color : '#45475a'};cursor:pointer;margin:1px;display:flex;align-items:center;justify-content:center;font-size:7px;color:#cdd6f4;transition:all 0.15s" title="${title}" onclick="selectWell('${wellId}')" onmouseover="hoverWell('${wellId}',true)" onmouseout="hoverWell('${wellId}',false)">
                        ${well ? well.sampleName.substring(0, 3) : ''}
                    </div>
                </td>`;
            }
            plateHtml += '</tr>';
        }
        plateHtml += '</table>';

        // Summary stats
        const wellEntries = layout ? Object.values(layout.wells) : [];
        const sampleCount = wellEntries.filter(w => w.type === 'sample').length;
        const ctrlCount = wellEntries.filter(w => w.type === 'positive-control' || w.type === 'negative-control').length;
        const blankCount = wellEntries.filter(w => w.type === 'blank').length;
        const emptyCount = (rows * cols) - wellEntries.length;

        const typeColors: Record<string, string> = {
            sample: '#a6e3a1', 'positive-control': '#f9e2af',
            'negative-control': '#f38ba8', blank: '#6c7086',
            standard: '#89b4fa', empty: '#313244',
        };

        const savedPlatesList = this.layouts.map(l => `
            <div style="padding:4px 8px;background:${l.id === layout?.id ? '#313244' : '#181825'};border-radius:4px;margin:2px 0;cursor:pointer;display:flex;justify-content:space-between;font-size:11px" title="${l.date}">
                <span>${l.name}</span>
                <span style="color:#6c7086">${l.format}-well</span>
            </div>
        `).join('');

        return `<!DOCTYPE html><html><head><meta charset="UTF-8">
<style>
body{background:#1a1a2e;color:#cdd6f4;font-family:'Segoe UI',sans-serif;margin:0;padding:12px}
h1{color:#89b4fa;font-size:18px;margin:0 0 8px 0}
.well:hover{transform:scale(1.15);box-shadow:0 0 6px rgba(137,180,250,0.5)}
.well.selected{box-shadow:0 0 0 2px #cdd6f4}
.btn{padding:6px 12px;border:1px solid #45475a;background:#181825;color:#cdd6f4;border-radius:4px;cursor:pointer;font-size:11px}
.btn:hover{background:#313244}
.btn-primary{background:#89b4fa;color:#1a1a2e;border:none;font-weight:bold}
.tool-group{display:flex;gap:4px;margin:8px 0;flex-wrap:wrap}
.sidebar{width:220px;background:#181825;border-radius:6px;padding:10px;height:fit-content}
</style></head><body>
<div style="display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid #313244;padding-bottom:8px">
    <h1>🧫 Plate Layout Designer ${layout ? `(${layout.format}-well)` : ''}</h1>
    <div style="display:flex;gap:8px">
        <button class="btn" onclick="vscode.postMessage({command:'newPlate',data:{format:96}})">New 96-well</button>
        <button class="btn" onclick="vscode.postMessage({command:'newPlate',data:{format:384}})">New 384-well</button>
        <button class="btn" onclick="vscode.postMessage({command:'loadTemplate'})">📋 Template</button>
        <button class="btn" onclick="vscode.postMessage({command:'clearAll'})">🗑️ Clear</button>
    </div>
</div>

<div style="display:flex;gap:16px;margin-top:8px">
    <div style="flex:1">
        ${layout ? plateHtml : '<div style="text-align:center;padding:60px;color:#6c7086">Crea una placa nueva o carga una plantilla.</div>'}

        <div style="display:grid;grid-template-columns:repeat(6,1fr);gap:6px;margin-top:12px">
            <div style="background:#181825;padding:8px;border-radius:4px;text-align:center">
                <div style="font-size:18px;font-weight:bold;color:#a6e3a1">${sampleCount}</div>
                <div style="font-size:9px;color:#6c7086">Samples</div>
            </div>
            <div style="background:#181825;padding:8px;border-radius:4px;text-align:center">
                <div style="font-size:18px;font-weight:bold;color:#f9e2af">${ctrlCount}</div>
                <div style="font-size:9px;color:#6c7086">Controls</div>
            </div>
            <div style="background:#181825;padding:8px;border-radius:4px;text-align:center">
                <div style="font-size:18px;font-weight:bold;color:#6c7086">${blankCount}</div>
                <div style="font-size:9px;color:#6c7086">Blanks</div>
            </div>
            <div style="background:#181825;padding:8px;border-radius:4px;text-align:center">
                <div style="font-size:18px;font-weight:bold;color:#89b4fa">${wellEntries.filter(w => w.type === 'standard').length}</div>
                <div style="font-size:9px;color:#6c7086">Standards</div>
            </div>
            <div style="background:#181825;padding:8px;border-radius:4px;text-align:center">
                <div style="font-size:18px;font-weight:bold;color:#313244">${emptyCount}</div>
                <div style="font-size:9px;color:#6c7086">Empty</div>
            </div>
            <div style="background:#181825;padding:8px;border-radius:4px;text-align:center">
                <div style="font-size:18px;font-weight:bold;color:#cba6f7">${rows * cols}</div>
                <div style="font-size:9px;color:#6c7086">Total</div>
            </div>
        </div>
    </div>

    <div class="sidebar">
        <h3 style="color:#89dceb;font-size:13px;margin:0 0 8px 0">🎨 Well Assignment</h3>
        <div style="font-size:10px;color:#6c7086;margin-bottom:8px">Click wells or drag to select, then assign:</div>
        <div class="tool-group">
            ${Object.entries(typeColors).map(([type, color]) => `
                <button class="btn" onclick="setSelectedType('${type}','${color}')" style="border-color:${color};font-size:10px">
                    <span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${color};margin-right:4px"></span>${type.replace('-', ' ')}
                </button>
            `).join('')}
        </div>
        <div style="margin-top:8px">
            <label style="font-size:10px;color:#6c7086">Sample Name</label>
            <input id="sampleName" type="text" value="" style="width:100%;background:#313244;border:1px solid #45475a;color:#cdd6f4;padding:4px;border-radius:4px;margin-top:2px;font-size:11px" placeholder="e.g. GFP-1">
        </div>
        <div style="margin-top:6px">
            <label style="font-size:10px;color:#6c7086">Concentration</label>
            <input id="concInput" type="text" value="" style="width:100%;background:#313244;border:1px solid #45475a;color:#cdd6f4;padding:4px;border-radius:4px;margin-top:2px;font-size:11px" placeholder="e.g. 1 mM">
        </div>
        <button class="btn btn-primary" style="width:100%;margin-top:8px" onclick="assignSelected()">Assign to Selected Wells</button>

        <h3 style="color:#89dceb;font-size:13px;margin:14px 0 6px 0">📁 Saved Plates</h3>
        ${savedPlatesList || '<div style="font-size:10px;color:#6c7086">No plates saved</div>'}
    </div>
</div>

<script>
const vscode = acquireVsCodeApi();
let selectedWells = new Set();
let currentType = 'sample';
let currentColor = '#a6e3a1';
let isDragging = false;

function selectWell(wellId) {
    const el = document.querySelector('[data-well="'+wellId+'"]');
    if (selectedWells.has(wellId)) {
        selectedWells.delete(wellId);
        el.classList.remove('selected');
    } else {
        selectedWells.add(wellId);
        el.classList.add('selected');
    }
}

function hoverWell(wellId, enter) {
    if (isDragging && enter) { selectWell(wellId); }
}

document.addEventListener('mousedown', () => { isDragging = true; });
document.addEventListener('mouseup', () => { isDragging = false; });

function setSelectedType(type, color) {
    currentType = type;
    currentColor = color;
}

function assignSelected() {
    if (selectedWells.size === 0) return;
    const sample = document.getElementById('sampleName').value || currentType;
    vscode.postMessage({
        command: 'setWells',
        data: { wells: Array.from(selectedWells), type: currentType, sample, color: currentColor }
    });
    selectedWells.clear();
}
</script>
</body></html>`;
    }

    dispose(): void {
        this.panel?.dispose();
        this.disposables.forEach(d => d.dispose());
    }
}
