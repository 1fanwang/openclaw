import { beforeEach, describe, expect, it, vi } from "vitest";
import { GatewayRequestError } from "../gateway.ts";
import type { ControlUiPanelContribution } from "../types.ts";
import {
  extractToolResultText,
  invokePanelTool,
  loadControlUiPanels,
  panelKey,
  startPanelAutoRefresh,
  stopPanelAutoRefresh,
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
    panelRefreshTimers: {},
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

const REFRESHING_TOOL_CONTRIB: ControlUiPanelContribution = {
  pluginId: "plugin-a",
  panel: {
    id: "p-refresh",
    title: "Refreshing",
    preferredPosition: "tab",
    source: { kind: "tool", toolName: "demo.tool", refreshSec: 30 },
  },
};

const NON_REFRESHING_TOOL_CONTRIB: ControlUiPanelContribution = {
  pluginId: "plugin-a",
  panel: {
    id: "p-static",
    title: "Static",
    preferredPosition: "tab",
    source: { kind: "tool", toolName: "demo.tool" },
  },
};

describe("startPanelAutoRefresh", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it("eagerly invokes contributions with refreshSec when result is stale", () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ ok: true, result: {} })));
    const state = createState({
      panelsContributions: [REFRESHING_TOOL_CONTRIB, NON_REFRESHING_TOOL_CONTRIB],
    });

    startPanelAutoRefresh(state, fetchMock);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(state.panelRefreshTimers[panelKey(REFRESHING_TOOL_CONTRIB)]).toBeDefined();
    expect(state.panelRefreshTimers[panelKey(NON_REFRESHING_TOOL_CONTRIB)]).toBeUndefined();
  });

  it("does not eagerly invoke when a recent fetch already happened", () => {
    const fetchMock = vi.fn();
    const state = createState({
      panelsContributions: [REFRESHING_TOOL_CONTRIB],
      panelResults: {
        [panelKey(REFRESHING_TOOL_CONTRIB)]: {
          loading: false,
          result: { content: [{ type: "text", text: "cached" }] },
          error: null,
          lastFetchedAt: Date.now() - 1000,
        },
      },
    });

    startPanelAutoRefresh(state, fetchMock);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(state.panelRefreshTimers[panelKey(REFRESHING_TOOL_CONTRIB)]).toBeDefined();
  });

  it("re-fires the tool on the refresh interval", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ ok: true, result: {} })));
    const state = createState({
      panelsContributions: [REFRESHING_TOOL_CONTRIB],
    });

    startPanelAutoRefresh(state, fetchMock);
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(30_000);
    expect(fetchMock).toHaveBeenCalledTimes(2);

    await vi.advanceTimersByTimeAsync(30_000);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("floors sub-5s intervals to 5s to avoid hammering /tools/invoke", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ ok: true, result: {} })));
    const speedy: ControlUiPanelContribution = {
      pluginId: "p",
      panel: {
        id: "speed",
        title: "Speed",
        preferredPosition: "tab",
        source: { kind: "tool", toolName: "speed.tool", refreshSec: 1 },
      },
    };
    const state = createState({ panelsContributions: [speedy] });

    startPanelAutoRefresh(state, fetchMock);
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(1_000);
    expect(fetchMock).toHaveBeenCalledTimes(1); // not yet — floored to 5s
    await vi.advanceTimersByTimeAsync(4_000);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("does not double-schedule on a second start", () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ ok: true, result: {} })));
    const state = createState({
      panelsContributions: [REFRESHING_TOOL_CONTRIB],
    });

    startPanelAutoRefresh(state, fetchMock);
    const firstTimer = state.panelRefreshTimers[panelKey(REFRESHING_TOOL_CONTRIB)];
    startPanelAutoRefresh(state, fetchMock);
    const secondTimer = state.panelRefreshTimers[panelKey(REFRESHING_TOOL_CONTRIB)];
    expect(secondTimer).toBe(firstTimer);
  });

  it("no-ops when there are no contributions", () => {
    const fetchMock = vi.fn();
    const state = createState();
    startPanelAutoRefresh(state, fetchMock);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("stopPanelAutoRefresh", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it("clears all scheduled intervals and empties the timers map", () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ ok: true, result: {} })));
    const state = createState({ panelsContributions: [REFRESHING_TOOL_CONTRIB] });
    startPanelAutoRefresh(state, fetchMock);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    stopPanelAutoRefresh(state);
    expect(state.panelRefreshTimers).toEqual({});

    vi.advanceTimersByTime(60_000);
    expect(fetchMock).toHaveBeenCalledTimes(1);
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
