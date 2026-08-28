import { useRef, useState, type FocusEvent } from "react";
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
type QueueStatus = NonNullable<PrintJobProperties["queue_status"]>;

const queueStatusOptions: Array<{ value: "" | QueueStatus; label: string }> = [
  { value: "", label: "미상" },
  { value: "waiting", label: "대기" },
  { value: "printing", label: "출력중" },
  { value: "done", label: "완료" },
  { value: "paused", label: "보류" },
];

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

function displayValue(
  properties: PrintJobProperties,
  key: EditableProperty,
  _item: Item,
) {
  if (key === "queue_status") {
    return queueStatusOptions.find(
      (option) => option.value === properties.queue_status,
    )?.label ?? "미상";
  }

  const value = properties[key];
  return key === "colors" && Array.isArray(value)
    ? value.join(", ")
    : value === undefined || value === null
      ? ""
      : String(value);
}

function editValue(
  properties: PrintJobProperties,
  key: EditableProperty,
  item: Item,
) {
  if (key === "queue_status") {
    return queueStatusOptions.some(
      (option) => option.value === properties.queue_status,
    )
      ? properties.queue_status ?? ""
      : "";
  }

  return displayValue(properties, key, item);
}

function propertyValue(key: EditableProperty, value: string): unknown {
  if (key === "colors") {
    return value.split(",").map((color) => color.trim()).filter(Boolean);
  }

  if (key === "grams" || key === "price") {
    return value.trim() ? Number(value) : undefined;
  }

  if (key === "queue_status") {
    const option = queueStatusOptions.find((candidate) => candidate.value === value);
    return option?.value || undefined;
  }

  return value;
}

function focusAdjacentEditableCell(input: HTMLElement, direction: number) {
  const currentCell = input.closest("td");
  if (!currentCell) return;

  const cells = Array.from(
    document.querySelectorAll<HTMLTableCellElement>(
      ".print-queue-table tbody td",
    ),
  ).filter((cell) => cell.querySelector(".print-queue-cell-button, input, select"));
  const currentIndex = cells.indexOf(currentCell);
  const nextButton = cells[currentIndex + direction]?.querySelector<HTMLElement>(
    ".print-queue-cell-button",
  );

  if (nextButton) window.setTimeout(() => nextButton.focus(), 0);
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
  const [movingItemId, setMovingItemId] = useState<string | null>(null);
  const savingCellRef = useRef<string | null>(null);
  const skipNextBlurRef = useRef(false);

  const orderedItems = [...items].sort(
    (left, right) =>
      left.position - right.position ||
      left.created_at.localeCompare(right.created_at) ||
      left.id.localeCompare(right.id),
  );

  const cancelEditing = () => {
    setEditingCell(null);
    setDraft("");
    setSaveError(null);
  };

  const startEditing = (cell: string, value: string) => {
    if (savingCellRef.current || movingItemId) return;
    setEditingCell(cell);
    setDraft(value);
    setSaveError(null);
  };

  const restoreAfterFailure = (serverValue: string) => {
    setEditingCell(null);
    setDraft(serverValue);
    setSaveError("수정하지 못했습니다.");
  };

  const saveProperty = async (
    item: Item,
    key: EditableProperty,
    afterSave?: () => void,
  ) => {
    const cellKey = `${item.id}:${key}`;
    if (savingCellRef.current) return;

    const properties = readProperties(item);
    const originalValue = displayValue(properties, key, item);
    const nextValue = propertyValue(key, draft);

    if (
      (key === "grams" || key === "price") &&
      nextValue !== undefined &&
      Number.isNaN(nextValue)
    ) {
      setSaveError("숫자를 입력해 주세요.");
      return;
    }

    const nextProperties = { ...properties };
    if (nextValue === undefined) delete nextProperties[key];
    else nextProperties[key] = nextValue as never;

    if (JSON.stringify(nextProperties) === JSON.stringify(properties)) {
      cancelEditing();
      afterSave?.();
      return;
    }

    savingCellRef.current = cellKey;
    setSavingCell(cellKey);
    try {
      await onUpdateItem(item.id, {
        properties_json: JSON.stringify(nextProperties),
      });
      cancelEditing();
      afterSave?.();
    } catch {
      restoreAfterFailure(originalValue);
    } finally {
      savingCellRef.current = null;
      setSavingCell(null);
    }
  };

  const saveOutput = async (item: Item, afterSave?: () => void) => {
    const cellKey = `${item.id}:output`;
    if (savingCellRef.current) return;

    const originalValue = item.body;
    const nextValue = draft.trim();
    if (!nextValue) {
      restoreAfterFailure(originalValue);
      return;
    }

    if (nextValue === originalValue) {
      cancelEditing();
      afterSave?.();
      return;
    }

    savingCellRef.current = cellKey;
    setSavingCell(cellKey);
    try {
      await onUpdateItem(item.id, { body: nextValue });
      cancelEditing();
      afterSave?.();
    } catch {
      restoreAfterFailure(originalValue);
    } finally {
      savingCellRef.current = null;
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
      setPendingRowActions((actions) =>
        actions.filter((key) => key !== actionKey),
      );
    }
  };

  const isRowActionPending = (item: Item, action: "inbox" | "archive") =>
    pendingRowActions.includes(`${item.id}:${action}`);

  const moveItem = async (item: Item, direction: -1 | 1) => {
    if (movingItemId) return;

    const currentIndex = orderedItems.findIndex(
      (candidate) => candidate.id === item.id,
    );
    const targetIndex = currentIndex + direction;
    if (
      currentIndex < 0 ||
      targetIndex < 0 ||
      targetIndex >= orderedItems.length
    ) {
      return;
    }

    const reorderedItems = [...orderedItems];
    const [movedItem] = reorderedItems.splice(currentIndex, 1);
    reorderedItems.splice(targetIndex, 0, movedItem);

    setMovingItemId(item.id);
    setSaveError(null);
    try {
      await Promise.all(
        reorderedItems
          .map((queueItem, index) => ({
            queueItem,
            nextPosition: index + 1,
          }))
          .filter(
            ({ queueItem, nextPosition }) =>
              queueItem.position !== nextPosition,
          )
          .map(({ queueItem, nextPosition }) =>
            onUpdateItem(queueItem.id, { position: nextPosition }),
          ),
      );
    } catch {
      setSaveError("순서를 변경하지 못했습니다.");
    } finally {
      setMovingItemId(null);
    }
  };

  const handleInputBlur = (
    item: Item,
    key: EditableProperty | "output",
    event: FocusEvent<HTMLInputElement | HTMLSelectElement>,
  ) => {
    if (skipNextBlurRef.current) {
      skipNextBlurRef.current = false;
      return;
    }

    if (
      event.relatedTarget instanceof HTMLElement &&
      event.relatedTarget.closest('[data-edit-action="cancel"]')
    ) {
      return;
    }

    if (key === "output") void saveOutput(item);
    else void saveProperty(item, key);
  };

  if (isPending) {
    return <div className="state-panel">Print Queue를 불러오는 중입니다.</div>;
  }

  if (isError) {
    return (
      <div className="state-panel state-panel--error">
        <span>Print Queue를 불러오지 못했습니다.</span>
        <button type="button" onClick={onRetry}>다시 시도</button>
      </div>
    );
  }

  return (
    <section
      className="workspace-view print-queue-view"
      aria-labelledby="print-queue-title"
    >
      <div className="view-heading">
        <div>
          <p className="eyebrow">WORKSPACE</p>
          <h1 id="print-queue-title">Print Queue</h1>
          <p>출력 작업의 정보를 한눈에 관리합니다.</p>
        </div>
        <button
          className="print-queue-add"
          type="button"
          onClick={onCreate}
          disabled={isCreating}
        >
          {isCreating ? "추가 중..." : "+ 작업 추가"}
        </button>
        {isFetching && <span className="view-status">동기화 중</span>}
      </div>

      {deleteError && <p className="inline-error">삭제하지 못했습니다.</p>}
      {saveError && <p className="inline-error">{saveError}</p>}

      {orderedItems.length === 0 ? (
        <div className="state-panel state-panel--empty">
          Print Queue가 비어 있습니다.
        </div>
      ) : (
        <div className="print-queue-table-wrap">
          <table className="print-queue-table">
            <thead>
              <tr>
                <th scope="col">순서</th>
                <th scope="col">출력물</th>
                {columns.map((column) => (
                  <th scope="col" key={column.key}>{column.label}</th>
                ))}
                <th scope="col">액션</th>
              </tr>
            </thead>
            <tbody>
              {orderedItems.map((item, index) => {
                const properties = readProperties(item);
                const output = item.body;
                const outputKey = `${item.id}:output`;
                const outputSaving = savingCell === outputKey;

                return (
                  <tr key={item.id}>
                    <td>{index + 1}</td>
                    <td>
                      {editingCell === outputKey ? (
                        <div className="print-queue-edit-cell">
                          <input
                            value={draft}
                            onChange={(event) => setDraft(event.target.value)}
                            onBlur={(event) => handleInputBlur(item, "output", event)}
                            onKeyDown={(event) => {
                              const input = event.currentTarget;
                              if (event.key === "Enter") {
                                event.preventDefault();
                                void saveOutput(item);
                              }
                              if (event.key === "Tab") {
                                event.preventDefault();
                                void saveOutput(item, () =>
                                  focusAdjacentEditableCell(
                                    input,
                                    event.shiftKey ? -1 : 1,
                                  ),
                                );
                              }
                              if (event.key === "Escape") {
                                event.preventDefault();
                                skipNextBlurRef.current = true;
                                cancelEditing();
                              }
                            }}
                            autoFocus
                            disabled={outputSaving}
                          />
                          <button
                            data-edit-action="save"
                            type="button"
                            onClick={() => void saveOutput(item)}
                            disabled={outputSaving}
                          >저장</button>
                          <button
                            data-edit-action="cancel"
                            type="button"
                            onClick={cancelEditing}
                            disabled={outputSaving}
                          >취소</button>
                        </div>
                      ) : (
                        <button
                          className="print-queue-cell-button print-queue-output"
                          type="button"
                          onClick={() => startEditing(outputKey, output)}
                        >
                          {output}
                        </button>
                      )}
                    </td>

                    {columns.map((column) => {
                      const value = displayValue(properties, column.key, item);
                      const editableValue = editValue(properties, column.key, item);
                      const cellKey = `${item.id}:${column.key}`;
                      const cellSaving = savingCell === cellKey;

                      return (
                        <td key={column.key}>
                          {editingCell === cellKey ? (
                            <div className="print-queue-edit-cell">
                              {column.key === "queue_status" ? (
                                <select
                                  value={draft}
                                  onChange={(event) => setDraft(event.target.value)}
                                  onBlur={(event) => handleInputBlur(item, column.key, event)}
                                  onKeyDown={(event) => {
                                    const input = event.currentTarget;
                                    if (event.key === "Enter") {
                                      event.preventDefault();
                                      void saveProperty(item, column.key);
                                    }
                                    if (event.key === "Tab") {
                                      event.preventDefault();
                                      void saveProperty(item, column.key, () =>
                                        focusAdjacentEditableCell(
                                          input,
                                          event.shiftKey ? -1 : 1,
                                        ),
                                      );
                                    }
                                    if (event.key === "Escape") {
                                      event.preventDefault();
                                      skipNextBlurRef.current = true;
                                      cancelEditing();
                                    }
                                  }}
                                  autoFocus
                                  disabled={cellSaving}
                                >
                                  {queueStatusOptions.map((option) => (
                                    <option
                                      key={option.value || "unknown"}
                                      value={option.value}
                                    >
                                      {option.label}
                                    </option>
                                  ))}
                                </select>
                              ) : (
                                <input
                                  value={draft}
                                  onChange={(event) => setDraft(event.target.value)}
                                  onBlur={(event) => handleInputBlur(item, column.key, event)}
                                  onKeyDown={(event) => {
                                    const input = event.currentTarget;
                                    if (event.key === "Enter") {
                                      event.preventDefault();
                                      void saveProperty(item, column.key);
                                    }
                                    if (event.key === "Tab") {
                                      event.preventDefault();
                                      void saveProperty(item, column.key, () =>
                                        focusAdjacentEditableCell(
                                          input,
                                          event.shiftKey ? -1 : 1,
                                        ),
                                      );
                                    }
                                    if (event.key === "Escape") {
                                      event.preventDefault();
                                      skipNextBlurRef.current = true;
                                      cancelEditing();
                                    }
                                  }}
                                  autoFocus
                                  disabled={cellSaving}
                                />
                              )}
                              <button
                                data-edit-action="save"
                                type="button"
                                onClick={() => void saveProperty(item, column.key)}
                                disabled={cellSaving}
                              >저장</button>
                              <button
                                data-edit-action="cancel"
                                type="button"
                                onClick={cancelEditing}
                                disabled={cellSaving}
                              >취소</button>
                            </div>
                          ) : (
                            <button
                              className="print-queue-cell-button"
                              type="button"
                              onClick={() => startEditing(cellKey, editableValue)}
                            >
                              {value || "—"}
                            </button>
                          )}
                        </td>
                      );
                    })}

                    <td className="print-queue-actions">
                      <button
                        type="button"
                        onClick={() => void moveItem(item, -1)}
                        disabled={Boolean(movingItemId) || index === 0}
                        aria-label="위로 이동"
                      >
                        {movingItemId === item.id ? "이동 중..." : "↑"}
                      </button>
                      <button
                        type="button"
                        onClick={() => void moveItem(item, 1)}
                        disabled={
                          Boolean(movingItemId) ||
                          index === orderedItems.length - 1
                        }
                        aria-label="아래로 이동"
                      >
                        {movingItemId === item.id ? "이동 중..." : "↓"}
                      </button>
                      <button
                        type="button"
                        onClick={() => void runRowAction(item, "inbox", onMoveToInbox)}
                        disabled={isRowActionPending(item, "inbox")}
                      >
                        {isRowActionPending(item, "inbox") ? "이동 중..." : "Inbox"}
                      </button>
                      <button
                        type="button"
                        onClick={() => void runRowAction(item, "archive", onArchive)}
                        disabled={isRowActionPending(item, "archive")}
                      >
                        {isRowActionPending(item, "archive") ? "보관 중..." : "보관"}
                      </button>
                      <button type="button" onClick={() => onDeleteRequest(item)}>
                        삭제
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
