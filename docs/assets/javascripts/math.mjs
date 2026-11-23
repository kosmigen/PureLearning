const bundle = new URL("./vendor/mathjax/tex-svg.js", import.meta.url);
let loading;

function load() {
  if (!loading) {
    loading = new Promise((resolve, reject) => {
      window.MathJax = {
        tex: {
          inlineMath: [["\\(", "\\)"]],
          displayMath: [["\\[", "\\]"]],
          processEscapes: true,
          processEnvironments: true
        },
        options: {
          ignoreHtmlClass: ".*|",
          processHtmlClass: "arithmatex"
        },
        startup: { typeset: false }
      };
      const script = document.createElement("script");
      script.src = bundle.href;
      script.onload = () => resolve(window.MathJax);
      script.onerror = () => reject(new Error("MathJax failed to load"));
      document.head.append(script);
    });
  }
  return loading;
}

async function typeset() {
  if (!document.querySelector(".arithmatex")) return;
  try {
    const mathjax = await load();
    await mathjax.startup.promise;
    mathjax.typesetClear();
    mathjax.texReset();
    await mathjax.typesetPromise();
  } catch (error) {
    console.error("Math typesetting failed", error);
  }
}

if (window.document$) window.document$.subscribe(typeset);
else typeset();
