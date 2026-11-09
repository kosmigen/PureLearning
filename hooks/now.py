"""Publish dated Now snapshots and show the latest one at /now/."""

from datetime import date
from pathlib import PurePosixPath

from mkdocs.exceptions import ConfigurationError
from mkdocs.plugins import event_priority
from mkdocs.utils.meta import get_data


@event_priority(100)
def on_files(files, *, config):
    entries = []
    for file in list(files):
        path = PurePosixPath(file.src_uri)
        if path.parent != PurePosixPath("now") or not file.is_documentation_page() or path.name == "index.md":
            continue

        try:
            published = date.fromisoformat(path.stem)
            if published.isoformat() != path.stem:
                raise ValueError
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
    if PurePosixPath(page.file.src_uri).parent != PurePosixPath("now"):
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
        # All snapshots share index.md's directory, so Markdown resource links
        # resolve correctly on both the permanent snapshot and latest page.
        return current["markdown"]
