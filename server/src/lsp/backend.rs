#![allow(dead_code)]
//! Backend principal del Language Server
//!
//! Integra DiagnosticsProvider, CompletionProvider y HoverProvider
//! con el protocolo LSP usando tower-lsp.

use tower_lsp::jsonrpc::Result;
use tower_lsp::lsp_types::*;
use tower_lsp::{Client, LanguageServer};
use std::sync::Arc;
use tokio::sync::RwLock;
use std::collections::HashMap;
use serde::{Deserialize, Serialize};

use crate::lsp::diagnostics::DiagnosticsProvider;
use crate::lsp::completion::CompletionProvider;
use crate::lsp::hover::HoverProvider;
use crate::compiler::{Compiler, CompilerConfig};

/// Estado del documento
#[derive(Debug, Clone)]
pub struct DocumentState {
    pub content: String,
    pub version: i32,
}

/// Resultado de compilación enviado al cliente
#[derive(Debug, Serialize, Deserialize)]
pub struct CompileResult {
    pub success: bool,
    pub errors: Vec<CompileDiagnostic>,
    pub warnings: Vec<CompileDiagnostic>,
    pub output_sbol: Option<String>,
    pub output_fasta: Option<String>,
    pub output_genbank: Option<String>,
    pub llvm_ir: Option<String>,
    pub opentrons: Option<String>,
    pub sbml: Option<String>,
    pub cost_estimate: Option<crate::compiler::targets::CostEstimate>,
    pub protocol: Option<String>,
    pub semantic_warnings: Vec<String>,
    pub mir_analysis: Option<MirAnalysisJson>,
    pub optimization_report: Option<crate::compiler::optimization::OptimizationReport>,
    pub stats: CompileStats,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct MirAnalysisJson {
    pub ownership_violations: Vec<String>,
    pub crosstalk_warnings: Vec<String>,
    pub metabolic_burden: Vec<(String, String)>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct CompileDiagnostic {
    pub line: u32,
    pub column: u32,
    pub message: String,
    pub code: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct CompileStats {
    pub parts_count: usize,
    pub circuits_count: usize,
    pub total_bp: usize,
    pub gc_content: f64,
    pub safety_score: f64,
}

/// Backend del servidor de lenguaje BioScript
pub struct BioScriptBackend {
    client: Client,
    documents: Arc<RwLock<HashMap<Url, DocumentState>>>,
    diagnostics_provider: DiagnosticsProvider,
    completion_provider: CompletionProvider,
    hover_provider: HoverProvider,
}

impl BioScriptBackend {
    pub fn new(client: Client) -> Self {
        Self {
            client,
            documents: Arc::new(RwLock::new(HashMap::new())),
            diagnostics_provider: DiagnosticsProvider::new(),
            completion_provider: CompletionProvider::new(),
            hover_provider: HoverProvider::new(),
        }
    }

    /// Analiza un documento usando DiagnosticsProvider REAL (parser + biología)
    async fn analyze_document(&self, _uri: &Url, content: &str) -> Vec<Diagnostic> {
        self.diagnostics_provider.analyze(content)
    }

    /// Compilación real: full pipeline → BioIR → all outputs
    fn compile_document(&self, content: &str) -> CompileResult {
        let mut errors = Vec::new();
        let mut warnings = Vec::new();

        // Use the full compiler pipeline
        let compiler = Compiler::new(CompilerConfig::default());
        
        match compiler.compile_full(content) {
            Ok(result) => {
                // Extract stats from the compiled BioIR
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
                
                // Calculate GC content from actual sequences
                let all_seqs: String = result.bio_ir.circuits.iter()
                    .flat_map(|c| c.transcription_units.iter())
                    .map(|tu| format!("{}{}{}", tu.promoter.sequence, tu.rbs.sequence, tu.cds.dna_sequence))
                    .collect();
                let gc_count = all_seqs.chars().filter(|c| matches!(c, 'G' | 'C' | 'g' | 'c')).count();
                let atgc_count = all_seqs.chars().filter(|c| matches!(c, 'A' | 'T' | 'G' | 'C' | 'a' | 't' | 'g' | 'c')).count();
                let gc_content = if atgc_count > 0 { gc_count as f64 / atgc_count as f64 } else { 0.0 };
                
                // Safety score based on containment
                let has_containment = result.bio_ir.circuits.iter().any(|c| c.is_contained);
                let safety_score = if has_containment { 0.95 } else { 0.3 };
                
                // Add semantic warnings as diagnostics
                for sw in &result.semantic_warnings {
                    warnings.push(CompileDiagnostic {
                        line: 0,
                        column: 0,
                        message: sw.clone(),
                        code: "SW001".to_string(),
                    });
                }
                
                // Also add DiagnosticsProvider warnings (bio-specific)
                let bio_diags = self.diagnostics_provider.analyze(content);
                for diag in &bio_diags {
                    match diag.severity {
                        Some(DiagnosticSeverity::ERROR) => {
                            errors.push(CompileDiagnostic {
                                line: diag.range.start.line,
                                column: diag.range.start.character,
                                message: diag.message.clone(),
                                code: diag.code.as_ref().map(|c| match c {
                                    NumberOrString::String(s) => s.clone(),
                                    NumberOrString::Number(n) => n.to_string(),
                                }).unwrap_or_default(),
                            });
                        }
                        Some(DiagnosticSeverity::WARNING) => {
                            warnings.push(CompileDiagnostic {
                                line: diag.range.start.line,
                                column: diag.range.start.character,
                                message: diag.message.clone(),
                                code: diag.code.as_ref().map(|c| match c {
                                    NumberOrString::String(s) => s.clone(),
                                    NumberOrString::Number(n) => n.to_string(),
                                }).unwrap_or_default(),
                            });
                        }
                        _ => {}
                    }
                }
                
                CompileResult {
                    success: true,
                    errors,
                    warnings,
                    output_sbol: result.sbol,
                    output_fasta: result.fasta,
                    output_genbank: result.genbank,
                    llvm_ir: result.llvm_ir,
                    opentrons: result.opentrons,
                    sbml: result.sbml,
                    cost_estimate: result.cost_estimate,
                    protocol: result.protocol,
                    semantic_warnings: result.semantic_warnings,
                    mir_analysis: Some(MirAnalysisJson {
                        ownership_violations: result.mir_analysis.ownership_violations,
                        crosstalk_warnings: result.mir_analysis.crosstalk_warnings,
                        metabolic_burden: result.mir_analysis.metabolic_burden,
                    }),
                    optimization_report: result.optimization_report,
                    stats: CompileStats {
                        parts_count,
                        circuits_count,
                        total_bp,
                        gc_content,
                        safety_score,
                    },
                }
            }
            Err(compile_err) => {
                errors.push(CompileDiagnostic {
                    line: 0,
                    column: 0,
                    message: compile_err.to_string(),
                    code: "E0001".to_string(),
                });
                
                CompileResult {
                    success: false,
                    errors,
                    warnings,
                    output_sbol: None,
                    output_fasta: None,
                    output_genbank: None,
                    llvm_ir: None,
                    opentrons: None,
                    sbml: None,
                    cost_estimate: None,
                    protocol: None,
                    semantic_warnings: Vec::new(),
                    mir_analysis: None,
                    optimization_report: None,
                    stats: CompileStats {
                        parts_count: 0,
                        circuits_count: 0,
                        total_bp: 0,
                        gc_content: 0.0,
                        safety_score: 0.0,
                    },
                }
            }
        }
    }
}

#[tower_lsp::async_trait]
impl LanguageServer for BioScriptBackend {
    async fn initialize(&self, _: InitializeParams) -> Result<InitializeResult> {
        Ok(InitializeResult {
            capabilities: ServerCapabilities {
                text_document_sync: Some(TextDocumentSyncCapability::Kind(
                    TextDocumentSyncKind::FULL,
                )),
                completion_provider: Some(CompletionOptions {
                    trigger_characters: Some(vec![
                        ".".to_string(),
                        ":".to_string(),
                        "<".to_string(),
                        " ".to_string(),
                    ]),
                    resolve_provider: Some(true),
                    ..Default::default()
                }),
                hover_provider: Some(HoverProviderCapability::Simple(true)),
                definition_provider: Some(OneOf::Left(true)),
                references_provider: Some(OneOf::Left(true)),
                document_formatting_provider: Some(OneOf::Left(true)),
                ..Default::default()
            },
            server_info: Some(ServerInfo {
                name: "SynBio-LLVM Language Server".to_string(),
                version: Some("0.2.0".to_string()),
            }),
        })
    }

    async fn initialized(&self, _: InitializedParams) {
        self.client
            .log_message(MessageType::INFO, "🧬 SynBio-LLVM LSP v0.2.0 inicializado — Parser real + Diagnósticos biológicos activos")
            .await;
    }

    async fn shutdown(&self) -> Result<()> {
        Ok(())
    }

    async fn did_open(&self, params: DidOpenTextDocumentParams) {
        let uri = params.text_document.uri.clone();
        let content = params.text_document.text.clone();
        let version = params.text_document.version;

        // Guardar documento
        {
            let mut docs = self.documents.write().await;
            docs.insert(uri.clone(), DocumentState { content: content.clone(), version });
        }

        // Analizar con DiagnosticsProvider REAL y publicar
        let diagnostics = self.analyze_document(&uri, &content).await;
        self.client.publish_diagnostics(uri.clone(), diagnostics.clone(), Some(version)).await;
        
        let error_count = diagnostics.iter().filter(|d| d.severity == Some(DiagnosticSeverity::ERROR)).count();
        let warn_count = diagnostics.iter().filter(|d| d.severity == Some(DiagnosticSeverity::WARNING)).count();
        self.client
            .log_message(
                MessageType::INFO,
                format!("🧬 Analizado: {} errores, {} advertencias", error_count, warn_count),
            )
            .await;
    }

    async fn did_change(&self, params: DidChangeTextDocumentParams) {
        let uri = params.text_document.uri.clone();
        let version = params.text_document.version;

        if let Some(change) = params.content_changes.into_iter().last() {
            let content = change.text;

            // Actualizar documento
            {
                let mut docs = self.documents.write().await;
                docs.insert(uri.clone(), DocumentState { content: content.clone(), version });
            }

            // Re-analizar con DiagnosticsProvider REAL
            let diagnostics = self.analyze_document(&uri, &content).await;
            self.client.publish_diagnostics(uri, diagnostics, Some(version)).await;
        }
    }

    async fn completion(&self, params: CompletionParams) -> Result<Option<CompletionResponse>> {
        let uri = &params.text_document_position.text_document.uri;
        let position = params.text_document_position.position;

        let docs = self.documents.read().await;
        let content = docs.get(uri).map(|d| d.content.as_str()).unwrap_or("");

        // Usar CompletionProvider REAL (25 keywords + 18 tipos + 19 partes + 4 snippets)
        let completions = self.completion_provider.provide_completions(position, content);

        Ok(Some(CompletionResponse::Array(completions)))
    }

    async fn hover(&self, params: HoverParams) -> Result<Option<Hover>> {
        let uri = &params.text_document_position_params.text_document.uri;
        let position = params.text_document_position_params.position;

        let docs = self.documents.read().await;
        if let Some(doc) = docs.get(uri) {
            // Usar HoverProvider REAL (16+ partes con documentación detallada)
            return Ok(self.hover_provider.get_hover(&doc.content, position));
        }

        Ok(None)
    }
}
