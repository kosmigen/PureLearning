<div align="center">
<img alt="PureLearning" src="docs/assets/images/readme-logo.svg">
</div>

## 栏目与网址

顶部导航按主题排列，站点部署在 `/PureLearning/` 下：

| 栏目 | 内容目录 | 访问路径 |
| --- | --- | --- |
| Python | `docs/notes/python/` | `/PureLearning/notes/python/` |
| Java | `docs/notes/java/` | `/PureLearning/notes/java/` |
| 计算机基础 | `docs/fundamentals/` | `/PureLearning/fundamentals/` |
| AI | `docs/ai/` | `/PureLearning/ai/` |
| 项目 | `docs/projects/` | `/PureLearning/projects/` |
| 博客 | `docs/blog/` | `/PureLearning/blog/` |
| 关于 | `docs/about/` | `/PureLearning/about/` |

工程笔记位于 `docs/projects/engineering/`，从项目栏目进入。`docs/notes/index.md` 保留为学习导航页。

原来的 `notes/fundamentals/`、`notes/ai/` 和 `notes/engineering/` 网址由 `hooks/navigation_redirects.py` 在构建时生成跳转页，子页面也会生成对应跳转。JavaScript 跳转会保留查询参数和页面锚点。

## 文章封面

在 `docs/blog/posts/` 下文章开头的 YAML 配置中添加封面：

```yaml
---
date: 2026-10-06
image: https://example.com/cover.jpg
image_alt: 山间的小路
image_layout: side
---

# 文章标题

这里是文章摘要。

<!-- more -->

这里是文章正文。
```

- `image`：封面图片地址。可以使用完整的外部网址，也可以使用相对于 `docs/` 的站内路径，例如 `assets/images/blog/cover.jpg`。
- `image_layout`：`side` 表示右侧小图，`top` 表示上方大图；省略或填写其他值时，默认使用 `side`。
- `image_alt`：可选的图片说明。

封面用于文章列表和时间归档，点击图片可进入文章。未配置 `image` 的文章保持纯文字。封面会按固定比例裁剪显示，并在进入视野附近时加载；正文中需要展示图片时，仍使用 Markdown 插图。
