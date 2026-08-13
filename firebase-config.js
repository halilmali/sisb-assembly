// Firebase configuration for the SISB Morning Assembly Booking app.
// These values come from your Firebase project (console.firebase.google.com →
// Project settings → General → Your apps → Web app → SDK setup and configuration).
// If you ever need to switch projects, paste the new config here.

import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.8.0/firebase-app.js';
import { getAuth } from 'https://www.gstatic.com/firebasejs/12.8.0/firebase-auth.js';
import { getFirestore } from 'https://www.gstatic.com/firebasejs/12.8.0/firebase-firestore.js';

const firebaseConfig = {
  apiKey: "AIzaSyAru4C44JXxdrdslZRAaabcP_94bsNhJbs",
  authDomain: "assembly-62eac.firebaseapp.com",
  projectId: "assembly-62eac",
  storageBucket: "assembly-62eac.firebasestorage.app",
  messagingSenderId: "148281353667",
  appId: "1:148281353667:web:0435c208370866538cc976"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);
