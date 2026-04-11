// firebase/firebase-config.js

// FIREBASE CONFIGURATION (From ESP32 / Chat History)
// To make this dynamic from settings, we can optionally load these from localStorage.
const defaultFirebaseConfig = {
    apiKey: "AIzaSyBP5-JNjRQ-bMXAv55dQoFgini33y1pwkA",
    authDomain: "graduation-project-77513.firebaseapp.com",
    databaseURL: "https://graduation-project-77513-default-rtdb.firebaseio.com",
    projectId: "graduation-project-77513",
    storageBucket: "graduation-project-77513.firebasestorage.app",
    messagingSenderId: "1098606456079",
    appId: "1:1098606456079:web:a66eddf481ce7add8324fc",
    measurementId: "G-94MQD2Y44R"
};

// Check if user saved custom config in localStorage, otherwise use default
const savedConfig = localStorage.getItem('hydroGenFirebaseConfig');
const firebaseConfig = savedConfig ? JSON.parse(savedConfig) : defaultFirebaseConfig;

// Initialize Firebase using the Compat SDK (loaded via <script> tags)
if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
}

// Make the database instance globally available to all scripts
window.hydroGenDB = firebase.database();
