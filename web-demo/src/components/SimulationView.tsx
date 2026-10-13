'use client';

import React, { useMemo, useRef, useEffect } from 'react';
import type { SimulationResult } from '@/lib/simulator';
import { Activity, Clock, Zap, TrendingUp } from 'lucide-react';

interface SimulationViewProps {
  result: SimulationResult | null;
  isRunning: boolean;
}

export default function SimulationView({ result, isRunning }: SimulationViewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Draw chart on canvas
  useEffect(() => {
    if (!result || !canvasRef.current) return;
    drawChart(canvasRef.current, result);
  }, [result]);

  if (!result) {
    return (
      <div className="flex h-full items-center justify-center text-surface-500">
        <div className="text-center">
          <Activity className="mx-auto h-8 w-8 mb-2 opacity-30" />
          <p className="text-sm">Compila un circuito y ejecuta la simulación</p>
        </div>
      </div>
    );
  }

  if (isRunning) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-center">
          <div className="mx-auto h-10 w-10 rounded-full border-2 border-bio-500/30 border-t-bio-400 animate-spin" />
          <p className="mt-3 text-sm text-surface-400">Ejecutando Gillespie SSA...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      {/* Stats bar */}
      <div className="flex items-center gap-4 border-b border-surface-800 px-4 py-2">
        <StatBadge icon={<Zap className="h-3 w-3" />} label="Reacciones" value={result.totalReactions.toLocaleString()} color="text-amber-400" />
        <StatBadge icon={<Clock className="h-3 w-3" />} label="Tiempo" value={`${(result.maxTime / 60).toFixed(0)} min`} color="text-blue-400" />
        {result.oscillationPeriod && (
          <StatBadge icon={<TrendingUp className="h-3 w-3" />} label="Período" value={`${(result.oscillationPeriod / 60).toFixed(0)} min`} color="text-purple-400" />
        )}
      </div>

      {/* Chart */}
      <div className="flex-1 p-4">
        <canvas ref={canvasRef} className="h-full w-full" />
      </div>

      {/* Species legend */}
      <div className="border-t border-surface-800 px-4 py-2 flex flex-wrap gap-3">
        {result.species.map(sp => (
          <div key={sp.name} className="flex items-center gap-1.5">
            <div className="h-2.5 w-6 rounded-sm" style={{ backgroundColor: sp.color }} />
            <span className="text-[11px] text-surface-300">{sp.name}</span>
            <span className="text-[10px] text-surface-500">
              ({result.steadyState[sp.name]?.toFixed(0) || 0} avg)
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function StatBadge({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: string; color: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className={color}>{icon}</span>
      <span className="text-[10px] text-surface-500">{label}:</span>
      <span className={`text-xs font-semibold ${color}`}>{value}</span>
    </div>
  );
}

// ─── Canvas Chart Drawing ────────────────────────────────────

function drawChart(canvas: HTMLCanvasElement, result: SimulationResult) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  // Get actual pixel dimensions
  const rect = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;
  ctx.scale(dpr, dpr);

  const W = rect.width;
  const H = rect.height;
  const PAD = { top: 20, right: 20, bottom: 40, left: 55 };
  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;

  // Clear
  ctx.clearRect(0, 0, W, H);

  if (result.species.length === 0 || result.points.length < 2) return;

  // Find max values
  const speciesNames = result.species.map(s => s.name);
  let maxVal = 0;
  for (const p of result.points) {
    for (const name of speciesNames) {
      maxVal = Math.max(maxVal, p.species[name] || 0);
    }
  }
  maxVal = Math.max(maxVal, 1) * 1.1;
  const maxTime = result.maxTime;

  // Grid
  ctx.strokeStyle = '#1e293b';
  ctx.lineWidth = 0.5;
  const gridLines = 5;
  for (let i = 0; i <= gridLines; i++) {
    const y = PAD.top + (plotH / gridLines) * i;
    ctx.beginPath();
    ctx.moveTo(PAD.left, y);
    ctx.lineTo(PAD.left + plotW, y);
    ctx.stroke();
  }

  // Y axis labels
  ctx.fillStyle = '#64748b';
  ctx.font = '10px monospace';
  ctx.textAlign = 'right';
  for (let i = 0; i <= gridLines; i++) {
    const y = PAD.top + (plotH / gridLines) * i;
    const val = maxVal * (1 - i / gridLines);
    ctx.fillText(val.toFixed(0), PAD.left - 8, y + 3);
  }

  // X axis labels
  ctx.textAlign = 'center';
  const timeLabels = 5;
  for (let i = 0; i <= timeLabels; i++) {
    const x = PAD.left + (plotW / timeLabels) * i;
    const time = (maxTime / timeLabels) * i;
    ctx.fillText(`${(time / 60).toFixed(0)}m`, x, H - PAD.bottom + 18);
  }

  // Axis labels
  ctx.save();
  ctx.fillStyle = '#94a3b8';
  ctx.font = '11px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('Tiempo', PAD.left + plotW / 2, H - 4);
  ctx.translate(14, PAD.top + plotH / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.fillText('Moléculas', 0, 0);
  ctx.restore();

  // Draw each species
  for (const sp of result.species) {
    ctx.strokeStyle = sp.color;
    ctx.lineWidth = 2;
    ctx.globalAlpha = 0.85;
    ctx.beginPath();

    let started = false;
    // Sample evenly for performance
    const step = Math.max(1, Math.floor(result.points.length / 300));
    for (let i = 0; i < result.points.length; i += step) {
      const p = result.points[i];
      const x = PAD.left + (p.time / maxTime) * plotW;
      const y = PAD.top + plotH - ((p.species[sp.name] || 0) / maxVal) * plotH;

      if (!started) {
        ctx.moveTo(x, y);
        started = true;
      } else {
        ctx.lineTo(x, y);
      }
    }
    ctx.stroke();

    // Area fill
    ctx.globalAlpha = 0.05;
    ctx.fillStyle = sp.color;
    const lastPoint = result.points[result.points.length - 1];
    ctx.lineTo(PAD.left + (lastPoint.time / maxTime) * plotW, PAD.top + plotH);
    ctx.lineTo(PAD.left, PAD.top + plotH);
    ctx.closePath();
    ctx.fill();
    ctx.globalAlpha = 1;
  }
}
