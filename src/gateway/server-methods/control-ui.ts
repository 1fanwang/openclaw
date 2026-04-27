import { loadConfig } from "../../config/config.js";
import { loadPluginManifestRegistry } from "../../plugins/manifest-registry.js";
import {
  listControlUiPanelContributions,
  type PluginManifestControlUiPanelContribution,
} from "../../plugins/manifest-registry.js";
import type { ControlUiPanelContribution, ControlUiListPanelsResult } from "../protocol/index.js";
import {
  ErrorCodes,
  errorShape,
  formatValidationErrors,
  validateControlUiListPanelsParams,
} from "../protocol/index.js";
import { CONTROL_UI_PANELS_MAX_ITEMS } from "../protocol/schema/control-ui.js";
import type { GatewayRequestHandlers } from "./types.js";

// Internal contribution shape (from the manifest registry) → protocol shape
// (a typed snapshot of the panel descriptor). Identity-preserving copies
// here would couple consumers to internal types; the explicit map keeps
// the protocol independent.
function toProtocolContribution(
  internal: PluginManifestControlUiPanelContribution,
): ControlUiPanelContribution {
  return {
    pluginId: internal.pluginId,
    panel: {
      id: internal.panel.id,
      title: internal.panel.title,
      preferredPosition: internal.panel.preferredPosition,
      source: internal.panel.source,
    },
  };
}

export function buildControlUiListPanelsResult(): ControlUiListPanelsResult {
  const config = loadConfig();
  const registry = loadPluginManifestRegistry({ config });
  const internalContributions = listControlUiPanelContributions(registry);
  const contributions = internalContributions
    .slice(0, CONTROL_UI_PANELS_MAX_ITEMS)
    .map(toProtocolContribution);
  return { contributions };
}

export const controlUiHandlers: GatewayRequestHandlers = {
  "controlUi.listPanels": ({ params, respond }) => {
    if (!validateControlUiListPanelsParams(params)) {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.INVALID_REQUEST,
          `invalid controlUi.listPanels params: ${formatValidationErrors(validateControlUiListPanelsParams.errors)}`,
        ),
      );
      return;
    }
    respond(true, buildControlUiListPanelsResult(), undefined);
  },
};
