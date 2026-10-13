'use client';

import React from 'react';
import { EXAMPLES, type Example } from '@/lib/examples';
import { BookOpen, ChevronRight, Zap, Brain, Beaker } from 'lucide-react';

interface ExamplesPanelProps {
  onSelect: (code: string) => void;
  isOpen: boolean;
  onToggle: () => void;
}

const difficultyIcons = {
  Beginner: <Zap className="h-3.5 w-3.5" />,
  Intermediate: <Beaker className="h-3.5 w-3.5" />,
  Advanced: <Brain className="h-3.5 w-3.5" />,
};

const difficultyColors = {
  Beginner: 'text-green-400 border-green-500/30 bg-green-500/10',
  Intermediate: 'text-amber-400 border-amber-500/30 bg-amber-500/10',
  Advanced: 'text-red-400 border-red-500/30 bg-red-500/10',
};

export default function ExamplesPanel({ onSelect, isOpen, onToggle }: ExamplesPanelProps) {
  return (
    <div
      className={`transition-all duration-300 ease-in-out border-r border-surface-800 bg-surface-950/50 ${
        isOpen ? 'w-80' : 'w-0 overflow-hidden border-0'
      }`}
    >
      <div className="flex h-full w-80 flex-col">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-surface-800 px-4 py-3">
          <div className="flex items-center gap-2">
            <BookOpen className="h-4 w-4 text-bio-400" />
            <h2 className="text-sm font-semibold text-white">Ejemplos</h2>
          </div>
          <button
            onClick={onToggle}
            className="rounded p-1 text-surface-400 transition-colors hover:bg-surface-800 hover:text-white"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>

        {/* Examples list */}
        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {EXAMPLES.map((example) => (
            <ExampleCard key={example.id} example={example} onSelect={onSelect} />
          ))}
        </div>

        {/* Footer */}
        <div className="border-t border-surface-800 p-3">
          <p className="text-[11px] leading-relaxed text-surface-500">
            Todos los circuitos usan datos científicos reales con 34+ papers citados.
          </p>
        </div>
      </div>
    </div>
  );
}

function ExampleCard({ example, onSelect }: { example: Example; onSelect: (code: string) => void }) {
  return (
    <button
      onClick={() => onSelect(example.code)}
      className="group w-full rounded-xl border border-surface-800 bg-surface-900/50 p-3 text-left transition-all hover:border-bio-500/30 hover:bg-surface-800/80 hover:shadow-lg hover:shadow-bio-500/5"
    >
      <div className="flex items-start gap-3">
        <span className="text-xl">{example.icon}</span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-white group-hover:text-bio-400 transition-colors">
              {example.title}
            </h3>
            <span
              className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium ${
                difficultyColors[example.difficulty]
              }`}
            >
              {difficultyIcons[example.difficulty]}
              {example.difficulty}
            </span>
          </div>
          <p className="mt-1 text-xs leading-relaxed text-surface-400 line-clamp-2">
            {example.description}
          </p>
          <div className="mt-2 flex flex-wrap gap-1">
            {example.tags.slice(0, 3).map((tag) => (
              <span
                key={tag}
                className="rounded-md bg-surface-800 px-1.5 py-0.5 text-[10px] text-surface-400"
              >
                {tag}
              </span>
            ))}
          </div>
        </div>
      </div>
    </button>
  );
}
