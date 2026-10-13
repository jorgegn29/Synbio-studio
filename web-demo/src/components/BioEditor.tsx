'use client';

import React, { useRef, useCallback } from 'react';
import Editor, { OnMount, type Monaco } from '@monaco-editor/react';
import { registerBioScriptLanguage, BIOSCRIPT_LANGUAGE_ID } from '@/lib/monaco-bioscript';
import { Loader2 } from 'lucide-react';
import type * as monacoTypes from 'monaco-editor';
import type { Diagnostic } from '@/lib/compiler';

interface BioEditorProps {
  value: string;
  onChange: (value: string) => void;
  diagnostics: Diagnostic[];
}

export default function BioEditor({ value, onChange, diagnostics }: BioEditorProps) {
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

    editor.updateOptions({
      fontSize: 14,
      fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace",
      fontLigatures: true,
      minimap: { enabled: false },
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
