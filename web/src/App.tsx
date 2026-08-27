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
import { LockedScreen } from "./components/LockedScreen";
import { AppShell } from "./components/AppShell";
import { DeleteConfirmModal } from "./components/DeleteConfirmModal";
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
      <AppShell
        activeView={activeView}
        isSidebarOpen={isSidebarOpen}
        inboxCount={inboxCount}
        trashCount={
          trashQuery.isSuccess
            ? trashQuery.data.length
            : null
        }
        onNavigate={handleNavigation}
        onOpenSidebar={() => setIsSidebarOpen(true)}
        onCloseSidebar={() => setIsSidebarOpen(false)}
        onLock={onLock}
      >
        {activeView === "inbox" ? (
          <InboxView
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
        ) : activeView === "trash" ? (
          <TrashView
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
        ) : (
          <PlaceholderView
            item={activeNavigationItem}
            onGoInbox={() => handleNavigation("inbox")}
          />
        )}
      </AppShell>
      {deleteTarget && (
        <DeleteConfirmModal
          isPending={deleteItemMutation.isPending}
          onCancel={closeDeleteConfirmation}
          onConfirm={confirmDelete}
        />
      )}
    </>
  );
}

export default App;
