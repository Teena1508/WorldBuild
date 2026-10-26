"use client";

import React, { useState, useEffect, Suspense } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  ArrowLeft,
  BookOpen,
  ChevronLeft,
  ChevronRight,
  ShieldAlert,
  Search,
} from "lucide-react";
import { StarfieldCanvas } from "@/components/ui/StarfieldCanvas";

interface ChapterReaderData {
  story: {
    slug: string;
    title: string;
    author_name: string;
  };
  sequence_number: number;
  title: string;
  content: string;
  word_count: number;
  published_at: string;
  prev_sequence: number | null;
  next_sequence: number | null;
  total_chapters: number;
}

function ChapterReaderContent() {
  const params = useParams();
  const slug = params?.slug as string;
  const sequenceStr = params?.sequence as string;
  const sequence = parseInt(sequenceStr, 10);

  const [chapter, setChapter] = useState<ChapterReaderData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [fontSize, setFontSize] = useState<"sm" | "md" | "lg" | "xl">("md");
  const [fontFamily, setFontFamily] = useState<"serif" | "sans">("serif");

  useEffect(() => {
    if (!slug || isNaN(sequence)) return;
    let active = true;

    fetch(`/api/public/stories/${encodeURIComponent(slug)}/chapters/${sequence}`)
      .then(async (res) => {
        if (!res.ok) {
          if (active) {
            setNotFound(true);
            setIsLoading(false);
          }
          return null;
        }
        return res.json();
      })
      .then((data) => {
        if (!active) return;
        if (data?.chapter) {
          setChapter(data.chapter);
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
  }, [slug, sequence]);

  const fontSizeClasses = {
    sm: "text-sm sm:text-base leading-relaxed",
    md: "text-base sm:text-lg leading-loose",
    lg: "text-lg sm:text-xl leading-loose",
    xl: "text-xl sm:text-2xl leading-loose",
  }[fontSize];

  if (isLoading) {
    return (
      <div className="relative min-h-screen bg-[#040509] text-[#e0ddcf] flex flex-col justify-center items-center">
        <StarfieldCanvas />
        <div className="py-40 flex flex-col items-center justify-center gap-3 text-[#7e7c99]">
          <div className="w-8 h-8 rounded-full border-2 border-[#d4af37] border-t-transparent animate-spin" />
          <p className="text-xs font-mono">Unrolling published parchment...</p>
        </div>
      </div>
    );
  }

  if (notFound || !chapter) {
    return (
      <div className="relative min-h-screen bg-[#040509] text-[#e0ddcf] flex flex-col justify-center items-center">
        <StarfieldCanvas />
        <div className="max-w-md mx-auto py-40 px-4 text-center space-y-4">
          <ShieldAlert className="w-12 h-12 mx-auto text-[#d4af37]/50" />
          <h1 className="font-cinzel text-xl font-bold text-[#fae48f]">
            Chapter Unavailable
          </h1>
          <p className="text-xs font-mono text-[#8a87a8] leading-relaxed">
            This chapter may not exist, is still in private manuscript draft, or has not been included in the current publication.
          </p>
          <div className="pt-2">
            <Link
              href={`/read/${slug}`}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[#141a38] text-[#fae48f] hover:bg-[#1b234a] border border-[#232d56] text-xs font-mono transition-all"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Back to Story Overview</span>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative min-h-screen bg-[#040509] text-[#e0ddcf] selection:bg-[#d4af37]/30 selection:text-[#fae48f] overflow-x-hidden flex flex-col justify-between">
      <StarfieldCanvas />

      {/* Reader Fixed Top Bar */}
      <header className="sticky top-0 z-30 bg-[#060814]/90 backdrop-blur-md border-b border-[#1b223c] py-3 shadow-[0_4px_30px_rgba(0,0,0,0.6)]">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 flex items-center justify-between">
          <Link
            href={`/read/${chapter.story.slug}`}
            className="flex items-center gap-2 text-xs font-mono text-[#8a87a8] hover:text-[#fae48f] transition-colors truncate max-w-[200px] sm:max-w-md"
          >
            <ArrowLeft className="w-4 h-4 shrink-0 text-[#d4af37]" />
            <span className="truncate font-semibold text-[#e0ddcf]">
              {chapter.story.title}
            </span>
          </Link>

          {/* Reader Preferences & Library Link */}
          <div className="flex items-center gap-2 sm:gap-4">
            <Link
              href="/publish"
              className="hidden sm:flex items-center gap-1 px-2.5 py-1 rounded text-xs font-mono text-[#8a87a8] hover:text-[#fae48f] border border-[#1e274a] bg-[#0e1329] transition-colors"
              title="Search and find books of other authors"
            >
              <Search className="w-3 h-3 text-[#d4af37]" />
              <span>Other Books</span>
            </Link>

            {/* Font Family Toggle */}
            <button
              onClick={() => setFontFamily(fontFamily === "serif" ? "sans" : "serif")}
              className="px-2 py-1 rounded text-xs font-mono bg-[#0e1329] text-[#fae48f] border border-[#1e274a] hover:border-[#d4af37]/50"
              title="Toggle font style"
            >
              {fontFamily === "serif" ? "Serif" : "Sans"}
            </button>

            {/* Font Size Selector */}
            <div className="flex items-center gap-1 border border-[#1e274a] rounded-lg bg-[#0e1329] p-0.5 text-xs font-mono">
              {(["sm", "md", "lg"] as const).map((s) => (
                <button
                  key={s}
                  onClick={() => setFontSize(s)}
                  className={`px-2 py-0.5 rounded cursor-pointer ${
                    fontSize === s
                      ? "bg-[#d4af37] text-black font-bold"
                      : "text-[#8a87a8] hover:text-[#fae48f]"
                  }`}
                >
                  {s.toUpperCase()}
                </button>
              ))}
            </div>
          </div>
        </div>
      </header>

      {/* Main Reading Surface */}
      <main className="flex-1 max-w-3xl mx-auto px-5 sm:px-8 py-12 w-full">
        {/* Chapter Header */}
        <div className="text-center mb-12 space-y-3 pb-8 border-b border-[#182142]">
          <div className="inline-flex items-center gap-2 text-xs font-mono uppercase tracking-widest text-[#d4af37]">
            <span>Chapter {chapter.sequence_number} of {chapter.total_chapters}</span>
          </div>

          <h1 className="font-cinzel text-2xl sm:text-4xl font-bold tracking-wide text-transparent bg-clip-text bg-gradient-to-r from-[#fae48f] via-[#f0db84] to-[#a8892d]">
            {chapter.title}
          </h1>

          <div className="flex items-center justify-center gap-3 text-xs font-mono text-[#7e7c99] pt-1">
            <Link
              href={`/publish?q=${encodeURIComponent(chapter.story.author_name)}`}
              className="text-[#fae48f] hover:underline"
              title={`Find other books by author ${chapter.story.author_name}`}
            >
              By {chapter.story.author_name}
            </Link>
            <span>•</span>
            <span>{chapter.word_count.toLocaleString()} words</span>
            <span>•</span>
            <span>~{Math.ceil(chapter.word_count / 250)} min read</span>
          </div>
        </div>

        {/* Chapter Manuscript Content */}
        <article
          className={`space-y-6 text-[#dedad0] font-normal transition-all ${
            fontFamily === "serif" ? "font-serif" : "font-sans"
          } ${fontSizeClasses}`}
        >
          {chapter.content.split(/\n\s*\n/).map((paragraph, idx) => {
            const clean = paragraph.trim();
            if (!clean) return null;
            return (
              <p
                key={idx}
                className="indent-6 sm:indent-8 first:indent-0 text-justify hyphens-auto selection:bg-[#d4af37]/30"
              >
                {clean}
              </p>
            );
          })}
        </article>

        {/* Chapter Footer Navigation */}
        <div className="mt-16 pt-8 border-t border-[#182142] flex flex-col sm:flex-row items-center justify-between gap-4">
          <div>
            {chapter.prev_sequence ? (
              <Link
                href={`/read/${slug}/${chapter.prev_sequence}`}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-[#1b223c] bg-[#090d20] hover:bg-[#0f1533] hover:border-[#d4af37]/40 text-xs font-mono text-[#fae48f] transition-all cursor-pointer"
              >
                <ChevronLeft className="w-4 h-4" />
                <span>Previous Chapter ({chapter.prev_sequence})</span>
              </Link>
            ) : (
              <Link
                href={`/read/${slug}`}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-[#1b223c] bg-[#090d20] hover:bg-[#0f1533] text-xs font-mono text-[#7e7c99] transition-all cursor-pointer"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>Story Overview</span>
              </Link>
            )}
          </div>

          <div className="text-center text-xs font-mono text-[#6c6a85]">
            Chapter {chapter.sequence_number} / {chapter.total_chapters}
          </div>

          <div>
            {chapter.next_sequence ? (
              <Link
                href={`/read/${slug}/${chapter.next_sequence}`}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-[#d4af37] to-[#fae48f] hover:from-[#c29f2f] hover:to-[#ebd57f] text-black font-semibold text-xs font-mono tracking-wider uppercase transition-all shadow-[0_0_15px_rgba(212,175,55,0.25)] cursor-pointer"
              >
                <span>Next Chapter ({chapter.next_sequence})</span>
                <ChevronRight className="w-4 h-4" />
              </Link>
            ) : (
              <Link
                href={`/read/${slug}`}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl border border-[#d4af37]/40 bg-[#0d122b] hover:bg-[#141b3d] text-xs font-mono text-[#fae48f] transition-all cursor-pointer"
              >
                <BookOpen className="w-4 h-4" />
                <span>Chronicle Complete (Overview)</span>
              </Link>
            )}
          </div>
        </div>
      </main>

      {/* Reading Footer */}
      <footer className="py-6 border-t border-[#121730] text-center text-xs font-mono text-[#5f5d78]">
        WORLDBUILD Published Manuscript • Immutable Reader Snapshot
      </footer>
    </div>
  );
}

export default function PublicChapterReaderPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[#040509] text-[#e0ddcf] flex flex-col justify-center items-center">
          <div className="w-8 h-8 rounded-full border-2 border-[#d4af37] border-t-transparent animate-spin" />
        </div>
      }
    >
      <ChapterReaderContent />
    </Suspense>
  );
}
