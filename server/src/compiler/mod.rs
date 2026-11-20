#![allow(dead_code)]
//! SynBio-LLVM Compiler — Complete BioScript Compilation Pipeline
//!
//! Full compilation pipeline with 12 stages:
//!  1. **Lexer**: Source code → Tokens (logos-based, ~65 bio tokens)
//!  2. **Parser**: Tokens → AST (recursive descent, full BioScript grammar)
//!  3. **Semantic Analysis**: Type checking, scope resolution, bio constraints
//!  4. **HIR Lowering**: AST → High-level IR (desugar connections, resolve parts)
//!  5. **MIR Lowering**: HIR → Mid-level IR (ownership, crosstalk, metabolic burden)
//!  6. **IR Lowering**: MIR → BioIR (bridge to existing codegen types)
//!  7. **Biology Validation**: ATP cost, toxicity, transcription unit order
//!  8. **Insulation**: Auto-inject terminators, spacers, insulators
//!  9. **FBA Validation**: Flux Balance Analysis metabolic load check
//! 10. **Optimization**: Codon opt, RBS tuning, expression balancing, dead code removal
//! 11. **CodeGen**: BioIR → SBOL 3.0 / FASTA / GenBank / LAMMPS
//! 12. **LLVM IR**: BioIR → LLVM IR (.ll) with ODE simulation harness
//!
//! Additional target backends:
//!  - OpenTrons OT-2 Python protocol (Golden Gate Assembly)
//!  - SBML Level 3 (Systems Biology Markup Language)
//!  - DNA synthesis cost estimation (Twist, IDT, GenScript, Eurofins)
//!  - Human-readable lab protocol (Markdown)

pub mod ast;
pub mod bio_ir;
pub mod bio_types;
pub mod circuit_optimizer;
pub mod codegen;
pub mod codon_optimizer;
pub mod hir;
pub mod insulation;
pub mod ir_lowering;
pub mod kinetics;
pub mod lexer;
pub mod llvm_codegen;
pub mod mir;
pub mod optimization;
pub mod parser;
pub mod select_agents;
pub mod semantic;
pub mod targets;
pub mod type_checker;
pub mod unit_system;

pub use ast::*;
pub use bio_ir::*;
pub use codegen::{CodeGenError, CodeGenerator, GeneratorConfig};
pub use insulation::{InsulationConfig, InsulationEngine, InsulationReport};
pub use lexer::{Lexer, LexerError};
pub use llvm_codegen::LlvmConfig;
pub use parser::{ParseError, Parser};

use crate::physics::{GeneExpression, MetabolicModel, Sustainability};
use thiserror::Error;

/// Errores del compilador
#[derive(Debug, Error)]
pub enum CompilerError {
    #[error("Error léxico: {0}")]
    Lexer(#[from] LexerError),

    #[error("Error de sintaxis: {0}")]
    Parser(#[from] ParseError),

    #[error("Error semántico: {0}")]
    Semantic(String),

    #[error("Error de generación de código: {0}")]
    CodeGen(#[from] CodeGenError),

    #[error("Error de validación biológica: {0}")]
    BioValidation(String),

    #[error("Error de carga metabólica: {0}")]
    MetabolicOverload(String),
}

/// Resultado del compilador
pub type CompileResult<T> = Result<T, CompilerError>;

/// Compilador principal de BioScript
pub struct Compiler {
    config: CompilerConfig,
    metabolic_model: MetabolicModel,
    insulation_engine: InsulationEngine,
}

#[derive(Debug, Clone)]
pub struct CompilerConfig {
    /// Organismo huésped objetivo
    pub target_host: String,

    /// Habilitar optimización de codones
    pub optimize_codons: bool,

    /// Insertar aisladores automáticamente
    pub auto_insulation: bool,

    /// Nivel de aislamiento (0-3)
    pub insulation_level: u8,

    /// Nivel de validación termodinámica
    pub thermodynamic_validation: ValidationLevel,

    /// Umbral de advertencia de ATP (%)
    pub atp_warning_threshold: f64,

    /// Umbral de error de ATP - demanda máxima permitida
    pub atp_error_threshold: f64,

    /// Verificar bioseguridad
    pub biosecurity_check: bool,
}

#[derive(Debug, Clone)]
pub enum ValidationLevel {
    None,
    Basic,
    Full,
}

impl Default for CompilerConfig {
    fn default() -> Self {
        Self {
            target_host: "ecoli_dh5alpha".to_string(),
            optimize_codons: true,
            auto_insulation: true,
            insulation_level: 2,
            thermodynamic_validation: ValidationLevel::Full,
            atp_warning_threshold: 80.0,
            atp_error_threshold: 150.0, // Error si supera 150% de capacidad
            biosecurity_check: true,
        }
    }
}

impl Compiler {
    pub fn new(config: CompilerConfig) -> Self {
        let insulation_config = InsulationConfig {
            isolation_level: config.insulation_level,
            ..InsulationConfig::default()
        };

        Self {
            config,
            metabolic_model: MetabolicModel::ecoli_core(),
            insulation_engine: InsulationEngine::new(insulation_config),
        }
    }

    /// Compila código fuente BioScript a Bio-IR
    pub fn compile(&self, source: &str) -> CompileResult<BioIRProgram> {
        // 1. Lexer
        let _tokens = Lexer::tokenize(source)?;

        // 2. Parser
        let mut parser = Parser::new(source)?;
        let ast = parser.parse_program()?;

        // 3. Análisis semántico
        self.semantic_analysis(&ast)?;

        // 4. Generar Bio-IR
        let mut ir = self.generate_ir(&ast)?;

        // 5. Validaciones biológicas básicas
        self.validate_biology(&ir)?;

        // 6. Aplicar aislamiento genético (invisible al usuario)
        if self.config.auto_insulation {
            self.apply_insulation(&mut ir);
        }

        // 7. Validar carga metabólica con FBA
        self.validate_metabolic_load(&ir)?;

        // 8. Optimizar codones si está habilitado
        let optimized = if self.config.optimize_codons {
            self.optimize(ir)?
        } else {
            ir
        };

        Ok(optimized)
    }

    /// Aplica aislamiento genético a todos los circuitos
    fn apply_insulation(&self, program: &mut BioIRProgram) {
        for circuit in &mut program.circuits {
            self.insulation_engine.insulate_circuit(circuit);

            // Log del reporte de aislamiento
            let report = InsulationReport::generate(circuit, &self.insulation_engine);
            circuit.metadata.insert(
                "insulation_overhead_bp".to_string(),
                report.total_overhead_bp.to_string(),
            );
            circuit.metadata.insert(
                "insulation_efficiency".to_string(),
                format!("{:.2}", report.estimated_efficiency),
            );
        }
    }

    /// Valida la carga metabólica usando Flux Balance Analysis
    fn validate_metabolic_load(&self, program: &BioIRProgram) -> CompileResult<()> {
        for circuit in &program.circuits {
            // Extraer información de genes del circuito
            let gene_expressions: Vec<GeneExpression> = circuit
                .transcription_units
                .iter()
                .map(|tu| {
                    // Calcular longitudes aproximadas
                    let mrna_len = tu.promoter.sequence.len()
                        + tu.rbs.sequence.len()
                        + tu.cds.dna_sequence.len()
                        + tu.terminator
                            .as_ref()
                            .map(|t| t.sequence.len())
                            .unwrap_or(0);

                    let protein_len = tu.cds.amino_sequence.len();

                    GeneExpression {
                        gene_id: tu.id.clone(),
                        mrna_length: mrna_len,
                        protein_length: protein_len,
                        expression_level: 1000.0, // Por defecto, ajustable
                    }
                })
                .collect();

            if gene_expressions.is_empty() {
                continue;
            }

            // Calcular costo metabólico
            let metabolic_cost = self
                .metabolic_model
                .estimate_circuit_cost(&gene_expressions);

            // Verificar si excede la capacidad del host
            let relative = program
                .host
                .as_ref()
                .map(|host| {
                    if host.atp_capacity > 0.0 {
                        host.atp_capacity
                    } else {
                        100.0
                    }
                })
                .unwrap_or(100.0);
            let budget = (relative / 100.0) * 1e9;
            let atp_usage_percent = (metabolic_cost.atp_per_cell_division / budget) * 100.0;

            // ERROR: Si excede el umbral de error
            if atp_usage_percent > self.config.atp_error_threshold {
                return Err(CompilerError::MetabolicOverload(format!(
                    "El circuito '{}' demanda {:.1}% de la capacidad de ATP del host, \
                    excediendo el límite de {:.0}%. \
                    Soluciones: reducir niveles de expresión, usar promotores más débiles, \
                    o eliminar genes no esenciales.",
                    circuit.name, atp_usage_percent, self.config.atp_error_threshold
                )));
            }

            // ERROR: Si la sostenibilidad es HighBurden y no hay contención
            if metabolic_cost.sustainability == Sustainability::HighBurden {
                if !circuit.is_contained {
                    return Err(CompilerError::MetabolicOverload(format!(
                        "El circuito '{}' tiene alta carga metabólica ({}) \
                        y no está contenido. El impacto en crecimiento es {:.0}%. \
                        Añade un kill_switch o reduce la expresión.",
                        circuit.name,
                        metabolic_cost.sustainability,
                        (1.0 - metabolic_cost.estimated_growth_rate_impact) * 100.0
                    )));
                }
            }
        }

        Ok(())
    }

    /// Compila y genera código en formato específico
    pub fn compile_to_sbol(&self, source: &str) -> CompileResult<String> {
        let ir = self.compile(source)?;
        let gen = CodeGenerator::new(GeneratorConfig::default());
        Ok(gen.generate_sbol(&ir)?)
    }

    pub fn compile_to_fasta(&self, source: &str) -> CompileResult<String> {
        let ir = self.compile(source)?;
        let gen = CodeGenerator::new(GeneratorConfig::default());
        Ok(gen.generate_fasta(&ir)?)
    }

    pub fn compile_to_genbank(&self, source: &str) -> CompileResult<String> {
        let ir = self.compile(source)?;
        let gen = CodeGenerator::new(GeneratorConfig::default());
        Ok(gen.generate_genbank(&ir)?)
    }

    pub fn compile_to_lammps(&self, source: &str) -> CompileResult<String> {
        let ir = self.compile(source)?;
        let gen = CodeGenerator::new(GeneratorConfig::default());
        Ok(gen.generate_lammps(&ir)?)
    }

    /// Compile to LLVM IR (.ll format) with ODE simulation harness
    pub fn compile_to_llvm(&self, source: &str) -> CompileResult<String> {
        let ir = self.compile(source)?;
        let mut codegen = llvm_codegen::LlvmCodeGen::new(LlvmConfig::default());
        Ok(codegen.generate(&ir))
    }

    /// Compile to OpenTrons OT-2 Python protocol (Golden Gate Assembly)
    pub fn compile_to_opentrons(&self, source: &str) -> CompileResult<String> {
        let ir = self.compile(source)?;
        Ok(targets::OpenTronsGenerator::generate(&ir))
    }

    /// Compile to SBML Level 3 for systems biology tools
    pub fn compile_to_sbml(&self, source: &str) -> CompileResult<String> {
        let ir = self.compile(source)?;
        Ok(targets::SbmlGenerator::generate(&ir))
    }

    /// Estimate DNA synthesis cost from major providers
    pub fn estimate_cost(&self, source: &str) -> CompileResult<targets::CostEstimate> {
        let ir = self.compile(source)?;
        Ok(targets::CostEstimator::estimate(&ir))
    }

    /// Generate human-readable lab protocol (Markdown)
    pub fn generate_protocol(&self, source: &str) -> CompileResult<String> {
        let ir = self.compile(source)?;
        Ok(targets::ProtocolGenerator::generate(&ir))
    }

    /// Full compilation with all analysis results
    pub fn compile_full(&self, source: &str) -> CompileResult<CompilationResult> {
        // Parse
        let mut parser = Parser::new(source)?;
        let ast = parser.parse_program()?;

        // Semantic analysis (collect warnings even if no errors)
        let mut semantic_warnings = Vec::new();
        let mut analyzer = semantic::SemanticAnalyzer::new();
        if let Err(errors) = analyzer.analyze(&ast) {
            let real_errors: Vec<_> = errors
                .iter()
                .filter(|e| e.severity == semantic::Severity::Error)
                .collect();
            if !real_errors.is_empty() {
                let msg = real_errors
                    .iter()
                    .map(|e| format!("[{}] {}", e.code, e.message))
                    .collect::<Vec<_>>()
                    .join("; ");
                return Err(CompilerError::Semantic(msg));
            }
            semantic_warnings = errors
                .iter()
                .filter(|e| e.severity == semantic::Severity::Warning)
                .map(|e| format!("[{}] {}", e.code, e.message))
                .collect();
        }

        // Biological type checking (rich type inference + biosecurity)
        let mut bio_type_checker = type_checker::BioTypeChecker::new();
        let type_check_result = bio_type_checker.check_program(&ast);

        // Full lowering pipeline
        let mut hir_lowering = hir::HirLowering::new();
        let hir_program = hir_lowering.lower(&ast);

        let mir_lowering = mir::MirLowering::new();
        let mir_program = mir_lowering.lower(&hir_program);

        // Extract MIR analysis data
        let mir_analysis = MirAnalysisData {
            ownership_violations: mir_program
                .circuits
                .iter()
                .flat_map(|c| c.ownership.violations.iter().map(|v| v.message.clone()))
                .collect(),
            crosstalk_warnings: mir_program
                .circuits
                .iter()
                .flat_map(|c| c.crosstalk_warnings.iter().map(|w| format!("{:?}", w)))
                .collect(),
            metabolic_burden: mir_program
                .circuits
                .iter()
                .map(|c| (c.name.clone(), format!("{:?}", c.estimated_burden.category)))
                .collect(),
        };

        let ir_lower = ir_lowering::IrLowering::new();
        let mut bio_ir = ir_lower.lower(&mir_program);

        // Validation
        self.validate_biology(&bio_ir)?;
        if self.config.auto_insulation {
            self.apply_insulation(&mut bio_ir);
        }
        self.validate_metabolic_load(&bio_ir)?;

        // Optimization
        let host2 = codon_optimizer::CodonOptHost::from_string(&self.config.target_host)
            .unwrap_or(codon_optimizer::CodonOptHost::EcoliDH5Alpha);
        let opt_config = optimization::OptimizationConfig {
            target_host: host2,
            codon_optimization: self.config.optimize_codons,
            expression_balancing: true,
            expression_balance_ratio: 2.0,
            dead_part_elimination: true,
            rbs_tuning: true,
            opt_level: 2,
        };
        let optimizer = optimization::Optimizer::new(opt_config);
        let (optimized_ir, opt_report) = optimizer.optimize(bio_ir);

        // Generate all outputs
        let gen = CodeGenerator::new(GeneratorConfig::default());
        let mut llvm_gen = llvm_codegen::LlvmCodeGen::new(LlvmConfig::default());

        Ok(CompilationResult {
            bio_ir: optimized_ir.clone(),
            sbol: gen.generate_sbol(&optimized_ir).ok(),
            fasta: gen.generate_fasta(&optimized_ir).ok(),
            genbank: gen.generate_genbank(&optimized_ir).ok(),
            llvm_ir: Some(llvm_gen.generate(&optimized_ir)),
            opentrons: Some(targets::OpenTronsGenerator::generate(&optimized_ir)),
            sbml: Some(targets::SbmlGenerator::generate(&optimized_ir)),
            cost_estimate: Some(targets::CostEstimator::estimate(&optimized_ir)),
            protocol: Some(targets::ProtocolGenerator::generate(&optimized_ir)),
            semantic_warnings,
            mir_analysis,
            optimization_report: Some(opt_report),
            type_check_result: Some(type_check_result),
        })
    }

    fn semantic_analysis(&self, ast: &Program) -> CompileResult<()> {
        let mut analyzer = semantic::SemanticAnalyzer::new();
        analyzer.analyze(ast).map_err(|errors| {
            let msg = errors
                .iter()
                .filter(|e| e.severity == semantic::Severity::Error)
                .map(|e| format!("[{}] {}", e.code, e.message))
                .collect::<Vec<_>>()
                .join("; ");
            if msg.is_empty() {
                // Only warnings — not a hard error
                return CompilerError::Semantic("".to_string());
            }
            CompilerError::Semantic(msg)
        })?;
        Ok(())
    }

    fn generate_ir(&self, ast: &Program) -> CompileResult<BioIRProgram> {
        // Full pipeline: AST → HIR → MIR → BioIR

        // Stage 1: AST → HIR (desugar connections, resolve parts)
        let mut hir_lowering = hir::HirLowering::new();
        let hir_program = hir_lowering.lower(ast);

        // Stage 2: HIR → MIR (ownership, crosstalk, burden analysis)
        let mir_lowering = mir::MirLowering::new();
        let mir_program = mir_lowering.lower(&hir_program);

        // Stage 3: MIR → BioIR (bridge to codegen types)
        let ir_lowering = ir_lowering::IrLowering::new();
        let bio_ir = ir_lowering.lower(&mir_program);

        Ok(bio_ir)
    }

    fn validate_biology(&self, ir: &BioIRProgram) -> CompileResult<()> {
        for circuit in &ir.circuits {
            // Verificar costo de ATP
            let atp_cost = circuit.calculate_atp_cost();
            if let Some(ref host) = ir.host {
                // Chassis `atp_capacity` is relative (100 = one standard host).
                // The ATP pool used by the burden model is 1e9 per division.
                let relative = if host.atp_capacity > 0.0 {
                    host.atp_capacity
                } else {
                    100.0
                };
                let budget = (relative / 100.0) * 1e9;
                let usage_percent = (atp_cost / budget) * 100.0;
                if usage_percent > self.config.atp_warning_threshold {
                    return Err(CompilerError::BioValidation(format!(
                        "ATP demand exceeds host capacity by {:.1}%. Reduce expression levels.",
                        usage_percent - 100.0
                    )));
                }
            }

            // Verificar toxicidad
            let analysis = circuit.analyze();
            if !analysis.toxicity_warnings.is_empty() && !circuit.is_contained {
                return Err(CompilerError::BioValidation(format!(
                    "Circuit has toxicity warnings but no containment: {:?}",
                    analysis.toxicity_warnings
                )));
            }
        }

        // Verificar bioseguridad
        if self.config.biosecurity_check {
            self.check_biosecurity(ir)?;
        }

        Ok(())
    }

    fn check_biosecurity(&self, ir: &BioIRProgram) -> CompileResult<()> {
        // Check against known select agent sequences and toxin genes
        let select_agents = [
            "anthrax",
            "botulinum",
            "ebola",
            "smallpox",
            "ricin",
            "plague",
            "tularemia",
            "brucella",
        ];

        for circuit in &ir.circuits {
            for tu in &circuit.transcription_units {
                let name_lower = tu.cds.name.to_lowercase();
                for agent in &select_agents {
                    if name_lower.contains(agent) {
                        return Err(CompilerError::BioValidation(format!(
                            "BIOSECURITY: CDS '{}' matches select agent '{}'. \
                            Compilation blocked. Contact your institution's IBC.",
                            tu.cds.name, agent
                        )));
                    }
                }

                // Check for known pathogenic sequences (simple heuristic)
                if tu.cds.dna_sequence.len() > 10000 {
                    // Very large unknown CDS is suspicious
                    if matches!(tu.cds.protein.function, ProteinFunction::Custom(_)) {
                        return Err(CompilerError::BioValidation(format!(
                            "BIOSECURITY: CDS '{}' is very large ({} bp) with unknown function. \
                            Manual review required.",
                            tu.cds.name,
                            tu.cds.dna_sequence.len()
                        )));
                    }
                }
            }
        }

        Ok(())
    }

    fn optimize(&self, ir: BioIRProgram) -> CompileResult<BioIRProgram> {
        let host = codon_optimizer::CodonOptHost::from_string(&self.config.target_host)
            .unwrap_or(codon_optimizer::CodonOptHost::EcoliDH5Alpha);
        let opt_config = optimization::OptimizationConfig {
            target_host: host,
            codon_optimization: self.config.optimize_codons,
            expression_balancing: true,
            expression_balance_ratio: 2.0,
            dead_part_elimination: true,
            rbs_tuning: true,
            opt_level: 2,
        };

        let optimizer = optimization::Optimizer::new(opt_config);
        let (optimized, _report) = optimizer.optimize(ir);

        Ok(optimized)
    }
}

/// Full compilation result with all analysis and output formats
#[derive(Debug, Clone)]
pub struct CompilationResult {
    /// The optimized Bio-IR
    pub bio_ir: BioIRProgram,
    /// SBOL 3.0 XML output
    pub sbol: Option<String>,
    /// FASTA output
    pub fasta: Option<String>,
    /// GenBank output
    pub genbank: Option<String>,
    /// LLVM IR (.ll format)
    pub llvm_ir: Option<String>,
    /// OpenTrons OT-2 Python protocol
    pub opentrons: Option<String>,
    /// SBML Level 3 XML
    pub sbml: Option<String>,
    /// DNA synthesis cost estimate
    pub cost_estimate: Option<targets::CostEstimate>,
    /// Human-readable lab protocol (Markdown)
    pub protocol: Option<String>,
    /// Semantic analysis warnings
    pub semantic_warnings: Vec<String>,
    /// MIR-level analysis data
    pub mir_analysis: MirAnalysisData,
    /// Optimization report
    pub optimization_report: Option<optimization::OptimizationReport>,
    /// Biological type checking result
    pub type_check_result: Option<type_checker::TypeCheckResult>,
}

/// Analysis data from the MIR pass
#[derive(Debug, Clone)]
pub struct MirAnalysisData {
    pub ownership_violations: Vec<String>,
    pub crosstalk_warnings: Vec<String>,
    pub metabolic_burden: Vec<(String, String)>,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_lexer_basic() {
        let source = "circuit Test { let x = pLac; }";
        let tokens = Lexer::tokenize(source).unwrap();
        assert!(!tokens.is_empty());
    }

    #[test]
    fn test_parser_circuit() {
        let source = "circuit SimpleCircuit { let p = pLac; }";
        let mut parser = Parser::new(source).unwrap();
        let program = parser.parse_program().unwrap();
        assert_eq!(program.items.len(), 1);
    }

    #[test]
    fn test_compiler_basic() {
        let compiler = Compiler::new(CompilerConfig::default());
        let source = "circuit Test { }";
        let result = compiler.compile(source);
        assert!(result.is_ok());
    }

    #[test]
    fn compile_repository_examples() {
        let compiler = Compiler::new(CompilerConfig::default());
        let root = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../examples");
        for name in [
            "hello-biology.bio",
            "test-lsp-real.bio",
            "test-extension.bio",
            "DEMO-complete-circuit.bioscript",
        ] {
            let source = std::fs::read_to_string(root.join(name))
                .unwrap_or_else(|err| panic!("read {name}: {err}"));
            compiler
                .compile_full(&source)
                .unwrap_or_else(|err| panic!("{name}: {err}"));
        }
    }

    #[test]
    fn chassis_atp_capacity_is_read() {
        let compiler = Compiler::new(CompilerConfig::default());
        let ir = compiler
            .compile(
                r#"
            chassis LabHost: Host { atp_capacity: 250 AU }
            circuit Tiny { }
        "#,
            )
            .unwrap();
        assert_eq!(ir.host.unwrap().atp_capacity, 250.0);
    }

    #[test]
    fn tiny_atp_capacity_is_rejected() {
        let compiler = Compiler::new(CompilerConfig::default());
        let err = compiler
            .compile(
                r#"
            chassis LabHost: Host { atp_capacity: 0.0000001 AU }
            circuit Big { pLac -> GFP }
        "#,
            )
            .unwrap_err();
        let message = err.to_string();
        assert!(message.contains("ATP"), "{message}");
    }

    fn python_with_validators() -> Option<&'static str> {
        for bin in ["python3", "python"] {
            let ok = std::process::Command::new(bin)
                .args(["-c", "import sbol3, libsbml"])
                .status()
                .map(|status| status.success())
                .unwrap_or(false);
            if ok {
                return Some(bin);
            }
        }
        None
    }

    #[test]
    fn exports_validate_with_pysbol_and_libsbml() {
        let Some(python) = python_with_validators() else {
            if std::env::var("CI").is_ok() {
                panic!("pySBOL3 and python-libsbml must be installed for python3 or python in CI");
            }
            return;
        };

        let compiler = Compiler::new(CompilerConfig::default());
        let cases = [
            (
                "inverter",
                r#"circuit inverter { J23101 -> B0034 -> tetR -> B0015 }"#,
            ),
            (
                "gfp_cassette_demo",
                r#"circuit gfp_cassette_demo { pLac -> B0034 -> GFP -> B0015 }"#,
            ),
            ("repressilator", REPRESSILATOR),
        ];
        let dir = std::env::temp_dir().join("synbio-export-validation");
        std::fs::create_dir_all(&dir).unwrap();
        for (name, source) in cases {
            let result = compiler
                .compile_full(source)
                .unwrap_or_else(|err| panic!("{name}: {err}"));
            let sbol = result.sbol.unwrap_or_default();
            let sbml = result.sbml.unwrap_or_default();
            assert!(
                sbol.contains("hasNamespace"),
                "{name} SBOL missing namespace"
            );
            assert!(sbol.contains("SBO:0000251"), "{name} SBOL missing DNA type");
            assert!(
                sbml.contains("constant=\"true\""),
                "{name} SBML missing constant"
            );
            for token in [
                "substanceUnits=\"mole\"",
                "timeUnits=\"second\"",
                "volumeUnits=\"litre\"",
                "extentUnits=\"mole\"",
            ] {
                assert!(sbml.contains(token), "{name} SBML missing {token}");
            }
            assert!(
                sbml.contains("<ci>k_mRNA_deg</ci><ci>mRNA_")
                    && sbml.contains("<ci>k_prot_deg</ci><ci>protein_")
                    && sbml.contains("<ci>cell</ci>"),
                "{name} SBML rate laws are not scaled by compartment volume"
            );
            if name == "inverter" {
                assert!(sbml.contains("input"), "{name} SBML missing Hill input");
            }
            if name == "gfp_cassette_demo" {
                assert!(sbml.contains("IPTG"), "{name} SBML missing IPTG");
            }
            if name == "repressilator" {
                assert!(
                    sbol.contains("http://sbols.org/v3#Interaction"),
                    "repressilator SBOL has no Interaction"
                );
                assert!(
                    sbol.contains("https://identifiers.org/SBO:0000169"),
                    "repressilator SBOL has no inhibition term"
                );
                assert!(
                    sbol.contains("https://identifiers.org/SBO:0000589"),
                    "repressilator SBOL has no genetic production term"
                );
                assert!(
                    sbol.contains("hasParticipation"),
                    "repressilator SBOL has no participation"
                );
                for protein in [
                    "protein_pLambda_LacI",
                    "protein_pLac_TetR",
                    "protein_pTet_cI",
                ] {
                    assert!(
                        sbml.contains(&format!("modifierSpeciesReference species=\"{protein}\"")),
                        "repressor was not linked to {protein}"
                    );
                }
                assert!(
                    !sbml.contains("regulator_"),
                    "unlinked regulator species leaked into SBML"
                );
            }
            std::fs::write(dir.join(format!("{name}.sbol")), &sbol).unwrap();
            std::fs::write(dir.join(format!("{name}.sbml")), &sbml).unwrap();
        }

        let script =
            std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../scripts/validate_exports.py");
        let output = std::process::Command::new(python)
            .arg(&script)
            .arg(&dir)
            .output()
            .unwrap_or_else(|err| panic!("validator: {err}"));
        assert!(
            output.status.success(),
            "export validation failed\n{}",
            String::from_utf8_lossy(&output.stdout)
        );
    }

    const REPRESSILATOR: &str = r#"
        circuit Repressilator {
            pLambda -> B0034 -> LacI -> B0015
            pLac -> B0034 -> TetR -> B0015
            pTet -> B0034 -> cI -> B0015
            LacI ~> pLac
            TetR ~> pTet
            cI ~> pLambda
        }
    "#;

    #[test]
    fn repressilator_sbml_closes_feedback_and_sbol_records_interactions() {
        let compiler = Compiler::new(CompilerConfig::default());
        let result = compiler
            .compile_full(REPRESSILATOR)
            .expect("repressilator compiles");
        let sbml = result.sbml.unwrap();
        let sbol = result.sbol.unwrap();
        let expected = [
            ("txn_pLac_TetR", "protein_pLambda_LacI"),
            ("txn_pTet_cI", "protein_pLac_TetR"),
            ("txn_pLambda_LacI", "protein_pTet_cI"),
        ];
        for (reaction, protein) in expected {
            let modifier = txn_modifier(&sbml, reaction).unwrap_or_else(|| {
                panic!(
                    "{reaction} has no modifier\n{}",
                    reaction_block(&sbml, reaction)
                )
            });
            assert_eq!(modifier, protein, "{reaction} repressor species");
            assert!(
                sbml.contains(&format!("id=\"{protein}\"")),
                "{protein} is not a species"
            );
            let species = species_tag(&sbml, protein);
            assert!(
                species.contains("boundaryCondition=\"false\""),
                "{protein} must be the produced protein, not a boundary input: {species}"
            );
        }
        assert!(!sbml.contains("regulator_"));
        assert!(sbml.contains("id=\"K_hill\" name=\"Hill threshold\" value=\"10\""));
        assert!(sbml.contains("<cn type=\"integer\" sbml:units=\"dimensionless\">2</cn>"));
        assert!(sbml.contains("id=\"k_leak_pLac_TetR\""));
        assert!(sbml.contains("value=\"0\" units=\"mole_per_litre_per_second\""));
        assert!(sbol.contains("http://sbols.org/v3#Interaction"));
        assert!(sbol.contains("https://identifiers.org/SBO:0000169"));
        assert!(sbol.contains("https://identifiers.org/SBO:0000020"));
        assert!(sbol.contains("https://identifiers.org/SBO:0000642"));
        assert!(sbol.contains("https://identifiers.org/SBO:0000589"));
        assert!(sbol.contains("https://identifiers.org/SBO:0000645"));
        assert!(sbol.contains("https://identifiers.org/SBO:0000011"));
        assert!(sbol.contains("sbol:participant"));
    }

    #[test]
    fn kinetic_overrides_keep_defaults_when_omitted() {
        let compiler = Compiler::new(CompilerConfig::default());
        let plain = compiler
            .compile_full("circuit plain { pTet -> B0034 -> GFP -> B0015 }")
            .unwrap();
        let sbml = plain.sbml.unwrap();
        assert!(sbml.contains("value=\"10\""));
        assert!(
            !sbml.contains("k_leak_"),
            "constitutive export gained a basal term"
        );
        assert!(!sbml.contains("initialConcentration"));

        let overridden = compiler
            .compile_full(
                r#"
                circuit Toggle {
                    pLambda -> B0034 -> LacI -> B0015
                    pTrc -> B0034 -> cI -> B0015
                    cI ~> pLambda
                    LacI ~> pTrc
                    kinetics {
                        k_mRNA_deg: 0.01
                        k_prot_deg: 0.002
                        LacI: { k_txn: 2.5, k_tln: 0.2, k_leak: 0.01 }
                        cI: { k_txn: 0.25 }
                        pLambda: { hill: 2.5, K: 1 }
                        pTrc: { hill: 1, K: 8 }
                    }
                }
            "#,
            )
            .unwrap_or_else(|err| panic!("toggle: {err}"));
        let sbml = overridden.sbml.unwrap();
        assert_eq!(
            txn_modifier(&sbml, "txn_pLambda_LacI").as_deref(),
            Some("protein_pTrc_cI")
        );
        assert_eq!(
            txn_modifier(&sbml, "txn_pTrc_cI").as_deref(),
            Some("protein_pLambda_LacI")
        );
        assert!(sbml.contains("dimensionless\">2.5</cn>"));
        assert!(sbml.contains("dimensionless\">1</cn>"));
        assert!(sbml.contains("id=\"K_hill_pLambda_LacI\""));
        assert!(parameter_value(&sbml, "K_hill_pLambda_LacI") - 1.0 < 1e-9);
        assert!((parameter_value(&sbml, "K_hill_pTrc_cI") - 8.0).abs() < 1e-9);
        assert!((parameter_value(&sbml, "k_txn_pLambda_LacI") - 2.5).abs() < 1e-9);
        assert!((parameter_value(&sbml, "k_tln_pLambda_LacI") - 0.2).abs() < 1e-9);
        assert!((parameter_value(&sbml, "k_leak_pLambda_LacI") - 0.01).abs() < 1e-9);
        assert!((parameter_value(&sbml, "k_mRNA_deg") - 0.01).abs() < 1e-9);
        assert!((parameter_value(&sbml, "k_prot_deg") - 0.002).abs() < 1e-9);
        // The global threshold stays at the historical default when links disagree.
        assert!((parameter_value(&sbml, "K_hill") - 10.0).abs() < 1e-9);

        let rejected =
            compiler.compile_full("circuit Bad { pLac -> GFP kinetics { not_a_rate: 1 } }");
        let message = rejected.unwrap_err().to_string();
        assert!(message.contains("unknown kinetic parameter"), "{message}");
    }

    #[test]
    fn biomd12_repressilator_export_oscillates() {
        let ln2 = std::f64::consts::LN_2;
        let k_mrna = ln2 / 2.0 / 60.0;
        let k_prot = ln2 / 10.0 / 60.0;
        let k_tln = 20.0 * ln2 / 2.0 / 60.0;
        let k_txn = 0.5 - 0.0005;
        let k_leak = 0.0005_f64;
        let source = format!(
            r#"
            circuit Repressilator {{
                pLambda -> B0034 -> LacI -> B0015
                pLac -> B0034 -> TetR -> B0015
                pTet -> B0034 -> cI -> B0015
                LacI ~> pLac
                TetR ~> pTet
                cI ~> pLambda
                kinetics {{
                    hill: 2
                    K: 40
                    k_txn: {k_txn:.12}
                    k_tln: {k_tln:.12}
                    k_leak: {k_leak:.12}
                    k_mRNA_deg: {k_mrna:.12}
                    k_prot_deg: {k_prot:.12}
                    TetR: {{ initial_mRNA: 20 }}
                }}
            }}
            "#
        );
        let compiler = Compiler::new(CompilerConfig::default());
        let sbml = compiler.compile_full(&source).unwrap().sbml.unwrap();
        let units = [
            ("pLambda_LacI", "protein_pTet_cI"),
            ("pLac_TetR", "protein_pLambda_LacI"),
            ("pTet_cI", "protein_pLac_TetR"),
        ];
        let mut repressor = [0usize; 3];
        let mrna_ids = ["mRNA_pLambda_LacI", "mRNA_pLac_TetR", "mRNA_pTet_cI"];
        let protein_ids = [
            "protein_pLambda_LacI",
            "protein_pLac_TetR",
            "protein_pTet_cI",
        ];
        for (index, (tu, expected)) in units.iter().enumerate() {
            let modifier = txn_modifier(&sbml, &format!("txn_{tu}")).unwrap();
            assert_eq!(modifier, *expected);
            repressor[index] = protein_ids.iter().position(|id| *id == modifier).unwrap() * 2 + 1;
        }
        let rates = OscRates {
            k_txn: parameter_value(&sbml, "k_txn_pLac_TetR"),
            k_tln: parameter_value(&sbml, "k_tln_pLac_TetR"),
            k_leak: parameter_value(&sbml, "k_leak_pLac_TetR"),
            k_mrna: parameter_value(&sbml, "k_mRNA_deg"),
            k_prot: parameter_value(&sbml, "k_prot_deg"),
            k: parameter_value(&sbml, "K_hill"),
            n: reaction_hill(&sbml, "txn_pLac_TetR"),
            repressor,
        };
        let mut y = [0.0; 6];
        y[2] = species_initial(&sbml, mrna_ids[1]);
        assert!((y[2] - 20.0).abs() < 1e-6, "TetR mRNA initial {}", y[2]);
        let (period_min, amplitude, samples) = integrate_repressilator(&rates, y);
        assert!(
            period_min > 110.0 && period_min < 140.0,
            "period {period_min} min is not the BIOMD0000000012 oscillation (expected about 125)"
        );
        assert!(amplitude > 1000.0, "LacI amplitude {amplitude} is flat");
        let mut reference_rates = rates;
        reference_rates.k_txn = k_txn;
        reference_rates.k_tln = k_tln;
        reference_rates.k_leak = k_leak;
        reference_rates.k_mrna = k_mrna;
        reference_rates.k_prot = k_prot;
        reference_rates.k = 40.0;
        reference_rates.n = 2.0;
        let (_, _, reference) =
            integrate_repressilator(&reference_rates, [0.0, 0.0, 20.0, 0.0, 0.0, 0.0]);
        let mut sq = 0.0;
        let mut peak = f64::MIN;
        let mut trough = f64::MAX;
        for (sample, truth) in samples.iter().zip(reference.iter()) {
            let diff = sample - truth;
            sq += diff * diff;
            peak = peak.max(*truth);
            trough = trough.min(*truth);
        }
        let nrmse = (sq / samples.len() as f64).sqrt() / (peak - trough);
        assert!(
            nrmse < 1e-3,
            "SBML-parameterised trajectory NRMSE {nrmse} vs BIOMD0000000012 equations"
        );
    }

    struct OscRates {
        k_txn: f64,
        k_tln: f64,
        k_leak: f64,
        k_mrna: f64,
        k_prot: f64,
        k: f64,
        n: f64,
        /// Protein state index that represses each mRNA, in LacI, TetR, cI order.
        repressor: [usize; 3],
    }

    fn integrate_repressilator(rates: &OscRates, mut y: [f64; 6]) -> (f64, f64, Vec<f64>) {
        let dt = 1.0_f64;
        let steps = 2000 * 60;
        let mut samples = Vec::with_capacity(steps / 30);
        let mut peaks = Vec::new();
        let mut prev = y[1];
        let mut prev_slope = 0.0;
        for step in 0..steps {
            let dy = osc_deriv(&y, rates);
            let mid = add6(y, scale6(dy, dt * 0.5));
            let k2 = osc_deriv(&mid, rates);
            let mid2 = add6(y, scale6(k2, dt * 0.5));
            let k3 = osc_deriv(&mid2, rates);
            let end = add6(y, scale6(k3, dt));
            let k4 = osc_deriv(&end, rates);
            y = add6(
                y,
                scale6(
                    add6(add6(dy, scale6(k2, 2.0)), add6(scale6(k3, 2.0), k4)),
                    dt / 6.0,
                ),
            );
            let minute = (step + 1) as f64 / 60.0;
            if step % 30 == 0 {
                samples.push(y[1]);
            }
            let slope = y[1] - prev;
            if minute >= 1000.0 && prev_slope > 0.0 && slope <= 0.0 {
                peaks.push(minute);
            }
            prev_slope = slope;
            prev = y[1];
        }
        assert!(
            peaks.len() >= 3,
            "expected an oscillation, peaks={peaks:?} final={y:?}"
        );
        let period =
            peaks.windows(2).map(|pair| pair[1] - pair[0]).sum::<f64>() / (peaks.len() - 1) as f64;
        let window: Vec<f64> = samples.iter().copied().skip(samples.len() / 2).collect();
        let amplitude = window.iter().copied().fold(f64::MIN, f64::max)
            - window.iter().copied().fold(f64::MAX, f64::min);
        (period, amplitude, samples)
    }

    fn osc_deriv(y: &[f64; 6], rates: &OscRates) -> [f64; 6] {
        let mut dy = [0.0; 6];
        for gene in 0..3 {
            let mrna = y[gene * 2];
            let protein = y[gene * 2 + 1];
            let repressor = y[rates.repressor[gene]];
            let kn = rates.k.powf(rates.n);
            let sn = repressor.powf(rates.n);
            dy[gene * 2] = rates.k_leak + rates.k_txn * kn / (kn + sn) - rates.k_mrna * mrna;
            dy[gene * 2 + 1] = rates.k_tln * mrna - rates.k_prot * protein;
        }
        dy
    }

    fn add6(left: [f64; 6], right: [f64; 6]) -> [f64; 6] {
        std::array::from_fn(|index| left[index] + right[index])
    }

    fn scale6(value: [f64; 6], factor: f64) -> [f64; 6] {
        std::array::from_fn(|index| value[index] * factor)
    }

    fn parameter_value(sbml: &str, id: &str) -> f64 {
        let marker = format!("id=\"{id}\"");
        let start = sbml.find(&marker).unwrap_or_else(|| panic!("missing {id}"));
        let window = &sbml[start..];
        let value_at = window
            .find("value=\"")
            .unwrap_or_else(|| panic!("no value for {id}"))
            + 7;
        let end = window[value_at..].find('"').unwrap();
        window[value_at..value_at + end]
            .parse()
            .unwrap_or_else(|_| panic!("bad value for {id}"))
    }

    fn reaction_block<'a>(sbml: &'a str, reaction_id: &str) -> &'a str {
        let marker = format!("<reaction id=\"{reaction_id}\"");
        let start = sbml
            .find(&marker)
            .unwrap_or_else(|| panic!("missing reaction {reaction_id}"));
        let end = sbml[start..]
            .find("</reaction>")
            .unwrap_or_else(|| panic!("unclosed {reaction_id}"))
            + start;
        &sbml[start..end]
    }

    fn txn_modifier(sbml: &str, reaction_id: &str) -> Option<String> {
        let block = reaction_block(sbml, reaction_id);
        let key = "modifierSpeciesReference species=\"";
        let pos = block.find(key)? + key.len();
        let end = block[pos..].find('"')?;
        Some(block[pos..pos + end].to_string())
    }

    fn reaction_hill(sbml: &str, reaction_id: &str) -> f64 {
        let block = reaction_block(sbml, reaction_id);
        let key = "sbml:units=\"dimensionless\">";
        let pos = block.find(key).expect("hill exponent") + key.len();
        let end = block[pos..].find('<').unwrap();
        block[pos..pos + end].parse().unwrap()
    }

    fn species_tag(sbml: &str, id: &str) -> String {
        let marker = format!("id=\"{id}\"");
        let start = sbml
            .find(&marker)
            .unwrap_or_else(|| panic!("missing species {id}"));
        let end = sbml[start..].find("/>").unwrap() + start;
        sbml[start..end].to_string()
    }

    fn species_initial(sbml: &str, id: &str) -> f64 {
        let tag = species_tag(sbml, id);
        let key = if tag.contains("initialConcentration=\"") {
            "initialConcentration=\""
        } else {
            "initialAmount=\""
        };
        let pos = tag.find(key).unwrap() + key.len();
        let end = tag[pos..].find('"').unwrap();
        tag[pos..pos + end].parse().unwrap()
    }
}
