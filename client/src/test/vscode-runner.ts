import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { runTests } from '@vscode/test-electron';

async function main(): Promise<void> {
    const extensionDevelopmentPath = path.resolve(__dirname, '..', '..');
    const extensionTestsPath = path.resolve(__dirname, 'vscode-suite.js');
    const workspacePath = path.resolve(extensionDevelopmentPath, '..');
    const vscodeTestCache = path.join(extensionDevelopmentPath, '.vscode-test');
    const localCodeExecutable = path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Microsoft VS Code', 'Code.exe');
    const runId = `synbio-e2e-${Date.now()}`;
    const tempRoot = path.join(os.tmpdir(), runId);
    const userDataDir = path.join(tempRoot, 'user-data');
    const extensionsDir = path.join(tempRoot, 'extensions');

    if (fs.existsSync(vscodeTestCache)) {
        for (const entry of fs.readdirSync(vscodeTestCache, { withFileTypes: true })) {
            if (entry.isDirectory() && entry.name.startsWith('vscode-win32-x64-archive-')) {
                fs.rmSync(path.join(vscodeTestCache, entry.name), { recursive: true, force: true });
            }
        }
    }

    fs.mkdirSync(userDataDir, { recursive: true });
    fs.mkdirSync(extensionsDir, { recursive: true });

    await runTests({
        vscodeExecutablePath: fs.existsSync(localCodeExecutable) ? localCodeExecutable : undefined,
        extensionDevelopmentPath,
        extensionTestsPath,
        launchArgs: [
            workspacePath,
            '--disable-extensions',
            '--disable-updates',
            '--skip-welcome',
            '--skip-release-notes',
            '--user-data-dir',
            userDataDir,
            '--extensions-dir',
            extensionsDir
        ]
    });
}

main().catch(error => {
    console.error('Fallo ejecutando E2E de VS Code:', error);
    process.exit(1);
});