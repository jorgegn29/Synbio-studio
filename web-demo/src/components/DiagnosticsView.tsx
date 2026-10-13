'use client';

import React from 'react';
import type { Diagnostic } from '@/lib/compiler';
import { AlertCircle, AlertTriangle, Info, CheckCircle2, Lightbulb } from 'lucide-react';

interface DiagnosticsViewProps {
  diagnostics: Diagnostic[];
}

const severityConfig = {
  error: {
    icon: AlertCircle,
    color: 'text-red-400',
    bg: 'bg-red-500/10',
    border: 'border-red-500/20',
    label: 'Error',
  },
  warning: {
    icon: AlertTriangle,
    color: 'text-amber-400',
    bg: 'bg-amber-500/10',
    border: 'border-amber-500/20',
    label: 'Warning',
  },
  info: {
    icon: Info,
    color: 'text-blue-400',
    bg: 'bg-blue-500/10',
    border: 'border-blue-500/20',
    label: 'Info',
  },
};

export default function DiagnosticsView({ diagnostics }: DiagnosticsViewProps) {
  const errors = diagnostics.filter(d => d.severity === 'error').length;
  const warnings = diagnostics.filter(d => d.severity === 'warning').length;
  const infos = diagnostics.filter(d => d.severity === 'info').length;

  if (diagnostics.length === 0) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-center">
          <CheckCircle2 className="mx-auto h-8 w-8 text-green-500 mb-2" />
          <p className="text-sm font-medium text-green-400">Sin problemas</p>
          <p className="text-xs text-surface-500 mt-1">El circuito compila correctamente</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      {/* Summary bar */}
      <div className="flex items-center gap-3 border-b border-surface-800 px-4 py-2">
        {errors > 0 && (
          <span className="flex items-center gap-1 text-xs font-medium text-red-400">
            <AlertCircle className="h-3.5 w-3.5" /> {errors}
          </span>
        )}
        {warnings > 0 && (
          <span className="flex items-center gap-1 text-xs font-medium text-amber-400">
            <AlertTriangle className="h-3.5 w-3.5" /> {warnings}
          </span>
        )}
        {infos > 0 && (
          <span className="flex items-center gap-1 text-xs font-medium text-blue-400">
            <Info className="h-3.5 w-3.5" /> {infos}
          </span>
        )}
      </div>

      {/* Diagnostics list */}
      <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
        {diagnostics.map((d, i) => {
          const config = severityConfig[d.severity];
          const Icon = config.icon;

          return (
            <div
              key={i}
              className={`rounded-lg border ${config.border} ${config.bg} p-3 transition-all hover:brightness-110`}
            >
              <div className="flex items-start gap-2">
                <Icon className={`mt-0.5 h-4 w-4 flex-shrink-0 ${config.color}`} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className={`text-xs font-semibold ${config.color}`}>
                      [{d.code}]
                    </span>
                    <span className="text-[10px] text-surface-500">
                      línea {d.line}
                    </span>
                  </div>
                  <p className="mt-0.5 text-sm text-surface-200 leading-relaxed">
                    {d.message}
                  </p>
                  {d.fix && (
                    <div className="mt-2 flex items-start gap-1.5 rounded-md bg-surface-800/50 px-2 py-1.5">
                      <Lightbulb className="mt-0.5 h-3 w-3 flex-shrink-0 text-amber-400" />
                      <p className="text-xs text-surface-400">
                        <span className="font-medium text-amber-400">Fix: </span>
                        {d.fix}
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
