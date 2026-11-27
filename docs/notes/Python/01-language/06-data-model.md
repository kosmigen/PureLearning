# 数据模型与魔术方法

如果说语法决定了代码“长什么样”，那么 **Python 数据模型（Data Model）** 则决定了你编写的对象能否像内置的 `list`、`dict`、`int` 一样，自然地融入语言生态（支持 `len(obj)`、`obj[i]`、`a + b`、`for x in obj`、`with obj:`）。Python 数据模型的本质是一套基于**双下划线魔术方法（Dunder Methods）**的隐式接口协议：程序员在类中实现特定的魔术方法，Python 解释器则在面对内置函数与运算符时自动触发对应的底层槽位分派。

---

## Python 数据模型与协议设计哲学

### 双下划线魔术方法（Dunder / Special Methods）在 Python 一致性设计中的核心地位

以双下划线开头并结尾的方法（如 `__getitem__`、`__len__`，社区简读为 **"Dunder"**，即 *Double UNDERscore*）构成了 Python 语言惊人一致性的源泉：

- 在没有统一数据模型的语言中，获取不同容器的长度可能需要分别调用 `arr.length`、`list.size()`、`str.len()` 或 `dict.count()`；
- 而在 Python 中，所有容器统一通过顶层内置函数 `len(x)` 获取长度，所有可迭代对象统一通过 `iter(x)` 开启迭代。你自定义的类只要实现了 `__len__`，就能无缝接入标准库及第三方库中所有期待序列/集合的函数，这种“只要行为符合协议即可互操作”的设计就是**结构化协议（Structural Protocol / Duck Typing）**的精髓。

### 内置函数（`len()`、`str()`、`iter()`）与底层 C 结构体槽位（Type Slots）的委托映射

为什么在业务代码中我们应该调用内置函数 `len(obj)`、`repr(obj)`，而不是直接手动调用 `obj.__len__()`、`obj.__repr__()`？

!!! note "底层原理：CPython `PyTypeObject` 函数指针槽位（Type Slots）"
    在 CPython 底层，每个类型（对应 C 结构体 `PyTypeObject`）都拥有一组固定偏移量的 C 函数指针槽位（如 `sq_length`、`tp_repr`、`tp_iter`、`nb_add`）：
    
    1. **对于内置类型（如 `list`、`dict`、`str`）**：调用 `len(my_list)` 时，CPython 根本不会在字典里查找 `"__len__"` 字符串，而是直接以 $O(1)$ 的 C 指针解引用读取 `PyVarObject.ob_size` 字段，速度极快；
    2. **对于自定义 Python 类**：在 `class` 创建期，解释器会自动把类中定义的 `__len__` 绑定到该类 `PyTypeObject` 的 `sq_length` 槽位上。调用 `len(custom_obj)` 时，解释器直接在类（`type(obj)`）的 C 槽位上发起调用，不仅比通过实例属性查找 `obj.__len__()` 更快，而且能绕过实例 `__dict__` 中同名普通属性的干扰！

| 高层内置操作 / 语法 | 底层 C 类型结构体槽位 | 委托调用的 Python 魔术方法 |
| :--- | :--- | :--- |
| `len(obj)` | `tp_as_sequence->sq_length` / `mp_length` | `type(obj).__len__(obj)` |
| `repr(obj)` / `str(obj)` | `tp_repr` / `tp_str` | `type(obj).__repr__(obj)` / `__str__(obj)` |
| `hash(obj)` | `tp_hash` | `type(obj).__hash__(obj)` |
| `bool(obj)` | `tp_as_number->nb_bool` (回退 `sq_length`) | `type(obj).__bool__(obj)` (回退 `__len__`) |
| `obj[key]` | `tp_as_mapping->mp_subscript` | `type(obj).__getitem__(obj, key)` |
| `a + b` | `tp_as_number->nb_add` | `type(a).__add__(a, b)` / `type(b).__radd__(b, a)` |
| `func(*args)` | `tp_call` | `type(func).__call__(func, *args)` |

---

## 对象生命周期：`__new__`、`__init__` 与 `__del__`

### `__new__(cls, *args, **kwargs)`：内存分配、返回实例对象与静态/类方法特性

`__new__` 是对象实例化过程中**第一个被调用的方法**，它是真正的**构造器（Constructor）**，负责在堆内存中分配并返回一个新实例：

- **特殊的隐式静态方法**：虽然 `__new__` 不用写 `@staticmethod` 装饰器，但它在底层被特殊处理为静态方法，第一个参数固定显式传入当前要实例化的类 **`cls`**；
- **必须返回实例**：`__new__` 通常通过调用 `super().__new__(cls)` 向顶层 `object.__new__(cls)` 申请内存并返回创建好的空白实例 `instance`；
- **控制 `__init__` 是否执行**：只有当 `__new__` 返回的对象确实是当前 `cls`（或其子类）的实例时，解释器才会紧接着自动调用 `cls.__init__(instance, *args, **kwargs)`；若 `__new__` 返回了其他无关类型的对象或 `None`，则 `__init__` **根本不会被触发**。

### `__init__(self, *args, **kwargs)`：实例属性初始化与必须返回 `None` 的约束

`__init__` 是对象的**初始化器（Initializer）**。此时实例已经由 `__new__` 分配完毕并通过首参 `self` 传入，`__init__` 的职责仅仅是向 `self` 绑定初始属性或校验入参。

**硬性约束**：`__init__` **绝不能返回除 `None` 以外的任何值**！一旦在 `__init__` 中写了 `return some_obj`，运行期将立即抛出 `TypeError: __init__() should return None, not '...'`。

### `__new__` 的高阶应用场景：继承不可变内置类型（`int` / `str` / `tuple`）、单例模式与对象池

绝大多数普通类只需编写 `__init__`，无需触碰 `__new__`。但以下两类高阶场景**必须通过重写 `__new__` 实现**：

1. **继承不可变内置类型（如 `int`、`str`、`float`、`tuple`、`bytes`）**：不可变对象的数据在 `__new__` 内存分配完毕那一刻就已经固化成型，等到进入 `__init__` 时已经无法再修改其自身值了。因此定制不可变子类必须在 `__new__` 中先对入参完成转换，再传给 `super().__new__(cls, transformed_val)`。
2. **单例模式（Singleton）或轻量级享元对象池（Flyweight / Interning）**：在 `__new__` 中检查类级缓存字典，若目标实例已存在则直接返回缓存中的旧实例，避免重复分配内存。

```python
# 场景 1：继承不可变 str，在 __new__ 中强制将字符串归一化为全大写并去除首尾空白
class UpperIdentifier(str):
    def __new__(cls, raw: str) -> "UpperIdentifier":
        normalized = raw.strip().upper()
        return super().__new__(cls, normalized)


uid = UpperIdentifier("  usr_9527 ")
assert uid == "USR_9527" and isinstance(uid, str)


# 场景 2：利用 __new__ 实现按键驻留（Interning）的享元对象池
class Symbol:
    _pool: dict[str, "Symbol"] = {}

    def __new__(cls, name: str) -> "Symbol":
        if name not in cls._pool:
            instance = super().__new__(cls)
            instance.name = name
            cls._pool[name] = instance
        return cls._pool[name]


s1 = Symbol("OK")
s2 = Symbol("OK")
assert s1 is s2  # 命中对象池，返回完全相同的内存实例
```

### `__del__(self)` 析构器（Finalizer）的触发时机不确定性、循环引用风险与 `weakref.finalize` 推荐替代方案

`__del__(self)` 被称为对象的**终结器（Finalizer）**，它**不等于** `del x` 语句！执行 `del x` 只是从当前作用域删除变量名 `x` 并令目标对象的引用计数减 1；只有当对象的引用计数彻底归零（或被分代垃圾回收器 GC 判定为不可达垃圾）、即将被回收内存的前一刻，解释器才会触发 `obj.__del__()`。

!!! warning "注意：工程中应严禁使用 `__del__` 管理外部资源"
    1. **触发时机完全不确定**：在非引用计数实现（如 PyPy）或存在复杂容器引用时，`__del__` 何时执行、甚至在解释器退出时是否一定执行都无法保证；
    2. **对象复活（Object Resurrection）与 GC 隐患**：如果在 `__del__` 中不小心把 `self` 重新赋给了某个全局列表，会导致即将销毁的对象诡异“复活”；在早期版本或复杂带 `__del__` 的循环引用链中还会干扰垃圾回收；
    3. **异常静默吞噬**：`__del__` 内部抛出的任何异常都不会向上传递，仅会向 `sys.stderr` 打印一行警告。

**工程标准替代方案**：
- 对于文件、数据库连接、网络连接、锁等需要确定性释放的资源，**必须实现上下文管理器协议（`__enter__` / `__exit__`）并配合 `with` 语句使用**；
- 若确实需要在对象被 GC 回收时执行兜底清理回调，应使用标准库的 **`weakref.finalize(obj, func, *args)`**（它的回调函数不持有 `obj` 本身的引用，彻底杜绝了对象复活与循环引用问题）。

```python
import gc
import weakref

cleaned_log: list[str] = []


class TempBuffer:
    def __init__(self, buf_id: str) -> None:
        self.buf_id = buf_id
        # 注册安全的弱引用终结回调（注意：回调函数的参数不能传入 self 本身！）
        self._finalizer = weakref.finalize(self, cleaned_log.append, f"released:{buf_id}")


buf = TempBuffer("buf_01")
del buf
gc.collect()
assert cleaned_log == ["released:buf_01"]
```

---

## 字符串表示与格式化协议：`__repr__`、`__str__`、`__format__` 与 `__bytes__`

### `__repr__`（面向开发者与调试，追求明确无歧义）与 `__str__`（面向终端用户，追求可读性）的职责分野

Python 为对象的文本化表达精心设计了双轨制：

| 魔术方法 | 触发入口 | 目标受众 | 设计准则与格式规范 |
| :--- | :--- | :--- | :--- |
| `__repr__(self) -> str` | `repr(obj)`、交互式 REPL 直接求值、调试器日志、以及 `f"{obj!r}"` | **开发者（Developer / Debugging）** | **追求明确无歧义（Unambiguous）**。尽可能返回合法的 Python 构造表达式（如 `"Point(x=1, y=2)"`）；若无法写成构造式，则用尖括号包裹关键标识（如 `"<Connection host='10.0.0.1' closed=False>"`） |
| `__str__(self) -> str` | `str(obj)`、`print(obj)`、`f"{obj}"` / `f"{obj!s}"` | **终端用户（End User / UI）** | **追求自然可读与简洁（Readable）**。无需展示底层类型名，直接输出人类友好的业务文本（如 `"(1, 2)"` 或 `"2026-11-25"`） |

### 缺失 `__str__` 时自动回退到 `__repr__` 以及容器打印内部元素固定调用 `__repr__` 的规则

理解 `__repr__` 与 `__str__` 的两条黄金联动规则：

1. **回退机制（Fallback）**：如果一个类**只实现了 `__repr__` 而没有实现 `__str__`**，那么当调用 `str(obj)` 或 `print(obj)` 时，Python 会**自动回退调用 `__repr__`**！反之则不成立（若只写了 `__str__` 没写 `__repr__`，`repr(obj)` 只会输出 `<MyClass object at 0x...>`）。**工程铁律：如果你只打算写一个字符串表示方法，永远优先实现 `__repr__`！**
2. **容器内部元素固定调用 `__repr__`**：当你执行 `print([obj1, obj2])` 或 `print({"k": obj1})` 时，虽然外层列表/字典被 `print()` 调用了 `str()`，但**所有内置容器（`list`、`tuple`、`dict`、`set`）在拼接其内部元素的字符串时，一律强制调用元素的 `__repr__`**，以防止列表中的字符串 `"1, 2"` 与两个整数 `1, 2` 产生视觉歧义！

```python
class Coordinate:
    def __init__(self, lat: float, lon: float) -> None:
        self.lat, self.lon = lat, lon

    def __repr__(self) -> str:
        return f"Coordinate(lat={self.lat!r}, lon={self.lon!r})"

    def __str__(self) -> str:
        return f"({self.lat}°N, {self.lon}°E)"


loc = Coordinate(31.23, 121.47)
assert str(loc) == "(31.23°N, 121.47°E)"
assert repr(loc) == "Coordinate(lat=31.23, lon=121.47)"
# 注意：容器转为 str 时，其内部元素固定调用 __repr__！
assert str([loc]) == "[Coordinate(lat=31.23, lon=121.47)]"
```

### `__format__(self, format_spec)` 接入 `f-string` / `format()` 自定义格式规范与 `__bytes__`

- **`__format__(self, format_spec: str) -> str`**：当对象出现在 `f"{obj:format_spec}"` 或 `format(obj, format_spec)` 中时被触发，其中冒号后面的格式描述符原样作为字符串传入 `format_spec`（若未写冒号则传入空字符串 `""`，此时应默认返回 `str(self)`）。
- **`__bytes__(self) -> bytes`**：由内置函数 `bytes(obj)` 触发，定义对象如何直接序列化为原始字节序列。

```python
import struct


class RGBColor:
    def __init__(self, r: int, g: int, b: int) -> None:
        self.r, self.g, self.b = r, g, b

    def __str__(self) -> str:
        return f"rgb({self.r}, {self.g}, {self.b})"

    def __format__(self, format_spec: str) -> str:
        if not format_spec or format_spec == "css":
            return str(self)
        if format_spec == "hex":
            return f"#{self.r:02x}{self.g:02x}{self.b:02x}"
        if format_spec == "HEX":
            return f"#{self.r:02X}{self.g:02X}{self.b:02X}"
        raise ValueError(f"Unknown format code {format_spec!r} for RGBColor")

    def __bytes__(self) -> bytes:
        return struct.pack("BBB", self.r, self.g, self.b)


color = RGBColor(255, 128, 0)
assert f"{color}" == "rgb(255, 128, 0)"
assert f"{color:hex}" == "#ff8000"
assert f"{color:HEX}" == "#FF8000"
assert bytes(color) == b"\xff\x80\x00"
```

---

## 比较、排序与哈希契约：`__eq__`、`__hash__` 与富比较

### 相等性重载 `__eq__`：类型检查与返回 `NotImplemented` 交由对方反向处理的协作协议

默认情况下，自定义类从 `object` 继承的 `__eq__` 直接比较两个对象的内存身份（`self is other`）。重写 `__eq__(self, other: object)` 实现按值判等时，必须遵守一条至关重要的协议：

!!! warning "注意：类型不匹配时必须 `return NotImplemented`，切勿 `return False` 或抛出 `TypeError`"
    当 `other` 不是当前类可识别的类型时，**必须返回单例哨兵对象 `NotImplemented`**（注意不是抛出 `NotImplementedError` 异常！）：
    
    1. 解释器看到 `a.__eq__(b)` 返回 `NotImplemented` 后，会自动尝试调用右操作数的反射方法 **`b.__eq__(a)`**（如果 `b` 是后来编写的扩展类，它可能知道如何与 `a` 比较）；
    2. 如果双方都返回 `NotImplemented`，解释器在 `==` 时才会优雅地最终回退为 `False`（在 `!=` 时回退为 `True`）。如果左操作数直接武断地 `return False`，就彻底剥夺了右操作数参与协同比较的机会！

*注：在 Python 3 中，只要实现了 `__eq__`，解释器就会自动提供默认对立的 `__ne__`（即 `!=` 自动将 `__eq__` 的布尔结果取反），无需手写 `__ne__`。*

### 哈希契约铁律：相等的对象必须具有相同的哈希值（为何仅重写 `__eq__` 会使 `__hash__` 自动变为 `None`）

Python 中的字典（`dict`）和集合（`set`）底层都是**哈希表（Hash Table）**。哈希表能够正常工作的数学前提是**哈希契约铁律（Hash Invariant）**：

$$\text{如果 } a == b \text{ 为 True，则必须满足 } \text{hash}(a) == \text{hash}(b)$$

为了防止程序员破坏这条铁律导致字典丢键，Python 语言层做了一个精妙的保护机制：
- 如果一个类**既没有重写 `__eq__` 也没有重写 `__hash__`**，它默认继承 `object.__hash__`（基于对象内存地址计算哈希），此时只有 `a is b` 时才相等，满足哈希契约；
- **一旦你在类中重写了 `__eq__`，却没有同时显式定义 `__hash__`**，Python 编译器在创建该类时会自动将 **`Cls.__hash__ = None`**，将该类标记为**不可哈希（Unhashable）**！任何尝试将其放入 `set` 或作为 `dict` 键的操作都会立即抛出 `TypeError: unhashable type`。
- 如果你的类是**可变对象（Mutable Object，如列表或业务状态会改变的实体）**，重写 `__eq__` 后就应当保持 `__hash__ = None`（绝不能为可变属性计算哈希，否则对象放入字典后一旦修改属性导致哈希值变化，就再也无法从字典中查找到它了！）。

### 自定义不可变类的 `__hash__` 实现规范（委托给核心不可变属性构成的元组 `hash((self.a, self.b))`）

只有当你的自定义类在逻辑上是**不可变值对象（Immutable Value Object）**时，才应该在重写 `__eq__` 的同时实现 `__hash__`。

**标准实现范式**：不要自己手写异或或位运算哈希公式，而是将**所有参与 `__eq__` 判等的核心属性打包为一个元组（`tuple`）**，直接委托给内置的 `hash((self.attr1, self.attr2))`（元组在 C 层采用了经过严格抗碰撞调优的 xxHash 变体算法）。

```python
class GridCell:
    """不可变二维网格坐标值对象，同时满足相等性与哈希契约。"""
    def __init__(self, row: int, col: int, label: str = "") -> None:
        self._row = row
        self._col = col
        self.label = label  # label 是附属注释，不参与相等性比较

    @property
    def row(self) -> int:
        return self._row

    @property
    def col(self) -> int:
        return self._col

    def __eq__(self, other: object) -> bool:
        if not isinstance(other, GridCell):
            return NotImplemented
        return (self._row, self._col) == (other._row, other._col)

    def __hash__(self) -> int:
        # 铁律：参与 __hash__ 的属性集合必须与参与 __eq__ 的属性集合严格一致！
        return hash((self._row, self._col))


c1 = GridCell(1, 2, label="Start")
c2 = GridCell(1, 2, label="Alias")
assert c1 == c2 and hash(c1) == hash(c2)

visited = {c1}
assert c2 in visited
```

### 富比较魔术方法（`__lt__`、`__le__`、`__gt__`、`__ge__`、`__ne__`）与 `@functools.total_ordering` 自动补全

Python 的六个比较运算符统称为**富比较方法（Rich Comparison Methods）**：

| 运算符 | 正向魔术方法 | 当左操作数返回 `NotImplemented` 时的反射调用方法 |
| :---: | :--- | :--- |
| `a == b` | `a.__eq__(b)` | `b.__eq__(a)` |
| `a != b` | `a.__ne__(b)` | `b.__ne__(a)` |
| `a < b` | `a.__lt__(b)` | **`b.__gt__(a)`**（注意 `<` 的反射镜像是 `>`！） |
| `a <= b` | `a.__le__(b)` | **`b.__ge__(a)`**（注意 `<=` 的反射镜像是 `>=`！） |
| `a > b` | `a.__gt__(b)` | **`b.__lt__(a)`** |
| `a >= b` | `a.__ge__(b)` | **`b.__le__(a)`** |

- 如果你的类只需要支持 `sorted()`、`list.sort()`、`min()`、`max()` 或 `heapq`，**其实只需要实现 `__lt__`（小于）和 `__eq__`**，因为 Python 的 Timsort 排序算法内部保证只调用 `<` 比较！
- 如果希望完整支持 `<`、`<=`、`>`、`>=` 全部四个大小比较运算符，使用标准库类装饰器 **`@functools.total_ordering`**：你只需实现 `__eq__` 加任意一个大小比较（通常是 `__lt__`），装饰器会自动为你推导并补全其余三个方法。

```python
from functools import total_ordering


@total_ordering
class TaskPriority:
    def __init__(self, weight: int) -> None:
        self.weight = weight

    def __eq__(self, other: object) -> bool:
        if not isinstance(other, TaskPriority):
            return NotImplemented
        return self.weight == other.weight

    def __lt__(self, other: object) -> bool:
        if not isinstance(other, TaskPriority):
            return NotImplemented
        return self.weight < other.weight


p_low = TaskPriority(1)
p_high = TaskPriority(10)
# 虽然只手写了 __eq__ 和 __lt__，但 >=, >, <= 均已由 @total_ordering 自动补全
assert p_high > p_low and p_high >= p_low and p_low <= p_high
```

### 布尔真值协议：`__bool__` 与缺省回退到 `__len__` 的判定链路

当对象出现在 `if obj:`、`while obj:`、`bool(obj)` 或逻辑表达式 `obj and other` 中时，解释器按以下严格的**三级判定链路**确定其真假值（Truth Value Testing）：

1. **优先调用 `__bool__(self) -> bool`**：若类定义了 `__bool__`，直接调用它（必须严格返回 `True` 或 `False`，否则抛出 `TypeError`）；
2. **回退调用 `__len__(self) -> int`**：若未定义 `__bool__`，解释器会检查该类是否定义了 `__len__`——若 `len(obj) != 0` 则判定为 `True`，若 `len(obj) == 0`（空容器）则判定为 `False`；
3. **默认恒真兜底**：若既无 `__bool__` 也无 `__len__`，则任何自定义类的实例默认布尔值**恒为 `True`**。

```python
class ConnectionSession:
    def __init__(self, is_active: bool) -> None:
        self.is_active = is_active

    def __bool__(self) -> bool:
        return self.is_active


active_conn = ConnectionSession(True)
closed_conn = ConnectionSession(False)
assert bool(active_conn) is True and bool(closed_conn) is False
```

---

## 容器与序列模拟协议

### 长度与成员测试：`__len__`、`__length_hint__` 与 `__contains__`（`in` 运算符的回退机制：`__contains__` -> `__iter__` -> `__getitem__`）

- **`__len__(self) -> int`**：服务于 `len(obj)`，必须返回大于等于 `0` 的非负整数。
- **`__length_hint__(self) -> int`**（PEP 424）：服务于 `operator.length_hint(it)`。当一个迭代器无法精确预知剩余长度、但能以 $O(1)$ 估算出一个大致容量时实现该方法，`list(it)` 在底层会根据该提示一次性预分配底层连续数组内存，大幅减少 `realloc` 扩容次数。
- **`in` 成员测试运算符的三级回退机制**：当执行 `item in container` 时，Python 解释器的尝试顺序如下：
  1. **首选 `__contains__(self, item) -> bool`**：若实现了该方法，直接调用（例如集合/字典用 $O(1)$ 哈希查找，有序数组可用 $O(\log n)$ 二分查找）；
  2. **次选 `__iter__(self)`**：若未实现 `__contains__`，解释器退而求其次，通过 `iter(container)` 线性遍历每一个元素并逐个用 `==` 比对（时间复杂度 $O(n)$）；
  3. **末选旧式序列迭代 `__getitem__(self, index)`**：若连 `__iter__` 都没有，解释器会从整数下标 `0, 1, 2...` 开始依次调用 `container[i]`，直到捕获 `IndexError` 为止。

```python
import bisect


class SortedNumberSet:
    """利用有序数组 + 二分查找，将 __contains__ 从 O(n) 加速到 O(log n)。"""
    def __init__(self, numbers: list[int]) -> None:
        self._data = sorted(numbers)

    def __len__(self) -> int:
        return len(self._data)

    def __contains__(self, target: int) -> bool:
        idx = bisect.bisect_left(self._data, target)
        return idx < len(self._data) and self._data[idx] == target


s = SortedNumberSet([40, 10, 30, 20])
assert len(s) == 4
assert (20 in s) is True and (25 in s) is False
```

### 索引、切片与键值读写：`__getitem__`、`__setitem__`、`__delitem__` 及对 `slice` 切片对象的解析

方括号下标语法 `obj[key]` 的全部操作由三个魔术方法接管：
- 读取 `obj[key]` -> `obj.__getitem__(key)`
- 赋值 `obj[key] = val` -> `obj.__setitem__(key, val)`
- 删除 `del obj[key]` -> `obj.__delitem__(key)`

**切片语法 `obj[start:stop:step]` 的底层真相**：
当调用侧写出 `obj[1:10:2]` 时，Python 会先构造一个内置的切片对象 **`slice(1, 10, 2)`**（拥有 `.start`、`.stop`、`.step` 属性），然后将其作为 `key` 传给 `__getitem__(self, key)`！如果写的是多维切片 `matrix[1:3, 0:2]`（如 NumPy / Pandas），传入的 `key` 则是由多个 `slice` 或整数构成的**元组 `(slice(1, 3, None), slice(0, 2, None))`**。

在自定义序列类中处理 `slice` 时，除了可以直接将 `slice` 委托给底层 `list`，还可以使用 **`key.indices(len(self))`** 方法——它会自动处理负数索引、越界截断以及缺省的 `None`，直接返回规整化后的 `(start, stop, step)` 三元组！

```python
from typing import overload


class ImmutableSeries:
    def __init__(self, values: list[float]) -> None:
        self._values = list(values)

    def __len__(self) -> int:
        return len(self._values)

    @overload
    def __getitem__(self, index: int) -> float: ...
    @overload
    def __getitem__(self, index: slice) -> "ImmutableSeries": ...

    def __getitem__(self, index: int | slice) -> "ImmutableSeries | float":
        if isinstance(index, slice):
            # 良好的序列协议规范：对自定义序列做切片应返回同类型的新实例！
            return type(self)(self._values[index])
        if isinstance(index, int):
            return self._values[index]
        raise TypeError(f"Indices must be integers or slices, not {type(index).__name__}")


series = ImmutableSeries([10.0, 20.0, 30.0, 40.0])
assert series[-1] == 40.0
sub = series[1:3]
assert isinstance(sub, ImmutableSeries) and len(sub) == 2 and sub[0] == 20.0
```

### 映射缺失键兜底钩子：在 `dict` 子类中实现 `__missing__(self, key)`

当我们在继承自 `dict`（或 `collections.UserDict`）的子类中定义了 **`__missing__(self, key)`** 魔术方法时：
- 仅在使用方括号 **`d[key]`（即 `dict.__getitem__`）** 访问一个不存在的键时，不会直接抛出 `KeyError`，而是自动调用 `self.__missing__(key)` 并将其返回值作为查询结果（标准库 `collections.defaultdict` 和 `collections.Counter` 正是基于此钩子实现的）；
- 注意：`d.get(key)` 和 `key in d` **不会触发** `__missing__`！

```python
class StrKeyDict(dict[str, object]):
    """支持用整数 key (如 d[128]) 自动回退查找字符串 key (d['128']) 的宽容字典。"""
    def __missing__(self, key: object) -> object:
        if isinstance(key, str):
            # 如果传入的本来就是 str 却没找到，必须直接抛出 KeyError，否则下方 self[str(key)] 会无限递归！
            raise KeyError(key)
        return self[str(key)]


pin_map = StrKeyDict({"2": "GPIO_2", "4": "GPIO_4"})
assert pin_map["2"] == "GPIO_2"
assert pin_map[4] == "GPIO_4"  # 整数 4 未命中，触发 __missing__ 自动转为 "4" 查出结果
```

### 反向迭代协议：`__reversed__`

当调用内置函数 `reversed(seq)` 时：
1. 若对象实现了 **`__reversed__(self)`**，则直接调用它返回一个反向迭代器；
2. 若未实现 `__reversed__`，但该对象同时实现了序列协议的 **`__len__` 和 `__getitem__`**，`reversed(seq)` 会自动构造一个从下标 `len(seq) - 1` 递减到 `0` 的后备反向迭代器。

```python
class CountdownRange:
    def __init__(self, start: int, end: int) -> None:
        self.start, self.end = start, end

    def __iter__(self):
        return iter(range(self.start, self.end + 1))

    def __reversed__(self):
        return iter(range(self.end, self.start - 1, -1))


cr = CountdownRange(1, 4)
assert list(cr) == [1, 2, 3, 4]
assert list(reversed(cr)) == [4, 3, 2, 1]
```

---

## 运算符重载体系

Python 允许为自定义类重载绝大多数算术、位运算与矩阵运算符（禁止重载逻辑运算符 `and`、`or`、`not` 以及身份运算符 `is`），但良好的工程实践要求**保持运算符的数学直觉**（例如 `+` 与 `*` 应当是无副作用的纯操作，返回新构建的实例，绝不偷偷修改操作数自身）。

### 算术与矩阵乘法运算符重载：`__add__`、`__sub__`、`__mul__`、`__truediv__`、`__floordiv__`、`__mod__`、`__pow__` 与 `__matmul__`（`@`）

### 反向算术运算符（`__radd__` 等）：操作数类型不同且左操作数返回 `NotImplemented` 时的分派机制

### 就地增量赋值运算符（`__iadd__` 等）：返回 `self` 实现原址修改与未实现时向普通算术运算的回退

下表完整汇总了 Python 二元算术运算符对应的**正向（Forward）**、**反向（Reflected / Right-hand）**与**就地增量（In-place / Augmented）**三套魔术方法：

| 运算符含义 | 表达式 | 正向方法 | 反向方法（左操作数不支持时调用右操作数） | 就地增量方法（如 `a += b`） |
| :--- | :---: | :--- | :--- | :--- |
| 加法 | `a + b` | `__add__` | `__radd__` | `__iadd__` |
| 减法 | `a - b` | `__sub__` | `__rsub__` | `__isub__` |
| 乘法 | `a * b` | `__mul__` | `__rmul__` | `__imul__` |
| 矩阵乘法 (PEP 465) | `a @ b` | `__matmul__` | `__rmatmul__` | `__imatmul__` |
| 真除法（浮点除） | `a / b` | `__truediv__` | `__rtruediv__` | `__itruediv__` |
| 地板除（整除） | `a // b` | `__floordiv__` | `__rfloordiv__` | `__ifloordiv__` |
| 取模（求余） | `a % b` | `__mod__` | `__rmod__` | `__imod__` |
| 同时商与余 (`divmod()`) | `divmod(a, b)` | `__divmod__` | `__rdivmod__` | — |
| 幂运算 | `a ** b` | `__pow__` | `__rpow__` | `__ipow__` |

**必须烂熟于心的两大底层分派法则**：

1. **反向运算符（`__radd__` / `__rmul__` 等）的三步触发流程**：
   假设我们定义了向量类 `Vector`，执行 `3 * vec`（左操作数是 `int`，右操作数是 `Vector`）：
   - **第一步**：解释器先调用左操作数的 `int.__mul__(3, vec)`。内置 `int` 不认识 `Vector`，于是它礼貌地返回 **`NotImplemented`**；
   - **第二步**：解释器检测到左操作数返回了 `NotImplemented`，且左右操作数**不是同一个类型**（若类型相同则不再尝试反向方法），于是立即调转方向，调用右操作数的反向方法 **`vec.__rmul__(3)`**！
   - **第三步**：如果 `vec.__rmul__(3)` 也返回 `NotImplemented`，解释器最终抛出 `TypeError: unsupported operand type(s) for *: 'int' and 'Vector'`。
   *(注：如果右操作数是左操作数的**子类**且重写了对应的反向方法，则优先直接调用子类的反向方法以保证子类多态优先)。*

2. **就地增量运算符（`__iadd__` 等）的回退与返回值要求**：
   当执行 `a += b` 时：
   - 如果 `a` 实现了 `__iadd__`（适用于**可变对象**，如 `list`），则调用 `a = a.__iadd__(b)`。**注意：`__iadd__` 在原地修改自身状态后，必须显式 `return self`**！如果忘了写 `return self`，变量 `a` 会直接变成 `None`！
   - 如果 `a` **没有实现 `__iadd__`**（适用于**不可变对象**，如 `tuple` 或不可变 `Vector`），解释器会自动无缝回退为执行 **`a = a + b`**（即调用 `__add__` 或 `__radd__` 创建新对象并重新绑定变量 `a`）。

### 一元运算符（`__neg__`、`__pos__`、`__abs__`、`__invert__`）与位运算符重载

- **一元运算符**：
  - `-obj`（取负）-> `__neg__(self)`
  - `+obj`（取正）-> `__pos__(self)`
  - `abs(obj)`（绝对值/模长）-> `__abs__(self)`
  - `~obj`（按位取反/求逆）-> `__invert__(self)`
- **二元位运算符（同样拥有对应的 `__r*__` 与 `__i*__` 变体）**：
  - `a & b`（按位与 / 交集）-> `__and__` / `__rand__` / `__iand__`
  - `a | b`（按位或 / 并集 / 管道合并）-> `__or__` / `__ror__` / `__ior__`
  - `a ^ b`（按位异或 / 对称差集）-> `__xor__` / `__rxor__` / `__ixor__`
  - `a << b`、`a >> b`（左移 / 右移）-> `__lshift__`、`__rshift__`

```python
import math


class Vector2D:
    """完整演示正向算术、反向标量乘法、矩阵点积 (@) 与一元运算符的二维向量。"""
    def __init__(self, x: float, y: float) -> None:
        self.x, self.y = float(x), float(y)

    def __eq__(self, other: object) -> bool:
        if not isinstance(other, Vector2D):
            return NotImplemented
        return (self.x, self.y) == (other.x, other.y)

    def __add__(self, other: object) -> "Vector2D":
        if not isinstance(other, Vector2D):
            return NotImplemented
        return Vector2D(self.x + other.x, self.y + other.y)

    def __mul__(self, scalar: object) -> "Vector2D":
        if not isinstance(scalar, (int, float)):
            return NotImplemented
        return Vector2D(self.x * scalar, self.y * scalar)

    def __rmul__(self, scalar: object) -> "Vector2D":
        # 标量乘法满足交换律：3 * vec 直接委托给 vec * 3
        return self.__mul__(scalar)

    def __matmul__(self, other: object) -> float:
        """重载 @ 运算符计算两个向量的内积（Dot Product）。"""
        if not isinstance(other, Vector2D):
            return NotImplemented
        return self.x * other.x + self.y * other.y

    def __neg__(self) -> "Vector2D":
        return Vector2D(-self.x, -self.y)

    def __abs__(self) -> float:
        return math.hypot(self.x, self.y)


v1 = Vector2D(3, 4)
v2 = Vector2D(1, 2)

assert v1 + v2 == Vector2D(4, 6)
assert v1 * 2 == Vector2D(6, 8)
assert 3 * v1 == Vector2D(9, 12)  # 触发 int.__mul__ 返回 NotImplemented -> 调用 Vector2D.__rmul__
assert v1 @ v2 == 11.0            # 3*1 + 4*2 = 11.0
assert -v1 == Vector2D(-3, -4) and abs(v1) == 5.0
```

---

## 可调用对象协议：`__call__`

### 实现 `__call__(self, *args, **kwargs)` 让类实例像函数一样被调用

在 Python 中，“可调用（Callable）”并不局限于用 `def` 或 `lambda` 创建的函数。任何自定义类只要实现了 **`__call__(self, *args, **kwargs)`** 魔术方法，它的**实例对象**就可以直接加上圆括号 `instance(arg1, arg2)` 像普通函数一样被调用！

### `callable()` 内置函数检测与使用可调用类封装有状态函数、策略对象及类装饰器

通过内置函数 **`callable(obj)`** 可以检测任意对象是否可调用（包括普通函数、内置函数、绑定方法、类对象本身、以及实现了 `__call__` 的类实例）。

**工程上什么时候应该用实现 `__call__` 的可调用类，代替闭包或普通函数？**
1. **需要对外暴露可观测、可重置的内部状态或辅助方法**：闭包的状态被隐藏在 `__closure__` 的 `cell` 中，外部极难读取或清理；而可调用类的状态直接就是清晰的实例属性（如 `scorer.history`、`scorer.reset()`）。
2. **复杂的策略模式（Strategy Pattern）与深度学习组件**：例如 PyTorch 中的 `nn.Module` 子类，通过 `__init__` 初始化网络层权重状态，通过 `__call__` 执行前向传播并自动触发前后置钩子（Hooks）。

```python
class MovingAverage:
    """使用 __call__ 实现带滑动窗口状态的移动平均滤波器。"""
    def __init__(self, window_size: int) -> None:
        if window_size < 1:
            raise ValueError("window_size must be >= 1")
        self.window_size = window_size
        self.samples: list[float] = []

    def __call__(self, new_val: float) -> float:
        self.samples.append(new_val)
        if len(self.samples) > self.window_size:
            self.samples.pop(0)
        return sum(self.samples) / len(self.samples)

    def reset(self) -> None:
        self.samples.clear()


ma = MovingAverage(window_size=3)
assert callable(ma) is True
assert ma(10.0) == 10.0
assert ma(20.0) == 15.0
assert ma(30.0) == 20.0
assert ma(40.0) == 30.0  # 窗口滑动保留 [20.0, 30.0, 40.0]

ma.reset()
assert len(ma.samples) == 0
```

---

## 练习与实战

### 练习 1：实现支持双向加法、就地累加与哈希契约的多项式/向量类 `SparseVector`

请实现一个稀疏向量类 `SparseVector`，内部使用字典存储非零维度 `{index: value}`：
1. `__init__(self, mapping: dict[int, float] | None = None)`：过滤掉值为 `0` 的项并保存；
2. 实现 `__getitem__(self, idx: int) -> float`：访问未存储的维度时直接返回 `0.0`（不修改内部字典）；
3. 实现 `__len__`（返回非零元素的个数）与 `__bool__`（当且仅当存在非零元素时为 `True`）；
4. 实现 `__add__`（支持 `SparseVector + SparseVector` 返回新实例）与 `__iadd__`（支持 `v1 += v2` 原地修改 `v1` 并正确 `return self`，注意相加后若某维度结果变为 `0` 需从内部字典中剔除）；
5. 实现 `__eq__`（非 `SparseVector` 返回 `NotImplemented`）。

??? success "点击查看答案与解析"
    **核心解析**：过滤零值能保证表示的唯一性（例如 `{0: 1.0, 2: 0.0}` 与 `{0: 1.0}` 在过滤后内部字典完全一致，可直接通过 `self._data == other._data` 在 $O(k)$ 时间内完成相等判断）。注意 `__iadd__` 原地更新字典后必须 `return self`。

    ```python
    from typing import Self


    class SparseVector:
        def __init__(self, mapping: dict[int, float] | None = None) -> None:
            self._data: dict[int, float] = {
                k: float(v) for k, v in (mapping or {}).items() if v != 0
            }

        def __getitem__(self, idx: int) -> float:
            return self._data.get(idx, 0.0)

        def __len__(self) -> int:
            return len(self._data)

        def __bool__(self) -> bool:
            return bool(self._data)

        def __eq__(self, other: object) -> bool:
            if not isinstance(other, SparseVector):
                return NotImplemented
            return self._data == other._data

        def __add__(self, other: object) -> "SparseVector":
            if not isinstance(other, SparseVector):
                return NotImplemented
            result = SparseVector(self._data)
            result += other
            return result

        def __iadd__(self, other: object) -> Self:
            if not isinstance(other, SparseVector):
                return NotImplemented
            for k, v in other._data.items():
                new_val = self._data.get(k, 0.0) + v
                if new_val == 0.0:
                    self._data.pop(k, None)
                else:
                    self._data[k] = new_val
            return self


    sv1 = SparseVector({0: 2.5, 3: -1.0, 99: 0.0})
    sv2 = SparseVector({3: 1.0, 5: 4.0})

    assert len(sv1) == 2 and sv1[99] == 0.0
    sv3 = sv1 + sv2
    # 维度 3 相加抵消为 0 被自动清除
    assert sv3 == SparseVector({0: 2.5, 5: 4.0})

    # 测试就地增量加法 __iadd__
    orig_id = id(sv1)
    sv1 += sv2
    assert id(sv1) == orig_id and sv1 == sv3
    ```

### 练习 2：定制支持切片、负索引与 $O(1)$ 成员判定的惰性等差数列容器 `ArithmeticRange`

请模仿内置 `range` 的高级特性，编写一个不预先生成列表、内存占用恒为 $O(1)$ 的只读序列类 `ArithmeticRange(start: int, stop: int, step: int = 1)`（包含 `start`，不包含 `stop`，假定 `step > 0`）：
1. 实现 `__len__`：用数学公式直接计算元素个数 $\max(0, \lceil(\text{stop} - \text{start}) / \text{step}\rceil)$；
2. 实现 `__getitem__`：
   - 当传入整数 `index`（支持负索引）时，以 $O(1)$ 公式计算对应项的值，越界则抛出 `IndexError`；
   - 当传入切片 `slice` 时，使用 `index.indices(len(self))` 解析并返回新的 `ArithmeticRange` 实例；
3. 实现 `__contains__(self, val: object) -> bool`：不通过循环遍历，直接用算术整除判断 `val` 是否落在该等差数列中（时间复杂度 $O(1)$）。

??? success "点击查看答案与解析"
    **核心解析**：借助 `slice.indices(length)` 可以将复杂的切片边界与步长换算简化为三行代码；`__contains__` 只需验证 `isinstance(val, int)`、落在 `[start, stop)` 区间内且 `(val - start) % step == 0`，即可像内置 `range` 一样在微秒内完成上亿规模的 `in` 判断。

    ```python
    class ArithmeticRange:
        def __init__(self, start: int, stop: int, step: int = 1) -> None:
            if step <= 0:
                raise ValueError("step must be > 0")
            self.start = start
            self.stop = stop
            self.step = step

        def __len__(self) -> int:
            if self.stop <= self.start:
                return 0
            return (self.stop - self.start + self.step - 1) // self.step

        def __getitem__(self, index: int | slice) -> "int | ArithmeticRange":
            length = len(self)
            if isinstance(index, int):
                if index < 0:
                    index += length
                if not (0 <= index < length):
                    raise IndexError("ArithmeticRange index out of range")
                return self.start + index * self.step
            if isinstance(index, slice):
                start_idx, stop_idx, step_mul = index.indices(length)
                new_start = self.start + start_idx * self.step
                new_stop = self.start + stop_idx * self.step
                new_step = self.step * step_mul
                return ArithmeticRange(new_start, new_stop, new_step)
            raise TypeError("Index must be int or slice")

        def __contains__(self, val: object) -> bool:
            if not isinstance(val, int):
                return False
            return self.start <= val < self.stop and (val - self.start) % self.step == 0

        def __repr__(self) -> str:
            return f"ArithmeticRange({self.start}, {self.stop}, {self.step})"


    ar = ArithmeticRange(10, 10**12, 5)
    assert len(ar) == 199_999_999_998
    assert ar[0] == 10 and ar[2] == 20 and ar[-1] == 10**12 - 5
    # O(1) 极速成员检测与切片
    assert (500_000_005 in ar) is True
    assert (500_000_003 in ar) is False
    assert list(ar[1:5:2]) == [15, 25]
    ```

### 练习 3：结合 `__new__`、不可变哈希契约与 `__format__` 实现枚举级颜色享元类

请编写一个不可变且驻留复用（Interned）的颜色类 `HexColor`：
1. 重写 `__new__(cls, hex_str: str)`：接受形如 `"#ff8000"` 或 `"FF8000"` 的十六进制字符串，将其归一化为 6 位大写十六进制（如 `"FF8000"`），并在类属性字典 `_cache` 中按归一化字符串缓存实例——相同的颜色值无论构造多少次，都返回同一个内存对象；
2. 实现 `__eq__` 与 `__hash__`；
3. 实现 `__format__(self, spec: str) -> str`：当 `spec == ""` 或 `"hex"` 时输出 `"#FF8000"`；当 `spec == "rgb"` 时将其解析为十进制并输出 `"rgb(255, 128, 0)"`。

??? success "点击查看答案与解析"
    **核心解析**：当使用 `__new__` 实现对象池缓存时，如果还定义了 `__init__`，每次命中缓存返回旧实例时 `__init__` 仍会被重复调用一次！因此对于不可变享元对象，最佳实践是**在 `__new__` 首次创建实例时直接完成所有属性绑定，不再定义 `__init__`**。

    ```python
    class HexColor:
        _cache: dict[str, "HexColor"] = {}

        def __new__(cls, hex_str: str) -> "HexColor":
            code = hex_str.strip().lstrip("#").upper()
            if len(code) != 6 or any(c not in "0123456789ABCDEF" for c in code):
                raise ValueError(f"Invalid hex color: {hex_str!r}")
            if code not in cls._cache:
                instance = super().__new__(cls)
                instance._code = code
                cls._cache[code] = instance
            return cls._cache[code]

        @property
        def code(self) -> str:
            return self._code

        def __repr__(self) -> str:
            return f"HexColor('#{self._code}')"

        def __str__(self) -> str:
            return f"#{self._code}"

        def __eq__(self, other: object) -> bool:
            if not isinstance(other, HexColor):
                return NotImplemented
            return self._code == other._code

        def __hash__(self) -> int:
            return hash(self._code)

        def __format__(self, spec: str) -> str:
            if not spec or spec == "hex":
                return f"#{self._code}"
            if spec == "rgb":
                r = int(self._code[0:2], 16)
                g = int(self._code[2:4], 16)
                b = int(self._code[4:6], 16)
                return f"rgb({r}, {g}, {b})"
            raise ValueError(f"Unknown format spec {spec!r}")


    c1 = HexColor("#ff8000")
    c2 = HexColor("FF8000")
    assert c1 is c2 and c1 == c2 and hash(c1) == hash(c2)
    assert f"{c1:hex} -> {c1:rgb}" == "#FF8000 -> rgb(255, 128, 0)"
    ```
