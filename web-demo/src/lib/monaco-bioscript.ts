// ============================================================
// Monaco Editor — BioScript Language Definition
// Syntax highlighting, autocompletion, hover tooltips
// ============================================================

import type { Monaco } from '@monaco-editor/react';
import type * as monacoTypes from 'monaco-editor';

export const BIOSCRIPT_LANGUAGE_ID = 'bioscript';

export function registerBioScriptLanguage(monaco: Monaco): void {
  // Register the language
  monaco.languages.register({
    id: BIOSCRIPT_LANGUAGE_ID,
    extensions: ['.bio', '.bioscript'],
    aliases: ['BioScript', 'bioscript'],
    mimetypes: ['text/x-bioscript'],
  });

  // Monarch tokenizer for syntax highlighting
  monaco.languages.setMonarchTokensProvider(BIOSCRIPT_LANGUAGE_ID, {
    defaultToken: '',
    tokenPostfix: '.bio',

    keywords: [
      'circuit', 'gene', 'operon', 'plasmid', 'chassis', 'host',
      'import', 'from', 'let', 'mut', 'const', 'fn', 'struct',
      'if', 'else', 'when', 'match', 'for', 'while', 'loop',
      'return', 'break', 'continue',
    ],

    safetyKeywords: [
      'safe', 'unsafe', 'contained', 'kill_switch',
    ],

    typeKeywords: [
      'Promoter', 'RBS', 'CDS', 'Terminator', 'Gene', 'Protein',
      'RNA', 'DNA', 'Riboswitch', 'Aptamer', 'Circuit', 'Gate',
      'AND', 'OR', 'NOT', 'NOR', 'NAND', 'XOR',
      'Activator', 'Repressor', 'Inducer', 'Operator',
      'Host', 'Float', 'Integer', 'String', 'Bool',
    ],

    bioFunctions: [
      'express', 'repress', 'activate', 'inhibit', 'secrete',
      'sense', 'bind', 'absence_of', 'presence_of',
    ],

    constants: ['true', 'false', 'BSL1', 'BSL2', 'BSL3', 'BSL4'],

    units: ['bp', 'kb', 'kDa', 'nM', 'uM', 'mM', 'hr', 'min', 'sec', 'AU', 'ppb'],

    operators: ['->', '=>', '=', '==', '!=', '<', '>', '<=', '>=', '+', '-', '*', '/', '&&', '||', '!'],

    symbols: /[=><!~?:&|+\-*\/\^%]+/,

    tokenizer: {
      root: [
        // DNA sequences (ATCG patterns 4+ chars)
        [/\b[ATCG]{4,}\b/, 'string.dna'],

        // Comments
        [/\/\/.*$/, 'comment'],
        [/\/\*/, 'comment', '@comment'],

        // Strings
        [/"([^"\\]|\\.)*$/, 'string.invalid'],
        [/"/, 'string', '@string'],

        // Numbers with units
        [/\b\d+\.?\d*\s*(bp|kb|kDa|nM|uM|mM|hr|min|sec|AU|ppb)\b/, 'number.unit'],
        [/\b\d+\.?\d*\b/, 'number'],

        // BioBrick identifiers
        [/BBa_[A-Z]\d{4,}/, 'variable.biobrick'],

        // Identifiers
        [/[a-zA-Z_]\w*/, {
          cases: {
            '@keywords': 'keyword',
            '@safetyKeywords': 'keyword.safety',
            '@typeKeywords': 'type',
            '@bioFunctions': 'function.bio',
            '@constants': 'constant',
            '@units': 'number.unit',
            // Known parts
            'pLac|pTet|pBad|pT7|pLux|pConst|arsR_promoter|pPbr': 'variable.promoter',
            'rbs_strong|rbs_medium|rbs_weak': 'variable.rbs',
            'term_B0015|term_B0010|term_B0012|term_T1': 'variable.terminator',
            'GFP|RFP|BFP|YFP|mCherry|CFP|Venus': 'variable.reporter',
            'LacI|TetR|AraC|LuxR|LasR|cI|CcdB|MazF|ArsR': 'variable.gene',
            '@default': 'identifier',
          },
        }],

        // Arrow operator
        [/->/, 'operator.arrow'],

        // Operators
        [/@symbols/, {
          cases: {
            '@operators': 'operator',
            '@default': '',
          },
        }],

        // Delimiters
        [/[{}()\[\]]/, '@brackets'],
        [/[;,.]/, 'delimiter'],
      ],

      comment: [
        [/[^\/*]+/, 'comment'],
        [/\*\//, 'comment', '@pop'],
        [/[\/*]/, 'comment'],
      ],

      string: [
        [/[^\\"]+/, 'string'],
        [/\\./, 'string.escape'],
        [/"/, 'string', '@pop'],
      ],
    },
  });

  // Theme colors for BioScript tokens
  monaco.editor.defineTheme('bioscript-dark', {
    base: 'vs-dark',
    inherit: true,
    rules: [
      { token: 'keyword', foreground: 'c792ea', fontStyle: 'bold' },
      { token: 'keyword.safety', foreground: '22c55e', fontStyle: 'bold' },
      { token: 'type', foreground: 'ffcb6b', fontStyle: 'bold' },
      { token: 'function.bio', foreground: '82aaff' },
      { token: 'constant', foreground: 'f78c6c' },
      { token: 'number', foreground: 'f78c6c' },
      { token: 'number.unit', foreground: 'f78c6c', fontStyle: 'italic' },
      { token: 'string', foreground: 'c3e88d' },
      { token: 'string.dna', foreground: '89ddff', fontStyle: 'bold' },
      { token: 'string.invalid', foreground: 'ff5370' },
      { token: 'comment', foreground: '546e7a', fontStyle: 'italic' },
      { token: 'operator', foreground: '89ddff' },
      { token: 'operator.arrow', foreground: '22c55e', fontStyle: 'bold' },
      { token: 'delimiter', foreground: '89ddff' },
      { token: 'variable.promoter', foreground: '10b981' },
      { token: 'variable.rbs', foreground: '3b82f6' },
      { token: 'variable.terminator', foreground: 'ef4444' },
      { token: 'variable.reporter', foreground: 'a855f7' },
      { token: 'variable.gene', foreground: 'f59e0b' },
      { token: 'variable.biobrick', foreground: '06b6d4', fontStyle: 'italic' },
      { token: 'identifier', foreground: 'eeffff' },
    ],
    colors: {
      'editor.background': '#0d1117',
      'editor.foreground': '#e6edf3',
      'editor.lineHighlightBackground': '#161b22',
      'editor.selectionBackground': '#264f7844',
      'editorCursor.foreground': '#22c55e',
      'editorLineNumber.foreground': '#484f58',
      'editorLineNumber.activeForeground': '#22c55e',
      'editor.selectionHighlightBackground': '#22c55e22',
      'editorBracketMatch.background': '#22c55e33',
      'editorBracketMatch.border': '#22c55e',
      'editorGutter.background': '#0d1117',
    },
  });

  // Autocompletion
  monaco.languages.registerCompletionItemProvider(BIOSCRIPT_LANGUAGE_ID, {
    provideCompletionItems: (model: monacoTypes.editor.ITextModel, position: monacoTypes.Position) => {
      const word = model.getWordUntilPosition(position);
      const range = {
        startLineNumber: position.lineNumber,
        endLineNumber: position.lineNumber,
        startColumn: word.startColumn,
        endColumn: word.endColumn,
      };

      const suggestions: monacoTypes.languages.CompletionItem[] = [
        // Circuit templates
        {
          label: 'safe circuit',
          kind: monaco.languages.CompletionItemKind.Snippet,
          insertText: 'safe circuit ${1:MyCircuit} {\n  ${2:pConst} -> ${3:rbs_strong} -> ${4:GFP} -> ${5:term_B0015}\n\n  kill_switch {\n    trigger: absence_of("${6:arabinose}"),\n    mechanism: ${7:CcdB},\n    delay: ${8:2} hr\n  }\n}',
          insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
          documentation: 'Create a safe genetic circuit with kill switch',
          range,
        },
        {
          label: 'chassis',
          kind: monaco.languages.CompletionItemKind.Snippet,
          insertText: 'chassis ${1:ecoli} {\n  organism: "${2:E. coli K-12 MG1655}"\n  biosafety: ${3:BSL1}\n  growth_rate: ${4:0.4}\n}',
          insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
          documentation: 'Define the host organism',
          range,
        },
        {
          label: 'kill_switch',
          kind: monaco.languages.CompletionItemKind.Snippet,
          insertText: 'kill_switch {\n  trigger: absence_of("${1:arabinose}"),\n  mechanism: ${2:CcdB},\n  delay: ${3:2} hr\n}',
          insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
          documentation: 'Add a biological kill switch for biosafety',
          range,
        },
        // Promoters
        ...['pLac', 'pTet', 'pBad', 'pT7', 'pLux', 'pConst', 'arsR_promoter'].map(p => ({
          label: p,
          kind: monaco.languages.CompletionItemKind.Variable,
          insertText: p,
          documentation: `Promoter: ${p}`,
          detail: '🟢 Promoter',
          range,
        })),
        // RBS
        ...['rbs_strong', 'rbs_medium', 'rbs_weak'].map(r => ({
          label: r,
          kind: monaco.languages.CompletionItemKind.Variable,
          insertText: r,
          documentation: `Ribosome Binding Site: ${r}`,
          detail: '🔵 RBS',
          range,
        })),
        // Reporters
        ...['GFP', 'RFP', 'BFP', 'YFP', 'mCherry', 'CFP'].map(r => ({
          label: r,
          kind: monaco.languages.CompletionItemKind.Variable,
          insertText: r,
          documentation: `Fluorescent Reporter: ${r}`,
          detail: '🟣 Reporter',
          range,
        })),
        // Genes
        ...['LacI', 'TetR', 'AraC', 'LuxR', 'CcdB', 'MazF'].map(g => ({
          label: g,
          kind: monaco.languages.CompletionItemKind.Variable,
          insertText: g,
          documentation: `Gene: ${g}`,
          detail: '🟡 Gene',
          range,
        })),
        // Terminators
        ...['term_B0015', 'term_B0010', 'term_B0012', 'term_T1'].map(t => ({
          label: t,
          kind: monaco.languages.CompletionItemKind.Variable,
          insertText: t,
          documentation: `Terminator: ${t}`,
          detail: '🔴 Terminator',
          range,
        })),
        // Bio functions
        ...['absence_of', 'presence_of'].map(f => ({
          label: f,
          kind: monaco.languages.CompletionItemKind.Function,
          insertText: `${f}("\${1:signal}")`,
          insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
          documentation: `Trigger function: ${f}`,
          detail: '⚡ Function',
          range,
        })),
      ];

      return { suggestions };
    },
  });

  // Hover provider
  monaco.languages.registerHoverProvider(BIOSCRIPT_LANGUAGE_ID, {
    provideHover: (model: monacoTypes.editor.ITextModel, position: monacoTypes.Position) => {
      const word = model.getWordAtPosition(position);
      if (!word) return null;

      const hoverInfo = getHoverInfo(word.word);
      if (!hoverInfo) return null;

      return {
        range: {
          startLineNumber: position.lineNumber,
          endLineNumber: position.lineNumber,
          startColumn: word.startColumn,
          endColumn: word.endColumn,
        },
        contents: [
          { value: `**${hoverInfo.title}**` },
          { value: hoverInfo.description },
        ],
      };
    },
  });
}

// ─── Hover Information Database ──────────────────────────────

interface HoverData {
  title: string;
  description: string;
}

function getHoverInfo(word: string): HoverData | null {
  const db: Record<string, HoverData> = {
    // Keywords
    safe: { title: '🛡️ Safe Circuit', description: 'Marks a circuit as requiring biosafety features (kill switch, containment). Required for BSL1+ organisms.' },
    circuit: { title: '🧬 Circuit', description: 'Defines a genetic circuit — a set of interconnected transcription units that perform a biological function.' },
    chassis: { title: '🦠 Chassis', description: 'The host organism that will contain the genetic circuit. Common: E. coli, B. subtilis, S. cerevisiae.' },
    kill_switch: { title: '☠️ Kill Switch', description: 'Biological safety mechanism that triggers cell death under specific conditions. Mechanisms: CcdB (toxin), MazF (mRNA interferase), Holin (lysis).' },

    // Promoters
    pLac: { title: '🟢 Promoter pLac', description: 'Lac operon promoter. Repressed by LacI, induced by IPTG.\n\n**Strength:** 0.8 (Kelly et al. 2009)\n\n**Use:** Inducible expression systems' },
    pTet: { title: '🟢 Promoter pTet', description: 'Tetracycline-responsive promoter. Repressed by TetR, induced by aTc.\n\n**Strength:** 0.7 (Kelly et al. 2009)\n\n**Use:** Tight regulation, toggle switches' },
    pBad: { title: '🟢 Promoter pBad', description: 'Arabinose-inducible promoter. Activated by AraC + arabinose.\n\n**Strength:** 0.6 (Schleif 2000)\n\n**Use:** Dose-dependent expression' },
    pT7: { title: '🟢 Promoter pT7', description: 'T7 phage promoter. Strongest known promoter, requires T7 RNAP.\n\n**Strength:** 1.0 (Studier 1990)\n\n**Use:** Maximum protein production' },
    pConst: { title: '🟢 Constitutive Promoter', description: 'Always-on promoter from the Anderson collection.\n\n**Strength:** 0.9\n\n**Use:** Constant gene expression' },

    // RBS
    rbs_strong: { title: '🔵 Strong RBS', description: 'High-efficiency ribosome binding site.\n\n**Translation rate:** ~0.9 relative\n\n**Ref:** Salis et al. 2009 (RBS Calculator)' },
    rbs_medium: { title: '🔵 Medium RBS', description: 'Medium-efficiency ribosome binding site.\n\n**Translation rate:** ~0.5 relative' },
    rbs_weak: { title: '🔵 Weak RBS', description: 'Low-efficiency ribosome binding site.\n\n**Translation rate:** ~0.2 relative\n\n**Use:** Reduce metabolic burden' },

    // Reporters
    GFP: { title: '🟢 Green Fluorescent Protein', description: 'Reporter protein from *Aequorea victoria*.\n\n**Excitation:** 488 nm | **Emission:** 509 nm\n\n**Maturation:** 25 min (superfolder variant)\n\n**Ref:** Tsien 1998 (Nobel Prize 2008)' },
    RFP: { title: '🔴 Red Fluorescent Protein', description: 'mRFP1 reporter.\n\n**Excitation:** 584 nm | **Emission:** 607 nm\n\n**Ref:** Campbell et al. 2002' },
    BFP: { title: '🔵 Blue Fluorescent Protein', description: 'EBFP2 reporter.\n\n**Excitation:** 383 nm | **Emission:** 448 nm' },
    YFP: { title: '🟡 Yellow Fluorescent Protein', description: 'YFP reporter.\n\n**Excitation:** 514 nm | **Emission:** 527 nm' },

    // Genes
    LacI: { title: '🟡 LacI Repressor', description: 'Lac repressor protein. Binds to pLac operator, blocking transcription.\n\n**Inducer:** IPTG (allolactose analog)\n\n**Kd:** ~40 nM (Oehler et al. 1994)' },
    TetR: { title: '🟡 TetR Repressor', description: 'Tet repressor protein. Binds to pTet, blocks transcription.\n\n**Inducer:** anhydrotetracycline (aTc)\n\n**Kd:** ~1 nM (Kamionka et al. 2004)' },
    CcdB: { title: '☠️ CcdB Toxin', description: 'Kill switch toxin. Poisons DNA gyrase, causing cell death.\n\n**Part of:** ccdB/ccdA toxin-antitoxin system\n\n**Use:** Biosafety kill switches' },
    MazF: { title: '☠️ MazF Toxin', description: 'mRNA interferase. Cleaves mRNAs at ACA sequences globally.\n\n**Part of:** mazEF toxin-antitoxin system\n\n**Use:** Stringent kill switches' },

    // Terminators
    term_B0015: { title: '🔴 Terminator B0015', description: 'Double terminator (B0010 + B0012).\n\n**Efficiency:** >99% termination\n\n**BioBrick:** BBa_B0015\n\n**Use:** Prevent read-through between TUs' },

    // Functions
    absence_of: { title: '⚡ absence_of()', description: 'Kill switch trigger condition. Cell death activates when the specified molecule is absent from the environment.' },
    presence_of: { title: '⚡ presence_of()', description: 'Kill switch trigger condition. Cell death activates when the specified molecule is detected in the environment.' },
  };

  return db[word] || null;
}
