/**
 * SynBio-LLVM - Biblioteca de Partes Genéticas
 * Browser interactivo de partes iGEM/BioBrick + partes estándar
 * Permite buscar, filtrar e insertar partes en el editor
 * 
 * Integración con iGEM Registry of Standard Biological Parts:
 *   API: http://parts.igem.org/cgi/xml/part.cgi?part=BBa_XXXXX
 *   Ref: https://parts.igem.org/Registry_API
 */

import * as vscode from 'vscode';

/** Categoría de la parte */
type PartCategory = 'promoter' | 'rbs' | 'cds' | 'terminator' | 'reporter' | 'regulatory' | 'tag' | 'other';

/** Parte genética del registro */
interface BioPart {
    id: string;
    name: string;
    category: PartCategory;
    description: string;
    sequence: string;
    length: number;
    organism: string;
    registryId: string;
    source: 'iGEM' | 'Anderson' | 'CIDAR' | 'SynBio-LLVM' | 'Custom';
    strength?: number;       // 0-1 (relative)
    reliability: number;     // 1-5 stars
    references: number;      // papers citing this part
    tags: string[];
    compatibility: string[]; // compatible chassis
    parameters: Record<string, string>;
}

/** Catálogo completo de partes estándar */
const PARTS_CATALOG: BioPart[] = [
    // ===== PROMOTORES =====
    // Anderson Promoter Library
    { id: 'J23100', name: 'J23100 (Strongest)', category: 'promoter', description: 'Constitutive promoter, strongest in Anderson library. Reference standard.', sequence: 'TTGACGGCTAGCTCAGTCCTAGGTACAGTGCTAGC', length: 35, organism: 'E. coli', registryId: 'BBa_J23100', source: 'Anderson', strength: 1.0, reliability: 5, references: 450, tags: ['constitutive', 'strong', 'anderson'], compatibility: ['E. coli', 'B. subtilis'], parameters: { 'Relative Strength': '1.0', 'RPU': '1.00' } },

    { id: 'J23101', name: 'J23101', category: 'promoter', description: 'Constitutive promoter, very strong. Anderson library.', sequence: 'TTTACAGCTAGCTCAGTCCTAGGTATTATGCTAGC', length: 35, organism: 'E. coli', registryId: 'BBa_J23101', source: 'Anderson', strength: 0.70, reliability: 5, references: 380, tags: ['constitutive', 'strong', 'anderson'], compatibility: ['E. coli'], parameters: { 'Relative Strength': '0.70', 'RPU': '0.70' } },

    { id: 'J23106', name: 'J23106 (Medium)', category: 'promoter', description: 'Constitutive promoter, medium strength. Good for balanced expression.', sequence: 'TTTACGGCTAGCTCAGTCCTAGGTATAGTGCTAGC', length: 35, organism: 'E. coli', registryId: 'BBa_J23106', source: 'Anderson', strength: 0.47, reliability: 5, references: 200, tags: ['constitutive', 'medium', 'anderson'], compatibility: ['E. coli'], parameters: { 'Relative Strength': '0.47', 'RPU': '0.47' } },

    { id: 'J23117', name: 'J23117 (Weakest)', category: 'promoter', description: 'Constitutive promoter, weakest in Anderson library. Use for low-level basal expression.', sequence: 'TTGACAGCTAGCTCAGTCCTAGGGATTGTGCTAGC', length: 35, organism: 'E. coli', registryId: 'BBa_J23117', source: 'Anderson', strength: 0.06, reliability: 5, references: 120, tags: ['constitutive', 'weak', 'anderson'], compatibility: ['E. coli'], parameters: { 'Relative Strength': '0.06', 'RPU': '0.06' } },

    // Inducible promoters
    { id: 'R0010', name: 'pLac', category: 'promoter', description: 'LacI-regulated promoter. Induced by IPTG (allolactose analog).', sequence: 'CAATACGCAAACCGCCTCTCCCCGCGCGTTGGCCGATTCATTAATGCAGCTGGCACGACAGGTTTCCCGACTGGAAAGCGGGCAGTGAGCGCAACGCAATTAATGTGAGTTAGCTCACTCATTAGGCACCCCAGGCTTTACACTTTATGCTTCCGGCTCGTATGTTGTGTGGAATTGTGAGCGGATAACAATTTCACACAGGAAACAGCTATGACCATG', length: 200, organism: 'E. coli', registryId: 'BBa_R0010', source: 'iGEM', strength: 0.7, reliability: 5, references: 800, tags: ['inducible', 'IPTG', 'lac', 'classic'], compatibility: ['E. coli', 'Pseudomonas'], parameters: { 'Inducer': 'IPTG', 'K_half': '100 µM', 'Leakiness': '~5%' } },

    { id: 'R0040', name: 'pTet', category: 'promoter', description: 'TetR-regulated promoter. Induced by aTc (anhydrotetracycline).', sequence: 'TCCCTATCAGTGATAGAGATTGACATCCCTATCAGTGATAGAGATACTGAGCAC', length: 54, organism: 'E. coli', registryId: 'BBa_R0040', source: 'iGEM', strength: 0.8, reliability: 5, references: 650, tags: ['inducible', 'aTc', 'tet', 'classic'], compatibility: ['E. coli'], parameters: { 'Inducer': 'aTc', 'K_half': '10 ng/mL', 'Leakiness': '~3%' } },

    { id: 'I0500', name: 'pBAD', category: 'promoter', description: 'AraC-regulated promoter. Induced by L-arabinose. Tight regulation.', sequence: 'ACATTGATTATTTGCACGGCGTCACACTTTGCTATGCCATAGCATTTTTATCCATAAGATTAGCGGATCCTACCTGACGCTTTTTATCGCAACTCTCTACTGTTTCTCCATACCCGTTTTTTTGGGCTAGC', length: 130, organism: 'E. coli', registryId: 'BBa_I0500', source: 'iGEM', strength: 0.9, reliability: 4, references: 500, tags: ['inducible', 'arabinose', 'tight'], compatibility: ['E. coli'], parameters: { 'Inducer': 'L-Arabinose', 'K_half': '0.2%', 'Leakiness': '~1%' } },

    { id: 'R0051', name: 'pCI (Lambda)', category: 'promoter', description: 'cI-regulated promoter from Lambda phage. Key part of repressilator.', sequence: 'TAACACCGTGCGTGTTGACTATTTTACCTCTGGCGGTGATAATGGTTGC', length: 49, organism: 'E. coli', registryId: 'BBa_R0051', source: 'iGEM', strength: 0.75, reliability: 4, references: 300, tags: ['inducible', 'lambda', 'cI', 'repressilator'], compatibility: ['E. coli'], parameters: { 'Repressor': 'cI', 'Type': 'Repressible' } },

    // ===== RBS =====
    { id: 'B0034', name: 'RBS B0034 (Strong)', category: 'rbs', description: 'Strong consensus RBS. Most commonly used RBS in iGEM. Well-characterized.', sequence: 'AAAGAGGAGAAA', length: 12, organism: 'E. coli', registryId: 'BBa_B0034', source: 'iGEM', strength: 1.0, reliability: 5, references: 1200, tags: ['strong', 'consensus', 'standard'], compatibility: ['E. coli', 'B. subtilis'], parameters: { 'Translation Rate': 'High (~1.0)', 'ΔG': '-12.5 kcal/mol' } },

    { id: 'B0032', name: 'RBS B0032 (Medium)', category: 'rbs', description: 'Medium strength RBS. Good for balanced circuits.', sequence: 'TCACACAGGAAAG', length: 13, organism: 'E. coli', registryId: 'BBa_B0032', source: 'iGEM', strength: 0.5, reliability: 5, references: 500, tags: ['medium', 'balanced'], compatibility: ['E. coli'], parameters: { 'Translation Rate': 'Medium (~0.5)', 'ΔG': '-8.3 kcal/mol' } },

    { id: 'B0031', name: 'RBS B0031 (Weak)', category: 'rbs', description: 'Weak RBS. Useful for low-level expression or reducing burden.', sequence: 'TCACACAGGAAAG', length: 13, organism: 'E. coli', registryId: 'BBa_B0031', source: 'iGEM', strength: 0.07, reliability: 4, references: 200, tags: ['weak', 'low-burden'], compatibility: ['E. coli'], parameters: { 'Translation Rate': 'Low (~0.07)', 'ΔG': '-5.1 kcal/mol' } },

    // ===== REPORTERS =====
    { id: 'E0040', name: 'GFP (Green)', category: 'reporter', description: 'Enhanced Green Fluorescent Protein. Most used reporter in synbio. Ex/Em: 488/509 nm.', sequence: 'ATGCGTAAAGGAGAAGAACTTTTCACTGGAGTTGTCCCAATTCTTGTTGAATTAGATGGTGATGTTAATGGGCACAAATTTTCTGTCAGTGGAGAGGGTGAAGGTGATGCAACATACGGAAAACTTACCCTTAAATTTATTTGCACTACTGGAAAACTACCTGTTCCATGGCCAACACTTGTCACTACTTTCGGTTATGGTGTTCAATGCTTTGCGAGATACCCAGATCATATGAAACAGCATGACTTTTTCAAGAGTGCCATGCCCGAAGGTTATGTACAGGAAAGAACTATATTTTTCAAAGATGACGGGAACTACAAGACACGTGCTGAAGTCAAGTTTGAAGGTGATACCCTTGTTAATAGAATCGAGTTAAAAGGTATTGATTTTAAAGAAGATGGAAACATTCTTGGACACAAATTGGAATACAACTATAACTCACACAATGTATACATCATGGCAGACAAACAAAAGAATGGAATCAAAGTTAACTTCAAAATTAGACACAACATTGAAGATGGAAGCGTTCAACTAGCAGACCATTATCAACAAAATACTCCAATTGGCGATGGCCCTGTCCTTTTACCAGACAACCATTACCTGTCCACACAATCTGCCCTTTCGAAAGATCCCAACGAAAAGAGAGACCACATGGTCCTTCTTGAGTTTGTAACAGCTGCTGGGATTACACATGGCATGGATGAACTATACAAATAATAA', length: 720, organism: 'Universal', registryId: 'BBa_E0040', source: 'iGEM', reliability: 5, references: 2000, tags: ['green', 'fluorescent', 'reporter', 'classic'], compatibility: ['E. coli', 'Yeast', 'Mammalian'], parameters: { 'Excitation': '488 nm', 'Emission': '509 nm', 'MW': '26.9 kDa', 'Maturation': '~40 min' } },

    { id: 'E1010', name: 'mRFP1 (Red)', category: 'reporter', description: 'Monomeric Red Fluorescent Protein. Good for dual-reporter systems.', sequence: 'ATGGCTTCCTCCGAAGACGTTATCAAAGAGTTCATGCGTTTCAAAGTTCGTATGGAAGGTTCCGTTAACGGTCACGAGTTCGAAATCGAAGGTGAAGGTGAAGGTCGTCCGTACGAAGGTACCCAGACCGCTAAACTGAAAGTTACCAAAGGTGGTCCGCTGCCGTTCGCTTGGGACATCCTGTCCCCGCAGTTCCAGTACGGTTCCAAAGCTTACGTTAAACACCCGGCTGACATCCCGGACTACCTGAAACTGTCCTTCCCGGAAGGTTTCAAATGGGAACGTGTTATGAACTTCGAAGACGGTGGTGTTGTTACCGTTACCCAGGACTCCTCCCTGCAAGACGGTGAGTTCATCTACAAAGTTAAACTGCGTGGTACCAACTTCCCGTCCGACGGTCCGGTTATGCAGAAGAAAACGATGGGTTGGGAAGCTTCCACCGAACGTATGTACCCGGAAGACGGTGCTCTGAAAGGTGAAATCAAAATGCGTCTGAAACTGAAAGACGGTGGTCACTACGACGCTGAAGTTAAAACCACCTACATGGCTAAAAAACCGGTTCAGCTGCCGGGTGCTTACAAAACCGACATCAAACTGGACATCACCTCCCACAACGAAGACTACACCATCGTTGAACAGTACGAACGTGCTGAAGGTCGTCACTCCACCGGTGCTTAATAA', length: 672, organism: 'Universal', registryId: 'BBa_E1010', source: 'iGEM', reliability: 5, references: 800, tags: ['red', 'fluorescent', 'reporter', 'monomeric'], compatibility: ['E. coli', 'Yeast', 'Mammalian'], parameters: { 'Excitation': '584 nm', 'Emission': '607 nm', 'MW': '25.4 kDa' } },

    // ===== REGULADORES =====
    { id: 'C0012', name: 'LacI', category: 'regulatory', description: 'Lac repressor. Binds pLac promoter. Releases with IPTG.', sequence: 'ATGAAACCAGTAACGTTATACGATGTCGCAGAGTATGCCGGTGTCTCTTATCAGACCGTTTCCCGCGTGGTGAACCAGGCCAGCCACGTTTCTGCGAAAACGCGGGAAAAAGTGGAAGCGGCGATGGCGGAGCTGAATTACATTCCCAACCGCGTGGCACAACAACTGGCGGGCAAACAGTCGTTGCTG', length: 186, organism: 'E. coli', registryId: 'BBa_C0012', source: 'iGEM', reliability: 5, references: 600, tags: ['repressor', 'lac', 'IPTG-responsive'], compatibility: ['E. coli'], parameters: { 'Target': 'pLac', 'Inducer': 'IPTG', 'Mechanism': 'Allosteric relief' } },

    { id: 'C0040', name: 'TetR', category: 'regulatory', description: 'Tet repressor. Binds pTet promoter. Releases with aTc.', sequence: 'ATGTCTAGATTAGATAAAAGTAAAGTGATTAACAGCGCATTAGAGCTGCTTAATGAGGTCGGAATCGAAGGTTTAACAACC', length: 80, organism: 'E. coli', registryId: 'BBa_C0040', source: 'iGEM', reliability: 5, references: 500, tags: ['repressor', 'tet', 'aTc-responsive'], compatibility: ['E. coli'], parameters: { 'Target': 'pTet', 'Inducer': 'aTc', 'Mechanism': 'Allosteric relief' } },

    { id: 'C0051', name: 'cI (Lambda)', category: 'regulatory', description: 'Lambda phage cI repressor. Key repressilator component.', sequence: 'ATGAGCACAAAAAAGAAACCATTAACACAAGAGCAGCTTGAGGACGCACGTCGCCTTAAAGCAATTTATGAAAAAAA', length: 75, organism: 'E. coli', registryId: 'BBa_C0051', source: 'iGEM', reliability: 4, references: 350, tags: ['repressor', 'lambda', 'cI', 'repressilator'], compatibility: ['E. coli'], parameters: { 'Target': 'pCI', 'Mechanism': 'Cooperative binding' } },

    // ===== TERMINADORES =====
    { id: 'B0010', name: 'T1 (rrnB)', category: 'terminator', description: 'Strong transcription terminator from E. coli rrnB gene. Bidirectional.', sequence: 'CCAGGCATCAAATAAAACGAAAGGCTCAGTCGAAAGACTGGGCCTTTCGTTTTATCTGTTGTTTGTCGGTGAACGCTCTC', length: 79, organism: 'E. coli', registryId: 'BBa_B0010', source: 'iGEM', strength: 0.99, reliability: 5, references: 900, tags: ['strong', 'bidirectional', 'rrnB'], compatibility: ['E. coli', 'B. subtilis'], parameters: { 'Efficiency': '99%', 'Direction': 'Bidirectional' } },

    { id: 'B0012', name: 'TE (rrnB)', category: 'terminator', description: 'T7 early terminator. Often used with B0010 for double termination.', sequence: 'TCACACTGGCTCACCTTCGGGTGGGCCTTTCTGCGTTTATA', length: 41, organism: 'E. coli', registryId: 'BBa_B0012', source: 'iGEM', strength: 0.95, reliability: 5, references: 700, tags: ['strong', 'T7', 'double-terminator'], compatibility: ['E. coli'], parameters: { 'Efficiency': '95%', 'Often paired with': 'BBa_B0010' } },

    { id: 'B0015', name: 'Double Terminator', category: 'terminator', description: 'B0010 + B0012 double terminator. Gold standard for termination.', sequence: 'CCAGGCATCAAATAAAACGAAAGGCTCAGTCGAAAGACTGGGCCTTTCGTTTTATCTGTTGTTTGTCGGTGAACGCTCTCTACTAGAGTCACACTGGCTCACCTTCGGGTGGGCCTTTCTGCGTTTATA', length: 129, organism: 'E. coli', registryId: 'BBa_B0015', source: 'iGEM', strength: 0.998, reliability: 5, references: 1500, tags: ['double', 'gold-standard', 'strongest'], compatibility: ['E. coli', 'B. subtilis', 'Yeast'], parameters: { 'Efficiency': '99.8%', 'Components': 'B0010 + B0012' } },

    // ===== TAGS =====
    { id: 'K1319004', name: '6xHis Tag', category: 'tag', description: 'Hexahistidine tag for protein purification via IMAC.', sequence: 'CATCACCATCACCATCAC', length: 18, organism: 'Universal', registryId: 'BBa_K1319004', source: 'iGEM', reliability: 5, references: 300, tags: ['purification', 'his-tag', 'IMAC'], compatibility: ['E. coli', 'Yeast', 'Mammalian'], parameters: { 'Use': 'Protein purification', 'Position': 'N-term or C-term' } },

    { id: 'FLAG', name: 'FLAG Tag', category: 'tag', description: 'FLAG epitope tag (DYKDDDDK) for detection and purification.', sequence: 'GACTACAAGGACGACGATGACAAG', length: 24, organism: 'Universal', registryId: 'Custom_FLAG', source: 'SynBio-LLVM', reliability: 5, references: 500, tags: ['detection', 'purification', 'epitope'], compatibility: ['E. coli', 'Yeast', 'Mammalian'], parameters: { 'Peptide': 'DYKDDDDK', 'Use': 'Western blot / IP' } },
];

export class PartsLibraryBrowser implements vscode.Disposable {
    private panel: vscode.WebviewPanel | undefined;
    private context: vscode.ExtensionContext;
    private disposables: vscode.Disposable[] = [];

    constructor(context: vscode.ExtensionContext) {
        this.context = context;
    }

    async show(): Promise<void> {
        if (this.panel) { this.panel.reveal(); return; }

        this.panel = vscode.window.createWebviewPanel(
            'synbioPartsLibrary',
            '📚 Biblioteca de Partes',
            vscode.ViewColumn.Two,
            { enableScripts: true, retainContextWhenHidden: true }
        );

        this.panel.webview.html = this.getWebviewHTML();

        this.panel.webview.onDidReceiveMessage(async (msg) => {
            switch (msg.command) {
                case 'getParts':
                    this.panel?.webview.postMessage({ command: 'partsData', parts: PARTS_CATALOG });
                    break;
                case 'insertPart':
                    await this.insertPartInEditor(msg.part);
                    break;
                case 'copySequence':
                    await vscode.env.clipboard.writeText(msg.sequence);
                    vscode.window.showInformationMessage(`Secuencia de ${msg.name} copiada`);
                    break;
                case 'fetchFromRegistry':
                    await this.fetchPartFromiGEM(msg.partId);
                    break;
            }
        }, undefined, this.disposables);

        this.panel.onDidDispose(() => { this.panel = undefined; }, null, this.disposables);
    }

    /** Inserta una parte como código BioScript en el editor */
    private async insertPartInEditor(part: BioPart): Promise<void> {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showWarningMessage('No hay editor activo para insertar la parte');
            return;
        }

        let snippet = '';
        switch (part.category) {
            case 'promoter':
                snippet = `promoter ${part.name.replace(/[^a-zA-Z0-9_]/g, '_')} {\n    registry: "${part.registryId}"\n    sequence: "${part.sequence}"\n    strength: ${part.strength || 0.5}\n    // ${part.description}\n}\n\n`;
                break;
            case 'rbs':
                snippet = `rbs ${part.name.replace(/[^a-zA-Z0-9_]/g, '_')} {\n    registry: "${part.registryId}"\n    sequence: "${part.sequence}"\n    strength: ${part.strength || 0.5}\n}\n\n`;
                break;
            case 'reporter':
            case 'cds':
            case 'regulatory':
                snippet = `gene ${part.name.replace(/[^a-zA-Z0-9_]/g, '_')} {\n    registry: "${part.registryId}"\n    sequence: "${part.sequence.substring(0, 60)}..."\n    function: "${part.tags[0] || 'unknown'}"\n    // ${part.description}\n}\n\n`;
                break;
            case 'terminator':
                snippet = `terminator ${part.name.replace(/[^a-zA-Z0-9_]/g, '_')} {\n    registry: "${part.registryId}"\n    sequence: "${part.sequence}"\n    efficiency: ${part.strength || 0.95}\n}\n\n`;
                break;
            default:
                snippet = `// Part: ${part.name} (${part.registryId})\n// ${part.description}\n// Sequence: ${part.sequence.substring(0, 40)}...\n\n`;
        }

        await editor.edit(editBuilder => {
            editBuilder.insert(editor.selection.active, snippet);
        });

        vscode.window.showInformationMessage(`Insertado: ${part.name} (${part.registryId})`);
    }

    /**
     * Busca una parte en el iGEM Registry of Standard Biological Parts (API real)
     * 
     * API endpoint: http://parts.igem.org/cgi/xml/part.cgi?part=BBa_XXXXX
     * Documentación: https://parts.igem.org/Registry_API
     * 
     * Parsea la respuesta XML para extraer:
     *   - part_name, part_short_desc, part_type
     *   - seq_data (secuencia de DNA real del registro)
     *   - part_url, part_author
     *   - deep_subparts (componentes)
     * 
     * Fallback: si el fetch falla (offline/timeout), busca en el catálogo local PARTS_CATALOG
     */
    private async fetchPartFromiGEM(partId: string): Promise<void> {
        const registryId = partId.startsWith('BBa_') ? partId : `BBa_${partId}`;
        const apiUrl = `http://parts.igem.org/cgi/xml/part.cgi?part=${registryId}`;

        try {
            this.panel?.webview.postMessage({
                command: 'registryStatus',
                status: 'loading',
                message: `Consultando iGEM Registry: ${registryId}...`
            });

            // Fetch con timeout de 8 segundos
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 8000);

            const response = await fetch(apiUrl, { signal: controller.signal });
            clearTimeout(timeout);

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const xmlText = await response.text();

            // Parsear XML manualmente (no hay DOMParser en Node/VS Code extension host)
            const getTag = (xml: string, tag: string): string => {
                const match = xml.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`));
                return match ? match[1].trim() : '';
            };

            const partName = getTag(xmlText, 'part_name') || registryId;
            const description = getTag(xmlText, 'part_short_desc') || 'Sin descripción';
            const partType = getTag(xmlText, 'part_type') || 'unknown';
            const sequence = getTag(xmlText, 'seq_data') || '';
            const partUrl = getTag(xmlText, 'part_url') || `http://parts.igem.org/Part:${registryId}`;
            const author = getTag(xmlText, 'part_author') || 'Unknown';
            const status = getTag(xmlText, 'part_status') || '';
            const rating = getTag(xmlText, 'part_rating');
            const categories = getTag(xmlText, 'part_categories');

            // Determinar categoría
            const typeMap: Record<string, PartCategory> = {
                'Regulatory': 'promoter', 'Promoter': 'promoter',
                'RBS': 'rbs', 'Ribosome Binding Site': 'rbs',
                'Coding': 'cds', 'CDS': 'cds', 'Gene': 'cds',
                'Terminator': 'terminator',
                'Reporter': 'reporter',
                'Tag': 'tag',
            };
            const category: PartCategory = typeMap[partType] || 'other';

            if (!sequence) {
                // Parte encontrada pero sin secuencia
                this.panel?.webview.postMessage({
                    command: 'registryResult',
                    success: true,
                    part: null,
                    message: `${registryId} encontrado en iGEM Registry pero sin secuencia disponible. Tipo: ${partType}. Autor: ${author}.`
                });
                return;
            }

            const fetchedPart: BioPart = {
                id: partName.replace('BBa_', ''),
                name: partName,
                category,
                description: description.substring(0, 200),
                sequence: sequence.toUpperCase(),
                length: sequence.length,
                organism: 'E. coli',
                registryId,
                source: 'iGEM',
                reliability: rating ? Math.min(parseInt(rating) || 3, 5) : 3,
                references: 0,
                tags: [partType.toLowerCase(), 'registry-live', status].filter(Boolean),
                compatibility: ['E. coli'],
                parameters: {
                    'Autor': author,
                    'Tipo iGEM': partType,
                    'Estado': status || 'Available',
                    'URL': partUrl,
                    'Fuente': 'iGEM Registry API (live fetch)',
                }
            };

            this.panel?.webview.postMessage({
                command: 'registryResult',
                success: true,
                part: fetchedPart,
                message: `✅ ${registryId} obtenido del iGEM Registry (${sequence.length} bp)`
            });

            vscode.window.showInformationMessage(
                `iGEM Registry: ${registryId} — ${sequence.length} bp, tipo: ${partType}`
            );

        } catch (err: any) {
            const errorMsg = err.name === 'AbortError'
                ? `Timeout conectando a iGEM Registry (8s). Verifica tu conexión a internet.`
                : `Error consultando iGEM Registry: ${err.message}`;

            // Fallback: buscar en catálogo local
            const localPart = PARTS_CATALOG.find(p => p.registryId === registryId || p.id === partId.replace('BBa_', ''));

            this.panel?.webview.postMessage({
                command: 'registryResult',
                success: false,
                part: localPart || null,
                message: localPart
                    ? `⚠️ ${errorMsg}\nUsando datos locales del catálogo para ${registryId}.`
                    : `❌ ${errorMsg}\nParte no encontrada en catálogo local.`
            });
        }
    }

    private getWebviewHTML(): string {
        return `<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Biblioteca de Partes</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: 'Segoe UI', Tahoma, sans-serif; background: #1e1e2e; color: #cdd6f4; padding: 20px; }
        .header { display: flex; align-items: center; gap: 12px; margin-bottom: 20px; }
        .header h1 { font-size: 22px; color: #94e2d5; }
        .badge { background: #313244; color: #a6adc8; padding: 4px 10px; border-radius: 12px; font-size: 11px; }
        .search-bar { display: flex; gap: 10px; margin-bottom: 16px; }
        .search-bar input { flex: 1; background: #313244; color: #cdd6f4; border: 1px solid #45475a; border-radius: 8px; padding: 10px 14px; font-size: 14px; }
        .search-bar input:focus { border-color: #94e2d5; outline: none; }
        .search-bar input::placeholder { color: #6c7086; }
        .filters { display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 16px; }
        .filter-btn { padding: 6px 14px; background: #313244; color: #a6adc8; border: 1px solid #45475a; border-radius: 20px; cursor: pointer; font-size: 12px; transition: all 0.2s; }
        .filter-btn:hover { background: #45475a; }
        .filter-btn.active { background: #94e2d5; color: #1e1e2e; border-color: #94e2d5; font-weight: 600; }
        .parts-grid { display: flex; flex-direction: column; gap: 8px; max-height: calc(100vh - 200px); overflow-y: auto; }
        .part-card { background: #313244; border-radius: 10px; padding: 14px; border: 1px solid #45475a; cursor: pointer; transition: all 0.2s; }
        .part-card:hover { border-color: #94e2d5; transform: translateX(2px); }
        .part-card.expanded { border-color: #94e2d5; background: #3b3b52; }
        .part-header { display: flex; align-items: center; gap: 10px; }
        .part-type-icon { width: 32px; height: 32px; border-radius: 8px; display: flex; align-items: center; justify-content: center; font-size: 16px; flex-shrink: 0; }
        .part-type-icon.promoter { background: rgba(250, 179, 135, 0.2); color: #fab387; }
        .part-type-icon.rbs { background: rgba(166, 227, 161, 0.2); color: #a6e3a1; }
        .part-type-icon.reporter, .part-type-icon.cds { background: rgba(137, 180, 250, 0.2); color: #89b4fa; }
        .part-type-icon.regulatory { background: rgba(203, 166, 247, 0.2); color: #cba6f7; }
        .part-type-icon.terminator { background: rgba(243, 139, 168, 0.2); color: #f38ba8; }
        .part-type-icon.tag { background: rgba(249, 226, 175, 0.2); color: #f9e2af; }
        .part-type-icon.other { background: rgba(166, 173, 200, 0.2); color: #a6adc8; }
        .part-info { flex: 1; min-width: 0; }
        .part-title { font-size: 14px; font-weight: 600; color: #cdd6f4; }
        .part-registry { font-size: 11px; color: #94e2d5; font-family: monospace; }
        .part-desc { font-size: 12px; color: #a6adc8; margin-top: 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .part-meta { display: flex; gap: 12px; align-items: center; flex-shrink: 0; }
        .part-meta .len { font-size: 11px; color: #6c7086; }
        .stars { color: #f9e2af; font-size: 11px; }
        .refs { font-size: 10px; color: #6c7086; }
        .part-details { display: none; margin-top: 12px; padding-top: 12px; border-top: 1px solid #45475a; }
        .part-card.expanded .part-details { display: block; }
        .detail-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 10px; }
        .detail-item { font-size: 12px; }
        .detail-item .label { color: #6c7086; font-size: 10px; text-transform: uppercase; }
        .detail-item .value { color: #cdd6f4; margin-top: 2px; }
        .seq-preview { background: #1e1e2e; border-radius: 6px; padding: 8px; font-family: 'Cascadia Code', monospace; font-size: 11px; word-break: break-all; max-height: 60px; overflow: hidden; color: #94e2d5; margin-bottom: 10px; }
        .part-tags { display: flex; gap: 4px; flex-wrap: wrap; margin-bottom: 10px; }
        .tag { background: #45475a; color: #a6adc8; padding: 2px 8px; border-radius: 10px; font-size: 10px; }
        .part-actions { display: flex; gap: 8px; }
        .act-btn { padding: 6px 14px; border: none; border-radius: 6px; font-size: 12px; cursor: pointer; font-weight: 600; transition: all 0.2s; }
        .act-btn.insert { background: #94e2d5; color: #1e1e2e; }
        .act-btn.insert:hover { filter: brightness(1.1); }
        .act-btn.copy { background: #45475a; color: #cdd6f4; }
        .act-btn.copy:hover { background: #585b70; }
        .count-badge { background: #45475a; color: #94e2d5; padding: 2px 8px; border-radius: 10px; font-size: 11px; margin-left: auto; }
        .strength-bar { width: 50px; height: 6px; background: #45475a; border-radius: 3px; overflow: hidden; display: inline-block; vertical-align: middle; margin-left: 4px; }
        .strength-fill { height: 100%; border-radius: 3px; }
    </style>
</head>
<body>
    <div class="header">
        <h1>📚 Biblioteca de Partes Genéticas</h1>
        <span class="badge">iGEM · Anderson · CIDAR</span>
    </div>

    <div class="search-bar">
        <input type="text" id="searchInput" placeholder="Buscar partes... (ej: pLac, GFP, strong promoter)" oninput="filterParts()">
    </div>

    <div class="search-bar" style="margin-bottom:8px;">
        <input type="text" id="registryInput" placeholder="Buscar en iGEM Registry (ej: BBa_J23100, BBa_E0040)" style="flex:2;">
        <button class="filter-btn" style="background:#94e2d5; color:#1e1e2e; font-weight:600; padding:8px 16px;" onclick="fetchFromRegistry()">🌐 Fetch iGEM</button>
    </div>
    <div id="registryMsg" style="font-size:12px; padding:4px 8px; margin-bottom:8px; display:none; border-radius:6px;"></div>

    <div class="filters" id="filters">
        <button class="filter-btn active" data-filter="all" onclick="setFilter('all')">Todas</button>
        <button class="filter-btn" data-filter="promoter" onclick="setFilter('promoter')">→ Promotores</button>
        <button class="filter-btn" data-filter="rbs" onclick="setFilter('rbs')">◆ RBS</button>
        <button class="filter-btn" data-filter="reporter" onclick="setFilter('reporter')">💡 Reporters</button>
        <button class="filter-btn" data-filter="regulatory" onclick="setFilter('regulatory')">🔧 Reguladores</button>
        <button class="filter-btn" data-filter="terminator" onclick="setFilter('terminator')">⊣ Terminadores</button>
        <button class="filter-btn" data-filter="tag" onclick="setFilter('tag')">🏷️ Tags</button>
    </div>

    <div class="parts-grid" id="partsGrid"></div>

    <script>
        const vscode = acquireVsCodeApi();
        let allParts = [];
        let activeFilter = 'all';

        vscode.postMessage({ command: 'getParts' });

        function setFilter(filter) {
            activeFilter = filter;
            document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
            document.querySelector('[data-filter="'+filter+'"]').classList.add('active');
            filterParts();
        }

        function filterParts() {
            const query = document.getElementById('searchInput').value.toLowerCase();
            const filtered = allParts.filter(p => {
                const matchFilter = activeFilter === 'all' || p.category === activeFilter;
                const matchQuery = !query || p.name.toLowerCase().includes(query) || p.description.toLowerCase().includes(query) || p.registryId.toLowerCase().includes(query) || p.tags.some(t => t.includes(query));
                return matchFilter && matchQuery;
            });
            renderParts(filtered);
        }

        function renderParts(parts) {
            const grid = document.getElementById('partsGrid');
            const icons = { promoter: '→', rbs: '◆', reporter: '💡', regulatory: '🔧', terminator: '⊣', cds: '▣', tag: '🏷️', other: '?' };

            let html = '';
            for (const p of parts) {
                const starsStr = '★'.repeat(p.reliability) + '☆'.repeat(5 - p.reliability);
                const strengthBar = p.strength !== undefined
                    ? '<div class="strength-bar"><div class="strength-fill" style="width:' + (p.strength * 100) + '%; background:' + (p.strength > 0.7 ? '#a6e3a1' : p.strength > 0.3 ? '#f9e2af' : '#f38ba8') + ';"></div></div>'
                    : '';

                html += '<div class="part-card" onclick="toggleExpand(this)" data-id="' + p.id + '">';
                html += '<div class="part-header">';
                html += '<div class="part-type-icon ' + p.category + '">' + (icons[p.category] || '?') + '</div>';
                html += '<div class="part-info"><div class="part-title">' + p.name + ' <span class="part-registry">' + p.registryId + '</span></div><div class="part-desc">' + p.description + '</div></div>';
                html += '<div class="part-meta"><span class="len">' + p.length + ' bp</span>' + strengthBar + '</div>';
                html += '</div>';

                // Expandable details
                html += '<div class="part-details">';
                html += '<div class="detail-grid">';
                html += '<div class="detail-item"><div class="label">Organismo</div><div class="value">' + p.organism + '</div></div>';
                html += '<div class="detail-item"><div class="label">Confiabilidad</div><div class="value"><span class="stars">' + starsStr + '</span></div></div>';
                html += '<div class="detail-item"><div class="label">Referencias</div><div class="value">' + p.references + ' papers</div></div>';
                html += '<div class="detail-item"><div class="label">Fuente</div><div class="value">' + p.source + '</div></div>';
                for (const [k, v] of Object.entries(p.parameters || {})) {
                    html += '<div class="detail-item"><div class="label">' + k + '</div><div class="value">' + v + '</div></div>';
                }
                html += '</div>';
                html += '<div class="part-tags">';
                for (const t of p.tags) { html += '<span class="tag">' + t + '</span>'; }
                for (const c of p.compatibility) { html += '<span class="tag">✓ ' + c + '</span>'; }
                html += '</div>';
                html += '<div class="seq-preview">' + p.sequence.substring(0, 120) + (p.sequence.length > 120 ? '...' : '') + '</div>';
                html += '<div class="part-actions">';
                html += '<button class="act-btn insert" onclick="event.stopPropagation(); insertPart(&quot;' + p.id + '&quot;)">📝 Insertar en Editor</button>';
                html += '<button class="act-btn copy" onclick="event.stopPropagation(); copySeq(&quot;' + p.id + '&quot;)">📋 Copiar Secuencia</button>';
                html += '</div>';
                html += '</div>';
                html += '</div>';
            }

            if (parts.length === 0) {
                html = '<div style="text-align:center; padding:40px; color:#6c7086;">No se encontraron partes con ese criterio</div>';
            }

            grid.innerHTML = html;
        }

        function toggleExpand(card) {
            card.classList.toggle('expanded');
        }

        function insertPart(id) {
            const part = allParts.find(p => p.id === id);
            if (part) { vscode.postMessage({ command: 'insertPart', part }); }
        }

        function copySeq(id) {
            const part = allParts.find(p => p.id === id);
            if (part) { vscode.postMessage({ command: 'copySequence', name: part.name, sequence: part.sequence }); }
        }

        function fetchFromRegistry() {
            const input = document.getElementById('registryInput').value.trim();
            if (!input) return;
            const msgEl = document.getElementById('registryMsg');
            msgEl.style.display = 'block';
            msgEl.style.background = 'rgba(148, 226, 213, 0.1)';
            msgEl.style.color = '#94e2d5';
            msgEl.textContent = '🔄 Consultando iGEM Registry...';
            vscode.postMessage({ command: 'fetchFromRegistry', partId: input });
        }

        window.addEventListener('message', event => {
            if (event.data.command === 'partsData') {
                allParts = event.data.parts;
                filterParts();
            }
            if (event.data.command === 'registryStatus') {
                const msgEl = document.getElementById('registryMsg');
                msgEl.style.display = 'block';
                msgEl.style.background = 'rgba(148, 226, 213, 0.1)';
                msgEl.style.color = '#94e2d5';
                msgEl.textContent = event.data.message;
            }
            if (event.data.command === 'registryResult') {
                const msgEl = document.getElementById('registryMsg');
                msgEl.style.display = 'block';
                if (event.data.success) {
                    msgEl.style.background = 'rgba(166, 227, 161, 0.1)';
                    msgEl.style.color = '#a6e3a1';
                    if (event.data.part) {
                        // Agregar parte obtenida al catálogo temporal
                        allParts.unshift(event.data.part);
                        filterParts();
                    }
                } else {
                    msgEl.style.background = 'rgba(243, 139, 168, 0.1)';
                    msgEl.style.color = '#f38ba8';
                    if (event.data.part) {
                        // Fallback local encontrado
                        msgEl.style.background = 'rgba(249, 226, 175, 0.1)';
                        msgEl.style.color = '#f9e2af';
                    }
                }
                msgEl.textContent = event.data.message;
            }
        });
    </script>
</body>
</html>`;
    }

    dispose(): void {
        this.panel?.dispose();
        this.disposables.forEach(d => d.dispose());
    }
}
