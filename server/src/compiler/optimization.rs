#![allow(dead_code)]
//! Optimization Passes for BioIR
//!
//! Bio-specific optimization passes that improve the genetic circuit before codegen:
//!
//! 1. **Codon Optimization** — Adapts CDS sequences for the target host
//! 2. **Expression Balancing** — Adjusts RBS strengths for balanced output
//! 3. **Dead Part Elimination** — Removes unreachable/unused parts
//! 4. **Promoter Strength Tuning** — Adjusts promoter strengths to meet targets
//! 5. **RBS Calculator** — Predicts/optimizes RBS translation initiation
//! 6. **Regulatory Network Optimization** — Minimizes regulatory complexity

use crate::compiler::bio_ir::*;
use crate::compiler::codon_optimizer::{CodonOptimizer, CodonOptHost};
use serde::{Serialize, Deserialize};

/// Configuration for optimization passes
#[derive(Debug, Clone)]
pub struct OptimizationConfig {
    /// Enable codon optimization
    pub codon_optimization: bool,
    /// Target host for codon optimization
    pub target_host: CodonOptHost,
    /// Enable expression balancing
    pub expression_balancing: bool,
    /// Target expression ratio (all CDS should be within this ratio of each other)
    pub expression_balance_ratio: f64,
    /// Enable dead part elimination
    pub dead_part_elimination: bool,
    /// Enable RBS strength tuning
    pub rbs_tuning: bool,
    /// Optimization level (0=none, 1=basic, 2=standard, 3=aggressive)
    pub opt_level: u8,
}

impl Default for OptimizationConfig {
    fn default() -> Self {
        Self {
            codon_optimization: true,
            target_host: CodonOptHost::EcoliDH5Alpha,
            expression_balancing: true,
            expression_balance_ratio: 2.0,
            dead_part_elimination: true,
            rbs_tuning: true,
            opt_level: 2,
        }
    }
}

/// Result of optimization showing what was changed
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OptimizationReport {
    pub passes_run: Vec<String>,
    pub codons_optimized: usize,
    pub cai_improvement: f64,
    pub parts_eliminated: usize,
    pub rbs_adjusted: usize,
    pub expression_changes: Vec<ExpressionChange>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExpressionChange {
    pub tu_name: String,
    pub original_rate: f64,
    pub optimized_rate: f64,
    pub reason: String,
}

/// The optimization pipeline
pub struct Optimizer {
    config: OptimizationConfig,
    codon_optimizer: CodonOptimizer,
}

impl Optimizer {
    pub fn new(config: OptimizationConfig) -> Self {
        let codon_optimizer = CodonOptimizer::new(config.target_host.clone());
        Self {
            config,
            codon_optimizer,
        }
    }

    /// Run all optimization passes on a BioIR program
    pub fn optimize(&self, mut program: BioIRProgram) -> (BioIRProgram, OptimizationReport) {
        let mut report = OptimizationReport {
            passes_run: Vec::new(),
            codons_optimized: 0,
            cai_improvement: 0.0,
            parts_eliminated: 0,
            rbs_adjusted: 0,
            expression_changes: Vec::new(),
        };

        if self.config.opt_level == 0 {
            report.passes_run.push("none (opt_level=0)".to_string());
            return (program, report);
        }

        // Pass 1: Dead part elimination (always first to reduce work for later passes)
        if self.config.dead_part_elimination {
            let eliminated = self.eliminate_dead_parts(&mut program);
            report.parts_eliminated = eliminated;
            report.passes_run.push(format!("dead_part_elimination (removed {})", eliminated));
        }

        // Pass 2: Codon optimization
        if self.config.codon_optimization && self.config.opt_level >= 1 {
            let (optimized, avg_improvement) = self.optimize_codons(&mut program);
            report.codons_optimized = optimized;
            report.cai_improvement = avg_improvement;
            report.passes_run.push(format!("codon_optimization (optimized {} CDS, avg CAI +{:.2})", optimized, avg_improvement));
        }

        // Pass 3: RBS tuning
        if self.config.rbs_tuning && self.config.opt_level >= 2 {
            let adjusted = self.tune_rbs(&mut program);
            report.rbs_adjusted = adjusted;
            report.passes_run.push(format!("rbs_tuning (adjusted {} RBS)", adjusted));
        }

        // Pass 4: Expression balancing
        if self.config.expression_balancing && self.config.opt_level >= 2 {
            let changes = self.balance_expression(&mut program);
            report.expression_changes = changes;
            report.passes_run.push("expression_balancing".to_string());
        }

        // Pass 5: Regulatory simplification (aggressive only)
        if self.config.opt_level >= 3 {
            self.simplify_regulation(&mut program);
            report.passes_run.push("regulatory_simplification".to_string());
        }

        (program, report)
    }

    // ─── Pass 1: Dead Part Elimination ────────────────────────────────

    fn eliminate_dead_parts(&self, program: &mut BioIRProgram) -> usize {
        let mut eliminated = 0;

        for circuit in &mut program.circuits {
            // Remove TUs with empty/absent CDS
            let before = circuit.transcription_units.len();
            circuit.transcription_units.retain(|tu| {
                // Keep if has at least one non-empty CDS
                !tu.coding_sequences.is_empty() ||
                tu.cds.dna_sequence.len() > 3 // More than just ATG
            });
            eliminated += before - circuit.transcription_units.len();

            // Remove regulatory links that reference non-existent TUs
            let tu_names: Vec<String> = circuit.transcription_units.iter()
                .flat_map(|tu| {
                    let mut names = vec![tu.name.clone()];
                    names.extend(tu.coding_sequences.iter().map(|c| c.name.clone()));
                    names
                })
                .collect();

            let before_links = circuit.regulatory_links.len();
            circuit.regulatory_links.retain(|link| {
                tu_names.iter().any(|n| n == &link.from || n.contains(&link.from)) ||
                tu_names.iter().any(|n| n == &link.to || n.contains(&link.to))
            });
            eliminated += before_links - circuit.regulatory_links.len();
        }

        eliminated
    }

    // ─── Pass 2: Codon Optimization ───────────────────────────────────

    fn optimize_codons(&self, program: &mut BioIRProgram) -> (usize, f64) {
        let mut optimized = 0;
        let mut total_improvement = 0.0;

        for circuit in &mut program.circuits {
            for tu in &mut circuit.transcription_units {
                // Optimize primary CDS
                let old_cai = tu.cds.codon_adaptation_index;
                let result = self.codon_optimizer.optimize(&tu.cds.dna_sequence);
                tu.cds.dna_sequence = result.optimized_sequence;
                tu.cds.codon_adaptation_index = result.cai;
                total_improvement += result.cai - old_cai;
                optimized += 1;

                // Optimize all coding sequences
                for cds in &mut tu.coding_sequences {
                    let result = self.codon_optimizer.optimize(&cds.dna_sequence);
                    cds.dna_sequence = result.optimized_sequence;
                    cds.codon_adaptation_index = result.cai;
                }
            }
        }

        let avg = if optimized > 0 { total_improvement / optimized as f64 } else { 0.0 };
        (optimized, avg)
    }

    // ─── Pass 3: RBS Tuning ───────────────────────────────────────────

    fn tune_rbs(&self, program: &mut BioIRProgram) -> usize {
        let mut adjusted = 0;

        for circuit in &mut program.circuits {
            for tu in &mut circuit.transcription_units {
                // RBS Calculator (simplified Salis model)
                // Optimal spacing depends on CDS start context
                let cds_start = &tu.cds.dna_sequence[..6.min(tu.cds.dna_sequence.len())];

                // Check if RBS is properly spaced
                let optimal_spacing = self.calculate_optimal_spacing(cds_start);
                if tu.rbs.spacing != optimal_spacing {
                    tu.rbs.spacing = optimal_spacing;
                    adjusted += 1;
                }

                // Adjust Shine-Dalgarno complementarity for the specific spacing
                let sd = self.optimize_shine_dalgarno(tu.rbs.spacing);
                if sd != tu.rbs.shine_dalgarno {
                    tu.rbs.shine_dalgarno = sd;
                    // Recalculate ΔG
                    tu.rbs.delta_g = self.estimate_rbs_delta_g(&tu.rbs.sequence, tu.rbs.spacing);
                }
            }
        }

        adjusted
    }

    /// Calculate optimal spacing between SD sequence and start codon
    fn calculate_optimal_spacing(&self, cds_start: &str) -> u32 {
        // The optimal spacing depends on the start codon context
        // For ATG starting CDS, optimal is typically 5-7 nt
        let start = &cds_start[..3.min(cds_start.len())];
        match start {
            "ATG" => 6,  // Standard start codon
            "GTG" => 7,  // Alternative start, needs slightly more spacing
            "TTG" => 7,  // Rare start codon
            _ => 6,
        }
    }

    /// Optimize Shine-Dalgarno sequence for given spacing
    fn optimize_shine_dalgarno(&self, spacing: u32) -> String {
        // The SD sequence should be complementary to the 3' end of 16S rRNA:
        // 3'-AUUCCUCCACUAG-5' (E. coli 16S rRNA)
        // Optimal SD: AGGAGG (6 nt) for spacing 5-7
        match spacing {
            1..=4 => "AGGA".to_string(),      // Shorter SD for close spacing
            5..=7 => "AGGAGG".to_string(),     // Full SD for optimal spacing
            8..=10 => "AAGGAGG".to_string(),   // Extended SD for larger spacing
            _ => "AGGAGG".to_string(),
        }
    }

    /// Estimate ΔG of RBS-mRNA interaction (simplified thermodynamic model)
    fn estimate_rbs_delta_g(&self, rbs_sequence: &str, spacing: u32) -> f64 {
        // Simplified nearest-neighbor model
        let mut dg = 0.0;

        // Base contribution from SD length
        let sd_length = rbs_sequence.len().min(12) as f64;
        dg -= sd_length * 1.5; // ~-1.5 kcal/mol per complementary base

        // Spacing penalty (optimal at 5-7)
        let spacing_deviation = ((spacing as f64) - 6.0).abs();
        dg += spacing_deviation * 0.5; // Penalty for non-optimal spacing

        // AU-rich upstream bonus
        let au_count = rbs_sequence.chars()
            .filter(|c| matches!(c, 'A' | 'T' | 'a' | 't'))
            .count();
        let au_fraction = au_count as f64 / rbs_sequence.len().max(1) as f64;
        dg -= au_fraction * 2.0; // AU-rich regions help unwinding

        dg
    }

    // ─── Pass 4: Expression Balancing ─────────────────────────────────

    fn balance_expression(&self, program: &mut BioIRProgram) -> Vec<ExpressionChange> {
        let mut changes = Vec::new();

        for circuit in &mut program.circuits {
            if circuit.transcription_units.len() < 2 {
                continue;
            }

            // Calculate current expression levels
            let expressions: Vec<f64> = circuit.transcription_units.iter()
                .map(|tu| tu.promoter.strength * tu.rbs.translation_rate)
                .collect();

            let max_expr = expressions.iter().cloned().fold(f64::NEG_INFINITY, f64::max);
            let min_expr = expressions.iter().cloned().fold(f64::INFINITY, f64::min);

            if min_expr <= 0.0 || max_expr / min_expr <= self.config.expression_balance_ratio {
                continue; // Already balanced
            }

            // Target: geometric mean of all expression levels
            let target = (expressions.iter().product::<f64>()).powf(1.0 / expressions.len() as f64);

            for (i, tu) in circuit.transcription_units.iter_mut().enumerate() {
                let current = expressions[i];
                if current > 0.0 {
                    let ratio = target / current;
                    if ratio.abs() > 0.01 && (ratio < 0.5 || ratio > 2.0) {
                        let original_rate = tu.rbs.translation_rate;
                        // Adjust RBS strength to achieve target
                        tu.rbs.translation_rate = (tu.rbs.translation_rate * ratio)
                            .max(0.01).min(1.0);

                        changes.push(ExpressionChange {
                            tu_name: tu.name.clone(),
                            original_rate,
                            optimized_rate: tu.rbs.translation_rate,
                            reason: format!(
                                "Balanced expression from {:.2} to {:.2} (target ratio ≤ {:.1})",
                                original_rate, tu.rbs.translation_rate,
                                self.config.expression_balance_ratio
                            ),
                        });
                    }
                }
            }
        }

        changes
    }

    // ─── Pass 5: Regulatory Simplification ────────────────────────────

    fn simplify_regulation(&self, program: &mut BioIRProgram) {
        for circuit in &mut program.circuits {
            // Remove duplicate regulatory links
            let mut seen = std::collections::HashSet::new();
            circuit.regulatory_links.retain(|link| {
                let key = format!("{}->{}:{:?}", link.from, link.to, link.regulation_type);
                seen.insert(key)
            });

            // Remove links with very weak strength (< 0.01)
            circuit.regulatory_links.retain(|link| link.strength >= 0.01);

            // Merge activation + repression on same target into dual regulation
            // (This is biologically meaningful — constitutive with toggle)
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_optimization_config_default() {
        let config = OptimizationConfig::default();
        assert!(config.codon_optimization);
        assert_eq!(config.opt_level, 2);
    }

    #[test]
    fn test_optimizer_no_op() {
        let config = OptimizationConfig {
            opt_level: 0,
            ..Default::default()
        };
        let optimizer = Optimizer::new(config);
        let program = BioIRProgram {
            name: "test".to_string(),
            host: None,
            circuits: vec![],
            parts_library: PartsLibrary::standard_library(),
            metadata: ProgramMetadata::default(),
        };
        let (_result, report) = optimizer.optimize(program);
        assert!(report.passes_run.contains(&"none (opt_level=0)".to_string()));
    }
}
