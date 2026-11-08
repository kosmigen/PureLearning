"""Compute CJK-aware word counts and reading times for blog posts."""

from __future__ import annotations

import logging
import math
import re

from mkdocs.plugins import event_priority


_POST_PATH = "blog/posts/"
log = logging.getLogger("mkdocs.hooks.blog_metadata")
_FENCED_CODE = re.compile(
    r"(?ms)^[ \t]*(?:```|~~~).*?^[ \t]*(?:```|~~~)[ \t]*$"
)
_HTML_COMMENT = re.compile(r"<!--.*?-->", re.DOTALL)
_HTML_TAG = re.compile(r"<[^>]+>")
_IMAGE = re.compile(r"!\[[^\]]*\]\([^)]*\)")
_LINK = re.compile(r"\[([^\]]+)\]\([^)]*\)")
_CJK_CHARACTER = re.compile(r"[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]")
_LATIN_WORD = re.compile(r"[A-Za-z0-9]+(?:[._+#/-][A-Za-z0-9]+)*")


def _reading_stats(markdown: str) -> tuple[int, int]:
    """Return a mixed-language word count and a reading-time estimate."""

    text = _FENCED_CODE.sub(" ", markdown)
    text = _HTML_COMMENT.sub(" ", text)
    text = _IMAGE.sub(" ", text)
    text = _LINK.sub(r"\1", text)
    text = _HTML_TAG.sub(" ", text)
    text = text.replace("`", " ")

    cjk_count = len(_CJK_CHARACTER.findall(text))
    latin_text = _CJK_CHARACTER.sub(" ", text)
    latin_count = len(_LATIN_WORD.findall(latin_text))
    word_count = cjk_count + latin_count

    # Chinese prose is commonly read faster per character than English prose
    # is read per word. Treat the two scripts separately for mixed tech notes.
    minutes = math.ceil(cjk_count / 500 + latin_count / 265)
    return word_count, max(1, minutes)


@event_priority(50)
def on_page_markdown(markdown, *, page, config, files):
    """Attach statistics before Material creates the post excerpt."""

    if not page.file.src_uri.startswith(_POST_PATH):
        return

    if "iamge_layout" in page.meta:
        log.warning(
            "%s: 封面字段 iamge_layout 拼写有误，请改为 image_layout（top 或 side）。",
            page.file.src_uri,
        )

    word_count, reading_time = _reading_stats(markdown)
    page.meta["word_count"] = word_count

    # An explicit `readtime` value in front matter always wins.
    if not page.config.readtime:
        page.config.readtime = reading_time
