//! IR Lowering: MIR → BioIR
//!
//! This module bridges the validated MIR into the existing BioIR representation
//! that feeds into codegen (SBOL, FASTA, GenBank, LAMMPS).
//!
//! Pipeline: AST → HIR → MIR → [IR Lowering] → BioIR → CodeGen

use std::collections::HashMap;
use crate::compiler::bio_ir::*;
use crate::compiler::mir;

/// Lowers a MIR program into a BioIR program
pub struct IrLowering {
    parts_library: PartsLibrary,
}

impl IrLowering {
    pub fn new() -> Self {
        Self {
            parts_library: PartsLibrary::standard_library(),
        }
    }

    /// Lower MIR → BioIR
    pub fn lower(&self, mir_program: &mir::MirProgram) -> BioIRProgram {
        let host = mir_program.chassis.as_ref()
            .map(|ch| self.lower_chassis(ch))
            .or_else(|| Some(HostOrganism::default()));

        let circuits: Vec<GeneticCircuit> = mir_program.circuits.iter()
            .map(|c| self.lower_circuit(c))
            .collect();

        let mut metadata = ProgramMetadata::default();
        metadata.description = Some(format!(
            "Compiled BioScript program: {} circuits, {} TUs, ~{} bp total",
            circuits.len(),
            mir_program.analysis.total_transcription_units,
            mir_program.analysis.total_dna_length_bp
        ));

        // Set safety level based on containment
        metadata.safety_level = if mir_program.analysis.has_containment {
            SafetyLevel::Contained
        } else {
            SafetyLevel::Standard
        };

        BioIRProgram {
            name: mir_program.name.clone(),
            host,
            circuits,
            parts_library: self.parts_library.clone(),
            metadata,
        }
    }

    fn lower_chassis(&self, chassis: &mir::MirChassis) -> HostOrganism {
        let species = match chassis.species {
            mir::MirSpecies::EColi => Species::EColi,
            mir::MirSpecies::BSubtilis => Species::BSubtilis,
            mir::MirSpecies::SCerevisiae => Species::SCerevisiae,
            mir::MirSpecies::Mammalian => Species::Mammalian,
            mir::MirSpecies::Custom(ref s) => Species::Custom(s.clone()),
        };

        HostOrganism {
            name: chassis.name.clone(),
            strain: chassis.name.clone(),
            species,
            atp_capacity: chassis.atp_capacity,
            doubling_time_minutes: chassis.growth_rate,
            codon_table: CodonTable::default(),
        }
    }

    fn lower_circuit(&self, mir_circuit: &mir::MirCircuit) -> GeneticCircuit {
        let transcription_units: Vec<TranscriptionUnit> = mir_circuit.transcription_units.iter()
            .map(|tu| self.lower_tu(tu))
            .collect();

        let regulatory_links: Vec<RegulatoryLink> = mir_circuit.regulations.iter()
            .map(|r| self.lower_regulation(r))
            .collect();

        let kill_switch = mir_circuit.kill_switch.as_ref().map(|ks| self.lower_kill_switch(ks));

        let atp_cost = mir_circuit.estimated_burden.atp_consumption;
        let toxicity_score = mir_circuit.transcription_units.iter()
            .flat_map(|tu| tu.coding_sequences.iter())
            .map(|cds| match cds.toxicity {
                mir::MirToxicity::None => 0.0,
                mir::MirToxicity::Low => 0.1,
                mir::MirToxicity::Medium => 0.3,
                mir::MirToxicity::High => 0.7,
                mir::MirToxicity::Lethal => 1.0,
            })
            .sum::<f64>();

        let mut metadata = HashMap::new();
        metadata.insert("total_tus".to_string(), transcription_units.len().to_string());
        metadata.insert("estimated_construct_bp".to_string(),
            mir_circuit.resources.estimated_construct_size.to_string());
        metadata.insert("burden_category".to_string(),
            format!("{:?}", mir_circuit.estimated_burden.category));
        metadata.insert("resource_fraction".to_string(),
            format!("{:.4}", mir_circuit.estimated_burden.resource_fraction));

        GeneticCircuit {
            name: mir_circuit.name.clone(),
            is_contained: mir_circuit.is_contained,
            kill_switch,
            transcription_units,
            regulatory_links,
            estimated_atp_cost: atp_cost,
            toxicity_score,
            metadata,
        }
    }

    fn lower_tu(&self, mir_tu: &mir::MirTranscriptionUnit) -> TranscriptionUnit {
        // Resolve promoter from parts library or create from MIR
        let promoter = self.parts_library.promoters.get(&mir_tu.promoter.name)
            .cloned()
            .unwrap_or_else(|| PromoterIR {
                id: format!("custom_{}", mir_tu.promoter.name),
                name: mir_tu.promoter.name.clone(),
                sequence: self.get_default_promoter_sequence(&mir_tu.promoter.name),
                strength: mir_tu.promoter.strength,
                regulation: if mir_tu.promoter.is_regulated {
                    if let Some(reg) = mir_tu.promoter.regulators.first() {
                        RegulationType::Repressible {
                            repressor: reg.clone(),
                            k_half: 0.1,
                        }
                    } else {
                        RegulationType::Constitutive
                    }
                } else {
                    RegulationType::Constitutive
                },
                regulated_by: mir_tu.promoter.regulators.clone(),
                delta_g: -10.0,
            });

        // Resolve RBS
        let rbs = self.parts_library.rbs.get(&mir_tu.rbs.name)
            .cloned()
            .unwrap_or_else(|| RbsIR {
                id: format!("custom_{}", mir_tu.rbs.name),
                name: mir_tu.rbs.name.clone(),
                sequence: "AAAGAGGAGAAA".to_string(), // Default SD sequence
                translation_rate: mir_tu.rbs.translation_rate,
                delta_g: -10.0,
                shine_dalgarno: "AGGAGG".to_string(),
                spacing: 6,
            });

        // Primary CDS (first coding sequence)
        let primary_cds = if let Some(first_cds) = mir_tu.coding_sequences.first() {
            self.lower_cds(first_cds)
        } else {
            // Empty CDS placeholder
            CodingSequenceIR {
                id: "empty".to_string(),
                name: "empty".to_string(),
                dna_sequence: "ATG".to_string(),
                amino_sequence: "M".to_string(),
                protein: ProteinIR {
                    name: "empty".to_string(),
                    molecular_weight_kda: 0.0,
                    isoelectric_point: 7.0,
                    half_life_minutes: 0.0,
                    function: ProteinFunction::Custom("empty".to_string()),
                    toxicity: ToxicityLevel::None,
                    localization: CellularLocalization::Cytoplasm,
                },
                codon_adaptation_index: 0.0,
            }
        };

        // All coding sequences (for polycistronic TUs)
        let coding_sequences: Vec<CodingSequenceIR> = mir_tu.coding_sequences.iter()
            .map(|cds| self.lower_cds(cds))
            .collect();

        // Terminator
        let terminator = mir_tu.terminator.as_ref().map(|t| {
            Terminator {
                name: t.name.clone(),
                sequence: self.get_default_terminator_sequence(&t.name),
                efficiency: t.efficiency,
                bidirectional: t.bidirectional,
                registry_id: self.get_terminator_registry_id(&t.name),
            }
        });

        TranscriptionUnit {
            id: mir_tu.id.clone(),
            name: format!("{}_{}",
                mir_tu.promoter.name,
                mir_tu.coding_sequences.first().map(|c| c.name.as_str()).unwrap_or("empty")
            ),
            promoter,
            rbs,
            cds: primary_cds,
            coding_sequences,
            terminator,
            insulators: Vec::new(), // Added by insulation engine later
            upstream_spacer: None,
            downstream_spacer: None,
            ribozyme_insulator: None,
            metadata: HashMap::new(),
        }
    }

    fn lower_cds(&self, mir_cds: &mir::MirCDS) -> CodingSequenceIR {
        let protein = self.parts_library.proteins.get(&mir_cds.name)
            .cloned()
            .unwrap_or_else(|| ProteinIR {
                name: mir_cds.name.clone(),
                molecular_weight_kda: (mir_cds.estimated_length_aa as f64) * 0.11, // avg AA ~110 Da
                isoelectric_point: 7.0,
                half_life_minutes: 60.0,
                function: match mir_cds.protein_function {
                    mir::MirProteinFunction::Reporter => ProteinFunction::Reporter,
                    mir::MirProteinFunction::Repressor => ProteinFunction::Regulator(RegulatorType::Repressor),
                    mir::MirProteinFunction::Activator => ProteinFunction::Regulator(RegulatorType::Activator),
                    mir::MirProteinFunction::Enzyme => ProteinFunction::Enzyme { ec_number: "unknown".to_string() },
                    mir::MirProteinFunction::Structural => ProteinFunction::Structural,
                    mir::MirProteinFunction::Toxic => ProteinFunction::Custom("toxin".to_string()),
                    mir::MirProteinFunction::Other(ref s) => ProteinFunction::Custom(s.clone()),
                },
                toxicity: match mir_cds.toxicity {
                    mir::MirToxicity::None => ToxicityLevel::None,
                    mir::MirToxicity::Low => ToxicityLevel::Low,
                    mir::MirToxicity::Medium => ToxicityLevel::Medium,
                    mir::MirToxicity::High => ToxicityLevel::High,
                    mir::MirToxicity::Lethal => ToxicityLevel::Lethal,
                },
                localization: CellularLocalization::Cytoplasm,
            });

        // Generate a placeholder DNA sequence of the correct length
        let dna_sequence = self.generate_placeholder_sequence(mir_cds.estimated_length_bp);
        let amino_sequence = self.generate_placeholder_amino(mir_cds.estimated_length_aa);

        CodingSequenceIR {
            id: format!("cds_{}", mir_cds.name),
            name: mir_cds.name.clone(),
            dna_sequence,
            amino_sequence,
            protein,
            codon_adaptation_index: 0.7, // Default CAI, improved by codon optimizer
        }
    }

    fn lower_regulation(&self, mir_reg: &mir::MirRegulation) -> RegulatoryLink {
        RegulatoryLink {
            from: mir_reg.from.clone(),
            to: mir_reg.to.clone(),
            regulation_type: match mir_reg.kind {
                mir::MirRegulationKind::Activation => LinkType::Activation,
                mir::MirRegulationKind::Repression => LinkType::Repression,
                mir::MirRegulationKind::Unknown => LinkType::Repression, // Default assumption
            },
            strength: mir_reg.estimated_strength,
            hill_coefficient: 2.0, // Typical for transcription factors
            k_half: 0.1,
        }
    }

    fn lower_kill_switch(&self, ks: &mir::MirKillSwitch) -> KillSwitchIR {
        let mechanism = match ks.mechanism {
            mir::MirKillMechanism::CcdB => KillMechanism::CcdB,
            mir::MirKillMechanism::MazF => KillMechanism::MazF,
            mir::MirKillMechanism::Holin => KillMechanism::Holin,
            mir::MirKillMechanism::Custom(ref s) => KillMechanism::Custom(s.clone()),
        };

        KillSwitchIR {
            trigger: KillTrigger::AbsenceOf(ks.trigger.clone()),
            mechanism,
            delay_hours: ks.delay_hours,
        }
    }

    // ─── Sequence Helpers ─────────────────────────────────────────────

    fn get_default_promoter_sequence(&self, name: &str) -> String {
        match name {
            "pLac" => "AATTGTGAGCGGATAACAATT".to_string(),
            "pTet" => "TCCCTATCAGTGATAGAGA".to_string(),
            "pBAD" => "ACATTGATTATTTGCACGGC".to_string(),
            "pT7" => "TAATACGACTCACTATAGGG".to_string(),
            "pConst" => "TTGACAGCTAGCTCAGTCCTAGG".to_string(),
            _ => "TTGACATTAATCATCCGGCTCG".to_string(), // Anderson family constitutive
        }
    }

    fn get_default_terminator_sequence(&self, name: &str) -> String {
        match name {
            "term_T1" | "T1" | "B0010" =>
                "CCAGGCATCAAATAAAACGAAAGGCTCAGTCGAAAGACTGGGCCTTTCGTTTTATCTGTTGTTTGTCGGTGAACGCTCTC".to_string(),
            "term_T7" | "T7" | "B0015" =>
                "CCAGGCATCAAATAAAACGAAAGGCTCAGTCGAAAGACTGGGCCTTTCGTTTTATCTGTTGTTTGTCGGTGAACGCTCTCTACTAGAGTCACACTGGCTCACCTTCGGGTGGGCCTTTCTGCGTTTATA".to_string(),
            _ =>
                "CCAGGCATCAAATAAAACGAAAGGCTCAGTCGAAAGACTGGGCCTTTCGTTTTATCTGTTGTTTGTCGGTGAACGCTCTC".to_string(),
        }
    }

    fn get_terminator_registry_id(&self, name: &str) -> Option<String> {
        match name {
            "term_T1" | "T1" | "B0010" => Some("BBa_B0010".to_string()),
            "term_T7" | "T7" | "B0015" => Some("BBa_B0015".to_string()),
            _ => None,
        }
    }

    /// Generate a placeholder DNA sequence that's codon-plausible
    fn generate_placeholder_sequence(&self, length_bp: usize) -> String {
        // Use a repeating codon pattern that would produce a real protein
        let codons = ["ATG", "GAA", "GCT", "AAA", "GAT", "CTG", "ACC", "GTT",
                       "CAG", "TCC", "CGT", "TAT", "GGC", "TTC", "ATC", "CAA"];
        let mut seq = String::with_capacity(length_bp);
        let mut i = 0;
        while seq.len() < length_bp {
            seq.push_str(codons[i % codons.len()]);
            i += 1;
        }
        seq.truncate(length_bp);
        seq
    }

    /// Generate a placeholder amino acid sequence
    fn generate_placeholder_amino(&self, length_aa: usize) -> String {
        let aas = "MEKADLTVQSRYGFIQ";
        let mut seq = String::with_capacity(length_aa);
        while seq.len() < length_aa {
            seq.push_str(aas);
        }
        seq.truncate(length_aa);
        seq
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::compiler::hir::HirLowering;
    use crate::compiler::mir::MirLowering;
    use crate::compiler::parser::Parser;

    #[test]
    fn test_ir_lowering_produces_bio_ir() {
        let source = "circuit Test { }";
        let mut parser = Parser::new(source).unwrap();
        let program = parser.parse_program().unwrap();

        let mut hir_lowering = HirLowering::new();
        let hir = hir_lowering.lower(&program);

        let mir_lowering = MirLowering::new();
        let mir = mir_lowering.lower(&hir);

        let ir_lowering = IrLowering::new();
        let bio_ir = ir_lowering.lower(&mir);

        assert_eq!(bio_ir.circuits.len(), 1);
        assert!(bio_ir.host.is_some());
    }
}
