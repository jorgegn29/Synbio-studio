import * as vscode from 'vscode';

/**
 * SynBio-LLVM — Fase 8: Control de Versiones Genético
 * 
 * Historial de iteraciones de diseño, diff visual de circuitos,
 * timeline de versiones, ramas de diseño genético.
 */

// ── Tipos ──────────────────────────────────────────────────────────────

interface DesignVersion {
    id: string;
    timestamp: number;
    label: string;
    description: string;
    author: string;
    content: string;
    hash: string;
    parentId: string | null;
    branch: string;
    tags: string[];
    stats: VersionStats;
}

interface VersionStats {
    promoters: number;
    genes: number;
    terminators: number;
    rbsCount: number;
    totalParts: number;
    linesOfCode: number;
    complexity: number; // 0-10
}

interface DesignDiff {
    added: DiffLine[];
    removed: DiffLine[];
    modified: DiffLine[];
    summary: string;
    partsAdded: string[];
    partsRemoved: string[];
}

interface DiffLine {
    lineNumber: number;
    content: string;
    type: 'add' | 'remove' | 'modify';
}

interface DesignBranch {
    name: string;
    created: number;
    lastModified: number;
    versionCount: number;
    headVersionId: string;
}

// ── Clase principal ────────────────────────────────────────────────────

export class GeneticVersionControl implements vscode.Disposable {
    private panel: vscode.WebviewPanel | undefined;
    private context: vscode.ExtensionContext;
    private versions: Map<string, DesignVersion> = new Map();
    private branches: Map<string, DesignBranch> = new Map();
    private currentBranch: string = 'main';
    private autoSaveListener: vscode.Disposable | undefined;

    constructor(context: vscode.ExtensionContext) {
        this.context = context;
        this.loadState();
        this.registerAutoSave();
    }

    private loadState() {
        const saved = this.context.globalState.get<any>('synbio-versions');
        if (saved) {
            if (saved.versions) {
                for (const [k, v] of Object.entries(saved.versions)) {
                    this.versions.set(k, v as DesignVersion);
                }
            }
            if (saved.branches) {
                for (const [k, v] of Object.entries(saved.branches)) {
                    this.branches.set(k, v as DesignBranch);
                }
            }
            this.currentBranch = saved.currentBranch || 'main';
        }
        // Asegurar branch main
        if (!this.branches.has('main')) {
            this.branches.set('main', {
                name: 'main',
                created: Date.now(),
                lastModified: Date.now(),
                versionCount: 0,
                headVersionId: ''
            });
        }
    }

    private saveState() {
        const versions: Record<string, DesignVersion> = {};
        this.versions.forEach((v, k) => { versions[k] = v; });
        const branches: Record<string, DesignBranch> = {};
        this.branches.forEach((v, k) => { branches[k] = v; });
        this.context.globalState.update('synbio-versions', {
            versions, branches, currentBranch: this.currentBranch
        });
    }

    private registerAutoSave() {
        this.autoSaveListener = vscode.workspace.onDidSaveTextDocument(doc => {
            if (doc.languageId === 'bioscript') {
                this.createAutoSnapshot(doc);
            }
        });
    }

    private createAutoSnapshot(doc: vscode.TextDocument) {
        const content = doc.getText();
        const hash = this.simpleHash(content);

        // No duplicar si el contenido no cambió
        const branch = this.branches.get(this.currentBranch);
        if (branch && branch.headVersionId) {
            const head = this.versions.get(branch.headVersionId);
            if (head && head.hash === hash) return;
        }

        const version: DesignVersion = {
            id: this.generateId(),
            timestamp: Date.now(),
            label: `Auto-save ${new Date().toLocaleTimeString()}`,
            description: `Guardado automático al salvar ${doc.fileName.split(/[\\/]/).pop()}`,
            author: 'SynBio-LLVM',
            content,
            hash,
            parentId: branch?.headVersionId || null,
            branch: this.currentBranch,
            tags: ['auto'],
            stats: this.computeStats(content)
        };

        this.versions.set(version.id, version);
        if (branch) {
            branch.headVersionId = version.id;
            branch.lastModified = Date.now();
            branch.versionCount++;
        }
        this.saveState();
        this.updatePanel();
    }

    /**
     * Crear snapshot manual con etiqueta
     */
    async createSnapshot(label?: string) {
        const editor = vscode.window.activeTextEditor;
        if (!editor || editor.document.languageId !== 'bioscript') {
            vscode.window.showWarningMessage('Abra un archivo .bio para crear un snapshot');
            return;
        }

        if (!label) {
            label = await vscode.window.showInputBox({
                prompt: 'Nombre para este snapshot de diseño',
                placeHolder: 'ej: v1.0 - Toggle switch funcional'
            });
        }
        if (!label) return;

        const description = await vscode.window.showInputBox({
            prompt: 'Descripción (opcional)',
            placeHolder: 'Cambios realizados...'
        }) || '';

        const content = editor.document.getText();
        const branch = this.branches.get(this.currentBranch);

        const version: DesignVersion = {
            id: this.generateId(),
            timestamp: Date.now(),
            label,
            description,
            author: 'Usuario',
            content,
            hash: this.simpleHash(content),
            parentId: branch?.headVersionId || null,
            branch: this.currentBranch,
            tags: ['manual'],
            stats: this.computeStats(content)
        };

        this.versions.set(version.id, version);
        if (branch) {
            branch.headVersionId = version.id;
            branch.lastModified = Date.now();
            branch.versionCount++;
        }
        this.saveState();
        this.updatePanel();
        vscode.window.showInformationMessage(`📸 Snapshot "${label}" creado en rama ${this.currentBranch}`);
    }

    /**
     * Comparar dos versiones
     */
    diffVersions(idA: string, idB: string): DesignDiff {
        const vA = this.versions.get(idA);
        const vB = this.versions.get(idB);
        if (!vA || !vB) {
            return { added: [], removed: [], modified: [], summary: 'Versiones no encontradas', partsAdded: [], partsRemoved: [] };
        }

        const linesA = vA.content.split('\n');
        const linesB = vB.content.split('\n');
        const added: DiffLine[] = [];
        const removed: DiffLine[] = [];
        const modified: DiffLine[] = [];

        // Diff simple por líneas
        const maxLines = Math.max(linesA.length, linesB.length);
        for (let i = 0; i < maxLines; i++) {
            const a = linesA[i] || '';
            const b = linesB[i] || '';
            if (a === b) continue;
            if (i >= linesA.length) {
                added.push({ lineNumber: i + 1, content: b, type: 'add' });
            } else if (i >= linesB.length) {
                removed.push({ lineNumber: i + 1, content: a, type: 'remove' });
            } else {
                modified.push({ lineNumber: i + 1, content: `${a} → ${b}`, type: 'modify' });
            }
        }

        // Detectar partes añadidas/eliminadas
        const partsA = this.extractPartNames(vA.content);
        const partsB = this.extractPartNames(vB.content);
        const partsAdded = partsB.filter(p => !partsA.includes(p));
        const partsRemoved = partsA.filter(p => !partsB.includes(p));

        const summary = `${added.length} líneas añadidas, ${removed.length} eliminadas, ${modified.length} modificadas. ` +
                        `Partes: +${partsAdded.length} -${partsRemoved.length}`;

        return { added, removed, modified, summary, partsAdded, partsRemoved };
    }

    /**
     * Restaurar una versión anterior
     */
    async restoreVersion(versionId: string) {
        const version = this.versions.get(versionId);
        if (!version) {
            vscode.window.showErrorMessage('Versión no encontrada');
            return;
        }

        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            // Crear nuevo documento
            const doc = await vscode.workspace.openTextDocument({
                language: 'bioscript',
                content: version.content
            });
            await vscode.window.showTextDocument(doc);
        } else {
            const fullRange = new vscode.Range(
                new vscode.Position(0, 0),
                editor.document.lineAt(editor.document.lineCount - 1).range.end
            );
            await editor.edit(editBuilder => {
                editBuilder.replace(fullRange, version.content);
            });
        }

        vscode.window.showInformationMessage(`⏪ Restaurada versión: ${version.label}`);
    }

    /**
     * Crear nueva rama de diseño
     */
    async createBranch(name?: string) {
        if (!name) {
            name = await vscode.window.showInputBox({
                prompt: 'Nombre de la nueva rama de diseño',
                placeHolder: 'ej: experiment-stronger-rbs'
            });
        }
        if (!name) return;

        if (this.branches.has(name)) {
            vscode.window.showWarningMessage(`La rama "${name}" ya existe`);
            return;
        }

        const currentHead = this.branches.get(this.currentBranch)?.headVersionId || '';
        this.branches.set(name, {
            name,
            created: Date.now(),
            lastModified: Date.now(),
            versionCount: 0,
            headVersionId: currentHead
        });

        this.currentBranch = name;
        this.saveState();
        this.updatePanel();
        vscode.window.showInformationMessage(`🌿 Rama "${name}" creada y activada`);
    }

    /**
     * Cambiar de rama
     */
    async switchBranch(name: string) {
        if (!this.branches.has(name)) {
            vscode.window.showErrorMessage(`Rama "${name}" no existe`);
            return;
        }
        this.currentBranch = name;
        const branch = this.branches.get(name)!;
        if (branch.headVersionId) {
            await this.restoreVersion(branch.headVersionId);
        }
        this.saveState();
        this.updatePanel();
        vscode.window.showInformationMessage(`🔀 Cambiado a rama: ${name}`);
    }

    async show() {
        if (this.panel) {
            this.panel.reveal(vscode.ViewColumn.Two);
            this.updatePanel();
            return;
        }

        this.panel = vscode.window.createWebviewPanel(
            'synbioVersionControl',
            '📜 Genetic Version Control',
            vscode.ViewColumn.Two,
            { enableScripts: true }
        );

        this.panel.webview.html = this.getWebviewContent();

        this.panel.webview.onDidReceiveMessage(async msg => {
            switch (msg.command) {
                case 'createSnapshot':
                    await this.createSnapshot(msg.label);
                    break;
                case 'restoreVersion':
                    await this.restoreVersion(msg.versionId);
                    break;
                case 'diffVersions': {
                    const diff = this.diffVersions(msg.idA, msg.idB);
                    this.panel?.webview.postMessage({ command: 'diffResult', diff });
                    break;
                }
                case 'createBranch':
                    await this.createBranch(msg.name);
                    break;
                case 'switchBranch':
                    await this.switchBranch(msg.name);
                    break;
                case 'tagVersion':
                    this.tagVersion(msg.versionId, msg.tag);
                    break;
                case 'refresh':
                    this.updatePanel();
                    break;
            }
        });

        this.panel.onDidDispose(() => { this.panel = undefined; });
    }

    private tagVersion(versionId: string, tag: string) {
        const v = this.versions.get(versionId);
        if (v && !v.tags.includes(tag)) {
            v.tags.push(tag);
            this.saveState();
            this.updatePanel();
        }
    }

    private updatePanel() {
        if (!this.panel) return;
        this.panel.webview.postMessage({
            command: 'stateUpdate',
            versions: this.getVersionsForBranch(this.currentBranch),
            branches: Array.from(this.branches.values()),
            currentBranch: this.currentBranch
        });
    }

    private getVersionsForBranch(branch: string): DesignVersion[] {
        const versions: DesignVersion[] = [];
        this.versions.forEach(v => {
            if (v.branch === branch) versions.push(v);
        });
        return versions.sort((a, b) => b.timestamp - a.timestamp);
    }

    // ── Utilidades ─────────────────────────────────────────────────────

    private computeStats(content: string): VersionStats {
        const lines = content.split('\n');
        const promoters = lines.filter(l => l.match(/^\s*promoter\s+/)).length;
        const genes = lines.filter(l => l.match(/^\s*gene\s+/)).length;
        const terminators = lines.filter(l => l.match(/^\s*terminator\s+/)).length;
        const rbsCount = lines.filter(l => l.match(/^\s*rbs\s+/)).length;
        const totalParts = promoters + genes + terminators + rbsCount;
        // Heuristic complexity score (1-10): approximates design difficulty
        // Based on number of parts (primary driver) + kill switch bonus for biosafety.
        // Not a published metric — used only for UI display and version tracking.
        const complexity = Math.min(10, Math.round(totalParts * 0.8 + (content.includes('kill_switch') ? 2 : 0)));
        return { promoters, genes, terminators, rbsCount, totalParts, linesOfCode: lines.length, complexity };
    }

    private extractPartNames(content: string): string[] {
        const names: string[] = [];
        const regex = /(?:promoter|rbs|gene|terminator)\s+(\w+)/g;
        let m;
        while ((m = regex.exec(content)) !== null) { names.push(m[1]); }
        return names;
    }

    private generateId(): string {
        return `v_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    }

    private simpleHash(str: string): string {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            const chr = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + chr;
            hash |= 0;
        }
        return Math.abs(hash).toString(36);
    }

    // ── WebView ────────────────────────────────────────────────────────

    private getWebviewContent(): string {
        return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>Genetic Version Control</title>
<style>
    :root { --bg: #1e1e2e; --surface: #2a2a3e; --primary: #7c3aed; --accent: #22d3ee;
            --success: #10b981; --warning: #f59e0b; --error: #ef4444; --text: #e2e8f0;
            --text2: #94a3b8; --border: #334155; }
    * { margin:0; padding:0; box-sizing:border-box; }
    body { font-family:'Segoe UI',system-ui,sans-serif; background:var(--bg); color:var(--text); padding:16px; }
    h1 { font-size:1.4em; margin-bottom:4px; }
    h2 { font-size:1.05em; color:var(--accent); margin:14px 0 8px; }
    .subtitle { color:var(--text2); font-size:0.85em; margin-bottom:14px; }
    .btn { padding:7px 14px; border:none; border-radius:6px; cursor:pointer; font-size:0.8em; font-weight:600; transition:all 0.2s; }
    .btn-primary { background:var(--primary); color:white; }
    .btn-primary:hover { background:#6d28d9; }
    .btn-accent { background:var(--accent); color:#000; }
    .btn-sm { padding:4px 10px; font-size:0.75em; }
    .btn-outline { background:transparent; border:1px solid var(--border); color:var(--text); }
    .btn-outline:hover { border-color:var(--primary); }
    .row { display:flex; gap:8px; flex-wrap:wrap; margin:10px 0; }
    .branch-bar { display:flex; gap:6px; align-items:center; margin-bottom:14px; padding:8px 12px;
                  background:var(--surface); border-radius:8px; border:1px solid var(--border); }
    .branch-name { font-weight:700; color:var(--success); }
    .branch-pill { padding:3px 10px; border-radius:12px; font-size:0.75em; cursor:pointer;
                   border:1px solid var(--border); background:var(--surface); color:var(--text2); }
    .branch-pill.active { background:var(--success); color:#000; border-color:var(--success); }
    .branch-pill:hover { border-color:var(--accent); }
    .card { background:var(--surface); border:1px solid var(--border); border-radius:8px; padding:12px; margin-bottom:8px; }
    .version-card { position:relative; border-left:3px solid var(--primary); }
    .version-card.auto { border-left-color: var(--text2); }
    .version-card.manual { border-left-color: var(--accent); }
    .version-header { display:flex; justify-content:space-between; align-items:start; }
    .version-label { font-weight:700; font-size:0.95em; }
    .version-time { font-size:0.75em; color:var(--text2); }
    .version-desc { color:var(--text2); font-size:0.82em; margin:4px 0; }
    .version-stats { display:flex; gap:10px; font-size:0.75em; color:var(--text2); margin-top:6px; }
    .stat { display:flex; align-items:center; gap:3px; }
    .tag { display:inline-block; padding:1px 8px; border-radius:10px; font-size:0.7em; font-weight:600;
           background:var(--primary); color:white; margin-right:4px; }
    .tag.auto { background:var(--border); color:var(--text2); }
    .tag.manual { background:var(--accent); color:#000; }
    .version-actions { display:flex; gap:4px; margin-top:8px; }
    .diff-container { background:#111827; border-radius:8px; padding:12px; font-family:'Cascadia Code',monospace;
                      font-size:0.82em; margin:10px 0; max-height:400px; overflow-y:auto; }
    .diff-line { padding:2px 6px; border-radius:3px; margin:1px 0; }
    .diff-add { background:rgba(16,185,129,.15); color:#6ee7b7; }
    .diff-remove { background:rgba(239,68,68,.15); color:#fca5a5; }
    .diff-modify { background:rgba(245,158,11,.15); color:#fcd34d; }
    .diff-summary { font-size:0.85em; color:var(--text2); margin-bottom:8px; }
    .timeline { position:relative; padding-left:24px; }
    .timeline::before { content:''; position:absolute; left:8px; top:0; bottom:0; width:2px; background:var(--border); }
    .timeline .version-card { position:relative; }
    .timeline .version-card::before { content:''; position:absolute; left:-20px; top:14px; width:10px; height:10px;
        border-radius:50%; background:var(--primary); border:2px solid var(--bg); }
    .timeline .version-card.auto::before { background:var(--text2); }
    .select-version { padding:3px 8px; background:var(--surface); border:1px solid var(--border); border-radius:4px;
                      color:var(--text); font-size:0.8em; cursor:pointer; }
    .input { padding:6px 10px; background:var(--surface); border:1px solid var(--border); border-radius:6px;
             color:var(--text); font-size:0.85em; }
    .input:focus { outline:none; border-color:var(--primary); }
    .empty { text-align:center; padding:40px; color:var(--text2); }
    .empty .icon { font-size:2.5em; margin-bottom:8px; }
    .complexity-bar { width:80px; height:6px; background:var(--border); border-radius:3px; display:inline-block; }
    .complexity-fill { height:100%; border-radius:3px; }
</style>
</head>
<body>
    <h1>📜 Genetic Version Control</h1>
    <p class="subtitle">Historial de iteraciones, diff visual y ramas de diseño genético</p>

    <div class="branch-bar">
        <span>🌿</span>
        <span class="branch-name" id="currentBranchName">main</span>
        <div id="branchPills" style="display:flex;gap:4px;margin-left:8px;flex-wrap:wrap;"></div>
        <button class="btn btn-sm btn-outline" onclick="createBranch()">+ Nueva rama</button>
    </div>

    <div class="row">
        <button class="btn btn-primary" onclick="createSnapshot()">📸 Crear Snapshot</button>
        <button class="btn btn-accent" onclick="toggleDiff()">🔀 Comparar versiones</button>
    </div>

    <div id="diffPanel" style="display:none;">
        <div class="card">
            <h2>Comparar Versiones</h2>
            <div class="row" style="align-items:center">
                <select id="diffA" class="select-version"></select>
                <span>vs</span>
                <select id="diffB" class="select-version"></select>
                <button class="btn btn-sm btn-primary" onclick="runDiff()">Comparar</button>
            </div>
            <div id="diffResult"></div>
        </div>
    </div>

    <h2>📅 Timeline</h2>
    <div id="timeline" class="timeline">
        <div class="empty"><div class="icon">📸</div><p>No hay versiones aún. Guarde un archivo .bio o cree un snapshot.</p></div>
    </div>

<script>
    const vscode = acquireVsCodeApi();
    let versions = [];
    let branches = [];
    let currentBranch = 'main';

    function createSnapshot() {
        const label = prompt('Nombre del snapshot:', 'v' + (versions.length + 1));
        if (label) vscode.postMessage({ command: 'createSnapshot', label });
    }

    function createBranch() {
        const name = prompt('Nombre de la nueva rama:');
        if (name) vscode.postMessage({ command: 'createBranch', name });
    }

    function switchBranch(name) {
        vscode.postMessage({ command: 'switchBranch', name });
    }

    function restoreVersion(id) {
        if (confirm('¿Restaurar esta versión? Reemplazará el contenido del editor.')) {
            vscode.postMessage({ command: 'restoreVersion', versionId: id });
        }
    }

    function toggleDiff() {
        const panel = document.getElementById('diffPanel');
        panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
    }

    function runDiff() {
        const idA = document.getElementById('diffA').value;
        const idB = document.getElementById('diffB').value;
        if (idA && idB && idA !== idB) {
            vscode.postMessage({ command: 'diffVersions', idA, idB });
        }
    }

    function formatDate(ts) {
        const d = new Date(ts);
        return d.toLocaleDateString('es-ES', { day:'2-digit', month:'short', year:'numeric' }) +
               ' ' + d.toLocaleTimeString('es-ES', { hour:'2-digit', minute:'2-digit' });
    }

    function getComplexityColor(c) {
        if (c <= 3) return 'var(--success)';
        if (c <= 6) return 'var(--warning)';
        return 'var(--error)';
    }

    function renderVersions() {
        const container = document.getElementById('timeline');
        if (versions.length === 0) {
            container.innerHTML = '<div class="empty"><div class="icon">📸</div><p>No hay versiones en la rama <b>' + currentBranch + '</b>.<br>Guarde un archivo .bio o cree un snapshot.</p></div>';
            return;
        }

        container.innerHTML = versions.map(v => {
            const isManual = v.tags.includes('manual');
            return \`
                <div class="version-card card \${isManual ? 'manual' : 'auto'}">
                    <div class="version-header">
                        <div>
                            <div class="version-label">\${v.label}</div>
                            \${v.tags.map(t => '<span class="tag ' + t + '">' + t + '</span>').join('')}
                        </div>
                        <div class="version-time">\${formatDate(v.timestamp)}</div>
                    </div>
                    <div class="version-desc">\${v.description || ''}</div>
                    <div class="version-stats">
                        <span class="stat">📢 \${v.stats.promoters}P</span>
                        <span class="stat">🔗 \${v.stats.rbsCount}R</span>
                        <span class="stat">🧬 \${v.stats.genes}G</span>
                        <span class="stat">🛑 \${v.stats.terminators}T</span>
                        <span class="stat">📝 \${v.stats.linesOfCode}L</span>
                        <span class="stat">
                            <span class="complexity-bar">
                                <div class="complexity-fill" style="width:\${v.stats.complexity*10}%;background:\${getComplexityColor(v.stats.complexity)}"></div>
                            </span>
                            C:\${v.stats.complexity}
                        </span>
                    </div>
                    <div class="version-actions">
                        <button class="btn btn-sm btn-primary" onclick="restoreVersion('\${v.id}')">⏪ Restaurar</button>
                        <button class="btn btn-sm btn-outline" onclick="tagVersion('\${v.id}')">🏷️ Tag</button>
                    </div>
                </div>
            \`;
        }).join('');

        // Actualizar selectores de diff
        const optionsHtml = versions.map(v =>
            \`<option value="\${v.id}">\${v.label} (\${formatDate(v.timestamp)})</option>\`
        ).join('');
        document.getElementById('diffA').innerHTML = optionsHtml;
        document.getElementById('diffB').innerHTML = optionsHtml;
    }

    function renderBranches() {
        const pills = document.getElementById('branchPills');
        pills.innerHTML = branches.map(b =>
            \`<span class="branch-pill \${b.name === currentBranch ? 'active' : ''}"
                  onclick="switchBranch('\${b.name}')">\${b.name} (\${b.versionCount})</span>\`
        ).join('');
        document.getElementById('currentBranchName').textContent = currentBranch;
    }

    function tagVersion(id) {
        const tag = prompt('Nombre del tag:', 'release');
        if (tag) vscode.postMessage({ command: 'tagVersion', versionId: id, tag });
    }

    window.addEventListener('message', event => {
        const msg = event.data;
        if (msg.command === 'stateUpdate') {
            versions = msg.versions;
            branches = msg.branches;
            currentBranch = msg.currentBranch;
            renderVersions();
            renderBranches();
        } else if (msg.command === 'diffResult') {
            renderDiff(msg.diff);
        }
    });

    function renderDiff(diff) {
        const el = document.getElementById('diffResult');
        let html = '<div class="diff-summary">' + diff.summary + '</div>';
        if (diff.partsAdded.length) html += '<div style="color:var(--success);font-size:0.85em">+ Partes añadidas: ' + diff.partsAdded.join(', ') + '</div>';
        if (diff.partsRemoved.length) html += '<div style="color:var(--error);font-size:0.85em">- Partes eliminadas: ' + diff.partsRemoved.join(', ') + '</div>';
        html += '<div class="diff-container">';
        for (const line of diff.added) html += \`<div class="diff-line diff-add">+ L\${line.lineNumber}: \${escapeHtml(line.content)}</div>\`;
        for (const line of diff.removed) html += \`<div class="diff-line diff-remove">- L\${line.lineNumber}: \${escapeHtml(line.content)}</div>\`;
        for (const line of diff.modified) html += \`<div class="diff-line diff-modify">~ L\${line.lineNumber}: \${escapeHtml(line.content)}</div>\`;
        if (diff.added.length === 0 && diff.removed.length === 0 && diff.modified.length === 0) {
            html += '<div style="color:var(--text2);text-align:center;padding:20px;">Sin diferencias</div>';
        }
        html += '</div>';
        el.innerHTML = html;
    }

    function escapeHtml(str) {
        return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    }

    // Solicitar estado inicial
    vscode.postMessage({ command: 'refresh' });
</script>
</body>
</html>`;
    }

    dispose() {
        this.panel?.dispose();
        this.autoSaveListener?.dispose();
    }
}
