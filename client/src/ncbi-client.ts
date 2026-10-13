/**
 * ══════════════════════════════════════════════════════════════════════════════
 * NCBI E-utilities Client — Real-Time Biological Sequence Search
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * Connects directly to NCBI databases (GenBank, RefSeq, Nucleotide, Protein)
 * for real-time sequence retrieval. This replaces hardcoded sequence data with
 * live queries to the world's largest biological database.
 *
 * NCBI E-utilities API:
 *   - esearch: Search for records by term → returns UIDs
 *   - efetch:  Fetch records by UID → returns full sequences (FASTA/GenBank)
 *   - einfo:   Database statistics
 *   - esummary: Record summaries
 *
 * Base URL: https://eutils.ncbi.nlm.nih.gov/entrez/eutils/
 *
 * Rate Limits (without API key): 3 requests/second
 * Rate Limits (with API key):    10 requests/second
 *
 * References:
 *   - E-utilities docs: https://www.ncbi.nlm.nih.gov/books/NBK25500/
 *   - NCBI API key: https://ncbiinsights.ncbi.nlm.nih.gov/2017/11/02/new-api-keys-for-the-e-utilities/
 * ══════════════════════════════════════════════════════════════════════════════
 */

import * as vscode from 'vscode';

const BASE_URL = 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils';
const TOOL_NAME = 'SynBio-LLVM-VSCode';
const EMAIL = 'synbio-llvm@users.noreply.github.com'; // required by NCBI policy

// ════════════════════════════════════════════════════════════════════════════
// INTERFACES
// ════════════════════════════════════════════════════════════════════════════

interface NCBISearchResult {
    esearchresult: {
        count: string;
        retmax: string;
        retstart: string;
        idlist: string[];
        querytranslation?: string;
    };
}

interface NCBISummaryResult {
    result: {
        uids: string[];
        [uid: string]: {
            uid: string;
            caption: string;
            title: string;
            extra: string;
            gi: number;
            slen: number;
            organism: string;
            genome: string;
            subtype: string;
            subname: string;
            accessionversion: string;
        } | string[];
    };
}

interface NCBIRecord {
    uid: string;
    accession: string;
    title: string;
    organism: string;
    length: number;
    sequence?: string;
    genbank?: string;
}

type NCBIDatabase = 'nucleotide' | 'protein' | 'gene' | 'pubmed';

// ════════════════════════════════════════════════════════════════════════════
// COMMON ORGANISM SEARCH TEMPLATES
// ════════════════════════════════════════════════════════════════════════════

const ORGANISM_TEMPLATES: Record<string, string> = {
    'E. coli K-12': '"Escherichia coli"[Organism] AND K-12[Strain]',
    'E. coli BL21': '"Escherichia coli"[Organism] AND BL21[Strain]',
    'S. cerevisiae': '"Saccharomyces cerevisiae"[Organism]',
    'B. subtilis': '"Bacillus subtilis"[Organism]',
    'P. putida': '"Pseudomonas putida"[Organism]',
    'C. elegans': '"Caenorhabditis elegans"[Organism]',
    'H. sapiens': '"Homo sapiens"[Organism]',
    'Synechocystis': '"Synechocystis sp. PCC 6803"[Organism]',
};

const GENE_TEMPLATES: Record<string, string> = {
    'GFP': 'green fluorescent protein[Gene Name] AND "Aequorea victoria"[Organism]',
    'mCherry': 'mCherry[Gene Name]',
    'LacI': 'lacI[Gene Name] AND "Escherichia coli"[Organism]',
    'TetR': 'tetR[Gene Name]',
    'Cas9': 'cas9[Gene Name] AND "Streptococcus pyogenes"[Organism]',
    'T7 RNA Pol': 'T7 RNA polymerase[Gene Name]',
    'Luciferase': 'luxAB[Gene Name] AND "Vibrio"[Organism]',
    'CcdB': 'ccdB[Gene Name] AND "Escherichia coli"[Organism]',
};

// ════════════════════════════════════════════════════════════════════════════
// NCBI CLIENT
// ════════════════════════════════════════════════════════════════════════════

export class NCBIClient implements vscode.Disposable {
    private outputChannel: vscode.OutputChannel;
    private disposables: vscode.Disposable[] = [];
    private rateLimitQueue: number[] = [];

    constructor(private context: vscode.ExtensionContext) {
        this.outputChannel = vscode.window.createOutputChannel('SynBio NCBI');
    }

    activate(): void {
        this.disposables.push(
            vscode.commands.registerCommand('synbio.ncbiSearch', () => this.searchSequences()),
            vscode.commands.registerCommand('synbio.ncbiFetchGene', () => this.fetchGeneByName()),
            vscode.commands.registerCommand('synbio.ncbiBlast', () => this.blastSequence()),
        );
        this.context.subscriptions.push(...this.disposables);
    }

    /**
     * Rate-limited fetch to respect NCBI's 3 req/sec limit
     */
    private async rateLimitedFetch(url: string): Promise<Response> {
        const now = Date.now();
        this.rateLimitQueue = this.rateLimitQueue.filter(t => now - t < 1000);

        if (this.rateLimitQueue.length >= 3) {
            const waitTime = 1000 - (now - this.rateLimitQueue[0]);
            await new Promise(resolve => setTimeout(resolve, waitTime));
        }

        this.rateLimitQueue.push(Date.now());
        return fetch(url);
    }

    /**
     * ESearch — Search NCBI database by term
     */
    private async esearch(db: NCBIDatabase, term: string, retmax = 20): Promise<NCBISearchResult> {
        const params = new URLSearchParams({
            db,
            term,
            retmax: String(retmax),
            retmode: 'json',
            tool: TOOL_NAME,
            email: EMAIL,
        });

        const url = `${BASE_URL}/esearch.fcgi?${params}`;
        this.outputChannel.appendLine(`[esearch] ${db}: "${term}"`);

        const response = await this.rateLimitedFetch(url);
        if (!response.ok) {
            throw new Error(`NCBI esearch failed: ${response.status} ${response.statusText}`);
        }

        return response.json() as Promise<NCBISearchResult>;
    }

    /**
     * ESummary — Get summaries for UIDs
     */
    private async esummary(db: NCBIDatabase, ids: string[]): Promise<NCBISummaryResult> {
        const params = new URLSearchParams({
            db,
            id: ids.join(','),
            retmode: 'json',
            tool: TOOL_NAME,
            email: EMAIL,
        });

        const url = `${BASE_URL}/esummary.fcgi?${params}`;
        const response = await this.rateLimitedFetch(url);
        if (!response.ok) {
            throw new Error(`NCBI esummary failed: ${response.status}`);
        }

        return response.json() as Promise<NCBISummaryResult>;
    }

    /**
     * EFetch — Fetch full record (FASTA, GenBank, etc.)
     */
    private async efetch(db: NCBIDatabase, id: string, rettype: 'fasta' | 'gb' | 'gp' = 'fasta'): Promise<string> {
        const params = new URLSearchParams({
            db,
            id,
            rettype,
            retmode: 'text',
            tool: TOOL_NAME,
            email: EMAIL,
        });

        const url = `${BASE_URL}/efetch.fcgi?${params}`;
        this.outputChannel.appendLine(`[efetch] ${db}/${id} (${rettype})`);

        const response = await this.rateLimitedFetch(url);
        if (!response.ok) {
            throw new Error(`NCBI efetch failed: ${response.status}`);
        }

        return response.text();
    }

    /**
     * Main search interface — search NCBI for sequences
     */
    async searchSequences(): Promise<void> {
        // Step 1: Choose database
        const dbChoice = await vscode.window.showQuickPick(
            [
                { label: '🧬 Nucleotide', description: 'DNA/RNA sequences (GenBank, RefSeq)', detail: 'nucleotide' },
                { label: '🔬 Protein', description: 'Protein sequences (UniProt, RefSeq)', detail: 'protein' },
                { label: '📊 Gene', description: 'Gene records with functional info', detail: 'gene' },
                { label: '📚 PubMed', description: 'Scientific literature', detail: 'pubmed' },
            ],
            { title: '🔍 NCBI Search — Elige base de datos', placeHolder: 'Selecciona la base de datos' }
        );

        if (!dbChoice) { return; }
        const db = dbChoice.detail as NCBIDatabase;

        // Step 2: Search term
        const term = await vscode.window.showInputBox({
            title: `🔍 Buscar en NCBI ${dbChoice.label}`,
            prompt: 'Término de búsqueda (soporta operadores NCBI)',
            placeHolder: 'Ej: cas9[Gene] AND "Streptococcus pyogenes"[Organism]',
            ignoreFocusOut: true,
        });

        if (!term) { return; }

        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: '🔍 Buscando en NCBI...',
            cancellable: true,
        }, async (progress, token) => {
            try {
                // Search
                progress.report({ message: 'Buscando registros...' });
                const searchResult = await this.esearch(db, term);
                const ids = searchResult.esearchresult.idlist;
                const totalCount = parseInt(searchResult.esearchresult.count);

                if (ids.length === 0) {
                    vscode.window.showInformationMessage(`No se encontraron resultados para "${term}" en ${db}`);
                    return;
                }

                // Get summaries
                progress.report({ message: `Obteniendo ${ids.length} de ${totalCount} resultados...` });

                let records: NCBIRecord[] = [];

                if (db !== 'pubmed') {
                    const summaries = await this.esummary(db, ids);
                    records = ids.map(uid => {
                        const entry = summaries.result[uid] as any;
                        return {
                            uid,
                            accession: entry?.accessionversion || entry?.caption || uid,
                            title: entry?.title || 'Sin título',
                            organism: entry?.organism || 'Desconocido',
                            length: entry?.slen || 0,
                        };
                    });
                } else {
                    records = ids.map(uid => ({
                        uid,
                        accession: uid,
                        title: `PubMed Article ${uid}`,
                        organism: '',
                        length: 0,
                    }));
                }

                // Show results as QuickPick
                const items = records.map(r => ({
                    label: `$(file-code) ${r.accession}`,
                    description: `${r.organism} | ${r.length > 0 ? r.length + ' bp' : ''}`,
                    detail: r.title,
                    record: r,
                }));

                const selected = await vscode.window.showQuickPick(items, {
                    title: `🧬 NCBI: ${totalCount} resultados para "${term}"`,
                    placeHolder: 'Selecciona un registro para obtener la secuencia',
                    matchOnDescription: true,
                    matchOnDetail: true,
                });

                if (!selected) { return; }

                // Fetch full record
                progress.report({ message: `Descargando ${selected.record.accession}...` });

                const formatChoice = await vscode.window.showQuickPick(
                    [
                        { label: '📄 FASTA', description: 'Secuencia pura', detail: 'fasta' as const },
                        ...(db !== 'pubmed' ? [{ label: '📋 GenBank', description: 'Registro completo con anotaciones', detail: 'gb' as const }] : []),
                    ],
                    { title: 'Formato de descarga' }
                );

                if (!formatChoice) { return; }

                const content = await this.efetch(db, selected.record.uid, formatChoice.detail as 'fasta' | 'gb');

                // Ask what to do with it
                const action = await vscode.window.showInformationMessage(
                    `✅ Descargado: ${selected.record.accession} (${content.length} chars)`,
                    'Abrir en Editor',
                    'Insertar en Archivo Actual',
                    'Copiar al Portapapeles',
                );

                switch (action) {
                    case 'Abrir en Editor': {
                        const lang = formatChoice.detail === 'fasta' ? 'plaintext' : 'plaintext';
                        const doc = await vscode.workspace.openTextDocument({
                            content: `${content}`,
                            language: lang,
                        });
                        await vscode.window.showTextDocument(doc);
                        break;
                    }
                    case 'Insertar en Archivo Actual': {
                        const editor = vscode.window.activeTextEditor;
                        if (editor) {
                            await editor.edit(edit => {
                                edit.insert(editor.selection.active, '\n' + content + '\n');
                            });
                        }
                        break;
                    }
                    case 'Copiar al Portapapeles':
                        await vscode.env.clipboard.writeText(content);
                        vscode.window.showInformationMessage('Secuencia copiada al portapapeles');
                        break;
                }

                this.outputChannel.appendLine(`[OK] ${selected.record.accession}: ${selected.record.title}`);

            } catch (err) {
                vscode.window.showErrorMessage(`Error NCBI: ${err instanceof Error ? err.message : String(err)}`);
                this.outputChannel.appendLine(`[ERROR] ${err}`);
            }
        });
    }

    /**
     * Quick fetch a gene by common name
     */
    async fetchGeneByName(): Promise<void> {
        const items = Object.entries(GENE_TEMPLATES).map(([name, query]) => ({
            label: `🧬 ${name}`,
            description: query,
            name,
            query,
        }));

        // Add custom option
        items.push({
            label: '✏️ Búsqueda personalizada...',
            description: 'Ingresa tu propio gen y organismo',
            name: 'custom',
            query: '',
        });

        const selected = await vscode.window.showQuickPick(items, {
            title: '⚡ Fetch rápido de gen — NCBI',
            placeHolder: 'Selecciona un gen común o busca uno personalizado',
        });

        if (!selected) { return; }

        let searchTerm = selected.query;

        if (selected.name === 'custom') {
            const gene = await vscode.window.showInputBox({
                title: 'Nombre del gen',
                placeHolder: 'Ej: lacZ, gfp, tetA',
            });
            if (!gene) { return; }

            const organism = await vscode.window.showQuickPick(
                Object.entries(ORGANISM_TEMPLATES).map(([name, query]) => ({
                    label: name,
                    query,
                })),
                { title: 'Organismo' }
            );

            searchTerm = `${gene}[Gene Name]` + (organism ? ` AND ${organism.query}` : '');
        }

        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: `🧬 Buscando ${selected.name}...`,
            cancellable: true,
        }, async (progress) => {
            try {
                const search = await this.esearch('nucleotide', searchTerm, 5);
                if (search.esearchresult.idlist.length === 0) {
                    vscode.window.showWarningMessage(`No se encontró "${searchTerm}" en NCBI`);
                    return;
                }

                const fasta = await this.efetch('nucleotide', search.esearchresult.idlist[0], 'fasta');

                const doc = await vscode.workspace.openTextDocument({
                    content: fasta,
                    language: 'plaintext',
                });
                await vscode.window.showTextDocument(doc);

                vscode.window.showInformationMessage(
                    `✅ ${selected.name} descargado de NCBI (${fasta.split('\n').slice(1).join('').length} bp)`
                );

            } catch (err) {
                vscode.window.showErrorMessage(`Error: ${err instanceof Error ? err.message : String(err)}`);
            }
        });
    }

    /**
     * BLAST a selected sequence against NCBI
     */
    async blastSequence(): Promise<void> {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showWarningMessage('Abre un archivo con una secuencia para hacer BLAST');
            return;
        }

        let sequence = editor.selection.isEmpty
            ? editor.document.getText()
            : editor.document.getText(editor.selection);

        // Clean sequence — remove FASTA header and whitespace
        sequence = sequence
            .split('\n')
            .filter(line => !line.startsWith('>'))
            .join('')
            .replace(/\s/g, '')
            .toUpperCase();

        if (sequence.length < 10) {
            vscode.window.showWarningMessage('Secuencia demasiado corta para BLAST (mínimo 10 nt/aa)');
            return;
        }

        // Determine if DNA or protein
        const isDNA = /^[ATCGN]+$/i.test(sequence);
        const program = isDNA ? 'blastn' : 'blastp';
        const database = isDNA ? 'nt' : 'nr';

        // Open NCBI BLAST in browser (API BLAST is too slow for interactive use)
        const blastUrl = `https://blast.ncbi.nlm.nih.gov/Blast.cgi?PROGRAM=${program}&DATABASE=${database}&QUERY=${encodeURIComponent(sequence.substring(0, 8000))}`;

        const action = await vscode.window.showInformationMessage(
            `🔬 BLAST: ${sequence.length} ${isDNA ? 'nt' : 'aa'} con ${program} vs ${database}`,
            'Abrir en Navegador',
            'Copiar URL'
        );

        if (action === 'Abrir en Navegador') {
            vscode.env.openExternal(vscode.Uri.parse(blastUrl));
        } else if (action === 'Copiar URL') {
            await vscode.env.clipboard.writeText(blastUrl);
            vscode.window.showInformationMessage('URL de BLAST copiada');
        }
    }

    dispose(): void {
        this.outputChannel.dispose();
        this.disposables.forEach(d => d.dispose());
    }
}
