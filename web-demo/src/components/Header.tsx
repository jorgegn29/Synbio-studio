'use client';

import React from 'react';
import Link from 'next/link';
import { Github, Dna, Sparkles, ExternalLink } from 'lucide-react';

export default function Header() {
  return (
    <header className="relative z-50 border-b border-bio-900/50 bg-surface-950/80 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-[1920px] items-center justify-between px-4 lg:px-6">
        {/* Logo */}
        <div className="flex items-center gap-3">
          <div className="relative flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-bio-500 to-bio-700 shadow-lg shadow-bio-500/20">
            <Dna className="h-5 w-5 text-white" />
            <div className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full bg-bio-400 animate-pulse" />
          </div>
          <div className="flex flex-col">
            <h1 className="text-lg font-bold tracking-tight text-white">
              SynBio-<span className="text-bio-400">LLVM</span>
            </h1>
            <span className="text-[10px] font-medium uppercase tracking-widest text-bio-500/80">
              Genetic Circuit IDE
            </span>
          </div>
        </div>

        {/* Center badges */}
        <div className="hidden items-center gap-2 md:flex">
          <span className="inline-flex items-center gap-1 rounded-full border border-bio-500/20 bg-bio-500/10 px-3 py-1 text-xs font-medium text-bio-400">
            <Sparkles className="h-3 w-3" />
            Live Compiler
          </span>
          <span className="inline-flex items-center rounded-full border border-amber-500/20 bg-amber-500/10 px-3 py-1 text-xs font-medium text-amber-400">
            Gillespie SSA
          </span>
          <span className="inline-flex items-center rounded-full border border-purple-500/20 bg-purple-500/10 px-3 py-1 text-xs font-medium text-purple-400">
            SBOL 3.0
          </span>
        </div>

        {/* Right actions */}
        <div className="flex items-center gap-3">
          <span className="hidden rounded-full bg-surface-800 px-3 py-1 text-xs text-surface-300 lg:inline">
            v0.1.0
          </span>
          <Link
            href="https://github.com"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 rounded-lg border border-surface-700 bg-surface-800/50 px-3 py-2 text-sm text-surface-300 transition-all hover:border-bio-500/50 hover:text-white"
          >
            <Github className="h-4 w-4" />
            <span className="hidden sm:inline">GitHub</span>
            <ExternalLink className="h-3 w-3 opacity-50" />
          </Link>
        </div>
      </div>
    </header>
  );
}
