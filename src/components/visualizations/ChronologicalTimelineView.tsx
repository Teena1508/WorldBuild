"use client";

import React, { useState, useMemo } from "react";
import {
  Calendar,
  AlertTriangle,
  Skull,
  Search,
  ArrowUpDown,
  Sparkles,
  ChevronRight,
  List,
  Clock,
} from "lucide-react";
import { Chapter, Location, ContinuityFinding } from "@/lib/db/types";

export interface TimelineEventItem {
  id: string;
  universe_id?: string;
  title: string;
  description: string | null;
  sequence_number: number;
  timestamp_year: number;
  location_id?: string | null;
  chapter_id?: string | null;
  is_death_event: boolean;
  location_name?: string | null;
  chapter_title?: string | null;
  participants_count?: number;
}

interface ChronologicalTimelineViewProps {
  events: TimelineEventItem[];
  chapters: Chapter[];
  locations: Location[];
  findings: ContinuityFinding[];
  onOpenEvent: (eventId: string) => void;
  onOpenCreateEvent?: () => void;
  isOwner?: boolean;
}

export function ChronologicalTimelineView({
  events,
  chapters,
  locations,
  findings,
  onOpenEvent,
  onOpenCreateEvent,
  isOwner = false,
}: ChronologicalTimelineViewProps) {
  // Sort mode: Chronological (timestamp_year) vs Narrative (sequence_number)
  const [sortMode, setSortMode] = useState<"chronological" | "narrative">("chronological");

  // View mode: Interactive Visual Timeline vs Accessible List
  const [viewMode, setViewMode] = useState<"visual" | "list">("visual");

  // Filters
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedChapterId, setSelectedChapterId] = useState<string>("all");
  const [selectedLocationId, setSelectedLocationId] = useState<string>("all");
  const [onlyDeathEvents, setOnlyDeathEvents] = useState(false);
  const [onlyParadoxEvents, setOnlyParadoxEvents] = useState(false);
  const [selectedYearRange, setSelectedYearRange] = useState<{ min: number | null; max: number | null }>({
    min: null,
    max: null,
  });

  // Active hover event
  const [hoveredEventId, setHoveredEventId] = useState<string | null>(null);

  // Map open findings to event IDs
  const eventParadoxMap = useMemo(() => {
    const map = new Map<string, Array<{ ruleCode: string; title: string; severity: string }>>();
    for (const f of findings) {
      if (f.status === "open") {
        try {
          const entities: Array<{ id: string; type: string }> = JSON.parse(
            f.affected_entities_json || "[]"
          );
          for (const ent of entities) {
            if (ent.type === "event") {
              const list = map.get(ent.id) || [];
              list.push({
                ruleCode: f.rule_code,
                title: f.title,
                severity: f.severity,
              });
              map.set(ent.id, list);
            }
          }
        } catch {
          // ignore parse error
        }
      }
    }
    return map;
  }, [findings]);

  // Overall min and max years in dataset
  const { datasetMinYear, datasetMaxYear, timeSpan } = useMemo(() => {
    if (events.length === 0) return { datasetMinYear: 0, datasetMaxYear: 0, timeSpan: 0 };
    const years = events.map((e) => e.timestamp_year);
    const min = Math.min(...years);
    const max = Math.max(...years);
    return { datasetMinYear: min, datasetMaxYear: max, timeSpan: max - min };
  }, [events]);

  // Filtered and Sorted Events
  const filteredEvents = useMemo(() => {
    const filtered = events.filter((ev) => {
      if (selectedChapterId !== "all" && ev.chapter_id !== selectedChapterId) return false;
      if (selectedLocationId !== "all" && ev.location_id !== selectedLocationId) return false;
      if (onlyDeathEvents && !ev.is_death_event) return false;
      if (onlyParadoxEvents && !eventParadoxMap.has(ev.id)) return false;

      if (selectedYearRange.min !== null && ev.timestamp_year < selectedYearRange.min) return false;
      if (selectedYearRange.max !== null && ev.timestamp_year > selectedYearRange.max) return false;

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const titleMatch = ev.title.toLowerCase().includes(q);
        const descMatch = ev.description?.toLowerCase().includes(q);
        const locMatch = ev.location_name?.toLowerCase().includes(q);
        return titleMatch || Boolean(descMatch) || Boolean(locMatch);
      }

      return true;
    });

    return [...filtered].sort((a, b) => {
      if (sortMode === "chronological") {
        if (a.timestamp_year !== b.timestamp_year) {
          return a.timestamp_year - b.timestamp_year;
        }
        return a.sequence_number - b.sequence_number;
      } else {
        if (a.sequence_number !== b.sequence_number) {
          return a.sequence_number - b.sequence_number;
        }
        return a.timestamp_year - b.timestamp_year;
      }
    });
  }, [
    events,
    selectedChapterId,
    selectedLocationId,
    onlyDeathEvents,
    onlyParadoxEvents,
    selectedYearRange,
    searchQuery,
    sortMode,
    eventParadoxMap,
  ]);

  // Group events by chapter or chronological epochs
  const epochGroups = useMemo(() => {
    const groups: Array<{ key: string; label: string; sublabel?: string; events: TimelineEventItem[] }> = [];

    if (sortMode === "narrative") {
      // Group by Chapter
      const chapterMap = new Map<string, TimelineEventItem[]>();
      const unassigned: TimelineEventItem[] = [];

      for (const ev of filteredEvents) {
        if (ev.chapter_id) {
          const list = chapterMap.get(ev.chapter_id) || [];
          list.push(ev);
          chapterMap.set(ev.chapter_id, list);
        } else {
          unassigned.push(ev);
        }
      }

      // Add chapters in sequence order
      const sortedChapters = [...chapters].sort((a, b) => a.sequence_number - b.sequence_number);
      for (const ch of sortedChapters) {
        const evs = chapterMap.get(ch.id);
        if (evs && evs.length > 0) {
          groups.push({
            key: ch.id,
            label: `Chapter ${ch.sequence_number}: ${ch.title}`,
            sublabel: ch.summary,
            events: evs,
          });
        }
      }

      if (unassigned.length > 0) {
        groups.push({
          key: "unassigned",
          label: "Chronicle Appendices & Prologues",
          sublabel: "Events not tied to a specific manuscript chapter",
          events: unassigned,
        });
      }
    } else {
      // Group by year intervals (e.g. centuries or distinct years)
      const yearMap = new Map<number, TimelineEventItem[]>();
      for (const ev of filteredEvents) {
        const list = yearMap.get(ev.timestamp_year) || [];
        list.push(ev);
        yearMap.set(ev.timestamp_year, list);
      }

      const sortedYears = Array.from(yearMap.keys()).sort((a, b) => a - b);
      for (const yr of sortedYears) {
        groups.push({
          key: `yr-${yr}`,
          label: `Year ${yr}`,
          events: yearMap.get(yr)!,
        });
      }
    }

    return groups;
  }, [filteredEvents, sortMode, chapters]);

  return (
    <div className="space-y-4 animate-fade-in">
      {/* 1. Header Toolbar */}
      <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-4 p-4 rounded-xl border border-[#1b2347] bg-[#070b20]">
        <div className="flex flex-wrap items-center gap-3">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-[#d4af37]/30 bg-[#0c1230] text-[11px] font-mono tracking-wider uppercase text-[#fae48f]">
            <Calendar className="w-3.5 h-3.5 text-[#fae48f]" />
            <span>Chronological Story Continuum</span>
          </div>

          <span className="text-xs font-mono text-[#827f9e]">
            {events.length} Anchor Milestones
            {events.length > 0 && ` • Span: Year ${datasetMinYear} to Year ${datasetMaxYear} (${timeSpan} yrs)`}
          </span>

          {eventParadoxMap.size > 0 && (
            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full border border-rose-500/40 bg-rose-950/60 text-rose-300 text-[10px] font-mono">
              <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse" />
              <span>{eventParadoxMap.size} Events with Paradoxes</span>
            </span>
          )}
        </div>

        {/* View & Sort Controls */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Sort Switch */}
          <button
            type="button"
            onClick={() =>
              setSortMode((m) => (m === "chronological" ? "narrative" : "chronological"))
            }
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#20294e] bg-[#090e24] text-xs font-mono text-[#fae48f] hover:bg-[#12193d] transition-colors cursor-pointer"
            title="Toggle between in-universe chronological year and manuscript sequence"
          >
            <ArrowUpDown className="w-3.5 h-3.5" />
            <span>
              {sortMode === "chronological"
                ? "Sort: Chronological Year"
                : "Sort: Narrative Sequence"}
            </span>
          </button>

          {/* View Mode Switch */}
          <button
            type="button"
            onClick={() => setViewMode((v) => (v === "visual" ? "list" : "visual"))}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-mono uppercase transition-colors cursor-pointer ${
              viewMode === "list"
                ? "border-[#fae48f] bg-[#1a234d] text-[#fae48f]"
                : "border-[#20294e] bg-[#090e24] text-[#8e8cae] hover:text-[#dedbd0]"
            }`}
          >
            <List className="w-3.5 h-3.5" />
            <span>{viewMode === "list" ? "Interactive Timeline" : "Accessible List"}</span>
          </button>

          {isOwner && onOpenCreateEvent && (
            <button
              type="button"
              onClick={onOpenCreateEvent}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#d4af37]/50 bg-gradient-to-r from-[#d4af37]/20 to-transparent hover:border-[#fae48f] text-xs font-mono text-[#fae48f] transition-all cursor-pointer"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Inscribe Event</span>
            </button>
          )}
        </div>
      </div>

      {/* 2. Interactive Scrubber / Mini-Map across Chronological Span */}
      {events.length > 0 && (
        <div className="p-3 rounded-xl border border-[#1b2347] bg-[#050714] relative overflow-hidden">
          <div className="flex items-center justify-between text-[10px] font-mono text-[#787596] mb-1.5">
            <span>Year {datasetMinYear} (Epoch Dawn)</span>
            <span className="text-[#fae48f] uppercase tracking-wider">
              Chronological Spectrum ({events.length} Events)
            </span>
            <span>Year {datasetMaxYear} (Modern Era)</span>
          </div>

          {/* Scrubber Bar with Event Distribution Ticks */}
          <div className="h-5 w-full rounded-lg bg-[#090e24] border border-[#1b2345] relative overflow-hidden flex items-center">
            {events.map((ev) => {
              const pct =
                timeSpan === 0
                  ? 50
                  : Math.max(
                      1,
                      Math.min(99, ((ev.timestamp_year - datasetMinYear) / Math.max(1, timeSpan)) * 100)
                    );
              const hasParadox = eventParadoxMap.has(ev.id);
              const isDeath = ev.is_death_event;

              return (
                <div
                  key={`tick-${ev.id}`}
                  onClick={() => onOpenEvent(ev.id)}
                  title={`${ev.title} (Year ${ev.timestamp_year})`}
                  className={`absolute top-0 bottom-0 w-1 cursor-pointer transition-all hover:scale-150 hover:z-20 ${
                    hasParadox
                      ? "bg-rose-500 shadow-[0_0_8px_#f43f5e]"
                      : isDeath
                      ? "bg-purple-400"
                      : "bg-[#fae48f]/70 hover:bg-[#fae48f]"
                  }`}
                  style={{ left: `${pct}%` }}
                />
              );
            })}
          </div>
        </div>
      )}

      {/* 3. Filtering Ribbon */}
      <div className="p-3 rounded-xl border border-[#1b2347] bg-[#050819] flex flex-wrap items-center gap-3 text-xs font-mono">
        {/* Search */}
        <div className="relative w-44 sm:w-56">
          <Search className="w-3.5 h-3.5 text-[#6c6987] absolute left-2.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search milestone..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-8 pr-2.5 py-1.5 rounded-lg border border-[#1e274d] bg-[#070a1e] text-xs font-mono text-[#dedbd2] placeholder-[#5a5775] focus:outline-none focus:border-[#fae48f]"
          />
        </div>

        {/* Chapter Filter */}
        <div className="flex items-center gap-1.5">
          <span className="text-[#726f8f]">Chapter:</span>
          <select
            value={selectedChapterId}
            onChange={(e) => setSelectedChapterId(e.target.value)}
            className="px-2.5 py-1.5 rounded-lg border border-[#1e274d] bg-[#070a1e] text-xs font-mono text-[#dedbd2] focus:outline-none focus:border-[#fae48f]"
          >
            <option value="all">All Chapters ({chapters.length})</option>
            {chapters.map((ch) => (
              <option key={ch.id} value={ch.id}>
                Ch {ch.sequence_number}: {ch.title}
              </option>
            ))}
          </select>
        </div>

        {/* Location Filter */}
        <div className="flex items-center gap-1.5">
          <span className="text-[#726f8f]">Realm:</span>
          <select
            value={selectedLocationId}
            onChange={(e) => setSelectedLocationId(e.target.value)}
            className="px-2.5 py-1.5 rounded-lg border border-[#1e274d] bg-[#070a1e] text-xs font-mono text-[#dedbd2] focus:outline-none focus:border-[#fae48f]"
          >
            <option value="all">All Locations ({locations.length})</option>
            {locations.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
        </div>

        {/* Death Events Toggle */}
        <label className="flex items-center gap-1.5 text-xs font-mono cursor-pointer select-none">
          <input
            type="checkbox"
            checked={onlyDeathEvents}
            onChange={(e) => setOnlyDeathEvents(e.target.checked)}
            className="rounded accent-purple-500"
          />
          <span className={onlyDeathEvents ? "text-purple-300 font-semibold" : "text-[#797696]"}>
            Death Milestones Only
          </span>
        </label>

        {/* Paradox Toggle */}
        <label className="flex items-center gap-1.5 text-xs font-mono cursor-pointer select-none">
          <input
            type="checkbox"
            checked={onlyParadoxEvents}
            onChange={(e) => setOnlyParadoxEvents(e.target.checked)}
            className="rounded accent-rose-500"
          />
          <span className={onlyParadoxEvents ? "text-rose-300 font-semibold" : "text-[#797696]"}>
            Only Paradoxes ({eventParadoxMap.size})
          </span>
        </label>

        {/* Year Range Filter */}
        <div className="flex items-center gap-1.5">
          <span className="text-[#726f8f]">Year:</span>
          <input
            type="number"
            placeholder="Min"
            value={selectedYearRange.min ?? ""}
            onChange={(e) =>
              setSelectedYearRange((r) => ({
                ...r,
                min: e.target.value !== "" ? Number(e.target.value) : null,
              }))
            }
            className="w-16 px-2 py-1 rounded-lg border border-[#1e274d] bg-[#070a1e] text-xs font-mono text-[#dedbd2] placeholder-[#5a5775] focus:outline-none focus:border-[#fae48f]"
          />
          <span className="text-[#726f8f]">-</span>
          <input
            type="number"
            placeholder="Max"
            value={selectedYearRange.max ?? ""}
            onChange={(e) =>
              setSelectedYearRange((r) => ({
                ...r,
                max: e.target.value !== "" ? Number(e.target.value) : null,
              }))
            }
            className="w-16 px-2 py-1 rounded-lg border border-[#1e274d] bg-[#070a1e] text-xs font-mono text-[#dedbd2] placeholder-[#5a5775] focus:outline-none focus:border-[#fae48f]"
          />
        </div>

        {/* Reset Filters */}
        {(selectedChapterId !== "all" ||
          selectedLocationId !== "all" ||
          onlyDeathEvents ||
          onlyParadoxEvents ||
          selectedYearRange.min !== null ||
          selectedYearRange.max !== null ||
          searchQuery) && (
          <button
            type="button"
            onClick={() => {
              setSelectedChapterId("all");
              setSelectedLocationId("all");
              setOnlyDeathEvents(false);
              setOnlyParadoxEvents(false);
              setSelectedYearRange({ min: null, max: null });
              setSearchQuery("");
            }}
            className="text-xs font-mono text-[#fae48f] hover:underline ml-auto"
          >
            Reset Filters
          </button>
        )}
      </div>


      {/* 4. Timeline Storyboard or Accessible List Display */}
      {filteredEvents.length === 0 ? (
        <div className="celestial-card p-12 text-center rounded-2xl border border-[#d4af37]/25 bg-gradient-to-b from-[#0a0f26]/80 via-[#070a1e]/60 to-[#040510] shadow-xl relative overflow-hidden">
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-64 bg-[#d4af37]/5 rounded-full blur-3xl pointer-events-none" />
          <div className="max-w-md mx-auto space-y-4 relative z-10">
            <div className="w-14 h-14 rounded-2xl border border-[#d4af37]/40 bg-[#0d122c] text-[#fae48f] flex items-center justify-center mx-auto shadow-[0_0_25px_rgba(212,175,55,0.2)]">
              <Clock className="w-7 h-7 text-[#fae48f]" />
            </div>
            <div>
              <span className="text-[10px] font-mono tracking-widest uppercase text-[#fae48f] block mb-1">
                Temporal Axis Silent
              </span>
              <h3 className="font-cinzel text-xl font-bold text-[#faf8f2]">
                {events.length === 0 ? "The River of Time Lies Still" : "No Milestones in Filter Scope"}
              </h3>
            </div>
            <p className="font-cormorant text-sm sm:text-base text-[#b0aebb] leading-relaxed">
              {events.length === 0
                ? "No chronological events or historical epochs have been recorded in this universe yet. Inscribe the dawn milestone to establish timeline causality."
                : "No historical milestones match your current filter parameters. Try clearing your search query or chapter filters."}
            </p>
            {isOwner && onOpenCreateEvent && (
              <div className="pt-2">
                <button
                  type="button"
                  onClick={onOpenCreateEvent}
                  className="gold-glow-button inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-mono uppercase tracking-wider font-semibold text-[#fae48f] cursor-pointer"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Inscribe First Event</span>
                </button>
              </div>
            )}
          </div>
        </div>
      ) : viewMode === "list" ? (
        /* Accessible List View */
        <div className="celestial-card p-6 rounded-2xl border border-[#1b2347] bg-[#070a1e] space-y-6">
          <div className="flex items-center justify-between pb-3 border-b border-[#18203c]">
            <h3 className="font-cinzel text-base font-bold text-[#faf8f2]">
              Accessible Chronological Story Registry
            </h3>
            <span className="text-xs font-mono text-[#787596]">
              {filteredEvents.length} events ordered by{" "}
              {sortMode === "chronological" ? "timeline tick (year)" : "narrative sequence"}
            </span>
          </div>

          <ol className="space-y-4" role="list">
            {filteredEvents.map((ev) => {
              const paradoxes = eventParadoxMap.get(ev.id) || [];
              const hasParadox = paradoxes.length > 0;

              return (
                <li
                  key={ev.id}
                  className={`p-4 rounded-xl border transition-all ${
                    hasParadox
                      ? "border-rose-500/40 bg-[#160b14]"
                      : ev.is_death_event
                      ? "border-purple-500/30 bg-[#12081f]"
                      : "border-[#1b2347] bg-[#090d24] hover:border-[#fae48f]/30"
                  }`}
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-2">
                    <div className="flex items-center gap-2">
                      <span className="px-2 py-0.5 rounded border border-[#d4af37]/30 bg-[#12193b] text-[#fae48f] font-mono text-xs font-semibold">
                        Year {ev.timestamp_year}
                      </span>
                      <span className="text-xs font-mono text-[#797699]">
                        Sequence #{ev.sequence_number}
                      </span>

                      {ev.is_death_event && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded border border-purple-500/40 bg-purple-950/60 text-purple-300 text-[10px] font-mono">
                          <Skull className="w-3 h-3" />
                          <span>Death Milestone</span>
                        </span>
                      )}

                      {hasParadox && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded border border-rose-500/40 bg-rose-950/60 text-rose-300 text-[10px] font-mono font-semibold">
                          <AlertTriangle className="w-3 h-3 text-rose-400" />
                          <span>{paradoxes.length} Active Paradox(es)</span>
                        </span>
                      )}
                    </div>

                    <button
                      onClick={() => onOpenEvent(ev.id)}
                      className="text-xs font-mono text-[#fae48f] hover:underline flex items-center gap-1 self-start sm:self-auto cursor-pointer"
                    >
                      <span>Inspect Event Dossier</span>
                      <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  <h4 className="font-cinzel text-base font-bold text-[#faf8f2]">
                    {ev.title}
                  </h4>

                  {ev.description && (
                    <p className="font-cormorant text-sm text-[#b8b5cc] mt-1">
                      {ev.description}
                    </p>
                  )}

                  <div className="flex flex-wrap items-center gap-4 mt-3 pt-3 border-t border-[#161d3d] text-xs font-mono text-[#7a7796]">
                    {ev.chapter_title && <span>📖 {ev.chapter_title}</span>}
                    {ev.location_name && <span>📍 {ev.location_name}</span>}
                    <span>👥 {ev.participants_count || 0} participants</span>
                  </div>
                </li>
              );
            })}
          </ol>
        </div>
      ) : (
        /* Visual Interactive Timeline Layout */
        <div className="space-y-8 relative">
          {/* Continuous Center Causal Thread */}
          <div className="hidden md:block absolute left-1/2 top-4 bottom-4 w-0.5 bg-gradient-to-b from-[#d4af37]/40 via-[#d4af37]/20 to-transparent -translate-x-1/2 z-0" />

          {epochGroups.map((group) => (
            <div key={group.key} className="space-y-4 relative z-10">
              {/* Epoch / Group Header Banner */}
              <div className="flex items-center justify-center my-6">
                <div className="px-4 py-1.5 rounded-full border border-[#d4af37]/40 bg-[#090e24] shadow-xl text-center">
                  <span className="font-cinzel text-xs sm:text-sm font-bold text-[#fae48f] tracking-wider uppercase">
                    {group.label}
                  </span>
                  {group.sublabel && (
                    <span className="font-cormorant text-xs text-[#a29fb8] block italic">
                      {group.sublabel}
                    </span>
                  )}
                </div>
              </div>

              {/* Event Cards along the track */}
              <div className="space-y-6">
                {group.events.map((ev, evIdx) => {
                  const paradoxes = eventParadoxMap.get(ev.id) || [];
                  const hasParadox = paradoxes.length > 0;
                  const isHovered = hoveredEventId === ev.id;
                  const isLeft = evIdx % 2 === 0;

                  return (
                    <div
                      key={ev.id}
                      className={`flex flex-col md:flex-row items-center gap-4 ${
                        isLeft ? "md:flex-row-reverse" : ""
                      }`}
                      onMouseEnter={() => setHoveredEventId(ev.id)}
                      onMouseLeave={() => setHoveredEventId(null)}
                    >
                      {/* Event Card (Half width on desktop) */}
                      <div className="w-full md:w-[calc(50%-2rem)]">
                        <div
                          onClick={() => onOpenEvent(ev.id)}
                          className={`p-5 rounded-2xl border transition-all cursor-pointer relative ${
                            hasParadox
                              ? "border-rose-500/50 bg-gradient-to-br from-[#1c0c16] via-[#100713] to-[#05040a] shadow-[0_0_20px_rgba(244,63,94,0.15)]"
                              : ev.is_death_event
                              ? "border-purple-500/40 bg-gradient-to-br from-[#160824] via-[#0b0518] to-[#05040a]"
                              : isHovered
                              ? "border-[#fae48f] bg-[#0c1330] shadow-xl"
                              : "border-[#1b2347] bg-[#080c20] hover:border-[#fae48f]/40"
                          }`}
                        >
                          {/* Paradox Alert Ribbon */}
                          {hasParadox && (
                            <div className="mb-2.5 p-2 rounded-lg border border-rose-500/40 bg-rose-950/40 flex items-center gap-2 text-rose-300 text-xs font-mono">
                              <AlertTriangle className="w-4 h-4 shrink-0 text-rose-400" />
                              <div className="truncate">
                                <span className="font-bold">Paradox: </span>
                                <span>{paradoxes[0].title}</span>
                              </div>
                            </div>
                          )}

                          {/* Year and Flags */}
                          <div className="flex items-center justify-between gap-2 mb-2">
                            <div className="flex items-center gap-2">
                              <span className="font-mono text-xs font-bold text-[#fae48f] px-2 py-0.5 rounded border border-[#d4af37]/30 bg-[#12193b]">
                                Year {ev.timestamp_year}
                              </span>
                              <span className="font-mono text-[11px] text-[#787596]">
                                Seq #{ev.sequence_number}
                              </span>
                            </div>

                            {ev.is_death_event && (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded border border-purple-500/40 bg-purple-950/60 text-purple-300 text-[10px] font-mono">
                                <Skull className="w-3 h-3" />
                                <span>Death Milestone</span>
                              </span>
                            )}
                          </div>

                          {/* Title */}
                          <h4 className="font-cinzel text-base sm:text-lg font-bold text-[#faf8f2] group-hover:text-[#fae48f]">
                            {ev.title}
                          </h4>

                          {/* Description */}
                          {ev.description && (
                            <p className="font-cormorant text-sm text-[#b8b5cc] mt-1 line-clamp-2">
                              {ev.description}
                            </p>
                          )}

                          {/* Metadata Footer */}
                          <div className="flex flex-wrap items-center gap-3 mt-3 pt-3 border-t border-[#171e3d] text-[11px] font-mono text-[#787596]">
                            {ev.chapter_title && (
                              <span className="truncate max-w-[150px]">
                                📖 {ev.chapter_title}
                              </span>
                            )}
                            {ev.location_name && (
                              <span className="truncate max-w-[150px]">
                                📍 {ev.location_name}
                              </span>
                            )}
                            <span className="ml-auto text-[#fae48f]">
                              👥 {ev.participants_count || 0}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Center Timeline Node Marker */}
                      <div className="hidden md:flex items-center justify-center w-8 h-8 rounded-full border border-[#d4af37]/50 bg-[#090e24] z-10 shrink-0 shadow-lg">
                        {hasParadox ? (
                          <span className="w-3.5 h-3.5 rounded-full bg-rose-500 animate-ping" />
                        ) : ev.is_death_event ? (
                          <Skull className="w-3.5 h-3.5 text-purple-300" />
                        ) : (
                          <span className="w-2.5 h-2.5 rounded-full bg-[#fae48f]" />
                        )}
                      </div>

                      {/* Spacer opposite card */}
                      <div className="hidden md:block w-[calc(50%-2rem)]" />
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
