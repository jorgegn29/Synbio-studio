// ============================================================
// SynBio-LLVM BioScript Compiler — Browser Edition
// Full lexer + parser + validator + IR generator
// ============================================================

// ─── Types ───────────────────────────────────────────────────

export type Severity = 'error' | 'warning' | 'info';

export interface Diagnostic {
  line: number;
  col: number;
  endCol: number;
  severity: Severity;
  code: string;
  message: string;
  fix?: string;
}

export interface GeneticPart {
  id: string;
  type: 'promoter' | 'rbs' | 'cds' | 'terminator' | 'gene' | 'reporter';
  name: string;
  sequence?: string;
  strength?: number;
  color: string;
}

export interface TranscriptionUnit {
  parts: GeneticPart[];
  expressionLevel: number;
}

export interface KillSwitch {
  trigger: string;
  mechanism: string;
  delay: string;
}

export interface Circuit {
  name: string;
  isSafe: boolean;
  killSwitch: KillSwitch | null;
  transcriptionUnits: TranscriptionUnit[];
  connections: string[][];
  chassisName: string;
  chassisOrganism: string;
  atpCost: number;
  partCount: number;
}

export interface CompilerResult {
  success: boolean;
  diagnostics: Diagnostic[];
  circuits: Circuit[];
  parseTime: number;
  tokensCount: number;
  linesAnalyzed: number;
}

// ─── Token Types ─────────────────────────────────────────────

type TokenType =
  | 'keyword' | 'type' | 'identifier' | 'number' | 'string'
  | 'operator' | 'punctuation' | 'comment' | 'dna_sequence'
  | 'unit' | 'bio_function' | 'safety_keyword' | 'whitespace'
  | 'newline' | 'unknown';

interface Token {
  type: TokenType;
  value: string;
  line: number;
  col: number;
}

// ─── Keywords & Constants ────────────────────────────────────

const KEYWORDS = new Set([
  'circuit', 'gene', 'operon', 'plasmid', 'chassis', 'host',
  'import', 'from', 'let', 'mut', 'const', 'fn', 'struct',
  'if', 'else', 'when', 'match', 'for', 'while', 'loop',
  'return', 'break', 'continue', 'true', 'false',
]);

const SAFETY_KEYWORDS = new Set([
  'safe', 'unsafe', 'contained', 'kill_switch',
]);

const BIO_TYPES = new Set([
  'Promoter', 'RBS', 'CDS', 'Terminator', 'Gene', 'Protein',
  'RNA', 'DNA', 'Riboswitch', 'Aptamer', 'Circuit', 'Gate',
  'AND', 'OR', 'NOT', 'NOR', 'NAND', 'XOR',
  'Activator', 'Repressor', 'Inducer', 'Operator',
  'Host', 'Float', 'Integer', 'String', 'Bool',
]);

const BIO_FUNCTIONS = new Set([
  'express', 'repress', 'activate', 'inhibit', 'secrete',
  'sense', 'bind', 'absence_of', 'presence_of',
]);

const UNITS = new Set(['bp', 'kb', 'kDa', 'nM', 'uM', 'mM', 'hr', 'min', 'sec', 'AU', 'ppb']);

// ─── Known Parts Database ────────────────────────────────────

const KNOWN_PROMOTERS: Record<string, { strength: number; ref: string }> = {
  'pLac': { strength: 0.8, ref: 'Kelly et al. 2009' },
  'pTet': { strength: 0.7, ref: 'Kelly et al. 2009' },
  'pBad': { strength: 0.6, ref: 'Schleif 2000' },
  'pT7': { strength: 1.0, ref: 'Studier 1990' },
  'pLux': { strength: 0.5, ref: 'Schaefer et al. 1996' },
  'pConst': { strength: 0.9, ref: 'Anderson collection' },
  'arsR_promoter': { strength: 0.4, ref: 'Wu & Bhatt 2005' },
  'pPbr': { strength: 0.3, ref: 'Borremans et al. 2001' },
  'BBa_J23100': { strength: 1.0, ref: 'Anderson collection, Kelly 2009' },
  'BBa_J23101': { strength: 0.70, ref: 'Anderson collection' },
  'BBa_J23106': { strength: 0.47, ref: 'Anderson collection' },
  'BBa_J23114': { strength: 0.10, ref: 'Anderson collection' },
};

const KNOWN_RBS: Record<string, { strength: number }> = {
  'rbs_strong': { strength: 0.9 },
  'rbs_medium': { strength: 0.5 },
  'rbs_weak': { strength: 0.2 },
  'BBa_B0034': { strength: 1.0 },
  'BBa_B0032': { strength: 0.3 },
};

const KNOWN_REPORTERS = new Set([
  'GFP', 'RFP', 'BFP', 'YFP', 'mCherry', 'CFP', 'Venus', 'mCitrine',
]);

const KNOWN_GENES = new Set([
  'LacI', 'TetR', 'AraC', 'LuxR', 'LasR', 'cI', 'CcdB', 'MazF',
  'GFP', 'RFP', 'BFP', 'YFP', 'mCherry', 'CFP', 'Venus', 'mCitrine',
]);

const TERMINATORS = new Set([
  'term_T1', 'term_B0010', 'term_B0012', 'term_B0015',
  'term_L3S2P21', 'term_ECK120029600',
  'BBa_B0010', 'BBa_B0012', 'BBa_B0015',
]);

// ─── Lexer ───────────────────────────────────────────────────

function tokenize(source: string): Token[] {
  const tokens: Token[] = [];
  let line = 1;
  let col = 1;
  let i = 0;

  while (i < source.length) {
    // Newline
    if (source[i] === '\n') {
      tokens.push({ type: 'newline', value: '\n', line, col });
      line++;
      col = 1;
      i++;
      continue;
    }

    // Whitespace
    if (/\s/.test(source[i])) {
      col++;
      i++;
      continue;
    }

    // Line comment
    if (source[i] === '/' && source[i + 1] === '/') {
      const start = i;
      while (i < source.length && source[i] !== '\n') i++;
      tokens.push({ type: 'comment', value: source.slice(start, i), line, col });
      continue;
    }

    // Block comment
    if (source[i] === '/' && source[i + 1] === '*') {
      const start = i;
      const startLine = line;
      const startCol = col;
      i += 2;
      col += 2;
      while (i < source.length - 1 && !(source[i] === '*' && source[i + 1] === '/')) {
        if (source[i] === '\n') { line++; col = 1; } else { col++; }
        i++;
      }
      i += 2;
      col += 2;
      tokens.push({ type: 'comment', value: source.slice(start, i), line: startLine, col: startCol });
      continue;
    }

    // String literal
    if (source[i] === '"') {
      const start = i;
      const startCol = col;
      i++;
      col++;
      while (i < source.length && source[i] !== '"' && source[i] !== '\n') {
        i++;
        col++;
      }
      if (source[i] === '"') { i++; col++; }
      tokens.push({ type: 'string', value: source.slice(start, i), line, col: startCol });
      continue;
    }

    // Number
    if (/\d/.test(source[i])) {
      const start = i;
      const startCol = col;
      while (i < source.length && /[\d.]/.test(source[i])) { i++; col++; }
      tokens.push({ type: 'number', value: source.slice(start, i), line, col: startCol });
      continue;
    }

    // Identifier / keyword
    if (/[a-zA-Z_]/.test(source[i])) {
      const start = i;
      const startCol = col;
      while (i < source.length && /[a-zA-Z0-9_]/.test(source[i])) { i++; col++; }
      const value = source.slice(start, i);

      let type: TokenType = 'identifier';
      if (KEYWORDS.has(value)) type = 'keyword';
      else if (SAFETY_KEYWORDS.has(value)) type = 'safety_keyword';
      else if (BIO_TYPES.has(value)) type = 'type';
      else if (BIO_FUNCTIONS.has(value)) type = 'bio_function';
      else if (UNITS.has(value)) type = 'unit';

      tokens.push({ type, value, line, col: startCol });
      continue;
    }

    // DNA sequence (BBa_ identifiers)
    if (source[i] === 'B' && source.slice(i, i + 4) === 'BBa_') {
      const start = i;
      const startCol = col;
      while (i < source.length && /[a-zA-Z0-9_]/.test(source[i])) { i++; col++; }
      tokens.push({ type: 'identifier', value: source.slice(start, i), line, col: startCol });
      continue;
    }

    // Arrow operator
    if (source[i] === '-' && source[i + 1] === '>') {
      tokens.push({ type: 'operator', value: '->', line, col });
      i += 2;
      col += 2;
      continue;
    }

    // Operators and punctuation
    if ('+-*/<>=!&|'.includes(source[i])) {
      const startCol = col;
      let op = source[i];
      i++;
      col++;
      if (i < source.length && '=>&|'.includes(source[i])) {
        op += source[i];
        i++;
        col++;
      }
      tokens.push({ type: 'operator', value: op, line, col: startCol });
      continue;
    }

    if ('{}()[],:;.@#'.includes(source[i])) {
      tokens.push({ type: 'punctuation', value: source[i], line, col });
      i++;
      col++;
      continue;
    }

    // Unknown
    tokens.push({ type: 'unknown', value: source[i], line, col });
    i++;
    col++;
  }

  return tokens;
}

// ─── Parser & Validator ──────────────────────────────────────

function parseAndValidate(tokens: Token[]): { circuits: Circuit[]; diagnostics: Diagnostic[] } {
  const diagnostics: Diagnostic[] = [];
  const circuits: Circuit[] = [];

  // Filter meaningful tokens
  const meaningful = tokens.filter(t => t.type !== 'newline' && t.type !== 'whitespace' && t.type !== 'comment');

  let i = 0;
  let currentChassis = { name: '', organism: '' };

  while (i < meaningful.length) {
    const tok = meaningful[i];

    // Parse import
    if (tok.type === 'keyword' && tok.value === 'import') {
      i++;
      // Skip until next statement
      while (i < meaningful.length && meaningful[i].value !== ';' && !(meaningful[i].type === 'keyword' || meaningful[i].type === 'safety_keyword')) i++;
      if (i < meaningful.length && meaningful[i].value === ';') i++;
      continue;
    }

    // Parse chassis
    if (tok.type === 'keyword' && tok.value === 'chassis') {
      i++;
      if (i < meaningful.length && meaningful[i].type === 'identifier') {
        currentChassis.name = meaningful[i].value;
        i++;
      }
      // Skip colon and type
      while (i < meaningful.length && meaningful[i].value !== '{') i++;
      if (i < meaningful.length) i++; // skip {
      // Read chassis body
      let braces = 1;
      while (i < meaningful.length && braces > 0) {
        if (meaningful[i].value === 'organism' && i + 2 < meaningful.length) {
          currentChassis.organism = meaningful[i + 2].value.replace(/"/g, '');
        }
        if (meaningful[i].value === '{') braces++;
        if (meaningful[i].value === '}') braces--;
        i++;
      }
      continue;
    }

    // Parse circuit
    if ((tok.type === 'safety_keyword' && tok.value === 'safe') ||
        (tok.type === 'keyword' && tok.value === 'circuit')) {

      const isSafe = tok.value === 'safe';
      if (isSafe) {
        i++;
        if (i < meaningful.length && meaningful[i].value !== 'circuit') {
          diagnostics.push({
            line: tok.line, col: tok.col, endCol: tok.col + 4,
            severity: 'error', code: 'BIO001',
            message: "'safe' must be followed by 'circuit'",
          });
          continue;
        }
      }
      i++; // skip 'circuit'

      // Circuit name
      const circuitName = i < meaningful.length ? meaningful[i].value : 'Unknown';
      i++;

      // Skip to body
      while (i < meaningful.length && meaningful[i].value !== '{') i++;
      if (i < meaningful.length) i++; // skip {

      const circuit: Circuit = {
        name: circuitName,
        isSafe,
        killSwitch: null,
        transcriptionUnits: [],
        connections: [],
        chassisName: currentChassis.name,
        chassisOrganism: currentChassis.organism,
        atpCost: 0,
        partCount: 0,
      };

      // Parse circuit body
      let braces = 1;
      const bodyTokens: Token[] = [];
      while (i < meaningful.length && braces > 0) {
        if (meaningful[i].value === '{') braces++;
        if (meaningful[i].value === '}') braces--;
        if (braces > 0) bodyTokens.push(meaningful[i]);
        i++;
      }

      // Parse kill_switch
      const ksIdx = bodyTokens.findIndex(t => t.value === 'kill_switch');
      if (ksIdx !== -1) {
        const ks: KillSwitch = { trigger: '', mechanism: '', delay: '' };
        let j = ksIdx + 1;
        while (j < bodyTokens.length && bodyTokens[j].value !== '{') j++;
        j++; // skip {
        let ksBraces = 1;
        while (j < bodyTokens.length && ksBraces > 0) {
          if (bodyTokens[j].value === '{') ksBraces++;
          if (bodyTokens[j].value === '}') ksBraces--;
          if (bodyTokens[j].value === 'trigger' && j + 2 < bodyTokens.length) {
            // Read trigger value
            let triggerStr = '';
            let k = j + 2;
            while (k < bodyTokens.length && bodyTokens[k].value !== ',' && bodyTokens[k].value !== '}') {
              triggerStr += bodyTokens[k].value;
              k++;
            }
            ks.trigger = triggerStr;
          }
          if (bodyTokens[j].value === 'mechanism' && j + 2 < bodyTokens.length) {
            ks.mechanism = bodyTokens[j + 2].value;
          }
          if (bodyTokens[j].value === 'delay' && j + 2 < bodyTokens.length) {
            let delayStr = '';
            let k = j + 2;
            while (k < bodyTokens.length && bodyTokens[k].value !== ',' && bodyTokens[k].value !== '}') {
              delayStr += (delayStr ? ' ' : '') + bodyTokens[k].value;
              k++;
            }
            ks.delay = delayStr;
          }
          j++;
        }
        circuit.killSwitch = ks;
      }

      // Parse genetic connections (chains with ->)
      const connectionLines: Token[][] = [];
      let currentChain: Token[] = [];
      for (let j = 0; j < bodyTokens.length; j++) {
        if (bodyTokens[j].value === 'kill_switch') {
          // Skip kill_switch block
          let skip = 0;
          while (j < bodyTokens.length) {
            if (bodyTokens[j].value === '{') skip++;
            if (bodyTokens[j].value === '}') { skip--; if (skip === 0) break; }
            j++;
          }
          continue;
        }
        if (bodyTokens[j].value === '->') {
          currentChain.push(bodyTokens[j]);
          continue;
        }
        if (currentChain.length > 0 && bodyTokens[j].type === 'identifier') {
          currentChain.push(bodyTokens[j]);
          continue;
        }
        if (bodyTokens[j].type === 'identifier' && j + 1 < bodyTokens.length && bodyTokens[j + 1].value === '->') {
          if (currentChain.length > 0) connectionLines.push(currentChain);
          currentChain = [bodyTokens[j]];
          continue;
        }
        if (currentChain.length > 0) {
          connectionLines.push(currentChain);
          currentChain = [];
        }
      }
      if (currentChain.length > 0) connectionLines.push(currentChain);

      // Convert chains to TranscriptionUnits
      for (const chain of connectionLines) {
        const parts: GeneticPart[] = [];
        const conn: string[] = [];
        for (const t of chain) {
          if (t.value === '->') continue;
          conn.push(t.value);
          const part = identifyPart(t.value);
          parts.push(part);
        }
        if (parts.length > 0) {
          circuit.transcriptionUnits.push({
            parts,
            expressionLevel: calculateExpression(parts),
          });
          circuit.connections.push(conn);
        }
      }

      // Calculate metrics
      circuit.partCount = circuit.transcriptionUnits.reduce((sum, tu) => sum + tu.parts.length, 0);
      circuit.atpCost = circuit.partCount * 8.5 + circuit.transcriptionUnits.length * 15;

      // ─── Validation ────────────────────────────

      // BIO002: Safe circuit without kill switch
      if (isSafe && !circuit.killSwitch) {
        diagnostics.push({
          line: tok.line, col: tok.col, endCol: tok.col + 12,
          severity: 'error', code: 'BIO002',
          message: `Circuit '${circuitName}' is marked 'safe' but has no kill_switch block`,
          fix: 'Add a kill_switch { trigger: ..., mechanism: CcdB, delay: 2 hr } block',
        });
      }

      // BIO003: Circuit without terminator
      for (const tu of circuit.transcriptionUnits) {
        const hasTerm = tu.parts.some(p => p.type === 'terminator');
        if (!hasTerm && tu.parts.length > 0) {
          const lastPart = tu.parts[tu.parts.length - 1];
          diagnostics.push({
            line: tok.line, col: tok.col, endCol: tok.col + 8,
            severity: 'warning', code: 'BIO003',
            message: `Transcription unit ending with '${lastPart.name}' has no terminator — risk of read-through (Chen et al. 2013)`,
            fix: `Add '-> term_B0015' after '${lastPart.name}'`,
          });
        }
      }

      // BIO004: CDS without RBS upstream
      for (const tu of circuit.transcriptionUnits) {
        for (let j = 0; j < tu.parts.length; j++) {
          if (tu.parts[j].type === 'cds' || tu.parts[j].type === 'reporter') {
            if (j === 0 || tu.parts[j - 1].type !== 'rbs') {
              diagnostics.push({
                line: tok.line, col: tok.col, endCol: tok.col + 8,
                severity: 'warning', code: 'BIO004',
                message: `Gene '${tu.parts[j].name}' has no RBS upstream — translation will be inefficient (Salis et al. 2009)`,
                fix: `Add 'rbs_strong ->' before '${tu.parts[j].name}'`,
              });
            }
          }
        }
      }

      // BIO005: High metabolic load
      if (circuit.atpCost > 120) {
        diagnostics.push({
          line: tok.line, col: tok.col, endCol: tok.col + 8,
          severity: 'warning', code: 'BIO005',
          message: `Circuit '${circuitName}' has estimated ATP cost of ${circuit.atpCost.toFixed(0)} AU — may cause metabolic burden (Ceroni et al. 2015)`,
        });
      }

      // BIO006: Strong promoter + strong RBS = burden risk
      for (const tu of circuit.transcriptionUnits) {
        const hasStrongProm = tu.parts.some(p => p.type === 'promoter' && (p.strength ?? 0) > 0.7);
        const hasStrongRBS = tu.parts.some(p => p.type === 'rbs' && (p.strength ?? 0) > 0.7);
        if (hasStrongProm && hasStrongRBS) {
          diagnostics.push({
            line: tok.line, col: tok.col, endCol: tok.col + 8,
            severity: 'info', code: 'BIO006',
            message: `Strong promoter + strong RBS in '${circuitName}' — consider using medium RBS to reduce burden (Rosano & Ceccarelli 2014)`,
          });
        }
      }

      // BIO007: Unknown kill switch mechanism
      if (circuit.killSwitch && !['CcdB', 'MazF', 'Holin'].includes(circuit.killSwitch.mechanism)) {
        diagnostics.push({
          line: tok.line, col: tok.col, endCol: tok.col + 8,
          severity: 'info', code: 'BIO007',
          message: `Kill switch mechanism '${circuit.killSwitch.mechanism}' is not in the validated set (CcdB, MazF, Holin)`,
        });
      }

      circuits.push(circuit);
      continue;
    }

    i++;
  }

  return { circuits, diagnostics };
}

// ─── Part Identification ─────────────────────────────────────

function identifyPart(name: string): GeneticPart {
  // Promoter
  if (name in KNOWN_PROMOTERS || name.startsWith('p') && name.length > 1 && name[1] === name[1].toUpperCase()) {
    return {
      id: name, type: 'promoter', name,
      strength: KNOWN_PROMOTERS[name]?.strength ?? 0.5,
      color: '#10b981',
    };
  }
  // Promoter with BBa prefix
  if (name.startsWith('BBa_J23')) {
    return {
      id: name, type: 'promoter', name,
      strength: KNOWN_PROMOTERS[name]?.strength ?? 0.5,
      color: '#10b981',
    };
  }
  // RBS
  if (name.startsWith('rbs') || name === 'BBa_B0034' || name === 'BBa_B0032') {
    return {
      id: name, type: 'rbs', name,
      strength: KNOWN_RBS[name]?.strength ?? 0.5,
      color: '#3b82f6',
    };
  }
  // Terminator
  if (name.startsWith('term') || TERMINATORS.has(name)) {
    return { id: name, type: 'terminator', name, color: '#ef4444' };
  }
  // Reporter
  if (KNOWN_REPORTERS.has(name)) {
    const reporterColors: Record<string, string> = {
      GFP: '#22c55e', RFP: '#ef4444', BFP: '#3b82f6',
      YFP: '#eab308', mCherry: '#dc2626', CFP: '#06b6d4',
      Venus: '#facc15', mCitrine: '#fbbf24',
    };
    return { id: name, type: 'reporter', name, color: reporterColors[name] || '#a855f7' };
  }
  // Known gene
  if (KNOWN_GENES.has(name)) {
    return { id: name, type: 'cds', name, color: '#f59e0b' };
  }
  // Generic gene/cds
  return { id: name, type: 'cds', name, color: '#f59e0b' };
}

function calculateExpression(parts: GeneticPart[]): number {
  let expression = 1.0;
  for (const p of parts) {
    if (p.type === 'promoter') expression *= (p.strength ?? 0.5) * 2;
    if (p.type === 'rbs') expression *= (p.strength ?? 0.5) * 1.5;
    if (p.type === 'terminator') expression *= 0.99; // B0015 efficiency
  }
  return Math.min(expression, 2.0);
}

// ─── Main Compile Function ───────────────────────────────────

export function compile(source: string): CompilerResult {
  const startTime = performance.now();

  if (!source.trim()) {
    return {
      success: true,
      diagnostics: [],
      circuits: [],
      parseTime: 0,
      tokensCount: 0,
      linesAnalyzed: 0,
    };
  }

  const tokens = tokenize(source);
  const { circuits, diagnostics } = parseAndValidate(tokens);
  const parseTime = performance.now() - startTime;

  // Check for unmatched braces
  let braceCount = 0;
  for (const t of tokens) {
    if (t.value === '{') braceCount++;
    if (t.value === '}') braceCount--;
  }
  if (braceCount > 0) {
    diagnostics.push({
      line: tokens[tokens.length - 1]?.line ?? 1,
      col: 1, endCol: 2,
      severity: 'error', code: 'SYN001',
      message: `${braceCount} unclosed brace(s) — missing '}'`,
    });
  }
  if (braceCount < 0) {
    diagnostics.push({
      line: 1, col: 1, endCol: 2,
      severity: 'error', code: 'SYN002',
      message: `${-braceCount} extra closing brace(s) — unexpected '}'`,
    });
  }

  const hasErrors = diagnostics.some(d => d.severity === 'error');

  return {
    success: !hasErrors,
    diagnostics: diagnostics.sort((a, b) => a.line - b.line),
    circuits,
    parseTime: Math.round(parseTime * 100) / 100,
    tokensCount: tokens.filter(t => t.type !== 'whitespace' && t.type !== 'newline').length,
    linesAnalyzed: source.split('\n').length,
  };
}

// ─── SBOL 3.0 Export ─────────────────────────────────────────

export function exportSBOL(circuit: Circuit): string {
  const parts = circuit.transcriptionUnits.flatMap(tu => tu.parts);
  const partsXml = parts.map((p, i) => `
    <sbol:Component rdf:about="${circuit.name}/${p.name}">
      <sbol:displayId>${p.name}</sbol:displayId>
      <sbol:name>${p.name}</sbol:name>
      <sbol:type rdf:resource="http://www.biopax.org/release/biopax-level3.owl#DnaRegion"/>
      <sbol:role rdf:resource="http://identifiers.org/so/${getSOUri(p.type)}"/>
      <sbol:hasSequence rdf:resource="${circuit.name}/${p.name}/sequence"/>
    </sbol:Component>`).join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"
         xmlns:sbol="http://sbols.org/v3#"
         xmlns:dcterms="http://purl.org/dc/terms/"
         xmlns:prov="http://www.w3.org/ns/prov#">

  <!-- Generated by SynBio-LLVM Web Demo -->
  <!-- Circuit: ${circuit.name} -->
  <!-- Parts: ${circuit.partCount} -->
  <!-- Host: ${circuit.chassisOrganism || 'E. coli K-12'} -->

  <sbol:Component rdf:about="${circuit.name}">
    <sbol:displayId>${circuit.name}</sbol:displayId>
    <sbol:name>${circuit.name}</sbol:name>
    <dcterms:description>Genetic circuit designed with SynBio-LLVM</dcterms:description>
    <sbol:type rdf:resource="http://www.biopax.org/release/biopax-level3.owl#DnaRegion"/>
    <sbol:role rdf:resource="http://identifiers.org/so/SO:0000804"/>
  </sbol:Component>
${partsXml}

</rdf:RDF>`;
}

function getSOUri(type: string): string {
  const map: Record<string, string> = {
    promoter: 'SO:0000167',
    rbs: 'SO:0000139',
    cds: 'SO:0000316',
    terminator: 'SO:0000141',
    reporter: 'SO:0000316',
    gene: 'SO:0000704',
  };
  return map[type] || 'SO:0000110';
}

// ─── FASTA Export ────────────────────────────────────────────

export function exportFASTA(circuit: Circuit): string {
  const seqs: Record<string, string> = {
    pLac: 'AATTGTGAGCGGATAACAATT',
    pTet: 'TCCCTATCAGTGATAGAGATTGACATC',
    pBad: 'AAGAAACCAATTGTCCATATTGCATCAGACATTG',
    BBa_J23100: 'TTGACGGCTAGCTCAGTCCTAGGTACAGTGCTAGC',
    BBa_B0034: 'AAAGAGGAGAAA',
    rbs_strong: 'AAAGAGGAGAAATACTAG',
    rbs_medium: 'AAAGAGGAGAAA',
    GFP: 'ATGGTGAGCAAGGGCGAGGAGCTGTTCACCGGGGTGGTGCCCATCCTGGTCGAGCTGGACGGCGACGTAAACGGCCACAAGTTCAGCGTGTCCGGCGAGGGCGAGGGCGATGCCACCTACGGCAAGCTGACCCTGAAGTTCATCTGCACCACCGGCAAGCTGCCCGTGCCCTGGCCCACCCTCGTGACCACCCTGACCTACGGCGTGCAGTGCTTCAGCCGCTACCCCGACCACATGAAGCAGCACGACTTCTTCAAGTCCGCCATGCCCGAAGGCTACGTCCAGGAGCGCACCATCTTCTTCAAGGACGACGGCAACTACAAGACCCGCGCCGAGGTGAAGTTCGAGGGCGACACCCTGGTGAACCGCATCGAGCTGAAGGGCATCGACTTCAAGGAGGACGGCAACATCCTGGGGCACAAGCTGGAG',
    RFP: 'ATGGCCTCCTCCGAGGACGTCATCAAGGAGTTCATGCGCTTCAAGGTGCGCATGGAGGGCTCCGTGAACGGCCACGAGTTCGAGATCGAGGGCGAGGGCGAG',
    term_B0015: 'CCAGGCATCAAACTAAGCAGAAGGCCATCCTGACGGATGGCCTTTTTTGCGTTTCTACAAACTCT',
  };

  let fasta = `>${circuit.name} | SynBio-LLVM | ${circuit.partCount} parts | ${circuit.chassisOrganism || 'E. coli'}\n`;
  let fullSeq = '';

  for (const tu of circuit.transcriptionUnits) {
    for (const part of tu.parts) {
      const seq = seqs[part.name] || generateRandomDNA(100);
      fullSeq += seq;
    }
  }

  // Wrap at 80 chars
  for (let i = 0; i < fullSeq.length; i += 80) {
    fasta += fullSeq.slice(i, i + 80) + '\n';
  }

  return fasta;
}

function generateRandomDNA(length: number): string {
  const bases = 'ATGC';
  let seq = 'ATG'; // Start codon
  for (let i = 3; i < length - 3; i++) {
    seq += bases[Math.floor(Math.random() * 4)];
  }
  seq += 'TAA'; // Stop codon
  return seq;
}

// ─── GenBank Export ──────────────────────────────────────────

export function exportGenBank(circuit: Circuit): string {
  const now = new Date();
  const date = `${now.getDate()}-${['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'][now.getMonth()]}-${now.getFullYear()}`;
  const totalLen = circuit.partCount * 150;

  let gb = `LOCUS       ${circuit.name.padEnd(16)} ${totalLen} bp    DNA     circular SYN ${date}\n`;
  gb += `DEFINITION  ${circuit.name} genetic circuit designed with SynBio-LLVM.\n`;
  gb += `ACCESSION   SBL_${circuit.name}\n`;
  gb += `KEYWORDS    synthetic biology; genetic circuit; SynBio-LLVM.\n`;
  gb += `SOURCE      synthetic construct\n`;
  gb += `  ORGANISM  synthetic construct\n`;
  gb += `FEATURES             Location/Qualifiers\n`;

  let pos = 1;
  for (const tu of circuit.transcriptionUnits) {
    for (const part of tu.parts) {
      const len = part.type === 'cds' ? 300 : part.type === 'promoter' ? 35 : part.type === 'rbs' ? 12 : 60;
      const featureType = part.type === 'promoter' ? 'promoter' : part.type === 'rbs' ? 'RBS' : part.type === 'cds' || part.type === 'reporter' ? 'CDS' : 'terminator';
      gb += `     ${featureType.padEnd(16)}${pos}..${pos + len - 1}\n`;
      gb += `                     /label="${part.name}"\n`;
      gb += `                     /note="SynBio-LLVM part"\n`;
      pos += len;
    }
  }

  gb += `ORIGIN\n`;
  gb += `//\n`;
  return gb;
}
