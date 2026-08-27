import type { Item } from "../api/items";
import { Icon } from "../components/Icon";
import { formatCreatedAt } from "../utils/date";

type NotesViewProps = {
  items: Item[];
  notesCount: number | null;
  isPending: boolean;
  isError: boolean;
  isSuccess: boolean;
  isFetching: boolean;
  editingItemId: string | null;
  editDraft: string;
  editError: string | null;
  isUpdating: boolean;
  isDeleting: boolean;
  isMovingToInbox: boolean;
  isArchiving: boolean;
  deleteError: boolean;
  onRetry: () => void;
  onStartEditing: (item: Item) => void;
  onEditDraftChange: (value: string) => void;
  onCancelEditing: () => void;
  onSaveEditing: () => void;
  onMoveToInbox: (item: Item) => void;
  onArchive: (item: Item) => void;
  onDeleteRequest: (item: Item) => void;
};

export function NotesView({
  items,
  notesCount,
  isPending,
  isError,
  isSuccess,
  isFetching,
  editingItemId,
  editDraft,
  editError,
  isUpdating,
  isDeleting,
  isMovingToInbox,
  isArchiving,
  deleteError,
  onRetry,
  onStartEditing,
  onEditDraftChange,
  onCancelEditing,
  onSaveEditing,
  onMoveToInbox,
  onArchive,
  onDeleteRequest,
}: NotesViewProps) {
  return (
    <section className="notes-view" aria-labelledby="notes-title">
      <header className="view-header">
        <div>
          <p className="eyebrow">Workspace</p>
          <div className="view-title-row">
            <h1 id="notes-title">Notes</h1>
            {notesCount !== null && (
              <span className="count-pill">{notesCount}</span>
            )}
          </div>
          <p className="view-description">
            Keep your organized notes in one place.
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
          <h2>Notes</h2>
          <span>{notesCount === null ? "Notes" : `${notesCount}개의 메모`}</span>
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
          <div className="loading-list" aria-label="Loading notes">
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
              <h3>Notes를 불러오지 못했습니다.</h3>
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
              <Icon name="notes" size={24} />
            </span>
            <div>
              <h3>Notes가 비어 있습니다.</h3>
              <p>Inbox의 메모를 Notes로 분류해 보세요.</p>
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
                <Icon name="notes" size={18} />
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
                      <time dateTime={item.created_at}>
                        {formatCreatedAt(item.created_at)}
                      </time>
                    </div>
                  </>
                )}
              </div>

              {editingItemId !== item.id && (
                <>
                  <button
                    className="note-card__edit"
                    type="button"
                    aria-label="메모 수정"
                    onClick={() => onStartEditing(item)}
                  >
                    <Icon name="edit" size={16} />
                  </button>
                  <button
                    className="note-card__classify"
                    type="button"
                    aria-label="Inbox로 이동"
                    disabled={isMovingToInbox}
                    onClick={() => onMoveToInbox(item)}
                  >
                    <Icon name="inbox" size={16} />
                  </button>
                  <button
                    className="note-card__archive"
                    type="button"
                    aria-label="Archive로 이동"
                    disabled={isArchiving}
                    onClick={() => onArchive(item)}
                  >
                    <Icon name="archive" size={16} />
                  </button>
                </>
              )}

              <button
                className="note-card__delete"
                type="button"
                aria-label="메모 삭제"
                disabled={isDeleting}
                onClick={() => onDeleteRequest(item)}
              >
                <Icon name="delete" size={16} />
              </button>
            </article>
          ))}
      </div>
    </section>
  );
}
