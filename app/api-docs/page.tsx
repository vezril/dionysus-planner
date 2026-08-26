import { openapiSpec } from "@/lib/openapi";

/**
 * openspec: api-docs — the web API reference, rendered straight from the
 * OpenAPI object in the house style (no external viewer, no CDN).
 */
export const dynamic = "force-static";

const METHOD_TONE: Record<string, string> = {
  get: "border-status-cookable/50 text-status-cookable",
  post: "border-primary/50 text-primary",
  delete: "border-destructive/50 text-destructive",
  put: "border-status-near/50 text-status-near",
};

interface Operation {
  tags?: readonly string[];
  summary?: string;
  description?: string;
  parameters?: ReadonlyArray<{ name: string; in: string; required?: boolean; description?: string; schema?: { type?: string; format?: string; enum?: readonly string[]; example?: unknown } }>;
  requestBody?: { content?: Record<string, { schema?: unknown }> };
  responses: Record<string, { description?: string }>;
}

export default function ApiDocsPage() {
  const spec = openapiSpec as unknown as {
    info: { title: string; version: string; description: string };
    servers: Array<{ url: string; description: string }>;
    tags: Array<{ name: string; description: string }>;
    paths: Record<string, Record<string, Operation>>;
  };

  const operations: Array<{ path: string; method: string; op: Operation }> = [];
  for (const [path, methods] of Object.entries(spec.paths)) {
    for (const [method, op] of Object.entries(methods)) {
      operations.push({ path, method, op });
    }
  }

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-8 p-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold">{spec.info.title}</h1>
        <p className="text-sm text-muted-foreground">{spec.info.description}</p>
        <div className="flex flex-wrap gap-4 text-sm">
          <a href="/api/openapi" className="font-medium text-primary hover:underline">
            OpenAPI JSON
          </a>
          <a href="/insomnia-collection.json" download className="font-medium text-primary hover:underline">
            Insomnia collection
          </a>
        </div>
        <div className="flex flex-col gap-1 text-xs text-muted-foreground">
          {spec.servers.map((server) => (
            <span key={server.url} className="font-mono">
              {server.url} <span className="font-sans">— {server.description}</span>
            </span>
          ))}
        </div>
      </div>

      {spec.tags.map((tag) => (
        <section key={tag.name} className="flex flex-col gap-3">
          <div>
            <h2 className="text-lg font-medium capitalize">{tag.name}</h2>
            <p className="text-sm text-muted-foreground">{tag.description}</p>
          </div>
          {operations
            .filter(({ op }) => op.tags?.includes(tag.name))
            .map(({ path, method, op }) => (
              <details key={`${method} ${path}`} data-testid="api-operation" className="rounded-md border border-border p-3">
                <summary className="flex cursor-pointer flex-wrap items-center gap-3">
                  <span
                    className={`rounded-md border px-2 py-0.5 font-mono text-xs font-semibold uppercase ${METHOD_TONE[method] ?? "border-border"}`}
                  >
                    {method}
                  </span>
                  <span className="font-mono text-sm">{path}</span>
                  <span className="text-sm text-muted-foreground">{op.summary}</span>
                </summary>
                <div className="mt-3 flex flex-col gap-3 text-sm">
                  {op.description ? <p className="text-muted-foreground">{op.description}</p> : null}
                  {op.parameters && op.parameters.length > 0 ? (
                    <div>
                      <h3 className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">Parameters</h3>
                      <ul className="flex flex-col gap-1">
                        {op.parameters.map((parameter) => (
                          <li key={parameter.name} className="flex flex-wrap gap-2">
                            <span className="font-mono text-primary">{parameter.name}</span>
                            <span className="text-xs text-muted-foreground">
                              {parameter.in}
                              {parameter.required ? " · required" : ""}
                              {parameter.schema?.type ? ` · ${parameter.schema.type}` : ""}
                            </span>
                            {parameter.description ? <span className="text-muted-foreground">{parameter.description}</span> : null}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                  {op.requestBody ? (
                    <div>
                      <h3 className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">Request body</h3>
                      <pre className="overflow-x-auto rounded-md border border-border bg-card p-2 font-mono text-xs">
                        {JSON.stringify(Object.values(op.requestBody.content ?? {})[0]?.schema ?? {}, null, 2)}
                      </pre>
                    </div>
                  ) : null}
                  <div>
                    <h3 className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">Responses</h3>
                    <ul className="flex flex-col gap-1">
                      {Object.entries(op.responses).map(([status, response]) => (
                        <li key={status} className="flex gap-2">
                          <span className="font-mono text-xs">{status}</span>
                          <span className="text-muted-foreground">{response.description}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </details>
            ))}
        </section>
      ))}
    </div>
  );
}
