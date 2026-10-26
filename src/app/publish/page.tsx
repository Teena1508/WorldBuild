"use client";

import React, { useState, useEffect, useCallback, Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  Search,
  BookOpen,
  Sparkles,
  User,
  RefreshCw,
  ShieldCheck,
  X,
} from "lucide-react";
import { StarfieldCanvas } from "@/components/ui/StarfieldCanvas";
import { Navbar } from "@/components/ui/Navbar";
import { Footer } from "@/components/ui/Footer";
import { BookCover } from "@/components/ui/BookCover";

interface PublishedStorySummary {
  id: string;
  slug: string;
  title: string;
  description: string;
  cover_url: string | null;
  genres: string[];
  tags: string[];
  author_name: string;
  published_at: string;
  chapters_count: number;
  total_words: number;
}

const GENRE_FILTERS = [
  "All",
  "Dark Fantasy",
  "High Fantasy",
  "Grimdark",
  "Cosmic Horror",
  "Mythic Lore",
  "Sword & Sorcery",
];

function PublishExploreContent() {
  const searchParams = useSearchParams();
  const urlQuery = searchParams.get("q") || searchParams.get("author") || "";

  const [stories, setStories] = useState<PublishedStorySummary[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [prevUrlQuery, setPrevUrlQuery] = useState(urlQuery);
  const [searchQuery, setSearchQuery] = useState(urlQuery);
  const [selectedGenre, setSelectedGenre] = useState("All");
  const [sortBy, setSortBy] = useState<"recent" | "popular" | "alpha">("recent");

  if (urlQuery !== prevUrlQuery) {
    setPrevUrlQuery(urlQuery);
    setSearchQuery(urlQuery);
    setPage(1);
  }

  const fetchPublishedStories = useCallback(async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams();
      if (searchQuery.trim()) params.set("q", searchQuery.trim());
      if (selectedGenre !== "All") params.set("genre", selectedGenre);
      params.set("sort", sortBy);
      params.set("page", page.toString());
      params.set("limit", "9");

      const res = await fetch(`/api/public/stories?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setStories(data.stories || []);
        setTotal(data.total || 0);
        setTotalPages(data.totalPages || 1);
      }
    } catch {
      // ignore
    } finally {
      setIsLoading(false);
    }
  }, [searchQuery, selectedGenre, sortBy, page]);

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchPublishedStories();
    }, 200);
    return () => clearTimeout(timer);
  }, [fetchPublishedStories]);

  return (
    <div className="relative min-h-screen bg-[#040509] text-[#e0ddcf] selection:bg-[#d4af37]/30 selection:text-[#fae48f] overflow-x-hidden flex flex-col justify-between">
      <StarfieldCanvas />

      <Navbar onOpenUniverseModal={() => {}} />

      <main className="flex-1 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-28 pb-20 w-full">
        {/* Hero Header */}
        <div className="text-center max-w-3xl mx-auto mb-10 space-y-4">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-[#d4af37]/30 bg-[#0d1226]/80 text-[#fae48f] text-xs font-mono tracking-widest uppercase">
            <Sparkles className="w-3.5 h-3.5 text-[#d4af37]" />
            <span>Public Celestial Scriptorium</span>
          </div>

          <h1 className="font-cinzel text-3xl sm:text-5xl font-bold tracking-wider text-transparent bg-clip-text bg-gradient-to-r from-[#fae48f] via-[#f0db84] to-[#a8892d]">
            Published Chronicles & Sagas
          </h1>

          <p className="text-sm sm:text-base text-[#a5a3c0] font-sans leading-relaxed">
            Find and read books written by authors across the Sanctum. Only author-architects can edit their personal manuscripts; readers enjoy canonical, immutable editions.
          </p>

          {/* Reader Security Note */}
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-xl border border-cyan-500/20 bg-cyan-950/20 text-cyan-300 text-xs font-mono">
            <ShieldCheck className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
            <span>Author-isolated publishing: only authors can edit or update their books; readers cannot modify stories.</span>
          </div>
        </div>

        {/* Filter & Search Bar */}
        <div className="p-4 sm:p-5 rounded-2xl border border-[#1e274a] bg-[#070b1e]/80 backdrop-blur-md shadow-xl mb-10 space-y-4">
          <div className="flex flex-col md:flex-row gap-4 items-center justify-between">
            {/* Search Input */}
            <div className="relative w-full md:w-96">
              <Search className="w-4 h-4 absolute left-3.5 top-3.5 text-[#7e7c99]" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setPage(1);
                }}
                placeholder="Search by author name, book title, or keyword..."
                className="w-full pl-10 pr-9 py-2.5 rounded-xl bg-[#0d122b] border border-[#212b50] focus:border-[#d4af37] focus:outline-none text-xs text-[#e0ddcf] placeholder-[#5d5b78]"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => {
                    setSearchQuery("");
                    setPage(1);
                  }}
                  className="absolute right-3 top-3 text-[#7e7c99] hover:text-white"
                  title="Clear search"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            {/* Sorting */}
            <div className="flex items-center gap-3 w-full md:w-auto justify-end">
              <span className="text-xs font-mono text-[#7e7c99]">Sort by:</span>
              <select
                value={sortBy}
                onChange={(e) => {
                  setSortBy(e.target.value as "recent" | "popular" | "alpha");
                  setPage(1);
                }}
                className="px-3 py-2 rounded-xl bg-[#0d122b] border border-[#212b50] text-xs font-mono text-[#c4c1d8] focus:border-[#d4af37] focus:outline-none cursor-pointer"
              >
                <option value="recent">Most Recently Inscribed</option>
                <option value="popular">Publication Edition</option>
                <option value="alpha">Alphabetical</option>
              </select>
            </div>
          </div>

          {/* Active Search Filter Badge */}
          {searchQuery && (
            <div className="flex items-center gap-2 pt-1 text-xs font-mono text-[#fae48f]">
              <span className="text-[#7e7c99]">Filtering by:</span>
              <span className="px-2.5 py-1 rounded-md bg-[#161d3f] border border-[#d4af37]/40 flex items-center gap-1.5">
                <span>&ldquo;{searchQuery}&rdquo;</span>
                <button
                  type="button"
                  onClick={() => setSearchQuery("")}
                  className="text-[#9e9cb8] hover:text-white cursor-pointer"
                  title="Clear filter"
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            </div>
          )}

          {/* Genre Filters */}
          <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-[#182142]">
            {GENRE_FILTERS.map((genre) => (
              <button
                key={genre}
                onClick={() => {
                  setSelectedGenre(genre);
                  setPage(1);
                }}
                className={`px-3 py-1 rounded-full text-xs font-mono transition-all cursor-pointer ${
                  selectedGenre === genre
                    ? "bg-[#d4af37] text-black font-bold shadow-[0_0_12px_rgba(212,175,55,0.4)]"
                    : "bg-[#0f142e] text-[#8e8ca9] hover:text-[#fae48f] border border-[#1b2349]"
                }`}
              >
                {genre}
              </button>
            ))}
            {total > 0 && (
              <span className="sm:ml-auto text-xs font-mono text-[#7e7c99]">
                {total} {total === 1 ? "chronicle" : "chronicles"} inscribed
              </span>
            )}
          </div>
        </div>

        {/* Story Grid */}
        {isLoading ? (
          <div className="py-24 flex flex-col items-center justify-center gap-3 text-[#7e7c99]">
            <RefreshCw className="w-8 h-8 animate-spin text-[#d4af37]" />
            <p className="text-xs font-mono">Unfolding archived manuscripts...</p>
          </div>
        ) : stories.length === 0 ? (
          <div className="py-20 text-center rounded-2xl border border-dashed border-[#1e274a] bg-[#070919]/50 max-w-xl mx-auto space-y-4">
            <BookOpen className="w-12 h-12 mx-auto text-[#d4af37]/40" />
            <h3 className="font-cinzel text-lg font-bold text-[#fae48f]">
              No Published Chronicles Found
            </h3>
            <p className="text-xs text-[#8a87a8] font-mono max-w-md mx-auto leading-relaxed">
              {searchQuery || selectedGenre !== "All"
                ? `No published manuscripts matched "${searchQuery || selectedGenre}". Try adjusting your author or keyword search.`
                : "The celestial archives await the first authorized publication from a Sanctum author."}
            </p>
            {(searchQuery || selectedGenre !== "All") && (
              <button
                onClick={() => {
                  setSearchQuery("");
                  setSelectedGenre("All");
                  setPage(1);
                }}
                className="px-4 py-2 rounded-xl bg-[#141b38] border border-[#d4af37]/40 text-xs font-mono text-[#fae48f] hover:bg-[#1b244d] transition-all cursor-pointer"
              >
                Reset Search Filters
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 sm:gap-8">
            {stories.map((story) => (
              <Link
                key={story.id}
                href={`/read/${story.slug}`}
                className="celestial-card group rounded-2xl border border-[#1b2344] bg-[#070b1e]/90 hover:border-[#d4af37]/60 transition-all duration-300 overflow-hidden flex flex-col hover:-translate-y-1 shadow-lg"
              >
                {/* Cover Banner */}
                <div className="w-full overflow-hidden">
                  <BookCover
                    src={story.cover_url}
                    alt={story.title}
                    title={story.title}
                    author={story.author_name}
                    aspect="landscape"
                  />
                </div>

                {/* Body Details */}
                <div className="p-5 flex-1 flex flex-col justify-between space-y-4">
                  <div className="space-y-2">
                    {/* Genre Badges */}
                    <div className="flex flex-wrap gap-1.5">
                      {story.genres.slice(0, 2).map((g) => (
                        <span
                          key={g}
                          className="px-2 py-0.5 rounded text-[10px] font-mono tracking-wider uppercase bg-[#141b38] text-[#fae48f] border border-[#232e5e]"
                        >
                          {g}
                        </span>
                      ))}
                    </div>

                    <h2 className="font-cinzel text-lg font-bold text-[#e0ddcf] group-hover:text-[#fae48f] transition-colors line-clamp-1">
                      {story.title}
                    </h2>

                    <p className="text-xs text-[#9a98b4] line-clamp-2 leading-relaxed">
                      {story.description || "An untold manuscript awaiting reader exploration."}
                    </p>
                  </div>

                  {/* Metadata Footer */}
                  <div className="pt-3 border-t border-[#161d36] flex items-center justify-between text-[11px] font-mono text-[#7e7c99]">
                    {/* Clickable Author Badge to Find Other Books by This Author */}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setSearchQuery(story.author_name);
                        setPage(1);
                      }}
                      className="flex items-center gap-1.5 truncate max-w-[150px] hover:text-[#fae48f] transition-colors cursor-pointer group/author"
                      title={`Find all books by author ${story.author_name}`}
                    >
                      <User className="w-3.5 h-3.5 text-[#d4af37] group-hover/author:scale-110 transition-transform" />
                      <span className="truncate underline-offset-2 group-hover/author:underline">{story.author_name}</span>
                    </button>

                    <div className="flex items-center gap-3 shrink-0">
                      <span>{story.chapters_count} ch</span>
                      <span>•</span>
                      <span>{story.total_words.toLocaleString()} words</span>
                    </div>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}

        {/* Pagination Controls */}
        {totalPages > 1 && (
          <div className="mt-12 flex items-center justify-center gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="px-3.5 py-1.5 rounded-lg border border-[#1b223c] bg-[#0c1024] text-xs font-mono text-[#fae48f] disabled:opacity-30 disabled:cursor-not-allowed hover:border-[#d4af37]/40"
            >
              Previous
            </button>
            <span className="px-3 py-1.5 text-xs font-mono text-[#8a87a8]">
              Page {page} of {totalPages}
            </span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="px-3.5 py-1.5 rounded-lg border border-[#1b223c] bg-[#0c1024] text-xs font-mono text-[#fae48f] disabled:opacity-30 disabled:cursor-not-allowed hover:border-[#d4af37]/40"
            >
              Next
            </button>
          </div>
        )}
      </main>

      <Footer />
    </div>
  );
}

export default function PublishExplorePage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[#040509] flex items-center justify-center">
          <StarfieldCanvas />
          <div className="font-mono text-xs text-[#fae48f] tracking-widest uppercase">
            Opening Celestial Library Archives...
          </div>
        </div>
      }
    >
      <PublishExploreContent />
    </Suspense>
  );
}
