# 异常机制

异常（Exception）并非仅仅代表“程序写错了导致的崩溃”，它是现代高级语言中用于**跨调用栈帧传递控制信号、表达前置/后置契约失败以及实现并发故障隔离**的结构化控制流机制。从经典的 `try-except-else-finally` 到显式异常链（`raise ... from`），再到 Python 3.11+ 为结构化并发引入的异常组（`ExceptionGroup` 与 `except*`），掌握 Python 异常体系是编写高可靠生产级代码的必备基础。

---

## Python 异常继承树与设计哲学

### 顶层基类分野：`BaseException`（含 `SystemExit`、`KeyboardInterrupt`、`GeneratorExit`）与业务常规异常基类 `Exception`

在 Python 中，所有能够被 `raise` 抛出和被 `except` 捕获的对象，其所属类都必须继承自唯一的顶层根类 **`BaseException`**。但 Python 核心开发者刻意将 `BaseException` 的直接子类划分为两大阵营：

1. **系统/解释器退出与控制流信号（直接继承自 `BaseException`）**：它们**不是程序业务错误**，而是要求当前栈帧立即执行 `finally` 清理并退出的生命周期信号：
    - `SystemExit`：调用 `sys.exit()` 时抛出，通知解释器正常或带退出码终止进程。
    - `KeyboardInterrupt`：用户在终端按下 `Ctrl+C`（发送 `SIGINT`）时抛出，请求中断程序。
    - `GeneratorExit`：调用生成器或协程的 `.close()` 方法时抛出，通知其释放内部资源。
    - `BaseExceptionGroup`（Python 3.11+）：可包含上述系统级异常的顶层异常组。
2. **常规程序与业务异常（继承自 `Exception`）**：所有内置运行时错误（如 `ValueError`、`KeyError`、`OSError`）以及**所有用户自定义异常**都继承自 `Exception`（以及 `ExceptionGroup`）。

```text
BaseException
 ├── BaseExceptionGroup (Python 3.11+)
 │    └── ExceptionGroup (Python 3.11+)
 ├── GeneratorExit          # 生成器/协程 .close() 清理信号
 ├── KeyboardInterrupt      # 用户 Ctrl+C 中断信号
 ├── SystemExit             # sys.exit() 进程退出信号
 └── Exception              # 【分水岭】所有常规错误与自定义异常的共同基类
      ├── ArithmeticError -> ZeroDivisionError, OverflowError
      ├── AttributeError
      ├── LookupError     -> IndexError, KeyError
      ├── OSError         -> FileNotFoundError, PermissionError, TimeoutError, ConnectionError
      ├── RuntimeError    -> RecursionError, NotImplementedError
      ├── StopIteration / StopAsyncIteration
      ├── TypeError
      └── ValueError      -> UnicodeDecodeError, JSONDecodeError
```

### 为什么工程中严禁使用裸 `except:` 或宽泛捕获 `BaseException`？

在工程代码审查（Code Review）与静态检查工具（如 `ruff` 的 `E722` / `BLE001` 规则）中，编写裸 `except:`（等价于 `except BaseException:`）是严重的缺陷，原因在于：

1. **劫持 `Ctrl+C` 与进程退出**：如果循环体内写了 `except:` 并吞掉异常（或无限重试），用户按下 `Ctrl+C` 触发的 `KeyboardInterrupt` 以及调用 `sys.exit()` 触发的 `SystemExit` 都会被当成普通错误拦截，导致进程变成无法用常规手段停止的“僵尸循环”。
2. **破坏生成器生命周期**：在生成器的 `yield` 周围捕获 `BaseException` 会拦截 `GeneratorExit`，若随后未能正常退出，解释器将直接抛出 `RuntimeError: generator ignored GeneratorExit`。
3. **掩盖拼写错误与语法级 Bug**：即便是 `except Exception:`，如果不加区分地吞掉异常，也会把代码块内部因变量名拼错触发的 `NameError`、类型传错触发的 `TypeError` 伪装成“业务操作失败”，极大增加排障成本。

```python
import sys

def bad_shutdown_handler():
    try:
        sys.exit(0)  # 抛出 SystemExit(0)，期望立即退出程序
    except Exception:
        # 正确：except Exception 不会拦截 SystemExit，异常会正常向上穿透
        return "caught by Exception"

try:
    bad_shutdown_handler()
    raised_system_exit = False
except SystemExit as exc:
    raised_system_exit = (exc.code == 0)

assert raised_system_exit is True
```

!!! tip "工程实践"
    - 业务代码应始终**遵循最小捕获原则**，只捕获预期内的具体异常（如 `except (KeyError, ValueError):`）。
    - 只有在顶层框架的主循环、RPC 工作线程入口或全局日志中间件需要兜底记录未知崩溃时，才使用 `except Exception as exc:`（配合 `logger.exception(...)`），且绝不拦截 `BaseException`（除非捕获后立即执行裸 `raise` 重新抛出）。

### 核心内置异常层级图谱（`LookupError` -> `IndexError` / `KeyError`、`ValueError`、`TypeError`、`AttributeError`、`OSError` 子树）

熟练掌握常见内置异常的抽象层级，可以帮助我们在正确的粒度上捕获或抛出异常：

| 内置异常类 | 直接父类 | 触发语义与典型场景 |
| :--- | :--- | :--- |
| **`LookupError`** | `Exception` | **抽象查找基类**：同时涵盖序列下标越界与映射键缺失。捕获 `LookupError` 可一次性处理 `list` 与 `dict` 的查找失败 |
| `IndexError` | `LookupError` | 序列（`list`、`tuple`、`str`）整数下标超出有效范围 |
| `KeyError` | `LookupError` | 映射（`dict`）或集合（`set.remove`）中不存在目标键 |
| **`ValueError`** | `Exception` | 传入参数的**类型正确，但值不符合域约束**（如 `int("abc")`、`math.sqrt(-1)`） |
| **`TypeError`** | `Exception` | 操作或函数应用于**不兼容的对象类型**（如 `1 + "2"`、调用不可调用对象、参数个数不匹配） |
| **`AttributeError`** | `Exception` | 访问或赋值对象不存在的属性/方法（如 `None.split()`） |
| **`OSError`** | `Exception` | 操作系统级系统调用失败（I/O、文件、网络）。Python 3.3+ 将原 `IOError`、`socket.error` 统一合并为 `OSError` 的别名，并根据 `errno` 细分出丰富子类 |
| `FileNotFoundError` | `OSError` | 打开不存在的文件或目录（对应 `errno.ENOENT`） |
| `PermissionError` | `OSError` | 缺少文件系统或端口绑定权限（对应 `errno.EACCES` / `EPERM`） |
| `TimeoutError` | `OSError` | 系统级或 `asyncio.timeout()`（Python 3.11+ 已将 `asyncio.TimeoutError` 统一为内置 `TimeoutError`）超时 |

```python
def safe_fetch(container: list[str] | dict[int, str], key: int) -> str | None:
    try:
        return container[key]
    except LookupError:
        # 多态捕获：无论 container 是 list（抛 IndexError）还是 dict（抛 KeyError），均能优雅兜底
        return None

assert safe_fetch(["a", "b"], 5) is None
assert safe_fetch({1: "a"}, 5) is None
assert safe_fetch(["a", "b"], 1) == "b"
```

### LBYL（Look Before You Leap，事先检查）与 EAFP（Easier to Ask for Forgiveness than Permission，事后捕获）的适用权衡

Python 社区在错误处理风格上常对比两种思维范式：

- **LBYL（Look Before You Leap，三思而后行）**：在执行操作前先用 `if` 语句显式检查所有前置条件（例如 `if key in d: val = d[key]`，或 `if os.path.exists(p): open(p)`）。
- **EAFP（Easier to Ask for Forgiveness than Permission，先斩后奏）**：直接尝试执行核心操作，一旦失败则由 `try ... except` 捕获异常进行处理。这是 Python 官方推荐的惯用风格（Pythonic）。

| 评估维度 | LBYL（事先检查 `if`） | EAFP（事后捕获 `try...except`） |
| :--- | :--- | :--- |
| **并发安全性（TOCTOU）** | **存在竞态漏洞**：在检查 `os.path.exists()` 与真正调用 `open()` 之间的微秒级间隙，文件可能已被其他进程删除（Time-of-Check to Time-of-Use） | **天然原子化**：直接调用操作系统 `open()` 并捕获 `FileNotFoundError`，彻底消除检查与执行分离的竞态条件 |
| **快乐路径（Happy Path）性能** | 每次访问都需要执行两次哈希查找或类型校验（如 `key in d` + `d[key]`） | **Python 3.11+ 零开销异常（Zero-Cost Exceptions）**：当不发生异常时，`try` 块几乎不产生额外字节码指令开销，仅做一次查找 |
| **异常高频触发时的代价** | `if` 分支跳转开销极低（纳秒级） | 构造异常对象与栈回溯成本较高；若失败率高达 30% 以上，EAFP 会显著慢于 LBYL 或 `.get()` |
| **最佳适用场景** | 缺失/失败是**高频常态**（优先用 `dict.get()`）、或操作具有不可逆的外部副作用 | 失败属于**低频异常分支**、涉及文件系统/网络并发 I/O、或基于鸭子类型的协议调用 |

---

## `try - except - else - finally` 完整执行流

### `except` 分支匹配规则：单异常捕获、元组多异常捕获与“子类异常必须排在父类异常之前”

当 `try` 块中抛出异常实例 `exc` 时，解释器会**自上而下**依次拿 `exc` 与各个 `except Target:` 子句进行 `isinstance(exc, Target)` 匹配，且**至多只会进入第一个匹配成功的 `except` 分支**：

1. **单异常与元组多异常**：`except ValueError as e:` 捕获单一类型及其子类；`except (KeyError, IndexError) as e:` 使用元组同时捕获多种异常类型。
2. **局部变量作用域**：通过 `as e` 绑定的异常变量 `e`，在离开 `except` 块时会被解释器**自动删除（等价于在末尾隐式执行 `del e`）**，这是为了断开异常对象的 `__traceback__` 与当前栈帧之间的循环引用，防止延迟垃圾回收。
3. **子类先于父类铁律**：由于匹配遵循自上而下短路原则，如果将父类（如 `LookupError` 或 `Exception`）写在子类（如 `KeyError`）前面，子类的专用处理分支将永远成为无法到达的死代码（Dead Code）。

```python
def classify_lookup_error(fn) -> str:
    try:
        fn()
    except KeyError:
        # 子类必须排在前面，才能获得专门处理
        return "missing_dict_key"
    except LookupError:
        # 父类排在后面，兜底其他 LookupError（如 IndexError）
        return "other_lookup_error"

assert classify_lookup_error(lambda: {}["k"]) == "missing_dict_key"
assert classify_lookup_error(lambda: [][0]) == "other_lookup_error"
```

### `else` 子句的核心工程价值：仅守护可能抛错的最小语句块，避免 `try` 块过大误捕后续代码异常

很多从其他语言转向 Python 的开发者很少使用 `try ... except ... else` 中的 `else` 子句。`else` 块的执行规则是：**仅当 `try` 块没有抛出任何异常（且未执行 `return` / `break` / `continue`）时，才会执行 `else` 块**。

它的核心工程价值在于**精确缩小 `try` 块的保护半径**。假设我们要解析一段 JSON 字符串，如果解析成功，再调用后续处理函数 `process(data)`（而 `process` 内部本身可能因 Bug 抛出同类型的异常）：

```python
def transform_payload(raw_data: dict[str, int]) -> int:
    # 模拟后续业务逻辑中因自身 Bug 触发了 KeyError
    return raw_data["misspelled_internal_key"]

def process_request(user_input: dict[str, int]) -> str:
    try:
        # try 块严格只守护“校验用户入参”这一步
        item_id = user_input["id"]
    except KeyError:
        return "400 Bad Request: missing 'id'"
    else:
        # 只有入参合法时才进入 else；此处若抛出 KeyError 属于服务端内部 Bug，
        # 绝不会被上面的 except KeyError 误捕并伪装成客户端 400 错误！
        return f"200 OK: {transform_payload({'id': item_id})}"

# 1. 用户缺少参数 -> 被 try...except 精准捕获
assert process_request({}) == "400 Bad Request: missing 'id'"

# 2. 用户参数合法，但后续代码有内部 Bug -> 在 else 中正常暴露异常，不被误吞
try:
    process_request({"id": 42})
    bug_exposed = False
except KeyError:
    bug_exposed = True

assert bug_exposed is True
```

### `finally` 子句的执行铁律：无论正常结束、未捕获异常冒泡，还是触发 `return` / `break` / `continue` 均会执行

`finally` 子句定义了离开 `try` 复合语句时的**无条件收尾屏障**。无论控制流以何种方式离开 `try` / `except` / `else`：

- `try` 与 `else` 正常执行到底；
- `try` 抛出异常并被某个 `except` 捕获处理完毕；
- `try` 抛出未匹配的异常，或者 `except` / `else` 块中抛出了新异常（此时**先执行 `finally` 块，结束后再将暂存的异常继续向上冒泡**）；
- `try`、`except` 或 `else` 块中执行了 `return`、`break` 或 `continue`（此时**先将返回值暂存到求值栈，执行完 `finally` 块后，再真正执行返回或跳转**）。

```python
def trace_execution(fail: bool) -> tuple[str, list[str]]:
    steps: list[str] = []
    def worker() -> str:
        try:
            steps.append("try")
            if fail:
                raise ValueError("boom")
            return "from_try"
        except ValueError:
            steps.append("except")
            return "from_except"
        finally:
            # 在 return 真正返回给调用方之前，finally 必定先执行
            steps.append("finally")

    res = worker()
    return res, steps

assert trace_execution(False) == ("from_try", ["try", "finally"])
assert trace_execution(True) == ("from_except", ["try", "except", "finally"])
```

### 致命反模式：在 `finally` 块中使用 `return`、`break` 或抛出新异常导致原始异常被静默覆盖丢弃

虽然 `finally` 极其可靠，但如果在 `finally` 块内部改变控制流走向（执行 `return`、`break`、`continue` 或抛出未捕获异常），会发生非常危险的**异常静默劫持**：

- 当 `try` 块中抛出了一个未捕获的严重异常（甚至包括 `KeyboardInterrupt` 或 `MemoryError`）时，解释器会先把该待抛出的异常挂起，转而去执行 `finally` 块。
- 如果 `finally` 块中执行了 **`return value`** 或 **`break`**，解释器会**直接丢弃原先挂起的异常**，当作函数正常返回了 `value`！原本应该报警的严重故障在日志中连一行 Traceback 都不会留下。

```python
def dangerous_finally() -> str:
    try:
        raise RuntimeError("Critical database corruption!")
    finally:
        # 致命反模式：finally 中的 return 会彻底吞掉上面未捕获的 RuntimeError！
        return "everything_looks_fine"

# 调用方完全感知不到 RuntimeError 的发生
assert dangerous_finally() == "everything_looks_fine"
```

!!! warning "注意：绝不在 `finally` 中使用 `return` / `break` / `continue`"
    `finally` 块只应承担纯粹的资源清理职责。如果清理操作本身可能抛出次要异常（例如关闭已断开的 Socket），应当在 `finally` 内部将其捕获或优先改用 `with` 上下文管理器，切勿使用 `return` 截断异常传播。**Python 3.14（PEP 765）起，编译器更是在语法层面直接对 `finally` 块中的 `return`、`break` 和 `continue` 发出 `SyntaxWarning` 警告**。

---

## 异常抛出与异常链（`raise` 与 `raise from`）

### `raise` 主动抛出异常实例/异常类，以及在 `except` 块中使用裸 `raise` 原样重抛（保留原始 Traceback 栈）

`raise` 语句有三种合法的调用形式：

1. **`raise ValueError("invalid id")`（抛出异常实例）**：最常用的标准写法。
2. **`raise ValueError`（抛出异常类）**：解释器会自动调用无参构造函数实例化为 `ValueError()` 后抛出。
3. **裸 `raise`（不带任何操作数，仅限 `except` 块内部）**：当我们捕获异常仅仅是为了记录日志、执行回滚或补充上下文，随后仍需将异常继续向上抛出时，**必须使用裸 `raise`，而不能写 `raise e`**！
    - 裸 `raise` 会原封不动地恢复当前正在处理的异常及其**完整的原始调用栈（Traceback）**；
    - 而 `raise e` 会将当前行作为新的抛出点追加一层重复或重置的栈帧信息，干扰根因定位。

```python
import traceback

def level_2():
    raise ValueError("root error at level_2")

def level_1():
    try:
        level_2()
    except ValueError:
        # 记录日志或回滚后，使用裸 raise 保留指向 level_2 的原始栈回溯
        raise

try:
    level_1()
except ValueError as err:
    tb_frames = [frame.name for frame in traceback.extract_tb(err.__traceback__)]
    # 栈回溯完整保留了从当前模块 -> level_1 -> level_2 的调用链
    assert "level_1" in tb_frames and "level_2" in tb_frames
```

### 隐式异常上下文（`__context__`）：在处理异常的 `except` 块中意外触发了另一个异常（*During handling of the above exception...*）

如果在处理异常 A 的 `except` 块（或 `finally` 块）中，由于代码缺陷或清理失败又**意外触发了另一个异常 B**，早期语言会直接用异常 B 覆盖异常 A，导致真正的故障源头 A 彻底丢失。

Python（PEP 3134）通过异常对象的 **`__context__`** 属性完美解决了这一问题：当在异常处理期间抛出新异常 B 时，解释器会自动将原先正在处理的异常 A 绑定到 **`B.__context__ = A`**，并在控制台打印出完整的串联回溯，中间以提示语连接：

> `During handling of the above exception, another exception occurred:`

```python
try:
    try:
        int("not_a_number")  # 原始异常 A: ValueError
    except ValueError:
        _ = 1 / 0            # 处理过程中意外触发异常 B: ZeroDivisionError
except ZeroDivisionError as outer_exc:
    assert isinstance(outer_exc.__context__, ValueError)
    assert outer_exc.__cause__ is None
    assert outer_exc.__suppress_context__ is False
```

### 显式异常链（`raise NewException(...) from original_exc` 与 `__cause__`）：跨层抽象异常转换与根因追溯（*The above exception was the direct cause...*）

在分层架构（如 DAO 数据访问层 -> Service 业务服务层 -> API 接口层）中，下层抛出的底层实现异常（如 `sqlite3.OperationalError` 或 `KeyError`）不应直接裸露给上层调用方。上层捕获底层异常后，应将其**转换为符合当前抽象层语义的领域异常**（如 `RepositoryError` 或 `ConfigLoadError`）。

此时如果直接写 `raise ConfigLoadError("...")`，它是隐式上下文（语义是“处理异常时不小心又出了个错”）；正确的做法是使用 **`raise NewException(...) from original_exc`** 建立**显式因果异常链**：

- 解释器会将 `original_exc` 绑定到新异常的 **`__cause__`** 属性上（同时自动将 `__suppress_context__` 设为 `True`）。
- 打印 Traceback 时，会以清晰的主动因果提示语串联两段栈回溯：
  > `The above exception was the direct cause of the following exception:`

### 截断异常链（`raise NewException(...) from None` 与 `__suppress_context__`）：向调用方隐藏底层敏感或无关的实现细节异常

有时我们在 `except` 块中将底层异常转换为主动抛出的业务异常后，**明确希望隐藏底层的 `__context__` 回溯**（例如底层异常仅是内部使用字典缓存未命中的控制流实现细节，或者包含不应暴露给外部终端的内部路径信息）。此时可以使用 **`raise NewException(...) from None`**：

- 它会将新异常的 `__cause__` 设为 `None`，但将 **`__suppress_context__` 设为 `True`**（底层的 `__context__` 属性在内存中仍然保留供调试器读取，但默认的异常格式化器与 Traceback 输出只会展示新异常本身）。

| 异常抛出方式（位于 `except orig_exc:` 内部） | `__cause__` | `__context__` | `__suppress_context__` | Traceback 打印行为与工程语义 |
| :--- | :--- | :--- | :--- | :--- |
| **`raise NewError()`**（隐式上下文） | `None` | `orig_exc` | `False` | 打印两段栈：`During handling of the above exception, another exception occurred`（处理故障时引发次生故障） |
| **`raise NewError() from orig_exc`**（显式异常链） | `orig_exc` | `orig_exc` | `True` | 打印两段栈：`The above exception was the direct cause of the following exception`（跨抽象层转换异常并保留根因） |
| **`raise NewError() from None`**（截断异常链） | `None` | `orig_exc` | `True` | **仅打印 `NewError` 单段栈**（向外部调用方屏蔽底层实现细节异常） |

```python
class ConfigError(Exception):
    pass

# 1. 显式异常链：raise ... from err
try:
    try:
        raw = {"port": "invalid_int"}
        port = int(raw["port"])
    except ValueError as err:
        raise ConfigError("Invalid 'port' configuration") from err
except ConfigError as exc:
    assert isinstance(exc.__cause__, ValueError)
    assert exc.__suppress_context__ is True

# 2. 截断异常链：raise ... from None
try:
    try:
        _ = {}["internal_cache_key"]
    except KeyError:
        raise ConfigError("Required configuration 'host' is missing") from None
except ConfigError as exc:
    assert exc.__cause__ is None
    assert isinstance(exc.__context__, KeyError)
    assert exc.__suppress_context__ is True
```

### 异常注释增强（Python 3.11+ `exc.add_note(str)`）：在不改变异常类型和栈帧的前提下补充迭代上下文信息（`__notes__`）

在批处理循环、重试逻辑或深层递归中，当某一次迭代在底层函数内部抛出异常时，底层函数往往只知道“值非法（`ValueError`）”，却不知道当前正在处理的是“第几行记录、哪个用户 ID 或哪一个文件”。

在 Python 3.11 之前，如果要在外层补充这些上下文，要么只能打印一条额外日志，要么只能包装成一个新异常。**Python 3.11（PEP 678）**为所有 `BaseException` 引入了 **`exc.add_note(note: str)`** 方法与 **`exc.__notes__`** 字符串列表属性：

- 外层捕获异常后，可以直接调用 `exc.add_note(...)` 追加任意多条上下文说明，然后用**裸 `raise`** 原样重抛。
- 既**完全保留了原始异常类型**（不会破坏上层调用方对原始异常类型的 `except` 匹配）和**原始栈回溯**，又能在最终 Traceback 底部自动按添加顺序打印出所有注释行！

```python
def parse_record(record: dict[str, str]) -> int:
    return int(record["amount"])

batch = [
    {"id": "ORD-101", "amount": "250"},
    {"id": "ORD-102", "amount": "N/A"},  # 脏数据
]

try:
    for idx, item in enumerate(batch):
        try:
            parse_record(item)
        except ValueError as err:
            # Python 3.11+：不改变 ValueError 类型，直接附加业务定位注释并原样重抛
            err.add_note(f"Failed at batch index={idx}, order_id={item['id']}")
            raise
except ValueError as caught:
    assert caught.__notes__ == ["Failed at batch index=1, order_id=ORD-102"]
```

---

## 自定义异常体系与工程规范

### 设计模块化异常层级：定义项目/模块根异常基类（继承自 `Exception`）与细分领域异常

在开发任何可复用的 Python 库、SDK 或中大型业务服务时，一条黄金架构准则是：**为你的包或领域定义一个统一的根异常基类（直接继承自 `Exception`），并让项目内所有细分业务异常都继承自该根基类**（参考标准库 `urllib.error.URLError` 或第三方库 `requests.exceptions.RequestException`）。

这样设计给调用方带来了极大的灵活性：
- 既可以精细捕获某一个具体错误（如 `except RateLimitExceededError:` 做退避重试）；
- 又可以用一行 `except PaymentSDKError:` 兜底捕获该 SDK 抛出的所有已知业务异常，而不会误捕 Python 内置的 `TypeError` 等代码缺陷。

### 在自定义异常中携带结构化业务上下文（错误码、请求 ID、失败载荷）并重写表示方法

生产级自定义异常绝不应只拼接一个扁平的字符串消息（否则上层捕获后若想提取错误码或重试等待秒数，还得用正则表达式去解析错误字符串）。应当在 `__init__` 中接收并保存**结构化属性**，并通过 `super().__init__(message)` 初始化基类消息：

```python
class PaymentSDKError(Exception):
    """支付 SDK 统一根异常基类"""
    def __init__(self, message: str, *, error_code: str, request_id: str) -> None:
        super().__init__(message)
        self.message = message
        self.error_code = error_code
        self.request_id = request_id

    def __str__(self) -> str:
        return f"[{self.error_code}] {self.message} (req_id={self.request_id})"


class RateLimitExceededError(PaymentSDKError):
    """细分异常：触发网关限流，额外携带建议重试等待秒数"""
    def __init__(self, message: str, *, request_id: str, retry_after: float) -> None:
        super().__init__(
            message,
            error_code="RATE_LIMIT_EXCEEDED",
            request_id=request_id,
        )
        self.retry_after = retry_after


try:
    raise RateLimitExceededError(
        "Too many payment requests",
        request_id="req-9981",
        retry_after=2.5,
    )
except PaymentSDKError as exc:
    # 上层通过基类捕获，且可直接读取结构化字段驱动重试或返回标准 JSON 响应
    assert exc.error_code == "RATE_LIMIT_EXCEEDED"
    assert isinstance(exc, RateLimitExceededError) and exc.retry_after == 2.5
    assert str(exc) == "[RATE_LIMIT_EXCEEDED] Too many payment requests (req_id=req-9981)"
```

### `assert` 断言语句的定位：仅用于开发期内部不变量自检，绝不用作生产环境用户输入或权限校验（`python -O` 会彻底剥离 `assert`）

`assert condition, message` 在语义上等价于：

```python
if __debug__:
    if not condition:
        raise AssertionError(message)
```

为什么在工程规范和静态安全扫描（如 `bandit` 的 `B101` 规则）中，**严禁使用 `assert` 校验用户输入、API 请求参数或管理员权限**？

1. **优化模式下整句消失**：只要生产环境启动 Python 时带有 `-O` 或 `-OO` 标志（或设置了环境变量 `PYTHONOPTIMIZE=1`），内置常量 `__debug__` 就会变为 `False`，**字节码编译器会将所有 `assert` 语句在编译期彻底删除**！若用 `assert user.is_admin` 做鉴权，开启 `-O` 后所有普通用户都将直接绕过权限检查。
2. **异常类型不具备业务语义**：`AssertionError` 代表“程序内部逻辑出现了不可能发生的状态（即代码有 Bug）”，调用方不应该去 `except AssertionError:`；外部输入不合法应当显式 `if not valid: raise ValueError(...)` 或 `PermissionError(...)`。

### 警告机制（`warnings` 模块）：`warn()`、`DeprecationWarning` 与 `filterwarnings` 过滤控制简介

当某个情况需要提醒开发者注意（例如调用了即将废弃的旧版 API、配置参数存在潜在次优行为），但**还不至于中断当前程序运行**时，应当使用标准库 `warnings` 模块而非抛出异常：

- **发出警告**：调用 `warnings.warn(message, category=UserWarning, stacklevel=2)`。
    - **关键参数 `stacklevel=2`**：默认 `stacklevel=1` 会将警告位置指向 `warn()` 所在的库函数内部；设为 `2` 则会将警告行号准确指向**调用该废弃函数的外部业务代码行**，极大方便调用方定位改造。
    - **Python 3.13+ `@warnings.deprecated("...")`（PEP 702）**：提供了标准装饰器，可同时向静态类型检查器（IDE 自动画删除线提示）和运行时发出 `DeprecationWarning`。
- **控制警告过滤行为**：通过 `warnings.filterwarnings(action, category=...)` 或局部上下文管理器 `with warnings.catch_warnings(record=True) as w:`，可以将特定警告设置为 `"ignore"`（静默忽略）、`"always"`（每次都输出）或 **`"error"`（将警告直接升级为抛出异常，常用于 CI 测试流水线杜绝使用废弃接口）**。

```python
import warnings

def legacy_connect(host: str) -> str:
    warnings.warn(
        "legacy_connect() is deprecated, use connect_v2() instead",
        DeprecationWarning,
        stacklevel=2,
    )
    return f"connected:{host}"

# 在单元测试或局部代码块中捕获并校验警告
with warnings.catch_warnings(record=True) as recorded:
    warnings.simplefilter("always", DeprecationWarning)
    res = legacy_connect("127.0.0.1")

assert res == "connected:127.0.0.1"
assert len(recorded) == 1
assert issubclass(recorded[0].category, DeprecationWarning)
assert "connect_v2()" in str(recorded[0].message)
```

---

## 异常组与并发异常处理（`ExceptionGroup` 与 `except*`）

### 为什么传统单一异常模型无法满足并发任务（如 `asyncio.TaskGroup`）同时产生多个错误的场景？

在传统的同步单链路调用栈中，任意时刻栈顶最多只会抛出一个异常。然而在现代并发与批处理场景中，同一逻辑操作可能**同时产生多个彼此独立的异常**：

- 使用 `asyncio.TaskGroup`（Python 3.11+ 结构化并发）并发启动 3 个微服务 RPC 请求，其中任务 A 触发了 `TimeoutError`，任务 B 几乎同时触发了 `ConnectionRefusedError`；
- 关闭资源池或执行分布式事务清理时，多个节点的释放回调各自抛出了不同的 I/O 错误；
- 数据校验引擎一次性检查表单的 10 个字段，希望把所有字段的校验异常一次性汇总抛出。

如果沿用传统的“只抛出第一个异常、丢弃其余异常”或“用列表把异常装起来作为普通返回值”的做法，既丢失了关键故障现场，又无法利用 Python 原生的 `try ... except` 机制按异常类型进行捕获分流。为此，Python 3.11（PEP 654）正式引入了 **`ExceptionGroup`** 与 **`except*`** 语法。

### `ExceptionGroup` 与 `BaseExceptionGroup`（PEP 654）：树状嵌套封装多个无序并发异常

异常组支持将多个异常封装为一个**树状层次结构**（异常组的子元素可以是普通异常，也可以是另一个嵌套的 `ExceptionGroup`）：

- **`ExceptionGroup(message, exceptions)`**：继承自 `Exception`，因此**只能封装 `Exception` 及其子类实例**（若传入 `KeyboardInterrupt` 等非 `Exception` 实例会直接报错），并且可以被普通的 `except Exception:` 整体兜底捕获。
- **`BaseExceptionGroup(message, exceptions)`**：直接继承自 `BaseException`，可包含 `SystemExit`、`KeyboardInterrupt` 等系统级异常。特别地，如果传给 `BaseExceptionGroup(...)` 构造函数的子异常全部都是 `Exception` 的子类，构造函数会自动降级返回一个 `ExceptionGroup` 实例。

```python
eg = ExceptionGroup(
    "microservice batch failure",
    [
        TimeoutError("Auth service timed out"),
        ValueError("Invalid token payload"),
        ExceptionGroup("DB cluster errors", [ConnectionError("Primary node down")]),
    ],
)

assert isinstance(eg, Exception) is True
assert len(eg.exceptions) == 3
```

### `except*` 语法详解：按异常类型对异常组进行“切片分流匹配”（同一异常组可依次触发多个 `except*` 分支，未匹配部分自动重抛）

为了消费 `ExceptionGroup`，Python 3.11 引入了全新的 **`except*`** 子句。它与传统 `except` 有着根本性的语义差异：

| 核心差异维度 | 传统 `except Target as e:` | 异常组 `except* Target as eg:` |
| :--- | :--- | :--- |
| **分支触发次数** | **至多进入一个分支**（首个匹配成功后直接跳出整个 `try` 块） | **可按顺序依次进入多个 `except*` 分支**！每个分支负责从异常组中“切走（提取）”匹配自身类型的那一部分子异常 |
| **`as` 绑定的对象类型** | 绑定的是具体的单个异常实例 `e`（类型为 `Target`） | **始终绑定一个被过滤后的 `ExceptionGroup`（或 `BaseExceptionGroup`）实例 `eg`**（即便只捕获了单个普通异常，也会自动包装为单元素异常组） |
| **未匹配异常的去向** | 若已进入某个分支，则视为异常已完全处理 | 当所有 `except*` 分支执行完毕后，**如果原异常组中仍有未被任何分支匹配认领的剩余异常，解释器会自动将这些剩余异常重组为一个新的 `ExceptionGroup` 继续向上抛出**！ |

```python
handled_log: list[str] = []

try:
    try:
        raise ExceptionGroup(
            "task_group_errors",
            [
                TimeoutError("rpc 1 timeout"),
                ValueError("bad param"),
                TimeoutError("rpc 2 timeout"),
                KeyError("unhandled missing key"),
            ],
        )
    except* TimeoutError as eg_timeout:
        # 第 1 个分支被触发：切走所有 2 个 TimeoutError，封装为子异常组 eg_timeout
        handled_log.append(f"timeouts={len(eg_timeout.exceptions)}")
    except* ValueError as eg_val:
        # 第 2 个分支同样被触发：切走 1 个 ValueError
        handled_log.append(f"val_errors={len(eg_val.exceptions)}")
except ExceptionGroup as remaining_eg:
    # 未被任何 except* 认领的 KeyError 会自动重组为新的 ExceptionGroup 继续向上冒泡！
    assert len(remaining_eg.exceptions) == 1
    assert isinstance(remaining_eg.exceptions[0], KeyError)

assert handled_log == ["timeouts=2", "val_errors=1"]
```

### 异常组编程接口：`subgroup()`、`split()` 方法及 `except*` 块内禁止使用 `return` / `break` / `continue` 的约束

在以编程方式检查、过滤或拆分 `ExceptionGroup` 时，异常组对象提供了两个保持原有树状嵌套结构与元数据（如 `__cause__`、`__context__`、`__notes__`）的核心方法：

1. **`eg.subgroup(condition)`**：传入一个异常类型（或类型元组）或谓词函数 `Callable[[BaseException], bool]`，返回仅包含匹配异常的子 `ExceptionGroup`；若没有任何异常匹配则返回 `None`。
2. **`eg.split(condition)`**：将异常组一分为二，返回二元组 `(matching_group_or_None, rest_group_or_None)`。`except*` 的底层正是基于 `split()` 实现的。

```python
eg = ExceptionGroup("mixed", [ValueError("v1"), TypeError("t1"), ValueError("v2")])

# 使用 split 按类型或谓词函数精确切分异常组
val_group, others_group = eg.split(ValueError)
assert val_group is not None and len(val_group.exceptions) == 2
assert others_group is not None and len(others_group.exceptions) == 1
assert isinstance(others_group.exceptions[0], TypeError)
```

!!! warning "注意：`except*` 块内严禁使用 `return`、`break` 或 `continue`"
    与普通 `except` 不同，同一个 `ExceptionGroup` 可能需要依次流经多个 `except*` 分支，且最后还可能残留未捕获的子异常需要自动向上重抛。如果在第一个 `except*` 块中执行了 `return`、`break` 或 `continue`，后续的 `except*` 分支与剩余未捕获异常将被强行截断丢弃。因此，**Python 编译器在语法层面直接禁止在 `except*` 块中编写作用于外层的 `return`、`break` 或 `continue`**（一旦编写会直接报 `SyntaxError`）。

---

## 练习与实战

### 练习 1：结合显式异常链（`raise ... from`）与 `add_note()` 构建配置加载器

请编写一个函数 `load_service_ports(raw_config: dict[str, list[str]]) -> dict[str, list[int]]`，以及自定义异常类 `ConfigParseError(Exception)`：

1. 遍历 `raw_config` 中的每个服务名 `service` 及其端口字符串列表 `port_strs`，将每个端口转换为整数 `port`，并校验 `1 <= port <= 65535`（若超出范围，主动抛出 `ValueError(f"Port {port} out of range")`）。
2. 当转换或范围校验触发 `ValueError` 时，先在该 `ValueError` 上通过 `add_note()` 添加注释 `"service=<service>, index=<idx>, raw=<port_str>"`，随后使用**显式异常链（`raise ... from`）**将其转换并抛出 `ConfigParseError(f"Failed to load ports for {service}")`。

??? success "点击查看答案与解析"
    **核心思路**：在内层循环中捕获 `ValueError`，先调用 Python 3.11+ 的 `err.add_note(...)` 将当前服务名、列表下标与原始字符串附加到根因异常上，再执行 `raise ConfigParseError(...) from err` 构建显式因果异常链。

    ```python
    class ConfigParseError(Exception):
        """配置解析领域异常"""

    def load_service_ports(raw_config: dict[str, list[str]]) -> dict[str, list[int]]:
        parsed: dict[str, list[int]] = {}
        for service, port_strs in raw_config.items():
            ports: list[int] = []
            for idx, raw_p in enumerate(port_strs):
                try:
                    p = int(raw_p)
                    if not (1 <= p <= 65535):
                        raise ValueError(f"Port {p} out of range")
                except ValueError as err:
                    err.add_note(f"service={service}, index={idx}, raw={raw_p}")
                    raise ConfigParseError(
                        f"Failed to load ports for {service}"
                    ) from err
                else:
                    ports.append(p)
            parsed[service] = ports
        return parsed

    # 1. 验证正常配置解析
    assert load_service_ports({"web": ["80", "443"]}) == {"web": [80, 443]}

    # 2. 验证异常链 (__cause__) 与根因注释 (__notes__)
    try:
        load_service_ports({"api": ["8080", "70000"]})
    except ConfigParseError as exc:
        assert isinstance(exc.__cause__, ValueError)
        assert exc.__cause__.__notes__ == ["service=api, index=1, raw=70000"]
    ```

### 练习 2：实现收集全部字段错误的批量校验器与 `except*` 分类汇总器

请实现两个函数：

1. `validate_user_form(form: dict[str, object]) -> None`：依次校验字典 `form` 的以下三个规则，**不要在遇到第一个错误时立即停止**，而是收集所有触发的异常；如果存在任何错误，在函数末尾统一抛出一个 `ExceptionGroup("form_validation_failed", errors)`：
    - 若 `"username"` 缺失，收集 `KeyError("username")`；若存在但不是 `str`，收集 `TypeError("username must be str")`。
    - 若 `"age"` 缺失，收集 `KeyError("age")`；若存在但不是 `int`，收集 `TypeError("age must be int")`；若是 `int` 但 `< 0`，收集 `ValueError("age must be non-negative")`。
2. `summarize_form_errors(form: dict[str, object]) -> dict[str, int]`：调用 `validate_user_form(form)`，并使用 **`except*`** 语法分别统计 `KeyError`、`TypeError` 和 `ValueError` 的个数，返回形如 `{"missing": 1, "type": 1, "value": 0}` 的汇总字典。

??? success "点击查看答案与解析"
    **核心思路**：在 `validate_user_form` 中将所有字段的违规异常收集到列表 `errors` 中，若列表非空则统一抛出 `ExceptionGroup`。在 `summarize_form_errors` 中利用 `except*` 会依次触发所有匹配分支的特性，在各分支中读取 `len(eg.exceptions)` 完成分类计数。

    ```python
    def validate_user_form(form: dict[str, object]) -> None:
        errors: list[Exception] = []

        # 1. 校验 username
        if "username" not in form:
            errors.append(KeyError("username"))
        elif not isinstance(form["username"], str):
            errors.append(TypeError("username must be str"))

        # 2. 校验 age
        if "age" not in form:
            errors.append(KeyError("age"))
        elif not isinstance(form["age"], int):
            errors.append(TypeError("age must be int"))
        elif form["age"] < 0:
            errors.append(ValueError("age must be non-negative"))

        if errors:
            raise ExceptionGroup("form_validation_failed", errors)

    def summarize_form_errors(form: dict[str, object]) -> dict[str, int]:
        counts = {"missing": 0, "type": 0, "value": 0}
        try:
            validate_user_form(form)
        except* KeyError as eg:
            counts["missing"] = len(eg.exceptions)
        except* TypeError as eg:
            counts["type"] = len(eg.exceptions)
        except* ValueError as eg:
            counts["value"] = len(eg.exceptions)
        return counts

    # 同时缺失 username 且 age 为负数：两个 except* 分支依次触发
    summary = summarize_form_errors({"age": -5})
    assert summary == {"missing": 1, "type": 0, "value": 1}

    # username 类型错误且 age 类型错误
    summary2 = summarize_form_errors({"username": 123, "age": "twenty"})
    assert summary2 == {"missing": 0, "type": 2, "value": 0}
    ```

### 练习 3：修复 `try - except - else - finally` 中的控制流反模式

阅读下方存在两处严重缺陷的函数 `buggy_fetch_and_format(store, key, formatter)`：
1. 它把 `formatter(raw_val)` 放在了 `try` 块内部，导致当 `formatter` 函数自身内部抛出 `KeyError` 时，被误当成 `store` 中找不到 `key` 而返回了 `"DEFAULT"`。
2. 它在 `finally` 块中使用了 `return`，导致当 `formatter` 抛出 `TypeError` 等未捕获异常时，异常被 `finally` 的 `return` 静默吞掉！

请编写修正后的函数 `safe_fetch_and_format(store: dict[str, str], key: str, formatter, audit_log: list[str]) -> str`：当 `key` 不在 `store` 中时返回 `"DEFAULT"`；当 `key` 存在时在 `else` 块中调用 `formatter(raw_val)`（其自身抛出的任何异常包括 `KeyError` 均必须正常向外抛出）；无论成功或失败，`finally` 块都向 `audit_log` 追加 `"DONE"` 且绝不吞掉异常。

??? success "点击查看答案与解析"
    **核心思路**：将 `raw_val = store[key]` 单独保留在 `try` 块中，把 `return formatter(raw_val)` 移入 `else` 子句以隔离异常保护范围；同时移除 `finally` 中的 `return` 语句，仅保留 `audit_log.append("DONE")` 清理动作。

    ```python
    from collections.abc import Callable

    def safe_fetch_and_format(
        store: dict[str, str],
        key: str,
        formatter: Callable[[str], str],
        audit_log: list[str],
    ) -> str:
        try:
            raw_val = store[key]
        except KeyError:
            return "DEFAULT"
        else:
            # 在 else 中调用 formatter：此处若抛出 KeyError 不会被上面的 except 误捕
            return formatter(raw_val)
        finally:
            # 仅执行清理/审计记录，绝不使用 return 劫持异常或返回值
            audit_log.append("DONE")

    log: list[str] = []
    data = {"k1": "hello"}

    # 1. key 不存在 -> 返回 DEFAULT，且 finally 正常记录
    assert safe_fetch_and_format(data, "missing", str.upper, log) == "DEFAULT"
    assert log == ["DONE"]

    # 2. formatter 自身内部抛出 KeyError -> 不被误捕，正常向外冒泡，且 finally 依然执行
    def broken_formatter(val: str) -> str:
        return {}[val]  # 触发 formatter 内部 KeyError

    try:
        safe_fetch_and_format(data, "k1", broken_formatter, log)
        caught_internal_bug = False
    except KeyError:
        caught_internal_bug = True

    assert caught_internal_bug is True
    assert log == ["DONE", "DONE"]
    ```
