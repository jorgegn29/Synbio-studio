/**
 * ══════════════════════════════════════════════════════════════
 * Mocha Test Runner — VS Code Extension
 * Runs all unit tests via esbuild-compiled bundle.
 * ══════════════════════════════════════════════════════════════
 */
import * as path from 'path';
import Mocha from 'mocha';
import { glob } from 'glob';

export async function run(): Promise<void> {
    const mocha = new Mocha({
        ui: 'tdd',
        color: true,
        timeout: 10000,
        reporter: 'spec'
    });

    const testsRoot = path.resolve(__dirname, '..');

    const files = await glob('**/test/**/*.test.js', { cwd: testsRoot });

    files.forEach(f => mocha.addFile(path.resolve(testsRoot, f)));

    return new Promise<void>((resolve, reject) => {
        try {
            mocha.run(failures => {
                if (failures > 0) {
                    reject(new Error(`${failures} test(s) failed.`));
                } else {
                    resolve();
                }
            });
        } catch (err) {
            reject(err);
        }
    });
}
