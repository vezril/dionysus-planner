import Link from "next/link";

/**
 * S-105 primary navigation. Server Component — plain always-visible
 * stacked/wrapping list of links, no client-side toggle needed to satisfy
 * NFR-8 at 375px (see story Dev Notes: "a mobile toggle... is OPTIONAL").
 *
 * Labels intentionally match each destination's <h1> text exactly so the
 * nav link's accessible name equals the page heading (shell.spec.ts).
 */
const NAV_ITEMS = [
  { href: "/what-can-i-cook", label: "What Can I Cook" },
  { href: "/pantry", label: "Pantry" },
  { href: "/recipes", label: "Recipes" },
  { href: "/ingredients", label: "Ingredients" },
] as const;

export function MainNav() {
  return (
    <nav aria-label="Main" className="border-b bg-background">
      <ul className="flex flex-wrap gap-1 p-2">
        {NAV_ITEMS.map((item) => (
          <li key={item.href}>
            <Link
              href={item.href}
              className="inline-flex items-center rounded-md px-3 py-2 text-sm font-medium text-foreground hover:bg-muted"
            >
              {item.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
