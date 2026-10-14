'use client';

import React, { useEffect, useRef, useState } from 'react';
import { useStudio } from './studio-context';
import { useLocale } from './i18n';

interface PanelEntry {
  id?: string;
  title?: string;
  filename?: string;
  file?: string;
  error?: string;
  bytes?: number;
}

interface TreeChild { label: string; description: string; command: string }
interface TreeSection { label: string; description: string; children: TreeChild[] }

const COMMAND_WEBVIEW: Record<string, string> = {
  'synbio.aiAssistant': 'synbioaiassistant-ai-design-assistant',
  'synbio.askTutor': 'synbiotutorinstall-configurar-tutor-ai-de-synbio',
  'synbio.autoDocumentation': 'synbiodocumentation-auto-documentation',
  'synbio.biosafetyClassify': 'synbiobiosafety-biosafety-classification',
  'synbio.biosecurity': 'synbiobiosecurity-bioseguridad',
  'synbio.crisprDesigner': 'synbiocrispr-crispr-grna-designer',
  'synbio.dashboard': 'synbiodashboard-synbio-dashboard',
  'synbio.debugCircuit': 'synbiodebugger-depurador-inverter',
  'synbio.export': 'synbioexporter-exportador-profesional',
  'synbio.generateProtocol': 'synbioprotocol-protocolo-de-laboratorio',
  'synbio.gibsonAssemblyWorkbench': 'cloningplanner-comparador-de-m-todos-de-ensamblaje',
  'synbio.optimizeCircuit': 'synbiocircuitoptimizer-optimizador-de-circuitos',
  'synbio.optimizeCodons': 'synbiocodonoptimizer-optimizador-de-codones',
  'synbio.partsLibrary': 'synbiopartslibrary-biblioteca-de-partes',
  'synbio.pathwayDesigner': 'synbiopathway-pathway-designer',
  'synbio.plasmidMap': 'synbioplasmidmap-mapa-de-pl-smido',
  'synbio.runTests': 'synbiotests-bioscript-tests',
  'synbio.sequenceAnalysis': 'sequenceintelligence-sequence-intelligence-dashboard',
  'synbio.showMoleculeViewer': 'synbiomoleculeviewer3d-visor-molecular-3d',
  'synbio.splitView': 'synbiosplitview-vista-circuito',
  'synbio.versionControl': 'synbioversioncontrol-genetic-version-control',
  'synbio.insertPart': 'synbiopartslibrary-biblioteca-de-partes',
};

const COMMAND_TOOL: Record<string, string> = {
  'synbio.analyzeProtein': 'protein',
  'synbio.biobrickCheck': 'restriction',
  'synbio.complianceReport': 'export-compliance',
  'synbio.exportSBOL3': 'sbol',
  'synbio.proteinProperties': 'protein',
  'synbio.rbsStrength': 'rbs',
  'synbio.restrictionMap': 'restriction',
  'synbio.runFBA': 'fba',
  'synbio.thermodynamicCalc': 'tm',
  'synbio.runWetLabValidation': 'protocol',
  'synbio.suggestProtocols': 'protocol',
};

export function assetBase(): string {
  return process.env.NEXT_PUBLIC_BASE_PATH || '';
}

export function useWebviewCatalog() {
  const [items, setItems] = useState<PanelEntry[]>([]);
  const [trees, setTrees] = useState<Record<string, TreeSection[]>>({});
  useEffect(() => {
    const base = assetBase();
    fetch(`${base}/webviews/index.json`).then(response => response.json()).then(setItems).catch(() => setItems([]));
    fetch(`${base}/webviews/trees.json`).then(response => response.json()).then(setTrees).catch(() => setTrees({}));
  }, []);
  return { items: items.filter(item => item.filename && item.id), trees };
}

async function replyFor(message: { command?: string; type?: string; vectorId?: string; part?: { name?: string; category?: string; sequence?: string }; name?: string; sequence?: string; pdbId?: string; svg?: string; partId?: string }, studio: ReturnType<typeof useStudio>) {
  const base = assetBase();
  if (message.command === 'getParts') {
    const parts = await fetch(`${base}/webviews/parts.json`).then(response => response.json());
    return { command: 'partsData', parts };
  }
  if (message.command === 'insertPart' && message.part?.name) {
    const category = message.part.category || 'cds';
    const type = category === 'reporter' ? 'reporter' : category === 'promoter' || category === 'rbs' || category === 'terminator' ? category : 'cds';
    studio.insertNamedPart(message.part.name, type);
    return null;
  }
  if (message.command === 'copySequence' && message.sequence) {
    await navigator.clipboard?.writeText(message.sequence);
    studio.log(`Secuencia de ${message.name || 'parte'} copiada.`);
    return null;
  }
  if (message.command === 'fetchFromRegistry') {
    const parts = await fetch(`${base}/webviews/parts.json`).then(response => response.json()) as { id: string; registryId: string }[];
    const query = (message.partId || '').replace(/^BBa_/i, '');
    const local = parts.find(part => part.id === query || part.registryId === message.partId || part.registryId === `BBa_${query}`);
    if (local) return { command: 'registryResult', success: true, part: local, message: 'Parte del catálogo local de la extensión.' };
    return { command: 'registryResult', success: false, message: 'El CGI del iGEM Registry no está proxeado en esta página estática. El catálogo local sí responde.' };
  }
  if (message.type === 'selectVector' && message.vectorId) {
    const vectors = await fetch(`${base}/webviews/vectors.json`).then(response => response.json()) as Record<string, unknown>;
    const vector = vectors[message.vectorId];
    return vector ? { type: 'vectorData', vector } : null;
  }
  if (message.type === 'parseFromEditor') {
    return { type: 'vectorData', vector: vectorFromSource(studio.source, studio.activeFile) };
  }
  if (message.type === 'exportSVG' && message.svg) {
    const blob = new Blob([message.svg], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'plasmid-map.svg';
    link.click();
    URL.revokeObjectURL(url);
    studio.log('SVG del mapa de plásmido descargado.');
    return null;
  }
  if (message.command === 'loadPDB' && message.pdbId) {
    const response = await fetch(`https://files.rcsb.org/download/${message.pdbId}.pdb`);
    if (!response.ok) return { command: 'error', text: `PDB ${message.pdbId} no encontrado` };
    const data = await response.text();
    return { command: 'loadStructure', data, format: 'pdb' };
  }
  if (message.command === 'simulate') {
    studio.simulateNow('ssa');
    studio.setBottom('analysis');
    studio.log('Simular del panel Vista Circuito ejecutó Gillespie SSA en el navegador.');
    return null;
  }
  if (message.command === 'showStructure') {
    studio.openWebview('synbiomoleculeviewer3d-visor-molecular-3d');
    return null;
  }
  if (message.command === 'runCommand' || message.command === 'export' || message.command === 'preview') {
    studio.compileNow();
    studio.setBottom('output');
    return null;
  }
  return null;
}

function vectorFromSource(source: string, fileName: string) {
  const features: { name: string; type: string; start: number; end: number; strand: string; color: string; description: string }[] = [];
  let pos = 1;
  const add = (name: string, type: string, length: number, color: string) => {
    features.push({ name, type, start: pos, end: pos + length, strand: '+', color, description: type });
    pos += length + 20;
  };
  for (const line of source.split('\n')) {
    const promoter = line.match(/\bpromoter\s*[:\s]+(\w+)/i);
    const rbs = line.match(/\brbs\s*[:\s]+(\w+)/i);
    const gene = line.match(/\bgene\s+(\w+)/i);
    const terminator = line.match(/\bterminator\s*[:\s]+(\w+)/i);
    if (promoter) add(promoter[1], 'promoter', 40, '#4CAF50');
    if (rbs) add(rbs[1], 'rbs', 12, '#2196F3');
    if (gene) add(gene[1], 'gene', 200, '#FF9800');
    if (terminator) add(terminator[1], 'terminator', 40, '#F44336');
  }
  return {
    name: fileName,
    size: Math.max(pos, 200),
    origin: 'editor',
    resistance: [],
    description: 'Features leídas del editor del navegador',
    features,
  };
}

export function WebviewHost() {
  const studio = useStudio();
  const { lang } = useLocale();
  const { items } = useWebviewCatalog();
  const studioRef = useRef(studio);
  studioRef.current = studio;
  const current = items.find(item => item.id === studio.webviewId) ?? items[0];

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      const data = event.data;
      if (!data || data.source !== 'webview' || !event.source) return;
      void replyFor(data.msg || {}, studioRef.current).then(reply => {
        if (reply) (event.source as Window).postMessage({ source: 'host', panel: data.panel, msg: reply }, '*');
      }).catch(error => {
        studioRef.current.log(`Panel ${data.panel}: ${error instanceof Error ? error.message : 'error'}`);
      });
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, []);

  if (!current?.filename) {
    return <p className="muted">Cargando paneles extraídos de client/…</p>;
  }

  return (
    <div className="webview-frame">
      <div className="webview-tabs">
        {items.map(item => (
          <button key={item.id} type="button" className={item.id === current.id ? 'on' : ''} onClick={() => item.id && studio.openWebview(item.id)}>{item.title}</button>
        ))}
      </div>
      <iframe key={`${current.id}-${lang}`} title={current.title} src={`${assetBase()}/webviews/${current.filename}${lang === 'en' ? '?lang=en' : ''}`} />
    </div>
  );
}

export function ExplorerTrees() {
  const studio = useStudio();
  const { trees } = useWebviewCatalog();
  const order = ['ToolboxProvider', 'PartsLibraryProvider', 'OrganismsProvider', 'SafetyStatusProvider', 'LiteratureProvider', 'QuickStatsProvider'];
  return (
    <>
      {order.map(name => {
        const sections = trees[name];
        if (!sections) return null;
        return (
          <section key={name}>
            <h3>{name.replace('Provider', '')}</h3>
            {sections.map(section => (
              <details key={section.label} open={name === 'ToolboxProvider'}>
                <summary>{section.label}</summary>
                {section.children.map(child => (
                  <button key={`${section.label}-${child.label}`} className="file" title={child.description} onClick={() => runExplorerCommand(child.command, studio)}>
                    {child.label}
                    {child.command ? <small>{child.command}</small> : null}
                  </button>
                ))}
              </details>
            ))}
          </section>
        );
      })}
    </>
  );
}

function runExplorerCommand(command: string, studio: ReturnType<typeof useStudio>) {
  if (!command) return;
  const panel = COMMAND_WEBVIEW[command];
  if (panel) {
    studio.openWebview(panel);
    studio.log(`Panel del cliente: ${command}`);
    return;
  }
  if (command === 'synbio.compile' || command === 'synbio.exportAuditTrail') {
    studio.compileNow();
    studio.setBottom('output');
    return;
  }
  if (command === 'synbio.simulate') {
    studio.simulateNow('ssa');
    return;
  }
  if (command === 'synbio.searchComponents') {
    studio.setActivity('search');
    return;
  }
  if (command === 'synbio.recordObservation') {
    studio.setCenter('lab');
    studio.setActivity('lab');
    return;
  }
  const tool = COMMAND_TOOL[command];
  if (tool) {
    studio.runNamedTool(tool);
    return;
  }
  studio.setBottom('output');
  studio.log(`${command}: este comando del árbol no tiene panel HTML en client/ ni un motor de navegador distinto de los ya abiertos. No se simula un resultado.`);
}
