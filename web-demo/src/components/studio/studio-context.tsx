'use client';

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { compile, exportFASTA, exportGenBank, exportSBOL, type Circuit, type CompilerResult } from '@/lib/compiler';
import { simulate, type SimulationResult } from '@/lib/simulator';
import {
  buildConstruct, estimateCost, generateLlvmIr, generateOpenTrons, generateProtocol, generateSbml,
  type ConstructEdge, type ConstructNode,
} from '@/lib/artifacts';
import { applyOracle, odeAsSimulation, parseCsv, readFcsText, runBuildStep, runTool, simulateOde } from '@/lib/science';
import { EXAMPLES } from '@/lib/examples';
import {
  BUILD_FILE, CONSTRUCT_SOURCE, INVERTER_SOURCE, initialHypotheses, insertPart, hashText, starterFiles,
  type HypNode, type StudioFile,
} from '@/lib/studio-model';

export type Activity =
  | 'explorer' | 'map' | 'workflows' | 'search' | 'parts' | 'sim' | 'design'
  | 'lab' | 'results' | 'atlas' | 'chassis' | 'safety' | 'tutorials' | 'diff'
  | 'bookmarks' | 'outline' | 'git' | 'settings' | 'panels';

export type Center =
  | 'welcome' | 'editor' | 'design' | 'construct' | 'research' | 'atlas' | 'chassis'
  | 'sim' | 'map' | 'lab' | 'results' | 'safety' | 'tutorials' | 'diff' | 'workflows' | 'settings' | 'webview'
  | 'programa' | 'hub' | 'graph' | 'entorno';

export type BottomTab =
  | 'output' | 'problems' | 'terminal' | 'ports' | 'llvm' | 'sbol' | 'opentrons' | 'cost' | 'protocol' | 'analysis';

export interface Revision {
  id: string;
  message: string;
  branch: string;
  tag?: string;
  time: string;
  files: Record<string, string>;
  parent?: string;
}

export interface Bookmark { file: string; line: number; note: string }
export interface AuditEntry { time: string; prev: string; hash: string; summary: string }

interface StudioValue {
  projectOpen: boolean;
  files: StudioFile[];
  activeFile: string;
  source: string;
  result: CompilerResult;
  circuit: Circuit | undefined;
  activity: Activity;
  center: Center;
  bottom: BottomTab;
  bottomOpen: boolean;
  logs: string[];
  terminal: string[];
  sim: SimulationResult | null;
  simRunning: boolean;
  focusLine: number | null;
  selectedPart: string | null;
  cad3d: boolean;
  labelFilter: string;
  separation: number;
  showLabels: boolean;
  group: string;
  rotation: number;
  cut: boolean;
  explode: number;
  zoom: number;
  organism: 'ecoli' | 'pichia' | 'bl21' | 's288c';
  jobsRunning: boolean;
  enabledScripts: Record<string, boolean>;
  isolate: string | null;
  researchTab: string;
  hypotheses: HypNode[];
  selectedHyp: string;
  query: string;
  toolText: string;
  eln: string;
  equipment: string;
  csvSummary: string;
  fcsText: string;
  bookmarks: Bookmark[];
  branch: string;
  revisions: Revision[];
  staged: boolean;
  stash: string | null;
  saved: Record<string, string>;
  bslPref: number;
  telemetry: boolean;
  secretsNote: string;
  audit: AuditEntry[];
  notebook: string;
  compareFile: string;
  workflow: string;
  plateWell: string;
  webviewId: string;
  setActivity: (activity: Activity) => void;
  setCenter: (center: Center) => void;
  openWebview: (id: string) => void;
  setBottom: (tab: BottomTab) => void;
  setBottomOpen: (open: boolean) => void;
  setActiveFile: (name: string) => void;
  setSource: (value: string) => void;
  setSelectedPart: (id: string | null) => void;
  setCad3d: (value: boolean) => void;
  setLabelFilter: (value: string) => void;
  setSeparation: (value: number) => void;
  setShowLabels: (value: boolean) => void;
  setGroup: (value: string) => void;
  setRotation: (value: number) => void;
  setCut: (value: boolean) => void;
  setExplode: (value: number) => void;
  setZoom: (value: number) => void;
  setOrganism: (value: 'ecoli' | 'pichia' | 'bl21' | 's288c') => void;
  setJobsRunning: (value: boolean) => void;
  toggleScript: (name: string) => void;
  clearLogs: () => void;
  setIsolate: (value: string | null) => void;
  setResearchTab: (value: string) => void;
  setQuery: (value: string) => void;
  setToolText: (value: string) => void;
  setEln: (value: string) => void;
  setEquipment: (value: string) => void;
  setNotebook: (value: string) => void;
  setBslPref: (value: number) => void;
  setTelemetry: (value: boolean) => void;
  setSecretsNote: (value: string) => void;
  setCompareFile: (value: string) => void;
  setSelectedHyp: (id: string) => void;
  log: (line: string) => void;
  openProject: (fileName?: string, nextCenter?: Center) => void;
  newBioScript: () => void;
  openExample: (id: string) => void;
  importTextFile: (name: string, text: string) => void;
  importFcs: (buffer: ArrayBuffer, name: string) => void;
  saveProject: () => void;
  compileNow: () => void;
  simulateNow: (kind?: 'ssa' | 'ode') => void;
  validateNow: () => void;
  runCommand: (command: string) => void;
  runNamedTool: (id: string) => void;
  oracle: () => void;
  locate: (line: number) => void;
  downloadText: (filename: string, text: string) => void;
  insertNamedPart: (name: string, type: 'promoter' | 'rbs' | 'cds' | 'terminator' | 'reporter' | 'gene') => void;
  mutateSource: (recipe: (source: string) => string) => void;
  addChildNode: () => void;
  deleteBranch: () => void;
  undoHyp: () => void;
  redoHyp: () => void;
  updateHyp: (patch: Partial<HypNode>) => void;
  triggerGate: () => void;
  launchStudio: () => void;
  addBookmark: () => void;
  commitLocal: (message: string) => void;
  newBranch: (name: string) => void;
  tagRevision: (tag: string) => void;
  doStash: () => void;
  popStash: () => void;
  dbtl: (phase: 'design' | 'build' | 'test' | 'learn') => void;
  runPipeline: () => void;
  saveNotebook: () => void;
  setWorkflow: (id: string) => void;
  setPlateWell: (well: string) => void;
  construct: { nodes: ConstructNode[]; edges: ConstructEdge[] };
  llvm: string;
  sbol: string;
  sbml: string;
  ot: string;
  costText: string;
  protocol: string;
  fasta: string;
  genbank: string;
}

const StudioContext = createContext<StudioValue | null>(null);

export function useStudio(): StudioValue {
  const value = useContext(StudioContext);
  if (!value) throw new Error('Studio context missing');
  return value;
}

function now(): string {
  return new Date().toISOString();
}

export function StudioProvider({ children }: { children: React.ReactNode }) {
  const [projectOpen, setProjectOpen] = useState(false);
  const [files, setFiles] = useState<StudioFile[]>(() => starterFiles());
  const [activeFile, setActiveFileState] = useState('inverter.bio');
  const [activity, setActivity] = useState<Activity>('explorer');
  const [center, setCenter] = useState<Center>('welcome');
  const [webviewId, setWebviewId] = useState('sbolvisual-sbol-visual-diagram');
  const [bottom, setBottom] = useState<BottomTab>('output');
  const [bottomOpen, setBottomOpen] = useState(true);
  const [logs, setLogs] = useState<string[]>(['CENTRO DE CONTROL INFERIOR listo. Compilador BioScript en proceso.']);
  const [terminal, setTerminal] = useState<string[]>(['Comandos: help, compile, simulate, validate, ls, open <file>, export sbol|fasta|genbank|sbml']);
  const [sim, setSim] = useState<SimulationResult | null>(null);
  const [simRunning, setSimRunning] = useState(false);
  const [focusLine, setFocusLine] = useState<number | null>(null);
  const [selectedPart, setSelectedPart] = useState<string | null>(null);
  const [cad3d, setCad3d] = useState(false);
  const [labelFilter, setLabelFilter] = useState('');
  const [separation, setSeparation] = useState(1);
  const [showLabels, setShowLabels] = useState(true);
  const [group, setGroup] = useState('todos');
  const [rotation, setRotation] = useState(0.4);
  const [cut, setCut] = useState(false);
  const [explode, setExplode] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [organism, setOrganism] = useState<'ecoli' | 'pichia' | 'bl21' | 's288c'>('ecoli');
  const [jobsRunning, setJobsRunning] = useState(true);
  const [enabledScripts, setEnabledScripts] = useState<Record<string, boolean>>({
    'inverter.bio': true,
    'tu1.bio': true,
    'constructo.bio': true,
    'hello-biology.bio': false,
  });
  const [isolate, setIsolate] = useState<string | null>(null);
  const [researchTab, setResearchTab] = useState('Overview');
  const [hypotheses, setHypotheses] = useState<HypNode[]>(() => initialHypotheses());
  const [hypPast, setHypPast] = useState<HypNode[][]>([]);
  const [hypFuture, setHypFuture] = useState<HypNode[][]>([]);
  const [selectedHyp, setSelectedHyp] = useState('rama-a');
  const [query, setQuery] = useState('');
  const [toolText, setToolText] = useState('Elige una herramienta. La salida de esta sesión aparece aquí y en ANALYSIS.');
  const [eln, setEln] = useState('');
  const [equipment, setEquipment] = useState('Termociclador (no conectado)\nPlaca 96 (diseño local)');
  const [csvSummary, setCsvSummary] = useState('Importa un CSV de resultados para calcular media y desviación.');
  const [fcsText, setFcsText] = useState('');
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([]);
  const [branch, setBranch] = useState('main');
  const [revisions, setRevisions] = useState<Revision[]>([]);
  const [staged, setStaged] = useState(false);
  const [stash, setStash] = useState<string | null>(null);
  const [saved, setSaved] = useState<Record<string, string>>({});
  const [bslPref, setBslPref] = useState(1);
  const [telemetry, setTelemetry] = useState(false);
  const [secretsNote, setSecretsNote] = useState('');
  const [audit, setAudit] = useState<AuditEntry[]>([]);
  const [notebook, setNotebook] = useState('');
  const [compareFile, setCompareFile] = useState('constructo.bio');
  const [workflow, setWorkflow] = useState('biosensor');
  const [plateWell, setPlateWell] = useState('');
  const active = files.find(file => file.name === activeFile) ?? files[0];
  const source = active?.contents ?? '';

  const result = useMemo(() => compile(active?.language === 'bioscript' ? source : INVERTER_SOURCE), [active?.language, source]);
  const circuit = result.circuits[0];
  const construct = useMemo(
    () => (circuit ? buildConstruct(circuit, source) : { nodes: [], edges: [] }),
    [circuit, source],
  );
  const llvm = circuit ? generateLlvmIr(circuit) : '; no circuit';
  const sbol = circuit ? exportSBOL(circuit) : '';
  const sbml = circuit ? generateSbml(circuit) : '';
  const ot = circuit ? generateOpenTrons(circuit) : '';
  const costText = circuit ? estimateCost(circuit).text : 'Compila un circuito para estimar el coste.';
  const protocol = circuit ? generateProtocol(circuit) : '';
  const fasta = circuit ? exportFASTA(circuit) : '';
  const genbank = circuit ? exportGenBank(circuit) : '';

  const openWebview = useCallback((id: string) => {
    setWebviewId(id);
    setCenter('webview');
    setActivity('panels');
  }, []);

  const log = useCallback((line: string) => {
    setLogs(prev => [...prev.slice(-200), line]);
  }, []);

  const clearLogs = useCallback(() => setLogs(['Log limpiado.']), []);
  const toggleScript = useCallback((name: string) => {
    setEnabledScripts(prev => ({ ...prev, [name]: !prev[name] }));
  }, []);

  const setSource = useCallback((value: string) => {
    setFiles(prev => prev.map(file => file.name === activeFile ? { ...file, contents: value } : file));
  }, [activeFile]);

  const setActiveFile = useCallback((name: string) => {
    setActiveFileState(name);
    setProjectOpen(true);
    if (name.endsWith('.bio')) setCenter('editor');
  }, []);

  const openProject = useCallback((fileName = 'inverter.bio', nextCenter: Center = 'editor') => {
    setProjectOpen(true);
    setActiveFileState(fileName);
    setCenter(nextCenter);
    log(`Proyecto abierto. Archivo ${fileName}.`);
  }, [log]);

  const newBioScript = useCallback(() => {
    const name = `circuito-${files.length + 1}.bio`;
    setFiles(prev => [...prev, { name, language: 'bioscript', contents: INVERTER_SOURCE }]);
    setActiveFileState(name);
    setProjectOpen(true);
    setCenter('editor');
    log(`Nuevo BioScript ${name}.`);
  }, [files.length, log]);

  const openExample = useCallback((id: string) => {
    const example = EXAMPLES.find(item => item.id === id) ?? EXAMPLES[0];
    const name = `${example.id}.bio`;
    setFiles(prev => prev.some(file => file.name === name)
      ? prev.map(file => file.name === name ? { ...file, contents: example.code } : file)
      : [...prev, { name, language: 'bioscript', contents: example.code }]);
    setActiveFileState(name);
    setProjectOpen(true);
    setCenter('editor');
    log(`Ejemplo ${example.title} cargado en ${name}.`);
  }, [log]);

  const importTextFile = useCallback((name: string, text: string) => {
    if (name.toLowerCase().endsWith('.csv')) {
      setCsvSummary(parseCsv(text).summary);
      setCenter('results');
      setActivity('results');
      log(`CSV ${name} importado.`);
      return;
    }
    const language = name.endsWith('.yaml') || name.endsWith('.yml') ? 'yaml' : name.endsWith('.json') || name.endsWith('.synbio') ? 'json' : 'bioscript';
    setFiles(prev => {
      const next = prev.filter(file => file.name !== name);
      return [...next, { name, language, contents: text }];
    });
    setActiveFileState(name);
    setProjectOpen(true);
    setCenter(language === 'bioscript' ? 'editor' : 'welcome');
    log(`Archivo ${name} abierto (${text.length} caracteres).`);
  }, [log]);

  const importFcs = useCallback((buffer: ArrayBuffer, name: string) => {
    setFcsText(readFcsText(buffer));
    setCenter('results');
    setActivity('results');
    log(`FCS ${name}: segmento TEXT leído. No hay gráfico de eventos.`);
  }, [log]);

  const saveProject = useCallback(() => {
    const snapshot: Record<string, string> = {};
    for (const file of files) snapshot[file.name] = file.contents;
    const payload = JSON.stringify({ files, branch, revisions, eln, notebook });
    localStorage.setItem('synbio-studio-project', payload);
    setSaved(snapshot);
    setStaged(true);
    log('Guardado en localStorage de este navegador.');
  }, [branch, eln, files, log, notebook, revisions]);

  useEffect(() => {
    const raw = localStorage.getItem('synbio-studio-project');
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw) as { files?: StudioFile[]; eln?: string; notebook?: string };
      if (parsed.files?.length) {
        setFiles(parsed.files);
        setSaved(Object.fromEntries(parsed.files.map(file => [file.name, file.contents])));
      }
      if (parsed.eln) setEln(parsed.eln);
      if (parsed.notebook) setNotebook(parsed.notebook);
    } catch {
      /* ignore broken local project */
    }
  }, []);

  const compileNow = useCallback(() => {
    const fresh = compile(source);
    const count = fresh.diagnostics.length;
    log(`Compilado ${activeFile}: ${fresh.success ? 'sin errores' : 'con errores'}, ${fresh.circuits.length} circuitos, ${count} diagnósticos, ${fresh.parseTime} ms.`);
    setBottom(fresh.success ? 'output' : 'problems');
    setBottomOpen(true);
    setToolText(fresh.circuits[0] ? generateLlvmIr(fresh.circuits[0]).slice(0, 1500) : 'Sin circuito.');
  }, [activeFile, log, source]);

  const simulateNow = useCallback((kind: 'ssa' | 'ode' = 'ssa') => {
    const fresh = compile(source).circuits[0];
    if (!fresh) {
      log('No hay circuito que simular.');
      return;
    }
    setSimRunning(true);
    setCenter('sim');
    setBottom('analysis');
    window.setTimeout(() => {
      if (kind === 'ode') {
        const series = simulateOde(fresh);
        setSim(odeAsSimulation(series));
        log(`ODE Euler 2 h, ${series.points.length} muestras. No es el solver scipy del motor Python.`);
      } else {
        const run = simulate(fresh, { totalTime: 7200, maxSteps: 30000, degradationRate: 0.0023, transcriptionRate: 0.167, translationRate: 0.5, bindingAffinity: 40, hillCoefficient: 2, noiseLevel: 0.1 });
        setSim(run);
        log(`Gillespie SSA: ${run.totalReactions} reacciones, t=${run.maxTime.toFixed(0)} s.`);
      }
      setSimRunning(false);
    }, 30);
  }, [log, source]);

  const validateNow = useCallback(() => {
    const fresh = compile(source);
    const summary = fresh.diagnostics.map(item => `${item.code} ${item.message}`).join(' | ') || 'sin diagnósticos';
    const prev = audit[0]?.hash ?? '00000000';
    const hash = hashText(`${prev}|${source}|${summary}`);
    const entry = { time: now(), prev, hash, summary };
    setAudit(prevItems => [entry, ...prevItems].slice(0, 40));
    log(`Validación ${hash}: ${summary}`);
    setBottom('problems');
    setCenter('safety');
    setActivity('safety');
    setToolText(runTool('biosecurity', { source, result: fresh }));
  }, [audit, log, source]);

  const ctx = useMemo(() => ({ source, result }), [result, source]);

  const runNamedTool = useCallback((id: string) => {
    try {
      const text = runTool(id, ctx);
      setToolText(text);
      setBottom('analysis');
      setBottomOpen(true);
      log(`Herramienta ${id} ejecutada (${text.length} caracteres).`);
      if (id === 'ssa') simulateNow('ssa');
      if (id === 'ode') simulateNow('ode');
      if (id === 'plasmid-viewer') setCenter('design');
      if (id === 'circuit-workbench') setCenter('design');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'La herramienta falló.';
      setToolText(message);
      log(message);
    }
  }, [ctx, log, simulateNow]);

  const runCommand = useCallback((command: string) => {
    const trimmed = command.trim();
    setTerminal(prev => [...prev, `> ${trimmed}`]);
    const [head, ...rest] = trimmed.split(/\s+/);
    if (!head || head === 'help') {
      setTerminal(prev => [...prev, 'help, compile, simulate, ode, validate, ls, open <archivo>, export sbol|fasta|genbank|sbml, clear']);
      return;
    }
    if (head === 'clear') {
      setTerminal([]);
      return;
    }
    if (head === 'ls') {
      setTerminal(prev => [...prev, files.map(file => file.name).join('  ')]);
      return;
    }
    if (head === 'compile') {
      compileNow();
      return;
    }
    if (head === 'simulate') {
      simulateNow('ssa');
      return;
    }
    if (head === 'ode') {
      simulateNow('ode');
      return;
    }
    if (head === 'validate') {
      validateNow();
      return;
    }
    if (head === 'open') {
      const name = rest.join(' ');
      if (files.some(file => file.name === name)) setActiveFile(name);
      else setTerminal(prev => [...prev, `No está ${name}`]);
      return;
    }
    if (head === 'export') {
      const kind = rest[0];
      const map: Record<string, string> = { sbol, fasta, genbank, sbml, llvm, opentrons: ot, protocol };
      setTerminal(prev => [...prev, (map[kind] ?? 'Uso: export sbol|fasta|genbank|sbml').slice(0, 500)]);
      return;
    }
    setTerminal(prev => [...prev, `Comando no reconocido: ${head}`]);
  }, [compileNow, fasta, files, genbank, llvm, ot, protocol, sbol, sbml, setActiveFile, simulateNow, validateNow]);

  const oracle = useCallback(() => {
    const applied = applyOracle(source, result.diagnostics);
    setSource(applied.source);
    log(applied.note);
    setToolText(applied.note);
  }, [log, result.diagnostics, setSource, source]);

  const locate = useCallback((line: number) => {
    setFocusLine(line);
    setCenter('editor');
    setProjectOpen(true);
    log(`Localizar línea ${line}.`);
  }, [log]);

  const downloadText = useCallback((filename: string, text: string) => {
    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    URL.revokeObjectURL(url);
    log(`Descarga ${filename}.`);
  }, [log]);

  const mutateSource = useCallback((recipe: (value: string) => string) => {
    setSource(recipe(source));
  }, [setSource, source]);

  const insertNamedPart = useCallback((name: string, type: 'promoter' | 'rbs' | 'cds' | 'terminator' | 'reporter' | 'gene') => {
    setSource(insertPart(source, name, type === 'gene' ? 'cds' : type));
    log(`Pieza ${name} insertada en ${activeFile}.`);
    setCenter('design');
    setProjectOpen(true);
  }, [activeFile, log, setSource, source]);

  const pushHyp = useCallback((next: HypNode[]) => {
    setHypPast(prev => [...prev, hypotheses]);
    setHypFuture([]);
    setHypotheses(next);
  }, [hypotheses]);

  const addChildNode = useCallback(() => {
    const parent = selectedHyp || 'root';
    const id = `nodo-${Date.now()}`;
    pushHyp([...hypotheses, { id, parentId: parent, name: 'Nuevo nodo hijo', tipo: 'hipotesis', meta: '', hipotesis: '' }]);
    setSelectedHyp(id);
    setCenter('map');
    log('Nodo hijo añadido al mapa.');
  }, [hypotheses, log, pushHyp, selectedHyp]);

  const deleteBranch = useCallback(() => {
    if (selectedHyp === 'root') return;
    const drop = new Set<string>();
    const visit = (id: string) => {
      drop.add(id);
      hypotheses.filter(node => node.parentId === id).forEach(node => visit(node.id));
    };
    visit(selectedHyp);
    pushHyp(hypotheses.filter(node => !drop.has(node.id)));
    setSelectedHyp('root');
    log('Rama eliminada del mapa local.');
  }, [hypotheses, log, pushHyp, selectedHyp]);

  const undoHyp = useCallback(() => {
    const previous = hypPast[hypPast.length - 1];
    if (!previous) return;
    setHypFuture(prev => [hypotheses, ...prev]);
    setHypPast(prev => prev.slice(0, -1));
    setHypotheses(previous);
  }, [hypFuture.length, hypPast, hypotheses]);

  const redoHyp = useCallback(() => {
    const next = hypFuture[0];
    if (!next) return;
    setHypPast(prev => [...prev, hypotheses]);
    setHypFuture(prev => prev.slice(1));
    setHypotheses(next);
  }, [hypFuture, hypotheses]);

  const updateHyp = useCallback((patch: Partial<HypNode>) => {
    pushHyp(hypotheses.map(node => node.id === selectedHyp ? { ...node, ...patch } : node));
  }, [hypotheses, pushHyp, selectedHyp]);

  const triggerGate = useCallback(() => {
    const fresh = compile(source).circuits[0];
    if (!fresh?.killSwitch) {
      log('Gatillo: el circuito no tiene kill_switch. La validación lo marcará si está declarado safe.');
      setToolText('Sin kill switch parseado.');
      return;
    }
    log(`Gatillo registrado: ${fresh.killSwitch.trigger || 'sin trigger'} → ${fresh.killSwitch.mechanism || 'sin mecanismo'}. No ejecuta un laboratorio.`);
    setToolText(`Contención in silico\ntrigger: ${fresh.killSwitch.trigger}\nmechanism: ${fresh.killSwitch.mechanism}\ndelay: ${fresh.killSwitch.delay}`);
  }, [log, source]);

  const launchStudio = useCallback(() => {
    setProjectOpen(true);
    setCenter('design');
    setActivity('design');
    log('Studio de diseño abierto sobre el circuito activo.');
  }, [log]);

  const addBookmark = useCallback(() => {
    const line = focusLine ?? 1;
    setBookmarks(prev => [...prev, { file: activeFile, line, note: source.split('\n')[line - 1]?.trim() || activeFile }]);
    log(`Marcador ${activeFile}:${line}.`);
  }, [activeFile, focusLine, log, source]);

  const snapshot = useCallback((): Record<string, string> => {
    return Object.fromEntries(files.map(file => [file.name, file.contents]));
  }, [files]);

  const commitLocal = useCallback((message: string) => {
    const revision: Revision = {
      id: hashText(`${message}|${now()}|${source}`),
      message,
      branch,
      time: now(),
      files: snapshot(),
      parent: revisions[0]?.id,
    };
    setRevisions(prev => [revision, ...prev]);
    setSaved(revision.files);
    setStaged(false);
    log(`Revisión local ${revision.id} (${branch}): ${message}. No es un commit de git.`);
  }, [branch, log, revisions, snapshot, source]);

  const newBranch = useCallback((name: string) => {
    setBranch(name);
    log(`Rama local «${name}». No hay repositorio git en el navegador.`);
  }, [log]);

  const tagRevision = useCallback((tag: string) => {
    setRevisions(prev => prev.length ? [{ ...prev[0], tag }, ...prev.slice(1)] : prev);
    log(`Etiqueta local ${tag}.`);
  }, [log]);

  const doStash = useCallback(() => {
    setStash(source);
    log('Stash local del archivo activo.');
  }, [log, source]);

  const popStash = useCallback(() => {
    if (stash === null) return;
    setSource(stash);
    setStash(null);
    log('Stash restaurado en el archivo activo.');
  }, [log, setSource, stash]);

  const dbtl = useCallback((phase: 'design' | 'build' | 'test' | 'learn') => {
    if (phase === 'design') {
      const name = `experiment/${circuit?.name || 'circuito'}`;
      setBranch(name);
      log(`DBTL Design: rama local ${name}.`);
      setCenter('design');
    } else if (phase === 'build') {
      tagRevision(`synthesis/${new Date().toISOString().slice(0, 10)}`);
      setBottom('protocol');
      setCenter('lab');
    } else if (phase === 'test') {
      commitLocal(`test: ${circuit?.name || activeFile}`);
      simulateNow('ssa');
    } else {
      tagRevision(`validated/${new Date().toISOString().slice(0, 10)}`);
      setCenter('map');
      log('DBTL Learn: etiqueta local validated. El mapa guarda la hipótesis, no un experimento físico.');
    }
  }, [activeFile, circuit?.name, commitLocal, log, simulateNow, tagRevision]);

  const runPipeline = useCallback(() => {
    const steps = (files.find(file => file.name === 'synbio.build.yaml')?.contents || BUILD_FILE)
      .split('\n')
      .map(line => line.replace(/^\s*-\s*/, '').trim())
      .filter(line => line && !line.startsWith('version') && !line.endsWith(':'));
    const lines = steps.map(step => {
      try {
        return `${step}: ${runBuildStep(step, ctx).split('\n')[0]}`;
      } catch (error) {
        return `${step}: ${error instanceof Error ? error.message : 'error'}`;
      }
    });
    setToolText(lines.join('\n'));
    setBottom('output');
    log(`Build local: ${lines.length} pasos.`);
  }, [ctx, files, log]);

  const saveNotebook = useCallback(() => {
    localStorage.setItem('synbio-studio-notebook', notebook);
    log('Ficha del atlas guardada en localStorage.');
  }, [log, notebook]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
        event.preventDefault();
        compileNow();
      }
      if ((event.metaKey || event.ctrlKey) && event.shiftKey && event.key.toLowerCase() === 'g') {
        event.preventDefault();
        simulateNow('ssa');
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [compileNow, simulateNow]);

  const value: StudioValue = {
    projectOpen, files, activeFile, source, result, circuit, activity, center, bottom, bottomOpen,
    logs, terminal, sim, simRunning, focusLine, selectedPart, cad3d, labelFilter, separation, showLabels,
    group, rotation, cut, explode, zoom, organism, isolate, researchTab, hypotheses, selectedHyp, query,
    toolText, eln, equipment, csvSummary, fcsText, bookmarks, branch, revisions, staged, stash, saved,
    bslPref, telemetry, secretsNote, audit, notebook, compareFile, workflow, plateWell, webviewId,
    jobsRunning, enabledScripts,
    setActivity, setCenter, openWebview, setBottom, setBottomOpen, setActiveFile, setSource, setSelectedPart, setCad3d,
    setLabelFilter, setSeparation, setShowLabels, setGroup, setRotation, setCut, setExplode, setZoom,
    setOrganism, setJobsRunning, toggleScript, clearLogs, setIsolate, setResearchTab, setQuery, setToolText, setEln, setEquipment, setNotebook, setBslPref,
    setTelemetry, setSecretsNote, setCompareFile, setSelectedHyp, log, openProject, newBioScript,
    openExample, importTextFile, importFcs, saveProject, compileNow, simulateNow, validateNow, runCommand,
    runNamedTool, oracle, locate, downloadText, insertNamedPart, mutateSource, addChildNode, deleteBranch,
    undoHyp, redoHyp, updateHyp, triggerGate, launchStudio, addBookmark, commitLocal, newBranch,
    tagRevision, doStash, popStash, dbtl, runPipeline, saveNotebook, setWorkflow, setPlateWell,
    construct, llvm, sbol, sbml, ot, costText, protocol, fasta, genbank,
  };

  return <StudioContext.Provider value={value}>{children}</StudioContext.Provider>;
}

export const previewSource = INVERTER_SOURCE;
export const previewConstruct = CONSTRUCT_SOURCE;
