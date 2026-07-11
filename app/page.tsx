import { Button } from "@/components/ui/button";

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-8">
      <h1 className="text-2xl font-semibold">Dionysus Planner</h1>
      <p className="text-muted-foreground text-sm">
        Scaffold placeholder — real routes land in later stories (S-105+).
      </p>
      <Button>Get started</Button>
    </main>
  );
}
