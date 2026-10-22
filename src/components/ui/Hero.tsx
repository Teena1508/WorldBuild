"use client";

import React from "react";
import { motion } from "framer-motion";
import { Compass, Eye, Sparkles, BookOpen, ChevronDown, ShieldCheck, Layers, GitBranch } from "lucide-react";
import { CelestialAstrolabe } from "./CelestialAstrolabe";

interface HeroProps {
  onEnterArchive: () => void;
  onDiscoverOracle: () => void;
}

export function Hero({ onEnterArchive, onDiscoverOracle }: HeroProps) {
  const scrollTo = (id: string) => {
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <section className="relative min-h-screen flex flex-col justify-between pt-28 pb-12 px-4 sm:px-6 lg:px-8 overflow-hidden">
      {/* Background radial gradients for celestial depth */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[900px] h-[700px] bg-[radial-gradient(circle_at_center,rgba(35,46,94,0.35)_0%,rgba(16,21,46,0.18)_45%,transparent_75%)] pointer-events-none blur-2xl" />
      <div className="absolute top-1/3 right-10 w-96 h-96 bg-[radial-gradient(circle_at_center,rgba(212,175,55,0.06)_0%,transparent_70%)] pointer-events-none blur-3xl" />

      {/* Layered Celestial Astrolabe in background behind hero copy */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none opacity-55 scale-90 sm:scale-100 lg:scale-115">
        <CelestialAstrolabe size={720} />
      </div>

      {/* Hero Content Container */}
      <div className="relative z-10 max-w-5xl mx-auto my-auto text-center flex flex-col items-center">
        {/* Top Celestial Scriptorium Badge */}
        <motion.div
          initial={{ opacity: 0, y: -15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.1 }}
          className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-[#d4af37]/35 bg-[#090d21]/75 backdrop-blur-md text-[11px] font-mono tracking-[0.25em] uppercase text-[#fae48f] mb-8 shadow-[0_0_20px_rgba(212,175,55,0.12)]"
        >
          <Sparkles className="w-3.5 h-3.5 text-[#fae48f]" />
          <span>The Sovereign Living Archive • Era IV</span>
        </motion.div>

        {/* Headline: Dramatic Title Reveal */}
        <motion.h1
          initial={{ opacity: 0, y: 25 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1, delay: 0.25, ease: [0.16, 1, 0.3, 1] }}
          className="font-cinzel text-4xl sm:text-6xl md:text-7xl font-bold tracking-tight text-[#fbf9f4] leading-[1.1] mb-6 max-w-4xl"
        >
          Every world has a thousand stories.{" "}
          <span className="block mt-2 gold-gradient-text font-serif italic font-normal">
            Make them all belong.
          </span>
        </motion.h1>

        {/* Supporting Copy */}
        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.9, delay: 0.45 }}
          className="font-cormorant text-lg sm:text-2xl text-[#c7c4db] max-w-2xl font-light leading-relaxed mb-10 text-balance"
        >
          WORLDBUILD is the premier celestial studio for authors, world designers, and mythmakers to craft interconnected fictional universes, link boundless lore, and effortlessly expose continuity contradictions before they fracture your canon.
        </motion.p>

        {/* Primary and Secondary CTAs */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.65 }}
          className="flex flex-col sm:flex-row items-center justify-center gap-4 w-full sm:w-auto"
        >
          <button
            onClick={onEnterArchive}
            id="hero-enter-archive-btn"
            className="gold-glow-button w-full sm:w-auto px-8 py-4 rounded-full text-xs font-mono tracking-[0.2em] uppercase font-semibold text-[#fae48f] flex items-center justify-center gap-3 cursor-pointer group"
          >
            <Compass className="w-4 h-4 text-[#fae48f] group-hover:rotate-45 transition-transform duration-500" />
            <span>Enter the Archive</span>
          </button>

          <button
            onClick={onDiscoverOracle}
            id="hero-discover-oracle-btn"
            className="w-full sm:w-auto px-7 py-4 rounded-full text-xs font-mono tracking-[0.2em] uppercase font-medium text-[#c9c7e0] border border-[#2b355d] bg-[#0c1024]/70 hover:border-[#fae48f]/50 hover:text-white hover:bg-[#141b38] backdrop-blur-md transition-all flex items-center justify-center gap-2.5 cursor-pointer"
          >
            <Eye className="w-4 h-4 text-[#d4af37]" />
            <span>Discover the Oracle</span>
          </button>
        </motion.div>

        {/* Subtext under CTAs */}
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 0.6 }}
          transition={{ delay: 0.85 }}
          className="text-xs font-mono text-[#8b8aa8] mt-4"
        >
          No arcane incantations required • Fully local preview • Database ready
        </motion.p>
      </div>

      {/* Telemetry / Live Canon Metrics Bar */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, delay: 0.9 }}
        className="relative z-10 max-w-6xl mx-auto w-full mt-12 pt-8 border-t border-[#1a213b]"
      >
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
          <div className="p-3 rounded-lg border border-[#1b223d]/60 bg-[#080c1d]/40 backdrop-blur-sm">
            <div className="flex items-center justify-center gap-1.5 text-xs font-mono text-[#8786a3] uppercase mb-1">
              <Layers className="w-3.5 h-3.5 text-[#d4af37]" />
              <span>Interlinked Entities</span>
            </div>
            <div className="font-cinzel text-xl sm:text-2xl font-bold text-[#fae48f]">
              1,482+
            </div>
            <div className="text-[10px] font-mono text-[#6c6a88]">Characters, Relics, Spatials</div>
          </div>

          <div className="p-3 rounded-lg border border-[#1b223d]/60 bg-[#080c1d]/40 backdrop-blur-sm">
            <div className="flex items-center justify-center gap-1.5 text-xs font-mono text-[#8786a3] uppercase mb-1">
              <GitBranch className="w-3.5 h-3.5 text-[#d4af37]" />
              <span>Chronology Strands</span>
            </div>
            <div className="font-cinzel text-xl sm:text-2xl font-bold text-[#f0ede4]">
              4 Parallel Eras
            </div>
            <div className="text-[10px] font-mono text-[#6c6a88]">Synchronized Timeline Layers</div>
          </div>

          <div className="p-3 rounded-lg border border-[#1b223d]/60 bg-[#080c1d]/40 backdrop-blur-sm">
            <div className="flex items-center justify-center gap-1.5 text-xs font-mono text-[#8786a3] uppercase mb-1">
              <ShieldCheck className="w-3.5 h-3.5 text-[#d4af37]" />
              <span>Causal Integrity</span>
            </div>
            <div className="font-cinzel text-xl sm:text-2xl font-bold text-[#72e8a6]">
              99.8%
            </div>
            <div className="text-[10px] font-mono text-[#6c6a88]">Paradox Defense Rate</div>
          </div>

          <div className="p-3 rounded-lg border border-[#1b223d]/60 bg-[#080c1d]/40 backdrop-blur-sm">
            <div className="flex items-center justify-center gap-1.5 text-xs font-mono text-[#8786a3] uppercase mb-1">
              <BookOpen className="w-3.5 h-3.5 text-[#d4af37]" />
              <span>Lore Vault Capacity</span>
            </div>
            <div className="font-cinzel text-xl sm:text-2xl font-bold text-[#d1ceea]">
              Infinite
            </div>
            <div className="text-[10px] font-mono text-[#6c6a88]">Uncapped Interconnected Worlds</div>
          </div>
        </div>

        {/* Scroll down indicator */}
        <div className="flex justify-center mt-6">
          <button
            onClick={() => scrollTo("archive-nexus")}
            aria-label="Scroll to Nexus"
            className="text-[#7d7a9b] hover:text-[#fae48f] transition-colors p-1.5 animate-bounce cursor-pointer"
          >
            <ChevronDown className="w-5 h-5" />
          </button>
        </div>
      </motion.div>
    </section>
  );
}
