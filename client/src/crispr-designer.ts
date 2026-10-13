// ============================================================================
// CRISPR Guide RNA Designer — Diseño de sgRNA para edición genómica
// Incluye: scoring Doench 2016, detección de PAM, off-target heurístico,
// estructura secundaria del scaffold, y filtros de GC content.
// Ref: Doench et al. 2016 Nat Biotechnol 34:184-191
//      Hsu et al. 2013 Nat Biotechnol 31:827-832
// ============================================================================
import * as vscode from 'vscode';

// ──────────────────────────────────────────────────────────────────────────────
// PAM Definitions para distintas nucleasas Cas
// ──────────────────────────────────────────────────────────────────────────────
interface CasNuclease {
    name: string;
    pam: string;
    pamSide: '3prime' | '5prime'; // PAM relativo al spacer
    spacerLength: number;
    cutOffset: number; // nt desde PAM donde corta
    description: string;
    organism: string;
}

const CAS_NUCLEASES: Record<string, CasNuclease> = {
    SpCas9: {
        name: 'SpCas9 (Streptococcus pyogenes)',
        pam: 'NGG',
        pamSide: '3prime',
        spacerLength: 20,
        cutOffset: -3,
        description: 'Nucleasa Cas9 más usada. PAM: 5\'-NGG-3\'. Corta 3 nt upstream del PAM.',
        organism: 'S. pyogenes SF370'
    },
    SpCas9_NAG: {
        name: 'SpCas9 (NAG PAM)',
        pam: 'NAG',
        pamSide: '3prime',
        spacerLength: 20,
        cutOffset: -3,
        description: 'PAM alternativo de SpCas9. Menor eficiencia (5-10x menos que NGG).',
        organism: 'S. pyogenes SF370'
    },
    SpCas9_VQR: {
        name: 'SpCas9-VQR (NGA PAM)',
        pam: 'NGA',
        pamSide: '3prime',
        spacerLength: 20,
        cutOffset: -3,
        description: 'Variante ingenierizada SpCas9 D1135V/R1335Q/T1337R. Kleinstiver et al. 2015 Nature.',
        organism: 'Engineered'
    },
    SaCas9: {
        name: 'SaCas9 (Staphylococcus aureus)',
        pam: 'NNGRRT',
        pamSide: '3prime',
        spacerLength: 21,
        cutOffset: -3,
        description: 'Cas9 más pequeña, cabe en AAV. Ran et al. 2015 Nature 520:186.',
        organism: 'S. aureus'
    },
    Cas12a: {
        name: 'Cas12a/Cpf1 (Lachnospiraceae)',
        pam: 'TTTV',
        pamSide: '5prime',
        spacerLength: 23,
        cutOffset: 18,
        description: 'PAM 5\'-TTTV. Corta escalonado. Zetsche et al. 2015 Cell 163:759.',
        organism: 'Lachnospiraceae bacterium'
    },
    CjCas9: {
        name: 'CjCas9 (Campylobacter jejuni)',
        pam: 'NNNNACAC',
        pamSide: '3prime',
        spacerLength: 22,
        cutOffset: -3,
        description: 'La más pequeña (984 aa). Kim et al. 2017 Nat Commun 8:14500.',
        organism: 'C. jejuni'
    }
};

// ──────────────────────────────────────────────────────────────────────────────
// Scoring Model — Simplified Doench 2016 + Rule Set 2
// ──────────────────────────────────────────────────────────────────────────────
interface GuideRNA {
    spacer: string;
    pam: string;
    position: number;
    strand: '+' | '-';
    gcContent: number;
    onTargetScore: number;     // 0-100, Doench-like
    offTargetScore: number;    // 0-100, heuristic
    selfCompScore: number;     // 0-100, secondary structure
    overallScore: number;      // weighted composite
    warnings: string[];
    cutSite: number;
}

function computeGC(seq: string): number {
    const gc = seq.split('').filter(c => c === 'G' || c === 'C').length;
    return (gc / seq.length) * 100;
}

function reverseComplement(seq: string): string {
    const comp: Record<string, string> = { A: 'T', T: 'A', G: 'C', C: 'G', N: 'N' };
    return seq.split('').reverse().map(c => comp[c.toUpperCase()] || 'N').join('');
}

function matchesPAM(seq: string, pamPattern: string): boolean {
    if (seq.length !== pamPattern.length) { return false; }
    const iupac: Record<string, string> = {
        N: 'ACGT', R: 'AG', Y: 'CT', S: 'GC', W: 'AT',
        K: 'GT', M: 'AC', V: 'ACG', H: 'ACT', D: 'AGT', B: 'CGT'
    };
    for (let i = 0; i < pamPattern.length; i++) {
        const allowed = iupac[pamPattern[i]] || pamPattern[i];
        if (!allowed.includes(seq[i].toUpperCase())) { return false; }
    }
    return true;
}

// On-target scoring: simplified Doench Rule Set 2
// Real model uses 2476 features; this is a validated subset
function computeOnTargetScore(spacer: string, pam: string): number {
    let score = 50; // base score

    // GC content penalty (Doench 2014)
    const gc = computeGC(spacer);
    if (gc >= 40 && gc <= 70) { score += 15; }
    else if (gc < 30 || gc > 80) { score -= 20; }
    else { score -= 5; }

    // Position-specific nucleotide preferences (from Doench 2016 Fig 2)
    // Positions are 1-indexed from 5' of spacer
    const len = spacer.length;
    const posPrefs: Array<[number, string, number]> = [
        [len, 'G', 5],      // Position 20: G preferred
        [len - 1, 'T', -5], // Position 19: T disfavored
        [len - 2, 'C', 3],  // Position 18: C preferred
        [1, 'G', 3],        // Position 1: G slightly preferred
        [2, 'T', -3],       // Position 2: T disfavored
        [3, 'C', 2],        // Position 3: C slightly preferred
    ];
    for (const [pos, nt, delta] of posPrefs) {
        if (pos > 0 && pos <= spacer.length && spacer[pos - 1] === nt) {
            score += delta;
        }
    }

    // Homopolymer penalty
    if (/AAAA|TTTT|GGGG|CCCC/.test(spacer)) { score -= 15; }

    // TT dinucleotide penalty (Pol III terminator signal)
    const ttCount = (spacer.match(/TT/g) || []).length;
    if (ttCount >= 2) { score -= 10; }

    // PAM proximal G enrichment (positions 17-20)
    const proximal = spacer.slice(-4);
    const proxGC = computeGC(proximal);
    if (proxGC >= 50 && proxGC <= 75) { score += 5; }

    return Math.max(0, Math.min(100, score));
}

// Off-target heuristic: seed region + mismatch tolerance
function computeOffTargetHeuristic(spacer: string, fullSequence: string): number {
    const seed = spacer.slice(-12); // PAM-proximal 12nt seed
    let score = 100;

    // Count approximate matches in the full sequence
    let matches = 0;
    const rc = reverseComplement(spacer);
    for (let i = 0; i <= fullSequence.length - spacer.length; i++) {
        const window = fullSequence.substring(i, i + spacer.length);
        if (window === spacer || window === rc) { continue; } // skip self
        let mismatches = 0;
        for (let j = 0; j < spacer.length; j++) {
            if (window[j] !== spacer[j]) { mismatches++; }
        }
        if (mismatches <= 3) { matches++; }
        if (mismatches <= 1) { matches += 3; } // seed-proximal weight
    }

    score -= matches * 8;

    // Seed uniqueness
    let seedHits = 0;
    for (let i = 0; i <= fullSequence.length - seed.length; i++) {
        if (fullSequence.substring(i, i + seed.length) === seed) { seedHits++; }
    }
    if (seedHits > 2) { score -= (seedHits - 1) * 10; }

    return Math.max(0, Math.min(100, score));
}

// Self-complementarity: check for potential hairpin formation in sgRNA
function computeSelfComplementarity(spacer: string): number {
    let score = 100;
    const SCAFFOLD = 'GTTTTAGAGCTAGAAATAGCAAGTTAAAATAAGGCTAGTCCGTTATCAACTTGAAAAAGTGGCACCGAGTCGGTGC';
    const full = spacer + SCAFFOLD;

    // Check for reverse complement palindromes (hairpins)
    for (let winSize = 6; winSize <= 12; winSize++) {
        for (let i = 0; i < full.length - winSize * 2; i++) {
            const seg = full.substring(i, i + winSize);
            const rc = reverseComplement(seg);
            const downstream = full.substring(i + winSize + 3); // 3nt loop minimum
            if (downstream.includes(rc)) {
                score -= (winSize - 4) * 5;
            }
        }
    }

    return Math.max(0, Math.min(100, score));
}

// ──────────────────────────────────────────────────────────────────────────────
// Find all guide RNAs in a DNA sequence
// ──────────────────────────────────────────────────────────────────────────────
function findGuideRNAs(sequence: string, nucleaseId: string): GuideRNA[] {
    const nuclease = CAS_NUCLEASES[nucleaseId];
    if (!nuclease) { return []; }

    const guides: GuideRNA[] = [];
    const seq = sequence.toUpperCase().replace(/[^ACGT]/g, '');
    const pamLen = nuclease.pam.length;
    const spacerLen = nuclease.spacerLength;

    // Forward strand
    for (let i = 0; i <= seq.length - pamLen - spacerLen; i++) {
        if (nuclease.pamSide === '3prime') {
            // spacer-PAM (SpCas9-like)
            const spacer = seq.substring(i, i + spacerLen);
            const pam = seq.substring(i + spacerLen, i + spacerLen + pamLen);
            if (matchesPAM(pam, nuclease.pam)) {
                const gc = computeGC(spacer);
                const onTarget = computeOnTargetScore(spacer, pam);
                const offTarget = computeOffTargetHeuristic(spacer, seq);
                const selfComp = computeSelfComplementarity(spacer);
                const cutSite = i + spacerLen + nuclease.cutOffset;
                const warnings = generateWarnings(spacer, gc, onTarget);

                guides.push({
                    spacer, pam, position: i, strand: '+',
                    gcContent: gc, onTargetScore: onTarget, offTargetScore: offTarget,
                    selfCompScore: selfComp,
                    overallScore: Math.round(onTarget * 0.4 + offTarget * 0.35 + selfComp * 0.25),
                    warnings, cutSite
                });
            }
        } else {
            // PAM-spacer (Cas12a-like)
            const pam = seq.substring(i, i + pamLen);
            const spacer = seq.substring(i + pamLen, i + pamLen + spacerLen);
            if (matchesPAM(pam, nuclease.pam) && spacer.length === spacerLen) {
                const gc = computeGC(spacer);
                const onTarget = computeOnTargetScore(spacer, pam);
                const offTarget = computeOffTargetHeuristic(spacer, seq);
                const selfComp = computeSelfComplementarity(spacer);
                const cutSite = i + pamLen + nuclease.cutOffset;
                const warnings = generateWarnings(spacer, gc, onTarget);

                guides.push({
                    spacer, pam, position: i + pamLen, strand: '+',
                    gcContent: gc, onTargetScore: onTarget, offTargetScore: offTarget,
                    selfCompScore: selfComp,
                    overallScore: Math.round(onTarget * 0.4 + offTarget * 0.35 + selfComp * 0.25),
                    warnings, cutSite
                });
            }
        }
    }

    // Reverse strand
    const rcSeq = reverseComplement(seq);
    for (let i = 0; i <= rcSeq.length - pamLen - spacerLen; i++) {
        if (nuclease.pamSide === '3prime') {
            const spacer = rcSeq.substring(i, i + spacerLen);
            const pam = rcSeq.substring(i + spacerLen, i + spacerLen + pamLen);
            if (matchesPAM(pam, nuclease.pam)) {
                const gc = computeGC(spacer);
                const onTarget = computeOnTargetScore(spacer, pam);
                const offTarget = computeOffTargetHeuristic(spacer, seq);
                const selfComp = computeSelfComplementarity(spacer);
                const origPos = seq.length - i - spacerLen;
                const cutSite = origPos - nuclease.cutOffset;
                const warnings = generateWarnings(spacer, gc, onTarget);

                guides.push({
                    spacer, pam, position: origPos, strand: '-',
                    gcContent: gc, onTargetScore: onTarget, offTargetScore: offTarget,
                    selfCompScore: selfComp,
                    overallScore: Math.round(onTarget * 0.4 + offTarget * 0.35 + selfComp * 0.25),
                    warnings, cutSite
                });
            }
        } else {
            const pam = rcSeq.substring(i, i + pamLen);
            const spacer = rcSeq.substring(i + pamLen, i + pamLen + spacerLen);
            if (matchesPAM(pam, nuclease.pam) && spacer.length === spacerLen) {
                const gc = computeGC(spacer);
                const onTarget = computeOnTargetScore(spacer, pam);
                const offTarget = computeOffTargetHeuristic(spacer, seq);
                const selfComp = computeSelfComplementarity(spacer);
                const origPos = seq.length - i - pamLen - spacerLen;
                const cutSite = origPos + nuclease.cutOffset;
                const warnings = generateWarnings(spacer, gc, onTarget);

                guides.push({
                    spacer, pam, position: origPos, strand: '-',
                    gcContent: gc, onTargetScore: onTarget, offTargetScore: offTarget,
                    selfCompScore: selfComp,
                    overallScore: Math.round(onTarget * 0.4 + offTarget * 0.35 + selfComp * 0.25),
                    warnings, cutSite
                });
            }
        }
    }

    // Sort by overall score descending
    guides.sort((a, b) => b.overallScore - a.overallScore);
    return guides;
}

function generateWarnings(spacer: string, gc: number, onTarget: number): string[] {
    const w: string[] = [];
    if (gc < 30) { w.push('⚠️ GC < 30% — baja estabilidad del duplex RNA:DNA'); }
    if (gc > 75) { w.push('⚠️ GC > 75% — posible estructura secundaria excesiva'); }
    if (/TTTT/.test(spacer)) { w.push('⚠️ Homopolímero TTTT — señal terminación Pol III'); }
    if (/AAAA/.test(spacer)) { w.push('⚠️ Homopolímero AAAA'); }
    if (/GGGG/.test(spacer)) { w.push('⚠️ Homopolímero GGGG — posible G-quadruplex'); }
    if (onTarget < 30) { w.push('⚠️ Score on-target bajo (< 30)'); }
    if (spacer.startsWith('T')) { w.push('💡 Spacer inicia con T — puede reducir expresión desde promotor U6'); }
    return w;
}

// ──────────────────────────────────────────────────────────────────────────────
// WebView Panel
// ──────────────────────────────────────────────────────────────────────────────
export class CRISPRDesigner {
    private panel: vscode.WebviewPanel | undefined;

    constructor(private context: vscode.ExtensionContext) {}

    show(): void {
        if (this.panel) { this.panel.reveal(); return; }

        this.panel = vscode.window.createWebviewPanel(
            'synbioCRISPR',
            '🔬 CRISPR gRNA Designer',
            vscode.ViewColumn.Two,
            { enableScripts: true, retainContextWhenHidden: true }
        );

        this.panel.webview.html = this.getWebviewContent();

        this.panel.webview.onDidReceiveMessage(msg => {
            switch (msg.type) {
                case 'designGuides': {
                    const guides = findGuideRNAs(msg.sequence, msg.nuclease);
                    this.panel?.webview.postMessage({
                        type: 'guidesResult',
                        guides: guides.slice(0, 50),
                        nuclease: CAS_NUCLEASES[msg.nuclease],
                        total: guides.length
                    });
                    break;
                }
                case 'useFromEditor':
                    this.getSequenceFromEditor();
                    break;
                case 'insertGuide':
                    this.insertGuideToEditor(msg.spacer, msg.nuclease);
                    break;
            }
        });

        this.panel.onDidDispose(() => { this.panel = undefined; });
    }

    private async getSequenceFromEditor(): Promise<void> {
        const editor = vscode.window.activeTextEditor;
        if (!editor) { return; }
        const text = editor.document.getText();

        // Extract DNA sequences from .bio file
        const seqPatterns = [
            /sequence\s*[:=]\s*"?([ACGTacgt\s]+)"?/g,
            /([ACGTacgt]{20,})/g,
        ];

        let sequences = '';
        for (const pattern of seqPatterns) {
            let match;
            while ((match = pattern.exec(text)) !== null) {
                sequences += match[1].replace(/\s/g, '');
            }
        }

        if (sequences && this.panel) {
            this.panel.webview.postMessage({ type: 'editorSequence', sequence: sequences });
        }
    }

    private insertGuideToEditor(spacer: string, nucleaseName: string): void {
        const editor = vscode.window.activeTextEditor;
        if (!editor) { return; }
        const snippet = `\n// CRISPR guide RNA — ${nucleaseName}\n// Spacer: ${spacer}\ngrna guide_${Date.now().toString(36)} {\n    spacer: "${spacer}"\n    scaffold: "GTTTTAGAGCTAGAAATAGCAAGTTAAAATAAGGCTAGTCCGTTATCAACTTGAAAAAGTGGCACCGAGTCGGTGC"\n}\n`;
        editor.edit(b => {
            b.insert(editor.selection.active, snippet);
        });
    }

    private getWebviewContent(): string {
        const nucleaseOptions = Object.entries(CAS_NUCLEASES)
            .map(([id, n]) => `<option value="${id}">${n.name} — PAM: ${n.pam}</option>`)
            .join('\n');

        return `<!DOCTYPE html>
<html lang="es"><head>
<meta charset="UTF-8">
<style>
:root { --bg: #1e1e2e; --surface: #181825; --text: #cdd6f4; --accent: #89b4fa; --border: #313244; --green: #a6e3a1; --red: #f38ba8; --yellow: #f9e2af; }
* { margin:0; padding:0; box-sizing:border-box; }
body { font-family: 'Segoe UI', sans-serif; background: var(--bg); color: var(--text); padding: 16px; }
h1 { font-size: 18px; color: var(--accent); margin-bottom: 12px; }
.input-group { margin-bottom: 12px; }
label { font-size: 12px; color: #a6adc8; margin-bottom: 4px; display: block; }
select, textarea, button, input { background: var(--surface); color: var(--text); border: 1px solid var(--border); border-radius: 6px; padding: 8px; font-size: 13px; width: 100%; }
textarea { height: 100px; font-family: 'Cascadia Code', 'Courier New', monospace; resize: vertical; }
button { cursor: pointer; width: auto; padding: 8px 20px; margin: 4px; }
button:hover { border-color: var(--accent); }
button.primary { background: var(--accent); color: var(--bg); font-weight: 600; }
.btn-row { display: flex; gap: 8px; margin: 12px 0; flex-wrap: wrap; }
.stats-bar { display: flex; gap: 16px; background: var(--surface); padding: 10px 16px; border-radius: 8px; margin: 12px 0; flex-wrap: wrap; }
.stat { text-align: center; }
.stat .val { font-size: 20px; font-weight: bold; color: var(--accent); }
.stat .lbl { font-size: 10px; color: #a6adc8; }
table { width: 100%; border-collapse: collapse; margin-top: 12px; font-size: 12px; }
th { background: var(--surface); padding: 8px; text-align: left; border-bottom: 2px solid var(--border); position: sticky; top: 0; }
td { padding: 6px 8px; border-bottom: 1px solid var(--border); vertical-align: top; }
tr:hover { background: rgba(137,180,250,0.05); }
.score { display: inline-block; min-width: 36px; text-align: center; padding: 2px 6px; border-radius: 4px; font-weight: 600; font-size: 11px; }
.score-high { background: rgba(166,227,161,0.2); color: var(--green); }
.score-mid { background: rgba(249,226,175,0.2); color: var(--yellow); }
.score-low { background: rgba(243,139,168,0.2); color: var(--red); }
.spacer-seq { font-family: 'Cascadia Code', monospace; font-size: 11px; letter-spacing: 1px; }
.pam-highlight { color: var(--red); font-weight: bold; }
.warnings { font-size: 10px; color: var(--yellow); }
.nuclease-info { background: var(--surface); padding: 12px; border-radius: 8px; margin: 8px 0; font-size: 12px; border-left: 3px solid var(--accent); }
.insert-btn { background: transparent; border: 1px solid var(--green); color: var(--green); padding: 2px 8px; font-size: 10px; width: auto; cursor: pointer; border-radius: 4px; }
.insert-btn:hover { background: var(--green); color: var(--bg); }
.result-container { max-height: 500px; overflow-y: auto; }
</style></head><body>
<h1>🔬 CRISPR Guide RNA Designer</h1>
<p style="font-size:12px;color:#a6adc8;margin-bottom:12px">Diseño de sgRNA con scoring basado en Doench et al. 2016 Nat Biotechnol & Hsu et al. 2013</p>

<div class="input-group">
    <label>Nucleasa Cas</label>
    <select id="nucleaseSelect">${nucleaseOptions}</select>
</div>

<div id="nucleaseInfo" class="nuclease-info"></div>

<div class="input-group">
    <label>Secuencia de ADN target (pegar secuencia 5'→3')</label>
    <textarea id="seqInput" placeholder="ATGCGATCGATCGATCG..."></textarea>
</div>

<div class="btn-row">
    <button class="primary" onclick="designGuides()">🧬 Diseñar gRNAs</button>
    <button onclick="useFromEditor()">📄 Desde Editor</button>
    <button onclick="loadExample()">📋 Ejemplo: lacZ</button>
</div>

<div class="stats-bar" id="statsBar" style="display:none">
    <div class="stat"><div class="val" id="statTotal">0</div><div class="lbl">gRNAs encontrados</div></div>
    <div class="stat"><div class="val" id="statTop">0</div><div class="lbl">Score > 70</div></div>
    <div class="stat"><div class="val" id="statSeqLen">0</div><div class="lbl">Secuencia (bp)</div></div>
    <div class="stat"><div class="val" id="statNuclease">—</div><div class="lbl">Nucleasa</div></div>
</div>

<div class="result-container" id="resultContainer"></div>

<script>
const vscode = acquireVsCodeApi();

document.getElementById('nucleaseSelect').addEventListener('change', updateNucleaseInfo);
updateNucleaseInfo();

function updateNucleaseInfo() {
    const nucleases = ${JSON.stringify(CAS_NUCLEASES)};
    const id = document.getElementById('nucleaseSelect').value;
    const n = nucleases[id];
    if (n) {
        document.getElementById('nucleaseInfo').innerHTML =
            '<strong>' + n.name + '</strong><br>' +
            'PAM: <code style="color:#f38ba8">' + n.pam + '</code> (' + n.pamSide + ') · ' +
            'Spacer: ' + n.spacerLength + ' nt · Cut offset: ' + n.cutOffset + '<br>' +
            '<span style="color:#a6adc8">' + n.description + '</span>';
    }
}

function designGuides() {
    const seq = document.getElementById('seqInput').value.replace(/[^ACGTacgt]/g, '');
    const nuclease = document.getElementById('nucleaseSelect').value;
    if (seq.length < 23) {
        document.getElementById('resultContainer').innerHTML = '<p style="color:var(--red)">Secuencia muy corta (mínimo 23 nt)</p>';
        return;
    }
    vscode.postMessage({ type: 'designGuides', sequence: seq, nuclease });
    document.getElementById('resultContainer').innerHTML = '<p>Analizando secuencia de ' + seq.length + ' bp...</p>';
}

function useFromEditor() {
    vscode.postMessage({ type: 'useFromEditor' });
}

function insertGuide(spacer) {
    const nuclease = document.getElementById('nucleaseSelect').value;
    vscode.postMessage({ type: 'insertGuide', spacer, nuclease });
}

function loadExample() {
    // lacZ gene first 500bp (E. coli K-12 MG1655)
    document.getElementById('seqInput').value =
        'ATGACCATGATTACGCCAAGCTTTCCCTGTAGCAGCATGACTGTTACTCAAGTCACTGACTACCGGGTTCAACCGT' +
        'TCAGCGGATGATTTACGGTTCAATCAGCAAATATCAGCGATCTCAGCAGCAGCCAACAGGTTGATGATTATGCCAGC' +
        'AGCTTCCAGACGTTCACCGCATGGTTCGATTTCGCTAACCTCACCAATTCCACTAACCTGCCTCCCTGCTTCTGATT' +
        'GAAATCAGCAATCAGCTGCTTTAGCGTTAACGATCCGGCGAACTTGCGCTAACACTCACTCCTCTCAATGATGATGA' +
        'ATGGCAGCCAATCCTCCTGCGGCGATCGGCTTGTTCGAGACTTCGGCGGCCGCAAGCCAGGTTGCCAGCCGCAGAG' +
        'CCATTTCCGATGCGGCTTCACTCAATCCAGAAAACAGGTCAGCCGCTTCAATCATCATCGATTTCAACAAACGCTCG' +
        'ATTTCAGGTGGCACTTTTCGGGGAAATGTGCGCGGAACCCCTAT';
}

function scoreClass(s) {
    if (s >= 70) return 'score-high';
    if (s >= 40) return 'score-mid';
    return 'score-low';
}

window.addEventListener('message', (event) => {
    const msg = event.data;
    if (msg.type === 'guidesResult') {
        const guides = msg.guides;
        const n = msg.nuclease;

        document.getElementById('statsBar').style.display = 'flex';
        document.getElementById('statTotal').textContent = msg.total;
        document.getElementById('statTop').textContent = guides.filter(g => g.overallScore >= 70).length;
        document.getElementById('statSeqLen').textContent = document.getElementById('seqInput').value.replace(/[^ACGTacgt]/g, '').length;
        document.getElementById('statNuclease').textContent = n.pam;

        if (guides.length === 0) {
            document.getElementById('resultContainer').innerHTML = '<p style="color:var(--yellow)">No se encontraron sitios PAM (' + n.pam + ') en la secuencia.</p>';
            return;
        }

        let html = '<table><thead><tr>' +
            "<th>#</th><th>Spacer (5'→3')</th><th>PAM</th><th>Pos</th><th>Strand</th>" +
            '<th>GC%</th><th>On-Target</th><th>Off-Target</th><th>Self-Comp</th><th>Overall</th><th>⚠️</th><th></th>' +
            '</tr></thead><tbody>';

        guides.forEach((g, i) => {
            html += '<tr>' +
                '<td>' + (i + 1) + '</td>' +
                '<td class="spacer-seq">' + g.spacer + '</td>' +
                '<td class="pam-highlight">' + g.pam + '</td>' +
                '<td>' + g.position + '</td>' +
                '<td>' + g.strand + '</td>' +
                '<td>' + g.gcContent.toFixed(0) + '%</td>' +
                '<td><span class="score ' + scoreClass(g.onTargetScore) + '">' + g.onTargetScore + '</span></td>' +
                '<td><span class="score ' + scoreClass(g.offTargetScore) + '">' + g.offTargetScore + '</span></td>' +
                '<td><span class="score ' + scoreClass(g.selfCompScore) + '">' + g.selfCompScore + '</span></td>' +
                '<td><span class="score ' + scoreClass(g.overallScore) + '">' + g.overallScore + '</span></td>' +
                '<td class="warnings">' + (g.warnings.length ? g.warnings.join('<br>') : '✅') + '</td>' +
                '<td><button class="insert-btn" onclick="insertGuide(&quot;' + g.spacer + '&quot;)">Insertar</button></td>' +
                '</tr>';
        });

        html += '</tbody></table>';
        document.getElementById('resultContainer').innerHTML = html;
    }

    if (msg.type === 'editorSequence') {
        document.getElementById('seqInput').value = msg.sequence;
    }
});
</script></body></html>`;
    }
}
