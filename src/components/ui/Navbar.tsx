"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Sparkles, Compass, Eye, BookMarked, Menu, X, ArrowUpRight, Feather } from "lucide-react";

interface NavbarProps {
  onOpenUniverseModal: () => void;
  onReplayPrologue?: () => void;
}

export function Navbar({ onOpenUniverseModal, onReplayPrologue }: NavbarProps) {
  const router = useRouter();
  const [scrolled, setScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const [currentUser, setCurrentUser] = useState<{ id: string; display_name: string } | null>(null);

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 20);
    };
    window.addEventListener("scroll", handleScroll, { passive: true });
    
    // Fetch current authenticated user
    fetch("/api/auth/me")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.user) setCurrentUser(data.user);
      })
      .catch(() => {});

    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const scrollTo = (id: string) => {
    setMobileMenuOpen(false);
    const element = document.getElementById(id);
    if (element) {
      element.scrollIntoView({ behavior: "smooth" });
    }
  };

  return (
    <header
      className={`fixed top-0 left-0 right-0 z-40 transition-all duration-300 ${
        scrolled
          ? "bg-[#060813]/85 backdrop-blur-md border-b border-[#d4af37]/15 py-3 shadow-[0_4px_30px_rgba(0,0,0,0.6)]"
          : "bg-transparent py-5"
      }`}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between">
          {/* Brand Wordmark & Celestial Crest */}
          <Link
            href="/"
            className="group flex items-center gap-3 select-none"
            aria-label="WORLDBUILD Home"
          >
            <div className="relative flex items-center justify-center w-8 h-8 rounded-lg border border-[#d4af37]/40 bg-[#0d1226] text-[#fae48f] group-hover:border-[#fae48f] group-hover:shadow-[0_0_15px_rgba(212,175,55,0.3)] transition-all">
              <span className="font-cinzel text-xs font-bold">W</span>
              <div className="absolute -top-1 -right-1 w-1.5 h-1.5 rounded-full bg-[#fae48f]" />
            </div>
            <div className="flex flex-col">
              <span className="font-cinzel text-lg sm:text-xl font-bold tracking-[0.22em] text-[#fae48f] group-hover:text-white transition-colors">
                WORLDBUILD
              </span>
              <span className="text-[9px] font-mono tracking-[0.3em] uppercase text-[#7e7c99] -mt-0.5">
                Celestial Archive
              </span>
            </div>
          </Link>

          {/* Desktop Navigation Links */}
          <nav className="hidden md:flex items-center gap-6" aria-label="Main Navigation">
            <Link
              href="/vault"
              className="text-xs font-mono tracking-widest uppercase text-[#fae48f] hover:text-white transition-colors flex items-center gap-1.5 cursor-pointer font-semibold"
            >
              <Compass className="w-3.5 h-3.5 text-[#d4af37]" />
              <span>World Vault</span>
            </Link>

            <Link
              href={currentUser ? "/studio" : "/login?redirect=/studio"}
              className="text-xs font-mono tracking-widest uppercase text-[#fae48f] hover:text-white transition-colors flex items-center gap-1.5 cursor-pointer font-semibold"
            >
              <Feather className="w-3.5 h-3.5 text-[#d4af37]" />
              <span>Story Studio</span>
            </Link>

            <button
              onClick={() => scrollTo("world-pillars")}
              className="text-xs font-mono tracking-widest uppercase text-[#9e9cb8] hover:text-[#fae48f] transition-colors flex items-center gap-1.5 cursor-pointer"
            >
              <Eye className="w-3.5 h-3.5 text-[#d4af37]/70" />
              <span>The Oracle</span>
            </button>
          </nav>

          {/* Right Action Area */}
          <div className="hidden md:flex items-center gap-3">
            {/* Scribe Account Indicator & Auth Controls */}
            {currentUser ? (
              <div className="flex items-center gap-2">
                <Link
                  href="/vault"
                  className="px-3 py-1.5 rounded-full border border-[#1e274a] bg-[#090d22] hover:border-[#d4af37]/40 transition-all text-xs font-mono text-[#c4c1d8] flex items-center gap-2"
                  title="Your Personal World Vault"
                >
                  <div className="w-5 h-5 rounded-full bg-[#182042] border border-[#d4af37]/40 text-[#fae48f] text-[10px] flex items-center justify-center font-bold">
                    {currentUser.display_name ? currentUser.display_name.charAt(0).toUpperCase() : "S"}
                  </div>
                  <span className="truncate max-w-[120px] text-[#e0ddcf]">
                    {currentUser.display_name}
                  </span>
                </Link>
                <button
                  onClick={async () => {
                    await fetch("/api/auth/logout", { method: "POST" });
                    setCurrentUser(null);
                    router.push("/");
                    router.refresh();
                  }}
                  id="nav-logout-btn"
                  className="px-2.5 py-1.5 rounded-full border border-red-500/30 bg-red-950/20 hover:bg-red-900/40 text-red-300 text-xs font-mono transition-colors cursor-pointer"
                  title="Sign Out"
                >
                  Log Out
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <Link
                  href="/login"
                  id="nav-login-btn"
                  className="px-3.5 py-1.5 rounded-full border border-[#1e274a] bg-[#090d22] hover:border-[#d4af37]/40 transition-all text-xs font-mono text-[#c4c1d8] hover:text-[#fae48f]"
                >
                  Log In
                </Link>
                <Link
                  href="/login"
                  id="nav-signup-btn"
                  className="px-3.5 py-1.5 rounded-full border border-[#d4af37]/40 bg-[#121936] hover:bg-[#1a234c] text-xs font-mono text-[#fae48f] font-semibold"
                >
                  Sign Up
                </Link>
              </div>
            )}

            {onReplayPrologue && (
              <button
                onClick={onReplayPrologue}
                title="Replay Celestial Prologue"
                className="p-2 rounded-lg border border-[#202744] bg-[#0a0e20] text-[#7d7b9d] hover:text-[#fae48f] hover:border-[#d4af37]/30 transition-all cursor-pointer"
                aria-label="Replay Prologue"
              >
                <Sparkles className="w-4 h-4" />
              </button>
            )}

            <button
              onClick={onOpenUniverseModal}
              id="nav-enter-universe-btn"
              className="gold-glow-button relative group px-5 py-2.5 rounded-full text-xs font-mono tracking-widest uppercase font-semibold text-[#fae48f] cursor-pointer"
            >
              <span className="flex items-center gap-1.5">
                <span>Enter Your Universe</span>
                <ArrowUpRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
              </span>
            </button>
          </div>

          {/* Mobile Menu Toggle */}
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="md:hidden p-2 rounded-lg text-[#b8b5cc] hover:text-[#fae48f] border border-[#222946] bg-[#0c1024] cursor-pointer"
            aria-label="Toggle Navigation Menu"
          >
            {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {/* Mobile Drawer */}
      {mobileMenuOpen && (
        <div className="md:hidden border-b border-[#202742] bg-[#070a17]/95 backdrop-blur-xl px-6 py-6 mt-3 space-y-4">
          <Link
            href="/vault"
            onClick={() => setMobileMenuOpen(false)}
            className="w-full text-left py-2 text-xs font-mono tracking-widest uppercase text-[#c7c5dd] hover:text-[#fae48f] flex items-center justify-between cursor-pointer"
          >
            <span>World Vault</span>
            <Compass className="w-4 h-4 text-[#d4af37]" />
          </Link>
          <Link
            href={currentUser ? "/studio" : "/login?redirect=/studio"}
            onClick={() => setMobileMenuOpen(false)}
            className="w-full text-left py-2 text-xs font-mono tracking-widest uppercase text-[#c7c5dd] hover:text-[#fae48f] flex items-center justify-between cursor-pointer"
          >
            <span>Story Studio</span>
            <Feather className="w-4 h-4 text-[#d4af37]" />
          </Link>
          <button
            onClick={() => scrollTo("world-pillars")}
            className="w-full text-left py-2 text-xs font-mono tracking-widest uppercase text-[#c7c5dd] hover:text-[#fae48f] flex items-center justify-between cursor-pointer"
          >
            <span>The Four Pillars</span>
            <BookMarked className="w-4 h-4 text-[#d4af37]" />
          </button>
          <button
            onClick={() => scrollTo("world-pillars")}
            className="w-full text-left py-2 text-xs font-mono tracking-widest uppercase text-[#c7c5dd] hover:text-[#fae48f] flex items-center justify-between cursor-pointer"
          >
            <span>The Oracle</span>
            <Eye className="w-4 h-4 text-[#d4af37]" />
          </button>
          <div className="pt-4 border-t border-[#1d233d]">
            <button
              onClick={() => {
                setMobileMenuOpen(false);
                onOpenUniverseModal();
              }}
              className="w-full gold-glow-button py-3 rounded-lg text-xs font-mono tracking-widest uppercase font-semibold text-[#fae48f] text-center cursor-pointer"
            >
              Enter Your Universe
            </button>
          </div>
        </div>
      )}
    </header>
  );
}
