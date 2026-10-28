"use client";

// Gráficos de série única (uma cor: o azul-marinho da marca). Sem legenda (o título diz o que é),
// tooltip no hover, marcas finas, grade discreta e uma tabela equivalente para acessibilidade.
import type { ReactNode } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  LabelList,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

const SERIES = "var(--color-primary)";
const GRID = "#e2e8f0";
const AXIS_TEXT = { fill: "var(--color-muted-foreground)", fontSize: 12 };

function TooltipBox({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-md border border-border bg-surface px-3 py-2 text-xs shadow-md">
      <p className="font-medium text-foreground">{title}</p>
      <div className="text-muted-foreground">{children}</div>
    </div>
  );
}

/** Tabela equivalente ao gráfico (leitores de tela, impressão, quem prefere números). */
export function ChartTable({
  caption,
  headers,
  rows,
}: {
  caption: string;
  headers: string[];
  rows: (string | number)[][];
}) {
  return (
    <details className="mt-3 text-sm">
      <summary className="cursor-pointer text-muted-foreground">Ver como tabela</summary>
      <table className="mt-2 w-full text-left">
        <caption className="sr-only">{caption}</caption>
        <thead className="text-muted-foreground">
          <tr>
            {headers.map((h) => (
              <th key={h} scope="col" className="py-1 pr-3 font-medium">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="border-t border-border">
              {row.map((cell, j) => (
                <td key={j} className="py-1 pr-3 tabular-nums">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </details>
  );
}

export interface WeeklyPoint {
  label: string;
  accuracy: number | null;
  answered: number;
}

/** Evolução semanal do acerto (%). Semanas sem questões ficam como lacuna, não como zero. */
export function AccuracyLineChart({ data }: { data: WeeklyPoint[] }) {
  return (
    <div className="h-56 w-full">
      <ResponsiveContainer>
        <LineChart data={data} margin={{ top: 12, right: 16, bottom: 0, left: -12 }}>
          <CartesianGrid stroke={GRID} vertical={false} strokeWidth={1} />
          <XAxis dataKey="label" tick={AXIS_TEXT} tickLine={false} axisLine={{ stroke: GRID }} />
          <YAxis
            domain={[0, 100]}
            ticks={[0, 25, 50, 75, 100]}
            tick={AXIS_TEXT}
            tickLine={false}
            axisLine={false}
            unit="%"
          />
          <Tooltip
            cursor={{ stroke: GRID, strokeWidth: 1 }}
            content={({ active, payload }) => {
              const point = active ? (payload?.[0]?.payload as WeeklyPoint | undefined) : undefined;
              if (!point) return null;
              return (
                <TooltipBox title={`Semana de ${point.label}`}>
                  {point.answered === 0
                    ? "Sem questões"
                    : `${point.accuracy}% de acerto em ${point.answered} questões`}
                </TooltipBox>
              );
            }}
          />
          <Line
            type="monotone"
            dataKey="accuracy"
            stroke={SERIES}
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            connectNulls={false}
            dot={{ r: 4, fill: SERIES, stroke: "var(--color-surface)", strokeWidth: 2 }}
            activeDot={{ r: 6, fill: SERIES, stroke: "var(--color-surface)", strokeWidth: 2 }}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export interface BarPoint {
  label: string;
  value: number;
  /** Texto do tooltip. */
  detail: string;
  /** Rótulo na ponta da barra. */
  tip: string;
}

/** Barras horizontais de série única (magnitude). Valor na ponta; grade só vertical e discreta. */
export function HorizontalBarChart({
  data,
  max,
  unit = "",
}: {
  data: BarPoint[];
  max?: number;
  unit?: string;
}) {
  const height = Math.max(120, data.length * 36 + 24);
  return (
    <div className="w-full" style={{ height }}>
      <ResponsiveContainer>
        <BarChart
          data={data}
          layout="vertical"
          margin={{ top: 4, right: 48, bottom: 0, left: 8 }}
          barCategoryGap={8}
        >
          <CartesianGrid stroke={GRID} horizontal={false} strokeWidth={1} />
          <XAxis
            type="number"
            domain={[0, max ?? "auto"]}
            tick={AXIS_TEXT}
            tickLine={false}
            axisLine={false}
            unit={unit}
          />
          <YAxis
            type="category"
            dataKey="label"
            width={150}
            tick={AXIS_TEXT}
            tickLine={false}
            axisLine={false}
          />
          <Tooltip
            cursor={{ fill: "var(--color-muted)" }}
            content={({ active, payload }) => {
              const point = active ? (payload?.[0]?.payload as BarPoint | undefined) : undefined;
              return point ? <TooltipBox title={point.label}>{point.detail}</TooltipBox> : null;
            }}
          />
          <Bar dataKey="value" fill={SERIES} barSize={16} radius={[0, 4, 4, 0]} isAnimationActive={false}>
            <LabelList
              dataKey="tip"
              position="right"
              style={{ fill: "var(--color-foreground)", fontSize: 12 }}
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
