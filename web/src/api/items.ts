import { API_BASE_URL, authenticatedFetch } from "./auth";

export interface Item {
  id: string;
  capture_id: string | null;
  parent_id: string | null;
  project_id: string | null;
  kind: string;
  status: string;
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

export async function getItems(): Promise<Item[]> {
  const response = await authenticatedFetch(`${API_BASE_URL}/api/items`);

  if (!response.ok) {
    throw new Error(`Failed to fetch items: ${response.status}`);
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

export async function updateItem(id: string, body: string): Promise<Item> {
  const response = await authenticatedFetch(
    `${API_BASE_URL}/api/items/${encodeURIComponent(id)}`,
    {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json; charset=utf-8",
      },
      body: JSON.stringify({ body }),
    },
  );

  if (!response.ok) {
    throw new Error(`Failed to update item: ${response.status}`);
  }

  const data: { item: Item } = await response.json();
  return data.item;
}
