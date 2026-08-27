import type { FormEvent } from "react";
import type { Item } from "../api/items";
import { Icon } from "../components/Icon";
import { formatCreatedAt } from "../utils/date";

type InboxViewProps = {
  items: Item[];
  inboxCount: number | null;

  isPending: boolean;
  isError: boolean;
  isSuccess: boolean;
  isFetching: boolean;

  draft: string;
  isCreating: boolean;
  createError: boolean;

  deleteError: boolean;
  isDeleting: boolean;

  editingItemId: string | null;
  editDraft: string;
  editError: string | null;
  isUpdating: boolean;
  isClassifying: boolean;
  isArchiving: boolean;
  isPurchasing: boolean;
  isSendingToPrintQueue: boolean;
  isSettingToday: boolean;

  onDraftChange: (value: string) => void;
  onCreate: () => void;
  onRetry: () => void;

  onStartEditing: (item: Item) => void;
  onEditDraftChange: (value: string) => void;
  onCancelEditing: () => void;
  onSaveEditing: () => void;
  onClassify: (item: Item) => void;
  onArchive: (item: Item) => void;
  onPurchase: (item: Item) => void;
  onSendToPrintQueue: (item: Item) => void;
  onSetToday: (item: Item) => void;

  onDeleteRequest: (item: Item) => void;
};

export function InboxView({
  items,
  inboxCount,
  isPending,
  isError,
  isSuccess,
  isFetching,
  draft,
  isCreating,
  createError,
  deleteError,
  isDeleting,
  editingItemId,
  editDraft,
  editError,
  isUpdating,
  isClassifying,
  isArchiving,
  isPurchasing,
  isSendingToPrintQueue,
  isSettingToday,
  onDraftChange,
  onCreate,
  onRetry,
  onStartEditing,
  onEditDraftChange,
  onCancelEditing,
  onSaveEditing,
  onClassify,
  onArchive,
  onPurchase,
  onSendToPrintQueue,
  onSetToday,
  onDeleteRequest,
}: InboxViewProps) {
  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onCreate();
  };

  return (
    <section className="inbox-view" aria-labelledby="inbox-title">
      <header className="view-header">
        <div>
          <p className="eyebrow">Workspace</p>
          <div className="view-title-row">
            <h1 id="inbox-title">Inbox</h1>
            {inboxCount !== null && (
              <span className="count-pill">{inboxCount}</span>
            )}
          </div>
          <p className="view-description">
            떠오른 생각을 붙잡고, 나중에 천천히 정리하세요.
          </p>
        </div>
      </header>

      <form className="capture-card" onSubmit={handleSubmit}>
        <div className="capture-card__heading">
          <span className="capture-icon" aria-hidden="true">
            <Icon name="relay" size={19} />
          </span>
          <div>
            <strong>Quick capture</strong>
            <span>Inbox에 바로 추가</span>
          </div>
        </div>

        <textarea
          className="capture-input"
          value={draft}
          onChange={(event) => onDraftChange(event.target.value)}
          placeholder="메모를 입력하세요..."
          aria-label="새 메모"
          rows={3}
        />

        <div className="capture-card__footer">
          <button
            className="capture-submit"
            type="submit"
            disabled={!draft.trim() || isCreating}
          >
            {isCreating ? (
              <>
                <span className="button-spinner" aria-hidden="true" />
                저장 중...
              </>
            ) : (
              <>
                저장
                <Icon name="send" size={16} />
              </>
            )}
          </button>
        </div>

        {createError && (
          <p className="inline-error" role="alert">
            저장하지 못했습니다. 잠시 후 다시 시도해 주세요.
          </p>
        )}
      </form>

      {deleteError && (
        <p className="inline-error delete-error" role="alert">
          메모를 삭제하지 못했습니다. 잠시 후 다시 시도해 주세요.
        </p>
      )}

      <div className="list-heading">
        <div>
          <h2>Recent notes</h2>
          <span>
            {inboxCount === null ? "Inbox" : `${inboxCount}개의 메모`}
          </span>
        </div>

        {isFetching && !isPending && (
          <span className="sync-status" role="status">
            <span className="sync-dot" aria-hidden="true" />
            동기화 중
          </span>
        )}
      </div>

      <div className="note-list" aria-live="polite">
        {isPending && (
          <div className="loading-list" aria-label="메모를 불러오는 중">
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
              <h3>메모를 불러오지 못했습니다.</h3>
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
              <Icon name="inbox" size={24} />
            </span>
            <div>
              <h3>Inbox가 비어 있습니다.</h3>
              <p>위 입력창에서 첫 메모를 남겨 보세요.</p>
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
                      onChange={(event) =>
                        onEditDraftChange(event.target.value)
                      }
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
                      <span
                        className="meta-separator"
                        aria-hidden="true"
                      />
                      <time dateTime={item.created_at}>
                        {formatCreatedAt(item.created_at)}
                      </time>
                    </div>
                  </>
                )}
              </div>

              {editingItemId !== item.id && (
                <button
                  className="note-card__edit"
                  type="button"
                  aria-label="메모 수정"
                  onClick={() => onStartEditing(item)}
                >
                  <Icon name="edit" size={16} />
                </button>
              )}

              {editingItemId !== item.id && (
                <button
                  className="note-card__classify"
                  type="button"
                  aria-label="Notes로 이동"
                  disabled={isClassifying}
                  onClick={() => onClassify(item)}
                >
                  <Icon name="notes" size={16} />
                </button>
              )}

              {editingItemId !== item.id && (
                <button
                  className="note-card__archive"
                  type="button"
                  aria-label="Archive로 이동"
                  disabled={isArchiving}
                  onClick={() => onArchive(item)}
                >
                  <Icon name="archive" size={16} />
                </button>
              )}

              {editingItemId !== item.id && (
                <button
                  className="note-card__purchase"
                  type="button"
                  aria-label="Purchase로 이동"
                  disabled={isPurchasing}
                  onClick={() => onPurchase(item)}
                >
                  <Icon name="purchase" size={16} />
                </button>
              )}

              {editingItemId !== item.id && (
                <button
                  className="note-card__print-queue"
                  type="button"
                  aria-label="Print Queue로 이동"
                  disabled={isSendingToPrintQueue}
                  onClick={() => onSendToPrintQueue(item)}
                >
                  <Icon name="print-queue" size={16} />
                </button>
              )}

              {editingItemId !== item.id && (
                <button
                  className="note-card__today"
                  type="button"
                  aria-label="오늘로 지정"
                  disabled={isSettingToday}
                  onClick={() => onSetToday(item)}
                >
                  <Icon name="today" size={16} />
                </button>
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
