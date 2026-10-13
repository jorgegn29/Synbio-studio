/**
 * ══════════════════════════════════════════════════════════════
 * SynBio-LLVM — Closed-Loop Bayesian Learning Engine
 *
 * Implements Design→Simulate→Experiment→Learn cycle.
 * The system learns from real experimental results to improve
 * future predictions and recommendations.
 *
 * Core algorithm: Bayesian Parameter Updating
 *   - Prior: literature-based parameter distributions
 *   - Likelihood: experimental observation model
 *   - Posterior: updated belief after experiment
 *
 * Learns from:
 *   - Promoter strengths (observed RPU vs predicted)
 *   - RBS translation rates (observed vs RBS Calculator)
 *   - Protein expression levels (observed vs codon model)
 *   - Circuit dynamics (observed vs Gillespie SSA)
 *   - Growth rate impact (observed vs FBA prediction)
 *
 * References:
 *   - Rosenfeld et al. "Gene Regulation at the Single-Cell Level" Science 2005
 *   - Kelly et al. "Measuring the activity of BioBrick promoters" J Biol Eng 2009
 *   - Salis HM et al. "Automated design of synthetic RBS" Nat Biotech 2009
 *   - Ceroni et al. "Quantifying cellular capacity" Nat Methods 2015
 * ══════════════════════════════════════════════════════════════
 */
import * as vscode from 'vscode';
import * as crypto from 'crypto';

// ── Types ──────────────────────────────────────────────────────────────

/** Gaussian prior/posterior for a parameter */
export interface GaussianBelief {
    mean: number;
    variance: number;
    /** Number of observations incorporated */
    n: number;
    /** Last update timestamp */
    updatedAt: string;
}

/** Types of learnable parameters */
export type ParameterType =
    | 'promoter_strength'
    | 'rbs_efficiency'
    | 'protein_expression'
    | 'degradation_rate'
    | 'growth_rate'
    | 'circuit_period'
    | 'bistability_threshold'
    | 'metabolic_flux'
    | 'toxicity_level'
    | 'folding_energy';

/** An experimental observation */
export interface Observation {
    id: string;
    timestamp: string;
    /** Part or construct identifier */
    partId: string;
    parameterType: ParameterType;
    /** Predicted value from model */
    predicted: number;
    /** Observed value from experiment */
    observed: number;
    /** Measurement uncertainty (std dev) */
    uncertainty: number;
    /** Experimental conditions */
    conditions: {
        organism: string;
        temperature: number;
        media: string;
        inducer?: string;
        inducerConc?: number;
    };
    /** Lab notebook reference */
    notebookRef?: string;
    /** Hash for audit */
    hash: string;
}

/** A learned model for a specific part+parameter combination */
export interface LearnedModel {
    partId: string;
    parameterType: ParameterType;
    /** Prior from literature */
    prior: GaussianBelief;
    /** Current posterior after observations */
    posterior: GaussianBelief;
    /** All observations used */
    observationIds: string[];
    /** Prediction accuracy (MAPE) */
    mape: number;
    /** Model confidence 0-1 */
    confidence: number;
}

/** Recommendation from the learning engine */
export interface Recommendation {
    type: 'design' | 'experiment' | 'optimization';
    priority: 'critical' | 'high' | 'medium' | 'low';
    title: string;
    description: string;
    /** Confidence in this recommendation (0-1) */
    confidence: number;
    /** Which learned model supports this */
    basedOn: string;
    /** Suggested next experiment if applicable */
    suggestedExperiment?: {
        variable: string;
        values: number[];
        expectedOutcome: string;
    };
}

// ── Default Priors from Literature ─────────────────────────────────────

const LITERATURE_PRIORS: Record<string, { type: ParameterType; mean: number; variance: number; citation: string }> = {
    // Promoter strengths (RPU, relative to J23101)
    // Kelly et al. J Biol Eng 2009
    'BBa_J23100': { type: 'promoter_strength', mean: 2547, variance: 500 ** 2, citation: 'Kelly et al. J Biol Eng 2009' },
    'BBa_J23101': { type: 'promoter_strength', mean: 1000, variance: 200 ** 2, citation: 'Kelly et al. J Biol Eng 2009 (reference)' },
    'BBa_J23106': { type: 'promoter_strength', mean: 1185, variance: 300 ** 2, citation: 'Kelly et al. J Biol Eng 2009' },
    'BBa_J23114': { type: 'promoter_strength', mean: 256, variance: 80 ** 2, citation: 'Anderson collection' },
    'BBa_R0010': { type: 'promoter_strength', mean: 300, variance: 100 ** 2, citation: 'pLac, Lutz & Bujard 1997' },
    'BBa_R0040': { type: 'promoter_strength', mean: 450, variance: 150 ** 2, citation: 'pTet, Lutz & Bujard 1997' },

    // RBS efficiencies (au, relative translation initiation rate)
    // Salis et al. Nat Biotech 2009
    'BBa_B0034': { type: 'rbs_efficiency', mean: 1.0, variance: 0.2 ** 2, citation: 'Salis et al. 2009 (strong)' },
    'BBa_B0032': { type: 'rbs_efficiency', mean: 0.3, variance: 0.1 ** 2, citation: 'Salis et al. 2009 (medium)' },
    'BBa_B0031': { type: 'rbs_efficiency', mean: 0.07, variance: 0.03 ** 2, citation: 'Salis et al. 2009 (weak)' },

    // Protein degradation rates (1/min)
    // Andersen et al. Appl Environ Microbiol 1998 (ssrA tags)
    'ssrA_LAA': { type: 'degradation_rate', mean: 0.018, variance: 0.005 ** 2, citation: 'Andersen et al. 1998 (fast)' },
    'ssrA_ASV': { type: 'degradation_rate', mean: 0.0072, variance: 0.002 ** 2, citation: 'Andersen et al. 1998 (medium)' },
    'ssrA_AAV': { type: 'degradation_rate', mean: 0.0024, variance: 0.001 ** 2, citation: 'Andersen et al. 1998 (slow)' },

    // Growth rate reduction per heterologous protein (fraction)
    // Ceroni et al. Nat Methods 2015
    'burden_per_protein': { type: 'growth_rate', mean: 0.05, variance: 0.02 ** 2, citation: 'Ceroni et al. 2015 — ~5% per protein' },
};

// ── Bayesian Learning Engine ───────────────────────────────────────────

export class LearningEngine {
    private observations: Observation[] = [];
    private models: Map<string, LearnedModel> = new Map();
    private context: vscode.ExtensionContext;
    private outputChannel: vscode.OutputChannel;

    constructor(context: vscode.ExtensionContext) {
        this.context = context;
        this.outputChannel = vscode.window.createOutputChannel('SynBio Learning Engine');
        this.loadState();
    }

    // ── Core: Bayesian Update ───────────────────────────────────

    /**
     * Record an experimental observation and update the model.
     * Uses conjugate Gaussian-Gaussian Bayesian update:
     *
     *   posterior_mean = (prior_var * observed + obs_var * prior_mean) / (prior_var + obs_var)
     *   posterior_var  = (prior_var * obs_var) / (prior_var + obs_var)
     *
     * This is the exact analytical solution for Gaussian conjugate prior.
     */
    recordObservation(
        partId: string,
        parameterType: ParameterType,
        predicted: number,
        observed: number,
        uncertainty: number,
        conditions: Observation['conditions'],
        notebookRef?: string,
    ): { observation: Observation; updatedModel: LearnedModel; recommendation?: Recommendation } {
        // Create observation
        const obs: Observation = {
            id: crypto.randomUUID(),
            timestamp: new Date().toISOString(),
            partId,
            parameterType,
            predicted,
            observed,
            uncertainty,
            conditions,
            notebookRef,
            hash: '',
        };
        obs.hash = crypto.createHash('sha256')
            .update(JSON.stringify({ ...obs, hash: undefined }))
            .digest('hex');

        this.observations.push(obs);

        // Get or create model
        const modelKey = `${partId}::${parameterType}`;
        let model = this.models.get(modelKey);

        if (!model) {
            // Initialize from literature or uninformative prior
            const lit = LITERATURE_PRIORS[partId];
            const prior: GaussianBelief = lit
                ? { mean: lit.mean, variance: lit.variance, n: 0, updatedAt: '' }
                : { mean: predicted, variance: (predicted * 0.5) ** 2, n: 0, updatedAt: '' };

            model = {
                partId,
                parameterType,
                prior: { ...prior },
                posterior: { ...prior },
                observationIds: [],
                mape: 0,
                confidence: 0,
            };
        }

        // Bayesian conjugate Gaussian update
        const priorMean = model.posterior.mean;
        const priorVar = model.posterior.variance;
        const obsVar = uncertainty ** 2;

        const posteriorVar = (priorVar * obsVar) / (priorVar + obsVar);
        const posteriorMean = (priorVar * observed + obsVar * priorMean) / (priorVar + obsVar);

        model.posterior = {
            mean: posteriorMean,
            variance: posteriorVar,
            n: model.posterior.n + 1,
            updatedAt: obs.timestamp,
        };

        model.observationIds.push(obs.id);

        // Compute MAPE across all observations for this model
        const modelObs = this.observations.filter(o =>
            o.partId === partId && o.parameterType === parameterType
        );
        if (modelObs.length > 0) {
            const ape = modelObs.map(o =>
                Math.abs(model!.posterior.mean - o.observed) / (Math.abs(o.observed) || 1)
            );
            model.mape = ape.reduce((a, b) => a + b, 0) / ape.length;
        }

        // Confidence: based on n and variance reduction
        const varianceReduction = 1 - (model.posterior.variance / model.prior.variance);
        model.confidence = Math.min(
            1,
            Math.max(0, varianceReduction * 0.6 + Math.min(model.posterior.n / 10, 1) * 0.4)
        );

        this.models.set(modelKey, model);
        this.saveState();

        // Generate recommendation
        const rec = this.generateRecommendation(model, obs);

        // Log
        this.outputChannel.appendLine(
            `[LEARN] ${partId}::${parameterType} — ` +
            `prior: ${priorMean.toFixed(3)} → posterior: ${posteriorMean.toFixed(3)} ` +
            `(observed: ${observed}, n=${model.posterior.n}, conf=${(model.confidence * 100).toFixed(0)}%)`
        );

        return { observation: obs, updatedModel: model, recommendation: rec };
    }

    // ── Prediction with Learned Priors ──────────────────────────

    /**
     * Get the current best estimate for a parameter.
     * Returns posterior mean if observations exist, else literature prior.
     */
    predict(partId: string, parameterType: ParameterType): {
        value: number;
        uncertainty: number;
        confidence: number;
        source: 'learned' | 'literature' | 'default';
        n: number;
    } {
        const modelKey = `${partId}::${parameterType}`;
        const model = this.models.get(modelKey);

        if (model && model.posterior.n > 0) {
            return {
                value: model.posterior.mean,
                uncertainty: Math.sqrt(model.posterior.variance),
                confidence: model.confidence,
                source: 'learned',
                n: model.posterior.n,
            };
        }

        const lit = LITERATURE_PRIORS[partId];
        if (lit && lit.type === parameterType) {
            return {
                value: lit.mean,
                uncertainty: Math.sqrt(lit.variance),
                confidence: 0.3, // literature baseline
                source: 'literature',
                n: 0,
            };
        }

        return {
            value: 0,
            uncertainty: Infinity,
            confidence: 0,
            source: 'default',
            n: 0,
        };
    }

    // ── Recommendations ─────────────────────────────────────────

    /**
     * Generate all current recommendations based on learned models.
     */
    getAllRecommendations(): Recommendation[] {
        const recs: Recommendation[] = [];

        for (const [, model] of this.models) {
            // Check for prediction errors
            if (model.mape > 0.5 && model.posterior.n >= 3) {
                recs.push({
                    type: 'design',
                    priority: 'high',
                    title: `Recalibrar modelo de ${model.partId}`,
                    description: `Error de predicción (MAPE=${(model.mape * 100).toFixed(1)}%) es alto para ${model.partId}::${model.parameterType}. ` +
                        `El modelo puede necesitar un prior diferente o hay un factor experimental no capturado.`,
                    confidence: model.confidence,
                    basedOn: `${model.partId}::${model.parameterType}`,
                });
            }

            // Suggest more data for low-confidence models
            if (model.confidence < 0.5 && model.posterior.n < 5) {
                recs.push({
                    type: 'experiment',
                    priority: 'medium',
                    title: `Más datos para ${model.partId}`,
                    description: `Solo ${model.posterior.n} observaciones. Se recomiendan ≥5 para convergencia del modelo.`,
                    confidence: model.confidence,
                    basedOn: `${model.partId}::${model.parameterType}`,
                    suggestedExperiment: {
                        variable: model.parameterType,
                        values: this.suggestExperimentalValues(model),
                        expectedOutcome: `Reducir varianza de ${Math.sqrt(model.posterior.variance).toFixed(3)} a ~${(Math.sqrt(model.posterior.variance) * 0.7).toFixed(3)}`,
                    },
                });
            }

            // Optimization suggestions
            if (model.parameterType === 'promoter_strength' && model.posterior.n >= 3) {
                const optimalRange = this.findOptimalRange(model);
                if (optimalRange) {
                    recs.push({
                        type: 'optimization',
                        priority: 'low',
                        title: `Optimizar fuerza de ${model.partId}`,
                        description: `Basado en ${model.posterior.n} observaciones, el rango óptimo es ${optimalRange.min.toFixed(0)}–${optimalRange.max.toFixed(0)} RPU.`,
                        confidence: model.confidence,
                        basedOn: `${model.partId}::${model.parameterType}`,
                    });
                }
            }
        }

        return recs.sort((a, b) => {
            const prio = { critical: 0, high: 1, medium: 2, low: 3 };
            return prio[a.priority] - prio[b.priority];
        });
    }

    private generateRecommendation(model: LearnedModel, obs: Observation): Recommendation | undefined {
        const error = Math.abs(obs.predicted - obs.observed) / (Math.abs(obs.observed) || 1);

        if (error > 0.5) {
            return {
                type: 'design',
                priority: 'high',
                title: `Predicción desviada para ${model.partId}`,
                description: `Predicho: ${obs.predicted.toFixed(2)}, observado: ${obs.observed.toFixed(2)} ` +
                    `(error: ${(error * 100).toFixed(0)}%). Revisar asunciones del modelo o condiciones experimentales.`,
                confidence: model.confidence,
                basedOn: `${model.partId}::${model.parameterType}`,
            };
        }

        if (model.posterior.n === 5) {
            return {
                type: 'optimization',
                priority: 'medium',
                title: `Modelo calibrado para ${model.partId}`,
                description: `5 observaciones incorporadas. Confianza: ${(model.confidence * 100).toFixed(0)}%. ` +
                    `El modelo ahora puede usarse para predicciones fiables.`,
                confidence: model.confidence,
                basedOn: `${model.partId}::${model.parameterType}`,
            };
        }

        return undefined;
    }

    private suggestExperimentalValues(model: LearnedModel): number[] {
        // Suggest values spanning 2 sigma around posterior mean
        const std = Math.sqrt(model.posterior.variance);
        const mean = model.posterior.mean;
        return [
            Math.max(0, mean - 2 * std),
            Math.max(0, mean - std),
            mean,
            mean + std,
            mean + 2 * std,
        ].map(v => Math.round(v * 100) / 100);
    }

    private findOptimalRange(model: LearnedModel): { min: number; max: number } | null {
        if (model.posterior.n < 3) return null;
        const std = Math.sqrt(model.posterior.variance);
        return {
            min: model.posterior.mean - std,
            max: model.posterior.mean + std,
        };
    }

    // ── Statistics ───────────────────────────────────────────────

    /**
     * Get learning engine statistics.
     */
    getStats(): {
        totalObservations: number;
        modelsLearned: number;
        avgConfidence: number;
        avgMAPE: number;
        partsCovered: string[];
    } {
        const models = Array.from(this.models.values());
        const avgConf = models.length > 0
            ? models.reduce((s, m) => s + m.confidence, 0) / models.length
            : 0;
        const avgMAPE = models.length > 0
            ? models.reduce((s, m) => s + m.mape, 0) / models.length
            : 0;

        return {
            totalObservations: this.observations.length,
            modelsLearned: this.models.size,
            avgConfidence: avgConf,
            avgMAPE: avgMAPE,
            partsCovered: [...new Set(models.map(m => m.partId))],
        };
    }

    /**
     * Show learning dashboard in VS Code.
     */
    async showDashboard(): Promise<void> {
        const stats = this.getStats();
        const recs = this.getAllRecommendations();

        const lines: string[] = [
            '╔══════════════════════════════════════════════════════════════╗',
            '║    SynBio-LLVM — Bayesian Learning Engine Dashboard        ║',
            '╠══════════════════════════════════════════════════════════════╣',
            '',
            `📊 Observaciones: ${stats.totalObservations}`,
            `🧠 Modelos aprendidos: ${stats.modelsLearned}`,
            `📈 Confianza promedio: ${(stats.avgConfidence * 100).toFixed(1)}%`,
            `📉 Error promedio (MAPE): ${(stats.avgMAPE * 100).toFixed(1)}%`,
            `🔬 Partes cubiertas: ${stats.partsCovered.join(', ') || 'ninguna aún'}`,
            '',
        ];

        if (recs.length > 0) {
            lines.push('── RECOMENDACIONES ──────────────────────────────────────────');
            for (const rec of recs) {
                const icon = rec.priority === 'critical' ? '🔴' :
                    rec.priority === 'high' ? '🟠' :
                        rec.priority === 'medium' ? '🟡' : '🟢';
                lines.push(`${icon} [${rec.type.toUpperCase()}] ${rec.title}`);
                lines.push(`   ${rec.description}`);
                if (rec.suggestedExperiment) {
                    lines.push(`   → Experimento sugerido: variar ${rec.suggestedExperiment.variable}`);
                    lines.push(`     Valores: ${rec.suggestedExperiment.values.join(', ')}`);
                }
                lines.push('');
            }
        }

        // Show learned models
        lines.push('── MODELOS APRENDIDOS ───────────────────────────────────────');
        for (const [key, model] of this.models) {
            const priorStd = Math.sqrt(model.prior.variance);
            const postStd = Math.sqrt(model.posterior.variance);
            lines.push(`  ${key}`);
            lines.push(`    Prior:     μ=${model.prior.mean.toFixed(3)} σ=${priorStd.toFixed(3)}`);
            lines.push(`    Posterior: μ=${model.posterior.mean.toFixed(3)} σ=${postStd.toFixed(3)}`);
            lines.push(`    N=${model.posterior.n} | MAPE=${(model.mape * 100).toFixed(1)}% | Conf=${(model.confidence * 100).toFixed(0)}%`);
            lines.push('');
        }

        // Literature priors
        lines.push('── PRIORS DE LITERATURA ─────────────────────────────────────');
        for (const [part, prior] of Object.entries(LITERATURE_PRIORS)) {
            lines.push(`  ${part}: ${prior.mean} ± ${Math.sqrt(prior.variance).toFixed(2)} [${prior.citation}]`);
        }

        const doc = await vscode.workspace.openTextDocument({
            content: lines.join('\n'),
            language: 'markdown',
        });
        await vscode.window.showTextDocument(doc);
    }

    // ── Persistence ─────────────────────────────────────────────

    private loadState(): void {
        const obs = this.context.globalState.get<Observation[]>('synbio.learning.observations', []);
        this.observations = obs;

        const models = this.context.globalState.get<[string, LearnedModel][]>('synbio.learning.models', []);
        this.models = new Map(models);
    }

    private saveState(): void {
        this.context.globalState.update('synbio.learning.observations', this.observations);
        this.context.globalState.update('synbio.learning.models', Array.from(this.models.entries()));
    }

    dispose(): void {
        this.saveState();
        this.outputChannel.dispose();
    }
}
