import {
  useEffect,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { createItem, getItems } from "./api/items";
import "./App.css";

type ViewId =
  | "inbox"
  | "today"
  | "notes"
  | "projects"
  | "print-queue"
  | "purchase"
  | "archive";

type IconName = ViewId | "menu" | "close" | "send" | "refresh" | "relay";

interface NavigationItem {
  id: ViewId;
  label: string;
  description: string;
}

interface NavigationGroup {
  label: string;
  items: NavigationItem[];
}

const navigationGroups: NavigationGroup[] = [
  {
    label: "Workspace",
    items: [
      {
        id: "inbox",
        label: "Inbox",
        description: "들어온 메모를 빠르게 확인하고 정리하는 공간입니다.",
      },
      {
        id: "today",
        label: "Today",
        description: "오늘 확인할 메모와 할 일을 모아보는 화면입니다.",
      },
      {
        id: "notes",
        label: "Notes",
        description: "정리된 모든 노트를 한곳에서 관리하는 화면입니다.",
      },
    ],
  },
  {
    label: "Collections",
    items: [
      {
        id: "projects",
        label: "Projects",
        description: "프로젝트별로 관련 메모를 묶어 관리하는 화면입니다.",
      },
      {
        id: "print-queue",
        label: "Print Queue",
        description: "출력하거나 따로 보관할 자료를 준비하는 화면입니다.",
      },
      {
        id: "purchase",
        label: "Purchase",
        description: "구매 후보와 필요한 물건을 정리하는 화면입니다.",
      },
    ],
  },
  {
    label: "Library",
    items: [
      {
        id: "archive",
        label: "Archive",
        description: "완료되거나 보관된 노트를 찾아보는 화면입니다.",
      },
    ],
  },
];

const iconPaths: Record<IconName, ReactNode> = {
  inbox: (
    <>
      <path d="M4 5.75h16v12.5H4z" />
      <path d="M4 14h4l1.5 2h5L16 14h4" />
    </>
  ),
  today: (
    <>
      <rect x="4" y="5" width="16" height="15" rx="2" />
      <path d="M8 3v4M16 3v4M4 10h16" />
      <path d="M8 14h3M8 17h6" />
    </>
  ),
  notes: (
    <>
      <path d="M6 3.75h9l3 3v13.5H6z" />
      <path d="M14.5 3.75V7h3.25M9 11h6M9 14h6M9 17h4" />
    </>
  ),
  projects: (
    <>
      <path d="M3.75 7.25h6l1.75 2h8.75v10.5H3.75z" />
      <path d="M3.75 7.25V4.5h6l1.5 1.75h7v3" />
    </>
  ),
  "print-queue": (
    <>
      <path d="M7 8V3.75h10V8M7 17H4.5V9.5h15V17H17" />
      <path d="M7 14h10v6.25H7zM16.5 11.25h.01" />
    </>
  ),
  purchase: (
    <>
      <path d="M3.5 5h2l2 9.25h9.25l2-6.5H6.2" />
      <circle cx="9" cy="18.5" r="1.25" />
      <circle cx="16" cy="18.5" r="1.25" />
    </>
  ),
  archive: (
    <>
      <path d="M4 7.5h16v12H4zM3 4h18v3.5H3z" />
      <path d="M9 11h6" />
    </>
  ),
  menu: <path d="M4 7h16M4 12h16M4 17h16" />,
  close: <path d="m6 6 12 12M18 6 6 18" />,
  send: (
    <>
      <path d="m4 4 17 8-17 8 3-8z" />
      <path d="M7 12h14" />
    </>
  ),
  refresh: (
    <>
      <path d="M19 7v5h-5" />
      <path d="M18.25 16a7.5 7.5 0 1 1 .5-7.25L19 12" />
    </>
  ),
  relay: (
    <>
      <path d="M5 7.5h10.5a3.5 3.5 0 0 1 0 7H9" />
      <path d="m11.5 11.5-4 3 4 3" />
    </>
  ),
};

function Icon({ name, size = 18 }: { name: IconName; size?: number }) {
  return (
    <svg
      aria-hidden="true"
      className="icon"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {iconPaths[name]}
    </svg>
  );
}

function formatCreatedAt(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString("ko-KR", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function App() {
  const [draft, setDraft] = useState("");
  const [activeView, setActiveView] = useState<ViewId>("inbox");
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const queryClient = useQueryClient();

  const itemsQuery = useQuery({
    queryKey: ["items"],
    queryFn: getItems,
  });

  const createItemMutation = useMutation({
    mutationFn: createItem,
    onSuccess: async () => {
      setDraft("");
      await queryClient.invalidateQueries({ queryKey: ["items"] });
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
            <article className="note-card" key={item.id}>
              <span className="note-card__marker" aria-hidden="true">
                <Icon name="notes" size={18} />
              </span>
              <div className="note-card__content">
                <p className="note-card__body">{item.body}</p>
                <div className="note-card__meta">
                  <span className="kind-badge">{item.kind}</span>
                  <span className="meta-separator" aria-hidden="true" />
                  <time dateTime={item.created_at}>
                    {formatCreatedAt(item.created_at)}
                  </time>
                </div>
              </div>
            </article>
          ))}
      </div>
    </section>
  );

  const renderPlaceholder = () => (
    <section className="placeholder-view" aria-labelledby="placeholder-title">
      <header className="view-header">
        <div>
          <p className="eyebrow">Workspace</p>
          <div className="view-title-row">
            <h1 id="placeholder-title">{activeNavigationItem.label}</h1>
            <span className="soon-pill">준비 중</span>
          </div>
          <p className="view-description">{activeNavigationItem.description}</p>
        </div>
      </header>

      <div className="placeholder-card">
        <span className="placeholder-card__icon">
          <Icon name={activeNavigationItem.id} size={28} />
        </span>
        <h2>{activeNavigationItem.label}</h2>
        <p>이 화면은 아직 준비 중입니다. 현재는 Inbox에서 메모를 관리해 주세요.</p>
        <button type="button" onClick={() => handleNavigation("inbox")}>
          Inbox로 돌아가기
        </button>
      </div>
    </section>
  );

  return (
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
          {activeView === "inbox" ? renderInbox() : renderPlaceholder()}
        </main>
      </div>
    </div>
  );
}

export default App;
