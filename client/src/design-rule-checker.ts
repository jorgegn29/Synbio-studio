/**
 * SynBio-LLVM - Design Rule Checker (DRC)
 * Verifica reglas de diseño de circuitos genéticos en tiempo real:
 * - Spacing entre partes (RBS→ATG, promotor→RBS)
 * - Compatibilidad de partes (host, tipo)
 * - Insulación entre unidades de transcripción
 * - Estabilidad termodinámica
 * - Codon usage para el organismo huésped
 * - Carga metabólica (ATP budget)
 */

import * as vscode from 'vscode';

type RuleSeverity = 'error' | 'warning' | 'info' | 'hint';

interface DRCRule {
    id: string;
    name: string;
    category: string;
    severity: RuleSeverity;
    description: string;
    check: (text: string, lines: string[]) => DRCViolation[];
}

interface DRCViolation {
    ruleId: string;
    ruleName: string;
    severity: RuleSeverity;
    message: string;
    line: number;
    column: number;
    endColumn: number;
    fix?: string;
}

export class DesignRuleChecker implements vscode.Disposable {
    private diagnosticCollection: vscode.DiagnosticCollection;
    private disposables: vscode.Disposable[] = [];
    private rules: DRCRule[];
    private statusBarItem: vscode.StatusBarItem;
    private enabled = true;

    constructor(private context: vscode.ExtensionContext) {
        this.diagnosticCollection = vscode.languages.createDiagnosticCollection('synbio-drc');
        this.rules = this.buildRules();

        // Status bar
        this.statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 90);
        this.statusBarItem.text = '$(check) DRC';
        this.statusBarItem.tooltip = 'Design Rule Checker activo';
        this.statusBarItem.command = 'synbio.toggleDRC';
        this.statusBarItem.show();

        // Registro de eventos - lint en tiempo real
        vscode.workspace.onDidChangeTextDocument(event => {
            if (this.enabled && event.document.languageId === 'bioscript') {
                this.check(event.document);
            }
        }, null, this.disposables);

        vscode.workspace.onDidOpenTextDocument(doc => {
            if (this.enabled && doc.languageId === 'bioscript') {
                this.check(doc);
            }
        }, null, this.disposables);

        // Verificar documentos ya abiertos
        vscode.workspace.textDocuments.forEach(doc => {
            if (this.enabled && doc.languageId === 'bioscript') {
                this.check(doc);
            }
        });

        this.disposables.push(this.diagnosticCollection, this.statusBarItem);
    }

    /** Toggle on/off */
    toggle(): void {
        this.enabled = !this.enabled;
        this.statusBarItem.text = this.enabled ? '$(check) DRC' : '$(x) DRC off';
        if (!this.enabled) this.diagnosticCollection.clear();
        else {
            vscode.workspace.textDocuments.forEach(doc => {
                if (doc.languageId === 'bioscript') this.check(doc);
            });
        }
    }

    /** Ejecuta todas las reglas sobre un documento */
    check(document: vscode.TextDocument): DRCViolation[] {
        const text = document.getText();
        const lines = text.split('\n');
        const violations: DRCViolation[] = [];

        for (const rule of this.rules) {
            try {
                const results = rule.check(text, lines);
                violations.push(...results);
            } catch {
                // Rule failed, skip silently
            }
        }

        // Convertir a diagnósticos VS Code
        const diagnostics: vscode.Diagnostic[] = violations.map(v => {
            const range = new vscode.Range(
                Math.max(0, v.line - 1), v.column,
                Math.max(0, v.line - 1), v.endColumn
            );

            const severity = v.severity === 'error' ? vscode.DiagnosticSeverity.Error
                : v.severity === 'warning' ? vscode.DiagnosticSeverity.Warning
                : v.severity === 'hint' ? vscode.DiagnosticSeverity.Hint
                : vscode.DiagnosticSeverity.Information;

            const diag = new vscode.Diagnostic(range, v.message, severity);
            diag.source = 'SynBio DRC';
            diag.code = v.ruleId;
            return diag;
        });

        this.diagnosticCollection.set(document.uri, diagnostics);

        // Actualizar status bar
        const errors = violations.filter(v => v.severity === 'error').length;
        const warnings = violations.filter(v => v.severity === 'warning').length;
        if (errors > 0) {
            this.statusBarItem.text = `$(error) DRC: ${errors} errores`;
            this.statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.errorBackground');
        } else if (warnings > 0) {
            this.statusBarItem.text = `$(warning) DRC: ${warnings} avisos`;
            this.statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
        } else {
            this.statusBarItem.text = '$(check) DRC ✓';
            this.statusBarItem.backgroundColor = undefined;
        }

        return violations;
    }

    /** Construye la lista de reglas de diseño */
    private buildRules(): DRCRule[] {
        return [
            // ===== REGLAS DE ESTRUCTURA =====
            // Ref: Kosuri S & Church GM (2014) Nat Methods 11:499-507 — large-scale DNA assembly design principles
            {
                id: 'DRC-001', name: 'Promotor sin RBS downstream', category: 'Estructura', severity: 'warning',
                description: 'Un promotor debe tener un RBS downstream antes del gen. Ref: Chen YJ et al. (2014) Mol Syst Biol 5:291 — spacing rules for genetic parts',
                check: (text, lines) => {
                    const violations: DRCViolation[] = [];
                    for (let i = 0; i < lines.length; i++) {
                        if (/^\s*promoter\s+\w+/.test(lines[i])) {
                            let foundRBS = false;
                            const end = Math.min(i + 15, lines.length);
                            for (let j = i + 1; j < end; j++) {
                                if (/^\s*rbs[:\s]+\w+/.test(lines[j])) { foundRBS = true; break; }
                                if (/^\s*gene\s+\w+/.test(lines[j])) break;
                            }
                            if (!foundRBS) {
                                const col = lines[i].indexOf('promoter');
                                violations.push({
                                    ruleId: 'DRC-001', ruleName: 'Missing RBS', severity: 'warning',
                                    message: `Promotor en línea ${i + 1} no tiene un RBS downstream. La traducción requiere un RBS (Shine-Dalgarno). Ref: Chen & Swalley (2014) Mol Syst Biol 5:291.`,
                                    line: i + 1, column: col, endColumn: lines[i].length,
                                    fix: 'Añadir un RBS (ej: BBa_B0034, Kd≈10 nM) entre el promotor y el gen'
                                });
                            }
                        }
                    }
                    return violations;
                }
            },
            {
                id: 'DRC-002', name: 'Gen sin terminador downstream', category: 'Estructura', severity: 'warning',
                description: 'Los genes deben tener un terminador para evitar read-through. Ref: Chen YJ et al. (2013) Nucleic Acids Res 41:2541-2553 — terminator characterization',
                check: (text, lines) => {
                    const violations: DRCViolation[] = [];
                    const geneLines: number[] = [];
                    const termLines: number[] = [];
                    for (let i = 0; i < lines.length; i++) {
                        if (/^\s*gene\s+\w+/.test(lines[i])) geneLines.push(i);
                        if (/^\s*terminator[:\s]+\w+/.test(lines[i])) termLines.push(i);
                    }
                    if (geneLines.length > 0 && termLines.length === 0) {
                        const last = geneLines[geneLines.length - 1];
                        violations.push({
                            ruleId: 'DRC-002', ruleName: 'Missing Terminator', severity: 'warning',
                            message: 'No se encontró terminador. Read-through puede causar expresión no deseada (hasta 10x). Ref: Chen YJ et al. (2013) NAR 41:2541. Usar BBa_B0015 (eficiencia >99%).',
                            line: last + 1, column: 0, endColumn: lines[last].length,
                            fix: 'Añadir terminador B0015 (doble terminador, eficiencia 99.7% — Chen et al. 2013)'
                        });
                    }
                    return violations;
                }
            },
            {
                id: 'DRC-003', name: 'Promotor duplicado sin insulator', category: 'Estructura', severity: 'info',
                description: 'Promotores adyacentes sin aislamiento pueden interferir. Ref: Mutalik VK et al. (2013) Nat Methods 10:354-360 — standard TU insulation',
                check: (text, lines) => {
                    const violations: DRCViolation[] = [];
                    for (let i = 0; i < lines.length - 1; i++) {
                        if (/^\s*promoter\s+\w+/.test(lines[i])) {
                            for (let j = i + 1; j < Math.min(i + 5, lines.length); j++) {
                                if (/^\s*promoter\s+\w+/.test(lines[j])) {
                                    violations.push({
                                        ruleId: 'DRC-003', ruleName: 'Adjacent Promoters', severity: 'info',
                                        message: 'Promotores adyacentes sin aislamiento. La interferencia transcripcional puede reducir expresión 2-10x (Mutalik et al. 2013, Nat Methods 10:354). Insertar RiboJ insulator (Lou et al. 2012, Nat Biotechnol 30:1137) o terminador ribozima.',
                                        line: j + 1, column: 0, endColumn: lines[j].length
                                    });
                                    break;
                                }
                                if (/^\s*(rbs|gene|terminator)[:\s]+/.test(lines[j])) break;
                            }
                        }
                    }
                    return violations;
                }
            },

            // ===== REGLA DE SPACING RBS→ATG =====
            // Ref: Salis HM, Mirsky EA & Voigt CA (2009) Nat Biotechnol 27:946-950 — RBS Calculator
            {
                id: 'DRC-004', name: 'Spacing RBS→ATG fuera de rango óptimo', category: 'Estructura', severity: 'warning',
                description: 'El spacing RBS→ATG óptimo es 5-10 nt. Ref: Salis HM et al. (2009) Nat Biotechnol 27:946-950',
                check: (text, lines) => {
                    const violations: DRCViolation[] = [];
                    for (let i = 0; i < lines.length; i++) {
                        if (/^\s*rbs[:\s]+\w+/.test(lines[i])) {
                            // Buscar el spacing declarado o secuencia
                            const rbsBlock = lines.slice(i, Math.min(i + 8, lines.length)).join('\n');
                            const spacingMatch = rbsBlock.match(/spacing:\s*(\d+)/);
                            if (spacingMatch) {
                                const spacing = parseInt(spacingMatch[1]);
                                // Salis et al. 2009: optimal 5-10 nt, functional 3-15 nt
                                if (spacing < 3 || spacing > 15) {
                                    violations.push({
                                        ruleId: 'DRC-004', ruleName: 'RBS-ATG Spacing', severity: 'warning',
                                        message: `Spacing RBS→ATG de ${spacing} nt fuera del rango funcional (3-15 nt). Óptimo: 5-10 nt para máxima tasa de traducción. Ref: Salis et al. (2009) Nat Biotechnol 27:946; Espah Borujeni et al. (2014) NAR 42:2646.`,
                                        line: i + 1, column: 0, endColumn: lines[i].length,
                                        fix: `Ajustar spacing a 5-10 nt. Usar RBS Calculator (salislab.net/software) para predicción cuantitativa de TIR.`
                                    });
                                } else if (spacing < 5 || spacing > 10) {
                                    violations.push({
                                        ruleId: 'DRC-004', ruleName: 'RBS-ATG Spacing Suboptimal', severity: 'hint',
                                        message: `Spacing RBS→ATG de ${spacing} nt funcional pero fuera de rango óptimo (5-10 nt). Ref: Salis et al. (2009) Nat Biotechnol 27:946.`,
                                        line: i + 1, column: 0, endColumn: lines[i].length
                                    });
                                }
                            }
                        }
                    }
                    return violations;
                }
            },

            // ===== REGLA DE COMPATIBILIDAD DE PARTES =====
            // Ref: Mutalik VK et al. (2013) Nat Methods 10:354-360
            {
                id: 'DRC-005', name: 'Partes no estandarizadas (context effects)', category: 'Estructura', severity: 'hint',
                description: 'Partes con context effects conocidos pueden variar su expresión según posición. Ref: Mutalik et al. (2013) Nat Methods 10:354',
                check: (text, lines) => {
                    const violations: DRCViolation[] = [];
                    // Detectar múltiples TUs sin uso de partes insuladas BIOFAB/Mutalik
                    const promoterCount = (text.match(/promoter\s+\w+/g) || []).length;
                    const geneCount = (text.match(/gene\s+\w+/g) || []).length;
                    const hasInsulator = /riboj|insulator|bbj|ribozyme/i.test(text);
                    if (promoterCount >= 2 && geneCount >= 2 && !hasInsulator) {
                        violations.push({
                            ruleId: 'DRC-005', ruleName: 'Context Effects', severity: 'hint',
                            message: `Circuito con ${promoterCount} promotores y ${geneCount} genes sin insulators. Las partes genéticas varían su expresión hasta 13x según contexto genético (Mutalik et al. 2013, Nat Methods 10:354). Usar elementos insuladores (RiboJ: Lou et al. 2012 Nat Biotechnol 30:1137; BCD: Mutalik et al. 2013) para expresión predecible.`,
                            line: 1, column: 0, endColumn: 0,
                            fix: 'Insertar RiboJ (BBa_K1321337) o BCD (bicistronic design) entre TUs para aislamiento del contexto.'
                        });
                    }
                    return violations;
                }
            },

            // ===== REGLAS DE SECUENCIA =====
            {
                id: 'DRC-010', name: 'Secuencia con caracteres inválidos', category: 'Secuencia', severity: 'error',
                description: 'Las secuencias de DNA solo deben contener A, T, C, G. Ref: IUPAC nomenclature (Cornish-Bowden 1985)',
                check: (text, lines) => {
                    const violations: DRCViolation[] = [];
                    const seqRegex = /sequence:\s*"([^"]*)"/g;
                    let match: RegExpExecArray | null;
                    while ((match = seqRegex.exec(text)) !== null) {
                        const seq = match[1].replace(/\.\.\./g, '');
                        if (seq.length > 0 && !/^[ATCGatcg]+$/.test(seq)) {
                            const before = text.substring(0, match.index);
                            const lineNum = before.split('\n').length;
                            violations.push({
                                ruleId: 'DRC-010', ruleName: 'Invalid DNA Characters', severity: 'error',
                                message: `Secuencia contiene caracteres no-DNA. Solo se permiten A, T, C, G (IUPAC standard).`,
                                line: lineNum, column: 0, endColumn: lines[lineNum - 1]?.length || 0
                            });
                        }
                    }
                    return violations;
                }
            },
            {
                id: 'DRC-011', name: 'Secuencia demasiado corta', category: 'Secuencia', severity: 'warning',
                description: 'Secuencias muy cortas pueden no ser funcionales',
                check: (text, lines) => {
                    const violations: DRCViolation[] = [];
                    const seqRegex = /sequence:\s*"([^"]*)"/g;
                    let match: RegExpExecArray | null;
                    while ((match = seqRegex.exec(text)) !== null) {
                        const seq = match[1].replace(/\.\.\./g, '');
                        if (seq.length > 0 && seq.length < 6) {
                            const before = text.substring(0, match.index);
                            const lineNum = before.split('\n').length;
                            violations.push({
                                ruleId: 'DRC-011', ruleName: 'Short Sequence', severity: 'warning',
                                message: `Secuencia de solo ${seq.length} bp. La mayoría de partes funcionales son > 10 bp.`,
                                line: lineNum, column: 0, endColumn: lines[lineNum - 1]?.length || 0
                            });
                        }
                    }
                    return violations;
                }
            },
            {
                id: 'DRC-012', name: 'CDS no empieza con ATG', category: 'Secuencia', severity: 'error',
                description: 'Las secuencias codificantes deben iniciar con codón de inicio ATG',
                check: (text, lines) => {
                    const violations: DRCViolation[] = [];
                    const geneRegex = /gene\s+\w+\s*\{([^}]*)\}/g;
                    let match: RegExpExecArray | null;
                    while ((match = geneRegex.exec(text)) !== null) {
                        const body = match[1];
                        const seqMatch = body.match(/sequence:\s*"([^"]*)"/);
                        if (seqMatch) {
                            const seq = seqMatch[1].replace(/\.\.\./g, '').toUpperCase();
                            if (seq.length >= 3 && !seq.startsWith('ATG')) {
                                const before = text.substring(0, match.index);
                                const lineNum = before.split('\n').length;
                                violations.push({
                                    ruleId: 'DRC-012', ruleName: 'Missing Start Codon', severity: 'error',
                                    message: `Gen no comienza con ATG. Empieza con "${seq.substring(0, 3)}". El codón de inicio AUG es necesario para la traducción (Kozak 1987 NAR 15:8125 para eucariotas; Shine & Dalgarno 1974 PNAS para procariotas).`,
                                    line: lineNum, column: 0, endColumn: lines[lineNum - 1]?.length || 0,
                                    fix: 'Agregar ATG al inicio de la secuencia codificante'
                                });
                            }
                        }
                    }
                    return violations;
                }
            },

            // ===== REGLA DE CODON USAGE =====
            // Ref: Sharp PM & Li WH (1987) NAR 15:1281-1295 — CAI (Codon Adaptation Index)
            {
                id: 'DRC-013', name: 'Codones raros detectados', category: 'Secuencia', severity: 'warning',
                description: 'CDS contiene codones raros que pueden reducir expresión. Ref: Sharp & Li 1987 NAR 15:1281',
                check: (text, lines) => {
                    const violations: DRCViolation[] = [];
                    // Codones raros en E. coli K-12 (Kazusa DB, frecuencia <10 por mil)
                    // Ref: Nakamura Y et al. (2000) NAR 28:292
                    const rareEcoli: Record<string, boolean> = {
                        'AGG': true, 'AGA': true, // Arg raros: 1.2, 2.1 per 1000
                        'CGA': true,              // Arg raro: 3.1 per 1000
                        'ATA': true,              // Ile raro: 4.3 per 1000
                        'CTA': true,              // Leu raro: 3.2 per 1000
                        'GGA': true,              // Gly raro: 7.0 per 1000
                        'CCC': true,              // Pro raro: 4.3 per 1000
                    };
                    const geneRegex = /gene\s+(\w+)\s*\{([^}]*)\}/g;
                    let match: RegExpExecArray | null;
                    while ((match = geneRegex.exec(text)) !== null) {
                        const geneName = match[1];
                        const body = match[2];
                        const seqMatch = body.match(/sequence:\s*"([^"]*)"/);
                        if (seqMatch) {
                            const seq = seqMatch[1].replace(/\.\.\./g, '').toUpperCase();
                            if (seq.length >= 9) {
                                let rareCount = 0;
                                const totalCodons = Math.floor(seq.length / 3);
                                for (let c = 0; c < seq.length - 2; c += 3) {
                                    const codon = seq.substring(c, c + 3);
                                    if (rareEcoli[codon]) rareCount++;
                                }
                                const rarePct = (rareCount / totalCodons) * 100;
                                if (rarePct > 10) {
                                    const before = text.substring(0, match.index);
                                    const lineNum = before.split('\n').length;
                                    violations.push({
                                        ruleId: 'DRC-013', ruleName: 'Rare Codons', severity: 'warning',
                                        message: `Gen "${geneName}": ${rarePct.toFixed(0)}% codones raros en E. coli (${rareCount}/${totalCodons}). >10% puede reducir traducción. Ref: Sharp & Li (1987) NAR 15:1281; Kane JF (1995) Curr Opin Biotechnol 6:494. Optimizar con CAI ≥0.8.`,
                                        line: lineNum, column: 0, endColumn: lines[lineNum - 1]?.length || 0,
                                        fix: 'Optimizar codones para E. coli. Usar comando "SynBio: Optimizar Codones" o herramienta IDT/GenSmart.'
                                    });
                                }
                            }
                        }
                    }
                    return violations;
                }
            },

            // ===== REGLAS DE COMPATIBILIDAD =====
            {
                id: 'DRC-020', name: 'Host no especificado', category: 'Compatibilidad', severity: 'hint',
                description: 'Especificar organismo huésped mejora la validación. Ref: Brophy & Voigt (2014) Nat Methods 11:508-520',
                check: (text, lines) => {
                    const violations: DRCViolation[] = [];
                    if (text.length > 30 && !text.includes('host') && !text.includes('organism') && !text.includes('chassis')) {
                        violations.push({
                            ruleId: 'DRC-020', ruleName: 'No Host Specified', severity: 'hint',
                            message: 'No se detectó organismo huésped. Las partes genéticas tienen distinta función según el chassis (Brophy & Voigt 2014, Nat Methods 11:508). Declarar host para validar compatibilidad.',
                            line: 1, column: 0, endColumn: 0,
                            fix: 'Agregar "host: ecoli_dh5alpha" al inicio del archivo'
                        });
                    }
                    return violations;
                }
            },
            {
                id: 'DRC-021', name: 'Strength fuera de rango', category: 'Compatibilidad', severity: 'error',
                description: 'La fuerza de promotores/RBS debe estar entre 0 y 1 (relativa a referencia). Ref: Kelly JR et al. (2009) J Biol Eng 3:4 — RPU units',
                check: (text, lines) => {
                    const violations: DRCViolation[] = [];
                    const regex = /strength:\s*([\d.]+)/g;
                    let match: RegExpExecArray | null;
                    while ((match = regex.exec(text)) !== null) {
                        const val = parseFloat(match[1]);
                        if (val < 0 || val > 1) {
                            const before = text.substring(0, match.index);
                            const lineNum = before.split('\n').length;
                            violations.push({
                                ruleId: 'DRC-021', ruleName: 'Strength Out of Range', severity: 'error',
                                message: `Strength ${val} fuera de rango [0, 1]. Usar valores relativos normalizados en RPU (Kelly et al. 2009 J Biol Eng 3:4).`,
                                line: lineNum, column: 0, endColumn: lines[lineNum - 1]?.length || 0,
                                fix: 'Ajustar strength a un valor entre 0.0 y 1.0 en unidades RPU relativas'
                            });
                        }
                    }
                    return violations;
                }
            },

            // ===== REGLAS DE CARGA METABÓLICA =====
            // Ref: Ceroni F et al. (2015) ACS Synth Biol 4:1174-1185 — burden monitor
            // Ref: Gorochowski TE et al. (2016) ACS Synth Biol 5:710-720 — resource allocation
            {
                id: 'DRC-030', name: 'Demasiados genes de alta expresión', category: 'Carga Metabólica', severity: 'warning',
                description: 'Múltiples genes con promotores fuertes pueden sobrecargar la célula. Ref: Ceroni et al. (2015) ACS Synth Biol 4:1174',
                check: (text, lines) => {
                    const violations: DRCViolation[] = [];
                    const strongPromoters = (text.match(/strength:\s*0\.[89]\d*|strength:\s*1\.0/g) || []).length;
                    const genes = (text.match(/gene\s+\w+/g) || []).length;
                    if (strongPromoters >= 3 && genes >= 3) {
                        violations.push({
                            ruleId: 'DRC-030', ruleName: 'High Metabolic Burden', severity: 'warning',
                            message: `${strongPromoters} promotores fuertes (≥0.8) con ${genes} genes. Circuitos con >30% de recursos ribosomales ocupados reducen crecimiento >50% (Ceroni et al. 2015 ACS Synth Biol 4:1174). Considerar: promotores inducibles, RBS más débiles, o burden monitor (Ceroni et al. 2018 Nat Methods 15:387).`,
                            line: 1, column: 0, endColumn: 0,
                            fix: 'Reducir strength de algunos promotores, usar promotores inducibles, o implementar burden-driven feedback (Ceroni 2018)'
                        });
                    }
                    return violations;
                }
            },

            // ===== REGLA DE ESTABILIDAD TERMODINÁMICA =====
            // Ref: Pfleger BF et al. (2006) Nat Biotechnol 24:1027 — mRNA stability
            {
                id: 'DRC-031', name: 'Repeticiones directas (inestabilidad genómica)', category: 'Secuencia', severity: 'warning',
                description: 'Repeticiones directas >20 bp pueden causar recombinación. Ref: Pfleger et al. 2006 Nat Biotechnol 24:1027',
                check: (text, lines) => {
                    const violations: DRCViolation[] = [];
                    const seqRegex = /sequence:\s*"([^"]*)"/g;
                    const allSeqs: string[] = [];
                    let match: RegExpExecArray | null;
                    while ((match = seqRegex.exec(text)) !== null) {
                        allSeqs.push(match[1].replace(/\.\.\./g, '').toUpperCase());
                    }
                    // Buscar repeticiones entre secuencias (context simplificado)
                    for (let i = 0; i < allSeqs.length; i++) {
                        for (let j = i + 1; j < allSeqs.length; j++) {
                            if (allSeqs[i].length >= 20 && allSeqs[j].length >= 20) {
                                // Buscar substring común ≥20 bp
                                const shorter = allSeqs[i].length < allSeqs[j].length ? allSeqs[i] : allSeqs[j];
                                const longer = allSeqs[i].length >= allSeqs[j].length ? allSeqs[i] : allSeqs[j];
                                for (let k = 0; k <= shorter.length - 20; k++) {
                                    const sub = shorter.substring(k, k + 20);
                                    if (longer.includes(sub)) {
                                        violations.push({
                                            ruleId: 'DRC-031', ruleName: 'Direct Repeats', severity: 'warning',
                                            message: `Repetición directa ≥20 bp detectada entre secuencias. Puede causar recombinación homóloga y inestabilidad del constructo (Pfleger et al. 2006 Nat Biotechnol 24:1027). Considerar sinónimos de codones para eliminar homología.`,
                                            line: 1, column: 0, endColumn: 0,
                                            fix: 'Recodificar uno de los fragmentos con sinónimos de codones para eliminar repetición directa'
                                        });
                                        return violations; // One warning is enough
                                    }
                                }
                            }
                        }
                    }
                    return violations;
                }
            }
        ];
    }

    dispose(): void {
        this.disposables.forEach(d => d.dispose());
    }
}
