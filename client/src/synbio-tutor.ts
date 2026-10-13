import * as vscode from 'vscode';
import * as child_process from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

interface TutorSource {
    path: string;
    line_start: number;
    line_end: number;
}

interface TutorRelatedQuestion {
    question: string;
    topic: string;
    score: number;
}

interface TutorAskResponse {
    question: string;
    answer: string;
    confidence: number;
    matched_topic: string;
    matched_intent: string;
    mode: string;
    sources: TutorSource[];
    related_questions: TutorRelatedQuestion[];
    model_info: {
        dataset_name: string;
        tensorflow_available: boolean;
        model_version: string;
        predicted_topic: string;
        predicted_topic_confidence: number;
        top_topic_scores: Record<string, number>;
        entry_count: number;
        topic_count: number;
    };
}

export class SynBioTutor implements vscode.Disposable {
    private disposables: vscode.Disposable[] = [];
    private serverProcess: child_process.ChildProcess | null = null;
    private readonly serverPort = 8765;
    private readonly serverUrl = `http://127.0.0.1:${this.serverPort}`;
    private readonly outputChannel: vscode.OutputChannel;

    constructor(private context: vscode.ExtensionContext) {
        this.outputChannel = vscode.window.createOutputChannel('SynBio Tutor');
    }

    activate(): void {
        this.disposables.push(
            vscode.commands.registerCommand('synbio.askTutor', () => this.askQuestion()),
        );
        this.context.subscriptions.push(this.outputChannel, ...this.disposables);
    }

    async askQuestion(): Promise<void> {
        const question = await vscode.window.showInputBox({
            title: 'Tutor AI de SynBio',
            prompt: 'Haz una pregunta sobre tutoriales, arquitectura o c\u00f3digo del proyecto',
            placeHolder: 'Ej: \u00bfc\u00f3mo funciona el compilador o d\u00f3nde empiezo con BioScript?',
            ignoreFocusOut: true,
        });

        if (!question) {
            return;
        }

        const ready = await this.ensureServer();
        if (!ready) {
            vscode.window.showWarningMessage(
                'No se pudo conectar con el Python Engine. El tutor local necesita el backend para responder.',
                'Ver instrucciones'
            ).then(choice => {
                if (choice === 'Ver instrucciones') {
                    this.showInstallInstructions();
                }
            });
            return;
        }

        await vscode.window.withProgress(
            {
                location: vscode.ProgressLocation.Notification,
                title: 'Consultando Tutor AI de SynBio...',
                cancellable: false,
            },
            async () => {
                try {
                    const response = await fetch(`${this.serverUrl}/api/ai/tutor/ask`, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                        },
                        body: JSON.stringify({
                            question,
                            audience: 'beginner',
                            max_results: 3,
                        }),
                    });

                    if (!response.ok) {
                        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
                    }

                    const result = await response.json() as TutorAskResponse;
                    await this.showAnswer(result);
                } catch (error) {
                    this.outputChannel.appendLine(String(error));
                    vscode.window.showErrorMessage(
                        `Error consultando el tutor: ${error instanceof Error ? error.message : String(error)}`
                    );
                }
            }
        );
    }

    private async ensureServer(): Promise<boolean> {
        if (await this.checkServerHealth()) {
            return true;
        }

        return this.startServer();
    }

    private async checkServerHealth(): Promise<boolean> {
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 2000);
            const response = await fetch(`${this.serverUrl}/health`, { signal: controller.signal });
            clearTimeout(timeoutId);
            return response.ok;
        } catch {
            return false;
        }
    }

    private async startServer(): Promise<boolean> {
        try {
            const enginePath = path.join(this.context.extensionPath, '..', 'python-engine');
            const scriptPath = path.join(enginePath, 'start-server.bat');

            if (!fs.existsSync(scriptPath)) {
                return false;
            }

            this.serverProcess = child_process.spawn(
                'cmd.exe',
                ['/c', scriptPath],
                {
                    cwd: enginePath,
                    detached: true,
                    stdio: 'ignore',
                    windowsHide: true,
                }
            );
            this.serverProcess.unref();

            await this.sleep(3500);
            return this.checkServerHealth();
        } catch {
            return false;
        }
    }

    private async showAnswer(result: TutorAskResponse): Promise<void> {
        const markdown = [
            `# Tutor AI de SynBio`,
            ``,
            `**Pregunta**: ${result.question}`,
            ``,
            `**Respuesta**`,
            ``,
            `${result.answer}`,
            ``,
            `**Contexto del modelo**`,
            ``,
            `- Modo: ${result.mode}`,
            `- Topic detectado: ${result.model_info.predicted_topic} (${result.model_info.predicted_topic_confidence})`,
            `- Topic usado: ${result.matched_topic}`,
            `- Confianza: ${result.confidence}`,
            `- TensorFlow disponible: ${result.model_info.tensorflow_available ? 'si' : 'no'}`,
            `- Dataset: ${result.model_info.dataset_name}`,
            ``,
            `**Fuentes**`,
            ``,
            ...result.sources.map(source => `- ${source.path}:${source.line_start}-${source.line_end}`),
            ``,
            `**Preguntas relacionadas**`,
            ``,
            ...result.related_questions.map(item => `- ${item.question} [${item.topic}] (${item.score})`),
        ].join('\n');

        const document = await vscode.workspace.openTextDocument({
            content: markdown,
            language: 'markdown',
        });
        await vscode.window.showTextDocument(document, vscode.ViewColumn.Beside, true);
    }

    private showInstallInstructions(): void {
        const panel = vscode.window.createWebviewPanel(
            'synbioTutorInstall',
            'Configurar Tutor AI de SynBio',
            vscode.ViewColumn.One,
            {}
        );

        panel.webview.html = `
        <!DOCTYPE html>
        <html>
        <head>
            <style>
                body {
                    font-family: var(--vscode-font-family);
                    padding: 20px;
                    line-height: 1.6;
                }
                code {
                    background: var(--vscode-textCodeBlock-background);
                    padding: 2px 6px;
                    border-radius: 3px;
                }
                .step {
                    border-left: 3px solid var(--vscode-textLink-foreground);
                    margin: 12px 0;
                    padding: 12px;
                    background: var(--vscode-editor-background);
                }
            </style>
        </head>
        <body>
            <h1>Tutor AI de SynBio</h1>
            <div class="step">
                <h3>Paso 1</h3>
                <p>Abre <code>python-engine/start-server.bat</code> y arranca el Python Engine.</p>
            </div>
            <div class="step">
                <h3>Paso 2</h3>
                <p>Si quieres activar la capa Keras, instala TensorFlow en el entorno del Python Engine.</p>
                <p><code>pip install tensorflow-cpu</code></p>
            </div>
            <div class="step">
                <h3>Paso 3</h3>
                <p>Vuelve a ejecutar el comando <code>SynBio: Tutor AI de SynBio</code>.</p>
            </div>
        </body>
        </html>
        `;
    }

    private sleep(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    dispose(): void {
        this.outputChannel.dispose();
        this.disposables.forEach(disposable => disposable.dispose());
        this.disposables = [];
    }
}