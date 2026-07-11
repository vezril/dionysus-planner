import Link from "next/link";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/empty-state";

// S-105 placeholder — real Cookable Now / Near Match view lands in S-501.
// Static RSC per ADR-002; no data fetching yet (architecture.md §5).
export default function WhatCanICookPage() {
  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6 p-6">
      <h1 className="text-2xl font-semibold">What Can I Cook</h1>
      <EmptyState description="Add pantry items and recipes to see what you can cook right now.">
        <Button asChild variant="outline">
          <Link href="/pantry">Add pantry items</Link>
        </Button>
      </EmptyState>
    </div>
  );
}
