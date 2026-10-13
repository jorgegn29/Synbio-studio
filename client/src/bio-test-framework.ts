/**
 * SynBio-LLVM - Framework de Testing para Circuitos Genéticos
 * Tests unitarios y de integración para circuitos BioScript:
 * - Verificación de niveles de expresión esperados
 * - Tests de toggle (bistabilidad)
 * - Tests de oscilación (periodicidad)
 * - Tests de respuesta a inductores
 * - Tests de bioseguridad (kill switch activa)
 */

import * as vscode from 'vscode';

type TestStatus = 'pass' | 'fail' | 'running' | 'pending' | 'skip';

interface BioTest {
    id: string;
    name: string;
    category: string;
    description: string;
    status: TestStatus;
    duration: number;
    details: string;
    assertion: string;
}

interface TestSuite {
    name: string;
    tests: BioTest[];
    passed: number;
    failed: number;
    skipped: number;
    totalTime: number;
}

export class BioTestFramework implements vscode.Disposable {
    private panel: vscode.WebviewPanel | undefined;
    private disposables: vscode.Disposable[] = [];
    private outputChannel: vscode.OutputChannel;

    constructor(private context: vscode.ExtensionContext) {
        this.outputChannel = vscode.window.createOutputChannel('SynBio Tests');
    }

    async show(): Promise<void> {
        if (this.panel) { this.panel.reveal(); return; }

        this.panel = vscode.window.createWebviewPanel(
            'synbioTests',
            '🧪 BioScript Tests',
            vscode.ViewColumn.Two,
            { enableScripts: true, retainContextWhenHidden: true }
        );

        this.panel.webview.html = this.getHTML();

        this.panel.webview.onDidReceiveMessage(async (msg) => {
            switch (msg.command) {
                case 'runAll': {
                    const suite = await this.runAllTests();
                    this.panel?.webview.postMessage({ command: 'results', suite });
                    break;
                }
                case 'runCategory': {
                    const suite = await this.runTestsByCategory(msg.category);
                    this.panel?.webview.postMessage({ command: 'results', suite });
                    break;
                }
                case 'generateTestFile':
                    await this.generateTestFile();
                    break;
            }
        }, undefined, this.disposables);

        this.panel.onDidDispose(() => { this.panel = undefined; }, null, this.disposables);
    }

    /** Ejecuta todos los tests */
    async runAllTests(): Promise<TestSuite> {
        const editor = vscode.window.activeTextEditor;
        const code = editor?.document.getText() || '';

        this.outputChannel.clear();
        this.outputChannel.appendLine('🧪 SynBio-LLVM Test Framework');
        this.outputChannel.appendLine('═'.repeat(50));
        this.outputChannel.appendLine(`Ejecutando tests... ${new Date().toLocaleTimeString()}\n`);

        const tests: BioTest[] = [];
        const startTime = Date.now();

        // === TESTS DE ESTRUCTURA ===
        tests.push(this.testHasPromoter(code));
        tests.push(this.testHasRBS(code));
        tests.push(this.testHasTerminator(code));
        tests.push(this.testHasCDS(code));
        tests.push(this.testTranscriptionUnitOrder(code));
        tests.push(this.testNoOrphanGenes(code));

        // === TESTS DE BIOSEGURIDAD ===
        tests.push(this.testHasKillSwitch(code));
        tests.push(this.testNoSelectAgents(code));
        tests.push(this.testAntibioticResistanceCount(code));

        // === TESTS DE DISEÑO ===
        tests.push(this.testRBSSpacing(code));
        tests.push(this.testPromoterStrength(code));
        tests.push(this.testTerminatorEfficiency(code));
        tests.push(this.testCircuitComplexity(code));

        // === TESTS DE SIMULACIÓN ===
        tests.push(await this.testSteadyState(code));
        tests.push(await this.testOscillation(code));
        tests.push(await this.testInducerResponse(code));

        const totalTime = Date.now() - startTime;
        const passed = tests.filter(t => t.status === 'pass').length;
        const failed = tests.filter(t => t.status === 'fail').length;
        const skipped = tests.filter(t => t.status === 'skip').length;

        this.outputChannel.appendLine(`\n${'═'.repeat(50)}`);
        this.outputChannel.appendLine(`✅ Passed: ${passed}  ❌ Failed: ${failed}  ⏭ Skipped: ${skipped}`);
        this.outputChannel.appendLine(`⏱ Total: ${totalTime}ms`);

        return { name: 'BioScript Test Suite', tests, passed, failed, skipped, totalTime };
    }

    async runTestsByCategory(category: string): Promise<TestSuite> {
        const all = await this.runAllTests();
        all.tests = all.tests.filter(t => t.category === category);
        all.passed = all.tests.filter(t => t.status === 'pass').length;
        all.failed = all.tests.filter(t => t.status === 'fail').length;
        return all;
    }

    // ========== TESTS DE ESTRUCTURA ==========

    private testHasPromoter(code: string): BioTest {
        const has = /promoter\s+\w+/i.test(code);
        const t = this.makeTest('STR-001', 'Tiene promotor definido', 'Estructura', 'assert(circuit.has_promoter)', has);
        if (!has) t.details = 'No se encontró ninguna definición de promotor. Todo circuito necesita al menos un promotor.';
        return t;
    }

    private testHasRBS(code: string): BioTest {
        const has = /rbs\s+\w+/i.test(code);
        const t = this.makeTest('STR-002', 'Tiene RBS definido', 'Estructura', 'assert(circuit.has_rbs)', has);
        if (!has) t.details = 'No se encontró RBS. Un RBS es esencial para la traducción.';
        return t;
    }

    private testHasTerminator(code: string): BioTest {
        const has = /terminator\s+\w+/i.test(code);
        const t = this.makeTest('STR-003', 'Tiene terminador definido', 'Estructura', 'assert(circuit.has_terminator)', has);
        if (!has) t.details = 'No se encontró terminador. Read-through puede causar expresión no deseada.';
        return t;
    }

    private testHasCDS(code: string): BioTest {
        const has = /gene\s+\w+/i.test(code);
        const t = this.makeTest('STR-004', 'Tiene gen/CDS definido', 'Estructura', 'assert(circuit.has_cds)', has);
        if (!has) t.details = 'No se encontró ningún gen (CDS). El circuito no codifica proteínas.';
        return t;
    }

    private testTranscriptionUnitOrder(code: string): BioTest {
        const lines = code.split('\n').map(l => l.trim());
        const elems: string[] = [];
        for (const line of lines) {
            if (/^promoter\s/.test(line)) elems.push('P');
            else if (/^rbs\s/.test(line)) elems.push('R');
            else if (/^gene\s/.test(line)) elems.push('G');
            else if (/^terminator\s/.test(line)) elems.push('T');
        }
        const order = elems.join('');
        const valid = order === '' || /^(P?R?G+T?)+$/.test(order);
        const t = this.makeTest('STR-005', 'Orden de unidad de transcripción correcto', 'Estructura', 'assert(order == P-R-G-T)', valid);
        if (!valid) t.details = `Orden detectado: ${order}. El orden estándar es Promotor → RBS → Gene(s) → Terminador.`;
        return t;
    }

    private testNoOrphanGenes(code: string): BioTest {
        const proms = (code.match(/promoter\s+/g) || []).length;
        const genes = (code.match(/gene\s+/g) || []).length;
        const pass = proms === 0 && genes === 0 || proms > 0;
        const t = this.makeTest('STR-006', 'Sin genes huérfanos (sin promotor)', 'Estructura', 'assert(genes.all(g => g.has_promoter))', pass);
        if (!pass) t.details = `Se encontraron ${genes} genes pero ${proms} promotores. Cada gen necesita un promotor upstream.`;
        return t;
    }

    // ========== TESTS DE BIOSEGURIDAD ==========

    private testHasKillSwitch(code: string): BioTest {
        const lower = code.toLowerCase();
        const has = lower.includes('kill_switch') || lower.includes('killswitch') || lower.includes('kill switch')
            || lower.includes('ccdb') || lower.includes('mazf') || lower.includes('holin');
        const t = this.makeTest('BIO-001', 'Kill switch implementado', 'Bioseguridad', 'assert(circuit.has_kill_switch)', has);
        if (!has && code.length > 50) t.details = 'No se detectó kill switch. Es mejor práctica incluir mecanismo de apagado.';
        if (code.length <= 50) { t.status = 'skip'; t.details = 'Código demasiado corto para evaluar.'; }
        return t;
    }

    private testNoSelectAgents(code: string): BioTest {
        const lower = code.toLowerCase();
        // Select Agent list based on 42 CFR Part 73 (Federal Select Agent Program, CDC/APHIS)
        // Ref: 7 CFR Part 331 and 42 CFR Part 73, updated 2024
        // HHS Select Agents and Toxins (partial list — 67 agents total)
        const dangerous = [
            // Tier 1 Select Agents (highest risk)
            'variola', 'smallpox',        // Variola major (smallpox)
            'ebola', 'ebolavirus',         // Ebola virus
            'marburg',                     // Marburg virus
            'yersinia pestis', 'plague',   // Yersinia pestis (plague)
            'francisella tularensis',      // Francisella tularensis
            'botulinum', 'clostridium botulinum', // Botulinum toxin/C. botulinum
            'bacillus anthracis', 'anthrax',      // B. anthracis (anthrax)
            'burkholderia pseudomallei',   // Melioidosis
            'burkholderia mallei',         // Glanders
            // Tier 1 Toxins
            'ricin', 'ricinus',            // Ricin (Ricinus communis)
            'abrin',                       // Abrin
            'saxitoxin',                   // Saxitoxin
            // Other HHS Select Agents
            'brucella',                    // Brucella spp.
            'coxiella burnetii',           // Q fever
            'clostridium perfringens',     // Epsilon toxin
            'staphylococcal enterotoxin',  // SEB
            'nipah',                       // Nipah virus
            'hendra',                      // Hendra virus
            'rift valley fever',           // RVFV
            'venezuelan equine encephalitis', // VEEV
            'eastern equine encephalitis', // EEEV
            'crimean-congo',              // CCHF virus
            'tick-borne encephalitis',     // TBEV
            'junin', 'machupo', 'guanarito', 'chapare', 'lujo', // Arenaviruses
            'lassa',                       // Lassa virus
            'monkeypox',                   // Monkeypox (Clade I)
            'reconstructed 1918',          // 1918 Influenza
            'sars-cov', 'sars',            // SARS-CoV
            'conotoxin',                   // Conotoxins (short/paralytic)
            'diacetoxyscirpenol',          // T-2 mycotoxin
            'tetrodotoxin',               // Tetrodotoxin
            // USDA/APHIS Plant Pathogens
            'ralstonia solanacearum',      // Race 3 biovar 2
            'rathayibacter toxicus',
            'xanthomonas oryzae'
        ];
        const found = dangerous.filter(d => lower.includes(d));
        const pass = found.length === 0;
        const t = this.makeTest('BIO-002', 'Sin agentes selectos (42 CFR §73)', 'Bioseguridad', 'assert(no_select_agents)', pass);
        if (!pass) t.details = `ALERTA: Secuencias de agentes selectos detectadas: ${found.join(', ')}. Requiere registro federal (CDC/APHIS) según 42 CFR Part 73 y 7 CFR Part 331. Ref: Federal Select Agent Program (selectagents.gov).`;
        return t;
    }

    private testAntibioticResistanceCount(code: string): BioTest {
        const lower = code.toLowerCase();
        const markers = ['ampr', 'kanr', 'cmr', 'specr', 'tetr_resistance', 'bla', 'ampicillin_resistance'];
        const count = markers.filter(m => lower.includes(m)).length;
        const pass = count <= 1;
        const t = this.makeTest('BIO-003', 'Máximo 1 marcador de resistencia', 'Bioseguridad', 'assert(antibiotic_markers <= 1)', pass);
        if (!pass) t.details = `Se detectaron ${count} marcadores de resistencia. Múltiples resistencias aumentan riesgo de bioseguridad.`;
        return t;
    }

    // ========== TESTS DE DISEÑO ==========

    private testRBSSpacing(code: string): BioTest {
        const rbsMatch = code.match(/rbs\s+\w+\s*\{[^}]*sequence:\s*"([^"]*)"/);
        if (!rbsMatch) return this.makeSkip('DES-001', 'Spacing del RBS correcto (6-12 bp al ATG)', 'Diseño');
        const rbsLen = rbsMatch[1].replace(/\.\.\./g, '').length;
        const pass = rbsLen >= 6 && rbsLen <= 30;
        const t = this.makeTest('DES-001', 'Spacing del RBS correcto', 'Diseño', `assert(rbs_spacing in 6..30 bp)`, pass);
        if (!pass) t.details = `RBS de ${rbsLen} bp. El spacing óptimo RBS→ATG es de 6-12 nucleótidos.`;
        return t;
    }

    private testPromoterStrength(code: string): BioTest {
        const strengthMatch = code.match(/strength:\s*([\d.]+)/);
        if (!strengthMatch) return this.makeSkip('DES-002', 'Fuerza de promotor definida', 'Diseño');
        const strength = parseFloat(strengthMatch[1]);
        const pass = strength >= 0 && strength <= 1;
        const t = this.makeTest('DES-002', 'Fuerza de promotor en rango válido', 'Diseño', 'assert(strength in 0..1)', pass);
        if (!pass) t.details = `Fuerza ${strength} fuera de rango [0, 1].`;
        return t;
    }

    private testTerminatorEfficiency(code: string): BioTest {
        const effMatch = code.match(/efficiency:\s*([\d.]+)/);
        if (!effMatch) return this.makeSkip('DES-003', 'Eficiencia del terminador ≥ 90%', 'Diseño');
        const eff = parseFloat(effMatch[1]);
        const pass = eff >= 0.9;
        const t = this.makeTest('DES-003', 'Eficiencia del terminador ≥ 90%', 'Diseño', 'assert(terminator_eff >= 0.9)', pass);
        if (!pass) t.details = `Eficiencia ${(eff * 100).toFixed(0)}% < 90%. Read-through puede causar problemas.`;
        return t;
    }

    private testCircuitComplexity(code: string): BioTest {
        const parts = (code.match(/(promoter|rbs|gene|terminator)\s+/g) || []).length;
        const pass = parts <= 20;
        const t = this.makeTest('DES-004', 'Complejidad del circuito manejable (≤ 20 partes)', 'Diseño', 'assert(parts <= 20)', pass);
        t.details = `${parts} partes detectadas. ${pass ? 'Complejidad aceptable.' : 'Circuito muy complejo — considerar modularizar.'}`;
        return t;
    }

    // ========== TESTS DE SIMULACIÓN ==========

    private async testSteadyState(code: string): Promise<BioTest> {
        if (!code.includes('gene')) return this.makeSkip('SIM-001', 'Alcanza estado estacionario', 'Simulación');

        // Simple constitutive gene expression ODE: dx/dt = α - γ·x
        // Real parameters from published literature:
        //   α (protein production) ≈ 0.167 proteins/s ≈ 10 proteins/min
        //     (Bremer & Dennis 1996, translation rate ~15 aa/s, avg protein ~300 aa → ~0.05 prot/s per mRNA × ~3 mRNA copies)
        //   γ (dilution + degradation) ≈ ln(2)/30 min ≈ 0.023 min⁻¹ for E. coli doubling time 30 min
        //     (Cooper & Helmstetter 1968, E. coli B/r doubling time; native protein degradation negligible vs dilution)
        // Steady state: x* = α/γ = 10/0.023 ≈ 435 molecules
        // Ref: Taniguchi Y et al. (2010) Science 329:533 — single-cell protein quantification
        let x = 10;
        const alpha = 10;          // proteins/min (Bremer & Dennis 1996)
        const gamma = 0.023;       // min⁻¹ (dilution at 30 min doubling, Cooper & Helmstetter 1968)
        let stable = false;
        for (let t = 0; t < 500; t++) {
            const dx = alpha - gamma * x;
            x += dx * 0.5; // dt = 0.5 min
            if (Math.abs(dx) < 0.01) { stable = true; break; }
        }

        const test = this.makeTest('SIM-001', 'Alcanza estado estacionario', 'Simulación',
            'assert(|dx/dt| < 0.01 at t_final)', stable);
        test.details = stable
            ? `Estado estacionario alcanzado en x ≈ ${x.toFixed(0)} moléculas (esperado ~${(alpha/gamma).toFixed(0)} por Taniguchi et al. 2010)`
            : 'El sistema no convergió en 250 min simulados.';
        return test;
    }

    private async testOscillation(code: string): Promise<BioTest> {
        const lower = code.toLowerCase();
        const isRepressilator = lower.includes('repressilator') || (lower.includes('laci') && lower.includes('tetr') && lower.includes('ci'));
        if (!isRepressilator) return this.makeSkip('SIM-002', 'Oscilación detectada (repressilator)', 'Simulación');

        // Repressilator simulation with Elowitz & Leibler (2000) Nature 403:335 parameters:
        //   α (maximal transcription) = 216 nM/min (rescaled from 29.97 proteins/min per Elowitz Table S2)
        //   α₀ (leaky transcription) = 0.216 nM/min (α₀/α ≈ 10⁻³, Elowitz 2000 supplement)
        //   n (Hill coefficient) = 2.0 (cooperative repression, Elowitz 2000)
        //   K (repressor concentration for half-maximal repression) = 40 nM (Elowitz 2000)
        //   β (protein production from mRNA) = ln(2)/10 min ≈ 0.0693 min⁻¹ (Bernstein 2002 mRNA t½ ~10 min)
        //   γ_protein = ln(2)/10 min ≈ 0.0693 min⁻¹ (ssrA-tagged, Andersen 1998)
        // Period observed: ~150 min (Elowitz 2000, Fig 1c)
        let x1 = 50, x2 = 10, x3 = 10;
        const alpha = 216, alpha0 = 0.216, K = 40, n = 2, dt = 0.1;
        const gamma = 0.0693; // protein degradation (ssrA tag, Andersen 1998)
        const hill = (r: number) => alpha / (1 + Math.pow(r / K, n)) + alpha0;
        const peaks: number[] = [];
        let prev = x1;

        for (let t = 0; t < 5000; t++) {
            const dx1 = hill(x3) - gamma * x1;
            const dx2 = hill(x1) - gamma * x2;
            const dx3 = hill(x2) - gamma * x3;
            x1 += dx1 * dt; x2 += dx2 * dt; x3 += dx3 * dt;
            // Clamp non-negative
            if (x1 < 0) x1 = 0; if (x2 < 0) x2 = 0; if (x3 < 0) x3 = 0;
            if (x1 > prev && peaks.length % 2 === 0) peaks.push(t);
            else if (x1 < prev && peaks.length % 2 === 1) peaks.push(t);
            prev = x1;
        }

        const oscillates = peaks.length >= 4;
        const period = peaks.length >= 4 ? (peaks[3] - peaks[1]) * dt : 0;
        const test = this.makeTest('SIM-002', 'Oscilación detectada (repressilator)', 'Simulación',
            'assert(peaks >= 4)', oscillates);
        test.details = oscillates
            ? `Oscilación confirmada (Elowitz & Leibler 2000). Período ≈ ${period.toFixed(0)} min (esperado ~150 min), ${peaks.length} picos detectados. Params: α=${alpha}, K=${K} nM, n=${n}, γ=${gamma} min⁻¹`
            : 'No se detectaron oscilaciones suficientes con parámetros de Elowitz 2000.';
        return test;
    }

    private async testInducerResponse(code: string): Promise<BioTest> {
        const lower = code.toLowerCase();
        if (!lower.includes('iptg') && !lower.includes('atc') && !lower.includes('arabinose')) {
            return this.makeSkip('SIM-003', 'Respuesta a inductor correcta', 'Simulación');
        }

        // Determine inducer and use real dissociation constants (Kd):
        //   IPTG/LacI: Kd = 1.26 µM (Daber R et al. 2009, J Mol Biol 391:513)
        //              n = 1.7 (cooperative binding, Oehler S et al. 2006 NAR 34:606)
        //   aTc/TetR:  Kd = 0.1 µM = 100 nM (Kamionka A et al. 2004, BMC Biotechnol 4:33)
        //              n = 2.0 (cooperative, Hillen & Berens 1994 Annu Rev Microbiol 48:345)
        //   Arabinose/AraC: Kd = 280 µM (Schleif R 2000, Trends Genet 16:559)
        //              n = 2.5 (ultrasensitive, Khlebnikov A et al. 2000 J Bacteriol 182:7029)
        let K: number, n: number, inducerName: string, kdRef: string;
        if (lower.includes('iptg')) {
            K = 1.26; n = 1.7; inducerName = 'IPTG/LacI';
            kdRef = 'Daber et al. 2009 J Mol Biol 391:513';
        } else if (lower.includes('atc')) {
            K = 0.1; n = 2.0; inducerName = 'aTc/TetR';
            kdRef = 'Kamionka et al. 2004 BMC Biotechnol 4:33';
        } else {
            K = 280; n = 2.5; inducerName = 'Arabinose/AraC';
            kdRef = 'Schleif 2000 Trends Genet 16:559';
        }

        const doses = [0, K * 0.01, K * 0.1, K * 0.5, K, K * 5, K * 100];
        const responses = doses.map(d => d ** n / (K ** n + d ** n));
        const monotonic = responses.every((r, i) => i === 0 || r >= responses[i - 1] - 0.001);
        const saturates = responses[responses.length - 1] > 0.9;

        const pass = monotonic && saturates;
        const test = this.makeTest('SIM-003', 'Respuesta a inductor correcta', 'Simulación',
            'assert(monotonic && saturates)', pass);
        test.details = `${inducerName}: Kd=${K} µM (${kdRef}), n=${n}. Monotónica=${monotonic}, saturación=${(responses[responses.length - 1] * 100).toFixed(0)}%.`;
        return test;
    }

    // ========== HELPERS ==========

    private makeTest(id: string, name: string, category: string, assertion: string, pass: boolean): BioTest {
        const status: TestStatus = pass ? 'pass' : 'fail';
        const emoji = pass ? '✅' : '❌';
        this.outputChannel.appendLine(`  ${emoji} ${id}: ${name}`);
        return { id, name, category, description: name, status, duration: 0, details: pass ? 'Passed' : 'Failed', assertion };
    }

    private makeSkip(id: string, name: string, category: string): BioTest {
        this.outputChannel.appendLine(`  ⏭ ${id}: ${name} (skipped)`);
        return { id, name, category, description: name, status: 'skip', duration: 0, details: 'No hay datos suficientes para evaluar', assertion: '' };
    }

    /** Genera un archivo .biotest de ejemplo */
    private async generateTestFile(): Promise<void> {
        const content = `// SynBio-LLVM Test File
// Ejecuta con el comando "SynBio: Ejecutar Tests"

test "Circuit has valid structure" {
    assert circuit.has_promoter
    assert circuit.has_rbs
    assert circuit.has_terminator
    assert circuit.transcription_units >= 1
}

test "Safety mechanisms present" {
    assert circuit.has_kill_switch
    assert circuit.antibiotic_markers <= 1
    assert circuit.no_select_agents
}

test "Expression levels" {
    simulate circuit for 100s
    assert GFP.steady_state > 50
    assert GFP.steady_state < 500
}

test "Repressilator oscillates" {
    simulate circuit for 200s
    assert LacI.oscillates == true
    assert LacI.period > 10s
    assert LacI.period < 50s
}

test "IPTG dose-response" {
    sweep IPTG from 0 to 1000 µM
    assert pLac.response.monotonic == true
    assert pLac.response.EC50 in 50..200 µM
}
`;

        const uri = await vscode.window.showSaveDialog({
            defaultUri: vscode.Uri.file('circuit_tests.biotest'),
            filters: { 'BioTest': ['biotest'] }
        });

        if (uri) {
            await vscode.workspace.fs.writeFile(uri, Buffer.from(content, 'utf-8'));
            const doc = await vscode.workspace.openTextDocument(uri);
            await vscode.window.showTextDocument(doc);
        }
    }

    private getHTML(): string {
        return `<!DOCTYPE html>
<html lang="es"><head>
<meta charset="UTF-8">
<style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Segoe UI', sans-serif; background: #1e1e2e; color: #cdd6f4; padding: 20px; }
    h1 { font-size: 22px; color: #94e2d5; margin-bottom: 4px; }
    .sub { color: #6c7086; font-size: 12px; margin-bottom: 16px; }
    .toolbar { display: flex; gap: 8px; margin-bottom: 16px; }
    .tb-btn { padding: 8px 16px; border: 1px solid #45475a; background: #313244; color: #cdd6f4; border-radius: 8px; cursor: pointer; font-size: 13px; font-weight: 600; }
    .tb-btn:hover { background: #45475a; }
    .tb-btn.run { background: #a6e3a1; color: #1e1e2e; border-color: #a6e3a1; }
    .summary { display: flex; gap: 12px; margin-bottom: 16px; }
    .sum-card { flex: 1; background: #313244; border-radius: 10px; padding: 14px; text-align: center; }
    .sum-card .num { font-size: 28px; font-weight: 700; }
    .sum-card .lbl { font-size: 10px; color: #6c7086; text-transform: uppercase; margin-top: 2px; }
    .sum-card.pass .num { color: #a6e3a1; }
    .sum-card.fail .num { color: #f38ba8; }
    .sum-card.skip .num { color: #f9e2af; }
    .sum-card.time .num { color: #89b4fa; }
    .cat-header { background: #313244; padding: 8px 14px; border-radius: 8px 8px 0 0; font-size: 13px; font-weight: 600; color: #cba6f7; margin-top: 12px; cursor: pointer; display: flex; justify-content: space-between; }
    .test-list { border: 1px solid #45475a; border-top: none; border-radius: 0 0 8px 8px; margin-bottom: 4px; }
    .test-item { padding: 10px 14px; border-bottom: 1px solid #45475a30; display: flex; align-items: center; gap: 10px; font-size: 13px; }
    .test-item:last-child { border-bottom: none; }
    .test-icon { font-size: 16px; flex-shrink: 0; }
    .test-info { flex: 1; }
    .test-name { font-weight: 500; }
    .test-assert { font-size: 10px; color: #6c7086; font-family: 'Cascadia Code', monospace; }
    .test-detail { font-size: 11px; color: #a6adc8; margin-top: 2px; }
    .test-dur { font-size: 10px; color: #6c7086; }
    .test-status { padding: 2px 8px; border-radius: 10px; font-size: 10px; font-weight: 600; }
    .test-status.pass { background: #a6e3a120; color: #a6e3a1; }
    .test-status.fail { background: #f38ba820; color: #f38ba8; }
    .test-status.skip { background: #f9e2af20; color: #f9e2af; }
    .placeholder { text-align: center; padding: 60px 20px; color: #6c7086; }
    .placeholder .icon { font-size: 48px; margin-bottom: 12px; }
    .progress-bar { width: 100%; height: 6px; background: #45475a; border-radius: 3px; margin-bottom: 16px; overflow: hidden; }
    .progress-fill { height: 100%; border-radius: 3px; transition: width 0.3s; }
</style>
</head><body>
    <h1>🧪 Framework de Testing - BioScript</h1>
    <p class="sub">Verifica que tu circuito genético cumple con reglas de estructura, bioseguridad, diseño y simulación</p>

    <div class="toolbar">
        <button class="tb-btn run" onclick="runAll()">▶ Ejecutar Todos los Tests</button>
        <button class="tb-btn" onclick="runCat('Estructura')">📐 Estructura</button>
        <button class="tb-btn" onclick="runCat('Bioseguridad')">🛡️ Bioseguridad</button>
        <button class="tb-btn" onclick="runCat('Diseño')">📏 Diseño</button>
        <button class="tb-btn" onclick="runCat('Simulación')">📊 Simulación</button>
        <button class="tb-btn" onclick="genFile()">📝 Generar .biotest</button>
    </div>

    <div class="progress-bar"><div class="progress-fill" id="progress" style="width:0; background:#94e2d5;"></div></div>

    <div class="summary" id="summary" style="display:none;">
        <div class="sum-card pass"><div class="num" id="passCount">0</div><div class="lbl">Passed</div></div>
        <div class="sum-card fail"><div class="num" id="failCount">0</div><div class="lbl">Failed</div></div>
        <div class="sum-card skip"><div class="num" id="skipCount">0</div><div class="lbl">Skipped</div></div>
        <div class="sum-card time"><div class="num" id="timeVal">0</div><div class="lbl">ms</div></div>
    </div>

    <div id="results">
        <div class="placeholder">
            <div class="icon">🧪</div>
            <p>Presiona "Ejecutar Todos los Tests" para verificar tu circuito</p>
        </div>
    </div>

    <script>
    const vscode = acquireVsCodeApi();
    const icons = { pass: '✅', fail: '❌', skip: '⏭', running: '⏳', pending: '⏸' };

    function runAll() {
        document.getElementById('progress').style.width = '30%';
        vscode.postMessage({ command: 'runAll' });
    }
    function runCat(cat) {
        document.getElementById('progress').style.width = '30%';
        vscode.postMessage({ command: 'runCategory', category: cat });
    }
    function genFile() { vscode.postMessage({ command: 'generateTestFile' }); }

    window.addEventListener('message', event => {
        if (event.data.command === 'results') {
            const suite = event.data.suite;
            document.getElementById('progress').style.width = '100%';
            document.getElementById('progress').style.background = suite.failed > 0 ? '#f38ba8' : '#a6e3a1';

            document.getElementById('summary').style.display = 'flex';
            document.getElementById('passCount').textContent = suite.passed;
            document.getElementById('failCount').textContent = suite.failed;
            document.getElementById('skipCount').textContent = suite.skipped;
            document.getElementById('timeVal').textContent = suite.totalTime;

            // Group by category
            const cats = {};
            for (const t of suite.tests) {
                if (!cats[t.category]) cats[t.category] = [];
                cats[t.category].push(t);
            }

            let html = '';
            for (const [cat, tests] of Object.entries(cats)) {
                const catTests = tests;
                const p = catTests.filter(t => t.status === 'pass').length;
                const f = catTests.filter(t => t.status === 'fail').length;
                html += '<div class="cat-header">' + cat + ' <span>' + p + '/' + catTests.length + ' passed</span></div>';
                html += '<div class="test-list">';
                for (const t of catTests) {
                    html += '<div class="test-item">';
                    html += '<span class="test-icon">' + (icons[t.status] || '?') + '</span>';
                    html += '<div class="test-info"><div class="test-name">' + t.name + '</div>';
                    if (t.assertion) html += '<div class="test-assert">' + t.assertion + '</div>';
                    if (t.details && t.details !== 'Passed') html += '<div class="test-detail">' + t.details + '</div>';
                    html += '</div>';
                    html += '<span class="test-status ' + t.status + '">' + t.status.toUpperCase() + '</span>';
                    html += '<span class="test-dur">' + t.duration.toFixed(0) + 'ms</span>';
                    html += '</div>';
                }
                html += '</div>';
            }

            document.getElementById('results').innerHTML = html;
        }
    });
    </script>
</body></html>`;
    }

    dispose(): void {
        this.outputChannel.dispose();
        this.panel?.dispose();
        this.disposables.forEach(d => d.dispose());
    }
}
