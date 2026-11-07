/* Retry Material's repository request after an earlier empty API response. */
(() => {
  try {
    const facts = __md_get("__source", sessionStorage);
    if (facts && typeof facts === "object" && Object.keys(facts).length === 0) {
      sessionStorage.removeItem(`${__md_scope.pathname}.__source`);
    }
  } catch {
    // Unavailable browser storage must not prevent Material from starting.
  }
})();
