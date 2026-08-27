import {
  useEffect,
  useState,
  type FormEvent,
} from "react";
import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import {
  createItem,
  deleteItem,
  getItems,
  listTrash,
  restoreItem,
  updateItem,
  type Item,
} from "./api/items";
import {
  AUTH_EXPIRED_EVENT,
  AuthError,
  clearAccessKey,
  getAccessKey,
  setAccessKey,
  validateAccessKey,
} from "./api/auth";
import { useRealtimeSync } from "./realtime";
import { navigationGroups, type ViewId } from "./config/navigation";
import { Icon } from "./components/Icon";
import { LockedScreen } from "./components/LockedScreen";
import { PlaceholderView } from "./views/PlaceholderView";
import { TrashView } from "./views/TrashView";
import { formatCreatedAt } from "./utils/date";
import "./App.css";

type AuthStatus = "checking" | "locked" | "authenticated";


function App() {
  const [authStatus, setAuthStatus] = useState<AuthStatus>("checking");
  const [lockError, setLockError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    const verifyStoredKey = async () => {
      const key = getAccessKey();

      if (!key) {
        if (isMounted) {
          setAuthStatus("locked");
        }
        return;
      }

      try {
        await validateAccessKey(key);
        if (isMounted) {
          setAuthStatus("authenticated");
        }
      } catch (error) {
        if (!isMounted) {
          return;
        }

        if (error instanceof AuthError) {
          clearAccessKey();
          setLockError("Access key가 올바르지 않습니다.");
        } else {
          setLockError("서버에 연결할 수 없습니다.");
        }
        setAuthStatus("locked");
      }
    };

    const handleAuthExpired = () => {
      setAuthStatus("locked");
      setLockError("Access key가 올바르지 않습니다.");
    };

    window.addEventListener(AUTH_EXPIRED_EVENT, handleAuthExpired);
    void verifyStoredKey();

    return () => {
      isMounted = false;
      window.removeEventListener(AUTH_EXPIRED_EVENT, handleAuthExpired);
    };
  }, []);

  const unlock = async (key: string, remember: boolean) => {
    setLockError(null);

    try {
      await validateAccessKey(key);
      setAccessKey(key, remember);
      setAuthStatus("authenticated");
    } catch (error) {
      if (error instanceof AuthError) {
        clearAccessKey();
        setLockError("Access key가 올바르지 않습니다.");
      } else {
        setLockError("서버에 연결할 수 없습니다.");
      }
    }
  };

  const lock = () => {
    clearAccessKey();
    setLockError(null);
    setAuthStatus("locked");
  };

  if (authStatus !== "authenticated") {
    return (
      <LockedScreen
        isChecking={authStatus === "checking"}
        error={lockError}
        onUnlock={unlock}
      />
    );
  }

  return <AuthenticatedApp onLock={lock} />;
}

function AuthenticatedApp({ onLock }: { onLock: () => void }) {
  const [draft, setDraft] = useState("");
  const [activeView, setActiveView] = useState<ViewId>("inbox");
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState("");
  const [editError, setEditError] = useState<string | null>(null);
  const [restoreError, setRestoreError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Item | null>(null);
  const queryClient = useQueryClient();
  useRealtimeSync(queryClient);

  const itemsQuery = useQuery({
    queryKey: ["items"],
    queryFn: getItems,
  });

  const trashQuery = useQuery({
    queryKey: ["trash"],
    queryFn: listTrash,
    enabled: activeView === "trash",
  });

  const createItemMutation = useMutation({
    mutationFn: createItem,
    onSuccess: async () => {
      setDraft("");
      await queryClient.invalidateQueries({ queryKey: ["items"] });
    },
  });

  const deleteItemMutation = useMutation({
    mutationFn: deleteItem,
    onSuccess: async () => {
      setDeleteTarget(null);
      await queryClient.invalidateQueries({ queryKey: ["items"] });
    },
  });

  const updateItemMutation = useMutation({
    mutationFn: ({ id, body }: { id: string; body: string }) =>
      updateItem(id, body),
    onSuccess: (updatedItem: Item) => {
      queryClient.setQueryData<Item[]>(["items"], (items) =>
        items?.map((item) =>
          item.id === updatedItem.id ? updatedItem : item,
        ),
      );
      setEditingItemId(null);
      setEditDraft("");
      setEditError(null);
    },
    onError: () => {
      setEditError("수정하지 못했습니다.");
    },
  });

  const restoreItemMutation = useMutation({
    mutationFn: restoreItem,
    onSuccess: async (restoredItem: Item) => {
      queryClient.setQueryData<Item[]>(["trash"], (items) =>
        items?.filter((item) => item.id !== restoredItem.id),
      );
      setRestoreError(null);
      await queryClient.invalidateQueries({ queryKey: ["items"] });
    },
    onError: () => {
      setRestoreError("복원하지 못했습니다.");
    },
  });

  useEffect(() => {
    if (!isSidebarOpen) {
      return;
    }

    const handleEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsSidebarOpen(false);
      }
    };

    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [isSidebarOpen]);

  useEffect(() => {
    if (!deleteTarget) {
      return;
    }

    const handleDeleteEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape" && !deleteItemMutation.isPending) {
        setDeleteTarget(null);
      }
    };

    document.addEventListener("keydown", handleDeleteEscape);
    return () => document.removeEventListener("keydown", handleDeleteEscape);
  }, [deleteItemMutation.isPending, deleteTarget]);

  const inboxCount = itemsQuery.isSuccess ? itemsQuery.data.length : null;
  const activeNavigationItem =
    navigationGroups
      .flatMap((group) => group.items)
      .find((item) => item.id === activeView) ?? navigationGroups[0].items[0];

  const submitDraft = () => {
    const trimmed = draft.trim();

    if (!trimmed || createItemMutation.isPending) {
      return;
    }

    createItemMutation.mutate(trimmed);
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    submitDraft();
  };

  const handleNavigation = (view: ViewId) => {
    setActiveView(view);
    setIsSidebarOpen(false);
    setRestoreError(null);
  };

  const startEditing = (item: Item) => {
    updateItemMutation.reset();
    setEditingItemId(item.id);
    setEditDraft(item.body);
    setEditError(null);
  };

  const cancelEditing = () => {
    updateItemMutation.reset();
    setEditingItemId(null);
    setEditDraft("");
    setEditError(null);
  };

  const saveEditing = () => {
    const trimmedBody = editDraft.trim();

    if (!editingItemId || !trimmedBody || updateItemMutation.isPending) {
      return;
    }

    updateItemMutation.mutate({
      id: editingItemId,
      body: trimmedBody,
    });
  };

  const openDeleteConfirmation = (item: Item) => {
    deleteItemMutation.reset();
    setDeleteTarget(item);
  };

  const closeDeleteConfirmation = () => {
    if (!deleteItemMutation.isPending) {
      setDeleteTarget(null);
    }
  };

  const confirmDelete = () => {
    if (!deleteTarget || deleteItemMutation.isPending) {
      return;
    }

    deleteItemMutation.mutate(deleteTarget.id);
  };

  const renderInbox = () => (
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
          onChange={(event) => {
            setDraft(event.target.value);
            if (createItemMutation.isError) {
              createItemMutation.reset();
            }
          }}
          placeholder="메모를 입력하세요..."
          aria-label="새 메모"
          rows={3}
        />
        <div className="capture-card__footer">
          <button
            className="capture-submit"
            type="submit"
            disabled={!draft.trim() || createItemMutation.isPending}
          >
            {createItemMutation.isPending ? (
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
        {createItemMutation.isError && (
          <p className="inline-error" role="alert">
            저장하지 못했습니다. 잠시 후 다시 시도해 주세요.
          </p>
        )}
      </form>

      {deleteItemMutation.isError && (
        <p className="inline-error delete-error" role="alert">
          메모를 삭제하지 못했습니다. 잠시 후 다시 시도해 주세요.
        </p>
      )}

      <div className="list-heading">
        <div>
          <h2>Recent notes</h2>
          <span>{inboxCount === null ? "Inbox" : `${inboxCount}개의 메모`}</span>
        </div>
        {itemsQuery.isFetching && !itemsQuery.isPending && (
          <span className="sync-status" role="status">
            <span className="sync-dot" aria-hidden="true" />
            동기화 중
          </span>
        )}
      </div>

      <div className="note-list" aria-live="polite">
        {itemsQuery.isPending && (
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

        {itemsQuery.isError && (
          <div className="state-panel state-panel--error" role="alert">
            <span className="state-panel__icon">
              <Icon name="refresh" size={22} />
            </span>
            <div>
              <h3>메모를 불러오지 못했습니다.</h3>
              <p>Worker 연결 상태를 확인한 뒤 다시 시도해 주세요.</p>
            </div>
            <button type="button" onClick={() => itemsQuery.refetch()}>
              다시 시도
            </button>
          </div>
        )}

        {itemsQuery.isSuccess && itemsQuery.data.length === 0 && (
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

        {itemsQuery.isSuccess &&
          itemsQuery.data.map((item) => (
            <article
              className={`note-card${editingItemId === item.id ? " note-card--editing" : ""}`}
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
                      onChange={(event) => {
                        setEditDraft(event.target.value);
                        if (editError) {
                          setEditError(null);
                        }
                      }}
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
                        onClick={cancelEditing}
                        disabled={updateItemMutation.isPending}
                      >
                        취소
                      </button>
                      <button
                        className="note-card__save"
                        type="button"
                        onClick={saveEditing}
                        disabled={
                          !editDraft.trim() || updateItemMutation.isPending
                        }
                      >
                        {updateItemMutation.isPending ? "저장 중..." : "저장"}
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
                <button
                  className="note-card__edit"
                  type="button"
                  aria-label="메모 수정"
                  onClick={() => startEditing(item)}
                >
                  <Icon name="edit" size={16} />
                </button>
              )}
              <button
                className="note-card__delete"
                type="button"
                aria-label="메모 삭제"
                disabled={deleteItemMutation.isPending}
                onClick={() => openDeleteConfirmation(item)}
              >
                <Icon name="delete" size={16} />
              </button>
            </article>
          ))}
      </div>
    </section>
  );

  return (
    <>
      <div className="app-shell">
      <button
        type="button"
        className={`sidebar-overlay${isSidebarOpen ? " is-visible" : ""}`}
        onClick={() => setIsSidebarOpen(false)}
        aria-label="메뉴 닫기"
        tabIndex={isSidebarOpen ? 0 : -1}
      />

      <aside
        id="app-navigation"
        className={`sidebar${isSidebarOpen ? " is-open" : ""}`}
      >
        <div className="sidebar__top">
          <div className="brand">
            <span className="brand__mark" aria-hidden="true">
              <span className="material-symbols-outlined">orthopedics</span>
            </span>
            <div>
              <strong>NoteRelay</strong>
              <span>Personal notes</span>
            </div>
          </div>
          <button
            type="button"
            className="sidebar-close"
            onClick={() => setIsSidebarOpen(false)}
            aria-label="메뉴 닫기"
          >
            <Icon name="close" size={20} />
          </button>
        </div>

        <nav className="sidebar-nav" aria-label="주요 메뉴">
          {navigationGroups.map((group) => (
            <div className="nav-group" key={group.label}>
              <p className="nav-group__label">{group.label}</p>
              <div className="nav-group__items">
                {group.items.map((item) => (
                  <button
                    type="button"
                    className={`nav-item${activeView === item.id ? " is-active" : ""}`}
                    onClick={() => handleNavigation(item.id)}
                    aria-current={activeView === item.id ? "page" : undefined}
                    key={item.id}
                  >
                    <Icon name={item.id} size={18} />
                    <span>{item.label}</span>
                      {item.id === "inbox" && inboxCount !== null && (
                        <span className="nav-item__count">{inboxCount}</span>
                      )}
                      {item.id === "trash" && trashQuery.isSuccess && (
                        <span className="nav-item__count">
                          {trashQuery.data.length}
                        </span>
                      )}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </nav>

        <div className="sidebar__footer">
          <span className="workspace-avatar" aria-hidden="true">N</span>
          <div>
            <strong>Personal workspace</strong>
            <span>Capture, then organize</span>
          </div>
          <button type="button" className="lock-button" onClick={onLock}>
            <Icon name="lock" size={15} />
            <span>잠금</span>
          </button>
        </div>
      </aside>

      <div className="workspace">
        <header className="mobile-topbar">
          <button
            type="button"
            className="menu-button"
            onClick={() => setIsSidebarOpen(true)}
            aria-label="메뉴 열기"
            aria-expanded={isSidebarOpen}
            aria-controls="app-navigation"
          >
            <Icon name="menu" size={21} />
          </button>
          <div className="mobile-brand">
            <span className="mobile-brand__mark">
              <span className="material-symbols-outlined">orthopedics</span>
            </span>
            <strong>NoteRelay</strong>
          </div>
          {inboxCount !== null ? (
            <span className="mobile-count">{inboxCount}</span>
          ) : (
            <span className="mobile-count mobile-count--empty" />
          )}
        </header>

        <main className="workspace__content">
            {activeView === "inbox"
              ? renderInbox()
              : activeView === "trash"
                ? <TrashView
                    items={trashQuery.data ?? []}
                    isPending={trashQuery.isPending}
                    isError={trashQuery.isError}
                    isSuccess={trashQuery.isSuccess}
                    restoreError={restoreError}
                    isRestoring={restoreItemMutation.isPending}
                    onRetry={() => {
                      void trashQuery.refetch();
                    }}
                    onRestore={(id) => {
                      setRestoreError(null);
                      restoreItemMutation.mutate(id);
                    }}
                  />
                : <PlaceholderView
                    item={activeNavigationItem}
                    onGoInbox={() => handleNavigation("inbox")}
                  />}
        </main>
      </div>
      </div>
      {deleteTarget && (
        <div
          className="modal-backdrop"
          role="presentation"
          onClick={closeDeleteConfirmation}
        >
          <section
            className="confirm-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-confirm-title"
            aria-describedby="delete-confirm-description"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="confirm-modal__icon" aria-hidden="true">
              <Icon name="delete" size={20} />
            </div>
            <h2 id="delete-confirm-title">이 메모를 삭제할까요?</h2>
            <p id="delete-confirm-description">
              삭제된 메모는 휴지통으로 이동합니다.
            </p>
            <div className="confirm-modal__actions">
              <button
                className="confirm-modal__cancel"
                type="button"
                onClick={closeDeleteConfirmation}
                disabled={deleteItemMutation.isPending}
              >
                취소
              </button>
              <button
                className="confirm-modal__delete"
                type="button"
                onClick={confirmDelete}
                disabled={deleteItemMutation.isPending}
              >
                {deleteItemMutation.isPending ? "삭제 중..." : "삭제"}
              </button>
            </div>
          </section>
        </div>
      )}
    </>
  );
}

export default App;
