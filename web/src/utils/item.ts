import type { Item } from "../api/items";

export function getReferenceType(item: Item): "modeling" | "question" | null {
  if (item.kind !== "reference") return null;

  try {
    const parsed: unknown = JSON.parse(item.properties_json);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    const value = (parsed as Record<string, unknown>).reference_type;
    return value === "modeling" || value === "question" ? value : null;
  } catch {
    return null;
  }
}

export function getItemKindLabel(item: Item) {
  switch (item.kind) {
    case "inbox": return "Inbox";
    case "note": return "Notes";
    case "task": return "Todo";
    case "purchase": return "Purchase";
    case "print_job": return "Print Queue";
    case "reference": {
      const referenceType = getReferenceType(item);
      if (referenceType === "modeling") return "3D 모델링";
      if (referenceType === "question") return "궁금증";
      return "참고";
    }
  }
}
