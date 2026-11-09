"""Verify latest selection, permanent snapshots and unpublished Now drafts."""

from html.parser import HTMLParser
import json
from pathlib import Path
import tempfile
import unittest
from urllib.parse import urljoin

from mkdocs.commands.build import build
from mkdocs.config import load_config
from mkdocs.exceptions import ConfigurationError


class NowLinks(HTMLParser):
    def __init__(self, html):
        super().__init__()
        self.targets = []
        self.feed(html)

    def handle_starttag(self, tag, attributes):
        attrs = dict(attributes)
        if tag in ("a", "img"):
            self.targets.append(attrs.get("href", attrs.get("src", "")))


class NowTests(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.root = Path(temporary.name)
        self.docs = self.root / "docs"
        self.now = self.docs / "now"
        self.now.mkdir(parents=True)
        self.site = self.root / "site"
        (self.docs / "index.md").write_text("# Home")
        (self.docs / "reading.md").write_text("# Reading")
        (self.now / "index.md").write_text("---\ntitle: Now\n---\n\nNo updates yet.")
        (self.now / ".nav.yml").write_text("append_unmatched: true\nnav:\n  - index.md\n")
        (self.now / "picture.svg").write_text('<svg xmlns="http://www.w3.org/2000/svg"/>')
        repository = Path(__file__).resolve().parents[1]
        self.config = load_config(
            str(repository / "mkdocs.yml"), strict=True,
            docs_dir=str(self.docs), site_dir=str(self.site),
            plugins=["search", "awesome-nav"],
            extra={"site_navigation": [{
                "id": "now", "title": "Now", "title_en": "Now", "url": "now/", "paths": ["now/"]
            }]},
        )

    def write_entry(self, day, text, *, draft=False):
        (self.now / f"{day}.md").write_text(
            f'---\ntitle: "{day}"\ndraft: {str(draft).lower()}\n---\n\n{text}'
        )

    def read(self, path):
        return (self.site / path).read_text()

    def test_latest_body_history_and_relative_links_are_rendered_on_both_urls(self):
        self.write_entry("2026-11-09", "## Focus\nLATEST_BODY\n\n![Example](picture.svg)\n"
                         "[Reading](../reading.md)\n[Earlier](2026-11-03.md#focus)")
        self.write_entry("2026-11-03", "## Focus\nEARLIER_BODY")
        self.write_entry("2099-01-01", "PRIVATE_DRAFT", draft=True)
        build(self.config)

        latest = self.read("now/index.html")
        earlier = self.read("now/2026-11-03/index.html")
        self.assertIn("LATEST_BODY", latest)
        self.assertNotIn("EARLIER_BODY", latest)
        self.assertIn("EARLIER_BODY", earlier)
        self.assertNotIn("LATEST_BODY", earlier)
        self.assertLess(latest.index('datetime="2026-11-09"', latest.index('class="kb-now-history"')),
                        latest.index('datetime="2026-11-03"', latest.index('class="kb-now-history"')))
        self.assertIn('class="kb-now-back"', earlier)
        for path in ("now/index.html", "now/2026-11-09/index.html"):
            with self.subTest(path=path):
                base = urljoin(self.config.site_url, path)
                targets = {urljoin(base, target) for target in NowLinks(self.read(path)).targets}
                for target in ("now/picture.svg", "reading/", "now/2026-11-03/#focus"):
                    self.assertIn(urljoin(self.config.site_url, target), targets)
        self.assertFalse((self.site / "now/2099-01-01/index.html").exists())
        self.assertNotIn("PRIVATE_DRAFT", self.read("search/search_index.json"))

    def test_rebuilding_after_unpublishing_chooses_previous_then_empty_state(self):
        self.write_entry("2026-11-03", "EARLIER_BODY")
        self.write_entry("2026-11-09", "LATEST_BODY")
        build(self.config)
        self.assertIn("LATEST_BODY", self.read("now/index.html"))
        self.write_entry("2026-11-09", "PRIVATE_DRAFT", draft=True)
        build(self.config)
        self.assertIn("EARLIER_BODY", self.read("now/index.html"))
        self.assertNotIn("LATEST_BODY", self.read("now/index.html"))
        self.assertFalse((self.site / "now/2026-11-09/index.html").exists())
        self.write_entry("2026-11-03", "ALSO_PRIVATE", draft=True)
        build(self.config)
        self.assertIn("No updates yet.", self.read("now/index.html"))
        self.assertNotIn('class="kb-now-history"', self.read("now/index.html"))
        search = json.loads(self.read("search/search_index.json"))
        self.assertFalse(any("PRIVATE" in doc["text"] for doc in search["docs"]))

    def test_invalid_date_and_non_boolean_draft_fail_clearly(self):
        for filename, metadata, expected in (
            ("2026-02-30.md", "", "YYYY-MM-DD.md"),
            ("2026-11-09.md", 'draft: "false"', "draft 必须是 true 或 false"),
        ):
            with self.subTest(filename=filename):
                path = self.now / filename
                path.write_text(f"---\n{metadata}\n---\n\nText")
                with self.assertRaisesRegex(ConfigurationError, expected):
                    build(self.config)
                path.unlink()
