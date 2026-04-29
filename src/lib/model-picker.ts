/**
 * Helpers for the model picker drill-down UX.
 *
 * Reasoning-effort variants of the same model (Low/Medium/High) share
 * `baseId` and `baseLabel`. The picker collapses them into a single row;
 * clicking it opens a submenu that lets the user pick the effort level.
 */

import type { ModelCatalogEntry } from "@/lib/electron";

export type PickerRow =
  | { kind: "single"; entry: ModelCatalogEntry }
  | {
      kind: "group";
      baseId: string;
      baseLabel: string;
      provider: string;
      contextWindow: string;
      usage: string;
      group: "featured" | "other";
      warning?: string;
      variants: ModelCatalogEntry[]; // ordered low → medium → high
    };

const EFFORT_ORDER: Record<string, number> = { low: 0, medium: 1, high: 2 };

export function buildPickerRows(entries: ModelCatalogEntry[]): PickerRow[] {
  const rows: PickerRow[] = [];
  const seenBases = new Set<string>();
  for (const entry of entries) {
    if (entry.baseId) {
      if (seenBases.has(entry.baseId)) continue;
      seenBases.add(entry.baseId);
      const variants = entries
        .filter((e) => e.baseId === entry.baseId)
        .slice()
        .sort((a, b) => (EFFORT_ORDER[a.reasoningEffort ?? ""] ?? 99) - (EFFORT_ORDER[b.reasoningEffort ?? ""] ?? 99));
      rows.push({
        kind: "group",
        baseId: entry.baseId,
        baseLabel: entry.baseLabel ?? entry.label,
        provider: entry.provider,
        contextWindow: entry.contextWindow,
        usage: entry.usage,
        group: entry.group,
        warning: entry.warning,
        variants,
      });
    } else {
      rows.push({ kind: "single", entry });
    }
  }
  return rows;
}

/** Returns the effort variant matching the currently selected id within a group, or undefined. */
export function selectedVariantOf(row: PickerRow, selectedId: string): ModelCatalogEntry | undefined {
  if (row.kind !== "group") return undefined;
  return row.variants.find((v) => v.id === selectedId);
}

export function effortLabel(effort: string | undefined): string {
  switch (effort) {
    case "low": return "Low";
    case "medium": return "Medium";
    case "high": return "High";
    default: return effort ?? "";
  }
}
