#![allow(dead_code)]
//! Lexer para BioScript
//! Tokeniza código fuente en tokens para el parser

use logos::Logos;
use std::ops::Range;

/// Tokens del lenguaje BioScript
#[derive(Logos, Debug, Clone, PartialEq)]
#[logos(skip r"[ \t\r\n\f]+")] // Ignorar espacios en blanco
pub enum Token {
    // ===== Comentarios =====
    #[regex(r"//[^\n]*", |_| ())]
    LineComment,

    #[regex(r"///[^\n]*", |lex| lex.slice().to_string())]
    DocComment(String),

    // ===== Palabras clave de control =====
    #[token("if")]
    If,
    #[token("else")]
    Else,
    #[token("when")]
    When,
    #[token("match")]
    Match,
    #[token("for")]
    For,
    #[token("while")]
    While,
    #[token("loop")]
    Loop,
    #[token("return")]
    Return,
    #[token("break")]
    Break,
    #[token("continue")]
    Continue,

    // ===== Palabras clave de declaración =====
    #[token("let")]
    Let,
    #[token("mut")]
    Mut,
    #[token("const")]
    Const,
    #[token("fn")]
    Fn,
    #[token("struct")]
    Struct,
    #[token("enum")]
    Enum,
    #[token("impl")]
    Impl,
    #[token("trait")]
    Trait,
    #[token("module")]
    Module,
    #[token("import")]
    Import,
    #[token("export")]
    Export,
    #[token("pub")]
    Pub,
    #[token("use")]
    Use,

    // ===== Palabras clave biológicas =====
    #[token("circuit")]
    Circuit,
    #[token("gene")]
    Gene,
    #[token("operon")]
    Operon,
    #[token("plasmid")]
    Plasmid,
    #[token("chassis")]
    Chassis,
    #[token("host")]
    Host,
    #[token("express")]
    Express,
    #[token("repress")]
    Repress,
    #[token("activate")]
    Activate,
    #[token("inhibit")]
    Inhibit,
    #[token("secrete")]
    Secrete,
    #[token("sense")]
    Sense,
    #[token("bind")]
    Bind,

    // ===== Palabras clave de seguridad =====
    #[token("safe")]
    Safe,
    #[token("unsafe")]
    Unsafe,
    #[token("contained")]
    Contained,
    #[token("kill_switch")]
    KillSwitch,

    // ===== Tipos biológicos =====
    #[token("Promoter")]
    TypePromoter,
    #[token("RBS")]
    TypeRBS,
    #[token("CDS")]
    TypeCDS,
    #[token("Terminator")]
    TypeTerminator,
    #[token("Gene")]
    TypeGene,
    #[token("Protein")]
    TypeProtein,
    #[token("RNA")]
    TypeRNA,
    #[token("DNA")]
    TypeDNA,
    #[token("Riboswitch")]
    TypeRiboswitch,
    #[token("Aptamer")]
    TypeAptamer,

    // ===== Tipos de circuito =====
    #[token("Circuit")]
    TypeCircuit,
    #[token("Gate")]
    TypeGate,
    #[token("AND")]
    GateAnd,
    #[token("OR")]
    GateOr,
    #[token("NOT")]
    GateNot,
    #[token("NOR")]
    GateNor,
    #[token("NAND")]
    GateNand,
    #[token("XOR")]
    GateXor,

    // ===== Tipos regulatorios =====
    #[token("Activator")]
    TypeActivator,
    #[token("Repressor")]
    TypeRepressor,
    #[token("Inducer")]
    TypeInducer,
    #[token("Operator")]
    TypeOperator,

    // ===== Literales =====
    #[regex(r"[0-9]+\.[0-9]+([eE][+-]?[0-9]+)?", |lex| lex.slice().parse::<f64>().ok())]
    Float(f64),

    #[regex(r"[0-9]+", |lex| lex.slice().parse::<i64>().ok())]
    Integer(i64),

    #[regex(r#""([^"\\]|\\.)*""#, |lex| {
        let s = lex.slice();
        s[1..s.len()-1].to_string()
    })]
    String(String),

    // ===== Secuencias biológicas =====
    #[token("seq")]
    SeqKeyword,

    #[token("aa")]
    AminoAcidKeyword,

    // Secuencias de ADN (mínimo 10 bases para evitar conflicto con identificadores)
    #[regex(r"[ATGCatgc]{10,}", priority = 10, callback = |lex| lex.slice().to_uppercase())]
    DNASequence(String),

    // ===== Unidades =====
    #[token("bp")]
    UnitBp,
    #[token("kb")]
    UnitKb,
    #[token("kDa")]
    UnitKDa,
    #[token("nM")]
    UnitNM,
    #[token("uM")]
    UnitUM,
    #[token("mM")]
    UnitMM,
    #[token("hr")]
    UnitHr,
    #[token("min")]
    UnitMin,
    #[token("sec")]
    UnitSec,

    // ===== Partes biológicas conocidas =====
    #[token("pLac")]
    PartPLac,
    #[token("pTet")]
    PartPTet,
    #[token("pBAD")]
    PartPBAD,
    #[token("pT7")]
    PartPT7,
    #[token("GFP")]
    PartGFP,
    #[token("RFP")]
    PartRFP,
    #[token("LacI")]
    PartLacI,
    #[token("TetR")]
    PartTetR,
    #[token("Cas9")]
    PartCas9,
    #[token("gRNA")]
    PartGRNA,

    // ===== Operadores =====
    #[token("->")]
    Arrow,
    #[token("=>")]
    FatArrow,
    #[token("~>")]
    TildeArrow, // Represión/regulación
    #[token("|>")]
    PipeRight,
    #[token("<|")]
    PipeLeft,

    #[token("+")]
    Plus,
    #[token("-")]
    Minus,
    #[token("*")]
    Star,
    #[token("/")]
    Slash,
    #[token("%")]
    Percent,

    #[token("==")]
    EqEq,
    #[token("!=")]
    NotEq,
    #[token("<=")]
    LtEq,
    #[token(">=")]
    GtEq,
    #[token("<")]
    Lt,
    #[token(">")]
    Gt,

    #[token("&&")]
    AndAnd,
    #[token("||")]
    OrOr,
    #[token("!")]
    Not,

    #[token("=")]
    Eq,
    #[token("+=")]
    PlusEq,
    #[token("-=")]
    MinusEq,

    // ===== Delimitadores =====
    #[token("(")]
    LParen,
    #[token(")")]
    RParen,
    #[token("{")]
    LBrace,
    #[token("}")]
    RBrace,
    #[token("[")]
    LBracket,
    #[token("]")]
    RBracket,

    #[token(":")]
    Colon,
    #[token("::")]
    ColonColon,
    #[token(";")]
    Semicolon,
    #[token(",")]
    Comma,
    #[token(".")]
    Dot,

    // ===== Identificadores =====
    #[regex(r"[a-zA-Z_][a-zA-Z0-9_]*", |lex| lex.slice().to_string())]
    Identifier(String),
}

/// Un token con su posición en el código fuente
#[derive(Debug, Clone)]
pub struct SpannedToken {
    pub token: Token,
    pub span: Range<usize>,
    pub line: usize,
    pub column: usize,
}

/// Lexer que produce tokens con información de posición
pub struct Lexer<'source> {
    inner: logos::Lexer<'source, Token>,
    source: &'source str,
    line: usize,
    line_start: usize,
}

impl<'source> Lexer<'source> {
    pub fn new(source: &'source str) -> Self {
        Self {
            inner: Token::lexer(source),
            source,
            line: 1,
            line_start: 0,
        }
    }

    /// Tokeniza todo el código fuente
    pub fn tokenize(source: &str) -> Result<Vec<SpannedToken>, LexerError> {
        let mut lexer = Lexer::new(source);
        let mut tokens = Vec::new();

        while let Some(spanned) = lexer.next_token()? {
            // Line comments and `///` doc comments are not part of the grammar.
            if !matches!(spanned.token, Token::LineComment | Token::DocComment(_)) {
                tokens.push(spanned);
            }
        }

        Ok(tokens)
    }

    fn next_token(&mut self) -> Result<Option<SpannedToken>, LexerError> {
        // Actualizar línea y columna
        let scan_start = self.line_start;
        let scan_end = self.inner.span().start;
        // `i` from `chars().enumerate()` is a character index, not a byte
        // offset. A multi-byte character such as '═' then makes the next
        // slice panic. Walk byte offsets with `char_indices` instead.
        if scan_end >= scan_start && scan_end <= self.source.len() {
            for (offset, c) in self.source[scan_start..scan_end].char_indices() {
                if c == '\n' {
                    self.line += 1;
                    self.line_start = scan_start + offset + c.len_utf8();
                }
            }
        }

        match self.inner.next() {
            Some(Ok(token)) => {
                let span = self.inner.span();
                let column = span.start - self.line_start + 1;

                Ok(Some(SpannedToken {
                    token,
                    span,
                    line: self.line,
                    column,
                }))
            }
            Some(Err(_)) => {
                let span = self.inner.span();
                let bad_token = &self.source[span.clone()];
                Err(LexerError::InvalidToken {
                    token: bad_token.to_string(),
                    line: self.line,
                    column: span.start - self.line_start + 1,
                })
            }
            None => Ok(None),
        }
    }
}

/// Errores del lexer
#[derive(Debug, thiserror::Error)]
pub enum LexerError {
    #[error("Token inválido '{token}' en línea {line}, columna {column}")]
    InvalidToken {
        token: String,
        line: usize,
        column: usize,
    },
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_basic_tokens() {
        let source = "let x = 42;";
        let tokens = Lexer::tokenize(source).unwrap();

        assert!(matches!(tokens[0].token, Token::Let));
        assert!(matches!(tokens[1].token, Token::Identifier(ref s) if s == "x"));
        assert!(matches!(tokens[2].token, Token::Eq));
        assert!(matches!(tokens[3].token, Token::Integer(42)));
        assert!(matches!(tokens[4].token, Token::Semicolon));
    }

    #[test]
    fn test_circuit_tokens() {
        let source = "circuit MyCircuit { pLac -> GFP }";
        let tokens = Lexer::tokenize(source).unwrap();

        assert!(matches!(tokens[0].token, Token::Circuit));
        assert!(matches!(tokens[2].token, Token::LBrace));
        assert!(matches!(tokens[3].token, Token::PartPLac));
        assert!(matches!(tokens[4].token, Token::Arrow));
        assert!(matches!(tokens[5].token, Token::PartGFP));
    }

    #[test]
    fn test_biological_operators() {
        let source = "gene ~> repress(promoter)";
        let tokens = Lexer::tokenize(source).unwrap();

        assert!(matches!(tokens[0].token, Token::Gene));
        assert!(matches!(tokens[1].token, Token::TildeArrow));
        assert!(matches!(tokens[2].token, Token::Repress));
    }

    #[test]
    fn test_box_drawing_comment_does_not_panic() {
        let source = "// ════ SynBio ════\ncircuit X { }\n";
        let tokens = Lexer::tokenize(source).unwrap();
        assert!(matches!(tokens[0].token, Token::Circuit));
    }

    #[test]
    fn test_doc_comments_are_skipped() {
        let source = "/// documented circuit\ncircuit X { }";
        let tokens = Lexer::tokenize(source).unwrap();
        assert!(matches!(tokens[0].token, Token::Circuit));
    }
}
