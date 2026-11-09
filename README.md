<div align="center">
<img alt="kosmigen" src="docs/assets/images/readme-logo.svg">
</div>

kosmigen 的个人技术文档、项目与博客，使用 Material for MkDocs 构建。

- 网站：<https://kosmigen.github.io/PureLearning/>
- **内容编辑入口：[网站内容编辑手册](handbook/网站内容编辑手册.md)**
- 代理协作规范：[Agent.md](Agent.md)；[AGENTS.md](AGENTS.md) 与 [CLAUDE.md](CLAUDE.md) 均为入口。

## 快速预览

从仓库根目录执行。已有 `.venv/` 时直接使用，仅在不存在时创建：

```sh
python3 -m venv .venv
.venv/bin/python -m pip install -r requirements.txt
.venv/bin/mkdocs serve --dev-addr 127.0.0.1:8000
```

访问 <http://127.0.0.1:8000/PureLearning/>。停止预览时在终端按 `Ctrl+C`。

```sh
# 发布前检查（部署流程也会执行这三项）
.venv/bin/python -m unittest discover -s tests
bash <<'SH'
shopt -s nullglob
for script in docs/assets/javascripts/*.mjs docs/assets/javascripts/*.js; do
  node --check "$script" || exit 1
done
SH
.venv/bin/mkdocs build --strict
```

脚本语法检查需要 Node.js，部署流程使用 Node.js 22；日常写作和本地预览仍只需 Python 环境。

推送 `main` 会触发 GitHub Pages 工作流；不要直接编辑或提交生成的 `site/`。

## 目录分工

```text
docs/                    网站内容与公开资源
  index.md               首页
  blog/                  博客入口、作者、标签与 posts/ 文章
  notes/                 技术文档入口
    C/                   C 语言
    Python/              Python
    Java/                Java，以及其框架和第三方库
    AI/                  AI 文档
    CSAPP/               深入理解计算机系统
    Tools/               开发工具与其他工具
  projects/              项目卡片数据
  now/                   近况入口与按日期保存的版本
  about/                 关于网站与作者
  assets/                字体、图片、样式、脚本与本地组件
overrides/               实际需要自定义的主题模板
hooks/                   图片说明、字数统计、项目卡片、Now 与图表
scripts/                 按需运行的维护工具（字体分片）
tests/                   博客元数据等构建逻辑的检查
handbook/                内容编辑手册，不发布到网站
mkdocs.yml               站点配置与功能开关
requirements.txt         固定的直接依赖
```

顶部顺序为 **博客｜文档｜项目｜Now｜关于**；“文档”入口页标题为“技术文档”。底层页面树由插件发现，各栏目内部由对应的 `.nav.yml` 管理；顶部、侧栏、手机菜单与页脚快速链接共同读取 `mkdocs.yml` 的 `extra.site_navigation`，中英文名称、顺序与目标地址只需维护一处。手机使用单行页眉、圆角导航浮层和右下角独立的 `On this page` 目录按钮；一级栏目是纯文字展开项，页面链接位于下级列表，选中条目使用整行浅灰背景。

各栏目可用 `hide_sidebar_title_on_desktop: true` 隐藏桌面侧栏最上方的分组标题，手机保留；目前文档和关于启用，设为 `false` 或省略即可恢复。

当前技术文档统一位于 `docs/notes/`，栏目目录使用上面的大小写。新增内容按主题加入对应目录和 `.nav.yml`。

当前只维护现有页面网址，不生成旧地址跳转；移动页面后同步导航入口和站内链接。

Now 的固定入口 `/now/` 自动展示最新一期。每期写在 `docs/now/YYYY-MM-DD.md`，旧版本保留独立地址并列入 `Past updates`。当前附有三期标注为示例的近况，可直接替换正文；最新一期是 `docs/now/2026-11-09.md`。`draft: false` 表示发布，改为 `true` 后不生成网页，也不进入搜索。写法见[编辑手册的 Now 章节](handbook/网站内容编辑手册.md#now近况)。

Now 标题下的介绍在 `docs/now/.meta.yml` 的 `intro` 中修改，入口与历史页共用；设为 `intro: ""` 即可隐藏。

新增文档、博客元数据、自动项目预览、Markdown 扩展、导航调整、资源路径、预览部署与常见问题，统一见[编辑手册](handbook/网站内容编辑手册.md)。

## 资源维护

样式按职责拆分：

```text
docs/assets/stylesheets/
  tokens.css             共享配色、字体与尺寸变量
  extra.css              基础排版、文档阅读与图表
  site.css               主题变量映射与页眉导航
  search.css             搜索入口、结果与快捷键提示
  sidebar.css            侧栏布局、导航行与状态恢复样式
  blog.css               博客统一样式入口
  blog/
    common.css           共享链接状态与辅助交互
    index.css            列表、归档、摘要与封面
    post.css             文章布局、正文、目录与前后篇
    meta.css             列表与文章的标签、作者和阅读统计
  home.css               首页
  projects.css           项目卡片
  now.css                当前近况与历史版本
  footer.css             页脚
  not-found.css          404 页面
```

`mkdocs.yml` 注册样式入口；`blog/` 下四个模块由 `blog.css` 导入，不要重复注册。字体定义继续使用独立导入文件。

Web Awesome 3.14.0 仅保留项目使用的 Card、Badge 和完整依赖；来源及许可证位于 `docs/assets/javascripts/vendor/webawesome/`。字体与首页插画来源见 `docs/assets/fonts/NOTICE.txt`、`docs/assets/images/home/NOTICE.txt`。

维护时按引用清理资源，保留正在使用资源的许可证、中文字体完整字符覆盖。`.venv/`、`site/`、缓存与本地研究输出均已忽略，不属于网站源文件。
