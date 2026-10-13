'use client';

import React, { useMemo } from 'react';
import type { Circuit, GeneticPart } from '@/lib/compiler';
import { Dna } from 'lucide-react';

interface CircuitViewProps {
  circuits: Circuit[];
}

// SBOL Visual standard colors and shapes
const PART_CONFIG: Record<string, { color: string; label: string }> = {
  promoter: { color: '#10b981', label: 'Promoter' },
  rbs: { color: '#3b82f6', label: 'RBS' },
  cds: { color: '#f59e0b', label: 'CDS' },
  reporter: { color: '#a855f7', label: 'Reporter' },
  terminator: { color: '#ef4444', label: 'Terminator' },
  gene: { color: '#f59e0b', label: 'Gene' },
};

export default function CircuitView({ circuits }: CircuitViewProps) {
  if (circuits.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-surface-500">
        <div className="text-center">
          <Dna className="mx-auto h-8 w-8 mb-2 opacity-30" />
          <p className="text-sm">Escribe código BioScript para ver el circuito</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-auto p-4 space-y-6">
      {circuits.map((circuit, ci) => (
        <CircuitDiagram key={ci} circuit={circuit} />
      ))}
    </div>
  );
}

function CircuitDiagram({ circuit }: { circuit: Circuit }) {
  const svgContent = useMemo(() => generateSVG(circuit), [circuit]);

  return (
    <div className="rounded-xl border border-surface-800 bg-surface-900/50 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-surface-800 px-4 py-2.5">
        <div className="flex items-center gap-2">
          <div className={`h-2 w-2 rounded-full ${circuit.isSafe ? 'bg-green-500' : 'bg-amber-500'}`} />
          <span className="text-sm font-semibold text-white">{circuit.name}</span>
          <span className="text-xs text-surface-500">
            {circuit.partCount} parts · {circuit.atpCost.toFixed(0)} ATP
          </span>
        </div>
        <div className="flex items-center gap-2">
          {circuit.killSwitch && (
            <span className="rounded-full bg-green-500/10 border border-green-500/20 px-2 py-0.5 text-[10px] font-medium text-green-400">
              ☠️ Kill Switch
            </span>
          )}
          {circuit.chassisOrganism && (
            <span className="rounded-full bg-surface-800 px-2 py-0.5 text-[10px] text-surface-400">
              🦠 {circuit.chassisOrganism}
            </span>
          )}
        </div>
      </div>

      {/* SVG Diagram */}
      <div className="p-4" dangerouslySetInnerHTML={{ __html: svgContent }} />

      {/* Legend */}
      <div className="border-t border-surface-800 px-4 py-2 flex flex-wrap gap-3">
        {Object.entries(PART_CONFIG).map(([type, config]) => (
          <div key={type} className="flex items-center gap-1.5">
            <div className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: config.color }} />
            <span className="text-[10px] text-surface-400">{config.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── SVG Generation (SBOL Visual-inspired) ──────────────────

function generateSVG(circuit: Circuit): string {
  const UNIT_HEIGHT = 70;
  const PART_WIDTH = 80;
  const MARGIN = 30;
  const LABEL_HEIGHT = 25;
  const tuCount = circuit.transcriptionUnits.length;
  const maxParts = Math.max(...circuit.transcriptionUnits.map(tu => tu.parts.length), 1);

  const width = Math.max(maxParts * PART_WIDTH + MARGIN * 2, 400);
  const height = tuCount * (UNIT_HEIGHT + LABEL_HEIGHT + 20) + MARGIN * 2;

  let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" class="w-full">`;

  // Defs
  svg += `<defs>
    <filter id="glow">
      <feGaussianBlur stdDeviation="2" result="coloredBlur"/>
      <feMerge><feMergeNode in="coloredBlur"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
    <marker id="arrowhead" markerWidth="6" markerHeight="4" refX="6" refY="2" orient="auto">
      <polygon points="0 0, 6 2, 0 4" fill="#4ade80" />
    </marker>
  </defs>`;

  circuit.transcriptionUnits.forEach((tu, tuIndex) => {
    const y = MARGIN + tuIndex * (UNIT_HEIGHT + LABEL_HEIGHT + 20);
    const startX = MARGIN;

    // Backbone line
    const lineEndX = startX + tu.parts.length * PART_WIDTH;
    svg += `<line x1="${startX}" y1="${y + 35}" x2="${lineEndX}" y2="${y + 35}" 
            stroke="#374151" stroke-width="2" />`;

    // Expression level bar
    const barWidth = Math.min(tu.expressionLevel / 2.0, 1.0) * (lineEndX - startX);
    svg += `<rect x="${startX}" y="${y + 55}" width="${barWidth}" height="3" rx="1.5"
            fill="url(#expressionGrad${tuIndex})" opacity="0.4" />`;
    svg += `<defs><linearGradient id="expressionGrad${tuIndex}">
      <stop offset="0%" stop-color="#10b981" stop-opacity="0.8"/>
      <stop offset="100%" stop-color="#10b981" stop-opacity="0"/>
    </linearGradient></defs>`;

    tu.parts.forEach((part, partIndex) => {
      const x = startX + partIndex * PART_WIDTH + PART_WIDTH / 2;
      svg += renderPart(part, x, y + 35);

      // Label below
      svg += `<text x="${x}" y="${y + UNIT_HEIGHT}" text-anchor="middle" 
              fill="${PART_CONFIG[part.type]?.color || '#9ca3af'}" font-size="10" font-family="monospace">
              ${part.name.length > 10 ? part.name.slice(0, 9) + '…' : part.name}
            </text>`;
    });

    // Connection arrows between TUs (if not last)
    if (tuIndex < tuCount - 1) {
      const arrowY = y + UNIT_HEIGHT + LABEL_HEIGHT + 5;
      svg += `<path d="M ${width / 2 - 15} ${arrowY} L ${width / 2} ${arrowY + 10} L ${width / 2 + 15} ${arrowY}"
              stroke="#4ade80" stroke-width="1.5" fill="none" marker-end="url(#arrowhead)" opacity="0.5" />`;
    }
  });

  svg += '</svg>';
  return svg;
}

function renderPart(part: GeneticPart, x: number, y: number): string {
  const config = PART_CONFIG[part.type] || PART_CONFIG.gene;
  const color = part.color || config.color;

  switch (part.type) {
    case 'promoter':
      // Right-angle arrow (SBOL standard)
      return `<g filter="url(#glow)">
        <line x1="${x - 12}" y1="${y}" x2="${x - 12}" y2="${y - 22}" stroke="${color}" stroke-width="2.5"/>
        <line x1="${x - 12}" y1="${y - 22}" x2="${x + 12}" y2="${y - 22}" stroke="${color}" stroke-width="2.5"/>
        <polygon points="${x + 8},${y - 28} ${x + 16},${y - 22} ${x + 8},${y - 16}" fill="${color}"/>
      </g>`;

    case 'rbs':
      // Semicircle (SBOL standard)
      return `<g>
        <path d="M ${x - 10} ${y} A 10 10 0 0 1 ${x + 10} ${y}" 
              fill="${color}" opacity="0.8"/>
      </g>`;

    case 'cds':
    case 'gene':
      // Arrow/pentagon (SBOL standard CDS)
      return `<g filter="url(#glow)">
        <polygon points="${x - 18},${y - 16} ${x + 8},${y - 16} ${x + 18},${y} ${x + 8},${y + 16} ${x - 18},${y + 16}"
                fill="${color}" opacity="0.85" stroke="${color}" stroke-width="1"/>
      </g>`;

    case 'reporter':
      // Pentagon + glow (CDS variant with extra shine)
      return `<g filter="url(#glow)">
        <polygon points="${x - 18},${y - 16} ${x + 8},${y - 16} ${x + 18},${y} ${x + 8},${y + 16} ${x - 18},${y + 16}"
                fill="${color}" opacity="0.9" stroke="${color}" stroke-width="1.5"/>
        <circle cx="${x - 2}" cy="${y}" r="5" fill="white" opacity="0.3"/>
      </g>`;

    case 'terminator':
      // T-shape (SBOL standard)
      return `<g>
        <line x1="${x}" y1="${y}" x2="${x}" y2="${y - 22}" stroke="${color}" stroke-width="2.5"/>
        <line x1="${x - 12}" y1="${y - 22}" x2="${x + 12}" y2="${y - 22}" stroke="${color}" stroke-width="3" stroke-linecap="round"/>
      </g>`;

    default:
      return `<rect x="${x - 12}" y="${y - 12}" width="24" height="24" rx="4" fill="${color}" opacity="0.5"/>`;
  }
}
