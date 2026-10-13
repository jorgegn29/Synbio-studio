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

pub mod lexer;
pub mod parser;
pub mod ast;
pub mod bio_ir;
pub mod codegen;
pub mod insulation;
pub mod codon_optimizer;
pub mod circuit_optimizer;
pub mod semantic;
pub mod hir;
pub mod mir;
pub mod ir_lowering;
pub mod optimization;
pub mod llvm_codegen;
pub mod targets;
pub mod bio_types;
pub mod unit_system;
pub mod select_agents;
pub mod type_checker;

pub use lexer::{Lexer, LexerError};
pub use parser::{Parser, ParseError};
pub use ast::*;
pub use bio_ir::*;
pub use codegen::{CodeGenerator, GeneratorConfig, CodeGenError};
pub use insulation::{InsulationEngine, InsulationConfig, InsulationReport};
pub use llvm_codegen::LlvmConfig;

use crate::physics::{MetabolicModel, GeneExpression, Sustainability};
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
            atp_error_threshold: 150.0,  // Error si supera 150% de capacidad
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
                report.total_overhead_bp.to_string()
            );
            circuit.metadata.insert(
                "insulation_efficiency".to_string(),
                format!("{:.2}", report.estimated_efficiency)
            );
        }
    }
    
    /// Valida la carga metabólica usando Flux Balance Analysis
    fn validate_metabolic_load(&self, program: &BioIRProgram) -> CompileResult<()> {
        for circuit in &program.circuits {
            // Extraer información de genes del circuito
            let gene_expressions: Vec<GeneExpression> = circuit.transcription_units.iter()
                .map(|tu| {
                    // Calcular longitudes aproximadas
                    let mrna_len = tu.promoter.sequence.len() 
                        + tu.rbs.sequence.len() 
                        + tu.cds.dna_sequence.len()
                        + tu.terminator.as_ref().map(|t| t.sequence.len()).unwrap_or(0);
                    
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
            let metabolic_cost = self.metabolic_model.estimate_circuit_cost(&gene_expressions);
            
            // Verificar si excede la capacidad del host
            let atp_usage_percent = (metabolic_cost.atp_per_cell_division / 1e9) * 100.0;
            
            // ERROR: Si excede el umbral de error
            if atp_usage_percent > self.config.atp_error_threshold {
                return Err(CompilerError::MetabolicOverload(format!(
                    "El circuito '{}' demanda {:.1}% de la capacidad de ATP del host, \
                    excediendo el límite de {:.0}%. \
                    Soluciones: reducir niveles de expresión, usar promotores más débiles, \
                    o eliminar genes no esenciales.",
                    circuit.name,
                    atp_usage_percent,
                    self.config.atp_error_threshold
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
            let real_errors: Vec<_> = errors.iter()
                .filter(|e| e.severity == semantic::Severity::Error)
                .collect();
            if !real_errors.is_empty() {
                let msg = real_errors.iter()
                    .map(|e| format!("[{}] {}", e.code, e.message))
                    .collect::<Vec<_>>()
                    .join("; ");
                return Err(CompilerError::Semantic(msg));
            }
            semantic_warnings = errors.iter()
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
            ownership_violations: mir_program.circuits.iter()
                .flat_map(|c| c.ownership.violations.iter().map(|v| v.message.clone()))
                .collect(),
            crosstalk_warnings: mir_program.circuits.iter()
                .flat_map(|c| c.crosstalk_warnings.iter().map(|w| format!("{:?}", w)))
                .collect(),
            metabolic_burden: mir_program.circuits.iter()
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
            let msg = errors.iter()
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
                let usage_percent = (atp_cost / host.atp_capacity) * 100.0;
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
            "anthrax", "botulinum", "ebola", "smallpox", "ricin",
            "plague", "tularemia", "brucella",
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
                            tu.cds.name, tu.cds.dna_sequence.len()
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
}
