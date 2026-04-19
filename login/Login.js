// ── UI helpers ──
document.querySelectorAll(".card, .plan-card, .tracker-card").forEach(item => {
  item.addEventListener("click", () => { alert("This page will be available soon"); });
});

const links = document.querySelectorAll(".nav a");
const current = window.location.pathname.split("/").pop();
links.forEach(link => {
  if (link.getAttribute("href").includes(current)) link.classList.add("active");
});

// ── Show / Hide boxes ──
function showRegister() {
  document.getElementById("loginBox").classList.add("hidden");
  document.getElementById("registerBox").classList.remove("hidden");
  document.getElementById("promoBox")?.classList.add("hidden");
  document.querySelector(".login-container")?.classList.add("register-mode");
}

function showLogin() {
  document.getElementById("registerBox").classList.add("hidden");
  document.getElementById("loginBox").classList.remove("hidden");
  document.getElementById("promoBox")?.classList.remove("hidden");
  document.querySelector(".login-container")?.classList.remove("register-mode");
}


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

// ── Login Form Handler ──
document.querySelector("#loginBox form")?.addEventListener("submit", function (e) {
  e.preventDefault();
  const email = this.querySelector("[type=email]").value.trim();
  const pass  = this.querySelector("[type=password]").value;

  if (!email || !pass) { showError("Please fill all fields"); return; }

  if (typeof firebase !== "undefined" && firebase.auth) {
    firebase.auth().signInWithEmailAndPassword(email, pass)
      .then(cred => saveUserAndRedirect(cred.user))
      .catch(err => {
        if (err.code === "auth/operation-not-supported-in-this-environment") {
          console.warn("Local file:// mode detected. Bypassing Auth...");
          saveUserAndRedirect({ email, uid: "local-bypass-user", displayName: null });
          return;
        }
        const messages = {
          "auth/user-not-found":    "No account found with this email.",
          "auth/wrong-password":    "Incorrect password. Please try again.",
          "auth/invalid-email":     "Invalid email address.",
          "auth/too-many-requests": "Too many attempts. Please try again later."
        };
        showError(messages[err.code] || err.message);
      });
  } else {
    saveUserAndRedirect({ email, uid: null, displayName: null });
  }
});


document.querySelector("#registerBox form")?.addEventListener("submit", function (e) {
  e.preventDefault();
  const name  = this.querySelector("[type=text]")?.value.trim() || "";
  const email = this.querySelector("[type=email]").value.trim();
  const pass  = this.querySelector("[type=password]").value;

  if (!email || !pass) { showError("Please fill all fields"); return; }
  if (pass.length < 6)  { showError("Password must be at least 6 characters"); return; }

  if (typeof firebase !== "undefined" && firebase.auth) {
    firebase.auth().createUserWithEmailAndPassword(email, pass)
      .then(cred => {
        const updateName = name
          ? cred.user.updateProfile({ displayName: name })
          : Promise.resolve();
        return updateName.then(() => cred.user);
      })
      .then(user => saveUserAndRedirect(user))
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
    saveUserAndRedirect({ email, uid: null, displayName: name });
  }
});

// ── Google Login / Sign Up ──
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

// ── Logout ──
document.getElementById("logoutBtn")?.addEventListener("click", function () {
  if (typeof firebase !== "undefined" && firebase.auth) {
    firebase.auth().signOut().finally(() => {
      localStorage.removeItem("hydroUser");
      window.location.href = "../landing/landing.html";
    });
  } else {
    localStorage.removeItem("hydroUser");
    window.location.href = "../landing/landing.html";
  }
});
