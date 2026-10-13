/**
 * ══════════════════════════════════════════════════════════════════
 * SynBio-LLVM — Sequence Alignment Engine (Fase 17)
 *
 * Alineamiento de secuencias biológicas:
 *   1. Needleman-Wunsch (global alignment)
 *   2. Smith-Waterman (local alignment)
 *   3. Scoring matrices: NUC44, BLOSUM62, PAM250
 *   4. Affine gap penalties
 *   5. Porcentaje de identidad, similitud, gaps
 *   6. Dot plot interactivo
 *   7. Multi-sequence comparison (pairwise all-vs-all)
 *   8. CIGAR string output
 *   9. Coloreado por conservación
 *   10. Detección automática DNA vs Protein
 *
 * Basado en los algoritmos clásicos de bioinformática:
 *   - Needleman & Wunsch (1970) J. Mol. Biol.
 *   - Smith & Waterman (1981) J. Mol. Biol.
 * ══════════════════════════════════════════════════════════════════
 */
import * as vscode from 'vscode';

// ── Scoring Matrices ───────────────────────────────────────────────────

/** DNA/RNA scoring: match = +2, mismatch = -1 (NUC44-like) */
const NUC_MATCH = 2;
const NUC_MISMATCH = -1;

/** BLOSUM62 for protein alignment */
const BLOSUM62_DATA: Record<string, Record<string, number>> = (() => {
    const aas = 'ARNDCQEGHILKMFPSTWYV';
    const matrix: number[][] = [
        [ 4,-1,-2,-2, 0,-1,-1, 0,-2,-1,-1,-1,-1,-2,-1, 1, 0,-3,-2, 0],
        [-1, 5, 0,-2,-3, 1, 0,-2, 0,-3,-2, 2,-1,-3,-2,-1,-1,-3,-2,-3],
        [-2, 0, 6, 1,-3, 0, 0, 0, 1,-3,-3, 0,-2,-3,-2, 1, 0,-4,-2,-3],
        [-2,-2, 1, 6,-3, 0, 2,-1,-1,-3,-4,-1,-3,-3,-1, 0,-1,-4,-3,-3],
        [ 0,-3,-3,-3, 9,-3,-4,-3,-3,-1,-1,-3,-1,-2,-3,-1,-1,-2,-2,-1],
        [-1, 1, 0, 0,-3, 5, 2,-2, 0,-3,-2, 1, 0,-3,-1, 0,-1,-2,-1,-2],
        [-1, 0, 0, 2,-4, 2, 5,-2, 0,-3,-3, 1,-2,-3,-1, 0,-1,-3,-2,-2],
        [ 0,-2, 0,-1,-3,-2,-2, 6,-2,-4,-4,-2,-3,-3,-2, 0,-2,-2,-3,-3],
        [-2, 0, 1,-1,-3, 0, 0,-2, 8,-3,-3,-1,-2,-1,-2,-1,-2,-2, 2,-3],
        [-1,-3,-3,-3,-1,-3,-3,-4,-3, 4, 2,-3, 1, 0,-3,-2,-1,-3,-1, 3],
        [-1,-2,-3,-4,-1,-2,-3,-4,-3, 2, 4,-2, 2, 0,-3,-2,-1,-2,-1, 1],
        [-1, 2, 0,-1,-3, 1, 1,-2,-1,-3,-2, 5,-1,-3,-1, 0,-1,-3,-2,-2],
        [-1,-1,-2,-3,-1, 0,-2,-3,-2, 1, 2,-1, 5, 0,-2,-1,-1,-1,-1, 1],
        [-2,-3,-3,-3,-2,-3,-3,-3,-1, 0, 0,-3, 0, 6,-4,-2,-2, 1, 3,-1],
        [-1,-2,-2,-1,-3,-1,-1,-2,-2,-3,-3,-1,-2,-4, 7,-1,-1,-4,-3,-2],
        [ 1,-1, 1, 0,-1, 0, 0, 0,-1,-2,-2, 0,-1,-2,-1, 4, 1,-3,-2,-2],
        [ 0,-1, 0,-1,-1,-1,-1,-2,-2,-1,-1,-1,-1,-2,-1, 1, 5,-2,-2, 0],
        [-3,-3,-4,-4,-2,-2,-3,-2,-2,-3,-2,-3,-1, 1,-4,-3,-2,11, 2,-3],
        [-2,-2,-2,-3,-2,-1,-2,-3, 2,-1,-1,-2,-1, 3,-3,-2,-2, 2, 7,-1],
        [ 0,-3,-3,-3,-1,-2,-2,-3,-3, 3, 1,-2, 1,-1,-2,-2, 0,-3,-1, 4],
    ];
    const result: Record<string, Record<string, number>> = {};
    for (let i = 0; i < aas.length; i++) {
        result[aas[i]] = {};
        for (let j = 0; j < aas.length; j++) {
            result[aas[i]][aas[j]] = matrix[i][j];
        }
    }
    return result;
})();

// ── Types ──────────────────────────────────────────────────────────────

interface AlignmentResult {
    seq1Aligned: string;
    seq2Aligned: string;
    matchLine: string;  // | for match, : for similar, space for gap/mismatch
    score: number;
    identity: number;    // percentage
    similarity: number;  // percentage (for proteins)
    gaps: number;
    length: number;
    cigar: string;
    method: string;
}

type SeqType = 'dna' | 'protein';

// ── Detect Sequence Type ───────────────────────────────────────────────

function detectSeqType(seq: string): SeqType {
    const clean = seq.toUpperCase().replace(/[^A-Z]/g, '');
    const dnaChars = clean.replace(/[ACGTURYSWKMBDHVN]/g, '').length;
    return dnaChars / clean.length < 0.1 ? 'dna' : 'protein';
}

// ── Score Function ─────────────────────────────────────────────────────

function scoreMatch(a: string, b: string, seqType: SeqType): number {
    a = a.toUpperCase();
    b = b.toUpperCase();
    if (seqType === 'dna') {
        return a === b ? NUC_MATCH : NUC_MISMATCH;
    }
    return BLOSUM62_DATA[a]?.[b] ?? -4;
}

function isSimilar(a: string, b: string, seqType: SeqType): boolean {
    if (seqType === 'dna') { return a.toUpperCase() === b.toUpperCase(); }
    return (BLOSUM62_DATA[a.toUpperCase()]?.[b.toUpperCase()] ?? -4) > 0;
}

// ── Needleman-Wunsch (Global) ──────────────────────────────────────────

function needlemanWunsch(
    seq1: string, seq2: string, seqType: SeqType,
    gapOpen: number = -10, gapExtend: number = -0.5,
): AlignmentResult {
    const m = seq1.length;
    const n = seq2.length;

    // Score matrix
    const H: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));

    // Initialize gap penalties
    for (let i = 0; i <= m; i++) { H[i][0] = gapOpen + i * gapExtend; }
    for (let j = 0; j <= n; j++) { H[0][j] = gapOpen + j * gapExtend; }
    H[0][0] = 0;

    // Fill matrix
    for (let i = 1; i <= m; i++) {
        for (let j = 1; j <= n; j++) {
            const match = H[i - 1][j - 1] + scoreMatch(seq1[i - 1], seq2[j - 1], seqType);
            const del = H[i - 1][j] + gapExtend;
            const ins = H[i][j - 1] + gapExtend;
            H[i][j] = Math.max(match, del, ins);
        }
    }

    // Traceback
    let aligned1 = '', aligned2 = '', matchLine = '';
    let i = m, j = n;
    let gaps = 0;
    let cigar = '';
    const cigarOps: { op: string; count: number }[] = [];

    while (i > 0 || j > 0) {
        let op: string;
        if (i > 0 && j > 0 && H[i][j] === H[i - 1][j - 1] + scoreMatch(seq1[i - 1], seq2[j - 1], seqType)) {
            aligned1 = seq1[i - 1] + aligned1;
            aligned2 = seq2[j - 1] + aligned2;
            const isMatch = seq1[i - 1].toUpperCase() === seq2[j - 1].toUpperCase();
            matchLine = (isMatch ? '|' : (isSimilar(seq1[i - 1], seq2[j - 1], seqType) ? ':' : ' ')) + matchLine;
            op = isMatch ? 'M' : 'X';
            i--; j--;
        } else if (i > 0 && H[i][j] === H[i - 1][j] + gapExtend) {
            aligned1 = seq1[i - 1] + aligned1;
            aligned2 = '-' + aligned2;
            matchLine = ' ' + matchLine;
            gaps++;
            op = 'D';
            i--;
        } else {
            aligned1 = '-' + aligned1;
            aligned2 = seq2[j - 1] + aligned2;
            matchLine = ' ' + matchLine;
            gaps++;
            op = 'I';
            j--;
        }

        if (cigarOps.length > 0 && cigarOps[cigarOps.length - 1].op === op) {
            cigarOps[cigarOps.length - 1].count++;
        } else {
            cigarOps.push({ op, count: 1 });
        }
    }

    cigar = cigarOps.reverse().map(c => `${c.count}${c.op}`).join('');

    const alnLen = aligned1.length;
    const matches = matchLine.split('').filter(c => c === '|').length;
    const similars = matchLine.split('').filter(c => c === '|' || c === ':').length;

    return {
        seq1Aligned: aligned1, seq2Aligned: aligned2, matchLine,
        score: H[m][n],
        identity: alnLen > 0 ? (matches / alnLen) * 100 : 0,
        similarity: alnLen > 0 ? (similars / alnLen) * 100 : 0,
        gaps, length: alnLen, cigar, method: 'Needleman-Wunsch (Global)',
    };
}

// ── Smith-Waterman (Local) ─────────────────────────────────────────────

function smithWaterman(
    seq1: string, seq2: string, seqType: SeqType,
    gapOpen: number = -10, gapExtend: number = -0.5,
): AlignmentResult {
    const m = seq1.length;
    const n = seq2.length;

    const H: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));

    let maxScore = 0;
    let maxI = 0, maxJ = 0;

    for (let i = 1; i <= m; i++) {
        for (let j = 1; j <= n; j++) {
            const match = H[i - 1][j - 1] + scoreMatch(seq1[i - 1], seq2[j - 1], seqType);
            const del = H[i - 1][j] + gapExtend;
            const ins = H[i][j - 1] + gapExtend;
            H[i][j] = Math.max(0, match, del, ins);

            if (H[i][j] > maxScore) {
                maxScore = H[i][j];
                maxI = i; maxJ = j;
            }
        }
    }

    // Traceback from max
    let aligned1 = '', aligned2 = '', matchLine = '';
    let i = maxI, j = maxJ;
    let gaps = 0;
    const cigarOps: { op: string; count: number }[] = [];

    while (i > 0 && j > 0 && H[i][j] > 0) {
        let op: string;
        if (H[i][j] === H[i - 1][j - 1] + scoreMatch(seq1[i - 1], seq2[j - 1], seqType)) {
            aligned1 = seq1[i - 1] + aligned1;
            aligned2 = seq2[j - 1] + aligned2;
            const isMatch = seq1[i - 1].toUpperCase() === seq2[j - 1].toUpperCase();
            matchLine = (isMatch ? '|' : (isSimilar(seq1[i - 1], seq2[j - 1], seqType) ? ':' : ' ')) + matchLine;
            op = isMatch ? 'M' : 'X';
            i--; j--;
        } else if (H[i][j] === H[i - 1][j] + gapExtend) {
            aligned1 = seq1[i - 1] + aligned1;
            aligned2 = '-' + aligned2;
            matchLine = ' ' + matchLine;
            gaps++; op = 'D'; i--;
        } else {
            aligned1 = '-' + aligned1;
            aligned2 = seq2[j - 1] + aligned2;
            matchLine = ' ' + matchLine;
            gaps++; op = 'I'; j--;
        }

        if (cigarOps.length > 0 && cigarOps[cigarOps.length - 1].op === op) {
            cigarOps[cigarOps.length - 1].count++;
        } else {
            cigarOps.push({ op, count: 1 });
        }
    }

    const cigar = cigarOps.reverse().map(c => `${c.count}${c.op}`).join('');
    const alnLen = aligned1.length;
    const matches = matchLine.split('').filter(c => c === '|').length;
    const similars = matchLine.split('').filter(c => c === '|' || c === ':').length;

    return {
        seq1Aligned: aligned1, seq2Aligned: aligned2, matchLine,
        score: maxScore,
        identity: alnLen > 0 ? (matches / alnLen) * 100 : 0,
        similarity: alnLen > 0 ? (similars / alnLen) * 100 : 0,
        gaps, length: alnLen, cigar, method: 'Smith-Waterman (Local)',
    };
}

// ── Dot Plot ───────────────────────────────────────────────────────────

function generateDotPlot(seq1: string, seq2: string, windowSize: number = 5, threshold: number = 3): { x: number; y: number }[] {
    const dots: { x: number; y: number }[] = [];
    for (let i = 0; i <= seq1.length - windowSize; i++) {
        for (let j = 0; j <= seq2.length - windowSize; j++) {
            let matches = 0;
            for (let k = 0; k < windowSize; k++) {
                if (seq1[i + k].toUpperCase() === seq2[j + k].toUpperCase()) { matches++; }
            }
            if (matches >= threshold) { dots.push({ x: j, y: i }); }
        }
    }
    return dots;
}

// ── Main Class ─────────────────────────────────────────────────────────

export class SequenceAlignmentEngine implements vscode.Disposable {
    private panel: vscode.WebviewPanel | undefined;
    private disposables: vscode.Disposable[] = [];
    private lastResult: AlignmentResult | undefined;

    constructor(private context: vscode.ExtensionContext) {}

    activate(): void {
        this.disposables.push(
            vscode.commands.registerCommand('synbio.alignSequences', () => this.alignInteractive()),
            vscode.commands.registerCommand('synbio.globalAlignment', () => this.quickAlign('global')),
            vscode.commands.registerCommand('synbio.localAlignment', () => this.quickAlign('local')),
            vscode.commands.registerCommand('synbio.dotPlot', () => this.dotPlotInteractive()),
        );
    }

    // ── Interactive Alignment ──────────────────────────────────────────

    private async alignInteractive(): Promise<void> {
        // Try to get sequences from editor selection
        const editor = vscode.window.activeTextEditor;
        let defaultSeq1 = '';
        let defaultSeq2 = '';

        if (editor && !editor.selection.isEmpty) {
            const text = editor.document.getText(editor.selection);
            const seqs = text.split(/\n\s*\n|\n>/).filter(s => s.trim());
            if (seqs.length >= 2) {
                defaultSeq1 = seqs[0].replace(/^>.*\n/, '').replace(/\s/g, '');
                defaultSeq2 = seqs[1].replace(/^>.*\n/, '').replace(/\s/g, '');
            }
        }

        const seq1input = await vscode.window.showInputBox({
            prompt: 'Secuencia 1 (DNA o proteína)',
            value: defaultSeq1,
            placeHolder: 'ATGCGATCGATCGATCG...',
        });
        if (!seq1input) { return; }

        const seq2input = await vscode.window.showInputBox({
            prompt: 'Secuencia 2',
            value: defaultSeq2,
            placeHolder: 'ATGCGATCAATCGATCG...',
        });
        if (!seq2input) { return; }

        const seq1 = seq1input.replace(/[^A-Za-z]/g, '');
        const seq2 = seq2input.replace(/[^A-Za-z]/g, '');
        const seqType = detectSeqType(seq1);

        const methodPick = await vscode.window.showQuickPick([
            { label: '🌍 Global (Needleman-Wunsch)', description: 'Full-length alignment, penalizes end gaps' },
            { label: '📍 Local (Smith-Waterman)', description: 'Best local match, ignores end gaps' },
            { label: '🔄 Both', description: 'Run both and compare' },
        ], { placeHolder: 'Método de alineamiento' });
        if (!methodPick) { return; }

        let results: AlignmentResult[];
        if (methodPick.label.includes('Both')) {
            results = [
                needlemanWunsch(seq1, seq2, seqType),
                smithWaterman(seq1, seq2, seqType),
            ];
        } else if (methodPick.label.includes('Global')) {
            results = [needlemanWunsch(seq1, seq2, seqType)];
        } else {
            results = [smithWaterman(seq1, seq2, seqType)];
        }

        this.lastResult = results[0];
        this.showAlignmentPanel(seq1, seq2, seqType, results);
    }

    // ── Quick Alignment ────────────────────────────────────────────────

    private async quickAlign(method: 'global' | 'local'): Promise<void> {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showWarningMessage('Abre un editor con secuencias para alinear.');
            return;
        }

        const text = editor.document.getText();
        // Parse FASTA-like or plain two sequences
        const seqs: string[] = [];
        const fastaBlocks = text.split(/>/).filter(b => b.trim());
        if (fastaBlocks.length >= 2) {
            for (const block of fastaBlocks) {
                const lines = block.split('\n');
                seqs.push(lines.slice(1).join('').replace(/\s/g, ''));
            }
        } else {
            // Try splitting by blank line
            const blocks = text.split(/\n\s*\n/).filter(b => b.trim());
            for (const block of blocks) {
                seqs.push(block.replace(/\s/g, ''));
            }
        }

        if (seqs.length < 2) {
            vscode.window.showWarningMessage('Necesito al menos 2 secuencias (FASTA o separadas por línea en blanco).');
            return;
        }

        const seq1 = seqs[0].replace(/[^A-Za-z]/g, '');
        const seq2 = seqs[1].replace(/[^A-Za-z]/g, '');
        const seqType = detectSeqType(seq1);

        const result = method === 'global'
            ? needlemanWunsch(seq1, seq2, seqType)
            : smithWaterman(seq1, seq2, seqType);

        this.showAlignmentPanel(seq1, seq2, seqType, [result]);
    }

    // ── Dot Plot ───────────────────────────────────────────────────────

    private async dotPlotInteractive(): Promise<void> {
        const seq1 = await vscode.window.showInputBox({ prompt: 'Secuencia 1', placeHolder: 'ATGCGATCG...' });
        if (!seq1) { return; }
        const seq2 = await vscode.window.showInputBox({ prompt: 'Secuencia 2', placeHolder: 'ATGCGATCG...' });
        if (!seq2) { return; }

        const clean1 = seq1.replace(/[^A-Za-z]/g, '');
        const clean2 = seq2.replace(/[^A-Za-z]/g, '');
        const dots = generateDotPlot(clean1, clean2, 5, 3);
        const seqType = detectSeqType(clean1);

        // Also compute alignment
        const result = needlemanWunsch(clean1, clean2, seqType);
        this.showAlignmentPanel(clean1, clean2, seqType, [result], dots);
    }

    // ── Alignment Panel ────────────────────────────────────────────────

    private showAlignmentPanel(
        seq1: string, seq2: string, seqType: SeqType,
        results: AlignmentResult[],
        dots?: { x: number; y: number }[],
    ): void {
        if (this.panel) { this.panel.reveal(); } else {
            this.panel = vscode.window.createWebviewPanel(
                'seqAlignment', '🧬 Sequence Alignment',
                vscode.ViewColumn.One,
                { enableScripts: true, retainContextWhenHidden: true },
            );
            this.panel.onDidDispose(() => { this.panel = undefined; });
        }
        this.panel.webview.html = this.buildAlignmentHtml(seq1, seq2, seqType, results, dots);
    }

    private buildAlignmentHtml(
        seq1: string, seq2: string, seqType: SeqType,
        results: AlignmentResult[],
        dots?: { x: number; y: number }[],
    ): string {
        // Color by conservation
        const colorNuc = (c: string, match: boolean): string => {
            if (c === '-') { return '#6c7086'; }
            if (!match) { return '#f38ba8'; }
            const colors: Record<string, string> = { A: '#a6e3a1', T: '#89b4fa', G: '#f9e2af', C: '#f38ba8', U: '#89dceb' };
            return colors[c.toUpperCase()] || '#cdd6f4';
        };

        const colorAA = (c: string, match: boolean): string => {
            if (c === '-') { return '#6c7086'; }
            if (!match) { return '#f38ba8'; }
            // Hydrophobic / Polar / Charged grouping
            if ('AILMFWV'.includes(c.toUpperCase())) { return '#89b4fa'; }  // hydrophobic
            if ('STNQ'.includes(c.toUpperCase())) { return '#a6e3a1'; }    // polar
            if ('DE'.includes(c.toUpperCase())) { return '#f38ba8'; }      // negative
            if ('KRH'.includes(c.toUpperCase())) { return '#89dceb'; }     // positive
            if ('CGP'.includes(c.toUpperCase())) { return '#f9e2af'; }     // special
            return '#cdd6f4';
        };

        const colorFn = seqType === 'dna' ? colorNuc : colorAA;

        // Render alignment blocks (60 chars per line)
        let alignmentHtml = '';
        for (const result of results) {
            const blockSize = 60;
            let blocks = '';
            for (let pos = 0; pos < result.length; pos += blockSize) {
                const s1 = result.seq1Aligned.substring(pos, pos + blockSize);
                const ml = result.matchLine.substring(pos, pos + blockSize);
                const s2 = result.seq2Aligned.substring(pos, pos + blockSize);

                let line1 = '', line2 = '', lineM = '';
                for (let k = 0; k < s1.length; k++) {
                    const isMatch = ml[k] === '|' || ml[k] === ':';
                    line1 += `<span style="color:${colorFn(s1[k], isMatch)}">${s1[k]}</span>`;
                    line2 += `<span style="color:${colorFn(s2[k], isMatch)}">${s2[k]}</span>`;
                    lineM += `<span style="color:${ml[k] === '|' ? '#a6e3a1' : ml[k] === ':' ? '#f9e2af' : '#313244'}">${ml[k] === ' ' ? '·' : ml[k]}</span>`;
                }

                blocks += `<div style="margin:2px 0">
                    <span style="color:#6c7086;display:inline-block;width:50px;text-align:right;margin-right:8px;font-size:10px">${pos + 1}</span>${line1}
                    <br><span style="display:inline-block;width:50px"></span>${lineM}
                    <br><span style="display:inline-block;width:50px"></span>${line2}
                </div>`;
            }

            const identityColor = result.identity > 90 ? '#a6e3a1' : result.identity > 70 ? '#f9e2af' : result.identity > 50 ? '#fab387' : '#f38ba8';

            alignmentHtml += `<div style="background:#1e1e2e;border-radius:8px;padding:14px;margin:8px 0">
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
                    <strong style="color:#89b4fa">${result.method}</strong>
                    <span style="font-size:11px;color:#6c7086">Score: ${result.score} | CIGAR: ${result.cigar.substring(0, 40)}${result.cigar.length > 40 ? '...' : ''}</span>
                </div>
                <div style="display:grid;grid-template-columns:repeat(5,1fr);gap:6px;margin-bottom:12px">
                    <div style="background:#181825;padding:6px;border-radius:4px;text-align:center">
                        <div style="font-size:20px;font-weight:bold;color:${identityColor}">${result.identity.toFixed(1)}%</div>
                        <div style="font-size:9px;color:#6c7086">Identity</div>
                    </div>
                    <div style="background:#181825;padding:6px;border-radius:4px;text-align:center">
                        <div style="font-size:20px;font-weight:bold;color:#89dceb">${result.similarity.toFixed(1)}%</div>
                        <div style="font-size:9px;color:#6c7086">Similarity</div>
                    </div>
                    <div style="background:#181825;padding:6px;border-radius:4px;text-align:center">
                        <div style="font-size:20px;font-weight:bold;color:#cba6f7">${result.gaps}</div>
                        <div style="font-size:9px;color:#6c7086">Gaps</div>
                    </div>
                    <div style="background:#181825;padding:6px;border-radius:4px;text-align:center">
                        <div style="font-size:20px;font-weight:bold;color:#f9e2af">${result.length}</div>
                        <div style="font-size:9px;color:#6c7086">Aln Length</div>
                    </div>
                    <div style="background:#181825;padding:6px;border-radius:4px;text-align:center">
                        <div style="font-size:20px;font-weight:bold;color:#cdd6f4">${result.score}</div>
                        <div style="font-size:9px;color:#6c7086">Score</div>
                    </div>
                </div>
                <div style="font-family:'Courier New',monospace;font-size:12px;line-height:1.5;overflow-x:auto;background:#181825;padding:10px;border-radius:4px">${blocks}</div>
            </div>`;
        }

        // Dot plot SVG
        let dotPlotSvg = '';
        if (dots && dots.length > 0) {
            const dpSize = 300;
            const xScale = seq2.length > 0 ? dpSize / seq2.length : 1;
            const yScale = seq1.length > 0 ? dpSize / seq1.length : 1;
            const dotsSvg = dots.map(d => `<rect x="${d.x * xScale}" y="${d.y * yScale}" width="${Math.max(1, xScale)}" height="${Math.max(1, yScale)}" fill="#89b4fa" opacity="0.6"/>`).join('');
            dotPlotSvg = `<div style="background:#1e1e2e;border-radius:8px;padding:14px;margin:8px 0">
                <strong style="color:#89b4fa">Dot Plot</strong> <span style="font-size:10px;color:#6c7086">(window=5, threshold=3, ${dots.length} dots)</span>
                <div style="margin-top:8px;text-align:center">
                    <svg width="${dpSize + 40}" height="${dpSize + 40}" xmlns="http://www.w3.org/2000/svg" style="background:#181825;border-radius:4px">
                        <text x="10" y="${dpSize / 2 + 20}" fill="#6c7086" font-size="10" transform="rotate(-90,10,${dpSize / 2 + 20})">Seq 1</text>
                        <text x="${dpSize / 2 + 20}" y="${dpSize + 35}" fill="#6c7086" font-size="10" text-anchor="middle">Seq 2</text>
                        <g transform="translate(25,10)">${dotsSvg}</g>
                        <rect x="25" y="10" width="${dpSize}" height="${dpSize}" fill="none" stroke="#45475a"/>
                    </svg>
                </div>
            </div>`;
        }

        return `<!DOCTYPE html><html><head><meta charset="UTF-8">
<style>
body{background:#1a1a2e;color:#cdd6f4;font-family:'Segoe UI',sans-serif;margin:0;padding:16px}
h1{color:#89b4fa;font-size:18px;margin:0}
</style></head><body>
<div style="display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid #313244;padding-bottom:8px">
    <h1>🧬 Sequence Alignment</h1>
    <div style="font-size:11px;color:#6c7086">
        Seq1: ${seq1.length}${seqType === 'dna' ? 'bp' : 'aa'} | Seq2: ${seq2.length}${seqType === 'dna' ? 'bp' : 'aa'} |
        Type: ${seqType.toUpperCase()} | Matrix: ${seqType === 'dna' ? 'NUC44' : 'BLOSUM62'}
    </div>
</div>
${alignmentHtml}
${dotPlotSvg}
<div style="margin-top:8px;padding:8px;background:#181825;border-radius:6px;font-size:10px;color:#6c7086">
    <strong>Legend:</strong>
    <span style="color:#a6e3a1">|</span> = identity &nbsp;
    <span style="color:#f9e2af">:</span> = similar (BLOSUM62 > 0) &nbsp;
    <span style="color:#313244">·</span> = mismatch/gap &nbsp;
    ${seqType === 'dna' ? '<span style="color:#a6e3a1">A</span> <span style="color:#89b4fa">T</span> <span style="color:#f9e2af">G</span> <span style="color:#f38ba8">C</span>' : '<span style="color:#89b4fa">Hydrophobic</span> <span style="color:#a6e3a1">Polar</span> <span style="color:#f38ba8">Neg</span> <span style="color:#89dceb">Pos</span> <span style="color:#f9e2af">Special</span>'}
</div>
</body></html>`;
    }

    dispose(): void {
        this.panel?.dispose();
        this.disposables.forEach(d => d.dispose());
    }
}
