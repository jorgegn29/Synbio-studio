//! Autocompletado para BioScript LSP

use tower_lsp::lsp_types::*;

/// Provee completado de código para BioScript
pub struct CompletionProvider;

impl CompletionProvider {
    pub fn new() -> Self {
        Self
    }

    /// Genera items de completado basados en el contexto
    pub fn provide_completions(&self, _position: Position, _content: &str) -> Vec<CompletionItem> {
        let mut items = Vec::new();

        // Palabras clave de circuitos
        items.push(self.keyword_item("circuit", "Define un circuito genético"));
        items.push(self.keyword_item("gene", "Define un gen"));
        items.push(self.keyword_item("promoter", "Define un promotor"));
        items.push(self.keyword_item("rbs", "Define un sitio de unión ribosomal"));
        items.push(self.keyword_item("terminator", "Define un terminador"));
        items.push(self.keyword_item("protein", "Define una proteína"));
        items.push(self.keyword_item("import", "Importa un módulo"));
        items.push(self.keyword_item("export", "Exporta símbolos"));
        items.push(self.keyword_item("if", "Condicional"));
        items.push(self.keyword_item("else", "Rama alternativa"));
        items.push(self.keyword_item("for", "Bucle for"));
        items.push(self.keyword_item("while", "Bucle while"));
        items.push(self.keyword_item("return", "Retorna un valor"));
        items.push(self.keyword_item("let", "Declara una variable"));
        items.push(self.keyword_item("mut", "Variable mutable"));
        items.push(self.keyword_item("const", "Constante"));
        items.push(self.keyword_item("fn", "Define una función"));
        items.push(self.keyword_item("struct", "Define una estructura"));
        items.push(self.keyword_item("enum", "Define una enumeración"));
        items.push(self.keyword_item("impl", "Implementación"));
        items.push(self.keyword_item("trait", "Define un trait"));
        items.push(self.keyword_item("type", "Alias de tipo"));
        items.push(self.keyword_item("where", "Cláusula where"));
        items.push(self.keyword_item("async", "Función asíncrona"));
        items.push(self.keyword_item("await", "Espera asíncrona"));

        // Tipos biológicos
        items.push(self.type_item("Promoter", "Tipo de promotor"));
        items.push(self.type_item("RBS", "Sitio de unión ribosomal"));
        items.push(self.type_item("CDS", "Secuencia codificante"));
        items.push(self.type_item("Terminator", "Terminador de transcripción"));
        items.push(self.type_item("Gene", "Gen completo"));
        items.push(self.type_item("Protein", "Proteína"));
        items.push(self.type_item("Circuit", "Circuito genético"));
        items.push(self.type_item("DNA", "Secuencia de ADN"));
        items.push(self.type_item("RNA", "Secuencia de ARN"));
        items.push(self.type_item("AminoAcid", "Aminoácido"));
        items.push(self.type_item("Riboswitch", "Riboswitch"));
        items.push(self.type_item("Aptamer", "Aptámero"));
        items.push(self.type_item("CRISPR", "Sistema CRISPR"));
        items.push(self.type_item("Plasmid", "Plásmido"));
        items.push(self.type_item("Chassis", "Chasis celular"));
        items.push(self.type_item("Metabolite", "Metabolito"));
        items.push(self.type_item("Enzyme", "Enzima"));
        items.push(self.type_item("Pathway", "Ruta metabólica"));

        // Partes biológicas conocidas
        items.push(self.biopart_item("pLac", "Promotor lac (IPTG-inducible)"));
        items.push(self.biopart_item("pTet", "Promotor tet (aTc-inducible)"));
        items.push(self.biopart_item("pBAD", "Promotor BAD (arabinosa-inducible)"));
        items.push(self.biopart_item("pT7", "Promotor T7 (fuerte)"));
        items.push(self.biopart_item("pTac", "Promotor tac híbrido"));
        items.push(self.biopart_item("pConst", "Promotor constitutivo"));
        items.push(self.biopart_item("GFP", "Proteína verde fluorescente"));
        items.push(self.biopart_item("RFP", "Proteína roja fluorescente"));
        items.push(self.biopart_item("BFP", "Proteína azul fluorescente"));
        items.push(self.biopart_item("YFP", "Proteína amarilla fluorescente"));
        items.push(self.biopart_item("mCherry", "Proteína roja mCherry"));
        items.push(self.biopart_item("LacI", "Represor lac"));
        items.push(self.biopart_item("TetR", "Represor tet"));
        items.push(self.biopart_item("AraC", "Regulador araC"));
        items.push(self.biopart_item("LuxR", "Regulador de quorum sensing"));
        items.push(self.biopart_item("Cas9", "Nucleasa CRISPR-Cas9"));
        items.push(self.biopart_item("dCas9", "Cas9 catalíticamente muerta"));
        items.push(self.biopart_item("B0034", "RBS fuerte (iGEM)"));
        items.push(self.biopart_item("B0015", "Doble terminador (iGEM)"));

        // Snippets
        items.push(self.snippet_item(
            "circuit-template",
            "Plantilla de circuito",
            r#"circuit ${1:Name} {
    // Componentes del circuito
    promoter ${2:pLac};
    gene ${3:gfp}: Protein = ${4:GFP};
    
    // Conexiones
    ${2:pLac} -> ${3:gfp};
}"#,
        ));

        items.push(self.snippet_item(
            "gene-template",
            "Plantilla de gen",
            r#"gene ${1:name} {
    promoter: ${2:pLac},
    rbs: ${3:B0034},
    cds: ${4:GFP},
    terminator: ${5:B0015}
}"#,
        ));

        items.push(self.snippet_item(
            "toggle-switch",
            "Toggle switch genético",
            r#"circuit ToggleSwitch {
    // Represores
    gene lacI: Protein = LacI;
    gene tetR: Protein = TetR;
    
    // Promotores
    promoter pLac;
    promoter pTet;
    
    // Inhibición mutua
    pLac -> tetR;
    pTet -> lacI;
    LacI --| pLac;  // Represión
    TetR --| pTet;
}"#,
        ));

        items.push(self.snippet_item(
            "kill-switch",
            "Sistema de seguridad kill-switch",
            r#"kill_switch {
    trigger: ${1:absence}(${2:IPTG}),
    toxin: ${3:CcdB},
    antitoxin: ${4:CcdA},
    delay: ${5:2hr}
}"#,
        ));

        items
    }

    fn keyword_item(&self, label: &str, detail: &str) -> CompletionItem {
        CompletionItem {
            label: label.to_string(),
            kind: Some(CompletionItemKind::KEYWORD),
            detail: Some(detail.to_string()),
            insert_text: Some(label.to_string()),
            insert_text_format: Some(InsertTextFormat::PLAIN_TEXT),
            ..Default::default()
        }
    }

    fn type_item(&self, label: &str, detail: &str) -> CompletionItem {
        CompletionItem {
            label: label.to_string(),
            kind: Some(CompletionItemKind::CLASS),
            detail: Some(detail.to_string()),
            insert_text: Some(label.to_string()),
            insert_text_format: Some(InsertTextFormat::PLAIN_TEXT),
            ..Default::default()
        }
    }

    fn biopart_item(&self, label: &str, detail: &str) -> CompletionItem {
        CompletionItem {
            label: label.to_string(),
            kind: Some(CompletionItemKind::CONSTANT),
            detail: Some(detail.to_string()),
            insert_text: Some(label.to_string()),
            insert_text_format: Some(InsertTextFormat::PLAIN_TEXT),
            ..Default::default()
        }
    }

    fn snippet_item(&self, label: &str, detail: &str, snippet: &str) -> CompletionItem {
        CompletionItem {
            label: label.to_string(),
            kind: Some(CompletionItemKind::SNIPPET),
            detail: Some(detail.to_string()),
            insert_text: Some(snippet.to_string()),
            insert_text_format: Some(InsertTextFormat::SNIPPET),
            ..Default::default()
        }
    }
}

impl Default for CompletionProvider {
    fn default() -> Self {
        Self::new()
    }
}
