/**
 * Cliente HTTP para comunicación con Python Engine
 * Predicción de estructuras de proteínas sin Docker
 */

import * as vscode from 'vscode';
import * as child_process from 'child_process';
import * as path from 'path';
import * as fs from 'fs';

interface ProteinPrediction {
    sequence: string;
    name: string;
    predicted_structure: string;
    confidence: number;
    secondary_structure: string;
    disorder_regions: [number, number][];
    hydrophobicity_plot: number[];
    molecular_weight: number;
    isoelectric_point: number;
    instability_index: number;
    warnings: string[];
}

interface ServerStatus {
    running: boolean;
    port: number;
    url: string;
}

export class ProteinPredictor {
    private serverProcess: child_process.ChildProcess | null = null;
    private serverPort: number = 8765;
    private serverUrl: string = `http://127.0.0.1:${this.serverPort}`;
    private isServerRunning: boolean = false;
    private statusBarItem: vscode.StatusBarItem;

    constructor(private context: vscode.ExtensionContext) {
        this.statusBarItem = vscode.window.createStatusBarItem(
            vscode.StatusBarAlignment.Right,
            100
        );
        this.statusBarItem.text = "$(loading~spin) SynBio Engine";
        this.statusBarItem.tooltip = "Verificando servidor Python...";
        this.context.subscriptions.push(this.statusBarItem);
    }

    /**
     * Inicializa el servidor Python
     */
    async initialize(): Promise<boolean> {
        this.statusBarItem.show();

        // Verificar si el servidor ya está corriendo
        if (await this.checkServerHealth()) {
            this.isServerRunning = true;
            this.updateStatusBar('running');
            return true;
        }

        // Intentar iniciar el servidor
        const started = await this.startServer();
        
        if (started) {
            this.isServerRunning = true;
            this.updateStatusBar('running');
            return true;
        } else {
            this.updateStatusBar('unavailable');
            vscode.window.showWarningMessage(
                '🧬 SynBio Engine no disponible. Predicción de proteínas limitada.',
                'Instalar Python Engine'
            ).then(selection => {
                if (selection === 'Instalar Python Engine') {
                    this.showInstallInstructions();
                }
            });
            return false;
        }
    }

    /**
     * Predice la estructura de una proteína
     */
    async predictProtein(sequence: string, name: string = 'protein'): Promise<ProteinPrediction | null> {
        if (!this.isServerRunning) {
            vscode.window.showInformationMessage('Intentando conectar con servidor Python...');
            const initialized = await this.initialize();
            if (!initialized) {
                return null;
            }
        }

        try {
            const response = await fetch(`${this.serverUrl}/predict/protein`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    sequence: sequence,
                    name: name
                })
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const prediction = await response.json() as ProteinPrediction;
            return prediction;

        } catch (error) {
            console.error('Error prediciendo proteína:', error);
            this.isServerRunning = false;
            this.updateStatusBar('error');
            return null;
        }
    }

    /**
     * Verifica si el servidor está respondiendo
     */
    private async checkServerHealth(): Promise<boolean> {
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 2000);

            const response = await fetch(`${this.serverUrl}/health`, {
                signal: controller.signal
            });

            clearTimeout(timeoutId);
            return response.ok;
        } catch {
            return false;
        }
    }

    /**
     * Inicia el servidor Python en background
     */
    private async startServer(): Promise<boolean> {
        try {
            // Buscar el script start-server.bat
            const enginePath = path.join(
                this.context.extensionPath,
                '..',
                'python-engine'
            );

            const scriptPath = path.join(enginePath, 'start-server.bat');
            
            // Verificar que existe
            if (!fs.existsSync(scriptPath)) {
                console.error('Script de inicio no encontrado:', scriptPath);
                return false;
            }

            console.log('🧬 Iniciando servidor Python...');

            // Iniciar el servidor como proceso en background
            this.serverProcess = child_process.spawn(
                'cmd.exe',
                ['/c', scriptPath],
                {
                    cwd: enginePath,
                    detached: true,
                    stdio: 'ignore',
                    windowsHide: true
                }
            );

            // No esperar al proceso (corre en background)
            this.serverProcess.unref();

            // Esperar 3 segundos para que el servidor inicie
            await this.sleep(3000);

            // Verificar que esté corriendo
            const isRunning = await this.checkServerHealth();
            
            if (isRunning) {
                console.log('✅ Servidor Python iniciado correctamente');
                return true;
            } else {
                console.log('❌ Servidor Python no respondió');
                return false;
            }

        } catch (error) {
            console.error('Error iniciando servidor:', error);
            return false;
        }
    }

    /**
     * Detiene el servidor Python
     */
    async stopServer(): Promise<void> {
        if (this.serverProcess) {
            try {
                // En Windows, necesitamos matar el proceso y sus hijos
                child_process.exec(`taskkill /pid ${this.serverProcess.pid} /T /F`);
                this.serverProcess = null;
                this.isServerRunning = false;
                this.updateStatusBar('stopped');
                console.log('🛑 Servidor Python detenido');
            } catch (error) {
                console.error('Error deteniendo servidor:', error);
            }
        }
    }

    /**
     * Actualiza la barra de estado
     */
    private updateStatusBar(status: 'running' | 'stopped' | 'error' | 'unavailable'): void {
        switch (status) {
            case 'running':
                this.statusBarItem.text = "$(server) SynBio Engine";
                this.statusBarItem.tooltip = `Servidor corriendo en ${this.serverUrl}`;
                this.statusBarItem.backgroundColor = undefined;
                break;
            case 'stopped':
                this.statusBarItem.text = "$(server) SynBio Engine (stopped)";
                this.statusBarItem.tooltip = "Servidor detenido";
                this.statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
                break;
            case 'error':
                this.statusBarItem.text = "$(error) SynBio Engine";
                this.statusBarItem.tooltip = "Error de conexión con servidor";
                this.statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.errorBackground');
                break;
            case 'unavailable':
                this.statusBarItem.text = "$(warning) SynBio Engine";
                this.statusBarItem.tooltip = "Servidor no disponible - Funcionalidad limitada";
                this.statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
                break;
        }
    }

    /**
     * Muestra instrucciones de instalación
     */
    private showInstallInstructions(): void {
        const panel = vscode.window.createWebviewPanel(
            'synbioEngineInstall',
            'Instalar SynBio Engine',
            vscode.ViewColumn.One,
            {}
        );

        panel.webview.html = `
        <!DOCTYPE html>
        <html>
        <head>
            <style>
                body { 
                    font-family: var(--vscode-font-family); 
                    padding: 20px;
                    line-height: 1.6;
                }
                h1 { color: var(--vscode-textLink-foreground); }
                code { 
                    background: var(--vscode-textCodeBlock-background); 
                    padding: 2px 6px;
                    border-radius: 3px;
                }
                .step { 
                    background: var(--vscode-editor-background);
                    padding: 15px;
                    margin: 10px 0;
                    border-left: 3px solid var(--vscode-textLink-foreground);
                }
            </style>
        </head>
        <body>
            <h1>🧬 Instalar SynBio Python Engine</h1>
            
            <div class="step">
                <h3>Paso 1: Verificar Python</h3>
                <p>Abre PowerShell y ejecuta:</p>
                <code>python --version</code>
                <p>Debes tener Python 3.9 o superior. Si no lo tienes, descárgalo de <a href="https://python.org">python.org</a></p>
            </div>
            
            <div class="step">
                <h3>Paso 2: Ejecutar el instalador</h3>
                <p>En PowerShell, navega a:</p>
                <code>cd "${this.context.extensionPath}\\..\\python-engine"</code>
                <p>Luego ejecuta:</p>
                <code>start-server.bat</code>
            </div>
            
            <div class="step">
                <h3>Paso 3: Verificar</h3>
                <p>El servidor se iniciará en <code>http://127.0.0.1:8765</code></p>
                <p>Recarga VS Code (Ctrl+Shift+P → "Reload Window") para reconectar.</p>
            </div>
            
            <h2>⚡ Inicio Automático (Opcional)</h2>
            <p>Para que el servidor inicie automáticamente con VS Code, puedes crear una tarea en <code>.vscode/tasks.json</code></p>
        </body>
        </html>
        `;
    }

    /**
     * Muestra la predicción en un panel
     */
    async showPrediction(prediction: ProteinPrediction): Promise<void> {
        const panel = vscode.window.createWebviewPanel(
            'proteinPrediction',
            `Predicción: ${prediction.name}`,
            vscode.ViewColumn.Beside,
            {}
        );

        // Generar gráfica ASCII de hidrofobicidad
        const hydroPlot = this.generateHydroPlot(prediction.hydrophobicity_plot);

        panel.webview.html = `
        <!DOCTYPE html>
        <html>
        <head>
            <style>
                body { 
                    font-family: 'Consolas', monospace; 
                    padding: 20px;
                    background: var(--vscode-editor-background);
                    color: var(--vscode-editor-foreground);
                }
                h2 { color: var(--vscode-textLink-foreground); }
                .property { 
                    display: flex;
                    padding: 5px 0;
                }
                .property-name { 
                    font-weight: bold; 
                    width: 200px;
                }
                .warning { 
                    background: rgba(255, 180, 0, 0.2);
                    padding: 10px;
                    margin: 5px 0;
                    border-left: 3px solid orange;
                }
                .structure {
                    font-family: 'Courier New', monospace;
                    background: var(--vscode-textCodeBlock-background);
                    padding: 15px;
                    overflow-x: auto;
                    white-space: pre;
                }
                .plot {
                    font-family: 'Courier New', monospace;
                    background: #000;
                    color: #0f0;
                    padding: 15px;
                    overflow-x: auto;
                }
            </style>
        </head>
        <body>
            <h2>🧬 Análisis de Proteína: ${prediction.name}</h2>
            
            <h3>Propiedades Bioquímicas</h3>
            <div class="property">
                <span class="property-name">Secuencia:</span>
                <span>${prediction.sequence}</span>
            </div>
            <div class="property">
                <span class="property-name">Longitud:</span>
                <span>${prediction.sequence.length} aminoácidos</span>
            </div>
            <div class="property">
                <span class="property-name">Peso Molecular:</span>
                <span>${prediction.molecular_weight.toFixed(2)} Da</span>
            </div>
            <div class="property">
                <span class="property-name">Punto Isoeléctrico (pI):</span>
                <span>${prediction.isoelectric_point.toFixed(2)}</span>
            </div>
            <div class="property">
                <span class="property-name">Índice de Inestabilidad:</span>
                <span>${prediction.instability_index.toFixed(2)} ${prediction.instability_index > 40 ? '(inestable)' : '(estable)'}</span>
            </div>
            <div class="property">
                <span class="property-name">Confianza de Predicción:</span>
                <span>${(prediction.confidence * 100).toFixed(0)}%</span>
            </div>
            
            ${prediction.warnings.length > 0 ? `
                <h3>⚠️ Advertencias</h3>
                ${prediction.warnings.map(w => `<div class="warning">${w}</div>`).join('')}
            ` : ''}
            
            <h3>Estructura Secundaria Predicha</h3>
            <div class="structure">H = α-helix | E = β-sheet | C = coil

${prediction.secondary_structure.match(/.{1,80}/g)?.join('\n') || prediction.secondary_structure}
            </div>
            
            <h3>Gráfica de Hidrofobicidad</h3>
            <div class="plot">${hydroPlot}</div>
            
            ${prediction.disorder_regions.length > 0 ? `
                <h3>Regiones Desordenadas</h3>
                ${prediction.disorder_regions.map(([start, end]) => 
                    `<div>Posición ${start}-${end} (${end - start} residuos)</div>`
                ).join('')}
            ` : ''}
        </body>
        </html>
        `;
    }

    /**
     * Genera gráfica ASCII de hidrofobicidad
     */
    private generateHydroPlot(values: number[]): string {
        const height = 15;
        const width = Math.min(values.length, 80);
        const subset = values.length > width 
            ? values.filter((_, i) => i % Math.ceil(values.length / width) === 0)
            : values;
        
        const max = Math.max(...subset, 4);
        const min = Math.min(...subset, -4);
        const range = max - min;
        
        let plot = '';
        
        // Líneas horizontales
        for (let y = 0; y < height; y++) {
            const value = max - (y / height) * range;
            let line = value.toFixed(1).padStart(5) + ' |';
            
            for (let x = 0; x < subset.length; x++) {
                const v = subset[x];
                const barHeight = ((v - min) / range) * height;
                line += (height - y <= barHeight) ? '█' : ' ';
            }
            plot += line + '\n';
        }
        
        // Línea del eje X
        plot += '      +' + '-'.repeat(subset.length) + '\n';
        plot += '       Posición en secuencia →';
        
        return plot;
    }

    private sleep(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Limpieza
     */
    dispose(): void {
        this.stopServer();
        this.statusBarItem.dispose();
    }
}
