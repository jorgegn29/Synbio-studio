#![allow(dead_code)]
//! Generador de código: Exporta Bio-IR a formatos estándar
//! 
//! Formatos soportados:
//! - SBOL (Synthetic Biology Open Language)
//! - FASTA (secuencias crudas)
//! - GenBank (formato anotado)
//! - LAMMPS (scripts de simulación molecular)

use crate::compiler::bio_ir::*;
use std::fmt::Write;

/// Generador de código para múltiples formatos
pub struct CodeGenerator {
    pub config: GeneratorConfig,
}

#[derive(Debug, Clone)]
pub struct GeneratorConfig {
    pub author: String,
    pub organization: String,
    pub include_annotations: bool,
    pub optimize_codons: bool,
    pub target_organism: String,
}

impl Default for GeneratorConfig {
    fn default() -> Self {
        Self {
            author: "SynBio-LLVM".to_string(),
            organization: "".to_string(),
            include_annotations: true,
            optimize_codons: true,
            target_organism: "Escherichia coli".to_string(),
        }
    }
}

impl CodeGenerator {
    pub fn new(config: GeneratorConfig) -> Self {
        Self { config }
    }
    
    /// Genera SBOL 3.0 XML
    pub fn generate_sbol(&self, program: &BioIRProgram) -> Result<String, CodeGenError> {
        let mut output = String::new();
        
        // Header XML
        writeln!(output, r#"<?xml version="1.0" encoding="UTF-8"?>"#)?;
        writeln!(output, r#"<sbol xmlns="http://sbols.org/v3#""#)?;
        writeln!(output, r#"      xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#""#)?;
        writeln!(output, r#"      xmlns:dcterms="http://purl.org/dc/terms/""#)?;
        writeln!(output, r#"      xmlns:prov="http://www.w3.org/ns/prov#""#)?;
        writeln!(output, r#"      xmlns:om="http://www.ontology-of-units-of-measure.org/resource/om-2/">"#)?;
        writeln!(output)?;
        
        // Metadatos del programa
        writeln!(output, r#"  <!-- Generado por SynBio-LLVM -->"#)?;
        writeln!(output, r#"  <!-- Programa: {} -->"#, program.name)?;
        if let Some(ref desc) = program.metadata.description {
            writeln!(output, r#"  <!-- Descripción: {} -->"#, desc)?;
        }
        writeln!(output)?;
        
        // Generar cada circuito
        for circuit in &program.circuits {
            self.generate_sbol_circuit(&mut output, circuit)?;
        }
        
        // Cerrar documento
        writeln!(output, r#"</sbol>"#)?;
        
        Ok(output)
    }
    
    fn generate_sbol_circuit(&self, output: &mut String, circuit: &GeneticCircuit) -> Result<(), CodeGenError> {
        let circuit_uri = format!("https://synbio-llvm.org/{}", circuit.name);
        
        // Component principal (el circuito completo)
        writeln!(output, r#"  <Component rdf:about="{}">"#, circuit_uri)?;
        writeln!(output, r#"    <displayId>{}</displayId>"#, circuit.name)?;
        writeln!(output, r#"    <name>{}</name>"#, circuit.name)?;
        writeln!(output, r#"    <description>Circuito genético generado por SynBio-LLVM</description>"#)?;
        writeln!(output, r#"    <type rdf:resource="https://identifiers.org/SBO:0000251"/>"#)?; // DNA
        
        // Generar SubComponents para cada unidad de transcripción
        for tu in &circuit.transcription_units {
            writeln!(output, r#"    <hasSubComponent>"#)?;
            writeln!(output, r#"      <SubComponent rdf:about="{}/{}">"#, circuit_uri, tu.id)?;
            writeln!(output, r#"        <displayId>{}</displayId>"#, tu.id)?;
            writeln!(output, r#"        <instanceOf rdf:resource="{}/component/{}_def"/>"#, circuit_uri, tu.id)?;
            writeln!(output, r#"      </SubComponent>"#)?;
            writeln!(output, r#"    </hasSubComponent>"#)?;
        }
        
        writeln!(output, r#"  </Component>"#)?;
        writeln!(output)?;
        
        // Generar definiciones de partes
        for tu in &circuit.transcription_units {
            self.generate_sbol_transcription_unit(output, tu, &circuit_uri)?;
        }
        
        // Generar secuencia completa
        let full_sequence = self.assemble_sequence(circuit);
        writeln!(output, r#"  <Sequence rdf:about="{}/sequence">"#, circuit_uri)?;
        writeln!(output, r#"    <displayId>{}_seq</displayId>"#, circuit.name)?;
        writeln!(output, r#"    <elements>{}</elements>"#, full_sequence)?;
        writeln!(output, r#"    <encoding rdf:resource="https://identifiers.org/edam:format_1207"/>"#)?; // IUPAC DNA
        writeln!(output, r#"  </Sequence>"#)?;
        writeln!(output)?;
        
        Ok(())
    }
    
    fn generate_sbol_transcription_unit(&self, output: &mut String, tu: &TranscriptionUnit, base_uri: &str) -> Result<(), CodeGenError> {
        let tu_uri = format!("{}/component/{}_def", base_uri, tu.id);
        
        writeln!(output, r#"  <Component rdf:about="{}">"#, tu_uri)?;
        writeln!(output, r#"    <displayId>{}</displayId>"#, tu.id)?;
        writeln!(output, r#"    <type rdf:resource="https://identifiers.org/SBO:0000251"/>"#)?;
        
        // Promotor
        writeln!(output, r#"    <hasSubComponent>"#)?;
        writeln!(output, r#"      <SubComponent>"#)?;
        writeln!(output, r#"        <displayId>{}</displayId>"#, tu.promoter.id)?;
        writeln!(output, r#"        <role rdf:resource="https://identifiers.org/SO:0000167"/>"#)?; // Promoter
        writeln!(output, r#"      </SubComponent>"#)?;
        writeln!(output, r#"    </hasSubComponent>"#)?;
        
        // RBS
        writeln!(output, r#"    <hasSubComponent>"#)?;
        writeln!(output, r#"      <SubComponent>"#)?;
        writeln!(output, r#"        <displayId>{}</displayId>"#, tu.rbs.id)?;
        writeln!(output, r#"        <role rdf:resource="https://identifiers.org/SO:0000139"/>"#)?; // RBS
        writeln!(output, r#"      </SubComponent>"#)?;
        writeln!(output, r#"    </hasSubComponent>"#)?;
        
        // CDS
        for cds in &tu.coding_sequences {
            writeln!(output, r#"    <hasSubComponent>"#)?;
            writeln!(output, r#"      <SubComponent>"#)?;
            writeln!(output, r#"        <displayId>{}</displayId>"#, cds.id)?;
            writeln!(output, r#"        <role rdf:resource="https://identifiers.org/SO:0000316"/>"#)?; // CDS
            writeln!(output, r#"      </SubComponent>"#)?;
            writeln!(output, r#"    </hasSubComponent>"#)?;
        }
        
        // Terminator (si existe)
        if let Some(ref term) = tu.terminator {
            writeln!(output, r#"    <hasSubComponent>"#)?;
            writeln!(output, r#"      <SubComponent>"#)?;
            writeln!(output, r#"        <displayId>{}</displayId>"#, term.registry_id.as_deref().unwrap_or(&term.name))?;
            writeln!(output, r#"        <role rdf:resource="https://identifiers.org/SO:0000141"/>"#)?; // Terminator
            writeln!(output, r#"      </SubComponent>"#)?;
            writeln!(output, r#"    </hasSubComponent>"#)?;
        }
        
        writeln!(output, r#"  </Component>"#)?;
        writeln!(output)?;
        
        Ok(())
    }
    
    /// Genera formato FASTA
    pub fn generate_fasta(&self, program: &BioIRProgram) -> Result<String, CodeGenError> {
        let mut output = String::new();
        
        for circuit in &program.circuits {
            // Header FASTA
            writeln!(output, ">{} | Generated by SynBio-LLVM", circuit.name)?;
            
            // Secuencia completa
            let sequence = self.assemble_sequence(circuit);
            
            // Formatear a 80 caracteres por línea
            for chunk in sequence.as_bytes().chunks(80) {
                writeln!(output, "{}", std::str::from_utf8(chunk).unwrap())?;
            }
            
            writeln!(output)?;
            
            // Secuencias individuales de cada parte
            for tu in &circuit.transcription_units {
                // Promotor
                writeln!(output, ">{}|promoter|{}", circuit.name, tu.promoter.name)?;
                writeln!(output, "{}", tu.promoter.sequence)?;
                writeln!(output)?;
                
                // RBS
                writeln!(output, ">{}|rbs|{}", circuit.name, tu.rbs.name)?;
                writeln!(output, "{}", tu.rbs.sequence)?;
                writeln!(output)?;
                
                // CDS
                for cds in &tu.coding_sequences {
                    writeln!(output, ">{}|cds|{}", circuit.name, cds.name)?;
                    for chunk in cds.dna_sequence.as_bytes().chunks(80) {
                        writeln!(output, "{}", std::str::from_utf8(chunk).unwrap())?;
                    }
                    writeln!(output)?;
                    
                    // También exportar secuencia de aminoácidos
                    writeln!(output, ">{}|protein|{}", circuit.name, cds.name)?;
                    writeln!(output, "{}", cds.amino_sequence)?;
                    writeln!(output)?;
                }
                
                // Terminator (si existe)
                if let Some(ref term) = tu.terminator {
                    writeln!(output, ">{}|terminator|{}", circuit.name, term.name)?;
                    writeln!(output, "{}", term.sequence)?;
                    writeln!(output)?;
                }
            }
        }
        
        Ok(output)
    }
    
    /// Genera formato GenBank
    pub fn generate_genbank(&self, program: &BioIRProgram) -> Result<String, CodeGenError> {
        let mut output = String::new();
        
        for circuit in &program.circuits {
            let sequence = self.assemble_sequence(circuit);
            let seq_len = sequence.len();
            
            // Header
            writeln!(output, "LOCUS       {:<16} {:>6} bp    DNA     circular SYN {:>11}",
                circuit.name, seq_len, chrono_lite::date_string())?;
            writeln!(output, "DEFINITION  {} genetic circuit, generated by SynBio-LLVM.",
                circuit.name)?;
            writeln!(output, "ACCESSION   SYNBIO_{}", circuit.name.to_uppercase())?;
            writeln!(output, "VERSION     SYNBIO_{}.1", circuit.name.to_uppercase())?;
            writeln!(output, "KEYWORDS    synthetic biology; genetic circuit.")?;
            writeln!(output, "SOURCE      synthetic construct")?;
            writeln!(output, "  ORGANISM  synthetic construct")?;
            writeln!(output, "            other sequences; artificial sequences.")?;
            writeln!(output, "FEATURES             Location/Qualifiers")?;
            
            // Features para cada parte
            let mut position = 1;
            for tu in &circuit.transcription_units {
                // Promotor
                let prom_end = position + tu.promoter.sequence.len() - 1;
                writeln!(output, "     promoter        {}..{}", position, prom_end)?;
                writeln!(output, r#"                     /label="{}""#, tu.promoter.name)?;
                writeln!(output, r#"                     /note="strength={}""#, tu.promoter.strength)?;
                position = prom_end + 1;
                
                // RBS
                let rbs_end = position + tu.rbs.sequence.len() - 1;
                writeln!(output, "     RBS             {}..{}", position, rbs_end)?;
                writeln!(output, r#"                     /label="{}""#, tu.rbs.name)?;
                position = rbs_end + 1;
                
                // CDS
                for cds in &tu.coding_sequences {
                    let cds_end = position + cds.dna_sequence.len() - 1;
                    writeln!(output, "     CDS             {}..{}", position, cds_end)?;
                    writeln!(output, r#"                     /label="{}""#, cds.name)?;
                    writeln!(output, r#"                     /translation="{}""#, cds.amino_sequence)?;
                    writeln!(output, r#"                     /product="{}""#, cds.protein.name)?;
                    position = cds_end + 1;
                }
                
                // Terminator (si existe)
                if let Some(ref term) = tu.terminator {
                    let term_end = position + term.sequence.len() - 1;
                    writeln!(output, "     terminator      {}..{}", position, term_end)?;
                    writeln!(output, r#"                     /label="{}""#, term.name)?;
                    position = term_end + 1;
                }
            }
            
            // Origen de secuencia
            writeln!(output, "ORIGIN")?;
            for (i, chunk) in sequence.as_bytes().chunks(60).enumerate() {
                write!(output, "{:>9}", i * 60 + 1)?;
                for (_j, subchunk) in chunk.chunks(10).enumerate() {
                    write!(output, " {}", std::str::from_utf8(subchunk).unwrap().to_lowercase())?;
                }
                writeln!(output)?;
            }
            writeln!(output, "//")?;
        }
        
        Ok(output)
    }
    
    /// Genera script de LAMMPS para simulación molecular
    pub fn generate_lammps(&self, program: &BioIRProgram) -> Result<String, CodeGenError> {
        let mut output = String::new();
        
        writeln!(output, "# LAMMPS input script generated by SynBio-LLVM")?;
        writeln!(output, "# Simulación de dinámica molecular para circuito genético")?;
        writeln!(output, "#")?;
        writeln!(output, "# Programa: {}", program.name)?;
        writeln!(output)?;
        
        // Configuración inicial
        writeln!(output, "# ===== Inicialización =====")?;
        writeln!(output, "units real")?;
        writeln!(output, "atom_style full")?;
        writeln!(output, "boundary p p p")?;
        writeln!(output, "pair_style lj/cut/coul/long 10.0")?;
        writeln!(output, "bond_style harmonic")?;
        writeln!(output, "angle_style harmonic")?;
        writeln!(output, "dihedral_style opls")?;
        writeln!(output, "special_bonds lj/coul 0.0 0.0 0.5")?;
        writeln!(output)?;
        
        // Crear caja de simulación
        writeln!(output, "# ===== Caja de simulación =====")?;
        writeln!(output, "region box block -50 50 -50 50 -50 50")?;
        writeln!(output, "create_box 10 box bond/types 5 angle/types 5 dihedral/types 5 extra/bond/per/atom 5 extra/angle/per/atom 5 extra/dihedral/per/atom 5")?;
        writeln!(output)?;
        
        // Definir tipos de átomos para ADN
        writeln!(output, "# ===== Tipos de átomos =====")?;
        writeln!(output, "# Tipo 1: Fósforo (backbone)")?;
        writeln!(output, "# Tipo 2: Azúcar (backbone)")?;
        writeln!(output, "# Tipo 3: Adenina")?;
        writeln!(output, "# Tipo 4: Timina")?;
        writeln!(output, "# Tipo 5: Guanina")?;
        writeln!(output, "# Tipo 6: Citosina")?;
        writeln!(output, "# Tipo 7-10: Proteínas (simplificado)")?;
        writeln!(output)?;
        
        writeln!(output, "mass 1 31.0   # P")?;
        writeln!(output, "mass 2 83.0   # Sugar")?;
        writeln!(output, "mass 3 135.0  # A")?;
        writeln!(output, "mass 4 126.0  # T")?;
        writeln!(output, "mass 5 151.0  # G")?;
        writeln!(output, "mass 6 111.0  # C")?;
        writeln!(output)?;
        
        // Potenciales de interacción
        writeln!(output, "# ===== Potenciales =====")?;
        writeln!(output, "pair_coeff 1 1 0.5 3.5    # P-P")?;
        writeln!(output, "pair_coeff 2 2 0.3 3.2    # Sugar-Sugar")?;
        writeln!(output, "pair_coeff 3 4 1.5 3.0    # A-T pairing")?;
        writeln!(output, "pair_coeff 5 6 2.0 3.0    # G-C pairing")?;
        writeln!(output)?;
        
        // Insertar moléculas del circuito
        writeln!(output, "# ===== Moléculas del circuito =====")?;
        for circuit in &program.circuits {
            for tu in &circuit.transcription_units {
                writeln!(output, "# Unidad de transcripción: {}", tu.id)?;
                writeln!(output, "# Promotor: {} ({} bp)", tu.promoter.name, tu.promoter.sequence.len())?;
                writeln!(output, "# RBS: {} ({} bp)", tu.rbs.name, tu.rbs.sequence.len())?;
                for cds in &tu.coding_sequences {
                    writeln!(output, "# CDS: {} ({} bp)", cds.name, cds.dna_sequence.len())?;
                }
                if let Some(ref term) = tu.terminator {
                    writeln!(output, "# Terminador: {} ({} bp)", term.name, term.sequence.len())?;
                }
            }
        }
        writeln!(output)?;
        
        // Configuración de dinámica
        writeln!(output, "# ===== Dinámica molecular =====")?;
        writeln!(output, "velocity all create 310.0 12345 mom yes rot yes")?;
        writeln!(output)?;
        writeln!(output, "# Minimización de energía")?;
        writeln!(output, "minimize 1.0e-4 1.0e-6 1000 10000")?;
        writeln!(output)?;
        writeln!(output, "# Equilibración NVT")?;
        writeln!(output, "fix 1 all nvt temp 310.0 310.0 100.0")?;
        writeln!(output, "timestep 2.0")?;
        writeln!(output, "thermo 1000")?;
        writeln!(output)?;
        
        // Output
        writeln!(output, "# ===== Output =====")?;
        writeln!(output, "dump 1 all custom 1000 circuit_trajectory.lammpstrj id type x y z")?;
        writeln!(output, "dump 2 all xyz 5000 circuit_trajectory.xyz")?;
        writeln!(output)?;
        
        // Run
        writeln!(output, "# ===== Simulación =====")?;
        writeln!(output, "run 100000   # 200 ps de equilibración")?;
        writeln!(output)?;
        writeln!(output, "# ===== Producción =====")?;
        writeln!(output, "unfix 1")?;
        writeln!(output, "fix 2 all npt temp 310.0 310.0 100.0 iso 1.0 1.0 1000.0")?;
        writeln!(output, "run 500000   # 1 ns de producción")?;
        writeln!(output)?;
        writeln!(output, "write_data circuit_final.data")?;
        
        Ok(output)
    }
    
    /// Ensambla la secuencia completa del circuito
    fn assemble_sequence(&self, circuit: &GeneticCircuit) -> String {
        let mut sequence = String::new();
        
        for tu in &circuit.transcription_units {
            // Agregar aisladores upstream
            for insulator in &tu.insulators {
                if matches!(insulator.position, InsulatorPosition::Upstream) {
                    sequence.push_str(&insulator.sequence);
                }
            }
            
            // Promotor
            sequence.push_str(&tu.promoter.sequence);
            
            // RBS
            sequence.push_str(&tu.rbs.sequence);
            
            // Secuencias codificantes
            for cds in &tu.coding_sequences {
                sequence.push_str(&cds.dna_sequence);
            }
            
            // Terminador
            if let Some(ref term) = tu.terminator {
                sequence.push_str(&term.sequence);
            }
            
            // Agregar aisladores downstream
            for insulator in &tu.insulators {
                if matches!(insulator.position, InsulatorPosition::Downstream) {
                    sequence.push_str(&insulator.sequence);
                }
            }
        }
        
        sequence
    }
}

/// Errores del generador de código
#[derive(Debug, thiserror::Error)]
pub enum CodeGenError {
    #[error("Error de formato: {0}")]
    FormatError(#[from] std::fmt::Error),
    
    #[error("Secuencia inválida: {0}")]
    InvalidSequence(String),
    
    #[error("Parte no encontrada: {0}")]
    PartNotFound(String),
}

// Helper para fechas simples
mod chrono_lite {
    pub fn date_string() -> String {
        // En producción usar chrono
        "02-FEB-2026".to_string()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    
    #[test]
    fn test_fasta_generation() {
        let circuit = GeneticCircuit {
            name: "TestCircuit".to_string(),
            is_contained: false,
            kill_switch: None,
            transcription_units: vec![TranscriptionUnit {
                id: "TU1".to_string(),
                name: "TU1".to_string(),
                promoter: PromoterIR {
                    id: "P1".to_string(),
                    name: "pLac".to_string(),
                    sequence: "ATGCATGC".to_string(),
                    strength: 0.7,
                    regulation: RegulationType::Constitutive,
                    regulated_by: vec![],
                    delta_g: -10.0,
                },
                rbs: RbsIR {
                    id: "R1".to_string(),
                    name: "RBS".to_string(),
                    sequence: "AGGAGG".to_string(),
                    translation_rate: 1.0,
                    delta_g: -12.0,
                    shine_dalgarno: "AGGAGG".to_string(),
                    spacing: 6,
                },
                cds: CodingSequenceIR {
                    id: "CDS1".to_string(),
                    name: "GFP".to_string(),
                    dna_sequence: "ATGGTGAGCAAGGGCGAGGAG".to_string(),
                    amino_sequence: "MVSKGEE".to_string(),
                    protein: ProteinIR {
                        name: "GFP".to_string(),
                        function: ProteinFunction::Reporter,
                        molecular_weight_kda: 26.9,
                        isoelectric_point: 5.7,
                        half_life_minutes: 120.0,
                        toxicity: ToxicityLevel::None,
                        localization: CellularLocalization::Cytoplasm,
                    },
                    codon_adaptation_index: 0.7,
                },
                coding_sequences: vec![],
                terminator: Some(Terminator {
                    name: "Term".to_string(),
                    sequence: "TTTTTT".to_string(),
                    efficiency: 0.99,
                    bidirectional: false,
                    registry_id: None,
                }),
                insulators: vec![],
                upstream_spacer: None,
                downstream_spacer: None,
                ribozyme_insulator: None,
                metadata: std::collections::HashMap::new(),
            }],
            regulatory_links: vec![],
            estimated_atp_cost: 0.0,
            toxicity_score: 0.0,
            metadata: std::collections::HashMap::new(),
        };
        
        let program = BioIRProgram {
            name: "Test".to_string(),
            host: None,
            circuits: vec![circuit],
            parts_library: PartsLibrary::default(),
            metadata: ProgramMetadata::default(),
        };
        
        let gen = CodeGenerator::new(GeneratorConfig::default());
        let fasta = gen.generate_fasta(&program).unwrap();
        
        assert!(fasta.contains(">TestCircuit"));
        assert!(fasta.contains("ATGCATGC"));
    }
}
