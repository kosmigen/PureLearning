const shelves = new Map();
const bundle = new URL("../bookshelf.js", import.meta.url);
const stylesheet = new URL("../bookshelf.css", import.meta.url);

async function syncBookshelves() {
  for (const [element, dispose] of shelves) {
    if (!element.isConnected) {
      dispose?.();
      shelves.delete(element);
    }
  }

  const newShelves = [...document.querySelectorAll("[data-bookshelf]")]
    .filter(element => !shelves.has(element));
  if (!newShelves.length) return;
  for (const element of newShelves) shelves.set(element, null);

  if (!document.querySelector("link[data-bookshelf-styles]")) {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = stylesheet;
    link.dataset.bookshelfStyles = "";
    document.head.append(link);
  }

  try {
    const { mountBookshelf } = await import(bundle.href);
    for (const element of newShelves) {
      if (element.isConnected && shelves.has(element)) {
        shelves.set(element, mountBookshelf(element));
      }
    }
  } catch (error) {
    for (const element of newShelves) shelves.delete(element);
    console.error("Failed to load bookshelf", error);
  }
}

if (window.document$) window.document$.subscribe(syncBookshelves);
else syncBookshelves();
