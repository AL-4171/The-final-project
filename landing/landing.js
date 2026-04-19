// ── Theme Sync ──
function applyTheme(mode) {
  if (mode === "dark") document.body.classList.add("dark");
  else if (mode === "light") document.body.classList.remove("dark");
  else document.body.classList.toggle("dark", window.matchMedia("(prefers-color-scheme: dark)").matches);
}
applyTheme(localStorage.getItem("theme") || "system");


function redirectToHome() {
  window.location.href = "../home/Home.html";
}


if (typeof firebase !== "undefined" && firebase.auth) {
  firebase.auth().onAuthStateChanged(function(user) {
    if (user) {
      
      localStorage.setItem("hydroUser", JSON.stringify({
        email: user.email,
        uid: user.uid,
        loggedAt: Date.now()
      }));
      redirectToHome();
    } else {
      
      if (localStorage.getItem("hydroUser")) {
        redirectToHome();
      }
      
    }
  });
} else {
  
  if (localStorage.getItem("hydroUser")) {
    redirectToHome();
  }
}

// animation features on scroll
const cards = document.querySelectorAll(".feature-card");

window.addEventListener("scroll", () => {
  cards.forEach((card, index) => {
    const top = card.getBoundingClientRect().top;
    if (top < window.innerHeight - 50) {
      setTimeout(() => {
        card.classList.add("show");
      }, index * 150);
    }
  });
});