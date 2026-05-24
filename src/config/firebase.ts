/**
 * Firebase configuration for PodLingo.
 *
 * Firebase API keys are designed to be public in client apps —
 * security is enforced by Firestore Security Rules, not by hiding the key.
 *
 * We use initializeAuth (not getAuth) to avoid the WKWebView iframe issue
 * where onAuthStateChanged never fires in certain WebView contexts.
 */
import { initializeApp } from 'firebase/app';
import { initializeAuth, browserLocalPersistence, browserPopupRedirectResolver } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: 'AIzaSyAWNWyZuYMtJCOiWoRQTW64qvsjr8LWo3I',
  authDomain: 'podcast-language-learning.firebaseapp.com',
  projectId: 'podcast-language-learning',
  storageBucket: 'podcast-language-learning.firebasestorage.app',
  messagingSenderId: '606050285986',
  appId: '1:606050285986:web:6856c40795d9fe7453dafb',
};

export const app = initializeApp(firebaseConfig);

// initializeAuth with explicit persistence + resolver.
// - browserLocalPersistence: avoids iframe auth hang in WebViews (see CLAUDE.md)
// - browserPopupRedirectResolver: required for signInWithPopup when using
//   initializeAuth (getAuth includes it automatically, initializeAuth does not)
export const auth = initializeAuth(app, {
  persistence: browserLocalPersistence,
  popupRedirectResolver: browserPopupRedirectResolver,
});

export const db = getFirestore(app);
