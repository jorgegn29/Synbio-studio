/**
 * SynBio-LLVM - Escáner de Bioseguridad
 * Detecta secuencias peligrosas, genes de toxinas, resistencia a antibióticos,
 * patrones de virulencia y evalúa nivel de riesgo
 * 
 * Marco regulatorio real implementado:
 *   - NIH Guidelines for Research Involving Recombinant or Synthetic Nucleic Acid
 *     Molecules (abril 2024) — https://osp.od.nih.gov/policies/biosafety/
 *   - EU Directive 2001/18/EC on the deliberate release into the environment of GMOs
 *     OJ L 106, 17.4.2001 — https://eur-lex.europa.eu/eli/dir/2001/18/oj
 *   - Cartagena Protocol on Biosafety to the Convention on Biological Diversity (2003)
 *     https://bch.cbd.int/protocol
 *   - Australia Gene Technology Act 2000 (Cth)
 *     https://www.legislation.gov.au/Details/C2021C00452
 *   - US Select Agent Rule: 42 CFR Part 73, 7 CFR Part 331, 9 CFR Part 121
 *     https://www.selectagents.gov/
 *   - WHO Laboratory Biosafety Manual, 4th Edition (2020)
 *     https://www.who.int/publications/i/item/9789240011311
 *   - iGEM Safety Policies — https://responsibility.igem.org/
 *   - Dual Use Research of Concern (DURC) — NSABB Framework
 *     https://osp.od.nih.gov/policies/durc/
 */

import * as vscode from 'vscode';
import { scanBiosecurityText, type BiosecurityFinding, type ThreatLevel } from './biosecurity-rules';

interface ScannerStatusPayload {
    passed: boolean;
    warnings: number;
    risks: number;
    bslRequired?: string;
    findings?: Array<{
        id: string;
        title: string;
        severity: 'critical' | 'high' | 'medium' | 'low';
        description: string;
        recommendation: string;
        line?: number;
        file?: string;
    }>;
    lastScannedFile?: string;
    scanTimestamp?: number;
}

export class BiosecurityScanner implements vscode.Disposable {
    private panel: vscode.WebviewPanel | undefined;
    private diagnosticCollection: vscode.DiagnosticCollection;
    private disposables: vscode.Disposable[] = [];
    private currentFindings: BiosecurityFinding[] = [];
    private currentFilename = 'unknown';
    private safetyStatusProvider?: { updateScanResults(r: ScannerStatusPayload): void };

    /** Conecta con el SafetyStatusProvider del explorer sidebar */
    setSafetyStatusProvider(provider: { updateScanResults(r: ScannerStatusPayload): void }): void {
        this.safetyStatusProvider = provider;
    }

    constructor(context: vscode.ExtensionContext) {
        this.diagnosticCollection = vscode.languages.createDiagnosticCollection('synbio-biosecurity');
        this.disposables.push(this.diagnosticCollection);

        // Limpiar diagnósticos obsoletos de archivos no-.bio al cambiar de editor
        this.disposables.push(
            vscode.window.onDidChangeActiveTextEditor(editor => {
                if (editor && !this.isBioScriptDocument(editor.document)) {
                    this.diagnosticCollection.delete(editor.document.uri);
                }
            })
        );

        this.disposables.push(
            vscode.window.onDidChangeActiveTextEditor(editor => {
                if (!this.panel || !editor || !this.isBioScriptDocument(editor.document)) {
                    return;
                }

                void this.scan(editor.document.getText(), editor.document);
            })
        );

        this.disposables.push(
            vscode.workspace.onDidSaveTextDocument(document => {
                if (!this.isBioScriptDocument(document)) {
                    this.diagnosticCollection.delete(document.uri);
                    return;
                }

                const autoScan = vscode.workspace.getConfiguration('synbio').get<boolean>('enableBiosecurityAutoScan', true);
                if (!autoScan) {
                    return;
                }

                void this.scan(document.getText(), document);
            })
        );

        this.disposables.push(
            vscode.workspace.onDidCloseTextDocument(document => {
                this.diagnosticCollection.delete(document.uri);
            })
        );

        // Limpiar diagnósticos existentes en archivos no-.bio al iniciar
        this.diagnosticCollection.clear();
    }

    private isBioScriptDocument(document: vscode.TextDocument | undefined): boolean {
        if (!document) {
            return false;
        }

        return document.languageId === 'bioscript' || document.fileName.toLowerCase().endsWith('.bio');
    }

    /**
     * Escaneo silencioso: devuelve findings sin abrir panel ni tocar diagnósticos.
     * Usado por el preflight gate antes de acciones sensibles.
     */
    scanSilent(text: string): BiosecurityFinding[] {
        return this.performScan(text, 'preflight');
    }

    /** Escanea el archivo activo o el texto proporcionado (solo archivos .bio) */
    async scan(text?: string, document?: vscode.TextDocument): Promise<BiosecurityFinding[]> {
        const editor = vscode.window.activeTextEditor;
        const targetDocument = document ?? editor?.document;
        const content = text ?? targetDocument?.getText() ?? '';
        const filename = targetDocument?.fileName || targetDocument?.uri.fsPath || 'untitled.bio';

        if (!text && !targetDocument) {
            vscode.window.showWarningMessage('No hay un archivo BioScript activo para escanear.');
            return [];
        }

        // Solo escanear documentos BioScript para evitar falsos positivos
        if (!text && targetDocument && !this.isBioScriptDocument(targetDocument)) {
            vscode.window.showWarningMessage('⚠️ Biosecurity scanner: Solo se pueden escanear documentos BioScript');
            return [];
        }

        if (!content.trim()) {
            if (targetDocument) {
                this.diagnosticCollection.delete(targetDocument.uri);
            }
            vscode.window.showWarningMessage('El documento BioScript está vacío; no hay nada que escanear.');
            return [];
        }

        const findings = this.performScan(content, filename);

        // Mostrar en panel
        this.showResults(findings, filename);

        // Agregar diagnósticos VS Code
        if (targetDocument) {
            this.updateDiagnostics(targetDocument, findings);
        }

        // Actualizar árbol Safety & Compliance en el sidebar
        if (this.safetyStatusProvider) {
            const criticalOrHigh = findings.filter(f => f.threat === 'critical' || f.threat === 'high');
            const warnings = findings.filter(f => f.threat === 'medium' || f.threat === 'low' || f.threat === 'info');
            const bslRequired = criticalOrHigh.some(f => f.category === 'Select Agent') ? 'BSL-3'
                : criticalOrHigh.length > 0 ? 'BSL-2'
                : 'BSL-1';
            const shortFile = filename.split(/[\\/]/).pop() || filename;
            const severityMap: Record<string, 'critical' | 'high' | 'medium' | 'low'> = {
                critical: 'critical', high: 'high', medium: 'medium', low: 'low', info: 'low'
            };
            const richFindings = findings.map(f => {
                const [, lineStr] = (f.location || '').split(':');
                const line = lineStr ? parseInt(lineStr, 10) : undefined;
                return {
                    id: f.id,
                    title: f.title,
                    severity: severityMap[f.threat] || 'medium',
                    description: f.description,
                    recommendation: f.recommendation,
                    line: Number.isFinite(line) ? line : undefined,
                    file: shortFile,
                };
            });
            this.safetyStatusProvider.updateScanResults({
                passed: criticalOrHigh.length === 0,
                warnings: warnings.length,
                risks: criticalOrHigh.length,
                bslRequired,
                findings: richFindings,
                lastScannedFile: shortFile,
                scanTimestamp: Date.now(),
            });
        }

        return findings;
    }

    /** Análisis de seguridad del código */
    private performScan(content: string, filename: string): BiosecurityFinding[] {
        return scanBiosecurityText(content, filename);
    }

    /** Actualiza diagnósticos de VS Code */
    private updateDiagnostics(document: vscode.TextDocument, findings: BiosecurityFinding[]): void {
        const diagnostics: vscode.Diagnostic[] = [];

        for (const finding of findings) {
            const lineMatch = finding.location.match(/:(\d+)$/);
            const lineNum = lineMatch ? parseInt(lineMatch[1]) - 1 : 0;
            const line = document.lineAt(Math.min(lineNum, document.lineCount - 1));

            const severity = finding.threat === 'critical'
                ? vscode.DiagnosticSeverity.Error
                : finding.threat === 'high'
                    ? vscode.DiagnosticSeverity.Warning
                    : vscode.DiagnosticSeverity.Information;

            const diag = new vscode.Diagnostic(
                line.range,
                `[Bioseguridad] ${finding.title}: ${finding.description}`,
                severity
            );
            diag.source = 'SynBio Biosecurity';
            diag.code = finding.id;
            diagnostics.push(diag);
        }

        this.diagnosticCollection.set(document.uri, diagnostics);
    }

    /** Muestra resultados en WebView */
    private showResults(findings: BiosecurityFinding[], filename: string): void {
        this.currentFindings = findings;
        this.currentFilename = filename;

        if (this.panel) { this.panel.reveal(); }
        else {
            this.panel = vscode.window.createWebviewPanel(
                'synbioBiosecurity',
                '🛡️ Bioseguridad',
                vscode.ViewColumn.Two,
                { enableScripts: true, retainContextWhenHidden: true }
            );

            this.panel.webview.onDidReceiveMessage(async msg => {
                switch (msg.type) {
                    case 'rescan':
                        await this.scan();
                        break;
                    case 'exportReport':
                        await this.exportReport();
                        break;
                }
            }, undefined, this.disposables);

            this.panel.onDidDispose(() => { this.panel = undefined; }, null, this.disposables);
        }

        const critical = findings.filter(f => f.threat === 'critical').length;
        const high = findings.filter(f => f.threat === 'high').length;
        const medium = findings.filter(f => f.threat === 'medium').length;
        const low = findings.filter(f => f.threat === 'low').length;
        const info = findings.filter(f => f.threat === 'info').length;

        const riskScore = critical * 100 + high * 40 + medium * 15 + low * 5 + info;
        const riskLevel = critical > 0 ? 'CRÍTICO' : high > 0 ? 'ALTO' : medium > 0 ? 'MODERADO' : 'BAJO';
        const riskColor = critical > 0 ? '#f38ba8' : high > 0 ? '#fab387' : medium > 0 ? '#f9e2af' : '#a6e3a1';

        this.panel.webview.html = this.getResultsHTML(findings, filename, { critical, high, medium, low, info, riskScore, riskLevel, riskColor });
    }

    private async exportReport(): Promise<void> {
        const critical = this.currentFindings.filter(f => f.threat === 'critical').length;
        const high = this.currentFindings.filter(f => f.threat === 'high').length;
        const medium = this.currentFindings.filter(f => f.threat === 'medium').length;
        const low = this.currentFindings.filter(f => f.threat === 'low').length;
        const info = this.currentFindings.filter(f => f.threat === 'info').length;
        const riskLevel = critical > 0 ? 'CRITICO' : high > 0 ? 'ALTO' : medium > 0 ? 'MODERADO' : 'BAJO';

        const report = [
            '# Reporte de Bioseguridad',
            '',
            `Archivo: ${this.currentFilename.split(/[\\/]/).pop() || this.currentFilename}`,
            `Hallazgos: ${this.currentFindings.length}`,
            `Riesgo: ${riskLevel}`,
            '',
            '## Resumen',
            `- Critico: ${critical}`,
            `- Alto: ${high}`,
            `- Medio: ${medium}`,
            `- Bajo: ${low}`,
            `- Informativo: ${info}`,
            '',
            '## Hallazgos',
            this.currentFindings.length === 0
                ? '- No se detectaron amenazas de bioseguridad.'
                : this.currentFindings.map(f => [
                    `### ${f.title}`,
                    `- ID: ${f.id}`,
                    `- Categoria: ${f.category}`,
                    `- Amenaza: ${f.threat}`,
                    `- Ubicacion: ${f.location}`,
                    `- Descripcion: ${f.description}`,
                    `- Recomendacion: ${f.recommendation}`,
                    `- Regulacion: ${f.regulation}`,
                    f.matchedSequence ? `- Contexto: ${f.matchedSequence}` : ''
                ].filter(Boolean).join('\n')).join('\n\n')
        ].join('\n');

        const safeBaseName = (this.currentFilename.split(/[\\/]/).pop() || 'biosecurity-report').replace(/\.[^.]+$/, '');
        const uri = await vscode.window.showSaveDialog({
            filters: { Markdown: ['md'] },
            defaultUri: vscode.Uri.file(`${safeBaseName}-biosecurity-report.md`)
        });

        if (!uri) {
            return;
        }

        await vscode.workspace.fs.writeFile(uri, Buffer.from(report, 'utf8'));
        vscode.window.showInformationMessage(`Reporte de bioseguridad guardado: ${uri.fsPath}`);
    }

    private getResultsHTML(findings: BiosecurityFinding[], filename: string, stats: any): string {
        const threatColors: Record<ThreatLevel, string> = {
            critical: '#f38ba8',
            high: '#fab387',
            medium: '#f9e2af',
            low: '#a6e3a1',
            info: '#89b4fa'
        };

        const threatIcons: Record<ThreatLevel, string> = {
            critical: '🔴',
            high: '🟠',
            medium: '🟡',
            low: '🟢',
            info: '🔵'
        };

        const findingsHTML = findings.length === 0
            ? '<div style="text-align:center; padding:60px; color:#a6e3a1; font-size:18px;">✅ No se detectaron amenazas de bioseguridad<br/><span style="font-size:13px; color:#6c7086;">El circuito parece seguro para uso estándar en laboratorio</span></div>'
            : findings.map(f => `
                <div class="finding" style="border-left: 3px solid ${threatColors[f.threat]};">
                    <div class="finding-header">
                        <span class="threat-icon">${threatIcons[f.threat]}</span>
                        <span class="finding-title">${f.title}</span>
                        <span class="threat-badge" style="background:${threatColors[f.threat]}20; color:${threatColors[f.threat]};">${f.threat.toUpperCase()}</span>
                        <span class="category-badge">${f.category}</span>
                    </div>
                    <p class="finding-desc">${f.description}</p>
                    ${f.matchedSequence ? `<div class="match-context"><code>...${this.escapeHtml(f.matchedSequence)}...</code></div>` : ''}
                    <div class="finding-meta">
                        <div><strong>📍 Ubicación:</strong> ${f.location}</div>
                        <div><strong>📋 Recomendación:</strong> ${f.recommendation}</div>
                        <div><strong>📜 Regulación:</strong> ${f.regulation}</div>
                    </div>
                </div>
            `).join('');

        return `<!DOCTYPE html>
<html lang="es"><head>
<meta charset="UTF-8">
<style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Segoe UI', sans-serif; background: #1e1e2e; color: #cdd6f4; padding: 20px; }
    .header { margin-bottom: 20px; }
    .header h1 { font-size: 22px; color: #94e2d5; display: flex; align-items: center; gap: 8px; }
    .toolbar { display: flex; gap: 10px; margin: 12px 0 16px; }
    .toolbar button { background: #181825; color: #cdd6f4; border: 1px solid #45475a; border-radius: 8px; padding: 8px 12px; cursor: pointer; font-size: 12px; }
    .toolbar button:hover { border-color: #89b4fa; }
    .file-badge { font-size: 12px; color: #6c7086; background: #313244; padding: 4px 10px; border-radius: 8px; margin-left: 8px; }
    .risk-banner { background: #313244; border-radius: 12px; padding: 20px; margin: 16px 0; display: flex; align-items: center; gap: 20px; border: 1px solid ${stats.riskColor}40; }
    .risk-circle { width: 80px; height: 80px; border-radius: 50%; border: 4px solid ${stats.riskColor}; display: flex; flex-direction: column; align-items: center; justify-content: center; }
    .risk-circle .score { font-size: 22px; font-weight: 700; color: ${stats.riskColor}; }
    .risk-circle .label { font-size: 8px; color: #6c7086; text-transform: uppercase; }
    .risk-info h2 { color: ${stats.riskColor}; font-size: 18px; }
    .risk-info p { color: #a6adc8; font-size: 13px; margin-top: 4px; }
    .stats-row { display: flex; gap: 10px; margin-top: 10px; }
    .stat { padding: 4px 12px; border-radius: 8px; font-size: 12px; font-weight: 600; }
    .stat.critical { background: #f38ba820; color: #f38ba8; }
    .stat.high { background: #fab38720; color: #fab387; }
    .stat.medium { background: #f9e2af20; color: #f9e2af; }
    .stat.low { background: #a6e3a120; color: #a6e3a1; }
    .findings { display: flex; flex-direction: column; gap: 10px; }
    .finding { background: #313244; border-radius: 10px; padding: 14px; }
    .finding-header { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; }
    .threat-icon { font-size: 16px; }
    .finding-title { font-weight: 600; font-size: 14px; flex: 1; }
    .threat-badge { padding: 2px 8px; border-radius: 10px; font-size: 10px; font-weight: 700; }
    .category-badge { background: #45475a; color: #a6adc8; padding: 2px 8px; border-radius: 10px; font-size: 10px; }
    .finding-desc { font-size: 13px; color: #a6adc8; margin-bottom: 8px; line-height: 1.5; }
    .match-context { background: #1e1e2e; padding: 6px 10px; border-radius: 6px; margin-bottom: 8px; }
    .match-context code { font-family: 'Cascadia Code', monospace; font-size: 11px; color: #f38ba8; }
    .finding-meta { display: flex; flex-direction: column; gap: 4px; font-size: 12px; color: #a6adc8; }
    .finding-meta strong { color: #cdd6f4; }
    .section-title { font-size: 16px; color: #94e2d5; margin: 20px 0 10px; display: flex; align-items: center; gap: 8px; }
</style>
</head><body>
    <div class="header">
        <h1>🛡️ Análisis de Bioseguridad <span class="file-badge">${this.escapeHtml(filename.split(/[\\/]/).pop() || filename)}</span></h1>
    </div>

    <div class="toolbar">
        <button onclick="rescan()">Reanalizar archivo actual</button>
        <button onclick="exportReport()">Exportar reporte</button>
    </div>

    <div class="risk-banner">
        <div class="risk-circle">
            <span class="score">${stats.riskScore}</span>
            <span class="label">puntos</span>
        </div>
        <div class="risk-info">
            <h2>Nivel de Riesgo: ${stats.riskLevel}</h2>
            <p>${findings.length} hallazgo(s) detectado(s) en el análisis</p>
            <div class="stats-row">
                ${stats.critical > 0 ? `<span class="stat critical">🔴 ${stats.critical} Crítico</span>` : ''}
                ${stats.high > 0 ? `<span class="stat high">🟠 ${stats.high} Alto</span>` : ''}
                ${stats.medium > 0 ? `<span class="stat medium">🟡 ${stats.medium} Medio</span>` : ''}
                ${stats.low > 0 ? `<span class="stat low">🟢 ${stats.low} Bajo</span>` : ''}
            </div>
        </div>
    </div>

    <h3 class="section-title">📋 Hallazgos Detallados</h3>
    <div class="findings">${findingsHTML}</div>

<script>
const vscode = acquireVsCodeApi();
function rescan() { vscode.postMessage({ type: 'rescan' }); }
function exportReport() { vscode.postMessage({ type: 'exportReport' }); }
</script>
</body></html>`;
    }

    private escapeHtml(text: string): string {
        return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    dispose(): void {
        this.diagnosticCollection.dispose();
        this.panel?.dispose();
        this.disposables.forEach(d => d.dispose());
    }
}
