// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) Orvex, Inc. — part of the orvex-wiki AGPL engine (CS §13).
// See the LICENSE file at the repository root for the full license text.

import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import type { NodeViewProps } from "@tiptap/react";

// jsdom reports zero layout size, so recharts' <ResponsiveContainer> never
// measures a non-zero width and skips rendering its children. Swap it for
// a fixed-size passthrough so the real bar/line/pie/scatter chart markup
// (still the real recharts components) renders in tests.
vi.mock("recharts", async () => {
  const actual = await vi.importActual<typeof import("recharts")>("recharts");
  return {
    ...actual,
    ResponsiveContainer: ({ children }: { children: ReactNode }) => (
      <div style={{ width: 400, height: 260 }}>{children}</div>
    ),
  };
});

import ChartView from "./chart-view";

function fakeNode(attrs: {
  chartType?: string;
  data?: string;
  title?: string;
}): NodeViewProps {
  return {
    node: { attrs },
  } as unknown as NodeViewProps;
}

const barData = JSON.stringify({
  labels: ["Q1", "Q2", "Q3"],
  values: [10, 20, 15],
});
const scatterData = JSON.stringify({
  points: [
    { x: 1, y: 2 },
    { x: 2, y: 4 },
  ],
});

describe("ChartView", () => {
  it("AC3 — renders a bar chart figure for chartType=bar", () => {
    render(
      <ChartView
        {...fakeNode({ chartType: "bar", data: barData, title: "Revenue" })}
      />,
    );
    const figure = screen.getByTestId("chart-nodeview");
    expect(figure.getAttribute("role")).toBe("figure");
    expect(figure.getAttribute("aria-label")).toBe("Revenue");
    expect(figure.querySelector(".recharts-wrapper")).not.toBeNull();
  });

  it("AC3 — renders a line chart figure for chartType=line", () => {
    render(<ChartView {...fakeNode({ chartType: "line", data: barData })} />);
    expect(
      screen.getByTestId("chart-nodeview").querySelector(".recharts-wrapper"),
    ).not.toBeNull();
  });

  it("AC3 — renders a pie chart figure for chartType=pie", () => {
    render(<ChartView {...fakeNode({ chartType: "pie", data: barData })} />);
    expect(
      screen.getByTestId("chart-nodeview").querySelector(".recharts-wrapper"),
    ).not.toBeNull();
  });

  it("AC3 — renders a scatter chart figure for chartType=scatter", () => {
    render(
      <ChartView {...fakeNode({ chartType: "scatter", data: scatterData })} />,
    );
    expect(
      screen.getByTestId("chart-nodeview").querySelector(".recharts-wrapper"),
    ).not.toBeNull();
  });

  it("AC6 — renders an empty hint instead of throwing when data is unparsable", () => {
    expect(() =>
      render(<ChartView {...fakeNode({ chartType: "bar", data: "" })} />),
    ).not.toThrow();
    expect(screen.getByTestId("chart-empty")).toBeDefined();
  });

  it("AC8 — tolerates unknown extra fields in the data payload", () => {
    const dataWithExtra = JSON.stringify({
      labels: ["A"],
      values: [1],
      futureField: { nested: true },
    });
    expect(() =>
      render(<ChartView {...fakeNode({ chartType: "bar", data: dataWithExtra })} />),
    ).not.toThrow();
    expect(
      screen.getByTestId("chart-nodeview").querySelector(".recharts-wrapper"),
    ).not.toBeNull();
  });
});
