import type { Item } from "../api/items";
import { Icon } from "../components/Icon";
import { formatCreatedAt } from "../utils/date";

type TrashViewProps = {
  items: Item[];
  isPending: boolean;
  isError: boolean;
  isSuccess: boolean;
  restoreError: string | null;
  isRestoring: boolean;
  onRetry: () => void;
  onRestore: (id: string) => void;
};
export function TrashView({
  items,
  isPending,
  isError,
  isSuccess,
  restoreError,
  isRestoring,
  onRetry,
  onRestore,
}: TrashViewProps) {
  return (
    <section className="trash-view" aria-labelledby="trash-title">
      <header className="view-header">
        <div>
          <p className="eyebrow">Library</p>
          <div className="view-title-row">
            <h1 id="trash-title">Trash</h1>
            {isSuccess && (
              <span className="count-pill">{items.length}</span>
            )}
          </div>
          <p className="view-description">
            삭제한 메모를 확인하고 복원할 수 있습니다.
          </p>
        </div>
      </header>

      {restoreError && (
        <p className="inline-error delete-error" role="alert">
          {restoreError}
        </p>
      )}

      <div className="note-list" aria-live="polite">
        {isPending && (
          <div className="loading-list" aria-label="휴지통을 불러오는 중">
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
              <h3>휴지통을 불러오지 못했습니다.</h3>
              <p>잠시 후 다시 시도해 주세요.</p>
            </div>
            <button type="button" onClick={onRetry}>
              다시 시도
            </button>
          </div>
        )}

        {isSuccess && items.length === 0 && (
          <div className="state-panel state-panel--empty">
            <span className="state-panel__icon">
              <Icon name="trash" size={24} />
            </span>
            <div>
              <h3>휴지통이 비어 있습니다.</h3>
              <p>삭제한 메모가 이곳에 표시됩니다.</p>
            </div>
          </div>
        )}

        {isSuccess &&
          items.map((item) => (
            <article className="note-card trash-card" key={item.id}>
              <span className="note-card__marker" aria-hidden="true">
                <Icon name="trash" size={18} />
              </span>
              <div className="note-card__content">
                <p className="note-card__body">{item.body}</p>
                <div className="note-card__meta">
                  <span className="kind-badge">{item.kind}</span>
                  <span className="meta-separator" aria-hidden="true" />
                  <time dateTime={item.deleted_at ?? item.updated_at}>
                    {formatCreatedAt(item.deleted_at ?? item.updated_at)}
                  </time>
                </div>
              </div>
              <button
                className="trash-card__restore"
                type="button"
                onClick={() => onRestore(item.id)}
                disabled={isRestoring}
              >
                {isRestoring ? "복원 중..." : "복원"}
              </button>
            </article>
          ))}
      </div>
    </section>  );
}
