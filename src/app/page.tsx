"use client";

import React, { useState } from "react";
import { StarfieldCanvas } from "@/components/ui/StarfieldCanvas";
import { CinematicEntrance } from "@/components/ui/CinematicEntrance";
import { UniverseLauncherModal } from "@/components/ui/UniverseLauncherModal";
import { Navbar } from "@/components/ui/Navbar";
import { Hero } from "@/components/ui/Hero";
import { NexusExplorer } from "@/components/ui/NexusExplorer";
import { PillarsShowcase } from "@/components/ui/PillarsShowcase";
import { ContinuityOracleDemo } from "@/components/ui/ContinuityOracleDemo";
import { ClosingCTA } from "@/components/ui/ClosingCTA";
import { Footer } from "@/components/ui/Footer";

export default function Home() {
  const [isUniverseModalOpen, setIsUniverseModalOpen] = useState(false);
  const [forceShowPrologue, setForceShowPrologue] = useState(false);

  const handleOpenUniverseModal = () => {
    setIsUniverseModalOpen(true);
  };

  const handleReplayPrologue = () => {
    sessionStorage.removeItem("worldbuild_prologue_seen");
    setForceShowPrologue(true);
  };

  const handleDiscoverOracle = () => {
    const el = document.getElementById("continuity-oracle");
    if (el) {
      el.scrollIntoView({ behavior: "smooth" });
    }
  };

  return (
    <div className="relative min-h-screen bg-[#040509] text-[#e0ddcf] selection:bg-[#d4af37]/30 selection:text-[#fae48f] overflow-x-hidden">
      {/* Dynamic Starfield Particles Layer */}
      <StarfieldCanvas />

      {/* Cinematic Prologue Entrance with Skip Option */}
      <CinematicEntrance
        forceShow={forceShowPrologue}
        onComplete={() => setForceShowPrologue(false)}
      />

      {/* Interactive Universe Launcher Modal */}
      <UniverseLauncherModal
        isOpen={isUniverseModalOpen}
        onClose={() => setIsUniverseModalOpen(false)}
      />

      {/* Main Celestial Navigation */}
      <Navbar
        onOpenUniverseModal={handleOpenUniverseModal}
        onReplayPrologue={handleReplayPrologue}
      />

      {/* Main Page Flow */}
      <main>
        {/* Cinematic Hero */}
        <Hero
          onEnterArchive={handleOpenUniverseModal}
          onDiscoverOracle={handleDiscoverOracle}
        />

        {/* Interactive Interconnected Nexus */}
        <NexusExplorer />

        {/* The Four Core Pillars */}
        <PillarsShowcase />

        {/* Interactive Continuity Oracle Simulator */}
        <ContinuityOracleDemo />

        {/* Closing Celestial Portal Call-to-Action */}
        <ClosingCTA onOpenUniverseModal={handleOpenUniverseModal} />
      </main>

      {/* Celestial Dark Academia Footer */}
      <Footer />
    </div>
  );
}
