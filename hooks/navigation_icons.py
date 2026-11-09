"""Keep navigation icons beside their directories and Markdown pages."""

from pathlib import PurePosixPath

from jinja2 import TemplateNotFound
from mkdocs.exceptions import ConfigurationError
from mkdocs.plugins import event_priority
from mkdocs_awesome_nav.nav.context import MkdocsFilesContext
from mkdocs_awesome_nav.nav.directory import RootNavDirectory
import yaml


def on_files(files, *, config):
    filename = config.plugins["awesome-nav"].config.filename
    icons = {}
    for file in files:
        path = PurePosixPath(file.src_uri)
        if path.name != filename:
            continue
        try:
            metadata = yaml.safe_load(file.content_string) or {}
        except yaml.YAMLError as error:
            raise ConfigurationError(f"{file.src_uri}: 导航配置不是有效的 YAML。") from error
        if isinstance(metadata, dict) and "icon" in metadata:
            icons[path.parent] = (metadata["icon"], file.src_uri)
    config.extra["_navigation_directory_icons"] = icons


@event_priority(90)
def on_nav(nav, *, config, files):
    # awesome-nav's resolved tree retains physical paths, which MkDocs Sections
    # discard. Pair both trees before Material inserts generated archive groups.
    # Reuse the pinned plugin's resolver so aliases and virtual groups stay exact.
    plugin = config.plugins["awesome-nav"]
    context = MkdocsFilesContext(files, plugin.config.filename)
    source = RootNavDirectory(context.root).resolve(context)
    icons = config.extra["_navigation_directory_icons"]

    def bind(items, sources, parent):
        for item, origin in zip(items, sources, strict=True):
            item.kb_nav_bound = True
            if not item.is_section:
                continue
            item.kb_nav_directory = origin.path
            if origin.path != parent and origin.path in icons:
                item.kb_nav_icon = icons[origin.path][0]
            bind(item.children, origin.children, origin.path)

    bind(nav.items, source.children, PurePosixPath("."))


def on_env(env, *, config, files):
    icons = config.extra["_navigation_directory_icons"]

    def validate(icon, source):
        if not isinstance(icon, str):
            raise ConfigurationError(f'{source}: icon 必须是图标名称，隐藏图标请使用 icon: ""。')
        if not icon:
            return
        if icon.startswith("/") or ".." in PurePosixPath(icon).parts:
            raise ConfigurationError(f"{source}: 无效的图标名称 {icon!r}。")
        try:
            env.get_template(f".icons/{icon}.svg")
        except TemplateNotFound as error:
            raise ConfigurationError(f"{source}: 找不到图标 {icon!r}。") from error

    for icon, source in icons.values():
        validate(icon, source)
    for file in files.documentation_pages():
        if file.page and "icon" in file.page.meta:
            validate(file.page.meta["icon"], file.src_uri)

    def generated_groups(item, parent):
        if item.is_page:
            return [PurePosixPath(item.file.src_uri)]
        directory = getattr(item, "kb_nav_directory", parent)
        paths = [path for child in getattr(item, "children", [])
                 for path in generated_groups(child, directory)]
        if item.is_section and not getattr(item, "kb_nav_bound", False) and paths:
            # Generated groups have no physical awesome-nav node. Match only
            # configurations below their real parent, never inherit its icon.
            matches = [path for path in icons if path != parent and path.is_relative_to(parent)
                       and all(source.is_relative_to(path) for source in paths)]
            if matches:
                path = max(matches, key=lambda path: len(path.parts))
                item.kb_nav_icon = icons[path][0]
        return paths

    # Page parents refer to the same navigation objects rendered by the theme.
    roots = {}
    for file in files.documentation_pages():
        if not file.page or not file.page.parent:
            continue
        root = list(file.page.ancestors)[-1]
        roots[id(root)] = root
    for root in roots.values():
        generated_groups(root, PurePosixPath("."))
