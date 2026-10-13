#![allow(dead_code)]
//! AST (Abstract Syntax Tree) para BioScript
//! Define la estructura del árbol de sintaxis para representar programas

use std::ops::Range;

/// Span de código fuente
pub type Span = Range<usize>;

/// Identificador con información de posición
#[derive(Debug, Clone, PartialEq)]
pub struct Ident {
    pub name: String,
    pub span: Span,
}

impl Ident {
    pub fn new(name: impl Into<String>, span: Span) -> Self {
        Self { name: name.into(), span }
    }
}

/// Programa BioScript completo
#[derive(Debug, Clone)]
pub struct Program {
    pub items: Vec<Item>,
    pub span: Span,
}

/// Item de nivel superior
#[derive(Debug, Clone)]
pub enum Item {
    /// Importación: `import { GFP, RFP } from "reporters"`
    Import(ImportDecl),
    
    /// Declaración de chassis: `chassis EcoliDH5Alpha: Host { ... }`
    Chassis(ChassisDecl),
    
    /// Circuito genético: `circuit MyCircuit { ... }`
    Circuit(CircuitDecl),
    
    /// Definición de gen: `gene MyGene: Protein { ... }`
    Gene(GeneDecl),
    
    /// Función: `fn main() { ... }`
    Function(FunctionDecl),
    
    /// Constante: `const MAX_ATP = 100;`
    Const(ConstDecl),
    
    /// Struct: `struct MyProtein { ... }`
    Struct(StructDecl),
}

/// Declaración de importación
#[derive(Debug, Clone)]
pub struct ImportDecl {
    pub items: Vec<Ident>,
    pub source: String,
    pub span: Span,
}

/// Declaración de organismo huésped (chassis)
#[derive(Debug, Clone)]
pub struct ChassisDecl {
    pub name: Ident,
    pub host_type: Ident,
    pub properties: Vec<ChassisProperty>,
    pub span: Span,
}

#[derive(Debug, Clone)]
pub struct ChassisProperty {
    pub name: Ident,
    pub value: Expr,
    pub span: Span,
}

/// Declaración de circuito genético
#[derive(Debug, Clone)]
pub struct CircuitDecl {
    pub is_safe: bool,
    pub name: Ident,
    pub body: CircuitBody,
    pub span: Span,
}

#[derive(Debug, Clone)]
pub struct CircuitBody {
    pub kill_switch: Option<KillSwitch>,
    pub statements: Vec<Statement>,
    pub connections: Vec<GeneticConnection>,
    pub span: Span,
}

/// Interruptor de seguridad (kill switch)
#[derive(Debug, Clone)]
pub struct KillSwitch {
    pub trigger: Expr,
    pub mechanism: Ident,
    pub delay: Option<ValueWithUnit>,
    pub span: Span,
}

/// Conexión genética: `promoter -> rbs -> gene -> terminator`
#[derive(Debug, Clone)]
pub struct GeneticConnection {
    pub parts: Vec<GeneticPart>,
    pub connection_type: ConnectionType,
    pub span: Span,
}

#[derive(Debug, Clone)]
pub enum ConnectionType {
    /// `->` Flujo de transcripción
    Transcription,
    /// `~>` Regulación (represión/activación)
    Regulation,
    /// `|>` Transformación
    Transform,
}

/// Parte genética en una conexión
#[derive(Debug, Clone)]
pub enum GeneticPart {
    Identifier(Ident),
    FunctionCall(FunctionCall),
    Literal(BioPart),
}

/// Parte biológica predefinida
#[derive(Debug, Clone)]
pub enum BioPart {
    // Promotores
    PLac,
    PTet,
    PBAD,
    PT7,
    
    // Reporteros
    GFP,
    RFP,
    BFP,
    
    // Represores
    LacI,
    TetR,
    CI,
    
    // CRISPR
    Cas9,
    GRNA,
    
    // RBS
    RBSStrong,
    RBSMedium,
    RBSWeak,
    
    // Terminadores
    TermT1,
    TermT7,
    
    // Custom
    Custom(String),
}

/// Declaración de gen
#[derive(Debug, Clone)]
pub struct GeneDecl {
    pub name: Ident,
    pub gene_type: GeneType,
    pub properties: Vec<GeneProperty>,
    pub span: Span,
}

#[derive(Debug, Clone)]
pub enum GeneType {
    Protein,
    RNA,
    Regulatory,
}

#[derive(Debug, Clone)]
pub struct GeneProperty {
    pub name: Ident,
    pub value: Expr,
    pub span: Span,
}

/// Declaración de función
#[derive(Debug, Clone)]
pub struct FunctionDecl {
    pub name: Ident,
    pub params: Vec<Parameter>,
    pub return_type: Option<TypeAnnotation>,
    pub body: Block,
    pub span: Span,
}

#[derive(Debug, Clone)]
pub struct Parameter {
    pub name: Ident,
    pub param_type: TypeAnnotation,
    pub span: Span,
}

/// Declaración de constante
#[derive(Debug, Clone)]
pub struct ConstDecl {
    pub name: Ident,
    pub const_type: Option<TypeAnnotation>,
    pub value: Expr,
    pub span: Span,
}

/// Declaración de struct
#[derive(Debug, Clone)]
pub struct StructDecl {
    pub name: Ident,
    pub fields: Vec<StructField>,
    pub span: Span,
}

#[derive(Debug, Clone)]
pub struct StructField {
    pub name: Ident,
    pub field_type: TypeAnnotation,
    pub span: Span,
}

/// Anotación de tipo
#[derive(Debug, Clone)]
pub enum TypeAnnotation {
    /// Tipos simples: `Promoter`, `Protein`, `i32`
    Simple(Ident),
    
    /// Tipos genéricos: `Vec<Gene>`
    Generic(Ident, Vec<TypeAnnotation>),
    
    /// Tipos biológicos con atributos
    Biological(BioType),
}

#[derive(Debug, Clone)]
pub enum BioType {
    Promoter { strength: Option<f64>, regulation: Option<String> },
    RBS { translation_rate: Option<f64> },
    Protein { molecular_weight: Option<f64>, toxicity: Option<ToxicityLevel> },
    Terminator { efficiency: Option<f64> },
    Gene,
    Circuit,
    DNA,
    RNA,
}

#[derive(Debug, Clone)]
pub enum ToxicityLevel {
    None,
    Low,
    Medium,
    High,
    Lethal,
}

/// Bloque de código
#[derive(Debug, Clone)]
pub struct Block {
    pub statements: Vec<Statement>,
    pub span: Span,
}

/// Statement (declaración/instrucción)
#[derive(Debug, Clone)]
pub enum Statement {
    /// Declaración de variable: `let x = 5;`
    Let(LetStatement),
    
    /// Expresión: `express(GFP);`
    Expression(Expr),
    
    /// Condicional: `if condition { ... }`
    If(IfStatement),
    
    /// When (trigger biológico): `when sensor.activated { ... }`
    When(WhenStatement),
    
    /// Match: `match state { ... }`
    Match(MatchStatement),
    
    /// Loop: `for`, `while`, `loop`
    Loop(LoopStatement),
    
    /// Return: `return value;`
    Return(Option<Expr>),
    
    /// Conexión genética: `promoter -> gene -> terminator`
    Connection(GeneticConnection),
}

#[derive(Debug, Clone)]
pub struct LetStatement {
    pub is_mutable: bool,
    pub name: Ident,
    pub var_type: Option<TypeAnnotation>,
    pub value: Expr,
    pub span: Span,
}

#[derive(Debug, Clone)]
pub struct IfStatement {
    pub condition: Expr,
    pub then_branch: Block,
    pub else_branch: Option<Block>,
    pub span: Span,
}

#[derive(Debug, Clone)]
pub struct WhenStatement {
    pub condition: Expr,
    pub body: Block,
    pub span: Span,
}

#[derive(Debug, Clone)]
pub struct MatchStatement {
    pub expr: Expr,
    pub arms: Vec<MatchArm>,
    pub span: Span,
}

#[derive(Debug, Clone)]
pub struct MatchArm {
    pub pattern: Pattern,
    pub body: Expr,
    pub span: Span,
}

#[derive(Debug, Clone)]
pub enum Pattern {
    Identifier(Ident),
    Literal(Literal),
    Wildcard,
    Path(Vec<Ident>),
}

#[derive(Debug, Clone)]
pub enum LoopStatement {
    For {
        var: Ident,
        iterable: Expr,
        body: Block,
        span: Span,
    },
    While {
        condition: Expr,
        body: Block,
        span: Span,
    },
    Loop {
        body: Block,
        span: Span,
    },
}

/// Expresión
#[derive(Debug, Clone)]
pub enum Expr {
    /// Literal: `42`, `"hello"`, `3.14`
    Literal(Literal),
    
    /// Identificador: `myVar`
    Identifier(Ident),
    
    /// Secuencia de ADN: `seq { ATGCGATCG }`
    DNASequence(DNASequence),
    
    /// Secuencia de aminoácidos: `aa { MKFLILF }`
    AminoSequence(AminoSequence),
    
    /// Valor con unidad: `10 mM`, `25 kDa`
    ValueWithUnit(ValueWithUnit),
    
    /// Operación binaria: `a + b`
    Binary(BinaryExpr),
    
    /// Operación unaria: `!x`, `-y`
    Unary(UnaryExpr),
    
    /// Llamada a función: `express(GFP)`
    Call(FunctionCall),
    
    /// Acceso a campo: `protein.weight`
    FieldAccess(FieldAccess),
    
    /// Acceso a índice: `genes[0]`
    IndexAccess(IndexAccess),
    
    /// Construcción de struct: `Promoter { strength: 0.8 }`
    StructInit(StructInit),
    
    /// Array: `[GFP, RFP, BFP]`
    Array(Vec<Expr>),
    
    /// Bloque: `{ ... }`
    Block(Block),
    
    /// Parte biológica: `pLac`, `GFP`
    BioPart(BioPart),
}

#[derive(Debug, Clone)]
pub enum Literal {
    Integer(i64),
    Float(f64),
    String(String),
    Bool(bool),
}

#[derive(Debug, Clone)]
pub struct DNASequence {
    pub sequence: String,
    pub span: Span,
}

impl DNASequence {
    /// Valida que la secuencia solo contenga nucleótidos válidos
    pub fn validate(&self) -> Result<(), String> {
        for (i, c) in self.sequence.chars().enumerate() {
            if !matches!(c, 'A' | 'T' | 'G' | 'C' | 'a' | 't' | 'g' | 'c') {
                return Err(format!(
                    "Nucleótido inválido '{}' en posición {}",
                    c, i
                ));
            }
        }
        Ok(())
    }
    
    /// Calcula el contenido GC
    pub fn gc_content(&self) -> f64 {
        let gc = self.sequence.chars()
            .filter(|c| matches!(c, 'G' | 'C' | 'g' | 'c'))
            .count();
        gc as f64 / self.sequence.len() as f64
    }
    
    /// Obtiene el complemento reverso
    pub fn reverse_complement(&self) -> String {
        self.sequence.chars().rev().map(|c| match c {
            'A' | 'a' => 'T',
            'T' | 't' => 'A',
            'G' | 'g' => 'C',
            'C' | 'c' => 'G',
            _ => c,
        }).collect()
    }
}

#[derive(Debug, Clone)]
pub struct AminoSequence {
    pub sequence: String,
    pub span: Span,
}

#[derive(Debug, Clone)]
pub struct ValueWithUnit {
    pub value: f64,
    pub unit: Unit,
    pub span: Span,
}

#[derive(Debug, Clone, PartialEq)]
pub enum Unit {
    // Longitud
    BasePairs,      // bp
    Kilobases,      // kb
    
    // Masa
    KiloDaltons,    // kDa
    Daltons,        // Da
    
    // Concentración
    NanoMolar,      // nM
    MicroMolar,     // uM
    MilliMolar,     // mM
    Molar,          // M
    
    // Tiempo
    Seconds,        // sec
    Minutes,        // min
    Hours,          // hr
    
    // Otros
    ArbitraryUnits, // AU
    Percent,        // %
}

#[derive(Debug, Clone)]
pub struct BinaryExpr {
    pub left: Box<Expr>,
    pub operator: BinaryOp,
    pub right: Box<Expr>,
    pub span: Span,
}

#[derive(Debug, Clone, PartialEq)]
pub enum BinaryOp {
    // Aritméticos
    Add,
    Sub,
    Mul,
    Div,
    Mod,
    
    // Comparación
    Eq,
    NotEq,
    Lt,
    LtEq,
    Gt,
    GtEq,
    
    // Lógicos
    And,
    Or,
    
    // Biológicos
    GeneticFlow,    // ->
    Regulation,     // ~>
    Transform,      // |>
}

#[derive(Debug, Clone)]
pub struct UnaryExpr {
    pub operator: UnaryOp,
    pub operand: Box<Expr>,
    pub span: Span,
}

#[derive(Debug, Clone)]
pub enum UnaryOp {
    Neg,    // -
    Not,    // !
}

#[derive(Debug, Clone)]
pub struct FunctionCall {
    pub function: Box<Expr>,
    pub arguments: Vec<Expr>,
    pub span: Span,
}

#[derive(Debug, Clone)]
pub struct FieldAccess {
    pub object: Box<Expr>,
    pub field: Ident,
    pub span: Span,
}

#[derive(Debug, Clone)]
pub struct IndexAccess {
    pub object: Box<Expr>,
    pub index: Box<Expr>,
    pub span: Span,
}

#[derive(Debug, Clone)]
pub struct StructInit {
    pub struct_name: Ident,
    pub fields: Vec<StructFieldInit>,
    pub span: Span,
}

#[derive(Debug, Clone)]
pub struct StructFieldInit {
    pub name: Ident,
    pub value: Expr,
    pub span: Span,
}
