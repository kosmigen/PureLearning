# 函数与函数式特性

在 Python 中，函数不仅是组织代码逻辑、消除重复的基本执行单元，更是具备完整对象生命周期的**一等公民（First-Class Object）**。深入理解函数对象的运行期构建机制、五类参数签名设计、LEGB 词法作用域、闭包 `cell` 引用模型以及装饰器元编程，是写出高内聚、可维护且符合 Pythonic 工程规范代码的核心基石。

---

## 函数定义与一等函数（First-Class Functions）

### `def` 语句的运行期行为与函数对象（`function`）的核心属性

与 C/C++ 等编译型语言在编译期静态确定函数符号不同，Python 的 `def` 是一条**运行期可执行语句（Executable Statement）**。当解释器执行到 `def` 语句时，会依次完成以下动作：

1. 使用编译期已生成的字节码对象（`code` object，存储在 `__code__` 中）；
2. 求值所有默认参数表达式（存入 `__defaults__` 与 `__kwdefaults__`）以及类型注解；
3. 捕获当前外层作用域中的自由变量引用（存入 `__closure__`）与全局命名空间引用（`__globals__`）；
4. 在堆内存中实例化一个 `function` 类型对象，并将其绑定到当前作用域的同名标识符上。

正因为 `def` 在运行期执行，函数可以按条件动态定义，也可以嵌套在另一个函数内部每次调用时重新生成。

| 核心属性 | 类型 | 说明 |
| :--- | :--- | :--- |
| `__name__` | `str` | 函数定义时的简单名称 |
| `__qualname__` | `str` | 函数的限定名称（包含外层类或外层函数的嵌套路径，PEP 3155） |
| `__doc__` | `str \| None` | 函数的文档字符串（Docstring），未定义时为 `None` |
| `__annotations__` | `dict[str, Any]` | 参数与返回值的类型注解字典（Python 3.14+ 支持惰性求值，PEP 649） |
| `__defaults__` | `tuple[Any, ...] \| None` | 位置或关键字参数的默认值元组 |
| `__kwdefaults__` | `dict[str, Any] \| None` | 仅关键字参数（Keyword-Only）的默认值字典 |
| `__code__` | `types.CodeType` | 编译后的底层字节码对象，包含指令序列、常量表、局部变量名等 |
| `__globals__` | `dict[str, Any]` | 函数定义所在模块的全局命名空间只读引用 |
| `__closure__` | `tuple[CellType, ...] \| None` | 闭包捕获的自由变量 `cell` 对象元组 |
| `__dict__` | `dict[str, Any]` | 函数的自定义属性字典，允许向函数对象动态挂载元数据 |

```python
def calculate_tax(amount: float, rate: float = 0.13, *, round_digits: int = 2) -> float:
    """计算含税金额并按指定位数四舍五入。"""
    return round(amount * (1 + rate), round_digits)


# 检视函数对象的核心底层属性
assert calculate_tax.__name__ == "calculate_tax"
assert calculate_tax.__defaults__ == (0.13,)
assert calculate_tax.__kwdefaults__ == {"round_digits": 2}
assert calculate_tax.__code__.co_varnames == ("amount", "rate", "round_digits")

# 向函数对象挂载自定义元数据
calculate_tax.version = "1.2.0"
assert calculate_tax.__dict__["version"] == "1.2.0"
```

### 函数作为一等公民：赋值给变量、存入容器、作为参数传递与作为返回值

在编程语言理论中，“一等公民（First-Class Citizen）”意味着该实体享有与其他基础数据类型完全对等的操作权限。Python 中的函数对象都是 `types.FunctionType` 的实例，具备以下四项核心能力：

1. **赋值给任意变量**：为函数创建别名，不触发函数调用；
2. **存储在数据结构中**：作为 `dict`、`list`、`set` 的元素，常用于消除冗长的 `if-elif-else` 分支（表驱动法 / 命令分派表）；
3. **作为实参传递给高阶函数**：实现策略注入与回调机制（如 `sorted(key=...)`）；
4. **作为另一个函数的返回值**：构建函数工厂、闭包与装饰器。

```python
from typing import Callable


def add(a: int, b: int) -> int:
    return a + b


def multiply(a: int, b: int) -> int:
    return a * b


# 1. 赋值给变量
op = add
assert op(3, 4) == 7

# 2. 存入容器构建命令分派表（Dispatch Table）
OPERATIONS: dict[str, Callable[[int, int], int]] = {
    "add": add,
    "mul": multiply,
}
assert OPERATIONS["mul"](3, 4) == 12


# 3. 作为参数传递给高阶函数 & 4. 作为返回值
def apply_with_offset(func: Callable[[int, int], int], offset: int) -> Callable[[int, int], int]:
    def_result = lambda x, y: func(x, y) + offset
    return def_result


boosted_add = apply_with_offset(add, 100)
assert boosted_add(3, 4) == 107
```

### `return` 语句、隐式返回 `None` 与多返回值元组解包

`return` 语句立即终止当前函数栈帧（Frame）的执行，并将返回值压入调用方栈顶：

- **隐式返回 `None`**：若函数体执行到底部仍未遇到 `return`，或执行了不带表达式的裸 `return`，Python 字节码会自动将单例对象 `None` 返回给调用者。
- **多返回值本质**：Python 函数只能返回**单一对象**。形如 `return x, y, z` 的语法实际上是省略了圆括号的元组字面量构造（等价于 `return (x, y, z)`），调用侧再通过序列解包（Sequence Unpacking）将其拆分为多个变量。

```python
def noop() -> None:
    pass


def min_max_avg(numbers: list[float]) -> tuple[float, float, float]:
    total = sum(numbers)
    return min(numbers), max(numbers), total / len(numbers)


assert noop() is None

# 多返回值元组解包与星号表达式捕获
low, high, avg = min_max_avg([10.0, 20.0, 30.0])
assert (low, high, avg) == (10.0, 30.0, 20.0)

first, *rest = min_max_avg([10.0, 20.0, 30.0])
assert first == 10.0 and rest == [30.0, 20.0]
```

### 文档字符串（Docstring，PEP 257）规范与函数自省

函数体内的第一条语句如果是字符串字面量，编译器会将其提取并绑定到函数对象的 `__doc__` 属性上，称为**文档字符串（Docstring）**。

按照 **PEP 257** 与主流工程规范（Google Style / NumPy Style）：
- 第一行应为简明扼要的单句功能摘要；
- 若有多行，第二行留空，随后详细描述参数（`Args`）、返回值（`Returns`）及可能抛出的异常（`Raises`）；
- 运行期可通过 `help(func)`、`inspect.getdoc(func)` 以及 `inspect.signature(func)` 对函数进行全方位自省。

```python
import inspect


def parse_port(raw: str, *, allow_privileged: bool = False) -> int:
    """将字符串解析为合法的 TCP/UDP 端口号。

    Args:
        raw: 待解析的端口字符串。
        allow_privileged: 是否允许 1~1023 范围内的特权端口。

    Returns:
        解析后的整数端口号。

    Raises:
        ValueError: 端口号超出合法范围或格式错误。
    """
    port = int(raw)
    min_port = 1 if allow_privileged else 1024
    if not (min_port <= port <= 65535):
        raise ValueError(f"Port {port} out of range [{min_port}, 65535]")
    return port


# 使用 inspect 模块进行函数签名自省
sig = inspect.signature(parse_port)
assert list(sig.parameters.keys()) == ["raw", "allow_privileged"]
assert sig.parameters["allow_privileged"].kind == inspect.Parameter.KEYWORD_ONLY
assert sig.return_annotation is int
assert "将字符串解析为合法的 TCP/UDP 端口号。" in inspect.getdoc(parse_port)
```

---

## 五类参数体系与函数签名设计

Python 提供了极其灵活且表达力极强的五类形参机制，通过 `/` 和 `*` 两个分隔符精确约束调用侧的传参形态。

### 仅位置参数（Positional-Only Parameters，`/` 左侧）

由 **PEP 570**（Python 3.8）正式引入，位于 `/` 分隔符左侧的参数**只能通过位置传递**，严禁在调用侧使用关键字参数名指定。

**核心工程价值**：
1. **解耦形参命名与公开 API**：库作者可以随时重命名 `/` 左侧的形参而不会破坏任何调用方代码；
2. **避免与 `**kwargs` 发生键名冲突**：例如实现 `def format_map(template, /, **mapping)` 时，即使 `mapping` 字典中包含 `"template"` 键也不会引发 `TypeError: got multiple values for argument`。

```python
def render_tag(tag_name: str, /, **attrs: str) -> str:
    # 即使 attrs 中传入 tag_name="custom"，也不会与第一个位置形参冲突
    attr_str = " ".join(f'{k}="{v}"' for k, v in attrs.items())
    return f"<{tag_name} {attr_str}>".strip()


assert render_tag("div", id="main", tag_name="custom") == '<div id="main" tag_name="custom">'
```

### 位置或关键字参数（Positional-or-Keyword Parameters）与默认参数值

这是 Python 默认的常规参数类型（位于 `/` 右侧、`*` 左侧）。调用方既可以按位置顺序传入，也可以显式指定 `param=value` 关键字传入。

当为参数指定默认值（`param=default`）时：
- 在同一参数分区（非 Keyword-Only 区）内，**带默认值的参数必须位于无默认值参数之后**，否则在语法解析期直接抛出 `SyntaxError: parameter without a default follows parameter with a default`。

```python
def connect(host: str, port: int = 5432, timeout: float = 3.0) -> str:
    return f"{host}:{port} (timeout={timeout}s)"


assert connect("127.0.0.1") == "127.0.0.1:5432 (timeout=3.0s)"
assert connect("127.0.0.1", timeout=10.0) == "127.0.0.1:5432 (timeout=10.0s)"
assert connect(port=3306, host="db.internal") == "db.internal:3306 (timeout=3.0s)"
```

### 可变位置参数（`*args`：聚合为元组）

在形参前添加单个星号（惯例命名为 `*args`），会捕获调用侧所有未被前面位置形参匹配的剩余位置实参，并将它们打包为一个**不可变元组（`tuple`）**。若调用侧未传入额外位置参数，则 `args` 为空元组 `()`。

在调用侧使用 `*iterable` 则执行相反的**实参解包（Unpacking）**操作，将可迭代对象展开为独立的位置实参。

```python
def calc_weighted_sum(scale: float, *values: float) -> float:
    # values 在函数内部始终是一个 tuple
    assert isinstance(values, tuple)
    return scale * sum(values)


assert calc_weighted_sum(2.0, 1, 2, 3) == 12.0
assert calc_weighted_sum(2.0) == 0.0

nums = [4.0, 5.0, 6.0]
assert calc_weighted_sum(0.5, *nums) == 7.5
```

### 仅关键字参数（Keyword-Only Parameters，`*` 或 `*args` 右侧）

由 **PEP 3102** 引入，位于 `*args` 或裸星号分隔符 `*` 右侧的普通形参**必须通过 `name=value` 关键字形式传递**。如果不希望函数接收任意额外位置参数，只需在参数列表中放置一个单独的 `*` 即可开启仅关键字参数区。

!!! tip "工程实践"
    对于布尔开关标志（Boolean Flags，如 `overwrite: bool = False`、`strict: bool = True`）或具有超过 3 个配置项的公共 API，强烈建议将它们声明在 `*` 右侧作为**仅关键字参数**。这样能彻底杜绝调用侧出现 `process_file("a.txt", True, False, True)` 这种可读性极差的“神秘布尔值调用（Boolean Trap）”。

```python
def export_csv(data: list[dict], *, delimiter: str = ",", include_header: bool = True) -> str:
    if not data:
        return ""
    lines = []
    if include_header:
        lines.append(delimiter.join(data[0].keys()))
    for row in data:
        lines.append(delimiter.join(str(v) for v in row.values()))
    return "\n".join(lines)


records = [{"id": 1, "name": "Alice"}]
assert export_csv(records, delimiter="|") == "id|name\n1|Alice"
```

### 可变关键字参数（`**kwargs`：聚合为字典）

在最后一个形参前添加双星号（惯例命名为 `**kwargs`），会捕获所有未被具名形参匹配的剩余关键字实参，并将它们打包为一个保持插入顺序的普通字典 `dict[str, Any]`。调用侧同样可以使用 `**mapping` 将字典解包为关键字实参传入。

```python
def build_query(table: str, **filters: object) -> str:
    assert isinstance(filters, dict)
    clauses = [f"{k}={v!r}" for k, v in filters.items()]
    where = " AND ".join(clauses) if clauses else "1=1"
    return f"SELECT * FROM {table} WHERE {where}"


params = {"status": "active", "role": "admin"}
assert build_query("users", **params) == "SELECT * FROM users WHERE status='active' AND role='admin'"
```

### 五类参数的完整声明顺序与调用侧实参绑定优先级规则

当一个函数同时使用全部五类参数时，定义侧必须严格遵守以下语法顺序：

```text
def func(pos_only, /, pos_or_kw, *args, kw_only, **kwargs):
         ────────     ─────────  ─────  ───────  ────────
         1.仅位置     2.位置/关键字 3.可变位置 4.仅关键字 5.可变关键字
```

| 序号 | 参数种类 | 定义语法特征 | 调用侧传参约束 | 是否支持默认值 |
| :---: | :--- | :--- | :--- | :---: |
| 1 | 仅位置参数 (`POSITIONAL_ONLY`) | 位于 `/` 左侧 | 只能按位置传递 | 支持 |
| 2 | 位置或关键字参数 (`POSITIONAL_OR_KEYWORD`) | 位于 `/` 右侧、`*` 左侧 | 可按位置或关键字传递 | 支持 |
| 3 | 可变位置参数 (`VAR_POSITIONAL`) | `*args` | 吸收多余位置参数为 `tuple` | 不适用（默认 `()`） |
| 4 | 仅关键字参数 (`KEYWORD_ONLY`) | 位于 `*` 或 `*args` 右侧 | 只能按 `key=val` 关键字传递 | 支持（无默认值也可位于有默认值参数之后） |
| 5 | 可变关键字参数 (`VAR_KEYWORD`) | `**kwargs` | 吸收多余关键字参数为 `dict` | 不适用（默认 `{}`） |

**调用侧实参约束与绑定顺序**：
1. 调用侧**位置实参必须出现在关键字实参之前**（例如 `f(a=1, 2)` 触发 `SyntaxError: positional argument follows keyword argument`），但 `*iterable` 解包如果出现在关键字参数之后仍会被先按位置求值绑定；
2. 解释器首先将所有位置实参按顺序填入形参槽位（`pos_only` -> `pos_or_kw`），溢出的位置实参归入 `*args`；
3. 接着将关键字实参按名字填入 `pos_or_kw` 与 `kw_only` 槽位（若该槽位已被位置实参填充，则立即抛出 `TypeError: got multiple values for argument`），未匹配到的关键字归入 `**kwargs`；
4. 最后为所有仍未绑定实参的槽位填充默认值（`__defaults__` 与 `__kwdefaults__`），若仍有必填槽位为空，抛出 `TypeError: missing required argument`。

```python
def full_signature(
    a: int,
    b: int = 2,
    /,
    c: int = 3,
    *args: int,
    d: int,
    e: int = 5,
    **kwargs: int,
) -> tuple:
    return (a, b, c, args, d, e, kwargs)


res = full_signature(10, 20, 30, 40, 50, d=60, x=99)
assert res == (10, 20, 30, (40, 50), 60, 5, {"x": 99})
```

---

## 可变默认参数陷阱与防御模式

### 默认参数在 `def` 定义期单次求值的底层机制（`__defaults__` 与 `__kwdefaults__`）

初学者最常踩入的 Python 陷阱，莫过于误以为默认参数表达式会在每次调用函数时重新求值。

!!! note "底层原理"
    默认参数表达式**仅在 `def` 语句执行（即函数对象创建）时求值一次**！求值得到的对象引用被直接保存在函数对象的 `__defaults__` 元组（或 `__kwdefaults__` 字典）属性中。后续每次函数调用若未显式传参，局部变量都会直接绑定到 `__defaults__` 中存储的**同一个对象引用**上。

### 跨调用共享可变默认参数（如 `def f(items=[])`）引发的状态串味复现

当默认参数是 `list`、`dict`、`set` 或自定义可变实例时，在函数体内对该参数进行原地修改（In-place Mutation，如 `.append()`），实际上直接篡改了绑定在函数对象 `__defaults__` 上的持久化容器，导致跨调用状态污染。

```python
def append_tag_buggy(tag: str, tags: list[str] = []) -> list[str]:
    tags.append(tag)
    return tags


# 第一次调用未传 tags，修改了 append_tag_buggy.__defaults__[0]
first_call = append_tag_buggy("python")
assert first_call == ["python"]
assert append_tag_buggy.__defaults__ == (["python"],)

# 第二次调用继续复用同一个列表对象，引发严重的状态串味！
second_call = append_tag_buggy("rust")
assert second_call == ["python", "rust"]
assert first_call is second_call
```

### 标准防御模式：`None` 哨兵值与自定义唯一哨兵对象（`_MISSING = object()`）

为了确保每次未传参调用都能获得全新的可变容器，工程上有两种标准防御范式：

1. **`None` 哨兵模式（95% 场景首选）**：将默认值设为不可变的 `None`（类型注解为 `list[str] | None = None`），在函数体开头通过 `if items is None: items = []` 在运行期每次新建容器。
2. **自定义唯一哨兵对象模式（当 `None` 本身是合法业务输入值时）**：在模块级创建 `_MISSING = object()` 作为唯一哨兵实例，用 `is _MISSING` 精确区分“调用者未传参”与“调用者显式传入了 `None`”。

```python
from typing import Any

# 模式 1：None 哨兵值（常规场景）
def append_tag_safe(tag: str, tags: list[str] | None = None) -> list[str]:
    if tags is None:
        tags = []
    tags.append(tag)
    return tags


assert append_tag_safe("python") == ["python"]
assert append_tag_safe("rust") == ["rust"]


# 模式 2：当 None 属于有意义的业务实参时，使用 object() 唯一哨兵
_MISSING = object()


def cache_set(key: str, value: Any = _MISSING) -> str:
    if value is _MISSING:
        return f"No value provided for {key}"
    if value is None:
        return f"Explicitly cached None for {key}"
    return f"Cached {value!r} for {key}"


assert cache_set("user:1") == "No value provided for user:1"
assert cache_set("user:1", None) == "Explicitly cached None for user:1"
```

---

## LEGB 作用域规则与名字空间

### 四层作用域解析顺序：Local -> Enclosing -> Global -> Built-in

Python 采用**静态词法作用域（Lexical Scoping）**：变量名所属的作用域由源代码的文本嵌套结构在编译期决定，而与函数的运行期调用栈顺序无关。当在函数内读取一个变量名时，解释器严格按照 **LEGB** 顺序由内向外检索名字空间：

| 层级 | 缩写 | 英文全称 | 包含范围与生命周期 |
| :---: | :---: | :--- | :--- |
| 1 | **L** | **Local**（局部作用域） | 当前函数调用栈帧内的局部变量与形参；每次调用创建，返回时销毁 |
| 2 | **E** | **Enclosing**（嵌套外层函数作用域） | 所有外层嵌套函数（从内向外）的局部作用域；通过闭包 `cell` 跨越生命周期留存 |
| 3 | **G** | **Global**（模块全局作用域） | 当前 `.py` 模块顶层定义的变量（即模块的 `__dict__`）；随模块导入创建，进程退出销毁 |
| 4 | **B** | **Built-in**（内置作用域） | `builtins` 标准模块中的预置符号（如 `len`、`int`、`ValueError`） |

若走完 L -> E -> G -> B 四层仍未找到该标识符，解释器在运行期抛出 `NameError`。

```python
level = "Global"


def outer() -> tuple[str, str, int]:
    level = "Enclosing"

    def inner() -> tuple[str, str, int]:
        local_var = "Local"
        # local_var 命中 L；level 命中 E；len 命中 B
        return local_var, level, len(local_var)

    return inner()


assert outer() == ("Local", "Enclosing", 5)
```

### 编译期局部变量静态判定与 `UnboundLocalError` 的触发根源

Python 在将 `def` 函数体编译为字节码时，会对整个函数体做一次静态语法扫描：

!!! warning "注意"
    只要函数体内的**任何位置**出现了对某个变量名的绑定操作（包括 `x = ...`、`x += ...`、`for x in ...`、`import x`、`except Exception as x`），且没有显式声明 `global x` 或 `nonlocal x`，编译器就会将该变量在整个函数体内标记为**局部变量（Local Variable）**，并生成 `LOAD_FAST` 指令读取它，而绝不会向外层 `E/G/B` 查找！

如果在赋值语句执行之前就尝试读取该变量，`LOAD_FAST` 会发现局部槽位尚未初始化，从而抛出 `UnboundLocalError: cannot access local variable 'x' where it is not associated with a value`。

```python
counter = 10


def broken_increment() -> None:
    # 因为下一行存在 counter += 1（对 counter 的赋值绑定），
    # 编译器将整个 broken_increment 中的 counter 静态判定为 Local 局部变量！
    # 执行右侧读取 counter 时，局部槽位尚未绑定值，立即抛出 UnboundLocalError。
    counter += 1


try:
    broken_increment()
except UnboundLocalError as exc:
    assert "counter" in str(exc)
```

### `global` 与 `nonlocal` 关键字的跨作用域重绑定语义及使用边界

当确实需要在内层函数中**重新绑定（Rebind，即修改变量引用指向）**外层作用域的变量名时，必须通过声明语句显式告知编译器：

- **`global var`**：指示编译器将该标识符的读写直接编译为 `LOAD_GLOBAL` / `STORE_GLOBAL`，指向当前模块顶层（Global）命名空间。即使模块顶层尚未定义该变量，函数内赋值后也会在全局自动创建。
- **`nonlocal var`**（PEP 3104）：指示编译器向外层嵌套函数作用域（Enclosing）逐层寻找最近的同名局部变量并绑定。**边界限制**：`nonlocal` 只能绑定外层函数（E）中的已存在局部变量，**不能穿透到模块全局（G）**；若外层函数不存在该变量，编译期直接报错 `SyntaxError: no binding for nonlocal 'var' found`。

*注：若只是原地修改外层可变对象的内容（如 `global_list.append(1)` 或 `enclosing_dict["k"] = "v"`），由于没有改变变量名本身的引用绑定，**不需要**声明 `global` 或 `nonlocal`。*

```python
app_state = "INIT"


def make_session() -> tuple[str, int, int]:
    seq = 0

    def step() -> int:
        global app_state
        nonlocal seq
        app_state = "RUNNING"  # 重绑定 Global 变量
        seq += 1               # 重绑定 Enclosing 变量
        return seq

    first = step()
    second = step()
    return app_state, first, second


assert make_session() == ("RUNNING", 1, 2)
assert app_state == "RUNNING"
```

---

## 闭包（Closures）与延迟绑定陷阱

### 闭包的形成条件、自由变量（Free Variables）与底层 `cell` 对象（`__closure__`）

**闭包（Closure）**是指一个延伸了作用域的嵌套函数：它不仅包含函数自身的字节码，还持有了定义时外层函数作用域（Enclosing）中非全局变量的引用。即使外层函数已经执行完毕、其栈帧已出栈销毁，内层函数依然能正常读写这些被捕获的变量。

闭包的三个形成条件：
1. 存在内外嵌套的函数定义；
2. 内层函数引用了外层函数局部作用域中的变量（这类在外层定义、在内层使用但未在内层定义的变量称为**自由变量 Free Variables**）；
3. 外层函数将内层函数对象返回或传递到外部作用域。

!!! note "底层原理：双跳指针与 `cell` 对象"
    正常情况下，函数的局部变量存储在栈帧的快速局部变量数组中，函数返回后栈帧释放。当编译器检测到某个外层局部变量被内层函数捕获为自由变量时，会为其创建一个堆上的间接容器——**`cell` 对象**。外层函数与内层函数的 `__closure__` 元组共同持有指向同一个 `cell` 对象的指针，而真实的值存放在 `cell.cell_contents` 中。通过这层间接寻址，内外函数即便处于不同的生命周期，也能共享并同步修改同一个变量状态。

```python
def make_accumulator(initial: int):
    total = initial

    def add(value: int) -> int:
        nonlocal total
        total += value
        return total

    return add


acc = make_accumulator(10)
assert acc(5) == 15
assert acc(20) == 35

# 自省闭包的自由变量名与底层 cell 对象
assert acc.__code__.co_freevars == ("total",)
assert acc.__closure__ is not None
assert acc.__closure__[0].cell_contents == 35
```

### 利用闭包保存局部状态与构建轻量级函数工厂

当一个类只需要对外提供一个方法（除 `__init__` 外仅有一个业务方法）且只需维护少量私有状态时，使用闭包构建**函数工厂（Function Factory）**比定义完整的 `class` 更加轻量、简洁，同时天然具备极强的状态封装性。

```python
from typing import Callable


def make_exponential_backoff(base_delay: float, factor: float = 2.0) -> Callable[[], float]:
    """构建一个每次调用自动按指数增长返回退避延迟时间的有状态闭包。"""
    attempt = 0

    def next_delay() -> float:
        nonlocal attempt
        delay = base_delay * (factor ** attempt)
        attempt += 1
        return delay

    return next_delay


backoff = make_exponential_backoff(0.5, factor=2.0)
assert [backoff(), backoff(), backoff()] == [0.5, 1.0, 2.0]
```

### 经典陷阱：循环中创建闭包的延迟绑定（Late Binding）问题与默认参数/偏函数立即绑定解法

闭包捕获的是**变量对应的 `cell` 引用**，而不是创建函数那一刻变量的“值快照”。自由变量的值是在**内层函数真正被调用时（运行期）**才去 `cell.cell_contents` 中读取的，这一机制称为**延迟绑定（Late Binding）**。

当在 `for` 循环中批量创建闭包（或 `lambda`）并引用循环变量时，所有闭包共享同一个循环变量的 `cell`。等循环结束后调用这些函数时，它们读取到的全都是循环变量在最后一次迭代结束时的最终值！

```python
from functools import partial
from typing import Callable

# 错误示范：所有 lambda 共享同一个外层循环变量 i 的 cell
buggy_multipliers: list[Callable[[int], int]] = [lambda x: x * i for i in range(4)]
# 循环结束后 i == 3，因此所有函数都乘以 3！
assert [fn(10) for fn in buggy_multipliers] == [30, 30, 30, 30]


# 解法 1：利用默认参数在 def/lambda 定义期立即求值的特性（Eager Binding）
fixed_via_default: list[Callable[[int], int]] = [
    lambda x, current_i=i: x * current_i for i in range(4)
]
assert [fn(10) for fn in fixed_via_default] == [0, 10, 20, 30]


# 解法 2：使用 functools.partial 在循环当次直接冻结参数（工程中更具可读性）
def multiply_by(factor: int, x: int) -> int:
    return factor * x


fixed_via_partial: list[Callable[[int], int]] = [
    partial(multiply_by, i) for i in range(4)
]
assert [fn(10) for fn in fixed_via_partial] == [0, 10, 20, 30]
```

---

## 装饰器（Decorators）深度剖析

### 装饰器本质与 `@decorator` 语法糖（模块加载期装饰 vs 运行期调用）

装饰器（Decorator）本质上是一个**接收可调用对象（Callable）作为输入，并返回一个新的或增强后的可调用对象的高阶函数（或类）**。它遵循设计模式中的“开放-封闭原则（OCP）”，在不侵入修改原函数源码的前提下，透明地植入日志、鉴权、缓存、计时、重试等横切关注点（Cross-Cutting Concerns）。

`@decorator` 纯粹是以下重绑定赋值语句的语法糖：

```python
# 使用 @ 语法糖
@decorator
def target():
    pass

# 完全等价的底层执行形式：
def target():
    pass
target = decorator(target)
```

**关键生命周期区分**：
- **模块加载期（Import Time / Definition Time）**：当模块被导入、解释器执行到 `@decorator` 下的 `def target()` 时，`decorator(target)` **会立即执行**！
- **函数运行期（Call Time）**：只有当业务代码真正调用 `target()` 时，由装饰器内部返回的包装函数 `wrapper()` 才会被触发执行。

### 使用 `@functools.wraps` 保留原函数的元信息（`__name__` / `__doc__` / `__wrapped__`）

编写装饰器时，通常会返回一个内部闭包函数 `wrapper` 替换原函数 `func`。如果不做额外处理，外部看到的函数名（`__name__`）、文档字符串（`__doc__`）和类型注解（`__annotations__`）都会变成 `wrapper` 的信息，导致调试日志、Sphinx 文档生成、FastAPI/Pydantic 签名自省彻底失效。

必须始终使用标准库的 `@functools.wraps(func)` 装饰内部 `wrapper` 函数：
1. 它会自动拷贝原函数的 `__module__`、`__name__`、`__qualname__`、`__doc__`、`__annotations__` 和 `__type_params__`（Python 3.12+），并合并更新 `__dict__`；
2. 它会在 `wrapper` 上设置 **`__wrapped__ = func`** 属性，使 `inspect.signature()` 能够自动穿透装饰器还原真实签名，也允许调用方在必要时通过 `func.__wrapped__` 绕过装饰器直接调用原函数。

### 处理任意参数签名（`*args, **kwargs`）与装饰器返回值透传

一个通用的函数装饰器模板必须满足两点：
1. `wrapper(*args, **kwargs)` 使用可变位置与可变关键字参数接收任意调用实参，并原样透传给 `func(*args, **kwargs)`；
2. **显式捕获并 `return` 原函数的返回值**，切勿遗漏 `return` 导致原函数返回值被吞噬为 `None`。

```python
import functools
from typing import Callable


def audit_log[**P, R](func: Callable[P, R]) -> Callable[P, R]:
    """使用 Python 3.12+ PEP 695 泛型语法实现类型安全的通用装饰器。"""
    @functools.wraps(func)
    def wrapper(*args: P.args, **kwargs: P.kwargs) -> R:
        result = func(*args, **kwargs)
        wrapper.last_call = (args, kwargs, result)  # 记录最近一次调用审计信息
        return result

    wrapper.last_call = None
    return wrapper


@audit_log
def power(base: int, exp: int = 2) -> int:
    """计算整数幂。"""
    return base ** exp


assert power(3, exp=3) == 27
assert power.__name__ == "power"
assert power.__doc__ == "计算整数幂。"
assert power.last_call == ((3,), {"exp": 3}, 27)
# 通过 __wrapped__ 可直接访问未装饰的原始函数
assert power.__wrapped__(2, 4) == 16
```

### 带参数的装饰器（三层函数嵌套）与兼容无括号/有括号的双模装饰器

当装饰器本身需要接收配置参数（如 `@retry(max_attempts=3)`）时，需要注意 `@retry(max_attempts=3)` 中括号内的函数调用**先被求值**，其返回值才是真正的装饰器函数，随后再接收被装饰的 `func`。这构成了经典的**三层函数嵌套结构**：

1. 最外层 `retry(max_attempts=3)`：接收装饰器配置参数，返回 `decorator`；
2. 中间层 `decorator(func)`：接收被装饰的目标函数，返回 `wrapper`；
3. 最内层 `wrapper(*args, **kwargs)`：在每次调用时执行增强逻辑与原函数。

通过让第一个位置参数 `func=None` 并配合仅关键字配置参数（`*`），可以将三层结构优雅地合并为**既支持 `@ trace`（无括号）又支持 `@trace(prefix="...")`（有括号）的双模装饰器**：

```python
import functools
from typing import Any, Callable


def trace(
    func: Callable[..., Any] | None = None,
    *,
    prefix: str = "TRACE",
) -> Callable[..., Any]:
    """同时支持 @trace 与 @trace(prefix='CUSTOM') 的双模装饰器。"""
    def decorator(target: Callable[..., Any]) -> Callable[..., Any]:
        @functools.wraps(target)
        def wrapper(*args: Any, **kwargs: Any) -> Any:
            res = target(*args, **kwargs)
            return f"[{prefix}] {target.__name__} -> {res}"

        return wrapper

    # 若 func 不为 None，说明使用的是无括号形式 @trace
    if func is not None:
        return decorator(func)
    # 否则使用的是有括号形式 @trace(prefix=...)，返回真正的 decorator
    return decorator


@trace
def greet_default(name: str) -> str:
    return f"Hello, {name}"


@trace(prefix="AUDIT")
def greet_custom(name: str) -> str:
    return f"Hello, {name}"


assert greet_default("Alice") == "[TRACE] greet_default -> Hello, Alice"
assert greet_custom("Bob") == "[AUDIT] greet_custom -> Hello, Bob"
```

### 基于类的装饰器（利用 `__init__` 与 `__call__` 维护状态）及类装饰器（装饰 `class`）

这里需要区分两个容易混淆的概念：

1. **用类实现的装饰器（Class-based Decorator）**：由于任何实现了 `__call__` 魔术方法的类实例都是可调用对象（Callable），我们可以用 `__init__(self, func)` 保存原函数并初始化复杂状态，用 `__call__(self, *args, **kwargs)` 实现包装逻辑。
2. **装饰类的装饰器（Class Decorator）**：装饰器的作用目标不仅限于函数，也可以直接作用于 `class` 定义（如标准库的 `@dataclass`、`@functools.total_ordering`）。类装饰器接收类对象 `cls` 作为参数，动态为其注入属性、包装方法或注册到全局插件表中，最后返回 `cls`。

```python
import functools
from typing import Any, Callable


# 1. 用类实现的有状态函数装饰器：统计函数调用次数
class CountCalls:
    def __init__(self, func: Callable[..., Any]) -> None:
        functools.update_wrapper(self, func)
        self.func = func
        self.call_count = 0

    def __call__(self, *args: Any, **kwargs: Any) -> Any:
        self.call_count += 1
        return self.func(*args, **kwargs)


@CountCalls
def compute(x: int) -> int:
    return x * 2


assert compute(3) == 6 and compute(5) == 10
assert compute.call_count == 2


# 2. 装饰 class 的类装饰器：自动将类注册到插件注册表
PLUGIN_REGISTRY: dict[str, type] = {}


def register_plugin(name: str) -> Callable[[type], type]:
    def decorator(cls: type) -> type:
        PLUGIN_REGISTRY[name] = cls
        cls.plugin_name = name
        return cls

    return decorator


@register_plugin("json_exporter")
class JsonExporter:
    pass


assert PLUGIN_REGISTRY["json_exporter"] is JsonExporter
assert JsonExporter.plugin_name == "json_exporter"
```

!!! warning "注意：用类实现的装饰器装饰实例方法时的描述符陷阱"
    如果用上面的 `CountCalls` 类去装饰另一个类中的普通实例方法（`def method(self)`），调用 `instance.method()` 时会报错 `TypeError: method() missing 1 required positional argument: 'self'`。因为 `CountCalls` 实例没有实现描述符协议的 `__get__` 方法，无法在属性访问时将宿主实例 `self` 绑定进去。因此装饰类实例方法时，优先使用基于闭包函数的装饰器，或者在类装饰器中显式实现 `def __get__(self, instance, owner)`。

### 多层装饰器堆叠时的应用顺序（自下而上）与执行顺序（自上而下洋葱模型）

当同一个函数上堆叠多个装饰器时：

```python
@decorator_outer
@decorator_inner
def func():
    pass
```

完全等价于：`func = decorator_outer(decorator_inner(func))`。

- **装饰组装顺序（定义期，自下而上 / 由内向外）**：先执行紧贴函数的 `@decorator_inner`，再将其返回的 `inner_wrapper` 交给上方的 `@decorator_outer` 包装为 `outer_wrapper`。
- **调用执行顺序（运行期，自上而下洋葱模型）**：调用 `func()` 时，首先进入最外层的 `outer_wrapper` 前置逻辑 -> 进入内层 `inner_wrapper` 前置逻辑 -> 执行核心 `func()` -> 执行内层 `inner_wrapper` 后置逻辑 -> 最后执行外层 `outer_wrapper` 后置逻辑返回。

```python
import functools
from typing import Callable


def wrap_tag(tag: str):
    def decorator(func: Callable[[], str]) -> Callable[[], str]:
        @functools.wraps(func)
        def wrapper() -> str:
            return f"<{tag}>{func()}</{tag}>"

        return wrapper

    return decorator


@wrap_tag("div")
@wrap_tag("p")
def render_text() -> str:
    return "Hello"


# 定义期先包 <p>，再在外面包 <div>；调用期从外层 <div> 开始拼装
assert render_text() == "<div><p>Hello</p></div>"
```

---

## 函数式编程特性与高阶工具

Python 并非纯函数式语言，但它吸收了函数式编程中最实用的声明式数据转换工具，配合推导式与标准库 `functools`、`operator`、`itertools`，能够写出极简且无副作用的数据流水线。

### 匿名函数 `lambda` 的单表达式限制与适用场景

`lambda 参数列表: 表达式` 用于在表达式内部内联创建匿名 `function` 对象。在字节码层面，`lambda` 与 `def` 生成的函数对象没有任何性能或结构差异（除了 `__name__` 固定为 `"<lambda>"`）。

**核心语法限制**：`lambda` 冒号右侧**只能包含单个表达式（Single Expression）**，绝不能包含赋值语句（`=`，但可使用 `:=` 海象表达式）、`return`、`try/except`、`while` 等语句块。

**工程适用边界**：
- **推荐场景**：作为 `sorted()`、`min()`、`max()` 等高阶函数的短小 `key` 回调，且逻辑一眼可读。
- **反模式警告（PEP 8）**：**永远不要将 `lambda` 赋值给具名变量**（如 `f = lambda x: x + 1`）。一旦需要绑定名字，必须使用 `def f(x): return x + 1`，否则回溯栈（Traceback）和调试器中只会显示令人困惑的 `<lambda>`。

### `map()`、`filter()` 惰性高阶函数与列表推导式 / 生成器表达式的选型对比

在 Python 3 中，内置高阶函数 `map(func, *iterables)` 与 `filter(pred, iterable)` 均返回**惰性求值的迭代器（Iterator）**，仅在迭代消费时按需计算，内存占用为 $O(1)$。

在现代 Python 代码审查中，`map()` / `filter()` 与列表推导式（List Comprehension）/ 生成器表达式（Generator Expression）的选型遵循以下清晰准则：

| 场景对比 | `map()` / `filter()` 写法 | 推导式 / 生成器表达式写法 | 工程推荐选型 |
| :--- | :--- | :--- | :--- |
| 已有现成的具名函数（无需 `lambda`） | `map(str.strip, lines)` | `(line.strip() for line in lines)` | **`map` 更简洁且略快**（免去 Python 层循环栈帧开销） |
| 需要编写算术或复杂表达式（需配合 `lambda`） | `map(lambda x: x ** 2, nums)` | `(x ** 2 for x in nums)` | **推导式完胜**（省去 `lambda` 调用开销，可读性极佳） |
| 同时包含映射与条件过滤 | `map(lambda x: x*2, filter(lambda x: x>0, nums))` | `[x * 2 for x in nums if x > 0]` | **推导式完胜**（扁平直观，无需嵌套） |
| 多序列并行同步映射 | `map(pow, [2, 3], [3, 2])` | `[pow(a, b) for a, b in zip([2, 3], [3, 2])]` | 均可（`map` 原生支持多序列截断映射） |

```python
raw_inputs = ["  42 ", " -7", " 100  "]

# 1. 有现成内置函数时，map(int, ...) 干净利落
parsed = list(map(int, raw_inputs))
assert parsed == [42, -7, 100]

# 2. 同时需要过滤与表达式变换时，列表推导式可读性远高于 map + filter + lambda
positive_squares = [x ** 2 for x in parsed if x > 0]
assert positive_squares == [1764, 10000]
```

### `functools` 核心工具箱：`reduce()` 归约、`partial()` 偏函数固定参数与 `@cache` / `@lru_cache` 记忆化缓存

`functools` 模块是 Python 高阶函数编程的核心武器库：

1. **`functools.reduce(function, iterable[, initializer])`**：使用二元函数从左到右对序列进行累积归约。工程上建议**始终显式传入第三个参数 `initializer`**（初始值），防止传入空序列时抛出 `TypeError: reduce() of empty iterable with no initial value`。*(注：求和、求积、逻辑判断请优先使用专用内置函数 `sum()`、`math.prod()`、`any()`、`all()`)。*
2. **`functools.partial(func, /, *args, **keywords)`**：冻结函数的部分位置参数或关键字参数，返回一个签名更简化的新可调用对象（`partial` 对象，拥有 `.func`、`.args`、`.keywords` 自省属性）。非常适合将多参数函数适配为单参数回调函数。
3. **`@functools.cache` 与 `@functools.lru_cache(maxsize=128, typed=False)`**：
   - 将纯函数的入参作为字典键，自动缓存计算结果（Memoization），可将具有重叠子问题的递归算法（如动态规划、斐波那契数列）从指数级 $O(2^n)$ 瞬间降为线性级 $O(n)$。
   - `@cache`（Python 3.9+）等价于 `@lru_cache(maxsize=None)`，无容量上限，速度更快；`@lru_cache` 则采用最近最少使用（LRU）淘汰策略防止内存无限增长。
   - **硬性约束**：由于底层基于 `dict` 存储缓存键，**被缓存函数的所有位置参数和关键字参数都必须是可哈希的（Hashable）**，传入 `list` 或 `dict` 会立即抛出 `TypeError: unhashable type`。

```python
from functools import cache, lru_cache, partial, reduce

# 1. reduce 配合 initializer 安全归约嵌套字典访问
config = {"db": {"primary": {"host": "10.0.0.1"}}}
path = ["db", "primary", "host"]
host = reduce(lambda d, key: d.get(key, {}) if isinstance(d, dict) else None, path, config)
assert host == "10.0.0.1"

# 2. partial 固定参数生成专用转换函数
int_base2 = partial(int, base=2)
assert int_base2("1010") == 10
assert int_base2.func is int and int_base2.keywords == {"base": 2}


# 3. @lru_cache 记忆化缓存与缓存命中统计
@lru_cache(maxsize=64)
def fib(n: int) -> int:
    if n < 2:
        return n
    return fib(n - 1) + fib(n - 2)


assert fib(30) == 832040
info = fib.cache_info()
assert info.hits == 28 and info.misses == 31 and info.currsize == 31
fib.cache_clear()
```

### `operator` 模块：用 `itemgetter`、`attrgetter`、`methodcaller` 替代样板 `lambda`

标准库 `operator` 模块将 Python 的内置算术、比较以及属性/下标访问操作全部封装成了经过 C 语言层高度优化的函数与高阶可调用对象，常用于替代高频排序、分组中的样板 `lambda`：

| 工具函数 | 等价的 `lambda` 语义 | 增强特性 |
| :--- | :--- | :--- |
| `operator.itemgetter(k)` | `lambda obj: obj[k]` | 支持传入多个键 `itemgetter(k1, k2)`，直接返回提取出的元组 `(obj[k1], obj[k2])` |
| `operator.attrgetter("a")` | `lambda obj: obj.a` | 支持点号级联路径 `attrgetter("user.profile.age")` 及多属性元组提取 |
| `operator.methodcaller("m", *a)` | `lambda obj: obj.m(*a)` | 支持预先绑定方法调用所需的位置和关键字实参 |

```python
from dataclasses import dataclass
from operator import attrgetter, itemgetter, methodcaller

# 1. itemgetter 多键元组提取用于多级排序
employees = [
    {"dept": "AI", "level": 3, "name": "Bob"},
    {"dept": "AI", "level": 2, "name": "Alice"},
    {"dept": "Infra", "level": 1, "name": "Charlie"},
]
# 先按 dept 升序，再按 level 升序
sorted_emp = sorted(employees, key=itemgetter("dept", "level"))
assert [e["name"] for e in sorted_emp] == ["Alice", "Bob", "Charlie"]


# 2. attrgetter 支持深层嵌套属性点号穿透
@dataclass
class Address:
    city: str


@dataclass
class User:
    name: str
    addr: Address


users = [User("Bob", Address("Shanghai")), User("Alice", Address("Beijing"))]
users.sort(key=attrgetter("addr.city"))
assert [u.name for u in users] == ["Alice", "Bob"]

# 3. methodcaller 批量调用对象方法并传参
raw_tags = ["  python-3.12 ", "  rust-2024 "]
cleaned = list(map(methodcaller("replace", "-", "_"), map(methodcaller("strip"), raw_tags)))
assert cleaned == ["python_3.12", "rust_2024"]
```

---

## 练习与实战

### 练习 1：实现兼容无括号与带参数调用的异常重试装饰器 `@retry`

请编写一个通用的双模装饰器 `retry`，满足以下要求：
1. 既支持无括号直接装饰 `@retry`（默认最多尝试 `max_attempts=3` 次，拦截所有 `Exception`），也支持带关键字参数调用 `@retry(max_attempts=2, exceptions=(ValueError, TimeoutError))`；
2. 当被装饰函数抛出属于 `exceptions` 范围内的异常时，自动重试，直到成功返回结果，或达到 `max_attempts` 上限时将最后一次捕获的异常原样重新抛出；
3. 必须使用 `@functools.wraps` 完整保留原函数元信息，并在包装函数上维护一个 `attempts_used` 属性，记录最近一次调用实际尝试的次数。

??? success "点击查看答案与解析"
    **核心解析**：利用首参 `func: Callable | None = None` 配合 `*` 仅关键字参数，即可在一个函数内同时兼容 `@retry` 与 `@retry(...)` 两种调用形态。注意 `max_attempts` 至少应为 `1`，且每次外部调用 `wrapper` 时应重置并累加 `wrapper.attempts_used`。

    ```python
    import functools
    from typing import Any, Callable


    def retry(
        func: Callable[..., Any] | None = None,
        *,
        max_attempts: int = 3,
        exceptions: tuple[type[BaseException], ...] = (Exception,),
    ) -> Callable[..., Any]:
        if max_attempts < 1:
            raise ValueError("max_attempts must be >= 1")

        def decorator(target: Callable[..., Any]) -> Callable[..., Any]:
            @functools.wraps(target)
            def wrapper(*args: Any, **kwargs: Any) -> Any:
                wrapper.attempts_used = 0
                last_exc: BaseException | None = None
                for _ in range(max_attempts):
                    wrapper.attempts_used += 1
                    try:
                        return target(*args, **kwargs)
                    except exceptions as exc:
                        last_exc = exc
                assert last_exc is not None
                raise last_exc

            wrapper.attempts_used = 0
            return wrapper

        if func is not None:
            return decorator(func)
        return decorator


    # 测试 1：无括号模式，前 2 次失败、第 3 次成功
    state = {"count": 0}


    @retry
    def flaky_fetch() -> str:
        """模拟不稳定的网络请求。"""
        state["count"] += 1
        if state["count"] < 3:
            raise ConnectionError("Temporary network failure")
        return "200 OK"


    assert flaky_fetch() == "200 OK"
    assert flaky_fetch.attempts_used == 3
    assert flaky_fetch.__name__ == "flaky_fetch"

    # 测试 2：带参数模式，非匹配异常不重试直接抛出
    @retry(max_attempts=3, exceptions=(ValueError,))
    def raise_type_error() -> None:
        raise TypeError("Fatal bug")


    try:
        raise_type_error()
    except TypeError:
        assert raise_type_error.attempts_used == 1
    ```

### 练习 2：排查并修复事件处理器注册表中的“可变默认参数 + 循环延迟绑定”双重 Bug

下面这段代码试图为不同优先级的告警级别生成对应的日志格式化闭包，并存入处理器列表 `handlers` 中，但其中同时隐藏了**可变默认参数共享**与**循环闭包延迟绑定**两大经典缺陷：

```python
def register_formatters(levels: list[str], handlers: list = []) -> list:
    for level in levels:
        handlers.append(lambda msg: f"[{level.upper()}] {msg}")
    return handlers
```

请分析为什么连续调用 `register_formatters(["info", "error"])` 和 `register_formatters(["debug"])` 会产生错误输出，并给出修复后的优雅实现与断言验证。

??? success "点击查看答案与解析"
    **原因分析**：
    1. **可变默认参数陷阱**：`handlers: list = []` 在 `def` 定义期只创建一个列表对象。第二次调用 `register_formatters(["debug"])` 未传 `handlers` 时，会继续向第一次调用留下的列表里追加元素，导致返回 3 个处理器而非 1 个。
    2. **闭包延迟绑定陷阱**：`lambda msg: f"[{level.upper()}] {msg}"` 中的自由变量 `level` 绑定的是外层循环变量 `level` 的 `cell`。当循环结束后调用列表里的任何函数时，`level` 的值全都变成了最后一次迭代的 `"error"`。

    **修复代码**：使用 `handlers: list | None = None` 哨兵消除状态共享，并使用默认参数 `lv: str = level` 在创建 `lambda` 当刻立即绑定当次循环的值。

    ```python
    from typing import Callable


    def register_formatters(
        levels: list[str],
        handlers: list[Callable[[str], str]] | None = None,
    ) -> list[Callable[[str], str]]:
        if handlers is None:
            handlers = []
        for level in levels:
            handlers.append(lambda msg, lv=level: f"[{lv.upper()}] {msg}")
        return handlers


    batch1 = register_formatters(["info", "error"])
    assert [fn("disk full") for fn in batch1] == ["[INFO] disk full", "[ERROR] disk full"]

    # 第二次调用互不干扰
    batch2 = register_formatters(["debug"])
    assert [fn("connected") for fn in batch2] == ["[DEBUG] connected"]
    assert batch1 is not batch2
    ```

### 练习 3：利用闭包与自定义唯一哨兵构建支持手动失效的滑动窗口计数器

请编写一个闭包工厂函数 `make_rate_limiter(limit: int)`，用于限制操作配额。返回的内层函数 `acquire(cost: int = 1, *, reset_to: int = <唯一哨兵>) -> tuple[bool, int]` 需满足：
1. 内部通过闭包变量 `remaining` 维护剩余配额（初始等于 `limit`）；
2. 若调用时传入了 `reset_to` 参数（哪怕传入 `reset_to=0`），则首先将剩余配额重置为 `reset_to`；
3. 随后判断 `remaining >= cost`：若满足则扣减 `cost` 并返回 `(True, remaining)`；若配额不足则不扣减，直接返回 `(False, remaining)`。

??? success "点击查看答案与解析"
    **核心解析**：由于 `reset_to=0` 是合法的重置目标值，虽然此处用 `None` 也可区分 `int`，但练习使用 `_UNSET = object()` 唯一哨兵配合 `nonlocal remaining`，能够最严密地区分“是否传入了 `reset_to`”。

    ```python
    from typing import Any, Callable

    _UNSET: Any = object()


    def make_rate_limiter(limit: int) -> Callable[..., tuple[bool, int]]:
        remaining = limit

        def acquire(cost: int = 1, *, reset_to: int = _UNSET) -> tuple[bool, int]:
            nonlocal remaining
            if reset_to is not _UNSET:
                remaining = reset_to
            if remaining >= cost:
                remaining -= cost
                return True, remaining
            return False, remaining

        return acquire


    limiter = make_rate_limiter(5)
    assert limiter(2) == (True, 3)
    assert limiter(3) == (True, 0)
    assert limiter(1) == (False, 0)

    # 通过关键字参数重置配额并立即消费
    assert limiter(4, reset_to=10) == (True, 6)
    ```
