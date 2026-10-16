function updateSiteNavigation() {
  const navigation = document.querySelector(".kb-site-navigation");
  const home = document.querySelector('.md-header [data-md-component="logo"]');
  if (!navigation || !home) return;

  const basePath = new URL(home.href).pathname;
  const currentPath = window.location.pathname;
  const section = currentPath.startsWith(basePath)
    ? currentPath.slice(basePath.length).split("/")[0]
    : "";

  navigation.querySelectorAll("[data-site-section]").forEach((link) => {
    const active = section === link.dataset.siteSection;
    link.classList.toggle("is-active", active);
    if (active) {
      link.setAttribute("aria-current", currentPath === new URL(link.href).pathname ? "page" : "true");
    } else {
      link.removeAttribute("aria-current");
    }
  });
}

if (window.document$?.subscribe) {
  window.document$.subscribe(updateSiteNavigation);
} else if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", updateSiteNavigation, { once: true });
} else {
  updateSiteNavigation();
}
window.addEventListener("popstate", updateSiteNavigation);
