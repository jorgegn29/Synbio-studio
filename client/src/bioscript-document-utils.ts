import * as path from 'path';
import * as vscode from 'vscode';

function normalizeAscii(value: string): string {
    return value
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '');
}

export function sanitizeBioScriptIdentifier(value: string | undefined, fallback = 'nuevo_circuito'): string {
    const normalized = normalizeAscii(value ?? fallback)
        .replace(/[^a-z0-9_\s-]/g, ' ')
        .replace(/[\s-]+/g, '_')
        .replace(/_+/g, '_')
        .replace(/^_+|_+$/g, '');

    if (!normalized) {
        return fallback;
    }

    if (/^[0-9]/.test(normalized)) {
        return `circuit_${normalized}`;
    }

    return normalized;
}

export function sanitizeBioScriptFileName(value: string | undefined, fallbackStem = 'nuevo_circuito'): string {
    const rawValue = (value ?? `${fallbackStem}.bio`).trim();
    const withoutExtension = path.basename(rawValue, path.extname(rawValue));
    const stem = sanitizeBioScriptIdentifier(withoutExtension, fallbackStem);
    return `${stem}.bio`;
}

export function buildUntitledBioScriptUri(fileNameHint: string | undefined): vscode.Uri {
    const fileName = sanitizeBioScriptFileName(fileNameHint);
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];

    if (workspaceFolder) {
        return vscode.Uri.file(path.join(workspaceFolder.uri.fsPath, fileName)).with({ scheme: 'untitled' });
    }

    return vscode.Uri.from({ scheme: 'untitled', path: `/${fileName}` });
}

export async function openUntitledBioScriptDocument(content: string, fileNameHint?: string): Promise<vscode.TextEditor> {
    if (!fileNameHint) {
        const doc = await vscode.workspace.openTextDocument({ content, language: 'bioscript' });
        return vscode.window.showTextDocument(doc);
    }

    const doc = await vscode.workspace.openTextDocument(buildUntitledBioScriptUri(fileNameHint));
    const editor = await vscode.window.showTextDocument(doc);

    await editor.edit(edit => {
        const isEmpty = doc.getText().length === 0;
        const endPosition = doc.lineCount > 0
            ? doc.lineAt(doc.lineCount - 1).range.end
            : new vscode.Position(0, 0);

        if (isEmpty) {
            edit.insert(new vscode.Position(0, 0), content);
            return;
        }

        edit.replace(new vscode.Range(new vscode.Position(0, 0), endPosition), content);
    });

    return editor;
}