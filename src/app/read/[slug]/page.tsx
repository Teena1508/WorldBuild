"use client";

import React, { useState, useEffect, Suspense } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  BookOpen,
  Clock,
  Layers,
  ArrowRight,
  ArrowLeft,
  ShieldAlert,
  Share2,
  Check,
  Feather,
  Search,
} from "lucide-react";
import { StarfieldCanvas } from "@/components/ui/StarfieldCanvas";
import { Navbar } from "@/components/ui/Navbar";
import { Footer } from "@/components/ui/Footer";
import { BookCover } from "@/components/ui/BookCover";

interface PublicStoryData {
  id: string;
  slug: string;
  title: string;
  description: string;
  cover_url: string | null;
  genres: string[];
  tags: string[];
  publication_version: number;
  published_at: string;
  updated_at: string;
  author: {
    id: string;
    display_name: string;
    pen_name?: string;
    bio?: string;
    avatar_url?: string | null;
  };
  chapters: {
    sequence_number: number;
    title: string;
    word_count: number;
    published_at: string;
  }[];
  total_words: number;
  chapters_count: number;
}

function StoryDetailContent() {
  const params = useParams();
  const slug = params?.slug as string;

  const [story, setStory] = useState<PublicStoryData | null>(null);
  const [currentUser, setCurrentUser] = useState<{ id: string; display_name: string } | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.user) setCurrentUser(data.user);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!slug) return;
    let active = true;

    fetch(`/api/public/stories/${encodeURIComponent(slug)}`)
      .then(async (res) => {
        if (res.status === 404) {
          if (active) {
            setNotFound(true);
            setIsLoading(false);
          }
          return null;
        }
        if (!res.ok) throw new Error("Failed to load story");
        return res.json();
      })
      .then((data) => {
        if (!active) return;
        if (data?.story) {
          setStory(data.story);
          setNotFound(false);
        } else {
          setNotFound(true);
        }
      })
      .catch(() => {
        if (active) setNotFound(true);
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });

    return () => {
      active = false;
    };
  }, [slug]);

  const handleShare = () => {
    if (typeof window !== "undefined") {
      navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    }
  };

  if (isLoading) {
    return (
      <div className="relative min-h-screen bg-[#040509] text-[#e0ddcf] flex flex-col justify-between">
        <StarfieldCanvas />
        <Navbar onOpenUniverseModal={() => {}} />
        <div className="py-40 flex flex-col items-center justify-center gap-3 text-[#7e7c99]">
          <div className="w-8 h-8 rounded-full border-2 border-[#d4af37] border-t-transparent animate-spin" />
          <p className="text-xs font-mono">Retrieving published manuscript...</p>
        </div>
        <Footer />
      </div>
    );
  }

  if (notFound || !story) {
    return (
      <div className="relative min-h-screen bg-[#040509] text-[#e0ddcf] flex flex-col justify-between">
        <StarfieldCanvas />
        <Navbar onOpenUniverseModal={() => {}} />
        <div className="max-w-lg mx-auto py-40 px-4 text-center space-y-4">
          <ShieldAlert className="w-12 h-12 mx-auto text-[#d4af37]/50" />
          <h1 className="font-cinzel text-2xl font-bold text-[#fae48f]">
            Manuscript Not Found
          </h1>
          <p className="text-xs font-mono text-[#8a87a8] leading-relaxed">
            This story may be in private draft status, unpublished by its author, or the URL slug may be incorrect.
          </p>
          <div className="pt-2">
            <Link
              href="/publish"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[#141a38] text-[#fae48f] hover:bg-[#1b234a] border border-[#232d56] text-xs font-mono transition-all"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Return to Public Library</span>
            </Link>
          </div>
        </div>
        <Footer />
      </div>
    );
  }

  const firstChapter = story.chapters[0];

  return (
    <div className="relative min-h-screen bg-[#040509] text-[#e0ddcf] selection:bg-[#d4af37]/30 selection:text-[#fae48f] overflow-x-hidden flex flex-col justify-between">
      <StarfieldCanvas />
      <Navbar onOpenUniverseModal={() => {}} />

      <main className="flex-1 max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 pt-28 pb-20 w-full">
        {/* Back link */}
        <div className="mb-6">
          <Link
            href="/publish"
            className="inline-flex items-center gap-1.5 text-xs font-mono text-[#7e7c99] hover:text-[#fae48f] transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Back to Public Library</span>
          </Link>
        </div>

        {/* Hero Banner Card */}
        <div className="rounded-3xl border border-[#1b223c] bg-[#070b1e]/90 backdrop-blur-md shadow-2xl p-6 sm:p-10 mb-12">
          <div className="flex flex-col md:flex-row gap-8 items-start">
            {/* Cover Portrait */}
            <div className="w-full md:w-64 shrink-0 shadow-2xl mx-auto md:mx-0">
              <BookCover
                src={story.cover_url}
                alt={story.title}
                title={story.title}
                author={story.author.pen_name || story.author.display_name}
                aspect="portrait"
              />
            </div>

            {/* Story Details */}
            <div className="flex-1 flex flex-col justify-between space-y-6 w-full">
              <div className="space-y-3">
                {/* Genres & Edition Badge */}
                <div className="flex flex-wrap items-center gap-2">
                  {story.genres.map((g) => (
                    <span
                      key={g}
                      className="px-2.5 py-0.5 rounded-full text-[10px] font-mono tracking-wider uppercase bg-[#141b38] text-[#fae48f] border border-[#232e5e]"
                    >
                      {g}
                    </span>
                  ))}
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-mono bg-[#0c182a] text-[#80a4e6] border border-[#1c305a]">
                    Edition v{story.publication_version}
                  </span>
                </div>

                <h1 className="font-cinzel text-2xl sm:text-4xl font-bold tracking-wide text-transparent bg-clip-text bg-gradient-to-r from-[#fae48f] via-[#f0db84] to-[#a8892d]">
                  {story.title}
                </h1>

                {/* Author Info & Search other books by this author */}
                <div className="flex flex-wrap items-center gap-3 text-xs font-mono text-[#c4c1d8]">
                  <div className="flex items-center gap-1.5">
                    <span>Penned by</span>
                    <Link
                      href={`/publish?q=${encodeURIComponent(story.author.pen_name || story.author.display_name)}`}
                      className="text-[#fae48f] font-semibold hover:underline flex items-center gap-1"
                      title="Click to search other books by this author"
                    >
                      <span>{story.author.pen_name || story.author.display_name}</span>
                      <Search className="w-3 h-3 text-[#d4af37]" />
                    </Link>
                  </div>
                  <Link
                    href={`/publish?q=${encodeURIComponent(story.author.pen_name || story.author.display_name)}`}
                    className="px-2 py-0.5 rounded-full border border-[#263259] bg-[#0c122b] hover:border-[#d4af37]/50 text-[10px] text-[#fae48f] transition-all"
                  >
                    View author&apos;s other books →
                  </Link>
                </div>

                {/* Author vs Reader Isolation Banner */}
                {currentUser?.id === story.author.id ? (
                  <div className="p-3 rounded-xl border border-[#d4af37]/40 bg-[#0e173b]/90 flex items-center justify-between gap-3 text-xs font-mono animate-fade-in">
                    <div className="flex items-center gap-2 text-[#fae48f]">
                      <Feather className="w-4 h-4 text-[#d4af37] shrink-0" />
                      <span>You are the author of this book. Only you hold editing rights.</span>
                    </div>
                    <Link
                      href="/studio"
                      className="px-3 py-1.5 rounded-lg gold-glow-button text-xs font-bold text-[#fae48f] shrink-0"
                    >
                      Edit Manuscript
                    </Link>
                  </div>
                ) : (
                  <div className="py-1 text-[11px] font-mono text-[#7e7c99] flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                    <span>Authorized Public Edition • Read-only reader mode (only the author can edit)</span>
                  </div>
                )}

                {/* Description */}
                <p className="text-sm text-[#aba9c6] leading-relaxed font-sans pt-1">
                  {story.description || "An untold manuscript awaiting reader exploration."}
                </p>

                {/* Tags */}
                {story.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {story.tags.map((t) => (
                      <span
                        key={t}
                        className="text-[11px] font-mono text-[#6c6a85] before:content-['#'] hover:text-[#9e9cb8]"
                      >
                        {t}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* Stats & Actions */}
              <div className="pt-4 border-t border-[#161d36] flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4">
                <div className="flex items-center gap-4 text-xs font-mono text-[#7e7c99]">
                  <div className="flex items-center gap-1.5">
                    <Layers className="w-3.5 h-3.5 text-[#d4af37]" />
                    <span>{story.chapters_count} Chapters</span>
                  </div>
                  <span>•</span>
                  <div className="flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5 text-[#d4af37]" />
                    <span>{story.total_words.toLocaleString()} Words</span>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <Link
                    href="/publish"
                    className="p-2.5 rounded-xl border border-[#1e274a] bg-[#0c1228] text-[#fae48f] hover:bg-[#141c3d] text-xs font-mono transition-all flex items-center gap-1.5 cursor-pointer"
                    title="Find more books by other authors"
                  >
                    <Search className="w-4 h-4 text-[#d4af37]" />
                    <span className="hidden sm:inline">Browse Library</span>
                  </Link>

                  <button
                    onClick={handleShare}
                    className="p-2.5 rounded-xl border border-[#1e274a] bg-[#0c1228] text-[#fae48f] hover:bg-[#141c3d] text-xs font-mono transition-all flex items-center gap-1.5 cursor-pointer"
                    title="Share story link"
                  >
                    {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Share2 className="w-4 h-4" />}
                    <span className="hidden sm:inline">{copied ? "Copied" : "Share"}</span>
                  </button>

                  {firstChapter && (
                    <Link
                      href={`/read/${story.slug}/1`}
                      className="flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl bg-gradient-to-r from-[#d4af37] to-[#fae48f] hover:from-[#c29f2f] hover:to-[#ebd57f] text-black font-semibold text-xs font-mono tracking-wider uppercase transition-all shadow-[0_0_20px_rgba(212,175,55,0.3)] cursor-pointer"
                    >
                      <span>Begin Reading</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </Link>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Table of Contents */}
        <div className="rounded-3xl border border-[#1b223c] bg-[#070b1e]/90 backdrop-blur-md shadow-xl p-6 sm:p-8 space-y-6">
          <div className="flex items-center justify-between border-b border-[#182142] pb-4">
            <div>
              <h2 className="font-cinzel text-lg sm:text-xl font-bold text-[#fae48f]">
                Table of Contents
              </h2>
              <p className="text-xs font-mono text-[#7e7c99] mt-0.5">
                Authorized chapter manuscript snapshots
              </p>
            </div>
            <span className="text-xs font-mono text-[#8a87a8]">
              {story.chapters.length} Inscribed Chapters
            </span>
          </div>

          {story.chapters.length === 0 ? (
            <div className="py-12 text-center text-[#7e7c99]">
              <BookOpen className="w-8 h-8 mx-auto mb-2 opacity-30 text-[#d4af37]" />
              <p className="text-xs font-mono">This story contains no published chapters at present.</p>
            </div>
          ) : (
            <div className="divide-y divide-[#141b38]">
              {story.chapters.map((chapter) => (
                <Link
                  key={chapter.sequence_number}
                  href={`/read/${story.slug}/${chapter.sequence_number}`}
                  className="group py-3.5 px-3 -mx-3 rounded-xl flex items-center justify-between hover:bg-[#0d132e] transition-colors cursor-pointer"
                >
                  <div className="flex items-center gap-4">
                    <span className="w-7 h-7 rounded-lg border border-[#232d56] bg-[#0f1533] flex items-center justify-center text-xs font-mono font-bold text-[#fae48f] group-hover:border-[#d4af37]/60">
                      {chapter.sequence_number}
                    </span>
                    <div>
                      <h3 className="text-sm font-medium text-[#e0ddcf] group-hover:text-[#fae48f] transition-colors">
                        {chapter.title}
                      </h3>
                      <p className="text-[11px] font-mono text-[#7e7c99]">
                        {chapter.word_count.toLocaleString()} words • ~{Math.ceil(chapter.word_count / 250)} min read
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 text-xs font-mono text-[#fae48f] opacity-0 group-hover:opacity-100 transition-opacity">
                    <span>Read</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </main>

      <Footer />
    </div>
  );
}

export default function PublicStoryDetailPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[#040509] text-[#e0ddcf] flex flex-col justify-center items-center">
          <div className="w-8 h-8 rounded-full border-2 border-[#d4af37] border-t-transparent animate-spin" />
        </div>
      }
    >
      <StoryDetailContent />
    </Suspense>
  );
}
