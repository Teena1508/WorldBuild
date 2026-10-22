"use client";

import React from "react";
import { motion } from "framer-motion";
import { Compass, Sparkles, ArrowRight, ShieldCheck } from "lucide-react";

interface ClosingCTAProps {
  onOpenUniverseModal: () => void;
}

export function ClosingCTA({ onOpenUniverseModal }: ClosingCTAProps) {
  const scrollToNexus = () => {
    const el = document.getElementById("archive-nexus");
    if (el) el.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <section className="relative py-28 px-4 sm:px-6 lg:px-8 overflow-hidden bg-[#030409]">
      {/* Background portal illumination rings */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[700px] rounded-full border border-[#d4af37]/15 pointer-events-none" />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] rounded-full border border-[#d4af37]/25 border-dashed animate-spin-slow pointer-events-none" />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[300px] h-[300px] bg-[radial-gradient(circle_at_center,rgba(212,175,55,0.12)_0%,rgba(40,49,96,0.18)_50%,transparent_75%)] blur-2xl pointer-events-none" />

      <div className="relative z-10 max-w-4xl mx-auto text-center">
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.8 }}
          className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-[#d4af37]/35 bg-[#0b0f24] text-[11px] font-mono tracking-[0.25em] uppercase text-[#fae48f] mb-6"
        >
          <Sparkles className="w-3.5 h-3.5 text-[#fae48f]" />
          <span>The Great Gathering of Realities</span>
        </motion.div>

        <motion.h2
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.9, delay: 0.15 }}
          className="font-cinzel text-3xl sm:text-5xl md:text-6xl font-bold tracking-tight text-[#fbf9f4] mb-6 leading-tight"
        >
          Bring Your Multiverse{" "}
          <span className="gold-gradient-text block font-serif italic font-normal">
            Into Perfect Alignment.
          </span>
        </motion.h2>

        <motion.p
          initial={{ opacity: 0, y: 15 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.9, delay: 0.3 }}
          className="font-cormorant text-lg sm:text-2xl text-[#c7c4db] font-light leading-relaxed mb-10 max-w-2xl mx-auto"
        >
          No more broken timelines, forgotten lineages, or accidental plot paradoxes. Enter the sanctuary where myths are preserved with celestial precision.
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 15 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.8, delay: 0.45 }}
          className="flex flex-col sm:flex-row items-center justify-center gap-4"
        >
          <button
            onClick={onOpenUniverseModal}
            id="closing-cta-enter-btn"
            className="gold-glow-button w-full sm:w-auto px-8 py-4 rounded-full text-xs font-mono tracking-[0.2em] uppercase font-semibold text-[#fae48f] flex items-center justify-center gap-2 cursor-pointer group"
          >
            <span>Enter the Archive</span>
            <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
          </button>

          <button
            onClick={scrollToNexus}
            id="closing-cta-explore-btn"
            className="w-full sm:w-auto px-7 py-4 rounded-full text-xs font-mono tracking-[0.2em] uppercase font-medium text-[#c8c5de] border border-[#232c4f] bg-[#090d22]/80 hover:border-[#fae48f]/40 hover:text-white transition-all flex items-center justify-center gap-2 cursor-pointer"
          >
            <Compass className="w-3.5 h-3.5 text-[#d4af37]" />
            <span>Explore Nexus First</span>
          </button>
        </motion.div>

        <div className="mt-8 flex items-center justify-center gap-2 text-xs font-mono text-[#787596]">
          <ShieldCheck className="w-3.5 h-3.5 text-[#58d68d]" />
          <span>Local storage enabled • PostgreSQL architecture ready for Phase 2</span>
        </div>
      </div>
    </section>
  );
}
