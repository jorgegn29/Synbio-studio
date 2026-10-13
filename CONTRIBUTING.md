# Contributing to SynBio-LLVM

Thank you for your interest in contributing to SynBio-LLVM! This project aims to make synthetic biology accessible through modern software tools, and we welcome contributions from biologists, engineers, programmers, and anyone passionate about the future of biotechnology.

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [How Can I Contribute?](#how-can-i-contribute)
- [Development Setup](#development-setup)
- [Project Architecture](#project-architecture)
- [Coding Guidelines](#coding-guidelines)
- [Scientific Standards](#scientific-standards)
- [Submitting Changes](#submitting-changes)
- [Reporting Bugs](#reporting-bugs)
- [Suggesting Features](#suggesting-features)

## Code of Conduct

This project follows our [Code of Conduct](CODE_OF_CONDUCT.md). By participating, you agree to uphold a respectful and inclusive environment.

## How Can I Contribute?

### For Biologists
- **Validate scientific data**: Check that kinetic parameters, thermodynamic values, and biological constants are accurate
- **Add new parts**: Contribute iGEM parts with experimental data to the parts library
- **Review biosafety rules**: Help improve the biosecurity scanner with current regulations
- **Write protocols**: Add lab protocols for new assembly methods
- **Test with real designs**: Try designing your circuits in BioScript and report issues

### For Programmers
- **TypeScript extension**: Add new VS Code commands, improve UI/UX, optimize performance
- **Rust LSP server**: Improve parser, add diagnostics, optimize compilation pipeline
- **Python engine**: Improve ML models, add new prediction endpoints
- **Testing**: Write unit tests, integration tests, and end-to-end tests
- **Documentation**: Improve inline documentation and tutorials

### For Students
- **Tutorials**: Write beginner-friendly tutorials
- **Examples**: Create example `.bio` files showcasing different circuit designs
- **Translations**: Translate documentation to other languages
- **Bug reports**: Use the tool and report any issues you find

## Development Setup

### Prerequisites

- **Node.js** ≥ 18
- **Rust** ≥ 1.70 (install via [rustup](https://rustup.rs/))
- **Python** ≥ 3.10
- **VS Code** ≥ 1.85

### Clone and Build

```bash
# Clone the repository
git clone https://github.com/YOUR_USERNAME/synbio-llvm.git
cd synbio-llvm

# Install Node dependencies
npm install
cd client && npm install && cd ..

# Build the TypeScript extension
cd client && npm run build && cd ..

# Build the Rust LSP server
cd server && cargo build --release && cd ..

# Set up Python environment
python -m venv .venv
# Windows:
.venv\Scripts\Activate.ps1
# Linux/macOS:
source .venv/bin/activate
pip install -r requirements.txt
```

### Running in Development

1. Open the project folder in VS Code
2. Press `F5` to launch the Extension Development Host
3. Create or open a `.bio` file to test

### Running Tests

```bash
# TypeScript tests
cd client && npm test

# Rust tests
cd server && cargo test

# Python tests
cd python-engine && python -m pytest
```

## Project Architecture

```
synbio-llvm/
├── client/              # VS Code extension (TypeScript)
│   └── src/             # 27 source files, 15,730 lines
│       ├── extension.ts            # Entry point + 27 commands
│       ├── gillespie-simulator.ts  # Stochastic simulation
│       ├── codon-optimizer.ts      # Codon optimization
│       ├── parts-library.ts       # iGEM Registry browser
│       ├── biosecurity-scanner.ts # CDC/NIH compliance
│       └── ...                    # 22 more modules
├── server/              # LSP server (Rust)
│   └── src/             # 19 source files, 7,333 lines
│       ├── compiler/    # Lexer → Parser → AST → IR → CodeGen
│       ├── lsp/         # Language Server Protocol implementation
│       └── physics/     # Thermodynamics, FBA, RNA folding
├── python-engine/       # ML engine (Python)
│   └── server.py        # FastAPI + ONNX Runtime, 406 lines
├── syntaxes/            # TextMate grammar for BioScript
├── snippets/            # VS Code snippets
└── examples/            # Example .bio files
```

## Coding Guidelines

### TypeScript (Extension)

- Use TypeScript strict mode
- Follow VS Code extension best practices
- Dispose all resources in `deactivate()`
- Use `vscode.window.createWebviewPanel()` for rich UIs
- Prefix private members with underscore
- Document all public APIs with JSDoc

```typescript
// Good
/**
 * Calculate the Codon Adaptation Index for a DNA sequence.
 * @param sequence - DNA sequence (ATGC only)
 * @param organism - Target host organism
 * @returns CAI value between 0 and 1 (Sharp & Li, 1987)
 */
public calculateCAI(sequence: string, organism: HostOrganism): number {
    // Implementation with Kazusa DB tables
}
```

### Rust (LSP Server)

- Follow Rust 2021 edition idioms
- Use `thiserror` for error types
- All AST nodes must carry `Span` for diagnostics
- Use `logos` macros for lexer tokens
- Document unsafe code (there should be none)

```rust
// Good
/// Parse a circuit declaration with optional 'safe' modifier.
/// 
/// Grammar: `['safe'] 'circuit' IDENT '{' circuit_body '}'`
fn parse_circuit(&mut self) -> Result<CircuitDecl, ParseError> {
    // Implementation
}
```

### Python (ML Engine)

- Use type hints everywhere
- Use Pydantic models for API schemas
- Graceful fallback when ONNX Runtime is unavailable
- Follow PEP 8

## Scientific Standards

**This is the most important section.** SynBio-LLVM's value depends on scientific accuracy.

### Rule #1: No invented values

Every numerical constant must come from a published, peer-reviewed source. Include the citation directly in the code:

```typescript
// ✅ GOOD
const Kd = 1.26e-6; // M, IPTG-LacI dissociation constant
// Daber et al. (2009) J Mol Biol 391:513, Table 2

// ❌ BAD
const Kd = 0.001; // some binding constant
```

### Rule #2: Use real units

Always specify units in comments. Never store a value without knowing its unit:

```typescript
// ✅ GOOD
const gamma_m = 0.3466; // min⁻¹, mRNA degradation rate (t½ = 2 min)
// Bernstein et al. (2002) PNAS 99:9697

// ❌ BAD
const degradation = 0.35; // degradation rate
```

### Rule #3: BSL by organism, not complexity

Biosafety levels are determined by the Risk Group of the organism (CDC/NIH BMBL 6th Edition), **never** by the number of parts or complexity of the circuit.

### Rule #4: Cite the primary source

Don't cite reviews or textbooks when the original paper is available. Cite the paper that measured the value.

### Adding new scientific data

When adding kinetic parameters, thermodynamic values, or biological constants:

1. Find the primary publication
2. Record: value, units, organism, conditions (temperature, pH, buffer)
3. Add inline citation with DOI or journal/year/page
4. Add the full reference to the references section
5. Cross-check against databases (BRENDA, KEGG, UniProt) when possible

## Submitting Changes

### Pull Request Process

1. **Fork** the repository
2. Create a **feature branch**: `git checkout -b feature/your-feature-name`
3. Make your changes with clear, atomic commits
4. **Test** your changes
5. Update **documentation** if needed
6. Submit a **Pull Request** against `main`

### Commit Messages

Follow conventional commits:

```
feat: add Golden Gate assembly protocol with BsaI-HFv2 parameters
fix: correct SantaLucia ΔH for GC/CG pair (-10.6, not -9.8)
docs: add tutorial for toggle switch design
refactor: split circuit-optimizer into separate mutation strategies
test: add Kd validation tests for IPTG-LacI binding
chore: update tower-lsp to 0.21
```

### PR Checklist

- [ ] Code compiles without errors (`npm run build` + `cargo build`)
- [ ] All existing tests pass
- [ ] New features include tests
- [ ] Scientific values include citations
- [ ] Documentation updated if needed
- [ ] No `console.log()` left in production code
- [ ] WebView panels dispose properly

## Reporting Bugs

### Bug Report Template

Use the GitHub issue template, including:

1. **Description**: What happened?
2. **Expected behavior**: What should happen?
3. **Steps to reproduce**: Minimal .bio file + steps
4. **Environment**: OS, VS Code version, Node version
5. **Screenshots**: If visual issue, include screenshot

### Security Vulnerabilities

If you find a security vulnerability (especially in the biosecurity scanner), **do not open a public issue**. Email security@synbio-llvm.org (or the maintainer directly) with details. See [SECURITY.md](SECURITY.md).

## Suggesting Features

We love feature requests! Please include:

1. **Problem**: What problem does this solve?
2. **Proposed solution**: How would you implement it?
3. **Scientific basis**: If it involves biology, what papers support it?
4. **Alternatives**: What other approaches did you consider?

### Priority Areas

We're particularly interested in contributions for:
- More host organisms (plant cells, mammalian cells)
- Integration with DNA synthesis APIs (Twist, IDT)
- More metabolic pathways with BRENDA kinetics
- Improved RNA structure prediction
- Multi-language support for documentation
- Accessibility improvements

## Recognition

All contributors are recognized in our [CONTRIBUTORS.md](CONTRIBUTORS.md) file. Significant scientific contributions will be acknowledged in any publications.

## License

By contributing, you agree that your contributions will be licensed under the [MIT License](LICENSE).

---

Thank you for helping make synthetic biology more accessible! 🧬
