"use client";

import React, { useState } from "react";
import { motion } from "framer-motion";
import {
  BookOpen,
  Map,
  Clock,
  Eye,
  CheckCircle2,
  Sparkles,
  ArrowRight,
  ShieldCheck,
} from "lucide-react";

interface Pillar {
  id: string;
  name: string;
  latinSubtitle: string;
  category: string;
  icon: React.ElementType;
  headline: string;
  description: string;
  features: string[];
  mockData: {
    title: string;
    metrics: string;
    snippet: string;
  };
}

const PILLARS: Pillar[] = [
  {
    id: "vault",
    name: "The World Vault",
    latinSubtitle: "Codex Universalis",
    category: "Structured Knowledge Architecture",
    icon: BookOpen,
    headline: "A living grimoire for infinite lore, magic systems, and dynastic lineages.",
    description:
      "Bid farewell to fragmented wikis and sprawling spreadsheets. The Vault provides deep relational schemas for arcane magic axioms, deities, artifacts, languages, secret author notes, and faction hierarchies.",
    features: [
      "Customizable taxonomy schemas (characters, relics, spells, pantheons)",
      "Strict confidentiality tags for spoilers, plot twists, and unwritten arcs",
      "Automatic markdown backlinking with two-way referential integrity",
      "Polymorphic relationship mapping (e.g. 'slain by', 'sworn vassal to')",
    ],
    mockData: {
      title: "Codex Entry: Cold Iron Axioms",
      metrics: "Category: Magic Architecture • 14 Dependent Rules",
      snippet:
        "// AXIOM 3: 'Meteoric iron dampens void translocations within a radius of 40 cubits.' Cross-referenced with 48 registered battle sequences.",
    },
  },
  {
    id: "atlas",
    name: "The Living Atlas",
    latinSubtitle: "Cartographia Coelestis",
    category: "Spatial & Planar Cartography",
    icon: Map,
    headline: "Multi-layered celestial spheres, shifting borders, and subterranean realms.",
    description:
      "Maps that breathe and evolve across eras. Anchor your geography to historical epochs, track armies and trade winds, and seamlessly toggle between aerial celestial islands and subterranean void-trenches.",
    features: [
      "Multi-plane cartography (Celestial firmament, mortal terrestrial, abyssal deeps)",
      "Temporal border transitions: watch empire borders expand and contract across centuries",
      "Interactive travel velocity calculator and terrain encumbrance modeling",
      "Pinpoint location dossiers linked directly to character origins and treaties",
    ],
    mockData: {
      title: "Cartographic Coordinates: Mare Tenebrosum",
      metrics: "Altitude: -4,200 Fathoms • Governed by: Gilded Drowned",
      snippet:
        "Submerged territorial boundary shifts 12 leagues westward during the Twin Moon Alignment (Years 310–342 A.E.).",
    },
  },
  {
    id: "chronology",
    name: "The Chronology Engine",
    latinSubtitle: "Tessera Temporis",
    category: "Temporal Tapestry & Multi-POV",
    icon: Clock,
    headline: "Synchronize parallel epochs, character lifespans, and divergent timelines.",
    description:
      "Map non-linear time with ease. Track multi-POV storylines across continents, compare concurrent events happening on opposite sides of your cosmos, and manage branching alternate histories effortlessly.",
    features: [
      "Multi-track concurrent timeline view across varying character perspectives",
      "Dynamic calendar systems with custom lunar cycles, celestial conjunctions, and leap cycles",
      "Character lifespan overlaps: prevent characters from interacting before their birth or after demise",
      "Timeline branching for 'What If' scenarios, sequels, and companion novellas",
    ],
    mockData: {
      title: "Temporal Strand: Era of the Shattered Sky",
      metrics: "Span: 342–410 A.E. • 126 Synchronized Epoch Events",
      snippet:
        "Timeline Strand Prime is synchronized with Sub-Strand Beta. 3 POV narratives currently cross at the Battle of the Silver Needle.",
    },
  },
  {
    id: "oracle",
    name: "The Continuity Oracle",
    latinSubtitle: "Oraculum Causalitatis",
    category: "Paradox Detection & Causality AI",
    icon: Eye,
    headline: "Uncover plot holes and continuity contradictions before they break canon.",
    description:
      "The sleepless guardian of your narrative. The Oracle analyzes your complete story universe, flagging character geographical impossibilities, contradictory dates, dead-character appearances, and magic system violations.",
    features: [
      "Automated anachronism scanning across draft chapters and world entries",
      "Spatial velocity validation: flags characters traveling 500 leagues in 2 days on foot",
      "Magic axiom enforcement: warns when a protagonist bypasses established world rules",
      "One-click resolution pathways: retcon dates, spawn doppelgängers, or fork timelines",
    ],
    mockData: {
      title: "Oracle Alert: Paradox #714 (Active)",
      metrics: "Severity: Critical • Causal Impact: 14 Downstream Chapters",
      snippet:
        "Contradiction: Lady Isolda appears in 318 A.E. at the Treaty of Val-Kyra, 8 years after her confirmed demise in 310 A.E. 3 automated resolutions ready.",
    },
  },
];

export function PillarsShowcase() {
  const [activePillarId, setActivePillarId] = useState("vault");
  const activePillar = PILLARS.find((p) => p.id === activePillarId) || PILLARS[0];
  const ActiveIcon = activePillar.icon;

  return (
    <section id="world-pillars" className="relative py-28 px-4 sm:px-6 lg:px-8 border-t border-[#181f38] bg-[#04060d]">
      {/* Background ambient lighting */}
      <div className="absolute top-1/3 right-1/4 w-96 h-96 bg-[radial-gradient(circle_at_center,rgba(212,175,55,0.05)_0%,transparent_70%)] blur-3xl pointer-events-none" />

      <div className="relative z-10 max-w-7xl mx-auto">
        {/* Header */}
        <div className="text-center max-w-3xl mx-auto mb-16">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-[#d4af37]/30 bg-[#0c1126] text-[11px] font-mono tracking-[0.25em] uppercase text-[#fae48f] mb-4">
            <Sparkles className="w-3.5 h-3.5" />
            <span>The Four Pillars of WORLDBUILD</span>
          </div>
          <h2 className="font-cinzel text-3xl sm:text-5xl font-bold tracking-tight text-[#fbf9f4] mb-4">
            Engineered for Boundless Universes
          </h2>
          <p className="font-cormorant text-lg sm:text-xl text-[#b8b5cc] font-light leading-relaxed">
            Four specialized engines working in celestial harmony to elevate your world from scattered notes into an unshakeable mythological canon.
          </p>
        </div>

        {/* 4 Pillar Tabs / Selector Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-10">
          {PILLARS.map((pillar) => {
            const Icon = pillar.icon;
            const isSelected = pillar.id === activePillarId;

            return (
              <button
                key={pillar.id}
                onClick={() => setActivePillarId(pillar.id)}
                className={`p-5 rounded-xl border text-left transition-all cursor-pointer relative overflow-hidden ${
                  isSelected
                    ? "celestial-card border-[#fae48f] bg-[#101636] shadow-[0_0_20px_rgba(212,175,55,0.2)]"
                    : "border-[#1b2344] bg-[#080c1d]/60 hover:border-[#2e3b6a] hover:bg-[#0c1228]"
                }`}
              >
                <div className="flex items-center justify-between mb-3">
                  <div
                    className={`p-2 rounded-lg border ${
                      isSelected
                        ? "border-[#fae48f]/40 bg-[#1d2652] text-[#fae48f]"
                        : "border-[#242e52] bg-[#0e1329] text-[#8e8cb2]"
                    }`}
                  >
                    <Icon className="w-5 h-5" />
                  </div>
                  <span className="text-[10px] font-mono tracking-widest uppercase text-[#737190]">
                    {pillar.latinSubtitle}
                  </span>
                </div>

                <h3 className="font-cinzel text-lg font-bold text-[#faf8f2] mb-1">
                  {pillar.name}
                </h3>
                <p className="text-xs font-mono text-[#8684a6] truncate">
                  {pillar.category}
                </p>

                {isSelected && (
                  <motion.div
                    layoutId="pillar-pill-active"
                    className="absolute bottom-0 left-0 right-0 h-1 bg-gradient-to-r from-[#d4af37] to-[#fae48f]"
                  />
                )}
              </button>
            );
          })}
        </div>

        {/* Active Pillar Detailed Feature & Interactive Showcase Card */}
        <div className="celestial-card p-6 sm:p-10 rounded-2xl relative overflow-hidden">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
            {/* Left Column: Descriptive text and feature checklist */}
            <div className="lg:col-span-7">
              <div className="inline-flex items-center gap-2 text-xs font-mono tracking-widest uppercase text-[#fae48f] mb-3">
                <ActiveIcon className="w-4 h-4 text-[#d4af37]" />
                <span>{activePillar.category}</span>
              </div>

              <h3 className="font-cinzel text-2xl sm:text-4xl font-bold text-[#fbf9f4] mb-3 leading-tight">
                {activePillar.headline}
              </h3>

              <p className="font-cormorant text-base sm:text-lg text-[#ccc8dd] font-light leading-relaxed mb-6">
                {activePillar.description}
              </p>

              <div className="space-y-3 mb-8">
                {activePillar.features.map((feature, idx) => (
                  <div key={idx} className="flex items-start gap-3">
                    <CheckCircle2 className="w-4 h-4 text-[#fae48f] shrink-0 mt-0.5" />
                    <span className="text-xs sm:text-sm font-sans text-[#dedbd0] leading-relaxed">
                      {feature}
                    </span>
                  </div>
                ))}
              </div>

              <div className="flex items-center gap-4">
                <a
                  href="#continuity-oracle"
                  className="inline-flex items-center gap-2 text-xs font-mono tracking-widest uppercase text-[#fae48f] hover:text-white transition-colors"
                >
                  <span>Experience Interactive Demo</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </a>
              </div>
            </div>

            {/* Right Column: Live Mock Data / Dark Academia Parchment Slate */}
            <div className="lg:col-span-5">
              <div className="p-5 sm:p-6 rounded-xl border border-[#2b355d] bg-[#070b1c]/90 shadow-2xl relative">
                <div className="flex items-center justify-between pb-3 border-b border-[#1c2446] mb-4">
                  <div className="flex items-center gap-2">
                    <div className="w-2.5 h-2.5 rounded-full bg-amber-400" />
                    <span className="font-mono text-xs text-[#fae48f]">
                      {activePillar.mockData.title}
                    </span>
                  </div>
                  <span className="text-[10px] font-mono text-[#787596]">LIVE TELEMETRY</span>
                </div>

                <div className="text-xs font-mono text-[#8b88ab] mb-4">
                  {activePillar.mockData.metrics}
                </div>

                <div className="p-4 rounded-lg bg-[#04060f] border border-[#1b2344] font-mono text-xs text-[#d3cfbf] leading-relaxed relative overflow-hidden">
                  <div className="absolute top-0 right-0 p-1.5 text-[9px] font-mono uppercase bg-[#182042] text-[#fae48f] rounded-bl">
                    Verified Schema
                  </div>
                  <pre className="whitespace-pre-wrap font-mono text-[11px] sm:text-xs">
                    {activePillar.mockData.snippet}
                  </pre>
                </div>

                <div className="mt-4 pt-4 border-t border-[#1c2446] flex items-center justify-between text-xs font-mono text-[#7b7899]">
                  <span className="flex items-center gap-1.5 text-[#58d68d]">
                    <ShieldCheck className="w-3.5 h-3.5" />
                    <span>Schema Status: Immutable</span>
                  </span>
                  <span>PostgreSQL Ready</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
