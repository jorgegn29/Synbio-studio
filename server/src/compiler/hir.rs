#![allow(dead_code)]
//! HIR (High-level Intermediate Representation)
//!
//! The HIR is a desugared, simplified representation of the AST that:
//! 1. Flattens connection chains into individual transcription units
//! 2. Resolves imports and expands part references
//! 3. Normalizes expressions (desugar `when` into conditional circuits)
//! 4. Collects all regulatory relationships
//! 5. Validates and resolves chassis configuration
//!
//! Pipeline: AST → [Semantic Analysis] → HIR → MIR → BioIR

use std::collections::HashMap;
use crate::compiler::ast::{self, Span, BioPart, GeneType, ConnectionType};

// ─── HIR Types ────────────────────────────────────────────────────────────────

/// Complete HIR program — a desugared and flattened AST
#[derive(Debug, Clone)]
pub struct HirProgram {
    pub name: String,
    pub chassis: Option<HirChassis>,
    pub circuits: Vec<HirCircuit>,
    pub genes: Vec<HirGene>,
    pub functions: Vec<HirFunction>,
    pub constants: HashMap<String, HirConstant>,
    pub structs: HashMap<String, HirStruct>,
}

/// Host organism configuration
#[derive(Debug, Clone)]
pub struct HirChassis {
    pub name: String,
    pub host_type: String,
    pub properties: HashMap<String, HirValue>,
    pub span: Span,
}

/// A genetic circuit — desugared connections
#[derive(Debug, Clone)]
pub struct HirCircuit {
    pub name: String,
    pub is_safe: bool,
    /// Flattened transcription units (from `->` chains)
    pub transcription_units: Vec<HirTranscriptionUnit>,
    /// Regulatory links (from `~>` chains)
    pub regulations: Vec<HirRegulation>,
    /// Flattened transforms (from `|>` chains)
    pub transforms: Vec<HirTransform>,
    /// Kill switch if declared
    pub kill_switch: Option<HirKillSwitch>,
    /// Local variable bindings
    pub bindings: Vec<HirBinding>,
    /// Conditional triggers (desugared `when` blocks)
    pub triggers: Vec<HirTrigger>,
    pub span: Span,
}

/// A single transcription unit extracted from a connection chain
/// e.g., `pLac -> rbs_strong -> GFP -> term_T1` becomes one HirTranscriptionUnit
#[derive(Debug, Clone)]
pub struct HirTranscriptionUnit {
    pub id: String,
    pub parts: Vec<HirPart>,
    pub span: Span,
}

/// A resolved biological part in HIR
#[derive(Debug, Clone)]
pub struct HirPart {
    pub name: String,
    pub part_type: HirPartType,
    pub registry_id: Option<String>,
    pub span: Span,
}

#[derive(Debug, Clone, PartialEq)]
pub enum HirPartType {
    Promoter,
    RBS,
    CDS,
    Terminator,
    Operator,
    Insulator,
    Gene,
    Unknown,
}

/// Regulatory link from `~>` operator
#[derive(Debug, Clone)]
pub struct HirRegulation {
    pub regulator: String,
    pub target: String,
    pub regulation_kind: HirRegulationKind,
    pub span: Span,
}

#[derive(Debug, Clone)]
pub enum HirRegulationKind {
    Repression,
    Activation,
    Inferred,   // Let the compiler figure out from part types
}

/// Transform pipeline from `|>` operator
#[derive(Debug, Clone)]
pub struct HirTransform {
    pub input: String,
    pub function: String,
    pub arguments: Vec<HirValue>,
    pub span: Span,
}

/// Kill switch declaration
#[derive(Debug, Clone)]
pub struct HirKillSwitch {
    pub trigger_condition: HirValue,
    pub mechanism: String,
    pub delay_hours: Option<f64>,
    pub span: Span,
}

/// Variable binding in a circuit
#[derive(Debug, Clone)]
pub struct HirBinding {
    pub name: String,
    pub mutable: bool,
    pub value: HirValue,
    pub span: Span,
}

/// Conditional trigger (desugared `when`)
#[derive(Debug, Clone)]
pub struct HirTrigger {
    pub condition: HirValue,
    pub actions: Vec<HirAction>,
    pub span: Span,
}

/// An action inside a trigger
#[derive(Debug, Clone)]
pub enum HirAction {
    Express(String),        // express(gene)
    Repress(String),        // repress(gene)
    Activate(String),       // activate(promoter)
    Call(String, Vec<HirValue>), // generic function call
}

/// Gene declaration
#[derive(Debug, Clone)]
pub struct HirGene {
    pub name: String,
    pub gene_type: HirGeneType,
    pub properties: HashMap<String, HirValue>,
    pub span: Span,
}

#[derive(Debug, Clone)]
pub enum HirGeneType {
    Protein,
    RNA,
    Regulatory,
}

/// Function declaration (kept for future codegen)
#[derive(Debug, Clone)]
pub struct HirFunction {
    pub name: String,
    pub params: Vec<(String, String)>, // (name, type_name)
    pub return_type: Option<String>,
    pub body: Vec<HirStatement>,
    pub span: Span,
}

/// Simplified statements in functions
#[derive(Debug, Clone)]
pub enum HirStatement {
    Binding(HirBinding),
    Return(Option<HirValue>),
    If { condition: HirValue, then_body: Vec<HirStatement>, else_body: Vec<HirStatement> },
    Call(String, Vec<HirValue>),
}

/// Constant value
#[derive(Debug, Clone)]
pub struct HirConstant {
    pub name: String,
    pub value: HirValue,
}

/// Struct definition
#[derive(Debug, Clone)]
pub struct HirStruct {
    pub name: String,
    pub fields: Vec<(String, String)>, // (name, type_name)
}

/// Simplified value type for HIR
#[derive(Debug, Clone)]
pub enum HirValue {
    Integer(i64),
    Float(f64),
    String(String),
    Bool(bool),
    Identifier(String),
    DNASequence(String),
    AminoSequence(String),
    ValueWithUnit(f64, String),
    Part(String, HirPartType),
    Call(String, Vec<HirValue>),
    FieldAccess(Box<HirValue>, String),
    Array(Vec<HirValue>),
    BinaryOp(Box<HirValue>, String, Box<HirValue>),
    UnaryOp(String, Box<HirValue>),
}

// ─── HIR Lowering: AST → HIR ─────────────────────────────────────────────────

/// Lowers an AST Program into HIR
pub struct HirLowering {
    tu_counter: usize,
    /// Known part types for inference
    known_parts: HashMap<String, HirPartType>,
}

impl HirLowering {
    pub fn new() -> Self {
        let mut known_parts = HashMap::new();
        // Register standard parts
        for name in &["pLac", "pTet", "pBAD", "pT7", "pConst"] {
            known_parts.insert(name.to_string(), HirPartType::Promoter);
        }
        for name in &["rbs_strong", "rbs_medium", "rbs_weak", "B0034", "B0032"] {
            known_parts.insert(name.to_string(), HirPartType::RBS);
        }
        for name in &["GFP", "RFP", "BFP", "mCherry", "sfGFP", "LacI", "TetR", "CI", "AraC", "Cas9", "dCas9", "CcdB", "MazF"] {
            known_parts.insert(name.to_string(), HirPartType::CDS);
        }
        for name in &["term_T1", "term_T7", "T1", "T7", "B0010", "B0015"] {
            known_parts.insert(name.to_string(), HirPartType::Terminator);
        }
        for name in &["gRNA"] {
            known_parts.insert(name.to_string(), HirPartType::Gene); // RNA gene
        }
        Self { tu_counter: 0, known_parts }
    }

    /// Lower an entire AST program to HIR
    pub fn lower(&mut self, program: &ast::Program) -> HirProgram {
        let mut hir = HirProgram {
            name: "program".to_string(),
            chassis: None,
            circuits: Vec::new(),
            genes: Vec::new(),
            functions: Vec::new(),
            constants: HashMap::new(),
            structs: HashMap::new(),
        };

        for item in &program.items {
            match item {
                ast::Item::Chassis(ch) => {
                    hir.chassis = Some(self.lower_chassis(ch));
                }
                ast::Item::Circuit(c) => {
                    hir.circuits.push(self.lower_circuit(c));
                }
                ast::Item::Gene(g) => {
                    hir.genes.push(self.lower_gene(g));
                }
                ast::Item::Function(f) => {
                    hir.functions.push(self.lower_function(f));
                }
                ast::Item::Const(c) => {
                    let constant = HirConstant {
                        name: c.name.name.clone(),
                        value: self.lower_expr(&c.value),
                    };
                    hir.constants.insert(c.name.name.clone(), constant);
                }
                ast::Item::Struct(s) => {
                    let st = HirStruct {
                        name: s.name.name.clone(),
                        fields: s.fields.iter().map(|f| {
                            (f.name.name.clone(), self.type_ann_to_string(&f.field_type))
                        }).collect(),
                    };
                    hir.structs.insert(s.name.name.clone(), st);
                }
                ast::Item::Import(_) => {
                    // Imports are resolved at semantic level; skip at HIR
                }
            }
        }

        hir
    }

    fn lower_chassis(&self, ch: &ast::ChassisDecl) -> HirChassis {
        let mut props = HashMap::new();
        for p in &ch.properties {
            props.insert(p.name.name.clone(), self.lower_expr(&p.value));
        }
        HirChassis {
            name: ch.name.name.clone(),
            host_type: ch.host_type.name.clone(),
            properties: props,
            span: ch.span.clone(),
        }
    }

    fn lower_circuit(&mut self, circuit: &ast::CircuitDecl) -> HirCircuit {
        let mut hir_circuit = HirCircuit {
            name: circuit.name.name.clone(),
            is_safe: circuit.is_safe,
            transcription_units: Vec::new(),
            regulations: Vec::new(),
            transforms: Vec::new(),
            kill_switch: None,
            bindings: Vec::new(),
            triggers: Vec::new(),
            span: circuit.span.clone(),
        };

        // Lower kill switch
        if let Some(ref ks) = circuit.body.kill_switch {
            hir_circuit.kill_switch = Some(HirKillSwitch {
                trigger_condition: self.lower_expr(&ks.trigger),
                mechanism: ks.mechanism.name.clone(),
                delay_hours: ks.delay.as_ref().map(|d| {
                    match d.unit {
                        ast::Unit::Hours => d.value,
                        ast::Unit::Minutes => d.value / 60.0,
                        ast::Unit::Seconds => d.value / 3600.0,
                        _ => d.value,
                    }
                }),
                span: ks.span.clone(),
            });
        }

        // Lower statements
        for stmt in &circuit.body.statements {
            self.lower_circuit_statement(stmt, &mut hir_circuit);
        }

        // Lower connections — THE CORE OF HIR LOWERING
        for conn in &circuit.body.connections {
            self.lower_connection(conn, &mut hir_circuit);
        }

        hir_circuit
    }

    /// Lower a genetic connection into TU, regulation, or transform
    fn lower_connection(&mut self, conn: &ast::GeneticConnection, circuit: &mut HirCircuit) {
        match conn.connection_type {
            ConnectionType::Transcription => {
                // `promoter -> rbs -> cds -> terminator`
                // Flatten into a HirTranscriptionUnit
                self.tu_counter += 1;
                let id = format!("TU_{}", self.tu_counter);
                let parts: Vec<HirPart> = conn.parts.iter().map(|p| self.lower_genetic_part(p, &conn.span)).collect();
                circuit.transcription_units.push(HirTranscriptionUnit {
                    id,
                    parts,
                    span: conn.span.clone(),
                });
            }
            ConnectionType::Regulation => {
                // `LacI ~> pLac` → repression link
                // Collect pairs: first ~> second, second ~> third, etc.
                if conn.parts.len() >= 2 {
                    let regulator = self.part_name(&conn.parts[0]);
                    let target = self.part_name(&conn.parts[conn.parts.len() - 1]);

                    // Infer regulation kind from part types
                    let kind = self.infer_regulation_kind(&regulator);

                    circuit.regulations.push(HirRegulation {
                        regulator,
                        target,
                        regulation_kind: kind,
                        span: conn.span.clone(),
                    });
                }
            }
            ConnectionType::Transform => {
                // `data |> function` → pipeline transform
                if conn.parts.len() >= 2 {
                    let input = self.part_name(&conn.parts[0]);
                    let func = self.part_name(&conn.parts[1]);
                    let args = conn.parts[2..].iter()
                        .map(|p| HirValue::Identifier(self.part_name(p)))
                        .collect();
                    circuit.transforms.push(HirTransform {
                        input,
                        function: func,
                        arguments: args,
                        span: conn.span.clone(),
                    });
                }
            }
        }
    }

    fn lower_genetic_part(&self, part: &ast::GeneticPart, fallback_span: &Span) -> HirPart {
        match part {
            ast::GeneticPart::Identifier(id) => {
                let pt = self.resolve_part_type(&id.name);
                HirPart {
                    name: id.name.clone(),
                    part_type: pt,
                    registry_id: None,
                    span: id.span.clone(),
                }
            }
            ast::GeneticPart::Literal(bp) => {
                let (name, pt) = self.biopart_info(bp);
                HirPart {
                    name,
                    part_type: pt,
                    registry_id: self.biopart_registry_id(bp),
                    span: fallback_span.clone(),
                }
            }
            ast::GeneticPart::FunctionCall(fc) => {
                let name = if let ast::Expr::Identifier(ref id) = *fc.function {
                    id.name.clone()
                } else {
                    "unknown_call".to_string()
                };
                HirPart {
                    name,
                    part_type: HirPartType::Unknown,
                    registry_id: None,
                    span: fc.span.clone(),
                }
            }
        }
    }

    fn resolve_part_type(&self, name: &str) -> HirPartType {
        if let Some(pt) = self.known_parts.get(name) {
            return pt.clone();
        }
        // Convention-based inference
        let lower = name.to_lowercase();
        if lower.starts_with('p') && name.chars().nth(1).map_or(false, |c| c.is_uppercase()) {
            HirPartType::Promoter
        } else if lower.starts_with("rbs") {
            HirPartType::RBS
        } else if lower.starts_with("term") || lower.starts_with("t_") {
            HirPartType::Terminator
        } else {
            HirPartType::Unknown
        }
    }

    fn biopart_info(&self, bp: &BioPart) -> (String, HirPartType) {
        match bp {
            BioPart::PLac => ("pLac".to_string(), HirPartType::Promoter),
            BioPart::PTet => ("pTet".to_string(), HirPartType::Promoter),
            BioPart::PBAD => ("pBAD".to_string(), HirPartType::Promoter),
            BioPart::PT7 => ("pT7".to_string(), HirPartType::Promoter),
            BioPart::GFP => ("GFP".to_string(), HirPartType::CDS),
            BioPart::RFP => ("RFP".to_string(), HirPartType::CDS),
            BioPart::BFP => ("BFP".to_string(), HirPartType::CDS),
            BioPart::LacI => ("LacI".to_string(), HirPartType::CDS),
            BioPart::TetR => ("TetR".to_string(), HirPartType::CDS),
            BioPart::CI => ("CI".to_string(), HirPartType::CDS),
            BioPart::Cas9 => ("Cas9".to_string(), HirPartType::CDS),
            BioPart::GRNA => ("gRNA".to_string(), HirPartType::Gene),
            BioPart::RBSStrong => ("rbs_strong".to_string(), HirPartType::RBS),
            BioPart::RBSMedium => ("rbs_medium".to_string(), HirPartType::RBS),
            BioPart::RBSWeak => ("rbs_weak".to_string(), HirPartType::RBS),
            BioPart::TermT1 => ("term_T1".to_string(), HirPartType::Terminator),
            BioPart::TermT7 => ("term_T7".to_string(), HirPartType::Terminator),
            BioPart::Custom(name) => (name.clone(), self.resolve_part_type(name)),
        }
    }

    fn biopart_registry_id(&self, bp: &BioPart) -> Option<String> {
        match bp {
            BioPart::PLac => Some("BBa_R0010".to_string()),
            BioPart::PTet => Some("BBa_R0040".to_string()),
            BioPart::PBAD => Some("BBa_I0500".to_string()),
            BioPart::RBSStrong => Some("BBa_B0034".to_string()),
            BioPart::RBSMedium => Some("BBa_B0032".to_string()),
            BioPart::TermT1 => Some("BBa_B0010".to_string()),
            _ => None,
        }
    }

    fn part_name(&self, part: &ast::GeneticPart) -> String {
        match part {
            ast::GeneticPart::Identifier(id) => id.name.clone(),
            ast::GeneticPart::Literal(bp) => self.biopart_info(bp).0,
            ast::GeneticPart::FunctionCall(fc) => {
                if let ast::Expr::Identifier(ref id) = *fc.function {
                    id.name.clone()
                } else {
                    "unknown".to_string()
                }
            }
        }
    }

    fn infer_regulation_kind(&self, regulator: &str) -> HirRegulationKind {
        match regulator {
            "LacI" | "TetR" | "CI" | "CodA" => HirRegulationKind::Repression,
            "AraC" | "LuxR" | "LasR" => HirRegulationKind::Activation,
            _ => HirRegulationKind::Inferred,
        }
    }

    fn lower_circuit_statement(&mut self, stmt: &ast::Statement, circuit: &mut HirCircuit) {
        match stmt {
            ast::Statement::Let(ls) => {
                circuit.bindings.push(HirBinding {
                    name: ls.name.name.clone(),
                    mutable: ls.is_mutable,
                    value: self.lower_expr(&ls.value),
                    span: ls.span.clone(),
                });
            }
            ast::Statement::When(ws) => {
                let condition = self.lower_expr(&ws.condition);
                let actions = ws.body.statements.iter().filter_map(|s| {
                    match s {
                        ast::Statement::Expression(expr) => {
                            self.lower_to_action(expr)
                        }
                        _ => None,
                    }
                }).collect();
                circuit.triggers.push(HirTrigger {
                    condition,
                    actions,
                    span: ws.span.clone(),
                });
            }
            ast::Statement::Connection(conn) => {
                self.lower_connection(conn, circuit);
            }
            _ => {} // Other statements are handled in function lowering
        }
    }

    fn lower_to_action(&self, expr: &ast::Expr) -> Option<HirAction> {
        match expr {
            ast::Expr::Call(fc) => {
                if let ast::Expr::Identifier(ref id) = *fc.function {
                    let args: Vec<HirValue> = fc.arguments.iter()
                        .map(|a| self.lower_expr(a))
                        .collect();
                    match id.name.as_str() {
                        "express" => {
                            let gene = fc.arguments.first()
                                .map(|a| self.expr_to_string(a))
                                .unwrap_or_default();
                            Some(HirAction::Express(gene))
                        }
                        "repress" => {
                            let gene = fc.arguments.first()
                                .map(|a| self.expr_to_string(a))
                                .unwrap_or_default();
                            Some(HirAction::Repress(gene))
                        }
                        "activate" => {
                            let gene = fc.arguments.first()
                                .map(|a| self.expr_to_string(a))
                                .unwrap_or_default();
                            Some(HirAction::Activate(gene))
                        }
                        other => Some(HirAction::Call(other.to_string(), args)),
                    }
                } else {
                    None
                }
            }
            _ => None,
        }
    }

    fn lower_gene(&self, gene: &ast::GeneDecl) -> HirGene {
        let mut props = HashMap::new();
        for p in &gene.properties {
            props.insert(p.name.name.clone(), self.lower_expr(&p.value));
        }
        HirGene {
            name: gene.name.name.clone(),
            gene_type: match gene.gene_type {
                GeneType::Protein => HirGeneType::Protein,
                GeneType::RNA => HirGeneType::RNA,
                GeneType::Regulatory => HirGeneType::Regulatory,
            },
            properties: props,
            span: gene.span.clone(),
        }
    }

    fn lower_function(&self, func: &ast::FunctionDecl) -> HirFunction {
        let params = func.params.iter().map(|p| {
            (p.name.name.clone(), self.type_ann_to_string(&p.param_type))
        }).collect();

        let body = func.body.statements.iter()
            .map(|s| self.lower_func_statement(s))
            .collect();

        HirFunction {
            name: func.name.name.clone(),
            params,
            return_type: func.return_type.as_ref().map(|t| self.type_ann_to_string(t)),
            body,
            span: func.span.clone(),
        }
    }

    fn lower_func_statement(&self, stmt: &ast::Statement) -> HirStatement {
        match stmt {
            ast::Statement::Let(ls) => HirStatement::Binding(HirBinding {
                name: ls.name.name.clone(),
                mutable: ls.is_mutable,
                value: self.lower_expr(&ls.value),
                span: ls.span.clone(),
            }),
            ast::Statement::Return(expr) => {
                HirStatement::Return(expr.as_ref().map(|e| self.lower_expr(e)))
            }
            ast::Statement::If(ifs) => HirStatement::If {
                condition: self.lower_expr(&ifs.condition),
                then_body: ifs.then_branch.statements.iter()
                    .map(|s| self.lower_func_statement(s))
                    .collect(),
                else_body: ifs.else_branch.as_ref()
                    .map(|b| b.statements.iter().map(|s| self.lower_func_statement(s)).collect())
                    .unwrap_or_default(),
            },
            ast::Statement::Expression(expr) => {
                if let ast::Expr::Call(fc) = expr {
                    if let ast::Expr::Identifier(ref id) = *fc.function {
                        let args = fc.arguments.iter().map(|a| self.lower_expr(a)).collect();
                        return HirStatement::Call(id.name.clone(), args);
                    }
                }
                HirStatement::Call("__expr__".to_string(), vec![self.lower_expr(expr)])
            }
            _ => HirStatement::Call("__noop__".to_string(), vec![]),
        }
    }

    /// Lower an AST expression to an HIR value
    fn lower_expr(&self, expr: &ast::Expr) -> HirValue {
        match expr {
            ast::Expr::Literal(lit) => match lit {
                ast::Literal::Integer(n) => HirValue::Integer(*n),
                ast::Literal::Float(f) => HirValue::Float(*f),
                ast::Literal::String(s) => HirValue::String(s.clone()),
                ast::Literal::Bool(b) => HirValue::Bool(*b),
            },
            ast::Expr::Identifier(id) => HirValue::Identifier(id.name.clone()),
            ast::Expr::BioPart(bp) => {
                let (name, pt) = self.biopart_info(bp);
                HirValue::Part(name, pt)
            }
            ast::Expr::DNASequence(seq) => HirValue::DNASequence(seq.sequence.clone()),
            ast::Expr::AminoSequence(seq) => HirValue::AminoSequence(seq.sequence.clone()),
            ast::Expr::ValueWithUnit(vwu) => {
                let unit_str = match vwu.unit {
                    ast::Unit::BasePairs => "bp",
                    ast::Unit::Kilobases => "kb",
                    ast::Unit::KiloDaltons => "kDa",
                    ast::Unit::Daltons => "Da",
                    ast::Unit::NanoMolar => "nM",
                    ast::Unit::MicroMolar => "uM",
                    ast::Unit::MilliMolar => "mM",
                    ast::Unit::Molar => "M",
                    ast::Unit::Seconds => "sec",
                    ast::Unit::Minutes => "min",
                    ast::Unit::Hours => "hr",
                    ast::Unit::ArbitraryUnits => "AU",
                    ast::Unit::Percent => "%",
                };
                HirValue::ValueWithUnit(vwu.value, unit_str.to_string())
            }
            ast::Expr::Binary(bin) => {
                let left = self.lower_expr(&bin.left);
                let right = self.lower_expr(&bin.right);
                let op = match bin.operator {
                    ast::BinaryOp::Add => "+",
                    ast::BinaryOp::Sub => "-",
                    ast::BinaryOp::Mul => "*",
                    ast::BinaryOp::Div => "/",
                    ast::BinaryOp::Mod => "%",
                    ast::BinaryOp::Eq => "==",
                    ast::BinaryOp::NotEq => "!=",
                    ast::BinaryOp::Lt => "<",
                    ast::BinaryOp::LtEq => "<=",
                    ast::BinaryOp::Gt => ">",
                    ast::BinaryOp::GtEq => ">=",
                    ast::BinaryOp::And => "&&",
                    ast::BinaryOp::Or => "||",
                    ast::BinaryOp::GeneticFlow => "->",
                    ast::BinaryOp::Regulation => "~>",
                    ast::BinaryOp::Transform => "|>",
                };
                HirValue::BinaryOp(Box::new(left), op.to_string(), Box::new(right))
            }
            ast::Expr::Unary(un) => {
                let operand = self.lower_expr(&un.operand);
                let op = match un.operator {
                    ast::UnaryOp::Neg => "-",
                    ast::UnaryOp::Not => "!",
                };
                HirValue::UnaryOp(op.to_string(), Box::new(operand))
            }
            ast::Expr::Call(fc) => {
                let name = if let ast::Expr::Identifier(ref id) = *fc.function {
                    id.name.clone()
                } else { "unknown".to_string() };
                let args = fc.arguments.iter().map(|a| self.lower_expr(a)).collect();
                HirValue::Call(name, args)
            }
            ast::Expr::FieldAccess(fa) => {
                let obj = self.lower_expr(&fa.object);
                HirValue::FieldAccess(Box::new(obj), fa.field.name.clone())
            }
            ast::Expr::Array(items) => {
                HirValue::Array(items.iter().map(|i| self.lower_expr(i)).collect())
            }
            _ => HirValue::Identifier("__unknown__".to_string()),
        }
    }

    fn expr_to_string(&self, expr: &ast::Expr) -> String {
        match expr {
            ast::Expr::Identifier(id) => id.name.clone(),
            ast::Expr::BioPart(bp) => self.biopart_info(bp).0,
            _ => format!("{:?}", expr),
        }
    }

    fn type_ann_to_string(&self, ann: &ast::TypeAnnotation) -> String {
        match ann {
            ast::TypeAnnotation::Simple(id) => id.name.clone(),
            ast::TypeAnnotation::Biological(bt) => match bt {
                ast::BioType::Promoter { .. } => "Promoter".to_string(),
                ast::BioType::RBS { .. } => "RBS".to_string(),
                ast::BioType::Protein { .. } => "Protein".to_string(),
                ast::BioType::Terminator { .. } => "Terminator".to_string(),
                ast::BioType::Gene => "Gene".to_string(),
                ast::BioType::Circuit => "Circuit".to_string(),
                ast::BioType::DNA => "DNA".to_string(),
                ast::BioType::RNA => "RNA".to_string(),
            },
            ast::TypeAnnotation::Generic(id, args) => {
                let arg_str = args.iter().map(|a| self.type_ann_to_string(a)).collect::<Vec<_>>().join(", ");
                format!("{}<{}>", id.name, arg_str)
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::compiler::parser::Parser;

    #[test]
    fn test_hir_lowering_circuit() {
        let source = "circuit Test { }";
        let mut parser = Parser::new(source).unwrap();
        let program = parser.parse_program().unwrap();
        let mut lowering = HirLowering::new();
        let hir = lowering.lower(&program);
        assert_eq!(hir.circuits.len(), 1);
        assert_eq!(hir.circuits[0].name, "Test");
    }
}
