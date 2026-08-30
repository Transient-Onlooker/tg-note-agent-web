import { useState } from "react";
import type { Item } from "../api/items";
import { Icon } from "../components/Icon";
import { formatCreatedAt } from "../utils/date";
import { getItemKindLabel } from "../utils/item";

type Props = {
  items: Item[];
  isPending: boolean;
  isError: boolean;
  isSuccess: boolean;
  restoreError: string | null;
  emptyError: string | null;
  onRetry: () => void;
  onRestore: (id: string) => Promise<unknown>;
  onRequestEmptyTrash: () => void;
};

export function TrashView(p: Props) {
  const [restoringItemId, setRestoringItemId] = useState<string | null>(null);
  const restore = async (id: string) => {
    setRestoringItemId(id);
    try { await p.onRestore(id); } finally { setRestoringItemId(null); }
  };

  return <section className="trash-view" aria-labelledby="trash-title">
    <header className="view-header trash-view__header">
      <div><p className="eyebrow">Library</p><div className="view-title-row"><h1 id="trash-title">Trash</h1>{p.isSuccess && <span className="count-pill">{p.items.length}</span>}</div><p className="view-description">삭제한 메모를 확인하고 복원할 수 있습니다.</p></div>
      {p.isSuccess && p.items.length > 0 && <button className="trash-empty" type="button" onClick={p.onRequestEmptyTrash}>휴지통 비우기</button>}
    </header>
    {(p.restoreError || p.emptyError) && <p className="inline-error delete-error" role="alert">{p.restoreError ?? p.emptyError}</p>}
    <div className="note-list" aria-live="polite">
      {p.isPending && <div className="loading-list" role="status" aria-label="휴지통을 불러오는 중입니다.">{[0, 1, 2].map((index) => <div className="note-skeleton" key={index}><span className="skeleton-icon" /><div><span className="skeleton-line skeleton-line--wide" /><span className="skeleton-line skeleton-line--short" /></div></div>)}</div>}
      {p.isError && <div className="state-panel state-panel--error" role="alert"><button type="button" onClick={p.onRetry}>다시 시도</button></div>}
      {p.isSuccess && p.items.length === 0 && <div className="state-panel state-panel--empty"><div><h3>휴지통이 비어 있습니다.</h3></div></div>}
      {p.isSuccess && p.items.map((item) => <article className="note-card trash-card" key={item.id}><span className="note-card__marker" aria-hidden="true"><Icon name="trash" size={18} /></span><div className="note-card__content"><p className="note-card__body">{item.body}</p><div className="note-card__meta"><span className="kind-badge">{getItemKindLabel(item)}</span><span className="meta-separator" /><time>{formatCreatedAt(item.deleted_at ?? item.updated_at)}</time></div></div><button className="trash-card__restore" type="button" onClick={() => void restore(item.id)} disabled={restoringItemId === item.id}>{restoringItemId === item.id ? "복원 중..." : "복원"}</button></article>)}
    </div>
  </section>;
}
