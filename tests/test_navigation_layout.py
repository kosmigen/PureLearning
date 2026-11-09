"""Check rendered navigation contracts shared by desktop and mobile."""

from collections import Counter
from html.parser import HTMLParser
from pathlib import Path
import tempfile
import unittest
from urllib.parse import urljoin

from mkdocs.commands.build import build
from mkdocs.config import load_config


class PageNavigation(HTMLParser):
    def __init__(self, source):
        super().__init__()
        self.menus = {}
        self.stack = []
        self.link = None
        self.ids = []
        self.toc_buttons = []
        self.drawer_toc_controls = []
        self.mobile_groups = []
        self.mobile_links = []
        self.group = None
        self.feed(source)

    def handle_starttag(self, tag, attributes):
        attrs = dict(attributes)
        classes = attrs.get("class", "").split()
        if attrs.get("id"):
            self.ids.append(attrs["id"])
        if tag == "nav":
            kind = next((name for name in (
                "kb-site-navigation", "kb-navigation--mobile", "kb-navigation--desktop"
            ) if name in classes), None)
            self.stack.append({"kind": kind, "links": []})
        if tag == "a":
            self.link = None
            if self.stack:
                menu = self.stack[-1]
                mobile = any(frame["kind"] == "kb-navigation--mobile" for frame in self.stack)
                root_link = menu["kind"] == "kb-site-navigation" or (
                    menu["kind"] in ("kb-navigation--mobile", "kb-navigation--desktop")
                    and "md-nav__link" in classes
                )
                if root_link or (mobile and "md-nav__link" in classes):
                    self.link = {"href": attrs["href"], "text": ""}
                    if root_link:
                        menu["links"].append(self.link)
                    if mobile:
                        self.mobile_links.append(self.link)
        if tag == "label" and "kb-mobile-section-title" in classes:
            self.group = {"attrs": attrs, "text": "", "has_icon": False}
            self.mobile_groups.append(self.group)
        if tag == "svg" and self.group is not None:
            self.group["has_icon"] = True
        if tag == "button" and "md-sidebar-button" in classes:
            self.toc_buttons.append(attrs)
        if tag == "label" and attrs.get("for") == "__toc" and any(
            frame["kind"] in ("kb-navigation--mobile", "kb-navigation--desktop")
            for frame in self.stack
        ):
            self.drawer_toc_controls.append(attrs)

    def handle_data(self, data):
        if self.link is not None:
            self.link["text"] += data
        if self.group is not None:
            self.group["text"] += data

    def handle_endtag(self, tag):
        if tag == "a":
            self.link = None
        if tag == "label":
            self.group = None
        if tag == "nav":
            menu = self.stack.pop()
            if menu["kind"]:
                self.menus[menu["kind"]] = menu["links"]


class NavigationLayoutTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temporary = tempfile.TemporaryDirectory()
        cls.addClassCleanup(cls.temporary.cleanup)
        repository = Path(__file__).resolve().parents[1]
        cls.config = load_config(
            str(repository / "mkdocs.yml"), strict=True, site_dir=cls.temporary.name
        )
        build(cls.config)
        cls.site = Path(cls.temporary.name)

    def test_menus_use_header_labels_order_and_targets(self):
        sections = self.config.extra["site_navigation"]
        pages = [Path("index.html"), *[
            Path(section["url"]) / "index.html" for section in sections
        ]]
        pages += [next(path.relative_to(self.site) for path in self.site.glob(
            "blog/*/*/*/*/index.html"
        ))]
        expected = [(section["title"], urljoin(self.config.site_url, section["url"]))
                    for section in sections]
        for path in pages:
            with self.subTest(page=str(path)):
                page = PageNavigation((self.site / path).read_text())
                base = urljoin(self.config.site_url, path.as_posix())
                for kind in ("kb-site-navigation", "kb-navigation--desktop"):
                    actual = [(link["text"].strip(), urljoin(base, link["href"]))
                              for link in page.menus[kind]]
                    self.assertEqual(actual, expected)
                self.assertEqual([group["text"].strip() for group in page.mobile_groups],
                                 [section["title"] for section in sections])
                self.assertFalse(page.menus["kb-navigation--mobile"])
                reachable = {urljoin(base, link["href"]) for link in page.mobile_links}
                self.assertTrue({url for _, url in expected}.issubset(reachable))
                self.assertFalse(page.drawer_toc_controls)
                navigation_ids = [identifier for identifier in page.ids if identifier.startswith("__")]
                self.assertEqual(len(navigation_ids), len(set(navigation_ids)))

    def test_mobile_section_headings_only_expand_and_have_no_leading_icons(self):
        page = PageNavigation((self.site / "index.html").read_text())
        self.assertEqual(len(page.mobile_groups), len(self.config.extra["site_navigation"]))
        for group in page.mobile_groups:
            self.assertFalse(group["has_icon"])
            self.assertNotIn("href", group["attrs"])
            self.assertTrue(group["attrs"]["for"].startswith("__mobile_nav_"))
            self.assertEqual(Counter(page.ids)[group["attrs"]["for"]], 1)

    def test_article_toc_has_its_own_accessible_button(self):
        paths = [Path("notes/Java/basics/syntax/index.html")]
        paths += [path.relative_to(self.site)
                  for path in self.site.glob("blog/*/*/*/*/index.html")
                  if 'data-md-component="toc"' in path.read_text()]
        for path in paths:
            with self.subTest(page=str(path)):
                page = PageNavigation((self.site / path).read_text())
                self.assertEqual(len(page.toc_buttons), 1)
                button = page.toc_buttons[0]
                self.assertEqual(button["type"], "button")
                self.assertEqual(button["aria-label"], "On this page")
                self.assertEqual(button["aria-expanded"], "false")
                self.assertEqual(Counter(page.ids)[button["aria-controls"]], 1)

    def test_pages_without_toc_have_no_floating_control(self):
        for path in ("index.html", "projects/index.html", "404.html"):
            with self.subTest(page=path):
                page = PageNavigation((self.site / path).read_text())
                self.assertFalse(page.toc_buttons)
