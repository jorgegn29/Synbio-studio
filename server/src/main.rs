//! SynBio-LLVM Language Server & Compiler CLI
//! 
//! Servidor LSP para el lenguaje BioScript.
//! Proporciona análisis de código, autocompletado y diagnósticos
//! para circuitos genéticos.
//!
//! Modes:
//!   --stdio (default): LSP server over stdin/stdout
//!   --compile-full: Read BioScript from stdin, output full JSON compilation result to stdout

use tower_lsp::{LspService, Server};
use serde::Serialize;

mod lsp;
mod compiler;
mod physics;

use lsp::BioScriptBackend;
use compiler::{Compiler, CompilerConfig};

/// JSON output for full compilation (sent to SynBio Studio via stdout)
#[derive(Serialize)]
struct CliCompilationResult {
    success: bool,
    errors: Vec<CliDiagnostic>,
    warnings: Vec<CliDiagnostic>,
    // Outputs
    sbol: Option<String>,
    fasta: Option<String>,
    genbank: Option<String>,
    llvm_ir: Option<String>,
    opentrons: Option<String>,
    sbml: Option<String>,
    cost_estimate: Option<compiler::targets::CostEstimate>,
    protocol: Option<String>,
    // Analysis
    semantic_warnings: Vec<String>,
    mir_analysis: CliMirAnalysis,
    optimization_report: Option<compiler::optimization::OptimizationReport>,
    // Biological Type System
    type_check: Option<CliTypeCheckResult>,
    // Stats
    stats: CliCompileStats,
}

#[derive(Serialize)]
struct CliTypeCheckResult {
    inferred_types: std::collections::HashMap<String, String>,
    host: Option<String>,
    biosecurity_passed: bool,
    interactions: Vec<String>,
    diagnostics: Vec<CliDiagnostic>,
    summary: CliTypeSummary,
}

#[derive(Serialize)]
struct CliTypeSummary {
    promoters: usize,
    rbs_count: usize,
    cds_count: usize,
    terminators: usize,
    reporters: usize,
    regulators: usize,
    measurements_with_units: usize,
    sequence_operations: usize,
    host_checks: usize,
    security_checks: usize,
}

#[derive(Serialize)]
struct CliDiagnostic {
    line: u32,
    column: u32,
    message: String,
    code: String,
    severity: String,
}

#[derive(Serialize)]
struct CliMirAnalysis {
    ownership_violations: Vec<String>,
    crosstalk_warnings: Vec<String>,
    metabolic_burden: Vec<(String, String)>,
}

#[derive(Serialize)]
struct CliCompileStats {
    circuits_count: usize,
    parts_count: usize,
    total_bp: usize,
}

fn run_compile_full() {
    use std::io::Read;
    
    let mut source = String::new();
    std::io::stdin().read_to_string(&mut source).unwrap_or_default();
    
    let compiler = Compiler::new(CompilerConfig::default());
    
    match compiler.compile_full(&source) {
        Ok(result) => {
            // Count stats from the BioIR
            let circuits_count = result.bio_ir.circuits.len();
            let parts_count: usize = result.bio_ir.circuits.iter()
                .map(|c| c.transcription_units.len())
                .sum();
            let total_bp: usize = result.bio_ir.circuits.iter()
                .flat_map(|c| c.transcription_units.iter())
                .map(|tu| {
                    tu.promoter.sequence.len()
                        + tu.rbs.sequence.len()
                        + tu.cds.dna_sequence.len()
                        + tu.terminator.as_ref().map(|t| t.sequence.len()).unwrap_or(0)
                })
                .sum();
            
            // Build diagnostics from DiagnosticsProvider for warnings
            let diag_provider = lsp::diagnostics::DiagnosticsProvider::new();
            let lsp_diags = diag_provider.analyze(&source);
            
            let mut warnings: Vec<CliDiagnostic> = result.semantic_warnings.iter()
                .map(|w| CliDiagnostic {
                    line: 0,
                    column: 0,
                    message: w.clone(),
                    code: "SW001".to_string(),
                    severity: "warning".to_string(),
                })
                .collect();
            
            // Add LSP diagnostics
            for d in &lsp_diags {
                let sev = match d.severity {
                    Some(tower_lsp::lsp_types::DiagnosticSeverity::ERROR) => "error",
                    Some(tower_lsp::lsp_types::DiagnosticSeverity::WARNING) => "warning",
                    Some(tower_lsp::lsp_types::DiagnosticSeverity::INFORMATION) => "info",
                    _ => "hint",
                };
                if sev == "warning" || sev == "info" || sev == "hint" {
                    warnings.push(CliDiagnostic {
                        line: d.range.start.line,
                        column: d.range.start.character,
                        message: d.message.clone(),
                        code: d.code.as_ref().map(|c| match c {
                            tower_lsp::lsp_types::NumberOrString::String(s) => s.clone(),
                            tower_lsp::lsp_types::NumberOrString::Number(n) => n.to_string(),
                        }).unwrap_or_default(),
                        severity: sev.to_string(),
                    });
                }
            }
            
            // Build type check result
            let type_check = result.type_check_result.map(|tc| {
                let tc_diags = tc.diagnostics.iter().map(|d| CliDiagnostic {
                    line: 0,
                    column: 0,
                    message: d.message.clone(),
                    code: d.code.code_str().to_string(),
                    severity: match d.severity {
                        compiler::type_checker::TypeSeverity::Error => "error".to_string(),
                        compiler::type_checker::TypeSeverity::Warning => "warning".to_string(),
                        compiler::type_checker::TypeSeverity::Info => "info".to_string(),
                        compiler::type_checker::TypeSeverity::Hint => "hint".to_string(),
                    },
                }).collect();
                CliTypeCheckResult {
                    inferred_types: tc.inferred_types,
                    host: tc.host,
                    biosecurity_passed: tc.biosecurity_passed,
                    interactions: tc.interactions,
                    diagnostics: tc_diags,
                    summary: CliTypeSummary {
                        promoters: tc.type_summary.promoters,
                        rbs_count: tc.type_summary.rbs_count,
                        cds_count: tc.type_summary.cds_count,
                        terminators: tc.type_summary.terminators,
                        reporters: tc.type_summary.reporters,
                        regulators: tc.type_summary.regulators,
                        measurements_with_units: tc.type_summary.measurements_with_units,
                        sequence_operations: tc.type_summary.sequence_operations,
                        host_checks: tc.type_summary.host_checks,
                        security_checks: tc.type_summary.security_checks,
                    },
                }
            });

            let cli_result = CliCompilationResult {
                success: true,
                errors: Vec::new(),
                warnings,
                sbol: result.sbol,
                fasta: result.fasta,
                genbank: result.genbank,
                llvm_ir: result.llvm_ir,
                opentrons: result.opentrons,
                sbml: result.sbml,
                cost_estimate: result.cost_estimate,
                protocol: result.protocol,
                semantic_warnings: result.semantic_warnings,
                mir_analysis: CliMirAnalysis {
                    ownership_violations: result.mir_analysis.ownership_violations,
                    crosstalk_warnings: result.mir_analysis.crosstalk_warnings,
                    metabolic_burden: result.mir_analysis.metabolic_burden,
                },
                optimization_report: result.optimization_report,
                type_check,
                stats: CliCompileStats {
                    circuits_count,
                    parts_count,
                    total_bp,
                },
            };
            
            let json = serde_json::to_string(&cli_result).unwrap();
            println!("{}", json);
        }
        Err(err) => {
            let cli_result = CliCompilationResult {
                success: false,
                errors: vec![CliDiagnostic {
                    line: 0,
                    column: 0,
                    message: err.to_string(),
                    code: "E0001".to_string(),
                    severity: "error".to_string(),
                }],
                warnings: Vec::new(),
                sbol: None,
                fasta: None,
                genbank: None,
                llvm_ir: None,
                opentrons: None,
                sbml: None,
                cost_estimate: None,
                protocol: None,
                semantic_warnings: Vec::new(),
                mir_analysis: CliMirAnalysis {
                    ownership_violations: Vec::new(),
                    crosstalk_warnings: Vec::new(),
                    metabolic_burden: Vec::new(),
                },
                optimization_report: None,
                type_check: None,
                stats: CliCompileStats {
                    circuits_count: 0,
                    parts_count: 0,
                    total_bp: 0,
                },
            };
            
            let json = serde_json::to_string(&cli_result).unwrap();
            println!("{}", json);
        }
    }
}

#[tokio::main]
async fn main() {
    let args: Vec<String> = std::env::args().collect();
    
    // CLI compile mode: synbio-lsp --compile-full < source.bio
    if args.iter().any(|a| a == "--compile-full") {
        run_compile_full();
        return;
    }
    
    // Default: LSP server mode
    tracing_subscriber::fmt()
        .with_ansi(false)
        .with_writer(std::io::stderr)
        .init();

    tracing::info!("🧬 Iniciando SynBio-LLVM Language Server...");

    let stdin = tokio::io::stdin();
    let stdout = tokio::io::stdout();

    let (service, socket) = LspService::new(|client| BioScriptBackend::new(client));
    
    Server::new(stdin, stdout, socket).serve(service).await;
}
