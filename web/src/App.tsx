import {
  useEffect,
  useState,
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
import { InboxView } from "./views/InboxView";
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
              ? <InboxView
                    items={itemsQuery.data ?? []}
                    inboxCount={inboxCount}
                    isPending={itemsQuery.isPending}
                    isError={itemsQuery.isError}
                    isSuccess={itemsQuery.isSuccess}
                    isFetching={itemsQuery.isFetching}
                    draft={draft}
                    isCreating={createItemMutation.isPending}
                    createError={createItemMutation.isError}
                    deleteError={deleteItemMutation.isError}
                    isDeleting={deleteItemMutation.isPending}
                    editingItemId={editingItemId}
                    editDraft={editDraft}
                    editError={editError}
                    isUpdating={updateItemMutation.isPending}
                    onDraftChange={(value) => {
                      setDraft(value);

                      if (createItemMutation.isError) {
                        createItemMutation.reset();
                      }
                    }}
                    onCreate={submitDraft}
                    onRetry={() => {
                      void itemsQuery.refetch();
                    }}
                    onStartEditing={startEditing}
                    onEditDraftChange={(value) => {
                      setEditDraft(value);

                      if (editError) {
                        setEditError(null);
                      }
                    }}
                    onCancelEditing={cancelEditing}
                    onSaveEditing={saveEditing}
                    onDeleteRequest={openDeleteConfirmation}
                  />
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
