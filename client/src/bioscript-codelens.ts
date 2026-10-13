/**
 * BioScript CodeLens Provider
 * 
 * Shows actionable lenses above circuit, gene, promoter, and rule declarations:
 *   - ▶ Simular   — over circuits → runs Gillespie SSA
 *   - 🔬 Analizar — over genes → protein analysis or sequence analysis
 *   - 📋 Protocolo — over circuits → generates lab protocol
 *   - ☣ BSL      — over host declarations → opens biosafety classifier
 *   - 🧬 SBOL    — over circuits → exports to SBOL
 *   - 🧬 Ensamblaje — over circuits → opens plasmid assembly planner
 *   - 🔍 Partes   — over rbs/terminator → shows parts library info
 *
 * References: VS Code CodeLens API, iGEM Registry standard parts
 */

import * as vscode from 'vscode';

interface BioDeclaration {
    kind: 'circuit' | 'gene' | 'promoter' | 'rule' | 'host';
    name: string;
    range: vscode.Range;
    line: number;
    meta?: Record<string, string>;
}

export class BioScriptCodeLensProvider implements vscode.CodeLensProvider {
    private _onDidChangeCodeLenses = new vscode.EventEmitter<void>();
    readonly onDidChangeCodeLenses = this._onDidChangeCodeLenses.event;

    constructor() {
        // Refresh lenses when document changes
        vscode.workspace.onDidChangeTextDocument(() => {
            this._onDidChangeCodeLenses.fire();
        });
    }

    provideCodeLenses(document: vscode.TextDocument): vscode.CodeLens[] {
        if (document.languageId !== 'bioscript') { return []; }

        const text = document.getText();
        const declarations = this.parseDeclarations(text, document);
        const lenses: vscode.CodeLens[] = [];

        for (const decl of declarations) {
            switch (decl.kind) {
                case 'circuit':
                    lenses.push(
                        new vscode.CodeLens(decl.range, {
                            title: '▶ Simular',
                            command: 'synbio.simulate',
                            tooltip: `Simular ${decl.name} con Gillespie SSA`,
                        }),
                        new vscode.CodeLens(decl.range, {
                            title: '🔨 Compilar',
                            command: 'synbio.compile',
                            tooltip: `Compilar circuito ${decl.name}`,
                        }),
                        new vscode.CodeLens(decl.range, {
                            title: '📋 Protocolo',
                            command: 'synbio.generateProtocol',
                            tooltip: `Generar protocolo de laboratorio para ${decl.name}`,
                        }),
                        new vscode.CodeLens(decl.range, {
                            title: '🧬 SBOL',
                            command: 'synbio.exportSBOL',
                            tooltip: `Exportar ${decl.name} a SBOL 3.0`,
                        }),
                        new vscode.CodeLens(decl.range, {
                            title: '🧬 Ensamblaje',
                            command: 'synbio.plasmidMap',
                            tooltip: `Planificar ensamblaje plasmídico de ${decl.name}`,
                        })
                    );
                    break;

                case 'gene':
                    lenses.push(
                        new vscode.CodeLens(decl.range, {
                            title: `🔬 Analizar ${decl.name}`,
                            command: 'synbio.sequenceAnalysis',
                            tooltip: `Análisis de secuencia del gen ${decl.name}`,
                        }),
                        new vscode.CodeLens(decl.range, {
                            title: '🧪 Proteína',
                            command: 'synbio.proteinProperties',
                            tooltip: `Análisis ProtParam del producto de ${decl.name}`,
                        })
                    );
                    // If gene has RBS, add optimization lens
                    if (decl.meta?.rbs) {
                        lenses.push(
                            new vscode.CodeLens(decl.range, {
                                title: `⚡ Optimizar RBS (${decl.meta.rbs})`,
                                command: 'synbio.optimizeCodons',
                                tooltip: `Optimizar codones y RBS de ${decl.name}`,
                            })
                        );
                    }
                    break;

                case 'promoter':
                    lenses.push(
                        new vscode.CodeLens(decl.range, {
                            title: `📊 Caracterizar ${decl.name}`,
                            command: 'synbio.showCopilotAnalysis',
                            tooltip: `Ver caracterización del promotor ${decl.name}`,
                        })
                    );
                    if (decl.meta?.type === 'inducible' && decl.meta?.inducer) {
                        lenses.push(
                            new vscode.CodeLens(decl.range, {
                                title: `💊 Inductor: ${decl.meta.inducer}`,
                                command: 'synbio.partsLibrary',
                                tooltip: `Promotor inducible por ${decl.meta.inducer} — ver en biblioteca`,
                            })
                        );
                    }
                    break;

                case 'host':
                    lenses.push(
                        new vscode.CodeLens(decl.range, {
                            title: `☣ Clasificar BSL`,
                            command: 'synbio.biosafetyClassify',
                            tooltip: `Clasificar nivel de bioseguridad para ${decl.name}`,
                        }),
                        new vscode.CodeLens(decl.range, {
                            title: `🔒 Biosecurity Scan`,
                            command: 'synbio.biosecurity',
                            tooltip: `Escanear ${decl.name} contra agentes selectos`,
                        })
                    );
                    break;

                case 'rule':
                    lenses.push(
                        new vscode.CodeLens(decl.range, {
                            title: `🔗 ${decl.name}`,
                            command: 'synbio.debugCircuit',
                            tooltip: `Depurar interacción: ${decl.name}`,
                        })
                    );
                    break;
            }
        }

        return lenses;
    }

    private parseDeclarations(text: string, document: vscode.TextDocument): BioDeclaration[] {
        const decls: BioDeclaration[] = [];
        const lines = text.split('\n');

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const trimmed = line.trim();

            // Skip comments
            if (trimmed.startsWith('//') || trimmed.startsWith('/*')) { continue; }

            // circuit name {
            const circuitMatch = trimmed.match(/^circuit\s+(\w+)\s*\{?/);
            if (circuitMatch) {
                decls.push({
                    kind: 'circuit',
                    name: circuitMatch[1],
                    range: new vscode.Range(i, 0, i, line.length),
                    line: i,
                });
            }

            // gene name { ... }
            const geneMatch = trimmed.match(/^gene\s+(\w+)\s*\{?/);
            if (geneMatch) {
                // Look ahead for rbs, promoter, terminator in the gene block
                const meta: Record<string, string> = {};
                for (let j = i; j < Math.min(i + 8, lines.length); j++) {
                    const gLine = lines[j].trim();
                    const rbsM = gLine.match(/rbs\s*:\s*(\w+)/);
                    if (rbsM) { meta.rbs = rbsM[1]; }
                    const promM = gLine.match(/promoter\s*:\s*(\w+)/);
                    if (promM) { meta.promoter = promM[1]; }
                    const termM = gLine.match(/terminator\s*:\s*(\w+)/);
                    if (termM) { meta.terminator = termM[1]; }
                    if (gLine === '}') { break; }
                }
                decls.push({
                    kind: 'gene',
                    name: geneMatch[1],
                    range: new vscode.Range(i, 0, i, line.length),
                    line: i,
                    meta,
                });
            }

            // promoter name {
            const promMatch = trimmed.match(/^promoter\s+(\w+)\s*\{?/);
            if (promMatch) {
                const meta: Record<string, string> = {};
                for (let j = i; j < Math.min(i + 6, lines.length); j++) {
                    const pLine = lines[j].trim();
                    const typeM = pLine.match(/type\s*:\s*["']?(\w+)["']?/);
                    if (typeM) { meta.type = typeM[1]; }
                    const indM = pLine.match(/inducer\s*:\s*["']?(\w+)["']?/);
                    if (indM) { meta.inducer = indM[1]; }
                    if (pLine === '}') { break; }
                }
                decls.push({
                    kind: 'promoter',
                    name: promMatch[1],
                    range: new vscode.Range(i, 0, i, line.length),
                    line: i,
                    meta,
                });
            }

            // host: "ecoli_k12"
            const hostMatch = trimmed.match(/host\s*:\s*["']([^"']+)["']/);
            if (hostMatch) {
                decls.push({
                    kind: 'host',
                    name: hostMatch[1],
                    range: new vscode.Range(i, 0, i, line.length),
                    line: i,
                });
            }

            // rule X represses/activates/inhibits Y
            const ruleMatch = trimmed.match(/^rule\s+(\w+)\s+(represses|activates|inhibits)\s+(\w+)/);
            if (ruleMatch) {
                decls.push({
                    kind: 'rule',
                    name: `${ruleMatch[1]} ${ruleMatch[2]} ${ruleMatch[3]}`,
                    range: new vscode.Range(i, 0, i, line.length),
                    line: i,
                });
            }
        }

        return decls;
    }
}

/**
 * Registers the CodeLens provider for bioscript files
 */
export function registerBioScriptCodeLens(context: vscode.ExtensionContext): void {
    const provider = new BioScriptCodeLensProvider();
    context.subscriptions.push(
        vscode.languages.registerCodeLensProvider(
            { language: 'bioscript', scheme: 'file' },
            provider
        ),
        vscode.languages.registerCodeLensProvider(
            { language: 'bioscript', scheme: 'untitled' },
            provider
        )
    );
}
