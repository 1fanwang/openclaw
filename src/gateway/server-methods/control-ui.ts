import { loadConfig } from "../../config/config.js";
import {
  listControlUiPanelContributions,
  loadPluginManifestRegistry,
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

// Map the internal source object to the protocol shape variant-by-variant.
// Identity passthrough would silently leak any new internal-only field over
// the wire even though the schema says `additionalProperties: false`; this
// explicit map keeps the protocol independent of the internal record shape.
function toProtocolPanelSource(
  source: PluginManifestControlUiPanelContribution["panel"]["source"],
): ControlUiPanelContribution["panel"]["source"] {
  if (source.kind === "tool") {
    return source.refreshSec === undefined
      ? { kind: "tool", toolName: source.toolName }
      : { kind: "tool", toolName: source.toolName, refreshSec: source.refreshSec };
  }
  if (source.kind === "canvas") {
    return { kind: "canvas", documentId: source.documentId };
  }
  return { kind: "iframe", url: source.url };
}

function toProtocolContribution(
  internal: PluginManifestControlUiPanelContribution,
): ControlUiPanelContribution {
  return {
    pluginId: internal.pluginId,
    panel: {
      id: internal.panel.id,
      title: internal.panel.title,
      preferredPosition: internal.panel.preferredPosition,
      source: toProtocolPanelSource(internal.panel.source),
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
