import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { CardActionButton } from "./CardActionButton";
import { Icon } from "./Icon";

export type CardAction = {
  key: string;
  className: string;
  label: string;
  icon: ReactNode;
  onClick: () => void | Promise<unknown>;
  inline?: boolean;
  menu?: boolean;
  menuCore?: boolean;
};

export type ProjectOption = {
  id: string;
  name: string;
};

type CardActionsProps = {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  actions: CardAction[];
  projectOptions?: ProjectOption[];
  projectId?: string | null;
  onProjectChange?: (projectId: string | null) => Promise<unknown>;
  onProjectCreate?: (name: string) => Promise<ProjectOption>;
};

export function CardActions({
  isOpen,
  onOpenChange,
  actions,
  projectOptions = [],
  projectId = null,
  onProjectChange,
  onProjectCreate,
}: CardActionsProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [isSavingProject, setIsSavingProject] = useState(false);
  const [opensUpward, setOpensUpward] = useState(false);
  const [menuMaxHeight, setMenuMaxHeight] = useState(480);
  const [isCreatingProject, setIsCreatingProject] = useState(false);
  const [newProjectName, setNewProjectName] = useState("");
  const [projectError, setProjectError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (target instanceof Node && !rootRef.current?.contains(target)) {
        onOpenChange(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onOpenChange(false);
    };

    document.addEventListener("pointerdown", handlePointerDown, true);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown, true);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, onOpenChange]);

  useLayoutEffect(() => {
    if (!isOpen) {
      setOpensUpward(false);
      setIsCreatingProject(false);
      setNewProjectName("");
      setProjectError(null);
      return;
    }

    const root = rootRef.current;
    const menu = menuRef.current;
    if (!root || !menu) return;

    const updatePlacement = () => {
      const rootBounds = root.getBoundingClientRect();
      const headerBottom = document
        .querySelector<HTMLElement>(".mobile-topbar")
        ?.getBoundingClientRect().bottom ?? 0;
      const safeTop = Math.max(12, headerBottom + 8);
      const safeBottom = 16;
      const availableBelow = Math.max(0, window.innerHeight - rootBounds.bottom - safeBottom);
      const availableAbove = Math.max(0, rootBounds.top - safeTop);
      const opensUp = menu.scrollHeight > availableBelow && availableAbove > availableBelow;
      const availableHeight = opensUp ? availableAbove : availableBelow;

      setOpensUpward(opensUp);
      setMenuMaxHeight(Math.max(80, Math.min(480, availableHeight)));
    };

    updatePlacement();
    window.addEventListener("resize", updatePlacement);
    return () => window.removeEventListener("resize", updatePlacement);
  }, [isOpen, actions.length, projectOptions.length, isCreatingProject]);

  const menuActions = actions.filter((action) => action.menu !== false);
  const regularMenuActions = menuActions.filter((action) => action.key !== "delete");
  const destructiveMenuActions = menuActions.filter((action) => action.key === "delete");
  const inlineActions = actions.filter((action) => action.inline);

  return (
    <div
      ref={rootRef}
      className={`note-card__actions${isOpen ? " is-open" : ""}${opensUpward ? " opens-up" : ""}`}
      style={{ "--action-menu-max-height": `${menuMaxHeight}px` } as CSSProperties}
    >
      <div className="note-card__inline-actions">
        {inlineActions.map((action) => (
          <CardActionButton
            key={`inline-${action.key}`}
            className={`${action.className} note-card__inline-action`}
            aria-label={action.label}
            onClick={action.onClick}
          >
            {action.icon}
          </CardActionButton>
        ))}
      </div>

      <button
        className="note-card__menu-toggle"
        type="button"
        aria-label="메모 작업 더보기"
        aria-expanded={isOpen}
        onClick={() => onOpenChange(!isOpen)}
      >
        <Icon name="more" size={18} />
      </button>

      <div ref={menuRef} className="note-card__action-menu" role="menu" aria-hidden={!isOpen}>
        {regularMenuActions.map((action) => (
          <CardActionButton
            key={`menu-${action.key}`}
            className={`${action.className} note-card__menu-action${action.menuCore ? " note-card__menu-core" : ""}`}
            aria-label={action.label}
            menuLabel={action.label}
            onTriggered={() => onOpenChange(false)}
            onClick={action.onClick}
          >
            {action.icon}
          </CardActionButton>
        ))}

        {onProjectChange && (
          <label className="note-card__project-control">
            <Icon name="projects" size={17} />
            <span>프로젝트</span>
            <select
              aria-label="프로젝트 지정"
              value={projectId ?? ""}
              disabled={isSavingProject || isCreatingProject}
              onChange={(event) => {
                if (event.target.value === "__create-project__") {
                  setIsCreatingProject(true);
                  setProjectError(null);
                  return;
                }
                const nextProjectId = event.target.value || null;
                setIsSavingProject(true);
                void onProjectChange(nextProjectId)
                  .then(() => onOpenChange(false))
                  .finally(() => setIsSavingProject(false));
              }}
            >
              <option value="">프로젝트 없음</option>
              {projectOptions.map((project) => (
                <option key={project.id} value={project.id}>{project.name}</option>
              ))}
              {onProjectCreate && <option value="__create-project__">+ 새 프로젝트 만들기</option>}
            </select>
          </label>
        )}

        {isCreatingProject && onProjectCreate && (
          <div className="note-card__project-create">
            <input
              value={newProjectName}
              onChange={(event) => setNewProjectName(event.target.value)}
              placeholder="새 프로젝트 이름"
              aria-label="새 프로젝트 이름"
              autoFocus
            />
            <button
              type="button"
              disabled={!newProjectName.trim() || isSavingProject}
              onClick={() => {
                const name = newProjectName.trim();
                if (!name) return;
                setIsSavingProject(true);
                setProjectError(null);
                void onProjectCreate(name)
                  .then((project) => onProjectChange?.(project.id))
                  .then(() => onOpenChange(false))
                  .catch(() => setProjectError("프로젝트를 만들지 못했습니다."))
                  .finally(() => setIsSavingProject(false));
              }}
            >
              만들기
            </button>
            <button type="button" onClick={() => setIsCreatingProject(false)} disabled={isSavingProject}>취소</button>
            {projectError && <p role="alert">{projectError}</p>}
          </div>
        )}

        {destructiveMenuActions.map((action) => (
          <CardActionButton
            key={`menu-${action.key}`}
            className={`${action.className} note-card__menu-action`}
            aria-label={action.label}
            menuLabel={action.label}
            onTriggered={() => onOpenChange(false)}
            onClick={action.onClick}
          >
            {action.icon}
          </CardActionButton>
        ))}
      </div>
    </div>
  );
}
