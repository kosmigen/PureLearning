# 类型注解系统

Python 是一门动态强类型语言：变量本身没有静态类型绑定，类型信息附着在运行期的对象（`PyObject`）上。随着工程规模增长，缺乏静态契约会导致重构困难、IDE 补全失灵以及隐蔽的 `AttributeError` / `TypeError` 延迟到生产环境才暴露。

自 PEP 484 引入 **Type Hints（类型注解）**，到 Python 3.12（PEP 695 泛型新语法）、Python 3.13（PEP 696 类型参数默认值、PEP 705 `ReadOnly`、PEP 742 `TypeIs`）与 Python 3.14（PEP 649 / 749 惰性注解求值 `annotationlib`），现代 Python 已经建立起一套兼具表达力与工程实用性的静态类型系统。

---

## Type Hints 基础与渐进式类型理念

### 渐进式类型（Gradual Typing）：静态检查期（mypy / pyright / ty）与运行期行为解耦

Python 采用 **渐进式类型（Gradual Typing）** 设计哲学：

1. **静态检查期与运行期完全解耦**：CPython 解释器在运行代码时，仅将类型注解收集到对象或模块的元数据（如 `__annotations__` 或 `__annotate__`）中，**不做任何隐式类型校验或强制转换**。即使传入了违背类型注解的参数，只要运行期操作合法，程序照常执行。
2. **按需演进**：同一个项目中允许未标注的动态代码与严格标注的静态类型代码共存。团队可以从核心领域模型与公共 API 开始逐步引入类型注解，而不必一次性重写全部代码库。

| 维度 | 静态类型检查期（Static Type Checking） | 运行期（Runtime Execution） |
| --- | --- | --- |
| **执行主体** | `mypy`、`pyright`、`ty`（Astral）、IDE 语言服务器 | CPython / PyPy 解释器或 Pydantic / FastAPI 等框架 |
| **主要职责** | 控制流分析、类型相容性校验、分支穷尽性检查、类型缩窄推断 | 字节码执行；通过自省读取注解实现数据校验、依赖注入或序列化 |
| **违规后果** | CI 构建失败或编辑器波浪线报错 | 默认无任何影响（除非显式使用运行时校验库） |
| **性能开销** | 零运行时开销（发生在代码运行前） | 仅存在极小的注解存储或惰性求值开销 |

```python
def add_numbers(a: int, b: int) -> int:
    return a + b

# 1. 静态检查期：mypy / pyright / ty 会对下一行报错（Argument of type "str" cannot be assigned to parameter "int"）
# 2. 运行期：CPython 忽略类型注解，直接执行字符串拼接，不会抛出 TypeError
runtime_result = add_numbers("hello ", "world")  # type: ignore[arg-type]
assert runtime_result == "hello world"
```

!!! tip "工程实践：主流静态类型检查器选型"
    - **mypy**：Python 官方最早的参考级类型检查器，生态插件（如 `django-stubs`、`pydantic.mypy`）最丰富。
    - **pyright / basedpyright**：由微软开发，也是 VS Code Pylance 的内核，类型推断与 `Protocol` / 泛型支持极快且严格。
    - **ty**：由 Astral（`ruff` / `uv` 团队）使用 Rust 编写的新一代超高速 Python 类型检查器与语言服务器，面向大型代码库的毫秒级增量反馈。

### 变量类型注解、函数参数与返回值注解语法（`-> None` / `-> NoReturn` / `-> Never`）

PEP 526 与 PEP 484 定义了变量与函数的标准注解语法。在返回值注解中，需要重点区分 `None`、`NoReturn` 与 `Never` 的语义边界：

| 注解形式 | 语义定义 | 典型适用场景 |
| --- | --- | --- |
| `-> None` | 函数**正常执行完毕**，但没有有意义的返回值（隐式或显式 `return None`） | 打印日志、修改原地状态的过程式函数 |
| `-> Never`（Python 3.11+ 推荐） | **底类型（Bottom Type，空集 $\varnothing$）**：函数**永远不会正常返回**到调用点；也可用于标注“绝不可能到达的分支变量类型” | 必定抛出异常的函数、无限事件循环、穷尽性检查（Exhaustiveness Checking） |
| `-> NoReturn` | 与 `Never` 完全等价的早期别名，最初仅用于标注返回值 | 现代代码中推荐统一使用语义更通用的 `typing.Never` |

```python
from typing import Never, assert_never

# 变量类型注解：声明带初值变量，或仅声明类型而不赋初值
retry_limit: int = 3
cached_token: str  # 仅在 __annotations__ 中登记，未在命名空间创建变量

def log_event(message: str, *, level: str = "INFO") -> None:
    """正常返回 None 的函数"""
    print(f"[{level}] {message}")

def abort_with_error(reason: str) -> Never:
    """底类型 Never：控制流在此终止，绝不会正常返回"""
    raise RuntimeError(f"Fatal error: {reason}")

type Status = int | str

def handle_status(val: Status) -> str:
    if isinstance(val, int):
        return f"Code: {val}"
    elif isinstance(val, str):
        return f"Message: {val}"
    else:
        # 当上方分支已穷尽 int | str 时，此处 val 的类型被缩窄为空集 Never
        # 若日后 Status 扩充为 int | str | float 而忘记新增分支，静态检查器会在此处报错！
        assert_never(val)

assert handle_status(200) == "Code: 200"
```

### 内置容器直接泛型化（PEP 585：`list[int]`、`dict[str, float]`、`set[str]`、定长与变长元组 `tuple[int, str]` vs `tuple[int, ...]`）

在 Python 3.9（PEP 585）之前，内置容器类（`list`、`dict`、`tuple`）不支持下标运算 `[]`，必须从 `typing` 模块导入大写的 `List`、`Dict`、`Tuple`。PEP 585 为标准库内置容器实现了 `__class_getitem__`，使其在运行期可直接返回 `types.GenericAlias` 对象。

尤其需要注意 `tuple` 在类型系统中的两种完全不同的形态：

1. **定长异构元组（Record / 结构体模式）**：`tuple[int, str, float]` 严格规定元组长度必须为 3，且每个位置的元素类型必须依次为 `int`、`str`、`float`。空元组写作 `tuple[()]`。
2. **变长同构元组（不可变序列模式）**：`tuple[int, ...]` 使用字面量省略号 `...`（`Ellipsis`），表示任意长度（0 个或多个）且所有元素均为 `int` 的元组。

```python
from collections.abc import Iterable, Mapping, Sequence
from types import GenericAlias

# 内置容器直接泛型化（PEP 585）
scores: list[int] = [95, 88, 100]
metrics: dict[str, float] = {"accuracy": 0.98, "loss": 0.05}
tags: set[str] = {"python", "typing"}

# 定长异构元组 vs 变长同构元组 vs 空元组
user_record: tuple[int, str, bool] = (1001, "Alice", True)
int_stream: tuple[int, ...] = (1, 2, 3, 4, 5)
empty_tuple: tuple[()] = ()

# 运行期本质：内置容器下标化返回 types.GenericAlias
alias_obj = list[int]
assert isinstance(alias_obj, GenericAlias)
assert alias_obj.__origin__ is list
assert alias_obj.__args__ == (int,)

# 工程最佳实践：函数参数优先使用 collections.abc 抽象容器，返回值使用具体内置容器
def normalize_names(names: Iterable[str], overrides: Mapping[str, str]) -> list[str]:
    return [overrides.get(name, name).strip().lower() for name in names]

assert normalize_names(("Alice ", "BOB"), {"BOB": "Robert"}) == ["alice", "robert"]
```

!!! tip "工程实践：参数用抽象接口（`collections.abc`），返回值用具体类型"
    在定义函数签名时，遵循 **“严出宽进”** 原则：
    - **参数类型**尽量使用 `collections.abc` 中的抽象基类（如只读序列用 `Sequence[T]`、单次遍历用 `Iterable[T]`、只读字典用 `Mapping[K, V]`），让调用方可以自由传入 `list`、`tuple` 或自定义容器。
    - **返回值类型**使用具体的内置类型（如 `list[T]`、`dict[K, V]`），让调用方无需额外转型即可调用 `.append()` 等具体方法。

### `Any` 与 `object` 的本质分野：`Any` 关闭类型检查（双向兼容逃生舱） vs `object` 作为类型安全顶层基类

初学者常把 `Any` 和 `object` 混为一谈，认为它们都表示“可以接收任意值”。然而在类型理论中，两者的安全性截然相反：

- **`object` 是顶类型（Top Type）**：Python 中所有类型都是 `object` 的子类型（`T <: object`）。**任何值都可以安全地赋给 `object` 变量**；但反过来，静态检查器只允许在 `object` 变量上调用所有对象共有的方法（如 `__str__`、`__eq__`），**禁止直接将其赋给具体类型（如 `int`）或调用特定方法（如 `.upper()`）**，除非先通过类型缩窄（如 `isinstance`）证明其具体类型。
- **`Any` 是渐进式类型的逃生舱（Escape Hatch）**：`Any` 既不是顶类型也不是底类型，而是**彻底关闭静态类型检查的双向通配符**。任何类型可以赋给 `Any`，**`Any` 也可以未经检查地赋给任何具体类型**，且允许在 `Any` 上访问任意不存在的属性而不触发任何静态报错，具有强烈的“类型传染性”。

| 特性对比 | `object`（类型安全顶类型） | `Any`（动态逃生舱） |
| --- | --- | --- |
| **将任意类型 `T` 赋值给它** | 允许（`x: object = 42` 合法） | 允许（`x: Any = 42` 合法） |
| **将它直接赋值给具体类型 `int`** | **报错**（必须先 `isinstance` 缩窄） | **静默放行**（埋下运行期 `TypeError` 隐患） |
| **调用任意未验证方法 `.foo()`** | **报错**（`"object" has no attribute "foo"`） | **静默放行**（返回结果继续传染为 `Any`） |
| **推荐使用场景** | 表示“我接收任意对象，且在使用前会严格检查其类型” | 仅用于兼容尚未类型化的遗留动态代码或底层序列化边界 |

```python
from typing import Any

def unsafe_process(data: Any) -> int:
    # 静态检查器完全失明：哪怕 data 是 int，调用 .non_existent() 也不会在检查期报错
    # 且返回值被允许直接当作 int 返回
    return data.upper()  # 运行期若传入 123 则直接崩溃！

def safe_process(data: object) -> int:
    # data.upper()  # 静态检查器立即拦截：object 没有 upper 属性
    if isinstance(data, str):
        # 经过 isinstance 分支后，data 的静态类型被安全缩窄为 str
        return len(data.upper())
    elif isinstance(data, int):
        return data
    raise TypeError(f"Unsupported type: {type(data)!r}")

assert safe_process("hello") == 5
assert safe_process(42) == 42
```

### 注解的运行期存储与延迟求值：`__annotations__`、`from __future__ import annotations`（PEP 563）与 PEP 649 / 749 注解求值演进

在 Python 3.0–3.13 的默认行为中，函数、类和模块上的类型注解会在**定义执行时立即求值（Eager Evaluation）**，并将求值后的类型对象存入 `__annotations__` 字典。这种立即求值带来了两大痛点：

1. **前向引用（Forward Reference）问题**：类 `Node` 的方法需要标注参数或返回值为 `Node` 自身，但在类体执行完毕前，名字 `Node` 尚未绑定到外层命名空间，直接写 `next: Node` 会触发 `NameError`。
2. **导入与运行期开销**：仅用于静态检查的复杂泛型表达式在模块导入时就会执行求值。

围绕这一问题，Python 经历了三代演进：

| 演进阶段 | 核心机制 | `__annotations__` 存储结果 | 优缺点与状态 |
| --- | --- | --- | --- |
| **默认立即求值**（Python 3.0–3.13） | 定义时立即执行注解表达式 | 真实类型对象（如 `{'x': <class 'int'>}`） | 前向引用需手写字符串 `"Node"`；模块导入有求值开销 |
| **PEP 563 字符串化注解**（`from __future__ import annotations`，3.7+） | 编译期将所有注解直接转为字符串字面量 | 纯字符串（如 `{'x': 'int'}`） | 解决前向引用且零导入开销；但破坏运行时自省（需调用 `typing.get_type_hints()` 动态 `eval` 解析，遇到局部作用域易失败），**将在未来版本逐步弃用** |
| **PEP 649 / PEP 749 惰性求值函数**（Python 3.14+ 默认机制） | 编译器为注解生成隐藏的 `__annotate__(format)` 惰性求值函数；仅在访问 `__annotations__` 或调用 `annotationlib.get_annotations()` 时才按需计算 | 按请求格式返回真实对象（`VALUE`）、前向引用代理（`FORWARDREF`）或源码字符串（`STRING`） | **终极方案**：原生支持前向引用、默认零导入求值开销，且完整保留局部词法作用域供运行时框架（如 Pydantic）精确自省 |

```python
import sys
import typing

# 无论在 Python 3.12/3.13 还是 3.14+，理解 __annotations__ 与 get_type_hints 的协作至关重要
class TreeNode:
    # 在未开启 PEP 563 的 Python 3.12/3.13 中，类体内引用自身可使用字符串字面量（或方法内使用 Self）
    def __init__(self, value: int, left: "TreeNode | None" = None) -> None:
        self.value = value
        self.left = left

# get_type_hints 会自动解析字符串形式的前向引用，还原为真实的类对象
hints = typing.get_type_hints(TreeNode.__init__)
assert hints["value"] is int
assert hints["left"] == (TreeNode | None)
assert hints["return"] is type(None)

# Python 3.14+ 新增了标准库 annotationlib，支持在未定义符号存在时以 FORWARDREF 或 STRING 格式安全检视注解
if sys.version_info >= (3, 14):
    import annotationlib
    str_annotations = annotationlib.get_annotations(
        TreeNode.__init__, format=annotationlib.Format.STRING
    )
    assert str_annotations["value"] == "int"
```

---

## 现代泛型系统与 PEP 695 新语法（Python 3.12+）

### 传统 `TypeVar` 泛型声明回顾与痛点

在 Python 3.12 之前，声明泛型函数或泛型类必须从 `typing` 导入 `TypeVar` 与 `Generic`，并在模块全局作用域中预先实例化类型变量：

```python
from typing import Generic, TypeVar

# 传统写法（Python 3.11 及以前）：
# 1. 必须在外部作用域显式定义变量 T，变量名与字符串名必须重复写两遍
# 2. T 污染了模块的全局命名空间，且可能被多个毫不相干的函数误用
# 3. 泛型类必须显式继承 Generic[T]，冗长且违反直觉
T_legacy = TypeVar("T_legacy")

class LegacyBox(Generic[T_legacy]):
    def __init__(self, item: T_legacy) -> None:
        self.item = item
```

传统 `TypeVar` 语法不仅存在名字冗余、作用域泄漏，还要求开发者手动计算并声明 `covariant=True` 或 `contravariant=True`（型变属性），极易因疏忽写错导致类型系统出现漏洞或报错。

### PEP 695 泛型函数与泛型类原生语法：`def first[T](items: Sequence[T]) -> T:` 与 `class Box[T]:`

Python 3.12 通过 **PEP 695** 引入了原生的类型参数语法（Type Parameter Syntax）：

1. **内联声明**：直接在函数名、类名或 `type` 别名后使用 `[T]`、`[K, V]` 声明类型参数，无需导入 `TypeVar` 或 `Generic`。
2. **严格的词法作用域隔离**：`[T]` 由编译器在专用局部词法作用域中自动创建，仅在该函数签名/函数体或类定义体内部可见，**绝不污染外层模块命名空间**，且天然支持前向引用。

```python
from collections.abc import Sequence

# 1. PEP 695 泛型函数：类型参数 [T] 紧贴函数名之后
def first[T](items: Sequence[T]) -> T:
    if not items:
        raise ValueError("Sequence cannot be empty")
    return items[0]

# 2. PEP 695 泛型类：类型参数 [T] 紧贴类名之后（如有基类则写在 [T] 之后的括号内，如 class SubBox[T](Box[T]):）
class Box[T]:
    def __init__(self, content: T) -> None:
        self._content: T = content

    def get(self) -> T:
        return self._content

    def map[U](self, fn: callable) -> "Box[U]":
        # 泛型方法还可以声明属于方法自身的类型参数 [U]
        return Box(fn(self._content))

assert first([10, 20, 30]) == 10
int_box = Box(42)
str_box = int_box.map(str)
assert int_box.get() == 42 and str_box.get() == "42"
# 运行期可以通过 __type_params__ 自省获取编译器生成的 TypeVar 元组
assert len(Box.__type_params__) == 1
assert Box.__type_params__[0].__name__ == "T"
```

### PEP 695 `type` 语句声明支持泛型的类型别名：`type Point[T] = tuple[T, T]`（对比传统 `TypeAlias`）

在 PEP 695 之前，类型别名只是普通的变量赋值（或用 `x: TypeAlias = ...` 标记），其右侧表达式在定义时立即求值，一旦定义**递归类型别名（如 JSON 树结构）**就会触发 `NameError` 或需要使用字符串包裹。

PEP 695 引入了软关键字 `type` 语句，专门用于创建 `typing.TypeAliasType` 实例：

- **原生支持泛型参数**：如 `type Point[T] = tuple[T, T]`。
- **右侧表达式惰性求值**：天然支持直接编写自引用的递归类型别名（如 `JSONValue`），无需任何引号或 `from __future__ import annotations`。

```python
from typing import TypeAliasType

# 1. 泛型类型别名
type Point[T] = tuple[T, T]
type Result[T, E] = tuple[Literal[True], T] | tuple[Literal[False], E]

# 2. 递归类型别名：由于 type 语句对右侧采用惰性求值，JSON 可以直接自引用而不报 NameError
type JSON = None | bool | int | float | str | list[JSON] | dict[str, JSON]

from typing import Literal

def parse_coord(raw: Point[float]) -> float:
    x, y = raw
    return (x**2 + y**2) ** 0.5

assert isinstance(Point, TypeAliasType)
assert parse_coord((3.0, 4.0)) == 5.0
sample_json: JSON = {"users": [{"id": 1, "active": True}], "meta": None}
assert isinstance(sample_json, dict)
```

| 声明方式 | 语法示例 | 是否支持惰性递归 | 运行时类型 | 推荐程度 |
| --- | --- | --- | --- | --- |
| 隐式变量赋值 | `IntList = list[int]` | 否 | `types.GenericAlias` | 不推荐（易与普通变量混淆） |
| `typing.TypeAlias`（PEP 613） | `IntList: TypeAlias = list[int]` | 否（需配合字符串） | `types.GenericAlias` | 仅在维护 `< 3.12` 代码时使用 |
| **`type` 语句（PEP 695）** | `type IntList = list[int]` | **是（原生惰性求值）** | `typing.TypeAliasType` | **Python 3.12+ 唯一首选标准** |

### 类型参数约束：上界绑定（`[T: BaseModel]`）、受限类型元组（`[T: (int, str)]`）与类型参数默认值（PEP 696，`[T = int]`）

在实际工程中，无约束的 `[T]` 往往过于宽泛。PEP 695 与 PEP 696（Python 3.13 原生语法支持）提供了三种精细的类型参数修饰能力：

1. **上界绑定（Upper Bound，`[T: BoundType]`）**：要求实参类型 `T` 必须是 `BoundType` 的子类型（或符合 `BoundType` 协议）。在函数体内可以安全访问 `BoundType` 定义的所有属性与方法，同时返回值精确保留传入的具体子类类型。
2. **受限类型元组（Value Restriction / Constraints，`[T: (TypeA, TypeB)]`）**：要求 `T` 只能从给定的两个或多个类型中**任选其一且保持前后一致**（注意与 `[T: TypeA | TypeB]` 的本质区别：在 `def add[T: (int, str)](a: T, b: T) -> T` 中，`a` 和 `b` 必须同为 `int` 或同为 `str`，禁止混合传入 `add(1, "a")`）。
3. **类型参数默认值（Type Parameter Defaults，PEP 696，`[T = DefaultType]`）**：Python 3.13+ 支持直接在方括号中用 `= DefaultType` 为类型参数指定默认类型（Python 3.12 中可通过 `TypeVar("T", default=int)` 使用）。当用户未显式下标化泛型类或别名时，自动回退到默认类型。

```python
from typing import Protocol

class SupportsPrice(Protocol):
    @property
    def price(self) -> float: ...

class Product:
    def __init__(self, name: str, price: float) -> None:
        self.name = name
        self.price = price

# 1. 上界绑定 [T: SupportsPrice]：既能在函数内访问 .price，又能保证传入 Product 返回的仍是 Product
def cheapest[T: SupportsPrice](items: list[T]) -> T:
    return min(items, key=lambda x: x.price)

# 2. 受限类型元组 [S: (str, bytes)]：a 和 b 必须同为 str 或同为 bytes，不可混传
def concat_same[S: (str, bytes)](a: S, b: S) -> S:
    return a + b

p1, p2 = Product("Book", 29.9), Product("Pen", 5.5)
assert cheapest([p1, p2]) is p2
assert concat_same("py", "thon") == "python"
assert concat_same(b"raw_", b"bytes") == b"raw_bytes"
```

!!! note "底层原理：`[T: (int, str)]` vs `[T: int | str]`"
    - 在 `def f[T: (int, str)](a: T, b: T) -> T:` 中，`T` 只能被单一定格为 `int` **或者** `str`，因此 `f(1, "x")` 会被静态检查器拒绝。
    - 在 `def g[T: int | str](a: T, b: T) -> T:` 中，`int | str` 是上界，当调用 `g(1, "x")` 时，类型检查器会将 `T` 推断为联合类型 `int | str` 并放行，这在内部执行 `a + b` 时会导致运行期 `TypeError`！

### 泛型高级参数：参数规格 `ParamSpec`（`**P`）与可变类型参数元组 `TypeVarTuple`（`*Ts`）

除了代表单个类型的 `TypeVar`（`[T]`），PEP 695 还统一了另外两类高阶泛型参数的声明语法：

- **参数规格 `ParamSpec`（写作 `[**P]`，PEP 612）**：用于完整捕获可调用对象的“位置参数 + 关键字参数签名”，常与返回值类型变量 `R` 配合写作 `Callable[P, R]`，用于高阶函数、装饰器与 RPC 包装器。
- **可变类型参数元组 `TypeVarTuple`（写作 `[*Ts]`，PEP 646）**：相当于“类型层面的 `*args`”，代表任意数量的类型组成的序列。典型应用场景是支持任意维度的张量类型（如 `Array[Batch, Height, Width]`）或异构元组拼接变换。

```python
from collections.abc import Callable

# 1. 使用 [**P, R] 捕获并转发任意函数的完整参数签名
def call_with_logging[**P, R](fn: Callable[P, R], *args: P.args, **kwargs: P.kwargs) -> R:
    # 注意：P.args 与 P.kwargs 必须成对出现在 *args 和 **kwargs 上
    return fn(*args, **kwargs)

# 2. 使用 [*Ts]（TypeVarTuple）对任意长度的异构元组进行头部前置扩展
def prepend_element[T, *Ts](head: T, tail: tuple[*Ts]) -> tuple[T, *Ts]:
    # 若 tail 为 tuple[str, float]，则返回类型被精确推断为 tuple[int, str, float]
    return (head, *tail)

assert call_with_logging(pow, 2, 10) == 1024
combined = prepend_element(1, ("age", 18.5))
assert combined == (1, "age", 18.5)
```

### 型变基础（Variance）：不变（Invariant，如 `list`）、协变（Covariant，如 `Sequence`）与逆变（Contravariant，如 `Callable` 参数）及 PEP 695 自动型变推断

设 `Dog` 是 `Animal` 的子类型（记作 `Dog <: Animal`）。那么泛型容器 `Container[Dog]` 与 `Container[Animal]` 之间是否存在子类型关系？这取决于泛型类型参数 `T` 的 **型变（Variance）** 性质：

| 型变类别 | 子类型关系定义（若 `Dog <: Animal`） | 安全性直觉（读写法则） | Python 标准库典型代表 |
| --- | --- | --- | --- |
| **不变（Invariant）** | `C[Dog]` 与 `C[Animal]` **互不为子类型** | **既可读又可写（可变容器）**：若允许把 `list[Dog]` 当作 `list[Animal]` 传入，函数内执行 `.append(Cat())` 就会破坏原 `list[Dog]` 的类型纯净性！ | `list[T]`、`dict[K, V]`、`set[T]` |
| **协变（Covariant）** | `C[Dog] <: C[Animal]`（方向一致） | **只读 / 仅作为返回值（Producer）**：既然只从容器中读取元素而不往里写入，每个读出的 `Dog` 天然也是 `Animal`，完全安全 | `Sequence[T]`、`tuple[T, ...]`、`Mapping` 的值类型 `V`、`Callable` 的返回值 |
| **逆变（Contravariant）** | `C[Animal] <: C[Dog]`（方向反转） | **只写 / 仅作为输入参数（Consumer）**：一个“能够处理任意 `Animal` 的回调函数 `Callable[[Animal], None]`”，当然可以安全地当作“专门处理 `Dog` 的回调函数 `Callable[[Dog], None]`”来使用 | `Callable[[T], None]` 的参数类型 `T` |

在传统 `TypeVar` 中，开发者必须手动指定 `TypeVar("T_co", covariant=True)`；而在 **PEP 695 的 `class MyClass[T]:` 中，编译器与类型检查器会根据 `T` 在类方法中出现的位置（只作返回值则为协变，只作参数则为逆变，两者皆有则为不变）自动推断最佳型变属性**！

```python
from collections.abc import Sequence

class Animal:
    def speak(self) -> str:
        return "..."

class Dog(Animal):
    def speak(self) -> str:
        return "Woof!"

# 错误示范：如果参数标注为 list[Animal]（不变 Invariant），则传入 list[Dog] 会被静态检查器拒绝！
# 正确示范：只读遍历场景应标注为协变的 Sequence[Animal]
def make_all_speak(animals: Sequence[Animal]) -> list[str]:
    return [a.speak() for a in animals]

dogs: list[Dog] = [Dog(), Dog()]
# list[Dog] 是 Sequence[Dog] 的子类型，而 Sequence 是协变的，故 Sequence[Dog] <: Sequence[Animal]
assert make_all_speak(dogs) == ["Woof!", "Woof!"]

# PEP 695 自动型变推断：因为 ReadOnlyBox[T] 中 T 仅出现在返回值位置，T 会被自动推断为协变（Covariant）
class ReadOnlyBox[T]:
    def __init__(self, value: T) -> None:
        self._value = value

    def get(self) -> T:
        return self._value

dog_box: ReadOnlyBox[Dog] = ReadOnlyBox(Dog())
animal_box: ReadOnlyBox[Animal] = dog_box  # 协变生效：静态检查完全通过！
assert animal_box.get().speak() == "Woof!"
```

### `Self` 类型（PEP 673）：在链式调用方法与 `@classmethod` 工厂方法中精准标注“返回当前子类实例”

在设计支持流式链式调用（Fluent Interface）或 `@classmethod` 构造工厂的基类时，如果将返回值硬编码为基类名（如 `-> QueryBuilder`），当子类继承基类并调用基类方法时，静态返回类型就会“退化”回基类，导致后续无法调用子类特有的方法。

PEP 673 引入了 `typing.Self`，专门用于指代**“当前正在调用该方法的具体类（包含任意层级的子类）”**：

```python
from typing import Self

class RequestBuilder:
    def __init__(self) -> None:
        self.headers: dict[str, str] = {}

    def with_header(self, key: str, value: str) -> Self:
        """链式调用返回 Self：子类调用时，返回类型自动保持为子类"""
        self.headers[key] = value
        return self

    @classmethod
    def with_json_accept(cls) -> Self:
        """类方法工厂返回 Self：通过 cls() 实例化的是当前具体子类"""
        return cls().with_header("Accept", "application/json")

class AuthRequestBuilder(RequestBuilder):
    def with_bearer_token(self, token: str) -> Self:
        return self.with_header("Authorization", f"Bearer {token}")

# AuthRequestBuilder 调用继承自父类的 with_json_accept() 和 with_header()，
# 其静态类型始终保持为 AuthRequestBuilder，因此可以无缝链式调用子类独有的 .with_bearer_token()
req = (
    AuthRequestBuilder.with_json_accept()
    .with_header("X-Trace-Id", "abc-123")
    .with_bearer_token("secret_jwt")
)
assert isinstance(req, AuthRequestBuilder)
assert req.headers["Authorization"] == "Bearer secret_jwt"
```

---

## `Union`、`Literal`、`Callable` 与高阶类型表达

### 联合类型（`X | Y`，PEP 604）与可选类型（`X | None`）替代传统 `Union` / `Optional`

Python 3.10（PEP 604）为类型对象重载了按位或运算符 `|`，在运行期生成 `types.UnionType` 实例，全面取代了冗长的 `typing.Union[X, Y]` 与 `typing.Optional[X]`：

- **联合类型**：`int | str | float` 等价于 `Union[int, str, float]`。
- **可选类型**：`str | None` 等价于 `Optional[str]`。
- **运行期支持**：PEP 604 的 `int | str` 可以直接作为 `isinstance(val, int | str)` 和 `issubclass(cls, int | str)` 的第二个参数使用！

!!! warning "注意：`X | None` 不代表函数参数具有默认值 `= None`"
    初学者常误以为 `def connect(timeout: float | None) -> None:` 意味着调用时可以省略 `timeout` 参数。实际上：
    - `: float | None` 仅表示**参数的值允许是 `float` 或 `None`**；若不写默认值，调用方必须显式传 `connect(None)`。
    - 只有写成 `timeout: float | None = None`，该参数才既是可省略的默认参数，又接受 `None` 值。

```python
from types import UnionType

def parse_identifier(raw: int | str | None = None) -> str:
    if raw is None:
        return "anonymous"
    # PEP 604 联合类型可直接用于运行期 isinstance 判定
    assert isinstance(raw, int | str)
    return f"id:{raw}"

union_obj = int | str
assert isinstance(union_obj, UnionType)
assert parse_identifier() == "anonymous"
assert parse_identifier(404) == "id:404"
```

### 字面量类型 `Literal[...]`、常量终态修饰 `Final` 与禁止重写/继承的 `@final` 装饰器

当类型约束需要精确到“具体的值集合”或“不可变/不可重写的架构契约”时，使用以下三个工具：

1. **`Literal[v1, v2, ...]`（PEP 586）**：将变量或参数的值域严格限制为指定的字面量（支持 `int`、`str`、`bytes`、`bool`、`Enum` 成员及 `None`）。
2. **`Final` 与 `Final[T]`（PEP 591）**：向静态检查器声明某变量或类属性为**终态常量**——既不允许在当前作用域被重新赋值，也不允许在子类中被同名属性覆盖（注意：若直接赋值为字面量如 `MAX_RETRY: Final = 3`，检查器会自动将其类型推导为更精准的 `Literal[3]`）。
3. **`@final` 装饰器（PEP 591）**：
   - 装饰**方法**时：禁止任何子类重写（Override）该方法。
   - 装饰**类**时：禁止任何其他类继承该类（相当于 Java 的 `final class` 或 C++ 的 `class C final`）。

```python
from typing import Final, Literal, final

type OpenMode = Literal["r", "w", "a", "rb", "wb"]
DEFAULT_TIMEOUT: Final = 30  # 静态类型自动推导为 Literal[30]，禁止二次赋值 DEFAULT_TIMEOUT = 60

class BaseService:
    API_VERSION: Final[str] = "v2"  # 子类禁止覆盖 API_VERSION

    @final
    def execute_pipeline(self) -> str:
        """模板方法模式：核心骨架方法标记为 @final，禁止子类篡改流程"""
        return f"{self.API_VERSION}:{self.hook()}"

    def hook(self) -> str:
        return "base"

@final
class PaymentService(BaseService):
    """终态类：禁止任何类再继承 PaymentService"""
    def hook(self) -> str:
        return "payment"

def open_resource(path: str, mode: OpenMode = "r") -> str:
    return f"Opening {path} in {mode} mode"

assert open_resource("data.bin", "rb") == "Opening data.bin in rb mode"
assert PaymentService().execute_pipeline() == "v2:payment"
```

### 可调用对象标注 `Callable[[Arg1, Arg2], ReturnType]` 与利用 `ParamSpec` / `Concatenate` 为装饰器完整保留原函数签名

`collections.abc.Callable` 用于标注函数、绑定方法或实现了 `__call__` 的可调用对象：

- **固定位置参数**：`Callable[[int, str], bool]` 表示接受 `(int, str)` 并返回 `bool`。无参数函数写作 `Callable[[], ReturnType]`。
- **任意参数**：`Callable[..., ReturnType]` 使用省略号表示不约束参数列表，仅约束返回值。
- **装饰器签名保留（`ParamSpec` + `Concatenate`）**：如果装饰器用 `Callable[..., Any]` 标注，被装饰函数的参数提示与类型检查会彻底丢失。使用 `[**P, R]` 可无损透传原函数签名；若装饰器还要**新增、注入或剥离第一个位置参数**（例如自动注入 `Context` 对象，或针对类方法的 `self`），则使用 ` typing.Concatenate[InjectedType, P]`。

```python
from collections.abc import Callable
from functools import wraps
from typing import Concatenate

class RequestContext:
    def __init__(self, user: str) -> None:
        self.user = user

# 1. 完全保留原函数签名的通用装饰器：输入 Callable[P, R]，输出 Callable[P, R]
def trace_calls[**P, R](fn: Callable[P, R]) -> Callable[P, R]:
    @wraps(fn)
    def wrapper(*args: P.args, **kwargs: P.kwargs) -> R:
        return fn(*args, **kwargs)
    return wrapper

# 2. 使用 Concatenate 改变参数签名：
# 原函数签名需要第一个参数为 RequestContext，装饰后对外暴露的函数自动注入该参数，调用方只需传入剩余参数 P
def with_default_context[**P, R](
    fn: Callable[Concatenate[RequestContext, P], R]
) -> Callable[P, R]:
    @wraps(fn)
    def wrapper(*args: P.args, **kwargs: P.kwargs) -> R:
        ctx = RequestContext(user="admin")
        return fn(ctx, *args, **kwargs)
    return wrapper

@with_default_context
def delete_item(ctx: RequestContext, item_id: int, *, force: bool = False) -> str:
    return f"{ctx.user} deleted {item_id} (force={force})"

# 调用 delete_item 时，静态检查器明确知道 ctx 已被剥离，现在的签名是 (item_id: int, *, force: bool = False) -> str
assert delete_item(42, force=True) == "admin deleted 42 (force=True)"
```

### 函数重载 `@overload`：精准表达“返回值类型随输入参数类型或字面量值动态联动”的多态契约

如果一个函数在传入 `raw=True` 时返回 `bytes`，传入 `raw=False` 时返回 `str`，仅写成 `def fetch(url: str, raw: bool = False) -> str | bytes:` 会迫使调用方在每次调用后都得用 `isinstance` 检查返回值类型。

`typing.overload` 允许我们编写**多个仅存在于静态检查期的类型签名分支**（函数体统一写 `...`），最后紧跟**唯一一个不加 `@overload` 的真实运行期实现**：

```python
from typing import Literal, overload

# 重载分支 1：当 as_bytes 为字面量 True 时，返回值精确锁定为 bytes
@overload
def decode_payload(data: bytes, *, as_bytes: Literal[True]) -> bytes: ...

# 重载分支 2：当 as_bytes 为 False 或省略（默认 False）时，返回值精确锁定为 str
@overload
def decode_payload(data: bytes, *, as_bytes: Literal[False] = False) -> str: ...

# 重载分支 3：当调用方传入动态 bool 变量时，退化为联合类型 str | bytes
@overload
def decode_payload(data: bytes, *, as_bytes: bool) -> str | bytes: ...

# 唯一运行期实现（绝不能加 @overload 装饰器）：会被前面的签名依次覆盖在符号表最后
def decode_payload(data: bytes, *, as_bytes: bool = False) -> str | bytes:
    if as_bytes:
        return data
    return data.decode("utf-8")

# 静态检查器知道 text 的类型一定是 str（可直接调用 .upper()），raw_buf 的类型一定是 bytes
text = decode_payload(b"hello")
raw_buf = decode_payload(b"hello", as_bytes=True)
assert text.upper() == "HELLO"
assert raw_buf == b"hello"
```

### `NewType` 零运行时开销的语义区分类型（如 `UserId = NewType("UserId", int)`）与 `Annotated[T, metadata]` 携带运行时校验元数据

在大型业务系统中，用户 ID（`UserId`）和订单 ID（`OrderId`）底层都是 `int`。若使用类型别名 `type UserId = int`，静态检查器会将它们完全视为同一个 `int`，无法阻止把 `order_id` 误传给需要 `user_id` 的函数。

Python 提供了两种不创建笨重子类包装器的轻量级类型增强工具：

1. **`typing.NewType("Name", BaseType)`**：
   - **静态检查期**：将 `UserId` 视为 `int` 的**独立派生子类型**。`UserId` 可以当作 `int` 使用，但普通 `int` 或 `OrderId` 绝不能直接传入要求 `UserId` 的参数（必须显式调用 `UserId(42)` 构造）。同时注意：**两个 `NewType` 相加（如 `UserId(1) + UserId(2)`）静态结果会退化为底层 `int`**。
   - **运行期**：自 Python 3.10 起，`NewType` 实例是一个直接原样返回输入参数的恒等可调用对象（Identity Callable：`def __call__(self, x): return x`），**不会创建任何额外的包装类实例**，运行期拿到的就是原生 `int`。
2. **`typing.Annotated[T, meta1, meta2, ...]`（PEP 593）**：
   - **静态检查期**：类型检查器**完全剥离并忽略后面的元数据**，将 `Annotated[int, Gt(0)]` 严格等同于 `int`。
   - **运行期**：元数据完整保留在 `Annotated` 对象（`__metadata__` 属性）中，供 Pydantic（字段范围校验）、FastAPI（`Query`/`Depends` 依赖注入）、SQLModel 等框架通过 `get_type_hints(..., include_extras=True)` 提取并执行运行时逻辑。

```python
from dataclasses import dataclass
from typing import Annotated, NewType, get_type_hints

# 1. NewType：静态期严格区分不同业务领域的 int，运行期零对象包装开销
UserId = NewType("UserId", int)
OrderId = NewType("OrderId", int)

def get_user_name(uid: UserId) -> str:
    return f"User#{uid}"

uid = UserId(1001)
oid = OrderId(1001)
assert uid == 1001 and type(uid) is int  # 运行期就是原生 int！
assert get_user_name(uid) == "User#1001"
# get_user_name(oid)  # 静态检查器报错：OrderId 不能赋给 UserId！

# 2. Annotated[T, metadata]：静态期视为 T，运行期可提取 __metadata__ 执行校验
@dataclass(frozen=True)
class ValueRange:
    min_val: int
    max_val: int

type Port = Annotated[int, ValueRange(1, 65535), "TCP/UDP port number"]

def validate_annotated_port(port: Port) -> int:
    # 深入解包 TypeAliasType 的 __value__ 获取 Annotated 的 __metadata__
    annotated_type = Port.__value__
    for meta in annotated_type.__metadata__:
        if isinstance(meta, ValueRange) and not (meta.min_val <= port <= meta.max_val):
            raise ValueError(f"Port {port} out of range [{meta.min_val}, {meta.max_val}]")
    return port

assert validate_annotated_port(8080) == 8080
```

### 类型缩窄（Type Narrowing）：`isinstance` / `issubclass` / `is None` / `match` 分支缩窄，以及自定义类型守卫 `TypeGuard` 与双向缩窄 `TypeIs`（PEP 742）

当一个变量被标注为宽泛的联合类型（如 `int | str | None`）或 `object` 时，静态类型检查器会沿着控制流图（CFG）根据条件判断语句自动将该变量在不同分支内的类型缩小，这一机制称为 **类型缩窄（Type Narrowing）**。

除了内置的 `isinstance(x, T)`、`issubclass(cls, T)`、`x is not None`、`callable(x)` 和 `match/case` 模式匹配外，当我们把复杂的类型判断抽取成独立的辅助函数（如 `def is_str_list(val: list[object]) -> bool:`）时，普通的 `-> bool` 返回值会让调用方丢失类型缩窄能力。为此 Python 提供了两种自定义类型守卫：

| 对比维度 | `TypeGuard[T]`（PEP 647，Python 3.10+） | `TypeIs[T]`（PEP 742，Python 3.13+ 强烈推荐） |
| --- | --- | --- |
| **`if` 为真分支（Positive Branch）** | 无条件将入参类型强制重设为 `T` | 将入参类型缩窄为“原类型与 `T` 的交集” |
| **`else` 为假分支（Negative Branch）** | **不执行任何缩窄**（`else` 分支内变量保持原宽泛类型） | **双向缩窄**！自动从原联合类型中**剔除 `T`**（与内置 `isinstance` 行为完全一致） |
| **类型安全性约束** | 不要求 `T` 是输入参数类型的子类型（适合判断不变容器如 `list[object]` -> `list[str]`） | **严格要求 `T` 必须是输入参数类型的子类型**，杜绝误写守卫导致的类型不一致 |

```python
import sys
from typing import TypeGuard

# 1. TypeGuard[T]：适用于目标类型 T 并非入参严格子类型的容器元素校验（因为 list 是不变的，list[str] 不是 list[object] 的子类型）
def is_str_list(items: list[object]) -> TypeGuard[list[str]]:
    return all(isinstance(x, str) for x in items)

# 2. TypeIs[T]（Python 3.13+ PEP 742；在 <3.13 可从 typing_extensions 导入）：支持 if/else 双向精准缩窄！
if sys.version_info >= (3, 13):
    from typing import TypeIs

    def is_non_empty_str(val: int | str) -> TypeIs[str]:
        return isinstance(val, str)

    def format_value(val: int | str) -> str:
        if is_non_empty_str(val):
            # if 分支：val 被缩窄为 str
            return val.upper()
        else:
            # else 分支：得益于 TypeIs 的双向缩窄，val 被自动缩窄为 int！（若用 TypeGuard 则此处仍是 int | str）
            return f"int:{val + 1}"

    assert format_value("abc") == "ABC"
    assert format_value(99) == "int:100"

raw_items: list[object] = ["a", "b"]
if is_str_list(raw_items):
    # 此处 raw_items 被缩窄为 list[str]
    assert "".join(raw_items) == "ab"
```

---

## `TypedDict` 结构化异构字典

### 为什么普通 `dict[str, Any]` 无法约束固定键异构字典（如 JSON API 载荷与配置项）？

在处理 HTTP JSON 响应、第三方 Webhook 载荷或配置字典时，字典通常具有**固定的字符串键集合，且不同键对应的值类型完全不同**（例如 `{"id": 101, "username": "alice", "roles": ["admin"]}`）。

如果使用普通的 `dict` 注解：
- 标注为 `dict[str, Any]` 或 `dict[str, int | str | list[str]]`：
  1. **无法防止拼写错误的键名**（如把 `data["username"]` 误写为 `data["usrname"]`，静态检查器完全无法察觉，直到运行期抛出 `KeyError`）。
  2. **无法区分具体键的值类型**（访问 `data["id"]` 拿到的类型是 `int | str | list[str]`，无法直接当作 `int` 运算）。
  3. **无法约束哪些键必填、哪些键可选**。

而如果在这些边界场景无需将字典转化为 `dataclass` 或 Pydantic `BaseModel` 实例（希望保持百分之百的原生 `dict` 零转换开销与 JSON 序列化兼容性），**`typing.TypedDict`（PEP 589）** 就是为此而生的解决方案。

### `TypedDict` 声明语法（基于类继承语法）与字段级静态类型检查

`TypedDict` 使用类继承语法声明每个键的名称与类型。**在运行期，通过 `TypedDict` 创建或标注的对象依然是完完全全的普通内置 `dict`**（`TypedDict` 类本身不可用于 `isinstance(d, MyTypedDict)` 检查）：

```python
from typing import TypedDict

class UserProfile(TypedDict):
    id: int
    username: str
    is_active: bool

# 运行期调用 UserProfile(...) 等同于直接调用 dict(...)，返回的就是内置 dict
user: UserProfile = {"id": 1, "username": "kosmigen", "is_active": True}
assert type(user) is dict

# 静态检查器能够：
# 1. 精确得知 user["id"] 是 int，user["username"] 是 str
# 2. 拦截未声明的键访问（如 user["email"]）或缺失必填键的字典字面量
assert user["username"].upper() == "KOSMIGEN"
```

### 控制必选与可选键：`total=False` 全局可选及 `Required[T]`、`NotRequired[T]`（PEP 655）逐字段精细标记

默认情况下，`TypedDict` 中声明的所有键都是**必选（Required）**的（即默认 `total=True`）。当部分键在字典中可能不存在（非 `None`，而是键本身可以省略）时，可以通过 `total=False` 与 PEP 655（Python 3.11+）引入的 `Required[T]` / `NotRequired[T]` 进行精细控制：

| 声明模式 | 适用场景 | 语法特征 |
| --- | --- | --- |
| 默认 `total=True` + 少量 `NotRequired[T]` | **绝大多数键必填**，仅个别键可省略 | 在可选字段上包裹 `NotRequired[T]` |
| `class C(TypedDict, total=False):` + 少量 `Required[T]` | **绝大多数键可省略**（如 `PATCH` 更新请求载荷或配置覆盖字典），仅主键必填 | 类头设置 `total=False`，在必填字段上包裹 `Required[T]` |

```python
from typing import NotRequired, Required, TypedDict

# 模式 1：默认全部必选（total=True），仅 bio 和 avatar_url 可省略
class CreateUserPayload(TypedDict):
    username: str
    email: str
    bio: NotRequired[str]
    avatar_url: NotRequired[str | None]

# 模式 2：total=False 默认全部可省略，仅 id 强制必选（非常适合 PATCH 局部更新接口）
class PatchUserPayload(TypedDict, total=False):
    id: Required[int]
    username: str
    email: str
    bio: str

create_req: CreateUserPayload = {"username": "alice", "email": "alice@example.com"}
patch_req: PatchUserPayload = {"id": 42, "bio": "Python Engineer"}
assert create_req["username"] == "alice" and patch_req["id"] == 42
```

### 只读字典字段 `ReadOnly[T]`（PEP 705）与使用 `Unpack[MyTypedDict]`（或 `**MyTypedDict`，PEP 692）为 `**kwargs` 提供精确关键字参数类型标注

现代 Python 对 `TypedDict` 进行了两项关键升级：

1. **只读字段 `ReadOnly[T]`（PEP 705，Python 3.13+ 标准库 `typing.ReadOnly`）**：
   - 将 `TypedDict` 中的特定字段标记为静态只读，禁止通过 `d["id"] = 2`、`d.pop("id")`、`del d["id"]` 或 `d.clear()` 修改它。
   - **打通协变（Covariance）**：由于普通 `TypedDict` 是可变字典，其字段类型原本是**不变（Invariant）**的；而一旦某个 `TypedDict` 的所有字段都标记为 `ReadOnly[T]`，该字段就支持**协变**（例如允许将包含 `id: int` 的字典安全传递给要求 `id: ReadOnly[int | str]` 的只读消费函数）！
2. **用 `Unpack[TD]` 为 `**kwargs` 提供精确类型签名（PEP 692，Python 3.12+）**：
   - 传统上 `def func(**kwargs: int)` 只能规定**所有**关键字参数的值都是同一种类型 `int`。
   - 使用 `**kwargs: Unpack[MovieOptions]`，可以为 `**kwargs` 指定一个 `TypedDict`，从而让 `**kwargs` 享受与显式命名关键字参数完全相同的**逐参数异构类型检查与 IDE 自动补全**！

```python
import sys
from typing import NotRequired, TypedDict, Unpack

class QueryOptions(TypedDict):
    limit: NotRequired[int]
    offset: NotRequired[int]
    include_deleted: NotRequired[bool]
    order_by: NotRequired[str]

# PEP 692：使用 Unpack[QueryOptions] 精确约束 **kwargs 的允许键名及每个键的独立类型
def query_records(table: str, **kwargs: Unpack[QueryOptions]) -> str:
    limit = kwargs.get("limit", 20)
    include_deleted = kwargs.get("include_deleted", False)
    return f"SELECT * FROM {table} (limit={limit}, deleted={include_deleted})"

# 调用 query_records 时，若传入未在 QueryOptions 中定义的键（如 page=1）或类型错误（如 limit="10"），静态检查器会立刻报错
assert query_records("users", limit=50, include_deleted=True) == "SELECT * FROM users (limit=50, deleted=True)"

# PEP 705（Python 3.13+）：ReadOnly[T] 保护字典主键不被篡改并开启协变支持
if sys.version_info >= (3, 13):
    from typing import ReadOnly

    class AuditEvent(TypedDict):
        event_id: ReadOnly[int | str]
        action: str

    def inspect_event(ev: AuditEvent) -> str:
        # ev["event_id"] = 999  # 静态检查器报错：Cannot assign to ReadOnly field "event_id"
        return f"{ev['event_id']}:{ev['action']}"

    assert inspect_event({"event_id": 1001, "action": "LOGIN"}) == "1001:LOGIN"
```

---

## `Protocol` 结构化子类型（静态鸭子类型）

### 名义子类型（Nominal Subtyping，基于显式继承 `ABC`）vs 结构化子类型（Structural Subtyping，基于方法/属性形状匹配 `Protocol`）

在面向对象与类型系统中，判断类型 `A` 是否为接口 `B` 的子类型，存在两种截然不同的范式：

| 对比维度 | 名义子类型（Nominal Subtyping，`abc.ABC`） | 结构化子类型（Structural Subtyping，`typing.Protocol`） |
| --- | --- | --- |
| **判定依据** | **血统（显式继承关系）**：`class A(B):` 必须显式继承自基类 `B`（或调用 `B.register(A)`） | **形状（静态鸭子类型，PEP 544）**：只要 `A` 拥有 `B` 所声明的全部方法与属性且类型签名兼容，即便 `A` 与 `B` 毫无继承关系，`A` 也自动被视为 `B` 的子类型 |
| **第三方类适配** | 困难（无法直接修改第三方库类的继承链，往往需要包一层 Adapter 类） | **零侵入适配**（直接按第三方库现有方法签名定义一个 `Protocol` 即可） |
| **方法实现复用** | 支持在 `ABC` 基类中提供复杂的公共默认实现与内部状态 | 专注于**纯粹的行为契约解耦**（避免模块间为了继承基类而产生循环导入依赖） |
| **类比语言** | Java `interface`、C++ 纯虚基类 | Go `interface`、TypeScript `interface` |

### 定义 `typing.Protocol` 接口：无需修改第三方类或显式继承，只要方法签名匹配即可通过静态类型检查

定义结构化接口只需继承 `typing.Protocol`。实现类**完全不需要导入或继承该 `Protocol`**：

```python
from typing import Protocol

# 定义结构化协议：任何具备 close() -> None 方法的对象都满足 SupportsClose
class SupportsClose(Protocol):
    def close(self) -> None: ...

# DatabaseConnection 并未继承 SupportsClose，甚至不知道 SupportsClose 的存在
class DatabaseConnection:
    def __init__(self, dsn: str) -> None:
        self.dsn = dsn
        self.closed = False

    def close(self) -> None:
        self.closed = True

def safe_shutdown(resource: SupportsClose) -> None:
    resource.close()

conn = DatabaseConnection("sqlite:///:memory:")
# 静态检查器通过比对方法签名发现 DatabaseConnection 具备 close(self) -> None，直接放行！
safe_shutdown(conn)
assert conn.closed is True
```

### `@runtime_checkable` 装饰器：允许在运行期对 `Protocol` 使用 `isinstance()` / `issubclass()` 及其仅检查属性存在性而不校验参数签名的局限

默认情况下，`Protocol` 仅在静态类型检查期生效；如果在运行期直接执行 `isinstance(obj, SupportsClose)`，Python 会抛出 `TypeError: Instance and class checks can only be used with @runtime_checkable protocols`。

为 `Protocol` 加上 `@typing.runtime_checkable` 装饰器后，即可在运行期对其调用 `isinstance()` 与 `issubclass()`。

```python
from typing import Protocol, runtime_checkable

@runtime_checkable
class Renderable(Protocol):
    def render(self, width: int) -> str: ...

class HtmlWidget:
    def render(self, width: int) -> str:
        return f"<div style='width:{width}px'></div>"

class BrokenWidget:
    # 警告：参数签名与 Renderable 完全不兼容（不接受 width: int），甚至 render 只是一个整数属性或无参函数！
    def render(self) -> int:
        return 404

assert isinstance(HtmlWidget(), Renderable) is True
# 运行期局限暴露：BrokenWidget 的 render 参数签名完全错误，但 isinstance 依然返回 True！
assert isinstance(BrokenWidget(), Renderable) is True
```

!!! warning "注意：`@runtime_checkable` 的两大运行期局限"
    1. **不检查方法参数与返回值签名**：运行期 `isinstance(obj, MyProtocol)` 底层仅通过 `hasattr` / ` getattr_static` 检查目标对象上**是否存在同名属性/方法**，**绝不会**调用 `inspect.signature` 去比对参数个数或类型注解！因此不能依赖运行期 `isinstance(..., Protocol)` 来保证方法调用的安全性，安全性依然由静态类型检查器保障。
    2. **性能开销**：相较于普通类的 `isinstance`（仅需在类的 `__mro__` 元组中做指针比对，$O(1)$ 级别），对拥有 $N$ 个属性/方法的 `@runtime_checkable` 协议做 `isinstance` 需要逐一探测属性是否存在（尽管 Python 3.12+ 针对该过程进行了大幅提速，但在高频热循环中仍应避免使用）。

### 泛型 `Protocol`、属性协议与回调协议（Callback Protocols：定义含 `__call__` 的 `Protocol` 替代无法表达关键字参数的 `Callable`）

`Protocol` 还有三个极具工程价值的高阶用法：

1. **泛型 `Protocol`（支持 PEP 695 语法 `class Proto[T](Protocol):`）**：定义带类型参数的结构化契约。注意在 PEP 695 下，必须写作 `class Repository[T](Protocol):`（不能再写 `Protocol[T]`）。
2. **只读属性协议 vs 可写属性协议**：
   - 在 `Protocol` 中写 `@property def name(self) -> str: ...` 表示要求实现方至少提供**只读**属性（实现方用实例变量 `self.name = "a"` 或 `@property` 均可满足）。
   - 在 `Protocol` 中直接写类属性注解 `name: str` 表示要求该属性**既可读又可写（可变）**（若实现方仅定义了无 setter 的 `@property`，静态检查器会报错）。
3. **回调协议（Callback Protocol）**：标准 `Callable[[int, str], bool]` **无法表达可选默认参数、仅限关键字参数（Keyword-only Arguments，如 `*, timeout: float = 5.0`）、`*args` 或重载签名**。此时，定义一个仅包含 `def __call__(self, ...) -> ...:` 方法的 `Protocol`，即可完美标注任意复杂签名的函数！

```python
from typing import Protocol

# 1. PEP 695 泛型 Protocol + 只读属性契约
class Identifiable[ID](Protocol):
    @property
    def id(self) -> ID: ...

# 2. 回调协议（Callback Protocol）：完美表达带默认值的 keyword-only 参数（普通 Callable 无法表达！）
class RetryHandler(Protocol):
    def __call__(self, url: str, *, max_retries: int = 3, timeout: float = 1.0) -> bool: ...

def fetch_endpoint(url: str, *, max_retries: int = 3, timeout: float = 1.0) -> bool:
    return url.startswith("https://") and max_retries >= 0 and timeout > 0

def execute_with_handler(handler: RetryHandler, target_url: str) -> bool:
    # 静态检查器明确知道 handler 支持关键字参数 timeout=... 且 max_retries 可省略
    return handler(target_url, timeout=2.5)

assert execute_with_handler(fetch_endpoint, "https://kosmigen.com") is True
```

---

## 练习与实战

### 练习 1：使用 PEP 695 与 `ParamSpec` 编写类型安全的重试装饰器

请使用 Python 3.12+ 的 PEP 695 泛型语法 `[**P, R]`，实现一个带参数的高阶重试装饰器工厂 `retry(attempts: int = 3)`。要求：
1. 装饰器必须**完整保留被装饰函数的所有位置参数、关键字参数与返回值类型签名**。
2. 当被装饰函数抛出 `ValueError` 时最多重试 `attempts` 次；若成功则立即返回结果，若耗尽次数仍失败则抛出最后一次异常。

??? success "点击查看答案与解析"
    利用 `Callable[P, R]` 配合 `*args: P.args` 和 `**kwargs: P.kwargs`，可以在多层嵌套的装饰器工厂中做到零签名丢失：

    ```python
    from collections.abc import Callable
    from functools import wraps

    def retry(attempts: int = 3):
        if attempts < 1:
            raise ValueError("attempts must be >= 1")

        def decorator[**P, R](fn: Callable[P, R]) -> Callable[P, R]:
            @wraps(fn)
            def wrapper(*args: P.args, **kwargs: P.kwargs) -> R:
                last_exc: Exception | None = None
                for _ in range(attempts):
                    try:
                        return fn(*args, **kwargs)
                    except ValueError as exc:
                        last_exc = exc
                assert last_exc is not None
                raise last_exc

            return wrapper

        return decorator

    call_count = 0

    @retry(attempts=3)
    def flaky_parse(raw: str, *, base: int = 10) -> int:
        global call_count
        call_count += 1
        if call_count < 3:
            raise ValueError("Temporary failure")
        return int(raw, base=base)

    # 静态检查器知道 flaky_parse 的签名依然是 (raw: str, *, base: int = 10) -> int
    result = flaky_parse("ff", base=16)
    assert result == 255
    assert call_count == 3
    ```

### 练习 2：结合 `@overload` 与 `Literal` 实现类型联动的数据提取器

编写一个函数 `extract_field(record: dict[str, str], key: str, *, required: bool = True) -> str | None`。要求通过 `@overload` 与 `Literal[True]` / `Literal[False]` 提供精确的返回值静态类型推导：
1. 当调用方不传 `required` 或显式传 `required=True` 时，静态返回类型必须精确为 `str`（若键不存在则运行期抛出 `KeyError`）。
2. 当调用方显式传 `required=False` 时，静态返回类型必须为 `str | None`（若键不存在则运行期返回 `None`）。

??? success "点击查看答案与解析"
    通过将 `required: Literal[True] = True` 与 `required: Literal[False]` 拆分为两个 `@overload` 签名，即可彻底免除调用方在 `required=True` 分支下多余的 `is not None` 检查：

    ```python
    from typing import Literal, overload

    @overload
    def extract_field(record: dict[str, str], key: str, *, required: Literal[True] = True) -> str: ...

    @overload
    def extract_field(record: dict[str, str], key: str, *, required: Literal[False]) -> str | None: ...

    @overload
    def extract_field(record: dict[str, str], key: str, *, required: bool) -> str | None: ...

    def extract_field(record: dict[str, str], key: str, *, required: bool = True) -> str | None:
        if required:
            return record[key]
        return record.get(key)

    sample = {"host": "127.0.0.1"}
    # 1. host_val 的静态类型被精确锁定为 str，可直接调用 .split(".")
    host_val = extract_field(sample, "host")
    assert host_val.split(".")[0] == "127"

    # 2. port_val 的静态类型为 str | None
    port_val = extract_field(sample, "port", required=False)
    assert port_val is None
    ```

### 练习 3：结合 `TypedDict`、`Unpack` 与泛型 `Protocol` 构建结构化插件管线

请完成以下两项静态类型建模：
1. 定义一个 `TypedDict` 名为 `SerializeOptions`，其中 `indent`（`int`）和 `sort_keys`（`bool`）均为可省略键（`NotRequired`），`encoding`（`str`）为只读必选键（在 Python 3.13+ 使用 `ReadOnly[Required[str]]` 或默认 `total=True` 下的 `ReadOnly[str]`）。
2. 定义一个 PEP 695 泛型结构化协议 `Serializer[T](Protocol)`，要求实现类具备方法 `dumps(self, obj: T, **options: Unpack[SerializeOptions]) -> str`，并编写一个无需显式继承 `Serializer` 的 `JsonDictSerializer` 类通过校验。

??? success "点击查看答案与解析"
    利用 `Unpack[TypedDict]` 与 `Protocol` 的组合，既能约束实现类的 `**options` 关键字参数签名，又能保持零耦合的静态鸭子类型：

    ```python
    import json
    from typing import NotRequired, Protocol, TypedDict, Unpack

    class SerializeOptions(TypedDict):
        encoding: str
        indent: NotRequired[int]
        sort_keys: NotRequired[bool]

    class Serializer[T](Protocol):
        def dumps(self, obj: T, **options: Unpack[SerializeOptions]) -> str: ...

    class JsonDictSerializer:
        """无需显式继承 Serializer[dict[str, object]]，凭方法签名自动匹配协议"""
        def dumps(self, obj: dict[str, object], **options: Unpack[SerializeOptions]) -> str:
            indent = options.get("indent")
            sort_keys = options.get("sort_keys", False)
            return json.dumps(obj, indent=indent, sort_keys=sort_keys)

    def export_payload[T](serializer: Serializer[T], payload: T) -> str:
        return serializer.dumps(payload, encoding="utf-8", sort_keys=True)

    output = export_payload(JsonDictSerializer(), {"b": 1, "a": 2})
    assert output == '{"a": 2, "b": 1}'
    ```
