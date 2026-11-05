# 仓库共享工作规范

本文件供 Claude Code、Codex 和其他代码代理共同使用。`CLAUDE.md` 与 `AGENTS.md` 是读取本文件的入口，不再分别维护项目架构说明。用户当前的明确要求优先于本文的一般约定。

## 工作方式

- 默认使用中文沟通。先理解用户是在讨论、询问，还是要求实施，不把讨论自动变成代码修改。
- 开始前检查 `git status --short` 和相关差异，保留用户已有的修改、未跟踪文件和未完成内容。移动目录时也要保留其中的未跟踪文件及其内容。
- 按任务完成必要修改和验证；不要顺带重写无关页面、升级依赖或更换现有设计。
- 用户要求提交或推送时，只纳入已授权的相关变更，检查暂存差异后再提交。推送 `main` 会触发部署。
- 本地预览按任务需要启动；明确区分用户已有服务和自己启动的临时验证服务，结束时清理自己的临时服务。用户要求关闭服务时，确认对应进程和端口后停止。

## 项目与命令

PureLearning 是基于 Material for MkDocs 的个人知识站，主要使用中文 Markdown、Jinja2 模板、CSS 和少量 JavaScript/Python hooks。依赖以 `requirements.txt` 为准。

优先使用仓库现有虚拟环境。仅在 `.venv/` 不存在时创建；已有环境缺少依赖时，只执行安装命令：

```sh
# 仅在虚拟环境不存在时执行
python3 -m venv .venv

# 需要安装或补齐项目依赖时执行
.venv/bin/python -m pip install -r requirements.txt
```

常用命令（从仓库根目录执行）：

```sh
# 严格构建，与 CI 的构建模式一致
.venv/bin/mkdocs build --strict

# 使用独立目录验证，避免覆盖其他预览正在使用的构建输出
.venv/bin/mkdocs build --strict --site-dir /tmp/purelearning-check

# 本地预览，访问 http://127.0.0.1:8000/PureLearning/
.venv/bin/mkdocs serve --dev-addr 127.0.0.1:8000

# 修改 JavaScript 模块后的语法检查示例
node --check docs/assets/javascripts/site-navigation.mjs
```

`site/` 是被 Git 忽略的生成目录，修改源文件后重新构建，不直接编辑生成页面。

`--strict` 将构建警告视为错误，但不能代替所有链接和浏览器检查。未列入导航的页面可能仅产生 INFO；硬编码 HTML 链接、交互和布局还需要按改动检查。

## 内容目录与网址

站点地址为 `https://kosmigen.github.io/PureLearning/`。站内链接必须考虑 `/PureLearning/` 这一部署前缀。

顶部顺序：**博客 → 文档 → 项目 → 关于**。首页通过左上角站点名称或标志返回；文档首页与左侧栏目使用“技术文档”。

| 栏目 | 内容目录 | 当前访问路径 |
| --- | --- | --- |
| 博客 | `docs/blog/` | `/PureLearning/blog/` |
| 文档 | `docs/notes/index.md` | `/PureLearning/notes/` |
| 项目 | `docs/projects/` | `/PureLearning/projects/` |
| 关于 | `docs/about/` | `/PureLearning/about/` |
| 文档 / C | `docs/notes/c/` | `/PureLearning/notes/c/` |
| 文档 / Python | `docs/notes/python/` | `/PureLearning/notes/python/` |
| 文档 / Java | `docs/notes/java/` | `/PureLearning/notes/java/` |
| 文档 / 计算机基础 | `docs/fundamentals/` | `/PureLearning/fundamentals/` |
| 文档 / AI | `docs/ai/` | `/PureLearning/ai/` |

- C、Python、Java、计算机基础和 AI 都属于“技术文档”。三门语言保留在 `notes/` 下，基础和 AI 保留当前目录；导航合并不移动文件或修改已有网址。以后框架与工具文档可继续放在 `notes/` 下，并按需加入导航。
- 工程笔记位于 `docs/projects/engineering/`，属于项目栏目。
- `docs/projects/index.md` 是隐藏左右侧栏的项目卡片展示页。使用 Web Awesome 卡片，省略页内标题和开发记录。项目列表在该文件的 `projects` 元数据中维护；每项的 `url` 同时用于自动首页缩略图和网站入口，新增示例见 `handbook/网站内容编辑手册.md`；工程笔记子页面保留文档布局。
- `docs/notes/index.md` 是顶部“文档”的入口页，标题为“技术文档”。
- `docs/index.md` 是首页，目前是个人介绍和插画，不是 SVG 学习路线图。
- 普通知识文档按主题组织；博客用于完整文章、随笔。不要把所有普通文档都假定为 `docs/notes/` 下的内容。

## 导航与路径修改

导航没有写在 `mkdocs.yml` 的 `nav` 字段中，而是由 `mkdocs-awesome-nav` 读取分散的 `.nav.yml` 生成。

| 需要修改的内容 | 对应位置 |
| --- | --- |
| Material 导航结构、左侧顶层栏目名称 | `docs/.nav.yml` |
| 栏目内的页面、顺序和子栏目 | 各内容目录的 `.nav.yml` |
| 自定义顶部导航名称、顺序、目标网址 | `overrides/partials/header.html` 的 `sections` |
| 页脚导航 | `overrides/partials/footer.html` |
| 默认页面的元数据和正文标题 | 对应 `index.md` 的 `title` 与一级标题（如果有） |
| 即时导航、前进后退后的选中状态 | `docs/assets/javascripts/site-navigation.mjs`；读取顶部链接的 `data-site-paths` |

- “文档”的路径别名包括 `notes/`、`fundamentals/` 和 `ai/`，由 `header.html` 的 `sections` 同时生成服务端选中状态及 `data-site-paths`，客户端基于 `data-site-root` 解析路径。新增其他物理目录下的文档分类时，同步补充这些别名。
- 顶部文字和左侧名称独立配置。只修改 `.nav.yml` 标签不会自动修改自定义顶部导航；改栏目时检查顶部、左侧、页脚和文档链接是否需要一起更新。
- `navigation.indexes` 将栏目 `index.md` 合并为可点击的栏目入口。栏目名称与页面正文标题可以不同。
- 显式列出页面且没有通配规则的 `.nav.yml`，新增页面时要按需更新列表，不能假定自动进入侧栏。
- 标签改名不等于路径迁移。仅调整导航层级时，不必移动目录；用户要求修改网址时，再同步目录、导航、站内链接和旧地址兼容。
- Markdown 内部链接优先指向相对 `.md` 源文件；Jinja2 模板中的站内路径通过 `| url` 处理。不要把部署域名或错误的根路径硬编码进普通站内链接。
- `docs/.nav.yml` 的 `ignore: 404.md` 只使它不进入导航；`docs/404.md` 仍会构建，并由 `overrides/404.html` 提供真正的站点 404 内容。
- 未列入导航不代表不构建或不发布。普通 Markdown 文档不能仅靠 `.nav.yml` 隐藏来实现草稿隔离。

### 旧网址兼容

`hooks/navigation_redirects.py` 在 `on_post_build` 为已构建的子页面生成旧路径跳转：

| 旧路径（相对站点根） | 新路径（相对站点根） |
| --- | --- |
| `notes/fundamentals/` | `fundamentals/` |
| `notes/ai/` | `ai/` |
| `notes/engineering/` | `projects/engineering/` |

跳转页包含 canonical、JavaScript 跳转、meta refresh 和普通链接。JavaScript 跳转保留查询参数和锚点；无 JavaScript 时的回退只保证到达新页面。新增迁移时检查嵌套页面、部署前缀及旧书签，不直接删除兼容入口。

## 博客写作约定

- 文章放在 `docs/blog/posts/`，当前按年月建子目录。发布网址由 `post_url_format: "{date}/{slug}"` 决定，不能根据源文件目录猜测文章网址。
- Front matter 必须有合法的 `date`；`categories`、封面和显式 `authors` 都按需填写，不是全部必填。
- 当前 Tags 插件配置 `tags_name_property: categories`，因此标签填写在复数 `categories` 中。不需要再重复填写 `tags`；单数 `category` 也不是当前标签字段。
- 博客插件的 `categories: false` 关闭的是分类页面。当前仍有 Tags 页面、时间归档、分页和阅读时长，不要误写成会生成分类归档。
- `<!-- more -->` 是摘要分界，放在摘要之后、正文之前。
- `draft: true` 的文章默认不进入生产构建；当前 Material 默认 `draft_on_serve: true`，因此 `mkdocs serve` 会显示博客草稿。这条规则只适用于博客插件管理的文章。
- `docs/blog/posts/.meta.yml` 提供默认作者 ID。展示名称、简介和头像在 `docs/blog/.authors.yml` 修改；点击作者后的完整介绍页是 `docs/about/author.md`。显示名称与内部作者 ID 不要混淆。
- 博客阅读页采用正文与右侧目录两列，不显示左侧信息栏。作者、日期、字数与阅读时间位于标题下方，作者简介渲染为引用块，标签单独一行；上一篇、下一篇位于文末。窄屏使用可展开的本文目录。
- 封面使用 `image`，可配 `image_alt`、`image_layout: side` 或 `top`；默认右侧小图。封面用于列表和时间归档，正文插图仍使用 Markdown。完整写作与元数据说明见 `handbook/网站内容编辑手册.md`。

文章示例（日期替换为实际发布日期，`categories` 可省略）：

```markdown
---
date: 2026-10-30
categories:
  - 学习
---

# 文章标题

这里是摘要。

<!-- more -->

这里是正文。
```

## 主题、样式与 hooks

`mkdocs.yml` 的 `theme.custom_dir` 指向 `overrides/`。优先修改已有覆盖模板，保留 Material 的页面内容、搜索、目录与即时导航机制。

| 文件 | 职责 |
| --- | --- |
| `overrides/blog.html`、`overrides/partials/post.html` | 博客列表、摘要与可选封面 |
| `overrides/blog-post.html`、`overrides/partials/content.html` | 博客正文布局、元信息与文章切换 |
| `overrides/partials/blog-post-meta.html` | 标题下方的作者、日期、统计、简介引用块和标签 |
| `overrides/404.html` | 复用 `docs/404.md` 的自定义 404 |
| `docs/assets/stylesheets/extra.css` | 文档阅读样式与全站基础覆盖 |
| `docs/assets/stylesheets/tokens.css` | 全站字体、字号、间距与明暗配色变量 |
| `docs/assets/stylesheets/site.css` | 主题色与顶部导航 |
| `docs/assets/stylesheets/home.css` | 首页布局与插画 |
| `overrides/projects.html`、`overrides/partials/project-cards.html` | 项目展示页和卡片，不插入文档默认标题 |
| `docs/assets/stylesheets/projects.css` | 项目卡片配色、响应式网格和组件未加载时的基础布局 |
| `docs/assets/javascripts/projects.mjs` | 按需加载本地组件、处理预览成功和失败，兼容即时导航 |
| `hooks/project_cards.py` | 校验项目元数据，在 Markdown 转换前生成可搜索卡片；根据网址生成 thum.io 首页预览地址 |
| `docs/assets/stylesheets/blog.css` | 博客列表、正文、右侧目录和响应式排版 |
| `docs/assets/stylesheets/footer.css` | 页脚布局与粒子画布活动空间 |
| `hooks/blog_metadata.py` | 中英文混合字数与阅读时长；显式 `readtime` 优先 |
| `hooks/diagrams.py` | 为 Mermaid 添加滚动容器，横向流程图可拖动 |
| `hooks/navigation_redirects.py` | 已迁移网址的兼容跳转页 |

样式加载入口是 `mkdocs.yml` 的 `extra_css`，同时存在 CSS 内部导入：`extra.css` → `tokens.css` → `reading-fonts.css`，以及 `blog.css` → `blog-fonts.css`。不要把导入文件又重复加入页面。

全站使用中性白、浅灰和深灰作为大面积底色，使用 VitePress 风格的蓝色作为强调色。按用户偏好避免恢复米黄底色和泛黄的纸张色调；配色统一维护在 `tokens.css` 中。

文档阅读、博客正文、首页和界面文字有各自的字体与字号作用域。博客正文使用自托管 Charter；更换字体或资源时保留对应授权文件，不把不同字体的许可证混用。

Web Awesome 3.14.0 的 Card、Badge 及其依赖保存在 `docs/assets/javascripts/vendor/webawesome/`，组件不使用外部 CDN；项目首页缩略图通过 thum.io 自动生成并缓存，首次生成或服务异常不应阻止访问网站。该目录的 `theme.css` 从官方主题提取声明并限定在 `.kb-projects` 内；更新组件时同时核对依赖、主题和许可证，不保留未使用组件。

`handbook/` 存放仓库维护和内容编辑说明，不在 `docs/` 内，不会发布到网站。日常写作统一查阅 `handbook/网站内容编辑手册.md`；更新写作能力或元数据处理时同步维护手册。`README.md` 保留项目入口、目录分工和快速启动，避免重复维护长篇写作说明。

修改 JavaScript 时考虑 Material 即时导航的 `document$` 生命周期，清理旧动画、监听器和 observers。动画应尊重减少动态效果设置，离屏时停止不必要的工作。页脚粒子应在画布内完整绘制，博客右侧目录应在正文边界前避让页脚。

## 验证与部署

按改动选择必要检查，不为简单文案改动新增复杂测试，也不把构建成功当作所有交互都已验证：

1. 检查任务相关差异和 `git diff --check`。
2. 文档、配置或模板改动运行严格构建；确认 warning 和 INFO 的实际含义。
3. 导航或网址改动核对顶部、侧栏、页脚、所有相关站内链接、canonical 和旧地址跳转。验证即时导航及后退后的选中状态；迁移还要验证嵌套页面和查询参数、锚点。
4. 布局改动检查桌面与手机，必要时覆盖 320、390、1024、1440 像素宽度；确认导航不越界、内容不遮挡、页面不产生意外横向溢出。
5. JavaScript 改动运行相应 `node --check`，并验证受影响交互。纯协作说明文件的修改以事实、路径、命令及规则一致性核对为主。

GitHub Pages 部署由 `.github/workflows/deploy-pages.yml` 管理：推送 `main` 或手动触发工作流，使用 Python 3.13，安装 `requirements.txt`，执行 `mkdocs build --strict`，上传 `site/` 后部署。当前 `cancel-in-progress: false`，后续触发不会按此设置自动取消正在执行的同组工作流。

## CodeGraph

仅当仓库根目录存在 `.codegraph/` 时，理解或定位代码前优先使用 CodeGraph；没有该目录时直接跳过，不自行建立索引。

- MCP 可用时先用 `codegraph_explore`，查询中说明文件、符号或具体问题。
- Shell 方式：`codegraph explore "符号名或问题"`。
- 没有索引时优先使用 `rg`、`rg --files` 和针对性的文件读取。
