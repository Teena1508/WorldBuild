"use client";

import React, { useState } from "react";
import { BookOpen, Sparkles } from "lucide-react";

export interface BookCoverProps {
  src?: string | null;
  alt?: string;
  title?: string;
  author?: string;
  aspect?: "portrait" | "landscape" | "square" | "free";
  className?: string;
  showTitleOverlay?: boolean;
}

export function BookCover({
  src,
  alt = "Book Cover",
  title,
  author,
  aspect = "portrait",
  className = "",
  showTitleOverlay = false,
}: BookCoverProps) {
  const [hasError, setHasError] = useState(false);
  const [prevSrc, setPrevSrc] = useState(src);

  if (src !== prevSrc) {
    setPrevSrc(src);
    setHasError(false);
  }

  const aspectClass = {
    portrait: "aspect-[3/4]",
    landscape: "aspect-[16/9]",
    square: "aspect-square",
    free: "h-full w-full",
  }[aspect];

  const isBlank = !src || src.trim() === "" || hasError;

  if (isBlank) {
    return (
      <div
        className={`relative w-full ${aspectClass} rounded-xl overflow-hidden border border-[#d4af37]/40 bg-gradient-to-br from-[#0b1026] via-[#060814] to-[#120a21] flex flex-col items-center justify-between p-4 sm:p-6 text-center select-none shadow-[inset_0_0_40px_rgba(0,0,0,0.8)] ${className}`}
      >
        {/* Celestial Starfield Background Pattern */}
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(212,175,55,0.12)_0%,transparent_70%)] pointer-events-none" />

        {/* Concentric Astrolabe Circles */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-20">
          <div className="w-48 h-48 rounded-full border border-[#d4af37]" />
          <div className="w-36 h-36 rounded-full border border-dashed border-[#fae48f]" />
          <div className="w-24 h-24 rounded-full border border-[#d4af37]" />
        </div>

        {/* Corner Filigree Ornaments */}
        <div className="absolute top-2 left-2 w-4 h-4 border-t-2 border-l-2 border-[#d4af37]/60 pointer-events-none" />
        <div className="absolute top-2 right-2 w-4 h-4 border-t-2 border-r-2 border-[#d4af37]/60 pointer-events-none" />
        <div className="absolute bottom-2 left-2 w-4 h-4 border-b-2 border-l-2 border-[#d4af37]/60 pointer-events-none" />
        <div className="absolute bottom-2 right-2 w-4 h-4 border-b-2 border-r-2 border-[#d4af37]/60 pointer-events-none" />

        {/* Top Header Badge */}
        <div className="relative z-10 pt-1 flex items-center gap-1.5 text-[9px] font-mono tracking-[0.25em] uppercase text-[#fae48f]/70">
          <Sparkles className="w-2.5 h-2.5 text-[#d4af37]" />
          <span>Sanctum Tome</span>
        </div>

        {/* Center Emblem & Title */}
        <div className="relative z-10 flex flex-col items-center my-auto px-2 space-y-2">
          <div className="w-12 h-12 rounded-full border border-[#d4af37]/40 bg-[#0e1430] flex items-center justify-center text-[#fae48f] shadow-[0_0_15px_rgba(212,175,55,0.25)]">
            <BookOpen className="w-5 h-5 text-[#fae48f]" />
          </div>
          {title ? (
            <h3 className="font-cinzel text-sm sm:text-base font-bold text-transparent bg-clip-text bg-gradient-to-r from-[#fae48f] via-[#f0db84] to-[#a8892d] line-clamp-2 uppercase tracking-wider leading-snug">
              {title}
            </h3>
          ) : (
            <h3 className="font-cinzel text-xs sm:text-sm font-bold text-[#e0ddcf] tracking-widest uppercase">
              Celestial Archive
            </h3>
          )}
          {author && (
            <span className="text-[10px] font-mono text-[#a3a0be] line-clamp-1">
              By {author}
            </span>
          )}
        </div>

        {/* Bottom Sovereign Seal */}
        <div className="relative z-10 pb-0.5">
          <span className="text-[8px] font-mono tracking-[0.3em] uppercase text-[#73708e]">
            WORLDBUILD CANON
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className={`relative w-full ${aspectClass} overflow-hidden bg-[#070b1e] ${className}`}>
      {/* Real Image with automatic error fallback */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={alt || title || "Book cover"}
        onError={() => setHasError(true)}
        className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
        loading="lazy"
      />

      {/* Subtle Bottom Vignette for Cinematic Depth */}
      <div className="absolute inset-0 bg-gradient-to-t from-[#050814]/80 via-transparent to-black/20 pointer-events-none" />

      {/* Optional Title Overlay */}
      {showTitleOverlay && title && (
        <div className="absolute bottom-0 inset-x-0 p-3 bg-gradient-to-t from-[#04060f] via-[#04060f]/80 to-transparent">
          <h4 className="font-cinzel text-xs font-bold text-[#fae48f] truncate">{title}</h4>
          {author && <p className="text-[10px] font-mono text-[#8a87a8] truncate">By {author}</p>}
        </div>
      )}
    </div>
  );
}
