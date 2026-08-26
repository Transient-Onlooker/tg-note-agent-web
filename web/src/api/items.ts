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

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ?? "http://127.0.0.1:8787";

export async function getItems(): Promise<Item[]> {
  const response = await fetch(`${API_BASE_URL}/api/items`);

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

  const response = await fetch(`${API_BASE_URL}/api/items`, {
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
