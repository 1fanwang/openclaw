import { beforeEach, describe, expect, it, vi } from "vitest";
import { GatewayRequestError } from "../gateway.ts";
import type { ControlUiPanelContribution } from "../types.ts";
import {
  extractToolResultText,
  invokePanelTool,
  loadControlUiPanels,
  panelKey,
  type ControlUiPanelsState,
} from "./control-ui-panels.ts";

function createState(overrides: Partial<ControlUiPanelsState> = {}): ControlUiPanelsState {
  return {
    client: { request: vi.fn() },
    connected: true,
    panelsLoading: false,
    panelsContributions: null,
    panelsError: null,
    panelsLastSuccess: null,
    panelResults: {},
    ...overrides,
  };
}

const SAMPLE_CONTRIB = {
  pluginId: "plugin-a",
  panel: {
    id: "p1",
    title: "Panel One",
    preferredPosition: "tab" as const,
    source: { kind: "tool" as const, toolName: "demo.tool" },
  },
};

describe("loadControlUiPanels", () => {
  beforeEach(() => {
    vi.useRealTimers();
  });

  it("populates contributions and timestamp on success", async () => {
    const state = createState();
    const request = vi.mocked(state.client!.request);
    request.mockResolvedValueOnce({ contributions: [SAMPLE_CONTRIB] });

    await loadControlUiPanels(state);

    expect(request).toHaveBeenCalledWith("controlUi.listPanels", {});
    expect(state.panelsContributions).toEqual([SAMPLE_CONTRIB]);
    expect(state.panelsError).toBeNull();
    expect(state.panelsLoading).toBe(false);
    expect(state.panelsLastSuccess).toBeTypeOf("number");
  });

  it("formats missing-operator-read-scope errors specially", async () => {
    const state = createState();
    const request = vi.mocked(state.client!.request);
    request.mockRejectedValueOnce(
      new GatewayRequestError({
        code: "AUTH",
        message: "missing scope: operator.read",
      }),
    );

    await loadControlUiPanels(state);

    expect(state.panelsContributions).toBeNull();
    expect(state.panelsError).toMatch(/operator\.read/);
    expect(state.panelsLoading).toBe(false);
  });

  it("captures generic errors as plain message", async () => {
    const state = createState();
    const request = vi.mocked(state.client!.request);
    request.mockRejectedValueOnce(new Error("boom"));

    await loadControlUiPanels(state);

    expect(state.panelsError).toBe("boom");
    expect(state.panelsLoading).toBe(false);
  });

  it("no-ops when client is null", async () => {
    const state = createState({ client: null });
    await loadControlUiPanels(state);
    expect(state.panelsLoading).toBe(false);
    expect(state.panelsError).toBeNull();
  });

  it("no-ops when not connected", async () => {
    const state = createState({ connected: false });
    const request = vi.mocked(state.client!.request);
    await loadControlUiPanels(state);
    expect(request).not.toHaveBeenCalled();
  });

  it("no-ops when already loading", async () => {
    const state = createState({ panelsLoading: true });
    const request = vi.mocked(state.client!.request);
    await loadControlUiPanels(state);
    expect(request).not.toHaveBeenCalled();
  });
});

const TOOL_CONTRIB: ControlUiPanelContribution = {
  pluginId: "plugin-a",
  panel: {
    id: "p1",
    title: "Panel One",
    preferredPosition: "tab",
    source: { kind: "tool", toolName: "demo.tool" },
  },
};

describe("invokePanelTool", () => {
  it("POSTs to /tools/invoke with bearer auth and stores the result", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ ok: true, result: { content: [{ type: "text", text: "hello" }] } }),
        {
          status: 200,
          headers: { "content-type": "application/json" },
        },
      ),
    );
    const state = createState({ hello: { auth: { deviceToken: "tok-abc" } } });

    await invokePanelTool(state, TOOL_CONTRIB, fetchMock);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/tools/invoke");
    expect((init as RequestInit).method).toBe("POST");
    const headers = (init as RequestInit).headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer tok-abc");
    expect((init as RequestInit).body).toBe(JSON.stringify({ tool: "demo.tool", args: {} }));

    const stored = state.panelResults[panelKey(TOOL_CONTRIB)];
    expect(stored.loading).toBe(false);
    expect(stored.error).toBeNull();
    expect(stored.lastFetchedAt).toBeTypeOf("number");
    expect(extractToolResultText(stored.result)).toBe("hello");
  });

  it("captures the gateway error message when ok=false", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: false, error: { type: "tool_error", message: "boom" } }), {
        status: 500,
      }),
    );
    const state = createState();

    await invokePanelTool(state, TOOL_CONTRIB, fetchMock);

    const stored = state.panelResults[panelKey(TOOL_CONTRIB)];
    expect(stored.error).toBe("boom");
    expect(stored.loading).toBe(false);
  });

  it("falls back to status text when error body lacks a message", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("", { status: 404 }));
    const state = createState();

    await invokePanelTool(state, TOOL_CONTRIB, fetchMock);

    const stored = state.panelResults[panelKey(TOOL_CONTRIB)];
    expect(stored.error).toMatch(/404/);
  });

  it("captures network errors", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error("offline"));
    const state = createState();

    await invokePanelTool(state, TOOL_CONTRIB, fetchMock);

    const stored = state.panelResults[panelKey(TOOL_CONTRIB)];
    expect(stored.error).toBe("offline");
  });

  it("no-ops on non-tool sources", async () => {
    const fetchMock = vi.fn();
    const canvasContrib: ControlUiPanelContribution = {
      pluginId: "p",
      panel: {
        id: "c",
        title: "C",
        preferredPosition: "tab",
        source: { kind: "canvas", documentId: "doc" },
      },
    };
    const state = createState();
    await invokePanelTool(state, canvasContrib, fetchMock);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does not fire a second invocation while one is in flight", async () => {
    const fetchMock = vi.fn();
    const state = createState({
      panelResults: {
        [panelKey(TOOL_CONTRIB)]: {
          loading: true,
          result: null,
          error: null,
          lastFetchedAt: null,
        },
      },
    });
    await invokePanelTool(state, TOOL_CONTRIB, fetchMock);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("extractToolResultText", () => {
  it("joins all text parts with double newlines", () => {
    expect(
      extractToolResultText({
        content: [
          { type: "text", text: "alpha" },
          { type: "text", text: "beta" },
        ],
      }),
    ).toBe("alpha\n\nbeta");
  });

  it("returns null for non-tool results", () => {
    expect(extractToolResultText(null)).toBeNull();
    expect(extractToolResultText("string")).toBeNull();
    expect(extractToolResultText({ foo: "bar" })).toBeNull();
    expect(extractToolResultText({ content: [{ type: "image", url: "x" }] })).toBeNull();
  });
});
