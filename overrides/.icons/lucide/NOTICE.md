# Lucide icons

Lucide SVGs are provided by the official `lucide-static` build dependency,
pinned to version 1.69.0 in `package.json` and `package-lock.json`.
Install them with `npm ci --ignore-scripts`; do not download individual icons.

Upstream: <https://github.com/lucide-icons/lucide>
Catalogue: <https://lucide.dev/icons/>

`hooks/icon_assets.py` makes package SVGs available as `.icons/lucide/<name>.svg`
to Jinja templates. Only referenced icons are embedded into generated HTML;
the complete library is not copied into the website. This directory retains
the source notice and license, and can hold intentional project overrides.

Directory navigation icons are configured in each directory's `.nav.yml`;
page icons are configured in Markdown front matter. Menu, search and palette
controls continue using `theme.icon` and the existing templates.

Copyright and license: see [LICENSE](LICENSE), which matches the pinned
package's license. Builds also publish it at `assets/licenses/lucide.txt`.
