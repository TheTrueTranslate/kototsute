import { auth } from "./firebase";

const projectId = import.meta.env.VITE_FIREBASE_PROJECT_ID;
const useEmulators =
  import.meta.env.DEV && String(import.meta.env.VITE_FIREBASE_USE_EMULATORS ?? "true") !== "false";

const baseUrl = useEmulators
  ? `http://127.0.0.1:5001/${projectId}/us-central1/api`
  : `https://us-central1-${projectId}.cloudfunctions.net/api`;

export const apiFetch = async (path: string, options: RequestInit = {}) => {
  const user = auth.currentUser;
  if (!user) {
    throw new Error("UNAUTHORIZED");
  }

  const token = await user.getIdToken();
  const res = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...(options.headers ?? {})
    }
  });

  const json = await res.json();
  if (!res.ok) {
    const error = new Error(json?.message ?? "API error") as Error & {
      status?: number;
      data?: any;
    };
    error.status = res.status;
    error.data = json;
    throw error;
  }

  return json;
};
