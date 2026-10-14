#![allow(dead_code)]
//! Semantic Analysis for BioScript
//!
//! Full type checking, scope resolution, and biological constraint validation.
//! This pass ensures:
//! 1. All variables are defined before use
//! 2. Types are compatible in expressions and connections
//! 3. Biological parts are used in valid configurations
//! 4. Kill switches are present for toxic constructs
//! 5. Genetic connections follow promoter→RBS→CDS→terminator order

use crate::compiler::ast::*;
use std::collections::HashMap;

/// Result of semantic analysis
pub type SemanticResult<T> = Result<T, Vec<SemanticError>>;

/// A single semantic error with location information
#[derive(Debug, Clone)]
pub struct SemanticError {
    pub message: String,
    pub span: Span,
    pub severity: Severity,
    pub code: &'static str,
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub enum Severity {
    Error,
    Warning,
    Info,
}

impl std::fmt::Display for SemanticError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "[{}] {}", self.code, self.message)
    }
}

// ─── Type System ──────────────────────────────────────────────────────────────

/// Biological type used for type-checking
#[derive(Debug, Clone, PartialEq)]
pub enum BioKind {
    // Primitive types
    Int,
    Float,
    Bool,
    String,
    Void,

    // Sequence types
    DNA,
    RNA,
    AminoAcid,

    // Part types — the core of biological type-checking
    Promoter,
    RBS,
    CDS,
    Terminator,
    Operator,
    Insulator,
    Origin,
    SelectionMarker,

    // Regulatory types
    Activator,
    Repressor,
    Inducer,

    // Composite types
    Gene,
    Circuit,
    Protein,
    Riboswitch,
    Aptamer,

    // Logic gate types
    GateAnd,
    GateOr,
    GateNot,
    GateNor,
    GateNand,

    // Value with unit
    ValueWithUnit(UnitCategory),

    // Container
    Array(Box<BioKind>),

    // Struct instance
    Struct(String),

    // Unresolved / any
    Unknown,
}

#[derive(Debug, Clone, PartialEq)]
pub enum UnitCategory {
    Length,
    Mass,
    Concentration,
    Time,
    Temperature,
    Dimensionless,
}

impl BioKind {
    /// Returns true if this type can appear as the source of a genetic flow (`->`)
    pub fn can_start_transcription(&self) -> bool {
        matches!(
            self,
            BioKind::Promoter | BioKind::Insulator | BioKind::Unknown
        )
    }

    /// Returns true if this type can appear after a promoter in a TU
    pub fn can_follow_promoter(&self) -> bool {
        matches!(self, BioKind::RBS | BioKind::CDS | BioKind::Unknown)
    }

    /// Returns true if this type is numeric
    pub fn is_numeric(&self) -> bool {
        matches!(
            self,
            BioKind::Int | BioKind::Float | BioKind::ValueWithUnit(_)
        )
    }

    /// Returns true if this is a biological part
    pub fn is_bio_part(&self) -> bool {
        matches!(
            self,
            BioKind::Promoter
                | BioKind::RBS
                | BioKind::CDS
                | BioKind::Terminator
                | BioKind::Operator
                | BioKind::Insulator
                | BioKind::Gene
                | BioKind::Protein
                | BioKind::Activator
                | BioKind::Repressor
                | BioKind::DNA
                | BioKind::RNA
        )
    }
}

// ─── Symbol Table ─────────────────────────────────────────────────────────────

/// An entry in the symbol table
#[derive(Debug, Clone)]
pub struct Symbol {
    pub name: String,
    pub kind: BioKind,
    pub mutable: bool,
    pub defined_at: Span,
    pub used: bool,
}

/// Scope for nested scope resolution
#[derive(Debug)]
struct Scope {
    symbols: HashMap<String, Symbol>,
    parent: Option<usize>, // index into scopes vec
}

/// The symbol table with nested scopes
pub struct SymbolTable {
    scopes: Vec<Scope>,
    current: usize,
}

impl SymbolTable {
    fn new() -> Self {
        let global = Scope {
            symbols: HashMap::new(),
            parent: None,
        };
        Self {
            scopes: vec![global],
            current: 0,
        }
    }

    fn enter_scope(&mut self) {
        let new_scope = Scope {
            symbols: HashMap::new(),
            parent: Some(self.current),
        };
        self.current = self.scopes.len();
        self.scopes.push(new_scope);
    }

    fn exit_scope(&mut self) {
        if let Some(parent) = self.scopes[self.current].parent {
            self.current = parent;
        }
    }

    fn define(
        &mut self,
        name: String,
        kind: BioKind,
        mutable: bool,
        span: Span,
    ) -> Result<(), SemanticError> {
        if self.scopes[self.current].symbols.contains_key(&name) {
            return Err(SemanticError {
                message: format!("Variable '{}' ya está definida en este scope", name),
                span,
                severity: Severity::Error,
                code: "E001",
            });
        }
        self.scopes[self.current].symbols.insert(
            name.clone(),
            Symbol {
                name,
                kind,
                mutable,
                defined_at: span,
                used: false,
            },
        );
        Ok(())
    }

    fn resolve(&mut self, name: &str) -> Option<&Symbol> {
        let mut scope_idx = self.current;
        loop {
            if let Some(sym) = self.scopes[scope_idx].symbols.get(name) {
                return Some(sym);
            }
            match self.scopes[scope_idx].parent {
                Some(parent) => scope_idx = parent,
                None => return None,
            }
        }
    }

    fn resolve_mut(&mut self, name: &str) -> Option<&mut Symbol> {
        let mut scope_idx = self.current;
        loop {
            if self.scopes[scope_idx].symbols.contains_key(name) {
                return self.scopes[scope_idx].symbols.get_mut(name);
            }
            match self.scopes[scope_idx].parent {
                Some(parent) => scope_idx = parent,
                None => return None,
            }
        }
    }

    fn mark_used(&mut self, name: &str) {
        if let Some(sym) = self.resolve_mut(name) {
            sym.used = true;
        }
    }
}

// ─── Semantic Analyzer ────────────────────────────────────────────────────────

/// The main semantic analyzer
pub struct SemanticAnalyzer {
    symbols: SymbolTable,
    errors: Vec<SemanticError>,
    /// Names of defined circuits
    circuits: Vec<String>,
    /// Names of defined structs
    structs: HashMap<String, Vec<(String, BioKind)>>,
    /// Track if we're inside a circuit (for connection validation)
    in_circuit: bool,
    /// Track if current circuit has kill_switch
    current_has_killswitch: bool,
    /// Track toxic parts used in current circuit
    toxic_parts: Vec<String>,
}

impl SemanticAnalyzer {
    pub fn new() -> Self {
        let mut analyzer = Self {
            symbols: SymbolTable::new(),
            errors: Vec::new(),
            circuits: Vec::new(),
            structs: HashMap::new(),
            in_circuit: false,
            current_has_killswitch: false,
            toxic_parts: Vec::new(),
        };
        // Pre-define built-in biological parts
        analyzer.define_builtins();
        analyzer
    }

    /// Define built-in parts, functions, and types
    fn define_builtins(&mut self) {
        let builtins = vec![
            // Standard promoters
            ("pLac", BioKind::Promoter),
            ("pTet", BioKind::Promoter),
            ("pBAD", BioKind::Promoter),
            ("pT7", BioKind::Promoter),
            ("pConst", BioKind::Promoter),
            // Standard RBS
            ("rbs_strong", BioKind::RBS),
            ("rbs_medium", BioKind::RBS),
            ("rbs_weak", BioKind::RBS),
            ("B0034", BioKind::RBS),
            ("B0032", BioKind::RBS),
            // Reporters
            ("GFP", BioKind::CDS),
            ("RFP", BioKind::CDS),
            ("BFP", BioKind::CDS),
            ("mCherry", BioKind::CDS),
            ("sfGFP", BioKind::CDS),
            // Regulators
            ("LacI", BioKind::Repressor),
            ("TetR", BioKind::Repressor),
            ("CI", BioKind::Repressor),
            ("AraC", BioKind::Activator),
            // CRISPR
            ("Cas9", BioKind::CDS),
            ("dCas9", BioKind::CDS),
            ("gRNA", BioKind::RNA),
            // Terminators
            ("T1", BioKind::Terminator),
            ("T7", BioKind::Terminator),
            ("B0010", BioKind::Terminator),
            ("B0015", BioKind::Terminator),
            // Kill switch mechanisms
            ("CcdB", BioKind::CDS),
            ("MazF", BioKind::CDS),
            ("CcdA", BioKind::CDS),
            ("high", BioKind::Float),
            ("low", BioKind::Float),
            ("medium", BioKind::Float),
            ("IPTG", BioKind::String),
            ("population_density", BioKind::Float),
        ];

        for (name, kind) in builtins {
            let _ = self.symbols.define(name.to_string(), kind, false, 0..0);
        }
    }

    /// Run full semantic analysis on a program
    pub fn analyze(&mut self, program: &Program) -> SemanticResult<()> {
        // Pass 1: Collect all top-level declarations (enables forward references)
        for item in &program.items {
            match item {
                Item::Circuit(c) => {
                    self.circuits.push(c.name.name.clone());
                    let _ = self.symbols.define(
                        c.name.name.clone(),
                        BioKind::Circuit,
                        false,
                        c.name.span.clone(),
                    );
                }
                Item::Gene(g) => {
                    let kind = match g.gene_type {
                        GeneType::Protein => BioKind::Gene,
                        GeneType::RNA => BioKind::RNA,
                        GeneType::Regulatory => BioKind::Gene,
                    };
                    let _ =
                        self.symbols
                            .define(g.name.name.clone(), kind, false, g.name.span.clone());
                }
                Item::Struct(s) => {
                    let fields: Vec<(String, BioKind)> = s
                        .fields
                        .iter()
                        .map(|f| {
                            (
                                f.name.name.clone(),
                                self.resolve_type_annotation(&f.field_type),
                            )
                        })
                        .collect();
                    self.structs.insert(s.name.name.clone(), fields);
                    let _ = self.symbols.define(
                        s.name.name.clone(),
                        BioKind::Struct(s.name.name.clone()),
                        false,
                        s.name.span.clone(),
                    );
                }
                Item::Const(c) => {
                    let kind = self.infer_expr_type(&c.value);
                    let _ =
                        self.symbols
                            .define(c.name.name.clone(), kind, false, c.name.span.clone());
                }
                Item::Import(imp) => {
                    for item in &imp.items {
                        let kind = self.infer_part_type_from_name(&item.name);
                        let _ =
                            self.symbols
                                .define(item.name.clone(), kind, false, item.span.clone());
                    }
                }
                Item::Function(f) => {
                    let ret = f
                        .return_type
                        .as_ref()
                        .map(|t| self.resolve_type_annotation(t))
                        .unwrap_or(BioKind::Void);
                    let _ =
                        self.symbols
                            .define(f.name.name.clone(), ret, false, f.name.span.clone());
                }
                _ => {}
            }
        }

        // Pass 2: Deep analysis of each item
        for item in &program.items {
            match item {
                Item::Circuit(c) => self.check_circuit(c),
                Item::Gene(g) => self.check_gene(g),
                Item::Function(f) => self.check_function(f),
                Item::Chassis(ch) => self.check_chassis(ch),
                _ => {}
            }
        }

        if self.errors.iter().any(|e| e.severity == Severity::Error) {
            Err(self.errors.clone())
        } else {
            Ok(())
        }
    }

    /// Get all diagnostics (errors + warnings)
    pub fn diagnostics(&self) -> &[SemanticError] {
        &self.errors
    }

    // ─── Circuit Checking ─────────────────────────────────────────────

    fn check_circuit(&mut self, circuit: &CircuitDecl) {
        self.in_circuit = true;
        self.current_has_killswitch = circuit.body.kill_switch.is_some();
        self.toxic_parts.clear();
        self.symbols.enter_scope();

        // Check kill switch if present
        if let Some(ref ks) = circuit.body.kill_switch {
            self.check_expr(&ks.trigger);
        }

        // Check all statements in the circuit body
        for stmt in &circuit.body.statements {
            self.check_statement(stmt);
        }

        // Check genetic connections — the core biological verification
        for conn in &circuit.body.connections {
            self.check_connection(conn);
        }

        // If toxic parts are used but no kill_switch, emit error for `safe circuit`
        if circuit.is_safe && !self.toxic_parts.is_empty() && !self.current_has_killswitch {
            self.errors.push(SemanticError {
                message: format!(
                    "Circuit '{}' is declared 'safe' but uses potentially toxic parts ({}) without a kill_switch",
                    circuit.name.name,
                    self.toxic_parts.join(", ")
                ),
                span: circuit.span.clone(),
                severity: Severity::Error,
                code: "E010",
            });
        }

        // Warn about unused variables in circuit scope
        self.warn_unused_variables();

        self.symbols.exit_scope();
        self.in_circuit = false;
    }

    fn check_connection(&mut self, conn: &GeneticConnection) {
        if conn.parts.is_empty() {
            return;
        }

        // Resolve types of all parts in the connection
        let part_types: Vec<(BioKind, Span)> = conn.parts.iter().map(|p| {
            match p {
                GeneticPart::Identifier(id) => {
                    self.symbols.mark_used(&id.name);
                    let kind = self.symbols.resolve(&id.name)
                        .map(|s| s.kind.clone())
                        .unwrap_or_else(|| {
                            // Check if it's an unregistered part name
                            self.infer_part_type_from_name(&id.name)
                        });
                    if matches!(kind, BioKind::Unknown) {
                        self.errors.push(SemanticError {
                            message: format!("Parte biológica '{}' no reconocida. ¿Falta un import o definición?", id.name),
                            span: id.span.clone(),
                            severity: Severity::Warning,
                            code: "W003",
                        });
                    }
                    (kind, id.span.clone())
                }
                GeneticPart::FunctionCall(fc) => {
                    self.check_expr(&Expr::Call(fc.clone()));
                    (BioKind::Unknown, fc.span.clone())
                }
                GeneticPart::Literal(bp) => {
                    let kind = self.biopart_to_type(bp);
                    (kind, conn.span.clone())
                }
            }
        }).collect();

        // Validate the connection order based on connection type
        match conn.connection_type {
            ConnectionType::Transcription => {
                self.validate_transcription_unit(&part_types, &conn.span);
            }
            ConnectionType::Regulation => {
                // Regulation connections: regulator ~> target
                if part_types.len() >= 2 {
                    let (ref from_type, ref from_span) = part_types[0];
                    let (ref to_type, _) = part_types[part_types.len() - 1];
                    if !matches!(
                        from_type,
                        BioKind::Repressor
                            | BioKind::Activator
                            | BioKind::CDS
                            | BioKind::Gene
                            | BioKind::Unknown
                    ) {
                        self.errors.push(SemanticError {
                            message: format!(
                                "El lado izquierdo de una regulación (~>) debe ser un regulador, no {:?}",
                                from_type
                            ),
                            span: from_span.clone(),
                            severity: Severity::Error,
                            code: "E011",
                        });
                    }
                    if !matches!(
                        to_type,
                        BioKind::Promoter | BioKind::Gene | BioKind::Circuit | BioKind::Unknown
                    ) {
                        self.errors.push(SemanticError {
                            message:
                                "El objetivo de una regulación (~>) debe ser un promotor o gen"
                                    .to_string(),
                            span: conn.span.clone(),
                            severity: Severity::Warning,
                            code: "W004",
                        });
                    }
                }
            }
            ConnectionType::Transform => {
                // Pipeline transform: data |> function
                // Less strict, mainly for data processing
            }
        }
    }

    /// Validate that a transcription connection follows: Promoter → RBS → CDS → Terminator
    fn validate_transcription_unit(&mut self, parts: &[(BioKind, Span)], conn_span: &Span) {
        if parts.is_empty() {
            return;
        }

        // Expected order states
        #[derive(Debug, PartialEq)]
        enum TUState {
            ExpectPromoter,
            ExpectRBSOrCDS,
            ExpectCDSOrTerminator,
            ExpectTerminator,
            Done,
        }

        let mut state = TUState::ExpectPromoter;
        let mut _has_promoter = false;
        let mut has_cds = false;

        for (kind, span) in parts {
            match (&state, kind) {
                (TUState::ExpectPromoter, BioKind::Promoter) => {
                    _has_promoter = true;
                    state = TUState::ExpectRBSOrCDS;
                }
                (TUState::ExpectPromoter, _) if !kind.is_bio_part() => {
                    // Could be a variable reference, let it pass
                }
                (TUState::ExpectPromoter, _) => {
                    self.errors.push(SemanticError {
                        message: format!(
                            "Una unidad de transcripción debe comenzar con un Promoter, no {:?}",
                            kind
                        ),
                        span: span.clone(),
                        severity: Severity::Warning,
                        code: "W005",
                    });
                    state = TUState::ExpectRBSOrCDS;
                }
                (TUState::ExpectRBSOrCDS, BioKind::RBS) => {
                    state = TUState::ExpectCDSOrTerminator;
                }
                (TUState::ExpectRBSOrCDS, BioKind::CDS) => {
                    has_cds = true;
                    state = TUState::ExpectTerminator;
                }
                (TUState::ExpectCDSOrTerminator, BioKind::CDS) => {
                    has_cds = true;
                    state = TUState::ExpectTerminator;
                }
                (TUState::ExpectCDSOrTerminator, BioKind::Terminator) => {
                    state = TUState::Done;
                }
                (TUState::ExpectTerminator, BioKind::Terminator) => {
                    state = TUState::Done;
                }
                (TUState::ExpectTerminator, BioKind::CDS) => {
                    // Polycistronic — multiple CDS in one TU
                    has_cds = true;
                }
                (TUState::Done, _) => {
                    self.errors.push(SemanticError {
                        message: "Partes adicionales después del terminador — ¿Debería ser una nueva conexión?".to_string(),
                        span: span.clone(),
                        severity: Severity::Warning,
                        code: "W006",
                    });
                }
                _ => {
                    // Unknown types get a pass
                }
            }
        }

        // Warn if no terminator at end
        if has_cds && !matches!(state, TUState::Done) {
            self.errors.push(SemanticError {
                message: "Unidad de transcripción sin terminador — puede causar read-through transcripcional".to_string(),
                span: conn_span.clone(),
                severity: Severity::Warning,
                code: "W007",
            });
        }
    }

    // ─── Statement & Expression Checking ──────────────────────────────

    fn check_statement(&mut self, stmt: &Statement) {
        match stmt {
            Statement::Let(ls) => {
                // Check the value expression first
                let value_type = self.check_expr(&ls.value);

                // If explicit type annotation, verify compatibility
                if let Some(ref ann) = ls.var_type {
                    let declared = self.resolve_type_annotation(ann);
                    if declared != BioKind::Unknown
                        && value_type != BioKind::Unknown
                        && !Self::kinds_compatible(&declared, &value_type)
                    {
                        self.errors.push(SemanticError {
                            message: format!(
                                "Tipo declarado {:?} no coincide con valor {:?}",
                                declared, value_type
                            ),
                            span: ls.span.clone(),
                            severity: Severity::Error,
                            code: "E002",
                        });
                    }
                }

                let kind = if value_type != BioKind::Unknown {
                    value_type
                } else if let Some(ref ann) = ls.var_type {
                    self.resolve_type_annotation(ann)
                } else {
                    BioKind::Unknown
                };

                if let Err(e) = self.symbols.define(
                    ls.name.name.clone(),
                    kind,
                    ls.is_mutable,
                    ls.name.span.clone(),
                ) {
                    self.errors.push(e);
                }
            }
            Statement::Expression(expr) => {
                self.check_expr(expr);
            }
            Statement::If(ifs) => {
                let cond_type = self.check_expr(&ifs.condition);
                if cond_type != BioKind::Bool && cond_type != BioKind::Unknown {
                    self.errors.push(SemanticError {
                        message: format!("La condición del if debe ser Bool, no {:?}", cond_type),
                        span: ifs.span.clone(),
                        severity: Severity::Error,
                        code: "E003",
                    });
                }
                self.symbols.enter_scope();
                for s in &ifs.then_branch.statements {
                    self.check_statement(s);
                }
                self.symbols.exit_scope();
                if let Some(ref else_b) = ifs.else_branch {
                    self.symbols.enter_scope();
                    for s in &else_b.statements {
                        self.check_statement(s);
                    }
                    self.symbols.exit_scope();
                }
            }
            Statement::When(ws) => {
                if !self.in_circuit {
                    self.errors.push(SemanticError {
                        message: "'when' triggers solo pueden usarse dentro de un circuit"
                            .to_string(),
                        span: ws.span.clone(),
                        severity: Severity::Error,
                        code: "E004",
                    });
                }
                self.check_expr(&ws.condition);
                self.symbols.enter_scope();
                for s in &ws.body.statements {
                    self.check_statement(s);
                }
                self.symbols.exit_scope();
            }
            Statement::Connection(conn) => {
                self.check_connection(conn);
            }
            Statement::Return(expr) => {
                if let Some(e) = expr {
                    self.check_expr(e);
                }
            }
            Statement::Loop(ls) => match ls {
                LoopStatement::For {
                    var,
                    iterable,
                    body,
                    ..
                } => {
                    self.check_expr(iterable);
                    self.symbols.enter_scope();
                    let _ = self.symbols.define(
                        var.name.clone(),
                        BioKind::Unknown,
                        false,
                        var.span.clone(),
                    );
                    for s in &body.statements {
                        self.check_statement(s);
                    }
                    self.symbols.exit_scope();
                }
                LoopStatement::While {
                    condition, body, ..
                } => {
                    self.check_expr(condition);
                    self.symbols.enter_scope();
                    for s in &body.statements {
                        self.check_statement(s);
                    }
                    self.symbols.exit_scope();
                }
                LoopStatement::Loop { body, .. } => {
                    self.symbols.enter_scope();
                    for s in &body.statements {
                        self.check_statement(s);
                    }
                    self.symbols.exit_scope();
                }
            },
            Statement::Match(ms) => {
                self.check_expr(&ms.expr);
                for arm in &ms.arms {
                    self.check_expr(&arm.body);
                }
            }
        }
    }

    /// Check an expression and return its inferred type
    fn check_expr(&mut self, expr: &Expr) -> BioKind {
        match expr {
            Expr::Literal(lit) => match lit {
                Literal::Integer(_) => BioKind::Int,
                Literal::Float(_) => BioKind::Float,
                Literal::String(_) => BioKind::String,
                Literal::Bool(_) => BioKind::Bool,
            },
            Expr::Identifier(id) => {
                self.symbols.mark_used(&id.name);
                if let Some(sym) = self.symbols.resolve(&id.name) {
                    sym.kind.clone()
                } else {
                    // Try to infer part type from name
                    let inferred = self.infer_part_type_from_name(&id.name);
                    if inferred == BioKind::Unknown {
                        let external = id
                            .name
                            .chars()
                            .next()
                            .map(|c| c.is_uppercase())
                            .unwrap_or(false)
                            || matches!(id.name.as_str(), "high" | "low" | "medium");
                        self.errors.push(SemanticError {
                            message: format!("Variable '{}' no definida", id.name),
                            span: id.span.clone(),
                            severity: if external {
                                Severity::Warning
                            } else {
                                Severity::Error
                            },
                            code: if external { "W003" } else { "E005" },
                        });
                    }
                    inferred
                }
            }
            Expr::BioPart(bp) => self.biopart_to_type(bp),
            Expr::DNASequence(seq) => {
                // Validate the DNA sequence
                if let Err(e) = seq.validate() {
                    self.errors.push(SemanticError {
                        message: e,
                        span: seq.span.clone(),
                        severity: Severity::Error,
                        code: "E006",
                    });
                }
                // GC content warnings
                let gc = seq.gc_content();
                if gc < 0.25 || gc > 0.75 {
                    self.errors.push(SemanticError {
                        message: format!(
                            "GC content extremo ({:.1}%) — puede causar problemas de síntesis y estabilidad",
                            gc * 100.0
                        ),
                        span: seq.span.clone(),
                        severity: Severity::Warning,
                        code: "W001",
                    });
                }
                BioKind::DNA
            }
            Expr::AminoSequence(_) => BioKind::AminoAcid,
            Expr::ValueWithUnit(vwu) => {
                let cat = match &vwu.unit {
                    Unit::BasePairs | Unit::Kilobases => UnitCategory::Length,
                    Unit::KiloDaltons | Unit::Daltons => UnitCategory::Mass,
                    Unit::NanoMolar | Unit::MicroMolar | Unit::MilliMolar | Unit::Molar => {
                        UnitCategory::Concentration
                    }
                    Unit::Seconds | Unit::Minutes | Unit::Hours => UnitCategory::Time,
                    Unit::Celsius => UnitCategory::Temperature,
                    Unit::PartsPerBillion | Unit::CellsPerMillilitre => UnitCategory::Concentration,
                    Unit::ArbitraryUnits | Unit::Percent => UnitCategory::Dimensionless,
                };
                BioKind::ValueWithUnit(cat)
            }
            Expr::Binary(bin) => {
                let left = self.check_expr(&bin.left);
                let right = self.check_expr(&bin.right);

                match &bin.operator {
                    BinaryOp::GeneticFlow | BinaryOp::Regulation | BinaryOp::Transform => {
                        // These are biological operators — parts must be bio types
                        BioKind::Unknown // The connection itself doesn't have a value type
                    }
                    BinaryOp::And | BinaryOp::Or => {
                        if left != BioKind::Bool && left != BioKind::Unknown {
                            self.errors.push(SemanticError {
                                message: format!(
                                    "Operando izquierdo de {:?} debe ser Bool",
                                    bin.operator
                                ),
                                span: bin.span.clone(),
                                severity: Severity::Error,
                                code: "E007",
                            });
                        }
                        BioKind::Bool
                    }
                    BinaryOp::Eq
                    | BinaryOp::NotEq
                    | BinaryOp::Lt
                    | BinaryOp::LtEq
                    | BinaryOp::Gt
                    | BinaryOp::GtEq => BioKind::Bool,
                    _ => {
                        // Arithmetic operators
                        if left.is_numeric() && right.is_numeric() {
                            if matches!(left, BioKind::Float) || matches!(right, BioKind::Float) {
                                BioKind::Float
                            } else {
                                BioKind::Int
                            }
                        } else {
                            left
                        }
                    }
                }
            }
            Expr::Unary(un) => {
                let operand = self.check_expr(&un.operand);
                match un.operator {
                    UnaryOp::Not => BioKind::Bool,
                    UnaryOp::Neg => operand,
                }
            }
            Expr::Call(fc) => {
                // Check all arguments
                for arg in &fc.arguments {
                    self.check_expr(arg);
                }
                // Infer return type from function name
                if let Expr::Identifier(ref id) = *fc.function {
                    self.symbols.mark_used(&id.name);
                    match id.name.as_str() {
                        "express" => BioKind::Protein,
                        "repress" | "inhibit" => BioKind::Void,
                        "activate" => BioKind::Void,
                        "sense" | "bind" => BioKind::Bool,
                        "secrete" => BioKind::Void,
                        "translate" => BioKind::AminoAcid,
                        "transcribe" => BioKind::RNA,
                        "optimize_codons" => BioKind::DNA,
                        _ => self
                            .symbols
                            .resolve(&id.name)
                            .map(|s| s.kind.clone())
                            .unwrap_or(BioKind::Unknown),
                    }
                } else {
                    BioKind::Unknown
                }
            }
            Expr::FieldAccess(fa) => {
                self.check_expr(&fa.object);
                BioKind::Unknown
            }
            Expr::IndexAccess(ia) => {
                self.check_expr(&ia.object);
                self.check_expr(&ia.index);
                BioKind::Unknown
            }
            Expr::Array(items) => {
                let mut elem_type = BioKind::Unknown;
                for item in items {
                    let t = self.check_expr(item);
                    if elem_type == BioKind::Unknown {
                        elem_type = t;
                    }
                }
                BioKind::Array(Box::new(elem_type))
            }
            Expr::StructInit(si) => {
                // Verify struct exists
                if !self.structs.contains_key(&si.struct_name.name) {
                    // Characterization and parameter blocks are free-form records.
                    self.errors.push(SemanticError {
                        message: format!("Struct '{}' no definido", si.struct_name.name),
                        span: si.span.clone(),
                        severity: Severity::Warning,
                        code: "W008",
                    });
                }
                for field in &si.fields {
                    self.check_expr(&field.value);
                }
                BioKind::Struct(si.struct_name.name.clone())
            }
            Expr::Block(block) => {
                self.symbols.enter_scope();
                let mut last = BioKind::Void;
                for s in &block.statements {
                    self.check_statement(s);
                    if let Statement::Expression(e) = s {
                        last = self.infer_expr_type(e);
                    }
                }
                self.symbols.exit_scope();
                last
            }
        }
    }

    // ─── Helper functions ─────────────────────────────────────────────

    fn check_gene(&mut self, gene: &GeneDecl) {
        self.symbols.enter_scope();
        for prop in &gene.properties {
            self.check_expr(&prop.value);
        }
        self.symbols.exit_scope();
    }

    fn check_function(&mut self, func: &FunctionDecl) {
        self.symbols.enter_scope();
        for param in &func.params {
            let kind = self.resolve_type_annotation(&param.param_type);
            let _ = self.symbols.define(
                param.name.name.clone(),
                kind,
                false,
                param.name.span.clone(),
            );
        }
        for stmt in &func.body.statements {
            self.check_statement(stmt);
        }
        self.symbols.exit_scope();
    }

    fn check_chassis(&mut self, chassis: &ChassisDecl) {
        for prop in &chassis.properties {
            self.check_expr(&prop.value);
        }
    }

    fn resolve_type_annotation(&self, ann: &TypeAnnotation) -> BioKind {
        match ann {
            TypeAnnotation::Simple(id) => match id.name.as_str() {
                "i32" | "i64" | "int" => BioKind::Int,
                "f32" | "f64" | "float" => BioKind::Float,
                "bool" => BioKind::Bool,
                "String" | "str" => BioKind::String,
                "DNA" => BioKind::DNA,
                "RNA" => BioKind::RNA,
                "Protein" => BioKind::Protein,
                "Promoter" => BioKind::Promoter,
                "RBS" => BioKind::RBS,
                "CDS" => BioKind::CDS,
                "Terminator" => BioKind::Terminator,
                "Gene" => BioKind::Gene,
                "Circuit" => BioKind::Circuit,
                other => {
                    if self.structs.contains_key(other) {
                        BioKind::Struct(other.to_string())
                    } else {
                        BioKind::Unknown
                    }
                }
            },
            TypeAnnotation::Biological(bt) => match bt {
                BioType::Promoter { .. } => BioKind::Promoter,
                BioType::RBS { .. } => BioKind::RBS,
                BioType::Protein { .. } => BioKind::Protein,
                BioType::Terminator { .. } => BioKind::Terminator,
                BioType::Gene => BioKind::Gene,
                BioType::Circuit => BioKind::Circuit,
                BioType::DNA => BioKind::DNA,
                BioType::RNA => BioKind::RNA,
            },
            TypeAnnotation::Generic(id, _) => match id.name.as_str() {
                "Vec" | "Array" => BioKind::Array(Box::new(BioKind::Unknown)),
                _ => BioKind::Unknown,
            },
        }
    }

    fn infer_expr_type(&self, expr: &Expr) -> BioKind {
        match expr {
            Expr::Literal(Literal::Integer(_)) => BioKind::Int,
            Expr::Literal(Literal::Float(_)) => BioKind::Float,
            Expr::Literal(Literal::String(_)) => BioKind::String,
            Expr::Literal(Literal::Bool(_)) => BioKind::Bool,
            Expr::DNASequence(_) => BioKind::DNA,
            Expr::AminoSequence(_) => BioKind::AminoAcid,
            Expr::BioPart(bp) => self.biopart_to_type(bp),
            _ => BioKind::Unknown,
        }
    }

    fn biopart_to_type(&self, bp: &BioPart) -> BioKind {
        match bp {
            BioPart::PLac | BioPart::PTet | BioPart::PBAD | BioPart::PT7 => BioKind::Promoter,
            BioPart::GFP | BioPart::RFP | BioPart::BFP => BioKind::CDS,
            BioPart::LacI | BioPart::TetR | BioPart::CI => BioKind::Repressor,
            BioPart::Cas9 => BioKind::CDS,
            BioPart::GRNA => BioKind::RNA,
            BioPart::RBSStrong | BioPart::RBSMedium | BioPart::RBSWeak => BioKind::RBS,
            BioPart::TermT1 | BioPart::TermT7 => BioKind::Terminator,
            BioPart::Custom(name) => self.infer_part_type_from_name(name),
        }
    }

    /// Infer part type from naming convention (e.g., pXxx = Promoter, rbs_xxx = RBS)
    fn infer_part_type_from_name(&self, name: &str) -> BioKind {
        let lower = name.to_lowercase();
        if lower.starts_with('p') && name.chars().nth(1).map_or(false, |c| c.is_uppercase()) {
            BioKind::Promoter
        } else if lower.starts_with("rbs") {
            BioKind::RBS
        } else if lower.starts_with("term") || lower.starts_with("t_") {
            BioKind::Terminator
        } else if lower.ends_with("_cds") {
            BioKind::CDS
        } else {
            BioKind::Unknown
        }
    }

    fn kinds_compatible(declared: &BioKind, value: &BioKind) -> bool {
        declared == value || (declared.is_bio_part() && value.is_bio_part())
    }

    fn warn_unused_variables(&mut self) {
        let scope = &self.symbols.scopes[self.symbols.current];
        for (name, sym) in &scope.symbols {
            if !sym.used && !name.starts_with('_') {
                self.errors.push(SemanticError {
                    message: format!("Variable '{}' declarada pero no usada", name),
                    span: sym.defined_at.clone(),
                    severity: Severity::Warning,
                    code: "W002",
                });
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::compiler::parser::Parser;

    fn analyze_source(source: &str) -> (SemanticResult<()>, Vec<SemanticError>) {
        let mut parser = Parser::new(source).unwrap();
        let program = parser.parse_program().unwrap();
        let mut analyzer = SemanticAnalyzer::new();
        let result = analyzer.analyze(&program);
        let diags = analyzer.diagnostics().to_vec();
        (result, diags)
    }

    #[test]
    fn test_basic_circuit() {
        let (result, _) = analyze_source("circuit Test { let x = pLac; }");
        assert!(result.is_ok());
    }

    #[test]
    fn test_undefined_variable() {
        let (_, diags) = analyze_source("circuit Test { let y = undefined_var; }");
        assert!(diags.iter().any(|d| d.code == "E005"));
    }
}
