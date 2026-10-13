import * as vscode from 'vscode';

/**
 * SynBio-LLVM — Fase 8: Diseñador de Rutas Metabólicas
 * 
 * Diseño visual de rutas metabólicas, base de datos de enzimas/reacciones,
 * análisis de flujo básico (FBA simplificado), exportación SBML.
 */

// ── Tipos ──────────────────────────────────────────────────────────────

interface Metabolite {
    id: string;
    name: string;
    formula?: string;
    compartment: string;
    x: number;
    y: number;
    concentration?: number;
}

interface Reaction {
    id: string;
    name: string;
    enzyme: string;
    substrates: string[];
    products: string[];
    reversible: boolean;
    flux: number;
    kcat?: number;
    km?: number;
    gene?: string;
    ecNumber?: string;
}

interface Pathway {
    name: string;
    description: string;
    metabolites: Metabolite[];
    reactions: Reaction[];
    organism: string;
}

// ── Base de datos de rutas metabólicas ejemplo ─────────────────────────

const PATHWAY_TEMPLATES: Record<string, Pathway> = {
    glycolysis: {
        name: 'Glucólisis',
        description: 'Ruta de degradación de glucosa a piruvato (10 reacciones)',
        organism: 'E. coli',
        metabolites: [
            { id: 'glc', name: 'Glucosa', formula: 'C6H12O6', compartment: 'cytoplasm', x: 50, y: 50 },
            { id: 'g6p', name: 'Glucosa-6-P', formula: 'C6H13O9P', compartment: 'cytoplasm', x: 50, y: 130 },
            { id: 'f6p', name: 'Fructosa-6-P', formula: 'C6H13O9P', compartment: 'cytoplasm', x: 50, y: 210 },
            { id: 'fbp', name: 'Fructosa-1,6-BP', formula: 'C6H14O12P2', compartment: 'cytoplasm', x: 50, y: 290 },
            { id: 'g3p', name: 'G3P', formula: 'C3H7O6P', compartment: 'cytoplasm', x: 50, y: 370 },
            { id: 'dhap', name: 'DHAP', formula: 'C3H7O6P', compartment: 'cytoplasm', x: 200, y: 290 },
            { id: 'bpg', name: '1,3-BPG', formula: 'C3H8O10P2', compartment: 'cytoplasm', x: 50, y: 450 },
            { id: '3pg', name: '3-PG', formula: 'C3H7O7P', compartment: 'cytoplasm', x: 50, y: 530 },
            { id: '2pg', name: '2-PG', formula: 'C3H7O7P', compartment: 'cytoplasm', x: 50, y: 610 },
            { id: 'pep', name: 'PEP', formula: 'C3H5O6P', compartment: 'cytoplasm', x: 50, y: 690 },
            { id: 'pyr', name: 'Piruvato', formula: 'C3H4O3', compartment: 'cytoplasm', x: 50, y: 770 },
        ],
        // Flux values: mmol/gDW/h from E. coli iJO1366 genome-scale model (Orth et al. 2011 Mol Syst Biol 7:535)
        // at growth rate μ ≈ 0.7 h⁻¹ on glucose minimal media
        // kcat/Km values: BRENDA database (Schomburg et al. 2017 NAR 45:D364) for E. coli K-12 enzymes
        reactions: [
            { id: 'HK', name: 'Hexoquinasa', enzyme: 'Glk', substrates: ['glc'], products: ['g6p'], reversible: false, flux: 10.0, kcat: 145, km: 0.6, ecNumber: '2.7.1.1', gene: 'glk' },
            { id: 'PGI', name: 'Fosfoglucosa isomerasa', enzyme: 'Pgi', substrates: ['g6p'], products: ['f6p'], reversible: true, flux: 6.1, kcat: 699, km: 0.3, ecNumber: '5.3.1.9', gene: 'pgi' },
            { id: 'PFK', name: 'Fosfofructoquinasa', enzyme: 'PfkA', substrates: ['f6p'], products: ['fbp'], reversible: false, flux: 7.5, kcat: 200, km: 0.12, ecNumber: '2.7.1.11', gene: 'pfkA' },
            { id: 'ALD', name: 'Aldolasa', enzyme: 'FbaA', substrates: ['fbp'], products: ['g3p', 'dhap'], reversible: true, flux: 7.5, kcat: 18, km: 0.02, ecNumber: '4.1.2.13', gene: 'fbaA' },
            { id: 'TPI', name: 'Triosa-P isomerasa', enzyme: 'TpiA', substrates: ['dhap'], products: ['g3p'], reversible: true, flux: 7.5, kcat: 7090, km: 1.8, ecNumber: '5.3.1.1', gene: 'tpiA' },
            { id: 'GAPDH', name: 'G3P deshidrogenasa', enzyme: 'GapA', substrates: ['g3p'], products: ['bpg'], reversible: true, flux: 15.0, kcat: 146, km: 0.22, ecNumber: '1.2.1.12', gene: 'gapA' },
            { id: 'PGK', name: 'Fosfoglicerato quinasa', enzyme: 'Pgk', substrates: ['bpg'], products: ['3pg'], reversible: true, flux: 15.0, kcat: 433, km: 0.2, ecNumber: '2.7.2.3', gene: 'pgk' },
            { id: 'PGM', name: 'Fosfoglicerato mutasa', enzyme: 'GpmA', substrates: ['3pg'], products: ['2pg'], reversible: true, flux: 15.0, kcat: 455, km: 0.16, ecNumber: '5.4.2.12', gene: 'gpmA' },
            { id: 'ENO', name: 'Enolasa', enzyme: 'Eno', substrates: ['2pg'], products: ['pep'], reversible: true, flux: 15.0, kcat: 96, km: 0.065, ecNumber: '4.2.1.11', gene: 'eno' },
            { id: 'PK', name: 'Piruvato quinasa', enzyme: 'PykF', substrates: ['pep'], products: ['pyr'], reversible: false, flux: 12.5, kcat: 200, km: 0.31, ecNumber: '2.7.1.40', gene: 'pykF' },
        ]
    },
    mevalonate: {
        name: 'Ruta del Mevalonato',
        description: 'Producción de isopentenil difosfato (IPP) para terpenoides',
        organism: 'E. coli (heteróloga)',
        metabolites: [
            { id: 'acCoA', name: 'Acetil-CoA', formula: 'C23H38N7O17P3S', compartment: 'cytoplasm', x: 50, y: 50 },
            { id: 'aaCoA', name: 'Acetoacetil-CoA', compartment: 'cytoplasm', x: 50, y: 150 },
            { id: 'hmgCoA', name: 'HMG-CoA', compartment: 'cytoplasm', x: 50, y: 250 },
            { id: 'mev', name: 'Mevalonato', formula: 'C6H12O4', compartment: 'cytoplasm', x: 50, y: 350 },
            { id: 'mev5p', name: 'Mevalonato-5-P', compartment: 'cytoplasm', x: 50, y: 450 },
            { id: 'mev5pp', name: 'Mevalonato-5-PP', compartment: 'cytoplasm', x: 50, y: 550 },
            { id: 'ipp', name: 'IPP', formula: 'C5H12O7P2', compartment: 'cytoplasm', x: 50, y: 650 },
            { id: 'dmapp', name: 'DMAPP', formula: 'C5H12O7P2', compartment: 'cytoplasm', x: 200, y: 650 },
        ],
        // Flux/kinetic data: Martin VJJ et al. (2003) Nat Biotechnol 21:796-802 (mevalonate pathway in E. coli)
        // kcat/Km: BRENDA (Schomburg et al. 2017) for S. cerevisiae / S. aureus enzymes as expressed in E. coli
        reactions: [
            { id: 'AACT', name: 'Acetoacetil-CoA tiolasa', enzyme: 'AtoB', substrates: ['acCoA'], products: ['aaCoA'], reversible: true, flux: 2.5, kcat: 66.8, km: 0.032, ecNumber: '2.3.1.9', gene: 'atoB' },
            { id: 'HMGS', name: 'HMG-CoA sintasa', enzyme: 'HMGS', substrates: ['aaCoA', 'acCoA'], products: ['hmgCoA'], reversible: false, flux: 2.5, kcat: 3.2, km: 0.014, ecNumber: '2.3.3.10', gene: 'mvaS' },
            { id: 'HMGR', name: 'HMG-CoA reductasa', enzyme: 'HMGR', substrates: ['hmgCoA'], products: ['mev'], reversible: false, flux: 2.5, kcat: 0.2, km: 0.015, ecNumber: '1.1.1.34', gene: 'mvaA' },
            { id: 'MK', name: 'Mevalonato quinasa', enzyme: 'MK', substrates: ['mev'], products: ['mev5p'], reversible: false, flux: 2.5, kcat: 15, km: 0.43, ecNumber: '2.7.1.36', gene: 'mvaK1' },
            { id: 'PMK', name: 'Fosfomevalonato quinasa', enzyme: 'PMK', substrates: ['mev5p'], products: ['mev5pp'], reversible: false, flux: 2.5, kcat: 10, km: 0.33, ecNumber: '2.7.4.2', gene: 'mvaK2' },
            { id: 'MDD', name: 'Mevalonato-PP decarboxilasa', enzyme: 'MDD', substrates: ['mev5pp'], products: ['ipp'], reversible: false, flux: 2.5, kcat: 7.5, km: 0.10, ecNumber: '4.1.1.33', gene: 'mvaD' },
            { id: 'IDI', name: 'IPP isomerasa', enzyme: 'IDI', substrates: ['ipp'], products: ['dmapp'], reversible: true, flux: 1.25, kcat: 3.7, km: 0.02, ecNumber: '5.3.3.2', gene: 'idi' },
        ]
    },
    shikimate: {
        name: 'Ruta del Shikimato',
        description: 'Producción de aminoácidos aromáticos (Phe, Tyr, Trp)',
        organism: 'E. coli',
        metabolites: [
            { id: 'pep', name: 'PEP', compartment: 'cytoplasm', x: 50, y: 50 },
            { id: 'e4p', name: 'Eritrosa-4-P', compartment: 'cytoplasm', x: 200, y: 50 },
            { id: 'dahp', name: 'DAHP', compartment: 'cytoplasm', x: 120, y: 150 },
            { id: 'dhq', name: 'DHQ', compartment: 'cytoplasm', x: 120, y: 250 },
            { id: 'dhs', name: 'DHS', compartment: 'cytoplasm', x: 120, y: 350 },
            { id: 'shk', name: 'Shikimato', formula: 'C7H10O5', compartment: 'cytoplasm', x: 120, y: 450 },
            { id: 's3p', name: 'Shikimato-3-P', formula: 'C7H11O8P', compartment: 'cytoplasm', x: 120, y: 510 },
            { id: 'epsp', name: 'EPSP', formula: 'C10H13O10P', compartment: 'cytoplasm', x: 120, y: 570 },
            { id: 'chor', name: 'Corismato', formula: 'C10H10O6', compartment: 'cytoplasm', x: 120, y: 650 },
        ],
        // Flux data: E. coli iJO1366 model (Orth et al. 2011). Shikimate pathway flux ~1.5 mmol/gDW/h
        // kcat/Km: BRENDA database, E. coli K-12 enzymes
        // Complete 7-step pathway: PEP+E4P → DAHP → DHQ → DHS → Shikimate → S3P → EPSP → Chorismate
        // Ref: Herrmann KM & Weaver LM (1999) Annu Rev Plant Biol 50:473 — shikimate pathway review
        reactions: [
            { id: 'DAHPS', name: 'DAHP sintasa', enzyme: 'AroG', substrates: ['pep', 'e4p'], products: ['dahp'], reversible: false, flux: 1.5, kcat: 70, km: 0.015, ecNumber: '2.5.1.54', gene: 'aroG' },
            { id: 'DHQS', name: 'DHQ sintasa', enzyme: 'AroB', substrates: ['dahp'], products: ['dhq'], reversible: false, flux: 1.5, kcat: 2.0, km: 0.025, ecNumber: '4.2.3.4', gene: 'aroB' },
            { id: 'DHQD', name: 'DHQ deshidratasa', enzyme: 'AroD', substrates: ['dhq'], products: ['dhs'], reversible: false, flux: 1.5, kcat: 120, km: 0.05, ecNumber: '4.2.1.10', gene: 'aroD' },
            { id: 'SDH', name: 'Shikimato DH', enzyme: 'AroE', substrates: ['dhs'], products: ['shk'], reversible: false, flux: 1.5, kcat: 42, km: 0.063, ecNumber: '1.1.1.25', gene: 'aroE' },
            { id: 'SK', name: 'Shikimato quinasa', enzyme: 'AroK', substrates: ['shk'], products: ['s3p'], reversible: false, flux: 1.5, kcat: 100, km: 0.2, ecNumber: '2.7.1.71', gene: 'aroK' },
            { id: 'EPSPS', name: 'EPSP sintasa', enzyme: 'AroA', substrates: ['s3p'], products: ['epsp'], reversible: false, flux: 1.5, kcat: 15, km: 0.5, ecNumber: '2.5.1.19', gene: 'aroA' },
            { id: 'CS', name: 'Corismato sintasa', enzyme: 'AroC', substrates: ['epsp'], products: ['chor'], reversible: false, flux: 1.5, kcat: 50, km: 0.008, ecNumber: '4.2.3.5', gene: 'aroC' },
        ]
    }
};

// ── Clase principal ────────────────────────────────────────────────────

export class PathwayDesigner implements vscode.Disposable {
    private panel: vscode.WebviewPanel | undefined;
    private context: vscode.ExtensionContext;
    private currentPathway: Pathway | undefined;

    constructor(context: vscode.ExtensionContext) {
        this.context = context;
    }

    async show() {
        if (this.panel) {
            this.panel.reveal(vscode.ViewColumn.Two);
            return;
        }

        this.panel = vscode.window.createWebviewPanel(
            'synbioPathway',
            '🔬 Pathway Designer',
            vscode.ViewColumn.Two,
            { enableScripts: true }
        );

        this.panel.webview.html = this.getWebviewContent();

        this.panel.webview.onDidReceiveMessage(async msg => {
            switch (msg.command) {
                case 'loadTemplate':
                    this.loadTemplate(msg.templateId);
                    break;
                case 'runFBA':
                    this.runSimpleFBA();
                    break;
                case 'exportSBML':
                    await this.exportSBML();
                    break;
                case 'exportBioScript':
                    await this.exportToBioScript();
                    break;
                case 'addMetabolite':
                    this.addMetabolite(msg.metabolite);
                    break;
                case 'addReaction':
                    this.addReaction(msg.reaction);
                    break;
                case 'optimizeFlux':
                    this.optimizeFlux(msg.targetReaction);
                    break;
            }
        });

        this.panel.onDidDispose(() => { this.panel = undefined; });
    }

    private loadTemplate(templateId: string) {
        const template = PATHWAY_TEMPLATES[templateId];
        if (!template) return;
        this.currentPathway = JSON.parse(JSON.stringify(template));
        this.panel?.webview.postMessage({
            command: 'pathwayLoaded',
            pathway: this.currentPathway
        });
    }

    private addMetabolite(met: Partial<Metabolite>) {
        if (!this.currentPathway) return;
        const newMet: Metabolite = {
            id: met.id || `met_${Date.now()}`,
            name: met.name || 'Nuevo metabolito',
            formula: met.formula,
            compartment: met.compartment || 'cytoplasm',
            x: met.x || 100,
            y: met.y || 100,
            concentration: met.concentration
        };
        this.currentPathway.metabolites.push(newMet);
        this.panel?.webview.postMessage({ command: 'pathwayLoaded', pathway: this.currentPathway });
    }

    private addReaction(rxn: Partial<Reaction>) {
        if (!this.currentPathway) return;
        const newRxn: Reaction = {
            id: rxn.id || `rxn_${Date.now()}`,
            name: rxn.name || 'Nueva reacción',
            enzyme: rxn.enzyme || 'Enzyme',
            substrates: rxn.substrates || [],
            products: rxn.products || [],
            reversible: rxn.reversible || false,
            flux: rxn.flux || 0,
            gene: rxn.gene,
            ecNumber: rxn.ecNumber
        };
        this.currentPathway.reactions.push(newRxn);
        this.panel?.webview.postMessage({ command: 'pathwayLoaded', pathway: this.currentPathway });
    }

    /**
     * Análisis cinético simplificado (Michaelis-Menten serial)
     * Calcula flujos efectivos bajo limitación de sustrato usando Km reales de BRENDA.
     * Para FBA completo (matriz estequiométrica + LP), usar simplex-solver.ts.
     * Ref: Teusink B et al. (2000) Eur J Biochem 267:5313 — in vivo kinetic modeling
     */
    private runSimpleFBA() {
        if (!this.currentPathway) return;

        const results: { reactionId: string; name: string; flux: number; bottleneck: boolean; kcat?: number; km?: number }[] = [];
        let minFlux = Infinity;

        for (const rxn of this.currentPathway.reactions) {
            // Michaelis-Menten: v = Vmax * [S]/(Km + [S]) = kcat*[E]*[S]/(Km + [S])
            // If no substrate concentration specified, use pathway-defined flux (mmol/gDW/h)
            // Km values from BRENDA (Schomburg et al. 2017 NAR 45:D364)
            let effectiveFlux = rxn.flux;
            for (const subId of rxn.substrates) {
                const substrate = this.currentPathway.metabolites.find(m => m.id === subId);
                if (substrate?.concentration !== undefined && rxn.km !== undefined) {
                    // Michaelis-Menten saturation with real Km
                    const saturation = substrate.concentration / (substrate.concentration + rxn.km);
                    effectiveFlux *= saturation;
                }
            }
            if (effectiveFlux < minFlux) minFlux = effectiveFlux;
            results.push({
                reactionId: rxn.id,
                name: rxn.name,
                flux: Math.round(effectiveFlux * 100) / 100,
                bottleneck: false,
                kcat: rxn.kcat,
                km: rxn.km
            });
        }

        // Marcar cuello de botella
        for (const r of results) {
            if (Math.abs(r.flux - minFlux) < 0.01) {
                r.bottleneck = true;
            }
        }

        // Calcular rendimiento teórico
        const inputFlux = results[0]?.flux || 0;
        const outputFlux = results[results.length - 1]?.flux || 0;
        const yieldPct = inputFlux > 0 ? (outputFlux / inputFlux * 100) : 0;

        this.panel?.webview.postMessage({
            command: 'fbaResult',
            results,
            yield: Math.round(yieldPct * 10) / 10,
            bottleneck: results.find(r => r.bottleneck)?.name || 'Ninguno'
        });
    }

    /**
     * Optimiza flujo hacia una reacción objetivo
     */
    private optimizeFlux(targetId: string) {
        if (!this.currentPathway) return;
        const suggestions: string[] = [];

        const target = this.currentPathway.reactions.find(r => r.id === targetId);
        if (!target) return;

        // Analizar sustratos limitantes
        for (const subId of target.substrates) {
            const producingRxns = this.currentPathway.reactions.filter(r => r.products.includes(subId));
            if (producingRxns.length === 0) {
                suggestions.push(`⚠️ ${subId} no tiene reacción productora — necesita suplementación externa`);
            } else {
                for (const pr of producingRxns) {
                    if (pr.flux < target.flux) {
                        suggestions.push(`💡 Aumentar expresión de ${pr.gene || pr.enzyme} (${pr.name}) para incrementar suministro de ${subId}`);
                    }
                }
            }
        }

        // Reacciones competidoras
        for (const subId of target.substrates) {
            const competitors = this.currentPathway.reactions.filter(r =>
                r.id !== targetId && r.substrates.includes(subId)
            );
            for (const comp of competitors) {
                suggestions.push(`🔇 Considerar knockout de ${comp.gene || comp.enzyme} (${comp.name}) — compite por ${subId}`);
            }
        }

        if (suggestions.length === 0) {
            suggestions.push('✅ No se detectan cuellos de botella evidentes para esta reacción');
        }

        this.panel?.webview.postMessage({
            command: 'optimizationSuggestions',
            reaction: target.name,
            suggestions
        });
    }

    /**
     * Exportar a formato SBML (Level 3)
     */
    private async exportSBML() {
        if (!this.currentPathway) {
            vscode.window.showWarningMessage('Cargue una ruta metabólica primero');
            return;
        }

        const pw = this.currentPathway;
        let sbml = `<?xml version="1.0" encoding="UTF-8"?>
<sbml xmlns="http://www.sbml.org/sbml/level3/version2/core" level="3" version="2">
  <model id="${pw.name.replace(/\s+/g, '_')}" name="${pw.name}">
    <listOfCompartments>
      <compartment id="cytoplasm" name="Cytoplasm" constant="true"/>
    </listOfCompartments>
    <listOfSpecies>
${pw.metabolites.map(m => `      <species id="${m.id}" name="${m.name}" compartment="${m.compartment}"
        initialConcentration="${m.concentration || 0}" boundaryCondition="false" constant="false"${m.formula ? ` sboTerm="SBO:0000247"` : ''}/>`).join('\n')}
    </listOfSpecies>
    <listOfReactions>
${pw.reactions.map(r => `      <reaction id="${r.id}" name="${r.name}" reversible="${r.reversible}">
        <listOfReactants>
${r.substrates.map(s => `          <speciesReference species="${s}" stoichiometry="1" constant="true"/>`).join('\n')}
        </listOfReactants>
        <listOfProducts>
${r.products.map(p => `          <speciesReference species="${p}" stoichiometry="1" constant="true"/>`).join('\n')}
        </listOfProducts>
        <notes><body xmlns="http://www.w3.org/1999/xhtml">
          <p>Enzyme: ${r.enzyme}${r.ecNumber ? ` (EC ${r.ecNumber})` : ''}${r.gene ? `, Gene: ${r.gene}` : ''}</p>
        </body></notes>
      </reaction>`).join('\n')}
    </listOfReactions>
  </model>
</sbml>`;

        const uri = await vscode.window.showSaveDialog({
            defaultUri: vscode.Uri.file(`${pw.name.replace(/\s+/g, '_')}.sbml`),
            filters: { 'SBML': ['sbml', 'xml'] }
        });

        if (uri) {
            await vscode.workspace.fs.writeFile(uri, Buffer.from(sbml, 'utf-8'));
            vscode.window.showInformationMessage(`📦 Ruta exportada a SBML: ${uri.fsPath}`);
        }
    }

    /**
     * Exportar a BioScript
     */
    private async exportToBioScript() {
        if (!this.currentPathway) return;
        const pw = this.currentPathway;

        let bio = `// Ruta metabólica: ${pw.name}\n`;
        bio += `// ${pw.description}\n`;
        bio += `// Organismo: ${pw.organism}\n\n`;
        bio += `genetic_circuit ${pw.name.replace(/\s+/g, '_').toLowerCase()} {\n`;
        bio += `    host: "${pw.organism}"\n\n`;

        for (const rxn of pw.reactions) {
            // RBS strength relative to BBa_B0034 (1.0 RPU, Kelly et al. 2009 J Biol Eng 3:4)
            // Promoter strength scaled relative to flow requirements
            const relStrength = Math.min(rxn.flux / (pw.reactions[0]?.flux || 1), 1.0);
            bio += `    // ${rxn.name} (EC ${rxn.ecNumber || '?'}) — kcat=${rxn.kcat || '?'} s⁻¹, Km=${rxn.km || '?'} mM (BRENDA)\n`;
            bio += `    promoter p_${rxn.gene || rxn.id} (type: "constitutive", strength: ${relStrength.toFixed(2)}) {}\n`;
            bio += `    rbs rbs_${rxn.gene || rxn.id} (strength: 0.6) {} // BBa_B0032 ≈ 0.6 RPU (Salis 2009)\n`;
            bio += `    gene ${rxn.gene || rxn.id} (product: "${rxn.enzyme}", ec: "${rxn.ecNumber || ''}") {}\n`;
            bio += `    terminator t_${rxn.gene || rxn.id} (efficiency: 0.98) {} // BBa_B0015 (Chen et al. 2013 NAR)\n\n`;
        }

        bio += `}\n`;

        const doc = await vscode.workspace.openTextDocument({ language: 'bioscript', content: bio });
        await vscode.window.showTextDocument(doc, vscode.ViewColumn.One);
        vscode.window.showInformationMessage('🧬 Ruta metabólica convertida a BioScript');
    }

    // ── WebView ────────────────────────────────────────────────────────

    private getWebviewContent(): string {
        const templateList = Object.entries(PATHWAY_TEMPLATES).map(([id, pw]) => ({
            id, name: pw.name, description: pw.description, organism: pw.organism,
            reactions: pw.reactions.length, metabolites: pw.metabolites.length
        }));

        return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>Pathway Designer</title>
<style>
    :root { --bg:#1e1e2e; --surface:#2a2a3e; --primary:#7c3aed; --accent:#22d3ee;
            --success:#10b981; --warning:#f59e0b; --error:#ef4444; --text:#e2e8f0;
            --text2:#94a3b8; --border:#334155; }
    *{margin:0;padding:0;box-sizing:border-box}
    body{font-family:'Segoe UI',system-ui,sans-serif;background:var(--bg);color:var(--text);padding:16px}
    h1{font-size:1.4em;margin-bottom:4px}
    h2{font-size:1.05em;color:var(--accent);margin:14px 0 8px}
    .subtitle{color:var(--text2);font-size:0.85em;margin-bottom:14px}
    .btn{padding:7px 14px;border:none;border-radius:6px;cursor:pointer;font-size:0.82em;font-weight:600;transition:all .2s}
    .btn-primary{background:var(--primary);color:white}
    .btn-primary:hover{background:#6d28d9}
    .btn-accent{background:var(--accent);color:#000}
    .btn-success{background:var(--success);color:white}
    .btn-warning{background:var(--warning);color:#000}
    .btn-outline{background:transparent;border:1px solid var(--border);color:var(--text)}
    .btn-sm{padding:4px 10px;font-size:0.78em}
    .row{display:flex;gap:8px;flex-wrap:wrap;margin:8px 0}
    .card{background:var(--surface);border:1px solid var(--border);border-radius:8px;padding:14px;margin-bottom:10px}
    .template-card{cursor:pointer;transition:all .2s}
    .template-card:hover{border-color:var(--primary);transform:translateY(-1px)}
    .template-name{font-weight:700;font-size:1em}
    .template-desc{color:var(--text2);font-size:0.85em;margin:4px 0}
    .template-stats{font-size:0.78em;color:var(--accent)}
    canvas{background:#111827;border-radius:8px;border:1px solid var(--border);display:block;margin:10px 0}
    .table{width:100%;border-collapse:collapse;font-size:0.82em}
    .table th{background:var(--surface);text-align:left;padding:8px;border:1px solid var(--border);font-weight:600}
    .table td{padding:8px;border:1px solid var(--border)}
    .flux-bar{width:80px;height:8px;background:var(--border);border-radius:4px;display:inline-block;vertical-align:middle}
    .flux-fill{height:100%;border-radius:4px}
    .bottleneck{color:var(--error);font-weight:700}
    .tabs{display:flex;gap:4px;margin:10px 0}
    .tab{padding:6px 14px;border:1px solid var(--border);background:var(--surface);color:var(--text2);border-radius:6px;cursor:pointer;font-size:0.82em}
    .tab.active{background:var(--primary);color:white;border-color:var(--primary)}
    .panel{display:none}
    .panel.active{display:block}
    .suggestion{padding:8px 12px;background:var(--surface);border-radius:6px;margin:4px 0;font-size:0.85em;border-left:3px solid var(--accent)}
    .fba-result{font-size:0.9em}
    .fba-yield{font-size:1.2em;font-weight:700;color:var(--success)}
    #templateSelect{display:block}
    #pathwayView{display:none}
</style>
</head>
<body>
    <h1>🔬 Metabolic Pathway Designer</h1>
    <p class="subtitle">Diseño visual de rutas metabólicas con análisis de flujo</p>

    <!-- Selección de template -->
    <div id="templateSelect">
        <h2>Seleccionar Ruta Metabólica</h2>
        <div id="templates">
            ${templateList.map(t => `
                <div class="card template-card" onclick="loadTemplate('${t.id}')">
                    <div class="template-name">🧪 ${t.name}</div>
                    <div class="template-desc">${t.description}</div>
                    <div class="template-stats">🦠 ${t.organism} · ${t.reactions} reacciones · ${t.metabolites} metabolitos</div>
                </div>
            `).join('')}
        </div>
        <p style="color:var(--text2);font-size:0.82em;margin-top:12px">O cree una ruta personalizada desde cero.</p>
        <button class="btn btn-outline" onclick="createEmpty()">+ Nueva ruta vacía</button>
    </div>

    <!-- Vista de ruta -->
    <div id="pathwayView">
        <div class="row" style="justify-content:space-between;align-items:center">
            <div>
                <span style="font-weight:700;font-size:1.1em" id="pwName"></span>
                <span style="color:var(--text2);font-size:0.85em;margin-left:8px" id="pwOrg"></span>
            </div>
            <button class="btn btn-sm btn-outline" onclick="backToTemplates()">← Volver</button>
        </div>

        <div class="tabs">
            <div class="tab active" onclick="switchTab('diagram')">📊 Diagrama</div>
            <div class="tab" onclick="switchTab('reactions')">⚗️ Reacciones</div>
            <div class="tab" onclick="switchTab('fba')">📈 Análisis FBA</div>
            <div class="tab" onclick="switchTab('export')">📤 Exportar</div>
        </div>

        <div id="tab-diagram" class="panel active">
            <canvas id="pathwayCanvas" width="700" height="500"></canvas>
        </div>

        <div id="tab-reactions" class="panel">
            <div id="reactionsTable"></div>
        </div>

        <div id="tab-fba" class="panel">
            <div class="row">
                <button class="btn btn-primary" onclick="runFBA()">📈 Ejecutar Análisis de Flujo</button>
            </div>
            <div id="fbaResults">
                <div style="text-align:center;padding:30px;color:var(--text2)">
                    Pulse "Ejecutar" para analizar flujos metabólicos.
                </div>
            </div>
        </div>

        <div id="tab-export" class="panel">
            <h2>Exportar Ruta</h2>
            <div class="row">
                <button class="btn btn-primary" onclick="exportSBML()">📦 Exportar SBML</button>
                <button class="btn btn-accent" onclick="exportBioScript()">🧬 Convertir a BioScript</button>
            </div>
        </div>
    </div>

<script>
    const vscode = acquireVsCodeApi();
    let pathway = null;

    function loadTemplate(id) { vscode.postMessage({command:'loadTemplate',templateId:id}); }
    function createEmpty() {
        pathway = { name:'Nueva Ruta',description:'',organism:'E. coli',metabolites:[],reactions:[] };
        showPathway(pathway);
    }
    function backToTemplates() {
        document.getElementById('templateSelect').style.display='block';
        document.getElementById('pathwayView').style.display='none';
    }
    function switchTab(name) {
        document.querySelectorAll('.tab').forEach(t=>t.classList.remove('active'));
        document.querySelectorAll('.panel').forEach(p=>p.classList.remove('active'));
        event.target.classList.add('active');
        document.getElementById('tab-'+name).classList.add('active');
        if(name==='diagram') drawPathway();
    }
    function runFBA() { vscode.postMessage({command:'runFBA'}); }
    function exportSBML() { vscode.postMessage({command:'exportSBML'}); }
    function exportBioScript() { vscode.postMessage({command:'exportBioScript'}); }
    function optimizeFlux(id) { vscode.postMessage({command:'optimizeFlux',targetReaction:id}); }

    function showPathway(pw) {
        pathway = pw;
        document.getElementById('templateSelect').style.display='none';
        document.getElementById('pathwayView').style.display='block';
        document.getElementById('pwName').textContent=pw.name;
        document.getElementById('pwOrg').textContent=pw.organism;
        renderReactionsTable(pw);
        setTimeout(()=>drawPathway(),100);
    }

    function drawPathway() {
        if(!pathway) return;
        const canvas = document.getElementById('pathwayCanvas');
        const ctx = canvas.getContext('2d');
        const pw = pathway;

        // Auto-layout
        const padding = 60;
        const metaboliteRadius = 22;
        const cols = Math.ceil(Math.sqrt(pw.metabolites.length));
        const spacing = 100;
        pw.metabolites.forEach((m, i) => {
            if (m.x <= 50 && m.y <= 50) {
                m.x = padding + (i % cols) * spacing;
                m.y = padding + Math.floor(i / cols) * spacing;
            }
        });

        canvas.width = Math.max(700, (cols+1) * spacing + padding);
        canvas.height = Math.max(500, (Math.ceil(pw.metabolites.length / cols) + 1) * spacing + padding);

        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // Dibujar reacciones (flechas)
        for (const rxn of pw.reactions) {
            for (const sid of rxn.substrates) {
                for (const pid of rxn.products) {
                    const s = pw.metabolites.find(m=>m.id===sid);
                    const p = pw.metabolites.find(m=>m.id===pid);
                    if(!s||!p) continue;

                    ctx.beginPath();
                    ctx.strokeStyle = rxn.flux > 1.5 ? '#22d3ee' : '#64748b';
                    ctx.lineWidth = Math.max(1, rxn.flux);
                    ctx.moveTo(s.x, s.y);
                    ctx.lineTo(p.x, p.y);
                    ctx.stroke();

                    // Flecha
                    const angle = Math.atan2(p.y - s.y, p.x - s.x);
                    const arrowX = (s.x + p.x) / 2;
                    const arrowY = (s.y + p.y) / 2;
                    ctx.beginPath();
                    ctx.fillStyle = rxn.flux > 1.5 ? '#22d3ee' : '#64748b';
                    ctx.moveTo(arrowX + 8*Math.cos(angle), arrowY + 8*Math.sin(angle));
                    ctx.lineTo(arrowX + 8*Math.cos(angle+2.5), arrowY + 8*Math.sin(angle+2.5));
                    ctx.lineTo(arrowX + 8*Math.cos(angle-2.5), arrowY + 8*Math.sin(angle-2.5));
                    ctx.closePath();
                    ctx.fill();

                    // Nombre enzima
                    ctx.fillStyle = '#94a3b8';
                    ctx.font = '10px Segoe UI';
                    ctx.textAlign = 'center';
                    ctx.fillText(rxn.enzyme, arrowX + 15*Math.cos(angle+Math.PI/2), arrowY + 15*Math.sin(angle+Math.PI/2));

                    if (rxn.reversible) {
                        ctx.setLineDash([3,3]);
                        ctx.beginPath();
                        ctx.moveTo(p.x, p.y + 3);
                        ctx.lineTo(s.x, s.y + 3);
                        ctx.stroke();
                        ctx.setLineDash([]);
                    }
                }
            }
        }

        // Dibujar metabolitos
        for (const m of pw.metabolites) {
            ctx.beginPath();
            ctx.arc(m.x, m.y, metaboliteRadius, 0, Math.PI * 2);
            ctx.fillStyle = '#2a2a3e';
            ctx.fill();
            ctx.strokeStyle = '#7c3aed';
            ctx.lineWidth = 2;
            ctx.stroke();

            ctx.fillStyle = '#e2e8f0';
            ctx.font = 'bold 10px Segoe UI';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(m.name.length > 8 ? m.id : m.name, m.x, m.y);

            if (m.formula) {
                ctx.fillStyle = '#94a3b8';
                ctx.font = '8px Segoe UI';
                ctx.fillText(m.formula, m.x, m.y + metaboliteRadius + 10);
            }
        }
    }

    function renderReactionsTable(pw) {
        const el = document.getElementById('reactionsTable');
        el.innerHTML = '<table class="table"><tr><th>ID</th><th>Reacción</th><th>Enzima</th><th>Gen</th>' +
            '<th>EC</th><th>Sustratos → Productos</th><th>Flujo</th><th>Acción</th></tr>' +
            pw.reactions.map(r => {
                const maxFlux = Math.max(...pw.reactions.map(x=>x.flux));
                const pct = (r.flux/maxFlux*100);
                return '<tr><td>'+r.id+'</td><td>'+r.name+'</td><td><strong>'+r.enzyme+'</strong></td>' +
                    '<td>'+(r.gene||'-')+'</td><td>'+(r.ecNumber||'-')+'</td>' +
                    '<td>'+r.substrates.join(', ')+' → '+r.products.join(', ')+'</td>' +
                    '<td><span class="flux-bar"><span class="flux-fill" style="width:'+pct+'%;background:'+(pct<30?'var(--error)':pct<70?'var(--warning)':'var(--success)')+'"></span></span> '+r.flux.toFixed(1)+'</td>' +
                    '<td><button class="btn btn-sm btn-outline" onclick="optimizeFlux(\\''+r.id+'\\')">⚡</button></td></tr>';
            }).join('') + '</table>';
    }

    window.addEventListener('message', event => {
        const msg = event.data;
        switch(msg.command) {
            case 'pathwayLoaded':
                showPathway(msg.pathway);
                break;
            case 'fbaResult':
                renderFBA(msg);
                break;
            case 'optimizationSuggestions':
                renderOptSuggestions(msg);
                break;
        }
    });

    function renderFBA(data) {
        const el = document.getElementById('fbaResults');
        let html = '<div class="card fba-result">';
        html += '<div class="row" style="justify-content:space-between"><div>';
        html += '<h3>Rendimiento teórico</h3><div class="fba-yield">' + data.yield + '%</div>';
        html += '</div><div><h3>Cuello de botella</h3><div class="bottleneck">' + data.bottleneck + '</div></div></div>';
        html += '</div>';

        html += '<table class="table"><tr><th>Reacción</th><th>Flujo calculado</th><th>Estado</th></tr>';
        for (const r of data.results) {
            const maxF = Math.max(...data.results.map(x=>x.flux));
            const pct = maxF > 0 ? (r.flux/maxF*100) : 0;
            html += '<tr><td>' + r.name + '</td>';
            html += '<td><span class="flux-bar"><span class="flux-fill" style="width:'+pct+'%;background:'+(r.bottleneck?'var(--error)':'var(--success)')+'"></span></span> ' + r.flux + '</td>';
            html += '<td>' + (r.bottleneck ? '<span class="bottleneck">⚠️ Cuello de botella</span>' : '✅ OK') + '</td></tr>';
        }
        html += '</table>';
        el.innerHTML = html;
    }

    function renderOptSuggestions(data) {
        let html = '<div class="card"><h3>⚡ Optimización: ' + data.reaction + '</h3>';
        html += data.suggestions.map(s => '<div class="suggestion">' + s + '</div>').join('');
        html += '</div>';
        document.getElementById('fbaResults').innerHTML += html;
    }
</script>
</body>
</html>`;
    }

    dispose() {
        this.panel?.dispose();
    }
}
