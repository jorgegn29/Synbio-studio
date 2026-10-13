'use client';

import React, { useRef, useCallback } from 'react';
import Editor, { OnMount, type Monaco } from '@monaco-editor/react';
import { registerBioScriptLanguage, BIOSCRIPT_LANGUAGE_ID } from '@/lib/monaco-bioscript';
import { CATALOG } from '@/lib/studio-model';
import { Loader2 } from 'lucide-react';
import type * as monacoTypes from 'monaco-editor';
import type { Diagnostic } from '@/lib/compiler';

interface BioEditorProps {
  value: string;
  onChange: (value: string) => void;
  diagnostics: Diagnostic[];
  focusLine?: number | null;
}

export default function BioEditor({ value, onChange, diagnostics, focusLine }: BioEditorProps) {
  const editorRef = useRef<monacoTypes.editor.IStandaloneCodeEditor | null>(null);
  const monacoRef = useRef<Monaco | null>(null);

  const handleEditorMount: OnMount = useCallback((editor, monaco) => {
    editorRef.current = editor;
    monacoRef.current = monaco;

    registerBioScriptLanguage(monaco);
    monaco.editor.setTheme('bioscript-dark');

    const model = editor.getModel();
    if (model) {
      monaco.editor.setModelLanguage(model, BIOSCRIPT_LANGUAGE_ID);
    }

    monaco.languages.registerCompletionItemProvider(BIOSCRIPT_LANGUAGE_ID, {
      provideCompletionItems: (model, position) => {
        const word = model.getWordUntilPosition(position);
        const range = {
          startLineNumber: position.lineNumber,
          endLineNumber: position.lineNumber,
          startColumn: word.startColumn,
          endColumn: word.endColumn,
        };
        return {
          suggestions: [
            ...['circuit', 'gene', 'promoter', 'rbs', 'terminator', 'chassis', 'kill_switch', 'safe', 'sequence', 'product'].map(keyword => ({
              label: keyword,
              kind: monaco.languages.CompletionItemKind.Keyword,
              insertText: keyword,
              range,
            })),
            ...CATALOG.map(part => ({
              label: part.name,
              kind: monaco.languages.CompletionItemKind.Value,
              insertText: part.name,
              detail: `${part.type} · ${part.note}`,
              range,
            })),
            {
              label: 'tu',
              kind: monaco.languages.CompletionItemKind.Snippet,
              insertText: 'promoter: ${1:J23101}\n    rbs: ${2:B0034}\n    gene ${3:tetR} {\n        sequence: "${4:ATG}"\n        product: ${3}\n    }\n    terminator: ${5:B0015}',
              insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
              detail: 'Unidad de transcripción',
              range,
            },
          ],
        };
      },
    });

    monaco.languages.registerHoverProvider(BIOSCRIPT_LANGUAGE_ID, {
      provideHover: (model, position) => {
        const word = model.getWordAtPosition(position);
        if (!word) return null;
        const part = CATALOG.find(item => item.name === word.word);
        if (!part) return null;
        return {
          range: new monaco.Range(position.lineNumber, word.startColumn, position.lineNumber, word.endColumn),
          contents: [{ value: `**${part.name}** (${part.type})\n\n${part.note}` }],
        };
      },
    });

    editor.updateOptions({
      fontSize: 13,
      fontFamily: "'JetBrains Mono', 'Cascadia Code', Consolas, monospace",
      fontLigatures: true,
      minimap: { enabled: true },
      scrollBeyondLastLine: false,
      renderWhitespace: 'none',
      lineNumbers: 'on',
      glyphMargin: true,
      folding: true,
      bracketPairColorization: { enabled: true },
      padding: { top: 16 },
      smoothScrolling: true,
      cursorBlinking: 'smooth',
      cursorSmoothCaretAnimation: 'on',
      renderLineHighlight: 'all',
      suggest: { showWords: false },
      tabSize: 2,
    });
  }, []);

  // Update markers when diagnostics change
  React.useEffect(() => {
    if (!monacoRef.current || !editorRef.current) return;
    const model = editorRef.current.getModel();
    if (!model) return;

    const markers: monacoTypes.editor.IMarkerData[] = diagnostics.map(d => ({
      severity: d.severity === 'error'
        ? monacoRef.current!.MarkerSeverity.Error
        : d.severity === 'warning'
        ? monacoRef.current!.MarkerSeverity.Warning
        : monacoRef.current!.MarkerSeverity.Info,
      startLineNumber: d.line,
      startColumn: d.col,
      endLineNumber: d.line,
      endColumn: d.endCol + 1,
      message: d.message,
      source: 'SynBio-LLVM',
      code: d.code,
    }));

    monacoRef.current.editor.setModelMarkers(model, 'bioscript', markers);
  }, [diagnostics]);

  React.useEffect(() => {
    if (!focusLine || !editorRef.current) return;
    editorRef.current.revealLineInCenter(focusLine);
    editorRef.current.setPosition({ lineNumber: focusLine, column: 1 });
    editorRef.current.focus();
  }, [focusLine]);

  return (
    <div className="h-full w-full">
      <Editor
        height="100%"
        defaultLanguage="bioscript"
        theme="vs-dark"
        value={value}
        onChange={(v) => onChange(v || '')}
        onMount={handleEditorMount}
        loading={
          <div className="flex h-full items-center justify-center bg-surface-950">
            <div className="flex items-center gap-3 text-surface-400">
              <Loader2 className="h-5 w-5 animate-spin" />
              <span className="text-sm">Cargando editor...</span>
            </div>
          </div>
        }
        options={{
          minimap: { enabled: false },
          fontSize: 14,
          fontFamily: "'JetBrains Mono', monospace",
        }}
      />
    </div>
  );
}
