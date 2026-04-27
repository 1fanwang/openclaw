import type { ControlUiListPanelsResult } from "../../../../src/gateway/protocol/index.js";
import { resolveControlUiAuthHeader } from "../control-ui-auth.ts";
import type { ControlUiPanelContribution } from "../types.ts";
import {
  formatMissingOperatorReadScopeMessage,
  isMissingOperatorReadScopeError,
} from "./scope-errors.ts";

export type PanelInvokeState = {
  loading: boolean;
  result: unknown;
  error: string | null;
  lastFetchedAt: number | null;
};

export type ControlUiPanelsState = {
  client: { request: <T>(method: string, params?: unknown) => Promise<T> } | null;
  connected: boolean;
  panelsLoading: boolean;
  panelsContributions: readonly ControlUiPanelContribution[] | null;
  panelsError: string | null;
  panelsLastSuccess: number | null;
  panelResults: Record<string, PanelInvokeState>;
  hello?: { auth?: { deviceToken?: string | null } | null } | null;
  settings?: { token?: string | null } | null;
  password?: string | null;
};

export function panelKey(c: ControlUiPanelContribution): string {
  return `${c.pluginId}:${c.panel.id}`;
}

export async function loadControlUiPanels(state: ControlUiPanelsState): Promise<void> {
  if (!state.client || !state.connected) {
    return;
  }
  if (state.panelsLoading) {
    return;
  }
  state.panelsLoading = true;
  state.panelsError = null;
  try {
    const res = await state.client.request<ControlUiListPanelsResult>("controlUi.listPanels", {});
    state.panelsContributions = res?.contributions ?? [];
    state.panelsLastSuccess = Date.now();
  } catch (err) {
    if (isMissingOperatorReadScopeError(err)) {
      state.panelsContributions = null;
      state.panelsError = formatMissingOperatorReadScopeMessage("control-UI panels");
    } else {
      state.panelsError = err instanceof Error ? err.message : String(err);
    }
  } finally {
    state.panelsLoading = false;
  }
}

type ToolsInvokeOk = { ok: true; result: unknown };
type ToolsInvokeErr = { ok: false; error?: { message?: string; type?: string } };

export async function invokePanelTool(
  state: ControlUiPanelsState,
  contribution: ControlUiPanelContribution,
  fetchImpl: typeof fetch = fetch,
): Promise<void> {
  if (contribution.panel.source.kind !== "tool") {
    return;
  }
  const key = panelKey(contribution);
  const prev = state.panelResults[key];
  if (prev?.loading) {
    return;
  }
  state.panelResults = {
    ...state.panelResults,
    [key]: {
      loading: true,
      result: prev?.result ?? null,
      error: null,
      lastFetchedAt: prev?.lastFetchedAt ?? null,
    },
  };
  const auth = resolveControlUiAuthHeader(state);
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (auth) {
    headers.Authorization = auth;
  }
  try {
    const res = await fetchImpl("/tools/invoke", {
      method: "POST",
      headers,
      body: JSON.stringify({ tool: contribution.panel.source.toolName, args: {} }),
    });
    const body = (await res.json().catch(() => null)) as ToolsInvokeOk | ToolsInvokeErr | null;
    if (!res.ok || !body?.ok) {
      const message =
        (body && !body.ok && body.error?.message) || `tool invocation failed (${res.status})`;
      state.panelResults = {
        ...state.panelResults,
        [key]: {
          loading: false,
          result: prev?.result ?? null,
          error: message,
          lastFetchedAt: prev?.lastFetchedAt ?? null,
        },
      };
      return;
    }
    state.panelResults = {
      ...state.panelResults,
      [key]: { loading: false, result: body.result, error: null, lastFetchedAt: Date.now() },
    };
  } catch (err) {
    state.panelResults = {
      ...state.panelResults,
      [key]: {
        loading: false,
        result: prev?.result ?? null,
        error: err instanceof Error ? err.message : String(err),
        lastFetchedAt: prev?.lastFetchedAt ?? null,
      },
    };
  }
}

export function extractToolResultText(result: unknown): string | null {
  if (!result || typeof result !== "object") {
    return null;
  }
  const r = result as { content?: unknown };
  if (!Array.isArray(r.content)) {
    return null;
  }
  const parts = r.content
    .map((c) => {
      if (c && typeof c === "object" && (c as { type?: unknown }).type === "text") {
        const text = (c as { text?: unknown }).text;
        return typeof text === "string" ? text : null;
      }
      return null;
    })
    .filter((s): s is string => typeof s === "string");
  if (parts.length === 0) {
    return null;
  }
  return parts.join("\n\n");
}
