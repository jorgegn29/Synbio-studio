#![allow(dead_code)]
//! Predicción de plegamiento de proteínas y ARN

use std::collections::HashMap;

/// Motor de predicción de estructura de proteínas
pub struct ProteinFolder;

impl ProteinFolder {
    /// Traduce secuencia de ADN a proteína
    pub fn translate(dna: &str) -> Option<String> {
        let codon_table = Self::codon_table();
        let dna_upper = dna.to_uppercase();
        let chars: Vec<char> = dna_upper.chars().collect();
        
        if chars.len() % 3 != 0 {
            return None;
        }

        let mut protein = String::new();
        for chunk in chars.chunks(3) {
            let codon: String = chunk.iter().collect();
            match codon_table.get(&codon) {
                Some(&aa) if aa == '*' => break, // Stop codon
                Some(&aa) => protein.push(aa),
                None => return None,
            }
        }

        Some(protein)
    }

    /// Tabla de codones estándar
    fn codon_table() -> HashMap<String, char> {
        let mut table = HashMap::new();
        
        // Fenilalanina
        table.insert("TTT".to_string(), 'F');
        table.insert("TTC".to_string(), 'F');
        
        // Leucina
        table.insert("TTA".to_string(), 'L');
        table.insert("TTG".to_string(), 'L');
        table.insert("CTT".to_string(), 'L');
        table.insert("CTC".to_string(), 'L');
        table.insert("CTA".to_string(), 'L');
        table.insert("CTG".to_string(), 'L');
        
        // Isoleucina
        table.insert("ATT".to_string(), 'I');
        table.insert("ATC".to_string(), 'I');
        table.insert("ATA".to_string(), 'I');
        
        // Metionina (Start)
        table.insert("ATG".to_string(), 'M');
        
        // Valina
        table.insert("GTT".to_string(), 'V');
        table.insert("GTC".to_string(), 'V');
        table.insert("GTA".to_string(), 'V');
        table.insert("GTG".to_string(), 'V');
        
        // Serina
        table.insert("TCT".to_string(), 'S');
        table.insert("TCC".to_string(), 'S');
        table.insert("TCA".to_string(), 'S');
        table.insert("TCG".to_string(), 'S');
        table.insert("AGT".to_string(), 'S');
        table.insert("AGC".to_string(), 'S');
        
        // Prolina
        table.insert("CCT".to_string(), 'P');
        table.insert("CCC".to_string(), 'P');
        table.insert("CCA".to_string(), 'P');
        table.insert("CCG".to_string(), 'P');
        
        // Treonina
        table.insert("ACT".to_string(), 'T');
        table.insert("ACC".to_string(), 'T');
        table.insert("ACA".to_string(), 'T');
        table.insert("ACG".to_string(), 'T');
        
        // Alanina
        table.insert("GCT".to_string(), 'A');
        table.insert("GCC".to_string(), 'A');
        table.insert("GCA".to_string(), 'A');
        table.insert("GCG".to_string(), 'A');
        
        // Tirosina
        table.insert("TAT".to_string(), 'Y');
        table.insert("TAC".to_string(), 'Y');
        
        // Stop
        table.insert("TAA".to_string(), '*');
        table.insert("TAG".to_string(), '*');
        table.insert("TGA".to_string(), '*');
        
        // Histidina
        table.insert("CAT".to_string(), 'H');
        table.insert("CAC".to_string(), 'H');
        
        // Glutamina
        table.insert("CAA".to_string(), 'Q');
        table.insert("CAG".to_string(), 'Q');
        
        // Asparagina
        table.insert("AAT".to_string(), 'N');
        table.insert("AAC".to_string(), 'N');
        
        // Lisina
        table.insert("AAA".to_string(), 'K');
        table.insert("AAG".to_string(), 'K');
        
        // Ácido aspártico
        table.insert("GAT".to_string(), 'D');
        table.insert("GAC".to_string(), 'D');
        
        // Ácido glutámico
        table.insert("GAA".to_string(), 'E');
        table.insert("GAG".to_string(), 'E');
        
        // Cisteína
        table.insert("TGT".to_string(), 'C');
        table.insert("TGC".to_string(), 'C');
        
        // Triptófano
        table.insert("TGG".to_string(), 'W');
        
        // Arginina
        table.insert("CGT".to_string(), 'R');
        table.insert("CGC".to_string(), 'R');
        table.insert("CGA".to_string(), 'R');
        table.insert("CGG".to_string(), 'R');
        table.insert("AGA".to_string(), 'R');
        table.insert("AGG".to_string(), 'R');
        
        // Glicina
        table.insert("GGT".to_string(), 'G');
        table.insert("GGC".to_string(), 'G');
        table.insert("GGA".to_string(), 'G');
        table.insert("GGG".to_string(), 'G');
        
        table
    }

    /// Analiza propiedades de la secuencia de aminoácidos
    pub fn analyze_sequence(protein: &str) -> ProteinProperties {
        let aa_props = Self::amino_acid_properties();
        
        let mut molecular_weight = 0.0;
        let mut charge_at_7 = 0.0;
        let mut hydropathy_sum = 0.0;
        let mut aliphatic_count = 0;
        
        for aa in protein.chars() {
            if let Some(props) = aa_props.get(&aa) {
                molecular_weight += props.molecular_weight;
                charge_at_7 += props.charge_at_ph7;
                hydropathy_sum += props.hydropathy;
                if props.aliphatic {
                    aliphatic_count += 1;
                }
            }
        }

        // Restar agua por cada enlace peptídico
        let peptide_bonds = protein.len().saturating_sub(1);
        molecular_weight -= 18.015 * peptide_bonds as f64;

        let len = protein.len() as f64;
        let gravy = hydropathy_sum / len;
        let aliphatic_index = (aliphatic_count as f64 / len) * 100.0;

        // Punto isoeléctrico aproximado
        let pi = Self::estimate_isoelectric_point(protein);

        // Coeficiente de extinción
        let extinction = Self::extinction_coefficient(protein);

        ProteinProperties {
            length: protein.len(),
            molecular_weight,
            theoretical_pi: pi,
            gravy,
            aliphatic_index,
            extinction_coefficient: extinction,
            net_charge_at_ph7: charge_at_7,
            instability_index: Self::instability_index(protein),
        }
    }

    /// Propiedades de aminoácidos
    fn amino_acid_properties() -> HashMap<char, AminoAcidProps> {
        let mut props = HashMap::new();
        
        props.insert('A', AminoAcidProps { molecular_weight: 89.09, hydropathy: 1.8, charge_at_ph7: 0.0, aliphatic: true });
        props.insert('R', AminoAcidProps { molecular_weight: 174.20, hydropathy: -4.5, charge_at_ph7: 1.0, aliphatic: false });
        props.insert('N', AminoAcidProps { molecular_weight: 132.12, hydropathy: -3.5, charge_at_ph7: 0.0, aliphatic: false });
        props.insert('D', AminoAcidProps { molecular_weight: 133.10, hydropathy: -3.5, charge_at_ph7: -1.0, aliphatic: false });
        props.insert('C', AminoAcidProps { molecular_weight: 121.16, hydropathy: 2.5, charge_at_ph7: 0.0, aliphatic: false });
        props.insert('Q', AminoAcidProps { molecular_weight: 146.15, hydropathy: -3.5, charge_at_ph7: 0.0, aliphatic: false });
        props.insert('E', AminoAcidProps { molecular_weight: 147.13, hydropathy: -3.5, charge_at_ph7: -1.0, aliphatic: false });
        props.insert('G', AminoAcidProps { molecular_weight: 75.07, hydropathy: -0.4, charge_at_ph7: 0.0, aliphatic: false });
        props.insert('H', AminoAcidProps { molecular_weight: 155.16, hydropathy: -3.2, charge_at_ph7: 0.1, aliphatic: false });
        props.insert('I', AminoAcidProps { molecular_weight: 131.18, hydropathy: 4.5, charge_at_ph7: 0.0, aliphatic: true });
        props.insert('L', AminoAcidProps { molecular_weight: 131.18, hydropathy: 3.8, charge_at_ph7: 0.0, aliphatic: true });
        props.insert('K', AminoAcidProps { molecular_weight: 146.19, hydropathy: -3.9, charge_at_ph7: 1.0, aliphatic: false });
        props.insert('M', AminoAcidProps { molecular_weight: 149.21, hydropathy: 1.9, charge_at_ph7: 0.0, aliphatic: false });
        props.insert('F', AminoAcidProps { molecular_weight: 165.19, hydropathy: 2.8, charge_at_ph7: 0.0, aliphatic: false });
        props.insert('P', AminoAcidProps { molecular_weight: 115.13, hydropathy: -1.6, charge_at_ph7: 0.0, aliphatic: false });
        props.insert('S', AminoAcidProps { molecular_weight: 105.09, hydropathy: -0.8, charge_at_ph7: 0.0, aliphatic: false });
        props.insert('T', AminoAcidProps { molecular_weight: 119.12, hydropathy: -0.7, charge_at_ph7: 0.0, aliphatic: false });
        props.insert('W', AminoAcidProps { molecular_weight: 204.23, hydropathy: -0.9, charge_at_ph7: 0.0, aliphatic: false });
        props.insert('Y', AminoAcidProps { molecular_weight: 181.19, hydropathy: -1.3, charge_at_ph7: 0.0, aliphatic: false });
        props.insert('V', AminoAcidProps { molecular_weight: 117.15, hydropathy: 4.2, charge_at_ph7: 0.0, aliphatic: true });
        
        props
    }

    /// Estima punto isoeléctrico
    fn estimate_isoelectric_point(protein: &str) -> f64 {
        // Simplificación usando composición de aminoácidos
        let positive: f64 = protein.chars()
            .filter(|&c| c == 'R' || c == 'K' || c == 'H')
            .count() as f64;
        let negative: f64 = protein.chars()
            .filter(|&c| c == 'D' || c == 'E')
            .count() as f64;
        
        // Estimación simple
        if positive > negative {
            7.0 + (positive - negative) / protein.len() as f64 * 3.0
        } else {
            7.0 - (negative - positive) / protein.len() as f64 * 3.0
        }
    }

    /// Coeficiente de extinción molar a 280nm
    fn extinction_coefficient(protein: &str) -> f64 {
        let trp = protein.chars().filter(|&c| c == 'W').count() as f64;
        let tyr = protein.chars().filter(|&c| c == 'Y').count() as f64;
        let cys = protein.chars().filter(|&c| c == 'C').count() as f64;
        
        // Fórmula de Pace et al.
        5500.0 * trp + 1490.0 * tyr + 125.0 * cys
    }

    /// Índice de inestabilidad (Guruprasad et al.)
    fn instability_index(protein: &str) -> f64 {
        // Tabla simplificada de pesos de dipéptidos
        let chars: Vec<char> = protein.chars().collect();
        let mut diwv_sum = 0.0;
        
        for _i in 0..chars.len().saturating_sub(1) {
            // Valor promedio simplificado
            diwv_sum += 1.0;
        }
        
        (10.0 / protein.len() as f64) * diwv_sum
    }

    /// Predice estructura secundaria simple (Chou-Fasman simplificado)
    pub fn predict_secondary_structure(protein: &str) -> SecondaryStructure {
        let helix_formers = ['A', 'E', 'L', 'M', 'Q', 'K', 'R', 'H'];
        let sheet_formers = ['V', 'I', 'Y', 'F', 'W', 'T', 'C'];
        
        let mut helix_score = 0.0;
        let mut sheet_score = 0.0;
        let mut coil_score = 0.0;
        
        for aa in protein.chars() {
            if helix_formers.contains(&aa) {
                helix_score += 1.0;
            } else if sheet_formers.contains(&aa) {
                sheet_score += 1.0;
            } else {
                coil_score += 1.0;
            }
        }
        
        let total = protein.len() as f64;
        
        SecondaryStructure {
            helix_percentage: (helix_score / total) * 100.0,
            sheet_percentage: (sheet_score / total) * 100.0,
            coil_percentage: (coil_score / total) * 100.0,
        }
    }
}

/// Propiedades de aminoácido
struct AminoAcidProps {
    molecular_weight: f64,
    hydropathy: f64,
    charge_at_ph7: f64,
    aliphatic: bool,
}

/// Propiedades de proteína
#[derive(Debug, Clone)]
pub struct ProteinProperties {
    pub length: usize,
    pub molecular_weight: f64,
    pub theoretical_pi: f64,
    pub gravy: f64,
    pub aliphatic_index: f64,
    pub extinction_coefficient: f64,
    pub net_charge_at_ph7: f64,
    pub instability_index: f64,
}

/// Estructura secundaria predicha
#[derive(Debug, Clone)]
pub struct SecondaryStructure {
    pub helix_percentage: f64,
    pub sheet_percentage: f64,
    pub coil_percentage: f64,
}

/// Predictor de plegamiento de ARN
pub struct RNAFolder;

impl RNAFolder {
    /// Convierte ADN a ARN
    pub fn transcribe(dna: &str) -> String {
        dna.chars()
            .map(|c| match c.to_ascii_uppercase() {
                'T' => 'U',
                other => other,
            })
            .collect()
    }

    /// Encuentra la estructura de mínima energía libre (MFE) simplificada
    /// Retorna notación de puntos y paréntesis
    pub fn predict_structure(rna: &str) -> RNAStructure {
        let len = rna.len();
        let chars: Vec<char> = rna.to_uppercase().chars().collect();
        
        // Algoritmo de Nussinov simplificado
        let mut dp = vec![vec![0i32; len]; len];
        let mut traceback = vec![vec![None::<(usize, usize)>; len]; len];
        
        // Llenar tabla DP
        for l in 1..len {
            for i in 0..len - l {
                let j = i + l;
                
                // Caso 1: i no apareado
                dp[i][j] = dp[i + 1][j];
                
                // Caso 2: j no apareado
                if dp[i][j - 1] > dp[i][j] {
                    dp[i][j] = dp[i][j - 1];
                }
                
                // Caso 3: i-j apareados
                if Self::can_pair(chars[i], chars[j]) && j > i + 3 {
                    let paired_score = dp[i + 1][j - 1] + 1;
                    if paired_score > dp[i][j] {
                        dp[i][j] = paired_score;
                        traceback[i][j] = Some((i, j));
                    }
                }
                
                // Caso 4: bifurcación
                for k in i + 1..j {
                    let bifur_score = dp[i][k] + dp[k + 1][j];
                    if bifur_score > dp[i][j] {
                        dp[i][j] = bifur_score;
                    }
                }
            }
        }

        // Construir estructura
        let mut structure = vec!['.'; len];
        let mut pairs = Vec::new();
        Self::traceback_structure(&dp, &traceback, &chars, 0, len - 1, &mut structure, &mut pairs);
        
        // Calcular energía aproximada
        let energy = Self::estimate_energy(&pairs, &chars);

        RNAStructure {
            sequence: rna.to_string(),
            dot_bracket: structure.iter().collect(),
            pairs,
            mfe: energy,
            base_pair_count: dp[0][len - 1],
        }
    }

    /// Verifica si dos bases pueden aparearse
    fn can_pair(a: char, b: char) -> bool {
        matches!((a, b), 
            ('A', 'U') | ('U', 'A') |
            ('G', 'C') | ('C', 'G') |
            ('G', 'U') | ('U', 'G')
        )
    }

    /// Reconstruye estructura desde tabla DP
    fn traceback_structure(
        dp: &[Vec<i32>],
        traceback: &[Vec<Option<(usize, usize)>>],
        chars: &[char],
        i: usize,
        j: usize,
        structure: &mut [char],
        pairs: &mut Vec<(usize, usize)>,
    ) {
        if i >= j {
            return;
        }

        if let Some((pi, pj)) = traceback[i][j] {
            structure[pi] = '(';
            structure[pj] = ')';
            pairs.push((pi, pj));
            Self::traceback_structure(dp, traceback, chars, i + 1, j - 1, structure, pairs);
        } else if dp[i][j] == dp[i + 1][j] {
            Self::traceback_structure(dp, traceback, chars, i + 1, j, structure, pairs);
        } else if dp[i][j] == dp[i][j - 1] {
            Self::traceback_structure(dp, traceback, chars, i, j - 1, structure, pairs);
        }
    }

    /// Estima energía de la estructura
    fn estimate_energy(pairs: &[(usize, usize)], chars: &[char]) -> f64 {
        let mut energy = 0.0;
        
        for &(i, j) in pairs {
            // Energía aproximada por tipo de par de bases
            let pair_energy = match (chars[i], chars[j]) {
                ('G', 'C') | ('C', 'G') => -3.0,
                ('A', 'U') | ('U', 'A') => -2.0,
                ('G', 'U') | ('U', 'G') => -1.0,
                _ => 0.0,
            };
            energy += pair_energy;
        }
        
        energy
    }
}

/// Estructura de ARN predicha
#[derive(Debug, Clone)]
pub struct RNAStructure {
    pub sequence: String,
    pub dot_bracket: String,
    pub pairs: Vec<(usize, usize)>,
    pub mfe: f64,
    pub base_pair_count: i32,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_translate() {
        let dna = "ATGGCC";
        let protein = ProteinFolder::translate(dna);
        assert_eq!(protein, Some("MA".to_string()));
    }

    #[test]
    fn test_transcribe() {
        let dna = "ATGC";
        let rna = RNAFolder::transcribe(dna);
        assert_eq!(rna, "AUGC");
    }

    #[test]
    fn test_protein_properties() {
        let protein = "MSKGEELFTGVVPILVELDGDVNGHKFSVSGEGEGDATYGKLTLKFICTTGKLPVPWPTLVTTFSYGVQCFSRYPDHMKQHDFFKSAMPEGYVQERTIFFKDDGNYKTRAEVKFEGDTLVNRIELKGIDFKEDGNILGHKLEYNYNSHNVYIMADKQKNGIKVNFKIRHNIEDGSVQLADHYQQNTPIGDGPVLLPDNHYLSTQSALSKDPNEKRDHMVLLEFVTAAGITHGMDELYK";
        let props = ProteinFolder::analyze_sequence(protein);
        assert!(props.molecular_weight > 25000.0); // GFP ~27 kDa
    }
}
