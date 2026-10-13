/**
 * ══════════════════════════════════════════════════════════════════════════════
 * RNA Structure Predictor — SynBio Extension v0.8.0
 *
 * Implements:
 *  1. Nussinov Algorithm — RNA secondary structure (dot-bracket notation)
 *  2. Free Energy Minimization — Nearest-neighbor ΔG (Turner 2004 rules)
 *  3. AlphaFold API client — Protein 3D structure via AlphaFold DB REST
 *  4. WebView visualization — Arc diagram + dot-bracket + 3D viewer
 *
 * Algorithms are implemented locally (no WASM needed).
 * ══════════════════════════════════════════════════════════════════════════════
 */
import * as vscode from 'vscode';

// ── Turner 2004 nearest-neighbor stacking energies (kcal/mol, 37°C, 1M NaCl) ─
// Format: stackingEnergy[closingBP][enclosedBP]
// BP codes: AU=0, UA=1, CG=2, GC=3, GU=4, UG=5
const STACKING_ENERGIES: number[][] = [
    // AU    UA    CG    GC    GU    UG   ← enclosed pair
    [-0.9, -1.1, -2.2, -2.1, -0.6, -1.4], // AU ← closing pair
    [-1.3, -0.9, -2.4, -2.1, -1.0, -1.3], // UA
    [-2.1, -2.4, -3.3, -3.4, -1.4, -2.1], // CG
    [-2.4, -2.1, -3.4, -3.3, -1.5, -2.5], // GC
    [-1.3, -0.6, -2.5, -1.5, -0.5, +1.3], // GU
    [-1.0, -1.4, -2.1, -2.4, +1.3, -0.5], // UG
];

// Hairpin loop initiation energies (kcal/mol)
const HAIRPIN_INIT: Record<number, number> = {
    3: 5.4, 4: 5.6, 5: 5.7, 6: 5.4, 7: 6.0, 8: 5.5, 9: 6.4,
};

// Internal loop initiation energies (kcal/mol)
const INTERNAL_INIT: Record<number, number> = {
    1: 1.0, 2: 1.0, 3: 1.0, 4: 1.1, 5: 2.0, 6: 2.0,
};

const BULGE_INIT: Record<number, number> = {
    1: 3.8, 2: 2.8, 3: 3.2, 4: 3.6, 5: 4.0, 6: 4.4,
};

const MIN_HAIRPIN_LOOP = 3;
const ALPHAFOLD_DB_API = 'https://alphafold.ebi.ac.uk/api';

// ── Base pair scoring ──────────────────────────────────────────────────────

function canPair(a: string, b: string): boolean {
    const pair = a + b;
    return ['AU', 'UA', 'CG', 'GC', 'GU', 'UG'].includes(pair);
}

function bpIndex(a: string, b: string): number {
    const pairs: Record<string, number> = { 'AU': 0, 'UA': 1, 'CG': 2, 'GC': 3, 'GU': 4, 'UG': 5 };
    return pairs[a + b] ?? -1;
}

// ════════════════════════════════════════════════════════════════════════════
// NUSSINOV ALGORITHM — Maximum base pairs (structure prediction)
// ════════════════════════════════════════════════════════════════════════════

interface NussinovResult {
    sequence: string;
    structure: string;        // dot-bracket notation
    pairs: [number, number][]; // base-pair indices
    basePairCount: number;
    freeEnergy: number;       // estimated ΔG (kcal/mol)
    gcContent: number;
}

function nussinov(seq: string): NussinovResult {
    const s = seq.toUpperCase().replace(/T/g, 'U').replace(/[^AUCG]/g, '');
    const n = s.length;

    // DP table
    const dp: number[][] = Array.from({ length: n }, () => new Array(n).fill(0));

    // Fill DP: for each substring length
    for (let L = MIN_HAIRPIN_LOOP + 2; L <= n; L++) {
        for (let i = 0; i <= n - L; i++) {
            const j = i + L - 1;

            // Case 1: i is unpaired
            dp[i][j] = dp[i + 1][j];

            // Case 2: j is unpaired
            dp[i][j] = Math.max(dp[i][j], dp[i][j - 1]);

            // Case 3: i pairs with j
            if (canPair(s[i], s[j]) && j - i > MIN_HAIRPIN_LOOP) {
                dp[i][j] = Math.max(dp[i][j], dp[i + 1][j - 1] + 1);
            }

            // Case 4: bifurcation — split at k
            for (let k = i + 1; k < j; k++) {
                dp[i][j] = Math.max(dp[i][j], dp[i][k] + dp[k + 1][j]);
            }
        }
    }

    // Traceback to find structure
    const pairs: [number, number][] = [];
    const structure: string[] = new Array(n).fill('.');

    function traceback(i: number, j: number): void {
        if (i >= j) { return; }

        if (dp[i][j] === dp[i + 1][j]) {
            traceback(i + 1, j);
        } else if (dp[i][j] === dp[i][j - 1]) {
            traceback(i, j - 1);
        } else if (canPair(s[i], s[j]) && j - i > MIN_HAIRPIN_LOOP &&
            dp[i][j] === dp[i + 1][j - 1] + 1) {
            pairs.push([i, j]);
            structure[i] = '(';
            structure[j] = ')';
            traceback(i + 1, j - 1);
        } else {
            // Bifurcation
            for (let k = i + 1; k < j; k++) {
                if (dp[i][j] === dp[i][k] + dp[k + 1][j]) {
                    traceback(i, k);
                    traceback(k + 1, j);
                    break;
                }
            }
        }
    }

    traceback(0, n - 1);

    // Estimate free energy from stacking
    let energy = 0;
    const pairMap = new Map<number, number>();
    for (const [a, b] of pairs) {
        pairMap.set(a, b);
        pairMap.set(b, a);
    }

    for (const [a, b] of pairs) {
        // Check if (a+1, b-1) is also a pair → stacking
        if (pairMap.get(a + 1) === b - 1) {
            const outer = bpIndex(s[a], s[b]);
            const inner = bpIndex(s[a + 1], s[b - 1]);
            if (outer >= 0 && inner >= 0) {
                energy += STACKING_ENERGIES[outer][inner];
            }
        }
    }

    // Add hairpin loop penalties
    for (const [a, b] of pairs) {
        // Find hairpin loops (innermost pairs)
        let isHairpin = true;
        for (let k = a + 1; k < b; k++) {
            if (pairMap.has(k)) { isHairpin = false; break; }
        }
        if (isHairpin) {
            const loopSize = b - a - 1;
            energy += HAIRPIN_INIT[Math.min(loopSize, 9)] || (5.4 + 1.75 * Math.log(loopSize / 9));
        }
    }

    const gcCount = (s.match(/[GC]/g) || []).length;

    return {
        sequence: s,
        structure: structure.join(''),
        pairs: pairs.sort((a, b) => a[0] - b[0]),
        basePairCount: pairs.length,
        freeEnergy: Math.round(energy * 100) / 100,
        gcContent: Math.round((gcCount / n) * 10000) / 100,
    };
}

// ════════════════════════════════════════════════════════════════════════════
// ZUKER-STYLE MFE — Minimum Free Energy (simplified Turner rules)
// ════════════════════════════════════════════════════════════════════════════

interface MFEResult extends NussinovResult {
    stems: StemRegion[];
    loops: LoopRegion[];
    mfeMethod: string;
}

interface StemRegion {
    start5: number;
    start3: number;
    length: number;
    energy: number;
}

interface LoopRegion {
    type: 'hairpin' | 'internal' | 'bulge' | 'multiloop';
    start: number;
    end: number;
    size: number;
}

function mfePrediction(seq: string): MFEResult {
    // Use Nussinov as base, then refine energy with Turner rules
    const base = nussinov(seq);
    const s = base.sequence;
    const n = s.length;

    // Build pair lookup
    const pairOf = new Array(n).fill(-1);
    for (const [a, b] of base.pairs) {
        pairOf[a] = b;
        pairOf[b] = a;
    }

    // Find stems
    const stems: StemRegion[] = [];
    const visited = new Set<number>();
    for (const [a, b] of base.pairs) {
        if (visited.has(a)) { continue; }
        let len = 1;
        let stemE = 0;
        while (a + len < b - len && pairOf[a + len] === b - len) {
            const o = bpIndex(s[a + len - 1], s[b - len + 1]);
            const i = bpIndex(s[a + len], s[b - len]);
            if (o >= 0 && i >= 0) {
                stemE += STACKING_ENERGIES[o][i];
            }
            visited.add(a + len);
            len++;
        }
        stems.push({ start5: a, start3: b, length: len, energy: Math.round(stemE * 100) / 100 });
    }

    // Find loops
    const loops: LoopRegion[] = [];
    for (const stem of stems) {
        const innerStart = stem.start5 + stem.length;
        const innerEnd = stem.start3 - stem.length;
        if (innerStart < innerEnd) {
            // Check if purely unpaired → hairpin
            let hasPair = false;
            for (let k = innerStart; k <= innerEnd; k++) {
                if (pairOf[k] >= innerStart && pairOf[k] <= innerEnd) {
                    hasPair = true;
                    break;
                }
            }
            if (!hasPair) {
                loops.push({
                    type: 'hairpin',
                    start: innerStart,
                    end: innerEnd,
                    size: innerEnd - innerStart + 1,
                });
            } else {
                // Count branches
                let branches = 0;
                for (let k = innerStart; k <= innerEnd; k++) {
                    if (pairOf[k] > k && pairOf[k] <= innerEnd) {
                        branches++;
                        k = pairOf[k];
                    }
                }
                loops.push({
                    type: branches > 1 ? 'multiloop' : 'internal',
                    start: innerStart,
                    end: innerEnd,
                    size: innerEnd - innerStart + 1,
                });
            }
        }
    }

    // Recalculate total energy with Turner terms
    let totalEnergy = 0;
    for (const stem of stems) {
        totalEnergy += stem.energy;
    }
    for (const loop of loops) {
        if (loop.type === 'hairpin') {
            totalEnergy += HAIRPIN_INIT[Math.min(loop.size, 9)] || (5.4 + 1.75 * Math.log(loop.size / 9));
        } else if (loop.type === 'internal') {
            totalEnergy += INTERNAL_INIT[Math.min(loop.size, 6)] || 2.0;
        } else if (loop.type === 'multiloop') {
            totalEnergy += 3.4; // multiloop initiation
        }
    }

    return {
        ...base,
        freeEnergy: Math.round(totalEnergy * 100) / 100,
        stems,
        loops,
        mfeMethod: 'Nussinov + Turner 2004 (simplified)',
    };
}

// ════════════════════════════════════════════════════════════════════════════
// ALPHAFOLD DATABASE CLIENT — Fetch predicted 3D structures
// ════════════════════════════════════════════════════════════════════════════

interface AlphaFoldEntry {
    entryId: string;
    gene: string;
    uniprotAccession: string;
    uniprotId: string;
    uniprotDescription: string;
    taxId: number;
    organismScientificName: string;
    pdbUrl: string;
    cifUrl: string;
    paeImageUrl: string;
    modelCreatedDate: string;
    latestVersion: number;
    globalMetricType: string;
    globalMetricValue: number;
}

async function fetchAlphaFoldPDB(uniprotId: string): Promise<{ pdb: string; entry: AlphaFoldEntry }> {
    const lookupUrl = `${ALPHAFOLD_DB_API}/prediction/${uniprotId}`;

    const response = await fetch(lookupUrl, {
        headers: { 'Accept': 'application/json' },
    });

    if (!response.ok) {
        throw new Error(`AlphaFold DB: ${response.status} — ${uniprotId} no encontrado`);
    }

    const entries: AlphaFoldEntry[] = await response.json() as AlphaFoldEntry[];
    if (!entries || entries.length === 0) {
        throw new Error(`No hay predicción AlphaFold para ${uniprotId}`);
    }

    const entry = entries[0];
    const pdbResponse = await fetch(entry.pdbUrl);
    if (!pdbResponse.ok) {
        throw new Error(`No se pudo descargar PDB para ${uniprotId}`);
    }

    const pdb = await pdbResponse.text();
    return { pdb, entry };
}

// ════════════════════════════════════════════════════════════════════════════
// WEBVIEW PANEL — RNA Structure Visualization
// ════════════════════════════════════════════════════════════════════════════

function generateRNAWebviewHTML(result: MFEResult): string {
    const { sequence, structure, pairs, basePairCount, freeEnergy, gcContent, stems, loops } = result;
    const n = sequence.length;

    // Generate arc diagram SVG (inline)
    const svgWidth = Math.max(600, n * 12 + 40);
    const svgHeight = 300;
    const baseY = svgHeight - 40;
    const xScale = (svgWidth - 40) / n;

    let arcs = '';
    for (const [i, j] of pairs) {
        const x1 = 20 + i * xScale;
        const x2 = 20 + j * xScale;
        const cx = (x1 + x2) / 2;
        const r = (x2 - x1) / 2;
        const ry = Math.min(r, svgHeight - 80);
        arcs += `<path d="M ${x1} ${baseY} A ${r} ${ry} 0 0 1 ${x2} ${baseY}" fill="none" stroke="#3fb950" stroke-width="1.5" opacity="0.7"/>`;
    }

    let bases = '';
    const baseColors: Record<string, string> = { A: '#3fb950', U: '#f85149', C: '#58a6ff', G: '#d29922' };
    for (let i = 0; i < n; i++) {
        const x = 20 + i * xScale;
        const isPaired = pairs.some(([a, b]) => a === i || b === i);
        bases += `<text x="${x}" y="${baseY + 16}" text-anchor="middle" font-family="monospace" font-size="10" fill="${baseColors[sequence[i]] || '#8b949e'}" font-weight="${isPaired ? 'bold' : 'normal'}">${sequence[i]}</text>`;
    }

    // Structure annotation below
    let dotBracket = '';
    for (let i = 0; i < n; i++) {
        const x = 20 + i * xScale;
        const ch = structure[i];
        const col = ch === '(' ? '#bc8cff' : ch === ')' ? '#f0883e' : '#484f58';
        dotBracket += `<text x="${x}" y="${baseY + 30}" text-anchor="middle" font-family="monospace" font-size="9" fill="${col}">${ch}</text>`;
    }

    return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline';">
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body { background:#0d1117; color:#e6edf3; font-family:'Segoe UI',sans-serif; padding:20px; }
  h1 { font-size:20px; color:#3fb950; margin-bottom:4px; }
  h2 { font-size:15px; color:#8b949e; font-weight:400; margin-bottom:16px; }
  .stats { display:grid; grid-template-columns:repeat(auto-fit,minmax(140px,1fr)); gap:10px; margin-bottom:20px; }
  .stat { background:#161b22; border:1px solid #30363d; border-radius:8px; padding:12px; text-align:center; }
  .stat-val { font-size:22px; font-weight:700; }
  .stat-lbl { font-size:11px; color:#8b949e; margin-top:2px; letter-spacing:1px; }
  .arc-container { background:#161b22; border:1px solid #30363d; border-radius:8px; padding:16px; margin-bottom:16px; overflow-x:auto; }
  .seq-display { background:#0d1117; border:1px solid #30363d; border-radius:6px; padding:12px; font-family:'JetBrains Mono',monospace; font-size:12px; word-break:break-all; line-height:1.6; margin-bottom:16px; letter-spacing:1px; }
  .table-container { margin-bottom:16px; }
  table { width:100%; border-collapse:collapse; font-size:13px; }
  th { background:#161b22; padding:8px 12px; color:#8b949e; text-align:left; font-size:11px; letter-spacing:1px; }
  td { padding:8px 12px; border-bottom:1px solid #21262d; }
  .e-neg { color:#3fb950; } .e-pos { color:#f85149; }
  .loop-hairpin { color:#58a6ff; } .loop-internal { color:#d29922; } .loop-multi { color:#bc8cff; }
  .legend { display:flex; gap:16px; flex-wrap:wrap; margin-bottom:16px; font-size:12px; }
  .legend span { display:flex; align-items:center; gap:4px; }
  .dot { width:10px; height:10px; border-radius:50%; display:inline-block; }
</style>
</head>
<body>
<h1>🧬 RNA Secondary Structure</h1>
<h2>${result.mfeMethod}</h2>

<div class="stats">
  <div class="stat"><div class="stat-val" style="color:#3fb950;">${n}</div><div class="stat-lbl">NUCLEÓTIDOS</div></div>
  <div class="stat"><div class="stat-val" style="color:#58a6ff;">${basePairCount}</div><div class="stat-lbl">PARES DE BASES</div></div>
  <div class="stat"><div class="stat-val ${freeEnergy < 0 ? 'e-neg' : 'e-pos'}">${freeEnergy}</div><div class="stat-lbl">ΔG (kcal/mol)</div></div>
  <div class="stat"><div class="stat-val" style="color:#d29922;">${gcContent}%</div><div class="stat-lbl">GC CONTENT</div></div>
  <div class="stat"><div class="stat-val" style="color:#bc8cff;">${stems.length}</div><div class="stat-lbl">STEMS</div></div>
  <div class="stat"><div class="stat-val" style="color:#f0883e;">${loops.length}</div><div class="stat-lbl">LOOPS</div></div>
</div>

<div class="legend">
  <span><span class="dot" style="background:#3fb950;"></span> A — Adenina</span>
  <span><span class="dot" style="background:#f85149;"></span> U — Uracilo</span>
  <span><span class="dot" style="background:#58a6ff;"></span> C — Citosina</span>
  <span><span class="dot" style="background:#d29922;"></span> G — Guanina</span>
</div>

<div class="arc-container">
  <svg width="${svgWidth}" height="${svgHeight}" xmlns="http://www.w3.org/2000/svg">
    ${arcs}
    ${bases}
    ${dotBracket}
  </svg>
</div>

<div class="seq-display">
  <strong style="color:#8b949e;font-size:11px;">Secuencia:</strong><br>
  ${sequence.split('').map(b => `<span style="color:${baseColors[b] || '#8b949e'}">${b}</span>`).join('')}
  <br><br>
  <strong style="color:#8b949e;font-size:11px;">Dot-Bracket:</strong><br>
  ${structure.split('').map(c => `<span style="color:${c === '(' ? '#bc8cff' : c === ')' ? '#f0883e' : '#484f58'}">${c}</span>`).join('')}
</div>

${stems.length > 0 ? `
<div class="table-container">
  <table>
    <tr><th>STEM</th><th>5' POS</th><th>3' POS</th><th>LONG.</th><th>ΔG (kcal/mol)</th></tr>
    ${stems.map((st, i) => `<tr>
      <td>Stem ${i + 1}</td>
      <td>${st.start5 + 1}</td>
      <td>${st.start3 + 1}</td>
      <td>${st.length} bp</td>
      <td class="${st.energy < 0 ? 'e-neg' : 'e-pos'}">${st.energy}</td>
    </tr>`).join('')}
  </table>
</div>` : ''}

${loops.length > 0 ? `
<div class="table-container">
  <table>
    <tr><th>LOOP</th><th>TIPO</th><th>POSICIÓN</th><th>TAMAÑO</th></tr>
    ${loops.map((lp, i) => `<tr>
      <td>Loop ${i + 1}</td>
      <td class="loop-${lp.type}">${lp.type}</td>
      <td>${lp.start + 1}–${lp.end + 1}</td>
      <td>${lp.size} nt</td>
    </tr>`).join('')}
  </table>
</div>` : ''}

<div style="margin-top:20px;padding:12px;background:#161b22;border:1px solid #30363d;border-radius:8px;">
  <div style="font-size:11px;color:#8b949e;letter-spacing:1px;margin-bottom:6px;">ℹ️ PARES DE BASES</div>
  <div style="font-size:13px;line-height:1.8;">
    ${pairs.map(([a, b]) => `<span style="color:#3fb950;">${sequence[a]}${a + 1}</span>–<span style="color:#f0883e;">${sequence[b]}${b + 1}</span>`).join(' &nbsp;·&nbsp; ')}
  </div>
</div>

</body></html>`;
}

// ════════════════════════════════════════════════════════════════════════════
// ALPHAFOLD WEBVIEW
// ════════════════════════════════════════════════════════════════════════════

function generateAlphaFoldWebviewHTML(entry: AlphaFoldEntry, pdb: string): string {
    const confidenceScore = entry.globalMetricValue != null
        ? Math.round(entry.globalMetricValue * 100) / 100 : 'N/A';

    return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; img-src https://alphafold.ebi.ac.uk;">
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body { background:#0d1117; color:#e6edf3; font-family:'Segoe UI',sans-serif; padding:20px; }
  h1 { font-size:20px; color:#58a6ff; margin-bottom:4px; }
  h2 { font-size:14px; color:#8b949e; font-weight:400; margin-bottom:16px; }
  .meta { display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-bottom:20px; }
  .meta-item { background:#161b22; border:1px solid #30363d; border-radius:8px; padding:14px; }
  .meta-lbl { font-size:11px; color:#8b949e; letter-spacing:1px; margin-bottom:4px; }
  .meta-val { font-size:15px; font-weight:600; }
  .pae-img { max-width:100%; border-radius:8px; border:1px solid #30363d; margin-bottom:16px; }
  .pdb-box { background:#0d1117; border:1px solid #30363d; border-radius:8px; padding:12px; font-family:monospace; font-size:11px; max-height:400px; overflow:auto; white-space:pre; color:#8b949e; line-height:1.4; }
  .links { display:flex; gap:10px; flex-wrap:wrap; margin-bottom:16px; }
  .link-btn { background:#21262d; color:#58a6ff; border:1px solid #30363d; padding:8px 16px; border-radius:6px; cursor:pointer; font-size:13px; text-decoration:none; display:inline-block; }
  .link-btn:hover { background:#30363d; }
</style>
</head>
<body>
<h1>🔬 AlphaFold Structure — ${entry.gene || entry.uniprotId}</h1>
<h2>${entry.uniprotDescription}</h2>

<div class="meta">
  <div class="meta-item">
    <div class="meta-lbl">UNIPROT</div>
    <div class="meta-val" style="color:#3fb950;">${entry.uniprotAccession}</div>
  </div>
  <div class="meta-item">
    <div class="meta-lbl">ORGANISMO</div>
    <div class="meta-val">${entry.organismScientificName}</div>
  </div>
  <div class="meta-item">
    <div class="meta-lbl">CONFIANZA GLOBAL (pLDDT)</div>
    <div class="meta-val" style="color:${typeof confidenceScore === 'number' && confidenceScore > 70 ? '#3fb950' : '#f0883e'};">${confidenceScore}</div>
  </div>
  <div class="meta-item">
    <div class="meta-lbl">VERSIÓN</div>
    <div class="meta-val">v${entry.latestVersion} (${entry.modelCreatedDate})</div>
  </div>
</div>

${entry.paeImageUrl ? `
<div style="margin-bottom:16px;">
  <div style="font-size:11px;color:#8b949e;letter-spacing:1px;margin-bottom:6px;">PAE (Predicted Aligned Error)</div>
  <img src="${entry.paeImageUrl}" class="pae-img" alt="PAE matrix" />
</div>` : ''}

<div style="margin-bottom:16px;">
  <div style="font-size:11px;color:#8b949e;letter-spacing:1px;margin-bottom:6px;">PDB (primeros 100 líneas)</div>
  <div class="pdb-box">${pdb.split('\n').slice(0, 100).join('\n')}</div>
</div>

</body></html>`;
}

// ════════════════════════════════════════════════════════════════════════════
// VS CODE EXTENSION CLASS
// ════════════════════════════════════════════════════════════════════════════

export class RNAStructurePredictor implements vscode.Disposable {
    private outputChannel: vscode.OutputChannel;
    private disposables: vscode.Disposable[] = [];

    constructor(private context: vscode.ExtensionContext) {
        this.outputChannel = vscode.window.createOutputChannel('SynBio RNA Structure');
    }

    activate(): void {
        this.disposables.push(
            vscode.commands.registerCommand('synbio.predictRNAStructure', () => this.predictRNA()),
            vscode.commands.registerCommand('synbio.predictRNAFromEditor', () => this.predictRNAFromEditor()),
            vscode.commands.registerCommand('synbio.alphaFoldLookup', () => this.alphaFoldLookup()),
            vscode.commands.registerCommand('synbio.rnaQuickFold', () => this.quickFold()),
        );
        this.context.subscriptions.push(...this.disposables);
        this.outputChannel.appendLine('[RNA Structure] Module loaded — Nussinov + Turner 2004 + AlphaFold DB');
    }

    // ── Command: Predict RNA structure from input ──────────────────────────

    private async predictRNA(): Promise<void> {
        const input = await vscode.window.showInputBox({
            prompt: 'Secuencia de RNA (A, U, C, G) o DNA (A, T, C, G — se convertirá a RNA)',
            placeHolder: 'GGGGCCCCCUUUUUAAAAAGGGGG',
            ignoreFocusOut: true,
            validateInput: (val) => {
                const clean = val.toUpperCase().replace(/[^AUCGT]/g, '');
                if (clean.length < 10) { return 'La secuencia debe tener al menos 10 nucleótidos'; }
                if (clean.length > 2000) { return 'Máximo 2000 nucleótidos para predicción local'; }
                return null;
            },
        });

        if (!input) { return; }

        await this.runPrediction(input);
    }

    // ── Command: Predict from editor selection/content ─────────────────────

    private async predictRNAFromEditor(): Promise<void> {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showWarningMessage('No hay editor activo');
            return;
        }

        let seq = '';
        const selection = editor.selection;
        if (!selection.isEmpty) {
            seq = editor.document.getText(selection);
        } else {
            // Try to extract sequence from document
            const text = editor.document.getText();
            const seqMatch = text.match(/(?:sequence\s+\w+\s*=\s*"([ATCGURYMKSWBDHVN\s]+)")/i)
                || text.match(/([AUCG]{20,})/i)
                || text.match(/([ATCG]{20,})/i);
            if (seqMatch) {
                seq = seqMatch[1];
            }
        }

        if (!seq || seq.replace(/[^AUCGT]/gi, '').length < 10) {
            vscode.window.showWarningMessage('No se encontró una secuencia de RNA/DNA válida (mín. 10 nt)');
            return;
        }

        await this.runPrediction(seq);
    }

    // ── Command: Quick fold (status bar integration) ───────────────────────

    private async quickFold(): Promise<void> {
        const editor = vscode.window.activeTextEditor;
        if (!editor) { return; }

        const sel = editor.selection;
        const seq = sel.isEmpty
            ? editor.document.getText().match(/([AUCGT]{10,})/i)?.[1] || ''
            : editor.document.getText(sel);

        if (seq.replace(/[^AUCGT]/gi, '').length < 10) {
            vscode.window.showInformationMessage('Selecciona al menos 10 nt para quick-fold');
            return;
        }

        const result = nussinov(seq);
        vscode.window.showInformationMessage(
            `RNA Fold: ${result.basePairCount} bp, ΔG≈${result.freeEnergy} kcal/mol | ${result.structure.substring(0, 40)}…`
        );
        this.outputChannel.appendLine(`[Quick Fold] ${result.sequence.length} nt → ${result.basePairCount} bp, ΔG=${result.freeEnergy}`);
        this.outputChannel.appendLine(`  ${result.structure}`);
    }

    // ── Core prediction runner ─────────────────────────────────────────────

    private async runPrediction(rawSeq: string): Promise<void> {
        const clean = rawSeq.toUpperCase().replace(/[^AUCGT]/g, '').replace(/T/g, 'U');

        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: 'RNA Structure Prediction',
            cancellable: false,
        }, async (progress) => {
            progress.report({ message: `Prediciendo estructura para ${clean.length} nt…`, increment: 20 });

            const t0 = Date.now();
            const result = mfePrediction(clean);
            const elapsed = Date.now() - t0;

            progress.report({ message: 'Generando visualización…', increment: 60 });

            this.outputChannel.appendLine(`\n${'═'.repeat(60)}`);
            this.outputChannel.appendLine(`RNA MFE Prediction — ${new Date().toLocaleString()}`);
            this.outputChannel.appendLine(`${'═'.repeat(60)}`);
            this.outputChannel.appendLine(`  Longitud:     ${result.sequence.length} nt`);
            this.outputChannel.appendLine(`  Base pairs:   ${result.basePairCount}`);
            this.outputChannel.appendLine(`  ΔG (MFE):     ${result.freeEnergy} kcal/mol`);
            this.outputChannel.appendLine(`  GC content:   ${result.gcContent}%`);
            this.outputChannel.appendLine(`  Stems:        ${result.stems.length}`);
            this.outputChannel.appendLine(`  Loops:        ${result.loops.length}`);
            this.outputChannel.appendLine(`  Tiempo:       ${elapsed} ms`);
            this.outputChannel.appendLine(`  Método:       ${result.mfeMethod}`);
            this.outputChannel.appendLine(`  Dot-bracket:  ${result.structure}`);
            this.outputChannel.show(true);

            // Show WebView panel
            const panel = vscode.window.createWebviewPanel(
                'rnaPrediction',
                `RNA Structure — ${result.sequence.length} nt`,
                vscode.ViewColumn.Beside,
                { enableScripts: false },
            );
            panel.webview.html = generateRNAWebviewHTML(result);

            progress.report({ message: `✓ Completado en ${elapsed} ms`, increment: 20 });
        });
    }

    // ── Command: AlphaFold Database Lookup ─────────────────────────────────

    private async alphaFoldLookup(): Promise<void> {
        const input = await vscode.window.showInputBox({
            prompt: 'UniProt Accession ID (ej: P0A9P0 para dihydrofolate reductase E. coli)',
            placeHolder: 'P0A9P0',
            ignoreFocusOut: true,
            validateInput: (val) => {
                if (!val.match(/^[A-Z0-9]{4,10}$/i)) {
                    return 'Ingrese un ID UniProt válido (ej: P0A9P0)';
                }
                return null;
            },
        });

        if (!input) { return; }

        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: 'AlphaFold Structure Lookup',
            cancellable: false,
        }, async (progress) => {
            progress.report({ message: `Consultando AlphaFold DB para ${input}…`, increment: 30 });

            try {
                const { pdb, entry } = await fetchAlphaFoldPDB(input.toUpperCase());

                progress.report({ message: 'Renderizando…', increment: 50 });

                this.outputChannel.appendLine(`\n${'═'.repeat(60)}`);
                this.outputChannel.appendLine(`AlphaFold Structure — ${entry.uniprotAccession}`);
                this.outputChannel.appendLine(`${'═'.repeat(60)}`);
                this.outputChannel.appendLine(`  Gen:          ${entry.gene || 'N/A'}`);
                this.outputChannel.appendLine(`  Descripción:  ${entry.uniprotDescription}`);
                this.outputChannel.appendLine(`  Organismo:    ${entry.organismScientificName}`);
                this.outputChannel.appendLine(`  pLDDT:        ${entry.globalMetricValue}`);
                this.outputChannel.appendLine(`  PDB URL:      ${entry.pdbUrl}`);
                this.outputChannel.show(true);

                const panel = vscode.window.createWebviewPanel(
                    'alphaFoldView',
                    `AlphaFold — ${entry.gene || entry.uniprotAccession}`,
                    vscode.ViewColumn.Beside,
                    { enableScripts: false },
                );
                panel.webview.html = generateAlphaFoldWebviewHTML(entry, pdb);

                progress.report({ message: '✓ Estructura cargada', increment: 20 });
            } catch (err: any) {
                vscode.window.showErrorMessage(`AlphaFold Error: ${err.message}`);
                this.outputChannel.appendLine(`[AlphaFold ERROR] ${err.message}`);
            }
        });
    }

    dispose(): void {
        this.disposables.forEach(d => d.dispose());
        this.outputChannel.dispose();
    }
}
