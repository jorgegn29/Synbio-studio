// ============================================================
// Gillespie Stochastic Simulation Algorithm (SSA)
// Based on Elowitz & Leibler 2000, Gillespie 1977
// ============================================================

import type { Circuit, GeneticPart } from './compiler';

export interface SimulationParams {
  totalTime: number;       // seconds
  maxSteps: number;
  degradationRate: number; // per second
  transcriptionRate: number;
  translationRate: number;
  bindingAffinity: number;
  hillCoefficient: number;
  noiseLevel: number;
}

export interface Species {
  name: string;
  count: number;
  color: string;
  type: 'mRNA' | 'protein' | 'complex' | 'inducer';
}

export interface SimulationPoint {
  time: number;
  species: Record<string, number>;
}

export interface SimulationResult {
  points: SimulationPoint[];
  species: Species[];
  totalReactions: number;
  maxTime: number;
  steadyState: Record<string, number>;
  oscillationPeriod: number | null;
}

const DEFAULT_PARAMS: SimulationParams = {
  totalTime: 7200,        // 2 hours
  maxSteps: 50000,
  degradationRate: 0.0023, // ln(2)/300s ≈ 0.0023/s (Elowitz 2000)
  transcriptionRate: 0.167, // ~10 mRNA/min (Taniguchi et al. 2010)
  translationRate: 0.5,     // ~30 proteins/min per mRNA
  bindingAffinity: 40.0,    // nM, typical TF-operator Kd
  hillCoefficient: 2.0,     // cooperative binding
  noiseLevel: 0.1,
};

// ─── Reaction Definition ─────────────────────────────────────

interface Reaction {
  name: string;
  propensity: (state: Record<string, number>, params: SimulationParams) => number;
  apply: (state: Record<string, number>) => void;
}

// ─── Build Reactions from Circuit ────────────────────────────

function buildReactions(circuit: Circuit, params: SimulationParams): { reactions: Reaction[]; initialState: Record<string, number>; speciesList: Species[] } {
  const state: Record<string, number> = {};
  const speciesList: Species[] = [];
  const reactions: Reaction[] = [];

  // Identify all proteins/reporters in the circuit
  const genes: GeneticPart[] = [];
  const promoterMap: Map<string, GeneticPart[]> = new Map(); // promoter -> downstream genes

  for (const tu of circuit.transcriptionUnits) {
    let currentPromoter: GeneticPart | null = null;
    let promoterStrength = 0.5;

    for (const part of tu.parts) {
      if (part.type === 'promoter') {
        currentPromoter = part;
        promoterStrength = part.strength ?? 0.5;
      }
      if (part.type === 'cds' || part.type === 'reporter') {
        genes.push(part);
        if (currentPromoter) {
          const existing = promoterMap.get(currentPromoter.name) || [];
          existing.push(part);
          promoterMap.set(currentPromoter.name, existing);
        }

        // Initialize mRNA and protein species
        const mRNA = `mRNA_${part.name}`;
        const protein = part.name;
        state[mRNA] = 0;
        state[protein] = 0;

        speciesList.push({
          name: mRNA,
          count: 0,
          color: adjustColor(part.color, -30),
          type: 'mRNA',
        });
        speciesList.push({
          name: protein,
          count: 0,
          color: part.color,
          type: 'protein',
        });

        // Transcription reaction
        const txRate = params.transcriptionRate * promoterStrength;
        reactions.push({
          name: `Transcription: ${mRNA}`,
          propensity: (s) => {
            // Check for repression
            const repressors: Record<string, string[]> = {
              'pLac': ['LacI'],
              'pTet': ['TetR'],
              'pLux': ['LuxR'],
            };
            if (currentPromoter) {
              const reps = repressors[currentPromoter.name];
              if (reps) {
                for (const rep of reps) {
                  if (s[rep] && s[rep] > 0) {
                    const repression = 1 / (1 + Math.pow(s[rep] / params.bindingAffinity, params.hillCoefficient));
                    return txRate * repression;
                  }
                }
              }
            }
            return txRate;
          },
          apply: (s) => { s[mRNA] = (s[mRNA] || 0) + 1; },
        });

        // Translation reaction
        reactions.push({
          name: `Translation: ${protein}`,
          propensity: (s) => params.translationRate * (s[mRNA] || 0),
          apply: (s) => { s[protein] = (s[protein] || 0) + 1; },
        });

        // mRNA degradation
        reactions.push({
          name: `mRNA degradation: ${mRNA}`,
          propensity: (s) => params.degradationRate * 3 * (s[mRNA] || 0), // mRNA degrades ~3x faster
          apply: (s) => { if (s[mRNA] > 0) s[mRNA]--; },
        });

        // Protein degradation
        reactions.push({
          name: `Protein degradation: ${protein}`,
          propensity: (s) => params.degradationRate * (s[protein] || 0),
          apply: (s) => { if (s[protein] > 0) s[protein]--; },
        });
      }
    }
  }

  // Add noise as basal transcription
  for (const gene of genes) {
    reactions.push({
      name: `Basal: ${gene.name}`,
      propensity: () => params.noiseLevel * params.transcriptionRate * 0.01,
      apply: (s) => { s[`mRNA_${gene.name}`] = (s[`mRNA_${gene.name}`] || 0) + 1; },
    });
  }

  return { reactions, initialState: state, speciesList };
}

// ─── Gillespie SSA ───────────────────────────────────────────

export function simulate(circuit: Circuit, userParams?: Partial<SimulationParams>): SimulationResult {
  const params = { ...DEFAULT_PARAMS, ...userParams };
  const { reactions, initialState, speciesList } = buildReactions(circuit, params);

  if (reactions.length === 0) {
    return {
      points: [{ time: 0, species: {} }],
      species: [],
      totalReactions: 0,
      maxTime: 0,
      steadyState: {},
      oscillationPeriod: null,
    };
  }

  const state = { ...initialState };
  const points: SimulationPoint[] = [{ time: 0, species: { ...state } }];
  let time = 0;
  let steps = 0;
  const sampleInterval = params.totalTime / 500; // ~500 data points
  let nextSample = sampleInterval;

  while (time < params.totalTime && steps < params.maxSteps) {
    // Calculate propensities
    const propensities = reactions.map(r => Math.max(0, r.propensity(state, params)));
    const totalPropensity = propensities.reduce((a, b) => a + b, 0);

    if (totalPropensity === 0) break;

    // Time to next reaction (exponential distribution)
    const tau = -Math.log(Math.random()) / totalPropensity;
    time += tau;

    // Select reaction
    let cumulative = 0;
    const rand = Math.random() * totalPropensity;
    let selectedReaction = 0;
    for (let i = 0; i < propensities.length; i++) {
      cumulative += propensities[i];
      if (cumulative >= rand) {
        selectedReaction = i;
        break;
      }
    }

    // Apply reaction
    reactions[selectedReaction].apply(state);
    steps++;

    // Sample at intervals
    if (time >= nextSample) {
      points.push({ time, species: { ...state } });
      nextSample += sampleInterval;
    }
  }

  // Final point
  points.push({ time, species: { ...state } });

  // Calculate steady state (average of last 20%)
  const steadyState: Record<string, number> = {};
  const lastPoints = points.slice(Math.floor(points.length * 0.8));
  for (const key of Object.keys(state)) {
    steadyState[key] = lastPoints.reduce((sum, p) => sum + (p.species[key] || 0), 0) / lastPoints.length;
  }

  // Detect oscillations
  const oscillationPeriod = detectOscillation(points, Object.keys(state)[1] || '');

  // Update species counts
  for (const sp of speciesList) {
    sp.count = state[sp.name] || 0;
  }

  return {
    points,
    species: speciesList.filter(s => s.type === 'protein'), // Only show proteins by default
    totalReactions: steps,
    maxTime: time,
    steadyState,
    oscillationPeriod,
  };
}

// ─── Oscillation Detection ──────────────────────────────────

function detectOscillation(points: SimulationPoint[], speciesName: string): number | null {
  if (!speciesName || points.length < 50) return null;

  const values = points.map(p => p.species[speciesName] || 0);
  const times = points.map(p => p.time);
  const mean = values.reduce((a, b) => a + b, 0) / values.length;

  // Find zero crossings of (value - mean)
  const crossings: number[] = [];
  for (let i = 1; i < values.length; i++) {
    if ((values[i - 1] - mean) * (values[i] - mean) < 0) {
      crossings.push(times[i]);
    }
  }

  if (crossings.length < 4) return null;

  // Average period between crossings (half-periods)
  const periods: number[] = [];
  for (let i = 2; i < crossings.length; i += 2) {
    periods.push(crossings[i] - crossings[i - 2]);
  }

  if (periods.length === 0) return null;
  const avgPeriod = periods.reduce((a, b) => a + b, 0) / periods.length;

  // Check if consistent (CV < 0.3)
  const stdDev = Math.sqrt(periods.reduce((sum, p) => sum + Math.pow(p - avgPeriod, 2), 0) / periods.length);
  if (stdDev / avgPeriod > 0.3) return null;

  return avgPeriod;
}

// ─── Helpers ─────────────────────────────────────────────────

function adjustColor(hex: string, amount: number): string {
  const num = parseInt(hex.replace('#', ''), 16);
  const r = Math.min(255, Math.max(0, ((num >> 16) & 0xFF) + amount));
  const g = Math.min(255, Math.max(0, ((num >> 8) & 0xFF) + amount));
  const b = Math.min(255, Math.max(0, (num & 0xFF) + amount));
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}
