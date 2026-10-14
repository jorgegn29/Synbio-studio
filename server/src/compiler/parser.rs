//! Parser para BioScript
//! Convierte tokens en un AST

use crate::compiler::ast::*;
use crate::compiler::lexer::{Lexer, LexerError, SpannedToken, Token};

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
        Ok(Self {
            tokens,
            position: 0,
        })
    }

    /// Parsea un programa completo
    pub fn parse_program(&mut self) -> ParseResult<Program> {
        let start = self.current_span().start;
        let mut items = Vec::new();

        while !self.is_at_end() {
            items.push(self.parse_item()?);
        }

        let end = if items.is_empty() {
            start
        } else {
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
            Some(Token::Safe) | Some(Token::Circuit) | Some(Token::Module) => {
                Ok(Item::Circuit(self.parse_circuit()?))
            }
            Some(token)
                if token_to_name(token).is_some()
                    && matches!(self.peek_token(), Some(Token::LBrace)) =>
            {
                Ok(Item::Circuit(self.parse_record_circuit()?))
            }
            Some(Token::Identifier(name)) if name == "genetic_circuit" => {
                self.advance();
                Ok(Item::Circuit(self.parse_circuit_after_keyword(false)?))
            }
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
            if self.current_token().and_then(token_to_name).is_some() {
                items.push(self.parse_name()?);
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
        // `Host` is a keyword, and examples write `chassis EcoliDH5Alpha: Host`.
        let host_type = self.parse_name()?;

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

        // `module Name` and `safe module Name` are circuits in the demo dialect.
        if self.check(&Token::Module) {
            self.advance();
        } else {
            self.expect(Token::Circuit)?;
        }
        self.parse_circuit_after_keyword_from(is_safe, start)
    }

    /// `genetic_circuit Name { ... }` — the keyword was already consumed.
    fn parse_circuit_after_keyword(&mut self, is_safe: bool) -> ParseResult<CircuitDecl> {
        let start = self.previous_span().start;
        self.parse_circuit_after_keyword_from(is_safe, start)
    }

    fn parse_circuit_after_keyword_from(
        &mut self,
        is_safe: bool,
        start: usize,
    ) -> ParseResult<CircuitDecl> {
        let name = self.parse_name()?;

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

    /// Top-level record such as `simulation_parameters { time_span: "..." }`.
    fn parse_record_circuit(&mut self) -> ParseResult<CircuitDecl> {
        let start = self.current_span().start;
        let name = self.parse_name()?;
        self.expect(Token::LBrace)?;
        let body = self.parse_circuit_body()?;
        self.expect(Token::RBrace)?;
        Ok(CircuitDecl {
            is_safe: false,
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
        let mut declared_names: Vec<String> = Vec::new();

        while !self.check(&Token::RBrace) && !self.is_at_end() {
            // Kill switch
            if self.check(&Token::KillSwitch) {
                kill_switch = Some(self.parse_kill_switch()?);
                continue;
            }

            // `promoter pLac (...) {}`, `gene lacI: Protein = LacI`, `host: "ecoli"`
            if self.is_part_declaration() {
                for stmt in self.parse_part_declaration()? {
                    if let Statement::Let(ls) = &stmt {
                        if declared_names.iter().any(|name| name == &ls.name.name) {
                            continue;
                        }
                        declared_names.push(ls.name.name.clone());
                    }
                    if let Statement::Connection(conn) = stmt {
                        connections.push(conn);
                    } else {
                        statements.push(stmt);
                    }
                }
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
        // `kill_switch CcdBA { ... }` names the switch before the body.
        if self.current_token().and_then(token_to_name).is_some()
            && !matches!(self.current_token(), Some(Token::LBrace))
        {
            let _name = self.parse_name()?;
        }
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
                    mechanism = Some(self.parse_mechanism_name()?);
                }
                "delay" => {
                    delay = Some(self.parse_value_with_unit()?);
                }
                // Examples also record the toxin pair. A missing mechanism
                // falls back to the toxin name.
                "toxin" => {
                    let expr = self.parse_expression()?;
                    if mechanism.is_none() {
                        mechanism = expr_to_ident(&expr);
                    }
                }
                "antitoxin" => {
                    let _ = self.parse_expression()?;
                }
                _ => {
                    let _ = self.parse_expression()?;
                }
            }

            self.try_consume(&Token::Comma);
        }

        self.expect(Token::RBrace)?;

        Ok(KillSwitch {
            trigger: trigger
                .unwrap_or_else(|| Expr::Literal(Literal::String("unspecified".to_string()))),
            mechanism: mechanism.unwrap_or_else(|| Ident::new("unspecified", start..start)),
            delay,
            span: start..self.previous_span().end,
        })
    }

    /// Mechanism may be an identifier (`CcdB`) or a description string.
    fn parse_mechanism_name(&mut self) -> ParseResult<Ident> {
        match self.current_token().cloned() {
            Some(Token::String(s)) => {
                let span = self.current_span();
                self.advance();
                Ok(Ident::new(s, span))
            }
            _ => self.parse_name(),
        }
    }

    /// Parsea una declaración de gen
    fn parse_gene_decl(&mut self) -> ParseResult<GeneDecl> {
        let start = self.current_span().start;
        self.expect(Token::Gene)?;

        let name = self.parse_identifier()?;
        self.expect(Token::Colon)?;

        let gene_type = match self.current_token() {
            Some(Token::TypeProtein) => {
                self.advance();
                GeneType::Protein
            }
            Some(Token::TypeRNA) => {
                self.advance();
                GeneType::RNA
            }
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

    /// `promoter name`, `gene name: Type = expr`, `rbs: B0034`, `host: "..."`.
    /// A role word followed by `->` or `~>` is a connection, not a declaration.
    fn is_part_declaration(&self) -> bool {
        let is_role = match self.current_token() {
            Some(Token::Gene) | Some(Token::Host) => true,
            Some(Token::Identifier(name)) => is_role_name(name),
            _ => false,
        };
        if !is_role {
            return false;
        }
        match self.peek_token() {
            Some(Token::Arrow) | Some(Token::TildeArrow) | Some(Token::PipeRight) => false,
            _ => true,
        }
    }

    fn parse_part_declaration(&mut self) -> ParseResult<Vec<Statement>> {
        let start = self.current_span().start;
        let role = self.parse_name()?.name;

        // `host: "ecoli_k12"` / `rbs: B0034` — the colon is immediate, so this
        // is a slot assignment. `gene lacI: Protein` has a name before the colon.
        if self.check(&Token::Colon) {
            self.advance();
            let value = self.parse_expression()?;
            self.try_consume(&Token::Semicolon);
            return Ok(vec![Statement::Expression(value)]);
        }

        let (name, name_part) = self.parse_declared_name()?;

        let var_type = if self.check(&Token::Colon) {
            self.advance();
            Some(self.parse_type_annotation()?)
        } else {
            role_type_annotation(&role)
        };

        let value = if self.check(&Token::Eq) {
            self.advance();
            self.parse_expression()?
        } else if let Some(part) = name_part.clone() {
            Expr::BioPart(part)
        } else {
            Expr::BioPart(BioPart::Custom(name.name.clone()))
        };

        if self.check(&Token::LParen) {
            self.parse_paren_properties()?;
        }

        let mut statements = vec![Statement::Let(LetStatement {
            is_mutable: false,
            name: name.clone(),
            var_type,
            value,
            span: start..self.previous_span().end,
        })];

        if self.check(&Token::LBrace) {
            let block = self.parse_block()?;
            statements.extend(block.statements);
        }

        self.try_consume(&Token::Semicolon);
        Ok(statements)
    }

    fn parse_declared_name(&mut self) -> ParseResult<(Ident, Option<BioPart>)> {
        let span = self.current_span();
        if let Some(part) = self.current_token().and_then(token_to_biopart) {
            let name = token_to_name(self.current_token().unwrap()).unwrap();
            self.advance();
            return Ok((Ident::new(name, span), Some(part)));
        }
        let ident = self.parse_name()?;
        Ok((ident, None))
    }

    fn parse_paren_properties(&mut self) -> ParseResult<()> {
        self.expect(Token::LParen)?;
        while !self.check(&Token::RParen) && !self.is_at_end() {
            let _name = self.parse_name()?;
            self.expect(Token::Colon)?;
            let _value = self.parse_expression()?;
            self.try_consume(&Token::Comma);
        }
        self.expect(Token::RParen)?;
        Ok(())
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
            _ if self.is_sequence_decl() => self.parse_sequence_decl(),
            _ if self.is_property_assignment() => self.parse_property_statement(),
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
                    let connection = self.parse_connection_from_expr(expr)?;
                    self.try_consume(&Token::Semicolon);
                    return Ok(Statement::Connection(connection));
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

        while matches!(self.current_token(), Some(Token::OrOr | Token::GateOr)) {
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

        while matches!(self.current_token(), Some(Token::AndAnd | Token::GateAnd)) {
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
        let mut left = self.parse_power_expr()?;

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

    /// `10^7` and `call() FOR 2 hr`, then a trailing unit phrase such as `cells/mL`.
    fn parse_power_expr(&mut self) -> ParseResult<Expr> {
        let expr = self.parse_power_or_duration()?;
        self.attach_trailing_unit(expr)
    }

    fn parse_power_or_duration(&mut self) -> ParseResult<Expr> {
        let mut left = self.parse_unary_expr()?;

        if self.check(&Token::Caret) {
            let start = left.span().start;
            self.advance();
            let right = self.parse_power_or_duration()?;
            let end = right.span().end;
            left = Expr::Binary(BinaryExpr {
                left: Box::new(left),
                operator: BinaryOp::Pow,
                right: Box::new(right),
                span: start..end,
            });
        }

        if self.check(&Token::ForDuration) {
            let start = left.span().start;
            self.advance();
            let right = self.parse_power_or_duration()?;
            let end = right.span().end;
            left = Expr::Binary(BinaryExpr {
                left: Box::new(left),
                operator: BinaryOp::Duration,
                right: Box::new(right),
                span: start..end,
            });
        }

        Ok(left)
    }

    fn attach_trailing_unit(&mut self, expr: Expr) -> ParseResult<Expr> {
        let start = expr.span().start;
        if let Some(unit) = self.try_parse_unit() {
            if let Some(value) = numeric_literal(&expr) {
                return Ok(Expr::ValueWithUnit(ValueWithUnit {
                    value,
                    unit,
                    span: start..self.previous_span().end,
                }));
            }
        }
        Ok(expr)
    }

    /// `sequence arsM: Gene { ... }` declares a gene part.
    fn is_sequence_decl(&self) -> bool {
        match self.current_token() {
            Some(Token::Identifier(name)) if name == "sequence" => {
                self.peek_token().and_then(token_to_name).is_some()
            }
            _ => false,
        }
    }

    fn parse_sequence_decl(&mut self) -> ParseResult<Statement> {
        let start = self.current_span().start;
        self.advance();
        let name = self.parse_name()?;
        self.expect(Token::Colon)?;
        let var_type = self.parse_type_annotation()?;
        if self.check(&Token::LBrace) {
            let _fields = self.parse_block()?;
        }
        self.try_consume(&Token::Semicolon);
        Ok(Statement::Let(LetStatement {
            is_mutable: false,
            name: name.clone(),
            var_type: Some(var_type),
            value: Expr::BioPart(BioPart::Custom(name.name.clone())),
            span: start..self.previous_span().end,
        }))
    }

    fn is_property_assignment(&self) -> bool {
        self.current_token().and_then(token_to_name).is_some()
            && matches!(self.peek_token(), Some(Token::Colon))
    }

    fn parse_property_statement(&mut self) -> ParseResult<Statement> {
        let _name = self.parse_name()?;
        self.expect(Token::Colon)?;
        let value = self.parse_expression()?;
        self.try_consume(&Token::Comma);
        self.try_consume(&Token::Semicolon);
        Ok(Statement::Expression(value))
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
            Some(Token::True) => {
                self.advance();
                Ok(Expr::Literal(Literal::Bool(true)))
            }
            Some(Token::False) => {
                self.advance();
                Ok(Expr::Literal(Literal::Bool(false)))
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
            Some(Token::PartPLac) => {
                self.advance();
                Ok(Expr::BioPart(BioPart::PLac))
            }
            Some(Token::PartPTet) => {
                self.advance();
                Ok(Expr::BioPart(BioPart::PTet))
            }
            Some(Token::PartPBAD) => {
                self.advance();
                Ok(Expr::BioPart(BioPart::PBAD))
            }
            Some(Token::PartPT7) => {
                self.advance();
                Ok(Expr::BioPart(BioPart::PT7))
            }
            Some(Token::PartGFP) => {
                self.advance();
                Ok(Expr::BioPart(BioPart::GFP))
            }
            Some(Token::PartRFP) => {
                self.advance();
                Ok(Expr::BioPart(BioPart::RFP))
            }
            Some(Token::PartLacI) => {
                self.advance();
                Ok(Expr::BioPart(BioPart::LacI))
            }
            Some(Token::PartTetR) => {
                self.advance();
                Ok(Expr::BioPart(BioPart::TetR))
            }
            Some(Token::PartCas9) => {
                self.advance();
                Ok(Expr::BioPart(BioPart::Cas9))
            }
            Some(Token::PartGRNA) => {
                self.advance();
                Ok(Expr::BioPart(BioPart::GRNA))
            }
            // Keywords that examples use as calls: repress(...), express(...), sense(...)
            Some(Token::Repress)
            | Some(Token::Activate)
            | Some(Token::Inhibit)
            | Some(Token::Express)
            | Some(Token::Secrete)
            | Some(Token::Sense)
            | Some(Token::Bind)
            | Some(Token::Host) => {
                let name = token_to_name(self.current_token().unwrap()).unwrap();
                let span = self.current_span();
                self.advance();
                Ok(Expr::Identifier(Ident::new(name, span)))
            }
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
            // Named argument: `express(reporter, level: high)`
            if self.named_argument_ahead() {
                let _name = self.parse_name()?;
                self.expect(Token::Colon)?;
            }
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
            Some(token) if token_to_name(&token).is_some() => {
                let name = token_to_name(&token).unwrap();
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

        let unit = self
            .try_parse_unit()
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
            Token::UnitCelsius => Unit::Celsius,
            Token::UnitDegree => {
                if matches!(self.peek_token(), Some(Token::Identifier(name)) if name == "C" || name == "c")
                {
                    self.advance();
                    self.advance();
                    return Some(Unit::Celsius);
                }
                Unit::Celsius
            }
            Token::Percent => Unit::Percent,
            Token::Identifier(name) if name == "ppb" => Unit::PartsPerBillion,
            Token::Identifier(name) if name == "cells" => {
                let slash = matches!(self.peek_token(), Some(Token::Slash));
                let milli = matches!(
                    self.tokens.get(self.position + 2).map(|t| &t.token),
                    Some(Token::Identifier(unit)) if unit == "mL" || unit == "ml"
                );
                if slash && milli {
                    self.advance();
                    self.advance();
                    self.advance();
                    return Some(Unit::CellsPerMillilitre);
                }
                return None;
            }
            Token::Identifier(name) if name == "AU" || name == "au" => Unit::ArbitraryUnits,
            Token::Identifier(name) if name == "Da" => Unit::Daltons,
            Token::Identifier(name) if name == "M" => Unit::Molar,
            _ => return None,
        };

        self.advance();
        Some(unit)
    }

    /// Identifier, part token, or a keyword used as a name (`Host`, `pLac`).
    fn parse_name(&mut self) -> ParseResult<Ident> {
        let span = self.current_span();
        match self.current_token().and_then(token_to_name) {
            Some(name) => {
                self.advance();
                Ok(Ident::new(name, span))
            }
            None => Err(self.error(format!(
                "Se esperaba identificador, encontrado {:?}",
                self.current_token()
            ))),
        }
    }

    fn named_argument_ahead(&self) -> bool {
        let name = match self.current_token() {
            Some(token) => token_to_name(token).is_some(),
            None => false,
        };
        name && matches!(self.peek_token(), Some(Token::Colon))
    }

    fn peek_token(&self) -> Option<&Token> {
        self.tokens.get(self.position + 1).map(|t| &t.token)
    }

    fn parse_identifier(&mut self) -> ParseResult<Ident> {
        match self.current_token().cloned() {
            Some(Token::Identifier(name)) => {
                let span = self.current_span();
                self.advance();
                Ok(Ident::new(name, span))
            }
            Some(token) => {
                Err(self.error(format!("Se esperaba identificador, encontrado {:?}", token)))
            }
            None => Err(self.error("Se esperaba identificador".to_string())),
        }
    }

    // ===== Utilidades =====

    fn current_token(&self) -> Option<&Token> {
        self.tokens.get(self.position).map(|t| &t.token)
    }

    fn current_span(&self) -> Span {
        self.tokens
            .get(self.position)
            .map(|t| t.span.clone())
            .unwrap_or(0..0)
    }

    fn previous_span(&self) -> Span {
        if self.position > 0 {
            self.tokens
                .get(self.position - 1)
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
        self.current_token()
            .map(|t| std::mem::discriminant(t) == std::mem::discriminant(expected))
            .unwrap_or(false)
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

fn is_role_name(name: &str) -> bool {
    matches!(
        name,
        "promoter" | "rbs" | "terminator" | "host" | "cds" | "reporter"
    )
}

fn role_type_annotation(role: &str) -> Option<TypeAnnotation> {
    let bio = match role {
        "promoter" => BioType::Promoter {
            strength: None,
            regulation: None,
        },
        "rbs" => BioType::RBS {
            translation_rate: None,
        },
        "terminator" => BioType::Terminator { efficiency: None },
        "gene" | "cds" | "reporter" => BioType::Gene,
        _ => return None,
    };
    Some(TypeAnnotation::Biological(bio))
}

fn token_to_name(token: &Token) -> Option<String> {
    match token {
        Token::Identifier(name) => Some(name.clone()),
        Token::PartPLac => Some("pLac".to_string()),
        Token::PartPTet => Some("pTet".to_string()),
        Token::PartPBAD => Some("pBAD".to_string()),
        Token::PartPT7 => Some("pT7".to_string()),
        Token::PartGFP => Some("GFP".to_string()),
        Token::PartRFP => Some("RFP".to_string()),
        Token::PartLacI => Some("LacI".to_string()),
        Token::PartTetR => Some("TetR".to_string()),
        Token::PartCas9 => Some("Cas9".to_string()),
        Token::PartGRNA => Some("gRNA".to_string()),
        Token::Host => Some("Host".to_string()),
        Token::Repress => Some("repress".to_string()),
        Token::Activate => Some("activate".to_string()),
        Token::Inhibit => Some("inhibit".to_string()),
        Token::Express => Some("express".to_string()),
        Token::Secrete => Some("secrete".to_string()),
        Token::Sense => Some("sense".to_string()),
        Token::Bind => Some("bind".to_string()),
        Token::Gene => Some("gene".to_string()),
        Token::TypePromoter => Some("Promoter".to_string()),
        Token::TypeRBS => Some("RBS".to_string()),
        Token::TypeCDS => Some("CDS".to_string()),
        Token::TypeTerminator => Some("Terminator".to_string()),
        Token::TypeGene => Some("Gene".to_string()),
        Token::TypeProtein => Some("Protein".to_string()),
        Token::TypeRNA => Some("RNA".to_string()),
        Token::TypeDNA => Some("DNA".to_string()),
        Token::TypeRiboswitch => Some("Riboswitch".to_string()),
        Token::TypeAptamer => Some("Aptamer".to_string()),
        Token::TypeCircuit => Some("Circuit".to_string()),
        Token::TypeActivator => Some("Activator".to_string()),
        Token::TypeRepressor => Some("Repressor".to_string()),
        Token::TypeInducer => Some("Inducer".to_string()),
        Token::TypeOperator => Some("Operator".to_string()),
        Token::Circuit => Some("circuit".to_string()),
        Token::Module => Some("module".to_string()),
        _ => None,
    }
}

fn token_to_biopart(token: &Token) -> Option<BioPart> {
    match token {
        Token::PartPLac => Some(BioPart::PLac),
        Token::PartPTet => Some(BioPart::PTet),
        Token::PartPBAD => Some(BioPart::PBAD),
        Token::PartPT7 => Some(BioPart::PT7),
        Token::PartGFP => Some(BioPart::GFP),
        Token::PartRFP => Some(BioPart::RFP),
        Token::PartLacI => Some(BioPart::LacI),
        Token::PartTetR => Some(BioPart::TetR),
        Token::PartCas9 => Some(BioPart::Cas9),
        Token::PartGRNA => Some(BioPart::GRNA),
        _ => None,
    }
}

fn numeric_literal(expr: &Expr) -> Option<f64> {
    match expr {
        Expr::Literal(Literal::Integer(n)) => Some(*n as f64),
        Expr::Literal(Literal::Float(f)) => Some(*f),
        Expr::ValueWithUnit(v) => Some(v.value),
        Expr::Binary(bin) if bin.operator == BinaryOp::Pow => {
            let left = numeric_literal(&bin.left)?;
            let right = numeric_literal(&bin.right)?;
            Some(left.powf(right))
        }
        _ => None,
    }
}

fn expr_to_ident(expr: &Expr) -> Option<Ident> {
    match expr {
        Expr::Identifier(id) => Some(id.clone()),
        Expr::BioPart(part) => Some(Ident::new(biopart_label(part), 0..0)),
        _ => None,
    }
}

fn biopart_label(part: &BioPart) -> String {
    match part {
        BioPart::PLac => "pLac",
        BioPart::PTet => "pTet",
        BioPart::PBAD => "pBAD",
        BioPart::PT7 => "pT7",
        BioPart::GFP => "GFP",
        BioPart::RFP => "RFP",
        BioPart::BFP => "BFP",
        BioPart::LacI => "LacI",
        BioPart::TetR => "TetR",
        BioPart::CI => "CI",
        BioPart::Cas9 => "Cas9",
        BioPart::GRNA => "gRNA",
        BioPart::RBSStrong => "rbs_strong",
        BioPart::RBSMedium => "rbs_medium",
        BioPart::RBSWeak => "rbs_weak",
        BioPart::TermT1 => "term_T1",
        BioPart::TermT7 => "term_T7",
        BioPart::Custom(name) => return name.clone(),
    }
    .to_string()
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
