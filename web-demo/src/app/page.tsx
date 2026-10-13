'use client';

import React, { useState, useCallback, useRef, useEffect } from 'react';
import dynamic from 'next/dynamic';
import Header from '@/components/Header';
import ExamplesPanel from '@/components/ExamplesPanel';
import CircuitView from '@/components/CircuitView';
import SimulationView from '@/components/SimulationView';
import DiagnosticsView from '@/components/DiagnosticsView';
import ExportModal from '@/components/ExportModal';
import { compile, type CompilerResult, type Circuit } from '@/lib/compiler';
import { simulate, type SimulationResult } from '@/lib/simulator';
import { EXAMPLES } from '@/lib/examples';
import {
  Play, Download, BookOpen, PanelLeftClose, PanelLeftOpen,
  Dna, Activity, AlertCircle, FileCode, Timer, Hash,
  ChevronDown,
} from 'lucide-react';

// Dynamic import for Monaco (client-only)
const BioEditor = dynamic(() => import('@/components/BioEditor'), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center bg-surface-950">
      <div className="flex items-center gap-3 text-surface-400">
        <div className="h-5 w-5 rounded-full border-2 border-surface-600 border-t-bio-400 animate-spin" />
        <span className="text-sm">Cargando editor...</span>
      </div>
    </div>
  ),
});

// Tab types for the right panels
type RightTab = 'circuit' | 'simulation' | 'diagnostics';

export default function HomePage() {
  // State
  const [code, setCode] = useState(EXAMPLES[0].code);
  const [compilerResult, setCompilerResult] = useState<CompilerResult | null>(null);
  const [simulationResult, setSimulationResult] = useState<SimulationResult | null>(null);
  const [isSimulating, setIsSimulating] = useState(false);
  const [showExamples, setShowExamples] = useState(true);
  const [activeTab, setActiveTab] = useState<RightTab>('circuit');
  const [exportCircuit, setExportCircuit] = useState<Circuit | null>(null);
  const [showExportModal, setShowExportModal] = useState(false);

  const compileTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Auto-compile on code change (debounced)
  useEffect(() => {
    if (compileTimeoutRef.current) {
      clearTimeout(compileTimeoutRef.current);
    }
    compileTimeoutRef.current = setTimeout(() => {
      const result = compile(code);
      setCompilerResult(result);
    }, 300);

    return () => {
      if (compileTimeoutRef.current) clearTimeout(compileTimeoutRef.current);
    };
  }, [code]);

  // Run simulation
  const handleSimulate = useCallback(() => {
    if (!compilerResult || compilerResult.circuits.length === 0) return;

    setIsSimulating(true);
    setActiveTab('simulation');

    // Run in next tick to let UI update
    setTimeout(() => {
      const result = simulate(compilerResult.circuits[0], {
        totalTime: 7200,
        maxSteps: 30000,
      });
      setSimulationResult(result);
      setIsSimulating(false);
    }, 50);
  }, [compilerResult]);

  // Handle example selection
  const handleExampleSelect = useCallback((exampleCode: string) => {
    setCode(exampleCode);
    setSimulationResult(null);
  }, []);

  // Export
  const handleExport = useCallback(() => {
    if (compilerResult && compilerResult.circuits.length > 0) {
      setExportCircuit(compilerResult.circuits[0]);
      setShowExportModal(true);
    }
  }, [compilerResult]);

  // Compile stats
  const errors = compilerResult?.diagnostics.filter(d => d.severity === 'error').length ?? 0;
  const warnings = compilerResult?.diagnostics.filter(d => d.severity === 'warning').length ?? 0;
  const infos = compilerResult?.diagnostics.filter(d => d.severity === 'info').length ?? 0;
  const hasCircuits = (compilerResult?.circuits.length ?? 0) > 0;

  return (
    <div className="flex h-screen flex-col overflow-hidden">
      <Header />

      {/* Main content */}
      <div className="flex flex-1 overflow-hidden">
        {/* Examples sidebar */}
        <ExamplesPanel
          onSelect={handleExampleSelect}
          isOpen={showExamples}
          onToggle={() => setShowExamples(false)}
        />

        {/* Main workspace */}
        <div className="flex flex-1 flex-col overflow-hidden">
          {/* Toolbar */}
          <div className="flex items-center justify-between border-b border-surface-800 bg-surface-950/80 px-4 py-2">
            <div className="flex items-center gap-2">
              {/* Toggle examples */}
              <button
                onClick={() => setShowExamples(!showExamples)}
                className="flex items-center gap-1.5 rounded-lg border border-surface-700 bg-surface-800/50 px-3 py-1.5 text-xs text-surface-400 transition-all hover:border-surface-600 hover:text-white"
                title={showExamples ? 'Ocultar ejemplos' : 'Mostrar ejemplos'}
              >
                {showExamples ? <PanelLeftClose className="h-3.5 w-3.5" /> : <PanelLeftOpen className="h-3.5 w-3.5" />}
                <span className="hidden sm:inline">Ejemplos</span>
              </button>

              {/* Compile status */}
              {compilerResult && (
                <div className="flex items-center gap-3 ml-2">
                  <span className={`flex items-center gap-1 text-xs font-medium ${compilerResult.success ? 'text-green-400' : 'text-red-400'}`}>
                    <div className={`h-2 w-2 rounded-full ${compilerResult.success ? 'bg-green-500' : 'bg-red-500'} animate-pulse`} />
                    {compilerResult.success ? 'Compilado' : 'Errores'}
                  </span>
                  <span className="flex items-center gap-1 text-[10px] text-surface-500">
                    <Timer className="h-3 w-3" />
                    {compilerResult.parseTime}ms
                  </span>
                  <span className="flex items-center gap-1 text-[10px] text-surface-500">
                    <Hash className="h-3 w-3" />
                    {compilerResult.tokensCount} tokens
                  </span>
                </div>
              )}
            </div>

            <div className="flex items-center gap-2">
              {/* Simulate button */}
              <button
                onClick={handleSimulate}
                disabled={!hasCircuits || isSimulating}
                className="flex items-center gap-1.5 rounded-lg bg-bio-600 px-4 py-1.5 text-sm font-medium text-white shadow-lg shadow-bio-600/20 transition-all hover:bg-bio-500 disabled:opacity-40 disabled:cursor-not-allowed disabled:shadow-none"
              >
                <Play className="h-3.5 w-3.5" />
                {isSimulating ? 'Simulando...' : 'Simular'}
              </button>

              {/* Export button */}
              <button
                onClick={handleExport}
                disabled={!hasCircuits}
                className="flex items-center gap-1.5 rounded-lg border border-surface-700 bg-surface-800/50 px-3 py-1.5 text-sm text-surface-300 transition-all hover:border-bio-500/50 hover:text-white disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Download className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Exportar</span>
              </button>
            </div>
          </div>

          {/* Editor + Panels */}
          <div className="flex flex-1 overflow-hidden">
            {/* Left: Code Editor */}
            <div className="flex flex-1 flex-col border-r border-surface-800" style={{ minWidth: '40%' }}>
              {/* Editor tab bar */}
              <div className="flex items-center justify-between border-b border-surface-800 bg-surface-900/50 px-3 py-1.5">
                <div className="flex items-center gap-2">
                  <FileCode className="h-3.5 w-3.5 text-bio-400" />
                  <span className="text-xs font-medium text-surface-300">circuit.bio</span>
                  <span className="text-[10px] text-surface-600">— BioScript</span>
                </div>
                <span className="text-[10px] text-surface-600">
                  {compilerResult?.linesAnalyzed ?? 0} líneas
                </span>
              </div>
              {/* Monaco Editor */}
              <div className="flex-1">
                <BioEditor
                  value={code}
                  onChange={setCode}
                  diagnostics={compilerResult?.diagnostics ?? []}
                />
              </div>
              {/* Bottom status with diagnostics summary */}
              <div className="flex items-center gap-3 border-t border-surface-800 bg-surface-900/30 px-4 py-1">
                {errors > 0 && (
                  <button onClick={() => setActiveTab('diagnostics')} className="flex items-center gap-1 text-xs text-red-400 hover:text-red-300">
                    <AlertCircle className="h-3 w-3" /> {errors}
                  </button>
                )}
                {warnings > 0 && (
                  <button onClick={() => setActiveTab('diagnostics')} className="flex items-center gap-1 text-xs text-amber-400 hover:text-amber-300">
                    <AlertCircle className="h-3 w-3" /> {warnings}
                  </button>
                )}
                {infos > 0 && (
                  <button onClick={() => setActiveTab('diagnostics')} className="flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300">
                    <AlertCircle className="h-3 w-3" /> {infos}
                  </button>
                )}
                {errors === 0 && warnings === 0 && compilerResult && (
                  <span className="text-xs text-green-500/70">✓ Sin problemas</span>
                )}
              </div>
            </div>

            {/* Right: Tabbed panels */}
            <div className="flex flex-1 flex-col" style={{ minWidth: '35%' }}>
              {/* Tabs */}
              <div className="flex border-b border-surface-800 bg-surface-900/50">
                <TabButton
                  active={activeTab === 'circuit'}
                  onClick={() => setActiveTab('circuit')}
                  icon={<Dna className="h-3.5 w-3.5" />}
                  label="Circuito"
                  badge={hasCircuits ? compilerResult!.circuits.length : undefined}
                />
                <TabButton
                  active={activeTab === 'simulation'}
                  onClick={() => setActiveTab('simulation')}
                  icon={<Activity className="h-3.5 w-3.5" />}
                  label="Simulación"
                  badge={simulationResult ? '✓' : undefined}
                />
                <TabButton
                  active={activeTab === 'diagnostics'}
                  onClick={() => setActiveTab('diagnostics')}
                  icon={<AlertCircle className="h-3.5 w-3.5" />}
                  label="Diagnósticos"
                  badge={errors + warnings + infos || undefined}
                  badgeColor={errors > 0 ? 'bg-red-500' : warnings > 0 ? 'bg-amber-500' : 'bg-blue-500'}
                />
              </div>

              {/* Tab content */}
              <div className="flex-1 overflow-hidden">
                {activeTab === 'circuit' && (
                  <CircuitView circuits={compilerResult?.circuits ?? []} />
                )}
                {activeTab === 'simulation' && (
                  <SimulationView result={simulationResult} isRunning={isSimulating} />
                )}
                {activeTab === 'diagnostics' && (
                  <DiagnosticsView diagnostics={compilerResult?.diagnostics ?? []} />
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Export Modal */}
      {exportCircuit && (
        <ExportModal
          circuit={exportCircuit}
          isOpen={showExportModal}
          onClose={() => setShowExportModal(false)}
        />
      )}
    </div>
  );
}

// ─── Tab Button Component ────────────────────────────────────

function TabButton({
  active,
  onClick,
  icon,
  label,
  badge,
  badgeColor = 'bg-bio-500',
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  badge?: number | string;
  badgeColor?: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 px-4 py-2.5 text-xs font-medium transition-all ${
        active ? 'tab-active' : 'tab-inactive'
      }`}
    >
      {icon}
      <span className="hidden sm:inline">{label}</span>
      {badge !== undefined && (
        <span className={`inline-flex h-4 min-w-[16px] items-center justify-center rounded-full px-1 text-[10px] font-bold text-white ${badgeColor}`}>
          {badge}
        </span>
      )}
    </button>
  );
}
