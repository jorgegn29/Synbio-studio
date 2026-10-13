class Disposable {
  constructor(call) { this.call = call; }
  dispose() { if (this.call) this.call(); }
  static from(...items) { return new Disposable(() => items.forEach(i => i && i.dispose && i.dispose())); }
}

class EventEmitter {
  constructor() {
    this.event = () => new Disposable();
  }
  fire() {}
  dispose() {}
}

class TreeItem {
  constructor(label, collapsibleState) {
    this.label = label;
    this.collapsibleState = collapsibleState;
  }
}

class MarkdownString {
  constructor(value = '') { this.value = value; }
  appendMarkdown(v) { this.value += v; return this; }
  appendCodeblock(v) { this.value += v; return this; }
}

class ThemeIcon { constructor(id, color) { this.id = id; this.color = color; } }
class ThemeColor { constructor(id) { this.id = id; } }
class Uri {
  constructor(fsPath) { this.fsPath = fsPath; this.path = fsPath; this.scheme = 'file'; this.authority = ''; }
  toString() { return this.fsPath; }
  static file(p) { return new Uri(p); }
  static parse(p) { return new Uri(p); }
  static joinPath(base, ...parts) { return new Uri([base.fsPath || base, ...parts].join('/')); }
}
class Position { constructor(line, character) { this.line = line; this.character = character; } }
class Range { constructor(a, b, c, d) { this.start = a; this.end = b; } }
class Selection extends Range {}

const INVERTER = `circuit inverter {
    promoter: J23101
    rbs: B0034
    gene tetR {
        sequence: "ATGTCTAGATTAGATAAAAGTAAAGTGATTAACAGCGCATTAGAGCTGCTTAATGAGGTCGGAATCGAAGGTTTAACAACC"
        product: TetR
    }
    terminator: B0015
}
`;

const captured = [];
const messageHandlers = [];
const livePanels = new Map();

function makeWebview(meta) {
  const webview = {
    options: {},
    cspSource: 'http://localhost',
    asWebviewUri(u) { return u; },
    postMessage(msg) { meta.outbound.push(msg); },
    onDidReceiveMessage(handler) {
      messageHandlers.push({ id: meta.id, handler, outbound: meta.outbound });
      return new Disposable();
    },
  };
  let html = '';
  Object.defineProperty(webview, 'html', {
    get() { return html; },
    set(value) {
      html = String(value || '');
      if (html.includes('<') && html.length > 200) {
        captured.push({ id: meta.id, title: meta.title, html, outbound: meta.outbound });
      }
    },
  });
  return webview;
}

function createWebviewPanel(id, title) {
  const meta = { id, title, outbound: [] };
  livePanels.set(id, meta);
  const webview = makeWebview(meta);
  return {
    webview,
    title,
    viewType: id,
    visible: true,
    onDidDispose() { return new Disposable(); },
    reveal() {},
    dispose() {},
  };
}

const editor = {
  document: {
    getText: () => INVERTER,
    fileName: 'inverter.bio',
    languageId: 'bioscript',
    lineCount: INVERTER.split('\n').length,
    uri: Uri.file('/tmp/demo/inverter.bio'),
    lineAt(n) {
      const lines = INVERTER.split('\n');
      const text = lines[Math.max(0, Math.min(n, lines.length - 1))] || '';
      return {
        text,
        lineNumber: n,
        range: new Range(new Position(n, 0), new Position(n, text.length)),
      };
    },
    positionAt() { return new Position(0, 0); },
    offsetAt() { return 0; },
  },
  selection: { active: new Position(0, 0), start: new Position(0, 0), end: new Position(0, 0), isEmpty: true },
  edit: async (cb) => { cb({ insert() {}, replace() {}, delete() {} }); return true; },
  revealRange() {},
  options: {},
};

const vscode = {
  Disposable,
  EventEmitter,
  TreeItem,
  MarkdownString,
  ThemeIcon,
  ThemeColor,
  Uri,
  Position,
  Range,
  Selection,
  TreeItemCollapsibleState: { None: 0, Collapsed: 1, Expanded: 2 },
  ViewColumn: { Active: -1, Beside: -2, One: 1, Two: 2, Three: 3 },
  ColorThemeKind: { Light: 1, Dark: 2, HighContrast: 3, HighContrastLight: 4 },
  TextEditorRevealType: { Default: 0, InCenter: 1, InCenterIfOutsideViewport: 2, AtTop: 3 },
  StatusBarAlignment: { Left: 1, Right: 2 },
  DiagnosticSeverity: { Error: 0, Warning: 1, Information: 2, Hint: 3 },
  DiagnosticTag: { Unnecessary: 1, Deprecated: 2 },
  CompletionItemKind: { Text: 0, Method: 1, Function: 2, Field: 4, Variable: 5, Class: 6, Keyword: 13, Snippet: 14, Color: 15, Value: 12 },
  QuickPickItemKind: { Separator: -1, Default: 0 },
  CompletionItem: class CompletionItem { constructor(label) { this.label = label; } },
  CodeAction: class CodeAction { constructor(title, kind) { this.title = title; this.kind = kind; } },
  CodeActionKind: { QuickFix: { value: 'quickfix' }, Empty: { value: '' } },
  DocumentSymbol: class DocumentSymbol { constructor(name, detail, kind, range, selectionRange) { this.name = name; this.children = []; } },
  SymbolKind: { Function: 11, Variable: 12, String: 14, Object: 18, Array: 17 },
  CodeLens: class CodeLens { constructor(range) { this.range = range; } },
  Hover: class Hover { constructor(contents) { this.contents = contents; } },
  Diagnostic: class Diagnostic { constructor(range, message, severity) { this.range = range; this.message = message; this.severity = severity; } },
  RelativePattern: class RelativePattern { constructor(base, pattern) { this.base = base; this.pattern = pattern; } },
  ConfigurationTarget: { Global: 1, Workspace: 2 },
  ProgressLocation: { Notification: 15, Window: 10 },
  FileType: { File: 1, Directory: 2 },
  window: {
    activeTextEditor: editor,
    visibleTextEditors: [editor],
    createWebviewPanel,
    createOutputChannel() { return { appendLine() {}, append() {}, show() {}, dispose() {}, clear() {} }; },
    createStatusBarItem() { return { show() {}, hide() {}, dispose() {}, text: '', tooltip: '', command: '' }; },
    createTreeView() { return { dispose() {}, onDidChangeSelection() { return new Disposable(); }, reveal() {} }; },
    registerTreeDataProvider() { return new Disposable(); },
    registerWebviewViewProvider() { return new Disposable(); },
    activeColorTheme: { kind: 2 },
    showInformationMessage: async () => undefined,
    showWarningMessage: async () => undefined,
    showErrorMessage: async () => undefined,
    showQuickPick: async (items) => {
      if (!Array.isArray(items)) return undefined;
      return items.find((item) => item && item.kind !== -1 && item.label) || items[0];
    },
    showInputBox: async (opts) => {
      const prompt = String((opts && (opts.prompt || opts.placeHolder || opts.title)) || '').toLowerCase();
      if (/uniprot|accession|p0a/.test(prompt)) return 'P0A9P0';
      if (/pregunta|tutor|question/.test(prompt)) return 'como funciona el compilador BioScript';
      if (/secuencia 2|sequence 2|segunda/.test(prompt)) return 'ATGCGATCGATCGATCGATCGATCGATCG';
      if (/rna|a, u, c, g/.test(prompt)) return 'GGGGAAAACCCCUUUUGGGGAAAACCCC';
      if (/secuencia|sequence|dna|atgc/.test(prompt)) return 'ATGCGATCGATCGATCGATCGATCGATCGATCGATCGATCG';
      return 'ATGCGATCGATCGATCGATCGATCGATCG';
    },
    showSaveDialog: async () => undefined,
    showOpenDialog: async () => undefined,
    showTextDocument: async () => editor,
    withProgress: async (_o, task) => task({ report() {} }),
    onDidChangeActiveTextEditor() { return new Disposable(); },
    onDidChangeTextEditorSelection() { return new Disposable(); },
    tabGroups: { all: [], close: async () => {} },
  },
  workspace: {
    workspaceFolders: [{ uri: Uri.file('/tmp/demo'), name: 'demo', index: 0 }],
    textDocuments: [editor.document],
    name: 'demo',
    getConfiguration() {
      return { get: (_k, d) => d, update: async () => {}, has: () => false };
    },
    findFiles: async () => [],
    openTextDocument: async () => editor.document,
    onDidChangeTextDocument() { return new Disposable(); },
    onDidOpenTextDocument() { return new Disposable(); },
    onDidCloseTextDocument() { return new Disposable(); },
    onDidSaveTextDocument() { return new Disposable(); },
    onDidChangeConfiguration() { return new Disposable(); },
    createFileSystemWatcher() {
      return {
        onDidCreate() { return new Disposable(); },
        onDidChange() { return new Disposable(); },
        onDidDelete() { return new Disposable(); },
        dispose() {},
      };
    },
    fs: {
      readFile: async () => new Uint8Array(),
      writeFile: async () => {},
      stat: async () => ({ type: 1, ctime: 0, mtime: 0, size: 0 }),
      readDirectory: async () => [],
    },
    asRelativePath(p) { return String(p.fsPath || p); },
    getWorkspaceFolder() { return { uri: Uri.file('/tmp/demo'), name: 'demo' }; },
  },
  commands: {
    registerCommand() { return new Disposable(); },
    executeCommand: async () => undefined,
    getCommands: async () => [],
  },
  languages: {
    registerCompletionItemProvider() { return new Disposable(); },
    registerHoverProvider() { return new Disposable(); },
    registerCodeActionsProvider() { return new Disposable(); },
    registerCodeLensProvider() { return new Disposable(); },
    registerDocumentSymbolProvider() { return new Disposable(); },
    registerDefinitionProvider() { return new Disposable(); },
    createDiagnosticCollection() { return { set() {}, delete() {}, clear() {}, dispose() {} }; },
    getDiagnostics: () => [],
  },
  env: {
    clipboard: { writeText: async () => {}, readText: async () => '' },
    openExternal: async () => true,
    appName: 'SynBio Studio browser',
    language: 'es',
    machineId: 'browser',
  },
  extensions: { getExtension: () => undefined, all: [] },
  debug: { onDidStartDebugSession() { return new Disposable(); } },
  authentication: { getSession: async () => undefined },
  __captured: captured,
  __messageHandlers: messageHandlers,
  __livePanels: livePanels,
};

module.exports = vscode;
