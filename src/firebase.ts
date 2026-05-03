import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
// import { getAnalytics } from "firebase/analytics";

const firebaseConfig = {
  apiKey: "AIzaSyDuvodTaCDe3vr4iDV9Gb0OH9PjC8VN2X0",
  authDomain: "llmdaftar.firebaseapp.com",
  projectId: "llmdaftar",
  storageBucket: "llmdaftar.firebasestorage.app",
  messagingSenderId: "482136007542",
  appId: "1:482136007542:web:169e3bc3f864274fe79057",
  measurementId: "G-RR7HXS7C2Q"
};

// Initialize Firebase
export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const googleProvider = new GoogleAuthProvider();
// export const analytics = getAnalytics(app);
