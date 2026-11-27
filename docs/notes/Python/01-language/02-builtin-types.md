# 内置数据类型与容器

Python 标准内置类型体系涵盖了数值、文本与字节流、序列容器（`list` / `tuple`）以及基于哈希表的映射与集合（`dict` / `set`）。掌握每种类型在 CPython 底层的内存布局、时间复杂度契约以及 Python 3.12–3.14+ 的最新特性（如 PEP 701 增强型 `f-string` 与 PEP 750 模板字符串 `t-string`），是选择合适数据结构与编写高性能代码的核心前提。

---

## 数值类型体系

### 任意精度整数（`int`）、多进制字面量与数字下划线分隔符 `_`

Python 3 彻底统一了整数类型：不再区分定长 `int` 与长整型 `long`，所有 `int` 对象底层均对应 CPython 的变长数组结构 `PyLongObject`（按 $2^{30}$ 进制分块存储大整数位），具备**任意精度（Arbitrary Precision）**。只要机器内存充足，整数运算永远不会发生静默的算术溢出（Overflow）。

> **安全边界提示**：为防范超大整数与十进制字符串互转时的 $O(N^2)$ 算法复杂度拒绝服务攻击（CVE-2020-10735），Python 3.11+ 默认限制 `int(str)` 与 `str(int)` 的十进制位数不超过 **4300 位**（可通过 `sys.set_int_max_str_digits()` 调整，不影响十六进制/二进制转换或纯数学运算）。

- **多进制字面量与转换函数**：支持二进制 `0b` / `0B`（`bin()`）、八进制 `0o` / `0O`（`oct()`）、十六进制 `0x` / `0X`（`hex()`）。
- **数字下划线分隔符 `_`（PEP 515）**：可在数字字面量或 `int("1_000", 10)` 字符串中间插入单下划线 `_` 进行千分位或字节分组以提升可读性，编译器会在词法阶段自动忽略它（不能连续两个 `__`，也不能出现在首尾）。

```python
# 1. 任意精度整数：计算 2 的 256 次方不会溢出
huge_num = 2 ** 256
assert huge_num.bit_length() == 257  # 二进制有效位数

# 2. 多进制字面量与下划线视觉分隔符
million = 1_000_000
perm_mask = 0o755
rgba_color = 0xFF_80_00_FF
flag_bits = 0b1101_0110

assert million == 1000000
assert int("0xFF_80", 16) == 0xFF80
assert hex(255) == "0xff" and bin(5) == "0b101"
```

### 双精度浮点数（`float`）、IEEE 754 精度陷阱与 `math.isclose`

Python 的 `float` 在底层直接映射为 C 语言的双精度浮点数（`double`），严格遵循 **IEEE 754 binary64 标准**（占用 8 字节 / 64 位：1 位符号位、11 位指数位、52 位尾数位，约等于 **15~17 位有效十进制数字**）。

**为什么 `0.1 + 0.2 != 0.3`？**
十进制小数 $0.1 = \frac{1}{10}$ 的分母含有质因数 $5$，在二进制下是一个无限循环小数 $0.0001100110011\dots_{(2)}$。由于 52 位尾数必须截断舍入，存储在内存中的 `0.1` 和 `0.2` 从一开始就存在微小的二进制表示误差：

```python
import math

# 1. IEEE 754 二进制尾数截断导致的经典不等式
assert (0.1 + 0.2 == 0.3) is False
assert 0.1 + 0.2 == 0.30000000000000004

# 2. 正确做法：使用 math.isclose() 进行容差判等（PEP 485）
# rel_tol 为相对误差容限（默认 1e-9），abs_tol 为绝对误差容限（比较接近 0.0 的数值时必须指定 abs_tol）
assert math.isclose(0.1 + 0.2, 0.3) is True
assert math.isclose(1e-10, 2e-10, abs_tol=1e-9) is True

# 3. 特殊浮点值：正负无穷 (inf) 与非数字 (nan)
pos_inf = float("inf")
nan_val = float("nan")
assert math.isinf(pos_inf) is True
# IEEE 754 规定：NaN 与任何值（包括它自己！）比较 == 都返回 False，必须使用 math.isnan()
assert (nan_val == nan_val) is False
assert math.isnan(nan_val) is True
```

### 精确十进制（`decimal.Decimal`）、有理分数（`fractions.Fraction`）与复数（`complex`）

当业务场景无法容忍 `float` 的二进制舍入误差（如金融账务、汇率结算、税务计算）或需要符号级有理数运算时，应使用标准库提供的专用数值类型：

| 类型 | 底层表示机制 | 核心优势 | 典型适用场景与注意事项 |
| :--- | :--- | :--- | :--- |
| `float` | IEEE 754 64 位二进制浮点 | CPU 硬件指令直算，速度最快 | 科学计算、图形学、机器学习、物理模拟 |
| `decimal.Decimal` | 十进制浮点（可配置有效精度与 8 种舍入模式，如银行家舍入 `ROUND_HALF_EVEN` 或传统四舍五入 `ROUND_HALF_UP`） | 与人类十进制手算完全一致，无 `0.1 + 0.2` 误差 | **金融、货币、会计系统**（注意：**构造时必须传入字符串 `Decimal("0.1")`**，不能传 `Decimal(0.1)`！） |
| `fractions.Fraction` | 约分后的分子/分母整数对 `(numerator, denominator)` | 精确表示任意有理数（如 `1/3`），无任何小数截断 | 分数代数运算、比例精确化简 |
| `complex` | 两个双精度浮点数 `(real, imag)`，字面量后缀 `j` 或 `J` | 原生支持复平面算术与 `cmath` 库 | 信号处理、傅里叶变换、电路阻抗计算 |

```python
from decimal import Decimal, ROUND_HALF_UP
from fractions import Fraction

# 1. Decimal：必须用 str 初始化！若传入 float 会把 float 原本的二进制误差一并带入
assert Decimal("0.1") + Decimal("0.2") == Decimal("0.3")
price = Decimal("19.995").quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
assert price == Decimal("20.00")

# 2. Fraction：精确有理分数运算
assert Fraction(1, 3) + Fraction(1, 6) == Fraction(1, 2)

# 3. complex：复数运算
z = 3 + 4j
assert z.real == 3.0 and z.imag == 4.0
assert abs(z) == 5.0          # 模长 sqrt(3^2 + 4^2)
assert z.conjugate() == 3 - 4j  # 共轭复数
```

### 布尔类型（`bool` 作为 `int` 的子类）与空值单例 `None`

在 Python 类型继承树中，因为历史原因（Python 2.3 引入 `bool` 时为了向后兼容用 `1` 和 `0` 表示真假的代码），**`bool` 被设计为 `int` 的直接子类（`issubclass(bool, int) is True`）**。

全局仅存在两个 `bool` 单例实例：`True` 和 `False`。在算术与哈希上下文中，`True` 的行为完全等同于整数 `1`，`False` 完全等同于整数 `0`：

```python
assert issubclass(bool, int) is True
assert isinstance(True, int) is True

# 1. True 与 1、False 与 0 的值相等且哈希值完全相同，但身份（is）不同
one = 1
assert (True == one) and (False == 0)
assert hash(True) == hash(one) == 1
assert (True is one) is False  # type(True) 是 bool，type(1) 是 int

# 2. 实用技巧：利用 True == 1 直接对布尔生成器表达式调用 sum() 统计满足条件的元素个数
scores = [55, 72, 88, 91, 49]
pass_count = sum(s >= 60 for s in scores)
assert pass_count == 3

# 3. 经典陷阱：字典中 1、1.0 和 True 会被视为同一个 Key！
# 插入顺序保留第一个键对象 1，但后续赋值会覆盖它的 Value
collision_dict = {1: "int_one", True: "bool_true", 1.0: "float_one"}
assert len(collision_dict) == 1
assert collision_dict == {1: "float_one"}
```

**空值单例 `None`**：`None` 是 `types.NoneType` 类的唯一全局单例实例，专门用于表示“缺失值”、“未传参默认占位哨兵”或“无显式返回值函数的默认返回值”。`None` 不支持任何算术或大小比较运算，判断是否为 `None` **必须始终使用 `x is None` 或 `x is not None`**。

---

## 文本与字节序列：`str`、`bytes` 与 `f-string` / `t-string`

### Unicode 码点、UTF-8 编码以及 `str` 与 `bytes` 的严格边界（`encode` / `decode`）

Python 3 最重大的架构演进之一就是彻底划清了**人类可读文本（`str`）**与**底层原始二进制字节（`bytes`）**的界限，绝不在两者之间进行隐式转换：

- **`str`（Unicode 码点序列）**：逻辑上是由一个个 **Unicode 码点（Code Point，取值范围 `U+0000` ~ `U+10FFFF`）**组成的不可变序列。内置函数 `ord(char)` 返回字符的整数码点，`chr(code)` 将码点还原为字符。在 CPython 内部（PEP 393 弹性字符串表示），解释器会根据字符串中最大码点自动采用 Latin-1（每字符 1 字节）、UCS-2（2 字节）或 UCS-4（4 字节）定宽数组存储，从而保证 **`s[i]` 下标访问与 `len(s)` 永远是严格 $O(1)$ 时间复杂度**。
- **`bytes`（0~255 原始字节序列）**：存储在磁盘或通过网络传输的原始字节流。
- **编码与解码（三明治模型 Unicode Sandwich）**：
  $$\text{str (内存中的 Unicode 文本)} \underset{\text{bytes.decode('utf-8')}}{\overset{\text{str.encode('utf-8')}}{\rightleftharpoons}} \text{bytes (外部 I/O 字节流)}$$

```python
text = "Python 编程 🚀"
assert len(text) == 11          # 11 个 Unicode 码点（字符）
assert hex(ord("🚀")) == "0x1f680"
assert chr(0x1F680) == "🚀"

# 编码为 UTF-8 字节流：ASCII 占 1 字节，中文汉字占 3 字节，Emoji 🚀 占 4 字节
raw_bytes = text.encode("utf-8")
assert isinstance(raw_bytes, bytes)
assert len(raw_bytes) == 7 + 3 * 2 + 1 + 4 == 18

# 解码回 str
assert raw_bytes.decode("utf-8") == text
```

### `str` 的不可变性、高频方法（`split` / `join` / `strip` / `replace` / `partition`）与原始字符串 `r""`

由于 `str` 是**不可变对象**，所有看似“修改”字符串的方法都会返回一个**新字符串**。

**循环拼接字符串的性能红线**：切勿在循环中使用 `s += piece` 大规模拼接字符串（尽管 CPython 对引用计数为 1 的局部变量有一定就地扩容投机优化，但理论复杂度仍可能退化为 $O(N^2)$）。**标准做法是将片段收集到列表中，最后调用一次 `"".join(pieces)`**，它会先遍历一次预先算出总字节长度，仅执行一次内存分配，严格保证 $O(N)$ 时间复杂度。

| 方法签名 | 核心行为与工程避坑要点 |
| :--- | :--- |
| `sep.join(iterable)` | 以 `sep` 为分隔符高效拼接可迭代对象中的所有 `str` 元素（非 `str` 元素需先转换） |
| `s.split(sep=None, maxsplit=-1)` | 不传 `sep`（默认 `None`）时，自动合并切分**任意连续空白字符**（空格、`\t`、`\n`）并剔除首尾空白；显式传 `sep=" "` 则严格按单个空格切分，连续空格会产生空字符串 `""` |
| `s.partition(sep)` / `rpartition(sep)` | 按首个（或末个）`sep` 切分为固定三元组 `(head, sep, tail)`；若未找到 `sep`，返回 `(s, "", "")`（比 `split(sep, 1)` 更安全，解包永不报 `ValueError`） |
| `s.strip([chars])` | 剥离首尾字符集合（注意：**参数 `chars` 是字符无序集合，而非前缀/后缀子串**！） |
| `s.removeprefix(p)` / `removesuffix(s)` | Python 3.9+ 引入：**精确剥离完整的前缀或后缀子串**，替代易出错的 `lstrip` / `rstrip` |
| `s.replace(old, new, count=-1)` | 将 `old` 替换为 `new`，可通过 `count` 限制最大替换次数 |

```python
# 1. split() 默认行为 vs 显式分隔符
assert "  a   b\tc\n ".split() == ["a", "b", "c"]
assert "a,,b".split(",") == ["a", "", "b"]

# 2. partition 永远返回 3 元组，适合解析 key=value 或 host:port
host, sep, port = "localhost:8080".partition(":")
assert (host, sep, port) == ("localhost", ":", "8080")

# 3. strip(chars) 陷阱 vs removeprefix() 正解
filename = "test_user.py"
# 错误：lstrip("test_") 会把 't', 'e', 's', '_' 四个字符集继续往后剥，导致 'user' 的 'u' 前如果碰巧有这些字母就会被误删！
assert "test_toast.py".lstrip("test_") == "oast.py"  # 't' 被误剥离！
# 正确：使用 removeprefix / removesuffix
assert "test_toast.py".removeprefix("test_").removesuffix(".py") == "toast"

# 4. 原始字符串 r"" (Raw String)：反斜杠 \ 不作为转义符，专用于正则表达式与 Windows 路径
win_path = r"C:\new_folder\test\node.exe"
assert "\\n" in win_path  # 不会变成换行符
```

### 二进制序列：不可变 `bytes`、可变 `bytearray` 与零拷贝内存视图 `memoryview`

处理网络报文、加密哈希、图像音频或文件二进制缓冲时，Python 提供了三剑客：

1. **`bytes`（不可变字节序列）**：字面量以 `b"..."` 表示。**注意**：对 `bytes` 取单个下标 `b[0]` 返回的是 **`0~255` 的整数（`int`）**，而取切片 `b[0:1]` 返回的才是长度为 1 的 `bytes`！
2. **`bytearray`（可变字节数组）**：支持就地修改（`ba[0] = 0x41`）、`.append(int)`、`.extend(bytes)`，适合在内存中增量组装二进制协议包。
3. **`memoryview`（零拷贝内存视图）**：基于 Python **缓冲区协议（Buffer Protocol）**。普通的 `bytes` 或 `bytearray` 切片操作（如 `data[1024:8192]`）会触发**内存分配与字节拷贝**；而将对象包装为 `mv = memoryview(data)` 后，对 `mv[1024:8192]` 的任何切片都只创建一个轻量级的视图描述符，**完全零内存拷贝（Zero-Copy）**，甚至可以通过可写 `memoryview` 直接就地修改底层 `bytearray` 的指定切片区域！

```python
# 1. bytes 单下标返回 int (ASCII 码值)，切片返回 bytes
packet = b"HTTP"
assert packet[0] == 72 and isinstance(packet[0], int)
assert packet[0:1] == b"H" and isinstance(packet[0:1], bytes)

# 2. bytearray + memoryview 实现零拷贝切片读写
buf = bytearray(b"0000_PAYLOAD_0000")
mv = memoryview(buf)

# 对 memoryview 切片不复制底层字节，直接修改切片会同步反映到底层 bytearray
payload_view = mv[5:12]
assert bytes(payload_view) == b"PAYLOAD"
payload_view[:] = b"UPDATED"
assert buf == bytearray(b"0000_UPDATED_0000")
```

### `f-string` 格式化进阶：表达式求值、`=` 自省调试、转换标志（`!r` / `!s` / `!a`）与格式说明符

格式化字符串字面量 **`f-string`（`f"..."`）** 在编译期会被直接编译为高效的 `FORMAT_VALUE` 与 `BUILD_STRING` 字节码指令，性能远快于 `%` 格式化和 `str.format()`。

**Python 3.12+ 重大升级（PEP 701）**：彻底解除了早期 `f-string` 的词法限制——现在 `{...}` 内部可以**直接重用与外层相同的引号**、支持任意层级嵌套、允许包含反斜杠 `\` 转义字符，且支持在 `{...}` 内跨越多行并书写 `#` 注释。

**`f-string` 完整语法结构**：`f"{expr [=] [!s|!r|!a] [:format_spec]}"`

| 语法组件 | 示例 | 作用说明 |
| :--- | :--- | :--- |
| **自省调试 `=`** | `f"{x + 1 = }"` | 同时输出**表达式源码文本**与**求值结果**（如 `'x + 1 = 42'`），默认对结果应用 `!r` |
| **转换标志 `!r` / `!s` / `!a`** | `f"{val!r}"` | 格式化前先强制调用 `repr(val)`（`!r`，带引号与转义）、`str(val)`（`!s`）或 `ascii(val)`（`!a`） |
| **对齐与填充** | `f"{title:*^10}"` | `<` 左对齐，`>` 右对齐，`^` 居中对齐；前面可指定单个填充字符（如 `*`，默认为空格） |
| **数值千分位与精度** | `f"{num:,.2f}"` | `,` 或 `_` 作为千分位分隔符；`.2f` 保留 2 位定点小数；`.1%` 转换为百分比 |
| **进制与零填充** | `f"{255:#06x}"` | `b`/`o`/`x`/`X` 转换进制，`#` 附加 `0x` 前缀，`06` 指定总宽度并用 `0` 左填充（输出 `'0x00ff'`） |

```python
user = "Alice"
score = 12345.6789

# 1. = 自省调试与 !r 转换标志
assert f"{user!r}" == "'Alice'"
assert f"{len(user)=}" == "len(user)=5"

# 2. 格式说明符：千分位 + 保留两位小数、对齐填充、十六进制零填充
assert f"{score:,.2f}" == "12,345.68"
assert f"{'OK':->6}" == "----OK"
assert f"{42:#06x}" == "0x002a"

# 3. Python 3.12+ (PEP 701)：大括号内部可直接重用外层相同的双引号，且允许使用 \n
items = ["a", "b", "c"]
assert f"Joined: {", ".join(items)}" == "Joined: a, b, c"
```

### 模板字符串 `t-string`（PEP 750）：`Template` 对象、插值延迟处理与防注入安全渲染

`f-string` 虽然极其方便，但它有一个致命的安全隐患：**它在定义处立即求值并直接拼成最终的扁平 `str`**。如果开发者不慎写出 `f"SELECT * FROM users WHERE name = '{user_input}'"` 或 `f"<div>{user_input}</div>"`，接收该 `str` 的数据库驱动或 HTML 渲染器**根本无法区分哪部分是开发者写的静态模板字面量、哪部分是外部不可信的动态插值变量**，从而极易引发 **SQL 注入（SQL Injection）** 或 **跨站脚本攻击（XSS）**。

为此，**Python 3.14 正式引入了模板字符串 `t-string`（Template Strings，PEP 750）**：

- 字面量前缀为 `t"..."`（或 `T"..."`）。
- **它不会立即拼接成 `str`！** 而是求值为一个 `string.templatelib.Template` 实例。
- `Template` 对象将**静态字符串片段（`template.strings: tuple[str, ...]`）**与**动态插值项（`template.interpolations: tuple[Interpolation, ...]`）**完全分离存储。每个 `Interpolation` 对象都完整保留了四个属性：
  1. `value`：插值表达式求值后的原始 Python 对象（尚未被转为字符串）；
  2. `expression`：原始表达式源码文本（如 `"user_input"`）；
  3. `conversion`：转换标志（`"r"`、`"s"`、`"a"` 或 `None`）；
  4. `format_spec`：格式说明符（如 `".2f"` 或 `""`）。

消费者函数（如 HTML 转义器、参数化 SQL 构建器、结构化日志记录器）可以遍历 `template`，**保持静态部分原样输出，仅对 `Interpolation` 动态值执行上下文感知的转义或参数化绑定**：

```python
import html

# Python 3.14+ 原生语法为：tpl = t"<p>Hello, {untrusted_name}!</p>"
# 为了在 Python 3.12~3.14 全版本环境中均可直接运行理解，下方演示 PEP 750 Template 的等价处理机制：
try:
    from string.templatelib import Interpolation, Template
except ImportError:
    from dataclasses import dataclass
    from typing import Any

    @dataclass(frozen=True)
    class Interpolation:
        value: Any
        expression: str = ""
        conversion: str | None = None
        format_spec: str = ""

    class Template:
        def __init__(self, *args: str | Interpolation) -> None:
            self._items = args
            self.strings = tuple(x for x in args if isinstance(x, str))
            self.interpolations = tuple(x for x in args if isinstance(x, Interpolation))

        def __iter__(self):
            return iter(self._items)


def safe_html(template: Template) -> str:
    """消费 t-string Template 对象，自动对所有动态插值项执行 HTML 实体转义以防御 XSS。"""
    parts: list[str] = []
    for item in template:
        if isinstance(item, str):
            parts.append(item)  # 静态模板标签：安全，原样保留
        elif isinstance(item, Interpolation):
            # 动态插值：先执行转义，彻底消除 <script> 注入
            escaped = html.escape(str(item.value))
            parts.append(format(escaped, item.format_spec))
    return "".join(parts)


untrusted = "<script>alert(1)</script>"
# 在 Python 3.14+ 中可直接写作：tpl = t"<div class='user'>{untrusted}</div>"
tpl = Template("<div class='user'>", Interpolation(untrusted, "untrusted"), "</div>")

rendered = safe_html(tpl)
assert rendered == "<div class='user'>&lt;script&gt;alert(1)&lt;/script&gt;</div>"
```

---

## 序列容器：`List` 与 `Tuple`

### 列表（`list`）的动态指针数组内存布局、预分配扩容机制与操作时间复杂度

初学者常以为 Python 的 `list` 是链表（Linked List），实际上 **CPython 的 `list`（`PyListObject`）在底层是一个连续的动态 C 指针数组（`PyObject **ob_item`）**：

- 列表本身不直接存放元素对象的数据体，而是存放一块**连续的 `PyObject*` 内存地址指针**（64 位系统上每个槽位固定占 8 字节），因此一个列表可以混装任意不同类型的对象，且按索引随机访问 `lst[i]` 的时间复杂度严格为 **$O(1)$**。
- **超额预分配扩容机制（Over-allocation）**：为了避免每次 `.append()` 都调用 `realloc` 重新分配内存，CPython 维护了实际元素个数 `ob_size` 与已分配槽位容量 `allocated`。当容量不足时，按约 $1.125$ 倍（`new_allocated = newsize + (newsize >> 3) + 6`）成倍扩容，从而保证尾部追加 `.append()` 的**均摊时间复杂度（Amortized Time Complexity）为 $O(1)$**。
- **头部/中间操作的代价**：在头部或中间插入（`insert(0, x)`）或弹出（`pop(0)`），需要将该位置之后的所有指针在内存中整体向后或向前搬移，时间复杂度为 **$O(N)$**。

| `list` 操作 | 示例 | 平均时间复杂度 | 性能建议 |
| :--- | :--- | :--- | :--- |
| 随机索引读写 | `lst[i]` / `lst[i] = x` | $O(1)$ | 极快，连续指针数组偏移寻址 |
| 尾部追加 / 尾部弹出 | `lst.append(x)` / `lst.pop()` | **$O(1)$**（均摊） | 推荐用作后进先出栈（LIFO Stack） |
| 头部/中间插入或删除 | `lst.insert(0, x)` / `lst.pop(0)` | **$O(N)$** | **严禁在高频循环中对 `list` 执行 `pop(0)`**；双端队列请用 `collections.deque`（首尾均为 $O(1)$） |
| 成员包含检测 / 值查找 | `x in lst` / `lst.index(x)` | $O(N)$ | 线性扫描；高频查找请改用 `set` 或 `dict`（$O(1)$） |
| 切片读取 | `lst[a:b]` | $O(b - a)$ | 分配新列表并拷贝切片区间内的对象指针 |
| 排序 | `lst.sort()` / `sorted(lst)` | $O(N \log N)$ | 基于自适应稳定排序算法 Timsort / Powersort |

### 列表高频操作、就地排序 `list.sort()` 与内置 `sorted()` 的对比

- **`.append(x)` vs `.extend(iterable)`**：`append(x)` 将 `x` 作为**单个整体元素**放到末尾（长度固定 $+1$）；`extend(iterable)` 则遍历可迭代对象，将其内部元素逐一追加到列表末尾。
- **`.remove(x)` vs `.pop([i])`**：`remove(x)` 按**值**搜索并删除第一个等于 `x` 的元素（找不到抛 `ValueError`，返回 `None`）；`pop(i=-1)` 按**索引**移除并返回该位置的元素（默认最后一个）。
- **就地排序 `list.sort()` vs 内置函数 `sorted()`**：两者底层均采用 **Powersort**（Python 3.11+ 对 Timsort 归并策略的优化演进，属于**稳定排序 Stable Sort**，即键值相等的元素保持原有相对顺序），且均接受关键字参数 `key=callable` 与 `reverse=bool`：

| 对比维度 | `lst.sort(*, key=None, reverse=False)` | `sorted(iterable, /, *, key=None, reverse=False)` |
| :--- | :--- | :--- |
| **调用形式与适用范围** | `list` 专属实例方法，**仅限列表调用** | 内置通用函数，接受**任意可迭代对象**（`tuple`, `dict`, `set`, 生成器等） |
| **是否修改原对象** | **就地修改（In-place）**原列表，不分配新外层列表，空间开销更低 | **不修改原对象**，始终创建并返回一个**全新的 `list`** |
| **返回值** | 固定返回 **`None`** | 返回排序后的新 `list` |

```python
users = [
    {"name": "Charlie", "age": 30},
    {"name": "Alice", "age": 25},
    {"name": "Bob", "age": 25},
]

# 1. sorted() 不改变原列表，且保持稳定排序（同为 25 岁的 Alice 和 Bob 保持原有先后顺序）
by_age = sorted(users, key=lambda u: u["age"])
assert [u["name"] for u in by_age] == ["Alice", "Bob", "Charlie"]
assert users[0]["name"] == "Charlie"  # 原列表未变

# 2. list.sort() 就地排序，返回 None
ret = users.sort(key=lambda u: (u["age"], u["name"]))
assert ret is None
assert [u["name"] for u in users] == ["Alice", "Bob", "Charlie"]
```

### 元组（`tuple`）的不可变记录语义、单元素元组逗号语法与内存紧凑优势

尽管 `tuple` 和 `list` 都是有序序列，但在 Python 设计哲学中它们承载着不同的语义角色：

- **`list`（同质可变集合，Homogeneous Sequence）**：通常存放类型相同、数量动态增减的一组数据（如商品列表、日志行列表）。
- **`tuple`（异质不可变记录，Heterogeneous Record）**：通常作为轻量级的无名结构体，其中**每个位置都有固定的业务含义**（如经纬度坐标 `(lat, lon)`、数据库行 `(user_id, username, is_active)`、函数的多返回值）。

**单元素元组的语法核心**：**决定元组的是逗号 `,`，而不是圆括号 `()`！**

- 空元组写作 `()`；
- **单元素元组必须在元素后加尾随逗号：`(42,)` 或 `42,`**。如果写成 `(42)`，圆括号只被当作算术分组括号，结果仍然是整数 `42`！

**`tuple` 相比 `list` 的底层性能与内存优势**：
1. **单块连续内存布局**：`list` 需要分两次分配内存（`PyListObject` 头部 + 独立的动态指针数组 `ob_item`）且预留了超额扩容空槽；而 `tuple`（`PyTupleObject`）长度固定，直接将对象头部与元素指针内联分配在**同一块紧凑的连续内存**中，无任何多余空槽。
2. **常量折叠与自由列表缓存（Freelist）**：像 `(1, 2, 3)` 这样的字面量元组在编译期直接作为常量存入字节码 `co_consts`，运行期零构造开销；且 CPython 内部缓存了小尺寸元组的内存块以加速复用。
3. **可哈希（Hashable）**：只要元组内所有元素都可哈希，元组本身即可作为 `dict` 的复合键或放入 `set` 中。

```python
import sys

# 1. 单元素元组：逗号才是构造元组的关键
not_a_tuple = (42)
single_tuple = (42,)
implicit_tuple = 42,

assert isinstance(not_a_tuple, int) and not_a_tuple == 42
assert isinstance(single_tuple, tuple) and single_tuple == implicit_tuple == (42,)

# 2. 相同元素数量下，tuple 的内存占用总是显著小于 list
sample_tuple = (1, 2, 3, 4, 5)
sample_list = [1, 2, 3, 4, 5]
assert sys.getsizeof(sample_tuple) < sys.getsizeof(sample_list)
```

### 具名元组：`collections.namedtuple` 与 `typing.NamedTuple`

当元组字段超过 2~3 个时，使用下标 `row[0]`、`row[1]` 会严重损害代码可读性。**具名元组（Named Tuple）**是 `tuple` 的子类：它在**保持与普通元组完全相同的轻量内存开销（无实例 `__dict__`）、不可变性以及序列解包能力**的同时，允许通过**点号属性名（`pt.x`）**访问字段。

现代 Python（3.10+）强烈推荐使用 **`typing.NamedTuple`** 类继承语法替代老式的 `collections.namedtuple` 工厂函数，因为它原生支持类型注解、字段默认值、文档字符串与自定义方法：

```python
from typing import NamedTuple


class Endpoint(NamedTuple):
    host: str
    port: int = 443
    use_tls: bool = True

    @property
    def url(self) -> str:
        scheme = "https" if self.use_tls else "http"
        return f"{scheme}://{self.host}:{self.port}"


ep = Endpoint("api.kosmigen.com")

# 1. 既支持属性名访问，也完全兼容普通 tuple 的下标访问与序列解包
assert ep.host == "api.kosmigen.com" and ep.port == 443
assert ep[0] == "api.kosmigen.com"
host, port, tls = ep
assert ep.url == "https://api.kosmigen.com:443"
assert isinstance(ep, tuple)

# 2. 不可变对象更新字段：使用 _replace() 返回修改了指定字段的新实例，_asdict() 转为字典
insecure_ep = ep._replace(port=80, use_tls=False)
assert insecure_ep.url == "http://api.kosmigen.com:80"
assert insecure_ep._asdict() == {"host": "api.kosmigen.com", "port": 80, "use_tls": False}
```

---

## 映射与集合容器：`Dict` 与 `Set`

### 字典（`dict`）的紧凑哈希表结构、插入顺序保证（Python 3.7+）与键的可哈希（Hashable）契约

Python 3.6 重构、**Python 3.7 正式写入语言规范**的**紧凑字典（Compact Dict）**彻底改变了传统开放寻址哈希表内存稀疏、无序的缺点。它将哈希表拆分为两个数组：

1. **稀疏哈希索引表（`dk_indices`）**：一个仅存储小整数下标（根据容量自动采用 1 / 2 / 4 / 8 字节整数）的哈希桶数组，初始大小为 8；
2. **紧凑条目数组（`dk_entries`）**：按**键的插入先后顺序**连续紧密排列 `[hash, key_ptr, value_ptr]` 条目。

```
逻辑视图: {"host": "localhost", "port": 8080}

1. 稀疏哈希桶 dk_indices (只存紧凑数组的下标，-1 表示空桶):
   [ -1 |  0 | -1 | -1 |  1 | -1 | -1 | -1 ]
           │              └──────────────────────┐
           ▼                                     ▼
2. 紧凑条目数组 dk_entries (严格按插入顺序连续追加):
   Index 0: [ hash("host") | key="host" | val="localhost" ]
   Index 1: [ hash("port") | key="port" | val=8080        ]
```

这一精妙设计带来了三大收益：
- **内存体积暴降 20%~25%**；
- **天然保留键的首次插入顺序（Insertion Order Preserved）**，且迭代时直接顺序扫描紧凑数组 `dk_entries`，无需跳过空哈希桶，遍历速度大幅提升（注意：**对已存在的键重新赋新值不会改变其原有的插入顺序**；删除后再重新插入则会排到末尾）；
- 查找、插入、删除的平均时间复杂度均为 **$O(1)$**。

**键的可哈希（Hashable）契约**：
能够作为 `dict` 的键（或 `set` 的元素）的对象必须**可哈希**，即满足两条铁律：
1. 实现了 `__hash__()` 方法（返回一个在整个对象生命周期内**永不改变**的 `int`）与 `__eq__()` 方法；
2. **若 `a == b`，则必须满足 `hash(a) == hash(b)`**。

因此，内置不可变类型（`int`, `float`, `str`, `bytes`, `frozenset`, 以及仅包含可哈希元素的 `tuple`）都是可哈希的；而所有内置可变容器（`list`, `dict`, `set`, `bytearray`）都将 `__hash__` 设为了 `None`，尝试用作字典键会立即抛出 `TypeError: unhashable type`。

### 字典核心操作：`get`、`setdefault`、动态视图对象（`keys` / `values` / `items`）与合并运算符（`|` / `|=`）

- **安全读取 `d.get(key, default=None)`**：键不存在时返回 `default`（不抛 `KeyError`，也不修改字典）。
- **缺失时初始化并返回 `d.setdefault(key, default=None)`**：若 `key` 存在则直接返回对应值；若不存在则先将 `d[key] = default` 写入字典，再返回 `default`。
- **安全删除 `d.pop(key[, default])`**：删除并返回对应值；提供 `default` 时即使键不存在也不会抛 `KeyError`。
- **动态字典视图（Dictionary Views）**：`d.keys()`、`d.values()`、`d.items()` 返回的不是静态列表拷贝，而是 $O(1)$ 的**动态窗口视图对象**——当底层字典发生变化时，视图会实时反映最新内容！此外，**`d.keys()` 和（当值全部可哈希时的）`d.items()` 原生支持集合的交 `&`、并 `|`、差 `-`、对称差 `^` 运算**。
- **字典合并运算符 `|` 与 `|=`（Python 3.9+，PEP 584）**：`d1 | d2` 返回合并后的新字典；`d1 |= d2` 就地更新 `d1`（等价于 `d1.update(d2)`）。当遇到重复键时，**右侧字典的值覆盖左侧**。

```python
defaults = {"host": "127.0.0.1", "port": 8000, "debug": False}
custom = {"port": 9000, "workers": 4}

# 1. Python 3.9+ 字典合并运算符 | （右侧覆盖左侧同名键）
merged = defaults | custom
assert merged == {"host": "127.0.0.1", "port": 9000, "debug": False, "workers": 4}

# 2. 动态视图的实时联动与集合代数运算
keys_view = merged.keys()
assert ("timeout" in keys_view) is False
merged["timeout"] = 30
assert ("timeout" in keys_view) is True  # 视图实时感知底层字典变化！

# 利用 keys() 视图求两个字典的公共键与新增键
assert (defaults.keys() & custom.keys()) == {"port"}
assert (custom.keys() - defaults.keys()) == {"workers"}
```

!!! warning "注意：不要在遍历字典的同时增删字典的键"
    在 `for k in d:` 循环体内直接新增或删除 `d` 的键会破坏哈希表迭代游标，立即触发 `RuntimeError: dictionary changed size during iteration`。若需在遍历中按条件删除键，应先对键做一次静态快照拷贝：`for k in list(d):`（或直接用字典推导式构造新字典）。

### 标准库映射增强：`defaultdict`、`Counter` 与 `ChainMap` 概览

在编写分组聚合、频次统计或多层配置回退逻辑时，`collections` 模块中的三个 `dict` 子类/封装器能极大简化代码：

| 工具类 | 核心机制 | 典型应用场景 |
| :--- | :--- | :--- |
| `collections.defaultdict(default_factory)` | 访问不存在的键 `d[k]` 时，自动调用无参工厂函数 `default_factory()`（如 `list`, `set`, `int`）生成默认值并存入字典 | 一对多分组聚合（彻底告别繁琐的 `if k not in d:` 或每次都构造新空列表的 `d.setdefault(k, [])`） |
| `collections.Counter([iterable-or-mapping])` | 专用于计数：缺失键访问默认返回 `0`（且不自动写入字典）；提供 `.most_common(n)` Top-K 统计及多重集合加减交并运算 | 词频统计、Top-K 排行榜、判断两个序列是否为字母异位词（Anagram） |
| `collections.ChainMap(*maps)` | 将多个字典在逻辑上串联为一个单一映射视图（**零拷贝合并**），读取时按从左到右顺序查找，写入/删除默认只作用于第一个字典 | 多级配置优先级回退（如：`命令行参数 -> 环境变量 -> 配置文件 -> 默认配置`） |

```python
from collections import ChainMap, Counter, defaultdict

# 1. defaultdict(list) 实现优雅的一对多分组
records = [("backend", "Alice"), ("frontend", "Bob"), ("backend", "Charlie")]
groups: defaultdict[str, list[str]] = defaultdict(list)
for dept, name in records:
    groups[dept].append(name)
assert groups["backend"] == ["Alice", "Charlie"]
assert groups["qa"] == []  # 自动调用 list() 初始化

# 2. Counter 频次统计与 Top-K
words = ["apple", "banana", "apple", "cherry", "banana", "apple"]
counts = Counter(words)
assert counts["apple"] == 3 and counts["missing"] == 0
assert counts.most_common(2) == [("apple", 3), ("banana", 2)]

# 3. ChainMap 零拷贝多级配置优先级查询
cli_args = {"debug": True}
env_vars = {"port": 9090, "debug": False}
default_cfg = {"host": "0.0.0.0", "port": 8080, "debug": False}
config = ChainMap(cli_args, env_vars, default_cfg)
assert (config["host"], config["port"], config["debug"]) == ("0.0.0.0", 9090, True)
```

### 集合（`set`）与不可变集合（`frozenset`）：去重机制与集合代数运算（交 `&`、并 `|`、差 `-`、对称差 `^`）

`set`（可变集合）与 `frozenset`（不可变且可哈希的集合）底层同样基于哈希表实现（相当于只存 Key、不存 Value 的字典）。其元素必须**可哈希（Hashable）**且**天然唯一、无序（不保证插入顺序）**，成员检测 `x in s` 的平均时间复杂度为 **$O(1)$**。

- **创建空集合的语法陷阱**：`{}` 创建的是**空字典（`dict`）**！创建空可变集合**必须写 `set()`**。
- **保序去重技巧**：由于 `set(items)` 不保证保留原序列的元素首次出现顺序，若需要**严格保序去重**，应利用 Python 3.7+ 字典保序特性写 **`list(dict.fromkeys(items))`**。

**集合代数与子集/超集比较运算符汇总**：

| 运算名称 | 运算符（要求两侧均为集合） | 等价方法（参数可为任意 `Iterable`） | 数学含义 |
| :--- | :--- | :--- | :--- |
| **并集（Union）** | `a \| b`（就地更新：`a \|= b`） | `a.union(b)` | 属于 `a` **或**属于 `b` 的所有元素 |
| **交集（Intersection）** | `a & b`（就地更新：`a &= b`） | `a.intersection(b)` | **同时**属于 `a` 和 `b` 的公共元素 |
| **差集（Difference）** | `a - b`（就地更新：`a -= b`） | `a.difference(b)` | 属于 `a` 但**不属于** `b` 的元素 |
| **对称差集（Symmetric Diff）** | `a ^ b`（就地更新：`a ^= b`） | `a.symmetric_difference(b)` | 仅属于其中一个集合、**不同时属于两者**的元素（异或） |
| **子集 / 真子集** | `a <= b` / `a < b` | `a.issubset(b)` | `a` 的所有元素是否都在 `b` 中 |
| **超集 / 真超集** | `a >= b` / `a > b` | `a.issuperset(b)` | `a` 是否包含 `b` 的所有元素 |
| **不相交判定** | - | `a.isdisjoint(b)` | 两个集合的交集是否为空（发现首个公共元素即短路返回 `False`，比 `len(a & b) == 0` 快得多） |

```python
s1 = {1, 2, 3, 4}
s2 = {3, 4, 5, 6}

assert (s1 | s2) == {1, 2, 3, 4, 5, 6}   # 并集
assert (s1 & s2) == {3, 4}               # 交集
assert (s1 - s2) == {1, 2}               # 差集
assert (s1 ^ s2) == {1, 2, 5, 6}         # 对称差集
assert {1, 2} < s1                       # 真子集

# 保序去重标准范式
raw_items = ["b", "a", "c", "a", "b", "d"]
assert list(dict.fromkeys(raw_items)) == ["b", "a", "c", "d"]

# frozenset 自身可哈希，可作为外层 set 的元素或 dict 的键
matrix_Visited = {frozenset({(0, 0), (0, 1)})}
assert len(matrix_Visited) == 1
```

---

## 切片协议与序列 / 映射解包（`*` / `**`）

### 切片语法 `[start:stop:step]`、负索引边界容错、`slice` 对象与列表切片赋值

Python 所有内置序列（`str`, `bytes`, `bytearray`, `list`, `tuple`, `range`, `memoryview`）均遵循统一的**切片协议（Slicing Protocol）**：`seq[start:stop:step]`。

- **左闭右开区间 `[start, stop)`**：包含 `start` 索引，**不包含 `stop` 索引**。当 `step > 0` 时，切片元素个数直观等于 `stop - start`（在边界内时），且两个相邻切片 `seq[:k] + seq[k:] == seq` 恒成立。
- **负索引与越界自动截断容错**：负索引 `-k` 等价于 `len(seq) - k`（`-1` 即最后一个元素）。单独用下标 `seq[999]` 越界会抛出 `IndexError`，但**切片操作 `seq[100:999]` 永远不会抛 `IndexError`**，它会自动将起止边界截断到序列有效范围内（越界时优雅返回空序列）。
- **逆序步长 `step < 0`**：当 `step` 为负数（如 `seq[::-1]` 反转序列）时，默认从右向左遍历（此时 `start` 默认为末尾 `-1`，`stop` 默认为头部之前）。
- **命名切片对象 `slice(start, stop, step)`**：语法糖 `seq[a:b:c]` 在底层其实就是传入了一个内置 `slice(a, b, c)` 实例，即 `seq.__getitem__(slice(a, b, c))`。解析固定宽度文本报表时，可以将 `slice` 对象赋给具名常量复用。
- **可变列表的切片赋值与切片删除**：对 `list` 的切片位于等号左侧（`lst[a:b] = iterable`）时，会直接**就地替换、插入或删除**原列表的对应区段（当指定了非 1 步长 `lst[a:b:step] = iterable` 时，右侧元素个数必须与该扩展切片选中的槽位数严格相等，否则抛 `ValueError`）。

```python
nums = [0, 10, 20, 30, 40, 50]

# 1. 常用切片与越界容错
assert nums[1:4] == [10, 20, 30]
assert nums[-3:] == [30, 40, 50]
assert nums[::-1] == [50, 40, 30, 20, 10, 0]
assert nums[100:200] == []  # 切片越界不抛异常，返回空列表

# 2. 使用命名 slice 对象告别“魔术数字”硬编码
RECORD = "2026-11-25ORD-9981  SUCCESS"
DATE_SLICE = slice(0, 10)
ORDER_SLICE = slice(10, 20)
STATUS_SLICE = slice(20, None)
assert (RECORD[DATE_SLICE], RECORD[ORDER_SLICE].strip(), RECORD[STATUS_SLICE]) == (
    "2026-11-25",
    "ORD-9981",
    "SUCCESS",
)

# 3. 列表切片就地替换与清空
data = [1, 2, 3, 4, 5]
data[1:4] = [20, 30]        # 将索引 1~3 的三个元素替换为两个元素（长度可伸缩）
assert data == [1, 20, 30, 5]
data[:] = []                # 就地清空列表（等价于 data.clear()，保持原 list 的 id 不变）
assert data == []
```

### 序列解包（Unpacking）、平行赋值与星号表达式（`*rest`）贪婪捕获

**可迭代对象解包（Iterable Unpacking）**允许将右侧**任意可迭代对象**（不限于元组或列表，也可以是字符串、集合、字典键、生成器等）的元素一次性解构并绑定到左侧的多个变量名上。

- **平行赋值与原地变量交换**：`a, b = b, a` 的执行顺序是：**先将等号右侧完全求值打包为一个临时元组 `(b, a)`**，再按顺序解包绑定给左侧的 `a` 和 `b`（在 CPython 字节码中直接通过栈顶元素交换指令 `SWAP` 完成，甚至无需真正分配元组内存），因此无需任何临时变量 `temp`。
- **星号表达式 `*rest` 贪婪捕获（PEP 3132）**：当左侧变量个数少于右侧元素个数（或长度未知）时，可以在左侧使用**最多一个带 `*` 的变量**来贪婪捕获所有剩余元素。**注意：无论匹配到多个、1 个还是 0 个元素，`*rest` 绑定的结果永远是一个 `list`！**

```python
# 1. 原地平行交换（右侧先完全求值，再绑定左侧）
a, b = 1, 2
a, b = b, a + b
assert (a, b) == (2, 3)

# 2. 带星号 * 的贪婪捕获：结果永远是 list
first, *middle, last = (10, 20, 30, 40, 50)
assert first == 10 and last == 50
assert middle == [20, 30, 40]  # 即使右侧是 tuple，*middle 解包出来也是 list！

# 当剩余元素为 0 个时，*rest 得到空列表 []
head, *empty_mid, tail = ["only_two", "items"]
assert (head, empty_mid, tail) == ("only_two", [], "items")
```

### 嵌套结构解包与下划线 `_` 占位惯用法

解包语法支持**任意层级的嵌套结构匹配**：只要左侧的括号/列表嵌套形状与右侧数据结构一致，即可一步到位提取深层字段。

对于解包过程中不需要使用的字段，Python 社区约定使用单下划线 **`_`**（或带星号的 **`*_`**）作为丢弃占位变量（Throwaway Variable）：

```python
# 1. 嵌套结构一步解包（不仅可用于赋值，也可直接写在 for 循环头部）
user_record = ("USR-001", "Alice", ("Shanghai", (31.2304, 121.4737)))
user_id, _, (city, (lat, lon)) = user_record

assert user_id == "USR-001"
assert city == "Shanghai"
assert (lat, lon) == (31.2304, 121.4737)

# 2. 使用 *_ 忽略中间所有无关字段，只取首尾
header, *_, checksum = ["MAGIC", "v1", "payload_1", "payload_2", "0xABCD"]
assert (header, checksum) == ("MAGIC", "0xABCD")
```

!!! warning "注意：在国际化（i18n）或交互式 REPL 中注意 `_` 的命名冲突"
    在 Python 交互式解释器（REPL）中，`_` 默认会自动保存上一条表达式的计算结果；而在使用 `gettext` 进行多语言国际化翻译的项目中，通常会将翻译函数导入为 `from gettext import gettext as _`。在这类模块中如果将丢弃变量命名为 `_` 会覆盖掉翻译函数，此时推荐使用 `_ignored` 或 `unused_`。

### 函数调用与容器字面量中的 `*` 可迭代解包与 `**` 映射解包合并

PEP 448（Python 3.5+）极大地扩展了 `*`（可迭代对象解包）和 `**`（字典/映射解包）的使用边界——它们不仅能在函数调用时展开位置参数和关键字参数，还能在**列表 `[...]`、元组 `(...)`、集合 `{...}` 和字典 `{k: v}` 字面量内部出现任意多次**：

```python
# 1. 在容器字面量中多次使用 * 解包拼接多个可迭代对象
part_a = [1, 2]
part_b = (3, 4)
combined_list = [0, *part_a, *part_b, *range(5, 7)]
combined_set = {*part_a, *part_b, 2, 3}

assert combined_list == [0, 1, 2, 3, 4, 5, 6]
assert combined_set == {1, 2, 3, 4}

# 2. 在字典字面量中多次使用 ** 解包合并（后出现的同名键覆盖先出现的键）
base_headers = {"Accept": "application/json", "User-Agent": "Kosmigen/1.0"}
auth_headers = {"Authorization": "Bearer token_xyz"}
final_headers = {
    **base_headers,
    **auth_headers,
    "User-Agent": "Kosmigen/2.0",  # 显式覆盖
}
assert final_headers == {
    "Accept": "application/json",
    "User-Agent": "Kosmigen/2.0",
    "Authorization": "Bearer token_xyz",
}

# 3. 在函数调用中同时展开 *args 与 **kwargs
def connect(host: str, port: int, *, timeout: int = 10, ssl: bool = True) -> str:
    return f"{host}:{port} (timeout={timeout}, ssl={ssl})"

addr = ("db.internal", 5432)
opts = {"timeout": 5, "ssl": False}
assert connect(*addr, **opts) == "db.internal:5432 (timeout=5, ssl=False)"
```

---

## 练习与实战

### 练习 1：修复金融订单金额汇总中的 `float` 精度丢失 Bug

某电商结算模块使用 `float` 计算多笔含折扣商品的订单应收总额，在与支付网关返回的实付金额 `0.30` 元核对时意外触发了金额不一致告警（因为 `0.1 + 0.2 == 0.30000000000000004`）。

请实现一个高精度订单汇总函数 `calculate_order_total(items: list[tuple[str, int, str]]) -> Decimal`：
- 输入 `items` 中每项为 `(单价字符串, 购买数量, 折扣率字符串)`，例如 `[("19.99", 3, "0.85"), ("0.10", 1, "1.00"), ("0.20", 1, "1.00")]`；
- 每件商品的小计金额定义为 `单价 * 数量 * 折扣率`，并**先按传统四舍五入（`ROUND_HALF_UP`）保留到“分”（小数点后两位 `0.01`）**，最后将所有商品小计相加返回 `Decimal` 总额。

??? success "点击查看答案与解析"
    **解析：**
    金融计算有两条铁律：
    1. 绝不使用二进制 `float` 累加金额，也绝不把 `float` 直接传给 `Decimal(0.1)`；必须始终使用**字符串**或**整数（以分为单位）**构造 `Decimal`。
    2. `Decimal` 默认的舍入模式是 `ROUND_HALF_EVEN`（银行家舍入：四舍六入五成双），若业务规则要求国内财务常见的“四舍五入”，应在 `.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)` 中显式指定 `ROUND_HALF_UP`。

    ```python
    from decimal import Decimal, ROUND_HALF_UP

    CENT = Decimal("0.01")


    def calculate_order_total(items: list[tuple[str, int, str]]) -> Decimal:
        total = Decimal("0.00")
        for unit_price_str, qty, discount_str in items:
            raw_subtotal = Decimal(unit_price_str) * qty * Decimal(discount_str)
            subtotal = raw_subtotal.quantize(CENT, rounding=ROUND_HALF_UP)
            total += subtotal
        return total


    # 测试 1：彻底消除 0.1 + 0.2 != 0.3 的 IEEE 754 精度陷阱
    simple_order = [("0.10", 1, "1.00"), ("0.20", 1, "1.00")]
    assert calculate_order_total(simple_order) == Decimal("0.30")

    # 测试 2：19.99 * 3 * 0.85 = 50.9745 -> 四舍五入为 50.97；加上 0.30 合计 51.27
    complex_order = [("19.99", 3, "0.85"), *simple_order]
    assert calculate_order_total(complex_order) == Decimal("51.27")
    ```

### 练习 2：基于 PEP 750 `t-string` 设计防 SQL 注入的参数化查询构建器

如果直接用 `f-string` 拼接 SQL 语句 `f"SELECT * FROM users WHERE role = {role} AND age >= {min_age}"`，当攻击者传入 `role = "'admin' OR '1'='1"` 时就会造成严重的 SQL 注入漏洞。

请借助 PEP 750 的 `Template` 与 `Interpolation` 数据结构，编写一个安全的参数化 SQL 构建函数 `build_sql_query(template: Template) -> tuple[str, tuple[object, ...]]`：
- 将模板中的所有静态 SQL 片段原样保留；
- 将每个 `Interpolation` 动态插值位置自动替换为数据库驱动的标准占位符 `?`，并将其原始求值对象 `item.value` 收集到参数元组中一并返回。

??? success "点击查看答案与解析"
    **解析：**
    这正是 Python 3.14 引入 PEP 750 `t-string` 的核心驱动力之一：通过将静态模板文本（`str`）与动态插值对象（`Interpolation`）解耦，数据库 ORM 或驱动层可以自动把每一次插值转化为安全的参数化占位符 `?`（或 `$1, $2`），让攻击者输入的单引号永远只作为纯数据参数传给数据库引擎，从根源上杜绝拼接式 SQL 注入。

    ```python
    try:
        from string.templatelib import Interpolation, Template
    except ImportError:
        from dataclasses import dataclass
        from typing import Any

        @dataclass(frozen=True)
        class Interpolation:
            value: Any
            expression: str = ""
            conversion: str | None = None
            format_spec: str = ""

        class Template:
            def __init__(self, *args: str | Interpolation) -> None:
                self._items = args

            def __iter__(self):
                return iter(self._items)


    def build_sql_query(template: Template) -> tuple[str, tuple[object, ...]]:
        sql_parts: list[str] = []
        params: list[object] = []
        for item in template:
            if isinstance(item, str):
                sql_parts.append(item)
            elif isinstance(item, Interpolation):
                sql_parts.append("?")
                params.append(item.value)
        return "".join(sql_parts), tuple(params)


    malicious_role = "guest' OR '1'='1"
    min_age = 18

    # Python 3.14+ 原生写法：
    # query_tpl = t"SELECT id, name FROM users WHERE role = {malicious_role} AND age >= {min_age}"
    query_tpl = Template(
        "SELECT id, name FROM users WHERE role = ",
        Interpolation(malicious_role, "malicious_role"),
        " AND age >= ",
        Interpolation(min_age, "min_age"),
    )

    sql, bind_params = build_sql_query(query_tpl)
    assert sql == "SELECT id, name FROM users WHERE role = ? AND age >= ?"
    assert bind_params == ("guest' OR '1'='1", 18)
    ```

### 练习 3：利用序列解包、`defaultdict` 与集合运算分析接口访问日志

给定一组网关访问日志列表 `logs`，每条日志是一个格式固定的元组：
`(timestamp, client_ip, http_method, path, status_code, *extra_tags)`（注意：末尾的 `extra_tags` 可能有 0 个、1 个或多个标签元素）。

请编写一个分析函数 `analyze_access_logs(logs: list[tuple]) -> dict`，利用**序列星号解包**、**`defaultdict(set)`** 和**集合交/差集运算**，一次性完成以下三项统计并返回字典：
1. `"unique_ips_per_path"`：每个请求路径 `path` 对应的去重访问 IP 集合（`dict[str, set[str]]`）；
2. `"error_ips"`：所有触发过 `status_code >= 500` 的客户端 IP 集合；
3. `"normal_only_ips"`：访问过系统、但**从未触发过任何 `status_code >= 500` 错误**的客户端 IP 集合。

??? success "点击查看答案与解析"
    **解析：**
    1. 每条元组末尾包含不定长的 `extra_tags`，在 `for` 循环头部直接使用 `_, ip, _, path, status, *_ = entry` 即可利用 `*_` 优雅忽略首尾无关项及变长标签。
    2. 使用 `defaultdict(set)` 可以直接执行 `path_ips[path].add(ip)`，自动完成每个路径下的 IP 去重聚合。
    3. 收集全量 IP 集合 `all_ips` 与错误 IP 集合 `error_ips` 后，利用集合差集运算 `all_ips - error_ips` 即可在 $O(N)$ 时间内算出从未触发过 5xx 错误的纯净 IP 集合。

    ```python
    from collections import defaultdict


    def analyze_access_logs(logs: list[tuple]) -> dict[str, object]:
        path_ips: defaultdict[str, set[str]] = defaultdict(set)
        all_ips: set[str] = set()
        error_ips: set[str] = set()

        for _, ip, _, path, status, *_ in logs:
            path_ips[path].add(ip)
            all_ips.add(ip)
            if status >= 500:
                error_ips.add(ip)

        return {
            "unique_ips_per_path": dict(path_ips),
            "error_ips": error_ips,
            "normal_only_ips": all_ips - error_ips,
        }


    sample_logs = [
        ("10:00:01", "10.0.0.1", "GET", "/api/orders", 200),
        ("10:00:02", "10.0.0.2", "POST", "/api/orders", 502, "retry", "upstream_timeout"),
        ("10:00:03", "10.0.0.1", "GET", "/api/orders", 200, "cached"),
        ("10:00:04", "10.0.0.3", "GET", "/api/users", 200),
        ("10:00:05", "10.0.0.2", "GET", "/api/users", 200),
    ]

    report = analyze_access_logs(sample_logs)
    assert report["unique_ips_per_path"] == {
        "/api/orders": {"10.0.0.1", "10.0.0.2"},
        "/api/users": {"10.0.0.2", "10.0.0.3"},
    }
    assert report["error_ips"] == {"10.0.0.2"}
    assert report["normal_only_ips"] == {"10.0.0.1", "10.0.0.3"}
    ```
