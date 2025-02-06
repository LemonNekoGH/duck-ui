import * as monaco from "monaco-editor";
import { useDuckStore } from "@/store";
import { useMemo } from "react";
import type { editor } from "monaco-editor";
import { toast } from "sonner";
import editorWorker from "monaco-editor/esm/vs/editor/editor.worker?worker";
import { format } from "sql-formatter";

// Types
export interface EditorInstance {
  editor: editor.IStandaloneCodeEditor;
  dispose: () => void;
}

interface EditorConfig {
  language: string;
  theme: string;
  automaticLayout: boolean;
  tabSize: number;
  minimap: { enabled: boolean };
  padding: { top: number };
  suggestOnTriggerCharacters: boolean;
  quickSuggestions: boolean;
  wordBasedSuggestions: boolean;
  fontSize: number;
  lineNumbers: "on" | "off" | "relative";
  scrollBeyondLastLine: boolean;
  cursorBlinking: "blink" | "smooth" | "phase" | "expand" | "solid";
  matchBrackets: "always" | "never" | "near";
  rulers: number[];
}

// Worker configuration
self.MonacoEnvironment = {
  getWorker(_workerId: string) {
    return new editorWorker();
  },
};


// Create editor instance
export const createEditor = (
  container: HTMLElement,
  config: EditorConfig,
  initialContent: string,
  tabId: string,
  executeQueryFn: (query: string, tabId: string) => Promise<void>
): EditorInstance => {
  const editor = monaco.editor.create(container, {
    ...config,
    value: initialContent,
    wordBasedSuggestions: config.wordBasedSuggestions ? "allDocuments" : "off",
    bracketPairColorization: { enabled: true },
    guides: { bracketPairs: true, indentation: true },
    renderWhitespace: "selection",
    smoothScrolling: true,
    cursorSmoothCaretAnimation: "on",
    formatOnPaste: true,
    formatOnType: true,
    snippetSuggestions: "inline",
    suggest: {
      preview: true,
      showMethods: true,
      showFunctions: true,
      showVariables: true,
      showWords: true,
      showColors: true,
    },
  });

  // Add commands
  editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, async () => {
    const query = editor.getValue().trim();
    if (!query) {
      toast.error("Please enter a query to execute");
      return;
    }
    try {
      await executeQueryFn(query, tabId);
    } catch (err) {
      toast.error(
        `Query execution failed: ${
          err instanceof Error ? err.message : "Unknown error"
        }`
      );
    }
  });

  editor.addCommand(monaco.KeyMod.Alt | monaco.KeyCode.KeyF, () => {
    const formatAction = editor.getAction("editor.action.formatDocument");
    formatAction?.run();
  });

  // Add context menu actions
  editor.addAction({
    id: "execute-selection",
    label: "Execute Selected Query",
    keybindings: [
      monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.Enter,
    ],
    contextMenuGroupId: "navigation",
    run: async (ed) => {
      const selection = ed.getSelection();
      const selectedText = selection
        ? ed.getModel()?.getValueInRange(selection)
        : "";

      if (selectedText?.trim()) {
        try {
          await executeQueryFn(selectedText.trim(), tabId);
        } catch (err) {
          toast.error(
            `Query execution failed: ${
              err instanceof Error ? err.message : "Unknown error"
            }`
          );
        }
      }
    },
  });

  editor.addAction({
    id: "format-sql",
    label: "Format SQL",
    keybindings: [monaco.KeyMod.Alt | monaco.KeyCode.KeyF],
    contextMenuGroupId: "modification",
    run: (ed) => {
      const text = ed.getValue();
      try {
        const formatted = format(text, {
          language: "sql",
          keywordCase: "upper",
          indentStyle: "standard",
          linesBetweenQueries: 2,
        });
        ed.setValue(formatted);
      } catch (err) {
        toast.error("Failed to format SQL");
      }
    },
  });

  // Setup content change listener with debounce
  let timeoutId: number;
  const disposable = editor.onDidChangeModelContent(() => {
    clearTimeout(timeoutId);
    timeoutId = window.setTimeout(() => {
      const newValue = editor.getValue();
      useDuckStore.getState().updateTabQuery(tabId, newValue);
    }, 300);
  });

  return {
    editor,
    dispose: () => {
      clearTimeout(timeoutId);
      disposable.dispose();
      editor.dispose();
    },
  };
};

// Enhanced config hook with better defaults
export const useMonacoConfig = (theme: string): EditorConfig => {
  return useMemo(
    () => ({
      language: "sql",
      theme: theme === "dark" ? "vs-dark" : "vs",
      automaticLayout: true,
      tabSize: 2,
      minimap: { enabled: false },
      padding: { top: 10 },
      suggestOnTriggerCharacters: true,
      quickSuggestions: true,
      wordBasedSuggestions: false,
      fontSize: 12,
      lineNumbers: "on",
      scrollBeyondLastLine: false,
      cursorBlinking: "blink",
      matchBrackets: "always",
      rulers: [],
    }),
    [theme]
  );
};

// Register SQL formatting provider
monaco.languages.registerDocumentFormattingEditProvider("sql", {
  provideDocumentFormattingEdits: (model) => {
    try {
      const formatted = format(model.getValue(), {
        language: "sql",
        keywordCase: "upper",
        indentStyle: "standard",
        linesBetweenQueries: 2,
      });

      return [
        {
          range: model.getFullModelRange(),
          text: formatted,
        },
      ];
    } catch (err) {
      console.error("SQL formatting failed:", err);
      return [];
    }
  },
});

// Initialize Monaco configuration
// updateMonaco(); Remove this line.  It should be called inside the `useDuckDBMonaco` hook.

// Export everything needed
export default {
  createEditor,
  useMonacoConfig,
};