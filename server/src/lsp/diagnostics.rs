#![allow(dead_code)]
//! Diagnósticos y linting biológico para BioScript

use tower_lsp::lsp_types::*;
use crate::compiler::{Parser, LexerError};

/// Provee diagnósticos para código BioScript
pub struct DiagnosticsProvider;

/// Tipo de diagnóstico biológico
#[derive(Debug, Clone)]
pub enum BioDiagnosticKind {
    /// Error de sintaxis
    SyntaxError,
    /// Secuencia de ADN inválida
    InvalidDNASequence,
    /// Secuencia de ARN inválida  
    InvalidRNASequence,
    /// Promotor no reconocido
    UnknownPromoter,
    /// RBS débil o fuerte
    RBSStrengthWarning,
    /// Posible toxicidad
    ToxicityWarning,
    /// Inestabilidad termodinámica
    ThermodynamicInstability,
    /// Carga metabólica alta
    HighMetabolicLoad,
    /// Incompatibilidad de chasis
    ChassisIncompatibility,
    /// Parte no caracterizada
    UncharacterizedPart,
    /// Posible fuga de expresión
    LeakyExpression,
    /// Riesgo de bioseguridad
    BiosecurityRisk,
    /// Codon no óptimo
    SuboptimalCodon,
    /// Estructura secundaria problemática
    ProblematicSecondaryStructure,
}

impl DiagnosticsProvider {
    pub fn new() -> Self {
        Self
    }

    /// Analiza el contenido y genera diagnósticos
    pub fn analyze(&self, content: &str) -> Vec<Diagnostic> {
        let mut diagnostics = Vec::new();

        // 1. Verificar errores de parsing (incluye lexer)
        match Parser::new(content) {
            Ok(mut parser) => {
                if let Err(parse_error) = parser.parse_program() {
                    diagnostics.push(Diagnostic {
                        range: Range {
                            start: Position { line: 0, character: 0 },
                            end: Position { line: 0, character: 10 },
                        },
                        severity: Some(DiagnosticSeverity::ERROR),
                        code: Some(NumberOrString::String("E0002".to_string())),
                        source: Some("synbio".to_string()),
                        message: format!("Error de parsing: {}", parse_error),
                        ..Default::default()
                    });
                }
            }
            Err(lex_error) => {
                let (line, character) = match &lex_error {
                    LexerError::InvalidToken { line, column, .. } => (*line, *column),
                };
                diagnostics.push(Diagnostic {
                    range: Range {
                        start: Position { line: line as u32, character: character as u32 },
                        end: Position { line: line as u32, character: (character + 1) as u32 },
                    },
                    severity: Some(DiagnosticSeverity::ERROR),
                    code: Some(NumberOrString::String("E0001".to_string())),
                    source: Some("synbio".to_string()),
                    message: format!("Error léxico: {}", lex_error),
                    ..Default::default()
                });
            }
        }

        // 2. Análisis biológico línea por línea
        for (line_num, line) in content.lines().enumerate() {
            diagnostics.extend(self.analyze_line(line_num as u32, line));
        }

        diagnostics
    }

    /// Analiza una línea específica
    fn analyze_line(&self, line_num: u32, line: &str) -> Vec<Diagnostic> {
        let mut diagnostics = Vec::new();
        let trimmed = line.trim();

        // Detectar secuencias de ADN y validar
        if let Some(seq_start) = trimmed.find("DNA(\"") {
            if let Some(seq_end) = trimmed[seq_start..].find("\")") {
                let sequence = &trimmed[seq_start + 5..seq_start + seq_end];
                diagnostics.extend(self.validate_dna_sequence(line_num, seq_start as u32, sequence));
            }
        }

        // Detectar promotores no reconocidos
        if trimmed.contains("promoter") {
            diagnostics.extend(self.check_promoter(line_num, trimmed));
        }

        // Detectar posibles toxinas
        if self.is_potential_toxin(trimmed) {
            diagnostics.push(Diagnostic {
                range: Range {
                    start: Position { line: line_num, character: 0 },
                    end: Position { line: line_num, character: line.len() as u32 },
                },
                severity: Some(DiagnosticSeverity::WARNING),
                code: Some(NumberOrString::String("W0010".to_string())),
                source: Some("synbio-biosecurity".to_string()),
                message: "⚠️ Esta línea contiene una referencia a una posible toxina. Asegúrate de tener un sistema de contención apropiado.".to_string(),
                tags: Some(vec![DiagnosticTag::UNNECESSARY]),
                ..Default::default()
            });
        }

        // Verificar RBS
        if trimmed.contains("rbs:") || trimmed.contains("RBS") {
            diagnostics.extend(self.check_rbs(line_num, trimmed));
        }

        // Verificar estructuras kill_switch
        if trimmed.contains("kill_switch") {
            diagnostics.push(Diagnostic {
                range: Range {
                    start: Position { line: line_num, character: 0 },
                    end: Position { line: line_num, character: line.len() as u32 },
                },
                severity: Some(DiagnosticSeverity::HINT),
                code: Some(NumberOrString::String("H0001".to_string())),
                source: Some("synbio".to_string()),
                message: "✓ Kill-switch detectado. Buena práctica de bioseguridad.".to_string(),
                ..Default::default()
            });
        }

        diagnostics
    }

    /// Valida una secuencia de ADN
    fn validate_dna_sequence(&self, line: u32, col: u32, sequence: &str) -> Vec<Diagnostic> {
        let mut diagnostics = Vec::new();

        // Verificar caracteres válidos
        for (i, c) in sequence.chars().enumerate() {
            if !matches!(c.to_ascii_uppercase(), 'A' | 'T' | 'G' | 'C' | 'N') {
                diagnostics.push(Diagnostic {
                    range: Range {
                        start: Position { line, character: col + 5 + i as u32 },
                        end: Position { line, character: col + 6 + i as u32 },
                    },
                    severity: Some(DiagnosticSeverity::ERROR),
                    code: Some(NumberOrString::String("E0100".to_string())),
                    source: Some("synbio-dna".to_string()),
                    message: format!("Carácter '{}' no es válido en una secuencia de ADN. Use A, T, G, C o N.", c),
                    ..Default::default()
                });
            }
        }

        // Verificar longitud mínima
        if sequence.len() < 10 {
            diagnostics.push(Diagnostic {
                range: Range {
                    start: Position { line, character: col },
                    end: Position { line, character: col + sequence.len() as u32 + 7 },
                },
                severity: Some(DiagnosticSeverity::WARNING),
                code: Some(NumberOrString::String("W0100".to_string())),
                source: Some("synbio-dna".to_string()),
                message: "Secuencia de ADN muy corta (<10 bp). Podría no ser funcional.".to_string(),
                ..Default::default()
            });
        }

        // Verificar contenido GC
        let gc_count = sequence.chars().filter(|c| matches!(c.to_ascii_uppercase(), 'G' | 'C')).count();
        let gc_content = gc_count as f64 / sequence.len() as f64;
        
        if gc_content < 0.3 {
            diagnostics.push(Diagnostic {
                range: Range {
                    start: Position { line, character: col },
                    end: Position { line, character: col + sequence.len() as u32 + 7 },
                },
                severity: Some(DiagnosticSeverity::WARNING),
                code: Some(NumberOrString::String("W0101".to_string())),
                source: Some("synbio-thermo".to_string()),
                message: format!("Contenido GC bajo ({:.1}%). Esto puede afectar la estabilidad.", gc_content * 100.0),
                ..Default::default()
            });
        } else if gc_content > 0.7 {
            diagnostics.push(Diagnostic {
                range: Range {
                    start: Position { line, character: col },
                    end: Position { line, character: col + sequence.len() as u32 + 7 },
                },
                severity: Some(DiagnosticSeverity::WARNING),
                code: Some(NumberOrString::String("W0102".to_string())),
                source: Some("synbio-thermo".to_string()),
                message: format!("Contenido GC alto ({:.1}%). Esto puede causar estructuras secundarias problemáticas.", gc_content * 100.0),
                ..Default::default()
            });
        }

        // Detectar repeticiones
        if self.has_repeats(sequence, 6) {
            diagnostics.push(Diagnostic {
                range: Range {
                    start: Position { line, character: col },
                    end: Position { line, character: col + sequence.len() as u32 + 7 },
                },
                severity: Some(DiagnosticSeverity::WARNING),
                code: Some(NumberOrString::String("W0103".to_string())),
                source: Some("synbio-stability".to_string()),
                message: "Secuencias repetidas detectadas. Esto puede causar inestabilidad genética.".to_string(),
                ..Default::default()
            });
        }

        diagnostics
    }

    /// Verifica repeticiones en una secuencia
    fn has_repeats(&self, sequence: &str, min_len: usize) -> bool {
        let seq = sequence.to_uppercase();
        for i in 0..seq.len().saturating_sub(min_len * 2) {
            let pattern = &seq[i..i + min_len];
            if seq[i + min_len..].contains(pattern) {
                return true;
            }
        }
        false
    }

    /// Verifica promotores
    fn check_promoter(&self, line: u32, content: &str) -> Vec<Diagnostic> {
        let mut diagnostics = Vec::new();
        let known_promoters = [
            "pLac", "pTet", "pBAD", "pT7", "pTac", "pConst", "pLux", "pRha",
            "pSal", "pVan", "pCad", "pCin", "pLas", "pTraE", "pLtetO", "pLlacO"
        ];

        // Buscar identificadores de promotores
        for word in content.split_whitespace() {
            let clean_word = word.trim_matches(|c: char| !c.is_alphanumeric());
            if clean_word.starts_with('p') && clean_word.len() > 1 {
                if !known_promoters.contains(&clean_word) && clean_word != "promoter" {
                    if let Some(col) = content.find(clean_word) {
                        diagnostics.push(Diagnostic {
                            range: Range {
                                start: Position { line, character: col as u32 },
                                end: Position { line, character: (col + clean_word.len()) as u32 },
                            },
                            severity: Some(DiagnosticSeverity::INFORMATION),
                            code: Some(NumberOrString::String("I0100".to_string())),
                            source: Some("synbio-parts".to_string()),
                            message: format!("Promotor '{}' no está en la biblioteca estándar. Asegúrate de que esté caracterizado.", clean_word),
                            ..Default::default()
                        });
                    }
                }
            }
        }

        diagnostics
    }

    /// Verifica RBS
    fn check_rbs(&self, line: u32, content: &str) -> Vec<Diagnostic> {
        let mut diagnostics = Vec::new();
        
        // Detectar RBS por nombre
        let strong_rbs = ["B0034", "B0032"];
        let weak_rbs = ["B0031", "B0033"];

        for rbs in strong_rbs.iter() {
            if content.contains(rbs) {
                if let Some(col) = content.find(rbs) {
                    diagnostics.push(Diagnostic {
                        range: Range {
                            start: Position { line, character: col as u32 },
                            end: Position { line, character: (col + rbs.len()) as u32 },
                        },
                        severity: Some(DiagnosticSeverity::INFORMATION),
                        code: Some(NumberOrString::String("I0200".to_string())),
                        source: Some("synbio-rbs".to_string()),
                        message: format!("{} es un RBS fuerte. Espere alta expresión de proteína.", rbs),
                        ..Default::default()
                    });
                }
            }
        }

        for rbs in weak_rbs.iter() {
            if content.contains(rbs) {
                if let Some(col) = content.find(rbs) {
                    diagnostics.push(Diagnostic {
                        range: Range {
                            start: Position { line, character: col as u32 },
                            end: Position { line, character: (col + rbs.len()) as u32 },
                        },
                        severity: Some(DiagnosticSeverity::INFORMATION),
                        code: Some(NumberOrString::String("I0201".to_string())),
                        source: Some("synbio-rbs".to_string()),
                        message: format!("{} es un RBS débil. Espere baja expresión de proteína.", rbs),
                        ..Default::default()
                    });
                }
            }
        }

        diagnostics
    }

    /// Detecta posibles toxinas
    fn is_potential_toxin(&self, content: &str) -> bool {
        let toxins = [
            "CcdB", "ccdB", "RelE", "relE", "MazF", "mazF", "Doc", "doc",
            "ParE", "parE", "HicA", "hicA", "Kid", "kid", "Zeta", "zeta",
            "VapC", "vapC", "HigB", "higB", "YoeB", "yoeB", "YafQ", "yafQ"
        ];
        toxins.iter().any(|t| content.contains(t))
    }
}

impl Default for DiagnosticsProvider {
    fn default() -> Self {
        Self::new()
    }
}
