/**
 * ══════════════════════════════════════════════════════════════
 * SynBio-LLVM — Scientific Copilot
 *
 * A real-time, context-aware AI copilot that provides
 * explainable scientific suggestions with confidence levels.
 *
 * NOT a wrapper around an LLM. This is a rule-based expert
 * system built on published biological knowledge, with every
 * suggestion traceable to a citation.
 *
 * Capabilities:
 *   - Inline diagnostics with scientific reasoning
 *   - Confidence-scored suggestions (0-100%)
 *   - Part recommendation with RPU/strength data
 *   - Design pattern recognition (toggle, oscillator, etc.)
 *   - Anti-pattern detection (known failure modes)
 *   - Citation chain for every suggestion
 *
 * Knowledge sources:
 *   - Anderson promoter collection (Kelly et al. 2009)
 *   - Mutalik TU characterization (Nat Methods 2013)
 *   - Salis RBS Calculator (Nat Biotech 2009)
 *   - Chen terminator library (Nat Methods 2013)
 *   - Ceroni metabolic burden (Nat Methods 2015)
 *   - Elowitz repressilator parameters (Nature 2000)
 *   - Gardner toggle switch parameters (Nature 2000)
 * ══════════════════════════════════════════════════════════════
 */
import * as vscode from 'vscode';

// ── Knowledge Base ─────────────────────────────────────────────────────

interface PartKnowledge {
    id: string;
    type: 'promoter' | 'rbs' | 'terminator' | 'gene' | 'tag';
    name: string;
    /** Strength/activity value */
    strength: number;
    /** Unit of measurement */
    unit: string;
    /** Organism context */
    organism: string;
    /** Citation */
    citation: string;
    /** Known issues or notes */
    notes?: string;
    /** Compatibility tags */
    compatibleWith?: string[];
    /** Known incompatibilities */
    incompatibleWith?: string[];
}

interface AntiPattern {
    id: string;
    name: string;
    /** Regex pattern to detect in code */
    pattern: RegExp;
    severity: 'error' | 'warning' | 'info';
    message: string;
    fix: string;
    citation: string;
    confidence: number;
}

interface DesignPattern {
    name: string;
    /** Keywords that indicate this pattern */
    indicators: string[];
    description: string;
    suggestedParts: string[];
    citation: string;
}

// Published part data
const PART_KNOWLEDGE: PartKnowledge[] = [
    // Promoters — Kelly et al. J Biol Eng 2009
    { id: 'J23100', type: 'promoter', name: 'J23100 (strongest)', strength: 2547, unit: 'RPU', organism: 'E. coli', citation: 'Kelly et al. J Biol Eng 2009', notes: 'May cause metabolic burden at high copy', compatibleWith: ['B0034', 'B0015'] },
    { id: 'J23101', type: 'promoter', name: 'J23101 (reference)', strength: 1000, unit: 'RPU', organism: 'E. coli', citation: 'Kelly et al. J Biol Eng 2009', compatibleWith: ['B0034', 'B0032', 'B0015'] },
    { id: 'J23106', type: 'promoter', name: 'J23106 (strong)', strength: 1185, unit: 'RPU', organism: 'E. coli', citation: 'Kelly et al. J Biol Eng 2009' },
    { id: 'J23114', type: 'promoter', name: 'J23114 (weak)', strength: 256, unit: 'RPU', organism: 'E. coli', citation: 'Kelly et al. J Biol Eng 2009' },
    { id: 'R0010', type: 'promoter', name: 'pLac', strength: 300, unit: 'RPU', organism: 'E. coli', citation: 'Lutz & Bujard PNAS 1997', notes: 'Inducible by IPTG, repressed by LacI' },
    { id: 'R0040', type: 'promoter', name: 'pTet', strength: 450, unit: 'RPU', organism: 'E. coli', citation: 'Lutz & Bujard PNAS 1997', notes: 'Inducible by aTc, repressed by TetR' },
    { id: 'pT7', type: 'promoter', name: 'T7 promoter', strength: 5000, unit: 'RPU', organism: 'E. coli BL21(DE3)', citation: 'Studier & Moffatt JMB 1986', notes: 'REQUIRES T7 RNAP (DE3 lysogen)', incompatibleWith: ['DH5a', 'TOP10', 'MG1655'] },
    { id: 'pBAD', type: 'promoter', name: 'pBAD (arabinose)', strength: 800, unit: 'RPU', organism: 'E. coli', citation: 'Guzman et al. J Bacteriol 1995', notes: 'Inducible by L-arabinose, all-or-none at low conc.' },

    // RBS — Salis et al. Nat Biotech 2009; Mutalik et al. Nat Methods 2013
    { id: 'B0034', type: 'rbs', name: 'B0034 (strong)', strength: 1.0, unit: 'au', organism: 'E. coli', citation: 'Community (strong consensus RBS)' },
    { id: 'B0032', type: 'rbs', name: 'B0032 (medium)', strength: 0.3, unit: 'au', organism: 'E. coli', citation: 'Mutalik et al. Nat Methods 2013' },
    { id: 'B0031', type: 'rbs', name: 'B0031 (weak)', strength: 0.07, unit: 'au', organism: 'E. coli', citation: 'Mutalik et al. Nat Methods 2013' },

    // Terminators — Chen et al. Nat Methods 2013
    { id: 'B0015', type: 'terminator', name: 'B0015 (double strong)', strength: 0.984, unit: 'efficiency', organism: 'E. coli', citation: 'Chen et al. Nat Methods 2013', notes: 'Double terminator B0010+B0012' },
    { id: 'B0010', type: 'terminator', name: 'B0010 (T1)', strength: 0.97, unit: 'efficiency', organism: 'E. coli', citation: 'Chen et al. Nat Methods 2013' },
    { id: 'L3S2P21', type: 'terminator', name: 'L3S2P21 (synthetic)', strength: 0.99, unit: 'efficiency', organism: 'E. coli', citation: 'Chen et al. Nat Methods 2013', notes: 'Very strong synthetic terminator' },

    // Degradation tags
    { id: 'ssrA_LAA', type: 'tag', name: 'ssrA-LAA (fast degradation)', strength: 0.018, unit: '1/min', organism: 'E. coli', citation: 'Andersen et al. AEM 1998' },
    { id: 'ssrA_ASV', type: 'tag', name: 'ssrA-ASV (medium degradation)', strength: 0.0072, unit: '1/min', organism: 'E. coli', citation: 'Andersen et al. AEM 1998' },
];

// Known anti-patterns
const ANTI_PATTERNS: AntiPattern[] = [
    {
        id: 'missing-terminator',
        name: 'Missing Terminator',
        pattern: /gene\s+\w+\s*\{[^}]*\}\s*(?!.*terminator)/,
        severity: 'error',
        message: 'Gene sin terminator: el read-through transcripcional puede causar expresión no deseada de genes downstream.',
        fix: 'Añadir "terminator: B0015" después del gen. El terminador doble B0015 tiene 98.4% de eficiencia (Chen et al. 2013).',
        citation: 'Chen YJ et al. Nat Methods 2013;10(7):659-664',
        confidence: 0.95,
    },
    {
        id: 'missing-rbs',
        name: 'Missing RBS',
        pattern: /promoter\s*:\s*\w+\s*\n\s*gene\s+/,
        severity: 'error',
        message: 'Gen sin RBS entre promoter y CDS: sin sitio de unión al ribosoma, la traducción será mínima o nula.',
        fix: 'Añadir "rbs: B0034" (fuerte) o "rbs: B0032" (medio) entre el promoter y el gen.',
        citation: 'Salis HM et al. Nat Biotechnol 2009;27(10):946-950',
        confidence: 0.98,
    },
    {
        id: 'strong-promoter-toxic',
        name: 'Strong Promoter + Toxic Gene Risk',
        pattern: /promoter\s*:\s*J23100\s*[\s\S]*?gene\s+\w.*(?:toxin|ccdB|CcdB|kill|restrict)/i,
        severity: 'warning',
        message: 'Promoter fuerte (J23100, 2547 RPU) con gen potencialmente tóxico: riesgo de matar las células antes de alcanzar fase de crecimiento.',
        fix: 'Usar un promoter inducible (pLac, pTet, pBAD) para controlar la expresión del gen tóxico.',
        citation: 'Ceroni F et al. Nat Methods 2015;12(5):415-418',
        confidence: 0.85,
    },
    {
        id: 'pT7-wrong-strain',
        name: 'T7 Promoter in non-DE3 Strain',
        pattern: /promoter\s*:\s*pT7[\s\S]*?organism\s*:\s*(?:ecoli|DH5|TOP10|MG1655)/i,
        severity: 'error',
        message: 'Promoter T7 en cepa sin T7 RNAP: la cepa especificada no contiene el lisógeno DE3, por lo que el promoter T7 NO funcionará.',
        fix: 'Cambiar a "organism: BL21_DE3" o usar un promoter diferente (pLac, pTet, J23101).',
        citation: 'Studier FW & Moffatt BA. JMB 1986;189(1):113-130',
        confidence: 0.99,
    },
    {
        id: 'no-kill-switch-bsl2',
        name: 'BSL-2 Without Kill Switch',
        pattern: /organism\s*:\s*(?:salmonella|shigella|pseudomonas|vibrio)/i,
        severity: 'warning',
        message: 'Organismo BSL-2 sin kill switch detectado. Las regulaciones de bioseguridad (NIH Guidelines) recomiendan medidas de contención biológica.',
        fix: 'Añadir un módulo "kill_switch { ... }" con toxina CcdB y antitoxina CcdA bajo control inducible.',
        citation: 'NIH Guidelines for Research Involving Recombinant DNA, Section III-D',
        confidence: 0.9,
    },
    {
        id: 'metabolic-burden',
        name: 'High Metabolic Burden',
        pattern: /transcription_unit\s+\w+[\s\S]*?transcription_unit\s+\w+[\s\S]*?transcription_unit\s+\w+[\s\S]*?transcription_unit\s+\w+/,
        severity: 'warning',
        message: 'Circuito con ≥4 unidades de transcripción: la carga metabólica estimada es ~20%+ de reducción en tasa de crecimiento.',
        fix: 'Considerar: (1) promoters más débiles, (2) integración cromosómica, (3) distribución en múltiples cepas.',
        citation: 'Ceroni F et al. Nat Methods 2015 — ~5% burden per heterologous gene',
        confidence: 0.75,
    },
    {
        id: 'bidirectional-promoter-risk',
        name: 'Adjacent Opposing Promoters',
        pattern: /terminator[\s\S]{0,100}promoter/,
        severity: 'info',
        message: 'Promoters adyacentes detectados. Si están en orientaciones opuestas, pueden causar interferencia transcripcional.',
        fix: 'Insertar insulator (espaciador de ≥200bp) entre unidades de transcripción adyacentes.',
        citation: 'Mutalik VK et al. Nat Methods 2013;10:354-360',
        confidence: 0.6,
    },
];

// Design patterns
const DESIGN_PATTERNS: DesignPattern[] = [
    {
        name: 'Toggle Switch',
        indicators: ['LacI', 'TetR', 'toggle', 'bistable', 'memory'],
        description: 'Interruptor biestable basado en represión mutua (LacI ⊣ TetR, TetR ⊣ LacI). Requiere cooperatividad ≥2 para biestabilidad.',
        suggestedParts: ['pLac (R0010)', 'pTet (R0040)', 'LacI', 'TetR', 'B0034', 'B0015'],
        citation: 'Gardner TS et al. Nature 2000;403:339-342',
    },
    {
        name: 'Repressilator',
        indicators: ['CI', 'repressilator', 'oscillator', 'clock'],
        description: 'Oscilador de 3 genes: LacI → TetR → CI → LacI. Período típico: 150-180 min.',
        suggestedParts: ['LacI', 'TetR', 'CI', 'ssrA-LAA tags', 'B0034', 'B0015'],
        citation: 'Elowitz MB & Leibler S. Nature 2000;403:335-338',
    },
    {
        name: 'Feed-Forward Loop (FFL)',
        indicators: ['feed-forward', 'FFL', 'coherent', 'incoherent', 'pulse'],
        description: 'Motivo de regulación con 3 nodos (X→Y→Z y X→Z). Coherente: filtro de ruido. Incoherente: generador de pulsos.',
        suggestedParts: ['AraC', 'LuxR', 'GFP reporter', 'B0034'],
        citation: 'Mangan S & Alon U. PNAS 2003;100(21):11980-5',
    },
    {
        name: 'Biosensor',
        indicators: ['sensor', 'reporter', 'detect', 'signal', 'AHL', 'quorum'],
        description: 'Sistema sensor-reporter para detección de moléculas. Componentes: receptor, promoter inducible, reporter fluorescente.',
        suggestedParts: ['LuxR receptor', 'pLux promoter', 'GFP/RFP reporter', 'B0034'],
        citation: 'Canton B et al. Nat Biotechnol 2008;26:787-793',
    },
];

// ── Suggestion Types ───────────────────────────────────────────────────

export interface CopilotSuggestion {
    type: 'fix' | 'improvement' | 'part-recommendation' | 'pattern-match' | 'anti-pattern' | 'explanation';
    severity: 'error' | 'warning' | 'info' | 'hint';
    /** Main message */
    message: string;
    /** Detailed explanation with scientific reasoning */
    explanation: string;
    /** Confidence level 0-100% */
    confidence: number;
    /** Citation for the suggestion */
    citation: string;
    /** Range in document */
    range?: vscode.Range;
    /** Suggested fix (code to insert/replace) */
    suggestedFix?: {
        label: string;
        code: string;
    };
    /** Related parts data */
    relatedParts?: PartKnowledge[];
}

// ── Scientific Copilot ─────────────────────────────────────────────────

export class ScientificCopilot implements vscode.CodeActionProvider {
    private diagnosticCollection: vscode.DiagnosticCollection;
    private outputChannel: vscode.OutputChannel;

    constructor() {
        this.diagnosticCollection = vscode.languages.createDiagnosticCollection('synbio-copilot');
        this.outputChannel = vscode.window.createOutputChannel('SynBio Scientific Copilot');
    }

    /**
     * Analyze a document and return all suggestions.
     */
    analyzeDocument(document: vscode.TextDocument): CopilotSuggestion[] {
        if (document.languageId !== 'bioscript') return [];

        const text = document.getText();
        const suggestions: CopilotSuggestion[] = [];

        // 1. Anti-pattern detection
        suggestions.push(...this.detectAntiPatterns(text, document));

        // 2. Part recommendations
        suggestions.push(...this.recommendParts(text));

        // 3. Design pattern recognition
        suggestions.push(...this.recognizePatterns(text));

        // 4. Metabolic burden estimation
        suggestions.push(...this.estimateBurden(text));

        // 5. Update diagnostics
        this.updateDiagnostics(document, suggestions);

        return suggestions;
    }

    // ── Anti-Pattern Detection ──────────────────────────────────

    private detectAntiPatterns(text: string, document: vscode.TextDocument): CopilotSuggestion[] {
        const results: CopilotSuggestion[] = [];

        for (const ap of ANTI_PATTERNS) {
            const match = ap.pattern.exec(text);
            if (match) {
                const startPos = document.positionAt(match.index);
                const endPos = document.positionAt(match.index + match[0].length);

                results.push({
                    type: 'anti-pattern',
                    severity: ap.severity,
                    message: ap.message,
                    explanation: ap.fix,
                    confidence: ap.confidence * 100,
                    citation: ap.citation,
                    range: new vscode.Range(startPos, endPos),
                });
            }
        }

        return results;
    }

    // ── Part Recommendations ────────────────────────────────────

    private recommendParts(text: string): CopilotSuggestion[] {
        const results: CopilotSuggestion[] = [];

        // Check for promoter without specific part
        if (text.includes('promoter') && !text.match(/promoter\s*:\s*\w+/)) {
            const promoters = PART_KNOWLEDGE.filter(p => p.type === 'promoter');
            results.push({
                type: 'part-recommendation',
                severity: 'hint',
                message: 'Promoter no especificado. Recomendaciones según nivel de expresión deseado:',
                explanation: promoters.map(p =>
                    `• ${p.id} (${p.name}): ${p.strength} ${p.unit} — ${p.citation}` +
                    (p.notes ? `\n  ⚠️ ${p.notes}` : '')
                ).join('\n'),
                confidence: 80,
                citation: 'Múltiples fuentes (Kelly 2009, Lutz 1997, Studier 1986)',
                relatedParts: promoters,
            });
        }

        // Check for organism-specific recommendations
        const orgMatch = text.match(/organism\s*:\s*(\w+)/);
        if (orgMatch) {
            const org = orgMatch[1].toLowerCase();
            if (org === 'yeast' || org === 'cerevisiae' || org === 'saccharomyces') {
                results.push({
                    type: 'part-recommendation',
                    severity: 'info',
                    message: 'Organismo: S. cerevisiae. Las partes estándar de E. coli (Anderson, etc.) NO funcionarán directamente.',
                    explanation: 'Usar promoters de levadura (GAL1, TDH3, TEF1) y terminadores (CYC1, ADH1). ' +
                        'La biblioteca iGEM tiene partes específicas para levadura.',
                    confidence: 95,
                    citation: 'Dueber JE et al. Nat Biotechnol 2009;27:753-759',
                });
            }
        }

        return results;
    }

    // ── Design Pattern Recognition ──────────────────────────────

    private recognizePatterns(text: string): CopilotSuggestion[] {
        const results: CopilotSuggestion[] = [];
        const textLower = text.toLowerCase();

        for (const pattern of DESIGN_PATTERNS) {
            const matchCount = pattern.indicators.filter(ind =>
                textLower.includes(ind.toLowerCase())
            ).length;

            if (matchCount >= 2) {
                results.push({
                    type: 'pattern-match',
                    severity: 'info',
                    message: `🔬 Patrón detectado: ${pattern.name}`,
                    explanation: `${pattern.description}\n\nPartes recomendadas:\n${pattern.suggestedParts.map(p => `  • ${p}`).join('\n')}`,
                    confidence: Math.min(95, matchCount * 30 + 20),
                    citation: pattern.citation,
                });
            }
        }

        return results;
    }

    // ── Metabolic Burden Estimation ─────────────────────────────

    private estimateBurden(text: string): CopilotSuggestion[] {
        const geneCount = (text.match(/gene\s+\w+/g) || []).length;
        const tuCount = (text.match(/transcription_unit\s+\w+/g) || []).length;

        if (geneCount === 0) return [];

        // Ceroni et al. 2015: ~5% growth rate reduction per heterologous gene
        const burdenPercent = geneCount * 5;
        const severity: 'error' | 'warning' | 'info' = burdenPercent > 30 ? 'error' :
            burdenPercent > 15 ? 'warning' : 'info';

        return [{
            type: 'explanation',
            severity,
            message: `📊 Carga metabólica estimada: ~${burdenPercent}% reducción en tasa de crecimiento (${geneCount} genes, ${tuCount} TUs)`,
            explanation: `Basado en Ceroni et al. 2015: cada gen heterólogo reduce la tasa de crecimiento en ~5% ` +
                `debido a competencia por ribosomas, aminoácidos y energía. ` +
                `Con ${geneCount} genes, se estima una reducción total del ~${burdenPercent}%.` +
                (burdenPercent > 20 ? '\n\n⚠️ RECOMENDACIÓN: considerar integración cromosómica, promoters más débiles, o distribución en consorcio microbiano.' : ''),
            confidence: 75,
            citation: 'Ceroni F et al. Nat Methods 2015;12(5):415-418',
        }];
    }

    // ── VS Code Integration ─────────────────────────────────────

    private updateDiagnostics(document: vscode.TextDocument, suggestions: CopilotSuggestion[]): void {
        const diags: vscode.Diagnostic[] = [];

        for (const s of suggestions) {
            if (!s.range) continue;

            const severity = s.severity === 'error' ? vscode.DiagnosticSeverity.Error :
                s.severity === 'warning' ? vscode.DiagnosticSeverity.Warning :
                    s.severity === 'info' ? vscode.DiagnosticSeverity.Information :
                        vscode.DiagnosticSeverity.Hint;

            const diag = new vscode.Diagnostic(s.range, s.message, severity);
            diag.source = `SynBio Copilot (${s.confidence}% confidence)`;
            diag.code = s.citation;
            diags.push(diag);
        }

        this.diagnosticCollection.set(document.uri, diags);
    }

    /**
     * CodeActionProvider — provides quick fixes in the editor.
     */
    provideCodeActions(
        document: vscode.TextDocument,
        range: vscode.Range,
        context: vscode.CodeActionContext,
    ): vscode.CodeAction[] {
        const actions: vscode.CodeAction[] = [];

        for (const diag of context.diagnostics) {
            if (diag.source?.startsWith('SynBio Copilot')) {
                const action = new vscode.CodeAction(
                    `🧬 Fix: ${diag.message.slice(0, 60)}...`,
                    vscode.CodeActionKind.QuickFix,
                );
                action.diagnostics = [diag];
                action.isPreferred = true;
                actions.push(action);
            }
        }

        return actions;
    }

    /**
     * Register the copilot for BioScript documents.
     */
    activate(context: vscode.ExtensionContext): void {
        // Register as CodeAction provider
        context.subscriptions.push(
            vscode.languages.registerCodeActionsProvider(
                { language: 'bioscript' },
                this,
                { providedCodeActionKinds: [vscode.CodeActionKind.QuickFix] }
            )
        );

        // Run analysis on active editor change
        context.subscriptions.push(
            vscode.window.onDidChangeActiveTextEditor(editor => {
                if (editor && editor.document.languageId === 'bioscript') {
                    this.analyzeDocument(editor.document);
                }
            })
        );

        // Run on document save
        context.subscriptions.push(
            vscode.workspace.onDidSaveTextDocument(doc => {
                if (doc.languageId === 'bioscript') {
                    this.analyzeDocument(doc);
                }
            })
        );

        // Run on content change (debounced)
        let timeout: NodeJS.Timeout | undefined;
        context.subscriptions.push(
            vscode.workspace.onDidChangeTextDocument(event => {
                if (event.document.languageId === 'bioscript') {
                    if (timeout) clearTimeout(timeout);
                    timeout = setTimeout(() => {
                        this.analyzeDocument(event.document);
                    }, 500);
                }
            })
        );

        this.outputChannel.appendLine('🧬 Scientific Copilot activated');
    }

    /**
     * Show copilot analysis for current file.
     */
    async showAnalysis(): Promise<void> {
        const editor = vscode.window.activeTextEditor;
        if (!editor || editor.document.languageId !== 'bioscript') {
            vscode.window.showWarningMessage('Abre un archivo .bio para obtener sugerencias del copiloto.');
            return;
        }

        const suggestions = this.analyzeDocument(editor.document);

        if (suggestions.length === 0) {
            vscode.window.showInformationMessage('✅ No hay sugerencias — el circuito se ve correcto.');
            return;
        }

        const lines: string[] = [
            '╔══════════════════════════════════════════════════════════════╗',
            '║       SynBio-LLVM — Scientific Copilot Analysis            ║',
            '╠══════════════════════════════════════════════════════════════╣',
            '',
            `Archivo: ${editor.document.fileName}`,
            `Sugerencias: ${suggestions.length}`,
            '',
        ];

        for (const s of suggestions) {
            const confBar = '█'.repeat(Math.round(s.confidence / 10)) + '░'.repeat(10 - Math.round(s.confidence / 10));
            const icon = s.severity === 'error' ? '❌' :
                s.severity === 'warning' ? '⚠️' :
                    s.severity === 'info' ? 'ℹ️' : '💡';
            lines.push(`${icon} [${s.type.toUpperCase()}] Confianza: ${s.confidence}% ${confBar}`);
            lines.push(`   ${s.message}`);
            lines.push(`   📖 ${s.citation}`);
            if (s.explanation) {
                lines.push(`   💬 ${s.explanation}`);
            }
            lines.push('');
        }

        const doc = await vscode.workspace.openTextDocument({
            content: lines.join('\n'),
            language: 'markdown',
        });
        await vscode.window.showTextDocument(doc, vscode.ViewColumn.Beside);
    }

    dispose(): void {
        this.diagnosticCollection.dispose();
        this.outputChannel.dispose();
    }
}
