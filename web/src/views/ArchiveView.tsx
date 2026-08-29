import { useState, type PointerEvent as ReactPointerEvent } from "react";
import type { Item } from "../api/items";
import { CardActionButton } from "../components/CardActionButton";
import { Icon } from "../components/Icon";
import {
  formatCreatedAt,
  getDateTimeInputValue,
} from "../utils/date";

type ArchiveViewProps = {
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

export function ArchiveView({
  items,
  archiveCount,
  isPending,
  isError,
  isSuccess,
  isFetching,
  editingItemId,
  editDraft,
  editDueAt,
  editError,
  isUpdating,
  deleteError,
  onRetry,
  onStartEditing,
  onEditDraftChange,
  onEditDueChange,
  onCancelEditing,
  onSaveEditing,
  onRestore,
  onDeleteRequest,
}: ArchiveViewProps) {
  const [openActionMenuId, setOpenActionMenuId] = useState<string | null>(null);

  const isCoarsePointer = (event: ReactPointerEvent<HTMLElement>) => event.pointerType === "touch" || event.pointerType === "pen" || window.matchMedia("(hover: none), (pointer: coarse)").matches;

  const handleActionPointerDown = (event: ReactPointerEvent<HTMLElement>, itemId: string) => {
    if (!isCoarsePointer(event) || openActionMenuId === itemId) return;
    event.preventDefault();
    event.stopPropagation();
    setOpenActionMenuId(itemId);
  };

  const handleViewPointerDown = (event: ReactPointerEvent<HTMLElement>) => {
    if (isCoarsePointer(event) && (!(event.target instanceof Element) || !event.target.closest(".note-card__actions"))) setOpenActionMenuId(null);
  };

  return (
    <section onPointerDown={handleViewPointerDown} className="archive-view" aria-labelledby="archive-title">
      <header className="view-header">
        <div>
          <p className="eyebrow">Library</p>
          <div className="view-title-row">
            <h1 id="archive-title">Archive</h1>
            {archiveCount !== null && (
              <span className="count-pill">{archiveCount}</span>
            )}
          </div>
          <p className="view-description">
            Keep completed or inactive notes out of your active workspace.
          </p>
        </div>
      </header>

      {deleteError && (
        <p className="inline-error delete-error" role="alert">
          메모를 삭제하지 못했습니다. 잠시 후 다시 시도해 주세요.
        </p>
      )}

      <div className="list-heading">
        <div>
          <h2>Archived notes</h2>
          <span>
            {archiveCount === null ? "Archive" : `${archiveCount}개의 메모`}
          </span>
        </div>
        {isFetching && !isPending && (
          <span className="sync-status" role="status">
            <span className="sync-dot" aria-hidden="true" />
            Syncing
          </span>
        )}
      </div>

      <div className="note-list" aria-live="polite">
        {isPending && (
          <div className="loading-list" aria-label="Loading archived notes">
            {[0, 1, 2].map((item) => (
              <div className="note-skeleton" key={item}>
                <span className="skeleton-icon" />
                <div>
                  <span className="skeleton-line skeleton-line--wide" />
                  <span className="skeleton-line skeleton-line--short" />
                </div>
              </div>
            ))}
          </div>
        )}

        {isError && (
          <div className="state-panel state-panel--error" role="alert">
            <span className="state-panel__icon">
              <Icon name="refresh" size={22} />
            </span>
            <div>
              <h3>Archive를 불러오지 못했습니다.</h3>
              <p>Worker 연결 상태를 확인한 뒤 다시 시도해 주세요.</p>
            </div>
            <button type="button" onClick={onRetry}>
              다시 시도
            </button>
          </div>
        )}

        {isSuccess && items.length === 0 && (
          <div className="state-panel state-panel--empty">
            <span className="state-panel__icon">
              <Icon name="archive" size={24} />
            </span>
            <div>
              <h3>Archive가 비어 있습니다.</h3>
              <p>보관한 메모가 이곳에 표시됩니다.</p>
            </div>
          </div>
        )}

        {isSuccess &&
          items.map((item) => (
            <article
              className={`note-card${
                editingItemId === item.id ? " note-card--editing" : ""
              }`}
              key={item.id}
            >
              <span className="note-card__marker" aria-hidden="true">
                <Icon name="archive" size={18} />
              </span>
              <div className="note-card__content">
                {editingItemId === item.id ? (
                  <div className="note-card__editor">
                    <textarea
                      className="note-card__textarea"
                      value={editDraft}
                      onChange={(event) => onEditDraftChange(event.target.value)}
                      aria-label="메모 수정"
                      rows={4}
                      autoFocus
                    />
                    <div className="note-card__due-editor">
                      <label htmlFor={`archive-due-${item.id}`}>마감</label>
                      <input
                        id={`archive-due-${item.id}`}
                        className="note-card__due-input"
                        type="datetime-local"
                        value={editDueAt}
                        onChange={(event) => onEditDueChange(event.target.value)}
                      />
                      <div className="note-card__due-quick-actions">
                        <button type="button" onClick={() => onEditDueChange(getDateTimeInputValue(0))}>오늘</button>
                        <button type="button" onClick={() => onEditDueChange(getDateTimeInputValue(1))}>내일</button>
                        <button type="button" onClick={() => onEditDueChange("")}>마감 없음</button>
                      </div>
                    </div>
                    {editError && (
                      <p className="note-card__edit-error" role="alert">
                        {editError}
                      </p>
                    )}
                    <div className="note-card__editor-actions">
                      <button
                        className="note-card__cancel"
                        type="button"
                        onClick={onCancelEditing}
                        disabled={isUpdating}
                      >
                        취소
                      </button>
                      <button
                        className="note-card__save"
                        type="button"
                        onClick={onSaveEditing}
                        disabled={!editDraft.trim() || isUpdating}
                      >
                        {isUpdating ? "저장 중..." : "저장"}
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <p className="note-card__body">{item.body}</p>
                    <div className="note-card__meta">
                      <span className="kind-badge">{item.kind}</span>
                      <span className="meta-separator" aria-hidden="true" />
                      <time dateTime={item.updated_at}>
                        {formatCreatedAt(item.updated_at)}
                      </time>
                    </div>
                  </>
                )}
              </div>
              <div className={`note-card__actions${openActionMenuId === item.id ? " is-open" : ""}`}
                onPointerDown={(event) => handleActionPointerDown(event, item.id)}>
                <button
                  className="note-card__menu-toggle"
                  type="button"
                  aria-label="메모 작업 메뉴"
                  aria-expanded={openActionMenuId === item.id}
                  onClick={() => setOpenActionMenuId((current) => current === item.id ? null : item.id)}
                >
                  <Icon name="menu" size={18} />
                </button>
                <div className="note-card__action-menu" onClickCapture={() => setOpenActionMenuId(null)}>
              {editingItemId !== item.id && (
                <>
                  <CardActionButton
                    className="note-card__edit"
                    aria-label="메모 수정"
                    onClick={() => onStartEditing(item)}
                  >
                    <Icon name="edit" size={16} />
                  </CardActionButton>
                  <CardActionButton
                    className="note-card__inbox"
                    aria-label="활성 메모로 복원"
                    onClick={() => onRestore(item)}
                  >
                    <Icon name="inbox" size={16} />
                  </CardActionButton>
                </>
              )}
              <CardActionButton
                className="note-card__delete"
                aria-label="메모 삭제"
                onClick={() => onDeleteRequest(item)}
              >
                <Icon name="delete" size={16} />
              </CardActionButton>
                </div>
              </div>
            </article>
          ))}
      </div>
    </section>
  );
}
