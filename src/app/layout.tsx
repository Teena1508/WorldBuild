import type { Metadata } from "next";
import { Cormorant_Garamond, Cinzel, Plus_Jakarta_Sans, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const cormorant = Cormorant_Garamond({
  variable: "--font-cormorant",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
  display: "swap",
});

const cinzel = Cinzel({
  variable: "--font-cinzel",
  subsets: ["latin"],
  weight: ["400", "600", "700", "800"],
  display: "swap",
});

const sans = Plus_Jakarta_Sans({
  variable: "--font-sans",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
  display: "swap",
});

const mono = JetBrains_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
  weight: ["400", "500"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "WORLDBUILD — The Celestial Archive for Interconnected Universes",
  description:
    "An ethereal worldbuilding studio and continuity engine. Map intricate mythologies, cross-referenced factions, living cartographies, and uncover timeline contradictions across thousands of stories.",
  keywords: [
    "worldbuilding",
    "fictional universe",
    "timeline engine",
    "continuity tracker",
    "dark academia",
    "fantasy world",
    "interactive atlas",
    "lore codex",
  ],
  authors: [{ name: "WORLDBUILD Scribes" }],
  openGraph: {
    title: "WORLDBUILD — Every world has a thousand stories. Make them all belong.",
    description:
      "Craft interconnected fictional worlds with living atlases, deep chronologies, and an intelligent continuity oracle.",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${cormorant.variable} ${cinzel.variable} ${sans.variable} ${mono.variable} scroll-smooth antialiased`}
    >
      <body className="bg-[#05060a] text-[#e0ddcf] min-h-screen selection:bg-[#d4af37]/30 selection:text-[#fae188] overflow-x-hidden">
        {children}
      </body>
    </html>
  );
}

