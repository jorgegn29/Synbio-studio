/**
 * SynBio-LLVM - Exportador Profesional
 * Genera y previsualiza SBOL 3.0, FASTA, GenBank desde código BioScript
 * Exporta archivos reales listos para herramientas de laboratorio
 */

import * as vscode from 'vscode';

/** Parte genética extraída del editor */
interface GeneticPart {
    type: 'promoter' | 'rbs' | 'cds' | 'terminator' | 'gene' | 'protein' | 'circuit';
    id: string;
    name: string;
    sequence: string;
    aminoSequence?: string;
    attributes: Record<string, string>;
    registryId?: string;
}

/** Circuito extraído del editor */
interface ParsedCircuit {
    name: string;
    parts: GeneticPart[];
    connections: { from: string; to: string; type: string }[];
    metadata: Record<string, string>;
}

/** Formato de exportación */
type ExportFormat = 'sbol' | 'fasta' | 'genbank' | 'csv';

export class ProfessionalExporter implements vscode.Disposable {
    private panel: vscode.WebviewPanel | undefined;
    private context: vscode.ExtensionContext;
    private disposables: vscode.Disposable[] = [];

    constructor(context: vscode.ExtensionContext) {
        this.context = context;
    }

    async show(): Promise<void> {
        if (this.panel) { this.panel.reveal(); return; }

        this.panel = vscode.window.createWebviewPanel(
            'synbioExporter',
            '📦 Exportador Profesional',
            vscode.ViewColumn.Two,
            { enableScripts: true, retainContextWhenHidden: true }
        );

        this.panel.webview.html = this.getWebviewHTML();

        this.panel.webview.onDidReceiveMessage(async (msg) => {
            switch (msg.command) {
                case 'parseEditor':
                    await this.parseEditorContent();
                    break;
                case 'export':
                    await this.exportToFile(msg.format, msg.content, msg.filename);
                    break;
                case 'preview':
                    this.generatePreview(msg.format, msg.circuit);
                    break;
                case 'copyToClipboard':
                    await vscode.env.clipboard.writeText(msg.content);
                    vscode.window.showInformationMessage('Contenido copiado al portapapeles');
                    break;
            }
        }, undefined, this.disposables);

        this.panel.onDidDispose(() => { this.panel = undefined; }, null, this.disposables);

        // Auto-parsear el editor activo
        await this.parseEditorContent();
    }

    /** Parsea contenido BioScript del editor activo */
    private async parseEditorContent(): Promise<void> {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            this.panel?.webview.postMessage({ command: 'parsed', circuit: null, error: 'No hay editor activo' });
            return;
        }

        const text = editor.document.getText();
        const circuit = this.parseBioScript(text, editor.document.fileName);

        this.panel?.webview.postMessage({ command: 'parsed', circuit });
    }

    /** Parser simplificado de BioScript a partes genéticas */
    private parseBioScript(code: string, fileName: string): ParsedCircuit {
        const parts: GeneticPart[] = [];
        const connections: { from: string; to: string; type: string }[] = [];
        const metadata: Record<string, string> = {};

        let circuitName = 'MyCircuit';

        // Extraer nombre del circuito
        const circuitMatch = code.match(/circuit\s+(\w+)/i);
        if (circuitMatch) { circuitName = circuitMatch[1]; }

        // Extraer metadata
        const authorMatch = code.match(/@author\s+(.+)/i);
        if (authorMatch) { metadata.author = authorMatch[1].trim(); }
        const versionMatch = code.match(/@version\s+(.+)/i);
        if (versionMatch) { metadata.version = versionMatch[1].trim(); }
        const descMatch = code.match(/@description\s+(.+)/i) || code.match(/\/\/\s*(.+)/);
        if (descMatch) { metadata.description = descMatch[1].trim(); }

        // Extraer promotores
        const promoterRegex = /promoter\s+(\w+)\s*\{([^}]*)\}/gi;
        let match;
        while ((match = promoterRegex.exec(code)) !== null) {
            const name = match[1];
            const body = match[2];
            const seq = this.extractAttribute(body, 'sequence') || this.getDefaultSequence('promoter', name);
            const strength = this.extractAttribute(body, 'strength') || '0.7';
            parts.push({
                type: 'promoter', id: `prom_${name}`, name,
                sequence: seq.toUpperCase(),
                attributes: { strength, regulation: this.extractAttribute(body, 'regulation') || 'constitutive' },
                registryId: this.extractAttribute(body, 'registry') || this.guessRegistryId('promoter', name),
            });
        }

        // Extraer genes/proteínas
        const geneRegex = /gene\s+(\w+)\s*\{([^}]*)\}/gi;
        while ((match = geneRegex.exec(code)) !== null) {
            const name = match[1];
            const body = match[2];
            const dnaSeq = this.extractAttribute(body, 'sequence') || this.getDefaultSequence('gene', name);
            const aaSeq = this.extractAttribute(body, 'protein') || this.extractAttribute(body, 'amino') || '';
            parts.push({
                type: 'gene', id: `gene_${name}`, name,
                sequence: dnaSeq.toUpperCase(),
                aminoSequence: aaSeq.toUpperCase(),
                attributes: { function: this.extractAttribute(body, 'function') || 'unknown' },
                registryId: this.extractAttribute(body, 'registry'),
            });
        }

        // Extraer RBS
        const rbsRegex = /rbs\s+(\w+)\s*\{([^}]*)\}/gi;
        while ((match = rbsRegex.exec(code)) !== null) {
            const name = match[1];
            const body = match[2];
            parts.push({
                type: 'rbs', id: `rbs_${name}`, name,
                sequence: (this.extractAttribute(body, 'sequence') || 'AAAGAGGAGAAA').toUpperCase(),
                attributes: { strength: this.extractAttribute(body, 'strength') || '0.5' },
                registryId: this.extractAttribute(body, 'registry') || this.guessRegistryId('rbs', name),
            });
        }

        // Extraer terminadores
        const termRegex = /terminator\s+(\w+)\s*\{([^}]*)\}/gi;
        while ((match = termRegex.exec(code)) !== null) {
            const name = match[1];
            const body = match[2];
            parts.push({
                type: 'terminator', id: `term_${name}`, name,
                sequence: (this.extractAttribute(body, 'sequence') || this.getDefaultSequence('terminator', name)).toUpperCase(),
                attributes: { efficiency: this.extractAttribute(body, 'efficiency') || '0.95' },
                registryId: this.extractAttribute(body, 'registry') || this.guessRegistryId('terminator', name),
            });
        }

        // Extraer conexiones regulatorias
        const connRegex = /(\w+)\s*->\s*(\w+)\s*:\s*(activates?|represses?|produces?)/gi;
        while ((match = connRegex.exec(code)) !== null) {
            connections.push({ from: match[1], to: match[2], type: match[3].toLowerCase() });
        }

        // Si no se parsearon partes, generar demo
        if (parts.length === 0) {
            return this.getDemoCircuit();
        }

        metadata.source = fileName;
        metadata.generated = new Date().toISOString();

        return { name: circuitName, parts, connections, metadata };
    }

    private extractAttribute(body: string, attr: string): string {
        const match = body.match(new RegExp(`${attr}\\s*[:=]\\s*"?([^"\\n,}]+)"?`, 'i'));
        return match ? match[1].trim() : '';
    }

    private getDefaultSequence(type: string, name: string): string {
        const defaults: Record<string, Record<string, string>> = {
            promoter: {
                pLac: 'AATTGTGAGCGGATAACAATTGACATTGTGAGCGGATAACAAGATACTGAGCACATCAGCAGGACGCACTGACC',
                pTet: 'TCCCTATCAGTGATAGAGATTGACATCCCTATCAGTGATAGAGATACTGAGCAC',
                pBAD: 'ACATTGATTATTTGCACGGCGTCACACTTTGCTATGCCATAGCATTTTTATCC',
                pT7: 'TAATACGACTCACTATAGGGAGA',
                pConst: 'TTGACAATTAATCATCGGCTCGTATAATGTGTGGAATTGTGAGCG',
            },
            gene: {
                GFP: 'ATGGTGAGCAAGGGCGAGGAGCTGTTCACCGGGGTGGTGCCCATCCTGGTCGAGCTGGACGGCGACGTAAACGGCCACAAGTTCAGCGTGTCCGGCGAGGGCGAGGGCGATGCCACCTACGGCAAGCTGACCCTGAAGTTCATCTGCACCACCGGCAAGCTGCCCGTGCCCTGGCCCACCCTCGTGACCACCCTGACCTACGGCGTGCAGTGCTTCAGCCGCTACCCCGACCACATGAAGCAGCACGACTTCTTCAAGTCCGCCATGCCCGAAGGCTACGTCCAGGAGCGCACCATCTTCTTCAAGGACGACGGCAACTACAAGACCCGCGCCGAGGTGAAGTTCGAGGGCGACACCCTGGTGAACCGCATCGAGCTGAAGGGCATCGACTTCAAGGAGGACGGCAACATCCTGGGGCACAAGCTGGAGTACAACTACAACAGCCACAACGTCTATATCATGGCCGACAAGCAGAAGAACGGCATCAAGGTGAACTTCAAGATCCGCCACAACATCGAGGACGGCAGCGTGCAGCTCGCCGACCACTACCAGCAGAACACCCCCATCGGCGACGGCCCCGTGCTGCTGCCCGACAACCACTACCTGAGCACCCAGTCCGCCCTGAGCAAAGACCCCAACGAGAAGCGCGATCACATGGTCCTGCTGGAGTTCGTGACCGCCGCCGGGATCACTCTCGGCATGGACGAGCTGTACAAGTAA',
                LacI: 'ATGAAACCAGTAACGTTATACGATGTCGCAGAGTATGCCGGTGTCTCTTATCAGACCGTTTCCCGCGTGGTGAACCAGGCCAGCCACGTTTCTGCGAAAACGCGGGAAAAAGTGGAAGCGGCGATGGCGGAGCTGAATTACATTCCCAACCGCGTGGCACAACAACTGGCGGGCAAACAGTCGTTGCTGATTGGCGTTGCCACCTCCAGTCTGGCCCTGCACGCGCCGTCGCAAATTGTCGCGGCGATTAAATCTCGCGCCGATCAACTGGGTGCCAGCGTGGTGGTGTCGATGGTAGAACGAAGCGGCGTCGAAGCCTGTAAAGCGGCGGTGCACAATCTTCTCGCGCAACGCGTCAGTGGGCTGATCATTAACTATCCGCTGGATGACCAGGATGCCATTGCTGTGGAAGCTGCCTGCACTAATGTTCCGGCGTTATTTCTTGATGTCTCTGACCAGACACCCATCAACAGTATTATTTTCTCCCATGAAGACGGTACGCGACTGGGCGTGGAGCATCTGGTCGCATTGGGTCACCAGCAAATCGCGCTGTTAGCGGGCCCATTAAGTTCTGTCTCGGCGCGTCTGCGTCTGGCTGGCTGGCATAAATATCTCACTCGCAATCAAATTCAGCCGATAGCGGAACGGGAAGGCGACTGGAGTGCCATGTCCGGTTTTCAACAAACCATGCAAATGCTGAATGAGGGCATCGTTCCCACTGCGATGCTGGTTGCCAACGATCAGATGGCGCTGGGCGCAATGCGCGCCATTACCGAGTCCGGGCTGCGCGTTGGTGCGGATATCTCGGTAGTGGGATAA',
                TetR: 'ATGTCTAGATTAGATAAAAGTAAAGTGATTAACAGCGCATTAGAGCTGCTTAATGAGGTCGGAATCGAAGGTTTAACAACCCGTAAACTCGCCCAGAAGCTAGGTGTAGAGCAGCCTACATTGTATTGGCATGTAAAAAATAAGCGGGCTTTGCTCGACGCCTTAGCCATTGAGATGTTAGATAGGCACCATACTCACTTTTGCCCTTTAGAAGGGGAAAGCTGGCAAGATTTTTTACGTAATAACGCTAAAAGT',
                default: 'ATGACCATGATTACGCCAAGCTTTGCAAAAATCAATAAACAGCTGACGGAAATTCAGACCAATCTACGCATTAGCGAACGGAATACGGATCCGG',
            },
            terminator: {
                T1: 'CCAGGCATCAAATAAAACGAAAGGCTCAGTCGAAAGACTGGGCCTTTCGTTTTATCTGTTGTTTGTCGGTGAACGCTCTC',
                rrnB: 'AGAAGGCCATCCTGACGGATGGCCTTTTTGCGTTTCTACAAACTCTTTTGTTTATT',
                default: 'TTCGTTTTATCTGTTGTTTGTCGGTGAAC',
            },
        };

        return defaults[type]?.[name] || defaults[type]?.default || 'ATGCATGC';
    }

    private guessRegistryId(type: string, name: string): string {
        const registry: Record<string, Record<string, string>> = {
            promoter: { pLac: 'BBa_R0010', pTet: 'BBa_R0040', pBAD: 'BBa_I0500', pT7: 'BBa_I712074', pConst: 'BBa_J23100' },
            rbs: { strong: 'BBa_B0034', medium: 'BBa_B0032', weak: 'BBa_B0031' },
            terminator: { T1: 'BBa_B0010', rrnB: 'BBa_B0012' },
        };
        return registry[type]?.[name] || '';
    }

    private getDemoCircuit(): ParsedCircuit {
        return {
            name: 'Repressilator_Demo',
            parts: [
                { type: 'promoter', id: 'prom_pLac', name: 'pLac', sequence: this.getDefaultSequence('promoter', 'pLac'), attributes: { strength: '0.7', regulation: 'inducible' }, registryId: 'BBa_R0010' },
                { type: 'rbs', id: 'rbs_1', name: 'RBS_B0034', sequence: 'AAAGAGGAGAAA', attributes: { strength: '1.0' }, registryId: 'BBa_B0034' },
                { type: 'gene', id: 'gene_TetR', name: 'TetR', sequence: this.getDefaultSequence('gene', 'TetR'), aminoSequence: 'MSRLDKSKVINALELLLNVVGIEGLTTRKLAQQLAGQCPTYLWHCKNKRALLDALAIEMLDRHHT', attributes: { function: 'repressor' } },
                { type: 'terminator', id: 'term_T1', name: 'T1', sequence: this.getDefaultSequence('terminator', 'T1'), attributes: { efficiency: '0.99' }, registryId: 'BBa_B0010' },
                { type: 'promoter', id: 'prom_pTet', name: 'pTet', sequence: this.getDefaultSequence('promoter', 'pTet'), attributes: { strength: '0.8', regulation: 'repressible' }, registryId: 'BBa_R0040' },
                { type: 'rbs', id: 'rbs_2', name: 'RBS_B0032', sequence: 'TCACACAGGAAAG', attributes: { strength: '0.5' }, registryId: 'BBa_B0032' },
                { type: 'gene', id: 'gene_LacI', name: 'LacI', sequence: this.getDefaultSequence('gene', 'LacI'), attributes: { function: 'repressor' } },
                { type: 'terminator', id: 'term_rrnB', name: 'rrnB', sequence: this.getDefaultSequence('terminator', 'rrnB'), attributes: { efficiency: '0.95' }, registryId: 'BBa_B0012' },
            ],
            connections: [
                { from: 'TetR', to: 'pTet', type: 'represses' },
                { from: 'LacI', to: 'pLac', type: 'represses' },
            ],
            metadata: { description: 'Demo Repressilator', generated: new Date().toISOString() },
        };
    }

    /** Genera preview del formato seleccionado */
    private generatePreview(format: ExportFormat, circuit: ParsedCircuit): void {
        let content = '';
        switch (format) {
            case 'sbol': content = this.generateSBOL(circuit); break;
            case 'fasta': content = this.generateFASTA(circuit); break;
            case 'genbank': content = this.generateGenBank(circuit); break;
            case 'csv': content = this.generateCSV(circuit); break;
        }
        this.panel?.webview.postMessage({ command: 'previewResult', format, content });
    }

    /** SBOL 3.0 XML */
    private generateSBOL(circuit: ParsedCircuit): string {
        const uri = `https://synbio-llvm.org/${circuit.name}`;
        let xml = `<?xml version="1.0" encoding="UTF-8"?>\n`;
        xml += `<sbol xmlns="http://sbols.org/v3#"\n`;
        xml += `      xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"\n`;
        xml += `      xmlns:dcterms="http://purl.org/dc/terms/"\n`;
        xml += `      xmlns:prov="http://www.w3.org/ns/prov#"\n`;
        xml += `      xmlns:om="http://www.ontology-of-units-of-measure.org/resource/om-2/">\n\n`;
        xml += `  <!-- Generated by SynBio-LLVM on ${new Date().toISOString()} -->\n\n`;

        // Activity (provenance)
        xml += `  <prov:Activity rdf:about="${uri}/activity">\n`;
        xml += `    <dcterms:title>SynBio-LLVM Compilation</dcterms:title>\n`;
        xml += `    <prov:endedAtTime>${new Date().toISOString()}</prov:endedAtTime>\n`;
        xml += `  </prov:Activity>\n\n`;

        // Top-level Component
        xml += `  <Component rdf:about="${uri}">\n`;
        xml += `    <displayId>${circuit.name}</displayId>\n`;
        xml += `    <name>${circuit.name}</name>\n`;
        if (circuit.metadata.description) {
            xml += `    <description>${this.escapeXml(circuit.metadata.description)}</description>\n`;
        }
        xml += `    <type rdf:resource="https://identifiers.org/SBO:0000251"/>\n`; // DNA
        xml += `    <role rdf:resource="https://identifiers.org/SO:0000280"/>\n`; // engineered_region
        xml += `    <prov:wasGeneratedBy rdf:resource="${uri}/activity"/>\n\n`;

        // SubComponents
        for (const part of circuit.parts) {
            const so = this.getSORole(part.type);
            xml += `    <hasSubComponent>\n`;
            xml += `      <SubComponent rdf:about="${uri}/${part.id}">\n`;
            xml += `        <displayId>${part.id}</displayId>\n`;
            xml += `        <name>${this.escapeXml(part.name)}</name>\n`;
            xml += `        <instanceOf rdf:resource="${uri}/def/${part.id}"/>\n`;
            xml += `        <role rdf:resource="https://identifiers.org/SO:${so}"/>\n`;
            if (part.registryId) {
                xml += `        <dcterms:identifier>${part.registryId}</dcterms:identifier>\n`;
            }
            xml += `      </SubComponent>\n`;
            xml += `    </hasSubComponent>\n\n`;
        }

        // Constraints (order)
        for (let i = 0; i < circuit.parts.length - 1; i++) {
            xml += `    <hasConstraint>\n`;
            xml += `      <Constraint>\n`;
            xml += `        <restriction rdf:resource="http://sbols.org/v3#precedes"/>\n`;
            xml += `        <subject rdf:resource="${uri}/${circuit.parts[i].id}"/>\n`;
            xml += `        <object rdf:resource="${uri}/${circuit.parts[i + 1].id}"/>\n`;
            xml += `      </Constraint>\n`;
            xml += `    </hasConstraint>\n`;
        }

        // Interactions (regulatory)
        for (const conn of circuit.connections) {
            const interType = conn.type.includes('repress') ? '0000169' : '0000170'; // inhibition : stimulation
            xml += `    <hasInteraction>\n`;
            xml += `      <Interaction>\n`;
            xml += `        <type rdf:resource="https://identifiers.org/SBO:${interType}"/>\n`;
            xml += `        <hasParticipation>\n`;
            xml += `          <Participation>\n`;
            xml += `            <role rdf:resource="https://identifiers.org/SBO:0000020"/>\n`; // inhibitor/stimulator
            xml += `            <participant rdf:resource="${uri}/${conn.from}"/>\n`;
            xml += `          </Participation>\n`;
            xml += `        </hasParticipation>\n`;
            xml += `        <hasParticipation>\n`;
            xml += `          <Participation>\n`;
            xml += `            <role rdf:resource="https://identifiers.org/SBO:0000642"/>\n`; // inhibited/stimulated
            xml += `            <participant rdf:resource="${uri}/${conn.to}"/>\n`;
            xml += `          </Participation>\n`;
            xml += `        </hasParticipation>\n`;
            xml += `      </Interaction>\n`;
            xml += `    </hasInteraction>\n`;
        }

        xml += `  </Component>\n\n`;

        // Component definitions with sequences
        for (const part of circuit.parts) {
            xml += `  <Component rdf:about="${uri}/def/${part.id}">\n`;
            xml += `    <displayId>${part.id}_def</displayId>\n`;
            xml += `    <type rdf:resource="https://identifiers.org/SBO:0000251"/>\n`;
            xml += `    <role rdf:resource="https://identifiers.org/SO:${this.getSORole(part.type)}"/>\n`;
            xml += `    <hasSequence rdf:resource="${uri}/seq/${part.id}"/>\n`;
            xml += `  </Component>\n\n`;

            xml += `  <Sequence rdf:about="${uri}/seq/${part.id}">\n`;
            xml += `    <displayId>${part.id}_seq</displayId>\n`;
            xml += `    <elements>${part.sequence}</elements>\n`;
            xml += `    <encoding rdf:resource="https://identifiers.org/edam:format_1207"/>\n`;
            xml += `  </Sequence>\n\n`;
        }

        // Full assembled sequence
        const fullSeq = circuit.parts.map(p => p.sequence).join('');
        xml += `  <Sequence rdf:about="${uri}/sequence/full">\n`;
        xml += `    <displayId>${circuit.name}_full_seq</displayId>\n`;
        xml += `    <elements>${fullSeq}</elements>\n`;
        xml += `    <encoding rdf:resource="https://identifiers.org/edam:format_1207"/>\n`;
        xml += `  </Sequence>\n\n`;

        xml += `</sbol>\n`;
        return xml;
    }

    /** FASTA multi-entry */
    private generateFASTA(circuit: ParsedCircuit): string {
        let fasta = '';

        // Full circuit sequence
        const fullSeq = circuit.parts.map(p => p.sequence).join('');
        fasta += `>${circuit.name} | Full circuit | ${fullSeq.length} bp | Generated by SynBio-LLVM\n`;
        fasta += this.formatSequence(fullSeq, 80) + '\n\n';

        // Individual parts
        for (const part of circuit.parts) {
            const header = [
                `>${circuit.name}|${part.type}|${part.name}`,
                part.registryId ? `registry:${part.registryId}` : '',
                `${part.sequence.length} bp`,
            ].filter(Boolean).join(' | ');

            fasta += header + '\n';
            fasta += this.formatSequence(part.sequence, 80) + '\n\n';

            // Protein sequence if available
            if (part.aminoSequence) {
                fasta += `>${circuit.name}|protein|${part.name} | ${part.aminoSequence.length} aa\n`;
                fasta += this.formatSequence(part.aminoSequence, 80) + '\n\n';
            }
        }

        return fasta;
    }

    /** GenBank format */
    private generateGenBank(circuit: ParsedCircuit): string {
        const fullSeq = circuit.parts.map(p => p.sequence).join('');
        const seqLen = fullSeq.length;
        const date = this.genBankDate();
        let gb = '';

        gb += `LOCUS       ${circuit.name.padEnd(16)} ${String(seqLen).padStart(6)} bp    DNA     circular SYN ${date}\n`;
        gb += `DEFINITION  ${circuit.name} genetic circuit, generated by SynBio-LLVM.\n`;
        gb += `ACCESSION   SYNBIO_${circuit.name.toUpperCase()}\n`;
        gb += `VERSION     SYNBIO_${circuit.name.toUpperCase()}.1\n`;
        gb += `KEYWORDS    synthetic biology; genetic circuit; SynBio-LLVM.\n`;
        gb += `SOURCE      synthetic construct\n`;
        gb += `  ORGANISM  synthetic construct\n`;
        gb += `            other sequences; artificial sequences.\n`;
        gb += `REFERENCE   1\n`;
        gb += `  AUTHORS   SynBio-LLVM Compiler\n`;
        gb += `  TITLE     Automated genetic circuit design\n`;
        gb += `COMMENT     Generated by SynBio-LLVM - Compilador de Sistemas Geneticos Dinamicos\n`;
        if (circuit.metadata.author) {
            gb += `            Author: ${circuit.metadata.author}\n`;
        }
        gb += `FEATURES             Location/Qualifiers\n`;

        // Source feature
        gb += `     source          1..${seqLen}\n`;
        gb += `                     /organism="synthetic construct"\n`;
        gb += `                     /mol_type="other DNA"\n`;

        // Part features
        let pos = 1;
        for (const part of circuit.parts) {
            const end = pos + part.sequence.length - 1;
            const featureType = this.genBankFeatureType(part.type);

            gb += `     ${featureType.padEnd(16)}${pos}..${end}\n`;
            gb += `                     /label="${part.name}"\n`;

            if (part.registryId) {
                gb += `                     /note="Registry: ${part.registryId}"\n`;
            }

            for (const [key, val] of Object.entries(part.attributes)) {
                if (val && key !== 'function') {
                    gb += `                     /note="${key}=${val}"\n`;
                }
            }

            if (part.type === 'gene' || part.type === 'cds') {
                gb += `                     /codon_start=1\n`;
                if (part.aminoSequence) {
                    gb += `                     /translation="${part.aminoSequence}"\n`;
                }
                if (part.attributes.function) {
                    gb += `                     /product="${part.attributes.function}"\n`;
                }
            }

            pos = end + 1;
        }

        // ORIGIN section
        gb += `ORIGIN\n`;
        const seqLower = fullSeq.toLowerCase();
        for (let i = 0; i < seqLower.length; i += 60) {
            const lineNum = String(i + 1).padStart(9);
            let line = lineNum;
            for (let j = i; j < Math.min(i + 60, seqLower.length); j += 10) {
                line += ' ' + seqLower.substring(j, Math.min(j + 10, seqLower.length));
            }
            gb += line + '\n';
        }
        gb += '//\n';

        return gb;
    }

    /** CSV parts inventory */
    private generateCSV(circuit: ParsedCircuit): string {
        let csv = 'Part ID,Name,Type,Length (bp),Registry ID,Sequence\n';
        for (const part of circuit.parts) {
            csv += `${part.id},${part.name},${part.type},${part.sequence.length},${part.registryId || 'N/A'},"${part.sequence}"\n`;
        }

        const fullSeq = circuit.parts.map(p => p.sequence).join('');
        csv += `\nCircuit Summary\n`;
        csv += `Name,${circuit.name}\n`;
        csv += `Total Length,${fullSeq} bp\n`;
        csv += `Parts Count,${circuit.parts.length}\n`;
        csv += `Connections,${circuit.connections.length}\n`;
        csv += `GC Content,${((fullSeq.match(/[GC]/gi) || []).length / fullSeq.length * 100).toFixed(1)}%\n`;

        return csv;
    }

    /** Exporta a archivo */
    private async exportToFile(format: ExportFormat, content: string, filename: string): Promise<void> {
        const extensions: Record<ExportFormat, Record<string, string[]>> = {
            sbol: { 'SBOL XML': ['sbol', 'xml'] },
            fasta: { 'FASTA': ['fasta', 'fa', 'fna'] },
            genbank: { 'GenBank': ['gb', 'gbk', 'genbank'] },
            csv: { 'CSV': ['csv'] },
        };

        const uri = await vscode.window.showSaveDialog({
            defaultUri: vscode.Uri.file(filename),
            filters: extensions[format],
        });

        if (uri) {
            await vscode.workspace.fs.writeFile(uri, Buffer.from(content, 'utf8'));
            vscode.window.showInformationMessage(`Exportado: ${uri.fsPath}`);
            // Abrir el archivo exportado
            const doc = await vscode.workspace.openTextDocument(uri);
            await vscode.window.showTextDocument(doc, vscode.ViewColumn.Beside);
        }
    }

    // --- Helpers ---
    private getSORole(type: string): string {
        const roles: Record<string, string> = {
            promoter: '0000167', rbs: '0000139', cds: '0000316', gene: '0000316',
            terminator: '0000141', protein: '0000358', circuit: '0000280',
        };
        return roles[type] || '0000110';
    }

    private genBankFeatureType(type: string): string {
        const map: Record<string, string> = {
            promoter: 'promoter', rbs: 'RBS', gene: 'CDS', cds: 'CDS',
            terminator: 'terminator', protein: 'CDS',
        };
        return map[type] || 'misc_feature';
    }

    private genBankDate(): string {
        const months = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
        const d = new Date();
        return `${String(d.getDate()).padStart(2, '0')}-${months[d.getMonth()]}-${d.getFullYear()}`;
    }

    private formatSequence(seq: string, lineWidth: number): string {
        const lines: string[] = [];
        for (let i = 0; i < seq.length; i += lineWidth) {
            lines.push(seq.substring(i, i + lineWidth));
        }
        return lines.join('\n');
    }

    private escapeXml(s: string): string {
        return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    private getWebviewHTML(): string {
        return `<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Exportador Profesional</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: 'Segoe UI', Tahoma, sans-serif; background: #1e1e2e; color: #cdd6f4; padding: 20px; }
        .header { display: flex; align-items: center; gap: 12px; margin-bottom: 20px; }
        .header h1 { font-size: 22px; color: #fab387; }
        .badge { background: #313244; color: #a6adc8; padding: 4px 10px; border-radius: 12px; font-size: 11px; }
        .card { background: #313244; border-radius: 12px; padding: 18px; margin-bottom: 14px; border: 1px solid #45475a; }
        .card h3 { color: #fab387; margin-bottom: 10px; font-size: 15px; }
        .circuit-summary { display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: 10px; margin-bottom: 14px; }
        .summary-item { background: #1e1e2e; border-radius: 8px; padding: 12px; text-align: center; border: 1px solid #45475a; }
        .summary-value { font-size: 22px; font-weight: 700; color: #a6e3a1; }
        .summary-label { font-size: 10px; color: #a6adc8; margin-top: 2px; text-transform: uppercase; }
        .parts-list { max-height: 200px; overflow-y: auto; }
        .part-item { display: flex; align-items: center; gap: 10px; padding: 8px 10px; border-bottom: 1px solid #45475a; font-size: 13px; }
        .part-item:last-child { border-bottom: none; }
        .part-icon { width: 28px; height: 28px; border-radius: 6px; display: flex; align-items: center; justify-content: center; font-size: 14px; flex-shrink: 0; }
        .part-icon.promoter { background: rgba(250, 179, 135, 0.2); }
        .part-icon.rbs { background: rgba(166, 227, 161, 0.2); }
        .part-icon.gene, .part-icon.cds { background: rgba(137, 180, 250, 0.2); }
        .part-icon.terminator { background: rgba(243, 139, 168, 0.2); }
        .part-name { flex: 1; font-weight: 500; }
        .part-len { color: #6c7086; font-size: 11px; }
        .part-registry { color: #89b4fa; font-size: 11px; font-family: monospace; }
        .format-tabs { display: flex; gap: 6px; margin-bottom: 14px; }
        .format-tab { padding: 10px 18px; background: #45475a; color: #a6adc8; border: 1px solid #585b70; border-radius: 8px; cursor: pointer; font-size: 13px; transition: all 0.2s; display: flex; align-items: center; gap: 6px; }
        .format-tab:hover { background: #585b70; }
        .format-tab.active { background: #fab387; color: #1e1e2e; border-color: #fab387; font-weight: 600; }
        .preview-area { background: #1e1e2e; border-radius: 8px; padding: 14px; border: 1px solid #45475a; max-height: 400px; overflow: auto; }
        .preview-area pre { font-family: 'Cascadia Code', 'Fira Code', monospace; font-size: 12px; line-height: 1.5; white-space: pre-wrap; word-break: break-all; color: #cdd6f4; }
        .preview-area .xml-tag { color: #89b4fa; }
        .preview-area .xml-attr { color: #a6e3a1; }
        .preview-area .xml-val { color: #f9e2af; }
        .preview-area .fasta-header { color: #a6e3a1; font-weight: 600; }
        .preview-area .gb-keyword { color: #cba6f7; font-weight: 600; }
        .btn-row { display: flex; gap: 10px; margin-top: 14px; }
        .btn { padding: 10px 20px; border: none; border-radius: 8px; font-size: 14px; cursor: pointer; font-weight: 600; transition: all 0.2s; }
        .btn-primary { background: linear-gradient(135deg, #fab387, #f9e2af); color: #1e1e2e; }
        .btn-primary:hover { filter: brightness(1.1); transform: translateY(-1px); }
        .btn-secondary { background: #45475a; color: #cdd6f4; }
        .btn-secondary:hover { background: #585b70; }
        .no-circuit { text-align: center; padding: 40px; color: #6c7086; }
        .no-circuit .icon { font-size: 48px; margin-bottom: 12px; }
    </style>
</head>
<body>
    <div class="header">
        <h1>📦 Exportador Profesional</h1>
        <span class="badge">SBOL 3.0 · FASTA · GenBank · CSV</span>
    </div>

    <div id="noCircuit" class="card no-circuit">
        <div class="icon">📄</div>
        <p>Abre un archivo .bio para parsear automáticamente</p>
        <button class="btn btn-secondary" style="margin-top: 12px;" onclick="parseEditor()">🔄 Parsear Editor Activo</button>
    </div>

    <div id="circuitView" style="display:none;">
        <div class="card">
            <h3>🧬 Circuito Detectado</h3>
            <div class="circuit-summary" id="summary"></div>
            <div class="parts-list" id="partsList"></div>
            <button class="btn btn-secondary" style="margin-top: 10px; font-size: 12px;" onclick="parseEditor()">🔄 Re-parsear</button>
        </div>

        <div class="card">
            <h3>📤 Formato de Exportación</h3>
            <div class="format-tabs">
                <button class="format-tab active" data-format="sbol" onclick="selectFormat('sbol')">📋 SBOL 3.0</button>
                <button class="format-tab" data-format="fasta" onclick="selectFormat('fasta')">🧬 FASTA</button>
                <button class="format-tab" data-format="genbank" onclick="selectFormat('genbank')">📑 GenBank</button>
                <button class="format-tab" data-format="csv" onclick="selectFormat('csv')">📊 CSV</button>
            </div>
            <div class="preview-area" id="previewArea">
                <pre id="previewContent">Selecciona un formato para previsualizar...</pre>
            </div>
            <div class="btn-row">
                <button class="btn btn-primary" id="exportBtn" onclick="exportFile()">💾 Exportar Archivo</button>
                <button class="btn btn-secondary" onclick="copyContent()">📋 Copiar</button>
            </div>
        </div>
    </div>

    <script>
        const vscode = acquireVsCodeApi();
        let currentCircuit = null;
        let currentFormat = 'sbol';
        let currentContent = '';

        function parseEditor() { vscode.postMessage({ command: 'parseEditor' }); }

        function selectFormat(format) {
            currentFormat = format;
            document.querySelectorAll('.format-tab').forEach(t => t.classList.remove('active'));
            document.querySelector('[data-format="'+format+'"]').classList.add('active');
            if (currentCircuit) {
                vscode.postMessage({ command: 'preview', format, circuit: currentCircuit });
            }
        }

        function exportFile() {
            if (!currentContent || !currentCircuit) return;
            const exts = { sbol: '.sbol', fasta: '.fasta', genbank: '.gb', csv: '.csv' };
            vscode.postMessage({ command: 'export', format: currentFormat, content: currentContent, filename: currentCircuit.name + exts[currentFormat] });
        }

        function copyContent() {
            if (currentContent) { vscode.postMessage({ command: 'copyToClipboard', content: currentContent }); }
        }

        function renderCircuit(circuit) {
            currentCircuit = circuit;
            document.getElementById('noCircuit').style.display = 'none';
            document.getElementById('circuitView').style.display = 'block';

            const totalBp = circuit.parts.reduce((s, p) => s + p.sequence.length, 0);
            const gcCount = circuit.parts.reduce((s, p) => s + (p.sequence.match(/[GC]/gi) || []).length, 0);
            const gcPct = totalBp > 0 ? (gcCount / totalBp * 100).toFixed(1) : '0';

            document.getElementById('summary').innerHTML =
                '<div class="summary-item"><div class="summary-value">' + circuit.name + '</div><div class="summary-label">Circuito</div></div>' +
                '<div class="summary-item"><div class="summary-value">' + circuit.parts.length + '</div><div class="summary-label">Partes</div></div>' +
                '<div class="summary-item"><div class="summary-value">' + totalBp + '</div><div class="summary-label">Pares de bases</div></div>' +
                '<div class="summary-item"><div class="summary-value">' + gcPct + '%</div><div class="summary-label">GC Content</div></div>' +
                '<div class="summary-item"><div class="summary-value">' + circuit.connections.length + '</div><div class="summary-label">Conexiones</div></div>';

            const icons = { promoter: '→', rbs: '◆', gene: '▣', cds: '▣', terminator: '⊣' };
            let partsHtml = '';
            for (const p of circuit.parts) {
                partsHtml += '<div class="part-item"><div class="part-icon ' + p.type + '">' + (icons[p.type]||'?') + '</div><span class="part-name">' + p.name + '</span><span class="part-len">' + p.sequence.length + ' bp</span>' + (p.registryId ? '<span class="part-registry">' + p.registryId + '</span>' : '') + '</div>';
            }
            document.getElementById('partsList').innerHTML = partsHtml;

            selectFormat(currentFormat);
        }

        function highlightContent(format, content) {
            if (format === 'sbol') {
                return content
                    .replace(/(&lt;\\/?[\\w:]+)/g, '<span class="xml-tag">$1</span>')
                    .replace(/(\\w+)=/g, '<span class="xml-attr">$1</span>=')
                    .replace(/"([^"]*)"/g, '"<span class="xml-val">$1</span>"');
            } else if (format === 'fasta') {
                return content.replace(/^(&gt;.*)$/gm, '<span class="fasta-header">$1</span>');
            } else if (format === 'genbank') {
                return content.replace(/^(LOCUS|DEFINITION|ACCESSION|VERSION|KEYWORDS|SOURCE|REFERENCE|COMMENT|FEATURES|ORIGIN|[/]{2})/gm, '<span class="gb-keyword">$1</span>');
            }
            return content;
        }

        window.addEventListener('message', event => {
            const msg = event.data;
            switch(msg.command) {
                case 'parsed':
                    if (msg.circuit) { renderCircuit(msg.circuit); }
                    else if (msg.error) { document.getElementById('noCircuit').querySelector('p').textContent = msg.error; }
                    break;
                case 'previewResult':
                    currentContent = msg.content;
                    const escaped = msg.content.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
                    document.getElementById('previewContent').innerHTML = highlightContent(msg.format, escaped);
                    break;
            }
        });
    </script>
</body>
</html>`;
    }

    dispose(): void {
        this.panel?.dispose();
        this.disposables.forEach(d => d.dispose());
    }
}
