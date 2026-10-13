/**
 * BioScript Diagnostics Provider
 * 
 * Provides real-time diagnostics for .bio files WITHOUT requiring the Rust LSP server.
 * Catches structural errors, missing declarations, unsafe patterns, and design issues.
 *
 * Categories:
 *   BIO-E001..E099 — Syntax & structural errors
 *   BIO-W001..W099 — Design warnings
 *   BIO-I001..I099 — Informational hints
 *   BIO-S001..S099 — Safety/biosecurity
 *
 * References:
 *   - iGEM Registry: parts.igem.org
 *   - BMBL 6th Edition (Select Agent Program)
 *   - Salis et al. 2009 (RBS Calculator)
 */

import * as vscode from 'vscode';
import { detectToxicExpressionBurden } from './bio-linter-rules';
import { calculateGCContent } from './real-thermodynamics';

// ── Known parts database ──
const KNOWN_RBS: Record<string, { strength: string; au: number }> = {
    'B0030': { strength: 'weak', au: 100 },
    'B0031': { strength: 'weak', au: 150 },
    'B0032': { strength: 'medium', au: 300 },
    'B0033': { strength: 'weak', au: 50 },
    'B0034': { strength: 'strong', au: 1000 },
    'B0035': { strength: 'medium', au: 500 },
};

const KNOWN_TERMINATORS: Record<string, { efficiency: number }> = {
    'B0010': { efficiency: 0.98 },
    'B0011': { efficiency: 0.90 },
    'B0012': { efficiency: 0.95 },
    'B0015': { efficiency: 0.99 },  // double terminator
    'L3S2P21': { efficiency: 0.97 },
};

const KNOWN_PROMOTERS = new Set([
    'pLac', 'pTet', 'pBAD', 'pT7', 'pConst', 'pCI', 'pLux', 'pSensor', 'pOutput',
    'pTrc', 'pTac', 'pLacUV5', 'pRha', 'pSal', 'pR', 'pL', 'J23100', 'J23101',
    'J23106', 'J23116', 'J23119',
]);

const KNOWN_REPORTERS = new Set([
    'GFP', 'RFP', 'BFP', 'YFP', 'CFP', 'mCherry', 'mVenus', 'mCerulean',
    'sfGFP', 'eGFP', 'dsRed', 'LuxAB',
]);

const SELECT_AGENTS = [
    'B_anthracis', 'Y_pestis', 'F_tularensis', 'C_botulinum', 'Ebola', 'SARS',
    'Variola', 'Marburg', 'Nipah', 'H5N1',
];

const CHASSIS_BSL: Record<string, number> = {
    'ecoli_k12': 1, 'ecoli_dh5alpha': 1, 'ecoli_bl21': 1, 'ecoli_mg1655': 1,
    'ecoli_nissle1917': 1, 'ecoli_top10': 1, 'yeast_s288c': 1, 'yeast_by4741': 1,
    'bacillus_subtilis_168': 1, 'pseudomonas_putida_kt2440': 1,
    'synechocystis_pcc6803': 1, 'vibrio_natriegens': 1,
    'pichia_pastoris': 1, 'corynebacterium_glutamicum': 1,
    'agrobacterium_tumefaciens': 2, 'salmonella_typhimurium': 2,
    'mycobacterium_smegmatis': 2,
};

export class BioScriptDiagnosticsProvider {
    private diagnosticCollection: vscode.DiagnosticCollection;
    private debounceTimer: NodeJS.Timeout | undefined;

    constructor() {
        this.diagnosticCollection = vscode.languages.createDiagnosticCollection('bioscript');
    }

    activate(context: vscode.ExtensionContext): void {
        // Analyze on open
        if (vscode.window.activeTextEditor?.document.languageId === 'bioscript') {
            this.analyze(vscode.window.activeTextEditor.document);
        }

        context.subscriptions.push(
            vscode.workspace.onDidChangeTextDocument(e => {
                if (e.document.languageId === 'bioscript') {
                    this.debouncedAnalyze(e.document);
                }
            }),
            vscode.window.onDidChangeActiveTextEditor(editor => {
                if (editor?.document.languageId === 'bioscript') {
                    this.analyze(editor.document);
                }
            }),
            vscode.workspace.onDidCloseTextDocument(doc => {
                this.diagnosticCollection.delete(doc.uri);
            }),
            this.diagnosticCollection
        );
    }

    private debouncedAnalyze(doc: vscode.TextDocument): void {
        if (this.debounceTimer) { clearTimeout(this.debounceTimer); }
        this.debounceTimer = setTimeout(() => this.analyze(doc), 400);
    }

    analyze(document: vscode.TextDocument): void {
        const text = document.getText();
        const lines = text.split('\n');
        const diagnostics: vscode.Diagnostic[] = [];

        // Collected declarations
        const declaredCircuits = new Set<string>();
        const declaredGenes = new Set<string>();
        const declaredPromoters = new Set<string>();
        const usedPromoters = new Set<string>();
        const usedRBS = new Set<string>();
        const usedTerminators = new Set<string>();
        const genesWithoutTerminator: { name: string; line: number }[] = [];
        const genesWithoutRBS: { name: string; line: number }[] = [];
        let hasHost = false;
        let hasKillSwitch = false;
        let hostOrg = '';
        let hostLine = -1;
        let inCircuit = false;
        let circuitBraceDepth = 0;

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const trimmed = line.trim();

            // Skip comments
            if (trimmed.startsWith('//')) { continue; }

            // ── Brace tracking ──
            const opens = (trimmed.match(/\{/g) || []).length;
            const closes = (trimmed.match(/\}/g) || []).length;

            // ── circuit declaration ──
            const circuitM = trimmed.match(/^circuit\s+(\w+)\s*\{?/);
            if (circuitM) {
                const name = circuitM[1];
                if (declaredCircuits.has(name)) {
                    diagnostics.push(this.makeDiag(i, 0, line.length, `Circuito '${name}' declarado múltiples veces`, 'BIO-E010', vscode.DiagnosticSeverity.Error));
                }
                declaredCircuits.add(name);
                inCircuit = true;
                circuitBraceDepth = 1;

                // Name convention check
                if (!/^[a-z_][a-z0-9_]*$/.test(name)) {
                    diagnostics.push(this.makeDiag(i, trimmed.indexOf(name), trimmed.indexOf(name) + name.length,
                        `Nombre de circuito '${name}' debería usar snake_case (ej: mi_circuito)`,
                        'BIO-W010', vscode.DiagnosticSeverity.Warning));
                }
            }

            if (inCircuit) {
                circuitBraceDepth += opens - closes;
                if (circuitBraceDepth <= 0) { inCircuit = false; }
            }

            // ── host declaration ──
            const hostM = trimmed.match(/host\s*:\s*["']([^"']+)["']/);
            if (hostM) {
                hasHost = true;
                hostOrg = hostM[1];
                hostLine = i;

                if (!CHASSIS_BSL[hostOrg]) {
                    diagnostics.push(this.makeDiag(i, line.indexOf(hostOrg), line.indexOf(hostOrg) + hostOrg.length,
                        `Organismo '${hostOrg}' no reconocido en la base de datos de chassis. Organismos soportados: ${Object.keys(CHASSIS_BSL).slice(0, 5).join(', ')}...`,
                        'BIO-W020', vscode.DiagnosticSeverity.Warning));
                }

                // Check for select agent
                for (const agent of SELECT_AGENTS) {
                    if (hostOrg.toLowerCase().includes(agent.toLowerCase())) {
                        diagnostics.push(this.makeDiag(i, 0, line.length,
                            `⚠️ AGENTE SELECTO detectado: ${hostOrg}. Requiere registro CDC/APHIS según 42 CFR Part 73`,
                            'BIO-S001', vscode.DiagnosticSeverity.Error));
                    }
                }
            }

            // ── gene declaration ──
            const geneM = trimmed.match(/^gene\s+(\w+)\s*\{?/);
            if (geneM) {
                const name = geneM[1];
                declaredGenes.add(name);

                // Look ahead for rbs and terminator
                let foundRBS = false;
                let foundTerminator = false;
                let foundPromoter = false;
                for (let j = i; j < Math.min(i + 10, lines.length); j++) {
                    const gLine = lines[j].trim();
                    if (gLine.match(/rbs\s*:/)) {
                        foundRBS = true;
                        const rbsM = gLine.match(/rbs\s*:\s*(\w+)/);
                        if (rbsM) { usedRBS.add(rbsM[1]); }
                    }
                    if (gLine.match(/terminator\s*:/)) {
                        foundTerminator = true;
                        const termM = gLine.match(/terminator\s*:\s*(\w+)/);
                        if (termM) { usedTerminators.add(termM[1]); }
                    }
                    if (gLine.match(/promoter\s*:/)) {
                        foundPromoter = true;
                        const promM = gLine.match(/promoter\s*:\s*(\w+)/);
                        if (promM) { usedPromoters.add(promM[1]); }
                    }
                    if (gLine === '}') { break; }
                }

                if (!foundRBS) {
                    genesWithoutRBS.push({ name, line: i });
                }
                if (!foundTerminator) {
                    genesWithoutTerminator.push({ name, line: i });
                }
                if (!foundPromoter) {
                    diagnostics.push(this.makeDiag(i, 0, line.length,
                        `Gen '${name}' no tiene promotor asignado. Sin promotor no habrá transcripción`,
                        'BIO-E030', vscode.DiagnosticSeverity.Error));
                }
            }

            // ── promoter declaration ──
            const promDeclM = trimmed.match(/^promoter\s+(\w+)\s*\{?/);
            if (promDeclM) {
                declaredPromoters.add(promDeclM[1]);
            }

            // ── rule check ──
            const ruleM = trimmed.match(/^rule\s+(\w+)\s+(represses|activates|inhibits)\s+(\w+)/);
            if (ruleM) {
                const source = ruleM[1];
                const target = ruleM[3];
                // Check that source gene exists
                // (deferred check — we collect all then verify at end)
            }

            // ── kill switch detection ──
            if (trimmed.includes('kill_switch') || trimmed.includes('mazF') || trimmed.includes('CcdB') || trimmed.includes('toxin')) {
                hasKillSwitch = true;
            }

            // ── DNA sequence checks ──
            const dnaM = trimmed.match(/["']([ACGTUacgtu]{10,})["']/);
            if (dnaM) {
                const seq = dnaM[1].toUpperCase().replace(/U/g, 'T');
                const gc = calculateGCContent(seq);

                if (gc < 25 || gc > 75) {
                    const startCol = line.indexOf(dnaM[1]);
                    diagnostics.push(this.makeDiag(i, startCol, startCol + dnaM[1].length,
                        `Contenido GC extremo: ${gc.toFixed(1)}% (rango óptimo 40-60%). Esto puede causar problemas de expresión`,
                        'BIO-W040', vscode.DiagnosticSeverity.Warning));
                }

                // Check for internal restriction sites that break BioBrick
                const bbSites: Record<string, string> = {
                    'GAATTC': 'EcoRI', 'TCTAGA': 'XbaI', 'ACTAGT': 'SpeI', 'CTGCAG': 'PstI', 'GCGGCCGC': 'NotI',
                };
                for (const [site, enzyme] of Object.entries(bbSites)) {
                    const pos = seq.indexOf(site);
                    if (pos !== -1) {
                        const startCol = line.indexOf(dnaM[1]);
                        diagnostics.push(this.makeDiag(i, startCol + pos, startCol + pos + site.length,
                            `Sitio de restricción ${enzyme} (${site}) detectado en posición ${pos + 1}. Esto rompe la compatibilidad BioBrick RFC[10]`,
                            'BIO-W041', vscode.DiagnosticSeverity.Warning));
                    }
                }
            }

            // ── Detect empty blocks ──
            if (trimmed.match(/^(circuit|gene|promoter)\s+\w+\s*\{\s*\}\s*$/)) {
                diagnostics.push(this.makeDiag(i, 0, line.length,
                    `Bloque vacío. Añade propiedades dentro de las llaves`,
                    'BIO-W050', vscode.DiagnosticSeverity.Warning));
            }
        }

        // ── Post-parse checks ──

        // Missing host
        if (declaredCircuits.size > 0 && !hasHost) {
            diagnostics.push(this.makeDiag(0, 0, lines[0].length,
                `Ningún circuito declara host. Añade 'host: "ecoli_k12"' dentro del circuit. El organismo es necesario para BSL y optimización de codones`,
                'BIO-W001', vscode.DiagnosticSeverity.Warning));
        }

        // Genes without RBS
        for (const g of genesWithoutRBS) {
            diagnostics.push(this.makeDiag(g.line, 0, lines[g.line].length,
                `Gen '${g.name}' sin RBS. Sin sitio de unión al ribosoma no habrá traducción. Usa rbs: B0034 (fuerte) o B0032 (medio)`,
                'BIO-W030', vscode.DiagnosticSeverity.Warning));
        }

        // Genes without terminator
        for (const g of genesWithoutTerminator) {
            diagnostics.push(this.makeDiag(g.line, 0, lines[g.line].length,
                `Gen '${g.name}' sin terminador. Sin terminador habrá read-through transcripcional. Usa terminator: B0015 (doble, 99%)`,
                'BIO-W031', vscode.DiagnosticSeverity.Warning));
        }

        // No kill switch warning for multi-gene circuits
        if (declaredGenes.size >= 2 && !hasKillSwitch) {
            const lastLine = lines.length - 1;
            diagnostics.push(this.makeDiag(lastLine, 0, lines[lastLine].length,
                `Circuito con ${declaredGenes.size} genes pero sin kill switch. Considera añadir biocontención (ej: mazF/mazE, CcdB). Requerido por iGEM Safety Committee`,
                'BIO-S010', vscode.DiagnosticSeverity.Information));
        }

        // RBS strength hints
        for (const rbsName of usedRBS) {
            const info = KNOWN_RBS[rbsName];
            if (info) {
                // Find where it's used
                for (let i = 0; i < lines.length; i++) {
                    if (lines[i].includes(`rbs: ${rbsName}`) || lines[i].includes(`rbs:${rbsName}`)) {
                        const col = lines[i].indexOf(rbsName);
                        diagnostics.push(this.makeDiag(i, col, col + rbsName.length,
                            `RBS ${rbsName}: fuerza ${info.strength} (~${info.au} a.u., Salis 2009). ${info.strength === 'weak' ? 'Considera B0034 para mayor expresión' : ''}`,
                            'BIO-I001', vscode.DiagnosticSeverity.Hint));
                        break;
                    }
                }
            }
        }

        // Terminator efficiency hints
        for (const termName of usedTerminators) {
            const info = KNOWN_TERMINATORS[termName];
            if (info) {
                for (let i = 0; i < lines.length; i++) {
                    if (lines[i].includes(`terminator: ${termName}`) || lines[i].includes(`terminator:${termName}`)) {
                        const col = lines[i].indexOf(termName);
                        diagnostics.push(this.makeDiag(i, col, col + termName.length,
                            `Terminador ${termName}: eficiencia ${(info.efficiency * 100).toFixed(0)}%. ${info.efficiency < 0.95 ? 'Considera B0015 (doble terminador, 99%)' : '✓ Alta eficiencia'}`,
                            'BIO-I002', vscode.DiagnosticSeverity.Hint));
                        break;
                    }
                }
            }
        }

        for (const finding of detectToxicExpressionBurden(text)) {
            diagnostics.push(this.makeDiag(
                finding.line,
                finding.startChar,
                finding.endChar,
                finding.message,
                finding.code,
                vscode.DiagnosticSeverity.Warning,
            ));
        }

        this.diagnosticCollection.set(document.uri, diagnostics);
    }

    private makeDiag(line: number, startChar: number, endChar: number, message: string, code: string, severity: vscode.DiagnosticSeverity): vscode.Diagnostic {
        const range = new vscode.Range(line, Math.max(0, startChar), line, Math.max(startChar + 1, endChar));
        const diag = new vscode.Diagnostic(range, message, severity);
        diag.source = 'SynBio-LLVM';
        diag.code = code;
        return diag;
    }

    dispose(): void {
        if (this.debounceTimer) { clearTimeout(this.debounceTimer); }
        this.diagnosticCollection.dispose();
    }
}
