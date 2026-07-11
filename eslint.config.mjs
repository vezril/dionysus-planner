import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

// architecture.md §5 module boundary rule (enforced here per AC-3 of
// S-101): only /data/** may import drizzle-orm/better-sqlite3, and
// /domain/** must additionally stay framework-free (no next/*, no react).
const dataOnlyImports = [
  {
    name: "drizzle-orm",
    message:
      "Only /data/** may import drizzle-orm (architecture.md §5 boundary rule).",
  },
  {
    name: "better-sqlite3",
    message:
      "Only /data/** may import better-sqlite3 (architecture.md §5 boundary rule).",
  },
];
const dataOnlyPatterns = [
  {
    group: ["drizzle-orm/*"],
    message:
      "Only /data/** may import drizzle-orm (architecture.md §5 boundary rule).",
  },
];

const eslintConfig = [
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    ignores: [
      "node_modules/**",
      ".next/**",
      "out/**",
      "build/**",
      "next-env.d.ts",
    ],
  },
  {
    // Everywhere except /data/**: no drizzle-orm / better-sqlite3.
    files: ["**/*.{ts,tsx}"],
    ignores: ["data/**"],
    rules: {
      "no-restricted-imports": ["error", { paths: dataOnlyImports, patterns: dataOnlyPatterns }],
    },
  },
  {
    // /domain/** additionally stays framework-free: no next/*, no react
    // (architecture.md §2/§5 — "domain logic kept framework-free").
    files: ["domain/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            ...dataOnlyImports,
            {
              name: "react",
              message:
                "/domain/** must stay framework-free (architecture.md §5 boundary rule).",
            },
          ],
          patterns: [
            ...dataOnlyPatterns,
            {
              group: ["next", "next/*"],
              message:
                "/domain/** must stay framework-free (architecture.md §5 boundary rule).",
            },
          ],
        },
      ],
    },
  },
];

export default eslintConfig;
