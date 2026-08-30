import { useEffect, useState } from "react";
import type { Item } from "../api/items";
import { CardActions, type CardAction } from "../components/CardActions";
import { Icon } from "../components/Icon";
import { formatCreatedAt, getDateTimeInputValue } from "../utils/date";
import { getItemKindLabel } from "../utils/item";

type Props = {
  items: Item[];
  archiveCount: number | null;
  isPending: boolean;
  isError: boolean;
  isSuccess: boolean;
  isFetching: boolean;
  editingItemId: string | null;
  editDraft: string;
  editDueAt: string;
  editError: string | null;
  isUpdating: boolean;
  deleteError: boolean;
  onRetry: () => void;
  onStartEditing: (item: Item) => void;
  onEditDraftChange: (value: string) => void;
  onEditDueChange: (value: string) => void;
  onCancelEditing: () => void;
  onSaveEditing: () => void;
  onRestore: (item: Item) => Promise<unknown>;
  onDeleteRequest: (item: Item) => void;
};

export function ArchiveView(p: Props) {
  const [openActionMenuId, setOpenActionMenuId] = useState<string | null>(null);
  const [restoringItemId, setRestoringItemId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => setOpenActionMenuId(null), [p.editingItemId]);

  const restore = async (item: Item) => {
    if (restoringItemId !== null) return;
    setActionError(null);
    setRestoringItemId(item.id);
    try {
      await p.onRestore(item);
    } catch {
      setActionError("보관된 항목을 복원하지 못했습니다. 잠시 후 다시 시도해 주세요.");
    } finally {
      setRestoringItemId(null);
    }
  };

  const getActions = (item: Item): CardAction[] => [
    {
      key: "restore",
      className: "note-card__inbox",
      label: restoringItemId === item.id ? "복원 중..." : "활성 상태로 복원",
      icon: <Icon name="inbox" size={17} />,
      onClick: () => void restore(item),
      inline: true,
      menuCore: true,
    },
    {
      key: "edit",
      className: "note-card__edit",
      label: "수정",
      icon: <Icon name="edit" size={17} />,
      onClick: () => p.onStartEditing(item),
      inline: true,
      menuCore: true,
    },
    {
      key: "delete",
      className: "note-card__delete",
      label: "삭제",
      icon: <Icon name="delete" size={17} />,
      onClick: () => p.onDeleteRequest(item),
    },
  ];

  return (
    <section className="archive-view" aria-labelledby="archive-title">
      <header className="view-header">
        <div>
          <p className="eyebrow">Library</p>
          <div className="view-title-row">
            <h1 id="archive-title">Archive</h1>
            {p.archiveCount !== null && <span className="count-pill">{p.archiveCount}</span>}
          </div>
          <p className="view-description">완료했거나 잠시 보관할 메모를 모아둡니다.</p>
        </div>
      </header>

      {(p.deleteError || actionError) && (
        <p className="inline-error delete-error" role="alert">
          {actionError ?? "항목을 삭제하지 못했습니다. 잠시 후 다시 시도해 주세요."}
        </p>
      )}

      <div className="list-heading">
        <div>
          <h2>Archive</h2>
          <span>{p.archiveCount === null ? "Archive" : p.archiveCount + "개의 메모"}</span>
        </div>
        <span
          className={"sync-status" + (p.isFetching && !p.isPending ? "" : " is-idle")}
          role={p.isFetching && !p.isPending ? "status" : undefined}
          aria-hidden={!(p.isFetching && !p.isPending)}
        >
          <span className="sync-dot" aria-hidden="true" />
          <span className="sync-label">동기화 중</span>
        </span>
      </div>

      <div className="note-list" aria-live="polite">
        {p.isPending && (
          <div className="loading-list" role="status" aria-label="Archive를 불러오는 중입니다.">
            {[0, 1, 2].map((index) => (
              <div className="note-skeleton" key={index}>
                <span className="skeleton-icon" />
                <div>
                  <span className="skeleton-line skeleton-line--wide" />
                  <span className="skeleton-line skeleton-line--short" />
                </div>
              </div>
            ))}
          </div>
        )}

        {p.isError && (
          <div className="state-panel state-panel--error" role="alert">
            <span className="state-panel__icon"><Icon name="refresh" size={22} /></span>
            <div>
              <h3>Archive를 불러오지 못했습니다.</h3>
              <p>연결 상태를 확인한 뒤 다시 시도해 주세요.</p>
            </div>
            <button type="button" onClick={p.onRetry}>다시 시도</button>
          </div>
        )}

        {p.isSuccess && p.items.length === 0 && (
          <div className="state-panel state-panel--empty">
            <span className="state-panel__icon"><Icon name="archive" size={24} /></span>
            <div>
              <h3>Archive가 비어 있습니다.</h3>
              <p>보관한 항목이 여기에 표시됩니다.</p>
            </div>
          </div>
        )}

        {p.isSuccess && p.items.map((item) => (
          <article className={"note-card" + (p.editingItemId === item.id ? " note-card--editing" : "")} key={item.id}>
            <span className="note-card__marker" aria-hidden="true"><Icon name="archive" size={18} /></span>
            <div className="note-card__content">
              {p.editingItemId === item.id ? (
                <div className="note-card__editor">
                  <textarea
                    className="note-card__textarea"
                    value={p.editDraft}
                    onChange={(event) => p.onEditDraftChange(event.target.value)}
                    rows={4}
                    autoFocus
                    aria-label="보관된 메모 수정"
                  />
                  <div className="note-card__due-editor">
                    <label htmlFor={"archive-due-" + item.id}>기한</label>
                    <input
                      id={"archive-due-" + item.id}
                      type="datetime-local"
                      value={p.editDueAt}
                      onChange={(event) => p.onEditDueChange(event.target.value)}
                    />
                    <div className="note-card__due-quick-actions">
                      <button type="button" onClick={() => p.onEditDueChange(getDateTimeInputValue(0))}>오늘</button>
                      <button type="button" onClick={() => p.onEditDueChange(getDateTimeInputValue(1))}>내일</button>
                      <button type="button" onClick={() => p.onEditDueChange("")}>기한 없음</button>
                    </div>
                  </div>
                  <p className="note-card__created-info">작성 {formatCreatedAt(item.created_at)}</p>
                  {p.editError && <p className="note-card__edit-error" role="alert">{p.editError}</p>}
                  <div className="note-card__editor-actions">
                    <button className="note-card__cancel" type="button" onClick={p.onCancelEditing} disabled={p.isUpdating}>취소</button>
                    <button className="note-card__save" type="button" onClick={p.onSaveEditing} disabled={!p.editDraft.trim() || p.isUpdating}>
                      {p.isUpdating ? "저장 중..." : "저장"}
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <p className="note-card__body">{item.body}</p>
                  <div className="note-card__meta">
                    <span className="kind-badge">{getItemKindLabel(item)}</span>
                    {item.due_at !== null && (
                      <>
                        <span className="meta-separator" aria-hidden="true" />
                        <time dateTime={item.due_at}>기한 {formatCreatedAt(item.due_at)}</time>
                      </>
                    )}
                  </div>
                </>
              )}
            </div>
            {p.editingItemId !== item.id && (
              <CardActions
                isOpen={openActionMenuId === item.id}
                onOpenChange={(open) => setOpenActionMenuId(open ? item.id : null)}
                actions={getActions(item)}
              />
            )}
          </article>
        ))}
      </div>
    </section>
  );
}
