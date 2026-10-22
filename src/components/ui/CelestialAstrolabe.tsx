"use client";

import React from "react";

interface AstrolabeProps {
  className?: string;
  size?: number;
}

export function CelestialAstrolabe({ className = "", size = 680 }: AstrolabeProps) {
  return (
    <div
      className={`relative flex items-center justify-center pointer-events-none select-none ${className}`}
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      {/* Outer ambient glow */}
      <div className="absolute inset-0 rounded-full bg-gradient-to-tr from-[#d4af37]/5 via-[#4a3b82]/10 to-transparent blur-3xl opacity-60" />

      {/* Layer 1: Outermost Constellation Ring (Slow Rotation) */}
      <svg
        viewBox="0 0 500 500"
        className="absolute inset-0 w-full h-full animate-spin-slow opacity-45"
      >
        <circle
          cx="250"
          cy="250"
          r="238"
          fill="none"
          stroke="rgba(212, 175, 55, 0.28)"
          strokeWidth="1.2"
          strokeDasharray="4 6"
        />
        <circle
          cx="250"
          cy="250"
          r="228"
          fill="none"
          stroke="rgba(212, 175, 55, 0.45)"
          strokeWidth="1"
        />

        {/* 36 Zodiac / Celestial Meridian Ticks */}
        {Array.from({ length: 36 }).map((_, i) => {
          const isMajor = i % 3 === 0;
          const r1 = 228;
          const r2 = isMajor ? 216 : 222;
          return (
            <line
              key={i}
              x1="250"
              y1={250 - r1}
              x2="250"
              y2={250 - r2}
              transform={`rotate(${i * 10} 250 250)`}
              stroke="rgba(250, 228, 143, 0.6)"
              strokeWidth={isMajor ? "1.5" : "0.75"}
            />
          );
        })}

        {/* 4 Cardinal Diamond Sigils */}
        {[0, 90, 180, 270].map((deg) => (
          <g key={deg} transform={`rotate(${deg} 250 250)`}>
            <polygon
              points="250,14 254,22 250,30 246,22"
              fill="rgba(250, 228, 143, 0.85)"
            />
            <circle cx="250" cy="22" r="1.5" fill="#040509" />
          </g>
        ))}
      </svg>

      {/* Layer 2: Middle Armillary Ring (Reverse Rotation) */}
      <svg
        viewBox="0 0 500 500"
        className="absolute inset-0 w-full h-full animate-spin-reverse-slow opacity-60"
      >
        <circle
          cx="250"
          cy="250"
          r="185"
          fill="none"
          stroke="rgba(212, 175, 55, 0.35)"
          strokeWidth="1.2"
        />
        <circle
          cx="250"
          cy="250"
          r="175"
          fill="none"
          stroke="rgba(207, 208, 245, 0.2)"
          strokeWidth="0.8"
          strokeDasharray="2 8"
        />

        {/* Intersecting Sacred Geometry Triangles */}
        <polygon
          points="250,75 397,330 103,330"
          fill="none"
          stroke="rgba(212, 175, 55, 0.22)"
          strokeWidth="1"
        />
        <polygon
          points="250,425 103,170 397,170"
          fill="none"
          stroke="rgba(212, 175, 55, 0.22)"
          strokeWidth="1"
        />

        {/* Constellation nodes along circle */}
        {[30, 75, 120, 165, 210, 255, 300, 345].map((angleDeg) => (
          <g key={angleDeg} transform={`rotate(${angleDeg} 250 250)`}>
            <circle cx="435" cy="250" r="3" fill="#fae48f" />
            <circle cx="435" cy="250" r="6" fill="none" stroke="rgba(250, 228, 143, 0.4)" strokeWidth="0.8" />
          </g>
        ))}
      </svg>

      {/* Layer 3: Inner Orbital Core & Moon Phase Astrolabe */}
      <svg
        viewBox="0 0 500 500"
        className="absolute inset-0 w-full h-full animate-cosmic-pulse opacity-75"
      >
        <circle
          cx="250"
          cy="250"
          r="110"
          fill="rgba(10, 14, 30, 0.4)"
          stroke="rgba(250, 228, 143, 0.45)"
          strokeWidth="1.5"
        />
        <circle
          cx="250"
          cy="250"
          r="72"
          fill="none"
          stroke="rgba(212, 175, 55, 0.25)"
          strokeWidth="1"
          strokeDasharray="6 4"
        />
        {/* Core Star / Eye of the Scribe */}
        <circle cx="250" cy="250" r="14" fill="url(#coreGoldGrad)" />
        <circle cx="250" cy="250" r="4" fill="#ffffff" />

        {/* Ray Lines */}
        <line x1="250" y1="140" x2="250" y2="360" stroke="rgba(212, 175, 55, 0.3)" strokeWidth="0.8" />
        <line x1="140" y1="250" x2="360" y2="250" stroke="rgba(212, 175, 55, 0.3)" strokeWidth="0.8" />
        <line x1="172" y1="172" x2="328" y2="328" stroke="rgba(212, 175, 55, 0.2)" strokeWidth="0.6" strokeDasharray="3 3" />
        <line x1="328" y1="172" x2="172" y2="328" stroke="rgba(212, 175, 55, 0.2)" strokeWidth="0.6" strokeDasharray="3 3" />

        <defs>
          <radialGradient id="coreGoldGrad" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#fff8e7" />
            <stop offset="60%" stopColor="#fae48f" />
            <stop offset="100%" stopColor="#9e7b1a" />
          </radialGradient>
        </defs>
      </svg>
    </div>
  );
}
