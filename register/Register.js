// ── UI helpers ──
document.querySelectorAll(".card, .plan-card, .tracker-card").forEach(item => {
  item.addEventListener("click", () => { alert("This page will be available soon"); });
});

const links = document.querySelectorAll(".nav a");
const current = window.location.pathname.split("/").pop();
links.forEach(link => {
  if (link.getAttribute("href").includes(current)) link.classList.add("active");
});


function saveUserAndRedirect(user) {
  localStorage.setItem("hydroUser", JSON.stringify({
    email: user.email,
    uid:   user.uid || null,
    name:  user.displayName || null,
    loggedAt: Date.now()
  }));
  window.location.href = "../home/Home.html";
}


function showError(msg) {
  alert("❌ " + msg);
}

// ── Register Form Handler ──
document.getElementById("registerForm")?.addEventListener("submit", function (e) {
  e.preventDefault();
  const name    = document.getElementById("regName")?.value.trim() || "";
  const email   = document.getElementById("regEmail").value.trim();
  const pass    = document.getElementById("regPassword").value;
  const confirm = document.getElementById("regConfirm").value;

  if (!name)            { showError("Please enter your full name"); return; }
  if (!email || !pass)  { showError("Please fill all fields"); return; }
  if (pass !== confirm) { showError("Passwords don't match"); return; }
  if (pass.length < 6)  { showError("Password must be at least 6 characters"); return; }

  if (typeof firebase !== "undefined" && firebase.auth) {
    firebase.auth().createUserWithEmailAndPassword(email, pass)
      .then(cred => {
        // Save display name to Firebase Auth profile
        return cred.user.updateProfile({ displayName: name }).then(() => cred.user);
      })
      .then(user => saveUserAndRedirect({ email: user.email, uid: user.uid, displayName: name }))
      .catch(err => {
        if (err.code === "auth/operation-not-supported-in-this-environment") {
          console.warn("Local file:// mode detected. Bypassing Auth...");
          saveUserAndRedirect({ email, uid: "local-bypass-user", displayName: name });
          return;
        }
        const messages = {
          "auth/email-already-in-use": "This email is already registered. Try logging in.",
          "auth/weak-password":        "Password is too weak.",
          "auth/invalid-email":        "Invalid email address."
        };
        showError(messages[err.code] || err.message);
      });
  } else {
    // Fallback offline
    saveUserAndRedirect({ email, uid: null, displayName: name });
  }
});


// ── Google Sign Up ──
document.getElementById("googleBtn")?.addEventListener("click", function () {
  if (typeof firebase !== "undefined" && firebase.auth) {
    const provider = new firebase.auth.GoogleAuthProvider();
    firebase.auth().signInWithPopup(provider)
      .then(result => saveUserAndRedirect(result.user))
      .catch(err => {
        if (err.code === "auth/operation-not-supported-in-this-environment") {
          console.warn("Local file:// mode detected. Bypassing Auth...");
          saveUserAndRedirect({ email: "google@user.com", uid: "local-bypass-user", displayName: "Google User" });
          return;
        }
        showError(err.message);
      });
  } else {
    saveUserAndRedirect({ email: "google@user.com", uid: null, displayName: "Google User" });
  }
});
