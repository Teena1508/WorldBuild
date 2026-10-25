"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  Feather,
  Sparkles,
  Save,
  CheckCircle2,
  AlertTriangle,
  Clock,
  ArrowUp,
  ArrowDown,
  Plus,
  Trash2,
  RefreshCw,
  Eye,
  Check,
  Maximize2,
  Minimize2,
  ShieldAlert,
  HelpCircle,
  Cpu,
  Filter,
  UploadCloud,
  BookOpen,
  FileText,
  Shield,
  Users,
  MapPin,
  Calendar,
  X,
} from "lucide-react";
import {
  Chapter,
  ChapterAnalysisFinding,
  ChapterFindingStatus,
  ChapterEntityLink,
  Universe,
  Story,
} from "@/lib/db/types";
import { ChapterAnalysisResult, OllamaStatus } from "@/lib/ai/types";
import { ManuscriptImportModal } from "./ManuscriptImportModal";

interface StoryStudioProps {
  universe: Universe;
  initialChapters: Chapter[];
  story?: Story | null;
  stories?: Story[];
  initialSelectedChapterId?: string | null;
  initialTab?: "prose" | "notes" | "analysis" | "entities";
  onUniverseRefresh?: () => void;
}

export function StoryStudio({
  universe,
  initialChapters,
  story,
  stories = [],
  initialSelectedChapterId,
  initialTab = "prose",
  onUniverseRefresh,
}: StoryStudioProps) {
  const [chapters, setChapters] = useState<Chapter[]>(initialChapters);
  const [selectedChapterId, setSelectedChapterId] = useState<string | null>(
    initialSelectedChapterId || (initialChapters.length > 0 ? initialChapters[0].id : null)
  );

  // Active chapter manuscript state
  const activeChapter = chapters.find((c) => c.id === selectedChapterId) || null;
  const [manuscript, setManuscript] = useState<string>(activeChapter?.content || "");
  const [chapterTitle, setChapterTitle] = useState<string>(activeChapter?.title || "");
  const [chapterSummary, setChapterSummary] = useState<string>(activeChapter?.summary || "");
  const [chapterNotes, setChapterNotes] = useState<string>(activeChapter?.author_notes || "");
  const [chapterVersion, setChapterVersion] = useState<number>(activeChapter?.version || 1);
  const [activeEditorTab, setActiveEditorTab] = useState<"prose" | "notes" | "analysis" | "entities">(initialTab);
  const [lastAnalyzedAt, setLastAnalyzedAt] = useState<string | null>(null);
  const [analysisBanner, setAnalysisBanner] = useState<{
    type: "success" | "warning" | "info";
    message: string;
  } | null>(null);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);

  const [prevInitialSelectedChapterId, setPrevInitialSelectedChapterId] = useState(initialSelectedChapterId);
  if (initialSelectedChapterId !== prevInitialSelectedChapterId) {
    setPrevInitialSelectedChapterId(initialSelectedChapterId);
    if (initialSelectedChapterId) {
      setSelectedChapterId(initialSelectedChapterId);
    }
  }

  const [prevInitialTab, setPrevInitialTab] = useState(initialTab);
  if (initialTab !== prevInitialTab) {
    setPrevInitialTab(initialTab);
    if (initialTab) {
      setActiveEditorTab(initialTab);
    }
  }

  // Autosave and concurrency state
  const [saveStatus, setSaveStatus] = useState<
    "saved" | "saving" | "unsaved" | "conflict" | "error"
  >("saved");
  const [lastSavedTime, setLastSavedTime] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [conflictData, setConflictData] = useState<{
    currentChapter: Chapter;
    error: string;
  } | null>(null);

  // Distraction-free mode
  const [distractionFree, setDistractionFree] = useState(false);

  // Analysis state
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [findings, setFindings] = useState<ChapterAnalysisFinding[]>([]);
  const [analysisSummary, setAnalysisSummary] = useState<ChapterAnalysisResult["summary"] | null>(null);
  const [contextStats, setContextStats] = useState<ChapterAnalysisResult["contextStats"] | null>(null);
  const [runtimeStatus, setRuntimeStatus] = useState<OllamaStatus | null>(null);
  const [filterStatus, setFilterStatus] = useState<"all" | ChapterFindingStatus>("all");
  const [filterSeverity, setFilterSeverity] = useState<string>("all");

  // Entity Tracking State
  const [entityLinks, setEntityLinks] = useState<ChapterEntityLink[]>([]);
  const [isScanningEntities, setIsScanningEntities] = useState(false);
  const [entityTrackingError, setEntityTrackingError] = useState<string | null>(null);
  const [filterEntityType, setFilterEntityType] = useState<string>("all");
  const [filterLinkStatus, setFilterLinkStatus] = useState<string>("all");
  const [registeringCandidate, setRegisteringCandidate] = useState<ChapterEntityLink | null>(null);
  const [registerType, setRegisterType] = useState<"character" | "location">("character");
  const [registerName, setRegisterName] = useState("");
  const [registerBio, setRegisterBio] = useState("");
  const [registerRealm, setRegisterRealm] = useState("Terrestrial Realm");

  // Dismissal modal state
  const [dismissingFinding, setDismissingFinding] = useState<ChapterAnalysisFinding | null>(null);
  const [dismissalPreset, setDismissalPreset] = useState<string>("Unreliable Narrator (Deliberate character bias)");
  const [customDismissalReason, setCustomDismissalReason] = useState<string>("");

  // Create new chapter modal state
  const [isCreatingChapter, setIsCreatingChapter] = useState(false);
  const [newChapterTitle, setNewChapterTitle] = useState("");
  const [newChapterSummary, setNewChapterSummary] = useState("");
  const [isSubmittingNew, setIsSubmittingNew] = useState(false);

  // Keep ref of latest manuscript for autosave debouncing
  const manuscriptRef = useRef(manuscript);
  const titleRef = useRef(chapterTitle);
  const summaryRef = useRef(chapterSummary);
  const notesRef = useRef(chapterNotes);
  const versionRef = useRef(chapterVersion);
  const isDirtyRef = useRef(false);

  useEffect(() => {
    manuscriptRef.current = manuscript;
    titleRef.current = chapterTitle;
    summaryRef.current = chapterSummary;
    notesRef.current = chapterNotes;
    versionRef.current = chapterVersion;
  }, [manuscript, chapterTitle, chapterSummary, chapterNotes, chapterVersion]);

  // If a story was provided, fetch its chapters
  useEffect(() => {
    if (story?.id) {
      fetch(`/api/stories/${story.id}/chapters`)
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          if (data?.chapters) {
            setChapters(data.chapters);
            if (data.chapters.length > 0 && !selectedChapterId) {
              setSelectedChapterId(data.chapters[0].id);
            }
          }
        })
        .catch(() => {});
    }
  }, [story?.id]);

  // Adjust state during render when selectedChapterId changes
  const [prevSelectedId, setPrevSelectedId] = useState(selectedChapterId);
  if (selectedChapterId !== prevSelectedId) {
    setPrevSelectedId(selectedChapterId);
    const target = chapters.find((c) => c.id === selectedChapterId);
    setManuscript(target?.content || "");
    setChapterTitle(target?.title || "");
    setChapterSummary(target?.summary || "");
    setChapterNotes(target?.author_notes || "");
    setChapterVersion(target?.version || 1);
    setSaveStatus("saved");
    setConflictData(null);
  }

  // Load existing findings for active chapter
  useEffect(() => {
    isDirtyRef.current = false;
    if (selectedChapterId) {
      const findingsUrl = story?.id
        ? `/api/stories/${story.id}/chapters/${selectedChapterId}/findings`
        : `/api/universes/${universe.id}/chapters/${selectedChapterId}/findings`;
      fetch(findingsUrl)
        .then((res) => res.json())
        .then((data) => {
          if (data.findings) {
            setFindings(data.findings);
          }
        })
        .catch(() => {});
    }
  }, [selectedChapterId, universe.id, story?.id]);

  // Check Ollama runtime health on mount
  useEffect(() => {
    fetch("/api/ai/status")
      .then((res) => res.json())
      .then((data) => {
        if (data.status) {
          setRuntimeStatus(data.status);
        }
      })
      .catch(() => {});
  }, []);

  // Warn on browser navigation if unsaved changes exist
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isDirtyRef.current) {
        e.preventDefault();
        e.returnValue = "You have unsaved manuscript edits in Story Studio.";
      }
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, []);

  // Fetch entity tracking links for chapter
  const fetchEntityLinks = useCallback(
    async (chapId: string) => {
      try {
        const res = await fetch(`/api/universes/${universe.id}/chapters/${chapId}/entities`);
        if (res.ok) {
          const data = await res.json();
          setEntityLinks(data.links || []);
        }
      } catch {
        // ignore
      }
    },
    [universe.id]
  );

  useEffect(() => {
    let active = true;
    if (selectedChapterId) {
      fetch(`/api/universes/${universe.id}/chapters/${selectedChapterId}/entities`)
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          if (active && data?.links) {
            setEntityLinks(data.links);
          }
        })
        .catch(() => {});
    }
    return () => {
      active = false;
    };
  }, [selectedChapterId, universe.id]);

  // Save implementation
  const performSave = useCallback(
    async (isManual = false) => {
      // If no chapters exist yet, auto-inscribe Chapter 1 on the fly so words are never lost
      if (!activeChapter) {
        if (!isDirtyRef.current && !isManual) return;
        try {
          setSaveStatus("saving");
          const createUrl = story?.id
            ? `/api/stories/${story.id}/chapters`
            : `/api/universes/${universe.id}/chapters`;
          const words = manuscriptRef.current.trim().split(/\s+/).filter(Boolean).length;
          const res = await fetch(createUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              title: titleRef.current.trim() || "Chapter 1: The Beginning",
              summary: summaryRef.current,
              content: manuscriptRef.current,
              author_notes: notesRef.current,
              word_count: words,
            }),
          });
          if (res.ok) {
            const data = await res.json();
            const newChap = data.chapter as Chapter;
            setChapters([newChap]);
            setSelectedChapterId(newChap.id);
            setChapterVersion(newChap.version || 1);
            versionRef.current = newChap.version || 1;
            isDirtyRef.current = false;
            setSaveStatus("saved");
            setLastSavedTime(new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }));
          }
        } catch {
          setSaveStatus("error");
        }
        return;
      }

      if (!isDirtyRef.current && !isManual) return;

      setSaveStatus("saving");
      setErrorMessage(null);

      try {
        const words = manuscriptRef.current.trim().split(/\s+/).filter(Boolean).length;
        const saveUrl = story?.id
          ? `/api/stories/${story.id}/chapters/${activeChapter.id}`
          : `/api/universes/${universe.id}/chapters/${activeChapter.id}`;

        const res = await fetch(saveUrl, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: titleRef.current,
            summary: summaryRef.current,
            content: manuscriptRef.current,
            author_notes: notesRef.current,
            word_count: words,
            expected_version: versionRef.current,
          }),
        });

        if (res.status === 409) {
          const conflict = await res.json();
          setSaveStatus("conflict");
          setConflictData({
            currentChapter: conflict.currentChapter,
            error: conflict.error,
          });
          return;
        }

        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.error || "Save failed");
        }

        const data = await res.json();
        const updated = data.chapter as Chapter;

        // Update local state and chapter list
        setChapterVersion(updated.version);
        versionRef.current = updated.version;
        isDirtyRef.current = false;
        setSaveStatus("saved");
        setLastSavedTime(new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }));
        setConflictData(null);

        // Process automatic entity tracking response
        if (data.entityTracking) {
          if (data.entityTracking.success) {
            setEntityTrackingError(null);
            fetchEntityLinks(updated.id);
          } else {
            setEntityTrackingError(data.entityTracking.error || "Entity tracking failed");
          }
        } else {
          fetchEntityLinks(updated.id);
        }

        setChapters((prev) =>
          prev.map((c) => (c.id === updated.id ? { ...c, ...updated } : c))
        );
      } catch (err) {
        setSaveStatus("error");
        setErrorMessage(err instanceof Error ? err.message : "Failed to save manuscript");
      }
    },
    [activeChapter, universe.id, story, fetchEntityLinks]
  );

  // Debounced autosave (1000ms delay for high responsiveness)
  useEffect(() => {
    if (!isDirtyRef.current) return;

    const timer = setTimeout(() => {
      performSave(false);
    }, 1000);

    return () => clearTimeout(timer);
  }, [manuscript, chapterTitle, chapterSummary, chapterNotes, performSave]);

  // Warn before closing tab if there are unsaved edits
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isDirtyRef.current || saveStatus === "unsaved" || saveStatus === "saving") {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [saveStatus]);

  // Handle keyboard shortcut (Cmd+S or Ctrl+S)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "s") {
        e.preventDefault();
        performSave(true);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [performSave]);

  const handleManuscriptChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setManuscript(e.target.value);
    isDirtyRef.current = true;
    setSaveStatus("unsaved");
  };

  // Reordering chapters
  const handleMoveChapter = async (index: number, direction: "up" | "down") => {
    if (universe.is_example && !story) return;
    const targetIndex = direction === "up" ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= chapters.length) return;

    const newOrder = [...chapters];
    const [moved] = newOrder.splice(index, 1);
    newOrder.splice(targetIndex, 0, moved);

    // Optimistically update UI
    setChapters(newOrder);

    try {
      const reorderUrl = story?.id
        ? `/api/stories/${story.id}/chapters/reorder`
        : `/api/universes/${universe.id}/chapters/reorder`;
      const reorderBody = story?.id
        ? { chapterIds: newOrder.map((c) => c.id) }
        : { chapter_ids: newOrder.map((c) => c.id) };

      const res = await fetch(reorderUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(reorderBody),
      });
      if (!res.ok) throw new Error("Reorder failed");
      const data = await res.json();
      if (data.chapters) {
        setChapters(data.chapters);
      }
      onUniverseRefresh?.();
    } catch {
      // Revert on failure
      setChapters(chapters);
    }
  };

  // Create chapter
  const handleCreateChapter = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newChapterTitle.trim()) return;

    setIsSubmittingNew(true);
    try {
      const createUrl = story?.id
        ? `/api/stories/${story.id}/chapters`
        : `/api/universes/${universe.id}/chapters`;

      const res = await fetch(createUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: newChapterTitle.trim(),
          summary: newChapterSummary.trim(),
          content: "",
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to create chapter");

      const created = data.chapter as Chapter;
      setChapters((prev) => [...prev, created]);
      setSelectedChapterId(created.id);
      setIsCreatingChapter(false);
      setNewChapterTitle("");
      setNewChapterSummary("");
      onUniverseRefresh?.();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Creation failed");
    } finally {
      setIsSubmittingNew(false);
    }
  };

  // Delete chapter
  const handleDeleteChapter = async (chapterId: string) => {
    if (universe.is_example && !story) return;
    if (!confirm("Are you certain you wish to delete this chapter manuscript?")) return;

    try {
      const deleteUrl = story?.id
        ? `/api/stories/${story.id}/chapters/${chapterId}`
        : `/api/universes/${universe.id}/chapters/${chapterId}`;

      const res = await fetch(deleteUrl, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Deletion failed");

      const remaining = chapters.filter((c) => c.id !== chapterId);
      setChapters(remaining);
      if (selectedChapterId === chapterId) {
        setSelectedChapterId(remaining.length > 0 ? remaining[0].id : null);
      }
      onUniverseRefresh?.();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Deletion failed");
    }
  };

  const handleImportComplete = async (_targetStoryId: string) => {
    if (story?.id) {
      const res = await fetch(`/api/stories/${story.id}/chapters`);
      if (res.ok) {
        const data = await res.json();
        if (data.chapters) {
          setChapters(data.chapters);
          if (data.chapters.length > 0) {
            setSelectedChapterId(data.chapters[data.chapters.length - 1].id);
          }
        }
      }
    } else {
      const res = await fetch(`/api/universes/${universe.id}/chapters`);
      if (res.ok) {
        const data = await res.json();
        if (data.chapters) {
          setChapters(data.chapters);
          if (data.chapters.length > 0) {
            setSelectedChapterId(data.chapters[data.chapters.length - 1].id);
          }
        }
      }
    }
    onUniverseRefresh?.();
  };

  // Run Canon Analysis
  const handleRunAnalysis = async () => {
    if (!activeChapter) return;

    // Ensure latest manuscript is saved before analyzing
    if (isDirtyRef.current) {
      await performSave(true);
    }

    setIsAnalyzing(true);
    setAnalysisBanner(null);
    try {
      const analyzeUrl = story?.id
        ? `/api/stories/${story.id}/chapters/${activeChapter.id}/analyze`
        : `/api/universes/${universe.id}/chapters/${activeChapter.id}/analyze`;

      const res = await fetch(analyzeUrl, { method: "POST" });
      const data: ChapterAnalysisResult = await res.json();
      if (!res.ok) {
        throw new Error((data as unknown as { error?: string }).error || "Analysis failed");
      }

      const returnedFindings = data.findings || [];
      setFindings(returnedFindings);
      setAnalysisSummary(data.summary || null);
      setContextStats(data.contextStats || null);
      if (data.runtimeStatus) {
        setRuntimeStatus(data.runtimeStatus);
      }
      const nowStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      setLastAnalyzedAt(nowStr);

      if (returnedFindings.length === 0) {
        setAnalysisBanner({
          type: "success",
          message: `Canon Verified at ${nowStr} • Zero contradictions detected across established lore.`,
        });
      } else {
        setAnalysisBanner({
          type: "warning",
          message: `Analysis Complete at ${nowStr} • Detected ${returnedFindings.length} potential continuity issue(s).`,
        });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Analysis request failed";
      setAnalysisBanner({
        type: "info",
        message: `Analysis note: ${msg}`,
      });
    } finally {
      setIsAnalyzing(false);
    }
  };

  // Update Finding Status (Accept, Resolve, Open)
  const handleUpdateFindingStatus = async (
    findingId: string,
    status: ChapterFindingStatus,
    dismissalReason?: string
  ) => {
    if (!activeChapter) return;

    try {
      const patchUrl = story?.id
        ? `/api/stories/${story.id}/chapters/${activeChapter.id}/findings/${findingId}`
        : `/api/universes/${universe.id}/chapters/${activeChapter.id}/findings/${findingId}`;

      const res = await fetch(patchUrl, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status,
          dismissal_reason: dismissalReason,
        }),
      });
      if (!res.ok) throw new Error("Status update failed");
      const data = await res.json();
      const updated = data.finding as ChapterAnalysisFinding;

      setFindings((prev) =>
        prev.map((f) => (f.id === updated.id ? { ...f, ...updated } : f))
      );
    } catch (err) {
      alert(err instanceof Error ? err.message : "Update failed");
    }
  };

  // Confirm dismissal modal
  const handleConfirmDismissal = async () => {
    if (!dismissingFinding) return;
    const finalReason =
      customDismissalReason.trim() || dismissalPreset;

    await handleUpdateFindingStatus(
      dismissingFinding.id,
      "dismissed",
      finalReason
    );
    setDismissingFinding(null);
    setCustomDismissalReason("");
  };

  // Re-scan Entities
  const handleRescanEntities = async () => {
    if (!activeChapter) return;
    if (isDirtyRef.current) {
      await performSave(true);
    }
    setIsScanningEntities(true);
    setEntityTrackingError(null);
    try {
      const res = await fetch(`/api/universes/${universe.id}/chapters/${activeChapter.id}/entities`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reprocess" }),
      });
      if (!res.ok) throw new Error("Entity detection failed");
      const data = await res.json();
      setEntityLinks(data.links || []);
    } catch (err) {
      setEntityTrackingError(err instanceof Error ? err.message : "Entity re-scan failed");
    } finally {
      setIsScanningEntities(false);
    }
  };

  // Update Entity Link (Confirm, Change status, Change relationship type)
  const handleUpdateLink = async (linkId: string, updates: Partial<ChapterEntityLink>) => {
    if (!activeChapter) return;
    try {
      const res = await fetch(`/api/universes/${universe.id}/chapters/${activeChapter.id}/entities/${linkId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      });
      if (res.ok) {
        const data = await res.json();
        setEntityLinks((prev) =>
          prev.map((l) => (l.id === linkId ? { ...l, ...data.link } : l))
        );
      }
    } catch {
      alert("Failed to update entity link");
    }
  };

  // Delete / Dismiss Entity Link
  const handleDeleteLink = async (linkId: string) => {
    if (!activeChapter) return;
    try {
      const res = await fetch(`/api/universes/${universe.id}/chapters/${activeChapter.id}/entities/${linkId}`, {
        method: "DELETE",
      });
      if (res.ok) {
        setEntityLinks((prev) => prev.filter((l) => l.id !== linkId));
      }
    } catch {
      alert("Failed to delete entity link");
    }
  };

  // Register Unknown Candidate
  const openRegisterModal = (candidate: ChapterEntityLink, defaultType: "character" | "location") => {
    setRegisteringCandidate(candidate);
    setRegisterType(defaultType);
    setRegisterName(candidate.entity_name);
    setRegisterBio(`Registered from manuscript chapter passage: "${candidate.passage || ''}"`);
    setRegisterRealm("Terrestrial Realm");
  };

  const handleRegisterUnknown = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!registeringCandidate || !activeChapter) return;
    try {
      const res = await fetch(
        `/api/universes/${universe.id}/chapters/${activeChapter.id}/entities/${registeringCandidate.id}/register`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            entity_type: registerType,
            name: registerName,
            bio: registerBio,
            realm: registerRealm,
          }),
        }
      );
      if (!res.ok) throw new Error("Registration failed");
      setRegisteringCandidate(null);
      await fetchEntityLinks(activeChapter.id);
      onUniverseRefresh?.();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to register entity");
    }
  };

  // Metrics
  const wordCount = manuscript.trim().split(/\s+/).filter(Boolean).length;
  const charCount = manuscript.length;
  const readTimeMin = Math.max(1, Math.ceil(wordCount / 200));

  // Filtered findings
  const filteredFindings = findings.filter((f) => {
    if (filterStatus !== "all" && f.status !== filterStatus) return false;
    if (filterSeverity !== "all" && f.severity !== filterSeverity) return false;
    return true;
  });

  // Filtered entity links
  const filteredEntityLinks = entityLinks.filter((l) => {
    if (filterEntityType !== "all") {
      if (filterEntityType === "unknown") {
        if (l.entity_type !== "unknown" && l.status !== "needs_review") return false;
      } else if (l.entity_type !== filterEntityType) {
        return false;
      }
    }
    if (filterLinkStatus !== "all" && l.status !== filterLinkStatus) return false;
    return true;
  });

  // Empty state: No chapters in universe
  if (chapters.length === 0) {
    return (
      <div className="p-8 max-w-3xl mx-auto text-center space-y-6 celestial-card border border-[#232d56] bg-[#070b1f] rounded-2xl my-8">
        <div className="w-16 h-16 rounded-2xl bg-[#12193b] border border-[#d4af37]/40 text-[#fae48f] mx-auto flex items-center justify-center shadow-[0_0_30px_rgba(212,175,55,0.15)]">
          <Feather className="w-8 h-8" />
        </div>
        <div className="space-y-2">
          <h3 className="font-cinzel text-2xl font-bold text-[#fbf9f4]">
            Story Studio Awaits Your Inscription
          </h3>
          <p className="font-cormorant text-base text-[#a09ebf] max-w-lg mx-auto">
            This universe currently has no chapters inscribed. Create your prologue or initial manuscript chapter to unlock continuous plot-hole detection and canon-aware analysis.
          </p>
        </div>

        <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
          {(!universe.is_example || story) && (
            <button
              onClick={() => setIsCreatingChapter(true)}
              className="gold-glow-button inline-flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-mono tracking-wider uppercase font-semibold text-[#fae48f] cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Inscribe First Chapter</span>
            </button>
          )}
          <button
            onClick={() => setIsImportModalOpen(true)}
            className="inline-flex items-center gap-2 px-5 py-3 rounded-xl border border-[#263259] bg-[#0b1029] hover:border-[#d4af37]/50 text-xs font-mono tracking-wider uppercase text-[#dcd9ed] font-semibold cursor-pointer"
          >
            <UploadCloud className="w-4 h-4 text-[#fae48f]" />
            <span>Import Manuscript</span>
          </button>
        </div>

        {/* Manuscript Import Modal for Empty State */}
        <ManuscriptImportModal
          isOpen={isImportModalOpen}
          onClose={() => setIsImportModalOpen(false)}
          targetStory={story}
          stories={stories}
          onImportComplete={handleImportComplete}
        />

        {/* Create Modal */}
        {isCreatingChapter && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
            <div className="w-full max-w-md celestial-card p-6 rounded-2xl border border-[#d4af37]/40 bg-[#080d24] text-left space-y-4">
              <h4 className="font-cinzel text-lg font-bold text-[#faf8f2]">
                Inscribe New Chapter
              </h4>
              <form onSubmit={handleCreateChapter} className="space-y-4">
                <div>
                  <label className="block text-xs font-mono uppercase text-[#8986a8] mb-1">
                    Chapter Title
                  </label>
                  <input
                    type="text"
                    required
                    value={newChapterTitle}
                    onChange={(e) => setNewChapterTitle(e.target.value)}
                    placeholder="e.g. The Fracture of the Astrolabe"
                    className="w-full px-3 py-2 rounded-lg border border-[#232c52] bg-[#0d1330] text-[#fbf9f4] text-sm focus:border-[#fae48f] outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-mono uppercase text-[#8986a8] mb-1">
                    Summary / Arc Notes
                  </label>
                  <textarea
                    rows={3}
                    value={newChapterSummary}
                    onChange={(e) => setNewChapterSummary(e.target.value)}
                    placeholder="Brief synopsis of what takes place..."
                    className="w-full px-3 py-2 rounded-lg border border-[#232c52] bg-[#0d1330] text-[#fbf9f4] text-sm focus:border-[#fae48f] outline-none"
                  />
                </div>
                <div className="flex justify-end gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setIsCreatingChapter(false)}
                    className="px-4 py-2 rounded-lg border border-[#232c52] text-xs font-mono text-[#8a88ab] hover:text-white"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmittingNew}
                    className="gold-glow-button px-5 py-2 rounded-lg text-xs font-mono font-bold text-[#fae48f]"
                  >
                    {isSubmittingNew ? "Inscribing..." : "Inscribe Chapter"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div
      className={`transition-all duration-300 ${
        distractionFree
          ? "fixed inset-0 z-50 bg-[#04060e] p-6 overflow-hidden flex flex-col"
          : "space-y-4"
      }`}
    >
      {/* Studio Header Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 p-3.5 rounded-xl border border-[#1b2344] bg-[#060a1d]/90 backdrop-blur-md">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-[#0e1538] border border-[#d4af37]/30 text-[#fae48f] flex items-center justify-center font-cinzel">
            <Feather className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-cinzel text-sm font-bold text-[#fbf9f4]">
                Story Studio
              </span>
              <span className="text-[10px] font-mono tracking-widest uppercase px-2 py-0.5 rounded-full border border-[#d4af37]/30 bg-[#0d1433] text-[#fae48f]">
                Fully Local AI
              </span>
            </div>
            <p className="text-[11px] font-mono text-[#7b7899]">
              Distraction-Free Manuscript Inscription &amp; Offline Plot-Hole Oracle
            </p>
          </div>
        </div>

        {/* Runtime status pill */}
        <div className="flex items-center gap-3">
          <div
            className={`flex items-center gap-2 px-3 py-1 rounded-full text-xs font-mono border ${
              runtimeStatus?.modelAvailable
                ? "border-emerald-500/40 bg-emerald-950/30 text-emerald-300"
                : runtimeStatus?.isAvailable
                ? "border-amber-500/40 bg-amber-950/30 text-amber-300"
                : "border-[#313b63] bg-[#0c122e] text-[#8c89ad]"
            }`}
            title={runtimeStatus?.errorMessage || "Ollama is ready"}
          >
            <Cpu className="w-3.5 h-3.5" />
            <span className="text-[11px]">
              {runtimeStatus?.modelAvailable
                ? `Local AI: ${runtimeStatus.configuredModel} (Ready)`
                : runtimeStatus?.isAvailable
                ? `Model Missing: ${runtimeStatus.configuredModel}`
                : "Local AI: Offline (Rules Active)"}
            </span>
          </div>

          {/* Distraction free toggle */}
          <button
            onClick={() => setDistractionFree(!distractionFree)}
            className="p-1.5 rounded-lg border border-[#212b50] bg-[#0c112d] text-[#8f8cae] hover:text-[#fae48f] transition-all cursor-pointer"
            title={distractionFree ? "Exit Distraction-Free" : "Distraction-Free Mode"}
          >
            {distractionFree ? (
              <Minimize2 className="w-4 h-4" />
            ) : (
              <Maximize2 className="w-4 h-4" />
            )}
          </button>
        </div>
      </div>

      {/* Concurrency Conflict Banner */}
      {conflictData && (
        <div className="p-4 rounded-xl border border-rose-500/50 bg-rose-950/30 text-rose-200 flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <ShieldAlert className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
            <div className="text-xs space-y-1">
              <span className="font-bold block text-sm">Concurrent Edit Detected</span>
              <p>{conflictData.error}</p>
              <p className="text-[11px] font-mono opacity-80">
                Server Version: v{conflictData.currentChapter.version} (Word Count:{" "}
                {conflictData.currentChapter.word_count}) • Your Draft Version: v{chapterVersion}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => {
                setManuscript(conflictData.currentChapter.content || "");
                setChapterVersion(conflictData.currentChapter.version);
                setConflictData(null);
                setSaveStatus("saved");
              }}
              className="px-3 py-1.5 rounded-lg border border-rose-400/50 bg-rose-900/50 text-xs font-mono text-white hover:bg-rose-800 cursor-pointer"
            >
              Load Server Version
            </button>
            <button
              onClick={() => {
                // Force overwrite by adopting server version + 1
                setChapterVersion(conflictData.currentChapter.version);
                versionRef.current = conflictData.currentChapter.version;
                setConflictData(null);
                performSave(true);
              }}
              className="px-3 py-1.5 rounded-lg border border-[#d4af37]/40 bg-[#12193b] text-xs font-mono text-[#fae48f] hover:bg-[#1a2350] cursor-pointer"
            >
              Overwrite with My Edits
            </button>
          </div>
        </div>
      )}

      {/* Main Studio Workspace Grid */}
      <div
        className={`grid grid-cols-1 lg:grid-cols-12 gap-4 ${
          distractionFree ? "flex-1 overflow-hidden" : ""
        }`}
      >
        {/* Left Sidebar: Chapters Index (Hidden in Distraction-Free unless toggled) */}
        {!distractionFree && (
          <div className="lg:col-span-3 space-y-3">
            <div className="p-3.5 rounded-xl border border-[#1b2344] bg-[#070b1e] space-y-3">
              <div className="flex items-center justify-between pb-2 border-b border-[#18203c]">
                <span className="text-xs font-mono uppercase tracking-wider text-[#8a87a8]">
                  Manuscript Chapters ({chapters.length})
                </span>
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => setIsImportModalOpen(true)}
                    className="p-1 rounded text-[#fae48f] hover:bg-[#141b3c] transition-colors cursor-pointer"
                    title="Import Manuscript (TXT, MD, DOCX)"
                  >
                    <UploadCloud className="w-4 h-4" />
                  </button>
                  {(!universe.is_example || story) && (
                    <button
                      onClick={() => setIsCreatingChapter(true)}
                      className="p-1 rounded text-[#fae48f] hover:bg-[#141b3c] transition-colors cursor-pointer"
                      title="Inscribe New Chapter"
                    >
                      <Plus className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>

              {/* Chapters list */}
              <div className="space-y-1.5 max-h-[580px] overflow-y-auto pr-1">
                {chapters.map((chap, idx) => {
                  const isSelected = chap.id === selectedChapterId;
                  return (
                    <div
                      key={chap.id}
                      onClick={() => setSelectedChapterId(chap.id)}
                      className={`group p-2.5 rounded-lg border transition-all cursor-pointer flex items-center justify-between gap-2 ${
                        isSelected
                          ? "border-[#fae48f]/60 bg-[#12193b] text-[#fbf9f4]"
                          : "border-[#151c38] bg-[#090e24] text-[#8e8cae] hover:border-[#2a3563] hover:text-[#dcd8cb]"
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span className="w-5 text-[11px] font-mono text-[#fae48f] font-bold shrink-0">
                          #{chap.sequence_number}
                        </span>
                        <div className="min-w-0">
                          <h5 className="font-cinzel text-xs font-bold truncate">
                            {chap.title}
                          </h5>
                          <span className="text-[10px] font-mono text-[#6c6986]">
                            {chap.word_count || 0} words
                          </span>
                        </div>
                      </div>

                      {/* Reorder and delete actions */}
                      {!universe.is_example && (
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            type="button"
                            disabled={idx === 0}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleMoveChapter(idx, "up");
                            }}
                            className="p-1 rounded hover:text-[#fae48f] disabled:opacity-20 cursor-pointer"
                            title="Move Chapter Up"
                          >
                            <ArrowUp className="w-3 h-3" />
                          </button>
                          <button
                            type="button"
                            disabled={idx === chapters.length - 1}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleMoveChapter(idx, "down");
                            }}
                            className="p-1 rounded hover:text-[#fae48f] disabled:opacity-20 cursor-pointer"
                            title="Move Chapter Down"
                          >
                            <ArrowDown className="w-3 h-3" />
                          </button>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteChapter(chap.id);
                            }}
                            className="p-1 rounded hover:text-rose-400 cursor-pointer"
                            title="Delete Chapter"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* Center: The Manuscript Editor */}
        <div
          className={`${
            distractionFree ? "col-span-12 h-full" : "lg:col-span-6"
          } flex flex-col space-y-3`}
        >
          <div className="p-4 rounded-xl border border-[#1b2344] bg-[#070b1e] flex flex-col flex-1 space-y-3">
            {/* Editor Top Bar: Title & Save Status */}
            <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-[#18203c]">
              <div className="flex-1 min-w-[200px]">
                <input
                  type="text"
                  value={chapterTitle}
                  onChange={(e) => {
                    setChapterTitle(e.target.value);
                    isDirtyRef.current = true;
                    setSaveStatus("unsaved");
                  }}
                  placeholder="Chapter Title..."
                  className="w-full bg-transparent font-cinzel text-lg font-bold text-[#fbf9f4] outline-none placeholder:text-[#565470]"
                />
              </div>

              {/* Status and Action Controls */}
              <div className="flex items-center gap-3">
                {/* Save status badge */}
                <div
                  title={errorMessage || undefined}
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-mono border ${
                    saveStatus === "saved"
                      ? "border-emerald-500/30 bg-emerald-950/20 text-emerald-300"
                      : saveStatus === "saving"
                      ? "border-amber-500/30 bg-amber-950/20 text-amber-300 animate-pulse"
                      : saveStatus === "unsaved"
                      ? "border-amber-500/40 bg-amber-950/40 text-amber-200"
                      : saveStatus === "conflict"
                      ? "border-rose-500/40 bg-rose-950/40 text-rose-300"
                      : "border-rose-500/30 bg-rose-950/20 text-rose-300"
                  }`}
                >
                  {saveStatus === "saved" && <CheckCircle2 className="w-3 h-3 text-emerald-400" />}
                  {saveStatus === "saving" && <RefreshCw className="w-3 h-3 animate-spin text-amber-400" />}
                  {saveStatus === "unsaved" && <span className="w-2 h-2 rounded-full bg-amber-400" />}
                  {saveStatus === "conflict" && <AlertTriangle className="w-3 h-3 text-rose-400" />}
                  <span>{saveStatus === "saved" ? "Autosaved" : saveStatus === "saving" ? "Autosaving..." : saveStatus === "unsaved" ? "Unsaved changes" : saveStatus}</span>
                  {saveStatus === "saved" && lastSavedTime && (
                    <span className="text-[10px] text-emerald-400/80">{lastSavedTime}</span>
                  )}
                  <span className="text-[10px] opacity-60">v{chapterVersion}</span>
                </div>

                {/* Entity Tracking Status / Retry */}
                {entityTrackingError && (
                  <button
                    onClick={handleRescanEntities}
                    disabled={isScanningEntities}
                    className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-mono border border-amber-500/40 bg-amber-950/40 text-amber-300 hover:bg-amber-900/40 cursor-pointer"
                    title={`Entity tracking note: ${entityTrackingError}. Click to retry.`}
                  >
                    <RefreshCw className={`w-3 h-3 ${isScanningEntities ? "animate-spin" : ""}`} />
                    <span>Retry Lore Scan</span>
                  </button>
                )}

                {/* Manual Save Button */}
                <button
                  onClick={() => performSave(true)}
                  disabled={saveStatus === "saving"}
                  className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg border border-[#d4af37]/40 bg-[#0e1430] text-xs font-mono text-[#fae48f] hover:bg-[#151d45] cursor-pointer disabled:opacity-50"
                  title="Manual Save (Cmd+S / Ctrl+S)"
                >
                  <Save className="w-3.5 h-3.5" />
                  <span>Save</span>
                </button>

                {/* Trigger Analysis Button */}
                <button
                  onClick={async () => {
                    setActiveEditorTab("analysis");
                    await handleRunAnalysis();
                  }}
                  disabled={isAnalyzing}
                  className="gold-glow-button inline-flex items-center gap-1.5 px-3.5 py-1 rounded-lg text-xs font-mono uppercase font-bold text-[#fae48f] cursor-pointer disabled:opacity-50"
                  title="Run Continuity Scan on Active Chapter"
                >
                  <Sparkles className={`w-3.5 h-3.5 ${isAnalyzing ? "animate-spin text-amber-300" : ""}`} />
                  <span>{isAnalyzing ? "Analyzing..." : "Analyze Chapter"}</span>
                </button>
              </div>
            </div>

            {/* Editor Mode Tabs: Prose vs Notes vs Analysis vs Tracked Lore */}
            <div className="flex items-center justify-between border-b border-[#18203c] pb-2 text-xs font-mono">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setActiveEditorTab("prose")}
                  className={`px-3 py-1 rounded-md transition-all cursor-pointer ${
                    activeEditorTab === "prose"
                      ? "bg-[#141b3d] text-[#fae48f] border border-[#d4af37]/30 font-semibold shadow-[0_0_10px_rgba(212,175,55,0.15)]"
                      : "text-[#8784a3] hover:text-white"
                  }`}
                >
                  Manuscript Prose
                </button>
                <button
                  type="button"
                  onClick={() => setActiveEditorTab("notes")}
                  className={`px-3 py-1 rounded-md transition-all cursor-pointer flex items-center gap-1.5 ${
                    activeEditorTab === "notes"
                      ? "bg-[#141b3d] text-[#fae48f] border border-[#d4af37]/30 font-semibold shadow-[0_0_10px_rgba(212,175,55,0.15)]"
                      : "text-[#8784a3] hover:text-white"
                  }`}
                >
                  <FileText className="w-3 h-3" />
                  <span>Author Notes &amp; Synopsis</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setActiveEditorTab("analysis");
                    if (!lastAnalyzedAt && findings.length === 0) {
                      handleRunAnalysis();
                    }
                  }}
                  className={`px-3 py-1 rounded-md transition-all cursor-pointer flex items-center gap-1.5 ${
                    activeEditorTab === "analysis"
                      ? "bg-[#141b3d] text-[#fae48f] border border-[#d4af37]/30 font-semibold shadow-[0_0_10px_rgba(212,175,55,0.15)]"
                      : "text-[#8784a3] hover:text-white"
                  }`}
                >
                  <Sparkles className="w-3 h-3 text-[#fae48f]" />
                  <span>
                    Analyze Chapter {findings.length > 0 ? `(${findings.length})` : ""}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setActiveEditorTab("entities");
                    if (activeChapter && entityLinks.length === 0) {
                      fetchEntityLinks(activeChapter.id);
                    }
                  }}
                  className={`px-3 py-1 rounded-md transition-all cursor-pointer flex items-center gap-1.5 ${
                    activeEditorTab === "entities"
                      ? "bg-[#141b3d] text-[#fae48f] border border-[#d4af37]/30 font-semibold shadow-[0_0_10px_rgba(212,175,55,0.15)]"
                      : "text-[#8784a3] hover:text-white"
                  }`}
                >
                  <Users className="w-3 h-3 text-[#fae48f]" />
                  <span>
                    Tracked Lore &amp; Entities {entityLinks.length > 0 ? `(${entityLinks.length})` : ""}
                  </span>
                </button>
              </div>
              <span className="text-[10px] text-[#716e8d] hidden sm:inline">
                {activeEditorTab === "prose"
                  ? "Prose is checked by Continuity Oracle"
                  : activeEditorTab === "notes"
                  ? "Private author notes are strictly isolated"
                  : activeEditorTab === "analysis"
                  ? "Causality & continuity oracle validation"
                  : "Automatic chapter entity & lore tracking"}
              </span>
            </div>

            {/* Manuscript Editor Area, Notes Area, or Continuity Analysis Dashboard */}
            {activeEditorTab === "prose" ? (
              <div className="flex-1 min-h-[460px] relative">
                <textarea
                  value={manuscript}
                  onChange={handleManuscriptChange}
                  placeholder="Inscribe your manuscript prose here... Name your characters, reference relics, forge dialogue, and explore ancient ruins. The Continuity Oracle will cross-reference your words against established canon."
                  className="w-full h-full min-h-[460px] bg-transparent font-cormorant text-lg md:text-xl text-[#f1ede2] leading-relaxed resize-none outline-none placeholder:text-[#424159] selection:bg-[#d4af37]/30 selection:text-[#fae48f]"
                  spellCheck="false"
                />
              </div>
            ) : activeEditorTab === "notes" ? (
              <div className="flex-1 min-h-[460px] space-y-4">
                <div>
                  <label className="block text-[11px] font-mono text-[#8a87a8] uppercase mb-1">
                    Chapter Synopsis
                  </label>
                  <textarea
                    rows={3}
                    value={chapterSummary}
                    onChange={(e) => {
                      setChapterSummary(e.target.value);
                      isDirtyRef.current = true;
                      setSaveStatus("unsaved");
                    }}
                    placeholder="Short summary of chapter events..."
                    className="w-full p-2.5 rounded-lg border border-[#20294c] bg-[#090d24] text-xs font-mono text-[#dcd9ed] focus:outline-none focus:border-[#d4af37]"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-mono text-[#8a87a8] uppercase mb-1">
                    Private Author Notes &amp; Plotting
                  </label>
                  <textarea
                    rows={12}
                    value={chapterNotes}
                    onChange={(e) => {
                      setChapterNotes(e.target.value);
                      isDirtyRef.current = true;
                      setSaveStatus("unsaved");
                    }}
                    placeholder="Private outlines, foreshadowing notes, draft alternatives, research snippets... These remain completely private and are never published."
                    className="w-full p-2.5 rounded-lg border border-[#20294c] bg-[#090d24] text-xs font-mono text-[#dcd9ed] focus:outline-none focus:border-[#d4af37]"
                  />
                </div>
              </div>
            ) : activeEditorTab === "analysis" ? (
              <div className="flex-1 min-h-[460px] space-y-4 overflow-y-auto pr-1">
                {/* Banner message */}
                {analysisBanner && (
                  <div
                    className={`p-3 rounded-xl border text-xs font-mono flex items-center justify-between gap-3 ${
                      analysisBanner.type === "success"
                        ? "border-emerald-500/40 bg-emerald-950/30 text-emerald-300"
                        : analysisBanner.type === "warning"
                        ? "border-amber-500/40 bg-amber-950/30 text-amber-200"
                        : "border-[#2a345c] bg-[#0c122e] text-[#d4d1e8]"
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      {analysisBanner.type === "success" ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                      ) : (
                        <Sparkles className="w-4 h-4 text-amber-400 shrink-0" />
                      )}
                      <span>{analysisBanner.message}</span>
                    </div>
                    <button
                      onClick={() => setAnalysisBanner(null)}
                      className="text-[#8885a6] hover:text-white cursor-pointer"
                    >
                      &times;
                    </button>
                  </div>
                )}

                {/* Dashboard Control Bar */}
                <div className="flex flex-wrap items-center justify-between gap-3 p-3 rounded-xl border border-[#1b2344] bg-[#090e26]">
                  <div className="flex items-center gap-2">
                    <Eye className="w-4 h-4 text-[#fae48f]" />
                    <span className="font-cinzel text-sm font-bold text-[#faf8f2]">
                      Continuity Oracle Report
                    </span>
                    {lastAnalyzedAt && (
                      <span className="text-[10px] font-mono text-[#787596] border border-[#1d264a] px-2 py-0.5 rounded-full">
                        Scanned at {lastAnalyzedAt}
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={handleRunAnalysis}
                      disabled={isAnalyzing}
                      className="gold-glow-button inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-mono uppercase font-bold text-[#fae48f] cursor-pointer disabled:opacity-50"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${isAnalyzing ? "animate-spin" : ""}`} />
                      <span>{isAnalyzing ? "Scanning..." : "Re-Scan Chapter"}</span>
                    </button>
                  </div>
                </div>

                {/* Engine Runtime Status Callout */}
                <div className="p-3 rounded-xl border border-[#1d264d] bg-[#070b20] text-xs font-mono flex items-start gap-3">
                  <Shield className="w-4 h-4 text-[#fae48f] mt-0.5 shrink-0" />
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="text-[#fae48f] font-semibold">
                        {runtimeStatus?.isAvailable
                          ? `Local Ollama AI Runtime (${runtimeStatus.configuredModel})`
                          : "Deterministic Continuity Oracle (100% Offline)"}
                      </span>
                      <span className={`text-[10px] px-2 py-0.2 rounded-full border ${
                        runtimeStatus?.isAvailable
                          ? "border-emerald-500/40 bg-emerald-950/40 text-emerald-300"
                          : "border-blue-500/40 bg-blue-950/40 text-blue-300"
                      }`}>
                        {runtimeStatus?.isAvailable ? "Dual Engine (Rules + AI)" : "Deterministic Rules Active"}
                      </span>
                    </div>
                    <p className="text-[#8c89ad] text-[11px] font-cormorant leading-relaxed">
                      {runtimeStatus?.isAvailable
                        ? "Manuscript prose is inspected using local neural causality modeling alongside hard deterministic rules for mortality, secret exposures, and narrative order. Zero data leaves your machine."
                        : "Deterministic rules evaluate character mortality, forbidden secret exposures, and chronological dependencies directly against your database. Run 'ollama serve' locally to also enable deep neural plot-hole analysis."}
                    </p>
                  </div>
                </div>

                {/* Summary Metrics Cards */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                  <div className="p-2.5 rounded-lg border border-[#1b2344] bg-[#070b1e]">
                    <span className="text-[10px] font-mono uppercase text-[#737190] block">Total Findings</span>
                    <span className="font-cinzel text-lg font-bold text-[#faf8f2]">{findings.length}</span>
                  </div>
                  <div className="p-2.5 rounded-lg border border-[#1b2344] bg-[#070b1e]">
                    <span className="text-[10px] font-mono uppercase text-[#737190] block">Deterministic Rules</span>
                    <span className="font-cinzel text-lg font-bold text-purple-300">
                      {findings.filter(f => f.source === 'deterministic_rule').length}
                    </span>
                  </div>
                  <div className="p-2.5 rounded-lg border border-[#1b2344] bg-[#070b1e]">
                    <span className="text-[10px] font-mono uppercase text-[#737190] block">Local AI Reasoning</span>
                    <span className="font-cinzel text-lg font-bold text-blue-300">
                      {findings.filter(f => f.source === 'local_ai').length}
                    </span>
                  </div>
                  <div className="p-2.5 rounded-lg border border-[#1b2344] bg-[#070b1e]">
                    <span className="text-[10px] font-mono uppercase text-[#737190] block">Open Issues</span>
                    <span className="font-cinzel text-lg font-bold text-amber-300">
                      {findings.filter(f => f.status === 'open').length}
                    </span>
                  </div>
                </div>

                {/* Findings Content / Empty State */}
                {findings.length === 0 ? (
                  <div className="p-8 rounded-xl border border-emerald-500/25 bg-gradient-to-b from-[#091524] to-[#070b1e] text-center space-y-3">
                    <CheckCircle2 className="w-10 h-10 text-emerald-400 mx-auto" />
                    <h5 className="font-cinzel text-base font-bold text-[#faf8f2]">
                      Canon Integrity Verified
                    </h5>
                    <p className="font-cormorant text-sm text-[#a8a5c4] max-w-lg mx-auto">
                      No narrative contradictions detected. Characters present have clean mortality records, forbidden secrets are respected, and chapter chronology aligns with universe canon.
                    </p>
                    <div className="pt-2">
                      <button
                        onClick={handleRunAnalysis}
                        disabled={isAnalyzing}
                        className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg border border-[#d4af37]/40 bg-[#0e163b] text-xs font-mono uppercase text-[#fae48f] hover:bg-[#162152] cursor-pointer"
                      >
                        <RefreshCw className={`w-3.5 h-3.5 ${isAnalyzing ? "animate-spin" : ""}`} />
                        <span>Re-Verify Manuscript</span>
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {filteredFindings.map((finding) => (
                      <div
                        key={finding.id}
                        className={`p-4 rounded-xl border text-xs space-y-2.5 transition-all ${
                          finding.status === "dismissed"
                            ? "border-[#1c2445]/50 bg-[#070b1e]/60 opacity-60"
                            : finding.status === "resolved"
                            ? "border-emerald-500/30 bg-emerald-950/20"
                            : finding.severity === "critical"
                            ? "border-rose-500/40 bg-rose-950/20"
                            : finding.severity === "high"
                            ? "border-amber-500/40 bg-amber-950/20"
                            : "border-[#1e274d] bg-[#090e26]"
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2 flex-wrap">
                          <div className="flex items-center gap-2">
                            <span className={`text-[10px] font-mono uppercase px-2 py-0.5 rounded font-semibold ${
                              finding.severity === "critical"
                                ? "bg-rose-950/80 border border-rose-500/40 text-rose-300"
                                : finding.severity === "high"
                                ? "bg-amber-950/80 border border-amber-500/40 text-amber-300"
                                : "bg-[#161f45] border border-[#2b396b] text-[#c4c1e0]"
                            }`}>
                              {finding.severity}
                            </span>
                            <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded bg-[#101633] text-[#fae48f] border border-[#d4af37]/20">
                              {finding.source === "deterministic_rule" ? "Deterministic Rule" : `Local AI (${Math.round(finding.confidence * 100)}%)`}
                            </span>
                            <span className="text-[10px] font-mono uppercase text-[#7e7b9e]">
                              {finding.category.replace(/_/g, " ")}
                            </span>
                          </div>

                          <div className="flex items-center gap-1.5">
                            {finding.status === "open" ? (
                              <>
                                <button
                                  onClick={() => handleUpdateFindingStatus(finding.id, "resolved")}
                                  className="px-2 py-1 rounded border border-emerald-500/40 bg-emerald-950/40 text-emerald-300 hover:bg-emerald-900/50 text-[10px] font-mono cursor-pointer"
                                >
                                  Mark Resolved
                                </button>
                                <button
                                  onClick={() => setDismissingFinding(finding)}
                                  className="px-2 py-1 rounded border border-purple-500/40 bg-purple-950/40 text-purple-300 hover:bg-purple-900/50 text-[10px] font-mono cursor-pointer"
                                >
                                  Dismiss as Plot Device
                                </button>
                              </>
                            ) : (
                              <button
                                onClick={() => handleUpdateFindingStatus(finding.id, "open")}
                                className="px-2 py-1 rounded border border-[#232d56] bg-[#0b1029] text-[#b8b5d4] hover:text-white text-[10px] font-mono cursor-pointer"
                              >
                                Reopen
                              </button>
                            )}
                          </div>
                        </div>

                        <div>
                          <h6 className="font-cinzel text-sm font-bold text-[#faf8f2]">
                            {finding.title}
                          </h6>
                          <p className="font-cormorant text-sm text-[#bebcdb] mt-1 leading-relaxed">
                            {finding.explanation}
                          </p>
                        </div>

                        {finding.passage && (
                          <div className="p-2.5 rounded bg-[#030612]/70 border-l-2 border-[#d4af37]/60 text-xs font-cormorant italic text-[#dfdbca]">
                            &ldquo;{finding.passage}&rdquo;
                          </div>
                        )}

                        {finding.conflicting_canon && (
                          <div className="p-2 rounded bg-[#0b1029] border border-[#1b2344] text-[11px] font-mono text-[#a29fbf]">
                            <span className="text-[#fae48f] block mb-0.5">Conflicting Universe Canon:</span>
                            <span>{finding.conflicting_canon}</span>
                          </div>
                        )}

                        {finding.suggested_fix && (
                          <div className="p-2.5 rounded bg-[#0e163b]/60 border border-[#d4af37]/25 text-xs font-mono text-[#fae48f]">
                            <span className="text-[10px] uppercase tracking-wider block opacity-70 mb-0.5">
                              Author Recommendation:
                            </span>
                            <span>{finding.suggested_fix}</span>
                          </div>
                        )}

                        {finding.status === "dismissed" && finding.dismissal_reason && (
                          <div className="p-2 rounded bg-[#101429] border border-purple-500/30 text-[11px] font-mono text-purple-300">
                            <span className="opacity-70">Intentional Plot Device: </span>
                            <span>{finding.dismissal_reason}</span>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div className="flex-1 min-h-[460px] space-y-4 overflow-y-auto pr-1">
                {/* Entities Dashboard Control Bar */}
                <div className="flex flex-wrap items-center justify-between gap-3 p-3 rounded-xl border border-[#1b2344] bg-[#090e26]">
                  <div className="flex items-center gap-2">
                    <Users className="w-4 h-4 text-[#fae48f]" />
                    <span className="font-cinzel text-sm font-bold text-[#faf8f2]">
                      Chapter Lore &amp; Entity Links
                    </span>
                    <span className="text-[10px] font-mono text-[#787596] border border-[#1d264a] px-2 py-0.5 rounded-full">
                      {entityLinks.length} Tracked
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={handleRescanEntities}
                      disabled={isScanningEntities}
                      className="gold-glow-button inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-mono uppercase font-bold text-[#fae48f] cursor-pointer disabled:opacity-50"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${isScanningEntities ? "animate-spin" : ""}`} />
                      <span>{isScanningEntities ? "Scanning..." : "Re-Scan Entities"}</span>
                    </button>
                  </div>
                </div>

                {/* Entity Tracking Metrics */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <div className="p-2.5 rounded-lg border border-[#182143] bg-[#0b1029] text-center">
                    <span className="block text-lg font-bold font-mono text-[#fae48f]">
                      {entityLinks.filter((l) => l.entity_type === "character").length}
                    </span>
                    <span className="text-[10px] uppercase font-mono text-[#8b87a8]">Characters</span>
                  </div>
                  <div className="p-2.5 rounded-lg border border-[#182143] bg-[#0b1029] text-center">
                    <span className="block text-lg font-bold font-mono text-cyan-400">
                      {entityLinks.filter((l) => l.entity_type === "location").length}
                    </span>
                    <span className="text-[10px] uppercase font-mono text-[#8b87a8]">Locations</span>
                  </div>
                  <div className="p-2.5 rounded-lg border border-[#182143] bg-[#0b1029] text-center">
                    <span className="block text-lg font-bold font-mono text-purple-400">
                      {entityLinks.filter((l) => l.entity_type === "event").length}
                    </span>
                    <span className="text-[10px] uppercase font-mono text-[#8b87a8]">Events</span>
                  </div>
                  <div className="p-2.5 rounded-lg border border-[#182143] bg-[#0b1029] text-center">
                    <span className="block text-lg font-bold font-mono text-amber-400">
                      {entityLinks.filter((l) => l.entity_type === "unknown" || l.status === "needs_review").length}
                    </span>
                    <span className="text-[10px] uppercase font-mono text-[#8b87a8]">Needs Review</span>
                  </div>
                </div>

                {/* Filters */}
                <div className="flex flex-wrap items-center justify-between gap-2 p-2 rounded-lg border border-[#151c3b] bg-[#080d24]">
                  <div className="flex flex-wrap items-center gap-1.5 text-xs font-mono">
                    <span className="text-[11px] text-[#6f6c8d] mr-1 flex items-center gap-1">
                      <Filter className="w-3 h-3" /> Type:
                    </span>
                    {(["all", "character", "location", "event", "unknown"] as const).map((type) => (
                      <button
                        key={type}
                        onClick={() => setFilterEntityType(type)}
                        className={`px-2 py-0.5 rounded text-[11px] capitalize cursor-pointer transition-colors ${
                          filterEntityType === type
                            ? "bg-[#18224b] text-[#fae48f] font-bold border border-[#d4af37]/40"
                            : "text-[#8380a1] hover:text-white"
                        }`}
                      >
                        {type === "unknown" ? "Review Candidates" : type}
                      </button>
                    ))}
                  </div>

                  <div className="flex items-center gap-1.5 text-xs font-mono">
                    <span className="text-[11px] text-[#6f6c8d] mr-1">Status:</span>
                    {(["all", "confirmed", "detected", "needs_review", "dismissed"] as const).map((st) => (
                      <button
                        key={st}
                        onClick={() => setFilterLinkStatus(st)}
                        className={`px-2 py-0.5 rounded text-[11px] capitalize cursor-pointer transition-colors ${
                          filterLinkStatus === st
                            ? "bg-[#18224b] text-[#fae48f] font-bold border border-[#d4af37]/40"
                            : "text-[#8380a1] hover:text-white"
                        }`}
                      >
                        {st.replace("_", " ")}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Candidate Inscription Callout if any unknown entities */}
                {entityLinks.some((l) => l.entity_type === "unknown" || l.status === "needs_review") && (
                  <div className="p-3 rounded-xl border border-amber-500/30 bg-amber-950/20 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-mono font-bold uppercase text-amber-300 flex items-center gap-1.5">
                        <AlertTriangle className="w-3.5 h-3.5" />
                        Unregistered Entity Candidates Detected
                      </span>
                      <span className="text-[10px] font-mono text-amber-400/70">
                        Review to inscribe new canonical entries
                      </span>
                    </div>
                    <div className="space-y-2">
                      {entityLinks
                        .filter((l) => l.entity_type === "unknown" || l.status === "needs_review")
                        .map((candidate) => (
                          <div
                            key={candidate.id}
                            className="p-2.5 rounded-lg border border-amber-500/20 bg-[#070b1f] flex flex-wrap items-center justify-between gap-2"
                          >
                            <div className="min-w-0 max-w-md">
                              <span className="font-cinzel text-xs font-bold text-[#faf8f2] block">
                                {candidate.entity_name}
                              </span>
                              {candidate.passage && (
                                <p className="text-[11px] font-cormorant italic text-[#cec9b8] truncate">
                                  &ldquo;{candidate.passage}&rdquo;
                                </p>
                              )}
                            </div>
                            <div className="flex items-center gap-1.5">
                              <button
                                onClick={() => openRegisterModal(candidate, "character")}
                                className="px-2 py-1 rounded bg-[#101736] border border-[#d4af37]/40 text-[10px] font-mono font-bold text-[#fae48f] hover:bg-[#18224c] cursor-pointer"
                              >
                                + Inscribe Character
                              </button>
                              <button
                                onClick={() => openRegisterModal(candidate, "location")}
                                className="px-2 py-1 rounded bg-[#101736] border border-cyan-500/40 text-[10px] font-mono font-bold text-cyan-300 hover:bg-[#18224c] cursor-pointer"
                              >
                                + Inscribe Location
                              </button>
                              <button
                                onClick={() => handleDeleteLink(candidate.id)}
                                className="p-1 rounded text-[#8683a4] hover:text-rose-400 cursor-pointer"
                                title="Dismiss Candidate"
                              >
                                <X className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        ))}
                    </div>
                  </div>
                )}

                {/* Tracked Entities List */}
                {filteredEntityLinks.length === 0 ? (
                  <div className="p-8 text-center border border-dashed border-[#1c2448] rounded-xl text-[#716e8d] text-xs font-mono space-y-2">
                    <p>No entity links found matching active filters.</p>
                    <button
                      onClick={handleRescanEntities}
                      className="text-[#fae48f] underline hover:text-[#fff0a6] cursor-pointer"
                    >
                      Re-scan chapter manuscript now
                    </button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {filteredEntityLinks.map((link) => {
                      const isConfirmed = link.status === "confirmed";
                      const isNeedsReview = link.status === "needs_review";
                      const isDismissed = link.status === "dismissed";

                      return (
                        <div
                          key={link.id}
                          className={`p-3 rounded-xl border transition-all text-xs space-y-2.5 ${
                            isConfirmed
                              ? "border-emerald-500/30 bg-[#07131b]"
                              : isNeedsReview
                              ? "border-amber-500/40 bg-[#16120b]"
                              : isDismissed
                              ? "border-zinc-800 bg-[#080a14] opacity-60"
                              : "border-[#1b254a] bg-[#090e24]"
                          }`}
                        >
                          {/* Card Header */}
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="flex items-center gap-2">
                              {link.entity_type === "character" ? (
                                <Users className="w-3.5 h-3.5 text-[#fae48f]" />
                              ) : link.entity_type === "location" ? (
                                <MapPin className="w-3.5 h-3.5 text-cyan-400" />
                              ) : link.entity_type === "event" ? (
                                <Calendar className="w-3.5 h-3.5 text-purple-400" />
                              ) : (
                                <BookOpen className="w-3.5 h-3.5 text-amber-400" />
                              )}
                              <span className="font-cinzel text-sm font-bold text-[#faf8f2]">
                                {link.entity_name}
                              </span>
                              {link.matched_alias && link.matched_alias.toLowerCase() !== link.entity_name.toLowerCase() && (
                                <span className="text-[10px] font-mono text-[#a39fb8] bg-[#12193b] px-1.5 py-0.5 rounded">
                                  alias: {link.matched_alias}
                                </span>
                              )}
                              <span className="text-[10px] font-mono uppercase px-1.5 py-0.5 rounded bg-[#101738] text-[#8683a4] border border-[#1b254d]">
                                {link.entity_type}
                              </span>
                            </div>

                            <div className="flex items-center gap-1.5 font-mono text-[10px]">
                              {/* Status Badge */}
                              <span
                                className={`px-2 py-0.5 rounded-full border ${
                                  isConfirmed
                                    ? "border-emerald-500/40 bg-emerald-950/40 text-emerald-300"
                                    : isNeedsReview
                                    ? "border-amber-500/40 bg-amber-950/40 text-amber-300"
                                    : isDismissed
                                    ? "border-zinc-700 bg-zinc-900 text-zinc-400"
                                    : "border-sky-500/40 bg-sky-950/40 text-sky-300"
                                }`}
                              >
                                {link.status.replace("_", " ")}
                              </span>

                              {/* Relationship Type Badge */}
                              <span className="px-2 py-0.5 rounded-full border border-[#27325e] bg-[#0c122e] text-[#d1ceeb]">
                                {link.relationship_type}
                              </span>

                              {/* Mention count */}
                              <span className="text-[#726f8d]">
                                {link.mention_count || 1} &times;
                              </span>
                            </div>
                          </div>

                          {/* Evidence passage quote */}
                          {link.passage && (
                            <div className="p-2 rounded bg-[#030612]/70 border-l-2 border-[#d4af37]/60 text-xs font-cormorant italic text-[#dfdbca]">
                              &ldquo;{link.passage}&rdquo;
                            </div>
                          )}

                          {/* Provenance note */}
                          <div className="flex items-center justify-between text-[10px] font-mono text-[#6c6a85] pt-1">
                            <span>
                              Source: {link.source.replace("_", " ")} ({Math.round(Number(link.confidence || 1) * 100)}% conf)
                              {link.is_stale ? " • STALE (re-verify)" : ""}
                            </span>

                            {/* Author Action Controls */}
                            <div className="flex items-center gap-1.5">
                              {!isConfirmed && (
                                <button
                                  onClick={() =>
                                    handleUpdateLink(link.id, {
                                      status: "confirmed",
                                      source: "author_confirmed",
                                    })
                                  }
                                  className="px-2 py-0.5 rounded bg-emerald-900/30 border border-emerald-500/40 text-[10px] text-emerald-300 hover:bg-emerald-800/40 cursor-pointer"
                                  title="Confirm this entity connection in canon"
                                >
                                  Confirm Canon
                                </button>
                              )}

                              {link.entity_type === "character" && (
                                <button
                                  onClick={() =>
                                    handleUpdateLink(link.id, {
                                      relationship_type:
                                        link.relationship_type === "appears"
                                          ? "mentioned"
                                          : "appears",
                                      source: "author_confirmed",
                                    })
                                  }
                                  className="px-2 py-0.5 rounded bg-[#131b3e] border border-[#293563] text-[10px] text-[#fae48f] hover:bg-[#1a2554] cursor-pointer"
                                  title="Toggle between in-scene presence vs background mention"
                                >
                                  {link.relationship_type === "appears"
                                    ? "Mark Mentioned"
                                    : "Mark Appears"}
                                </button>
                              )}

                              {link.entity_type === "location" && (
                                <button
                                  onClick={() =>
                                    handleUpdateLink(link.id, {
                                      relationship_type:
                                        link.relationship_type === "setting"
                                          ? "mentioned"
                                          : "setting",
                                      source: "author_confirmed",
                                    })
                                  }
                                  className="px-2 py-0.5 rounded bg-[#131b3e] border border-[#293563] text-[10px] text-cyan-300 hover:bg-[#1a2554] cursor-pointer"
                                  title="Toggle between active scene setting vs background mention"
                                >
                                  {link.relationship_type === "setting"
                                    ? "Mark Mentioned"
                                    : "Mark Scene Setting"}
                                </button>
                              )}

                              {link.status !== "dismissed" ? (
                                <button
                                  onClick={() =>
                                    handleUpdateLink(link.id, { status: "dismissed" })
                                  }
                                  className="px-2 py-0.5 rounded border border-[#263056] text-[10px] text-[#82809f] hover:text-white cursor-pointer"
                                  title="Dismiss mention from active canon"
                                >
                                  Dismiss
                                </button>
                              ) : (
                                <button
                                  onClick={() =>
                                    handleUpdateLink(link.id, { status: "detected" })
                                  }
                                  className="px-2 py-0.5 rounded border border-[#263056] text-[10px] text-[#82809f] hover:text-white cursor-pointer"
                                >
                                  Restore
                                </button>
                              )}

                              <button
                                onClick={() => handleDeleteLink(link.id)}
                                className="p-1 rounded text-[#63617c] hover:text-rose-400 cursor-pointer"
                                title="Remove Link"
                              >
                                <Trash2 className="w-3 h-3" />
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* Bottom Metrics Bar */}
            <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-[#18203c] text-xs font-mono text-[#74728f]">
              <div className="flex items-center gap-4">
                <span>{wordCount} Words</span>
                <span>{charCount} Characters</span>
                <span className="flex items-center gap-1">
                  <Clock className="w-3 h-3 text-[#d4af37]" />
                  <span>~{readTimeMin} min read</span>
                </span>
              </div>
              <div className="text-[11px] text-[#63617b]">
                Autosave debounced • End-to-end local storage
              </div>
            </div>
          </div>
        </div>

        {/* Right Sidebar: Continuity Oracle & Plot-Hole Analysis */}
        {!distractionFree && (
          <div className="lg:col-span-3 space-y-3">
            <div className="p-3.5 rounded-xl border border-[#1b2344] bg-[#070b1e] space-y-3">
              <div className="flex items-center justify-between pb-2 border-b border-[#18203c]">
                <div className="flex items-center gap-2">
                  <Eye className="w-4 h-4 text-[#fae48f]" />
                  <span className="text-xs font-mono uppercase tracking-wider text-[#8a87a8]">
                    Canon Findings ({findings.length})
                  </span>
                  {analysisSummary && (
                    <span className="text-[10px] font-mono text-[#787596] hidden sm:inline">
                      ({analysisSummary.deterministicCount} Rules / {analysisSummary.aiCount} AI)
                    </span>
                  )}
                </div>
                <button
                  onClick={handleRunAnalysis}
                  disabled={isAnalyzing}
                  className="p-1 rounded text-[#fae48f] hover:bg-[#141b3c] transition-colors cursor-pointer"
                  title="Re-run Chapter Analysis"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isAnalyzing ? "animate-spin" : ""}`} />
                </button>
              </div>

              {/* Filtering Controls */}
              <div className="flex items-center gap-2 text-[10px] font-mono">
                <Filter className="w-3 h-3 text-[#6f6c8d]" />
                <select
                  value={filterStatus}
                  onChange={(e) => setFilterStatus(e.target.value as "all" | ChapterFindingStatus)}
                  className="bg-[#0b1028] border border-[#1b2344] rounded px-1.5 py-0.5 text-[#c5c2de] outline-none"
                >
                  <option value="all">Status: All</option>
                  <option value="open">Open</option>
                  <option value="accepted">Accepted</option>
                  <option value="dismissed">Dismissed</option>
                  <option value="resolved">Resolved</option>
                </select>
                <select
                  value={filterSeverity}
                  onChange={(e) => setFilterSeverity(e.target.value)}
                  className="bg-[#0b1028] border border-[#1b2344] rounded px-1.5 py-0.5 text-[#c5c2de] outline-none"
                >
                  <option value="all">Severity: All</option>
                  <option value="critical">Critical</option>
                  <option value="high">High</option>
                  <option value="medium">Medium</option>
                  <option value="low">Low</option>
                </select>
              </div>

              {/* Context limitation indicator */}
              {contextStats && (
                <div className="p-2 rounded-lg bg-[#0b1029] border border-[#17203d] text-[10px] font-mono text-[#787596] space-y-0.5">
                  <div className="flex justify-between">
                    <span>Context Checked:</span>
                    <span className="text-[#c0bddb]">
                      {contextStats.charactersCount} chars • {contextStats.locationsCount} locs • {contextStats.eventsCount} evts
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>Est. Tokens:</span>
                    <span className="text-[#fae48f]">~{contextStats.approximateTokens} tokens</span>
                  </div>
                </div>
              )}

              {/* Findings list */}
              <div className="space-y-3 max-h-[580px] overflow-y-auto pr-1">
                {filteredFindings.length === 0 ? (
                  <div className="text-center py-10 px-4 space-y-2">
                    {lastAnalyzedAt && findings.length === 0 ? (
                      <>
                        <CheckCircle2 className="w-8 h-8 text-emerald-400 mx-auto" />
                        <p className="font-cinzel text-xs text-emerald-300 font-semibold">
                          Canon Integrity Verified
                        </p>
                        <p className="font-cormorant text-xs text-[#a09dbf]">
                          Zero contradictions detected across established canon (Scanned at {lastAnalyzedAt}).
                        </p>
                      </>
                    ) : (
                      <>
                        <CheckCircle2 className="w-8 h-8 text-emerald-400/50 mx-auto" />
                        <p className="font-cinzel text-xs text-[#8e8cae]">
                          {findings.length === 0
                            ? "No contradictions detected yet. Select 'Analyze Chapter' to scan manuscript."
                            : "No findings match the selected filter."}
                        </p>
                      </>
                    )}
                  </div>
                ) : (
                  filteredFindings.map((finding) => {
                    const isStale = finding.is_stale;
                    return (
                      <div
                        key={finding.id}
                        className={`p-3 rounded-xl border text-xs space-y-2 transition-all ${
                          finding.status === "dismissed"
                            ? "border-[#1c2445]/50 bg-[#070b1e]/60 opacity-60"
                            : finding.status === "resolved"
                            ? "border-emerald-500/30 bg-emerald-950/20"
                            : finding.severity === "critical"
                            ? "border-rose-500/40 bg-rose-950/20"
                            : finding.severity === "high"
                            ? "border-amber-500/40 bg-amber-950/20"
                            : "border-[#1e274d] bg-[#090e26]"
                        }`}
                      >
                        {/* Header: Source, Category, Severity & Stale Badge */}
                        <div className="flex items-center justify-between gap-1">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span
                              className={`text-[9px] font-mono uppercase px-1.5 py-0.5 rounded ${
                                finding.source === "deterministic_rule"
                                  ? "bg-purple-950/70 border border-purple-500/40 text-purple-300"
                                  : "bg-blue-950/70 border border-blue-500/40 text-blue-300"
                              }`}
                            >
                              {finding.source === "deterministic_rule"
                                ? "Deterministic Rule"
                                : `Local AI (${Math.round(finding.confidence * 100)}%)`}
                            </span>
                            <span className="text-[9px] font-mono uppercase text-[#7a7899]">
                              {finding.category.replace(/_/g, " ")}
                            </span>
                          </div>

                          {isStale && (
                            <span className="text-[9px] font-mono px-1 py-0.2 rounded border border-amber-500/40 bg-amber-950/40 text-amber-300">
                              Stale
                            </span>
                          )}
                        </div>

                        {/* Title & Explanation */}
                        <div>
                          <h6 className="font-cinzel text-xs font-bold text-[#faf8f2]">
                            {finding.title}
                          </h6>
                          <p className="font-cormorant text-xs text-[#a2a0bf] mt-1 leading-relaxed">
                            {finding.explanation}
                          </p>
                        </div>

                        {/* Quoted Passage */}
                        {finding.passage && (
                          <div className="p-2 rounded bg-[#030612]/70 border-l-2 border-[#d4af37]/60 text-[11px] font-cormorant italic text-[#dfdbca]">
                            &ldquo;{finding.passage}&rdquo;
                          </div>
                        )}

                        {/* Conflicting Canon */}
                        {finding.conflicting_canon && (
                          <div className="p-1.5 rounded bg-[#0b1029] text-[10px] font-mono text-[#8f8caa]">
                            <span className="text-[#fae48f] block mb-0.5">Conflicting Canon:</span>
                            <span>{finding.conflicting_canon}</span>
                          </div>
                        )}

                        {/* Suggested Fix */}
                        {finding.suggested_fix && (
                          <div className="p-2 rounded bg-[#0e163b]/60 border border-[#d4af37]/25 text-[11px] font-mono text-[#fae48f]">
                            <span className="text-[9px] uppercase tracking-wider block opacity-70 mb-0.5">
                              Suggested Fix:
                            </span>
                            <span>{finding.suggested_fix}</span>
                          </div>
                        )}

                        {/* Dismissal Reason Display */}
                        {finding.status === "dismissed" && finding.dismissal_reason && (
                          <div className="p-1.5 rounded bg-[#101429] text-[10px] font-mono text-purple-300">
                            <span className="opacity-70">Intentional Plot Device: </span>
                            <span>{finding.dismissal_reason}</span>
                          </div>
                        )}

                        {/* Author Action Controls */}
                        {!universe.is_example && (
                          <div className="flex items-center justify-end gap-1.5 pt-1 border-t border-[#18203c]/60">
                            {finding.status === "open" && (
                              <>
                                <button
                                  onClick={() => handleUpdateFindingStatus(finding.id, "accepted")}
                                  className="inline-flex items-center gap-1 px-2 py-1 rounded bg-[#0e173b] border border-[#d4af37]/40 text-[10px] font-mono text-[#fae48f] hover:bg-[#152050] cursor-pointer"
                                  title="Accept this resolution"
                                >
                                  <Check className="w-3 h-3" />
                                  <span>Accept Fix</span>
                                </button>
                                <button
                                  onClick={() => setDismissingFinding(finding)}
                                  className="inline-flex items-center gap-1 px-2 py-1 rounded bg-[#141b38] border border-[#2e3b6d] text-[10px] font-mono text-[#9895b8] hover:text-white cursor-pointer"
                                  title="Mark as intentional narrative device"
                                >
                                  <HelpCircle className="w-3 h-3" />
                                  <span>Intentional</span>
                                </button>
                                <button
                                  onClick={() => handleUpdateFindingStatus(finding.id, "resolved")}
                                  className="inline-flex items-center gap-1 px-2 py-1 rounded bg-emerald-950/40 border border-emerald-500/40 text-[10px] font-mono text-emerald-300 hover:bg-emerald-900/40 cursor-pointer"
                                >
                                  <span>Resolved</span>
                                </button>
                              </>
                            )}

                            {(finding.status === "dismissed" ||
                              finding.status === "accepted" ||
                              finding.status === "resolved") && (
                              <button
                                onClick={() => handleUpdateFindingStatus(finding.id, "open")}
                                className="text-[10px] font-mono text-[#7b7899] hover:text-[#fae48f] cursor-pointer"
                              >
                                Re-evaluate
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Dismissal Reason Modal */}
      {dismissingFinding && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="w-full max-w-md celestial-card p-6 rounded-2xl border border-[#d4af37]/40 bg-[#080d24] text-left space-y-4">
            <h4 className="font-cinzel text-base font-bold text-[#faf8f2]">
              Mark as Intentional Narrative Choice
            </h4>
            <p className="font-cormorant text-xs text-[#a09ebf]">
              You are recording this potential discrepancy as a deliberate plot device. The Continuity Oracle will not treat it as an error on subsequent scans.
            </p>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-mono uppercase text-[#8986a8] mb-1">
                  Preset Narrative Reason
                </label>
                <select
                  value={dismissalPreset}
                  onChange={(e) => setDismissalPreset(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-[#232c52] bg-[#0d1330] text-[#fbf9f4] text-xs font-mono outline-none"
                >
                  <option value="Unreliable Narrator (Deliberate character bias)">
                    Unreliable Narrator (Deliberate character bias)
                  </option>
                  <option value="Deliberate Temporal Paradox (Mystical/time anomaly)">
                    Deliberate Temporal Paradox (Mystical/time anomaly)
                  </option>
                  <option value="Flashback or Dream Vision (Non-linear sequence)">
                    Flashback or Dream Vision (Non-linear sequence)
                  </option>
                  <option value="Secret Resurrection or Identity Concealment">
                    Secret Resurrection or Identity Concealment
                  </option>
                  <option value="Poetic or Mythic Hyperbole">
                    Poetic or Mythic Hyperbole
                  </option>
                  <option value="Other / Custom Reason">
                    Other (Specify below)
                  </option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-mono uppercase text-[#8986a8] mb-1">
                  Author&apos;s Explanation (Optional)
                </label>
                <textarea
                  rows={2}
                  value={customDismissalReason}
                  onChange={(e) => setCustomDismissalReason(e.target.value)}
                  placeholder="Record your creative intent for this apparent anomaly..."
                  className="w-full px-3 py-2 rounded-lg border border-[#232c52] bg-[#0d1330] text-[#fbf9f4] text-xs outline-none"
                />
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setDismissingFinding(null)}
                className="px-4 py-2 rounded-lg border border-[#232c52] text-xs font-mono text-[#8a88ab] hover:text-white"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmDismissal}
                className="gold-glow-button px-5 py-2 rounded-lg text-xs font-mono font-bold text-[#fae48f]"
              >
                Confirm Intentional Choice
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Create New Chapter Modal */}
      {isCreatingChapter && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="w-full max-w-md celestial-card p-6 rounded-2xl border border-[#d4af37]/40 bg-[#080d24] text-left space-y-4">
            <h4 className="font-cinzel text-lg font-bold text-[#faf8f2]">
              Inscribe New Chapter
            </h4>
            <form onSubmit={handleCreateChapter} className="space-y-4">
              <div>
                <label className="block text-xs font-mono uppercase text-[#8986a8] mb-1">
                  Chapter Title
                </label>
                <input
                  type="text"
                  required
                  value={newChapterTitle}
                  onChange={(e) => setNewChapterTitle(e.target.value)}
                  placeholder="e.g. The Second Astral Awakening"
                  className="w-full px-3 py-2 rounded-lg border border-[#232c52] bg-[#0d1330] text-[#fbf9f4] text-sm focus:border-[#fae48f] outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-mono uppercase text-[#8986a8] mb-1">
                  Summary / Arc Notes
                </label>
                <textarea
                  rows={3}
                  value={newChapterSummary}
                  onChange={(e) => setNewChapterSummary(e.target.value)}
                  placeholder="Brief narrative arc overview..."
                  className="w-full px-3 py-2 rounded-lg border border-[#232c52] bg-[#0d1330] text-[#fbf9f4] text-sm focus:border-[#fae48f] outline-none"
                />
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setIsCreatingChapter(false)}
                  className="px-4 py-2 rounded-lg border border-[#232c52] text-xs font-mono text-[#8a88ab] hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingNew}
                  className="gold-glow-button px-5 py-2 rounded-lg text-xs font-mono font-bold text-[#fae48f]"
                >
                  {isSubmittingNew ? "Inscribing..." : "Inscribe Chapter"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Candidate Inscription Modal */}
      {registeringCandidate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="w-full max-w-md celestial-card p-6 rounded-2xl border border-[#d4af37]/40 bg-[#080d24] text-left space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-[#1f284c]">
              <h4 className="font-cinzel text-lg font-bold text-[#faf8f2]">
                Inscribe Canonical Entity
              </h4>
              <button
                onClick={() => setRegisteringCandidate(null)}
                className="text-[#7f7c9e] hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleRegisterUnknown} className="space-y-4">
              <div>
                <label className="block text-xs font-mono uppercase text-[#8986a8] mb-1">
                  Entity Type
                </label>
                <div className="flex items-center gap-4 text-xs font-mono">
                  <label className="flex items-center gap-1.5 cursor-pointer text-[#faf8f2]">
                    <input
                      type="radio"
                      name="registerType"
                      value="character"
                      checked={registerType === "character"}
                      onChange={() => setRegisterType("character")}
                      className="accent-[#fae48f]"
                    />
                    Character
                  </label>
                  <label className="flex items-center gap-1.5 cursor-pointer text-[#faf8f2]">
                    <input
                      type="radio"
                      name="registerType"
                      value="location"
                      checked={registerType === "location"}
                      onChange={() => setRegisterType("location")}
                      className="accent-cyan-400"
                    />
                    Location
                  </label>
                </div>
              </div>

              <div>
                <label className="block text-xs font-mono uppercase text-[#8986a8] mb-1">
                  Entity Name
                </label>
                <input
                  type="text"
                  required
                  value={registerName}
                  onChange={(e) => setRegisterName(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-[#232c52] bg-[#0d1330] text-[#fbf9f4] text-sm focus:border-[#fae48f] outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-mono uppercase text-[#8986a8] mb-1">
                  {registerType === "character" ? "Bio & Role" : "Description"}
                </label>
                <textarea
                  rows={3}
                  value={registerBio}
                  onChange={(e) => setRegisterBio(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-[#232c52] bg-[#0d1330] text-[#fbf9f4] text-sm focus:border-[#fae48f] outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-mono uppercase text-[#8986a8] mb-1">
                  {registerType === "character" ? "Affiliation / Role" : "Realm / Region"}
                </label>
                <input
                  type="text"
                  value={registerRealm}
                  onChange={(e) => setRegisterRealm(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-[#232c52] bg-[#0d1330] text-[#fbf9f4] text-sm focus:border-[#fae48f] outline-none"
                />
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setRegisteringCandidate(null)}
                  className="px-4 py-2 rounded-lg border border-[#232c52] text-xs font-mono text-[#8a88ab] hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="gold-glow-button px-5 py-2 rounded-lg text-xs font-mono font-bold text-[#fae48f]"
                >
                  Inscribe to Universe Canon
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Manuscript Import Modal */}
      <ManuscriptImportModal
        isOpen={isImportModalOpen}
        onClose={() => setIsImportModalOpen(false)}
        targetStory={story}
        stories={stories}
        onImportComplete={handleImportComplete}
      />
    </div>
  );
}
