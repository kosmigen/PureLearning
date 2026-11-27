# 基础语法与对象模型

Python 的语法看似简洁直观，但其底层建立在一套高度一致的**对象模型（Object Model）**之上：“一切皆对象（Everything is an object）”，所有变量本质上都只是指向对象的**名字绑定（Name Binding）**。深入理解词法结构、引用语义、可变性边界与拷贝机制，是写出无隐蔽 Bug、符合 Pythonic 工程规范代码的基石。

---

## 词法规则与语句结构

### 源文件编码（UTF-8）、注释与文档字符串规范

Python 3 默认使用 **UTF-8** 作为源文件编码（PEP 3120），无需再像 Python 2 那样在文件头部显式声明 `# -*- coding: utf-8 -*-`。解释器在读取 `.py` 源码时直接按 UTF-8 解码字节流，若需强制指定其他编码（极少见），必须在文件第一行或第二行添加编码声明注释。

Python 中存在两类文本说明机制：**注释（Comments）**与**文档字符串（Docstrings，PEP 257）**，两者在编译期的命运截然不同：

| 特性 | 单行注释 `# ...` | 文档字符串 `"""..."""` |
| :--- | :--- | :--- |
| **语法位置** | 任意行首或语句末尾 | 模块、类、函数或方法体内的**第一条语句** |
| **编译器处理** | 词法分析阶段直接丢弃，不进入字节码 | 作为字符串字面量保留在字节码中，绑定到对象的 `__doc__` 属性 |
| **运行期可见性** | 不可见 | 可通过 `obj.__doc__`、`help(obj)`、`inspect.getdoc(obj)` 或 IDE 悬停读取 |
| **核心用途** | 解释代码“为什么这样写（Why）”与局部实现细节 | 声明公开接口契约（功能简述、参数 `Args`、返回值 `Returns`、异常 `Raises`） |

```python
import inspect


def calculate_discount(price: float, rate: float = 0.1) -> float:
    """计算折后价格。

    Args:
        price: 商品原价（必须非负）。
        rate: 折扣率，取值范围 [0.0, 1.0]。

    Returns:
        折后金额，保留两位小数。
    """
    # 使用 round 规避二进制浮点尾数展示误差（此行注释在编译期被剥离）
    return round(price * (1.0 - rate), 2)


assert calculate_discount(100.0, 0.15) == 85.0
# inspect.getdoc 会自动清理 docstring 的公共前导缩进
assert "计算折后价格。" in inspect.getdoc(calculate_discount)
```

!!! warning "注意：不要用三引号字符串充当普通多行注释"
    如果 `"""..."""` 没有出现在模块、类或函数的首句，而是出现在普通代码行之间，它本质上是一个**未绑定名字的字符串表达式语句**。虽然 CPython 优化器在大多数情况下会将其从字节码中剔除，但根据 PEP 8 规范，多行注释应当在每一行开头统一使用 `#`。

### 标识符命名规则、保留关键字（Keywords）与软关键字（Soft Keywords）

Python 标识符基于 Unicode 标准（PEP 3131，遵循 UAX #31 XID_Start 与 XID_Continue 规范）：首字符必须是字母（含中文等 Unicode 字母）或下划线 `_`，后续字符可包含字母、数字或下划线，且**大小写敏感**。在工程实践中，标识符应严格遵循 PEP 8 的 ASCII 命名惯例：

- **模块 / 包 / 函数 / 方法 / 普通变量**：`snake_case`（全小写加下划线，如 `user_count`）
- **类名 / 异常名**：`PascalCase`（大驼峰，如 `HttpClientError`）
- **模块级常量**：`UPPER_SNAKE_CASE`（全大写加下划线，如 `MAX_RETRY_LIMIT`）
- **单前导下划线 `_internal`**：约定为内部实现细节，`from module import *` 不会导入
- **双前导下划线 `__private`**：触发**名称改写（Name Mangling）**，在类 `Foo` 内部自动重写为 `_Foo__private`，防止子类意外覆盖同名属性
- **双前导+双后置下划线 `__dunder__`**：Python 数据模型保留的魔术方法或系统属性（如 `__init__`、`__name__`），业务代码严禁自行发明新的 dunder 名称

Python 3.12–3.14 共有 **35 个硬保留关键字（Hard Keywords）** 和 **4 个软关键字（Soft Keywords）**：

| 类别 | 数量 | 包含关键字 | 语法约束 |
| :--- | :--- | :--- | :--- |
| **硬关键字** (`keyword.kwlist`) | 35 | `False`, `None`, `True`, `and`, `as`, `assert`, `async`, `await`, `break`, `class`, `continue`, `def`, `del`, `elif`, `else`, `except`, `finally`, `for`, `from`, `global`, `if`, `import`, `in`, `is`, `lambda`, `nonlocal`, `not`, `or`, `pass`, `raise`, `return`, `try`, `while`, `with`, `yield` | 任何上下文中**均不可**用作普通变量名、函数名或属性名 |
| **软关键字** (`keyword.softkwlist`) | 4 | `match`, `case`, `_` (Python 3.10+ 模式匹配)；`type` (Python 3.12+ 类型别名语句 `type Point = tuple[float, float]`) | 仅在特定语法结构中充当关键字；在其他位置仍可作为合法标识符（以维持向后兼容） |

```python
import keyword

assert len(keyword.kwlist) == 35
assert keyword.iskeyword("async") is True
assert keyword.issoftkeyword("match") is True
assert keyword.issoftkeyword("type") is True

# 软关键字在非特定语法下仍可作为普通变量名或调用内置类 type()
match = "regex_match_result"
assert type(match) is str
```

### 缩进代码块、物理行与逻辑行（括号隐式续行与反斜杠显式续行）

Python 不使用 `{}` 划分作用域，而是通过词法分析器生成的 `INDENT`（缩进增加）与 `DEDENT`（缩进回退）词法标记（Token）来界定代码块。PEP 8 强制规定：**每一级缩进固定使用 4 个空格**，严禁混用 Tab 与空格（Python 3 发现混用会直接抛出 `TabError: inconsistent use of tabs and spaces in indentation`）。

解释器将源码划分为两层行概念：

1. **物理行（Physical Line）**：源码文件中以换行符（`\n` 或 `\r\n`）结尾的一行实际文本。
2. **逻辑行（Logical Line）**：词法分析器合并续行后生成一个 `NEWLINE` Token 的完整语句单元。

将多个物理行合并为一个逻辑行有两种方式：

- **括号隐式续行（推荐）**：在圆括号 `()`、方括号 `[]` 或花括号 `{}` 内部，物理换行会被自动忽略，且括号内可以直接插入 `#` 注释。
- **反斜杠 `\` 显式续行（不推荐）**：在物理行末尾加 `\`。它非常脆弱——如果 `\` 后面意外多了一个空格或跟了 `#` 注释，都会直接引发 `SyntaxError`。

```python
# 推荐：利用圆括号隐式续行，支持在行末附加注释
is_eligible = (
    18 <= 25 < 60        # 年龄处于有效区间
    and True             # 账户已激活
    and not False        # 未被风控冻结
)
assert is_eligible is True
```

### 表达式（Expression）与语句（Statement）的本质边界

在 Python 语法树（AST）中，**表达式（Expression）**与**语句（Statement）**有着严格的边界：

- **表达式（Expression）**是“**求值（Evaluate）并产出一个对象引用**”的语法结构（如 `1 + 2`、`x > 0`、函数调用 `len(s)`、推导式 `[i for i in range(3)]`、条件表达式 `a if cond else b`、赋值表达式 `y := f()`）。表达式可以嵌套在其他表达式内部，也可以作为参数传给函数。
- **语句（Statement）**是“**执行（Execute）某种动作或控制流转移、本身不产出值**”的语法单元（如赋值语句 `x = 1`、`if` / `for` / `while`、`def`、`class`、`import`、`return`、`del`）。语句不能出现在需要表达式的位置（例如 `if (x = 1):` 会直接报 `SyntaxError`，若需在表达式中赋值必须使用 `:=`）。

> 补充：当一个表达式单独占据一个逻辑行时（如单独一行调用 `list.append(1)` 或文档字符串），它在 AST 中被包装为**表达式语句（Expression Statement，`ast.Expr`）**——求值后其返回值在非交互模式下被直接丢弃。

```python
import ast

# "x + 1" 是表达式，可以用 mode="eval" 编译求值
expr_tree = ast.parse("x + 1", mode="eval")
assert isinstance(expr_tree.body, ast.BinOp)

# "x = 1" 是赋值语句，不能用 mode="eval" 解析，只能用 mode="exec"
stmt_tree = ast.parse("x = 1", mode="exec")
assert isinstance(stmt_tree.body[0], ast.Assign)
```

---

## 名字绑定与引用语义

### 变量不是内存盒子：名字（Name）与对象（Object）的绑定关系

在 C / C++ 等静态编译语言中，声明变量 `int a = 10; int b = a;` 意味着在栈上开辟两块独立的内存区域（“内存盒子”），并将 `10` 复制到 `b` 的盒子里。

**Python 中没有“装值的内存盒子”**。Python 的命名空间（Namespace）本质上是一个从**名字（Name，字符串标签）**到**对象引用（PyObject 指针）**的字典映射：

- 对象永远分配在堆内存（Heap）中；
- 赋值语句 `a = 10` 永远**先对等号右侧求值**（在堆中创建或复用整数对象 `10`），**再将左侧名字 `a` 绑定（贴标签）到该对象上**；
- `b = a` **不会拷贝任何对象数据**，仅仅是给同一个对象多贴了一个名为 `b` 的标签（即**别名，Aliasing**）。

```python
# 列表对象在堆中只创建了一次，a 和 b 是贴在同一个列表对象上的两个标签
a = [10, 20]
b = a

assert a is b
b.append(30)
assert a == [10, 20, 30]  # 通过标签 b 修改对象，标签 a 观察到的是同一个对象
```

### 对象三要素详解：`id()`、`type()` 与对象值

CPython 中每个对象在底层都包含 `PyObject` 头部结构（引用计数 `ob_refcnt` 与类型指针 `ob_type`）。任何 Python 对象自创建起都具备以下三个核心要素：

| 要素 | 获取方式 | 生命周期内的可变性 | 核心语义 |
| :--- | :--- | :--- | :--- |
| **身份标识（Identity）** | `id(obj)` | **绝对不可变** | 对象在生命周期内的唯一整数标识（CPython 中即为对象在内存中的虚拟地址） |
| **类型（Type）** | `type(obj)` | **几乎不可变** | 决定对象支持哪些操作与方法集，指向其所属的类型对象（Class） |
| **值（Value）** | 对象自身与属性访问 | 取决于类型本身 | 值可就地修改的对象称为**可变对象（Mutable）**，值创建后不可更改的称为**不可变对象（Immutable）** |

!!! warning "注意：`id()` 相等的前提是两个对象同时存活"
    Python 文档明确规定：**只有当两个对象的生命周期重叠（同时存在）时，它们的 `id()` 才保证互不相同**。如果一个临时对象被销毁，紧接着创建的新对象极有可能复用刚才释放的同一块内存地址：
    ```python
    # id([]) 创建匿名列表 -> 取完 id 后引用计数归零立即释放 -> 第二个匿名列表往往复用同一块内存
    # 因此永远不要比较已销毁对象的历史 id()！
    x = []
    y = []
    assert id(x) != id(y)  # x 与 y 同时存活，id 必定不同
    ```

### 相等性判定：身份比较（`is`）与值比较（`==`）

初学者极易混淆 `is` 与 `==`，两者在底层机制、性能与重载能力上完全不同：

| 对比维度 | 身份比较 `a is b` / `a is not b` | 值比较 `a == b` / `a != b` |
| :--- | :--- | :--- |
| **判定标准** | 比较 `id(a) == id(b)`，即是否指向**内存中同一个对象** | 比较两个对象的**逻辑内容/值**是否相等 |
| **底层机制** | 直接对比两个 `PyObject*` 内存指针，时间复杂度严格 $O(1)$ | 调用 `a.__eq__(b)` 特殊方法（若返回 `NotImplemented` 则尝试 `b.__eq__(a)`），复杂度可能为 $O(N)$ |
| **能否被自定义类重载** | **不能重载** | **可以重载**（通过定义 `__eq__` 方法） |
| **标准适用场景** | 仅用于单例对象判定（如 `x is None`、`x is not None`、哨兵对象 `x is SENTINEL`） | 所有数值、字符串、容器及业务对象的值相等判定 |

```python
list_a = [1, 2, 3]
list_b = [1, 2, 3]

assert (list_a == list_b) is True   # 内容相同
assert (list_a is list_b) is False  # 内存中是两个独立的 list 实例

# 单例判空必须使用 is None / is not None
result = None
assert result is None
```

### 小整数缓存池与字符串驻留（Interning）引发的 `is` 判等陷阱

既然不同时间创建的两个同值不可变对象理论上是不同实例，为什么在交互式终端里有时 `a = 100; b = 100; a is b` 会返回 `True`，而换成 `1000` 却可能返回 `False`？这是因为 CPython 实现了两项内部内存复用优化：

1. **小整数缓存池（Small Integer Caching）**：CPython 启动时预先在内存中初始化了 **`[-5, 256]`** 闭区间内的所有整数单例对象。任何对该区间内整数的求值都直接返回缓存池中的单例引用。
2. **字符串驻留（String Interning）与编译器常量折叠**：CPython 会自动驻留符合“仅含 ASCII 字母、数字、下划线（形似标识符）”的短字符串，且**同一代码块（如同一个函数、同一个模块或同一行命令）中的相同不可变常量字面量**在编译为字节码时会被合并进同一个常量表槽位（`co_consts`）。

```python
import sys

# 1. 小整数 [-5, 256] 永远命中全局缓存池
x = int("256")
y = int("256")
assert x is y

# 超出 256 的运行期动态构造整数不会命中缓存池
m = int("1000")
n = int("1000")
assert m == n
assert (m is n) is False  # 身份不同！若用 is 比较整数值将产生严重 Bug

# 2. 动态拼接的含特殊字符字符串默认不驻留，但可通过 sys.intern() 强制驻留以加速字典查找
s1 = "".join(["hello", "!", "world"])
s2 = "".join(["hello", "!", "world"])
assert s1 == s2 and (s1 is s2) is False
assert sys.intern(s1) is sys.intern(s2)
```

!!! warning "注意：绝不能依赖缓存池用 `is` 比较数值或字符串"
    小整数缓存范围和字符串驻留策略属于 **CPython 解释器实现细节**，不同版本（甚至同一行 vs 跨函数调用）的行为都可能变化。Python 3.8+ 对 `x is 100` 或 `s is "abc"` 这类字面量身份比较会直接抛出 `SyntaxWarning: "is" with 'int' literal. Did you mean "=="?`。**比较数值、字符串与容器内容永远使用 `==`。**

### `del` 语句的本质：解除名字绑定与对象引用计数变化

**`del x` 并不是“删除或销毁对象”，而是从当前命名空间中删除名字 `x`（或从容器中移除某个元素/属性的引用），并将目标对象的引用计数（Reference Count）减 1。**

只有当一个对象的引用计数归零（或处于循环引用孤岛被分代垃圾回收器 GC 扫描到）时，CPython 才会真正销毁该对象并回收内存。如果该对象还被其他名字或容器引用，执行 `del x` 后对象依然完好无损。

```python
import sys

data = [1, 2, 3]
alias = data  # data 和 alias 指向同一个列表对象

# sys.getrefcount(data) 会包含实参传递时临时增加的 1 次引用，因此此处为 3 (data + alias + getrefcount形参)
assert sys.getrefcount(data) == 3

del data  # 仅解除名字 data 的绑定，列表对象引用计数减 1，但依然存活

assert alias == [1, 2, 3]
assert sys.getrefcount(alias) == 2
```

---

## 可变性（Mutability）与状态演进

### 不可变类型（`int` / `str` / `tuple` / `frozenset`）与重新绑定（Rebinding）

**不可变对象（Immutable Object）**一旦在内存中创建，其内部状态（Value）在整个生命周期内都不能被修改。常见的内置不可变类型包括：`int`、`float`、`bool`、`complex`、`str`、`bytes`、`tuple`、`frozenset`。

当我们对不可变对象执行看似“修改”的操作（如 `x = x + 1` 或 `s = s.upper()`）时，实际发生的是**重新绑定（Rebinding）**：

1. 计算右侧表达式，在内存中**创建一个全新的对象**；
2. 将左侧变量名与旧对象解绑，**重新绑定到新创建的对象上**；
3. 原对象保持不变（也不会影响其他指向原对象的别名变量）。

```python
s1 = "python"
s2 = s1
orig_id = id(s1)

# 重新绑定：创建了新字符串 "python 3.13"，让 s1 指向新对象
s1 = s1 + " 3.13"

assert id(s1) != orig_id
assert s1 == "python 3.13"
assert s2 == "python"  # s2 仍然指向原来的 "python" 对象，毫发无损
```

### 可变类型（`list` / `dict` / `set`）与就地修改（In-place Mutation）

**可变对象（Mutable Object）**允许在不改变自身内存身份（`id()` 保持不变）的前提下，直接新增、删除或替换其内部元素。常见的内置可变类型包括：`list`、`dict`、`set`、`bytearray` 以及绝大多数用户自定义类的实例。

**就地修改（In-place Mutation）**与重新绑定的核心区别在于：**所有持有该可变对象引用的别名（Aliases）都会立即看到修改后的最新状态**。

```python
shared_tags = ["python", "backend"]
other_ref = shared_tags
orig_id = id(shared_tags)

# 就地修改（In-place Mutation）：不产生新 list 对象
shared_tags.append("async")

assert id(shared_tags) == orig_id
assert other_ref == ["python", "backend", "async"]  # 别名同步感知到变化
```

!!! tip "工程实践：就地修改方法通常返回 `None`"
    为了从 API 层面提醒开发者“这是一个就地修改操作，没有创建新对象”，Python 标准库严格遵循**命令-查询分离（Command-Query Separation）**原则：`list.append()`、`list.extend()`、`list.sort()`、`list.reverse()`、`dict.update()`、`set.add()` 等就地修改方法的返回值**统统是 `None`**。切勿写出 `items = items.sort()`，那会把 `items` 变成 `None`。

### 增量赋值（`+=`）在可变与不可变对象上的底层分歧（`__iadd__` vs `__add__`）

增量赋值语句 `a += b` 在语法上看似只是 `a = a + b` 的简写，但在底层字节码中，解释器会优先尝试调用对象的**就地加法特殊方法 `__iadd__`（In-place Add）**，仅当类型未实现 `__iadd__` 时才回退到 `__add__`：

| 目标对象类型 | 底层调用路径 | 对象身份 `id(a)` 是否改变 | 对其他别名引用（如 `alias = a`）的影响 |
| :--- | :--- | :--- | :--- |
| **不可变对象**（如 `int`, `str`, `tuple`） | 未实现 `__iadd__`，回退为 `a = a.__add__(b)` | **改变**（创建新对象并重新绑定） | **无影响**（`alias` 仍指向旧对象） |
| **可变对象**（如 `list`, `bytearray`） | 调用 `a = a.__iadd__(b)`（在 `list` 中等价于 `a.extend(b)` 并返回 `self`） | **不变**（就地扩容修改） | **联动改变**（`alias` 同步看到新增元素） |

```python
# 1. 元组（不可变）：+= 触发重新绑定，新创建元组
t1 = (1, 2)
t2 = t1
t1 += (3, 4)
assert t1 == (1, 2, 3, 4)
assert t2 == (1, 2)  # t2 不受影响

# 2. 列表（可变）：+= 调用 __iadd__ 就地修改（且右侧可以传入任意 Iterable，不仅限于 list）
l1 = [1, 2]
l2 = l1
l1 += (3, 4)  # 等价于 l1.extend((3, 4))
assert l1 == [1, 2, 3, 4]
assert l1 is l2  # l2 也被修改了！
```

### 不可变容器包含可变元素时的引用边界（如元组内嵌列表）

“元组（`tuple`）是不可变的”这句话的精确定义是：**元组内部存储的“元素对象引用槽位（即各个元素指向的 `id`）”不可增删或更换**。它并不保证槽位所指向的目标对象自身内部状态不可变！

如果一个元组内部包含列表、字典等可变对象，我们既可以就地修改该列表，又会造成该元组**无法被哈希（Unhashable）**：

```python
# 元组持有一个 int 引用和一个 list 引用
record = ("user_01", ["read", "write"])
elem1_id_before = id(record[1])

# 1. 直接通过方法就地修改元组内的列表：完全合法！因为 record[1] 保存的内存地址没有变
record[1].append("admin")
assert record == ("user_01", ["read", "write", "admin"])
assert id(record[1]) == elem1_id_before

# 2. 经典谜题：对元组内的列表执行 record[1] += ["owner"] 会发生什么？
# 分两步执行：
# 第一步：调用 list.__iadd__，列表在内存中已经成功就地加上了 "owner"；
# 第二步：尝试将 __iadd__ 返回的列表引用写回 tuple[1]，触发 tuple.__setitem__，抛出 TypeError！
try:
    record[1] += ["owner"]
except TypeError:
    pass

# 尽管抛出了 TypeError，但列表在第一步中已经被就地修改成功了！
assert record[1] == ["read", "write", "admin", "owner"]
```

!!! note "底层原理：为什么含列表的元组不能作为 `dict` 的键？"
    `tuple` 是否可哈希（`hash(t)`）采用递归判定：**只有当元组的所有元素都可哈希时，该元组才可哈希**。对上述 `record` 调用 `hash(record)` 会抛出 `TypeError: unhashable type: 'list'`。

---

## 赋值、浅拷贝与深拷贝

### 引用赋值（别名共享）与多维列表 `*` 初始化的“幽灵联动”陷阱

对序列使用乘法运算符 `seq * n` 时，Python **不会克隆序列内部的元素对象，而是将原有的元素引用重复复制 $n$ 份**。

当序列元素是不可变整数（如 `[0] * 3`）时，因为对 `arr[0] = 9` 是将槽位 0 **重新绑定**到新整数 `9`，所以不会影响槽位 1 和 2。但当我们使用 `[[0] * 3] * 3` 初始化二维矩阵时，外层列表的 3 个槽位指向的是**内存中同一个内层列表对象**，修改其中任意一行都会引发所有行同步改变的“幽灵联动”！

```python
# 错误示范：外层列表的 3 个元素是指向同一个内层 list 的 3 个重复引用
bad_grid = [[0] * 3] * 3
assert bad_grid[0] is bad_grid[1] is bad_grid[2]

bad_grid[0][1] = 99  # 就地修改内层列表，所有行全部跟着变！
assert bad_grid == [
    [0, 99, 0],
    [0, 99, 0],
    [0, 99, 0],
]

# 正确做法：使用列表推导式，每次迭代都重新求值 [0] * 3，创建 3 个独立的内层列表
good_grid = [[0] * 3 for _ in range(3)]
assert (good_grid[0] is good_grid[1]) is False

good_grid[0][1] = 99
assert good_grid == [
    [0, 99, 0],
    [0, 0, 0],
    [0, 0, 0],
]
```

### 浅拷贝（Shallow Copy）的多种实现方式与不可变对象短路优化

**浅拷贝（Shallow Copy）**只复制**最外层容器本身**（分配一个新的外层容器对象），而外层容器内部的元素槽位仍然**直接复制原容器中各个子对象的引用**。

常见的浅拷贝方式与不可变对象的短路行为如下：

| 拷贝方式 | 示例 | 适用类型与底层行为 |
| :--- | :--- | :--- |
| 容器 `.copy()` 方法 | `lst.copy()`, `d.copy()`, `s.copy()` | **推荐首选**：语义最清晰，适用于 `list`、`dict`、`set` |
| 类型构造器 | `list(lst)`, `dict(d)`, `set(s)` | 适用于任意可迭代对象转换兼浅拷贝 |
| 全切片语法 | `lst[:]` | 仅适用于序列（对可变 `list` 创建新列表；对不可变 `tuple` / `str` 直接返回原对象） |
| 通用浅拷贝函数 | `copy.copy(obj)` | 通用接口，支持任意实现了拷贝协议的自定义对象 |

```python
import copy

# 1. 嵌套可变容器的浅拷贝：外层独立，内层共享
orig = [[1, 2], [3, 4]]
shallow = orig.copy()

assert shallow == orig and (shallow is orig) is False  # 外层是新列表
assert shallow[0] is orig[0]                           # 内层子列表仍是同一个对象！

shallow.append([5, 6])   # 修改外层容器：不影响 orig
shallow[0].append(99)    # 就地修改内层子列表：orig[0] 同步被污染！
assert orig == [[1, 2, 99], [3, 4]]

# 2. 不可变对象的浅拷贝短路优化（No-op Optimization）
# 对 tuple / str / int / frozenset 进行 copy.copy() 或 tuple(t) / t[:]，CPython 直接返回原对象自身以节省内存
t = (1, 2, 3)
assert copy.copy(t) is t
assert tuple(t) is t
assert t[:] is t
```

### 深拷贝（`copy.deepcopy`）的对象图递归克隆与 `memo` 备忘录机制

当容器存在多层嵌套可变对象，且需要彻底隔离所有层级的修改时，必须使用 `copy.deepcopy(obj)`。深拷贝会递归遍历整个对象引用图（Object Graph），为每一层的可变容器与对象都创建全新的克隆副本。

很多人会问：**如果对象之间存在循环引用（例如节点 A 引用节点 B，或者列表自己包含自己 `a.append(a)`），`copy.deepcopy` 会不会陷入无限递归导致 `RecursionError`？**

答案是**不会**。`copy.deepcopy(x, memo=None)` 内部维护了一个名为 **`memo` 的备忘录字典**（映射关系为 `{id(原对象): 新克隆对象}`）：

1. 每当准备克隆一个对象 `obj` 时，先检查 `id(obj)` 是否已在 `memo` 字典中；
2. 若已存在，直接返回 `memo[id(obj)]` 中已创建的新对象引用，**既保持了原有的拓扑共享结构，又彻底打破了循环引用无限递归**；
3. 此外，若遇到完全由不可变原子对象组成的元组（如 `(1, "a")`），`deepcopy` 也会智能短路直接返回原元组本身。

```python
import copy

# 1. 彻底隔离嵌套可变结构
orig = [[1, 2], [3, 4]]
deep = copy.deepcopy(orig)
deep[0].append(99)
assert orig == [[1, 2], [3, 4]]  # 原对象完全不受影响

# 2. 自引用（循环引用）对象的深拷贝：依靠 memo 字典完美还原拓扑结构
cycle_list = [1, 2]
cycle_list.append(cycle_list)  # cycle_list[2] 指向 cycle_list 自身

cloned_cycle = copy.deepcopy(cycle_list)
assert cloned_cycle is not cycle_list
assert cloned_cycle[2] is cloned_cycle  # 克隆体内部同样保持“指向克隆体自身”的循环拓扑

# 3. 递归不可变检查优化：全不可变元素的 tuple 在 deepcopy 时也直接复用原对象
pure_tuple = (1, "hello", (2, 3))
assert copy.deepcopy(pure_tuple) is pure_tuple
```

### 自定义拷贝协议：`__copy__` 与 `__deepcopy__`

在编写自定义类时（例如一个对象既包含需要隔离的业务状态列表，又持有一个不可复制或应当全局复用的数据库连接池 / 线程锁），可以通过实现 `__copy__(self)` 与 `__deepcopy__(self, memo)` 魔术方法来定制拷贝行为：

```python
import copy


class TaskContext:
    def __init__(self, db_conn: object, history: list[str]) -> None:
        self.db_conn = db_conn      # 数据库连接：无论浅拷贝还是深拷贝都应共享同一个连接实例
        self.history = history      # 历史记录列表：深拷贝时必须独立克隆

    def __copy__(self) -> "TaskContext":
        # 浅拷贝：创建新外壳，内部属性引用原样传入
        return type(self)(self.db_conn, self.history)

    def __deepcopy__(self, memo: dict[int, object]) -> "TaskContext":
        # 深拷贝：先创建新实例并立刻登记到 memo，防止属性回指自身造成死循环
        new_obj = type(self).__new__(type(self))
        memo[id(self)] = new_obj
        new_obj.db_conn = self.db_conn  # 显式共享连接对象
        new_obj.history = copy.deepcopy(self.history, memo)  # 递归深拷贝列表，务必传递 memo
        return new_obj


shared_db = object()
ctx1 = TaskContext(shared_db, ["init"])
ctx2 = copy.deepcopy(ctx1)

ctx2.history.append("step_1")
assert ctx1.db_conn is ctx2.db_conn      # 连接实例保持共享
assert ctx1.history == ["init"]          # history 列表彻底隔离
assert ctx2.history == ["init", "step_1"]
```

---

## 运算符体系与海象运算符 `:=`

### 算术运算符：真除法（`/`）、负数地板除（`//`）与取模（`%`）恒等式

Python 3 的除法与取模运算有两处与 C / Java 截然不同的设计，处理负数时尤为关键：

1. **真除法 `/` vs 地板除 `//`**：
   - `/`（True Division）**永远返回 `float`**，即使整除也是如此（`4 / 2 == 2.0`）。
   - `//`（Floor Division）执行**向下取整（向负无穷 $-\infty$ 方向取整）**，而不是 C / Java 的向零截断（Truncate toward zero）。若操作数均为 `int` 则返回 `int`；若任一操作数为 `float` 则返回向下取整后的 `float`（如 `7.0 // 2 == 3.0`）。
2. **取模 `%` 与 `divmod()` 恒等式**：
   在 Python 中，整数除法与取模永远严格满足欧几里得恒等式：
   $$(a \mathbin{//} b) \times b + (a \bmod b) == a$$
   同时，**余数 `a % b` 的符号永远与除数 `b` 的符号一致（或为 0）**（而 C / Java 中余数符号与被除数 `a` 一致）。内置函数 `divmod(a, b)` 可在一次底层运算中同时返回 `(a // b, a % b)` 元组。

| 表达式 | Python 结果（向 $-\infty$ 地板除，余数同除数符号） | C / Java 结果（向 $0$ 截断，余数同被除数符号） | 验证 `(a // b) * b + (a % b)` |
| :--- | :--- | :--- | :--- |
| `7 // 3`, `7 % 3` | `2`, `1` | `2`, `1` | `2 * 3 + 1 == 7` |
| `-7 // 3`, `-7 % 3` | **`-3`**, **`2`** | `-2`, `-1` | `(-3) * 3 + 2 == -7` |
| `7 // -3`, `7 % -3` | **`-3`**, **`-2`** | `-2`, `1` | `(-3) * (-3) + (-2) == 7` |
| `-7 // -3`, `-7 % -3` | `2`, `-1` | `2`, `-1` | `2 * (-3) + (-1) == -7` |

```python
assert 4 / 2 == 2.0 and isinstance(4 / 2, float)
assert -7 // 3 == -3
assert -7 % 3 == 2
assert divmod(-7, 3) == (-3, 2)
```

!!! tip "工程实践：利用负数取模优雅实现环形数组索引"
    正因为 Python 中 `a % N`（当 $N > 0$ 时）的结果**永远落在 $[0, N-1]$ 区间内**，哪怕 `a` 是负数也不会产生负余数，我们在实现环形缓冲区（Ring Buffer）或时钟回拨计算时可以直接写 `(idx - 1) % N`，无需像 C 语言那样写 `(idx - 1 + N) % N`。

### 位运算符、成员运算符（`in` / `not in`）与链式比较展开机制

- **位运算符**：包括按位与 `&`、按位或 `|`、按位异或 `^`、按位取反 `~`、左移 `<<` 与右移 `>>`。由于 Python 的 `int` 是任意精度整数（不存在固定的 32 位或 64 位符号位溢出），按位取反 `~x` 在数学上严格遵循补码恒等式 **`~x == -(x + 1)`**。
- **成员运算符 `in` / `not in`**：底层优先调用容器的 `__contains__` 方法。在查找时间复杂度上，**`set` 与 `dict` 基于哈希表，平均复杂度为 $O(1)$**；而 **`list`、`tuple`、`str` 基于线性扫描，平均复杂度为 $O(N)$**。高频成员检测务必先将列表转为 `set`。
- **链式比较（Chained Comparisons）**：Python 支持任意比较运算符（`<`, `<=`, `>`, `>=`, `==`, `!=`, `is`, `is not`, `in`, `not in`）串联，如 `a < b <= c`。其核心机制是：
  1. 等价展开为 `a < b and b <= c`（具备 `and` 短路特性：若 `a < b` 为假，则 `c` 根本不会求值）；
  2. **中间表达式 `b` 保证只会被求值一次**（即使 `b` 是一个有副作用或高开销的函数调用 `f()`）。

```python
assert ~5 == -6  # -(5 + 1)

calls = 0
def compute() -> int:
    global calls
    calls += 1
    return 15

# 链式比较中，中间的 compute() 仅被调用 1 次！
assert (10 < compute() <= 20) is True
assert calls == 1
```

### 真值测试协议（Truth Value Testing）与 `and` / `or` 短路返回原操作数机制

任何 Python 对象都可以直接用于 `if` / `while` 条件或布尔逻辑运算，无需显式转换。解释器判定一个对象 `x` 的真假（即 `bool(x)`）遵循**真值测试协议**：

1. 优先调用 `x.__bool__()`，必须返回 `True` 或 `False`；
2. 若未定义 `__bool__()`，则尝试调用 `x.__len__()`，返回 `0` 视为 `False`，非零整数视为 `True`；
3. 若两者均未定义，则所有用户自定义对象实例**默认均为 `True`**。

因此，内置类型中只有以下值在布尔上下文中被视为 **Falsy（假值）**，其余皆为 **Truthy（真值）**：

- 常量：`None`、`False`
- 任何数值类型的零：`0`、`0.0`、`0j`、`Decimal(0)`、`Fraction(0, 1)`
- 任何空序列或空集合：`""`、`b""`、`()`、`[]`、`{}`、`set()`、`frozenset()`、`range(0)`

**`and` 与 `or` 的核心机制**：不同于 `not x` 永远返回布尔值 `True` 或 `False`，**`x and y` 与 `x or y` 返回的是决定最终真假结果的那个“原始操作数对象本身”**，而非强转为 `bool`：

| 逻辑表达式 | 等价求值逻辑 | 短路规则 | 示例与返回值 |
| :--- | :--- | :--- | :--- |
| `x and y` | `x if not x else y` | 若 `x` 为 Falsy，立即短路并返回 `x`；否则求值并返回 `y` | `[] and "hello"` $\rightarrow$ `[]`<br>`"hi" and 123` $\rightarrow$ `123` |
| `x or y` | `x if x else y` | 若 `x` 为 Truthy，立即短路并返回 `x`；否则求值并返回 `y` | `"admin" or "guest"` $\rightarrow$ `"admin"`<br>`"" or "guest"` $\rightarrow$ `"guest"` |

```python
# and / or 返回原操作数对象本身
assert ([] and "unreachable") == []
assert ("valid" and [1, 2]) == [1, 2]
assert ("" or "default_name") == "default_name"
```

!!! warning "注意：用 `x or default` 提供默认值时的零值陷阱"
    如果变量 `count = 0` 是一个合法的业务输入值（例如超时秒数为 `0` 或重试次数为 `0`），由于 `0` 是 Falsy，写成 `timeout = user_timeout or 30` 会把用户传入的 `0` 错误地覆盖为 `30`！当仅需在 `None` 时回退默认值，应显式写成：
    ```python
    user_timeout = 0
    timeout = 30 if user_timeout is None else user_timeout
    assert timeout == 0
    ```

### 海象运算符（`:=` 赋值表达式）：语法规则、常见适用场景与作用域限制

Python 3.8 引入的**海象运算符 `NAME := expr`（Assignment Expression，PEP 572）**是一个**表达式**：它在将右侧计算结果绑定给变量 `NAME` 的同时，**将这个值作为整个表达式的求值结果返回**。

**四大黄金适用场景**：

1. **`if` / `elif` 条件分支中避免重复调用**：先提取正则匹配结果或字典查找结果，既用于条件判断，又直接在分支体内复用；
2. **`while` 循环读取流/分块数据**：将 `chunk = file.read(8192)` 与退出判断融为一行 `while chunk := file.read(8192):`；
3. **推导式中过滤与转换复用同一个高开销函数返回值**：`[y for x in data if (y := expensive(x)) is not None]`；
4. **在推导式中捕获满足条件的首个见证值（Witness）**。

**语法与作用域限制**：

- **顶层必须加括号**：海象运算符不能直接作为单独的顶层表达式语句而省略括号（`a := 1` 报 `SyntaxError`，单独赋值应使用 `a = 1`）；此外 `:=` 的优先级低于所有比较运算符，`if (n := len(items)) > 10:` 中的括号不可或缺（若写成 `if n := len(items) > 10:`，右侧会先计算 `len(items) > 10` 把布尔值赋给 `n`！）。
- **推导式作用域穿透**：在列表/字典/集合推导式或生成器表达式中，普通的循环变量（`for x in ...`）严格局限于推导式内部局部作用域；而**使用 `:=` 绑定的变量会自动穿透绑定到外层包含它的函数/模块作用域**（因此在 `class` 类体顶层的推导式中使用 `:=` 会报错）。

```python
import re

# 1. if 分支中绑定并复用正则匹配对象
log_line = "ERROR [2026-11-25] Code=503 Service Unavailable"
if (m := re.search(r"Code=(\d+)", log_line)) is not None:
    status_code = int(m.group(1))
assert status_code == 503

# 2. 推导式中复用计算结果，且 := 绑定的变量会泄漏到外层作用域
raw_scores = [" 85 ", "40", " 92 ", "58"]
passed = [val for s in raw_scores if (val := int(s.strip())) >= 60]
assert passed == [85, 92]
assert val == 58  # val 穿透了推导式局部作用域，保留了最后一次求值的结果
```

### 运算符优先级与结合性汇总（如幂运算 `**` 的右结合与一元负号优先级）

Python 绝大多数二元运算符都是**左结合（Left-associative）**的，唯独**幂运算符 `**` 是右结合（Right-associative）**的，且 **`**` 的优先级高于左侧的一元正负号（`+x`, `-x`），但低于右侧的一元正负号**！这是笔试与工程计算中最常见的优先级陷阱。

下面按**优先级从高到低**汇总核心运算符：

| 优先级（高 $\rightarrow$ 低） | 运算符类别 | 运算符符号 | 结合性 / 核心注意事项 |
| :--- | :--- | :--- | :--- |
| 1（最高） | 括号、容器字面量 | `(...)`, `[...]`, `{...}` | 显式改变求值顺序 |
| 2 | 属性访问、下标切片、函数调用 | `x.attr`, `x[i]`, `x(args)` | 左结合 |
| 3 | `await` 表达式 | `await x` | - |
| 4 | **幂运算** | `**` | **右结合**（`2 ** 3 ** 2 == 2 ** (3 ** 2) == 512`）；**优先级高于左侧一元负号**（`-3 ** 2 == -(3 ** 2) == -9`） |
| 5 | 一元正号、负号、按位取反 | `+x`, `-x`, `~x` | 右侧紧邻 `**` 时优先结合（`2 ** -1 == 2 ** (-1) == 0.5`） |
| 6 | 乘、除、地板除、取模、矩阵乘 | `*`, `/`, `//`, `%`, `@` | 左结合 |
| 7 | 加、减 | `+`, `-` | 左结合 |
| 8 | 位移运算 | `<<`, `>>` | 左结合（优先级低于加减：`1 << 2 + 1 == 1 << 3 == 8`） |
| 9–11 | 按位与 $\rightarrow$ 按位异或 $\rightarrow$ 按位或 | `&` $\rightarrow$ `^` $\rightarrow$ `\|` | 依次递减，左结合 |
| 12 | 比较、成员与身份测试 | `<`, `<=`, `>`, `>=`, `==`, `!=`, `is`, `is not`, `in`, `not in` | 全部具有**相同优先级**，连续出现时触发**链式比较** |
| 13–15 | 布尔逻辑非 $\rightarrow$ 与 $\rightarrow$ 或 | `not x` $\rightarrow$ `and` $\rightarrow$ `or` | `not` 最高，`and` 次之，`or` 最低（`True or False and False == True`） |
| 16 | 条件表达式（三元运算符） | `x if cond else y` | 右结合 |
| 17 | `lambda` 表达式 | `lambda args: expr` | - |
| 18（最低） | 海象运算符（赋值表达式） | `:=` | 表达式中优先级最低，与其他运算符混用时几乎总是需要加 `()` |

```python
# 1. 幂运算 ** 的右结合性
assert 2 ** 3 ** 2 == 2 ** (3 ** 2) == 512

# 2. 幂运算 ** 的优先级高于左侧的一元负号 -
assert -3 ** 2 == -(3 ** 2) == -9
assert (-3) ** 2 == 9
assert 2 ** -1 == 0.5

# 3. 逻辑运算符优先级：not > and > or
assert (True or False and False) is True  # 等价于 True or (False and False)
```

---

## 练习与实战

### 练习 1：排查配置合并中的“可变引用共享”与 `+=` 陷阱

阅读下方管理服务环境配置的代码片段。我们在 `BASE_CONFIG` 的基础上构造了 `dev_config` 和 `prod_config`，并分别修改了它们的超时时间、环境变量字典和白名单列表。请分析执行完这段代码后：
1. `BASE_CONFIG["retries"]`、`BASE_CONFIG["env"]`、`BASE_CONFIG["allow_hosts"]`、`BASE_CONFIG["middlewares"]` 的值分别变成了什么？为什么？
2. 如何修复代码，使得 `dev_config` 和 `prod_config` 的任何修改都彻底不影响 `BASE_CONFIG` 及彼此？

```python
BASE_CONFIG = {
    "retries": 3,
    "env": {"LOG_LEVEL": "INFO"},
    "allow_hosts": ["127.0.0.1"],
    "middlewares": ("auth", "cors"),
}

dev_config = BASE_CONFIG.copy()
prod_config = BASE_CONFIG.copy()

dev_config["retries"] += 2
dev_config["env"]["LOG_LEVEL"] = "DEBUG"
dev_config["allow_hosts"] += ["localhost"]
prod_config["middlewares"] += ("rate_limit",)
```

??? success "点击查看答案与解析"
    **1. 执行后的 `BASE_CONFIG` 状态分析：**

    - `BASE_CONFIG["retries"]` 仍为 **`3`**：`int` 是不可变类型，`dev_config["retries"] += 2` 触发了 `__add__` 并创建了新整数 `5`，仅将 `dev_config` 字典中的 `"retries"` 键**重新绑定**到 `5`，不影响 `BASE_CONFIG`。
    - `BASE_CONFIG["env"]` 变成了 **`{"LOG_LEVEL": "DEBUG"}`**：`BASE_CONFIG.copy()` 是**浅拷贝（Shallow Copy）**，只复制了顶层字典外壳，嵌套的 `"env"` 字典在三个配置中指向内存中同一个 `dict` 对象，修改 `dev_config["env"]["LOG_LEVEL"]` 属于就地修改。
    - `BASE_CONFIG["allow_hosts"]` 变成了 **`["127.0.0.1", "localhost"]`**：`list` 是可变类型，对其执行 `+=` 会调用 `list.__iadd__`（等价于 `.extend()`）**就地修改**原列表对象，然后再把原列表引用写回 `dev_config["allow_hosts"]`。由于浅拷贝共享了该列表引用，`BASE_CONFIG` 和 `prod_config` 的 `"allow_hosts"` 全部被污染！
    - `BASE_CONFIG["middlewares"]` 仍为 **`("auth", "cors")`**：`tuple` 是不可变类型，对其执行 `+=` 会调用 `tuple.__add__` 创建一个新元组 `("auth", "cors", "rate_limit")` 并重新绑定到 `prod_config["middlewares"]`，原元组不受影响。

    **2. 验证与利用 `copy.deepcopy` 修复的代码：**

    ```python
    import copy

    BASE_CONFIG = {
        "retries": 3,
        "env": {"LOG_LEVEL": "INFO"},
        "allow_hosts": ["127.0.0.1"],
        "middlewares": ("auth", "cors"),
    }

    # 使用 copy.deepcopy 递归克隆整个嵌套对象图
    dev_config = copy.deepcopy(BASE_CONFIG)
    prod_config = copy.deepcopy(BASE_CONFIG)

    dev_config["retries"] += 2
    dev_config["env"]["LOG_LEVEL"] = "DEBUG"
    dev_config["allow_hosts"] += ["localhost"]
    prod_config["middlewares"] += ("rate_limit",)

    # 验证 BASE_CONFIG 完全未被污染
    assert BASE_CONFIG == {
        "retries": 3,
        "env": {"LOG_LEVEL": "INFO"},
        "allow_hosts": ["127.0.0.1"],
        "middlewares": ("auth", "cors"),
    }
    assert dev_config["allow_hosts"] == ["127.0.0.1", "localhost"]
    assert prod_config["allow_hosts"] == ["127.0.0.1"]
    ```

### 练习 2：利用海象运算符 `:=` 与真值测试规范重构参数清洗函数

下面的 `clean_and_scale` 函数存在两处典型的代码异味与一处隐蔽的真值测试 Bug：
1. **Bug**：当调用方传入合法的缩放系数 `scale=0.0` 时，`factor = scale or 1.0` 会因为 `0.0` 是 Falsy 而错误地将 `factor` 变成 `1.0`。
2. **代码异味**：列表推导式中对每个元素调用了两次 `parse_metric(raw)`，不仅浪费 CPU，还使代码冗长。

请修复上述 Bug，并使用海象运算符 `:=` 重构推导式，使 `parse_metric(raw)` 对每个元素只调用一次。

```python
def parse_metric(raw: str) -> float | None:
    stripped = raw.strip()
    if not stripped or stripped.startswith("#"):
        return None
    return float(stripped)


def clean_and_scale(raw_lines: list[str], scale: float | None = None) -> list[float]:
    # 存在 Bug 与重复计算的实现：
    factor = scale or 1.0
    return [parse_metric(line) * factor for line in raw_lines if parse_metric(line) is not None]
```

??? success "点击查看答案与解析"
    **问题剖析：**
    1. `0.0`、`0`、`""`、`[]` 在真值测试中均为 `False`。当默认参数定义为 `None`、而业务合法值可能包含 `0.0` 时，**绝不能用 `scale or 1.0`**，必须显式使用 `is not None`（或 `is None`）判断。
    2. 在推导式的 `if` 过滤子句中使用 `(val := parse_metric(line)) is not None`，即可在一次调用中同时完成 `None` 过滤并将返回值绑定到 `val`，供左侧表达式 `val * factor` 直接复用。

    **重构后的标准实现：**

    ```python
    def parse_metric(raw: str) -> float | None:
        stripped = raw.strip()
        if not stripped or stripped.startswith("#"):
            return None
        return float(stripped)


    def clean_and_scale(raw_lines: list[str], scale: float | None = None) -> list[float]:
        # 1. 显式判断 is None，保留 scale=0.0 的合法输入
        factor = 1.0 if scale is None else scale
        # 2. 使用海象运算符 := 避免重复调用 parse_metric
        return [
            val * factor
            for line in raw_lines
            if (val := parse_metric(line)) is not None
        ]


    sample = [" 10.0 ", "# comment", "  ", "25.0"]
    assert clean_and_scale(sample) == [10.0, 25.0]
    assert clean_and_scale(sample, scale=2.0) == [20.0, 50.0]
    # 当 scale=0.0 时，正确输出 [0.0, 0.0]，而不会回退为 1.0
    assert clean_and_scale(sample, scale=0.0) == [0.0, 0.0]
    ```

### 练习 3：利用负数取模恒等式实现环形历史记录游标

在实现终端命令历史或轮播图组件时，我们需要在长度为 $N$（$N > 0$）的列表 `items` 上按给定步长 `step`（可正可负，例如 `step = -1` 表示向后退一格，`step = -15` 表示连续后退 15 格）移动当前索引 `current_idx`。

请编写一个纯函数 `move_circular_cursor(items: list[str], current_idx: int, step: int) -> tuple[int, str]`，返回移动后的新索引以及对应的元素值，要求**不写任何 `if / else` 或 `while` 循环**，仅用一行算术运算完成。

??? success "点击查看答案与解析"
    **解析：**
    得益于 Python 的地板除与取模恒等式 $(a \mathbin{//} N) \times N + (a \bmod N) == a$，当除数 $N = \text{len}(\text{items}) > 0$ 时，无论被除数 `current_idx + step` 是正数还是任意大的负数，`(current_idx + step) % len(items)` 的结果**恒定落在 $[0, N - 1]$ 的合法下标范围内**。

    ```python
    def move_circular_cursor(
        items: list[str], current_idx: int, step: int
    ) -> tuple[int, str]:
        if not items:
            raise ValueError("items 不能为空列表")
        new_idx = (current_idx + step) % len(items)
        return new_idx, items[new_idx]


    commands = ["git status", "git add .", "git commit", "git push"]

    # 从索引 0 向前退 1 步 -> 自动绕回末尾索引 3 (-1 % 4 == 3)
    assert move_circular_cursor(commands, 0, -1) == (3, "git push")

    # 从索引 1 向前退 10 步 -> (-9 % 4 == 3)
    assert move_circular_cursor(commands, 1, -10) == (3, "git push")

    # 从索引 2 向后进 3 步 -> (5 % 4 == 1)
    assert move_circular_cursor(commands, 2, 3) == (1, "git add .")
    ```
