export type AuthState = { uid: string; email?: string | null };

export type ErrorResponse = { ok: false; code: string; message: string };
export type OkResponse<T> = { ok: true; data: T } | { ok: true };
export type ApiResponse<T> = OkResponse<T> | ErrorResponse;

export type ApiDeps = {
  repo: import("@kototsute/asset").AssetRepository;
  now: () => Date;
  getAuthUser: (authHeader: string | null | undefined) => Promise<AuthState>;
  getOwnerUidForRead: (uid: string) => Promise<string>;
};

export type ApiBindings = {
  Variables: {
    auth: AuthState;
    deps: ApiDeps;
  };
};
