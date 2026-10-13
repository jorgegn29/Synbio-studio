/**
 * Linter Termodinámico en Tiempo Real
 * 
 * Integra ViennaRNA con VS Code para mostrar warnings visuales
 * cuando se detectan estructuras secundarias problemáticas en RBS.
 * 
 * Actualizado con parámetros reales:
 *   - SantaLucia, J. (1998). PNAS 95(4):1460-1465 (NN termodinámica)
 *   - Salis, H.M. et al. (2009). Nat Biotechnol 27:946-950 (predicción RBS)
 */

import * as vscode from 'vscode';
import { FallbackRNAFolder } from './fallback-folder';
import { calculateHairpinDeltaG, calculateDeltaG, predictRBSStrength, calculateTm } from './real-thermodynamics';

// Decoraciones para warnings termodinámicos
const hairpinDecorationType = vscode.window.createTextEditorDecorationType({
    backgroundColor: 'rgba(255, 200, 0, 0.3)', // Amarillo translúcido
    border: '1px solid rgba(255, 180, 0, 0.6)',
    borderRadius: '2px',
    overviewRulerColor: 'rgba(255, 180, 0, 0.8)',
    overviewRulerLane: vscode.OverviewRulerLane.Right,
});

const severeHairpinDecorationType = vscode.window.createTextEditorDecorationType({
    backgroundColor: 'rgba(255, 100, 0, 0.3)', // Naranja translúcido
    border: '1px solid rgba(255, 80, 0, 0.6)',
    borderRadius: '2px',
    overviewRulerColor: 'rgba(255, 80, 0, 0.8)',
    overviewRulerLane: vscode.OverviewRulerLane.Right,
});

interface RBSLocation {
    range: vscode.Range;
    sequence: string;
    name: string;
}

interface ThermodynamicWarning {
    range: vscode.Range;
    message: string;
    severity: 'warning' | 'error';
    energy?: number;
    accessibility?: number;
}

export class ThermodynamicLinter {
    private diagnosticCollection: vscode.DiagnosticCollection;
    private folder: FallbackRNAFolder;
    private debounceTimer: NodeJS.Timeout | null = null;
    private readonly debounceDelay = 500; // ms

    constructor() {
        this.diagnosticCollection = vscode.languages.createDiagnosticCollection('bioscript-thermodynamics');
        this.folder = new FallbackRNAFolder(37); // 37°C
    }

    /**
     * Activa el linter para un documento
     */
    activate(context: vscode.ExtensionContext): void {
        // Analizar documento activo al abrir
        if (vscode.window.activeTextEditor) {
            this.analyzeDocument(vscode.window.activeTextEditor.document);
        }

        // Suscribirse a cambios de documento
        context.subscriptions.push(
            vscode.workspace.onDidChangeTextDocument(event => {
                if (event.document.languageId === 'bioscript') {
                    this.debouncedAnalyze(event.document);
                }
            }),
            vscode.window.onDidChangeActiveTextEditor(editor => {
                if (editor && editor.document.languageId === 'bioscript') {
                    this.analyzeDocument(editor.document);
                }
            }),
            vscode.workspace.onDidCloseTextDocument(document => {
                this.diagnosticCollection.delete(document.uri);
            })
        );

        // Registrar comando para análisis manual
        context.subscriptions.push(
            vscode.commands.registerCommand('synbio.analyzeThermodynamics', () => {
                if (vscode.window.activeTextEditor) {
                    this.analyzeDocument(vscode.window.activeTextEditor.document);
                    vscode.window.showInformationMessage('🧬 Análisis termodinámico completado');
                }
            })
        );

        context.subscriptions.push(this.diagnosticCollection);
    }

    /**
     * Análisis debounced para no sobrecargar con cada keystroke
     */
    private debouncedAnalyze(document: vscode.TextDocument): void {
        if (this.debounceTimer) {
            clearTimeout(this.debounceTimer);
        }
        this.debounceTimer = setTimeout(() => {
            this.analyzeDocument(document);
        }, this.debounceDelay);
    }

    /**
     * Analiza un documento BioScript buscando RBS con estructuras problemáticas
     */
    async analyzeDocument(document: vscode.TextDocument): Promise<void> {
        if (document.languageId !== 'bioscript') {
            return;
        }

        const text = document.getText();
        const rbsLocations = this.findRBSInDocument(text, document);
        const warnings: ThermodynamicWarning[] = [];
        const diagnostics: vscode.Diagnostic[] = [];

        for (const rbs of rbsLocations) {
            const analysis = await this.analyzeRBS(rbs);
            warnings.push(...analysis);

            for (const warning of analysis) {
                const diagnostic = new vscode.Diagnostic(
                    warning.range,
                    warning.message,
                    warning.severity === 'error' 
                        ? vscode.DiagnosticSeverity.Error 
                        : vscode.DiagnosticSeverity.Warning
                );
                diagnostic.source = 'SynBio Thermodynamics';
                diagnostic.code = 'THERMO_' + (warning.severity === 'error' ? 'ERR' : 'WARN');
                diagnostics.push(diagnostic);
            }
        }

        // Actualizar diagnósticos
        this.diagnosticCollection.set(document.uri, diagnostics);

        // Actualizar decoraciones visuales
        this.updateDecorations(warnings);
    }

    /**
     * Encuentra declaraciones de RBS en el documento
     */
    private findRBSInDocument(text: string, document: vscode.TextDocument): RBSLocation[] {
        const rbsLocations: RBSLocation[] = [];

        // Patrones para encontrar RBS en BioScript
        const patterns = [
            // rbs: "AGGAGG" o rbs: B0034
            /rbs\s*:\s*["']?([ACGTU]+)["']?/gi,
            // let myRBS = "AGGAGG"
            /let\s+(\w*[Rr][Bb][Ss]\w*)\s*=\s*["']([ACGTU]+)["']/gi,
            // @rbs("AGGAGG") o rbs("AGGAGG")
            /@?rbs\s*\(\s*["']([ACGTU]+)["']\s*\)/gi,
            // Secuencias Shine-Dalgarno explícitas
            /["']([ACGTU]*(?:AGGAGG|GGAGG|AGGA)[ACGTU]*)["']/gi,
        ];

        for (const pattern of patterns) {
            let match;
            while ((match = pattern.exec(text)) !== null) {
                // Extraer la secuencia (puede estar en grupo 1 o 2 según el patrón)
                const sequence = match[2] || match[1];
                if (!sequence || sequence.length < 4) continue;

                // Calcular posición
                const startPos = match.index;
                const endPos = startPos + match[0].length;
                
                const startPosition = document.positionAt(startPos);
                const endPosition = document.positionAt(endPos);
                const range = new vscode.Range(startPosition, endPosition);

                rbsLocations.push({
                    range,
                    sequence: sequence.toUpperCase().replace(/T/g, 'U'),
                    name: match[1] || 'RBS'
                });
            }
        }

        return rbsLocations;
    }

    /**
     * Analiza un RBS individual para detectar estructuras problemáticas
     */
    private async analyzeRBS(rbs: RBSLocation): Promise<ThermodynamicWarning[]> {
        const warnings: ThermodynamicWarning[] = [];
        const sequence = rbs.sequence;

        try {
            // Plegar la secuencia
            const foldResult = this.folder.fold(sequence);
            
            // Detectar horquillas
            const hairpins = this.detectHairpins(sequence, foldResult.structure);

            // Calcular accesibilidad del Shine-Dalgarno
            const sdAccessibility = this.calculateSDAccessibility(sequence, foldResult.structure);

            // Generar warnings basados en el análisis
            for (const hairpin of hairpins) {
                if (hairpin.affectsSD) {
                    warnings.push({
                        range: rbs.range,
                        message: `⚠️ Horquilla detectada en RBS (${hairpin.stemLength}bp stem, ΔG=${hairpin.energy.toFixed(1)} kcal/mol). ` +
                                 `El Shine-Dalgarno puede estar secuestrado, reduciendo eficiencia de traducción.`,
                        severity: hairpin.energy < -8 ? 'error' : 'warning',
                        energy: hairpin.energy
                    });
                }
            }

            // Warning por baja accesibilidad
            if (sdAccessibility < 0.5) {
                warnings.push({
                    range: rbs.range,
                    message: `🔴 Baja accesibilidad del RBS (${(sdAccessibility * 100).toFixed(0)}%). ` +
                             `La estructura secundaria oculta la secuencia Shine-Dalgarno. ` +
                             `Considera usar un RBS diferente o añadir un insulator.`,
                    severity: 'error',
                    accessibility: sdAccessibility
                });
            } else if (sdAccessibility < 0.7) {
                warnings.push({
                    range: rbs.range,
                    message: `🟡 Accesibilidad moderada del RBS (${(sdAccessibility * 100).toFixed(0)}%). ` +
                             `Puede haber reducción parcial de traducción.`,
                    severity: 'warning',
                    accessibility: sdAccessibility
                });
            }

            // Warning por estructura muy estable
            if (foldResult.mfe < -5) {
                warnings.push({
                    range: rbs.range,
                    message: `⚠️ Estructura secundaria estable (ΔG=${foldResult.mfe.toFixed(1)} kcal/mol). ` +
                             `Estructuras fuertes en RBS reducen eficiencia de traducción.`,
                    severity: foldResult.mfe < -10 ? 'error' : 'warning',
                    energy: foldResult.mfe
                });
            }

        } catch (error) {
            console.error('Error analizando RBS:', error);
        }

        return warnings;
    }

    /**
     * Detecta horquillas en la estructura
     */
    private detectHairpins(sequence: string, structure: string): Array<{
        start: number;
        end: number;
        stemLength: number;
        loopLength: number;
        energy: number;
        affectsSD: boolean;
    }> {
        const hairpins: Array<{
            start: number;
            end: number;
            stemLength: number;
            loopLength: number;
            energy: number;
            affectsSD: boolean;
        }> = [];

        // Buscar patrones de hairpin: (((...))):
        const hairpinPattern = /\(+\.+\)+/g;
        let match;

        while ((match = hairpinPattern.exec(structure)) !== null) {
            const start = match.index;
            const end = start + match[0].length;
            const stemLength = (match[0].match(/\(/g) || []).length;
            const loopLength = (match[0].match(/\./g) || []).length;

            // Estimar energía
            const energy = this.estimateHairpinEnergy(stemLength, loopLength);

            // Verificar si afecta al Shine-Dalgarno
            const sdPatterns = ['AGGAGG', 'GGAGG', 'AGGAG', 'AGGA'];
            let affectsSD = false;

            for (const sd of sdPatterns) {
                const sdPos = sequence.indexOf(sd);
                if (sdPos !== -1) {
                    // El hairpin afecta al SD si lo solapa
                    if ((start <= sdPos && end >= sdPos) ||
                        (start <= sdPos + sd.length && end >= sdPos + sd.length)) {
                        affectsSD = true;
                        break;
                    }
                }
            }

            hairpins.push({
                start,
                end,
                stemLength,
                loopLength,
                energy,
                affectsSD
            });
        }

        return hairpins;
    }

    /**
     * Estima la energía de un hairpin usando parámetros reales
     * SantaLucia & Hicks (2004) Annu. Rev. Biophys. Biomol. Struct. 33:415-440
     */
    private estimateHairpinEnergy(stemLength: number, loopLength: number): number {
        // Usar la función real de cálculo de hairpin ΔG
        // Generamos una secuencia stem aproximada para el cálculo NN
        const basePairs = 'GCGCGCGCGCGCGC'.substring(0, stemLength * 2);
        try {
            return calculateHairpinDeltaG(basePairs, loopLength, 310.15); // 37°C
        } catch {
            // Fallback con parámetros reales simplificados
            // Loop initiation: Jacobson-Stockmayer (SantaLucia & Hicks 2004, Table 4)
            const loopInitiation: Record<number, number> = {
                3: 5.4, 4: 5.6, 5: 5.7, 6: 5.4, 7: 5.6,
                8: 5.5, 9: 6.4, 10: 6.5, 12: 6.8, 14: 7.2,
                16: 7.4, 18: 7.6, 20: 7.8, 25: 8.2, 30: 8.5,
            };
            const closestLoop = Object.keys(loopInitiation)
                .map(Number)
                .reduce((prev, curr) => Math.abs(curr - loopLength) < Math.abs(prev - loopLength) ? curr : prev);
            const loopPenalty = loopInitiation[closestLoop] || 5.4 + 1.75 * 1.987 * 310.15 / 1000 * Math.log(loopLength / 6);
            // Stem energy: promedio NN ≈ -1.7 kcal/mol por par (datos SantaLucia 1998)
            const stemEnergy = stemLength * -1.7;
            return stemEnergy + loopPenalty;
        }
    }

    /**
     * Calcula la accesibilidad del Shine-Dalgarno
     */
    private calculateSDAccessibility(sequence: string, structure: string): number {
        const sdPatterns = ['AGGAGG', 'GGAGG', 'AGGAG', 'AGGA', 'GAGG'];

        for (const sd of sdPatterns) {
            const sdPos = sequence.indexOf(sd);
            if (sdPos !== -1) {
                // Contar nucleótidos no apareados en la región SD
                let unpairedCount = 0;
                for (let i = sdPos; i < sdPos + sd.length && i < structure.length; i++) {
                    if (structure[i] === '.') {
                        unpairedCount++;
                    }
                }
                return unpairedCount / sd.length;
            }
        }

        // Si no hay SD reconocible, calcular accesibilidad general
        const unpaired = structure.split('').filter(c => c === '.').length;
        return unpaired / structure.length;
    }

    /**
     * Actualiza las decoraciones visuales en el editor
     */
    private updateDecorations(warnings: ThermodynamicWarning[]): void {
        const editor = vscode.window.activeTextEditor;
        if (!editor) return;

        const warningDecorations: vscode.DecorationOptions[] = [];
        const errorDecorations: vscode.DecorationOptions[] = [];

        for (const warning of warnings) {
            const decoration: vscode.DecorationOptions = {
                range: warning.range,
                hoverMessage: new vscode.MarkdownString(warning.message)
            };

            if (warning.severity === 'error') {
                errorDecorations.push(decoration);
            } else {
                warningDecorations.push(decoration);
            }
        }

        editor.setDecorations(hairpinDecorationType, warningDecorations);
        editor.setDecorations(severeHairpinDecorationType, errorDecorations);
    }

    /**
     * Limpieza
     */
    dispose(): void {
        this.diagnosticCollection.dispose();
        if (this.debounceTimer) {
            clearTimeout(this.debounceTimer);
        }
    }
}
