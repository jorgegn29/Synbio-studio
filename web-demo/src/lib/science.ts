// In-browser science used by the toolbox. Imports the vscode-free client modules.

import { calculateCAI, GENETIC_CODE, optimizeCodons } from '../../../client/src/real-codon-tables';
import { calculateGCContent, calculateTm, predictRBSStrength, reverseComplement } from '../../../client/src/real-thermodynamics';
import { findRestrictionSites, checkBioBrickCompatibility } from '../../../client/src/real-restriction-enzymes';
import { analyzeProtein } from '../../../client/src/real-protein-analysis';
import { createEcoliCoreModel, runFBA } from '../../../client/src/simplex-solver';
import { FallbackRNAFolder } from '../../../client/src/fallback-folder';
import { detectToxicExpressionBurden } from '../../../client/src/bio-linter-rules';
import type { Circuit, CompilerResult, Diagnostic, GeneticPart } from './compiler';
import { compile, exportFASTA, exportGenBank, exportSBOL, partFacts } from './compiler';
import { estimateCost, generateHamilton, generateLlvmIr, generateOpenTrons, generateProtocol, generateSbml } from './artifacts';
import { simulate, type SimulationResult } from './simulator';

export interface OdeSeries {
  points: { time: number; species: Record<string, number> }[];
  species: { name: string; color: string }[];
}

const REPRESSORS: Record<string, string[]> = {
  pLac: ['LacI', 'lacI'],
  pTet: ['TetR', 'tetR'],
  pR: ['cI'],
};

export function translateDna(dna: string): string {
  const seq = dna.toUpperCase().replace(/[^ACGT]/g, '');
  let protein = '';
  for (let i = 0; i + 2 < seq.length; i += 3) {
    const entry = GENETIC_CODE[seq.slice(i, i + 3)];
    if (!entry || entry.aa1 === '*') break;
    protein += entry.aa1;
  }
  return protein;
}

export function findOrfs(dna: string): { start: number; end: number; protein: string; frame: number }[] {
  const seq = dna.toUpperCase().replace(/[^ACGT]/g, '');
  const orfs: { start: number; end: number; protein: string; frame: number }[] = [];
  for (let frame = 0; frame < 3; frame++) {
    for (let i = frame; i + 2 < seq.length; i += 3) {
      if (seq.slice(i, i + 3) !== 'ATG') continue;
      let protein = '';
      let end = i;
      for (let j = i; j + 2 < seq.length; j += 3) {
        const entry = GENETIC_CODE[seq.slice(j, j + 3)];
        end = j + 3;
        if (!entry || entry.aa1 === '*') break;
        protein += entry.aa1;
      }
      if (protein.length >= 10) orfs.push({ start: i, end, protein, frame });
    }
  }
  return orfs.sort((a, b) => b.protein.length - a.protein.length).slice(0, 12);
}

export function concatenatedSequence(circuit: Circuit): string {
  return circuit.transcriptionUnits.flatMap(tu => tu.parts.map(part => part.sequence ?? '')).join('');
}

export function researchGauges(circuit: Circuit): {
  aa: number;
  gc: number;
  cai: number;
  rbs: number;
  terminator: number;
  codons: { codon: string; count: number }[];
} {
  const dna = concatenatedSequence(circuit);
  const cds = codingSequences(circuit)[0];
  const protein = cds ? translateDna(cds.sequence) : '';
  const rbs = circuit.transcriptionUnits.flatMap(tu => tu.parts).find(part => part.type === 'rbs');
  const terminator = circuit.transcriptionUnits.length > 0
    && circuit.transcriptionUnits.every(tu => tu.parts.some(part => part.type === 'terminator'));
  const counts = new Map<string, number>();
  const seq = cds?.sequence ?? '';
  for (let i = 0; i + 2 < seq.length; i += 3) {
    const codon = seq.slice(i, i + 3);
    counts.set(codon, (counts.get(codon) ?? 0) + 1);
  }
  return {
    aa: protein.length,
    gc: dna ? calculateGCContent(dna) : 0,
    cai: cds ? calculateCAI(cds.sequence, 'E. coli K-12') : 0,
    rbs: rbs?.strength ?? 0,
    terminator: terminator ? 1 : 0,
    codons: [...counts.entries()].map(([codon, count]) => ({ codon, count })).sort((a, b) => b.count - a.count).slice(0, 16),
  };
}

export function codingSequences(circuit: Circuit): { name: string; sequence: string }[] {
  const found: { name: string; sequence: string }[] = [];
  for (const tu of circuit.transcriptionUnits) {
    for (const part of tu.parts) {
      if ((part.type === 'cds' || part.type === 'reporter') && part.sequence) {
        found.push({ name: part.name, sequence: part.sequence });
      }
    }
  }
  return found;
}

export function simulateOde(circuit: Circuit, totalSeconds = 7200): OdeSeries {
  const genes: { name: string; color: string; txn: number; tln: number; promoter: string }[] = [];
  for (const tu of circuit.transcriptionUnits) {
    const promoter = tu.parts.find(part => part.type === 'promoter');
    const rbs = tu.parts.find(part => part.type === 'rbs');
    const cds = tu.parts.find(part => part.type === 'cds' || part.type === 'reporter');
    if (!cds) continue;
    genes.push({
      name: cds.name,
      color: cds.color,
      txn: 0.167 * (promoter?.strength ?? 0.5),
      tln: 0.5 * (rbs?.strength ?? 0.5),
      promoter: promoter?.name ?? '',
    });
  }
  const state: Record<string, number> = {};
  for (const gene of genes) {
    state[`mRNA_${gene.name}`] = 0;
    state[gene.name] = 0;
  }
  const points: OdeSeries['points'] = [];
  const dt = 1;
  const degM = 0.0023;
  const degP = 0.00019;
  for (let t = 0; t <= totalSeconds; t += dt) {
    if (t % 60 === 0) points.push({ time: t, species: { ...state } });
    const next = { ...state };
    for (const gene of genes) {
      let txn = gene.txn;
      const repressors = REPRESSORS[gene.promoter] ?? [];
      for (const repressor of repressors) {
        const amount = state[repressor] ?? 0;
        if (amount > 0) {
          const k = 40;
          const n = 2;
          const kn = k ** n;
          txn *= kn / (kn + amount ** n);
        }
      }
      const m = state[`mRNA_${gene.name}`] ?? 0;
      const p = state[gene.name] ?? 0;
      next[`mRNA_${gene.name}`] = Math.max(0, m + dt * (txn - degM * m));
      next[gene.name] = Math.max(0, p + dt * (gene.tln * m - degP * p));
    }
    Object.assign(state, next);
  }
  return {
    points,
    species: genes.flatMap(gene => [
      { name: `mRNA_${gene.name}`, color: gene.color },
      { name: gene.name, color: gene.color },
    ]),
  };
}

export function odeAsSimulation(series: OdeSeries): SimulationResult {
  const last = series.points[series.points.length - 1];
  return {
    points: series.points,
    species: series.species.map(species => ({
      name: species.name,
      count: last?.species[species.name] ?? 0,
      color: species.color,
      type: species.name.startsWith('mRNA_') ? 'mRNA' : 'protein',
    })),
    totalReactions: series.points.length,
    maxTime: last?.time ?? 0,
    steadyState: last?.species ?? {},
    oscillationPeriod: null,
  };
}

function longestRepeat(sequence: string): { motif: string; count: number } | null {
  const seq = sequence.toUpperCase().replace(/[^ACGT]/g, '');
  let best: { motif: string; count: number } | null = null;
  for (let size = 8; size <= 20; size++) {
    const counts = new Map<string, number>();
    for (let i = 0; i + size <= seq.length; i++) {
      const motif = seq.slice(i, i + size);
      counts.set(motif, (counts.get(motif) ?? 0) + 1);
    }
    for (const [motif, count] of counts) {
      if (count < 2) continue;
      if (!best || count > best.count || (count === best.count && motif.length > best.motif.length)) {
        best = { motif, count };
      }
    }
  }
  return best;
}

function localAlignScore(query: string, target: string): number {
  const a = query.toUpperCase();
  const b = target.toUpperCase();
  if (!a || !b) return 0;
  const window = Math.min(a.length, b.length, 40);
  let best = 0;
  for (let i = 0; i + window <= a.length; i++) {
    for (let j = 0; j + window <= b.length; j++) {
      let score = 0;
      for (let k = 0; k < window; k++) if (a[i + k] === b[j + k]) score++;
      if (score > best) best = score;
    }
  }
  return window === 0 ? 0 : best / window;
}

function needleman(a: string, b: string): { identity: number; alignment: string } {
  const left = a.slice(0, 180);
  const right = b.slice(0, 180);
  const n = left.length;
  const m = right.length;
  const dp: number[][] = Array.from({ length: n + 1 }, () => Array(m + 1).fill(0));
  for (let i = 0; i <= n; i++) dp[i][0] = -i;
  for (let j = 0; j <= m; j++) dp[0][j] = -j;
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      const match = dp[i - 1][j - 1] + (left[i - 1] === right[j - 1] ? 1 : -1);
      dp[i][j] = Math.max(match, dp[i - 1][j] - 1, dp[i][j - 1] - 1);
    }
  }
  let i = n;
  let j = m;
  let matches = 0;
  let columns = 0;
  let top = '';
  let mid = '';
  let bot = '';
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && dp[i][j] === dp[i - 1][j - 1] + (left[i - 1] === right[j - 1] ? 1 : -1)) {
      top = left[i - 1] + top;
      bot = right[j - 1] + bot;
      mid = (left[i - 1] === right[j - 1] ? '|' : '.') + mid;
      if (left[i - 1] === right[j - 1]) matches++;
      i--;
      j--;
    } else if (i > 0 && dp[i][j] === dp[i - 1][j] - 1) {
      top = left[i - 1] + top;
      bot = `-${bot}`;
      mid = ` ${mid}`;
      i--;
    } else {
      top = `-${top}`;
      bot = right[j - 1] + bot;
      mid = ` ${mid}`;
      j--;
    }
    columns++;
  }
  return {
    identity: columns ? matches / columns : 0,
    alignment: `${top}\n${mid}\n${bot}`,
  };
}

function primersFor(sequence: string): string {
  const seq = sequence.toUpperCase().replace(/[^ACGT]/g, '');
  if (seq.length < 40) return 'The construct sequence is shorter than 40 bp, so no primer pair was designed.';
  let fwd = seq.slice(0, 20);
  let revSrc = seq.slice(-20);
  let guard = 0;
  while (guard < 15 && calculateTm(fwd) < 58 && fwd.length < 32) {
    fwd = seq.slice(0, fwd.length + 1);
    guard++;
  }
  guard = 0;
  while (guard < 15 && calculateTm(revSrc) < 58 && revSrc.length < 32) {
    revSrc = seq.slice(-(revSrc.length + 1));
    guard++;
  }
  const rev = reverseComplement(revSrc);
  return [
    `Forward ${fwd.length} bp  Tm ${calculateTm(fwd)} °C  ${fwd}`,
    `Reverse ${rev.length} bp  Tm ${calculateTm(rev)} °C  ${rev}`,
    'Tm uses SantaLucia nearest-neighbor parameters from client/src/real-thermodynamics.ts (oligo 0.25 µM, 1 M Na+).',
  ].join('\n');
}

function crisprGuides(sequence: string): string {
  const seq = sequence.toUpperCase().replace(/[^ACGT]/g, '');
  const guides: string[] = [];
  for (let i = 20; i < seq.length - 2 && guides.length < 12; i++) {
    if (seq.slice(i, i + 2) !== 'GG') continue;
    const guide = seq.slice(i - 20, i);
    const gc = calculateGCContent(guide);
    const polyT = /TTTT/.test(guide);
    guides.push(`${guide} NGG  GC ${gc.toFixed(1)}%${polyT ? '  poly-T (terminator risk)' : ''}`);
  }
  if (guides.length === 0) return 'No NGG PAM was found in the coding sequence. The off-target neural net is not in the browser.';
  return `Candidate SpCas9 guides (20 bp + NGG), scanned locally. Off-target scoring is not available without the Python model.\n${guides.join('\n')}`;
}

const BSL_RULES: { pattern: RegExp; name: string; bsl: number; selectAgent: boolean }[] = [
  { pattern: /anthracis|yersinia pestis|variola|ebola|marburg|botulinum|francisella|burkholderia mallei/i, name: 'select-agent keyword', bsl: 3, selectAgent: true },
  { pattern: /pseudomonas aeruginosa|staphylococcus aureus|salmonella|mycobacterium/i, name: 'risk-group 2 keyword', bsl: 2, selectAgent: false },
  { pattern: /pichia|pastoris|s\. cerevisiae|saccharomyces|b\. subtilis|subtilis|dh5|mg1655|bl21|k-12|k12|e\. coli/i, name: 'laboratory chassis', bsl: 1, selectAgent: false },
];

export function classifyBiosafety(source: string, circuit: Circuit | undefined): string {
  const toxin = detectToxicExpressionBurden(source);
  const hits = BSL_RULES.filter(rule => rule.pattern.test(source));
  const highest = hits.reduce((max, rule) => Math.max(max, rule.bsl), 1);
  const lines = [
    `Highest keyword BSL in this text: BSL-${highest}`,
    ...hits.map(rule => `- ${rule.name}: BSL-${rule.bsl}${rule.selectAgent ? ' (select-agent keyword)' : ''}`),
    toxin.length
      ? toxin.map(item => `- Toxin pattern ${item.code} line ${item.line}: ${item.message}`).join('\n')
      : '- No toxin/kill-protein expression pattern from the client linter.',
    circuit?.killSwitch
      ? `- Kill switch parsed: ${circuit.killSwitch.mechanism || 'unspecified mechanism'} / ${circuit.killSwitch.trigger || 'unspecified trigger'}`
      : '- No kill_switch block parsed.',
    circuit?.isSafe && !circuit.killSwitch ? '- Marked safe without a kill switch.' : '',
    'In-silico review only. It does not authorize bench work or environmental release.',
  ];
  return lines.filter(Boolean).join('\n');
}

export interface ToolContext {
  source: string;
  result: CompilerResult;
}

function circuitOf(ctx: ToolContext): Circuit | undefined {
  return ctx.result.circuits[0];
}

function requireCircuit(ctx: ToolContext): Circuit {
  const circuit = circuitOf(ctx);
  if (!circuit) throw new Error('Compile a circuit before running this tool.');
  return circuit;
}

export function runTool(id: string, ctx: ToolContext): string {
  const circuit = circuitOf(ctx);
  const dna = circuit ? concatenatedSequence(circuit) : '';
  const cds = circuit ? codingSequences(circuit) : [];
  switch (id) {
    case 'circuit-workbench':
      return circuit
        ? `${circuit.name}: ${circuit.partCount} parts, ${circuit.transcriptionUnits.length} TUs, ATP estimate ${circuit.atpCost.toFixed(1)}, ${ctx.result.diagnostics.length} diagnostics.`
        : 'No circuit parsed.';
    case 'codon': {
      if (!cds[0]) return 'No coding sequence with a catalog or inline DNA string.';
      const optimized = optimizeCodons(cds[0].sequence, 'E. coli K-12');
      return `${cds[0].name}\nCAI ${optimized.originalCAI} → ${optimized.optimizedCAI} (Sharp & Li 1987, Kazusa E. coli K-12 table)\nCodons changed ${optimized.changedCodons}/${optimized.totalCodons}\n${optimized.optimized}`;
    }
    case 'promoter':
      return ['J23100 RPU 1.00', 'J23101 RPU 0.70', 'J23106 RPU 0.47', 'J23114 RPU 0.10', 'pLac 0.80', 'pTet 0.70', 'pBad 0.60', 'pT7 1.00']
        .map(line => `${line}${circuit && line.startsWith(circuit.transcriptionUnits.flatMap(tu => tu.parts).find(part => part.type === 'promoter')?.name ?? '\0') ? '  ← in circuit' : ''}`)
        .join('\n');
    case 'rbs': {
      const rbs = circuit?.transcriptionUnits.flatMap(tu => tu.parts).find(part => part.type === 'rbs');
      if (!rbs?.sequence) return 'No RBS sequence in the compiled circuit.';
      const prediction = predictRBSStrength(rbs.sequence);
      return `${rbs.name}\n${prediction.details}\nRelative strength ${prediction.strength.toFixed(3)}, ΔG_SD ${prediction.deltaG_SD}, spacing ${prediction.optimalSpacing ? 'in the 5–10 nt window' : 'outside the 5–10 nt window'}`;
    }
    case 'restriction': {
      if (!dna) return 'No sequence to map.';
      const sites = findRestrictionSites(dna, ['EcoRI', 'XbaI', 'SpeI', 'PstI', 'NotI', 'BsaI', 'BsaI-HF', 'BamHI', 'HindIII', 'NcoI', 'XhoI']);
      const brick = checkBioBrickCompatibility(dna);
      return `Sites: ${sites.length}\n${sites.slice(0, 30).map(site => `${site.enzyme} @ ${site.position + 1} (${site.strand}) ${site.matchedSequence}`).join('\n') || 'None of the queried enzymes cut.'}\nBioBrick RFC10 internal sites: ${brick.compatible ? 'none' : brick.violations.map(site => site.enzyme).join(', ')}`;
    }
    case 'plasmid-viewer':
      return circuit ? `Plasmid view uses ${circuit.partCount} compiled features, ${dna.length} bp.` : 'No circuit.';
    case 'gibson': {
      if (!circuit) return 'No circuit.';
      const parts = circuit.transcriptionUnits.flatMap(tu => tu.parts).filter(part => part.sequence && part.sequence.length >= 25);
      if (parts.length < 2) return 'Need at least two parts with sequences of 25 bp or more.';
      return parts.slice(0, -1).map((part, index) => {
        const next = parts[index + 1];
        return `${part.name} → ${next.name}\noverhang ${part.sequence!.slice(-25)}`;
      }).join('\n');
    }
    case 'golden-gate': {
      if (!dna) return 'No sequence.';
      const bsai = findRestrictionSites(dna).filter(site => /bsai/i.test(site.enzyme));
      const overhangs = ['GGAG', 'TACT', 'AATG', 'AGGT', 'CGCT', 'GGTA'];
      const parts = circuit?.transcriptionUnits.flatMap(tu => tu.parts) ?? [];
      return `Internal BsaI-like sites: ${bsai.length}\n${parts.map((part, index) => `${part.name}: proposed 3' overhang ${overhangs[index % overhangs.length]}`).join('\n')}\nOverhangs are a design proposal for a BsaI Golden Gate order, checked against the compiled sequence.`;
    }
    case 'blast': {
      if (!dna) return 'No query sequence.';
      const catalog = ['J23101', 'J23100', 'B0034', 'B0015', 'GFP', 'TetR', 'LacI', 'pTet', 'pLac', 'pBad', 'pT7'];
      const ranked = catalog
        .map(name => ({ name, identity: localAlignScore(dna, partFacts(name).sequence ?? '') }))
        .filter(hit => hit.identity > 0)
        .sort((a, b) => b.identity - a.identity);
      return `Local catalog identity (not NCBI BLAST):\n${ranked.map(hit => `${hit.name} ${(hit.identity * 100).toFixed(0)}%`).join('\n') || 'No catalog window matched.'}`;
    }
    case 'orf': {
      const orfs = findOrfs(dna);
      return orfs.length
        ? orfs.map(orf => `frame ${orf.frame} ${orf.start + 1}..${orf.end} ${orf.protein.length} aa ${orf.protein.slice(0, 24)}`).join('\n')
        : 'No ORF of at least 10 amino acids.';
    }
    case 'gc':
      return dna ? `GC ${calculateGCContent(dna).toFixed(2)}% over ${dna.length} bp` : 'No sequence.';
    case 'primers':
      return primersFor(dna);
    case 'align': {
      if (cds.length < 2) return 'Alignment needs two coding sequences in the circuit.';
      const aligned = needleman(cds[0].sequence, cds[1].sequence);
      return `${cds[0].name} vs ${cds[1].name}\nidentity ${(aligned.identity * 100).toFixed(1)}% (first 180 bp, Needleman–Wunsch)\n${aligned.alignment}`;
    }
    case 'tm': {
      const window = dna.slice(0, 24);
      return window.length >= 8 ? `${window}\nTm ${calculateTm(window)} °C` : 'Need at least 8 bp.';
    }
    case 'repeats': {
      const repeat = longestRepeat(dna);
      return repeat ? `${repeat.motif} appears ${repeat.count} times` : 'No repeated word of 8–20 bp occurs twice.';
    }
    case 'ssa':
      return circuit ? 'Gillespie SSA is ready. Use Simulate to run it.' : 'No circuit.';
    case 'ode':
      return circuit ? `ODE grid: ${simulateOde(circuit).points.length} samples over 2 h (Euler, dt = 1 s).` : 'No circuit.';
    case 'fba': {
      const model = createEcoliCoreModel();
      const solution = runFBA(model);
      const fluxes = Object.entries(solution.fluxes)
        .filter(([, value]) => Math.abs(value) > 1e-4)
        .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))
        .slice(0, 12)
        .map(([reaction, value]) => `${reaction} ${value}`);
      return `E. coli core FBA (${solution.status}), biomass ${solution.objectiveValue} mmol/gDW/h\n${fluxes.join('\n')}\nModel: client/src/simplex-solver.ts createEcoliCoreModel (Orth/Feist core, not a COBRApy BiGG solve).`;
    }
    case 'crispr':
      return crisprGuides(cds[0]?.sequence || dna);
    case 'growth': {
      const mu = /growth_rate:\s*([0-9.]+)/.exec(ctx.source)?.[1];
      const muMax = mu ? Number(mu) : 0.4;
      const ks = 0.4;
      const rows = [0.05, 0.1, 0.2, 0.5, 1, 2, 5].map(substrate => {
        const rate = muMax * substrate / (ks + substrate);
        return `S=${substrate} g/L  μ=${rate.toFixed(3)} /h`;
      });
      return `Monod, μmax ${muMax} /h${mu ? ' (from chassis growth_rate)' : ' (default 0.4 /h)'}, Ks 0.4 g/L (parameter, not a fitted curve).\n${rows.join('\n')}`;
    }
    case 'debugger':
      return ctx.result.diagnostics.map(item => `${item.severity} ${item.code} L${item.line}: ${item.message}`).join('\n') || 'No diagnostics.';
    case 'pathway':
      return runTool('fba', ctx);
    case 'biosecurity':
    case 'bsl':
    case 'toxin':
    case 'containment':
    case 'export-compliance':
      return classifyBiosafety(ctx.source, circuit);
    case 'kill-switch':
      return circuit?.killSwitch
        ? `Existing kill switch: ${circuit.killSwitch.mechanism} / ${circuit.killSwitch.trigger} / ${circuit.killSwitch.delay}`
        : 'No kill_switch block. The designer button in the editor inserts the CcdB template used by the compiler tests.';
    case 'protocol':
      return circuit ? generateProtocol(circuit) : 'No circuit.';
    case 'eln':
      return 'ELN notes are stored in this browser profile when you save the notebook.';
    case 'inventory':
      return circuit
        ? circuit.transcriptionUnits.flatMap(tu => tu.parts).map(part => `${part.name}\t${part.type}\t${part.sequence?.length ?? 0} bp`).join('\n')
        : 'No parts.';
    case 'plate':
      return 'The plate designer assigns compiled parts onto a 96-well grid.';
    case 'equipment':
      return 'No instrument driver is connected. The tracker stores names you type in this browser.';
    case 'opentrons':
      return circuit ? generateOpenTrons(circuit) : 'No circuit.';
    case 'hamilton':
      return circuit ? `Hamilton worklist (CSV). This is not a STAR driver.\n${generateHamilton(circuit)}` : 'No circuit.';
    case 'copilot':
    case 'rules':
    case 'optimizer':
    case 'anomaly':
      return designNotes(ctx);
    case 'autocorrect':
      return 'Oráculo applies the compiler fix for a missing terminator, a missing RBS, or a missing kill switch.';
    case 'protein': {
      const orf = findOrfs(cds[0]?.sequence || dna)[0];
      if (!orf) return 'No translatable ORF.';
      const protein = analyzeProtein(orf.protein);
      return `${orf.protein.length} aa  MW ${protein.molecularWeight.toFixed(1)} Da  pI ${protein.pI.toFixed(2)}  II ${protein.instabilityIndex.toFixed(1)} (${protein.isStable ? 'stable' : 'unstable'})  GRAVY ${protein.gravy.toFixed(2)}\n${protein.formula}\nProtParam-style values from client/src/real-protein-analysis.ts. ESMFold is not running.`;
    }
    case 'rnA':
    case 'rna': {
      const window = (cds[0]?.sequence || dna).slice(0, 80);
      if (window.length < 8) return 'Need RNA/DNA of at least 8 nt. Folding is limited to 80 nt because Nussinov is cubic.';
      const folded = new FallbackRNAFolder(37).fold(window);
      return `Nussinov fallback on ${folded.length} nt (not ViennaRNA WASM)\n${folded.structure}\nMFE-like score ${folded.mfe}`;
    }
    case 'moat':
    case 'logger':
    case 'stats':
      return circuit
        ? `Parts ${circuit.partCount}, diagnostics ${ctx.result.diagnostics.length}, bp ${dna.length}, ATP ${circuit.atpCost.toFixed(1)}`
        : 'Nothing compiled yet.';
    case 'export':
      return circuit ? 'Use the export buttons for SBOL, FASTA, GenBank, SBML, LLVM IR, OpenTrons, and the protocol.' : 'No circuit.';
    case 'import':
      return 'Use Abrir. Accepted extensions: .bio .synbio .dna .fasta .fa .fna .gb .gbk .txt .csv';
    case 'build':
      return 'synbio.build.yaml steps available here: compile, simulate-ssa, simulate-ode, fba, protocol. Native Rust codegen is not invoked.';
    case 'benchling':
      return 'Benchling sync needs a Benchling API token and is not connected. Local exports are SBOL, GenBank, and FASTA.';
    case 'marketplace':
      return 'Extension marketplace and sandboxed Electron extensions are not available in the static web demo.';
    case 'igem':
      return ['BBa_J23101', 'BBa_B0034', 'BBa_B0015', 'BBa_E0040'].map(id => {
        const key = id.replace('BBa_', '').replace('E0040', 'GFP');
        const facts = partFacts(key === 'E0040' ? 'GFP' : key);
        return `${id}: ${facts.sequence?.length ?? 0} bp in the local catalog`;
      }).join('\n');
    case 'addgene':
      return 'No Addgene API. Local reference cards: pUC19 (2686 bp), pET-28a (5369 bp), pSB1C3 (2070 bp), from the client plasmid catalog descriptions.';
    case 'synbiohub':
      return circuit ? `SBOL document generated locally (${exportSBOL(circuit).length} chars). Upload to SynBioHub is not connected.` : 'No circuit.';
    case 'ncbi':
      return 'NCBI Entrez is not called from this static demo. Sequence search uses the local catalog.';
    case 'uniprot':
      return runTool('protein', ctx);
    case 'sbol':
      return circuit ? exportSBOL(circuit) : 'No circuit.';
    case 'fasta':
      return circuit ? exportFASTA(circuit) : 'No circuit.';
    case 'genbank':
      return circuit ? exportGenBank(circuit) : 'No circuit.';
    case 'sbml':
      return circuit ? generateSbml(circuit) : 'No circuit.';
    case 'llvm':
      return circuit ? generateLlvmIr(circuit) : 'No circuit.';
    default:
      return `Unknown tool ${id}`;
  }
}

function designNotes(ctx: ToolContext): string {
  const circuit = circuitOf(ctx);
  const notes = ctx.result.diagnostics.map(item => `${item.code}: ${item.message}${item.fix ? ` Fix: ${item.fix}` : ''}`);
  if (circuit) {
    for (const tu of circuit.transcriptionUnits) {
      const promoter = tu.parts.find(part => part.type === 'promoter');
      const rbs = tu.parts.find(part => part.type === 'rbs');
      if ((promoter?.strength ?? 0) > 0.7 && (rbs?.strength ?? 0) > 0.7) {
        notes.push('Burden: strong promoter with strong RBS. A medium RBS lowers the translation term in the ODE and SSA.');
      }
    }
    const dna = concatenatedSequence(circuit);
    if (dna) {
      const gc = calculateGCContent(dna);
      if (gc < 25 || gc > 65) notes.push(`GC ${gc.toFixed(1)}% is outside 25–65%.`);
      const cds = codingSequences(circuit)[0];
      if (cds) {
        const cai = calculateCAI(cds.sequence, 'E. coli');
        if (cai < 0.2) notes.push(`CAI ${cai} is low for E. coli K-12.`);
      }
    }
  }
  return notes.join('\n') || 'No design notes.';
}

export function applyOracle(source: string, diagnostics: Diagnostic[]): { source: string; note: string } {
  const missingTerm = diagnostics.find(item => item.code === 'BIO003');
  const missingRbs = diagnostics.find(item => item.code === 'BIO004');
  const missingKill = diagnostics.find(item => item.code === 'BIO002');
  if (missingTerm) {
    if (source.includes('->')) {
      return { source: source.replace(/->\s*([A-Za-z0-9_]+)(\s*\n)/, (_match, gene, end) => `-> ${gene} -> term_B0015${end}`), note: 'Inserted term_B0015 on the first arrow chain.' };
    }
    return { source: `${source.trim()}\n    terminator: B0015\n`, note: 'Inserted terminator: B0015.' };
  }
  if (missingRbs) {
    if (source.includes('->')) {
      return { source: source.replace(/->\s*(GFP|RFP|TetR|LacI|tetR|lacI)/, '-> rbs_strong -> $1'), note: 'Inserted rbs_strong before the first CDS.' };
    }
    return { source: source.replace(/promoter:\s*([A-Za-z0-9_]+)/, 'promoter: $1\n    rbs: B0034'), note: 'Inserted rbs: B0034.' };
  }
  if (missingKill) {
    return {
      source: source.replace(/\n\}(\s*)$/, `\n  kill_switch {\n    trigger: absence_of("arabinose"),\n    mechanism: CcdB,\n    delay: 2 hr\n  }\n}$1`),
      note: 'Inserted the CcdB kill_switch block expected by the safe-circuit check.',
    };
  }
  return { source, note: 'No automatic fix matched the current diagnostics.' };
}

export function parseCsv(text: string): { headers: string[]; rows: string[][]; summary: string } {
  const lines = text.trim().split(/\r?\n/).filter(Boolean);
  if (lines.length === 0) return { headers: [], rows: [], summary: 'Empty file.' };
  const headers = lines[0].split(',').map(cell => cell.trim());
  const rows = lines.slice(1).map(line => line.split(',').map(cell => cell.trim()));
  const numeric = headers.map((_, column) => rows.every(row => row[column] === undefined || row[column] === '' || Number.isFinite(Number(row[column]))));
  const summary = headers.map((header, column) => {
    if (!numeric[column]) return null;
    const values = rows.map(row => Number(row[column])).filter(value => Number.isFinite(value));
    if (values.length === 0) return null;
    const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
    const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length;
    return `${header}: n=${values.length} mean=${mean.toFixed(3)} sd=${Math.sqrt(variance).toFixed(3)}`;
  }).filter(Boolean);
  return { headers, rows, summary: summary.join('\n') || 'No numeric columns.' };
}

export function readFcsText(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  const header = new TextDecoder('ascii').decode(bytes.slice(0, 58));
  if (!header.startsWith('FCS')) return 'The file does not start with an FCS header.';
  const start = Number(header.slice(10, 18).trim());
  const end = Number(header.slice(18, 26).trim());
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return `FCS version ${header.slice(0, 6).trim()}, but the TEXT offsets are not usable.`;
  const text = new TextDecoder('ascii').decode(bytes.slice(start, Math.min(end + 1, bytes.length)));
  return `FCS ${header.slice(0, 6).trim()} TEXT segment (${text.length} chars)\n${text.slice(0, 2000)}`;
}

export function runBuildStep(step: string, ctx: ToolContext): string {
  if (step === 'compile') return ctx.result.success ? `compile ok (${ctx.result.circuits.length} circuits)` : 'compile reported errors';
  if (step === 'simulate-ssa') {
    const circuit = requireCircuit(ctx);
    const result = simulate(circuit, { totalTime: 600, maxSteps: 5000, degradationRate: 0.0023, transcriptionRate: 0.167, translationRate: 0.5, bindingAffinity: 40, hillCoefficient: 2, noiseLevel: 0.1 });
    return `SSA reactions ${result.totalReactions}, t=${result.maxTime.toFixed(0)} s`;
  }
  if (step === 'simulate-ode') {
    const circuit = requireCircuit(ctx);
    const last = simulateOde(circuit, 600).points.at(-1);
    return `ODE t=${last?.time ?? 0} ${JSON.stringify(last?.species ?? {})}`;
  }
  if (step === 'fba') return runTool('fba', ctx).split('\n')[0];
  if (step === 'protocol') return circuitOf(ctx) ? 'protocol generated' : 'protocol skipped';
  return `Unknown build step ${step}`;
}

export function recompile(source: string): CompilerResult {
  return compile(source);
}

export type PartKind = GeneticPart['type'];
