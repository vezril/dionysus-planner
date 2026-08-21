import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { MainNav } from "@/components/nav";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Dionysus Planner",
  description: "Pantry, recipes, and what-can-I-cook — single-user, self-hosted.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {/* openspec: pantry-grid-watermark — faint brand mark behind every
            page; aria-hidden, no pointer events, negative z so content and
            opaque surfaces always win. */}
        <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 flex items-center justify-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.png" alt="" data-testid="logo-watermark" className="w-[55vmin] max-w-lg opacity-[0.04]" />
        </div>
        <div className="flex min-h-screen flex-row">
          <MainNav />
          <main className="min-w-0 flex-1">{children}</main>
        </div>
      </body>
    </html>
  );
}
