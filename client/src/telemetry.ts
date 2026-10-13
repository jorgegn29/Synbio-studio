/**
 * ══════════════════════════════════════════════════════════════
 * SynBio-LLVM — Privacy-First Telemetry Module
 *
 * Opt-in anonymous usage analytics for product improvement.
 * Follows GDPR Article 7 (explicit consent) and VS Code
 * telemetry best practices.
 *
 * Design principles:
 *   1. OFF by default — user must explicitly opt in
 *   2. No PII collected — ever
 *   3. No sequence data leaves the machine
 *   4. Aggregate counters only (no individual events)
 *   5. Transparent: user can view all collected data
 *   6. One-click data deletion
 *
 * Collected metrics (when opted in):
 *   - Command usage frequency (anonymized)
 *   - Feature adoption rates
 *   - Error class distribution (no stack traces)
 *   - Session duration bucket (< 5m, 5-30m, 30m-2h, > 2h)
 *   - VS Code version + extension version
 *
 * NOT collected (ever):
 *   - DNA/protein sequences
 *   - File names or paths
 *   - IP addresses (no network calls)
 *   - User identifiers
 *   - Biosafety classifications
 * ══════════════════════════════════════════════════════════════
 */
import * as vscode from 'vscode';

// ── Types ──────────────────────────────────────────────────────────────

interface TelemetryState {
    optedIn: boolean;
    consentDate?: string;
    /** Aggregate command counters — command name → count */
    commandCounts: Record<string, number>;
    /** Error class counters — error type → count */
    errorCounts: Record<string, number>;
    /** Feature adoption flags — feature → first-used date */
    featureAdoption: Record<string, string>;
    /** Session count */
    sessionCount: number;
    /** Total session time in seconds (aggregate) */
    totalSessionSeconds: number;
    /** Extension version */
    extensionVersion: string;
    /** VS Code version */
    vscodeVersion: string;
}

const TELEMETRY_KEY = 'synbio.telemetry';

// ── Session Duration Buckets ───────────────────────────────────────────

type SessionBucket = '<5m' | '5-30m' | '30m-2h' | '>2h';

function getSessionBucket(seconds: number): SessionBucket {
    if (seconds < 300) return '<5m';
    if (seconds < 1800) return '5-30m';
    if (seconds < 7200) return '30m-2h';
    return '>2h';
}

// ── Telemetry Manager ──────────────────────────────────────────────────

export class TelemetryManager {
    private state: TelemetryState;
    private context: vscode.ExtensionContext;
    private sessionStart: number;
    private outputChannel: vscode.OutputChannel;

    constructor(context: vscode.ExtensionContext) {
        this.context = context;
        this.sessionStart = Date.now();
        this.outputChannel = vscode.window.createOutputChannel('SynBio Telemetry');
        this.state = this.loadState();

        // Increment session count
        this.state.sessionCount++;
        this.state.extensionVersion = '0.2.0';
        this.state.vscodeVersion = vscode.version;
        this.saveState();
    }

    // ── Consent Management ──────────────────────────────────────

    /**
     * Check if user has opted in to telemetry.
     */
    isOptedIn(): boolean {
        // Also respect VS Code global telemetry setting
        const vscTelemetry = vscode.workspace.getConfiguration('telemetry');
        const globalLevel = vscTelemetry.get<string>('telemetryLevel', 'all');
        if (globalLevel === 'off') return false;

        return this.state.optedIn;
    }

    /**
     * Prompt user for telemetry consent (shown once).
     */
    async promptConsent(): Promise<void> {
        if (this.state.consentDate) return; // Already asked

        const choice = await vscode.window.showInformationMessage(
            '📊 SynBio-LLVM puede recopilar métricas anónimas de uso para mejorar la herramienta. ' +
            'No se recopilan secuencias, archivos ni datos personales.',
            { modal: false },
            'Activar Telemetría',
            'Ver Detalles',
            'No, gracias'
        );

        switch (choice) {
            case 'Activar Telemetría':
                this.state.optedIn = true;
                this.state.consentDate = new Date().toISOString();
                this.saveState();
                vscode.window.showInformationMessage('✅ Telemetría activada. Puedes desactivarla en cualquier momento desde Configuración.');
                break;
            case 'Ver Detalles':
                this.showCollectedData();
                break;
            case 'No, gracias':
                this.state.optedIn = false;
                this.state.consentDate = new Date().toISOString();
                this.saveState();
                break;
        }
    }

    /**
     * Toggle telemetry on/off.
     */
    toggleOptIn(enable: boolean): void {
        this.state.optedIn = enable;
        this.state.consentDate = new Date().toISOString();
        this.saveState();
    }

    // ── Data Collection (only if opted in) ──────────────────────

    /**
     * Track a command execution.
     */
    trackCommand(commandId: string): void {
        if (!this.isOptedIn()) return;

        // Strip any file-specific info, keep only command name
        const sanitized = commandId.replace(/[^a-zA-Z0-9.]/g, '_');
        this.state.commandCounts[sanitized] = (this.state.commandCounts[sanitized] || 0) + 1;
        this.saveState();
    }

    /**
     * Track a feature being used for the first time.
     */
    trackFeatureAdoption(feature: string): void {
        if (!this.isOptedIn()) return;

        if (!this.state.featureAdoption[feature]) {
            this.state.featureAdoption[feature] = new Date().toISOString();
            this.saveState();
        }
    }

    /**
     * Track an error class (no stack traces, no messages).
     */
    trackError(errorClass: string): void {
        if (!this.isOptedIn()) return;

        const sanitized = errorClass.replace(/[^a-zA-Z0-9_]/g, '');
        this.state.errorCounts[sanitized] = (this.state.errorCounts[sanitized] || 0) + 1;
        this.saveState();
    }

    // ── Data Access & Deletion ──────────────────────────────────

    /**
     * Show all collected data to the user (full transparency).
     */
    showCollectedData(): void {
        const sessionSeconds = Math.floor((Date.now() - this.sessionStart) / 1000);
        const bucket = getSessionBucket(this.state.totalSessionSeconds + sessionSeconds);

        const lines: string[] = [
            '══════════════════════════════════════════════════════',
            '  📊 SynBio-LLVM — Datos de Telemetría Recopilados',
            '══════════════════════════════════════════════════════',
            '',
            `Estado: ${this.state.optedIn ? '✅ Activada' : '❌ Desactivada'}`,
            `Consentimiento: ${this.state.consentDate || 'No solicitado aún'}`,
            `Versión extensión: ${this.state.extensionVersion}`,
            `Versión VS Code: ${this.state.vscodeVersion}`,
            `Sesiones totales: ${this.state.sessionCount}`,
            `Duración sesiones (bucket): ${bucket}`,
            '',
            '── Uso de Comandos ──',
        ];

        const commands = Object.entries(this.state.commandCounts)
            .sort(([, a], [, b]) => b - a);
        if (commands.length === 0) {
            lines.push('  (ningún dato)');
        } else {
            for (const [cmd, count] of commands) {
                lines.push(`  ${cmd}: ${count}×`);
            }
        }

        lines.push('', '── Adopción de Features ──');
        const features = Object.entries(this.state.featureAdoption);
        if (features.length === 0) {
            lines.push('  (ningún dato)');
        } else {
            for (const [feat, date] of features) {
                lines.push(`  ${feat}: primera vez ${date.slice(0, 10)}`);
            }
        }

        lines.push('', '── Errores (solo clase, sin detalles) ──');
        const errors = Object.entries(this.state.errorCounts);
        if (errors.length === 0) {
            lines.push('  (ningún error registrado)');
        } else {
            for (const [err, count] of errors) {
                lines.push(`  ${err}: ${count}×`);
            }
        }

        lines.push('', '══════════════════════════════════════════════════════');
        lines.push('Para borrar todos los datos: Ctrl+Shift+P → "SynBio: Borrar Datos de Telemetría"');

        this.outputChannel.clear();
        for (const line of lines) {
            this.outputChannel.appendLine(line);
        }
        this.outputChannel.show();
    }

    /**
     * Delete all collected telemetry data (GDPR right to erasure).
     */
    async deleteAllData(): Promise<void> {
        const confirm = await vscode.window.showWarningMessage(
            '¿Borrar todos los datos de telemetría? Esta acción no se puede deshacer.',
            { modal: true },
            'Sí, borrar todo'
        );
        if (confirm !== 'Sí, borrar todo') return;

        this.state = {
            optedIn: false,
            commandCounts: {},
            errorCounts: {},
            featureAdoption: {},
            sessionCount: 0,
            totalSessionSeconds: 0,
            extensionVersion: '0.2.0',
            vscodeVersion: vscode.version,
        };
        this.saveState();
        vscode.window.showInformationMessage('🗑️ Datos de telemetría borrados.');
    }

    /**
     * Export telemetry data as JSON (for user review).
     */
    getDataAsJSON(): string {
        return JSON.stringify(this.state, null, 2);
    }

    // ── Session End ─────────────────────────────────────────────

    /**
     * Call on deactivation to record session duration.
     */
    endSession(): void {
        if (!this.isOptedIn()) return;
        const sessionSeconds = Math.floor((Date.now() - this.sessionStart) / 1000);
        this.state.totalSessionSeconds += sessionSeconds;
        this.saveState();
    }

    // ── Private ─────────────────────────────────────────────────

    private loadState(): TelemetryState {
        return this.context.globalState.get<TelemetryState>(TELEMETRY_KEY, {
            optedIn: false,
            commandCounts: {},
            errorCounts: {},
            featureAdoption: {},
            sessionCount: 0,
            totalSessionSeconds: 0,
            extensionVersion: '0.2.0',
            vscodeVersion: vscode.version,
        });
    }

    private saveState(): void {
        this.context.globalState.update(TELEMETRY_KEY, this.state);
    }

    dispose(): void {
        this.endSession();
        this.outputChannel.dispose();
    }
}
