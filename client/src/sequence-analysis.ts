// ============================================================================
// Sequence Analysis Panel — GC%, ORF Finder, Repeat Finder, Codon Usage,
// Composition, Restriction Sites, Melting Temperature, Complexity Score
// Análisis bioinformático completo en tiempo real
// ============================================================================
import * as vscode from 'vscode';

// ──────────────────────────────────────────────────────────────────────────────
// Core Analysis Functions
// ──────────────────────────────────────────────────────────────────────────────
interface SequenceStats {
    length: number;
    gcContent: number;
    atContent: number;
    composition: { A: number; T: number; G: number; C: number; N: number };
    compositionPercent: { A: number; T: number; G: number; C: number; N: number };
    molecularWeight: number; // Da (double-stranded)
    meltingTm: number;      // °C basic formula
    orfs: ORF[];
    repeats: Repeat[];
    restrictionSites: RestrictionHit[];
    codonUsage: CodonUsageStats;
    dinucleotideFreq: Record<string, number>;
    complexityScore: number; // linguistic complexity
    cpgIslands: CpGIsland[];
}

interface ORF {
    start: number;
    end: number;
    length: number; // codons
    strand: '+' | '-';
    startCodon: string;
    protein: string; // first 30 aa
    frame: number; // 0, 1, 2
}

interface Repeat {
    sequence: string;
    positions: number[];
    count: number;
    type: 'direct' | 'inverted' | 'tandem';
}

interface RestrictionHit {
    enzyme: string;
    site: string;
    positions: number[];
    cutPattern: string;
}

interface CodonUsageStats {
    totalCodons: number;
    table: Record<string, { count: number; aa: string; freq: number }>;
    rareCodonCount: number;
    cai: number; // Codon Adaptation Index
}

interface CpGIsland {
    start: number;
    end: number;
    gcPercent: number;
    obsExpCpG: number;
}

// Codon table (standard genetic code)
const CODON_TABLE: Record<string, string> = {
    TTT:'F',TTC:'F',TTA:'L',TTG:'L',CTT:'L',CTC:'L',CTA:'L',CTG:'L',
    ATT:'I',ATC:'I',ATA:'I',ATG:'M',GTT:'V',GTC:'V',GTA:'V',GTG:'V',
    TCT:'S',TCC:'S',TCA:'S',TCG:'S',CCT:'P',CCC:'P',CCA:'P',CCG:'P',
    ACT:'T',ACC:'T',ACA:'T',ACG:'T',GCT:'A',GCC:'A',GCA:'A',GCG:'A',
    TAT:'Y',TAC:'Y',TAA:'*',TAG:'*',CAT:'H',CAC:'H',CAA:'Q',CAG:'Q',
    AAT:'N',AAC:'N',AAA:'K',AAG:'K',GAT:'D',GAC:'D',GAA:'E',GAG:'E',
    TGT:'C',TGC:'C',TGA:'*',TGG:'W',CGT:'R',CGC:'R',CGA:'R',CGG:'R',
    AGT:'S',AGC:'S',AGA:'R',AGG:'R',GGT:'G',GGC:'G',GGA:'G',GGG:'G'
};

// Common restriction enzymes for quick analysis
const RESTRICTION_ENZYMES: Array<{ name: string; site: string; cut: string }> = [
    { name: 'EcoRI', site: 'GAATTC', cut: 'G^AATTC' },
    { name: 'BamHI', site: 'GGATCC', cut: 'G^GATCC' },
    { name: 'HindIII', site: 'AAGCTT', cut: 'A^AGCTT' },
    { name: 'XbaI', site: 'TCTAGA', cut: 'T^CTAGA' },
    { name: 'SpeI', site: 'ACTAGT', cut: 'A^CTAGT' },
    { name: 'PstI', site: 'CTGCAG', cut: 'CTGCA^G' },
    { name: 'NotI', site: 'GCGGCCGC', cut: 'GC^GGCCGC' },
    { name: 'SalI', site: 'GTCGAC', cut: 'G^TCGAC' },
    { name: 'NcoI', site: 'CCATGG', cut: 'C^CATGG' },
    { name: 'NdeI', site: 'CATATG', cut: 'CA^TATG' },
    { name: 'XhoI', site: 'CTCGAG', cut: 'C^TCGAG' },
    { name: 'BglII', site: 'AGATCT', cut: 'A^GATCT' },
    { name: 'KpnI', site: 'GGTACC', cut: 'GGTAC^C' },
    { name: 'SacI', site: 'GAGCTC', cut: 'GAGCT^C' },
    { name: 'ApaI', site: 'GGGCCC', cut: 'GGGCC^C' },
    { name: 'ClaI', site: 'ATCGAT', cut: 'AT^CGAT' },
    { name: 'EcoRV', site: 'GATATC', cut: 'GAT^ATC' },
    { name: 'SmaI', site: 'CCCGGG', cut: 'CCC^GGG' },
    { name: 'BsaI', site: 'GGTCTC', cut: 'GGTCTC(1)^' },
    { name: 'BbsI', site: 'GAAGAC', cut: 'GAAGAC(2)^' },
    { name: 'SapI', site: 'GCTCTTC', cut: 'GCTCTTC(1)^' },
    { name: 'DpnI', site: 'GATC', cut: 'GA^TC' },
    { name: 'MboI', site: 'GATC', cut: '^GATC' },
    { name: 'AvrII', site: 'CCTAGG', cut: 'C^CTAGG' },
];

function reverseComplement(seq: string): string {
    const comp: Record<string, string> = { A: 'T', T: 'A', G: 'C', C: 'G', N: 'N' };
    return seq.split('').reverse().map(c => comp[c] || 'N').join('');
}

function analyzeSequence(rawSeq: string): SequenceStats {
    const seq = rawSeq.toUpperCase().replace(/[^ACGTN]/g, '');
    const len = seq.length;

    // Composition
    const composition = { A: 0, T: 0, G: 0, C: 0, N: 0 };
    for (const c of seq) { composition[c as keyof typeof composition]++; }
    const compositionPercent = {
        A: len > 0 ? (composition.A / len) * 100 : 0,
        T: len > 0 ? (composition.T / len) * 100 : 0,
        G: len > 0 ? (composition.G / len) * 100 : 0,
        C: len > 0 ? (composition.C / len) * 100 : 0,
        N: len > 0 ? (composition.N / len) * 100 : 0,
    };

    const gcContent = len > 0 ? ((composition.G + composition.C) / len) * 100 : 0;
    const atContent = 100 - gcContent;

    // Molecular weight (average for dsDNA): ~ 649 Da/bp
    const molecularWeight = len * 649;

    // Melting temperature (basic formula: Wallace Rule for < 14bp, Marmur-Doty for longer)
    let meltingTm: number;
    if (len < 14) {
        meltingTm = 2 * (composition.A + composition.T) + 4 * (composition.G + composition.C);
    } else {
        meltingTm = 64.9 + 41 * ((composition.G + composition.C - 16.4) / len);
    }

    // ORF finding (all 6 reading frames)
    const orfs = findORFs(seq);

    // Repeat finding
    const repeats = findRepeats(seq);

    // Restriction sites
    const restrictionSites = findRestrictionSites(seq);

    // Codon usage (first ORF or full sequence in frame 0)
    const codonUsage = analyzeCodonUsage(seq);

    // Dinucleotide frequency
    const dinucleotideFreq: Record<string, number> = {};
    const dnts = ['AA','AT','AG','AC','TA','TT','TG','TC','GA','GT','GG','GC','CA','CT','CG','CC'];
    for (const d of dnts) { dinucleotideFreq[d] = 0; }
    for (let i = 0; i < len - 1; i++) {
        const dn = seq.substring(i, i + 2);
        if (dinucleotideFreq[dn] !== undefined) { dinucleotideFreq[dn]++; }
    }
    // Normalize
    const totalDn = len > 1 ? len - 1 : 1;
    for (const d of dnts) { dinucleotideFreq[d] = dinucleotideFreq[d] / totalDn; }

    // Linguistic complexity
    const complexityScore = computeLinguisticComplexity(seq);

    // CpG islands
    const cpgIslands = findCpGIslands(seq);

    return {
        length: len, gcContent, atContent, composition, compositionPercent,
        molecularWeight, meltingTm, orfs, repeats, restrictionSites,
        codonUsage, dinucleotideFreq, complexityScore, cpgIslands
    };
}

function findORFs(seq: string): ORF[] {
    const orfs: ORF[] = [];
    const startCodons = ['ATG', 'GTG', 'TTG'];
    const stopCodons = ['TAA', 'TAG', 'TGA'];
    const minCodons = 30; // minimum 30 codons (90 bp)

    // Forward frames
    for (let frame = 0; frame < 3; frame++) {
        let inORF = false;
        let orfStart = 0;
        let protein = '';

        for (let i = frame; i <= seq.length - 3; i += 3) {
            const codon = seq.substring(i, i + 3);
            if (!inORF && startCodons.includes(codon)) {
                inORF = true;
                orfStart = i;
                protein = '';
            }
            if (inORF) {
                const aa = CODON_TABLE[codon] || '?';
                if (aa === '*') {
                    const codons = (i - orfStart) / 3;
                    if (codons >= minCodons) {
                        orfs.push({
                            start: orfStart, end: i + 3, length: codons,
                            strand: '+', startCodon: seq.substring(orfStart, orfStart + 3),
                            protein: protein.substring(0, 30), frame
                        });
                    }
                    inORF = false;
                } else {
                    protein += aa;
                }
            }
        }
    }

    // Reverse complement
    const rc = reverseComplement(seq);
    for (let frame = 0; frame < 3; frame++) {
        let inORF = false;
        let orfStart = 0;
        let protein = '';

        for (let i = frame; i <= rc.length - 3; i += 3) {
            const codon = rc.substring(i, i + 3);
            if (!inORF && startCodons.includes(codon)) {
                inORF = true;
                orfStart = i;
                protein = '';
            }
            if (inORF) {
                const aa = CODON_TABLE[codon] || '?';
                if (aa === '*') {
                    const codons = (i - orfStart) / 3;
                    if (codons >= minCodons) {
                        orfs.push({
                            start: seq.length - i - 3, end: seq.length - orfStart,
                            length: codons, strand: '-',
                            startCodon: rc.substring(orfStart, orfStart + 3),
                            protein: protein.substring(0, 30), frame: frame + 3
                        });
                    }
                    inORF = false;
                } else {
                    protein += aa;
                }
            }
        }
    }

    orfs.sort((a, b) => b.length - a.length);
    return orfs.slice(0, 20); // top 20
}

function findRepeats(seq: string): Repeat[] {
    const repeats: Repeat[] = [];

    // Direct repeats (window 8-30)
    for (let winSize = 8; winSize <= Math.min(30, seq.length / 2); winSize += 2) {
        const seen = new Map<string, number[]>();
        for (let i = 0; i <= seq.length - winSize; i++) {
            const sub = seq.substring(i, i + winSize);
            if (!seen.has(sub)) { seen.set(sub, []); }
            seen.get(sub)!.push(i);
        }
        for (const [subseq, positions] of seen) {
            if (positions.length >= 2) {
                repeats.push({ sequence: subseq, positions, count: positions.length, type: 'direct' });
            }
        }
    }

    // Inverted repeats
    for (let winSize = 8; winSize <= Math.min(20, seq.length / 2); winSize += 2) {
        for (let i = 0; i <= seq.length - winSize * 2 - 3; i++) {
            const sub = seq.substring(i, i + winSize);
            const rc = reverseComplement(sub);
            const downstream = seq.substring(i + winSize + 3, i + winSize * 3);
            const pos = downstream.indexOf(rc);
            if (pos >= 0) {
                repeats.push({
                    sequence: sub + '...' + rc,
                    positions: [i, i + winSize + 3 + pos],
                    count: 2,
                    type: 'inverted'
                });
            }
        }
    }

    // Tandem repeats
    for (let unitSize = 2; unitSize <= 6; unitSize++) {
        for (let i = 0; i <= seq.length - unitSize * 3; i++) {
            const unit = seq.substring(i, i + unitSize);
            let copies = 1;
            let j = i + unitSize;
            while (j + unitSize <= seq.length && seq.substring(j, j + unitSize) === unit) {
                copies++;
                j += unitSize;
            }
            if (copies >= 3) {
                repeats.push({
                    sequence: `(${unit})${copies}`,
                    positions: [i],
                    count: copies,
                    type: 'tandem'
                });
                // Skip past this repeat
            }
        }
    }

    // Deduplicate and limit
    const unique = new Map<string, Repeat>();
    for (const r of repeats) {
        const key = r.sequence + r.positions[0];
        if (!unique.has(key)) { unique.set(key, r); }
    }
    return Array.from(unique.values()).slice(0, 25);
}

function findRestrictionSites(seq: string): RestrictionHit[] {
    const hits: RestrictionHit[] = [];
    for (const enzyme of RESTRICTION_ENZYMES) {
        const positions: number[] = [];
        let idx = seq.indexOf(enzyme.site);
        while (idx !== -1) {
            positions.push(idx);
            idx = seq.indexOf(enzyme.site, idx + 1);
        }
        // Also check reverse complement
        const rc = reverseComplement(enzyme.site);
        if (rc !== enzyme.site) {
            idx = seq.indexOf(rc);
            while (idx !== -1) {
                positions.push(idx);
                idx = seq.indexOf(rc, idx + 1);
            }
        }
        if (positions.length > 0) {
            hits.push({
                enzyme: enzyme.name,
                site: enzyme.site,
                positions: [...new Set(positions)].sort((a, b) => a - b),
                cutPattern: enzyme.cut
            });
        }
    }
    hits.sort((a, b) => a.enzyme.localeCompare(b.enzyme));
    return hits;
}

function analyzeCodonUsage(seq: string): CodonUsageStats {
    const table: Record<string, { count: number; aa: string; freq: number }> = {};
    for (const [codon, aa] of Object.entries(CODON_TABLE)) {
        table[codon] = { count: 0, aa, freq: 0 };
    }

    let totalCodons = 0;
    for (let i = 0; i <= seq.length - 3; i += 3) {
        const codon = seq.substring(i, i + 3);
        if (table[codon]) {
            table[codon].count++;
            totalCodons++;
        }
    }

    // Calculate frequencies within synonymous groups
    const aaGroups = new Map<string, string[]>();
    for (const [codon, aa] of Object.entries(CODON_TABLE)) {
        if (!aaGroups.has(aa)) { aaGroups.set(aa, []); }
        aaGroups.get(aa)!.push(codon);
    }

    for (const [aa, codons] of aaGroups) {
        const total = codons.reduce((s, c) => s + table[c].count, 0);
        for (const c of codons) {
            table[c].freq = total > 0 ? table[c].count / total : 0;
        }
    }

    // E. coli rare codons (< 5% usage in K-12)
    const rareCodons = ['AGG', 'AGA', 'ATA', 'CTA', 'CGA', 'CGG', 'CCC', 'TCG'];
    let rareCodonCount = 0;
    for (const rc of rareCodons) {
        rareCodonCount += table[rc]?.count || 0;
    }

    // Simple CAI approximation
    const cai = totalCodons > 0 ? Math.min(1, 1 - (rareCodonCount / totalCodons) * 2) : 0;

    return { totalCodons, table, rareCodonCount, cai };
}

function computeLinguisticComplexity(seq: string): number {
    // Linguistic complexity: ratio of observed to possible subsequences
    if (seq.length < 10) { return 0; }
    const observed = new Set<string>();
    const maxWords = Math.min(seq.length, 10);

    for (let wordLen = 1; wordLen <= maxWords; wordLen++) {
        for (let i = 0; i <= seq.length - wordLen; i++) {
            observed.add(seq.substring(i, i + wordLen));
        }
    }

    // Maximum possible: sum of min(4^k, n-k+1) for k=1..maxWords
    let maxPossible = 0;
    for (let k = 1; k <= maxWords; k++) {
        maxPossible += Math.min(Math.pow(4, k), seq.length - k + 1);
    }

    return maxPossible > 0 ? observed.size / maxPossible : 0;
}

function findCpGIslands(seq: string): CpGIsland[] {
    const islands: CpGIsland[] = [];
    const windowSize = 200;
    const step = 50;

    for (let i = 0; i <= seq.length - windowSize; i += step) {
        const window = seq.substring(i, i + windowSize);
        let gc = 0, cpg = 0;
        for (let j = 0; j < windowSize; j++) {
            if (window[j] === 'G' || window[j] === 'C') { gc++; }
            if (j < windowSize - 1 && window[j] === 'C' && window[j + 1] === 'G') { cpg++; }
        }
        const gcPercent = (gc / windowSize) * 100;
        const expectedCpG = ((gc / 2) * (gc / 2)) / windowSize;
        const obsExpCpG = expectedCpG > 0 ? cpg / expectedCpG : 0;

        // Gardiner-Garden & Frommer 1987 criteria
        if (gcPercent >= 50 && obsExpCpG >= 0.6) {
            islands.push({ start: i, end: i + windowSize, gcPercent, obsExpCpG });
        }
    }

    return islands;
}

// ──────────────────────────────────────────────────────────────────────────────
// WebView Panel
// ──────────────────────────────────────────────────────────────────────────────
export class SequenceAnalysisPanel {
    private panel: vscode.WebviewPanel | undefined;

    constructor(private context: vscode.ExtensionContext) {}

    show(): void {
        if (this.panel) { this.panel.reveal(); return; }

        this.panel = vscode.window.createWebviewPanel(
            'synbioSequenceAnalysis',
            '🧬 Sequence Analysis',
            vscode.ViewColumn.Two,
            { enableScripts: true, retainContextWhenHidden: true }
        );

        this.panel.webview.html = this.getWebviewContent();

        this.panel.webview.onDidReceiveMessage(msg => {
            switch (msg.type) {
                case 'analyzeFromEditor':
                    this.analyzeFromEditor();
                    break;
                case 'analyzeText':
                    this.analyze(msg.sequence);
                    break;
            }
        });

        this.panel.onDidDispose(() => { this.panel = undefined; });
    }

    private analyzeFromEditor(): void {
        const editor = vscode.window.activeTextEditor;
        if (!editor) { return; }
        const text = editor.document.getText();
        // Extract DNA sequences
        const seqs: string[] = [];
        const patterns = [/sequence\s*[:=]\s*"?([ACGTacgt\s]+)"?/g, /([ACGTacgt]{20,})/g];
        for (const p of patterns) {
            let m;
            while ((m = p.exec(text)) !== null) {
                seqs.push(m[1].replace(/\s/g, ''));
            }
        }
        if (seqs.length > 0) {
            this.analyze(seqs.join(''));
        } else {
            // Try entire file as sequence
            const cleaned = text.replace(/[^ACGTacgt]/g, '');
            if (cleaned.length >= 20) { this.analyze(cleaned); }
            else { vscode.window.showWarningMessage('No se encontró secuencia de ADN en el archivo activo.'); }
        }
    }

    private analyze(sequence: string): void {
        const stats = analyzeSequence(sequence);
        this.panel?.webview.postMessage({ type: 'analysisResult', stats, sequence: sequence.substring(0, 500) });
    }

    private getWebviewContent(): string {
        return `<!DOCTYPE html>
<html lang="es"><head>
<meta charset="UTF-8">
<style>
:root { --bg: #1e1e2e; --surface: #181825; --text: #cdd6f4; --accent: #89b4fa; --border: #313244; --green: #a6e3a1; --red: #f38ba8; --yellow: #f9e2af; }
* { margin:0; padding:0; box-sizing:border-box; }
body { font-family: 'Segoe UI', sans-serif; background: var(--bg); color: var(--text); padding: 16px; overflow: auto; }
h1 { font-size: 18px; color: var(--accent); margin-bottom: 4px; }
.subtitle { font-size: 12px; color: #a6adc8; margin-bottom: 12px; }
button { background: var(--surface); color: var(--text); border: 1px solid var(--border); padding: 8px 16px; border-radius: 6px; cursor: pointer; margin: 4px; font-size: 13px; }
button:hover { border-color: var(--accent); }
button.primary { background: var(--accent); color: var(--bg); font-weight: 600; }
textarea { width: 100%; height: 80px; background: var(--surface); color: var(--text); border: 1px solid var(--border); border-radius: 6px; padding: 8px; font-family: 'Cascadia Code', monospace; font-size: 12px; resize: vertical; }
.btn-row { display: flex; gap: 8px; margin: 8px 0; flex-wrap: wrap; }
.stats-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(120px, 1fr)); gap: 8px; margin: 12px 0; }
.stat-card { background: var(--surface); padding: 12px; border-radius: 8px; text-align: center; border: 1px solid var(--border); }
.stat-card .val { font-size: 22px; font-weight: bold; color: var(--accent); }
.stat-card .lbl { font-size: 10px; color: #a6adc8; margin-top: 2px; }
.section { background: var(--surface); padding: 14px; border-radius: 8px; margin: 10px 0; border-left: 4px solid var(--accent); }
.section h3 { font-size: 14px; margin-bottom: 8px; color: var(--accent); }
table { width: 100%; border-collapse: collapse; font-size: 11px; }
th { background: var(--bg); padding: 6px; text-align: left; border-bottom: 1px solid var(--border); position: sticky; top: 0; }
td { padding: 4px 6px; border-bottom: 1px solid var(--border); }
tr:hover { background: rgba(137,180,250,0.05); }
.bar { height: 16px; border-radius: 3px; display: inline-block; min-width: 2px; }
.bar-a { background: #a6e3a1; } .bar-t { background: #f38ba8; } .bar-g { background: #f9e2af; } .bar-c { background: #89b4fa; }
.comp-bar { display: flex; height: 24px; border-radius: 6px; overflow: hidden; margin: 8px 0; }
.tabs { display: flex; border-bottom: 2px solid var(--border); margin-bottom: 12px; }
.tab { padding: 8px 16px; cursor: pointer; font-size: 12px; border-bottom: 2px solid transparent; margin-bottom: -2px; }
.tab.active { color: var(--accent); border-bottom-color: var(--accent); font-weight: 600; }
.tab-content { display: none; }
.tab-content.active { display: block; }
.mono { font-family: 'Cascadia Code', monospace; font-size: 11px; }
.result-container { max-height: calc(100vh - 200px); overflow-y: auto; }
.gc-indicator { width: 60px; height: 60px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 16px; font-weight: bold; margin: 0 auto; }
</style></head><body>
<h1>🧬 Sequence Analysis Panel</h1>
<p class="subtitle">GC% · ORF Finder · Repeats · Restriction Sites · Codon Usage · CpG Islands · Linguistic Complexity</p>

<textarea id="seqInput" placeholder="Pegar secuencia de ADN (5'→3')..."></textarea>
<div class="btn-row">
    <button class="primary" onclick="analyzeText()">🔬 Analizar</button>
    <button onclick="analyzeFromEditor()">📄 Desde Editor</button>
    <button onclick="loadExample()">📋 Ejemplo lacZ</button>
</div>

<div class="result-container" id="resultContainer"></div>

<script>
const vscode = acquireVsCodeApi();

function analyzeText() {
    const seq = document.getElementById('seqInput').value.replace(/[^ACGTacgt]/g, '');
    if (seq.length < 10) { document.getElementById('resultContainer').innerHTML = '<p style="color:var(--red)">Secuencia muy corta</p>'; return; }
    vscode.postMessage({ type: 'analyzeText', sequence: seq });
}
function analyzeFromEditor() { vscode.postMessage({ type: 'analyzeFromEditor' }); }
function loadExample() {
    document.getElementById('seqInput').value = 'ATGACCATGATTACGCCAAGCTTTCCCTGTAGCAGCATGACTGTTACTCAAGTCACTGACTACCGGGTTCAACCGTTCAGCGGATGATTTACGGTTCAATCAGCAAATATCAGCGATCTCAGCAGCAGCCAACAGGTTGATGATTATGCCAGCAGCTTCCAGACGTTCACCGCATGGTTCGATTTCGCTAACCTCACCAATTCCACTAACCTGCCTCCCTGCTTCTGATTGAAATCAGCAATCAGCTGCTTTAGCGTTAACGATCCGGCGAACTTGCGCTAACACTCACTCCTCTCAATGATGATGAATGGCAGCCAATCCTCCTGCGGCGATCGGCTTGTTCGAG';
}

function switchTab(tabId) {
    document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.tab === tabId));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.toggle('active', c.id === tabId));
}

window.addEventListener('message', (event) => {
    const msg = event.data;
    if (msg.type === 'analysisResult') renderResult(msg.stats, msg.sequence);
});

function renderResult(s, seq) {
    const gcColor = s.gcContent >= 40 && s.gcContent <= 65 ? 'var(--green)' : s.gcContent < 30 || s.gcContent > 75 ? 'var(--red)' : 'var(--yellow)';

    let html = '<div class="stats-grid">';
    html += statCard(s.length + ' bp', 'Longitud');
    html += statCard(s.gcContent.toFixed(1) + '%', 'GC Content', gcColor);
    html += statCard(s.meltingTm.toFixed(1) + '°C', 'Tm (básico)');
    html += statCard((s.molecularWeight/1000).toFixed(1) + ' kDa', 'MW (dsDNA)');
    html += statCard(s.orfs.length, 'ORFs (≥30 cod)');
    html += statCard(s.restrictionSites.length, 'Enzimas detectadas');
    html += statCard(s.codonUsage.cai.toFixed(2), 'CAI');
    html += statCard(s.complexityScore.toFixed(2), 'Complejidad');
    html += '</div>';

    // Composition bar
    html += '<div class="section"><h3>Composición de Nucleótidos</h3>';
    html += '<div class="comp-bar">';
    html += '<div style="width:' + s.compositionPercent.A.toFixed(1) + '%;background:#a6e3a1" title="A: ' + s.compositionPercent.A.toFixed(1) + '%"></div>';
    html += '<div style="width:' + s.compositionPercent.T.toFixed(1) + '%;background:#f38ba8" title="T: ' + s.compositionPercent.T.toFixed(1) + '%"></div>';
    html += '<div style="width:' + s.compositionPercent.G.toFixed(1) + '%;background:#f9e2af" title="G: ' + s.compositionPercent.G.toFixed(1) + '%"></div>';
    html += '<div style="width:' + s.compositionPercent.C.toFixed(1) + '%;background:#89b4fa" title="C: ' + s.compositionPercent.C.toFixed(1) + '%"></div>';
    html += '</div>';
    html += '<div style="display:flex;justify-content:space-between;font-size:11px">';
    html += '<span style="color:#a6e3a1">A: ' + s.composition.A + ' (' + s.compositionPercent.A.toFixed(1) + '%)</span>';
    html += '<span style="color:#f38ba8">T: ' + s.composition.T + ' (' + s.compositionPercent.T.toFixed(1) + '%)</span>';
    html += '<span style="color:#f9e2af">G: ' + s.composition.G + ' (' + s.compositionPercent.G.toFixed(1) + '%)</span>';
    html += '<span style="color:#89b4fa">C: ' + s.composition.C + ' (' + s.compositionPercent.C.toFixed(1) + '%)</span>';
    html += '</div></div>';

    // Tabs
    html += '<div class="tabs">';
    html += '<div class="tab active" data-tab="tabOrfs" onclick="switchTab(\\'tabOrfs\\')">ORFs (' + s.orfs.length + ')</div>';
    html += '<div class="tab" data-tab="tabRestriction" onclick="switchTab(\\'tabRestriction\\')">Restricción (' + s.restrictionSites.length + ')</div>';
    html += '<div class="tab" data-tab="tabRepeats" onclick="switchTab(\\'tabRepeats\\')">Repeats (' + s.repeats.length + ')</div>';
    html += '<div class="tab" data-tab="tabCodons" onclick="switchTab(\\'tabCodons\\')">Codones</div>';
    html += '<div class="tab" data-tab="tabCpg" onclick="switchTab(\\'tabCpg\\')">CpG (' + s.cpgIslands.length + ')</div>';
    html += '</div>';

    // ORFs tab
    html += '<div class="tab-content active" id="tabOrfs">';
    if (s.orfs.length > 0) {
        html += '<table><thead><tr><th>#</th><th>Start</th><th>End</th><th>Codons</th><th>Strand</th><th>Frame</th><th>Start Codon</th><th>Protein (first 30 aa)</th></tr></thead><tbody>';
        s.orfs.forEach((o, i) => {
            html += '<tr><td>' + (i+1) + '</td><td>' + o.start + '</td><td>' + o.end + '</td><td>' + o.length + '</td><td>' + o.strand + '</td><td>' + o.frame + '</td><td class="mono">' + o.startCodon + '</td><td class="mono" style="font-size:10px;max-width:200px;overflow:hidden">' + o.protein + '</td></tr>';
        });
        html += '</tbody></table>';
    } else {
        html += '<p style="color:#6c7086">No se encontraron ORFs ≥ 30 codones</p>';
    }
    html += '</div>';

    // Restriction tab
    html += '<div class="tab-content" id="tabRestriction">';
    if (s.restrictionSites.length > 0) {
        html += '<table><thead><tr><th>Enzima</th><th>Sitio</th><th>Corte</th><th>Hits</th><th>Posiciones</th></tr></thead><tbody>';
        s.restrictionSites.forEach(r => {
            html += '<tr><td><strong>' + r.enzyme + '</strong></td><td class="mono">' + r.site + '</td><td class="mono">' + r.cutPattern + '</td><td>' + r.positions.length + '</td><td class="mono">' + r.positions.slice(0, 8).join(', ') + (r.positions.length > 8 ? '...' : '') + '</td></tr>';
        });
        html += '</tbody></table>';
    }
    html += '</div>';

    // Repeats tab
    html += '<div class="tab-content" id="tabRepeats">';
    if (s.repeats.length > 0) {
        html += '<table><thead><tr><th>Tipo</th><th>Secuencia</th><th>Count</th><th>Posiciones</th></tr></thead><tbody>';
        s.repeats.slice(0, 20).forEach(r => {
            const typeColor = r.type === 'inverted' ? 'var(--red)' : r.type === 'tandem' ? 'var(--yellow)' : 'var(--green)';
            html += '<tr><td style="color:' + typeColor + '">' + r.type + '</td><td class="mono" style="max-width:200px;overflow:hidden">' + r.sequence + '</td><td>' + r.count + '</td><td class="mono">' + r.positions.slice(0, 5).join(', ') + '</td></tr>';
        });
        html += '</tbody></table>';
    }
    html += '</div>';

    // Codon usage tab
    html += '<div class="tab-content" id="tabCodons">';
    html += '<div style="display:flex;gap:16px;margin-bottom:8px;font-size:12px"><span>Total codones: ' + s.codonUsage.totalCodons + '</span><span>Codones raros (E. coli): ' + s.codonUsage.rareCodonCount + '</span><span>CAI: ' + s.codonUsage.cai.toFixed(3) + '</span></div>';
    const aas = ['F','L','I','M','V','S','P','T','A','Y','*','H','Q','N','K','D','E','C','W','R','G'];
    html += '<table><thead><tr><th>AA</th><th>Codon</th><th>Count</th><th>Freq</th><th></th></tr></thead><tbody>';
    for (const [codon, data] of Object.entries(s.codonUsage.table)) {
        if (data.count > 0) {
            const barW = Math.round(data.freq * 100);
            html += '<tr><td>' + data.aa + '</td><td class="mono">' + codon + '</td><td>' + data.count + '</td><td>' + (data.freq * 100).toFixed(1) + '%</td><td><div class="bar bar-c" style="width:' + barW + 'px"></div></td></tr>';
        }
    }
    html += '</tbody></table></div>';

    // CpG tab
    html += '<div class="tab-content" id="tabCpg">';
    if (s.cpgIslands.length > 0) {
        html += '<table><thead><tr><th>Start</th><th>End</th><th>GC%</th><th>Obs/Exp CpG</th></tr></thead><tbody>';
        s.cpgIslands.forEach(c => {
            html += '<tr><td>' + c.start + '</td><td>' + c.end + '</td><td>' + c.gcPercent.toFixed(1) + '%</td><td>' + c.obsExpCpG.toFixed(2) + '</td></tr>';
        });
        html += '</tbody></table>';
    } else {
        html += '<p style="color:#6c7086">No se encontraron CpG islands (Gardiner-Garden & Frommer 1987: GC≥50%, Obs/Exp≥0.6)</p>';
    }
    html += '</div>';

    document.getElementById('resultContainer').innerHTML = html;
}

function statCard(val, lbl, color) {
    return '<div class="stat-card"><div class="val" style="color:' + (color || 'var(--accent)') + '">' + val + '</div><div class="lbl">' + lbl + '</div></div>';
}
</script></body></html>`;
    }
}
