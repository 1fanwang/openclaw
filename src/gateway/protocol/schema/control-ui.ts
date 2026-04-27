import { Type } from "typebox";
import { NonEmptyString } from "./primitives.js";

// Cap the SPA's mount cost: a misbehaving plugin can't flood the SPA with
// thousands of panels via a single manifest. Soft limit, enforced server-side.
export const CONTROL_UI_PANELS_MAX_ITEMS = 200;

const ControlUiPanelPositionSchema = Type.Union([
  Type.Literal("sidebar"),
  Type.Literal("dock-right"),
  Type.Literal("tab"),
]);

const ControlUiPanelSourceSchema = Type.Union([
  Type.Object(
    {
      kind: Type.Literal("tool"),
      toolName: NonEmptyString,
      refreshSec: Type.Optional(Type.Integer({ minimum: 1 })),
    },
    { additionalProperties: false },
  ),
  Type.Object(
    {
      kind: Type.Literal("canvas"),
      documentId: NonEmptyString,
    },
    { additionalProperties: false },
  ),
  Type.Object(
    {
      kind: Type.Literal("iframe"),
      url: NonEmptyString,
    },
    { additionalProperties: false },
  ),
]);

const ControlUiPanelSchema = Type.Object(
  {
    id: NonEmptyString,
    title: NonEmptyString,
    preferredPosition: ControlUiPanelPositionSchema,
    source: ControlUiPanelSourceSchema,
  },
  { additionalProperties: false },
);

export const ControlUiPanelContributionSchema = Type.Object(
  {
    pluginId: NonEmptyString,
    panel: ControlUiPanelSchema,
  },
  { additionalProperties: false },
);

export const ControlUiListPanelsParamsSchema = Type.Object({}, { additionalProperties: false });

export const ControlUiListPanelsResultSchema = Type.Object(
  {
    contributions: Type.Array(ControlUiPanelContributionSchema, {
      maxItems: CONTROL_UI_PANELS_MAX_ITEMS,
    }),
  },
  { additionalProperties: false },
);
