//! Parser para BioScript
//! Convierte tokens en un AST

use crate::compiler::lexer::{Token, SpannedToken, Lexer, LexerError};
use crate::compiler::ast::*;

/// Resultado del parser
pub type ParseResult<T> = Result<T, ParseError>;

/// Parser de BioScript
pub struct Parser {
    tokens: Vec<SpannedToken>,
    position: usize,
}

impl Parser {
    /// Crea un nuevo parser desde código fuente
    pub fn new(source: &str) -> Result<Self, LexerError> {
        let tokens = Lexer::tokenize(source)?;
        Ok(Self { tokens, position: 0 })
    }
    
    /// Parsea un programa completo
    pub fn parse_program(&mut self) -> ParseResult<Program> {
        let start = self.current_span().start;
        let mut items = Vec::new();
        
        while !self.is_at_end() {
            items.push(self.parse_item()?);
        }
        
        let end = if items.is_empty() { start } else { 
            self.tokens.last().map(|t| t.span.end).unwrap_or(start)
        };
        
        Ok(Program {
            items,
            span: start..end,
        })
    }
    
    /// Parsea un item de nivel superior
    fn parse_item(&mut self) -> ParseResult<Item> {
        match self.current_token() {
            Some(Token::Import) => Ok(Item::Import(self.parse_import()?)),
            Some(Token::Chassis) => Ok(Item::Chassis(self.parse_chassis()?)),
            Some(Token::Safe) | Some(Token::Circuit) => Ok(Item::Circuit(self.parse_circuit()?)),
            Some(Token::Gene) => Ok(Item::Gene(self.parse_gene_decl()?)),
            Some(Token::Fn) => Ok(Item::Function(self.parse_function()?)),
            Some(Token::Const) => Ok(Item::Const(self.parse_const()?)),
            Some(Token::Struct) => Ok(Item::Struct(self.parse_struct()?)),
            Some(token) => Err(self.error(format!(
                "Se esperaba declaración de nivel superior, encontrado {:?}",
                token
            ))),
            None => Err(self.error("Fin inesperado del archivo".to_string())),
        }
    }
    
    /// Parsea una importación
    fn parse_import(&mut self) -> ParseResult<ImportDecl> {
        let start = self.current_span().start;
        self.expect(Token::Import)?;
        
        self.expect(Token::LBrace)?;
        let mut items = Vec::new();
        
        loop {
            if let Some(Token::Identifier(name)) = self.current_token().cloned() {
                let span = self.current_span();
                items.push(Ident::new(name, span));
                self.advance();
            }
            
            if !self.check(&Token::Comma) {
                break;
            }
            self.advance(); // consume comma
        }
        
        self.expect(Token::RBrace)?;
        
        // Esperar "from"
        if let Some(Token::Identifier(ref s)) = self.current_token() {
            if s == "from" {
                self.advance();
            } else {
                return Err(self.error("Se esperaba 'from'".to_string()));
            }
        }
        
        let source = match self.current_token() {
            Some(Token::String(s)) => {
                let s = s.clone();
                self.advance();
                s
            }
            _ => return Err(self.error("Se esperaba string de origen".to_string())),
        };
        
        self.expect(Token::Semicolon)?;
        
        Ok(ImportDecl {
            items,
            source,
            span: start..self.previous_span().end,
        })
    }
    
    /// Parsea declaración de chassis
    fn parse_chassis(&mut self) -> ParseResult<ChassisDecl> {
        let start = self.current_span().start;
        self.expect(Token::Chassis)?;
        
        let name = self.parse_identifier()?;
        self.expect(Token::Colon)?;
        let host_type = self.parse_identifier()?;
        
        self.expect(Token::LBrace)?;
        let properties = self.parse_chassis_properties()?;
        self.expect(Token::RBrace)?;
        
        Ok(ChassisDecl {
            name,
            host_type,
            properties,
            span: start..self.previous_span().end,
        })
    }
    
    fn parse_chassis_properties(&mut self) -> ParseResult<Vec<ChassisProperty>> {
        let mut properties = Vec::new();
        
        while !self.check(&Token::RBrace) && !self.is_at_end() {
            let start = self.current_span().start;
            let name = self.parse_identifier()?;
            self.expect(Token::Colon)?;
            let value = self.parse_expression()?;
            
            // Comma o newline opcional
            self.try_consume(&Token::Comma);
            
            properties.push(ChassisProperty {
                name,
                value,
                span: start..self.previous_span().end,
            });
        }
        
        Ok(properties)
    }
    
    /// Parsea un circuito genético
    fn parse_circuit(&mut self) -> ParseResult<CircuitDecl> {
        let start = self.current_span().start;
        
        let is_safe = if self.check(&Token::Safe) {
            self.advance();
            true
        } else {
            false
        };
        
        self.expect(Token::Circuit)?;
        let name = self.parse_identifier()?;
        
        self.expect(Token::LBrace)?;
        let body = self.parse_circuit_body()?;
        self.expect(Token::RBrace)?;
        
        Ok(CircuitDecl {
            is_safe,
            name,
            body,
            span: start..self.previous_span().end,
        })
    }
    
    fn parse_circuit_body(&mut self) -> ParseResult<CircuitBody> {
        let start = self.current_span().start;
        let mut kill_switch = None;
        let mut statements = Vec::new();
        let mut connections = Vec::new();
        
        while !self.check(&Token::RBrace) && !self.is_at_end() {
            // Kill switch
            if self.check(&Token::KillSwitch) {
                kill_switch = Some(self.parse_kill_switch()?);
                continue;
            }
            
            // Statement normal
            let stmt = self.parse_statement()?;
            
            // Detectar si es una conexión genética
            if let Statement::Connection(conn) = stmt {
                connections.push(conn);
            } else {
                statements.push(stmt);
            }
        }
        
        Ok(CircuitBody {
            kill_switch,
            statements,
            connections,
            span: start..self.current_span().start,
        })
    }
    
    fn parse_kill_switch(&mut self) -> ParseResult<KillSwitch> {
        let start = self.current_span().start;
        self.expect(Token::KillSwitch)?;
        self.expect(Token::LBrace)?;
        
        let mut trigger = None;
        let mut mechanism = None;
        let mut delay = None;
        
        while !self.check(&Token::RBrace) && !self.is_at_end() {
            let prop_name = self.parse_identifier()?;
            self.expect(Token::Colon)?;
            
            match prop_name.name.as_str() {
                "trigger" => {
                    trigger = Some(self.parse_expression()?);
                }
                "mechanism" => {
                    mechanism = Some(self.parse_identifier()?);
                }
                "delay" => {
                    delay = Some(self.parse_value_with_unit()?);
                }
                _ => return Err(self.error(format!(
                    "Propiedad desconocida de kill_switch: {}",
                    prop_name.name
                ))),
            }
            
            self.try_consume(&Token::Comma);
        }
        
        self.expect(Token::RBrace)?;
        
        Ok(KillSwitch {
            trigger: trigger.ok_or_else(|| self.error("kill_switch requiere 'trigger'".to_string()))?,
            mechanism: mechanism.ok_or_else(|| self.error("kill_switch requiere 'mechanism'".to_string()))?,
            delay,
            span: start..self.previous_span().end,
        })
    }
    
    /// Parsea una declaración de gen
    fn parse_gene_decl(&mut self) -> ParseResult<GeneDecl> {
        let start = self.current_span().start;
        self.expect(Token::Gene)?;
        
        let name = self.parse_identifier()?;
        self.expect(Token::Colon)?;
        
        let gene_type = match self.current_token() {
            Some(Token::TypeProtein) => { self.advance(); GeneType::Protein }
            Some(Token::TypeRNA) => { self.advance(); GeneType::RNA }
            _ => GeneType::Protein,
        };
        
        self.expect(Token::LBrace)?;
        let properties = self.parse_gene_properties()?;
        self.expect(Token::RBrace)?;
        
        Ok(GeneDecl {
            name,
            gene_type,
            properties,
            span: start..self.previous_span().end,
        })
    }
    
    fn parse_gene_properties(&mut self) -> ParseResult<Vec<GeneProperty>> {
        let mut properties = Vec::new();
        
        while !self.check(&Token::RBrace) && !self.is_at_end() {
            let start = self.current_span().start;
            let name = self.parse_identifier()?;
            self.expect(Token::Colon)?;
            let value = self.parse_expression()?;
            
            self.try_consume(&Token::Comma);
            
            properties.push(GeneProperty {
                name,
                value,
                span: start..self.previous_span().end,
            });
        }
        
        Ok(properties)
    }
    
    /// Parsea una función
    fn parse_function(&mut self) -> ParseResult<FunctionDecl> {
        let start = self.current_span().start;
        self.expect(Token::Fn)?;
        
        let name = self.parse_identifier()?;
        
        self.expect(Token::LParen)?;
        let params = self.parse_parameters()?;
        self.expect(Token::RParen)?;
        
        let return_type = if self.check(&Token::Arrow) {
            self.advance();
            Some(self.parse_type_annotation()?)
        } else {
            None
        };
        
        let body = self.parse_block()?;
        
        Ok(FunctionDecl {
            name,
            params,
            return_type,
            body,
            span: start..self.previous_span().end,
        })
    }
    
    fn parse_parameters(&mut self) -> ParseResult<Vec<Parameter>> {
        let mut params = Vec::new();
        
        while !self.check(&Token::RParen) && !self.is_at_end() {
            let start = self.current_span().start;
            let name = self.parse_identifier()?;
            self.expect(Token::Colon)?;
            let param_type = self.parse_type_annotation()?;
            
            params.push(Parameter {
                name,
                param_type,
                span: start..self.previous_span().end,
            });
            
            if !self.check(&Token::RParen) {
                self.expect(Token::Comma)?;
            }
        }
        
        Ok(params)
    }
    
    /// Parsea constante
    fn parse_const(&mut self) -> ParseResult<ConstDecl> {
        let start = self.current_span().start;
        self.expect(Token::Const)?;
        
        let name = self.parse_identifier()?;
        
        let const_type = if self.check(&Token::Colon) {
            self.advance();
            Some(self.parse_type_annotation()?)
        } else {
            None
        };
        
        self.expect(Token::Eq)?;
        let value = self.parse_expression()?;
        self.expect(Token::Semicolon)?;
        
        Ok(ConstDecl {
            name,
            const_type,
            value,
            span: start..self.previous_span().end,
        })
    }
    
    /// Parsea struct
    fn parse_struct(&mut self) -> ParseResult<StructDecl> {
        let start = self.current_span().start;
        self.expect(Token::Struct)?;
        
        let name = self.parse_identifier()?;
        self.expect(Token::LBrace)?;
        
        let mut fields = Vec::new();
        while !self.check(&Token::RBrace) && !self.is_at_end() {
            let field_start = self.current_span().start;
            let field_name = self.parse_identifier()?;
            self.expect(Token::Colon)?;
            let field_type = self.parse_type_annotation()?;
            
            self.try_consume(&Token::Comma);
            
            fields.push(StructField {
                name: field_name,
                field_type,
                span: field_start..self.previous_span().end,
            });
        }
        
        self.expect(Token::RBrace)?;
        
        Ok(StructDecl {
            name,
            fields,
            span: start..self.previous_span().end,
        })
    }
    
    /// Parsea un statement
    fn parse_statement(&mut self) -> ParseResult<Statement> {
        match self.current_token() {
            Some(Token::Let) => Ok(Statement::Let(self.parse_let()?)),
            Some(Token::If) => Ok(Statement::If(self.parse_if()?)),
            Some(Token::When) => Ok(Statement::When(self.parse_when()?)),
            Some(Token::Match) => Ok(Statement::Match(self.parse_match()?)),
            Some(Token::For) => Ok(Statement::Loop(self.parse_for()?)),
            Some(Token::While) => Ok(Statement::Loop(self.parse_while()?)),
            Some(Token::Loop) => Ok(Statement::Loop(self.parse_loop()?)),
            Some(Token::Return) => {
                self.advance();
                let expr = if !self.check(&Token::Semicolon) {
                    Some(self.parse_expression()?)
                } else {
                    None
                };
                self.expect(Token::Semicolon)?;
                Ok(Statement::Return(expr))
            }
            _ => {
                let expr = self.parse_expression()?;
                
                // Verificar si es una conexión genética
                if self.check(&Token::Arrow) || self.check(&Token::TildeArrow) {
                    return Ok(Statement::Connection(self.parse_connection_from_expr(expr)?));
                }
                
                self.try_consume(&Token::Semicolon);
                Ok(Statement::Expression(expr))
            }
        }
    }
    
    fn parse_let(&mut self) -> ParseResult<LetStatement> {
        let start = self.current_span().start;
        self.expect(Token::Let)?;
        
        let is_mutable = if self.check(&Token::Mut) {
            self.advance();
            true
        } else {
            false
        };
        
        let name = self.parse_identifier()?;
        
        let var_type = if self.check(&Token::Colon) {
            self.advance();
            Some(self.parse_type_annotation()?)
        } else {
            None
        };
        
        self.expect(Token::Eq)?;
        let value = self.parse_expression()?;
        self.expect(Token::Semicolon)?;
        
        Ok(LetStatement {
            is_mutable,
            name,
            var_type,
            value,
            span: start..self.previous_span().end,
        })
    }
    
    fn parse_if(&mut self) -> ParseResult<IfStatement> {
        let start = self.current_span().start;
        self.expect(Token::If)?;
        
        let condition = self.parse_expression()?;
        let then_branch = self.parse_block()?;
        
        let else_branch = if self.check(&Token::Else) {
            self.advance();
            Some(self.parse_block()?)
        } else {
            None
        };
        
        Ok(IfStatement {
            condition,
            then_branch,
            else_branch,
            span: start..self.previous_span().end,
        })
    }
    
    fn parse_when(&mut self) -> ParseResult<WhenStatement> {
        let start = self.current_span().start;
        self.expect(Token::When)?;
        
        let condition = self.parse_expression()?;
        let body = self.parse_block()?;
        
        Ok(WhenStatement {
            condition,
            body,
            span: start..self.previous_span().end,
        })
    }
    
    fn parse_match(&mut self) -> ParseResult<MatchStatement> {
        let start = self.current_span().start;
        self.expect(Token::Match)?;
        
        let expr = self.parse_expression()?;
        self.expect(Token::LBrace)?;
        
        let mut arms = Vec::new();
        while !self.check(&Token::RBrace) && !self.is_at_end() {
            let arm_start = self.current_span().start;
            let pattern = self.parse_pattern()?;
            self.expect(Token::FatArrow)?;
            let body = self.parse_expression()?;
            
            self.try_consume(&Token::Comma);
            
            arms.push(MatchArm {
                pattern,
                body,
                span: arm_start..self.previous_span().end,
            });
        }
        
        self.expect(Token::RBrace)?;
        
        Ok(MatchStatement {
            expr,
            arms,
            span: start..self.previous_span().end,
        })
    }
    
    fn parse_pattern(&mut self) -> ParseResult<Pattern> {
        match self.current_token().cloned() {
            Some(Token::Identifier(name)) => {
                let span = self.current_span();
                self.advance();
                
                // Path: State::A
                if self.check(&Token::ColonColon) {
                    let mut path = vec![Ident::new(name, span)];
                    while self.check(&Token::ColonColon) {
                        self.advance();
                        path.push(self.parse_identifier()?);
                    }
                    Ok(Pattern::Path(path))
                } else {
                    Ok(Pattern::Identifier(Ident::new(name, span)))
                }
            }
            Some(Token::Integer(n)) => {
                self.advance();
                Ok(Pattern::Literal(Literal::Integer(n)))
            }
            Some(Token::String(s)) => {
                self.advance();
                Ok(Pattern::Literal(Literal::String(s)))
            }
            _ => Err(self.error("Se esperaba patrón".to_string())),
        }
    }
    
    fn parse_for(&mut self) -> ParseResult<LoopStatement> {
        let start = self.current_span().start;
        self.expect(Token::For)?;
        
        let var = self.parse_identifier()?;
        
        // Esperar "in"
        if let Some(Token::Identifier(ref s)) = self.current_token() {
            if s == "in" {
                self.advance();
            }
        }
        
        let iterable = self.parse_expression()?;
        let body = self.parse_block()?;
        
        Ok(LoopStatement::For {
            var,
            iterable,
            body,
            span: start..self.previous_span().end,
        })
    }
    
    fn parse_while(&mut self) -> ParseResult<LoopStatement> {
        let start = self.current_span().start;
        self.expect(Token::While)?;
        
        let condition = self.parse_expression()?;
        let body = self.parse_block()?;
        
        Ok(LoopStatement::While {
            condition,
            body,
            span: start..self.previous_span().end,
        })
    }
    
    fn parse_loop(&mut self) -> ParseResult<LoopStatement> {
        let start = self.current_span().start;
        self.expect(Token::Loop)?;
        
        let body = self.parse_block()?;
        
        Ok(LoopStatement::Loop {
            body,
            span: start..self.previous_span().end,
        })
    }
    
    fn parse_block(&mut self) -> ParseResult<Block> {
        let start = self.current_span().start;
        self.expect(Token::LBrace)?;
        
        let mut statements = Vec::new();
        while !self.check(&Token::RBrace) && !self.is_at_end() {
            statements.push(self.parse_statement()?);
        }
        
        self.expect(Token::RBrace)?;
        
        Ok(Block {
            statements,
            span: start..self.previous_span().end,
        })
    }
    
    /// Parsea una expresión (precedencia de operadores)
    fn parse_expression(&mut self) -> ParseResult<Expr> {
        self.parse_or_expr()
    }
    
    fn parse_or_expr(&mut self) -> ParseResult<Expr> {
        let mut left = self.parse_and_expr()?;
        
        while self.check(&Token::OrOr) {
            let start = left.span().start;
            self.advance();
            let right = self.parse_and_expr()?;
            let end = right.span().end;
            
            left = Expr::Binary(BinaryExpr {
                left: Box::new(left),
                operator: BinaryOp::Or,
                right: Box::new(right),
                span: start..end,
            });
        }
        
        Ok(left)
    }
    
    fn parse_and_expr(&mut self) -> ParseResult<Expr> {
        let mut left = self.parse_comparison_expr()?;
        
        while self.check(&Token::AndAnd) {
            let start = left.span().start;
            self.advance();
            let right = self.parse_comparison_expr()?;
            let end = right.span().end;
            
            left = Expr::Binary(BinaryExpr {
                left: Box::new(left),
                operator: BinaryOp::And,
                right: Box::new(right),
                span: start..end,
            });
        }
        
        Ok(left)
    }
    
    fn parse_comparison_expr(&mut self) -> ParseResult<Expr> {
        let mut left = self.parse_additive_expr()?;
        
        loop {
            let op = match self.current_token() {
                Some(Token::EqEq) => BinaryOp::Eq,
                Some(Token::NotEq) => BinaryOp::NotEq,
                Some(Token::Lt) => BinaryOp::Lt,
                Some(Token::LtEq) => BinaryOp::LtEq,
                Some(Token::Gt) => BinaryOp::Gt,
                Some(Token::GtEq) => BinaryOp::GtEq,
                _ => break,
            };
            
            let start = left.span().start;
            self.advance();
            let right = self.parse_additive_expr()?;
            let end = right.span().end;
            
            left = Expr::Binary(BinaryExpr {
                left: Box::new(left),
                operator: op,
                right: Box::new(right),
                span: start..end,
            });
        }
        
        Ok(left)
    }
    
    fn parse_additive_expr(&mut self) -> ParseResult<Expr> {
        let mut left = self.parse_multiplicative_expr()?;
        
        loop {
            let op = match self.current_token() {
                Some(Token::Plus) => BinaryOp::Add,
                Some(Token::Minus) => BinaryOp::Sub,
                _ => break,
            };
            
            let start = left.span().start;
            self.advance();
            let right = self.parse_multiplicative_expr()?;
            let end = right.span().end;
            
            left = Expr::Binary(BinaryExpr {
                left: Box::new(left),
                operator: op,
                right: Box::new(right),
                span: start..end,
            });
        }
        
        Ok(left)
    }
    
    fn parse_multiplicative_expr(&mut self) -> ParseResult<Expr> {
        let mut left = self.parse_unary_expr()?;
        
        loop {
            let op = match self.current_token() {
                Some(Token::Star) => BinaryOp::Mul,
                Some(Token::Slash) => BinaryOp::Div,
                Some(Token::Percent) => BinaryOp::Mod,
                _ => break,
            };
            
            let start = left.span().start;
            self.advance();
            let right = self.parse_unary_expr()?;
            let end = right.span().end;
            
            left = Expr::Binary(BinaryExpr {
                left: Box::new(left),
                operator: op,
                right: Box::new(right),
                span: start..end,
            });
        }
        
        Ok(left)
    }
    
    fn parse_unary_expr(&mut self) -> ParseResult<Expr> {
        match self.current_token() {
            Some(Token::Not) => {
                let start = self.current_span().start;
                self.advance();
                let operand = self.parse_unary_expr()?;
                let end = operand.span().end;
                
                Ok(Expr::Unary(UnaryExpr {
                    operator: UnaryOp::Not,
                    operand: Box::new(operand),
                    span: start..end,
                }))
            }
            Some(Token::Minus) => {
                let start = self.current_span().start;
                self.advance();
                let operand = self.parse_unary_expr()?;
                let end = operand.span().end;
                
                Ok(Expr::Unary(UnaryExpr {
                    operator: UnaryOp::Neg,
                    operand: Box::new(operand),
                    span: start..end,
                }))
            }
            _ => self.parse_postfix_expr(),
        }
    }
    
    fn parse_postfix_expr(&mut self) -> ParseResult<Expr> {
        let mut expr = self.parse_primary_expr()?;
        
        loop {
            match self.current_token() {
                // Llamada a función: expr(args)
                Some(Token::LParen) => {
                    let start = expr.span().start;
                    self.advance();
                    let arguments = self.parse_arguments()?;
                    self.expect(Token::RParen)?;
                    let end = self.previous_span().end;
                    
                    expr = Expr::Call(FunctionCall {
                        function: Box::new(expr),
                        arguments,
                        span: start..end,
                    });
                }
                // Acceso a campo: expr.field
                Some(Token::Dot) => {
                    let start = expr.span().start;
                    self.advance();
                    let field = self.parse_identifier()?;
                    let end = self.previous_span().end;
                    
                    expr = Expr::FieldAccess(FieldAccess {
                        object: Box::new(expr),
                        field,
                        span: start..end,
                    });
                }
                // Acceso a índice: expr[index]
                Some(Token::LBracket) => {
                    let start = expr.span().start;
                    self.advance();
                    let index = self.parse_expression()?;
                    self.expect(Token::RBracket)?;
                    let end = self.previous_span().end;
                    
                    expr = Expr::IndexAccess(IndexAccess {
                        object: Box::new(expr),
                        index: Box::new(index),
                        span: start..end,
                    });
                }
                _ => break,
            }
        }
        
        Ok(expr)
    }
    
    fn parse_primary_expr(&mut self) -> ParseResult<Expr> {
        let start = self.current_span().start;
        
        match self.current_token().cloned() {
            // Literales numéricos
            Some(Token::Integer(n)) => {
                self.advance();
                
                // Verificar si hay unidad
                if let Some(unit) = self.try_parse_unit() {
                    return Ok(Expr::ValueWithUnit(ValueWithUnit {
                        value: n as f64,
                        unit,
                        span: start..self.previous_span().end,
                    }));
                }
                
                Ok(Expr::Literal(Literal::Integer(n)))
            }
            Some(Token::Float(f)) => {
                self.advance();
                
                if let Some(unit) = self.try_parse_unit() {
                    return Ok(Expr::ValueWithUnit(ValueWithUnit {
                        value: f,
                        unit,
                        span: start..self.previous_span().end,
                    }));
                }
                
                Ok(Expr::Literal(Literal::Float(f)))
            }
            // String literal
            Some(Token::String(s)) => {
                self.advance();
                Ok(Expr::Literal(Literal::String(s)))
            }
            // Secuencia de ADN
            Some(Token::SeqKeyword) => {
                self.advance();
                self.expect(Token::LBrace)?;
                
                let mut sequence = String::new();
                while let Some(Token::DNASequence(s)) = self.current_token().cloned() {
                    sequence.push_str(&s);
                    self.advance();
                }
                
                self.expect(Token::RBrace)?;
                
                Ok(Expr::DNASequence(DNASequence {
                    sequence,
                    span: start..self.previous_span().end,
                }))
            }
            // Partes biológicas predefinidas
            Some(Token::PartPLac) => { self.advance(); Ok(Expr::BioPart(BioPart::PLac)) }
            Some(Token::PartPTet) => { self.advance(); Ok(Expr::BioPart(BioPart::PTet)) }
            Some(Token::PartPBAD) => { self.advance(); Ok(Expr::BioPart(BioPart::PBAD)) }
            Some(Token::PartPT7) => { self.advance(); Ok(Expr::BioPart(BioPart::PT7)) }
            Some(Token::PartGFP) => { self.advance(); Ok(Expr::BioPart(BioPart::GFP)) }
            Some(Token::PartRFP) => { self.advance(); Ok(Expr::BioPart(BioPart::RFP)) }
            Some(Token::PartLacI) => { self.advance(); Ok(Expr::BioPart(BioPart::LacI)) }
            Some(Token::PartTetR) => { self.advance(); Ok(Expr::BioPart(BioPart::TetR)) }
            Some(Token::PartCas9) => { self.advance(); Ok(Expr::BioPart(BioPart::Cas9)) }
            Some(Token::PartGRNA) => { self.advance(); Ok(Expr::BioPart(BioPart::GRNA)) }
            // Identificador
            Some(Token::Identifier(name)) => {
                let span = self.current_span();
                self.advance();
                
                // ¿Es inicialización de struct?
                if self.check(&Token::LBrace) {
                    return self.parse_struct_init(Ident::new(name, span));
                }
                
                Ok(Expr::Identifier(Ident::new(name, span)))
            }
            // Paréntesis
            Some(Token::LParen) => {
                self.advance();
                let expr = self.parse_expression()?;
                self.expect(Token::RParen)?;
                Ok(expr)
            }
            // Array
            Some(Token::LBracket) => {
                self.advance();
                let elements = self.parse_arguments()?;
                self.expect(Token::RBracket)?;
                Ok(Expr::Array(elements))
            }
            // Bloque
            Some(Token::LBrace) => {
                let block = self.parse_block()?;
                Ok(Expr::Block(block))
            }
            Some(token) => Err(self.error(format!("Expresión inesperada: {:?}", token))),
            None => Err(self.error("Fin inesperado".to_string())),
        }
    }
    
    fn parse_arguments(&mut self) -> ParseResult<Vec<Expr>> {
        let mut args = Vec::new();
        
        while !self.check(&Token::RParen) && !self.check(&Token::RBracket) && !self.is_at_end() {
            args.push(self.parse_expression()?);
            
            if !self.check(&Token::RParen) && !self.check(&Token::RBracket) {
                self.expect(Token::Comma)?;
            }
        }
        
        Ok(args)
    }
    
    fn parse_struct_init(&mut self, name: Ident) -> ParseResult<Expr> {
        let start = name.span.start;
        self.expect(Token::LBrace)?;
        
        let mut fields = Vec::new();
        while !self.check(&Token::RBrace) && !self.is_at_end() {
            let field_start = self.current_span().start;
            let field_name = self.parse_identifier()?;
            self.expect(Token::Colon)?;
            let value = self.parse_expression()?;
            
            self.try_consume(&Token::Comma);
            
            fields.push(StructFieldInit {
                name: field_name,
                value,
                span: field_start..self.previous_span().end,
            });
        }
        
        self.expect(Token::RBrace)?;
        
        Ok(Expr::StructInit(StructInit {
            struct_name: name,
            fields,
            span: start..self.previous_span().end,
        }))
    }
    
    fn parse_connection_from_expr(&mut self, first: Expr) -> ParseResult<GeneticConnection> {
        let start = first.span().start;
        let mut parts = vec![self.expr_to_genetic_part(first)?];
        let mut connection_type = ConnectionType::Transcription;
        
        loop {
            match self.current_token() {
                Some(Token::Arrow) => {
                    connection_type = ConnectionType::Transcription;
                    self.advance();
                }
                Some(Token::TildeArrow) => {
                    connection_type = ConnectionType::Regulation;
                    self.advance();
                }
                Some(Token::PipeRight) => {
                    connection_type = ConnectionType::Transform;
                    self.advance();
                }
                _ => break,
            }
            
            let expr = self.parse_postfix_expr()?;
            parts.push(self.expr_to_genetic_part(expr)?);
        }
        
        Ok(GeneticConnection {
            parts,
            connection_type,
            span: start..self.previous_span().end,
        })
    }
    
    fn expr_to_genetic_part(&self, expr: Expr) -> ParseResult<GeneticPart> {
        match expr {
            Expr::Identifier(ident) => Ok(GeneticPart::Identifier(ident)),
            Expr::BioPart(part) => Ok(GeneticPart::Literal(part)),
            Expr::Call(call) => Ok(GeneticPart::FunctionCall(call)),
            _ => Err(ParseError {
                message: "Se esperaba parte genética".to_string(),
                span: expr.span(),
            }),
        }
    }
    
    fn parse_type_annotation(&mut self) -> ParseResult<TypeAnnotation> {
        match self.current_token().cloned() {
            Some(Token::TypePromoter) => {
                self.advance();
                Ok(TypeAnnotation::Biological(BioType::Promoter {
                    strength: None,
                    regulation: None,
                }))
            }
            Some(Token::TypeRBS) => {
                self.advance();
                Ok(TypeAnnotation::Biological(BioType::RBS {
                    translation_rate: None,
                }))
            }
            Some(Token::TypeProtein) => {
                self.advance();
                Ok(TypeAnnotation::Biological(BioType::Protein {
                    molecular_weight: None,
                    toxicity: None,
                }))
            }
            Some(Token::TypeTerminator) => {
                self.advance();
                Ok(TypeAnnotation::Biological(BioType::Terminator {
                    efficiency: None,
                }))
            }
            Some(Token::TypeGene) => {
                self.advance();
                Ok(TypeAnnotation::Biological(BioType::Gene))
            }
            Some(Token::TypeCircuit) => {
                self.advance();
                Ok(TypeAnnotation::Biological(BioType::Circuit))
            }
            Some(Token::TypeDNA) => {
                self.advance();
                Ok(TypeAnnotation::Biological(BioType::DNA))
            }
            Some(Token::TypeRNA) => {
                self.advance();
                Ok(TypeAnnotation::Biological(BioType::RNA))
            }
            Some(Token::Identifier(name)) => {
                let span = self.current_span();
                self.advance();
                Ok(TypeAnnotation::Simple(Ident::new(name, span)))
            }
            Some(token) => Err(self.error(format!("Se esperaba tipo, encontrado {:?}", token))),
            None => Err(self.error("Se esperaba tipo".to_string())),
        }
    }
    
    fn parse_value_with_unit(&mut self) -> ParseResult<ValueWithUnit> {
        let start = self.current_span().start;
        
        let value = match self.current_token() {
            Some(Token::Integer(n)) => { 
                let n = *n;
                self.advance(); 
                n as f64 
            }
            Some(Token::Float(f)) => {
                let f = *f;
                self.advance();
                f
            }
            _ => return Err(self.error("Se esperaba número".to_string())),
        };
        
        let unit = self.try_parse_unit()
            .ok_or_else(|| self.error("Se esperaba unidad".to_string()))?;
        
        Ok(ValueWithUnit {
            value,
            unit,
            span: start..self.previous_span().end,
        })
    }
    
    fn try_parse_unit(&mut self) -> Option<Unit> {
        let unit = match self.current_token()? {
            Token::UnitBp => Unit::BasePairs,
            Token::UnitKb => Unit::Kilobases,
            Token::UnitKDa => Unit::KiloDaltons,
            Token::UnitNM => Unit::NanoMolar,
            Token::UnitUM => Unit::MicroMolar,
            Token::UnitMM => Unit::MilliMolar,
            Token::UnitSec => Unit::Seconds,
            Token::UnitMin => Unit::Minutes,
            Token::UnitHr => Unit::Hours,
            _ => return None,
        };
        
        self.advance();
        Some(unit)
    }
    
    fn parse_identifier(&mut self) -> ParseResult<Ident> {
        match self.current_token().cloned() {
            Some(Token::Identifier(name)) => {
                let span = self.current_span();
                self.advance();
                Ok(Ident::new(name, span))
            }
            Some(token) => Err(self.error(format!(
                "Se esperaba identificador, encontrado {:?}",
                token
            ))),
            None => Err(self.error("Se esperaba identificador".to_string())),
        }
    }
    
    // ===== Utilidades =====
    
    fn current_token(&self) -> Option<&Token> {
        self.tokens.get(self.position).map(|t| &t.token)
    }
    
    fn current_span(&self) -> Span {
        self.tokens.get(self.position)
            .map(|t| t.span.clone())
            .unwrap_or(0..0)
    }
    
    fn previous_span(&self) -> Span {
        if self.position > 0 {
            self.tokens.get(self.position - 1)
                .map(|t| t.span.clone())
                .unwrap_or(0..0)
        } else {
            0..0
        }
    }
    
    fn is_at_end(&self) -> bool {
        self.position >= self.tokens.len()
    }
    
    fn advance(&mut self) {
        if !self.is_at_end() {
            self.position += 1;
        }
    }
    
    fn check(&self, expected: &Token) -> bool {
        self.current_token().map(|t| std::mem::discriminant(t) == std::mem::discriminant(expected)).unwrap_or(false)
    }
    
    fn try_consume(&mut self, expected: &Token) -> bool {
        if self.check(expected) {
            self.advance();
            true
        } else {
            false
        }
    }
    
    fn expect(&mut self, expected: Token) -> ParseResult<()> {
        if self.check(&expected) {
            self.advance();
            Ok(())
        } else {
            Err(self.error(format!(
                "Se esperaba {:?}, encontrado {:?}",
                expected,
                self.current_token()
            )))
        }
    }
    
    fn error(&self, message: String) -> ParseError {
        ParseError {
            message,
            span: self.current_span(),
        }
    }
}

/// Error de parsing
#[derive(Debug, thiserror::Error)]
#[error("Error de parsing en {span:?}: {message}")]
pub struct ParseError {
    pub message: String,
    pub span: Span,
}

// Implementar span() para Expr
impl Expr {
    pub fn span(&self) -> Span {
        match self {
            Expr::Literal(_) => 0..0, // TODO: agregar spans a literales
            Expr::Identifier(i) => i.span.clone(),
            Expr::DNASequence(d) => d.span.clone(),
            Expr::AminoSequence(a) => a.span.clone(),
            Expr::ValueWithUnit(v) => v.span.clone(),
            Expr::Binary(b) => b.span.clone(),
            Expr::Unary(u) => u.span.clone(),
            Expr::Call(c) => c.span.clone(),
            Expr::FieldAccess(f) => f.span.clone(),
            Expr::IndexAccess(i) => i.span.clone(),
            Expr::StructInit(s) => s.span.clone(),
            Expr::Array(_) => 0..0,
            Expr::Block(b) => b.span.clone(),
            Expr::BioPart(_) => 0..0,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    
    #[test]
    fn test_parse_circuit() {
        let source = r#"
            circuit SimpleGFP {
                let promoter = pLac;
                promoter -> GFP
            }
        "#;
        
        let mut parser = Parser::new(source).unwrap();
        let program = parser.parse_program().unwrap();
        
        assert_eq!(program.items.len(), 1);
        assert!(matches!(program.items[0], Item::Circuit(_)));
    }
    
    #[test]
    fn test_parse_safe_circuit() {
        let source = r#"
            safe circuit Contained {
                kill_switch {
                    trigger: absence_of("arabinose"),
                    mechanism: CcdB
                }
            }
        "#;
        
        let mut parser = Parser::new(source).unwrap();
        let program = parser.parse_program().unwrap();
        
        if let Item::Circuit(circuit) = &program.items[0] {
            assert!(circuit.is_safe);
            assert!(circuit.body.kill_switch.is_some());
        }
    }
}
