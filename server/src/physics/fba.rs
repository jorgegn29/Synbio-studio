#![allow(dead_code)]
//! Flux Balance Analysis (FBA) simplificado para análisis metabólico

use std::collections::HashMap;

/// Modelo metabólico simplificado para E. coli
pub struct MetabolicModel {
    /// Reacciones del modelo
    reactions: Vec<Reaction>,
    /// Metabolitos
    metabolites: Vec<Metabolite>,
    /// Matriz estequiométrica
    stoichiometry: Vec<Vec<f64>>,
    /// Límites de flujo
    bounds: Vec<(f64, f64)>,
}

/// Reacción metabólica
#[derive(Debug, Clone)]
pub struct Reaction {
    pub id: String,
    pub name: String,
    pub reactants: Vec<(String, f64)>,  // (metabolito, coeficiente)
    pub products: Vec<(String, f64)>,
    pub reversible: bool,
    pub gene_association: Option<String>,
}

/// Metabolito
#[derive(Debug, Clone)]
pub struct Metabolite {
    pub id: String,
    pub name: String,
    pub compartment: Compartment,
    pub formula: Option<String>,
}

/// Compartimento celular
#[derive(Debug, Clone, Copy, PartialEq)]
pub enum Compartment {
    Cytoplasm,
    Periplasm,
    Extracellular,
    Membrane,
}

/// Resultado de FBA
#[derive(Debug, Clone)]
pub struct FBAResult {
    pub objective_value: f64,
    pub fluxes: HashMap<String, f64>,
    pub shadow_prices: HashMap<String, f64>,
    pub status: FBAStatus,
}

/// Estado del resultado de FBA
#[derive(Debug, Clone, Copy, PartialEq)]
pub enum FBAStatus {
    Optimal,
    Infeasible,
    Unbounded,
    Error,
}

impl MetabolicModel {
    /// Crea un modelo simplificado de metabolismo central de E. coli
    pub fn ecoli_core() -> Self {
        let mut reactions = Vec::new();
        let mut metabolites = Vec::new();

        // Metabolitos principales
        metabolites.push(Metabolite {
            id: "glc_D".to_string(),
            name: "D-Glucose".to_string(),
            compartment: Compartment::Cytoplasm,
            formula: Some("C6H12O6".to_string()),
        });
        metabolites.push(Metabolite {
            id: "g6p".to_string(),
            name: "Glucose-6-phosphate".to_string(),
            compartment: Compartment::Cytoplasm,
            formula: Some("C6H13O9P".to_string()),
        });
        metabolites.push(Metabolite {
            id: "f6p".to_string(),
            name: "Fructose-6-phosphate".to_string(),
            compartment: Compartment::Cytoplasm,
            formula: Some("C6H13O9P".to_string()),
        });
        metabolites.push(Metabolite {
            id: "pyr".to_string(),
            name: "Pyruvate".to_string(),
            compartment: Compartment::Cytoplasm,
            formula: Some("C3H4O3".to_string()),
        });
        metabolites.push(Metabolite {
            id: "atp".to_string(),
            name: "ATP".to_string(),
            compartment: Compartment::Cytoplasm,
            formula: Some("C10H16N5O13P3".to_string()),
        });
        metabolites.push(Metabolite {
            id: "adp".to_string(),
            name: "ADP".to_string(),
            compartment: Compartment::Cytoplasm,
            formula: Some("C10H15N5O10P2".to_string()),
        });
        metabolites.push(Metabolite {
            id: "nadh".to_string(),
            name: "NADH".to_string(),
            compartment: Compartment::Cytoplasm,
            formula: Some("C21H29N7O14P2".to_string()),
        });
        metabolites.push(Metabolite {
            id: "nad".to_string(),
            name: "NAD+".to_string(),
            compartment: Compartment::Cytoplasm,
            formula: Some("C21H28N7O14P2".to_string()),
        });

        // Reacciones principales (simplificadas)
        
        // Glucólisis
        reactions.push(Reaction {
            id: "HEX1".to_string(),
            name: "Hexokinase".to_string(),
            reactants: vec![
                ("glc_D".to_string(), 1.0),
                ("atp".to_string(), 1.0),
            ],
            products: vec![
                ("g6p".to_string(), 1.0),
                ("adp".to_string(), 1.0),
            ],
            reversible: false,
            gene_association: Some("b2388".to_string()),
        });

        reactions.push(Reaction {
            id: "PGI".to_string(),
            name: "Glucose-6-phosphate isomerase".to_string(),
            reactants: vec![("g6p".to_string(), 1.0)],
            products: vec![("f6p".to_string(), 1.0)],
            reversible: true,
            gene_association: Some("b4025".to_string()),
        });

        reactions.push(Reaction {
            id: "GAPD".to_string(),
            name: "Glyceraldehyde-3-phosphate dehydrogenase".to_string(),
            reactants: vec![
                ("f6p".to_string(), 1.0),
                ("nad".to_string(), 2.0),
                ("adp".to_string(), 2.0),
            ],
            products: vec![
                ("pyr".to_string(), 2.0),
                ("nadh".to_string(), 2.0),
                ("atp".to_string(), 2.0),
            ],
            reversible: false,
            gene_association: Some("b1779".to_string()),
        });

        // Fosforilación oxidativa (simplificada)
        reactions.push(Reaction {
            id: "ATPS".to_string(),
            name: "ATP synthase".to_string(),
            reactants: vec![
                ("nadh".to_string(), 1.0),
                ("adp".to_string(), 2.5),
            ],
            products: vec![
                ("nad".to_string(), 1.0),
                ("atp".to_string(), 2.5),
            ],
            reversible: false,
            gene_association: Some("b3738".to_string()),
        });

        // Demanda de ATP (función objetivo)
        reactions.push(Reaction {
            id: "ATPM".to_string(),
            name: "ATP maintenance requirement".to_string(),
            reactants: vec![("atp".to_string(), 1.0)],
            products: vec![("adp".to_string(), 1.0)],
            reversible: false,
            gene_association: None,
        });

        // Construir matriz estequiométrica
        let n_metabolites = metabolites.len();
        let n_reactions = reactions.len();
        let stoichiometry = vec![vec![0.0; n_reactions]; n_metabolites];
        
        // Límites de flujo por defecto
        let bounds: Vec<(f64, f64)> = reactions.iter()
            .map(|r| {
                if r.reversible {
                    (-1000.0, 1000.0)
                } else {
                    (0.0, 1000.0)
                }
            })
            .collect();

        Self {
            reactions,
            metabolites,
            stoichiometry,
            bounds,
        }
    }

    /// Estima el costo de ATP para producir una proteína
    pub fn estimate_protein_atp_cost(&self, amino_acids: usize) -> f64 {
        // Costo promedio: ~4.3 ATP por aminoácido
        // Incluye: síntesis de aminoácidos, carga de tRNA, elongación
        amino_acids as f64 * 4.3
    }

    /// Estima el costo de ATP para transcripción
    pub fn estimate_transcription_cost(&self, nucleotides: usize) -> f64 {
        // ~2 ATP por nucleótido (NTP → NMP + PPi)
        nucleotides as f64 * 2.0
    }

    /// Estima el costo metabólico total de un circuito genético
    pub fn estimate_circuit_cost(&self, genes: &[GeneExpression]) -> MetabolicCost {
        let mut total_atp = 0.0;
        let mut total_nadph = 0.0;
        let growth_impact;

        for gene in genes {
            // Costo de transcripción
            let mrna_cost = self.estimate_transcription_cost(gene.mrna_length);
            
            // Costo de traducción
            let protein_cost = self.estimate_protein_atp_cost(gene.protein_length);
            
            // Multiplicar por nivel de expresión
            let expression_factor = gene.expression_level;
            
            total_atp += (mrna_cost + protein_cost) * expression_factor;
            
            // NADPH para síntesis de aminoácidos (~3 NADPH por aminoácido promedio)
            total_nadph += gene.protein_length as f64 * 3.0 * expression_factor;
        }

        // Estimar impacto en crecimiento
        // Basado en que E. coli produce ~55 ATP/s y necesita ~10^9 ATP para duplicarse
        let atp_fraction = total_atp / 1e9;
        let growth_impact_val = (1.0 - atp_fraction).max(0.1);
        growth_impact = growth_impact_val;

        MetabolicCost {
            atp_per_cell_division: total_atp,
            nadph_per_cell_division: total_nadph,
            estimated_growth_rate_impact: growth_impact,
            sustainability: if growth_impact > 0.8 {
                Sustainability::Sustainable
            } else if growth_impact > 0.5 {
                Sustainability::Moderate
            } else {
                Sustainability::HighBurden
            },
        }
    }

    /// Ejecuta FBA simplificado (sin solver LP completo)
    pub fn run_simple_fba(&self, objective: &str, maximize: bool) -> FBAResult {
        // Implementación simplificada sin solver LP
        // En producción, usar biblioteca como good_lp o COIN-OR
        
        let mut fluxes = HashMap::new();
        
        // Simulación simplificada de flujos
        for (i, reaction) in self.reactions.iter().enumerate() {
            let (lower, upper) = self.bounds[i];
            // Usar flujo medio como aproximación
            let flux = if maximize {
                upper.min(100.0)
            } else {
                lower.max(-100.0)
            };
            fluxes.insert(reaction.id.clone(), flux);
        }

        let objective_value = fluxes.get(objective).copied().unwrap_or(0.0);

        FBAResult {
            objective_value,
            fluxes,
            shadow_prices: HashMap::new(),
            status: FBAStatus::Optimal,
        }
    }

    /// Obtiene la lista de reacciones
    pub fn get_reactions(&self) -> &[Reaction] {
        &self.reactions
    }

    /// Obtiene la lista de metabolitos
    pub fn get_metabolites(&self) -> &[Metabolite] {
        &self.metabolites
    }
}

/// Expresión de un gen
#[derive(Debug, Clone)]
pub struct GeneExpression {
    pub gene_id: String,
    pub mrna_length: usize,      // nucleótidos
    pub protein_length: usize,   // aminoácidos
    pub expression_level: f64,   // moléculas/célula/generación
}

/// Costo metabólico calculado
#[derive(Debug, Clone)]
pub struct MetabolicCost {
    pub atp_per_cell_division: f64,
    pub nadph_per_cell_division: f64,
    pub estimated_growth_rate_impact: f64,
    pub sustainability: Sustainability,
}

/// Sostenibilidad del circuito
#[derive(Debug, Clone, Copy, PartialEq)]
pub enum Sustainability {
    Sustainable,
    Moderate,
    HighBurden,
}

impl std::fmt::Display for Sustainability {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Sustainability::Sustainable => write!(f, "✓ Sostenible"),
            Sustainability::Moderate => write!(f, "⚠ Carga moderada"),
            Sustainability::HighBurden => write!(f, "⚠ Alta carga metabólica"),
        }
    }
}

/// Análisis de producción de metabolitos
pub struct ProductionAnalysis;

impl ProductionAnalysis {
    /// Estima el rendimiento teórico máximo de un producto a partir de glucosa
    pub fn theoretical_yield(product: &str) -> Option<f64> {
        // Rendimientos teóricos máximos (mol producto / mol glucosa)
        match product.to_lowercase().as_str() {
            "ethanol" => Some(2.0),
            "lactate" | "lactic acid" => Some(2.0),
            "succinate" | "succinic acid" => Some(1.71),
            "acetate" | "acetic acid" => Some(3.0),
            "butanol" => Some(1.0),
            "isoprene" => Some(0.25),
            "lycopene" => Some(0.11),
            "artemisinic acid" => Some(0.07),
            "vanillin" => Some(0.86),
            _ => None,
        }
    }

    /// Calcula el rendimiento en g/g glucosa
    pub fn mass_yield(_product: &str, molar_yield: f64, product_mw: f64) -> f64 {
        let glucose_mw = 180.16; // g/mol
        (molar_yield * product_mw) / glucose_mw
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_protein_cost() {
        let model = MetabolicModel::ecoli_core();
        let cost = model.estimate_protein_atp_cost(100);
        assert!((cost - 430.0).abs() < 0.1); // 100 * 4.3
    }

    #[test]
    fn test_circuit_cost() {
        let model = MetabolicModel::ecoli_core();
        let genes = vec![
            GeneExpression {
                gene_id: "gfp".to_string(),
                mrna_length: 720,
                protein_length: 238,
                expression_level: 1000.0,
            },
        ];
        let cost = model.estimate_circuit_cost(&genes);
        assert!(cost.atp_per_cell_division > 0.0);
    }
}
