# 模块与包机制

在大型 Python 工程中，代码是如何从散落的 `.py` 源文件组织为高内聚、低耦合的模块（Module）与包（Package）的？为什么同一个模块被 `import` 十次却只执行一次？为什么直接运行包内脚本会报 `attempted relative import with no known parent package`，以及循环导入（Circular Imports）为何会在运行时崩盘？回答这些问题的关键，在于透彻理解 Python 基于 `sys.modules`、`sys.meta_path` 与模块命名空间对象的运行期导入机制。

---

## 模块（Module）的本质与运行模型

### 模块是一等运行期对象（`types.ModuleType`）及其顶层全局命名空间 `module.__dict__`

与其他静态编译语言将“模块/命名空间”仅作为编译期符号隔离机制不同，Python 中的**模块（Module）是实实在在的一等运行期对象（First-Class Runtime Object）**，其类型为 `types.ModuleType`：

- 每当一个 `.py` 文件被导入，解释器就会在堆内存中创建一个 `types.ModuleType` 实例。
- 在该模块顶层定义的所有全局变量、函数和类，本质上全部存储在模块对象的底层属性字典 **`module.__dict__`** 中。
- 在模块内部访问全局变量 `x`，与在模块外部通过属性点号访问 `module.x`，底层读写的是同一个 `module.__dict__["x"]` 槽位。

```python
import types

# 动态在内存中构造一个模块对象并注入代码
dynamic_mod = types.ModuleType("virtual_math", "Dynamically created math module")
exec("PI = 3.14159\ndef double(x): return x * 2", dynamic_mod.__dict__)

assert isinstance(dynamic_mod, types.ModuleType)
assert dynamic_mod.PI == 3.14159
assert dynamic_mod.double(21) == 42
assert dynamic_mod.__dict__["PI"] == 3.14159
```

### 模块核心内置属性：`__name__`、`__file__`、`__package__`、`__doc__`、`__loader__` 与 `__spec__`

每个加载完成的模块对象都由导入系统自动注入了一组标准的自省元数据属性（这些属性同样可直接作为模块内的全局变量访问）：

| 内置属性 | 类型 | 核心语义与运行期作用 |
| :--- | :--- | :--- |
| **`__name__`** | `str` | 模块的完全限定名称（如 `"pkg.sub.mod"`）。**唯一例外**：作为程序直接启动入口的顶层脚本，其 `__name__` 恒被强制设为 **`"__main__"`** |
| **`__file__`** | `str`（可选） | 模块对应的物理源文件路径（如 `"/path/to/mod.py"`）。注意：`sys`、`builtins` 等 C 语言内置模块没有物理文件，不含 `__file__` 属性 |
| **`__package__`** | `str \| None` | 模块所属的父包名称，是**解析显式相对导入（`from . import x`）的唯一锚点**。对于普通子模块 `pkg.mod`，其值为 `"pkg"`；对于包自身 `pkg/__init__.py`，其值为 `"pkg"`；对于顶层单文件脚本，其值为 `None` 或 `""` |
| **`__doc__`** | `str \| None` | 模块顶部首个三引号文档字符串（Docstring），未编写时为 `None` |
| **`__loader__`** | `Loader` | 实际负责将该模块加载进内存的加载器对象（如 `SourceFileLoader` 或 `BuiltinImporter`） |
| **`__spec__`** | `ModuleSpec` | **PEP 451 模块规格说明对象**（`importlib.machinery.ModuleSpec`），统一封装了模块的 `name`、`loader`、`origin`（文件路径）、`submodule_search_locations`（仅包拥有，即 `__path__`）等全套加载蓝图 |

```python
import json

assert json.__name__ == "json"
assert json.__package__ == "json"  # json 是一个包含 __init__.py 的包
assert json.__spec__ is not None
assert json.__spec__.origin == json.__file__
assert json.__spec__.submodule_search_locations is not None
```

### `if __name__ == "__main__":` 惯用法：区分脚本直接启动入口与作为库被其他模块导入

由于 Python 在导入一个模块时，会**自上而下完整执行该模块顶层的所有语句**，如果我们在 `utils.py` 顶层直接编写了测试代码或命令行启动逻辑，那么任何其他模块执行 `import utils` 时都会被迫执行这段启动逻辑。

利用解释器对启动入口文件赋予 `__name__ == "__main__"` 的特性，标准工程惯用法是将所有执行入口封装在 `main()` 函数中，并用 `if __name__ == "__main__":` 守护：

- 当执行 `python utils.py` 或 `python -m pkg.utils` 直接启动该模块时：`__name__` 为 `"__main__"`，条件成立，`main()` 被执行。
- 当其他模块执行 `import utils` 或 `from pkg import utils` 时：`__name__` 为 `"utils"` 或 `"pkg.utils"`，条件为假，仅注册函数与类定义，不触发任何副作用。

---

## `import` 查找与加载完整流程

当你写下一行 `import pkg.mod` 时，Python 内部的 `importlib` 引擎会严格按照以下**三阶段流水线**执行：

### 第一阶段：`sys.modules` 全局缓存字典查表（为什么多次 `import` 同一模块只会执行一次顶层代码）

解释器首先以模块的完全限定名（如 `"pkg.mod"`）为键，在全局模块缓存字典 **`sys.modules`** 中执行一次 `O(1)` 哈希查找：

1. **缓存命中（Cache Hit）**：如果 `sys.modules["pkg.mod"]` 已经存在，导入流程**立即短路结束**，直接将该已缓存的模块对象绑定到当前局部命名空间，**绝不会再次读取磁盘或重新执行模块顶层代码**。这也是在 Python 中常把模块天然用作进程内**单例（Singleton）**的原因。
2. **缓存未命中（Cache Miss）**：如果键不存在（或值为 `None`），则进入第二阶段启动查找协议。

### 第二阶段：`sys.meta_path` 元路径查找器（Finder）依次探测并生成 `ModuleSpec`（内置模块 -> 冻结模块 -> `sys.path` 路径钩子）

当 `sys.modules` 未命中时，解释器会遍历 **`sys.meta_path`** 列表中的**元路径查找器（Meta Path Finders）**，依次调用每个查找器的 `finder.find_spec(fullname, path, target=None)` 方法。查找器的职责**仅仅是定位模块并返回一个 `ModuleSpec` 规格蓝图对象**，而不真正执行模块代码。默认情况下，`sys.meta_path` 按优先级包含三个核心查找器：

1. **`BuiltinImporter`**：查找编译进 CPython 解释器二进制文件中的 C 语言内置模块（如 `sys`、`time`、`gc`）。
2. **`FrozenImporter`**：查找被冻结编译进解释器镜像的 Python 核心启动模块（如 `_frozen_importlib`；Python 3.11+ 为加快启动速度冻结了大量核心标准库模块）。
3. **`PathFinder`**：基于文件系统搜索路径（顶层模块查 `sys.path`，包内子模块查父包的 `parent.__path__`），并调用 `sys.path_hooks`（支持目录、`.zip` 归档文件等）在磁盘上寻找匹配的包目录、`.py` 源码、`.pyc` 字节码或 `.so`/`.pyd` 扩展模块。

如果所有 `sys.meta_path` 查找器都返回 `None`，解释器将直接抛出 `ModuleNotFoundError`（它是 `ImportError` 的子类）。

### 第三阶段：加载器（Loader）分配空模块对象、**先行登记到 `sys.modules`**，随后在模块命名空间中执行源码字节码

拿到 `ModuleSpec` 后，解释器通过 `spec.loader`（加载器）分两步完成模块构建：

1. **创建空模块壳子并先行注册到 `sys.modules`**：调用 `loader.create_module(spec)`（默认创建空的 `types.ModuleType` 实例并初始化 `__name__`、`__package__`、`__spec__` 等基础属性），然后**在执行模块内任何一行代码之前，立即将该空模块对象存入 `sys.modules[fullname] = module`**！
2. **执行模块代码填充命名空间**：调用 `loader.exec_module(module)`，将 `.py` 源码编译为字节码并在 `module.__dict__` 命名空间中自上而下执行。如果执行过程中抛出了未捕获异常，解释器会**将刚才预登记在 `sys.modules[fullname]` 中的半成品记录清理删除**，并将异常向上抛出。

```python
import sys
import types

# 验证阶段 3 的核心机制：模块顶层代码正在执行时，该模块自身早已存在于 sys.modules 中！
assert sys.modules[__name__] is not None
assert isinstance(sys.modules[__name__], types.ModuleType)
```

!!! note "底层原理：为什么要“先登记空模块到 `sys.modules`，再执行模块代码”？"
    如果等到模块代码全部执行完毕才写入 `sys.modules`，那么一旦模块 A 导入模块 B，而模块 B 又导入模块 A，就会触发无限递归栈溢出（`RecursionError`）。**先行登记空模块对象**的设计，确保了当模块 B 回头执行 `import A` 时，第一阶段查 `sys.modules["A"]` 能立即命中并返回那个尚未执行完的模块 A 对象，从而打断无限递归！（这同时也是后文“循环导入半成品报错”的根源。）

### 模块搜索路径 `sys.path` 的初始化构成（启动脚本目录、`PYTHONPATH`、标准库与虚拟环境 `site-packages`）

`PathFinder` 搜索顶层模块时遍历的 `sys.path`（一个 `list[str]`），在解释器启动时按以下先后顺序组装：

1. **输入脚本所在目录（或当前工作目录）**：
    - 执行 `python /app/run.py` 时，`sys.path[0]` 是 `"/app"`（注意：若开启 Python 3.11+ 的 `-P` 参数或环境变量 `PYTHONSAFEPATH=1`，将不再自动注入脚本所在目录，防止当前目录下的同名文件如 `random.py` 劫持标准库！）；
    - 执行 `python -m pkg.run` 或交互式 REPL 时，`sys.path[0]` 是当前工作目录 `""`（代表 `os.getcwd()`）。
2. **`PYTHONPATH` 环境变量**：如果设置了该环境变量，其中以操作系统路径分隔符指定的目录会紧随其后插入。
3. **标准库目录与动态扩展目录**：Python 安装自带的标准库路径（如 `lib/python3.13` 及 `lib-dynload`）。
4. **`site-packages` 第三方包目录**：由启动时自动导入的 `site` 模块处理 `.pth` 路径配置文件，并将当前激活的虚拟环境（`.venv/lib/python3.13/site-packages`）追加到 `sys.path` 末尾。

### 字节码缓存机制：`__pycache__` 目录、`.pyc` 文件命名以及源码时间戳/哈希校验更新策略

为了避免每次导入模块都重新执行词法分析、语法树（AST）解析和字节码编译（注意：`.pyc` **只会加快模块的加载启动速度，不会加快代码的运行速度**），Python 在首次导入某个 `.py` 模块时，会自动在同一目录下的 `__pycache__/` 子目录中生成编译好的字节码缓存文件：

- **命名规范（PEP 3147）**：例如在 CPython 3.13 下导入 `utils.py`，生成的缓存文件名为 `__pycache__/utils.cpython-313.pyc`。包含解释器实现与大版本号，确保多版本 Python 共存时互不冲突。
- **缓存失效校验策略**：`.pyc` 文件头部包含 16 字节元数据（4 字节 Magic Number + 4 字节位标志 + 8 字节校验载荷）：
    1. **默认时间戳校验（Timestamp-based）**：记录 `.py` 源文件的最后修改时间戳（`mtime`）与文件大小（`size`）。下次导入时只需执行一次轻量级 `stat()` 系统调用，若时间戳与大小完全一致则直接跳过编译加载 `.pyc`；否则重新编译 `.py` 并覆盖更新 `.pyc`。
    2. **确定性哈希校验（Hash-based，PEP 552）**：在 CI 构建、Docker 镜像分发或 Bazel 等构建系统中，文件时间戳往往会被重置导致 `.pyc` 全部失效。通过 `py_compile` 指定 `--invalidation-mode` 可将 `.pyc` 头部改为存储 `.py` 源文件内容的 SipHash-2-4 哈希值，实现与时间戳无关的可重现构建。

### `importlib` 标准库：编程式动态导入 `importlib.import_module()` 与热重载 `importlib.reload()` 的状态残留局限

在插件系统、配置驱动的工厂模式或框架路由加载中，模块名往往是在运行期以字符串形式动态决定的。此时严禁使用 `__import__()`（它是供解释器内部使用的底层钩子），而应使用 **`importlib.import_module(name, package=None)`**：

```python
import importlib

# 1. 绝对动态导入
math_mod = importlib.import_module("math")
assert math_mod.gcd(12, 18) == 6

# 2. 相对动态导入：通过 package 参数提供锚点包名
path_mod = importlib.import_module(".path", package="os")
assert hasattr(path_mod, "join")
```

至于 **`importlib.reload(module)`**，它可以在不重启进程的前提下重新读取并执行已导入模块的代码，但在生产环境中存在严重的**状态残留局限**：

1. **原地覆写同一字典，旧符号不会自动清除**：`reload(mod)` **不会**删除旧模块对象，而是复用原有的 `mod.__dict__` 重新执行源码。如果新版 `mod.py` 中删掉了一个旧函数 `old_fn`，重载后 `mod.old_fn` 依然残留在内存中！
2. **已通过 `from mod import X` 绑定的旧引用不会更新**：其他模块此前通过 `from mod import SomeClass` 拿到的引用依然指向重载前的旧类对象，从而导致极其诡异的 `isinstance(old_obj, mod.SomeClass) is False` 类型分裂问题。

---

## 导入语法、绝对导入与相对导入

### `import mod` 与 `from mod import name` 的名字绑定差异（为什么在外部直接修改或重绑定模块内变量会导致跨模块状态失步）

虽然 `import mod` 和 `from mod import name` 都会在底层完整加载模块 `mod` 并缓存到 `sys.modules["mod"]`，但它们在**当前调用方命名空间中的名字绑定行为**截然不同：

- **`import mod`**：仅在当前命名空间绑定模块对象引用 `mod`。后续每次写 `mod.CONFIG`，都是在运行期去 `mod.__dict__` 中动态查找最新的 `"CONFIG"` 属性。
- **`from mod import CONFIG`**：在导入执行的那一瞬间，将 `mod.CONFIG` 当前指向的对象**直接复制绑定到当前模块的局部变量 `CONFIG` 上**（等价于 `import mod; CONFIG = mod.CONFIG; del mod`）。

这就引出了经典的**跨模块全局变量重绑定失步陷阱**：

```python
import types

# 模拟一个配置模块 config_mod
config_mod = types.ModuleType("config_mod")
config_mod.CURRENT_USER = "guest"
config_mod.ALLOW_LIST = ["admin"]

# 模拟模块 A 执行了：from config_mod import CURRENT_USER, ALLOW_LIST
local_user_binding = config_mod.CURRENT_USER
local_list_binding = config_mod.ALLOW_LIST

# 此时如果在模块 B 中对 config_mod.CURRENT_USER 进行了“重绑定赋值（Rebinding）”：
config_mod.CURRENT_USER = "alice"

# 陷阱！模块 A 中的 local_user_binding 依然指向旧字符串 "guest"，与 config_mod 彻底失步！
assert config_mod.CURRENT_USER == "alice"
assert local_user_binding == "guest"

# 对比：如果是对可变对象进行“原地修改（In-place Mutation）”，由于指向同一列表对象，双方依然同步
config_mod.ALLOW_LIST.append("alice")
assert local_list_binding == ["admin", "alice"]
```

!!! tip "工程实践"
    如果一个模块内存在会在运行期被重新赋值的状态变量，外部消费者**必须使用 `import config_mod` 并通过 `config_mod.CURRENT_USER` 访问**，绝不要使用 `from config_mod import CURRENT_USER`。

### 常规包（Regular Packages）的目录结构与 `__init__.py` 的初始化及 API 汇聚职责

在 Python 中，**包（Package）本质上是一种包含子模块的特殊模块**。凡是在运行时拥有 **`__path__`** 属性（记录子模块搜索目录列表）的模块对象，都被 Python 视为包。

一个标准的**常规包（Regular Package）**对应磁盘上的一个包含 `__init__.py` 文件的目录：

```text
my_project/
└── analytics/              # 常规包 analytics
    ├── __init__.py         # 包初始化入口，导入 analytics 时自动执行
    ├── core.py             # 子模块 analytics.core
    └── exporters/          # 子包 analytics.exporters
        ├── __init__.py
        └── csv_ext.py      # 子模块 analytics.exporters.csv_ext
```

当外部执行 `import analytics.exporters.csv_ext` 时，Python 会**自顶向下依次加载并执行每一级父包的 `__init__.py`**：
1. 先加载并执行 `analytics/__init__.py`（存入 `sys.modules["analytics"]`）；
2. 再加载并执行 `analytics/exporters/__init__.py`（存入 `sys.modules["analytics.exporters"]`，并将其作为属性挂载到 `analytics.exporters`）；
3. 最后加载并执行 `analytics/exporters/csv_ext.py`。

在现代库设计中，`__init__.py` 的核心职责是**门面汇聚（Facade / API Exposure）**——保持文件轻量化，通过将内部深层子模块的核心公共类/函数提升（Re-export）到顶层包命名空间（如在 `analytics/__init__.py` 中写 `from .core import Engine`），让用户无需关心内部目录拆分，直接通过 `from analytics import Engine` 即可使用。

### 绝对导入（Absolute Imports，从项目根路径出发）与显式相对导入（Relative Imports，`.` 与 `..`）的对比与适用场景

在包内部的子模块之间互相引用时，可以使用两种导入路径语法：

- **绝对导入（Absolute Imports）**：从 `sys.path` 根目录下的顶层包名开始书写完整点分路径，如 `from analytics.exporters import csv_ext`。
- **显式相对导入（Explicit Relative Imports）**：以领头的点号 `.` 表示相对于当前模块所属包（`__package__`）的层级偏移，**只能配合 `from ... import ...` 语法使用**（不能写 `import .core`）：
    - 单点 `.` 代表当前模块所在的父包目录（如在 `analytics/core.py` 中写 `from .exporters import csv_ext`）；
    - 双点 `..` 代表上一级父包目录（如在 `analytics/exporters/csv_ext.py` 中写 `from ..core import Engine`）。

| 对比维度 | 绝对导入（`from pkg.sub import mod`） | 显式相对导入（`from .sub import mod`） |
| :--- | :--- | :--- |
| **路径可读性** | 任何位置一眼就能看出目标模块的全局完整归属路径（PEP 8 首选推荐） | 紧凑简短，体现包内高内聚的兄弟/父子关系；但超过两层（`...`）后可读性急剧下降 |
| **包重命名与重构韧性** | 若顶层包 `pkg` 改名，包内所有绝对导入语句均需批量替换 | **极高内聚**：只要包内部相对结构不变，顶层包目录任意改名或整体迁移均无需修改包内代码 |
| **解析依赖** | 直接从 `sys.path` 顶层向下查找 | 严格依赖当前模块的 **`__package__`** 属性进行字符串前缀拼接转换 |
| **推荐适用场景** | 跨顶层领域模块调用、应用程序业务代码、超过 2 层跨度的包内引用 | 紧耦合的同一子包内部兄弟模块互引、以及 `__init__.py` 汇聚本包子模块 |

### 经典报错剖析：直接运行包内子模块触发 `ImportError: attempted relative import with no known parent package` 的成因与 `python -m pkg.mod` 标准启动方式

几乎所有 Python 开发者都遇到过这样一个经典报错：在包内部的子模块 `analytics/exporters/csv_ext.py` 中写了相对导入 `from ..core import Engine`，当在终端直接执行 `python analytics/exporters/csv_ext.py` 时，立即崩溃并抛出：

> `ImportError: attempted relative import with no known parent package`

**底层成因推演**：
1. 相对导入的解析完全依赖当前模块的 `__name__` 与 **`__package__`** 属性。例如当 `__package__ == "analytics.exporters"` 时，解释器才知道 `..core` 应该向上回退一级拼接为 `"analytics.core"`。
2. 当你以文件路径方式直接运行 `python analytics/exporters/csv_ext.py` 时：
    - 解释器把 `analytics/exporters/` 这个子目录直接塞进了 `sys.path[0]`，而根本不知道外层项目根目录的存在；
    - 更致命的是，解释器将入口文件的 `__name__` 强制设为 `"__main__"`，并将其 **`__package__` 设为 `None`**！
    - 随后执行到 `from ..core import Engine` 时，解释器发现 `__package__` 是 `None`，既不知道当前文件属于哪个包，更无从向上回退两级，于是直接抛出上述 `ImportError`。

**唯一标准的工程解法**：永远从**项目根目录（即顶层包 `analytics` 所在的父目录）**出发，使用 **`-m`（Module 模式）**启动包内模块：

```sh
# 错误方式：把包内脚本直接当孤立文件运行（__package__ 为 None，且污染 sys.path[0]）
# python analytics/exporters/csv_ext.py

# 正确方式：在项目根目录下使用 -m 按完整模块名启动
python -m analytics.exporters.csv_ext
```

使用 `python -m analytics.exporters.csv_ext` 启动时：
- 当前工作目录（项目根目录）被加入 `sys.path[0]`；
- 导入系统先正常加载父包 `analytics` 和 `analytics.exporters`；
- 虽然 `csv_ext.py` 的 `__name__` 依然是 `"__main__"`，但它的 **`__package__` 被正确设置为 `"analytics.exporters"`**，且 **`__spec__.name` 为 `"analytics.exporters.csv_ext"`**，所有相对导入与绝对导入均畅通无阻！

---

## 导出控制（`__all__`）、延迟加载与命名空间包

### `__all__` 字符串列表：控制 `from module import *` 的公开符号集合与 IDE / 类型检查器的导出契约

在模块或包的 `__init__.py` 顶层定义 **`__all__: list[str] = [...]`**（字符串列表或元组），承担着双重工程职责：

1. **运行时通配符导出白名单**：当外部执行 `from module import *` 时，解释器**只导入 `__all__` 列表中显式列出的名字**（哪怕某个名字以单下划线 `_` 开头，只要写进了 `__all__` 也会被导入；反之，未列入 `__all__` 的所有公开名字和模块内部导入的第三方辅助库如 `os`、`typing` 都不会被泄露出去）。
2. **静态类型检查器（`mypy` / `pyright`）与文档生成器的公开 API 契约**：在开启严格类型检查（如 `pyright` 或 `mypy --no-implicit-reexport`）时，`__init__.py` 中导入的符号只有被列入 `__all__`（或使用了 `from .core import Engine as Engine` 显式重导出语法），才会被静态分析工具认可为该包的正式公开 API。

### 单下划线前缀（`_helper`）的模块级内部私有符号约定

如果一个模块**没有定义 `__all__`**，那么当外部执行 `from module import *` 时，Python 的默认规则是：**导入该模块全局命名空间中所有不以单下划线 `_` 开头的符号**。

因此，在模块级别将内部辅助函数、内部常量或实现细节类命名为 `_parse_header()`、`_DEFAULT_TIMEOUT`，不仅是向人类阅读者传达“这是模块内部私有实现，随时可能破坏性重构，外部请勿依赖”的清晰信号，也能在未定义 `__all__` 时自动阻止其被 `import *` 污染到外部命名空间。

### 模块级魔术方法 `__getattr__` 与 `__dir__`（PEP 562）：实现重量级子模块的按需惰性导入（Lazy Import）与废弃 API 警告

大型科学计算或 AI 库（如 `scipy`、`torch`、`transformers`）旗下往往有数十个重量级子模块。如果在顶层 `__init__.py` 中直接把所有子模块全量导入，用户仅写一行 `import mylib` 就可能耗时数秒并占用数百 MB 内存。

**PEP 562（Python 3.7+）**允许在模块顶层直接定义 **`__getattr__(name: str)`** 和 **`__dir__() -> list[str]`** 函数：
- 当外部访问 `module.some_attr`，且 `"some_attr"` **不在** `module.__dict__` 中时，解释器会自动调用模块级的 `__getattr__("some_attr")`。
- 我们可以在 `__getattr__` 内部使用 `importlib.import_module()` 实现**按需惰性导入（Lazy Import）**，并将加载后的对象写回 `globals()[name]` 缓存起来（这样第二次访问时直接命中 `module.__dict__`，达到零额外开销）；或者在此处对已重命名的旧版属性发出 `DeprecationWarning`！

```python
import importlib
import types
import warnings

# 演示 PEP 562 模块级 __getattr__ 的惰性加载与废弃属性拦截机制
lazy_pkg = types.ModuleType("lazy_pkg")

pkg_code = """
import importlib
import warnings

__all__ = ["json", "decimals"]

_LAZY_SUBMODULES = {"json": "json", "decimals": "decimal"}

def __getattr__(name: str):
    # 1. 按需惰性加载重量级子模块，并写回 globals() 缓存避免二次触发 __getattr__
    if name in _LAZY_SUBMODULES:
        mod = importlib.import_module(_LAZY_SUBMODULES[name])
        globals()[name] = mod
        return mod

    # 2. 对旧版废弃符号发出 DeprecationWarning 并转发到新符号
    if name == "old_json":
        warnings.warn("'old_json' is deprecated, use 'json'", DeprecationWarning, stacklevel=2)
        return __getattr__("json")

    raise AttributeError(f"module {__name__!r} has no attribute {name!r}")

def __dir__() -> list[str]:
    return sorted(list(globals().keys()) + list(_LAZY_SUBMODULES.keys()))
"""

exec(pkg_code, lazy_pkg.__dict__)

# 访问前："json" 尚未存在于模块字典中
assert "json" not in lazy_pkg.__dict__

# 首次访问 lazy_pkg.json：触发模块级 __getattr__ 动态加载并自动缓存到 __dict__
assert lazy_pkg.json.dumps({"ok": True}) == '{"ok": true}'
assert "json" in lazy_pkg.__dict__
assert "decimals" in dir(lazy_pkg)
```

### 命名空间包（Namespace Packages，PEP 420）：无需 `__init__.py` 的跨目录逻辑合并机制与大型插件化体系应用

除了包含 `__init__.py` 的常规包外，**PEP 420（Python 3.3+）**还引入了**原生命名空间包（Namespace Packages）**：

- 当 `PathFinder` 在 `sys.path` 的一个或多个目录下发现了同名文件夹（例如 `/path_a/company_plugins/auth/` 和 `/path_b/company_plugins/billing/`），且这些 `company_plugins/` 顶层目录下**均没有 `__init__.py` 文件**时，Python 不会报错，而是自动将它们合并为一个逻辑上的**命名空间包 `company_plugins`**！
- 该命名空间包对象的 `__path__` 属性是一个可动态更新的 `_NamespacePath`，同时包含 `["/path_a/company_plugins", "/path_b/company_plugins"]`，且其 `__file__` 为 `None`。
- **工程应用价值**：大型企业或开源生态（如 `google.cloud.storage`、`opentelemetry.instrumentation.*`）可以将庞大的产品线拆分为数十个独立发布、独立安装的 `pip` Wheel 包，而共享同一个顶层品牌命名空间 `company_plugins.*`。

| 特性对比 | 常规包（Regular Package） | 命名空间包（Namespace Package，PEP 420） |
| :--- | :--- | :--- |
| **标识文件** | 目录内**必须包含 `__init__.py`** | 目录内**绝对不能有 `__init__.py`** |
| **物理目录分布** | 整个包树必须位于单一物理根目录下 | 可跨 `sys.path` 下的多个独立目录或独立安装的 Wheel 包逻辑合并 |
| **`__file__` 属性** | 指向 `pkg/__init__.py` 的绝对路径 | `None`（因为没有单一对应的初始化文件） |
| **导入时初始化代码** | 导入时自动执行 `__init__.py` | 无顶层初始化代码，仅聚合子模块搜索路径 `__path__` |

---

## 循环导入（Circular Imports）成因推演与工程解法

### 循环导入崩盘时序推演：为什么 `sys.modules` 中已存在半成品模块对象，而 `from a import x` 却抛出 `ImportError: cannot import name 'x' from partially initialized module`？

很多初学者以为“循环导入就是两个模块死循环递归导入导致栈溢出”。实际上，正如前文导入流程第三阶段所述，Python 早在执行模块代码前就已经把空模块对象登记到了 `sys.modules` 中，因此**循环导入绝不会无限递归**。

真正的崩盘原因是**访问了尚未执行到定义处的“半成品模块（Partially Initialized Module）”属性**。让我们用最典型的双模块互引推演其精确时序：

```python
# --- 文件 a.py ---
from b import func_b      # [时刻 2] a.py 在第 1 行暂停，转去首次加载 b.py！
                          # 注意：此时第 4 行的 func_a 根本还没有被执行定义！
def func_a():
    return "A"

# --- 文件 b.py ---
from a import func_a      # [时刻 4] b.py 查 sys.modules["a"] 命中了时刻 1 登记的半成品 a！
                          # 随后尝试从半成品 a.__dict__ 中提取 "func_a"，发现不存在，当场崩溃！
def func_b():
    return func_a()
```

完整时序表如下：

| 时刻 | 动作主体 | `sys.modules` 状态与模块内部 `__dict__` 状态 | 结果 |
| :--- | :--- | :--- | :--- |
| **T1** | 导入 `a` | `sys.modules["a"] = <空模块 a>`；开始执行 `a.py` 第 1 行 | `a.__dict__` 中尚无 `func_a` |
| **T2** | `a.py` 第 1 行：`from b import func_b` | `sys.modules` 中无 `"b"`；`a.py` **暂停在第 1 行**，转去加载 `b.py` | `a` 处于**半初始化冻结状态** |
| **T3** | 导入 `b` | `sys.modules["b"] = <空模块 b>`；开始执行 `b.py` 第 1 行 | `b.__dict__` 中尚无 `func_b` |
| **T4** | `b.py` 第 1 行：`from a import func_a` | 查 `sys.modules["a"]` **直接命中 T1 的半成品模块 `a`**（不重新执行 `a.py`），接着在 `a.__dict__` 中查找 `"func_a"` | 查找失败！直接抛出 `ImportError: cannot import name 'func_a' from partially initialized module 'a' (most likely due to a circular import)` |

理解了这一时序，解决循环导入的四大工程方案便水落石出：

### 解法一（治本）：重构模块依赖方向——提取公共基础模块下沉或采用依赖注入打破双向耦合

循环导入在 90% 的情况下是**模块职责划分不清晰（架构坏味道）**的体现。治本之策是将双向图重构为**有向无环图（DAG）**：

- **提取公共层下沉（Extract Common Module）**：如果 `models.py` 和 `schemas.py` 互相引用对方的常量或基类，应将双方共同依赖的枚举、基础类型或协议接口提取到更底层的 `base.py` 或 `types.py` 中，让 `models` 和 `schemas` 单向依赖 `base`。
- **上浮编排层或依赖注入（Dependency Injection）**：通过参数传递、回调函数或抽象协议（`typing.Protocol`）在运行时注入协作对象，而不是在模块顶层硬编码互相导入。

### 解法二：改用 `import mod` 仅导入模块引用，将具体属性访问 `mod.func()` 推迟到函数运行期

如果两个模块确实需要互相调用对方的**函数**（而非在模块顶层如类继承定义时立即使用对方的符号），只需将 `from a import func_a` 改为 **`import a`**，并在函数体内部通过 **`a.func_a()`** 访问：

- **为什么有效？** 在上述 T4 时刻，如果 `b.py` 写的是 `import a`，它只需要把 `sys.modules["a"]` 中的半成品模块引用绑定到名字 `a` 上，**不需要在导入期立即访问 `a.func_a`**！随后 `b.py` 顺利执行完并定义好 `func_b`，返回 `a.py` 继续往下执行并定义好 `func_a`。等到后续真正调用 `func_b()` 时，两个模块的顶层代码早已全部初始化完毕，`a.func_a()` 就能正常访问了。

### 解法三：将 `import` 语句移入函数或方法体内部实现局部延迟导入（Local Import）

当两个模块存在难以立刻重构的历史包袱，或者某个依赖仅在极少数分支函数中用到时，可以将 `from a import func_a` **从模块顶层移入具体的函数或方法体内部**：

- 函数体内的代码在模块导入期（`def` 定义函数时）根本不会执行；
- 等到运行期真正调用该函数时，所有模块均已完成顶层初始化，此时执行局部 `import` 只是一次极快的 `sys.modules` 字典查表（纳秒级开销）。

### 解法四：仅因类型注解（Type Hints）引发的循环依赖——使用 `from __future__ import annotations` 与 `if typing.TYPE_CHECKING:` 实现零运行时导入

在现代类型化 Python 代码中，极其常见的一种情况是：**模块 `user.py` 和 `order.py` 在运行时业务逻辑上根本不需要互相导入，仅仅是为了给方法参数写类型注解（如 `def add_order(self, order: Order) -> None:`）而互相 `from order import Order`**，结果引发了运行期循环导入崩溃！

标准工程解法是结合 **`from __future__ import annotations`**（PEP 563，使所有类型注解在编译期自动转化为延迟求值的字符串，不在模块导入期求值）与 **`typing.TYPE_CHECKING`** 常量（该常量在静态类型检查器 `mypy`/`pyright` 分析时为 `True`，而在 **Python 真实运行时恒为 `False`**）：

```python
from __future__ import annotations
from typing import TYPE_CHECKING

# 真实运行时 TYPE_CHECKING 为 False，此块内的导入在运行期完全不执行，彻底消除循环导入与启动开销！
if TYPE_CHECKING:
    from collections.abc import Sequence

def format_tags(tags: Sequence[str]) -> str:
    return ",".join(tags)

assert TYPE_CHECKING is False
assert format_tags(["python", "typing"]) == "python,typing"
```

| 循环导入解法 | 适用场景 | 优点 | 局限性 |
| :--- | :--- | :--- | :--- |
| **1. 重构为 DAG（下沉公共层）** | 任何新项目及核心业务架构 | 彻底消除双向耦合，代码分层清晰 | 对庞大遗留代码库改造成本较高 |
| **2. 顶层改用 `import mod`** | 双方仅在**函数体内部**互相调用对方的函数或类 | 保持顶层导入规范，一目了然 | 若在模块顶层（如类继承 `class B(a.A):` 或装饰器）立即访问 `a.X`，依然会报错 |
| **3. 函数内局部导入（Local Import）** | 遗留代码解耦、或按需延迟加载冷门重型依赖 | 改动最小，100% 避开导入期半成品阶段 | 违背 PEP 8 顶层导入惯例，隐藏了模块依赖关系 |
| **4. `TYPE_CHECKING` + `annotations`** | **仅因类型注解（Type Hints）**需要引用对方类 | **零运行时开销**，兼顾完美的 IDE 类型推导与零循环依赖 | 仅适用于类型注解，不能用于运行时实例化或 `isinstance()` 检查 |

---

## 练习与实战

### 练习 1：模拟 `sys.modules` 先行登记机制与构建轻量级内存中模块加载器

请编写一个函数 `load_in_memory_module(name: str, source_code: str) -> types.ModuleType`，模拟 Python 导入流程的**第一阶段与第三阶段**核心语义：

1. **缓存短路**：如果 `name` 已经存在于 `sys.modules` 中，直接返回 `sys.modules[name]`，不重复执行 `source_code`。
2. **先行登记与回滚保护**：如果未命中缓存，创建一个 `types.ModuleType(name)` 实例，**在执行 `exec(source_code, mod.__dict__)` 之前先行将其登记到 `sys.modules[name]`**（以便 `source_code` 内部可以通过 `sys.modules[__name__]` 访问到模块自身）。
3. **异常清理**：如果 `exec()` 执行期间抛出了任何异常，**必须将 `sys.modules[name]` 从缓存字典中清除**，随后将原始异常原样重抛。

??? success "点击查看答案与解析"
    **核心思路**：先查 `sys.modules` 字典；未命中时创建 `ModuleType` 并先写入 `sys.modules[name] = mod`，随后在 `try ... except Exception:` 块中执行 `exec(source_code, mod.__dict__)`。一旦 `exec` 抛错，在 `except` 块中执行 `sys.modules.pop(name, None)` 回滚半成品注册，并使用裸 `raise` 重抛异常。

    ```python
    import sys
    import types

    def load_in_memory_module(name: str, source_code: str) -> types.ModuleType:
        # 第一阶段：sys.modules 缓存查表短路
        if name in sys.modules:
            return sys.modules[name]

        # 第三阶段：创建空模块并先行登记到 sys.modules
        mod = types.ModuleType(name)
        sys.modules[name] = mod
        try:
            exec(source_code, mod.__dict__)
        except Exception:
            # 初始化失败时必须清理 sys.modules 中的半成品记录
            sys.modules.pop(name, None)
            raise
        return mod

    mod_name = "_test_virtual_plugin"
    sys.modules.pop(mod_name, None)

    try:
        # 1. 验证代码执行期间模块自身已存在于 sys.modules 中，且二次加载直接走缓存
        code = "import sys\nSELF_REGISTERED = (__name__ in sys.modules)\nCOUNTER = 1"
        m1 = load_in_memory_module(mod_name, code)
        assert m1.SELF_REGISTERED is True
        m2 = load_in_memory_module(mod_name, "COUNTER = 999")
        assert m1 is m2 and m2.COUNTER == 1
    finally:
        sys.modules.pop(mod_name, None)

    # 2. 验证执行失败时自动从 sys.modules 回滚清除
    bad_name = "_test_broken_plugin"
    try:
        load_in_memory_module(bad_name, "X = 1 / 0")
    except ZeroDivisionError:
        pass
    assert bad_name not in sys.modules
    ```

### 练习 2：利用 PEP 562 模块级 `__getattr__` 实现支持懒加载与废弃别名自动转发的模块门面

假设你正在重构一个包的顶层门面模块。请在一个动态创建的模块 `facade_mod` 中实现 PEP 562 的 `__getattr__(name: str)` 与 `__dir__()`：

1. 提供惰性加载映射表 `_LAZY_TARGETS = {"Path": ("pathlib", "Path"), "deque": ("collections", "deque")}`：当首次访问 `facade_mod.Path` 或 `facade_mod.deque` 时，通过 `importlib.import_module()` 动态导入目标模块并取出对应类，**同时将其缓存进当前模块的全局命名空间**（后续再次访问时不再触发 `__getattr__`），并在外部可观测计数器 `LOAD_COUNT` 上加 `1`。
2. 提供废弃别名映射表 `_DEPRECATED_ALIASES = {"FifoQueue": "deque"}`：当访问 `facade_mod.FifoQueue` 时，发出一条 `DeprecationWarning`（`stacklevel=2`），并自动转发返回 `deque` 类。
3. 访问其他未知属性时抛出标准 `AttributeError`。

??? success "点击查看答案与解析"
    **核心思路**：在模块级 `__getattr__` 中先检查 `name` 是否属于废弃别名（若是则 `warnings.warn` 并递归获取新名字）；再检查是否属于 `_LAZY_TARGETS`（若是则 `import_module` 取出属性，写入 `globals()[name] = attr` 实现缓存，并递增 `LOAD_COUNT`）。

    ```python
    import types
    import warnings

    facade_mod = types.ModuleType("facade_mod")
    facade_code = """
    import importlib
    import warnings

    LOAD_COUNT = 0
    _LAZY_TARGETS = {
        "Path": ("pathlib", "Path"),
        "deque": ("collections", "deque"),
    }
    _DEPRECATED_ALIASES = {
        "FifoQueue": "deque",
    }

    def __getattr__(name: str):
        global LOAD_COUNT
        if name in _DEPRECATED_ALIASES:
            new_name = _DEPRECATED_ALIASES[name]
            warnings.warn(
                f"{name!r} is deprecated, use {new_name!r} instead",
                DeprecationWarning,
                stacklevel=2,
            )
            return getattr(importlib.import_module(__name__), new_name) if __name__ in globals() else __getattr__(new_name)

        if name in _LAZY_TARGETS:
            mod_name, attr_name = _LAZY_TARGETS[name]
            LOAD_COUNT += 1
            target_obj = getattr(importlib.import_module(mod_name), attr_name)
            globals()[name] = target_obj  # 缓存到模块 __dict__，后续访问零开销
            return target_obj

        raise AttributeError(f"module {__name__!r} has no attribute {name!r}")

    def __dir__() -> list[str]:
        return sorted(set(globals().keys()) | set(_LAZY_TARGETS.keys()))
    """

    exec(facade_code, facade_mod.__dict__)

    # 1. 首次访问 Path 触发懒加载，第二次访问直接命中 __dict__ 缓存（LOAD_COUNT 不再增加）
    assert "Path" not in facade_mod.__dict__
    cls_path = facade_mod.Path
    assert facade_mod.LOAD_COUNT == 1
    assert "Path" in facade_mod.__dict__
    _ = facade_mod.Path
    assert facade_mod.LOAD_COUNT == 1

    # 2. 访问废弃别名 FifoQueue 触发 DeprecationWarning 并正确返回 collections.deque
    with warnings.catch_warnings(record=True) as w:
        warnings.simplefilter("always", DeprecationWarning)
        cls_dq = facade_mod.FifoQueue
        assert len(w) == 1 and "deque" in str(w[0].message)
        assert cls_dq.__name__ == "deque"
    ```

### 练习 3：诊断并修复跨模块变量重绑定失步与循环导入问题

某项目中有两个相互配合的内存模块 `state_store` 与 `worker`：
- `state_store` 维护一个状态配置并通过 `set_token(new_token: str)` 更新当前令牌。
- 原作者在 `worker` 中写了 `from state_store import CURRENT_TOKEN`，结果发现当外部调用 `state_store.set_token("secret_v2")` 后，`worker.build_auth_header()` 拿到的依然是旧的 `"init_token"`！
- 同时，`state_store` 顶层写有 `from worker import validate_token_format`，而 `worker` 顶层又写有 `from state_store import get_token`，导致首次导入时触发循环导入崩溃。

请在下方测试代码中重构 `state_store_code` 与 `worker_code` 字符串，使其通过 `import state_store` 模块级属性引用消除状态失步，并解决循环导入问题。

??? success "点击查看答案与解析"
    **核心思路**：
    1. 将 `from mod import func` 改为 `import mod`（仅导入模块对象引用），把对 `worker.validate_token_format(...)` 和 `state_store.CURRENT_TOKEN` 的属性访问推迟到函数运行期执行。
    2. 如此一来，既打破了导入期的半成品属性查找（彻底消除循环导入 `ImportError`），又保证了 `worker.build_auth_header()` 每次都在运行期实时读取 `state_store.CURRENT_TOKEN` 的最新值。

    ```python
    import sys
    import types

    state_store_code = """
    import _ex3_worker as worker

    CURRENT_TOKEN = "init_token"

    def set_token(new_token: str) -> None:
        global CURRENT_TOKEN
        # 在函数运行期通过模块引用调用 worker.validate_token_format
        if not worker.validate_token_format(new_token):
            raise ValueError("Invalid token format")
        CURRENT_TOKEN = new_token
    """

    worker_code = """
    import _ex3_state_store as state_store

    def validate_token_format(token: str) -> bool:
        return token.startswith("secret_")

    def build_auth_header() -> str:
        # 始终通过模块对象引用读取最新属性，彻底避免 from ... import 值拷贝失步
        return f"Bearer {state_store.CURRENT_TOKEN}"
    """

    # 模拟两个互相导入的模块加载流程
    m_store = types.ModuleType("_ex3_state_store")
    m_worker = types.ModuleType("_ex3_worker")
    sys.modules["_ex3_state_store"] = m_store
    sys.modules["_ex3_worker"] = m_worker

    try:
        exec(state_store_code, m_store.__dict__)
        exec(worker_code, m_worker.__dict__)

        assert m_worker.build_auth_header() == "Bearer init_token"

        # 更新 state_store 中的全局变量后，worker 能立即读取到最新绑定值
        m_store.set_token("secret_v2")
        assert m_worker.build_auth_header() == "Bearer secret_v2"
    finally:
        sys.modules.pop("_ex3_state_store", None)
        sys.modules.pop("_ex3_worker", None)
    ```
