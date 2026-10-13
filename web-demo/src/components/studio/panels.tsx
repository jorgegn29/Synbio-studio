'use client';

import React, { useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import SimulationView from '@/components/SimulationView';
import { useStudio } from './studio-context';
import {
  annotatePart, CATALOG, catalogSequence, ECOLI_LAYERS, LITERATURE, lineDiff, ORGANISMS, PICHIA_LAYERS,
  removePart, renamePart, TOOLBOX, type AtlasLayer,
} from '@/lib/studio-model';
import { researchGauges } from '@/lib/science';
import { EXAMPLES } from '@/lib/examples';

const BioEditor = dynamic(() => import('@/components/BioEditor'), { ssr: false });

const GLYPH: Record<string, string> = {
  promoter: '#3fb950',
  rbs: '#58a6ff',
  cds: '#d29922',
  reporter: '#bc8cff',
  terminator: '#f85149',
  gene: '#d29922',
};

function Button({ children, onClick, tone = 'ghost' }: { children: React.ReactNode; onClick: () => void; tone?: 'ghost' | 'green' | 'blue' }) {
  return (
    <button type="button" className={`studio-btn ${tone}`} onClick={onClick}>{children}</button>
  );
}

export function Sidebar() {
  const studio = useStudio();
  if (studio.activity === 'explorer') return <Explorer />;
  if (studio.activity === 'search') return <SearchPane />;
  if (studio.activity === 'parts') return <PartsPane />;
  if (studio.activity === 'git') return <HistoryPane />;
  if (studio.activity === 'outline') return <OutlinePane />;
  if (studio.activity === 'bookmarks') return <BookmarkPane />;
  const centerFor: Record<string, 'map' | 'workflows' | 'sim' | 'design' | 'lab' | 'results' | 'atlas' | 'chassis' | 'safety' | 'tutorials' | 'diff' | 'settings' | undefined> = {
    map: 'map', workflows: 'workflows', sim: 'sim', design: 'design', lab: 'lab', results: 'results',
    atlas: 'atlas', chassis: 'chassis', safety: 'safety', tutorials: 'tutorials', diff: 'diff', settings: 'settings',
  };
  const target = centerFor[studio.activity];
  return (
    <div className="side-pad">
      <h2>{studio.activity}</h2>
      <p className="muted">El panel central muestra este módulo. Los botones de ahí ejecutan el código del navegador.</p>
      {target && <Button onClick={() => studio.setCenter(target)}>Abrir en el centro</Button>}
    </div>
  );
}

function Explorer() {
  const studio = useStudio();
  return (
    <div className="side-pad">
      <h2>SYNBIO EXPLORER</h2>
      <section>
        <h3>Proyecto Synbio</h3>
        {studio.projectOpen ? <p>{studio.files.length} archivos · rama local {studio.branch}</p> : <p>No hay proyecto abierto</p>}
        <div className="row">
          <Button tone="green" onClick={() => studio.openProject()}>Nuevo Proyecto</Button>
          <Button onClick={() => studio.openProject()}>Abrir Proyecto</Button>
        </div>
      </section>
      <section>
        <h3>Archivos</h3>
        {studio.projectOpen ? studio.files.map(file => (
          <button key={file.name} className={file.name === studio.activeFile ? 'file on' : 'file'} onClick={() => studio.setActiveFile(file.name)}>{file.name}</button>
        )) : <p className="muted">Abre o crea un proyecto para ver los archivos.</p>}
      </section>
      <section>
        <h3>Herramientas ({TOOLBOX.length})</h3>
        <div className="tool-scroll">
          {TOOLBOX.map(tool => (
            <button key={tool.id} className="file" onClick={() => { studio.openProject(studio.activeFile, 'editor'); studio.runNamedTool(tool.id); }}>{tool.name}</button>
          ))}
        </div>
      </section>
      <section className="card green">
        <h3>Siguiente paso natural</h3>
        <p>Crea tu primer archivo BioScript</p>
        <div className="row">
          <Button tone="green" onClick={studio.newBioScript}>Nuevo BioScript</Button>
          <Button onClick={() => studio.openExample('hello-bio')}>Plantilla</Button>
        </div>
      </section>
      <section className="card blue">
        <h3>Mapa vivo central del Studio</h3>
        <Button tone="blue" onClick={() => { studio.setActivity('map'); studio.setCenter('map'); }}>Abrir mapa</Button>
      </section>
      <section>
        <h3>Espacios de trabajo DBTL</h3>
        <div className="row wrap">
          <Button onClick={() => studio.dbtl('design')}>Diseño</Button>
          <Button onClick={() => studio.dbtl('build')}>Construcción</Button>
          <Button onClick={() => studio.dbtl('test')}>Análisis</Button>
          <Button onClick={() => studio.dbtl('learn')}>Aprendizaje</Button>
        </div>
      </section>
    </div>
  );
}

function SearchPane() {
  const studio = useStudio();
  const q = studio.query.toLowerCase();
  const parts = CATALOG.filter(part => `${part.name} ${part.note} ${part.group}`.toLowerCase().includes(q));
  const orgs = ORGANISMS.filter(org => `${org.name} ${org.note} ${org.group}`.toLowerCase().includes(q));
  const files = studio.files.filter(file => file.name.toLowerCase().includes(q) || file.contents.toLowerCase().includes(q));
  return (
    <div className="side-pad">
      <h2>Buscar</h2>
      <input value={studio.query} onChange={event => studio.setQuery(event.target.value)} placeholder="Parte, organismo, archivo" />
      <h3>Partes</h3>
      {parts.map(part => <button key={part.name} className="file" onClick={() => studio.insertNamedPart(part.name, part.type)}>{part.name} · {part.group}</button>)}
      <h3>Organismos</h3>
      {orgs.map(org => <p key={org.name}>{org.name} · BSL-{org.bsl}</p>)}
      <h3>Archivos</h3>
      {files.map(file => <button key={file.name} className="file" onClick={() => studio.setActiveFile(file.name)}>{file.name}</button>)}
    </div>
  );
}

function PartsPane() {
  const studio = useStudio();
  const groups = ['Reguladores', 'Traduccion', 'CDS/Genes', 'Marcadores'] as const;
  return (
    <div className="side-pad">
      <h2>Biblioteca de partes</h2>
      {groups.map(group => (
        <section key={group}>
          <h3>{group}</h3>
          {CATALOG.filter(part => part.group === group).map(part => (
            <button key={part.name} className="file" onClick={() => studio.insertNamedPart(part.name, part.type)}>
              {part.name}
              <small>{catalogSequence(part.name)?.length ?? 0} bp · {part.note}</small>
            </button>
          ))}
        </section>
      ))}
    </div>
  );
}

function OutlinePane() {
  const studio = useStudio();
  return (
    <div className="side-pad">
      <h2>Outline</h2>
      {studio.result.circuits.map(circuit => (
        <section key={circuit.name}>
          <h3>{circuit.name}</h3>
          {circuit.transcriptionUnits.map((tu, index) => (
            <p key={index}>{tu.parts.map(part => part.name).join(' → ')}</p>
          ))}
        </section>
      ))}
      {!studio.circuit && <p>Sin circuito en el archivo activo.</p>}
    </div>
  );
}

function BookmarkPane() {
  const studio = useStudio();
  return (
    <div className="side-pad">
      <h2>Marcadores</h2>
      <Button onClick={studio.addBookmark}>Añadir marcador</Button>
      {studio.bookmarks.map((mark, index) => (
        <button key={`${mark.file}-${index}`} className="file" onClick={() => { studio.setActiveFile(mark.file); studio.locate(mark.line); }}>{mark.file}:{mark.line} {mark.note}</button>
      ))}
    </div>
  );
}

function HistoryPane() {
  const studio = useStudio();
  const [message, setMessage] = useState('diseño: inverter');
  const [branch, setBranch] = useState('experiment/inverter');
  const diff = lineDiff(studio.saved[studio.activeFile] ?? '', studio.source, studio.activeFile);
  return (
    <div className="side-pad">
      <h2>Historial local</h2>
      <p className="muted">No hay binario git ni remoto. Estos botones guardan revisiones en memoria y en localStorage.</p>
      <p>Rama: {studio.branch} · staged: {studio.staged ? 'sí' : 'no'} · stash: {studio.stash ? 'sí' : 'no'}</p>
      <input value={message} onChange={event => setMessage(event.target.value)} />
      <div className="row wrap">
        <Button onClick={() => studio.commitLocal(message)}>Guardar revisión</Button>
        <Button onClick={studio.doStash}>Stash</Button>
        <Button onClick={studio.popStash}>Restaurar stash</Button>
      </div>
      <input value={branch} onChange={event => setBranch(event.target.value)} />
      <div className="row wrap">
        <Button onClick={() => studio.newBranch(branch)}>Crear rama local</Button>
        <Button onClick={() => studio.tagRevision(`synthesis/${new Date().toISOString().slice(0, 10)}`)}>Etiqueta</Button>
      </div>
      <pre>{diff}</pre>
      <h3>Blame local</h3>
      {studio.revisions[0] ? <p>Líneas actuales asociadas a {studio.revisions[0].id} si no han cambiado desde esa revisión.</p> : <p>Aún no hay revisiones.</p>}
      {studio.revisions.map(revision => <p key={revision.id}>{revision.id.slice(0, 6)} {revision.branch} {revision.tag ?? ''} {revision.message}</p>)}
    </div>
  );
}

export function Center() {
  const studio = useStudio();
  if (studio.center === 'welcome') return <Welcome />;
  if (studio.center === 'editor') return <EditorPane />;
  if (studio.center === 'design' || studio.center === 'construct') return <DesignPane />;
  if (studio.center === 'research') return <ResearchPane />;
  if (studio.center === 'map') return <MapPane />;
  if (studio.center === 'atlas') return <TranslationalAtlas />;
  if (studio.center === 'chassis') return <ChassisPane />;
  if (studio.center === 'sim') return <SimPane />;
  if (studio.center === 'lab') return <LabPane />;
  if (studio.center === 'results') return <ResultsPane />;
  if (studio.center === 'safety') return <SafetyPane />;
  if (studio.center === 'tutorials') return <Tutorials />;
  if (studio.center === 'diff') return <DiffPane />;
  if (studio.center === 'workflows') return <Workflows />;
  return <SettingsPane />;
}

function Welcome() {
  const studio = useStudio();
  return (
    <div className="welcome">
      <div className="logo-lockup">
        <svg viewBox="0 0 64 64" width="54" height="54" aria-hidden>
          <rect width="64" height="64" rx="14" fill="#0d1117" />
          <path d="M18 44c8-16 20-16 28 0" stroke="#4ade80" strokeWidth="3" fill="none" />
          <path d="M18 32c8-16 20-16 28 0" stroke="#22d3ee" strokeWidth="3" fill="none" />
          <path d="M18 20c8-16 20-16 28 0" stroke="#818cf8" strokeWidth="3" fill="none" />
        </svg>
        <div>
          <h1>SynBio Studio</h1>
          <p>The Professional IDE for Synthetic Biology</p>
        </div>
      </div>
      <div className="welcome-grid">
        <section className="panel blue">
          <header>MAPA VIVO RECTOR <span>{studio.hypotheses.length > 1 ? 'ACTIVO' : 'BORRADOR'}</span></header>
          <p>{studio.projectOpen ? studio.circuit?.name ?? 'Programa sin definir' : 'Programa sin definir: Nuevo Workbench'}</p>
          <p className="muted">Puertas {studio.result.success && studio.circuit ? '1/1' : '0/1'}</p>
        </section>
        <section className="panel green">
          <header>MAPA VIVO WORKBENCH</header>
          <div className="row wrap">
            <Button onClick={studio.addChildNode}>Nuevo nodo hijo</Button>
            <Button onClick={studio.deleteBranch}>Eliminar rama</Button>
            <Button onClick={studio.undoHyp}>Regresar rama</Button>
            <Button onClick={studio.redoHyp}>Avanzar rama</Button>
            <Button onClick={studio.triggerGate}>Gatillo</Button>
            <Button tone="green" onClick={studio.launchStudio}>Lanzar Studio</Button>
          </div>
          <div className="row wrap">
            <Button onClick={() => studio.openProject('inverter.bio', 'editor')}>Modificar genoma</Button>
            <Button onClick={() => { studio.setCenter('chassis'); studio.setActivity('chassis'); }}>Abrir Células</Button>
            <Button onClick={() => document.getElementById('open-file')?.click()}>Abrir Archivo</Button>
            <Button onClick={() => document.getElementById('open-folder')?.click()}>Abrir Carpeta</Button>
          </div>
        </section>
      </div>
      <div className="flow">
        <button onClick={() => { studio.openProject('inverter.bio', 'design'); }}>Design</button>
        <button onClick={() => { studio.openProject(); studio.compileNow(); }}>Compile</button>
        <button onClick={() => { studio.openProject(); studio.simulateNow('ssa'); }}>Simulate</button>
        <button onClick={() => { studio.openProject(); studio.validateNow(); }}>Validate</button>
      </div>
      <pre className="code-card" onClick={() => studio.openProject('inverter.bio', 'editor')}>{studio.files.find(file => file.name === 'inverter.bio')?.contents}</pre>
    </div>
  );
}

function EditorPane() {
  const studio = useStudio();
  return (
    <div className="editor-pane">
      <div className="tabstrip">
        {studio.files.filter(file => file.language === 'bioscript').map(file => (
          <button key={file.name} className={file.name === studio.activeFile ? 'on' : ''} onClick={() => studio.setActiveFile(file.name)}>{file.name}</button>
        ))}
        <span className="muted">{studio.result.linesAnalyzed} líneas · GC en ANALYSIS</span>
      </div>
      <BioEditor value={studio.source} onChange={studio.setSource} diagnostics={studio.result.diagnostics} focusLine={studio.focusLine} />
    </div>
  );
}

function DesignPane() {
  const studio = useStudio();
  const [menu, setMenu] = useState<{ x: number; y: number; name: string } | null>(null);
  const [note, setNote] = useState('anotación');
  const nodes = studio.construct.nodes.filter(node => !studio.labelFilter || node.name.toLowerCase().includes(studio.labelFilter.toLowerCase()));
  const selected = studio.construct.nodes.find(node => node.id === studio.selectedPart) ?? nodes[0];
  const plasmid = useMemo(() => {
    const parts = studio.construct.nodes;
    const total = parts.reduce((sum, part) => sum + Math.max(part.sequence.length, 1), 0);
    let cursor = 0;
    return parts.map(part => {
      const span = Math.max(part.sequence.length, 1) / Math.max(total, 1);
      const start = cursor;
      cursor += span;
      return { ...part, start, span };
    });
  }, [studio.construct.nodes]);

  return (
    <div className="design">
      <div className="cad-toolbar">
        <Button onClick={() => studio.setCenter('construct')}>Constructo 3D</Button>
        <Button onClick={() => studio.setCad3d(!studio.cad3d)}>{studio.cad3d ? 'Glifos 2D' : 'Formas 3D'}</Button>
        <input value={studio.labelFilter} onChange={event => studio.setLabelFilter(event.target.value)} placeholder="Filtrar etiquetas" />
      </div>
      <div className="design-body">
        <div className="palette">
          {(['Reguladores', 'Traduccion', 'CDS/Genes', 'Marcadores'] as const).map(group => (
            <div key={group}>
              <h3>{group}</h3>
              {CATALOG.filter(part => part.group === group).map(part => (
                <button key={part.name} onClick={() => studio.insertNamedPart(part.name, part.type)} style={{ borderColor: GLYPH[part.type] }}>{part.name}</button>
              ))}
            </div>
          ))}
        </div>
        <div className="track-wrap">
          {studio.center === 'construct' ? <Construct3D /> : (
            <svg viewBox="0 0 920 180" className={studio.cad3d ? 'track iso' : 'track'} onClick={() => setMenu(null)}>
              <line x1="30" y1="90" x2="890" y2="90" stroke="#8b949e" strokeWidth="3" />
              {nodes.map((node, index) => {
                const x = 50 + index * 78;
                return (
                  <g key={node.id} transform={`translate(${x} 90)`} onClick={event => { event.stopPropagation(); studio.setSelectedPart(node.id); }} onContextMenu={event => { event.preventDefault(); setMenu({ x: event.clientX, y: event.clientY, name: node.name }); studio.setSelectedPart(node.id); }}>
                    <Glyph type={node.type} />
                    {studio.showLabels && <text y="48" textAnchor="middle" fill="#c9d1d9" fontSize="11">{node.name}</text>}
                  </g>
                );
              })}
            </svg>
          )}
          <svg viewBox="0 0 220 220" className="plasmid">
            <circle cx="110" cy="110" r="78" fill="none" stroke="#8b949e" strokeWidth="10" />
            {plasmid.map(part => {
              const a0 = part.start * Math.PI * 2 - Math.PI / 2;
              const a1 = (part.start + part.span) * Math.PI * 2 - Math.PI / 2;
              const large = part.span > 0.5 ? 1 : 0;
              const x0 = 110 + Math.cos(a0) * 78;
              const y0 = 110 + Math.sin(a0) * 78;
              const x1 = 110 + Math.cos(a1) * 78;
              const y1 = 110 + Math.sin(a1) * 78;
              return <path key={part.id} d={`M ${x0} ${y0} A 78 78 0 ${large} 1 ${x1} ${y1}`} stroke={GLYPH[part.type]} strokeWidth="12" fill="none" onClick={() => studio.setSelectedPart(part.id)} />;
            })}
            <text x="110" y="106" textAnchor="middle" fill="#c9d1d9" fontSize="12">{studio.circuit?.name ?? 'plásmido'}</text>
            <text x="110" y="124" textAnchor="middle" fill="#8b949e" fontSize="10">{plasmid.reduce((sum, part) => sum + part.sequence.length, 0)} bp</text>
          </svg>
        </div>
        <PartEditor selectedName={selected?.name} selectedType={selected?.type} selectedSequence={selected?.sequence} />
      </div>
      {menu && (
        <div className="context" style={{ left: menu.x, top: menu.y }}>
          <button onClick={() => { const seq = catalogSequence(menu.name) ?? ''; localStorage.setItem(`synbio-part-${menu.name}`, seq); studio.log(`${menu.name} guardado en la biblioteca local.`); setMenu(null); }}>Añadir a biblioteca</button>
          <button onClick={() => { studio.mutateSource(source => removePart(source, menu.name)); setMenu(null); }}>Eliminar pieza</button>
          <button onClick={() => { studio.mutateSource(source => annotatePart(source, menu.name, note)); setMenu(null); }}>Añadir anotación</button>
          <button onClick={() => { studio.setToolText(catalogSequence(menu.name) || selected?.sequence || 'Sin secuencia de catálogo.'); studio.setBottom('analysis'); setMenu(null); }}>Ver secuencia</button>
          <input value={note} onChange={event => setNote(event.target.value)} />
        </div>
      )}
    </div>
  );
}

function Glyph({ type }: { type: string }) {
  const color = GLYPH[type] ?? '#8b949e';
  if (type === 'promoter') return <polygon points="-16,-12 18,0 -16,12" fill={color} />;
  if (type === 'rbs') return <path d="M-14 0 A 14 14 0 0 1 14 0" stroke={color} strokeWidth="6" fill="none" />;
  if (type === 'terminator') return <path d="M0 16 V-16 M-12 -16 H12" stroke={color} strokeWidth="4" />;
  return <polygon points="-18,-12 10,-12 22,0 10,12 -18,12" fill={color} />;
}

function PartEditor({ selectedName, selectedType, selectedSequence }: { selectedName?: string; selectedType?: string; selectedSequence?: string }) {
  const studio = useStudio();
  const [name, setName] = useState(selectedName ?? '');
  const [sequence, setSequence] = useState(selectedSequence ?? '');
  const [description, setDescription] = useState('');
  React.useEffect(() => {
    setName(selectedName ?? '');
    setSequence(selectedSequence ?? '');
  }, [selectedName, selectedSequence]);
  if (!selectedName) return <aside className="part-editor"><p>Selecciona una pieza del carril o del mapa.</p></aside>;
  return (
    <aside className="part-editor">
      <h3>Pieza</h3>
      <label>Nombre<input value={name} onChange={event => setName(event.target.value)} /></label>
      <label>Tipo<input value={selectedType ?? ''} readOnly /></label>
      <label>Longitud bp<input value={String((sequence || '').replace(/[^ACGT]/gi, '').length)} readOnly /></label>
      <label>Descripción<input value={description} onChange={event => setDescription(event.target.value)} /></label>
      <label>Secuencia<textarea value={sequence} onChange={event => setSequence(event.target.value.toUpperCase())} /></label>
      <Button tone="green" onClick={() => {
        studio.mutateSource(source => {
          let next = name && name !== selectedName ? renamePart(source, selectedName, name) : source;
          const clean = sequence.replace(/[^ACGT]/g, '');
          if (clean && next.includes('sequence:')) next = next.replace(/sequence:\s*"[ACGT]*"/i, `sequence: "${clean}"`);
          if (description) next = annotatePart(next, name || selectedName, description);
          return next;
        });
      }}>Aplicar al BioScript</Button>
    </aside>
  );
}

function Construct3D() {
  const studio = useStudio();
  const nodes = studio.construct.nodes.filter(node => studio.group === 'todos' || node.type === studio.group);
  const visible = new Set(nodes.map(node => node.id));
  const placed = nodes.map((node, index) => {
    const angle = (index / Math.max(nodes.length, 1)) * Math.PI * 2 + studio.rotation;
    const z = Math.sin(angle);
    return {
      node,
      x: 260 + Math.cos(angle) * 140 * studio.separation + z * 28,
      y: 150 + Math.sin(angle * 0.5) * 50 * studio.separation - z * 16,
    };
  });
  const byId = new Map(placed.map(item => [item.node.id, item]));
  return (
    <div className="construct">
      <div className="row wrap">
        <label>Grupo
          <select value={studio.group} onChange={event => studio.setGroup(event.target.value)}>
            <option value="todos">Todos</option>
            <option value="promoter">Promotores</option>
            <option value="rbs">RBS</option>
            <option value="cds">CDS</option>
            <option value="reporter">Marcadores</option>
            <option value="terminator">Terminadores</option>
          </select>
        </label>
        <label>Separación <input type="range" min={0.6} max={1.6} step={0.05} value={studio.separation} onChange={event => studio.setSeparation(Number(event.target.value))} /></label>
        <label><input type="checkbox" checked={studio.showLabels} onChange={event => studio.setShowLabels(event.target.checked)} /> Etiquetas</label>
        <label>Orbitar <input type="range" min={0} max={6.28} step={0.05} value={studio.rotation} onChange={event => studio.setRotation(Number(event.target.value))} /></label>
      </div>
      <p>{studio.construct.nodes.length} piezas, {studio.construct.edges.length} conexiones</p>
      <svg viewBox="0 0 520 300">
        {studio.construct.edges.filter(edge => visible.has(edge.from) && visible.has(edge.to)).map((edge, index) => {
          const a = byId.get(edge.from);
          const b = byId.get(edge.to);
          if (!a || !b) return null;
          const color = edge.kind === 'repression' ? '#f85149' : edge.kind === 'activation' ? '#3fb950' : '#8b949e';
          return <line key={index} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={color} strokeWidth={edge.kind === 'adjacency' ? 2 : 2.5} />;
        })}
        {placed.map(item => (
          <g key={item.node.id} onClick={() => studio.setSelectedPart(item.node.id)}>
            <circle cx={item.x} cy={item.y} r="16" fill={GLYPH[item.node.type]} />
            {studio.showLabels && <text x={item.x} y={item.y + 28} textAnchor="middle" fill="#c9d1d9" fontSize="11">{item.node.name}</text>}
          </g>
        ))}
      </svg>
    </div>
  );
}

function ResearchPane() {
  const studio = useStudio();
  const gauges = studio.circuit ? researchGauges(studio.circuit) : null;
  const tabs = ['Overview', 'QA', 'Inventario', 'Build', 'CAD3D', 'Catalogo', 'Assembly', 'Sim', 'Metabolitos', 'Operones', 'Compartimentos', 'Host'];
  return (
    <div className="research">
      <div className="tabstrip">
        {tabs.map(tab => <button key={tab} className={studio.researchTab === tab ? 'on' : ''} onClick={() => studio.setResearchTab(tab)}>{tab}</button>)}
      </div>
      {gauges && (
        <div className="gauges">
          <Gauge label="AA" value={gauges.aa} max={300} />
          <Gauge label="GC%" value={gauges.gc} max={100} />
          <Gauge label="Codon" value={gauges.cai * 100} max={100} />
          <Gauge label="RBS" value={gauges.rbs * 100} max={100} />
          <Gauge label="Term" value={gauges.terminator * 100} max={100} />
        </div>
      )}
      <div className="hist">
        {(gauges?.codons ?? []).map(codon => (
          <div key={codon.codon}><span>{codon.codon}</span><i style={{ width: `${codon.count * 18}px` }} />{codon.count}</div>
        ))}
      </div>
      <ResearchBody tab={studio.researchTab} />
    </div>
  );
}

function Gauge({ label, value, max }: { label: string; value: number; max: number }) {
  return (
    <div className="gauge">
      <svg viewBox="0 0 80 48">
        <path d="M8 40 A 32 32 0 0 1 72 40" stroke="#30363d" strokeWidth="8" fill="none" />
        <path d="M8 40 A 32 32 0 0 1 72 40" stroke="#3fb950" strokeWidth="8" fill="none" strokeDasharray={`${Math.min(value / max, 1) * 100} 100`} />
      </svg>
      <strong>{label}</strong>
      <span>{value.toFixed(1)}</span>
    </div>
  );
}

function ResearchBody({ tab }: { tab: string }) {
  const studio = useStudio();
  if (tab === 'QA') {
    return (
      <div>
        {studio.result.diagnostics.map((item, index) => (
          <p key={index}>{item.code} L{item.line}: {item.message} <button onClick={studio.oracle}>Oráculo</button> <button onClick={() => studio.locate(item.line)}>Localizar</button></p>
        ))}
        {studio.result.diagnostics.length === 0 && <p>Sin problemas en el archivo activo.</p>}
      </div>
    );
  }
  if (tab === 'Inventario' || tab === 'Catalogo') return <button onClick={() => studio.runNamedTool('inventory')}>Generar inventario</button>;
  if (tab === 'Build') return <Button onClick={studio.runPipeline}>Ejecutar synbio.build.yaml</Button>;
  if (tab === 'CAD3D') return <Button onClick={() => studio.setCenter('construct')}>Abrir constructo 3D</Button>;
  if (tab === 'Assembly') return <Button onClick={() => studio.runNamedTool('golden-gate')}>Golden Gate</Button>;
  if (tab === 'Sim') return <Button onClick={() => studio.simulateNow('ssa')}>Lanzar SSA</Button>;
  if (tab === 'Metabolitos') return <Button onClick={() => studio.runNamedTool('fba')}>FBA núcleo E. coli</Button>;
  if (tab === 'Operones') return <p>{studio.circuit ? `${studio.circuit.transcriptionUnits.length} unidades de transcripción` : 'Sin operones.'}</p>;
  if (tab === 'Compartimentos') return <p>SBML usa un compartimento «cell» de 1e-15 L. El atlas de orgánulos está en Chassis.</p>;
  if (tab === 'Host') return <p>{studio.circuit?.chassisOrganism || 'Huésped no declarado en este archivo.'} Preferencia BSL del usuario: {studio.bslPref}</p>;
  return <p>{studio.circuit ? `${studio.circuit.name}: ${studio.circuit.partCount} piezas, ATP ${studio.circuit.atpCost.toFixed(1)}` : 'Compila un circuito.'}</p>;
}

function MapPane() {
  const studio = useStudio();
  const selected = studio.hypotheses.find(node => node.id === studio.selectedHyp);
  const [draft, setDraft] = useState(selected);
  React.useEffect(() => setDraft(selected), [selected]);
  return (
    <div className="map-view">
      <div className="row wrap">
        <Button onClick={studio.addChildNode}>Nuevo nodo hijo</Button>
        <Button onClick={studio.deleteBranch}>Eliminar rama</Button>
        <Button onClick={studio.undoHyp}>Regresar</Button>
        <Button onClick={studio.redoHyp}>Avanzar</Button>
        <Button onClick={studio.triggerGate}>Gatillo</Button>
        <Button tone="green" onClick={studio.launchStudio}>Lanzar Studio</Button>
      </div>
      <svg viewBox="0 0 640 280" className="hyp-graph">
        {studio.hypotheses.filter(node => node.parentId).map(node => {
          const parent = studio.hypotheses.find(item => item.id === node.parentId);
          if (!parent) return null;
          const nodes = studio.hypotheses;
          const yi = (id: string) => 40 + nodes.findIndex(item => item.id === id) * 36;
          return <line key={node.id} x1={parent.parentId ? 220 : 80} y1={yi(parent.id)} x2={220} y2={yi(node.id)} stroke="#58a6ff" />;
        })}
        {studio.hypotheses.map((node, index) => (
          <g key={node.id} onClick={() => studio.setSelectedHyp(node.id)}>
            <rect x={node.parentId ? 180 : 20} y={24 + index * 36} width="160" height="28" rx="6" fill={node.id === studio.selectedHyp ? '#238636' : '#21262d'} stroke="#30363d" />
            <text x={node.parentId ? 190 : 30} y={42 + index * 36} fill="#c9d1d9" fontSize="12">{node.name}</text>
          </g>
        ))}
      </svg>
      {draft && (
        <form className="hyp-form" onSubmit={event => { event.preventDefault(); studio.updateHyp(draft); }}>
          <h3>Definir rama operativa</h3>
          <label>Nombre<input value={draft.name} onChange={event => setDraft({ ...draft, name: event.target.value })} /></label>
          <label>Tipo<input value={draft.tipo} onChange={event => setDraft({ ...draft, tipo: event.target.value })} /></label>
          <label>Meta<input value={draft.meta} onChange={event => setDraft({ ...draft, meta: event.target.value })} /></label>
          <label>Hipótesis<textarea value={draft.hipotesis} onChange={event => setDraft({ ...draft, hipotesis: event.target.value })} /></label>
          <div className="row">
            <Button tone="green" onClick={() => studio.updateHyp(draft)}>Guardar</Button>
            <Button onClick={studio.deleteBranch}>Eliminar</Button>
          </div>
        </form>
      )}
    </div>
  );
}

function TranslationalAtlas() {
  const studio = useStudio();
  const [caso, setCaso] = useState('Inversor TetR');
  const [evidencia, setEvidencia] = useState('El compilador reconoce J23101, B0034, tetR y B0015.');
  const [decision, setDecision] = useState('Seguir en diseño. No es un protocolo de campo.');
  const [score, setScore] = useState(0.5);
  return (
    <div className="atlas-t">
      <p className="banner">Atlas translacional · casos conceptuales. No autoriza trabajo de banco ni de campo.</p>
      <label>Caso<input value={caso} onChange={event => setCaso(event.target.value)} /></label>
      <label>Evidencia<textarea value={evidencia} onChange={event => setEvidencia(event.target.value)} /></label>
      <label>Decisión<textarea value={decision} onChange={event => setDecision(event.target.value)} /></label>
      <label>Go/no-go {score.toFixed(2)}<input type="range" min={0} max={1} step={0.05} value={score} onChange={event => setScore(Number(event.target.value))} /></label>
      <Button tone="green" onClick={() => {
        studio.log(`Handoff «${caso}» → diseñador. Score ${score.toFixed(2)}.`);
        studio.setCenter('design');
        studio.setToolText(`${caso}\n${evidencia}\n${decision}`);
      }}>Handoff al diseñador</Button>
    </div>
  );
}

function ChassisPane() {
  const studio = useStudio();
  const layers = studio.organism === 'ecoli' ? ECOLI_LAYERS : PICHIA_LAYERS;
  const shown = studio.isolate ? layers.filter(layer => layer.group === studio.isolate) : layers;
  const [selected, setSelected] = useState<AtlasLayer>(layers[0]);
  const phenotype = studio.circuit?.transcriptionUnits.flatMap(tu => tu.parts).find(part => part.type === 'reporter')?.name;
  const fill = phenotype === 'RFP' ? '#f85149' : phenotype === 'GFP' ? '#3fb950' : '#6ea8fe';
  const groups = ['Envoltura', 'Interior', 'Apéndices', 'Superficie', 'Comunidad'];
  return (
    <div className="chassis">
      <p className="banner">Chassis Studio · conceptual-prelab. Esquema anatómico, no una reconstrucción ni una autorización de liberación.</p>
      <div className="row wrap">
        <select value={studio.organism} onChange={event => studio.setOrganism(event.target.value as 'ecoli' | 'pichia')}>
          <option value="ecoli">E. coli DH5α</option>
          <option value="pichia">P. pastoris</option>
        </select>
        <Button onClick={() => studio.setCut(!studio.cut)}>{studio.cut ? 'Vista completa' : 'Vista corte anatómico'}</Button>
        <label>Zoom <input type="range" min={0.7} max={1.6} step={0.05} value={studio.zoom} onChange={event => studio.setZoom(Number(event.target.value))} /></label>
        <label>Plano de corte <input type="range" min={0} max={1} step={0.05} value={studio.cut ? 0.55 : 0} onChange={() => studio.setCut(true)} /></label>
        <label>Despiece <input type="range" min={0} max={40} value={studio.explode} onChange={event => studio.setExplode(Number(event.target.value))} /></label>
      </div>
      <div className="row wrap">
        {groups.map(group => <Button key={group} onClick={() => studio.setIsolate(studio.isolate === group ? null : group)}>{group}</Button>)}
      </div>
      <div className="chassis-body">
        <svg viewBox="0 0 360 220" style={{ transform: `scale(${studio.zoom})` }}>
          <ellipse cx="180" cy="110" rx={studio.organism === 'ecoli' ? 150 : 90} ry={studio.organism === 'ecoli' ? 60 : 80} fill={fill} opacity={studio.cut ? 0.35 : 0.8} />
          {studio.cut && <rect x="180" y="20" width="180" height="180" fill="#0d1117" opacity="0.55" />}
          {shown.map(layer => (
            <g key={layer.id} onClick={() => setSelected(layer)} transform={`translate(${layer.x * (1 + studio.explode / 40)} ${layer.y * (1 + studio.explode / 40)})`}>
              <circle cx="180" cy="110" r={layer.group === 'Envoltura' ? 18 : 12} fill={layer.color} stroke="#fff" />
              <text x="180" y="140" textAnchor="middle" fill="#c9d1d9" fontSize="10">{layer.name}</text>
            </g>
          ))}
        </svg>
        <aside>
          <h3>{selected.name}</h3>
          <p>{selected.description}</p>
          <p>Color {selected.color}</p>
          <p>Tamaño {selected.size}</p>
          <p>XYZ esquemático {selected.x}, {selected.y}, {selected.z}</p>
          <p>Visible: {shown.some(layer => layer.id === selected.id) ? 'sí' : 'no'}</p>
          {phenotype && <p>Fenotipo del circuito: {phenotype}. El color del citoplasma sale del marcador compilado.</p>}
          <h3>Cuaderno de observaciones</h3>
          <textarea value={studio.notebook} onChange={event => studio.setNotebook(event.target.value)} />
          <Button tone="green" onClick={studio.saveNotebook}>Guardar ficha</Button>
        </aside>
      </div>
    </div>
  );
}

function SimPane() {
  const studio = useStudio();
  const links = studio.construct.edges.filter(edge => edge.kind === 'repression' || edge.kind === 'activation');
  return (
    <div className="sim-pane">
      <div className="row">
        <Button tone="green" onClick={() => studio.simulateNow('ssa')}>Gillespie SSA</Button>
        <Button onClick={() => studio.simulateNow('ode')}>ODE</Button>
        <Button onClick={() => studio.runNamedTool('fba')}>FBA</Button>
      </div>
      <div className="sim-split">
        <SimulationView result={studio.sim} isRunning={studio.simRunning} />
        <svg viewBox="0 0 280 220">
          <text x="10" y="18" fill="#8b949e" fontSize="12">Red regulatoria</text>
          {links.map((edge, index) => (
            <g key={index}>
              <line x1="40" y1={40 + index * 36} x2="200" y2={50 + index * 28} stroke={edge.kind === 'repression' ? '#f85149' : '#3fb950'} />
              <text x="8" y={44 + index * 36} fill="#c9d1d9" fontSize="11">{edge.from.split(':').pop()} {edge.kind === 'repression' ? '⊣' : '→'} {edge.to.split(':').pop()}</text>
            </g>
          ))}
          {links.length === 0 && <text x="10" y="48" fill="#8b949e" fontSize="12">Este circuito no tiene un par TF–promotor conocido.</text>}
        </svg>
      </div>
    </div>
  );
}

function LabPane() {
  const studio = useStudio();
  const parts = studio.construct.nodes;
  const wells = Array.from({ length: 96 }, (_, index) => {
    const row = 'ABCDEFGH'[Math.floor(index / 12)];
    const col = (index % 12) + 1;
    const part = parts[index % Math.max(parts.length, 1)];
    return { id: `${row}${col}`, part: parts.length ? part?.name : '' };
  });
  return (
    <div className="lab">
      <div className="row wrap">
        <Button onClick={() => studio.downloadText(`${studio.circuit?.name ?? 'protocol'}.md`, studio.protocol)}>Descargar protocolo</Button>
        <Button onClick={() => studio.downloadText('assembly.py', studio.ot)}>Descargar OpenTrons</Button>
        <Button onClick={() => studio.runNamedTool('hamilton')}>Worklist Hamilton</Button>
        <Button onClick={() => { studio.log('Experimento del día registrado en el cuaderno local.'); studio.setEln(`${studio.eln}\n${new Date().toISOString()} ${studio.circuit?.name ?? 'sin circuito'}`); }}>Añadir experimento</Button>
      </div>
      <p className="muted">OT-2 :31950 no está conectado. El archivo Python es el protocolo, no una ejecución.</p>
      <div className="plate">
        {wells.map(well => (
          <button key={well.id} className={studio.plateWell === well.id ? 'on' : ''} title={well.part} onClick={() => studio.setPlateWell(well.id)}>{well.id}</button>
        ))}
      </div>
      <p>{studio.plateWell ? `${studio.plateWell}: ${wells.find(well => well.id === studio.plateWell)?.part || 'vacío'}` : 'Pulsa un pocillo.'}</p>
      <textarea value={studio.eln} onChange={event => studio.setEln(event.target.value)} placeholder="ELN local" />
      <Button onClick={studio.saveProject}>Guardar ELN con el proyecto</Button>
      <textarea value={studio.equipment} onChange={event => studio.setEquipment(event.target.value)} />
    </div>
  );
}

function ResultsPane() {
  const studio = useStudio();
  return (
    <div className="results">
      <p>Importa CSV (media y desviación) o FCS (segmento TEXT). No hay lector de placas ni citómetro conectado.</p>
      <pre>{studio.csvSummary}</pre>
      <pre>{studio.fcsText}</pre>
    </div>
  );
}

function SafetyPane() {
  const studio = useStudio();
  return (
    <div className="safety">
      <p className="banner">Revisión in silico. No sustituye una autorización de laboratorio.</p>
      <div className="row wrap">
        <Button onClick={() => studio.runNamedTool('biosecurity')}>Escanear</Button>
        <Button onClick={() => studio.runNamedTool('bsl')}>BSL</Button>
        <Button onClick={() => studio.runNamedTool('toxin')}>Toxinas</Button>
        <Button onClick={() => studio.runNamedTool('containment')}>Contención</Button>
        <Button onClick={studio.oracle}>Insertar kill switch si falta</Button>
      </div>
      <h3>Cadena de auditoría local</h3>
      {studio.audit.map(entry => <p key={entry.hash}>{entry.time} {entry.hash} ← {entry.prev}<br />{entry.summary}</p>)}
      <pre>{studio.toolText}</pre>
    </div>
  );
}

function Tutorials() {
  return (
    <div className="tutor">
      <h2>Tutoriales integrados</h2>
      <ol>
        <li>Nuevo Proyecto abre inverter.bio con la sintaxis de campos del escritorio.</li>
        <li>Compile llena OUTPUT, PROBLEMAS, LLVM IR, SBOL/SBML, OpenTrons, coste y protocolo.</li>
        <li>Simulate ejecuta Gillespie SSA en este hilo. ODE es un Euler aparte. FBA usa el símplex del cliente.</li>
        <li>Validate registra un hash encadenado y el escáner de palabras clave BSL.</li>
      </ol>
      <h3>Literatura usada por las herramientas</h3>
      {LITERATURE.map(item => <p key={item.id}><strong>{item.topic}.</strong> {item.cite}</p>)}
    </div>
  );
}

function DiffPane() {
  const studio = useStudio();
  const other = studio.files.find(file => file.name === studio.compareFile)?.contents ?? '';
  const left = new Set(studio.circuit?.transcriptionUnits.flatMap(tu => tu.parts.map(part => part.name)) ?? []);
  const rightCircuit = other;
  return (
    <div className="diff">
      <label>Comparar con
        <select value={studio.compareFile} onChange={event => studio.setCompareFile(event.target.value)}>
          {studio.files.map(file => <option key={file.name}>{file.name}</option>)}
        </select>
      </label>
      <pre>{lineDiff(studio.source, other, studio.activeFile)}</pre>
      <p>Piezas del archivo activo: {[...left].join(', ') || 'ninguna'}. El otro archivo tiene {rightCircuit.length} caracteres.</p>
    </div>
  );
}

function Workflows() {
  const studio = useStudio();
  const flows = [
    { id: 'biosensor', title: 'Biosensor', example: 'biosensor-arsenico', step: 'Carga el ejemplo y compila.' },
    { id: 'cds', title: 'CDS', example: 'hello-bio', step: 'Optimiza codones del CDS compilado.' },
    { id: 'crispri', title: 'CRISPRi', example: 'toggle-switch', step: 'Lista guías NGG del CDS. Sin modelo de off-target.' },
    { id: 'plasmid', title: 'Plásmido', example: '', step: 'Abre constructo.bio y el mapa circular.' },
  ];
  return (
    <div className="flows">
      {flows.map(flow => (
        <section key={flow.id}>
          <h3>{flow.title}</h3>
          <p>{flow.step}</p>
          <Button tone="green" onClick={() => {
            studio.setWorkflow(flow.id);
            if (flow.id === 'plasmid') {
              studio.openProject('constructo.bio', 'design');
              return;
            }
            if (flow.example) studio.openExample(flow.example);
            if (flow.id === 'cds') studio.runNamedTool('codon');
            if (flow.id === 'crispri') studio.runNamedTool('crispr');
            if (flow.id === 'biosensor') studio.compileNow();
          }}>Ejecutar</Button>
        </section>
      ))}
      <p>Flujo activo: {studio.workflow}. Ejemplos disponibles: {EXAMPLES.map(example => example.title).join(', ')}.</p>
    </div>
  );
}

function SettingsPane() {
  const studio = useStudio();
  return (
    <div className="settings">
      <h2>Configuración</h2>
      <label>BSL máximo que quieres recordar
        <input type="number" min={1} max={4} value={studio.bslPref} onChange={event => studio.setBslPref(Number(event.target.value))} />
      </label>
      <label><input type="checkbox" checked={studio.telemetry} onChange={event => studio.setTelemetry(event.target.checked)} /> Telemetría (no hay envío: no existe Sentry en esta página)</label>
      <label>Nota de secretos (no es bóveda del sistema)
        <textarea value={studio.secretsNote} onChange={event => studio.setSecretsNote(event.target.value)} />
      </label>
      <p>Tema fijo oscuro del IDE. Actualizador de Electron: no aplica.</p>
      <h3>Organismos</h3>
      {ORGANISMS.map(org => <p key={org.name}>{org.group}: {org.name} · BSL-{org.bsl}. {org.note}</p>)}
    </div>
  );
}

export function Bottom() {
  const studio = useStudio();
  const [command, setCommand] = useState('');
  const tabs: { id: typeof studio.bottom; label: string }[] = [
    { id: 'output', label: 'OUTPUT' },
    { id: 'problems', label: 'PROBLEMAS' },
    { id: 'terminal', label: 'TERMINAL' },
    { id: 'ports', label: 'PORTS' },
    { id: 'llvm', label: 'LLVM IR' },
    { id: 'sbol', label: 'SBOL/SBML' },
    { id: 'opentrons', label: 'OPENTRONS' },
    { id: 'cost', label: 'COST' },
    { id: 'protocol', label: 'PROTOCOL' },
    { id: 'analysis', label: 'ANALYSIS' },
  ];
  return (
    <section className="bottom">
      <div className="tabstrip">
        {tabs.map(tab => <button key={tab.id} className={studio.bottom === tab.id ? 'on' : ''} onClick={() => studio.setBottom(tab.id)}>{tab.label}{tab.id === 'problems' && studio.result.diagnostics.length ? ` ${studio.result.diagnostics.length}` : ''}</button>)}
      </div>
      <div className="bottom-body">
        {studio.bottom === 'output' && <pre>{studio.logs.join('\n')}</pre>}
        {studio.bottom === 'problems' && (
          <div>
            {studio.result.diagnostics.map((item, index) => (
              <p key={index}><strong>{item.severity} {item.code}</strong> L{item.line}: {item.message} <button onClick={studio.oracle}>Oráculo</button> <button onClick={() => studio.locate(item.line)}>Localizar</button></p>
            ))}
            {studio.result.diagnostics.length === 0 && <p>Sin problemas.</p>}
          </div>
        )}
        {studio.bottom === 'terminal' && (
          <div>
            <pre>{studio.terminal.join('\n')}</pre>
            <form onSubmit={event => { event.preventDefault(); studio.runCommand(command); setCommand(''); }}>
              <input value={command} onChange={event => setCommand(event.target.value)} placeholder="help" />
            </form>
          </div>
        )}
        {studio.bottom === 'ports' && (
          <ul>
            <li>bioscript-compiler — en proceso, listo</li>
            <li>gillespie-ssa — en proceso</li>
            <li>ode-euler — en proceso</li>
            <li>fba-simplex — en proceso</li>
            <li>nussinov-rna — en proceso, ventanas de 80 nt</li>
            <li>synbio-lsp — no ejecutado (binario Rust)</li>
            <li>python-engine :8765 — no ejecutado</li>
            <li>opentrons :31950 — sin robot</li>
            <li>colaboración websocket — sin servidor</li>
          </ul>
        )}
        {studio.bottom === 'llvm' && <pre>{studio.llvm}</pre>}
        {studio.bottom === 'sbol' && (
          <div>
            <div className="row">
              <Button onClick={() => studio.downloadText('circuit.sbol', studio.sbol)}>Descargar SBOL</Button>
              <Button onClick={() => studio.downloadText('circuit.sbml', studio.sbml)}>Descargar SBML</Button>
              <Button onClick={() => studio.downloadText('circuit.fasta', studio.fasta)}>FASTA</Button>
              <Button onClick={() => studio.downloadText('circuit.gb', studio.genbank)}>GenBank</Button>
            </div>
            <pre>{studio.sbol}</pre>
            <pre>{studio.sbml}</pre>
          </div>
        )}
        {studio.bottom === 'opentrons' && <pre>{studio.ot}</pre>}
        {studio.bottom === 'cost' && <pre>{studio.costText}</pre>}
        {studio.bottom === 'protocol' && <pre>{studio.protocol}</pre>}
        {studio.bottom === 'analysis' && <pre>{studio.toolText}</pre>}
      </div>
    </section>
  );
}

export function onFilesPicked(files: FileList, folder: boolean, studio: ReturnType<typeof useStudio>) {
  void folder;
  Array.from(files).forEach(file => {
    if (file.name.toLowerCase().endsWith('.fcs')) {
      file.arrayBuffer().then(buffer => studio.importFcs(buffer, file.name));
      return;
    }
    file.text().then(text => studio.importTextFile(file.name, text));
  });
}
