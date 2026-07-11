// Root not-found.tsx (App Router convention, architecture.md §6 "Error
// handling strategy"). Covers unmatched routes generally; the
// recipe/ingredient "bad id" case is formally covered once S-403 builds
// the detail route (see tests/e2e/shell.spec.ts's fixme).
export default function NotFound() {
  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4 p-6">
      <h1 className="text-2xl font-semibold">Page not found</h1>
      <p className="text-sm text-muted-foreground">
        The page you&apos;re looking for doesn&apos;t exist or may have
        moved.
      </p>
    </div>
  );
}
