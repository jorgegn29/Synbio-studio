// ============================================================================
// Biosafety Classification System — BSL-1 a BSL-4, Select Agents, Dual-Use
// Base de datos de agentes regulados (CDC, NIH, EU, Australia Group, WHO)
// Genera certificados de compliance y recomendaciones de contención
// ============================================================================
import * as vscode from 'vscode';

// ──────────────────────────────────────────────────────────────────────────────
// Base de datos de organismos con nivel BSL (CDC/NIH Guidelines 2024)
// ──────────────────────────────────────────────────────────────────────────────
interface OrganismRisk {
    name: string;
    aliases: string[];
    bsl: 1 | 2 | 3 | 4;
    riskGroup: 1 | 2 | 3 | 4;
    selectAgent: boolean;
    dualUse: boolean;
    regulations: string[];
    containment: string[];
    description: string;
    keywords: string[];
}

const ORGANISM_DATABASE: OrganismRisk[] = [
    // BSL-1 organisms
    {
        name: 'Escherichia coli K-12', aliases: ['ecoli_k12', 'E. coli K-12', 'MG1655', 'DH5α', 'DH10B', 'TOP10', 'BL21'],
        bsl: 1, riskGroup: 1, selectAgent: false, dualUse: false,
        regulations: ['NIH Guidelines Section III-F-6', 'EU Directive 2000/54/EC Group 1'],
        containment: ['BSL-1 estándar', 'Bata de laboratorio', 'Sin PPE especial requerido', 'Superficies de trabajo descontaminadas al final del día'],
        description: 'Cepa de laboratorio no patogénica. GRAS para trabajo recombinante bajo NIH Guidelines.',
        keywords: ['ecoli', 'k12', 'k-12', 'dh5', 'bl21', 'top10', 'mg1655', 'dh10b', 'nih-exempt']
    },
    {
        name: 'Saccharomyces cerevisiae', aliases: ['yeast', 'levadura', 'S. cerevisiae', 's288c', 'BY4741'],
        bsl: 1, riskGroup: 1, selectAgent: false, dualUse: false,
        regulations: ['NIH Guidelines Section III-F-6', 'GRAS organism (FDA)'],
        containment: ['BSL-1 estándar', 'Sin PPE especial'],
        description: 'Levadura modelo. Generalmente reconocida como segura (GRAS).',
        keywords: ['yeast', 'cerevisiae', 'levadura', 's288c', 'by4741']
    },
    {
        name: 'Bacillus subtilis 168', aliases: ['B. subtilis', 'bacillus'],
        bsl: 1, riskGroup: 1, selectAgent: false, dualUse: false,
        regulations: ['NIH Guidelines Section III-F-6'],
        containment: ['BSL-1 estándar'],
        description: 'Gram-positivo modelo. Cepa 168 es trp⁻ auxótrofa, no esporulante.',
        keywords: ['subtilis', 'bacillus', 'b168']
    },
    {
        name: 'Corynebacterium glutamicum', aliases: ['C. glutamicum'],
        bsl: 1, riskGroup: 1, selectAgent: false, dualUse: false,
        regulations: ['NIH Guidelines Section III-F-6', 'GRAS para producción industrial'],
        containment: ['BSL-1 estándar'],
        description: 'Usado industrialmente para producción de aminoácidos (L-glutamato, L-lisina).',
        keywords: ['glutamicum', 'corynebacterium']
    },
    // BSL-2 organisms
    {
        name: 'Staphylococcus aureus', aliases: ['S. aureus', 'MRSA'],
        bsl: 2, riskGroup: 2, selectAgent: false, dualUse: false,
        regulations: ['NIH Guidelines Section III-D', 'EU Directive 2000/54/EC Group 2'],
        containment: ['BSL-2', 'Cabina de seguridad biológica Clase II', 'Guantes, bata, protección ocular', 'Autoclave para residuos', 'Acceso restringido durante trabajo'],
        description: 'Patógeno humano oportunista. MRSA requiere precauciones adicionales.',
        keywords: ['aureus', 'staphylococcus', 'mrsa', 'staph']
    },
    {
        name: 'Salmonella enterica', aliases: ['S. enterica', 'Salmonella typhimurium'],
        bsl: 2, riskGroup: 2, selectAgent: false, dualUse: false,
        regulations: ['NIH Guidelines Section III-D', 'EU Group 2', 'Reportable pathogen (CDC)'],
        containment: ['BSL-2', 'BSC Clase II obligatoria', 'Doble guante recomendado'],
        description: 'Patógeno entérico. Causar gastroenteritis. Serotipos Typhi/Paratyphi son BSL-2/3.',
        keywords: ['salmonella', 'enterica', 'typhimurium']
    },
    {
        name: 'Pseudomonas aeruginosa', aliases: ['P. aeruginosa'],
        bsl: 2, riskGroup: 2, selectAgent: false, dualUse: false,
        regulations: ['NIH Guidelines Section III-D'],
        containment: ['BSL-2', 'BSC Clase II', 'Guantes resistentes'],
        description: 'Patógeno nosocomial oportunista. Resistencia intrínseca a múltiples antibióticos.',
        keywords: ['aeruginosa', 'pseudomonas']
    },
    {
        name: 'Agrobacterium tumefaciens', aliases: ['A. tumefaciens', 'Rhizobium radiobacter'],
        bsl: 1, riskGroup: 1, selectAgent: false, dualUse: false,
        regulations: ['NIH Guidelines Section III-E (T-DNA work)', 'USDA-APHIS permits for field release'],
        containment: ['BSL-1 para trabajo de laboratorio', 'Permisos USDA para plantas transgénicas'],
        description: 'Vector para transformación de plantas. Regulación especial para field trials.',
        keywords: ['agrobacterium', 'tumefaciens', 'plant', 'tdna']
    },
    // BSL-3 organisms
    {
        name: 'Mycobacterium tuberculosis', aliases: ['M. tuberculosis', 'MTB', 'TB'],
        bsl: 3, riskGroup: 3, selectAgent: true, dualUse: false,
        regulations: ['42 CFR Part 73 (Select Agent)', 'NIH Guidelines Section III-C', 'EU Group 3', 'WHO Risk Group 3'],
        containment: ['BSL-3', 'Respirador N95/PAPR', 'BSC Clase II B2 o III', 'Presión negativa', 'HEPA filtración de salida', 'Autoclave in-suite', 'Ducha de descontaminación'],
        description: 'Agente causal de tuberculosis. Select Agent (CDC/USDA). ~1.5M muertes/año globalmente.',
        keywords: ['tuberculosis', 'mycobacterium', 'mtb', 'tb']
    },
    {
        name: 'Yersinia pestis', aliases: ['Y. pestis', 'plague'],
        bsl: 3, riskGroup: 3, selectAgent: true, dualUse: true,
        regulations: ['42 CFR Part 73 (Select Agent)', '7 CFR Part 331', 'NIH Section III-C', 'Dual Use Research of Concern (DURC)', 'Australia Group listed'],
        containment: ['BSL-3 con precauciones BSL-4', 'Respirador PAPR', 'Doble contención', 'Supervisión IBC + RRB'],
        description: 'Agente causal de peste. Select Agent + DURC agent. Arma biológica categoría A (CDC).',
        keywords: ['pestis', 'yersinia', 'plague', 'bioweapon']
    },
    {
        name: 'Bacillus anthracis', aliases: ['B. anthracis', 'anthrax'],
        bsl: 3, riskGroup: 3, selectAgent: true, dualUse: true,
        regulations: ['42 CFR Part 73 (Tier 1 Select Agent)', 'DURC', 'Australia Group', 'BWC Convention'],
        containment: ['BSL-3', 'Tier 1 security requirements', 'Personnel Reliability Program', 'FBI background check'],
        description: 'Agente causal de ántrax. TIER 1 Select Agent con máxima regulación de seguridad.',
        keywords: ['anthracis', 'anthrax', 'bacillus_anthracis']
    },
    // BSL-4 organisms
    {
        name: 'Ebola virus (Zaire)', aliases: ['EBOV', 'Ebola', 'Filovirus'],
        bsl: 4, riskGroup: 4, selectAgent: true, dualUse: true,
        regulations: ['42 CFR Part 73 (Tier 1)', 'NIH Section III-B', 'WHO Risk Group 4', 'Australia Group', 'BWC', 'DURC'],
        containment: ['BSL-4 suit lab o cabina Clase III', 'Traje presión positiva con suministro de aire', 'Ducha química de descontaminación', 'Autoclave de doble puerta', 'Presión negativa múltiple', '24/7 monitoring'],
        description: 'Filovirus. Case fatality rate 25-90%. Sin tratamiento aprobado. Vacuna rVSV-ZEBOV.',
        keywords: ['ebola', 'ebov', 'filovirus', 'hemorrhagic']
    },
    {
        name: 'Variola virus', aliases: ['Smallpox', 'viruela'],
        bsl: 4, riskGroup: 4, selectAgent: true, dualUse: true,
        regulations: ['42 CFR Part 73 (Tier 1)', 'WHO restricted (solo 2 repositorios)', 'BWC', 'DURC'],
        containment: ['BSL-4 SOLAMENTE en CDC Atlanta o VECTOR Novosibirsk', 'Requiere aprobación WHO Advisory Committee'],
        description: 'Erradicado 1980. Solo 2 repositorios autorizados. Máxima restricción mundial.',
        keywords: ['variola', 'smallpox', 'viruela', 'poxvirus']
    },
    {
        name: 'Marburg virus', aliases: ['MARV', 'Marburg'],
        bsl: 4, riskGroup: 4, selectAgent: true, dualUse: true,
        regulations: ['42 CFR Part 73 (Tier 1)', 'WHO Risk Group 4'],
        containment: ['BSL-4', 'Traje presión positiva', 'Máxima contención'],
        description: 'Filovirus. Case fatality rate 24-88%. Sin tratamiento ni vacuna aprobada.',
        keywords: ['marburg', 'marv', 'filovirus']
    },
];

// ──────────────────────────────────────────────────────────────────────────────
// Toxinas y genes de virulencia regulados
// ──────────────────────────────────────────────────────────────────────────────
interface RegulatedGene {
    name: string;
    product: string;
    risk: 'low' | 'medium' | 'high' | 'critical';
    selectAgent: boolean;
    dualUse: boolean;
    regulation: string;
    description: string;
    keywords: string[];
}

const REGULATED_GENES: RegulatedGene[] = [
    { name: 'pagA', product: 'Protective Antigen (PA)', risk: 'critical', selectAgent: true, dualUse: true, regulation: '42 CFR 73 — B. anthracis toxin component', description: 'Componente del toxina del ántrax. Select Agent toxin.', keywords: ['paga', 'protective_antigen', 'anthrax_toxin'] },
    { name: 'lef', product: 'Lethal Factor (LF)', risk: 'critical', selectAgent: true, dualUse: true, regulation: '42 CFR 73', description: 'Factor letal del ántrax. Metaloproteasa que cliva MAPKKs.', keywords: ['lef', 'lethal_factor'] },
    { name: 'cya', product: 'Edema Factor (EF)', risk: 'critical', selectAgent: true, dualUse: true, regulation: '42 CFR 73', description: 'Factor de edema del ántrax. Adenilato ciclasa dependiente de calmodulina.', keywords: ['cya', 'edema_factor'] },
    { name: 'botA-G', product: 'Botulinum neurotoxin', risk: 'critical', selectAgent: true, dualUse: true, regulation: '42 CFR 73 — Tier 1 Toxin', description: 'Neurotoxina botulínica. La sustancia más tóxica conocida. LD₅₀ ~1 ng/kg.', keywords: ['botulinum', 'bont', 'neurotoxin', 'clostridium'] },
    { name: 'ricin', product: 'Ricin toxin', risk: 'critical', selectAgent: true, dualUse: true, regulation: '42 CFR 73 — Tier 1 Toxin', description: 'Toxina de Ricinus communis. Inhibidor ribosomal tipo II. LD₅₀ ~22 μg/kg.', keywords: ['ricin', 'ricinus', 'rta', 'rtb'] },
    { name: 'stx1/stx2', product: 'Shiga toxin', risk: 'high', selectAgent: true, dualUse: false, regulation: '42 CFR 73', description: 'Toxinas Shiga. Inhibición ribosomal. E. coli O157:H7.', keywords: ['shiga', 'stx', 'verotoxin', 'o157'] },
    { name: 'ctx', product: 'Cholera toxin', risk: 'high', selectAgent: false, dualUse: false, regulation: 'NIH Guidelines', description: 'Toxina del cólera. ADP-ribosilación de Gsα. Diarrea masiva.', keywords: ['cholera', 'ctx', 'vibrio'] },
    { name: 'tetX', product: 'Tetanus toxin', risk: 'high', selectAgent: false, dualUse: false, regulation: 'NIH Guidelines', description: 'Tetanospasmina. Bloquea liberación de GABA y glicina.', keywords: ['tetanus', 'tetx', 'clostridium_tetani'] },
    { name: 'hlyA', product: 'Alpha-hemolysin', risk: 'medium', selectAgent: false, dualUse: false, regulation: 'NIH Guidelines', description: 'Hemolisina alfa de S. aureus. Citolisina formadora de poros.', keywords: ['hemolysin', 'hlya', 'alpha_toxin'] },
    { name: 'Cas9', product: 'CRISPR-Cas9 nuclease', risk: 'low', selectAgent: false, dualUse: false, regulation: 'NIH Guidelines Section III-E — Gene drive oversight', description: 'Nucleasa Cas9. Gene drives requieren IBC review bajo NIH Guidelines.', keywords: ['cas9', 'crispr', 'gene_drive'] },
    { name: 'ermB', product: 'Erythromycin resistance', risk: 'low', selectAgent: false, dualUse: false, regulation: 'NIH Guidelines', description: 'Resistencia a eritromicina. Metilación 23S rRNA.', keywords: ['ermb', 'erythromycin', 'macrolide_resistance'] },
    { name: 'mecA', product: 'Methicillin resistance (MRSA)', risk: 'medium', selectAgent: false, dualUse: false, regulation: 'NIH Guidelines — AR threat', description: 'PBP2a — resistencia a meticilina. WHO priority pathogen.', keywords: ['meca', 'mrsa', 'methicillin', 'pbp2a'] },
    { name: 'vanA', product: 'Vancomycin resistance', risk: 'high', selectAgent: false, dualUse: true, regulation: 'NIH Guidelines — CDC Urgent Threat', description: 'D-Ala-D-Lac ligasa. Resistencia a vancomicina. VRSA = CDC urgent threat.', keywords: ['vana', 'vancomycin', 'vre', 'vrsa'] },
    { name: 'NDM-1', product: 'Metallo-β-lactamase', risk: 'high', selectAgent: false, dualUse: true, regulation: 'WHO Critical Priority', description: 'New Delhi metalo-β-lactamasa. Resistencia a carbapenems. Pandrug resistance.', keywords: ['ndm', 'ndm1', 'carbapenem', 'metallo_beta_lactamase'] },
];

// ──────────────────────────────────────────────────────────────────────────────
// Classification Engine
// ──────────────────────────────────────────────────────────────────────────────
interface ClassificationResult {
    requiredBSL: 1 | 2 | 3 | 4;
    organisms: Array<{ organism: OrganismRisk; matchedKeyword: string }>;
    regulatedGenes: Array<{ gene: RegulatedGene; matchedKeyword: string }>;
    isSelectAgent: boolean;
    isDualUse: boolean;
    regulations: string[];
    containmentRequirements: string[];
    warnings: string[];
    complianceStatus: 'COMPLIANT' | 'NON_COMPLIANT' | 'REVIEW_REQUIRED';
    labBSL: string;
}

function classifyBiosafety(code: string, labBSL: string): ClassificationResult {
    const lower = code.toLowerCase();
    const normalized = lower.replace(/[^a-z0-9]+/g, ' ').trim();
    const compact = lower.replace(/[^a-z0-9]+/g, '');
    const result: ClassificationResult = {
        requiredBSL: 1,
        organisms: [],
        regulatedGenes: [],
        isSelectAgent: false,
        isDualUse: false,
        regulations: [],
        containmentRequirements: [],
        warnings: [],
        complianceStatus: 'COMPLIANT',
        labBSL
    };

    const hasKeyword = (keyword: string): boolean => {
        const lowerKeyword = keyword.toLowerCase();
        const normalizedKeyword = lowerKeyword.replace(/[^a-z0-9]+/g, ' ').trim();
        const compactKeyword = lowerKeyword.replace(/[^a-z0-9]+/g, '');

        if (!compactKeyword) {
            return lower.includes(lowerKeyword);
        }

        return lower.includes(lowerKeyword)
            || (normalizedKeyword.length > 0 && normalized.includes(normalizedKeyword))
            || compact.includes(compactKeyword);
    };

    // Scan for organisms
    for (const org of ORGANISM_DATABASE) {
        for (const kw of org.keywords) {
            if (hasKeyword(kw)) {
                result.organisms.push({ organism: org, matchedKeyword: kw });
                if (org.bsl > result.requiredBSL) { result.requiredBSL = org.bsl as 1 | 2 | 3 | 4; }
                if (org.selectAgent) { result.isSelectAgent = true; }
                if (org.dualUse) { result.isDualUse = true; }
                result.regulations.push(...org.regulations);
                result.containmentRequirements.push(...org.containment);
                break; // one match per organism
            }
        }
    }

    // Scan for regulated genes
    for (const gene of REGULATED_GENES) {
        for (const kw of gene.keywords) {
            if (hasKeyword(kw)) {
                result.regulatedGenes.push({ gene, matchedKeyword: kw });
                if (gene.selectAgent) { result.isSelectAgent = true; }
                if (gene.dualUse) { result.isDualUse = true; }
                result.regulations.push(gene.regulation);
                break;
            }
        }
    }

    // Deduplicate
    result.regulations = [...new Set(result.regulations)];
    result.containmentRequirements = [...new Set(result.containmentRequirements)];

    // Generate warnings
    if (result.isSelectAgent) {
        result.warnings.push('🚨 SELECT AGENT detectado — Requiere registro CDC/USDA 42 CFR Part 73');
        result.warnings.push('🔒 Personnel Reliability Program (PRP) requerido');
        result.warnings.push('📋 Entity Registration con Federal Select Agent Program (FSAP)');
    }
    if (result.isDualUse) {
        result.warnings.push('⚠️ DUAL USE RESEARCH OF CONCERN (DURC) — Requiere review por Institutional Review Entity (IRE)');
        result.warnings.push('📄 DURC policy: USG Policy for Oversight of Life Sciences DURC, 2024');
    }

    // Compliance check
    const bslNum: Record<string, number> = { 'BSL-1': 1, 'BSL-2': 2, 'BSL-3': 3, 'BSL-4': 4 };
    const labLevel = bslNum[labBSL] || 1;
    if (result.requiredBSL > labLevel) {
        result.complianceStatus = 'NON_COMPLIANT';
        result.warnings.push(`🚫 NON-COMPLIANT: Lab es ${labBSL} pero el trabajo requiere BSL-${result.requiredBSL}`);
    } else if (result.isSelectAgent || result.isDualUse) {
        result.complianceStatus = 'REVIEW_REQUIRED';
    }

    // Gene drive warning
    if (lower.includes('gene_drive') || lower.includes('gene drive') || (lower.includes('cas9') && lower.includes('drive'))) {
        result.warnings.push('🧬 GENE DRIVE detectado — NIH Guidelines Section III-A.1 (IBC + RAC review)');
        result.complianceStatus = 'REVIEW_REQUIRED';
    }

    // Antibiotic resistance
    const arGenes = ['meca', 'vana', 'ndm', 'blakpc', 'mcr1', 'blandm'];
    if (arGenes.some(g => lower.includes(g))) {
        result.warnings.push('💊 Gen de resistencia antimicrobiana (AMR) detectado — Verificar compliance con WHO Global Priority Pathogens');
    }

    return result;
}

// ──────────────────────────────────────────────────────────────────────────────
// WebView Panel
// ──────────────────────────────────────────────────────────────────────────────
export class BiosafetyClassifier implements vscode.Disposable {
    private panel: vscode.WebviewPanel | undefined;
    private disposables: vscode.Disposable[] = [];

    constructor(private context: vscode.ExtensionContext) {
        this.disposables.push(
            vscode.window.onDidChangeActiveTextEditor(editor => {
                if (!this.panel || !this.isBioScriptDocument(editor?.document)) {
                    return;
                }

                this.classifyText(editor.document.getText());
            })
        );

        this.disposables.push(
            vscode.workspace.onDidSaveTextDocument(document => {
                if (!this.panel || !this.isBioScriptDocument(document)) {
                    return;
                }

                this.classifyText(document.getText());
            })
        );
    }

    private isBioScriptDocument(document: vscode.TextDocument | undefined): boolean {
        if (!document) {
            return false;
        }

        return document.languageId === 'bioscript' || document.fileName.toLowerCase().endsWith('.bio');
    }

    show(autoClassify = true): void {
        if (this.panel) {
            this.panel.reveal();
            if (autoClassify && this.isBioScriptDocument(vscode.window.activeTextEditor?.document)) {
                this.classifyFromEditor();
            }
            return;
        }

        this.panel = vscode.window.createWebviewPanel(
            'synbioBiosafety',
            '🛡️ Biosafety Classification',
            vscode.ViewColumn.Two,
            { enableScripts: true, retainContextWhenHidden: true }
        );

        this.panel.webview.html = this.getWebviewContent();

        this.panel.webview.onDidReceiveMessage(msg => {
            switch (msg.type) {
                case 'classifyFromEditor':
                    this.classifyFromEditor();
                    break;
                case 'generateCertificate':
                    this.generateCertificate(msg.result);
                    break;
                case 'classifyText':
                    this.classifyText(msg.text);
                    break;
            }
        });

        this.panel.onDidDispose(() => { this.panel = undefined; });

        if (autoClassify && this.isBioScriptDocument(vscode.window.activeTextEditor?.document)) {
            this.classifyFromEditor();
        }
    }

    private classifyFromEditor(): void {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showWarningMessage('No hay archivo activo para clasificar.');
            return;
        }

        if (!this.isBioScriptDocument(editor.document)) {
            vscode.window.showWarningMessage('La clasificación de bioseguridad solo se aplica a documentos BioScript.');
            return;
        }

        this.classifyText(editor.document.getText());
    }

    private classifyText(text: string): void {
        const labBSL = vscode.workspace.getConfiguration('synbio').get<string>('biosafetyLevel', 'BSL-1');
        const result = classifyBiosafety(text, labBSL);
        this.panel?.webview.postMessage({ type: 'classificationResult', result });
    }

    private async generateCertificate(result: ClassificationResult): Promise<void> {
        const now = new Date();
        const cert = `
╔══════════════════════════════════════════════════════════════╗
║           BIOSAFETY CLASSIFICATION CERTIFICATE              ║
║                    SynBio-LLVM IDE                          ║
╠══════════════════════════════════════════════════════════════╣
║                                                              ║
║  Date: ${now.toISOString().split('T')[0]}                                        ║
║  Time: ${now.toISOString().split('T')[1].slice(0, 8)} UTC                                    ║
║                                                              ║
║  CLASSIFICATION: BSL-${result.requiredBSL}                                    ║
║  STATUS: ${result.complianceStatus.padEnd(20)}                         ║
║  LAB LEVEL: ${result.labBSL.padEnd(17)}                         ║
║                                                              ║
║  ORGANISMS DETECTED: ${result.organisms.length}                                  ║
${result.organisms.map(o => `║    • ${o.organism.name} (BSL-${o.organism.bsl})`.padEnd(63) + '║').join('\n')}
║                                                              ║
║  REGULATED GENES: ${result.regulatedGenes.length}                                    ║
${result.regulatedGenes.map(g => `║    • ${g.gene.name} → ${g.gene.product} [${g.gene.risk.toUpperCase()}]`.padEnd(63) + '║').join('\n')}
║                                                              ║
║  SELECT AGENT: ${result.isSelectAgent ? 'YES ⚠️' : 'NO ✅'}                                 ║
║  DUAL USE: ${result.isDualUse ? 'YES ⚠️' : 'NO ✅'}                                     ║
║                                                              ║
║  APPLICABLE REGULATIONS:                                     ║
${result.regulations.slice(0, 6).map(r => `║    • ${r}`.padEnd(63) + '║').join('\n')}
║                                                              ║
║  CONTAINMENT REQUIREMENTS:                                   ║
${result.containmentRequirements.slice(0, 5).map(c => `║    • ${c}`.padEnd(63) + '║').join('\n')}
║                                                              ║
║  Generated by SynBio-LLVM v0.2.0                             ║
║  This is an automated assessment. Verify with your IBC.      ║
╚══════════════════════════════════════════════════════════════╝
`;
        const uri = await vscode.window.showSaveDialog({
            filters: { 'Text': ['txt'] },
            defaultUri: vscode.Uri.file(`biosafety-certificate-${now.toISOString().split('T')[0]}.txt`)
        });
        if (uri) {
            await vscode.workspace.fs.writeFile(uri, Buffer.from(cert, 'utf8'));
            vscode.window.showInformationMessage(`Certificado de bioseguridad guardado: ${uri.fsPath}`);
        }
    }

    private getWebviewContent(): string {
        return `<!DOCTYPE html>
<html lang="es"><head>
<meta charset="UTF-8">
<style>
:root { --bg: #1e1e2e; --surface: #181825; --text: #cdd6f4; --accent: #89b4fa; --border: #313244; --green: #a6e3a1; --red: #f38ba8; --yellow: #f9e2af; --mauve: #cba6f7; }
* { margin:0; padding:0; box-sizing:border-box; }
body { font-family: 'Segoe UI', sans-serif; background: var(--bg); color: var(--text); padding: 16px; }
h1 { font-size: 18px; color: var(--accent); margin-bottom: 8px; }
.subtitle { font-size: 12px; color: #a6adc8; margin-bottom: 16px; }
button { background: var(--surface); color: var(--text); border: 1px solid var(--border); padding: 10px 20px; border-radius: 6px; cursor: pointer; font-size: 13px; margin: 4px; }
button:hover { border-color: var(--accent); }
button.primary { background: var(--accent); color: var(--bg); font-weight: 600; }
.btn-row { display: flex; gap: 8px; margin: 12px 0; flex-wrap: wrap; }
.result-container { margin-top: 16px; }
.bsl-badge { display: inline-block; font-size: 28px; font-weight: bold; padding: 12px 24px; border-radius: 12px; margin: 12px 0; }
.bsl-1 { background: rgba(166,227,161,0.2); color: var(--green); border: 2px solid var(--green); }
.bsl-2 { background: rgba(249,226,175,0.2); color: var(--yellow); border: 2px solid var(--yellow); }
.bsl-3 { background: rgba(250,179,135,0.2); color: #fab387; border: 2px solid #fab387; }
.bsl-4 { background: rgba(243,139,168,0.2); color: var(--red); border: 2px solid var(--red); }
.status-badge { display: inline-block; padding: 6px 14px; border-radius: 6px; font-weight: bold; font-size: 13px; }
.status-compliant { background: rgba(166,227,161,0.2); color: var(--green); }
.status-noncompliant { background: rgba(243,139,168,0.2); color: var(--red); }
.status-review { background: rgba(249,226,175,0.2); color: var(--yellow); }
.section { background: var(--surface); padding: 16px; border-radius: 8px; margin: 12px 0; border-left: 4px solid var(--border); }
.section h3 { font-size: 14px; margin-bottom: 8px; color: var(--accent); }
.section ul { list-style: none; padding: 0; }
.section li { padding: 4px 0; font-size: 12px; border-bottom: 1px solid var(--border); }
.section li:last-child { border-bottom: none; }
.warning-item { padding: 8px; margin: 4px 0; background: rgba(243,139,168,0.05); border-radius: 6px; font-size: 12px; border-left: 3px solid var(--yellow); }
.organism-card { padding: 10px; margin: 6px 0; background: var(--bg); border-radius: 8px; border: 1px solid var(--border); }
.organism-card .name { font-weight: bold; font-size: 13px; }
.organism-card .details { font-size: 11px; color: #a6adc8; margin-top: 4px; }
.gene-card { padding: 8px; margin: 4px 0; background: var(--bg); border-radius: 6px; border-left: 3px solid var(--mauve); }
.risk-badge { font-size: 10px; padding: 2px 6px; border-radius: 3px; font-weight: bold; }
.risk-critical { background: rgba(243,139,168,0.3); color: var(--red); }
.risk-high { background: rgba(250,179,135,0.3); color: #fab387; }
.risk-medium { background: rgba(249,226,175,0.3); color: var(--yellow); }
.risk-low { background: rgba(166,227,161,0.3); color: var(--green); }
.empty-state { text-align: center; padding: 40px; color: #6c7086; }
.empty-state .icon { font-size: 48px; margin-bottom: 12px; }
</style></head><body>
<h1>🛡️ Biosafety Classification System</h1>
<p class="subtitle">Clasificación BSL-1 a BSL-4 · CDC Select Agent List · NIH Guidelines · EU Directives · WHO Risk Groups · DURC Policy</p>

<div class="btn-row">
    <button class="primary" onclick="classifyFromEditor()">🔍 Clasificar Archivo Actual</button>
    <button onclick="generateCert()">📜 Generar Certificado</button>
</div>

<div class="result-container" id="resultContainer">
    <div class="empty-state">
        <div class="icon">🔬</div>
        <p>Abre un archivo .bio y haz clic en "Clasificar" para evaluar el nivel de bioseguridad</p>
        <p style="margin-top:8px;font-size:11px">Base de datos: ${ORGANISM_DATABASE.length} organismos · ${REGULATED_GENES.length} genes regulados</p>
    </div>
</div>

<script>
const vscode = acquireVsCodeApi();
let lastResult = null;

function classifyFromEditor() {
    vscode.postMessage({ type: 'classifyFromEditor' });
}

function classifyText(text) {
    vscode.postMessage({ type: 'classifyText', text });
}

function generateCert() {
    if (lastResult) {
        vscode.postMessage({ type: 'generateCertificate', result: lastResult });
    }
}

window.addEventListener('message', (event) => {
    const msg = event.data;
    if (msg.type === 'classificationResult') {
        lastResult = msg.result;
        renderResult(msg.result);
    }
});

function renderResult(r) {
    const statusClass = r.complianceStatus === 'COMPLIANT' ? 'status-compliant' :
                        r.complianceStatus === 'NON_COMPLIANT' ? 'status-noncompliant' : 'status-review';
    const statusText = r.complianceStatus === 'COMPLIANT' ? '✅ COMPLIANT' :
                       r.complianceStatus === 'NON_COMPLIANT' ? '🚫 NON-COMPLIANT' : '⚠️ REVIEW REQUIRED';

    let html = '<div class="bsl-badge bsl-' + r.requiredBSL + '">BSL-' + r.requiredBSL + '</div>';
    html += ' <span class="status-badge ' + statusClass + '">' + statusText + '</span>';
    html += '<p style="margin:8px 0;font-size:12px;color:#a6adc8">Lab configurado: ' + r.labBSL + ' · Select Agent: ' + (r.isSelectAgent ? '⚠️ SÍ':'✅ NO') + ' · Dual-Use: ' + (r.isDualUse ? '⚠️ SÍ':'✅ NO') + '</p>';

    // Warnings
    if (r.warnings.length > 0) {
        html += '<div class="section" style="border-left-color:var(--red)"><h3>⚠️ Advertencias (' + r.warnings.length + ')</h3>';
        r.warnings.forEach(w => html += '<div class="warning-item">' + w + '</div>');
        html += '</div>';
    }

    // Organisms
    if (r.organisms.length > 0) {
        html += '<div class="section"><h3>🦠 Organismos Detectados (' + r.organisms.length + ')</h3>';
        r.organisms.forEach(o => {
            html += '<div class="organism-card"><div class="name">' + o.organism.name + ' <span class="bsl-badge bsl-' + o.organism.bsl + '" style="font-size:11px;padding:2px 6px">BSL-' + o.organism.bsl + '</span></div>';
            html += '<div class="details">' + o.organism.description + '</div>';
            html += '<div class="details" style="margin-top:4px">Detectado: <code>' + o.matchedKeyword + '</code></div></div>';
        });
        html += '</div>';
    }

    // Regulated genes
    if (r.regulatedGenes.length > 0) {
        html += '<div class="section" style="border-left-color:var(--mauve)"><h3>🧬 Genes Regulados (' + r.regulatedGenes.length + ')</h3>';
        r.regulatedGenes.forEach(g => {
            html += '<div class="gene-card"><strong>' + g.gene.name + '</strong> → ' + g.gene.product + 
                ' <span class="risk-badge risk-' + g.gene.risk + '">' + g.gene.risk.toUpperCase() + '</span>';
            if (g.gene.selectAgent) html += ' <span class="risk-badge risk-critical">SELECT AGENT</span>';
            html += '<div style="font-size:11px;color:#a6adc8;margin-top:4px">' + g.gene.description + '</div>';
            html += '<div style="font-size:10px;color:#6c7086;margin-top:2px">' + g.gene.regulation + '</div></div>';
        });
        html += '</div>';
    }

    // Regulations
    if (r.regulations.length > 0) {
        html += '<div class="section"><h3>📋 Regulaciones Aplicables</h3><ul>';
        r.regulations.forEach(reg => html += '<li>• ' + reg + '</li>');
        html += '</ul></div>';
    }

    // Containment
    if (r.containmentRequirements.length > 0) {
        html += '<div class="section" style="border-left-color:var(--green)"><h3>🔒 Requisitos de Contención</h3><ul>';
        r.containmentRequirements.forEach(c => html += '<li>• ' + c + '</li>');
        html += '</ul></div>';
    }

    if (r.organisms.length === 0 && r.regulatedGenes.length === 0) {
        html += '<div class="section" style="border-left-color:var(--green)"><h3>✅ Sin riesgos detectados</h3><p style="font-size:12px">No se detectaron organismos regulados ni genes de virulencia en el archivo. Nivel BSL-1 suficiente para trabajo estándar con E. coli K-12.</p></div>';
    }

    document.getElementById('resultContainer').innerHTML = html;
}
</script></body></html>`;
    }

    dispose(): void {
        this.panel?.dispose();
        this.disposables.forEach(d => d.dispose());
        this.disposables = [];
    }
}
