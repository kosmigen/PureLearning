from types import SimpleNamespace
import unittest

from hooks.blog_metadata import on_page_markdown


class BlogCoverMetadataTests(unittest.TestCase):
    def page(self, metadata):
        return SimpleNamespace(
            file=SimpleNamespace(src_uri="blog/posts/example.md"),
            meta=metadata,
            config=SimpleNamespace(readtime=1),
        )

    def test_misspelled_layout_reports_the_correct_field(self):
        page = self.page({"image": "assets/cover.jpg", "iamge_layout": "top"})
        with self.assertLogs("mkdocs.hooks.blog_metadata", level="WARNING") as logs:
            on_page_markdown("# Example", page=page, config={}, files=[])
        self.assertIn("blog/posts/example.md", logs.output[0])
        self.assertIn("iamge_layout", logs.output[0])
        self.assertIn("image_layout", logs.output[0])

    def test_valid_cover_layouts_do_not_warn(self):
        for layout in ("top", "side"):
            with self.subTest(layout=layout):
                page = self.page({"image": "assets/cover.jpg", "image_layout": layout})
                with self.assertNoLogs("mkdocs.hooks.blog_metadata", level="WARNING"):
                    on_page_markdown("# Example", page=page, config={}, files=[])
                self.assertEqual(page.meta["image_layout"], layout)


if __name__ == "__main__":
    unittest.main()
