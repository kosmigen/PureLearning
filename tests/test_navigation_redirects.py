from html import unescape
from pathlib import Path
import re
import tempfile
import unittest
from urllib.parse import urljoin

from hooks.navigation_redirects import on_post_build


class NavigationRedirectTests(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.site = Path(temporary.name)
        self.config = {
            "site_dir": str(self.site),
            "site_url": "https://example.test/PureLearning/",
            "use_directory_urls": True,
        }

    def page(self, path, content="Current page"):
        page = self.site / path
        page.parent.mkdir(parents=True, exist_ok=True)
        page.write_text(content, encoding="utf-8")
        return page

    def assertRedirect(self, previous, current):
        text = (self.site / previous).read_text(encoding="utf-8")
        canonical = re.search(r'<link rel="canonical" href="([^"]+)"', text)[1]
        fallback = re.search(r'<a href="([^"]+)"', text)[1]
        expected = urljoin(self.config["site_url"], current)
        self.assertEqual(unescape(canonical), expected)
        original = urljoin(self.config["site_url"], previous.removesuffix("index.html"))
        self.assertEqual(urljoin(original, unescape(fallback)), expected)

    def test_ai_and_nested_pages_use_current_directory(self):
        self.page("notes/AI/index.html")
        self.page("notes/AI/topics/example/index.html")

        on_post_build(config=self.config)

        self.assertRedirect("ai/index.html", "notes/AI/")
        self.assertRedirect("ai/topics/example/index.html", "notes/AI/topics/example/")
        self.assertEqual((self.site / "notes/AI/index.html").read_text(), "Current page")

    def test_retired_fundamentals_use_available_entries(self):
        self.page("notes/index.html")
        self.page("notes/CSAPP/index.html")

        on_post_build(config=self.config)

        for prefix in ("fundamentals", "notes/fundamentals"):
            self.assertRedirect(f"{prefix}/index.html", "notes/")
            self.assertRedirect(f"{prefix}/computer-systems/index.html", "notes/CSAPP/")
            for topic in ("algorithms", "databases", "networks", "operating-systems"):
                self.assertRedirect(f"{prefix}/{topic}/index.html", "notes/")

    def test_case_aliases_preserve_current_pages(self):
        for name in ("C", "Python", "Java", "AI"):
            canonical = self.page(f"notes/{name}/index.html", f"Current {name}")
            on_post_build(config=self.config)

            self.assertEqual(canonical.read_text(), f"Current {name}")
            alias = self.site / f"notes/{name.lower()}/index.html"
            if not alias.samefile(canonical):
                self.assertRedirect(f"notes/{name.lower()}/index.html", f"notes/{name}/")

    def test_alias_to_same_file_does_not_overwrite_content(self):
        canonical = self.page("notes/AI/index.html", "AI content")
        (self.site / "ai").symlink_to(self.site / "notes/AI", target_is_directory=True)

        on_post_build(config=self.config)

        self.assertEqual(canonical.read_text(), "AI content")

    def test_existing_legacy_redirect_is_updated(self):
        self.page("notes/AI/index.html")
        self.page("ai/index.html", "Stale legacy redirect")

        on_post_build(config=self.config)

        self.assertRedirect("ai/index.html", "notes/AI/")

    def test_missing_targets_do_not_create_redirects(self):
        on_post_build(config=self.config)

        self.assertEqual(list(self.site.rglob("*.html")), [])

    def test_file_urls_keep_index_filename(self):
        self.page("notes/AI/index.html")
        self.config["use_directory_urls"] = False

        on_post_build(config=self.config)

        self.assertRedirect("ai/index.html", "notes/AI/index.html")


if __name__ == "__main__":
    unittest.main()
