//! Información de hover para BioScript LSP

use tower_lsp::lsp_types::*;
use std::collections::HashMap;
use crate::compiler::bio_types;
use crate::compiler::type_checker::BioTypeChecker;
use crate::compiler::parser::Parser;

/// Provee información de hover para elementos de BioScript
pub struct HoverProvider {
    docs: HashMap<String, BioPartDoc>,
}

/// Documentación de una parte biológica
#[derive(Clone)]
struct BioPartDoc {
    name: String,
    category: String,
    description: String,
    parameters: Vec<String>,
    registry_id: Option<String>,
    sequence_length: Option<usize>,
    characteristics: Vec<String>,
}

impl HoverProvider {
    pub fn new() -> Self {
        let mut docs = HashMap::new();

        // Promotores
        docs.insert("pLac".to_string(), BioPartDoc {
            name: "pLac".to_string(),
            category: "Promotor".to_string(),
            description: "Promotor inducible por IPTG. Reprimido por LacI.".to_string(),
            parameters: vec!["Inducción: 0.1-1 mM IPTG".to_string()],
            registry_id: Some("BBa_R0010".to_string()),
            sequence_length: Some(200),
            characteristics: vec![
                "Fuerza: Media-Alta".to_string(),
                "Regulación: Negativa (LacI)".to_string(),
                "Fuga: Baja con lacIq".to_string(),
            ],
        });

        docs.insert("pTet".to_string(), BioPartDoc {
            name: "pTet".to_string(),
            category: "Promotor".to_string(),
            description: "Promotor inducible por aTc (anhidrotetraciclina). Reprimido por TetR.".to_string(),
            parameters: vec!["Inducción: 10-200 ng/mL aTc".to_string()],
            registry_id: Some("BBa_R0040".to_string()),
            sequence_length: Some(54),
            characteristics: vec![
                "Fuerza: Media".to_string(),
                "Regulación: Negativa (TetR)".to_string(),
                "Respuesta: Rápida".to_string(),
            ],
        });

        docs.insert("pBAD".to_string(), BioPartDoc {
            name: "pBAD".to_string(),
            category: "Promotor".to_string(),
            description: "Promotor inducible por L-arabinosa. Regulado por AraC.".to_string(),
            parameters: vec!["Inducción: 0.1-1% arabinosa".to_string()],
            registry_id: Some("BBa_I0500".to_string()),
            sequence_length: Some(130),
            characteristics: vec![
                "Fuerza: Alta".to_string(),
                "Regulación: Dual (activación/represión)".to_string(),
                "Rango dinámico: Amplio".to_string(),
            ],
        });

        docs.insert("pT7".to_string(), BioPartDoc {
            name: "pT7".to_string(),
            category: "Promotor".to_string(),
            description: "Promotor reconocido por T7 RNA polimerasa. Muy fuerte.".to_string(),
            parameters: vec!["Requiere: T7 RNAP".to_string()],
            registry_id: Some("BBa_I712074".to_string()),
            sequence_length: Some(19),
            characteristics: vec![
                "Fuerza: Muy Alta".to_string(),
                "Ortogonalidad: Alta".to_string(),
                "Uso: Sobreexpresión".to_string(),
            ],
        });

        // Proteínas fluorescentes
        docs.insert("GFP".to_string(), BioPartDoc {
            name: "GFP (Green Fluorescent Protein)".to_string(),
            category: "Reportero".to_string(),
            description: "Proteína fluorescente verde de Aequorea victoria. Excitación: 488nm, Emisión: 507nm.".to_string(),
            parameters: vec![
                "Peso molecular: 26.9 kDa".to_string(),
                "Maduración: ~30 min".to_string(),
            ],
            registry_id: Some("BBa_E0040".to_string()),
            sequence_length: Some(720),
            characteristics: vec![
                "Brillo: Medio".to_string(),
                "Fotoestabilidad: Alta".to_string(),
                "Oligomerización: Monomérica (variantes)".to_string(),
            ],
        });

        docs.insert("RFP".to_string(), BioPartDoc {
            name: "RFP (Red Fluorescent Protein)".to_string(),
            category: "Reportero".to_string(),
            description: "Proteína fluorescente roja. Excitación: 558nm, Emisión: 583nm.".to_string(),
            parameters: vec![
                "Peso molecular: 25.9 kDa".to_string(),
                "Maduración: ~60 min".to_string(),
            ],
            registry_id: Some("BBa_E1010".to_string()),
            sequence_length: Some(706),
            characteristics: vec![
                "Brillo: Medio-Alto".to_string(),
                "Fotoestabilidad: Media".to_string(),
                "Nota: Tetrámero".to_string(),
            ],
        });

        docs.insert("mCherry".to_string(), BioPartDoc {
            name: "mCherry".to_string(),
            category: "Reportero".to_string(),
            description: "Proteína fluorescente roja monomérica derivada de DsRed.".to_string(),
            parameters: vec![
                "Peso molecular: 26.7 kDa".to_string(),
                "Excitación: 587nm".to_string(),
                "Emisión: 610nm".to_string(),
            ],
            registry_id: Some("BBa_J06504".to_string()),
            sequence_length: Some(711),
            characteristics: vec![
                "Brillo: Alto".to_string(),
                "Maduración: ~15 min".to_string(),
                "Oligomerización: Monomérica".to_string(),
            ],
        });

        // Represores
        docs.insert("LacI".to_string(), BioPartDoc {
            name: "LacI (Lac Repressor)".to_string(),
            category: "Represor".to_string(),
            description: "Represor del operón lac. Inhibido por IPTG y alolactosa.".to_string(),
            parameters: vec![
                "Peso molecular: 38.6 kDa".to_string(),
                "Forma activa: Tetrámero".to_string(),
            ],
            registry_id: Some("BBa_C0012".to_string()),
            sequence_length: Some(1083),
            characteristics: vec![
                "Afinidad: Alta (Kd ~10^-13 M)".to_string(),
                "Cooperatividad: Alta".to_string(),
                "Inductor: IPTG, lactosa".to_string(),
            ],
        });

        docs.insert("TetR".to_string(), BioPartDoc {
            name: "TetR (Tet Repressor)".to_string(),
            category: "Represor".to_string(),
            description: "Represor de tetraciclina. Inhibido por tetraciclina y derivados.".to_string(),
            parameters: vec![
                "Peso molecular: 23.4 kDa".to_string(),
                "Forma activa: Dímero".to_string(),
            ],
            registry_id: Some("BBa_C0040".to_string()),
            sequence_length: Some(624),
            characteristics: vec![
                "Afinidad: Muy alta".to_string(),
                "Inductor: aTc, doxiciclina".to_string(),
                "Respuesta: Rápida".to_string(),
            ],
        });

        // RBS
        docs.insert("B0034".to_string(), BioPartDoc {
            name: "B0034 (RBS)".to_string(),
            category: "RBS".to_string(),
            description: "Sitio de unión ribosomal fuerte. Secuencia Shine-Dalgarno optimizada.".to_string(),
            parameters: vec!["Fuerza relativa: 1.0 (referencia)".to_string()],
            registry_id: Some("BBa_B0034".to_string()),
            sequence_length: Some(12),
            characteristics: vec![
                "Eficiencia: Alta".to_string(),
                "Compatibilidad: E. coli".to_string(),
                "Uso: Estándar".to_string(),
            ],
        });

        // Terminadores
        docs.insert("B0015".to_string(), BioPartDoc {
            name: "B0015 (Double Terminator)".to_string(),
            category: "Terminador".to_string(),
            description: "Doble terminador de transcripción. Combina B0010 y B0012.".to_string(),
            parameters: vec!["Eficiencia: >99%".to_string()],
            registry_id: Some("BBa_B0015".to_string()),
            sequence_length: Some(129),
            characteristics: vec![
                "Tipo: Bidireccional".to_string(),
                "Fuerza: Muy alta".to_string(),
                "Read-through: <1%".to_string(),
            ],
        });

        // CRISPR
        docs.insert("Cas9".to_string(), BioPartDoc {
            name: "Cas9 (CRISPR-associated protein 9)".to_string(),
            category: "Nucleasa".to_string(),
            description: "Endonucleasa guiada por ARN del sistema CRISPR-Cas9 de S. pyogenes.".to_string(),
            parameters: vec![
                "Peso molecular: 163 kDa".to_string(),
                "PAM: 5'-NGG-3'".to_string(),
            ],
            registry_id: None,
            sequence_length: Some(4104),
            characteristics: vec![
                "Especificidad: Alta".to_string(),
                "Actividad: Doble corte".to_string(),
                "Requiere: sgRNA".to_string(),
            ],
        });

        docs.insert("dCas9".to_string(), BioPartDoc {
            name: "dCas9 (dead Cas9)".to_string(),
            category: "Regulador".to_string(),
            description: "Cas9 catalíticamente inactiva (D10A, H840A). Usada para CRISPRi/CRISPRa.".to_string(),
            parameters: vec![
                "Peso molecular: 163 kDa".to_string(),
                "Mutaciones: D10A, H840A".to_string(),
            ],
            registry_id: None,
            sequence_length: Some(4104),
            characteristics: vec![
                "Función: Unión sin corte".to_string(),
                "Uso: Represión (CRISPRi)".to_string(),
                "Uso: Activación (CRISPRa)".to_string(),
            ],
        });

        // Toxinas (para kill-switch)
        docs.insert("CcdB".to_string(), BioPartDoc {
            name: "CcdB (Toxin)".to_string(),
            category: "Toxina".to_string(),
            description: "Toxina del sistema toxina-antitoxina CcdA/CcdB. Inhibe DNA girasa.".to_string(),
            parameters: vec![
                "Peso molecular: 11.7 kDa".to_string(),
                "Antitoxina: CcdA".to_string(),
            ],
            registry_id: Some("BBa_P1010".to_string()),
            sequence_length: Some(306),
            characteristics: vec![
                "Mecanismo: Inhibición de girasa".to_string(),
                "Letalidad: Alta".to_string(),
                "⚠️ Requiere contención".to_string(),
            ],
        });

        // Tipos de datos
        docs.insert("DNA".to_string(), BioPartDoc {
            name: "DNA".to_string(),
            category: "Tipo".to_string(),
            description: "Secuencia de ácido desoxirribonucleico. Acepta A, T, G, C, N.".to_string(),
            parameters: vec![],
            registry_id: None,
            sequence_length: None,
            characteristics: vec![
                "Bases: A (adenina), T (timina), G (guanina), C (citosina)".to_string(),
                "N: cualquier base".to_string(),
            ],
        });

        docs.insert("RNA".to_string(), BioPartDoc {
            name: "RNA".to_string(),
            category: "Tipo".to_string(),
            description: "Secuencia de ácido ribonucleico. Acepta A, U, G, C, N.".to_string(),
            parameters: vec![],
            registry_id: None,
            sequence_length: None,
            characteristics: vec![
                "Bases: A (adenina), U (uracilo), G (guanina), C (citosina)".to_string(),
                "Puede formar estructuras secundarias".to_string(),
            ],
        });

        Self { docs }
    }

    /// Obtiene información de hover para una posición dada
    pub fn get_hover(&self, content: &str, position: Position) -> Option<Hover> {
        // Obtener la palabra en la posición
        let lines: Vec<&str> = content.lines().collect();
        let line = lines.get(position.line as usize)?;
        
        let word = self.get_word_at_position(line, position.character as usize)?;
        
        // Buscar documentación estática
        if let Some(doc) = self.docs.get(&word) {
            let markdown = self.format_doc(doc);
            return Some(Hover {
                contents: HoverContents::Markup(MarkupContent {
                    kind: MarkupKind::Markdown,
                    value: markdown,
                }),
                range: None,
            });
        }

        // Información para palabras clave
        if let Some(keyword_doc) = self.get_keyword_doc(&word) {
            return Some(Hover {
                contents: HoverContents::Markup(MarkupContent {
                    kind: MarkupKind::Markdown,
                    value: keyword_doc,
                }),
                range: None,
            });
        }

        // Fallback: type inference from the biological type system
        if let Some(type_hover) = self.get_inferred_type_hover(content, &word) {
            return Some(Hover {
                contents: HoverContents::Markup(MarkupContent {
                    kind: MarkupKind::Markdown,
                    value: type_hover,
                }),
                range: None,
            });
        }

        None
    }

    /// Extrae la palabra en una posición dada
    fn get_word_at_position(&self, line: &str, pos: usize) -> Option<String> {
        let chars: Vec<char> = line.chars().collect();
        if pos >= chars.len() {
            return None;
        }

        // Encontrar inicio de la palabra
        let mut start = pos;
        while start > 0 && (chars[start - 1].is_alphanumeric() || chars[start - 1] == '_') {
            start -= 1;
        }

        // Encontrar fin de la palabra
        let mut end = pos;
        while end < chars.len() && (chars[end].is_alphanumeric() || chars[end] == '_') {
            end += 1;
        }

        if start == end {
            return None;
        }

        Some(chars[start..end].iter().collect())
    }

    /// Formatea la documentación de una parte biológica
    fn format_doc(&self, doc: &BioPartDoc) -> String {
        let mut md = String::new();

        // Título
        md.push_str(&format!("## {} \n\n", doc.name));
        md.push_str(&format!("**Categoría:** {}\n\n", doc.category));
        md.push_str(&format!("{}\n\n", doc.description));

        // Parámetros
        if !doc.parameters.is_empty() {
            md.push_str("### Parámetros\n");
            for param in &doc.parameters {
                md.push_str(&format!("- {}\n", param));
            }
            md.push('\n');
        }

        // Características
        if !doc.characteristics.is_empty() {
            md.push_str("### Características\n");
            for char in &doc.characteristics {
                md.push_str(&format!("- {}\n", char));
            }
            md.push('\n');
        }

        // ID del registro
        if let Some(ref id) = doc.registry_id {
            md.push_str(&format!("**iGEM Registry:** [{}](http://parts.igem.org/Part:{})\n", id, id));
        }

        // Longitud de secuencia
        if let Some(len) = doc.sequence_length {
            md.push_str(&format!("\n**Longitud:** {} bp", len));
        }

        md
    }

    /// Infer rich type information for a word using the biological type system.
    /// This provides hover info for any identifier, not just pre-registered parts.
    fn get_inferred_type_hover(&self, source: &str, word: &str) -> Option<String> {
        // Try to parse and type-check the document
        let mut parser = Parser::new(source).ok()?;
        let ast = parser.parse_program().ok()?;
        
        let mut checker = BioTypeChecker::new();
        let result = checker.check_program(&ast);
        
        // Look up the word in inferred types
        if let Some(type_name) = result.inferred_types.get(word) {
            let mut md = String::new();
            md.push_str(&format!("## `{}`\n\n", word));
            md.push_str(&format!("**Tipo inferido:** `{}`\n\n", type_name));
            
            // Add rich details based on the internal type
            if let Some(bio_type) = checker.inferred_types().get(word) {
                md.push_str(&self.format_rich_type(bio_type));
            }
            
            // If there's a host context, show it
            if let Some(ref host) = result.host {
                md.push_str(&format!("\n**Host:** {}\n", host));
            }
            
            return Some(md);
        }
        
        // Try direct name inference using known parts DB
        let inferred = {
            let _temp_checker = BioTypeChecker::new();
            let env = bio_types::TypeEnvironment::new();
            env.known_parts().lookup(word).cloned()
        };
        
        if let Some(ref bio_type) = inferred {
            if *bio_type != bio_types::BioType::Unknown {
                let mut md = String::new();
                md.push_str(&format!("## `{}`\n\n", word));
                md.push_str(&format!("**Tipo:** `{}`\n\n", bio_type.display_name()));
                md.push_str(&self.format_rich_type(bio_type));
                return Some(md);
            }
        }
        
        None
    }
    
    /// Format rich biological type details for hover display.
    fn format_rich_type(&self, bio_type: &bio_types::BioType) -> String {
        let mut md = String::new();
        
        match bio_type {
            bio_types::BioType::Part(ref pt) => {
                match pt {
                    bio_types::PartType::Promoter(ref p) => {
                        md.push_str("### Promotor\n");
                        md.push_str(&format!("- **Fuerza:** {}\n", format!("{:?}", p.strength)));
                        md.push_str(&format!("- **Regulación:** {}\n", format!("{:?}", p.regulation)));
                        if !p.inducers.is_empty() {
                            md.push_str(&format!("- **Inductores:** {}\n", p.inducers.join(", ")));
                        }
                        md.push_str(&format!("- **Direccionalidad:** {}\n", format!("{:?}", p.directionality)));
                    }
                    bio_types::PartType::RBS(ref r) => {
                        md.push_str("### RBS (Ribosome Binding Site)\n");
                        md.push_str(&format!("- **Tasa de traducción:** {:?}\n", r.translation_rate));
                        if let Some(sp) = r.spacing {
                            md.push_str(&format!("- **Espaciado:** {} nt\n", sp));
                        }
                    }
                    bio_types::PartType::CDS(ref c) => {
                        md.push_str("### CDS (Coding Sequence)\n");
                        md.push_str(&format!("- **Función proteica:** {:?}\n", c.protein_function));
                        if let Some(mw) = c.molecular_weight_kda {
                            md.push_str(&format!("- **Peso molecular:** {:.1} kDa\n", mw));
                        }
                        md.push_str(&format!("- **Toxicidad:** {:?}\n", c.toxicity));
                        md.push_str(&format!("- **Localización:** {:?}\n", c.localization));
                    }
                    bio_types::PartType::Terminator(ref t) => {
                        md.push_str("### Terminador\n");
                        md.push_str(&format!("- **Eficiencia:** {:?}\n", t.efficiency));
                        md.push_str(&format!("- **Clase:** {:?}\n", t.terminator_class));
                    }
                    bio_types::PartType::Reporter(ref r) => {
                        md.push_str("### Reportero\n");
                        md.push_str(&format!("- **Clase:** {:?}\n", r.reporter_class));
                        if let Some(ex) = r.excitation_nm {
                            md.push_str(&format!("- **Excitación:** {} nm\n", ex));
                        }
                        if let Some(em) = r.emission_nm {
                            md.push_str(&format!("- **Emisión:** {} nm\n", em));
                        }
                    }
                    bio_types::PartType::Regulator(ref r) => {
                        md.push_str("### Regulador\n");
                        md.push_str(&format!("- **Clase:** {:?}\n", r.regulator_class));
                        if !r.targets.is_empty() {
                            md.push_str(&format!("- **Targets:** {}\n", r.targets.join(", ")));
                        }
                    }
                    bio_types::PartType::Origin(ref o) => {
                        md.push_str("### Origen de Replicación\n");
                        md.push_str(&format!("- **Número de copias:** {:?}\n", o.copy_number));
                    }
                    bio_types::PartType::SelectionMarker(ref s) => {
                        md.push_str("### Marcador de Selección\n");
                        md.push_str(&format!("- **Clase:** {:?}\n", s.marker_class));
                        if let Some(ref res) = s.resistance_to {
                            md.push_str(&format!("- **Resistencia a:** {}\n", res));
                        }
                    }
                    _ => {
                        md.push_str(&format!("### Parte Biológica\n- **Tipo:** {:?}\n", pt));
                    }
                }
            }
            bio_types::BioType::Host(ref org) => {
                md.push_str("### Organismo Huésped\n");
                md.push_str(&format!("- **Nombre:** {}\n", org.display_name()));
                let (min_gc, max_gc) = org.gc_range();
                md.push_str(&format!("- **GC range:** {:.0}%-{:.0}%\n", min_gc * 100.0, max_gc * 100.0));
                md.push_str(&format!("- **Tasa de crecimiento:** {:.2} doblajes/hr\n", org.growth_rate()));
                md.push_str(&format!("- **BSL:** {}\n", org.biosafety_level()));
            }
            bio_types::BioType::Sequence(ref seq) => {
                md.push_str("### Secuencia\n");
                md.push_str(&format!("- **Tipo:** {}\n", format!("{:?}", seq)));
            }
            bio_types::BioType::Measurement(ref m) => {
                md.push_str("### Medición\n");
                md.push_str(&format!("- **Unidad:** {}\n", m.display_name()));
                md.push_str(&format!("- **Dimensión:** {:?}\n", m.dimension()));
            }
            bio_types::BioType::Gene { ref host, .. } => {
                md.push_str("### Gen\n");
                if let Some(ref h) = host {
                    md.push_str(&format!("- **Host:** {}\n", h.display_name()));
                }
            }
            bio_types::BioType::Circuit { ref host, ref interactions, .. } => {
                md.push_str("### Circuito Genético\n");
                if let Some(ref h) = host {
                    md.push_str(&format!("- **Host:** {}\n", h.display_name()));
                }
                if !interactions.is_empty() {
                    md.push_str(&format!("- **Interacciones:** {}\n", interactions.len()));
                }
            }
            _ => {}
        }
        
        md
    }

    /// Obtiene documentación para palabras clave
    fn get_keyword_doc(&self, keyword: &str) -> Option<String> {
        match keyword {
            "circuit" => Some("## circuit\n\nDefine un circuito genético.\n\n```bioscript\ncircuit MiCircuito {\n    // componentes\n}\n```".to_string()),
            "gene" => Some("## gene\n\nDefine un gen con promotor, RBS, CDS y terminador.\n\n```bioscript\ngene miGen {\n    promoter: pLac,\n    rbs: B0034,\n    cds: GFP,\n    terminator: B0015\n}\n```".to_string()),
            "promoter" => Some("## promoter\n\nDefine un promotor que controla la transcripción.\n\n```bioscript\npromoter pLac;  // Promotor inducible por IPTG\n```".to_string()),
            "kill_switch" => Some("## kill_switch\n\nDefine un sistema de seguridad que elimina las células bajo ciertas condiciones.\n\n```bioscript\nkill_switch {\n    trigger: absence(IPTG),\n    toxin: CcdB,\n    antitoxin: CcdA,\n    delay: 2hr\n}\n```".to_string()),
            "simulate" => Some("## simulate\n\nEjecuta una simulación del circuito.\n\n```bioscript\nsimulate MiCircuito {\n    duration: 24hr,\n    step: 1min\n}\n```".to_string()),
            _ => None,
        }
    }
}

impl Default for HoverProvider {
    fn default() -> Self {
        Self::new()
    }
}
