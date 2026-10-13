import * as vscode from 'vscode';

/**
 * SynBio-LLVM — Fase 8: Generador de Documentación Automática
 * 
 * Genera reportes de diseño, entradas de cuaderno de laboratorio,
 * diagramas SVG de circuitos, documentación de cumplimiento y fichas técnicas.
 */

// ── Tipos ──────────────────────────────────────────────────────────────

interface CircuitDocumentation {
    title: string;
    date: string;
    circuitName: string;
    summary: string;
    components: ComponentDoc[];
    regulatoryNetwork: string;
    safetyAssessment: SafetyDoc;
    designRationale: string;
    references: string[];
    svgDiagram: string;
    labNotebookEntry: string;
    complianceReport: string;
}

interface ComponentDoc {
    type: string;
    name: string;
    properties: Record<string, string>;
    description: string;
    igemPart?: string;
}

interface SafetyDoc {
    riskLevel: 'low' | 'medium' | 'high';
    hasKillSwitch: boolean;
    antibioticResistance: string[];
    biosecurityFlags: string[];
    containmentLevel: string;
}

// ── Clase principal ────────────────────────────────────────────────────

export class AutoDocumentationGenerator implements vscode.Disposable {
    private panel: vscode.WebviewPanel | undefined;
    private context: vscode.ExtensionContext;
    private outputChannel: vscode.OutputChannel;

    constructor(context: vscode.ExtensionContext) {
        this.context = context;
        this.outputChannel = vscode.window.createOutputChannel('SynBio Documentation');
    }

    async show() {
        if (this.panel) {
            this.panel.reveal(vscode.ViewColumn.Two);
            return;
        }

        this.panel = vscode.window.createWebviewPanel(
            'synbioDocumentation',
            '📄 Auto Documentation',
            vscode.ViewColumn.Two,
            { enableScripts: true }
        );

        this.panel.webview.html = this.getWebviewContent();

        this.panel.webview.onDidReceiveMessage(async msg => {
            switch (msg.command) {
                case 'generateFull':
                    await this.generateFullDocumentation();
                    break;
                case 'generateLabNotebook':
                    await this.generateLabNotebook();
                    break;
                case 'generateCompliance':
                    await this.generateComplianceReport();
                    break;
                case 'generateDatasheet':
                    await this.generateDatasheet();
                    break;
                case 'exportMarkdown':
                    await this.exportToMarkdown(msg.content);
                    break;
                case 'exportHTML':
                    await this.exportToHTML(msg.content);
                    break;
            }
        });

        this.panel.onDidDispose(() => { this.panel = undefined; });
    }

    /**
     * Genera documentación completa del circuito
     */
    private async generateFullDocumentation() {
        const editor = vscode.window.activeTextEditor;
        if (!editor || editor.document.languageId !== 'bioscript') {
            vscode.window.showWarningMessage('Abra un archivo .bio para generar documentación');
            return;
        }

        const text = editor.document.getText();
        const doc = this.parseCircuit(text);

        this.panel?.webview.postMessage({
            command: 'documentationReady',
            documentation: doc,
            type: 'full'
        });
    }

    private async generateLabNotebook() {
        const editor = vscode.window.activeTextEditor;
        if (!editor) return;
        const text = editor.document.getText();
        const doc = this.parseCircuit(text);

        this.panel?.webview.postMessage({
            command: 'documentationReady',
            documentation: doc,
            type: 'notebook'
        });
    }

    private async generateComplianceReport() {
        const editor = vscode.window.activeTextEditor;
        if (!editor) return;
        const text = editor.document.getText();
        const doc = this.parseCircuit(text);

        this.panel?.webview.postMessage({
            command: 'documentationReady',
            documentation: doc,
            type: 'compliance'
        });
    }

    private async generateDatasheet() {
        const editor = vscode.window.activeTextEditor;
        if (!editor) return;
        const text = editor.document.getText();
        const doc = this.parseCircuit(text);

        this.panel?.webview.postMessage({
            command: 'documentationReady',
            documentation: doc,
            type: 'datasheet'
        });
    }

    // ── Parser del circuito ────────────────────────────────────────────

    private parseCircuit(text: string): CircuitDocumentation {
        const lines = text.split('\n');
        const circuitName = text.match(/genetic_circuit\s+(\w+)/)?.[1] || 'unnamed_circuit';

        const components = this.extractComponents(lines);
        const safety = this.assessSafety(text, components);
        const svgDiagram = this.generateSVGDiagram(components);
        const regulatoryNetwork = this.describeRegulation(text, components);
        const labNotebookEntry = this.generateLabNotebookText(circuitName, components, safety);
        const complianceReport = this.generateComplianceText(circuitName, components, safety);
        const designRationale = this.inferDesignRationale(text, components);

        return {
            title: `Documentación: ${circuitName}`,
            date: new Date().toLocaleDateString('es-ES', { 
                weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' 
            }),
            circuitName,
            summary: this.generateSummary(components, safety),
            components,
            regulatoryNetwork,
            safetyAssessment: safety,
            designRationale,
            references: this.generateReferences(components),
            svgDiagram,
            labNotebookEntry,
            complianceReport
        };
    }

    private extractComponents(lines: string[]): ComponentDoc[] {
        const components: ComponentDoc[] = [];
        const componentRegex = /^\s*(promoter|rbs|gene|terminator|kill_switch)\s+(\w+)\s*\(([^)]*)\)/;

        for (const line of lines) {
            const match = line.match(componentRegex);
            if (match) {
                const [, type, name, propsStr] = match;
                const properties: Record<string, string> = {};
                const propMatches = propsStr.matchAll(/(\w+):\s*("([^"]*)"|([\d.]+)|(\w+))/g);
                for (const pm of propMatches) {
                    properties[pm[1]] = pm[3] || pm[4] || pm[5] || pm[2];
                }

                const seqMatch = line.match(/sequence:\s*"([^"]+)"/);
                if (seqMatch) properties['sequence'] = seqMatch[1];

                components.push({
                    type,
                    name,
                    properties,
                    description: this.describeComponent(type, name, properties),
                    igemPart: this.matchIgemPart(type, name)
                });
            }
        }
        return components;
    }

    private describeComponent(type: string, name: string, props: Record<string, string>): string {
        switch (type) {
            case 'promoter': {
                const pType = props['type'] || 'constitutive';
                const strength = props['strength'] || 'no especificada';
                if (pType === 'inducible') return `Promotor inducible por ${props['inducer'] || 'señal externa'}, fuerza: ${strength}`;
                if (pType === 'repressible') return `Promotor reprimible por ${props['repressor'] || 'represor'}, fuerza: ${strength}`;
                return `Promotor constitutivo con fuerza ${strength}`;
            }
            case 'rbs': return `Sitio de unión al ribosoma con fuerza de traducción ${props['strength'] || 'no especificada'}`;
            case 'gene': return `Gen codificante que produce ${props['product'] || name}${props['sequence'] ? ` (${props['sequence'].length} bp)` : ''}`;
            case 'terminator': return `Terminador de transcripción con eficiencia ${props['efficiency'] || 'no especificada'}`;
            case 'kill_switch': return `Mecanismo de seguridad tipo toxina-antitoxina`;
            default: return `Componente genético ${type}`;
        }
    }

    private matchIgemPart(type: string, name: string): string | undefined {
        const igemMap: Record<string, string> = {
            'pLac': 'BBa_R0010', 'pTet': 'BBa_R0040', 'pBad': 'BBa_I0500',
            'gfp': 'BBa_E0040', 'GFP': 'BBa_E0040', 'mRFP1': 'BBa_E1010',
            'rfp': 'BBa_E1010', 'yfp': 'BBa_K592009', 'bfp': 'BBa_K592100',
            'B0034': 'BBa_B0034', 'B0032': 'BBa_B0032', 'B0031': 'BBa_B0031',
            'dblTerm': 'BBa_B0015', 'B0015': 'BBa_B0015', 'B0010': 'BBa_B0010'
        };
        return igemMap[name];
    }

    private assessSafety(text: string, components: ComponentDoc[]): SafetyDoc {
        const hasKillSwitch = components.some(c => c.type === 'kill_switch') || text.includes('kill_switch');
        const antibioticResistance: string[] = [];
        if (text.match(/ampicillin|ampR|bla/i)) antibioticResistance.push('Ampicilina (ampR)');
        if (text.match(/kanamycin|kanR|nptII/i)) antibioticResistance.push('Kanamicina (kanR)');
        if (text.match(/chloramphenicol|cmR|cat/i)) antibioticResistance.push('Cloranfenicol (cmR)');
        if (text.match(/tetracycline|tetR_resistance/i)) antibioticResistance.push('Tetraciclina');

        const biosecurityFlags: string[] = [];
        if (text.match(/toxin|CcdB|MazF|RelE/i)) biosecurityFlags.push('Contiene genes de toxina');
        if (antibioticResistance.length > 1) biosecurityFlags.push('Múltiples resistencias antibióticas');

        // Risk assessment based on NIH Guidelines for Research Involving Recombinant or Synthetic
        // Nucleic Acid Molecules (April 2024), Sections III-D (BSL-1) and III-E (BSL-2+).
        // BSL is determined by the ORGANISM risk group (CDC/NIH BMBL 6th Ed.), NOT by circuit complexity.
        // E. coli K-12 strains (DH5α, BL21, TOP10) = Risk Group 1 = BSL-1.
        // BSL-2 requires Risk Group 2 organisms (e.g., S. aureus, pathogenic E. coli).
        let riskLevel: 'low' | 'medium' | 'high' = 'low';
        if (biosecurityFlags.length > 0) riskLevel = 'medium';
        if (antibioticResistance.length > 2) riskLevel = 'medium'; // NIH: multiple AR requires IBC review

        // Containment: based on host organism risk group, per CDC/NIH BMBL 6th Edition
        // Default BSL-1 for E. coli K-12 derivatives (Risk Group 1)
        // BSL-2 flag only if select agents or toxin-related sequences detected
        const hasSelectAgent = biosecurityFlags.some(f => f.toLowerCase().includes('toxin'));
        const containmentNote = hasSelectAgent
            ? 'BSL-2 (toxin genes detected — verify with IBC per NIH Guidelines III-E and 42 CFR §73)'
            : 'BSL-1 (E. coli K-12 derivatives — NIH Guidelines III-F, exempt if no Risk Group 2+ sequences)';

        return {
            riskLevel,
            hasKillSwitch,
            antibioticResistance,
            biosecurityFlags,
            containmentLevel: containmentNote
        };
    }

    private describeRegulation(text: string, components: ComponentDoc[]): string {
        const parts: string[] = [];
        const promoters = components.filter(c => c.type === 'promoter');

        for (const p of promoters) {
            const type = p.properties['type'] || 'constitutive';
            if (type === 'inducible') {
                parts.push(`**${p.name}** se activa en presencia de ${p.properties['inducer'] || 'inductor'}`);
            } else if (type === 'repressible') {
                parts.push(`**${p.name}** se reprime por ${p.properties['repressor'] || 'represor'}`);
            } else {
                parts.push(`**${p.name}** expresión constitutiva (fuerza: ${p.properties['strength'] || '?'})`);
            }
        }

        // Detectar feed-back loops
        const genes = components.filter(c => c.type === 'gene');
        for (const g of genes) {
            const product = g.properties['product'] || g.name;
            const regulatedPromoter = promoters.find(p =>
                p.properties['repressor'] === product || p.properties['activator'] === product
            );
            if (regulatedPromoter) {
                parts.push(`${product} (de ${g.name}) regula ${regulatedPromoter.name} → **circuito de retroalimentación**`);
            }
        }

        return parts.length > 0 ? parts.join('\n\n') : 'Red regulatoria simple sin retroalimentación detectada.';
    }

    private generateSummary(components: ComponentDoc[], safety: SafetyDoc): string {
        const counts: Record<string, number> = {};
        for (const c of components) {
            counts[c.type] = (counts[c.type] || 0) + 1;
        }
        const partsDesc = Object.entries(counts).map(([k, v]) => `${v} ${k}(s)`).join(', ');
        return `Circuito genético compuesto por ${components.length} componentes (${partsDesc}). ` +
               `Nivel de riesgo: ${safety.riskLevel}. ${safety.hasKillSwitch ? 'Incluye kill switch.' : 'Sin kill switch.'}`;
    }

    private inferDesignRationale(text: string, components: ComponentDoc[]): string {
        const rationale: string[] = [];

        const promoters = components.filter(c => c.type === 'promoter');
        const inducibleCount = promoters.filter(p => p.properties['type'] === 'inducible').length;

        if (inducibleCount > 0) {
            rationale.push('Se utilizan promotores inducibles para control externo de la expresión génica.');
        }
        if (components.some(c => c.type === 'kill_switch')) {
            rationale.push('Se incluye un kill switch como medida de biocontención.');
        }
        if (text.includes('repressilator') || text.includes('oscillat')) {
            rationale.push('El diseño implementa un oscilador sintético para generar expresión periódica.');
        }
        if (text.includes('toggle') || text.includes('switch')) {
            rationale.push('El diseño implementa un interruptor biestable para memoria genética.');
        }
        if (text.includes('GFP') || text.includes('RFP') || text.includes('reporter')) {
            rationale.push('Se incluyen reporteros fluorescentes para visualización y medición.');
        }

        return rationale.length > 0 ? rationale.join(' ') :
            'Circuito de propósito general. Añada comentarios al código para mejorar la documentación automática.';
    }

    private generateReferences(components: ComponentDoc[]): string[] {
        const refs: string[] = [
            'iGEM Registry of Standard Biological Parts — http://parts.igem.org',
            'Salis Lab RBS Calculator — https://salislab.net/software'
        ];
        if (components.some(c => c.igemPart)) {
            const igemParts = components.filter(c => c.igemPart).map(c => c.igemPart);
            refs.push(`Partes iGEM utilizadas: ${igemParts.join(', ')}`);
        }
        return refs;
    }

    // ── Generador SVG ──────────────────────────────────────────────────

    private generateSVGDiagram(components: ComponentDoc[]): string {
        const width = Math.max(600, components.length * 120 + 80);
        const height = 200;
        let x = 40;
        const y = 80;
        const spacing = 110;
        let svgParts = '';

        // Línea backbone
        svgParts += `<line x1="30" y1="${y+30}" x2="${width-30}" y2="${y+30}" stroke="#64748b" stroke-width="3"/>`;

        for (const comp of components) {
            const color = this.getPartColor(comp.type);
            const symbol = this.getPartSVGSymbol(comp.type, x, y, color);
            svgParts += symbol;
            // Etiqueta
            svgParts += `<text x="${x+25}" y="${y+75}" text-anchor="middle" fill="#e2e8f0" font-size="11" font-family="Segoe UI">${comp.name}</text>`;
            svgParts += `<text x="${x+25}" y="${y+90}" text-anchor="middle" fill="#94a3b8" font-size="9" font-family="Segoe UI">${comp.type}</text>`;
            x += spacing;
        }

        return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">
            <rect width="100%" height="100%" fill="#1e1e2e" rx="8"/>
            <text x="${width/2}" y="25" text-anchor="middle" fill="#22d3ee" font-size="14" font-weight="bold" font-family="Segoe UI">Diagrama del Circuito</text>
            ${svgParts}
        </svg>`;
    }

    private getPartColor(type: string): string {
        const colors: Record<string, string> = {
            'promoter': '#10b981', 'rbs': '#3b82f6', 'gene': '#f59e0b',
            'terminator': '#ef4444', 'kill_switch': '#8b5cf6'
        };
        return colors[type] || '#94a3b8';
    }

    private getPartSVGSymbol(type: string, x: number, y: number, color: string): string {
        switch (type) {
            case 'promoter':
                return `<g transform="translate(${x},${y})">
                    <line x1="5" y1="50" x2="25" y2="50" stroke="${color}" stroke-width="3"/>
                    <line x1="25" y1="50" x2="25" y2="15" stroke="${color}" stroke-width="3"/>
                    <polygon points="25,10 45,30 25,30" fill="${color}"/>
                </g>`;
            case 'rbs':
                return `<g transform="translate(${x},${y})">
                    <circle cx="25" cy="35" r="15" fill="none" stroke="${color}" stroke-width="3"/>
                    <circle cx="25" cy="35" r="5" fill="${color}"/>
                </g>`;
            case 'gene':
                return `<g transform="translate(${x},${y})">
                    <polygon points="5,20 45,20 55,35 45,50 5,50" fill="${color}" opacity="0.8"/>
                    <text x="25" y="40" text-anchor="middle" fill="#1e1e2e" font-size="10" font-weight="bold">CDS</text>
                </g>`;
            case 'terminator':
                return `<g transform="translate(${x},${y})">
                    <line x1="25" y1="50" x2="25" y2="15" stroke="${color}" stroke-width="3"/>
                    <line x1="10" y1="15" x2="40" y2="15" stroke="${color}" stroke-width="4"/>
                </g>`;
            case 'kill_switch':
                return `<g transform="translate(${x},${y})">
                    <rect x="5" y="15" width="40" height="40" rx="5" fill="none" stroke="${color}" stroke-width="2" stroke-dasharray="4"/>
                    <text x="25" y="40" text-anchor="middle" fill="${color}" font-size="18">☠</text>
                </g>`;
            default:
                return `<rect x="${x+5}" y="${y+15}" width="40" height="40" rx="4" fill="${color}" opacity="0.5"/>`;
        }
    }

    // ── Generadores de texto ───────────────────────────────────────────

    private generateLabNotebookText(name: string, components: ComponentDoc[], safety: SafetyDoc): string {
        const date = new Date().toLocaleDateString('es-ES', { year: 'numeric', month: 'long', day: 'numeric' });
        const parts = components.map(c => `- **${c.name}** (${c.type}): ${c.description}`).join('\n');
        return `# Cuaderno de Laboratorio\n\n` +
               `**Fecha:** ${date}\n` +
               `**Proyecto:** ${name}\n` +
               `**Investigador:** _rellenar_\n\n` +
               `## Objetivo\nConstruir y caracterizar el circuito genético ${name}.\n\n` +
               `## Componentes utilizados\n${parts}\n\n` +
               `## Nivel de seguridad\n- **Riesgo:** ${safety.riskLevel}\n` +
               `- **Kill switch:** ${safety.hasKillSwitch ? 'Sí' : 'No'}\n` +
               `- **Contención:** ${safety.containmentLevel}\n\n` +
               `## Protocolo\n1. Obtener las partes del registro iGEM\n` +
               `2. Ensamblar mediante método de ensamblaje seleccionado\n` +
               `3. Transformar en cepa competente\n` +
               `4. Verificar por PCR de colonia y secuenciación\n\n` +
               `## Resultados\n_Pendiente de experimento_\n\n` +
               `## Observaciones\n_Añadir observaciones durante el experimento_\n`;
    }

    private generateComplianceText(name: string, components: ComponentDoc[], safety: SafetyDoc): string {
        return `# Reporte de Cumplimiento Bioseguridad\n\n` +
               `**Circuito:** ${name}\n` +
               `**Fecha:** ${new Date().toLocaleDateString('es-ES')}\n` +
               `**Nivel de riesgo:** ${safety.riskLevel.toUpperCase()}\n\n` +
               `## 1. Evaluación de Riesgo\n` +
               `- Nivel de contención recomendado: **${safety.containmentLevel}**\n` +
               `- Kill switch incluido: **${safety.hasKillSwitch ? '✅ Sí' : '❌ No'}**\n\n` +
               `## 2. Resistencias Antibióticas\n` +
               (safety.antibioticResistance.length > 0
                    ? safety.antibioticResistance.map(r => `- ${r}`).join('\n')
                    : '- Ninguna detectada') +
               `\n\n## 3. Alertas de Bioseguridad\n` +
               (safety.biosecurityFlags.length > 0
                    ? safety.biosecurityFlags.map(f => `- ⚠️ ${f}`).join('\n')
                    : '- ✅ Sin alertas') +
               `\n\n## 4. Componentes (${components.length} total)\n` +
               components.map(c => `| ${c.type} | ${c.name} | ${c.igemPart || 'N/A'} |`).join('\n') +
               `\n\n## 5. Recomendaciones\n` +
               (!safety.hasKillSwitch ? '- **RECOMENDADO:** Añadir kill switch para biocontención\n' : '') +
               (safety.antibioticResistance.length > 1 ? '- **ATENCIÓN:** Minimizar resistencias antibióticas\n' : '') +
               `- Seguir directrices institucionales de bioseguridad (IBC)\n` +
               `- Documentar todos los organismos modificados en el inventario del laboratorio\n`;
    }

    // ── Exportadores ───────────────────────────────────────────────────

    private async exportToMarkdown(content: string) {
        const uri = await vscode.window.showSaveDialog({
            defaultUri: vscode.Uri.file('circuit-documentation.md'),
            filters: { 'Markdown': ['md'] }
        });
        if (uri) {
            await vscode.workspace.fs.writeFile(uri, Buffer.from(content, 'utf-8'));
            vscode.window.showInformationMessage(`📄 Documentación exportada: ${uri.fsPath}`);
        }
    }

    private async exportToHTML(content: string) {
        const htmlContent = `<!DOCTYPE html><html><head><meta charset="UTF-8">
        <style>body{font-family:Segoe UI,system-ui;max-width:900px;margin:0 auto;padding:20px;background:#f8fafc;color:#1e293b}
        h1{color:#7c3aed}h2{color:#0891b2;border-bottom:2px solid #e2e8f0;padding-bottom:4px}
        table{border-collapse:collapse;width:100%}th,td{border:1px solid #cbd5e1;padding:8px;text-align:left}
        th{background:#f1f5f9}.risk-high{color:#dc2626}.risk-medium{color:#d97706}.risk-low{color:#16a34a}
        code{background:#e2e8f0;padding:2px 6px;border-radius:3px;font-size:0.9em}
        .badge{display:inline-block;padding:2px 8px;border-radius:12px;font-size:0.8em;font-weight:600}
        </style></head><body>${this.markdownToHTML(content)}</body></html>`;

        const uri = await vscode.window.showSaveDialog({
            defaultUri: vscode.Uri.file('circuit-documentation.html'),
            filters: { 'HTML': ['html'] }
        });
        if (uri) {
            await vscode.workspace.fs.writeFile(uri, Buffer.from(htmlContent, 'utf-8'));
            vscode.window.showInformationMessage(`🌐 Documentación HTML exportada: ${uri.fsPath}`);
        }
    }

    private markdownToHTML(md: string): string {
        return md
            .replace(/^### (.+)$/gm, '<h3>$1</h3>')
            .replace(/^## (.+)$/gm, '<h2>$1</h2>')
            .replace(/^# (.+)$/gm, '<h1>$1</h1>')
            .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
            .replace(/\*(.+?)\*/g, '<em>$1</em>')
            .replace(/^- (.+)$/gm, '<li>$1</li>')
            .replace(/(<li>.*<\/li>\n?)+/g, '<ul>$&</ul>')
            .replace(/\n{2,}/g, '</p><p>')
            .replace(/\n/g, '<br>');
    }

    // ── WebView ────────────────────────────────────────────────────────

    private getWebviewContent(): string {
        return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>Auto Documentation</title>
<style>
    :root { --bg:#1e1e2e; --surface:#2a2a3e; --primary:#7c3aed; --accent:#22d3ee;
            --success:#10b981; --warning:#f59e0b; --error:#ef4444; --text:#e2e8f0;
            --text2:#94a3b8; --border:#334155; }
    * { margin:0; padding:0; box-sizing:border-box; }
    body { font-family:'Segoe UI',system-ui,sans-serif; background:var(--bg); color:var(--text); padding:16px; }
    h1 { font-size:1.4em; margin-bottom:4px; }
    h2 { font-size:1.05em; color:var(--accent); margin:16px 0 8px; }
    h3 { font-size:0.95em; margin:10px 0 6px; }
    .subtitle { color:var(--text2); font-size:0.85em; margin-bottom:14px; }
    .btn { padding:8px 16px; border:none; border-radius:6px; cursor:pointer; font-size:0.85em;
           font-weight:600; transition:all 0.2s; }
    .btn-primary { background:var(--primary); color:white; }
    .btn-primary:hover { background:#6d28d9; }
    .btn-accent { background:var(--accent); color:#000; }
    .btn-success { background:var(--success); color:white; }
    .btn-outline { background:transparent; border:1px solid var(--border); color:var(--text); }
    .btn-outline:hover { border-color:var(--primary); }
    .btn-sm { padding:5px 12px; font-size:0.8em; }
    .row { display:flex; gap:8px; flex-wrap:wrap; margin:10px 0; }
    .card { background:var(--surface); border:1px solid var(--border); border-radius:8px; padding:14px; margin:10px 0; }
    .grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(200px,1fr)); gap:10px; }
    .gen-card { background:var(--surface); border:1px solid var(--border); border-radius:8px; padding:16px;
                text-align:center; cursor:pointer; transition:all 0.2s; }
    .gen-card:hover { border-color:var(--primary); transform:translateY(-2px); }
    .gen-card .icon { font-size:2em; margin-bottom:8px; }
    .gen-card .title { font-weight:700; font-size:0.95em; }
    .gen-card .desc { color:var(--text2); font-size:0.8em; margin-top:4px; }
    .doc-output { background:#111827; border-radius:8px; padding:16px; margin:12px 0;
                  font-family:'Cascadia Code',monospace; font-size:0.85em; line-height:1.6;
                  max-height:500px; overflow-y:auto; white-space:pre-wrap; }
    .badge { display:inline-block; padding:2px 10px; border-radius:12px; font-size:0.75em; font-weight:600; }
    .badge-low { background:var(--success); color:white; }
    .badge-medium { background:var(--warning); color:#000; }
    .badge-high { background:var(--error); color:white; }
    .svg-container { background:#111827; border-radius:8px; padding:12px; margin:10px 0; overflow-x:auto; }
    .svg-container svg { max-width:100%; height:auto; }
    .comp-table { width:100%; border-collapse:collapse; font-size:0.85em; }
    .comp-table th { background:var(--surface); text-align:left; padding:8px; border:1px solid var(--border); }
    .comp-table td { padding:8px; border:1px solid var(--border); }
    .tabs { display:flex; gap:4px; margin:12px 0; }
    .tab { padding:6px 14px; border:1px solid var(--border); background:var(--surface); color:var(--text2);
           border-radius:6px; cursor:pointer; font-size:0.8em; }
    .tab.active { background:var(--primary); color:white; border-color:var(--primary); }
    .empty { text-align:center; padding:40px; color:var(--text2); }
    .empty .icon { font-size:2.5em; margin-bottom:10px; }
    #docContent { display:none; }
    .export-bar { display:flex; gap:8px; margin:12px 0; padding:10px; background:var(--surface);
                  border-radius:8px; border:1px solid var(--border); align-items:center; }
</style>
</head>
<body>
    <h1>📄 Auto Documentation Generator</h1>
    <p class="subtitle">Documentación automática de circuitos genéticos</p>

    <div class="grid" id="genCards">
        <div class="gen-card" onclick="generate('full')">
            <div class="icon">📋</div>
            <div class="title">Documentación Completa</div>
            <div class="desc">Reporte técnico con todos los detalles del circuito</div>
        </div>
        <div class="gen-card" onclick="generate('notebook')">
            <div class="icon">📓</div>
            <div class="title">Cuaderno de Laboratorio</div>
            <div class="desc">Entrada de lab notebook con protocolo y checklist</div>
        </div>
        <div class="gen-card" onclick="generate('compliance')">
            <div class="icon">🛡️</div>
            <div class="title">Reporte de Cumplimiento</div>
            <div class="desc">Evaluación de bioseguridad y normativa</div>
        </div>
        <div class="gen-card" onclick="generate('datasheet')">
            <div class="icon">📊</div>
            <div class="title">Ficha Técnica</div>
            <div class="desc">Datasheet con especificaciones de componentes</div>
        </div>
    </div>

    <div id="docContent">
        <div class="export-bar">
            <span style="font-weight:600">📤 Exportar:</span>
            <button class="btn btn-sm btn-primary" onclick="exportMD()">📝 Markdown</button>
            <button class="btn btn-sm btn-accent" onclick="exportHTML()">🌐 HTML</button>
            <span style="flex:1"></span>
            <button class="btn btn-sm btn-outline" onclick="showCards()">← Volver</button>
        </div>

        <div id="svgDiagram" class="svg-container"></div>

        <div class="tabs" id="docTabs"></div>
        <div id="docBody"></div>
    </div>

<script>
    const vscode = acquireVsCodeApi();
    let currentDoc = null;
    let currentMarkdown = '';

    function generate(type) {
        vscode.postMessage({ command: type === 'full' ? 'generateFull' : 
            type === 'notebook' ? 'generateLabNotebook' : 
            type === 'compliance' ? 'generateCompliance' : 'generateDatasheet' });
    }

    function showCards() {
        document.getElementById('genCards').style.display = 'grid';
        document.getElementById('docContent').style.display = 'none';
    }

    function exportMD() { vscode.postMessage({ command: 'exportMarkdown', content: currentMarkdown }); }
    function exportHTML() { vscode.postMessage({ command: 'exportHTML', content: currentMarkdown }); }

    window.addEventListener('message', event => {
        const msg = event.data;
        if (msg.command === 'documentationReady') {
            currentDoc = msg.documentation;
            document.getElementById('genCards').style.display = 'none';
            document.getElementById('docContent').style.display = 'block';
            renderDocumentation(msg.documentation, msg.type);
        }
    });

    function renderDocumentation(doc, type) {
        // SVG Diagram
        document.getElementById('svgDiagram').innerHTML = doc.svgDiagram;

        const body = document.getElementById('docBody');
        let html = '';
        let md = '';

        if (type === 'full') {
            md = '# ' + doc.title + '\\n\\n' +
                 '**Fecha:** ' + doc.date + '\\n\\n' +
                 '## Resumen\\n' + doc.summary + '\\n\\n' +
                 '## Componentes\\n' + doc.components.map(c => '- **' + c.name + '** (' + c.type + '): ' + c.description).join('\\n') + '\\n\\n' +
                 '## Red Regulatoria\\n' + doc.regulatoryNetwork + '\\n\\n' +
                 '## Racional de Diseño\\n' + doc.designRationale + '\\n\\n' +
                 '## Seguridad\\n' + 'Riesgo: ' + doc.safetyAssessment.riskLevel + '\\n\\n' +
                 '## Referencias\\n' + doc.references.map(r => '- ' + r).join('\\n');

            html = '<div class="card"><h2>📋 ' + doc.title + '</h2>' +
                   '<p style="color:var(--text2)">' + doc.date + '</p></div>' +
                   '<div class="card"><h3>Resumen</h3><p>' + doc.summary + '</p></div>' +
                   renderComponentTable(doc.components) +
                   '<div class="card"><h3>🔀 Red Regulatoria</h3><p style="white-space:pre-wrap">' + doc.regulatoryNetwork.replace(/\\*\\*(.+?)\\*\\*/g, '<strong>$1</strong>') + '</p></div>' +
                   '<div class="card"><h3>💡 Racional de Diseño</h3><p>' + doc.designRationale + '</p></div>' +
                   renderSafety(doc.safetyAssessment) +
                   '<div class="card"><h3>📚 Referencias</h3><ul>' + doc.references.map(r => '<li style="font-size:0.85em;color:var(--text2)">' + r + '</li>').join('') + '</ul></div>';
        } else if (type === 'notebook') {
            md = doc.labNotebookEntry;
            html = '<div class="doc-output">' + doc.labNotebookEntry + '</div>';
        } else if (type === 'compliance') {
            md = doc.complianceReport;
            html = '<div class="doc-output">' + doc.complianceReport + '</div>';
        } else if (type === 'datasheet') {
            md = '# Ficha Técnica: ' + doc.circuitName + '\\n\\n' + doc.summary;
            html = '<div class="card"><h2>📊 Ficha Técnica: ' + doc.circuitName + '</h2></div>' +
                   renderComponentTable(doc.components) +
                   renderSafety(doc.safetyAssessment);
        }

        currentMarkdown = md;
        body.innerHTML = html;
    }

    function renderComponentTable(components) {
        return '<div class="card"><h3>🧬 Componentes</h3><table class="comp-table"><tr>' +
               '<th>Tipo</th><th>Nombre</th><th>Descripción</th><th>iGEM</th></tr>' +
               components.map(c => '<tr><td>' + c.type + '</td><td><strong>' + c.name + '</strong></td>' +
                   '<td style="font-size:0.85em">' + c.description + '</td>' +
                   '<td>' + (c.igemPart || '-') + '</td></tr>').join('') +
               '</table></div>';
    }

    function renderSafety(s) {
        const badgeClass = s.riskLevel === 'high' ? 'badge-high' : s.riskLevel === 'medium' ? 'badge-medium' : 'badge-low';
        return '<div class="card"><h3>🛡️ Evaluación de Seguridad</h3>' +
               '<p>Riesgo: <span class="badge ' + badgeClass + '">' + s.riskLevel.toUpperCase() + '</span></p>' +
               '<p>Kill switch: ' + (s.hasKillSwitch ? '✅' : '❌') + '</p>' +
               '<p>Contención: ' + s.containmentLevel + '</p>' +
               (s.antibioticResistance.length > 0 ? '<p>Resistencias: ' + s.antibioticResistance.join(', ') + '</p>' : '') +
               (s.biosecurityFlags.length > 0 ? '<p style="color:var(--warning)">⚠️ ' + s.biosecurityFlags.join(', ') + '</p>' : '') +
               '</div>';
    }
</script>
</body>
</html>`;
    }

    dispose() {
        this.panel?.dispose();
        this.outputChannel.dispose();
    }
}
