#![allow(dead_code)]
//! Bio-IR: Representación Intermedia para Circuitos Genéticos
//! 
//! Esta IR representa circuitos genéticos de forma optimizada para:
//! - Análisis termodinámico
//! - Validación de compatibilidad
//! - Generación de código (SBOL, FASTA, LAMMPS)

use std::collections::HashMap;

/// Programa en Bio-IR
#[derive(Debug, Clone)]
pub struct BioIRProgram {
    /// Nombre del programa
    pub name: String,
    
    /// Organismo huésped
    pub host: Option<HostOrganism>,
    
    /// Circuitos definidos
    pub circuits: Vec<GeneticCircuit>,
    
    /// Biblioteca de partes usadas
    pub parts_library: PartsLibrary,
    
    /// Metadatos
    pub metadata: ProgramMetadata,
}

/// Metadatos del programa
#[derive(Debug, Clone, Default)]
pub struct ProgramMetadata {
    pub author: Option<String>,
    pub version: Option<String>,
    pub description: Option<String>,
    pub safety_level: SafetyLevel,
}

#[derive(Debug, Clone, Default)]
pub enum SafetyLevel {
    #[default]
    Standard,
    Contained,
    BiosecurityReview,
}

/// Organismo huésped
#[derive(Debug, Clone)]
pub struct HostOrganism {
    pub name: String,
    pub strain: String,
    pub species: Species,
    pub atp_capacity: f64,          // Unidades arbitrarias
    pub doubling_time_minutes: f64,
    pub codon_table: CodonTable,
}

#[derive(Debug, Clone)]
pub enum Species {
    EColi,
    BSubtilis,
    SCerevisiae,
    Mammalian,
    Custom(String),
}

impl Default for HostOrganism {
    fn default() -> Self {
        Self {
            name: "E. coli DH5α".to_string(),
            strain: "DH5-alpha".to_string(),
            species: Species::EColi,
            atp_capacity: 100.0,
            doubling_time_minutes: 20.0,
            codon_table: CodonTable::default(),
        }
    }
}

/// Tabla de codones para optimización
#[derive(Debug, Clone)]
pub struct CodonTable {
    pub preference: HashMap<String, Vec<(String, f64)>>,
}

impl Default for CodonTable {
    fn default() -> Self {
        // Tabla de codones de E. coli (frecuencias simplificadas)
        let mut preference = HashMap::new();
        
        // Algunos aminoácidos con preferencias de codones
        preference.insert("M".to_string(), vec![("ATG".to_string(), 1.0)]);
        preference.insert("W".to_string(), vec![("TGG".to_string(), 1.0)]);
        preference.insert("F".to_string(), vec![
            ("TTT".to_string(), 0.57),
            ("TTC".to_string(), 0.43),
        ]);
        preference.insert("L".to_string(), vec![
            ("CTG".to_string(), 0.50),
            ("TTA".to_string(), 0.13),
            ("TTG".to_string(), 0.13),
            ("CTT".to_string(), 0.10),
            ("CTC".to_string(), 0.10),
            ("CTA".to_string(), 0.04),
        ]);
        // ... más aminoácidos
        
        Self { preference }
    }
}

/// Circuito genético completo
#[derive(Debug, Clone)]
pub struct GeneticCircuit {
    pub name: String,
    pub is_contained: bool,
    pub kill_switch: Option<KillSwitchIR>,
    pub transcription_units: Vec<TranscriptionUnit>,
    pub regulatory_links: Vec<RegulatoryLink>,
    pub estimated_atp_cost: f64,
    pub toxicity_score: f64,
    /// Metadatos del circuito (incluye info de aislamiento)
    pub metadata: HashMap<String, String>,
}

/// Interruptor de seguridad
#[derive(Debug, Clone)]
pub struct KillSwitchIR {
    pub trigger: KillTrigger,
    pub mechanism: KillMechanism,
    pub delay_hours: f64,
}

#[derive(Debug, Clone)]
pub enum KillTrigger {
    AbsenceOf(String),          // Muerte sin inductor
    PresenceOf(String),         // Muerte con inductor
    TemperatureAbove(f64),
    TemperatureBelow(f64),
    TimeAfterActivation(f64),
}

#[derive(Debug, Clone)]
pub enum KillMechanism {
    CcdB,       // Toxina DNA girasa
    MazF,       // Toxina mRNA
    Holin,      // Lisis celular
    Custom(String),
}

/// Unidad de transcripción: promotor -> RBS -> CDS -> terminador
#[derive(Debug, Clone)]
pub struct TranscriptionUnit {
    pub id: String,
    pub name: String,
    pub promoter: PromoterIR,
    pub rbs: RbsIR,
    pub cds: CodingSequenceIR,
    pub coding_sequences: Vec<CodingSequenceIR>,
    pub terminator: Option<Terminator>,
    pub insulators: Vec<InsulatorIR>,
    /// Espaciador upstream (inyectado por insulation engine)
    pub upstream_spacer: Option<String>,
    /// Espaciador downstream (inyectado por insulation engine)
    pub downstream_spacer: Option<String>,
    /// Aislador ribosomal (RiboJ u otro)
    pub ribozyme_insulator: Option<String>,
    /// Metadatos adicionales
    pub metadata: HashMap<String, String>,
}

/// Terminador simple para inyección de aislamiento
#[derive(Debug, Clone)]
pub struct Terminator {
    pub name: String,
    pub sequence: String,
    pub efficiency: f64,
    pub bidirectional: bool,
    pub registry_id: Option<String>,
}

/// Promotor en IR
#[derive(Debug, Clone)]
pub struct PromoterIR {
    pub id: String,
    pub name: String,
    pub sequence: String,
    pub strength: f64,          // 0.0 - 1.0
    pub regulation: RegulationType,
    pub regulated_by: Vec<String>,
    pub delta_g: f64,           // Energía libre de plegamiento
}

#[derive(Debug, Clone)]
pub enum RegulationType {
    Constitutive,
    Inducible { inducer: String, k_half: f64 },
    Repressible { repressor: String, k_half: f64 },
    Hybrid { activators: Vec<String>, repressors: Vec<String> },
}

/// RBS en IR
#[derive(Debug, Clone)]
pub struct RbsIR {
    pub id: String,
    pub name: String,
    pub sequence: String,
    pub translation_rate: f64,  // Relativa, 0.0 - 1.0
    pub delta_g: f64,           // Energía libre
    pub shine_dalgarno: String, // Secuencia SD
    pub spacing: u32,           // Distancia al codón de inicio
}

/// Secuencia codificante
#[derive(Debug, Clone)]
pub struct CodingSequenceIR {
    pub id: String,
    pub name: String,
    pub dna_sequence: String,
    pub amino_sequence: String,
    pub protein: ProteinIR,
    pub codon_adaptation_index: f64,
}

/// Proteína resultante
#[derive(Debug, Clone)]
pub struct ProteinIR {
    pub name: String,
    pub molecular_weight_kda: f64,
    pub isoelectric_point: f64,
    pub half_life_minutes: f64,
    pub function: ProteinFunction,
    pub toxicity: ToxicityLevel,
    pub localization: CellularLocalization,
}

#[derive(Debug, Clone)]
pub enum ProteinFunction {
    Reporter,                   // GFP, RFP, etc.
    Enzyme { ec_number: String },
    Regulator(RegulatorType),
    Structural,
    Therapeutic { target: String },
    Custom(String),
}

#[derive(Debug, Clone)]
pub enum RegulatorType {
    Activator,
    Repressor,
    DualRegulator,
}

#[derive(Debug, Clone)]
pub enum ToxicityLevel {
    None,
    Low,
    Medium,
    High,
    Lethal,
}

#[derive(Debug, Clone)]
pub enum CellularLocalization {
    Cytoplasm,
    Membrane,
    Periplasm,
    Secreted,
    Nuclear,
}

/// Terminador en IR
#[derive(Debug, Clone)]
pub struct TerminatorIR {
    pub id: String,
    pub name: String,
    pub sequence: String,
    pub efficiency: f64,        // 0.0 - 1.0
    pub bidirectional: bool,
}

/// Aislador genético
#[derive(Debug, Clone)]
pub struct InsulatorIR {
    pub id: String,
    pub sequence: String,
    pub position: InsulatorPosition,
}

#[derive(Debug, Clone)]
pub enum InsulatorPosition {
    Upstream,
    Downstream,
    Between(String, String),
}

/// Enlace regulatorio entre partes
#[derive(Debug, Clone)]
pub struct RegulatoryLink {
    pub from: String,           // ID del regulador
    pub to: String,             // ID del regulado
    pub regulation_type: LinkType,
    pub strength: f64,          // Fuerza de la regulación
    pub hill_coefficient: f64,  // Cooperatividad
    pub k_half: f64,            // Concentración de media activación
}

#[derive(Debug, Clone)]
pub enum LinkType {
    Activation,
    Repression,
    Dual,
}

/// Biblioteca de partes biológicas
#[derive(Debug, Clone, Default)]
pub struct PartsLibrary {
    pub promoters: HashMap<String, PromoterIR>,
    pub rbs: HashMap<String, RbsIR>,
    pub terminators: HashMap<String, TerminatorIR>,
    pub proteins: HashMap<String, ProteinIR>,
}

impl PartsLibrary {
    /// Obtiene partes estándar predefinidas
    pub fn standard_library() -> Self {
        let mut lib = Self::default();
        
        // Promotores estándar
        lib.promoters.insert("pLac".to_string(), PromoterIR {
            id: "BBa_R0010".to_string(),
            name: "pLac".to_string(),
            sequence: "AATTGTGAGCGGATAACAATT".to_string(),
            strength: 0.7,
            regulation: RegulationType::Inducible {
                inducer: "IPTG".to_string(),
                k_half: 0.1,
            },
            regulated_by: vec!["LacI".to_string()],
            delta_g: -10.2,
        });
        
        lib.promoters.insert("pTet".to_string(), PromoterIR {
            id: "BBa_R0040".to_string(),
            name: "pTet".to_string(),
            sequence: "TCCCTATCAGTGATAGAGA".to_string(),
            strength: 0.8,
            regulation: RegulationType::Repressible {
                repressor: "TetR".to_string(),
                k_half: 0.05,
            },
            regulated_by: vec!["TetR".to_string()],
            delta_g: -9.8,
        });
        
        lib.promoters.insert("pBAD".to_string(), PromoterIR {
            id: "BBa_I0500".to_string(),
            name: "pBAD".to_string(),
            sequence: "ACATTGATTATTTGCACGGC".to_string(),
            strength: 0.9,
            regulation: RegulationType::Inducible {
                inducer: "Arabinose".to_string(),
                k_half: 0.2,
            },
            regulated_by: vec!["AraC".to_string()],
            delta_g: -8.5,
        });
        
        // RBS estándar
        lib.rbs.insert("rbs_strong".to_string(), RbsIR {
            id: "BBa_B0034".to_string(),
            name: "RBS Strong".to_string(),
            sequence: "AAAGAGGAGAAA".to_string(),
            translation_rate: 1.0,
            delta_g: -12.5,
            shine_dalgarno: "AGGAGG".to_string(),
            spacing: 6,
        });
        
        lib.rbs.insert("rbs_medium".to_string(), RbsIR {
            id: "BBa_B0032".to_string(),
            name: "RBS Medium".to_string(),
            sequence: "TCACACAGGAAAG".to_string(),
            translation_rate: 0.5,
            delta_g: -8.3,
            shine_dalgarno: "AGGAA".to_string(),
            spacing: 7,
        });
        
        // Terminadores
        lib.terminators.insert("term_T1".to_string(), TerminatorIR {
            id: "BBa_B0010".to_string(),
            name: "T1 Terminator".to_string(),
            sequence: "CCAGGCATCAAATAAAACGAAAGGCTCAGTCGAAAGACTGGGCCTTTCGTTTTATCTGTTGTTTGTCGGTGAACGCTCTC".to_string(),
            efficiency: 0.99,
            bidirectional: false,
        });
        
        // Proteínas
        lib.proteins.insert("GFP".to_string(), ProteinIR {
            name: "GFP".to_string(),
            molecular_weight_kda: 26.9,
            isoelectric_point: 6.0,
            half_life_minutes: 120.0,
            function: ProteinFunction::Reporter,
            toxicity: ToxicityLevel::Low,
            localization: CellularLocalization::Cytoplasm,
        });
        
        lib.proteins.insert("LacI".to_string(), ProteinIR {
            name: "LacI".to_string(),
            molecular_weight_kda: 38.6,
            isoelectric_point: 6.9,
            half_life_minutes: 60.0,
            function: ProteinFunction::Regulator(RegulatorType::Repressor),
            toxicity: ToxicityLevel::None,
            localization: CellularLocalization::Cytoplasm,
        });
        
        lib.proteins.insert("TetR".to_string(), ProteinIR {
            name: "TetR".to_string(),
            molecular_weight_kda: 23.4,
            isoelectric_point: 8.2,
            half_life_minutes: 45.0,
            function: ProteinFunction::Regulator(RegulatorType::Repressor),
            toxicity: ToxicityLevel::None,
            localization: CellularLocalization::Cytoplasm,
        });
        
        lib
    }
}

/// Análisis del circuito
#[derive(Debug, Clone)]
pub struct CircuitAnalysis {
    pub atp_consumption: f64,
    pub estimated_burden: f64,          // Carga metabólica
    pub thermodynamic_stability: bool,
    pub toxicity_warnings: Vec<String>,
    pub compatibility_issues: Vec<String>,
    pub optimization_suggestions: Vec<String>,
}

impl GeneticCircuit {
    /// Calcula el costo de ATP estimado
    pub fn calculate_atp_cost(&self) -> f64 {
        let mut cost = 0.0;
        
        for tu in &self.transcription_units {
            // Costo de transcripción
            let transcript_length: usize = tu.promoter.sequence.len()
                + tu.rbs.sequence.len()
                + tu.coding_sequences.iter().map(|c| c.dna_sequence.len()).sum::<usize>()
                + tu.terminator.as_ref().map(|t| t.sequence.len()).unwrap_or(0);
            
            cost += transcript_length as f64 * 2.0; // ~2 ATP por nucleótido
            
            // Costo de traducción
            for cds in &tu.coding_sequences {
                let aa_count = cds.amino_sequence.len();
                cost += aa_count as f64 * 4.0; // ~4 ATP por aminoácido
            }
            
            // Ajustar por fuerza del promotor
            cost *= tu.promoter.strength;
        }
        
        cost
    }
    
    /// Analiza el circuito para problemas
    pub fn analyze(&self) -> CircuitAnalysis {
        let mut warnings = Vec::new();
        let issues = Vec::new();
        let mut suggestions = Vec::new();
        
        // Verificar toxicidad
        for tu in &self.transcription_units {
            for cds in &tu.coding_sequences {
                if matches!(cds.protein.toxicity, ToxicityLevel::High | ToxicityLevel::Lethal) {
                    warnings.push(format!(
                        "Proteína {} tiene alta toxicidad",
                        cds.protein.name
                    ));
                    
                    if !self.is_contained {
                        suggestions.push(format!(
                            "Considerar usar 'safe circuit' con kill_switch para {}",
                            cds.protein.name
                        ));
                    }
                }
            }
        }
        
        // Verificar compatibilidad de partes
        for _link in &self.regulatory_links {
            // TODO: Verificar que el regulador puede actuar sobre el regulado
        }
        
        // Verificar estabilidad termodinámica
        let mut thermodynamic_stable = true;
        for tu in &self.transcription_units {
            if tu.rbs.delta_g > -5.0 {
                warnings.push(format!(
                    "RBS {} puede tener plegamiento ineficiente (ΔG = {} kcal/mol)",
                    tu.rbs.name, tu.rbs.delta_g
                ));
                thermodynamic_stable = false;
            }
        }
        
        CircuitAnalysis {
            atp_consumption: self.calculate_atp_cost(),
            estimated_burden: self.estimated_atp_cost / 100.0, // Normalizado
            thermodynamic_stability: thermodynamic_stable,
            toxicity_warnings: warnings,
            compatibility_issues: issues,
            optimization_suggestions: suggestions,
        }
    }
}
