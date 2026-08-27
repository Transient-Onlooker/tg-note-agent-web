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
  createPrintJob,
  deleteItem,
  itemQueryKeys,
  listItems,
  listTrash,
  restoreItem,
  updateItemFields,
  type Item,
  type UpdateItemInput,
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
import { NotesView } from "./views/NotesView";
import { ArchiveView } from "./views/ArchiveView";
import { PurchaseView } from "./views/PurchaseView";
import { PrintQueueView } from "./views/PrintQueueView";
import { TodayView } from "./views/TodayView";
import { getTodayRange } from "./utils/date";
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

  const todayRange = getTodayRange();
  const inboxFilters = { kind: "inbox" as const, status: "active" as const };
  const notesFilters = { kind: "note" as const, status: "active" as const };
  const todayFilters = {
    status: "active" as const,
    dueFrom: todayRange.dueFrom,
    dueTo: todayRange.dueTo,
  };

  const itemsQuery = useQuery({
    queryKey: itemQueryKeys.list(inboxFilters),
    queryFn: () => listItems(inboxFilters),
  });

  const notesQuery = useQuery({
    queryKey: itemQueryKeys.list(notesFilters),
    queryFn: () => listItems({ kind: "note", status: "active" }),
    enabled: activeView === "notes",
  });

  const todayQuery = useQuery({
    queryKey: itemQueryKeys.list(todayFilters),
    queryFn: () => listItems({
      status: "active",
      dueFrom: todayRange.dueFrom,
      dueTo: todayRange.dueTo,
    }),
    enabled: activeView === "today",
  });

  const archiveFilters = { status: "archived" as const };
  const archiveQuery = useQuery({
    queryKey: itemQueryKeys.list(archiveFilters),
    queryFn: () => listItems({ status: "archived" }),
    enabled: activeView === "archive",
  });

  const purchaseFilters = { kind: "purchase" as const, status: "active" as const };
  const purchaseQuery = useQuery({
    queryKey: itemQueryKeys.list(purchaseFilters),
    queryFn: () => listItems({ kind: "purchase", status: "active" }),
    enabled: activeView === "purchase",
  });

  const printQueueFilters = { kind: "print_job" as const, status: "active" as const };
  const printQueueQuery = useQuery({
    queryKey: itemQueryKeys.list(printQueueFilters),
    queryFn: () => listItems({ kind: "print_job", status: "active" }),
    enabled: activeView === "print-queue",
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
      await queryClient.invalidateQueries({ queryKey: itemQueryKeys.all });
    },
  });

  const deleteItemMutation = useMutation({
    mutationFn: deleteItem,
    onSuccess: async () => {
      setDeleteTarget(null);
      await queryClient.invalidateQueries({ queryKey: itemQueryKeys.all });
      await queryClient.invalidateQueries({ queryKey: ["trash"] });
    },
  });

  const createPrintJobMutation = useMutation({
    mutationFn: createPrintJob,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: itemQueryKeys.all });
    },
  });

  const updateItemMutation = useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateItemInput }) =>
      updateItemFields(id, input),
    onSuccess: async (updatedItem: Item) => {
      queryClient.setQueriesData<Item[]>(
        { queryKey: itemQueryKeys.all },
        (items) =>
          items?.map((item) =>
            item.id === updatedItem.id ? updatedItem : item,
          ),
      );
      await queryClient.invalidateQueries({ queryKey: itemQueryKeys.all });
      setEditingItemId(null);
      setEditDraft("");
      setEditError(null);
    },
    onError: () => {
      setEditError("수정하지 못했습니다.");
    },
  });

  const updateDueMutation = useMutation({
    mutationFn: ({ id, dueAt }: { id: string; dueAt: string | null }) =>
      updateItemFields(id, { due_at: dueAt }),
    onSuccess: async (updatedItem: Item) => {
      queryClient.setQueriesData<Item[]>(
        { queryKey: itemQueryKeys.all },
        (items) =>
          items?.map((item) =>
            item.id === updatedItem.id ? updatedItem : item,
          ),
      );

      const isDueToday =
        updatedItem.status === "active" &&
        updatedItem.due_at !== null &&
        updatedItem.due_at >= todayRange.dueFrom &&
        updatedItem.due_at < todayRange.dueTo;

      queryClient.setQueryData<Item[]>(
        itemQueryKeys.list(todayFilters),
        (items) =>
          isDueToday
            ? [
                updatedItem,
                ...(items ?? []).filter((item) => item.id !== updatedItem.id),
              ]
            : items?.filter((item) => item.id !== updatedItem.id),
      );
      await queryClient.invalidateQueries({ queryKey: itemQueryKeys.all });
    },
  });

  const classifyItemMutation = useMutation({
    mutationFn: ({ id, kind }: { id: string; kind: "inbox" | "note" | "purchase" | "print_job" }) =>
      updateItemFields(id, { kind }),
    onSuccess: async (updatedItem: Item) => {
      queryClient.setQueryData<Item[]>(
        itemQueryKeys.list(inboxFilters),
        (items) =>
          updatedItem.kind === "inbox"
            ? [
                updatedItem,
                ...(items ?? []).filter((item) => item.id !== updatedItem.id),
              ]
            : items?.filter((item) => item.id !== updatedItem.id),
      );
      queryClient.setQueryData<Item[]>(
        itemQueryKeys.list(notesFilters),
        (items) =>
          updatedItem.kind === "note"
            ? [
                updatedItem,
                ...(items ?? []).filter((item) => item.id !== updatedItem.id),
              ]
          : items?.filter((item) => item.id !== updatedItem.id),
      );
      queryClient.setQueryData<Item[]>(
        itemQueryKeys.list(purchaseFilters),
        (items) =>
          updatedItem.kind === "purchase"
            ? [
                updatedItem,
                ...(items ?? []).filter((item) => item.id !== updatedItem.id),
              ]
            : items?.filter((item) => item.id !== updatedItem.id),
      );
      queryClient.setQueryData<Item[]>(
        itemQueryKeys.list(printQueueFilters),
        (items) =>
          updatedItem.kind === "print_job"
            ? [
                updatedItem,
                ...(items ?? []).filter((item) => item.id !== updatedItem.id),
              ]
            : items?.filter((item) => item.id !== updatedItem.id),
      );
      await queryClient.invalidateQueries({ queryKey: itemQueryKeys.all });
    },
  });

  const syncStatusItemCache = (updatedItem: Item) => {
    const updateList = (
      queryKey: ReturnType<typeof itemQueryKeys.list>,
      shouldInclude: boolean,
    ) => {
      queryClient.setQueryData<Item[]>(queryKey, (items) => {
        if (shouldInclude) {
          return [
            updatedItem,
            ...(items ?? []).filter((item) => item.id !== updatedItem.id),
          ];
        }

        return items?.filter((item) => item.id !== updatedItem.id);
      });
    };

    updateList(
      itemQueryKeys.list(inboxFilters),
      updatedItem.status === "active" && updatedItem.kind === "inbox",
    );
    updateList(
      itemQueryKeys.list(notesFilters),
      updatedItem.status === "active" && updatedItem.kind === "note",
    );
    updateList(
      itemQueryKeys.list(archiveFilters),
      updatedItem.status === "archived",
    );
    updateList(
      itemQueryKeys.list(purchaseFilters),
      updatedItem.status === "active" && updatedItem.kind === "purchase",
    );
    updateList(
      itemQueryKeys.list(printQueueFilters),
      updatedItem.status === "active" && updatedItem.kind === "print_job",
    );
  };

  const archiveItemMutation = useMutation({
    mutationFn: (id: string) =>
      updateItemFields(id, { status: "archived" }),
    onSuccess: async (updatedItem: Item) => {
      syncStatusItemCache(updatedItem);
      await queryClient.invalidateQueries({ queryKey: itemQueryKeys.all });
    },
  });

  const restoreArchivedItemMutation = useMutation({
    mutationFn: (id: string) =>
      updateItemFields(id, { status: "active" }),
    onSuccess: async (updatedItem: Item) => {
      syncStatusItemCache(updatedItem);
      await queryClient.invalidateQueries({ queryKey: itemQueryKeys.all });
    },
  });

  const restoreItemMutation = useMutation({
    mutationFn: restoreItem,
    onSuccess: async (restoredItem: Item) => {
      queryClient.setQueryData<Item[]>(["trash"], (items) =>
        items?.filter((item) => item.id !== restoredItem.id),
      );
      setRestoreError(null);
      await queryClient.invalidateQueries({ queryKey: itemQueryKeys.all });
      await queryClient.invalidateQueries({ queryKey: ["trash"] });
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
  const notesCount = notesQuery.isSuccess ? notesQuery.data.length : null;
  const todayCount = todayQuery.isSuccess ? todayQuery.data.length : null;
  const archiveCount = archiveQuery.isSuccess ? archiveQuery.data.length : null;
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
      input: { body: trimmedBody },
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

  const classifyItem = (item: Item, kind: "inbox" | "note" | "purchase" | "print_job") => {
    if (classifyItemMutation.isPending) {
      return;
    }

    classifyItemMutation.mutate({ id: item.id, kind });
  };

  const setItemDueToday = (item: Item) => {
    if (updateDueMutation.isPending) {
      return;
    }

    updateDueMutation.mutate({ id: item.id, dueAt: todayRange.dueFrom });
  };

  const clearItemDue = (item: Item) => {
    if (updateDueMutation.isPending) {
      return;
    }

    updateDueMutation.mutate({ id: item.id, dueAt: null });
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
            isClassifying={classifyItemMutation.isPending}
            isArchiving={archiveItemMutation.isPending}
            isPurchasing={classifyItemMutation.isPending}
            isSendingToPrintQueue={classifyItemMutation.isPending}
            isSettingToday={updateDueMutation.isPending}
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
            onClassify={(item) => classifyItem(item, "note")}
            onArchive={(item) => archiveItemMutation.mutate(item.id)}
            onPurchase={(item) => classifyItem(item, "purchase")}
            onSendToPrintQueue={(item) => classifyItem(item, "print_job")}
            onSetToday={setItemDueToday}
            onDeleteRequest={openDeleteConfirmation}
          />
        ) : activeView === "notes" ? (
          <NotesView
            items={notesQuery.data ?? []}
            notesCount={notesCount}
            isPending={notesQuery.isPending}
            isError={notesQuery.isError}
            isSuccess={notesQuery.isSuccess}
            isFetching={notesQuery.isFetching}
            editingItemId={editingItemId}
            editDraft={editDraft}
            editError={editError}
            isUpdating={updateItemMutation.isPending}
            isDeleting={deleteItemMutation.isPending}
            isMovingToInbox={classifyItemMutation.isPending}
            isArchiving={archiveItemMutation.isPending}
            isPurchasing={classifyItemMutation.isPending}
            isSendingToPrintQueue={classifyItemMutation.isPending}
            isSettingToday={updateDueMutation.isPending}
            deleteError={deleteItemMutation.isError}
            onRetry={() => {
              void notesQuery.refetch();
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
            onMoveToInbox={(item) => classifyItem(item, "inbox")}
            onArchive={(item) => archiveItemMutation.mutate(item.id)}
            onPurchase={(item) => classifyItem(item, "purchase")}
            onSendToPrintQueue={(item) => classifyItem(item, "print_job")}
            onSetToday={setItemDueToday}
            onDeleteRequest={openDeleteConfirmation}
          />
        ) : activeView === "today" ? (
          <TodayView
            items={todayQuery.data ?? []}
            notesCount={todayCount}
            isPending={todayQuery.isPending}
            isError={todayQuery.isError}
            isSuccess={todayQuery.isSuccess}
            isFetching={todayQuery.isFetching}
            editingItemId={editingItemId}
            editDraft={editDraft}
            editError={editError}
            isUpdating={updateItemMutation.isPending}
            isDeleting={deleteItemMutation.isPending}
            isMovingToInbox={classifyItemMutation.isPending}
            isArchiving={archiveItemMutation.isPending}
            isClearingDue={updateDueMutation.isPending}
            deleteError={deleteItemMutation.isError}
            onRetry={() => {
              void todayQuery.refetch();
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
            onClearDue={clearItemDue}
            onArchive={(item) => archiveItemMutation.mutate(item.id)}
            onDeleteRequest={openDeleteConfirmation}
          />
        ) : activeView === "purchase" ? (
          <PurchaseView
            items={purchaseQuery.data ?? []}
            notesCount={purchaseQuery.isSuccess ? purchaseQuery.data.length : null}
            isPending={purchaseQuery.isPending}
            isError={purchaseQuery.isError}
            isSuccess={purchaseQuery.isSuccess}
            isFetching={purchaseQuery.isFetching}
            editingItemId={editingItemId}
            editDraft={editDraft}
            editError={editError}
            isUpdating={updateItemMutation.isPending}
            isDeleting={deleteItemMutation.isPending}
            isMovingToInbox={classifyItemMutation.isPending}
            isArchiving={archiveItemMutation.isPending}
            deleteError={deleteItemMutation.isError}
            onRetry={() => {
              void purchaseQuery.refetch();
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
            onMoveToInbox={(item) => classifyItem(item, "inbox")}
            onArchive={(item) => archiveItemMutation.mutate(item.id)}
            onDeleteRequest={openDeleteConfirmation}
          />
        ) : activeView === "print-queue" ? (
          <PrintQueueView
            items={printQueueQuery.data ?? []}
            isPending={printQueueQuery.isPending}
            isError={printQueueQuery.isError}
            isFetching={printQueueQuery.isFetching}
            isUpdating={updateItemMutation.isPending}
            isCreating={createPrintJobMutation.isPending}
            isDeleting={deleteItemMutation.isPending}
            isMovingToInbox={classifyItemMutation.isPending}
            isArchiving={archiveItemMutation.isPending}
            deleteError={deleteItemMutation.isError}
            onRetry={() => {
              void printQueueQuery.refetch();
            }}
            onUpdateItem={(id, input) => updateItemMutation.mutateAsync({ id, input })}
            onCreate={() => createPrintJobMutation.mutate()}
            onMoveToInbox={(item) => classifyItem(item, "inbox")}
            onArchive={(item) => archiveItemMutation.mutate(item.id)}
            onDeleteRequest={openDeleteConfirmation}
          />
        ) : activeView === "archive" ? (
          <ArchiveView
            items={archiveQuery.data ?? []}
            archiveCount={archiveCount}
            isPending={archiveQuery.isPending}
            isError={archiveQuery.isError}
            isSuccess={archiveQuery.isSuccess}
            isFetching={archiveQuery.isFetching}
            editingItemId={editingItemId}
            editDraft={editDraft}
            editError={editError}
            isUpdating={updateItemMutation.isPending}
            isDeleting={deleteItemMutation.isPending}
            isRestoring={restoreArchivedItemMutation.isPending}
            deleteError={deleteItemMutation.isError}
            onRetry={() => {
              void archiveQuery.refetch();
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
            onRestore={(item) => restoreArchivedItemMutation.mutate(item.id)}
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
