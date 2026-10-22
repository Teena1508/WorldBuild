"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { X, Compass, BookOpen, ArrowRight, Plus, Library } from "lucide-react";

interface UniverseLauncherModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectUniverse?: (slug: string) => void;
}

export function UniverseLauncherModal({ isOpen, onClose, onSelectUniverse }: UniverseLauncherModalProps) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<"vault" | "custom" | "demo">("vault");
  const [customRealmName, setCustomRealmName] = useState("");
  const [customDescription, setCustomDescription] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const handleOpenVault = () => {
    setStatusMessage("Opening your personal World Vault...");
    setTimeout(() => {
      onClose();
      router.push("/vault");
    }, 300);
  };

  const handleOpenDemoBook = () => {
    setStatusMessage("Opening the Exemplar Demo Lorebook (Aethelgard)...");
    setTimeout(() => {
      onSelectUniverse?.("univ-demo-aethelgard");
      onClose();
      router.push("/vault/univ-demo-aethelgard");
    }, 300);
  };

  const handleCreateNewStory = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = customRealmName.trim();
    if (!name) {
      setStatusMessage("Please designate a realm or universe title.");
      return;
    }
    try {
      setIsSubmitting(true);
      setStatusMessage("Inscribing celestial continuum into the database...");
      const res = await fetch("/api/universes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: name,
          description: customDescription.trim() || "A nascent personal story continuum.",
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to create universe");
      onSelectUniverse?.(data.universe.id);
      onClose();
      router.push(`/vault/${data.universe.id}`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Creation failed";
      setStatusMessage(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 overflow-y-auto">
        {/* Backdrop */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="fixed inset-0 bg-black/80 backdrop-blur-md"
        />

        {/* Modal Window */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 15 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 15 }}
          transition={{ duration: 0.25, ease: "easeOut" }}
          className="relative w-full max-w-2xl rounded-2xl border border-[#d4af37]/35 bg-[#080c1d] p-6 sm:p-8 shadow-[0_0_60px_rgba(0,0,0,0.85)] z-10"
        >
          {/* Header */}
          <div className="flex items-start justify-between pb-3 border-b border-[#1b2347]">
            <div>
              <div className="inline-flex items-center gap-2 px-2.5 py-0.5 rounded-full border border-[#d4af37]/30 bg-[#0e1432] text-[10px] font-mono tracking-widest uppercase text-[#fae48f] mb-1.5">
                <Compass className="w-3 h-3 text-[#fae48f]" />
                <span>Astral Transit Gateway</span>
              </div>
              <h3 className="font-cinzel text-xl sm:text-2xl font-bold text-[#faf8f2]">
                Enter Your Universe
              </h3>
              <p className="font-cormorant text-sm sm:text-base text-[#a3a2c0] mt-0.5">
                Navigate directly to your personal story vault, forge a new canon, or consult the exemplar demo book.
              </p>
            </div>
            <button
              onClick={onClose}
              id="close-universe-modal"
              className="p-1.5 rounded-lg text-[#8886a8] hover:text-[#fae48f] hover:bg-[#151c36] transition-colors cursor-pointer"
              aria-label="Close dialog"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Navigation Tabs */}
          <div className="flex gap-4 border-b border-[#202742] my-4 text-xs font-mono">
            <button
              onClick={() => setActiveTab("vault")}
              className={`pb-2.5 tracking-wider uppercase transition-colors relative cursor-pointer flex items-center gap-1.5 ${
                activeTab === "vault" ? "text-[#fae48f] font-semibold" : "text-[#8786a3] hover:text-[#d3d0e8]"
              }`}
            >
              <Library className="w-3.5 h-3.5" />
              <span>Your Sovereign Vault</span>
              {activeTab === "vault" && (
                <motion.div
                  layoutId="tab-underline"
                  className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#fae48f]"
                />
              )}
            </button>

            <button
              onClick={() => setActiveTab("custom")}
              className={`pb-2.5 tracking-wider uppercase transition-colors relative cursor-pointer flex items-center gap-1.5 ${
                activeTab === "custom" ? "text-[#fae48f] font-semibold" : "text-[#8786a3] hover:text-[#d3d0e8]"
              }`}
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Forge New Canon</span>
              {activeTab === "custom" && (
                <motion.div
                  layoutId="tab-underline"
                  className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#fae48f]"
                />
              )}
            </button>

            <button
              onClick={() => setActiveTab("demo")}
              className={`pb-2.5 tracking-wider uppercase transition-colors relative cursor-pointer flex items-center gap-1.5 ${
                activeTab === "demo" ? "text-[#fae48f] font-semibold" : "text-[#8786a3] hover:text-[#d3d0e8]"
              }`}
            >
              <BookOpen className="w-3.5 h-3.5 text-purple-400" />
              <span>Exemplar Demo Book</span>
              <span className="text-[9px] px-1.5 py-0.2 rounded-full border border-purple-500/40 bg-purple-950/40 text-purple-300">
                Sample
              </span>
              {activeTab === "demo" && (
                <motion.div
                  layoutId="tab-underline"
                  className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#fae48f]"
                />
              )}
            </button>
          </div>

          {/* Content Area */}
          {activeTab === "vault" && (
            <div className="space-y-4 my-4">
              <div className="p-5 rounded-xl border border-[#232d59] bg-[#0c122c]/80 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div className="space-y-1">
                  <div className="font-cinzel text-base font-bold text-[#faf8f2]">
                    Enter Your Personal Workspaces
                  </div>
                  <p className="font-cormorant text-sm text-[#b8b5cc]">
                    Open your World Vault to manage your private stories, view active continuity findings, and map custom character graphs.
                  </p>
                </div>
                <button
                  onClick={handleOpenVault}
                  className="gold-glow-button px-5 py-2.5 rounded-xl text-xs font-mono uppercase tracking-wider font-semibold text-[#fae48f] shrink-0 cursor-pointer flex items-center gap-2"
                >
                  <span>Open Vault</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>

              <div className="p-4 rounded-xl border border-[#1a2140] bg-[#060918]/60 text-xs font-mono text-[#8280a0] flex items-center justify-between">
                <span>Want to switch scribe identities?</span>
                <button
                  onClick={() => {
                    onClose();
                    router.push("/login");
                  }}
                  className="text-[#fae48f] hover:underline"
                >
                  Sign In / Switch Scribe →
                </button>
              </div>
            </div>
          )}

          {activeTab === "custom" && (
            <form onSubmit={handleCreateNewStory} className="space-y-4 my-4 p-5 rounded-xl border border-[#212847] bg-[#0b0f24]">
              <div>
                <label className="block text-xs font-mono tracking-wider uppercase text-[#fae48f] mb-1.5">
                  Designate Realm / Universe Title *
                </label>
                <input
                  type="text"
                  required
                  value={customRealmName}
                  onChange={(e) => setCustomRealmName(e.target.value)}
                  placeholder="e.g. The Chrono-Spire of Avernus"
                  className="w-full px-3.5 py-2.5 rounded-lg bg-[#060814] border border-[#27325c] text-sm text-[#f5f2e9] placeholder-[#5f5e7c] focus:outline-none focus:border-[#fae48f]"
                />
              </div>

              <div>
                <label className="block text-xs font-mono tracking-wider uppercase text-[#c4c1dc] mb-1.5">
                  Cosmology Description / Premise
                </label>
                <textarea
                  rows={3}
                  value={customDescription}
                  onChange={(e) => setCustomDescription(e.target.value)}
                  placeholder="A celestial realm bound by strict astrological causality and clockwork ley lines..."
                  className="w-full px-3.5 py-2.5 rounded-lg bg-[#060814] border border-[#27325c] text-xs font-mono text-[#f5f2e9] placeholder-[#5f5e7c] focus:outline-none focus:border-[#fae48f]"
                />
              </div>

              <button
                type="submit"
                disabled={isSubmitting || !customRealmName.trim()}
                className="w-full py-3 rounded-xl gold-glow-button text-xs font-mono uppercase tracking-widest font-semibold text-[#fae48f] transition-all disabled:opacity-50 cursor-pointer flex items-center justify-center gap-2"
              >
                <span>{isSubmitting ? "Inscribing..." : "Forge & Enter Story"}</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </form>
          )}

          {activeTab === "demo" && (
            <div className="space-y-4 my-4">
              <div className="p-5 rounded-xl border border-purple-500/30 bg-purple-950/20 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="font-cinzel text-lg font-bold text-[#faf8f2] flex items-center gap-2">
                    <BookOpen className="w-4 h-4 text-purple-400" />
                    <span>The Chronicles of Aethelgard</span>
                  </div>
                  <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded border border-purple-400/40 bg-purple-900/40 text-purple-200">
                    Canonical Sample Book
                  </span>
                </div>
                <p className="font-cormorant text-sm text-[#c7c4db] leading-relaxed">
                  A complete exemplar lorebook containing high-tier characters, historical events, secret knowledge graphs, and live paradoxes illustrating the Continuity Oracle rules engine in action.
                </p>
                <div className="flex flex-wrap items-center gap-3 pt-2 text-xs font-mono text-[#9e9cb8]">
                  <span>10 Characters</span>
                  <span>•</span>
                  <span>11 Historical Events</span>
                  <span>•</span>
                  <span>3 Active Paradoxes</span>
                  <span>•</span>
                  <span className="text-amber-300">Read-Only Sample</span>
                </div>
                <div className="pt-2 flex items-center justify-end">
                  <button
                    onClick={handleOpenDemoBook}
                    className="px-4 py-2 rounded-lg border border-purple-500/50 bg-purple-900/50 hover:bg-purple-800 text-xs font-mono uppercase text-purple-200 transition-all cursor-pointer flex items-center gap-2"
                  >
                    <span>Read Demo Lorebook</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Status Message */}
          {statusMessage && (
            <motion.div
              initial={{ opacity: 0, y: 5 }}
              animate={{ opacity: 1, y: 0 }}
              className="p-3 mb-4 rounded-lg border border-[#fae48f]/30 bg-[#161c3c] text-xs font-mono text-[#fae48f] text-center"
            >
              {statusMessage}
            </motion.div>
          )}

          {/* Footer Actions */}
          <div className="flex items-center justify-between pt-4 border-t border-[#202742]">
            <button
              onClick={handleOpenVault}
              className="text-xs font-mono text-[#fae48f] hover:underline cursor-pointer"
            >
              Go to World Vault →
            </button>
            <button
              onClick={onClose}
              className="px-4 py-2 text-xs font-mono tracking-wider uppercase text-[#8886a8] hover:text-[#d3d0e8] transition-colors cursor-pointer"
            >
              Close
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
