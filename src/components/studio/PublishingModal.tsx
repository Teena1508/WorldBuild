"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
  Globe,
  Upload,
  CheckCircle,
  AlertTriangle,
  X,
  ExternalLink,
  RefreshCw,
  Eye,
  BookOpen,
  ArrowUp,
  ArrowDown,
  Sparkles,
  ShieldAlert,
  Layers,
  FileText,
} from "lucide-react";
import { Story } from "@/lib/db/types";
import { BookCover } from "@/components/ui/BookCover";

interface PublishingModalProps {
  isOpen: boolean;
  onClose: () => void;
  story: Story;
  onStoryUpdated?: (updatedStory: Story) => void;
}

interface ChapterPublicationStatus {
  id: string;
  title: string;
  sequence_number: number;
  word_count: number;
  draft_version: number;
  draft_updated_at: string;
  is_published: boolean;
  published_version?: number;
  published_sequence?: number;
  published_at?: string;
  has_unpublished_changes: boolean;
}

const COVER_PRESETS = [
  {
    name: "Starlight Citadel",
    url: "/covers/citadel.svg",
  },
  {
    name: "Occult Scriptorium",
    url: "/covers/scriptorium.svg",
  },
  {
    name: "Cosmic Nebula",
    url: "/covers/nebula.svg",
  },
  {
    name: "Abyssal Gate",
    url: "/covers/gate.svg",
  },
  {
    name: "Obsidian Astrolabe",
    url: "/covers/astrolabe.svg",
  },
];

const GENRE_OPTIONS = [
  "High Fantasy",
  "Dark Fantasy",
  "Grimdark",
  "Cosmic Horror",
  "Mythic Lore",
  "Sword & Sorcery",
  "Urban Arcana",
  "Science Fantasy",
];

export function PublishingModal({
  isOpen,
  onClose,
  story,
  onStoryUpdated,
}: PublishingModalProps) {
  const [activeTab, setActiveTab] = useState<"metadata" | "chapters" | "preview">("metadata");
  const [isLoadingStatus, setIsLoadingStatus] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Form Fields
  const [title, setTitle] = useState(story.title || "");
  const [description, setDescription] = useState(story.description || "");
  const [slug, setSlug] = useState(story.slug || "");
  const [genres, setGenres] = useState(story.genres || "");
  const [tags, setTags] = useState(story.tags || "");
  const [coverUrl, setCoverUrl] = useState(story.cover_url || "");

  // Slug Availability State
  const [slugStatus, setSlugStatus] = useState<{
    valid: boolean;
    available: boolean;
    reason?: string;
  } | null>(null);
  const [isCheckingSlug, setIsCheckingSlug] = useState(false);

  // Publication and Chapters State
  const [publication, setPublication] = useState<{
    id: string;
    slug: string;
    status: "published" | "unpublished";
    publication_version: number;
    published_at: string;
  } | null>(null);
  const [chapters, setChapters] = useState<ChapterPublicationStatus[]>([]);
  const [selectedChapterIds, setSelectedChapterIds] = useState<string[]>([]);
  const [hasUnpublishedStoryChanges, setHasUnpublishedStoryChanges] = useState(false);

  // Cover image upload state
  const [isUploadingCover, setIsUploadingCover] = useState(false);

  const fetchPublicationStatus = useCallback(async () => {
    try {
      const res = await fetch(`/api/stories/${story.id}/publish`);
      if (!res.ok) {
        throw new Error("Failed to load publication status");
      }
      const data = await res.json();
      setPublication(data.publication);
      setChapters(data.chapters || []);
      setHasUnpublishedStoryChanges(data.has_unpublished_story_changes);

      if (data.publication?.slug) {
        setSlug(data.publication.slug);
      } else if (story.title) {
        const autoSlug = story.title
          .toLowerCase()
          .replace(/[^a-z0-9\s-]/g, "")
          .trim()
          .replace(/\s+/g, "-");
        setSlug(autoSlug);
      }

      if (data.publication?.public_title) {
        setTitle(data.publication.public_title);
      }
      if (data.publication?.public_description) {
        setDescription(data.publication.public_description);
      }
      if (data.publication?.cover_url) {
        setCoverUrl(data.publication.cover_url);
      }
      if (data.publication?.genres) {
        setGenres(data.publication.genres);
      }
      if (data.publication?.tags) {
        setTags(data.publication.tags);
      }

      const publishedIds = (data.chapters || [])
        .filter((c: ChapterPublicationStatus) => c.is_published)
        .map((c: ChapterPublicationStatus) => c.id);

      if (publishedIds.length > 0) {
        setSelectedChapterIds(publishedIds);
      } else {
        setSelectedChapterIds((data.chapters || []).map((c: ChapterPublicationStatus) => c.id));
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Error contacting publishing realm";
      setErrorMessage(msg);
    } finally {
      setIsLoadingStatus(false);
    }
  }, [story.id, story.title]);

  useEffect(() => {
    if (!isOpen) return;
    let active = true;

    fetch(`/api/stories/${story.id}/publish`)
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error("Failed to load publication status"))))
      .then((data) => {
        if (!active) return;
        setPublication(data.publication);
        setChapters(data.chapters || []);
        setHasUnpublishedStoryChanges(data.has_unpublished_story_changes);

        if (data.publication?.slug) {
          setSlug(data.publication.slug);
        } else if (story.title) {
          const autoSlug = story.title
            .toLowerCase()
            .replace(/[^a-z0-9\s-]/g, "")
            .trim()
            .replace(/\s+/g, "-");
          setSlug(autoSlug);
        }

        if (data.publication?.public_title) setTitle(data.publication.public_title);
        if (data.publication?.public_description) setDescription(data.publication.public_description);
        if (data.publication?.cover_url) setCoverUrl(data.publication.cover_url);
        if (data.publication?.genres) setGenres(data.publication.genres);
        if (data.publication?.tags) setTags(data.publication.tags);

        const publishedIds = (data.chapters || [])
          .filter((c: ChapterPublicationStatus) => c.is_published)
          .map((c: ChapterPublicationStatus) => c.id);

        if (publishedIds.length > 0) {
          setSelectedChapterIds(publishedIds);
        } else {
          setSelectedChapterIds((data.chapters || []).map((c: ChapterPublicationStatus) => c.id));
        }
      })
      .catch((err: unknown) => {
        if (active) setErrorMessage(err instanceof Error ? err.message : "Error contacting publishing realm");
      })
      .finally(() => {
        if (active) setIsLoadingStatus(false);
      });

    return () => {
      active = false;
    };
  }, [isOpen, story.id, story.title]);

  // Check slug availability on blur or trigger
  const checkSlugAvailability = async (candidateSlug: string) => {
    const clean = candidateSlug.trim().toLowerCase();
    if (!clean) {
      setSlugStatus(null);
      return;
    }
    setIsCheckingSlug(true);
    try {
      const res = await fetch(
        `/api/stories/check-slug?slug=${encodeURIComponent(clean)}&story_id=${story.id}`
      );
      const data = await res.json();
      setSlugStatus({
        valid: data.valid,
        available: data.available,
        reason: data.reason,
      });
      if (data.slug && data.slug !== clean) {
        setSlug(data.slug);
      }
    } catch {
      setSlugStatus({ valid: false, available: false, reason: "Failed to verify slug" });
    } finally {
      setIsCheckingSlug(false);
    }
  };

  // Safe Cover Image Upload Handler
  const handleCoverUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploadingCover(true);
    setErrorMessage(null);

    const formData = new FormData();
    formData.append("file", file);

    try {
      const res = await fetch("/api/stories/upload-cover", {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to upload image");
      }
      setCoverUrl(data.url);
      setSuccessMessage("Cover image uploaded safely to archive storage");
      setTimeout(() => setSuccessMessage(null), 4000);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Upload failed";
      setErrorMessage(msg);
    } finally {
      setIsUploadingCover(false);
    }
  };

  // Save draft metadata without publishing
  const handleSaveDraftMetadata = async () => {
    setIsSubmitting(true);
    setErrorMessage(null);
    try {
      const res = await fetch(`/api/stories/${story.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          description,
          cover_url: coverUrl || null,
          slug,
          genres,
          tags,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to save draft metadata");
      }
      setSuccessMessage("Draft metadata saved securely");
      if (onStoryUpdated && data.story) {
        onStoryUpdated(data.story);
      }
      setTimeout(() => setSuccessMessage(null), 4000);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Error saving draft metadata";
      setErrorMessage(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Publish or Publish Update
  const handlePublish = async () => {
    setIsSubmitting(true);
    setErrorMessage(null);
    try {
      const res = await fetch(`/api/stories/${story.id}/publish`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          public_title: title,
          public_description: description,
          slug,
          cover_url: coverUrl || null,
          genres,
          tags,
          selected_chapter_ids: selectedChapterIds,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Publication failed");
      }

      setSuccessMessage(data.message || "Story successfully published to the world!");
      await fetchPublicationStatus();
      if (onStoryUpdated) {
        onStoryUpdated({
          ...story,
          title,
          status: "published",
          cover_url: coverUrl,
          slug,
        });
      }
      setTimeout(() => setSuccessMessage(null), 5000);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Publication error";
      setErrorMessage(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Unpublish Story
  const handleUnpublish = async () => {
    if (
      !window.confirm(
        "Are you certain you wish to unpublish this story? Public readers will immediately receive a 404 and it will be withdrawn from discovery. Historical snapshots will be preserved."
      )
    ) {
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);
    try {
      const res = await fetch(`/api/stories/${story.id}/unpublish`, {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to unpublish story");
      }
      setSuccessMessage("Story has been unpublished from public discovery");
      await fetchPublicationStatus();
      if (onStoryUpdated) {
        onStoryUpdated({
          ...story,
          status: "draft",
        });
      }
      setTimeout(() => setSuccessMessage(null), 4000);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Unpublish error";
      setErrorMessage(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Chapter Order Adjustment
  const moveChapter = (index: number, direction: "up" | "down") => {
    const targetIndex = direction === "up" ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= selectedChapterIds.length) return;

    const updated = [...selectedChapterIds];
    const temp = updated[index];
    updated[index] = updated[targetIndex];
    updated[targetIndex] = temp;
    setSelectedChapterIds(updated);
  };

  const toggleChapterSelection = (id: string) => {
    if (selectedChapterIds.includes(id)) {
      setSelectedChapterIds(selectedChapterIds.filter((cId) => cId !== id));
    } else {
      setSelectedChapterIds([...selectedChapterIds, id]);
    }
  };

  if (!isOpen) return null;

  const isPublished = publication?.status === "published";
  const publishedVersion = publication?.publication_version || 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-black/85 backdrop-blur-md">
      <div className="relative w-full max-w-4xl max-h-[92vh] flex flex-col rounded-2xl border border-[#d4af37]/30 bg-[#070913] text-[#e0ddcf] shadow-[0_10px_50px_rgba(0,0,0,0.8)] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#1b223c] bg-[#0c1024]">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl border border-[#d4af37]/40 bg-[#141936] flex items-center justify-center text-[#fae48f] shadow-[0_0_15px_rgba(212,175,55,0.2)]">
              <Globe className="w-5 h-5 text-[#fae48f]" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="font-cinzel text-lg font-bold tracking-wider text-[#fae48f]">
                  Celestial Publication Sanctum
                </h2>
                {isPublished ? (
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold tracking-wider uppercase bg-emerald-950/80 text-emerald-400 border border-emerald-500/40">
                    <CheckCircle className="w-3 h-3" /> Live (v{publishedVersion})
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold tracking-wider uppercase bg-amber-950/60 text-amber-300 border border-amber-500/30">
                    Draft / Unpublished
                  </span>
                )}
              </div>
              <p className="text-xs font-mono text-[#8a87a8]">
                Story: {story.title}
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-lg text-[#8a87a8] hover:text-white hover:bg-[#161c38] transition-colors"
            aria-label="Close publishing modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Unpublished changes banner */}
        {isPublished && hasUnpublishedStoryChanges && (
          <div className="px-6 py-2.5 bg-amber-950/40 border-b border-amber-500/30 flex items-center justify-between text-xs text-amber-200">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
              <span>
                <strong>Unpublished draft changes detected:</strong> Readers are currently seeing published snapshot v{publishedVersion}. Publish an update to release your latest manuscript edits.
              </span>
            </div>
            <button
              onClick={() => setActiveTab("chapters")}
              className="underline hover:text-white font-mono text-[11px]"
            >
              Review changes
            </button>
          </div>
        )}

        {/* Error / Success Toast Messages */}
        {errorMessage && (
          <div className="px-6 py-2 bg-rose-950/60 border-b border-rose-500/30 flex items-center gap-2 text-xs text-rose-300">
            <ShieldAlert className="w-4 h-4 shrink-0 text-rose-400" />
            <span>{errorMessage}</span>
          </div>
        )}
        {successMessage && (
          <div className="px-6 py-2 bg-emerald-950/60 border-b border-emerald-500/30 flex items-center gap-2 text-xs text-emerald-300">
            <CheckCircle className="w-4 h-4 shrink-0 text-emerald-400" />
            <span>{successMessage}</span>
          </div>
        )}

        {/* Tab Navigation */}
        <div className="flex items-center gap-1 px-6 border-b border-[#1b223c] bg-[#090d22]">
          <button
            onClick={() => setActiveTab("metadata")}
            className={`py-3 px-4 text-xs font-mono tracking-wider uppercase border-b-2 transition-all flex items-center gap-2 ${
              activeTab === "metadata"
                ? "border-[#fae48f] text-[#fae48f] font-semibold bg-[#111736]/40"
                : "border-transparent text-[#8a87a8] hover:text-[#d4af37]"
            }`}
          >
            <FileText className="w-3.5 h-3.5" />
            1. Metadata & Cover
          </button>
          <button
            onClick={() => setActiveTab("chapters")}
            className={`py-3 px-4 text-xs font-mono tracking-wider uppercase border-b-2 transition-all flex items-center gap-2 ${
              activeTab === "chapters"
                ? "border-[#fae48f] text-[#fae48f] font-semibold bg-[#111736]/40"
                : "border-transparent text-[#8a87a8] hover:text-[#d4af37]"
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            2. Chapter Selection ({selectedChapterIds.length}/{chapters.length})
          </button>
          <button
            onClick={() => setActiveTab("preview")}
            className={`py-3 px-4 text-xs font-mono tracking-wider uppercase border-b-2 transition-all flex items-center gap-2 ${
              activeTab === "preview"
                ? "border-[#fae48f] text-[#fae48f] font-semibold bg-[#111736]/40"
                : "border-transparent text-[#8a87a8] hover:text-[#d4af37]"
            }`}
          >
            <Eye className="w-3.5 h-3.5" />
            3. Reader Preview
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {isLoadingStatus ? (
            <div className="py-20 flex flex-col items-center justify-center gap-3 text-[#8a87a8]">
              <RefreshCw className="w-6 h-6 animate-spin text-[#d4af37]" />
              <p className="text-xs font-mono">Consulting the publishing ledger...</p>
            </div>
          ) : activeTab === "metadata" ? (
            /* Tab 1: Metadata & Cover */
            <div className="space-y-6">
              {/* Title & URL Slug */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-mono uppercase tracking-wider text-[#d4af37] mb-1.5">
                    Public Story Title *
                  </label>
                  <input
                    type="text"
                    value={title}
                    onChange={(e) => {
                      setTitle(e.target.value);
                      if (!slug) {
                        const auto = e.target.value
                          .toLowerCase()
                          .replace(/[^a-z0-9\s-]/g, "")
                          .trim()
                          .replace(/\s+/g, "-");
                        setSlug(auto);
                      }
                    }}
                    placeholder="Enter public title..."
                    className="w-full px-3.5 py-2.5 rounded-lg bg-[#0d1226] border border-[#1e274a] focus:border-[#d4af37] focus:outline-none text-sm text-[#e0ddcf] placeholder-[#575570]"
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-xs font-mono uppercase tracking-wider text-[#d4af37]">
                      Unique URL Slug *
                    </label>
                    {isCheckingSlug && (
                      <span className="text-[10px] font-mono text-[#8a87a8] animate-pulse">
                        Checking availability...
                      </span>
                    )}
                  </div>
                  <div className="relative">
                    <input
                      type="text"
                      value={slug}
                      onChange={(e) => {
                        setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""));
                        setSlugStatus(null);
                      }}
                      onBlur={() => checkSlugAvailability(slug)}
                      placeholder="e.g. echo-of-the-abyss"
                      className={`w-full px-3.5 py-2.5 rounded-lg bg-[#0d1226] border text-sm text-[#e0ddcf] placeholder-[#575570] focus:outline-none pr-10 font-mono ${
                        slugStatus?.available
                          ? "border-emerald-500/60 focus:border-emerald-400"
                          : slugStatus?.available === false
                          ? "border-rose-500/60 focus:border-rose-400"
                          : "border-[#1e274a] focus:border-[#d4af37]"
                      }`}
                    />
                    <div className="absolute right-3 top-3">
                      {slugStatus?.available ? (
                        <CheckCircle className="w-4 h-4 text-emerald-400" />
                      ) : slugStatus?.available === false ? (
                        <AlertTriangle className="w-4 h-4 text-rose-400" />
                      ) : null}
                    </div>
                  </div>
                  <p className="mt-1 text-[11px] font-mono text-[#7e7c99]">
                    Public URL: <span className="text-[#fae48f]">/read/{slug || "[slug]"}</span>
                  </p>
                  {slugStatus?.reason && (
                    <p
                      className={`text-[11px] font-mono mt-0.5 ${
                        slugStatus.available ? "text-emerald-400" : "text-rose-400"
                      }`}
                    >
                      {slugStatus.reason}
                    </p>
                  )}
                </div>
              </div>

              {/* Public Description */}
              <div>
                <label className="block text-xs font-mono uppercase tracking-wider text-[#d4af37] mb-1.5">
                  Public Synopsis / Description
                </label>
                <textarea
                  rows={3}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Hook readers with the public back-cover synopsis..."
                  className="w-full px-3.5 py-2.5 rounded-lg bg-[#0d1226] border border-[#1e274a] focus:border-[#d4af37] focus:outline-none text-sm text-[#e0ddcf] placeholder-[#575570]"
                />
              </div>

              {/* Genres & Tags */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-mono uppercase tracking-wider text-[#d4af37] mb-1.5">
                    Genres (Comma Separated)
                  </label>
                  <input
                    type="text"
                    value={genres}
                    onChange={(e) => setGenres(e.target.value)}
                    placeholder="e.g. Dark Fantasy, Grimdark, Cosmic Horror"
                    className="w-full px-3.5 py-2.5 rounded-lg bg-[#0d1226] border border-[#1e274a] focus:border-[#d4af37] focus:outline-none text-sm text-[#e0ddcf] placeholder-[#575570]"
                  />
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {GENRE_OPTIONS.map((g) => (
                      <button
                        key={g}
                        type="button"
                        onClick={() => {
                          const current = genres
                            .split(",")
                            .map((s) => s.trim())
                            .filter(Boolean);
                          if (!current.includes(g)) {
                            setGenres([...current, g].join(", "));
                          }
                        }}
                        className="px-2 py-0.5 rounded text-[10px] font-mono bg-[#141a38] text-[#c4c1d8] hover:text-[#fae48f] hover:bg-[#1b234d] border border-[#202b54] transition-colors"
                      >
                        + {g}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-mono uppercase tracking-wider text-[#d4af37] mb-1.5">
                    Tags (Keywords)
                  </label>
                  <input
                    type="text"
                    value={tags}
                    onChange={(e) => setTags(e.target.value)}
                    placeholder="e.g. Astral Plane, Necromancy, Lost Empire"
                    className="w-full px-3.5 py-2.5 rounded-lg bg-[#0d1226] border border-[#1e274a] focus:border-[#d4af37] focus:outline-none text-sm text-[#e0ddcf] placeholder-[#575570]"
                  />
                  <p className="text-[11px] font-mono text-[#7e7c99] mt-1.5">
                    Used for search indexing and theme tags in public exploration.
                  </p>
                </div>
              </div>

              {/* Cover Image Section */}
              <div className="pt-2 border-t border-[#1b223c]">
                <label className="block text-xs font-mono uppercase tracking-wider text-[#d4af37] mb-2">
                  Cover Artwork
                </label>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {/* Preview of Current Cover */}
                  <div className="max-h-52">
                    <BookCover
                      src={coverUrl}
                      title={title || story.title}
                      aspect="portrait"
                      className="max-h-52"
                    />
                  </div>

                  {/* Upload and URL Controls */}
                  <div className="md:col-span-2 space-y-4">
                    {/* Safe File Upload */}
                    <div>
                      <span className="block text-xs font-mono text-[#c4c1d8] mb-1.5">
                        Upload Cover Image (Max 5MB • JPEG/PNG/WEBP)
                      </span>
                      <label className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg border border-dashed border-[#2d3968] hover:border-[#fae48f] bg-[#0e1329] hover:bg-[#151c3d] cursor-pointer text-xs font-mono text-[#fae48f] transition-all">
                        <Upload className="w-4 h-4" />
                        <span>{isUploadingCover ? "Uploading file safely..." : "Choose Image File"}</span>
                        <input
                          type="file"
                          accept="image/jpeg,image/png,image/webp,image/gif"
                          onChange={handleCoverUpload}
                          disabled={isUploadingCover}
                          className="hidden"
                        />
                      </label>
                    </div>

                    {/* Or Custom URL */}
                    <div>
                      <span className="block text-xs font-mono text-[#c4c1d8] mb-1">
                        Or Image URL
                      </span>
                      <input
                        type="url"
                        value={coverUrl}
                        onChange={(e) => setCoverUrl(e.target.value)}
                        placeholder="https://..."
                        className="w-full px-3.5 py-2 rounded-lg bg-[#0d1226] border border-[#1e274a] text-xs text-[#e0ddcf] placeholder-[#575570]"
                      />
                    </div>

                    {/* Presets */}
                    <div>
                      <span className="block text-xs font-mono text-[#8a87a8] mb-1.5">
                        Or Select Sanctum Preset:
                      </span>
                      <div className="flex flex-wrap gap-2">
                        {COVER_PRESETS.map((p) => (
                          <button
                            key={p.name}
                            type="button"
                            onClick={() => setCoverUrl(p.url)}
                            className={`px-2.5 py-1 rounded text-[11px] font-mono border transition-all ${
                              coverUrl === p.url
                                ? "bg-[#fae48f]/10 border-[#fae48f] text-[#fae48f]"
                                : "bg-[#0f142c] border-[#1d2547] text-[#9a97b4] hover:border-[#d4af37]/50"
                            }`}
                          >
                            {p.name}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ) : activeTab === "chapters" ? (
            /* Tab 2: Chapter Selection & Order */
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-[#fae48f] font-cinzel">
                    Choose Chapters to Publish
                  </h3>
                  <p className="text-xs font-mono text-[#8a87a8]">
                    Select which chapters are included in the publication and set their sequence. Only selected chapters will be visible to readers.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setSelectedChapterIds(chapters.map((c) => c.id))}
                    className="px-2.5 py-1 rounded text-xs font-mono bg-[#141a38] text-[#fae48f] hover:bg-[#1b234d] border border-[#222c54]"
                  >
                    Select All
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedChapterIds([])}
                    className="px-2.5 py-1 rounded text-xs font-mono bg-[#141a38] text-[#8a87a8] hover:bg-[#1b234d] border border-[#222c54]"
                  >
                    Deselect All
                  </button>
                </div>
              </div>

              {chapters.length === 0 ? (
                <div className="py-12 text-center rounded-xl border border-dashed border-[#1e274a] text-[#8a87a8]">
                  <BookOpen className="w-8 h-8 mx-auto mb-2 opacity-40 text-[#d4af37]" />
                  <p className="text-xs font-mono">No manuscript chapters found in this story yet.</p>
                  <p className="text-[11px] font-mono text-[#626079] mt-1">
                    You can still publish the story shell or add chapters first in Story Studio.
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  {chapters.map((chap) => {
                    const isSelected = selectedChapterIds.includes(chap.id);
                    const selectedIndex = selectedChapterIds.indexOf(chap.id);

                    return (
                      <div
                        key={chap.id}
                        className={`p-3.5 rounded-xl border transition-all flex items-center justify-between ${
                          isSelected
                            ? "bg-[#0f1532] border-[#d4af37]/40 shadow-sm"
                            : "bg-[#090d20] border-[#182040] opacity-60"
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleChapterSelection(chap.id)}
                            className="w-4 h-4 rounded border-[#24305c] text-[#d4af37] focus:ring-0 cursor-pointer"
                          />
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-semibold text-sm text-[#e0ddcf]">
                                {chap.title}
                              </span>
                              {chap.is_published && (
                                <span className="px-1.5 py-0.5 rounded text-[9px] font-mono bg-emerald-950/80 text-emerald-400 border border-emerald-500/30">
                                  Pub v{chap.published_version}
                                </span>
                              )}
                              {chap.has_unpublished_changes && (
                                <span className="px-1.5 py-0.5 rounded text-[9px] font-mono bg-amber-950/80 text-amber-300 border border-amber-500/30 flex items-center gap-1">
                                  <AlertTriangle className="w-2.5 h-2.5" /> Draft Modified
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-3 mt-1 text-[11px] font-mono text-[#7e7c99]">
                              <span>Draft v{chap.draft_version}</span>
                              <span>•</span>
                              <span>{chap.word_count.toLocaleString()} words</span>
                              {isSelected && (
                                <>
                                  <span>•</span>
                                  <span className="text-[#fae48f] font-bold">
                                    Published Sequence: #{selectedIndex + 1}
                                  </span>
                                </>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Reordering Controls (Only for selected chapters) */}
                        {isSelected && (
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => moveChapter(selectedIndex, "up")}
                              disabled={selectedIndex === 0}
                              className="p-1 rounded text-[#8a87a8] hover:text-[#fae48f] hover:bg-[#182046] disabled:opacity-30 disabled:hover:text-[#8a87a8] transition-colors"
                              title="Move up in publication order"
                            >
                              <ArrowUp className="w-4 h-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => moveChapter(selectedIndex, "down")}
                              disabled={selectedIndex === selectedChapterIds.length - 1}
                              className="p-1 rounded text-[#8a87a8] hover:text-[#fae48f] hover:bg-[#182046] disabled:opacity-30 disabled:hover:text-[#8a87a8] transition-colors"
                              title="Move down in publication order"
                            >
                              <ArrowDown className="w-4 h-4" />
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ) : (
            /* Tab 3: Reader Preview */
            <div className="space-y-6">
              <div className="p-4 rounded-xl border border-[#232d56] bg-[#0c112a] flex items-center justify-between">
                <div>
                  <h4 className="text-xs font-mono uppercase tracking-wider text-[#fae48f]">
                    Live Reader URL
                  </h4>
                  <p className="text-sm font-mono text-[#c4c1d8] mt-0.5">
                    /read/{slug || "[slug]"}
                  </p>
                </div>
                {isPublished && (
                  <a
                    href={`/read/${slug}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#fae48f]/10 text-[#fae48f] hover:bg-[#fae48f]/20 border border-[#fae48f]/30 text-xs font-mono transition-all"
                  >
                    <span>Open Live Page</span>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                )}
              </div>

              {/* Mockup Card of Story Detail */}
              <div className="p-6 rounded-2xl border border-[#202950] bg-[#0a0e24] shadow-lg flex flex-col md:flex-row gap-6">
                <div className="w-36 h-48 rounded-xl border border-[#2a3666] bg-[#101633] overflow-hidden shrink-0 flex items-center justify-center">
                  {coverUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={coverUrl} alt="Cover Preview" className="w-full h-full object-cover" />
                  ) : (
                    <BookOpen className="w-8 h-8 text-[#575570]" />
                  )}
                </div>
                <div className="flex-1 space-y-3">
                  <h3 className="font-cinzel text-xl font-bold text-[#fae48f]">
                    {title || "Untitled Story"}
                  </h3>
                  <div className="flex flex-wrap gap-2 text-[11px] font-mono">
                    {genres ? (
                      genres.split(",").map((g) => (
                        <span key={g} className="px-2 py-0.5 rounded bg-[#161e40] text-[#c4c1d8]">
                          {g.trim()}
                        </span>
                      ))
                    ) : (
                      <span className="text-[#64627d]">No genres set</span>
                    )}
                  </div>
                  <p className="text-xs text-[#a5a3c0] leading-relaxed line-clamp-3">
                    {description || "No synopsis provided yet."}
                  </p>
                  <div className="pt-2 border-t border-[#1a2245] flex items-center gap-4 text-xs font-mono text-[#7e7c99]">
                    <span>{selectedChapterIds.length} Published Chapters</span>
                    <span>•</span>
                    <span>
                      {chapters
                        .filter((c) => selectedChapterIds.includes(c.id))
                        .reduce((acc, c) => acc + c.word_count, 0)
                        .toLocaleString()}{" "}
                      Words
                    </span>
                  </div>
                </div>
              </div>

              {/* Table of Contents Preview */}
              <div>
                <h4 className="text-xs font-mono uppercase tracking-wider text-[#d4af37] mb-2">
                  Published Chapters Table of Contents
                </h4>
                {selectedChapterIds.length === 0 ? (
                  <p className="text-xs font-mono text-[#7e7c99] italic">
                    No chapters selected for publication.
                  </p>
                ) : (
                  <div className="divide-y divide-[#182144] rounded-xl border border-[#1b244a] bg-[#080c20] overflow-hidden">
                    {selectedChapterIds.map((cId, idx) => {
                      const ch = chapters.find((c) => c.id === cId);
                      return (
                        <div
                          key={cId}
                          className="px-4 py-2.5 flex items-center justify-between text-xs font-mono"
                        >
                          <div className="flex items-center gap-2">
                            <span className="text-[#fae48f] font-bold">#{idx + 1}</span>
                            <span className="text-[#e0ddcf]">{ch?.title || "Chapter"}</span>
                          </div>
                          <span className="text-[#7e7c99]">
                            {ch?.word_count.toLocaleString()} words
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-[#1b223c] bg-[#0c1024]">
          <div>
            {isPublished && (
              <button
                type="button"
                onClick={handleUnpublish}
                disabled={isSubmitting}
                className="px-3 py-2 rounded-lg text-xs font-mono text-rose-400 hover:text-rose-300 hover:bg-rose-950/40 border border-rose-500/30 transition-all"
              >
                Unpublish Story
              </button>
            )}
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleSaveDraftMetadata}
              disabled={isSubmitting}
              className="px-4 py-2 rounded-lg text-xs font-mono text-[#fae48f] hover:bg-[#161c38] border border-[#222c54] transition-all disabled:opacity-50"
            >
              Save Draft Privately
            </button>

            <button
              type="button"
              onClick={handlePublish}
              disabled={isSubmitting || !title.trim()}
              className="flex items-center gap-2 px-5 py-2 rounded-lg bg-gradient-to-r from-[#d4af37] to-[#fae48f] hover:from-[#c29f2f] hover:to-[#ebd57f] text-black font-semibold text-xs font-mono tracking-wider uppercase transition-all shadow-[0_0_20px_rgba(212,175,55,0.3)] disabled:opacity-50 cursor-pointer"
            >
              {isSubmitting ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>Transcribing...</span>
                </>
              ) : isPublished ? (
                <>
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Publish Update (v{publishedVersion + 1})</span>
                </>
              ) : (
                <>
                  <Globe className="w-3.5 h-3.5" />
                  <span>Publish Story</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
