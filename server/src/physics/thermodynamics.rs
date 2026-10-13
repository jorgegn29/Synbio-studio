#![allow(dead_code)]
//! Motor de termodinámica para análisis de secuencias biológicas

/// Parámetros termodinámicos para pares de bases de ADN (kcal/mol)
/// Basado en SantaLucia 1998
pub struct DNAThermodynamics;

impl DNAThermodynamics {
    /// Entalpía de apilamiento (ΔH) para vecinos más cercanos - kcal/mol
    pub const ENTHALPY: [[f64; 4]; 4] = [
        // A     T     G     C     (segunda base)
        [-7.6, -7.2, -7.8, -8.4], // A (primera base)
        [-7.2, -7.6, -8.2, -8.5], // T
        [-8.2, -8.5, -8.0, -9.8], // G
        [-7.8, -8.4, -10.6, -8.0], // C
    ];

    /// Entropía de apilamiento (ΔS) para vecinos más cercanos - cal/(mol·K)
    pub const ENTROPY: [[f64; 4]; 4] = [
        // A      T      G      C
        [-21.3, -20.4, -21.0, -22.4], // A
        [-21.3, -21.3, -22.2, -22.7], // T
        [-22.2, -22.7, -19.9, -24.4], // G
        [-21.0, -22.4, -27.2, -19.9], // C
    ];

    /// Contribución de iniciación
    pub const INIT_H: f64 = 0.2;  // kcal/mol
    pub const INIT_S: f64 = -5.7; // cal/(mol·K)

    /// Corrección por terminación AT
    pub const AT_TERM_H: f64 = 2.2;  // kcal/mol
    pub const AT_TERM_S: f64 = 6.9;  // cal/(mol·K)

    /// Convierte base a índice
    fn base_to_index(base: char) -> Option<usize> {
        match base.to_ascii_uppercase() {
            'A' => Some(0),
            'T' | 'U' => Some(1),
            'G' => Some(2),
            'C' => Some(3),
            _ => None,
        }
    }

    /// Calcula ΔG para una secuencia de ADN a una temperatura dada
    /// Retorna ΔG en kcal/mol
    pub fn calculate_delta_g(sequence: &str, temperature_celsius: f64) -> Option<f64> {
        if sequence.len() < 2 {
            return None;
        }

        let temp_kelvin = temperature_celsius + 273.15;
        let chars: Vec<char> = sequence.chars().collect();

        let mut total_h = Self::INIT_H;
        let mut total_s = Self::INIT_S;

        // Sumar contribuciones de vecinos más cercanos
        for i in 0..chars.len() - 1 {
            let idx1 = Self::base_to_index(chars[i])?;
            let idx2 = Self::base_to_index(chars[i + 1])?;

            total_h += Self::ENTHALPY[idx1][idx2];
            total_s += Self::ENTROPY[idx1][idx2];
        }

        // Corrección por terminación AT
        let first = chars.first()?;
        let last = chars.last()?;
        if matches!(first.to_ascii_uppercase(), 'A' | 'T') {
            total_h += Self::AT_TERM_H;
            total_s += Self::AT_TERM_S;
        }
        if matches!(last.to_ascii_uppercase(), 'A' | 'T') {
            total_h += Self::AT_TERM_H;
            total_s += Self::AT_TERM_S;
        }

        // ΔG = ΔH - TΔS (convertir ΔS de cal a kcal)
        let delta_g = total_h - (temp_kelvin * total_s / 1000.0);
        Some(delta_g)
    }

    /// Calcula la temperatura de fusión (Tm) para una secuencia
    /// Usa el método de vecinos más cercanos
    pub fn calculate_tm(sequence: &str, na_concentration_m: f64) -> Option<f64> {
        if sequence.len() < 2 {
            return None;
        }

        let chars: Vec<char> = sequence.chars().collect();

        let mut total_h = Self::INIT_H;
        let mut total_s = Self::INIT_S;

        for i in 0..chars.len() - 1 {
            let idx1 = Self::base_to_index(chars[i])?;
            let idx2 = Self::base_to_index(chars[i + 1])?;

            total_h += Self::ENTHALPY[idx1][idx2];
            total_s += Self::ENTROPY[idx1][idx2];
        }

        // Corrección por sal (Na+)
        // ΔS_corrected = ΔS + 0.368 * N * ln[Na+]
        let n = sequence.len() as f64;
        let salt_correction = 0.368 * (n - 1.0) * na_concentration_m.ln();
        total_s += salt_correction;

        // Tm = ΔH / (ΔS + R * ln(Ct/4)) - 273.15
        // donde R = 1.987 cal/(mol·K), Ct = concentración total de oligo (asumimos 1 µM)
        let r: f64 = 1.987;
        let ct: f64 = 1e-6; // 1 µM
        let tm = (total_h * 1000.0) / (total_s + r * (ct / 4.0_f64).ln()) - 273.15;

        Some(tm)
    }

    /// Calcula el contenido GC
    pub fn gc_content(sequence: &str) -> f64 {
        let gc = sequence.chars()
            .filter(|c| matches!(c.to_ascii_uppercase(), 'G' | 'C'))
            .count();
        gc as f64 / sequence.len() as f64 * 100.0
    }

    /// Estima Tm usando la fórmula simple de Wallace
    /// Tm = 2*(A+T) + 4*(G+C)
    pub fn tm_simple(sequence: &str) -> f64 {
        let at = sequence.chars()
            .filter(|c| matches!(c.to_ascii_uppercase(), 'A' | 'T' | 'U'))
            .count();
        let gc = sequence.chars()
            .filter(|c| matches!(c.to_ascii_uppercase(), 'G' | 'C'))
            .count();
        
        2.0 * at as f64 + 4.0 * gc as f64
    }
}

/// Parámetros termodinámicos para ARN
pub struct RNAThermodynamics;

impl RNAThermodynamics {
    /// Entalpía de apilamiento para ARN (kcal/mol)
    /// Basado en Turner 2004
    pub const ENTHALPY: [[f64; 4]; 4] = [
        // A     U     G     C
        [-6.82, -9.38, -10.48, -11.40], // A
        [-6.82, -6.57, -10.44, -10.48], // U
        [-11.40, -11.40, -13.39, -14.88], // G
        [-10.44, -9.38, -11.40, -13.39], // C
    ];

    /// Entropía de apilamiento para ARN (cal/(mol·K))
    pub const ENTROPY: [[f64; 4]; 4] = [
        // A      U      G      C
        [-19.0, -26.7, -27.1, -29.5], // A
        [-19.0, -18.4, -26.9, -27.1], // U
        [-29.5, -29.5, -32.7, -36.9], // G
        [-26.9, -26.7, -29.5, -32.7], // C
    ];

    /// Convierte base de ARN a índice
    fn base_to_index(base: char) -> Option<usize> {
        match base.to_ascii_uppercase() {
            'A' => Some(0),
            'U' => Some(1),
            'G' => Some(2),
            'C' => Some(3),
            _ => None,
        }
    }

    /// Calcula energía libre de plegamiento aproximada
    pub fn folding_energy(sequence: &str, temperature_celsius: f64) -> Option<f64> {
        if sequence.len() < 4 {
            return None;
        }

        let temp_kelvin = temperature_celsius + 273.15;
        let chars: Vec<char> = sequence.chars().collect();
        
        let mut total_h = 0.0;
        let mut total_s = 0.0;

        // Calcular para regiones de doble cadena potenciales
        // (simplificación: asumimos estructura lineal)
        for i in 0..chars.len() - 1 {
            if let (Some(idx1), Some(idx2)) = (
                Self::base_to_index(chars[i]),
                Self::base_to_index(chars[i + 1])
            ) {
                total_h += Self::ENTHALPY[idx1][idx2];
                total_s += Self::ENTROPY[idx1][idx2];
            }
        }

        let delta_g = total_h - (temp_kelvin * total_s / 1000.0);
        Some(delta_g)
    }

    /// Predice estructura secundaria simple (solo horquillas básicas)
    pub fn predict_hairpins(sequence: &str, min_loop: usize, min_stem: usize) -> Vec<HairpinPrediction> {
        let mut hairpins = Vec::new();
        let chars: Vec<char> = sequence.to_uppercase().chars().collect();
        let len = chars.len();

        if len < min_stem * 2 + min_loop {
            return hairpins;
        }

        // Buscar regiones complementarias
        for i in 0..len - min_stem * 2 - min_loop {
            for j in i + min_stem + min_loop..len {
                let stem_len = Self::find_stem_length(&chars, i, j, min_stem);
                if stem_len >= min_stem {
                    let loop_start = i + stem_len;
                    let loop_end = j - stem_len + 1;
                    let loop_len = loop_end - loop_start;
                    
                    if loop_len >= min_loop && loop_len <= 10 {
                        hairpins.push(HairpinPrediction {
                            start: i,
                            end: j,
                            stem_length: stem_len,
                            loop_length: loop_len,
                            loop_sequence: chars[loop_start..loop_end].iter().collect(),
                            energy: Self::estimate_hairpin_energy(stem_len, loop_len),
                        });
                    }
                }
            }
        }

        hairpins
    }

    /// Encuentra longitud del tallo
    fn find_stem_length(chars: &[char], start: usize, end: usize, min: usize) -> usize {
        let mut len = 0;
        let max_possible = (end - start) / 2;
        
        for i in 0..max_possible {
            if start + i >= end - i {
                break;
            }
            if Self::is_complement(chars[start + i], chars[end - i]) {
                len += 1;
            } else if len >= min {
                break;
            } else {
                len = 0;
            }
        }
        len
    }

    /// Verifica si dos bases son complementarias
    fn is_complement(a: char, b: char) -> bool {
        matches!((a, b), 
            ('A', 'U') | ('U', 'A') |
            ('G', 'C') | ('C', 'G') |
            ('G', 'U') | ('U', 'G')  // Wobble pair
        )
    }

    /// Estima energía de horquilla
    fn estimate_hairpin_energy(stem_len: usize, loop_len: usize) -> f64 {
        // Aproximación simple
        let stem_contribution = -1.5 * stem_len as f64; // ~-1.5 kcal/mol por par
        let loop_penalty = match loop_len {
            3 => 5.4,
            4 => 5.6,
            5 => 5.7,
            6 => 5.4,
            _ => 5.9 + 1.75 * (loop_len as f64 / 6.0).ln(),
        };
        stem_contribution + loop_penalty
    }
}

/// Predicción de horquilla de ARN
#[derive(Debug, Clone)]
pub struct HairpinPrediction {
    pub start: usize,
    pub end: usize,
    pub stem_length: usize,
    pub loop_length: usize,
    pub loop_sequence: String,
    pub energy: f64,
}

/// Análisis termodinámico completo
#[derive(Debug, Clone)]
pub struct ThermodynamicAnalysis {
    pub sequence: String,
    pub delta_g: f64,
    pub tm: f64,
    pub gc_content: f64,
    pub hairpins: Vec<HairpinPrediction>,
    pub stability: StabilityRating,
    pub warnings: Vec<String>,
}

/// Clasificación de estabilidad
#[derive(Debug, Clone, Copy, PartialEq)]
pub enum StabilityRating {
    VeryStable,
    Stable,
    Moderate,
    Unstable,
    VeryUnstable,
}

impl ThermodynamicAnalysis {
    /// Analiza una secuencia de ADN
    pub fn analyze_dna(sequence: &str) -> Self {
        let delta_g = DNAThermodynamics::calculate_delta_g(sequence, 37.0)
            .unwrap_or(0.0);
        let tm = DNAThermodynamics::calculate_tm(sequence, 0.1)
            .unwrap_or(0.0);
        let gc = DNAThermodynamics::gc_content(sequence);

        let mut warnings = Vec::new();

        // Evaluar estabilidad
        let stability = if delta_g < -15.0 {
            StabilityRating::VeryStable
        } else if delta_g < -10.0 {
            StabilityRating::Stable
        } else if delta_g < -5.0 {
            StabilityRating::Moderate
        } else if delta_g < 0.0 {
            warnings.push("Secuencia marginalmente estable".to_string());
            StabilityRating::Unstable
        } else {
            warnings.push("⚠️ Secuencia termodinámicamente inestable".to_string());
            StabilityRating::VeryUnstable
        };

        // Advertencias de contenido GC
        if gc < 30.0 {
            warnings.push("Contenido GC bajo - puede afectar estabilidad".to_string());
        } else if gc > 70.0 {
            warnings.push("Contenido GC alto - posibles estructuras secundarias".to_string());
        }

        // Advertencias de Tm
        if tm < 50.0 {
            warnings.push(format!("Tm bajo ({:.1}°C) - considere optimizar", tm));
        } else if tm > 72.0 {
            warnings.push(format!("Tm alto ({:.1}°C) - puede dificultar PCR", tm));
        }

        Self {
            sequence: sequence.to_string(),
            delta_g,
            tm,
            gc_content: gc,
            hairpins: Vec::new(),
            stability,
            warnings,
        }
    }

    /// Analiza una secuencia de ARN
    pub fn analyze_rna(sequence: &str) -> Self {
        let delta_g = RNAThermodynamics::folding_energy(sequence, 37.0)
            .unwrap_or(0.0);
        let gc = DNAThermodynamics::gc_content(sequence);
        let hairpins = RNAThermodynamics::predict_hairpins(sequence, 3, 4);

        let mut warnings = Vec::new();

        // Evaluar estabilidad
        let stability = if delta_g < -20.0 {
            StabilityRating::VeryStable
        } else if delta_g < -10.0 {
            StabilityRating::Stable
        } else if delta_g < -5.0 {
            StabilityRating::Moderate
        } else {
            warnings.push("ARN puede tener estructura inestable".to_string());
            StabilityRating::Unstable
        };

        if !hairpins.is_empty() {
            warnings.push(format!(
                "{} estructura(s) secundaria(s) predicha(s)",
                hairpins.len()
            ));
        }

        Self {
            sequence: sequence.to_string(),
            delta_g,
            tm: 0.0, // No aplicable para ARN de cadena simple
            gc_content: gc,
            hairpins,
            stability,
            warnings,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_gc_content() {
        assert_eq!(DNAThermodynamics::gc_content("ATGC"), 50.0);
        assert_eq!(DNAThermodynamics::gc_content("GGCC"), 100.0);
        assert_eq!(DNAThermodynamics::gc_content("AATT"), 0.0);
    }

    #[test]
    fn test_tm_simple() {
        // ATGC debería dar 2*2 + 4*2 = 12
        assert_eq!(DNAThermodynamics::tm_simple("ATGC"), 12.0);
    }

    #[test]
    fn test_delta_g() {
        let dg = DNAThermodynamics::calculate_delta_g("ATGCATGC", 37.0);
        assert!(dg.is_some());
        assert!(dg.unwrap() < 0.0); // Debería ser negativo (estable)
    }
}
