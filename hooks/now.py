"""Publish dated Now snapshots and show the latest one at /now/."""

from datetime import date
from pathlib import PurePosixPath
import posixpath
import re
from urllib.parse import urlsplit, urlunsplit

from markdown.extensions import Extension
from markdown.treeprocessors import Treeprocessor

from mkdocs.exceptions import ConfigurationError
from mkdocs.plugins import event_priority
from mkdocs.utils.meta import get_data


class NowRelativeLinks(Treeprocessor):
    def __init__(self, md, source, target):
        super().__init__(md)
        self.source = posixpath.dirname(source)
        self.target = posixpath.dirname(target)

    def run(self, root):
        for element in root.iter():
            key = "href" if element.tag == "a" else "src" if element.tag == "img" else None
            url = element.get(key) if key else None
            if not url:
                continue
            parts = urlsplit(url)
            if parts.scheme or parts.netloc or not parts.path or url.startswith(("/", "\\")):
                continue
            path = posixpath.relpath(posixpath.join(self.source, parts.path), self.target)
            element.set(key, urlunsplit(parts._replace(path=path)))


class NowLinksExtension(Extension):
    def __init__(self, config):
        super().__init__()
        self.site_config = config

    def extendMarkdown(self, md):
        page = self.site_config._current_page
        entry = page.meta.get("now_entry") if page else None
        if page and page.meta.get("now_is_index") and entry:
            # Resolve copied Markdown from its original directory before MkDocs
            # validates links and converts them to published URLs (priority 0).
            md.treeprocessors.register(
                NowRelativeLinks(md, entry["source"], page.file.src_uri), "now_links", 1
            )


def on_config(config):
    config.markdown_extensions.append(NowLinksExtension(config))


@event_priority(100)
def on_files(files, *, config):
    entries = []
    dates = {}
    for file in list(files):
        path = PurePosixPath(file.src_uri)
        if not path.is_relative_to("now") or not file.is_documentation_page() or file.src_uri == "now/index.md":
            continue

        try:
            match = re.fullmatch(r"(\d{4})-(\d{1,2})-(\d{1,2})", path.stem)
            if not match:
                raise ValueError
            published = date(*(int(part) for part in match.groups()))
        except ValueError as error:
            raise ConfigurationError(f"{file.src_uri}: Now 文件请使用 YYYY-MM-DD.md 命名。") from error

        markdown, metadata = get_data(file.content_string)
        draft = metadata.get("draft", False)
        if not isinstance(draft, bool):
            raise ConfigurationError(f"{file.src_uri}: draft 必须是 true 或 false。")
        if draft:
            # Remove drafts before navigation, search and output are generated.
            files.remove(file)
            continue

        if published in dates:
            raise ConfigurationError(
                f"Now 日期重复：{dates[published]} 与 {file.src_uri} 都是 {published.isoformat()}。"
            )
        dates[published] = file.src_uri

        title = metadata.get("title", published.isoformat())
        if not isinstance(title, str) or not title.strip():
            raise ConfigurationError(f"{file.src_uri}: title 必须是非空文本。")
        entries.append({
            "source": file.src_uri,
            "url": file.url,
            "date": published.isoformat(),
            "title": title,
            "markdown": markdown,
        })

    # Recreate this list on every build so serving also picks up deletions/drafts.
    config.extra["_now_entries"] = sorted(entries, key=lambda entry: entry["date"], reverse=True)


@event_priority(100)
def on_page_markdown(markdown, *, page, config, files):
    if not PurePosixPath(page.file.src_uri).is_relative_to("now"):
        return

    entries = config.extra["_now_entries"]
    is_index = page.file.src_uri == "now/index.md"
    current = (entries[0] if entries else None) if is_index else next(
        entry for entry in entries if entry["source"] == page.file.src_uri
    )
    page.meta.update({
        "template": "now.html",
        "hide": ["navigation", "toc"],
        "now_entries": entries,
        "now_entry": current,
        "now_is_index": is_index,
    })
    if is_index and current:
        return current["markdown"]
