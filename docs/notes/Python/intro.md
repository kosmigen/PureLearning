---
title: Python 入门
description: Python 核心内容和相关生态
icon: lucide/circle-play
---

# Python 入门

## 基本认识

![Python](https://raw.githubusercontent.com/kosmigen/picgo-pictures/master/20261123154655152.png)

Python 由 **Guido van Rossum** 于 1989 年 12 月创建。

> 关于Python的起源，吉多·范罗苏姆在1996年写到：
> 
> 六年前，在1989年12月，我在寻找一门“课余”编程项目来打发圣诞节前后的时间。我的办公室会关门，但我有一台家用电脑，而且没有太多其它东西。我决定为当时我正构思的一个新的脚本语言写一个解释器，它是ABC语言的后代，对UNIX / C程序员会有吸引力。作为一个略微有些无关想法的人，和一个蒙提·派森的飞行马戏团的狂热爱好者，我选择了Python作为项目的标题。

Python 语法简单，易于学习，公开库多，功能强大！

![2026 年 11 月编程语言排行](https://raw.githubusercontent.com/kosmigen/picgo-pictures/master/20261123155822350.png)

身处于 AI 时代，此编程语言的重要性日益凸显！

## Python 版本

Python 官方在 2020 年宣布不再维护 Python 2.x，全力投入 Python 3.x 项目，所以对于现在的学习，只需要考虑 Python 3.x 即可。

现在最新的版本为  Python 3.15.2，追求稳定且具有良好生态的版本为 Python 3.14 。

由于 Python 本质上是一套语言规范，不同团队为了追求更高的运行速度、融入特定技术生态或运行在微型硬件上，便用不同的编程语言重写了它的解释器。

常见的有官方的 CPython，除此之外，还有 PyPy、Jython、IronPython、MicroPython、GraalPy、Brython 等主流实现。

## 虚拟环境

Python 可以为一个文件夹（项目）创建一个虚拟环境，所谓的虚拟环境也就是根目录下的 `.venv` 文件夹。

```md
.venv/
├── bin/ (Windows 为 Scripts/)
│   ├── python -> /usr/bin/python3 (指向原 Python 解释器的软链接)
│   ├── pip
│   └── activate (激活脚本)
├── lib/
│   └── python3.x/site-packages/ (存放此环境专属安装的第三方库)
└── pyvenv.cfg (记录底层的 Python 路径与版本信息)
```

虚拟环境就相当于给这个项目单独创建了一个空间，在这空间里面随便搞什么都不会影响系统。有些电脑（如 macOS/Linux）会自带 Python 解释器供系统内部组件使用。如果直接在系统层下载安装第三方库，容易污染系统环境，甚至导致系统自带工具因依赖冲突而崩溃。

如果使用较新的 macOS（通过 Homebrew 安装的 Python）或者较新的 Linux（如 Ubuntu 23.04+、Debian 12+），你在没有激活虚拟环境的情况下直接跑：

```python
pip install requests
```

系统甚至不会帮你安装，而是直接红字报错把你拦下来：

```shell
❌ error: externally-managed-environment

“This environment is externally managed... To install Python packages, create a virtual environment...”
```

这是 Python 官方在 PEP 668 规范中专门推出的机制：锁死系统全局环境。防止本地全局的 Python 库受到影响。

Mac 中 Python 自带的创建虚拟环境命令：`python3 -m venv .venv`，`source .venv/bin/activate` 是激活命令，`deactivate` 是退出虚拟环境命令。

Python 自带的管理工具是 `pip`，我更推荐 `uv`，更智能、更快！并且包揽了管理虚拟环境、依赖管理等所有生态。

[uv 官网](https://docs.astral.sh/uv/)

## 开发工具

通常使用 VS Code，其插件丰富、免费、启动快速，获得了大量开发者的青睐，缺点就是需要自己配置。

也有专业版的开发工具，例如 PyCharm 。

当安装好开发工具后，新建一个 py 文件，输入以下代码。

```py
print("Hello, Python!")
```

## 关键字

新建一个 py 文件，输入以下代码并执行。

```python
import keyword

print(keyword.kwlist)
```

输出 

```shell
['False', 'None', 'True', 'and', 'as', 'assert', 'async', 'await', 'break', 'class', 'continue', 'def', 'del', 'elif', 'else', 'except', 'finally', 'for', 'from', 'global', 'if', 'import', 'in', 'is', 'lambda', 'nonlocal', 'not', 'or', 'pass', 'raise', 'return', 'try', 'while', 'with', 'yield']
```
