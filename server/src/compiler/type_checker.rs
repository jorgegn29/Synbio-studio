#![allow(dead_code)]
//! Type Checker & Inference Engine for BioScript
//!
//! This module implements full type checking and inference for the biological
//! type system. It bridges the gap between the AST's basic type annotations
//! and the rich BioType system.
//!
//! Features:
//! 1. **Type inference from names**: `pLac` → `Promoter<Inducible, IPTG>`
//! 2. **Type inference from context**: DNA sequence literals → `DNA<5'→3'>`
//! 3. **Unit checking**: prevents mixing incompatible measurements
//! 4. **Host-aware checking**: verifies part compatibility with target organism
//! 5. **Connection type checking**: enforces Promoter → RBS → CDS → Terminator order
//! 6. **Sequence operation checking**: complement, transcribe, translate type safety
//! 7. **Biosecurity checking**: blocks select agents at compile time
//! 8. **Interaction coherence**: verifies circuit logic is consistent

use std::collections::HashMap;
use crate::compiler::ast::{
    Program, Item, Statement, LoopStatement, Expr, Literal, BioPart,
    GeneticConnection, GeneticPart, ConnectionType,
    CircuitDecl, GeneDecl, FunctionDecl, ChassisDecl,
    TypeAnnotation, FunctionCall, BinaryOp, UnaryOp, Unit, Span,
};
use crate::compiler::bio_types::*;
use crate::compiler::unit_system::{UnitChecker, UnitCheckResult, check_arithmetic};
use crate::compiler::select_agents::SelectAgentChecker;

// ═══════════════════════════════════════════════════════════════════════════════
//  HELPER: Extract span from Expr
// ═══════════════════════════════════════════════════════════════════════════════

/// Extract a span from an expression. Some variants (Literal, Array, BioPart)
/// don't carry spans, so we return a default 0..0.
fn expr_span(expr: &Expr) -> Span {
    match expr {
        Expr::Identifier(id) => id.span.clone(),
        Expr::DNASequence(s) => s.span.clone(),
        Expr::AminoSequence(s) => s.span.clone(),
        Expr::ValueWithUnit(v) => v.span.clone(),
        Expr::Binary(b) => b.span.clone(),
        Expr::Unary(u) => u.span.clone(),
        Expr::Call(c) => c.span.clone(),
        Expr::FieldAccess(f) => f.span.clone(),
        Expr::IndexAccess(i) => i.span.clone(),
        Expr::StructInit(s) => s.span.clone(),
        Expr::Block(b) => b.span.clone(),
        Expr::Literal(_) | Expr::Array(_) | Expr::BioPart(_) => 0..0,
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
//  TYPE CHECK ERRORS AND DIAGNOSTICS
// ═══════════════════════════════════════════════════════════════════════════════

/// A type checking diagnostic with rich information.
#[derive(Debug, Clone)]
pub struct TypeDiagnostic {
    pub message: String,
    pub span: Span,
    pub severity: TypeSeverity,
    pub code: TypeErrorCode,
    pub related_info: Vec<RelatedInfo>,
    pub fix_suggestion: Option<String>,
}

#[derive(Debug, Clone)]
pub struct RelatedInfo {
    pub message: String,
    pub span: Span,
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub enum TypeSeverity {
    Error,
    Warning,
    Info,
    Hint,
}

/// Specific error codes for type diagnostics.
#[derive(Debug, Clone, Copy, PartialEq)]
pub enum TypeErrorCode {
    // Type mismatch errors (T0xx)
    TypeMismatch,                  // T001
    IncompatibleUnits,            // T002
    InvalidConnection,            // T003
    InvalidSequenceOp,            // T004
    
    // Biological constraint errors (T1xx)
    HostIncompatible,             // T101
    MissingKillSwitch,            // T102
    ToxicWithoutContainment,     // T103
    IncompatibleOrigins,          // T104

    // Biosecurity errors (T2xx)
    SelectAgentDetected,          // T201
    VirulenceFactorDetected,     // T202
    DualUseWarning,              // T203

    // Inference info (T3xx)
    TypeInferred,                 // T301
    AmbiguousType,               // T302

    // Unit errors (T4xx)
    UnitMismatch,                 // T401
    DimensionIncompatible,       // T402
    MissingUnit,                  // T403

    // Connection errors (T5xx)
    InvalidPartOrder,             // T501
    MissingTerminator,           // T502
    MissingPromoter,             // T503
}

impl TypeErrorCode {
    pub fn code_str(&self) -> &'static str {
        match self {
            Self::TypeMismatch => "T001",
            Self::IncompatibleUnits => "T002",
            Self::InvalidConnection => "T003",
            Self::InvalidSequenceOp => "T004",
            Self::HostIncompatible => "T101",
            Self::MissingKillSwitch => "T102",
            Self::ToxicWithoutContainment => "T103",
            Self::IncompatibleOrigins => "T104",
            Self::SelectAgentDetected => "T201",
            Self::VirulenceFactorDetected => "T202",
            Self::DualUseWarning => "T203",
            Self::TypeInferred => "T301",
            Self::AmbiguousType => "T302",
            Self::UnitMismatch => "T401",
            Self::DimensionIncompatible => "T402",
            Self::MissingUnit => "T403",
            Self::InvalidPartOrder => "T501",
            Self::MissingTerminator => "T502",
            Self::MissingPromoter => "T503",
        }
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
//  BIOLOGICAL TYPE CHECKER
// ═══════════════════════════════════════════════════════════════════════════════

/// The main type checker. Runs after parsing and performs rich biological
/// type checking with inference, unit analysis, and biosecurity.
pub struct BioTypeChecker {
    /// Type environment with scoped bindings
    env: TypeEnvironment,
    /// Biosecurity checker
    security: SelectAgentChecker,
    /// Accumulated diagnostics
    diagnostics: Vec<TypeDiagnostic>,
    /// DNA sequences found (for security scanning)
    collected_sequences: Vec<String>,
    /// Type inference results cache: name → inferred type
    inferred_types: HashMap<String, BioType>,
    /// Interaction graph for circuit coherence
    interactions: Vec<InteractionType>,
    /// Struct definitions
    struct_defs: HashMap<String, Vec<(String, BioType)>>,
}

/// Full result of type checking.
#[derive(Debug, Clone)]
pub struct TypeCheckResult {
    pub diagnostics: Vec<TypeDiagnostic>,
    pub inferred_types: HashMap<String, String>,
    pub host: Option<String>,
    pub biosecurity_passed: bool,
    pub interactions: Vec<String>,
    pub type_summary: TypeSummary,
}

/// Summary of types found in the program.
#[derive(Debug, Clone)]
pub struct TypeSummary {
    pub promoters: usize,
    pub rbs_count: usize,
    pub cds_count: usize,
    pub terminators: usize,
    pub reporters: usize,
    pub regulators: usize,
    pub measurements_with_units: usize,
    pub sequence_operations: usize,
    pub host_checks: usize,
    pub security_checks: usize,
}

impl BioTypeChecker {
    pub fn new() -> Self {
        BioTypeChecker {
            env: TypeEnvironment::new(),
            security: SelectAgentChecker::new(),
            diagnostics: Vec::new(),
            collected_sequences: Vec::new(),
            inferred_types: HashMap::new(),
            interactions: Vec::new(),
            struct_defs: HashMap::new(),
        }
    }

    /// Run the full type checker on a program.
    pub fn check_program(&mut self, program: &Program) -> TypeCheckResult {
        // First pass: collect struct definitions and chassis host
        for item in &program.items {
            match item {
                Item::Struct(sd) => {
                    let fields: Vec<(String, BioType)> = sd.fields.iter()
                        .map(|f| (f.name.name.clone(), self.resolve_type(&f.field_type)))
                        .collect();
                    self.struct_defs.insert(sd.name.name.clone(), fields);
                }
                Item::Chassis(cd) => {
                    // Extract host organism
                    if let Some(host) = self.infer_host_from_chassis(cd) {
                        self.env.set_host(host);
                    }
                }
                _ => {}
            }
        }

        // Second pass: type check all items
        for item in &program.items {
            self.check_item(item);
        }

        // Run biosecurity check
        let host = self.env.current_host().cloned();
        let biosecurity_report = self.security.full_check(
            host.as_ref(),
            &self.collected_sequences,
            "", // Source text checked separately
        );

        // Convert biosecurity violations to diagnostics
        for violation in &biosecurity_report.violations {
            self.diagnostics.push(TypeDiagnostic {
                message: violation.message.clone(),
                span: 0..0,
                severity: if violation.blocked { TypeSeverity::Error } else { TypeSeverity::Warning },
                code: TypeErrorCode::SelectAgentDetected,
                related_info: vec![],
                fix_suggestion: Some(format!("Regulación: {}", violation.regulation)),
            });
        }

        for warning in &biosecurity_report.warnings {
            self.diagnostics.push(TypeDiagnostic {
                message: warning.message.clone(),
                span: 0..0,
                severity: TypeSeverity::Warning,
                code: TypeErrorCode::DualUseWarning,
                related_info: vec![],
                fix_suggestion: Some(warning.recommendation.clone()),
            });
        }

        // Build type summary
        let summary = self.build_summary();

        // Build result
        TypeCheckResult {
            diagnostics: self.diagnostics.clone(),
            inferred_types: self.inferred_types.iter()
                .map(|(k, v)| (k.clone(), v.display_name()))
                .collect(),
            host: host.map(|h| h.display_name().to_string()),
            biosecurity_passed: biosecurity_report.passed,
            interactions: self.interactions.iter()
                .map(|i| i.display_name())
                .collect(),
            type_summary: summary,
        }
    }

    // ─── Top-level item checking ──────────────────────────────────────

    fn check_item(&mut self, item: &Item) {
        match item {
            Item::Circuit(cd) => self.check_circuit(cd),
            Item::Gene(gd) => self.check_gene(gd),
            Item::Function(fd) => self.check_function(fd),
            Item::Chassis(cd) => self.check_chassis(cd),
            Item::Struct(_) => {} // Already processed in first pass
            Item::Import(_) => {}
            Item::Const(cd) => {
                let t = self.check_expr(&cd.value);
                self.env.bind(cd.name.name.clone(), t.clone());
                self.inferred_types.insert(cd.name.name.clone(), t);
            }
        }
    }

    fn check_circuit(&mut self, circuit: &CircuitDecl) {
        self.env.enter_scope();

        // Register circuit name
        let circuit_type = BioType::Circuit {
            host: self.env.current_host().cloned(),
            genes: vec![],
            interactions: vec![],
        };
        self.env.bind(circuit.name.name.clone(), circuit_type);

        // Track toxic parts and kill switch status
        let mut has_toxic = false;
        let has_kill_switch = circuit.body.kill_switch.is_some();

        // Check all statements in the circuit body
        for stmt in &circuit.body.statements {
            self.check_statement(stmt);

            // Check for toxic CDS usage
            if let Statement::Expression(expr) = stmt {
                if let Some(bio_type) = self.try_infer_from_expr(expr) {
                    if let BioType::Part(PartType::CDS(ref cds)) = bio_type {
                        if matches!(cds.toxicity, ToxicityLevel::High | ToxicityLevel::Lethal) {
                            has_toxic = true;
                        }
                    }
                }
            }
        }

        // Check genetic connections in circuit body
        for conn in &circuit.body.connections {
            self.check_connection(conn);
        }

        // Warn if toxic parts without containment in a safe circuit
        if has_toxic && !has_kill_switch && circuit.is_safe {
            self.diagnostics.push(TypeDiagnostic {
                message: format!(
                    "Circuito '{}' es 'safe' y contiene partes tóxicas sin kill switch. \
                     Esto es una violación de bioseguridad.",
                    circuit.name.name
                ),
                span: circuit.name.span.clone(),
                severity: TypeSeverity::Warning,
                code: TypeErrorCode::ToxicWithoutContainment,
                related_info: vec![],
                fix_suggestion: Some(
                    "Implementar un kill switch con toxina/antitoxina o remover la marca 'safe'".into()
                ),
            });
        }

        self.env.exit_scope();
    }

    fn check_gene(&mut self, gene: &GeneDecl) {
        self.env.enter_scope();

        // Register gene in type environment
        let gene_type = BioType::Gene {
            host: self.env.current_host().cloned(),
            parts: vec![],
        };
        self.env.bind(gene.name.name.clone(), gene_type.clone());
        self.inferred_types.insert(gene.name.name.clone(), gene_type);

        for prop in &gene.properties {
            self.check_expr(&prop.value);
        }

        self.env.exit_scope();
    }

    fn check_function(&mut self, func: &FunctionDecl) {
        self.env.enter_scope();

        // Register parameters with their types
        for param in &func.params {
            let param_type = self.resolve_type(&param.param_type);
            self.env.bind(param.name.name.clone(), param_type);
        }

        // Register return type
        let return_type = if let Some(ref ret) = func.return_type {
            self.resolve_type(ret)
        } else {
            BioType::Void
        };

        self.env.bind(func.name.name.clone(), return_type);

        for stmt in &func.body.statements {
            self.check_statement(stmt);
        }

        self.env.exit_scope();
    }

    fn check_chassis(&mut self, chassis: &ChassisDecl) {
        for prop in &chassis.properties {
            let val_type = self.check_expr(&prop.value);

            // Check specific chassis properties
            if prop.name.name == "host" || prop.name.name == "organism" {
                if let BioType::Str = val_type {
                    // Try to resolve host from string value
                    if let Expr::Literal(Literal::String(ref s)) = prop.value {
                        if let Some(org) = self.parse_organism(s) {
                            // Check biosecurity
                            if let Some(violation) = self.security.check_host(&org) {
                                self.diagnostics.push(TypeDiagnostic {
                                    message: violation.message,
                                    span: prop.span.clone(),
                                    severity: if violation.blocked { TypeSeverity::Error } else { TypeSeverity::Warning },
                                    code: TypeErrorCode::SelectAgentDetected,
                                    related_info: vec![],
                                    fix_suggestion: Some(format!("Regulación: {}", violation.regulation)),
                                });
                            }
                            self.env.set_host(org);
                        }
                    }
                }
            }
        }
    }

    // ─── Statement checking ───────────────────────────────────────────

    fn check_statement(&mut self, stmt: &Statement) {
        match stmt {
            Statement::Let(ls) => {
                let init_type = self.check_expr(&ls.value);

                // If there's a type annotation, verify it
                if let Some(ref ann) = ls.var_type {
                    let declared_type = self.resolve_type(ann);
                    if !init_type.is_assignable_to(&declared_type) {
                        self.diagnostics.push(TypeDiagnostic {
                            message: format!(
                                "Tipo incompatible: variable '{}' declarada como {} pero inicializada con {}",
                                ls.name.name, declared_type.display_name(), init_type.display_name()
                            ),
                            span: ls.name.span.clone(),
                            severity: TypeSeverity::Error,
                            code: TypeErrorCode::TypeMismatch,
                            related_info: vec![],
                            fix_suggestion: Some(format!("Cambiar tipo a: {}", init_type.display_name())),
                        });
                    }
                    self.env.bind(ls.name.name.clone(), declared_type.clone());
                    self.inferred_types.insert(ls.name.name.clone(), declared_type);
                } else {
                    self.env.bind(ls.name.name.clone(), init_type.clone());
                    self.inferred_types.insert(ls.name.name.clone(), init_type);
                }
            }
            Statement::Expression(expr) => {
                self.check_expr(expr);
            }
            Statement::Connection(conn) => {
                self.check_connection(conn);
            }
            Statement::If(is) => {
                let cond_type = self.check_expr(&is.condition);
                if !matches!(cond_type, BioType::Bool | BioType::Unknown | BioType::Error) {
                    self.diagnostics.push(TypeDiagnostic {
                        message: format!(
                            "Condición debe ser Bool, encontrado: {}", cond_type.display_name()
                        ),
                        span: is.span.clone(),
                        severity: TypeSeverity::Error,
                        code: TypeErrorCode::TypeMismatch,
                        related_info: vec![],
                        fix_suggestion: None,
                    });
                }
                self.env.enter_scope();
                for s in &is.then_branch.statements {
                    self.check_statement(s);
                }
                self.env.exit_scope();
                if let Some(ref else_b) = is.else_branch {
                    self.env.enter_scope();
                    for s in &else_b.statements {
                        self.check_statement(s);
                    }
                    self.env.exit_scope();
                }
            }
            Statement::When(ws) => {
                let cond_type = self.check_expr(&ws.condition);
                if !matches!(cond_type, BioType::Bool | BioType::Unknown | BioType::Error) {
                    self.diagnostics.push(TypeDiagnostic {
                        message: format!(
                            "Condición de 'when' debe ser Bool, encontrado: {}", cond_type.display_name()
                        ),
                        span: ws.span.clone(),
                        severity: TypeSeverity::Error,
                        code: TypeErrorCode::TypeMismatch,
                        related_info: vec![],
                        fix_suggestion: None,
                    });
                }
                self.env.enter_scope();
                for s in &ws.body.statements {
                    self.check_statement(s);
                }
                self.env.exit_scope();
            }
            Statement::Return(expr_opt) => {
                if let Some(expr) = expr_opt {
                    self.check_expr(expr);
                }
            }
            Statement::Loop(ls) => {
                match ls {
                    LoopStatement::For { var, iterable, body, .. } => {
                        self.check_expr(iterable);
                        self.env.enter_scope();
                        self.env.bind(var.name.clone(), BioType::Unknown);
                        for s in &body.statements {
                            self.check_statement(s);
                        }
                        self.env.exit_scope();
                    }
                    LoopStatement::While { condition, body, .. } => {
                        self.check_expr(condition);
                        self.env.enter_scope();
                        for s in &body.statements {
                            self.check_statement(s);
                        }
                        self.env.exit_scope();
                    }
                    LoopStatement::Loop { body, .. } => {
                        self.env.enter_scope();
                        for s in &body.statements {
                            self.check_statement(s);
                        }
                        self.env.exit_scope();
                    }
                }
            }
            Statement::Match(ms) => {
                self.check_expr(&ms.expr);
                for arm in &ms.arms {
                    self.check_expr(&arm.body);
                }
            }
        }
    }

    // ─── Connection checking ──────────────────────────────────────────

    fn check_connection(&mut self, conn: &GeneticConnection) {
        if conn.parts.is_empty() {
            return;
        }

        // Resolve types of all parts in the connection
        let part_types: Vec<(BioType, Span)> = conn.parts.iter().map(|p| {
            match p {
                GeneticPart::Identifier(id) => {
                    let t = if let Some(resolved) = self.env.resolve(&id.name) {
                        resolved.clone()
                    } else {
                        let inferred = self.infer_type_from_name(&id.name);
                        if inferred != BioType::Unknown {
                            self.env.bind(id.name.clone(), inferred.clone());
                            self.inferred_types.insert(id.name.clone(), inferred.clone());
                        }
                        inferred
                    };
                    (t, id.span.clone())
                }
                GeneticPart::FunctionCall(fc) => {
                    let t = self.check_call(fc);
                    (t, fc.span.clone())
                }
                GeneticPart::Literal(bp) => {
                    let t = self.biopart_to_rich_type(bp);
                    (t, conn.span.clone())
                }
            }
        }).collect();

        match conn.connection_type {
            ConnectionType::Transcription => {
                // Validate adjacent part connections
                for window in part_types.windows(2) {
                    let (ref from_type, ref from_span) = window[0];
                    let (ref to_type, ref _to_span) = window[1];

                    if let Err(msg) = from_type.can_connect_to(to_type) {
                        self.diagnostics.push(TypeDiagnostic {
                            message: msg,
                            span: conn.span.clone(),
                            severity: TypeSeverity::Error,
                            code: TypeErrorCode::InvalidConnection,
                            related_info: vec![
                                RelatedInfo {
                                    message: format!("Tipo izquierdo: {}", from_type.display_name()),
                                    span: from_span.clone(),
                                },
                            ],
                            fix_suggestion: None,
                        });
                    }
                }

                // Check host compatibility for all parts
                if let Some(host) = self.env.current_host() {
                    for (part_type, part_span) in &part_types {
                        let warnings = part_type.check_host_compatibility(host);
                        for w in &warnings {
                            self.diagnostics.push(TypeDiagnostic {
                                message: w.clone(),
                                span: part_span.clone(),
                                severity: TypeSeverity::Warning,
                                code: TypeErrorCode::HostIncompatible,
                                related_info: vec![],
                                fix_suggestion: None,
                            });
                        }
                    }
                }
            }
            ConnectionType::Regulation => {
                // Regulatory link: Regulator ~> Promoter (repression/activation)
                if part_types.len() >= 2 {
                    let (ref from_type, _) = part_types[0];
                    let (ref to_type, _) = part_types[part_types.len() - 1];
                    self.infer_interaction(from_type, to_type, &conn.span);
                }
            }
            ConnectionType::Transform => {
                // Data flow transformation — less strict
            }
        }
    }

    // ─── Expression type checking ─────────────────────────────────────

    fn check_expr(&mut self, expr: &Expr) -> BioType {
        match expr {
            Expr::Literal(lit) => match lit {
                Literal::Integer(_) => BioType::Int,
                Literal::Float(_) => BioType::Float,
                Literal::String(_) => BioType::Str,
                Literal::Bool(_) => BioType::Bool,
            },

            Expr::Identifier(id) => {
                // Try type environment first
                if let Some(t) = self.env.resolve(&id.name) {
                    let t = t.clone();
                    return t;
                }

                // Try inference from name
                let inferred = self.infer_type_from_name(&id.name);
                if inferred != BioType::Unknown {
                    // Record the inference
                    self.inferred_types.insert(id.name.clone(), inferred.clone());
                    self.diagnostics.push(TypeDiagnostic {
                        message: format!(
                            "Tipo inferido para '{}': {}",
                            id.name, inferred.display_name()
                        ),
                        span: id.span.clone(),
                        severity: TypeSeverity::Info,
                        code: TypeErrorCode::TypeInferred,
                        related_info: vec![],
                        fix_suggestion: None,
                    });
                    self.env.bind(id.name.clone(), inferred.clone());
                    return inferred;
                }

                BioType::Unknown
            }

            Expr::BioPart(bp) => self.biopart_to_rich_type(bp),

            Expr::DNASequence(seq) => {
                // Collect for security scanning
                self.collected_sequences.push(seq.sequence.clone());

                // Validate sequence
                if let Err(e) = seq.validate() {
                    self.diagnostics.push(TypeDiagnostic {
                        message: e,
                        span: seq.span.clone(),
                        severity: TypeSeverity::Error,
                        code: TypeErrorCode::TypeMismatch,
                        related_info: vec![],
                        fix_suggestion: None,
                    });
                }

                // GC content check with host-aware bounds
                let gc = seq.gc_content();
                if let Some(host) = self.env.current_host() {
                    let (min_gc, max_gc) = host.gc_range();
                    if gc < min_gc || gc > max_gc {
                        self.diagnostics.push(TypeDiagnostic {
                            message: format!(
                                "GC content ({:.1}%) fuera del rango óptimo para {} ({:.0}%-{:.0}%)",
                                gc * 100.0, host.display_name(), min_gc * 100.0, max_gc * 100.0
                            ),
                            span: seq.span.clone(),
                            severity: TypeSeverity::Warning,
                            code: TypeErrorCode::HostIncompatible,
                            related_info: vec![],
                            fix_suggestion: Some(format!(
                                "Optimizar codones para {} para ajustar GC content", host.display_name()
                            )),
                        });
                    }
                }

                BioType::Sequence(SequenceType::DNA(Directionality::FivePrimeToThreePrime))
            }

            Expr::AminoSequence(_) => BioType::Sequence(SequenceType::AminoAcid),

            Expr::ValueWithUnit(vwu) => {
                let measurement = self.unit_to_measurement(&vwu.unit);
                BioType::Measurement(measurement)
            }

            Expr::Binary(bin) => {
                let left = self.check_expr(&bin.left);
                let right = self.check_expr(&bin.right);

                match &bin.operator {
                    BinaryOp::GeneticFlow | BinaryOp::Regulation | BinaryOp::Transform => {
                        // Check connection validity
                        if let Err(msg) = left.can_connect_to(&right) {
                            self.diagnostics.push(TypeDiagnostic {
                                message: msg,
                                span: bin.span.clone(),
                                severity: TypeSeverity::Error,
                                code: TypeErrorCode::InvalidConnection,
                                related_info: vec![],
                                fix_suggestion: None,
                            });
                        }
                        BioType::Void
                    }
                    BinaryOp::And | BinaryOp::Or => BioType::Bool,
                    BinaryOp::Eq | BinaryOp::NotEq | BinaryOp::Lt | BinaryOp::LtEq |
                    BinaryOp::Gt | BinaryOp::GtEq => {
                        // For measurements, check dimension compatibility in comparisons
                        if let (BioType::Measurement(ref lm), BioType::Measurement(ref rm)) = (&left, &right) {
                            match UnitChecker::check_comparison(lm, rm) {
                                UnitCheckResult::Same | UnitCheckResult::Compatible { .. } => {}
                                UnitCheckResult::Incompatible { message, .. } => {
                                    self.diagnostics.push(TypeDiagnostic {
                                        message,
                                        span: bin.span.clone(),
                                        severity: TypeSeverity::Error,
                                        code: TypeErrorCode::DimensionIncompatible,
                                        related_info: vec![],
                                        fix_suggestion: None,
                                    });
                                }
                            }
                        }
                        BioType::Bool
                    }
                    op => {
                        // Arithmetic operators — perform dimensional analysis
                        let op_str = match op {
                            BinaryOp::Add => "+",
                            BinaryOp::Sub => "-",
                            BinaryOp::Mul => "*",
                            BinaryOp::Div => "/",
                            BinaryOp::Mod => "%",
                            _ => "?",
                        };

                        let result = check_arithmetic(&left, &right, op_str);

                        for err in &result.errors {
                            self.diagnostics.push(TypeDiagnostic {
                                message: err.clone(),
                                span: bin.span.clone(),
                                severity: TypeSeverity::Error,
                                code: TypeErrorCode::IncompatibleUnits,
                                related_info: vec![],
                                fix_suggestion: None,
                            });
                        }

                        for warn in &result.warnings {
                            self.diagnostics.push(TypeDiagnostic {
                                message: warn.clone(),
                                span: bin.span.clone(),
                                severity: TypeSeverity::Info,
                                code: TypeErrorCode::UnitMismatch,
                                related_info: vec![],
                                fix_suggestion: None,
                            });
                        }

                        result.result_type
                    }
                }
            }

            Expr::Unary(un) => {
                let operand = self.check_expr(&un.operand);
                match un.operator {
                    UnaryOp::Not => BioType::Bool,
                    UnaryOp::Neg => operand,
                }
            }

            Expr::Call(fc) => self.check_call(fc),

            Expr::FieldAccess(fa) => {
                let obj_type = self.check_expr(&fa.object);
                self.check_field_access(&obj_type, &fa.field.name, &fa.field.span)
            }

            Expr::IndexAccess(ia) => {
                let obj_type = self.check_expr(&ia.object);
                self.check_expr(&ia.index);
                match obj_type {
                    BioType::Array(inner) => *inner,
                    BioType::Sequence(SequenceType::DNA(_)) => BioType::Str, // Single nucleotide
                    BioType::Sequence(SequenceType::RNA(_)) => BioType::Str,
                    BioType::Sequence(SequenceType::AminoAcid) => BioType::Str, // Single AA
                    _ => BioType::Unknown,
                }
            }

            Expr::Array(items) => {
                let mut elem_type = BioType::Unknown;
                for item in items {
                    let t = self.check_expr(item);
                    if elem_type == BioType::Unknown {
                        elem_type = t;
                    }
                }
                BioType::Array(Box::new(elem_type))
            }

            Expr::StructInit(si) => {
                for field in &si.fields {
                    self.check_expr(&field.value);
                }
                BioType::Struct(si.struct_name.name.clone())
            }

            Expr::Block(block) => {
                self.env.enter_scope();
                let mut last = BioType::Void;
                for s in &block.statements {
                    self.check_statement(s);
                    if let Statement::Expression(e) = s {
                        last = self.check_expr(e);
                    }
                }
                self.env.exit_scope();
                last
            }
        }
    }

    // ─── Function call checking ───────────────────────────────────────

    fn check_call(&mut self, call: &FunctionCall) -> BioType {
        // Check all arguments
        let arg_types: Vec<BioType> = call.arguments.iter()
            .map(|arg| self.check_expr(arg))
            .collect();

        if let Expr::Identifier(ref id) = *call.function {
            match id.name.as_str() {
                // Sequence operations with type checking
                "complement" => {
                    if let Some(arg_type) = arg_types.first() {
                        if let BioType::Sequence(ref seq) = arg_type {
                            return match seq.can_complement() {
                                Ok(result) => BioType::Sequence(result),
                                Err(msg) => {
                                    self.diagnostics.push(TypeDiagnostic {
                                        message: msg,
                                        span: call.span.clone(),
                                        severity: TypeSeverity::Error,
                                        code: TypeErrorCode::InvalidSequenceOp,
                                        related_info: vec![],
                                        fix_suggestion: None,
                                    });
                                    BioType::Error
                                }
                            };
                        }
                    }
                    BioType::Unknown
                }
                "transcribe" => {
                    if let Some(arg_type) = arg_types.first() {
                        if let BioType::Sequence(ref seq) = arg_type {
                            return match seq.can_transcribe() {
                                Ok(result) => BioType::Sequence(result),
                                Err(msg) => {
                                    self.diagnostics.push(TypeDiagnostic {
                                        message: msg,
                                        span: call.span.clone(),
                                        severity: TypeSeverity::Error,
                                        code: TypeErrorCode::InvalidSequenceOp,
                                        related_info: vec![RelatedInfo {
                                            message: format!("Tipo del argumento: {}", arg_type.display_name()),
                                            span: call.span.clone(),
                                        }],
                                        fix_suggestion: Some(
                                            "transcribe() solo acepta DNA. Si tienes RNA, ya es transcrito.".into()
                                        ),
                                    });
                                    BioType::Error
                                }
                            };
                        }
                    }
                    BioType::Sequence(SequenceType::RNA(RNAKind::MRNA))
                }
                "translate" => {
                    if let Some(arg_type) = arg_types.first() {
                        if let BioType::Sequence(ref seq) = arg_type {
                            return match seq.can_translate() {
                                Ok(result) => BioType::Sequence(result),
                                Err(msg) => {
                                    self.diagnostics.push(TypeDiagnostic {
                                        message: msg,
                                        span: call.span.clone(),
                                        severity: TypeSeverity::Error,
                                        code: TypeErrorCode::InvalidSequenceOp,
                                        related_info: vec![],
                                        fix_suggestion: Some(
                                            "translate() solo acepta mRNA. Primero transcribe: translate(transcribe(dna))".into()
                                        ),
                                    });
                                    BioType::Error
                                }
                            };
                        }
                    }
                    BioType::Sequence(SequenceType::AminoAcid)
                }
                "reverse_complement" => {
                    if let Some(arg_type) = arg_types.first() {
                        if let BioType::Sequence(ref seq) = arg_type {
                            return match seq.can_complement() {
                                Ok(result) => BioType::Sequence(result),
                                Err(msg) => {
                                    self.diagnostics.push(TypeDiagnostic {
                                        message: msg,
                                        span: call.span.clone(),
                                        severity: TypeSeverity::Error,
                                        code: TypeErrorCode::InvalidSequenceOp,
                                        related_info: vec![],
                                        fix_suggestion: None,
                                    });
                                    BioType::Error
                                }
                            };
                        }
                    }
                    BioType::Unknown
                }

                // Biology functions
                "express" => BioType::Part(PartType::CDS(CDSType {
                    protein_function: ProteinFunction::Unknown,
                    codon_optimized_for: self.env.current_host().cloned(),
                    molecular_weight_kda: None,
                    toxicity: ToxicityLevel::None,
                    localization: CellularLocalization::Cytoplasmic,
                })),
                "repress" | "inhibit" => BioType::Void,
                "activate" => BioType::Void,
                "sense" | "bind" => BioType::Bool,
                "secrete" => BioType::Void,
                "optimize_codons" => BioType::Sequence(SequenceType::DNA(Directionality::FivePrimeToThreePrime)),

                // Measurement functions
                "measure_od" | "measure_OD600" => BioType::Measurement(MeasurementType::OD600),
                "measure_fluorescence" => BioType::Measurement(MeasurementType::RFU),
                "measure_luminescence" => BioType::Measurement(MeasurementType::ArbitraryUnits),

                _ => {
                    // Check if it's in the type environment
                    if let Some(t) = self.env.resolve(&id.name) {
                        t.clone()
                    } else {
                        BioType::Unknown
                    }
                }
            }
        } else {
            BioType::Unknown
        }
    }

    // ─── Field access type checking ───────────────────────────────────

    fn check_field_access(&self, obj_type: &BioType, field: &str, _span: &Span) -> BioType {
        match obj_type {
            BioType::Part(PartType::Promoter(_)) => match field {
                "strength" => BioType::Float,
                "regulation" => BioType::Str,
                "inducers" => BioType::Array(Box::new(BioType::Str)),
                _ => BioType::Unknown,
            },
            BioType::Part(PartType::RBS(_)) => match field {
                "translation_rate" => BioType::Float,
                "spacing" => BioType::Int,
                _ => BioType::Unknown,
            },
            BioType::Part(PartType::CDS(ref cds)) => match field {
                "molecular_weight" => BioType::Measurement(MeasurementType::KiloDaltons),
                "toxicity" => BioType::Str,
                "function" => BioType::Str,
                "codon_optimized_for" => BioType::Host(cds.codon_optimized_for.clone().unwrap_or(Organism::Unknown)),
                _ => BioType::Unknown,
            },
            BioType::Part(PartType::Reporter(_)) => match field {
                "excitation" => BioType::Measurement(MeasurementType::BasePairs),
                "emission" => BioType::Measurement(MeasurementType::BasePairs),
                "class" => BioType::Str,
                _ => BioType::Unknown,
            },
            BioType::Sequence(SequenceType::DNA(_)) => match field {
                "length" => BioType::Measurement(MeasurementType::BasePairs),
                "gc_content" => BioType::Measurement(MeasurementType::Percent),
                "complement" => BioType::Sequence(SequenceType::DNA(Directionality::ThreePrimeToFivePrime)),
                "reverse" => BioType::Sequence(SequenceType::DNA(Directionality::ThreePrimeToFivePrime)),
                _ => BioType::Unknown,
            },
            BioType::Host(ref _org) => match field {
                "growth_rate" => BioType::Measurement(MeasurementType::DoublingsPerHour),
                "gc_range" => BioType::Array(Box::new(BioType::Float)),
                "bsl_level" => BioType::Int,
                "name" => BioType::Str,
                _ => BioType::Unknown,
            },
            BioType::Struct(ref name) => {
                if let Some(fields) = self.struct_defs.get(name) {
                    fields.iter()
                        .find(|(f, _)| f == field)
                        .map(|(_, t)| t.clone())
                        .unwrap_or(BioType::Unknown)
                } else {
                    BioType::Unknown
                }
            }
            _ => BioType::Unknown,
        }
    }

    // ─── Type inference from names ────────────────────────────────────

    fn infer_type_from_name(&self, name: &str) -> BioType {
        // Check known parts database first
        if let Some(t) = self.env.known_parts().lookup(name) {
            return t.clone();
        }

        // Inference by naming conventions
        let lower = name.to_lowercase();

        // Promoter patterns
        if name.starts_with('p') && name.len() > 1 && name.chars().nth(1).map_or(false, |c| c.is_uppercase()) {
            return BioType::Part(PartType::Promoter(PromoterType {
                strength: PromoterStrength::Unknown,
                regulation: RegulationKind::Unknown,
                inducers: vec![],
                host_range: vec![],
                directionality: Directionality::FivePrimeToThreePrime,
            }));
        }

        // RBS patterns
        if lower.starts_with("rbs") || lower.starts_with("b00") {
            return BioType::Part(PartType::RBS(RBSType {
                translation_rate: TranslationRate::Unknown,
                spacing: None,
                host_compatibility: vec![],
            }));
        }

        // Terminator patterns
        if lower.starts_with("term") || lower.starts_with("t7term") || name == "B0015" {
            return BioType::Part(PartType::Terminator(TerminatorType {
                efficiency: TerminatorEfficiency::Unknown,
                terminator_class: TerminatorClass::Unknown,
            }));
        }

        // Reporter patterns
        if matches!(lower.as_str(), "gfp" | "rfp" | "bfp" | "yfp" | "cfp" | "mcherry" | "mvenus" | "mturquoise") {
            return BioType::Part(PartType::Reporter(ReporterType {
                reporter_class: ReporterClass::Fluorescent,
                excitation_nm: None,
                emission_nm: None,
            }));
        }

        // Origin patterns
        if lower.contains("origin") || matches!(lower.as_str(), "cole1" | "p15a" | "psc101" | "pbr322") {
            return BioType::Part(PartType::Origin(OriginType {
                copy_number: CopyNumber::Unknown,
                host_range: vec![],
                incompatibility_group: None,
            }));
        }

        // Resistance marker patterns
        if lower.ends_with('r') && (lower.starts_with("amp") || lower.starts_with("kan") ||
            lower.starts_with("cm") || lower.starts_with("spec") || lower.starts_with("tet") ||
            lower.starts_with("gen")) {
            return BioType::Part(PartType::SelectionMarker(SelectionMarkerType {
                marker_class: MarkerClass::AntibioticResistance,
                resistance_to: Some(name.trim_end_matches('R').to_string()),
            }));
        }

        BioType::Unknown
    }

    // ─── Helper: convert BioPart → rich BioType ──────────────────────

    fn biopart_to_rich_type(&self, bp: &BioPart) -> BioType {
        match bp {
            BioPart::PLac => self.env.known_parts().lookup("pLac").cloned()
                .unwrap_or(BioType::Part(PartType::Promoter(PromoterType {
                    strength: PromoterStrength::Medium,
                    regulation: RegulationKind::Inducible,
                    inducers: vec!["IPTG".into()], host_range: vec![], directionality: Directionality::FivePrimeToThreePrime,
                }))),
            BioPart::PTet => self.env.known_parts().lookup("pTet").cloned()
                .unwrap_or(BioType::Part(PartType::Promoter(PromoterType {
                    strength: PromoterStrength::Medium,
                    regulation: RegulationKind::Inducible,
                    inducers: vec!["aTc".into()], host_range: vec![], directionality: Directionality::FivePrimeToThreePrime,
                }))),
            BioPart::PBAD => self.env.known_parts().lookup("pBAD").cloned()
                .unwrap_or(BioType::Part(PartType::Promoter(PromoterType {
                    strength: PromoterStrength::Strong,
                    regulation: RegulationKind::Inducible,
                    inducers: vec!["arabinose".into()], host_range: vec![], directionality: Directionality::FivePrimeToThreePrime,
                }))),
            BioPart::PT7 => self.env.known_parts().lookup("pT7").cloned()
                .unwrap_or(BioType::Part(PartType::Promoter(PromoterType {
                    strength: PromoterStrength::VeryStrong,
                    regulation: RegulationKind::Inducible,
                    inducers: vec!["IPTG".into()], host_range: vec![Organism::EcoliBL21], directionality: Directionality::FivePrimeToThreePrime,
                }))),

            BioPart::GFP => self.env.known_parts().lookup("GFP").cloned()
                .unwrap_or(BioType::Part(PartType::Reporter(ReporterType { reporter_class: ReporterClass::Fluorescent, excitation_nm: Some(488), emission_nm: Some(509) }))),
            BioPart::RFP => self.env.known_parts().lookup("RFP").cloned()
                .unwrap_or(BioType::Part(PartType::Reporter(ReporterType { reporter_class: ReporterClass::Fluorescent, excitation_nm: Some(555), emission_nm: Some(584) }))),
            BioPart::BFP => self.env.known_parts().lookup("BFP").cloned()
                .unwrap_or(BioType::Part(PartType::Reporter(ReporterType { reporter_class: ReporterClass::Fluorescent, excitation_nm: Some(383), emission_nm: Some(448) }))),

            BioPart::LacI => self.env.known_parts().lookup("LacI").cloned()
                .unwrap_or(BioType::Part(PartType::Regulator(RegulatorType { regulator_class: RegulatorClass::Repressor, targets: vec!["pLac".into()] }))),
            BioPart::TetR => self.env.known_parts().lookup("TetR").cloned()
                .unwrap_or(BioType::Part(PartType::Regulator(RegulatorType { regulator_class: RegulatorClass::Repressor, targets: vec!["pTet".into()] }))),
            BioPart::CI => self.env.known_parts().lookup("CI").cloned()
                .unwrap_or(BioType::Part(PartType::Regulator(RegulatorType { regulator_class: RegulatorClass::Repressor, targets: vec!["pR".into()] }))),

            BioPart::Cas9 => self.env.known_parts().lookup("Cas9").cloned()
                .unwrap_or(BioType::Part(PartType::CDS(CDSType { protein_function: ProteinFunction::Enzyme, codon_optimized_for: None, molecular_weight_kda: Some(160.0), toxicity: ToxicityLevel::Low, localization: CellularLocalization::Cytoplasmic }))),
            BioPart::GRNA => BioType::Sequence(SequenceType::RNA(RNAKind::SgRNA)),

            BioPart::RBSStrong => BioType::Part(PartType::RBS(RBSType { translation_rate: TranslationRate::Strong, spacing: Some(7), host_compatibility: vec![] })),
            BioPart::RBSMedium => BioType::Part(PartType::RBS(RBSType { translation_rate: TranslationRate::Medium, spacing: Some(7), host_compatibility: vec![] })),
            BioPart::RBSWeak => BioType::Part(PartType::RBS(RBSType { translation_rate: TranslationRate::Weak, spacing: Some(7), host_compatibility: vec![] })),

            BioPart::TermT1 => BioType::Part(PartType::Terminator(TerminatorType { efficiency: TerminatorEfficiency::High, terminator_class: TerminatorClass::Intrinsic })),
            BioPart::TermT7 => BioType::Part(PartType::Terminator(TerminatorType { efficiency: TerminatorEfficiency::Perfect, terminator_class: TerminatorClass::Intrinsic })),

            BioPart::Custom(name) => {
                self.infer_type_from_name(name)
            }
        }
    }

    // ─── Type resolution from annotations ─────────────────────────────

    fn resolve_type(&self, ann: &TypeAnnotation) -> BioType {
        match ann {
            TypeAnnotation::Simple(id) => match id.name.as_str() {
                "i32" | "i64" | "int" | "Int" => BioType::Int,
                "f32" | "f64" | "float" | "Float" => BioType::Float,
                "bool" | "Bool" => BioType::Bool,
                "String" | "str" => BioType::Str,

                "DNA" => BioType::Sequence(SequenceType::DNA(Directionality::Unknown)),
                "RNA" => BioType::Sequence(SequenceType::RNA(RNAKind::Generic)),
                "mRNA" => BioType::Sequence(SequenceType::RNA(RNAKind::MRNA)),
                "sgRNA" => BioType::Sequence(SequenceType::RNA(RNAKind::SgRNA)),
                "AminoAcid" | "Protein" => BioType::Sequence(SequenceType::AminoAcid),

                "Promoter" => BioType::Part(PartType::Promoter(PromoterType {
                    strength: PromoterStrength::Unknown, regulation: RegulationKind::Unknown,
                    inducers: vec![], host_range: vec![], directionality: Directionality::FivePrimeToThreePrime,
                })),
                "RBS" => BioType::Part(PartType::RBS(RBSType {
                    translation_rate: TranslationRate::Unknown, spacing: None, host_compatibility: vec![],
                })),
                "CDS" => BioType::Part(PartType::CDS(CDSType {
                    protein_function: ProteinFunction::Unknown, codon_optimized_for: None, molecular_weight_kda: None, toxicity: ToxicityLevel::None, localization: CellularLocalization::Cytoplasmic,
                })),
                "Terminator" => BioType::Part(PartType::Terminator(TerminatorType {
                    efficiency: TerminatorEfficiency::Unknown, terminator_class: TerminatorClass::Unknown,
                })),
                "Operator" => BioType::Part(PartType::Operator(OperatorType {
                    binding_protein: None, operator_class: OperatorClass::Unknown,
                })),
                "Insulator" => BioType::Part(PartType::Insulator(InsulatorType {
                    insulation_strength: 0.0, mechanism: InsulationMechanism::Unknown,
                })),
                "Origin" => BioType::Part(PartType::Origin(OriginType {
                    copy_number: CopyNumber::Unknown, host_range: vec![], incompatibility_group: None,
                })),
                "SelectionMarker" => BioType::Part(PartType::SelectionMarker(SelectionMarkerType {
                    marker_class: MarkerClass::Unknown, resistance_to: None,
                })),
                "Reporter" => BioType::Part(PartType::Reporter(ReporterType {
                    reporter_class: ReporterClass::Unknown, excitation_nm: None, emission_nm: None,
                })),

                "Gene" => BioType::Gene { host: self.env.current_host().cloned(), parts: vec![] },
                "Circuit" => BioType::Circuit { host: self.env.current_host().cloned(), genes: vec![], interactions: vec![] },

                other => {
                    if self.struct_defs.contains_key(other) {
                        BioType::Struct(other.to_string())
                    } else {
                        BioType::Unknown
                    }
                }
            },
            TypeAnnotation::Biological(bt) => match bt {
                crate::compiler::ast::BioType::Promoter { .. } => BioType::Part(PartType::Promoter(PromoterType {
                    strength: PromoterStrength::Unknown, regulation: RegulationKind::Unknown,
                    inducers: vec![], host_range: vec![], directionality: Directionality::FivePrimeToThreePrime,
                })),
                crate::compiler::ast::BioType::RBS { .. } => BioType::Part(PartType::RBS(RBSType {
                    translation_rate: TranslationRate::Unknown, spacing: None, host_compatibility: vec![],
                })),
                crate::compiler::ast::BioType::Protein { .. } => BioType::Sequence(SequenceType::AminoAcid),
                crate::compiler::ast::BioType::Terminator { .. } => BioType::Part(PartType::Terminator(TerminatorType {
                    efficiency: TerminatorEfficiency::Unknown, terminator_class: TerminatorClass::Unknown,
                })),
                crate::compiler::ast::BioType::Gene => BioType::Gene { host: self.env.current_host().cloned(), parts: vec![] },
                crate::compiler::ast::BioType::Circuit => BioType::Circuit { host: self.env.current_host().cloned(), genes: vec![], interactions: vec![] },
                crate::compiler::ast::BioType::DNA => BioType::Sequence(SequenceType::DNA(Directionality::Unknown)),
                crate::compiler::ast::BioType::RNA => BioType::Sequence(SequenceType::RNA(RNAKind::Generic)),
            },
            TypeAnnotation::Generic(id, params) => {
                match id.name.as_str() {
                    "Vec" | "Array" => {
                        let inner = params.first().map(|p| self.resolve_type(p)).unwrap_or(BioType::Unknown);
                        BioType::Array(Box::new(inner))
                    }
                    "Host" => {
                        let org = params.first().and_then(|p| {
                            if let TypeAnnotation::Simple(ref id) = p {
                                self.parse_organism(&id.name)
                            } else {
                                None
                            }
                        }).unwrap_or(Organism::Unknown);
                        BioType::Host(org)
                    }
                    "DNA" => {
                        let dir = params.first().and_then(|p| {
                            if let TypeAnnotation::Simple(ref id) = p {
                                match id.name.as_str() {
                                    "5_3" | "sense" => Some(Directionality::FivePrimeToThreePrime),
                                    "3_5" | "antisense" => Some(Directionality::ThreePrimeToFivePrime),
                                    "ds" | "double" => Some(Directionality::DoubleStranded),
                                    _ => None,
                                }
                            } else {
                                None
                            }
                        }).unwrap_or(Directionality::Unknown);
                        BioType::Sequence(SequenceType::DNA(dir))
                    }
                    "RNA" => {
                        let kind = params.first().and_then(|p| {
                            if let TypeAnnotation::Simple(ref id) = p {
                                match id.name.as_str() {
                                    "mRNA" => Some(RNAKind::MRNA),
                                    "tRNA" => Some(RNAKind::TRNA),
                                    "rRNA" => Some(RNAKind::RRNA),
                                    "sgRNA" => Some(RNAKind::SgRNA),
                                    "siRNA" => Some(RNAKind::SiRNA),
                                    _ => None,
                                }
                            } else {
                                None
                            }
                        }).unwrap_or(RNAKind::Generic);
                        BioType::Sequence(SequenceType::RNA(kind))
                    }
                    "Measurement" | "Measure" => {
                        let unit = params.first().and_then(|p| {
                            if let TypeAnnotation::Simple(ref id) = p {
                                UnitChecker::parse_unit(&id.name)
                            } else {
                                None
                            }
                        }).unwrap_or(MeasurementType::ArbitraryUnits);
                        BioType::Measurement(unit)
                    }
                    _ => BioType::Unknown,
                }
            }
        }
    }

    // ─── Helper methods ───────────────────────────────────────────────

    fn unit_to_measurement(&self, unit: &Unit) -> MeasurementType {
        match unit {
            Unit::BasePairs => MeasurementType::BasePairs,
            Unit::Kilobases => MeasurementType::Kilobases,
            Unit::KiloDaltons => MeasurementType::KiloDaltons,
            Unit::Daltons => MeasurementType::Daltons,
            Unit::NanoMolar => MeasurementType::NanoMolar,
            Unit::MicroMolar => MeasurementType::MicroMolar,
            Unit::MilliMolar => MeasurementType::MilliMolar,
            Unit::Molar => MeasurementType::Molar,
            Unit::Seconds => MeasurementType::Seconds,
            Unit::Minutes => MeasurementType::Minutes,
            Unit::Hours => MeasurementType::Hours,
            Unit::ArbitraryUnits => MeasurementType::ArbitraryUnits,
            Unit::Percent => MeasurementType::Percent,
        }
    }

    fn parse_organism(&self, name: &str) -> Option<Organism> {
        match name {
            "Ecoli_K12" | "E_coli_K12" | "EcoliK12" | "ecoli" => Some(Organism::EcoliK12),
            "Ecoli_DH5a" | "DH5alpha" | "DH5α" => Some(Organism::EcoliDH5Alpha),
            "Ecoli_BL21" | "BL21" | "BL21_DE3" => Some(Organism::EcoliBL21),
            "Ecoli_MG1655" | "MG1655" => Some(Organism::EcoliMG1655),
            "Saccharomyces" | "S_cerevisiae" | "yeast" => Some(Organism::Saccharomyces),
            "Pichia" | "P_pastoris" => Some(Organism::Pichia),
            "Bacillus" | "B_subtilis" | "Bacillus_subtilis" => Some(Organism::BacillusSubtilis),
            "Pseudomonas" | "P_putida" => Some(Organism::Pseudomonas),
            "Corynebacterium" | "C_glutamicum" => Some(Organism::Corynebacterium),
            "Vibrio" | "V_natriegens" => Some(Organism::Vibrio),
            "CHO" | "CHO_cells" => Some(Organism::CHO),
            "HEK293" | "HEK293T" => Some(Organism::HEK293),
            "cell_free" | "TX_TL" | "PURExpress" => Some(Organism::CellFree),
            _ => None,
        }
    }

    fn infer_host_from_chassis(&self, chassis: &ChassisDecl) -> Option<Organism> {
        // Try from host_type name first
        if let Some(org) = self.parse_organism(&chassis.host_type.name) {
            return Some(org);
        }
        // Try from properties
        for prop in &chassis.properties {
            if prop.name.name == "organism" || prop.name.name == "host" {
                if let Expr::Literal(Literal::String(ref s)) = prop.value {
                    return self.parse_organism(s);
                }
            }
        }
        None
    }

    fn infer_interaction(&mut self, from: &BioType, to: &BioType, _span: &Span) {
        match (from, to) {
            (BioType::Part(PartType::Regulator(ref reg)), BioType::Part(PartType::Promoter(ref _prom))) => {
                let interaction = match reg.regulator_class {
                    RegulatorClass::Repressor => InteractionType::Repression {
                        repressor: "regulator".into(),
                        target_promoter: "promoter".into(),
                        strength: None,
                    },
                    RegulatorClass::Activator => InteractionType::Activation {
                        activator: "regulator".into(),
                        target_promoter: "promoter".into(),
                        strength: None,
                    },
                    _ => return,
                };
                self.interactions.push(interaction);
            }
            _ => {}
        }
    }

    fn is_kill_switch_statement(&self, stmt: &Statement) -> bool {
        if let Statement::Expression(expr) = stmt {
            if let Expr::Identifier(id) = expr {
                let lower = id.name.to_lowercase();
                return lower.contains("kill") || lower.contains("ccdb") || lower.contains("toxin");
            }
        }
        false
    }

    fn try_infer_from_expr(&self, expr: &Expr) -> Option<BioType> {
        match expr {
            Expr::Identifier(id) => {
                self.env.resolve(&id.name).cloned()
            }
            Expr::BioPart(bp) => Some(self.biopart_to_rich_type(bp)),
            _ => None,
        }
    }

    fn build_summary(&self) -> TypeSummary {
        let mut summary = TypeSummary {
            promoters: 0,
            rbs_count: 0,
            cds_count: 0,
            terminators: 0,
            reporters: 0,
            regulators: 0,
            measurements_with_units: 0,
            sequence_operations: 0,
            host_checks: 0,
            security_checks: 0,
        };

        for t in self.inferred_types.values() {
            match t {
                BioType::Part(PartType::Promoter(_)) => summary.promoters += 1,
                BioType::Part(PartType::RBS(_)) => summary.rbs_count += 1,
                BioType::Part(PartType::CDS(_)) => summary.cds_count += 1,
                BioType::Part(PartType::Terminator(_)) => summary.terminators += 1,
                BioType::Part(PartType::Reporter(_)) => summary.reporters += 1,
                BioType::Part(PartType::Regulator(_)) => summary.regulators += 1,
                BioType::Measurement(_) => summary.measurements_with_units += 1,
                _ => {}
            }
        }

        summary.host_checks = self.diagnostics.iter()
            .filter(|d| matches!(d.code, TypeErrorCode::HostIncompatible))
            .count();
        summary.security_checks = self.diagnostics.iter()
            .filter(|d| matches!(d.code, TypeErrorCode::SelectAgentDetected | TypeErrorCode::VirulenceFactorDetected))
            .count();
        summary.sequence_operations = self.diagnostics.iter()
            .filter(|d| matches!(d.code, TypeErrorCode::InvalidSequenceOp))
            .count();

        summary
    }

    /// Get the diagnostics accumulated during type checking.
    pub fn diagnostics(&self) -> &[TypeDiagnostic] {
        &self.diagnostics
    }

    /// Get the inferred types map.
    pub fn inferred_types(&self) -> &HashMap<String, BioType> {
        &self.inferred_types
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
//  TESTS
// ═══════════════════════════════════════════════════════════════════════════════

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_type_inference_from_name() {
        let checker = BioTypeChecker::new();

        // Known part
        let plac = checker.infer_type_from_name("pLac");
        assert!(matches!(plac, BioType::Part(PartType::Promoter(_))));

        // Reporter
        let gfp = checker.infer_type_from_name("GFP");
        assert!(matches!(gfp, BioType::Part(PartType::Reporter(_))));

        // Naming convention: pXxx → Promoter
        let pcustom = checker.infer_type_from_name("pCustom");
        assert!(matches!(pcustom, BioType::Part(PartType::Promoter(_))));

        // RBS convention
        let rbs = checker.infer_type_from_name("rbs_strong");
        assert!(matches!(rbs, BioType::Part(PartType::RBS(_))));

        // Terminator convention
        let term = checker.infer_type_from_name("terminator_1");
        assert!(matches!(term, BioType::Part(PartType::Terminator(_))));

        // Selection marker
        let amp = checker.infer_type_from_name("AmpR");
        assert!(matches!(amp, BioType::Part(PartType::SelectionMarker(_))));

        // Unknown
        let unknown = checker.infer_type_from_name("some_variable");
        assert!(matches!(unknown, BioType::Unknown));
    }

    #[test]
    fn test_biopart_to_rich_type() {
        let checker = BioTypeChecker::new();

        let plac_type = checker.biopart_to_rich_type(&BioPart::PLac);
        if let BioType::Part(PartType::Promoter(p)) = plac_type {
            assert_eq!(p.regulation, RegulationKind::Inducible);
            assert!(p.inducers.contains(&"IPTG".to_string()));
        } else {
            panic!("Expected Promoter type for pLac");
        }

        let gfp_type = checker.biopart_to_rich_type(&BioPart::GFP);
        if let BioType::Part(PartType::Reporter(r)) = gfp_type {
            assert_eq!(r.reporter_class, ReporterClass::Fluorescent);
            assert_eq!(r.emission_nm, Some(509));
        } else {
            panic!("Expected Reporter type for GFP");
        }

        let grna_type = checker.biopart_to_rich_type(&BioPart::GRNA);
        assert!(matches!(grna_type, BioType::Sequence(SequenceType::RNA(RNAKind::SgRNA))));
    }

    #[test]
    fn test_organism_parsing() {
        let checker = BioTypeChecker::new();

        assert_eq!(checker.parse_organism("ecoli"), Some(Organism::EcoliK12));
        assert_eq!(checker.parse_organism("yeast"), Some(Organism::Saccharomyces));
        assert_eq!(checker.parse_organism("BL21"), Some(Organism::EcoliBL21));
        assert_eq!(checker.parse_organism("unknown_org"), None);
    }
}
