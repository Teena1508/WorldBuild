"use client";

import React, { useState } from "react";
import {
  Eye,
  AlertTriangle,
  CheckCircle,
  Sparkles,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";
import { SAMPLE_CONTRADICTIONS } from "@/lib/data/sample-universe";
import { ContinuityContradiction } from "@/types/worldbuild";

export function ContinuityOracleDemo() {
  const [contradictions] = useState<ContinuityContradiction[]>(SAMPLE_CONTRADICTIONS);
  const [selectedParadoxId, setSelectedParadoxId] = useState<string>("paradox-714");
  const [resolvedStatus, setResolvedStatus] = useState<Record<string, { resolved: boolean; chosenOption?: string }>>({});
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [integrityScore, setIntegrityScore] = useState(98.7);

  const selectedParadox = contradictions.find((c) => c.id === selectedParadoxId) || contradictions[0];
  const isSelectedResolved = resolvedStatus[selectedParadox?.id]?.resolved;

  const handleApplyResolution = (resolutionId: string, label: string) => {
    setIsAnalyzing(true);
    setTimeout(() => {
      setResolvedStatus((prev) => ({
        ...prev,
        [selectedParadox.id]: {
          resolved: true,
          chosenOption: label,
        },
      }));
      setIntegrityScore((prev) => Math.min(100, Number((prev + 0.65).toFixed(1))));
      setIsAnalyzing(false);
    }, 700);
  };

  const handleReset = () => {
    setResolvedStatus({});
    setIntegrityScore(98.7);
  };

  return (
    <section id="continuity-oracle" className="relative py-28 px-4 sm:px-6 lg:px-8 border-t border-[#181f38] bg-[#050713]">
      {/* Background celestial glow */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[500px] bg-[radial-gradient(circle_at_center,rgba(40,45,95,0.22)_0%,transparent_70%)] blur-3xl pointer-events-none" />

      <div className="relative z-10 max-w-7xl mx-auto">
        {/* Section Header */}
        <div className="text-center max-w-3xl mx-auto mb-16">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-[#d4af37]/30 bg-[#0c1126] text-[11px] font-mono tracking-[0.25em] uppercase text-[#fae48f] mb-4">
            <Eye className="w-3.5 h-3.5" />
            <span>Interactive Causality Engine</span>
          </div>
          <h2 className="font-cinzel text-3xl sm:text-5xl font-bold tracking-tight text-[#fbf9f4] mb-4">
            The Continuity Oracle
          </h2>
          <p className="font-cormorant text-lg sm:text-xl text-[#b8b5cc] font-light leading-relaxed">
            Test the live contradiction engine. Inspect simulated temporal paradoxes and magic axiom breaches below, choose a resolution vector, and witness real-time causal reconciliation.
          </p>
        </div>

        {/* Oracle Dashboard Frame */}
        <div className="celestial-card rounded-2xl border border-[#d4af37]/25 shadow-2xl overflow-hidden">
          {/* Top Terminal Status Header */}
          <div className="bg-[#090d22] px-6 py-4 border-b border-[#1c2446] flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
                <span className="w-2 h-2 rounded-full bg-[#3c446e]" />
                <span className="w-2 h-2 rounded-full bg-[#3c446e]" />
              </div>
              <span className="font-mono text-xs text-[#fae48f] tracking-wider uppercase font-semibold">
                ORACLE CAUSAL MONITOR • SYNOD V4.2
              </span>
            </div>

            <div className="flex items-center gap-4 text-xs font-mono">
              <div className="flex items-center gap-1.5 text-[#dedbd0]">
                <ShieldCheck className="w-3.5 h-3.5 text-[#58d68d]" />
                <span>Universe Integrity:</span>
                <span className="font-bold text-[#58d68d]">{integrityScore}%</span>
              </div>

              <button
                onClick={handleReset}
                className="flex items-center gap-1 text-[#8784a6] hover:text-[#fae48f] transition-colors cursor-pointer"
                title="Reset simulation"
              >
                <RefreshCw className="w-3 h-3" />
                <span>Reset Simulation</span>
              </button>
            </div>
          </div>

          {/* Main Interactive Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-12 divide-y lg:divide-y-0 lg:divide-x divide-[#1c2446]">
            {/* Left Column: List of Detected Contradictions */}
            <div className="lg:col-span-5 p-6 bg-[#060817]/60 space-y-4">
              <div className="flex items-center justify-between text-xs font-mono text-[#8b88ab] uppercase tracking-wider mb-2">
                <span>Active Anomalies Queue</span>
                <span>{contradictions.length} Flagged</span>
              </div>

              {contradictions.map((paradox) => {
                const isSelected = paradox.id === selectedParadoxId;
                const isResolved = resolvedStatus[paradox.id]?.resolved;

                return (
                  <div
                    key={paradox.id}
                    onClick={() => setSelectedParadoxId(paradox.id)}
                    className={`p-4 rounded-xl border transition-all cursor-pointer relative overflow-hidden ${
                      isSelected
                        ? "border-[#fae48f] bg-[#121838] shadow-[0_0_20px_rgba(212,175,55,0.15)]"
                        : "border-[#1b2344] bg-[#090d22]/50 hover:border-[#2f3b6c] hover:bg-[#0d122c]"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <span className="font-mono text-[11px] font-semibold tracking-wider text-[#fae48f]">
                        {paradox.code}
                      </span>
                      {isResolved ? (
                        <span className="inline-flex items-center gap-1 text-[10px] font-mono tracking-widest uppercase px-2 py-0.5 rounded border border-emerald-500/40 bg-emerald-950/40 text-emerald-300">
                          <CheckCircle className="w-3 h-3" />
                          Resolved
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[10px] font-mono tracking-widest uppercase px-2 py-0.5 rounded border border-rose-500/40 bg-rose-950/40 text-rose-300">
                          <AlertTriangle className="w-3 h-3" />
                          {paradox.severity}
                        </span>
                      )}
                    </div>

                    <h4 className="font-cinzel text-sm sm:text-base font-semibold text-[#f2ede4] mb-1 line-clamp-1">
                      {paradox.title}
                    </h4>

                    <p className="font-cormorant text-xs text-[#8c89a8] line-clamp-2 leading-relaxed">
                      {paradox.explanation}
                    </p>

                    <div className="mt-3 pt-2 border-t border-[#1a213e] flex items-center justify-between text-[11px] font-mono text-[#6c6988]">
                      <span>{paradox.detectedAtTimeline}</span>
                      <span>{paradox.affectedEntities.length} Entities</span>
                    </div>
                  </div>
                );
              })}

              <div className="p-3.5 rounded-lg border border-[#1b2344] bg-[#090d20] text-xs font-mono text-[#787596]">
                💡 Tip: The Continuity Oracle continuously checks manuscript drafts against established World Vault axioms and chronology dates.
              </div>
            </div>

            {/* Right Column: Deep Inspection & Resolution Center */}
            <div className="lg:col-span-7 p-6 sm:p-8 bg-[#080b1e]/90">
              {selectedParadox && (
                <div>
                  {/* Paradox Dossier Header */}
                  <div className="flex items-center justify-between pb-4 border-b border-[#1c2446] mb-5">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-mono text-xs uppercase tracking-wider text-[#fae48f]">
                          {selectedParadox.code}
                        </span>
                        <span className="text-xs text-[#525070]">•</span>
                        <span className="font-mono text-xs text-[#8582a4]">
                          {selectedParadox.category.replace("_", " ").toUpperCase()}
                        </span>
                      </div>
                      <h3 className="font-cinzel text-xl sm:text-2xl font-bold text-[#faf8f2]">
                        {selectedParadox.title}
                      </h3>
                    </div>

                    {isSelectedResolved && (
                      <div className="text-right">
                        <span className="inline-flex items-center gap-1 text-xs font-mono tracking-widest uppercase px-3 py-1 rounded-full border border-emerald-400 bg-emerald-950 text-emerald-300 font-semibold shadow-[0_0_12px_rgba(52,211,153,0.3)]">
                          <CheckCircle className="w-3.5 h-3.5" />
                          Harmonized
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Detailed Analysis Callout */}
                  <div className="p-4 rounded-xl border border-rose-500/25 bg-rose-950/15 text-sm font-cormorant text-[#f0dede] leading-relaxed mb-6">
                    <div className="font-mono text-[10px] uppercase tracking-wider text-rose-300 font-semibold mb-1 flex items-center gap-1.5">
                      <AlertTriangle className="w-3.5 h-3.5 text-rose-400" />
                      <span>Causal Conflict Breakdown:</span>
                    </div>
                    {selectedParadox.explanation}
                  </div>

                  {/* Affected Entities Chips */}
                  <div className="mb-6">
                    <span className="text-xs font-mono tracking-wider uppercase text-[#817f9e] block mb-2">
                      Entities Caught in Contradiction:
                    </span>
                    <div className="flex flex-wrap gap-2">
                      {selectedParadox.affectedEntities.map((ent) => (
                        <span
                          key={ent.id}
                          className="px-2.5 py-1 rounded-lg border border-[#2b355e] bg-[#0c1228] text-xs font-mono text-[#dedbd0]"
                        >
                          {ent.name} ({ent.type})
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* Resolution Pathways */}
                  <div className="pt-5 border-t border-[#1c2446]">
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-xs font-mono tracking-widest uppercase text-[#fae48f] flex items-center gap-1.5">
                        <Sparkles className="w-3.5 h-3.5 text-[#d4af37]" />
                        <span>Available Resolution Vectors</span>
                      </span>
                      <span className="text-[11px] font-mono text-[#787596]">One-Click Causal Fix</span>
                    </div>

                    {isSelectedResolved ? (
                      <div className="p-5 rounded-xl border border-emerald-500/30 bg-emerald-950/20 text-center">
                        <CheckCircle className="w-8 h-8 text-emerald-400 mx-auto mb-2" />
                        <h4 className="font-cinzel text-lg font-bold text-emerald-300">
                          Canon Reconciled
                        </h4>
                        <p className="font-cormorant text-sm text-[#c8e6d2] mt-1 max-w-md mx-auto">
                          Applied: &ldquo;{resolvedStatus[selectedParadox.id]?.chosenOption}&rdquo;. All downstream chapters and timeline markers have been updated with zero residual conflicts.
                        </p>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {selectedParadox.suggestedResolutions.map((res) => (
                          <div
                            key={res.id}
                            className="p-4 rounded-xl border border-[#20294e] bg-[#0c1128] hover:border-[#fae48f]/50 hover:bg-[#12193b] transition-all"
                          >
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                              <div className="flex-1">
                                <h5 className="font-cinzel text-sm font-semibold text-[#f5f2e9]">
                                  {res.label}
                                </h5>
                                <p className="font-cormorant text-xs text-[#9c99b8] mt-1">
                                  {res.consequence}
                                </p>
                              </div>

                              <button
                                onClick={() => handleApplyResolution(res.id, res.label)}
                                disabled={isAnalyzing}
                                className="gold-glow-button px-4 py-2 rounded-lg text-xs font-mono tracking-wider uppercase font-semibold text-[#fae48f] shrink-0 self-start sm:self-auto cursor-pointer"
                              >
                                {isAnalyzing ? "Recalibrating..." : "Apply Resolution"}
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
