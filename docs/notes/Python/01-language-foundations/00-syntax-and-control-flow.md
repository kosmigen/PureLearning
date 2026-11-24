# 表达式、分支与循环

## 〇、表达式（Expression）与语句（Statement）

很多编程语言的初学者容易混淆两者，但它们有着非黑即白的本质区别：

> **一句话判别黄金法则**：
> 
> - **表达式（Expression）**：**必须能算出（产生）一个值**（It *evaluates* to a value）。
> - **语句（Statement）**：**执行一个动作或组织控制流**（It *does* something），它**没有值**。

| 维度 | 表达式（Expression） | 语句（Statement） |
| :--- | :--- | :--- |
| **核心本质** | 产生数据的计算过程（有返回值） | 指挥计算机行动的指令（无返回值） |
| **能否放在 `=` 右边** | **能**（如 `a = 1 + 2`） | **绝对不能**（如 `a = if True: ...` 语法报错） |
| **能否作为函数参数** | **能**（如 `print(len("hi"))`） | **绝对不能**（如 `print(import os)` 语法报错） |
| **典型代表** | `1 + 2`、`len(s)`、`"a".upper()`、`x > 0`、三元表达式、推导式 | `a = 1`、`if/else`、`for/while`、`def`、`class`、`return`、`pass` |


### 1. Python 的经典设计哲学：为什么 `a = 1` 必须是语句？

在 C/C++ 或 JavaScript 中，赋值是**表达式**，具有返回值。这就导致无数程序员写出过这种灾难性 Bug：

```c
// C 语言噩梦：本想比较 x 是否等于 0，却手滑写成了赋值！
// (x = 0) 表达式返回 0，条件判定永远为假，还神不知鬼不觉修改了 x 的值！
if (x = 0) {
    ...
}
```

Python 祖师爷 Guido van Rossum 在设计 Python 时，从语法根源上掐死了这类 Bug：

- 在 Python 中，**普通赋值 `a = 1` 是纯粹的“语句（Statement）”**，它没有值！
- 因此，在 Python 中写 `if a = 1:` 会**直接报语法错误（SyntaxError）**，在词法解析阶段就被拦截，根本无法运行。

---

### 2. 两者的交集与桥梁

虽然界限分明，但 Python 提供了机制让它们互相连通：

#### ① 表达式语句（Expression Statement）

当一个表达式被单独作为一行写出来时，它就被当成了一条语句执行（计算出值后直接丢弃）：

```python
# 这两个都是纯表达式，但单独占一行时，被称为“表达式语句”
1 + 2             # 算出了 3，随后被垃圾回收丢弃
print("Hello")    # 执行了打印，且 print() 表达式返回了 None，随后被丢弃
```

#### ② 语句的“表达式化”：三元表达式

普通的 `if-else` 是**语句**，不能直接赋值给变量；而 Python 提供了对应的**条件表达式**：

```python
# ❌ 语句写法：冗长，占多行
if score >= 60:
    res = "及格"
else:
    res = "不及格"

# ✅ 表达式写法：这是一个完整的表达式，有值，可以直接赋值或当参数
res = "及格" if score >= 60 else "不及格"
print("及格" if score >= 60 else "不及格")
```

#### ③ 打破界限的创新：海象运算符 `:=`（赋值表达式）

Python 3.8 引入了 `:=`（Assignment Expression），它允许你**在表达式的内部完成赋值并返回值**：

```python
# 普通赋值是语句，不能作为表达式：
# if (n = len(data)) > 0:  ❌ SyntaxError!

# 海象运算符是表达式，有值，可以作为条件的一部分：
if (n := len(data)) > 0:    # ✅ 赋值给 n 的同时，返回 n 的值参与后续比大小
    print(f"数据长度为: {n}")
```

在 Python 中，程序控制流不仅仅是逻辑的分流与重复，更体现了 Python “显式、优雅与安全”的设计哲学。本章将从表达式计算的底层机理出发，深入剖析分支、迭代控制结构及其在工程实践中的核心模式。

---

## 一、数值运算、优先级、真值与短路
          
### 1. 数值运算与高频陷阱

Python 提供了直观的算术运算符，但在边缘场景和底层细节上有几个极其重要的特性：

| 运算符 | 描述 | 关键特性与避坑点 |
| :--- | :--- | :--- |
| `+`, `-`, `*` | 加、减、乘 | 整数具有任意精度（不会溢出） |
| `/` | **真除法（Float Division）** | 哪怕能整除，**结果也永远是浮点数 `float`**（如 `4 / 2` 得到 `2.0`） |
| `//` | **地板除（Floor Division）** | 向**负无穷大**方向取整（向下取整，而非简单截断小数） |
| `%` | **取模（Modulus）** | 严格满足恒等式：`x == (x // y) * y + (x % y)` |
| `**` | **幂运算** | **右结合性**（从右向左计算） |

#### ⚠️ 深度踩坑点 1：负数的地板除与取模

不同于 C/C++/Java 直接截断小数，Python 的地板除永远向下取整（向更小的数靠拢）：

```python
# 正数运算
print(7 // 2)   # 3
print(7 % 2)    # 1 (因为 7 == 3 * 2 + 1)

# 负数运算（注意！）
print(-7 // 2)  # -4 (而不是 -3！向负无穷方向靠拢)
print(-7 % 2)   # 1  (由恒等式：-7 == (-4) * 2 + 1 推导而来，余数与除数同号)
```

#### ⚠️ 深度踩坑点 2：幂运算的结合性与符号优先级

幂运算 `**` 的优先级**高于**一元负号 `-`，且它本身是**自右向左结合**：

```python
print(-2 ** 4)     # -16！等价于 -(2 ** 4)，而不是 (-2) ** 4
print((-2) ** 4)   # 16

print(2 ** 3 ** 2) # 512！等价于 2 ** (3 ** 2) = 2 ** 9，而不是 (2 ** 3) ** 2
```

---

### 2. 运算符优先级与链式比较

Python 允许自然的**链式比较（Chained Comparisons）**，其在底层会自动展开为带短路逻辑的 `and` 操作：

```python
x = 5
# 链式比较优雅且可读性极高
if 0 < x <= 10:
    print("x 在区间 (0, 10] 内")

# 它的底层等价于：
# (0 < x) and (x <= 10)
# 且中间的表达式只会求值一次（若为函数调用不会重复执行）
```

> **优先级经验法则**：
> 
> 算术运算 `>` 位移运算 `>` 比较运算（`<`, `<=`, `==`, `is`, `in`） `>` 逻辑非 `not` `>` 逻辑与 `and` `>` 逻辑或 `or`。
> 
> **工程规范**：任何稍复杂的逻辑判断，**一律使用括号明确意图**，切勿强行依赖阅读者的记忆力。

---

### 3. 真值测试（Truth Value Testing）与协议

在 Python 的 `if` 或 `while` 判断中，任何对象都可以被隐式转换为布尔值。

#### ① 哪些值会被判定为假（False）？

根据 Python 官方规范，以下对象在布尔上下文中为 `False`：

- 常量：`None`、`False`
- 任何数值零：`0`、`0.0`、`0j`、`Decimal(0)`、`Fraction(0, 1)`
- 任何空的序列或集合容器：`""`（空字符串）、`()`（空元组）、`[]`（空列表）、`{}`（空字典）、`set()`（空集合）、`range(0)`
- 实现了 `__bool__()` 返回 `False` 或 `__len__()` 返回 `0` 的自定义对象。

除此之外的所有对象，其真值均为 `True`。

#### ② 常见业务 Bug：`if x:` 的隐患

```python
def query_limit(limit: int | None = None):
    # ❌ 错误示范：如果调用方传入 limit = 0，0 是 False，会导致分支错误地走到 100！
    if not limit:
        limit = 100

    # ✅ 正确做法：显式检查 None
    if limit is None:
        limit = 100
```

---

### 4. 逻辑短路求值（Short-Circuit Evaluation）的核心本质

`and` 与 `or` 具有“短路”特性，但最关键的底层秘密在于：**它们返回的不是纯布尔值 `True/False`，而是返回决定最终结果的那个操作数对象本身！**

- `X and Y`：如果 `X` 为假，立刻返回 `X`；否则返回 `Y`。
- `X or Y`：如果 `X` 为真，立刻返回 `X`；否则返回 `Y`。

```python
# 短路返回原对象
print([] and "hello")   # [] (左边为假，短路返回左边对象)
print("a" and "b")      # "b" (左边为真，必须看右边，返回右边对象)

print("default" or "")  # "default" (左边为真，短路返回左边对象)
print("" or "fallback") # "fallback" (左边为假，返回右边对象)
```

#### 现代进阶：海象运算符（`:=`，赋值表达式）

在分支条件中，可以使用 `:=`（Walrus Operator）在求值的同时绑定变量，大幅减少冗余计算：

```python
data = {"users": ["Alice", "Bob"]}

# 赋值并就地判断长度
if (n := len(data.get("users", []))) > 0:
    print(f"找到 {n} 位活跃用户")
```

---

## 二、if、for、while、break、continue 与循环 else

### 1. 结构化分支：`if-elif-else`

Python 采用严格的缩进（通常 4 个空格）表达代码块。

- **扁平优于嵌套**：尽可能使用**早退（Guard Clauses）**减少层级嵌套。
- **三元条件表达式**：用于简单的赋值分支：
  ```python
  status = "Pass" if score >= 60 else "Fail"
  ```

---

### 2. 迭代核心：彻底抛弃 `for i in range(len(lst))`

在 C/Java 中常见的下标遍历在 Python 中被视为**反模式（Anti-pattern）**。Python 提倡直接遍历对象、利用工具函数或解包。

#### ① 直接遍历值

```python
fruits = ["apple", "banana", "cherry"]
for fruit in fruits:
    print(fruit)
```

#### ② 需要索引时：使用 `enumerate`

```python
# 接收可选的 start 参数（默认从 0 开始）
for idx, fruit in enumerate(fruits, start=1):
    print(f"第 {idx} 种水果是: {fruit}")
```

#### ③ 并行遍历多个序列：使用 `zip`（务必注意 `strict=True`）

```python
names = ["Alice", "Bob", "Charlie"]
scores = [95, 88, 92]

# 优雅配对遍历
for name, score in zip(names, scores):
    print(f"{name}: {score}分")

# ⚠️ 现代 Python (3.10+) 强烈推荐：strict=True 防御长度不匹配
extra_data = [1, 2]
# zip 默认在最短的列表耗尽时停止，容易掩盖数据不一致的 Bug！
# 开启 strict=True，一旦序列长度不等会主动抛出 ValueError，杜绝静默失败
for name, item in zip(names, extra_data, strict=True):  # 会抛出异常！
    pass
```

---

### 3. `while` 循环与死循环防护

`while` 循环依赖条件判定，适用于“非确定次数”的迭代。

```python
count = 3
while count > 0:
    print(count)
    count -= 1
```

在写 `while True:` 轮询任务时，必须确保存在可达的退出条件（`break` 或 `return`），并建议设置最大重试上限或配合 `time.sleep`，防止打满 CPU。

---

### 4. 循环控制：`break`、`continue` 与独特的**循环 `else`**

在循环的正常迭代之外，Python 提供了三个控制流关键字来改变执行节奏：

| 关键字 | 核心动作 | 形象比喻 | 影响范围 |
| :--- | :--- | :--- | :--- |
| **`continue`** | 跳过**本次**循环未执行的代码，直接进入**下一轮** | “这题太难先跳过，继续做下一题” | 仅影响当前这一次迭代 |
| **`break`** | **彻底终结**整场循环，不再执行任何后续轮次 | “考试交卷/紧急拉闸，全停下” | 终止其所在的**最内层**整场循环 |
| **循环 `else`** | 仅在循环**自然跑完、未被 `break` 打断**时触发 | “全场通关无事发生时的总结发言” | 绑定整个循环的完成状态 |

---

#### ① `continue`：跳过本轮，用于“数据过滤”

`continue` 最经典的作用是**守卫判断（Guard Clause）**，用于过滤掉不需要处理的脏数据，避免把主要逻辑写在层层缩进的 `if` 里面：

```python
# 需求：只处理正整数，过滤掉负数和 0
numbers = [10, -3, 0, 8, -1, 5]

for n in numbers:
    # 遇到不合规数据，立刻跳过本轮，进入下一次循环
    if n <= 0:
        continue
    
    # 核心业务逻辑直接平铺在最外层，告别深层嵌套
    print(f"正在处理有效正数: {n}")
```

---

#### ② `break`：彻底终结，用于“提前终止”

`break` 用于在达到某一条件时**立刻拉闸**，后续所有的元素统统不再遍历：

```python
# 需求：在列表中寻找第一个敏感词，一旦发现立刻报警并停机
words = ["apple", "banana", "SPAM", "orange", "SPAM_2"]

for w in words:
    if "SPAM" in w:
        print(f"🚨 触发风控：发现违规词【{w}】，扫描立即终止！")
        break
    print(f"安全词汇: {w}")

# 输出：只检查到第一个 SPAM 就停了，后面的 orange 和 SPAM_2 完全不会被遍历
```

---

#### 💡 一张对比：同一段代码，换一个词天差地别

假设遇到数字 `3`：

```python
# 用 continue：
for i in [1, 2, 3, 4, 5]:
    if i == 3:
        continue
    print(i, end=" ")
# 输出结果：1 2 4 5  （仅跳过了 3，后面的 4 和 5 照常运行）

# 用 break：
for i in [1, 2, 3, 4, 5]:
    if i == 3:
        break
    print(i, end=" ")
# 输出结果：1 2      （在 3 处彻底刹车，后面的 4 和 5 彻底作废）
```

---

#### ⚠️ 深度注意：多层嵌套循环下的 `break` 限制

在面试和工程中经常有人踩坑：**`break` 只能跳出它“直接所属的那一层”循环，无法穿透多层外层循环！**

```python
# 想要在找到目标时直接结束全部查找：
for x in range(3):
    for y in range(3):
        if x == 1 and y == 1:
            print("找到目标，break！")
            break  # ⚠️ 它只能跳出内层 y 循环，外层的 x 循环依然会继续跑！
```

- **如何彻底跳出多层循环？**
  最优雅、最 Pythonic 的做法是**将嵌套循环封装成一个函数，用 `return` 直接全盘退出**：
  ```python
  def find_target():
      for x in range(3):
          for y in range(3):
              if x == 1 and y == 1:
                  return (x, y) # 一键穿透所有层级直接返回
      return None
  ```

---

#### ③ 独特的循环 `else`：没有被 `break` 时的“收尾仪式”

理解了 `break`，你才能真正领悟 Python 循环独有的 **`for ... else`** 与 **`while ... else`**。

> **核心定义**：
> 循环体下方的 `else` 块，**只有在循环自然跑完全部轮次（即完全没有触发 `break`）时才会执行！**
> （你可以把它在脑海里翻译为 **`no break`**）。

##### 传统低效写法（需要借助额外的标志位 flag）：
```python
numbers = [2, 4, 6, 8]
found_odd = False

for num in numbers:
    if num % 2 != 0:
        found_odd = True
        print(f"找到奇数: {num}")
        break

# 还要在循环外面再写一个判断来处理“没找到”的场景
if not found_odd:
    print("全列表遍历完毕，未找到任何奇数")
```

##### Pythonic 优雅写法（利用循环 `else` 彻底消灭 flag）：
```python
numbers = [2, 4, 6, 8]

for num in numbers:
    if num % 2 != 0:
        print(f"找到奇数: {num}")
        break
else:
    # 只要循环跑完全程、中途没有被 break 打断，就会自动走到这里！
    print("全列表遍历完毕，未找到任何奇数")
```

---

## 三、学习检查与实操挑战

- [x] **怎样用 enumerate、zip 和解包代替手写索引？**
- [x] **写一个分数统计器，处理空输入、零分、边界值与非法值。**
- [x] **先手算每类数量，再用断言核对。**

### 1. 概念答疑：解包与迭代工具如何替代手写索引？

传统手写索引代码不仅冗长，而且容易触发 `IndexError`，更丢失了语义信息：

```python
records = [("Alice", 95, "A"), ("Bob", 88, "B")]

# ❌ 反模式：充满神秘数字下标，易读性极差
for i in range(len(records)):
    print(f"姓名: {records[i][0]}, 分数: {records[i][1]}")

# ✅ 现代做法：enumerate + 结构化解包，语义一目了然
for rank, (name, score, grade) in enumerate(records, start=1):
    print(f"第 {rank} 名: {name}, 得分: {score}, 等级: {grade}")
```

---

### 2 & 3. 实战挑战：高鲁棒性分数统计器（带断言自测验证）

以下是一个符合工业级标准的实现：
- 严格校验输入类型；
- 妥善处理空输入、`0` 分、极端边界值（0, 60, 100）及非法值（负数、超额分数、非数值类型）；
- 提前给出**手算基准数据**，并在代码结尾通过 **`assert`（断言）** 进行全自动化自测。

```python
from typing import Any


def analyze_scores(scores: list[Any]) -> dict[str, Any]:
    """
    分析给定的成绩列表，统计各分段人数与汇总指标。
    
    分段规则：
      - 优秀 (Excellent): 90 <= score <= 100
      - 良好 (Good):      75 <= score < 90
      - 及格 (Pass):      60 <= score < 75
      - 不及格 (Fail):    0  <= score < 60
    
    异常处理：
      - 负数、大于 100 或非数字类型计入 invalid
    """
    if not scores:
        return {
            "total_valid": 0,
            "categories": {"excellent": 0, "good": 0, "pass": 0, "fail": 0},
            "average": 0.0,
            "max": None,
            "min": None,
            "invalid_count": 0,
        }

    valid_scores: list[float] = []
    invalid_count: int = 0
    categories = {"excellent": 0, "good": 0, "pass": 0, "fail": 0}

    for item in scores:
        # 1. 过滤非布尔型的有效数值（注意：bool 在 Python 中是 int 的子类，需显式拦截）
        if isinstance(item, bool) or not isinstance(item, (int, float)):
            invalid_count += 1
            continue

        # 2. 边界值区间校验 [0, 100]
        if not (0 <= item <= 100):
            invalid_count += 1
            continue

        score = float(item)
        valid_scores.append(score)

        # 3. 分级统计（链式比较）
        if score >= 90:
            categories["excellent"] += 1
        elif score >= 75:
            categories["good"] += 1
        elif score >= 60:
            categories["pass"] += 1
        else:
            categories["fail"] += 1

    # 4. 指标计算与返回
    total_valid = len(valid_scores)
    avg_score = (sum(valid_scores) / total_valid) if total_valid > 0 else 0.0

    return {
        "total_valid": total_valid,
        "categories": categories,
        "average": round(avg_score, 2),
        "max": max(valid_scores) if valid_scores else None,
        "min": min(valid_scores) if valid_scores else None,
        "invalid_count": invalid_count,
    }


# ==============================================================================
# 🎯 手算核对与断言验证 (Self-Verification)
# ==============================================================================

# 设计一组包含各类极端边界的数据集：
test_dataset = [
    # 边界及有效值
    100,        # 优秀 (边界)
    90,         # 优秀 (边界)
    89.5,       # 良好
    75,         # 良好 (边界)
    60,         # 及格 (边界)
    59.9,       # 不及格
    0,          # 不及格 (边界零分)
    # 非法异常值
    -1,         # 负数越界
    101,        # 超出 100 越界
    "100",      # 错误类型 (字符串)
    None,       # None 空指针
    True,       # 容易被误判为 1 的布尔值
]

# 📝 [人工手算基准]:
# 有效分数共 7 个: [100, 90, 89.5, 75, 60, 59.9, 0]
#   - 优秀 (>= 90):        100, 90               -> 共 2 人
#   - 良好 (75 <= x < 90):  89.5, 75              -> 共 2 人
#   - 及格 (60 <= x < 75):  60                    -> 共 1 人
#   - 不及格 (0 <= x < 60): 59.9, 0               -> 共 2 人
#   - 总和: 100 + 90 + 89.5 + 75 + 60 + 59.9 + 0 = 474.4
#   - 平均分: 474.4 / 7 ≈ 67.77
#   - 最大值: 100.0, 最小值: 0.0
# 非法值共 5 个: [-1, 101, "100", None, True]     -> 共 5 项

# 执行函数
result = analyze_scores(test_dataset)

# 🔬 严格断言自动化测试
assert result["total_valid"] == 7, "有效分数统计错误！"
assert result["invalid_count"] == 5, "非法数据项统计错误！"
assert result["categories"]["excellent"] == 2, "优秀人数不符！"
assert result["categories"]["good"] == 2, "良好人数不符！"
assert result["categories"]["pass"] == 1, "及格人数不符！"
assert result["categories"]["fail"] == 2, "不及格人数不符！"
assert result["max"] == 100.0, "最高分提取错误！"
assert result["min"] == 0.0, "最低分提取错误（零分未正确处理）！"
assert result["average"] == 67.77, "平均分计算错误！"

# 空输入边界自测
empty_result = analyze_scores([])
assert empty_result["total_valid"] == 0
assert empty_result["max"] is None
assert empty_result["average"] == 0.0

print("✅ 所有断言检查 100% 通过！程序边界处理与统计结果完全正确。")
```

---

## 推荐阅读与延伸

* [Python 3 官方控制流教程 (More Control Flow Tools)](https://docs.python.org/3/tutorial/controlflow.html)
* [PEP 634: 结构化模式匹配规范（Structural Pattern Matching）](https://peps.python.org/pep-0634/)
* [Python 官方数据模型：真值判定协议与重载](https://docs.python.org/3/reference/datamodel.html#object.__bool__)