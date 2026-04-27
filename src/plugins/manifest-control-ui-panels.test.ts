import fs from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { loadPluginManifest } from "./manifest.js";
import { cleanupTrackedTempDirs, makeTrackedTempDir } from "./test-helpers/fs-fixtures.js";

const tempDirs: string[] = [];

afterEach(() => {
  cleanupTrackedTempDirs(tempDirs);
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

  it("drops sub-1 / non-positive / non-finite refreshSec; keeps integers >=1", () => {
    const dir = makeTempDir();
    writeManifest(dir, {
      ...baseManifest,
      controlUiPanels: [
        // Sub-1 floors to 0 → dropped (no refreshSec on the parsed panel)
        {
          id: "sub1",
          title: "Sub1",
          preferredPosition: "sidebar",
          source: { kind: "tool", toolName: "t", refreshSec: 0.5 },
        },
        {
          id: "zero",
          title: "Zero",
          preferredPosition: "sidebar",
          source: { kind: "tool", toolName: "t", refreshSec: 0 },
        },
        {
          id: "neg",
          title: "Neg",
          preferredPosition: "sidebar",
          source: { kind: "tool", toolName: "t", refreshSec: -10 },
        },
        {
          id: "nan",
          title: "NaN",
          preferredPosition: "sidebar",
          source: { kind: "tool", toolName: "t", refreshSec: Number.NaN },
        },
        // 60.7 → floor 60 → kept
        {
          id: "frac",
          title: "Frac",
          preferredPosition: "sidebar",
          source: { kind: "tool", toolName: "t", refreshSec: 60.7 },
        },
        // 1 → kept (boundary)
        {
          id: "one",
          title: "One",
          preferredPosition: "sidebar",
          source: { kind: "tool", toolName: "t", refreshSec: 1 },
        },
      ],
    });
    const result = loadPluginManifest(dir);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const panels = result.manifest.controlUiPanels ?? [];
    for (const id of ["sub1", "zero", "neg", "nan"]) {
      expect(panels.find((p) => p.id === id)?.source).toEqual({ kind: "tool", toolName: "t" });
    }
    expect(panels.find((p) => p.id === "frac")?.source).toEqual({
      kind: "tool",
      toolName: "t",
      refreshSec: 60,
    });
    expect(panels.find((p) => p.id === "one")?.source).toEqual({
      kind: "tool",
      toolName: "t",
      refreshSec: 1,
    });
  });

  it("rejects iframe sources with non-http(s) / non-relative URLs", () => {
    const dir = makeTempDir();
    writeManifest(dir, {
      ...baseManifest,
      controlUiPanels: [
        // valid: https
        {
          id: "https-ok",
          title: "HTTPS",
          preferredPosition: "tab",
          source: { kind: "iframe", url: "https://example.com/panel" },
        },
        // valid: http
        {
          id: "http-ok",
          title: "HTTP",
          preferredPosition: "tab",
          source: { kind: "iframe", url: "http://localhost:18789/panel" },
        },
        // valid: root-relative
        {
          id: "rel-ok",
          title: "Relative",
          preferredPosition: "tab",
          source: { kind: "iframe", url: "/plugin/panel" },
        },
        // dropped: javascript:
        {
          id: "js",
          title: "JS",
          preferredPosition: "tab",
          source: { kind: "iframe", url: "javascript:alert(1)" },
        },
        // dropped: data:
        {
          id: "data",
          title: "Data",
          preferredPosition: "tab",
          source: { kind: "iframe", url: "data:text/html,<script>alert(1)</script>" },
        },
        // dropped: vbscript:
        {
          id: "vb",
          title: "VB",
          preferredPosition: "tab",
          source: { kind: "iframe", url: "vbscript:msgbox" },
        },
        // dropped: file:
        {
          id: "file",
          title: "File",
          preferredPosition: "tab",
          source: { kind: "iframe", url: "file:///etc/passwd" },
        },
        // dropped: protocol-relative (could resolve to anything)
        {
          id: "proto-rel",
          title: "Proto",
          preferredPosition: "tab",
          source: { kind: "iframe", url: "//evil.com/x" },
        },
        // dropped: empty path
        {
          id: "empty",
          title: "Empty",
          preferredPosition: "tab",
          source: { kind: "iframe", url: "" },
        },
      ],
    });
    const result = loadPluginManifest(dir);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const panels = result.manifest.controlUiPanels ?? [];
    expect(panels.map((p) => p.id).sort()).toEqual(["http-ok", "https-ok", "rel-ok"]);
  });
});
