#![allow(dead_code)]
//! Biological Type System for BioScript
//!
//! A first-class type system designed for synthetic biology programming.
//! This is not a toy — it models real biological constraints:
//!
//! - **Part Types**: Promoter, RBS, CDS, Terminator, Operator, Insulator, Origin, SelectionMarker
//!   as first-class types with parametric attributes (strength, regulation, efficiency)
//! - **Host Types**: Host<Ecoli_K12>, Host<Saccharomyces>, Host<Bacillus> with codon tables
//!   and organism-specific constraints
//! - **Sequence Types**: DNA<5'→3'>, DNA<3'→5'>, RNA, AminoAcid with typed operations
//!   (complement, transcribe, translate) — the compiler rejects invalid transformations
//! - **Measurement Types**: OD600, RFU, RPU, Molar, nM, µM — dimensional analysis prevents
//!   mixing incompatible units
//! - **Interaction Types**: Activation, Repression, Phosphorylation — the compiler verifies
//!   circuit coherence
//!
//! Without this type system, BioScript is just a pretty scripting language.
//! With it, BioScript is a real synthetic biology programming language.

use std::collections::HashMap;
use std::fmt;

// ═══════════════════════════════════════════════════════════════════════════════
//  CORE BIOLOGICAL TYPE
// ═══════════════════════════════════════════════════════════════════════════════

/// The unified biological type — every expression in BioScript has one.
#[derive(Debug, Clone, PartialEq)]
pub enum BioType {
    // ── Primitives ──
    Int,
    Float,
    Bool,
    Str,
    Void,

    // ── Biological Part Types (first-class) ──
    Part(PartType),

    // ── Host/Organism Types (parametric) ──
    Host(Organism),

    // ── Sequence Types (directional) ──
    Sequence(SequenceType),

    // ── Measurement Types (unit-checked) ──
    Measurement(MeasurementType),

    // ── Interaction Types ──
    Interaction(InteractionType),

    // ── Composite Types ──
    Gene {
        host: Option<Organism>,
        parts: Vec<PartType>,
    },
    Circuit {
        host: Option<Organism>,
        genes: Vec<String>,
        interactions: Vec<InteractionType>,
    },
    TranscriptionUnit {
        promoter: Option<Box<PartType>>,
        rbs: Option<Box<PartType>>,
        cds: Option<Box<PartType>>,
        terminator: Option<Box<PartType>>,
    },

    // ── Container Types ──
    Array(Box<BioType>),
    Map(Box<BioType>, Box<BioType>),
    Optional(Box<BioType>),

    // ── Struct instances ──
    Struct(String),

    // ── Logic gate types ──
    Gate(GateType),

    // ── Security-tagged types ──
    /// A type that has been flagged by the Select Agent checker
    Restricted {
        inner: Box<BioType>,
        restriction: SecurityRestriction,
    },

    // ── Type variables (for inference) ──
    TypeVar(u32),

    // ── Unknown / not yet resolved ──
    Unknown,

    // ── Error sentinel (propagates without cascading errors) ──
    Error,
}

// ═══════════════════════════════════════════════════════════════════════════════
//  PART TYPES — First-class biological parts
// ═══════════════════════════════════════════════════════════════════════════════

/// A fully-typed biological part with parametric attributes.
/// This is NOT a string — it's a type-checked, parameterized construct.
#[derive(Debug, Clone, PartialEq)]
pub enum PartType {
    Promoter(PromoterType),
    RBS(RBSType),
    CDS(CDSType),
    Terminator(TerminatorType),
    Operator(OperatorType),
    Insulator(InsulatorType),
    Origin(OriginType),
    SelectionMarker(SelectionMarkerType),
    Reporter(ReporterType),
    Regulator(RegulatorType),
}

/// Promoter: drives transcription. Has strength, regulation type, and inducers.
#[derive(Debug, Clone, PartialEq)]
pub struct PromoterType {
    pub strength: PromoterStrength,
    pub regulation: RegulationKind,
    pub inducers: Vec<String>,
    pub host_range: Vec<Organism>,
    pub directionality: Directionality,
}

#[derive(Debug, Clone, PartialEq)]
pub enum PromoterStrength {
    Weak,       // < 0.1 RPU
    Medium,     // 0.1-1.0 RPU
    Strong,     // 1.0-10.0 RPU
    VeryStrong, // > 10.0 RPU
    Quantified(f64), // Exact RPU value
    Unknown,
}

#[derive(Debug, Clone, PartialEq)]
pub enum RegulationKind {
    Constitutive,
    Inducible,     // IPTG, aTc, arabinose, etc.
    Repressible,   // LacI, TetR, CI, etc.
    Bidirectional,
    LightInducible,
    TemperatureSensitive,
    QuorumSensing,
    Unknown,
}

/// RBS: Ribosome Binding Site. Controls translation initiation rate.
#[derive(Debug, Clone, PartialEq)]
pub struct RBSType {
    pub translation_rate: TranslationRate,
    pub spacing: Option<u32>,  // nt spacing to start codon
    pub host_compatibility: Vec<Organism>,
}

#[derive(Debug, Clone, PartialEq)]
pub enum TranslationRate {
    Weak,       // < 100 au
    Medium,     // 100-1000 au
    Strong,     // 1000-10000 au
    VeryStrong, // > 10000 au
    Quantified(f64), // Exact au
    Unknown,
}

/// CDS: Coding Sequence. The actual gene that gets translated.
#[derive(Debug, Clone, PartialEq)]
pub struct CDSType {
    pub protein_function: ProteinFunction,
    pub codon_optimized_for: Option<Organism>,
    pub molecular_weight_kda: Option<f64>,
    pub toxicity: ToxicityLevel,
    pub localization: CellularLocalization,
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub enum ProteinFunction {
    Reporter,     // GFP, RFP, mCherry, etc.
    Regulator,    // LacI, TetR, CI, etc.
    Enzyme,       // CAS9, restriction enzymes, etc.
    Structural,   // Membrane proteins, etc.
    Transporter,  // Efflux pumps, channels
    Toxin,        // CcdB, RelE, etc.
    Antitoxin,    // CcdA, RelB, etc.
    Recombinase,  // Cre, Flp, PhiC31
    Unknown,
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub enum ToxicityLevel {
    None,
    Low,
    Medium,
    High,
    Lethal,
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub enum CellularLocalization {
    Cytoplasmic,
    Membrane,
    Periplasmic,
    Secreted,
    Nuclear,     // Eukaryotic
    Unknown,
}

/// Terminator: stops transcription.
#[derive(Debug, Clone, PartialEq)]
pub struct TerminatorType {
    pub efficiency: TerminatorEfficiency,
    pub terminator_class: TerminatorClass,
}

#[derive(Debug, Clone, PartialEq)]
pub enum TerminatorEfficiency {
    Low,          // < 80%
    Medium,       // 80-95%
    High,         // 95-99%
    Perfect,      // > 99%
    Quantified(f64), // Exact percentage
    Unknown,
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub enum TerminatorClass {
    Intrinsic,      // Rho-independent (hairpin-based)
    RhoDependent,   // Rho-dependent
    Bidirectional,  // Works in both directions
    Synthetic,      // Engineered
    Unknown,
}

/// Operator: DNA binding site for regulatory proteins.
#[derive(Debug, Clone, PartialEq)]
pub struct OperatorType {
    pub binding_protein: Option<String>,
    pub operator_class: OperatorClass,
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub enum OperatorClass {
    Repressor,   // lacO, tetO
    Activator,   // araI
    Dual,        // Can be both
    Unknown,
}

/// Insulator: prevents crosstalk between genetic modules.
#[derive(Debug, Clone, PartialEq)]
pub struct InsulatorType {
    pub insulation_strength: f64,  // 0.0-1.0, higher = better isolation
    pub mechanism: InsulationMechanism,
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub enum InsulationMechanism {
    Ribozyme,       // Self-cleaving ribozyme (RiboJ)
    Spacer,         // Neutral DNA spacer
    Terminator,     // Terminator used as insulator
    ChromatinBarrier, // Eukaryotic
    Unknown,
}

/// Origin of replication.
#[derive(Debug, Clone, PartialEq)]
pub struct OriginType {
    pub copy_number: CopyNumber,
    pub host_range: Vec<Organism>,
    pub incompatibility_group: Option<String>,
}

#[derive(Debug, Clone, PartialEq)]
pub enum CopyNumber {
    Low,        // 1-5 copies (pSC101)
    Medium,     // 15-20 copies (p15A)
    High,       // 100-300 copies (pUC)
    VeryHigh,   // 300-700 copies (pMB1 derivative)
    Quantified(u32),
    Unknown,
}

/// Selection marker (antibiotic resistance, auxotrophy complement).
#[derive(Debug, Clone, PartialEq)]
pub struct SelectionMarkerType {
    pub marker_class: MarkerClass,
    pub resistance_to: Option<String>,
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub enum MarkerClass {
    AntibioticResistance,  // AmpR, KanR, CmR, etc.
    Auxotrophy,            // URA3, LEU2, etc.
    Fluorescent,           // GFP as selection
    Toxin,                 // CcdB negative selection
    Unknown,
}

/// Reporter protein (GFP, RFP, luciferase, etc.)
#[derive(Debug, Clone, PartialEq)]
pub struct ReporterType {
    pub reporter_class: ReporterClass,
    pub excitation_nm: Option<u32>,
    pub emission_nm: Option<u32>,
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub enum ReporterClass {
    Fluorescent,     // GFP, RFP, mCherry, BFP, YFP
    Luminescent,     // Luciferase
    Colorimetric,    // LacZ (β-galactosidase)
    Enzymatic,       // CAT, etc.
    Unknown,
}

/// Regulatory protein type
#[derive(Debug, Clone, PartialEq)]
pub struct RegulatorType {
    pub regulator_class: RegulatorClass,
    pub targets: Vec<String>,
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub enum RegulatorClass {
    Activator,
    Repressor,
    DualFunction,
    Sigma,           // Sigma factor
    AntiSigma,
    Unknown,
}

// ═══════════════════════════════════════════════════════════════════════════════
//  HOST/ORGANISM TYPES
// ═══════════════════════════════════════════════════════════════════════════════

/// Organism type — the compiler knows codon tables, restrictions, and
/// growth parameters for each host.
#[derive(Debug, Clone, PartialEq)]
pub enum Organism {
    // E. coli strains — the workhorse of synbio
    EcoliK12,
    EcoliDH5Alpha,
    EcoliBL21,
    EcoliMG1655,
    EcoliNissle1917,  // Probiotic strain

    // Yeast
    Saccharomyces,     // S. cerevisiae
    Pichia,            // P. pastoris (protein expression)
    Kluyveromyces,     // K. lactis

    // Bacillus
    BacillusSubtilis,
    BacillusMegaterium,

    // Other bacteria
    Pseudomonas,       // P. putida (metabolic engineering)
    Corynebacterium,   // C. glutamicum (amino acid production)
    Streptomyces,      // Natural product biosynthesis
    Vibrio,            // V. natriegens (fast growth)
    Caulobacter,       // C. crescentus

    // Mammalian
    CHO,               // Chinese Hamster Ovary
    HEK293,            // Human Embryonic Kidney

    // Plant
    Arabidopsis,
    Nicotiana,         // N. benthamiana

    // Cell-free
    CellFree,          // TX-TL / PURExpress

    // Custom / unknown
    Custom(String),
    Unknown,
}

impl Organism {
    /// Returns the optimal GC content range for this organism.
    pub fn gc_range(&self) -> (f64, f64) {
        match self {
            Self::EcoliK12 | Self::EcoliDH5Alpha | Self::EcoliBL21 |
            Self::EcoliMG1655 | Self::EcoliNissle1917 => (0.45, 0.55),
            Self::Saccharomyces => (0.35, 0.45),
            Self::Pichia => (0.40, 0.50),
            Self::BacillusSubtilis => (0.40, 0.50),
            Self::Pseudomonas => (0.55, 0.65),
            Self::Streptomyces => (0.65, 0.75),
            Self::Corynebacterium => (0.50, 0.60),
            Self::CHO | Self::HEK293 => (0.45, 0.60),
            _ => (0.35, 0.65),
        }
    }

    /// Returns the growth rate (doublings/hour) at optimal conditions.
    pub fn growth_rate(&self) -> f64 {
        match self {
            Self::Vibrio => 4.4,          // ~10 min doubling
            Self::EcoliK12 | Self::EcoliMG1655 => 2.0,  // ~20 min
            Self::EcoliBL21 => 1.7,
            Self::EcoliDH5Alpha => 1.5,
            Self::BacillusSubtilis => 2.0,
            Self::Pseudomonas => 1.5,
            Self::Saccharomyces => 0.5,   // ~90 min
            Self::Pichia => 0.4,
            Self::CHO | Self::HEK293 => 0.04,  // ~18h
            Self::CellFree => 0.0,        // No growth
            _ => 1.0,
        }
    }

    /// Returns biosafety level requirement.
    pub fn biosafety_level(&self) -> u8 {
        match self {
            Self::EcoliK12 | Self::EcoliDH5Alpha | Self::EcoliBL21 |
            Self::EcoliMG1655 | Self::Saccharomyces | Self::BacillusSubtilis |
            Self::CellFree | Self::Pichia => 1,
            Self::EcoliNissle1917 | Self::Pseudomonas | Self::Corynebacterium |
            Self::Vibrio | Self::CHO | Self::HEK293 => 1,
            _ => 1,
        }
    }

    /// Top codon preferences for this organism (amino acid → preferred codons).
    pub fn preferred_codons(&self) -> HashMap<char, Vec<&'static str>> {
        let mut table = HashMap::new();
        match self {
            Self::EcoliK12 | Self::EcoliDH5Alpha | Self::EcoliBL21 |
            Self::EcoliMG1655 | Self::EcoliNissle1917 => {
                // E. coli codon preferences
                table.insert('A', vec!["GCG", "GCC"]);       // Ala
                table.insert('R', vec!["CGC", "CGT"]);       // Arg
                table.insert('N', vec!["AAC"]);              // Asn
                table.insert('D', vec!["GAT"]);              // Asp
                table.insert('C', vec!["TGC"]);              // Cys
                table.insert('Q', vec!["CAG"]);              // Gln
                table.insert('E', vec!["GAA"]);              // Glu
                table.insert('G', vec!["GGC", "GGT"]);      // Gly
                table.insert('H', vec!["CAT"]);              // His
                table.insert('I', vec!["ATT", "ATC"]);       // Ile
                table.insert('L', vec!["CTG"]);              // Leu
                table.insert('K', vec!["AAA"]);              // Lys
                table.insert('M', vec!["ATG"]);              // Met (start)
                table.insert('F', vec!["TTT"]);              // Phe
                table.insert('P', vec!["CCG"]);              // Pro
                table.insert('S', vec!["AGC", "TCT"]);       // Ser
                table.insert('T', vec!["ACC", "ACT"]);       // Thr
                table.insert('W', vec!["TGG"]);              // Trp
                table.insert('Y', vec!["TAT"]);              // Tyr
                table.insert('V', vec!["GTG", "GTT"]);       // Val
            }
            Self::Saccharomyces => {
                // S. cerevisiae codon preferences
                table.insert('A', vec!["GCT"]);
                table.insert('R', vec!["AGA"]);
                table.insert('N', vec!["AAT"]);
                table.insert('D', vec!["GAT"]);
                table.insert('C', vec!["TGT"]);
                table.insert('Q', vec!["CAA"]);
                table.insert('E', vec!["GAA"]);
                table.insert('G', vec!["GGT"]);
                table.insert('H', vec!["CAT"]);
                table.insert('I', vec!["ATT"]);
                table.insert('L', vec!["TTG"]);
                table.insert('K', vec!["AAG"]);
                table.insert('M', vec!["ATG"]);
                table.insert('F', vec!["TTT"]);
                table.insert('P', vec!["CCA"]);
                table.insert('S', vec!["TCT"]);
                table.insert('T', vec!["ACT"]);
                table.insert('W', vec!["TGG"]);
                table.insert('Y', vec!["TAT"]);
                table.insert('V', vec!["GTT"]);
            }
            Self::BacillusSubtilis => {
                // B. subtilis — AT-rich preference
                table.insert('A', vec!["GCT", "GCA"]);
                table.insert('R', vec!["AGA", "CGT"]);
                table.insert('L', vec!["TTA", "CTT"]);
                table.insert('K', vec!["AAA"]);
                table.insert('E', vec!["GAA"]);
                table.insert('G', vec!["GGA", "GGT"]);
                table.insert('I', vec!["ATT"]);
                table.insert('M', vec!["ATG"]);
            }
            _ => {
                // Default / universal codons
                table.insert('M', vec!["ATG"]);
                table.insert('W', vec!["TGG"]);
            }
        }
        table
    }

    /// Display name for the organism
    pub fn display_name(&self) -> &str {
        match self {
            Self::EcoliK12 => "E. coli K-12",
            Self::EcoliDH5Alpha => "E. coli DH5α",
            Self::EcoliBL21 => "E. coli BL21(DE3)",
            Self::EcoliMG1655 => "E. coli MG1655",
            Self::EcoliNissle1917 => "E. coli Nissle 1917",
            Self::Saccharomyces => "S. cerevisiae",
            Self::Pichia => "P. pastoris",
            Self::Kluyveromyces => "K. lactis",
            Self::BacillusSubtilis => "B. subtilis",
            Self::BacillusMegaterium => "B. megaterium",
            Self::Pseudomonas => "P. putida",
            Self::Corynebacterium => "C. glutamicum",
            Self::Streptomyces => "Streptomyces sp.",
            Self::Vibrio => "V. natriegens",
            Self::Caulobacter => "C. crescentus",
            Self::CHO => "CHO cells",
            Self::HEK293 => "HEK293T",
            Self::Arabidopsis => "A. thaliana",
            Self::Nicotiana => "N. benthamiana",
            Self::CellFree => "Cell-free TX-TL",
            Self::Custom(name) => name.as_str(),
            Self::Unknown => "Unknown organism",
        }
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
//  SEQUENCE TYPES — With directionality
// ═══════════════════════════════════════════════════════════════════════════════

/// Sequence type with directionality — you can't accidentally complement
/// in the wrong direction.
#[derive(Debug, Clone, PartialEq)]
pub enum SequenceType {
    DNA(Directionality),
    RNA(RNAKind),
    AminoAcid,
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub enum Directionality {
    FivePrimeToThreePrime,    // 5'→3' (sense strand)
    ThreePrimeToFivePrime,    // 3'→5' (antisense strand)
    DoubleStranded,           // Both strands
    Unknown,
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub enum RNAKind {
    MRNA,         // Messenger RNA
    TRNA,         // Transfer RNA
    RRNA,         // Ribosomal RNA
    SgRNA,        // Single-guide RNA (CRISPR)
    SiRNA,        // Small interfering RNA
    MiRNA,        // MicroRNA
    Ribozyme,     // Catalytic RNA
    Generic,      // Unspecified
}

impl SequenceType {
    /// Check if a sequence operation is valid.
    /// complement: DNA<5'→3'> → DNA<3'→5'>  ✓
    /// complement: RNA → ERROR               ✗ (RNA doesn't have a complement in the same sense)
    /// transcribe: DNA<5'→3'> → RNA<mRNA>    ✓ (template strand produces mRNA)
    /// transcribe: AminoAcid → ERROR         ✗ (can't transcribe proteins)
    /// translate: RNA<mRNA> → AminoAcid      ✓
    /// translate: DNA → ERROR                ✗ (must transcribe first)
    pub fn can_complement(&self) -> Result<SequenceType, String> {
        match self {
            SequenceType::DNA(Directionality::FivePrimeToThreePrime) =>
                Ok(SequenceType::DNA(Directionality::ThreePrimeToFivePrime)),
            SequenceType::DNA(Directionality::ThreePrimeToFivePrime) =>
                Ok(SequenceType::DNA(Directionality::FivePrimeToThreePrime)),
            SequenceType::DNA(Directionality::DoubleStranded) =>
                Ok(SequenceType::DNA(Directionality::DoubleStranded)),
            SequenceType::DNA(Directionality::Unknown) =>
                Ok(SequenceType::DNA(Directionality::Unknown)),
            SequenceType::RNA(_) =>
                Err("No se puede complementar RNA directamente. Usa reverse_complement() para obtener DNA complementario.".into()),
            SequenceType::AminoAcid =>
                Err("No se puede complementar una secuencia de aminoácidos.".into()),
        }
    }

    pub fn can_transcribe(&self) -> Result<SequenceType, String> {
        match self {
            SequenceType::DNA(_) => Ok(SequenceType::RNA(RNAKind::MRNA)),
            SequenceType::RNA(_) =>
                Err("No se puede transcribir RNA. RNA ya es un producto de transcripción.".into()),
            SequenceType::AminoAcid =>
                Err("No se puede transcribir aminoácidos. La transcripción convierte DNA → RNA.".into()),
        }
    }

    pub fn can_translate(&self) -> Result<SequenceType, String> {
        match self {
            SequenceType::RNA(RNAKind::MRNA) | SequenceType::RNA(RNAKind::Generic) =>
                Ok(SequenceType::AminoAcid),
            SequenceType::RNA(kind) =>
                Err(format!("Solo mRNA puede traducirse. {:?} no es traducible.", kind)),
            SequenceType::DNA(_) =>
                Err("No se puede traducir DNA directamente. Primero transcribe a mRNA: transcribe(dna)".into()),
            SequenceType::AminoAcid =>
                Err("Los aminoácidos ya son el producto de traducción.".into()),
        }
    }

    pub fn can_reverse_transcribe(&self) -> Result<SequenceType, String> {
        match self {
            SequenceType::RNA(_) => Ok(SequenceType::DNA(Directionality::FivePrimeToThreePrime)),
            SequenceType::DNA(_) =>
                Err("DNA no necesita transcripción reversa — ya es DNA.".into()),
            SequenceType::AminoAcid =>
                Err("No se puede hacer transcripción reversa de aminoácidos.".into()),
        }
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
//  MEASUREMENT TYPES — Dimensional analysis
// ═══════════════════════════════════════════════════════════════════════════════

/// Measurement type with physical dimensions.
/// The compiler ensures you never mix OD600 with RPU with nM.
#[derive(Debug, Clone, PartialEq)]
pub enum MeasurementType {
    // Concentration
    Molar,
    MilliMolar,
    MicroMolar,
    NanoMolar,
    PicoMolar,

    // Optical density
    OD600,
    OD280,

    // Fluorescence
    RFU,       // Relative Fluorescence Units
    MFI,       // Mean Fluorescence Intensity

    // Promoter activity
    RPU,       // Relative Promoter Units
    MEFL,      // Molecules of Equivalent Fluorescein

    // Mass
    Daltons,
    KiloDaltons,
    Picograms,
    Nanograms,
    Micrograms,
    Milligrams,
    Grams,

    // Volume
    Picoliters,
    Nanoliters,
    Microliters,
    Milliliters,
    Liters,

    // Length (genetic)
    BasePairs,
    Kilobases,
    Megabases,

    // Temperature
    Celsius,
    Kelvin,

    // Time
    Seconds,
    Minutes,
    Hours,

    // Rate
    DoublingsPerHour,
    BasePairsPerSecond,  // Polymerase speed

    // Percentage / dimensionless
    Percent,
    Fold,
    ArbitraryUnits,

    // Energy
    KCalPerMol,
    KJPerMol,
}

/// Dimension categories for unit compatibility checking.
#[derive(Debug, Clone, Copy, PartialEq)]
pub enum Dimension {
    Concentration,
    OpticalDensity,
    Fluorescence,
    PromoterActivity,
    Mass,
    Volume,
    Length,
    Temperature,
    Time,
    Rate,
    Dimensionless,
    Energy,
}

impl MeasurementType {
    /// Get the dimension of this measurement type.
    pub fn dimension(&self) -> Dimension {
        match self {
            Self::Molar | Self::MilliMolar | Self::MicroMolar |
            Self::NanoMolar | Self::PicoMolar => Dimension::Concentration,

            Self::OD600 | Self::OD280 => Dimension::OpticalDensity,

            Self::RFU | Self::MFI => Dimension::Fluorescence,

            Self::RPU | Self::MEFL => Dimension::PromoterActivity,

            Self::Daltons | Self::KiloDaltons | Self::Picograms |
            Self::Nanograms | Self::Micrograms | Self::Milligrams |
            Self::Grams => Dimension::Mass,

            Self::Picoliters | Self::Nanoliters | Self::Microliters |
            Self::Milliliters | Self::Liters => Dimension::Volume,

            Self::BasePairs | Self::Kilobases | Self::Megabases => Dimension::Length,

            Self::Celsius | Self::Kelvin => Dimension::Temperature,

            Self::Seconds | Self::Minutes | Self::Hours => Dimension::Time,

            Self::DoublingsPerHour | Self::BasePairsPerSecond => Dimension::Rate,

            Self::Percent | Self::Fold | Self::ArbitraryUnits => Dimension::Dimensionless,

            Self::KCalPerMol | Self::KJPerMol => Dimension::Energy,
        }
    }

    /// Check if two measurement types are compatible (same dimension).
    pub fn is_compatible_with(&self, other: &MeasurementType) -> bool {
        self.dimension() == other.dimension()
    }

    /// Get the conversion factor to the base unit of this dimension.
    /// Returns None if no standard conversion exists.
    pub fn to_base_factor(&self) -> Option<f64> {
        match self {
            // Concentration → Molar
            Self::Molar => Some(1.0),
            Self::MilliMolar => Some(1e-3),
            Self::MicroMolar => Some(1e-6),
            Self::NanoMolar => Some(1e-9),
            Self::PicoMolar => Some(1e-12),

            // Mass → Daltons
            Self::Daltons => Some(1.0),
            Self::KiloDaltons => Some(1000.0),
            Self::Picograms => Some(6.022e11),   // pg to Da conversion
            Self::Nanograms => Some(6.022e14),
            Self::Micrograms => Some(6.022e17),
            Self::Milligrams => Some(6.022e20),
            Self::Grams => Some(6.022e23),       // = Avogadro

            // Volume → Liters
            Self::Picoliters => Some(1e-12),
            Self::Nanoliters => Some(1e-9),
            Self::Microliters => Some(1e-6),
            Self::Milliliters => Some(1e-3),
            Self::Liters => Some(1.0),

            // Length → BasePairs
            Self::BasePairs => Some(1.0),
            Self::Kilobases => Some(1000.0),
            Self::Megabases => Some(1_000_000.0),

            // Time → Seconds
            Self::Seconds => Some(1.0),
            Self::Minutes => Some(60.0),
            Self::Hours => Some(3600.0),

            // Temperature (special — offset, not factor)
            Self::Celsius => Some(1.0),
            Self::Kelvin => Some(1.0),  // Needs offset -273.15

            // Others — no standard conversion
            _ => None,
        }
    }

    /// Display name
    pub fn display_name(&self) -> &str {
        match self {
            Self::Molar => "M",
            Self::MilliMolar => "mM",
            Self::MicroMolar => "µM",
            Self::NanoMolar => "nM",
            Self::PicoMolar => "pM",
            Self::OD600 => "OD₆₀₀",
            Self::OD280 => "OD₂₈₀",
            Self::RFU => "RFU",
            Self::MFI => "MFI",
            Self::RPU => "RPU",
            Self::MEFL => "MEFL",
            Self::Daltons => "Da",
            Self::KiloDaltons => "kDa",
            Self::Picograms => "pg",
            Self::Nanograms => "ng",
            Self::Micrograms => "µg",
            Self::Milligrams => "mg",
            Self::Grams => "g",
            Self::Picoliters => "pL",
            Self::Nanoliters => "nL",
            Self::Microliters => "µL",
            Self::Milliliters => "mL",
            Self::Liters => "L",
            Self::BasePairs => "bp",
            Self::Kilobases => "kb",
            Self::Megabases => "Mb",
            Self::Celsius => "°C",
            Self::Kelvin => "K",
            Self::Seconds => "s",
            Self::Minutes => "min",
            Self::Hours => "h",
            Self::DoublingsPerHour => "dbl/h",
            Self::BasePairsPerSecond => "bp/s",
            Self::Percent => "%",
            Self::Fold => "fold",
            Self::ArbitraryUnits => "AU",
            Self::KCalPerMol => "kcal/mol",
            Self::KJPerMol => "kJ/mol",
        }
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
//  INTERACTION TYPES — Circuit coherence verification
// ═══════════════════════════════════════════════════════════════════════════════

/// Types of biological interactions between parts.
/// The compiler verifies that interactions in a circuit are coherent.
#[derive(Debug, Clone, PartialEq)]
pub enum InteractionType {
    /// Protein activates transcription from a promoter
    Activation {
        activator: String,
        target_promoter: String,
        strength: Option<f64>,   // Hill coefficient
    },
    /// Protein represses transcription from a promoter
    Repression {
        repressor: String,
        target_promoter: String,
        strength: Option<f64>,
    },
    /// Small molecule induces conformational change
    Induction {
        inducer: String,
        target_protein: String,
        concentration: Option<f64>, // µM
    },
    /// Phosphorylation cascade
    Phosphorylation {
        kinase: String,
        substrate: String,
    },
    /// Protein degradation
    Degradation {
        protease: String,
        target: String,
        tag: Option<String>,     // e.g., "ssrA" for ClpXP
    },
    /// CRISPR-based regulation
    CRISPRRegulation {
        guide_rna: String,
        target_gene: String,
        cas_variant: CasVariant,
    },
    /// Quorum sensing
    QuorumSensing {
        signal_molecule: String,
        receptor: String,
        threshold: Option<f64>,  // nM
    },
    /// Generic binding (protein-DNA, protein-protein, etc.)
    Binding {
        molecule_a: String,
        molecule_b: String,
        kd: Option<f64>,         // Dissociation constant (nM)
    },
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub enum CasVariant {
    Cas9,     // Cutting
    DCas9,    // Dead Cas9 (CRISPRi/CRISPRa)
    Cas12a,   // Cpf1
    Cas13,    // RNA targeting
}

// ═══════════════════════════════════════════════════════════════════════════════
//  GATE TYPES
// ═══════════════════════════════════════════════════════════════════════════════

#[derive(Debug, Clone, Copy, PartialEq)]
pub enum GateType {
    And,
    Or,
    Not,
    Nor,
    Nand,
    Xor,
    Buffer,
    Inverter,
}

// ═══════════════════════════════════════════════════════════════════════════════
//  SECURITY RESTRICTIONS
// ═══════════════════════════════════════════════════════════════════════════════

/// Security restriction attached to types flagged by the biosecurity checker.
#[derive(Debug, Clone, PartialEq)]
pub struct SecurityRestriction {
    pub level: BiosecurityLevel,
    pub reason: String,
    pub regulation: String,
    pub blocked: bool,
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub enum BiosecurityLevel {
    BSL1,        // Standard microbiological practices
    BSL2,        // Moderate risk (common pathogens)
    BSL3,        // Serious/lethal disease (aerosol transmission)
    BSL4,        // Exotic agents with no treatment
    SelectAgent, // CDC/APHIS Select Agent — COMPILATION BLOCKED
}

// ═══════════════════════════════════════════════════════════════════════════════
//  TYPE COMPATIBILITY & CHECKING
// ═══════════════════════════════════════════════════════════════════════════════

impl BioType {
    /// Check if a value of type `self` can be assigned to a variable of type `target`.
    pub fn is_assignable_to(&self, target: &BioType) -> bool {
        if self == target {
            return true;
        }
        match (self, target) {
            // Error and Unknown are universal
            (BioType::Error, _) | (_, BioType::Error) => true,
            (BioType::Unknown, _) | (_, BioType::Unknown) => true,

            // Int → Float promotion
            (BioType::Int, BioType::Float) => true,

            // Part subtyping: any part is assignable to Gene context
            (BioType::Part(_), BioType::Gene { .. }) => true,

            // Sequence subtyping: DNA with any directionality assignable to generic DNA
            (BioType::Sequence(SequenceType::DNA(_)), BioType::Sequence(SequenceType::DNA(Directionality::Unknown))) => true,

            // Measurement compatibility: same dimension
            (BioType::Measurement(a), BioType::Measurement(b)) => a.is_compatible_with(b),

            // Array covariance
            (BioType::Array(a), BioType::Array(b)) => a.is_assignable_to(b),

            _ => false,
        }
    }

    /// Check if two parts can be connected with the `->` (genetic flow) operator.
    pub fn can_connect_to(&self, target: &BioType) -> Result<(), String> {
        match (self, target) {
            // Standard TU connections
            (BioType::Part(PartType::Promoter(_)), BioType::Part(PartType::RBS(_))) => Ok(()),
            (BioType::Part(PartType::Promoter(_)), BioType::Part(PartType::CDS(_))) => Ok(()),
            (BioType::Part(PartType::RBS(_)), BioType::Part(PartType::CDS(_))) => Ok(()),
            (BioType::Part(PartType::CDS(_)), BioType::Part(PartType::Terminator(_))) => Ok(()),

            // Insulator connections (can go between anything)
            (BioType::Part(PartType::Insulator(_)), BioType::Part(_)) => Ok(()),
            (BioType::Part(_), BioType::Part(PartType::Insulator(_))) => Ok(()),

            // Operator connections
            (BioType::Part(PartType::Operator(_)), BioType::Part(PartType::Promoter(_))) => Ok(()),
            (BioType::Part(PartType::Promoter(_)), BioType::Part(PartType::Operator(_))) => Ok(()),

            // Reporter after RBS
            (BioType::Part(PartType::RBS(_)), BioType::Part(PartType::Reporter(_))) => Ok(()),

            // Unknown/error — allow
            (BioType::Unknown, _) | (_, BioType::Unknown) |
            (BioType::Error, _) | (_, BioType::Error) => Ok(()),

            _ => Err(format!(
                "Conexión inválida: {} → {}. Las conexiones genéticas deben seguir el orden Promoter → RBS → CDS → Terminator.",
                self.display_name(), target.display_name()
            )),
        }
    }

    /// Check host compatibility for a part used in a specific organism.
    pub fn check_host_compatibility(&self, host: &Organism) -> Vec<String> {
        let mut warnings = Vec::new();

        if let BioType::Part(part) = self {
            match part {
                PartType::Promoter(p) => {
                    if !p.host_range.is_empty() && !p.host_range.contains(host) {
                        warnings.push(format!(
                            "Promotor no verificado para {}. Hosts compatibles: {:?}",
                            host.display_name(),
                            p.host_range.iter().map(|o| o.display_name()).collect::<Vec<_>>()
                        ));
                    }
                }
                PartType::Origin(o) => {
                    if !o.host_range.is_empty() && !o.host_range.contains(host) {
                        warnings.push(format!(
                            "Origen de replicación no compatible con {}.",
                            host.display_name()
                        ));
                    }
                }
                PartType::RBS(r) => {
                    if !r.host_compatibility.is_empty() && !r.host_compatibility.contains(host) {
                        warnings.push(format!(
                            "RBS no optimizado para {}.",
                            host.display_name()
                        ));
                    }
                }
                _ => {}
            }
        }

        warnings
    }

    /// Get a human-readable display name for this type.
    pub fn display_name(&self) -> String {
        match self {
            BioType::Int => "Int".into(),
            BioType::Float => "Float".into(),
            BioType::Bool => "Bool".into(),
            BioType::Str => "String".into(),
            BioType::Void => "Void".into(),
            BioType::Part(pt) => pt.display_name(),
            BioType::Host(org) => format!("Host<{}>", org.display_name()),
            BioType::Sequence(st) => st.display_name(),
            BioType::Measurement(mt) => format!("Measurement<{}>", mt.display_name()),
            BioType::Interaction(it) => it.display_name(),
            BioType::Gene { host, .. } => {
                if let Some(h) = host {
                    format!("Gene<{}>", h.display_name())
                } else {
                    "Gene".into()
                }
            }
            BioType::Circuit { host, .. } => {
                if let Some(h) = host {
                    format!("Circuit<{}>", h.display_name())
                } else {
                    "Circuit".into()
                }
            }
            BioType::TranscriptionUnit { .. } => "TranscriptionUnit".into(),
            BioType::Array(inner) => format!("Array<{}>", inner.display_name()),
            BioType::Map(k, v) => format!("Map<{}, {}>", k.display_name(), v.display_name()),
            BioType::Optional(inner) => format!("Option<{}>", inner.display_name()),
            BioType::Struct(name) => name.clone(),
            BioType::Gate(gt) => format!("Gate<{:?}>", gt),
            BioType::Restricted { inner, restriction } => {
                format!("⚠ RESTRICTED[{}]: {}", restriction.level.display_name(), inner.display_name())
            }
            BioType::TypeVar(id) => format!("T{}", id),
            BioType::Unknown => "Unknown".into(),
            BioType::Error => "<error>".into(),
        }
    }

    /// Is this a numeric type?
    pub fn is_numeric(&self) -> bool {
        matches!(self, BioType::Int | BioType::Float | BioType::Measurement(_))
    }

    /// Is this a biological part type?
    pub fn is_bio_part(&self) -> bool {
        matches!(self, BioType::Part(_))
    }

    /// Is this a sequence type?
    pub fn is_sequence(&self) -> bool {
        matches!(self, BioType::Sequence(_))
    }
}

impl PartType {
    pub fn display_name(&self) -> String {
        match self {
            Self::Promoter(p) => {
                let reg = match &p.regulation {
                    RegulationKind::Constitutive => "Constitutive",
                    RegulationKind::Inducible => "Inducible",
                    RegulationKind::Repressible => "Repressible",
                    _ => "",
                };
                if reg.is_empty() {
                    format!("Promoter<{:?}>", p.strength)
                } else {
                    format!("Promoter<{}, {}>", reg, format!("{:?}", p.strength).to_lowercase())
                }
            }
            Self::RBS(r) => format!("RBS<{:?}>", r.translation_rate),
            Self::CDS(c) => {
                let func = format!("{:?}", c.protein_function);
                if let Some(org) = &c.codon_optimized_for {
                    format!("CDS<{}, optimized={}>", func, org.display_name())
                } else {
                    format!("CDS<{}>", func)
                }
            }
            Self::Terminator(t) => format!("Terminator<{:?}>", t.efficiency),
            Self::Operator(o) => format!("Operator<{:?}>", o.operator_class),
            Self::Insulator(i) => format!("Insulator<{:?}>", i.mechanism),
            Self::Origin(o) => format!("Origin<{:?}>", o.copy_number),
            Self::SelectionMarker(s) => {
                if let Some(ref r) = s.resistance_to {
                    format!("SelectionMarker<{}>", r)
                } else {
                    "SelectionMarker".into()
                }
            }
            Self::Reporter(r) => format!("Reporter<{:?}>", r.reporter_class),
            Self::Regulator(r) => format!("Regulator<{:?}>", r.regulator_class),
        }
    }
}

impl SequenceType {
    pub fn display_name(&self) -> String {
        match self {
            Self::DNA(dir) => match dir {
                Directionality::FivePrimeToThreePrime => "DNA<5'→3'>".into(),
                Directionality::ThreePrimeToFivePrime => "DNA<3'→5'>".into(),
                Directionality::DoubleStranded => "dsDNA".into(),
                Directionality::Unknown => "DNA".into(),
            },
            Self::RNA(kind) => match kind {
                RNAKind::MRNA => "mRNA".into(),
                RNAKind::TRNA => "tRNA".into(),
                RNAKind::RRNA => "rRNA".into(),
                RNAKind::SgRNA => "sgRNA".into(),
                RNAKind::SiRNA => "siRNA".into(),
                RNAKind::MiRNA => "miRNA".into(),
                RNAKind::Ribozyme => "Ribozyme".into(),
                RNAKind::Generic => "RNA".into(),
            },
            Self::AminoAcid => "AminoAcid".into(),
        }
    }
}

impl InteractionType {
    pub fn display_name(&self) -> String {
        match self {
            Self::Activation { activator, target_promoter, .. } =>
                format!("Activation({} → {})", activator, target_promoter),
            Self::Repression { repressor, target_promoter, .. } =>
                format!("Repression({} ⊣ {})", repressor, target_promoter),
            Self::Induction { inducer, target_protein, .. } =>
                format!("Induction({} → {})", inducer, target_protein),
            Self::Phosphorylation { kinase, substrate } =>
                format!("Phosphorylation({} → {})", kinase, substrate),
            Self::Degradation { protease, target, .. } =>
                format!("Degradation({} → {})", protease, target),
            Self::CRISPRRegulation { guide_rna, target_gene, cas_variant } =>
                format!("{:?}({} → {})", cas_variant, guide_rna, target_gene),
            Self::QuorumSensing { signal_molecule, receptor, .. } =>
                format!("QS({} → {})", signal_molecule, receptor),
            Self::Binding { molecule_a, molecule_b, .. } =>
                format!("Binding({} ⇌ {})", molecule_a, molecule_b),
        }
    }
}

impl BiosecurityLevel {
    pub fn display_name(&self) -> &str {
        match self {
            Self::BSL1 => "BSL-1",
            Self::BSL2 => "BSL-2",
            Self::BSL3 => "BSL-3",
            Self::BSL4 => "BSL-4",
            Self::SelectAgent => "SELECT AGENT",
        }
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
//  KNOWN PARTS DATABASE — Maps part names to their rich types
// ═══════════════════════════════════════════════════════════════════════════════

/// A database of known biological parts with their full type information.
pub struct KnownPartsDB {
    parts: HashMap<String, BioType>,
}

impl KnownPartsDB {
    pub fn new() -> Self {
        let mut parts = HashMap::new();

        // ── Promoters ──
        parts.insert("pLac".into(), BioType::Part(PartType::Promoter(PromoterType {
            strength: PromoterStrength::Medium,
            regulation: RegulationKind::Inducible,
            inducers: vec!["IPTG".into(), "allolactose".into()],
            host_range: vec![Organism::EcoliK12, Organism::EcoliDH5Alpha, Organism::EcoliBL21],
            directionality: Directionality::FivePrimeToThreePrime,
        })));

        parts.insert("pTet".into(), BioType::Part(PartType::Promoter(PromoterType {
            strength: PromoterStrength::Medium,
            regulation: RegulationKind::Inducible,
            inducers: vec!["aTc".into()],
            host_range: vec![Organism::EcoliK12, Organism::EcoliDH5Alpha, Organism::EcoliBL21],
            directionality: Directionality::FivePrimeToThreePrime,
        })));

        parts.insert("pBAD".into(), BioType::Part(PartType::Promoter(PromoterType {
            strength: PromoterStrength::Strong,
            regulation: RegulationKind::Inducible,
            inducers: vec!["arabinose".into()],
            host_range: vec![Organism::EcoliK12, Organism::EcoliDH5Alpha],
            directionality: Directionality::FivePrimeToThreePrime,
        })));

        parts.insert("pT7".into(), BioType::Part(PartType::Promoter(PromoterType {
            strength: PromoterStrength::VeryStrong,
            regulation: RegulationKind::Inducible,
            inducers: vec!["IPTG".into()],
            host_range: vec![Organism::EcoliBL21],  // Only BL21(DE3) has T7 RNAP
            directionality: Directionality::FivePrimeToThreePrime,
        })));

        parts.insert("pConst".into(), BioType::Part(PartType::Promoter(PromoterType {
            strength: PromoterStrength::Medium,
            regulation: RegulationKind::Constitutive,
            inducers: vec![],
            host_range: vec![],
            directionality: Directionality::FivePrimeToThreePrime,
        })));

        parts.insert("pGal1".into(), BioType::Part(PartType::Promoter(PromoterType {
            strength: PromoterStrength::Strong,
            regulation: RegulationKind::Inducible,
            inducers: vec!["galactose".into()],
            host_range: vec![Organism::Saccharomyces],
            directionality: Directionality::FivePrimeToThreePrime,
        })));

        // ── RBS ──
        parts.insert("B0034".into(), BioType::Part(PartType::RBS(RBSType {
            translation_rate: TranslationRate::Strong,
            spacing: Some(7),
            host_compatibility: vec![Organism::EcoliK12, Organism::EcoliDH5Alpha, Organism::EcoliBL21],
        })));

        parts.insert("B0032".into(), BioType::Part(PartType::RBS(RBSType {
            translation_rate: TranslationRate::Medium,
            spacing: Some(7),
            host_compatibility: vec![Organism::EcoliK12, Organism::EcoliDH5Alpha],
        })));

        parts.insert("B0031".into(), BioType::Part(PartType::RBS(RBSType {
            translation_rate: TranslationRate::Weak,
            spacing: Some(7),
            host_compatibility: vec![Organism::EcoliK12],
        })));

        // ── CDS / Reporters ──
        parts.insert("GFP".into(), BioType::Part(PartType::Reporter(ReporterType {
            reporter_class: ReporterClass::Fluorescent,
            excitation_nm: Some(488),
            emission_nm: Some(509),
        })));

        parts.insert("RFP".into(), BioType::Part(PartType::Reporter(ReporterType {
            reporter_class: ReporterClass::Fluorescent,
            excitation_nm: Some(555),
            emission_nm: Some(584),
        })));

        parts.insert("mCherry".into(), BioType::Part(PartType::Reporter(ReporterType {
            reporter_class: ReporterClass::Fluorescent,
            excitation_nm: Some(587),
            emission_nm: Some(610),
        })));

        parts.insert("BFP".into(), BioType::Part(PartType::Reporter(ReporterType {
            reporter_class: ReporterClass::Fluorescent,
            excitation_nm: Some(383),
            emission_nm: Some(448),
        })));

        parts.insert("YFP".into(), BioType::Part(PartType::Reporter(ReporterType {
            reporter_class: ReporterClass::Fluorescent,
            excitation_nm: Some(514),
            emission_nm: Some(527),
        })));

        parts.insert("luciferase".into(), BioType::Part(PartType::Reporter(ReporterType {
            reporter_class: ReporterClass::Luminescent,
            excitation_nm: None,
            emission_nm: Some(560),
        })));

        // ── Regulators ──
        parts.insert("LacI".into(), BioType::Part(PartType::Regulator(RegulatorType {
            regulator_class: RegulatorClass::Repressor,
            targets: vec!["pLac".into()],
        })));

        parts.insert("TetR".into(), BioType::Part(PartType::Regulator(RegulatorType {
            regulator_class: RegulatorClass::Repressor,
            targets: vec!["pTet".into()],
        })));

        parts.insert("CI".into(), BioType::Part(PartType::Regulator(RegulatorType {
            regulator_class: RegulatorClass::Repressor,
            targets: vec!["pR".into(), "pRM".into()],
        })));

        parts.insert("AraC".into(), BioType::Part(PartType::Regulator(RegulatorType {
            regulator_class: RegulatorClass::DualFunction,
            targets: vec!["pBAD".into()],
        })));

        // ── CDS (enzymes & special) ──
        parts.insert("Cas9".into(), BioType::Part(PartType::CDS(CDSType {
            protein_function: ProteinFunction::Enzyme,
            codon_optimized_for: None,
            molecular_weight_kda: Some(160.0),
            toxicity: ToxicityLevel::Low,
            localization: CellularLocalization::Cytoplasmic,
        })));

        parts.insert("dCas9".into(), BioType::Part(PartType::CDS(CDSType {
            protein_function: ProteinFunction::Regulator,
            codon_optimized_for: None,
            molecular_weight_kda: Some(160.0),
            toxicity: ToxicityLevel::Low,
            localization: CellularLocalization::Cytoplasmic,
        })));

        parts.insert("CcdB".into(), BioType::Part(PartType::CDS(CDSType {
            protein_function: ProteinFunction::Toxin,
            codon_optimized_for: Some(Organism::EcoliK12),
            molecular_weight_kda: Some(11.7),
            toxicity: ToxicityLevel::Lethal,
            localization: CellularLocalization::Cytoplasmic,
        })));

        parts.insert("CcdA".into(), BioType::Part(PartType::CDS(CDSType {
            protein_function: ProteinFunction::Antitoxin,
            codon_optimized_for: Some(Organism::EcoliK12),
            molecular_weight_kda: Some(8.7),
            toxicity: ToxicityLevel::None,
            localization: CellularLocalization::Cytoplasmic,
        })));

        // ── Terminators ──
        parts.insert("B0015".into(), BioType::Part(PartType::Terminator(TerminatorType {
            efficiency: TerminatorEfficiency::High,
            terminator_class: TerminatorClass::Intrinsic,
        })));

        parts.insert("T1".into(), BioType::Part(PartType::Terminator(TerminatorType {
            efficiency: TerminatorEfficiency::High,
            terminator_class: TerminatorClass::Intrinsic,
        })));

        parts.insert("T7term".into(), BioType::Part(PartType::Terminator(TerminatorType {
            efficiency: TerminatorEfficiency::Perfect,
            terminator_class: TerminatorClass::Intrinsic,
        })));

        // ── Origins ──
        parts.insert("ColE1".into(), BioType::Part(PartType::Origin(OriginType {
            copy_number: CopyNumber::High,
            host_range: vec![Organism::EcoliK12, Organism::EcoliDH5Alpha, Organism::EcoliBL21],
            incompatibility_group: Some("ColE1".into()),
        })));

        parts.insert("p15A".into(), BioType::Part(PartType::Origin(OriginType {
            copy_number: CopyNumber::Medium,
            host_range: vec![Organism::EcoliK12, Organism::EcoliDH5Alpha, Organism::EcoliBL21],
            incompatibility_group: Some("p15A".into()),
        })));

        parts.insert("pSC101".into(), BioType::Part(PartType::Origin(OriginType {
            copy_number: CopyNumber::Low,
            host_range: vec![Organism::EcoliK12, Organism::EcoliDH5Alpha],
            incompatibility_group: Some("pSC101".into()),
        })));

        // ── Selection Markers ──
        parts.insert("AmpR".into(), BioType::Part(PartType::SelectionMarker(SelectionMarkerType {
            marker_class: MarkerClass::AntibioticResistance,
            resistance_to: Some("ampicillin".into()),
        })));

        parts.insert("KanR".into(), BioType::Part(PartType::SelectionMarker(SelectionMarkerType {
            marker_class: MarkerClass::AntibioticResistance,
            resistance_to: Some("kanamycin".into()),
        })));

        parts.insert("CmR".into(), BioType::Part(PartType::SelectionMarker(SelectionMarkerType {
            marker_class: MarkerClass::AntibioticResistance,
            resistance_to: Some("chloramphenicol".into()),
        })));

        parts.insert("URA3".into(), BioType::Part(PartType::SelectionMarker(SelectionMarkerType {
            marker_class: MarkerClass::Auxotrophy,
            resistance_to: None,
        })));

        // ── Insulators ──
        parts.insert("RiboJ".into(), BioType::Part(PartType::Insulator(InsulatorType {
            insulation_strength: 0.95,
            mechanism: InsulationMechanism::Ribozyme,
        })));

        KnownPartsDB { parts }
    }

    /// Look up a part by name and get its full type.
    pub fn lookup(&self, name: &str) -> Option<&BioType> {
        self.parts.get(name)
    }

    /// Get all known part names.
    pub fn all_names(&self) -> Vec<&str> {
        self.parts.keys().map(|s| s.as_str()).collect()
    }

    /// Register a custom part.
    pub fn register(&mut self, name: String, bio_type: BioType) {
        self.parts.insert(name, bio_type);
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
//  DISPLAY IMPLEMENTATION
// ═══════════════════════════════════════════════════════════════════════════════

impl fmt::Display for BioType {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}", self.display_name())
    }
}

impl fmt::Display for Organism {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}", self.display_name())
    }
}

impl fmt::Display for MeasurementType {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}", self.display_name())
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
//  TYPE ENVIRONMENT — For the type checker
// ═══════════════════════════════════════════════════════════════════════════════

/// The type environment holds type bindings during type checking.
pub struct TypeEnvironment {
    scopes: Vec<TypeScope>,
    current_scope: usize,
    next_type_var: u32,
    known_parts: KnownPartsDB,
    current_host: Option<Organism>,
}

struct TypeScope {
    bindings: HashMap<String, BioType>,
    parent: Option<usize>,
}

impl TypeEnvironment {
    pub fn new() -> Self {
        let known_parts = KnownPartsDB::new();
        let global_scope = TypeScope {
            bindings: HashMap::new(),
            parent: None,
        };
        TypeEnvironment {
            scopes: vec![global_scope],
            current_scope: 0,
            next_type_var: 0,
            known_parts,
            current_host: None,
        }
    }

    /// Set the current host organism.
    pub fn set_host(&mut self, host: Organism) {
        self.current_host = Some(host);
    }

    /// Get the current host organism.
    pub fn current_host(&self) -> Option<&Organism> {
        self.current_host.as_ref()
    }

    /// Create a fresh type variable.
    pub fn fresh_type_var(&mut self) -> BioType {
        let id = self.next_type_var;
        self.next_type_var += 1;
        BioType::TypeVar(id)
    }

    /// Enter a new scope.
    pub fn enter_scope(&mut self) {
        let parent = self.current_scope;
        let scope = TypeScope {
            bindings: HashMap::new(),
            parent: Some(parent),
        };
        self.current_scope = self.scopes.len();
        self.scopes.push(scope);
    }

    /// Exit the current scope.
    pub fn exit_scope(&mut self) {
        if let Some(parent) = self.scopes[self.current_scope].parent {
            self.current_scope = parent;
        }
    }

    /// Bind a name to a type in the current scope.
    pub fn bind(&mut self, name: String, bio_type: BioType) {
        self.scopes[self.current_scope].bindings.insert(name, bio_type);
    }

    /// Resolve a name to its type, searching up the scope chain.
    pub fn resolve(&self, name: &str) -> Option<&BioType> {
        let mut scope_idx = self.current_scope;
        loop {
            if let Some(t) = self.scopes[scope_idx].bindings.get(name) {
                return Some(t);
            }
            if let Some(parent) = self.scopes[scope_idx].parent {
                scope_idx = parent;
            } else {
                break;
            }
        }
        // Fall back to known parts database
        self.known_parts.lookup(name)
    }

    /// Get the known parts database.
    pub fn known_parts(&self) -> &KnownPartsDB {
        &self.known_parts
    }

    /// Get a mutable reference to the known parts database.
    pub fn known_parts_mut(&mut self) -> &mut KnownPartsDB {
        &mut self.known_parts
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
//  TESTS
// ═══════════════════════════════════════════════════════════════════════════════

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_measurement_compatibility() {
        let nm = MeasurementType::NanoMolar;
        let um = MeasurementType::MicroMolar;
        let rpu = MeasurementType::RPU;
        let od = MeasurementType::OD600;

        // Same dimension — compatible
        assert!(nm.is_compatible_with(&um));
        assert!(um.is_compatible_with(&nm));

        // Different dimensions — incompatible
        assert!(!nm.is_compatible_with(&rpu));
        assert!(!rpu.is_compatible_with(&od));
        assert!(!od.is_compatible_with(&nm));
    }

    #[test]
    fn test_sequence_operations() {
        let dna_53 = SequenceType::DNA(Directionality::FivePrimeToThreePrime);
        let rna = SequenceType::RNA(RNAKind::MRNA);
        let aa = SequenceType::AminoAcid;

        // DNA complement → valid
        assert!(dna_53.can_complement().is_ok());
        // RNA complement → error
        assert!(rna.can_complement().is_err());

        // DNA transcribe → mRNA, valid
        assert!(dna_53.can_transcribe().is_ok());
        // RNA transcribe → error
        assert!(rna.can_transcribe().is_err());

        // mRNA translate → AminoAcid, valid
        assert!(rna.can_translate().is_ok());
        // DNA translate → error
        assert!(dna_53.can_translate().is_err());
        // AA translate → error
        assert!(aa.can_translate().is_err());
    }

    #[test]
    fn test_part_connections() {
        let promoter = BioType::Part(PartType::Promoter(PromoterType {
            strength: PromoterStrength::Medium,
            regulation: RegulationKind::Constitutive,
            inducers: vec![],
            host_range: vec![],
            directionality: Directionality::FivePrimeToThreePrime,
        }));
        let rbs = BioType::Part(PartType::RBS(RBSType {
            translation_rate: TranslationRate::Strong,
            spacing: Some(7),
            host_compatibility: vec![],
        }));
        let cds = BioType::Part(PartType::CDS(CDSType {
            protein_function: ProteinFunction::Reporter,
            codon_optimized_for: None,
            molecular_weight_kda: None,
            toxicity: ToxicityLevel::None,
            localization: CellularLocalization::Cytoplasmic,
        }));
        let term = BioType::Part(PartType::Terminator(TerminatorType {
            efficiency: TerminatorEfficiency::High,
            terminator_class: TerminatorClass::Intrinsic,
        }));

        // Valid connections
        assert!(promoter.can_connect_to(&rbs).is_ok());
        assert!(rbs.can_connect_to(&cds).is_ok());
        assert!(cds.can_connect_to(&term).is_ok());

        // Invalid connections
        assert!(term.can_connect_to(&promoter).is_err());
        assert!(cds.can_connect_to(&rbs).is_err());
    }

    #[test]
    fn test_type_assignability() {
        assert!(BioType::Int.is_assignable_to(&BioType::Float));
        assert!(!BioType::Float.is_assignable_to(&BioType::Int));
        assert!(BioType::Unknown.is_assignable_to(&BioType::Int));

        let nm = BioType::Measurement(MeasurementType::NanoMolar);
        let um = BioType::Measurement(MeasurementType::MicroMolar);
        let rpu = BioType::Measurement(MeasurementType::RPU);
        assert!(nm.is_assignable_to(&um));
        assert!(!nm.is_assignable_to(&rpu));
    }

    #[test]
    fn test_host_codon_preferences() {
        let ecoli = Organism::EcoliK12;
        let yeast = Organism::Saccharomyces;

        let ecoli_codons = ecoli.preferred_codons();
        let yeast_codons = yeast.preferred_codons();

        // E. coli prefers CTG for Leucine
        assert!(ecoli_codons.get(&'L').unwrap().contains(&"CTG"));
        // Yeast prefers TTG for Leucine
        assert!(yeast_codons.get(&'L').unwrap().contains(&"TTG"));
    }

    #[test]
    fn test_known_parts_db() {
        let db = KnownPartsDB::new();

        // pLac should be an inducible promoter
        let plac = db.lookup("pLac").unwrap();
        match plac {
            BioType::Part(PartType::Promoter(p)) => {
                assert_eq!(p.regulation, RegulationKind::Inducible);
                assert!(p.inducers.contains(&"IPTG".to_string()));
            }
            _ => panic!("pLac should be a Promoter"),
        }

        // GFP should be a fluorescent reporter
        let gfp = db.lookup("GFP").unwrap();
        match gfp {
            BioType::Part(PartType::Reporter(r)) => {
                assert_eq!(r.reporter_class, ReporterClass::Fluorescent);
                assert_eq!(r.emission_nm, Some(509));
            }
            _ => panic!("GFP should be a Reporter"),
        }

        // B0015 should be a terminator
        assert!(matches!(db.lookup("B0015"), Some(BioType::Part(PartType::Terminator(_)))));
    }

    #[test]
    fn test_type_environment() {
        let mut env = TypeEnvironment::new();

        // Set host
        env.set_host(Organism::EcoliK12);
        assert_eq!(env.current_host(), Some(&Organism::EcoliK12));

        // Bind a variable
        env.bind("x".into(), BioType::Int);
        assert_eq!(env.resolve("x"), Some(&BioType::Int));

        // Enter scope, shadow x
        env.enter_scope();
        env.bind("x".into(), BioType::Float);
        assert_eq!(env.resolve("x"), Some(&BioType::Float));

        // Exit scope, x is Int again
        env.exit_scope();
        assert_eq!(env.resolve("x"), Some(&BioType::Int));

        // Known parts are accessible
        assert!(env.resolve("pLac").is_some());
    }
}
