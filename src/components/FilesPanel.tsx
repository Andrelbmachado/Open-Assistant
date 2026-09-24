import React, { useState, useEffect } from "react";
import { FolderOpen, FileText, Plus, Save, Trash2, Edit3, HelpCircle } from "lucide-react";
import { FileArtifact, FileKind } from "../types";

interface FilesPanelProps {
  files: FileArtifact[];
  onUpdateFile: (file: FileArtifact) => void;
  accentColor: string;
}

export default function FilesPanel({ files, onUpdateFile, accentColor }: FilesPanelProps) {
  const [selectedFileId, setSelectedFileId] = useState<string | null>(files[0]?.id || null);
  const [editorContent, setEditorContent] = useState("");

  const activeFile = files.find((f) => f.id === selectedFileId) || files[0];

  useEffect(() => {
    if (activeFile) {
      setEditorContent(activeFile.content);
    }
  }, [selectedFileId, activeFile]);

  const handleSave = () => {
    if (!activeFile) return;
    onUpdateFile({
      ...activeFile,
      content: editorContent,
    });
  };

  // Generate dynamic line numbers gutter
  const lineNumbers = editorContent.split("\n").map((_, i) => i + 1);

  return (
    <div className="flex h-full bg-[#26282e] text-zinc-100">
      {/* File Sidebar */}
      <div className="w-[240px] border-r border-zinc-700/60 bg-[#18191d] flex flex-col justify-between">
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-400 flex items-center gap-1.5">
              <FolderOpen size={12} />
              Arquivos de Trabalho
            </h3>
            <button className="rounded p-1 text-zinc-400 hover:bg-zinc-800 hover:text-white transition-colors">
              <Plus size={13} />
            </button>
          </div>

          <div className="space-y-0.5">
            {files.map((file) => {
              const isSelected = activeFile?.id === file.id;
              return (
                <button
                  key={file.id}
                  onClick={() => setSelectedFileId(file.id)}
                  className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-xs transition-colors ${
                    isSelected 
                      ? "bg-zinc-700/60 text-white font-semibold shadow-sm" 
                      : "text-zinc-400 hover:bg-zinc-800/60 hover:text-white"
                  }`}
                >
                  <FileText size={12} className={isSelected ? "text-zinc-200" : "text-zinc-500"} />
                  <span className="truncate pr-2">{file.name}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="p-4 border-t border-zinc-800">
          <div className="rounded bg-zinc-800/80 p-2 text-[10px] text-zinc-400 font-mono">
            <span>Root: </span>
            <span className="text-zinc-200">./workspace/</span>
          </div>
        </div>
      </div>

      {/* Editor Main Pane */}
      {activeFile ? (
        <div className="flex-1 flex flex-col justify-between h-full bg-[#18191d]">
          {/* Editor Header */}
          <div className="flex items-center justify-between border-b border-zinc-700/60 bg-[#202227] px-6 py-3.5 backdrop-blur-md">
            <div>
              <h2 className="text-xs font-semibold text-white font-mono flex items-center gap-2">
                <FileText size={13} className="text-zinc-300" />
                {activeFile.path}
              </h2>
              <p className="text-[10px] text-zinc-400 mt-0.5">
                Tipo: {activeFile.type} • Tamanho: {activeFile.size} • Atualizado por {activeFile.createdBy}
              </p>
            </div>

            <button
              onClick={handleSave}
              className="flex items-center gap-1.5 rounded bg-zinc-200 px-3.5 py-1 text-xs font-semibold text-zinc-900 hover:bg-white transition-colors"
            >
              <Save size={12} />
              Salvar Arquivo
            </button>
          </div>

          {/* Editor Area */}
          <div className="flex-1 flex overflow-hidden font-mono text-xs">
            {/* Line numbers Gutter */}
            <div className="w-10 select-none border-r border-zinc-800 py-4 text-right pr-2 text-zinc-600 bg-[#141518] overflow-y-hidden">
              {lineNumbers.map((line) => (
                <div key={line} className="h-[21px] leading-[21px]">
                  {line}
                </div>
              ))}
            </div>

            {/* Editable Text Area */}
            <textarea
              value={editorContent}
              onChange={(e) => setEditorContent(e.target.value)}
              className="flex-1 resize-none bg-transparent py-4 px-4 text-zinc-200 outline-none overflow-y-auto leading-[21px] font-mono whitespace-pre"
              spellCheck="false"
              style={{ tabSize: 4 }}
            />
          </div>
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center text-center p-6">
          <FileText size={32} className="text-zinc-600 mb-2" />
          <h3 className="text-xs font-semibold text-zinc-400">Nenhum Arquivo Aberto</h3>
        </div>
      )}
    </div>
  );
}
