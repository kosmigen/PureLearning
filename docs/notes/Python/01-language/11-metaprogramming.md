# 高级特性与元编程

在 Python 中，“**万物皆对象（Everything is an Object）**”绝非一句空洞的口号：不仅整数、字符串和实例是对象，**函数、方法、模块乃至“类（Class）”本身，全都是在运行期动态分配于堆内存中的一等对象（First-Class Objects）**。

**元编程（Metaprogramming）** 就是“编写能够检查、拦截、生成或转换其他代码的代码”。从最轻量的运行时自省与属性反射，到控制属性访问优先级的 **描述符协议（Descriptor Protocol）**、重塑实例内存布局的 `__slots__`，再到接管类创建生命周期的 `__init_subclass__`、**元类（Metaclass）** 与 **`ast` 抽象语法树转换**，掌握这套底层机制意味着你真正读懂了 Python 面向对象模型与现代框架（如 Pydantic、SQLAlchemy、Django ORM、pytest、dataclasses）的内部引擎。

---

## 自省（Introspection）与反射（Reflection）

### 运行时类型与身份自省：`type()`、`isinstance()`、`issubclass()`、`id()`、`callable()`、`dir()` 与 `vars()`

- **自省（Introspection）**：在运行期只读地查询对象的类型、身份、所属继承链及内部属性列表。
- **反射（Reflection）**：在自省的基础上，通过字符串名称在运行期动态读取、修改、调用或删除对象的属性与方法。

Python 内置了七个最核心的自省函数，它们各自直接对接底层 `PyObject` 结构体或类型对象（`PyTypeObject`）的槽位：

| 内置函数 | 核心语义与底层机制 | 工程注意事项 |
| --- | --- | --- |
| `type(obj)` | 返回 `obj.__class__`（对象的直接类型） | 不考虑继承关系；除非要求严格匹配精确类（不接受子类），否则类型判断优先用 `isinstance()` |
| `isinstance(obj, cls_or_tuple)` | 判断 `obj` 是否为指定类（或其子类，含虚拟子类 `ABC.register`）的实例；支持 PEP 604 联合类型如 `int \| str` | 注意 `bool` 是 `int` 的子类（`isinstance(True, int) is True`） |
| `issubclass(sub, cls_or_tuple)` | 判断类 `sub` 是否为 `cls` 的子类（类本身也被视为自身的子类） | 第一个参数 `sub` 必须是一个类（`type` 实例），否则抛出 `TypeError` |
| `id(obj)` | 返回对象的唯一整数身份标识（CPython 中即为对象在内存中的虚拟地址） | `a is b` 等价于 `id(a) == id(b)`；注意对象销毁后其内存地址可能被新对象复用 |
| `callable(obj)` | 判断对象是否可通过 `obj()` 调用（检查底层类型对象的 `tp_call` 槽位是否非空，即类是否定义了 `__call__`） | 函数、绑定方法、类（调用类即实例化）以及实现了 `__call__` 的实例均返回 `True` |
| `dir([obj])` | 汇总对象自身 `__dict__`、所属类及其全部基类（MRO）上的所有属性与方法名列表（按字母排序） | 可被类的 `__dir__()` 魔术方法自定义；不带参数调用时返回当前局部作用域的名称列表 |
| `vars([obj])` | 直接返回 `obj.__dict__`（对象的可写属性命名空间字典）；不带参数时等价于 `locals()` | 若对象使用了纯 `__slots__` 且未保留 `"__dict__"`，调用 `vars(obj)` 会抛出 `TypeError` |

```python
class BasePlugin:
    version: str = "1.0"

class MarkdownPlugin(BasePlugin):
    def __init__(self, ext: str = ".md") -> None:
        self.ext = ext

    def __call__(self, text: str) -> str:
        return f"<p>{text}</p>"

plugin = MarkdownPlugin()

# 1. type() vs isinstance()：type() 严格比对直接类，isinstance() 沿着 MRO 向上匹配整个继承链
assert type(plugin) is MarkdownPlugin
assert type(plugin) is not BasePlugin
assert isinstance(plugin, BasePlugin) is True
assert issubclass(MarkdownPlugin, BasePlugin) is True

# 2. callable() 与 vars()
assert callable(plugin) is True  # 因为实现了 __call__
assert vars(plugin) == {"ext": ".md"}  # 仅包含实例自身 __dict__ 中的属性，不含类属性 version
assert "version" in dir(plugin)  # dir() 会向上遍历类和基类，因此包含类属性 version
```

### 动态属性反射四剑客：`getattr(obj, name, default)`、`setattr(obj, name, val)`、`hasattr(obj, name)` 与 `delattr(obj, name)`

当属性或方法名在编码期未知，而是来自配置文件、RPC 请求字段或用户输入字符串时，使用反射四剑客替代硬编码的点号语法（`obj.attr`）：

| 反射函数 | 等价的点号语法（当名称为字面量 `"x"` 时） | 找不到属性或异常时的行为 |
| --- | --- | --- |
| `getattr(obj, "x")` | `obj.x` | 抛出 `AttributeError` |
| `getattr(obj, "x", default)` | `try: return obj.x except AttributeError: return default` | 安全返回 `default` 默认值 |
| `hasattr(obj, "x")` | 调用 `getattr(obj, "x")` 并捕获 `AttributeError` | 返回 `True` 或 `False`（注意：这会实际触发 `@property` 的计算！） |
| `setattr(obj, "x", val)` | `obj.x = val` | 若目标为无 setter 的 `@property` 或只读 `__slots__` 则抛出 `AttributeError` |
| `delattr(obj, "x")` | `del obj.x` | 若属性不存在则抛出 `AttributeError` |

```python
class Config:
    def __init__(self) -> None:
        self.host = "127.0.0.1"
        self.port = 8000

cfg = Config()
updates = {"port": 9090, "debug": True}

# 动态批量注入或更新属性
for key, val in updates.items():
    setattr(cfg, key, val)

assert getattr(cfg, "port") == 9090
assert getattr(cfg, "debug", False) is True
assert getattr(cfg, "timeout", 30) == 30  # 不存在时返回默认值 30

delattr(cfg, "debug")
assert hasattr(cfg, "debug") is False
```

!!! warning "注意：`hasattr()` 的底层陷阱与 EAFP 原则"
    `hasattr(obj, name)` 的底层实现是**直接尝试调用 `getattr(obj, name)`，一旦捕获到 `AttributeError` 就返回 `False`**。这意味着：
    1. 如果 `name` 是一个耗时或有副作用的 `@property`，仅调用 `hasattr()` 就会触发该属性的计算；如果随后再调一次 `getattr()`，就会重复执行两遍！
    2. 如果 `@property` 内部代码因为 Bug 意外抛出了 `AttributeError`，`hasattr()` 会将其静默吞掉并谎报 `False`。
    因此，推荐直接使用 `val = getattr(obj, name, None)` 或 `try: val = getattr(obj, name) except AttributeError: ...`，一次查找即可拿到结果。

### 基于 `getattr` 的动态方法分派模式（替代冗长的 `if-elif` 分支表）

在编写命令处理器、AST 访问器（如 `ast.NodeVisitor`）、HTTP 动词路由器（如 `BaseHTTPRequestHandler` 中的 `do_GET` / `do_POST`）或事件总线时，利用 `getattr(self, f"handle_{action}", self.handle_unknown)` 可以消除几十行冗长的 `if-elif-else` 分支，实现符合开闭原则的**约定优于配置（Convention over Configuration）分派器**：

```python
from typing import Any

class CommandDispatcher:
    """基于命名前缀 cmd_<name> 的反射方法分派器"""

    def dispatch(self, command: str, *args: Any, **kwargs: Any) -> str:
        # 统一添加固定前缀 "cmd_"，严防外部直接调用 __init__ 或 dispatch 本身
        handler_name = f"cmd_{command.lower()}"
        handler = getattr(self, handler_name, self._default_handler)
        if not callable(handler):
            return self._default_handler(command)
        return handler(*args, **kwargs)

    def _default_handler(self, *args: Any, **kwargs: Any) -> str:
        return "ERROR: Unknown command"

    def cmd_ping(self) -> str:
        return "PONG"

    def cmd_echo(self, message: str, *, upper: bool = False) -> str:
        return message.upper() if upper else message

router = CommandDispatcher()
assert router.dispatch("ping") == "PONG"
assert router.dispatch("echo", "hello", upper=True) == "HELLO"
assert router.dispatch("drop_table") == "ERROR: Unknown command"
```

### `inspect` 标准库核心能力：提取函数签名（`inspect.signature`）、判定对象类别（`isfunction` / `ismethod` / `isgeneratorfunction`）、获取源码与检查调用栈帧

当内置的 `dir()` 和 `getattr()` 不足以满足框架级自省需求（例如 FastAPI 需要解析路由函数的每个参数名称、默认值与类型注解以实现自动依赖注入；或者 `pytest` 需要自动填充测试夹具 `fixture`）时，标准库 `inspect` 模块提供了深度的代码结构检视工具：

1. **函数签名解析（`inspect.signature(callable)`）**：返回 `Signature` 对象，其 `.parameters` 是有序映射，每个 `Parameter` 对象包含 `.name`、`.kind`（`POSITIONAL_ONLY`、`POSITIONAL_OR_KEYWORD`、`VAR_POSITIONAL`、`KEYWORD_ONLY`、`VAR_KEYWORD`）、`.default` 与 `.annotation`；还能通过 `sig.bind(*args, **kwargs)` 在不真正调用函数的情况下模拟参数绑定并校验实参合法性！
2. **精细对象类别判定**：`inspect.isfunction()`（普通函数）、`inspect.ismethod()`（已绑定实例或类的 `types.MethodType`）、`inspect.isgeneratorfunction()`（含 `yield` 的生成器函数）、`inspect.iscoroutinefunction()`（`async def` 异步协程函数）。
3. **源码与栈帧自省**：`inspect.getsource(obj)` 反查对象的 Python 源码文本；`inspect.currentframe()` 获取当前执行栈帧对象。

```python
import inspect
from typing import Any

def build_query(table: str, /, limit: int = 10, *, strict: bool = True) -> str:
    return f"{table}:{limit}:{strict}"

# 1. 提取函数签名并检视每个参数的种类（kind）、默认值与注解
sig = inspect.signature(build_query)
params = list(sig.parameters.values())

assert params[0].name == "table" and params[0].kind is inspect.Parameter.POSITIONAL_ONLY
assert params[1].name == "limit" and params[1].default == 10
assert params[2].name == "strict" and params[2].kind is inspect.Parameter.KEYWORD_ONLY
assert sig.return_annotation is str

# 2. 使用 sig.bind() 模拟实参绑定并自动填充默认值（依赖注入框架与装饰器参数校验的核心机制）
bound = sig.bind("orders", strict=False)
bound.apply_defaults()
assert dict(bound.arguments) == {"table": "orders", "limit": 10, "strict": False}

# 3. 区分未绑定函数（isfunction）与实例绑定方法（ismethod）
class Service:
    def run(self) -> None:
        pass

assert inspect.isfunction(Service.run) is True
assert inspect.ismethod(Service().run) is True
```

---

## `@property` 与属性访问拦截魔术方法

### `@property` 装饰器：将方法访问伪装成属性读写（Getter、`@x.setter` 校验与 `@x.deleter`）及在不破坏外部 API 的前提下演进类设计

在 Java 或 C++ 中，为了防止日后需要加入参数校验或动态计算，往往要求从第一天起就把所有字段写成私有变量并配对 `getX()` / `setX()` 方法。

而在 Python 中，**属性设计应当直接从简洁的公开普通属性（`obj.price`）开始**。当业务演进需要加入边界校验、联动计算或将存储迁移到其他字段时，只需将该属性无缝升级为 `@property`——**外部调用方依然使用完全相同的 `obj.price` 与 `obj.price = 99` 语法，零 API 破坏变更**！

```python
class Temperature:
    def __init__(self, celsius: float) -> None:
        # 注意：初始化时直接赋值给 self.celsius（而非 self._celsius），从而自动复用 @celsius.setter 的绝对零度校验逻辑！
        self.celsius = celsius

    @property
    def celsius(self) -> float:
        """Getter：读取 t.celsius 时触发"""
        return self._celsius

    @celsius.setter
    def celsius(self, value: float) -> None:
        """Setter：执行 t.celsius = val 时触发边界校验"""
        if value < -273.15:
            raise ValueError("Temperature cannot be below absolute zero (-273.15°C)")
        self._celsius = float(value)

    @property
    def fahrenheit(self) -> float:
        """只读派生计算属性：未定义 @fahrenheit.setter，因此外部无法直接对其赋值"""
        return self._celsius * 9.0 / 5.0 + 32.0

t = Temperature(25.0)
assert t.celsius == 25.0
assert t.fahrenheit == 77.0
```

### `@functools.cached_property`：首次访问计算后直接写入实例 `__dict__` 的惰性缓存属性

如果一个只读属性的计算代价较高（如解析配置文件、构建正则状态机或聚合不可变数据集），使用普通的 `@property` 会在每次访问 `obj.attr` 时重复计算。

Python 标准库 `functools.cached_property` 巧妙利用了 **非数据描述符（Non-Data Descriptor）优先级低于实例 `obj.__dict__`** 的底层规则：
1. **首次访问 `obj.heavy_data`**：因为 `obj.__dict__` 中还没有 `"heavy_data"` 这个键，Python 触发类上的 `cached_property.__get__` 执行计算，并将计算结果**直接以同名键 `"heavy_data"` 写入 `obj.__dict__`**。
2. **后续所有访问 `obj.heavy_data`**：因为实例 `obj.__dict__` 的查找优先级高于非数据描述符，Python 直接从 `obj.__dict__["heavy_data"]` 哈希表中以 $O(1)$ 速度取出缓存值，**完全不再经过方法调用**！
3. **手动失效缓存**：只需执行 `del obj.heavy_data`（即从 `obj.__dict__` 中删掉该键），下次访问就会重新触发计算。

```python
from functools import cached_property

class DatasetReport:
    def __init__(self, numbers: tuple[int, ...]) -> None:
        self.numbers = numbers
        self.compute_count = 0

    @cached_property
    def summary_stats(self) -> dict[str, float]:
        self.compute_count += 1
        total = sum(self.numbers)
        return {"sum": float(total), "mean": total / len(self.numbers)}

report = DatasetReport((10, 20, 30))
assert "summary_stats" not in vars(report)

# 首次访问：触发方法计算，并将结果直接写入实例 report.__dict__["summary_stats"]
assert report.summary_stats == {"sum": 60.0, "mean": 20.0}
assert report.compute_count == 1
assert "summary_stats" in vars(report)

# 第二次访问：直接命中 report.__dict__，不再执行方法体
assert report.summary_stats["mean"] == 20.0
assert report.compute_count == 1

# 删除实例属性即可使缓存失效
del report.summary_stats
assert report.summary_stats["sum"] == 60.0
assert report.compute_count == 2
```

!!! warning "注意：`@cached_property` 需要实例拥有 `__dict__`"
    由于 `@cached_property` 依赖将结果回写到实例的 `__dict__` 中，如果一个类声明了 `__slots__`（且未将 `"__dict__"` 加入 `__slots__`），使用 `@cached_property` 会在首次访问时抛出 `TypeError: No '__dict__' attribute on '...' instance to cache '...' property.`。

### 属性拦截魔术方法辨析：`__getattr__`（仅在常规查找失败时兜底调用）vs `__getattribute__`（无条件拦截一切属性访问）

Python 提供了两个名字极其相似、但触发时机和危险程度天差地别的属性读取魔术方法：

| 对比维度 | `__getattr__(self, name: str)` | `__getattribute__(self, name: str)` |
| --- | --- | --- |
| **触发时机** | **仅当常规属性查找（数据描述符、实例 `__dict__`、类及基类属性）彻底失败、即将抛出 `AttributeError` 时**，作为最后的兜底钩子被调用 | **无条件拦截对该实例的一切点号属性访问**（包括访问已存在的普通属性、方法乃至 `self.__dict__` 本身！） |
| **性能影响** | 对正常已存在属性的访问**零性能开销** | 每次 `obj.x` 都会增加一层 Python 函数调用开销 |
| **无限递归风险** | 低（只要不在 `__getattr__` 内访问另一个也不存在的自身属性即可） | **极高**！在 `__getattribute__` 内部哪怕写 `self.x` 或 `self.__dict__`，都会再次触发 `__getattribute__` 导致 `RecursionError` |
| **典型工程用途** | 虚拟属性、动态 RPC/API 客户端代理（如 `client.users.list()`）、惰性模块加载（模块级 `__getattr__`，PEP 562） | 极少使用；仅用于透明代理对象（Proxy）、ORM 延迟加载桩对象或全局访问审计 |

```python
class DynamicAPIClient:
    """利用 __getattr__ 构建链式 REST 路径代理，对已存在的 base_url 访问零干扰"""

    def __init__(self, base_url: str) -> None:
        self.base_url = base_url.rstrip("/")

    def __getattr__(self, endpoint: str) -> "DynamicAPIClient":
        # 仅当访问的属性不在 self.__dict__ 和类方法中时才会走到这里
        if endpoint.startswith("_"):
            raise AttributeError(endpoint)
        return DynamicAPIClient(f"{self.base_url}/{endpoint}")

    def url(self) -> str:
        return self.base_url

client = DynamicAPIClient("https://api.kosmigen.com")
# base_url 和 url() 是真实存在的属性/方法，直接命中，不会触发 __getattr__
# v1、users、profile 不存在，依次通过 __getattr__ 动态拼接路由
assert client.v1.users.profile.url() == "https://api.kosmigen.com/v1/users/profile"
```

### 属性赋值与删除拦截：`__setattr__`、`__delattr__` 及防无限递归铁律（必须委托给 `super().__getattribute__` / `super().__setattr__` 或操作 `__dict__`）

与 `__getattribute__` 类似，一旦在类中定义了 `__setattr__(self, name, value)` 或 `__delattr__(self, name)`，它们就会**无条件拦截对该实例的一切属性赋值（包括 `__init__` 中的 `self.x = 1`）与属性删除操作**。

!!! warning "注意：防无限递归铁律"
    1. 在 `__getattribute__` 内部需要读取实例自身的任何属性（包括 `self.__dict__`）时，**严禁写 `self.xxx` 或 `getattr(self, ...)`**，必须统一调用 **`super().__getattribute__(name)`**（或 `object.__getattribute__(self, name)`）。
    2. 在 `__setattr__` 内部需要真正落盘保存属性时，**严禁写 `self.name = value`**（这会再次触发 `__setattr__` 导致无限递归），必须统一调用 **`super().__setattr__(name, value)`**！（切勿直接写 `self.__dict__[name] = value`，因为这会绕过类上定义的 `@property` setter 和数据描述符，且在 `__slots__` 类上会直接报错）。

```python
class FrozenAfterInit:
    """演示 __setattr__ 与 super().__setattr__：允许在 __init__ 期间赋值，初始化完成后彻底冻结实例"""

    _frozen: bool = False

    def __init__(self, host: str, port: int) -> None:
        self.host = host
        self.port = port
        # 冻结标志落盘
        super().__setattr__("_frozen", True)

    def __setattr__(self, name: str, value: object) -> None:
        if self._frozen:
            raise AttributeError(f"Cannot modify attribute {name!r} on frozen instance")
        # 铁律：必须委托给 super().__setattr__ 完成真实赋值
        super().__setattr__(name, value)

    def __delattr__(self, name: str) -> None:
        if self._frozen:
            raise AttributeError(f"Cannot delete attribute {name!r} on frozen instance")
        super().__delattr__(name)

endpoint = FrozenAfterInit("localhost", 5432)
assert endpoint.host == "localhost"

try:
    endpoint.port = 3306
    assert False, "Should have raised AttributeError"
except AttributeError as exc:
    assert "frozen instance" in str(exc)
```

---

## 描述符协议（Descriptor Protocol）深度剖析

### 描述符核心协议：`__get__(self, instance, owner)`、`__set__(self, instance, value)`、`__delete__(self, instance)` 与 `__set_name__(self, owner, name)` 自动绑定属性名

**描述符（Descriptor）** 是 Python 面向对象体系的基石。只要一个类实现了 `__get__`、`__set__` 或 `__delete__` 这三个魔术方法中的任意一个，并且**将该类的实例作为“类属性”挂载到宿主类（Owner Class）上**，它就成为了一个描述符，能够接管宿主类实例对该属性的读取、赋值与删除行为：

| 描述符协议方法 | 触发时机 | 参数详细含义 |
| --- | --- | --- |
| `__set_name__(self, owner, name)` | **在宿主类 `owner` 创建完成的那一刻自动调用一次**（Python 3.6+ PEP 487） | `owner` 为挂载该描述符的宿主类；`name` 为它在宿主类中的类属性变量名字符串（免去了手写 `age = Field("age")` 的冗余！） |
| `__get__(self, instance, owner=None)` | 读取属性 `obj.attr` 或 `OwnerClass.attr` 时触发 | 若通过**实例**访问（`obj.attr`），`instance` 为 `obj`；若通过**类**直接访问（`OwnerClass.attr`），`instance` 为 `None`（此时惯例是 `if instance is None: return self` 以方便自省描述符本身）。`owner` 始终为宿主类 |
| `__set__(self, instance, value)` | 对实例属性赋值 `obj.attr = value` 时触发 | `instance` 为被赋值的宿主实例 `obj`，`value` 为新值（注：直接对类赋值 `OwnerClass.attr = value` **不会**触发 `__set__`，而是直接覆盖销毁类上的描述符！） |
| `__delete__(self, instance)` | 执行 `del obj.attr` 时触发 | `instance` 为目标宿主实例 `obj` |

### 数据描述符（Data Descriptor：定义了 `__set__` 或 `__delete__`）与非数据描述符（Non-Data Descriptor：仅定义 `__get__`）的本质分界

Python 根据描述符所实现的方法组合，将其严格划分为两个等级，这两个等级直接决定了它在属性查找链中与实例 `obj.__dict__` 谁拥有更高的话语权：

1. **数据描述符（Data Descriptor / Overriding Descriptor）**：定义了 **`__set__` 和/或 `__delete__`** 的描述符（通常同时定义了 `__get__`）。典型代表：`@property`（哪怕是只定义了 getter 的 `@property`，其底层 `property` C 对象依然实现了会抛出 `AttributeError: can't set attribute` 的 `__set__`，因此 **`@property` 永远是数据描述符**！）。
2. **非数据描述符（Non-Data Descriptor / Non-Overriding Descriptor）**：**仅定义了 `__get__`**，没有定义 `__set__` 和 `__delete__` 的描述符。典型代表：类中的**普通函数**、`@classmethod`、`@staticmethod` 以及 `@functools.cached_property`。

### Python 属性查找（`obj.attr`）完整优先级链：数据描述符 > 实例 `obj.__dict__` > 非数据描述符 / 类属性 > `__getattr__` 兜底

当你写下 `obj.attr` 时（假设未重写 `object.__getattribute__`），CPython 底层的 `PyObject_GenericGetAttr` 严格按照以下 **4 级优先级链** 顺序检索：

```
                 obj.attr 属性读取完整查找链（object.__getattribute__）
┌───────────────────────────────────────────────────────────────────────────────────┐
│ 第 1 优先级：【数据描述符（Data Descriptor）】                                      │
│ 在 type(obj).__mro__（类及所有基类）的 __dict__ 中查找 "attr"：                     │
│ 若找到的对象同时具备 __get__ 且具备 (__set__ 或 __delete__)，立即调用其 __get__！     │
├───────────────────────────────────────────────────────────────────────────────────┤
│ 第 2 优先级：【实例自身字典（obj.__dict__）】                                       │
│ 若不是数据描述符，检查实例自身的 obj.__dict__ 中是否存在键 "attr"：                   │
│ 若存在，直接返回 obj.__dict__["attr"]！（实例属性在此处屏蔽非数据描述符与普通类属性） │
├───────────────────────────────────────────────────────────────────────────────────┤
│ 第 3 优先级：【非数据描述符（Non-Data Descriptor）或普通类属性】                     │
│ 若 obj.__dict__ 中不存在，回到步骤 1 在 type(obj).__mro__ 中找到的类属性：           │
│ • 若它定义了 __get__（非数据描述符，如普通方法、cached_property），调用其 __get__    │
│ • 若它只是普通值（如类常量），直接返回该类属性值                                     │
├───────────────────────────────────────────────────────────────────────────────────┤
│ 第 4 优先级：【__getattr__ 兜底钩子】                                               │
│ 若以上 3 步全部未找到，即将抛出 AttributeError：                                    │
│ 若类定义了 __getattr__(self, "attr")，则调用它；否则正式抛出 AttributeError          │
└───────────────────────────────────────────────────────────────────────────────────┘
```

```python
class DataDesc:
    """数据描述符：同时实现了 __get__ 与 __set__（优先级第 1，高于实例 __dict__）"""
    def __get__(self, instance: object, owner: type | None = None) -> str:
        return "from DataDesc"

    def __set__(self, instance: object, value: object) -> None:
        pass

class NonDataDesc:
    """非数据描述符：仅实现了 __get__（优先级第 3，低于实例 __dict__）"""
    def __get__(self, instance: object, owner: type | None = None) -> str:
        return "from NonDataDesc"

class LookupDemo:
    data_attr = DataDesc()
    non_data_attr = NonDataDesc()

demo = LookupDemo()
# 强行往实例自身的 __dict__ 中塞入同名键
vars(demo)["data_attr"] = "from instance __dict__"
vars(demo)["non_data_attr"] = "from instance __dict__"

# 验证优先级铁律：
# 1. 数据描述符（第 1 优先级）无视实例 __dict__ 中的同名键！
assert demo.data_attr == "from DataDesc"
# 2. 实例 __dict__（第 2 优先级）成功覆盖并屏蔽了非数据描述符（第 3 优先级）！
assert demo.non_data_attr == "from instance __dict__"
```

### 揭开 Python 面向对象底层面纱：普通函数（通过 `__get__` 变为绑定方法）、`@property`、`@classmethod`、`@staticmethod` 全部是基于描述符协议的实现

为什么在类中定义的函数 `def foo(self, x): ...`，通过类访问 `MyClass.foo` 得到的是普通函数，而通过实例访问 `obj.foo` 时，第一个参数 `self` 就会被自动绑定，变成绑定方法（`bound method`）？

**因为 Python 中的所有函数对象（`types.FunctionType`）天生都实现了 `__get__` 方法，每一个函数本质上都是一个非数据描述符！** 我们可以用纯 Python 完整还原 `@staticmethod`、`@classmethod` 与绑定方法的底层实现：

```python
import types
from collections.abc import Callable
from typing import Any

class PurePythonStaticMethod[F: Callable[..., Any]]:
    """纯 Python 还原 @staticmethod：在 __get__ 中忽略 instance 和 owner，直接原样返回底层函数"""
    def __init__(self, fn: F) -> None:
        self.fn = fn

    def __get__(self, instance: object, owner: type | None = None) -> F:
        return self.fn

class PurePythonClassMethod[R]:
    """纯 Python 还原 @classmethod：无论通过类还是实例访问，都将宿主类 owner 作为第一个参数 cls 绑定"""
    def __init__(self, fn: Callable[..., R]) -> None:
        self.fn = fn

    def __get__(self, instance: object, owner: type | None = None) -> Callable[..., R]:
        if owner is None:
            owner = type(instance)
        # types.MethodType(func, target) 会生成一个将 target 自动作为第一个参数传入的绑定方法对象
        return types.MethodType(self.fn, owner)

class Greeter:
    def normal_method(self, msg: str) -> str:
        return f"normal:{msg}"

    @PurePythonStaticMethod
    def static_hi(msg: str) -> str:
        return f"static:{msg}"

    @PurePythonClassMethod
    def class_hi(cls, msg: str) -> str:
        return f"{cls.__name__}:{msg}"

g = Greeter()
# 验证普通函数本身就是非数据描述符：g.normal_method 等价于 Greeter.__dict__["normal_method"].__get__(g, Greeter)
raw_func = Greeter.__dict__["normal_method"]
bound_method = raw_func.__get__(g, Greeter)
assert bound_method("ok") == g.normal_method("ok") == "normal:ok"
assert g.static_hi("ok") == Greeter.static_hi("ok") == "static:ok"
assert g.class_hi("ok") == Greeter.class_hi("ok") == "Greeter:ok"
```

### 实战模式：编写结合 `__set_name__` 与实例存储的通用字段类型与范围校验描述符

在编写自定义描述符时，**新手最常犯的致命错误是将实例的属性值保存在描述符自身的 `self.value` 上**——因为描述符实例是挂载在**类**上的单例，所有宿主类实例都会共享同一个描述符对象！

**正确的描述符状态存储铁律**：必须将每个宿主实例的数据存放在**宿主实例 `instance` 自身**上（例如利用 `__set_name__` 自动生成私有属性名 `f"_{name}"`，通过 ` getattr(instance, self.private_name)` 和 `setattr(instance, self.private_name, value)` 读写，既天然兼容 `__slots__`，又随宿主实例一同被垃圾回收，毫无内存泄漏风险）：

```python
from typing import Any, Self, overload

class BoundedNumber[T: (int, float)]:
    """通用数值类型与上下界校验描述符（数据描述符）"""

    def __init__(
        self,
        expected_type: type[T],
        *,
        min_val: T | None = None,
        max_val: T | None = None,
    ) -> None:
        self.expected_type = expected_type
        self.min_val = min_val
        self.max_val = max_val
        self.public_name: str = ""
        self.private_name: str = ""

    def __set_name__(self, owner: type, name: str) -> None:
        # 类创建时自动捕获属性名，并映射为宿主实例上的私有存储名 "_<name>"
        self.public_name = name
        self.private_name = f"_{name}"

    @overload
    def __get__(self, instance: None, owner: type) -> Self: ...

    @overload
    def __get__(self, instance: object, owner: type | None = None) -> T: ...

    def __get__(self, instance: object | None, owner: type | None = None) -> Self | T:
        if instance is None:
            # 通过类直接访问（如 OrderItem.quantity）时返回描述符自身，便于框架自省元数据
            return self
        return getattr(instance, self.private_name)

    def __set__(self, instance: object, value: Any) -> None:
        if isinstance(value, bool) or not isinstance(value, self.expected_type):
            raise TypeError(
                f"Field {self.public_name!r} expects {self.expected_type.__name__}, "
                f"got {type(value).__name__}"
            )
        if self.min_val is not None and value < self.min_val:
            raise ValueError(f"Field {self.public_name!r} must be >= {self.min_val} (got {value})")
        if self.max_val is not None and value > self.max_val:
            raise ValueError(f"Field {self.public_name!r} must be <= {self.max_val} (got {value})")
        # 将校验通过的值存储在宿主实例 instance 自身上，而非描述符 self 上！
        setattr(instance, self.private_name, value)

class OrderItem:
    quantity = BoundedNumber(int, min_val=1, max_val=10_000)
    unit_price = BoundedNumber(float, min_val=0.0)

    def __init__(self, quantity: int, unit_price: float) -> None:
        self.quantity = quantity
        self.unit_price = unit_price

item1 = OrderItem(quantity=5, unit_price=19.9)
item2 = OrderItem(quantity=10, unit_price=9.9)
# 两个实例的数据各自独立存放在 item1._quantity 和 item2._quantity 中，互不干扰
assert item1.quantity == 5 and item2.quantity == 10
assert OrderItem.quantity.min_val == 1  # 通过类访问返回描述符自身
```

---

## `__slots__` 内存布局优化与属性锁定

### 为什么默认实例的 `__dict__` 哈希表在创建百万级小对象时会带来显著的内存开销？

在默认情况下，Python 类的每个实例都会维护一个动态字典 `__dict__` 来存储实例属性。虽然 CPython 3.3+（PEP 412 Key-Sharing Dict）和 3.11+（内联值数组）对实例字典进行了深度优化，但动态 `__dict__` 机制依然需要为每个实例额外维护字典指针、动态扩容余量与弱引用指针（`__weakref__`），并且允许随时向任意实例动态插入新键，一旦发生异常插入还会退化为独立哈希表。

当程序需要在内存中常驻**数百万甚至上千万个结构固定、仅有两三个字段的小型数据对象**（如三维空间网格坐标点 `Point3D(x, y, z)`、K 线行情 Tick 节点、AST 语法树节点或图算法中的边对象）时，`__dict__` 与 `__weakref__` 的累积内存占用以及 CPU 缓存局部性（Cache Locality）损耗就会变得非常可观。

### `__slots__` 的工作原理：取消实例 `__dict__`，在实例底层采用紧凑定长指针数组并通过类级 `member_descriptor` 直接按偏移量读写

在类中声明类属性 `__slots__ = ("x", "y", "z")` 后，CPython 的类构造器会彻底改变该类实例的底层内存布局：

1. **剥离 `__dict__` 与 `__weakref__`**：不再为实例分配动态字典槽位和弱引用槽位。
2. **紧凑定长指针数组（C Struct 布局）**：实例在堆内存中的大小在类创建时就被精确固定，对象头部紧接着就是一块定长的 `PyObject*` 指针数组（第 0 格放 `x`，第 1 格放 `y`，第 2 格放 `z`）。
3. **生成类级数据描述符 `member_descriptor`**：编译器在**类**的 `__dict__` 中为 `"x"`、`"y"`、`"z"` 各生成一个 C 层级的数据描述符（`types.MemberDescriptorType`），其中硬编码了该字段相对于实例结构体首地址的**字节偏移量（Offset）**。访问 `pt.x` 时，不再做实例字典哈希查找，而是通过 `member_descriptor` 直接按内存偏移量一步解引用读取！

| 对比维度 | 默认类（基于 `__dict__`） | 声明了 `__slots__` 的类 |
| --- | --- | --- |
| **底层实例存储结构** | 动态字典 `__dict__`（含 Key-Sharing 优化） | 紧贴 `PyObject_HEAD` 的定长 C 指针数组 |
| **类级属性描述符** | 无（普通实例属性不出现在 `Cls.__dict__` 中） | 为每个槽位生成 `member_descriptor`（数据描述符） |
| **动态新增未声明属性** | 允许（随时可执行 `obj.new_attr = 1`） | **严格禁止**（抛出 `AttributeError`） |
| **单实例内存开销（以 3 个属性为例，64 位 Python）** | 较大（对象本身 + 字典开销，约 104~152+ 字节） | **极小**（仅 56 字节，内存节省可达 **40%~55%**） |

```python
import sys
import types

class RegularPoint:
    def __init__(self, x: float, y: float, z: float) -> None:
        self.x = x
        self.y = y
        self.z = z

class SlottedPoint:
    __slots__ = ("x", "y", "z")

    def __init__(self, x: float, y: float, z: float) -> None:
        self.x = x
        self.y = y
        self.z = z

p_reg = RegularPoint(1.0, 2.0, 3.0)
p_slot = SlottedPoint(1.0, 2.0, 3.0)

# 1. 验证 SlottedPoint 实例没有 __dict__，且类上生成了 member_descriptor 数据描述符
assert hasattr(p_reg, "__dict__") is True
assert hasattr(p_slot, "__dict__") is False
assert isinstance(SlottedPoint.x, types.MemberDescriptorType)

# 2. 验证单实例总内存开销（对象自身 + __dict__）显著降低
reg_bytes = sys.getsizeof(p_reg) + sys.getsizeof(p_reg.__dict__)
slot_bytes = sys.getsizeof(p_slot)
assert slot_bytes < reg_bytes
```

!!! tip "工程实践：`@dataclass(slots=True)`（Python 3.10+）"
    在使用 `dataclasses.dataclass` 定义数据类时，无需手动拼写 `__slots__ = (...)`，只需传入参数 `@dataclass(slots=True)`，标准库就会根据类型注解字段自动为你生成带 `__slots__` 的类！

### 使用 `__slots__` 禁止动态新增未声明属性的行为与把 `"__dict__"` 或 `"__weakref__"` 显式加入 `__slots__` 的兼容技巧

由于默认 `__slots__` 移除了 `__dict__` 和 `__weakref__`，会带来两个限制：
1. 无法向实例赋任何不在 `__slots__` 中的属性（这在很多时候反而是一个优点，能第一时间拦截因手误拼错属性名如 `pt.z_coord = 1` 导致的静默 Bug）。
2. 默认无法对实例创建弱引用 `weakref.ref(obj)`。

如果需要兼顾核心字段的定长槽位性能与弱引用（或允许挂载少量扩展动态属性），可以将 **`"__weakref__"`** 或 **`"__dict__"`** 显式作为字符串元素写进 `__slots__` 元组中：

```python
import weakref

class CacheNode:
    # 显式保留 "__weakref__"，使紧凑的 __slots__ 实例依然支持 weakref.ref() 和 WeakValueDictionary
    __slots__ = ("key", "value", "__weakref__")

    def __init__(self, key: str, value: int) -> None:
        self.key = key
        self.value = value

node = CacheNode("k1", 100)
ref = weakref.ref(node)
assert ref() is node

# 未将 "__dict__" 加入 __slots__ 时，动态新增未声明属性会立即抛出 AttributeError
try:
    node.extra = "blocked"  # type: ignore[attr-defined]
    assert False
except AttributeError:
    pass
```

### `__slots__` 在继承体系中的黄金陷阱：父类与子类必须同时正确声明 `__slots__`（且子类不重复声明父类槽位）才能生效

在类继承体系中使用 `__slots__` 时，必须严格遵守三条黄金法则，否则 `__slots__` 的内存优化会**静默失效**甚至引发极其隐蔽的属性屏蔽 Bug：

1. **子类忘记声明 `__slots__` -> 彻底破功**：如果父类声明了 `__slots__ = ("x",)`，但子类没有声明 `__slots__`，Python 会自动为子类实例重新创建 `__dict__` 和 `__weakref__`！（此时只有 `"x"` 存在槽位中，子类依然背负了 `__dict__` 的内存开销）。即使子类没有新增任何属性，也**必须在子类中显式写上空槽位 `__slots__ = ()`**。
2. **父类未声明 `__slots__`，仅子类声明 -> 依然带有 `__dict__`**：因为父类没有声明 `__slots__`，子类从父类继承了 `__dict__`。
3. **严禁在子类 `__slots__` 中重复声明父类已有的槽位名称**：如果父类有 `__slots__ = ("x",)`，子类又写了 `__slots__ = ("x", "y")`，这不仅会浪费一个重复的底层指针槽位，还会使子类的 `member_descriptor` 覆盖父类的 `member_descriptor`，导致直接调用父类方法访问属性时读到未初始化的旧槽位！**子类 `__slots__` 只能包含子类新增的属性名**。

```python
class BaseEntity:
    __slots__ = ("id",)

    def __init__(self, entity_id: int) -> None:
        self.id = entity_id

class UserEntity(BaseEntity):
    # 正确写法：只声明子类新增的 "username"（若无新增属性则必须写 __slots__ = ()），绝不重复写 "id"！
    __slots__ = ("username",)

    def __init__(self, entity_id: int, username: str) -> None:
        super().__init__(entity_id)
        self.username = username

u = UserEntity(1, "alice")
assert hasattr(u, "__dict__") is False
assert (u.id, u.username) == (1, "alice")
```

---

## 类创建钩子 `__init_subclass__` 与元类（Metaclass）

### `__init_subclass__(cls, **kwargs)`（PEP 487）：无需引入元类即可在子类定义完成时自动执行子类注册、接口规范审查与类属性注入

在 Python 3.6（PEP 487）之前，如果框架希望“每当有用户定义一个继承自 `BasePlugin` 的子类时，自动将该子类注册到全局插件表中，或者自动校验子类是否定义了必需的类属性”，往往被迫动用复杂的元类（Metaclass）。

PEP 487 在 `object` 上引入了类创建钩子 **`__init_subclass__(cls, **kwargs)`**：
- **触发时机**：每当任何子类继承该基类且**子类类体执行完毕、子类对象刚刚创建好的那一刻**，Python 会自动调用父类的 `__init_subclass__`，其中第一个参数 `cls` 就是**刚刚诞生的新子类**！
- **支持类定义关键字参数**：子类甚至可以在继承括号中直接传参（如 `class JsonParser(BaseParser, ext=".json"):`），这些关键字参数会直接转发给父类的 `__init_subclass__(cls, *, ext: str, **kwargs)`！

```python
from typing import Any, ClassVar

class SerializerPlugin:
    """利用 __init_subclass__ 实现零元类的插件自动注册与类定义期参数绑定"""

    _registry: ClassVar[dict[str, type["SerializerPlugin"]]] = {}
    format_name: ClassVar[str]

    def __init_subclass__(cls, *, fmt: str | None = None, abstract: bool = False, **kwargs: Any) -> None:
        super().__init_subclass__(**kwargs)
        if abstract:
            return
        if not fmt:
            raise TypeError(f"Subclass {cls.__name__} must specify 'fmt=...' in class header")
        if fmt in cls._registry:
            raise ValueError(f"Duplicate plugin format registered: {fmt!r}")
        cls.format_name = fmt
        cls._registry[fmt] = cls

    @classmethod
    def create(cls, fmt: str) -> "SerializerPlugin":
        return cls._registry[fmt]()

# 定义子类时在括号内直接传入 fmt="json"，子类定义完成瞬间即自动触发 SerializerPlugin.__init_subclass__
class JsonSerializer(SerializerPlugin, fmt="json"):
    pass

class YamlSerializer(SerializerPlugin, fmt="yaml"):
    pass

assert SerializerPlugin._registry == {"json": JsonSerializer, "yaml": YamlSerializer}
assert isinstance(SerializerPlugin.create("json"), JsonSerializer)
assert JsonSerializer.format_name == "json"
```

### 理解“类也是对象”：`isinstance(MyClass, type)` 与 `type(name, bases, namespace)` 动态运行时造类

在 Python 的类型闭环中：
- 实例（如 `42`、`"hi"`、`u = User()`）是由它的**类**（`int`、`str`、`User`）创建的。
- 而**类本身也是内存中的一个对象**！那么“类对象”是由谁创建的呢？答案是：**所有的类默认都是元类 `type` 的实例**（甚至 `type` 自身也是它自己的实例：`type(type) is type`）！

```
             实例关系 (isinstance)                      继承关系 (issubclass)
   ┌──────────┐          ┌──────────┐             ┌──────────┐
   │   type   │◄─────────│   type   │             │  object  │ (所有类的终极基类)
   └────▲─────┘ (自指)   └────▲─────┘             └────▲─────┘
        │                     │                        │
        │ isinstance          │ isinstance             ├──────────────┐
   ┌────┴─────┐          ┌────┴─────┐             ┌────┴─────┐   ┌────┴─────┐
   │  object  │          │ MyClass  │             │   type   │   │ MyClass  │
   └──────────┘          └────▲─────┘             └──────────┘   └──────────┘
                              │ isinstance
                         ┌────┴─────┐
                         │   obj    │
                         └──────────┘
```

当你写下 `class MyClass(Base): x = 1` 时，Python 解释器在底层实际上是执行了三参数形式的 **`type(name, bases, namespace)`** 来动态构造出这个类对象：

1. `name`（`str`）：类名字符串（成为 `cls.__name__`）。
2. `bases`（`tuple[type, ...]`）：基类元组（成为 `cls.__bases__`，注意单元素元组末尾必须带逗号 `(Base,)`）。
3. `namespace`（`dict[str, Any]`）：存放类属性与方法的命名空间字典（成为 `cls.__dict__`）。

```python
# 使用三参数 type(name, bases, namespace) 在运行期纯动态造类，与 class 关键字完全等价！
DynamicGreeter = type(
    "DynamicGreeter",
    (object,),
    {
        "prefix": "Hello",
        "greet": lambda self, name: f"{self.prefix}, {name}!",
    },
)

assert isinstance(DynamicGreeter, type)
assert issubclass(DynamicGreeter, object)
inst = DynamicGreeter()
assert inst.greet("Python") == "Hello, Python!"
```

### 元类（Metaclass）完整接管类创建生命周期：`__prepare__` 创建命名空间 -> 执行类体代码 -> `__new__` 构建类对象 -> `__init__` 初始化类 -> 元类 `__call__` 控制类实例化过程

既然默认情况下所有的类都是由 `type` 创建的，如果我们**定义一个继承自 `type` 的子类 `class MyMeta(type):`**，并在定义业务类时指定 `class MyModel(metaclass=MyMeta):`，就能彻底接管从“类命名空间准备”到“类对象诞生”乃至“后续该类每一次实例化”的全部生命周期！

#### 阶段一：类定义期（`class MyModel(metaclass=MyMeta):` 执行时）

1. **`MyMeta.__prepare__(metacls, name, bases, **kwargs) -> MutableMapping`**：在类体代码执行**之前**被调用，负责创建并返回用于收集类体变量与方法的命名空间映射（默认返回普通 `dict`；自定义元类可返回自定义映射以拦截类体内同名方法的重复定义或自动注入内置符号）。
2. **执行类体代码**：Python 在 `__prepare__` 返回的 `namespace` 中依次执行 `class` 块内的所有语句。
3. **`MyMeta.__new__(metacls, name, bases, namespace, **kwargs) -> cls`**：类体执行完毕后调用，负责**真正分配并构建类对象 `cls`**（在此阶段可以对 `bases` 进行增删改造，或扫描修改 `namespace` 中的字段）。
4. **`MyMeta.__init__(cls, name, bases, namespace, **kwargs) -> None`**：对刚刚由 `__new__` 构建好的类对象 `cls` 进行后续初始化。

#### 阶段二：类实例化期（调用 `obj = MyModel(*args, **kwargs)` 时）

因为 `MyModel` 是元类 `MyMeta` 的一个实例，所以当你调用 `MyModel()` 时，按照 Python 规则“调用一个对象会触发其所属类型的 `__call__`”，**实际上首先触发的是元类的 `MyMeta.__call__(cls, *args, **kwargs)`**！

默认的 `type.__call__(cls, *args, **kwargs)` 内部做的事情就是：
1. 先调用 `instance = cls.__new__(cls, *args, **kwargs)` 创建实例；
2. 若 `isinstance(instance, cls)` 为真，再调用 `cls.__init__(instance, *args, **kwargs)` 初始化实例；
3. 返回 `instance`。

因此，通过重写元类的 `__call__`，可以轻而易举地实现**全局单例模式（Singleton）**、**对象池复用（Flyweight）**或**禁止直接实例化**！

```python
from collections.abc import MutableMapping
from typing import Any

class NoDuplicateAttrDict(dict[str, Any]):
    """自定义类体命名空间字典：严禁在同一个 class 块内重复定义同名方法或属性（防止手误静默覆盖）"""
    def __setitem__(self, key: str, value: Any) -> None:
        if key in self and not key.startswith("__"):
            raise SyntaxError(f"Duplicate attribute or method definition in class body: {key!r}")
        super().__setitem__(key, value)

class StrictSingletonMeta(type):
    """完整演示元类四大生命周期钩子：__prepare__ -> __new__ -> __init__ -> __call__"""

    @classmethod
    def __prepare__(
        metacls, name: str, bases: tuple[type, ...], **kwargs: Any
    ) -> MutableMapping[str, Any]:
        # 1. 类体执行前：提供防重名覆盖的自定义命名空间
        return NoDuplicateAttrDict()

    def __new__(
        metacls,
        name: str,
        bases: tuple[type, ...],
        namespace: MutableMapping[str, Any],
        **kwargs: Any,
    ) -> "StrictSingletonMeta":
        # 2. 类体执行后：将自定义命名空间转为标准 dict 并构建类对象
        cls = super().__new__(metacls, name, bases, dict(namespace), **kwargs)
        return cls

    def __init__(
        cls,
        name: str,
        bases: tuple[type, ...],
        namespace: MutableMapping[str, Any],
        **kwargs: Any,
    ) -> None:
        # 3. 初始化类对象：在类上挂载单例缓存槽位
        super().__init__(name, bases, namespace, **kwargs)
        cls._singleton_instance: Any = None

    def __call__(cls, *args: Any, **kwargs: Any) -> Any:
        # 4. 拦截类的实例化调用 MyService()：若已存在单例则直接返回，不再调用 MyService.__new__ / __init__
        if cls._singleton_instance is None:
            cls._singleton_instance = super().__call__(*args, **kwargs)
        return cls._singleton_instance

class AppConfig(metaclass=StrictSingletonMeta):
    def __init__(self, env: str = "prod") -> None:
        self.env = env

# 验证元类 __call__ 单例控制：第二次调用 AppConfig("dev") 直接返回首次创建的实例
c1 = AppConfig("prod")
c2 = AppConfig("dev")
assert c1 is c2 and c2.env == "prod"

# 验证元类 __prepare__ 防重复定义检查：在同一个类中写两个同名方法会立即在类定义期报错！
try:
    class BuggyService(metaclass=StrictSingletonMeta):
        def process(self) -> int:
            return 1
        def process(self) -> int:  # 意外重名覆盖！
            return 2
    assert False
except SyntaxError as exc:
    assert "Duplicate attribute" in str(exc)
```

### 元类冲突（Metaclass Conflict）成因与工程选型准则：99% 的场景优先使用类装饰器、`__init_subclass__` 或描述符，仅在框架级（如 ORM、ABC、Enum）动用元类

#### 元类冲突（Metaclass Conflict）是怎么产生的？

当一个子类同时多重继承自两个父类 `class Child(BaseA, BaseB):`，其中 `BaseA` 的元类是 `MetaA`，`BaseB` 的元类是 `MetaB`，如果 **`MetaA` 与 `MetaB` 互不为对方的子类**，Python 就不知道该用 `MetaA` 还是 `MetaB` 去创建 `Child` 类，从而在类定义时直接抛出：
`TypeError: metaclass conflict: the metaclass of a derived class must be a (non-strict) subclass of the metaclasses of all its bases`

要解决元类冲突，必须手动定义一个同时继承自两个元类的合并元类 `class CombinedMeta(MetaA, MetaB): pass`，并显式指定 `class Child(BaseA, BaseB, metaclass=CombinedMeta):`。

#### 元编程技术工程选型决策表

正如 Python 核心开发者 Tim Peters 的名言：*“元类是比 99% 的用户所需更深奥的魔法。如果你在犹豫是否需要元类，那你一定不需要它。”* 在现代 Python（3.12+）中，请严格按由简入繁的梯度选择元编程工具：

| 工程需求场景 | 最佳首选方案 | 为什么不需要动用元类？ |
| --- | --- | --- |
| 校验、转换或代理单个字段的读写 | **描述符（Descriptor）+ `__set_name__`** | 描述符天然可组合，不会污染类的元类层级，且自动获知字段名 |
| 改造单个类（如自动生成 `__repr__`、注册路由或包裹方法） | **类装饰器（Class Decorator，`@decorator`）** | 多个类装饰器可自由叠加且绝不会引发多重继承的 Metaclass Conflict |
| 自动感知所有子类的诞生（插件注册、接口校验、向子类注入属性） | **`__init_subclass__(cls, **kwargs)`** | `object` 原生支持，语法直观，支持类定义关键字参数，零元类冲突 |
| 需要拦截类体执行**之前**的命名空间（`__prepare__`）、动态篡改继承基类元组 `bases`、使类本身支持特殊运算符或自定义 `isinstance`/`issubclass`（`__instancecheck__`） | **元类（Metaclass）** | 只有这些深度介入类构造底层生命周期的场景（如标准库 `abc.ABCMeta`、`enum.EnumMeta`、ORM 表映射引擎）才真正需要元类 |

---

## 动态代码执行与抽象语法树（`exec` / `eval` / `ast`）简介

### `eval()`（求值单个表达式）、`exec()`（执行任意动态语句块）与 `compile()` 的 `globals` / `locals` 命名空间隔离

Python 内置了将字符串源码在运行期即时编译为字节码（`types.CodeType`）并执行的引擎：

| 内置函数 | 对应的 `compile()` 模式 | 功能与返回值 |
| --- | --- | --- |
| `eval(source, globals=None, locals=None)` | `mode="eval"` | **仅能求值单个表达式**（如 `"2 * x + 1"`，不可包含赋值语句 `=`、`def`、`import` 或 `for` 循环），**直接返回该表达式的计算结果** |
| `exec(source, globals=None, locals=None)` | `mode="exec"` | **可执行任意复杂的多行 Python 语句块**（包含函数定义、类定义、导入与循环），**返回值永远为 `None`**（产生的结果需从传入的 `globals` 或 `locals` 字典中提取） |
| `compile(source, filename, mode)` | `"eval"` / `"exec"` / `"single"` | 将源码字符串或 `ast.AST` 语法树节点预编译为可反复高速执行的 `code` 字节码对象，供 `eval(code_obj)` 或 `exec(code_obj)` 复用 |

```python
# 1. 使用 compile + eval 预编译并多次求值数学公式表达式
formula_code = compile("a * x ** 2 + b * x + c", filename="<formula>", mode="eval")
env = {"a": 2, "b": 3, "c": 1, "x": 5}
assert eval(formula_code, {"__builtins__": {}}, env) == 66

# 2. 使用 exec 在受隔离的命名空间字典中动态生成函数并提取出来
namespace: dict[str, object] = {}
exec(
    "def dynamic_adder(n: int) -> int:\n    return n + offset\n",
    {"offset": 100},
    namespace,
)
adder_fn = namespace["dynamic_adder"]
assert callable(adder_fn) and adder_fn(23) == 123
```

### 动态执行的安全红线：代码注入漏洞原理与使用 `ast.literal_eval()` 安全解析基本字面量数据结构

!!! warning "注意：绝对禁止对任何不可信输入调用 `eval()` 或 `exec()`（且 `{\"__builtins__\": {}}` 并非安全沙箱！）"
    1. **远程代码执行（RCE）漏洞**：如果将用户输入直接传给 `eval(user_input)`，攻击者传入 `"__import__('os').system('rm -rf /')"` 即可完全控制服务器。
    2. **`{"__builtins__": {}}` 无法阻止沙箱逃逸**：即便将 `__builtins__` 清空，攻击者依然可以通过空元组字面量一路向上反射回 `object` 基类并遍历所有已加载的危险子类：
       `().__class__.__bases__[0].__subclasses__()`，从中找到 `os._wrap_close` 或 ` subprocess.Popen` 轻松完成沙箱逃逸！
    3. **安全替代方案**：
       - 若需要从字符串中安全解析 Python 基本字面量数据结构（`str`、`bytes`、`int`、`float`、`complex`、`tuple`、`list`、`dict`、`set`、`bool`、`None`），**必须使用 `ast.literal_eval()`**！它只遍历语法树中的字面量节点，遇到任何函数调用、属性访问或运算符都会立即拒绝并抛出 `ValueError`。

```python
import ast

# 1. ast.literal_eval() 可以安全解析嵌套的字面量容器与基础类型
raw_config = "{'hosts': ('10.0.0.1', '10.0.0.2'), 'ports': [80, 443], 'tls': True}"
parsed = ast.literal_eval(raw_config)
assert parsed == {"hosts": ("10.0.0.1", "10.0.0.2"), "ports": [80, 443], "tls": True}

# 2. 面对任何试图调用函数或访问属性的恶意载荷，ast.literal_eval() 在语法树检查阶段直接拦截，绝不执行！
try:
    ast.literal_eval("__import__('os').system('whoami')")
    assert False, "Must reject function calls"
except ValueError:
    pass
```

### `ast` 抽象语法树模块简介：`ast.parse()` 将源码转为语法树、`ast.dump()` 查看结构、`NodeVisitor` 静态分析遍历、`NodeTransformer` 语法树改写与 `ast.unparse()`

标准库 `ast`（Abstract Syntax Trees）将 Python 编译器前端的能力完全开放给开发者。这也是 `ruff` / `flake8` 静态代码检查、以及 **`pytest` 断言重写（Assertion Rewriting：将普通的 `assert a == b` 在导入期自动改写为能打印 `a` 和 `b` 详细中间值的语法树）** 的核心秘密：

| 核心 API / 类 | 功能职责 |
| --- | --- |
| `ast.parse(source, mode="exec")` | 将 Python 源码字符串解析为 `ast.Module`（或 `mode="eval"` 下的 `ast.Expression`）语法树根节点 |
| `ast.dump(tree, indent=2)` | 将 AST 节点树格式化为可读的字符串结构，方便调试查看节点类型 |
| `ast.NodeVisitor` | **只读遍历语法树**的基类：定义 `visit_<NodeType>(self, node)`（如 `visit_Call`、`visit_FunctionDef`）即可精准收集或审查特定语法结构（注意：若要继续深入遍历子节点，必须在方法末尾调用 `self.generic_visit(node)`） |
| `ast.NodeTransformer` | **原地改写/替换语法树**的基类：`visit_<NodeType>(self, node)` 的返回值将直接替换原树中的该节点（返回 `None` 则删除该节点）。改写完毕后**必须调用 `ast.fix_missing_locations(new_tree)`** 修补新节点的行号信息，方可传给 `compile()` 执行！ |
| `ast.unparse(tree)` | （Python 3.9+）将任意修改后的 AST 语法树反向还原为合法的 Python 源代码字符串 |

```python
import ast

# 实战 1：使用 ast.NodeVisitor 编写静态安全审计器，揪出源码中所有对 eval() 或 exec() 的调用
class DangerousCallChecker(ast.NodeVisitor):
    def __init__(self) -> None:
        self.violations: list[tuple[int, str]] = []

    def visit_Call(self, node: ast.Call) -> None:
        if isinstance(node.func, ast.Name) and node.func.id in {"eval", "exec"}:
            self.violations.append((node.lineno, node.func.id))
        # 必须调用 generic_visit 以继续递归检查实参内部的嵌套调用
        self.generic_visit(node)

sample_code = """
x = int("42")
y = eval("1 + 2")
"""
tree = ast.parse(sample_code)
checker = DangerousCallChecker()
checker.visit(tree)
assert checker.violations == [(3, "eval")]

# 实战 2：使用 ast.NodeTransformer 实现编译期常量折叠改写（将所有二元整数加法字面量如 10 + 20 直接在 AST 层面替换为常量 30）
class ConstantAddFolder(ast.NodeTransformer):
    def visit_BinOp(self, node: ast.BinOp) -> ast.AST:
        # 先递归处理子表达式（支持 1 + 2 + 3 多层折叠）
        self.generic_visit(node)
        if (
            isinstance(node.op, ast.Add)
            and isinstance(node.left, ast.Constant)
            and isinstance(node.right, ast.Constant)
            and type(node.left.value) is int
            and type(node.right.value) is int
        ):
            return ast.Constant(value=node.left.value + node.right.value)
        return node

expr_tree = ast.parse("result = 10 + 20 + 30", mode="exec")
optimized_tree = ast.fix_missing_locations(ConstantAddFolder().visit(expr_tree))

# 使用 ast.unparse 将改写后的 AST 还原为 Python 源码，验证 10 + 20 + 30 已被折叠为 60
assert ast.unparse(optimized_tree) == "result = 60"
```

---

## 练习与实战

### 练习 1：结合 `__set_name__` 与 `__init_subclass__` 构建轻量级 ORM 模型校验框架

请不依赖任何第三方库、也不使用元类（Metaclass），仅使用 **描述符协议（`__set_name__` / `__get__` / `__set__`）** 与 **`__init_subclass__`**，实现一个微型声明式数据模型框架：
1. 实现描述符 `StringField(max_length: int)`：要求赋值的对象必须是 `str` 且长度不超过 `max_length`，否则抛出 `TypeError` 或 `ValueError`；实例数据存放在宿主实例自身上。
2. 实现基类 `BaseModel`：在 `__init_subclass__` 中自动扫描子类上声明的所有 `StringField` 描述符，将其字段名收集到子类的类属性 `__fields__: tuple[str, ...]` 中，并提供通用的 `__init__(self, **kwargs)` 与 `to_dict(self) -> dict[str, object]` 方法。

??? success "点击查看答案与解析"
    这一模式正是现代声明式框架的核心缩影：描述符负责单字段的命名捕获与存取校验，而 `__init_subclass__` 负责在子类诞生瞬间汇总所有描述符元数据：

    ```python
    from typing import Any, ClassVar, Self, overload

    class StringField:
        def __init__(self, *, max_length: int) -> None:
            self.max_length = max_length
            self.name = ""
            self.storage_name = ""

        def __set_name__(self, owner: type, name: str) -> None:
            self.name = name
            self.storage_name = f"_field_{name}"

        @overload
        def __get__(self, instance: None, owner: type) -> Self: ...

        @overload
        def __get__(self, instance: object, owner: type | None = None) -> str: ...

        def __get__(self, instance: object | None, owner: type | None = None) -> Self | str:
            if instance is None:
                return self
            return getattr(instance, self.storage_name)

        def __set__(self, instance: object, value: Any) -> None:
            if not isinstance(value, str):
                raise TypeError(f"{self.name!r} must be a str")
            if len(value) > self.max_length:
                raise ValueError(f"{self.name!r} exceeds max_length={self.max_length}")
            setattr(instance, self.storage_name, value)

    class BaseModel:
        __fields__: ClassVar[tuple[str, ...]] = ()

        def __init_subclass__(cls, **kwargs: Any) -> None:
            super().__init_subclass__(**kwargs)
            fields: list[str] = []
            # 沿 MRO 收集所有基类与当前子类上挂载的 StringField 描述符
            for base in reversed(cls.__mro__):
                for attr_name, attr_val in base.__dict__.items():
                    if isinstance(attr_val, StringField) and attr_name not in fields:
                        fields.append(attr_name)
            cls.__fields__ = tuple(fields)

        def __init__(self, **kwargs: Any) -> None:
            for field_name in self.__fields__:
                if field_name not in kwargs:
                    raise TypeError(f"Missing required field: {field_name!r}")
                setattr(self, field_name, kwargs.pop(field_name))
            if kwargs:
                raise TypeError(f"Unexpected fields: {list(kwargs.keys())}")

        def to_dict(self) -> dict[str, Any]:
            return {name: getattr(self, name) for name in self.__fields__}

    class Article(BaseModel):
        title = StringField(max_length=10)
        author = StringField(max_length=20)

    assert Article.__fields__ == ("title", "author")
    post = Article(title="Metaprog", author="Kosmigen")
    assert post.to_dict() == {"title": "Metaprog", "author": "Kosmigen"}

    try:
        post.title = "This title is way too long"
        assert False
    except ValueError:
        pass
    ```

### 练习 2：理解属性查找优先级与编写支持过期淘汰的 `@ttl_cached_property`

标准库 `@functools.cached_property` 会将首次计算结果永久写入 `instance.__dict__`。请设计并实现一个非数据描述符 `ttl_cached_property(ttl_seconds: float, clock=time.monotonic)`：
1. 在固定时间窗口 `ttl_seconds` 内重复访问属性时，直接返回缓存结果，不重新执行被装饰方法。
2. 当超过 `ttl_seconds` 后再次访问该属性时，自动重新计算并刷新缓存时间戳。
3. 支持通过 `del obj.attr` 随时手动清空缓存。

??? success "点击查看答案与解析"
    因为我们需要在每次访问时检查时间戳是否过期，所以不能让 `instance.__dict__[attr_name]` 直接屏蔽描述符的 `__get__`；我们可以将 `(timestamp, value)` 存储在 `instance.__dict__` 的一个内部专用键（如 `f"_ttl_cache_{name}"`）中，并通过定义 `__delete__` 支持 `del obj.attr` 手动失效：

    ```python
    from collections.abc import Callable
    from typing import Any, Self, overload

    class ttl_cached_property[T]:
        def __init__(
            self,
            ttl_seconds: float,
            *,
            clock: Callable[[], float],
        ) -> None:
            self.ttl_seconds = ttl_seconds
            self.clock = clock
            self.fn: Callable[[Any], T] | None = None
            self.cache_key = ""

        def __call__(self, fn: Callable[[Any], T]) -> Self:
            self.fn = fn
            return self

        def __set_name__(self, owner: type, name: str) -> None:
            self.cache_key = f"_ttl_cache_{name}"

        @overload
        def __get__(self, instance: None, owner: type) -> Self: ...

        @overload
        def __get__(self, instance: object, owner: type | None = None) -> T: ...

        def __get__(self, instance: object | None, owner: type | None = None) -> Self | T:
            if instance is None:
                return self
            assert self.fn is not None
            now = self.clock()
            inst_dict = vars(instance)
            if self.cache_key in inst_dict:
                expires_at, cached_val = inst_dict[self.cache_key]
                if now < expires_at:
                    return cached_val
            val = self.fn(instance)
            inst_dict[self.cache_key] = (now + self.ttl_seconds, val)
            return val

        def __delete__(self, instance: object) -> None:
            vars(instance).pop(self.cache_key, None)

    fake_now = 100.0

    class MetricsFetcher:
        def __init__(self) -> None:
            self.calls = 0

        @ttl_cached_property(ttl_seconds=5.0, clock=lambda: fake_now)
        def active_users(self) -> int:
            self.calls += 1
            return self.calls * 10

    m = MetricsFetcher()
    assert m.active_users == 10 and m.calls == 1
    fake_now = 103.0  # 未满 5 秒 TTL，命中缓存
    assert m.active_users == 10 and m.calls == 1
    fake_now = 106.0  # 已超过 5 秒 TTL，自动触发重算
    assert m.active_users == 20 and m.calls == 2
    del m.active_users  # 手动清空缓存
    assert m.active_users == 30 and m.calls == 3
    ```

### 练习 3：使用 `ast.NodeTransformer` 实现类似 `pytest` 的比较表达式重写器

请使用标准库 `ast` 模块编写一个 `ComparisonLoggerTransformer(ast.NodeTransformer)`：
1. 将源码中的所有单一比较表达式（如 `a > b`、`x == y`，即 `len(node.ops) == 1` 的 `ast.Compare` 节点）自动改写为对辅助函数 `_trace_cmp(left_val, op_str, right_val, result)` 的调用。
2. 使改写并编译执行后的代码不仅返回原本的布尔比较结果，还能自动把比较左右两侧运行时的真实值记录到日志列表中。

??? success "点击查看答案与解析"
    这正是 `pytest` 能在 `assert f(x) == g(y)` 失败时把 `f(x)` 和 `g(y)` 的具体计算值打印出来的核心原理——在编译为字节码前，通过 `ast.NodeTransformer` 改写 `ast.Compare` 语法树节点：

    ```python
    import ast
    from typing import Any

    OP_SYMBOLS: dict[type[ast.cmpop], str] = {
        ast.Eq: "==",
        ast.NotEq: "!=",
        ast.Lt: "<",
        ast.LtE: "<=",
        ast.Gt: ">",
        ast.GtE: ">=",
    }

    class ComparisonLoggerTransformer(ast.NodeTransformer):
        def visit_Compare(self, node: ast.Compare) -> ast.AST:
            self.generic_visit(node)
            if len(node.ops) != 1 or type(node.ops[0]) not in OP_SYMBOLS:
                return node
            op_str = OP_SYMBOLS[type(node.ops[0])]
            left_node = node.left
            right_node = node.comparators[0]
            # 将 `left op right` 改写为 `_trace_cmp(left, "op", right)`
            return ast.Call(
                func=ast.Name(id="_trace_cmp", ctx=ast.Load()),
                args=[left_node, ast.Constant(value=op_str), right_node],
                keywords=[],
            )

    trace_history: list[str] = []

    def _trace_cmp(left: Any, op: str, right: Any) -> bool:
        res = {
            "==": left == right,
            "!=": left != right,
            "<": left < right,
            "<=": left <= right,
            ">": left > right,
            ">=": left >= right,
        }[op]
        trace_history.append(f"{left!r} {op} {right!r} -> {res}")
        return res

    src = "passed = (2 + 3) == (10 // 2)"
    tree = ast.parse(src, mode="exec")
    new_tree = ast.fix_missing_locations(ComparisonLoggerTransformer().visit(tree))

    assert ast.unparse(new_tree) == "passed = _trace_cmp(2 + 3, '==', 10 // 2)"

    ns: dict[str, Any] = {"_trace_cmp": _trace_cmp}
    exec(compile(new_tree, filename="<ast-test>", mode="exec"), ns)
    assert ns["passed"] is True
    assert trace_history == ["5 == 5 -> True"]
    ```
