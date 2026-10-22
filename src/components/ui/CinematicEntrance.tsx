"use client";

import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Sparkles, ArrowRight } from "lucide-react";

interface CinematicEntranceProps {
  onComplete?: () => void;
  forceShow?: boolean;
}

export function CinematicEntrance({ onComplete, forceShow = false }: CinematicEntranceProps) {
  const [isOpen, setIsOpen] = useState(true);
  const [hasCheckedStorage, setHasCheckedStorage] = useState(false);

  const handleDismiss = React.useCallback(() => {
    if (typeof window !== "undefined") {
      sessionStorage.setItem("worldbuild_prologue_seen", "true");
    }
    setIsOpen(false);
    onComplete?.();
  }, [onComplete]);

  useEffect(() => {
    const hasSeen = typeof window !== "undefined" ? sessionStorage.getItem("worldbuild_prologue_seen") : null;
    if (hasSeen && !forceShow) {
      setIsOpen(false);
      setHasCheckedStorage(true);
      onComplete?.();
      return;
    }

    setIsOpen(true);
    setHasCheckedStorage(true);

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        handleDismiss();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [forceShow, handleDismiss, onComplete]);

  if (!hasCheckedStorage || !isOpen) return null;

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 1 }}
          exit={{ opacity: 0, transition: { duration: 1.1, ease: [0.16, 1, 0.3, 1] } }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-[#030407] text-[#e8e4d8] overflow-hidden"
          role="dialog"
          aria-label="Prologue Sequence"
        >
          {/* Subtle cosmic radial glow */}
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(40,45,95,0.35)_0%,rgba(3,4,7,0.95)_70%)]" />

          {/* Aperture ring animation */}
          <motion.div
            initial={{ scale: 0.7, rotate: 0, opacity: 0 }}
            animate={{ scale: 1.1, rotate: 360, opacity: [0, 0.6, 0.35] }}
            transition={{
              rotate: { repeat: Infinity, duration: 40, ease: "linear" },
              scale: { duration: 1.6, ease: "easeOut" },
              opacity: { duration: 1.6, ease: "easeOut" },
            }}
            className="absolute w-[500px] h-[500px] rounded-full border border-[#d4af37]/30 border-dashed pointer-events-none"
          />

          <motion.div
            initial={{ scale: 0.9, rotate: 0, opacity: 0 }}
            animate={{ scale: 1.35, rotate: -360, opacity: [0, 0.45, 0.2] }}
            transition={{
              rotate: { repeat: Infinity, duration: 55, ease: "linear" },
              scale: { duration: 1.8, ease: "easeOut" },
              opacity: { duration: 1.8, ease: "easeOut" },
            }}
            className="absolute w-[360px] h-[360px] rounded-full border border-[#c4c1e0]/20 pointer-events-none"
          />

          {/* Centered prologue message */}
          <div className="relative z-10 text-center max-w-lg px-6">
            <motion.div
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: 0.2 }}
              className="inline-flex items-center gap-2 px-3 py-1 mb-6 rounded-full border border-[#d4af37]/30 bg-[#0d1226]/60 backdrop-blur-md text-[11px] tracking-[0.25em] uppercase text-[#fae48f] font-mono"
            >
              <Sparkles className="w-3.5 h-3.5 text-[#fae48f]" />
              <span>Sanctum Entrance</span>
            </motion.div>

            <motion.h2
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.9, delay: 0.4 }}
              className="font-cinzel text-2xl md:text-3xl lg:text-4xl tracking-wide font-normal gold-gradient-text mb-4"
            >
              The Celestial Archive Awakens
            </motion.h2>

            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.85 }}
              transition={{ duration: 0.9, delay: 0.7 }}
              className="font-cormorant text-lg md:text-xl italic text-[#cfceea] font-light leading-relaxed mb-8"
            >
              &ldquo;Before the first word was written, the stars were already weaving the tapestry of cause and consequence.&rdquo;
            </motion.p>

            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.9 }}
              className="flex items-center justify-center gap-4"
            >
              <button
                onClick={handleDismiss}
                id="skip-prologue-btn"
                className="group inline-flex items-center gap-2 px-5 py-2 rounded-full text-xs font-mono tracking-widest uppercase border border-[#d4af37]/40 bg-[#12162e]/70 text-[#fae48f] hover:border-[#fae48f] hover:bg-[#1a2044] transition-all cursor-pointer"
              >
                <span>Enter Archive</span>
                <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
              </button>
            </motion.div>
          </div>

          {/* Quick Skip button in top right */}
          <button
            onClick={handleDismiss}
            aria-label="Skip prologue animation"
            className="absolute top-6 right-6 text-xs font-mono tracking-wider text-[#9f9ebb] hover:text-[#fae48f] transition-colors uppercase px-3 py-1.5 rounded border border-[#232845] hover:border-[#d4af37]/40 z-20 cursor-pointer"
          >
            Skip Prologue [ESC]
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
