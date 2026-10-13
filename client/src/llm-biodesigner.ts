/**
 * ══════════════════════════════════════════════════════════════════════════════
 * LLM BioDesigner — Real AI-Powered Genetic Circuit Design
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * Integrates VS Code Language Model API (vscode.lm) for REAL LLM-powered
 * biological design. Uses Copilot Chat models (GPT-4o / Claude) available
 * natively in VS Code 1.90+.
 *
 * Capabilities:
 *   1. Natural language → BioScript code generation
 *   2. Circuit review & optimization suggestions
 *   3. Troubleshooting failed designs
 *   4. Literature-informed design decisions
 *
 * This is NOT rule-based — it uses actual large language models.
 *
 * References:
 *   - VS Code LM API: https://code.visualstudio.com/api/extension-guides/language-model
 *   - Prompt engineering for biology: derived from BioCoder (Tang et al. 2024)
 * ══════════════════════════════════════════════════════════════════════════════
 */

import * as vscode from 'vscode';
import { openUntitledBioScriptDocument } from './bioscript-document-utils';

// ════════════════════════════════════════════════════════════════════════════
// SYSTEM PROMPTS — Domain-specific BioScript generation
// ════════════════════════════════════════════════════════════════════════════

const SYSTEM_PROMPT = `You are SynBio-LLVM BioDesigner, an expert synthetic biology circuit designer.
You generate BioScript code — a domain-specific language for genetic circuits.

BioScript Syntax Reference:
\`\`\`
circuit <name> {
    host: "<organism>"      // e.g. "ecoli_k12", "yeast_s288c", "bacillus_subtilis_168"
    
    promoter <name> {
        type: "<constitutive|inducible|repressible>"
        inducer: "<IPTG|aTc|Arabinose|AHL|light>"
    }
    
    gene <name> {
        promoter: <promoter_name>
        rbs: <B0030|B0031|B0032|B0033|B0034|B0035>    // RBS strength
        terminator: <B0010|B0012|B0015|L3S2P21>        // Terminator
        product: "<ProteinName>"
    }
    
    kill_switch {
        trigger: "<condition>"
        toxin: <CcdB|MazF|RelE|ParE>
        antitoxin: <CcdA|MazE|RelB|ParD>
        delay: <minutes>
    }
    
    rule <source> <activates|represses|inhibits> <target>
    
    connections {
        <gene1> -> <gene2>      // activation
        <gene1> ~> <gene2>      // repression
    }
}
\`\`\`

Available iGEM parts:
- Promoters: pLac (IPTG), pTet (aTc), pBAD (Arabinose), pT7, J23100-J23119 (constitutive Anderson library)
- RBS: B0030 (100au), B0031 (150au), B0032 (300au), B0034 (1000au, strong), B0035 (500au)
- Terminators: B0010 (98%), B0012 (95%), B0015 (99%, double), L3S2P21 (97%)
- Reporters: GFP (488/509nm), RFP/mCherry (587/610nm), BFP, YFP, CFP, sfGFP, LuxAB
- Regulators: LacI, TetR, AraC, cI (Lambda), LuxR

Rules:
1. ALWAYS include a kill_switch for circuits with ≥2 genes (iGEM safety requirement)
2. Use real iGEM part names (BBa_XXXXX naming convention)
3. Include host organism with BSL level
4. Use biologically realistic parameters
5. Add comments explaining the design rationale
6. If the design involves BSL-2+ organisms, add explicit biosafety warnings

Respond ONLY with BioScript code wrapped in \`\`\`bioscript ... \`\`\`. Add brief design rationale as BioScript comments.`;

const REVIEW_PROMPT = `You are a synthetic biology expert reviewing a BioScript circuit design.
Analyze the circuit for:
1. **Biological correctness** — are the regulatory logic connections valid?
2. **Part compatibility** — are parts compatible with the host organism?
3. **Expression balance** — are RBS strengths appropriate for the circuit function?
4. **Safety** — does it have proper biocontainment (kill switch)?
5. **Efficiency** — are there unnecessary parts or missing optimizations?
6. **Potential issues** — metabolic burden, toxicity, genetic instability

Provide specific, actionable suggestions with BioScript code fixes.`;

const TROUBLESHOOT_PROMPT = `You are a synthetic biology troubleshooting expert.
The user has a genetic circuit that is not working as expected.
Common issues in genetic circuits:
- Promoter leakiness causing basal expression
- RBS too strong/weak for balanced circuits
- Missing terminators causing read-through
- Metabolic burden from large circuits
- Protein aggregation from overexpression
- Plasmid instability from repetitive sequences
- Toxicity of expressed proteins

Analyze the circuit and experimental observations, then suggest specific modifications.`;

type LLMBioDesignDelivery = 'ask' | 'insert' | 'new-file' | 'clipboard' | 'show-full';

interface LLMBioDesignRequest {
    prompt?: string;
    delivery?: LLMBioDesignDelivery;
    fileNameHint?: string;
}

interface GeneratedBioScriptResult {
    prompt: string;
    modelId: string;
    fullResponse: string;
    bioScriptCode: string;
}

// ════════════════════════════════════════════════════════════════════════════
// LLM CLIENT
// ════════════════════════════════════════════════════════════════════════════

export class LLMBioDesigner implements vscode.Disposable {
    private outputChannel: vscode.OutputChannel;
    private disposables: vscode.Disposable[] = [];
    private conversationHistory: vscode.LanguageModelChatMessage[] = [];

    constructor(private context: vscode.ExtensionContext) {
        this.outputChannel = vscode.window.createOutputChannel('SynBio AI Designer');
    }

    activate(): void {
        this.disposables.push(
            vscode.commands.registerCommand('synbio.llmDesign', (request?: string | LLMBioDesignRequest) => this.designFromPrompt(request)),
            vscode.commands.registerCommand('synbio.llmReview', () => this.reviewCurrentCircuit()),
            vscode.commands.registerCommand('synbio.llmTroubleshoot', () => this.troubleshootCircuit()),
            vscode.commands.registerCommand('synbio.llmExplain', () => this.explainSelection()),
        );
        this.context.subscriptions.push(...this.disposables);
    }

    /**
     * Select the best available LLM model
     */
    private async getModel(): Promise<vscode.LanguageModelChat | null> {
        try {
            // Try to get available chat models
            const models = await vscode.lm.selectChatModels({
                vendor: 'copilot',
            });

            if (models.length > 0) {
                // Prefer GPT-4o or Claude, fall back to whatever is available
                const preferred = models.find(m =>
                    m.id.includes('gpt-4') || m.id.includes('claude') || m.id.includes('o1')
                ) || models[0];
                this.outputChannel.appendLine(`🤖 Modelo seleccionado: ${preferred.id} (${preferred.name})`);
                return preferred;
            }

            vscode.window.showErrorMessage(
                'SynBio AI Designer requiere GitHub Copilot Chat. Instala la extensión de Copilot Chat para usar esta función.',
                'Instalar Copilot'
            ).then(choice => {
                if (choice === 'Instalar Copilot') {
                    vscode.commands.executeCommand('workbench.extensions.search', 'GitHub.copilot-chat');
                }
            });
            return null;
        } catch (err) {
            vscode.window.showErrorMessage(
                `Error accediendo a Language Model API: ${err instanceof Error ? err.message : String(err)}`
            );
            return null;
        }
    }

    /**
     * Main feature: Design a circuit from natural language
     */
    async designFromPrompt(request?: string | LLMBioDesignRequest): Promise<void> {
        const resolvedRequest = typeof request === 'string' ? { prompt: request } : (request ?? {});
        const prompt = resolvedRequest.prompt ?? await vscode.window.showInputBox({
            title: '🧬 SynBio AI Designer — Diseño con IA',
            prompt: 'Describe el circuito genético que necesitas en lenguaje natural',
            placeHolder: 'Ej: Diseña un biosensor de arseniato con toggle switch y kill switch para E. coli BSL-1',
            ignoreFocusOut: true,
        });

        if (!prompt) { return; }

        const model = await this.getModel();
        if (!model) { return; }

        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: '🧬 SynBio AI Designer',
            cancellable: true,
        }, async (progress, token) => {
            progress.report({ message: 'Generando diseño con IA...' });

            try {
                const messages: vscode.LanguageModelChatMessage[] = [
                    vscode.LanguageModelChatMessage.User(SYSTEM_PROMPT),
                    vscode.LanguageModelChatMessage.User(
                        `Design request: ${prompt}\n\nGenerate a complete, functional BioScript circuit.`
                    ),
                ];

                const response = await model.sendRequest(messages, {}, token);

                let fullResponse = '';
                for await (const chunk of response.text) {
                    fullResponse += chunk;
                }

                // Extract BioScript code from response
                const codeMatch = fullResponse.match(/```(?:bioscript|bio)?\s*\n([\s\S]*?)```/);
                const bioScriptCode = codeMatch ? codeMatch[1].trim() : fullResponse.trim();

                await this.presentGeneratedDesign({
                    prompt,
                    modelId: model.id,
                    fullResponse,
                    bioScriptCode,
                }, resolvedRequest);

                // Log for audit
                this.outputChannel.appendLine(`\n[${new Date().toISOString()}] Design: "${prompt}" → ${bioScriptCode.split('\n').length} lines`);

                // Save to conversation history for context
                this.conversationHistory.push(
                    vscode.LanguageModelChatMessage.User(prompt),
                    vscode.LanguageModelChatMessage.Assistant(fullResponse)
                );

            } catch (err) {
                if (err instanceof vscode.LanguageModelError) {
                    if (err.code === vscode.LanguageModelError.NotFound.name) {
                        vscode.window.showErrorMessage('Modelo de IA no encontrado. Verifica que GitHub Copilot Chat esté activo.');
                    } else if (err.code === vscode.LanguageModelError.Blocked.name) {
                        vscode.window.showWarningMessage('La respuesta fue bloqueada por filtros de contenido. Reformula tu solicitud.');
                    } else if (err.code === vscode.LanguageModelError.NoPermissions.name) {
                        vscode.window.showErrorMessage('Sin permisos para usar la API de LLM. Verifica tu suscripción a Copilot.');
                    } else {
                        vscode.window.showErrorMessage(`Error del modelo: ${err.message}`);
                    }
                } else {
                    vscode.window.showErrorMessage(`Error inesperado: ${err instanceof Error ? err.message : String(err)}`);
                }
            }
        });
    }

    private async presentGeneratedDesign(
        result: GeneratedBioScriptResult,
        request: LLMBioDesignRequest,
    ): Promise<void> {
        const delivery = request.delivery ?? await this.askDesignDelivery(result.bioScriptCode);
        if (!delivery) {
            return;
        }

        switch (delivery) {
            case 'insert': {
                const inserted = await this.tryInsertIntoEditor(result.bioScriptCode);
                if (!inserted) {
                    await this.openGeneratedBioScriptFile(result, request.fileNameHint);
                }
                break;
            }
            case 'new-file':
                await this.openGeneratedBioScriptFile(result, request.fileNameHint);
                break;
            case 'clipboard':
                await vscode.env.clipboard.writeText(result.bioScriptCode);
                vscode.window.showInformationMessage('Código copiado al portapapeles');
                break;
            case 'show-full':
                this.showFullResponse(result);
                break;
            default:
                break;
        }
    }

    private async askDesignDelivery(bioScriptCode: string): Promise<LLMBioDesignDelivery | undefined> {
        const action = await vscode.window.showInformationMessage(
            `🧬 Circuito generado por IA (${bioScriptCode.split('\n').length} líneas)`,
            'Insertar en Editor',
            'Abrir en Nuevo Archivo',
            'Copiar al Portapapeles',
            'Ver Completo'
        );

        switch (action) {
            case 'Insertar en Editor':
                return 'insert';
            case 'Abrir en Nuevo Archivo':
                return 'new-file';
            case 'Copiar al Portapapeles':
                return 'clipboard';
            case 'Ver Completo':
                return 'show-full';
            default:
                return undefined;
        }
    }

    private async tryInsertIntoEditor(bioScriptCode: string): Promise<boolean> {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            return false;
        }

        await editor.edit(edit => {
            edit.insert(editor.selection.active, `\n${bioScriptCode}\n`);
        });

        return true;
    }

    private async openGeneratedBioScriptFile(
        result: GeneratedBioScriptResult,
        fileNameHint?: string,
    ): Promise<void> {
        const content = `// ═══════════════════════════════════════════════════\n// AI-Generated Circuit\n// Prompt: ${result.prompt}\n// Model: ${result.modelId}\n// Date: ${new Date().toISOString().split('T')[0]}\n// ═══════════════════════════════════════════════════\n\n${result.bioScriptCode}`;
        await openUntitledBioScriptDocument(content, fileNameHint ?? 'ai_generated_circuit.bio');
    }

    private showFullResponse(result: GeneratedBioScriptResult): void {
        this.outputChannel.clear();
        this.outputChannel.appendLine('═══ SynBio AI Designer — Respuesta Completa ═══');
        this.outputChannel.appendLine(`Prompt: ${result.prompt}`);
        this.outputChannel.appendLine(`Modelo: ${result.modelId}`);
        this.outputChannel.appendLine('───────────────────────────────────────────────');
        this.outputChannel.appendLine(result.fullResponse);
        this.outputChannel.show();
    }

    /**
     * Review the current circuit in the editor
     */
    async reviewCurrentCircuit(): Promise<void> {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showWarningMessage('Abre un archivo .bio para revisar');
            return;
        }

        const code = editor.document.getText();
        if (code.trim().length === 0) {
            vscode.window.showWarningMessage('El archivo está vacío');
            return;
        }

        const model = await this.getModel();
        if (!model) { return; }

        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: '🔍 Revisando circuito con IA...',
            cancellable: true,
        }, async (progress, token) => {
            try {
                const messages: vscode.LanguageModelChatMessage[] = [
                    vscode.LanguageModelChatMessage.User(REVIEW_PROMPT),
                    vscode.LanguageModelChatMessage.User(
                        `Review this BioScript circuit:\n\`\`\`bioscript\n${code}\n\`\`\`\n\nProvide detailed analysis with specific suggestions.`
                    ),
                ];

                const response = await model.sendRequest(messages, {}, token);

                let fullResponse = '';
                for await (const chunk of response.text) {
                    fullResponse += chunk;
                }

                // Show in markdown preview
                const doc = await vscode.workspace.openTextDocument({
                    content: `# 🔍 AI Circuit Review\n\n**File:** ${editor.document.fileName}\n**Model:** ${model.id}\n**Date:** ${new Date().toISOString()}\n\n---\n\n${fullResponse}`,
                    language: 'markdown',
                });
                await vscode.window.showTextDocument(doc, { viewColumn: vscode.ViewColumn.Beside });

            } catch (err) {
                vscode.window.showErrorMessage(`Error en revisión: ${err instanceof Error ? err.message : String(err)}`);
            }
        });
    }

    /**
     * Troubleshoot a circuit that isn't working
     */
    async troubleshootCircuit(): Promise<void> {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showWarningMessage('Abre un archivo .bio para depurar');
            return;
        }

        const observation = await vscode.window.showInputBox({
            title: '🔧 Troubleshooting con IA',
            prompt: '¿Qué problema observas con tu circuito?',
            placeHolder: 'Ej: No hay fluorescencia, expresión muy baja, el circuito no oscila...',
            ignoreFocusOut: true,
        });

        if (!observation) { return; }

        const model = await this.getModel();
        if (!model) { return; }

        const code = editor.document.getText();

        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: '🔧 Analizando problema...',
            cancellable: true,
        }, async (progress, token) => {
            try {
                const messages: vscode.LanguageModelChatMessage[] = [
                    vscode.LanguageModelChatMessage.User(TROUBLESHOOT_PROMPT),
                    vscode.LanguageModelChatMessage.User(
                        `Circuit:\n\`\`\`bioscript\n${code}\n\`\`\`\n\nProblem observed: ${observation}\n\nAnalyze root causes and suggest specific BioScript modifications.`
                    ),
                ];

                const response = await model.sendRequest(messages, {}, token);

                let fullResponse = '';
                for await (const chunk of response.text) {
                    fullResponse += chunk;
                }

                const doc = await vscode.workspace.openTextDocument({
                    content: `# 🔧 AI Troubleshooting Report\n\n**Problem:** ${observation}\n**Model:** ${model.id}\n\n---\n\n${fullResponse}`,
                    language: 'markdown',
                });
                await vscode.window.showTextDocument(doc, { viewColumn: vscode.ViewColumn.Beside });

            } catch (err) {
                vscode.window.showErrorMessage(`Error: ${err instanceof Error ? err.message : String(err)}`);
            }
        });
    }

    /**
     * Explain selected code
     */
    async explainSelection(): Promise<void> {
        const editor = vscode.window.activeTextEditor;
        if (!editor || editor.selection.isEmpty) {
            vscode.window.showWarningMessage('Selecciona código BioScript para explicar');
            return;
        }

        const selection = editor.document.getText(editor.selection);
        const model = await this.getModel();
        if (!model) { return; }

        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: '📖 Explicando con IA...',
            cancellable: true,
        }, async (progress, token) => {
            try {
                const messages: vscode.LanguageModelChatMessage[] = [
                    vscode.LanguageModelChatMessage.User(
                        `You are a synthetic biology educator. Explain this BioScript code in detail:\n\`\`\`bioscript\n${selection}\n\`\`\`\n\nExplain:\n1. What biological system this represents\n2. How each part functions\n3. The expected behavior\n4. Key design decisions\n5. Relevant literature references`
                    ),
                ];

                const response = await model.sendRequest(messages, {}, token);

                let fullResponse = '';
                for await (const chunk of response.text) {
                    fullResponse += chunk;
                }

                const doc = await vscode.workspace.openTextDocument({
                    content: `# 📖 BioScript Explanation\n\n\`\`\`bioscript\n${selection}\n\`\`\`\n\n---\n\n${fullResponse}`,
                    language: 'markdown',
                });
                await vscode.window.showTextDocument(doc, { viewColumn: vscode.ViewColumn.Beside });

            } catch (err) {
                vscode.window.showErrorMessage(`Error: ${err instanceof Error ? err.message : String(err)}`);
            }
        });
    }

    dispose(): void {
        this.outputChannel.dispose();
        this.disposables.forEach(d => d.dispose());
    }
}
