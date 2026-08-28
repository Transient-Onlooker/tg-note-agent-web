import { Fragment, useState } from "react";
import type { Item } from "../api/items";
import { CardActionButton } from "../components/CardActionButton";
import { Icon } from "../components/Icon";
import { formatCreatedAt } from "../utils/date";

type NotesViewProps = {
  viewTitle?: string;
  viewDescription?: string;
  emptyDescription?: string;
  items: Item[];
  overdueItems?: Item[];
  notesCount: number | null;
  isPending: boolean;
  isError: boolean;
  isSuccess: boolean;
  isFetching: boolean;
  editingItemId: string | null;
  editDraft: string;
  editError: string | null;
  isUpdating: boolean;
  deleteError: boolean;
  onRetry: () => void;
  onStartEditing: (item: Item) => void;
  onEditDraftChange: (value: string) => void;
  onCancelEditing: () => void;
  onSaveEditing: () => void;
  onMoveToNotes?: (item: Item) => Promise<unknown>;
  onMoveToInbox?: (item: Item) => Promise<unknown>;
  onArchive: (item: Item) => Promise<unknown>;
  onPurchase?: (item: Item) => Promise<unknown>;
  onDeleteRequest: (item: Item) => void;
  onSendToPrintQueue?: (item: Item) => Promise<unknown>;
  onSetToday?: (item: Item) => Promise<unknown>;
  onClearDue?: (item: Item) => Promise<unknown>;
};

export function NotesView({
  viewTitle = "Notes",
  viewDescription = "Keep your organized notes in one place.",
  emptyDescription = "Inbox의 메모를 Notes로 분류해 보세요.",
  items,
  overdueItems,
  notesCount,
  isPending,
  isError,
  isSuccess,
  isFetching,
  editingItemId,
  editDraft,
  editError,
  isUpdating,
  deleteError,
  onRetry,
  onStartEditing,
  onEditDraftChange,
  onCancelEditing,
  onSaveEditing,
  onMoveToNotes,
  onMoveToInbox,
  onArchive,
  onPurchase,
  onDeleteRequest,
  onSendToPrintQueue,
  onSetToday,
  onClearDue,
}: NotesViewProps) {
  const [openActionMenuId, setOpenActionMenuId] = useState<string | null>(null);
  const overdueItemIds = new Set(overdueItems?.map((item) => item.id));
  const displayItems = overdueItems ? [...overdueItems, ...items] : items;
  const overdueCount = overdueItems?.length ?? 0;

  return (
    <section className="notes-view" aria-labelledby="notes-title">
      <header className="view-header">
        <div>
          <p className="eyebrow">Workspace</p>
          <div className="view-title-row">
            <h1 id="notes-title">{viewTitle}</h1>
            {notesCount !== null && (
              <span className="count-pill">{notesCount}</span>
            )}
          </div>
          <p className="view-description">
            {viewDescription}
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
          <h2>{viewTitle}</h2>
          <span>{notesCount === null ? viewTitle : `${notesCount}개의 메모`}</span>
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

        {isSuccess && displayItems.length === 0 && (
          <div className="state-panel state-panel--empty">
            <span className="state-panel__icon">
              <Icon name="notes" size={24} />
            </span>
            <div>
              <h3>Notes가 비어 있습니다.</h3>
              <p>{emptyDescription}</p>
            </div>
          </div>
        )}

        {isSuccess &&
          displayItems.map((item, index) => (
            <Fragment key={item.id}>
            {overdueCount > 0 && index === 0 && (
              <div className="today-section-heading">
                <h3>기한 지남</h3>
                <span>{overdueCount}개</span>
              </div>
            )}
            {overdueCount > 0 && index === overdueCount && (
              <div className="today-section-heading">
                <h3>오늘</h3>
                <span>{items.length}개</span>
              </div>
            )}
            <article
              className={`note-card${
                editingItemId === item.id ? " note-card--editing" : ""
              }`}
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
                <>
                  <CardActionButton
                    className="note-card__edit"
                    aria-label="메모 수정"
                    onClick={() => onStartEditing(item)}
                  >
                    <Icon name="edit" size={16} />
                  </CardActionButton>
                  {onMoveToNotes && (
                    <CardActionButton
                      className="note-card__classify"
                      aria-label="Notes로 이동"
                      onClick={() => onMoveToNotes(item)}
                    >
                      <Icon name="notes" size={16} />
                    </CardActionButton>
                  )}
                  {onMoveToInbox && (
                    <CardActionButton
                      className="note-card__classify"
                      aria-label="Inbox로 이동"
                      onClick={() => onMoveToInbox(item)}
                    >
                      <Icon name="inbox" size={16} />
                    </CardActionButton>
                  )}
                  {onPurchase && (
                    <CardActionButton
                      className="note-card__purchase"
                      aria-label="Purchase로 이동"
                      onClick={() => onPurchase(item)}
                    >
                      <Icon name="purchase" size={16} />
                    </CardActionButton>
                  )}
                  {onSendToPrintQueue && (
                    <CardActionButton
                      className="note-card__print-queue"
                      aria-label="Print Queue로 이동"
                      onClick={() => onSendToPrintQueue(item)}
                    >
                      <Icon name="print-queue" size={16} />
                    </CardActionButton>
                  )}
                  {onSetToday && (!overdueItems || overdueItemIds.has(item.id)) && (
                    <CardActionButton
                      className="note-card__today note-card__today-defer"
                      aria-label="오늘로 지정"
                      onClick={() => onSetToday(item)}
                    >
                      <Icon name="today" size={16} />
                    </CardActionButton>
                  )}
                  {onClearDue && (
                    <CardActionButton
                    className="note-card__today note-card__today-clear"
                      aria-label="기한 제거"
                      onClick={() => onClearDue(item)}
                    >
                      <Icon name="close" size={16} />
                    </CardActionButton>
                  )}
                  <CardActionButton
                    className="note-card__archive"
                    aria-label="Archive로 이동"
                    onClick={() => onArchive(item)}
                  >
                    <Icon name="archive" size={16} />
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
            </Fragment>
          ))}
      </div>
    </section>
  );
}
