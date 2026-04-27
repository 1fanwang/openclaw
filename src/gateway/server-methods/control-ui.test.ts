import { afterEach, describe, expect, it, vi } from "vitest";
import type { OpenClawConfig } from "../../config/types.openclaw.js";
import {
  type PluginManifestRegistry,
  type PluginManifestRecord,
} from "../../plugins/manifest-registry.js";
import { CONTROL_UI_PANELS_MAX_ITEMS } from "../protocol/schema/control-ui.js";

const loadConfigMock = vi.fn();
const loadPluginManifestRegistryMock = vi.fn();

vi.mock("../../config/config.js", () => ({
  loadConfig: () => loadConfigMock(),
}));

vi.mock("../../plugins/manifest-registry.js", async () => {
  const actual = await vi.importActual<typeof import("../../plugins/manifest-registry.js")>(
    "../../plugins/manifest-registry.js",
  );
  return {
    ...actual,
    loadPluginManifestRegistry: (...args: unknown[]) => loadPluginManifestRegistryMock(...args),
  };
});

const { buildControlUiListPanelsResult, controlUiHandlers } = await import("./control-ui.js");

function makeRecord(
  id: string,
  controlUiPanels?: PluginManifestRecord["controlUiPanels"],
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

const SAMPLE_PANEL = {
  id: "status",
  title: "Status",
  preferredPosition: "sidebar" as const,
  source: { kind: "tool" as const, toolName: "tool_status", refreshSec: 60 },
};

afterEach(() => {
  loadConfigMock.mockReset();
  loadPluginManifestRegistryMock.mockReset();
});

describe("buildControlUiListPanelsResult", () => {
  it("returns the flat list of contributions from the registry", () => {
    loadConfigMock.mockReturnValue({} as OpenClawConfig);
    loadPluginManifestRegistryMock.mockReturnValue({
      plugins: [makeRecord("plugin-a", [SAMPLE_PANEL])],
      diagnostics: [],
    } satisfies PluginManifestRegistry);
    const result = buildControlUiListPanelsResult();
    expect(result).toEqual({
      contributions: [{ pluginId: "plugin-a", panel: SAMPLE_PANEL }],
    });
  });

  it("returns an empty list when no plugin declares controlUiPanels", () => {
    loadConfigMock.mockReturnValue({});
    loadPluginManifestRegistryMock.mockReturnValue({
      plugins: [makeRecord("a"), makeRecord("b")],
      diagnostics: [],
    });
    expect(buildControlUiListPanelsResult()).toEqual({ contributions: [] });
  });

  it("clamps the contribution list to CONTROL_UI_PANELS_MAX_ITEMS", () => {
    const flood = Array.from({ length: CONTROL_UI_PANELS_MAX_ITEMS + 25 }, (_, i) => ({
      ...SAMPLE_PANEL,
      id: `p${i}`,
    }));
    loadConfigMock.mockReturnValue({});
    loadPluginManifestRegistryMock.mockReturnValue({
      plugins: [makeRecord("plugin-flood", flood)],
      diagnostics: [],
    });
    const result = buildControlUiListPanelsResult();
    expect(result.contributions).toHaveLength(CONTROL_UI_PANELS_MAX_ITEMS);
    expect(result.contributions[0]?.panel.id).toBe("p0");
    expect(result.contributions[CONTROL_UI_PANELS_MAX_ITEMS - 1]?.panel.id).toBe(
      `p${CONTROL_UI_PANELS_MAX_ITEMS - 1}`,
    );
  });

  it("preserves all source kinds round-trip", () => {
    const panels = [
      SAMPLE_PANEL,
      {
        id: "facts",
        title: "Facts",
        preferredPosition: "tab" as const,
        source: { kind: "canvas" as const, documentId: "facts-doc" },
      },
      {
        id: "embedded",
        title: "Embedded",
        preferredPosition: "dock-right" as const,
        source: { kind: "iframe" as const, url: "https://example.com/p" },
      },
    ];
    loadConfigMock.mockReturnValue({});
    loadPluginManifestRegistryMock.mockReturnValue({
      plugins: [makeRecord("plugin-a", panels)],
      diagnostics: [],
    });
    const result = buildControlUiListPanelsResult();
    expect(result.contributions.map((c) => c.panel.source.kind)).toEqual([
      "tool",
      "canvas",
      "iframe",
    ]);
  });
});

describe("controlUiHandlers", () => {
  it("rejects non-empty params with INVALID_REQUEST", () => {
    const respond = vi.fn();
    void controlUiHandlers["controlUi.listPanels"]?.({
      params: { unexpected: "field" } as unknown as Record<string, unknown>,
      respond,
      connectionId: "test",
      connection: {} as never,
    } as never);
    expect(respond).toHaveBeenCalledWith(
      false,
      undefined,
      expect.objectContaining({ code: "INVALID_REQUEST" }),
    );
  });

  it("responds with the registry result on valid empty params", () => {
    loadConfigMock.mockReturnValue({});
    loadPluginManifestRegistryMock.mockReturnValue({
      plugins: [makeRecord("plugin-a", [SAMPLE_PANEL])],
      diagnostics: [],
    });
    const respond = vi.fn();
    void controlUiHandlers["controlUi.listPanels"]?.({
      params: {},
      respond,
      connectionId: "test",
      connection: {} as never,
    } as never);
    expect(respond).toHaveBeenCalledWith(
      true,
      { contributions: [{ pluginId: "plugin-a", panel: SAMPLE_PANEL }] },
      undefined,
    );
  });
});
