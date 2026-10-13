/**
 * BioScript DocumentSymbolProvider — Outline panel (Ctrl+Shift+O)
 *
 * Proporciona navegación estructurada del código BioScript:
 *   Circuit (Class)
 *     ├── TU1 (Method)
 *     │   ├── promoter pLac (Property)
 *     │   ├── rbs B0034 (Constant)
 *     │   ├── gene gfp → GFP (Function)
 *     │   └── terminator B0015 (Property)
 *     ├── Connections (Namespace)
 *     │   ├── LacI ⊣ pTet (Event)
 *     │   └── pLac → gfp (Event)
 *     └── kill_switch (Struct)
 *         ├── trigger (EnumMember)
 *         ├── toxin CcdB (EnumMember)
 *         └── antitoxin CcdA (EnumMember)
 *   Host (Module)
 *   Rule (Interface)
 *
 * Los símbolos aparecen en:
 *   - Outline panel (sidebar)
 *   - Breadcrumbs (barra de navegación)
 *   - Ctrl+Shift+O (Go to Symbol in File)
 *   - Ctrl+T (Go to Symbol in Workspace)
 */

import * as vscode from 'vscode';

export class BioScriptDocumentSymbolProvider implements vscode.DocumentSymbolProvider {

    provideDocumentSymbols(
        document: vscode.TextDocument,
        _token: vscode.CancellationToken
    ): vscode.ProviderResult<vscode.DocumentSymbol[]> {
        const symbols: vscode.DocumentSymbol[] = [];
        const text = document.getText();
        const lines = text.split('\n');

        let i = 0;
        while (i < lines.length) {
            const line = lines[i].trim();

            // ── Circuit ──
            const circuitMatch = line.match(/^circuit\s+(\w+)/);
            if (circuitMatch) {
                const circuitName = circuitMatch[1];
                const startLine = i;
                const endLine = this.findBlockEnd(lines, i);

                const circuitRange = new vscode.Range(startLine, 0, endLine, lines[endLine]?.length || 0);
                const circuitSelectRange = new vscode.Range(
                    startLine,
                    line.indexOf(circuitName),
                    startLine,
                    line.indexOf(circuitName) + circuitName.length
                );

                const circuitSymbol = new vscode.DocumentSymbol(
                    circuitName,
                    'Genetic Circuit',
                    vscode.SymbolKind.Class,
                    circuitRange,
                    circuitSelectRange
                );

                // Parse children within the circuit
                this.parseCircuitChildren(lines, startLine + 1, endLine, circuitSymbol);

                symbols.push(circuitSymbol);
                i = endLine + 1;
                continue;
            }

            // ── Top-level host ──
            const hostMatch = line.match(/^host\s+(\w+)/);
            if (hostMatch) {
                const hostRange = new vscode.Range(i, 0, i, lines[i].length);
                symbols.push(new vscode.DocumentSymbol(
                    hostMatch[1],
                    'Chassis organism',
                    vscode.SymbolKind.Module,
                    hostRange,
                    hostRange
                ));
            }

            // ── Top-level rule ──
            const ruleMatch = line.match(/^rule\s+(\w+)/);
            if (ruleMatch) {
                const ruleRange = new vscode.Range(i, 0, i, lines[i].length);
                symbols.push(new vscode.DocumentSymbol(
                    ruleMatch[1],
                    'Design rule',
                    vscode.SymbolKind.Interface,
                    ruleRange,
                    ruleRange
                ));
            }

            // ── Top-level gene ──
            const geneMatch = line.match(/^gene\s+(\w+)/);
            if (geneMatch) {
                const proteinMatch = line.match(/=\s*(\w+)/);
                const geneRange = new vscode.Range(i, 0, i, lines[i].length);
                symbols.push(new vscode.DocumentSymbol(
                    geneMatch[1],
                    proteinMatch ? `→ ${proteinMatch[1]}` : 'Gene',
                    vscode.SymbolKind.Function,
                    geneRange,
                    geneRange
                ));
            }

            i++;
        }

        return symbols;
    }

    /**
     * Parsea los hijos dentro de un bloque circuit { ... }
     */
    private parseCircuitChildren(
        lines: string[],
        startLine: number,
        endLine: number,
        parentSymbol: vscode.DocumentSymbol
    ): void {
        let currentTU: vscode.DocumentSymbol | null = null;
        let tuCounter = 0;
        let tuStartLine = startLine;
        const connections: { line: number; text: string; from: string; to: string; type: string }[] = [];
        let killSwitchSymbol: vscode.DocumentSymbol | null = null;
        let insideKillSwitch = false;
        let killSwitchStart = -1;
        let killSwitchDepth = 0;

        for (let i = startLine; i < endLine; i++) {
            const line = lines[i].trim();
            const rawLine = lines[i];

            // Kill switch block
            if (/kill_switch\s*\{/.test(line)) {
                insideKillSwitch = true;
                killSwitchStart = i;
                killSwitchDepth = 0;
                for (const ch of line) {
                    if (ch === '{') { killSwitchDepth++; }
                }
                const ksRange = new vscode.Range(i, 0, i, rawLine.length);
                killSwitchSymbol = new vscode.DocumentSymbol(
                    'kill_switch',
                    'Biocontainment system',
                    vscode.SymbolKind.Struct,
                    ksRange,
                    ksRange
                );
                continue;
            }

            if (insideKillSwitch) {
                for (const ch of line) {
                    if (ch === '{') { killSwitchDepth++; }
                    if (ch === '}') { killSwitchDepth--; }
                }

                // Parse kill_switch fields
                const triggerMatch = line.match(/trigger:\s*(.+?)[\s,]*$/);
                if (triggerMatch && killSwitchSymbol) {
                    const fieldRange = new vscode.Range(i, 0, i, rawLine.length);
                    killSwitchSymbol.children.push(new vscode.DocumentSymbol(
                        `trigger: ${triggerMatch[1]}`,
                        'Activation condition',
                        vscode.SymbolKind.EnumMember,
                        fieldRange,
                        fieldRange
                    ));
                }
                const toxinMatch = line.match(/toxin:\s*(\w+)/);
                if (toxinMatch && killSwitchSymbol) {
                    const fieldRange = new vscode.Range(i, 0, i, rawLine.length);
                    killSwitchSymbol.children.push(new vscode.DocumentSymbol(
                        `toxin: ${toxinMatch[1]}`,
                        'Lethal protein',
                        vscode.SymbolKind.EnumMember,
                        fieldRange,
                        fieldRange
                    ));
                }
                const antiMatch = line.match(/antitoxin:\s*(\w+)/);
                if (antiMatch && killSwitchSymbol) {
                    const fieldRange = new vscode.Range(i, 0, i, rawLine.length);
                    killSwitchSymbol.children.push(new vscode.DocumentSymbol(
                        `antitoxin: ${antiMatch[1]}`,
                        'Protective protein',
                        vscode.SymbolKind.EnumMember,
                        fieldRange,
                        fieldRange
                    ));
                }
                const delayMatch = line.match(/delay:\s*(.+?)[\s,]*$/);
                if (delayMatch && killSwitchSymbol) {
                    const fieldRange = new vscode.Range(i, 0, i, rawLine.length);
                    killSwitchSymbol.children.push(new vscode.DocumentSymbol(
                        `delay: ${delayMatch[1]}`,
                        'Activation delay',
                        vscode.SymbolKind.EnumMember,
                        fieldRange,
                        fieldRange
                    ));
                }

                if (killSwitchDepth <= 0) {
                    insideKillSwitch = false;
                    if (killSwitchSymbol) {
                        killSwitchSymbol.range = new vscode.Range(killSwitchStart, 0, i, rawLine.length);
                        parentSymbol.children.push(killSwitchSymbol);
                        killSwitchSymbol = null;
                    }
                }
                continue;
            }

            // Promoter → starts new TU
            const promoterMatch = line.match(/promoter\s+(\w+)/);
            if (promoterMatch) {
                // Finalize previous TU
                if (currentTU) {
                    currentTU.range = new vscode.Range(tuStartLine, 0, i - 1, lines[i - 1]?.length || 0);
                    parentSymbol.children.push(currentTU);
                }

                tuCounter++;
                tuStartLine = i;
                const tuRange = new vscode.Range(i, 0, i, rawLine.length);
                currentTU = new vscode.DocumentSymbol(
                    `TU${tuCounter}`,
                    `Transcription Unit ${tuCounter}`,
                    vscode.SymbolKind.Method,
                    tuRange,
                    tuRange
                );

                // Add promoter as child
                const promoterRange = new vscode.Range(i, 0, i, rawLine.length);
                currentTU.children.push(new vscode.DocumentSymbol(
                    `🟢 ${promoterMatch[1]}`,
                    'Promoter',
                    vscode.SymbolKind.Property,
                    promoterRange,
                    promoterRange
                ));
                continue;
            }

            // RBS
            const rbsMatch = line.match(/rbs:\s*(\w+)/);
            if (rbsMatch && currentTU) {
                const rbsRange = new vscode.Range(i, 0, i, rawLine.length);
                currentTU.children.push(new vscode.DocumentSymbol(
                    `🔵 ${rbsMatch[1]}`,
                    'Ribosome Binding Site',
                    vscode.SymbolKind.Constant,
                    rbsRange,
                    rbsRange
                ));
                continue;
            }

            // Gene
            const geneMatch = line.match(/gene\s+(\w+)(?:\s*:\s*Protein\s*=\s*(\w+))?/);
            if (geneMatch && currentTU) {
                const geneRange = new vscode.Range(i, 0, i, rawLine.length);
                const protein = geneMatch[2] || geneMatch[1];
                currentTU.children.push(new vscode.DocumentSymbol(
                    `🧬 ${geneMatch[1]}`,
                    `→ ${protein}`,
                    vscode.SymbolKind.Function,
                    geneRange,
                    geneRange
                ));
                continue;
            }

            // Terminator
            const termMatch = line.match(/terminator:\s*(\w+)/);
            if (termMatch && currentTU) {
                const termRange = new vscode.Range(i, 0, i, rawLine.length);
                currentTU.children.push(new vscode.DocumentSymbol(
                    `🔴 ${termMatch[1]}`,
                    'Terminator',
                    vscode.SymbolKind.Property,
                    termRange,
                    termRange
                ));
                continue;
            }

            // Connections (activation ->)
            const activationMatch = line.match(/(\w+)\s*->\s*(\w+)/);
            if (activationMatch) {
                connections.push({
                    line: i,
                    text: line,
                    from: activationMatch[1],
                    to: activationMatch[2],
                    type: 'activation'
                });
                continue;
            }

            // Connections (repression ~>)
            const repressionMatch = line.match(/(\w+)\s*~>\s*(\w+)/);
            if (repressionMatch) {
                connections.push({
                    line: i,
                    text: line,
                    from: repressionMatch[1],
                    to: repressionMatch[2],
                    type: 'repression'
                });
                continue;
            }
        }

        // Finalize last TU
        if (currentTU) {
            // Find a good end line for the TU
            let tuEnd = endLine - 1;
            for (let j = tuStartLine + 1; j < endLine; j++) {
                const l = lines[j].trim();
                if (/^(promoter\s|\/\/\s*TU|\w+\s*(->|~>))/.test(l) || /kill_switch/.test(l)) {
                    tuEnd = j - 1;
                    break;
                }
            }
            currentTU.range = new vscode.Range(tuStartLine, 0, tuEnd, lines[tuEnd]?.length || 0);
            parentSymbol.children.push(currentTU);
        }

        // Add connections group
        if (connections.length > 0) {
            const connStart = connections[0].line;
            const connEnd = connections[connections.length - 1].line;
            const connGroupRange = new vscode.Range(connStart, 0, connEnd, lines[connEnd]?.length || 0);
            const connGroup = new vscode.DocumentSymbol(
                `Connections (${connections.length})`,
                'Regulatory connections',
                vscode.SymbolKind.Namespace,
                connGroupRange,
                connGroupRange
            );

            for (const conn of connections) {
                const connRange = new vscode.Range(conn.line, 0, conn.line, lines[conn.line]?.length || 0);
                const symbol = conn.type === 'repression'
                    ? `${conn.from} ⊣ ${conn.to}`
                    : `${conn.from} → ${conn.to}`;
                const desc = conn.type === 'repression' ? 'Repression' : 'Activation';
                connGroup.children.push(new vscode.DocumentSymbol(
                    symbol,
                    desc,
                    vscode.SymbolKind.Event,
                    connRange,
                    connRange
                ));
            }

            parentSymbol.children.push(connGroup);
        }
    }

    /**
     * Encuentra la línea del '}' que cierra un bloque abierto en startLine
     */
    private findBlockEnd(lines: string[], startLine: number): number {
        let depth = 0;
        for (let i = startLine; i < lines.length; i++) {
            for (const ch of lines[i]) {
                if (ch === '{') { depth++; }
                if (ch === '}') {
                    depth--;
                    if (depth <= 0) { return i; }
                }
            }
        }
        return lines.length - 1;
    }
}

// ════════════════════════════════════════════════════════════════════════════
// REGISTRATION
// ════════════════════════════════════════════════════════════════════════════

export function registerBioScriptSymbols(context: vscode.ExtensionContext): void {
    const provider = new BioScriptDocumentSymbolProvider();
    context.subscriptions.push(
        vscode.languages.registerDocumentSymbolProvider(
            { language: 'bioscript', scheme: 'file' },
            provider
        ),
        vscode.languages.registerDocumentSymbolProvider(
            { language: 'bioscript', scheme: 'untitled' },
            provider
        )
    );
    console.log('🧬 SynBio-LLVM: DocumentSymbolProvider registrado — Outline panel activo');
}
