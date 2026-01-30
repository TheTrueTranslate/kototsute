import { apiFetch } from "../../features/shared/lib/api";

export type TaskProgress = {
  userCompletedTaskIds: string[];
};

export const getTaskProgress = async (caseId: string) => {
  const result = await apiFetch(`/v1/cases/${caseId}/task-progress`, { method: "GET" });
  return result.data as TaskProgress;
};

export const updateMyTaskProgress = async (caseId: string, completedTaskIds: string[]) => {
  await apiFetch(`/v1/cases/${caseId}/task-progress/me`, {
    method: "POST",
    body: JSON.stringify({ completedTaskIds })
  });
};
