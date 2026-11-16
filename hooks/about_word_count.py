"""Put the build's published content word count on the website about page."""

from material.plugins.blog.readtime.parser import ReadtimeParser
from mkdocs.plugins import event_priority

from blog_metadata import count_text


_MARKER = "<!-- site-word-count -->"


@event_priority(110)
def on_env(env, *, config, files):
    # Count before Material inserts generated tag listings into page content.
    about = files.get_file_from_path("about/website.md")
    if not about or not about.page or _MARKER not in (about.page.content or ""):
        return

    total = 0
    for file in files.documentation_pages():
        page = file.page
        if file.generated_by or file.src_uri == "404.md" or not page or not page.content:
            continue
        if page.meta.get("draft") or (page.meta.get("now_is_index") and page.meta.get("now_entry")):
            # The latest Now entry also has its own dated page.
            continue
        parser = ReadtimeParser()
        parser.skip.update(("pre", "template"))
        parser.feed(page.content)
        parser.close()
        total += sum(count_text(" ".join(parser.text)))

    formatted = f"{total:,}"
    markup = (
        '<p class="kb-site-word-count">写到现在，站里有 '
        '<span class="kb-site-word-count__value">'
        f'<span class="kb-site-word-count__spoken">{formatted}</span>'
        f'<span class="kb-site-word-count__digits" aria-hidden="true" '
        f'data-site-word-count="{total}">{formatted}</span>'
        ' 字了。</span></p>'
    )
    about.page.content = about.page.content.replace(_MARKER, markup, 1)
