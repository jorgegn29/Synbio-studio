'use client';

import React, { useState } from 'react';
import type { Circuit } from '@/lib/compiler';
import { exportSBOL, exportFASTA, exportGenBank } from '@/lib/compiler';
import { Download, FileText, Copy, Check, X, FileCode2, Dna } from 'lucide-react';

interface ExportModalProps {
  circuit: Circuit;
  isOpen: boolean;
  onClose: () => void;
}

type ExportFormat = 'sbol' | 'fasta' | 'genbank';

export default function ExportModal({ circuit, isOpen, onClose }: ExportModalProps) {
  const [format, setFormat] = useState<ExportFormat>('sbol');
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  const exports: Record<ExportFormat, { label: string; icon: React.ReactNode; ext: string; mime: string; content: string }> = {
    sbol: {
      label: 'SBOL 3.0',
      icon: <FileCode2 className="h-4 w-4" />,
      ext: '.xml',
      mime: 'application/xml',
      content: exportSBOL(circuit),
    },
    fasta: {
      label: 'FASTA',
      icon: <Dna className="h-4 w-4" />,
      ext: '.fasta',
      mime: 'text/plain',
      content: exportFASTA(circuit),
    },
    genbank: {
      label: 'GenBank',
      icon: <FileText className="h-4 w-4" />,
      ext: '.gb',
      mime: 'text/plain',
      content: exportGenBank(circuit),
    },
  };

  const currentExport = exports[format];

  function handleDownload() {
    const blob = new Blob([currentExport.content], { type: currentExport.mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${circuit.name}${currentExport.ext}`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function handleCopy() {
    navigator.clipboard.writeText(currentExport.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div
        className="relative w-full max-w-2xl rounded-2xl border border-surface-700 bg-surface-900 shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-surface-800 px-6 py-4">
          <div>
            <h2 className="text-lg font-semibold text-white">Exportar Circuito</h2>
            <p className="text-sm text-surface-400">{circuit.name} · {circuit.partCount} partes</p>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-2 text-surface-400 transition-colors hover:bg-surface-800 hover:text-white"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Format selector */}
        <div className="flex gap-2 border-b border-surface-800 px-6 py-3">
          {(Object.keys(exports) as ExportFormat[]).map(f => (
            <button
              key={f}
              onClick={() => setFormat(f)}
              className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-all ${
                format === f
                  ? 'bg-bio-500/20 text-bio-400 border border-bio-500/30'
                  : 'text-surface-400 hover:bg-surface-800 hover:text-white border border-transparent'
              }`}
            >
              {exports[f].icon}
              {exports[f].label}
            </button>
          ))}
        </div>

        {/* Preview */}
        <div className="px-6 py-4">
          <div className="h-64 overflow-auto rounded-lg border border-surface-800 bg-surface-950 p-4">
            <pre className="text-xs text-surface-300 font-mono whitespace-pre-wrap">
              {currentExport.content}
            </pre>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end gap-3 border-t border-surface-800 px-6 py-4">
          <button
            onClick={handleCopy}
            className="flex items-center gap-2 rounded-lg border border-surface-700 bg-surface-800 px-4 py-2 text-sm text-surface-300 transition-all hover:border-surface-600 hover:text-white"
          >
            {copied ? <Check className="h-4 w-4 text-green-400" /> : <Copy className="h-4 w-4" />}
            {copied ? 'Copiado!' : 'Copiar'}
          </button>
          <button
            onClick={handleDownload}
            className="flex items-center gap-2 rounded-lg bg-bio-600 px-4 py-2 text-sm font-medium text-white transition-all hover:bg-bio-500 shadow-lg shadow-bio-600/20"
          >
            <Download className="h-4 w-4" />
            Descargar {currentExport.ext}
          </button>
        </div>
      </div>
    </div>
  );
}
