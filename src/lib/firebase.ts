import { initializeApp } from "firebase/app";
import { getAuth, connectAuthEmulator } from "firebase/auth";
import { getFirestore, connectFirestoreEmulator } from "firebase/firestore";
import { getStorage, connectStorageEmulator } from "firebase/storage";
import { getFunctions, connectFunctionsEmulator } from "firebase/functions";

const firebaseConfig = {
  apiKey: "AIzaSyC76BzHPD4Q2UYFeQoYmNMcW5X3iy-G0G0",
  authDomain: "kototsute.firebaseapp.com",
  projectId: "kototsute",
  storageBucket: "kototsute.firebasestorage.app",
  messagingSenderId: "413518052351",
  appId: "1:413518052351:web:9975c8b537563edb8685ca"
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);
export const functions = getFunctions(app);

const useEmulators =
  import.meta.env.DEV &&
  String(import.meta.env.VITE_FIREBASE_USE_EMULATORS ?? "true") !== "false";

if (useEmulators) {
  const globalForFirebase = globalThis as typeof globalThis & {
    __firebaseEmulatorsConnected?: boolean;
  };

  if (!globalForFirebase.__firebaseEmulatorsConnected) {
    connectAuthEmulator(auth, "http://localhost:9099", { disableWarnings: true });
    connectFirestoreEmulator(db, "localhost", 8080);
    connectStorageEmulator(storage, "localhost", 9199);
    connectFunctionsEmulator(functions, "localhost", 5001);
    globalForFirebase.__firebaseEmulatorsConnected = true;
  }
}

export default app;
