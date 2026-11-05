"""Render searchable project cards from one URL per project."""

from __future__ import annotations

from urllib.parse import urlencode, urlsplit

from mkdocs.exceptions import ConfigurationError


_PREVIEW_ENDPOINT = "https://image.thum.io/get/width/1200/crop/750/noanimate/"


def on_page_markdown(markdown, *, page, config, files):
    if page.meta.get("template") != "projects.html":
        return

    items = page.meta.get("projects", [])
    if not isinstance(items, list):
        raise ConfigurationError("项目页的 projects 必须是列表")

    projects = []
    identifiers = set()
    for index, item in enumerate(items, start=1):
        if not isinstance(item, dict):
            raise ConfigurationError(f"第 {index} 个项目必须填写名称、简介和网址")
        project = {}
        for field in ("name", "description", "status", "url", "id"):
            value = item.get(field, "")
            if not isinstance(value, str):
                raise ConfigurationError(f"第 {index} 个项目的 {field} 必须是文本")
            project[field] = value.strip()
        if not project["name"] or not project["description"]:
            raise ConfigurationError(f"第 {index} 个项目缺少名称或简介")

        project["id"] = project["id"] or f"project-{index}"
        if project["id"] in identifiers:
            raise ConfigurationError(f"项目 id 重复：{project['id']}")
        identifiers.add(project["id"])

        url = project["url"]
        if url:
            try:
                parsed = urlsplit(url)
                valid = parsed.scheme in ("http", "https") and parsed.hostname
                valid = valid and not parsed.username and not parsed.password
            except ValueError:
                valid = False
            if not valid:
                raise ConfigurationError(f"项目 {project['name']} 的 url 必须是完整的 HTTP(S) 网址")
            project["preview_url"] = _PREVIEW_ENDPOINT + "?" + urlencode({"url": url})

        projects.append(project)

    template = config.theme.get_env().get_template("partials/project-cards.html")
    cards = template.render(projects=projects)
    # Rendering before Markdown conversion keeps names and descriptions searchable.
    return cards + "\n\n" + markdown
