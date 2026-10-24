function updateSiteNavigation() {
  const navigation = document.querySelector(".kb-site-navigation");
  if (!navigation) return;

  const currentPath = window.location.pathname;
  const links = [...navigation.querySelectorAll("[data-site-section]")];
  const matches = links
    .map((link) => ({ link, path: new URL(link.href).pathname }))
    .filter(({ path }) => currentPath.startsWith(path))
    .sort((a, b) => b.path.length - a.path.length);
  const activeLink = matches[0]?.link;

  links.forEach((link) => {
    const active = link === activeLink;
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
