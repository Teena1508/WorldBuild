"use client";

import React, { useState, useRef } from "react";
import {
  UploadCloud,
  FileText,
  AlertTriangle,
  CheckCircle2,
  X,
  Sparkles,
  BookOpen,
  ArrowRight,
  Layers,
  Trash2,
  Edit2,
  RefreshCw,
} from "lucide-react";
import { ImportPreviewResult, ParsedChapterPreview } from "@/lib/manuscript/types";
import { Story } from "@/lib/db/types";

interface ManuscriptImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  targetStory?: Story | null;
  stories?: Story[];
  onImportComplete: (storyId: string, chaptersCount: number) => void;
}

export function ManuscriptImportModal({
  isOpen,
  onClose,
  targetStory,
  stories = [],
  onImportComplete,
}: ManuscriptImportModalProps) {
  const [dragActive, setDragActive] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isParsing, setIsParsing] = useState(false);
  const [preview, setPreview] = useState<ImportPreviewResult | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);

  // Editable chapter list in preview
  const [editableChapters, setEditableChapters] = useState<ParsedChapterPreview[]>([]);
  const [selectedStoryId, setSelectedStoryId] = useState<string>(
    targetStory?.id || (stories.length > 0 ? stories[0].id : "new")
  );
  const [newStoryTitle, setNewStoryTitle] = useState<string>("");
  const [isCommitting, setIsCommitting] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileSelection(e.dataTransfer.files[0]);
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      handleFileSelection(e.target.files[0]);
    }
  };

  const handleFileSelection = async (file: File) => {
    setSelectedFile(file);
    setParseError(null);
    setPreview(null);
    setIsParsing(true);

    try {
      const ext = file.name.split(".").pop()?.toLowerCase();
      if (!["txt", "md", "markdown", "docx"].includes(ext || "")) {
        throw new Error(
          `Unsupported file type ".${ext}". Please upload a TXT, Markdown, or DOCX document.`
        );
      }

      if (file.size > 15 * 1024 * 1024) {
        throw new Error("File exceeds 15MB limit. Please upload a smaller file.");
      }

      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch("/api/manuscript/preview", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to preview manuscript");
      }

      setPreview(data.preview);
      setEditableChapters(data.preview.chapters || []);
      if (!targetStory && !newStoryTitle) {
        const cleanBase = file.name.replace(/\.[^/.]+$/, "").replace(/[_\-]+/g, " ");
        setNewStoryTitle(cleanBase.charAt(0).toUpperCase() + cleanBase.slice(1));
      }
    } catch (err: unknown) {
      setParseError(err instanceof Error ? err.message : "Manuscript preview failed");
    } finally {
      setIsParsing(false);
    }
  };

  const handleChapterTitleChange = (index: number, newTitle: string) => {
    setEditableChapters((prev) =>
      prev.map((ch, i) => (i === index ? { ...ch, title: newTitle } : ch))
    );
  };

  const handleDeleteChapter = (index: number) => {
    setEditableChapters((prev) => {
      const remaining = prev.filter((_, i) => i !== index);
      return remaining.map((ch, i) => ({ ...ch, sequence_number: i + 1 }));
    });
  };

  const handleCommitImport = async () => {
    if (!preview || editableChapters.length === 0) return;
    setIsCommitting(true);
    setParseError(null);

    try {
      const isNew = selectedStoryId === "new";
      const payload = {
        story_id: isNew ? undefined : selectedStoryId,
        create_new_story: isNew,
        story_title: isNew ? newStoryTitle.trim() || preview.filename : undefined,
        filename: preview.filename,
        file_type: preview.file_type,
        file_size: preview.file_size,
        content_hash: preview.content_hash,
        chapters: editableChapters.map((ch) => ({
          title: ch.title,
          summary: ch.summary,
          content: ch.content,
        })),
      };

      const res = await fetch("/api/manuscript/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Import commit failed");
      }

      onImportComplete(data.story_id, data.chapters_created);
      onClose();
    } catch (err: unknown) {
      setParseError(err instanceof Error ? err.message : "Failed to import manuscript");
    } finally {
      setIsCommitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fade-in">
      <div
        className="relative w-full max-w-4xl max-h-[90vh] flex flex-col rounded-2xl border border-[#d4af37]/30 bg-[#080c1d] shadow-[0_10px_50px_rgba(0,0,0,0.8)] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#1b223d] bg-[#0c1229]">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-8 h-8 rounded-lg border border-[#d4af37]/40 bg-[#121836] text-[#fae48f]">
              <UploadCloud className="w-4 h-4 text-[#fae48f]" />
            </div>
            <div>
              <h3 className="font-cinzel text-base font-bold text-[#fae48f] tracking-wide">
                Import Manuscript
              </h3>
              <p className="text-xs font-mono text-[#8885a6]">
                Safe parsing for TXT, Markdown, and Microsoft Word DOCX
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg border border-[#222946] text-[#8885a6] hover:text-white hover:border-[#d4af37]/40 transition-all cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* File Upload Dropzone */}
          {!preview && !isParsing && (
            <div
              onDragEnter={handleDrag}
              onDragOver={handleDrag}
              onDragLeave={handleDrag}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`relative border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-all ${
                dragActive
                  ? "border-[#fae48f] bg-[#141b38]/60 shadow-[0_0_25px_rgba(212,175,55,0.2)]"
                  : "border-[#222b4d] hover:border-[#d4af37]/50 bg-[#0a0f26]/60"
              }`}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".txt,.md,.markdown,.docx"
                onChange={handleFileInputChange}
                className="hidden"
              />

              <div className="flex flex-col items-center gap-3">
                <div className="w-14 h-14 rounded-full border border-[#d4af37]/40 bg-[#101738] flex items-center justify-center text-[#fae48f] shadow-[0_0_20px_rgba(212,175,55,0.15)]">
                  <FileText className="w-7 h-7" />
                </div>
                <div>
                  <p className="text-sm font-cinzel font-semibold text-[#fae48f]">
                    Drag &amp; drop manuscript or browse files
                  </p>
                  <p className="text-xs font-mono text-[#7b7899] mt-1">
                    Accepts .txt, .md, and .docx manuscripts up to 15MB
                  </p>
                </div>
                <div className="flex items-center gap-2 mt-2">
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded border border-[#2a345a] bg-[#0c1228] text-[#c4c1d8]">
                    TXT
                  </span>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded border border-[#2a345a] bg-[#0c1228] text-[#c4c1d8]">
                    Markdown
                  </span>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded border border-[#2a345a] bg-[#0c1228] text-[#c4c1d8]">
                    DOCX
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Parsing State */}
          {isParsing && (
            <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
              <RefreshCw className="w-8 h-8 text-[#fae48f] animate-spin" />
              <p className="font-cinzel text-sm text-[#fae48f]">
                Parsing manuscript &amp; detecting chapter breaks...
              </p>
              <p className="text-xs font-mono text-[#7d7a9b]">
                Validating headings, word counts, and structure
              </p>
            </div>
          )}

          {/* Error Message */}
          {parseError && (
            <div className="flex items-start gap-3 p-4 rounded-xl border border-red-500/30 bg-red-950/20 text-red-300 text-xs font-mono">
              <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
              <div>
                <p className="font-bold">Import Warning</p>
                <p className="mt-0.5 text-red-200">{parseError}</p>
              </div>
            </div>
          )}

          {/* Parsed Manuscript Preview */}
          {preview && (
            <div className="space-y-6">
              {/* File Summary Card */}
              <div className="flex flex-wrap items-center justify-between gap-4 p-4 rounded-xl border border-[#232b4e] bg-[#0b1026]">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg border border-[#d4af37]/30 bg-[#12193b] flex items-center justify-center text-[#fae48f]">
                    <BookOpen className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="text-sm font-cinzel font-bold text-[#fae48f]">
                      {preview.filename}
                    </h4>
                    <p className="text-xs font-mono text-[#7e7b9e]">
                      Format: <span className="uppercase text-[#d4af37]">{preview.file_type}</span> • Size: {(preview.file_size / 1024).toFixed(1)} KB
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-4 text-xs font-mono">
                  <div className="text-right">
                    <span className="text-[#8885a6] block text-[10px] uppercase tracking-wider">
                      Chapters
                    </span>
                    <span className="font-bold text-[#fae48f] text-sm">
                      {editableChapters.length}
                    </span>
                  </div>
                  <div className="text-right">
                    <span className="text-[#8885a6] block text-[10px] uppercase tracking-wider">
                      Total Words
                    </span>
                    <span className="font-bold text-[#fae48f] text-sm">
                      {editableChapters.reduce((acc, c) => acc + c.word_count, 0).toLocaleString()}
                    </span>
                  </div>
                  <button
                    onClick={() => {
                      setPreview(null);
                      setSelectedFile(null);
                    }}
                    className="px-2.5 py-1.5 rounded-lg border border-[#2a345a] text-[#8e8ca9] hover:text-white text-xs font-mono cursor-pointer"
                  >
                    Change File
                  </button>
                </div>
              </div>

              {/* Duplicate Detection Warning */}
              {preview.is_duplicate && preview.duplicate_warning && (
                <div className="flex items-start gap-3 p-4 rounded-xl border border-amber-500/40 bg-amber-950/20 text-amber-300 text-xs font-mono">
                  <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-bold">Duplicate Detection Notice</p>
                    <p className="mt-0.5 text-amber-200/90">{preview.duplicate_warning}</p>
                    <p className="mt-1 text-[11px] text-amber-300/70">
                      You can proceed if this is an intentional revision or import into a different story.
                    </p>
                  </div>
                </div>
              )}

              {/* Target Story Selection */}
              <div className="p-4 rounded-xl border border-[#1e274a] bg-[#0a0f26] space-y-3">
                <label className="text-xs font-mono uppercase tracking-wider text-[#9d9ab8] flex items-center gap-1.5">
                  <Layers className="w-3.5 h-3.5 text-[#d4af37]" />
                  <span>Destination Story</span>
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <select
                    value={selectedStoryId}
                    onChange={(e) => setSelectedStoryId(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-[#232c4e] bg-[#0c1228] text-xs font-mono text-[#fae48f] focus:outline-none focus:border-[#d4af37]"
                  >
                    <option value="new">+ Create New Story</option>
                    {stories.map((st) => (
                      <option key={st.id} value={st.id}>
                        {st.title} {st.is_example ? "(Demo)" : ""}
                      </option>
                    ))}
                  </select>

                  {selectedStoryId === "new" && (
                    <input
                      type="text"
                      placeholder="Enter new story title..."
                      value={newStoryTitle}
                      onChange={(e) => setNewStoryTitle(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg border border-[#232c4e] bg-[#0c1228] text-xs font-mono text-[#fae48f] focus:outline-none focus:border-[#d4af37]"
                    />
                  )}
                </div>
              </div>

              {/* Chapters List */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-mono uppercase tracking-wider text-[#8885a6]">
                    Detected Chapters Preview ({editableChapters.length})
                  </span>
                  <span className="text-[11px] font-mono text-[#7b7899]">
                    You can edit titles or remove chapters before importing
                  </span>
                </div>

                <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                  {editableChapters.map((ch, idx) => (
                    <div
                      key={idx}
                      className="flex items-center justify-between gap-3 p-3 rounded-lg border border-[#1b2342] bg-[#090e24] hover:border-[#d4af37]/30 transition-all text-xs font-mono"
                    >
                      <div className="flex items-center gap-3 flex-1 min-w-0">
                        <span className="w-6 h-6 rounded border border-[#283258] bg-[#0d132a] text-[#d4af37] flex items-center justify-center font-bold text-[11px] shrink-0">
                          {ch.sequence_number}
                        </span>
                        <input
                          type="text"
                          value={ch.title}
                          onChange={(e) => handleChapterTitleChange(idx, e.target.value)}
                          className="flex-1 bg-transparent border-b border-transparent hover:border-[#2a345a] focus:border-[#d4af37] text-[#fae48f] font-cinzel font-semibold focus:outline-none px-1 py-0.5"
                        />
                      </div>

                      <div className="flex items-center gap-3 shrink-0">
                        <span className="text-[11px] text-[#7d7a9b]">
                          {ch.word_count.toLocaleString()} words
                        </span>
                        <button
                          onClick={() => handleDeleteChapter(idx)}
                          className="p-1 rounded text-[#7d7a9b] hover:text-red-400 transition-colors"
                          title="Exclude this chapter from import"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-[#1b223d] bg-[#090e24]">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg border border-[#232b4c] text-xs font-mono uppercase tracking-wider text-[#8885a6] hover:text-white transition-colors cursor-pointer"
          >
            Cancel
          </button>

          {preview && (
            <button
              onClick={handleCommitImport}
              disabled={isCommitting || editableChapters.length === 0}
              className="gold-glow-button px-5 py-2.5 rounded-lg text-xs font-mono uppercase tracking-widest font-bold text-[#fae48f] flex items-center gap-2 cursor-pointer disabled:opacity-50"
            >
              {isCommitting ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>Inscribing Chapters...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Inscribe into Studio ({editableChapters.length} Chapters)</span>
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
