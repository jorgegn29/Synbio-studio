/**
 * SynBio-LLVM — Biosecurity Quick-Fix Code Actions
 *
 * Ofrece correcciones automáticas desde los diagnósticos del escáner de
 * bioseguridad.  Cada quick-fix se mapea a un diagnostic code (TOX001…,
 * ABR001…, STRUCT-001, etc.) y genera un workspace edit con el snippet
 * o la anotación de seguridad pertinente.
 */

import * as vscode from 'vscode';
import { getBioLinterPromoterQuickFixes } from './bio-linter-quickfixes';

const QUICKFIXES: Record<string, { title: string; snippet: string; position: 'end' | 'after-line' }> = {
    // ── Toxinas: añadir antitoxina correspondiente ──
    'TOX001': {
        title: '➕ Añadir antitoxina CcdA (neutraliza CcdB)',
        snippet: [
            '',
            '// ── Antitoxina de seguridad ──',
            'gene ccdA {',
            '    promoter: pConstitutive',
            '    rbs: B0034',
            '    sequence: "ATGAAGCAGCATATGATTTTTAATCTGATTGATGTTACCCTGCGCATCGATGCCTTTAAC"',
            '    terminator: B0015',
            '    product: "CcdA antitoxin"',
            '    // Antitoxina para CcdB — NIH Guidelines Section III-E',
            '}',
        ].join('\n'),
        position: 'after-line',
    },
    'TOX002': {
        title: '➕ Añadir antitoxina MazE (neutraliza MazF)',
        snippet: [
            '',
            '// ── Antitoxina de seguridad ──',
            'gene mazE {',
            '    promoter: pConstitutive',
            '    rbs: B0034',
            '    sequence: "ATGAAAGATAAATACACATTAGCAGGTATTGATGTGGGATTTGATGAAGTCACC"',
            '    terminator: B0015',
            '    product: "MazE antitoxin"',
            '    // Antitoxina para MazF — NIH Guidelines Section III-E',
            '}',
        ].join('\n'),
        position: 'after-line',
    },
    'TOX003': {
        title: '⚠️ Añadir promotor regulado estricto para Holina',
        snippet: [
            '',
            '// ──  Control de expresión de Holina ──',
            '// IMPORTANTE: Holina debe estar bajo promotor estrictamente regulado.',
            '// Sustituir promotor constitutivo por: pBAD (arabinosa) o pTet (aTc).',
            '// promoter pBAD { type: "inducible", inducer: "L-arabinose" }',
        ].join('\n'),
        position: 'after-line',
    },

    // ── Resistencia a antibióticos ──
    'ABR004': {
        title: '⚠️ Documentar justificación para VanA/VanB (vancomicina)',
        snippet: [
            '',
            '// ═══ BIOSECURITY NOTE ═══',
            '// Resistencia a vancomicina detectada.',
            '// Justificación científica requerida (IBC approval):',
            '//   Razón: [COMPLETAR]',
            '//   Aprobado por: [NOMBRE, FECHA]',
            '//   Referencia IBC: [NÚMERO DE PROTOCOLO]',
            '// NIH Guidelines Section III-A-1; WHO Priority Pathogens 2024',
        ].join('\n'),
        position: 'after-line',
    },
    'ABR005': {
        title: '🚫 Documentar justificación para MDR (mcr-1/NDM-1/KPC)',
        snippet: [
            '',
            '// ═══ CRITICAL BIOSECURITY NOTE ═══',
            '// Gen de resistencia multi-droga detectado.',
            '// PROHIBIDO en circuitos sintéticos excepto diagnósticos autorizados.',
            '//   Autorización: [NÚMERO]',
            '//   Aprobado por: [COMITÉ, FECHA]',
            '// NSABB DURC Framework; NIH Guidelines Section III-A',
        ].join('\n'),
        position: 'after-line',
    },

    // ── Transferencia horizontal ──
    'TRF001': {
        title: '🔧 Marcar oriT para eliminación en constructo final',
        snippet: [
            '',
            '// ═══ BIOSECURITY: oriT REMOVAL PLANNED ═══',
            '// oriT detectado — debe eliminarse del constructo final.',
            '// Usar plásmido no-mobilizable (e.g. pSB1C3, sin oriT).',
            '// Ref: NIH Guidelines Appendix C-I-A; EU Dir 2001/18/EC Annex II §D.2',
        ].join('\n'),
        position: 'after-line',
    },

    // ── Kill switch ausente ──
    'STRUCT-001': {
        title: '➕ Insertar kill switch (CcdB/CcdA toxin-antitoxin)',
        snippet: [
            '',
            '// ═══════════════════════════════════════════',
            '// Kill Switch — Toxin-Antitoxin (CcdB/CcdA)',
            '// iGEM Safety Policies 2024; NIH Section III-D',
            '// ═══════════════════════════════════════════',
            'safety kill_switch {',
            '    type: "toxin-antitoxin"',
            '    toxin: ccdB {',
            '        promoter: pTet    // activado por default',
            '        rbs: B0034',
            '        terminator: B0015',
            '    }',
            '    antitoxin: ccdA {',
            '        promoter: pLac    // requiere IPTG para sobrevivir',
            '        rbs: B0034',
            '        terminator: B0015',
            '    }',
            '    // Sin IPTG → el organismo muere (fail-safe)',
            '}',
        ].join('\n'),
        position: 'end',
    },

    // ── Auxotrofía ──
    'GEN002': {
        title: '➕ Añadir auxotrofía de contención (thyA)',
        snippet: [
            '',
            '// ═══ Contención biológica: Auxotrofía ═══',
            '// thyA⁻ requiere timidina exógena para sobrevivir.',
            '// Sin timidina en el ambiente → muerte celular.',
            'safety auxotrophy {',
            '    type: "auxotrophy"',
            '    gene: thyA',
            '    dependency: "thymidine"',
            '    // NIH Guidelines Appendix C-I biological containment',
            '}',
        ].join('\n'),
        position: 'end',
    },
};

/**
 * CodeActionProvider para diagnósticos de bioseguridad.
 * También ofrece quick-fixes del Bio-Linter contextual cuando el diagnóstico
 * BIO-W060 se genera desde SynBio-LLVM.
 */
export class BiosecurityCodeActionProvider implements vscode.CodeActionProvider {
    static readonly providedCodeActionKinds = [vscode.CodeActionKind.QuickFix];

    provideCodeActions(
        document: vscode.TextDocument,
        range: vscode.Range | vscode.Selection,
        context: vscode.CodeActionContext
    ): vscode.CodeAction[] {
        const actions: vscode.CodeAction[] = [];

        for (const diag of context.diagnostics) {
            const rawCode = String(diag.code ?? '');
            const rootCode = rawCode.replace(/-L\d+$/, '');

            if (diag.source === 'SynBio-LLVM' && rootCode === 'BIO-W060') {
                actions.push(...this.createBioLinterPromoterActions(document, diag));
                continue;
            }

            if (diag.source !== 'SynBio Biosecurity') continue;

            const fix = QUICKFIXES[rootCode];
            if (!fix) continue;

            const action = new vscode.CodeAction(fix.title, vscode.CodeActionKind.QuickFix);
            action.diagnostics = [diag];
            action.isPreferred = true;

            const edit = new vscode.WorkspaceEdit();
            if (fix.position === 'end') {
                // Insertar al final del documento
                const lastLine = document.lineAt(document.lineCount - 1);
                edit.insert(document.uri, lastLine.range.end, '\n' + fix.snippet + '\n');
            } else {
                // Insertar justo después de la línea del diagnóstico
                const insertLine = Math.min(diag.range.end.line + 1, document.lineCount);
                edit.insert(document.uri, new vscode.Position(insertLine, 0), fix.snippet + '\n');
            }

            action.edit = edit;
            actions.push(action);
        }

        // Acción genérica: abrir panel de bioseguridad
        if (context.diagnostics.some(d => d.source === 'SynBio Biosecurity')) {
            const openPanel = new vscode.CodeAction(
                '🛡️ Abrir panel de Bioseguridad',
                vscode.CodeActionKind.QuickFix
            );
            openPanel.command = { command: 'synbio.biosecurity', title: 'Biosecurity Scan' };
            actions.push(openPanel);
        }

        return actions;
    }

    private createBioLinterPromoterActions(
        document: vscode.TextDocument,
        diag: vscode.Diagnostic,
    ): vscode.CodeAction[] {
        const currentPromoter = document.getText(diag.range).trim();
        const actions: vscode.CodeAction[] = [];

        for (const suggestion of getBioLinterPromoterQuickFixes(currentPromoter)) {

            const action = new vscode.CodeAction(
                suggestion.title,
                vscode.CodeActionKind.QuickFix,
            );
            action.diagnostics = [diag];
            action.isPreferred = suggestion.preferred;

            const edit = new vscode.WorkspaceEdit();
            edit.replace(document.uri, diag.range, suggestion.replacement);
            action.edit = edit;
            actions.push(action);
        }

        return actions;
    }
}
