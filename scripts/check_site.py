"""Check local links and IDs in generated HTML without accessing the network."""

import argparse
from collections import Counter
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import unquote, urljoin, urlsplit


class Page(HTMLParser):
    def __init__(self, html):
        super().__init__()
        self.base = ""
        self.ids = Counter()
        self.links = []
        self.feed(html)

    def handle_starttag(self, tag, attributes):
        attrs = dict(attributes)
        line, _ = self.getpos()
        if element_id := attrs.get("id"):
            self.ids[element_id] += 1
        if tag == "base":
            self.base = attrs.get("href", "")
        if tag in {"a", "link", "img", "iframe", "script", "source", "video", "audio"}:
            for key in ("href", "src", "poster"):
                if key in attrs and attrs[key] is not None:
                    self.links.append((tag, attrs[key], line))


def check_site(site, base_url):
    base_url = base_url.rstrip("/") + "/"
    origin = urlsplit(base_url)
    pages = {path: Page(path.read_text(encoding="utf-8")) for path in site.rglob("*.html")}
    if not pages:
        yield f"{site}: no generated HTML pages"
    for path, page in sorted(pages.items()):
        relative = path.relative_to(site).as_posix()
        page_url = urljoin(base_url, relative.removesuffix("index.html"))
        effective_base = urljoin(page_url, page.base)
        for element_id, count in page.ids.items():
            if count > 1:
                yield f"{relative}: duplicate id {element_id!r} appears {count} times"
        for tag, link, line in page.links:
            if not link.strip():
                yield f"{relative}:{line}: empty URL on <{tag}>"
                continue
            if link == "#":
                continue

            source = urlsplit(link)
            target = urlsplit(urljoin(effective_base, link))
            if target.scheme not in {"http", "https"} or target.netloc != origin.netloc:
                continue
            if not target.path.startswith(origin.path):
                # A different GitHub Pages project on the same host is external.
                if not source.netloc:
                    yield f"{relative}:{line}: URL escapes deployment prefix: {link}"
                continue

            asset = site / unquote(target.path.removeprefix(origin.path))
            if asset.is_dir():
                asset /= "index.html"
            if not asset.is_file():
                yield f"{relative}:{line}: missing local destination: {link}"
                continue

            anchor = unquote(target.fragment).split(":~:", 1)[0]
            if tag == "a" and anchor and asset in pages and anchor not in pages[asset].ids:
                yield f"{relative}:{line}: missing anchor {anchor!r}: {link}"


def main():
    cli = argparse.ArgumentParser(description=__doc__)
    cli.add_argument("site", type=Path)
    cli.add_argument("site_url")
    options = cli.parse_args()
    errors = list(check_site(options.site, options.site_url))
    if errors:
        print("\n".join(errors))
        return 1
    print(f"Checked links and IDs in {options.site}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
