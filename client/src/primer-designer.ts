/**
 * ══════════════════════════════════════════════════════════════════════════════
 * Primer Designer — Gibson Assembly & Golden Gate Automatic Primer Design
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * Generates PCR primers for the two most important cloning methods in SynBio:
 *
 *   1. Gibson Assembly — 20-40bp overlapping primers, Tm ~60°C
 *   2. Golden Gate — BsaI/BpiI restriction sites with 4bp overhangs
 *
 * Thermodynamic calculations use the SantaLucia Nearest-Neighbor model (1998)
 * with unified parameters for DNA/DNA duplexes.
 *
 * References:
 *   - SantaLucia J. (1998) PNAS 95:1460-1465
 *   - Gibson et al. (2009) Nature Methods 6:343-345
 *   - Engler et al. (2008) PLoS ONE 3:e3647 (Golden Gate)
 *   - NEB Tm Calculator: https://tmcalculator.neb.com/
 * ══════════════════════════════════════════════════════════════════════════════
 */

import * as vscode from 'vscode';

// ════════════════════════════════════════════════════════════════════════════
// THERMODYNAMIC PARAMETERS — SantaLucia 1998 Unified NN
// ════════════════════════════════════════════════════════════════════════════

/**
 * Nearest-neighbor enthalpy (ΔH°) in kcal/mol and entropy (ΔS°) in cal/mol·K
 * SantaLucia 1998, Table 2
 */
const NN_PARAMS: Record<string, { dH: number; dS: number }> = {
    'AA': { dH: -7.9, dS: -22.2 },  // AA/TT
    'AT': { dH: -7.2, dS: -20.4 },  // AT/TA
    'TA': { dH: -7.2, dS: -21.3 },  // TA/AT
    'CA': { dH: -8.5, dS: -22.7 },  // CA/GT
    'GT': { dH: -8.4, dS: -22.4 },  // GT/CA
    'CT': { dH: -7.8, dS: -21.0 },  // CT/GA
    'GA': { dH: -8.2, dS: -22.2 },  // GA/CT
    'CG': { dH: -10.6, dS: -27.2 }, // CG/GC
    'GC': { dH: -9.8, dS: -24.4 },  // GC/CG
    'GG': { dH: -8.0, dS: -19.9 },  // GG/CC
    'TT': { dH: -7.9, dS: -22.2 },  // same as AA
    'TG': { dH: -8.5, dS: -22.7 },  // same as CA (complement)
    'AC': { dH: -8.4, dS: -22.4 },  // same as GT
    'AG': { dH: -7.8, dS: -21.0 },  // same as CT
    'TC': { dH: -8.2, dS: -22.2 },  // same as GA
    'CC': { dH: -8.0, dS: -19.9 },  // same as GG
};

// Initiation parameters
const INIT_GC = { dH: 0.1, dS: -2.8 };   // G/C terminal bp
const INIT_AT = { dH: 2.3, dS: 4.1 };    // A/T terminal bp

// Constants
const R = 1.987;           // Gas constant (cal/mol·K)
const DEFAULT_PRIMER_CONC = 250;  // nM (primer concentration)
const DEFAULT_NA_CONC = 50;       // mM (Na+ concentration)

// ════════════════════════════════════════════════════════════════════════════
// RESTRICTION ENZYME SITES
// ════════════════════════════════════════════════════════════════════════════

const ENZYMES: Record<string, { site: string; cut: string; overhang: number; name: string }> = {
    'BsaI':  { site: 'GGTCTC', cut: 'GGTCTC(1/5)', overhang: 4, name: 'BsaI (NEB R0535)' },
    'BpiI':  { site: 'GAAGAC', cut: 'GAAGAC(2/6)', overhang: 4, name: 'BpiI / BbsI (NEB R0539)' },
    'BsmBI': { site: 'CGTCTC', cut: 'CGTCTC(1/5)', overhang: 4, name: 'BsmBI (NEB R0580)' },
    'SapI':  { site: 'GCTCTTC', cut: 'GCTCTTC(1/4)', overhang: 3, name: 'SapI (NEB R0569)' },
};

// Standard Golden Gate overhangs for MoClo/Type IIS assembly
const STANDARD_OVERHANGS: Record<string, { fwd: string; rev: string; description: string }> = {
    'promoter':   { fwd: 'GGAG', rev: 'AATG', description: 'Promoter part (A-B)' },
    'rbs':        { fwd: 'AATG', rev: 'AAGC', description: 'RBS part (B-C)' },
    'cds':        { fwd: 'AAGC', rev: 'GCTT', description: 'CDS part (C-D)' },
    'terminator': { fwd: 'GCTT', rev: 'CGCT', description: 'Terminator part (D-E)' },
    'tu':         { fwd: 'GGAG', rev: 'CGCT', description: 'Full TU (A-E)' },
};

// ════════════════════════════════════════════════════════════════════════════
// INTERFACES
// ════════════════════════════════════════════════════════════════════════════

interface Primer {
    name: string;
    sequence: string;
    bindingRegion: string;
    overlapRegion: string;
    tm: number;
    tmBinding: number;
    length: number;
    gcPercent: number;
    hairpinRisk: boolean;
    dimerRisk: boolean;
}

interface PrimerPair {
    forward: Primer;
    reverse: Primer;
    product: {
        length: number;
        gcPercent: number;
    };
    method: 'gibson' | 'golden_gate';
    fragment: string;
}

// ════════════════════════════════════════════════════════════════════════════
// THERMODYNAMIC CALCULATIONS
// ════════════════════════════════════════════════════════════════════════════

function reverseComplement(seq: string): string {
    const complement: Record<string, string> = { A: 'T', T: 'A', C: 'G', G: 'C', N: 'N' };
    return seq.split('').reverse().map(c => complement[c.toUpperCase()] || 'N').join('');
}

function gcContent(seq: string): number {
    const gc = (seq.match(/[GC]/gi) || []).length;
    return gc / seq.length;
}

/**
 * Calculate Tm using SantaLucia Nearest-Neighbor method
 *
 * Tm = (ΔH° / (ΔS° + R·ln(Ct/4))) - 273.15
 *
 * With salt correction (Owczarzy et al. 2004):
 * Tm_corrected = 1 / (1/Tm + (4.29·f(GC) - 3.95)·1e-5·ln[Na+] + 9.40e-6·(ln[Na+])²)
 */
function calculateTm(
    seq: string,
    primerConc: number = DEFAULT_PRIMER_CONC,
    naConc: number = DEFAULT_NA_CONC
): number {
    seq = seq.toUpperCase().replace(/[^ATCG]/g, '');
    if (seq.length < 6) { return 0; }

    // For very short sequences, use basic formula
    if (seq.length < 14) {
        const gc = (seq.match(/[GC]/g) || []).length;
        const at = (seq.match(/[AT]/g) || []).length;
        return 2 * at + 4 * gc;
    }

    let dH = 0;
    let dS = 0;

    // Sum nearest-neighbor parameters
    for (let i = 0; i < seq.length - 1; i++) {
        const dinuc = seq.substring(i, i + 2);
        const params = NN_PARAMS[dinuc];
        if (params) {
            dH += params.dH;
            dS += params.dS;
        }
    }

    // Initiation parameters
    const firstBase = seq[0];
    const lastBase = seq[seq.length - 1];
    dH += (firstBase === 'G' || firstBase === 'C') ? INIT_GC.dH : INIT_AT.dH;
    dS += (firstBase === 'G' || firstBase === 'C') ? INIT_GC.dS : INIT_AT.dS;
    dH += (lastBase === 'G' || lastBase === 'C') ? INIT_GC.dH : INIT_AT.dH;
    dS += (lastBase === 'G' || lastBase === 'C') ? INIT_GC.dS : INIT_AT.dS;

    // Convert units: dH in kcal/mol → cal/mol
    const dH_cal = dH * 1000;

    // Ct = primer concentration in M (Ct/4 for non-self-complementary)
    const Ct = (primerConc * 1e-9) / 4;

    // Basic Tm
    let tm = dH_cal / (dS + R * Math.log(Ct)) - 273.15;

    // Salt correction (Owczarzy et al. 2004, simplified)
    const naM = naConc * 1e-3;
    const fGC = gcContent(seq);
    const lnNa = Math.log(naM);
    const invTm = 1 / (tm + 273.15);
    const corrected = 1 / (invTm + (4.29 * fGC - 3.95) * 1e-5 * lnNa + 9.40e-6 * lnNa * lnNa);
    tm = corrected - 273.15;

    return Math.round(tm * 10) / 10;
}

/**
 * Check for self-complementary hairpin risk
 * Simple heuristic: look for 4+ bp palindromes within the primer
 */
function checkHairpin(seq: string): boolean {
    seq = seq.toUpperCase();
    for (let i = 0; i < seq.length - 7; i++) {
        for (let len = 4; len <= Math.min(8, seq.length - i); len++) {
            const segment = seq.substring(i, i + len);
            const rc = reverseComplement(segment);
            const restOfSeq = seq.substring(i + len + 3); // at least 3nt loop
            if (restOfSeq.includes(rc)) {
                return true;
            }
        }
    }
    return false;
}

/**
 * Check for primer-dimer risk between two sequences
 */
function checkDimer(seq1: string, seq2: string): boolean {
    seq1 = seq1.toUpperCase();
    seq2 = seq2.toUpperCase();
    const rc2 = reverseComplement(seq2);

    // Check 3' end complementarity (most dangerous)
    const end1 = seq1.substring(seq1.length - 6);
    for (let i = 0; i <= rc2.length - 6; i++) {
        if (rc2.substring(i, i + 6) === end1) {
            return true;
        }
    }
    return false;
}

// ════════════════════════════════════════════════════════════════════════════
// PRIMER DESIGNER CLASS
// ════════════════════════════════════════════════════════════════════════════

export class PrimerDesigner implements vscode.Disposable {
    private outputChannel: vscode.OutputChannel;
    private disposables: vscode.Disposable[] = [];

    constructor(private context: vscode.ExtensionContext) {
        this.outputChannel = vscode.window.createOutputChannel('SynBio Primers');
    }

    activate(): void {
        this.disposables.push(
            vscode.commands.registerCommand('synbio.designPrimers', () => this.designPrimersUI()),
            vscode.commands.registerCommand('synbio.calculateTm', () => this.calculateTmUI()),
        );
        this.context.subscriptions.push(...this.disposables);
    }

    /**
     * Design optimal binding region for target Tm
     */
    private designBindingRegion(
        seq: string,
        startPos: number,
        direction: 'forward' | 'reverse',
        targetTm: number = 60,
        minLen: number = 18,
        maxLen: number = 30,
    ): { region: string; tm: number; length: number } {
        const cleanSeq = seq.toUpperCase().replace(/[^ATCGN]/g, '');
        let bestRegion = '';
        let bestTm = 0;
        let bestDiff = Infinity;

        for (let len = minLen; len <= maxLen; len++) {
            let region: string;
            if (direction === 'forward') {
                region = cleanSeq.substring(startPos, startPos + len);
            } else {
                region = reverseComplement(cleanSeq.substring(startPos - len + 1, startPos + 1));
            }

            if (region.length < len) { break; }

            const tm = calculateTm(region);
            const diff = Math.abs(tm - targetTm);

            if (diff < bestDiff) {
                bestDiff = diff;
                bestRegion = region;
                bestTm = tm;
            }

            // If we've passed the target and are moving away, stop
            if (tm > targetTm + 5) { break; }
        }

        return { region: bestRegion, tm: bestTm, length: bestRegion.length };
    }

    /**
     * Design Gibson Assembly primers for joining fragments
     */
    designGibsonPrimers(
        fragments: { name: string; sequence: string }[],
        overlapLength: number = 25,
        targetTm: number = 60,
    ): PrimerPair[] {
        const results: PrimerPair[] = [];

        for (let i = 0; i < fragments.length; i++) {
            const frag = fragments[i];
            const cleanSeq = frag.sequence.toUpperCase().replace(/[^ATCG]/g, '');

            // Forward primer
            const nextFrag = i > 0 ? fragments[i - 1] : fragments[fragments.length - 1];
            const nextSeq = nextFrag.sequence.toUpperCase().replace(/[^ATCG]/g, '');

            // Overlap comes from the END of the previous fragment
            const fwdOverlap = nextSeq.substring(nextSeq.length - overlapLength);
            const fwdBinding = this.designBindingRegion(cleanSeq, 0, 'forward', targetTm);
            const fwdSeq = fwdOverlap + fwdBinding.region;

            const fwdPrimer: Primer = {
                name: `${frag.name}_Fwd_Gibson`,
                sequence: fwdSeq,
                bindingRegion: fwdBinding.region,
                overlapRegion: fwdOverlap,
                tm: calculateTm(fwdSeq),
                tmBinding: fwdBinding.tm,
                length: fwdSeq.length,
                gcPercent: Math.round(gcContent(fwdSeq) * 100),
                hairpinRisk: checkHairpin(fwdSeq),
                dimerRisk: false,
            };

            // Reverse primer
            const nextNextFrag = (i + 1) < fragments.length ? fragments[i + 1] : fragments[0];
            const nextNextSeq = nextNextFrag.sequence.toUpperCase().replace(/[^ATCG]/g, '');

            // Overlap comes from the START of the next fragment
            const revOverlapRaw = nextNextSeq.substring(0, overlapLength);
            const revOverlap = reverseComplement(revOverlapRaw);
            const revBinding = this.designBindingRegion(cleanSeq, cleanSeq.length - 1, 'reverse', targetTm);
            const revSeq = revOverlap + revBinding.region;

            const revPrimer: Primer = {
                name: `${frag.name}_Rev_Gibson`,
                sequence: revSeq,
                bindingRegion: revBinding.region,
                overlapRegion: revOverlap,
                tm: calculateTm(revSeq),
                tmBinding: revBinding.tm,
                length: revSeq.length,
                gcPercent: Math.round(gcContent(revSeq) * 100),
                hairpinRisk: checkHairpin(revSeq),
                dimerRisk: false,
            };

            // Check dimer between pair
            fwdPrimer.dimerRisk = checkDimer(fwdSeq, revSeq);
            revPrimer.dimerRisk = fwdPrimer.dimerRisk;

            results.push({
                forward: fwdPrimer,
                reverse: revPrimer,
                product: {
                    length: cleanSeq.length,
                    gcPercent: Math.round(gcContent(cleanSeq) * 100),
                },
                method: 'gibson',
                fragment: frag.name,
            });
        }

        return results;
    }

    /**
     * Design Golden Gate primers for a single part
     */
    designGoldenGatePrimers(
        sequence: string,
        partType: keyof typeof STANDARD_OVERHANGS,
        enzyme: keyof typeof ENZYMES = 'BsaI',
        targetTm: number = 60,
        partName: string = 'Part',
    ): PrimerPair {
        const cleanSeq = sequence.toUpperCase().replace(/[^ATCG]/g, '');
        const enz = ENZYMES[enzyme];
        const overhangs = STANDARD_OVERHANGS[partType];

        // Forward: [padding][enzyme_site][N spacer][overhang][binding]
        // BsaI cuts 1 downstream, so: GGTCTC·N·GGAG...
        const fwdBinding = this.designBindingRegion(cleanSeq, 0, 'forward', targetTm);
        const fwdPrefix = `AA${enz.site}N${overhangs.fwd}`;
        const fwdSeq = fwdPrefix + fwdBinding.region;

        // Reverse: [padding][rc(enzyme_site)][N spacer][rc(overhang)][binding_rc]
        const revBinding = this.designBindingRegion(cleanSeq, cleanSeq.length - 1, 'reverse', targetTm);
        const revEnzRC = reverseComplement(enz.site);
        const revOverhangRC = reverseComplement(overhangs.rev);
        const revPrefix = `AA${revEnzRC}N${revOverhangRC}`;
        const revSeq = revPrefix + revBinding.region;

        const fwdPrimer: Primer = {
            name: `${partName}_Fwd_${enzyme}`,
            sequence: fwdSeq,
            bindingRegion: fwdBinding.region,
            overlapRegion: fwdPrefix,
            tm: calculateTm(fwdSeq),
            tmBinding: fwdBinding.tm,
            length: fwdSeq.length,
            gcPercent: Math.round(gcContent(fwdSeq) * 100),
            hairpinRisk: checkHairpin(fwdSeq),
            dimerRisk: false,
        };

        const revPrimer: Primer = {
            name: `${partName}_Rev_${enzyme}`,
            sequence: revSeq,
            bindingRegion: revBinding.region,
            overlapRegion: revPrefix,
            tm: calculateTm(revSeq),
            tmBinding: revBinding.tm,
            length: revSeq.length,
            gcPercent: Math.round(gcContent(revSeq) * 100),
            hairpinRisk: checkHairpin(revSeq),
            dimerRisk: false,
        };

        fwdPrimer.dimerRisk = checkDimer(fwdSeq, revSeq);
        revPrimer.dimerRisk = fwdPrimer.dimerRisk;

        return {
            forward: fwdPrimer,
            reverse: revPrimer,
            product: {
                length: cleanSeq.length,
                gcPercent: Math.round(gcContent(cleanSeq) * 100),
            },
            method: 'golden_gate',
            fragment: partName,
        };
    }

    /**
     * Format primer results as a professional lab-ready report
     */
    private formatPrimerReport(pairs: PrimerPair[]): string {
        const lines: string[] = [];
        lines.push('═══════════════════════════════════════════════════════════════');
        lines.push('  SynBio-LLVM Primer Designer — Laboratory-Ready Report');
        lines.push(`  Generated: ${new Date().toISOString()}`);
        lines.push('═══════════════════════════════════════════════════════════════\n');

        let orderTable: { name: string; seq: string; len: number }[] = [];

        for (const pair of pairs) {
            lines.push(`─── Fragment: ${pair.fragment} (${pair.method.toUpperCase()}) ───`);
            lines.push(`  Product: ${pair.product.length} bp, GC%: ${pair.product.gcPercent}%\n`);

            for (const p of [pair.forward, pair.reverse]) {
                const warnings: string[] = [];
                if (p.hairpinRisk) { warnings.push('⚠️ HAIRPIN'); }
                if (p.dimerRisk) { warnings.push('⚠️ DIMER'); }
                if (p.gcPercent < 40 || p.gcPercent > 60) { warnings.push('⚠️ GC%'); }
                if (p.tmBinding < 55 || p.tmBinding > 65) { warnings.push('⚠️ Tm'); }

                lines.push(`  ${p.name}`);
                lines.push(`  5'─ ${p.sequence} ─3'`);
                lines.push(`  Length: ${p.length} nt | Tm(bind): ${p.tmBinding}°C | GC%: ${p.gcPercent}%`);
                if (p.overlapRegion) {
                    lines.push(`  Overlap: ${p.overlapRegion.length} nt`);
                }
                if (warnings.length > 0) {
                    lines.push(`  ${warnings.join(' | ')}`);
                }
                lines.push('');

                orderTable.push({ name: p.name, seq: p.sequence, len: p.length });
            }
        }

        // Order summary table
        lines.push('\n═══ ORDER TABLE (copy for oligo synthesis) ═══\n');
        lines.push('Name\tSequence\tLength\tScale');
        lines.push('────\t────────\t──────\t─────');
        for (const primer of orderTable) {
            const scale = primer.len <= 40 ? '25nmol' : primer.len <= 60 ? '100nmol' : '250nmol';
            lines.push(`${primer.name}\t${primer.seq}\t${primer.len}\t${scale}`);
        }

        lines.push('\n═══ PROTOCOL NOTES ═══\n');
        if (pairs[0]?.method === 'gibson') {
            lines.push('Gibson Assembly Protocol (NEB E2611):');
            lines.push('  1. PCR amplify each fragment with designed primers');
            lines.push('  2. DpnI digest template (1h, 37°C)');
            lines.push('  3. Gel purify PCR products');
            lines.push('  4. Mix equimolar amounts (10-100 ng each)');
            lines.push('  5. Add Gibson Assembly Master Mix');
            lines.push('  6. Incubate 50°C, 60 min');
            lines.push('  7. Transform 2μL into competent cells');
        } else {
            lines.push('Golden Gate Assembly Protocol:');
            lines.push('  1. PCR amplify each part with designed primers');
            lines.push('  2. Set up reaction: parts (75ng each) + vector (75ng)');
            lines.push('  3. Add enzyme (BsaI-HFv2, 1μL) + T4 DNA Ligase (1μL)');
            lines.push('  4. Thermal cycling: 30x (37°C 1min → 16°C 1min)');
            lines.push('  5. Final: 50°C 5min → 80°C 10min');
            lines.push('  6. Transform 2μL into competent cells');
        }

        return lines.join('\n');
    }

    /**
     * Interactive primer design UI
     */
    async designPrimersUI(): Promise<void> {
        // Choose method
        const method = await vscode.window.showQuickPick(
            [
                {
                    label: '🔗 Gibson Assembly',
                    description: 'Overlap-based, scarless cloning',
                    detail: '20-40bp overlapping primers, isothermal assembly at 50°C',
                    method: 'gibson' as const,
                },
                {
                    label: '✂️ Golden Gate (Type IIS)',
                    description: 'Restriction-based, modular cloning (MoClo)',
                    detail: 'BsaI/BpiI sites with standardized 4bp overhangs',
                    method: 'golden_gate' as const,
                },
            ],
            { title: '🧬 Primer Designer — Método de clonación' }
        );

        if (!method) { return; }

        // Get sequence from editor or input
        const editor = vscode.window.activeTextEditor;
        let sequence = '';

        if (editor) {
            sequence = editor.selection.isEmpty
                ? editor.document.getText()
                : editor.document.getText(editor.selection);

            // Clean: remove FASTA headers, whitespace, numbers
            sequence = sequence
                .split('\n')
                .filter(line => !line.startsWith('>') && !line.startsWith(';'))
                .join('')
                .replace(/[\s\d]/g, '')
                .toUpperCase();
        }

        if (sequence.length < 20 || !/^[ATCGN]+$/i.test(sequence)) {
            const input = await vscode.window.showInputBox({
                title: 'Ingresa la secuencia de DNA',
                prompt: 'Pega la secuencia (solo caracteres ATCG)',
                placeHolder: 'ATGAAAGCAATTTTCGTACTGAAACATCTT...',
                ignoreFocusOut: true,
            });
            if (!input) { return; }
            sequence = input.toUpperCase().replace(/[^ATCG]/g, '');
        }

        if (sequence.length < 20) {
            vscode.window.showErrorMessage('Secuencia demasiado corta (mínimo 20 bp)');
            return;
        }

        let results: PrimerPair[];

        if (method.method === 'gibson') {
            // Ask for fragment name
            const name = await vscode.window.showInputBox({
                title: 'Nombre del fragmento',
                value: 'Fragment_1',
            }) || 'Fragment_1';

            results = this.designGibsonPrimers([{ name, sequence }]);

        } else {
            // Golden Gate — ask for part type and enzyme
            const partType = await vscode.window.showQuickPick(
                Object.entries(STANDARD_OVERHANGS).map(([key, val]) => ({
                    label: `🏷️ ${key.charAt(0).toUpperCase() + key.slice(1)}`,
                    description: val.description,
                    detail: `Overhangs: ${val.fwd} → ${val.rev}`,
                    key,
                })),
                { title: 'Tipo de parte (MoClo estándar)' }
            );

            if (!partType) { return; }

            const enzyme = await vscode.window.showQuickPick(
                Object.entries(ENZYMES).map(([key, val]) => ({
                    label: `✂️ ${key}`,
                    description: val.name,
                    detail: `Site: ${val.site} | Overhang: ${val.overhang}bp`,
                    key,
                })),
                { title: 'Enzima de restricción' }
            );

            if (!enzyme) { return; }

            const name = await vscode.window.showInputBox({
                title: 'Nombre de la parte',
                value: partType.key.charAt(0).toUpperCase() + partType.key.slice(1) + '_1',
            }) || 'Part';

            const pair = this.designGoldenGatePrimers(
                sequence,
                partType.key as keyof typeof STANDARD_OVERHANGS,
                enzyme.key as keyof typeof ENZYMES,
                60,
                name,
            );
            results = [pair];
        }

        // Format and show report
        const report = this.formatPrimerReport(results);

        const action = await vscode.window.showInformationMessage(
            `✅ ${results.length * 2} primers diseñados (${method.method})`,
            'Abrir Reporte',
            'Copiar Tabla de Orden',
        );

        if (action === 'Abrir Reporte') {
            const doc = await vscode.workspace.openTextDocument({
                content: report,
                language: 'plaintext',
            });
            await vscode.window.showTextDocument(doc);
        } else if (action === 'Copiar Tabla de Orden') {
            // Extract just the order table
            const orderSection = report.substring(report.indexOf('═══ ORDER TABLE'));
            await vscode.env.clipboard.writeText(orderSection);
            vscode.window.showInformationMessage('Tabla de orden copiada al portapapeles');
        }
    }

    /**
     * Quick Tm calculator for any sequence
     */
    async calculateTmUI(): Promise<void> {
        const input = await vscode.window.showInputBox({
            title: '🌡️ Calculadora de Tm (SantaLucia NN)',
            prompt: 'Ingresa la secuencia del primer',
            placeHolder: 'ATGAAAGCAATTTTCGTACTG',
        });

        if (!input) { return; }

        const seq = input.toUpperCase().replace(/[^ATCG]/g, '');
        const tm = calculateTm(seq);
        const gc = Math.round(gcContent(seq) * 100);
        const hairpin = checkHairpin(seq);

        const msg = `🌡️ Tm = ${tm}°C | GC% = ${gc}% | Len = ${seq.length}nt${hairpin ? ' | ⚠️ Hairpin risk' : ''}`;
        vscode.window.showInformationMessage(msg);

        this.outputChannel.appendLine(`[Tm] ${seq} → ${tm}°C (GC: ${gc}%, ${seq.length}nt)`);
    }

    dispose(): void {
        this.outputChannel.dispose();
        this.disposables.forEach(d => d.dispose());
    }
}
