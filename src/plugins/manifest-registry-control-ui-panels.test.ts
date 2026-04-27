import { describe, expect, it } from "vitest";
import {
  listControlUiPanelContributions,
  type PluginManifestRecord,
  type PluginManifestRegistry,
} from "./manifest-registry.js";
import type { PluginManifestControlUiPanel } from "./manifest.js";

// Build a minimum-shaped record so tests don't drown in unrelated fields.
// Cross-plugin behavior is what we're pinning here, not record assembly.
function makeRecord(
  id: string,
  controlUiPanels?: PluginManifestControlUiPanel[],
): PluginManifestRecord {
  return {
    id,
    channels: [],
    providers: [],
    cliBackends: [],
    skills: [],
    hooks: [],
    origin: "global",
    rootDir: "/dev/null",
    source: "test",
    manifestPath: "/dev/null/openclaw.plugin.json",
    ...(controlUiPanels ? { controlUiPanels } : {}),
  };
}

function panel(id: string, toolName: string, refreshSec?: number): PluginManifestControlUiPanel {
  return {
    id,
    title: `Panel ${id}`,
    preferredPosition: "sidebar",
    source:
      refreshSec === undefined
        ? { kind: "tool", toolName }
        : { kind: "tool", toolName, refreshSec },
  };
}

function makeRegistry(plugins: PluginManifestRecord[]): PluginManifestRegistry {
  return { plugins, diagnostics: [] };
}

describe("listControlUiPanelContributions (registry accessor)", () => {
  it("returns an empty list when no plugin declares controlUiPanels", () => {
    const registry = makeRegistry([makeRecord("plugin-a"), makeRecord("plugin-b")]);
    expect(listControlUiPanelContributions(registry)).toEqual([]);
  });

  it("returns an empty list for an empty registry", () => {
    expect(listControlUiPanelContributions(makeRegistry([]))).toEqual([]);
  });

  it("flattens contributions from one plugin with multiple panels", () => {
    const a1 = panel("status", "tool_status", 60);
    const a2 = panel("alerts", "tool_alerts");
    const registry = makeRegistry([makeRecord("plugin-a", [a1, a2])]);
    expect(listControlUiPanelContributions(registry)).toEqual([
      { pluginId: "plugin-a", panel: a1 },
      { pluginId: "plugin-a", panel: a2 },
    ]);
  });

  it("flattens across multiple plugins, preserving plugin load order", () => {
    const a1 = panel("status", "a_status");
    const b1 = panel("status", "b_status"); // same panel id, different plugin
    const b2 = panel("alerts", "b_alerts");
    const c1 = panel("calendar", "c_calendar");
    const registry = makeRegistry([
      makeRecord("plugin-a", [a1]),
      makeRecord("plugin-b", [b1, b2]),
      makeRecord("plugin-c", [c1]),
    ]);
    expect(listControlUiPanelContributions(registry)).toEqual([
      { pluginId: "plugin-a", panel: a1 },
      { pluginId: "plugin-b", panel: b1 },
      { pluginId: "plugin-b", panel: b2 },
      { pluginId: "plugin-c", panel: c1 },
    ]);
  });

  it("does NOT collide on cross-plugin id reuse — each kept under its pluginId", () => {
    // The manifest validator already dedupes WITHIN a plugin; cross-plugin
    // collisions are a registry-level concern. Both `status` panels are
    // surfaced under their respective pluginId so consumers can address
    // them as `<pluginId>:<panelId>`.
    const aStatus = panel("status", "a_tool");
    const bStatus = panel("status", "b_tool");
    const registry = makeRegistry([
      makeRecord("plugin-a", [aStatus]),
      makeRecord("plugin-b", [bStatus]),
    ]);
    const out = listControlUiPanelContributions(registry);
    expect(out).toHaveLength(2);
    expect(out[0]).toEqual({ pluginId: "plugin-a", panel: aStatus });
    expect(out[1]).toEqual({ pluginId: "plugin-b", panel: bStatus });
  });

  it("skips plugins whose record has controlUiPanels undefined", () => {
    const a1 = panel("status", "a_tool");
    const c1 = panel("calendar", "c_tool");
    const registry = makeRegistry([
      makeRecord("plugin-a", [a1]),
      makeRecord("plugin-no-panels"), // undefined controlUiPanels
      makeRecord("plugin-c", [c1]),
    ]);
    expect(listControlUiPanelContributions(registry)).toEqual([
      { pluginId: "plugin-a", panel: a1 },
      { pluginId: "plugin-c", panel: c1 },
    ]);
  });

  it("preserves panel object identity (no copies)", () => {
    // Consumers may want to use `===` against the original panel object
    // when joining with other registries; we don't deep-clone.
    const p = panel("status", "tool");
    const registry = makeRegistry([makeRecord("plugin-a", [p])]);
    expect(listControlUiPanelContributions(registry)[0]?.panel).toBe(p);
  });

  it("handles a plugin with an empty (yet defined) controlUiPanels array", () => {
    // The manifest normalizer collapses all-dropped to undefined, so this
    // shouldn't happen via the loader — but the accessor should be
    // robust if a hand-built record has an empty array.
    const registry = makeRegistry([makeRecord("plugin-a", [])]);
    expect(listControlUiPanelContributions(registry)).toEqual([]);
  });

  it("preserves source-kind variety across the flattened list", () => {
    const toolPanel = panel("status", "tool", 30);
    const canvasPanel: PluginManifestControlUiPanel = {
      id: "facts",
      title: "Facts",
      preferredPosition: "tab",
      source: { kind: "canvas", documentId: "facts-doc" },
    };
    const iframePanel: PluginManifestControlUiPanel = {
      id: "embedded",
      title: "Embedded",
      preferredPosition: "dock-right",
      source: { kind: "iframe", url: "https://example.com/p" },
    };
    const registry = makeRegistry([makeRecord("plugin-a", [toolPanel, canvasPanel, iframePanel])]);
    const out = listControlUiPanelContributions(registry);
    expect(out.map((c) => c.panel.source.kind)).toEqual(["tool", "canvas", "iframe"]);
  });
});
