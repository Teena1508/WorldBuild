"use client";

import React, { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Compass,
  Plus,
  Search,
  Sparkles,
  BookOpen,
  Calendar,
  ShieldAlert,
  Copy,
  Trash2,
  Edit3,
  ExternalLink,
  RefreshCw,
  X,
  AlertTriangle,
  ArrowLeft,
  CheckCircle,
} from "lucide-react";
import { Universe } from "@/lib/db/types";
import { StarfieldCanvas } from "@/components/ui/StarfieldCanvas";
import { BookCover } from "@/components/ui/BookCover";

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

export default function WorldVaultPage() {
  const router = useRouter();
  const [universes, setUniverses] = useState<Universe[]>([]);
  const [currentUser, setCurrentUser] = useState<{ id: string; display_name: string; email: string } | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterTab, setFilterTab] = useState<"mine" | "examples">("mine");
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successToast, setSuccessToast] = useState<string | null>(null);

  // Modals state
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [selectedUniverse, setSelectedUniverse] = useState<Universe | null>(null);

  // Form states
  const [formData, setFormData] = useState({
    title: "",
    description: "",
    cover_url: "",
  });
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  const fetchUniverses = useCallback(async () => {
    try {
      setErrorMessage(null);
      const url = searchQuery.trim()
        ? `/api/universes?q=${encodeURIComponent(searchQuery.trim())}`
        : "/api/universes";
      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) {
        throw new Error(`Failed to load archive: ${res.statusText}`);
      }
      const data = await res.json();
      setUniverses(data.universes || []);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to contact Sanctum vault";
      setErrorMessage(msg);
    } finally {
      setIsLoading(false);
    }
  }, [searchQuery]);

  useEffect(() => {
    let active = true;
    const execute = async () => {
      try {
        setErrorMessage(null);
        const url = searchQuery.trim()
          ? `/api/universes?q=${encodeURIComponent(searchQuery.trim())}`
          : "/api/universes";
        const res = await fetch(url, { cache: "no-store" });
        if (!res.ok) {
          throw new Error(`Failed to load archive: ${res.statusText}`);
        }
        const data = await res.json();
        if (active) setUniverses(data.universes || []);
      } catch (err: unknown) {
        if (active) {
          const msg = err instanceof Error ? err.message : "Failed to contact Sanctum vault";
          setErrorMessage(msg);
        }
      } finally {
        if (active) setIsLoading(false);
      }
    };
    execute();

    fetch("/api/auth/me", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.user && active) setCurrentUser(data.user);
      })
      .catch(() => {});

    return () => {
      active = false;
    };
  }, [searchQuery]);

  const showToast = (msg: string) => {
    setSuccessToast(msg);
    setTimeout(() => setSuccessToast(null), 3500);
  };

  // Segmented universes - Personal universes strictly exclude demo universes
  const personalUniverses = universes.filter((u) => !u.is_example);
  const demoUniverses = universes.filter((u) => Boolean(u.is_example));

  // Filtered list - "mine" tab ONLY displays personal universes
  const filteredUniverses = universes.filter((u) => {
    if (filterTab === "mine") return !u.is_example;
    if (filterTab === "examples") return Boolean(u.is_example);
    return !u.is_example;
  });

  // Handle Create
  const handleOpenCreate = () => {
    setFormData({
      title: "",
      description: "",
      cover_url: COVER_PRESETS[0].url,
    });
    setFormErrors({});
    setIsCreateOpen(true);
  };

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const errors: Record<string, string> = {};
    if (!formData.title.trim()) errors.title = "Universe title is required";
    if (!formData.description.trim()) errors.description = "Universe description is required";
    if (Object.keys(errors).length > 0) {
      setFormErrors(errors);
      return;
    }

    try {
      setIsSubmitting(true);
      const res = await fetch("/api/universes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to create universe");

      setIsCreateOpen(false);
      showToast(`Universe "${data.universe.title}" established in the Vault`);
      await fetchUniverses();
      router.push(`/vault/${data.universe.id}`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Creation failed";
      setFormErrors({ submit: msg });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle Edit
  const handleOpenEdit = (univ: Universe) => {
    setSelectedUniverse(univ);
    setFormData({
      title: univ.title,
      description: univ.description,
      cover_url: univ.cover_url || "",
    });
    setFormErrors({});
    setIsEditOpen(true);
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUniverse) return;

    const errors: Record<string, string> = {};
    if (!formData.title.trim()) errors.title = "Universe title is required";
    if (!formData.description.trim()) errors.description = "Universe description is required";
    if (Object.keys(errors).length > 0) {
      setFormErrors(errors);
      return;
    }

    try {
      setIsSubmitting(true);
      const res = await fetch(`/api/universes/${selectedUniverse.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to update universe");

      setIsEditOpen(false);
      showToast(`Universe "${data.universe.title}" updated`);
      fetchUniverses();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Update failed";
      setFormErrors({ submit: msg });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle Duplicate
  const handleDuplicate = async (univ: Universe) => {
    try {
      setIsLoading(true);
      const res = await fetch(`/api/universes/${univ.id}/duplicate`, {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to duplicate universe");

      showToast(`Duplicated "${univ.title}" into your personal vault`);
      await fetchUniverses();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Duplication failed";
      alert(msg);
    } finally {
      setIsLoading(false);
    }
  };

  // Handle Delete
  const handleOpenDelete = (univ: Universe) => {
    setSelectedUniverse(univ);
    setIsDeleteOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!selectedUniverse) return;
    const targetId = selectedUniverse.id;
    const targetTitle = selectedUniverse.title;
    try {
      setIsSubmitting(true);
      const res = await fetch(`/api/universes/${targetId}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to delete universe");

      // Optimistic update: instantly remove from screen
      setUniverses((prev) => prev.filter((u) => u.id !== targetId));
      setIsDeleteOpen(false);
      showToast(`Universe "${targetTitle}" dissolved from the canon`);
      await fetchUniverses();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Deletion failed";
      setErrorMessage(msg);
      showToast(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="relative min-h-screen bg-[#040509] text-[#e0ddcf] selection:bg-[#d4af37]/30 selection:text-[#fae48f] overflow-x-hidden">
      <StarfieldCanvas />

      {/* Toast Notification */}
      {successToast && (
        <div className="fixed bottom-6 right-6 z-50 flex items-center gap-2 px-4 py-3 rounded-lg border border-emerald-500/40 bg-[#09151c]/95 text-emerald-300 font-mono text-xs shadow-2xl backdrop-blur-md animate-fade-in">
          <CheckCircle className="w-4 h-4 text-emerald-400" />
          <span>{successToast}</span>
        </div>
      )}

      {/* Top Vault Header */}
      <header className="relative z-20 border-b border-[#1b223d] bg-[#070914]/80 backdrop-blur-md sticky top-0">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link
              href="/"
              className="inline-flex items-center gap-2 text-xs font-mono tracking-wider text-[#8a88ab] hover:text-[#fae48f] transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Sanctum Portal</span>
            </Link>
            <div className="h-4 w-px bg-[#202742]" />
            <div className="flex items-center gap-2">
              <Compass className="w-5 h-5 text-[#fae48f]" />
              <h1 className="font-cinzel text-lg sm:text-xl font-bold tracking-wide text-[#f4efe4]">
                The World Vault
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Scribe Identity Badge */}
            <Link
              href="/login"
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border border-[#1e274a] bg-[#0c1228] hover:border-[#fae48f]/40 text-xs font-mono text-[#c4c1d8] transition-all"
              title="Switch or Inscribe Scribe Profile"
            >
              <div className="w-5 h-5 rounded-full bg-[#182042] border border-[#d4af37]/40 text-[#fae48f] text-[10px] flex items-center justify-center font-bold">
                {currentUser?.display_name ? currentUser.display_name.charAt(0) : "S"}
              </div>
              <span className="hidden sm:inline text-[#e0ddcf] truncate max-w-[130px]">
                {currentUser?.display_name || "Scribe"}
              </span>
              <span className="text-[10px] text-[#fae48f] underline">Switch</span>
            </Link>

            <button
              onClick={handleOpenCreate}
              id="create-new-universe-top-btn"
              className="gold-glow-button inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-mono tracking-wider uppercase font-semibold text-[#fae48f] cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Calibrate New Realm</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        {/* Intro Banner */}
        <div className="mb-8">
          <div className="inline-flex items-center gap-1.5 text-xs font-mono text-[#fae48f] tracking-widest uppercase mb-2">
            <Sparkles className="w-3.5 h-3.5" />
            <span>Grand Scriptorium Archive</span>
          </div>
          <h2 className="font-cinzel text-2xl sm:text-4xl font-bold text-[#faf8f2]">
            Fictional Continuums &amp; Lore Canons
          </h2>
          <p className="font-cormorant text-base sm:text-lg text-[#9f9db8] mt-1 max-w-3xl leading-relaxed">
            Manage your persistent fictional universes, inspect causal relationships, and engage the Continuity Oracle to safeguard timeline integrity.
          </p>
        </div>

        {/* Controls: Search, Tabs & Refresh */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 pb-6 border-b border-[#1b223d] mb-8">
          {/* Tabs */}
          <div className="flex items-center gap-2 border border-[#1e2646] bg-[#090d22] p-1 rounded-lg">
            <button
              onClick={() => setFilterTab("mine")}
              className={`px-3 py-1.5 rounded text-xs font-mono tracking-wider transition-colors cursor-pointer ${
                filterTab === "mine"
                  ? "bg-[#182147] text-[#fae48f] font-semibold"
                  : "text-[#8885a6] hover:text-[#d3d0e8]"
              }`}
            >
              Your Universes ({personalUniverses.length})
            </button>
            <button
              onClick={() => setFilterTab("examples")}
              className={`px-3 py-1.5 rounded text-xs font-mono tracking-wider transition-colors cursor-pointer ${
                filterTab === "examples"
                  ? "bg-[#182147] text-[#fae48f] font-semibold"
                  : "text-[#8885a6] hover:text-[#d3d0e8]"
              }`}
            >
              Demo Universe ({demoUniverses.length})
            </button>
          </div>

          {/* Search Bar & Refresh */}
          <div className="flex items-center gap-3">
            <div className="relative flex-1 sm:w-72">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[#686684]" />
              <input
                type="text"
                placeholder="Search universes by title or lore..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-4 py-2 rounded-lg bg-[#080b1e] border border-[#20294e] text-xs font-mono text-[#e6e3da] placeholder-[#646280] focus:outline-none focus:border-[#fae48f]"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery("")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[#686684] hover:text-[#e6e3da]"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            <button
              onClick={fetchUniverses}
              title="Refresh Vault"
              className="p-2 rounded-lg border border-[#20294e] bg-[#080b1e] text-[#8886a8] hover:text-[#fae48f] hover:border-[#fae48f]/40 transition-colors cursor-pointer"
            >
              <RefreshCw className={`w-4 h-4 ${isLoading ? "animate-spin" : ""}`} />
            </button>
          </div>
        </div>

        {/* Error Callout */}
        {errorMessage && (
          <div className="p-4 rounded-xl border border-rose-500/30 bg-rose-950/20 text-rose-300 text-sm font-mono flex items-center justify-between mb-8">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{errorMessage}</span>
            </div>
            <button
              onClick={fetchUniverses}
              className="underline text-xs hover:text-white"
            >
              Retry
            </button>
          </div>
        )}

        {/* Loading State */}
        {isLoading && universes.length === 0 && (
          <div className="py-24 text-center">
            <RefreshCw className="w-8 h-8 text-[#fae48f] animate-spin mx-auto mb-3" />
            <p className="font-mono text-xs tracking-wider text-[#9390b1] uppercase">
              Aligning Celestial Coordinates &amp; Synchronizing Vault...
            </p>
          </div>
        )}

        {/* First-Time User Empty State (0 Personal Universes) */}
        {!isLoading && filterTab === "mine" && personalUniverses.length === 0 && !searchQuery && (
          <div className="celestial-card p-8 sm:p-12 rounded-2xl text-center max-w-2xl mx-auto my-8 border border-[#d4af37]/30 bg-gradient-to-b from-[#090e24] via-[#060817] to-[#04050d] shadow-2xl relative overflow-hidden">
            <div className="absolute top-0 right-1/2 translate-x-1/2 w-80 h-80 bg-[#d4af37]/5 rounded-full blur-3xl pointer-events-none" />

            <div className="relative z-10 space-y-4">
              <div className="w-14 h-14 rounded-2xl border border-[#d4af37]/40 bg-[#0d1433] flex items-center justify-center mx-auto text-[#fae48f] shadow-lg">
                <Compass className="w-7 h-7" />
              </div>

              <div className="space-y-2">
                <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full border border-[#d4af37]/30 bg-[#080d24] text-[11px] font-mono tracking-widest uppercase text-[#fae48f]">
                  <Sparkles className="w-3 h-3 text-[#fae48f]" />
                  <span>Personal World Vault</span>
                </div>
                <h3 className="font-cinzel text-2xl sm:text-3xl font-bold text-[#faf8f2]">
                  Welcome to Your World Vault
                </h3>
                <p className="font-cormorant text-base sm:text-lg text-[#b0aecd] max-w-lg mx-auto leading-relaxed">
                  Your personal archive is clean and ready. Forge your own fictional universe from scratch, or tour our fully populated exemplar to see how the Sanctum powers causal integrity.
                </p>
              </div>

              <div className="pt-6 pb-2 max-w-sm mx-auto">
                <button
                  onClick={handleOpenCreate}
                  id="create-first-universe-btn"
                  className="gold-glow-button w-full inline-flex items-center justify-center gap-2 py-3 px-6 rounded-xl text-xs font-mono tracking-wider uppercase font-semibold text-[#fae48f] cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  <span>Create Your First Universe</span>
                </button>
              </div>

              <p className="text-[11px] font-mono text-[#8b87a8] pt-2">
                Need reference material? Explore the{" "}
                <button
                  type="button"
                  onClick={() => setFilterTab("examples")}
                  className="text-[#fae48f] underline hover:text-white cursor-pointer"
                >
                  Demo Universe
                </button>{" "}
                tab anytime.
              </p>
            </div>
          </div>
        )}


        {/* Search or Non-mine Empty State */}
        {!isLoading && filteredUniverses.length === 0 && (searchQuery || filterTab !== "mine" || personalUniverses.length > 0) && (
          <div className="celestial-card p-12 rounded-2xl text-center max-w-xl mx-auto my-12 border border-[#d4af37]/20">
            <Compass className="w-12 h-12 text-[#d4af37]/60 mx-auto mb-4" />
            <h3 className="font-cinzel text-xl font-bold text-[#faf8f2] mb-2">
              No Universes Found
            </h3>
            <p className="font-cormorant text-base text-[#9b99b5] mb-6">
              {searchQuery
                ? `No fictional continuums matched "${searchQuery}". Clear your search or calibrate a new realm.`
                : "No universes found for the selected filter."}
            </p>
            {searchQuery ? (
              <button
                onClick={() => setSearchQuery("")}
                className="gold-glow-button inline-flex items-center gap-2 px-6 py-2.5 rounded-lg text-xs font-mono tracking-widest uppercase font-semibold text-[#fae48f] cursor-pointer"
              >
                <span>Clear Search Filter</span>
              </button>
            ) : (
              <button
                onClick={handleOpenCreate}
                className="gold-glow-button inline-flex items-center gap-2 px-6 py-2.5 rounded-lg text-xs font-mono tracking-widest uppercase font-semibold text-[#fae48f] cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>Calibrate New Realm</span>
              </button>
            )}
          </div>
        )}

        {/* Grid of Universes */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredUniverses.map((univ) => {
            const openFindings = univ.stats?.openFindingsCount || 0;
            return (
              <div
                key={univ.id}
                className="celestial-card group rounded-xl border border-[#1e274a] hover:border-[#d4af37]/50 transition-all flex flex-col overflow-hidden bg-[#080c21]"
              >
                {/* Cover Image */}
                <div className="relative h-44 w-full bg-[#0d122b] overflow-hidden border-b border-[#1b223d]">
                  <BookCover
                    src={univ.cover_url}
                    alt={univ.title}
                    title={univ.title}
                    aspect="landscape"
                    className="h-44"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-[#080c21] via-transparent to-black/30 pointer-events-none" />

                  {/* Top Badges */}
                  <div className="absolute top-3 left-3 right-3 flex items-center justify-between pointer-events-none">
                    {univ.is_example ? (
                      <span className="text-[10px] font-mono tracking-widest uppercase px-2.5 py-1 rounded-full border border-[#d4af37]/40 bg-[#090d20]/90 text-[#fae48f] backdrop-blur-md">
                        Exemplar Demo
                      </span>
                    ) : (
                      <span className="text-[10px] font-mono tracking-widest uppercase px-2.5 py-1 rounded-full border border-sky-500/30 bg-[#071329]/90 text-sky-300 backdrop-blur-md">
                        Personal Canon
                      </span>
                    )}

                    {openFindings > 0 ? (
                      <span className="inline-flex items-center gap-1 text-[10px] font-mono tracking-wider px-2 py-0.5 rounded-full border border-rose-500/40 bg-rose-950/80 text-rose-300 backdrop-blur-md">
                        <ShieldAlert className="w-3 h-3 text-rose-400" />
                        <span>{openFindings} Causal Issues</span>
                      </span>
                    ) : (
                      <span className="text-[10px] font-mono tracking-wider px-2 py-0.5 rounded-full border border-emerald-500/30 bg-emerald-950/80 text-emerald-300 backdrop-blur-md">
                        Canon Intact
                      </span>
                    )}
                  </div>
                </div>

                {/* Body Details */}
                <div className="p-5 flex-1 flex flex-col justify-between">
                  <div>
                    <h3 className="font-cinzel text-lg font-bold text-[#faf8f2] mb-1 line-clamp-1 group-hover:text-[#fae48f] transition-colors">
                      {univ.title}
                    </h3>
                    <p className="font-cormorant text-sm text-[#9f9db5] line-clamp-2 leading-relaxed mb-4">
                      {univ.description}
                    </p>

                    {/* Quick Stats Grid */}
                    <div className="grid grid-cols-3 gap-2 py-3 border-y border-[#18203c] text-[11px] font-mono text-[#7b7899] mb-4">
                      <div className="flex items-center gap-1.5">
                        <BookOpen className="w-3.5 h-3.5 text-[#d4af37]" />
                        <span>{univ.stats?.charactersCount || 0} Chars</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Compass className="w-3.5 h-3.5 text-sky-400" />
                        <span>{univ.stats?.locationsCount || 0} Locs</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Calendar className="w-3.5 h-3.5 text-violet-400" />
                        <span>{univ.stats?.eventsCount || 0} Events</span>
                      </div>
                    </div>
                  </div>

                  {/* Footer & Actions */}
                  <div>
                    <div className="text-[10px] font-mono text-[#615f7c] mb-4">
                      Updated: {new Date(univ.updated_at).toLocaleDateString(undefined, {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      })}
                    </div>

                    <div className="flex items-center justify-between gap-2 pt-2 border-t border-[#151c36]">
                      <Link
                        href={`/vault/${univ.id}`}
                        className="gold-glow-button flex-1 inline-flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg text-xs font-mono tracking-wider uppercase font-semibold text-[#fae48f]"
                      >
                        <span>Open Codex</span>
                        <ExternalLink className="w-3.5 h-3.5" />
                      </Link>

                      <button
                        onClick={() => handleDuplicate(univ)}
                        title="Duplicate into personal vault"
                        className="p-2 rounded-lg border border-[#232b50] bg-[#0c1128] text-[#8684a8] hover:text-[#fae48f] hover:border-[#fae48f]/40 transition-colors cursor-pointer"
                      >
                        <Copy className="w-4 h-4" />
                      </button>

                      {!univ.is_example && (
                        <>
                          <button
                            onClick={() => handleOpenEdit(univ)}
                            title="Edit metadata"
                            className="p-2 rounded-lg border border-[#232b50] bg-[#0c1128] text-[#8684a8] hover:text-[#fae48f] hover:border-[#fae48f]/40 transition-colors cursor-pointer"
                          >
                            <Edit3 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleOpenDelete(univ)}
                            title="Dissolve universe"
                            className="p-2 rounded-lg border border-[#232b50] bg-[#0c1128] text-[#8684a8] hover:text-rose-400 hover:border-rose-500/40 transition-colors cursor-pointer"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </main>

      {/* CREATE UNIVERSE MODAL */}
      {isCreateOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md overflow-y-auto">
          <div className="relative w-full max-w-xl bg-[#080c21] border border-[#d4af37]/40 rounded-xl shadow-2xl p-6 text-[#dedbd2]">
            <div className="flex items-center justify-between pb-4 border-b border-[#1d2545] mb-4">
              <div className="flex items-center gap-2">
                <Compass className="w-5 h-5 text-[#fae48f]" />
                <h3 className="font-cinzel text-lg font-bold text-[#faf8f2]">
                  Calibrate New Fictional Continuum
                </h3>
              </div>
              <button
                onClick={() => setIsCreateOpen(false)}
                className="text-[#8482a5] hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateSubmit} className="space-y-4">
              {formErrors.submit && (
                <div className="p-3 rounded-lg border border-rose-500/30 bg-rose-950/20 text-xs font-mono text-rose-300">
                  {formErrors.submit}
                </div>
              )}

              <div>
                <label className="block text-xs font-mono uppercase tracking-wider text-[#a7a5c4] mb-1">
                  Continuum Title *
                </label>
                <input
                  type="text"
                  placeholder="e.g. The Chronicles of Morvein"
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  className="w-full px-3.5 py-2.5 rounded-lg bg-[#040612] border border-[#232b50] text-sm text-[#faf8f2] focus:outline-none focus:border-[#fae48f]"
                />
                {formErrors.title && (
                  <span className="text-[11px] font-mono text-rose-400 mt-1 block">
                    {formErrors.title}
                  </span>
                )}
              </div>

              <div>
                <label className="block text-xs font-mono uppercase tracking-wider text-[#a7a5c4] mb-1">
                  Cosmic Lore Manifesto &amp; Summary *
                </label>
                <textarea
                  rows={3}
                  placeholder="Describe the cosmological premise, physical or magic rules, and central conflicts..."
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="w-full px-3.5 py-2.5 rounded-lg bg-[#040612] border border-[#232b50] text-sm text-[#faf8f2] focus:outline-none focus:border-[#fae48f]"
                />
                {formErrors.description && (
                  <span className="text-[11px] font-mono text-rose-400 mt-1 block">
                    {formErrors.description}
                  </span>
                )}
              </div>

              <div>
                <label className="block text-xs font-mono uppercase tracking-wider text-[#a7a5c4] mb-1">
                  Cover Artwork URL
                </label>
                <input
                  type="url"
                  placeholder="https://images.unsplash.com/..."
                  value={formData.cover_url}
                  onChange={(e) => setFormData({ ...formData, cover_url: e.target.value })}
                  className="w-full px-3.5 py-2 rounded-lg bg-[#040612] border border-[#232b50] text-xs font-mono text-[#faf8f2] focus:outline-none focus:border-[#fae48f] mb-2"
                />

                <span className="text-[11px] font-mono text-[#747192] block mb-1.5">
                  Select celestial artwork preset:
                </span>
                <div className="grid grid-cols-2 gap-2">
                  {COVER_PRESETS.map((preset) => (
                    <button
                      type="button"
                      key={preset.name}
                      onClick={() => setFormData({ ...formData, cover_url: preset.url })}
                      className={`px-3 py-1.5 rounded border text-[11px] font-mono truncate text-left transition-colors cursor-pointer ${
                        formData.cover_url === preset.url
                          ? "border-[#fae48f] bg-[#141b3c] text-[#fae48f]"
                          : "border-[#20274a] bg-[#060814] text-[#8684a8] hover:text-[#d0ceea]"
                      }`}
                    >
                      {preset.name}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-[#1d2545]">
                <button
                  type="button"
                  onClick={() => setIsCreateOpen(false)}
                  className="px-4 py-2 text-xs font-mono uppercase tracking-wider text-[#8b89ad] hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="gold-glow-button px-5 py-2.5 rounded-lg text-xs font-mono tracking-widest uppercase font-semibold text-[#fae48f] cursor-pointer"
                >
                  {isSubmitting ? "Harmonizing..." : "Inscribe Universe"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* EDIT UNIVERSE MODAL */}
      {isEditOpen && selectedUniverse && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md overflow-y-auto">
          <div className="relative w-full max-w-xl bg-[#080c21] border border-[#d4af37]/40 rounded-xl shadow-2xl p-6 text-[#dedbd2]">
            <div className="flex items-center justify-between pb-4 border-b border-[#1d2545] mb-4">
              <div className="flex items-center gap-2">
                <Edit3 className="w-5 h-5 text-[#fae48f]" />
                <h3 className="font-cinzel text-lg font-bold text-[#faf8f2]">
                  Recalibrate Universe Codex
                </h3>
              </div>
              <button
                onClick={() => setIsEditOpen(false)}
                className="text-[#8482a5] hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleEditSubmit} className="space-y-4">
              {formErrors.submit && (
                <div className="p-3 rounded-lg border border-rose-500/30 bg-rose-950/20 text-xs font-mono text-rose-300">
                  {formErrors.submit}
                </div>
              )}

              <div>
                <label className="block text-xs font-mono uppercase tracking-wider text-[#a7a5c4] mb-1">
                  Continuum Title *
                </label>
                <input
                  type="text"
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  className="w-full px-3.5 py-2.5 rounded-lg bg-[#040612] border border-[#232b50] text-sm text-[#faf8f2] focus:outline-none focus:border-[#fae48f]"
                />
                {formErrors.title && (
                  <span className="text-[11px] font-mono text-rose-400 mt-1 block">
                    {formErrors.title}
                  </span>
                )}
              </div>

              <div>
                <label className="block text-xs font-mono uppercase tracking-wider text-[#a7a5c4] mb-1">
                  Cosmic Lore Manifesto &amp; Summary *
                </label>
                <textarea
                  rows={3}
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="w-full px-3.5 py-2.5 rounded-lg bg-[#040612] border border-[#232b50] text-sm text-[#faf8f2] focus:outline-none focus:border-[#fae48f]"
                />
                {formErrors.description && (
                  <span className="text-[11px] font-mono text-rose-400 mt-1 block">
                    {formErrors.description}
                  </span>
                )}
              </div>

              <div>
                <label className="block text-xs font-mono uppercase tracking-wider text-[#a7a5c4] mb-1">
                  Cover Artwork URL
                </label>
                <input
                  type="url"
                  value={formData.cover_url}
                  onChange={(e) => setFormData({ ...formData, cover_url: e.target.value })}
                  className="w-full px-3.5 py-2 rounded-lg bg-[#040612] border border-[#232b50] text-xs font-mono text-[#faf8f2] focus:outline-none focus:border-[#fae48f] mb-2"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-[#1d2545]">
                <button
                  type="button"
                  onClick={() => setIsEditOpen(false)}
                  className="px-4 py-2 text-xs font-mono uppercase tracking-wider text-[#8b89ad] hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="gold-glow-button px-5 py-2.5 rounded-lg text-xs font-mono tracking-widest uppercase font-semibold text-[#fae48f] cursor-pointer"
                >
                  {isSubmitting ? "Preserving..." : "Save Modifications"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* DELETE CONFIRMATION MODAL */}
      {isDeleteOpen && selectedUniverse && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
          <div className="relative w-full max-w-md bg-[#090c21] border border-rose-500/40 rounded-xl shadow-2xl p-6 text-[#dedbd2]">
            <div className="flex items-center gap-2 text-rose-400 mb-3">
              <AlertTriangle className="w-5 h-5" />
              <h3 className="font-cinzel text-lg font-bold text-[#faf8f2]">
                Dissolve Universe?
              </h3>
            </div>
            <p className="font-cormorant text-sm text-[#b8b5cc] leading-relaxed mb-6">
              Are you certain you wish to dissolve &ldquo;{selectedUniverse.title}&rdquo;? This will permanently eradicate all entities, timeline events, and causal linkages from the database. This action cannot be undone.
            </p>

            <div className="flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setIsDeleteOpen(false)}
                className="px-4 py-2 text-xs font-mono uppercase tracking-wider text-[#8b89ad] hover:text-white"
              >
                Retain Canon
              </button>
              <button
                type="button"
                onClick={handleDeleteConfirm}
                disabled={isSubmitting}
                className="px-4 py-2 rounded-lg bg-rose-900/50 border border-rose-500/60 text-xs font-mono uppercase tracking-wider text-rose-200 hover:bg-rose-900 transition-colors cursor-pointer"
              >
                {isSubmitting ? "Dissolving..." : "Confirm Dissolution"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
