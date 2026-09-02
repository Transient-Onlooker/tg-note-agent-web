import {
  useLayoutEffect,
  useRef,
  useState,
  type ComponentPropsWithoutRef,
  type FocusEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import type { PrintJobProperties } from "@note-relay/shared";
import type { Item, UpdateItemInput } from "../api/items";

type PrintQueueViewProps = {
  items: Item[];
  printQueueCount: number | null;
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
type DragState = {
  itemId: string;
  pointerId: number;
  startX: number;
  startY: number;
};

const queueStatusOptions: Array<{ value: QueueStatus; label: string }> = [
  { value: "missing", label: "미상" },
  { value: "waiting", label: "대기" },
  { value: "printing", label: "출력중" },
  { value: "done", label: "완료" },
  { value: "paused", label: "보류" },
];

function getQueueStatusOptions(properties: PrintJobProperties) {
  const currentStatus = typeof properties.queue_status === "string" ? properties.queue_status : "";
  if (!currentStatus) {
    return [{ value: "", label: "미상 (기존 값)" }, ...queueStatusOptions];
  }
  if (!queueStatusOptions.some((option) => option.value === currentStatus)) {
    return [...queueStatusOptions, { value: currentStatus as QueueStatus, label: currentStatus }];
  }
  return queueStatusOptions;
}

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

const numberFormatter = new Intl.NumberFormat("ko-KR");

function getColorSwatch(color: string) {
  const normalized = color.trim().toLowerCase();
  const named: Record<string, string> = {
    red: "#dc4b4b", "빨강": "#dc4b4b", "빨간색": "#dc4b4b",
    black: "#242424", "검정": "#242424", "검은색": "#242424",
    white: "#f7f7f4", "흰색": "#f7f7f4", "화이트": "#f7f7f4",
    mint: "#55bfa8", "민트": "#55bfa8",
    blue: "#4d7fd8", "파랑": "#4d7fd8", "파란색": "#4d7fd8",
    yellow: "#e5bc3f", "노랑": "#e5bc3f", "노란색": "#e5bc3f",
    green: "#53a45d", "초록": "#53a45d", "초록색": "#53a45d",
    orange: "#db8c3b", "주황": "#db8c3b", "주황색": "#db8c3b",
  };
  return named[normalized] ?? color;
}

function getHttpUrl(value: string) {
  try { const url = new URL(value); return url.protocol === "http:" || url.protocol === "https:" ? url.href : null; } catch { return null; }
}

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

function displayValue(properties: PrintJobProperties, key: EditableProperty, _item: Item) {
  if (key === "queue_status") return queueStatusOptions.find((option) => option.value === properties.queue_status)?.label ?? properties.queue_status ?? "미상";
  const value = properties[key];
  if (key === "colors" && Array.isArray(value)) return value.join(", ");
  if (key === "grams" && typeof value === "number") return `${numberFormatter.format(value)}g`;
  if (key === "price" && typeof value === "number") return `${numberFormatter.format(value)}원`;
  return value === undefined || value === null ? "" : String(value);
}

function editValue(properties: PrintJobProperties, key: EditableProperty, _item: Item) {
  if (key === "queue_status") return properties.queue_status ?? "";
  const value = properties[key];
  if (key === "colors" && Array.isArray(value)) return value.join(", ");
  return value === undefined || value === null ? "" : String(value);
}

function propertyValue(key: EditableProperty, value: string): unknown {
  if (key === "colors") {
    return value.split(",").map((color) => color.trim()).filter(Boolean);
  }

  if (key === "grams" || key === "price") {
    const normalized = value.replaceAll(",", "").trim();
    return normalized ? Number(normalized) : undefined;
  }

  if (key === "queue_status") {
    return value || undefined;
  }

  return value;
}

function displayDueDate(dueAt: string | null) {
  if (!dueAt) return "\u2014";
  const date = new Date(dueAt);
  return Number.isNaN(date.getTime()) ? dueAt : String(date.getMonth() + 1) + "/" + String(date.getDate());
}

function editDueDate(dueAt: string | null) {
  if (!dueAt) return "";
  const date = new Date(dueAt);
  return Number.isNaN(date.getTime()) ? "" : date.getFullYear() + "-" + String(date.getMonth() + 1).padStart(2, "0") + "-" + String(date.getDate()).padStart(2, "0");
}

function focusAdjacentEditableCell(input: HTMLElement, direction: number) {
  const currentCell = input.closest("td");
  if (!currentCell) return;

  const cells = Array.from(
    document.querySelectorAll<HTMLTableCellElement>(
      ".print-queue-table tbody td",
    ),
  ).filter((cell) => cell.querySelector(".print-queue-cell-button, input, select, textarea"));
  const currentIndex = cells.indexOf(currentCell);
  const nextButton = cells[currentIndex + direction]?.querySelector<HTMLElement>(
    ".print-queue-cell-button",
  );

  if (nextButton) window.setTimeout(() => nextButton.focus(), 0);
}


const textareaMaxHeight = 176;

function AutoGrowTextarea({
  onChange,
  value,
  ...props
}: ComponentPropsWithoutRef<"textarea">) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const resize = () => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    textarea.style.height = "0px";
    const nextHeight = Math.min(textarea.scrollHeight, textareaMaxHeight);
    textarea.style.height = `${nextHeight}px`;
    textarea.style.overflowY =
      textarea.scrollHeight > textareaMaxHeight ? "auto" : "hidden";
  };

  useLayoutEffect(() => {
    resize();
  }, [value]);

  return (
    <textarea
      {...props}
      ref={textareaRef}
      value={value}
      onChange={(event) => {
        onChange?.(event);
        window.requestAnimationFrame(resize);
      }}
    />
  );
}

export function PrintQueueView({
  items,
  printQueueCount,
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
  const [draggedItemId, setDraggedItemId] = useState<string | null>(null);
  const [dropIndex, setDropIndex] = useState<number | null>(null);
  const [dragOffsetY, setDragOffsetY] = useState(0);
  const [dragRowHeight, setDragRowHeight] = useState(0);
  const [isReordering, setIsReordering] = useState(false);
  const saveQueuesRef = useRef(new Map<string, Promise<void>>());
  const skipNextBlurRef = useRef(false);
  const dragStateRef = useRef<DragState | null>(null);
  const dragMovedRef = useRef(false);
  const dropIndexRef = useRef<number | null>(null);

  const orderedItems = [...items].sort(
    (left, right) =>
      left.position - right.position ||
      left.created_at.localeCompare(right.created_at) ||
      left.id.localeCompare(right.id),
  );
  const draggedIndex = draggedItemId
    ? orderedItems.findIndex((item) => item.id === draggedItemId)
    : -1;

  const cancelEditing = () => {
    setEditingCell(null);
    setDraft("");
    setSaveError(null);
  };

  const enqueueSave = (itemId: string, cellKey: string, input: UpdateItemInput) => {
    const previous = saveQueuesRef.current.get(itemId) ?? Promise.resolve();
    const task = previous
      .catch(() => undefined)
      .then(async () => {
        setSavingCell(cellKey);
        try {
          await onUpdateItem(itemId, input);
        } catch {
          setSaveError("수정하지 못했습니다.");
        } finally {
          setSavingCell((current) => current === cellKey ? null : current);
        }
      });

    saveQueuesRef.current.set(itemId, task);
    void task.finally(() => {
      if (saveQueuesRef.current.get(itemId) === task) {
        saveQueuesRef.current.delete(itemId);
      }
    });
  };

  const startEditing = (cell: string, value: string) => {
    if (isReordering) return;
    setEditingCell(cell);
    setDraft(value);
    setSaveError(null);
  };

  const saveProperty = (item: Item, key: EditableProperty, afterSave?: () => void) => {
    const properties = readProperties(item);
    const nextValue = propertyValue(key, draft);

    if (
      (key === "grams" || key === "price") &&
      nextValue !== undefined &&
      (Number.isNaN(nextValue) || (typeof nextValue === "number" && nextValue < 0))
    ) {
      setSaveError("0 이상의 숫자를 입력해 주세요.");
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

    cancelEditing();
    afterSave?.();
    enqueueSave(item.id, `${item.id}:${key}`, { properties_json: JSON.stringify(nextProperties) });
  };

  const saveOutput = (item: Item, afterSave?: () => void) => {
    const nextValue = draft.trim();
    if (!nextValue) {
      setSaveError("출력물을 입력해 주세요.");
      return;
    }
    if (nextValue === item.body) {
      cancelEditing();
      afterSave?.();
      return;
    }

    cancelEditing();
    afterSave?.();
    enqueueSave(item.id, `${item.id}:output`, { body: nextValue });
  };

  const saveDueDate = (item: Item, afterSave?: () => void) => {
    const nextValue = draft;
    if (nextValue === editDueDate(item.due_at)) {
      cancelEditing();
      afterSave?.();
      return;
    }

    cancelEditing();
    afterSave?.();
    enqueueSave(item.id, item.id + ":due_at", { due_at: nextValue || null });
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

  const reorderItems = async (itemId: string, targetIndex: number) => {
    if (isReordering) return;

    const currentIndex = orderedItems.findIndex(
      (candidate) => candidate.id === itemId,
    );
    if (
      currentIndex < 0 ||
      targetIndex < 0 ||
      targetIndex > orderedItems.length ||
      targetIndex === currentIndex ||
      targetIndex === currentIndex + 1
    ) {
      return;
    }

    const reorderedItems = [...orderedItems];
    const [movedItem] = reorderedItems.splice(currentIndex, 1);
    const insertionIndex = targetIndex > currentIndex
      ? targetIndex - 1
      : targetIndex;
    reorderedItems.splice(insertionIndex, 0, movedItem);

    const updates = reorderedItems
      .map((queueItem, index) => ({ queueItem, nextPosition: index + 1 }))
      .filter(({ queueItem, nextPosition }) => queueItem.position !== nextPosition)
      .map(({ queueItem, nextPosition }) =>
        onUpdateItem(queueItem.id, { position: nextPosition }),
      );

    if (updates.length === 0) return;

    setIsReordering(true);
    setSaveError(null);
    try {
      const results = await Promise.allSettled(updates);
      if (results.some((result) => result.status === "rejected")) {
        setSaveError("순서를 변경하지 못했습니다.");
        onRetry();
      }
    } finally {
      setIsReordering(false);
    }
  };

  const resetDrag = () => {
    dragStateRef.current = null;
    dragMovedRef.current = false;
    dropIndexRef.current = null;
    setDraggedItemId(null);
    setDropIndex(null);
    setDragOffsetY(0);
    setDragRowHeight(0);
  };

  const handleOrderPointerDown = (
    event: ReactPointerEvent<HTMLTableCellElement>,
    item: Item,
    index: number,
  ) => {
    if (isReordering || event.button !== 0) return;

    event.currentTarget.setPointerCapture(event.pointerId);
    dragStateRef.current = {
      itemId: item.id,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
    };
    dragMovedRef.current = false;
    dropIndexRef.current = index;
    setDraggedItemId(item.id);
    setDropIndex(index);
    setDragOffsetY(0);
    setDragRowHeight(event.currentTarget.parentElement?.getBoundingClientRect().height ?? 0);
  };

  const handleOrderPointerMove = (
    event: ReactPointerEvent<HTMLTableCellElement>,
  ) => {
    const dragState = dragStateRef.current;
    if (!dragState || dragState.pointerId !== event.pointerId) return;

    if (!dragMovedRef.current) {
      const distance = Math.hypot(
        event.clientX - dragState.startX,
        event.clientY - dragState.startY,
      );
      if (distance < 4) return;
      dragMovedRef.current = true;
    }

    event.preventDefault();
    setDragOffsetY(event.clientY - dragState.startY);
    const rows = Array.from(
      document.querySelectorAll<HTMLTableRowElement>(
        ".print-queue-table tbody tr",
      ),
    );

    if (rows.length === 0) return;

    const nextDropIndex = rows.findIndex((row) => {
      const bounds = row.getBoundingClientRect();
      return event.clientY < bounds.top + bounds.height / 2;
    });

    const resolvedDropIndex =
      nextDropIndex === -1 ? rows.length : nextDropIndex;

    if (dropIndexRef.current !== resolvedDropIndex) {
      dropIndexRef.current = resolvedDropIndex;
      setDropIndex(resolvedDropIndex);
    }
  };

  const handleOrderPointerEnd = (
    event: ReactPointerEvent<HTMLTableCellElement>,
  ) => {
    const dragState = dragStateRef.current;
    if (!dragState || dragState.pointerId !== event.pointerId) return;

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    const targetIndex = dragMovedRef.current ? dropIndexRef.current : null;
    const itemId = dragState.itemId;
    resetDrag();
    if (targetIndex !== null) void reorderItems(itemId, targetIndex);
  };

  const handleOrderPointerCancel = (
    event: ReactPointerEvent<HTMLTableCellElement>,
  ) => {
    if (dragStateRef.current?.pointerId !== event.pointerId) return;

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    resetDrag();
  };

  const handleInputBlur = (
    item: Item,
    key: EditableProperty | "output" | "due_at",
    event: FocusEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>,
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
    else if (key === "due_at") void saveDueDate(item);
    else void saveProperty(item, key);
  };


  const handleTextareaKeyDown = (
    event: ReactKeyboardEvent<HTMLTextAreaElement>,
    save: (afterSave?: () => void) => void,
  ) => {
    const input = event.currentTarget;

    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      save();
    }
    if (event.key === "Tab") {
      event.preventDefault();
      save(() =>
        focusAdjacentEditableCell(input, event.shiftKey ? -1 : 1),
      );
    }
    if (event.key === "Escape") {
      event.preventDefault();
      skipNextBlurRef.current = true;
      cancelEditing();
    }
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
          <div className="view-title-row">
            <h1 id="print-queue-title">Print Queue</h1>
            {printQueueCount !== null && <span className="count-pill">{printQueueCount}</span>}
          </div>
          <p>출력 작업의 정보를 한눈에 관리합니다.</p>
        </div>
        <div className="print-queue-toolbar">
          <button className="print-queue-add" type="button" onClick={onCreate} disabled={isCreating}>
            {isCreating ? "추가 중..." : "+ 작업 추가"}
          </button>
          <span className={`sync-status${isFetching ? "" : " is-idle"}`} role={isFetching ? "status" : undefined} aria-hidden={!isFetching}>
            <span className="sync-dot" aria-hidden="true" /><span className="sync-label">동기화 중</span>
          </span>
        </div>
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
                <th scope="col">&#xCD9C;&#xB825; &#xC608;&#xC815;</th>
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
                const showsDropBefore =
                  dropIndex === index &&
                  dropIndex !== draggedIndex &&
                  dropIndex !== draggedIndex + 1;
                const showsDropAfter =
                  dropIndex === orderedItems.length &&
                  index === orderedItems.length - 1 &&
                  dropIndex !== draggedIndex + 1;
                const rowClassName = [
                  draggedItemId === item.id && "print-queue-row--dragging",
                  showsDropBefore && "print-queue-row--drop-before",
                  showsDropAfter && "print-queue-row--drop-after",
                ]
                  .filter(Boolean)
                  .join(" ");
                const rowTranslateY =
                  draggedItemId === item.id
                    ? dragOffsetY
                    : dragRowHeight > 0 &&
                        dropIndex !== null &&
                        draggedIndex >= 0 &&
                        dropIndex > draggedIndex + 1 &&
                        index > draggedIndex &&
                        index < dropIndex
                      ? -dragRowHeight
                      : dragRowHeight > 0 &&
                          dropIndex !== null &&
                          draggedIndex >= 0 &&
                          dropIndex < draggedIndex &&
                          index >= dropIndex &&
                          index < draggedIndex
                        ? dragRowHeight
                        : 0;

                return (
                  <tr className={rowClassName || undefined} key={item.id} style={rowTranslateY !== 0 ? { transform: "translateY(" + rowTranslateY + "px)" } : undefined}>
                    <td
                      aria-label={`${index + 1}번 작업 순서 변경`}
                      className="print-queue-order-handle"
                      data-queue-index={index}
                      onPointerCancel={handleOrderPointerCancel}
                      onPointerDown={(event) =>
                        handleOrderPointerDown(event, item, index)
                      }
                      onPointerMove={handleOrderPointerMove}
                      onPointerUp={handleOrderPointerEnd}
                    >
                      {index + 1}
                    </td>
                    <td>
                      {editingCell === outputKey ? (
                        <div className="print-queue-edit-cell">
                          <AutoGrowTextarea
                            value={draft}
                            onChange={(event) => setDraft(event.target.value)}
                            onBlur={(event) => handleInputBlur(item, "output", event)}
                            onKeyDown={(event) =>
                              handleTextareaKeyDown(event, (afterSave) =>
                                void saveOutput(item, afterSave),
                              )
                            }
                            rows={1}
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
                <td>
                  {editingCell === item.id + ":due_at" ? (
                    <div className="print-queue-edit-cell">
                      <input type="date" value={draft} onChange={(event) => setDraft(event.target.value)} onBlur={(event) => handleInputBlur(item, "due_at", event)} autoFocus disabled={savingCell === item.id + ":due_at"} />
                      <button data-edit-action="save" type="button" onClick={() => void saveDueDate(item)} disabled={savingCell === item.id + ":due_at"}>저장</button>
                      <button data-edit-action="cancel" type="button" onClick={cancelEditing} disabled={savingCell === item.id + ":due_at"}>취소</button>
                    </div>
                  ) : (
                    <button className="print-queue-cell-button" type="button" onClick={() => startEditing(item.id + ":due_at", editDueDate(item.due_at))}>
                      {displayDueDate(item.due_at)}
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
                                  {getQueueStatusOptions(properties).map((option) => (
                                    <option
                                      key={option.value || "unknown"}
                                      value={option.value}
                                    >
                                      {option.label}
                                    </option>
                                  ))}
                                </select>
                              ) : column.key === "note" ? (
                                <AutoGrowTextarea
                                  value={draft}
                                  onChange={(event) => setDraft(event.target.value)}
                                  onBlur={(event) => handleInputBlur(item, column.key, event)}
                                  onKeyDown={(event) =>
                                    handleTextareaKeyDown(event, (afterSave) =>
                                      void saveProperty(item, column.key, afterSave),
                                    )
                                  }
                                  rows={1}
                                  autoFocus
                                  disabled={cellSaving}
                                />
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
                          ) : column.key === "colors" ? (
                            <button className="print-queue-cell-button print-queue-color-button" type="button" onClick={() => startEditing(cellKey, editableValue)}>
                              {Array.isArray(properties.colors) && properties.colors.length > 0 ? (
                                <span className="print-queue-color-chips">{properties.colors.map((color) => <span className="print-queue-color-chip" key={color}><span className="print-queue-color-swatch" style={{ backgroundColor: getColorSwatch(color) }} aria-hidden="true"/><span>{color}</span></span>)}</span>
                              ) : "—"}
                            </button>
                          ) : column.key === "model_url" ? (
                            <div className="print-queue-model-link">
                              {value ? (getHttpUrl(value) ? <a href={getHttpUrl(value) ?? undefined} target="_blank" rel="noreferrer">모델 열기</a> : <span className="print-queue-model-link__invalid">{value}</span>) : <span>—</span>}
                              <button type="button" onClick={() => startEditing(cellKey, editableValue)}>수정</button>
                            </div>
                          ) : (
                            <button className="print-queue-cell-button" type="button" onClick={() => startEditing(cellKey, editableValue)}>{value || "—"}</button>
                          )}
                        </td>
                      );
                    })}

                    <td className="print-queue-actions">
                      <div className="print-queue-actions__inner">
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
                      </div>
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
