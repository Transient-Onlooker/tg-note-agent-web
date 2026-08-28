import { API_BASE_URL, authenticatedFetch } from "./auth";
export type { PrintJobProperties } from "@note-relay/shared";

export const ITEM_KINDS = [
  "inbox",
  "note",
  "task",
  "reference",
  "purchase",
  "print_job",
] as const;

export const ITEM_STATUSES = [
  "active",
  "waiting",
  "done",
  "archived",
  "cancelled",
] as const;

export type ItemKind = (typeof ITEM_KINDS)[number];
export type ItemStatus = (typeof ITEM_STATUSES)[number];

export interface Item {
  id: string;
  capture_id: string | null;
  parent_id: string | null;
  project_id: string | null;
  kind: ItemKind;
  status: ItemStatus;
  title: string | null;
  body: string;
  due_at: string | null;
  properties_json: string;
  position: number;
  triaged_at: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  version: number;
}

export type ItemFilters = {
  kind?: ItemKind;
  status?: ItemStatus;
  projectId?: string;
  dueFrom?: string;
  dueTo?: string;
};

export type UpdateItemInput = {
  body?: string;
  kind?: ItemKind;
  status?: ItemStatus;
  project_id?: string | null;
  due_at?: string | null;
  properties_json?: string;
  position?: number;
};

export type ItemCounts = {
  inbox: number;
  todo: number;
  today: number;
  notes: number;
  printQueue: number;
  purchase: number;
  archive: number;
  trash: number;
};

export const itemQueryKeys = {
  all: ["items"] as const,
  list: (filters: ItemFilters = {}) =>
    ["items", {
      kind: filters.kind ?? null,
      status: filters.status ?? null,
      projectId: filters.projectId ?? null,
      dueFrom: filters.dueFrom ?? null,
      dueTo: filters.dueTo ?? null,
    }] as const,
};

export const itemCountQueryKeys = {
  all: ["item-counts"] as const,
  list: (todayTo: string) => ["item-counts", { todayTo }] as const,
};

function buildItemsUrl(filters: ItemFilters) {
  const params = new URLSearchParams();

  if (filters.kind) {
    params.set("kind", filters.kind);
  }

  if (filters.status) {
    params.set("status", filters.status);
  }

  if (filters.projectId) {
    params.set("project_id", filters.projectId);
  }

  if (filters.dueFrom) {
    params.set("due_from", filters.dueFrom);
  }

  if (filters.dueTo) {
    params.set("due_to", filters.dueTo);
  }

  const query = params.toString();

  return `${API_BASE_URL}/api/items${query ? `?${query}` : ""}`;
}

export async function listItems(
  filters: ItemFilters = {},
): Promise<Item[]> {
  const response = await authenticatedFetch(buildItemsUrl(filters));

  if (!response.ok) {
    throw new Error(`Failed to fetch items: ${response.status}`);
  }

  const data: { items: Item[] } = await response.json();
  return data.items;
}

export async function getItemCounts(todayTo: string): Promise<ItemCounts> {
  const response = await authenticatedFetch(
    `${API_BASE_URL}/api/counts?today_to=${encodeURIComponent(todayTo)}`,
  );

  if (!response.ok) {
    throw new Error(`Failed to fetch item counts: ${response.status}`);
  }

  const data: { counts: ItemCounts } = await response.json();
  return data.counts;
}

export async function getItems(): Promise<Item[]> {
  return listItems({
    kind: "inbox",
    status: "active",
  });
}

export async function listTrash(): Promise<Item[]> {
  const response = await authenticatedFetch(`${API_BASE_URL}/api/trash`);

  if (!response.ok) {
    throw new Error(`Failed to fetch trash: ${response.status}`);
  }

  const data: { items: Item[] } = await response.json();
  return data.items;
}

export async function createItem(body: string): Promise<void> {
  const trimmedBody = body.trim();

  if (!trimmedBody) {
    throw new Error("Item body cannot be empty");
  }

  const response = await authenticatedFetch(`${API_BASE_URL}/api/items`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json; charset=utf-8",
    },
    body: JSON.stringify({ body: trimmedBody }),
  });

  if (!response.ok) {
    throw new Error(`Failed to create item: ${response.status}`);
  }
}

export async function createPrintJob(): Promise<void> {
  const response = await authenticatedFetch(`${API_BASE_URL}/api/items`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json; charset=utf-8",
    },
    body: JSON.stringify({
      body: "새 출력 작업",
      kind: "print_job",
      properties_json: "{}",
    }),
  });

  if (!response.ok) {
    throw new Error(`Failed to create print job: ${response.status}`);
  }
}

export async function deleteItem(id: string): Promise<void> {
  const response = await authenticatedFetch(
    `${API_BASE_URL}/api/items/${encodeURIComponent(id)}`,
    {
      method: "DELETE",
    },
  );

  if (!response.ok) {
    throw new Error(`Failed to delete item: ${response.status}`);
  }
}

export async function updateItemFields(
  id: string,
  input: UpdateItemInput,
): Promise<Item> {
  const response = await authenticatedFetch(
    `${API_BASE_URL}/api/items/${encodeURIComponent(id)}`,
    {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json; charset=utf-8",
      },
      body: JSON.stringify(input),
    },
  );

  if (!response.ok) {
    throw new Error(`Failed to update item: ${response.status}`);
  }

  const data: { item: Item } = await response.json();
  return data.item;
}

export async function updateItem(
  id: string,
  body: string,
): Promise<Item> {
  return updateItemFields(id, { body });
}

export async function restoreItem(id: string): Promise<Item> {
  const response = await authenticatedFetch(
    `${API_BASE_URL}/api/items/${encodeURIComponent(id)}/restore`,
    {
      method: "POST",
    },
  );

  if (!response.ok) {
    throw new Error(`Failed to restore item: ${response.status}`);
  }

  const data: { item: Item } = await response.json();
  return data.item;
}
