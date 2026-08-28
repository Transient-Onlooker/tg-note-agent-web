import { useState, type FormEvent } from "react";
import type { Item } from "../api/items";
import { CardActionButton } from "../components/CardActionButton";
import { Icon } from "../components/Icon";
import {
  formatCreatedAt,
  getDateTimeInputValue,
} from "../utils/date";

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

  editingItemId: string | null;
  editDraft: string;
  editDueAt: string;
  editError: string | null;
  isUpdating: boolean;

  onDraftChange: (value: string) => void;
  onCreate: () => void;
  onRetry: () => void;

  onStartEditing: (item: Item) => void;
  onEditDraftChange: (value: string) => void;
  onEditDueChange: (value: string) => void;
  onCancelEditing: () => void;
  onSaveEditing: () => void;
  onClassify: (item: Item) => Promise<unknown>;
  onArchive: (item: Item) => Promise<unknown>;
  onPurchase: (item: Item) => Promise<unknown>;
  onSendToPrintQueue: (item: Item) => Promise<unknown>;
  onSetToday: (item: Item) => Promise<unknown>;

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
  editingItemId,
  editDraft,
  editDueAt,
  editError,
  isUpdating,
  onDraftChange,
  onCreate,
  onRetry,
  onStartEditing,
  onEditDraftChange,
  onEditDueChange,
  onCancelEditing,
  onSaveEditing,
  onClassify,
  onArchive,
  onPurchase,
  onSendToPrintQueue,
  onSetToday,
  onDeleteRequest,
}: InboxViewProps) {
  const [openActionMenuId, setOpenActionMenuId] = useState<string | null>(null);

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

                    <div className="note-card__due-editor">
                      <label htmlFor={`inbox-due-${item.id}`}>마감</label>
                      <input
                        id={`inbox-due-${item.id}`}
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

              <div className={`note-card__actions${openActionMenuId === item.id ? " is-open" : ""}`}>
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
                <CardActionButton
                  className="note-card__edit"
                  aria-label="메모 수정"
                  onClick={() => onStartEditing(item)}
                >
                  <Icon name="edit" size={16} />
                </CardActionButton>
              )}

              {editingItemId !== item.id && (
                <CardActionButton
                  className="note-card__classify"
                  aria-label="Notes로 이동"
                  onClick={() => onClassify(item)}
                >
                  <Icon name="notes" size={16} />
                </CardActionButton>
              )}

              {editingItemId !== item.id && (
                <CardActionButton
                  className="note-card__archive"
                  aria-label="Archive로 이동"
                  onClick={() => onArchive(item)}
                >
                  <Icon name="archive" size={16} />
                </CardActionButton>
              )}

              {editingItemId !== item.id && (
                <CardActionButton
                  className="note-card__purchase"
                  aria-label="Purchase로 이동"
                  onClick={() => onPurchase(item)}
                >
                  <Icon name="purchase" size={16} />
                </CardActionButton>
              )}

              {editingItemId !== item.id && (
                <CardActionButton
                  className="note-card__print-queue"
                  aria-label="Print Queue로 이동"
                  onClick={() => onSendToPrintQueue(item)}
                >
                  <Icon name="print-queue" size={16} />
                </CardActionButton>
              )}

              {editingItemId !== item.id && (
                <CardActionButton
                  className="note-card__today"
                  aria-label="오늘로 지정"
                  onClick={() => onSetToday(item)}
                >
                  <Icon name="today" size={16} />
                </CardActionButton>
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
