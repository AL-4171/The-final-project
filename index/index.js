
(function () {
  if (localStorage.getItem("hydroUser")) {
    window.location.replace("../home/Home.html");
  } else {
    window.location.replace("../landing/landing.html");
  }
})();
