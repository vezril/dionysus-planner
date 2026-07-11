import { redirect } from "next/navigation";

// architecture.md §5: root `page.tsx` redirects to /what-can-i-cook, the
// JTBD-1 "front door" (S-105 AC1).
export default function Home() {
  redirect("/what-can-i-cook");
}
