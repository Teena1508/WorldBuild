"use client";

import React, { useState } from "react";
import {
  Eye,
  RefreshCw,
  Shield,
  CheckCircle,
  Search,
  ExternalLink,
  X,
} from "lucide-react";
import { ContinuityFinding } from "@/lib/db/types";
import { OracleScanSummary, RULE_CODES } from "@/lib/oracle/types";

interface AffectedEntityRef {
  id: string;
  type: string;
  name: string;
}

interface ContinuityOracleViewProps {
  universeId: string;
  isOwner: boolean;
  findings: ContinuityFinding[];
  onFindingsChange: (updatedFindings: ContinuityFinding[]) => void;
  onOpenEntity: (type: string, id: string, name: string) => void;
  onRefreshStats: () => void;
  onSuccess: (msg: string) => void;
  onError: (msg: string) => void;
}

export function ContinuityOracleView({
  universeId,
  isOwner,
  findings,
  onFindingsChange,
  onOpenEntity,
  onRefreshStats,
  onSuccess,
  onError,
}: ContinuityOracleViewProps) {
  const [isScanning, setIsScanning] = useState(false);
  const [statusFilter, setStatusFilter] = useState<"all" | "open" | "ignored" | "resolved">("all");
  const [ruleFilter, setRuleFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");

  // Exception modal state
  const [exceptionModalFinding, setExceptionModalFinding] = useState<ContinuityFinding | null>(null);
  const [exceptionReasonInput, setExceptionReasonInput] = useState("");
  const [isSubmittingException, setIsSubmittingException] = useState(false);

  // Quick Action in-progress state
  const [actionInProgressId, setActionInProgressId] = useState<string | null>(null);

  // 1. Run Full Continuity Scan
  const handleRunScan = async () => {
    if (isScanning) return;
    setIsScanning(true);
    try {
      const res = await fetch(`/api/universes/${universeId}/validate`, {
        method: "POST",
      });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error || "Failed to execute continuity scan");
      }
      const data: { summary: OracleScanSummary; findings: ContinuityFinding[] } = await res.json();
      onFindingsChange(data.findings);
      onRefreshStats();
      onSuccess(
        `Continuity scan complete: ${data.summary.openCount} open issue(s), ${data.summary.autoResolvedCount} auto-resolved.`
      );
    } catch (err: unknown) {
      onError(err instanceof Error ? err.message : "Continuity scan failed");
    } finally {
      setIsScanning(false);
    }
  };

  // 2. Action: Acknowledge Exception (Ignore with Reason)
  const handleConfirmException = async () => {
    if (!exceptionModalFinding || !exceptionReasonInput.trim()) return;
    setIsSubmittingException(true);
    try {
      const res = await fetch(
        `/api/universes/${universeId}/findings/${exceptionModalFinding.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "ignore",
            reason: exceptionReasonInput.trim(),
          }),
        }
      );
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error || "Failed to record intentional exception");
      }
      const d = await res.json();
      const updatedFinding: ContinuityFinding = d.finding;

      onFindingsChange(
        findings.map((f) => (f.id === updatedFinding.id ? updatedFinding : f))
      );
      setExceptionModalFinding(null);
      setExceptionReasonInput("");
      onRefreshStats();
      onSuccess("Intentional narrative exception recorded in lore archives.");
    } catch (err: unknown) {
      onError(err instanceof Error ? err.message : "Failed to record exception");
    } finally {
      setIsSubmittingException(false);
    }
  };

  // 3. Action: Resolve Finding
  const handleResolveFinding = async (findingId: string) => {
    setActionInProgressId(findingId);
    try {
      const res = await fetch(
        `/api/universes/${universeId}/findings/${findingId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "resolve" }),
        }
      );
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error || "Failed to mark finding resolved");
      }
      const d = await res.json();
      const updatedFinding: ContinuityFinding = d.finding;

      onFindingsChange(
        findings.map((f) => (f.id === updatedFinding.id ? updatedFinding : f))
      );
      onRefreshStats();
      onSuccess("Finding marked as resolved.");
    } catch (err: unknown) {
      onError(err instanceof Error ? err.message : "Failed to resolve finding");
    } finally {
      setActionInProgressId(null);
    }
  };

  // 4. Action: Reopen Finding
  const handleReopenFinding = async (findingId: string) => {
    setActionInProgressId(findingId);
    try {
      const res = await fetch(
        `/api/universes/${universeId}/findings/${findingId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "reopen" }),
        }
      );
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error || "Failed to reopen finding");
      }
      const d = await res.json();
      const updatedFinding: ContinuityFinding = d.finding;

      onFindingsChange(
        findings.map((f) => (f.id === updatedFinding.id ? updatedFinding : f))
      );
      onRefreshStats();
      onSuccess("Finding reopened for causal review.");
    } catch (err: unknown) {
      onError(err instanceof Error ? err.message : "Failed to reopen finding");
    } finally {
      setActionInProgressId(null);
    }
  };

  // Calculate Metrics
  const openFindings = findings.filter((f) => f.status === "open");
  const ignoredFindings = findings.filter((f) => f.status === "ignored");
  const resolvedFindings = findings.filter((f) => f.status === "resolved");

  const criticalCount = openFindings.filter((f) => f.severity === "critical").length;
  const highCount = openFindings.filter((f) => f.severity === "high").length;
  const mediumCount = openFindings.filter((f) => f.severity === "medium").length;

  let integrityScore = 100.0 - (criticalCount * 15.0 + highCount * 8.0 + mediumCount * 3.0);
  if (integrityScore < 0) integrityScore = 0.0;
  integrityScore = Math.round(integrityScore * 10) / 10;

  // Filtered List
  const filteredFindings = findings.filter((f) => {
    if (statusFilter !== "all" && f.status !== statusFilter) return false;
    if (ruleFilter !== "all" && f.rule_code !== ruleFilter) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const titleMatch = f.title.toLowerCase().includes(q);
      const explMatch = f.explanation.toLowerCase().includes(q);
      const ruleMatch = f.rule_code.toLowerCase().includes(q);
      return titleMatch || explMatch || ruleMatch;
    }
    return true;
  });

  return (
    <div className="space-y-6 animate-fade-in">
      {/* 1. Master Oracle Header */}
      <div className="celestial-card p-6 sm:p-8 rounded-2xl border border-[#d4af37]/30 bg-gradient-to-br from-[#0c1333] via-[#070b21] to-[#040612] relative overflow-hidden">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 relative z-10">
          <div className="max-w-2xl">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-[#d4af37]/30 bg-[#090d24] text-[11px] font-mono tracking-widest uppercase text-[#fae48f] mb-3">
              <Eye className="w-3.5 h-3.5 text-[#fae48f]" />
              <span>Continuity Oracle Rules Engine (Phase 4)</span>
            </div>
            <h2 className="font-cinzel text-2xl sm:text-3xl font-bold text-[#faf8f2]">
              Causal Integrity Diagnostics
            </h2>
            <p className="font-cormorant text-base text-[#b8b5cc] mt-2 leading-relaxed">
              Database-backed causality analysis evaluating spatial overlap, cyclic dependencies,
              predecessor sequence violations, premature lore secrets, and unannotated post-mortem activity.
            </p>
          </div>

          <div className="flex flex-row sm:flex-col items-center sm:items-end justify-between sm:justify-center gap-4 border-t sm:border-t-0 pt-4 sm:pt-0 border-[#1c2445]">
            <div className="text-left sm:text-right">
              <div
                className={`text-3xl sm:text-4xl font-cinzel font-bold ${
                  integrityScore >= 90
                    ? "text-[#58d68d]"
                    : integrityScore >= 70
                    ? "text-[#fae48f]"
                    : "text-rose-400"
                }`}
              >
                {integrityScore.toFixed(1)}%
              </div>
              <span className="text-xs font-mono uppercase tracking-wider text-[#8a88ab] block mt-0.5">
                Causal Integrity Score
              </span>
            </div>

            {isOwner && (
              <button
                type="button"
                onClick={handleRunScan}
                disabled={isScanning}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-[#d4af37]/50 bg-gradient-to-r from-[#d4af37]/20 via-[#d4af37]/10 to-transparent hover:border-[#fae48f] text-xs font-mono tracking-wider uppercase text-[#fae48f] transition-all cursor-pointer shadow-lg disabled:opacity-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isScanning ? "animate-spin" : ""}`} />
                <span>{isScanning ? "Scanning Database..." : "Run Full Scan"}</span>
              </button>
            )}
          </div>
        </div>

        {/* Diagnostic Metrics Row */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-6 pt-6 border-t border-[#1a2245] relative z-10">
          <div className="p-3 rounded-xl border border-[#1b2347] bg-[#070b20]/60">
            <span className="text-[10px] font-mono uppercase tracking-wider text-[#7e7b9e] block mb-0.5">
              Open Paradoxes
            </span>
            <div className="flex items-center gap-2">
              <span className="font-cinzel text-xl font-bold text-rose-400">
                {openFindings.length}
              </span>
              {openFindings.length > 0 && (
                <span className="inline-block w-2 h-2 rounded-full bg-rose-500 animate-pulse" />
              )}
            </div>
          </div>

          <div className="p-3 rounded-xl border border-[#1b2347] bg-[#070b20]/60">
            <span className="text-[10px] font-mono uppercase tracking-wider text-[#7e7b9e] block mb-0.5">
              Intentional Exceptions
            </span>
            <span className="font-cinzel text-xl font-bold text-purple-400">
              {ignoredFindings.length}
            </span>
          </div>

          <div className="p-3 rounded-xl border border-[#1b2347] bg-[#070b20]/60">
            <span className="text-[10px] font-mono uppercase tracking-wider text-[#7e7b9e] block mb-0.5">
              Auto-Resolved
            </span>
            <span className="font-cinzel text-xl font-bold text-[#58d68d]">
              {resolvedFindings.length}
            </span>
          </div>

          <div className="p-3 rounded-xl border border-[#1b2347] bg-[#070b20]/60">
            <span className="text-[10px] font-mono uppercase tracking-wider text-[#7e7b9e] block mb-0.5">
              Active Rules
            </span>
            <span className="font-cinzel text-xl font-bold text-[#fae48f]">
              5 Engine Rules
            </span>
          </div>
        </div>
      </div>

      {/* 2. Filter & Search Controls */}
      <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 p-3 rounded-xl border border-[#1b2347] bg-[#060919]">
        {/* Status Filter Tabs */}
        <div className="flex items-center gap-1 overflow-x-auto pb-1 md:pb-0">
          {[
            { id: "all", label: `All (${findings.length})` },
            { id: "open", label: `Open (${openFindings.length})` },
            { id: "ignored", label: `Exceptions (${ignoredFindings.length})` },
            { id: "resolved", label: `Resolved (${resolvedFindings.length})` },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setStatusFilter(tab.id as typeof statusFilter)}
              className={`px-3 py-1.5 rounded-lg text-xs font-mono uppercase tracking-wider transition-all whitespace-nowrap cursor-pointer ${
                statusFilter === tab.id
                  ? "bg-[#18214d] text-[#fae48f] border border-[#d4af37]/40 font-semibold"
                  : "text-[#83809e] hover:text-[#dedbd0] hover:bg-[#0c1026]"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Search & Rule Dropdown */}
        <div className="flex items-center gap-2">
          {/* Rule Dropdown */}
          <select
            value={ruleFilter}
            onChange={(e) => setRuleFilter(e.target.value)}
            className="px-3 py-1.5 rounded-lg border border-[#1e274d] bg-[#070a1e] text-xs font-mono text-[#dedbd2] focus:outline-none focus:border-[#fae48f]"
          >
            <option value="all">All Diagnostic Rules</option>
            <option value={RULE_CODES.SPATIAL_OVERLAP}>1. Spatial Overlap</option>
            <option value={RULE_CODES.CYCLIC_DEPENDENCY}>2. Cyclic Dependencies</option>
            <option value={RULE_CODES.PREDECESSOR_VIOLATION}>3. Predecessor Inversions</option>
            <option value={RULE_CODES.PREMATURE_SECRET}>4. Premature Lore Secrets</option>
            <option value={RULE_CODES.POST_MORTEM_ACTIVITY}>5. Post-Mortem Activity</option>
          </select>

          {/* Search Box */}
          <div className="relative flex-1 md:w-56">
            <Search className="w-3.5 h-3.5 text-[#6c6987] absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search findings..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 rounded-lg border border-[#1e274d] bg-[#070a1e] text-xs font-mono text-[#dedbd2] placeholder-[#5a5775] focus:outline-none focus:border-[#fae48f]"
            />
          </div>
        </div>
      </div>

      {/* 3. Findings Feed */}
      {filteredFindings.length === 0 ? (
        <div className="p-12 text-center rounded-2xl border border-[#d4af37]/25 bg-gradient-to-b from-[#0a0f26]/80 via-[#070a1e]/60 to-[#040510] shadow-xl relative overflow-hidden">
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-64 bg-[#d4af37]/5 rounded-full blur-3xl pointer-events-none" />
          {openFindings.length === 0 ? (
            <div className="max-w-lg mx-auto space-y-4 relative z-10">
              <div className="w-14 h-14 rounded-2xl border border-emerald-500/40 bg-emerald-950/40 text-emerald-300 flex items-center justify-center mx-auto shadow-[0_0_25px_rgba(16,185,129,0.2)]">
                <CheckCircle className="w-7 h-7 text-emerald-400" />
              </div>
              <div>
                <span className="text-[10px] font-mono tracking-widest uppercase text-[#fae48f] block mb-1">
                  Continuity Integrity Sealed
                </span>
                <h3 className="font-cinzel text-xl sm:text-2xl font-bold text-[#faf8f2]">
                  Causal Harmony Prevails
                </h3>
              </div>
              <p className="font-cormorant text-base text-[#b0aebb] leading-relaxed">
                Zero causal loops, spatial bilocations, timeline sequence inversions, premature secret reveals, or post-mortem violations exist in this universe. The continuum stands in immaculate alignment.
              </p>
              {isOwner && (
                <div className="pt-2">
                  <button
                    type="button"
                    onClick={handleRunScan}
                    disabled={isScanning}
                    className="gold-glow-button inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-mono uppercase tracking-wider font-semibold text-[#fae48f] transition-all cursor-pointer disabled:opacity-50"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isScanning ? "animate-spin" : ""}`} />
                    <span>{isScanning ? "Scanning Continuum..." : "Run Causal Diagnostic"}</span>
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-2">
              <p className="font-mono text-xs text-[#7d7a9c]">
                No findings match the selected status or rule filters.
              </p>
              <button
                type="button"
                onClick={() => {
                  setStatusFilter("all");
                  setRuleFilter("all");
                  setSearchQuery("");
                }}
                className="text-xs font-mono text-[#fae48f] hover:underline"
              >
                Clear all filters
              </button>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {filteredFindings.map((finding) => {
            const isCritical = finding.severity === "critical";
            const isHigh = finding.severity === "high";
            const isOpen = finding.status === "open";
            const isIgnored = finding.status === "ignored";
            const isResolved = finding.status === "resolved";

            // Parse affected entities
            let affectedEntities: AffectedEntityRef[] = [];
            try {
              affectedEntities = JSON.parse(finding.affected_entities_json || "[]");
            } catch {
              affectedEntities = [];
            }

            // Parse evidence
            let evidence: Record<string, unknown> = {};
            try {
              evidence = JSON.parse(finding.evidence_json || "{}");
            } catch {
              evidence = {};
            }

            return (
              <div
                key={finding.id}
                className={`p-5 rounded-xl border transition-all ${
                  isOpen
                    ? isCritical
                      ? "border-rose-500/40 bg-gradient-to-br from-[#190c17] via-[#0e0714] to-[#06040d]"
                      : isHigh
                      ? "border-amber-500/40 bg-gradient-to-br from-[#1a110a] via-[#100b08] to-[#070505]"
                      : "border-yellow-500/30 bg-[#0d0f1f]"
                    : isIgnored
                    ? "border-purple-500/30 bg-[#0d091a]"
                    : "border-emerald-500/30 bg-[#06120e]"
                }`}
              >
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 mb-3">
                  <div className="flex flex-wrap items-center gap-2">
                    {/* Status badge */}
                    {isOpen && (
                      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full border border-rose-500/40 bg-rose-950/60 text-rose-300 text-[10px] font-mono uppercase tracking-wider font-semibold">
                        <span className="w-1.5 h-1.5 rounded-full bg-rose-400 animate-ping" />
                        <span>Active Paradox</span>
                      </span>
                    )}
                    {isIgnored && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border border-purple-500/40 bg-purple-950/60 text-purple-300 text-[10px] font-mono uppercase tracking-wider">
                        <Shield className="w-3 h-3 text-purple-400" />
                        <span>Intentional Exception</span>
                      </span>
                    )}
                    {isResolved && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border border-emerald-500/40 bg-emerald-950/60 text-emerald-300 text-[10px] font-mono uppercase tracking-wider">
                        <CheckCircle className="w-3 h-3 text-emerald-400" />
                        <span>Harmonized</span>
                      </span>
                    )}

                    {/* Severity Badge */}
                    <span
                      className={`text-[10px] font-mono uppercase px-2 py-0.5 rounded border ${
                        isCritical
                          ? "border-rose-500/50 bg-rose-950/40 text-rose-300 font-bold"
                          : isHigh
                          ? "border-amber-500/50 bg-amber-950/40 text-amber-300"
                          : "border-sky-500/50 bg-sky-950/40 text-sky-300"
                      }`}
                    >
                      {finding.severity}
                    </span>

                    {/* Rule Code */}
                    <span className="text-[10px] font-mono text-[#787596] px-1.5 py-0.5 rounded bg-[#10142b]">
                      {finding.rule_code}
                    </span>
                  </div>

                  <span className="text-[11px] font-mono text-[#6c6987]">
                    Fingerprint: {finding.fingerprint.slice(0, 8)}...
                  </span>
                </div>

                {/* Title */}
                <h3 className="font-cinzel text-base sm:text-lg font-bold text-[#faf8f2] mb-1.5">
                  {finding.title}
                </h3>

                {/* Explanation */}
                <p className="font-cormorant text-sm sm:text-base text-[#cfccdb] leading-relaxed mb-4">
                  {finding.explanation}
                </p>

                {/* Affected Entities Row */}
                {affectedEntities.length > 0 && (
                  <div className="mb-4">
                    <span className="text-[10px] font-mono uppercase tracking-wider text-[#797699] block mb-1.5">
                      Affected Records (Click to Inspect):
                    </span>
                    <div className="flex flex-wrap items-center gap-1.5">
                      {affectedEntities.map((ent, idx) => (
                        <button
                          key={`${ent.id}-${idx}`}
                          type="button"
                          onClick={() => onOpenEntity(ent.type, ent.id, ent.name)}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-[#26315c] bg-[#0c122c] hover:border-[#fae48f] hover:bg-[#141d45] text-xs font-mono text-[#dedbd2] transition-colors cursor-pointer"
                        >
                          <span className="text-[10px] uppercase text-[#fae48f] font-semibold">
                            [{ent.type}]
                          </span>
                          <span>{ent.name}</span>
                          <ExternalLink className="w-3 h-3 text-[#797699]" />
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Evidence Details */}
                {Object.keys(evidence).length > 0 && (
                  <div className="p-2.5 rounded-lg border border-[#1b2345] bg-[#050713]/80 text-[11px] font-mono text-[#a09dbd] mb-3">
                    <span className="text-[#8e8cae] uppercase text-[10px] tracking-wider block mb-1">
                      Evidence Diagnostics:
                    </span>
                    <div className="flex flex-wrap gap-x-4 gap-y-1">
                      {Object.entries(evidence).map(([key, val]) => {
                        if (typeof val === "object" && val !== null) {
                          return null;
                        }
                        return (
                          <div key={key} className="flex items-center gap-1.5">
                            <span className="text-[#6d6b8a]">{key}:</span>
                            <span className="text-[#e2dfd2]">{String(val)}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Suggested Resolution Box */}
                {finding.suggested_resolution && (
                  <div className="p-3 rounded-lg border border-[#d4af37]/25 bg-[#141209]/60 text-xs font-mono text-[#dedbd0] mb-3">
                    <span className="text-[#fae48f] font-semibold uppercase tracking-wider block mb-1">
                      💡 Suggested Resolution:
                    </span>
                    <span>{finding.suggested_resolution}</span>
                  </div>
                )}


                {/* Intentional Exception Rationale (if ignored) */}
                {isIgnored && finding.ignored_reason && (
                  <div className="p-3 rounded-lg border border-purple-500/30 bg-purple-950/20 text-xs font-mono text-purple-200 mb-3">
                    <div className="flex items-center gap-1.5 text-purple-300 font-semibold uppercase tracking-wider mb-1">
                      <Shield className="w-3.5 h-3.5" />
                      <span>Archivist Narrative Justification:</span>
                    </div>
                    <p className="font-cormorant text-sm italic text-purple-100">
                      &ldquo;{finding.ignored_reason}&rdquo;
                    </p>
                  </div>
                )}

                {/* Actions Footer */}
                {isOwner && (
                  <div className="flex flex-wrap items-center gap-2 pt-3 border-t border-[#1a2245] mt-4">
                    {isOpen && (
                      <>
                        <button
                          type="button"
                          onClick={() => {
                            setExceptionModalFinding(finding);
                            setExceptionReasonInput("");
                          }}
                          className="px-3 py-1.5 rounded-lg border border-purple-500/40 bg-purple-950/30 hover:bg-purple-900/50 text-xs font-mono text-purple-200 transition-colors cursor-pointer flex items-center gap-1"
                        >
                          <Shield className="w-3.5 h-3.5 text-purple-400" />
                          <span>Acknowledge Exception</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => handleResolveFinding(finding.id)}
                          disabled={actionInProgressId === finding.id}
                          className="px-3 py-1.5 rounded-lg border border-emerald-500/40 bg-emerald-950/30 hover:bg-emerald-900/50 text-xs font-mono text-emerald-200 transition-colors cursor-pointer flex items-center gap-1"
                        >
                          <CheckCircle className="w-3.5 h-3.5 text-emerald-400" />
                          <span>Mark Resolved</span>
                        </button>
                      </>
                    )}

                    {(isIgnored || isResolved) && (
                      <button
                        type="button"
                        onClick={() => handleReopenFinding(finding.id)}
                        disabled={actionInProgressId === finding.id}
                        className="px-3 py-1.5 rounded-lg border border-[#2b355e] bg-[#0c122c] hover:bg-[#141b3d] text-xs font-mono text-[#dedbd2] transition-colors cursor-pointer flex items-center gap-1"
                      >
                        <RefreshCw className="w-3.5 h-3.5 text-[#fae48f]" />
                        <span>Reopen Paradox</span>
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* 4. Intentional Exception Modal */}
      {exceptionModalFinding && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md">
          <div className="relative w-full max-w-lg bg-[#080c21] border border-[#d4af37]/40 rounded-2xl shadow-2xl p-6 text-[#dedbd2] animate-fade-in">
            <div className="flex items-center justify-between pb-4 border-b border-[#1d2545] mb-4">
              <div className="flex items-center gap-2">
                <Shield className="w-4 h-4 text-purple-400" />
                <h3 className="font-cinzel text-lg font-bold text-[#faf8f2]">
                  Acknowledge Narrative Exception
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setExceptionModalFinding(null)}
                className="text-[#8482a5] hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="font-cormorant text-sm text-[#b8b5cc] mb-4">
              Document the literary, magical, or temporal justification for this apparent contradiction.
              This finding will be archived as an intentional exception rather than an unresolved error.
            </p>

            <div className="space-y-3">
              <div>
                <label className="text-[11px] font-mono uppercase tracking-wider text-[#fae48f] block mb-1">
                  Paradox Finding:
                </label>
                <div className="p-2.5 rounded-lg border border-[#1b2347] bg-[#050714] text-xs font-mono text-[#dedbd0]">
                  {exceptionModalFinding.title}
                </div>
              </div>

              <div>
                <label className="text-[11px] font-mono uppercase tracking-wider text-[#fae48f] block mb-1">
                  Narrative Justification Rationale *
                </label>
                <textarea
                  rows={4}
                  placeholder="e.g. In Chapter 4, the character enters an intentional temporal displacement created by the Obsidian Relic..."
                  value={exceptionReasonInput}
                  onChange={(e) => setExceptionReasonInput(e.target.value)}
                  className="w-full p-3 rounded-lg border border-[#1e274d] bg-[#070a1e] text-xs font-mono text-[#dedbd2] placeholder-[#5a5775] focus:outline-none focus:border-[#fae48f]"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-5 border-t border-[#1d2545] mt-6">
              <button
                type="button"
                onClick={() => setExceptionModalFinding(null)}
                className="px-4 py-2 text-xs font-mono uppercase text-[#8886a8] hover:text-white cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmException}
                disabled={isSubmittingException || !exceptionReasonInput.trim()}
                className="px-4 py-2 rounded-lg border border-purple-500/60 bg-purple-950/70 hover:bg-purple-900 text-xs font-mono uppercase text-purple-200 transition-colors disabled:opacity-50 cursor-pointer"
              >
                {isSubmittingException ? "Recording Exception..." : "Record Exception"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
