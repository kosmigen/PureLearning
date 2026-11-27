# 流式 I/O、数据序列化与归档压缩

在上一篇 [文件系统、路径与目录操作](04-filesystem-and-paths.md) 中，我们解决了“如何在磁盘上安全定位、遍历与原子替换文件”的问题；而一旦打开文件（或拿到网络套接字、内存管道、压缩归档），程序就进入了**字节流（Byte Stream）与结构化对象互转**的世界。

生产环境中绝大多数 I/O 事故都源于三个认知盲区：**一次性将数 GB 文件读入内存导致 OOM**、**忽略字符编码边界与换行符翻译规则导致乱码或空行**，以及**直接反序列化或解压不可信外部字节流引发远程代码执行（RCE）与目录穿越**。本文将从 Python `io` 模块的三层流架构出发，系统打通常数内存大文件流式处理、JSON/JSONL/CSV/TOML 结构化格式、`struct` 二进制解包、`pickle` 安全红线，以及 Python 3.14 原生 `compression.zstd` 与防穿越归档解压。

---

## Python `io` 三层流架构与内存流

### Raw I/O -> Buffered I/O -> Text I/O 组合栈

当你写下一行看似简单的 `f = open("access.log", "r", encoding="utf-8")` 时，Python 标准库 `io` 模块在底层并不是只创建了一个对象，而是采用**装饰器组合模式（Decorator Pattern）**逐层套叠了三个职责分明的流对象：

```mermaid
flowchart LR
    OS["OS 内核文件描述符 (FD)"] <--> Raw["1. Raw I/O 层\nio.FileIO\n(无缓冲系统调用 read/write)"]
    Raw <--> Buf["2. Buffered I/O 层\nio.BufferedReader / Writer\n(默认 8 KB 用户态块缓冲)"]
    Buf <--> Txt["3. Text I/O 层\nio.TextIOWrapper\n(UTF-8 编解码 + 换行符翻译)"]
    Txt <--> App["Python 业务代码\n读写 str 字符串"]
```

| 层级 | 抽象基类 | 典型具体类 | 读写数据类型 | 核心职责 |
| :--- | :--- | :--- | :--- | :--- |
| **1. 原始层（Raw I/O）** | `io.RawIOBase` | `io.FileIO` | `bytes` | 直接封装操作系统文件描述符（FD），每次读写直接发起内核系统调用，无用户态缓冲（`open(..., "rb", buffering=0)` 即返回此层） |
| **2. 缓冲层（Buffered I/O）** | `io.BufferedIOBase` | `BufferedReader`、`BufferedWriter`、`BufferedRandom` | `bytes` | 在用户态维护固定缓冲区（`io.DEFAULT_BUFFER_SIZE`，通常 8192 B），合并细碎读写以大幅降低用户态/内核态上下文切换次数（`open(..., "rb")` 返回此层） |
| **3. 文本层（Text I/O）** | `io.TextIOBase` | `io.TextIOWrapper` | `str` | 包装在缓冲二进制流之上，负责 `bytes <-> str` 字符集编解码、错误容错策略及跨平台通用换行符（Universal Newlines）转换（`open(..., "r")` 返回此层） |

你甚至可以在运行时直接通过 `.buffer` 和 `.raw` 属性逐层向下剥开这组俄罗斯套娃——例如在 `sys.stdout`（本身是一个 `TextIOWrapper`）上通过 `sys.stdout.buffer.write(b"...")` 直接写出原始二进制数据：

```python
import io
from pathlib import Path
import tempfile

with tempfile.TemporaryDirectory() as tmp:
    p = Path(tmp) / "layers.txt"
    p.write_text("hello io stack\n", encoding="utf-8")

    # 文本模式打开：获得完整的三层流对象栈
    with p.open("r", encoding="utf-8") as text_stream:
        assert isinstance(text_stream, io.TextIOWrapper)
        assert isinstance(text_stream.buffer, io.BufferedReader)
        assert isinstance(text_stream.buffer.raw, io.FileIO)

    # 二进制无缓冲模式（buffering=0）：跳过上两层，直接拿到最底层的 FileIO
    with p.open("rb", buffering=0) as raw_stream:
        assert isinstance(raw_stream, io.FileIO)
        assert raw_stream.read(5) == b"hello"
```

### 内存流：`io.BytesIO` 与 `io.StringIO`

很多第三方库或标准库 API（如 `csv.writer`、`zipfile.ZipFile`、`tarfile.open`、图像库 `PIL.Image.save`）要求传入一个**类文件对象（File-like Object，即实现了 `read`/`write` 协议的流）**。如果你只想在内存中完成序列化或单元测试，完全没必要去磁盘上创建临时文件——直接使用内存流即可：

- **`io.BytesIO`**：在纯内存中模拟二进制流（对应 `BufferedIOBase`）。写完后可用 `.getvalue()` 拷贝出完整 `bytes`，或用 **`.getbuffer()` 获取零拷贝的可读写 `memoryview`**。
- **`io.StringIO`**：在纯内存中模拟文本流（对应 `TextIOBase`）。除用于测试替身（Mock/Stub）外，也是流式构建长报告文本的利器（避免在循环中用 `report += line` 引发多次内存重分配）。

```python
import io

# 1. BytesIO + getbuffer() 零拷贝原地修改指定偏移字节
bio = io.BytesIO(b"HEADER:0000:PAYLOAD")
with bio.getbuffer() as view:
    view[7:11] = b"0042"  # 直接修改底层内存缓冲区，无需整块复制
assert bio.getvalue() == b"HEADER:0042:PAYLOAD"

# 2. StringIO 模拟文本文件流并支持随机游标定位 seek() / tell()
sio = io.StringIO()
sio.write("line-1\n")
pos = sio.tell()
sio.write("line-2\n")
sio.seek(pos)
assert sio.readline() == "line-2\n"
```

### `open()` 核心参数精解：`encoding`、`errors`、`newline` 与 `buffering`

内置函数 `open(file, mode="r", buffering=-1, encoding=None, errors=None, newline=None)` 的每一个关键字参数都直接关系到跨平台正确性：

1. **打开模式 `mode`**：除熟知的 `"r"`（只读）、`"w"`（截断覆写）、`"a"`（末尾追加）外，务必掌握 **`"x"`（排他创建 Exclusive Creation）**——若文件已存在则原子性地抛出 `FileExistsError`，绝不会误覆盖已有数据。
2. **编解码容错策略 `errors`**（应对混杂了损坏字节的历史脏日志或异构系统输出）：

| `errors` 取值 | 解码遇非法字节时的行为 | 典型工程用途 |
| :--- | :--- | :--- |
| `"strict"`（默认） | 立即抛出 `UnicodeDecodeError` | 配置文件、业务核心数据（宁可快速失败绝不静默丢数据） |
| `"replace"` | 替换为 Unicode 替换字符 `'\ufffd'`（``） | 终端预览或日志检索展示 |
| `"backslashreplace"` | 转义为可读十六进制字面量（如 `b'\xff'` -> `'\\xff'`，主要是编码时常用；解码时 Python 3.5+ 同样支持） | 故障排查审计，保留损坏字节的精确十六进制线索 |
| `"surrogateescape"` | 将非法单字节 `0x80..0xFF` 映射到孤立代理码点 `U+DC80..U+DCFF`，**用同一策略 `encode` 时可 100% 逐字节无损还原** | 处理包含非 UTF-8 字节的 Linux 文件名或透传未知编码管道 |

3. **跨平台换行控制 `newline`**：
   - **读取时**：默认 `newline=None` 开启通用换行模式，将磁盘上的 `\r\n`（Windows）、`\n`（Unix）、`\r`（旧式 Mac）统一转换为内存中的 `"\n"`；设为 `newline=""` 则关闭翻译，原样返回底层换行符（**读写 CSV 时必须设为 `newline=""`**）。
   - **写入时**：默认 `newline=None` 会将内存中的 `"\n"` 替换为当前系统的 `os.linesep`（在 Windows 上写出 `\r\n`）；若希望在 Windows 上生成供 Linux 容器使用的 Shell 脚本或确定性快照，**显式传入 `newline="\n"` 即可强制跨平台输出 LF**。
4. **缓冲粒度 `buffering`**：`-1` 为默认块缓冲；`0` 为完全无缓冲（仅限 `"b"` 二进制模式）；`1` 为**行缓冲**（仅限文本模式，每遇到 `"\n"` 自动刷入内核，适合实时追踪日志）；大于 `1` 的整数指定字节缓冲区大小。

```python
import io

raw_dirty = "正常文本:".encode("utf-8") + b"\xff\xfe" + ":尾部".encode("utf-8")

# 1. replace vs backslashreplace vs surrogateescape 行为对比
assert raw_dirty.decode("utf-8", errors="replace") == "正常文本:\ufffd\ufffd:尾部"
assert raw_dirty.decode("utf-8", errors="backslashreplace") == "正常文本:\\xff\\xfe:尾部"

# surrogateescape 支持在 str 层面做正则/切分后，100% 无损编码回原始字节流！
escaped_str = raw_dirty.decode("utf-8", errors="surrogateescape")
assert escaped_str.encode("utf-8", errors="surrogateescape") == raw_dirty

# 2. 验证 newline="\n" 强制输出 Unix LF 换行符
buf = io.BytesIO()
wrapper = io.TextIOWrapper(buf, encoding="utf-8", newline="\n")
wrapper.write("line1\nline2\n")
wrapper.flush()
assert buf.getvalue() == b"line1\nline2\n"
```

---

## 大文件常数内存流式处理

面对 20 GB 的 Nginx 访问日志或模型权重备份，如果调用 `f.read()` 或 `f.readlines()`，进程瞬时内存会暴涨数十 GB 直至触发系统 OOM Killer。工业级文件处理的核心纪律是**将空间复杂度严格锁定在 `O(1)` 常数级别**。

### 文本按行惰性迭代与二进制固定块哨兵读取

- **大文本文件**：直接 `for line in f:`。`TextIOWrapper` 本身就是惰性迭代器，每次仅从缓冲区解码一行文本，上一行处理完毕即被垃圾回收。
- **大二进制流**：使用内置 `iter(callable, sentinel)` 配合 `functools.partial(f.read, 65536)`（以 64 KB 为分块大小，兼顾页缓存吞吐与 L1/L2 缓存局部性），不断读取直至返回空字节串哨兵 `b""`；若追求极致零内存分配，还可预分配固定 `bytearray` 配合 `f.readinto(buf)` 循环复用同一块内存：

```python
from functools import partial
import io

source = io.BytesIO(b"x" * 150_000)
sink = io.BytesIO()

# 方式 A：简洁优雅的固定 64 KB 分块流式迭代
chunk_sizes: list[int] = []
for chunk in iter(partial(source.read, 65536), b""):
    chunk_sizes.append(len(chunk))
    sink.write(chunk)

assert chunk_sizes == [65536, 65536, 18928]
assert sink.getvalue() == source.getvalue()

# 方式 B：基于 readinto() + memoryview 的零额外分配流式读取
source.seek(0)
reusable_buf = bytearray(65536)
view = memoryview(reusable_buf)
total_read = 0
while n := source.readinto(reusable_buf):
    # 注意：最后一块可能不满 65536 字节，必须用 view[:n] 切片取有效前缀！
    total_read += len(view[:n])
assert total_read == 150_000
```

### 跨块多字节 UTF-8 字符截断陷阱与 `codecs.getincrementaldecoder`

在消费 HTTP 流式响应（如大模型 SSE 字节块）、解压缩流或从异步套接字按固定字节数 `recv(1024)` 接收 UTF-8 文本时，有一个极隐蔽的高频生产 Bug：**直接对每个字节块调用 `chunk.decode("utf-8")`**。

为什么这在纯英文测试下完全正常，一上生产遇到中文或 Emoji 就随机崩溃？

- UTF-8 是**变长编码**（1~4 字节）：ASCII 占 1 字节，常见汉字占 **3 字节**（如 `'中'` 编码为 `b'\xe4\xb8\xad'`），Emoji 占 **4 字节**（如 `'🚀'` 编码为 `b'\xf0\x9f\x9a\x80'`）。
- 底层网络包或固定块读取边界对字符语义一无所知——如果第 1 块末尾恰好停在 `b'\xe4'`，而后两个字节 `b'\xb8\xad'` 落在了第 2 块开头，直接 `chunk1.decode("utf-8")` 就会立刻引爆 `UnicodeDecodeError: unexpected end of data`！

标准库 `codecs` 专门提供了**有状态增量解码器 `codecs.getincrementaldecoder("utf-8")()`** 来解决跨块截断：它会自动将块尾尚未凑齐完整码点的残缺前导字节暂存在内部状态缓冲区中，等到下一块字节到达时无缝拼合解码：

```python
import codecs

full_bytes = "Python 流式解码 🚀 零截断".encode("utf-8")

# 故意按每块 5 字节极端切分，必然把 3 字节汉字和 4 字节 Emoji 拦腰斩断
sliced_chunks = [full_bytes[i : i + 5] for i in range(0, len(full_bytes), 5)]

# 验证：若直接逐块 .decode("utf-8") 必然抛出 UnicodeDecodeError
naive_failed = False
try:
    for c in sliced_chunks:
        c.decode("utf-8")
except UnicodeDecodeError:
    naive_failed = True
assert naive_failed is True

# 正确做法：使用有状态增量解码器
decoder_cls = codecs.getincrementaldecoder("utf-8")
decoder = decoder_cls(errors="strict")

decoded_parts: list[str] = []
for c in sliced_chunks:
    # final=False 表示后续还有字节块，末尾残缺的多字节序列会安全缓存在 decoder 内部
    decoded_parts.append(decoder.decode(c, final=False))

# 流结束时必须调用一次 final=True：刷出尾部状态，若源文件末尾真有残缺坏字节则在此刻报错
decoded_parts.append(decoder.decode(b"", final=True))

assert "".join(decoded_parts) == "Python 流式解码 🚀 零截断"
```

### `mmap` 内存映射文件随机访问简介

当需要在数 GB 的大文件中高频执行**随机偏移读取、二进制二分查找或跨行字节级正则搜索（`re.finditer(rb"...", mm)`）**时，标准库 `mmap` 可调用操作系统的虚拟内存映射机制（POSIX `mmap(2)` / Windows `CreateFileMapping`），将磁盘文件直接映射到当前进程的虚拟地址空间：

- 无需预先把整个文件 `read()` 进 Python 堆，访问哪个偏移页才由操作系统内核按需触发缺页中断（Page Fault）调入页缓存；
- 映射对象同时支持序列切片 `mm[100:200]`、`mm.find(b"needle")` 与文件游标操作。

!!! note "使用 `mmap` 的边界检查：空文件不可映射全长 `0`"

    向 `mmap.mmap(fileno, length=0)` 传入 `length=0` 代表“映射整个文件当前长度”；但如果磁盘文件本身是 **0 字节空文件**，操作系统会直接抛出 `ValueError: cannot mmap an empty file`——映射前务必先确认 `path.stat().st_size > 0`。

```python
import mmap
from pathlib import Path
import re
import tempfile

with tempfile.TemporaryDirectory() as tmp:
    log_path = Path(tmp) / "events.bin"
    log_path.write_bytes(b"id=100;status=OK\nid=101;status=ERR_TIMEOUT\nid=102;status=OK\n")

    if log_path.stat().st_size > 0:
        with log_path.open("rb") as f, mmap.mmap(
            f.fileno(), length=0, access=mmap.ACCESS_READ
        ) as mm:
            # 直接在虚拟内存映射视图上运行二进制正则搜索，无需整文件拷贝入 Python bytes
            matches = [m.group(1).decode("ascii") for m in re.finditer(rb"id=(\d+);status=ERR_\w+", mm)]
            assert matches == ["101"]
```

---

## 结构化文本数据格式（JSON / JSONL / CSV / TOML）

### `json` 定制扩展与百万级流式 JSON Lines（`.jsonl`）

标准库 `json` 实现了 RFC 8259 规范，但在与 Python 丰富内置类型交互时存在以下固有边界：

- **单向退化与键转换**：Python 的 `tuple` 序列化为 JSON Array 后反序列化会变成 `list`；字典的整数键 `{1: "a"}` 在 `json.dumps` 后会被静默强转为字符串键 `{"1": "a"}`；
- **金融精度陷阱**：JSON 数字默认被解析为二进制 `float`，涉及货币金额时传入 **`parse_float=Decimal`** 可彻底杜绝精度丢失；
- **扩展自定义类型**：通过 `default` 函数将 `datetime`、`UUID`、`Decimal`、`dataclass` 转为基础可序列化类型，再按需配合 `object_hook` 还原。

更重要的是：**当数据量达到数十万乃至上千万条记录时，切忌写成单个顶层大数组 `[{...}, {...}, ...]` 的 `.json` 文件**！因为标准 `json.load()` 必须一次性把整个数组解析进内存，且无法安全向文件末尾追加新记录。工业界日志采集、大模型微调数据集与数据管道统一采用 **JSON Lines（`.jsonl` / NDJSON，每行一条紧凑单行 JSON 对象，以 `\n` 分隔）**：

```python
from dataclasses import asdict, dataclass
from datetime import UTC, datetime
from decimal import Decimal
import io
import json
from typing import Any


@dataclass(frozen=True)
class OrderEvent:
    order_id: str
    amount: Decimal
    created_at: datetime


def json_default(obj: Any) -> Any:
    if isinstance(obj, Decimal):
        return str(obj)  # 金额建议编码为字符串或配合 parse_float=Decimal
    if isinstance(obj, datetime):
        return obj.isoformat()
    raise TypeError(f"Object of type {type(obj).__name__} is not JSON serializable")


events = [
    OrderEvent("ORD-1", Decimal("19.99"), datetime(2026, 11, 26, 12, 0, tzinfo=UTC)),
    OrderEvent("ORD-2", Decimal("0.10"), datetime(2026, 11, 26, 12, 1, tzinfo=UTC)),
]

# 1. 流式写出 JSON Lines（separators 去除多余空格缩减体积，ensure_ascii=False 保留中文）
jsonl_stream = io.StringIO()
for ev in events:
    line = json.dumps(
        asdict(ev),
        default=json_default,
        ensure_ascii=False,
        separators=(",", ":"),
    )
    jsonl_stream.write(line + "\n")

# 2. O(1) 内存按行流式消费 JSON Lines，并用 Decimal 精确累加金额
jsonl_stream.seek(0)
total_revenue = Decimal("0.00")
for raw_line in jsonl_stream:
    if not (stripped := raw_line.strip()):
        continue
    record = json.loads(stripped, parse_float=Decimal)
    total_revenue += Decimal(record["amount"])

assert total_revenue == Decimal("20.09")
```

### `csv` 模块：为何必须传 `newline=""` 以及兼容 Excel 的 `utf-8-sig`

CSV 看似只是“用逗号拼字符串”，实则暗藏大量边界细节：**字段内本身含有逗号 `,`、含有双引号 `"`（按 RFC 4180 需转义为两个双引号 `""`），甚至单元格内部含有多行换行符 `\n`**。因此绝不能手写 `line.split(",")` 或 `",".join(row)`，必须交给状态机完备的标准库 `csv` 模块（`reader`/`writer` 或带表头映射的 `DictReader`/`DictWriter`）。

使用 `csv` 模块有两个必须遵守的硬性工程规范：

1. **打开文件时必须显式指定 `newline=""`**：
   - `csv.writer` 默认遵循 RFC 4180 直接向流写出 `\r\n`；如果在 Windows 上未设 `newline=""`，外层 `TextIOWrapper` 会把 `\r\n` 中的 `\n` 二次替换成 `\r\n`，变成畸形的 `\r\r\n`（表现为空白隔行）！
   - 读取时若字段引号内部包含内嵌换行符，只有 `newline=""` 能禁止 `TextIOWrapper` 提前改写换行字节，从而让 `csv` 状态机准确区分“单元格内换行”与“记录结束换行”。
2. **面向中文 Excel 导出导入时优先使用 `encoding="utf-8-sig"`**：
   - 纯 UTF-8 无 BOM 的 `.csv` 文件在中文版 Windows Excel 中双击打开时，常被误判为本地 ANSI（GBK）编码而显示满屏乱码；
   - 使用 `"utf-8-sig"` 写入时会自动在文件最前端冠上 3 字节 UTF-8 BOM（`\xef\xbb\xbf`），Excel 即可准确识别 UTF-8；同时用 `"utf-8-sig"` 读取带 BOM 的外部 CSV 时，Python 会**自动剥离 BOM**，避免 `DictReader` 第一列的列名被污染成隐形的 `"\ufeffid"`！

```python
import csv
from pathlib import Path
import tempfile

with tempfile.TemporaryDirectory() as tmp:
    csv_path = Path(tmp) / "report.csv"
    rows = [
        {"id": "101", "title": '含逗号, 与 "双引号"', "note": "第一行\n单元格内第二行"},
        {"id": "102", "title": "普通条目", "note": "正常备注"},
    ]

    # 写入：newline="" + utf-8-sig
    with csv_path.open("w", encoding="utf-8-sig", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=["id", "title", "note"])
        writer.writeheader()
        writer.writerows(rows)

    # 底层文件最前 3 字节确实写入了 UTF-8 BOM
    assert csv_path.read_bytes().startswith(b"\xef\xbb\xbf")

    # 读取：newline="" + utf-8-sig 自动剥离 BOM，且完好还原内嵌逗号、引号与多行文本
    with csv_path.open("r", encoding="utf-8-sig", newline="") as f:
        loaded_rows = list(csv.DictReader(f))

    assert loaded_rows == rows
    assert "id" in loaded_rows[0] and "\ufeffid" not in loaded_rows[0]
```

### `tomllib`（Python 3.11+ 标准库只读解析）与 `configparser`

作为应用配置文件格式，JSON 不允许写注释（极其反人类），YAML 语法过于庞杂且存在隐式类型转换陷阱（著名的挪威国家代码 `NO` 被解析成布尔 `False`），而 **TOML** 兼具清晰的区块语义、注释支持与强类型字面量，已成为现代 Python 生态的官方标准（如 `pyproject.toml`）。

Python 3.11 起内置了 **`tomllib`**，使用时牢记两点：

1. **打开 TOML 文件必须使用二进制模式 `"rb"`**（`with path.open("rb") as f: data = tomllib.load(f)`），因为 TOML 规范强制要求文件编码为有效 UTF-8，`tomllib.load` 接收二进制流以在内部执行严格编码与行尾校验；若输入已经是内存 `str`，则调用 `tomllib.loads(text)`。
2. **标准库 `tomllib` 仅支持读取解析，不提供写出（`dump`/`dumps`）接口**。这是 PEP 680 的刻意设计（配置通常由人工编写、程序读取；若确需程序化生成 TOML 文件，可安装轻量第三方库 `tomli-w`）。

对于遗留系统的传统 `.ini` / `.cfg` 配置文件，则可使用标准库 `configparser.ConfigParser(interpolation=None)`（注意：若配置值如密码或 URL 百分号编码中含有字面量 `%`，关闭插值 `interpolation=None` 可避免误触发 `InterpolationSyntaxError`）：

```python
import configparser
from datetime import UTC, datetime
from pathlib import Path
import tempfile
import tomllib

toml_content = """
# 服务全局配置
title = "Kosmigen Worker"
max_retries = 3
launch_at = 2026-11-26T08:30:00Z

[database]
dsn = "postgresql://app:p%40ss@localhost:5432/prod"
enabled = true

[[workers]]
name = "alpha"
concurrency = 4

[[workers]]
name = "beta"
concurrency = 8
""".encode("utf-8")

with tempfile.TemporaryDirectory() as tmp:
    toml_file = Path(tmp) / "config.toml"
    toml_file.write_bytes(toml_content)

    # 1. tomllib.load 必须以 "rb" 二进制模式传入文件流
    with toml_file.open("rb") as f:
        cfg = tomllib.load(f)

    assert cfg["max_retries"] == 3  # 原生还原 int
    assert cfg["database"]["enabled"] is True  # 原生还原 bool
    assert cfg["launch_at"] == datetime(2026, 11, 26, 8, 30, tzinfo=UTC)  # 原生还原 Aware datetime
    assert [w["name"] for w in cfg["workers"]] == ["alpha", "beta"]

# 2. configparser 解析传统 INI（interpolation=None 安全兼容含 % 的密码或 URL）
ini_parser = configparser.ConfigParser(interpolation=None)
ini_parser.read_string("[redis]\nhost = 127.0.0.1\nport = 6379\npassword = raw%secret\n")
assert ini_parser.getint("redis", "port") == 6379
assert ini_parser.get("redis", "password") == "raw%secret"
```

---

## 二进制打包与对象序列化红线

### `struct` 模块：字节序控制与预编译协议头解包

在解析自定义 TCP 二进制协议头、PNG/WAV 文件头、硬件传感器报文或数据库页结构时，我们需要在 Python 数值类型与紧凑 C 结构体字节序列之间精确转换——这就是 **`struct` 模块**的主场。

编写 `struct` 格式串的**第一铁律是永远显式声明首字符字节序（Endianness）修饰符**：如果不写首字符，默认的 `@` 会采用**当前 CPU 本机字节序**并自动插入 **C 结构体内存对齐填充字节（Padding）**，一旦数据跨架构传输就会彻底错位！

| 首字符修饰符 | 字节序（Byte Order） | 类型尺寸与对齐方式 | 典型场景 |
| :--- | :--- | :--- | :--- |
| **`!` 或 `>`** | **大端序（Big-Endian，高位字节在前）** | 标准固定尺寸，**无对齐填充** | **TCP/IP 网络协议报文头首选**（网络字节序即大端序） |
| **`<`** | **小端序（Little-Endian，低位字节在前）** | 标准固定尺寸，**无对齐填充** | ZIP 文件头、WAV 音频头、x86/ARM64 本地紧凑二进制存储 |
| `@`（默认，不推荐跨机使用） | 宿主 CPU 原生字节序 | 原生尺寸 + **自动插入对齐 Padding** | 仅用于同进程内与本地 C 扩展 `ctypes` 交互 |

高频格式符速查：`B`/`b`（无符号/有符号 1 字节整数）、`H`/`h`（2 字节整数）、`I`/`i`（4 字节整数）、`Q`/`q`（8 字节整数）、`f`/`d`（4/8 字节 IEEE 754 浮点）、`?`（1 字节布尔）、`Ns`（定长 `N` 字节 `bytes`）。工程中应将格式串预编译为 **`struct.Struct` 实例**复用，避免每次调用重复解析格式字符串，并利用 `iter_unpack()` 批量解包连续定长记录：

```python
import struct

# 预编译一个 12 字节网络协议帧头：4B 魔数 + 1B 版本 + 1B 标志 + 2B 消息类型 + 4B 载荷长度
FRAME_HEADER = struct.Struct("!4sBBHI")
assert FRAME_HEADER.size == 12

payload = b'{"ping":1}'
packet = FRAME_HEADER.pack(b"KSMG", 1, 0x02, 1001, len(payload)) + payload

# 解包定长头部并切片提取精确载荷
magic, version, flags, msg_type, length = FRAME_HEADER.unpack_from(packet, offset=0)
body = packet[FRAME_HEADER.size : FRAME_HEADER.size + length]

assert (magic, version, flags, msg_type, length) == (b"KSMG", 1, 2, 1001, 10)
assert body == payload

# iter_unpack：高效批量解析连续采样的传感器定长记录（小端序：uint32 时间戳 + float32 温度）
SAMPLE_REC = struct.Struct("<If")
raw_batch = SAMPLE_REC.pack(1000, 25.5) + SAMPLE_REC.pack(1001, 26.0)
samples = [(ts, round(temp, 2)) for ts, temp in SAMPLE_REC.iter_unpack(raw_batch)]
assert samples == [(1000, 25.5), (1001, 26.0)]
```

### `pickle` 工作机制与致命安全禁区

`pickle` 是 Python 专有的对象图序列化模块，能够自动处理自定义类实例、函数引用甚至包含环路的复杂内存引用图。然而在安全工程视角下，**`pickle` 根本不是一种被动数据格式，而是一门图灵完备的栈式虚拟机字节码语言**！

当执行 `pickle.loads(untrusted_bytes)` 时，Pickle 虚拟机会读取流中的 `REDUCE` 操作码，无条件导入任意模块并执行对象 `__reduce__()` 方法指定的**任意可调用函数与参数**——这意味着攻击者只需构造几十个字节的恶意载荷，就能在反序列化发生的瞬间（甚至在你的业务类型检查代码运行之前！）直接在你的服务器上执行 `os.system` 或 `subprocess.Popen` 夺取机器控制权。

下面我们用一个**完全无害的纯内存审计函数**直观演示 `__reduce__` 是如何在 `pickle.loads()` 瞬间自动触发函数调用的：

```python
import pickle


class CraftedPayload:
    def __reduce__(self):
        # 告诉 pickle：反序列化我时，请直接调用内置 eval() 执行任意表达式字符串！
        # 若攻击者在此处将 eval 换成 os.system 并填入恶意 Shell 命令，即构成远程代码执行（RCE）！
        return (eval, ("'EXECUTED_BY_PICKLE:' + str(21 * 2)",))


malicious_stream = pickle.dumps(CraftedPayload())

# 一旦对字节流调用 pickle.loads()，eval() 立刻在反序列化瞬间被静默调用！
restored = pickle.loads(malicious_stream)
assert restored == "EXECUTED_BY_PICKLE:42"
```

!!! warning "安全铁律：严禁反序列化任何不可信来源的 `pickle` 数据"

    1. **绝对禁止**用 `pickle` 解析来自客户端 HTTP 请求、Cookie、WebSocket、外部 Redis/MQ 队列或来源不明的机器学习 `.pkl` / 旧式 PyTorch `.pt` 权重文件（AI 工程领域应改用纯张量格式 `safetensors`）。
    2. 跨服务、跨语言与持久化存储请一律改用安全的纯数据格式：**JSON / JSONL、TOML、MessagePack、Protocol Buffers 或 Parquet**。`pickle` 仅限用于同一可信边界内的本地 `multiprocessing` 进程间通信。

---

## 数据压缩与安全归档

### 四大压缩标准库对比与 Python 3.14 原生 `compression.zstd`

Python 标准库长期内置了 `gzip`、`bz2` 与 `lzma`；而在 **Python 3.14 中，PEP 784 正式将现代工业界标杆压缩算法 Zstandard（`compression.zstd`）纳入标准库**（并建立了统一的 `compression` 命名空间包），彻底告别了在“慢速高压缩率”与“快速低压缩率”之间二选一的窘境：

| 模块 | 底层算法与常见后缀 | 压缩率 | 压缩 / 解压吞吐速度 | 典型工程选型建议 |
| :--- | :--- | :---: | :---: | :--- |
| `gzip`（`zlib`） | DEFLATE（`.gz`） | 中 | 中 / 快 | HTTP 传输编码、需要兼容极老旧系统的通用日志归档 |
| `bz2` | Burrows-Wheeler（`.bz2`） | 中高 | 慢 / 较慢 | 现代新项目中已较少选用，多数场景被 `zstd` 取代 |
| `lzma` | LZMA2（`.xz`） | **极高** | 极慢 / 中 | 追求最小下载体积的静态固件镜像、源码发布包（压缩一次、分发万次） |
| **`compression.zstd`**（3.14+） | **Zstandard（`.zst`）** | **高**（可调级范围极宽） | **极快 / 闪电级解压** | **日志流归档、`.jsonl.zst` 数据集、缓存快照与现代 `.tar.zst` 首选** |

四大压缩模块共享高度一致的三层 API 设计：内存单次 `compress(data)` / `decompress(data)`、透明流式包装器 `open(path, mode="wt"|"rt"|"wb"|"rb")` 以及增量流式状态机 `ZstdCompressor` / `ZstdDecompressor`。若代码需同时兼容 Python 3.12/3.13 与 3.14+，可通过版本或导入探测优雅降级到 `gzip`（或第三方 `zstandard` 包）：

```python
import gzip
from pathlib import Path
import shutil
import sys
import tempfile

if sys.version_info >= (3, 14):
    from compression import zstd
else:  # pragma: no cover - Python < 3.14 兼容分支示意
    zstd = None  # type: ignore[assignment]

sample_payload = ("2026-11-26 INFO request_ok latency_ms=12\n" * 500).encode("utf-8")

# 对比原始大小、gzip 与 Python 3.14 原生 zstd 压缩效果
gz_bytes = gzip.compress(sample_payload, compresslevel=6)
assert gzip.decompress(gz_bytes) == sample_payload

if zstd is not None:
    zst_bytes = zstd.compress(sample_payload, level=3)
    assert len(zst_bytes) < len(sample_payload) // 20
    assert zstd.decompress(zst_bytes) == sample_payload

    # 使用 zstd.open + shutil.copyfileobj 实现大文件常数内存流式压缩与解压
    with tempfile.TemporaryDirectory() as tmp:
        raw_file = Path(tmp) / "app.log"
        zst_file = Path(tmp) / "app.log.zst"
        raw_file.write_bytes(sample_payload)

        with raw_file.open("rb") as src, zstd.open(zst_file, "wb", level=3) as dst:
            shutil.copyfileobj(src, dst, length=65536)

        with zstd.open(zst_file, "rt", encoding="utf-8") as reader:
            first_line = reader.readline()
            assert first_line == "2026-11-26 INFO request_ok latency_ms=12\n"
```

### `zipfile` / `tarfile` 归档操作与防御 Zip Slip / Tar Slip 路径穿越

上述压缩模块每次只压缩**单个字节流**；若要将整棵目录树的多个文件连同相对目录结构打包成一个文件，需使用归档模块 **`zipfile`** 或 **`tarfile`**（在 Python 3.14 中，`zipfile` 原生支持 `ZIP_ZSTANDARD`，`tarfile.open` 原生支持 `"w:zst"` 与自动探测读取 `"r:*"`！）。

!!! warning "高危漏洞警示：Zip Slip / Tar Slip 归档解压目录穿越"

    归档文件内部每个成员的名称本质上只是一个**攻击者可任意伪造的字符串**！恶意构造的 `.tar` 或 `.zip` 包可以包含名为 `"../../../etc/cron.d/backdoor"` 的条目，甚至先解压一个指向 `"/etc"` 的符号链接条目 `link_dir -> /etc`，紧接着再解压 `link_dir/passwd`（两阶段符号链接跳板逃逸）。如果不加过滤直接调用旧式无保护解压，就会直接覆写宿主机任意文件！

现代 Python 针对两类归档的安全防御标准如下：

1. **`tarfile` 强制启用 `filter="data"`（PEP 706）**：
   - Python 3.12 引入了 `tar.extractall(path=dest, filter="data")` 安全过滤器（并在 Python 3.14 中正式将 `"data"` 升级为默认过滤器；为了跨 3.12/3.13/3.14 行为百分之百一致，**强烈建议始终显式写出 `filter="data"`**）。
   - `"data"` 过滤器会自动拦截并拒绝：**绝对路径成员**、**通过 `..` 逃逸出目标目录的成员（抛 `OutsideDestinationError`）**、**指向归档外部的软硬链接**以及字符设备/FIFO 特殊节点，并自动剥离危险的 `setuid`/`setgid` 权限位。
2. **`zipfile` 显式校验路径边界 + 限制解压膨胀上限（防 Zip Bomb 压缩炸弹）**：
   - 攻击者可用几十 KB 构造出解压后高达数十 GB 全零数据的“压缩炸弹（Zip Bomb）”瞬间打满磁盘。安全解压外部 ZIP 时，应遍历 `zf.infolist()` 逐个检查 `file_size` 累计配额、拒绝符号链接模式位，并用 `resolve()` + `is_relative_to()` 锁定输出路径后再分块写出：

```python
import io
from pathlib import Path
import shutil
import stat
import tarfile
import tempfile
import zipfile


def safe_extract_zip(
    zf: zipfile.ZipFile,
    dest_dir: Path,
    *,
    max_total_bytes: int = 100 * 1024 * 1024,
) -> list[Path]:
    """防御路径穿越、符号链接注入与 Zip Bomb 压缩炸弹的安全 ZIP 解压函数。"""
    dest_resolved = dest_dir.resolve()
    dest_resolved.mkdir(parents=True, exist_ok=True)
    extracted: list[Path] = []
    written_bytes = 0

    for info in zf.infolist():
        # 1. 拒绝伪装在 Unix external_attr 高 16 位中的符号链接条目
        unix_mode = info.external_attr >> 16
        if stat.S_ISLNK(unix_mode):
            raise PermissionError(f"禁止解压 ZIP 符号链接条目: {info.filename!r}")

        # 2. 严格校验解压目标不越出沙箱根目录
        target = (dest_resolved / info.filename).resolve()
        if not target.is_relative_to(dest_resolved):
            raise PermissionError(f"检测到 Zip Slip 路径穿越: {info.filename!r}")

        if info.is_dir():
            target.mkdir(parents=True, exist_ok=True)
            continue

        # 3. 真实流式拷贝并按实际产出字节数计量，防止伪造 header 绕过 Zip Bomb 配额
        target.parent.mkdir(parents=True, exist_ok=True)
        with zf.open(info, "r") as src, target.open("wb") as dst:
            while chunk := src.read(65536):
                written_bytes += len(chunk)
                if written_bytes > max_total_bytes:
                    raise ValueError("超出最大解压字节配额，疑似 Zip Bomb 攻击")
                dst.write(chunk)
        extracted.append(target)

    return extracted


with tempfile.TemporaryDirectory() as tmp:
    work = Path(tmp)

    # --- 验证 1：tarfile filter="data" 精准拦截 Tar Slip 路径穿越 ---
    evil_tar_buf = io.BytesIO()
    with tarfile.open(fileobj=evil_tar_buf, mode="w:zst") as tf:
        bad_member = tarfile.TarInfo(name="../../escaped.txt")
        payload = b"malicious"
        bad_member.size = len(payload)
        tf.addfile(bad_member, io.BytesIO(payload))

    evil_tar_buf.seek(0)
    with tarfile.open(fileobj=evil_tar_buf, mode="r:*") as tf:
        tar_blocked = False
        try:
            tf.extractall(path=work / "tar_out", filter="data")
        except tarfile.OutsideDestinationError:
            tar_blocked = True
        assert tar_blocked is True

    # --- 验证 2：safe_extract_zip 正常提取合法压缩包并拦截穿越与超额膨胀 ---
    good_zip_buf = io.BytesIO()
    with zipfile.ZipFile(good_zip_buf, mode="w", compression=zipfile.ZIP_DEFLATED) as zf:
        zf.writestr("docs/readme.txt", "safe content\n")

    good_zip_buf.seek(0)
    with zipfile.ZipFile(good_zip_buf, mode="r") as zf:
        files = safe_extract_zip(zf, work / "zip_out", max_total_bytes=1024)
        assert len(files) == 1
        assert files[0].read_text(encoding="utf-8") == "safe content\n"

    # 超出配额立刻拦截（防 Zip Bomb）
    good_zip_buf.seek(0)
    with zipfile.ZipFile(good_zip_buf, mode="r") as zf:
        bomb_blocked = False
        try:
            safe_extract_zip(zf, work / "zip_bomb_out", max_total_bytes=5)
        except ValueError:
            bomb_blocked = True
            shutil.rmtree(work / "zip_bomb_out", ignore_errors=True)
        assert bomb_blocked is True
```

---

## 练习与实战

### 练习 1：基于增量解码器实现支持任意分块切分的流式 UTF-8 按行生成器

在异步网络流或自定义管道中，上游每次产出的 `bytes` 分块大小完全随机（可能一块只有 1 字节，把中文或 `\r\n` 切在两块之间；也可能一块包含十几行）。请使用 `codecs.getincrementaldecoder("utf-8")` 编写生成器函数 `iter_stream_lines(chunks: Iterable[bytes]) -> Iterator[str]`：

1. 保持常数级缓冲区开销，按 `\n` 切分并逐行 `yield` 解码后的字符串（统一剥离行尾的 `\r\n` 或 `\n`）；
2. 若最后一行末尾没有换行符但非空，流结束时也必须完整产出；
3. 用包含中文、Emoji（`🎉`）、Windows `\r\n` 换行符的多行文本，按极端 **1 字节一块** 切片输入验证无损还原。

??? success "点击查看答案与解析"

    **核心思路**：先用 `codecs.getincrementaldecoder("utf-8")(errors="strict")` 将任意粒度的 `bytes` 分块安全拼合为完整 Unicode 字符串片段，彻底消除多字节字符截断；再维护一个轻量级 `pending` 行尾残余字符串，每次收到新解码文本后用 `split("\n")` 切出已闭合的完整行（并用 `removesuffix("\r")` 兼容在两块间被切开的 `\r\n`），最后一块刷出 `final=True` 后若 `pending` 非空则产出尾行。

    ```python
    import codecs
    from collections.abc import Iterable, Iterator


    def iter_stream_lines(chunks: Iterable[bytes]) -> Iterator[str]:
        decoder = codecs.getincrementaldecoder("utf-8")(errors="strict")
        pending = ""

        for raw_chunk in chunks:
            pending += decoder.decode(raw_chunk, final=False)
            if "\n" in pending:
                lines = pending.split("\n")
                # 最后一个元素是尚未遇到 \n 的残余半行，留待下一轮拼接
                pending = lines.pop()
                for line in lines:
                    yield line.removesuffix("\r")

        # 刷出增量解码器末尾校验状态
        pending += decoder.decode(b"", final=True)
        if pending:
            yield pending.removesuffix("\r")


    raw_text = "第一行：你好世界\r\n第二行：Emoji 🎉 跨块测试\n第三行无尾换行"
    raw_bytes = raw_text.encode("utf-8")

    # 极端测试：每次只喂入 1 个字节！每个汉字、Emoji 和 \r\n 都被拆散
    one_byte_chunks = [raw_bytes[i : i + 1] for i in range(len(raw_bytes))]
    result_lines = list(iter_stream_lines(one_byte_chunks))

    assert result_lines == [
        "第一行：你好世界",
        "第二行：Emoji 🎉 跨块测试",
        "第三行无尾换行",
    ]
    ```

### 练习 2：基于 `compression.zstd` 与 JSON Lines 构建常数内存账单压缩归档与对账管线

编写一对配套数据处理函数（在 Python 3.14+ 下优先使用标准库 `compression.zstd`，若低于 3.14 自动回退至 `gzip`）：

1. `archive_transactions(records: Iterable[dict], dest_path: Path) -> None`：以流式压缩文本模式逐行写出紧凑 JSON Lines，其中 `Decimal` 金额字段序列化为字符串以保真；
2. `summarize_by_currency(src_path: Path) -> dict[str, Decimal]`：以 `O(1)` 内存逐行流式解压读取归档文件，跳过 `status != "SETTLED"` 的记录，按币种（`"USD"`、`"CNY"` 等）精确汇总 `Decimal` 金额并返回字典。

??? success "点击查看答案与解析"

    **核心思路**：通过统一的 `open_compressed_text` 辅助函数封装 Python 3.14+ `compression.zstd.open`（旧版本无缝回退 `gzip.open`），写入端流式迭代生成器直接向压缩流写入单行 JSON，读取端直接遍历压缩文本流句柄逐行 `json.loads` 并累加 `Decimal`，全程内存中仅驻留单条交易对象与几个币种的聚合器。

    ```python
    from collections import defaultdict
    from collections.abc import Iterable
    from decimal import Decimal
    import gzip
    import json
    from pathlib import Path
    import sys
    import tempfile
    from typing import TextIO

    if sys.version_info >= (3, 14):
        from compression import zstd
    else:
        zstd = None  # type: ignore[assignment]


    def open_compressed_text(path: Path, mode: str) -> TextIO:
        if zstd is not None:
            return zstd.open(path, mode, encoding="utf-8")  # type: ignore[return-value]
        return gzip.open(path, mode, encoding="utf-8")  # type: ignore[return-value]


    def archive_transactions(records: Iterable[dict], dest_path: Path) -> None:
        with open_compressed_text(dest_path, "wt") as f:
            for rec in records:
                line = json.dumps(
                    rec,
                    default=lambda x: str(x) if isinstance(x, Decimal) else x,
                    ensure_ascii=False,
                    separators=(",", ":"),
                )
                f.write(line + "\n")


    def summarize_by_currency(src_path: Path) -> dict[str, Decimal]:
        totals: dict[str, Decimal] = defaultdict(lambda: Decimal("0.00"))
        with open_compressed_text(src_path, "rt") as f:
            for line in f:
                if not (line := line.strip()):
                    continue
                item = json.loads(line)
                if item.get("status") == "SETTLED":
                    totals[item["currency"]] += Decimal(item["amount"])
        return dict(totals)


    with tempfile.TemporaryDirectory() as tmp:
        archive_file = Path(tmp) / "tx_2026_11.jsonl.zst"
        sample_txs = (
            {"id": 1, "currency": "CNY", "amount": Decimal("100.10"), "status": "SETTLED"},
            {"id": 2, "currency": "CNY", "amount": Decimal("0.20"), "status": "SETTLED"},
            {"id": 3, "currency": "CNY", "amount": Decimal("999.99"), "status": "FAILED"},
            {"id": 4, "currency": "USD", "amount": Decimal("49.95"), "status": "SETTLED"},
        )
        archive_transactions(sample_txs, archive_file)
        summary = summarize_by_currency(archive_file)

        # 完美避开 100.10 + 0.20 的二进制浮点误差，且准确过滤 FAILED 状态
        assert summary == {"CNY": Decimal("100.30"), "USD": Decimal("49.95")}
    ```

### 练习 3：使用 `struct.Struct` 与二进制流实现长度前缀消息分帧编解码器

设计一套紧凑的二进制日志文件格式，每条记录由 **8 字节大端序定长帧头** + **变长 UTF-8 载荷** 组成：

- 帧头格式：2 字节固定魔数 `b"LG"` + 1 字节日志级别（无符号整数 `1..5`）+ 1 字节保留位（固定 `0`）+ 4 字节无符号整数载荷字节长度 `payload_len`。
- 请实现 `write_framed_logs(stream: io.BufferedIOBase, entries: list[tuple[int, str]]) -> None` 与 `read_framed_logs(stream: io.BufferedIOBase) -> Iterator[tuple[int, str]]`：读取时必须校验魔数匹配，且若帧头或载荷读到一半就提前遇到 EOF（截断损坏帧），必须抛出 `EOFError` 而非静默返回残缺数据。

??? success "点击查看答案与解析"

    **核心思路**：预编译 `HEADER = struct.Struct("!2sBBI")`（总长恰好 `2 + 1 + 1 + 4 = 8` 字节）。读取时编写一个严格的 `read_exact(stream, n)` 辅助函数：当流在记录边界处干净返回 `0` 字节时代表正常结束；若读到的字节数处于 `0 < len(buf) < n` 之间（或帧头声明了 `payload_len` 却读不满），立即抛出 `EOFError` 报告文件截断损坏。

    ```python
    from collections.abc import Iterator
    import io
    import struct

    LOG_HEADER = struct.Struct("!2sBBI")
    MAGIC = b"LG"


    def read_exact(stream: io.BufferedIOBase, size: int) -> bytes:
        chunks: list[bytes] = []
        remaining = size
        while remaining > 0:
            part = stream.read(remaining)
            if not part:
                raise EOFError(f"流意外截断：期望读取 {size} 字节，仅剩 {remaining} 字节未就绪")
            chunks.append(part)
            remaining -= len(part)
        return b"".join(chunks)


    def write_framed_logs(
        stream: io.BufferedIOBase,
        entries: list[tuple[int, str]],
    ) -> None:
        for level, message in entries:
            body = message.encode("utf-8")
            header = LOG_HEADER.pack(MAGIC, level, 0, len(body))
            stream.write(header)
            stream.write(body)


    def read_framed_logs(stream: io.BufferedIOBase) -> Iterator[tuple[int, str]]:
        while True:
            first = stream.read(1)
            if not first:
                return  # 在帧边界处干净到达 EOF
            rest_header = read_exact(stream, LOG_HEADER.size - 1)
            magic, level, _reserved, payload_len = LOG_HEADER.unpack(first + rest_header)
            if magic != MAGIC:
                raise ValueError(f"非法帧头魔数: {magic!r}")
            body = read_exact(stream, payload_len)
            yield level, body.decode("utf-8")


    buf = io.BytesIO()
    source_logs = [(2, "服务启动成功"), (4, "连接池水位告警: 85%")]
    write_framed_logs(buf, source_logs)

    buf.seek(0)
    assert list(read_framed_logs(buf)) == source_logs

    # 验证截断检测：故意砍掉末尾 3 个字节，必须抛出 EOFError 而非返回半截乱码
    truncated_buf = io.BytesIO(buf.getvalue()[:-3])
    truncated_caught = False
    try:
        list(read_framed_logs(truncated_buf))
    except EOFError:
        truncated_caught = True
    assert truncated_caught is True
    ```
