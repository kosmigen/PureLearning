# 控制流与模式匹配

Python 的控制流设计崇尚“**扁平优于嵌套（Flat is better than nested）**”与“**可读性至上（Readability counts）**”。除了经典的 `if` 分支与 `for` / `while` 循环外，Python 还提供了极具表现力的循环 `else` 子句（`no-break` 语义）、**结构化模式匹配（`match - case`，PEP 634）**、推导式与生成器表达式，以及 `enumerate`、`zip(strict=True)`、`any` / `all` 等声明式迭代原语。

---

## 条件分支与卫语句

### `if - elif - else` 分支结构与显式判空规范（`is None` vs `not x`）

Python 使用 `if - elif - else` 构建多路互斥分支（`elif` 是 `else if` 的缩写，可出现任意多次）。解释器自上而下依次对各分支条件做真值测试，一旦命中第一个为 `True` 的分支，执行完其代码块后立即跳出整个 `if` 语句。

在编写条件判断时，**最容易引发线上故障的细节是混淆 `x is None` 与 `not x`**：

| 写法 | 判定为 `True` 的条件范围 | 适用场景与工程规范 |
| :--- | :--- | :--- |
| `if x is None:` | **仅当 `x` 是单例 `None` 时**为真 | **当 `0`、`0.0`、`""`、`[]`、`False` 是合法的业务输入值**，而 `None` 专用于表示“未传参 / 缺失值”时，**必须显式使用 `is None` / `is not None`** |
| `if not x:` | 当 `x` 为**任意 Falsy 值**（`None`, `False`, `0`, `0.0`, `""`, `[]`, `{}`, `set()`）时均为真 | 明确需要**判空容器或空字符串**（如 `if not items:` 代替冗余的 `if len(items) == 0:`） |
| `if x:` | 当 `x` 为非空容器、非零数值等 Truthy 值时为真 | 检查容器是否非空（如 `if users:`）或布尔标志是否为真（严禁写 `if flag == True:`） |

```python
def format_discount(discount: float | None) -> str:
    # 必须用 is None！如果写成 if not discount:，那么免费的 0.0 折扣会被误判为“无折扣”
    if discount is None:
        return "未设置折扣"
    elif discount == 0.0:
        return "免费 (0 折)"
    else:
        return f"折扣率: {discount:.0%}"


assert format_discount(None) == "未设置折扣"
assert format_discount(0.0) == "免费 (0 折)"
assert format_discount(0.85) == "折扣率: 85%"
```

### 卫语句（Guard Clauses）：利用提前返回扁平化深层嵌套代码

当一个函数需要依次校验多个前置条件（如参数非空、用户已登录、权限充足、余额足够）时，如果层层使用 `if ...: if ...: if ...:` 正向嵌套，代码会向右迅速缩进成难以维护的“**箭头型代码（Arrow Anti-pattern）**”。

**卫语句（Guard Clauses / Early Return）**的核心思想是：**将异常分支、边界条件和不合法状态反转，放在函数开头第一时间通过 `return` 或 `raise` 提前退出**，从而让函数主干的核心正常流程（Happy Path）始终保持在最外层的一级缩进上：

```python
# 反面教材：深层嵌套的“箭头代码”，主逻辑被挤压在最深处
def process_payment_nested(user: dict | None, amount: int) -> str:
    if user is not None:
        if user.get("is_active"):
            if amount > 0:
                if user.get("balance", 0) >= amount:
                    return f"扣款成功: {amount}"
                else:
                    return "余额不足"
            else:
                return "金额必须大于 0"
        else:
            return "账户已冻结"
    else:
        return "用户不存在"


# 推荐实践：使用卫语句提前返回，控制流完全扁平化
def process_payment_flat(user: dict | None, amount: int) -> str:
    if user is None:
        return "用户不存在"
    if not user.get("is_active"):
        return "账户已冻结"
    if amount <= 0:
        return "金额必须大于 0"
    if user.get("balance", 0) < amount:
        return "余额不足"

    # 主干正常逻辑（Happy Path）毫无嵌套，一目了然
    return f"扣款成功: {amount}"


alice = {"is_active": True, "balance": 500}
assert process_payment_flat(alice, 200) == process_payment_nested(alice, 200) == "扣款成功: 200"
assert process_payment_flat(alice, 800) == "余额不足"
```

### 条件表达式（三元运算符 `x if condition else y`）

Python 的**条件表达式（Conditional Expression，PEP 308）**语法为：
$$\text{true\_value} \;\; \mathbf{if} \;\; \text{condition} \;\; \mathbf{else} \;\; \text{false\_value}$$

- **惰性短路求值**：先求值中间的 `condition`；若为真，**仅求值并返回 `true_value`**（`false_value` 完全不执行）；反之**仅求值并返回 `false_value`**。
- **语法完整性**：与 `if` 语句不同，条件表达式**必须带有 `else` 分支**（否则当条件为假时表达式将无法产出值，直接报 `SyntaxError`）。
- **结合性与优先级**：条件表达式是**右结合**的，且在所有普通运算符中优先级几乎最低（仅高于 `lambda` 和 `:=`）。当与其他算术运算符混用时，强烈建议用圆括号 `(...)` 明确包裹。

```python
# 1. 基础三元表达式与算术运算组合（注意加括号避免优先级歧义）
is_vip = True
base_fee = 100
total = base_fee + (0 if is_vip else 20)
assert total == 100
```

!!! tip "工程实践：严禁嵌套多层条件表达式"
    虽然 `a if c1 else b if c2 else c` 在语法上合法（右结合等价于 `a if c1 else (b if c2 else c)`），但嵌套三元运算符会严重降低可读性。一旦超过两路分支，应立即改用标准的 `if - elif - else` 语句或字典映射表。

---

## 循环结构与 `for` / `while - else` 机制

### `for` 迭代循环与 `range()` 惰性整数序列

Python 没有 C 语言风格的 `for (int i = 0; i < n; i++)` 三段式计数循环。Python 的 `for item in iterable:` 是纯粹的**通用迭代器驱动循环（For-Each Loop）**：

1. 解释器先在底层对 `iterable` 调用一次 `iter(iterable)`（触发 `__iter__`）获取**迭代器（Iterator）**；
2. 每一轮循环自动对该迭代器调用 `next(it)`（触发 `__next__`），将返回的元素绑定给循环变量 `item`；
3. 当迭代器耗尽并抛出 **`StopIteration` 异常**时，`for` 循环自动捕获该异常并正常结束循环。

当确实需要按固定整数步长循环时，使用内置的 **`range(start, stop[, step])`**：
- **`range` 不是生成器，而是一个惰性不可变序列对象（Lazy Sequence）**：无论范围多大（如 `range(10**18)`），它在内存中**只存储 `start`、`stop`、`step` 三个整数**，占用恒定的 **$O(1)$ 内存空间**！
- **支持 $O(1)$ 数学计算**：`len(r)`、下标访问 `r[i]`、切片 `r[a:b]` 以及整数成员检测 `x in r`（Python 3 对整数在 `range` 中的 `in` 检测直接通过 `(x - start) % step == 0` 数学公式计算，无需遍历，复杂度为 **$O(1)$**！）。

```python
import sys

# 1. range(10**18) 与 range(10) 占用的内存完全相同（均为 48 字节左右）
huge_range = range(0, 10**18, 7)
small_range = range(10)
assert sys.getsizeof(huge_range) == sys.getsizeof(small_range)

# 2. O(1) 随机下标访问、切片与 O(1) 整数包含检测
assert huge_range[100] == 700
assert (7_000_000_000_007 in huge_range) is True
assert list(range(10, 0, -3)) == [10, 7, 4, 1]  # 负步长递减序列
```

### `while` 条件循环、无限轮询与退出边界防护

`while condition:` 循环适用于**事先无法预知迭代次数**、需要围绕某个动态状态持续轮询或收敛的场景（如事件循环、流式 I/O 分块读取、二分查找、指数退避重试）。

工程编写 `while` 循环的三大范式：
1. **结合海象运算符 `:=` 读取流**：`while chunk := stream.read(4096):` 彻底消除了传统“循环外先读一次、循环体末尾再读一次”的重复代码。
2. **显式上限防护（Guard Limit）**：在编写网络重试、树父节点向上回溯或数值收敛的 `while` 循环时，**务必设置最大迭代次数或超时阈值**，防止外部脏数据导致生产进程死循环挂死。

```python
import io

# 使用 while + 海象运算符优雅读取字节流直到 EOF (b"")
buffer = io.BytesIO(b"abcdefghij")
chunks: list[bytes] = []
while chunk := buffer.read(4):
    chunks.append(chunk)

assert chunks == [b"abcd", b"efgh", b"ij"]
```

### 循环控制关键字：`break`、`continue`、`pass` 与跳出多层嵌套循环的工程写法

| 关键字 | 核心行为 | 常见误区与工程说明 |
| :--- | :--- | :--- |
| `break` | **立即终止并跳出最内层**的 `for` 或 `while` 循环（同时跳过该循环附带的 `else` 子句） | `break` 只能跳出一层循环，不能像 Java/Go 那样带标签 `break outer` |
| `continue` | **立即跳过当前这一轮迭代的剩余语句**，直接进入下一轮迭代 | 过度使用 `continue` 可能掩盖循环体结构，简单过滤优先考虑推导式或生成器 |
| `pass` | **空操作占位语句（No-op）**，执行时什么都不做 | 仅用于语法上要求必须有代码块但暂不实现的位置（如定义空异常类 `class MyError(Exception): pass` 或抽象占位；在 Python 3 中也可使用省略号字面量 `...` 占位） |

**如何优雅地一次性跳出多层嵌套循环？**
由于 Python 没有带标签的 `break label`，在遇到多层循环搜索命中需立即退出时，有三种地道工程写法：

1. **抽取为独立函数并使用 `return`（最推荐）**：将多层搜索逻辑封装进一个职责单一的小函数中，一旦找到目标直接 `return result`，瞬间退出所有层级的循环；
2. **使用 `itertools.product(seq_a, seq_b)` 拍平为单层循环**：将两层或三层嵌套的笛卡尔积遍历展平为一个单层 `for x, y in product(a, b):` 循环，直接用一个 `break` 退出；
3. **异常机制**：仅在真正的错误中止路径下使用 `raise`。

```python
from itertools import product

matrix = [
    [1, 4, 7],
    [2, 5, 8],
    [3, 6, 9],
]

# 技巧：使用 itertools.product 将双层坐标循环展平为单层循环，一次 break 即可彻底退出！
target = 5
found_coord: tuple[int, int] | None = None

for r, c in product(range(len(matrix)), range(len(matrix[0]))):
    if matrix[r][c] == target:
        found_coord = (r, c)
        break

assert found_coord == (1, 1)
```

### 独特的循环 `else` 子句（`no-break` 语义）：执行时机与消除搜索标志位（Flag）实践

Python 的 `for` 和 `while` 循环末尾都可以跟一个可选的 **`else:` 子句**。很多有其他语言背景的开发者看到 `for ... else:` 会感到困惑，其实只需记住一句核心心智模型：

> **循环后的 `else` 在语义上应当读作 `nobreak`（即：只有当循环没有因为 `break` 而中途跳出时，才会执行 `else` 块）！**

具体执行规则表：

| 循环结束的原因 | 是否执行循环的 `else` 子句？ |
| :--- | :--- |
| 循环**自然耗尽所有元素**（`for` 迭代完毕，或 `while` 条件变为 `False`，甚至**从一开始就是空列表 `for x in []:` 零次迭代**） | **执行 `else` 块** |
| 循环体内触发了 **`break`** 提前跳出 | **不执行 `else` 块** |
| 循环体内触发了 `return` 或未捕获的异常 `raise` | **不执行 `else` 块**（直接离开当前函数） |

**核心实战价值——彻底消除啰嗦的布尔标志变量 `found = False`**：

```python
def find_first_prime(numbers: list[int]) -> int | None:
    """在列表中寻找第一个质数。内层使用 for-else 判定质数，无需 is_prime = True 标志变量！"""
    for n in numbers:
        if n < 2:
            continue
        for factor in range(2, int(n**0.5) + 1):
            if n % factor == 0:
                break  # 发现因子（合数），break 跳出内层循环，跳过内层 else
        else:
            # 内层循环自然结束（未发生 break），说明没有任何因子能整除 n -> n 必定是质数！
            return n
    return None


assert find_first_prime([4, 6, 8, 9, 13, 15, 17]) == 13
assert find_first_prime([4, 6, 8, 9]) is None
```

---

## 结构化模式匹配（`match - case`）

### `match - case` 核心机制及其与传统 `switch - case` 的本质差异

Python 3.10 引入的 **`match - case`（Structural Pattern Matching，PEP 634 / 635 / 636）**绝不是 C / Java 中那种只能比对整型或枚举值的简单 `switch - case` 跳转表。它是一套源自函数式语言（Haskell / Scala / Rust）的**结构化模式解构与绑定引擎**，具备三大核心特征：

1. **同时完成“形状结构校验 + 类型检查 + 内部字段变量解构绑定”**；
2. **自上而下顺序尝试，首个命中即执行，且天然不存在 C 语言 `switch` 的穿透（No Fall-through）**——每个 `case` 执行完毕后自动结束整个 `match` 块，无需写 `break`；
3. **无匹配时默认静默跳过**（类似于没有 `else` 的 `if`），若需要兜底分支，在末尾编写 `case _:`。

| 对比维度 | 传统 C / Java `switch (x)` | Python `match subject:` |
| :--- | :--- | :--- |
| **匹配目标** | 单一标量值相等比较 | **任意嵌套的数据结构形状**（序列、字典、类实例、字面量） |
| **变量提取能力** | 无（仅跳转分支） | **原生支持模式解构绑定**（直接将元组/字典/对象内部深层属性提取为局部变量） |
| **穿透行为（Fall-through）** | 默认向下一个 `case` 穿透，必须手写 `break` | **绝不穿透**，多值合并分支使用或模式 `case 200 \| 201:` |
| **守卫条件（Guard）** | 不支持 | 支持 `case pattern if condition:` 二次动态过滤 |

### 字面量模式、变量捕获模式、通配符 `_` 与或模式（`|`）

- **字面量模式（Literal Pattern）**：支持数值、字符串、字节串、布尔值以及 `None`（其中对 `True`、`False`、`None` 的匹配在底层自动采用 **`is` 身份比较**，对其他数值与字符串采用 `==` 值比较）。
- **变量捕获模式（Capture Pattern）**：任何一个不带点号 `.` 的裸标识符（如 `case status:`）**都会无条件匹配成功，并将目标值绑定到局部变量 `status` 上**（且该变量在 `match` 语句结束后的外层作用域中依然可用）。
- **通配符模式（Wildcard Pattern `_`）**：`case _:` 无条件匹配任意值，但**不会进行任何变量名绑定**，用作兜底分支（相当于 `default:`）。
- **或模式（OR Pattern `|`）**：使用 `|` 连接多个备选子模式（如 `case 401 | 403 | 404:`）。若或模式中绑定了变量，则 **`|` 两侧的所有子模式必须绑定完全相同的变量名集合**。

```python
def describe_http_status(code: int) -> str:
    match code:
        case 200 | 201 | 204:
            return "Success"
        case 400:
            return "Bad Request"
        case 401 | 403:
            return "Auth Error"
        case other_code:  # 变量捕获模式：将未知状态码绑定到变量 other_code
            return f"Unhandled status: {other_code}"


assert describe_http_status(201) == "Success"
assert describe_http_status(403) == "Auth Error"
assert describe_http_status(502) == "Unhandled status: 502"
```

### 序列模式（含 `*` 剩余项捕获）与映射模式（部分键匹配与 `**rest`）

1. **序列模式（Sequence Pattern，`[p1, p2]` 或 `(p1, p2)`）**：
   - 在 `match - case` 中，写 `[a, b]` 与写 `(a, b)` **在语义上完全等价**——它们都能匹配**任意序列（`collections.abc.Sequence`，如 `list`、`tuple`、`range`）**，但**明确排除了 `str`、`bytes` 和 `bytearray`**（防止把单个字符串误当成字符列表拆开）。
   - **要求长度严格相等**，除非在模式中使用了 `*rest`（捕获剩余元素为 `list`）或 `*_`（忽略任意数量剩余元素）。
2. **映射模式（Mapping Pattern，`{"k1": p1, "k2": p2}`）**：
   - 匹配任意映射对象（如 `dict`），模式中的键必须是字面量或带点号的属性常量。
   - **默认采用“部分键匹配（Partial Matching）”**：只要目标字典中**包含模式里指定的那些键且对应值匹配**即可通过，目标字典中多出来的其他无关键值对会被**自动忽略**！
   - 若需要收集其余未列出的键值对，可在末尾使用 `**rest`（绑定为新 `dict`；注意不能写 `**_`，因为映射模式本来就自动忽略多余键）。

```python
def handle_event(event: object) -> str:
    match event:
        # 1. 序列模式：精确匹配长度为 2 的 ["quit", reason] 或 ("quit", reason)
        case ["quit", reason]:
            return f"Quit: {reason}"

        # 2. 序列模式 + *args 捕获变长参数（至少包含命令名和 1 个目标文件）
        case ["rm", first_file, *other_files]:
            return f"Remove {1 + len(other_files)} files (first={first_file})"

        # 3. 映射模式：部分键匹配（event 字典里多余的 "timestamp" 等键会自动忽略）+ 嵌套解构
        case {"type": "click", "coord": (x, y), **extra}:
            return f"Click at ({x}, {y}), extra_keys={sorted(extra.keys())}"

        case _:
            return "Unknown event"


assert handle_event(("quit", "user_exit")) == "Quit: user_exit"
assert handle_event(["rm", "a.log", "b.log", "c.log"]) == "Remove 3 files (first=a.log)"
assert (
    handle_event({"type": "click", "coord": (10, 20), "timestamp": 170000, "button": "left"})
    == "Click at (10, 20), extra_keys=['button', 'timestamp']"
)
```

### 类模式（Class Patterns）、位置属性解构与 `__match_args__` 协议

**类模式（`ClassName(attr=pattern, ...)`）**首先在底层执行 **`isinstance(subject, ClassName)` 类型检查**，随后继续校验并解构对象的属性：

- **关键字属性模式**：如 `case Point(x=0, y=y_val):`，适用于任何具有 `x` 和 `y` 属性的对象。
- **位置属性模式与 `__match_args__` 协议**：如果希望省略属性名、直接按位置简写为 `case Point(0, y_val):`，目标类必须定义类属性 `__match_args__ = ("x", "y")` 来声明位置参数到属性名的映射顺序。**Python 标准库的 `@dataclass` 和 `typing.NamedTuple` 会按字段声明顺序自动生成 `__match_args__`！**
- **内置类型的类模式**：`int(n)`、`str(s)`、`float(f)`、`dict(d)` 等内置类型自带单位置参数支持（匹配该类型实例并将对象自身绑定给括号内的变量），非常适合在混合字典或序列中进行**运行期类型窄化校验**。

```python
from dataclasses import dataclass


@dataclass
class Point:
    x: int
    y: int
    # @dataclass 已自动生成 __match_args__ = ('x', 'y')


def classify_point(pt: object) -> str:
    match pt:
        case Point(0, 0):               # 位置属性匹配原点
            return "Origin"
        case Point(0, y):               # x 为 0，捕获 y 属性
            return f"On Y-axis (y={y})"
        case Point(x=x, y=y) if x == y: # 关键字属性匹配 + if 守卫条件
            return f"On diagonal (x=y={x})"
        case Point(x, y):
            return f"Point({x}, {y})"
        case _:
            return "Not a Point"


assert Point.__match_args__ == ("x", "y")
assert classify_point(Point(0, 0)) == "Origin"
assert classify_point(Point(0, 8)) == "On Y-axis (y=8)"
assert classify_point(Point(5, 5)) == "On diagonal (x=y=5)"
```

### 子模式绑定（`as`）与守卫条件（`if` Guards）

1. **子模式绑定（AS Pattern，`pattern as name`）**：当我们在匹配复杂嵌套结构（或 `|` 或模式）时，如果既想验证内部结构/取值范围，又想把**某个子结构整体（或具体命中的那个分支值）**绑定到一个变量上，可以使用 `as` 关键字。
2. **守卫条件（Guard，`case pattern if condition:`）**：模式匹配遵循严格的**两阶段执行顺序**：
   - **第一阶段（结构匹配与变量绑定）**：先检查 `pattern` 结构是否吻合，若吻合则将模式中的捕获变量全部绑定完毕；
   - **第二阶段（求值 `if` 守卫）**：在捕获变量已生效的上下文中计算 `if condition`。若为 `True` 则正式进入该 `case` 分支体；**若为 `False`，则放弃该 `case`，继续向下尝试后续的 `case` 分支**！

```python
from dataclasses import dataclass


@dataclass
class Point:
    x: int
    y: int


def parse_packet(packet: dict) -> str:
    match packet:
        # 使用 | 配合 as 捕获具体命中的版本字符串，再用 if 守卫校验负载非空
        case {
            "version": ("v1" | "v2") as ver,
            "points": [Point(x1, y1) as first_pt, *_],
        } if x1 >= 0 and y1 >= 0:
            return f"{ver}: valid first point {first_pt}"
        case _:
            return "Invalid packet"


assert (
    parse_packet({"version": "v2", "points": [Point(3, 4), Point(5, 6)]})
    == "v2: valid first point Point(x=3, y=4)"
)
# 当 x1 = -1 时，虽然结构匹配成功，但 if 守卫为 False，自动回退到 case _
assert parse_packet({"version": "v1", "points": [Point(-1, 4)]}) == "Invalid packet"
```

### 常见避坑：裸名称被视为“变量捕获”而非“常量比较”的解决方案（点号限定名称 / 枚举）

这是使用 `match - case` 时**最危险、最常踩的语法陷阱**！

假设你定义了常量 `ADMIN_CODE = 1`，然后写了 `case ADMIN_CODE:`，本意是“当值等于 `1` 时进入该分支”。但在 `match - case` 语法规则中，**任何不带点号 `.` 的裸标识符（Bare Name）都会被无条件解释为“变量捕获模式（Capture Pattern）”**！这会导致两重灾难：
1. 该分支变成了无条件匹配任意值的兜底分支（若后面还有其他 `case`，Python 会直接报 `SyntaxError: name capture 'ADMIN_CODE' makes remaining patterns unreachable`）；
2. 原来的常量 `ADMIN_CODE` 会被被匹配的值直接覆盖重写！

**解决方案：要表示“与已有常量做相等值比较（Value Pattern）”，模式中的名称必须包含点号 `.`（Dotted Name），例如使用 `enum.Enum` 枚举成员、模块属性或类属性！**

```python
from enum import IntEnum


class Role(IntEnum):
    ADMIN = 1
    EDITOR = 2
    GUEST = 3


def check_permission(role_id: int) -> str:
    # 正确做法：使用带点号的枚举属性 Role.ADMIN（Value Pattern，执行 == 值比较）
    # 绝不能定义裸变量 ADMIN = 1 然后写 case ADMIN:！
    match role_id:
        case Role.ADMIN:
            return "Full Access"
        case Role.EDITOR:
            return "Write Access"
        case Role.GUEST:
            return "Read Only"
        case _:
            return "Access Denied"


assert check_permission(1) == "Full Access"
assert check_permission(99) == "Access Denied"
```

---

## 推导式（Comprehensions）与生成器表达式

### 列表推导式、字典推导式与集合推导式的标准语法

**推导式（Comprehensions）**源自函数式编程语言与数学中的集合构造记号（Set-builder notation），是 Python 构造新容器最地道、最高效的声明式语法。相比手动创建空列表再在 `for` 循环中反复调用 `.append()`，列表推导式在底层直接使用专用的 `LIST_APPEND` 字节码指令操作栈顶列表，避免了每次迭代查询 `.append` 方法属性的开销，运行速度通常快 20%~35%。

Python 共有**三种容器推导式**和**一种生成器表达式**（注意：**没有“元组推导式”**，圆括号 `(expr for x in it)` 是生成器表达式；若需通过推导生成元组，应写 `tuple(expr for x in it)`）：

| 类型 | 语法形式 | 返回对象类型 | 核心特点 |
| :--- | :--- | :--- | :--- |
| **列表推导式** | `[expr for x in iterable if cond]` | `list` | 立即求值，保留所有转换后的元素 |
| **集合推导式** | `{expr for x in iterable if cond}` | `set` | 立即求值，自动对结果元素执行哈希去重 |
| **字典推导式** | `{k_expr: v_expr for x in iterable if cond}` | `dict` | 立即求值，键值同步构造或反转字典映射 |
| **生成器表达式** | `(expr for x in iterable if cond)` | `generator` | **惰性求值（Lazy Evaluation）**，按需逐个产出元素 |

```python
words = ["  Apple ", "banana", "APPLE", "Cherry ", "ha"]

# 1. 列表推导式：清洗空白并转小写（仅保留长度 > 2 的单词）
cleaned_list = [w.strip().lower() for w in words if len(w.strip()) > 2]
assert cleaned_list == ["apple", "banana", "apple", "cherry"]

# 2. 集合推导式：一步完成清洗与去重
unique_set = {w.strip().lower() for w in words if len(w.strip()) > 2}
assert unique_set == {"apple", "banana", "cherry"}

# 3. 字典推导式：反转键值对映射
code_to_name = {200: "OK", 404: "Not Found", 500: "Internal Error"}
name_to_code = {name: code for code, name in code_to_name.items()}
assert name_to_code["Not Found"] == 404
```

### 条件过滤子句、多重循环嵌套顺序与推导式局部作用域隔离

1. **右侧过滤 `if` vs 左侧转换 `if-else` 三元表达式**：
   - 写在 `for` **右侧末尾**的 `if cond` 是**过滤器（Filter）**：不满足条件的元素被直接丢弃，输出容器长度 $\le$ 输入长度；
   - 写在 `for` **左侧开头**的 `a if cond else b` 是**条件表达式（Map / Transform）**：不丢弃任何元素，只决定每个元素被映射成什么值，输出长度 $=$ 输入长度。
2. **多重循环的嵌套顺序铁律**：
   当推导式中包含多个 `for` 子句时，**从左到右的书写顺序与传统多层嵌套 `for` 循环从外层到内层的顺序完全一致**！
3. **推导式局部作用域隔离（PEP 709 内联优化）**：
   在 Python 3 中，推导式内部的循环变量 `x` 拥有**独立的局部作用域**，绝不会像 Python 2 那样泄漏并覆盖外部同名变量（唯一例外是在推导式内使用海象运算符 `:=` 绑定的变量会按规范穿透到外层作用域）。在 **Python 3.12+（PEP 709）** 中，CPython 编译器进一步将列表/字典/集合推导式直接内联编译进外层函数帧中（省去了创建临时函数栈帧的开销），在严格保持循环变量隔离的同时将推导式执行速度又提升了高达 **2 倍**！

```python
# 1. 区分右侧过滤 if 与左侧映射 if-else
nums = [1, 2, 3, 4]
filtered = [n for n in nums if n % 2 == 0]               # 过滤：只留偶数 -> [2, 4]
mapped = ["even" if n % 2 == 0 else "odd" for n in nums] # 映射：全部保留 -> ['odd', 'even', 'odd', 'even']
assert filtered == [2, 4] and len(mapped) == 4

# 2. 多重循环展平二维矩阵：外层循环 for row in matrix 在前，内层循环 for item in row 在后
matrix = [[1, 2], [3, 4], [5, 6]]
flattened = [item for row in matrix for item in row]
assert flattened == [1, 2, 3, 4, 5, 6]

# 3. 推导式循环变量不会污染外层同名变量
x = "outer_value"
squares = [x * x for x in range(5)]
assert x == "outer_value"  # 外层 x 完好无损
```

### 生成器表达式（Generator Expressions）的惰性按需计算与内存开销对比

当处理海量数据流（如十万行日志文件、大型数据库游标）或只需将转换结果传给 `sum()`、`max()`、`min()`、`any()`、`all()`、`"".join()` 等消费函数时，如果使用列表推导式 `[...]`，解释器必须先在内存中一次性分配并填满包含所有元素的完整列表。

将其方括号 `[]` 替换为圆括号 **`()`** 即得到**生成器表达式（Generator Expression）**：
- **惰性按需计算（Lazy Evaluation）**：定义生成器表达式时不会执行任何循环体代码，只返回一个极小的生成器迭代器对象；每当外部对其调用一次 `next()`，才即时计算并产出一个元素，算完即释放。
- **$O(1)$ 恒定内存开销**：无论数据总量是 100 条还是 1 亿条，生成器表达式本身只占用大约 **200 字节**的固定栈帧状态内存。
- **一次性消费（Single-pass Exhaustion）**：生成器只能从头到尾遍历**一次**！遍历耗尽后再次对其迭代将得到空结果。
- **函数调用去括号语法糖**：当生成器表达式作为函数的**唯一实参**时，可以省略生成器自身的外层圆括号，直接写成 `sum(x * x for x in range(1000))`。

```python
import sys

list_comp = [x * x for x in range(10_000)]
gen_expr = (x * x for x in range(10_000))

# 1. 内存对比：10,000 个元素的列表占 ~85KB，而生成器表达式仅占 ~200 字节！
assert sys.getsizeof(list_comp) > 80_000
assert sys.getsizeof(gen_expr) < 300

# 2. 直接传给归约函数（省略内层圆括号），全程零中间列表内存分配
total_squares = sum(x * x for x in range(5))
assert total_squares == 0 + 1 + 4 + 9 + 16 == 30

# 3. 注意：生成器是一次性迭代器，消费完一次后即耗尽！
g = (n for n in [1, 2, 3])
assert list(g) == [1, 2, 3]
assert list(g) == []  # 第二次遍历为空！
```

### 推导式的可读性边界：何时应该退回普通 `for` 循环或拆分为辅助函数

推导式虽好，但绝不能走火入魔把所有逻辑都塞进一行“炫技式”推导式中。遵循 Google Python Style Guide 与 PEP 8，遇到以下**四大禁区**时，应当果断退回普通 `for` 循环或将内层逻辑提炼为具名辅助函数：

1. **包含超过 2 个子句**（例如 3 层 `for` 循环，或 2 层 `for` 加多个复杂的 `if` 条件）；
2. **为了产生副作用而使用列表推导式**：严禁编写 `[print(x) for x in items]` 或 `[db.save(x) for x in items]`！这种写法不仅违反了“推导式用于构造新容器”的语义，还会白白在内存中构造一个装满 `[None, None, ...]` 的无用列表；执行副作用操作**必须使用普通 `for` 循环**；
3. **内部需要异常捕获（`try - except`）或多步中间变量转换**；
4. **单行代码折行后仍然难以在 3 秒内看清数据流向**。

---

## Pythonic 迭代内置工具（`enumerate` / `zip` / `any` / `all`）

### `enumerate(iterable, start=0)`：彻底替代 `range(len(seq))` 下标遍历

在 Python 中，写出 `for i in range(len(items)): item = items[i]` 是最典型的非 Pythonic 反模式（既冗长，又根本无法用于集合、文件流或生成器等不支持下标 `[i]` 的可迭代对象）。

当在遍历过程中**同时需要元素序号和元素值**时，应始终使用内置惰性迭代器 **`enumerate(iterable, start=0)`**：
- 它每次产出一个 `(index, item)` 二元组，可直接配合 `for` 循环头部解包；
- 通过可选参数 **`start=1`**（默认为 `0`）可以直接从 1 开始对人类友好的行号或排行榜名次进行编号，无需手动写 `i + 1`。

```python
tasks = ["build", "test", "deploy"]

# 使用 start=1 直接生成从 1 开始的序号
indexed_tasks = [f"#{idx}: {task}" for idx, task in enumerate(tasks, start=1)]
assert indexed_tasks == ["#1: build", "#2: test", "#3: deploy"]
```

### `zip(*iterables, strict=False)`：并行拉链遍历、`strict=True` 长度一致性防御与 `zip(*matrix)` 解包转置

内置函数 **`zip(*iterables, strict=False)`** 接收任意多个可迭代对象，像拉拉链一样惰性产出由各序列对应位置元素组成的元组 `(a_i, b_i, ...)`。

1. **默认最短截断与 `strict=True` 防御（Python 3.10+，PEP 618）**：
   - 默认情况下（`strict=False`），一旦**最短**的那个可迭代对象耗尽，`zip` 就会静默停止，较长序列末尾多出来的元素会被**无声丢弃**！
   - 在绝大多数业务场景中，参与 `zip` 的两个列表（如“列名列表”与“行数据列表”）在逻辑上**长度应当严格相等**。如果长度不一致往往意味着上游数据错位或缺失。在 Python 3.10+ 中，强烈建议显式传入 **`strict=True`**：一旦发现各序列长度不一致，会立即抛出 `ValueError`，防止脏数据静默入库！（若确实需要向最长序列看齐并用默认值填充短序列，请使用 `itertools.zip_longest(..., fillvalue=None)`）。
2. **`dict(zip(keys, values, strict=True))`**：由两个平行序列构造字典的标准范式。
3. **`zip(*matrix)` 二维矩阵解包转置**：将二维矩阵 `matrix` 用 `*` 解包传给 `zip`，即可在一行代码内完成矩阵的**行列转置（Transpose）**！

```python
headers = ["id", "username", "role"]
row_data = [101, "alice", "admin"]

# 1. 利用 dict + zip(strict=True) 安全构造字典
user_dict = dict(zip(headers, row_data, strict=True))
assert user_dict == {"id": 101, "username": "alice", "role": "admin"}

# 2. strict=True 能在长度不一致时立即抛出 ValueError，阻止静默丢数据
corrupted_row = [102, "bob"]  # 缺失了 role 字段
try:
    list(zip(headers, corrupted_row, strict=True))
    raised = False
except ValueError:
    raised = True
assert raised is True

# 3. zip(*matrix) 实现二维矩阵的行列转置 (2行3列 -> 3行2列)
matrix_2x3 = [
    [1, 2, 3],
    [4, 5, 6],
]
transposed_3x2 = [list(col) for col in zip(*matrix_2x3, strict=True)]
assert transposed_3x2 == [
    [1, 4],
    [2, 5],
    [3, 6],
]
```

### `reversed()` 反向迭代器与 `sorted()` 自定义排序键（`key` 与 `reverse`）

- **`reversed(seq)` 惰性反向迭代器**：对任意序列（或实现了 `__reversed__()` 协议的对象，**包括 Python 3.8+ 的 `dict` 与字典视图**！）返回一个 **$O(1)$ 零内存拷贝的反向迭代器**。相比 `seq[::-1]` 会切出并复制一份完整的新列表，`for x in reversed(seq):` 不分配任何多余容器内存。
- **`sorted(iterable, *, key=None, reverse=False)` 与 `operator` 高效键函数**：
  - `key` 参数接收一个单参数函数，**每个元素在整个排序过程中只会调用一次 `key(item)`**（即 Schwartzian Transform 装饰-排序-反装饰机制），因此效率极高；
  - 当按字典的某个键、元组下标或对象属性排序时，使用标准库 `operator.itemgetter` 或 `operator.attrgetter` 比手写 `lambda` 函数在 C 层执行更快且语义更清晰；
  - 当需要**多级混合升降序排序**（例如：先按分数**降序**，分数相同时按姓名**升序**）时，对于数值字段可在 `key` 元组中取负号 `key=lambda u: (-u["score"], u["name"])`，或者利用 Powersort 的**稳定性**（先按次要键排一次，再按主要键排一次）。

```python
from operator import itemgetter

# 1. Python 3.8+ 原生支持对 dict 进行 O(1) 逆序遍历
steps = {"first": 1, "second": 2, "third": 3}
assert list(reversed(steps)) == ["third", "second", "first"]

# 2. 多级自定义排序：先按 score 降序 (-x["score"])，同分时按 name 字母升序
candidates = [
    {"name": "Charlie", "score": 90},
    {"name": "Alice", "score": 95},
    {"name": "Bob", "score": 90},
]
ranked = sorted(candidates, key=lambda c: (-c["score"], c["name"]))
assert [c["name"] for c in ranked] == ["Alice", "Bob", "Charlie"]

# 使用 operator.itemgetter 按单个或多个字典键排序
by_name = sorted(candidates, key=itemgetter("name"))
assert [c["name"] for c in by_name] == ["Alice", "Bob", "Charlie"]
```

### `any()` 与 `all()`：结合生成器表达式的流式布尔归约与短路求值优化

内置函数 **`any(iterable)`**（存在量词 $\exists$）和 **`all(iterable)`**（全称量词 $\forall$）与**生成器表达式**是天作之合，能够将繁琐的“循环查找 + 布尔标志 + `break`”压缩为极其优雅的一行声明式代码：

| 函数 | 逻辑语义 | 短路求值时机（Short-circuiting） | 当传入**空可迭代对象 `[]`** 时的返回值 |
| :--- | :--- | :--- | :--- |
| **`any(it)`** | 是否**至少存在一个**元素为 Truthy（$e_1 \lor e_2 \lor \dots$） | 遇到**第一个 Truthy** 元素立即停止迭代并返回 `True` | **`False`**（不存在任何为真的元素） |
| **`all(it)`** | 是否**所有**元素都为 Truthy（$e_1 \land e_2 \land \dots$） | 遇到**第一个 Falsy** 元素立即停止迭代并返回 `False` | **`True`**（**空真 Vacuous Truth**：不存在任何反例元素） |

```python
visited_steps = 0


def check_positive(n: int) -> bool:
    global visited_steps
    visited_steps += 1
    return n > 0


data = [10, 20, -5, 30, 40]

# 1. all() 结合生成器表达式：在检查到第 3 个元素 -5 时立即短路停止，后续的 30 和 40 根本不会被访问！
assert all(check_positive(x) for x in data) is False
assert visited_steps == 3

# 2. 务必警惕：使用列表推导式 all([check_positive(x) for x in data]) 会丧失短路能力！
# 因为列表推导式在传给 all() 之前就会先把所有 5 个元素全部计算完！

# 3. 空集边界：any([]) 为 False，而 all([]) 为 True（空真 Vacuous Truth）
assert any([]) is False
assert all([]) is True
```

!!! warning "注意：警惕 `all()` 在空输入上的“空真（Vacuous Truth）”效应"
    在数学逻辑中，“空集合中的所有元素都满足条件 P”恒为真（因为找不到反例），所以 `all([])` 返回 **`True`**！在编写权限校验或批量审批逻辑（例如 `if all(item.is_approved for item in order_items):`）时，如果调用方传入了一个空的 `order_items = []`，`all(...)` 会直接返回 `True` 放行！若业务上要求“列表非空且全部满足条件”，务必显式写成：
    ```python
    order_items: list[int] = []
    is_valid = bool(order_items) and all(x > 0 for x in order_items)
    assert is_valid is False
    ```

---

## 练习与实战

### 练习 1：使用卫语句（Guard Clauses）与 `any()` / `all()` 重构深层嵌套校验器

阅读下方充满深层 `if - else` 嵌套与手工布尔标志位循环的密码强度校验函数 `validate_password_legacy`。

请使用**卫语句（提前返回）**结合 **`any()` / `all()` + 生成器表达式**，将其重构为扁平、无任何显式 `for` 循环和布尔标志位变量的 `validate_password(pwd: str | None) -> tuple[bool, str]`，保持所有校验规则与返回文案完全一致。

```python
def validate_password_legacy(pwd: str | None) -> tuple[bool, str]:
    if pwd is not None:
        if len(pwd) >= 8:
            has_Space = False
            for ch in pwd:
                if ch.isspace():
                    has_Space = True
                    break
            if not has_Space:
                has_upper = False
                has_digit = False
                for ch in pwd:
                    if ch.isupper():
                        has_upper = True
                    if ch.isdigit():
                        has_digit = True
                if has_upper and has_digit:
                    return True, "OK"
                else:
                    return False, "必须同时包含大写字母和数字"
            else:
                return False, "不能包含空白字符"
        else:
            return False, "长度不能少于 8 位"
    else:
        return False, "密码不能为 None"
```

??? success "点击查看答案与解析"
    **解析：**
    1. 将每一层外围条件反转为顶层的卫语句（`if pwd is None: return ...`、`if len(pwd) < 8: return ...`），立刻消除了 4 层缩进嵌套；
    2. 原先用 `for` 循环配合 `has_Space`、`has_upper`、`has_digit` 标志位加 `break` 的手写逻辑，可以直接替换为声明式的 `any(ch.isspace() for ch in pwd)`、`any(ch.isupper() for ch in pwd)` 与 `any(ch.isdigit() for ch in pwd)`，兼具短路求值性能与极佳的可读性。

    ```python
    def validate_password(pwd: str | None) -> tuple[bool, str]:
        if pwd is None:
            return False, "密码不能为 None"
        if len(pwd) < 8:
            return False, "长度不能少于 8 位"
        if any(ch.isspace() for ch in pwd):
            return False, "不能包含空白字符"
        if not (any(ch.isupper() for ch in pwd) and any(ch.isdigit() for ch in pwd)):
            return False, "必须同时包含大写字母和数字"

        return True, "OK"


    assert validate_password(None) == (False, "密码不能为 None")
    assert validate_password("Ab1") == (False, "长度不能少于 8 位")
    assert validate_password("Abcdefg 1") == (False, "不能包含空白字符")
    assert validate_password("abcdefgh1") == (False, "必须同时包含大写字母和数字")
    assert validate_password("SecurePass2026") == (True, "OK")
    ```

### 练习 2：利用 `match - case` 结构化模式匹配实现 AST 算术表达式求值器

在编写配置公式引擎或 DSL 解释器时，`match - case` 是处理递归树状结构（AST）的利器。我们使用 `@dataclass` 定义了三种表达式节点：`Num(value)`、`UnaryOp(op, operand)` 和 `BinOp(op, left, right)`。

请使用 `match - case`（综合运用**类模式位置解构**、**或模式 `|`**、**`as` 绑定**以及 **`if` 守卫条件**）实现递归求值函数 `evaluate(node: Expr) -> float`：
- 支持一元运算符 `"+"`、`"-"`；
- 支持二元运算符 `"+"`、`"-"`、`'*'`、`"/"`；
- 当遇到除法 `"/"` 且右操作数求值结果为 `0` 时，抛出 `ZeroDivisionError("除数不能为 0")`；
- 遇到未知节点或未知运算符时，抛出 `ValueError`。

```python
from dataclasses import dataclass


@dataclass
class Num:
    value: int | float


@dataclass
class UnaryOp:
    op: str
    operand: "Expr"


@dataclass
class BinOp:
    op: str
    left: "Expr"
    right: "Expr"


Expr = Num | UnaryOp | BinOp
```

??? success "点击查看答案与解析"
    **解析：**
    `@dataclass` 自动为 `Num`、`UnaryOp`、`BinOp` 生成了 `__match_args__`，因此我们可以在 `case` 中直接使用位置解构 `case BinOp("+", left, right):`，甚至嵌套匹配一元负号与数值节点。

    ```python
    from dataclasses import dataclass


    @dataclass
    class Num:
        value: int | float


    @dataclass
    class UnaryOp:
        op: str
        operand: "Expr"


    @dataclass
    class BinOp:
        op: str
        left: "Expr"
        right: "Expr"


    Expr = Num | UnaryOp | BinOp


    def evaluate(node: Expr) -> float:
        match node:
            case Num(int() | float() as val):
                return float(val)
            case UnaryOp("+", operand):
                return +evaluate(operand)
            case UnaryOp("-", operand):
                return -evaluate(operand)
            case BinOp("+", left, right):
                return evaluate(left) + evaluate(right)
            case BinOp("-", left, right):
                return evaluate(left) - evaluate(right)
            case BinOp("*", left, right):
                return evaluate(left) * evaluate(right)
            case BinOp("/", left, right):
                divisor = evaluate(right)
                if divisor == 0.0:
                    raise ZeroDivisionError("除数不能为 0")
                return evaluate(left) / divisor
            case _:
                raise ValueError(f"不支持的表达式节点: {node!r}")


    # 构造表达式: -(2 + 3) * 4 / 2  => -10.0
    ast_tree = BinOp(
        "/",
        BinOp("*", UnaryOp("-", BinOp("+", Num(2), Num(3))), Num(4)),
        Num(2),
    )
    assert evaluate(ast_tree) == -10.0

    # 验证除以 0 守卫拦截
    try:
        evaluate(BinOp("/", Num(10), BinOp("-", Num(5), Num(5))))
        caught = False
    except ZeroDivisionError:
        caught = True
    assert caught is True
    ```

### 练习 3：结合 `for - else`、`enumerate` 与 `zip(strict=True)` 校验表格批量导入数据

假设你需要编写一个 CSV 表格数据校验与转换器 `parse_table(headers: list[str], rows: list[list[object]], required_col: str) -> list[dict[str, object]]`：
1. 遍历 `rows` 的每一行（利用 `enumerate(..., start=1)` 追踪从 1 开始的行号 `line_no`）；
2. 利用 `zip(headers, row, strict=True)` 将表头与当前行组装为字典 `record`（若某行列数与表头不一致，`strict=True` 会自动抛出 `ValueError`）；
3. 检查 `record.get(required_col)` 是否为空（`None` 或空字符串 `""`）：一旦发现某行的必填列缺失，**立即记录错误行号并 `break` 跳出循环**，最终抛出 `ValueError(f"第 {line_no} 行缺失必填字段: {required_col}")`；
4. 利用 **`for - else` 的 `no-break` 语义**：只有当所有行全部通过必填项校验、循环自然结束时，才在 `else` 块中返回转换好的字典列表。

??? success "点击查看答案与解析"
    **解析：**
    本题将 `enumerate(rows, start=1)`、`zip(headers, row, strict=True)` 以及 `for - else` 融会贯通：
    - `enumerate(..., start=1)` 免去了手动维护 `line_no = 1` 计数器的麻烦；
    - `zip(..., strict=True)` 自动防御了“某一行多一列或少一列”导致的字段错位静默损坏；
    - `for - else` 清晰表达了“若中途因为发现非法行而 `break` 则报错，若全程无 `break` 则在 `else` 中正常产出结果”的控制流契约。

    ```python
    def parse_table(
        headers: list[str],
        rows: list[list[object]],
        required_col: str,
    ) -> list[dict[str, object]]:
        records: list[dict[str, object]] = []
        failed_line: int | None = None

        for line_no, row in enumerate(rows, start=1):
            record = dict(zip(headers, row, strict=True))
            if record.get(required_col) in (None, ""):
                failed_line = line_no
                break
            records.append(record)
        else:
            # 仅当循环未触发 break（即所有行均合法）时执行
            return records

        raise ValueError(f"第 {failed_line} 行缺失必填字段: {required_col}")


    cols = ["id", "email", "dept"]
    valid_rows = [
        [1, "alice@kosmigen.com", "R&D"],
        [2, "bob@kosmigen.com", "QA"],
    ]
    assert parse_table(cols, valid_rows, required_col="email") == [
        {"id": 1, "email": "alice@kosmigen.com", "dept": "R&D"},
        {"id": 2, "email": "bob@kosmigen.com", "dept": "QA"},
    ]

    # 测试第 2 行缺失必填字段 email
    invalid_rows = [
        [1, "alice@kosmigen.com", "R&D"],
        [2, "", "QA"],
    ]
    try:
        parse_table(cols, invalid_rows, required_col="email")
        error_msg = ""
    except ValueError as exc:
        error_msg = str(exc)
    assert error_msg == "第 2 行缺失必填字段: email"
    ```
