"""Keep article excerpts and deployment metadata consistent."""

import re
from hashlib import blake2s
from urllib.parse import urljoin, urlsplit


_HEADING_ID = re.compile(r'(<h[1-6]\b[^>]*?\s+id=")([^"]+)(")')
_LOCAL_LINK = re.compile(r'(<a\b[^>]*?\s+href="#)([^"]+)(")')


def _scope_excerpt_ids(markup, path):
    namespace = "excerpt-" + blake2s(path.encode(), digest_size=8).hexdigest()
    anchors = {}

    def scope_heading(match):
        start, anchor, end = match.groups()
        scoped = f"{namespace}-{anchor}"
        anchors[anchor] = scoped
        return start + scoped + end

    markup = _HEADING_ID.sub(scope_heading, markup)

    def scope_link(match):
        start, anchor, end = match.groups()
        return start + anchors.get(anchor, anchor) + end

    return _LOCAL_LINK.sub(scope_link, markup)


def on_env(env, *, config, files):
    env.filters["scope_excerpt_ids"] = _scope_excerpt_ids
    return env


def on_page_context(context, *, page, config, nav):
    if page.file.src_uri == "404.md":
        page.canonical_url = None
    elif urlsplit(config.site_url or "").hostname == "kosmigen.github.io":
        page.canonical_url = urljoin(config.extra["canonical_origin"], page.url)
    return context
