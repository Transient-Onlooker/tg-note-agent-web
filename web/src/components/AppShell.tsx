import { Fragment, useState, type ReactNode } from "react";
import {
  moreNavigationItems,
  navigationGroups,
  type ViewId,
} from "../config/navigation";
import type { ItemCounts } from "../api/items";
import { Icon } from "./Icon";

type AppShellProps = {
  activeView: ViewId;
  activeViewCount: number | null;
  isSidebarOpen: boolean;
  counts: ItemCounts | null;
  onNavigate: (view: ViewId) => void;
  onOpenSidebar: () => void;
  onCloseSidebar: () => void;
  onLock: () => void;
  children: ReactNode;
};

const itemCountKeys: Partial<Record<ViewId, keyof ItemCounts>> = {
  inbox: "inbox",
  todo: "todo",
  today: "today",
  notes: "notes",
  "print-queue": "printQueue",
  purchase: "purchase",
  archive: "archive",
  trash: "trash",
};

export function AppShell({
  activeView,
  activeViewCount,
  isSidebarOpen,
  counts,
  onNavigate,
  onOpenSidebar,
  onCloseSidebar,
  onLock,
  children,
}: AppShellProps) {
  const [isMoreOpen, setIsMoreOpen] = useState(false);
  const isMoreActive = activeView === "modeling" || activeView === "question";

  return (
    <div className="app-shell">
      <button
        type="button"
        className={`sidebar-overlay${isSidebarOpen ? " is-visible" : ""}`}
        onClick={onCloseSidebar}
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
              <span className="material-symbols-outlined">
                orthopedics
              </span>
            </span>

            <div>
              <strong>NoteRelay</strong>
              <span>Personal notes</span>
            </div>
          </div>

          <button
            type="button"
            className="sidebar-close"
            onClick={onCloseSidebar}
            aria-label="메뉴 닫기"
          >
            <Icon name="close" size={20} />
          </button>
        </div>

        <nav className="sidebar-nav" aria-label="주요 메뉴">
          {navigationGroups.map((group) => (
            <Fragment key={group.label}>
              <div className="nav-group">
                <p className="nav-group__label">{group.label}</p>

                <div className="nav-group__items">
                  {group.items.map((item) => {
                    const countKey = itemCountKeys[item.id];
                    const itemCount = counts && countKey ? counts[countKey] : null;

                    return (
                      <button
                        type="button"
                        className={`nav-item${activeView === item.id ? " is-active" : ""}`}
                        onClick={() => onNavigate(item.id)}
                        aria-current={activeView === item.id ? "page" : undefined}
                        key={item.id}
                      >
                        <Icon name={item.id} size={18} />
                        <span>{item.label}</span>

                        {itemCount !== null && itemCount > 0 && (
                          <span className="nav-item__count">
                            {itemCount}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>

              {group.label === "Workspace" && (
                <div className="nav-more">
                  <button
                    type="button"
                    className={`nav-item nav-more__toggle${isMoreOpen ? " is-open" : ""}${isMoreActive ? " is-active" : ""}`}
                    aria-expanded={isMoreOpen}
                    aria-current={isMoreActive ? "page" : undefined}
                    onClick={() => setIsMoreOpen((open) => !open)}
                  >
                    <Icon name="more" size={18} />
                    <span>⋯ 더보기</span>
                  </button>

                  {isMoreOpen && (
                    <div className="nav-more__items">
                      {moreNavigationItems.map((item) => (
                        <button
                          type="button"
                          className={`nav-item${activeView === item.id ? " is-active" : ""}`}
                          onClick={() => {
                            onNavigate(item.id);
                            setIsMoreOpen(false);
                          }}
                          aria-current={activeView === item.id ? "page" : undefined}
                          key={item.id}
                        >
                          <Icon name={item.id} size={18} />
                          <span>{item.label}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </Fragment>
          ))}
        </nav>

        <div className="sidebar__footer">
          <span className="workspace-avatar" aria-hidden="true">
            N
          </span>

          <div>
            <strong>Personal workspace</strong>
            <span>Capture, then organize</span>
          </div>

          <button
            type="button"
            className="lock-button"
            onClick={onLock}
          >
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
            onClick={onOpenSidebar}
            aria-label="메뉴 열기"
            aria-expanded={isSidebarOpen}
            aria-controls="app-navigation"
          >
            <Icon name="menu" size={21} />
          </button>

          <div className="mobile-brand">
            <span className="mobile-brand__mark">
              <span className="material-symbols-outlined">
                orthopedics
              </span>
            </span>
            <strong>NoteRelay</strong>
          </div>

          {activeViewCount !== null ? (
            <span className="mobile-count">
              {activeViewCount}
            </span>
          ) : (
            <span className="mobile-count mobile-count--empty" />
          )}
        </header>

        <main className="workspace__content">
          {children}
        </main>
      </div>
    </div>
  );
}
