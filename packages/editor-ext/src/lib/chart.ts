// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) Orvex, Inc. — part of the orvex-wiki AGPL engine (CS §13).
// See the LICENSE file at the repository root for the full license text.

import { Node } from "@tiptap/core";
import { ReactNodeViewRenderer } from "@tiptap/react";

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    chart: {
      setChart: (attrs?: {
        chartType?: "bar" | "line" | "pie" | "scatter";
        data?: string;
        title?: string;
      }) => ReturnType;
    };
  }
}

export interface ChartOptions {
  HTMLAttributes: Record<string, any>;
  view: any;
}

/**
 * ENG-1377 — ported (behavior-parity) from the fork's
 * `packages/editor-ext/src/lib/chart.ts`. Chart is a read-only atom block
 * rendering a bar/line/pie/scatter chart from a `{chartType, data, title}`
 * attrs payload. It carries no editable content — the chart data is a
 * serialized JSON string attribute set by whatever populated the node
 * (engine projection or slash-command), never fabricated inline by the
 * view (CS §11 ALL-REAL).
 */
export const Chart = Node.create<ChartOptions>({
  name: "chart",
  group: "block",
  atom: true,
  draggable: true,
  selectable: true,

  addOptions() {
    return {
      HTMLAttributes: {},
      view: null,
    };
  },

  addAttributes() {
    return {
      chartType: {
        default: "bar",
        parseHTML: (element: HTMLElement) =>
          element.getAttribute("data-chart-type") || "bar",
        renderHTML: (attributes) => ({
          "data-chart-type": attributes.chartType,
        }),
      },
      data: {
        default: "",
        parseHTML: (element: HTMLElement) =>
          element.getAttribute("data-chart-data") || "",
        renderHTML: (attributes) => ({
          "data-chart-data": attributes.data,
        }),
      },
      title: {
        default: "",
        parseHTML: (element: HTMLElement) =>
          element.getAttribute("data-chart-title") || "",
        renderHTML: (attributes) => ({
          "data-chart-title": attributes.title,
        }),
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: `div[data-type="${this.name}"]`,
      },
    ];
  },

  renderText({ node }) {
    return node.attrs.title
      ? `[Chart: ${node.attrs.title}]`
      : `[Chart: ${node.attrs.chartType}]`;
  },

  renderHTML({ HTMLAttributes }) {
    // TipTap's mergeAttributes passthrough is intentional here: TipTap owns
    // escaping for HTML attributes produced via renderHTML, so no manual
    // escaping is needed in this path (unlike the marked renderer path).
    return [
      "div",
      {
        "data-type": this.name,
        "data-chart-type": HTMLAttributes.chartType,
        "data-chart-data": HTMLAttributes.data,
        "data-chart-title": HTMLAttributes.title,
      },
    ];
  },

  addNodeView() {
    // Guard: only set isInitialized if the property already exists on the
    // editor to avoid introducing unexpected state on unknown editor
    // versions.
    if ("isInitialized" in this.editor) {
      (this.editor as any).isInitialized = true;
    }
    return ReactNodeViewRenderer(this.options.view);
  },

  addCommands() {
    return {
      setChart:
        (attrs?: {
          chartType?: "bar" | "line" | "pie" | "scatter";
          data?: string;
          title?: string;
        }) =>
        ({ commands }) => {
          return commands.insertContent({
            type: this.name,
            attrs: {
              chartType: attrs?.chartType ?? "bar",
              data: attrs?.data ?? "",
              title: attrs?.title ?? "",
            },
          });
        },
    };
  },
});
