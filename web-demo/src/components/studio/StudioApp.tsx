'use client';

import React from 'react';
import { StudioProvider, useStudio, type Activity } from './studio-context';
import { Bottom, Center, Sidebar, onFilesPicked } from './panels';
import { ReleaseTitleLink } from './release-notice';

const ACTIVITIES: { id: Activity; label: string }[] = [
  { id: 'explorer', label: 'Explorer' },
  { id: 'map', label: 'Mapa' },
  { id: 'workflows', label: 'Flujos' },
  { id: 'search', label: 'Buscar' },
  { id: 'parts', label: 'Partes' },
  { id: 'sim', label: 'Sim' },
  { id: 'design', label: 'CAD' },
  { id: 'lab', label: 'Lab' },
  { id: 'results', label: 'Datos' },
  { id: 'atlas', label: 'Atlas' },
  { id: 'chassis', label: 'Chasis' },
  { id: 'safety', label: 'BSL' },
  { id: 'tutorials', label: 'Tutor' },
  { id: 'diff', label: 'Diff' },
  { id: 'bookmarks', label: 'Marks' },
  { id: 'outline', label: 'Outline' },
  { id: 'git', label: 'Hist' },
  { id: 'settings', label: 'Ajustes' },
  { id: 'panels', label: 'Paneles' },
];

class PanelBoundary extends React.Component<{ children: React.ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  render() {
    if (this.state.error) {
      return (
        <div className="welcome">
          <h2>Esta vista se detuvo</h2>
          <p className="muted">{this.state.error.message}</p>
          <button type="button" className="studio-btn" onClick={() => this.setState({ error: null })}>Reintentar</button>
        </div>
      );
    }
    return this.props.children;
  }
}

function Shell() {
  const studio = useStudio();
  return (
    <div className="studio">
      <header className="titlebar">
        <strong>SynBio Studio</strong>
        <button type="button" onClick={() => { studio.setActivity('map'); studio.setCenter('map'); }}>Mapa Vivo</button>
        <button type="button" onClick={() => studio.setCenter('programa')}>Programa</button>
        <button type="button" onClick={() => { studio.setActivity('lab'); studio.setCenter('lab'); }}>Lab Run</button>
        <button type="button" onClick={() => studio.setCenter('hub')}>Design Hub</button>
        <button type="button" onClick={() => studio.setCenter('entorno')}>Entorno</button>
        <button type="button" onClick={studio.newBioScript}>+ BioScript</button>
        <button type="button" onClick={() => document.getElementById('open-file')?.click()}>Abrir</button>
        <button type="button" onClick={studio.saveProject}>Guardar</button>
        <span className="spacer" />
        <ReleaseTitleLink />
        <span>{studio.activeFile}</span>
      </header>
      <div className="studio-body">
        <nav className="activity">
          {ACTIVITIES.map(item => (
            <button
              key={item.id}
              className={studio.activity === item.id ? 'on' : ''}
              onClick={() => {
                studio.setActivity(item.id);
                const direct: Partial<Record<Activity, typeof studio.center>> = {
                  map: 'map', workflows: 'workflows', sim: 'sim', design: 'design', lab: 'lab', results: 'results',
                  atlas: 'atlas', chassis: 'chassis', safety: 'safety', tutorials: 'tutorials', diff: 'diff', settings: 'settings',
                  panels: 'webview',
                };
                if (direct[item.id]) studio.setCenter(direct[item.id]!);
              }}
              title={item.label}
            >
              {item.label}
            </button>
          ))}
        </nav>
        <aside className="sidebar">
          <PanelBoundary key={studio.activity}>
            <Sidebar />
          </PanelBoundary>
        </aside>
        <main>
          <PanelBoundary key={studio.center}>
            <Center />
          </PanelBoundary>
          {studio.bottomOpen && <Bottom />}
        </main>
      </div>
      <footer className="statusbar">
        <span>{studio.result.success ? 'compilado' : 'diagnósticos'} · {studio.result.diagnostics.length}</span>
        <span>{studio.circuit ? `${studio.circuit.partCount} piezas` : 'sin circuito'}</span>
        <button type="button" onClick={() => studio.setBottomOpen(!studio.bottomOpen)}>{studio.bottomOpen ? 'Ocultar panel' : 'CENTRO DE CONTROL INFERIOR'}</button>
        <span>BSL preferido {studio.bslPref}</span>
      </footer>
      <input id="open-file" type="file" hidden accept=".bio,.synbio,.dna,.sbol,.xml,.fasta,.fa,.fna,.gb,.gbk,.txt,.csv,.fcs" onChange={event => { if (event.target.files) onFilesPicked(event.target.files, false, studio); event.target.value = ''; }} />
      <input id="open-folder" type="file" hidden multiple {...{ webkitdirectory: '', directory: '' }} onChange={event => { if (event.target.files) onFilesPicked(event.target.files, true, studio); event.target.value = ''; }} />
    </div>
  );
}

export default function StudioApp() {
  return (
    <StudioProvider>
      <Shell />
    </StudioProvider>
  );
}
