/**
 * SynBio-LLVM — Biosecurity Preflight Gate
 *
 * Ejecuta un escaneo silencioso antes de acciones sensibles (compilar, exportar,
 * simular) y bloquea o pide confirmación si hay riesgos critical/high o el BSL
 * requerido supera al configurado en el lab.
 *
 * Dependencias:
 *   - BiosecurityScanner.scanSilent()  (escaneo sin abrir panel)
 *   - AuditTrailManager.log()          (trazabilidad)
 */

import * as vscode from 'vscode';

/** Findings mínimos que necesita el preflight */
export interface PreflightFinding {
    threat: 'critical' | 'high' | 'medium' | 'low' | 'info';
    category: string;
    title: string;
}

export interface PreflightResult {
    allowed: boolean;
    /** true si el usuario confirmó manualmente pese a riesgos */
    overridden: boolean;
    findings: PreflightFinding[];
    bslRequired: string;
    bslLab: string;
}

interface PreflightDeps {
    scanSilent: (text: string) => PreflightFinding[];
    auditLog?: (action: string, description: string, resource?: string, metadata?: Record<string, any>, regulation?: string) => void;
}

export class BiosecurityPreflight {
    private deps: PreflightDeps;

    constructor(deps: PreflightDeps) {
        this.deps = deps;
    }

    /**
     * Evalúa el documento activo (o el texto dado) y decide si la acción puede
     * continuar.  Devuelve `{ allowed: true }` si es seguro, o bloquea/pide
     * confirmación según la configuración.
     *
     * @param actionLabel  Nombre legible de la acción ("Compilar", "Exportar SBOL"…)
     * @param text         Contenido a escanear (si no se da, usa el editor activo)
     */
    async check(actionLabel: string, text?: string): Promise<PreflightResult> {
        const editor = vscode.window.activeTextEditor;
        const content = text ?? editor?.document.getText() ?? '';
        const filename = editor?.document.fileName ?? 'unknown';

        const enabled = vscode.workspace.getConfiguration('synbio').get<boolean>('biosecurityPreflight', true);
        if (!enabled) {
            return { allowed: true, overridden: false, findings: [], bslRequired: 'BSL-1', bslLab: 'BSL-1' };
        }

        if (!content.trim()) {
            return { allowed: true, overridden: false, findings: [], bslRequired: 'BSL-1', bslLab: 'BSL-1' };
        }

        const findings = this.deps.scanSilent(content);
        const criticalOrHigh = findings.filter(f => f.threat === 'critical' || f.threat === 'high');
        const bslLab = vscode.workspace.getConfiguration('synbio').get<string>('biosafetyLevel', 'BSL-1');
        const bslRequired = criticalOrHigh.some(f => f.category === 'Select Agent') ? 'BSL-3'
            : criticalOrHigh.length > 0 ? 'BSL-2'
            : 'BSL-1';

        const bslNum = (s: string) => parseInt(s.replace(/\D/g, '') || '1', 10);
        const bslMismatch = bslNum(bslRequired) > bslNum(bslLab);

        // Sin riesgos altos ni mismatch → pasa libre
        if (criticalOrHigh.length === 0 && !bslMismatch) {
            this.logAudit('preflight.pass', actionLabel, filename, findings, bslRequired);
            return { allowed: true, overridden: false, findings, bslRequired, bslLab };
        }

        // Hay riesgos critical → bloqueo absoluto, no se puede override
        const hasCritical = findings.some(f => f.threat === 'critical');
        if (hasCritical) {
            const criticals = findings.filter(f => f.threat === 'critical').map(f => f.title);
            vscode.window.showErrorMessage(
                `🚫 Bioseguridad: "${actionLabel}" bloqueado — se detectaron agentes selectos o amenazas críticas: ${criticals.join(', ')}. Requiere ${bslRequired}, lab configurado como ${bslLab}.`
            );
            this.logAudit('preflight.block', actionLabel, filename, findings, bslRequired);
            return { allowed: false, overridden: false, findings, bslRequired, bslLab };
        }

        // Riesgos high o BSL mismatch → pedir confirmación
        const highTitles = criticalOrHigh.map(f => f.title);
        const detail = bslMismatch
            ? `Requiere ${bslRequired} pero el lab está en ${bslLab}. Riesgos: ${highTitles.join(', ')}`
            : `Riesgos altos: ${highTitles.join(', ')}`;

        const choice = await vscode.window.showWarningMessage(
            `⚠️ Bioseguridad: "${actionLabel}" tiene riesgos pendientes. ${detail}`,
            { modal: true },
            'Continuar igualmente',
            'Cancelar'
        );

        if (choice === 'Continuar igualmente') {
            this.logAudit('preflight.override', actionLabel, filename, findings, bslRequired);
            return { allowed: true, overridden: true, findings, bslRequired, bslLab };
        }

        this.logAudit('preflight.cancel', actionLabel, filename, findings, bslRequired);
        return { allowed: false, overridden: false, findings, bslRequired, bslLab };
    }

    private logAudit(
        action: string,
        actionLabel: string,
        filename: string,
        findings: PreflightFinding[],
        bslRequired: string
    ): void {
        this.deps.auditLog?.(
            action as any,
            `Preflight ${action.split('.')[1]} for "${actionLabel}"`,
            filename,
            {
                action: actionLabel,
                totalFindings: findings.length,
                critical: findings.filter(f => f.threat === 'critical').length,
                high: findings.filter(f => f.threat === 'high').length,
                bslRequired
            },
            'NIH Guidelines Section III (Apr 2024); iGEM Safety Policies'
        );
    }
}
