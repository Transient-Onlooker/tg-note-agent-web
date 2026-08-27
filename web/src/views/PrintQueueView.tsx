import { useState } from "react";
import type { PrintJobProperties } from "@note-relay/shared";
import type { Item, UpdateItemInput } from "../api/items";

type PrintQueueViewProps = {
  items: Item[];
  isPending: boolean;
  isError: boolean;
  isFetching: boolean;
  isCreating: boolean;
  deleteError: boolean;
  onRetry: () => void;
  onUpdateItem: (id: string, input: UpdateItemInput) => Promise<Item>;
  onCreate: () => void;
  onMoveToInbox: (item: Item) => Promise<unknown>;
  onArchive: (item: Item) => Promise<unknown>;
  onDeleteRequest: (item: Item) => void;
};

type EditableProperty = keyof PrintJobProperties;

const columns: Array<{ key: EditableProperty; label: string }> = [
  { key: "customer", label: "의뢰인" },
  { key: "colors", label: "색상" },
  { key: "grams", label: "무게" },
  { key: "price", label: "금액" },
  { key: "payment", label: "입금" },
  { key: "queue_status", label: "상태" },
  { key: "model_url", label: "모델 링크" },
  { key: "note", label: "비고" },
];

function readProperties(item: Item): PrintJobProperties {
  try {
    const parsed: unknown = JSON.parse(item.properties_json);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as PrintJobProperties
      : {};
  } catch {
    return {};
  }
}

function displayValue(properties: PrintJobProperties, key: EditableProperty, item: Item) {
  if (key === "queue_status") return properties.queue_status ?? item.status;
  const value = properties[key];
  return key === "colors" && Array.isArray(value)
    ? value.join(", ")
    : value === undefined || value === null ? "" : String(value);
}

function propertyValue(key: EditableProperty, value: string): unknown {
  if (key === "colors") return value.split(",").map((color) => color.trim()).filter(Boolean);
  if (key === "grams" || key === "price") return value.trim() ? Number(value) : undefined;
  return value;
}

export function PrintQueueView({
  items,
  isPending,
  isError,
  isFetching,
  isCreating,
  deleteError,
  onRetry,
  onUpdateItem,
  onCreate,
  onMoveToInbox,
  onArchive,
  onDeleteRequest,
}: PrintQueueViewProps) {
  const [editingCell, setEditingCell] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savingCell, setSavingCell] = useState<string | null>(null);
  const [pendingRowActions, setPendingRowActions] = useState<string[]>([]);

  const cancelEditing = () => {
    setEditingCell(null);
    setDraft("");
    setSaveError(null);
  };

  const startEditing = (cell: string, value: string) => {
    if (savingCell) return;
    setEditingCell(cell);
    setDraft(value);
    setSaveError(null);
  };

  const saveProperty = async (item: Item, key: EditableProperty) => {
    const cellKey = `${item.id}:${key}`;
    if (savingCell) return;

    const properties = readProperties(item);
    const nextValue = propertyValue(key, draft);
    if ((key === "grams" || key === "price") && nextValue !== undefined && Number.isNaN(nextValue)) {
      setSaveError("숫자를 입력해 주세요.");
      return;
    }

    if (nextValue === undefined) delete properties[key];
    else properties[key] = nextValue as never;

    setSavingCell(cellKey);
    try {
      await onUpdateItem(item.id, { properties_json: JSON.stringify(properties) });
      cancelEditing();
    } catch {
      setSaveError("수정하지 못했습니다.");
    } finally {
      setSavingCell(null);
    }
  };

  const saveOutput = async (item: Item) => {
    const cellKey = `${item.id}:output`;
    if (savingCell || !draft.trim()) return;

    setSavingCell(cellKey);
    try {
      await onUpdateItem(item.id, { body: draft.trim() });
      cancelEditing();
    } catch {
      setSaveError("수정하지 못했습니다.");
    } finally {
      setSavingCell(null);
    }
  };

  const runRowAction = async (
    item: Item,
    action: "inbox" | "archive",
    callback: (item: Item) => Promise<unknown>,
  ) => {
    const actionKey = `${item.id}:${action}`;
    setPendingRowActions((actions) => [...actions, actionKey]);
    try {
      await callback(item);
    } finally {
      setPendingRowActions((actions) => actions.filter((key) => key !== actionKey));
    }
  };

  const isRowActionPending = (item: Item, action: "inbox" | "archive") =>
    pendingRowActions.includes(`${item.id}:${action}`);

  if (isPending) return <div className="state-panel">Print Queue를 불러오는 중입니다.</div>;
  if (isError) {
    return <div className="state-panel state-panel--error"><span>Print Queue를 불러오지 못했습니다.</span><button type="button" onClick={onRetry}>다시 시도</button></div>;
  }

  return (
    <section className="workspace-view print-queue-view" aria-labelledby="print-queue-title">
      <div className="view-heading">
        <div><p className="eyebrow">WORKSPACE</p><h1 id="print-queue-title">Print Queue</h1><p>출력 작업의 정보를 한눈에 관리합니다.</p></div>
        <button className="print-queue-add" type="button" onClick={onCreate} disabled={isCreating}>+ 작업 추가</button>
        {isFetching && <span className="view-status">동기화 중</span>}
      </div>
      {deleteError && <p className="inline-error">삭제하지 못했습니다.</p>}
      {saveError && <p className="inline-error">{saveError}</p>}
      {items.length === 0 ? <div className="state-panel state-panel--empty">Print Queue가 비어 있습니다.</div> : (
        <div className="print-queue-table-wrap">
          <table className="print-queue-table">
            <thead><tr><th scope="col">순서</th><th scope="col">출력물</th>{columns.map((column) => <th scope="col" key={column.key}>{column.label}</th>)}<th scope="col">액션</th></tr></thead>
            <tbody>{items.map((item, index) => {
              const properties = readProperties(item);
              const output = item.title?.trim() || item.body;
              const outputKey = `${item.id}:output`;
              const outputSaving = savingCell === outputKey;

              return <tr key={item.id}>
                <td>{item.position || index + 1}</td>
                <td>{editingCell === outputKey ? <div className="print-queue-edit-cell"><input value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") void saveOutput(item); if (event.key === "Escape") cancelEditing(); }} autoFocus /><button type="button" onClick={() => void saveOutput(item)} disabled={outputSaving}>저장</button><button type="button" onClick={cancelEditing} disabled={outputSaving}>취소</button></div> : <button className="print-queue-cell-button print-queue-output" type="button" onClick={() => startEditing(outputKey, output)}>{output}</button>}</td>
                {columns.map((column) => {
                  const value = displayValue(properties, column.key, item);
                  const cellKey = `${item.id}:${column.key}`;
                  const cellSaving = savingCell === cellKey;

                  return <td key={column.key}>{editingCell === cellKey ? <div className="print-queue-edit-cell"><input value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") void saveProperty(item, column.key); if (event.key === "Escape") cancelEditing(); }} autoFocus /><button type="button" onClick={() => void saveProperty(item, column.key)} disabled={cellSaving}>저장</button><button type="button" onClick={cancelEditing} disabled={cellSaving}>취소</button></div> : <button className="print-queue-cell-button" type="button" onClick={() => startEditing(cellKey, value)}>{value || "—"}</button>}</td>;
                })}
                <td className="print-queue-actions"><button type="button" onClick={() => void runRowAction(item, "inbox", onMoveToInbox)} disabled={isRowActionPending(item, "inbox")}>{isRowActionPending(item, "inbox") ? "이동 중..." : "Inbox"}</button><button type="button" onClick={() => void runRowAction(item, "archive", onArchive)} disabled={isRowActionPending(item, "archive")}>{isRowActionPending(item, "archive") ? "보관 중..." : "보관"}</button><button type="button" onClick={() => onDeleteRequest(item)}>삭제</button></td>
              </tr>;
            })}</tbody>
          </table>
        </div>
      )}
    </section>
  );
}
