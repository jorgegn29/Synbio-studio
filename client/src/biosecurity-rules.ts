/**
 * Keyword biosecurity rules shared by the VS Code scanner and the command-line example.
 * This is a substring search over the design text. It does not align sequences to a pathogen database.
 */
/** Nivel de amenaza */
export type ThreatLevel = 'critical' | 'high' | 'medium' | 'low' | 'info';

/** Resultado de un hallazgo */
export interface BiosecurityFinding {
    id: string;
    title: string;
    category: string;
    threat: ThreatLevel;
    description: string;
    location: string;
    recommendation: string;
    regulation: string;
    matchedSequence?: string;
}

/** Regla de detección */
export interface DetectionRule {
    id: string;
    name: string;
    category: string;
    threat: ThreatLevel;
    patterns: string[];       // DNA motifs o keywords
    description: string;
    recommendation: string;
    regulation: string;       // e.g., "Dual Use Research of Concern (DURC)"
}

/** Base de datos de reglas de bioseguridad */
export const BIOSECURITY_RULES: DetectionRule[] = [
    // ===== TOXINAS BACTERIANAS =====
    { id: 'TOX001', name: 'Toxina CcdB', category: 'Toxin Gene', threat: 'high', patterns: ['ccdb', 'ccdB', 'CcdB'], description: 'CcdB es un inhibidor de girasa. Letal para E. coli sin antitoxina CcdA. Usado en kill switches pero requiere supervisión.', recommendation: 'Asegurar que el sistema incluya el antitoxina CcdA como medida de seguridad.', regulation: 'NIH Guidelines Section III-E (Apr 2024); IBC Review required per Section IV-B-7' },
    { id: 'TOX002', name: 'Toxina MazF', category: 'Toxin Gene', threat: 'high', patterns: ['mazf', 'mazF', 'MazF'], description: 'MazF es una endorribonucleasa que degrada mRNA. Componente del sistema toxin-antitoxin MazEF.', recommendation: 'Incluir MazE (antitoxina) en el mismo circuito. Verificar expresión controlada.', regulation: 'NIH Guidelines Section III-E (Apr 2024); IBC protocol per IV-B-7; iGEM Safety White List' },
    { id: 'TOX003', name: 'Holina (Lisis)', category: 'Toxin Gene', threat: 'high', patterns: ['holin', 'holina', 'Holin'], description: 'Las holinas forman poros en la membrana interna, causando lisis celular. Usadas en kill switches y liberación de cargo.', recommendation: 'Usar bajo promotor estrictamente regulado. No combinar con genes de resistencia a antibióticos.', regulation: 'NIH Guidelines Section III-D-1 (Apr 2024); EU Dir 2001/18/EC Annex II risk assessment' },
    { id: 'TOX004', name: 'Toxina Diftérica', category: 'Select Agent', threat: 'critical', patterns: ['diphtheria', 'difteria', 'DTA', 'dtA', 'diphtheria_toxin'], description: 'La toxina diftérica es un agente selecto. Su síntesis está estrictamente regulada.', recommendation: 'PROHIBIDO sin autorización del FSAP (Federal Select Agent Program). Requiere BSL-3.', regulation: 'US Select Agent Rule 42 CFR §73.3; WHO BSM 4th Ed Ch.2; NSABB DURC Policy; AU Gene Technology Regulations 2001 Schedule 3' },
    { id: 'TOX005', name: 'Toxina Botulínica', category: 'Select Agent', threat: 'critical', patterns: ['botulinum', 'botulinica', 'BoNT', 'botulinum_toxin'], description: 'Neurotoxina extremadamente potente. Agente de bioterrorismo categoría A del CDC.', recommendation: 'PROHIBIDO. Requiere autorización federal y BSL-3+.', regulation: 'US Select Agent Rule 42 CFR §73.3; CDC Category A Agent; Cartagena Protocol Art.3(h); AU Gene Technology Act 2000 §10' },
    { id: 'TOX006', name: 'Ricina', category: 'Select Agent', threat: 'critical', patterns: ['ricin', 'ricina', 'RTA', 'RTB', 'ricin_toxin'], description: 'Toxina de Ricinus communis. Categoría B de bioterrorismo. Listada en 42 CFR §73.3(b).', recommendation: 'PROHIBIDO sin autorización del CDC/USDA Select Agent Program.', regulation: 'US Select Agent Rule 42 CFR §73.3(b); 7 CFR §331.3; CDC Category B Agent; Chemical Weapons Convention Schedule 1' },

    // ===== RESISTENCIA A ANTIBIÓTICOS =====
    { id: 'ABR001', name: 'Resistencia a Ampicilina (AmpR)', category: 'Antibiotic Resistance', threat: 'medium', patterns: ['ampR', 'AmpR', 'bla', 'ampicillin_resistance', 'beta_lactamase'], description: 'Gen de β-lactamasa confiere resistencia a ampicilina. Muy común en plásmidos de clonación.', recommendation: 'Aceptable para investigación contenida (BSL-1/2). Considerar alternativas (KanR) para aplicaciones ambientales.', regulation: 'NIH Guidelines Appendix C-VI (Apr 2024); EU Dir 2001/18/EC Art.4(2) antibiotic resistance markers; WHO AMR Global Action Plan' },
    { id: 'ABR002', name: 'Resistencia a Kanamicina (KanR)', category: 'Antibiotic Resistance', threat: 'low', patterns: ['kanR', 'KanR', 'kanamycin_resistance', 'nptII', 'aphA'], description: 'Gen de aminoglicósido fosfotransferasa (nptII). Preferido sobre AmpR para aplicaciones de campo. EFSA GMO Panel lo considera seguro.', recommendation: 'Aceptable para mayoría de aplicaciones. Documentar uso y contención.', regulation: 'NIH Guidelines Appendix C-VI (Apr 2024); EU Dir 2001/18/EC Annex II; EFSA J. 2009;7(1):1034' },
    { id: 'ABR003', name: 'Resistencia a Cloranfenicol (CmR)', category: 'Antibiotic Resistance', threat: 'medium', patterns: ['cmR', 'CmR', 'chloramphenicol_resistance', 'cat'], description: 'Gen de cloranfenicol acetiltransferasa. Cloranfenicol es WHO Essential Medicine.', recommendation: 'Uso aceptable en laboratorio. Evitar en aplicaciones de liberación al ambiente.', regulation: 'NIH Guidelines Appendix C-VI (Apr 2024); EU Dir 2001/18/EC Art.4(2); WHO Essential Medicines List 2023' },
    { id: 'ABR004', name: 'Resistencia a Vancomicina', category: 'Antibiotic Resistance', threat: 'high', patterns: ['vanA', 'vanB', 'vancomycin_resistance'], description: 'Resistencia a vancomicina (antibiótico de último recurso). Transferencia horizontal demostrada.', recommendation: 'EVITAR. Requiere justificación científica sólida y aprobación IBC.', regulation: 'NIH Guidelines Section III-A-1 (Apr 2024); WHO Priority Pathogens 2024 (Critical); EU Dir 2001/18/EC Art.4(2)' },
    { id: 'ABR005', name: 'Resistencia Multi-droga', category: 'Antibiotic Resistance', threat: 'high', patterns: ['mcr-1', 'NDM-1', 'KPC', 'multi_drug_resistance'], description: 'Genes de resistencia múltiple a antibióticos. mcr-1: colistina (último recurso). NDM-1: carbapenems.', recommendation: 'PROHIBIDO en circuitos sintéticos. Solo en contextos diagnósticos autorizados.', regulation: 'WHO Priority Pathogens List 2024; NSABB DURC Framework; NIH Guidelines Section III-A (Apr 2024); EU Decision 2013/652/EU AMR monitoring' },

    // ===== FACTORES DE VIRULENCIA =====
    { id: 'VIR001', name: 'Genes de Invasina', category: 'Virulence Factor', threat: 'high', patterns: ['inv', 'invasin', 'invasina', 'invA'], description: 'Genes de invasina permiten penetración de células eucariotas. invA de Yersinia pseudotuberculosis. Usado en terapia con bacterias.', recommendation: 'Requiere aprobación IBC y contención BSL-2.', regulation: 'NIH Guidelines Section III-D-1 (Apr 2024); IBC Review per Section IV-B-7; EU Dir 2009/41/EC (contained use of GMMs)' },
    { id: 'VIR002', name: 'Hemolisina', category: 'Virulence Factor', threat: 'high', patterns: ['hlyA', 'hemolisina', 'hemolysin'], description: 'α-hemolisina (HlyA) de E. coli. Citolisina formadora de poros. Factor de virulencia clave en UPEC.', recommendation: 'Requiere justificación científica, contención BSL-2+.', regulation: 'NIH Guidelines Section III-A-1 (Apr 2024); WHO BSM 4th Ed Risk Group 2; EU Dir 2000/54/EC biological agents at work' },
    { id: 'VIR003', name: 'Sistema de Secreción Tipo III', category: 'Virulence Factor', threat: 'high', patterns: ['T3SS', 'type_III_secretion', 'secrecion_tipo_III', 'syringe'], description: 'T3SS: "inyectisoma" molecular. Inyecta efectores en células eucariotas. Presente en Salmonella, Shigella, Yersinia, Pseudomonas.', recommendation: 'Solo con aprobación IBC y supervisión de bioseguridad. Requiere ERA completa.', regulation: 'NIH Guidelines Section III-A (Apr 2024); NSABB DURC Policy (pathogen enhancement); EU Dir 2001/18/EC Annex II ERA' },

    // ===== PATÓGENOS =====
    { id: 'PATH001', name: 'Secuencias de Ántrax', category: 'Select Agent', threat: 'critical', patterns: ['anthrax', 'bacillus_anthracis', 'pagA', 'lef', 'cya_anthrax'], description: 'Genes del factor letal de B. anthracis: PA (pagA), LF (lef), EF (cya). Agente selecto Tier 1.', recommendation: 'PROHIBIDO. Requiere registro FSAP, autorización BSO, instalación BSL-3 registrada.', regulation: 'US Select Agent Rule 42 CFR §73.3(a) Tier 1; 7 CFR §331.3; CDC Category A; Cartagena Protocol Annex III; AU Gene Technology Regulations 2001 Schedule 3 Part 2' },
    { id: 'PATH002', name: 'Secuencias de Viruela', category: 'Select Agent', threat: 'critical', patterns: ['variola', 'smallpox', 'viruela'], description: 'Variola virus. Solo existen 2 repositorios autorizados: CDC (Atlanta) y VECTOR (Novosibirsk). Erradicada 1980.', recommendation: 'PROHIBIDO. WHO Resolution WHA60.1 prohíbe toda síntesis/retención no autorizada.', regulation: 'WHO IHR (2005) Art.44; WHA Resolution 60.1 (2007); US Select Agent Rule 42 CFR §73.3(a) Tier 1; Biological Weapons Convention Art.I' },
    { id: 'PATH003', name: 'Secuencias de Ébola', category: 'Select Agent', threat: 'critical', patterns: ['ebola', 'ebolavirus', 'filovirus', 'VP40_ebola'], description: 'Ebolavirus (Filoviridae). WHO Risk Group 4. Requiere BSL-4 máxima contención. VP40: proteína de matriz esencial.', recommendation: 'PROHIBIDO sin autorización federal específica. BSL-4 requerido.', regulation: 'US Select Agent Rule 42 CFR §73.3(a) Tier 1; WHO BSM 4th Ed Risk Group 4; CDC Category A; EU Dir 2000/54/EC Group 4; AU Gene Technology Act 2000 §10' },

    // ===== SISTEMAS DE TRANSFERENCIA =====
    { id: 'TRF001', name: 'Origen de Transferencia (oriT)', category: 'Horizontal Transfer', threat: 'medium', patterns: ['oriT', 'origin_of_transfer', 'mob', 'tra_genes'], description: 'oriT permite transferencia conjugativa horizontal. Riesgo de propagación no controlada de constructos al ambiente.', recommendation: 'Eliminar oriT de constructos finales. Usar plásmidos no-mobilizables (pSB1C3 de iGEM carece de oriT).', regulation: 'NIH Guidelines Appendix C-I-A (Apr 2024) host-vector systems; EU Dir 2001/18/EC Annex II §D.2 HGT assessment; Cartagena Protocol Art.15-16 risk assessment' },
    { id: 'TRF002', name: 'Sitios de Integración', category: 'Horizontal Transfer', threat: 'medium', patterns: ['integrase', 'integrasa', 'attP', 'attB', 'phiC31', 'Bxb1'], description: 'Integrasas (φC31, Bxb1) y sitios att permiten integración genómica. Irreversible sin excisionasa. Persistencia ambiental.', recommendation: 'Documentar sitio target. Incluir en evaluación de riesgo ambiental (ERA). Considerar excisionasa para reversibilidad.', regulation: 'NIH Guidelines Appendix C-III (Apr 2024); EU Dir 2001/18/EC Annex II §D.1 persistence; AU Gene Technology Regulations 2001 §10(2) ERA requirements' },

    // ===== BIOSEGURIDAD GENERAL =====
    { id: 'GEN001', name: 'Sin Kill Switch', category: 'Safety Mechanism', threat: 'medium', patterns: ['/* no_kill_switch */'], description: 'Circuito sin mecanismo de apagado de emergencia (fail-safe).', recommendation: 'Implementar kill switch (CcdB/CcdA, MazEF, o toxin-antitoxin). Esencial para aplicaciones in vivo y liberación.', regulation: 'iGEM Safety Policies 2024; NIH Guidelines Section III-D (Apr 2024) containment; EU Dir 2001/18/EC Art.4(1) precautionary principle; Cartagena Protocol Art.10(6) precaution' },
    { id: 'GEN002', name: 'Auxotrofía no Implementada', category: 'Safety Mechanism', threat: 'low', patterns: ['/* no_auxotrophy */'], description: 'Sin dependencia de nutrientes esenciales para contención biológica. Ej: thyA⁻ requiere timidina, dapA⁻ requiere DAP.', recommendation: 'Implementar auxotrofías (thyA, dapA, trpC) como capa adicional de bioseguridad para GE0 (liberación al ambiente).', regulation: 'NIH Guidelines Appendix C-I (Apr 2024) biological containment; EU Dir 2001/18/EC Annex II §D.4 survival measures; AU Gene Technology Regulations 2001 Schedule 1' },
];



/**
 * Keyword scan used by the biosecurity panel.
 *
 * Matches are case-insensitive substrings of the source text, not sequence homology.
 * A design longer than 50 characters with no kill-switch wording also gets STRUCT-001.
 */
export function scanBiosecurityText(content: string, filename = "design.bio"): BiosecurityFinding[] {
    const findings: BiosecurityFinding[] = [];
    const lowerContent = content.toLowerCase();
    const lines = content.split("\n");

    for (const rule of BIOSECURITY_RULES) {
        for (const pattern of rule.patterns) {
            const lowerPattern = pattern.toLowerCase();
            let searchIndex = 0;
            while (searchIndex < lowerContent.length) {
                const idx = lowerContent.indexOf(lowerPattern, searchIndex);
                if (idx === -1) break;
                searchIndex = idx + 1;

                let lineNum = 0;
                let charCount = 0;
                for (let i = 0; i < lines.length; i++) {
                    charCount += lines[i].length + 1;
                    if (charCount > idx) { lineNum = i + 1; break; }
                }

                const contextStart = Math.max(0, idx - 20);
                const contextEnd = Math.min(content.length, idx + pattern.length + 20);
                const matchedSequence = content.substring(contextStart, contextEnd);

                findings.push({
                    id: `${rule.id}-L${lineNum}`,
                    title: rule.name,
                    category: rule.category,
                    threat: rule.threat,
                    description: rule.description,
                    location: `${filename}:${lineNum}`,
                    recommendation: rule.recommendation,
                    regulation: rule.regulation,
                    matchedSequence
                });
            }
        }
    }

    if (!lowerContent.includes("kill_switch") && !lowerContent.includes("killswitch") && !lowerContent.includes("kill switch") && content.length > 50) {
        findings.push({
            id: "STRUCT-001",
            title: "Kill Switch No Detectado",
            category: "Safety Mechanism",
            threat: "medium",
            description: "No se detectó un mecanismo de kill switch en el circuito.",
            location: filename,
            recommendation: "Implementar un sistema de apagado de emergencia (toxin-antitoxin, essentialase knockout, etc.)",
            regulation: "iGEM Safety, NIH Best Practices"
        });
    }

    const seen = new Set<string>();
    return findings.filter(f => {
        const key = `${f.id}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
}
