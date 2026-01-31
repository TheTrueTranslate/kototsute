import { getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";

const ensureEmulator = () => {
  if (!process.env.FIREBASE_AUTH_EMULATOR_HOST) {
    process.env.FIREBASE_AUTH_EMULATOR_HOST = "127.0.0.1:9099";
  }
};

const ensureApp = (projectId: string) => {
  if (getApps().length === 0) {
    initializeApp({ projectId });
  }
};

export const grantAdminByEmail = async (input: { email: string; projectId: string }) => {
  ensureEmulator();
  ensureApp(input.projectId);

  const auth = getAuth();
  const user = await auth.getUserByEmail(input.email);
  const claims = user.customClaims ?? {};
  if (claims.admin === true) {
    return { uid: user.uid, updated: false };
  }
  await auth.setCustomUserClaims(user.uid, { ...claims, admin: true });
  return { uid: user.uid, updated: true };
};
