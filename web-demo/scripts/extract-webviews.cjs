const Module = require('module');
const fs = require('fs');
const path = require('path');

const mockPath = path.join(__dirname, 'vscode-mock.cjs');
const orig = Module._resolveFilename;
Module._resolveFilename = function (request, parent, isMain, options) {
  if (request === 'vscode') return mockPath;
  return orig.call(this, request, parent, isMain, options);
};

require('tsx/cjs');
const vscode = require('./vscode-mock.cjs');

const files = [
  'parts-library.ts',
  'plasmid-map.ts',
  'sbol-visual-renderer.ts',
  'project-dashboard.ts',
  'split-view.ts',
  'sequence-analysis.ts',
  'sequence-alignment.ts',
  'sequence-intelligence.ts',
  'codon-optimizer.ts',
  'circuit-optimizer.ts',
  'circuit-failure-predictor.ts',
  'biosecurity-scanner.ts',
  'biosafety-classifier.ts',
  'protocol-generator.ts',
  'professional-exporter.ts',
  'plate-layout-designer.ts',
  'molecule-viewer.ts',
  'pathway-designer.ts',
  'gillespie-simulator.ts',
  'genetic-version-control.ts',
  'genetic-debugger.ts',
  'growth-curve-analyzer.ts',
  'ai-design-assistant.ts',
  'auto-documentation.ts',
  'bio-test-framework.ts',
  'experiment-planner.ts',
  'crispr-designer.ts',
  'cloning-strategy-planner.ts',
  'rna-structure-predictor.ts',
  'synbio-tutor.ts',
  'protein-predictor.ts',
  'synbio-explorer.ts',
];

const context = {
  subscriptions: [],
  extensionPath: path.join(__dirname, '../../client'),
  extensionUri: { fsPath: path.join(__dirname, '../../client'), path: path.join(__dirname, '../../client') },
  globalState: { get: (_k, d) => d, update: async () => {}, keys: () => [] },
  workspaceState: { get: (_k, d) => d, update: async () => {}, keys: () => [] },
  asAbsolutePath: (p) => path.join(__dirname, '../../client', p),
};

const outDir = path.join(__dirname, '../public/webviews');
fs.mkdirSync(outDir, { recursive: true });

function slug(value) {
  return String(value).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'panel';
}

function inject(html, id) {
  const shim = `<script>
function acquireVsCodeApi(){
  const key='synbio-wv-'+${JSON.stringify(id)};
  return {
    postMessage(msg){ parent.postMessage({source:'webview', panel:${JSON.stringify(id)}, msg}, '*'); },
    getState(){ try { return JSON.parse(localStorage.getItem(key)||'null'); } catch(e){ return null; } },
    setState(state){ localStorage.setItem(key, JSON.stringify(state)); return state; }
  };
}
window.addEventListener('message', (event) => {
  if (event.data && event.data.source === 'host' && event.data.panel === ${JSON.stringify(id)}) {
    window.dispatchEvent(new MessageEvent('message', { data: event.data.msg }));
  }
});
</script>`;
  if (html.includes('<head>')) return html.replace('<head>', '<head>' + shim);
  if (html.includes('<head ')) return html.replace(/<head[^>]*>/, (m) => m + shim);
  return shim + html;
}

const manifest = [];
const seen = new Set();

(async () => {
  for (const file of files) {
    const full = path.join(__dirname, '../../client/src', file);
    try {
      const mod = require(full);
      for (const [name, exported] of Object.entries(mod)) {
        if (typeof exported !== 'function') continue;
        const before = vscode.__captured.length;
        try {
          if (typeof exported.createOrShow === 'function') {
            await exported.createOrShow(context);
          }
        } catch (error) {
          manifest.push({ file, export: name, error: 'createOrShow: ' + error.message });
        }
        try {
          const instance = new exported(context);
          const openers = [
            'show', 'showPanel', 'open', 'showDashboard', 'showWelcome', 'render',
            'openSplitView', 'openPanel', 'openDesigner', 'openAnalyzer', 'openPlanner',
            'showInstallInstructions', 'showDatabase', 'showFullReport', 'showWithPresets',
            'predictRNA', 'predictRNAFromEditor', 'quickFold', 'scan',
            'alignInteractive', 'dotPlotInteractive', 'analyzeActiveDocument',
            'generateSampleData',
          ];
          for (const method of openers) {
            if (typeof instance[method] === 'function') {
              try { await instance[method](); } catch (error) {
                manifest.push({ file, export: name, error: method + ': ' + error.message });
              }
            }
          }
          if (name === 'CircuitFailurePredictor' && typeof instance.showFullReport === 'function') {
            try { await instance.showFullReport(); } catch (error) {
              manifest.push({ file, export: name, error: 'showFullReport: ' + error.message });
            }
          }
          if (name === 'GrowthCurveAnalyzer' && typeof instance.openAnalyzer === 'function') {
            try { await instance.openAnalyzer(); } catch (error) {
              manifest.push({ file, export: name, error: 'openAnalyzer2: ' + error.message });
            }
          }
          if (name === 'GillespieSimulator' && typeof instance.showResults === 'function' && typeof exported.createDemoCircuit === 'function') {
            const circuit = exported.createDemoCircuit();
            const species = new Map();
            for (const key of circuit.species.keys()) species.set(key, [circuit.species.get(key).initialCount, 1, 2]);
            const stats = {
              totalReactions: 3,
              simulationTime: 2,
              meanValues: new Map([['TetR', 100]]),
              stdDeviation: new Map([['TetR', 4]]),
              coefficientOfVariation: new Map([['TetR', 0.04]]),
              fanoFactor: new Map([['TetR', 0.16]]),
            };
            await instance.showResults([{
              time: [0, 1, 2],
              species,
              reactions: [{ time: 0.4, reaction: 'txn_tetR' }],
              statistics: stats,
            }], circuit);
          }
          if (name === 'ProteinPredictor' && typeof instance.showPrediction === 'function') {
            await instance.showPrediction({
              sequence: 'MSTETR',
              name: 'TetR',
              predicted_structure: 'coil',
              confidence: 0.42,
              secondary_structure: 'CCCCCC',
              disorder_regions: [],
              hydrophobicity_plot: [0.2, -0.4, 0.1, -0.2, 0.5, -0.1],
              molecular_weight: 2931,
              isoelectric_point: 4.56,
              instability_index: 36.7,
              warnings: ['Servidor ESMFold no está en el navegador; gráfica local de hidrofobicidad.'],
            });
          }
        } catch (error) {
          if (!manifest.some(item => item.file === file && item.export === name)) {
            manifest.push({ file, export: name, error: error.message });
          }
        }
        for (let i = before; i < vscode.__captured.length; i++) {
          const item = vscode.__captured[i];
          const id = slug(item.id + '-' + item.title);
          const filename = id + '.html';
          const previous = manifest.find(entry => entry.id === id);
          if (previous && previous.bytes >= item.html.length) continue;
          if (previous) {
            previous.bytes = item.html.length;
            previous.title = item.title;
            previous.filename = filename;
          } else {
            manifest.push({ file, export: name, id, title: item.title, filename, bytes: item.html.length });
          }
          seen.add(id);
          fs.writeFileSync(path.join(outDir, filename), inject(item.html, id));
        }
      }
    } catch (error) {
      manifest.push({ file, error: 'import: ' + error.message });
    }
  }

  const trees = {};
  try {
    const explorer = require(path.join(__dirname, '../../client/src/synbio-explorer.ts'));
    const providers = ['ToolboxProvider', 'PartsLibraryProvider', 'OrganismsProvider', 'SafetyStatusProvider', 'LiteratureProvider', 'QuickStatsProvider'];
    for (const providerName of providers) {
      const Provider = explorer[providerName];
      if (!Provider) continue;
      const provider = new Provider();
      const roots = await provider.getChildren();
      const sections = [];
      for (const root of roots.slice(0, 12)) {
        let children = [];
        try { children = await provider.getChildren(root); } catch { children = []; }
        sections.push({
          label: root.label,
          description: root.description || '',
          children: (children || []).slice(0, 40).map(child => ({
            label: child.label,
            description: child.description || '',
            command: child.command?.command || child.meta?.command || '',
          })),
        });
      }
      trees[providerName] = sections;
    }
  } catch (error) {
    trees.error = error.message;
  }
  try {
    const plasmid = require(path.join(__dirname, '../../client/src/plasmid-map.ts'));
    if (plasmid.COMMON_VECTORS) {
      fs.writeFileSync(path.join(outDir, 'vectors.json'), JSON.stringify(plasmid.COMMON_VECTORS));
    }
  } catch (error) {
    manifest.push({ file: 'plasmid-map.ts', error: 'vectors: ' + error.message });
  }
  const partsHandler = vscode.__messageHandlers.find(item => item.id === 'synbioPartsLibrary');
  if (partsHandler) {
    try { await partsHandler.handler({ command: 'getParts' }); } catch (error) {
      manifest.push({ file: 'parts-library.ts', error: 'getParts: ' + error.message });
    }
    const data = (partsHandler.outbound || []).find(msg => msg && msg.command === 'partsData');
    if (data) fs.writeFileSync(path.join(outDir, 'parts.json'), JSON.stringify(data.parts));
  }
  fs.writeFileSync(path.join(outDir, 'trees.json'), JSON.stringify(trees, null, 2));
  fs.writeFileSync(path.join(outDir, 'index.json'), JSON.stringify(manifest, null, 2));
  const ok = manifest.filter(item => item.filename);
  console.log('captured', ok.length);
  for (const item of ok) console.log(' OK', item.title, item.bytes);
  const failed = manifest.filter(item => item.error && !item.filename);
  console.log('notes', failed.length);
  for (const item of failed.slice(0, 40)) console.log(' --', item.file, item.export || '', item.error.slice(0, 180));
})();
