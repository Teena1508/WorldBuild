"use client";

import React, { useState, useEffect, useCallback, Suspense } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  Compass,
  ArrowLeft,
  Users,
  MapPin,
  BookOpen,
  Calendar,
  GitBranch,
  Key,
  Eye,
  Plus,
  Search,
  Sparkles,
  Edit3,
  Trash2,
  Copy,
  CheckCircle,
  AlertTriangle,
  RefreshCw,
  X,
  ChevronRight,
  Layers,
  Clock,
  Share2,
  Feather,
} from "lucide-react";
import { StarfieldCanvas } from "@/components/ui/StarfieldCanvas";
import { Universe, Character, Location, Chapter, UniverseEvent, Relationship, Secret, ContinuityFinding } from "@/lib/db/types";
import { ContinuityOracleView } from "@/components/oracle/ContinuityOracleView";
import { RelationshipGraphView } from "@/components/visualizations/RelationshipGraphView";
import { ChronologicalTimelineView } from "@/components/visualizations/ChronologicalTimelineView";
import { StoryStudio } from "@/components/studio/StoryStudio";

type WorkspaceTab = "overview" | "studio" | "characters" | "locations" | "chapters" | "events" | "timeline" | "relationships" | "graph" | "secrets" | "oracle";

interface CharacterWithCounts extends Character {
  events_count?: number;
  secrets_count?: number;
  relationships_count?: number;
}

interface LocationWithCounts extends Location {
  events_count?: number;
}

interface ChapterWithCounts extends Chapter {
  events_count?: number;
}

interface EventParticipantItem {
  id: string;
  character_id: string;
  character_name: string;
  role?: string | null;
}

interface EventDependencyItem {
  id: string;
  predecessor_id: string;
  predecessor_title: string;
  predecessor_year?: number;
  reason?: string | null;
}

interface ChapterAppearanceViewItem {
  id: string;
  chapter_id: string;
  chapter_sequence: number;
  chapter_title: string;
  status: string;
  relationship_type: string;
  mention_count?: number;
  passage?: string;
  matched_alias?: string;
  associated_locations?: Array<{ entity_name?: string; name?: string }>;
  associated_characters?: Array<{ entity_name?: string; name?: string }>;
  associated_events?: Array<{ title: string }>;
}

interface EventWithDetails extends Omit<UniverseEvent, 'location_name' | 'chapter_title' | 'participants' | 'dependencies'> {
  location_name?: string | null;
  participants_count?: number;
  dependencies_count?: number;
  chapter_title?: string | null;
  participants?: EventParticipantItem[];
  dependencies?: EventDependencyItem[];
  chapter_links?: ChapterAppearanceViewItem[];
}

interface RelationshipWithDetails extends Relationship {
  source_character_name?: string;
  target_character_name?: string;
}

interface SecretKnownByItem {
  record_id?: string;
  character_id: string;
  character_name: string;
  learned_year?: number | null;
  learned_at_event_id?: string | null;
  notes?: string | null;
}

interface SecretWithDetails extends Omit<Secret, 'known_by'> {
  known_by_count?: number;
  origin_event_title?: string | null;
  known_by?: SecretKnownByItem[];
}

interface ModalDetailsState {
  events?: Array<{ id: string; title: string; timestamp_year: number; role?: string; participants_count?: number }>;
  relationships?: Array<{ id: string; target_character_name: string; relationship_type: string; intensity: number }>;
  secrets?: Array<{ character_secret_id?: string; id?: string; title: string; learned_year?: number | null; severity?: string }>;
  present_characters?: Array<{ id: string; name: string; role?: string; event_title?: string }>;
  chapter_appearances?: ChapterAppearanceViewItem[];
  event?: EventWithDetails;
  secret?: SecretWithDetails;
}

type AnyEntity = CharacterWithCounts | LocationWithCounts | ChapterWithCounts | EventWithDetails | RelationshipWithDetails | SecretWithDetails;

interface FormParticipantItem {
  character_id: string;
  character_name?: string;
  role?: string;
}

interface FormDependencyItem {
  predecessor_event_id: string;
  predecessor_title?: string;
  dependency_type?: string;
}

type FormDataRecord = Record<string, unknown>;

function UniverseWorkspaceContent() {
  const router = useRouter();
  const params = useParams();
  const universeId = params.universeId as string;

  const [activeTab, setActiveTab] = useState<WorkspaceTab>("overview");
  const [universe, setUniverse] = useState<Universe | null>(null);
  const [isOwner, setIsOwner] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isDuplicating, setIsDuplicating] = useState(false);
  const [errorBanner, setErrorBanner] = useState<string | null>(null);
  const [successToast, setSuccessToast] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [selectedStudioChapterId, setSelectedStudioChapterId] = useState<string | null>(null);
  const [studioInitialTab, setStudioInitialTab] = useState<"prose" | "notes" | "analysis">("prose");

  const handleDuplicateDemo = async () => {
    if (!universe) return;
    try {
      setIsDuplicating(true);
      const res = await fetch(`/api/universes/${universe.id}/duplicate`, {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to duplicate universe");
      router.push(`/vault/${data.universe.id}`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to duplicate demo";
      setErrorBanner(msg);
      setIsDuplicating(false);
    }
  };
  const [isDissolveUniverseOpen, setIsDissolveUniverseOpen] = useState(false);
  const [isDissolvingUniverse, setIsDissolvingUniverse] = useState(false);

  const handleDissolveUniverseConfirm = async () => {
    if (!universe) return;
    try {
      setIsDissolvingUniverse(true);
      const res = await fetch(`/api/universes/${universe.id}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to dissolve universe");
      router.push("/vault");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to dissolve universe";
      setErrorBanner(msg);
      setIsDissolvingUniverse(false);
      setIsDissolveUniverseOpen(false);
    }
  };

  // Entities state
  const [characters, setCharacters] = useState<CharacterWithCounts[]>([]);
  const [locations, setLocations] = useState<LocationWithCounts[]>([]);
  const [chapters, setChapters] = useState<ChapterWithCounts[]>([]);
  const [events, setEvents] = useState<EventWithDetails[]>([]);
  const [relationships, setRelationships] = useState<RelationshipWithDetails[]>([]);
  const [secrets, setSecrets] = useState<SecretWithDetails[]>([]);
  const [findings, setFindings] = useState<ContinuityFinding[]>([]);

  // Search & Filter
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  // Modals
  const [modalMode, setModalMode] = useState<"create" | "edit" | "delete" | "view" | null>(null);
  const [modalType, setModalType] = useState<WorkspaceTab | null>(null);
  const [selectedItem, setSelectedItem] = useState<AnyEntity | null>(null);
  const [modalDetails, setModalDetails] = useState<ModalDetailsState | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});

  // Dynamic Form Data
  const [formData, setFormData] = useState<FormDataRecord>({});

  const val = (k: string): string | number => {
    const v = formData[k];
    if (typeof v === "string" || typeof v === "number") return v;
    return "";
  };

  const showToast = (msg: string) => {
    setSuccessToast(msg);
    setTimeout(() => setSuccessToast(null), 3500);
  };

  const reloadData = useCallback(() => {
    setRefreshKey((k) => k + 1);
  }, []);

  // 1. Fetch Universe & Initial Data
  useEffect(() => {
    let ignore = false;
    async function loadUniverse() {
      try {
        setErrorBanner(null);
        const res = await fetch(`/api/universes/${universeId}`);
        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.error || "Failed to load universe");
        }
        const data = await res.json();
        if (!ignore) {
          setUniverse(data.universe);
          setIsOwner(data.isOwner);
          setIsLoading(false);
        }
      } catch (err: unknown) {
        if (!ignore) {
          const msg = err instanceof Error ? err.message : "Failed to load workspace";
          setErrorBanner(msg);
          setIsLoading(false);
        }
      }
    }
    loadUniverse();
    return () => {
      ignore = true;
    };
  }, [universeId, refreshKey]);

  // 2. Fetch specific tab data
  useEffect(() => {
    let ignore = false;
    async function loadTabData() {
      if (!universeId) return;
      try {
        if (activeTab === "overview" || activeTab === "characters" || activeTab === "graph") {
          const res = await fetch(`/api/universes/${universeId}/characters`);
          if (res.ok && !ignore) {
            const d = await res.json();
            setCharacters(d.characters || []);
          }
        }
        if (activeTab === "overview" || activeTab === "locations" || activeTab === "timeline") {
          const res = await fetch(`/api/universes/${universeId}/locations`);
          if (res.ok && !ignore) {
            const d = await res.json();
            setLocations(d.locations || []);
          }
        }
        if (activeTab === "overview" || activeTab === "chapters" || activeTab === "studio" || activeTab === "timeline") {
          const res = await fetch(`/api/universes/${universeId}/chapters`);
          if (res.ok && !ignore) {
            const d = await res.json();
            setChapters(d.chapters || []);
          }
        }
        if (activeTab === "overview" || activeTab === "events" || activeTab === "timeline") {
          const res = await fetch(`/api/universes/${universeId}/events`);
          if (res.ok && !ignore) {
            const d = await res.json();
            setEvents(d.events || []);
          }
        }
        if (activeTab === "overview" || activeTab === "relationships" || activeTab === "graph") {
          const res = await fetch(`/api/universes/${universeId}/relationships`);
          if (res.ok && !ignore) {
            const d = await res.json();
            setRelationships(d.relationships || []);
          }
        }
        if (activeTab === "overview" || activeTab === "secrets") {
          const res = await fetch(`/api/universes/${universeId}/secrets`);
          if (res.ok && !ignore) {
            const d = await res.json();
            setSecrets(d.secrets || []);
          }
        }
        if (activeTab === "overview" || activeTab === "oracle" || activeTab === "graph" || activeTab === "timeline") {
          const res = await fetch(`/api/universes/${universeId}/validate`);
          if (res.ok && !ignore) {
            const d = await res.json();
            setFindings(d.findings || []);
          }
        }
      } catch (err: unknown) {
        if (!ignore) {
          const msg = err instanceof Error ? err.message : "Failed to load tab data";
          setErrorBanner(msg);
        }
      }
    }
    loadTabData();
    return () => {
      ignore = true;
    };
  }, [universeId, activeTab, refreshKey]);

  // Fetch full details for modal view
  const openViewModal = async (type: WorkspaceTab, item: AnyEntity) => {
    setModalType(type);
    setSelectedItem(item);
    setModalMode("view");
    setModalDetails(null);

    try {
      if (type === "characters") {
        const res = await fetch(`/api/universes/${universeId}/characters/${item.id}`);
        if (res.ok) {
          const d = await res.json();
          setModalDetails(d);
        }
      } else if (type === "locations") {
        const res = await fetch(`/api/universes/${universeId}/locations/${item.id}`);
        if (res.ok) {
          const d = await res.json();
          setModalDetails(d);
        }
      } else if (type === "chapters") {
        const res = await fetch(`/api/universes/${universeId}/chapters/${item.id}`);
        if (res.ok) {
          const d = await res.json();
          setModalDetails(d);
        }
      } else if (type === "events") {
        const res = await fetch(`/api/universes/${universeId}/events/${item.id}`);
        if (res.ok) {
          const d = await res.json();
          setModalDetails(d);
        }
      } else if (type === "secrets") {
        const res = await fetch(`/api/universes/${universeId}/secrets/${item.id}`);
        if (res.ok) {
          const d = await res.json();
          setModalDetails(d);
        }
      }
    } catch {
      // ignore
    }
  };

  const handleUpdateEntityLink = async (linkId: string, chapterId: string, updates: Record<string, unknown>) => {
    try {
      const res = await fetch(`/api/universes/${universeId}/chapters/${chapterId}/entities/${linkId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      });
      if (res.ok) {
        const data = await res.json();
        if (modalDetails?.chapter_appearances) {
          setModalDetails({
            ...modalDetails,
            chapter_appearances: modalDetails.chapter_appearances.map((app: ChapterAppearanceViewItem) =>
              app.id === linkId ? { ...app, ...data.link } : app
            ),
          });
        }
        showToast("Entity link updated successfully");
      }
    } catch {
      showToast("Failed to update entity link");
    }
  };

  const openCreateModal = (type: WorkspaceTab) => {
    if (universe?.is_example) {
      setErrorBanner("The canonical demo universe is protected and read-only. Duplicate it to your personal vault to make edits.");
      return;
    }
    setModalType(type);
    setSelectedItem(null);
    setFormErrors({});
    if (type === "characters") {
      setFormData({ name: "", epithet: "", bio: "", birth_year: "", death_year: "", death_confirmed: false, death_exception_notes: "", status: "alive", aliases: "" });
    } else if (type === "locations") {
      setFormData({ name: "", realm: "Celestial Firmament", description: "", coordinates_x: "", coordinates_y: "", aliases: "" });
    } else if (type === "chapters") {
      const nextSeq = chapters.length > 0 ? Math.max(...chapters.map((c) => c.sequence_number)) + 1 : 1;
      setFormData({ title: "", sequence_number: nextSeq, summary: "" });
    } else if (type === "events") {
      const nextSeq = events.length > 0 ? Math.max(...events.map((e) => e.sequence_number || 0)) + 1 : 1;
      setFormData({ title: "", description: "", sequence_number: nextSeq, timestamp_year: 300, location_id: locations[0]?.id || "", chapter_id: chapters[0]?.id || "", is_death_event: false, participants: [], dependencies: [] });
    } else if (type === "relationships") {
      setFormData({ source_character_id: characters[0]?.id || "", target_character_id: characters[1]?.id || "", relationship_type: "allied_with", intensity: 5, notes: "" });
    } else if (type === "secrets") {
      setFormData({ title: "", content: "", severity: "major" });
    }
    setModalMode("create");
  };

  const openEditModal = (type: WorkspaceTab, item: AnyEntity) => {
    if (universe?.is_example) {
      setErrorBanner("The canonical demo universe is protected and read-only. Duplicate it to your personal vault to make edits.");
      return;
    }
    setModalType(type);
    setSelectedItem(item);
    setFormErrors({});
    setFormData({ ...(item as unknown as FormDataRecord) });
    setModalMode("edit");

    if (type === "events") {
      fetch(`/api/universes/${universeId}/events/${item.id}`)
        .then((res) => res.json())
        .then((data) => {
          if (data.event) {
            setFormData({
              ...(item as unknown as FormDataRecord),
              is_death_event: Boolean(data.event.is_death_event),
              participants: (data.event.participants || []).map((p: EventParticipantItem) => ({
                character_id: p.character_id,
                character_name: p.character_name,
                role: p.role || "",
              })),
              dependencies: (data.event.dependencies || []).map((d: EventDependencyItem) => ({
                predecessor_event_id: d.predecessor_id,
                predecessor_title: d.predecessor_title,
                dependency_type: "requires_predecessor",
              })),
            });
          }
        })
        .catch(() => {});
    }
  };

  const handleGrantSecretKnowledge = async () => {
    if (!selectedItem || !("severity" in selectedItem)) return;
    const charSelect = document.getElementById("grant-knowledge-char-select") as HTMLSelectElement | null;
    const yearInput = document.getElementById("grant-knowledge-year-input") as HTMLInputElement | null;
    const characterId = charSelect?.value;
    if (!characterId) return;

    try {
      const res = await fetch(`/api/universes/${universeId}/secrets/${selectedItem.id}/knowledge`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          character_id: characterId,
          learned_year: yearInput?.value ? Number(yearInput.value) : null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to grant secret knowledge");

      showToast("Secret knowledge conferred to character");
      if (charSelect) charSelect.value = "";
      if (yearInput) yearInput.value = "";

      const refreshRes = await fetch(`/api/universes/${universeId}/secrets/${selectedItem.id}`);
      if (refreshRes.ok) {
        const d = await refreshRes.json();
        setModalDetails(d);
      }
      reloadData();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to grant knowledge";
      alert(msg);
    }
  };

  const handleRevokeSecretKnowledge = async (secretId: string, characterId: string) => {
    try {
      const res = await fetch(`/api/universes/${universeId}/secrets/${secretId}/knowledge?characterId=${characterId}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to revoke secret knowledge");

      showToast("Secret knowledge expunged from character");

      const refreshRes = await fetch(`/api/universes/${universeId}/secrets/${secretId}`);
      if (refreshRes.ok) {
        const d = await refreshRes.json();
        setModalDetails(d);
      }
      reloadData();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to revoke knowledge";
      alert(msg);
    }
  };

  const openDeleteModal = (type: WorkspaceTab, item: AnyEntity) => {
    if (universe?.is_example) {
      setErrorBanner("The canonical demo universe is protected and read-only. Duplicate it to your personal vault to make edits.");
      return;
    }
    setModalType(type);
    setSelectedItem(item);
    setModalMode("delete");
  };

  const closeModal = () => {
    setModalMode(null);
    setModalType(null);
    setSelectedItem(null);
    setModalDetails(null);
    setFormErrors({});
  };

  // Form Submit Handler
  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!modalType) return;
    if (universe?.is_example) {
      setErrorBanner("The canonical demo universe is protected and read-only. Duplicate it to your personal vault to make edits.");
      return;
    }
    setIsSubmitting(true);
    setFormErrors({});

    try {
      let endpoint = `/api/universes/${universeId}/${modalType}`;
      const method = modalMode === "create" ? "POST" : "PUT";
      if (modalMode === "edit" && selectedItem) {
        endpoint = `${endpoint}/${selectedItem.id}`;
      }

      const res = await fetch(endpoint, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Operation failed");
      }

      showToast(modalMode === "create" ? `Created new ${modalType.slice(0, -1)} successfully` : `Updated ${modalType.slice(0, -1)}`);
      closeModal();
      reloadData();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Submission failed";
      setFormErrors({ submit: msg });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Delete Confirm Handler
  const handleDeleteConfirm = async () => {
    if (!modalType || !selectedItem) return;
    if (universe?.is_example) {
      setErrorBanner("The canonical demo universe is protected and read-only. Duplicate it to your personal vault to make edits.");
      return;
    }
    setIsSubmitting(true);
    try {
      const endpoint = `/api/universes/${universeId}/${modalType}/${selectedItem.id}`;
      const res = await fetch(endpoint, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Deletion failed");

      showToast(`Dissolved ${modalType.slice(0, -1)} from canon`);
      closeModal();
      reloadData();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Deletion failed";
      alert(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading && !universe) {
    return (
      <div className="relative min-h-screen bg-[#040509] text-[#e0ddcf] flex items-center justify-center">
        <StarfieldCanvas />
        <div className="text-center z-10">
          <RefreshCw className="w-8 h-8 text-[#fae48f] animate-spin mx-auto mb-3" />
          <p className="font-mono text-xs tracking-widest text-[#fae48f] uppercase">
            Harmonizing Universe Coordinates...
          </p>
        </div>
      </div>
    );
  }

  if (!universe) {
    return (
      <div className="relative min-h-screen bg-[#040509] text-[#e0ddcf] flex items-center justify-center p-6">
        <StarfieldCanvas />
        <div className="celestial-card p-8 rounded-xl max-w-md text-center z-10">
          <AlertTriangle className="w-10 h-10 text-rose-400 mx-auto mb-3" />
          <h2 className="font-cinzel text-xl font-bold text-[#faf8f2] mb-2">Universe Not Found</h2>
          <p className="font-cormorant text-sm text-[#a2a0bc] mb-6">
            The requested celestial continuum does not exist or access has been restricted by the Synod.
          </p>
          <Link
            href="/vault"
            className="gold-glow-button inline-flex items-center gap-2 px-5 py-2 rounded-lg text-xs font-mono uppercase text-[#fae48f]"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Return to World Vault</span>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="relative min-h-screen bg-[#040509] text-[#e0ddcf] selection:bg-[#d4af37]/30 selection:text-[#fae48f] overflow-x-hidden flex flex-col">
      <StarfieldCanvas />

      {/* Toast Notification */}
      {successToast && (
        <div className="fixed bottom-6 right-6 z-50 flex items-center gap-2 px-4 py-3 rounded-lg border border-emerald-500/40 bg-[#09151c]/95 text-emerald-300 font-mono text-xs shadow-2xl backdrop-blur-md animate-fade-in">
          <CheckCircle className="w-4 h-4 text-emerald-400" />
          <span>{successToast}</span>
        </div>
      )}

      {/* Top Workspace Header */}
      <header className="relative z-20 border-b border-[#1b223d] bg-[#070914]/85 backdrop-blur-md sticky top-0">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3.5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link
              href="/vault"
              className="inline-flex items-center gap-1.5 text-xs font-mono tracking-wider text-[#8a88ab] hover:text-[#fae48f] transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>World Vault</span>
            </Link>
            <div className="h-4 w-px bg-[#202742]" />
            <div className="flex items-center gap-2 truncate">
              <Compass className="w-4 h-4 text-[#fae48f] shrink-0" />
              <h1 className="font-cinzel text-sm sm:text-base font-bold text-[#faf8f2] truncate">
                {universe.title}
              </h1>
              {universe.is_example ? (
                <span className="text-[10px] font-mono tracking-wider uppercase px-2 py-0.5 rounded border border-[#d4af37]/40 bg-[#121633] text-[#fae48f] shrink-0">
                  Exemplar Canon
                </span>
              ) : isOwner ? (
                <span className="text-[10px] font-mono tracking-wider uppercase px-2 py-0.5 rounded border border-emerald-500/40 bg-emerald-950/40 text-emerald-300 shrink-0">
                  Archivist-in-Charge
                </span>
              ) : (
                <span className="text-[10px] font-mono tracking-wider uppercase px-2 py-0.5 rounded border border-[#232b50] bg-[#0b102b] text-[#8e8ca8] shrink-0">
                  Read Only
                </span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-3 text-xs font-mono">
            <button
              onClick={reloadData}
              title="Refresh Workspace Data"
              className="p-1.5 rounded-lg border border-[#20294e] bg-[#080b1e] text-[#8886a8] hover:text-[#fae48f] transition-colors cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
            {isOwner && !universe.is_example && (
              <button
                onClick={() => setIsDissolveUniverseOpen(true)}
                title="Dissolve this universe"
                className="px-2.5 py-1.5 rounded-lg border border-rose-500/40 bg-rose-950/20 text-rose-300 hover:bg-rose-900/40 hover:text-rose-200 transition-colors flex items-center gap-1.5 cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Dissolve</span>
              </button>
            )}
            <Link
              href={`/vault`}
              className="text-[#8886a8] hover:text-[#fae48f] transition-colors"
            >
              Exit Workspace
            </Link>
          </div>
        </div>
      </header>

      {/* Secondary Navigation Ribbon */}
      <nav className="relative z-10 border-b border-[#18203c] bg-[#050714]/90 backdrop-blur-md overflow-x-auto">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex items-center gap-1 py-1">
          {[
            { id: "overview", label: "Overview", icon: Layers },
            { id: "studio", label: "Story Studio", icon: Feather },
            { id: "characters", label: `Characters (${universe.stats?.charactersCount || 0})`, icon: Users },
            { id: "relationships", label: `Relationships (${universe.stats?.relationshipsCount || 0})`, icon: GitBranch },
            { id: "graph", label: `Relationship Graph`, icon: Share2 },
            { id: "locations", label: `Locations (${universe.stats?.locationsCount || 0})`, icon: MapPin },
            { id: "chapters", label: `Chapters (${universe.stats?.chaptersCount || 0})`, icon: BookOpen },
            { id: "events", label: `Events Catalog (${universe.stats?.eventsCount || 0})`, icon: Calendar },
            { id: "timeline", label: `Story Timeline`, icon: Clock },
            { id: "secrets", label: `Secrets (${universe.stats?.secretsCount || 0})`, icon: Key },
            { id: "oracle", label: `Continuity Oracle`, icon: Eye, badge: universe.stats?.openFindingsCount },
          ].map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => {
                  setActiveTab(tab.id as WorkspaceTab);
                  setSearchQuery("");
                }}
                className={`flex items-center gap-1.5 px-3.5 py-2.5 text-xs font-mono tracking-wider uppercase transition-all whitespace-nowrap cursor-pointer border-b-2 ${
                  isActive
                    ? "border-[#fae48f] text-[#fae48f] font-semibold bg-[#111738]/50"
                    : "border-transparent text-[#83819e] hover:text-[#dedbd0] hover:bg-[#0c1026]"
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{tab.label}</span>
                {tab.badge !== undefined && tab.badge > 0 && (
                  <span className="text-[10px] px-1.5 py-0.2 rounded-full border border-rose-500/40 bg-rose-950/80 text-rose-300">
                    {tab.badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </nav>

      {/* Main Workspace Body */}
      <main className="relative z-10 flex-1 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 w-full">
        {/* Exemplar Demonstration Canon Banner (Read-Only) */}
        {universe.is_example && (
          <div className="mb-8 p-6 rounded-2xl border border-[#d4af37]/40 bg-gradient-to-r from-[#121633] via-[#0d1228] to-[#121633] shadow-2xl relative overflow-hidden">
            <div className="absolute top-0 right-0 w-96 h-96 bg-[#d4af37]/5 rounded-full blur-3xl pointer-events-none" />
            <div className="relative z-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
              <div className="space-y-1.5 max-w-3xl">
                <div className="inline-flex items-center gap-2 px-2.5 py-0.5 rounded-full border border-[#d4af37]/40 bg-[#070a1a] text-[10px] font-mono tracking-widest uppercase text-[#fae48f]">
                  <Sparkles className="w-3 h-3 text-[#fae48f]" />
                  <span>Exemplar Demonstration Canon &bull; Read-Only</span>
                </div>
                <h3 className="font-cinzel text-xl sm:text-2xl font-bold text-[#faf8f2]">
                  Exploring Shared Exemplar: {universe.title}
                </h3>
                <p className="font-cormorant text-base sm:text-lg text-[#b8b5cc] leading-relaxed">
                  You are exploring the shared demonstration universe. You can freely tour the character networks, inspect location coordinates, interact with the timeline and relationship graphs, and review Continuity Oracle paradox findings. To add characters, write lore, or resolve findings, duplicate this universe into your personal vault.
                </p>
              </div>

              <div className="shrink-0">
                <button
                  onClick={handleDuplicateDemo}
                  disabled={isDuplicating}
                  id="duplicate-demo-workspace-btn"
                  className="gold-glow-button inline-flex items-center gap-2 px-5 py-3 rounded-xl text-xs font-mono tracking-wider uppercase font-semibold text-[#fae48f] cursor-pointer shadow-lg hover:scale-105 transition-all"
                >
                  <Copy className={`w-4 h-4 ${isDuplicating ? "animate-spin" : ""}`} />
                  <span>{isDuplicating ? "Cloning Astral Realm..." : "Duplicate Demo to My Worlds"}</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Error Callout */}
        {errorBanner && (
          <div className="p-4 rounded-xl border border-rose-500/30 bg-rose-950/20 text-rose-300 text-xs font-mono flex items-center justify-between mb-6">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{errorBanner}</span>
            </div>
            <button
              onClick={() => setErrorBanner(null)}
              className="text-xs hover:text-white"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* ======================================================== */}
        {/* TAB 1: OVERVIEW */}
        {/* ======================================================== */}
        {activeTab === "overview" && (
          <div className="space-y-8 animate-fade-in">
            {/* Hero Card */}
            <div className="celestial-card rounded-2xl border border-[#d4af37]/25 p-6 sm:p-8 relative overflow-hidden bg-gradient-to-br from-[#0c122e] via-[#070a1b] to-[#04050d]">
              <div className="max-w-3xl">
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-[#d4af37]/30 bg-[#090d24] text-[11px] font-mono tracking-widest uppercase text-[#fae48f] mb-3">
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Causal Nexus Overview</span>
                </div>
                <h2 className="font-cinzel text-2xl sm:text-4xl font-bold text-[#faf8f2] mb-3">
                  {universe.title}
                </h2>
                <p className="font-cormorant text-base sm:text-lg text-[#b8b5cc] leading-relaxed">
                  {universe.description}
                </p>
              </div>

              {/* Statistics Cards */}
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3.5 mt-8 pt-6 border-t border-[#1e264a]">
                {[
                  { label: "Characters", count: universe.stats?.charactersCount || characters.length, tab: "characters" },
                  { label: "Locations", count: universe.stats?.locationsCount || locations.length, tab: "locations" },
                  { label: "Chapters", count: universe.stats?.chaptersCount || chapters.length, tab: "chapters" },
                  { label: "Events", count: universe.stats?.eventsCount || events.length, tab: "events" },
                  { label: "Relationships", count: universe.stats?.relationshipsCount || relationships.length, tab: "relationships" },
                  { label: "Lore Secrets", count: universe.stats?.secretsCount || secrets.length, tab: "secrets" },
                ].map((stat) => (
                  <div
                    key={stat.label}
                    onClick={() => setActiveTab(stat.tab as WorkspaceTab)}
                    className="p-3.5 rounded-xl border border-[#1e274a] bg-[#070b20]/60 hover:border-[#fae48f]/40 hover:bg-[#0c1230] transition-all cursor-pointer"
                  >
                    <span className="text-[11px] font-mono uppercase tracking-wider text-[#797699] block mb-1">
                      {stat.label}
                    </span>
                    <span className="font-cinzel text-xl sm:text-2xl font-bold text-[#fae48f]">
                      {stat.count}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Neo-Story Onboarding Roadmap (When world has 0 entities) */}
            {!universe.is_example && characters.length === 0 && events.length === 0 && (
              <div className="celestial-card p-6 sm:p-8 rounded-2xl border border-[#d4af37]/40 bg-gradient-to-r from-[#0d1330] via-[#090d24] to-[#050714] shadow-xl relative overflow-hidden animate-fade-in">
                <div className="max-w-2xl relative z-10 space-y-4">
                  <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-[#d4af37]/40 bg-[#121a42] text-[10px] font-mono tracking-widest uppercase text-[#fae48f]">
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>Sovereign Canon Inception</span>
                  </div>
                  <h3 className="font-cinzel text-xl sm:text-2xl font-bold text-[#faf8f2]">
                    The Cosmic Slate Awaits Your Pen
                  </h3>
                  <p className="font-cormorant text-base text-[#b8b5cc] leading-relaxed">
                    This personal world is pristine and unencumbered by temporal contradictions. Begin weaving your lore by anchoring characters, geographic realms, and chronological epochs using the prompts below:
                  </p>

                  <div className="flex flex-wrap items-center gap-2.5 pt-2">
                    <button
                      onClick={() => openCreateModal("characters")}
                      className="gold-glow-button px-4 py-2 rounded-lg text-xs font-mono tracking-wider uppercase font-semibold text-[#fae48f] flex items-center gap-1.5 cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Inscribe First Character</span>
                    </button>
                    <button
                      onClick={() => openCreateModal("locations")}
                      className="px-4 py-2 rounded-lg border border-[#2b3560] bg-[#0c1228] hover:border-[#fae48f] text-xs font-mono tracking-wider uppercase text-[#e0ddcf] flex items-center gap-1.5 cursor-pointer"
                    >
                      <MapPin className="w-3.5 h-3.5 text-[#d4af37]" />
                      <span>Anchor Realm Location</span>
                    </button>
                    <button
                      onClick={() => openCreateModal("chapters")}
                      className="px-4 py-2 rounded-lg border border-[#2b3560] bg-[#0c1228] hover:border-[#fae48f] text-xs font-mono tracking-wider uppercase text-[#e0ddcf] flex items-center gap-1.5 cursor-pointer"
                    >
                      <BookOpen className="w-3.5 h-3.5 text-[#d4af37]" />
                      <span>Bind Opening Chapter</span>
                    </button>
                    <button
                      onClick={() => openCreateModal("events")}
                      className="px-4 py-2 rounded-lg border border-[#2b3560] bg-[#0c1228] hover:border-[#fae48f] text-xs font-mono tracking-wider uppercase text-[#e0ddcf] flex items-center gap-1.5 cursor-pointer"
                    >
                      <Calendar className="w-3.5 h-3.5 text-[#d4af37]" />
                      <span>Plot First Historical Event</span>
                    </button>
                    <button
                      onClick={() => openCreateModal("secrets")}
                      className="px-4 py-2 rounded-lg border border-[#2b3560] bg-[#0c1228] hover:border-[#fae48f] text-xs font-mono tracking-wider uppercase text-[#e0ddcf] flex items-center gap-1.5 cursor-pointer"
                    >
                      <Key className="w-3.5 h-3.5 text-[#d4af37]" />
                      <span>Conceal Arcane Secret</span>
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Interactive Visualizations Showcase */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div
                onClick={() => setActiveTab("timeline")}
                className="celestial-card p-5 rounded-2xl border border-[#d4af37]/30 bg-gradient-to-br from-[#0c1230] via-[#080d24] to-[#040612] hover:border-[#fae48f] transition-all cursor-pointer group"
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full border border-[#d4af37]/30 bg-[#0c1230] text-[10px] font-mono tracking-wider uppercase text-[#fae48f]">
                    <Clock className="w-3 h-3 text-[#fae48f]" />
                    <span>Interactive Timeline</span>
                  </div>
                  <ChevronRight className="w-4 h-4 text-[#8a88ab] group-hover:text-[#fae48f] group-hover:translate-x-1 transition-all" />
                </div>
                <h3 className="font-cinzel text-lg font-bold text-[#faf8f2] group-hover:text-[#fae48f] transition-colors">
                  Chronological Story Continuum
                </h3>
                <p className="font-cormorant text-sm text-[#b8b5cc] mt-1 line-clamp-2">
                  Explore events along in-universe timeline years with chapter groupings, mortality flags, and causal paradox indicators.
                </p>
                <div className="flex items-center gap-3 mt-3 text-xs font-mono text-[#8a88ab]">
                  <span>{events.length} timeline milestones</span>
                  <span>•</span>
                  <span>{chapters.length} chapters</span>
                </div>
              </div>

              <div
                onClick={() => setActiveTab("graph")}
                className="celestial-card p-5 rounded-2xl border border-[#d4af37]/30 bg-gradient-to-br from-[#0c1230] via-[#080d24] to-[#040612] hover:border-[#fae48f] transition-all cursor-pointer group"
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full border border-[#d4af37]/30 bg-[#0c1230] text-[10px] font-mono tracking-wider uppercase text-[#fae48f]">
                    <Share2 className="w-3 h-3 text-[#fae48f]" />
                    <span>Interactive Topology</span>
                  </div>
                  <ChevronRight className="w-4 h-4 text-[#8a88ab] group-hover:text-[#fae48f] group-hover:translate-x-1 transition-all" />
                </div>
                <h3 className="font-cinzel text-lg font-bold text-[#faf8f2] group-hover:text-[#fae48f] transition-colors">
                  Character Relationship Topology
                </h3>
                <p className="font-cormorant text-sm text-[#b8b5cc] mt-1 line-clamp-2">
                  Interactive SVG graph displaying directional character bonds, causal intensity weights, and live continuity paradox rings.
                </p>
                <div className="flex items-center gap-3 mt-3 text-xs font-mono text-[#8a88ab]">
                  <span>{characters.length} character nodes</span>
                  <span>•</span>
                  <span>{relationships.length} directed bonds</span>
                </div>
              </div>
            </div>

            {/* Quick Activity / Recent Records */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

              {/* Chronological Milestones Preview */}
              <div className="celestial-card p-6 rounded-xl border border-[#1b2344] bg-[#070a1c]">
                <div className="flex items-center justify-between pb-4 border-b border-[#18203c] mb-4">
                  <div className="flex items-center gap-2">
                    <Calendar className="w-4 h-4 text-[#fae48f]" />
                    <h3 className="font-cinzel text-base font-bold text-[#faf8f2]">
                      Chronology Anchor Points
                    </h3>
                  </div>
                  <button
                    onClick={() => setActiveTab("events")}
                    className="text-xs font-mono text-[#fae48f] hover:underline flex items-center gap-1"
                  >
                    <span>View All ({events.length})</span>
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>

                {events.length === 0 ? (
                  <p className="font-cormorant text-sm text-[#797699] italic py-6 text-center">
                    No timeline events cataloged yet.
                  </p>
                ) : (
                  <div className="space-y-3">
                    {events.slice(0, 5).map((ev) => (
                      <div
                        key={ev.id}
                        onClick={() => openViewModal("events", ev)}
                        className="p-3 rounded-lg border border-[#1b223d] bg-[#090e24] hover:border-[#fae48f]/30 transition-all cursor-pointer flex items-center justify-between"
                      >
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-xs text-[#fae48f] font-semibold">
                              Year {ev.timestamp_year}
                            </span>
                            <span className="text-xs text-[#4c4a68]">•</span>
                            <h4 className="font-cinzel text-sm text-[#dedbd0] font-semibold">
                              {ev.title}
                            </h4>
                          </div>
                          {ev.location_name && (
                            <span className="text-[11px] font-mono text-[#767396] block mt-0.5">
                              📍 {ev.location_name}
                            </span>
                          )}
                        </div>
                        <span className="text-[10px] font-mono text-[#6c6a8a]">
                          {ev.participants_count || 0} participants
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Inhabitants Roster Preview */}
              <div className="celestial-card p-6 rounded-xl border border-[#1b2344] bg-[#070a1c]">
                <div className="flex items-center justify-between pb-4 border-b border-[#18203c] mb-4">
                  <div className="flex items-center gap-2">
                    <Users className="w-4 h-4 text-sky-400" />
                    <h3 className="font-cinzel text-base font-bold text-[#faf8f2]">
                      Canon Inhabitants
                    </h3>
                  </div>
                  <button
                    onClick={() => setActiveTab("characters")}
                    className="text-xs font-mono text-[#fae48f] hover:underline flex items-center gap-1"
                  >
                    <span>View All ({characters.length})</span>
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>

                {characters.length === 0 ? (
                  <p className="font-cormorant text-sm text-[#797699] italic py-6 text-center">
                    No characters inscribed in this universe yet.
                  </p>
                ) : (
                  <div className="space-y-3">
                    {characters.slice(0, 5).map((char) => (
                      <div
                        key={char.id}
                        onClick={() => openViewModal("characters", char)}
                        className="p-3 rounded-lg border border-[#1b223d] bg-[#090e24] hover:border-[#fae48f]/30 transition-all cursor-pointer flex items-center justify-between"
                      >
                        <div>
                          <h4 className="font-cinzel text-sm text-[#dedbd0] font-semibold">
                            {char.name}
                          </h4>
                          {char.epithet && (
                            <span className="font-cormorant text-xs text-[#a09eb8] italic block">
                              &ldquo;{char.epithet}&rdquo;
                            </span>
                          )}
                        </div>
                        <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded border border-[#2b355e] bg-[#0b1029] text-[#fae48f]">
                          {char.status}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ======================================================== */}
        {/* TAB 2: CHARACTERS */}
        {/* ======================================================== */}
        {activeTab === "characters" && (
          <div className="space-y-6 animate-fade-in">
            {/* Action Bar */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 pb-4 border-b border-[#1b223d]">
              <div className="flex items-center gap-3">
                <div className="relative w-64">
                  <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-[#686684]" />
                  <input
                    type="text"
                    placeholder="Search characters..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-8 pr-3 py-1.5 rounded-lg bg-[#080b1e] border border-[#20294e] text-xs font-mono text-[#e6e3da] placeholder-[#646280] focus:outline-none focus:border-[#fae48f]"
                  />
                </div>

                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="px-3 py-1.5 rounded-lg bg-[#080b1e] border border-[#20294e] text-xs font-mono text-[#e6e3da] focus:outline-none"
                >
                  <option value="all">All Statuses</option>
                  <option value="alive">Alive</option>
                  <option value="deceased">Deceased</option>
                  <option value="ascended">Ascended</option>
                  <option value="displaced">Displaced</option>
                  <option value="unknown">Unknown</option>
                </select>
              </div>

              {universe.is_example ? (
                <button
                  onClick={handleDuplicateDemo}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-[#d4af37]/40 bg-[#0d1228] text-xs font-mono tracking-wider uppercase text-[#fae48f] hover:bg-[#151c3d] cursor-pointer"
                >
                  <Copy className="w-3.5 h-3.5" />
                  <span>Duplicate Demo to Inscribe</span>
                </button>
              ) : (
                <button
                  onClick={() => openCreateModal("characters")}
                  className="gold-glow-button inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-mono tracking-wider uppercase font-semibold text-[#fae48f] cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  <span>Inscribe Character</span>
                </button>
              )}
            </div>

            {/* Character Cards */}
            {characters.length === 0 ? (
              <div className="celestial-card p-12 text-center rounded-xl">
                <Users className="w-10 h-10 text-[#d4af37]/40 mx-auto mb-3" />
                <h3 className="font-cinzel text-lg font-bold text-[#faf8f2] mb-1">
                  No Characters Recorded
                </h3>
                <p className="font-cormorant text-sm text-[#8a88a6] mb-4">
                  Begin populating your fictional realm with heroes, scribes, and deities.
                </p>
                <button
                  onClick={() => openCreateModal("characters")}
                  className="gold-glow-button px-4 py-2 rounded-lg text-xs font-mono uppercase text-[#fae48f]"
                >
                  Create First Character
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {characters
                  .filter((c) => {
                    const matchesSearch =
                      !searchQuery ||
                      c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                      (c.epithet && c.epithet.toLowerCase().includes(searchQuery.toLowerCase())) ||
                      c.bio.toLowerCase().includes(searchQuery.toLowerCase());
                    const matchesStatus = statusFilter === "all" || c.status === statusFilter;
                    return matchesSearch && matchesStatus;
                  })
                  .map((char) => (
                    <div
                      key={char.id}
                      className="celestial-card p-5 rounded-xl border border-[#1b2344] bg-[#070b1e] hover:border-[#fae48f]/40 transition-all flex flex-col justify-between"
                    >
                      <div>
                        <div className="flex items-start justify-between gap-2 mb-2">
                          <div>
                            <h4
                              onClick={() => openViewModal("characters", char)}
                              className="font-cinzel text-base font-bold text-[#faf8f2] hover:text-[#fae48f] transition-colors cursor-pointer"
                            >
                              {char.name}
                            </h4>
                            {char.epithet && (
                              <p className="font-cormorant text-xs text-[#a2a0c0] italic">
                                &ldquo;{char.epithet}&rdquo;
                              </p>
                            )}
                          </div>
                          <span className="text-[10px] font-mono tracking-wider uppercase px-2 py-0.5 rounded border border-[#232b50] bg-[#0b102b] text-[#fae48f]">
                            {char.status}
                          </span>
                        </div>

                        <p className="font-cormorant text-xs text-[#8c8aab] line-clamp-2 leading-relaxed mb-4">
                          {char.bio}
                        </p>

                        <div className="text-[11px] font-mono text-[#6c698a] mb-3">
                          <span>Lifespan: </span>
                          <span className="text-[#dedbd0]">
                            {char.birth_year ? `Year ${char.birth_year}` : "Unknown"}
                            {" — "}
                            {char.death_year ? `Year ${char.death_year}` : char.death_confirmed ? "Deceased" : "Present"}
                          </span>
                        </div>

                        <div className="flex items-center gap-3 text-[11px] font-mono text-[#787596] pt-3 border-t border-[#18203c]">
                          <span>{char.events_count || 0} Events</span>
                          <span>•</span>
                          <span>{char.secrets_count || 0} Secrets</span>
                          <span>•</span>
                          <span>{char.relationships_count || 0} Bonds</span>
                        </div>
                      </div>

                      <div className="flex items-center justify-end gap-2 pt-3 mt-4 border-t border-[#151c36]">
                        <button
                          onClick={() => openViewModal("characters", char)}
                          className="px-2.5 py-1 text-xs font-mono text-[#fae48f] hover:underline"
                        >
                          Inspect
                        </button>
                        {!universe.is_example && (
                          <>
                            <button
                              onClick={() => openEditModal("characters", char)}
                              className="p-1.5 rounded text-[#7e7c9e] hover:text-white"
                              title="Edit Character"
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => openDeleteModal("characters", char)}
                              className="p-1.5 rounded text-[#7e7c9e] hover:text-rose-400"
                              title="Delete Character"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  ))}
              </div>
            )}
          </div>
        )}

        {/* ======================================================== */}
        {/* TAB 3: LOCATIONS */}
        {/* ======================================================== */}
        {activeTab === "locations" && (
          <div className="space-y-6 animate-fade-in">
            <div className="flex items-center justify-between pb-4 border-b border-[#1b223d]">
              <div className="relative w-64">
                <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-[#686684]" />
                <input
                  type="text"
                  placeholder="Search locations..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-8 pr-3 py-1.5 rounded-lg bg-[#080b1e] border border-[#20294e] text-xs font-mono text-[#e6e3da] placeholder-[#646280] focus:outline-none focus:border-[#fae48f]"
                />
              </div>

              {universe.is_example ? (
                <button
                  onClick={handleDuplicateDemo}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-[#d4af37]/40 bg-[#0d1228] text-xs font-mono tracking-wider uppercase text-[#fae48f] hover:bg-[#151c3d] cursor-pointer"
                >
                  <Copy className="w-3.5 h-3.5" />
                  <span>Duplicate Demo to Map</span>
                </button>
              ) : (
                <button
                  onClick={() => openCreateModal("locations")}
                  className="gold-glow-button inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-mono tracking-wider uppercase font-semibold text-[#fae48f] cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  <span>Map Location</span>
                </button>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {locations
                .filter((l) => !searchQuery || l.name.toLowerCase().includes(searchQuery.toLowerCase()) || l.realm.toLowerCase().includes(searchQuery.toLowerCase()))
                .map((loc) => (
                  <div
                    key={loc.id}
                    className="celestial-card p-5 rounded-xl border border-[#1b2344] bg-[#070b1e] hover:border-[#fae48f]/40 transition-all flex flex-col justify-between"
                  >
                    <div>
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <h4
                          onClick={() => openViewModal("locations", loc)}
                          className="font-cinzel text-base font-bold text-[#faf8f2] hover:text-[#fae48f] cursor-pointer"
                        >
                          {loc.name}
                        </h4>
                        <span className="text-[10px] font-mono tracking-wider uppercase px-2 py-0.5 rounded border border-[#232b50] bg-[#0b102b] text-sky-300">
                          {loc.realm}
                        </span>
                      </div>

                      <p className="font-cormorant text-xs text-[#8c8aab] line-clamp-3 leading-relaxed mb-4">
                        {loc.description}
                      </p>

                      <div className="text-[11px] font-mono text-[#6c698a]">
                        Coordinates: {loc.coordinates_x !== null ? `(${loc.coordinates_x}, ${loc.coordinates_y})` : "Unmapped"}
                      </div>
                    </div>

                    <div className="flex items-center justify-between pt-3 mt-4 border-t border-[#151c36]">
                      <span className="text-[11px] font-mono text-[#787596]">
                        {loc.events_count || 0} Events Recorded
                      </span>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => openViewModal("locations", loc)}
                          className="px-2 py-1 text-xs font-mono text-[#fae48f] hover:underline"
                        >
                          Inspect
                        </button>
                        {!universe.is_example && (
                          <>
                            <button
                              onClick={() => openEditModal("locations", loc)}
                              className="p-1.5 rounded text-[#7e7c9e] hover:text-white"
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => openDeleteModal("locations", loc)}
                              className="p-1.5 rounded text-[#7e7c9e] hover:text-rose-400"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
            </div>
          </div>
        )}

        {/* ======================================================== */}
        {/* TAB: STORY STUDIO */}
        {/* ======================================================== */}
        {activeTab === "studio" && (
          <div className="animate-fade-in">
            <StoryStudio
              universe={universe}
              initialChapters={chapters}
              initialSelectedChapterId={selectedStudioChapterId}
              initialTab={studioInitialTab}
              onUniverseRefresh={() => setRefreshKey((k) => k + 1)}
            />
          </div>
        )}

        {/* ======================================================== */}
        {/* TAB 4: CHAPTERS */}
        {/* ======================================================== */}
        {activeTab === "chapters" && (
          <div className="space-y-6 animate-fade-in">
            <div className="flex items-center justify-between pb-4 border-b border-[#1b223d]">
              <span className="text-xs font-mono tracking-wider uppercase text-[#8885a6]">
                Manuscript Sequence &amp; Narrative Arcs
              </span>
              <div className="flex items-center gap-2.5">
                <button
                  onClick={() => setActiveTab("studio")}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-[#d4af37]/50 bg-[#0e163b] text-xs font-mono tracking-wider uppercase text-[#fae48f] hover:bg-[#162152] transition-all cursor-pointer font-bold shadow-[0_0_15px_rgba(212,175,55,0.15)]"
                >
                  <Feather className="w-3.5 h-3.5" />
                  <span>Open Story Studio</span>
                </button>
                {universe.is_example ? (
                  <button
                    onClick={handleDuplicateDemo}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-[#d4af37]/40 bg-[#0d1228] text-xs font-mono tracking-wider uppercase text-[#fae48f] hover:bg-[#151c3d] cursor-pointer"
                  >
                    <Copy className="w-3.5 h-3.5" />
                    <span>Duplicate Demo to Inscribe</span>
                  </button>
                ) : (
                  <button
                    onClick={() => openCreateModal("chapters")}
                    className="gold-glow-button inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-mono tracking-wider uppercase font-semibold text-[#fae48f] cursor-pointer"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Inscribe Chapter</span>
                  </button>
                )}
              </div>
            </div>

            <div className="space-y-3">
              {chapters.map((chap) => (
                <div
                  key={chap.id}
                  className="celestial-card p-4 rounded-xl border border-[#1b2344] bg-[#070b1e] flex items-center justify-between gap-4"
                >
                  <div className="flex items-start gap-4">
                    <div className="w-10 h-10 rounded-lg border border-[#d4af37]/30 bg-[#0d1228] text-[#fae48f] font-mono text-xs font-bold flex items-center justify-center shrink-0">
                      #{chap.sequence_number}
                    </div>
                    <div>
                      <h4
                        onClick={() => openViewModal("chapters", chap)}
                        className="font-cinzel text-base font-bold text-[#faf8f2] hover:text-[#fae48f] cursor-pointer"
                      >
                        {chap.title}
                      </h4>
                      <p className="font-cormorant text-xs text-[#8c8aab] line-clamp-1 mt-0.5">
                        {chap.summary}
                      </p>
                      {chap.word_count ? (
                        <span className="text-[10px] font-mono text-[#747192] mt-1 inline-block">
                          {chap.word_count} words • v{chap.version || 1}
                        </span>
                      ) : null}
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => {
                        setSelectedStudioChapterId(chap.id);
                        setStudioInitialTab("prose");
                        setActiveTab("studio");
                      }}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-[#d4af37]/30 bg-[#0c122e] text-xs font-mono text-[#fae48f] hover:bg-[#131c47] transition-all cursor-pointer"
                      title="Write chapter prose in Story Studio"
                    >
                      <Feather className="w-3 h-3" />
                      <span>Write</span>
                    </button>
                    <button
                      onClick={() => {
                        setSelectedStudioChapterId(chap.id);
                        setStudioInitialTab("analysis");
                        setActiveTab("studio");
                      }}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-[#d4af37]/40 bg-[#12183a] text-xs font-mono text-[#fae48f] hover:bg-[#1a2354] transition-all cursor-pointer font-semibold shadow-[0_0_10px_rgba(212,175,55,0.1)]"
                      title="Analyze this chapter in Continuity Oracle"
                    >
                      <Sparkles className="w-3 h-3 text-[#fae48f]" />
                      <span>Analyze</span>
                    </button>
                    <span className="text-xs font-mono text-[#787596]">
                      {chap.events_count || 0} Events Linked
                    </span>
                    {!universe.is_example && (
                      <>
                        <button
                          onClick={() => openEditModal("chapters", chap)}
                          className="p-1.5 rounded text-[#7e7c9e] hover:text-white"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => openDeleteModal("chapters", chap)}
                          className="p-1.5 rounded text-[#7e7c9e] hover:text-rose-400"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ======================================================== */}
        {/* TAB 5: EVENTS & CHRONOLOGY */}
        {/* ======================================================== */}
        {activeTab === "events" && (
          <div className="space-y-6 animate-fade-in">
            <div className="flex items-center justify-between pb-4 border-b border-[#1b223d]">
              <div className="relative w-64">
                <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-[#686684]" />
                <input
                  type="text"
                  placeholder="Search chronological events..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-8 pr-3 py-1.5 rounded-lg bg-[#080b1e] border border-[#20294e] text-xs font-mono text-[#e6e3da] placeholder-[#646280] focus:outline-none focus:border-[#fae48f]"
                />
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setActiveTab("timeline")}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-[#20294e] bg-[#090e24] text-xs font-mono text-[#fae48f] hover:bg-[#12193d] transition-colors cursor-pointer"
                >
                  <Clock className="w-3.5 h-3.5" />
                  <span>Story Timeline View</span>
                </button>
                {universe.is_example ? (
                  <button
                    onClick={handleDuplicateDemo}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-[#d4af37]/40 bg-[#0d1228] text-xs font-mono tracking-wider uppercase text-[#fae48f] hover:bg-[#151c3d] cursor-pointer"
                  >
                    <Copy className="w-3.5 h-3.5" />
                    <span>Duplicate Demo to Anchor</span>
                  </button>
                ) : (
                  <button
                    onClick={() => openCreateModal("events")}
                    className="gold-glow-button inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-mono tracking-wider uppercase font-semibold text-[#fae48f] cursor-pointer"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Anchor New Event</span>
                  </button>
                )}
              </div>
            </div>

            <div className="space-y-3">
              {events
                .filter((e) => !searchQuery || e.title.toLowerCase().includes(searchQuery.toLowerCase()))
                .map((ev) => (
                  <div
                    key={ev.id}
                    className="celestial-card p-4 rounded-xl border border-[#1b2344] bg-[#070b1e] flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                  >
                    <div className="flex items-start gap-4">
                      <div className="px-3 py-1.5 rounded-lg border border-[#fae48f]/30 bg-[#0e142e] text-[#fae48f] font-mono text-xs font-bold shrink-0 text-center">
                        Year {ev.timestamp_year}
                      </div>

                      <div>
                        <div className="flex items-center gap-2">
                          <h4
                            onClick={() => openViewModal("events", ev)}
                            className="font-cinzel text-base font-bold text-[#faf8f2] hover:text-[#fae48f] cursor-pointer"
                          >
                            {ev.title}
                          </h4>
                          {ev.is_death_event && (
                            <span className="text-[10px] font-mono uppercase px-2 py-0.2 rounded border border-rose-500/40 bg-rose-950/60 text-rose-300">
                              Mortality Milestone
                            </span>
                          )}
                        </div>

                        <div className="flex flex-wrap items-center gap-3 mt-1 text-xs font-mono text-[#787596]">
                          {ev.location_name && <span>📍 {ev.location_name}</span>}
                          {ev.chapter_title && <span>📖 {ev.chapter_title}</span>}
                          <span>👥 {ev.participants_count || 0} Participants</span>
                          <span>🔗 {ev.dependencies_count || 0} Predecessors</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center justify-end gap-2 shrink-0">
                      <button
                        onClick={() => openViewModal("events", ev)}
                        className="px-2.5 py-1 text-xs font-mono text-[#fae48f] hover:underline"
                      >
                        Inspect
                      </button>
                      {!universe.is_example && (
                        <>
                          <button
                            onClick={() => openEditModal("events", ev)}
                            className="p-1.5 rounded text-[#7e7c9e] hover:text-white"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => openDeleteModal("events", ev)}
                            className="p-1.5 rounded text-[#7e7c9e] hover:text-rose-400"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                ))}
            </div>
          </div>
        )}

        {/* ======================================================== */}
        {/* TAB 5b: CHRONOLOGICAL STORY TIMELINE */}
        {/* ======================================================== */}
        {activeTab === "timeline" && (
          <ChronologicalTimelineView
            events={events}
            chapters={chapters}
            locations={locations}
            findings={findings}
            onOpenEvent={(eventId) => {
              const ev = events.find((e) => e.id === eventId);
              if (ev) openViewModal("events", ev);
            }}
            onOpenCreateEvent={() => openCreateModal("events")}
            isOwner={isOwner}
          />
        )}


        {/* ======================================================== */}
        {/* TAB 6: RELATIONSHIPS */}
        {/* ======================================================== */}
        {activeTab === "relationships" && (
          <div className="space-y-6 animate-fade-in">
            <div className="flex items-center justify-between pb-4 border-b border-[#1b223d]">
              <span className="text-xs font-mono tracking-wider uppercase text-[#8885a6]">
                Character Ties, Alliances &amp; Feuds
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setActiveTab("graph")}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-[#20294e] bg-[#090e24] text-xs font-mono text-[#fae48f] hover:bg-[#12193d] transition-colors cursor-pointer"
                >
                  <Share2 className="w-3.5 h-3.5" />
                  <span>Relationship Graph View</span>
                </button>
                {universe.is_example ? (
                  <button
                    onClick={handleDuplicateDemo}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-[#d4af37]/40 bg-[#0d1228] text-xs font-mono tracking-wider uppercase text-[#fae48f] hover:bg-[#151c3d] cursor-pointer"
                  >
                    <Copy className="w-3.5 h-3.5" />
                    <span>Duplicate Demo to Forge</span>
                  </button>
                ) : (
                  <button
                    onClick={() => openCreateModal("relationships")}
                    className="gold-glow-button inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-mono tracking-wider uppercase font-semibold text-[#fae48f] cursor-pointer"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Forge Relationship</span>
                  </button>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {relationships.map((rel) => (
                <div
                  key={rel.id}
                  className="celestial-card p-5 rounded-xl border border-[#1b2344] bg-[#070b1e] flex flex-col justify-between"
                >
                  <div>
                    <div className="flex items-center justify-between text-xs font-mono text-[#8a88ab] mb-2">
                      <span className="text-white font-semibold">{rel.source_character_name}</span>
                      <span className="text-[#fae48f] tracking-widest uppercase">
                        &rarr; {rel.relationship_type.replace(/_/g, " ")} &rarr;
                      </span>
                      <span className="text-white font-semibold">{rel.target_character_name}</span>
                    </div>

                    <div className="my-3">
                      <div className="flex items-center justify-between text-[11px] font-mono text-[#6c6988] mb-1">
                        <span>Causal Intensity</span>
                        <span>{rel.intensity} / 10</span>
                      </div>
                      <div className="w-full bg-[#121633] h-1.5 rounded-full overflow-hidden">
                        <div
                          className="bg-gradient-to-r from-amber-500 to-rose-500 h-full rounded-full"
                          style={{ width: `${rel.intensity * 10}%` }}
                        />
                      </div>
                    </div>

                    {rel.notes && (
                      <p className="font-cormorant text-xs text-[#9f9db8] italic mt-2">
                        &ldquo;{rel.notes}&rdquo;
                      </p>
                    )}
                  </div>

                  {!universe.is_example && (
                    <div className="flex items-center justify-end gap-2 pt-3 mt-4 border-t border-[#151c36]">
                      <button
                        onClick={() => openEditModal("relationships", rel)}
                        className="p-1.5 rounded text-[#7e7c9e] hover:text-white"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => openDeleteModal("relationships", rel)}
                        className="p-1.5 rounded text-[#7e7c9e] hover:text-rose-400"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ======================================================== */}
        {/* TAB 6b: CHARACTER RELATIONSHIP GRAPH */}
        {/* ======================================================== */}
        {activeTab === "graph" && (
          <RelationshipGraphView
            characters={characters}
            relationships={relationships}
            findings={findings}
            onOpenCharacter={(characterId) => {
              const ch = characters.find((c) => c.id === characterId);
              if (ch) openViewModal("characters", ch);
            }}
            onOpenCreateRelationship={() => openCreateModal("relationships")}
            isOwner={isOwner}
          />
        )}


        {/* ======================================================== */}
        {/* TAB 7: SECRETS */}
        {/* ======================================================== */}
        {activeTab === "secrets" && (
          <div className="space-y-6 animate-fade-in">
            <div className="flex items-center justify-between pb-4 border-b border-[#1b223d]">
              <div className="relative w-64">
                <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-[#686684]" />
                <input
                  type="text"
                  placeholder="Search lore secrets..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-8 pr-3 py-1.5 rounded-lg bg-[#080b1e] border border-[#20294e] text-xs font-mono text-[#e6e3da] placeholder-[#646280] focus:outline-none focus:border-[#fae48f]"
                />
              </div>

              {universe.is_example ? (
                <button
                  onClick={handleDuplicateDemo}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-[#d4af37]/40 bg-[#0d1228] text-xs font-mono tracking-wider uppercase text-[#fae48f] hover:bg-[#151c3d] cursor-pointer"
                >
                  <Copy className="w-3.5 h-3.5" />
                  <span>Duplicate Demo to Inscribe</span>
                </button>
              ) : (
                <button
                  onClick={() => openCreateModal("secrets")}
                  className="gold-glow-button inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-mono tracking-wider uppercase font-semibold text-[#fae48f] cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  <span>Inscribe Secret</span>
                </button>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {secrets
                .filter((s) => !searchQuery || s.title.toLowerCase().includes(searchQuery.toLowerCase()) || s.content.toLowerCase().includes(searchQuery.toLowerCase()))
                .map((sec) => (
                  <div
                    key={sec.id}
                    className="celestial-card p-5 rounded-xl border border-[#1b2344] bg-[#070b1e] flex flex-col justify-between"
                  >
                    <div>
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <h4
                          onClick={() => openViewModal("secrets", sec)}
                          className="font-cinzel text-base font-bold text-[#faf8f2] hover:text-[#fae48f] cursor-pointer"
                        >
                          {sec.title}
                        </h4>
                        <span
                          className={`text-[10px] font-mono tracking-wider uppercase px-2 py-0.5 rounded border ${
                            sec.severity === "forbidden"
                              ? "border-rose-500/50 bg-rose-950/70 text-rose-300"
                              : sec.severity === "cosmic"
                              ? "border-purple-500/50 bg-purple-950/70 text-purple-300"
                              : "border-[#d4af37]/40 bg-[#121633] text-[#fae48f]"
                          }`}
                        >
                          {sec.severity}
                        </span>
                      </div>

                      <p className="font-cormorant text-xs text-[#8c8aab] line-clamp-3 leading-relaxed mb-4">
                        {sec.content}
                      </p>
                    </div>

                    <div className="flex items-center justify-between pt-3 mt-4 border-t border-[#151c36]">
                      <span className="text-[11px] font-mono text-[#787596]">
                        Known by {sec.known_by_count || 0} characters
                      </span>

                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => openViewModal("secrets", sec)}
                          className="px-2 py-1 text-xs font-mono text-[#fae48f] hover:underline"
                        >
                          Inspect
                        </button>
                        {!universe.is_example && (
                          <>
                            <button
                              onClick={() => openEditModal("secrets", sec)}
                              className="p-1.5 rounded text-[#7e7c9e] hover:text-white"
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => openDeleteModal("secrets", sec)}
                              className="p-1.5 rounded text-[#7e7c9e] hover:text-rose-400"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
            </div>
          </div>
        )}

        {/* ======================================================== */}
        {/* TAB 8: CONTINUITY ORACLE */}
        {/* ======================================================== */}
        {activeTab === "oracle" && (
          <ContinuityOracleView
            universeId={universeId}
            isOwner={isOwner}
            findings={findings}
            onFindingsChange={(updated) => setFindings(updated)}
            onOpenEntity={(type, id, name) => {
              const typeMap: Record<string, WorkspaceTab> = {
                character: "characters",
                event: "events",
                location: "locations",
                chapter: "chapters",
                secret: "secrets",
              };
              const found =
                (type === "character" ? characters.find((c) => c.id === id) : null) ||
                (type === "event" ? events.find((e) => e.id === id) : null) ||
                (type === "location" ? locations.find((l) => l.id === id) : null) ||
                (type === "chapter" ? chapters.find((ch) => ch.id === id) : null) ||
                (type === "secret" ? secrets.find((s) => s.id === id) : null);
              const tab = typeMap[type] || "characters";
              openViewModal(tab, (found || { id, name, title: name }) as unknown as AnyEntity);
            }}
            onRefreshStats={() => setRefreshKey((k) => k + 1)}
            onSuccess={(msg) => setSuccessToast(msg)}
            onError={(msg) => setErrorBanner(msg)}
          />
        )}

      </main>

      {/* ======================================================== */}
      {/* GENERIC VIEW MODAL */}
      {/* ======================================================== */}
      {modalMode === "view" && selectedItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md overflow-y-auto">
          <div className="relative w-full max-w-2xl bg-[#080c21] border border-[#d4af37]/40 rounded-xl shadow-2xl p-6 text-[#dedbd2] max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-4 border-b border-[#1d2545] mb-4">
              <div>
                <span className="text-[10px] font-mono uppercase tracking-wider text-[#fae48f]">
                  {modalType?.slice(0, -1)} Dossier
                </span>
                <h3 className="font-cinzel text-xl font-bold text-[#faf8f2]">
                  {("name" in selectedItem ? selectedItem.name : "") || ("title" in selectedItem ? selectedItem.title : "")}
                </h3>
              </div>
              <button onClick={closeModal} className="text-[#8482a5] hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Content according to type */}
            {modalType === "characters" && (() => {
              const charItem = selectedItem as CharacterWithCounts;
              return (
                <div className="space-y-4 text-xs font-mono">
                  {charItem.epithet && (
                    <p className="font-cormorant text-base text-[#a2a0c0] italic">
                      &ldquo;{charItem.epithet}&rdquo;
                    </p>
                  )}
                  <div className="p-3 rounded-lg border border-[#1c2446] bg-[#050818] font-cormorant text-sm text-[#dedbd0] leading-relaxed">
                    {charItem.bio}
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="p-2.5 rounded border border-[#1c2446] bg-[#070b1e]">
                      <span className="text-[#6c698a] block">Status:</span>
                      <span className="text-[#fae48f] uppercase font-semibold">{charItem.status}</span>
                    </div>
                    <div className="p-2.5 rounded border border-[#1c2446] bg-[#070b1e]">
                      <span className="text-[#6c698a] block">Lifespan:</span>
                      <span>
                        {charItem.birth_year ? `Yr ${charItem.birth_year}` : "Unknown"} &rarr; {charItem.death_year ? `Yr ${charItem.death_year}` : "Present"}
                      </span>
                    </div>
                  </div>

                  {modalDetails?.events && modalDetails.events.length > 0 && (
                    <div>
                      <span className="text-[#fae48f] uppercase block mb-1.5">Timeline Participations:</span>
                      <div className="space-y-1.5">
                        {modalDetails.events.map((e) => (
                          <div key={e.id} className="p-2 rounded border border-[#1c2446] bg-[#060817] flex justify-between">
                            <span>Yr {e.timestamp_year}: {e.title}</span>
                            <span className="text-[#787596]">{e.role || "Participant"}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {modalDetails?.secrets && modalDetails.secrets.length > 0 && (
                    <div>
                      <span className="text-[#fae48f] uppercase block mb-1.5">Known Lore Secrets:</span>
                      <div className="space-y-1.5">
                        {modalDetails.secrets.map((s) => (
                          <div key={s.character_secret_id || s.id} className="p-2 rounded border border-[#1c2446] bg-[#060817] flex justify-between">
                            <span>{s.title}</span>
                            <span className="text-[#8986a8]">{s.learned_year ? `Learned Yr ${s.learned_year}` : ""}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Chapter Appearances & Mentions */}
                  <div className="pt-2 border-t border-[#182042]">
                    <span className="text-[#fae48f] uppercase block mb-1.5 font-bold">
                      Manuscript Chapter Appearances ({modalDetails?.chapter_appearances?.length || 0}):
                    </span>
                    {(!modalDetails?.chapter_appearances || modalDetails.chapter_appearances.length === 0) ? (
                      <p className="text-[11px] text-[#716e91] italic p-2.5 rounded border border-[#161d3a] bg-[#050716]">
                        No chapter manuscript detections yet. Inscribe or edit chapters mentioning this character to track appearances automatically.
                      </p>
                    ) : (
                      <div className="space-y-2.5">
                        {modalDetails.chapter_appearances.map((app: ChapterAppearanceViewItem) => (
                          <div
                            key={app.id}
                            className="p-3 rounded-lg border border-[#1d264e] bg-[#050819] hover:border-[#fae48f]/30 transition-all space-y-2"
                          >
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <div className="flex items-center gap-2">
                                <span className="font-cinzel font-bold text-sm text-[#faf8f2]">
                                  Ch {app.chapter_sequence}: {app.chapter_title}
                                </span>
                                <span
                                  className={`text-[9px] uppercase px-1.5 py-0.5 rounded font-mono border ${
                                    app.status === "confirmed"
                                      ? "border-emerald-500/40 bg-emerald-950/40 text-emerald-300"
                                      : app.status === "needs_review"
                                      ? "border-amber-500/40 bg-amber-950/40 text-amber-300"
                                      : "border-sky-500/40 bg-sky-950/40 text-sky-300"
                                  }`}
                                >
                                  {app.status}
                                </span>
                                <span
                                  className={`text-[9px] uppercase px-1.5 py-0.5 rounded font-mono border ${
                                    app.relationship_type === "appears"
                                      ? "border-purple-500/40 bg-purple-950/40 text-purple-300"
                                      : "border-indigo-500/40 bg-indigo-950/40 text-indigo-300"
                                  }`}
                                >
                                  {app.relationship_type === "appears" ? "Scene Appearance" : "Simple Mention"}
                                </span>
                              </div>

                              {/* Author Correction Actions */}
                              {!universe?.is_example && (
                                <div className="flex items-center gap-1.5">
                                  {app.status !== "confirmed" && (
                                    <button
                                      type="button"
                                      onClick={() => handleUpdateEntityLink(app.id, app.chapter_id, { status: "confirmed" })}
                                      className="px-2 py-0.5 rounded text-[10px] bg-emerald-900/40 text-emerald-300 border border-emerald-600/30 hover:bg-emerald-800/40 cursor-pointer"
                                    >
                                      ✓ Confirm
                                    </button>
                                  )}
                                  <button
                                    type="button"
                                    onClick={() =>
                                      handleUpdateEntityLink(app.id, app.chapter_id, {
                                        relationship_type: app.relationship_type === "appears" ? "mentioned" : "appears",
                                      })
                                    }
                                    className="px-2 py-0.5 rounded text-[10px] bg-[#111738] text-[#fae48f] border border-[#26315e] hover:bg-[#1a2352] cursor-pointer"
                                  >
                                    {app.relationship_type === "appears" ? "Mark Mention" : "Mark Appears"}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleUpdateEntityLink(app.id, app.chapter_id, { status: "dismissed" })}
                                    className="px-1.5 py-0.5 rounded text-[10px] text-rose-400 hover:bg-rose-950/40 cursor-pointer"
                                    title="Dismiss Link"
                                  >
                                    ✕
                                  </button>
                                </div>
                              )}
                            </div>

                            {app.passage && (
                              <blockquote className="font-cormorant text-xs italic text-[#b5b2cf] pl-2.5 border-l-2 border-[#fae48f]/40 leading-relaxed">
                                &ldquo;{app.passage}&rdquo;
                              </blockquote>
                            )}

                            {/* Associated locations & events in this chapter */}
                            <div className="flex flex-wrap items-center gap-3 text-[10px] text-[#787596] pt-1 border-t border-[#141b38]">
                              {app.associated_locations && app.associated_locations.length > 0 && (
                                <div className="flex items-center gap-1">
                                  <span>📍 Setting:</span>
                                  <span className="text-[#dedbd0]">
                                    {app.associated_locations.map((l) => l.entity_name || l.name).join(", ")}
                                  </span>
                                </div>
                              )}
                              {app.associated_events && app.associated_events.length > 0 && (
                                <div className="flex items-center gap-1">
                                  <span>⚔️ Events:</span>
                                  <span className="text-[#dedbd0]">
                                    {app.associated_events.map((e) => e.title).join(", ")}
                                  </span>
                                </div>
                              )}
                              {app.matched_alias && (
                                <span className="text-[#8885a5]">
                                  Matched: &ldquo;{app.matched_alias}&rdquo;
                                </span>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              );
            })()}

            {modalType === "locations" && (
              <div className="space-y-4 text-xs font-mono">
                {"realm" in selectedItem && (
                  <span className="px-2 py-0.5 rounded border border-sky-500/40 bg-sky-950/40 text-sky-300">
                    Realm: {selectedItem.realm}
                  </span>
                )}
                {"description" in selectedItem && selectedItem.description && (
                  <p className="font-cormorant text-sm text-[#dedbd0] p-3 rounded-lg border border-[#1c2446] bg-[#050818]">
                    {selectedItem.description}
                  </p>
                )}
                {modalDetails?.events && modalDetails.events.length > 0 && (
                  <div>
                    <span className="text-[#fae48f] uppercase block mb-1.5">Events at this Location:</span>
                    <div className="space-y-1.5">
                      {modalDetails.events.map((e) => (
                        <div key={e.id} className="p-2 rounded border border-[#1c2446] bg-[#060817] flex justify-between">
                          <span>Year {e.timestamp_year}: {e.title}</span>
                          <span className="text-[#787596]">{e.participants_count || 0} participants</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Chapter Scenes & Mentions */}
                <div className="pt-2 border-t border-[#182042]">
                  <span className="text-[#fae48f] uppercase block mb-1.5 font-bold">
                    Chapter Scenes & Mentions ({modalDetails?.chapter_appearances?.length || 0}):
                  </span>
                  {(!modalDetails?.chapter_appearances || modalDetails.chapter_appearances.length === 0) ? (
                    <p className="text-[11px] text-[#716e91] italic p-2.5 rounded border border-[#161d3a] bg-[#050716]">
                      No chapter scenes recorded for this location yet.
                    </p>
                  ) : (
                    <div className="space-y-2.5">
                      {modalDetails.chapter_appearances.map((app: ChapterAppearanceViewItem) => (
                        <div
                          key={app.id}
                          className="p-3 rounded-lg border border-[#1d264e] bg-[#050819] hover:border-[#fae48f]/30 transition-all space-y-2"
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="flex items-center gap-2">
                              <span className="font-cinzel font-bold text-sm text-[#faf8f2]">
                                Ch {app.chapter_sequence}: {app.chapter_title}
                              </span>
                              <span
                                className={`text-[9px] uppercase px-1.5 py-0.5 rounded font-mono border ${
                                  app.status === "confirmed"
                                    ? "border-emerald-500/40 bg-emerald-950/40 text-emerald-300"
                                    : app.status === "needs_review"
                                    ? "border-amber-500/40 bg-amber-950/40 text-amber-300"
                                    : "border-sky-500/40 bg-sky-950/40 text-sky-300"
                                }`}
                              >
                                {app.status}
                              </span>
                              <span
                                className={`text-[9px] uppercase px-1.5 py-0.5 rounded font-mono border ${
                                  app.relationship_type === "setting"
                                    ? "border-amber-500/40 bg-amber-950/40 text-amber-300"
                                    : "border-indigo-500/40 bg-indigo-950/40 text-indigo-300"
                                }`}
                              >
                                {app.relationship_type === "setting" ? "Scene Setting" : "Simple Mention"}
                              </span>
                            </div>

                            {!universe?.is_example && (
                              <div className="flex items-center gap-1.5">
                                {app.status !== "confirmed" && (
                                  <button
                                    type="button"
                                    onClick={() => handleUpdateEntityLink(app.id, app.chapter_id, { status: "confirmed" })}
                                    className="px-2 py-0.5 rounded text-[10px] bg-emerald-900/40 text-emerald-300 border border-emerald-600/30 hover:bg-emerald-800/40 cursor-pointer"
                                  >
                                    ✓ Confirm
                                  </button>
                                )}
                                <button
                                  type="button"
                                  onClick={() =>
                                    handleUpdateEntityLink(app.id, app.chapter_id, {
                                      relationship_type: app.relationship_type === "setting" ? "mentioned" : "setting",
                                    })
                                  }
                                  className="px-2 py-0.5 rounded text-[10px] bg-[#111738] text-[#fae48f] border border-[#26315e] hover:bg-[#1a2352] cursor-pointer"
                                >
                                  {app.relationship_type === "setting" ? "Mark Mention" : "Mark Setting"}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleUpdateEntityLink(app.id, app.chapter_id, { status: "dismissed" })}
                                  className="px-1.5 py-0.5 rounded text-[10px] text-rose-400 hover:bg-rose-950/40 cursor-pointer"
                                  title="Dismiss Link"
                                >
                                  ✕
                                </button>
                              </div>
                            )}
                          </div>

                          {app.passage && (
                            <blockquote className="font-cormorant text-xs italic text-[#b5b2cf] pl-2.5 border-l-2 border-[#fae48f]/40 leading-relaxed">
                              &ldquo;{app.passage}&rdquo;
                            </blockquote>
                          )}

                          <div className="flex flex-wrap items-center gap-3 text-[10px] text-[#787596] pt-1 border-t border-[#141b38]">
                            {app.associated_characters && app.associated_characters.length > 0 && (
                              <div className="flex items-center gap-1">
                                <span>👥 Present Characters:</span>
                                <span className="text-[#dedbd0]">
                                  {app.associated_characters.map((c) => c.entity_name || c.name).join(", ")}
                                </span>
                              </div>
                            )}
                            {app.associated_events && app.associated_events.length > 0 && (
                              <div className="flex items-center gap-1">
                                <span>⚔️ Events:</span>
                                <span className="text-[#dedbd0]">
                                  {app.associated_events.map((e) => e.title).join(", ")}
                                </span>
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {modalType === "events" && (
              <div className="space-y-4 text-xs font-mono">
                <div className="flex items-center gap-3">
                  {"timestamp_year" in selectedItem && (
                    <span className="text-[#fae48f] font-bold text-sm">Year {selectedItem.timestamp_year}</span>
                  )}
                  {"location_name" in selectedItem && selectedItem.location_name && (
                    <span>📍 {selectedItem.location_name}</span>
                  )}
                  {"chapter_title" in selectedItem && selectedItem.chapter_title && (
                    <span>📖 {selectedItem.chapter_title}</span>
                  )}
                </div>
                {"description" in selectedItem && selectedItem.description && (
                  <p className="font-cormorant text-sm text-[#dedbd0] p-3 rounded-lg border border-[#1c2446] bg-[#050818]">
                    {selectedItem.description}
                  </p>
                )}
                {modalDetails?.event?.participants && modalDetails.event.participants.length > 0 && (
                  <div>
                    <span className="text-[#fae48f] uppercase block mb-1">Participants:</span>
                    <div className="flex flex-wrap gap-2">
                      {modalDetails.event.participants.map((p) => (
                        <span key={p.id} className="px-2.5 py-1 rounded border border-[#20284e] bg-[#0a0e24]">
                          {p.character_name} {p.role ? `(${p.role})` : ""}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                {modalDetails?.event?.dependencies && modalDetails.event.dependencies.length > 0 && (
                  <div>
                    <span className="text-[#fae48f] uppercase block mb-1">Predecessor Dependencies:</span>
                    <div className="space-y-1">
                      {modalDetails.event.dependencies.map((d) => (
                        <div key={d.id} className="p-2 rounded border border-[#20284e] bg-[#0a0e24]">
                          &larr; Requires: {d.predecessor_title} {d.predecessor_year ? `(Year ${d.predecessor_year})` : ""}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Chapter References & Evidence */}
                {modalDetails?.event?.chapter_links && modalDetails.event.chapter_links.length > 0 && (
                  <div className="pt-2 border-t border-[#182042]">
                    <span className="text-[#fae48f] uppercase block mb-1 font-bold">Linked Chapters & Evidence:</span>
                    <div className="space-y-1.5">
                      {modalDetails.event.chapter_links.map((cl: ChapterAppearanceViewItem) => (
                        <div key={cl.id} className="p-2.5 rounded border border-[#20284e] bg-[#0a0e24] space-y-1">
                          <div className="flex justify-between items-center text-xs">
                            <span className="font-bold text-[#faf8f2]">Ch {cl.chapter_sequence}: {cl.chapter_title}</span>
                            <span className="text-[10px] text-[#fae48f] uppercase px-1.5 py-0.5 rounded border border-[#fae48f]/30">
                              {cl.relationship_type}
                            </span>
                          </div>
                          {cl.passage && (
                            <p className="font-cormorant italic text-[#8c8aab] text-xs pl-2 border-l border-[#fae48f]/40">
                              &ldquo;{cl.passage}&rdquo;
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {modalType === "secrets" && (
              <div className="space-y-4 text-xs font-mono">
                {"severity" in selectedItem && (
                  <span className="text-[#fae48f] uppercase px-2 py-0.5 rounded border border-[#d4af37]/30 bg-[#0e122b]">
                    Classification: {selectedItem.severity}
                  </span>
                )}
                {"content" in selectedItem && (
                  <p className="font-cormorant text-sm text-[#dedbd0] p-3 rounded-lg border border-[#1c2446] bg-[#050818]">
                    {selectedItem.content}
                  </p>
                )}
                
                {/* Scribes & Characters with Knowledge */}
                <div>
                  <span className="text-[#fae48f] uppercase block mb-1.5 font-semibold">
                    Scribes &amp; Characters with Knowledge ({modalDetails?.secret?.known_by?.length || 0}):
                  </span>
                  {modalDetails?.secret?.known_by && modalDetails.secret.known_by.length > 0 ? (
                    <div className="space-y-1.5 mb-3">
                      {modalDetails.secret.known_by.map((kb) => (
                        <div key={kb.record_id || kb.character_id} className="p-2.5 rounded border border-[#20284e] bg-[#0a0e24] flex items-center justify-between">
                          <div>
                            <span className="text-[#faf8f2] font-semibold">{kb.character_name}</span>
                            {kb.learned_year && (
                              <span className="text-[#8482a5] ml-2 text-[11px] font-mono">(Learned Yr {kb.learned_year})</span>
                            )}
                          </div>
                          <button
                            type="button"
                            onClick={() => handleRevokeSecretKnowledge(selectedItem.id, kb.character_id)}
                            className="text-rose-400 hover:text-rose-300 px-2 py-0.5 rounded text-[10px] uppercase font-mono border border-rose-500/20 hover:bg-rose-950/30"
                            title="Revoke knowledge"
                          >
                            Revoke
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-[#787596] italic mb-3">No characters currently hold recorded knowledge of this secret.</p>
                  )}

                  {/* Grant Knowledge input row */}
                  <div className="p-3 rounded-lg border border-[#232b50] bg-[#070b1e] space-y-2">
                    <span className="text-[11px] font-mono text-[#fae48f] uppercase block">
                      + Grant Secret Knowledge to Character
                    </span>
                    <div className="flex flex-wrap items-center gap-2">
                      <select
                        id="grant-knowledge-char-select"
                        className="px-2.5 py-1.5 rounded bg-[#040612] border border-[#232b50] text-xs text-[#faf8f2] flex-1 min-w-[140px]"
                        defaultValue=""
                      >
                        <option value="">Select Character...</option>
                        {characters
                          .filter((c) => !modalDetails?.secret?.known_by?.some((kb) => kb.character_id === c.id))
                          .map((c) => (
                            <option key={c.id} value={c.id}>{c.name}</option>
                          ))}
                      </select>
                      <input
                        id="grant-knowledge-year-input"
                        type="number"
                        placeholder="Year (e.g. 320)"
                        className="w-28 px-2.5 py-1.5 rounded bg-[#040612] border border-[#232b50] text-xs text-[#faf8f2]"
                      />
                      <button
                        type="button"
                        onClick={handleGrantSecretKnowledge}
                        className="gold-glow-button px-3 py-1.5 rounded text-xs font-mono uppercase text-[#fae48f]"
                      >
                        Grant
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            <div className="flex justify-end pt-4 mt-6 border-t border-[#1d2545]">
              <button onClick={closeModal} className="gold-glow-button px-4 py-2 rounded-lg text-xs font-mono uppercase text-[#fae48f]">
                Close Dossier
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* CREATE & EDIT MODAL */}
      {/* ======================================================== */}
      {(modalMode === "create" || modalMode === "edit") && modalType && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md overflow-y-auto">
          <div className="relative w-full max-w-xl bg-[#080c21] border border-[#d4af37]/40 rounded-xl shadow-2xl p-6 text-[#dedbd2] max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-4 border-b border-[#1d2545] mb-4">
              <h3 className="font-cinzel text-lg font-bold text-[#faf8f2]">
                {modalMode === "create" ? `Inscribe New ${modalType.slice(0, -1)}` : `Recalibrate ${modalType.slice(0, -1)}`}
              </h3>
              <button onClick={closeModal} className="text-[#8482a5] hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleFormSubmit} className="space-y-4">
              {formErrors.submit && (
                <div className="p-3 rounded-lg border border-rose-500/30 bg-rose-950/20 text-xs font-mono text-rose-300">
                  {formErrors.submit}
                </div>
              )}

              {/* CHARACTERS FORM */}
              {modalType === "characters" && (
                <>
                  <div>
                    <label className="block text-xs font-mono uppercase text-[#a7a5c4] mb-1">Name *</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Grand Archivist Vaelen"
                      value={val("name")}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      className="w-full px-3.5 py-2 rounded-lg bg-[#040612] border border-[#232b50] text-sm text-[#faf8f2] focus:outline-none focus:border-[#fae48f]"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-mono uppercase text-[#a7a5c4] mb-1">Epithet / Title</label>
                    <input
                      type="text"
                      placeholder="e.g. Keeper of the Obsidian Needle"
                      value={val("epithet")}
                      onChange={(e) => setFormData({ ...formData, epithet: e.target.value })}
                      className="w-full px-3.5 py-2 rounded-lg bg-[#040612] border border-[#232b50] text-sm text-[#faf8f2] focus:outline-none focus:border-[#fae48f]"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-mono uppercase text-[#a7a5c4] mb-1">Aliases / Known Titles (comma-separated)</label>
                    <input
                      type="text"
                      placeholder="e.g. Vaelen, The Scribe, Chronicler of the Deep"
                      value={val("aliases")}
                      onChange={(e) => setFormData({ ...formData, aliases: e.target.value })}
                      className="w-full px-3.5 py-2 rounded-lg bg-[#040612] border border-[#232b50] text-sm text-[#faf8f2] focus:outline-none focus:border-[#fae48f]"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-mono uppercase text-[#a7a5c4] mb-1">Biography / Lore *</label>
                    <textarea
                      rows={3}
                      required
                      value={val("bio")}
                      onChange={(e) => setFormData({ ...formData, bio: e.target.value })}
                      className="w-full px-3.5 py-2 rounded-lg bg-[#040612] border border-[#232b50] text-sm text-[#faf8f2] focus:outline-none focus:border-[#fae48f]"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-mono uppercase text-[#a7a5c4] mb-1">Birth Year</label>
                      <input
                        type="number"
                        placeholder="e.g. 280"
                        value={val("birth_year")}
                        onChange={(e) => setFormData({ ...formData, birth_year: e.target.value })}
                        className="w-full px-3.5 py-2 rounded-lg bg-[#040612] border border-[#232b50] text-sm text-[#faf8f2] focus:outline-none focus:border-[#fae48f]"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-mono uppercase text-[#a7a5c4] mb-1">Death Year</label>
                      <input
                        type="number"
                        placeholder="e.g. 350"
                        value={val("death_year")}
                        onChange={(e) => setFormData({ ...formData, death_year: e.target.value })}
                        className="w-full px-3.5 py-2 rounded-lg bg-[#040612] border border-[#232b50] text-sm text-[#faf8f2] focus:outline-none focus:border-[#fae48f]"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-mono uppercase text-[#a7a5c4] mb-1">Status</label>
                      <select
                        value={val("status") || "alive"}
                        onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                        className="w-full px-3.5 py-2 rounded-lg bg-[#040612] border border-[#232b50] text-sm text-[#faf8f2] focus:outline-none focus:border-[#fae48f]"
                      >
                        <option value="alive">Alive</option>
                        <option value="deceased">Deceased</option>
                        <option value="ascended">Ascended</option>
                        <option value="displaced">Displaced</option>
                        <option value="unknown">Unknown</option>
                      </select>
                    </div>
                    <div className="flex items-center gap-2 pt-6">
                      <input
                        type="checkbox"
                        id="death_confirmed"
                        checked={Boolean(formData.death_confirmed)}
                        onChange={(e) => setFormData({ ...formData, death_confirmed: e.target.checked })}
                        className="w-4 h-4 rounded bg-[#040612] border-[#232b50] text-[#fae48f]"
                      />
                      <label htmlFor="death_confirmed" className="text-xs font-mono text-[#a7a5c4]">
                        Death Confirmed
                      </label>
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-mono uppercase text-[#a7a5c4] mb-1">
                      Narrative / Post-Mortem Exception Notes
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. Bound as astral projection to Astrolabe; active as wraith"
                      value={val("death_exception_notes")}
                      onChange={(e) => setFormData({ ...formData, death_exception_notes: e.target.value })}
                      className="w-full px-3.5 py-2 rounded-lg bg-[#040612] border border-[#232b50] text-sm text-[#faf8f2] focus:outline-none focus:border-[#fae48f]"
                    />
                  </div>
                </>
              )}

              {/* LOCATIONS FORM */}
              {modalType === "locations" && (
                <>
                  <div>
                    <label className="block text-xs font-mono uppercase text-[#a7a5c4] mb-1">Name *</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. The Sunken Citadel of Astris"
                      value={val("name")}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      className="w-full px-3.5 py-2 rounded-lg bg-[#040612] border border-[#232b50] text-sm text-[#faf8f2] focus:outline-none focus:border-[#fae48f]"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-mono uppercase text-[#a7a5c4] mb-1">Aliases / Secondary Names (comma-separated)</label>
                    <input
                      type="text"
                      placeholder="e.g. Astris, The Sunken Spire, City of Tears"
                      value={val("aliases")}
                      onChange={(e) => setFormData({ ...formData, aliases: e.target.value })}
                      className="w-full px-3.5 py-2 rounded-lg bg-[#040612] border border-[#232b50] text-sm text-[#faf8f2] focus:outline-none focus:border-[#fae48f]"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-mono uppercase text-[#a7a5c4] mb-1">Realm / Astral Plane *</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Celestial Firmament"
                      value={val("realm")}
                      onChange={(e) => setFormData({ ...formData, realm: e.target.value })}
                      className="w-full px-3.5 py-2 rounded-lg bg-[#040612] border border-[#232b50] text-sm text-[#faf8f2] focus:outline-none focus:border-[#fae48f]"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-mono uppercase text-[#a7a5c4] mb-1">Description *</label>
                    <textarea
                      rows={3}
                      required
                      value={val("description")}
                      onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                      className="w-full px-3.5 py-2 rounded-lg bg-[#040612] border border-[#232b50] text-sm text-[#faf8f2] focus:outline-none focus:border-[#fae48f]"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-mono uppercase text-[#a7a5c4] mb-1">Coordinate X</label>
                      <input
                        type="number"
                        value={val("coordinates_x")}
                        onChange={(e) => setFormData({ ...formData, coordinates_x: e.target.value })}
                        className="w-full px-3.5 py-2 rounded-lg bg-[#040612] border border-[#232b50] text-sm text-[#faf8f2] focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-mono uppercase text-[#a7a5c4] mb-1">Coordinate Y</label>
                      <input
                        type="number"
                        value={val("coordinates_y")}
                        onChange={(e) => setFormData({ ...formData, coordinates_y: e.target.value })}
                        className="w-full px-3.5 py-2 rounded-lg bg-[#040612] border border-[#232b50] text-sm text-[#faf8f2] focus:outline-none"
                      />
                    </div>
                  </div>
                </>
              )}

              {/* CHAPTERS FORM */}
              {modalType === "chapters" && (
                <>
                  <div>
                    <label className="block text-xs font-mono uppercase text-[#a7a5c4] mb-1">Chapter Title *</label>
                    <input
                      type="text"
                      required
                      value={val("title")}
                      onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                      className="w-full px-3.5 py-2 rounded-lg bg-[#040612] border border-[#232b50] text-sm text-[#faf8f2] focus:outline-none focus:border-[#fae48f]"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-mono uppercase text-[#a7a5c4] mb-1">Sequence Number *</label>
                    <input
                      type="number"
                      required
                      min={0}
                      value={val("sequence_number") || 1}
                      onChange={(e) => setFormData({ ...formData, sequence_number: e.target.value })}
                      className="w-full px-3.5 py-2 rounded-lg bg-[#040612] border border-[#232b50] text-sm text-[#faf8f2] focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-mono uppercase text-[#a7a5c4] mb-1">Summary *</label>
                    <textarea
                      rows={3}
                      required
                      value={val("summary")}
                      onChange={(e) => setFormData({ ...formData, summary: e.target.value })}
                      className="w-full px-3.5 py-2 rounded-lg bg-[#040612] border border-[#232b50] text-sm text-[#faf8f2] focus:outline-none"
                    />
                  </div>
                </>
              )}

              {/* EVENTS FORM */}
              {modalType === "events" && (
                <>
                  <div>
                    <label className="block text-xs font-mono uppercase text-[#a7a5c4] mb-1">Event Title *</label>
                    <input
                      type="text"
                      required
                      value={val("title")}
                      onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                      className="w-full px-3.5 py-2 rounded-lg bg-[#040612] border border-[#232b50] text-sm text-[#faf8f2] focus:outline-none focus:border-[#fae48f]"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-mono uppercase text-[#a7a5c4] mb-1">Timestamp Year *</label>
                      <input
                        type="number"
                        required
                        value={val("timestamp_year") || 300}
                        onChange={(e) => setFormData({ ...formData, timestamp_year: e.target.value })}
                        className="w-full px-3.5 py-2 rounded-lg bg-[#040612] border border-[#232b50] text-sm text-[#faf8f2] focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-mono uppercase text-[#a7a5c4] mb-1">Sequence Number</label>
                      <input
                        type="number"
                        value={val("sequence_number") || 1}
                        onChange={(e) => setFormData({ ...formData, sequence_number: e.target.value })}
                        className="w-full px-3.5 py-2 rounded-lg bg-[#040612] border border-[#232b50] text-sm text-[#faf8f2] focus:outline-none"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-mono uppercase text-[#a7a5c4] mb-1">Location</label>
                      <select
                        value={val("location_id")}
                        onChange={(e) => setFormData({ ...formData, location_id: e.target.value || null })}
                        className="w-full px-3 py-2 rounded-lg bg-[#040612] border border-[#232b50] text-xs text-[#faf8f2] focus:outline-none"
                      >
                        <option value="">No Location</option>
                        {locations.map((l) => (
                          <option key={l.id} value={l.id}>{l.name}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-mono uppercase text-[#a7a5c4] mb-1">Chapter</label>
                      <select
                        value={val("chapter_id")}
                        onChange={(e) => setFormData({ ...formData, chapter_id: e.target.value || null })}
                        className="w-full px-3 py-2 rounded-lg bg-[#040612] border border-[#232b50] text-xs text-[#faf8f2] focus:outline-none"
                      >
                        <option value="">No Chapter</option>
                        {chapters.map((ch) => (
                          <option key={ch.id} value={ch.id}>#{ch.sequence_number}: {ch.title}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-mono uppercase text-[#a7a5c4] mb-1">Description</label>
                    <textarea
                      rows={2}
                      value={val("description")}
                      onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                      className="w-full px-3.5 py-2 rounded-lg bg-[#040612] border border-[#232b50] text-sm text-[#faf8f2] focus:outline-none"
                    />
                  </div>

                  <div className="flex items-center gap-2 pt-1 pb-1">
                    <input
                      type="checkbox"
                      id="event_is_death_event"
                      checked={Boolean(formData.is_death_event)}
                      onChange={(e) => setFormData({ ...formData, is_death_event: e.target.checked })}
                      className="w-4 h-4 rounded bg-[#040612] border-[#232b50] text-[#fae48f]"
                    />
                    <label htmlFor="event_is_death_event" className="text-xs font-mono text-[#a7a5c4] cursor-pointer">
                      Mortality Milestone (Character casualty or fatal climax occurred in this event)
                    </label>
                  </div>

                  {/* Event Participants Manager */}
                  <div className="pt-2 border-t border-[#1d2545]/60 space-y-2">
                    {(() => {
                      const currentParts = (Array.isArray(formData.participants) ? formData.participants : []) as FormParticipantItem[];
                      return (
                        <>
                          <label className="text-xs font-mono uppercase text-[#fae48f] block font-semibold">
                            Event Participants ({currentParts.length})
                          </label>

                          {currentParts.length > 0 && (
                            <div className="space-y-1.5 max-h-36 overflow-y-auto">
                              {currentParts.map((p) => {
                                const charName = p.character_name || characters.find((c) => c.id === p.character_id)?.name || p.character_id;
                                return (
                                  <div key={p.character_id} className="p-2 rounded bg-[#0a0e24] border border-[#20284e] flex items-center justify-between text-xs">
                                    <div className="flex items-center gap-2">
                                      <span className="text-[#faf8f2] font-semibold">{charName}</span>
                                      <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-[#172147] text-[#fae48f]">
                                        {p.role || "Participant"}
                                      </span>
                                    </div>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setFormData({
                                          ...formData,
                                          participants: currentParts.filter((item) => item.character_id !== p.character_id),
                                        });
                                      }}
                                      className="text-rose-400 hover:text-rose-300 text-xs px-1.5"
                                      title="Remove participant"
                                    >
                                      &times;
                                    </button>
                                  </div>
                                );
                              })}
                            </div>
                          )}

                          <div className="flex items-center gap-2">
                            <select
                              id="new-participant-select"
                              className="flex-1 px-3 py-1.5 rounded-lg bg-[#040612] border border-[#232b50] text-xs text-[#faf8f2]"
                              defaultValue=""
                            >
                              <option value="">Select Character...</option>
                              {characters
                                .filter((c) => !currentParts.some((p) => p.character_id === c.id))
                                .map((c) => (
                                  <option key={c.id} value={c.id}>{c.name}</option>
                                ))}
                            </select>
                            <input
                              id="new-participant-role"
                              type="text"
                              placeholder="Role (e.g. Witness)"
                              className="w-36 px-3 py-1.5 rounded-lg bg-[#040612] border border-[#232b50] text-xs text-[#faf8f2]"
                            />
                            <button
                              type="button"
                              onClick={() => {
                                const selectEl = document.getElementById("new-participant-select") as HTMLSelectElement | null;
                                const roleEl = document.getElementById("new-participant-role") as HTMLInputElement | null;
                                const charId = selectEl?.value;
                                if (!charId) return;
                                const char = characters.find((c) => c.id === charId);
                                const role = roleEl?.value.trim() || "Participant";
                                setFormData({
                                  ...formData,
                                  participants: [...currentParts, { character_id: charId, character_name: char?.name, role }],
                                });
                                if (selectEl) selectEl.value = "";
                                if (roleEl) roleEl.value = "";
                              }}
                              className="gold-glow-button px-3 py-1.5 rounded text-xs font-mono uppercase text-[#fae48f]"
                            >
                              + Add
                            </button>
                          </div>
                        </>
                      );
                    })()}
                  </div>

                  {/* Predecessor Dependencies Manager */}
                  <div className="pt-2 border-t border-[#1d2545]/60 space-y-2">
                    {(() => {
                      const currentDeps = (Array.isArray(formData.dependencies) ? formData.dependencies : []) as FormDependencyItem[];
                      return (
                        <>
                          <label className="text-xs font-mono uppercase text-[#fae48f] block font-semibold">
                            Predecessor Event Dependencies ({currentDeps.length})
                          </label>

                          {currentDeps.length > 0 && (
                            <div className="space-y-1.5 max-h-36 overflow-y-auto">
                              {currentDeps.map((d) => {
                                const evTitle = d.predecessor_title || events.find((e) => e.id === d.predecessor_event_id)?.title || d.predecessor_event_id;
                                return (
                                  <div key={d.predecessor_event_id} className="p-2 rounded bg-[#0a0e24] border border-[#20284e] flex items-center justify-between text-xs">
                                    <span className="text-[#faf8f2]">&larr; Requires: {evTitle}</span>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setFormData({
                                          ...formData,
                                          dependencies: currentDeps.filter((item) => item.predecessor_event_id !== d.predecessor_event_id),
                                        });
                                      }}
                                      className="text-rose-400 hover:text-rose-300 text-xs px-1.5"
                                      title="Remove dependency"
                                    >
                                      &times;
                                    </button>
                                  </div>
                                );
                              })}
                            </div>
                          )}

                          <div className="flex items-center gap-2">
                            <select
                              id="new-dependency-select"
                              className="flex-1 px-3 py-1.5 rounded-lg bg-[#040612] border border-[#232b50] text-xs text-[#faf8f2]"
                              defaultValue=""
                            >
                              <option value="">Select Predecessor Event...</option>
                              {events
                                .filter((e) => e.id !== selectedItem?.id && !currentDeps.some((d) => d.predecessor_event_id === e.id))
                                .map((e) => (
                                  <option key={e.id} value={e.id}>{e.title} (Yr {e.timestamp_year})</option>
                                ))}
                            </select>
                            <button
                              type="button"
                              onClick={() => {
                                const selectEl = document.getElementById("new-dependency-select") as HTMLSelectElement | null;
                                const predId = selectEl?.value;
                                if (!predId) return;
                                const pred = events.find((e) => e.id === predId);
                                setFormData({
                                  ...formData,
                                  dependencies: [
                                    ...currentDeps,
                                    { predecessor_event_id: predId, predecessor_title: pred?.title, dependency_type: "requires_predecessor" },
                                  ],
                                });
                                if (selectEl) selectEl.value = "";
                              }}
                              className="gold-glow-button px-3 py-1.5 rounded text-xs font-mono uppercase text-[#fae48f]"
                            >
                              + Add Dependency
                            </button>
                          </div>
                        </>
                      );
                    })()}
                  </div>
                </>
              )}

              {/* RELATIONSHIPS FORM */}
              {modalType === "relationships" && (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-mono uppercase text-[#a7a5c4] mb-1">Source Character *</label>
                      <select
                        value={val("source_character_id")}
                        onChange={(e) => setFormData({ ...formData, source_character_id: e.target.value })}
                        className="w-full px-3 py-2 rounded-lg bg-[#040612] border border-[#232b50] text-xs text-[#faf8f2] focus:outline-none"
                      >
                        {characters.map((c) => (
                          <option key={c.id} value={c.id}>{c.name}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-mono uppercase text-[#a7a5c4] mb-1">Target Character *</label>
                      <select
                        value={val("target_character_id")}
                        onChange={(e) => setFormData({ ...formData, target_character_id: e.target.value })}
                        className="w-full px-3 py-2 rounded-lg bg-[#040612] border border-[#232b50] text-xs text-[#faf8f2] focus:outline-none"
                      >
                        {characters.map((c) => (
                          <option key={c.id} value={c.id}>{c.name}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-mono uppercase text-[#a7a5c4] mb-1">Relationship Type *</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. apprenticed_to, rival_of, sworn_enemy_of, allied_with"
                      value={val("relationship_type")}
                      onChange={(e) => setFormData({ ...formData, relationship_type: e.target.value })}
                      className="w-full px-3.5 py-2 rounded-lg bg-[#040612] border border-[#232b50] text-sm text-[#faf8f2] focus:outline-none focus:border-[#fae48f]"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-mono uppercase text-[#a7a5c4] mb-1">Intensity (1-10): {val("intensity") || 5}</label>
                    <input
                      type="range"
                      min={1}
                      max={10}
                      value={val("intensity") || 5}
                      onChange={(e) => setFormData({ ...formData, intensity: Number(e.target.value) })}
                      className="w-full"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-mono uppercase text-[#a7a5c4] mb-1">Notes</label>
                    <textarea
                      rows={2}
                      value={val("notes")}
                      onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                      className="w-full px-3.5 py-2 rounded-lg bg-[#040612] border border-[#232b50] text-sm text-[#faf8f2] focus:outline-none"
                    />
                  </div>
                </>
              )}

              {/* SECRETS FORM */}
              {modalType === "secrets" && (
                <>
                  <div>
                    <label className="block text-xs font-mono uppercase text-[#a7a5c4] mb-1">Secret Title *</label>
                    <input
                      type="text"
                      required
                      value={val("title")}
                      onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                      className="w-full px-3.5 py-2 rounded-lg bg-[#040612] border border-[#232b50] text-sm text-[#faf8f2] focus:outline-none focus:border-[#fae48f]"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-mono uppercase text-[#a7a5c4] mb-1">Classification Severity *</label>
                    <select
                      value={val("severity") || "major"}
                      onChange={(e) => setFormData({ ...formData, severity: e.target.value })}
                      className="w-full px-3.5 py-2 rounded-lg bg-[#040612] border border-[#232b50] text-sm text-[#faf8f2] focus:outline-none"
                    >
                      <option value="minor">Minor Intrigue</option>
                      <option value="major">Major Arcane Secret</option>
                      <option value="cosmic">Cosmic Revelation</option>
                      <option value="forbidden">Forbidden Axiom</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-mono uppercase text-[#a7a5c4] mb-1">Content / Lore *</label>
                    <textarea
                      rows={3}
                      required
                      value={val("content")}
                      onChange={(e) => setFormData({ ...formData, content: e.target.value })}
                      className="w-full px-3.5 py-2 rounded-lg bg-[#040612] border border-[#232b50] text-sm text-[#faf8f2] focus:outline-none focus:border-[#fae48f]"
                    />
                  </div>
                </>
              )}

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-[#1d2545]">
                <button
                  type="button"
                  onClick={closeModal}
                  className="px-4 py-2 text-xs font-mono uppercase text-[#8b89ad] hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="gold-glow-button px-5 py-2 rounded-lg text-xs font-mono tracking-widest uppercase font-semibold text-[#fae48f]"
                >
                  {isSubmitting ? "Preserving..." : modalMode === "create" ? "Inscribe Record" : "Save Modifications"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* DELETE CONFIRMATION MODAL */}
      {/* ======================================================== */}
      {modalMode === "delete" && selectedItem && modalType && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
          <div className="relative w-full max-w-md bg-[#090c21] border border-rose-500/40 rounded-xl shadow-2xl p-6 text-[#dedbd2]">
            <div className="flex items-center gap-2 text-rose-400 mb-3">
              <AlertTriangle className="w-5 h-5" />
              <h3 className="font-cinzel text-lg font-bold text-[#faf8f2]">
                Dissolve {modalType.slice(0, -1)}?
              </h3>
            </div>
            <p className="font-cormorant text-sm text-[#b8b5cc] leading-relaxed mb-6">
              Are you certain you wish to dissolve &ldquo;{("name" in selectedItem ? selectedItem.name : "") || ("title" in selectedItem ? selectedItem.title : "")}&rdquo;? Dependent junction linkages and participation records will be cleanly unlinked in accordance with foreign-key policies.
            </p>

            <div className="flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={closeModal}
                className="px-4 py-2 text-xs font-mono uppercase text-[#8b89ad] hover:text-white"
              >
                Retain Record
              </button>
              <button
                type="button"
                onClick={handleDeleteConfirm}
                disabled={isSubmitting}
                className="px-4 py-2 rounded-lg bg-rose-900/60 border border-rose-500/60 text-xs font-mono uppercase text-rose-200 hover:bg-rose-900"
              >
                {isSubmitting ? "Dissolving..." : "Confirm Dissolution"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* DISSOLVE ENTIRE UNIVERSE CONFIRMATION MODAL */}
      {isDissolveUniverseOpen && universe && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-fade-in">
          <div className="relative w-full max-w-md bg-[#090c21] border border-rose-500/50 rounded-xl shadow-2xl p-6 text-[#dedbd2]">
            <div className="flex items-center gap-2.5 text-rose-400 mb-3">
              <AlertTriangle className="w-5 h-5 text-rose-400" />
              <h3 className="font-cinzel text-lg font-bold text-[#faf8f2]">
                Dissolve Entire Universe?
              </h3>
            </div>
            <p className="font-cormorant text-sm text-[#b8b5cc] leading-relaxed mb-6">
              Are you certain you wish to dissolve &ldquo;{universe.title}&rdquo;? This will permanently eradicate this universe, all characters, locations, events, chapters, and causal connections from the canon. This action cannot be reversed.
            </p>

            <div className="flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setIsDissolveUniverseOpen(false)}
                className="px-4 py-2 text-xs font-mono uppercase text-[#8b89ad] hover:text-white cursor-pointer"
              >
                Retain Universe
              </button>
              <button
                type="button"
                onClick={handleDissolveUniverseConfirm}
                disabled={isDissolvingUniverse}
                className="px-4 py-2 rounded-lg bg-rose-900/70 border border-rose-500/70 text-xs font-mono uppercase text-rose-200 hover:bg-rose-900 transition-colors cursor-pointer"
              >
                {isDissolvingUniverse ? "Dissolving Universe..." : "Confirm Dissolution"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function UniverseWorkspacePage() {
  return (
    <Suspense
      fallback={
        <div className="relative min-h-screen bg-[#040509] text-[#e0ddcf] flex items-center justify-center">
          <StarfieldCanvas />
          <div className="text-center z-10">
            <RefreshCw className="w-8 h-8 text-[#fae48f] animate-spin mx-auto mb-3" />
            <p className="font-mono text-xs tracking-widest text-[#fae48f] uppercase">
              Harmonizing Celestial Plane...
            </p>
          </div>
        </div>
      }
    >
      <UniverseWorkspaceContent />
    </Suspense>
  );
}
