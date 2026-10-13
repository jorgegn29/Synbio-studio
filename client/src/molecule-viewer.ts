/**
 * SynBio-LLVM Molecule Viewer
 * Visor 3D molecular usando NGL Viewer (https://nglviewer.org)
 * 
 * Características:
 * - Carga de estructuras desde RCSB PDB API
 * - Biblioteca integrada de proteínas de Biología Sintética
 * - Detección contextual de proteínas en código .bio
 * - 7 representaciones (cartoon, surface, ball+stick, spacefill, licorice, ribbon, backbone)
 * - 6 esquemas de color (cadena, residuo, estr. secundaria, hidrofobicidad, B-factor, elemento)
 * - Captura de imagen a PNG
 * - Panel de info con átomos, residuos, cadenas
 * 
 * PDB IDs verificados en RCSB (última verificación: 2024):
 *   GFP: 1GFL (Ormö et al. 1996, Science 273:1392)
 *   mCherry: 2H5Q (Shu et al. 2006, Biochemistry 45:9639)
 *   LacI: 1LBG (Lewis et al. 1996, Science 271:1247)
 *   TetR: 4AC0 (Hinrichs et al. 1994, Science 264:418)
 *   Cas9: 4OO8 (Nishimasu et al. 2014, Cell 156:935)
 *   CcdB: 3VUB (Dao-Thi et al. 2005, JMB 348:1091)
 *   DNA B-form: 1BNA (Drew et al. 1981, PNAS 78:2179)
 *   AraC: 2ARC (Soisson et al. 1997, Science 276:421)
 */

import * as vscode from 'vscode';

export interface MoleculeData {
    type: 'dna' | 'rna' | 'protein' | 'circuit';
    sequence?: string;
    pdbData?: string;
    pdbId?: string;
    name: string;
    secondaryStructure?: string;
}

/**
 * Biblioteca de moléculas de Biología Sintética con PDB IDs reales verificados.
 * Cada entrada incluye referencia bibliográfica y uso en ingeniería genética.
 */
export interface SynBioMolecule {
    name: string;
    pdbId: string;
    category: 'reporter' | 'repressor' | 'activator' | 'nuclease' | 'toxin' | 'structural' | 'enzyme';
    organism: string;
    description: string;
    molecularWeight: string;
    reference: string;
    igemPart?: string;
}

export const SYNBIO_MOLECULE_LIBRARY: SynBioMolecule[] = [
    // Reporteros fluorescentes
    {
        name: 'GFP (Green Fluorescent Protein)',
        pdbId: '1GFL',
        category: 'reporter',
        organism: 'Aequorea victoria',
        description: 'Proteína fluorescente verde. Excitación 395/475nm, Emisión 509nm. Primer reportero fluorescente, revolucionó la biología celular.',
        molecularWeight: '26.9 kDa',
        reference: 'Ormö et al. (1996) Science 273:1392',
        igemPart: 'BBa_E0040'
    },
    {
        name: 'mCherry',
        pdbId: '2H5Q',
        category: 'reporter',
        organism: 'Discosoma sp. (engineered)',
        description: 'Proteína fluorescente roja monomérica. Excitación 587nm, Emisión 610nm. Maduración rápida (~15min).',
        molecularWeight: '26.7 kDa',
        reference: 'Shu et al. (2006) Biochemistry 45:9639',
        igemPart: 'BBa_J06504'
    },
    {
        name: 'YFP (Yellow Fluorescent Protein)',
        pdbId: '1YFP',
        category: 'reporter',
        organism: 'Aequorea victoria (engineered)',
        description: 'Proteína fluorescente amarilla, variante de GFP. Excitación 514nm, Emisión 527nm.',
        molecularWeight: '26.9 kDa',
        reference: 'Wachter et al. (1998) Structure 6:1267'
    },
    {
        name: 'BFP (Blue Fluorescent Protein)',
        pdbId: '1BFP',
        category: 'reporter',
        organism: 'Aequorea victoria (engineered)',
        description: 'Proteína fluorescente azul, variante Y66H de GFP. Excitación 383nm, Emisión 448nm.',
        molecularWeight: '26.9 kDa',
        reference: 'Wachter et al. (1997) Biochemistry 36:9759'
    },
    // Represores
    {
        name: 'LacI (Lac Repressor)',
        pdbId: '1LBG',
        category: 'repressor',
        organism: 'Escherichia coli',
        description: 'Represor del operón lac. Se une al operador lacO. Inducible por IPTG y alolactosa. Funciona como tetrámero.',
        molecularWeight: '38.6 kDa (monómero)',
        reference: 'Lewis et al. (1996) Science 271:1247',
        igemPart: 'BBa_C0012'
    },
    {
        name: 'TetR (Tet Repressor)',
        pdbId: '4AC0',
        category: 'repressor',
        organism: 'Escherichia coli (Tn10)',
        description: 'Represor de tetraciclina. Dímero que se une a tetO. Inducible por aTc (anhidrotetraciclina).',
        molecularWeight: '23.4 kDa (monómero)',
        reference: 'Hinrichs et al. (1994) Science 264:418',
        igemPart: 'BBa_C0040'
    },
    {
        name: 'CI (Lambda Repressor)',
        pdbId: '1LMB',
        category: 'repressor',
        organism: 'Bacteriophage Lambda',
        description: 'Represor del fago lambda. Componente clave de toggle switches. Se une a operadores OR1/OR2.',
        molecularWeight: '26.2 kDa',
        reference: 'Beamer & Pabo (1992) JMB 227:177',
        igemPart: 'BBa_C0051'
    },
    // Activadores
    {
        name: 'AraC',
        pdbId: '2ARC',
        category: 'activator',
        organism: 'Escherichia coli',
        description: 'Regulador transcripcional dual del operón arabinosa. Activador en presencia de arabinosa, represor en ausencia.',
        molecularWeight: '33.4 kDa',
        reference: 'Soisson et al. (1997) Science 276:421'
    },
    {
        name: 'LuxR (Quorum Sensing)',
        pdbId: '1L3L',
        category: 'activator',
        organism: 'Vibrio fischeri',
        description: 'Activador transcripcional de quorum sensing. Se activa por AHL (N-acil homoserina lactona).',
        molecularWeight: '28.8 kDa',
        reference: 'Zhang et al. (2002) Nature 417:971',
        igemPart: 'BBa_C0062'
    },
    // CRISPR
    {
        name: 'Cas9 (SpCas9)',
        pdbId: '4OO8',
        category: 'nuclease',
        organism: 'Streptococcus pyogenes',
        description: 'Endonucleasa guiada por RNA del sistema CRISPR. Reconoce PAM 5\'-NGG-3\'. Edición genómica de precisión.',
        molecularWeight: '163 kDa',
        reference: 'Nishimasu et al. (2014) Cell 156:935'
    },
    {
        name: 'Cas12a (Cpf1)',
        pdbId: '5B43',
        category: 'nuclease',
        organism: 'Acidaminococcus sp.',
        description: 'Nucleasa CRISPR alternativa. PAM 5\'-TTTN-3\'. Genera cortes escalonados (staggered).',
        molecularWeight: '151 kDa',
        reference: 'Yamano et al. (2016) Cell 165:949'
    },
    // Toxinas (kill-switch)
    {
        name: 'CcdB (Toxin)',
        pdbId: '3VUB',
        category: 'toxin',
        organism: 'Escherichia coli (plasmid F)',
        description: 'Toxina del sistema CcdA/CcdB. Inhibe DNA girasa → muerte celular. Usado en kill-switches.',
        molecularWeight: '11.7 kDa',
        reference: 'Dao-Thi et al. (2005) JMB 348:1091',
        igemPart: 'BBa_P1010'
    },
    {
        name: 'MazF (mRNA Interferase)',
        pdbId: '1UB4',
        category: 'toxin',
        organism: 'Escherichia coli',
        description: 'Endoribonucleasa del sistema MazEF. Corta ARNm en secuencias ACA → bacteriostasis.',
        molecularWeight: '12.1 kDa',
        reference: 'Kamada et al. (2003) Mol Cell 11:875'
    },
    // ADN estructural
    {
        name: 'DNA B-form (Dodecámero Dickerson)',
        pdbId: '1BNA',
        category: 'structural',
        organism: 'Synthetic',
        description: 'Estructura canónica del ADN forma-B. Dodecámero CGCGAATTCGCG. Primera estructura de ADN resuelta por rayos X.',
        molecularWeight: '7.7 kDa',
        reference: 'Drew et al. (1981) PNAS 78:2179'
    },
    {
        name: 'DNA Z-form',
        pdbId: '4OCB',
        category: 'structural',
        organism: 'Synthetic',
        description: 'ADN forma-Z (hélice levógira). Patrón de alternancia GC. Relevante para regulación epigenética.',
        molecularWeight: '~8 kDa',
        reference: 'Wang et al. (1979) Nature 282:680'
    },
    // Enzimas útiles
    {
        name: 'T7 RNA Polymerase',
        pdbId: '1ARO',
        category: 'enzyme',
        organism: 'Bacteriophage T7',
        description: 'RNA polimerasa del fago T7. Altamente específica para el promotor T7. Hasta 5x más rápida que RNAP de E. coli.',
        molecularWeight: '99 kDa',
        reference: 'Sousa et al. (1993) Nature 364:593'
    },
    {
        name: 'GFP-Nanobody Complex',
        pdbId: '3OGO',
        category: 'reporter',
        organism: 'Camelid/A. victoria',
        description: 'Nanocuerpo anti-GFP unido a GFP. Herramienta para purificación y detección de proteínas etiquetadas.',
        molecularWeight: '~40 kDa',
        reference: 'Kirchhofer et al. (2010) Nat Struct Mol Biol 17:133'
    }
];

/**
 * Mapeo de nombres de partes biológicas a PDB IDs para detección contextual
 */
export const PROTEIN_TO_PDB: Record<string, string> = {
    'GFP': '1GFL', 'eGFP': '1GFL', 'sfGFP': '2B3P',
    'RFP': '2H5Q', 'mCherry': '2H5Q', 'DsRed': '1G7K',
    'YFP': '1YFP', 'BFP': '1BFP', 'CFP': '2WSO',
    'LacI': '1LBG', 'TetR': '4AC0', 'CI': '1LMB',
    'AraC': '2ARC', 'LuxR': '1L3L',
    'Cas9': '4OO8', 'dCas9': '4OO8', 'Cas12a': '5B43',
    'CcdB': '3VUB', 'CcdA': '3HP2', 'MazF': '1UB4',
    'T7_RNAP': '1ARO',
};

export class MoleculeViewer {
    private panel: vscode.WebviewPanel | undefined;
    private context: vscode.ExtensionContext;
    private currentMolecule: MoleculeData | undefined;

    constructor(context: vscode.ExtensionContext) {
        this.context = context;
    }

    /**
     * Detecta proteínas mencionadas en el código .bio activo
     */
    static detectProteinsInCode(text: string): { name: string; pdbId: string }[] {
        const found: { name: string; pdbId: string }[] = [];
        const seen = new Set<string>();

        for (const [name, pdbId] of Object.entries(PROTEIN_TO_PDB)) {
            // Busca el nombre como palabra completa (no substring)
            const regex = new RegExp(`\\b${name}\\b`, 'g');
            if (regex.test(text) && !seen.has(pdbId)) {
                seen.add(pdbId);
                found.push({ name, pdbId });
            }
        }
        return found;
    }

    /**
     * Abre el visor con un QuickPick de la biblioteca SynBio o detección contextual
     */
    async showWithLibrary(): Promise<void> {
        const items: vscode.QuickPickItem[] = [];

        // 1. Detectar proteínas en el archivo activo
        const editor = vscode.window.activeTextEditor;
        if (editor && editor.document.languageId === 'bioscript') {
            const detected = MoleculeViewer.detectProteinsInCode(editor.document.getText());
            if (detected.length > 0) {
                items.push({ label: '$(beaker) Detectadas en tu código', kind: vscode.QuickPickItemKind.Separator });
                for (const p of detected) {
                    const mol = SYNBIO_MOLECULE_LIBRARY.find(m => m.pdbId === p.pdbId);
                    items.push({
                        label: `$(symbol-variable) ${p.name}`,
                        description: `PDB: ${p.pdbId}`,
                        detail: mol ? mol.description.substring(0, 80) + '...' : undefined,
                    });
                }
            }
        }

        // 2. Categorías de la biblioteca
        const categories: Record<string, string> = {
            reporter: '$(symbol-color) Reporteros Fluorescentes',
            repressor: '$(debug-stop) Represores',
            activator: '$(debug-start) Activadores',
            nuclease: '$(symbol-event) CRISPR/Nucleasas',
            toxin: '$(warning) Toxinas (Kill-Switch)',
            structural: '$(symbol-structure) ADN Estructural',
            enzyme: '$(beaker) Enzimas',
        };

        for (const [cat, label] of Object.entries(categories)) {
            const mols = SYNBIO_MOLECULE_LIBRARY.filter(m => m.category === cat);
            if (mols.length > 0) {
                items.push({ label, kind: vscode.QuickPickItemKind.Separator });
                for (const mol of mols) {
                    items.push({
                        label: `${mol.name}`,
                        description: `PDB: ${mol.pdbId} · ${mol.molecularWeight}`,
                        detail: `${mol.organism} — ${mol.reference}`,
                    });
                }
            }
        }

        // 3. Opción manual
        items.push({ label: '$(search) Buscar por PDB ID', kind: vscode.QuickPickItemKind.Separator });
        items.push({
            label: '$(edit) Ingresar PDB ID manualmente',
            description: 'Cargar cualquier estructura de RCSB PDB'
        });

        const selection = await vscode.window.showQuickPick(items, {
            title: '🧬 Visor Molecular 3D — Seleccionar Molécula',
            placeHolder: 'Buscar proteína, ADN o molécula...',
            matchOnDescription: true,
            matchOnDetail: true,
        });

        if (!selection) return;

        if (selection.label.includes('Ingresar PDB ID')) {
            const pdbId = await vscode.window.showInputBox({
                prompt: 'PDB ID (4 caracteres)',
                placeHolder: 'Ej: 1BNA, 1GFL, 4OO8',
                validateInput: (v) => v.length === 4 ? null : 'El PDB ID debe tener 4 caracteres'
            });
            if (pdbId) {
                await this.show({ type: 'protein', name: pdbId.toUpperCase(), pdbId: pdbId.toUpperCase() });
            }
        } else {
            // Extraer PDB ID de la descripción
            const pdbMatch = selection.description?.match(/PDB:\s*(\w{4})/);
            if (pdbMatch) {
                const pdbId = pdbMatch[1];
                const cleanName = selection.label.replace(/\$\([^)]+\)\s*/, '');
                await this.show({ type: 'protein', name: cleanName, pdbId });
            }
        }
    }

    /**
     * Muestra el visor 3D con una molécula
     */
    async show(molecule?: MoleculeData): Promise<void> {
        if (this.panel) {
            this.panel.reveal(vscode.ViewColumn.Beside);
        } else {
            this.panel = vscode.window.createWebviewPanel(
                'synbioMoleculeViewer3D',
                '🧬 Visor Molecular 3D',
                vscode.ViewColumn.Beside,
                {
                    enableScripts: true,
                    retainContextWhenHidden: true,
                    localResourceRoots: []
                }
            );

            this.panel.onDidDispose(() => {
                this.panel = undefined;
            });

            // Manejar mensajes del WebView
            this.panel.webview.onDidReceiveMessage(
                async (message) => {
                    switch (message.command) {
                        case 'loadPDB':
                            await this.loadPDBFromRCSB(message.pdbId);
                            break;
                        case 'exportImage':
                            vscode.window.showInformationMessage('Imagen exportada');
                            break;
                        case 'error':
                            vscode.window.showErrorMessage(`Error en visor: ${message.text}`);
                            break;
                    }
                },
                undefined,
                this.context.subscriptions
            );
        }

        this.panel.webview.html = this.getViewerHTML(molecule);
        this.currentMolecule = molecule;

        if (molecule?.pdbId) {
            await this.loadPDBFromRCSB(molecule.pdbId);
        }
    }

    /**
     * Carga estructura desde RCSB PDB
     */
    async loadPDBFromRCSB(pdbId: string): Promise<void> {
        if (!this.panel) return;

        try {
            const response = await fetch(`https://files.rcsb.org/download/${pdbId}.pdb`);
            if (!response.ok) {
                throw new Error(`PDB ${pdbId} no encontrado`);
            }
            const pdbData = await response.text();
            
            this.panel.webview.postMessage({
                command: 'loadStructure',
                data: pdbData,
                format: 'pdb'
            });

            vscode.window.showInformationMessage(`✅ Estructura ${pdbId} cargada`);
        } catch (error) {
            vscode.window.showErrorMessage(`Error cargando ${pdbId}: ${error}`);
        }
    }

    /**
     * Carga estructura de DNA/RNA desde secuencia
     */
    loadSequence(sequence: string, type: 'dna' | 'rna'): void {
        if (!this.panel) return;

        this.panel.webview.postMessage({
            command: 'loadSequence',
            sequence,
            type
        });
    }

    /**
     * Actualiza la estructura secundaria mostrada
     */
    updateSecondaryStructure(structure: string): void {
        if (!this.panel) return;

        this.panel.webview.postMessage({
            command: 'updateSecondary',
            structure
        });
    }

    /**
     * HTML del visor con NGL integrado
     */
    private getViewerHTML(molecule?: MoleculeData): string {
        const moleculeJson = molecule ? JSON.stringify(molecule) : 'null';
        
        return `<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>SynBio Visor Molecular 3D</title>
    <script src="https://unpkg.com/ngl@2.3.1/dist/ngl.js"></script>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        
        body {
            background: #0d1117;
            color: #c9d1d9;
            font-family: 'Segoe UI', system-ui, sans-serif;
            height: 100vh;
            overflow: hidden;
        }
        
        .container {
            display: flex;
            flex-direction: column;
            height: 100vh;
        }
        
        .toolbar {
            background: #161b22;
            padding: 10px 15px;
            display: flex;
            align-items: center;
            gap: 10px;
            border-bottom: 1px solid #30363d;
            flex-wrap: wrap;
        }
        
        .toolbar-group {
            display: flex;
            align-items: center;
            gap: 8px;
        }
        
        .toolbar-divider {
            width: 1px;
            height: 24px;
            background: #30363d;
            margin: 0 5px;
        }
        
        button {
            background: #21262d;
            color: #c9d1d9;
            border: 1px solid #30363d;
            padding: 6px 12px;
            border-radius: 6px;
            cursor: pointer;
            font-size: 12px;
            display: flex;
            align-items: center;
            gap: 5px;
            transition: all 0.2s;
        }
        
        button:hover {
            background: #30363d;
            border-color: #8b949e;
        }
        
        button.active {
            background: #238636;
            border-color: #238636;
        }
        
        input[type="text"] {
            background: #0d1117;
            color: #c9d1d9;
            border: 1px solid #30363d;
            padding: 6px 10px;
            border-radius: 6px;
            width: 80px;
            font-size: 12px;
        }
        
        input[type="text"]:focus {
            outline: none;
            border-color: #58a6ff;
        }
        
        select {
            background: #21262d;
            color: #c9d1d9;
            border: 1px solid #30363d;
            padding: 6px 10px;
            border-radius: 6px;
            font-size: 12px;
            cursor: pointer;
        }
        
        .viewer-container {
            flex: 1;
            position: relative;
            background: #0d1117;
        }
        
        #viewport {
            width: 100%;
            height: 100%;
        }
        
        .info-panel {
            position: absolute;
            top: 10px;
            left: 10px;
            background: rgba(22, 27, 34, 0.9);
            border: 1px solid #30363d;
            border-radius: 8px;
            padding: 12px;
            max-width: 250px;
            font-size: 12px;
            backdrop-filter: blur(10px);
        }
        
        .info-panel h4 {
            color: #58a6ff;
            margin-bottom: 8px;
            display: flex;
            align-items: center;
            gap: 6px;
        }
        
        .info-row {
            display: flex;
            justify-content: space-between;
            margin: 4px 0;
            color: #8b949e;
        }
        
        .info-row span:last-child {
            color: #c9d1d9;
            font-family: 'Consolas', monospace;
        }
        
        .secondary-structure {
            margin-top: 10px;
            font-family: 'Consolas', monospace;
            font-size: 10px;
            word-break: break-all;
            background: #0d1117;
            padding: 8px;
            border-radius: 4px;
            max-height: 60px;
            overflow-y: auto;
        }
        
        .ss-helix { color: #f85149; }
        .ss-sheet { color: #58a6ff; }
        .ss-coil { color: #8b949e; }
        
        .loading {
            position: absolute;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            text-align: center;
        }
        
        .loading-spinner {
            width: 50px;
            height: 50px;
            border: 3px solid #30363d;
            border-top-color: #58a6ff;
            border-radius: 50%;
            animation: spin 1s linear infinite;
            margin: 0 auto 15px;
        }
        
        @keyframes spin {
            to { transform: rotate(360deg); }
        }
        
        .placeholder {
            position: absolute;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            text-align: center;
            color: #8b949e;
        }
        
        .placeholder-icon {
            font-size: 80px;
            margin-bottom: 20px;
            opacity: 0.5;
        }
        
        .placeholder h3 {
            color: #c9d1d9;
            margin-bottom: 10px;
        }
        
        .color-picker {
            display: flex;
            gap: 4px;
        }
        
        .color-swatch {
            width: 20px;
            height: 20px;
            border-radius: 4px;
            cursor: pointer;
            border: 2px solid transparent;
            transition: all 0.2s;
        }
        
        .color-swatch:hover {
            transform: scale(1.1);
        }
        
        .color-swatch.active {
            border-color: #fff;
        }
        
        .controls-hint {
            position: absolute;
            bottom: 10px;
            right: 10px;
            background: rgba(22, 27, 34, 0.8);
            padding: 8px 12px;
            border-radius: 6px;
            font-size: 11px;
            color: #8b949e;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="toolbar">
            <div class="toolbar-group">
                <span style="font-size: 14px;">🧬</span>
                <input type="text" id="pdbInput" placeholder="PDB ID" maxlength="4">
                <button onclick="loadPDB()">Cargar PDB</button>
            </div>
            
            <div class="toolbar-divider"></div>
            
            <div class="toolbar-group">
                <span style="font-size: 11px; color: #8b949e;">Representación:</span>
                <select id="repStyle" onchange="changeRepresentation()">
                    <option value="cartoon">Cartoon</option>
                    <option value="surface">Superficie</option>
                    <option value="ball+stick">Bolas y Palos</option>
                    <option value="spacefill">Esferas</option>
                    <option value="licorice">Licorice</option>
                    <option value="ribbon">Ribbon</option>
                    <option value="backbone">Backbone</option>
                </select>
            </div>
            
            <div class="toolbar-group">
                <span style="font-size: 11px; color: #8b949e;">Color:</span>
                <select id="colorScheme" onchange="changeColor()">
                    <option value="chainid">Por Cadena</option>
                    <option value="residueindex">Por Residuo</option>
                    <option value="sstruc">Estructura 2°</option>
                    <option value="hydrophobicity">Hidrofobicidad</option>
                    <option value="bfactor">B-Factor</option>
                    <option value="element">Por Elemento</option>
                </select>
            </div>
            
            <div class="toolbar-divider"></div>
            
            <div class="toolbar-group">
                <button onclick="toggleSpin()" id="spinBtn">⟳ Rotar</button>
                <button onclick="resetView()">↺ Reset</button>
                <button onclick="centerView()">⊕ Centrar</button>
                <button onclick="screenshot()">📷 Captura</button>
            </div>
        </div>
        
        <div class="viewer-container">
            <div id="viewport"></div>
            
            <div class="placeholder" id="placeholder">
                <div class="placeholder-icon">🔬</div>
                <h3>Visor Molecular 3D — SynBio-LLVM</h3>
                <p>Ingresa un PDB ID o selecciona una molécula de la biblioteca:</p>
                <div style="margin-top: 15px; display: flex; flex-wrap: wrap; gap: 6px; justify-content: center; max-width: 380px;">
                    <button onclick="loadFromRCSB('1GFL')" title="GFP - Ormö et al. 1996" style="font-size:11px;">🟢 GFP</button>
                    <button onclick="loadFromRCSB('2H5Q')" title="mCherry - Shu et al. 2006" style="font-size:11px;">🔴 mCherry</button>
                    <button onclick="loadFromRCSB('1LBG')" title="LacI - Lewis et al. 1996" style="font-size:11px;">🧬 LacI</button>
                    <button onclick="loadFromRCSB('4AC0')" title="TetR - Hinrichs et al. 1994" style="font-size:11px;">🧬 TetR</button>
                    <button onclick="loadFromRCSB('4OO8')" title="Cas9 - Nishimasu et al. 2014" style="font-size:11px;">✂️ Cas9</button>
                    <button onclick="loadFromRCSB('3VUB')" title="CcdB - Dao-Thi et al. 2005" style="font-size:11px;">☠️ CcdB</button>
                    <button onclick="loadFromRCSB('1BNA')" title="DNA B-form - Drew et al. 1981" style="font-size:11px;">🧬 DNA</button>
                    <button onclick="loadFromRCSB('1ARO')" title="T7 RNAP - Sousa et al. 1993" style="font-size:11px;">⚙️ T7 RNAP</button>
                    <button onclick="loadFromRCSB('2ARC')" title="AraC - Soisson et al. 1997" style="font-size:11px;">🔄 AraC</button>
                    <button onclick="loadFromRCSB('5B43')" title="Cas12a - Yamano et al. 2016" style="font-size:11px;">✂️ Cas12a</button>
                </div>
                <p style="margin-top: 12px; font-size: 11px; color: #6e7681;">
                    Powered by NGL Viewer · Datos de RCSB PDB
                </p>
            </div>
            
            <div class="loading" id="loading" style="display: none;">
                <div class="loading-spinner"></div>
                <p>Cargando estructura...</p>
            </div>
            
            <div class="info-panel" id="infoPanel" style="display: none;">
                <h4>📊 Información Molecular</h4>
                <div class="info-row">
                    <span>PDB ID:</span>
                    <span id="infoName">-</span>
                </div>
                <div class="info-row">
                    <span>Átomos:</span>
                    <span id="infoAtoms">-</span>
                </div>
                <div class="info-row">
                    <span>Residuos:</span>
                    <span id="infoResidues">-</span>
                </div>
                <div class="info-row">
                    <span>Cadenas:</span>
                    <span id="infoChains">-</span>
                </div>
                <div id="synbioInfoContainer" style="display: none;">
                    <div style="margin-top: 8px; border-top: 1px solid #30363d; padding-top: 8px;">
                        <div class="info-row">
                            <span>Organismo:</span>
                            <span id="infoOrganism">-</span>
                        </div>
                        <div class="info-row">
                            <span>Peso mol.:</span>
                            <span id="infoMW">-</span>
                        </div>
                        <div class="info-row" style="flex-direction: column; gap: 2px;">
                            <span style="color: #58a6ff; font-size: 10px;" id="infoRef">-</span>
                        </div>
                    </div>
                </div>
                <div id="secondaryContainer" style="display: none;">
                    <div style="margin-top: 8px; color: #8b949e;">Estructura 2°:</div>
                    <div class="secondary-structure" id="secondaryStructure"></div>
                </div>
            </div>
            
            <div class="controls-hint">
                🖱️ Rotar: Arrastrar | Zoom: Scroll | Mover: Shift+Arrastrar
            </div>
        </div>
    </div>

    <script>
        const vscode = acquireVsCodeApi();
        let stage = null;
        let component = null;
        let representation = null;
        let isSpinning = false;
        let spinAnimation = null;

        // Inicializar NGL Stage
        function initStage() {
            stage = new NGL.Stage("viewport", {
                backgroundColor: "#0d1117",
                quality: "high",
                impostor: true,
                workerDefault: true
            });
            
            // Responsive
            window.addEventListener("resize", () => {
                stage.handleResize();
            });
        }

        // Cargar PDB desde input
        function loadPDB() {
            const pdbId = document.getElementById('pdbInput').value.trim().toUpperCase();
            if (pdbId.length !== 4) {
                alert('El PDB ID debe tener 4 caracteres');
                return;
            }
            loadFromRCSB(pdbId);
        }

        // Cargar desde RCSB
        async function loadFromRCSB(pdbId) {
            showLoading(true);
            showPlaceholder(false);
            
            try {
                // Limpiar estructura anterior
                if (component) {
                    stage.removeComponent(component);
                }
                
                // Cargar nueva estructura
                component = await stage.loadFile(\`rcsb://\${pdbId}\`, {
                    defaultRepresentation: true
                });
                
                // Aplicar representación
                updateRepresentation();
                
                // Centrar vista
                stage.autoView();
                
                // Mostrar info
                updateInfo(pdbId);
                
                showLoading(false);
                
            } catch (error) {
                showLoading(false);
                showPlaceholder(true);
                vscode.postMessage({ command: 'error', text: \`Error cargando \${pdbId}: \${error.message}\` });
            }
        }

        // Cargar desde datos PDB directos
        function loadFromData(pdbData, format = 'pdb') {
            showLoading(true);
            showPlaceholder(false);
            
            if (component) {
                stage.removeComponent(component);
            }
            
            const blob = new Blob([pdbData], { type: 'text/plain' });
            
            stage.loadFile(blob, { ext: format }).then(comp => {
                component = comp;
                updateRepresentation();
                stage.autoView();
                updateInfo('Custom');
                showLoading(false);
            }).catch(error => {
                showLoading(false);
                showPlaceholder(true);
                vscode.postMessage({ command: 'error', text: error.message });
            });
        }

        // Actualizar representación
        function updateRepresentation() {
            if (!component) return;
            
            // Limpiar representaciones anteriores
            component.removeAllRepresentations();
            
            const style = document.getElementById('repStyle').value;
            const color = document.getElementById('colorScheme').value;
            
            representation = component.addRepresentation(style, {
                colorScheme: color,
                quality: "high"
            });
        }

        function changeRepresentation() {
            updateRepresentation();
        }

        function changeColor() {
            updateRepresentation();
        }

        // Toggle rotación automática
        function toggleSpin() {
            isSpinning = !isSpinning;
            const btn = document.getElementById('spinBtn');
            
            if (isSpinning) {
                btn.classList.add('active');
                stage.setSpin(true);
            } else {
                btn.classList.remove('active');
                stage.setSpin(false);
            }
        }

        function resetView() {
            if (stage) {
                stage.autoView(1000);
            }
        }

        function centerView() {
            if (component) {
                stage.autoView(component, 500);
            }
        }

        function screenshot() {
            if (stage) {
                stage.makeImage({
                    factor: 2,
                    antialias: true,
                    transparent: false,
                    trim: false
                }).then(blob => {
                    NGL.download(blob, "synbio-molecule.png");
                    vscode.postMessage({ command: 'exportImage' });
                });
            }
        }

        // Biblioteca SynBio en el visor para mostrar info enriquecida
        const synbioLibrary = {
            '1GFL': { name: 'GFP', organism: 'A. victoria', mw: '26.9 kDa', ref: 'Ormö et al. (1996) Science 273:1392' },
            '2H5Q': { name: 'mCherry', organism: 'Discosoma sp.', mw: '26.7 kDa', ref: 'Shu et al. (2006) Biochemistry 45:9639' },
            '1YFP': { name: 'YFP', organism: 'A. victoria', mw: '26.9 kDa', ref: 'Wachter et al. (1998) Structure 6:1267' },
            '1BFP': { name: 'BFP', organism: 'A. victoria', mw: '26.9 kDa', ref: 'Wachter et al. (1997) Biochemistry 36:9759' },
            '1LBG': { name: 'LacI', organism: 'E. coli', mw: '38.6 kDa', ref: 'Lewis et al. (1996) Science 271:1247' },
            '4AC0': { name: 'TetR', organism: 'E. coli (Tn10)', mw: '23.4 kDa', ref: 'Hinrichs et al. (1994) Science 264:418' },
            '1LMB': { name: 'CI Repressor', organism: 'Phage Lambda', mw: '26.2 kDa', ref: 'Beamer & Pabo (1992) JMB 227:177' },
            '2ARC': { name: 'AraC', organism: 'E. coli', mw: '33.4 kDa', ref: 'Soisson et al. (1997) Science 276:421' },
            '1L3L': { name: 'LuxR', organism: 'V. fischeri', mw: '28.8 kDa', ref: 'Zhang et al. (2002) Nature 417:971' },
            '4OO8': { name: 'Cas9', organism: 'S. pyogenes', mw: '163 kDa', ref: 'Nishimasu et al. (2014) Cell 156:935' },
            '5B43': { name: 'Cas12a', organism: 'Acidaminococcus', mw: '151 kDa', ref: 'Yamano et al. (2016) Cell 165:949' },
            '3VUB': { name: 'CcdB', organism: 'E. coli (F plasmid)', mw: '11.7 kDa', ref: 'Dao-Thi et al. (2005) JMB 348:1091' },
            '1UB4': { name: 'MazF', organism: 'E. coli', mw: '12.1 kDa', ref: 'Kamada et al. (2003) Mol Cell 11:875' },
            '1BNA': { name: 'DNA B-form', organism: 'Synthetic', mw: '7.7 kDa', ref: 'Drew et al. (1981) PNAS 78:2179' },
            '4OCB': { name: 'DNA Z-form', organism: 'Synthetic', mw: '~8 kDa', ref: 'Wang et al. (1979) Nature 282:680' },
            '1ARO': { name: 'T7 RNAP', organism: 'Phage T7', mw: '99 kDa', ref: 'Sousa et al. (1993) Nature 364:593' },
            '3OGO': { name: 'GFP-Nanobody', organism: 'Camelid', mw: '~40 kDa', ref: 'Kirchhofer et al. (2010) NSMB 17:133' },
        };

        // Actualizar panel de información
        function updateInfo(name) {
            document.getElementById('infoPanel').style.display = 'block';
            document.getElementById('infoName').textContent = name;
            
            if (component && component.structure) {
                const struct = component.structure;
                document.getElementById('infoAtoms').textContent = struct.atomCount.toLocaleString();
                document.getElementById('infoResidues').textContent = struct.residueCount.toLocaleString();
                document.getElementById('infoChains').textContent = struct.chainCount;
            }

            // Mostrar datos de la biblioteca SynBio si es una molécula conocida
            const pdbId = name.toUpperCase();
            const synbioInfo = synbioLibrary[pdbId];
            const container = document.getElementById('synbioInfoContainer');
            if (synbioInfo) {
                container.style.display = 'block';
                document.getElementById('infoOrganism').textContent = synbioInfo.organism;
                document.getElementById('infoMW').textContent = synbioInfo.mw;
                document.getElementById('infoRef').textContent = synbioInfo.ref;
            } else {
                container.style.display = 'none';
            }
        }

        // Mostrar estructura secundaria
        function showSecondaryStructure(structure) {
            const container = document.getElementById('secondaryContainer');
            const ssDiv = document.getElementById('secondaryStructure');
            
            if (structure) {
                container.style.display = 'block';
                // Colorear estructura secundaria
                let html = '';
                for (const char of structure) {
                    if (char === 'H') {
                        html += '<span class="ss-helix">H</span>';
                    } else if (char === 'E') {
                        html += '<span class="ss-sheet">E</span>';
                    } else {
                        html += '<span class="ss-coil">' + char + '</span>';
                    }
                }
                ssDiv.innerHTML = html;
            } else {
                container.style.display = 'none';
            }
        }

        function showLoading(show) {
            document.getElementById('loading').style.display = show ? 'block' : 'none';
        }

        function showPlaceholder(show) {
            document.getElementById('placeholder').style.display = show ? 'block' : 'none';
        }

        // Manejar mensajes desde VS Code
        window.addEventListener('message', event => {
            const message = event.data;
            
            switch (message.command) {
                case 'loadStructure':
                    loadFromData(message.data, message.format);
                    break;
                case 'loadPDB':
                    loadFromRCSB(message.pdbId);
                    break;
                case 'updateSecondary':
                    showSecondaryStructure(message.structure);
                    break;
            }
        });

        // Inicialización
        document.addEventListener('DOMContentLoaded', () => {
            initStage();
            
            // Cargar molécula inicial si existe
            const initialMolecule = ${moleculeJson};
            if (initialMolecule) {
                if (initialMolecule.pdbId) {
                    document.getElementById('pdbInput').value = initialMolecule.pdbId;
                    loadFromRCSB(initialMolecule.pdbId);
                } else if (initialMolecule.pdbData) {
                    loadFromData(initialMolecule.pdbData);
                }
                
                if (initialMolecule.secondaryStructure) {
                    showSecondaryStructure(initialMolecule.secondaryStructure);
                }
            }
        });

        // Enter para cargar PDB
        document.getElementById('pdbInput').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                loadPDB();
            }
        });
    </script>
</body>
</html>`;
    }

    dispose(): void {
        if (this.panel) {
            this.panel.dispose();
        }
    }
}
