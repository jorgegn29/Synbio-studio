//! Optional kinetic parameters declared in BioScript.
//!
//! Unset fields keep the historical export defaults: Hill coefficient 2,
//! SBML Hill threshold 10, basal transcription 0, and the promoter / RBS
//! rates already used by the SBML generator.

#[derive(Debug, Clone, Default, PartialEq)]
pub struct KineticParams {
    /// Hill coefficient. SBML and the LLVM helper both default to 2.
    pub hill: Option<f64>,
    /// Hill threshold (K). The SBML default is 10; see the exporter.
    pub k: Option<f64>,
    /// Transcription rate, overriding promoter strength.
    pub k_txn: Option<f64>,
    /// Translation rate, overriding the RBS rate.
    pub k_tln: Option<f64>,
    /// Basal (leaky) transcription added to a regulated rate law.
    pub k_leak: Option<f64>,
    /// mRNA degradation rate (per second in the SBML export).
    pub k_mrna_deg: Option<f64>,
    /// Protein degradation rate (per second in the SBML export).
    pub k_prot_deg: Option<f64>,
    /// Initial mRNA concentration. Unset keeps `initialAmount="0"`.
    pub initial_mrna: Option<f64>,
    /// Initial protein concentration. Unset keeps `initialAmount="0"`.
    pub initial_protein: Option<f64>,
}

impl KineticParams {
    /// Record one named value. Unknown names are rejected so a typo is not dropped.
    pub fn set(&mut self, key: &str, value: f64) -> Result<(), String> {
        let slot = match key {
            "hill" | "n" | "hill_coefficient" => &mut self.hill,
            "K" | "k" | "k_half" | "K_hill" => &mut self.k,
            "k_txn" | "transcription" => &mut self.k_txn,
            "k_tln" | "translation" => &mut self.k_tln,
            "k_leak" | "basal" | "a0" => &mut self.k_leak,
            "k_mRNA_deg" | "mrna_deg" => &mut self.k_mrna_deg,
            "k_prot_deg" | "protein_deg" => &mut self.k_prot_deg,
            "initial_mRNA" | "mrna0" => &mut self.initial_mrna,
            "initial_protein" | "protein0" => &mut self.initial_protein,
            other => {
                return Err(format!(
                    "unknown kinetic parameter '{other}'. Expected hill, n, K, k_txn, k_tln, k_leak, basal, k_mRNA_deg, k_prot_deg, initial_mRNA, or initial_protein"
                ));
            }
        };
        *slot = Some(value);
        Ok(())
    }

    /// `top` replaces any field it sets. Used when a later block overrides an earlier one.
    pub fn with_override(&self, top: &KineticParams) -> KineticParams {
        KineticParams {
            hill: top.hill.or(self.hill),
            k: top.k.or(self.k),
            k_txn: top.k_txn.or(self.k_txn),
            k_tln: top.k_tln.or(self.k_tln),
            k_leak: top.k_leak.or(self.k_leak),
            k_mrna_deg: top.k_mrna_deg.or(self.k_mrna_deg),
            k_prot_deg: top.k_prot_deg.or(self.k_prot_deg),
            initial_mrna: top.initial_mrna.or(self.initial_mrna),
            initial_protein: top.initial_protein.or(self.initial_protein),
        }
    }
}

/// First set value wins. `default` is used when every entry is `None`.
pub fn first_or(values: &[Option<f64>], default: f64) -> f64 {
    values.iter().copied().flatten().next().unwrap_or(default)
}

/// A `kinetics` block: circuit-wide defaults plus optional per-part sections.
#[derive(Debug, Clone, Default)]
pub struct KineticBlock {
    pub defaults: KineticParams,
    pub named: Vec<(String, KineticParams)>,
}

impl KineticParams {
    /// Rates, degradation, and initial conditions. Hill and K stay unset.
    pub fn rate_fields(&self) -> KineticParams {
        KineticParams {
            k_txn: self.k_txn,
            k_tln: self.k_tln,
            k_leak: self.k_leak,
            k_mrna_deg: self.k_mrna_deg,
            k_prot_deg: self.k_prot_deg,
            initial_mrna: self.initial_mrna,
            initial_protein: self.initial_protein,
            ..KineticParams::default()
        }
    }

    /// Hill coefficient and threshold only.
    pub fn hill_fields(&self) -> KineticParams {
        KineticParams {
            hill: self.hill,
            k: self.k,
            ..KineticParams::default()
        }
    }
}
