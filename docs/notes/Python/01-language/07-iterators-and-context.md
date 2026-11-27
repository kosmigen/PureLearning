# 迭代器、生成器与上下文协议

Python 的控制流并非仅靠硬编码的语法关键字驱动，而是建立在一套高度统一的**对象协议（Data Model Protocols）**之上：`for` 循环背后是**迭代协议**，`yield` 流式计算背后是**生成器协议**，`with` 资源管理背后是**上下文管理协议**，而 `async` / `await` 并发模型则是将生成器与迭代/上下文协议向异步维度的自然延伸。理解这四大协议，是从“会写 Python 语法”迈向“掌握 Python 运行时心智模型”的核心分水岭。

---

## 迭代协议（Iteration Protocol）

### 可迭代对象（Iterable：实现 `__iter__`）与迭代器（Iterator：同时实现 `__iter__` 与 `__next__`）的严格区分

在 Python 数据模型中，**可迭代对象（`Iterable`）**与**迭代器（`Iterator`）**承担着截然不同的职责：

- **可迭代对象（`Iterable`）**：代表**数据容器或数据源**（如 `list`、`tuple`、`dict`、`str`）。只要一个对象实现了 `__iter__(self)` 方法并返回一个迭代器（或实现了传统的 `__getitem__` 序列索引协议），它就是 `Iterable`。
- **迭代器（`Iterator`）**：代表**遍历过程中的有状态游标（Cursor）**。它必须同时实现两个方法：
    1. `__next__(self)`：每次调用返回流中的下一个元素；当没有更多元素时，必须抛出 `StopIteration` 异常。
    2. `__iter__(self)`：**返回迭代器自身（`return self`）**。这一设计使得迭代器本身也是可迭代对象，从而可以直接在 `for` 循环或其他接收 `Iterable` 的高阶函数（如 `sum()`、`list()`）中使用。

| 维度 | 可迭代对象（`collections.abc.Iterable`） | 迭代器（`collections.abc.Iterator`） |
| :--- | :--- | :--- |
| **核心抽象** | 静态数据源或数据集合 | 单向推进的遍历游标（保存当前读取位置） |
| **必需魔术方法** | `__iter__(self)`（或序列 `__getitem__`） | `__iter__(self)`（返回 `self`）与 `__next__(self)` |
| **内置函数支持** | 支持 `iter(obj)`，**不支持** `next(obj)` | 同时支持 `iter(obj)`（返回自身）与 `next(obj)` |
| **遍历复用性** | 可多次调用 `iter(obj)` 生成多个独立游标 | **一次性消耗**，耗尽后持续抛出 `StopIteration` |
| **典型内置类型** | `list`、`tuple`、`dict`、`set`、`str`、`range` | `list_iterator`、生成器对象、`map`、`filter`、`zip` |

```python
from collections.abc import Iterable, Iterator

nums = [10, 20, 30]
it = iter(nums)  # 调用 nums.__iter__() 创建独立的游标对象

# 1. list 是 Iterable，但绝不是 Iterator
assert isinstance(nums, Iterable) is True
assert isinstance(nums, Iterator) is False

# 2. 迭代器同时是 Iterable 和 Iterator，且 iter(it) 返回自身
assert isinstance(it, Iterable) is True
assert isinstance(it, Iterator) is True
assert iter(it) is it

# 3. 通过 next() 推进游标状态
assert next(it) == 10
assert next(it) == 20
assert next(it) == 30
```

!!! warning "注意：`range` 对象不是迭代器"
    初学者常将 `range(10)` 误认为迭代器。实际上 `range` 是一个**惰性不可变序列（`Iterable`）**——它不预先在内存中生成所有整数，而是在迭代或按下标访问时实时计算，且每次对其调用 `iter(range(10))` 都会返回一个全新的 `range_iterator`，因此 `range` 对象可以被无限次重复遍历。

### `for` 循环的底层展开等价模型：`iter()` 获取迭代器、`next()` 推进元素与捕获 `StopIteration` 终止

Python 的 `for item in iterable:` 语句是一层纯粹的语法糖。CPython 解释器在执行 `for` 循环时，对应的字节码为 `GET_ITER`（调用 `iter()`）与 `FOR_ITER`（循环调用 `next()` 并在内部高效捕获 `StopIteration`）。其严格等价的 Python 展开模型如下：

```python
def manual_for_loop(iterable) -> list[int]:
    results = []
    # 步骤 1：对应字节码 GET_ITER，获取迭代器游标
    iterator = iter(iterable)
    
    # 步骤 2：对应字节码 FOR_ITER，不断推进 next() 直至捕获 StopIteration
    while True:
        try:
            item = next(iterator)
        except StopIteration:
            break  # 正常耗尽信号，静默退出循环
        
        # 步骤 3：执行原本的 for 循环体
        results.append(item * 2)
    return results

assert manual_for_loop([1, 2, 3]) == [2, 4, 6]
```

此外，内置函数 `next(iterator, default)` 支持传入第二个默认值参数：当迭代器耗尽抛出 `StopIteration` 时，返回 `default` 而不将异常向上冒泡；同时 `iter(callable, sentinel)` 还支持双参数哨兵形式，不断调用无参可调用对象 `callable()` 直到返回值等于 `sentinel` 为止：

```python
it = iter([42])
assert next(it, "EOF") == 42
assert next(it, "EOF") == "EOF"  # 不抛出 StopIteration，直接返回默认值

# 双参数 iter(callable, sentinel)：模拟流式分块读取直到遇到空字符串哨兵
chunks = iter(["chunk1", "chunk2", ""].__iter__().__next__, "")
assert list(chunks) == ["chunk1", "chunk2"]
```

### 传统序列回退协议：未实现 `__iter__` 时通过 `__getitem__(0, 1, ...)` 顺序访问直到 `IndexError`

为了向后兼容早期 Python 的序列类型，内置函数 `iter(obj)` 实现了**两级协议探测机制**：

1. **优先查找 `__iter__`**：如果对象所属类定义了 `__iter__`，直接调用它并校验返回值是否实现了 `__next__`。
2. **序列回退（Sequence Fallback）**：如果未定义 `__iter__`，但定义了 `__getitem__(self, index)`，`iter(obj)` 会自动创建一个内置的包装迭代器，从整数索引 `0` 开始依次调用 `obj[0]`、`obj[1]`、`obj[2]`……一旦捕获到 `IndexError` 或 `StopIteration`，即视为迭代结束。

```python
from collections.abc import Iterable

class LegacyParagraph:
    """未实现 __iter__，仅实现从 0 开始的 __getitem__"""
    def __init__(self, text: str) -> None:
        self._words = text.split()

    def __getitem__(self, index: int) -> str:
        return self._words[index]  # 越界时 list 自动抛出 IndexError

para = LegacyParagraph("Python protocol design")

# 依然能够被 iter() 和 for 循环正常消费
assert list(para) == ["Python", "protocol", "design"]

# 注意：isinstance(..., Iterable) 仅检查是否实现 __iter__，对回退协议返回 False
assert isinstance(para, Iterable) is False
```

!!! tip "工程实践"
    现代 Python（3.12+）代码中编写自定义可迭代容器时，**应始终显式实现 `__iter__`**，不要依赖 `__getitem__` 回退协议。显式实现 `__iter__` 不仅能通过 `isinstance(obj, Iterable)` 和静态类型检查器（`mypy` / `pyright`）的协议校验，还能避免意外将非整数键映射对象暴露给迭代逻辑。

### 一次性消耗陷阱：为什么迭代器不能被重复遍历，以及如何通过将容器（Iterable）与游标（Iterator）分离来支持多次遍历

工程中最常见的迭代 Bug 之一，是将**同一个对象既当作容器又当作迭代器**（即在容器类自身上直接实现 `__next__` 且令 `__iter__` 返回 `self`），或者将生成器/`map`/`zip` 返回的迭代器赋给变量后进行二次遍历。

```python
# 陷阱演示：迭代器一旦耗尽，后续遍历均为空集
evens_iter = (x for x in [1, 2, 3, 4] if x % 2 == 0)
first_pass = list(evens_iter)
second_pass = list(evens_iter)  # 游标已到达末尾，直接触发 StopIteration

assert first_pass == [2, 4]
assert second_pass == []
```

如果函数入参声明为 `Iterable[T]`，但函数体内需要多次遍历该参数，可以通过 `if iter(data) is data:` 检测传入的是否是一次性迭代器，或将其提前物化为 `tuple`/`list`。而在设计自定义数据容器时，**必须将容器（`Iterable`）与游标（`Iterator`）解耦**：

```python
class CountdownIterator:
    """独立游标（Iterator）：维护单次遍历的当前计数值"""
    def __init__(self, start: int) -> None:
        self._current = start

    def __iter__(self) -> "CountdownIterator":
        return self

    def __next__(self) -> int:
        if self._current <= 0:
            raise StopIteration
        val = self._current
        self._current -= 1
        return val


class CountdownRange:
    """可复用容器（Iterable）：不保存游标状态，每次 __iter__ 返回新游标"""
    def __init__(self, start: int) -> None:
        self.start = start

    def __iter__(self) -> CountdownIterator:
        return CountdownIterator(self.start)  # 或直接使用生成器 yield 简化


countdown = CountdownRange(3)
assert list(countdown) == [3, 2, 1]
assert list(countdown) == [3, 2, 1]  # 支持无限次独立遍历，互不干扰
```

### `itertools` 标准库核心算子分类速览（无限迭代器、有限组合流与排列组合）

Python 标准库 `itertools` 模块提供了一整套基于 C 语言实现的高性能惰性迭代器算子，能在不分配中间列表内存的前提下完成复杂的数据流变换。

| 分类 | 核心算子 | 功能语义与 Python 3.12+ 亮点 |
| :--- | :--- | :--- |
| **无限迭代器** | `count(start=0, step=1)` | 生成无限等差数列：`start, start+step, ...` |
| | `cycle(iterable)` | 缓存元素并无限循环重复序列：`A, B, C, A, B, C, ...` |
| | `repeat(elem[, n])` | 重复生成同一个对象（指定 `n` 时为有限次） |
| **有限流切片与拼接** | `islice(iterable, start, stop[, step])` | 对任意迭代器做惰性切片（无需物化为 `list`） |
| | `chain(*iterables)` / `chain.from_iterable()` | 将多个可迭代对象首尾串联为单一惰性流 |
| | `batched(iterable, n, *, strict=False)` | **Python 3.12 新增**：按固定大小 `n` 分块产出元组（3.13 新增 `strict` 参数） |
| | `pairwise(iterable)` | 产出连续重叠二元组：`(s0, s1), (s1, s2), ...` |
| **过滤与折叠** | `takewhile(pred, it)` / `dropwhile(pred, it)` | 当谓词 `pred` 为真时持续产出 / 持续跳过，首次为假后停止判定 |
| | `compress(data, selectors)` | 根据布尔掩码序列 `selectors` 筛选 `data` 元素 |
| | `accumulate(iterable[, func, *, initial])` | 产出累积归约过程值（默认求和，可传入 `operator.mul` 或 `max`） |
| | `groupby(iterable, key=None)` | 将**相邻**且 `key` 相同的元素分组（使用前通常需先按同一 `key` 排序） |
| **排列组合（Combinatoric）** | `product(*iterables, repeat=1)` | 笛卡尔积，等价于多层嵌套 `for` 循环 |
| | `permutations(iterable, r=None)` | 长度为 `r` 的无重复索引全排列 |
| | `combinations(iterable, r)` | 长度为 `r` 的有序组合（元素不重复）；`combinations_with_replacement` 允许自身重复 |

```python
import itertools

# 1. Python 3.12+ itertools.batched：分批处理数据库写入或 API 请求
records = range(1, 8)
batches = list(itertools.batched(records, 3))
assert batches == [(1, 2, 3), (4, 5, 6), (7,)]

# 2. islice + count：惰性截取无限序列中的前 4 个奇数
odds = list(itertools.islice(itertools.count(start=1, step=2), 4))
assert odds == [1, 3, 5, 7]

# 3. chain.from_iterable + pairwise：展平二维流并计算相邻差分
nested = [[10, 13], [19, 20]]
flat = itertools.chain.from_iterable(nested)
diffs = [b - a for a, b in itertools.pairwise(flat)]
assert diffs == [3, 6, 1]
```

---

## 生成器（Generators）：`yield` 与 `yield from`

### 生成器函数与普通函数的本质差异：调用返回生成器对象、暂停与恢复栈帧（Frame）状态

在 Python 中，只要函数体内部出现了 `yield` 关键字（无论是否能执行到），编译器就会将该函数的代码对象标记为 `CO_GENERATOR`。调用生成器函数时，它与普通函数有本质区别：

1. **调用不立即执行函数体**：调用 `gen_func()` 不会运行函数内的任何一行代码，而是立即返回一个实现了迭代器协议的**生成器对象（`types.GeneratorType`）**。
2. **栈帧（Frame）分配在堆内存并支持挂起/恢复**：普通函数调用时在调用栈上创建栈帧，遇到 `return` 后栈帧立即销毁；而生成器对象内部持有一个独立的执行栈帧（`gi_frame`），保存着局部变量表、指令指针（`f_lasti`）和求值栈：
    - 每次调用 `next(gen)` 时，解释器恢复 `gi_frame` 并从上次暂停处继续执行，直到遇到下一个 `yield expr`，将 `expr` 的值产出给调用方，并**原地冻结**当前栈帧。
    - 当函数体执行完毕或遇到 `return value` 时，栈帧销毁并抛出 `StopIteration(value)`。

```python
import inspect

def simple_gen(x: int):
    y = x + 1
    yield y
    z = y * 10
    yield z

g = simple_gen(5)
assert inspect.isgeneratorfunction(simple_gen) is True
assert inspect.isgenerator(g) is True

# 首次 next()：执行到第一个 yield y 暂停，局部变量 x=5, y=6 保留在 gi_frame 中
assert next(g) == 6
assert g.gi_frame.f_locals == {"x": 5, "y": 6}

# 第二次 next()：从暂停处恢复，计算 z=60 并产出
assert next(g) == 60
assert g.gi_frame.f_locals == {"x": 5, "y": 6, "z": 60}
```

### 生成器对象的生命周期状态（`GEN_CREATED` / `GEN_RUNNING` / `GEN_SUSPENDED` / `GEN_CLOSED`）

通过 `inspect.getgeneratorstate(gen)` 可以精确观测生成器对象在其生命周期中的四个状态迁移：

| 状态常量 | 触发时机与含义 | `gi_frame` 与 `gi_running` 特征 |
| :--- | :--- | :--- |
| `GEN_CREATED` | 刚调用生成器函数创建对象，尚未执行过第一次 `next()` 或 `send(None)` | `gi_frame` 非空，`f_lasti` 处于起始位置 |
| `GEN_RUNNING` | 解释器当前正在该生成器栈帧内部执行代码（仅在生成器内部自省或多线程竞争时可见） | `gi_running is True` |
| `GEN_SUSPENDED` | 在某个 `yield` 表达式处暂停挂起，等待外部下一次唤醒 | `gi_frame` 非空，`gi_running is False` |
| `GEN_CLOSED` | 生成器自然耗尽（抛出 `StopIteration`）、内部未捕获异常退出或调用了 `gen.close()` | `gi_frame is None`（栈帧已释放） |

```python
import inspect

def lifecycle_demo():
    # 在生成器内部观测自身，处于 GEN_RUNNING
    yield inspect.getgeneratorstate(g)

g = lifecycle_demo()
assert inspect.getgeneratorstate(g) == inspect.GEN_CREATED

running_state = next(g)
assert running_state == inspect.GEN_RUNNING
assert inspect.getgeneratorstate(g) == inspect.GEN_SUSPENDED

try:
    next(g)
except StopIteration:
    pass

assert inspect.getgeneratorstate(g) == inspect.GEN_CLOSED
```

### 生成器双向通信接口：`send(value)` 注入值、`throw(exc)` 注入异常与 `close()` 触发 `GeneratorExit`

PEP 342 将 `yield` 从单向输出语句升级为**双向表达式**（`received = yield produced`），赋予了生成器对象三个控制接口，使其成为早期协程的基石：

1. **`gen.send(value)`**：将 `value` 作为当前暂停处 `yield` 表达式的求值结果注入生成器内部，并推进到下一个 `yield`。
    - **预激约束（Priming）**：处于 `GEN_CREATED` 状态的生成器尚未到达任何 `yield` 接收点，因此**首次唤醒必须调用 `next(gen)` 或 `gen.send(None)`**，否则会直接抛出 `TypeError: can't send non-None value to a just-started generator`。
2. **`gen.throw(exc)`**：在生成器当前暂停的 `yield` 位置原地抛出异常 `exc`。若生成器内部通过 `try...except` 捕获了该异常并继续执行到下一个 `yield`，则该产出值作为 `throw()` 的返回值；若未捕获，则异常向上冒泡且生成器进入 `GEN_CLOSED`。
3. **`gen.close()`**：在暂停的 `yield` 处注入 `GeneratorExit` 异常（注意 `GeneratorExit` 直接继承自 `BaseException` 而非 `Exception`），用于触发生成器的 `finally` 或 `with` 资源清理逻辑。

```python
class ResetSignal(Exception):
    """用于重置累加器的控制信号异常"""

def running_accumulator(initial: int = 0):
    total = initial
    try:
        while True:
            try:
                delta = yield total
                if delta is not None:
                    total += delta
            except ResetSignal:
                total = 0  # 捕获 throw 注入的信号并继续运行到下一轮 yield
    finally:
        # gen.close() 触发 GeneratorExit 时必定执行此清理块
        total = -1

acc = running_accumulator(10)
assert next(acc) == 10                 # 预激生成器，产出初始值 10
assert acc.send(5) == 15               # 注入 5，total 变为 15 并产出
assert acc.send(20) == 35              # 注入 20，total 变为 35 并产出
assert acc.throw(ResetSignal()) == 0   # 注入异常重置状态，并返回下一轮 yield 的 0
acc.close()                            # 触发 GeneratorExit，执行 finally 后关闭
```

!!! warning "注意：切勿在拦截 `GeneratorExit` 后继续 `yield` 值"
    当外部调用 `gen.close()` 或垃圾回收器销毁未耗尽的生成器时，生成器内部若捕获了 `GeneratorExit`（或使用了裸 `except:`）并尝试再次执行 `yield value`，解释器会立即抛出 `RuntimeError: generator ignored GeneratorExit`。清理资源应当始终放在 `try ... finally` 或 `with` 块中完成。

### `yield from` 子生成器委托语法：打通调用方与子生成器的双向通道并自动捕获 `StopIteration.value` 返回值

在需要组合或递归调用多个生成器时，如果使用传统的 `for item in subgen: yield item`，它只能单向转发产出的值，无法将调用方的 `send()`、`throw()` 和 `close()` 透传给内层子生成器。Python 引入的 `result = yield from subgen`（PEP 380）构建了一条**透明双向管道**：

- **双向直通**：调用方对委派生成器（Delegating Generator）发起的每一次 `next()`、`send(val)`、`throw(exc)` 与 `close()`，都会由解释器直接转发给底层的子生成器（Subgenerator），委派生成器自身在此期间处于挂起阻塞状态。
- **自动捕获 `return` 返回值**：当子生成器执行 `return final_val` 时，解释器内部会自动抛出 `StopIteration(final_val)`；`yield from` 表达式会**自动拦截该异常并将 `exc.value`（即 `final_val`）作为整个 `yield from` 表达式的求值结果**赋给左侧变量。

```python
def sub_averager():
    """子生成器：持续接收浮点数，收到 None 时通过 return 返回最终统计结果"""
    total = 0.0
    count = 0
    while True:
        val = yield
        if val is None:
            break
        total += val
        count += 1
    return total / count if count else 0.0  # 将结果封装进 StopIteration.value

def delegating_collector(results: dict[str, float], key: str):
    """委派生成器：透明转发 send() 数据，并直接用赋值语句接收子生成器的 return 值"""
    results[key] = yield from sub_averager()

report: dict[str, float] = {}
pipe = delegating_collector(report, "latency_ms")
next(pipe)            # 预激，直达 sub_averager 的 yield
pipe.send(12.0)       # 直接穿透给 sub_averager
pipe.send(18.0)

try:
    pipe.send(None)   # 触发 sub_averager 执行 return 15.0
except StopIteration:
    pass

assert report == {"latency_ms": 15.0}
```

此外，`yield from` 也是展开嵌套树或递归序列的最优雅工具：

```python
from collections.abc import Iterable

def flatten(items: Iterable):
    for x in items:
        if isinstance(x, Iterable) and not isinstance(x, (str, bytes)):
            yield from flatten(x)
        else:
            yield x

assert list(flatten([1, [2, (3, 4)], "ab"])) == [1, 2, 3, 4, "ab"]
```

### 基于生成器构建常数级内存开销（`O(1)`）的流式数据处理管道（Pipeline）

借助生成器函数与生成器表达式 `(expr for x in stream)`，我们可以将复杂的数据清洗、过滤、转换和聚合拆解为多级**拉取式（Pull-driven）流式管道**。由于每一级都只在下游请求 `next()` 时按需处理单条记录，即使处理数十 GB 的日志文件，整个管道的内存占用也始终保持为常数级 `O(1)`：

```python
from collections.abc import Iterable, Iterator

def parse_log_lines(lines: Iterable[str]) -> Iterator[tuple[str, int]]:
    """第 1 级：解析原始日志行 'STATUS LATENCY_MS'"""
    for line in lines:
        status, latency = line.strip().split()
        yield status, int(latency)

def filter_error_logs(records: Iterable[tuple[str, int]]) -> Iterator[int]:
    """第 2 级：仅保留 5xx 错误状态的延迟数据"""
    return (latency for status, latency in records if status.startswith("5"))

raw_stream = [
    "200 15",
    "502 120",
    "200 8",
    "503 240",
    "404 12",
]

# 组装惰性管道：此时没有任何一行字符串被切分或计算
pipeline = filter_error_logs(parse_log_lines(raw_stream))

# 终端消费（Sink）：sum() 逐个拉取元素并在 O(1) 内存内完成聚合
total_error_latency = sum(pipeline)
assert total_error_latency == 360
```

---

## 上下文管理协议（`with` 语句）

### `with` 语句的设计初衷：确定性资源释放与替代繁琐的 `try ... finally`

在涉及文件句柄、网络套接字、数据库连接、线程锁（`threading.Lock`）或临时修改全局状态（如 `decimal.localcontext()`）的场景中，依赖垃圾回收器（`__del__`）释放资源是不可靠的——尤其在 PyPy 等非引用计数实现或存在循环引用时，析构时机完全不确定。

在引入 `with` 语句（PEP 343）之前，开发者必须在每个调用处手写冗长且容易遗漏边界情况的 `try ... finally` 样板代码。**上下文管理协议（Context Management Protocol）**将“进入前置准备（Acquire）”与“离开确定性清理（Release）”封装进对象自身，确保无论代码块是正常执行完毕、中途 `return` / `break`，还是抛出未捕获异常，清理逻辑都**100% 确定性地立即执行**。

### 上下文管理器协议生命周期：`__enter__(self)` 资源准备与 `as` 子句接收返回值

任何同时实现了 `__enter__(self)` 和 `__exit__(self, exc_type, exc_val, exc_tb)` 方法的对象都是一个**上下文管理器（Context Manager）**。执行 `with expr as var:` 时的精确时序如下：

1. 求值 `expr` 获取上下文管理器实例 `mgr`。
2. 查找并暂存 `mgr.__exit__` 方法以备退出时调用。
3. 调用 `value = mgr.__enter__()` 完成资源分配或状态初始化。
4. 如果存在 `as var` 子句，**将 `__enter__()` 的返回值 `value`（注意：未必是 `mgr` 自身！）绑定到变量 `var`**。
5. 执行 `with` 语句体内的代码块。
6. 无论第 5 步以何种方式离开，调用 `mgr.__exit__(exc_type, exc_val, exc_tb)`。

```python
class TempConfigPatch:
    """进入时临时覆盖配置字典，退出时无条件恢复原值"""
    def __init__(self, config: dict[str, str], **overrides: str) -> None:
        self._config = config
        self._overrides = overrides
        self._backup: dict[str, str | None] = {}

    def __enter__(self) -> dict[str, str]:
        for k, v in self._overrides.items():
            self._backup[k] = self._config.get(k)
            self._config[k] = v
        # 返回被修改后的字典供 as 子句直接绑定使用
        return self._config

    def __exit__(self, exc_type, exc_val, exc_tb) -> bool:
        for k, old_v in self._backup.items():
            if old_v is None:
                self._config.pop(k, None)
            else:
                self._config[k] = old_v
        return False  # 不压制异常

app_cfg = {"ENV": "prod", "LOG_LEVEL": "INFO"}
with TempConfigPatch(app_cfg, LOG_LEVEL="DEBUG", TRACE="1") as active_cfg:
    assert active_cfg["LOG_LEVEL"] == "DEBUG"
    assert active_cfg["TRACE"] == "1"

# 离开 with 块后，配置已精确还原
assert app_cfg == {"ENV": "prod", "LOG_LEVEL": "INFO"}
```

### `__exit__(self, exc_type, exc_val, exc_tb)`：退出清理、异常三元组传参与返回 `True` 压制（吞掉）异常的机制

`__exit__` 方法接收三个与 `sys.exc_info()` 一致的异常上下文参数，并通过其布尔返回值控制异常是否继续向外冒泡：

| 离开 `with` 块的原因 | `exc_type` | `exc_val` | `exc_tb` | `__exit__` 返回值的影响 |
| :--- | :--- | :--- | :--- | :--- |
| **正常结束**（或 `return` / `break` / `continue`） | `None` | `None` | `None` | 忽略返回值，正常继续执行后续代码 |
| **语句块内抛出异常 `e`** | `type(e)`（异常类） | `e`（异常实例） | `<traceback>`（栈回溯对象） | 若返回 **真值（`True`）**，则**压制（吞掉）该异常**，程序从 `with` 块之后继续正常往下执行；若返回 **假值（`False` 或 `None`）**，异常在 `__exit__` 结束后继续向上冒泡 |

```python
class SwallowZeroDivision:
    def __init__(self) -> None:
        self.intercepted: Exception | None = None

    def __enter__(self) -> "SwallowZeroDivision":
        return self

    def __exit__(self, exc_type, exc_val, exc_tb) -> bool:
        if exc_type is not None and issubclass(exc_type, ZeroDivisionError):
            self.intercepted = exc_val
            return True  # 返回 True：显式压制 ZeroDivisionError
        return False     # 其他异常返回 False，继续正常向外抛出

guard = SwallowZeroDivision()
with guard:
    _ = 100 / 0  # 异常被 __exit__ 拦截并吞掉，不会中断后续代码

assert isinstance(guard.intercepted, ZeroDivisionError)
```

!!! note "底层原理"
    如果 `__exit__` 方法省略了 `return` 语句，Python 函数默认返回 `None`（布尔求值为 `False`），因此默认行为是**绝不吞掉任何异常**。只有在像 `contextlib.suppress` 这样明确以忽略特定异常为目标的上下文管理器中，才应当显式返回 `True`。

### Python 3.10+ 括号化多上下文管理器语法

当一个代码块需要同时管理多个资源（例如同时打开输入文件、输出文件和数据库连接）时，Python 3.10+ 原生支持使用**圆括号 `(...)` 包裹多行上下文管理器**，彻底告别了过去丑陋的反斜杠 `\` 续行符。多个管理器等价于由外向内层层嵌套，其 `__enter__` 按书写顺序正序执行，而 `__exit__` 则按**后进先出（LIFO）逆序执行**：

```python
import io

with (
    io.StringIO("line1\nline2") as src,
    io.StringIO() as dst,
):
    for line in src:
        dst.write(line.upper())
    output = dst.getvalue()

assert output == "LINE1\nLINE2"
assert src.closed and dst.closed
```

### `contextlib` 标准库精讲：`@contextmanager` 基于 `yield` 实现上下文管理器、`suppress`、`closing` 与 `ExitStack` 动态管理未知数量资源

标准库 `contextlib` 提供了丰富的工具，免去了为简单场景编写完整类的繁琐工作：

1. **`@contextlib.contextmanager`**：将包含**单次 `yield`** 的生成器函数直接转化为上下文管理器：
    - `yield` 之前的代码充当 `__enter__`，`yield` 产出的值作为 `as` 子句的绑定目标；
    - `yield` 之后的代码充当 `__exit__`；
    - **关键机制**：若 `with` 块内发生异常，装饰器会通过 `gen.throw(exc)` 将该异常**在 `yield` 暂停处原地抛出**！因此，**必须使用 `try ... finally` 包裹 `yield`**，才能确保异常发生时清理代码依然执行。
2. **`contextlib.suppress(*exceptions)`**：优雅地忽略指定的异常类型，比手写 `try ... except SomeError: pass` 语义更清晰。
3. **`contextlib.closing(thing)`**：为那些只提供了 `.close()` 方法但未实现 `__enter__`/`__exit__` 的遗留对象自动补齐退出时的 `.close()` 调用。
4. **`contextlib.ExitStack`**：维护一个后进先出（LIFO）的清理回调栈，专门解决**在运行期动态进入未知数量个上下文管理器**（如批量打开配置列表中的所有文件）或按条件注册清理动作的工程难题。

```python
from contextlib import ExitStack, contextmanager, suppress
import io

# 1. @contextmanager 标准范式：必须用 try...finally 守护 yield
@contextmanager
def tag_wrapper(name: str, buf: list[str]):
    buf.append(f"<{name}>")
    try:
        yield buf
    finally:
        # 即使 with 块内抛出异常，finally 也能保证闭合标签被写入
        buf.append(f"</{name}>")

events: list[str] = []
with suppress(ValueError):
    with tag_wrapper("tx", events):
        events.append("working")
        raise ValueError("abort")

assert events == ["<tx>", "working", "</tx>"]

# 2. ExitStack：动态管理任意数量资源的生命周期
streams_data = ["alpha", "beta", "gamma"]
with ExitStack() as stack:
    # 在循环中动态将每个 StringIO 压入 ExitStack 管理
    buffers = [stack.enter_context(io.StringIO(text)) for text in streams_data]
    # 还可以注册任意清理回调函数（按 LIFO 逆序执行）
    stack.callback(events.append, "all_streams_closed")
    combined = "-".join(b.read() for b in buffers)

assert combined == "alpha-beta-gamma"
assert all(b.closed for b in buffers)
assert events[-1] == "all_streams_closed"
```

---

## 原生协程与异步语法协议（`async` / `await`）

### 从基于生成器的协程（`@types.coroutine`）演进到原生协程（`async def` 与 `coroutine` 对象）

在 Python 3.4 引入 `asyncio` 初期，协程是借用生成器（`yield from`）实现的，导致“普通数据流生成器”与“异步协程”在语法和类型上极易混淆。为此，PEP 492（Python 3.5+）正式引入了 `async def` 与 `await` 关键字，确立了**原生协程（Native Coroutines）**体系：

- 使用 `async def` 定义的函数称为**协程函数**，其代码对象带有 `CO_COROUTINE` 标志。
- 调用协程函数返回的不是生成器，而是独立的**原生协程对象（`types.CoroutineType`）**。
- 原生协程在底层依然复用了生成器的栈帧暂停/恢复机制（通过 `cr_frame` 保存状态，底层通过 `.send(None)` 驱动），但在类型层面与生成器严格隔离：原生协程**不是 `Iterator`**，不能对其调用 `next(coro)` 或将其直接放入同步 `for` 循环中。
- 早期用于桥接生成器与原生协程的 `@asyncio.coroutine` 已在 Python 3.11 中彻底移除；如今仅保留底层的 `@types.coroutine` 供框架编写底层 Future 衔接器。

| 特性对比 | 生成器对象（`def` + `yield`） | 原生协程对象（`async def`） | 异步生成器对象（`async def` + `yield`） |
| :--- | :--- | :--- | :--- |
| **创建方式** | 调用含 `yield` 的 `def` 函数 | 调用不含 `yield` 的 `async def` 函数 | 调用含 `yield` 的 `async def` 函数 |
| **核心协议** | `Iterator`（`__iter__` + `__next__`） | `Awaitable` / `Coroutine`（`__await__`） | `AsyncIterator`（`__aiter__` + `__anext__`） |
| **栈帧属性** | `gi_frame` | `cr_frame` | `ag_frame` |
| **消费语法** | `for x in gen:` / `next(gen)` | `await coro` | `async for x in agen:` / `await anext(agen)` |

### 可等待对象协议（Awaitable）：协程（Coroutine）、任务（Task）、Future 与自定义 `__await__` 魔术方法

什么对象可以紧跟在 `await` 关键字后面？答案是由 `collections.abc.Awaitable` 定义的**可等待对象协议**：任何实现了 `__await__(self)` 方法（该方法必须返回一个迭代器）的对象都是 `Awaitable`。在标准异步编程中，可等待对象主要分为三大类：

1. **原生协程（`Coroutine`）**：调用 `async def` 函数产生的对象。注意，仅通过 `await coro` 等待一个协程只是以同步串行方式将其挂接到当前调用链上，**不会**自动将其调度为并发任务。
2. **任务（`asyncio.Task`）**：对协程对象的并发调度封装（通过 `asyncio.create_task()` 或 Python 3.11+ `asyncio.TaskGroup.create_task()` 创建）。创建后立即注册到事件循环的就绪队列中，与其他任务并发交替执行。
3. **期物（`asyncio.Future`）**：代表一个“尚未完成但未来会产生结果或异常”的底层占位容器（`Task` 是 `Future` 的子类）。
4. **自定义 `Awaitable`**：任何实现了 `__await__(self)` 并返回迭代器的自定义类实例。

```python
import asyncio
from collections.abc import Awaitable

class ImmediateValue:
    """实现 __await__ 魔术方法的自定义 Awaitable 对象"""
    def __init__(self, value: int) -> None:
        self.value = value

    def __await__(self):
        # 暂停一次控制权（yield None 给事件循环），随后通过 return 返回最终结果
        yield
        return self.value * 2

async def verify_awaitable() -> int:
    obj = ImmediateValue(21)
    assert isinstance(obj, Awaitable) is True
    return await obj

assert asyncio.run(verify_awaitable()) == 42
```

### `await` 表达式的暂停点语义：交还控制权给事件循环并等待底层可等待对象完成

在协作式多任务（Cooperative Multitasking）模型中，单线程事件循环（Event Loop）之所以能并发处理成千上万个网络连接，全靠 `await` 提供的**显式让出点（Suspension Point）**：

- 当协程执行到 `result = await awaitable` 时，它在底层等价于对 `awaitable.__await__()` 返回的迭代器执行 `yield from`。
- 如果底层 I/O 操作尚未就绪（例如等待 Socket 可读或定时器到期），底层的 `Future.__await__()` 会 `yield self`，将当前协程的栈帧一路挂起，并**把 CPU 控制权交还给事件循环**，让事件循环去驱动其他已就绪的 `Task`。
- 一旦操作系统的 I/O 多路复用器（如 `epoll` / `kqueue`）通知事件循环该句柄已就绪，事件循环便调用 `future.set_result(data)`，并在下一轮调度中通过 `coro.send(None)` 唤醒原先挂起的协程，使其拿到 `result` 并从 `await` 表达式处无缝继续向下执行。

!!! warning "注意：`async def` 内严禁调用同步阻塞 I/O"
    只有在遇到 `await`、`async for` 或 `async with` 时，协程才可能挂起并交出事件循环控制权。如果在 `async def` 内部调用了 `time.sleep(5)` 或 `requests.get()` 等传统同步阻塞函数，整个单线程事件循环将被彻底卡死 5 秒，期间所有其他并发任务均无法推进！应改用 `await asyncio.sleep(5)`、异步客户端库，或通过 `await asyncio.to_thread(blocking_fn)` 卸载到线程池。

### 异步迭代协议：`__aiter__`、`__anext__`、`StopAsyncIteration` 与 `async for` 循环

当迭代器每推进一个元素都需要执行异步 I/O 操作（如从异步数据库游标逐行拉取记录、从 WebSocket 持续接收消息帧）时，同步的 `__next__` 无法使用 `await`。为此 Python 提供了**异步迭代协议（Asynchronous Iteration Protocol）**：

- **异步可迭代对象（`AsyncIterable`）**：实现 `__aiter__(self)`，必须**直接返回一个异步迭代器对象**（注意：`__aiter__` 本身是普通同步方法，不是 `async def`）。
- **异步迭代器（`AsyncIterator`）**：同时实现 `__aiter__(self)`（返回 `self`）与 **`async def __anext__(self)`**（返回一个 `Awaitable`）。当元素耗尽时，必须抛出 **`StopAsyncIteration`**（与协程内部的 `StopIteration` 严格区分）。
- **内置函数与语法**：Python 3.10+ 提供了内置函数 `aiter(async_iterable)` 与 `await anext(async_iterator[, default])`，并在 `async def` 内部支持 `async for` 循环以及异步推导式 `[x async for x in aiter_obj]`。

```python
import asyncio

class AsyncCountdown:
    """既可在 __anext__ 中执行 await，又支持 async for 的异步迭代器"""
    def __init__(self, start: int) -> None:
        self.current = start

    def __aiter__(self) -> "AsyncCountdown":
        return self

    async def __anext__(self) -> int:
        if self.current <= 0:
            raise StopAsyncIteration
        await asyncio.sleep(0)  # 模拟异步 I/O 等待
        val = self.current
        self.current -= 1
        return val

async def main() -> list[int]:
    # 1. 使用内置 aiter() 和 anext()（Python 3.10+）
    it = aiter(AsyncCountdown(2))
    first = await anext(it)
    second = await anext(it)
    eof = await anext(it, -1)
    assert (first, second, eof) == (2, 1, -1)

    # 2. 使用异步列表推导式（底层基于 async for）
    return [n * 10 async for n in AsyncCountdown(3)]

assert asyncio.run(main()) == [30, 20, 10]
```

### 异步上下文管理协议：`__aenter__`、`__aexit__`、`async with` 与 `@contextlib.asynccontextmanager`

同理，当资源的获取（如建立异步 TCP 连接、开启数据库事务）和释放（如发送关闭握手包、提交/回滚异步事务）本身需要 `await` 时，需要使用**异步上下文管理协议（`async with`）**：

- 实现 **`async def __aenter__(self)`** 和 **`async def __aexit__(self, exc_type, exc_val, exc_tb)`**。这两个方法返回的都是 `Awaitable`，解释器在进入和离开 `async with` 块时会自动对它们执行 `await`。
- 标准库同样提供了 **`@contextlib.asynccontextmanager`** 装饰器（可将包含 `yield` 的**异步生成器函数**直接转化为异步上下文管理器）以及 **`contextlib.AsyncExitStack`**。

```python
import asyncio
from contextlib import asynccontextmanager

@asynccontextmanager
async def async_db_transaction(log: list[str]):
    await asyncio.sleep(0)  # 模拟异步 BEGIN TRANSACTION
    log.append("BEGIN")
    try:
        yield "tx_conn"
    except Exception:
        await asyncio.sleep(0)  # 模拟异步 ROLLBACK
        log.append("ROLLBACK")
        raise
    else:
        await asyncio.sleep(0)  # 模拟异步 COMMIT
        log.append("COMMIT")
    finally:
        log.append("RELEASE_CONN")

async def run_tx_test() -> list[str]:
    history: list[str] = []
    # 场景 1：正常提交
    async with async_db_transaction(history) as conn:
        history.append(f"EXEC_ON_{conn}")

    # 场景 2：异常触发自动回滚
    try:
        async with async_db_transaction(history):
            raise RuntimeError("constraint violation")
    except RuntimeError:
        pass
    return history

expected = [
    "BEGIN", "EXEC_ON_tx_conn", "COMMIT", "RELEASE_CONN",
    "BEGIN", "ROLLBACK", "RELEASE_CONN",
]
assert asyncio.run(run_tx_test()) == expected
```

---

## 练习与实战

### 练习 1：实现支持重复遍历与惰性滑动窗口的可迭代容器 `SlidingWindow`

请编写一个类 `SlidingWindow(iterable, size)`，满足以下工程要求：

1. 该对象是一个**可重复遍历的 `Iterable`**（假设传入的 `iterable` 本身也是可重复遍历的容器，如 `list` 或 `tuple`），但 `SlidingWindow` 实例自身**不能**是 `Iterator`（必须将容器与遍历游标分离）。
2. 每次对其迭代时，惰性产出长度为 `size` 的连续滑动窗口元组（例如输入 `[1, 2, 3, 4]`，`size=2`，依次产出 `(1, 2)`、`(2, 3)`、`(3, 4)`）。
3. 当输入元素总数小于 `size` 时，不产出任何元素；若 `size <= 0`，在初始化时抛出 `ValueError`。

??? success "点击查看答案与解析"
    **核心思路**：在 `SlidingWindow.__iter__` 中使用生成器函数（或 `collections.deque(maxlen=size)`）来充当每次遍历时创建的独立游标对象。利用 `deque(maxlen=size)` 可以在 `O(1)` 空间和时间内维护定长滑动窗口，无需对输入做整表复制。

    ```python
    from collections import deque
    from collections.abc import Iterable, Iterator
    from typing import Generic, TypeVar

    T = TypeVar("T")

    class SlidingWindow(Generic[T]):
        def __init__(self, data: Iterable[T], size: int) -> None:
            if size <= 0:
                raise ValueError("Window size must be positive")
            self._data = data
            self._size = size

        def __iter__(self) -> Iterator[tuple[T, ...]]:
            # 每次调用 __iter__ 都会创建一个全新的生成器游标对象
            it = iter(self._data)
            window: deque[T] = deque(maxlen=self._size)

            # 先尝试填满第一个窗口
            for _ in range(self._size):
                try:
                    window.append(next(it))
                except StopIteration:
                    return  # 元素总数不足 size，直接终止生成

            yield tuple(window)

            # 后续每推进一个元素，deque 自动挤出最左侧旧元素
            for item in it:
                window.append(item)
                yield tuple(window)

    # 验证容器与游标分离、边界情况与多次遍历
    sw = SlidingWindow([10, 20, 30, 40], size=3)
    assert isinstance(sw, Iterable) is True
    assert isinstance(sw, Iterator) is False

    assert list(sw) == [(10, 20, 30), (20, 30, 40)]
    assert list(sw) == [(10, 20, 30), (20, 30, 40)]  # 第二次遍历依然完整
    assert list(SlidingWindow([1, 2], size=5)) == []
    ```

### 练习 2：利用 `yield from` 与双向生成器实现带状态汇总的流式分块处理器

请编写两个配合工作的生成器函数：

1. 子生成器 `chunk_collector(size: int)`：通过 `val = yield` 持续接收外部 `send()` 进来的整数。每凑满 `size` 个整数，或者当收到 `None`（代表本轮结束信号）时，通过 `return tuple(buffer)` 返回当前收集到的元组并结束该子生成器。
2. 委派生成器 `batch_router(size: int, output: list[tuple[int, ...]])`：在一个无限循环中使用 `batch = yield from chunk_collector(size)` 将外部 `send()` 的数据委托给子生成器，并将子生成器每次 `return` 的非空元组追加到 `output` 列表中。

??? success "点击查看答案与解析"
    **核心思路**：子生成器 `chunk_collector` 在收集满 `size` 个元素或收到 `None` 时直接 `return tuple(buf)`，触发 `StopIteration(tuple(buf))`。外层委派生成器 `batch_router` 通过 `batch = yield from chunk_collector(size)` 自动拆包获取该返回值，若非空则写入 `output`，随后进入下一轮 `while True` 开启新的子生成器。

    ```python
    from collections.abc import Generator

    def chunk_collector(size: int) -> Generator[None, int | None, tuple[int, ...]]:
        buf: list[int] = []
        while len(buf) < size:
            item = yield
            if item is None:
                break
            buf.append(item)
        return tuple(buf)

    def batch_router(
        size: int, output: list[tuple[int, ...]]
    ) -> Generator[None, int | None, None]:
        while True:
            # yield from 打通 send 通道，并自动捕获子生成器 return 的元组
            batch = yield from chunk_collector(size)
            if batch:
                output.append(batch)

    collected: list[tuple[int, ...]] = []
    router = batch_router(3, collected)
    next(router)  # 预激生成器

    for num in [1, 2, 3, 4, 5]:
        router.send(num)

    # 发送 None 强制刷出最后未满 3 个元素的尾块 (4, 5)
    router.send(None)
    router.close()

    assert collected == [(1, 2, 3), (4, 5)]
    ```

### 练习 3：基于 `@contextmanager` 与 `ExitStack` 实现原子性多字典事务回滚管理器

请使用 `@contextlib.contextmanager` 编写一个上下文管理器 `atomic_dict_update(*dicts: dict)`：

1. 支持同时传入任意数量个字典对象（例如 `with atomic_dict_update(d1, d2) as (m1, m2):`）。
2. 如果 `with` 代码块正常执行完毕，所有对 `d1, d2, ...` 的原地修改均保留。
3. 如果 `with` 代码块内部抛出了任何 `Exception`，则在退出时将**所有**传入字典的内容原地恢复（`clear()` 后 `update()` 回进入前的快照状态），并将原始异常继续向上抛出（不得吞掉异常）。

??? success "点击查看答案与解析"
    **核心思路**：在 `yield` 之前为每个传入的字典制作浅拷贝快照；使用 `try ... except Exception:` 捕获代码块内的业务异常，一旦捕获到异常，立即遍历所有目标字典并将其原地还原为快照数据，最后使用裸 `raise` 将原始异常原样重抛。

    ```python
    from contextlib import contextmanager
    from typing import Any

    @contextmanager
    def atomic_dict_update(*dicts: dict[Any, Any]):
        # __enter__ 阶段：保存所有字典的进入前快照
        snapshots = [d.copy() for d in dicts]
        try:
            yield dicts
        except Exception:
            # __exit__ 异常分支：原地回滚所有字典状态
            for target, snap in zip(dicts, snapshots, strict=True):
                target.clear()
                target.update(snap)
            raise  # 必须原样重抛，不吞掉业务异常

    user_db = {"alice": 100}
    audit_db = {"tx_count": 1}

    # 1. 异常场景：两张表均回滚到初始状态
    try:
        with atomic_dict_update(user_db, audit_db) as (u, a):
            u["alice"] -= 50
            a["tx_count"] += 1
            raise RuntimeError("network timeout")
    except RuntimeError:
        pass

    assert user_db == {"alice": 100}
    assert audit_db == {"tx_count": 1}

    # 2. 正常场景：修改成功提交
    with atomic_dict_update(user_db, audit_db) as (u, a):
        u["alice"] -= 50
        a["tx_count"] += 1

    assert user_db == {"alice": 50}
    assert audit_db == {"tx_count": 2}
    ```
