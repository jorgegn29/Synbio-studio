#![allow(dead_code)]
//! Unit System for BioScript — Dimensional Analysis
//!
//! This module implements compile-time unit checking for biological measurements.
//! The compiler prevents mixing incompatible units:
//!
//!   let od = 0.6 OD600;
//!   let conc = 100.0 nM;
//!   let total = od + conc;  // ← COMPILE ERROR: cannot add OD₆₀₀ + nM
//!
//!   let c1 = 10.0 nM;
//!   let c2 = 5.0 µM;
//!   let total = c1 + c2;  // ← OK: both are Concentration, auto-converts to base unit
//!
//! Supported dimensions:
//!   - Concentration (M, mM, µM, nM, pM)
//!   - Optical Density (OD₆₀₀, OD₂₈₀)
//!   - Fluorescence (RFU, MFI, MEFL)
//!   - Promoter Activity (RPU)
//!   - Mass (Da, kDa, pg, ng, µg, mg, g)
//!   - Volume (pL, nL, µL, mL, L)
//!   - Length/genetic (bp, kb, Mb)
//!   - Temperature (°C, K)
//!   - Time (s, min, h)
//!   - Rate (dbl/h, bp/s)
//!   - Energy (kcal/mol, kJ/mol)

use crate::compiler::bio_types::{BioType, MeasurementType, Dimension};
use std::fmt;

// ═══════════════════════════════════════════════════════════════════════════════
//  UNIT CHECK RESULT
// ═══════════════════════════════════════════════════════════════════════════════

/// Result of a unit compatibility check.
#[derive(Debug, Clone)]
pub enum UnitCheckResult {
    /// Units are the same — no conversion needed.
    Same,
    /// Units are compatible (same dimension) — auto-conversion possible.
    Compatible {
        from: MeasurementType,
        to: MeasurementType,
        conversion_factor: f64,
    },
    /// Units are incompatible — type error.
    Incompatible {
        left: MeasurementType,
        right: MeasurementType,
        left_dimension: Dimension,
        right_dimension: Dimension,
        message: String,
    },
}

// ═══════════════════════════════════════════════════════════════════════════════
//  UNIT CHECKER
// ═══════════════════════════════════════════════════════════════════════════════

/// The unit checker verifies measurement type compatibility and provides
/// conversion factors when units are compatible.
pub struct UnitChecker;

impl UnitChecker {
    /// Check if two measurement types can be used together in an arithmetic operation.
    pub fn check_binary_op(left: &MeasurementType, right: &MeasurementType) -> UnitCheckResult {
        if left == right {
            return UnitCheckResult::Same;
        }

        let left_dim = left.dimension();
        let right_dim = right.dimension();

        if left_dim == right_dim {
            // Same dimension — calculate conversion factor
            let factor = match (left.to_base_factor(), right.to_base_factor()) {
                (Some(l), Some(r)) => r / l,
                _ => 1.0,
            };
            UnitCheckResult::Compatible {
                from: right.clone(),
                to: left.clone(),
                conversion_factor: factor,
            }
        } else {
            UnitCheckResult::Incompatible {
                left: left.clone(),
                right: right.clone(),
                left_dimension: left_dim,
                right_dimension: right_dim,
                message: format!(
                    "No se pueden mezclar {} ({:?}) con {} ({:?}). Estas son magnitudes físicas incompatibles.",
                    left.display_name(), left_dim,
                    right.display_name(), right_dim
                ),
            }
        }
    }

    /// Check if a measurement can be assigned to a target type.
    pub fn check_assignment(
        value_type: &MeasurementType,
        target_type: &MeasurementType,
    ) -> UnitCheckResult {
        Self::check_binary_op(target_type, value_type)
    }

    /// Check comparison operations between measurements.
    /// Comparisons require same dimension but can auto-convert.
    pub fn check_comparison(left: &MeasurementType, right: &MeasurementType) -> UnitCheckResult {
        Self::check_binary_op(left, right)
    }

    /// Get the result type of multiplying two measurement types.
    /// E.g., Concentration × Volume = Mass (moles)
    pub fn multiply_types(
        left: &MeasurementType,
        right: &MeasurementType,
    ) -> Option<MeasurementType> {
        let left_dim = left.dimension();
        let right_dim = right.dimension();

        match (left_dim, right_dim) {
            // Concentration × Volume = moles (dimensionless in our simplified model)
            (Dimension::Concentration, Dimension::Volume) |
            (Dimension::Volume, Dimension::Concentration) => Some(MeasurementType::ArbitraryUnits),

            // Mass / Volume = Concentration (approximate)
            // Rate × Time = fold change
            (Dimension::Rate, Dimension::Time) |
            (Dimension::Time, Dimension::Rate) => Some(MeasurementType::Fold),

            // Dimensionless × anything = same thing
            (Dimension::Dimensionless, _) => Some(right.clone()),
            (_, Dimension::Dimensionless) => Some(left.clone()),

            _ => None,
        }
    }

    /// Parse a unit string from source code into a MeasurementType.
    pub fn parse_unit(unit_str: &str) -> Option<MeasurementType> {
        match unit_str {
            // Concentration
            "M" | "molar" => Some(MeasurementType::Molar),
            "mM" | "millimolar" => Some(MeasurementType::MilliMolar),
            "uM" | "µM" | "micromolar" => Some(MeasurementType::MicroMolar),
            "nM" | "nanomolar" => Some(MeasurementType::NanoMolar),
            "pM" | "picomolar" => Some(MeasurementType::PicoMolar),

            // Optical density
            "OD600" | "OD_600" => Some(MeasurementType::OD600),
            "OD280" | "OD_280" => Some(MeasurementType::OD280),

            // Fluorescence
            "RFU" | "rfu" => Some(MeasurementType::RFU),
            "MFI" | "mfi" => Some(MeasurementType::MFI),
            "MEFL" | "mefl" => Some(MeasurementType::MEFL),

            // Promoter activity
            "RPU" | "rpu" => Some(MeasurementType::RPU),

            // Mass
            "Da" | "daltons" => Some(MeasurementType::Daltons),
            "kDa" | "kilodaltons" => Some(MeasurementType::KiloDaltons),
            "pg" | "picograms" => Some(MeasurementType::Picograms),
            "ng" | "nanograms" => Some(MeasurementType::Nanograms),
            "ug" | "µg" | "micrograms" => Some(MeasurementType::Micrograms),
            "mg" | "milligrams" => Some(MeasurementType::Milligrams),
            "g" | "grams" => Some(MeasurementType::Grams),

            // Volume
            "pL" | "picoliters" => Some(MeasurementType::Picoliters),
            "nL" | "nanoliters" => Some(MeasurementType::Nanoliters),
            "uL" | "µL" | "microliters" => Some(MeasurementType::Microliters),
            "mL" | "milliliters" => Some(MeasurementType::Milliliters),
            "L" | "liters" => Some(MeasurementType::Liters),

            // Length
            "bp" | "basepairs" => Some(MeasurementType::BasePairs),
            "kb" | "kilobases" => Some(MeasurementType::Kilobases),
            "Mb" | "megabases" => Some(MeasurementType::Megabases),

            // Temperature
            "C" | "°C" | "celsius" => Some(MeasurementType::Celsius),
            "K" | "kelvin" => Some(MeasurementType::Kelvin),

            // Time
            "s" | "sec" | "seconds" => Some(MeasurementType::Seconds),
            "min" | "minutes" => Some(MeasurementType::Minutes),
            "h" | "hr" | "hours" => Some(MeasurementType::Hours),

            // Rate
            "dbl/h" | "doublings_per_hour" => Some(MeasurementType::DoublingsPerHour),
            "bp/s" | "basepairs_per_second" => Some(MeasurementType::BasePairsPerSecond),

            // Percentage
            "%" | "percent" => Some(MeasurementType::Percent),
            "fold" => Some(MeasurementType::Fold),
            "AU" | "au" | "arbitrary_units" => Some(MeasurementType::ArbitraryUnits),

            // Energy
            "kcal/mol" => Some(MeasurementType::KCalPerMol),
            "kJ/mol" => Some(MeasurementType::KJPerMol),

            _ => None,
        }
    }

    /// Suggest the correct unit when a wrong one is used.
    pub fn suggest_unit(wrong_unit: &str) -> Option<&'static str> {
        let lower = wrong_unit.to_lowercase();
        match lower.as_str() {
            "nm" => Some("nM (nanomolar) o nm (nanómetros — no es una unidad biológica válida)"),
            "um" => Some("µM (micromolar) o µm (micrómetros)"),
            "ml" => Some("mL (mililitros)"),
            "ul" => Some("µL (microlitros)"),
            "kda" => Some("kDa (kiloDaltons)"),
            "od" => Some("OD600 (densidad óptica a 600nm)"),
            "celsius" => Some("°C (grados Celsius)"),
            _ => None,
        }
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
//  UNIT ERROR FORMATTING
// ═══════════════════════════════════════════════════════════════════════════════

impl fmt::Display for UnitCheckResult {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Same => write!(f, "Unidades idénticas"),
            Self::Compatible { from, to, conversion_factor } => {
                write!(f, "Conversión automática: {} → {} (factor: {:.6})", 
                       from.display_name(), to.display_name(), conversion_factor)
            }
            Self::Incompatible { message, .. } => {
                write!(f, "Error de unidades: {}", message)
            }
        }
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
//  DIMENSIONAL ANALYSIS FOR EXPRESSIONS
// ═══════════════════════════════════════════════════════════════════════════════

/// Represents a dimensional expression result.
#[derive(Debug, Clone)]
pub struct DimensionalResult {
    pub result_type: BioType,
    pub warnings: Vec<String>,
    pub errors: Vec<String>,
}

/// Perform dimensional analysis on an arithmetic expression.
pub fn check_arithmetic(
    left: &BioType,
    right: &BioType,
    operator: &str,
) -> DimensionalResult {
    let mut warnings = Vec::new();
    let mut errors = Vec::new();

    match (left, right) {
        // Both are measurements
        (BioType::Measurement(lm), BioType::Measurement(rm)) => {
            match operator {
                "+" | "-" => {
                    // Addition/subtraction: must be same dimension
                    match UnitChecker::check_binary_op(lm, rm) {
                        UnitCheckResult::Same => DimensionalResult {
                            result_type: left.clone(),
                            warnings,
                            errors,
                        },
                        UnitCheckResult::Compatible { from, to, conversion_factor } => {
                            warnings.push(format!(
                                "Conversión implícita de {} a {} (×{:.4})",
                                from.display_name(), to.display_name(), conversion_factor
                            ));
                            DimensionalResult {
                                result_type: left.clone(),
                                warnings,
                                errors,
                            }
                        }
                        UnitCheckResult::Incompatible { message, .. } => {
                            errors.push(message);
                            DimensionalResult {
                                result_type: BioType::Error,
                                warnings,
                                errors,
                            }
                        }
                    }
                }
                "*" => {
                    // Multiplication: derive new type
                    if let Some(result_unit) = UnitChecker::multiply_types(lm, rm) {
                        DimensionalResult {
                            result_type: BioType::Measurement(result_unit),
                            warnings,
                            errors,
                        }
                    } else {
                        warnings.push(format!(
                            "Multiplicación de {} × {} no tiene significado biológico estándar",
                            lm.display_name(), rm.display_name()
                        ));
                        DimensionalResult {
                            result_type: BioType::Float,
                            warnings,
                            errors,
                        }
                    }
                }
                "/" => {
                    // Division: if same dimension → dimensionless
                    if lm.dimension() == rm.dimension() {
                        DimensionalResult {
                            result_type: BioType::Measurement(MeasurementType::Fold),
                            warnings,
                            errors,
                        }
                    } else {
                        DimensionalResult {
                            result_type: BioType::Float,
                            warnings,
                            errors,
                        }
                    }
                }
                _ => DimensionalResult {
                    result_type: BioType::Error,
                    warnings,
                    errors,
                },
            }
        }

        // One is measurement, one is scalar — scaling
        (BioType::Measurement(m), BioType::Int | BioType::Float) |
        (BioType::Int | BioType::Float, BioType::Measurement(m)) => {
            match operator {
                "*" | "/" => DimensionalResult {
                    result_type: BioType::Measurement(m.clone()),
                    warnings,
                    errors,
                },
                "+" | "-" => {
                    errors.push(format!(
                        "No se puede {} un escalar con {} — mezclar magnitudes con números sin unidades",
                        if operator == "+" { "sumar" } else { "restar" },
                        m.display_name()
                    ));
                    DimensionalResult {
                        result_type: BioType::Error,
                        warnings,
                        errors,
                    }
                }
                _ => DimensionalResult {
                    result_type: BioType::Error,
                    warnings,
                    errors,
                }
            }
        }

        // Neither is a measurement — regular arithmetic
        _ => DimensionalResult {
            result_type: if matches!(left, BioType::Float) || matches!(right, BioType::Float) {
                BioType::Float
            } else {
                BioType::Int
            },
            warnings,
            errors,
        },
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
//  TESTS
// ═══════════════════════════════════════════════════════════════════════════════

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_unit_check_same() {
        let result = UnitChecker::check_binary_op(
            &MeasurementType::NanoMolar,
            &MeasurementType::NanoMolar,
        );
        assert!(matches!(result, UnitCheckResult::Same));
    }

    #[test]
    fn test_unit_check_compatible() {
        let result = UnitChecker::check_binary_op(
            &MeasurementType::NanoMolar,
            &MeasurementType::MicroMolar,
        );
        match result {
            UnitCheckResult::Compatible { conversion_factor, .. } => {
                // µM → nM: factor should be 1000
                assert!((conversion_factor - 1000.0).abs() < 0.001);
            }
            _ => panic!("Expected Compatible, got {:?}", result),
        }
    }

    #[test]
    fn test_unit_check_incompatible() {
        let result = UnitChecker::check_binary_op(
            &MeasurementType::RPU,
            &MeasurementType::NanoMolar,
        );
        assert!(matches!(result, UnitCheckResult::Incompatible { .. }));
    }

    #[test]
    fn test_dimensional_analysis_addition() {
        let result = check_arithmetic(
            &BioType::Measurement(MeasurementType::NanoMolar),
            &BioType::Measurement(MeasurementType::RPU),
            "+",
        );
        assert!(!result.errors.is_empty());
    }

    #[test]
    fn test_dimensional_analysis_multiplication() {
        let result = check_arithmetic(
            &BioType::Measurement(MeasurementType::MicroMolar),
            &BioType::Measurement(MeasurementType::Microliters),
            "*",
        );
        assert!(result.errors.is_empty());
    }

    #[test]
    fn test_parse_unit() {
        assert_eq!(UnitChecker::parse_unit("nM"), Some(MeasurementType::NanoMolar));
        assert_eq!(UnitChecker::parse_unit("µM"), Some(MeasurementType::MicroMolar));
        assert_eq!(UnitChecker::parse_unit("RPU"), Some(MeasurementType::RPU));
        assert_eq!(UnitChecker::parse_unit("OD600"), Some(MeasurementType::OD600));
        assert_eq!(UnitChecker::parse_unit("bp"), Some(MeasurementType::BasePairs));
        assert_eq!(UnitChecker::parse_unit("invalid"), None);
    }

    #[test]
    fn test_scalar_measurement_arithmetic() {
        // 2.0 * 10 nM = 20 nM (OK)
        let result = check_arithmetic(
            &BioType::Float,
            &BioType::Measurement(MeasurementType::NanoMolar),
            "*",
        );
        assert!(result.errors.is_empty());
        assert!(matches!(result.result_type, BioType::Measurement(MeasurementType::NanoMolar)));

        // 2.0 + 10 nM = ERROR (can't add scalar to measurement)
        let result = check_arithmetic(
            &BioType::Float,
            &BioType::Measurement(MeasurementType::NanoMolar),
            "+",
        );
        assert!(!result.errors.is_empty());
    }
}
