import type { ControlUiListPanelsResult } from "../../../../src/gateway/protocol/index.js";
import type { ControlUiPanelContribution } from "../types.ts";
import {
  formatMissingOperatorReadScopeMessage,
  isMissingOperatorReadScopeError,
} from "./scope-errors.ts";

export type ControlUiPanelsState = {
  client: { request: <T>(method: string, params?: unknown) => Promise<T> } | null;
  connected: boolean;
  panelsLoading: boolean;
  panelsContributions: readonly ControlUiPanelContribution[] | null;
  panelsError: string | null;
  panelsLastSuccess: number | null;
};

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
