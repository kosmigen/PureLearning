# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Install dependencies (after creating venv)
python -m pip install -r requirements.txt

# Start dev server — hot-reloads on changes, Chinese-language search index
mkdocs serve

# Build strictly (same as CI) — fails on broken links, missing pages, etc.
mkdocs build --strict
```

The generated `site/` directory is build output — it's gitignored and should never be edited.

## Architecture

This is a **Material for MkDocs** knowledge base — a personal Python learning site written in Chinese, deployed to GitHub Pages via GitHub Actions on every push to `main`.

### Navigation system (decentralized)

Navigation is *not* defined in `mkdocs.yml`. Each content directory contains its own `.nav.yml` file that the `mkdocs-awesome-nav` plugin reads to build that section's sidebar. The root `docs/.nav.yml` only defines the top-level sections (笔记, 项目, 文章, 关于). When adding new pages to a section, update that directory's `.nav.yml` — not `mkdocs.yml`.

Section names in `.nav.yml` are *labels*, independent of the directory names beneath them — `notes/fundamentals/` is labelled 计算机基础, `notes/engineering/` is labelled 工程笔记. Renaming a section is a one-line change to the label; the directory does not move.

### Blog vs notes (two separate content streams)

The `blog` plugin (`mkdocs.yml` line 61) manages `docs/blog/posts/` and powers the 文章 section:
- Posts live in year-month subdirectories (`posts/2026-8/YYYY-MM-DD-slug.md`)
- Posts need `date`, `categories`, and `tags` in frontmatter. The key is **`categories` (plural)** — a `category` key is silently ignored and the post lands in no category
- `<!-- more -->` marks the excerpt boundary in posts
- Drafts use `draft: true` in frontmatter — hidden in production, visible in `mkdocs serve`
- The plugin auto-generates archive pages, category pages, pagination, and reading-time estimates

`docs/notes/` (笔记) is the plain-docs knowledge base and is *not* managed by the blog plugin. The split is deliberate: 文章 holds finished writing meant to be read, 笔记 holds working notes meant to be looked up again.

### Custom CJK reading-time hook

`hooks/blog_metadata.py` is a MkDocs hook (`on_page_markdown`) that computes word counts and reading times for Chinese/Latin mixed content. It strips code fences, HTML, and images, then counts CJK characters and Latin words separately with different reading-speed constants (500 chars/min for CJK, 265 words/min for Latin). The hook runs before Material's blog plugin so it can set `page.config.readtime` and inject `word_count` into page metadata. This is registered in `mkdocs.yml` line 82.

### Template overrides

`overrides/` extends Material's default Jinja2 templates. `blog-post.html` extends `main.html` to customize blog post layout. `partials/` overrides specific partials. These follow Material's [theme extension](https://squidfunk.github.io/mkdocs-material/customization/#extending-the-theme) mechanism — the `custom_dir: overrides` in `mkdocs.yml` line 11 enables them.

### Custom CSS architecture

Four stylesheets in `docs/assets/stylesheets/`:
- `extra.css` — general site overrides
- `home-map.css` — the SVG node map on the homepage
- `blog.css` — blog-specific styling
- `tokens.css` — design tokens / CSS custom properties

These are loaded via `extra_css` in `mkdocs.yml`, not imported within CSS files.

### CI/CD

`.github/workflows/deploy-pages.yml` builds with `--strict` and deploys to GitHub Pages. Python 3.13, pip cache enabled. The workflow has `concurrency` set so a second push cancels an in-progress deploy for the same branch.

### Content organization

- `docs/notes/` — the knowledge base (笔记). Its landing page `notes/index.md` is the learning roadmap, and it doubles as the target of the homepage's 开始学习 action:
  - `notes/python/` — the language and standard library
  - `notes/fundamentals/` — language-agnostic CS basics (labelled 计算机基础): 数据结构与算法, 计算机系统, 操作系统, 计算机网络, 数据库基础
  - `notes/ai/` — ML/DL fundamentals, neural networks, AI applications
  - `notes/engineering/` — cross-cutting practices, labelled 工程笔记 (testing, typing, packaging, snippets)
- `docs/projects/` — per-project records: what it is, stack, status, goals/tradeoffs, postmortem
- `docs/blog/posts/` — polished articles (managed by blog plugin)
- `docs/about/` — site metadata: author, changelog

There is no `docs/logs/` section. Rough in-progress notes belong under `docs/notes/`.

Note: the AI section sits under 笔记 rather than at the top level so that the top nav stays a list of *containers* rather than a course catalogue of half-empty subject areas.
