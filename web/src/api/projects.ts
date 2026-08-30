import { API_BASE_URL, authenticatedFetch } from "./auth";

export interface Project {
  id: string;
  name: string;
  description: string | null;
  status: "active" | "archived";
  created_at: string;
  updated_at: string;
  archived_at: string | null;
}

export type ProjectInput = {
  name?: string;
  description?: string | null;
};

export const projectQueryKeys = {
  all: ["projects"] as const,
  list: () => ["projects", "list"] as const,
};

async function readProject(response: Response): Promise<Project> {
  if (!response.ok) {
    throw new Error(`Failed to save project: ${response.status}`);
  }

  const data: { project: Project } = await response.json();
  return data.project;
}

export async function listProjects(): Promise<Project[]> {
  const response = await authenticatedFetch(`${API_BASE_URL}/api/projects`);

  if (!response.ok) {
    throw new Error(`Failed to fetch projects: ${response.status}`);
  }

  const data: { projects: Project[] } = await response.json();
  return data.projects;
}

export async function createProject(input: Required<Pick<ProjectInput, "name">> & ProjectInput): Promise<Project> {
  const response = await authenticatedFetch(`${API_BASE_URL}/api/projects`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json; charset=utf-8",
    },
    body: JSON.stringify(input),
  });

  return readProject(response);
}

export async function updateProject(id: string, input: ProjectInput): Promise<Project> {
  const response = await authenticatedFetch(
    `${API_BASE_URL}/api/projects/${encodeURIComponent(id)}`,
    {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json; charset=utf-8",
      },
      body: JSON.stringify(input),
    },
  );

  return readProject(response);
}

export async function deleteProject(id: string): Promise<void> {
  const response = await authenticatedFetch(
    `${API_BASE_URL}/api/projects/${encodeURIComponent(id)}`,
    {
      method: "DELETE",
    },
  );

  if (!response.ok) {
    throw new Error(`Failed to delete project: ${response.status}`);
  }
}
