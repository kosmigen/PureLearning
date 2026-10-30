"""Keep published note URLs working after promoting topics to top-level sections."""

from __future__ import annotations

from html import escape
import json
from pathlib import Path
import posixpath
from urllib.parse import urljoin


_MOVED_SECTIONS = {
    "notes/fundamentals": "fundamentals",
    "notes/ai": "ai",
    "notes/engineering": "projects/engineering",
}


def on_post_build(*, config):
    """Generate redirects for each built page, including nested topic pages."""
    site_dir = Path(config["site_dir"])
    for previous, current in _MOVED_SECTIONS.items():
        current_dir = site_dir / current
        for page in current_dir.rglob("*.html"):
            old_page = site_dir / previous / page.relative_to(current_dir)
            target = page.relative_to(site_dir).as_posix()
            if config["use_directory_urls"] and target.endswith("/index.html"):
                target = target.removesuffix("index.html")
            relative = posixpath.relpath(target, old_page.parent.relative_to(site_dir).as_posix())
            if target.endswith("/"):
                relative += "/"
            canonical = urljoin(config["site_url"], target)
            old_page.parent.mkdir(parents=True, exist_ok=True)
            old_page.write_text(
                f"""<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>页面已迁移</title>
  <link rel="canonical" href="{escape(canonical)}">
  <meta http-equiv="refresh" content="0; url={escape(relative)}">
  <script>
    const destination = new URL({json.dumps(relative)}, window.location.href);
    destination.search = window.location.search;
    destination.hash = window.location.hash;
    window.location.replace(destination.href);
  </script>
</head>
<body><p>此页面已迁移至<a href="{escape(relative)}">新地址</a>。</p></body>
</html>
""",
                encoding="utf-8",
            )
