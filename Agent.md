# 仓库共享工作规范

本文件供 Claude Code、Codex 和其他代码代理共同使用。`CLAUDE.md` 与 `AGENTS.md` 是读取本文件的入口，不再分别维护项目架构说明。用户当前的明确要求优先于本文的一般约定。

## 工作方式

- 默认使用中文沟通。先理解用户是在讨论、询问，还是要求实施，不把讨论自动变成代码修改。
- 开始前检查 `git status --short` 和相关差异，保留用户已有的修改、未跟踪文件和未完成内容。移动目录时也要保留其中的未跟踪文件及其内容。
- 按任务完成必要修改和验证；不要顺带重写无关页面、升级依赖或更换现有设计。
- 用户要求提交或推送时，只纳入已授权的相关变更，检查暂存差异后再提交。推送 `main` 会触发部署。
- 本地预览按任务需要启动；明确区分用户已有服务和自己启动的临时验证服务，结束时清理自己的临时服务。用户要求关闭服务时，确认对应进程和端口后停止。

## 项目与命令

kosmigen 是基于 Material for MkDocs 的个人知识站，对外品牌和署名统一使用 `kosmigen`。主要使用中文 Markdown、Jinja2 模板、CSS 和少量 JavaScript/Python hooks。Python 依赖以 `requirements.txt` 为准；Lucide 构建资源由 `package.json` 与 `package-lock.json` 固定版本。

优先使用仓库现有虚拟环境。仅在 `.venv/` 不存在时创建；已有环境缺少依赖时，只执行安装命令：

```sh
# 仅在虚拟环境不存在时执行
python3 -m venv .venv

# 需要安装或补齐项目依赖时执行
.venv/bin/python -m pip install -r requirements.txt

# 首次安装或恢复图标构建依赖（需要 Node.js，CI 使用 22）
npm ci --ignore-scripts
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
node --check docs/assets/javascripts/sidebar-state.mjs
```

`site/` 是被 Git 忽略的生成目录，修改源文件后重新构建，不直接编辑生成页面。

`--strict` 将构建警告视为错误，但不能代替所有链接和浏览器检查。未列入导航的页面可能仅产生 INFO；硬编码 HTML 链接、交互和布局还需要按改动检查。

## 内容目录与网址

站点地址为 `https://kosmigen.github.io/PureLearning/`。站内链接必须考虑 `/PureLearning/` 这一部署前缀。

顶部顺序：**博客 → 文档 → 项目 → Now → 关于**。首页通过左上角站点名称或标志返回；文档入口页标题为“技术文档”，侧栏从 overview 与各分类开始。

| 栏目 | 内容目录 | 当前访问路径 |
| --- | --- | --- |
| 博客 | `docs/blog/` | `/PureLearning/blog/` |
| 文档 | `docs/notes/overview.md` | `/PureLearning/notes/overview/` |
| 项目 | `docs/projects/` | `/PureLearning/projects/` |
| Now | `docs/now/` | `/PureLearning/now/` |
| 关于 | `docs/about/website.md` | `/PureLearning/about/website/` |
| 文档 / C | `docs/notes/C/` | `/PureLearning/notes/C/` |
| 文档 / Python | `docs/notes/Python/` | `/PureLearning/notes/Python/` |
| 文档 / Java | `docs/notes/Java/` | `/PureLearning/notes/Java/` |
| 文档 / AI | `docs/notes/AI/` | `/PureLearning/notes/AI/` |
| 文档 / CSAPP | `docs/notes/CSAPP/` | `/PureLearning/notes/CSAPP/` |
| 文档 / 工具 | `docs/notes/Tools/` | `/PureLearning/notes/Tools/` |

- 当前技术文档统一位于 `docs/notes/`，一级分类为 C、Python、Java、AI、CSAPP 和 Tools。沿用现有目录大小写；在区分大小写的部署环境中，`notes/Java/` 与 `notes/java/` 是不同路径。
- 原 `docs/ai/` 已迁入 `docs/notes/AI/`，原 `docs/fundamentals/` 及其分类已撤下，计算机系统内容以 CSAPP 为当前入口。新增框架或工具内容按主题加入现有分类，必要时再扩充 `notes/` 下的栏目。
- `docs/projects/index.md` 是隐藏左右侧栏的项目卡片展示页。使用 Web Awesome 卡片，省略页内标题和开发记录。项目列表在该文件的 `projects` 元数据中维护；每项的 `url` 同时用于自动首页缩略图和网站入口，新增示例见 `handbook/网站内容编辑手册.md`。项目栏目只维护项目展示；技术实践文档按主题放入“技术文档”。
- `docs/notes/overview.md` 是顶部“文档”的入口页，标题为“技术文档”。
- `docs/about/website.md` 是顶部“关于”和页脚 About 的入口，作者介绍仍在 `docs/about/author.md`。保留独立的普通页面，便于通过 `docs/about/.nav.yml` 分别命名“关于网站”和“关于作者”。
- 桌面侧栏的顶层分组标题由 `extra.site_navigation` 各项的 `hide_sidebar_title_on_desktop` 控制，默认 `false`，目前“文档”和“关于”启用。`nav-item.html` 根据配置的路径范围识别当前栏目，为需要隐藏的顶层分组标题添加 `kb-sidebar-title--desktop-hidden`；`sidebar.css` 通过桌面媒体查询控制显示，不依赖栏目 ID、标题文字或多层 DOM 选择器。文档侧栏直接显示 overview 与各分类；手机抽屉保留分组入口和返回标题。
- `docs/index.md` 是首页，目前是个人介绍和插画，不是 SVG 学习路线图。
- 普通知识文档按主题组织；博客用于完整文章、随笔。不要把所有普通文档都假定为 `docs/notes/` 下的内容。

## 导航与路径修改

底层页面树由 `mkdocs-awesome-nav` 自动发现，并读取各栏目目录的 `.nav.yml`。实际显示的顶层入口统一由 `extra.site_navigation` 筛选、命名和排序，`partials/nav.html` 从入口页面的祖先找到栏目树。根目录没有 `docs/.nav.yml`，不能让自动发现的公益 404、首页或英文目录名直接成为手机菜单。

| 需要修改的内容 | 对应位置 |
| --- | --- |
| 顶层菜单名称、顺序和网址 | `mkdocs.yml` 的 `extra.site_navigation`；顶部、侧栏与手机抽屉共用 |
| 栏目内的页面、顺序和子栏目 | 各内容目录的 `.nav.yml` |
| 目录与页面的侧栏图标 | 目录 `.nav.yml` 的 `icon`；页面 Markdown 顶部的 `icon` |
| 自定义顶部与页脚快速链接的名称、顺序、目标网址 | `mkdocs.yml` 的 `extra.site_navigation`；顶部显示 `title`，页脚显示 `title_en` |
| 隐藏桌面侧栏最上方的栏目标题 | `extra.site_navigation` 对应项的 `hide_sidebar_title_on_desktop: true`；手机保留 |
| 页脚格言、近期文章与联系方式 | `overrides/partials/footer.html`；联系方式在 `mkdocs.yml` 的 `extra.social` 中维护 |
| 默认页面的元数据和正文标题 | 对应 `index.md` 的 `title` 与一级标题（如果有） |
| 即时导航、前进后退后的选中状态 | `docs/assets/javascripts/site-navigation.mjs`；读取顶部链接的 `data-site-paths` |
| 左侧目录开合状态的保持 | `docs/assets/javascripts/sidebar-state.mjs`；为全部技术文档记录桌面端手动开合状态，在 `window.document$` 更新后恢复，并保留侧栏滚动位置 |

- “文档”的入口为 `notes/overview/`，选中范围仍为 `notes/`。`extra.site_navigation` 中的 `url` 为入口、`paths` 为选中范围；`header.html` 据此同时生成服务端选中状态及 `data-site-paths`，客户端基于 `data-site-root` 解析路径。`id` 是脚本与样式使用的稳定标识，修改文案时不要改动。以后增加其他根目录下的文档分类时，再按实际路径补充别名。
- 文档侧栏以目录标题的层级路径为标识，通过 `sessionStorage` 在同一标签页内记住开合状态与滚动位置；离开页面时用实际开合状态覆盖旧记录（包括当前文章自动展开后覆盖旧的收起记录），新文章所在路径始终展开。恢复时暂时关闭开合动画，先同步恢复滚动位置，再在主题首帧定位后校正；刷新和整页跳转也恢复位置。手机抽屉使用与顶部相同的栏目名称和顺序；一级栏目为无前置图标的纯文字展开项，点击整行只展示下级，不跳转；实际页面链接位于展开后的子列表。不保存桌面目录开合状态。
- 顶部与页脚快速链接共用 `extra.site_navigation`，左侧名称和层级仍由 `.nav.yml` 独立配置。只修改 `.nav.yml` 标签不会自动修改顶部或页脚；改栏目时检查各处和文档链接是否需要一起更新。
- `navigation.indexes` 将栏目 `index.md` 合并为可点击的栏目入口。栏目名称与页面正文标题可以不同。需要点击标题只展开、不跳转的目录，不要在该目录放 `index.md`；把栏目页改为普通页面（如 `overview.md`、`intro.md`）并在 `.nav.yml` 中列出，Material 会把没有 index 页的目录原生渲染为展开开关。Java 栏目采用这种方式。
- 只包含一篇文章时直接用单个 `.md` 文件（如 `basics/syntax.md`），不为其创建目录。`use_directory_urls` 下单个文件与 `index.md` 的网址相同，摊平不会改变已发布网址；目录留给多篇文章或子栏目。Java 的 `basics` 采用这种方式。
- 显式列出页面且没有通配规则的 `.nav.yml`，新增页面时要按需更新列表，不能假定自动进入侧栏。
- `.nav.yml` 顶层必须是映射（`nav:`），不能写成 `- nav:`。导航引用的目录至少需要一个 Markdown 页面；空文件夹不会成为可发布的导航分类。
- 标签改名不等于路径迁移。仅调整导航层级时，不必移动目录；用户要求修改网址时，再同步目录、导航与站内链接。
- 侧栏图标与内容一起维护：目录在自己的 `.nav.yml` 顶层设置 `icon`，单篇页面在 front matter 中设置 `icon`。值为主题图标名（如 `lucide/coffee`），`icon: ""` 隐藏图标；未设置时使用默认文件夹 / 文档图标。目录行与 index 页面合并时，目录的显式设置优先。目录图标只作用于自身，不传给所有下级页面；手机一级栏目保持无前置图标。不要恢复 `extra.navigation_icons` 的标题映射。
- Lucide 来自官方 `lucide-static` 1.69.0 构建依赖，支持该版本提供的全部 SVG 名称，不再逐个下载到 `overrides/.icons/lucide/`。`hooks/icon_assets.py` 在模板环境中按需读取 `node_modules/lucide-static/icons/`，保留项目自定义 SVG 与主题图标的优先级，只把实际使用的 SVG 嵌入网页；自动发布完整许可证。`node_modules/` 不提交，也不复制整套图标库、图标字体或浏览器图标脚本到网站。升级版本需同时更新依赖和锁文件并验证。
- Markdown 内部链接优先指向相对 `.md` 源文件；Jinja2 模板中的站内路径通过 `| url` 处理。不要把部署域名或错误的根路径硬编码进普通站内链接。
- `.nav.yml` 中的 `ignore` 只影响导航，不会阻止页面构建。`docs/404.md` 由 `overrides/404.html` 提供真正的站点 404 内容。
- 未列入导航不代表不构建或不发布。普通 Markdown 文档不能仅靠 `.nav.yml` 隐藏来实现草稿隔离。

### 网址迁移

当前只维护现有页面地址，不生成旧网址兼容跳转。迁移页面时同步顶部与页脚入口、栏目 `.nav.yml` 和正文链接；`about/website/`、`notes/overview/` 等普通页面不能继续使用原目录根地址。

## 博客写作约定

- 文章放在 `docs/blog/posts/`，当前按年月建子目录。发布网址由 `post_url_format: "{date}/{slug}"` 决定，不能根据源文件目录猜测文章网址。
- Front matter 必须有合法的 `date`；`categories`、封面和显式 `authors` 都按需填写，不是全部必填。
- 当前 Tags 插件配置 `tags_name_property: categories`，因此标签填写在复数 `categories` 中。不需要再重复填写 `tags`；单数 `category` 也不是当前标签字段。
- 博客插件的 `categories: false` 关闭的是分类页面。当前仍有 Tags 页面、时间归档、分页和阅读时长，不要误写成会生成分类归档。
- `<!-- more -->` 是摘要分界，放在摘要之后、正文之前。
- `draft: true` 的文章默认不进入生产构建；当前 Material 默认 `draft_on_serve: true`，因此 `mkdocs serve` 会显示博客草稿。这条规则只适用于博客插件管理的文章。
- `docs/blog/posts/.meta.yml` 提供默认作者 ID。展示名称、简介和头像在 `docs/blog/.authors.yml` 修改；点击作者后的完整介绍页是 `docs/about/author.md`。显示名称与内部作者 ID 不要混淆。
- 博客阅读页采用正文与右侧目录两列，不显示左侧信息栏。标题下首行以纯文字展示作者、日期及可选更新日期；下一行按留白分组展示标签、阅读时长与字数，统计样式与列表一致，不显示头像、简介引用块、分隔点或标签胶囊。作者姓名可点击查看介绍，简介保留为悬停提示；上一篇、下一篇位于文末。窄屏自然换行。移动端布局以 https://zensical.org/docs/create-your-site/ 为参考：48px 单行页眉，左上圆角导航浮层，文章右下独立目录按钮；点一次在内容上方展开 `On this page`，不需要打开导航抽屉。桌面保留正文与右侧目录，不显示左侧信息栏；目录标题由 `markdown_extensions.toc.title` 统一设置。
- 封面使用 `image`，可配 `image_alt`、`image_layout: top` 或 `side`；默认 `top`，只有显式填写 `side` 才使用右侧小图。布局同时作用于列表、时间归档和文章详情：详情页 `top` 在标题信息下方显示通栏封面，`side` 在宽屏标题信息右侧显示小图，手机统一上下排列；详情封面保持原图比例，正文其他插图仍使用 Markdown。拼成 `iamge_layout` 会产生明确构建警告。完整写作与元数据说明见 `handbook/网站内容编辑手册.md`。

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

## Now 近况

`docs/now/index.md` 是固定入口，没有已发布记录时展示其中的空状态文案。每期近况可放在 `docs/now/` 的子目录中，推荐按年份组织，例如 `docs/now/2026/2026-11-09.md`；原来直接放在根目录的日期文件仍可使用。文件名日期是排序依据，接受 `YYYY-MM-DD.md` 与月、日不补零的 `YYYY-M-D.md`；展示和排序统一使用完整日期，同一天只能有一份已发布记录。`title` 可选，正文从二级标题开始。`hooks/now.py` 递归收集记录，按日期倒序挑选最新的非草稿正文展示在 `/now/`；历史地址按实际目录生成，例如 `/now/2026/2026-11-09/`，底部 `Past updates` 可回看全部已发布记录。

Now 标题下的共享介绍在 `docs/now/.meta.yml` 的 `intro` 中维护，由现有 Material `meta` 插件传给入口与历史页；模板只读取内容，不硬编码介绍文案。多行内容使用 YAML 的 `|`，样式保留手动换行与空行，长句自然折行。将 `intro` 设为 `""` 即可隐藏，不额外增加脚本或 hook 配置。

Now 的 `draft: true` 会在生成导航、搜索和页面之前排除该文件，预览和正式构建一致；日期只用于排序，不提供定时发布。所有版本由 `now.html` 和 `now.css` 统一展示，隐藏桌面侧栏和文章目录，手机保留全站菜单；不增加客户端版本切换脚本。新增一期无需修改导航或复制正文到 `index.md`。复制最新正文时，`NowLinksExtension` 在 MkDocs 原生链接转换前，按原文件目录调整 Markdown 图片与链接，保证嵌套目录的相对路径在最新入口也有效；不替换代码块或行内代码中的文本。完整写作流程见编辑手册的 Now 章节。

## 主题、样式与 hooks

`mkdocs.yml` 的 `theme.custom_dir` 指向 `overrides/`。优先修改已有覆盖模板，保留 Material 的页面内容、搜索、目录与即时导航机制。

| 文件 | 职责 |
| --- | --- |
| `overrides/blog.html`、`overrides/partials/post.html` | 博客列表、摘要与可选封面 |
| `overrides/blog-post.html`、`overrides/partials/content.html` | 博客正文布局、元信息与文章切换；移动端共用全站菜单及独立目录弹层，桌面隐藏左栏 |
| `overrides/partials/blog-post-meta.html` | 标题下方的作者、日期、纯文字标签与阅读统计 |
| `overrides/404.html` | 复用 `docs/404.md` 的自定义 404 |
| `docs/assets/stylesheets/extra.css` | 文档阅读样式与全站基础覆盖 |
| `docs/assets/stylesheets/tokens.css` | 全站字体、字号、间距与明暗配色变量 |
| `docs/assets/stylesheets/site.css` | 主题色与顶部导航 |
| `docs/assets/stylesheets/search.css`、`overrides/partials/search.html`、`docs/assets/javascripts/site-search.mjs` | 原生 Material 搜索界面、紧凑入口和跨页面可用的 Ctrl/⌘K 快捷键 |
| `docs/assets/stylesheets/sidebar.css` | 共享侧栏、手机圆角导航浮层、手风琴分类、独立目录弹层、图标和状态恢复样式 |
| `overrides/partials/nav.html`、`overrides/main.html` | 共享栏目菜单与响应式侧栏外壳；手机菜单独立于当前文章目录 |
| `docs/assets/javascripts/site-toc.mjs` | 目录按钮、键盘与关闭行为；页面切换清理旧监听器 |
| `docs/assets/stylesheets/home.css` | 首页布局与插画 |
| `docs/assets/javascripts/home-animation.mjs` | 首页文字淡入、插画鼠标跟随和弹跳；支持减少动态效果与即时导航清理 |
| `overrides/projects.html`、`overrides/partials/project-cards.html` | 项目展示页和卡片，不插入文档默认标题 |
| `docs/assets/stylesheets/projects.css` | 项目卡片配色、响应式网格和组件未加载时的基础布局 |
| `docs/assets/javascripts/projects.mjs` | 按需加载本地组件、处理预览成功和失败，兼容即时导航 |
| `hooks/project_cards.py` | 校验项目元数据，在 Markdown 转换前生成可搜索卡片；根据网址生成 thum.io 首页预览地址 |
| `hooks/now.py`、`overrides/now.html`、`docs/assets/stylesheets/now.css` | Now 日期版本、草稿排除、最新正文与历史记录 |
| `docs/assets/stylesheets/blog.css` | 博客样式统一入口；导入字体及 `blog/` 下四个模块 |
| `docs/assets/stylesheets/blog/common.css` | 共享链接状态与辅助交互规则 |
| `docs/assets/stylesheets/blog/index.css`、`blog/post.css`、`blog/meta.css` | 分别负责列表与归档、正文与文章目录、作者标签与阅读统计 |
| `docs/assets/stylesheets/footer.css` | 随全站明暗主题切换的四列页脚、密码轮品牌标志与响应式排版 |
| `docs/assets/javascripts/footer-jelly.mjs` | 页脚阴影果冻形变、鼠标弹性挤压与离屏暂停 |
| `docs/assets/stylesheets/not-found.css` | 腾讯公益 404 的整屏布局与独立“返回首页”入口 |
| `hooks/blog_metadata.py` | 中英文混合字数与阅读时长；显式 `readtime` 优先 |
| `overrides/partials/nav-item.html` | 保留 Material 9.7.7 导航宏，读取本地目录 / 页面图标，保留栏目显示名称、整行状态容器与顶层标题标记；手机一级栏目由 `nav.html` 单独渲染为纯文字展开项 |
| `hooks/navigation_icons.py` | 构建时读取各目录 `.nav.yml` 的 `icon`，按物理目录绑定图标，验证图标名；复用固定版本 awesome-nav 的解析树处理别名、虚拟分组与单子项目录。博客归档从 `docs/blog/archive/.nav.yml` 读取，Tags 在 `docs/blog/tags.md` 中维护；不增加浏览器脚本 |
| `hooks/icon_assets.py` | 在其他模板环境处理前提供 Lucide 依赖的 SVG 加载器，保持项目与主题覆盖优先级；发布 `assets/licenses/lucide.txt`，依赖缺失时提示安装命令 |
| `hooks/diagrams.py` | 为 Mermaid 添加滚动容器，横向流程图可拖动 |

样式加载入口是 `mkdocs.yml` 的 `extra_css`。加载顺序为文档基础、页眉、搜索、侧栏，再到各页面与页脚。内部导入包括 `extra.css` → `tokens.css` → `reading-fonts.css`、`blog.css` → `blog-fonts.css` 与 `blog/{common,index,post,meta}.css`，以及 `projects.css` → 本地 Web Awesome 主题。不要把导入文件又重复加入页面。拆分样式时保留选择器、声明与必要的覆盖顺序，并核对拆分前后的浏览器计算样式。

全站使用中性白、浅灰和深灰作为大面积底色，正文与顶部导航保留 VitePress 风格的蓝色强调色。侧栏、手机菜单和独立目录组件使用中性色，选中与悬停背景统一为 `--color-surface` 浅灰（深色模式为深灰），文字、图标和箭头统一使用中性文字色；`.kb-nav-row` 是整行状态容器，带链接与展开箭头的条目也只使用一个完整背景，内部不重复画色块。按用户偏好避免恢复米黄底色和泛黄的纸张色调；配色统一维护在 `tokens.css` 中。

页眉不显示 GitHub 仓库组件，桌面主导航保持居中，右侧保留主题切换和搜索。主题切换沿用 Material 的原生三态循环与偏好保存，图标从固定版本的 Lucide 依赖中读取日月、太阳和月亮星星，保留其许可证；`site.css` 将这些描边图标设为无填充。首页和页脚提供 GitHub 联系方式；`repo_url` 仍用于反馈与源码链接；手机菜单不插入仓库组件。

`overrides/main.html` 统一挂载全站导航和右侧目录。`hide: [navigation]` 在桌面隐藏左栏，手机仍提供配置中的全站入口。桌面树和手机树使用不同 ID 前缀，避免重复控件；手机根分类初始收起，一级标题仅展开、不跳转；原 index 入口保留为下级页面链接。子分类原位展开。桌面状态脚本读取根节点的 `data-nav-key`，避免展示名称改变后丢失已有开合与滚动状态。

文档阅读、博客正文、首页和界面文字有各自的字体与字号作用域。博客正文使用自托管 Charter；更换字体或资源时保留对应授权文件，不把不同字体的许可证混用。

Web Awesome 3.14.0 的 Card、Badge 及其依赖保存在 `docs/assets/javascripts/vendor/webawesome/`，组件不使用外部 CDN；项目首页缩略图通过 thum.io 自动生成并缓存，首次生成或服务异常不应阻止访问网站。该目录的 `theme.css` 从官方主题提取声明并限定在 `.kb-projects` 内；更新组件时同时核对依赖、主题和许可证，不保留未使用组件。

`handbook/` 存放仓库维护和内容编辑说明，不在 `docs/` 内，不会发布到网站。日常写作统一查阅 `handbook/网站内容编辑手册.md`；更新写作能力或元数据处理时同步维护手册。`README.md` 保留项目入口、目录分工和快速启动，避免重复维护长篇写作说明。

Java 内容遵循 [Java 文档编写规范](handbook/Java文档编写规范.md)：参考 Tpoint Tech 的讲解组织方式，统一采用概念、语法、独立示例、输出、注意事项、练习与参考资料的形式。当前示例基准为 JDK 21，完整程序需要编译运行；按现有核心、进阶、框架、第三方库分类组织，正文与示例独立编写。

修改 JavaScript 时考虑 Material 即时导航的 `document$` 生命周期，清理旧动画、监听器和 observers。动画应尊重减少动态效果设置，离屏时停止不必要的工作。四列页脚跟随全站 `data-md-color-scheme` 切换：浅色复用全站颜色变量，深色使用深蓝灰配色；左列展示站名与低对比的密码轮标志（复用 `cipher-wheel.svg`），联系方式集中在 Connect 栏并使用 Material 图标，英文格言位于底栏。`footer-jelly.mjs` 为背景阴影提供自动果冻形变和鼠标弹性挤压，离屏或后台时暂停，减少动态效果时保留 CSS 静态阴影；装饰画布不阻挡链接和手机滚动。近期文章从 Blog 插件的数据中按日期取最近两篇，始终排除草稿，缺少封面时使用文档图标。博客右侧目录应在正文边界前避让页脚。

## 验证与部署

按改动选择必要检查，不为简单文案改动新增复杂测试，也不把构建成功当作所有交互都已验证：

1. 检查任务相关差异和 `git diff --check`。
2. 文档、配置或模板改动运行严格构建；确认 warning 和 INFO 的实际含义。
3. 导航或网址改动核对顶部、侧栏、页脚、所有相关站内链接、canonical。验证即时导航及后退后的选中状态；迁移还要验证嵌套页面和查询参数、锚点。
4. 布局改动检查桌面与手机，必要时覆盖 320、390、1024、1440 像素宽度；确认导航不越界、内容不遮挡、页面不产生意外横向溢出。
5. JavaScript 改动运行相应 `node --check`，并验证受影响交互。纯协作说明文件的修改以事实、路径、命令及规则一致性核对为主。

GitHub Pages 部署由 `.github/workflows/deploy-pages.yml` 管理：推送 `main` 或手动触发工作流，使用 Python 3.13 与 Node.js 22，安装 `requirements.txt` 并运行 `npm ci --ignore-scripts`，先执行 `.venv/bin/python -m unittest discover -s tests` 对应的 Python 测试和自定义顶层 `.mjs` / `.js` 的 `node --check`，再执行 `mkdocs build --strict`，上传 `site/` 后部署。CI 中 Python 命令使用已配置的环境，不带 `.venv/bin/`。当前 `cancel-in-progress: false`，后续触发不会按此设置自动取消正在执行的同组工作流。

## CodeGraph

仅当仓库根目录存在 `.codegraph/` 时，理解或定位代码前优先使用 CodeGraph；没有该目录时直接跳过，不自行建立索引。

- MCP 可用时先用 `codegraph_explore`，查询中说明文件、符号或具体问题。
- Shell 方式：`codegraph explore "符号名或问题"`。
- 没有索引时优先使用 `rg`、`rg --files` 和针对性的文件读取。
