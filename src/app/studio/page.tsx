"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { Navbar } from "@/components/ui/Navbar";
import { StoryStudio } from "@/components/studio/StoryStudio";
import { Story, Universe } from "@/lib/db/types";
import {
  Feather,
  Plus,
  BookOpen,
  UploadCloud,
  RefreshCw,
  FolderPlus,
  Lock,
} from "lucide-react";
import { ManuscriptImportModal } from "@/components/studio/ManuscriptImportModal";

export default function StudioPage() {
  const [stories, setStories] = useState<Story[]>([]);
  const [universes, setUniverses] = useState<Universe[]>([]);
  const [selectedStoryId, setSelectedStoryId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);

  const [currentUser, setCurrentUser] = useState<{ id: string; email: string; display_name: string } | null>(null);
  const [isAuthChecking, setIsAuthChecking] = useState(true);

  // New story modal state
  const [isCreatingStory, setIsCreatingStory] = useState(false);
  const [newStoryTitle, setNewStoryTitle] = useState("");
  const [newStoryDesc, setNewStoryDesc] = useState("");
  const [universeChoice, setUniverseChoice] = useState<"existing" | "new" | "standalone">("existing");
  const [selectedUniverseId, setSelectedUniverseId] = useState<string>("");
  const [newUniverseTitle, setNewUniverseTitle] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const fetchStudioData = async () => {
    setIsLoading(true);
    try {
      const [storiesRes, univsRes, authRes] = await Promise.all([
        fetch("/api/stories", { cache: "no-store" }),
        fetch("/api/universes", { cache: "no-store" }),
        fetch("/api/auth/me", { cache: "no-store" }),
      ]);

      if (authRes.ok) {
        const aData = await authRes.json();
        setCurrentUser(aData.user || null);
      } else {
        setCurrentUser(null);
      }

      if (storiesRes.ok) {
        const sData = await storiesRes.json();
        setStories(sData.stories || []);
        if (sData.stories?.length > 0 && !selectedStoryId) {
          setSelectedStoryId(sData.stories[0].id);
        }
      }

      if (univsRes.ok) {
        const uData = await univsRes.json();
        // The demo universe must NEVER show in personal universes or story studio
        const personalOnly = (uData.personalUniverses || uData.universes || []).filter((u: Universe) => !u.is_example);
        setUniverses(personalOnly);
        if (personalOnly.length > 0 && !selectedUniverseId) {
          setSelectedUniverseId(personalOnly[0].id);
        }
      }
    } catch {
      // ignore
    } finally {
      setIsLoading(false);
      setIsAuthChecking(false);
    }
  };

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const [storiesRes, univsRes, authRes] = await Promise.all([
          fetch("/api/stories", { cache: "no-store" }),
          fetch("/api/universes", { cache: "no-store" }),
          fetch("/api/auth/me", { cache: "no-store" }),
        ]);
        if (!active) return;
        if (authRes.ok) {
          const aData = await authRes.json();
          setCurrentUser(aData.user || null);
        } else {
          setCurrentUser(null);
        }

        if (storiesRes.ok) {
          const sData = await storiesRes.json();
          setStories(sData.stories || []);
          if (sData.stories && sData.stories.length > 0 && !selectedStoryId) {
            setSelectedStoryId(sData.stories[0].id);
          }
        }
        if (univsRes.ok) {
          const uData = await univsRes.json();
          const personalOnly = (uData.personalUniverses || uData.universes || []).filter((u: Universe) => !u.is_example);
          setUniverses(personalOnly);
          if (personalOnly.length > 0 && !selectedUniverseId) {
            setSelectedUniverseId(personalOnly[0].id);
          }
        }
      } catch {
        // ignore
      } finally {
        if (active) {
          setIsLoading(false);
          setIsAuthChecking(false);
        }
      }
    })();

    return () => {
      active = false;
    };
  }, [selectedStoryId]);

  const activeStory = stories.find((s) => s.id === selectedStoryId) || stories[0] || null;

  const handleCreateStory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newStoryTitle.trim()) return;
    setIsSubmitting(true);

    try {
      let finalUniverseId: string | null = null;

      if (universeChoice === "new" && newUniverseTitle.trim()) {
        // First inscribe new universe
        const univRes = await fetch("/api/universes", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: newUniverseTitle.trim(),
            description: `Universe codex established for story: ${newStoryTitle.trim()}`,
          }),
        });
        if (univRes.ok) {
          const univData = await univRes.json();
          finalUniverseId = univData.universe?.id || null;
        }
      } else if (universeChoice === "existing" && selectedUniverseId) {
        finalUniverseId = selectedUniverseId;
      }

      const res = await fetch("/api/stories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: newStoryTitle.trim(),
          description: newStoryDesc.trim(),
          universe_ids: finalUniverseId ? [finalUniverseId] : [],
          auto_seed_chapter: true,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setNewStoryTitle("");
        setNewStoryDesc("");
        setNewUniverseTitle("");
        setIsCreatingStory(false);
        await fetchStudioData();
        setSelectedStoryId(data.story.id);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isAuthChecking && !currentUser) {
    return (
      <div className="min-h-screen bg-[#050816] text-[#e0ddcf] flex flex-col font-sans selection:bg-[#fae48f]/20 selection:text-[#fae48f]">
        <Navbar onOpenUniverseModal={() => {}} />

        <main className="flex-1 pt-28 pb-16 px-4 sm:px-6 lg:px-8 max-w-xl mx-auto w-full flex items-center justify-center">
          <div className="celestial-card p-8 rounded-2xl border border-[#d4af37]/40 bg-[#080d24] text-center space-y-6 shadow-[0_10px_50px_rgba(0,0,0,0.8)]">
            <div className="w-16 h-16 rounded-2xl bg-[#12193b] border border-[#d4af37]/50 text-[#fae48f] mx-auto flex items-center justify-center shadow-[0_0_30px_rgba(212,175,55,0.25)]">
              <Lock className="w-8 h-8 text-[#fae48f]" />
            </div>
            <div className="space-y-2">
              <h2 className="font-cinzel text-xl sm:text-2xl font-bold text-[#faf8f2]">
                Sign In Required to Inscribe Stories
              </h2>
              <p className="font-cormorant text-base text-[#b8b5cc] leading-relaxed">
                A chronicler account is required to start writing a story and ensure your manuscripts and lore links are securely saved. Please sign in or register with your real ID to enter the Story Studio.
              </p>
            </div>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
              <Link
                href="/login?redirect=/studio"
                className="gold-glow-button w-full sm:w-auto px-6 py-3 rounded-xl text-xs font-mono uppercase tracking-widest font-bold text-[#fae48f]"
              >
                Sign In to Story Studio
              </Link>
              <Link
                href="/login?tab=signup&redirect=/studio"
                className="w-full sm:w-auto px-6 py-3 rounded-xl border border-[#2a3560] bg-[#0c122e] hover:border-[#fae48f]/40 text-xs font-mono uppercase tracking-widest text-[#dcd9ed]"
              >
                Create Account
              </Link>
            </div>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#050816] text-[#e0ddcf] flex flex-col font-sans selection:bg-[#fae48f]/20 selection:text-[#fae48f]">
      <Navbar onOpenUniverseModal={() => {}} />

      <main className="flex-1 pt-24 pb-12 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto w-full space-y-6">
        {/* Studio Banner & Story Switcher Bar */}
        <div className="flex flex-wrap items-center justify-between gap-4 p-4 rounded-2xl border border-[#d4af37]/25 bg-[#090d24]/90 backdrop-blur-md shadow-[0_4px_30px_rgba(0,0,0,0.5)]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl border border-[#d4af37]/40 bg-[#12193b] flex items-center justify-center text-[#fae48f] shadow-[0_0_15px_rgba(212,175,55,0.2)]">
              <Feather className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="font-cinzel text-lg sm:text-xl font-bold tracking-wide text-[#fae48f]">
                  Story Studio
                </h1>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full border border-[#2a345c] bg-[#0c122e] text-[#c4c1d8]">
                  Private Workspace
                </span>
              </div>
              <p className="text-xs font-mono text-[#8c89ad]">
                Inscribe manuscripts, organize book series, and verify narrative continuity
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            {/* Story Picker Dropdown */}
            {stories.length > 0 && (
              <div className="flex items-center gap-2">
                <select
                  value={activeStory?.id || ""}
                  onChange={(e) => setSelectedStoryId(e.target.value)}
                  className="px-3 py-2 rounded-lg border border-[#252f54] bg-[#0b1029] text-xs font-mono text-[#fae48f] focus:outline-none focus:border-[#d4af37] max-w-[200px] truncate"
                >
                  {stories.map((st) => (
                    <option key={st.id} value={st.id}>
                      {st.title} {st.is_example ? "(Demo)" : ""}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <button
              onClick={() => setIsImportModalOpen(true)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-[#263259] bg-[#0b1029] hover:border-[#d4af37]/50 hover:bg-[#131a3d] text-xs font-mono uppercase tracking-wider text-[#dcd9ed] transition-all cursor-pointer font-semibold"
            >
              <UploadCloud className="w-3.5 h-3.5 text-[#fae48f]" />
              <span>Import Manuscript</span>
            </button>

            <button
              onClick={() => setIsCreatingStory(true)}
              className="gold-glow-button inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-mono uppercase tracking-wider text-[#fae48f] font-bold cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>New Story</span>
            </button>
          </div>
        </div>

        {/* Loading State */}
        {isLoading && (
          <div className="flex flex-col items-center justify-center py-24 gap-3">
            <RefreshCw className="w-8 h-8 text-[#fae48f] animate-spin" />
            <p className="font-cinzel text-sm text-[#fae48f]">
              Illuminating Scribe Archives...
            </p>
          </div>
        )}

        {/* Story Workspace */}
        {!isLoading && activeStory && (
          <StoryStudio
            universe={
              universes.find((u) =>
                activeStory.linked_universes?.some((lu) => lu.id === u.id)
              ) || universes[0] || {
                id: "univ-standalone",
                user_id: activeStory.user_id,
                title: "Standalone Realm",
                description: "Standalone writing workspace",
                cover_url: null,
                is_example: false,
                created_at: activeStory.created_at,
                updated_at: activeStory.updated_at,
              }
            }
            initialChapters={[]}
            story={activeStory}
            stories={stories}
            onUniverseRefresh={fetchStudioData}
          />
        )}

        {/* Empty Stories State */}
        {!isLoading && stories.length === 0 && (
          <div className="p-12 max-w-2xl mx-auto text-center space-y-6 celestial-card border border-[#242e56] bg-[#080c21] rounded-2xl my-12">
            <div className="w-16 h-16 rounded-2xl bg-[#12193b] border border-[#d4af37]/40 text-[#fae48f] mx-auto flex items-center justify-center shadow-[0_0_30px_rgba(212,175,55,0.2)]">
              <BookOpen className="w-8 h-8" />
            </div>
            <div className="space-y-2">
              <h2 className="font-cinzel text-2xl font-bold text-[#faf8f2]">
                Your Story Studio Awaits
              </h2>
              <p className="font-cormorant text-base text-[#a09ebf]">
                Begin your manuscript from scratch or safely import existing drafts from Markdown, TXT, or Microsoft Word.
              </p>
            </div>
            <div className="flex items-center justify-center gap-3 pt-2">
              <button
                onClick={() => setIsCreatingStory(true)}
                className="gold-glow-button inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-mono uppercase tracking-widest font-bold text-[#fae48f]"
              >
                <Plus className="w-4 h-4" />
                <span>Create Story</span>
              </button>
              <button
                onClick={() => setIsImportModalOpen(true)}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl border border-[#28345c] bg-[#0c122c] hover:border-[#d4af37]/40 text-xs font-mono uppercase tracking-widest text-[#dcd9ed]"
              >
                <UploadCloud className="w-4 h-4 text-[#fae48f]" />
                <span>Import Manuscript</span>
              </button>
            </div>
          </div>
        )}

        {/* Create Story Modal */}
        {isCreatingStory && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fade-in">
            <div className="w-full max-w-md rounded-2xl border border-[#d4af37]/40 bg-[#080d24] p-6 space-y-4 shadow-[0_10px_40px_rgba(0,0,0,0.8)]">
              <div className="flex items-center gap-2.5 text-[#fae48f]">
                <FolderPlus className="w-5 h-5 text-[#d4af37]" />
                <h3 className="font-cinzel text-base font-bold">
                  Inscribe New Story
                </h3>
              </div>

              <form onSubmit={handleCreateStory} className="space-y-4 text-xs font-mono">
                <div>
                  <label className="block text-[#8c89ad] mb-1 uppercase tracking-wider">
                    Story Title *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. The Glass Citadel"
                    value={newStoryTitle}
                    onChange={(e) => setNewStoryTitle(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-[#212b4e] bg-[#0b1029] text-[#fae48f] focus:outline-none focus:border-[#d4af37]"
                  />
                </div>

                <div>
                  <label className="block text-[#8c89ad] mb-1 uppercase tracking-wider">
                    Synopsis / Premise
                  </label>
                  <textarea
                    rows={3}
                    placeholder="Brief premise or core narrative arc..."
                    value={newStoryDesc}
                    onChange={(e) => setNewStoryDesc(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-[#212b4e] bg-[#0b1029] text-[#dcd9ed] focus:outline-none focus:border-[#d4af37]"
                  />
                </div>

                {/* Which Universe Section */}
                <div className="space-y-2 pt-2 border-t border-[#1a2347]">
                  <label className="block text-[#fae48f] font-cinzel text-xs font-semibold tracking-wider uppercase">
                    Which universe does this story take place in? *
                  </label>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <button
                      type="button"
                      onClick={() => setUniverseChoice("existing")}
                      className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                        universeChoice === "existing"
                          ? "border-[#fae48f] bg-[#172044] text-[#fae48f] shadow-[0_0_12px_rgba(212,175,55,0.18)]"
                          : "border-[#1e274b] bg-[#0a0f26] text-[#8e8ca9] hover:border-[#313f75]"
                      }`}
                    >
                      <div className="font-bold text-[11px] mb-0.5">Your Universe</div>
                      <div className="text-[10px] text-[#8e8ca9] truncate">
                        {universes.length > 0 ? `${universes.length} available` : "None created yet"}
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={() => setUniverseChoice("new")}
                      className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                        universeChoice === "new"
                          ? "border-[#fae48f] bg-[#172044] text-[#fae48f] shadow-[0_0_12px_rgba(212,175,55,0.18)]"
                          : "border-[#1e274b] bg-[#0a0f26] text-[#8e8ca9] hover:border-[#313f75]"
                      }`}
                    >
                      <div className="font-bold text-[11px] mb-0.5">New Universe</div>
                      <div className="text-[10px] text-[#8e8ca9] truncate">Inscribe new codex</div>
                    </button>

                    <button
                      type="button"
                      onClick={() => setUniverseChoice("standalone")}
                      className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                        universeChoice === "standalone"
                          ? "border-[#fae48f] bg-[#172044] text-[#fae48f] shadow-[0_0_12px_rgba(212,175,55,0.18)]"
                          : "border-[#1e274b] bg-[#0a0f26] text-[#8e8ca9] hover:border-[#313f75]"
                      }`}
                    >
                      <div className="font-bold text-[11px] mb-0.5">Standalone</div>
                      <div className="text-[10px] text-[#8e8ca9] truncate">No universe link</div>
                    </button>
                  </div>

                  {universeChoice === "existing" && (
                    <div className="pt-2">
                      {universes.length > 0 ? (
                        <div>
                          <label className="block text-[#8c89ad] mb-1 uppercase tracking-wider text-[10px]">
                            Select Your Universe
                          </label>
                          <select
                            value={selectedUniverseId}
                            onChange={(e) => setSelectedUniverseId(e.target.value)}
                            className="w-full px-3 py-2 rounded-lg border border-[#212b4e] bg-[#0b1029] text-[#fae48f] focus:outline-none focus:border-[#d4af37]"
                          >
                            {universes.map((u) => (
                              <option key={u.id} value={u.id}>
                                {u.title}
                              </option>
                            ))}
                          </select>
                        </div>
                      ) : (
                        <p className="text-[11px] text-amber-300/80 italic p-2 bg-[#12193b]/60 rounded-lg border border-[#283563]">
                          No personal universes created yet. Choose &ldquo;New Universe&rdquo; above to inscribe your first realm!
                        </p>
                      )}
                    </div>
                  )}

                  {universeChoice === "new" && (
                    <div className="pt-2">
                      <label className="block text-[#8c89ad] mb-1 uppercase tracking-wider text-[10px]">
                        New Universe Title *
                      </label>
                      <input
                        type="text"
                        required
                        placeholder="e.g. World of the Obsidian Scriptorium"
                        value={newUniverseTitle}
                        onChange={(e) => setNewUniverseTitle(e.target.value)}
                        className="w-full px-3 py-2 rounded-lg border border-[#212b4e] bg-[#0b1029] text-[#fae48f] focus:outline-none focus:border-[#d4af37]"
                      />
                    </div>
                  )}
                </div>

                <div className="flex items-center justify-end gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setIsCreatingStory(false)}
                    className="px-4 py-2 rounded-lg border border-[#222a4c] text-[#8e8ca9] hover:text-white"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmitting || !newStoryTitle.trim()}
                    className="gold-glow-button px-5 py-2 rounded-lg text-[#fae48f] font-bold disabled:opacity-50"
                  >
                    {isSubmitting ? "Creating..." : "Inscribe Story"}
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
          targetStory={activeStory}
          stories={stories}
          onImportComplete={async (storyId) => {
            await fetchStudioData();
            setSelectedStoryId(storyId);
          }}
        />
      </main>
    </div>
  );
}
