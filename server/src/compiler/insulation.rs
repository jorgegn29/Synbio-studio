#![allow(dead_code)]
//! Transpilador de aislamiento genético
//! 
//! Este módulo inyecta automáticamente secuencias terminadoras y espaciadoras
//! entre módulos genéticos para prevenir interferencias de transcripción.
//! El proceso es invisible al usuario pero garantiza la funcionalidad del circuito.

use crate::compiler::bio_ir::*;

/// Configuración del sistema de aislamiento
#[derive(Debug, Clone)]
pub struct InsulationConfig {
    /// Longitud mínima de espaciador entre módulos (bp)
    pub min_spacer_length: usize,
    /// Longitud por defecto del espaciador (bp)
    pub default_spacer_length: usize,
    /// Usar terminador bidireccional
    pub bidirectional_terminators: bool,
    /// Terminador por defecto
    pub default_terminator: StandardTerminator,
    /// Añadir aisladores ribosomales (RiboJ)
    pub use_ribozyme_insulators: bool,
    /// Insertar espaciadores entre unidades transcripcionales
    pub inter_tu_spacing: bool,
    /// Nivel de aislamiento (0 = mínimo, 3 = máximo)
    pub isolation_level: u8,
}

impl Default for InsulationConfig {
    fn default() -> Self {
        Self {
            min_spacer_length: 50,
            default_spacer_length: 100,
            bidirectional_terminators: true,
            default_terminator: StandardTerminator::B0015,
            use_ribozyme_insulators: false,
            inter_tu_spacing: true,
            isolation_level: 2,
        }
    }
}

/// Terminadores estándar disponibles
#[derive(Debug, Clone, Copy, PartialEq)]
pub enum StandardTerminator {
    /// B0010 - Terminador T1 de E. coli rrnB
    B0010,
    /// B0012 - Terminador TE de bacteriófago T7
    B0012,
    /// B0015 - Doble terminador (B0010 + B0012) - más fuerte
    B0015,
    /// L3S2P21 - Terminador sintético fuerte
    L3S2P21,
    /// ECK120029600 - Terminador natural de E. coli
    ECK120029600,
}

impl StandardTerminator {
    /// Retorna la secuencia del terminador
    pub fn sequence(&self) -> &'static str {
        match self {
            Self::B0010 => "CCAGGCATCAAATAAAACGAAAGGCTCAGTCGAAAGACTGGGCCTTTCGTTTTATCTGTTGTTTGTCGGTGAACGCTCTC",
            Self::B0012 => "TCACACTGGCTCACCTTCGGGTGGGCCTTTCTGCGTTTATA",
            Self::B0015 => "CCAGGCATCAAATAAAACGAAAGGCTCAGTCGAAAGACTGGGCCTTTCGTTTTATCTGTTGTTTGTCGGTGAACGCTCTCTACTAGAGTCACACTGGCTCACCTTCGGGTGGGCCTTTCTGCGTTTATA",
            Self::L3S2P21 => "CTCGGTACCAAATTCCAGAAAAGAGGCCTCCCGAAAGGGGGGCCTTTTTTCGTTTTGGTCC",
            Self::ECK120029600 => "TTCAGCCAAAAAACTTAAGACCGCCGGTCTTGTCCACTACCTTGCAGTAATGCGGTGGACAGGATCGGCGGTTTTCTTTTCTCTTCTCAA",
        }
    }

    /// Retorna la longitud en pares de bases
    pub fn length(&self) -> usize {
        self.sequence().len()
    }

    /// Retorna la eficiencia de terminación (0.0 - 1.0)
    pub fn efficiency(&self) -> f64 {
        match self {
            Self::B0010 => 0.90,
            Self::B0012 => 0.85,
            Self::B0015 => 0.99,  // Doble terminador, muy eficiente
            Self::L3S2P21 => 0.97,
            Self::ECK120029600 => 0.95,
        }
    }

    /// Indica si es bidireccional
    pub fn is_bidirectional(&self) -> bool {
        matches!(self, Self::B0015 | Self::L3S2P21)
    }
}

/// Espaciadores estándar
#[derive(Debug, Clone)]
pub struct Spacer {
    /// Longitud en bp
    pub length: usize,
    /// Secuencia (generada o predefinida)
    pub sequence: String,
    /// Contenido GC objetivo (0.0 - 1.0)
    pub gc_content: f64,
}

impl Spacer {
    /// Genera un espaciador aleatorio con contenido GC controlado
    pub fn generate(length: usize, target_gc: f64) -> Self {
        let mut sequence = String::with_capacity(length);
        let gc_count = (length as f64 * target_gc) as usize;
        let at_count = length - gc_count;
        
        // Alternar para evitar repeticiones
        let mut gc_remaining = gc_count;
        let mut at_remaining = at_count;
        
        for i in 0..length {
            let use_gc = if gc_remaining == 0 {
                false
            } else if at_remaining == 0 {
                true
            } else {
                // Alternar con algo de variación
                (i % 3 != 0 && gc_remaining > 0) || at_remaining == 0
            };
            
            if use_gc {
                sequence.push(if i % 2 == 0 { 'G' } else { 'C' });
                gc_remaining = gc_remaining.saturating_sub(1);
            } else {
                sequence.push(if i % 2 == 0 { 'A' } else { 'T' });
                at_remaining = at_remaining.saturating_sub(1);
            }
        }
        
        Self {
            length,
            sequence,
            gc_content: target_gc,
        }
    }

    /// Genera un espaciador neutral (bajo impacto en estructura secundaria)
    pub fn neutral(length: usize) -> Self {
        // Secuencia diseñada para minimizar estructuras secundarias
        // Patrón: CAGTA repetido (GC ~40%, bajo hairpin potential)
        let pattern = "CAGTACAGTA";
        let mut sequence = String::with_capacity(length);
        
        while sequence.len() < length {
            let remaining = length - sequence.len();
            if remaining >= pattern.len() {
                sequence.push_str(pattern);
            } else {
                sequence.push_str(&pattern[..remaining]);
            }
        }
        
        Self {
            length,
            sequence,
            gc_content: 0.4,
        }
    }
}

/// Aislador ribosomal (ribozima que corta el 5' UTR)
#[derive(Debug, Clone)]
pub struct RibozymeInsulator {
    pub name: String,
    pub sequence: String,
}

impl RibozymeInsulator {
    /// RiboJ - ribozima auto-catalítica que normaliza la expresión
    pub fn riboj() -> Self {
        Self {
            name: "RiboJ".to_string(),
            // Secuencia de RiboJ (Lou et al., 2012)
            sequence: "AGCTGTCACCGGATGTGCTTTCCGGTCTGATGAGTCCGTGAGGACGAAACAGCCTCTACAAATAATTTTGTTTAA".to_string(),
        }
    }

    /// RiboJ10 - variante con mayor eficiencia
    pub fn riboj10() -> Self {
        Self {
            name: "RiboJ10".to_string(),
            sequence: "AGCTGTCACCGGATGTGCTTTCCGGTCTGATGAGTCCGTGAGGACGAAAGCGCCTCTACAAATAATTTTGTTTAA".to_string(),
        }
    }

    /// Insulator BydvJ
    pub fn bydvj() -> Self {
        Self {
            name: "BydvJ".to_string(),
            sequence: "CAGCTGTCACCGGATGTGCTTTCCGGTCTGATGAGTCCGTGAGGACGAAACAGCC".to_string(),
        }
    }
}

/// Motor principal de aislamiento genético
pub struct InsulationEngine {
    config: InsulationConfig,
}

impl InsulationEngine {
    pub fn new(config: InsulationConfig) -> Self {
        Self { config }
    }

    /// Aplica aislamiento completo a un programa Bio-IR
    pub fn insulate_program(&self, program: &mut BioIRProgram) {
        for circuit in &mut program.circuits {
            self.insulate_circuit(circuit);
        }
    }

    /// Aplica aislamiento a un circuito genético
    pub fn insulate_circuit(&self, circuit: &mut GeneticCircuit) {
        let tu_count = circuit.transcription_units.len();
        
        if tu_count == 0 {
            return;
        }

        // 1. Añadir terminadores entre unidades transcripcionales
        if self.config.isolation_level >= 1 {
            self.inject_terminators(circuit);
        }

        // 2. Añadir espaciadores entre módulos
        if self.config.isolation_level >= 2 && self.config.inter_tu_spacing {
            self.inject_spacers(circuit);
        }

        // 3. Añadir aisladores ribosomales
        if self.config.isolation_level >= 3 && self.config.use_ribozyme_insulators {
            self.inject_ribozyme_insulators(circuit);
        }

        // 4. Actualizar metadatos del circuito
        circuit.metadata.insert("insulated".to_string(), "true".to_string());
        circuit.metadata.insert("insulation_level".to_string(), 
            self.config.isolation_level.to_string());
    }

    /// Inyecta terminadores después de cada unidad transcripcional
    fn inject_terminators(&self, circuit: &mut GeneticCircuit) {
        let terminator = self.config.default_terminator;
        
        for tu in &mut circuit.transcription_units {
            // Verificar si ya tiene terminador
            if tu.terminator.is_none() {
                tu.terminator = Some(Terminator {
                    name: format!("{:?}", terminator),
                    sequence: terminator.sequence().to_string(),
                    efficiency: terminator.efficiency(),
                    bidirectional: terminator.is_bidirectional(),
                    registry_id: Some(format!("BBa_{:?}", terminator)),
                });
            }
        }

        // Si es bidireccional, añadir terminador reverso al inicio del siguiente TU
        if self.config.bidirectional_terminators {
            // Los terminadores bidireccionales ya cubren ambas direcciones
            // No necesitamos añadir más
        }
    }

    /// Inyecta espaciadores entre unidades transcripcionales
    fn inject_spacers(&self, circuit: &mut GeneticCircuit) {
        let spacer_len = self.config.default_spacer_length;
        
        // Generar espaciadores neutrales entre cada TU
        for tu in &mut circuit.transcription_units {
            // Añadir espaciador al upstream si no existe
            if tu.upstream_spacer.is_none() {
                let spacer = Spacer::neutral(spacer_len);
                tu.upstream_spacer = Some(spacer.sequence);
            }
            
            // Añadir espaciador al downstream
            if tu.downstream_spacer.is_none() {
                let spacer = Spacer::neutral(spacer_len / 2); // Más corto downstream
                tu.downstream_spacer = Some(spacer.sequence);
            }
        }
    }

    /// Inyecta aisladores ribozimáticos para normalizar expresión
    fn inject_ribozyme_insulators(&self, circuit: &mut GeneticCircuit) {
        let riboj = RibozymeInsulator::riboj();
        
        for tu in &mut circuit.transcription_units {
            // Añadir RiboJ después del promotor y antes del RBS
            if tu.ribozyme_insulator.is_none() {
                tu.ribozyme_insulator = Some(riboj.sequence.clone());
            }
        }
    }

    /// Genera la secuencia completa de un circuito aislado
    pub fn generate_insulated_sequence(&self, circuit: &GeneticCircuit) -> String {
        let mut sequence = String::new();

        for (i, tu) in circuit.transcription_units.iter().enumerate() {
            // Espaciador upstream
            if let Some(ref spacer) = tu.upstream_spacer {
                sequence.push_str(spacer);
            }

            // Promotor
            sequence.push_str(&tu.promoter.sequence);

            // Ribozima aisladora
            if let Some(ref ribozyme) = tu.ribozyme_insulator {
                sequence.push_str(ribozyme);
            }

            // RBS
            sequence.push_str(&tu.rbs.sequence);

            // CDS (secuencia codificante)
            sequence.push_str(&tu.cds.dna_sequence);

            // Terminador
            if let Some(ref term) = tu.terminator {
                sequence.push_str(&term.sequence);
            }

            // Espaciador downstream
            if let Some(ref spacer) = tu.downstream_spacer {
                sequence.push_str(spacer);
            }

            // Separador visual (no afecta secuencia final)
            if i < circuit.transcription_units.len() - 1 {
                // Los espaciadores ya están incluidos
            }
        }

        sequence
    }

    /// Calcula el overhead de aislamiento (bp adicionales)
    pub fn calculate_overhead(&self, circuit: &GeneticCircuit) -> usize {
        let mut overhead = 0;

        for tu in &circuit.transcription_units {
            if let Some(ref spacer) = tu.upstream_spacer {
                overhead += spacer.len();
            }
            if let Some(ref spacer) = tu.downstream_spacer {
                overhead += spacer.len();
            }
            if let Some(ref term) = tu.terminator {
                overhead += term.sequence.len();
            }
            if let Some(ref ribozyme) = tu.ribozyme_insulator {
                overhead += ribozyme.len();
            }
        }

        overhead
    }

    /// Estima el costo de ATP adicional por el aislamiento
    pub fn estimate_atp_overhead(&self, circuit: &GeneticCircuit) -> f64 {
        let overhead_bp = self.calculate_overhead(circuit) as f64;
        
        // Costo de transcripción: ~2 ATP por nucleótido
        // Los terminadores y espaciadores se transcriben pero no se traducen
        overhead_bp * 2.0
    }
}

/// Resultado del análisis de aislamiento
#[derive(Debug, Clone)]
pub struct InsulationReport {
    /// Número de terminadores añadidos
    pub terminators_added: usize,
    /// Número de espaciadores añadidos
    pub spacers_added: usize,
    /// Número de aisladores ribosomales añadidos
    pub ribozymes_added: usize,
    /// Overhead total en bp
    pub total_overhead_bp: usize,
    /// Overhead en ATP
    pub atp_overhead: f64,
    /// Eficiencia de aislamiento estimada
    pub estimated_efficiency: f64,
    /// Advertencias
    pub warnings: Vec<String>,
}

impl InsulationReport {
    pub fn generate(circuit: &GeneticCircuit, engine: &InsulationEngine) -> Self {
        let mut terminators_added = 0;
        let mut spacers_added = 0;
        let mut ribozymes_added = 0;
        let mut warnings = Vec::new();

        for tu in &circuit.transcription_units {
            if tu.terminator.is_some() {
                terminators_added += 1;
            } else {
                warnings.push(format!("TU '{}' sin terminador", tu.name));
            }

            if tu.upstream_spacer.is_some() {
                spacers_added += 1;
            }
            if tu.downstream_spacer.is_some() {
                spacers_added += 1;
            }

            if tu.ribozyme_insulator.is_some() {
                ribozymes_added += 1;
            }
        }

        let total_overhead_bp = engine.calculate_overhead(circuit);
        let atp_overhead = engine.estimate_atp_overhead(circuit);

        // Estimar eficiencia basada en componentes
        let base_efficiency = 0.7;
        let term_bonus = terminators_added as f64 * 0.05;
        let spacer_bonus = spacers_added as f64 * 0.02;
        let ribozyme_bonus = ribozymes_added as f64 * 0.08;
        let estimated_efficiency = (base_efficiency + term_bonus + spacer_bonus + ribozyme_bonus).min(0.99);

        Self {
            terminators_added,
            spacers_added,
            ribozymes_added,
            total_overhead_bp,
            atp_overhead,
            estimated_efficiency,
            warnings,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_terminator_sequences() {
        let b0015 = StandardTerminator::B0015;
        assert!(b0015.length() > 100);
        assert!(b0015.efficiency() > 0.95);
        assert!(b0015.is_bidirectional());
    }

    #[test]
    fn test_spacer_generation() {
        let spacer = Spacer::generate(100, 0.5);
        assert_eq!(spacer.length, 100);
        assert_eq!(spacer.sequence.len(), 100);
    }

    #[test]
    fn test_neutral_spacer() {
        let spacer = Spacer::neutral(50);
        assert_eq!(spacer.length, 50);
        assert!(spacer.gc_content < 0.5);
    }

    #[test]
    fn test_riboj_sequence() {
        let riboj = RibozymeInsulator::riboj();
        assert!(riboj.sequence.len() > 50);
    }
}
