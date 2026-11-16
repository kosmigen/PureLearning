"""Render author-maintained bookshelves and bundle local React components."""

import json
import subprocess
from html import escape
from pathlib import Path
from tempfile import TemporaryDirectory

import yaml
from mkdocs.exceptions import ConfigurationError
from mkdocs.structure.files import File


def _format_books(source, language, class_name, options, md, **kwargs):
    try:
        books = yaml.safe_load(source)
    except yaml.YAMLError as error:
        raise ConfigurationError(f"bookshelf 书目 YAML 格式有误：{error}") from error
    if not isinstance(books, list) or not books:
        raise ConfigurationError("bookshelf 需要至少一本书。")
    for book in books:
        if (
            not isinstance(book, dict)
            or not isinstance(book.get("title"), str)
            or not book["title"].strip()
            or any(not isinstance(value, str) for value in book.values())
            or book.keys() - {"title", "author", "cover", "note"}
        ):
            raise ConfigurationError("bookshelf 每项需要文本 title，可选 author、cover、note。")

    items = []
    for book in books:
        author = f' · {escape(book["author"])}' if book.get("author") else ""
        note = f' — {escape(book["note"])}' if book.get("note") else ""
        items.append(f'<li><strong>{escape(book["title"])}</strong>{author}{note}</li>')
    data = escape(json.dumps(books, ensure_ascii=False), quote=True)
    return f'<div class="kb-bookshelf" data-bookshelf="{data}"><ul>{"".join(items)}</ul></div>'


def on_config(config):
    fences = config.mdx_configs["pymdownx.superfences"]["custom_fences"]
    fences.append({"name": "bookshelf", "class": "kb-bookshelf", "format": _format_books})
    return config


def on_files(files, *, config):
    root = Path(config.config_file_path).parent
    background = config.extra.get("home_background_entry")
    entries = [background] if background else []
    with TemporaryDirectory() as destination:
        try:
            subprocess.run(
                [
                    "node", "node_modules/esbuild/bin/esbuild",
                    "bookshelf=frontend/bookshelf/Bookshelf.jsx",
                    "skills-wall=frontend/skills/SkillsWall.jsx",
                    *entries,
                    "--bundle", "--splitting", "--minify", "--format=esm", "--jsx=automatic",
                    "--legal-comments=inline",
                    f"--outdir={destination}",
                ],
                cwd=root,
                capture_output=True,
                text=True,
                check=True,
            )
        except OSError as error:
            raise ConfigurationError("构建页面组件需要 Node.js 和 npm ci --ignore-scripts。") from error
        except subprocess.CalledProcessError as error:
            raise ConfigurationError(f"页面组件构建失败。请确认已运行 npm ci --ignore-scripts。\n{error.stderr}") from error
        for asset in Path(destination).iterdir():
            files.append(File.generated(config, f"assets/{asset.name}", content=asset.read_bytes()))
    licenses = {
        "react": "LICENSE",
        "react-dom": "LICENSE",
        "scheduler": "LICENSE",
        "motion": "LICENSE.md",
        "motion-dom": "LICENSE.md",
        "motion-utils": "LICENSE.md",
    }
    for dependency, filename in licenses.items():
        files.append(File.generated(
            config, f"assets/licenses/{dependency}.txt",
            abs_src_path=str(root / "node_modules" / dependency / filename),
        ))
