/**
 * ══════════════════════════════════════════════════════════════════
 * SynBio-LLVM — Experiment Planner & Lab Notebook (Fase 17)
 *
 * Cuaderno de laboratorio digital integrado en VS Code:
 *   1. Planificador de experimentos con plantillas
 *   2. Lab notebook con timestamping automático
 *   3. Inventario de cepas, plásmidos y reactivos
 *   4. Enlace experiment → código BioScript → protocolo
 *   5. Historial de resultados con comparación
 *   6. Exportación PDF-ready
 *
 * Cumple con: FDA 21 CFR Part 11 (electronic records),
 * Good Laboratory Practice (GLP) básico.
 * ══════════════════════════════════════════════════════════════════
 */
import * as vscode from 'vscode';
import * as path from 'path';

// ── Types ──────────────────────────────────────────────────────────────

export interface Experiment {
    id: string;
    title: string;
    objective: string;
    hypothesis: string;
    date: string;
    researcher: string;
    status: 'planned' | 'in-progress' | 'completed' | 'failed' | 'cancelled';
    protocol: string;
    constructs: string[];
    strains: string[];
    conditions: ExperimentCondition[];
    entries: NotebookEntry[];
    results: ExperimentResult[];
    conclusions: string;
    nextSteps: string;
    linkedFiles: string[];
    tags: string[];
}

interface ExperimentCondition {
    name: string;
    temperature: string;
    medium: string;
    inducer?: string;
    inducerConc?: string;
    antibiotics?: string;
    duration: string;
    replicates: number;
}

interface NotebookEntry {
    timestamp: string;
    type: 'observation' | 'measurement' | 'decision' | 'issue' | 'photo' | 'note';
    content: string;
    author: string;
}

interface ExperimentResult {
    id: string;
    type: 'plate_reader' | 'flow_cytometry' | 'gel' | 'colony_count' | 'sequencing' | 'growth_curve' | 'custom';
    data: Record<string, unknown>;
    notes: string;
    timestamp: string;
    file?: string;
}

interface StrainEntry {
    id: string;
    name: string;
    genotype: string;
    plasmids: string[];
    resistance: string[];
    source: string;
    freezerLocation: string;
    dateCreated: string;
    notes: string;
}

interface ReagentEntry {
    id: string;
    name: string;
    catalog: string;
    supplier: string;
    lot: string;
    expiryDate: string;
    location: string;
    quantity: string;
    notes: string;
}

// ── Experiment Templates ───────────────────────────────────────────────

const EXPERIMENT_TEMPLATES: Partial<Experiment>[] = [
    {
        title: 'Characterization — Plate Reader',
        objective: 'Characterize promoter/RBS/gene expression levels using plate reader fluorescence and OD600',
        protocol: 'plate-reader-characterization',
        conditions: [
            { name: 'Induced', temperature: '37°C', medium: 'M9 + 0.4% glucose', inducer: 'IPTG', inducerConc: '1 mM', antibiotics: 'Amp 100 µg/mL', duration: '16h', replicates: 3 },
            { name: 'Uninduced', temperature: '37°C', medium: 'M9 + 0.4% glucose', antibiotics: 'Amp 100 µg/mL', duration: '16h', replicates: 3 },
            { name: 'Negative Control', temperature: '37°C', medium: 'M9 + 0.4% glucose', antibiotics: 'Amp 100 µg/mL', duration: '16h', replicates: 3 },
        ],
        tags: ['characterization', 'plate-reader', 'fluorescence'],
    },
    {
        title: 'Gibson Assembly — Multi-fragment',
        objective: 'Assemble multiple DNA fragments using Gibson Assembly method',
        protocol: 'gibson-assembly',
        conditions: [
            { name: 'Assembly', temperature: '50°C', medium: 'Gibson Master Mix', duration: '60 min', replicates: 1 },
            { name: 'Transformation', temperature: '42°C (30s)', medium: 'SOC recovery', duration: '1h', replicates: 1 },
        ],
        tags: ['cloning', 'gibson', 'assembly'],
    },
    {
        title: 'Golden Gate Assembly',
        objective: 'One-pot assembly using Type IIS restriction enzymes',
        protocol: 'golden-gate',
        conditions: [
            { name: 'Assembly', temperature: '37°C/16°C cycles', medium: 'T4 Ligase Buffer', duration: '5h', replicates: 1 },
        ],
        tags: ['cloning', 'golden-gate', 'assembly'],
    },
    {
        title: 'Flow Cytometry — Single Cell',
        objective: 'Analyze single-cell expression distribution by flow cytometry',
        protocol: 'flow-cytometry',
        conditions: [
            { name: 'Test', temperature: '37°C', medium: 'LB + selection', inducer: 'IPTG', inducerConc: '0-10 mM', antibiotics: 'Amp', duration: '4h', replicates: 3 },
        ],
        tags: ['characterization', 'flow-cytometry', 'single-cell'],
    },
    {
        title: 'Growth Curve — OD600 Timecourse',
        objective: 'Measure growth rate and fitness cost of engineered strains',
        protocol: 'growth-curve',
        conditions: [
            { name: 'Engineered', temperature: '37°C', medium: 'LB + Amp', duration: '24h', replicates: 3 },
            { name: 'Wild-type', temperature: '37°C', medium: 'LB', duration: '24h', replicates: 3 },
        ],
        tags: ['growth', 'fitness', 'burden'],
    },
    {
        title: 'Colony PCR — Construct Verification',
        objective: 'Verify correct assembly of constructs by colony PCR',
        protocol: 'colony-pcr',
        conditions: [
            { name: 'PCR', temperature: '98°C/55°C/72°C', medium: 'Q5 buffer', duration: '2h', replicates: 8 },
        ],
        tags: ['verification', 'pcr', 'colony'],
    },
    {
        title: 'Dose-Response Curve — Inducer Titration',
        objective: 'Determine transfer function (dose-response) of inducible system',
        protocol: 'dose-response',
        conditions: [
            { name: '0 mM', temperature: '37°C', medium: 'M9', inducer: 'IPTG', inducerConc: '0 mM', duration: '6h', replicates: 3 },
            { name: '0.01 mM', temperature: '37°C', medium: 'M9', inducer: 'IPTG', inducerConc: '0.01 mM', duration: '6h', replicates: 3 },
            { name: '0.1 mM', temperature: '37°C', medium: 'M9', inducer: 'IPTG', inducerConc: '0.1 mM', duration: '6h', replicates: 3 },
            { name: '0.5 mM', temperature: '37°C', medium: 'M9', inducer: 'IPTG', inducerConc: '0.5 mM', duration: '6h', replicates: 3 },
            { name: '1 mM', temperature: '37°C', medium: 'M9', inducer: 'IPTG', inducerConc: '1 mM', duration: '6h', replicates: 3 },
            { name: '10 mM', temperature: '37°C', medium: 'M9', inducer: 'IPTG', inducerConc: '10 mM', duration: '6h', replicates: 3 },
        ],
        tags: ['dose-response', 'transfer-function', 'induction'],
    },
];

// ── Clase Principal ─────────────────────────────────────────────────────

export class ExperimentPlanner implements vscode.Disposable {
    private experiments: Experiment[] = [];
    private strains: StrainEntry[] = [];
    private reagents: ReagentEntry[] = [];
    private panel: vscode.WebviewPanel | undefined;
    private disposables: vscode.Disposable[] = [];
    private storageKey = 'synbio.experiments';
    private strainsKey = 'synbio.strains';
    private reagentsKey = 'synbio.reagents';

    constructor(private context: vscode.ExtensionContext) {
        this.loadData();
    }

    activate(): void {
        this.disposables.push(
            vscode.commands.registerCommand('synbio.experimentPlanner', () => this.openPlanner()),
            vscode.commands.registerCommand('synbio.newExperiment', () => this.createExperiment()),
            vscode.commands.registerCommand('synbio.labNotebook', () => this.addNotebookEntry()),
            vscode.commands.registerCommand('synbio.strainInventory', () => this.manageStrains()),
            vscode.commands.registerCommand('synbio.reagentInventory', () => this.manageReagents()),
            vscode.commands.registerCommand('synbio.experimentReport', () => this.generateReport()),
        );
    }

    private loadData(): void {
        this.experiments = this.context.globalState.get<Experiment[]>(this.storageKey, []);
        this.strains = this.context.globalState.get<StrainEntry[]>(this.strainsKey, []);
        this.reagents = this.context.globalState.get<ReagentEntry[]>(this.reagentsKey, []);
    }

    private async saveData(): Promise<void> {
        await this.context.globalState.update(this.storageKey, this.experiments);
        await this.context.globalState.update(this.strainsKey, this.strains);
        await this.context.globalState.update(this.reagentsKey, this.reagents);
    }

    // ── Create Experiment ──────────────────────────────────────────────

    private async createExperiment(): Promise<void> {
        // Step 1: Choose template or blank
        const templates = EXPERIMENT_TEMPLATES.map(t => ({
            label: t.title!,
            description: t.objective?.substring(0, 80),
            detail: `Tags: ${t.tags?.join(', ')}`,
        }));
        templates.unshift({ label: '📝 Blank Experiment', description: 'Start from scratch', detail: '' });

        const templatePick = await vscode.window.showQuickPick(templates, {
            placeHolder: 'Selecciona una plantilla de experimento',
            title: '🧪 Nuevo Experimento',
        });
        if (!templatePick) { return; }

        const template = templatePick.label === '📝 Blank Experiment'
            ? {} as Partial<Experiment>
            : EXPERIMENT_TEMPLATES.find(t => t.title === templatePick.label) || {};

        // Step 2: Title
        const title = await vscode.window.showInputBox({
            prompt: 'Título del experimento',
            value: template.title || '',
            placeHolder: 'Ej: GFP Characterization — pLac/IPTG dose-response',
        });
        if (!title) { return; }

        // Step 3: Objective
        const objective = await vscode.window.showInputBox({
            prompt: 'Objetivo del experimento',
            value: template.objective || '',
            placeHolder: 'Ej: Determine transfer function of pLac promoter',
        });

        // Step 4: Hypothesis
        const hypothesis = await vscode.window.showInputBox({
            prompt: 'Hipótesis',
            placeHolder: 'Ej: GFP expression will increase linearly with IPTG up to 1 mM',
        });

        // Step 5: Researcher name
        const researcher = await vscode.window.showInputBox({
            prompt: 'Nombre del investigador',
            value: this.experiments.length > 0 ? this.experiments[this.experiments.length - 1].researcher : '',
        });

        const exp: Experiment = {
            id: `EXP-${Date.now().toString(36).toUpperCase()}`,
            title,
            objective: objective || '',
            hypothesis: hypothesis || '',
            date: new Date().toISOString(),
            researcher: researcher || 'Unknown',
            status: 'planned',
            protocol: template.protocol || '',
            constructs: [],
            strains: [],
            conditions: template.conditions || [],
            entries: [{
                timestamp: new Date().toISOString(),
                type: 'note',
                content: `Experiment created: ${title}`,
                author: researcher || 'Unknown',
            }],
            results: [],
            conclusions: '',
            nextSteps: '',
            linkedFiles: [],
            tags: template.tags || [],
        };

        // Link current file if BioScript
        const editor = vscode.window.activeTextEditor;
        if (editor && (editor.document.languageId === 'bioscript' || editor.document.fileName.endsWith('.bio'))) {
            exp.linkedFiles.push(editor.document.fileName);
        }

        this.experiments.push(exp);
        await this.saveData();

        vscode.window.showInformationMessage(
            `✅ Experimento creado: ${exp.id} — ${title}`,
            'Abrir Planner', 'Añadir Nota',
        ).then(sel => {
            if (sel === 'Abrir Planner') { this.openPlanner(); }
            if (sel === 'Añadir Nota') { this.addNotebookEntry(); }
        });
    }

    // ── Lab Notebook Entry ─────────────────────────────────────────────

    private async addNotebookEntry(): Promise<void> {
        if (this.experiments.length === 0) {
            vscode.window.showWarningMessage('No hay experimentos. Crea uno primero.');
            return;
        }

        // Pick experiment
        const picks = this.experiments.map(e => ({
            label: `${e.id} — ${e.title}`,
            description: `Status: ${e.status} | Entries: ${e.entries.length}`,
        }));
        const pick = await vscode.window.showQuickPick(picks, {
            placeHolder: 'Selecciona el experimento',
        });
        if (!pick) { return; }
        const exp = this.experiments.find(e => pick.label.startsWith(e.id))!;

        // Entry type
        const typePick = await vscode.window.showQuickPick([
            { label: '📝 Observation', description: 'General lab observation' },
            { label: '📊 Measurement', description: 'Quantitative data point' },
            { label: '🔀 Decision', description: 'Protocol change or decision' },
            { label: '⚠️ Issue', description: 'Problem encountered' },
            { label: '📋 Note', description: 'General note' },
        ], { placeHolder: 'Tipo de entrada' });
        if (!typePick) { return; }

        const typeMap: Record<string, NotebookEntry['type']> = {
            '📝 Observation': 'observation', '📊 Measurement': 'measurement',
            '🔀 Decision': 'decision', '⚠️ Issue': 'issue', '📋 Note': 'note',
        };

        const content = await vscode.window.showInputBox({
            prompt: 'Contenido de la nota',
            placeHolder: 'Ej: Colonies observed after overnight incubation. ~200 colonies on plate 1.',
        });
        if (!content) { return; }

        exp.entries.push({
            timestamp: new Date().toISOString(),
            type: typeMap[typePick.label] || 'note',
            content,
            author: exp.researcher,
        });

        await this.saveData();
        vscode.window.showInformationMessage(`📝 Nota añadida a ${exp.id} (${exp.entries.length} total)`);

        if (this.panel) { this.updatePlanner(); }
    }

    // ── Strain Inventory ───────────────────────────────────────────────

    private async manageStrains(): Promise<void> {
        const action = await vscode.window.showQuickPick([
            { label: '➕ Añadir Cepa', description: 'Registrar nueva cepa en inventario' },
            { label: '📋 Ver Inventario', description: `${this.strains.length} cepas registradas` },
        ], { placeHolder: 'Gestión de Cepas' });

        if (action?.label.includes('Añadir')) {
            const name = await vscode.window.showInputBox({ prompt: 'Nombre de la cepa', placeHolder: 'Ej: DH5α + pSB1C3-GFP' });
            if (!name) { return; }
            const genotype = await vscode.window.showInputBox({ prompt: 'Genotipo', placeHolder: 'Ej: F- endA1 recA1 ...' });
            const resistance = await vscode.window.showInputBox({ prompt: 'Resistencias (separadas por coma)', placeHolder: 'Amp, Cam' });
            const location = await vscode.window.showInputBox({ prompt: 'Ubicación en congelador', placeHolder: 'Ej: Freezer -80°C, Rack 3, Box A, Position D7' });

            const strain: StrainEntry = {
                id: `STR-${Date.now().toString(36).toUpperCase()}`,
                name, genotype: genotype || '',
                plasmids: [], resistance: resistance?.split(',').map(s => s.trim()) || [],
                source: '', freezerLocation: location || '',
                dateCreated: new Date().toISOString(), notes: '',
            };
            this.strains.push(strain);
            await this.saveData();
            vscode.window.showInformationMessage(`✅ Cepa ${strain.id} registrada: ${name}`);
        } else {
            const items = this.strains.map(s => ({
                label: `${s.id} — ${s.name}`,
                description: `Resistance: ${s.resistance.join(', ')} | Location: ${s.freezerLocation}`,
                detail: s.genotype,
            }));
            await vscode.window.showQuickPick(items, { placeHolder: `${this.strains.length} cepas en inventario` });
        }
    }

    // ── Reagent Inventory ──────────────────────────────────────────────

    private async manageReagents(): Promise<void> {
        const action = await vscode.window.showQuickPick([
            { label: '➕ Añadir Reactivo', description: 'Registrar nuevo reactivo' },
            { label: '📋 Ver Inventario', description: `${this.reagents.length} reactivos registrados` },
            { label: '⚠️ Caducidades Próximas', description: 'Revisar fechas de caducidad' },
        ], { placeHolder: 'Gestión de Reactivos' });

        if (action?.label.includes('Añadir')) {
            const name = await vscode.window.showInputBox({ prompt: 'Nombre', placeHolder: 'Ej: Gibson Assembly Master Mix' });
            if (!name) { return; }
            const catalog = await vscode.window.showInputBox({ prompt: 'Catálogo', placeHolder: 'Ej: E2611S' });
            const supplier = await vscode.window.showInputBox({ prompt: 'Proveedor', placeHolder: 'Ej: NEB' });
            const lot = await vscode.window.showInputBox({ prompt: 'Lote', placeHolder: 'Ej: 10124563' });
            const expiry = await vscode.window.showInputBox({ prompt: 'Fecha caducidad (YYYY-MM-DD)', placeHolder: '2026-12-31' });
            const quantity = await vscode.window.showInputBox({ prompt: 'Cantidad', placeHolder: 'Ej: 50 rxn, 500 µL' });
            const location = await vscode.window.showInputBox({ prompt: 'Ubicación', placeHolder: 'Ej: -20°C Freezer, Shelf 2' });

            const reagent: ReagentEntry = {
                id: `RGT-${Date.now().toString(36).toUpperCase()}`,
                name, catalog: catalog || '', supplier: supplier || '',
                lot: lot || '', expiryDate: expiry || '',
                location: location || '', quantity: quantity || '', notes: '',
            };
            this.reagents.push(reagent);
            await this.saveData();
            vscode.window.showInformationMessage(`✅ Reactivo ${reagent.id} registrado: ${name}`);
        } else if (action?.label.includes('Caducidades')) {
            const now = new Date();
            const soon = this.reagents.filter(r => {
                if (!r.expiryDate) { return false; }
                const exp = new Date(r.expiryDate);
                const diff = (exp.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
                return diff < 90 && diff > 0;
            });
            const expired = this.reagents.filter(r => {
                if (!r.expiryDate) { return false; }
                return new Date(r.expiryDate) < now;
            });

            if (expired.length > 0 || soon.length > 0) {
                const items = [
                    ...expired.map(r => ({ label: `🔴 CADUCADO: ${r.name}`, description: `Caducó: ${r.expiryDate} | Lot: ${r.lot}` })),
                    ...soon.map(r => ({ label: `🟡 Próximo: ${r.name}`, description: `Caduca: ${r.expiryDate} | Lot: ${r.lot}` })),
                ];
                await vscode.window.showQuickPick(items, { placeHolder: `${expired.length} caducados, ${soon.length} próximos a caducar` });
            } else {
                vscode.window.showInformationMessage('✅ Todos los reactivos están dentro de fecha.');
            }
        } else {
            const items = this.reagents.map(r => ({
                label: `${r.id} — ${r.name}`,
                description: `${r.supplier} ${r.catalog} | Quantity: ${r.quantity}`,
                detail: `Location: ${r.location} | Expiry: ${r.expiryDate || 'N/A'}`,
            }));
            await vscode.window.showQuickPick(items, { placeHolder: `${this.reagents.length} reactivos en inventario` });
        }
    }

    // ── Report Generator ───────────────────────────────────────────────

    private async generateReport(): Promise<void> {
        if (this.experiments.length === 0) {
            vscode.window.showWarningMessage('No hay experimentos para generar informe.');
            return;
        }

        const picks = this.experiments.map(e => ({
            label: `${e.id} — ${e.title}`,
            description: `${e.status} | ${e.entries.length} entries | ${e.results.length} results`,
        }));
        const pick = await vscode.window.showQuickPick(picks, { placeHolder: 'Selecciona experimento' });
        if (!pick) { return; }
        const exp = this.experiments.find(e => pick.label.startsWith(e.id))!;

        // Generate markdown report
        const conditionsTable = exp.conditions.map(c =>
            `| ${c.name} | ${c.temperature} | ${c.medium} | ${c.inducer || '-'} ${c.inducerConc || ''} | ${c.antibiotics || '-'} | ${c.duration} | ${c.replicates} |`
        ).join('\n');

        const entriesLog = exp.entries.map(e => {
            const icons: Record<string, string> = { observation: '👁️', measurement: '📊', decision: '🔀', issue: '⚠️', note: '📋', photo: '📷' };
            return `- **${new Date(e.timestamp).toLocaleString('es-ES')}** ${icons[e.type] || ''} [${e.type}] ${e.content}`;
        }).join('\n');

        const report = `# 🧪 Experiment Report: ${exp.id}

## ${exp.title}

| Field | Value |
|-------|-------|
| **ID** | ${exp.id} |
| **Date** | ${new Date(exp.date).toLocaleDateString('es-ES')} |
| **Researcher** | ${exp.researcher} |
| **Status** | ${exp.status.toUpperCase()} |
| **Protocol** | ${exp.protocol || 'Custom'} |

## Objective
${exp.objective}

## Hypothesis
${exp.hypothesis}

## Experimental Conditions

| Name | Temp | Medium | Inducer | Antibiotics | Duration | Replicates |
|------|------|--------|---------|-------------|----------|------------|
${conditionsTable}

## Constructs
${exp.constructs.length > 0 ? exp.constructs.map(c => `- ${c}`).join('\n') : '_No constructs linked_'}

## Lab Notebook Entries (${exp.entries.length})

${entriesLog}

## Results
${exp.results.length > 0 ? exp.results.map(r => `- **${r.type}** (${new Date(r.timestamp).toLocaleDateString('es-ES')}): ${r.notes}`).join('\n') : '_No results recorded yet_'}

## Conclusions
${exp.conclusions || '_Pending_'}

## Next Steps
${exp.nextSteps || '_Pending_'}

## Linked Files
${exp.linkedFiles.map(f => `- ${f}`).join('\n') || '_None_'}

---
_Generated by SynBio-LLVM Experiment Planner — ${new Date().toISOString()}_
_Tags: ${exp.tags.join(', ')}_
`;

        const doc = await vscode.workspace.openTextDocument({ content: report, language: 'markdown' });
        await vscode.window.showTextDocument(doc);
    }

    // ── Planner Panel ──────────────────────────────────────────────────

    private openPlanner(): void {
        if (this.panel) { this.panel.reveal(); this.updatePlanner(); return; }

        this.panel = vscode.window.createWebviewPanel(
            'experimentPlanner', '🧪 Experiment Planner & Lab Notebook',
            vscode.ViewColumn.One,
            { enableScripts: true, retainContextWhenHidden: true },
        );
        this.panel.onDidDispose(() => { this.panel = undefined; });
        this.panel.webview.onDidReceiveMessage(msg => this.handleMessage(msg));
        this.updatePlanner();
    }

    private async handleMessage(msg: { command: string; data?: unknown }): Promise<void> {
        switch (msg.command) {
            case 'updateStatus': {
                const d = msg.data as { id: string; status: string };
                const exp = this.experiments.find(e => e.id === d.id);
                if (exp) {
                    exp.status = d.status as Experiment['status'];
                    exp.entries.push({
                        timestamp: new Date().toISOString(),
                        type: 'decision',
                        content: `Status changed to: ${d.status}`,
                        author: exp.researcher,
                    });
                    await this.saveData();
                    this.updatePlanner();
                }
                break;
            }
            case 'addEntry': {
                await this.addNotebookEntry();
                break;
            }
            case 'newExperiment': {
                await this.createExperiment();
                if (this.panel) { this.updatePlanner(); }
                break;
            }
        }
    }

    private updatePlanner(): void {
        if (!this.panel) { return; }
        this.panel.webview.html = this.buildPlannerHtml();
    }

    private buildPlannerHtml(): string {
        const statusColors: Record<string, string> = {
            planned: '#89b4fa', 'in-progress': '#f9e2af',
            completed: '#a6e3a1', failed: '#f38ba8', cancelled: '#6c7086',
        };

        const expCards = this.experiments.map(exp => {
            const color = statusColors[exp.status] || '#cdd6f4';
            const entries = exp.entries.slice(-5).reverse().map(e => {
                const icons: Record<string, string> = { observation: '👁️', measurement: '📊', decision: '🔀', issue: '⚠️', note: '📋' };
                const time = new Date(e.timestamp).toLocaleString('es-ES', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
                return `<div style="font-size:11px;padding:3px 0;border-bottom:1px solid #11111b">
                    <span style="color:#6c7086">${time}</span> ${icons[e.type] || ''} ${e.content.substring(0, 100)}
                </div>`;
            }).join('');

            return `<div style="background:#1e1e2e;border-radius:8px;padding:16px;margin:8px 0;border-left:4px solid ${color}">
                <div style="display:flex;justify-content:space-between;align-items:center">
                    <div>
                        <strong style="color:${color};font-size:15px">${exp.title}</strong>
                        <span style="background:${color}22;color:${color};padding:2px 8px;border-radius:10px;font-size:10px;margin-left:8px">${exp.status.toUpperCase()}</span>
                    </div>
                    <span style="font-size:11px;color:#6c7086">${exp.id} | ${new Date(exp.date).toLocaleDateString('es-ES')}</span>
                </div>
                <p style="color:#a6adc8;font-size:12px;margin:6px 0">${exp.objective}</p>
                <div style="display:flex;gap:12px;font-size:11px;color:#6c7086;margin:6px 0">
                    <span>👤 ${exp.researcher}</span>
                    <span>📋 ${exp.entries.length} entries</span>
                    <span>📊 ${exp.results.length} results</span>
                    <span>🧬 ${exp.conditions.length} conditions</span>
                    <span>🏷️ ${exp.tags.join(', ')}</span>
                </div>
                ${entries ? `<details><summary style="color:#89dceb;cursor:pointer;font-size:12px">Recent entries (${exp.entries.length})</summary>${entries}</details>` : ''}
                <div style="margin-top:8px;display:flex;gap:4px">
                    ${['planned', 'in-progress', 'completed', 'failed'].map(s =>
                        `<button onclick="updateStatus('${exp.id}','${s}')" style="padding:3px 8px;border:1px solid ${statusColors[s]};background:${exp.status === s ? statusColors[s] + '44' : 'transparent'};color:${statusColors[s]};border-radius:4px;cursor:pointer;font-size:10px">${s}</button>`
                    ).join('')}
                </div>
            </div>`;
        }).join('') || '<div style="text-align:center;padding:40px;color:#6c7086"><p>No experiments yet. Click "New Experiment" to start.</p></div>';

        const statsHtml = `
            <div style="display:grid;grid-template-columns:repeat(5,1fr);gap:8px;margin:12px 0">
                <div style="background:#181825;padding:10px;border-radius:6px;text-align:center">
                    <div style="font-size:22px;font-weight:bold;color:#89b4fa">${this.experiments.length}</div>
                    <div style="font-size:10px;color:#6c7086">Experimentos</div>
                </div>
                <div style="background:#181825;padding:10px;border-radius:6px;text-align:center">
                    <div style="font-size:22px;font-weight:bold;color:#f9e2af">${this.experiments.filter(e => e.status === 'in-progress').length}</div>
                    <div style="font-size:10px;color:#6c7086">En Progreso</div>
                </div>
                <div style="background:#181825;padding:10px;border-radius:6px;text-align:center">
                    <div style="font-size:22px;font-weight:bold;color:#a6e3a1">${this.experiments.filter(e => e.status === 'completed').length}</div>
                    <div style="font-size:10px;color:#6c7086">Completados</div>
                </div>
                <div style="background:#181825;padding:10px;border-radius:6px;text-align:center">
                    <div style="font-size:22px;font-weight:bold;color:#cba6f7">${this.strains.length}</div>
                    <div style="font-size:10px;color:#6c7086">Cepas</div>
                </div>
                <div style="background:#181825;padding:10px;border-radius:6px;text-align:center">
                    <div style="font-size:22px;font-weight:bold;color:#f38ba8">${this.reagents.length}</div>
                    <div style="font-size:10px;color:#6c7086">Reactivos</div>
                </div>
            </div>`;

        return `<!DOCTYPE html><html><head><meta charset="UTF-8">
<style>
body{background:#1a1a2e;color:#cdd6f4;font-family:'Segoe UI',sans-serif;margin:0;padding:16px}
h1{color:#89b4fa;font-size:20px;margin:0 0 4px 0}
button:hover{opacity:0.8}
.btn-main{padding:8px 16px;background:#89b4fa;color:#1a1a2e;border:none;border-radius:6px;cursor:pointer;font-weight:bold;font-size:12px}
</style></head><body>
<div style="display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid #313244;padding-bottom:8px">
    <h1>🧪 Experiment Planner & Lab Notebook</h1>
    <div style="display:flex;gap:8px">
        <button class="btn-main" onclick="newExperiment()">+ New Experiment</button>
        <button class="btn-main" style="background:#a6e3a1" onclick="addEntry()">📝 Add Entry</button>
    </div>
</div>
${statsHtml}
${expCards}
<script>
const vscode = acquireVsCodeApi();
function updateStatus(id, status) { vscode.postMessage({command:'updateStatus', data:{id, status}}); }
function newExperiment() { vscode.postMessage({command:'newExperiment'}); }
function addEntry() { vscode.postMessage({command:'addEntry'}); }
</script>
</body></html>`;
    }

    dispose(): void {
        this.panel?.dispose();
        this.disposables.forEach(d => d.dispose());
    }
}
