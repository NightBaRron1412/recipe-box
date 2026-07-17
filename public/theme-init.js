(function () {
  try {
    var t = localStorage.getItem("theme");
    if (t === "dark" || (!t && window.matchMedia && matchMedia("(prefers-color-scheme:dark)").matches)) {
      document.documentElement.setAttribute("data-theme", "dark");
    }
  } catch (e) {}
})();
