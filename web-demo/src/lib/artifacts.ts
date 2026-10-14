// Browser ports of server/src/compiler/llvm_codegen.rs and targets.rs.
// They emit text from the compiled circuit. They do not invoke llc, a robot, or the Rust LSP.

import type { Circuit, GeneticPart, TranscriptionUnit } from './compiler';

export interface CostQuote {
  provider: string;
  pricePerBp: number;
  total: number;
  days: number;
  surcharge: number;
}

export interface CostReport {
  totalBp: number;
  assembly: number;
  cheapest: number;
  gcExtreme: boolean;
  quotes: CostQuote[];
  text: string;
}

function ident(value: string): string {
  const cleaned = value.replace(/[^A-Za-z0-9_]/g, '_');
  return /^[A-Za-z_]/.test(cleaned) ? cleaned : `_${cleaned}`;
}

function cdsOf(tu: TranscriptionUnit): GeneticPart | undefined {
  return tu.parts.find(part => part.type === 'cds' || part.type === 'reporter');
}

function partOf(tu: TranscriptionUnit, type: GeneticPart['type']): GeneticPart | undefined {
  return tu.parts.find(part => part.type === type);
}

function sequenceOf(part: GeneticPart | undefined): string {
  return part?.sequence ?? '';
}

export function regulatoryLinks(circuit: Circuit): { from: string; to: string; kind: 'repression' | 'activation' }[] {
  const names = new Set(circuit.transcriptionUnits.flatMap(tu => tu.parts.map(part => part.name)));
  const rules: { from: string[]; to: string; kind: 'repression' | 'activation' }[] = [
    { from: ['TetR', 'tetR'], to: 'pTet', kind: 'repression' },
    { from: ['LacI', 'lacI'], to: 'pLac', kind: 'repression' },
    { from: ['AraC'], to: 'pBad', kind: 'activation' },
    { from: ['LuxR'], to: 'pLux', kind: 'activation' },
    { from: ['LasR'], to: 'pLas', kind: 'activation' },
    { from: ['cI'], to: 'pR', kind: 'repression' },
  ];
  const links: { from: string; to: string; kind: 'repression' | 'activation' }[] = [];
  for (const rule of rules) {
    if (!names.has(rule.to)) continue;
    const from = rule.from.find(name => names.has(name));
    if (from) links.push({ from, to: rule.to, kind: rule.kind });
  }
  return links;
}

export function generateLlvmIr(circuit: Circuit): string {
  const name = ident(circuit.name || 'circuit');
  const lines: string[] = [
    '; ============================================================',
    '; BioScript LLVM IR — generated in the browser',
    `; Program: ${circuit.name}`,
    `; Host: ${circuit.chassisOrganism || 'unspecified'}`,
    '; This is textual IR. The browser does not run llc or the Rust LSP.',
    '; ============================================================',
    '',
    `source_filename = "${name}.bio"`,
    'target datalayout = "e-m:e-p:64:64-i64:64-f80:128-n8:16:32:64-S128"',
    'target triple = "wasm32-unknown-unknown"',
    '',
    '; ---- Biological Types ----',
    '%TUState = type { double, double, double }',
    '%HillParams = type { double, double, double }',
    '%CircuitState = type { double, [16 x %TUState] }',
    '%SimResult = type { double, double, i32 }',
    '',
    '; ---- Global Constants ----',
    '@ATP_PER_NUCLEOTIDE = private constant double 2.0',
    '@ATP_PER_AMINOACID = private constant double 4.0',
    '@MRNA_DEGRADATION_RATE = private constant double 0.0023',
    '@PROTEIN_DEGRADATION_RATE = private constant double 0.00019',
    '@RIBOSOME_SPEED = private constant double 15.0',
    '@RNAP_SPEED = private constant double 50.0',
    '',
  ];

  circuit.transcriptionUnits.forEach((tu, index) => {
    const prefix = `@${name}_TU${index}`;
    const promoter = partOf(tu, 'promoter');
    const rbs = partOf(tu, 'rbs');
    const cds = cdsOf(tu);
    const dna = sequenceOf(cds);
    lines.push(`; Constants for ${circuit.name} TU${index}`);
    lines.push(`${prefix}_promoter_strength = private constant double ${(promoter?.strength ?? 0.5).toFixed(6)}`);
    lines.push(`${prefix}_rbs_rate = private constant double ${(rbs?.strength ?? 0.5).toFixed(6)}`);
    lines.push(`${prefix}_cds_length = private constant i32 ${dna.length}`);
    lines.push(`${prefix}_protein_length = private constant i32 ${Math.floor(dna.length / 3)}`);
    if (dna.length > 0) {
      const bytes = [...dna].slice(0, 100).map(base => `i8 ${base.charCodeAt(0)}`);
      lines.push(`${prefix}_sequence = private constant [${bytes.length} x i8] [${bytes.join(', ')}]`);
    }
    lines.push('');
  });

  regulatoryLinks(circuit).forEach((link, index) => {
    const prefix = `@${name}_reg${index}`;
    lines.push(`${prefix}_kind = private constant i8 ${link.kind === 'repression' ? 0 : 1} ; ${link.from} -> ${link.to}`);
    lines.push(`${prefix}_hill_n = private constant double 2.000000`);
    lines.push(`${prefix}_k_half = private constant double 40.000000`);
  });

  lines.push('');
  lines.push('define private double @hill_activation(double %x, double %vmax, double %k, double %n) #0 {');
  lines.push('entry:');
  lines.push('  %x_n = call double @llvm.pow.f64(double %x, double %n)');
  lines.push('  %k_n = call double @llvm.pow.f64(double %k, double %n)');
  lines.push('  %denom = fadd double %k_n, %x_n');
  lines.push('  %ratio = fdiv double %x_n, %denom');
  lines.push('  %result = fmul double %vmax, %ratio');
  lines.push('  ret double %result');
  lines.push('}');
  lines.push('');
  lines.push('define private double @hill_repression(double %x, double %vmax, double %k, double %n) #0 {');
  lines.push('entry:');
  lines.push('  %x_n = call double @llvm.pow.f64(double %x, double %n)');
  lines.push('  %k_n = call double @llvm.pow.f64(double %k, double %n)');
  lines.push('  %denom = fadd double %k_n, %x_n');
  lines.push('  %ratio = fdiv double %k_n, %denom');
  lines.push('  %result = fmul double %vmax, %ratio');
  lines.push('  ret double %result');
  lines.push('}');
  lines.push('');
  lines.push('declare double @llvm.pow.f64(double, double) #1');
  lines.push('');

  circuit.transcriptionUnits.forEach((tu, index) => {
    const promoter = partOf(tu, 'promoter');
    const cds = cdsOf(tu);
    const links = regulatoryLinks(circuit).filter(link => link.to === promoter?.name);
    lines.push(`; TU ${index}: ${cds?.name ?? 'empty'} via ${promoter?.name ?? 'no promoter'}`);
    if (links.length === 0) {
      lines.push(`define double @${name}_tu${index}_activity(double %time) #0 {`);
      lines.push('entry:');
      lines.push(`  ret double ${(promoter?.strength ?? 0.5).toFixed(6)}`);
      lines.push('}');
    } else {
      const params = ['double %time', ...links.map((_, j) => `double %reg${j}`)].join(', ');
      lines.push(`define double @${name}_tu${index}_activity(${params}) #0 {`);
      lines.push('entry:');
      lines.push(`  %basal = fadd double 0.0, ${(promoter?.strength ?? 0.5).toFixed(6)}`);
      let current = '%basal';
      links.forEach((link, j) => {
        const fn = link.kind === 'repression' ? '@hill_repression' : '@hill_activation';
        lines.push(`  %reg_effect${j} = call double ${fn}(double %reg${j}, double ${current}, double 40.000000, double 2.000000)`);
        current = `%reg_effect${j}`;
      });
      lines.push(`  ret double ${current}`);
      lines.push('}');
    }
    lines.push('');
  });

  if (circuit.killSwitch) {
    lines.push(`define i1 @${name}_kill_switch(i1 %trigger) #0 {`);
    lines.push('entry:');
    lines.push(`  ; mechanism ${circuit.killSwitch.mechanism || 'unspecified'}, delay ${circuit.killSwitch.delay || 'unspecified'}`);
    lines.push('  ret i1 %trigger');
    lines.push('}');
    lines.push('');
  }

  lines.push(`define i32 @main() #0 {`);
  lines.push('entry:');
  lines.push(`  ; ${circuit.transcriptionUnits.length} transcription units, ATP estimate ${circuit.atpCost.toFixed(1)}`);
  lines.push('  ret i32 0');
  lines.push('}');
  lines.push('');
  return lines.join('\n');
}

function ref(species: string): string {
  return `<speciesReference species="${species}" stoichiometry="1" constant="true"/>`;
}

type TranscriptionLaw =
  | { kind: 'constitutive' }
  | { kind: 'repress' | 'activate'; species: string };

/**
 * TetR inverters are Hill repression of an external input.
 * A pLac GFP cassette is Hill activation by IPTG.
 * Other regulatory links use the matching regulator species.
 */
function transcriptionLaw(circuit: Circuit, tu: TranscriptionUnit): TranscriptionLaw {
  const promoter = partOf(tu, 'promoter')?.name || '';
  const cds = (cdsOf(tu)?.name || '').toLowerCase();
  const promoterKey = promoter.toLowerCase();
  const circuitName = (circuit.name || '').toLowerCase();
  if (promoterKey.includes('plac') && (cds.includes('gfp') || circuitName.includes('gfp') || circuitName.includes('cassette'))) {
    return { kind: 'activate', species: 'IPTG' };
  }
  const tetInverter = cds.includes('tetr') && !promoterKey.includes('ptet') && !promoterKey.includes('plac') && !promoterKey.includes('pbad');
  if (circuitName.includes('inverter') || tetInverter) {
    return { kind: 'repress', species: 'input' };
  }
  const link = regulatoryLinks(circuit).find(item => item.to.toLowerCase() === promoterKey);
  if (link) {
    return {
      kind: link.kind === 'repression' ? 'repress' : 'activate',
      species: `regulator_${ident(link.from)}`,
    };
  }
  return { kind: 'constitutive' };
}

function hillMath(kind: 'repress' | 'activate', rate: string, signal: string): string {
  const numerator = kind === 'repress'
    ? '<apply><power/><ci>K_hill</ci><cn type="integer">2</cn></apply>'
    : `<apply><power/><ci>${signal}</ci><cn type="integer">2</cn></apply>`;
  return `<apply><times/><ci>${rate}</ci><ci>cell</ci><apply><divide/>${numerator}<apply><plus/><apply><power/><ci>K_hill</ci><cn type="integer">2</cn></apply><apply><power/><ci>${signal}</ci><cn type="integer">2</cn></apply></apply></apply></apply>`;
}

export function generateSbml(circuit: Circuit): string {
  const model = ident(circuit.name || 'circuit');
  const species: string[] = [];
  const parameters = [
    '      <parameter id="k_mRNA_deg" value="0.0023" constant="true"/>',
    '      <parameter id="k_prot_deg" value="0.00019" constant="true"/>',
    '      <parameter id="K_hill" value="10" constant="true"/>',
  ];
  const reactions: string[] = [];
  const signals = new Set<string>();
  circuit.transcriptionUnits.forEach((tu, index) => {
    const cds = cdsOf(tu);
    const id = ident(`${cds?.name || 'tu'}_${index}`);
    const txn = partOf(tu, 'promoter')?.strength ?? 0.5;
    const tln = partOf(tu, 'rbs')?.strength ?? 0.5;
    const law = transcriptionLaw(circuit, tu);
    species.push(`      <species id="mRNA_${id}" compartment="cell" initialAmount="0" hasOnlySubstanceUnits="false" boundaryCondition="false" constant="false"/>`);
    species.push(`      <species id="protein_${id}" compartment="cell" initialAmount="0" hasOnlySubstanceUnits="false" boundaryCondition="false" constant="false"/>`);
    parameters.push(`      <parameter id="k_txn_${id}" value="${txn.toFixed(6)}" constant="true"/>`);
    parameters.push(`      <parameter id="k_tln_${id}" value="${tln.toFixed(6)}" constant="true"/>`);
    const txnMath = law.kind === 'constitutive'
      ? `<apply><times/><ci>k_txn_${id}</ci><ci>cell</ci></apply>`
      : hillMath(law.kind, `k_txn_${id}`, law.species);
    if (law.kind !== 'constitutive') signals.add(law.species);
    const modifiers = law.kind === 'constitutive'
      ? ''
      : `<listOfModifiers><modifierSpeciesReference species="${law.species}"/></listOfModifiers>`;
    reactions.push(`      <reaction id="txn_${id}" reversible="false"><listOfProducts>${ref(`mRNA_${id}`)}</listOfProducts>${modifiers}<kineticLaw><math xmlns="http://www.w3.org/1998/Math/MathML">${txnMath}</math></kineticLaw></reaction>`);
    reactions.push(`      <reaction id="tln_${id}" reversible="false"><listOfReactants>${ref(`mRNA_${id}`)}</listOfReactants><listOfProducts>${ref(`mRNA_${id}`)}${ref(`protein_${id}`)}</listOfProducts><kineticLaw><math xmlns="http://www.w3.org/1998/Math/MathML"><apply><times/><ci>k_tln_${id}</ci><ci>mRNA_${id}</ci></apply></math></kineticLaw></reaction>`);
    reactions.push(`      <reaction id="mrna_deg_${id}" reversible="false"><listOfReactants>${ref(`mRNA_${id}`)}</listOfReactants><kineticLaw><math xmlns="http://www.w3.org/1998/Math/MathML"><apply><times/><ci>k_mRNA_deg</ci><ci>mRNA_${id}</ci></apply></math></kineticLaw></reaction>`);
    reactions.push(`      <reaction id="prot_deg_${id}" reversible="false"><listOfReactants>${ref(`protein_${id}`)}</listOfReactants><kineticLaw><math xmlns="http://www.w3.org/1998/Math/MathML"><apply><times/><ci>k_prot_deg</ci><ci>protein_${id}</ci></apply></math></kineticLaw></reaction>`);
  });
  for (const signal of signals) {
    species.push(`      <species id="${signal}" compartment="cell" initialAmount="0" hasOnlySubstanceUnits="false" boundaryCondition="true" constant="false"/>`);
  }
  const stepped = [...signals].filter(id => id === 'input' || id === 'IPTG');
  const events = stepped.length === 0 ? '' : `
    <listOfEvents>
      <event id="step_signal" useValuesFromTriggerTime="true">
        <trigger initialValue="false" persistent="true">
          <math xmlns="http://www.w3.org/1998/Math/MathML"><apply><gt/><csymbol encoding="text" definitionURL="http://www.sbml.org/sbml/symbols/time">time</csymbol><cn>300</cn></apply></math>
        </trigger>
        <listOfEventAssignments>
${stepped.map(id => `          <eventAssignment variable="${id}"><math xmlns="http://www.w3.org/1998/Math/MathML"><cn>100</cn></math></eventAssignment>`).join('\n')}
        </listOfEventAssignments>
      </event>
    </listOfEvents>`;
  return `<?xml version="1.0" encoding="UTF-8"?>
<sbml xmlns="http://www.sbml.org/sbml/level3/version2/core" level="3" version="2">
  <model id="${model}" name="${circuit.name}">
    <listOfCompartments>
      <compartment id="cell" spatialDimensions="3" size="1e-15" constant="true"/>
    </listOfCompartments>
    <listOfSpecies>
${species.join('\n')}
    </listOfSpecies>
    <listOfParameters>
${parameters.join('\n')}
    </listOfParameters>
    <listOfReactions>
${reactions.join('\n')}
    </listOfReactions>${events}
  </model>
</sbml>
`;
}

const WELLS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'].flatMap(row =>
  Array.from({ length: 12 }, (_, col) => `${row}${col + 1}`),
);

export function generateOpenTrons(circuit: Circuit): string {
  const parts = circuit.transcriptionUnits.flatMap(tu => tu.parts);
  const placed = parts.map((part, index) => ({ part, well: WELLS[index] })).filter(item => item.well);
  const lines = [
    '# Auto-generated by the browser compiler',
    '# Protocol: Golden Gate Assembly',
    `# Program: ${circuit.name}`,
    '# The browser writes this file. It does not connect to an OT-2.',
    '',
    'from opentrons import protocol_api',
    '',
    'metadata = {',
    `    'protocolName': 'SynBio Studio: ${circuit.name}',`,
    "    'author': 'SynBio Studio browser compiler',",
    "    'apiLevel': '2.15'",
    '}',
    '',
    'def run(protocol: protocol_api.ProtocolContext):',
    "    tip_rack = protocol.load_labware('opentrons_96_tiprack_20ul', '1')",
    "    tip_rack_300 = protocol.load_labware('opentrons_96_tiprack_300ul', '2')",
    "    parts_plate = protocol.load_labware('nest_96_wellplate_200ul_flat', '3')",
    "    rxn_plate = protocol.load_labware('nest_96_wellplate_200ul_flat', '6')",
    "    tube_rack = protocol.load_labware('opentrons_24_tuberack_eppendorf_1.5ml_safelock_snapcap', '9')",
    "    p20 = protocol.load_instrument('p20_single_gen2', 'left', tip_racks=[tip_rack])",
    "    p300 = protocol.load_instrument('p300_single_gen2', 'right', tip_racks=[tip_rack_300])",
    "    bsai_enzyme = tube_rack['A1']",
    "    t4_ligase = tube_rack['A2']",
    "    ligase_buffer = tube_rack['A3']",
    "    water = tube_rack['A4']",
  ];
  for (const item of placed) {
    const pyName = ident(item.part.name).toLowerCase();
    lines.push(`    part_${pyName} = parts_plate['${item.well}']  # ${item.part.name} (${item.part.type})`);
  }
  lines.push("    rxn_well = rxn_plate['A1']");
  lines.push("    p20.transfer(2, ligase_buffer, rxn_well, new_tip='always')");
  for (const item of placed) {
    lines.push(`    p20.transfer(1, part_${ident(item.part.name).toLowerCase()}, rxn_well, new_tip='always')`);
  }
  lines.push("    p20.transfer(1, bsai_enzyme, rxn_well, new_tip='always')");
  lines.push("    p20.transfer(1, t4_ligase, rxn_well, new_tip='always')");
  const water = Math.max(0, 20 - 2 - placed.length - 2);
  if (water > 0) lines.push(`    p20.transfer(${water.toFixed(1)}, water, rxn_well, new_tip='always')`);
  lines.push("    protocol.comment('30x (37C/5min -> 16C/5min), 50C/5min, 80C/10min')");
  lines.push('');
  return lines.join('\n');
}

export function generateHamilton(circuit: Circuit): string {
  const parts = circuit.transcriptionUnits.flatMap(tu => tu.parts);
  const rows = ['Source,Destination,Volume_uL,Part,Type'];
  parts.forEach((part, index) => {
    rows.push(`Parts_${WELLS[index] ?? 'NA'},Reaction_A1,1,${part.name},${part.type}`);
  });
  rows.push('Reagents_A1,Reaction_A1,2,T4_buffer,buffer');
  rows.push('Reagents_A2,Reaction_A1,1,BsaI,enzyme');
  return rows.join('\n');
}

function gcFraction(sequence: string): number {
  const seq = sequence.toUpperCase().replace(/[^ACGT]/g, '');
  if (!seq) return 0;
  const gc = [...seq].filter(base => base === 'G' || base === 'C').length;
  return gc / seq.length;
}

export function estimateCost(circuit: Circuit): CostReport {
  let totalBp = 0;
  let gcExtreme = false;
  for (const tu of circuit.transcriptionUnits) {
    for (const part of tu.parts) {
      totalBp += part.sequence?.length ?? 0;
      if ((part.type === 'cds' || part.type === 'reporter') && part.sequence) {
        const gc = gcFraction(part.sequence);
        if (gc > 0.65 || gc < 0.25) gcExtreme = true;
      }
    }
  }
  const surchargeRate = gcExtreme ? 0.15 : 0;
  const assembly = circuit.partCount * 15;
  const providers = [
    ['Twist Bioscience', 0.07, 15],
    ['IDT (gBlocks)', 0.10, 5],
    ['GenScript', 0.09, 10],
    ['Eurofins Genomics', 0.12, 12],
  ] as const;
  const quotes: CostQuote[] = providers.map(([provider, pricePerBp, days]) => ({
    provider,
    pricePerBp,
    days,
    surcharge: totalBp * pricePerBp * surchargeRate,
    total: totalBp * pricePerBp * (1 + surchargeRate),
  }));
  const cheapestSynthesis = quotes.reduce((min, quote) => Math.min(min, quote.total), Number.POSITIVE_INFINITY);
  const cheapest = (Number.isFinite(cheapestSynthesis) ? cheapestSynthesis : 0) + assembly;
  const header = [
    'DNA SYNTHESIS COST ESTIMATE',
    `Construct: ${totalBp} bp`,
    `Assembly reactions: $${assembly.toFixed(2)} (${circuit.partCount} parts x $15)`,
    gcExtreme ? 'CDS GC fraction is outside 0.25–0.65, so quotes include the 15% complexity surcharge from the Rust estimator.' : 'No CDS GC surcharge.',
    '',
    'Provider | $/bp | Total | Days',
    ...quotes.map(quote => `${quote.provider} | ${quote.pricePerBp.toFixed(3)} | $${quote.total.toFixed(2)} | ${quote.days}`),
    '',
    `Estimated total (cheapest synthesis + assembly): $${cheapest.toFixed(2)}`,
    'These are the estimator coefficients from server/src/compiler/targets.rs, not a live vendor quote.',
  ];
  return { totalBp, assembly, cheapest, gcExtreme, quotes, text: header.join('\n') };
}

export function generateProtocol(circuit: Circuit): string {
  const rows = circuit.transcriptionUnits.flatMap(tu => tu.parts.map(part =>
    `| ${part.name} | ${part.type} | ${part.sequence?.length ?? 0} bp |`,
  ));
  return `# Lab protocol: ${circuit.name}

*Generated from the compiled circuit. This file does not run a robot or a wet-lab step.*

**Host:** ${circuit.chassisOrganism || 'not declared'}

## Enzymes
- BsaI-HFv2 (NEB #R3733)
- T4 DNA Ligase (NEB #M0202)
- DpnI (NEB #R0176)

## DNA parts

| Part | Type | Length |
|------|------|--------|
${rows.join('\n') || '| — | — | — |'}

## Golden Gate
| Component | Volume |
|-----------|--------|
| 10x T4 Ligase Buffer | 2 µL |
| Each DNA part (~75 fmol) | 1 µL |
| BsaI-HFv2 | 1 µL |
| T4 DNA Ligase | 1 µL |
| Water | to 20 µL |

Thermocycler: 30 cycles of 37°C for 5 min and 16°C for 5 min, then 50°C for 5 min and 80°C for 10 min.

## Transformation
1. Add 5 µL of reaction to 50 µL competent cells.
2. Ice 30 min, 42°C for 45 s, ice 2 min.
3. Add 950 µL SOC, recover 1 h at 37°C, plate on selective agar.

${circuit.killSwitch ? `## Containment note\nParsed kill switch: trigger \`${circuit.killSwitch.trigger || 'unspecified'}\`, mechanism \`${circuit.killSwitch.mechanism || 'unspecified'}\`, delay \`${circuit.killSwitch.delay || 'unspecified'}\`. This is a design record, not authorization to run the experiment.\n` : ''}
`;
}

export interface ConstructNode {
  id: string;
  name: string;
  type: GeneticPart['type'];
  sequence: string;
}

export interface ConstructEdge {
  from: string;
  to: string;
  kind: 'adjacency' | 'transcription' | 'repression' | 'activation' | 'circular';
}

export function buildConstruct(circuit: Circuit, source: string): { nodes: ConstructNode[]; edges: ConstructEdge[] } {
  const nodes: ConstructNode[] = [];
  const edges: ConstructEdge[] = [];
  circuit.transcriptionUnits.forEach((tu, tuIndex) => {
    tu.parts.forEach((part, partIndex) => {
      const id = `${tuIndex}:${partIndex}:${part.name}`;
      nodes.push({ id, name: part.name, type: part.type, sequence: part.sequence ?? '' });
      if (partIndex > 0) {
        edges.push({ from: nodes[nodes.length - 2].id, to: id, kind: 'adjacency' });
      }
    });
    const promoter = tu.parts.findIndex(part => part.type === 'promoter');
    const cds = tu.parts.findIndex(part => part.type === 'cds' || part.type === 'reporter');
    if (promoter >= 0 && cds >= 0 && promoter !== cds - 1 && promoter !== cds) {
      const from = nodes[nodes.length - tu.parts.length + promoter];
      const to = nodes[nodes.length - tu.parts.length + cds];
      if (from && to) edges.push({ from: from.id, to: to.id, kind: 'transcription' });
    }
  });
  for (const link of regulatoryLinks(circuit)) {
    const from = nodes.find(node => node.name === link.from);
    const to = nodes.find(node => node.name === link.to);
    if (from && to) edges.push({ from: from.id, to: to.id, kind: link.kind });
  }
  if (/plasmid/i.test(source) && nodes.length > 2) {
    edges.push({ from: nodes[nodes.length - 1].id, to: nodes[0].id, kind: 'circular' });
  }
  return { nodes, edges };
}
