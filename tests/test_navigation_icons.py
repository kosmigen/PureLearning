"""Exercise local icon settings through real navigation and rendered rows."""

from html.parser import HTMLParser
from pathlib import Path
import shutil
import tempfile
import unittest

from mkdocs.commands.build import build
from mkdocs.config import load_config
from mkdocs.exceptions import ConfigurationError


class IconRows(HTMLParser):
    def __init__(self, html):
        super().__init__()
        self.rows = []
        self.row = None
        self.tag = None
        self.primary = []
        self.feed(html)

    def handle_starttag(self, tag, attributes):
        attrs = dict(attributes)
        classes = attrs.get("class", "").split()
        if tag == "nav":
            self.primary.append(bool(self.primary and self.primary[-1]) or any(
                name in classes for name in ("kb-navigation--desktop", "kb-navigation--mobile")
            ))
        if tag in ("a", "label") and "md-nav__link" in classes and self.primary and self.primary[-1]:
            self.row = {"text": "", "icons": [], "classes": classes}
            self.tag = tag
        elif tag == "svg" and self.row is not None:
            self.row["icons"].extend(classes)

    def handle_data(self, data):
        if self.row is not None:
            self.row["text"] += data

    def handle_endtag(self, tag):
        if self.row is not None and tag == self.tag:
            self.row["text"] = self.row["text"].strip()
            self.rows.append(self.row)
            self.row = None
        if tag == "nav":
            self.primary.pop()


class NavigationIconTests(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.root = Path(temporary.name)
        self.docs = self.root / "docs"
        self.site = self.root / "site"
        self.repository = Path(__file__).resolve().parents[1]
        self.write("index.md", "# Home")
        self.write(".nav.yml", "nav:\n  - index.md\n  - Renamed directory: guide\n")
        self.write("guide/.nav.yml", "icon: lucide/coffee\nnav:\n  - start.md\n"
                   "  - Renamed page: page.md\n  - hidden.md\n  - plain.md\n"
                   "  - Indexed: indexed\n  - Hidden folder: hidden-folder\n"
                   "  - Single folder: single\n  - Virtual group:\n    - virtual.md\n")
        self.write("guide/start.md", "# Start")
        self.write("guide/page.md", "---\nicon: lucide/brain\n---\n\n# Page")
        self.write("guide/hidden.md", '---\nicon: ""\n---\n\n# Hidden page')
        self.write("guide/plain.md", "# Plain page")
        self.write("guide/virtual.md", "# Virtual page")
        self.write("guide/indexed/.nav.yml", "icon: lucide/cpu\n")
        self.write("guide/indexed/index.md", "---\nicon: lucide/coffee\n---\n\n# Index")
        self.write("guide/indexed/other.md", "# Other")
        self.write("guide/hidden-folder/.nav.yml", 'icon: ""\n')
        self.write("guide/hidden-folder/index.md", "---\nicon: lucide/coffee\n---\n\n# Index")
        self.write("guide/single/.nav.yml", "icon: lucide/wrench\n")
        self.write("guide/single/only.md", "# Only page")
        self.config = load_config(
            str(self.repository / "mkdocs.yml"), strict=True,
            docs_dir=str(self.docs), site_dir=str(self.site),
            plugins=["search", "awesome-nav", "meta"],
            extra={"site_navigation": [{"id": "guides", "title": "Guides", "title_en": "Guides",
                                       "url": "guide/start/", "paths": ["guide/"]}]},
        )

    def write(self, path, text):
        target = self.docs / path
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(text)

    def rows(self, path="guide/start/index.html"):
        return IconRows((self.site / path).read_text()).rows

    def assert_icon(self, rows, title, icon):
        matching = [row for row in rows if row["text"] == title
                    and "kb-mobile-section-title" not in row["classes"]]
        self.assertTrue(matching, title)
        for row in matching:
            self.assertIn("lucide-" + icon, row["icons"], row)

    def test_directory_and_page_icons_survive_aliases_without_inheriting_into_children(self):
        build(self.config)
        rows = self.rows()
        for title, icon in (("Guides", "coffee"), ("Renamed page", "brain"),
                            ("Plain page", "file-text"), ("Indexed", "cpu"),
                            ("Single folder", "wrench"), ("Only page", "file-text"),
                            ("Virtual group", "folder"), ("Virtual page", "file-text")):
            self.assert_icon(rows, title, icon)

    def test_empty_icons_hide_pages_and_directories_including_indexed_ones(self):
        build(self.config)
        rows = self.rows()
        for title in ("Hidden page", "Hidden folder"):
            matching = [row for row in rows if row["text"] == title]
            self.assertTrue(matching)
            self.assertTrue(all(not row["icons"] for row in matching))

    def test_new_icon_can_be_selected_without_adding_an_svg(self):
        self.write("guide/page.md", "---\nicon: lucide/rocket\n---\n\n# Page")
        build(self.config)
        self.assert_icon(self.rows(), "Renamed page", "rocket")
        self.assertFalse((self.repository / "overrides/.icons/lucide/rocket.svg").exists())
        self.assertFalse((self.site / "node_modules").exists())
        self.assertFalse(list(self.site.rglob("rocket.svg")))
        self.assertEqual((self.site / "assets/licenses/lucide.txt").read_text(),
                         (self.repository / "node_modules/lucide-static/LICENSE").read_text())

    def test_moving_and_renaming_a_directory_keeps_its_own_icon(self):
        shutil.move(self.docs / "guide", self.docs / "moved")
        self.write(".nav.yml", "nav:\n  - index.md\n  - Another name: moved\n")
        section = self.config.extra["site_navigation"][0]
        section.update(title="New label", url="moved/start/", paths=["moved/"])
        build(self.config)
        self.assert_icon(self.rows("moved/start/index.html"), "New label", "coffee")
        self.assert_icon(self.rows("moved/start/index.html"), "Renamed page", "brain")

    def test_bad_icon_values_report_the_source_file(self):
        for path, text, message in (
            ("guide/.nav.yml", "icon: lucide/does-not-exist\n", r"guide/.nav.yml: 找不到图标"),
            ("guide/page.md", "---\nicon: false\n---\n\n# Page", r"guide/page.md: icon 必须"),
        ):
            with self.subTest(path=path):
                original = (self.docs / path).read_text()
                self.write(path, text)
                with self.assertRaisesRegex(ConfigurationError, message):
                    build(self.config)
                self.write(path, original)

    def test_existing_site_icons_and_generated_archive_use_local_configuration(self):
        config = load_config(str(self.repository / "mkdocs.yml"), strict=True,
                             site_dir=str(self.site))
        build(config)
        self.assertNotIn("navigation_icons", config.extra)
        rows = self.rows("blog/index.html")
        self.assert_icon(rows, "时间归档", "archive")
        self.assert_icon(rows, "Tags", "tags")
        rows = self.rows("notes/overview/index.html")
        for title, icon in (("C", "code"), ("Python", "terminal"), ("Java", "coffee"),
                            ("AI", "brain"), ("CSAPP", "cpu"), ("工具", "wrench"),
                            ("overview", "book-open")):
            self.assert_icon(rows, title, icon)
