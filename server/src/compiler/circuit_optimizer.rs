#![allow(dead_code)]
/**
 * Circuit Optimizer
 * Optimiza topología y parámetros de circuitos genéticos
 * Usa algoritmos genéticos, hill climbing y análisis de sensibilidad
 */

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::{SystemTime, UNIX_EPOCH};

/// Thread-safe xorshift64 PRNG state — seeded once from system time
static RNG_STATE: AtomicU64 = AtomicU64::new(0);

/// Xorshift64 pseudo-random number generator.
/// Full 64-bit period (2^64 - 1), uniform distribution, fast.
/// Seeded from system time on first call.
fn pseudo_random() -> f64 {
    let mut state = RNG_STATE.load(Ordering::Relaxed);
    if state == 0 {
        // Seed from high-resolution system time on first call
        state = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos() as u64;
        if state == 0 {
            state = 0x5DEECE66D; // fallback seed (Java LCG constant)
        }
    }
    // Xorshift64 — Marsaglia (2003)
    state ^= state << 13;
    state ^= state >> 7;
    state ^= state << 17;
    RNG_STATE.store(state, Ordering::Relaxed);
    // Map to [0, 1) with full mantissa resolution
    (state >> 11) as f64 / ((1u64 << 53) as f64)
}

fn pseudo_random_bool() -> bool {
    pseudo_random() > 0.5
}

fn pseudo_random_usize(max: usize) -> usize {
    if max == 0 { return 0; }
    (pseudo_random() * max as f64) as usize
}

/// Nodo de un circuito genético
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CircuitNode {
    pub id: String,
    pub node_type: NodeType,
    pub parameters: HashMap<String, f64>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum NodeType {
    Gene,
    Promoter,
    RBS,
    Terminator,
    Protein,
}

/// Conexión entre nodos
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Connection {
    pub from: String,
    pub to: String,
    pub connection_type: ConnectionType,
    pub strength: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum ConnectionType {
    Activation,
    Repression,
    Production,
    Degradation,
}

/// Circuito genético completo
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GeneticCircuit {
    pub name: String,
    pub nodes: Vec<CircuitNode>,
    pub connections: Vec<Connection>,
    pub objectives: OptimizationObjectives,
}

/// Objetivos de optimización
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OptimizationObjectives {
    pub maximize_expression: bool,
    pub minimize_noise: bool,
    pub target_oscillation: Option<f64>,
    pub target_bistability: bool,
    pub minimize_crosstalk: bool,
}

/// Resultado de optimización
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CircuitOptimizationResult {
    pub original_circuit: GeneticCircuit,
    pub optimized_circuit: GeneticCircuit,
    pub fitness_improvement: f64,
    pub iterations: usize,
    pub optimizations_applied: Vec<String>,
    pub predictions: PerformancePredictions,
}

/// Predicciones de rendimiento
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PerformancePredictions {
    pub expression_level: f64,
    pub noise_coefficient: f64,
    pub response_time: f64,
    pub stability_score: f64,
    pub estimated_success_rate: f64,
}

/// Optimizador de circuitos
pub struct CircuitOptimizer {
    population_size: usize,
    generations: usize,
    mutation_rate: f64,
}

impl CircuitOptimizer {
    pub fn new() -> Self {
        Self {
            population_size: 50,
            generations: 100,
            mutation_rate: 0.1,
        }
    }

    pub fn with_params(population_size: usize, generations: usize, mutation_rate: f64) -> Self {
        Self {
            population_size,
            generations,
            mutation_rate,
        }
    }

    /// Optimiza un circuito genético
    pub fn optimize(&self, circuit: GeneticCircuit) -> CircuitOptimizationResult {
        let original_fitness = self.evaluate_fitness(&circuit);
        
        // Algoritmo genético
        let mut population = self.initialize_population(&circuit);
        let mut best_circuit = circuit.clone();
        let mut best_fitness = original_fitness;
        let mut optimizations = Vec::new();
        
        for generation in 0..self.generations {
            // Evaluar población
            let mut fitness_scores: Vec<(GeneticCircuit, f64)> = population
                .iter()
                .map(|c| (c.clone(), self.evaluate_fitness(c)))
                .collect();
            
            // Ordenar por fitness
            fitness_scores.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap());
            
            // Actualizar mejor
            if fitness_scores[0].1 > best_fitness {
                best_circuit = fitness_scores[0].0.clone();
                best_fitness = fitness_scores[0].1;
                optimizations.push(format!("Generación {}: Fitness {:.3}", generation, best_fitness));
            }
            
            // Selección y reproducción
            population = self.evolve_population(&fitness_scores);
        }
        
        // Aplicar optimizaciones determinísticas adicionales
        let final_circuit = self.apply_deterministic_optimizations(best_circuit);
        let final_fitness = self.evaluate_fitness(&final_circuit);
        
        optimizations.push("Optimizaciones de promotores aplicadas".to_string());
        optimizations.push("Balance de RBS optimizado".to_string());
        optimizations.push("Terminadores balanceados".to_string());
        
        let predictions = self.predict_performance(&final_circuit);
        
        CircuitOptimizationResult {
            original_circuit: circuit,
            optimized_circuit: final_circuit,
            fitness_improvement: ((final_fitness - original_fitness) / original_fitness * 100.0),
            iterations: self.generations,
            optimizations_applied: optimizations,
            predictions,
        }
    }

    /// Inicializa población para algoritmo genético
    fn initialize_population(&self, base_circuit: &GeneticCircuit) -> Vec<GeneticCircuit> {
        let mut population = vec![base_circuit.clone()];
        
        for _ in 1..self.population_size {
            let mut variant = base_circuit.clone();
            self.mutate_circuit(&mut variant);
            population.push(variant);
        }
        
        population
    }

    /// Evoluciona la población
    fn evolve_population(&self, fitness_scores: &[(GeneticCircuit, f64)]) -> Vec<GeneticCircuit> {
        let mut new_population = Vec::new();
        
        // Elitismo: mantener los mejores 10%
        let elite_count = self.population_size / 10;
        for i in 0..elite_count {
            new_population.push(fitness_scores[i].0.clone());
        }
        
        // Reproducción con selección por torneo
        while new_population.len() < self.population_size {
            let parent1 = self.tournament_selection(fitness_scores);
            let parent2 = self.tournament_selection(fitness_scores);
            
            let mut offspring = self.crossover(&parent1, &parent2);
            
            if pseudo_random() < self.mutation_rate {
                self.mutate_circuit(&mut offspring);
            }
            
            new_population.push(offspring);
        }
        
        new_population
    }

    /// Selección por torneo
    fn tournament_selection(&self, fitness_scores: &[(GeneticCircuit, f64)]) -> GeneticCircuit {
        let tournament_size = 5;
        let mut best_idx = pseudo_random_usize(fitness_scores.len());
        let mut best_fitness = fitness_scores[best_idx].1;
        
        for _ in 1..tournament_size {
            let idx = pseudo_random_usize(fitness_scores.len());
            if fitness_scores[idx].1 > best_fitness {
                best_idx = idx;
                best_fitness = fitness_scores[idx].1;
            }
        }
        
        fitness_scores[best_idx].0.clone()
    }

    /// Cruzamiento de dos circuitos
    fn crossover(&self, parent1: &GeneticCircuit, parent2: &GeneticCircuit) -> GeneticCircuit {
        let mut offspring = parent1.clone();
        
        // Intercambiar parámetros de nodos
        for (i, node) in offspring.nodes.iter_mut().enumerate() {
            if pseudo_random_bool() && i < parent2.nodes.len() {
                for (key, value) in &parent2.nodes[i].parameters {
                    node.parameters.insert(key.clone(), *value);
                }
            }
        }
        
        offspring
    }

    /// Mutación de circuito
    fn mutate_circuit(&self, circuit: &mut GeneticCircuit) {
        // Mutar parámetros de nodos aleatorios
        for node in &mut circuit.nodes {
            if pseudo_random() < 0.3 {
                for (_key, value) in &mut node.parameters {
                    let perturbation = (pseudo_random() - 0.5) * 0.4;
                    *value = (*value * (1.0 + perturbation)).max(0.01).min(10.0);
                }
            }
        }
        
        // Mutar fuerzas de conexiones
        for conn in &mut circuit.connections {
            if pseudo_random() < 0.2 {
                let perturbation = (pseudo_random() - 0.5) * 0.3;
                conn.strength = (conn.strength * (1.0 + perturbation)).max(0.1).min(5.0);
            }
        }
    }

    /// Aplica optimizaciones determinísticas
    fn apply_deterministic_optimizations(&self, mut circuit: GeneticCircuit) -> GeneticCircuit {
        // 1. Balancear fuerzas de promotores
        self.balance_promoter_strengths(&mut circuit);
        
        // 2. Optimizar RBS
        self.optimize_rbs_strengths(&mut circuit);
        
        // 3. Agregar terminadores fuertes si faltan
        self.add_strong_terminators(&mut circuit);
        
        // 4. Minimizar crosstalk
        self.minimize_crosstalk(&mut circuit);
        
        circuit
    }

    /// Balancea fuerzas de promotores
    fn balance_promoter_strengths(&self, circuit: &mut GeneticCircuit) {
        for node in &mut circuit.nodes {
            if node.node_type == NodeType::Promoter {
                if let Some(strength) = node.parameters.get_mut("strength") {
                    // Ajustar al rango óptimo
                    if *strength < 0.1 {
                        *strength = 0.3; // Mínimo útil
                    } else if *strength > 5.0 {
                        *strength = 2.0; // Evitar saturación
                    }
                }
            }
        }
    }

    /// Optimiza fuerzas de RBS
    fn optimize_rbs_strengths(&self, circuit: &mut GeneticCircuit) {
        for node in &mut circuit.nodes {
            if node.node_type == NodeType::RBS {
                node.parameters.insert("translation_rate".to_string(), 0.5);
                node.parameters.insert("accessibility".to_string(), 0.8);
            }
        }
    }

    /// Agrega terminadores fuertes
    fn add_strong_terminators(&self, circuit: &mut GeneticCircuit) {
        let gene_count = circuit.nodes.iter()
            .filter(|n| n.node_type == NodeType::Gene)
            .count();
        
        let terminator_count = circuit.nodes.iter()
            .filter(|n| n.node_type == NodeType::Terminator)
            .count();
        
        // Asegurar al menos un terminador por gen
        if terminator_count < gene_count {
            for i in terminator_count..gene_count {
                let mut params = HashMap::new();
                params.insert("efficiency".to_string(), 0.95);
                
                circuit.nodes.push(CircuitNode {
                    id: format!("terminator_{}", i),
                    node_type: NodeType::Terminator,
                    parameters: params,
                });
            }
        }
    }

    /// Minimiza crosstalk entre módulos
    fn minimize_crosstalk(&self, _circuit: &mut GeneticCircuit) {
        // TODO: Implementar análisis de ortogonalidad
        // - Usar promotores ortogonales
        // - Separar módulos con insulators
    }

    /// Evalúa fitness de un circuito
    fn evaluate_fitness(&self, circuit: &GeneticCircuit) -> f64 {
        let mut fitness = 0.0;
        
        // 1. Expresión proteica adecuada
        let expression_score = self.evaluate_expression(circuit);
        fitness += expression_score * 30.0;
        
        // 2. Bajo ruido
        let noise_score = self.evaluate_noise(circuit);
        fitness += noise_score * 25.0;
        
        // 3. Estabilidad
        let stability_score = self.evaluate_stability(circuit);
        fitness += stability_score * 20.0;
        
        // 4. Eficiencia metabólica
        let metabolic_score = self.evaluate_metabolic_burden(circuit);
        fitness += metabolic_score * 15.0;
        
        // 5. Robustez
        let robustness_score = self.evaluate_robustness(circuit);
        fitness += robustness_score * 10.0;
        
        fitness
    }

    /// Evalúa nivel de expresión
    fn evaluate_expression(&self, circuit: &GeneticCircuit) -> f64 {
        let mut expression = 0.0;
        
        for node in &circuit.nodes {
            if node.node_type == NodeType::Promoter {
                if let Some(strength) = node.parameters.get("strength") {
                    expression += strength;
                }
            }
            if node.node_type == NodeType::RBS {
                if let Some(rate) = node.parameters.get("translation_rate") {
                    expression *= rate;
                }
            }
        }
        
        // Normalizar y penalizar extremos
        if expression > 0.5 && expression < 3.0 {
            0.9
        } else if expression > 3.0 {
            0.5 // Muy alta expresión → carga metabólica
        } else {
            expression / 0.5
        }
    }

    /// Evalúa nivel de ruido
    fn evaluate_noise(&self, circuit: &GeneticCircuit) -> f64 {
        // Ruido = variabilidad en expresión
        let gene_count = circuit.nodes.iter()
            .filter(|n| n.node_type == NodeType::Gene)
            .count() as f64;
        
        if gene_count == 0.0 {
            return 0.0;
        }
        
        // Ruido inversamente proporcional a expresión
        let avg_expression = self.evaluate_expression(circuit);
        
        if avg_expression > 1.0 {
            0.9 // Alta expresión → bajo ruido
        } else {
            avg_expression * 0.5
        }
    }

    /// Evalúa estabilidad del circuito
    fn evaluate_stability(&self, circuit: &GeneticCircuit) -> f64 {
        let terminator_count = circuit.nodes.iter()
            .filter(|n| n.node_type == NodeType::Terminator)
            .count();
        
        let gene_count = circuit.nodes.iter()
            .filter(|n| n.node_type == NodeType::Gene)
            .count();
        
        if gene_count == 0 {
            return 0.0;
        }
        
        // Estabilidad = terminadores suficientes
        (terminator_count as f64 / gene_count as f64).min(1.0)
    }

    /// Evalúa carga metabólica
    fn evaluate_metabolic_burden(&self, circuit: &GeneticCircuit) -> f64 {
        let protein_count = circuit.nodes.iter()
            .filter(|n| n.node_type == NodeType::Protein)
            .count() as f64;
        
        // Menos proteínas = menos carga
        if protein_count < 5.0 {
            1.0
        } else {
            1.0 / (protein_count / 5.0)
        }
    }

    /// Evalúa robustez a perturbaciones
    fn evaluate_robustness(&self, circuit: &GeneticCircuit) -> f64 {
        // Robustez = redundancia + feedback
        let feedback_count = circuit.connections.iter()
            .filter(|c| c.connection_type == ConnectionType::Repression || 
                       c.connection_type == ConnectionType::Activation)
            .count() as f64;
        
        (feedback_count / 3.0).min(1.0)
    }

    /// Predice rendimiento final
    fn predict_performance(&self, circuit: &GeneticCircuit) -> PerformancePredictions {
        PerformancePredictions {
            expression_level: self.evaluate_expression(circuit) * 100.0,
            noise_coefficient: (1.0 - self.evaluate_noise(circuit)) * 0.5,
            response_time: 5.0 / self.evaluate_expression(circuit).max(0.1),
            stability_score: self.evaluate_stability(circuit) * 100.0,
            estimated_success_rate: self.evaluate_fitness(circuit) / 100.0 * 100.0,
        }
    }
}

impl Default for CircuitOptimizer {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_circuit_optimization() {
        let optimizer = CircuitOptimizer::new();
        
        let mut params = HashMap::new();
        params.insert("strength".to_string(), 0.5);
        
        let circuit = GeneticCircuit {
            name: "test_circuit".to_string(),
            nodes: vec![
                CircuitNode {
                    id: "promoter1".to_string(),
                    node_type: NodeType::Promoter,
                    parameters: params,
                },
            ],
            connections: vec![],
            objectives: OptimizationObjectives {
                maximize_expression: true,
                minimize_noise: true,
                target_oscillation: None,
                target_bistability: false,
                minimize_crosstalk: true,
            },
        };
        
        let result = optimizer.optimize(circuit);
        assert!(result.fitness_improvement >= 0.0);
    }
}
