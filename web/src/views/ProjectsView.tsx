import {
  useState,
  type FormEvent,
} from "react";
import type { Item } from "../api/items";
import type { Project } from "../api/projects";

type ProjectsViewProps = {
  projects: Project[];
  selectedProjectId: string | null;
  projectItems: Item[];
  assignableItems: Item[];
  isPending: boolean;
  isError: boolean;
  isProjectItemsPending: boolean;
  isProjectItemsError: boolean;
  isCreating: boolean;
  isUpdating: boolean;
  isDeleting: boolean;
  onSelectProject: (projectId: string) => void;
  onCreateProject: (name: string) => Promise<unknown>;
  onRenameProject: (project: Project, name: string) => Promise<unknown>;
  onDeleteProject: (project: Project) => Promise<unknown>;
  onAssignItem: (item: Item, projectId: string | null) => Promise<unknown>;
  onRetry: () => void;
};

export function ProjectsView({
  projects,
  selectedProjectId,
  projectItems,
  assignableItems,
  isPending,
  isError,
  isProjectItemsPending,
  isProjectItemsError,
  isCreating,
  isUpdating,
  isDeleting,
  onSelectProject,
  onCreateProject,
  onRenameProject,
  onDeleteProject,
  onAssignItem,
  onRetry,
}: ProjectsViewProps) {
  const [newName, setNewName] = useState("");
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [assignmentError, setAssignmentError] = useState<string | null>(null);
  const [assigningItemId, setAssigningItemId] = useState<string | null>(null);

  const selectedProject = projects.find((project) => project.id === selectedProjectId) ?? null;

  const submitCreate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const name = newName.trim();
    if (!name || isCreating) return;

    await onCreateProject(name);
    setNewName("");
  };

  const saveRename = async (project: Project) => {
    const name = renameValue.trim();
    if (!name || isUpdating) return;

    await onRenameProject(project, name);
    setRenamingId(null);
  };

  const updateAssignment = async (item: Item, projectId: string) => {
    if (assigningItemId) return;

    setAssigningItemId(item.id);
    setAssignmentError(null);

    try {
      await onAssignItem(item, projectId || null);
    } catch {
      setAssignmentError("Item project could not be updated.");
    } finally {
      setAssigningItemId(null);
    }
  };

  return (
    <section className="projects-view" aria-labelledby="projects-title">
      <header className="view-header">
        <div>
          <p className="eyebrow">Collections</p>
          <div className="view-title-row">
            <h1 id="projects-title">Projects</h1>
            {!isPending && <span className="count-pill">{projects.length}</span>}
          </div>
          <p className="view-description">
            Group existing items by project without changing their original view.
          </p>
        </div>
      </header>

      {isError ? (
        <div className="state-panel state-panel--error" role="alert">
          <div>
            <h3>Projects could not be loaded.</h3>
            <p>Check the Worker connection and try again.</p>
          </div>
          <button type="button" onClick={onRetry}>Retry</button>
        </div>
      ) : (
        <div className="projects-layout">
          <aside className="projects-sidebar" aria-label="Project list">
            <form className="projects-create" onSubmit={(event) => void submitCreate(event)}>
              <input
                value={newName}
                onChange={(event) => setNewName(event.target.value)}
                placeholder="New project name"
                aria-label="New project name"
                disabled={isCreating}
              />
              <button type="submit" disabled={!newName.trim() || isCreating}>
                {isCreating ? "Adding..." : "Add"}
              </button>
            </form>

            {isPending ? (
              <p className="projects-muted">Loading projects...</p>
            ) : projects.length === 0 ? (
              <p className="projects-muted">No projects yet.</p>
            ) : (
              <div className="projects-list">
                {projects.map((project) => (
                  <button
                    key={project.id}
                    type="button"
                    className={`projects-list__item${project.id === selectedProjectId ? " is-active" : ""}`}
                    onClick={() => onSelectProject(project.id)}
                  >
                    <span>{project.name}</span>
                  </button>
                ))}
              </div>
            )}
          </aside>

          <div className="projects-content">
            {selectedProject ? (
              <>
                <div className="projects-content__heading">
                  {renamingId === selectedProject.id ? (
                    <div className="projects-rename">
                      <input
                        value={renameValue}
                        onChange={(event) => setRenameValue(event.target.value)}
                        aria-label="Project name"
                        autoFocus
                        disabled={isUpdating}
                      />
                      <button type="button" onClick={() => void saveRename(selectedProject)} disabled={!renameValue.trim() || isUpdating}>
                        Save
                      </button>
                      <button type="button" onClick={() => setRenamingId(null)} disabled={isUpdating}>
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <>
                      <div>
                        <h2>{selectedProject.name}</h2>
                        <p>{projectItems.length} connected items</p>
                      </div>
                      <div className="projects-content__actions">
                        <button
                          type="button"
                          onClick={() => {
                            setRenamingId(selectedProject.id);
                            setRenameValue(selectedProject.name);
                            setDeleteConfirmId(null);
                          }}
                          disabled={isDeleting}
                        >
                          Rename
                        </button>
                        {deleteConfirmId === selectedProject.id ? (
                          <>
                            <button
                              type="button"
                              className="projects-delete"
                              onClick={() => void onDeleteProject(selectedProject)}
                              disabled={isDeleting}
                            >
                              {isDeleting ? "Deleting..." : "Delete"}
                            </button>
                            <button type="button" onClick={() => setDeleteConfirmId(null)} disabled={isDeleting}>
                              Cancel
                            </button>
                          </>
                        ) : (
                          <button
                            type="button"
                            className="projects-delete"
                            onClick={() => setDeleteConfirmId(selectedProject.id)}
                            disabled={isDeleting}
                          >
                            Delete
                          </button>
                        )}
                      </div>
                    </>
                  )}
                </div>

                <section className="projects-section">
                  <h3>Project items</h3>
                  {isProjectItemsPending ? (
                    <p className="projects-muted">Loading items...</p>
                  ) : isProjectItemsError ? (
                    <p className="inline-error">Project items could not be loaded.</p>
                  ) : projectItems.length === 0 ? (
                    <p className="projects-muted">No items are connected to this project.</p>
                  ) : (
                    <ul className="projects-items">
                      {projectItems.map((item) => (
                        <li key={item.id}>
                          <div>
                            <strong>{item.body}</strong>
                            <span>{item.kind}</span>
                          </div>
                          <button
                            type="button"
                            onClick={() => void updateAssignment(item, "")}
                            disabled={assigningItemId === item.id}
                          >
                            Remove
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              </>
            ) : (
              <div className="state-panel state-panel--empty">
                <div>
                  <h3>Select a project</h3>
                  <p>Create a project or select one to see its connected items.</p>
                </div>
              </div>
            )}

            <section className="projects-section projects-section--assign">
              <h3>Assign items</h3>
              {assignmentError && <p className="inline-error" role="alert">{assignmentError}</p>}
              {assignableItems.length === 0 ? (
                <p className="projects-muted">No active items are available.</p>
              ) : (
                <ul className="projects-assignments">
                  {assignableItems.map((item) => (
                    <li key={item.id}>
                      <span>
                        <strong>{item.body}</strong>
                        <small>{item.kind}</small>
                      </span>
                      <select
                        value={item.project_id ?? ""}
                        onChange={(event) => void updateAssignment(item, event.target.value)}
                        disabled={assigningItemId === item.id}
                        aria-label="Item project"
                      >
                        <option value="">No project</option>
                        {projects.map((project) => (
                          <option key={project.id} value={project.id}>{project.name}</option>
                        ))}
                      </select>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        </div>
      )}
    </section>
  );
}
