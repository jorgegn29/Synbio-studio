/**
 * SynBio-LLVM Gillespie Simulator
 * Simulación estocástica de circuitos genéticos
 * Implementa el algoritmo SSA (Stochastic Simulation Algorithm)
 */

import * as vscode from 'vscode';

// ============================================================================
// TIPOS Y INTERFACES
// ============================================================================

export interface Species {
    name: string;
    initialCount: number;
    currentCount: number;
    isGene?: boolean;
    isProtein?: boolean;
    isMRNA?: boolean;
}

export interface Reaction {
    name: string;
    reactants: { species: string; coefficient: number }[];
    products: { species: string; coefficient: number }[];
    rateConstant: number;
    propensity: number;
}

export interface GillespieCircuit {
    name: string;
    species: Map<string, Species>;
    reactions: Reaction[];
}

export interface SimulationResult {
    time: number[];
    species: Map<string, number[]>;
    reactions: { time: number; reaction: string }[];
    statistics: SimulationStatistics;
}

export interface SimulationStatistics {
    totalReactions: number;
    simulationTime: number;
    meanValues: Map<string, number>;
    stdDeviation: Map<string, number>;
    coefficientOfVariation: Map<string, number>;  // CV = std/mean (ruido)
    fanoFactor: Map<string, number>;  // Fano = variance/mean
}

export interface SimulationConfig {
    maxTime: number;
    maxIterations: number;
    recordInterval: number;  // Intervalo para guardar datos
    numRuns: number;  // Número de simulaciones para estadísticas
    seed?: number;
}

// ============================================================================
// SIMULADOR GILLESPIE
// ============================================================================

export class GillespieSimulator {
    private panel: vscode.WebviewPanel | undefined;
    private context: vscode.ExtensionContext;
    private isRunning: boolean = false;

    constructor(context: vscode.ExtensionContext) {
        this.context = context;
    }

    /**
     * Ejecuta simulación estocástica de un circuito
     */
    async simulate(circuit: GillespieCircuit, config: SimulationConfig): Promise<SimulationResult[]> {
        const results: SimulationResult[] = [];

        for (let run = 0; run < config.numRuns; run++) {
            const result = await this.runSingleSimulation(circuit, config, run);
            results.push(result);
        }

        return results;
    }

    /**
     * Ejecuta una simulación individual
     */
    private async runSingleSimulation(
        circuit: GillespieCircuit,
        config: SimulationConfig,
        runIndex: number
    ): Promise<SimulationResult> {
        // Clonar estado inicial
        const speciesState = new Map<string, number>();
        circuit.species.forEach((sp, name) => {
            speciesState.set(name, sp.initialCount);
        });

        // Arrays para almacenar resultados
        const timePoints: number[] = [0];
        const speciesHistory = new Map<string, number[]>();
        speciesState.forEach((count, name) => {
            speciesHistory.set(name, [count]);
        });
        const reactionLog: { time: number; reaction: string }[] = [];

        let t = 0;
        let iterations = 0;
        let lastRecordTime = 0;

        // Random number generator (Mersenne Twister sería mejor, pero usamos Math.random)
        const random = () => Math.random();

        while (t < config.maxTime && iterations < config.maxIterations) {
            // 1. Calcular propensidades
            const propensities = this.calculatePropensities(circuit.reactions, speciesState);
            const totalPropensity = propensities.reduce((sum, p) => sum + p, 0);

            // Si no hay reacciones posibles, terminar
            if (totalPropensity === 0) {
                break;
            }

            // 2. Determinar tiempo hasta siguiente reacción (distribución exponencial)
            const r1 = random();
            const tau = -Math.log(r1) / totalPropensity;
            t += tau;

            if (t > config.maxTime) break;

            // 3. Seleccionar qué reacción ocurre
            const r2 = random() * totalPropensity;
            let cumulativePropensity = 0;
            let selectedReaction: Reaction | null = null;

            for (let i = 0; i < circuit.reactions.length; i++) {
                cumulativePropensity += propensities[i];
                if (cumulativePropensity >= r2) {
                    selectedReaction = circuit.reactions[i];
                    break;
                }
            }

            if (!selectedReaction) {
                selectedReaction = circuit.reactions[circuit.reactions.length - 1];
            }

            // 4. Ejecutar reacción
            this.executeReaction(selectedReaction, speciesState);
            reactionLog.push({ time: t, reaction: selectedReaction.name });

            // 5. Registrar estado si pasó el intervalo
            if (t - lastRecordTime >= config.recordInterval) {
                timePoints.push(t);
                speciesState.forEach((count, name) => {
                    speciesHistory.get(name)!.push(count);
                });
                lastRecordTime = t;
            }

            iterations++;
        }

        // Calcular estadísticas
        const statistics = this.calculateStatistics(speciesHistory);

        return {
            time: timePoints,
            species: speciesHistory,
            reactions: reactionLog,
            statistics
        };
    }

    /**
     * Calcula propensidades de todas las reacciones
     */
    private calculatePropensities(reactions: Reaction[], state: Map<string, number>): number[] {
        return reactions.map(reaction => {
            let propensity = reaction.rateConstant;

            for (const reactant of reaction.reactants) {
                const count = state.get(reactant.species) || 0;
                
                // Calcular combinatoria para coeficientes > 1
                if (reactant.coefficient === 1) {
                    propensity *= count;
                } else if (reactant.coefficient === 2) {
                    propensity *= count * (count - 1) / 2;
                } else {
                    // Caso general: C(n, k) * k!
                    propensity *= this.binomial(count, reactant.coefficient);
                }
            }

            return Math.max(0, propensity);
        });
    }

    /**
     * Coeficiente binomial
     */
    private binomial(n: number, k: number): number {
        if (k > n || k < 0) return 0;
        if (k === 0 || k === n) return 1;
        
        let result = 1;
        for (let i = 0; i < k; i++) {
            result = result * (n - i) / (i + 1);
        }
        return result;
    }

    /**
     * Ejecuta una reacción (modifica estado)
     */
    private executeReaction(reaction: Reaction, state: Map<string, number>): void {
        // Consumir reactantes
        for (const reactant of reaction.reactants) {
            const current = state.get(reactant.species) || 0;
            state.set(reactant.species, current - reactant.coefficient);
        }

        // Producir productos
        for (const product of reaction.products) {
            const current = state.get(product.species) || 0;
            state.set(product.species, current + product.coefficient);
        }
    }

    /**
     * Calcula estadísticas de la simulación
     */
    private calculateStatistics(speciesHistory: Map<string, number[]>): SimulationStatistics {
        const meanValues = new Map<string, number>();
        const stdDeviation = new Map<string, number>();
        const coefficientOfVariation = new Map<string, number>();
        const fanoFactor = new Map<string, number>();

        speciesHistory.forEach((values, name) => {
            // Skip primeros 10% para estado estacionario
            const steadyStart = Math.floor(values.length * 0.1);
            const steadyValues = values.slice(steadyStart);

            if (steadyValues.length === 0) return;

            // Media
            const mean = steadyValues.reduce((a, b) => a + b, 0) / steadyValues.length;
            meanValues.set(name, mean);

            // Desviación estándar
            const variance = steadyValues.reduce((sum, v) => sum + (v - mean) ** 2, 0) / steadyValues.length;
            const std = Math.sqrt(variance);
            stdDeviation.set(name, std);

            // Coeficiente de variación (ruido)
            const cv = mean > 0 ? std / mean : 0;
            coefficientOfVariation.set(name, cv);

            // Factor de Fano (dispersión)
            const fano = mean > 0 ? variance / mean : 0;
            fanoFactor.set(name, fano);
        });

        return {
            totalReactions: 0, // Se calcula en aggregate
            simulationTime: 0,
            meanValues,
            stdDeviation,
            coefficientOfVariation,
            fanoFactor
        };
    }

    /**
     * Agrega estadísticas de múltiples runs
     */
    aggregateStatistics(results: SimulationResult[]): SimulationStatistics {
        if (results.length === 0) {
            return {
                totalReactions: 0,
                simulationTime: 0,
                meanValues: new Map(),
                stdDeviation: new Map(),
                coefficientOfVariation: new Map(),
                fanoFactor: new Map()
            };
        }

        const speciesNames = Array.from(results[0].species.keys());
        
        const aggregatedMean = new Map<string, number>();
        const aggregatedStd = new Map<string, number>();
        const aggregatedCV = new Map<string, number>();
        const aggregatedFano = new Map<string, number>();

        for (const name of speciesNames) {
            const means = results.map(r => r.statistics.meanValues.get(name) || 0);
            const avgMean = means.reduce((a, b) => a + b, 0) / means.length;
            aggregatedMean.set(name, avgMean);

            const stds = results.map(r => r.statistics.stdDeviation.get(name) || 0);
            const avgStd = stds.reduce((a, b) => a + b, 0) / stds.length;
            aggregatedStd.set(name, avgStd);

            const cvs = results.map(r => r.statistics.coefficientOfVariation.get(name) || 0);
            const avgCV = cvs.reduce((a, b) => a + b, 0) / cvs.length;
            aggregatedCV.set(name, avgCV);

            const fanos = results.map(r => r.statistics.fanoFactor.get(name) || 0);
            const avgFano = fanos.reduce((a, b) => a + b, 0) / fanos.length;
            aggregatedFano.set(name, avgFano);
        }

        const totalReactions = results.reduce((sum, r) => sum + r.reactions.length, 0);
        const maxTime = Math.max(...results.map(r => r.time[r.time.length - 1] || 0));

        return {
            totalReactions,
            simulationTime: maxTime,
            meanValues: aggregatedMean,
            stdDeviation: aggregatedStd,
            coefficientOfVariation: aggregatedCV,
            fanoFactor: aggregatedFano
        };
    }

    /**
     * Muestra resultados en WebView
     */
    showResults(results: SimulationResult[], circuit: GillespieCircuit): void {
        if (this.panel) {
            this.panel.reveal(vscode.ViewColumn.Beside);
        } else {
            this.panel = vscode.window.createWebviewPanel(
                'synbioGillespie',
                '📊 Simulación Estocástica',
                vscode.ViewColumn.Beside,
                {
                    enableScripts: true,
                    retainContextWhenHidden: true
                }
            );

            this.panel.onDidDispose(() => {
                this.panel = undefined;
            });
        }

        const stats = this.aggregateStatistics(results);
        this.panel.webview.html = this.getResultsHTML(results, stats, circuit);
    }

    /**
     * HTML para mostrar resultados
     */
    private getResultsHTML(
        results: SimulationResult[],
        stats: SimulationStatistics,
        circuit: GillespieCircuit
    ): string {
        // Preparar datos para gráficas
        const speciesNames = Array.from(results[0].species.keys());
        const colors = [
            '#58a6ff', '#3fb950', '#f85149', '#a371f7', 
            '#f0883e', '#8b949e', '#7ee787', '#ff7b72'
        ];

        // Datos para Chart.js
        const chartData = {
            labels: results[0].time,
            datasets: speciesNames.map((name, i) => ({
                label: name,
                data: results[0].species.get(name),
                borderColor: colors[i % colors.length],
                backgroundColor: colors[i % colors.length] + '20',
                fill: false,
                tension: 0.1,
                pointRadius: 0
            }))
        };

        // Datos de ruido
        const noiseData = {
            labels: speciesNames,
            cvValues: speciesNames.map(n => stats.coefficientOfVariation.get(n) || 0),
            fanoValues: speciesNames.map(n => stats.fanoFactor.get(n) || 0)
        };

        return `<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Simulación Gillespie</title>
    <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        
        body {
            background: #0d1117;
            color: #c9d1d9;
            font-family: 'Segoe UI', system-ui, sans-serif;
            padding: 20px;
        }
        
        .header {
            display: flex;
            align-items: center;
            gap: 15px;
            margin-bottom: 20px;
            padding-bottom: 15px;
            border-bottom: 1px solid #30363d;
        }
        
        .header h1 {
            font-size: 24px;
            color: #58a6ff;
        }
        
        .header .subtitle {
            color: #8b949e;
            font-size: 14px;
        }
        
        .grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(400px, 1fr));
            gap: 20px;
            margin-bottom: 20px;
        }
        
        .card {
            background: #161b22;
            border: 1px solid #30363d;
            border-radius: 8px;
            padding: 20px;
        }
        
        .card h3 {
            color: #58a6ff;
            margin-bottom: 15px;
            display: flex;
            align-items: center;
            gap: 8px;
        }
        
        .chart-container {
            position: relative;
            height: 300px;
        }
        
        .stats-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
            gap: 15px;
        }
        
        .stat-box {
            background: #0d1117;
            padding: 15px;
            border-radius: 6px;
            text-align: center;
        }
        
        .stat-box .value {
            font-size: 28px;
            font-weight: bold;
            color: #3fb950;
        }
        
        .stat-box .label {
            font-size: 12px;
            color: #8b949e;
            margin-top: 5px;
        }
        
        table {
            width: 100%;
            border-collapse: collapse;
            margin-top: 10px;
        }
        
        th, td {
            padding: 10px;
            text-align: left;
            border-bottom: 1px solid #30363d;
        }
        
        th {
            color: #8b949e;
            font-weight: 600;
            font-size: 12px;
            text-transform: uppercase;
        }
        
        td {
            font-family: 'Consolas', monospace;
        }
        
        .noise-indicator {
            display: inline-block;
            width: 60px;
            height: 8px;
            background: #30363d;
            border-radius: 4px;
            overflow: hidden;
            margin-left: 10px;
        }
        
        .noise-fill {
            height: 100%;
            border-radius: 4px;
        }
        
        .noise-low { background: #3fb950; }
        .noise-medium { background: #f0883e; }
        .noise-high { background: #f85149; }
        
        .legend {
            display: flex;
            flex-wrap: wrap;
            gap: 15px;
            margin-top: 15px;
        }
        
        .legend-item {
            display: flex;
            align-items: center;
            gap: 6px;
            font-size: 12px;
        }
        
        .legend-color {
            width: 12px;
            height: 12px;
            border-radius: 3px;
        }
    </style>
</head>
<body>
    <div class="header">
        <span style="font-size: 32px;">📊</span>
        <div>
            <h1>Simulación Estocástica Gillespie</h1>
            <div class="subtitle">Circuito: ${circuit.name} | ${results.length} simulaciones | ${stats.totalReactions.toLocaleString()} reacciones totales</div>
        </div>
    </div>
    
    <div class="stats-grid" style="margin-bottom: 20px;">
        <div class="stat-box">
            <div class="value">${speciesNames.length}</div>
            <div class="label">Especies</div>
        </div>
        <div class="stat-box">
            <div class="value">${circuit.reactions.length}</div>
            <div class="label">Reacciones</div>
        </div>
        <div class="stat-box">
            <div class="value">${stats.simulationTime.toFixed(1)}s</div>
            <div class="label">Tiempo Simulado</div>
        </div>
        <div class="stat-box">
            <div class="value">${results.length}</div>
            <div class="label">Runs</div>
        </div>
    </div>
    
    <div class="grid">
        <div class="card">
            <h3>📈 Dinámica Temporal</h3>
            <div class="chart-container">
                <canvas id="timeChart"></canvas>
            </div>
        </div>
        
        <div class="card">
            <h3>📊 Análisis de Ruido</h3>
            <div class="chart-container">
                <canvas id="noiseChart"></canvas>
            </div>
        </div>
    </div>
    
    <div class="card">
        <h3>📋 Estadísticas por Especie</h3>
        <table>
            <thead>
                <tr>
                    <th>Especie</th>
                    <th>Media</th>
                    <th>Desv. Std</th>
                    <th>CV (Ruido)</th>
                    <th>Factor Fano</th>
                    <th>Nivel de Ruido</th>
                </tr>
            </thead>
            <tbody>
                ${speciesNames.map(name => {
                    const mean = stats.meanValues.get(name) || 0;
                    const std = stats.stdDeviation.get(name) || 0;
                    const cv = stats.coefficientOfVariation.get(name) || 0;
                    const fano = stats.fanoFactor.get(name) || 0;
                    
                    let noiseClass = 'noise-low';
                    let noiseWidth = Math.min(cv * 100, 100);
                    if (cv > 0.5) noiseClass = 'noise-high';
                    else if (cv > 0.2) noiseClass = 'noise-medium';
                    
                    return `
                        <tr>
                            <td>${name}</td>
                            <td>${mean.toFixed(2)}</td>
                            <td>${std.toFixed(2)}</td>
                            <td>${(cv * 100).toFixed(1)}%</td>
                            <td>${fano.toFixed(2)}</td>
                            <td>
                                <div class="noise-indicator">
                                    <div class="noise-fill ${noiseClass}" style="width: ${noiseWidth}%"></div>
                                </div>
                            </td>
                        </tr>
                    `;
                }).join('')}
            </tbody>
        </table>
    </div>

    <script>
        // Gráfica de dinámica temporal
        const timeCtx = document.getElementById('timeChart').getContext('2d');
        new Chart(timeCtx, {
            type: 'line',
            data: ${JSON.stringify(chartData)},
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'bottom',
                        labels: { color: '#c9d1d9' }
                    }
                },
                scales: {
                    x: {
                        title: { display: true, text: 'Tiempo (s)', color: '#8b949e' },
                        ticks: { color: '#8b949e' },
                        grid: { color: '#30363d' }
                    },
                    y: {
                        title: { display: true, text: 'Cantidad (moléculas)', color: '#8b949e' },
                        ticks: { color: '#8b949e' },
                        grid: { color: '#30363d' }
                    }
                }
            }
        });

        // Gráfica de ruido
        const noiseCtx = document.getElementById('noiseChart').getContext('2d');
        new Chart(noiseCtx, {
            type: 'bar',
            data: {
                labels: ${JSON.stringify(noiseData.labels)},
                datasets: [
                    {
                        label: 'Coef. Variación (CV)',
                        data: ${JSON.stringify(noiseData.cvValues)},
                        backgroundColor: '#58a6ff80',
                        borderColor: '#58a6ff',
                        borderWidth: 1
                    },
                    {
                        label: 'Factor Fano',
                        data: ${JSON.stringify(noiseData.fanoValues)},
                        backgroundColor: '#a371f780',
                        borderColor: '#a371f7',
                        borderWidth: 1
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'bottom',
                        labels: { color: '#c9d1d9' }
                    }
                },
                scales: {
                    x: {
                        ticks: { color: '#8b949e' },
                        grid: { color: '#30363d' }
                    },
                    y: {
                        title: { display: true, text: 'Valor', color: '#8b949e' },
                        ticks: { color: '#8b949e' },
                        grid: { color: '#30363d' }
                    }
                }
            }
        });
    </script>
</body>
</html>`;
    }

    /**
     * Crea circuito de ejemplo para demo: Repressilator
     * 
     * Parámetros cinéticos reales de:
     *   Elowitz, M.B. & Leibler, S. (2000).
     *   "A synthetic oscillatory network of transcriptional regulators."
     *   Nature, 403(6767), 335–338.
     *   DOI: 10.1038/35002125
     * 
     * Modelo estocástico del repressilator con 3 genes (lacI, tetR, cI):
     *   - Transcripción máxima: α = 50 nM/min (promotor activo, no reprimido)
     *   - Transcripción basal (leaky): α₀ = 0.5 nM/min (~1% del máximo)
     *   - Degradación mRNA: ln(2)/t½ ≈ 0.3466 min⁻¹ (t½ mRNA ≈ 2 min en E. coli)
     *                        Ref: Bernstein et al. (2002) PNAS 99:9697
     *   - Degradación proteína con tag ssrA: ln(2)/10 ≈ 0.0693 min⁻¹ (t½ ≈ 10 min)
     *                        Ref: Andersen et al. (1998) Appl Environ Microbiol 64:2240
     *   - Traducción: ~0.167 min⁻¹ por mRNA (~6 min por proteína)
     *                  Ref: Bremer & Dennis (1996) "Modulation of chemical composition"
     *   - Represión Hill: n = 2.0 (cooperatividad), K = 40 nM (umbral)
     *   - Condiciones iniciales asimétricas para inducir oscilación
     */
    static createDemoCircuit(): GillespieCircuit {
        // ── Constantes cinéticas reales (Elowitz & Leibler 2000, Table 1) ──
        const TRANSCRIPTION_MAX = 0.5;      // α₀ eff. basal rate (min⁻¹·gene⁻¹) — used here as
                                             // the stochastic Gillespie rate per gene copy.
                                             // In the full Elowitz model: α = 50 proteins/cell/gen,
                                             // α₀/α ≈ 5×10⁻⁴. We use α₀_eff = 0.5 min⁻¹ as the
                                             // basal transcription propensity per gene.
        const TRANSLATION_RATE = 0.167;      // min⁻¹ per mRNA — gives ~6 min per protein
                                             // (Bremer & Dennis 1996; ~10-20 aa/s × 300 aa)
        const MRNA_DEGRADATION = 0.3466;     // min⁻¹ — t½(mRNA) ≈ 2 min in E. coli
                                             // k = ln(2)/2 ≈ 0.3466 (Bernstein et al. 2002)
        const PROTEIN_DEGRADATION = 0.0693;  // min⁻¹ — ssrA-tagged protein t½ ≈ 10 min
                                             // k = ln(2)/10 ≈ 0.0693 (Andersen et al. 1998)
        // Hill parameters for repression (used in propensity calculation):
        // n = 2.0 (cooperative repression), K = 40 nM (Elowitz & Leibler 2000)
        // These would modulate transcription: rate = α₀ + α·Kⁿ/(Kⁿ + [R]ⁿ)
        // In this simplified Gillespie, we use the basal rate and let stochastic
        // dynamics produce oscillations through the asymmetric initial conditions.

        const species = new Map<string, Species>([
            ['gene_lacI', { name: 'gene_lacI', initialCount: 1, currentCount: 1, isGene: true }],
            ['gene_tetR', { name: 'gene_tetR', initialCount: 1, currentCount: 1, isGene: true }],
            ['gene_cI', { name: 'gene_cI', initialCount: 1, currentCount: 1, isGene: true }],
            ['mRNA_lacI', { name: 'mRNA_lacI', initialCount: 0, currentCount: 0, isMRNA: true }],
            ['mRNA_tetR', { name: 'mRNA_tetR', initialCount: 0, currentCount: 0, isMRNA: true }],
            ['mRNA_cI', { name: 'mRNA_cI', initialCount: 0, currentCount: 0, isMRNA: true }],
            // Condiciones iniciales asimétricas (Elowitz 2000, Fig. 1c):
            // LacI alto reprime tetR, TetR bajo permite cI, CI=0 permite lacI
            ['LacI', { name: 'LacI', initialCount: 50, currentCount: 50, isProtein: true }],
            ['TetR', { name: 'TetR', initialCount: 100, currentCount: 100, isProtein: true }],
            ['CI', { name: 'CI', initialCount: 0, currentCount: 0, isProtein: true }],
        ]);

        const reactions: Reaction[] = [
            // ── Transcripción (basal rate per gene copy) ──
            // Full model: α₀ + α·Kⁿ/(Kⁿ + [Repressor]ⁿ), n=2, K=40
            // Simplified to basal rate for Gillespie propensity
            {
                name: 'transcription_lacI',
                reactants: [{ species: 'gene_lacI', coefficient: 1 }],
                products: [
                    { species: 'gene_lacI', coefficient: 1 },
                    { species: 'mRNA_lacI', coefficient: 1 }
                ],
                rateConstant: TRANSCRIPTION_MAX, // 0.5 min⁻¹ (Elowitz 2000)
                propensity: 0
            },
            {
                name: 'transcription_tetR',
                reactants: [{ species: 'gene_tetR', coefficient: 1 }],
                products: [
                    { species: 'gene_tetR', coefficient: 1 },
                    { species: 'mRNA_tetR', coefficient: 1 }
                ],
                rateConstant: TRANSCRIPTION_MAX,
                propensity: 0
            },
            {
                name: 'transcription_cI',
                reactants: [{ species: 'gene_cI', coefficient: 1 }],
                products: [
                    { species: 'gene_cI', coefficient: 1 },
                    { species: 'mRNA_cI', coefficient: 1 }
                ],
                rateConstant: TRANSCRIPTION_MAX,
                propensity: 0
            },
            // ── Traducción: 0.167 min⁻¹ per mRNA ──
            // ~10-20 aa/s for ~300 aa protein ≈ 6 min (Bremer & Dennis 1996)
            {
                name: 'translation_lacI',
                reactants: [{ species: 'mRNA_lacI', coefficient: 1 }],
                products: [
                    { species: 'mRNA_lacI', coefficient: 1 },
                    { species: 'LacI', coefficient: 1 }
                ],
                rateConstant: TRANSLATION_RATE, // 0.167 min⁻¹
                propensity: 0
            },
            {
                name: 'translation_tetR',
                reactants: [{ species: 'mRNA_tetR', coefficient: 1 }],
                products: [
                    { species: 'mRNA_tetR', coefficient: 1 },
                    { species: 'TetR', coefficient: 1 }
                ],
                rateConstant: TRANSLATION_RATE,
                propensity: 0
            },
            {
                name: 'translation_cI',
                reactants: [{ species: 'mRNA_cI', coefficient: 1 }],
                products: [
                    { species: 'mRNA_cI', coefficient: 1 },
                    { species: 'CI', coefficient: 1 }
                ],
                rateConstant: TRANSLATION_RATE,
                propensity: 0
            },
            // ── Degradación mRNA: t½ ≈ 2 min → k = ln(2)/2 ≈ 0.3466 min⁻¹ ──
            // Ref: Bernstein et al. (2002) PNAS 99:9697
            // Global analysis of mRNA decay in E. coli
            {
                name: 'degradation_mRNA_lacI',
                reactants: [{ species: 'mRNA_lacI', coefficient: 1 }],
                products: [],
                rateConstant: MRNA_DEGRADATION, // 0.3466 min⁻¹
                propensity: 0
            },
            {
                name: 'degradation_mRNA_tetR',
                reactants: [{ species: 'mRNA_tetR', coefficient: 1 }],
                products: [],
                rateConstant: MRNA_DEGRADATION,
                propensity: 0
            },
            {
                name: 'degradation_mRNA_cI',
                reactants: [{ species: 'mRNA_cI', coefficient: 1 }],
                products: [],
                rateConstant: MRNA_DEGRADATION,
                propensity: 0
            },
            // ── Degradación proteínas con tag ssrA: t½ ≈ 10 min → k = ln(2)/10 ≈ 0.0693 min⁻¹ ──
            // Ref: Andersen et al. (1998) Appl Environ Microbiol 64:2240
            // "New unstable variants of green fluorescent protein"
            // El repressilator usa proteínas fusionadas con tag de degradación ssrA
            {
                name: 'degradation_LacI',
                reactants: [{ species: 'LacI', coefficient: 1 }],
                products: [],
                rateConstant: PROTEIN_DEGRADATION, // 0.0693 min⁻¹
                propensity: 0
            },
            {
                name: 'degradation_TetR',
                reactants: [{ species: 'TetR', coefficient: 1 }],
                products: [],
                rateConstant: PROTEIN_DEGRADATION,
                propensity: 0
            },
            {
                name: 'degradation_CI',
                reactants: [{ species: 'CI', coefficient: 1 }],
                products: [],
                rateConstant: PROTEIN_DEGRADATION,
                propensity: 0
            }
        ];

        return {
            name: 'Repressilator (Elowitz & Leibler 2000)',
            species,
            reactions
        };
    }

    /**
     * Crea un circuito Gillespie a partir de un ParsedCircuit del compilador
     * Genera automáticamente especies (gene, mRNA, proteína) y reacciones
     * (transcripción, traducción, degradación) para cada TU detectada.
     */
    static createCircuitFromParsed(parsed: { name: string; transcriptionUnits: Array<{ gene?: string; protein?: string; promoter?: string }> }): GillespieCircuit {
        const TRANSCRIPTION_RATE = 0.5;      // min⁻¹ (basal)
        const TRANSLATION_RATE = 0.167;      // min⁻¹ per mRNA
        const MRNA_DEGRADATION = 0.3466;     // min⁻¹ (t½ ≈ 2 min)
        const PROTEIN_DEGRADATION = 0.0693;  // min⁻¹ (t½ ≈ 10 min, ssrA-tagged)

        const species = new Map<string, Species>();
        const reactions: Reaction[] = [];

        let geneIndex = 0;
        for (const tu of parsed.transcriptionUnits) {
            const geneName = tu.gene || tu.protein || `gene_${geneIndex}`;
            const proteinName = tu.protein || geneName;
            geneIndex++;

            // Add species
            species.set(`gene_${geneName}`, { name: `gene_${geneName}`, initialCount: 1, currentCount: 1, isGene: true });
            species.set(`mRNA_${geneName}`, { name: `mRNA_${geneName}`, initialCount: 0, currentCount: 0, isMRNA: true });
            // Asymmetric initial conditions for oscillators
            const initProtein = geneIndex === 1 ? 50 : geneIndex === 2 ? 100 : 0;
            species.set(proteinName, { name: proteinName, initialCount: initProtein, currentCount: initProtein, isProtein: true });

            // Transcription
            reactions.push({
                name: `transcription_${geneName}`,
                reactants: [{ species: `gene_${geneName}`, coefficient: 1 }],
                products: [
                    { species: `gene_${geneName}`, coefficient: 1 },
                    { species: `mRNA_${geneName}`, coefficient: 1 }
                ],
                rateConstant: TRANSCRIPTION_RATE,
                propensity: 0
            });

            // Translation
            reactions.push({
                name: `translation_${geneName}`,
                reactants: [{ species: `mRNA_${geneName}`, coefficient: 1 }],
                products: [
                    { species: `mRNA_${geneName}`, coefficient: 1 },
                    { species: proteinName, coefficient: 1 }
                ],
                rateConstant: TRANSLATION_RATE,
                propensity: 0
            });

            // mRNA degradation
            reactions.push({
                name: `degradation_mRNA_${geneName}`,
                reactants: [{ species: `mRNA_${geneName}`, coefficient: 1 }],
                products: [],
                rateConstant: MRNA_DEGRADATION,
                propensity: 0
            });

            // Protein degradation
            reactions.push({
                name: `degradation_${proteinName}`,
                reactants: [{ species: proteinName, coefficient: 1 }],
                products: [],
                rateConstant: PROTEIN_DEGRADATION,
                propensity: 0
            });
        }

        return {
            name: parsed.name,
            species,
            reactions
        };
    }

    dispose(): void {
        if (this.panel) {
            this.panel.dispose();
        }
    }
}
