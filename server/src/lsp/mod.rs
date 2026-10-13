//! Módulo LSP - Implementación del Language Server Protocol

mod backend;
mod completion;
pub mod diagnostics;
mod hover;

pub use backend::BioScriptBackend;
