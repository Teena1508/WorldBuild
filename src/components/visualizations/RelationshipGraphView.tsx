"use client";

import React, { useState, useRef, useMemo } from "react";
import {
  ZoomIn,
  ZoomOut,
  Maximize2,
  Search,
  GitBranch,
  Table,
  Sparkles,
  Share2,
} from "lucide-react";
import { Character, Relationship, ContinuityFinding } from "@/lib/db/types";

interface NodeData {
  id: string;
  name: string;
  epithet: string | null;
  status: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  connectionsCount: number;
  hasParadox: boolean;
  paradoxCount: number;
}

interface EdgeData {
  id: string;
  source: string;
  target: string;
  relationshipType: string;
  intensity: number;
  notes: string | null;
  sourceName: string;
  targetName: string;
}

interface RelationshipGraphViewProps {
  characters: Character[];
  relationships: Relationship[];
  findings: ContinuityFinding[];
  onOpenCharacter: (characterId: string) => void;
  onOpenCreateRelationship?: () => void;
  isOwner?: boolean;
}

const TYPE_COLORS: Record<string, string> = {
  ally: "#58d68d",
  allied: "#58d68d",
  friend: "#58d68d",
  rival: "#e74c3c",
  enemy: "#e74c3c",
  nemesis: "#e74c3c",
  mentor: "#f5b041",
  apprentice: "#f5b041",
  student: "#f5b041",
  kin: "#5dade2",
  family: "#5dade2",
  sibling: "#5dade2",
  parent: "#5dade2",
  spouse: "#ec7063",
  lover: "#ec7063",
  vassal: "#af7ac5",
  ruler: "#af7ac5",
};

function getEdgeColor(type: string): string {
  const norm = type.toLowerCase().trim();
  for (const [key, color] of Object.entries(TYPE_COLORS)) {
    if (norm.includes(key)) return color;
  }
  return "#d4af37"; // default gold
}

export function RelationshipGraphView({
  characters,
  relationships,
  findings,
  onOpenCharacter,
  onOpenCreateRelationship,
  isOwner = false,
}: RelationshipGraphViewProps) {
  const svgRef = useRef<SVGSVGElement | null>(null);

  // Viewport transforms (Zoom & Pan)
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [startPan, setStartPan] = useState({ x: 0, y: 0 });

  // Dragging single node
  const [draggedNodeId, setDraggedNodeId] = useState<string | null>(null);

  // Filters & Search
  const [searchQuery, setSearchQuery] = useState("");
  const [minIntensity, setMinIntensity] = useState(1);
  const [selectedType, setSelectedType] = useState<string>("all");
  const [onlyParadoxes, setOnlyParadoxes] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [showAccessibleTable, setShowAccessibleTable] = useState(false);

  // Hovered node
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
  const [hoveredEdgeId, setHoveredEdgeId] = useState<string | null>(null);

  // Set of character IDs with active continuity paradoxes
  const paradoxCharacterMap = useMemo(() => {
    const map = new Map<string, number>();
    for (const f of findings) {
      if (f.status === "open") {
        try {
          const entities: Array<{ id: string; type: string }> = JSON.parse(
            f.affected_entities_json || "[]"
          );
          for (const ent of entities) {
            if (ent.type === "character") {
              map.set(ent.id, (map.get(ent.id) || 0) + 1);
            }
          }
        } catch {
          // ignore parse error
        }
      }
    }
    return map;
  }, [findings]);

  // Unique relationship types present in dataset
  const availableTypes = useMemo(() => {
    const set = new Set<string>();
    for (const r of relationships) {
      if (r.relationship_type) set.add(r.relationship_type.trim());
    }
    return Array.from(set).sort();
  }, [relationships]);

  // Filtered Characters and Relationships
  const { filteredCharacters, filteredRelationships } = useMemo(() => {
    // 1. Filter relationships first
    const rels = relationships.filter((r) => {
      if (r.intensity < minIntensity) return false;
      if (selectedType !== "all" && r.relationship_type.toLowerCase() !== selectedType.toLowerCase()) {
        return false;
      }
      return true;
    });

    // 2. Filter characters
    const chars = characters.filter((c) => {
      if (statusFilter !== "all" && c.status !== statusFilter) return false;
      if (onlyParadoxes && !paradoxCharacterMap.has(c.id)) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const nameMatch = c.name.toLowerCase().includes(q);
        const epithetMatch = c.epithet?.toLowerCase().includes(q);
        return nameMatch || Boolean(epithetMatch);
      }
      return true;
    });

    return { filteredCharacters: chars, filteredRelationships: rels };
  }, [
    characters,
    relationships,
    minIntensity,
    selectedType,
    statusFilter,
    onlyParadoxes,
    searchQuery,
    paradoxCharacterMap,
  ]);

  // Dragged node positions
  const [draggedPositions, setDraggedPositions] = useState<Record<string, { x: number; y: number }>>({});

  // Compute node layout using a deterministic radial layout with physics settlement
  const nodes: NodeData[] = useMemo(() => {
    if (filteredCharacters.length === 0) return [];

    const width = 900;
    const height = 600;
    const cx = width / 2;
    const cy = height / 2;
    const count = filteredCharacters.length;
    const radius = Math.min(width, height) * 0.38;

    return filteredCharacters.map((c, idx) => {
      const custom = draggedPositions[c.id];
      let x: number;
      let y: number;

      if (custom) {
        x = custom.x;
        y = custom.y;
      } else {
        const angle = (idx / Math.max(1, count)) * 2 * Math.PI;
        x = Math.round(cx + radius * Math.cos(angle) + Math.sin(idx * 7) * 40);
        y = Math.round(cy + radius * Math.sin(angle) + Math.cos(idx * 5) * 40);
      }

      const connCount = filteredRelationships.filter(
        (r) => r.source_character_id === c.id || r.target_character_id === c.id
      ).length;

      const pCount = paradoxCharacterMap.get(c.id) || 0;

      return {
        id: c.id,
        name: c.name,
        epithet: c.epithet || null,
        status: c.status,
        x,
        y,
        vx: 0,
        vy: 0,
        radius: Math.max(24, Math.min(42, 24 + connCount * 3)),
        connectionsCount: connCount,
        hasParadox: pCount > 0,
        paradoxCount: pCount,
      };
    });
  }, [filteredCharacters, filteredRelationships, paradoxCharacterMap, draggedPositions]);


  // Convert relationships into Edges with coordinates
  const edges: EdgeData[] = useMemo(() => {
    const nodeMap = new Map<string, NodeData>();
    for (const n of nodes) nodeMap.set(n.id, n);

    const validEdges: EdgeData[] = [];
    for (const r of filteredRelationships) {
      if (nodeMap.has(r.source_character_id) && nodeMap.has(r.target_character_id)) {
        validEdges.push({
          id: r.id,
          source: r.source_character_id,
          target: r.target_character_id,
          relationshipType: r.relationship_type,
          intensity: r.intensity,
          notes: r.notes || null,
          sourceName: r.source_character_name || nodeMap.get(r.source_character_id)!.name,
          targetName: r.target_character_name || nodeMap.get(r.target_character_id)!.name,
        });
      }
    }
    return validEdges;
  }, [filteredRelationships, nodes]);

  // Fast node lookup
  const nodePositionMap = useMemo(() => {
    const map = new Map<string, NodeData>();
    for (const n of nodes) map.set(n.id, n);
    return map;
  }, [nodes]);

  // Connected nodes map for hover highlighting
  const connectedNodeIds = useMemo(() => {
    if (!hoveredNodeId) return null;
    const set = new Set<string>([hoveredNodeId]);
    for (const e of edges) {
      if (e.source === hoveredNodeId) set.add(e.target);
      if (e.target === hoveredNodeId) set.add(e.source);
    }
    return set;
  }, [hoveredNodeId, edges]);

  // Pan handlers
  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return; // only left click
    if ((e.target as HTMLElement).tagName === "circle" || (e.target as HTMLElement).tagName === "text") {
      return;
    }
    setIsPanning(true);
    setStartPan({ x: e.clientX - pan.x, y: e.clientY - pan.y });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (draggedNodeId) {
      // Update dragged node position directly in SVG coordinate space
      const svg = svgRef.current;
      if (!svg) return;
      const rect = svg.getBoundingClientRect();
      const mouseX = (e.clientX - rect.left - pan.x) / zoom;
      const mouseY = (e.clientY - rect.top - pan.y) / zoom;

      setDraggedPositions((prev) => ({
        ...prev,
        [draggedNodeId]: { x: mouseX, y: mouseY },
      }));
      return;
    }

    if (isPanning) {
      setPan({ x: e.clientX - startPan.x, y: e.clientY - startPan.y });
    }
  };

  const handleMouseUp = () => {
    setIsPanning(false);
    setDraggedNodeId(null);
  };

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const zoomFactor = e.deltaY < 0 ? 1.1 : 0.9;
    setZoom((prev) => Math.max(0.3, Math.min(3, prev * zoomFactor)));
  };

  const resetView = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
    setDraggedPositions({});
  };


  return (
    <div className="space-y-4 animate-fade-in">
      {/* 1. Header Toolbar */}
      <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-4 p-4 rounded-xl border border-[#1b2347] bg-[#070b20]">
        <div className="flex flex-wrap items-center gap-3">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-[#d4af37]/30 bg-[#0c1230] text-[11px] font-mono tracking-wider uppercase text-[#fae48f]">
            <GitBranch className="w-3.5 h-3.5 text-[#fae48f]" />
            <span>Character Relationship Topology</span>
          </div>

          <span className="text-xs font-mono text-[#827f9e]">
            {filteredCharacters.length} Character Nodes • {edges.length} Directed Bonds
          </span>

          {paradoxCharacterMap.size > 0 && (
            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full border border-rose-500/40 bg-rose-950/60 text-rose-300 text-[10px] font-mono">
              <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse" />
              <span>{paradoxCharacterMap.size} with Causal Paradoxes</span>
            </span>
          )}
        </div>

        {/* View Controls & Action Buttons */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setShowAccessibleTable(!showAccessibleTable)}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-mono uppercase transition-colors cursor-pointer ${
              showAccessibleTable
                ? "border-[#fae48f] bg-[#1a234d] text-[#fae48f]"
                : "border-[#20294e] bg-[#090e24] text-[#8e8cae] hover:text-[#dedbd0]"
            }`}
          >
            <Table className="w-3.5 h-3.5" />
            <span>{showAccessibleTable ? "Interactive Graph" : "Accessible Matrix"}</span>
          </button>

          {isOwner && onOpenCreateRelationship && (
            <button
              type="button"
              onClick={onOpenCreateRelationship}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#d4af37]/50 bg-gradient-to-r from-[#d4af37]/20 to-transparent hover:border-[#fae48f] text-xs font-mono text-[#fae48f] transition-all cursor-pointer"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Forge New Bond</span>
            </button>
          )}
        </div>
      </div>

      {/* 2. Interactive Filtering Ribbon */}
      <div className="p-3 rounded-xl border border-[#1b2347] bg-[#050819] flex flex-wrap items-center gap-3 text-xs font-mono">
        {/* Search */}
        <div className="relative w-44 sm:w-56">
          <Search className="w-3.5 h-3.5 text-[#6c6987] absolute left-2.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search character..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-8 pr-2.5 py-1.5 rounded-lg border border-[#1e274d] bg-[#070a1e] text-xs font-mono text-[#dedbd2] placeholder-[#5a5775] focus:outline-none focus:border-[#fae48f]"
          />
        </div>

        {/* Type Filter */}
        <div className="flex items-center gap-1.5">
          <span className="text-[#726f8f]">Type:</span>
          <select
            value={selectedType}
            onChange={(e) => setSelectedType(e.target.value)}
            className="px-2.5 py-1.5 rounded-lg border border-[#1e274d] bg-[#070a1e] text-xs font-mono text-[#dedbd2] focus:outline-none focus:border-[#fae48f]"
          >
            <option value="all">All Types ({availableTypes.length})</option>
            {availableTypes.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>

        {/* Intensity Filter */}
        <div className="flex items-center gap-2">
          <span className="text-[#726f8f]">Min Intensity:</span>
          <input
            type="range"
            min="1"
            max="10"
            value={minIntensity}
            onChange={(e) => setMinIntensity(Number(e.target.value))}
            className="w-20 accent-[#fae48f] cursor-pointer"
          />
          <span className="text-[#fae48f] font-bold w-4 text-center">{minIntensity}</span>
        </div>

        {/* Status Filter */}
        <div className="flex items-center gap-1.5">
          <span className="text-[#726f8f]">Status:</span>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-2.5 py-1.5 rounded-lg border border-[#1e274d] bg-[#070a1e] text-xs font-mono text-[#dedbd2] focus:outline-none focus:border-[#fae48f]"
          >
            <option value="all">All Inhabitants</option>
            <option value="alive">Alive</option>
            <option value="deceased">Deceased</option>
            <option value="ascended">Ascended</option>
            <option value="displaced">Displaced</option>
          </select>
        </div>

        {/* Paradox Toggle */}
        <label className="flex items-center gap-1.5 text-xs font-mono cursor-pointer select-none">
          <input
            type="checkbox"
            checked={onlyParadoxes}
            onChange={(e) => setOnlyParadoxes(e.target.checked)}
            className="rounded accent-rose-500"
          />
          <span className={onlyParadoxes ? "text-rose-300 font-semibold" : "text-[#797696]"}>
            Only Paradoxes ({paradoxCharacterMap.size})
          </span>
        </label>

        {/* Reset Filter Button */}
        {(selectedType !== "all" ||
          minIntensity > 1 ||
          statusFilter !== "all" ||
          onlyParadoxes ||
          searchQuery) && (
          <button
            type="button"
            onClick={() => {
              setSelectedType("all");
              setMinIntensity(1);
              setStatusFilter("all");
              setOnlyParadoxes(false);
              setSearchQuery("");
            }}
            className="text-xs font-mono text-[#fae48f] hover:underline ml-auto"
          >
            Reset Filters
          </button>
        )}
      </div>

      {/* 3. Main Graph Display or Accessible Table Alternative */}
      {showAccessibleTable ? (
        <div className="celestial-card p-6 rounded-2xl border border-[#1b2347] bg-[#070a1e] overflow-x-auto animate-fade-in">
          <div className="flex items-center justify-between pb-3 border-b border-[#18203c] mb-4">
            <h3 className="font-cinzel text-base font-bold text-[#faf8f2]">
              Accessible Character Relationships Matrix
            </h3>
            <span className="text-xs font-mono text-[#787596]">
              {edges.length} total directed bonds
            </span>
          </div>

          {edges.length === 0 ? (
            <p className="font-cormorant text-sm text-[#797699] py-8 text-center italic">
              No character relationships match the current filter criteria.
            </p>
          ) : (
            <table className="w-full text-left text-xs font-mono border-collapse" role="table">
              <thead>
                <tr className="border-b border-[#1c2447] text-[#8683a3] uppercase text-[10px] tracking-wider">
                  <th className="py-2.5 px-3">Source Character</th>
                  <th className="py-2.5 px-3">Bond / Relationship</th>
                  <th className="py-2.5 px-3">Target Character</th>
                  <th className="py-2.5 px-3">Intensity (1-10)</th>
                  <th className="py-2.5 px-3">Lore Annotations</th>
                  <th className="py-2.5 px-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#131a38]">
                {edges.map((e) => (
                  <tr key={e.id} className="hover:bg-[#0c122e]/60 transition-colors">
                    <td className="py-2.5 px-3 font-semibold text-[#dedbd2]">
                      <button
                        onClick={() => onOpenCharacter(e.source)}
                        className="text-[#fae48f] hover:underline cursor-pointer"
                      >
                        {e.sourceName}
                      </button>
                    </td>
                    <td className="py-2.5 px-3">
                      <span
                        className="inline-block px-2 py-0.5 rounded text-[10px] uppercase font-semibold"
                        style={{
                          backgroundColor: `${getEdgeColor(e.relationshipType)}20`,
                          color: getEdgeColor(e.relationshipType),
                          border: `1px solid ${getEdgeColor(e.relationshipType)}40`,
                        }}
                      >
                        {e.relationshipType}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 font-semibold text-[#dedbd2]">
                      <button
                        onClick={() => onOpenCharacter(e.target)}
                        className="text-[#fae48f] hover:underline cursor-pointer"
                      >
                        {e.targetName}
                      </button>
                    </td>
                    <td className="py-2.5 px-3">
                      <div className="flex items-center gap-2">
                        <div className="w-16 h-1.5 rounded-full bg-[#1b2347] overflow-hidden">
                          <div
                            className="h-full bg-[#fae48f]"
                            style={{ width: `${e.intensity * 10}%` }}
                          />
                        </div>
                        <span className="text-[#fae48f]">{e.intensity}</span>
                      </div>
                    </td>
                    <td className="py-2.5 px-3 text-[#9592b0] italic">
                      {e.notes || "—"}
                    </td>
                    <td className="py-2.5 px-3 text-right">
                      <button
                        onClick={() => onOpenCharacter(e.source)}
                        className="text-[11px] text-[#fae48f] hover:underline"
                      >
                        Inspect Dossier
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      ) : (
        /* SVG Interactive Graph Canvas */
        <div className="relative rounded-2xl border border-[#1b2347] bg-[#040612] overflow-hidden shadow-2xl h-[620px] select-none">
          {/* Zoom & Viewport Floating Controls */}
          <div className="absolute top-4 right-4 z-20 flex items-center gap-1 p-1 rounded-xl border border-[#1b2347] bg-[#070b20]/90 backdrop-blur-md shadow-lg">
            <button
              type="button"
              onClick={() => setZoom((z) => Math.min(3, z * 1.2))}
              className="p-1.5 rounded-lg text-[#8885a5] hover:text-[#fae48f] hover:bg-[#12193d] transition-colors"
              title="Zoom In"
            >
              <ZoomIn className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => setZoom((z) => Math.max(0.3, z / 1.2))}
              className="p-1.5 rounded-lg text-[#8885a5] hover:text-[#fae48f] hover:bg-[#12193d] transition-colors"
              title="Zoom Out"
            >
              <ZoomOut className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={resetView}
              className="p-1.5 rounded-lg text-[#8885a5] hover:text-[#fae48f] hover:bg-[#12193d] transition-colors"
              title="Reset View"
            >
              <Maximize2 className="w-4 h-4" />
            </button>
          </div>

          {/* Interactive Legend Floating Badge */}
          <div className="absolute bottom-4 left-4 z-20 p-2.5 rounded-xl border border-[#1b2347] bg-[#070b20]/90 backdrop-blur-md text-[10px] font-mono text-[#8a88ab] space-y-1">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-[#58d68d]" />
              <span>Alliance / Kinship</span>
              <span className="w-2.5 h-2.5 rounded-full bg-[#e74c3c] ml-2" />
              <span>Rivalry / Enmity</span>
              <span className="w-2.5 h-2.5 rounded-full bg-[#f5b041] ml-2" />
              <span>Mentorship / Bond</span>
            </div>
            <div className="text-[#656382]">
              Drag canvas to pan • Scroll to zoom • Drag nodes to reposition • Click to inspect
            </div>
          </div>

          {/* Empty State */}
          {filteredCharacters.length === 0 && (
            <div className="absolute inset-0 z-10 flex items-center justify-center text-center p-6 bg-black/75 backdrop-blur-md">
              <div className="max-w-md space-y-4">
                <div className="w-14 h-14 rounded-2xl border border-[#d4af37]/40 bg-[#0d122c] text-[#fae48f] flex items-center justify-center mx-auto shadow-[0_0_25px_rgba(212,175,55,0.2)]">
                  <Share2 className="w-7 h-7 text-[#fae48f]" />
                </div>
                <div>
                  <span className="text-[10px] font-mono tracking-widest uppercase text-[#fae48f] block mb-1">
                    Topological Nexus Silent
                  </span>
                  <h3 className="font-cinzel text-xl font-bold text-[#faf8f2]">
                    {characters.length === 0 ? "Cosmic Constellation Awaiting Stars" : "No Inhabitants in Filter Scope"}
                  </h3>
                </div>
                <p className="font-cormorant text-sm sm:text-base text-[#b0aebb] leading-relaxed">
                  {characters.length === 0
                    ? "No character nodes exist in this realm yet. Inscribe your first dramatis personae to illuminate their interpersonal constellation and causal allegiances."
                    : "No characters match the current filters. Adjust your search query, intensity threshold, or status filter to reveal nodes."}
                </p>
                {isOwner && onOpenCreateRelationship && characters.length > 0 && (
                  <div className="pt-2">
                    <button
                      type="button"
                      onClick={onOpenCreateRelationship}
                      className="gold-glow-button inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-mono uppercase tracking-wider font-semibold text-[#fae48f] cursor-pointer"
                    >
                      <Sparkles className="w-3.5 h-3.5" />
                      <span>Forge First Relationship Bond</span>
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* The Interactive SVG Canvas */}
          <svg
            ref={svgRef}
            className="w-full h-full cursor-grab active:cursor-grabbing"
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onWheel={handleWheel}
          >
            {/* SVG Defs: Arrowheads and Glow Filters */}
            <defs>
              <filter id="glow-gold" x="-20%" y="-20%" width="140%" height="140%">
                <feGaussianBlur stdDeviation="4" result="blur" />
                <feComposite in="SourceGraphic" in2="blur" operator="over" />
              </filter>
              <filter id="glow-red" x="-30%" y="-30%" width="160%" height="160%">
                <feGaussianBlur stdDeviation="6" result="blur" />
                <feColorMatrix type="matrix" values="1 0 0 0 0.9  0 0 0 0 0.2  0 0 0 0 0.3  0 0 0 1 0" />
                <feComposite in="SourceGraphic" operator="over" />
              </filter>

              {/* Dynamic Arrowheads per relationship type */}
              {availableTypes.map((t) => {
                const color = getEdgeColor(t);
                return (
                  <marker
                    key={`arrow-${t}`}
                    id={`arrow-${t.toLowerCase().replace(/[^a-z0-9]/g, "_")}`}
                    viewBox="0 -5 10 10"
                    refX="28"
                    refY="0"
                    markerWidth="6"
                    markerHeight="6"
                    orient="auto"
                  >
                    <path d="M0,-4L10,0L0,4" fill={color} />
                  </marker>
                );
              })}
              <marker
                id="arrow-default"
                viewBox="0 -5 10 10"
                refX="28"
                refY="0"
                markerWidth="6"
                markerHeight="6"
                orient="auto"
              >
                <path d="M0,-4L10,0L0,4" fill="#d4af37" />
              </marker>
            </defs>

            {/* Transform Group (Zoom & Pan) */}
            <g transform={`translate(${pan.x}, ${pan.y}) scale(${zoom})`}>
              {/* EDGES LAYER */}
              {edges.map((edge) => {
                const sNode = nodePositionMap.get(edge.source);
                const tNode = nodePositionMap.get(edge.target);
                if (!sNode || !tNode) return null;

                const isConnectedToHover =
                  hoveredNodeId === edge.source || hoveredNodeId === edge.target;
                const isEdgeHovered = hoveredEdgeId === edge.id;
                const dim =
                  hoveredNodeId !== null && !isConnectedToHover && !isEdgeHovered;

                const edgeColor = getEdgeColor(edge.relationshipType);
                const markerId = `arrow-${edge.relationshipType.toLowerCase().replace(/[^a-z0-9]/g, "_")}`;

                // Calculate curved Bezier path
                const dx = tNode.x - sNode.x;
                const dy = tNode.y - sNode.y;
                const dist = Math.sqrt(dx * dx + dy * dy);
                const midX = (sNode.x + tNode.x) / 2;
                const midY = (sNode.y + tNode.y) / 2;
                // Offset perpendicular
                const curvature = 20;
                const ctrlX = midX - (dy / (dist || 1)) * curvature;
                const ctrlY = midY + (dx / (dist || 1)) * curvature;

                return (
                  <g
                    key={edge.id}
                    className="transition-opacity duration-200"
                    opacity={dim ? 0.15 : 1}
                    onMouseEnter={() => setHoveredEdgeId(edge.id)}
                    onMouseLeave={() => setHoveredEdgeId(null)}
                  >
                    {/* Background hit line for easier hovering */}
                    <path
                      d={`M ${sNode.x} ${sNode.y} Q ${ctrlX} ${ctrlY} ${tNode.x} ${tNode.y}`}
                      fill="none"
                      stroke="transparent"
                      strokeWidth="14"
                      className="cursor-pointer"
                    />

                    {/* Visible Edge */}
                    <path
                      d={`M ${sNode.x} ${sNode.y} Q ${ctrlX} ${ctrlY} ${tNode.x} ${tNode.y}`}
                      fill="none"
                      stroke={edgeColor}
                      strokeWidth={Math.max(1.5, Math.min(5, edge.intensity * 0.5))}
                      strokeOpacity={isConnectedToHover || isEdgeHovered ? 0.95 : 0.65}
                      markerEnd={`url(#${markerId})`}
                    />

                    {/* Edge Label on hover */}
                    {(isEdgeHovered || isConnectedToHover) && (
                      <g transform={`translate(${ctrlX}, ${ctrlY})`}>
                        <rect
                          x="-45"
                          y="-11"
                          width="90"
                          height="20"
                          rx="4"
                          fill="#090d24"
                          stroke={edgeColor}
                          strokeWidth="1"
                        />
                        <text
                          textAnchor="middle"
                          y="3"
                          fill="#faf8f2"
                          fontSize="9"
                          fontFamily="monospace"
                        >
                          {edge.relationshipType} ({edge.intensity})
                        </text>
                      </g>
                    )}
                  </g>
                );
              })}

              {/* NODES LAYER */}
              {nodes.map((node) => {
                const isHovered = hoveredNodeId === node.id;
                const isDimmed =
                  connectedNodeIds !== null && !connectedNodeIds.has(node.id);

                return (
                  <g
                    key={node.id}
                    transform={`translate(${node.x}, ${node.y})`}
                    className="cursor-pointer transition-opacity duration-200"
                    opacity={isDimmed ? 0.25 : 1}
                    onMouseEnter={() => setHoveredNodeId(node.id)}
                    onMouseLeave={() => setHoveredNodeId(null)}
                    onMouseDown={(e) => {
                      e.stopPropagation();
                      setDraggedNodeId(node.id);
                    }}
                    onClick={() => onOpenCharacter(node.id)}
                  >
                    {/* Paradox Glow Ring if character has active continuity finding */}
                    {node.hasParadox && (
                      <circle
                        r={node.radius + 8}
                        fill="none"
                        stroke="#e74c3c"
                        strokeWidth="2.5"
                        strokeDasharray="4 2"
                        className="animate-spin"
                        style={{ transformOrigin: "center" }}
                      />
                    )}

                    {/* Hover Glow Ring */}
                    {isHovered && (
                      <circle
                        r={node.radius + 6}
                        fill="none"
                        stroke="#fae48f"
                        strokeWidth="2"
                        filter="url(#glow-gold)"
                      />
                    )}

                    {/* Main Node Body */}
                    <circle
                      r={node.radius}
                      fill={node.status === "deceased" ? "#140a14" : "#090f26"}
                      stroke={
                        node.hasParadox
                          ? "#e74c3c"
                          : isHovered
                          ? "#fae48f"
                          : node.status === "ascended"
                          ? "#a569bd"
                          : node.status === "deceased"
                          ? "#566573"
                          : "#d4af37"
                      }
                      strokeWidth={isHovered ? 3 : 2}
                    />

                    {/* Character Initials or Glyph */}
                    <text
                      textAnchor="middle"
                      y="-2"
                      fill="#faf8f2"
                      fontSize={node.radius > 30 ? "13" : "11"}
                      fontFamily="Cinzel, serif"
                      fontWeight="bold"
                      pointerEvents="none"
                    >
                      {node.name.slice(0, 3).toUpperCase()}
                    </text>

                    {/* Connection Count Badge inside node */}
                    <text
                      textAnchor="middle"
                      y="12"
                      fill="#fae48f"
                      fontSize="9"
                      fontFamily="monospace"
                      pointerEvents="none"
                    >
                      {node.connectionsCount} bonds
                    </text>

                    {/* Node Name Label Below */}
                    <text
                      textAnchor="middle"
                      y={node.radius + 14}
                      fill={isHovered ? "#fae48f" : "#dedbd0"}
                      fontSize="10"
                      fontFamily="Cinzel, serif"
                      fontWeight="600"
                      pointerEvents="none"
                    >
                      {node.name}
                    </text>

                    {/* Paradox indicator badge on top right */}
                    {node.hasParadox && (
                      <g transform={`translate(${node.radius * 0.7}, ${-node.radius * 0.7})`}>
                        <circle r="7" fill="#e74c3c" />
                        <text
                          textAnchor="middle"
                          y="3"
                          fill="#ffffff"
                          fontSize="8"
                          fontWeight="bold"
                          fontFamily="monospace"
                        >
                          !
                        </text>
                      </g>
                    )}
                  </g>
                );
              })}
            </g>
          </svg>
        </div>
      )}
    </div>
  );
}
