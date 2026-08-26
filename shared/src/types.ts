export const ITEM_KINDS = [
  "inbox",
  "note",
  "task",
  "reference",
  "purchase",
  "print_job"
] as const;

export type ItemKind = (typeof ITEM_KINDS)[number];

export const ITEM_STATUSES = [
  "active",
  "waiting",
  "done",
  "archived",
  "cancelled"
] as const;

export type ItemStatus = (typeof ITEM_STATUSES)[number];

export type CaptureSource =
  | "telegram"
  | "web"
  | "migration";

export interface Capture {
  id: string;
  source: CaptureSource;
  sourceChatId: string | null;
  sourceMessageId: string | null;
  sourceUserId: string | null;
  rawText: string;
  createdAt: string;
}

export interface Item {
  id: string;
  captureId: string | null;
  parentId: string | null;
  projectId: string | null;
  kind: ItemKind;
  status: ItemStatus;
  title: string | null;
  body: string;
  dueAt: string | null;
  properties: Record<string, unknown>;
  position: number;
  triagedAt: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  version: number;
}

export interface Project {
  id: string;
  name: string;
  description: string | null;
  status: "active" | "archived";
  createdAt: string;
  updatedAt: string;
  archivedAt: string | null;
}

export interface ApiError {
  error: string;
  message: string;
}

export interface ListResponse<T> {
  items: T[];
}
