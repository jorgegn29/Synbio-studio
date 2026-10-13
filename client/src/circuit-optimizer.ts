/**
 * SynBio-LLVM - Circuit Optimizer UI
 * Interfaz WebView para optimización de circuitos genéticos
 * Algoritmo genético + análisis de sensibilidad + predicciones de rendimiento
 */

import * as vscode from 'vscode';

/** Tipos de nodos en el circuito */
type NodeType = 'gene' | 'promoter' | 'rbs' | 'terminator' | 'protein';
type ConnectionType = 'activation' | 'repression' | 'production' | 'degradation';

interface CircuitNode {
    id: string;
    type: NodeType;
    name: string;
    parameters: Record<string, number>;
}

interface CircuitConnection {
    from: string;
    to: string;
    type: ConnectionType;
    strength: number;
}

interface GeneticCircuit {
    name: string;
    nodes: CircuitNode[];
    connections: CircuitConnection[];
}

interface OptimizationConfig {
    populationSize: number;
    generations: number;
    mutationRate: number;
    crossoverRate: number;
    objectives: {
        maximizeExpression: boolean;
        minimizeNoise: boolean;
        targetOscillation: boolean;
        minimizeCrosstalk: boolean;
        maximizeStability: boolean;
    };
}

interface OptimizationResult {
    originalCircuit: GeneticCircuit;
    optimizedCircuit: GeneticCircuit;
    fitnessHistory: number[];
    finalFitness: number;
    improvements: string[];
    predictions: PerformancePredictions;
    generationsRun: number;
    parametersChanged: ParameterChange[];
}

interface PerformancePredictions {
    expressionLevel: number;       // 0-100
    noiseCoefficient: number;      // CV% (lower is better)
    responseTime: number;          // minutes
    stabilityScore: number;        // 0-100
    estimatedSuccessRate: number;  // 0-100%
    metabolicBurden: number;       // 0-100 (lower is better)
    robustness: number;            // 0-100
}

interface ParameterChange {
    nodeId: string;
    nodeName: string;
    parameter: string;
    oldValue: number;
    newValue: number;
    impact: string;
}

/** Circuitos de ejemplo pre-cargados */
const DEMO_CIRCUITS: Record<string, GeneticCircuit> = {
    repressilator: {
        name: 'Repressilator',
        nodes: [
            { id: 'p1', type: 'promoter', name: 'pLac', parameters: { strength: 0.8, leakiness: 0.05 } },
            { id: 'g1', type: 'gene', name: 'tetR', parameters: { length: 624, expresionRate: 0.7 } },
            { id: 'r1', type: 'rbs', name: 'RBS-B0034', parameters: { strength: 0.6, secondaryStructure: -5.2 } },
            { id: 'p2', type: 'promoter', name: 'pTet', parameters: { strength: 0.75, leakiness: 0.08 } },
            { id: 'g2', type: 'gene', name: 'cI', parameters: { length: 714, expresionRate: 0.65 } },
            { id: 'r2', type: 'rbs', name: 'RBS-B0032', parameters: { strength: 0.5, secondaryStructure: -3.8 } },
            { id: 'p3', type: 'promoter', name: 'pCI', parameters: { strength: 0.7, leakiness: 0.06 } },
            { id: 'g3', type: 'gene', name: 'lacI', parameters: { length: 1083, expresionRate: 0.72 } },
            { id: 'r3', type: 'rbs', name: 'RBS-B0030', parameters: { strength: 0.55, secondaryStructure: -4.1 } },
            { id: 't1', type: 'terminator', name: 'T1', parameters: { efficiency: 0.95 } },
        ],
        connections: [
            { from: 'g1', to: 'p2', type: 'repression', strength: 0.85 },
            { from: 'g2', to: 'p3', type: 'repression', strength: 0.80 },
            { from: 'g3', to: 'p1', type: 'repression', strength: 0.75 },
        ]
    },
    toggleSwitch: {
        name: 'Toggle Switch',
        nodes: [
            { id: 'p1', type: 'promoter', name: 'pTrc', parameters: { strength: 0.9, leakiness: 0.03 } },
            { id: 'g1', type: 'gene', name: 'lacI', parameters: { length: 1083, expresionRate: 0.75 } },
            { id: 'r1', type: 'rbs', name: 'RBS-strong', parameters: { strength: 0.8, secondaryStructure: -6.0 } },
            { id: 'p2', type: 'promoter', name: 'pLlac', parameters: { strength: 0.85, leakiness: 0.04 } },
            { id: 'g2', type: 'gene', name: 'cIts', parameters: { length: 714, expresionRate: 0.7 } },
            { id: 'r2', type: 'rbs', name: 'RBS-medium', parameters: { strength: 0.6, secondaryStructure: -4.5 } },
            { id: 't1', type: 'terminator', name: 'T7-term', parameters: { efficiency: 0.98 } },
        ],
        connections: [
            { from: 'g1', to: 'p2', type: 'repression', strength: 0.9 },
            { from: 'g2', to: 'p1', type: 'repression', strength: 0.85 },
        ]
    },
    bandpass: {
        name: 'Band-pass Filter',
        nodes: [
            { id: 'p1', type: 'promoter', name: 'pInput', parameters: { strength: 0.7, leakiness: 0.02 } },
            { id: 'g1', type: 'gene', name: 'activator', parameters: { length: 800, expresionRate: 0.8 } },
            { id: 'g2', type: 'gene', name: 'repressor', parameters: { length: 650, expresionRate: 0.6 } },
            { id: 'p2', type: 'promoter', name: 'pOutput', parameters: { strength: 0.85, leakiness: 0.04 } },
            { id: 'g3', type: 'gene', name: 'GFP', parameters: { length: 714, expresionRate: 0.9 } },
            { id: 'r1', type: 'rbs', name: 'RBS-tuned', parameters: { strength: 0.7, secondaryStructure: -4.8 } },
            { id: 't1', type: 'terminator', name: 'rrnB-T1', parameters: { efficiency: 0.97 } },
        ],
        connections: [
            { from: 'g1', to: 'p2', type: 'activation', strength: 0.85 },
            { from: 'g2', to: 'p2', type: 'repression', strength: 0.7 },
            { from: 'p1', to: 'g1', type: 'production', strength: 0.8 },
            { from: 'p1', to: 'g2', type: 'production', strength: 0.5 },
        ]
    }
};

export class CircuitOptimizerUI implements vscode.Disposable {
    private panel: vscode.WebviewPanel | undefined;
    private context: vscode.ExtensionContext;
    private disposables: vscode.Disposable[] = [];

    constructor(context: vscode.ExtensionContext) {
        this.context = context;
    }

    async show(): Promise<void> {
        if (this.panel) {
            this.panel.reveal();
            return;
        }

        this.panel = vscode.window.createWebviewPanel(
            'synbioCircuitOptimizer',
            '⚡ Optimizador de Circuitos',
            vscode.ViewColumn.Two,
            { enableScripts: true, retainContextWhenHidden: true }
        );

        this.panel.webview.html = this.getWebviewHTML();

        this.panel.webview.onDidReceiveMessage(
            async (message) => {
                switch (message.command) {
                    case 'optimize':
                        await this.handleOptimize(message.circuit, message.config);
                        break;
                    case 'loadDemo':
                        this.loadDemoCircuit(message.circuitId);
                        break;
                }
            },
            undefined,
            this.disposables
        );

        this.panel.onDidDispose(() => { this.panel = undefined; }, null, this.disposables);
    }

    /** Ejecuta optimización con algoritmo genético */
    private async handleOptimize(circuit: GeneticCircuit, config: OptimizationConfig): Promise<void> {
        const result = this.runGeneticAlgorithm(circuit, config);

        this.panel?.webview.postMessage({
            command: 'optimizationResult',
            result
        });
    }

    /** Algoritmo genético de optimización */
    private runGeneticAlgorithm(circuit: GeneticCircuit, config: OptimizationConfig): OptimizationResult {
        const popSize = config.populationSize;
        const generations = config.generations;

        // Generar población inicial (variaciones del circuito)
        let population: GeneticCircuit[] = [];
        for (let i = 0; i < popSize; i++) {
            population.push(this.mutateCircuit(this.cloneCircuit(circuit), config.mutationRate * 2));
        }
        population[0] = this.cloneCircuit(circuit); // Preservar original

        const fitnessHistory: number[] = [];
        let bestCircuit = this.cloneCircuit(circuit);
        let bestFitness = this.evaluateFitness(circuit, config.objectives);

        // Evolución
        for (let gen = 0; gen < generations; gen++) {
            // Evaluar fitness
            const fitnesses = population.map(c => this.evaluateFitness(c, config.objectives));

            const maxFitness = Math.max(...fitnesses);
            fitnessHistory.push(maxFitness);

            if (maxFitness > bestFitness) {
                bestFitness = maxFitness;
                bestCircuit = this.cloneCircuit(population[fitnesses.indexOf(maxFitness)]);
            }

            // Selección por torneo + crossover + mutación
            const newPop: GeneticCircuit[] = [];
            // Elitismo: mantener el mejor
            newPop.push(this.cloneCircuit(bestCircuit));

            while (newPop.length < popSize) {
                // Torneo de selección
                const parent1 = this.tournamentSelect(population, fitnesses);
                const parent2 = this.tournamentSelect(population, fitnesses);

                let child: GeneticCircuit;
                if (Math.random() < config.crossoverRate) {
                    child = this.crossover(parent1, parent2);
                } else {
                    child = this.cloneCircuit(Math.random() > 0.5 ? parent1 : parent2);
                }

                if (Math.random() < config.mutationRate) {
                    this.mutateCircuit(child, config.mutationRate);
                }

                newPop.push(child);
            }
            population = newPop;
        }

        // Aplicar optimizaciones deterministas al mejor
        const deterministicResult = this.applyDeterministicOptimizations(bestCircuit, config.objectives);

        // Registrar cambios de parámetros
        const parametersChanged = this.getParameterChanges(circuit, deterministicResult.circuit);

        // Predecir rendimiento
        const predictions = this.predictPerformance(deterministicResult.circuit, config.objectives);

        return {
            originalCircuit: circuit,
            optimizedCircuit: deterministicResult.circuit,
            fitnessHistory,
            finalFitness: bestFitness,
            improvements: [...deterministicResult.improvements],
            predictions,
            generationsRun: generations,
            parametersChanged,
        };
    }

    /** Evaluación de fitness multi-objetivo */
    private evaluateFitness(circuit: GeneticCircuit, objectives: OptimizationConfig['objectives']): number {
        let score = 0;

        // Expresión: promotores fuertes + RBS bien calibrados
        if (objectives.maximizeExpression) {
            const promoterStrength = circuit.nodes
                .filter(n => n.type === 'promoter')
                .reduce((s, n) => s + (n.parameters.strength || 0), 0);
            const rbsStrength = circuit.nodes
                .filter(n => n.type === 'rbs')
                .reduce((s, n) => s + (n.parameters.strength || 0), 0);
            const promoterCount = circuit.nodes.filter(n => n.type === 'promoter').length || 1;
            const rbsCount = circuit.nodes.filter(n => n.type === 'rbs').length || 1;
            score += (promoterStrength / promoterCount + rbsStrength / rbsCount) * 25;
        }

        // Ruido: penalizar leakiness alta
        if (objectives.minimizeNoise) {
            const avgLeakiness = circuit.nodes
                .filter(n => n.type === 'promoter')
                .reduce((s, n) => s + (n.parameters.leakiness || 0), 0) /
                (circuit.nodes.filter(n => n.type === 'promoter').length || 1);
            score += (1 - avgLeakiness * 5) * 20;
        }

        // Oscilación: balance de represiones
        if (objectives.targetOscillation) {
            const repressions = circuit.connections.filter(c => c.type === 'repression');
            if (repressions.length >= 3) {
                const strengths = repressions.map(c => c.strength);
                const avg = strengths.reduce((a, b) => a + b, 0) / strengths.length;
                const variance = strengths.reduce((s, v) => s + Math.pow(v - avg, 2), 0) / strengths.length;
                score += (1 - variance * 10) * 20; // Menos varianza = mejor oscilación
            }
        }

        // Crosstalk mínimo
        if (objectives.minimizeCrosstalk) {
            const uniquePromoters = new Set(circuit.nodes.filter(n => n.type === 'promoter').map(n => n.name));
            score += (uniquePromoters.size / (circuit.nodes.filter(n => n.type === 'promoter').length || 1)) * 15;
        }

        // Estabilidad: terminadores eficientes
        if (objectives.maximizeStability) {
            const termEfficiency = circuit.nodes
                .filter(n => n.type === 'terminator')
                .reduce((s, n) => s + (n.parameters.efficiency || 0), 0) /
                (circuit.nodes.filter(n => n.type === 'terminator').length || 1);
            score += termEfficiency * 20;
        }

        return Math.max(0, Math.min(100, score));
    }

    /** Selección por torneo (k=3) */
    private tournamentSelect(population: GeneticCircuit[], fitnesses: number[]): GeneticCircuit {
        const k = 3;
        let bestIdx = Math.floor(Math.random() * population.length);
        for (let i = 1; i < k; i++) {
            const idx = Math.floor(Math.random() * population.length);
            if (fitnesses[idx] > fitnesses[bestIdx]) {
                bestIdx = idx;
            }
        }
        return population[bestIdx];
    }

    /** Crossover de dos circuitos */
    private crossover(parent1: GeneticCircuit, parent2: GeneticCircuit): GeneticCircuit {
        const child = this.cloneCircuit(parent1);

        // Intercambiar parámetros entre padres
        for (let i = 0; i < child.nodes.length; i++) {
            if (i < parent2.nodes.length && Math.random() > 0.5) {
                // Tomar parámetros del padre 2
                child.nodes[i].parameters = { ...parent2.nodes[i].parameters };
            }
        }

        // Intercambiar fuerzas de conexión
        for (let i = 0; i < child.connections.length; i++) {
            if (i < parent2.connections.length && Math.random() > 0.5) {
                child.connections[i].strength = parent2.connections[i].strength;
            }
        }

        return child;
    }

    /** Mutación de un circuito */
    private mutateCircuit(circuit: GeneticCircuit, rate: number): GeneticCircuit {
        // Mutar parámetros de nodos
        for (const node of circuit.nodes) {
            for (const key of Object.keys(node.parameters)) {
                if (Math.random() < rate) {
                    const delta = (Math.random() - 0.5) * 0.3;
                    node.parameters[key] = Math.max(0, Math.min(1, node.parameters[key] + delta));
                }
            }
        }

        // Mutar fuerzas de conexión
        for (const conn of circuit.connections) {
            if (Math.random() < rate) {
                const delta = (Math.random() - 0.5) * 0.2;
                conn.strength = Math.max(0.1, Math.min(1, conn.strength + delta));
            }
        }

        return circuit;
    }

    /** Optimizaciones deterministas (post-GA) */
    private applyDeterministicOptimizations(circuit: GeneticCircuit, objectives: OptimizationConfig['objectives']): { circuit: GeneticCircuit; improvements: string[] } {
        const c = this.cloneCircuit(circuit);
        const improvements: string[] = [];

        // 1. Balancear promotores para oscilación
        if (objectives.targetOscillation) {
            const promoters = c.nodes.filter(n => n.type === 'promoter');
            if (promoters.length >= 2) {
                const avgStrength = promoters.reduce((s, n) => s + n.parameters.strength, 0) / promoters.length;
                for (const p of promoters) {
                    const old = p.parameters.strength;
                    p.parameters.strength = old * 0.7 + avgStrength * 0.3;
                    if (Math.abs(old - p.parameters.strength) > 0.01) {
                        improvements.push(`Balanceado promotor ${p.name}: ${(old * 100).toFixed(0)}% → ${(p.parameters.strength * 100).toFixed(0)}%`);
                    }
                }
            }
        }

        // 2. Optimizar RBS para máxima traducción
        if (objectives.maximizeExpression) {
            for (const rbs of c.nodes.filter(n => n.type === 'rbs')) {
                if (rbs.parameters.strength < 0.7) {
                    const old = rbs.parameters.strength;
                    rbs.parameters.strength = Math.min(0.85, rbs.parameters.strength * 1.3);
                    improvements.push(`RBS ${rbs.name} fortalecido: ${(old * 100).toFixed(0)}% → ${(rbs.parameters.strength * 100).toFixed(0)}%`);
                }
                // Reducir estructura secundaria si es muy negativa
                if (rbs.parameters.secondaryStructure && rbs.parameters.secondaryStructure < -5) {
                    improvements.push(`Sugerido rediseño de RBS ${rbs.name}: ΔG=${rbs.parameters.secondaryStructure.toFixed(1)} kcal/mol (muy estable, reduce traducción)`);
                }
            }
        }

        // 3. Asegurar terminadores eficientes
        if (objectives.maximizeStability) {
            for (const term of c.nodes.filter(n => n.type === 'terminator')) {
                if (term.parameters.efficiency < 0.95) {
                    const old = term.parameters.efficiency;
                    term.parameters.efficiency = Math.min(0.99, term.parameters.efficiency * 1.05);
                    improvements.push(`Terminador ${term.name}: eficiencia ${(old * 100).toFixed(0)}% → ${(term.parameters.efficiency * 100).toFixed(0)}%`);
                }
            }
        }

        // 4. Reducir leakiness para bajo ruido
        if (objectives.minimizeNoise) {
            for (const prom of c.nodes.filter(n => n.type === 'promoter')) {
                if (prom.parameters.leakiness > 0.05) {
                    const old = prom.parameters.leakiness;
                    prom.parameters.leakiness = Math.max(0.01, prom.parameters.leakiness * 0.6);
                    improvements.push(`Reducido leakiness ${prom.name}: ${(old * 100).toFixed(1)}% → ${(prom.parameters.leakiness * 100).toFixed(1)}%`);
                }
            }
        }

        return { circuit: c, improvements };
    }

    /** Predicción de rendimiento del circuito */
    private predictPerformance(circuit: GeneticCircuit, objectives: OptimizationConfig['objectives']): PerformancePredictions {
        const promoters = circuit.nodes.filter(n => n.type === 'promoter');
        const genes = circuit.nodes.filter(n => n.type === 'gene');
        const rbs = circuit.nodes.filter(n => n.type === 'rbs');
        const terms = circuit.nodes.filter(n => n.type === 'terminator');

        const avgPromoterStrength = promoters.length > 0 ? promoters.reduce((s, n) => s + (n.parameters.strength || 0), 0) / promoters.length : 0.5;
        const avgRBSStrength = rbs.length > 0 ? rbs.reduce((s, n) => s + (n.parameters.strength || 0), 0) / rbs.length : 0.5;
        const avgLeakiness = promoters.length > 0 ? promoters.reduce((s, n) => s + (n.parameters.leakiness || 0), 0) / promoters.length : 0.05;
        const avgTermEfficiency = terms.length > 0 ? terms.reduce((s, n) => s + (n.parameters.efficiency || 0), 0) / terms.length : 0.9;

        const expressionLevel = Math.min(100, (avgPromoterStrength * 50 + avgRBSStrength * 50));
        const noiseCoefficient = Math.max(5, avgLeakiness * 200 + (1 - avgTermEfficiency) * 100 + 5);
        const responseTime = Math.max(5, 60 / (avgPromoterStrength * avgRBSStrength + 0.1));
        const stabilityScore = Math.min(100, avgTermEfficiency * 60 + (1 - avgLeakiness) * 40);
        const totalGeneLength = genes.reduce((s, n) => s + (n.parameters.length || 500), 0);
        const metabolicBurden = Math.min(100, totalGeneLength / 100 + genes.length * 5);
        const repressions = circuit.connections.filter(c => c.type === 'repression');
        const robustness = repressions.length > 0
            ? Math.min(100, repressions.reduce((s, c) => s + c.strength, 0) / repressions.length * 100)
            : 50;

        const estimatedSuccessRate = (expressionLevel * 0.3 + stabilityScore * 0.3 + robustness * 0.2 + (100 - metabolicBurden) * 0.2);

        return {
            expressionLevel: Math.round(expressionLevel * 10) / 10,
            noiseCoefficient: Math.round(noiseCoefficient * 10) / 10,
            responseTime: Math.round(responseTime * 10) / 10,
            stabilityScore: Math.round(stabilityScore * 10) / 10,
            estimatedSuccessRate: Math.round(estimatedSuccessRate * 10) / 10,
            metabolicBurden: Math.round(metabolicBurden * 10) / 10,
            robustness: Math.round(robustness * 10) / 10,
        };
    }

    /** Obtiene cambios de parámetros entre original y optimizado */
    private getParameterChanges(original: GeneticCircuit, optimized: GeneticCircuit): ParameterChange[] {
        const changes: ParameterChange[] = [];

        for (let i = 0; i < original.nodes.length && i < optimized.nodes.length; i++) {
            const origNode = original.nodes[i];
            const optNode = optimized.nodes[i];

            for (const key of Object.keys(origNode.parameters)) {
                const oldVal = origNode.parameters[key];
                const newVal = optNode.parameters[key];
                if (newVal !== undefined && Math.abs(oldVal - newVal) > 0.001) {
                    let impact = 'neutral';
                    if (key === 'strength' && newVal > oldVal) { impact = 'Mayor expresión'; }
                    else if (key === 'leakiness' && newVal < oldVal) { impact = 'Menor ruido'; }
                    else if (key === 'efficiency' && newVal > oldVal) { impact = 'Mayor estabilidad'; }
                    else if (key === 'secondaryStructure') { impact = 'Estructura optimizada'; }

                    changes.push({
                        nodeId: origNode.id,
                        nodeName: origNode.name,
                        parameter: key,
                        oldValue: Math.round(oldVal * 1000) / 1000,
                        newValue: Math.round(newVal * 1000) / 1000,
                        impact
                    });
                }
            }
        }

        return changes;
    }

    private cloneCircuit(c: GeneticCircuit): GeneticCircuit {
        return JSON.parse(JSON.stringify(c));
    }

    private loadDemoCircuit(circuitId: string): void {
        const circuit = DEMO_CIRCUITS[circuitId];
        if (circuit) {
            this.panel?.webview.postMessage({ command: 'loadCircuit', circuit });
        }
    }

    private getWebviewHTML(): string {
        return `<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Optimizador de Circuitos Genéticos</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: 'Segoe UI', Tahoma, sans-serif; background: #1e1e2e; color: #cdd6f4; padding: 20px; }
        
        .header { display: flex; align-items: center; gap: 12px; margin-bottom: 24px; }
        .header h1 { font-size: 22px; color: #cba6f7; }
        .header .badge { background: #313244; color: #a6adc8; padding: 4px 10px; border-radius: 12px; font-size: 11px; }

        .card { background: #313244; border-radius: 12px; padding: 20px; margin-bottom: 16px; border: 1px solid #45475a; }
        .card h3 { color: #cba6f7; margin-bottom: 12px; font-size: 15px; }

        .demo-buttons { display: flex; gap: 10px; flex-wrap: wrap; }
        .demo-btn { padding: 10px 16px; background: #45475a; color: #cdd6f4; border: 1px solid #585b70; border-radius: 8px; cursor: pointer; font-size: 13px; transition: all 0.2s; }
        .demo-btn:hover { background: #585b70; border-color: #cba6f7; }
        .demo-btn.active { background: #cba6f7; color: #1e1e2e; border-color: #cba6f7; font-weight: 600; }

        .circuit-info { background: #1e1e2e; border-radius: 8px; padding: 14px; margin-top: 12px; display: none; }
        .circuit-info.visible { display: block; }
        .circuit-info .name { font-size: 16px; color: #f5c2e7; font-weight: 600; }
        .circuit-info .meta { font-size: 12px; color: #a6adc8; margin-top: 4px; }

        .config-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
        .config-item label { display: block; font-size: 13px; color: #a6adc8; margin-bottom: 4px; }
        .config-item input[type="number"] { width: 100%; background: #1e1e2e; color: #cdd6f4; border: 1px solid #45475a; border-radius: 6px; padding: 8px; font-size: 13px; }
        .config-item input[type="number"]:focus { border-color: #cba6f7; outline: none; }

        .objectives { display: flex; flex-wrap: wrap; gap: 12px; margin-top: 12px; }
        .objectives label { display: flex; align-items: center; gap: 6px; font-size: 13px; cursor: pointer; padding: 6px 10px; background: #1e1e2e; border-radius: 6px; border: 1px solid #45475a; transition: all 0.2s; }
        .objectives label:has(input:checked) { border-color: #cba6f7; background: rgba(203, 166, 247, 0.1); }
        input[type="checkbox"] { accent-color: #cba6f7; width: 15px; height: 15px; }

        .btn { padding: 12px 24px; border: none; border-radius: 8px; font-size: 14px; cursor: pointer; font-weight: 600; transition: all 0.2s; }
        .btn-primary { background: linear-gradient(135deg, #cba6f7, #f5c2e7); color: #1e1e2e; }
        .btn-primary:hover { filter: brightness(1.1); transform: translateY(-1px); }
        .btn:disabled { opacity: 0.5; cursor: not-allowed; }

        .results { display: none; }
        .results.visible { display: block; }

        .predictions-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(130px, 1fr)); gap: 10px; }
        .pred-card { background: #1e1e2e; border-radius: 8px; padding: 12px; text-align: center; border: 1px solid #45475a; }
        .pred-value { font-size: 24px; font-weight: 700; }
        .pred-value.good { color: #a6e3a1; }
        .pred-value.medium { color: #f9e2af; }
        .pred-value.bad { color: #f38ba8; }
        .pred-label { font-size: 10px; color: #a6adc8; margin-top: 4px; text-transform: uppercase; letter-spacing: 0.5px; }
        .pred-unit { font-size: 11px; color: #6c7086; }

        .fitness-chart { width: 100%; height: 200px; background: #1e1e2e; border-radius: 8px; border: 1px solid #45475a; position: relative; overflow: hidden; }
        .fitness-chart canvas { width: 100%; height: 100%; }

        .improvements-list { list-style: none; }
        .improvements-list li { padding: 8px 0; border-bottom: 1px solid #45475a; font-size: 13px; display: flex; align-items: center; gap: 8px; }
        .improvements-list li:last-child { border-bottom: none; }
        .imp-icon { width: 20px; height: 20px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 11px; }
        .imp-icon.up { background: rgba(166, 227, 161, 0.2); color: #a6e3a1; }
        .imp-icon.down { background: rgba(249, 226, 175, 0.2); color: #f9e2af; }

        .changes-table { width: 100%; border-collapse: collapse; font-size: 12px; margin-top: 8px; }
        .changes-table th { background: #1e1e2e; padding: 8px; text-align: left; color: #cba6f7; border-bottom: 2px solid #45475a; }
        .changes-table td { padding: 6px 8px; border-bottom: 1px solid #45475a; }
        .changes-table .delta { font-weight: 600; }
        .changes-table .delta.positive { color: #a6e3a1; }
        .changes-table .delta.negative { color: #f38ba8; }

        .spinner { display: inline-block; width: 16px; height: 16px; border: 2px solid #45475a; border-top-color: #cba6f7; border-radius: 50%; animation: spin 0.8s linear infinite; }
        @keyframes spin { to { transform: rotate(360deg); } }

        .circuit-canvas { width: 100%; height: 180px; background: #1e1e2e; border-radius: 8px; margin-top: 12px; }

        .tabs { display: flex; gap: 2px; margin-bottom: 16px; }
        .tab { padding: 8px 16px; background: #45475a; color: #a6adc8; border: none; cursor: pointer; font-size: 13px; transition: all 0.2s; }
        .tab:first-child { border-radius: 8px 0 0 8px; }
        .tab:last-child { border-radius: 0 8px 8px 0; }
        .tab.active { background: #cba6f7; color: #1e1e2e; font-weight: 600; }
        .tab-content { display: none; }
        .tab-content.active { display: block; }

        .progress-bar { height: 4px; background: #45475a; border-radius: 2px; overflow: hidden; margin-top: 12px; display: none; }
        .progress-bar.visible { display: block; }
        .progress-fill { height: 100%; background: linear-gradient(90deg, #cba6f7, #f5c2e7); border-radius: 2px; transition: width 0.3s; }
    </style>
</head>
<body>
    <div class="header">
        <h1>⚡ Optimizador de Circuitos Genéticos</h1>
        <span class="badge">Algoritmo Genético</span>
    </div>

    <div class="card">
        <h3>🧬 Seleccionar Circuito</h3>
        <div class="demo-buttons">
            <button class="demo-btn" onclick="loadDemo('repressilator')">🔄 Repressilator</button>
            <button class="demo-btn" onclick="loadDemo('toggleSwitch')">🔀 Toggle Switch</button>
            <button class="demo-btn" onclick="loadDemo('bandpass')">📡 Band-pass Filter</button>
        </div>
        <div class="circuit-info" id="circuitInfo">
            <div class="name" id="circuitName"></div>
            <div class="meta" id="circuitMeta"></div>
            <canvas class="circuit-canvas" id="circuitCanvas"></canvas>
        </div>
    </div>

    <div class="card">
        <h3>⚙️ Configuración del Algoritmo Genético</h3>
        <div class="config-grid">
            <div class="config-item">
                <label>Tamaño de Población</label>
                <input type="number" id="popSize" value="30" min="10" max="200">
            </div>
            <div class="config-item">
                <label>Generaciones</label>
                <input type="number" id="generations" value="50" min="10" max="500">
            </div>
            <div class="config-item">
                <label>Tasa de Mutación</label>
                <input type="number" id="mutationRate" value="0.15" min="0.01" max="0.5" step="0.01">
            </div>
            <div class="config-item">
                <label>Tasa de Crossover</label>
                <input type="number" id="crossoverRate" value="0.7" min="0.1" max="1.0" step="0.05">
            </div>
        </div>

        <h3 style="margin-top: 16px;">🎯 Objetivos de Optimización</h3>
        <div class="objectives">
            <label><input type="checkbox" id="objExpression" checked> 💪 Maximizar Expresión</label>
            <label><input type="checkbox" id="objNoise" checked> 🔇 Minimizar Ruido</label>
            <label><input type="checkbox" id="objOscillation"> 🔄 Oscilación Estable</label>
            <label><input type="checkbox" id="objCrosstalk"> 🚫 Minimizar Crosstalk</label>
            <label><input type="checkbox" id="objStability" checked> 🛡️ Maximizar Estabilidad</label>
        </div>
    </div>

    <div style="margin-bottom: 24px;">
        <button class="btn btn-primary" id="optimizeBtn" onclick="runOptimization()">⚡ Ejecutar Optimización</button>
        <div class="progress-bar" id="progressBar"><div class="progress-fill" id="progressFill"></div></div>
    </div>

    <div class="results" id="results">
        <div class="card">
            <h3>📊 Predicciones de Rendimiento</h3>
            <div class="predictions-grid" id="predictionsGrid"></div>
        </div>

        <div class="card">
            <h3>📈 Evolución del Fitness</h3>
            <canvas id="fitnessChart" width="700" height="200"></canvas>
        </div>

        <div class="card">
            <div class="tabs">
                <button class="tab active" onclick="switchTab('improvements')">Mejoras</button>
                <button class="tab" onclick="switchTab('parameters')">Parámetros</button>
                <button class="tab" onclick="switchTab('summary')">Resumen</button>
            </div>

            <div class="tab-content active" id="tab-improvements">
                <ul class="improvements-list" id="improvementsList"></ul>
            </div>

            <div class="tab-content" id="tab-parameters">
                <div id="parametersContent"></div>
            </div>

            <div class="tab-content" id="tab-summary">
                <div id="summaryContent"></div>
            </div>
        </div>
    </div>

    <script>
        const vscode = acquireVsCodeApi();
        let currentCircuit = null;
        let currentResult = null;

        function loadDemo(id) {
            document.querySelectorAll('.demo-btn').forEach(b => b.classList.remove('active'));
            event.target.classList.add('active');
            vscode.postMessage({ command: 'loadDemo', circuitId: id });
        }

        function runOptimization() {
            if (!currentCircuit) { return; }

            const btn = document.getElementById('optimizeBtn');
            btn.disabled = true;
            btn.innerHTML = '<span class="spinner"></span> Optimizando...';

            const bar = document.getElementById('progressBar');
            bar.classList.add('visible');
            animateProgress();

            vscode.postMessage({
                command: 'optimize',
                circuit: currentCircuit,
                config: {
                    populationSize: parseInt(document.getElementById('popSize').value),
                    generations: parseInt(document.getElementById('generations').value),
                    mutationRate: parseFloat(document.getElementById('mutationRate').value),
                    crossoverRate: parseFloat(document.getElementById('crossoverRate').value),
                    objectives: {
                        maximizeExpression: document.getElementById('objExpression').checked,
                        minimizeNoise: document.getElementById('objNoise').checked,
                        targetOscillation: document.getElementById('objOscillation').checked,
                        minimizeCrosstalk: document.getElementById('objCrosstalk').checked,
                        maximizeStability: document.getElementById('objStability').checked,
                    }
                }
            });
        }

        let progressInterval;
        function animateProgress() {
            let p = 0;
            const fill = document.getElementById('progressFill');
            clearInterval(progressInterval);
            progressInterval = setInterval(() => {
                p = Math.min(95, p + Math.random() * 5);
                fill.style.width = p + '%';
            }, 100);
        }

        function switchTab(tab) {
            document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
            document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
            event.target.classList.add('active');
            document.getElementById('tab-' + tab).classList.add('active');
        }

        function drawCircuit(circuit) {
            const canvas = document.getElementById('circuitCanvas');
            const ctx = canvas.getContext('2d');
            canvas.width = canvas.offsetWidth;
            canvas.height = 180;
            ctx.clearRect(0, 0, canvas.width, canvas.height);

            const colors = { promoter: '#cba6f7', gene: '#89b4fa', rbs: '#a6e3a1', terminator: '#f38ba8', protein: '#f9e2af' };
            const symbols = { promoter: '→', gene: '▣', rbs: '◆', terminator: '⊣', protein: '●' };

            const nodePositions = {};
            const nodeCount = circuit.nodes.length;
            const spacing = canvas.width / (nodeCount + 1);

            // Draw nodes
            circuit.nodes.forEach((node, i) => {
                const x = spacing * (i + 1);
                const y = 90;
                nodePositions[node.id] = { x, y };

                ctx.fillStyle = colors[node.type] || '#cdd6f4';
                ctx.beginPath();
                ctx.arc(x, y, 18, 0, Math.PI * 2);
                ctx.fill();

                ctx.fillStyle = '#1e1e2e';
                ctx.font = '14px sans-serif';
                ctx.textAlign = 'center';
                ctx.fillText(symbols[node.type] || '?', x, y + 5);

                ctx.fillStyle = '#a6adc8';
                ctx.font = '10px sans-serif';
                ctx.fillText(node.name, x, y + 35);
            });

            // Draw connections
            for (const conn of circuit.connections) {
                const from = nodePositions[conn.from];
                const to = nodePositions[conn.to];
                if (!from || !to) continue;

                ctx.strokeStyle = conn.type === 'repression' ? '#f38ba8' : conn.type === 'activation' ? '#a6e3a1' : '#89b4fa';
                ctx.lineWidth = conn.strength * 3;
                ctx.setLineDash(conn.type === 'repression' ? [5, 3] : []);

                ctx.beginPath();
                const midY = conn.from === conn.to ? y - 40 : from.y - 50;
                ctx.moveTo(from.x, from.y - 18);
                ctx.quadraticCurveTo((from.x + to.x) / 2, midY, to.x, to.y - 18);
                ctx.stroke();

                // Arrow
                ctx.fillStyle = ctx.strokeStyle;
                ctx.beginPath();
                if (conn.type === 'repression') {
                    ctx.fillRect(to.x - 4, to.y - 22, 8, 3);
                } else {
                    ctx.moveTo(to.x, to.y - 18);
                    ctx.lineTo(to.x - 5, to.y - 25);
                    ctx.lineTo(to.x + 5, to.y - 25);
                }
                ctx.fill();
                ctx.setLineDash([]);
            }
        }

        function drawFitnessChart(history) {
            const canvas = document.getElementById('fitnessChart');
            const ctx = canvas.getContext('2d');
            canvas.width = canvas.offsetWidth || 700;
            canvas.height = 200;
            ctx.clearRect(0, 0, canvas.width, canvas.height);

            if (history.length === 0) return;

            const padding = { top: 20, right: 20, bottom: 30, left: 50 };
            const w = canvas.width - padding.left - padding.right;
            const h = canvas.height - padding.top - padding.bottom;

            const maxVal = Math.max(...history);
            const minVal = Math.min(...history);
            const range = maxVal - minVal || 1;

            // Grid
            ctx.strokeStyle = '#313244';
            ctx.lineWidth = 1;
            for (let i = 0; i <= 4; i++) {
                const y = padding.top + (h / 4) * i;
                ctx.beginPath();
                ctx.moveTo(padding.left, y);
                ctx.lineTo(padding.left + w, y);
                ctx.stroke();

                ctx.fillStyle = '#6c7086';
                ctx.font = '10px sans-serif';
                ctx.textAlign = 'right';
                ctx.fillText((maxVal - (range / 4) * i).toFixed(1), padding.left - 5, y + 4);
            }

            // X axis labels
            ctx.fillStyle = '#6c7086';
            ctx.textAlign = 'center';
            for (let i = 0; i <= 4; i++) {
                const x = padding.left + (w / 4) * i;
                const gen = Math.round(history.length / 4 * i);
                ctx.fillText('Gen ' + gen, x, canvas.height - 5);
            }

            // Gradient fill
            const gradient = ctx.createLinearGradient(0, padding.top, 0, padding.top + h);
            gradient.addColorStop(0, 'rgba(203, 166, 247, 0.3)');
            gradient.addColorStop(1, 'rgba(203, 166, 247, 0.0)');

            ctx.beginPath();
            ctx.moveTo(padding.left, padding.top + h);
            for (let i = 0; i < history.length; i++) {
                const x = padding.left + (i / (history.length - 1)) * w;
                const y = padding.top + h - ((history[i] - minVal) / range) * h;
                ctx.lineTo(x, y);
            }
            ctx.lineTo(padding.left + w, padding.top + h);
            ctx.closePath();
            ctx.fillStyle = gradient;
            ctx.fill();

            // Line
            ctx.beginPath();
            ctx.strokeStyle = '#cba6f7';
            ctx.lineWidth = 2;
            for (let i = 0; i < history.length; i++) {
                const x = padding.left + (i / (history.length - 1)) * w;
                const y = padding.top + h - ((history[i] - minVal) / range) * h;
                if (i === 0) ctx.moveTo(x, y);
                else ctx.lineTo(x, y);
            }
            ctx.stroke();

            // Final point
            const lastX = padding.left + w;
            const lastY = padding.top + h - ((history[history.length - 1] - minVal) / range) * h;
            ctx.fillStyle = '#f5c2e7';
            ctx.beginPath();
            ctx.arc(lastX, lastY, 5, 0, Math.PI * 2);
            ctx.fill();

            // Labels
            ctx.fillStyle = '#cba6f7';
            ctx.font = 'bold 11px sans-serif';
            ctx.textAlign = 'left';
            ctx.fillText('Fitness: ' + history[history.length - 1].toFixed(2), padding.left + 5, padding.top + 15);
        }

        function renderResults(result) {
            currentResult = result;
            const p = result.predictions;

            // Predictions grid
            const predClass = (val, threshGood, threshBad, invert) => {
                if (invert) return val < threshGood ? 'good' : val < threshBad ? 'medium' : 'bad';
                return val > threshGood ? 'good' : val > threshBad ? 'medium' : 'bad';
            };

            document.getElementById('predictionsGrid').innerHTML =
                '<div class="pred-card"><div class="pred-value ' + predClass(p.expressionLevel, 70, 40) + '">' + p.expressionLevel + '</div><div class="pred-label">Expresión</div><div class="pred-unit">% máximo teórico</div></div>' +
                '<div class="pred-card"><div class="pred-value ' + predClass(p.noiseCoefficient, 15, 30, true) + '">' + p.noiseCoefficient + '%</div><div class="pred-label">Ruido (CV)</div><div class="pred-unit">coef. variación</div></div>' +
                '<div class="pred-card"><div class="pred-value ' + predClass(p.responseTime, 30, 60, true) + '">' + p.responseTime + '</div><div class="pred-label">Respuesta</div><div class="pred-unit">minutos</div></div>' +
                '<div class="pred-card"><div class="pred-value ' + predClass(p.stabilityScore, 80, 50) + '">' + p.stabilityScore + '</div><div class="pred-label">Estabilidad</div><div class="pred-unit">score</div></div>' +
                '<div class="pred-card"><div class="pred-value ' + predClass(p.estimatedSuccessRate, 70, 40) + '">' + p.estimatedSuccessRate + '%</div><div class="pred-label">Éxito Estimado</div><div class="pred-unit">probabilidad</div></div>' +
                '<div class="pred-card"><div class="pred-value ' + predClass(p.metabolicBurden, 30, 60, true) + '">' + p.metabolicBurden + '</div><div class="pred-label">Carga Metabólica</div><div class="pred-unit">% ATP estimado</div></div>' +
                '<div class="pred-card"><div class="pred-value ' + predClass(p.robustness, 70, 40) + '">' + p.robustness + '</div><div class="pred-label">Robustez</div><div class="pred-unit">score</div></div>';

            // Fitness chart
            drawFitnessChart(result.fitnessHistory);

            // Improvements
            const list = document.getElementById('improvementsList');
            list.innerHTML = '';
            for (const imp of result.improvements) {
                const li = document.createElement('li');
                const icon = imp.includes('fortalecido') || imp.includes('eficiencia') ? 'up' : 'down';
                li.innerHTML = '<span class="imp-icon ' + icon + '">' + (icon === 'up' ? '↑' : '↓') + '</span>' + imp;
                list.appendChild(li);
            }
            if (result.improvements.length === 0) {
                list.innerHTML = '<li><span class="imp-icon up">✓</span>Circuito ya está optimizado</li>';
            }

            // Parameters table
            if (result.parametersChanged.length > 0) {
                let html = '<table class="changes-table"><thead><tr><th>Componente</th><th>Parámetro</th><th>Original</th><th>Optimizado</th><th>Impacto</th></tr></thead><tbody>';
                for (const c of result.parametersChanged) {
                    const delta = c.newValue - c.oldValue;
                    const cls = delta > 0 ? 'positive' : 'negative';
                    html += '<tr><td>' + c.nodeName + '</td><td>' + c.parameter + '</td><td>' + c.oldValue.toFixed(3) + '</td><td class="delta ' + cls + '">' + c.newValue.toFixed(3) + ' (' + (delta > 0 ? '+' : '') + delta.toFixed(3) + ')</td><td>' + c.impact + '</td></tr>';
                }
                html += '</tbody></table>';
                document.getElementById('parametersContent').innerHTML = html;
            } else {
                document.getElementById('parametersContent').innerHTML = '<p style="color:#a6adc8; padding:12px;">Sin cambios de parámetros</p>';
            }

            // Summary
            document.getElementById('summaryContent').innerHTML =
                '<div style="padding:12px; line-height:1.8;">' +
                '<p>🧬 <strong>Circuito:</strong> ' + result.originalCircuit.name + '</p>' +
                '<p>🔄 <strong>Generaciones:</strong> ' + result.generationsRun + '</p>' +
                '<p>📊 <strong>Fitness final:</strong> ' + result.finalFitness.toFixed(2) + '/100</p>' +
                '<p>🔧 <strong>Parámetros modificados:</strong> ' + result.parametersChanged.length + '</p>' +
                '<p>✅ <strong>Mejoras aplicadas:</strong> ' + result.improvements.length + '</p>' +
                '<p>🎯 <strong>Tasa de éxito estimada:</strong> ' + p.estimatedSuccessRate + '%</p>' +
                '</div>';

            document.getElementById('results').classList.add('visible');
        }

        window.addEventListener('message', event => {
            const msg = event.data;
            switch (msg.command) {
                case 'loadCircuit':
                    currentCircuit = msg.circuit;
                    const info = document.getElementById('circuitInfo');
                    info.classList.add('visible');
                    document.getElementById('circuitName').textContent = msg.circuit.name;
                    document.getElementById('circuitMeta').textContent =
                        msg.circuit.nodes.length + ' nodos · ' + msg.circuit.connections.length + ' conexiones · ' +
                        msg.circuit.nodes.filter(n => n.type === 'gene').length + ' genes';
                    drawCircuit(msg.circuit);

                    // Auto-set oscillation for repressilator
                    if (msg.circuit.name === 'Repressilator') {
                        document.getElementById('objOscillation').checked = true;
                    }
                    break;

                case 'optimizationResult':
                    clearInterval(progressInterval);
                    document.getElementById('progressFill').style.width = '100%';
                    setTimeout(() => {
                        document.getElementById('progressBar').classList.remove('visible');
                    }, 500);
                    document.getElementById('optimizeBtn').disabled = false;
                    document.getElementById('optimizeBtn').innerHTML = '⚡ Ejecutar Optimización';
                    renderResults(msg.result);
                    break;
            }
        });
    </script>
</body>
</html>`;
    }

    dispose(): void {
        this.panel?.dispose();
        this.disposables.forEach(d => d.dispose());
    }
}
