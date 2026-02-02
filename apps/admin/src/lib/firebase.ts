import { initializeApp } from "firebase/app";
import { connectAuthEmulator, getAuth } from "firebase/auth";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID
};

const missingKeys = Object.entries(firebaseConfig)
  .filter(([, value]) => !value)
  .map(([key]) => key);

if (missingKeys.length > 0) {
  throw new Error(
    `Firebase 設定が不足しています: ${missingKeys.join(", ")}. .env を確認してください。`
  );
}

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);

const useEmulators =
  import.meta.env.DEV &&
  String(import.meta.env.VITE_FIREBASE_USE_EMULATORS ?? "true") !== "false";

if (useEmulators) {
  const globalForFirebase = globalThis as typeof globalThis & {
    __firebaseAdminEmulatorsConnected?: boolean;
  };

  if (!globalForFirebase.__firebaseAdminEmulatorsConnected) {
    connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
    globalForFirebase.__firebaseAdminEmulatorsConnected = true;
  }
}
