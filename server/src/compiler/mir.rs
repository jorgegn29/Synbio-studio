#![allow(dead_code)]
//! MIR (Mid-level Intermediate Representation)
//!
//! The MIR provides biological-specific analysis that has no equivalent in
//! traditional compilers:
//!
//! 1. **Biological Ownership** — Each DNA part can only be used once per construct
//!    (you can't physically use the same promoter in two different places on one plasmid)
//! 2. **Resource Tracking** — Tracks promoter/terminator pairing, RBS/CDS pairing
//! 3. **Containment Verification** — Ensures safe circuits have proper kill switches
//! 4. **Metabolic Burden Estimation** — Pre-calculates ATP/resource demands
//! 5. **Crosstalk Detection** — Identifies potential interference between TUs
//!
//! Pipeline: AST → HIR → MIR → BioIR

use std::collections::{HashMap, HashSet};
use crate::compiler::hir::*;

// ─── MIR Types ────────────────────────────────────────────────────────────────

/// Complete MIR program
#[derive(Debug, Clone)]
pub struct MirProgram {
    pub name: String,
    pub chassis: Option<MirChassis>,
    pub circuits: Vec<MirCircuit>,
    pub genes: Vec<MirGene>,
    pub analysis: ProgramAnalysis,
}

/// Host organism in MIR (resolved)
#[derive(Debug, Clone)]
pub struct MirChassis {
    pub name: String,
    pub species: MirSpecies,
    pub growth_rate: f64,          // doubling time in minutes
    pub atp_capacity: f64,         // relative units
    pub codon_bias: CodonBias,
}

#[derive(Debug, Clone)]
pub enum MirSpecies {
    EColi,
    BSubtilis,
    SCerevisiae,
    Mammalian,
    Custom(String),
}

#[derive(Debug, Clone)]
pub enum CodonBias {
    EColi,
    Yeast,
    Bacillus,
    Human,
    Generic,
}

/// MIR circuit — with ownership and resource analysis
#[derive(Debug, Clone)]
pub struct MirCircuit {
    pub name: String,
    pub is_safe: bool,
    pub is_contained: bool,
    pub transcription_units: Vec<MirTranscriptionUnit>,
    pub regulations: Vec<MirRegulation>,
    pub kill_switch: Option<MirKillSwitch>,
    /// Resource tracking
    pub resources: ResourceMap,
    /// Ownership tracking — which parts are used where
    pub ownership: OwnershipMap,
    /// Estimated metabolic burden
    pub estimated_burden: MetabolicBurden,
    /// Potential crosstalk issues
    pub crosstalk_warnings: Vec<CrosstalkWarning>,
}

/// Transcription unit in MIR — fully validated
#[derive(Debug, Clone)]
pub struct MirTranscriptionUnit {
    pub id: String,
    pub promoter: MirPromoter,
    pub rbs: MirRBS,
    pub coding_sequences: Vec<MirCDS>,
    pub terminator: Option<MirTerminator>,
    /// Estimated expression level (copies/cell/generation)
    pub estimated_expression: f64,
    /// Estimated transcript length in bp
    pub transcript_length: usize,
}

#[derive(Debug, Clone)]
pub struct MirPromoter {
    pub name: String,
    pub strength: f64,
    pub is_regulated: bool,
    pub regulators: Vec<String>,
    pub sequence_length: usize,
}

#[derive(Debug, Clone)]
pub struct MirRBS {
    pub name: String,
    pub translation_rate: f64,
    pub sequence_length: usize,
}

#[derive(Debug, Clone)]
pub struct MirCDS {
    pub name: String,
    pub protein_function: MirProteinFunction,
    pub toxicity: MirToxicity,
    pub estimated_length_bp: usize,
    pub estimated_length_aa: usize,
}

#[derive(Debug, Clone)]
pub enum MirProteinFunction {
    Reporter,
    Repressor,
    Activator,
    Enzyme,
    Structural,
    Toxic,
    Other(String),
}

#[derive(Debug, Clone, PartialEq, PartialOrd)]
pub enum MirToxicity {
    None,
    Low,
    Medium,
    High,
    Lethal,
}

#[derive(Debug, Clone)]
pub struct MirTerminator {
    pub name: String,
    pub efficiency: f64,
    pub bidirectional: bool,
}

#[derive(Debug, Clone)]
pub struct MirRegulation {
    pub from: String,
    pub to: String,
    pub kind: MirRegulationKind,
    pub estimated_strength: f64,
}

#[derive(Debug, Clone)]
pub enum MirRegulationKind {
    Repression,
    Activation,
    Unknown,
}

#[derive(Debug, Clone)]
pub struct MirKillSwitch {
    pub mechanism: MirKillMechanism,
    pub trigger: String,
    pub delay_hours: f64,
    pub estimated_reliability: f64,
}

#[derive(Debug, Clone)]
pub enum MirKillMechanism {
    CcdB,
    MazF,
    Holin,
    Custom(String),
}

/// Gene in MIR
#[derive(Debug, Clone)]
pub struct MirGene {
    pub name: String,
    pub gene_type: MirGeneType,
    pub sequence_info: Option<MirSequenceInfo>,
}

#[derive(Debug, Clone)]
pub enum MirGeneType {
    Protein,
    RNA,
    Regulatory,
}

#[derive(Debug, Clone)]
pub struct MirSequenceInfo {
    pub dna_length: usize,
    pub gc_content: f64,
    pub has_repeats: bool,
    pub has_restriction_sites: Vec<String>,
}

// ─── Analysis Types ───────────────────────────────────────────────────────────

/// Program-level analysis
#[derive(Debug, Clone, Default)]
pub struct ProgramAnalysis {
    pub total_dna_length_bp: usize,
    pub total_proteins: usize,
    pub total_transcription_units: usize,
    pub has_containment: bool,
    pub max_toxicity: String,
    pub warnings: Vec<MirWarning>,
    pub errors: Vec<MirError>,
}

/// Resource tracking map
#[derive(Debug, Clone, Default)]
pub struct ResourceMap {
    /// Number of active promoters
    pub active_promoters: usize,
    /// Number of RBS sites  
    pub rbs_count: usize,
    /// Number of coding sequences
    pub cds_count: usize,
    /// Number of terminators
    pub terminator_count: usize,
    /// Estimated total construct size in bp
    pub estimated_construct_size: usize,
    /// Estimated number of selection markers needed
    pub selection_markers_needed: usize,
}

/// Ownership tracking — ensures each part is used only once per construct
#[derive(Debug, Clone, Default)]
pub struct OwnershipMap {
    /// Map from part name to its owner (TU id)
    pub part_owners: HashMap<String, String>,
    /// Parts that are referenced but not owned (external references)
    pub external_refs: HashSet<String>,
    /// Ownership violations (same part used in multiple TUs)
    pub violations: Vec<OwnershipViolation>,
}

#[derive(Debug, Clone)]
pub struct OwnershipViolation {
    pub part_name: String,
    pub first_use: String,  // TU id
    pub second_use: String, // TU id
    pub message: String,
}

/// Metabolic burden estimation
#[derive(Debug, Clone)]
pub struct MetabolicBurden {
    /// Estimated ATP consumption (relative units)
    pub atp_consumption: f64,
    /// Estimated fraction of cellular resources used
    pub resource_fraction: f64,
    /// Estimated growth rate impact (0.0 = no impact, 1.0 = lethal)
    pub growth_impact: f64,
    /// Category
    pub category: BurdenCategory,
}

#[derive(Debug, Clone)]
pub enum BurdenCategory {
    Negligible,  // < 5% resources
    Low,         // 5-15%
    Moderate,    // 15-30%
    High,        // 30-50%
    Critical,    // > 50%
}

impl Default for MetabolicBurden {
    fn default() -> Self {
        Self {
            atp_consumption: 0.0,
            resource_fraction: 0.0,
            growth_impact: 0.0,
            category: BurdenCategory::Negligible,
        }
    }
}

/// Crosstalk warning between transcription units
#[derive(Debug, Clone)]
pub struct CrosstalkWarning {
    pub tu1: String,
    pub tu2: String,
    pub warning_type: CrosstalkType,
    pub severity: f64,
    pub message: String,
}

#[derive(Debug, Clone)]
pub enum CrosstalkType {
    /// Promoter of TU2 may be read-through from TU1 (missing/weak terminator)
    TranscriptionalReadThrough,
    /// Two TUs share a regulator, may interfere
    SharedRegulator,
    /// Two promoters compete for the same polymerase pool
    PolymeraseCompetition,
    /// Ribosome competition between TUs
    RibosomeCompetition,
}

/// MIR warning (non-fatal)
#[derive(Debug, Clone)]
pub struct MirWarning {
    pub code: String,
    pub message: String,
}

/// MIR error (fatal)
#[derive(Debug, Clone)]
pub struct MirError {
    pub code: String,
    pub message: String,
}

// ─── MIR Lowering: HIR → MIR ─────────────────────────────────────────────────

pub struct MirLowering {
    /// Default part properties for estimation
    default_promoter_strength: HashMap<String, f64>,
    default_rbs_rate: HashMap<String, f64>,
    default_cds_length: HashMap<String, usize>,
    default_protein_function: HashMap<String, MirProteinFunction>,
    default_toxicity: HashMap<String, MirToxicity>,
}

impl MirLowering {
    pub fn new() -> Self {
        let mut promoter_strength = HashMap::new();
        promoter_strength.insert("pLac".to_string(), 0.7);
        promoter_strength.insert("pTet".to_string(), 0.8);
        promoter_strength.insert("pBAD".to_string(), 0.9);
        promoter_strength.insert("pT7".to_string(), 1.0);
        promoter_strength.insert("pConst".to_string(), 0.5);

        let mut rbs_rate = HashMap::new();
        rbs_rate.insert("rbs_strong".to_string(), 1.0);
        rbs_rate.insert("rbs_medium".to_string(), 0.5);
        rbs_rate.insert("rbs_weak".to_string(), 0.1);
        rbs_rate.insert("B0034".to_string(), 1.0);
        rbs_rate.insert("B0032".to_string(), 0.5);

        let mut cds_length = HashMap::new();
        cds_length.insert("GFP".to_string(), 720);
        cds_length.insert("RFP".to_string(), 681);
        cds_length.insert("BFP".to_string(), 714);
        cds_length.insert("mCherry".to_string(), 711);
        cds_length.insert("LacI".to_string(), 1083);
        cds_length.insert("TetR".to_string(), 624);
        cds_length.insert("CI".to_string(), 729);
        cds_length.insert("AraC".to_string(), 879);
        cds_length.insert("Cas9".to_string(), 4107);
        cds_length.insert("CcdB".to_string(), 306);
        cds_length.insert("MazF".to_string(), 336);

        let mut protein_function = HashMap::new();
        protein_function.insert("GFP".to_string(), MirProteinFunction::Reporter);
        protein_function.insert("RFP".to_string(), MirProteinFunction::Reporter);
        protein_function.insert("BFP".to_string(), MirProteinFunction::Reporter);
        protein_function.insert("mCherry".to_string(), MirProteinFunction::Reporter);
        protein_function.insert("LacI".to_string(), MirProteinFunction::Repressor);
        protein_function.insert("TetR".to_string(), MirProteinFunction::Repressor);
        protein_function.insert("CI".to_string(), MirProteinFunction::Repressor);
        protein_function.insert("AraC".to_string(), MirProteinFunction::Activator);
        protein_function.insert("Cas9".to_string(), MirProteinFunction::Enzyme);
        protein_function.insert("CcdB".to_string(), MirProteinFunction::Toxic);
        protein_function.insert("MazF".to_string(), MirProteinFunction::Toxic);

        let mut toxicity = HashMap::new();
        toxicity.insert("CcdB".to_string(), MirToxicity::Lethal);
        toxicity.insert("MazF".to_string(), MirToxicity::High);
        toxicity.insert("Cas9".to_string(), MirToxicity::Medium);
        toxicity.insert("Holin".to_string(), MirToxicity::Lethal);

        Self {
            default_promoter_strength: promoter_strength,
            default_rbs_rate: rbs_rate,
            default_cds_length: cds_length,
            default_protein_function: protein_function,
            default_toxicity: toxicity,
        }
    }

    /// Lower HIR → MIR with full analysis
    pub fn lower(&self, hir: &HirProgram) -> MirProgram {
        let chassis = hir.chassis.as_ref().map(|ch| self.lower_chassis(ch));

        let mut circuits: Vec<MirCircuit> = hir.circuits.iter()
            .map(|c| self.lower_circuit(c))
            .collect();

        // Post-processing: detect crosstalk between TUs
        for circuit in &mut circuits {
            self.detect_crosstalk(circuit);
            self.calculate_burden(circuit);
        }

        let genes: Vec<MirGene> = hir.genes.iter()
            .map(|g| self.lower_gene(g))
            .collect();

        // Build program analysis
        let analysis = self.build_analysis(&circuits, &genes);

        MirProgram {
            name: hir.name.clone(),
            chassis,
            circuits,
            genes,
            analysis,
        }
    }

    fn lower_chassis(&self, ch: &HirChassis) -> MirChassis {
        let species = match ch.host_type.as_str() {
            "EColi" | "EcoliDH5Alpha" | "EcoliBL21" | "ecoli" => MirSpecies::EColi,
            "BSubtilis" | "bacillus" => MirSpecies::BSubtilis,
            "Yeast" | "SCerevisiae" | "yeast" => MirSpecies::SCerevisiae,
            "Mammalian" | "CHO" | "HEK293" => MirSpecies::Mammalian,
            other => MirSpecies::Custom(other.to_string()),
        };

        let codon_bias = match &species {
            MirSpecies::EColi => CodonBias::EColi,
            MirSpecies::SCerevisiae => CodonBias::Yeast,
            MirSpecies::BSubtilis => CodonBias::Bacillus,
            MirSpecies::Mammalian => CodonBias::Human,
            MirSpecies::Custom(_) => CodonBias::Generic,
        };

        let growth_rate = match &species {
            MirSpecies::EColi => 20.0,
            MirSpecies::BSubtilis => 25.0,
            MirSpecies::SCerevisiae => 90.0,
            MirSpecies::Mammalian => 1440.0, // 24 hours
            MirSpecies::Custom(_) => 30.0,
        };

        MirChassis {
            name: ch.name.clone(),
            species,
            growth_rate,
            atp_capacity: 100.0,
            codon_bias,
        }
    }

    fn lower_circuit(&self, hir_circuit: &HirCircuit) -> MirCircuit {
        let mut ownership = OwnershipMap::default();
        let mut resources = ResourceMap::default();

        // Lower transcription units
        let transcription_units: Vec<MirTranscriptionUnit> = hir_circuit.transcription_units.iter()
            .map(|tu| self.lower_tu(tu, &mut ownership, &mut resources))
            .collect();

        // Lower regulations
        let regulations: Vec<MirRegulation> = hir_circuit.regulations.iter()
            .map(|r| MirRegulation {
                from: r.regulator.clone(),
                to: r.target.clone(),
                kind: match r.regulation_kind {
                    HirRegulationKind::Repression => MirRegulationKind::Repression,
                    HirRegulationKind::Activation => MirRegulationKind::Activation,
                    HirRegulationKind::Inferred => MirRegulationKind::Unknown,
                },
                estimated_strength: 0.5, // Default, can be refined
            })
            .collect();

        // Lower kill switch
        let kill_switch = hir_circuit.kill_switch.as_ref().map(|ks| {
            let mechanism = match ks.mechanism.as_str() {
                "CcdB" | "ccdB" => MirKillMechanism::CcdB,
                "MazF" | "mazF" => MirKillMechanism::MazF,
                "Holin" | "holin" => MirKillMechanism::Holin,
                other => MirKillMechanism::Custom(other.to_string()),
            };
            MirKillSwitch {
                mechanism,
                trigger: format!("{:?}", ks.trigger_condition),
                delay_hours: ks.delay_hours.unwrap_or(0.0),
                estimated_reliability: 0.99, // High reliability assumed
            }
        });

        let is_contained = kill_switch.is_some() || hir_circuit.is_safe;

        MirCircuit {
            name: hir_circuit.name.clone(),
            is_safe: hir_circuit.is_safe,
            is_contained,
            transcription_units,
            regulations,
            kill_switch,
            resources,
            ownership,
            estimated_burden: MetabolicBurden::default(),
            crosstalk_warnings: Vec::new(),
        }
    }

    fn lower_tu(
        &self,
        hir_tu: &HirTranscriptionUnit,
        ownership: &mut OwnershipMap,
        resources: &mut ResourceMap,
    ) -> MirTranscriptionUnit {
        let mut promoter = MirPromoter {
            name: "default".to_string(),
            strength: 0.5,
            is_regulated: false,
            regulators: Vec::new(),
            sequence_length: 35,
        };
        let mut rbs = MirRBS {
            name: "default".to_string(),
            translation_rate: 0.5,
            sequence_length: 12,
        };
        let mut coding_sequences = Vec::new();
        let mut terminator = None;

        // Classify parts into their roles
        for part in &hir_tu.parts {
            // Check ownership
            if let Some(existing_owner) = ownership.part_owners.get(&part.name) {
                ownership.violations.push(OwnershipViolation {
                    part_name: part.name.clone(),
                    first_use: existing_owner.clone(),
                    second_use: hir_tu.id.clone(),
                    message: format!(
                        "Part '{}' is already used in TU '{}' — each DNA part can only appear once per construct",
                        part.name, existing_owner
                    ),
                });
            } else {
                ownership.part_owners.insert(part.name.clone(), hir_tu.id.clone());
            }

            match part.part_type {
                HirPartType::Promoter => {
                    promoter = MirPromoter {
                        name: part.name.clone(),
                        strength: self.default_promoter_strength
                            .get(&part.name).copied().unwrap_or(0.5),
                        is_regulated: self.is_regulated_promoter(&part.name),
                        regulators: self.get_regulators(&part.name),
                        sequence_length: 35, // Typical promoter length
                    };
                    resources.active_promoters += 1;
                }
                HirPartType::RBS => {
                    rbs = MirRBS {
                        name: part.name.clone(),
                        translation_rate: self.default_rbs_rate
                            .get(&part.name).copied().unwrap_or(0.5),
                        sequence_length: 12,
                    };
                    resources.rbs_count += 1;
                }
                HirPartType::CDS | HirPartType::Gene => {
                    let est_length = self.default_cds_length
                        .get(&part.name).copied().unwrap_or(750);
                    let func = self.default_protein_function
                        .get(&part.name).cloned()
                        .unwrap_or(MirProteinFunction::Other(part.name.clone()));
                    let tox = self.default_toxicity
                        .get(&part.name).cloned()
                        .unwrap_or(MirToxicity::None);

                    coding_sequences.push(MirCDS {
                        name: part.name.clone(),
                        protein_function: func,
                        toxicity: tox,
                        estimated_length_bp: est_length,
                        estimated_length_aa: est_length / 3,
                    });
                    resources.cds_count += 1;
                }
                HirPartType::Terminator => {
                    terminator = Some(MirTerminator {
                        name: part.name.clone(),
                        efficiency: 0.99,
                        bidirectional: false,
                    });
                    resources.terminator_count += 1;
                }
                _ => {}
            }
        }

        // Calculate transcript length
        let transcript_length = promoter.sequence_length
            + rbs.sequence_length
            + coding_sequences.iter().map(|c| c.estimated_length_bp).sum::<usize>()
            + terminator.as_ref().map(|_| 80).unwrap_or(0);

        resources.estimated_construct_size += transcript_length;

        // Estimate expression level (simplified model)
        // expression ∝ promoter_strength × rbs_translation_rate × 1000
        let estimated_expression = promoter.strength * rbs.translation_rate * 1000.0;

        MirTranscriptionUnit {
            id: hir_tu.id.clone(),
            promoter,
            rbs,
            coding_sequences,
            terminator,
            estimated_expression,
            transcript_length,
        }
    }

    fn is_regulated_promoter(&self, name: &str) -> bool {
        matches!(name, "pLac" | "pTet" | "pBAD" | "pT7")
    }

    fn get_regulators(&self, promoter: &str) -> Vec<String> {
        match promoter {
            "pLac" => vec!["LacI".to_string()],
            "pTet" => vec!["TetR".to_string()],
            "pBAD" => vec!["AraC".to_string()],
            _ => vec![],
        }
    }

    fn lower_gene(&self, hir_gene: &HirGene) -> MirGene {
        MirGene {
            name: hir_gene.name.clone(),
            gene_type: match hir_gene.gene_type {
                HirGeneType::Protein => MirGeneType::Protein,
                HirGeneType::RNA => MirGeneType::RNA,
                HirGeneType::Regulatory => MirGeneType::Regulatory,
            },
            sequence_info: None, // Will be filled during BioIR lowering
        }
    }

    // ─── Crosstalk Detection ──────────────────────────────────────────

    fn detect_crosstalk(&self, circuit: &mut MirCircuit) {
        let tu_count = circuit.transcription_units.len();
        if tu_count < 2 {
            return;
        }

        for i in 0..tu_count {
            for j in (i + 1)..tu_count {
                let tu1 = &circuit.transcription_units[i];
                let tu2 = &circuit.transcription_units[j];

                // Check transcriptional read-through
                if tu1.terminator.is_none() {
                    circuit.crosstalk_warnings.push(CrosstalkWarning {
                        tu1: tu1.id.clone(),
                        tu2: tu2.id.clone(),
                        warning_type: CrosstalkType::TranscriptionalReadThrough,
                        severity: 0.8,
                        message: format!(
                            "TU '{}' has no terminator — may cause read-through into '{}'",
                            tu1.id, tu2.id
                        ),
                    });
                } else if let Some(ref term) = tu1.terminator {
                    if term.efficiency < 0.95 {
                        circuit.crosstalk_warnings.push(CrosstalkWarning {
                            tu1: tu1.id.clone(),
                            tu2: tu2.id.clone(),
                            warning_type: CrosstalkType::TranscriptionalReadThrough,
                            severity: 1.0 - term.efficiency,
                            message: format!(
                                "Terminator in '{}' has {:.0}% efficiency — {:.0}% read-through risk into '{}'",
                                tu1.id,
                                term.efficiency * 100.0,
                                (1.0 - term.efficiency) * 100.0,
                                tu2.id
                            ),
                        });
                    }
                }

                // Check shared regulators
                let shared: Vec<_> = tu1.promoter.regulators.iter()
                    .filter(|r| tu2.promoter.regulators.contains(r))
                    .collect();
                if !shared.is_empty() {
                    circuit.crosstalk_warnings.push(CrosstalkWarning {
                        tu1: tu1.id.clone(),
                        tu2: tu2.id.clone(),
                        warning_type: CrosstalkType::SharedRegulator,
                        severity: 0.5,
                        message: format!(
                            "TUs '{}' and '{}' share regulator(s): {:?} — may cause unintended coordinated behavior",
                            tu1.id, tu2.id, shared
                        ),
                    });
                }

                // Check polymerase competition (if both active promoters are strong)
                if tu1.promoter.strength > 0.8 && tu2.promoter.strength > 0.8 {
                    circuit.crosstalk_warnings.push(CrosstalkWarning {
                        tu1: tu1.id.clone(),
                        tu2: tu2.id.clone(),
                        warning_type: CrosstalkType::PolymeraseCompetition,
                        severity: 0.4,
                        message: format!(
                            "Both '{}' ({} strength={:.1}) and '{}' ({} strength={:.1}) are strong promoters — may compete for RNA polymerase",
                            tu1.id, tu1.promoter.name, tu1.promoter.strength,
                            tu2.id, tu2.promoter.name, tu2.promoter.strength,
                        ),
                    });
                }
            }
        }
    }

    // ─── Metabolic Burden Calculation ─────────────────────────────────

    fn calculate_burden(&self, circuit: &mut MirCircuit) {
        let mut total_atp = 0.0;

        for tu in &circuit.transcription_units {
            // Transcription cost: ~2 ATP per nucleotide × copies
            let transcription_cost = (tu.transcript_length as f64) * 2.0
                * tu.promoter.strength * 100.0; // ~100 transcripts at max

            // Translation cost: ~4 ATP per amino acid × copies × translation rate
            let translation_cost: f64 = tu.coding_sequences.iter()
                .map(|cds| (cds.estimated_length_aa as f64) * 4.0)
                .sum::<f64>() * tu.rbs.translation_rate * tu.estimated_expression;

            total_atp += transcription_cost + translation_cost;
        }

        // E. coli has ~1e9 ATP per cell division
        let atp_budget = 1e9;
        let resource_fraction = total_atp / atp_budget;
        let growth_impact = resource_fraction.min(1.0);

        let category = if resource_fraction < 0.05 {
            BurdenCategory::Negligible
        } else if resource_fraction < 0.15 {
            BurdenCategory::Low
        } else if resource_fraction < 0.30 {
            BurdenCategory::Moderate
        } else if resource_fraction < 0.50 {
            BurdenCategory::High
        } else {
            BurdenCategory::Critical
        };

        circuit.estimated_burden = MetabolicBurden {
            atp_consumption: total_atp,
            resource_fraction,
            growth_impact,
            category,
        };
    }

    // ─── Program Analysis ─────────────────────────────────────────────

    fn build_analysis(&self, circuits: &[MirCircuit], _genes: &[MirGene]) -> ProgramAnalysis {
        let mut analysis = ProgramAnalysis::default();

        for circuit in circuits {
            analysis.total_transcription_units += circuit.transcription_units.len();
            analysis.total_dna_length_bp += circuit.resources.estimated_construct_size;
            analysis.total_proteins += circuit.resources.cds_count;

            if circuit.is_contained {
                analysis.has_containment = true;
            }

            // Collect ownership violations as errors
            for violation in &circuit.ownership.violations {
                analysis.errors.push(MirError {
                    code: "MIR_E001".to_string(),
                    message: violation.message.clone(),
                });
            }

            // Collect crosstalk as warnings
            for warning in &circuit.crosstalk_warnings {
                analysis.warnings.push(MirWarning {
                    code: "MIR_W001".to_string(),
                    message: warning.message.clone(),
                });
            }

            // Check toxic parts without containment
            for tu in &circuit.transcription_units {
                for cds in &tu.coding_sequences {
                    if cds.toxicity >= MirToxicity::High && !circuit.is_contained {
                        analysis.errors.push(MirError {
                            code: "MIR_E002".to_string(),
                            message: format!(
                                "Toxic protein '{}' in circuit '{}' without containment",
                                cds.name, circuit.name
                            ),
                        });
                    }
                }
            }

            // Check metabolic burden
            if matches!(circuit.estimated_burden.category, BurdenCategory::High | BurdenCategory::Critical) {
                analysis.warnings.push(MirWarning {
                    code: "MIR_W002".to_string(),
                    message: format!(
                        "Circuit '{}' has {:?} metabolic burden ({:.1}% of cellular resources)",
                        circuit.name,
                        circuit.estimated_burden.category,
                        circuit.estimated_burden.resource_fraction * 100.0
                    ),
                });
            }
        }

        analysis
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::compiler::hir::HirLowering;
    use crate::compiler::parser::Parser;

    #[test]
    fn test_mir_lowering() {
        let source = "circuit Test { }";
        let mut parser = Parser::new(source).unwrap();
        let program = parser.parse_program().unwrap();
        let mut hir_lowering = HirLowering::new();
        let hir = hir_lowering.lower(&program);
        let mir_lowering = MirLowering::new();
        let mir = mir_lowering.lower(&hir);
        assert_eq!(mir.circuits.len(), 1);
        assert_eq!(mir.circuits[0].name, "Test");
    }
}
