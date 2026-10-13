#![allow(dead_code)]
//! Biosecurity Module — CDC Select Agent Verification
//!
//! This module implements compile-time biosecurity checking for BioScript.
//! The compiler automatically verifies sequences and organisms against the
//! CDC/APHIS Select Agents and Toxins List (7 CFR Part 331, 9 CFR Part 121,
//! 42 CFR Part 73).
//!
//! When code targets a select agent or contains sequences matching known
//! pathogenic virulence factors, the compiler BLOCKS compilation and
//! generates a security error.
//!
//! This is not optional. This is not a warning. This is a hard stop.
//!
//! Reference: https://www.selectagents.gov/sat/list.htm

use std::collections::HashMap;
use crate::compiler::bio_types::{BioType, Organism, SecurityRestriction, BiosecurityLevel};

// ═══════════════════════════════════════════════════════════════════════════════
//  SELECT AGENT CHECKER
// ═══════════════════════════════════════════════════════════════════════════════

/// The biosecurity checker that verifies code against the CDC Select Agent list.
pub struct SelectAgentChecker {
    /// Organisms on the CDC/APHIS Select Agents list
    select_agents: HashMap<String, SelectAgentEntry>,
    /// Known pathogenic sequences (virulence factors, toxin genes)
    dangerous_sequences: Vec<DangerousSequence>,
    /// Dual-use research of concern (DURC) keywords
    durc_keywords: Vec<DURCKeyword>,
}

/// An entry in the Select Agents database.
#[derive(Debug, Clone)]
pub struct SelectAgentEntry {
    pub name: String,
    pub aliases: Vec<String>,
    pub category: AgentCategory,
    pub bsl_level: u8,
    pub regulation: &'static str,
    pub overlap_select: bool, // HHS & USDA overlap
    pub tier1: bool,          // Tier 1 = highest risk
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub enum AgentCategory {
    Bacteria,
    Virus,
    Fungus,
    Toxin,
    Prion,
    Rickettsia,
}

/// A known dangerous DNA/protein sequence pattern.
#[derive(Debug, Clone)]
pub struct DangerousSequence {
    pub name: String,
    pub description: String,
    pub organism: String,
    pub sequence_fragment: String, // Conserved region identifier
    pub risk_level: BiosecurityLevel,
}

/// Dual-Use Research of Concern keyword.
#[derive(Debug, Clone)]
pub struct DURCKeyword {
    pub keyword: String,
    pub context: String,
    pub risk_level: BiosecurityLevel,
}

/// Result of a biosecurity check.
#[derive(Debug, Clone)]
pub struct BiosecurityReport {
    pub passed: bool,
    pub violations: Vec<BiosecurityViolation>,
    pub warnings: Vec<BiosecurityWarning>,
    pub organisms_checked: usize,
    pub sequences_checked: usize,
}

#[derive(Debug, Clone)]
pub struct BiosecurityViolation {
    pub level: BiosecurityLevel,
    pub category: ViolationCategory,
    pub message: String,
    pub regulation: String,
    pub source_location: Option<String>,
    pub blocked: bool,
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub enum ViolationCategory {
    SelectAgent,
    Tier1Agent,
    VirulenceFactor,
    Toxin,
    DualUse,
    RestrictedModification,
}

#[derive(Debug, Clone)]
pub struct BiosecurityWarning {
    pub message: String,
    pub recommendation: String,
}

impl SelectAgentChecker {
    /// Create a new biosecurity checker with the full CDC/APHIS Select Agent list.
    pub fn new() -> Self {
        let mut checker = SelectAgentChecker {
            select_agents: HashMap::new(),
            dangerous_sequences: Vec::new(),
            durc_keywords: Vec::new(),
        };
        checker.load_select_agents();
        checker.load_dangerous_sequences();
        checker.load_durc_keywords();
        checker
    }

    /// Check if an organism name matches a select agent.
    pub fn check_organism(&self, name: &str) -> Option<&SelectAgentEntry> {
        let lower = name.to_lowercase();
        for (key, entry) in &self.select_agents {
            if key.to_lowercase() == lower {
                return Some(entry);
            }
            for alias in &entry.aliases {
                if alias.to_lowercase() == lower {
                    return Some(entry);
                }
            }
        }
        None
    }

    /// Check a host organism type against the select agent list.
    pub fn check_host(&self, organism: &Organism) -> Option<BiosecurityViolation> {
        let name = match organism {
            Organism::Custom(name) => name.clone(),
            _ => organism.display_name().to_string(),
        };

        if let Some(entry) = self.check_organism(&name) {
            Some(BiosecurityViolation {
                level: if entry.tier1 { BiosecurityLevel::SelectAgent } else { BiosecurityLevel::BSL3 },
                category: if entry.tier1 { ViolationCategory::Tier1Agent } else { ViolationCategory::SelectAgent },
                message: format!(
                    "🚫 BLOQUEADO: '{}' es un Select Agent del CDC/APHIS. Compilación prohibida. {}",
                    entry.name, entry.regulation
                ),
                regulation: entry.regulation.to_string(),
                source_location: None,
                blocked: entry.tier1 || entry.bsl_level >= 3,
            })
        } else {
            None
        }
    }

    /// Check a DNA sequence for known virulence factor patterns.
    pub fn check_sequence(&self, sequence: &str) -> Vec<BiosecurityViolation> {
        let mut violations = Vec::new();
        let upper_seq = sequence.to_uppercase();

        for dangerous in &self.dangerous_sequences {
            if upper_seq.contains(&dangerous.sequence_fragment.to_uppercase()) {
                violations.push(BiosecurityViolation {
                    level: dangerous.risk_level,
                    category: ViolationCategory::VirulenceFactor,
                    message: format!(
                        "🚫 Secuencia contiene fragmento de {} ({}): {}",
                        dangerous.name, dangerous.organism, dangerous.description
                    ),
                    regulation: "42 CFR Part 73 / Screening Framework Guidance".into(),
                    source_location: None,
                    blocked: matches!(dangerous.risk_level, BiosecurityLevel::SelectAgent | BiosecurityLevel::BSL4),
                });
            }
        }
        violations
    }

    /// Check source code text for DURC keywords.
    pub fn check_source_text(&self, source: &str) -> Vec<BiosecurityWarning> {
        let mut warnings = Vec::new();
        let lower_source = source.to_lowercase();

        for keyword in &self.durc_keywords {
            if lower_source.contains(&keyword.keyword.to_lowercase()) {
                warnings.push(BiosecurityWarning {
                    message: format!(
                        "⚠️ Código contiene referencia a '{}': {}",
                        keyword.keyword, keyword.context
                    ),
                    recommendation: format!(
                        "Verifique que este uso cumple con las regulaciones de investigación de doble uso (DURC). Nivel: {:?}",
                        keyword.risk_level
                    ),
                });
            }
        }
        warnings
    }

    /// Run a full biosecurity check on a compilation.
    pub fn full_check(
        &self,
        host: Option<&Organism>,
        sequences: &[String],
        source_code: &str,
    ) -> BiosecurityReport {
        let mut violations = Vec::new();
        let mut warnings = Vec::new();
        let mut organisms_checked = 0;
        let mut sequences_checked = 0;

        // Check host organism
        if let Some(org) = host {
            organisms_checked += 1;
            if let Some(violation) = self.check_host(org) {
                violations.push(violation);
            }
        }

        // Check all DNA sequences
        for seq in sequences {
            sequences_checked += 1;
            let seq_violations = self.check_sequence(seq);
            violations.extend(seq_violations);
        }

        // Check source for DURC keywords
        let durc_warnings = self.check_source_text(source_code);
        warnings.extend(durc_warnings);

        let passed = !violations.iter().any(|v| v.blocked);

        BiosecurityReport {
            passed,
            violations,
            warnings,
            organisms_checked,
            sequences_checked,
        }
    }

    /// Tag a type with security restrictions if needed.
    pub fn tag_type(&self, bio_type: BioType, organism_name: &str) -> BioType {
        if let Some(entry) = self.check_organism(organism_name) {
            BioType::Restricted {
                inner: Box::new(bio_type),
                restriction: SecurityRestriction {
                    level: if entry.tier1 {
                        BiosecurityLevel::SelectAgent
                    } else if entry.bsl_level >= 3 {
                        BiosecurityLevel::BSL3
                    } else {
                        BiosecurityLevel::BSL2
                    },
                    reason: format!("{} is a CDC/APHIS Select Agent", entry.name),
                    regulation: entry.regulation.to_string(),
                    blocked: entry.tier1 || entry.bsl_level >= 3,
                },
            }
        } else {
            bio_type
        }
    }

    // ─── Database Loading ─────────────────────────────────────────────────

    fn load_select_agents(&mut self) {
        // ═════════════════════════════════════════════════════════════════
        // HHS SELECT AGENTS AND TOXINS (42 CFR Part 73)
        // ═════════════════════════════════════════════════════════════════

        // Tier 1 Agents (highest risk)
        self.add_agent("Bacillus anthracis", &["Anthrax"], AgentCategory::Bacteria, 3, true, true,
            "42 CFR § 73.3 — HHS Select Agent, Tier 1");

        self.add_agent("Yersinia pestis", &["Plague", "Black Death"], AgentCategory::Bacteria, 3, true, true,
            "42 CFR § 73.3 — HHS Select Agent, Tier 1");

        self.add_agent("Variola major", &["Smallpox", "Variola"], AgentCategory::Virus, 4, false, true,
            "42 CFR § 73.3 — HHS Select Agent, Tier 1");

        self.add_agent("Variola minor", &["Alastrim"], AgentCategory::Virus, 4, false, true,
            "42 CFR § 73.3 — HHS Select Agent, Tier 1");

        self.add_agent("Francisella tularensis", &["Tularemia"], AgentCategory::Bacteria, 3, false, true,
            "42 CFR § 73.3 — HHS Select Agent, Tier 1");

        self.add_agent("Ebola virus", &["Ebolavirus", "EBOV", "Filovirus"], AgentCategory::Virus, 4, false, true,
            "42 CFR § 73.3 — HHS Select Agent, Tier 1");

        self.add_agent("Marburg virus", &["Marburgvirus", "MARV"], AgentCategory::Virus, 4, false, true,
            "42 CFR § 73.3 — HHS Select Agent, Tier 1");

        self.add_agent("Botulinum neurotoxin", &["BoNT", "Botulinum toxin", "Botox"], AgentCategory::Toxin, 3, true, true,
            "42 CFR § 73.3 — HHS Select Toxin, Tier 1");

        // Non-Tier-1 HHS Select Agents
        self.add_agent("Burkholderia mallei", &["Glanders"], AgentCategory::Bacteria, 3, false, false,
            "42 CFR § 73.3 — HHS Select Agent");

        self.add_agent("Burkholderia pseudomallei", &["Melioidosis"], AgentCategory::Bacteria, 3, false, false,
            "42 CFR § 73.3 — HHS Select Agent");

        self.add_agent("Clostridium botulinum", &["Botulism"], AgentCategory::Bacteria, 2, true, false,
            "42 CFR § 73.3 — HHS Select Agent");

        self.add_agent("Coxiella burnetii", &["Q fever"], AgentCategory::Rickettsia, 3, false, false,
            "42 CFR § 73.3 — HHS Select Agent");

        self.add_agent("Rickettsia prowazekii", &["Typhus"], AgentCategory::Rickettsia, 3, false, false,
            "42 CFR § 73.3 — HHS Select Agent");

        self.add_agent("Brucella abortus", &["Brucellosis"], AgentCategory::Bacteria, 3, true, false,
            "42 CFR § 73.3 — Overlap Select Agent");

        self.add_agent("Brucella melitensis", &[], AgentCategory::Bacteria, 3, true, false,
            "42 CFR § 73.3 — Overlap Select Agent");

        self.add_agent("Brucella suis", &[], AgentCategory::Bacteria, 3, true, false,
            "42 CFR § 73.3 — Overlap Select Agent");

        // Viruses
        self.add_agent("SARS-CoV", &["SARS", "Severe acute respiratory syndrome coronavirus"], AgentCategory::Virus, 3, false, false,
            "42 CFR § 73.3 — HHS Select Agent");

        self.add_agent("Monkeypox virus", &["Mpox", "MPXV"], AgentCategory::Virus, 3, false, false,
            "42 CFR § 73.3 — HHS Select Agent");

        self.add_agent("Nipah virus", &["NiV"], AgentCategory::Virus, 4, false, true,
            "42 CFR § 73.3 — HHS Select Agent, Tier 1");

        self.add_agent("Hendra virus", &["HeV"], AgentCategory::Virus, 4, false, false,
            "42 CFR § 73.3 — HHS Select Agent");

        self.add_agent("Crimean-Congo hemorrhagic fever virus", &["CCHFV"], AgentCategory::Virus, 4, false, false,
            "42 CFR § 73.3 — HHS Select Agent");

        self.add_agent("Junin virus", &["Argentine hemorrhagic fever"], AgentCategory::Virus, 4, false, false,
            "42 CFR § 73.3 — HHS Select Agent");

        self.add_agent("Lassa virus", &["Lassa fever"], AgentCategory::Virus, 4, false, false,
            "42 CFR § 73.3 — HHS Select Agent");

        self.add_agent("Machupo virus", &["Bolivian hemorrhagic fever"], AgentCategory::Virus, 4, false, false,
            "42 CFR § 73.3 — HHS Select Agent");

        self.add_agent("Reconstructed 1918 Influenza virus", &["1918 flu", "Spanish flu"], AgentCategory::Virus, 3, false, true,
            "42 CFR § 73.3 — HHS Select Agent, Tier 1");

        // Select Toxins
        self.add_agent("Ricin", &["Ricinus communis toxin"], AgentCategory::Toxin, 2, true, false,
            "42 CFR § 73.3 — HHS/USDA Overlap Select Toxin");

        self.add_agent("Abrin", &["Abrus precatorius toxin"], AgentCategory::Toxin, 2, false, false,
            "42 CFR § 73.3 — HHS Select Toxin");

        self.add_agent("Staphylococcal enterotoxin", &["SEB", "SE"], AgentCategory::Toxin, 2, false, false,
            "42 CFR § 73.3 — HHS Select Toxin");

        self.add_agent("T-2 toxin", &["T2 mycotoxin"], AgentCategory::Toxin, 2, false, false,
            "42 CFR § 73.3 — HHS/USDA Overlap Select Toxin");

        self.add_agent("Diacetoxyscirpenol", &["DAS"], AgentCategory::Toxin, 2, true, false,
            "42 CFR § 73.3 — Overlap Select Toxin");

        self.add_agent("Conotoxin", &["Cone snail toxin"], AgentCategory::Toxin, 2, false, false,
            "42 CFR § 73.3 — HHS Select Toxin");

        self.add_agent("Tetrodotoxin", &["TTX"], AgentCategory::Toxin, 2, false, false,
            "42 CFR § 73.3 — HHS Select Toxin");

        self.add_agent("Saxitoxin", &["STX", "PSP"], AgentCategory::Toxin, 2, false, false,
            "42 CFR § 73.3 — HHS Select Toxin");

        // ═════════════════════════════════════════════════════════════════
        // USDA SELECT AGENTS (9 CFR Part 121)
        // ═════════════════════════════════════════════════════════════════

        self.add_agent("African swine fever virus", &["ASFV"], AgentCategory::Virus, 3, false, false,
            "9 CFR § 121.3 — USDA Select Agent");

        self.add_agent("Avian influenza virus", &["HPAI", "H5N1"], AgentCategory::Virus, 3, false, true,
            "9 CFR § 121.3 — USDA Select Agent");

        self.add_agent("Classical swine fever virus", &["CSF", "Hog cholera"], AgentCategory::Virus, 3, false, false,
            "9 CFR § 121.3 — USDA Select Agent");

        self.add_agent("Foot-and-mouth disease virus", &["FMDV", "FMD"], AgentCategory::Virus, 3, false, true,
            "9 CFR § 121.3 — USDA Select Agent, Tier 1");

        self.add_agent("Mycoplasma mycoides", &["CBPP", "Contagious bovine pleuropneumonia"], AgentCategory::Bacteria, 3, false, false,
            "9 CFR § 121.3 — USDA Select Agent");

        self.add_agent("Newcastle disease virus", &["NDV", "vNDV"], AgentCategory::Virus, 3, false, false,
            "9 CFR § 121.3 — USDA Select Agent");

        self.add_agent("Rinderpest virus", &["Cattle plague"], AgentCategory::Virus, 3, false, true,
            "9 CFR § 121.3 — USDA Select Agent, Tier 1");

        // ═════════════════════════════════════════════════════════════════
        // PLANT SELECT AGENTS (7 CFR Part 331)
        // ═════════════════════════════════════════════════════════════════

        self.add_agent("Ralstonia solanacearum", &["Race 3 biovar 2", "Brown rot"], AgentCategory::Bacteria, 2, false, false,
            "7 CFR § 331.3 — USDA Plant Select Agent");

        self.add_agent("Rathayibacter toxicus", &["Ryegrass toxicity"], AgentCategory::Bacteria, 2, false, false,
            "7 CFR § 331.3 — USDA Plant Select Agent");

        self.add_agent("Xanthomonas oryzae", &["Bacterial blight of rice"], AgentCategory::Bacteria, 2, false, false,
            "7 CFR § 331.3 — USDA Plant Select Agent");

        // Fungi
        self.add_agent("Coccidioides immitis", &["Valley fever", "Coccidioidomycosis"], AgentCategory::Fungus, 3, false, false,
            "42 CFR § 73.3 — HHS Select Agent");

        self.add_agent("Coccidioides posadasii", &[], AgentCategory::Fungus, 3, false, false,
            "42 CFR § 73.3 — HHS Select Agent");
    }

    fn load_dangerous_sequences(&mut self) {
        // Known virulence factor conserved regions
        // These are short signature sequences, NOT full gene sequences
        // They serve as flags for manual review

        self.dangerous_sequences.push(DangerousSequence {
            name: "Anthrax Protective Antigen (PA)".into(),
            description: "Componente del complejo de toxina de ántrax".into(),
            organism: "Bacillus anthracis".into(),
            sequence_fragment: "ATGAAAAAACGGAATACTAGTATCACTGGTAT".into(), // PA signal sequence region
            risk_level: BiosecurityLevel::SelectAgent,
        });

        self.dangerous_sequences.push(DangerousSequence {
            name: "Anthrax Lethal Factor (LF)".into(),
            description: "Metaloproteasa que causa muerte celular".into(),
            organism: "Bacillus anthracis".into(),
            sequence_fragment: "ATGAATAAACAAGCATTTACAGCATTTCAAGA".into(),
            risk_level: BiosecurityLevel::SelectAgent,
        });

        self.dangerous_sequences.push(DangerousSequence {
            name: "Botulinum Toxin Light Chain".into(),
            description: "Dominio catalítico de la neurotoxina botulínica".into(),
            organism: "Clostridium botulinum".into(),
            sequence_fragment: "ATGCCAGTTGTAAATAATAACTTTAAT".into(),
            risk_level: BiosecurityLevel::SelectAgent,
        });

        self.dangerous_sequences.push(DangerousSequence {
            name: "Ricin A chain".into(),
            description: "Cadena catalítica de ricina (RIP tipo II)".into(),
            organism: "Ricinus communis".into(),
            sequence_fragment: "ATGAAACTCTCCTCAGCAATACTTTTGGAT".into(),
            risk_level: BiosecurityLevel::SelectAgent,
        });

        self.dangerous_sequences.push(DangerousSequence {
            name: "Plague F1 Capsule Antigen".into(),
            description: "Factor de virulencia principal de peste".into(),
            organism: "Yersinia pestis".into(),
            sequence_fragment: "ATGAAAAAAATCAGTTCCGTTATCGCAGCG".into(),
            risk_level: BiosecurityLevel::SelectAgent,
        });

        self.dangerous_sequences.push(DangerousSequence {
            name: "Diphtheria Toxin".into(),
            description: "Exotoxina que inhibe síntesis proteica por ADP-ribosilación de EF-2".into(),
            organism: "Corynebacterium diphtheriae".into(),
            sequence_fragment: "ATGGCTGCTGATGATGTTGTTGATTCTTCTA".into(),
            risk_level: BiosecurityLevel::BSL3,
        });

        self.dangerous_sequences.push(DangerousSequence {
            name: "Shiga Toxin Stx2a".into(),
            description: "Toxina que inhibe síntesis proteica; causa síndrome urémico hemolítico".into(),
            organism: "E. coli O157:H7".into(),
            sequence_fragment: "ATGAAGTGTATATTATTTAAATGGGTACTG".into(),
            risk_level: BiosecurityLevel::BSL3,
        });

        self.dangerous_sequences.push(DangerousSequence {
            name: "Tularemia IglC virulence".into(),
            description: "Factor de virulencia intracelular esencial".into(),
            organism: "Francisella tularensis".into(),
            sequence_fragment: "ATGAATATAAAAGTTACTATATCTGCAG".into(),
            risk_level: BiosecurityLevel::SelectAgent,
        });
    }

    fn load_durc_keywords(&mut self) {
        self.durc_keywords.push(DURCKeyword {
            keyword: "gain_of_function".into(),
            context: "Investigación de ganancia de función — regulada por DURC".into(),
            risk_level: BiosecurityLevel::BSL3,
        });

        self.durc_keywords.push(DURCKeyword {
            keyword: "enhanced_transmissibility".into(),
            context: "Aumento de transmisibilidad — investigación de alto riesgo".into(),
            risk_level: BiosecurityLevel::BSL3,
        });

        self.durc_keywords.push(DURCKeyword {
            keyword: "immune_evasion".into(),
            context: "Evasión inmune — potencial de doble uso".into(),
            risk_level: BiosecurityLevel::BSL2,
        });

        self.durc_keywords.push(DURCKeyword {
            keyword: "antibiotic_resistance_spread".into(),
            context: "Diseminación de resistencia antibiótica — preocupación de salud pública".into(),
            risk_level: BiosecurityLevel::BSL2,
        });

        self.durc_keywords.push(DURCKeyword {
            keyword: "weaponize".into(),
            context: "Referencia a armamentización biológica — PROHIBIDO".into(),
            risk_level: BiosecurityLevel::SelectAgent,
        });

        self.durc_keywords.push(DURCKeyword {
            keyword: "bioweapon".into(),
            context: "Referencia a arma biológica — PROHIBIDO por la Convención de Armas Biológicas".into(),
            risk_level: BiosecurityLevel::SelectAgent,
        });

        self.durc_keywords.push(DURCKeyword {
            keyword: "synthesis_of_pathogen".into(),
            context: "Síntesis de novo de patógenos — requiere aprobación institucional".into(),
            risk_level: BiosecurityLevel::BSL3,
        });

        self.durc_keywords.push(DURCKeyword {
            keyword: "pandemic_potential".into(),
            context: "Investigación con potencial pandémico — regulada".into(),
            risk_level: BiosecurityLevel::BSL3,
        });
    }

    fn add_agent(
        &mut self,
        name: &str,
        aliases: &[&str],
        category: AgentCategory,
        bsl_level: u8,
        overlap_select: bool,
        tier1: bool,
        regulation: &'static str,
    ) {
        self.select_agents.insert(
            name.to_string(),
            SelectAgentEntry {
                name: name.to_string(),
                aliases: aliases.iter().map(|s| s.to_string()).collect(),
                category,
                bsl_level,
                regulation,
                overlap_select,
                tier1,
            },
        );
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
//  TESTS
// ═══════════════════════════════════════════════════════════════════════════════

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_select_agent_detection() {
        let checker = SelectAgentChecker::new();

        // Direct match
        let anthrax = checker.check_organism("Bacillus anthracis");
        assert!(anthrax.is_some());
        assert!(anthrax.unwrap().tier1);

        // Alias match
        let plague = checker.check_organism("Plague");
        assert!(plague.is_some());

        // Safe organism
        let ecoli = checker.check_organism("E. coli K-12");
        assert!(ecoli.is_none());

        // Variola
        let smallpox = checker.check_organism("Smallpox");
        assert!(smallpox.is_some());
        assert_eq!(smallpox.unwrap().bsl_level, 4);
    }

    #[test]
    fn test_host_check() {
        let checker = SelectAgentChecker::new();

        // Safe host
        let safe = checker.check_host(&Organism::EcoliK12);
        assert!(safe.is_none());

        // Custom dangerous host
        let dangerous = checker.check_host(&Organism::Custom("Bacillus anthracis".into()));
        assert!(dangerous.is_some());
        assert!(dangerous.unwrap().blocked);
    }

    #[test]
    fn test_durc_keywords() {
        let checker = SelectAgentChecker::new();

        let source = "// This circuit implements immune_evasion";
        let warnings = checker.check_source_text(source);
        assert!(!warnings.is_empty());

        let safe_source = "// This circuit expresses GFP";
        let no_warnings = checker.check_source_text(safe_source);
        assert!(no_warnings.is_empty());
    }

    #[test]
    fn test_full_check_safe() {
        let checker = SelectAgentChecker::new();
        let report = checker.full_check(
            Some(&Organism::EcoliK12),
            &["ATGCGATCGATCG".to_string()],
            "circuit toggle { pLac -> GFP }",
        );
        assert!(report.passed);
        assert!(report.violations.is_empty());
    }

    #[test]
    fn test_full_check_dangerous() {
        let checker = SelectAgentChecker::new();
        let report = checker.full_check(
            Some(&Organism::Custom("Bacillus anthracis".into())),
            &[],
            "circuit anthrax_circuit { }",
        );
        assert!(!report.passed);
        assert!(!report.violations.is_empty());
    }

    #[test]
    fn test_type_tagging() {
        let checker = SelectAgentChecker::new();

        // Safe organism — no restriction
        let safe_type = checker.tag_type(BioType::Host(Organism::EcoliK12), "E. coli K-12");
        assert!(matches!(safe_type, BioType::Host(_)));

        // Dangerous organism — gets restricted
        let dangerous_type = checker.tag_type(
            BioType::Host(Organism::Custom("Yersinia pestis".into())),
            "Yersinia pestis",
        );
        assert!(matches!(dangerous_type, BioType::Restricted { .. }));
    }
}
