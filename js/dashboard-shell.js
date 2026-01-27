// dashboard-shell.js

(function () {
  const body = document.body;
  const btn = document.getElementById("sidebarToggle");
  const backdrop = document.getElementById("sidebarBackdrop");

  if (!btn || !backdrop) return;

  function setExpanded(expanded) {
    btn.setAttribute("aria-expanded", expanded ? "true" : "false");
    btn.setAttribute("aria-label", expanded ? "Close sidebar" : "Open sidebar");
  }

  function closeSidebar() {
    body.classList.remove("sidebar-open");
    setExpanded(false);
  }

  btn.addEventListener("click", () => {
    body.classList.toggle("sidebar-open");
    setExpanded(body.classList.contains("sidebar-open"));
  });

  backdrop.addEventListener("click", closeSidebar);

  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeSidebar();
  });

  // default: closed everywhere
  setExpanded(false);
})();
