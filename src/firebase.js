import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyARzYuFpeDhhM32kcZRDaYlcdGjbWafnqQ",
  authDomain: "vaultmcp-4431d.firebaseapp.com",
  projectId: "vaultmcp-4431d",
  storageBucket: "vaultmcp-4431d.firebasestorage.app",
  messagingSenderId: "442978671236",
  appId: "1:442978671236:web:adf03518765197f0b440d1",
  measurementId: "G-NDYKKRLWW0"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const googleProvider = new GoogleAuthProvider();
const db = getFirestore(app);

export { auth, googleProvider, db };
