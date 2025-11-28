// src/firebaseConfig.ts
import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyAoYqi_fHfsPOAXAQOv_dZCam2xmVdPPLg",
  authDomain: "sat1-f51fd.firebaseapp.com",
  projectId: "sat1-f51fd",
  storageBucket: "sat1-f51fd.firebasestorage.app",
  messagingSenderId: "168926562989",
  appId: "1:168926562989:web:0e06ddae9a1e8be5559424",
  measurementId: "G-CM0X3Q85T6"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
