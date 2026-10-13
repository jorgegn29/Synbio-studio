/**
 * ══════════════════════════════════════════════════════════════
 * SynBio-LLVM — Onboarding Walkthrough System
 *
 * Provides first-run experience, guided tour, and contextual
 * help for new users of the synthetic biology IDE.
 *
 * Features:
 *   - First-run detection and welcome flow
 *   - Step-by-step walkthrough with highlighted UI areas
 *   - Quick-start templates (Toggle Switch, Sensor-Reporter, etc.)
 *   - Contextual tips based on active file type
 *   - Progress tracking for onboarding milestones
 *
 * References:
 *   VS Code Walkthrough API: contributes.walkthroughs
 *   BioScript language specification (internal)
 * ══════════════════════════════════════════════════════════════
 */
import * as vscode from 'vscode';

// ── Onboarding State ──────────────────────────────────────────────────

interface OnboardingState {
    completedSteps: string[];
    firstRunDismissed: boolean;
    lastVersion: string;
    totalFilesCreated: number;
    totalCompilations: number;
    totalSimulations: number;
}

const ONBOARDING_KEY = 'synbio.onboarding';

export class OnboardingManager {
    private state: OnboardingState;
    private context: vscode.ExtensionContext;
    private statusBarItem: vscode.StatusBarItem;

    constructor(context: vscode.ExtensionContext) {
        this.context = context;
        this.state = this.loadState();
        this.statusBarItem = vscode.window.createStatusBarItem(
            vscode.StatusBarAlignment.Right, 50
        );
        this.statusBarItem.command = 'synbio.showOnboarding';
        this.updateStatusBar();
    }

    // ── Core API ────────────────────────────────────────────────

    /**
     * Check if this is the user's first time (or new version).
     */
    async checkFirstRun(currentVersion: string): Promise<void> {
        if (this.state.lastVersion !== currentVersion || !this.state.firstRunDismissed) {
            this.state.lastVersion = currentVersion;
            this.saveState();
            
            if (!this.state.firstRunDismissed) {
                await this.showWelcome();
            } else {
                await this.showWhatsNew(currentVersion);
            }
        }
    }

    /**
     * Show the full welcome walkthrough.
     */
    async showWelcome(): Promise<void> {
        const choice = await vscode.window.showInformationMessage(
            '🧬 ¡Bienvenido a SynBio-LLVM! Tu IDE para biología sintética.',
            { modal: false },
            'Iniciar Tour Guiado',
            'Crear Primer Circuito',
            'Ver Documentación',
            'Omitir'
        );

        switch (choice) {
            case 'Iniciar Tour Guiado':
                await this.runGuidedTour();
                break;
            case 'Crear Primer Circuito':
                await this.createQuickStartFile();
                break;
            case 'Ver Documentación':
                vscode.env.openExternal(vscode.Uri.parse('https://github.com/synbio-llvm/synbio-llvm/wiki'));
                break;
            case 'Omitir':
                this.state.firstRunDismissed = true;
                this.saveState();
                break;
        }
    }

    /**
     * Guided tour through the IDE features.
     */
    async runGuidedTour(): Promise<void> {
        const steps = [
            {
                id: 'step-sidebar',
                title: '📂 Paso 1: SynBio Explorer',
                detail: 'Abre la barra lateral de SynBio (ícono de ADN). Aquí verás tus componentes genéticos, caja de herramientas, y estado de bioseguridad.',
                action: () => vscode.commands.executeCommand('workbench.view.extension.synbio-explorer'),
            },
            {
                id: 'step-create',
                title: '✏️ Paso 2: Crea un Circuito',
                detail: 'Crea un archivo .bio para empezar a programar genes.\n\nPrueba: Ctrl+Shift+P → "SynBio: Crear Nuevo Circuito"',
                action: () => vscode.commands.executeCommand('synbio.newCircuit'),
            },
            {
                id: 'step-snippets',
                title: '⚡ Paso 3: Snippets Rápidos',
                detail: 'Escribe "tu:" para invocar snippets de Transcription Units, o "circuit:" para circuitos completos.\n\nPrueba escribir "toggle" para ver el Toggle Switch template.',
            },
            {
                id: 'step-compile',
                title: '🔬 Paso 4: Compila',
                detail: 'Compila tu circuito genético con Ctrl+Shift+B.\nGenera salidas en SBOL 3.0, FASTA, GenBank.',
                action: () => vscode.commands.executeCommand('synbio.compile'),
            },
            {
                id: 'step-simulate',
                title: '📊 Paso 5: Simula (Gillespie SSA)',
                detail: 'Simula la dinámica estocástica de tu circuito con el algoritmo de Gillespie.\n\nUsa Ctrl+Shift+S para abrir el simulador.',
            },
            {
                id: 'step-safety',
                title: '🛡️ Paso 6: Bioseguridad',
                detail: 'El clasificador BSL evalúa automaticamente tu organismo según BMBL 6th Ed.\nRevisa el panel "Estado de Bioseguridad" en la barra lateral.',
            },
        ];

        for (const step of steps) {
            const choice = await vscode.window.showInformationMessage(
                `${step.title}\n\n${step.detail}`,
                { modal: true },
                'Siguiente →',
                'Ejecutar Acción',
                'Terminar Tour'
            );

            if (choice === 'Ejecutar Acción' && step.action) {
                try { await step.action(); } catch { /* non-fatal */ }
            } else if (choice === 'Terminar Tour') {
                break;
            }

            this.markStepComplete(step.id);
        }

        this.state.firstRunDismissed = true;
        this.saveState();
        
        vscode.window.showInformationMessage(
            '🎉 ¡Tour completado! Usa Ctrl+Shift+P → "SynBio" para ver todos los comandos.'
        );
    }

    /**
     * Create a quick-start .bio file with a commented tutorial.
     */
    async createQuickStartFile(): Promise<void> {
        const QUICK_START = `// ══════════════════════════════════════════════════════
// 🧬 SynBio-LLVM — Tu Primer Circuito Genético
// ══════════════════════════════════════════════════════
//
// Este archivo es una Transcription Unit (TU) básica.
// Cada TU necesita: promoter → RBS → gene → terminator
//
// INSTRUCCIONES:
//   1. Lee los comentarios para entender cada parte
//   2. Compila con Ctrl+Shift+B
//   3. Simula con Ctrl+Shift+S
//   4. Exporta con Ctrl+Shift+P → "SynBio: Export"

// ── Define tu circuito ─────────────────────────────────
circuit MiPrimerCircuito {
    
    // Transcription Unit 1: GFP reporter
    transcription_unit TU_GFP {
        // Promoter constitutivo fuerte (Anderson collection)
        promoter: J23100   // ~2547 RPU
        
        // Ribosome Binding Site (Elowitz & Leibler 2000)
        rbs: B0034         // fuerte
        
        // Gene que queremos expresar
        gene: GFP {
            sequence: ATGGTGAGCAAGGGCGAGGAG
            organism: ecoli
            function: "Proteina fluorescente verde"
        }
        
        // Terminator doble (Chen et al 2013)
        terminator: B0015
    }
}

// ── Próximos pasos ─────────────────────────────────────
// • Agrega más TUs para crear un circuito tipo repressilator
// • Escribe "toggle" y presiona Tab para un template de Toggle Switch
// • Usa Ctrl+Shift+P → "SynBio: CRISPR Designer" para edición génica
// • Revisa el panel de Bioseguridad en la barra lateral
`;
        const doc = await vscode.workspace.openTextDocument({
            content: QUICK_START,
            language: 'bioscript',
        });
        await vscode.window.showTextDocument(doc);
        this.state.totalFilesCreated++;
        this.saveState();
    }

    /**
     * Show what's new for a version upgrade.
     */
    async showWhatsNew(version: string): Promise<void> {
        const choice = await vscode.window.showInformationMessage(
            `🧬 SynBio-LLVM actualizado a v${version}. ¿Ver novedades?`,
            'Ver CHANGELOG',
            'Omitir'
        );
        if (choice === 'Ver CHANGELOG') {
            const changelogUri = vscode.Uri.joinPath(
                this.context.extensionUri, '..', '..', 'CHANGELOG.md'
            );
            try {
                const doc = await vscode.workspace.openTextDocument(changelogUri);
                await vscode.window.showTextDocument(doc, { preview: true });
            } catch {
                vscode.env.openExternal(
                    vscode.Uri.parse('https://github.com/synbio-llvm/synbio-llvm/blob/main/CHANGELOG.md')
                );
            }
        }
    }

    /**
     * Show contextual tips based on the current file.
     */
    async showContextualTip(): Promise<void> {
        const editor = vscode.window.activeTextEditor;
        if (!editor) return;

        const text = editor.document.getText();
        const tips: string[] = [];

        if (!text.includes('promoter')) {
            tips.push('💡 Tu circuito no tiene promoter. Escribe "prom" + Tab para añadir uno.');
        }
        if (!text.includes('terminator')) {
            tips.push('⚠️ Sin terminator, puede haber read-through transcripcional. Añade "terminator: B0015".');
        }
        if (text.includes('circuit') && !text.includes('rbs')) {
            tips.push('💡 Falta RBS. Sin sitio de unión al ribosoma, la traducción será mínima.');
        }
        if (text.length > 5000 && !text.includes('kill_switch')) {
            tips.push('🛡️ Circuito grande sin kill switch. Considera añadir bioseguridad.');
        }

        if (tips.length > 0) {
            vscode.window.showInformationMessage(
                tips[0],
                'Ver Más Tips',
                'Cerrar'
            );
        } else {
            vscode.window.showInformationMessage('✅ Tu circuito se ve completo. ¡Compila para verificar!');
        }
    }

    // ── Milestone Tracking ──────────────────────────────────────

    trackCompilation(): void {
        this.state.totalCompilations++;
        this.saveState();
        this.checkMilestones();
    }

    trackSimulation(): void {
        this.state.totalSimulations++;
        this.saveState();
        this.checkMilestones();
    }

    private checkMilestones(): void {
        if (this.state.totalCompilations === 1) {
            vscode.window.showInformationMessage('🎯 ¡Primera compilación exitosa! Logro desbloqueado.');
        }
        if (this.state.totalSimulations === 1) {
            vscode.window.showInformationMessage('📊 ¡Primera simulación! Ahora puedes ver la dinámica estocástica.');
        }
        if (this.state.totalCompilations === 10) {
            vscode.window.showInformationMessage('🏆 ¡10 compilaciones! Ya eres un ingeniero genético en formación.');
        }
    }

    // ── Progress ────────────────────────────────────────────────

    getProgress(): { completed: number; total: number; percentage: number } {
        const total = 6;
        const completed = this.state.completedSteps.length;
        return {
            completed,
            total,
            percentage: Math.round((completed / total) * 100),
        };
    }

    // ── Private ─────────────────────────────────────────────────

    private markStepComplete(stepId: string): void {
        if (!this.state.completedSteps.includes(stepId)) {
            this.state.completedSteps.push(stepId);
            this.saveState();
            this.updateStatusBar();
        }
    }

    private updateStatusBar(): void {
        const progress = this.getProgress();
        if (progress.percentage < 100) {
            this.statusBarItem.text = `$(beaker) SynBio ${progress.percentage}%`;
            this.statusBarItem.tooltip = `Onboarding: ${progress.completed}/${progress.total} pasos completados`;
            this.statusBarItem.show();
        } else {
            this.statusBarItem.hide();
        }
    }

    private loadState(): OnboardingState {
        return this.context.globalState.get<OnboardingState>(ONBOARDING_KEY, {
            completedSteps: [],
            firstRunDismissed: false,
            lastVersion: '',
            totalFilesCreated: 0,
            totalCompilations: 0,
            totalSimulations: 0,
        });
    }

    private saveState(): void {
        this.context.globalState.update(ONBOARDING_KEY, this.state);
    }

    dispose(): void {
        this.statusBarItem.dispose();
    }
}
