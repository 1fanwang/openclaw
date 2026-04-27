import fs from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { loadPluginManifest } from "./manifest.js";
import { cleanupTrackedTempDirs, makeTrackedTempDir } from "./test-helpers/fs-fixtures.js";

const tempDirs: string[] = [];

afterEach(async () => {
  await cleanupTrackedTempDirs(tempDirs);
});

function makeTempDir() {
  return makeTrackedTempDir("openclaw-manifest-control-ui-panels", tempDirs);
}

function writeManifest(dir: string, manifest: Record<string, unknown>) {
  fs.writeFileSync(path.join(dir, "openclaw.plugin.json"), JSON.stringify(manifest), "utf-8");
}

const baseManifest = {
  id: "example-plugin",
  configSchema: { type: "object" },
};

describe("plugin manifest controlUiPanels (additive seam)", () => {
  it("manifest without controlUiPanels still loads (additive, never required)", () => {
    const dir = makeTempDir();
    writeManifest(dir, baseManifest);
    const result = loadPluginManifest(dir);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.manifest.controlUiPanels).toBeUndefined();
  });

  it("accepts a tool-source panel with optional refreshSec", () => {
    const dir = makeTempDir();
    writeManifest(dir, {
      ...baseManifest,
      controlUiPanels: [
        {
          id: "status",
          title: "Plugin Status",
          preferredPosition: "sidebar",
          source: { kind: "tool", toolName: "example_status", refreshSec: 300 },
        },
      ],
    });
    const result = loadPluginManifest(dir);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.manifest.controlUiPanels).toEqual([
      {
        id: "status",
        title: "Plugin Status",
        preferredPosition: "sidebar",
        source: { kind: "tool", toolName: "example_status", refreshSec: 300 },
      },
    ]);
  });

  it("accepts canvas-source and iframe-source panels", () => {
    const dir = makeTempDir();
    writeManifest(dir, {
      ...baseManifest,
      controlUiPanels: [
        {
          id: "facts",
          title: "Pinned facts",
          preferredPosition: "tab",
          source: { kind: "canvas", documentId: "facts-doc-1" },
        },
        {
          id: "embedded",
          title: "Embedded UI",
          preferredPosition: "dock-right",
          source: { kind: "iframe", url: "https://localhost/embedded" },
        },
      ],
    });
    const result = loadPluginManifest(dir);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.manifest.controlUiPanels).toHaveLength(2);
    expect(result.manifest.controlUiPanels?.[0]?.source).toEqual({
      kind: "canvas",
      documentId: "facts-doc-1",
    });
    expect(result.manifest.controlUiPanels?.[1]?.source).toEqual({
      kind: "iframe",
      url: "https://localhost/embedded",
    });
  });

  it("drops malformed entries (missing id/title, unknown position, malformed source)", () => {
    const dir = makeTempDir();
    writeManifest(dir, {
      ...baseManifest,
      controlUiPanels: [
        // valid
        {
          id: "ok",
          title: "Good Panel",
          preferredPosition: "sidebar",
          source: { kind: "tool", toolName: "good_tool" },
        },
        // missing id
        {
          title: "no-id",
          preferredPosition: "sidebar",
          source: { kind: "tool", toolName: "x" },
        },
        // missing title
        {
          id: "no-title",
          preferredPosition: "sidebar",
          source: { kind: "tool", toolName: "x" },
        },
        // invalid position
        {
          id: "bad-pos",
          title: "Bad Position",
          preferredPosition: "popup",
          source: { kind: "tool", toolName: "x" },
        },
        // unknown source kind
        {
          id: "bad-kind",
          title: "Bad Kind",
          preferredPosition: "sidebar",
          source: { kind: "popup", url: "x" },
        },
        // canvas missing documentId
        {
          id: "canvas-bad",
          title: "Canvas Bad",
          preferredPosition: "tab",
          source: { kind: "canvas" },
        },
        // duplicate id (only first wins)
        {
          id: "ok",
          title: "Duplicate",
          preferredPosition: "tab",
          source: { kind: "tool", toolName: "dup" },
        },
      ],
    });
    const result = loadPluginManifest(dir);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.manifest.controlUiPanels).toEqual([
      {
        id: "ok",
        title: "Good Panel",
        preferredPosition: "sidebar",
        source: { kind: "tool", toolName: "good_tool" },
      },
    ]);
  });

  it("returns undefined when controlUiPanels is present but every entry is dropped", () => {
    const dir = makeTempDir();
    writeManifest(dir, {
      ...baseManifest,
      controlUiPanels: [
        { id: "x", preferredPosition: "sidebar", source: { kind: "tool", toolName: "x" } },
      ],
    });
    const result = loadPluginManifest(dir);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.manifest.controlUiPanels).toBeUndefined();
  });

  it("ignores non-positive or non-finite refreshSec", () => {
    const dir = makeTempDir();
    writeManifest(dir, {
      ...baseManifest,
      controlUiPanels: [
        {
          id: "a",
          title: "A",
          preferredPosition: "sidebar",
          source: { kind: "tool", toolName: "t", refreshSec: 0 },
        },
        {
          id: "b",
          title: "B",
          preferredPosition: "sidebar",
          source: { kind: "tool", toolName: "t", refreshSec: -10 },
        },
        {
          id: "c",
          title: "C",
          preferredPosition: "sidebar",
          source: { kind: "tool", toolName: "t", refreshSec: 60.7 },
        },
      ],
    });
    const result = loadPluginManifest(dir);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const panels = result.manifest.controlUiPanels ?? [];
    expect(panels.find((p) => p.id === "a")?.source).toEqual({ kind: "tool", toolName: "t" });
    expect(panels.find((p) => p.id === "b")?.source).toEqual({ kind: "tool", toolName: "t" });
    // Floored to 60
    expect(panels.find((p) => p.id === "c")?.source).toEqual({
      kind: "tool",
      toolName: "t",
      refreshSec: 60,
    });
  });
});
