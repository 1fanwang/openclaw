import { beforeEach, describe, expect, it, vi } from "vitest";
import { GatewayRequestError } from "../gateway.ts";
import { loadControlUiPanels, type ControlUiPanelsState } from "./control-ui-panels.ts";

function createState(overrides: Partial<ControlUiPanelsState> = {}): ControlUiPanelsState {
  return {
    client: { request: vi.fn() },
    connected: true,
    panelsLoading: false,
    panelsContributions: null,
    panelsError: null,
    panelsLastSuccess: null,
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
