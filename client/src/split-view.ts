/**
 * SynBio-LLVM Split View
 * Vista dividida: Código BioScript ↔ Estructura 3D
 * Sincronización en tiempo real entre editor y visualización
 */

import * as vscode from 'vscode';
import { MoleculeViewer, MoleculeData } from './molecule-viewer';
import { GillespieSimulator, GillespieCircuit, SimulationConfig } from './gillespie-simulator';

export interface CircuitVisualization {
    genes: GeneNode[];
    connections: Connection[];
    proteins: ProteinNode[];
    metabolites: MetaboliteNode[];
}

export interface GeneNode {
    id: string;
    name: string;
    type: 'gene' | 'promoter' | 'terminator' | 'rbs';
    position: { x: number; y: number };
    sequence?: string;
    active: boolean;
}

export interface Connection {
    from: string;
    to: string;
    type: 'activation' | 'repression' | 'production' | 'degradation';
    strength: number;
}

export interface ProteinNode {
    id: string;
    name: string;
    concentration: number;
    position: { x: number; y: number };
}

export interface MetaboliteNode {
    id: string;
    name: string;
    concentration: number;
}

export class SplitViewManager {
    private context: vscode.ExtensionContext;
    private moleculeViewer: MoleculeViewer;
    private gillespieSimulator: GillespieSimulator;
    private splitPanel: vscode.WebviewPanel | undefined;
    private currentCircuit: CircuitVisualization | undefined;
    private disposables: vscode.Disposable[] = [];

    constructor(context: vscode.ExtensionContext) {
        this.context = context;
        this.moleculeViewer = new MoleculeViewer(context);
        this.gillespieSimulator = new GillespieSimulator(context);
        
        // Escuchar cambios en el editor
        this.disposables.push(
            vscode.workspace.onDidChangeTextDocument(this.onDocumentChange.bind(this))
        );
    }

    /**
     * Abre la vista dividida
     */
    async openSplitView(): Promise<void> {
        const editor = vscode.window.activeTextEditor;
        
        if (!editor || !editor.document.fileName.endsWith('.bio')) {
            vscode.window.showWarningMessage('Abre un archivo .bio para usar la vista dividida');
            return;
        }

        // Parsear el código actual
        const code = editor.document.getText();
        this.currentCircuit = this.parseCircuit(code);

        // Crear panel
        if (this.splitPanel) {
            this.splitPanel.reveal(vscode.ViewColumn.Beside);
        } else {
            this.splitPanel = vscode.window.createWebviewPanel(
                'synbioSplitView',
                '🧬 Vista Circuito',
                vscode.ViewColumn.Beside,
                {
                    enableScripts: true,
                    retainContextWhenHidden: true
                }
            );

            this.splitPanel.onDidDispose(() => {
                this.splitPanel = undefined;
            });

            // Manejar mensajes
            this.splitPanel.webview.onDidReceiveMessage(
                async (message) => {
                    switch (message.command) {
                        case 'selectGene':
                            await this.highlightGeneInEditor(message.geneId);
                            break;
                        case 'simulate':
                            await this.runSimulation();
                            break;
                        case 'showStructure':
                            await this.showMoleculeStructure(message.data);
                            break;
                    }
                },
                undefined,
                this.context.subscriptions
            );
        }

        this.updateSplitView();
    }

    /**
     * Parsea código BioScript a estructura visual
     */
    private parseCircuit(code: string): CircuitVisualization {
        const genes: GeneNode[] = [];
        const connections: Connection[] = [];
        const proteins: ProteinNode[] = [];
        const metabolites: MetaboliteNode[] = [];

        const lines = code.split('\n');
        let yPos = 50;

        // Regex patterns
        const genePattern = /gene\s+(\w+)\s*\{/;
        const promoterPattern = /promoter\s*:\s*"?([^";\n]+)"?/;
        const proteinPattern = /protein\s+(\w+)/;
        const sequencePattern = /sequence\s*:\s*"([^"]+)"/;
        const activatesPattern = /activates\s*:\s*\[([^\]]+)\]/;
        const repressesPattern = /represses\s*:\s*\[([^\]]+)\]/;

        let currentGene: GeneNode | null = null;
        let xPos = 100;

        for (const line of lines) {
            const trimmed = line.trim();

            // Detectar genes
            const geneMatch = trimmed.match(genePattern);
            if (geneMatch) {
                currentGene = {
                    id: geneMatch[1],
                    name: geneMatch[1],
                    type: 'gene',
                    position: { x: xPos, y: yPos },
                    active: true
                };
                genes.push(currentGene);
                
                // Proteína asociada
                proteins.push({
                    id: `protein_${geneMatch[1]}`,
                    name: geneMatch[1],
                    concentration: 0,
                    position: { x: xPos + 150, y: yPos }
                });
                
                // Conexión gen → proteína
                connections.push({
                    from: geneMatch[1],
                    to: `protein_${geneMatch[1]}`,
                    type: 'production',
                    strength: 1
                });
                
                xPos += 250;
                if (xPos > 600) {
                    xPos = 100;
                    yPos += 120;
                }
            }

            // Detectar promotores
            const promoterMatch = trimmed.match(promoterPattern);
            if (promoterMatch && currentGene) {
                genes.push({
                    id: `promoter_${currentGene.id}`,
                    name: promoterMatch[1],
                    type: 'promoter',
                    position: { x: currentGene.position.x - 60, y: currentGene.position.y },
                    active: true
                });
            }

            // Detectar secuencias
            const seqMatch = trimmed.match(sequencePattern);
            if (seqMatch && currentGene) {
                currentGene.sequence = seqMatch[1];
            }

            // Detectar activaciones
            const activatesMatch = trimmed.match(activatesPattern);
            if (activatesMatch && currentGene) {
                const targets = activatesMatch[1].split(',').map(t => t.trim());
                for (const target of targets) {
                    connections.push({
                        from: `protein_${currentGene.id}`,
                        to: target,
                        type: 'activation',
                        strength: 1
                    });
                }
            }

            // Detectar represiones
            const repressesMatch = trimmed.match(repressesPattern);
            if (repressesMatch && currentGene) {
                const targets = repressesMatch[1].split(',').map(t => t.trim());
                for (const target of targets) {
                    connections.push({
                        from: `protein_${currentGene.id}`,
                        to: target,
                        type: 'repression',
                        strength: 1
                    });
                }
            }

            // Detectar metabolitos
            if (trimmed.includes('metabolite')) {
                const metMatch = trimmed.match(/metabolite\s+(\w+)/);
                if (metMatch) {
                    metabolites.push({
                        id: metMatch[1],
                        name: metMatch[1],
                        concentration: 0
                    });
                }
            }
        }

        return { genes, connections, proteins, metabolites };
    }

    /**
     * Actualiza la vista dividida
     */
    private updateSplitView(): void {
        if (!this.splitPanel || !this.currentCircuit) return;
        this.splitPanel.webview.html = this.getSplitViewHTML(this.currentCircuit);
    }

    /**
     * Cuando cambia el documento
     */
    private onDocumentChange(event: vscode.TextDocumentChangeEvent): void {
        if (event.document.fileName.endsWith('.bio') && this.splitPanel) {
            this.currentCircuit = this.parseCircuit(event.document.getText());
            this.updateSplitView();
        }
    }

    /**
     * Resalta un gen en el editor
     */
    private async highlightGeneInEditor(geneId: string): Promise<void> {
        const editor = vscode.window.activeTextEditor;
        if (!editor) return;

        const text = editor.document.getText();
        const pattern = new RegExp(`gene\\s+${geneId}\\s*\\{`);
        const match = text.match(pattern);
        
        if (match && match.index !== undefined) {
            const position = editor.document.positionAt(match.index);
            editor.selection = new vscode.Selection(position, position);
            editor.revealRange(
                new vscode.Range(position, position),
                vscode.TextEditorRevealType.InCenter
            );
        }
    }

    /**
     * Ejecuta simulación Gillespie
     */
    async runSimulation(): Promise<void> {
        if (!this.currentCircuit) return;

        const circuit = this.circuitToGillespie(this.currentCircuit);
        const config: SimulationConfig = {
            maxTime: 100,
            maxIterations: 100000,
            recordInterval: 0.1,
            numRuns: 5
        };

        vscode.window.withProgress(
            {
                location: vscode.ProgressLocation.Notification,
                title: 'Ejecutando simulación estocástica...',
                cancellable: false
            },
            async () => {
                const results = await this.gillespieSimulator.simulate(circuit, config);
                this.gillespieSimulator.showResults(results, circuit);
            }
        );
    }

    /**
     * Convierte circuito visual a formato Gillespie
     */
    private circuitToGillespie(circuit: CircuitVisualization): GillespieCircuit {
        const species = new Map();
        const reactions = [];

        // Agregar especies
        for (const gene of circuit.genes.filter(g => g.type === 'gene')) {
            species.set(gene.id, {
                name: gene.id,
                initialCount: 1,
                currentCount: 1,
                isGene: true
            });
            
            species.set(`mRNA_${gene.id}`, {
                name: `mRNA_${gene.id}`,
                initialCount: 0,
                currentCount: 0,
                isMRNA: true
            });
        }

        for (const protein of circuit.proteins) {
            species.set(protein.id, {
                name: protein.id,
                initialCount: 10,
                currentCount: 10,
                isProtein: true
            });
        }

        // Agregar reacciones
        for (const gene of circuit.genes.filter(g => g.type === 'gene')) {
            // Transcripción
            reactions.push({
                name: `transcription_${gene.id}`,
                reactants: [{ species: gene.id, coefficient: 1 }],
                products: [
                    { species: gene.id, coefficient: 1 },
                    { species: `mRNA_${gene.id}`, coefficient: 1 }
                ],
                rateConstant: 0.5,
                propensity: 0
            });

            // Traducción
            reactions.push({
                name: `translation_${gene.id}`,
                reactants: [{ species: `mRNA_${gene.id}`, coefficient: 1 }],
                products: [
                    { species: `mRNA_${gene.id}`, coefficient: 1 },
                    { species: `protein_${gene.id}`, coefficient: 1 }
                ],
                rateConstant: 0.1,
                propensity: 0
            });

            // Degradación mRNA
            reactions.push({
                name: `deg_mRNA_${gene.id}`,
                reactants: [{ species: `mRNA_${gene.id}`, coefficient: 1 }],
                products: [],
                rateConstant: 0.05,
                propensity: 0
            });

            // Degradación proteína
            reactions.push({
                name: `deg_protein_${gene.id}`,
                reactants: [{ species: `protein_${gene.id}`, coefficient: 1 }],
                products: [],
                rateConstant: 0.01,
                propensity: 0
            });
        }

        return {
            name: 'BioScript Circuit',
            species,
            reactions
        };
    }

    /**
     * Muestra estructura molecular
     */
    private async showMoleculeStructure(data: MoleculeData): Promise<void> {
        await this.moleculeViewer.show(data);
    }

    /**
     * HTML de la vista dividida
     */
    private getSplitViewHTML(circuit: CircuitVisualization): string {
        const genesJson = JSON.stringify(circuit.genes);
        const connectionsJson = JSON.stringify(circuit.connections);
        const proteinsJson = JSON.stringify(circuit.proteins);

        return `<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Vista Circuito Genético</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        
        body {
            background: #0d1117;
            color: #c9d1d9;
            font-family: 'Segoe UI', system-ui, sans-serif;
            height: 100vh;
            overflow: hidden;
        }
        
        .container {
            display: flex;
            flex-direction: column;
            height: 100vh;
        }
        
        .toolbar {
            background: #161b22;
            padding: 10px 15px;
            display: flex;
            align-items: center;
            gap: 10px;
            border-bottom: 1px solid #30363d;
        }
        
        button {
            background: #21262d;
            color: #c9d1d9;
            border: 1px solid #30363d;
            padding: 8px 16px;
            border-radius: 6px;
            cursor: pointer;
            font-size: 13px;
            display: flex;
            align-items: center;
            gap: 6px;
            transition: all 0.2s;
        }
        
        button:hover {
            background: #30363d;
            border-color: #8b949e;
        }
        
        button.primary {
            background: #238636;
            border-color: #238636;
        }
        
        button.primary:hover {
            background: #2ea043;
        }
        
        .canvas-container {
            flex: 1;
            position: relative;
            overflow: hidden;
        }
        
        #circuitCanvas {
            width: 100%;
            height: 100%;
        }
        
        .info-panel {
            position: absolute;
            top: 10px;
            right: 10px;
            background: rgba(22, 27, 34, 0.95);
            border: 1px solid #30363d;
            border-radius: 8px;
            padding: 15px;
            min-width: 200px;
            backdrop-filter: blur(10px);
        }
        
        .info-panel h4 {
            color: #58a6ff;
            margin-bottom: 10px;
            font-size: 14px;
        }
        
        .info-row {
            display: flex;
            justify-content: space-between;
            margin: 5px 0;
            font-size: 12px;
        }
        
        .info-row .label {
            color: #8b949e;
        }
        
        .info-row .value {
            color: #c9d1d9;
            font-family: 'Consolas', monospace;
        }
        
        .legend {
            position: absolute;
            bottom: 10px;
            left: 10px;
            background: rgba(22, 27, 34, 0.95);
            border: 1px solid #30363d;
            border-radius: 8px;
            padding: 12px;
            font-size: 11px;
        }
        
        .legend-item {
            display: flex;
            align-items: center;
            gap: 8px;
            margin: 4px 0;
        }
        
        .legend-icon {
            width: 20px;
            height: 12px;
            border-radius: 3px;
        }
        
        .selected-node {
            position: absolute;
            bottom: 10px;
            right: 10px;
            background: rgba(22, 27, 34, 0.95);
            border: 1px solid #58a6ff;
            border-radius: 8px;
            padding: 15px;
            min-width: 250px;
            display: none;
        }
        
        .selected-node.visible {
            display: block;
        }
        
        .selected-node h4 {
            color: #58a6ff;
            margin-bottom: 10px;
        }
        
        .sequence-box {
            background: #0d1117;
            padding: 8px;
            border-radius: 4px;
            font-family: 'Consolas', monospace;
            font-size: 10px;
            word-break: break-all;
            max-height: 60px;
            overflow-y: auto;
            margin-top: 10px;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="toolbar">
            <span style="font-size: 20px;">🧬</span>
            <span style="font-weight: 600;">Vista de Circuito Genético</span>
            <div style="flex: 1;"></div>
            <button onclick="zoomIn()">🔍+ Zoom</button>
            <button onclick="zoomOut()">🔍- Zoom</button>
            <button onclick="resetView()">↺ Reset</button>
            <button class="primary" onclick="runSimulation()">▶️ Simular</button>
            <button onclick="showStructure()">🔬 3D</button>
        </div>
        
        <div class="canvas-container">
            <canvas id="circuitCanvas"></canvas>
            
            <div class="info-panel">
                <h4>📊 Circuito</h4>
                <div class="info-row">
                    <span class="label">Genes:</span>
                    <span class="value" id="geneCount">0</span>
                </div>
                <div class="info-row">
                    <span class="label">Proteínas:</span>
                    <span class="value" id="proteinCount">0</span>
                </div>
                <div class="info-row">
                    <span class="label">Conexiones:</span>
                    <span class="value" id="connectionCount">0</span>
                </div>
            </div>
            
            <div class="legend">
                <div class="legend-item">
                    <div class="legend-icon" style="background: #3fb950;"></div>
                    <span>Gen</span>
                </div>
                <div class="legend-item">
                    <div class="legend-icon" style="background: #f0883e;"></div>
                    <span>Promotor</span>
                </div>
                <div class="legend-item">
                    <div class="legend-icon" style="background: #58a6ff;"></div>
                    <span>Proteína</span>
                </div>
                <div class="legend-item">
                    <div class="legend-icon" style="background: linear-gradient(90deg, #3fb950, #3fb950); height: 3px;"></div>
                    <span>Activación</span>
                </div>
                <div class="legend-item">
                    <div class="legend-icon" style="background: linear-gradient(90deg, #f85149, #f85149); height: 3px;"></div>
                    <span>Represión</span>
                </div>
            </div>
            
            <div class="selected-node" id="selectedNode">
                <h4 id="nodeName">Gen seleccionado</h4>
                <div class="info-row">
                    <span class="label">Tipo:</span>
                    <span class="value" id="nodeType">-</span>
                </div>
                <div class="sequence-box" id="nodeSequence" style="display: none;"></div>
                <button onclick="goToSource()" style="margin-top: 10px; width: 100%;">
                    📝 Ir al código
                </button>
            </div>
        </div>
    </div>

    <script>
        const vscode = acquireVsCodeApi();
        
        const genes = ${genesJson};
        const connections = ${connectionsJson};
        const proteins = ${proteinsJson};
        
        const canvas = document.getElementById('circuitCanvas');
        const ctx = canvas.getContext('2d');
        
        let scale = 1;
        let offsetX = 0;
        let offsetY = 0;
        let isDragging = false;
        let lastX = 0;
        let lastY = 0;
        let selectedNode = null;
        
        // Actualizar contadores
        document.getElementById('geneCount').textContent = genes.filter(g => g.type === 'gene').length;
        document.getElementById('proteinCount').textContent = proteins.length;
        document.getElementById('connectionCount').textContent = connections.length;
        
        function resizeCanvas() {
            canvas.width = canvas.parentElement.clientWidth;
            canvas.height = canvas.parentElement.clientHeight;
            draw();
        }
        
        window.addEventListener('resize', resizeCanvas);
        resizeCanvas();
        
        function draw() {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.save();
            ctx.translate(offsetX, offsetY);
            ctx.scale(scale, scale);
            
            // Dibujar conexiones
            for (const conn of connections) {
                drawConnection(conn);
            }
            
            // Dibujar nodos
            for (const gene of genes) {
                drawGene(gene);
            }
            
            for (const protein of proteins) {
                drawProtein(protein);
            }
            
            ctx.restore();
        }
        
        function drawGene(gene) {
            const x = gene.position.x;
            const y = gene.position.y;
            
            ctx.beginPath();
            
            if (gene.type === 'promoter') {
                // Promotor: flecha
                ctx.fillStyle = '#f0883e';
                ctx.moveTo(x, y - 15);
                ctx.lineTo(x + 30, y);
                ctx.lineTo(x, y + 15);
                ctx.closePath();
                ctx.fill();
            } else if (gene.type === 'terminator') {
                // Terminador: T
                ctx.fillStyle = '#f85149';
                ctx.fillRect(x, y - 20, 5, 40);
                ctx.fillRect(x - 10, y - 20, 25, 5);
            } else {
                // Gen: rectángulo redondeado
                ctx.fillStyle = selectedNode === gene.id ? '#2ea043' : '#3fb950';
                roundRect(ctx, x, y - 20, 80, 40, 5);
                ctx.fill();
                
                // Texto
                ctx.fillStyle = '#0d1117';
                ctx.font = 'bold 12px Consolas';
                ctx.textAlign = 'center';
                ctx.fillText(gene.name, x + 40, y + 5);
            }
        }
        
        function drawProtein(protein) {
            const x = protein.position.x;
            const y = protein.position.y;
            
            // Círculo
            ctx.beginPath();
            ctx.fillStyle = selectedNode === protein.id ? '#79c0ff' : '#58a6ff';
            ctx.arc(x, y, 25, 0, Math.PI * 2);
            ctx.fill();
            
            // Texto
            ctx.fillStyle = '#0d1117';
            ctx.font = 'bold 10px Consolas';
            ctx.textAlign = 'center';
            ctx.fillText(protein.name.replace('protein_', ''), x, y + 4);
        }
        
        function drawConnection(conn) {
            const fromNode = [...genes, ...proteins].find(n => n.id === conn.from);
            const toNode = [...genes, ...proteins].find(n => n.id === conn.to);
            
            if (!fromNode || !toNode) return;
            
            const fromX = fromNode.position.x + (fromNode.type ? 40 : 0);
            const fromY = fromNode.position.y;
            const toX = toNode.position.x + (toNode.type ? 0 : 0);
            const toY = toNode.position.y;
            
            ctx.beginPath();
            ctx.strokeStyle = conn.type === 'repression' ? '#f85149' : 
                              conn.type === 'activation' ? '#3fb950' : '#8b949e';
            ctx.lineWidth = 2;
            
            // Curva bezier
            const midX = (fromX + toX) / 2;
            const midY = (fromY + toY) / 2 - 30;
            
            ctx.moveTo(fromX, fromY);
            ctx.quadraticCurveTo(midX, midY, toX, toY);
            ctx.stroke();
            
            // Flecha o barra
            if (conn.type === 'repression') {
                // Barra (represión)
                ctx.beginPath();
                ctx.strokeStyle = '#f85149';
                ctx.lineWidth = 3;
                ctx.moveTo(toX - 5, toY - 8);
                ctx.lineTo(toX + 5, toY + 8);
                ctx.stroke();
            } else {
                // Flecha
                drawArrowhead(ctx, toX, toY, Math.atan2(toY - midY, toX - midX));
            }
        }
        
        function drawArrowhead(ctx, x, y, angle) {
            const size = 10;
            ctx.save();
            ctx.translate(x, y);
            ctx.rotate(angle);
            ctx.beginPath();
            ctx.fillStyle = ctx.strokeStyle;
            ctx.moveTo(0, 0);
            ctx.lineTo(-size, -size/2);
            ctx.lineTo(-size, size/2);
            ctx.closePath();
            ctx.fill();
            ctx.restore();
        }
        
        function roundRect(ctx, x, y, width, height, radius) {
            ctx.beginPath();
            ctx.moveTo(x + radius, y);
            ctx.lineTo(x + width - radius, y);
            ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
            ctx.lineTo(x + width, y + height - radius);
            ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
            ctx.lineTo(x + radius, y + height);
            ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
            ctx.lineTo(x, y + radius);
            ctx.quadraticCurveTo(x, y, x + radius, y);
            ctx.closePath();
        }
        
        // Interacción
        canvas.addEventListener('mousedown', (e) => {
            isDragging = true;
            lastX = e.clientX;
            lastY = e.clientY;
            
            // Check click on node
            const rect = canvas.getBoundingClientRect();
            const x = (e.clientX - rect.left - offsetX) / scale;
            const y = (e.clientY - rect.top - offsetY) / scale;
            
            for (const gene of genes) {
                if (gene.type === 'gene' &&
                    x >= gene.position.x && x <= gene.position.x + 80 &&
                    y >= gene.position.y - 20 && y <= gene.position.y + 20) {
                    selectNode(gene);
                    return;
                }
            }
            
            for (const protein of proteins) {
                const dx = x - protein.position.x;
                const dy = y - protein.position.y;
                if (dx*dx + dy*dy <= 625) { // 25^2
                    selectNode(protein);
                    return;
                }
            }
            
            deselectNode();
        });
        
        canvas.addEventListener('mousemove', (e) => {
            if (isDragging) {
                offsetX += e.clientX - lastX;
                offsetY += e.clientY - lastY;
                lastX = e.clientX;
                lastY = e.clientY;
                draw();
            }
        });
        
        canvas.addEventListener('mouseup', () => isDragging = false);
        canvas.addEventListener('mouseleave', () => isDragging = false);
        
        canvas.addEventListener('wheel', (e) => {
            e.preventDefault();
            const delta = e.deltaY > 0 ? 0.9 : 1.1;
            scale *= delta;
            scale = Math.max(0.1, Math.min(5, scale));
            draw();
        });
        
        function selectNode(node) {
            selectedNode = node.id;
            const panel = document.getElementById('selectedNode');
            panel.classList.add('visible');
            document.getElementById('nodeName').textContent = node.name;
            document.getElementById('nodeType').textContent = node.type || 'protein';
            
            const seqBox = document.getElementById('nodeSequence');
            if (node.sequence) {
                seqBox.style.display = 'block';
                seqBox.textContent = node.sequence;
            } else {
                seqBox.style.display = 'none';
            }
            
            draw();
        }
        
        function deselectNode() {
            selectedNode = null;
            document.getElementById('selectedNode').classList.remove('visible');
            draw();
        }
        
        function goToSource() {
            if (selectedNode) {
                vscode.postMessage({ command: 'selectGene', geneId: selectedNode.replace('protein_', '') });
            }
        }
        
        function zoomIn() {
            scale *= 1.2;
            draw();
        }
        
        function zoomOut() {
            scale *= 0.8;
            draw();
        }
        
        function resetView() {
            scale = 1;
            offsetX = 0;
            offsetY = 0;
            draw();
        }
        
        function runSimulation() {
            vscode.postMessage({ command: 'simulate' });
        }
        
        function showStructure() {
            vscode.postMessage({ 
                command: 'showStructure', 
                data: { type: 'circuit', name: 'Current Circuit' }
            });
        }
        
        draw();
    </script>
</body>
</html>`;
    }

    dispose(): void {
        for (const d of this.disposables) {
            d.dispose();
        }
        if (this.splitPanel) {
            this.splitPanel.dispose();
        }
        this.moleculeViewer.dispose();
        this.gillespieSimulator.dispose();
    }
}
