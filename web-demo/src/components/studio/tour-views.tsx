'use client';

import React, { useMemo, useState } from 'react';
import { useStudio } from './studio-context';
import { catalogSequence, CATALOG } from '@/lib/studio-model';
import { translateDna } from '@/lib/science';
import { Quadrant3D } from './three-views';

function Btn({ children, onClick, tone = '' }: { children: React.ReactNode; onClick: () => void; tone?: string }) {
  return <button type="button" className={`studio-btn ${tone}`} onClick={onClick}>{children}</button>;
}

function Bar({ value }: { value: number }) {
  return <div className="bar"><i style={{ width: `${Math.max(0, Math.min(100, value))}%` }} /></div>;
}

const TASKS = [
  { id: 'bugi', title: 'Bugi test y optimizar codones', progress: 25, go: 'workflows' as const },
  { id: 'exp', title: 'Diseño de Experimentos', progress: 84, go: 'lab' as const },
  { id: 'cds', title: 'Optimización CDS', progress: 23, go: 'workflows' as const },
  { id: 'via', title: 'Rediseñar vía 136', progress: 0, go: 'map' as const },
  { id: 'trpm', title: 'Refinar vector TRPM', progress: 10, go: 'design' as const },
  { id: 'plas', title: 'Construcción de plásmidos', progress: 40, go: 'design' as const },
  { id: 'lab', title: 'Coordinación de laboratorio', progress: 55, go: 'lab' as const },
];

export function WorkspaceTasks() {
  const studio = useStudio();
  const errors = studio.result.diagnostics.length;
  const enabled = Object.values(studio.enabledScripts).filter(Boolean).length;
  const open = (center: 'workflows' | 'lab' | 'map' | 'design') => {
    studio.setCenter(center);
    studio.setActivity(center === 'workflows' ? 'workflows' : center === 'lab' ? 'lab' : center === 'map' ? 'map' : 'design');
  };
  return (
    <section className="tour-card">
      <h3>Workspace · SynBio Studio</h3>
      <p className="muted">ESTADO DE TRABAJO EN VIVO</p>
      {TASKS.map(task => (
        <button key={task.id} className="file" onClick={() => open(task.go)}>
          {task.title}
          <Bar value={task.id === 'cds' && studio.toolText.includes('CAI') ? 100 : task.progress} />
        </button>
      ))}
      <h3>Nodo BioScript</h3>
      <p>Scripts en proceso {studio.jobsRunning ? 1 : 0} · En cola {enabled} · Iteraciones {studio.logs.length} · Errores {errors}</p>
      <div className="row">
        <Btn onClick={() => studio.setJobsRunning(false)}>Detener</Btn>
        <Btn tone="green" onClick={() => studio.setJobsRunning(true)}>Reanudar</Btn>
      </div>
      {studio.files.filter(file => file.language === 'bioscript').map(file => (
        <label key={file.name} className="check">
          <input type="checkbox" checked={studio.enabledScripts[file.name] !== false} onChange={() => studio.toggleScript(file.name)} />
          {file.name}
        </label>
      ))}
    </section>
  );
}

export function ProgramaView() {
  const studio = useStudio();
  const [lane, setLane] = useState<'Detalles' | 'Investigación' | 'BioScript' | 'Exploradores'>('BioScript');
  const [inner, setInner] = useState<'Script' | 'Console' | 'Opciones' | 'Tabla'>('Script');
  const [local, setLocal] = useState<string[]>(['Programa listo.']);
  const stamp = () => new Date().toISOString().slice(11, 19);
  const compileDesign = () => {
    if (!studio.jobsRunning) {
      setLocal(prev => [...prev, `${stamp()} Nodo detenido. Reanudar para compilar.`]);
      return;
    }
    studio.compileNow();
    const names = studio.files.filter(file => file.language === 'bioscript' && studio.enabledScripts[file.name] !== false).map(file => file.name);
    setLocal(prev => [...prev, `${stamp()} Compilar diseño · ${names.join(', ') || 'ningún script activo'}`]);
  };
  return (
    <div className="tour">
      <header className="row wrap">
        <h2>Programa de definir Nueva Variante</h2>
        <Btn onClick={() => studio.openProject('tu1.bio', 'editor')}>Abrir BioScript</Btn>
        <Btn onClick={() => { studio.setCenter('workflows'); studio.setActivity('workflows'); }}>Modificar diseño</Btn>
        <Btn onClick={() => { studio.addChildNode(); studio.setCenter('map'); }}>Nuevo subworkbench</Btn>
      </header>
      <div className="tabstrip">
        {(['Detalles', 'Investigación', 'BioScript', 'Exploradores'] as const).map(item => (
          <button key={item} className={lane === item ? 'on' : ''} onClick={() => setLane(item)}>{item}</button>
        ))}
      </div>
      {lane === 'Detalles' && <p>Variante activa: {studio.hypotheses.find(node => node.id === studio.selectedHyp)?.name}. Circuito {studio.circuit?.name ?? 'sin compilar'}.</p>}
      {lane === 'Investigación' && <Btn onClick={() => studio.setCenter('research')}>Abrir Research Workbench</Btn>}
      {lane === 'Exploradores' && <Btn onClick={() => studio.setActivity('explorer')}>SYNBIO EXPLORER</Btn>}
      {lane === 'BioScript' && (
        <>
          <div className="tabstrip">
            {(['Script', 'Console', 'Opciones', 'Tabla'] as const).map(item => (
              <button key={item} className={inner === item ? 'on' : ''} onClick={() => setInner(item)}>{item}</button>
            ))}
          </div>
          {inner === 'Script' && <pre className="code-card">{studio.files.find(file => file.name === 'tu1.bio')?.contents}</pre>}
          {inner === 'Console' && <pre>{local.join('\n')}</pre>}
          {inner === 'Opciones' && <p>Scripts activos: {Object.entries(studio.enabledScripts).filter(([, on]) => on).map(([name]) => name).join(', ')}</p>}
          {inner === 'Tabla' && (
            <table className="grid">
              <tbody>
                {(studio.circuit?.connections[0] ?? ['pAm', 'T7ptac', 'gfp', 'B0015']).map(name => (
                  <tr key={name}><td>{name}</td><td>{catalogSequence(name) ? `${catalogSequence(name)!.length} bp` : 'sin secuencia de catálogo'}</td></tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      )}
      <div className="tour-bottom">
        <div className="tabstrip">
          <button onClick={compileDesign}>Compilar diseño</button>
          <button onClick={() => studio.setBottom('output')}>Output</button>
          <button onClick={() => setInner('Opciones')}>Accesibilidad</button>
          <button onClick={() => studio.setBottom('problems')}>Revisión diseño</button>
          <button onClick={() => studio.setCenter('entorno')}>Análisis huella</button>
        </div>
        <Bar value={studio.result.success ? 100 : 35} />
        <div className="row">
          <Btn onClick={() => { studio.log(`${stamp()} Asignado a ${studio.selectedHyp}`); setLocal(prev => [...prev, `${stamp()} Asignar ${studio.selectedHyp}`]); }}>Asignar</Btn>
          <Btn onClick={() => { studio.clearLogs(); setLocal([`${stamp()} Log limpiado.`]); }}>Limpiar log</Btn>
        </div>
        <pre>{local.join('\n')}</pre>
      </div>
    </div>
  );
}

export function GuidedFlows() {
  const studio = useStudio();
  const [cds, setCds] = useState('gfp');
  const [loci, setLoci] = useState('locus A');
  const [open, setOpen] = useState(false);
  return (
    <div className="tour">
      <div className="row">
        <Btn onClick={() => studio.setCenter('programa')}>Atrás</Btn>
        <h2>Workflows guiados por tarea</h2>
      </div>
      <div className="welcome-grid">
        <section className="tour-card">
          <h3>Optimizar una CDS</h3>
          <p>15–25 min en el banco. Aquí el cálculo es el optimizador de codones del cliente.</p>
          <Btn tone="green" onClick={() => setOpen(true)}>Abrir optimización</Btn>
        </section>
        <section className="tour-card">
          <h3>Bugi test</h3>
          <p>Contexto operativo</p>
          <div className="row wrap">
            <span className="badge">Casos de decisión</span>
            <span className="badge">Riesgos críticos</span>
          </div>
          <Btn onClick={() => { studio.runNamedTool('biosecurity'); studio.runNamedTool('codon'); }}>Ejecutar prueba</Btn>
        </section>
      </div>
      {open && (
        <form className="tour-card" onSubmit={event => { event.preventDefault(); studio.openProject('tu1.bio', 'editor'); studio.runNamedTool('codon'); studio.log(`Optimización pedida para ${cds} en ${loci}.`); }}>
          <h3>Configura la optimización</h3>
          <label>Secuencias / CDS<input value={cds} onChange={event => setCds(event.target.value)} /></label>
          <label>Loci<input value={loci} onChange={event => setLoci(event.target.value)} /></label>
          <Btn tone="green" onClick={() => { studio.openProject('tu1.bio', 'editor'); studio.runNamedTool('codon'); }}>Optimizar</Btn>
        </form>
      )}
    </div>
  );
}

export function NodeCanvas() {
  const studio = useStudio();
  const selected = studio.hypotheses.find(node => node.id === studio.selectedHyp);
  const [draft, setDraft] = useState(selected);
  React.useEffect(() => setDraft(selected), [selected]);
  const placed = [
    { id: 'silvestre', x: 70, y: 70 },
    { id: 'variante', x: 280, y: 120 },
    { id: 'sublocus', x: 470, y: 70 },
    { id: 'root', x: 70, y: 190 },
    { id: 'rama-a', x: 280, y: 210 },
  ];
  const byId = new Map(placed.map(item => [item.id, item]));
  return (
    <div className="node-editor">
      <svg viewBox="0 0 640 280" className="dotgrid">
        {studio.hypotheses.filter(node => node.parentId && byId.has(node.id) && byId.has(node.parentId)).map(node => {
          const a = byId.get(node.parentId!);
          const b = byId.get(node.id);
          if (!a || !b) return null;
          const mid = (a.x + b.x) / 2;
          return <path key={node.id} d={`M ${a.x + 70} ${a.y + 16} Q ${mid} ${Math.min(a.y, b.y) - 20} ${b.x} ${b.y + 16}`} fill="none" stroke="#22C55E" strokeWidth="2" />;
        })}
        {placed.map(item => {
          const node = studio.hypotheses.find(entry => entry.id === item.id);
          if (!node) return null;
          const on = node.id === studio.selectedHyp;
          return (
            <g key={item.id} onClick={() => studio.setSelectedHyp(item.id)}>
              <rect x={item.x} y={item.y} width="150" height="36" rx="8" fill="#1A2235" stroke={on ? '#f0883e' : '#334155'} strokeWidth={on ? 3 : 1} />
              <text x={item.x + 10} y={item.y + 23} fill="#e2e8f0" fontSize="12">{node.name}</text>
            </g>
          );
        })}
      </svg>
      {draft && (
        <form className="tour-card" onSubmit={event => { event.preventDefault(); studio.updateHyp(draft); }}>
          <h3>Variante</h3>
          <label>Nombre<input value={draft.name} onChange={event => setDraft({ ...draft, name: event.target.value })} /></label>
          <label>Locus<input value={draft.locus ?? ''} onChange={event => setDraft({ ...draft, locus: event.target.value })} /></label>
          <label>Promotor<input value={draft.promoter ?? ''} onChange={event => setDraft({ ...draft, promoter: event.target.value })} /></label>
          <label>RBS<input value={draft.rbs ?? ''} onChange={event => setDraft({ ...draft, rbs: event.target.value })} /></label>
          <label>Hipótesis<textarea value={draft.hipotesis} onChange={event => setDraft({ ...draft, hipotesis: event.target.value })} /></label>
          <Btn tone="green" onClick={() => studio.updateHyp(draft)}>Guardar</Btn>
        </form>
      )}
    </div>
  );
}

export function TerminatorCard() {
  const sequence = catalogSequence('B0015') ?? '';
  return (
    <section className="tour-card">
      <h3>Double terminator · B0010 + B0012</h3>
      <p>BBa_B0015 · {sequence.length} bp · secuencia del catálogo de la extensión</p>
      <svg viewBox="0 0 120 36" width="120" height="36">
        <path d="M20 28 V8 M8 8 H32 M70 28 V8 M58 8 H82" stroke="#f85149" strokeWidth="3" />
        <line x1="8" y1="28" x2="100" y2="28" stroke="#8b949e" />
      </svg>
      <pre className="seq">{sequence}</pre>
    </section>
  );
}

const EQUIV: Record<string, string> = {
  B0015: 'B0010', B0010: 'B0012', B0012: 'B0015', B0034: 'B0032', B0032: 'B0030',
  J23101: 'J23106', J23106: 'J23101', pT7: 'pTet', pTet: 'pLac', gfp: 'GFP', GFP: 'gfp',
};

export function equivalentOf(name: string): string | undefined {
  return EQUIV[name];
}

export function pointMutation(name: string): string {
  const sequence = catalogSequence(name);
  if (!sequence) return `${name}: no hay secuencia de catálogo que mutar. pAm y T7ptac están en ese caso.`;
  const bases = ['A', 'C', 'G', 'T'];
  const next = bases.find(base => base !== sequence[0]) ?? 'A';
  const mutated = next + sequence.slice(1);
  const before = translateDna(sequence).slice(0, 8);
  const after = translateDna(mutated).slice(0, 8);
  return `Mutación puntual in silico ${name}\n${sequence[0]}1${next}\ntraducción ${before} → ${after}`;
}

export function PlasmidGauge({ expression, series }: { expression: number; series: number[] }) {
  const angle = -70 + Math.max(0, Math.min(1, expression / 2)) * 140;
  const points = series.length > 1 ? series : [0.2, 0.35, 0.3, 0.5, expression / 2];
  const path = points.map((value, index) => `${index === 0 ? 'M' : 'L'} ${index * (120 / (points.length - 1))} ${28 - value * 24}`).join(' ');
  return (
    <div className="gauge-live">
      <svg viewBox="0 0 80 48">
        <path d="M8 40 A 32 32 0 0 1 72 40" stroke="#334155" strokeWidth="6" fill="none" />
        <line x1="40" y1="40" x2={40 + Math.cos((angle * Math.PI) / 180) * 26} y2={40 + Math.sin((angle * Math.PI) / 180) * 26} stroke="#22C55E" strokeWidth="2" />
      </svg>
      <svg viewBox="0 0 120 32" className="spark"><path d={path} stroke="#58a6ff" fill="none" /></svg>
    </div>
  );
}

export function LabRun() {
  const studio = useStudio();
  const [tab, setTab] = useState<'Schedule' | 'Protocolo' | 'Materiales' | 'Microplacas'>('Schedule');
  return (
    <div className="tour">
      <div className="tabstrip">
        {(['ROUTER', 'L. ENZIMÁTICO', 'L. METABÓLICO', 'M. MULTICEP'] as const).map(item => (
          <button key={item} onClick={() => {
            if (item === 'L. ENZIMÁTICO') studio.runNamedTool('restriction');
            else if (item === 'L. METABÓLICO') studio.runNamedTool('fba');
            else studio.log(`${item}: no hay red de instrumentos. El simulador local sigue disponible.`);
          }}>{item}</button>
        ))}
        <button className="danger" onClick={() => { studio.setJobsRunning(false); studio.log('Detener a los trabajos locales. No había robots conectados.'); }}>Detener a los…</button>
      </div>
      <div className="lab-layout">
        <aside>
          <h3>Nuevo experimento</h3>
          <Btn onClick={() => studio.setEln(`${studio.eln}\n${new Date().toISOString()} experimento`)}>Seleccionar experimento</Btn>
          <Btn onClick={() => studio.setJobsRunning(false)}>Pausar</Btn>
          <Btn tone="green" onClick={() => { studio.setJobsRunning(true); studio.compileNow(); }}>Continuar</Btn>
          <h3>Comandos</h3>
          <Btn onClick={() => studio.setBottom('terminal')}>Terminal</Btn>
          <Btn onClick={studio.compileNow}>Ejecutar script</Btn>
          <Btn onClick={studio.runPipeline}>Ejecutar macro</Btn>
          <h3>Módulos</h3>
          <p className="muted">Dispositivos conectados: ninguno.</p>
          <Btn onClick={() => studio.simulateNow('ssa')}>Simulador</Btn>
          <p className="muted">Datos de sensores: sin sondas.</p>
          <h3>Data Center</h3>
          <Btn onClick={() => studio.setCenter('hub')}>Resultados</Btn>
          <Btn onClick={() => studio.setBottom('output')}>Logs</Btn>
          <h3>Dataflows</h3>
          <Btn onClick={() => studio.setCenter('hub')}>Ver pipelines</Btn>
          <Btn onClick={() => studio.log('Pipeline local: compile → SSA → protocolo. No hay orquestador remoto.')}>Crear pipeline</Btn>
        </aside>
        <div>
          <div className="tabstrip">
            {(['Schedule', 'Protocolo', 'Materiales', 'Microplacas'] as const).map(item => (
              <button key={item} className={tab === item ? 'on' : ''} onClick={() => setTab(item)}>{item}</button>
            ))}
          </div>
          {tab === 'Schedule' && <Schedule />}
          {tab === 'Protocolo' && <ElnForm />}
          {tab === 'Materiales' && <Materiales />}
          {tab === 'Microplacas' && <Microplacas />}
        </div>
      </div>
    </div>
  );
}

function Schedule() {
  const metrics = [
    ['Sprints Activos', '2/5'],
    ['Puntos de Operación', '142/300'],
    ['Biorreactores', '8/8'],
    ['Microplacas', '2/2'],
    ['Incubadoras', '4/4'],
  ];
  return (
    <div>
      <p className="muted">Cifras del recorrido grabado. Esta página no lee hardware.</p>
      {metrics.map(([label, value]) => <p key={label}>{label} <strong>{value}</strong> <Bar value={Number(value.split('/')[0]) / Number(value.split('/')[1]) * 100} /></p>)}
      <h3>PROFESIONALES LABORATORIO ASIGNADOS</h3>
      <table className="grid"><tbody>
        <tr><td>Operador</td><td>Turno de diseño</td><td>local</td></tr>
        <tr><td>Revisión</td><td>in silico</td><td>sin firma</td></tr>
      </tbody></table>
      <p>Cuadrícula A8: pocillos A1–A8 del mapa de placas.</p>
      <div className="row wrap">
        {['Autosampler Manager', 'Robot Liquid Handler', 'Brazo Robótico'].map(name => (
          <section key={name} className="tour-card"><h3>{name}</h3><p>Sin driver en el navegador.</p></section>
        ))}
      </div>
    </div>
  );
}

function ElnForm() {
  const studio = useStudio();
  const [operator, setOperator] = useState('op-local');
  const [nombre, setNombre] = useState('Operador');
  const [data, setData] = useState('diseño tu1');
  const [steps, setSteps] = useState<string[]>(['Definir los pasos del experimento en el cuaderno local.']);
  const [uuid] = useState(() => (globalThis.crypto?.randomUUID?.() ?? `local-${Date.now()}`));
  const write = (line: string) => studio.setEln(`${studio.eln}\n${new Date().toISOString()} ${line}`);
  return (
    <div className="tour-card">
      <h3>Electronic Lab Notebook</h3>
      <p>Identificador {uuid}</p>
      <label>ID<input value={operator} onChange={event => setOperator(event.target.value)} /></label>
      <label>Nombre<input value={nombre} onChange={event => setNombre(event.target.value)} /></label>
      <label>Data<textarea value={data} onChange={event => setData(event.target.value)} /></label>
      <div className="row wrap">
        <Btn onClick={() => { setSteps(prev => [...prev, `Paso ${prev.length + 1}`]); write('paso'); }}>Añadir paso</Btn>
        <Btn onClick={() => write(`resultado ${data}`)}>Añadir resultado</Btn>
        <Btn onClick={() => write(`diseño ${studio.circuit?.name ?? 'sin circuito'}`)}>Registrar diseño</Btn>
        <Btn onClick={() => write('review marcada, sin revisor externo')}>Mark review</Btn>
        <Btn onClick={() => write('RC local, no es un cambio de git')}>Crear RC</Btn>
        <Btn onClick={() => write(`correspondencia ${nombre}`)}>Correspondencia</Btn>
        <Btn tone="green" onClick={() => {
          const report = `# Informe\nOperador ${operator} ${nombre}\n${uuid}\n\n${steps.join('\n')}\n\n${studio.eln}\n${data}`;
          studio.setToolText(report);
          studio.setBottom('analysis');
          studio.downloadText('informe-lab.md', report);
        }}>Generar informe</Btn>
      </div>
      <h3>Comandos / Scripts</h3>
      <Btn onClick={() => studio.log('Script añadido al cuaderno. No hay intérprete Python.')}>Añadir script</Btn>
      <h3>Protocolos</h3>
      <Btn onClick={() => setSteps(prev => [...prev, 'Nueva fase'])}>Nueva Fase o Etapa</Btn>
      <ol>{steps.map(step => <li key={step}>{step}</li>)}</ol>
    </div>
  );
}

function Materiales() {
  const studio = useStudio();
  const parts = studio.construct.nodes;
  return (
    <div>
      <h3>COMMAND CENTER</h3>
      <div className="row">
        <span className="badge">{studio.jobsRunning ? 'Operando' : 'Standby'} <i className={studio.jobsRunning ? 'dot on' : 'dot'} /></span>
      </div>
      <h3>EXECUTION BOARD</h3>
      <p>PID local · TGT {studio.circuit?.name ?? '—'} · PROC. CORE: Ensamble MoClo</p>
      <Btn onClick={() => studio.runNamedTool('golden-gate')}>Calcular Golden Gate</Btn>
      <h3>OPERACIONES RED</h3>
      <pre>{studio.logs.slice(-6).join('\n')}</pre>
      <h3>Mapa de placas</h3>
      <Microplacas />
      <h3>Trazabilidad</h3>
      <table className="grid"><tbody>
        <tr><th>Cepa</th><td>{studio.organism}</td></tr>
        {parts.map(part => <tr key={part.id}><th>Plásmido</th><td>{part.name}</td></tr>)}
      </tbody></table>
    </div>
  );
}

export function Microplacas() {
  const studio = useStudio();
  const parts = studio.construct.nodes;
  const wells = Array.from({ length: 96 }, (_, index) => {
    const row = 'ABCDEFGH'[Math.floor(index / 12)];
    const col = (index % 12) + 1;
    return { id: `${row}${col}`, part: parts.length ? parts[index % parts.length]?.name : '' };
  });
  return (
    <div>
      <h3>Microplacas · WorkBench Central</h3>
      <div className="row">
        <Btn onClick={() => studio.log('Segmentación: los pocillos con pieza quedan marcados al pulsarlos.')}>Segmentación de placa</Btn>
        <Btn onClick={() => studio.simulateNow('ode')}>Batch in-silico</Btn>
      </div>
      <div className="plate">
        {wells.map(well => (
          <button key={well.id} className={studio.plateWell === well.id ? 'on' : ''} title={well.part} onClick={() => studio.setPlateWell(well.id)}>{well.id}</button>
        ))}
      </div>
      <p>{studio.plateWell || 'Pulsa un pocillo.'} {wells.find(well => well.id === studio.plateWell)?.part}</p>
    </div>
  );
}

export function HomeExtras() {
  const studio = useStudio();
  return (
    <div className="tour">
      <p className="kicker">THE PROFESSIONAL DEV ENVIRONMENT FOR SYNTHETIC BIOLOGY</p>
      <div className="welcome-grid">
        <section className="tour-card">
          <h3>Experimentos para decidir</h3>
          <Btn onClick={() => studio.setCenter('programa')}>Programa de diseño: Nueva Variante</Btn>
          <Btn onClick={() => { studio.setCenter('map'); studio.setActivity('map'); }}>Programa principal</Btn>
          <Btn tone="green" onClick={() => studio.setCenter('hub')}>Abrir Design Hub</Btn>
        </section>
        <section className="tour-card">
          <h3>Bienvenido a SynBio Studio</h3>
          <p>Sprint de aprendizaje</p>
          <Btn tone="green" onClick={() => studio.openProject('tu1.bio', 'editor')}>Arrancar con plantilla ejecutable</Btn>
          <div className="row">
            <Btn onClick={() => studio.setCenter('design')}>Diseño</Btn>
            <Btn onClick={() => studio.setCenter('sim')}>Simulación</Btn>
            <Btn onClick={() => studio.setCenter('lab')}>Ejecución</Btn>
          </div>
        </section>
      </div>
      <div className="welcome-grid">
        <pre className="code-card">{`# synbio_core no está instalado en esta página.
# El botón compila con el compilador del navegador.
print("compile tu1.bio")`}</pre>
        <div>
          <h3>Editor de Scripts</h3>
          <Btn onClick={() => studio.openProject('tu1.bio', 'editor')}>Abrir tu1.bio</Btn>
        </div>
      </div>
    </div>
  );
}

export function DesignHub() {
  const studio = useStudio();
  const [full, setFull] = useState(false);
  const rows = studio.files.map(file => ({ name: file.name, bytes: file.contents.length, language: file.language }));
  const shown = full ? rows : rows.slice(0, 3);
  return (
    <div className="tour">
      <h2>Resultados · Dataflow Hub</h2>
      <table className="grid">
        <tbody>
          {shown.map(row => <tr key={row.name}><td>{row.name}</td><td>{row.language}</td><td>{row.bytes} caracteres</td></tr>)}
          {studio.sim && <tr><td>SSA</td><td>{studio.sim.totalReactions} reacciones</td><td>{studio.sim.maxTime.toFixed(1)} s</td></tr>}
        </tbody>
      </table>
      <Btn onClick={() => setFull(true)}>Ver dataset completo</Btn>
    </div>
  );
}

const PROGRAMS = ['diseño-cepa-test', 'vivo', 'terminado'] as const;

export function AtlasTransdermal() {
  const studio = useStudio();
  const [modal, setModal] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const cards = useMemo(() => Array.from({ length: 12 }, (_, index) => {
    const n = page * 12 + index + 1;
    const bucket = n <= 4 ? 'diseño-cepa-test' : n <= 8 ? 'vivo' : 'terminado';
    return { id: `P${n}`, bucket };
  }), [page]);
  return (
    <div className="tour">
      <header className="row wrap">
        <h2>Atlas Transdermal · Workbench de investigador</h2>
        <Btn onClick={() => studio.runNamedTool('biosecurity')}>QA Automático</Btn>
        <Btn onClick={() => studio.commitLocal('atlas: ficha local')}>Commit</Btn>
        <Btn onClick={() => studio.log('Push: no hay remoto git en el navegador.')}>Push</Btn>
        <Btn onClick={() => studio.log('Deploy: la página estática no publica otro entorno.')}>Deploy</Btn>
      </header>
      <p>Atlas Transdermal Nacional · 123 programas diseño-cepa-test · 333 programas vivos · 450 programas terminados. Se muestran 12 tarjetas por página, no las 450, para que la página siga usable.</p>
      <div className="card-grid">
        {cards.map(card => (
          <article key={card.id} className="tour-card">
            <strong>{card.id}</strong>
            <p>{card.bucket}</p>
            <Btn onClick={() => setModal(card.id)}>Crear base de trabajo</Btn>
          </article>
        ))}
      </div>
      <div className="row">
        <Btn onClick={() => setPage(page => Math.max(0, page - 1))}>Anterior</Btn>
        <Btn onClick={() => setPage(page => page + 1)}>Siguiente</Btn>
      </div>
      <p className="muted">Buckets: {PROGRAMS.join(' · ')}. Workbench individual: {studio.circuit?.name ?? 'sin circuito'}.</p>
      {modal && (
        <div className="modal">
          <h3>Revisar un workflow en el sistema</h3>
          <p>{modal}. La ficha queda en este navegador.</p>
          <Btn tone="green" onClick={() => { setModal(null); studio.setCenter('graph'); }}>Saltar a Vista Visual</Btn>
          <Btn onClick={() => setModal(null)}>Cerrar</Btn>
        </div>
      )}
    </div>
  );
}

export function TransdermalEditor() {
  const studio = useStudio();
  const nodes = [
    { name: 'P_tet', part: 'pTet', x: 40 },
    { name: 'RBS', part: 'B0034', x: 180 },
    { name: 'LasR', part: 'LasR', x: 320 },
  ];
  return (
    <div className="tour">
      <h2>Editor Transdermal</h2>
      <svg viewBox="0 0 460 120">
        <path d="M90 50 C 130 20, 150 20, 180 50" stroke="#22C55E" fill="none" />
        <path d="M230 50 C 270 20, 290 20, 320 50" stroke="#22C55E" fill="none" />
        {nodes.map(node => (
          <g key={node.name} onClick={() => studio.insertNamedPart(node.part, node.part === 'B0034' ? 'rbs' : node.part === 'pTet' ? 'promoter' : 'cds')}>
            <rect x={node.x} y="36" width="80" height="32" rx="6" fill="#1A2235" stroke="#22C55E" />
            <text x={node.x + 10} y="56" fill="#e2e8f0" fontSize="12">{node.name}</text>
          </g>
        ))}
      </svg>
      <p className="muted">LasR no tiene secuencia en el catálogo de esta copia. pTet y B0034 sí. Las flechas verdes son el enlace de activación del grafo, no una medición nueva.</p>
      <h3>Control de Workbench</h3>
      <div className="bars">
        {['QA', 'Commit', 'Diseño'].map((label, index) => <div key={label}><span>{label}</span><i style={{ height: `${30 + index * 18}px` }} /></div>)}
      </div>
      <h3>Cuadrante 3D</h3>
      <Quadrant3D />
    </div>
  );
}

export function EntornoPanel() {
  const studio = useStudio();
  const used = new Set(studio.construct.nodes.map(node => node.name));
  const footprint = studio.construct.nodes.reduce((sum, node) => sum + node.sequence.length, 0);
  return (
    <div className="tour">
      <h2>Entorno estructural del diseño activo</h2>
      <p>Workspace Control General</p>
      <div className="welcome-grid">
        <section className="tour-card"><strong>{used.size}/{CATALOG.length}</strong><p>piezas del circuito / catálogo local</p></section>
        <section className="tour-card"><strong>{studio.result.diagnostics.length}</strong><p>diagnósticos</p></section>
        <section className="tour-card"><strong>{studio.sim ? 1 : 0}</strong><p>simulaciones en esta sesión</p></section>
        <section className="tour-card"><strong>{footprint}</strong><p>bp con secuencia de catálogo</p></section>
      </div>
      <h3>Herramientas operativas para Resumen vivo</h3>
      <div className="row wrap">
        <Btn onClick={() => studio.runNamedTool('restriction')}>Restriction Mapper</Btn>
        <Btn onClick={() => studio.setCenter('design')}>Plasmid construction</Btn>
        <Btn onClick={() => studio.setCenter('map')}>Research map</Btn>
        <Btn onClick={() => studio.setCenter('research')}>Statistics dashboard</Btn>
        <Btn onClick={() => studio.runNamedTool('golden-gate')}>BioBrick Builder</Btn>
      </div>
      <pre>{studio.toolText}</pre>
    </div>
  );
}
