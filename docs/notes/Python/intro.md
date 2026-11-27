---
title: Python 概述
description: Python 核心内容和相关生态
icon: lucide/circle-play
---

# Python 概述

## 基本认识

![Python](https://raw.githubusercontent.com/kosmigen/picgo-pictures/master/20261123154655152.png)

Python 由 **Guido van Rossum** 于 1989 年 12 月创建。

> 关于 Python 的起源，吉多·范罗苏姆在 1996 年写到：
> 
> 六年前，在 1989 年 12 月，我在寻找一门“课余”编程项目来打发圣诞节前后的时间。我的办公室会关门，但我有一台家用电脑，而且没有太多其它东西。我决定为当时我正构思的一个新的脚本语言写一个解释器，它是 ABC 语言的后代，对 UNIX / C 程序员会有吸引力。作为一个略微有些无关想法的人，和一个蒙提·派森的飞行马戏团的狂热爱好者，我选择了 Python 作为项目的标题。

Python 语法简洁、易于上手，同时拥有极其庞大且成熟的开源库生态。

![2026 年 11 月编程语言排行](https://raw.githubusercontent.com/kosmigen/picgo-pictures/master/20261123155822350.png)

身处于 AI 时代，从自动化脚本、后端服务、数据分析到机器学习与大模型应用，Python 的重要性日益凸显！

## 版本与解释器

Python 官方在 2020 年正式停止维护 Python 2.x，全面投入 Python 3.x 生态。现在学习与开发只需考虑 **Python 3.x**。

目前最新版本为 **Python 3.15.2**，追求稳定且具备完善第三方库生态的主流版本为 **Python 3.14**。

需要区分的是：**Python 本质上是一套语言规范**，不同团队为了追求更高的运行速度、融入特定平台生态或运行在微型硬件上，使用不同语言实现了它的解释器：

- **CPython**：官方默认实现，用 C 语言编写，生态最全、兼容性最好。
- **PyPy**：内置 JIT（即时编译）的 Python 实现，针对长耗时计算任务有显著的加速效果。
- **MicroPython / CircuitPython**：面向单片机与嵌入式硬件的精简实现。
- **其他跨生态实现**：如运行在 JVM 上的 **Jython**、运行在 .NET 上的 **IronPython**、基于 GraalVM 的 **GraalPy** 以及运行在浏览器前端的 **Brython**。

## 虚拟环境与包管理

在 Python 开发中，通常会为每个项目单独创建一个**虚拟环境**，即项目根目录下的 `.venv` 文件夹：

```text
.venv/
├── bin/ (Windows 为 Scripts/)
│   ├── python -> /usr/bin/python3 (指向原 Python 解释器的软链接)
│   ├── pip
│   └── activate (激活脚本)
├── lib/
│   └── python3.x/site-packages/ (存放此环境专属安装的第三方库)
└── pyvenv.cfg (记录底层的 Python 路径与版本信息)
```

虚拟环境相当于给当前项目开辟了一个隔离沙箱，在里面安装或卸载任何包都不会影响系统全局。许多操作系统（如 macOS / Linux）自带了供系统内部组件使用的 Python 解释器；如果直接往系统层安装第三方库，极易污染系统环境，甚至因为依赖版本冲突导致系统工具崩溃。

如果你使用的是较新的 macOS（如通过 Homebrew 安装的 Python）或 Linux（Ubuntu 23.04+、Debian 12+），在未激活虚拟环境时直接执行：

```sh
pip install requests
```

系统会直接拒绝安装并给出红字报错：

```text
❌ error: externally-managed-environment

“This environment is externally managed... To install Python packages, create a virtual environment...”
```

这是 Python 官方在 **PEP 668** 规范中推出的保护机制：锁死系统全局环境，强制开发者使用虚拟环境隔离项目依赖。

使用 Python 内置的 `venv` 模块管理虚拟环境的常用命令（macOS / Linux）：

```sh
# 1. 在当前项目下创建 .venv 虚拟环境
python3 -m venv .venv

# 2. 激活虚拟环境
source .venv/bin/activate

# 3. 退出虚拟环境
deactivate
```

Python 传统的包管理工具是 `pip`，但现在更推荐使用 **[uv](https://docs.astral.sh/uv/)** —— 基于 Rust 编写的新一代工具，速度极快，一站式包揽了 Python 版本管理、虚拟环境创建、依赖锁文件与脚本运行。

## 开发工具与运行

日常开发主流选择有两个：

- **VS Code**：轻量、免费、启动迅速，配合官方的 **Python（含 Pylance）** 与 **Ruff**（代码检查与格式化）插件即可获得极佳的开发体验，缺点是需要自己动手做初始配置。
- **PyCharm**：JetBrains 出品的专业级 Python IDE，开箱即用，重构、调试与工程化集成功能非常全面。

配置好开发环境后，有两种最基础的代码运行方式：

1. **交互式解释器（REPL）**：在终端直接输入 `python3` 回车，即可输入一行代码、立刻看到一行结果，非常适合做小实验。
2. **运行脚本文件**：新建一个 `hello.py` 文件，写入以下代码：

```python
print("Hello, Python!")
```

在终端中执行该文件：

```sh
python3 hello.py
# 若使用 uv，也可以直接运行：
uv run hello.py
```

## Python 之禅

在交互式解释器或脚本中运行 `import this`，可以看到 Tim Peters 总结的《Python 之禅》（*The Zen of Python*），它浓缩了 Python 语言的核心设计哲学：

```python
import this
```

其中最常被提及的几条准则：

- **优美胜于丑陋，显式胜于隐式**（*Beautiful is better than ugly. Explicit is better than implicit.*）
- **简单胜于复杂，扁平胜于嵌套**（*Simple is better than complex. Flat is better than nested.*）
- **可读性至关重要**（*Readability counts.*）

## 专栏脉络

本专栏按“先语言内核，再工程与性能，最后落地应用”的顺序组织：

1. **Python 语言**：从对象模型、内置容器、控制流、函数与闭包，到面向对象、数据模型魔术方法、迭代器/协程协议、异常、模块机制、类型注解与元编程。
2. **通用编程**：文件系统与 I/O、日期时区、系统编程与 CLI、网络协议、并发与 `asyncio`、数据库与缓存。
3. **项目工程**：现代依赖管理（`pyproject.toml` 与 `uv`）、单元测试与 Mock、性能剖析与调试、静态检查与日志、打包发布与 CI/CD。
4. **解释器与性能**：CPython 字节码与虚拟机、内存管理与 GC、GIL 与自由线程（Free-Threading）、JIT 与原生扩展（PyO3）。
5. **应用方向**：Web 与 API 开发（FastAPI / Pydantic）、现代数据分析引擎（NumPy / Polars / DuckDB）以及 AI 与大模型应用开发。