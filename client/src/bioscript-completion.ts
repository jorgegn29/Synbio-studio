/**
 * BioScript CompletionProvider — Autocompletado contextual biológico
 *
 * Proporciona sugerencias inteligentes según el contexto:
 *   - Dentro de `circuit {}`: sugiere promoter, rbs, gene, terminator, kill_switch
 *   - Después de `rbs:`: sugiere RBS con fuerza medida (B0034 strong 1000au)
 *   - Después de `terminator:`: sugiere terminadores con eficiencia
 *   - Después de `promoter`: sugiere promotores con tipo (constitutivo/inducible)
 *   - Después de `= `: sugiere proteínas/reporters disponibles
 *   - Después de `host`: sugiere chassis con nivel BSL
 *   - A nivel raíz: sugiere circuit, gene, rule, host
 *
 * Datos medidos del iGEM Registry y publicaciones peer-reviewed.
 *
 * Referencias:
 *   - iGEM Registry: parts.igem.org
 *   - Anderson JC et al. (2006) J Biol Eng 1:13
 *   - Salis HM et al. (2009) Nat Biotechnol 27:946-950
 *   - Chen YJ et al. (2013) Nat Methods 10:659-664
 *   - Mutalik VK et al. (2013) Nat Methods 10:354-360
 */

import * as vscode from 'vscode';

// ════════════════════════════════════════════════════════════════════════════
// DATOS DE PARTES PARA AUTOCOMPLETADO
// ════════════════════════════════════════════════════════════════════════════

interface CompletionPart {
    label: string;
    insertText: string;
    detail: string;
    documentation: string;
    sortOrder: string; // para controlar el orden de aparición
}

const RBS_PARTS: CompletionPart[] = [
    { label: 'B0034', insertText: 'B0034', detail: '🔵 RBS strong — 1000 au (RPU=1.00)', documentation: 'RBS de referencia del iGEM Registry. Secuencia Shine-Dalgarno canónica: AAAGAGGAGAAA. El estándar contra el cual se miden todos los demás RBS.\n\nRef: Elowitz & Leibler (2000); Salis Lab calibration', sortOrder: '0' },
    { label: 'B0035', insertText: 'B0035', detail: '🔵 RBS medium-strong — 500 au (RPU=0.50)', documentation: 'RBS medio-fuerte. 50% de la fuerza de B0034. Buena opción para expresión moderada-alta.\n\nRef: Mutalik VK et al. (2013)', sortOrder: '1' },
    { label: 'B0032', insertText: 'B0032', detail: '🔵 RBS medium — 300 au (RPU=0.30)', documentation: 'RBS medio de la colección Anderson. Compromiso entre expresión y carga metabólica.\n\nRef: Anderson JC (2006); Salis HM et al. (2009)', sortOrder: '2' },
    { label: 'B0031', insertText: 'B0031', detail: '🔵 RBS weak — 150 au (RPU=0.12)', documentation: 'RBS débil. Para genes de mantenimiento o proteínas tóxicas donde se necesita expresión reducida.\n\nRef: iGEM Registry', sortOrder: '3' },
    { label: 'B0030', insertText: 'B0030', detail: '🔵 RBS weak — 100 au (RPU=0.07)', documentation: 'RBS débil. Secuencia Shine-Dalgarno subóptima.\n\nRef: Mutalik VK et al. (2013)', sortOrder: '4' },
    { label: 'B0033', insertText: 'B0033', detail: '🔵 RBS very weak — 50 au (RPU=0.04)', documentation: 'El RBS más débil del registro iGEM. Para expresión basal mínima o como control negativo.\n\nRef: iGEM Registry', sortOrder: '5' },
];

const TERMINATOR_PARTS: CompletionPart[] = [
    { label: 'B0015', insertText: 'B0015', detail: '🔴 Doble terminador — >99% eficiencia', documentation: 'Combinación B0010 (T1 rrnB) + B0012 (TE T7). El terminador más fiable del registro. Usado en el Repressilator original.\n112 bp. Eficiencia >99%.\n\nRef: Chen YJ et al. (2013) Nat Methods 10:659', sortOrder: '0' },
    { label: 'B0010', insertText: 'B0010', detail: '🔴 T1 rrnB terminador — 98% eficiencia', documentation: 'Terminador T1 del rrnB de E. coli. Rho-independiente. Estructura stem-loop estable (ΔG ≈ -11.5 kcal/mol).\n72 bp.\n\nRef: Chen YJ et al. (2013)', sortOrder: '1' },
    { label: 'L3S2P21', insertText: 'L3S2P21', detail: '🔴 Sintético — 97% eficiencia', documentation: 'Terminador sintético diseñado computacionalmente por Chen et al. Alta ortogonalidad.\n60 bp.\n\nRef: Chen YJ et al. (2013)', sortOrder: '2' },
    { label: 'B0012', insertText: 'B0012', detail: '🔴 TE T7 terminador — 95% eficiencia', documentation: 'Terminador TE del fago T7. Funciona bien en contexto policistrónico.\n41 bp.\n\nRef: Chen YJ et al. (2013)', sortOrder: '3' },
    { label: 'B0011', insertText: 'B0011', detail: '🔴 lacZ terminador — 90% eficiencia', documentation: 'Terminador del lacZ. Moderado, útil cuando se necesita algo de read-through controlado.\n50 bp.\n\nRef: iGEM Registry', sortOrder: '4' },
];

const PROMOTER_PARTS: CompletionPart[] = [
    // Inducibles
    { label: 'pLac', insertText: 'pLac', detail: '🟢 Inducible (IPTG) — ~5 RPU inducido | LacI-regulated', documentation: 'Promotor lac (R0010). Regulado por LacI, inducible con IPTG.\nRatio inducción: ~50x. El promotor regulable más usado.\n\nRef: Lutz R & Bujard H (1997)', sortOrder: '0' },
    { label: 'pTet', insertText: 'pTet', detail: '🟢 Inducible (aTc) — ~4 RPU inducido | TetR-regulated', documentation: 'Promotor tet (R0040). Regulado por TetR, inducible con aTc.\nRatio inducción: ~200x. Mayor rango dinámico que pLac.\n\nRef: Lutz R & Bujard H (1997)', sortOrder: '1' },
    { label: 'pBAD', insertText: 'pBAD', detail: '🟢 Inducible (arabinosa) — ~8 RPU | AraC-regulated', documentation: 'Promotor araBAD (I0500). Regulado por AraC, inducible con L-arabinosa.\nRatio inducción: ~8000x. El mayor rango dinámico.\n\nRef: Guzman LM et al. (1995)', sortOrder: '2' },
    { label: 'pT7', insertText: 'pT7', detail: '🟢 Requiere T7 RNAP — ~100 RPU | BL21(DE3)', documentation: 'Promotor del fago T7. El más fuerte disponible.\nRequiere T7 RNA polimerasa (cepas BL21-DE3).\n\nRef: Studier FW (1986)', sortOrder: '3' },
    { label: 'pCI', insertText: 'pCI', detail: '🟢 Lambda pR — ~3.5 RPU | CI-regulated', documentation: 'Promotor pR del fago λ (R0051). Regulado por CI repressor.\nUsado en el Repressilator.\n\nRef: Ptashne M (2004)', sortOrder: '4' },
    { label: 'pLux', insertText: 'pLux', detail: '🟢 Quorum sensing — ~5 RPU | LuxR+AHL', documentation: 'Promotor lux (R0062). Activado por LuxR+AHL.\nBase del sistema de quorum sensing.\n\nRef: Canton B et al. (2008)', sortOrder: '5' },
    { label: 'pTrc', insertText: 'pTrc', detail: '🟢 Inducible (IPTG) — ~6 RPU | Híbrido trp/lac', documentation: 'Promotor trc. Híbrido trp/lac, más fuerte que pLac.\n\nRef: Brosius J et al. (1985)', sortOrder: '6' },
    { label: 'pTac', insertText: 'pTac', detail: '🟢 Inducible (IPTG) — ~8 RPU | Híbrido trp/lac fuerte', documentation: 'Promotor tac. Similar a pTrc con spacing óptimo.\n\nRef: de Boer HA et al. (1983)', sortOrder: '7' },
    { label: 'pRha', insertText: 'pRha', detail: '🟢 Inducible (rhamnosa) — ~2 RPU', documentation: 'Promotor rhaBAD. Inducible con L-rhamnosa.\nBuena ortogonalidad con pLac/pBAD.\n\nRef: Haldimann A et al. (1998)', sortOrder: '8' },
    // Constitutivos (Anderson Library)
    { label: 'J23100', insertText: 'J23100', detail: '🟢 Constitutivo FUERTE — 1.00 RPU (referencia)', documentation: 'El más fuerte de la Anderson Promoter Library.\nσ70-dependiente. RPU = 1.00 por definición.\n\nRef: Anderson JC (2006) J Biol Eng 1:13', sortOrder: '10' },
    { label: 'J23119', insertText: 'J23119', detail: '🟢 Constitutivo fuerte — 0.93 RPU', documentation: '2do más fuerte de la Anderson Library.\n\nRef: Anderson JC (2006)', sortOrder: '11' },
    { label: 'J23101', insertText: 'J23101', detail: '🟢 Constitutivo moderado — 0.70 RPU', documentation: '70% de J23100. Útil para balancear circuitos.\n\nRef: Anderson JC (2006)', sortOrder: '12' },
    { label: 'J23106', insertText: 'J23106', detail: '🟢 Constitutivo medio — 0.47 RPU', documentation: '~50% de J23100.\n\nRef: Anderson JC (2006)', sortOrder: '13' },
    { label: 'J23116', insertText: 'J23116', detail: '🟢 Constitutivo débil — 0.16 RPU', documentation: 'Constitutivo débil de la Anderson Library.\n\nRef: Anderson JC (2006)', sortOrder: '14' },
    { label: 'pConst', insertText: 'pConst', detail: '🟢 Constitutivo fuerte — alias J23100', documentation: 'Alias para J23100, el promotor constitutivo de referencia.\n\nRef: Anderson JC (2006)', sortOrder: '15' },
];

const PROTEIN_PARTS: CompletionPart[] = [
    // Reporters
    { label: 'GFP', insertText: 'GFP', detail: '🟡 Reporter verde — Ex/Em 395/509 nm', documentation: 'GFPmut3b (E0040). Maduración ~30 min. El reporter más usado.\n\nRef: Chalfie M et al. (1994) Science 263:802', sortOrder: '0' },
    { label: 'sfGFP', insertText: 'sfGFP', detail: '🟡 Superfolder GFP — más brillante, más rápido', documentation: 'Superfolder GFP. Maduración ~6 min. Mucho más brillante que GFP.\n\nRef: Pédelacq JD et al. (2006)', sortOrder: '1' },
    { label: 'eGFP', insertText: 'eGFP', detail: '🟡 Enhanced GFP — optimizado mamíferos', documentation: 'F64L, S65T. Estándar en cell biology.\n\nRef: Yang TT et al. (1996)', sortOrder: '2' },
    { label: 'RFP', insertText: 'RFP', detail: '🟡 Reporter rojo — Ex/Em 584/607 nm', documentation: 'mRFP1 (E1010). Para dual-color con GFP.\n\nRef: Campbell RE et al. (2002)', sortOrder: '3' },
    { label: 'mCherry', insertText: 'mCherry', detail: '🟡 mCherry — RFP de 2da gen, rápido', documentation: 'Mejor fotostabilidad que mRFP1. Maduración ~15 min. El reporter rojo de elección.\n\nRef: Shaner NC et al. (2004)', sortOrder: '4' },
    { label: 'BFP', insertText: 'BFP', detail: '🟡 Reporter azul — Ex/Em 383/448 nm', documentation: 'GFP Y66H. Baja brillantez. Considerar mTagBFP2.\n\nRef: Heim R & Tsien RY (1996)', sortOrder: '5' },
    { label: 'YFP', insertText: 'YFP', detail: '🟡 Reporter amarillo — Ex/Em 514/527 nm', documentation: 'GFP T203Y. Alta brillantez, sensible a pH.\n\nRef: Nagai T et al. (2002)', sortOrder: '6' },
    { label: 'CFP', insertText: 'CFP', detail: '🟡 Reporter cyan — Ex/Em 434/477 nm', documentation: 'GFP Y66W. Para FRET con YFP.\n\nRef: Heim R & Tsien RY (1996)', sortOrder: '7' },
    { label: 'mVenus', insertText: 'mVenus', detail: '🟡 YFP mejorado — monomérico real', documentation: 'mVenus. Excelente para cuantificación in vivo.\n\nRef: Nagai T et al. (2002)', sortOrder: '8' },
    { label: 'LuxAB', insertText: 'LuxAB', detail: '🟡 Bioluminiscencia — no requiere excitación', documentation: 'Luciferasa bacteriana. No requiere luz de excitación.\n\nRef: Meighen EA (1991)', sortOrder: '9' },
    // Reguladores
    { label: 'LacI', insertText: 'LacI', detail: '⚙️ Represor lac — reprime pLac', documentation: 'Lac repressor (C0012). Tetramérico. Inhibido por IPTG.\n\nRef: Lewis M et al. (1996)', sortOrder: '20' },
    { label: 'TetR', insertText: 'TetR', detail: '⚙️ Represor tet — reprime pTet', documentation: 'Tet repressor (C0040). Dimérico. Inhibido por aTc.\n\nRef: Hillen W & Berens C (1994)', sortOrder: '21' },
    { label: 'AraC', insertText: 'AraC', detail: '⚙️ Regulador ara — dual con arabinosa', documentation: 'AraC (C0080). Represor sin arabinosa, activador con arabinosa.\n\nRef: Schleif R (2000)', sortOrder: '22' },
    { label: 'CI', insertText: 'CI', detail: '⚙️ Lambda repressor — reprime pCI', documentation: 'CI del fago λ (C0051). Cooperativo. Switch bistable.\n\nRef: Ptashne M (2004)', sortOrder: '23' },
    { label: 'LuxR', insertText: 'LuxR', detail: '⚙️ Receptor AHL — activa pLux', documentation: 'LuxR (C0062). Se activa con AHL para activar pLux.\n\nRef: Canton B et al. (2008)', sortOrder: '24' },
    { label: 'Cas9', insertText: 'Cas9', detail: '⚙️ Nucleasa CRISPR — corte dsDNA', documentation: 'CRISPR Cas9 (S. pyogenes). PAM: NGG. 1368 aa.\n\nRef: Jinek M et al. (2012) Science 337:816', sortOrder: '25' },
    { label: 'dCas9', insertText: 'dCas9', detail: '⚙️ CRISPRi — regulación sin corte', documentation: 'dead Cas9 (D10A+H840A). Para CRISPRi/CRISPRa.\n\nRef: Qi LS et al. (2013) Cell 152:1173', sortOrder: '26' },
];

const CHASSIS_PARTS: CompletionPart[] = [
    { label: 'ecoli_k12', insertText: 'ecoli_k12', detail: '🦠 BSL-1 — E. coli K-12 (estándar lab)', documentation: 'La cepa de laboratorio más usada. No patogénica, bien caracterizada.\nGenoma: 4.6 Mb | t_d: ~20 min\n\nRef: Blattner FR et al. (1997)', sortOrder: '0' },
    { label: 'ecoli_dh5alpha', insertText: 'ecoli_dh5alpha', detail: '🦠 BSL-1 — DH5α (clonación)', documentation: 'Cepa de clonación. recA1, endA1. Eficiencia: ~10⁹ CFU/μg.\n\nRef: Taylor RG et al. (1993)', sortOrder: '1' },
    { label: 'ecoli_bl21', insertText: 'ecoli_bl21', detail: '🦠 BSL-1 — BL21(DE3) (expresión T7)', documentation: 'Cepa de expresión. T7 RNAP integrada. Para uso con pT7.\n\nRef: Studier FW (1986)', sortOrder: '2' },
    { label: 'ecoli_mg1655', insertText: 'ecoli_mg1655', detail: '🦠 BSL-1 — MG1655 (wild-type K-12)', documentation: 'K-12 wild-type con genoma secuenciado. Referencia genómica.\n\nRef: Blattner FR (1997)', sortOrder: '3' },
    { label: 'ecoli_nissle1917', insertText: 'ecoli_nissle1917', detail: '🦠 BSL-1 — Nissle 1917 (probiótico)', documentation: 'Cepa probiótica. Para terapéuticos in vivo y living medicines.\n\nRef: Sonnenborn U (2016)', sortOrder: '4' },
    { label: 'yeast_s288c', insertText: 'yeast_s288c', detail: '🦠 BSL-1 — S. cerevisiae S288c', documentation: 'Levadura de laboratorio estándar. Eucariota, 16 cromosomas.\n\nRef: Goffeau A et al. (1996)', sortOrder: '5' },
    { label: 'bacillus_subtilis_168', insertText: 'bacillus_subtilis_168', detail: '🦠 BSL-1 — B. subtilis 168', documentation: 'Gram-positivo modelo. Secreción natural de proteínas.\n\nRef: Kunst F et al. (1997)', sortOrder: '6' },
    { label: 'pseudomonas_putida_kt2440', insertText: 'pseudomonas_putida_kt2440', detail: '🦠 BSL-1 — P. putida KT2440', documentation: 'Chassis robusto para biocatálisis y biorremediación. Certificado GRAS.\n\nRef: Nelson KE et al. (2002)', sortOrder: '7' },
    { label: 'vibrio_natriegens', insertText: 'vibrio_natriegens', detail: '🦠 BSL-1 — V. natriegens (ultra-rápido)', documentation: 'El organismo de más rápido crecimiento conocido. t_d: ~10 min.\n\nRef: Weinstock MT et al. (2016)', sortOrder: '8' },
    { label: 'pichia_pastoris', insertText: 'pichia_pastoris', detail: '🦠 BSL-1 — P. pastoris (expresión eucariota)', documentation: 'Levadura metilotrófica. Excelente para secreción de proteínas recombinantes.\n\nRef: Cereghino JL (2000)', sortOrder: '9' },
];

// ════════════════════════════════════════════════════════════════════════════
// COMPLETION PROVIDER
// ════════════════════════════════════════════════════════════════════════════

export class BioScriptCompletionProvider implements vscode.CompletionItemProvider {

    provideCompletionItems(
        document: vscode.TextDocument,
        position: vscode.Position,
        _token: vscode.CancellationToken,
        _context: vscode.CompletionContext
    ): vscode.ProviderResult<vscode.CompletionItem[]> {
        const line = document.lineAt(position.line).text;
        const linePrefix = line.substring(0, position.character);
        const fullText = document.getText();

        // Determine context
        const insideCircuit = this.isInsideBlock(document, position, 'circuit');
        const insideKillSwitch = this.isInsideBlock(document, position, 'kill_switch');

        // ── Context: after "rbs:" ──
        if (/rbs:\s*$/.test(linePrefix)) {
            return RBS_PARTS.map(p => this.createPartCompletion(p, vscode.CompletionItemKind.Constant));
        }

        // ── Context: after "terminator:" ──
        if (/terminator:\s*$/.test(linePrefix)) {
            return TERMINATOR_PARTS.map(p => this.createPartCompletion(p, vscode.CompletionItemKind.Constant));
        }

        // ── Context: after "promoter " (promoter name) ──
        if (/promoter\s+$/.test(linePrefix)) {
            return PROMOTER_PARTS.map(p => this.createPartCompletion(p, vscode.CompletionItemKind.Event));
        }

        // ── Context: after "= " in gene declaration (protein product) ──
        if (/=\s*$/.test(linePrefix) && /gene\s+/.test(line)) {
            return PROTEIN_PARTS.map(p => this.createPartCompletion(p, vscode.CompletionItemKind.Class));
        }

        // ── Context: after "host " ──
        if (/host\s+$/.test(linePrefix)) {
            return CHASSIS_PARTS.map(p => this.createPartCompletion(p, vscode.CompletionItemKind.Module));
        }

        // ── Context: inside kill_switch block ──
        if (insideKillSwitch) {
            return this.getKillSwitchCompletions(linePrefix);
        }

        // ── Context: inside circuit block ──
        if (insideCircuit) {
            return this.getCircuitBlockCompletions(linePrefix, fullText);
        }

        // ── Context: top-level ──
        return this.getTopLevelCompletions();
    }

    private createPartCompletion(part: CompletionPart, kind: vscode.CompletionItemKind): vscode.CompletionItem {
        const item = new vscode.CompletionItem(part.label, kind);
        item.insertText = part.insertText;
        item.detail = part.detail;
        item.documentation = new vscode.MarkdownString(part.documentation);
        item.sortText = part.sortOrder;
        item.filterText = part.label;
        return item;
    }

    private getCircuitBlockCompletions(linePrefix: string, fullText: string): vscode.CompletionItem[] {
        const items: vscode.CompletionItem[] = [];

        // Structural elements
        const promoterSnippet = new vscode.CompletionItem('promoter', vscode.CompletionItemKind.Keyword);
        promoterSnippet.insertText = new vscode.SnippetString('promoter ${1|pLac,pTet,pBAD,pT7,pConst,pCI,pLux,J23100|};');
        promoterSnippet.detail = '🟢 Declarar promotor';
        promoterSnippet.documentation = new vscode.MarkdownString('Declara un promotor. Controla cuándo y cuánto se transcribe el gen downstream.');
        promoterSnippet.sortText = '00';
        items.push(promoterSnippet);

        const rbsSnippet = new vscode.CompletionItem('rbs', vscode.CompletionItemKind.Keyword);
        rbsSnippet.insertText = new vscode.SnippetString('rbs: ${1|B0034,B0032,B0035,B0031,B0030,B0033|};');
        rbsSnippet.detail = '🔵 Declarar RBS';
        rbsSnippet.documentation = new vscode.MarkdownString('Ribosome Binding Site. Controla la tasa de traducción.\n\nB0034 = strong (1000 au)\nB0032 = medium (300 au)\nB0033 = very weak (50 au)');
        rbsSnippet.sortText = '01';
        items.push(rbsSnippet);

        const geneSnippet = new vscode.CompletionItem('gene', vscode.CompletionItemKind.Keyword);
        geneSnippet.insertText = new vscode.SnippetString('gene ${1:name}: Protein = ${2|GFP,RFP,mCherry,sfGFP,LacI,TetR,AraC,Cas9|};');
        geneSnippet.detail = '🧬 Declarar gen codificante';
        geneSnippet.documentation = new vscode.MarkdownString('Declara un gen con su producto proteico.\n\nFormato: `gene nombre: Protein = Producto;`');
        geneSnippet.sortText = '02';
        items.push(geneSnippet);

        const termSnippet = new vscode.CompletionItem('terminator', vscode.CompletionItemKind.Keyword);
        termSnippet.insertText = new vscode.SnippetString('terminator: ${1|B0015,B0010,L3S2P21,B0012,B0011|};');
        termSnippet.detail = '🔴 Declarar terminador';
        termSnippet.documentation = new vscode.MarkdownString('Terminador de transcripción.\n\nB0015 = doble (>99%)\nB0010 = T1 rrnB (98%)\nB0012 = TE T7 (95%)');
        termSnippet.sortText = '03';
        items.push(termSnippet);

        // Kill switch
        const killSwitchSnippet = new vscode.CompletionItem('kill_switch', vscode.CompletionItemKind.Struct);
        killSwitchSnippet.insertText = new vscode.SnippetString(
            'kill_switch {\n\ttrigger: ${1|absence(IPTG),absence(arabinose),temperature(42C)|},\n\ttoxin: ${2|CcdB,MazF,RelE|},\n\tantitoxin: ${3|CcdA,MazE,RelB|},\n\tdelay: ${4:2hr}\n}'
        );
        killSwitchSnippet.detail = '☠️ Sistema de biocontención';
        killSwitchSnippet.documentation = new vscode.MarkdownString('Kill switch — mata la célula cuando se pierde la condición trigger.\n\nSistemas T-A tipo II:\n- CcdB/CcdA (DNA girasa)\n- MazF/MazE (mRNA interferase)\n- RelE/RelB (ribosome-dependent)');
        killSwitchSnippet.sortText = '04';
        items.push(killSwitchSnippet);

        // Complete TU (Transcription Unit)
        const tuSnippet = new vscode.CompletionItem('tu', vscode.CompletionItemKind.Snippet);
        tuSnippet.insertText = new vscode.SnippetString(
            '// TU: ${1:name}\npromoter ${2|pLac,pTet,pBAD,pT7,pConst|};\nrbs: ${3|B0034,B0032,B0035|};\ngene ${4:name}: Protein = ${5|GFP,RFP,mCherry,LacI,TetR|};\nterminator: ${6|B0015,B0010|};'
        );
        tuSnippet.detail = '📦 Unidad Transcripcional completa';
        tuSnippet.documentation = new vscode.MarkdownString('Inserta una unidad transcripcional completa:\npromotor → RBS → gen → terminador');
        tuSnippet.sortText = '05';
        items.push(tuSnippet);

        // Connections
        const activationSnippet = new vscode.CompletionItem('->', vscode.CompletionItemKind.Operator);
        activationSnippet.insertText = new vscode.SnippetString('${1:source} -> ${2:target};');
        activationSnippet.detail = '➡️ Conexión de activación';
        activationSnippet.documentation = new vscode.MarkdownString('Promotor activa transcripción del gen downstream.\n\nEjemplo: `pLac -> gfp;`');
        activationSnippet.sortText = '10';
        items.push(activationSnippet);

        const repressionSnippet = new vscode.CompletionItem('~>', vscode.CompletionItemKind.Operator);
        repressionSnippet.insertText = new vscode.SnippetString('${1:repressor} ~> ${2:target};');
        repressionSnippet.detail = '⊣ Conexión de represión';
        repressionSnippet.documentation = new vscode.MarkdownString('Proteína reprime un promotor.\n\nEjemplo: `LacI ~> pTet;`');
        repressionSnippet.sortText = '11';
        items.push(repressionSnippet);

        return items;
    }

    private getKillSwitchCompletions(linePrefix: string): vscode.CompletionItem[] {
        const items: vscode.CompletionItem[] = [];

        if (/trigger:\s*$/.test(linePrefix)) {
            for (const [label, desc] of [
                ['absence(IPTG)', 'Sin IPTG → activar toxina'],
                ['absence(arabinose)', 'Sin arabinosa → activar toxina'],
                ['temperature(42C)', 'A 42°C → activar toxina (CI857 termosensible)'],
                ['escape_detection', 'Fuera del biorreactor → activar toxina'],
            ]) {
                const item = new vscode.CompletionItem(label, vscode.CompletionItemKind.EnumMember);
                item.detail = desc;
                items.push(item);
            }
        } else if (/toxin:\s*$/.test(linePrefix)) {
            for (const [label, desc] of [
                ['CcdB', '☠️ CcdB — envenena DNA girasa (IC₅₀ ≈ 5nM)'],
                ['MazF', '☠️ MazF — endoribonucleasa (corta mRNA en ACA)'],
                ['RelE', '☠️ RelE — ribosome-dependent mRNA cleavage'],
                ['ParE', '☠️ ParE — inhibe DNA girasa (similar a CcdB)'],
            ]) {
                const item = new vscode.CompletionItem(label, vscode.CompletionItemKind.EnumMember);
                item.detail = desc;
                items.push(item);
            }
        } else if (/antitoxin:\s*$/.test(linePrefix)) {
            for (const [label, desc] of [
                ['CcdA', '🛡️ CcdA — neutraliza CcdB (vida media ~30 min)'],
                ['MazE', '🛡️ MazE — neutraliza MazF (degradada por ClpAP)'],
                ['RelB', '🛡️ RelB — neutraliza RelE'],
                ['ParD', '🛡️ ParD — neutraliza ParE'],
            ]) {
                const item = new vscode.CompletionItem(label, vscode.CompletionItemKind.EnumMember);
                item.detail = desc;
                items.push(item);
            }
        } else {
            // General kill_switch fields
            for (const [label, snippet, desc] of [
                ['trigger', 'trigger: ${1|absence(IPTG),absence(arabinose),temperature(42C)|},', '⚡ Condición que activa la toxina'],
                ['toxin', 'toxin: ${1|CcdB,MazF,RelE|},', '☠️ Proteína letal'],
                ['antitoxin', 'antitoxin: ${1|CcdA,MazE,RelB|},', '🛡️ Proteína protectora'],
                ['delay', 'delay: ${1:2hr}', '⏱️ Retardo antes de activación'],
            ] as [string, string, string][]) {
                const item = new vscode.CompletionItem(label, vscode.CompletionItemKind.Property);
                item.insertText = new vscode.SnippetString(snippet);
                item.detail = desc;
                items.push(item);
            }
        }

        return items;
    }

    private getTopLevelCompletions(): vscode.CompletionItem[] {
        const items: vscode.CompletionItem[] = [];

        // Circuit
        const circuitSnippet = new vscode.CompletionItem('circuit', vscode.CompletionItemKind.Class);
        circuitSnippet.insertText = new vscode.SnippetString('circuit ${1:Name} {\n\t// TU1\n\tpromoter ${2|pLac,pTet,pBAD,pConst|};\n\trbs: ${3|B0034,B0032|};\n\tgene ${4:name}: Protein = ${5|GFP,RFP|};\n\tterminator: ${6|B0015,B0010|};\n\n\t${0}\n}');
        circuitSnippet.detail = '🧬 Definir circuito genético';
        circuitSnippet.documentation = new vscode.MarkdownString('Contenedor principal. Define un circuito genético completo con:\n- Unidades transcripcionales (promotor → RBS → gen → terminador)\n- Conexiones regulatorias (→ activación, ~> represión)\n- Sistema de seguridad (kill_switch)');
        circuitSnippet.sortText = '00';
        items.push(circuitSnippet);

        // Host
        const hostSnippet = new vscode.CompletionItem('host', vscode.CompletionItemKind.Module);
        hostSnippet.insertText = new vscode.SnippetString('host ${1|ecoli_k12,ecoli_dh5alpha,ecoli_bl21,yeast_s288c,bacillus_subtilis_168|};');
        hostSnippet.detail = '🦠 Declarar organismo chassis';
        hostSnippet.documentation = new vscode.MarkdownString('Define el organismo donde se expresará el circuito.\nDetermina el nivel BSL, codones óptimos, y restricciones de seguridad.');
        hostSnippet.sortText = '01';
        items.push(hostSnippet);

        // Rule
        const ruleSnippet = new vscode.CompletionItem('rule', vscode.CompletionItemKind.Interface);
        ruleSnippet.insertText = new vscode.SnippetString('rule ${1:Name}: ${2:constraint};');
        ruleSnippet.detail = '📏 Definir regla o constraint';
        ruleSnippet.documentation = new vscode.MarkdownString('Define una regla lógica o restricción de diseño.\n\nEjemplo: `rule NoOverlap: gene1.promoter != gene2.promoter;`');
        ruleSnippet.sortText = '02';
        items.push(ruleSnippet);

        // Gene (top-level)
        const geneTop = new vscode.CompletionItem('gene', vscode.CompletionItemKind.Function);
        geneTop.insertText = new vscode.SnippetString('gene ${1:name}: Protein = ${2|GFP,RFP,LacI,TetR|};');
        geneTop.detail = '🧬 Declarar gen standalone';
        geneTop.sortText = '03';
        items.push(geneTop);

        // Repressilator template
        const repSnippet = new vscode.CompletionItem('repressilator', vscode.CompletionItemKind.Snippet);
        repSnippet.insertText = new vscode.SnippetString(
            'circuit Repressilator {\n\t// TU1: LacI\n\tpromoter pCI;\n\trbs: B0034;\n\tgene lacI: Protein = LacI;\n\tterminator: B0015;\n\n\t// TU2: TetR\n\tpromoter pLac;\n\trbs: B0034;\n\tgene tetR: Protein = TetR;\n\tterminator: B0015;\n\n\t// TU3: CI\n\tpromoter pTet;\n\trbs: B0034;\n\tgene cI: Protein = CI;\n\tterminator: B0015;\n\n\t// Represión mutua\n\tLacI ~> pTet;\n\tTetR ~> pCI;\n\tCI ~> pLac;\n}'
        );
        repSnippet.detail = '🔄 Repressilator (Elowitz & Leibler 2000)';
        repSnippet.documentation = new vscode.MarkdownString('Oscilador genético de 3 represores. El circuito más famoso de biología sintética.\n\nRef: Elowitz MB & Leibler S (2000) Nature 403:335-338');
        repSnippet.sortText = '10';
        items.push(repSnippet);

        // Toggle Switch template
        const toggleSnippet = new vscode.CompletionItem('toggle_switch', vscode.CompletionItemKind.Snippet);
        toggleSnippet.insertText = new vscode.SnippetString(
            'circuit ToggleSwitch {\n\t// TU1: LacI\n\tpromoter pTet;\n\trbs: B0034;\n\tgene lacI: Protein = LacI;\n\tterminator: B0015;\n\n\t// TU2: TetR\n\tpromoter pLac;\n\trbs: B0034;\n\tgene tetR: Protein = TetR;\n\tterminator: B0015;\n\n\t// Inhibición mutua\n\tLacI ~> pTet;\n\tTetR ~> pLac;\n}'
        );
        toggleSnippet.detail = '🔀 Toggle Switch (Gardner et al. 2000)';
        toggleSnippet.documentation = new vscode.MarkdownString('Switch bistable con dos estados estables. Memoria biológica.\n\nRef: Gardner TS et al. (2000) Nature 403:339-342');
        toggleSnippet.sortText = '11';
        items.push(toggleSnippet);

        return items;
    }

    /**
     * Determina si la posición está dentro de un bloque { } de un tipo dado
     */
    private isInsideBlock(document: vscode.TextDocument, position: vscode.Position, blockType: string): boolean {
        let depth = 0;
        let foundBlock = false;

        for (let i = position.line; i >= 0; i--) {
            const lineText = document.lineAt(i).text;
            // Count braces on this line (up to cursor position on current line)
            const text = i === position.line
                ? lineText.substring(0, position.character)
                : lineText;

            for (let j = text.length - 1; j >= 0; j--) {
                if (text[j] === '}') { depth++; }
                if (text[j] === '{') {
                    depth--;
                    if (depth < 0) {
                        // We found our enclosing '{'
                        // Check if this line (or previous lines) has the blockType keyword
                        const blockLine = lineText;
                        if (new RegExp(`\\b${blockType}\\b`).test(blockLine)) {
                            return true;
                        }
                        // Check previous line too (block keyword might be on different line)
                        if (i > 0) {
                            const prevLine = document.lineAt(i - 1).text;
                            if (new RegExp(`\\b${blockType}\\b`).test(prevLine)) {
                                return true;
                            }
                        }
                        // It's inside SOME block but not the one we want
                        // If blockType is 'circuit', any enclosing block counts since kill_switch is inside circuit
                        if (blockType === 'circuit') {
                            foundBlock = true;
                            depth = 0; // reset and keep searching outward
                            continue;
                        }
                        return false;
                    }
                }
            }
        }

        return foundBlock;
    }
}

// ════════════════════════════════════════════════════════════════════════════
// REGISTRATION
// ════════════════════════════════════════════════════════════════════════════

export function registerBioScriptCompletion(context: vscode.ExtensionContext): void {
    const provider = new BioScriptCompletionProvider();

    context.subscriptions.push(
        vscode.languages.registerCompletionItemProvider(
            { language: 'bioscript', scheme: 'file' },
            provider,
            ':', ' ', '='  // trigger characters
        ),
        vscode.languages.registerCompletionItemProvider(
            { language: 'bioscript', scheme: 'untitled' },
            provider,
            ':', ' ', '='
        )
    );

    console.log('🧬 SynBio-LLVM: CompletionProvider registrado — autocompletado biológico contextual');
}
