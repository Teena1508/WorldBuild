"use client";

import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Compass,
  User,
  MapPin,
  Calendar,
  Sparkles,
  Link2,
  Lock,
  Eye,
  Shield,
  Layers,
  ChevronRight,
  Filter,
} from "lucide-react";
import { SAMPLE_ENTITIES } from "@/lib/data/sample-universe";
import { EntityType } from "@/types/worldbuild";

const TYPE_ICONS: Record<EntityType, React.ElementType> = {
  character: User,
  location: MapPin,
  event: Calendar,
  artifact: Sparkles,
  faction: Shield,
  magic_system: Layers,
};

const TYPE_COLORS: Record<EntityType, string> = {
  character: "border-amber-400/40 text-amber-300 bg-amber-950/30",
  location: "border-cyan-400/40 text-cyan-300 bg-cyan-950/30",
  event: "border-rose-400/40 text-rose-300 bg-rose-950/30",
  artifact: "border-purple-400/40 text-purple-300 bg-purple-950/30",
  faction: "border-emerald-400/40 text-emerald-300 bg-emerald-950/30",
  magic_system: "border-blue-400/40 text-blue-300 bg-blue-950/30",
};

export function NexusExplorer() {
  const [selectedEntityId, setSelectedEntityId] = useState<string>("char-vaelen");
  const [activeFilter, setActiveFilter] = useState<EntityType | "all">("all");
  const [revealedSecrets, setRevealedSecrets] = useState<Record<string, boolean>>({});

  const filteredEntities = activeFilter === "all"
    ? SAMPLE_ENTITIES
    : SAMPLE_ENTITIES.filter((e) => e.type === activeFilter);

  const selectedEntity = SAMPLE_ENTITIES.find((e) => e.id === selectedEntityId) || SAMPLE_ENTITIES[0];
  const SelectedIcon = TYPE_ICONS[selectedEntity.type];

  const toggleSecret = (id: string) => {
    setRevealedSecrets((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  };

  return (
    <section id="archive-nexus" className="relative py-28 px-4 sm:px-6 lg:px-8 border-t border-[#181f38] bg-[#050711]">
      {/* Background celestial grid */}
      <div className="absolute inset-0 celestial-grid pointer-events-none opacity-40" />
      <div className="absolute top-1/2 left-1/4 w-[600px] h-[600px] bg-[radial-gradient(circle_at_center,rgba(40,49,96,0.2)_0%,transparent_70%)] blur-3xl pointer-events-none" />

      <div className="relative z-10 max-w-7xl mx-auto">
        {/* Section Header */}
        <div className="text-center max-w-3xl mx-auto mb-16">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-[#d4af37]/30 bg-[#0c1126] text-[11px] font-mono tracking-[0.25em] uppercase text-[#fae48f] mb-4">
            <Compass className="w-3.5 h-3.5" />
            <span>Interactive Nexus Architecture</span>
          </div>
          <h2 className="font-cinzel text-3xl sm:text-5xl font-bold tracking-tight text-[#fbf9f4] mb-4">
            The Interconnected Tapestry
          </h2>
          <p className="font-cormorant text-lg sm:text-xl text-[#b8b5cc] font-light leading-relaxed">
            Every entity in your world lives within an active causal web. Touch any node to inspect its lore, lineage, secret author annotations, and live links across space and time.
          </p>

          {/* Filter Pills */}
          <div className="flex flex-wrap items-center justify-center gap-2 mt-8">
            <button
              onClick={() => setActiveFilter("all")}
              className={`px-3 py-1.5 rounded-full text-xs font-mono tracking-wider uppercase transition-all cursor-pointer ${
                activeFilter === "all"
                  ? "border border-[#fae48f] bg-[#1a2144] text-[#fae48f] shadow-[0_0_12px_rgba(212,175,55,0.2)]"
                  : "border border-[#222a4c] bg-[#090d20] text-[#8583a3] hover:text-[#c5c3dc]"
              }`}
            >
              All Entities ({SAMPLE_ENTITIES.length})
            </button>
            {(["character", "location", "event", "artifact", "faction"] as EntityType[]).map((type) => (
              <button
                key={type}
                onClick={() => setActiveFilter(type)}
                className={`px-3 py-1.5 rounded-full text-xs font-mono tracking-wider uppercase transition-all cursor-pointer ${
                  activeFilter === type
                    ? "border border-[#fae48f] bg-[#1a2144] text-[#fae48f] shadow-[0_0_12px_rgba(212,175,55,0.2)]"
                    : "border border-[#222a4c] bg-[#090d20] text-[#8583a3] hover:text-[#c5c3dc]"
                }`}
              >
                {type}s
              </button>
            ))}
          </div>
        </div>

        {/* Master Explorer Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* Left Column: Entity Constellation Selector Cards */}
          <div className="lg:col-span-5 space-y-3.5">
            <div className="flex items-center justify-between text-xs font-mono text-[#8a87a8] uppercase px-1 mb-2">
              <span className="flex items-center gap-1.5">
                <Filter className="w-3.5 h-3.5 text-[#d4af37]" />
                <span>Selected Realm: Aethelgard</span>
              </span>
              <span>Showing {filteredEntities.length} Nodes</span>
            </div>

            {filteredEntities.map((entity) => {
              const Icon = TYPE_ICONS[entity.type];
              const isSelected = entity.id === selectedEntityId;
              const colorClass = TYPE_COLORS[entity.type];

              return (
                <motion.div
                  key={entity.id}
                  onClick={() => setSelectedEntityId(entity.id)}
                  whileHover={{ x: 4 }}
                  className={`group relative p-4 rounded-xl border transition-all cursor-pointer ${
                    isSelected
                      ? "celestial-card border-[#fae48f]/60 bg-[#12183b]/80 shadow-[0_0_25px_rgba(212,175,55,0.18)]"
                      : "border-[#1b223f] bg-[#080c1d]/60 hover:border-[#2f3b6a] hover:bg-[#0c1228]"
                  }`}
                >
                  <div className="flex items-start gap-3.5">
                    <div className={`p-2.5 rounded-lg border ${colorClass} shrink-0`}>
                      <Icon className="w-5 h-5" />
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <h4 className="font-cinzel text-base font-semibold text-[#f5f2e9] group-hover:text-[#fae48f] transition-colors truncate">
                          {entity.name}
                        </h4>
                        <span className="text-[10px] font-mono tracking-wider uppercase px-2 py-0.5 rounded border border-[#2b355e] bg-[#0b0f24] text-[#8e8cb2]">
                          {entity.type}
                        </span>
                      </div>

                      <p className="font-cormorant text-sm italic text-[#c1bfd6] mt-0.5 truncate">
                        {entity.title}
                      </p>

                      <p className="font-cormorant text-xs text-[#8c8aab] mt-1.5 line-clamp-2 leading-relaxed">
                        {entity.summary}
                      </p>

                      <div className="flex items-center gap-3 mt-3 pt-2 border-t border-[#1a203b] text-[11px] font-mono text-[#767394]">
                        <span className="flex items-center gap-1 text-[#fae48f]">
                          <Link2 className="w-3 h-3 text-[#d4af37]" />
                          {entity.connections.length} Leyline Links
                        </span>
                        <span>•</span>
                        <span className="flex items-center gap-1 text-[#a5a3c2]">
                          <Lock className="w-3 h-3" />
                          {entity.secretsCount} Author Secrets
                        </span>
                      </div>
                    </div>

                    <ChevronRight
                      className={`w-4 h-4 self-center transition-transform ${
                        isSelected ? "text-[#fae48f] translate-x-1" : "text-[#4a4968] group-hover:text-[#908ea8]"
                      }`}
                    />
                  </div>
                </motion.div>
              );
            })}
          </div>

          {/* Right Column: Detailed Lore Codex & Causal Web Inspector */}
          <div className="lg:col-span-7">
            <AnimatePresence mode="wait">
              <motion.div
                key={selectedEntity.id}
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -15 }}
                transition={{ duration: 0.35 }}
                className="celestial-card p-6 sm:p-8 rounded-2xl relative overflow-hidden"
              >
                {/* Header with Type & Epithet */}
                <div className="flex flex-wrap items-center justify-between gap-3 pb-6 border-b border-[#202847]">
                  <div className="flex items-center gap-3">
                    <div className={`p-3 rounded-xl border ${TYPE_COLORS[selectedEntity.type]}`}>
                      <SelectedIcon className="w-6 h-6" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-mono uppercase tracking-widest text-[#fae48f]">
                          {selectedEntity.type}
                        </span>
                        <span className="text-xs text-[#5f5d7d]">•</span>
                        <span className="text-xs font-mono text-[#8d8ba8]">
                          {selectedEntity.realm}
                        </span>
                      </div>
                      <h3 className="font-cinzel text-2xl sm:text-3xl font-bold text-[#faf8f2]">
                        {selectedEntity.name}
                      </h3>
                      <p className="font-cormorant text-base italic text-[#c6c3dc]">
                        {selectedEntity.title}
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-col items-end">
                    <span className="text-[10px] font-mono tracking-widest uppercase px-2.5 py-1 rounded-full border border-emerald-500/30 bg-emerald-950/40 text-emerald-400 font-semibold">
                      Canonical • Verified
                    </span>
                    <span className="text-[11px] font-mono text-[#777494] mt-1">
                      {selectedEntity.epoch}
                    </span>
                  </div>
                </div>

                {/* Lore Narrative Body */}
                <div className="my-6">
                  <h4 className="text-xs font-mono tracking-widest uppercase text-[#8885a6] mb-2 flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-[#d4af37]" />
                    <span>Canon Codex Dossier</span>
                  </h4>
                  <p className="font-cormorant text-base sm:text-lg text-[#dedbd1] font-light leading-relaxed">
                    {selectedEntity.description}
                  </p>
                </div>

                {/* Worldbuilding Attributes Table */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 my-6 p-4 rounded-xl border border-[#1b2344] bg-[#080c1e]/60">
                  {Object.entries(selectedEntity.attributes).map(([key, val]) => (
                    <div key={key} className="text-xs font-mono">
                      <span className="text-[#7b7899] uppercase tracking-wider block text-[10px]">
                        {key}
                      </span>
                      <span className="text-[#dedbd0] font-medium">{val}</span>
                    </div>
                  ))}
                </div>

                {/* Interlinked Entities / Causal Web Section */}
                <div className="mt-6 pt-6 border-t border-[#202847]">
                  <div className="flex items-center justify-between mb-4">
                    <h4 className="text-xs font-mono tracking-widest uppercase text-[#fae48f] flex items-center gap-1.5">
                      <Link2 className="w-3.5 h-3.5 text-[#d4af37]" />
                      <span>Causal Leyline Connections ({selectedEntity.connections.length})</span>
                    </h4>
                    <span className="text-[11px] font-mono text-[#737190]">Click to Traverse</span>
                  </div>

                  <div className="space-y-2.5">
                    {selectedEntity.connections.map((conn, idx) => {
                      const ConnIcon = TYPE_ICONS[conn.type];
                      return (
                        <div
                          key={idx}
                          onClick={() => setSelectedEntityId(conn.targetId)}
                          className="group p-3 rounded-lg border border-[#1f284b] bg-[#0c1126]/70 hover:border-[#fae48f]/40 hover:bg-[#131938] transition-all flex items-center justify-between cursor-pointer"
                        >
                          <div className="flex items-center gap-3">
                            <div className="p-1.5 rounded-md border border-[#2b355d] bg-[#101530] text-[#d4af37]">
                              <ConnIcon className="w-3.5 h-3.5" />
                            </div>
                            <div>
                              <div className="text-xs font-cinzel font-semibold text-[#f0ede2] group-hover:text-[#fae48f] transition-colors">
                                {conn.targetName}
                              </div>
                              <div className="text-[11px] font-cormorant italic text-[#8c89ab]">
                                {conn.relationship}
                              </div>
                            </div>
                          </div>
                          <span className="text-[10px] font-mono uppercase text-[#73708f] group-hover:text-[#fae48f] transition-colors flex items-center gap-1">
                            Traverse &rarr;
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Confidential Author Secrets Accordion / Interactive Preview */}
                <div className="mt-6 pt-6 border-t border-[#202847]">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-xs font-mono text-[#e8c86d]">
                      <Lock className="w-3.5 h-3.5 text-[#d4af37]" />
                      <span>{selectedEntity.secretsCount} Classified Author Secrets</span>
                    </div>
                    <button
                      onClick={() => toggleSecret(selectedEntity.id)}
                      className="text-xs font-mono text-[#fae48f] hover:underline flex items-center gap-1 cursor-pointer"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      <span>{revealedSecrets[selectedEntity.id] ? "Conceal Secrets" : "Unseal Lore"}</span>
                    </button>
                  </div>

                  {revealedSecrets[selectedEntity.id] && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      className="mt-3 p-4 rounded-lg border border-amber-500/30 bg-[#161208]/60 text-xs font-cormorant text-[#fae48f] leading-relaxed"
                    >
                      <span className="font-mono text-[10px] uppercase tracking-wider text-amber-400 block mb-1">
                        CONFIDENTIAL NOTE • RESTRICTED TO CHRONO-ARCHIVISTS:
                      </span>
                      &ldquo;Vaelen possesses an unwritten parchment indicating that the Astrolabe was not forged in Year 345, but recovered from a predecessor universe before the cosmic void was formed. If revealed to the Synod, it proves the current pantheon are usurpers.&rdquo;
                    </motion.div>
                  )}
                </div>
              </motion.div>
            </AnimatePresence>
          </div>
        </div>
      </div>
    </section>
  );
}
