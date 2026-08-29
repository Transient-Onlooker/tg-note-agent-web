import {
  useEffect,
  useRef,
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
  createReferenceItem,
  deleteItem,
  getItemCounts,
  itemQueryKeys,
  itemCountQueryKeys,
  listItems,
  listTrash,
  restoreItem,
  updateItemFields,
  type Item,
  type ItemKind,
  type ReferenceType,
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
import { ReferenceView } from "./views/ReferenceView";
import {
  getLocalDateKey,
  fromDateTimeInputValue,
  getMillisecondsUntilNextLocalDay,
  getTodayRange,
  toDateTimeInputValue,
} from "./utils/date";
import "./App.css";

type AuthStatus = "checking" | "locked" | "authenticated";
type UndoAction = { actionId: number; itemId: string; kind: "move" | "due" | "archive" | "delete"; snapshot: Item };
type ActionFeedback = { message: string; tone: "success" | "error"; undo?: UndoAction };
type UpdateItemContext = {
  snapshots: Array<[readonly unknown[], Item[] | undefined]>;
};
type EditDraftSnapshot = {
  body: string;
  dueAt: string;
};
type UpdateItemVariables = {
  id: string;
  input: UpdateItemInput;
  draft?: EditDraftSnapshot;
  editorSession?: number;
};
type MoveItemVariables = {
  id: string;
  kind: "inbox" | "note" | "task" | "purchase" | "print_job" | "reference";
  referenceType?: ReferenceType;
  propertiesJson?: string;
  sourceView: ViewId;
  snapshot: Item;
  actionId: number;
};
type MoveItemContext = UpdateItemContext;
type ArchiveItemVariables = {
  id: string;
  sourceView: ViewId;
  snapshot: Item;
  actionId: number;
};

function hasReferenceType(item: Item, referenceType: "modeling" | "question") {
  try {
    const properties = JSON.parse(item.properties_json) as { reference_type?: unknown };
    return properties.reference_type === referenceType;
  } catch {
    return false;
  }
}

function getPropertiesJsonForMove(
  item: Item,
  targetKind: ItemKind,
  referenceType?: ReferenceType,
) {
  let properties: Record<string, unknown>;

  try {
    const parsed: unknown = JSON.parse(item.properties_json);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return targetKind === "reference" && referenceType
        ? JSON.stringify({ reference_type: referenceType })
        : undefined;
    }
    properties = { ...(parsed as Record<string, unknown>) };
  } catch {
    return targetKind === "reference" && referenceType
      ? JSON.stringify({ reference_type: referenceType })
      : undefined;
  }

  if (targetKind === "reference" && referenceType) {
    return JSON.stringify({ ...properties, reference_type: referenceType });
  }

  if (item.kind === "reference" && "reference_type" in properties) {
    delete properties.reference_type;
    return JSON.stringify(properties);
  }

  return undefined;
}

function sortTodoItems(items: Item[]) {
  return items
    .map((item, index) => ({ item, index }))
    .sort((left, right) => {
      if (left.item.due_at === null && right.item.due_at === null) {
        return left.index - right.index;
      }
      if (left.item.due_at === null) return 1;
      if (right.item.due_at === null) return -1;

      const dueDifference = Date.parse(left.item.due_at) - Date.parse(right.item.due_at);
      return dueDifference || left.index - right.index;
    })
    .map(({ item }) => item);
}




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
  const [editDueAt, setEditDueAt] = useState("");
  const [editError, setEditError] = useState<string | null>(null);
  const [restoreError, setRestoreError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Item | null>(null);
  const [actionFeedback, setActionFeedback] = useState<ActionFeedback | null>(null);
  const [feedbackExpiresAt, setFeedbackExpiresAt] = useState<number | null>(null);
  const [feedbackRemainingMs, setFeedbackRemainingMs] = useState(0);
  const [localDateKey, setLocalDateKey] = useState(() => getLocalDateKey());
  const queryClient = useQueryClient();
  const editingItemIdRef = useRef<string | null>(null);
  const failedEditDraftsRef = useRef(new Map<string, EditDraftSnapshot>());
  const editorSessionRef = useRef(0);
  const movingItemIdsRef = useRef(new Set<string>());
  const undoActionSequenceRef = useRef(0);
  const latestActionByItemRef = useRef(new Map<string, number>());
  useRealtimeSync(queryClient);

  const showActionFeedback = (message: string, tone: ActionFeedback["tone"] = "success") => {
    setActionFeedback({ message, tone });
    const expiresAt = Date.now() + 3000;
    setFeedbackExpiresAt(expiresAt);
    setFeedbackRemainingMs(3000);
  };

  const beginUndoableAction = (itemId: string) => {
    const actionId = ++undoActionSequenceRef.current;
    latestActionByItemRef.current.set(itemId, actionId);
    return actionId;
  };

  const showUndoFeedback = (message: string, action: Omit<UndoAction, "actionId">, actionId: number) => {
    setActionFeedback({ message, tone: "success", undo: { ...action, actionId } });
    const expiresAt = Date.now() + 3000;
    setFeedbackExpiresAt(expiresAt);
    setFeedbackRemainingMs(3000);
  };

  useEffect(() => {
    if (!actionFeedback || feedbackExpiresAt === null) return;
    const updateRemaining = () => setFeedbackRemainingMs(Math.max(0, feedbackExpiresAt - Date.now()));
    updateRemaining();
    const intervalId = window.setInterval(updateRemaining, 100);
    const timeoutId = window.setTimeout(() => {
      setActionFeedback(null);
      setFeedbackExpiresAt(null);
    }, Math.max(0, feedbackExpiresAt - Date.now()));
    return () => {
      window.clearInterval(intervalId);
      window.clearTimeout(timeoutId);
    };
  }, [actionFeedback, feedbackExpiresAt]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setLocalDateKey(getLocalDateKey());
    }, getMillisecondsUntilNextLocalDay() + 50);

    return () => window.clearTimeout(timeoutId);
  }, [localDateKey]);

  const todayRange = getTodayRange();
  const inboxFilters = { kind: "inbox" as const, status: "active" as const };
  const todoFilters = { kind: "task" as const, status: "active" as const };
  const notesFilters = { kind: "note" as const, status: "active" as const };
  const todayFilters = {
    status: "active" as const,
    dueTo: todayRange.dueTo,
  };

  const itemsQuery = useQuery({
    queryKey: itemQueryKeys.list(inboxFilters),
    queryFn: () => listItems(inboxFilters),
  });

  const notesQuery = useQuery({
    queryKey: itemQueryKeys.list(notesFilters),
    queryFn: () => listItems(notesFilters),
    enabled: activeView === "notes",
  });

  const todoQuery = useQuery({
    queryKey: itemQueryKeys.list(todoFilters),
    queryFn: () => listItems(todoFilters),
    enabled: activeView === "todo",
  });

  const todayQuery = useQuery({
    queryKey: itemQueryKeys.list(todayFilters),
    queryFn: () => listItems(todayFilters),
    enabled: activeView === "today",
  });

  const itemCountsQuery = useQuery({
    queryKey: itemCountQueryKeys.list(todayRange.dueTo),
    queryFn: () => getItemCounts(todayRange.dueTo),
  });

  const invalidateItemData = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: itemQueryKeys.all }),
      queryClient.invalidateQueries({ queryKey: itemCountQueryKeys.all }),
    ]);
  };

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

  const referenceFilters = { kind: "reference" as const, status: "active" as const };
  const referenceQuery = useQuery({
    queryKey: itemQueryKeys.list(referenceFilters),
    queryFn: () => listItems(referenceFilters),
    enabled: activeView === "modeling" || activeView === "question",
  });

  const trashQuery = useQuery({
    queryKey: ["trash"],
    queryFn: listTrash,
    enabled: activeView === "trash",
  });

  const getViewQueryKey = (view: ViewId) => {
    switch (view) {
      case "inbox": return itemQueryKeys.list(inboxFilters);
      case "notes": return itemQueryKeys.list(notesFilters);
      case "todo": return itemQueryKeys.list(todoFilters);
      case "today": return itemQueryKeys.list(todayFilters);
      case "purchase": return itemQueryKeys.list(purchaseFilters);
      case "print-queue": return itemQueryKeys.list(printQueueFilters);
      case "archive": return itemQueryKeys.list(archiveFilters);
      case "modeling":
      case "question": return itemQueryKeys.list(referenceFilters);
      default: return null;
    }
  };

  const snapshotItemQueries = () => queryClient.getQueriesData<Item[]>({
    queryKey: itemQueryKeys.all,
  });

  const removeItemFromViewCache = (view: ViewId, itemId: string) => {
    const queryKey = getViewQueryKey(view);
    if (queryKey) {
      queryClient.setQueryData<Item[]>(queryKey, (items) =>
        items?.filter((item) => item.id !== itemId),
      );
    }
  };

  const createItemMutation = useMutation({
    mutationFn: createItem,
    onSuccess: async () => {
      setDraft("");
      await invalidateItemData();
      showActionFeedback("Inbox에 메모를 추가했습니다.");
    },
    onError: () => showActionFeedback("메모를 추가하지 못했습니다.", "error"),
  });

  const deleteItemMutation = useMutation({
    mutationFn: ({ id }: { id: string; snapshot: Item; actionId: number }) => deleteItem(id),
    onSuccess: async (_result, variables) => {
      setDeleteTarget(null);
      await invalidateItemData();
      await queryClient.invalidateQueries({ queryKey: ["trash"] });
      if (latestActionByItemRef.current.get(variables.id) === variables.actionId) {
        showUndoFeedback("메모를 삭제했습니다.", { itemId: variables.id, kind: "delete", snapshot: variables.snapshot }, variables.actionId);
      }
    },
    onError: () => showActionFeedback("메모를 삭제하지 못했습니다.", "error"),
  });

  const createPrintJobMutation = useMutation({
    mutationFn: createPrintJob,
    onSuccess: async () => {
      await invalidateItemData();
      showActionFeedback("Print Queue에 작업을 추가했습니다.");
    },
    onError: () => showActionFeedback("작업을 추가하지 못했습니다.", "error"),
  });

  const createReferenceMutation = useMutation({
    mutationFn: ({ body, referenceType }: { body: string; referenceType: "modeling" | "question" }) =>
      createReferenceItem(body, referenceType),
    onSuccess: async () => {
      await invalidateItemData();
    },
    onError: () => showActionFeedback("저장하지 못했습니다.", "error"),
  });

  const updateItemMutation = useMutation({
    mutationFn: ({ id, input }: UpdateItemVariables) =>
      updateItemFields(id, input),
    onMutate: async ({ id, input }) => {
      await queryClient.cancelQueries({ queryKey: itemQueryKeys.all });
      const snapshots = queryClient.getQueriesData<Item[]>({
        queryKey: itemQueryKeys.all,
      });
      const optimisticUpdatedAt = new Date().toISOString();

      queryClient.setQueriesData<Item[]>(
        { queryKey: itemQueryKeys.all },
        (items) =>
          items?.map((item) =>
            item.id === id
              ? ({
                  ...item,
                  ...input,
                  updated_at: optimisticUpdatedAt,
                  version: item.version + 1,
                } as Item)
              : item,
          ),
      );

      return { snapshots } satisfies UpdateItemContext;
    },
    onSuccess: async (updatedItem: Item, variables: UpdateItemVariables) => {
      queryClient.setQueriesData<Item[]>(
        { queryKey: itemQueryKeys.all },
        (items) =>
          items?.map((item) =>
            item.id === updatedItem.id ? updatedItem : item,
          ),
      );
      await invalidateItemData();
      failedEditDraftsRef.current.delete(updatedItem.id);
      if (variables.editorSession !== undefined &&
        editingItemIdRef.current === updatedItem.id &&
        editorSessionRef.current === variables.editorSession) {
        editingItemIdRef.current = null;
        setEditingItemId(null);
        setEditDraft("");
        setEditDueAt("");
        setEditError(null);
      }
      showActionFeedback("수정했습니다.");
    },
    onError: (_error, variables, context) => {
      context?.snapshots.forEach(([queryKey, items]) => {
        queryClient.setQueryData(queryKey, items);
      });

      if (variables.draft) {
        failedEditDraftsRef.current.set(variables.id, variables.draft);
        const currentEditingId = editingItemIdRef.current;
        const ownsEditor = variables.editorSession !== undefined &&
          (currentEditingId === null ||
            (currentEditingId === variables.id &&
              editorSessionRef.current === variables.editorSession));
        if (ownsEditor) {
          editingItemIdRef.current = variables.id;
          editorSessionRef.current += 1;
          setEditingItemId(variables.id);
          setEditDraft(variables.draft.body);
          setEditDueAt(variables.draft.dueAt);
          setEditError("수정하지 못했습니다.");
        }
      }
      showActionFeedback("수정하지 못했습니다.", "error");
    },
  });

  const updateDueMutation = useMutation({
    mutationFn: ({ id, dueAt }: { id: string; dueAt: string | null; snapshot: Item; actionId: number }) =>
      updateItemFields(id, { due_at: dueAt }),
    onSuccess: async (updatedItem: Item, variables) => {
      queryClient.setQueriesData<Item[]>(
        { queryKey: itemQueryKeys.all },
        (items) =>
          items?.map((item) =>
            item.id === updatedItem.id ? updatedItem : item,
          ),
      );

      const isDueForTodayView =
        updatedItem.status === "active" &&
        updatedItem.due_at !== null &&
        updatedItem.due_at < todayRange.dueTo;

      queryClient.setQueryData<Item[]>(
        itemQueryKeys.list(todayFilters),
        (items) =>
          isDueForTodayView
            ? [
                updatedItem,
                ...(items ?? []).filter((item) => item.id !== updatedItem.id),
              ]
            : items?.filter((item) => item.id !== updatedItem.id),
      );
      await invalidateItemData();
      if (latestActionByItemRef.current.get(updatedItem.id) === variables.actionId) {
        showUndoFeedback("변경을 적용했습니다.", { itemId: updatedItem.id, kind: "due", snapshot: variables.snapshot }, variables.actionId);
      }
    },
    onError: () => showActionFeedback("기한을 변경하지 못했습니다.", "error"),
  });

  const classifyItemMutation = useMutation({
    mutationFn: ({ id, kind, propertiesJson }: MoveItemVariables) =>
      updateItemFields(id, {
        kind,
        ...(propertiesJson === undefined ? {} : { properties_json: propertiesJson }),
      }),
    onMutate: async ({ id, sourceView }) => {
      if (movingItemIdsRef.current.has(id)) return { snapshots: [] } satisfies MoveItemContext;
      movingItemIdsRef.current.add(id);
      await queryClient.cancelQueries({ queryKey: itemQueryKeys.all });
      const snapshots = snapshotItemQueries();
      if (sourceView !== "today") {
        removeItemFromViewCache(sourceView, id);
      }
      return { snapshots } satisfies MoveItemContext;
    },
    onSuccess: async (updatedItem: Item, variables) => {
      movingItemIdsRef.current.delete(updatedItem.id);
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
        itemQueryKeys.list(todoFilters),
        (items) =>
          updatedItem.kind === "task"
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
      queryClient.setQueryData<Item[]>(
        itemQueryKeys.list(referenceFilters),
        (items) =>
          updatedItem.kind === "reference" && updatedItem.status === "active"
            ? [
                updatedItem,
                ...(items ?? []).filter((item) => item.id !== updatedItem.id),
              ]
            : items?.filter((item) => item.id !== updatedItem.id),
      );
      await invalidateItemData();
      const labels = {
        inbox: "Inbox",
        note: "Notes",
        task: "Todo",
        purchase: "Purchase",
        print_job: "Print Queue",
        reference: "Reference",
      } as const;
      if (latestActionByItemRef.current.get(updatedItem.id) === variables.actionId) {
        showUndoFeedback(`${labels[variables.kind]}로 이동했습니다.`, { itemId: updatedItem.id, kind: "move", snapshot: variables.snapshot }, variables.actionId);
      }
    },
    onError: (_error, variables, context) => {
      movingItemIdsRef.current.delete(variables.id);
      context?.snapshots.forEach(([queryKey, items]) => {
        queryClient.setQueryData(queryKey, items);
      });
      showActionFeedback("이동하지 못했습니다.", "error");
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
      itemQueryKeys.list(todoFilters),
      updatedItem.status === "active" && updatedItem.kind === "task",
    );
    updateList(
      itemQueryKeys.list(todayFilters),
      updatedItem.status === "active" &&
        updatedItem.due_at !== null &&
        updatedItem.due_at < todayRange.dueTo,
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
    updateList(
      itemQueryKeys.list(referenceFilters),
      updatedItem.status === "active" && updatedItem.kind === "reference",
    );
  };


  const archiveItemMutation = useMutation({
    mutationFn: ({ id }: ArchiveItemVariables) =>
      updateItemFields(id, { status: "archived" }),
    onMutate: async ({ id, sourceView }) => {
      if (movingItemIdsRef.current.has(id)) return { snapshots: [] } satisfies MoveItemContext;
      movingItemIdsRef.current.add(id);
      await queryClient.cancelQueries({ queryKey: itemQueryKeys.all });
      const snapshots = snapshotItemQueries();
      removeItemFromViewCache(sourceView, id);
      return { snapshots } satisfies MoveItemContext;
    },
    onSuccess: async (updatedItem: Item, variables: ArchiveItemVariables) => {
      movingItemIdsRef.current.delete(updatedItem.id);
      syncStatusItemCache(updatedItem);
      await invalidateItemData();
      if (latestActionByItemRef.current.get(updatedItem.id) === variables.actionId) {
        showUndoFeedback("Archive로 이동했습니다.", { itemId: updatedItem.id, kind: "archive", snapshot: variables.snapshot }, variables.actionId);
      }
    },
    onError: (_error, variables, context) => {
      movingItemIdsRef.current.delete(variables.id);
      context?.snapshots.forEach(([queryKey, items]) => {
        queryClient.setQueryData(queryKey, items);
      });
      showActionFeedback("Archive로 이동하지 못했습니다.", "error");
    },
  });

  const restoreArchivedItemMutation = useMutation({
    mutationFn: (id: string) =>
      updateItemFields(id, { status: "active" }),
    onSuccess: async (updatedItem: Item) => {
      syncStatusItemCache(updatedItem);
      await invalidateItemData();
      showActionFeedback("활성 메모로 복원했습니다.");
    },
    onError: () => showActionFeedback("복원하지 못했습니다.", "error"),
  });

  const restoreItemMutation = useMutation({
    mutationFn: restoreItem,
    onSuccess: async (restoredItem: Item) => {
      queryClient.setQueryData<Item[]>(["trash"], (items) =>
        items?.filter((item) => item.id !== restoredItem.id),
      );
      setRestoreError(null);
      await invalidateItemData();
      await queryClient.invalidateQueries({ queryKey: ["trash"] });
      showActionFeedback("휴지통에서 복원했습니다.");
    },
    onError: () => {
      setRestoreError("복원하지 못했습니다.");
      showActionFeedback("복원하지 못했습니다.", "error");
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
  const todayItems = todayQuery.data?.filter(
    (item) => item.due_at !== null && item.due_at >= todayRange.dueFrom,
  ) ?? [];
  const overdueItems = todayQuery.data?.filter(
    (item) => item.due_at !== null && item.due_at < todayRange.dueFrom,
  ) ?? [];
  const todoCount = todoQuery.isSuccess ? todoQuery.data.length : null;
  const todoItems = todoQuery.data ? sortTodoItems(todoQuery.data) : [];
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
    const failedDraft = failedEditDraftsRef.current.get(item.id);
    failedEditDraftsRef.current.delete(item.id);
    editingItemIdRef.current = item.id;
    editorSessionRef.current += 1;
    setEditingItemId(item.id);
    setEditDraft(failedDraft?.body ?? item.body);
    setEditDueAt(failedDraft?.dueAt ?? toDateTimeInputValue(item.due_at));
    setEditError(null);
  };

  const cancelEditing = () => {
    updateItemMutation.reset();
    editorSessionRef.current += 1;
    editingItemIdRef.current = null;
    setEditingItemId(null);
    setEditDraft("");
    setEditDueAt("");
    setEditError(null);
  };

  const saveEditing = () => {
    const trimmedBody = editDraft.trim();

    if (!editingItemId || !trimmedBody || updateItemMutation.isPending) {
      return;
    }

    const itemId = editingItemId;
    const editorSession = editorSessionRef.current;
    const draftSnapshot: EditDraftSnapshot = {
      body: editDraft,
      dueAt: editDueAt,
    };
    const input: UpdateItemInput = {
      body: trimmedBody,
      due_at: fromDateTimeInputValue(editDueAt),
    };

    editorSessionRef.current += 1;
    editingItemIdRef.current = null;
    setEditingItemId(null);
    setEditDraft("");
    setEditDueAt("");
    setEditError(null);

    updateItemMutation.mutate({ id: itemId, input, draft: draftSnapshot, editorSession });
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

    const actionId = beginUndoableAction(deleteTarget.id);
    deleteItemMutation.mutate({ id: deleteTarget.id, snapshot: deleteTarget, actionId });
  };

  const classifyItem = (
    item: Item,
    kind: "inbox" | "note" | "task" | "purchase" | "print_job" | "reference",
    referenceType?: ReferenceType,
  ) => {
    if (movingItemIdsRef.current.has(item.id)) return Promise.resolve();
    const actionId = beginUndoableAction(item.id);
    return classifyItemMutation.mutateAsync({
      id: item.id,
      kind,
      referenceType,
      propertiesJson: getPropertiesJsonForMove(item, kind, referenceType),
      sourceView: activeView,
      snapshot: item,
      actionId,
    });
  };

  const archiveItem = (item: Item) => {
    if (movingItemIdsRef.current.has(item.id)) return Promise.resolve();
    const actionId = beginUndoableAction(item.id);
    return archiveItemMutation.mutateAsync({ id: item.id, sourceView: activeView, snapshot: item, actionId });
  };

  const setItemDueToday = (item: Item) =>
    updateDueMutation.mutateAsync({ id: item.id, dueAt: todayRange.dueFrom, snapshot: item, actionId: beginUndoableAction(item.id) });

  const clearItemDue = (item: Item) =>
    updateDueMutation.mutateAsync({ id: item.id, dueAt: null, snapshot: item, actionId: beginUndoableAction(item.id) });

  const getCachedItem = (itemId: string) => {
    for (const [, items] of queryClient.getQueriesData<Item[]>({ queryKey: itemQueryKeys.all })) {
      const item = items?.find((candidate) => candidate.id === itemId);
      if (item) return item;
    }
    return undefined;
  };

  const handleUndo = async () => {
    const action = actionFeedback?.undo;
    if (!action) return;
    if (latestActionByItemRef.current.get(action.itemId) !== action.actionId) {
      showActionFeedback("실행 취소할 수 없습니다.", "error");
      return;
    }
    const currentItem = getCachedItem(action.itemId);
    if (currentItem && action.kind !== "delete" && currentItem.version !== action.snapshot.version + 1) {
      await queryClient.refetchQueries({ queryKey: itemQueryKeys.all });
      showActionFeedback("더 새로운 변경이 있어 실행 취소할 수 없습니다.", "error");
      return;
    }
    setActionFeedback(null);
    setFeedbackExpiresAt(null);
    try {
      if (action.kind === "delete") {
        await restoreItem(action.itemId);
        await Promise.all([
          invalidateItemData(),
          queryClient.invalidateQueries({ queryKey: ["trash"] }),
        ]);
      } else {
        await updateItemFields(action.itemId, {
          kind: action.snapshot.kind,
          status: action.snapshot.status,
          project_id: action.snapshot.project_id,
          due_at: action.snapshot.due_at,
          properties_json: action.snapshot.properties_json,
          position: action.snapshot.position,
          triaged_at: action.snapshot.triaged_at,
        });
        await invalidateItemData();
      }
      showActionFeedback("실행 취소했습니다.");
    } catch {
      await Promise.all([
        queryClient.refetchQueries({ queryKey: itemQueryKeys.all }),
        queryClient.refetchQueries({ queryKey: itemCountQueryKeys.all }),
        queryClient.refetchQueries({ queryKey: ["trash"] }),
      ]);
      showActionFeedback("실행 취소하지 못했습니다.", "error");
    }
  };

  const referenceItems = referenceQuery.data?.filter((item) =>
    hasReferenceType(item, activeView === "modeling" ? "modeling" : "question"),
  ) ?? [];
  const referenceViewProps = {
    items: referenceItems,
    notesCount: referenceQuery.isSuccess ? referenceItems.length : null,
    isPending: referenceQuery.isPending,
    isError: referenceQuery.isError,
    isSuccess: referenceQuery.isSuccess,
    isFetching: referenceQuery.isFetching,
    editingItemId,
    editDraft,
    editDueAt,
    editError,
    isUpdating: updateItemMutation.isPending,
    deleteError: deleteItemMutation.isError,
    onRetry: () => { void referenceQuery.refetch(); },
    onStartEditing: startEditing,
    onEditDraftChange: (value: string) => { setEditDraft(value); if (editError) setEditError(null); },
    onEditDueChange: setEditDueAt,
    onCancelEditing: cancelEditing,
    onSaveEditing: saveEditing,
    onMoveToTodo: (item: Item) => classifyItem(item, "task"),
    onMoveToInbox: (item: Item) => classifyItem(item, "inbox"),
    onArchive: archiveItem,
    onPurchase: (item: Item) => classifyItem(item, "purchase"),
    onSendToPrintQueue: (item: Item) => classifyItem(item, "print_job"),
    onMoveToModeling: activeView === "question"
      ? (item: Item) => classifyItem(item, "reference", "modeling")
      : undefined,
    onMoveToQuestion: activeView === "modeling"
      ? (item: Item) => classifyItem(item, "reference", "question")
      : undefined,
    onSetToday: setItemDueToday,
    onClearDue: clearItemDue,
    onDeleteRequest: openDeleteConfirmation,
  };

  const activeViewCount = (() => {
    switch (activeView) {
      case "inbox": return inboxCount;
      case "todo": return todoCount;
      case "today": return todayCount;
      case "notes": return notesCount;
      case "print-queue": return printQueueQuery.isSuccess ? printQueueQuery.data.length : null;
      case "purchase": return purchaseQuery.isSuccess ? purchaseQuery.data.length : null;
      case "archive": return archiveCount;
      case "trash": return trashQuery.isSuccess ? trashQuery.data.length : null;
      case "modeling":
      case "question": return referenceQuery.isSuccess ? referenceItems.length : null;
      default: return null;
    }
  })();

  const createReference = (body: string) =>
    createReferenceMutation.mutateAsync({
      body,
      referenceType: activeView === "modeling" ? "modeling" : "question",
    });

  return (
    <>
      <AppShell
        activeView={activeView}
        activeViewCount={activeViewCount}
        isSidebarOpen={isSidebarOpen}
        counts={itemCountsQuery.data ?? null}
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
            editingItemId={editingItemId}
            editDraft={editDraft}
            editDueAt={editDueAt}
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
            onEditDueChange={setEditDueAt}
            onCancelEditing={cancelEditing}
            onSaveEditing={saveEditing}
            onClassify={(item) => classifyItem(item, "note")}
            onMoveToTodo={(item) => classifyItem(item, "task")}
            onArchive={archiveItem}
            onPurchase={(item) => classifyItem(item, "purchase")}
            onSendToPrintQueue={(item) => classifyItem(item, "print_job")}
            onMoveToModeling={(item) => classifyItem(item, "reference", "modeling")}
            onMoveToQuestion={(item) => classifyItem(item, "reference", "question")}
            onSetToday={setItemDueToday}
            onDeleteRequest={openDeleteConfirmation}
          />
        ) : activeView === "notes" ? (
          <NotesView
            showDueControls={false}
            items={notesQuery.data ?? []}
            notesCount={notesCount}
            isPending={notesQuery.isPending}
            isError={notesQuery.isError}
            isSuccess={notesQuery.isSuccess}
            isFetching={notesQuery.isFetching}
            editingItemId={editingItemId}
            editDraft={editDraft}
            editDueAt={editDueAt}
            editError={editError}
            isUpdating={updateItemMutation.isPending}
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
            onEditDueChange={setEditDueAt}
            onCancelEditing={cancelEditing}
            onSaveEditing={saveEditing}
            onMoveToTodo={(item) => classifyItem(item, "task")}
            onMoveToInbox={(item) => classifyItem(item, "inbox")}
            onArchive={archiveItem}
            onPurchase={(item) => classifyItem(item, "purchase")}
            onSendToPrintQueue={(item) => classifyItem(item, "print_job")}
            onMoveToModeling={(item) => classifyItem(item, "reference", "modeling")}
            onMoveToQuestion={(item) => classifyItem(item, "reference", "question")}
            onSetToday={setItemDueToday}
            onDeleteRequest={openDeleteConfirmation}
          />
        ) : activeView === "todo" ? (
          <NotesView
            viewTitle="Todo"
            viewDescription="Active tasks that still need your attention."
            emptyDescription="오늘로 지정하거나 Task로 분류한 메모가 여기에 표시됩니다."
            showCreatedAt={false}
            items={todoItems}
            notesCount={todoCount}
            isPending={todoQuery.isPending}
            isError={todoQuery.isError}
            isSuccess={todoQuery.isSuccess}
            isFetching={todoQuery.isFetching}
            editingItemId={editingItemId}
            editDraft={editDraft}
            editDueAt={editDueAt}
            editError={editError}
            isUpdating={updateItemMutation.isPending}
            deleteError={deleteItemMutation.isError}
            onRetry={() => {
              void todoQuery.refetch();
            }}
            onStartEditing={startEditing}
            onEditDraftChange={(value) => {
              setEditDraft(value);

              if (editError) {
                setEditError(null);
              }
            }}
            onEditDueChange={setEditDueAt}
            onCancelEditing={cancelEditing}
            onSaveEditing={saveEditing}
            onMoveToInbox={(item) => classifyItem(item, "inbox")}
            onMoveToNotes={(item) => classifyItem(item, "note")}
            onArchive={archiveItem}
            onPurchase={(item) => classifyItem(item, "purchase")}
            onSendToPrintQueue={(item) => classifyItem(item, "print_job")}
            onMoveToModeling={(item) => classifyItem(item, "reference", "modeling")}
            onMoveToQuestion={(item) => classifyItem(item, "reference", "question")}
            onSetToday={setItemDueToday}
            onClearDue={clearItemDue}
            onDeleteRequest={openDeleteConfirmation}
          />
        ) : activeView === "today" ? (
          <TodayView
            items={todayItems}
            overdueItems={overdueItems}
            notesCount={todayCount}
            isPending={todayQuery.isPending}
            isError={todayQuery.isError}
            isSuccess={todayQuery.isSuccess}
            isFetching={todayQuery.isFetching}
            editingItemId={editingItemId}
            editDraft={editDraft}
            editDueAt={editDueAt}
            editError={editError}
            isUpdating={updateItemMutation.isPending}
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
            onEditDueChange={setEditDueAt}
            onCancelEditing={cancelEditing}
            onSaveEditing={saveEditing}
            onClearDue={clearItemDue}
            onMoveToInbox={(item) => classifyItem(item, "inbox")}
            onMoveToNotes={(item) => classifyItem(item, "note")}
            onPurchase={(item) => classifyItem(item, "purchase")}
            onSendToPrintQueue={(item) => classifyItem(item, "print_job")}
            onMoveToModeling={(item) => classifyItem(item, "reference", "modeling")}
            onMoveToQuestion={(item) => classifyItem(item, "reference", "question")}
            onSetToday={setItemDueToday}
            onArchive={archiveItem}
            onDeleteRequest={openDeleteConfirmation}
          />
        ) : activeView === "modeling" ? (
          <ReferenceView
            {...referenceViewProps}
            referenceType="modeling"
            onCreate={createReference}
            isCreating={createReferenceMutation.isPending}
            createError={createReferenceMutation.isError}
          />
        ) : activeView === "question" ? (
          <ReferenceView
            {...referenceViewProps}
            referenceType="question"
            onCreate={createReference}
            isCreating={createReferenceMutation.isPending}
            createError={createReferenceMutation.isError}
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
            editDueAt={editDueAt}
            editError={editError}
            isUpdating={updateItemMutation.isPending}
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
            onEditDueChange={setEditDueAt}
            onCancelEditing={cancelEditing}
            onSaveEditing={saveEditing}
            onMoveToTodo={(item) => classifyItem(item, "task")}
            onMoveToInbox={(item) => classifyItem(item, "inbox")}
            onArchive={archiveItem}
            onMoveToModeling={(item) => classifyItem(item, "reference", "modeling")}
            onMoveToQuestion={(item) => classifyItem(item, "reference", "question")}
            onDeleteRequest={openDeleteConfirmation}
          />
        ) : activeView === "print-queue" ? (
          <PrintQueueView
            items={printQueueQuery.data ?? []}
            printQueueCount={printQueueQuery.isSuccess ? printQueueQuery.data.length : null}
            isPending={printQueueQuery.isPending}
            isError={printQueueQuery.isError}
            isFetching={printQueueQuery.isFetching}
            isCreating={createPrintJobMutation.isPending}
            deleteError={deleteItemMutation.isError}
            onRetry={() => {
              void printQueueQuery.refetch();
            }}
            onUpdateItem={(id, input) => updateItemMutation.mutateAsync({ id, input })}
            onCreate={() => createPrintJobMutation.mutate()}
            onMoveToInbox={(item) => classifyItem(item, "inbox")}
            onArchive={archiveItem}
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
            editDueAt={editDueAt}
            editError={editError}
            isUpdating={updateItemMutation.isPending}
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
            onEditDueChange={setEditDueAt}
            onCancelEditing={cancelEditing}
            onSaveEditing={saveEditing}
            onRestore={(item) => restoreArchivedItemMutation.mutateAsync(item.id)}
            onDeleteRequest={openDeleteConfirmation}
          />
        ) : activeView === "trash" ? (
          <TrashView
            items={trashQuery.data ?? []}
            isPending={trashQuery.isPending}
            isError={trashQuery.isError}
            isSuccess={trashQuery.isSuccess}
            restoreError={restoreError}
            onRetry={() => {
              void trashQuery.refetch();
            }}
            onRestore={(id) => {
              setRestoreError(null);
              return restoreItemMutation.mutateAsync(id);
            }}
          />
        ) : (
          <PlaceholderView
            item={activeNavigationItem}
            onGoInbox={() => handleNavigation("inbox")}
          />
        )}
      </AppShell>
      {actionFeedback && (
        <div className={`action-feedback action-feedback--${actionFeedback.tone}`} role="status">
          <span>{actionFeedback.message}</span>
          {actionFeedback.undo && (
            <button type="button" onClick={() => void handleUndo()}>실행 취소</button>
          )}
          <span aria-label="Remaining time">{Math.ceil(feedbackRemainingMs / 1000)}s</span>
        </div>
      )}
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
