import { createRoot } from "react-dom/client";
import Grainient from "./Grainient.jsx";

export function mountHomeGrainient(host) {
  const root = createRoot(host);
  const compact = window.matchMedia("(max-width: 39.99em)");
  const palette = new MutationObserver(render);

  function render() {
    const styles = getComputedStyle(host);
    const colors = ["--grain-start", "--grain-middle", "--grain-end", "--home-paper"]
      .map((name) => styles.getPropertyValue(name).trim());
    root.render(
      <Grainient
        colors={colors}
        angle={90}
        flow={0.8}
        silk={0.35}
        grainAmount={0.065}
        speed={0.75}
        interactive={false}
        clickSwirl={false}
        intro={false}
        dpr={compact.matches ? 1 : 1.35}
      />
    );
  }

  render();
  palette.observe(document.body, { attributes: true, attributeFilter: ["data-md-color-scheme"] });
  compact.addEventListener("change", render);
  return () => {
    palette.disconnect();
    compact.removeEventListener("change", render);
    root.unmount();
  };
}
