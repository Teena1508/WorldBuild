"use client";

import React from "react";
import { Sparkles, Compass, Shield, BookOpen, Clock, Eye, Database, Code2 } from "lucide-react";

export function Footer() {
  const scrollTo = (id: string) => {
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <footer className="border-t border-[#181f38] bg-[#020307] text-[#9390ae] pt-16 pb-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-10 pb-12 border-b border-[#141a30]">
          {/* Brand & Manifesto Column */}
          <div className="lg:col-span-2">
            <div className="flex items-center gap-3 mb-4">
              <div className="relative flex items-center justify-center w-8 h-8 rounded-lg border border-[#d4af37]/40 bg-[#0d1226] text-[#fae48f]">
                <span className="font-cinzel text-xs font-bold">W</span>
                <div className="absolute -top-1 -right-1 w-1.5 h-1.5 rounded-full bg-[#fae48f]" />
              </div>
              <span className="font-cinzel text-xl font-bold tracking-[0.22em] text-[#fae48f]">
                WORLDBUILD
              </span>
            </div>

            <p className="font-cormorant text-base text-[#b8b5cc] leading-relaxed max-w-sm mb-6">
              &ldquo;For the scribes who spend quiet nights measuring stars, binding contradictory timelines, and keeping faith with imaginary kingdoms.&rdquo;
            </p>

            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-md border border-[#232b4d] bg-[#080c1d] text-xs font-mono text-[#fae48f]">
              <Sparkles className="w-3.5 h-3.5 text-[#d4af37]" />
              <span>Continuity Assurance • Era IV</span>
            </div>
          </div>

          {/* Column 2: Pillars */}
          <div>
            <h4 className="font-cinzel text-xs font-bold uppercase tracking-widest text-[#f0ece2] mb-4">
              The Four Pillars
            </h4>
            <ul className="space-y-2.5 text-xs font-mono">
              <li>
                <button
                  onClick={() => scrollTo("world-pillars")}
                  className="hover:text-[#fae48f] transition-colors flex items-center gap-1.5 cursor-pointer"
                >
                  <BookOpen className="w-3.5 h-3.5 text-[#706d8d]" />
                  <span>The World Vault</span>
                </button>
              </li>
              <li>
                <button
                  onClick={() => scrollTo("world-pillars")}
                  className="hover:text-[#fae48f] transition-colors flex items-center gap-1.5 cursor-pointer"
                >
                  <Compass className="w-3.5 h-3.5 text-[#706d8d]" />
                  <span>The Living Atlas</span>
                </button>
              </li>
              <li>
                <button
                  onClick={() => scrollTo("world-pillars")}
                  className="hover:text-[#fae48f] transition-colors flex items-center gap-1.5 cursor-pointer"
                >
                  <Clock className="w-3.5 h-3.5 text-[#706d8d]" />
                  <span>Chronology Engine</span>
                </button>
              </li>
              <li>
                <button
                  onClick={() => scrollTo("continuity-oracle")}
                  className="hover:text-[#fae48f] transition-colors flex items-center gap-1.5 cursor-pointer"
                >
                  <Eye className="w-3.5 h-3.5 text-[#706d8d]" />
                  <span>Continuity Oracle</span>
                </button>
              </li>
            </ul>
          </div>

          {/* Column 3: Architecture & Next Phase */}
          <div>
            <h4 className="font-cinzel text-xs font-bold uppercase tracking-widest text-[#f0ece2] mb-4">
              Database Architecture
            </h4>
            <ul className="space-y-2.5 text-xs font-mono">
              <li className="flex items-center gap-1.5 text-[#8885a6]">
                <Database className="w-3.5 h-3.5 text-[#d4af37]" />
                <span>PostgreSQL Prepared</span>
              </li>
              <li className="flex items-center gap-1.5 text-[#8885a6]">
                <Code2 className="w-3.5 h-3.5 text-[#d4af37]" />
                <span>Next.js App Router</span>
              </li>
              <li className="flex items-center gap-1.5 text-[#8885a6]">
                <Shield className="w-3.5 h-3.5 text-[#d4af37]" />
                <span>Type-Safe Schemas</span>
              </li>
              <li className="flex items-center gap-1.5 text-[#8885a6]">
                <Sparkles className="w-3.5 h-3.5 text-[#d4af37]" />
                <span>Framer Motion Engine</span>
              </li>
            </ul>
          </div>

          {/* Column 4: Exemplar Realms */}
          <div>
            <h4 className="font-cinzel text-xs font-bold uppercase tracking-widest text-[#f0ece2] mb-4">
              Canon Archives
            </h4>
            <ul className="space-y-2.5 text-xs font-mono">
              <li>
                <button
                  onClick={() => scrollTo("archive-nexus")}
                  className="hover:text-[#fae48f] transition-colors text-left cursor-pointer"
                >
                  Aethelgard (Astral Shards)
                </button>
              </li>
              <li>
                <button
                  onClick={() => scrollTo("archive-nexus")}
                  className="hover:text-[#fae48f] transition-colors text-left cursor-pointer"
                >
                  The Oxenford Scriptorium
                </button>
              </li>
              <li>
                <button
                  onClick={() => scrollTo("archive-nexus")}
                  className="hover:text-[#fae48f] transition-colors text-left cursor-pointer"
                >
                  The Sunken Citadel of Astris
                </button>
              </li>
              <li>
                <button
                  onClick={() => scrollTo("continuity-oracle")}
                  className="hover:text-[#fae48f] transition-colors text-left cursor-pointer"
                >
                  Paradox Anachronism Registry
                </button>
              </li>
            </ul>
          </div>
        </div>

        {/* Bottom Bar with Status Telemetry */}
        <div className="pt-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs font-mono text-[#676582]">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-400" />
            <span>Archive Status: Stable • Causal Alignment 99.98% • Era IV</span>
          </div>

          <div>
            &copy; 2026 WORLDBUILD. Crafted for Creators of Fictional Universes.
          </div>
        </div>
      </div>
    </footer>
  );
}
