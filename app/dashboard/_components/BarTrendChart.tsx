/**
 * openspec: dashboard-analytics — a server-rendered single-series bar
 * chart (sequential job: magnitude over time, one hue). Follows the
 * dataviz mark specs: thin bars with 2px-rounded data-ends and 2px
 * gaps, recessive grid, muted text tokens, dashed reference lines
 * (average / cap), sparse axis labels, native per-bar tooltips. No
 * legend — a single series is named by its title.
 */
import type { SeriesPoint } from "@/domain/dashboardStats";

const WIDTH = 640;
const HEIGHT = 180;
const PAD_LEFT = 8;
const PAD_BOTTOM = 18;
const PAD_TOP = 12;

export function BarTrendChart({
  title,
  unit,
  points,
  averageLine,
  capLine,
  testid,
}: {
  title: string;
  unit: string;
  points: SeriesPoint[];
  /** Dashed per-bucket average reference. */
  averageLine?: number | null;
  /** Dashed target/cap reference (e.g. daily kcal cap, weekly units cap). */
  capLine?: number | null;
  testid: string;
}) {
  const max = Math.max(1, ...points.map((point) => point.value), averageLine ?? 0, capLine ?? 0);
  const plotWidth = WIDTH - PAD_LEFT * 2;
  const plotHeight = HEIGHT - PAD_TOP - PAD_BOTTOM;
  const step = plotWidth / points.length;
  const barWidth = Math.max(2, step - 2); // 2px surface gap between bars
  const yOf = (value: number) => PAD_TOP + plotHeight * (1 - value / max);
  // Sparse labels: at most ~12 across the axis.
  const labelEvery = Math.max(1, Math.ceil(points.length / 12));

  return (
    <figure data-testid={testid} className="flex min-w-0 flex-col gap-1">
      <figcaption className="text-sm font-medium text-muted-foreground">{title}</figcaption>
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        role="img"
        aria-label={title}
        className="w-full"
        preserveAspectRatio="none"
      >
        {/* recessive baseline */}
        <line
          x1={PAD_LEFT}
          x2={WIDTH - PAD_LEFT}
          y1={PAD_TOP + plotHeight}
          y2={PAD_TOP + plotHeight}
          className="stroke-border"
          strokeWidth={1}
        />
        {points.map((point, index) => {
          const x = PAD_LEFT + index * step + (step - barWidth) / 2;
          const y = yOf(point.value);
          const height = Math.max(0, PAD_TOP + plotHeight - y);
          return (
            <g key={point.key}>
              {point.value > 0 ? (
                <rect
                  x={x}
                  y={y}
                  width={barWidth}
                  height={height}
                  rx={2}
                  className="fill-primary"
                  data-testid={`${testid}-bar`}
                >
                  <title>{`${point.key}: ${point.value} ${unit}`}</title>
                </rect>
              ) : null}
              {index % labelEvery === 0 ? (
                <text
                  x={PAD_LEFT + index * step + step / 2}
                  y={HEIGHT - 4}
                  textAnchor="middle"
                  className="fill-muted-foreground"
                  fontSize={10}
                >
                  {point.label}
                </text>
              ) : null}
            </g>
          );
        })}
        {averageLine != null && averageLine > 0 ? (
          <g data-testid={`${testid}-avg`}>
            <line
              x1={PAD_LEFT}
              x2={WIDTH - PAD_LEFT}
              y1={yOf(averageLine)}
              y2={yOf(averageLine)}
              className="stroke-muted-foreground"
              strokeWidth={1.5}
              strokeDasharray="5 4"
            >
              <title>{`average: ${averageLine} ${unit}`}</title>
            </line>
          </g>
        ) : null}
        {capLine != null && capLine > 0 && capLine <= max ? (
          <g data-testid={`${testid}-cap`}>
            <line
              x1={PAD_LEFT}
              x2={WIDTH - PAD_LEFT}
              y1={yOf(capLine)}
              y2={yOf(capLine)}
              className="stroke-status-near"
              strokeWidth={1.5}
              strokeDasharray="2 4"
            >
              <title>{`target: ${capLine} ${unit}`}</title>
            </line>
          </g>
        ) : null}
      </svg>
      <div className="flex gap-4 text-xs text-muted-foreground">
        {averageLine != null && averageLine > 0 ? (
          <span>
            <span aria-hidden>— —</span> avg {averageLine} {unit}
          </span>
        ) : null}
        {capLine != null && capLine > 0 ? (
          <span className="text-status-near">
            <span aria-hidden>· ·</span> target {capLine} {unit}
          </span>
        ) : null}
      </div>
    </figure>
  );
}
