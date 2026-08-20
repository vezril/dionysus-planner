"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * S-105 primary navigation, restyled as a persistent left sidebar
 * (openspec: sidebar-nav). Client Component — the only one in the app
 * shell — because active-route highlighting needs `usePathname()`.
 *
 * Always visible, full labels at every viewport width (narrower on mobile
 * than desktop, never hidden/collapsed/drawered) — satisfies NFR-8.
 *
 * Labels intentionally match each destination's <h1> text exactly so the
 * nav link's accessible name equals the page heading (shell.spec.ts).
 */
// openspec: qol-nav-scale-delete — What Can I Cook first (it's home; `/`
// redirects there), then the data-flow order: ingredients feed the pantry,
// the pantry feeds recipes, recipes become meals.
const NAV_ITEMS = [
  { href: "/what-can-i-cook", label: "What Can I Cook" },
  { href: "/ingredients", label: "Products" },
  { href: "/pantry", label: "Pantry" },
  { href: "/recipes", label: "Recipes" },
  { href: "/meal-log", label: "Inventory" },
] as const;

export function MainNav() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Main"
      className="flex w-32 shrink-0 flex-col gap-1 border-r border-border bg-card p-2 sm:w-56 sm:p-4"
    >
      {/* openspec: app-logo — the neon Dionysus mark, linking home. */}
      <Link href="/what-can-i-cook" className="mb-2 flex items-center gap-2 px-2">
        <Image src="/logo.png" alt="Dionysus" width={40} height={40} className="rounded-md" priority />
        <span aria-hidden="true" className="hidden text-sm font-semibold tracking-wide text-primary sm:inline">Dionysus</span>
      </Link>
      <ul className="flex flex-col gap-1">
        {NAV_ITEMS.map((item) => {
          const isActive = pathname === item.href;
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={isActive ? "page" : undefined}
                className={
                  isActive
                    ? "glow-primary flex items-center rounded-md border-l-2 border-primary bg-primary/10 px-2 py-2 text-xs font-medium text-primary sm:px-3 sm:text-sm"
                    : "flex items-center rounded-md border-l-2 border-transparent px-2 py-2 text-xs font-medium text-foreground hover:bg-muted sm:px-3 sm:text-sm"
                }
              >
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
