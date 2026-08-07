// Firebase クラウド保存の初期化。
// .env に VITE_FIREBASE_* が設定されていない場合は null のままとなり、
// アプリ側は自動的に localStorage のみのオフライン保存にフォールバックする。
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID
};

const isConfigured = Boolean(firebaseConfig.apiKey && firebaseConfig.projectId);

export const appId = import.meta.env.VITE_APP_ID || 'edicode-test-system';

let app = null;
let auth = null;
let db = null;

if (isConfigured) {
  try {
    app = initializeApp(firebaseConfig);
    auth = getAuth(app);
    db = getFirestore(app);
  } catch (e) {
    console.error('Firebase init error', e);
    app = null;
    auth = null;
    db = null;
  }
}

export { app, auth, db };

export const initAuth = async () => {
  if (!auth) return;
  try {
    if (typeof window.__initial_auth_token !== 'undefined' && window.__initial_auth_token) {
      await signInWithCustomToken(auth, window.__initial_auth_token);
    } else {
      await signInAnonymously(auth);
    }
  } catch (error) {
    console.error('Auth error', error);
  }
};

export const watchAuth = (callback) => {
  if (!auth) return () => {};
  return onAuthStateChanged(auth, callback);
};
