import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

// ── REPLACE WITH YOUR CONFIG ──────────────────────────────────────────────
const firebaseConfig = {
  apiKey: "AIzaSyB1u0sdlyJama7A3WxPYVPn1515EHIOBlw",
  authDomain: "windfall-16cc7.firebaseapp.com",
  projectId: "windfall-16cc7",
  storageBucket: "windfall-16cc7.firebasestorage.app",
  messagingSenderId: "102675326877",
  appId: "1:102675326877:web:6fa0798bfeb77e4469f174"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
