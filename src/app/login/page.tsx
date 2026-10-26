"use client";

import React, { useState, useEffect, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Sparkles,
  ArrowRight,
  UserPlus,
  Mail,
  User,
  CheckCircle,
  AlertCircle,
  Lock,
} from "lucide-react";
import { StarfieldCanvas } from "@/components/ui/StarfieldCanvas";
import { CelestialAstrolabe } from "@/components/ui/CelestialAstrolabe";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectUrl = searchParams.get("redirect") || "/vault";
  const initialTab = searchParams.get("tab") === "signup" ? "signup" : "signin";

  const [activeTab, setActiveTab] = useState<"signin" | "signup">(initialTab);
  const [currentUser, setCurrentUser] = useState<{ id: string; email: string; display_name: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Form states
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");

  // Check current user session on mount
  useEffect(() => {
    fetch("/api/auth/me")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.user) {
          setCurrentUser(data.user);
        }
      })
      .catch(() => {});
  }, []);

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password) {
      setErrorMsg("Please enter both your email address and password");
      return;
    }
    setLoading(true);
    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim(),
          password,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to sign in");
      setSuccessMsg(`Welcome, ${data.user.display_name}! Harmonizing workspace...`);
      setTimeout(() => {
        router.push(redirectUrl);
        router.refresh();
      }, 500);
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : "Authentication failed");
      setLoading(false);
    }
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !displayName.trim() || !password) {
      setErrorMsg("Email, Scribe Title, and Password are all required");
      return;
    }
    if (password.length < 8) {
      setErrorMsg("Password must be at least 8 characters in length");
      return;
    }
    setLoading(true);
    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim(),
          display_name: displayName.trim(),
          password,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Registration failed");
      setSuccessMsg(`New Scribe account inscribed: ${data.user.display_name}! Entering vault...`);
      setTimeout(() => {
        router.push(redirectUrl);
        router.refresh();
      }, 500);
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : "Registration failed");
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
      setCurrentUser(null);
      setSuccessMsg("Signed out from celestial session.");
      setTimeout(() => setSuccessMsg(null), 3000);
    } catch {
      // ignore
    }
  };

  return (
    <div className="relative min-h-screen bg-[#040509] text-[#e0ddcf] selection:bg-[#d4af37]/30 selection:text-[#fae48f] overflow-x-hidden flex flex-col justify-between">
      {/* Background starfield */}
      <StarfieldCanvas />

      {/* Layered Celestial Astrolabe in background */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none opacity-30 scale-90 sm:scale-100">
        <CelestialAstrolabe size={680} />
      </div>

      {/* Header Bar */}
      <header className="relative z-20 max-w-7xl w-full mx-auto px-4 sm:px-6 py-6 flex items-center justify-between">
        <Link href="/" className="group flex items-center gap-3">
          <div className="flex items-center justify-center w-8 h-8 rounded-lg border border-[#d4af37]/40 bg-[#0d1226] text-[#fae48f] group-hover:border-[#fae48f] transition-all">
            <span className="font-cinzel text-xs font-bold">W</span>
          </div>
          <div className="flex flex-col">
            <span className="font-cinzel text-lg font-bold tracking-[0.2em] text-[#fae48f]">
              WORLDBUILD
            </span>
            <span className="text-[9px] font-mono tracking-[0.3em] uppercase text-[#7e7c99]">
              Celestial Scriptorium
            </span>
          </div>
        </Link>

        <div className="flex items-center gap-3">
          <Link
            href="/vault"
            className="text-xs font-mono tracking-wider uppercase text-[#c4c1d8] hover:text-[#fae48f] transition-colors"
          >
            Direct Vault
          </Link>
          <Link
            href="/vault/univ-demo-aethelgard"
            className="px-3 py-1.5 rounded-full border border-[#d4af37]/30 bg-[#0d122c] hover:border-[#fae48f] text-xs font-mono text-[#fae48f] transition-all"
          >
            Demo Book
          </Link>
        </div>
      </header>

      {/* Main Authentication Portal */}
      <main className="relative z-10 max-w-md w-full mx-auto px-4 my-auto py-8">
        <div className="celestial-card rounded-2xl border border-[#d4af37]/35 bg-[#070a1a]/90 backdrop-blur-xl p-6 sm:p-8 shadow-[0_0_50px_rgba(0,0,0,0.8)]">
          {/* Top Badge */}
          <div className="text-center mb-6">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-[#d4af37]/30 bg-[#0c1230] text-[10px] font-mono tracking-widest uppercase text-[#fae48f] mb-3">
              <Sparkles className="w-3.5 h-3.5" />
              <span>Scribe Authentication Gate</span>
            </div>
            <h1 className="font-cinzel text-2xl sm:text-3xl font-bold text-[#faf8f2]">
              Enter the Sovereign Archive
            </h1>
            <p className="font-cormorant text-sm text-[#a39fb8] mt-1">
              Authenticate your identity to access your private world canons and the Continuity Oracle.
            </p>
          </div>

          {/* Current Session Banner if already signed in */}
          {currentUser && (
            <div className="mb-6 p-3.5 rounded-xl border border-[#2b3560] bg-[#0c1334]/80 flex items-center justify-between text-xs font-mono">
              <div className="flex items-center gap-2.5">
                <div className="w-7 h-7 rounded-full bg-[#1b2550] border border-[#d4af37]/40 flex items-center justify-center text-[#fae48f] font-bold">
                  {currentUser.display_name.charAt(0)}
                </div>
                <div>
                  <div className="text-[#fae48f] font-semibold">{currentUser.display_name}</div>
                  <div className="text-[10px] text-[#7d7a9c]">{currentUser.email}</div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Link
                  href={redirectUrl}
                  className="px-2.5 py-1 rounded bg-[#d4af37]/20 border border-[#d4af37]/50 text-[#fae48f] hover:bg-[#d4af37]/30 transition-all"
                >
                  Enter
                </Link>
                <button
                  onClick={handleLogout}
                  className="px-2 py-1 text-[#8683a3] hover:text-rose-300 transition-colors cursor-pointer"
                  title="Sign out"
                >
                  Exit
                </button>
              </div>
            </div>
          )}

          {/* Tab Selector */}
          <div className="grid grid-cols-2 gap-1 p-1 rounded-xl border border-[#1b2347] bg-[#050819] mb-6 text-xs font-mono">
            <button
              type="button"
              onClick={() => setActiveTab("signin")}
              className={`py-2 rounded-lg transition-all cursor-pointer ${
                activeTab === "signin"
                  ? "bg-[#141b38] border border-[#d4af37]/40 text-[#fae48f] font-semibold shadow"
                  : "text-[#8885a5] hover:text-white"
              }`}
            >
              Sign In
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("signup")}
              className={`py-2 rounded-lg transition-all cursor-pointer ${
                activeTab === "signup"
                  ? "bg-[#141b38] border border-[#d4af37]/40 text-[#fae48f] font-semibold shadow"
                  : "text-[#8885a5] hover:text-white"
              }`}
            >
              Register
            </button>
          </div>

          {/* Feedback Messages */}
          {errorMsg && (
            <div className="mb-4 p-3 rounded-lg border border-rose-500/40 bg-rose-950/40 text-rose-300 text-xs font-mono flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
              <span>{errorMsg}</span>
            </div>
          )}

          {successMsg && (
            <div className="mb-4 p-3 rounded-lg border border-emerald-500/40 bg-emerald-950/40 text-emerald-300 text-xs font-mono flex items-center gap-2 animate-fade-in">
              <CheckCircle className="w-4 h-4 shrink-0 text-emerald-400" />
              <span>{successMsg}</span>
            </div>
          )}

          {/* Tab 1: Standard Sign In */}
          {activeTab === "signin" && (
            <form onSubmit={handleSignIn} className="space-y-4">
              <div>
                <label className="text-[11px] font-mono uppercase tracking-wider text-[#fae48f] block mb-1.5 flex items-center gap-1.5">
                  <Mail className="w-3.5 h-3.5" />
                  <span>Scribe Email Address</span>
                </label>
                <input
                  type="email"
                  required
                  placeholder="e.g. scribe@domain.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-[#1e274d] bg-[#070a1e] text-xs font-mono text-[#dedbd2] placeholder-[#5a5775] focus:outline-none focus:border-[#fae48f]"
                />
              </div>

              <div>
                <label className="text-[11px] font-mono uppercase tracking-wider text-[#fae48f] block mb-1.5 flex items-center gap-1.5">
                  <Lock className="w-3.5 h-3.5" />
                  <span>Password</span>
                </label>
                <input
                  type="password"
                  required
                  placeholder="Enter your password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-[#1e274d] bg-[#070a1e] text-xs font-mono text-[#dedbd2] placeholder-[#5a5775] focus:outline-none focus:border-[#fae48f]"
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 rounded-xl gold-glow-button text-xs font-mono uppercase tracking-widest font-semibold text-[#fae48f] transition-all disabled:opacity-50 cursor-pointer flex items-center justify-center gap-2 mt-2"
              >
                <span>{loading ? "Verifying..." : "Sign In to Vault"}</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </form>
          )}

          {/* Tab 2: Register (New Scribe) */}
          {activeTab === "signup" && (
            <form onSubmit={handleSignUp} className="space-y-4">
              <div>
                <label className="text-[11px] font-mono uppercase tracking-wider text-[#fae48f] block mb-1.5 flex items-center gap-1.5">
                  <User className="w-3.5 h-3.5" />
                  <span>Scribe Title / Display Name *</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. High Chronicler Elian"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-[#1e274d] bg-[#070a1e] text-xs font-mono text-[#dedbd2] placeholder-[#5a5775] focus:outline-none focus:border-[#fae48f]"
                />
              </div>

              <div>
                <label className="text-[11px] font-mono uppercase tracking-wider text-[#fae48f] block mb-1.5 flex items-center gap-1.5">
                  <Mail className="w-3.5 h-3.5" />
                  <span>Email Address *</span>
                </label>
                <input
                  type="email"
                  required
                  placeholder="e.g. chronicler@domain.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-[#1e274d] bg-[#070a1e] text-xs font-mono text-[#dedbd2] placeholder-[#5a5775] focus:outline-none focus:border-[#fae48f]"
                />
              </div>

              <div>
                <label className="text-[11px] font-mono uppercase tracking-wider text-[#fae48f] block mb-1.5 flex items-center gap-1.5">
                  <Lock className="w-3.5 h-3.5" />
                  <span>Password * (Min 8 Characters)</span>
                </label>
                <input
                  type="password"
                  required
                  minLength={8}
                  placeholder="Create a secure password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-[#1e274d] bg-[#070a1e] text-xs font-mono text-[#dedbd2] placeholder-[#5a5775] focus:outline-none focus:border-[#fae48f]"
                />
              </div>

              <p className="text-[11px] font-cormorant text-[#9895b0]">
                Creating an account initializes a private, sovereign workspace with 0 demo bleed-through.
              </p>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 rounded-xl gold-glow-button text-xs font-mono uppercase tracking-widest font-semibold text-[#fae48f] transition-all disabled:opacity-50 cursor-pointer flex items-center justify-center gap-2 mt-2"
              >
                <span>{loading ? "Inscribing..." : "Create Account & Enter Vault"}</span>
                <UserPlus className="w-4 h-4" />
              </button>
            </form>
          )}

          {/* Footer note */}
          <div className="mt-6 pt-4 border-t border-[#1a2140] text-center">
            <span className="text-[10px] font-mono text-[#6e6c8c]">
              All world data is backed by local PostgreSQL persistence • Strict multi-user isolation
            </span>
          </div>
        </div>
      </main>

      {/* Subtle footer */}
      <footer className="relative z-10 max-w-7xl w-full mx-auto px-4 py-4 text-center text-xs font-mono text-[#5b5975]">
        WORLDBUILD Celestial Archive • Sovereign Lore Architecture
      </footer>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[#040509] flex items-center justify-center">
          <StarfieldCanvas />
          <div className="font-mono text-xs text-[#fae48f] tracking-widest uppercase">
            Harmonizing Scriptorium Coordinates...
          </div>
        </div>
      }
    >
      <LoginForm />
    </Suspense>
  );
}
