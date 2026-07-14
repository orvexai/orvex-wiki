// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) Orvex, Inc. — part of the orvex-wiki AGPL engine (CS §13).
// See the LICENSE file at the repository root for the full license text.

import { NodeViewProps, NodeViewWrapper } from "@tiptap/react";
import { useMemo } from "react";
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { useTranslation } from "react-i18next";

// Default colour palette for chart slices / series.
const COLORS = ["#6366f1", "#22d3ee", "#f59e0b", "#10b981", "#ef4444", "#a855f7"];

type SeriesData = { labels: string[]; values: number[] };
type ScatterData = { points: { x: number; y: number }[] };

/** A normalised bar/line/pie data point. */
type BarLinePoint = { name: string; value: number };
/** A normalised scatter data point. */
type ScatterPoint = { x: number; y: number };

function parseChartData(
  data: string,
  chartType: string,
): BarLinePoint[] | ScatterPoint[] {
  try {
    const parsed: unknown = JSON.parse(data);
    if (!parsed || typeof parsed !== "object") return [];

    if (chartType === "scatter") {
      const s = parsed as Partial<ScatterData>;
      if (!Array.isArray(s.points)) return [];
      return s.points.map((p) => ({
        x: Number(p.x),
        y: Number(p.y),
      }));
    }
    const s = parsed as Partial<SeriesData>;
    if (!Array.isArray(s.labels)) return [];
    return s.labels.map((label, i) => ({
      name: label,
      value: Number((s.values ?? [])[i]) || 0,
    }));
  } catch {
    return [];
  }
}

/**
 * ENG-1377 (AC3, AC6, AC8) — ChartView renders a bar/line/pie/scatter chart
 * from the `chart` node's `{chartType, data, title}` attrs. `data` is a
 * JSON-serialized string attribute; unknown/extra fields in it are simply
 * ignored by the shape-tolerant parse above (forward-compat, AC8). Never
 * white-screens: unparsable/empty data renders an inline empty hint (AC6,
 * CS §10) rather than throwing.
 */
export default function ChartView({ node }: NodeViewProps) {
  const { t } = useTranslation();
  const { chartType = "bar", data = "", title = "" } = node.attrs as {
    chartType: "bar" | "line" | "pie" | "scatter";
    data: string;
    title: string;
  };

  const chartData = useMemo(
    () => parseChartData(data, chartType),
    [data, chartType],
  );

  const renderChart = () => {
    switch (chartType) {
      case "bar":
        return (
          <BarChart data={chartData as BarLinePoint[]}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="name" />
            <YAxis />
            <Tooltip />
            <Legend />
            <Bar dataKey="value" fill={COLORS[0]} />
          </BarChart>
        );

      case "line":
        return (
          <LineChart data={chartData as BarLinePoint[]}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="name" />
            <YAxis />
            <Tooltip />
            <Legend />
            <Line type="monotone" dataKey="value" stroke={COLORS[0]} dot={false} />
          </LineChart>
        );

      case "pie":
        return (
          <PieChart>
            <Pie
              data={chartData}
              dataKey="value"
              nameKey="name"
              cx="50%"
              cy="50%"
              outerRadius={100}
              label
            >
              {chartData.map((_, index) => (
                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
              ))}
            </Pie>
            <Tooltip />
            <Legend />
          </PieChart>
        );

      case "scatter":
        return (
          <ScatterChart>
            <CartesianGrid />
            <XAxis dataKey="x" name="x" />
            <YAxis dataKey="y" name="y" />
            <Tooltip cursor={{ strokeDasharray: "3 3" }} />
            <Scatter data={chartData} fill={COLORS[0]} />
          </ScatterChart>
        );

      default:
        return (
          <div style={{ color: "#888" }}>
            {t("Unknown chart type")}: {chartType}
          </div>
        );
    }
  };

  return (
    <NodeViewWrapper data-drag-handle contentEditable={false}>
      <div
        data-type="chart"
        data-testid="chart-nodeview"
        role="figure"
        aria-label={title || `${chartType} chart`}
        style={{
          border: "1px solid #e5e7eb",
          borderRadius: 8,
          padding: "12px 8px",
          maxWidth: 900,
          margin: "0 auto",
        }}
      >
        {title && (
          <div
            style={{
              textAlign: "center",
              fontWeight: 600,
              marginBottom: 8,
              fontSize: 14,
            }}
          >
            {title}
          </div>
        )}
        {chartData.length === 0 ? (
          <div
            style={{ textAlign: "center", color: "#9ca3af", padding: 24 }}
            data-testid="chart-empty"
          >
            {t("No chart data — check the data attribute.")}
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={260}>
            {renderChart()}
          </ResponsiveContainer>
        )}
      </div>
    </NodeViewWrapper>
  );
}
