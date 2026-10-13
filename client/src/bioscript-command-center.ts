import * as path from 'path';
import * as vscode from 'vscode';
import {
    CommandCenterActionId,
    inferBioScriptCommand,
    rankBioScriptCommandIntents,
    ResolvedBioScriptCommandParameters,
    resolveBioScriptCommandParameters,
} from './bioscript-command-center-intent';

type ActionGroup = 'BioScript' | 'Workspace' | 'Terminal';

interface CommandCenterAction {
    id: CommandCenterActionId;
    group: ActionGroup;
    label: string;
    description: string;
    detail: string;
    run: (context: CommandCenterRunContext) => Promise<void>;
}

interface CommandCenterRunContext {
    source: 'manual' | 'prompt';
    prompt?: string;
    parameters?: ResolvedBioScriptCommandParameters;
}

interface CommandCenterQuickPickItem extends vscode.QuickPickItem {
    actionId?: CommandCenterActionId;
    promptMode?: boolean;
}

export class BioScriptCommandCenter implements vscode.Disposable {
    private readonly outputChannel: vscode.OutputChannel;
    private readonly disposables: vscode.Disposable[] = [];
    private readonly actions: CommandCenterAction[];

    constructor(private readonly context: vscode.ExtensionContext) {
        this.outputChannel = vscode.window.createOutputChannel('BioScript Command Center');
        this.actions = this.buildActions();
    }

    activate(): void {
        this.disposables.push(
            vscode.commands.registerCommand('synbio.commandCenter', () => this.show()),
        );

        this.context.subscriptions.push(this.outputChannel, ...this.disposables);
    }

    private buildActions(): CommandCenterAction[] {
        return [
            {
                id: 'command.generateBioScript',
                group: 'BioScript',
                label: '$(sparkle) Generar BioScript con IA',
                description: 'Texto natural → circuito BioScript funcional',
                detail: 'Dispara synbio.llmDesign y reutiliza la capa LLM ya integrada',
                run: (context) => this.executeLLMDesign(context),
            },
            {
                id: 'command.compileCircuit',
                group: 'BioScript',
                label: '$(play) Compilar circuito activo',
                description: 'Compila el archivo .bio actual',
                detail: 'Ejecuta synbio.compile sobre el editor activo',
                run: () => this.executeCommand('synbio.compile'),
            },
            {
                id: 'command.simulateCircuit',
                group: 'BioScript',
                label: '$(pulse) Simular circuito activo',
                description: 'Lanza la simulación Gillespie SSA',
                detail: 'Ejecuta synbio.simulate',
                run: () => this.executeCommand('synbio.simulate'),
            },
            {
                id: 'command.biosecurityScan',
                group: 'BioScript',
                label: '$(shield) Escanear bioseguridad',
                description: 'Revisa compliance y riesgos biológicos',
                detail: 'Ejecuta synbio.biosecurity',
                run: () => this.executeCommand('synbio.biosecurity'),
            },
            {
                id: 'command.sequenceAnalysis',
                group: 'BioScript',
                label: '$(symbol-string) Analizar secuencia',
                description: 'GC, ORFs, repeticiones y calidad de diseño',
                detail: 'Ejecuta synbio.sequenceAnalysis',
                run: () => this.executeCommand('synbio.sequenceAnalysis'),
            },
            {
                id: 'command.designPrimers',
                group: 'BioScript',
                label: '$(symbol-key) Diseñar primers',
                description: 'Primers para Gibson, Golden Gate o clonación clásica',
                detail: 'Ejecuta synbio.designPrimers',
                run: () => this.executeCommand('synbio.designPrimers'),
            },
            {
                id: 'command.predictFailures',
                group: 'BioScript',
                label: '$(warning) Predecir fallos del circuito',
                description: 'Consulta la base de conocimiento de fallos',
                detail: 'Ejecuta synbio.predictCircuitFailure',
                run: () => this.executeCommand('synbio.predictCircuitFailure'),
            },
            {
                id: 'command.autoDocumentation',
                group: 'BioScript',
                label: '$(book) Generar documentación',
                description: 'Produce documentación del diseño actual',
                detail: 'Ejecuta synbio.autoDocumentation',
                run: () => this.executeCommand('synbio.autoDocumentation'),
            },
            {
                id: 'command.protocol',
                group: 'BioScript',
                label: '$(beaker) Generar protocolo',
                description: 'Construye el protocolo wet-lab asociado al diseño',
                detail: 'Ejecuta synbio.generateProtocol',
                run: () => this.executeCommand('synbio.generateProtocol'),
            },
            {
                id: 'command.newCircuit',
                group: 'BioScript',
                label: '$(new-file) Nuevo circuito BioScript',
                description: 'Abre el flujo para crear un circuito',
                detail: 'Ejecuta synbio.newCircuit',
                run: (context) => this.executeNewCircuit(context),
            },
            {
                id: 'command.openExample',
                group: 'BioScript',
                label: '$(library) Abrir ejemplo BioScript',
                description: 'Carga un ejemplo real del workspace',
                detail: 'Ejecuta synbio.openExample',
                run: () => this.executeCommand('synbio.openExample'),
            },
            {
                id: 'task.clientWatch',
                group: 'Workspace',
                label: '$(sync) Iniciar watch del cliente',
                description: 'Reconstrucción continua de la extensión',
                detail: 'Ejecuta la tarea npm: watch si está disponible',
                run: () => this.runTaskByName('npm: watch'),
            },
            {
                id: 'task.clientBuild',
                group: 'Workspace',
                label: '$(tools) Build del cliente',
                description: 'Compila el bundle del cliente',
                detail: 'Ejecuta la tarea npm: build client',
                run: () => this.runTaskByName('npm: build client'),
            },
            {
                id: 'task.serverBuild',
                group: 'Workspace',
                label: '$(package) Build del servidor',
                description: 'Compila el backend Rust en release',
                detail: 'Ejecuta la tarea cargo: build server',
                run: () => this.runTaskByName('cargo: build server'),
            },
            {
                id: 'terminal.workspace',
                group: 'Terminal',
                label: '$(terminal-bash) Abrir terminal del workspace',
                description: 'Terminal en la raíz del proyecto',
                detail: 'Abre una terminal integrada en el workspace',
                run: () => this.openTerminal('SynBio Workspace', ''),
            },
            {
                id: 'terminal.client',
                group: 'Terminal',
                label: '$(terminal-bash) Abrir terminal en client',
                description: 'Terminal en client/',
                detail: 'Útil para npm, bundling y pruebas del cliente',
                run: () => this.openTerminal('SynBio Client', 'client'),
            },
            {
                id: 'terminal.server',
                group: 'Terminal',
                label: '$(terminal-bash) Abrir terminal en server',
                description: 'Terminal en server/',
                detail: 'Útil para cargo, LSP y build del backend',
                run: () => this.openTerminal('SynBio Server', 'server'),
            },
        ];
    }

    async show(): Promise<void> {
        const items: CommandCenterQuickPickItem[] = [
            {
                label: '$(edit) Escribir intención libre',
                description: 'Describe lo que quieres hacer en lenguaje natural',
                detail: 'Ej: compila el circuito, abre terminal en server, arranca watch del cliente',
                promptMode: true,
            },
            { label: '', kind: vscode.QuickPickItemKind.Separator },
            ...this.buildGroupedItems(),
        ];

        const selected = await vscode.window.showQuickPick(items, {
            title: 'BioScript Command Center',
            placeHolder: 'Selecciona una acción real para BioScript, tareas o terminal',
            ignoreFocusOut: true,
            matchOnDescription: true,
            matchOnDetail: true,
        });

        if (!selected) {
            return;
        }

        if (selected.promptMode) {
            await this.promptAndRoute();
            return;
        }

        if (selected.actionId) {
            await this.executeActionById(selected.actionId, { source: 'manual' });
        }
    }

    private buildGroupedItems(): CommandCenterQuickPickItem[] {
        const groups: ActionGroup[] = ['BioScript', 'Workspace', 'Terminal'];
        const items: CommandCenterQuickPickItem[] = [];

        for (const group of groups) {
            items.push({ label: group, kind: vscode.QuickPickItemKind.Separator });

            for (const action of this.actions.filter(candidate => candidate.group === group)) {
                items.push({
                    label: action.label,
                    description: action.description,
                    detail: action.detail,
                    actionId: action.id,
                });
            }
        }

        return items;
    }

    private async promptAndRoute(): Promise<void> {
        const prompt = await vscode.window.showInputBox({
            title: 'BioScript Command Center',
            prompt: 'Describe la acción que quieres ejecutar',
            placeHolder: 'Ej: genera BioScript para un biosensor, build del servidor, abre terminal en client',
            ignoreFocusOut: true,
        });

        if (!prompt) {
            return;
        }

        const bestIntent = inferBioScriptCommand(prompt);
        const rankedIntents = rankBioScriptCommandIntents(prompt, 5);

        if (!bestIntent) {
            vscode.window.showWarningMessage('No pude inferir una acción. Abro la paleta para que elijas manualmente.');
            await this.show();
            return;
        }

        if (rankedIntents.length === 1 || bestIntent.score >= 6 || bestIntent.score >= (rankedIntents[1]?.score ?? 0) + 3) {
            await this.executeActionById(bestIntent.actionId, {
                source: 'prompt',
                prompt,
                parameters: resolveBioScriptCommandParameters(prompt, bestIntent.actionId),
            });
            return;
        }

        const picks: CommandCenterQuickPickItem[] = rankedIntents.map(intent => {
            const action = this.getAction(intent.actionId);
            return {
                label: action?.label ?? intent.actionId,
                description: action?.description,
                detail: `Score ${intent.score} · ${intent.reason}`,
                actionId: intent.actionId,
            };
        });

        const selection = await vscode.window.showQuickPick(picks, {
            title: 'BioScript Command Center — Sugerencias inferidas',
            placeHolder: prompt,
            ignoreFocusOut: true,
            matchOnDescription: true,
            matchOnDetail: true,
        });

        if (selection?.actionId) {
            await this.executeActionById(selection.actionId, {
                source: 'prompt',
                prompt,
                parameters: resolveBioScriptCommandParameters(prompt, selection.actionId),
            });
        }
    }

    private getAction(actionId: CommandCenterActionId): CommandCenterAction | undefined {
        return this.actions.find(action => action.id === actionId);
    }

    private async executeActionById(actionId: CommandCenterActionId, context: CommandCenterRunContext): Promise<void> {
        const action = this.getAction(actionId);
        if (!action) {
            vscode.window.showErrorMessage(`Acción no encontrada: ${actionId}`);
            return;
        }

        const sourceLabel = context.source === 'prompt'
            ? `Prompt libre: ${context.prompt ?? ''}`
            : 'Selección manual';
        const parameterLabel = context.parameters?.fileNameHint
            ? ` · file=${context.parameters.fileNameHint}`
            : '';

        this.log(`${sourceLabel} → ${action.id}${parameterLabel}`);
        await action.run(context);
    }

    private async executeLLMDesign(context: CommandCenterRunContext): Promise<void> {
        if (!context.parameters) {
            await this.executeCommand('synbio.llmDesign');
            return;
        }

        await this.executeCommand('synbio.llmDesign', {
            prompt: context.parameters.promptText,
            delivery: context.parameters.delivery,
            fileNameHint: context.parameters.fileNameHint,
        });
    }

    private async executeNewCircuit(context: CommandCenterRunContext): Promise<void> {
        if (!context.parameters) {
            await this.executeCommand('synbio.newCircuit');
            return;
        }

        await this.executeCommand('synbio.newCircuit', {
            name: context.parameters.circuitNameHint,
            host: context.parameters.hostHint,
            fileNameHint: context.parameters.fileNameHint,
        });
    }

    private async executeCommand(commandId: string, ...args: unknown[]): Promise<void> {
        await vscode.commands.executeCommand(commandId, ...args);
    }

    private async runTaskByName(requestedName: string): Promise<void> {
        const tasks = await vscode.tasks.fetchTasks();
        const task = this.findTask(tasks, requestedName);

        if (!task) {
            const availableTasks = tasks.map(candidate => candidate.name).join(', ');
            vscode.window.showWarningMessage(
                `No encontré la tarea ${requestedName}. Disponibles: ${availableTasks || 'ninguna'}`
            );
            return;
        }

        await vscode.tasks.executeTask(task);
        vscode.window.setStatusBarMessage(`SynBio: ejecutando tarea ${task.name}`, 4000);
    }

    private findTask(tasks: vscode.Task[], requestedName: string): vscode.Task | undefined {
        const normalizedRequested = this.normalize(requestedName);

        return tasks.find(task => this.normalize(task.name) === normalizedRequested)
            ?? tasks.find(task => this.normalize(task.name).includes(normalizedRequested));
    }

    private async openTerminal(name: string, relativePath: string): Promise<void> {
        const workspacePath = this.resolveWorkspacePath(relativePath);
        if (!workspacePath) {
            vscode.window.showErrorMessage('No hay un workspace abierto para crear una terminal.');
            return;
        }

        const terminal = vscode.window.createTerminal({ name, cwd: workspacePath });
        terminal.show();
        vscode.window.setStatusBarMessage(`SynBio: terminal abierta en ${relativePath || '.'}`, 3000);
    }

    private resolveWorkspacePath(relativePath: string): string | undefined {
        const activeEditor = vscode.window.activeTextEditor;
        const activeFolder = activeEditor ? vscode.workspace.getWorkspaceFolder(activeEditor.document.uri) : undefined;
        const workspaceFolder = activeFolder ?? vscode.workspace.workspaceFolders?.[0];

        if (!workspaceFolder) {
            return undefined;
        }

        return relativePath
            ? path.join(workspaceFolder.uri.fsPath, relativePath)
            : workspaceFolder.uri.fsPath;
    }

    private normalize(value: string): string {
        return value.toLowerCase().replace(/\s+/g, ' ').trim();
    }

    private log(message: string): void {
        this.outputChannel.appendLine(`[${new Date().toISOString()}] ${message}`);
    }

    dispose(): void {
        for (const disposable of this.disposables) {
            disposable.dispose();
        }

        this.outputChannel.dispose();
    }
}