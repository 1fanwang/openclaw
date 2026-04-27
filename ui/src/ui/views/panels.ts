import { html, nothing } from "lit";
import { t } from "../../i18n/index.ts";
import type { ControlUiPanelContribution } from "../types.ts";

export type PanelsState = {
  contributions: readonly ControlUiPanelContribution[] | null;
  loading: boolean;
  error: string | null;
  lastSuccess: number | null;
};

export type PanelsProps = {
  state: PanelsState;
  onRefresh: () => void;
};

function renderHeader(props: PanelsProps) {
  return html`
    <header
      class="panels-header"
      style="display:flex; align-items:baseline; gap:12px; margin-bottom:16px;"
    >
      <h1 style="margin:0; font-size:20px;">${t("tabs.panels")}</h1>
      <span style="color: var(--color-fg-muted, #888); font-size:13px;"
        >${t("subtitles.panels")}</span
      >
      <button
        @click=${props.onRefresh}
        style="margin-left:auto; padding:4px 10px; font-size:12px;"
        ?disabled=${props.state.loading}
        title="Refresh panel list"
      >
        ${props.state.loading ? "Refreshing…" : "Refresh"}
      </button>
    </header>
  `;
}

function renderEmptyState() {
  return html`
    <div
      style="
        padding: 24px;
        border: 1px dashed var(--color-border, #ccc);
        border-radius: 8px;
        color: var(--color-fg-muted, #888);
        text-align: center;
      "
    >
      <div style="font-weight:600; margin-bottom:6px;">No plugin panels registered</div>
      <div style="font-size:13px;">
        Plugins can contribute panels via <code>controlUiPanels</code> in
        <code>openclaw.plugin.json</code>. They show up here automatically.
      </div>
    </div>
  `;
}

function formatSourceLabel(source: ControlUiPanelContribution["panel"]["source"]): string {
  if (source.kind === "tool") {
    return source.refreshSec
      ? `tool: ${source.toolName} (every ${source.refreshSec}s)`
      : `tool: ${source.toolName}`;
  }
  if (source.kind === "canvas") {
    return `canvas: ${source.documentId}`;
  }
  return `iframe: ${source.url}`;
}

function renderContributionCard(c: ControlUiPanelContribution) {
  const { pluginId, panel } = c;
  return html`
    <article
      class="panel-card"
      data-plugin-id=${pluginId}
      data-panel-id=${panel.id}
      style="
        padding: 16px;
        border: 1px solid var(--color-border, #ccc);
        border-radius: 8px;
        background: var(--color-bg-secondary, transparent);
        display:flex; flex-direction:column; gap:8px;
      "
    >
      <header style="display:flex; align-items:baseline; gap:8px; flex-wrap:wrap;">
        <h3 style="margin:0; font-size:15px;">${panel.title}</h3>
        <code style="font-size:11px; color: var(--color-fg-muted, #888);"
          >${pluginId}:${panel.id}</code
        >
        <span
          style="
            margin-left:auto;
            font-size:10px;
            padding: 2px 6px;
            border-radius: 3px;
            background: var(--color-accent-bg, #e0e7ff);
            color: var(--color-accent, #4338ca);
            text-transform: uppercase;
          "
          >${panel.preferredPosition}</span
        >
      </header>
      <div
        style="font-size:12px; color: var(--color-fg-muted, #888); font-family: ui-monospace, Menlo, monospace;"
      >
        ${formatSourceLabel(panel.source)}
      </div>
      <div style="font-size:12px; font-style: italic; color: var(--color-fg-muted, #888);">
        Panel rendering (tool invocation, canvas mount, iframe) ships in the next D-4 phase.
      </div>
    </article>
  `;
}

export function renderPanels(props: PanelsProps) {
  const { state } = props;
  const body = (() => {
    if (state.error) {
      return html`<div style="padding:16px; color: var(--color-error, #d33);">
        Failed to load panels: ${state.error}
      </div>`;
    }
    if (state.loading && !state.contributions) {
      return html`<div style="padding:16px; color: var(--color-fg-muted, #888);">
        Loading panels…
      </div>`;
    }
    if (!state.contributions || state.contributions.length === 0) {
      return renderEmptyState();
    }
    return html`
      <div
        class="panels-grid"
        style="
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(360px, 1fr));
          gap: 12px;
        "
      >
        ${state.contributions.map((c) => renderContributionCard(c))}
      </div>
    `;
  })();
  return html`
    <section class="panels-view" style="padding: 16px; max-width: 1200px;">
      ${renderHeader(props)} ${body}
      ${state.lastSuccess !== null
        ? html`<footer
            style="margin-top: 12px; font-size: 11px; color: var(--color-fg-muted, #888);"
          >
            Last refresh: ${new Date(state.lastSuccess).toLocaleTimeString()}
          </footer>`
        : nothing}
    </section>
  `;
}
