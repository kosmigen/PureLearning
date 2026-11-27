# 面向对象与类机制

在 Python 的“万物皆对象（Everything is an Object）”体系中，类（Class）本身也是运行期在堆上动态创建的一等对象（它是元类 `type` 的实例），而实例、方法与属性的交互则完全建立在**名字空间字典（`__dict__`）**、**描述符协议（Descriptor Protocol）**与 **C3 线性化方法解析顺序（MRO）**三大支柱之上。掌握这一底层机制，不仅能彻底看清 `self`、`cls` 与 `super()` 的工作本质，还能在复杂工程中自如运用抽象基类（ABC）、`@dataclass` 与 `enum` 构建严密的领域模型。

---

## 类与实例的对象模型

### `class` 语句的执行过程：类体局部命名空间与类对象（Class Object）的创建

与 `def` 语句类似，`class` 同样不是编译期静态声明，而是一条**运行期可执行代码块**。当 Python 解释器执行 `class MyClass(Base): ...` 时，内部按以下四个步骤运作：

1. **解析基类与元类**：求值基类列表 `(Base, ...)`，并确定负责创建该类的元类（默认是内置的 `type`）；
2. **准备类体命名空间**：调用元类的 `__prepare__` 方法创建一个空的字典（`namespace = {}`），作为执行类体代码时的局部作用域（Local Namespace）；
3. **自上而下执行类体代码**：将类体内的所有顶层语句（类属性赋值、`def` 方法定义、甚至 `if` / `for` 控制流）在该局部命名空间中顺序执行，所有绑定关系全部写入 `namespace` 字典；
4. **构造类对象并绑定名称**：调用 `type("MyClass", (Base,), namespace)` 生成最终的类对象（Class Object），将其内部字典存为只读视图 `MyClass.__dict__`（`mappingproxy` 类型），最后将类对象绑定到外层作用域的标识符 `MyClass` 上。

```python
class ServiceConfig:
    env = "production"
    # 类体是运行期执行的代码块，甚至可以直接使用条件推导生成类属性
    retry_delays = [2 ** i for i in range(3)]

    def describe(self) -> str:
        return f"env={self.env}"


# 类本身是 type 的实例，其属性与方法存储在类的 __dict__ (mappingproxy) 中
assert isinstance(ServiceConfig, type)
assert ServiceConfig.retry_delays == [1, 2, 4]
assert "describe" in ServiceConfig.__dict__
```

### 实例化流程、`self` 参数的显式绑定本质与实例属性字典 `__dict__`

当我们像调用函数一样调用类对象 `obj = MyClass(arg1, arg2)` 时，触发了元类 `type.__call__` 控制的标准两阶段实例化流水线：

1. **构造阶段（`__new__`）**：调用 `MyClass.__new__(MyClass, arg1, arg2)`（默认继承自 `object.__new__`），在内存中分配并返回一个尚未初始化数据的空白实例对象 `obj`；
2. **初始化阶段（`__init__`）**：只要 `__new__` 返回的 `obj` 是 `MyClass` 的实例，解释器就会自动调用 `MyClass.__init__(obj, arg1, arg2)`，将新建的实例作为第一个位置实参传入形参 `self`，向该实例的专属属性字典 `obj.__dict__` 中挂载状态。

**`self` 参数的本质**：`self` 在 Python 中**不是语法关键字**，而仅仅是实例方法第一个形参的社区强制命名约定。通过 `obj.method(x)` 调用方法时，Python 的方法绑定机制会自动将调用主体 `obj` 作为第一个实参填入 `self`，因此在底层的执行逻辑上，`obj.method(x)` 完全等价于通过类直接调用未绑定函数 `MyClass.method(obj, x)`。

```python
class Counter:
    def __init__(self, start: int = 0) -> None:
        self.count = start  # 写入实例专属的 self.__dict__["count"]

    def increment(self, step: int = 1) -> int:
        self.count += step
        return self.count


c = Counter(10)
assert c.__dict__ == {"count": 10}

# 实例调用与通过类显式传入 self 完全等价
assert c.increment(5) == 15
assert Counter.increment(c, 5) == 20
```

### 类属性与实例属性的查找遮蔽（Shadowing）及在实例上误改可变类属性的共享陷阱

当通过实例读取属性 `obj.attr`（且 `attr` 不是数据描述符，如 `@property`）时，Python 遵循**先实例、后类及继承链**的查找顺序：

1. 先检查实例自身的 `obj.__dict__`；
2. 若未命中，再去所属类 `type(obj).__dict__` 以及按 MRO 顺序向父类 `__dict__` 中查找；
3. 若仍未找到，触发 `__getattr__`（若已定义）或抛出 `AttributeError`。

相反，当执行属性赋值 `obj.attr = value` 时，**操作始终只写入实例自身的 `obj.__dict__`**，绝不会修改类属性！这带来了两个极重要的行为特征：

- **不可变类属性的遮蔽（Shadowing）**：在实例上给同名属性赋新值（如 `obj.timeout = 5`），只是在 `obj.__dict__` 中新建了一个同名键，从而在读取 `obj.timeout` 时“遮蔽”了类属性 `MyClass.timeout`，其他实例不受任何影响。
- **可变类属性的原地修改陷阱（Shared Mutable Class Attribute Trap）**：如果类属性是 `list`、`dict` 等可变容器，通过 `obj.items.append(x)` 操作时，第一步 `obj.items` 是**读取操作**——因为实例字典里没有 `items`，它会回退拿到**类字典里的同一个列表对象**，随后对该共享列表做原地修改，导致**所有实例状态瞬间串味**！

!!! warning "注意：严禁在类层级初始化实例独享的可变容器"
    实例独享的 `list`、`dict`、`set` 必须在 `__init__` 方法中通过 `self.items = []` 绑定到每个实例自己的 `self.__dict__` 上（或在 `@dataclass` 中使用 `field(default_factory=list)`）。

```python
class BuggyCart:
    items: list[str] = []  # 错误：可变对象作为类属性被所有实例共享！
    tax_rate: float = 0.1


cart1 = BuggyCart()
cart2 = BuggyCart()

# 1. 对不可变类属性重新赋值：仅在 cart1.__dict__ 中创建新键遮蔽类属性
cart1.tax_rate = 0.2
assert cart1.tax_rate == 0.2 and cart2.tax_rate == 0.1
assert "tax_rate" in cart1.__dict__ and "tax_rate" not in cart2.__dict__

# 2. 对可变类属性原地 append：未触发实例字典写入，直接污染了 BuggyCart.items！
cart1.items.append("Laptop")
assert cart2.items == ["Laptop"]  # cart2 被意外污染！
assert cart1.items is cart2.items is BuggyCart.items
```

### 封装与访问控制约定：公有属性、单下划线 `_protected` 约定与双下划线 `__private` 名称改写（Name Mangling）

Python 不像 Java 或 C++ 那样提供编译器强制拦截的 `public` / `protected` / `private` 关键字，而是奉行 *"We are all consenting adults here"*（我们都是自觉的成年人）哲学，通过**命名约定**与**名称改写机制**实现封装：

| 命名形态 | 访问控制级别 | 语言层行为与工程语义 |
| :--- | :--- | :--- |
| `name` | 公有（Public） | 公开 API 的一部分，承诺向后兼容，外部可自由读写 |
| `_name` | 受保护 / 内部实现（Protected / Internal） | **社区君子协定**：表明该属性/方法属于类或模块内部实现细节（且不会被 `from module import *` 导入），外部代码不应直接访问；解释器不做任何改名 |
| `__name` | 私有名称改写（Private / Name Mangling） | 以**双下划线开头且不以双下划线结尾**的标识符，在编译期会被自动改写为 `_ClassName__name` |
| `__name__` | 系统魔术属性/方法（Dunder） | Python 官方数据模型保留名称，严禁业务代码自造新的 `__xxx__` 命名 |

!!! note "底层原理：为什么需要双下划线名称改写（Name Mangling）？"
    `__attr` 自动改写为 `_ClassName__attr` 的设计初衷**并非为了绝对的安全防破解**（因为外部依然可以通过 `obj._ClassName__attr` 强行访问），而是为了**防止子类在不知情的情况下意外覆盖（覆盖冲突）父类的内部关键属性或辅助方法**。

```python
class BaseToken:
    def __init__(self, secret: str) -> None:
        self._hint = "internal"
        self.__secret = secret  # 被改写为 _BaseToken__secret

    def verify(self, candidate: str) -> bool:
        return self.__secret == candidate


class SubToken(BaseToken):
    def __init__(self, secret: str, custom_secret: int) -> None:
        super().__init__(secret)
        # 子类定义的 __secret 被改写为 _SubToken__secret，不会覆盖父类的 _BaseToken__secret！
        self.__secret = custom_secret


token = SubToken("root_pwd", 42)
assert token.verify("root_pwd") is True
assert token.__dict__ == {
    "_hint": "internal",
    "_BaseToken__secret": "root_pwd",
    "_SubToken__secret": 42,
}
```

---

## 方法绑定机制：实例方法、`classmethod` 与 `staticmethod`

### 普通函数如何变为绑定方法（Bound Method，`__self__` 与 `__func__`）

定义在 `class` 内部的函数在类字典 `Cls.__dict__` 中仅仅是一个普通的 `function` 对象。为什么通过类访问 `Cls.func` 得到的是普通函数，而通过实例访问 `obj.func` 却变成了一个自动填充首参 `self` 的**绑定方法（`bound method`）**？

答案在于：**Python 中的所有函数对象（`function`）都天然实现了非数据描述符协议的 `__get__(self, instance, owner)` 方法**：
- 当通过类访问 `Cls.func` 时，触发 `func.__get__(None, Cls)`，由于 `instance` 为 `None`，直接返回原始函数对象 `func` 本身；
- 当通过实例访问 `obj.func` 时，触发 `func.__get__(obj, Cls)`，它会动态创建并返回一个 `types.MethodType(func, obj)` 绑定方法对象！该对象内部持有了两个核心指针：
  - **`__self__`**：指向绑定的目标实例 `obj`；
  - **`__func__`**：指向底层的原始函数对象 `func`。
  当我们调用 `bound_method(*args, **kwargs)` 时，它内部做的唯一事情就是调用 `bound_method.__func__(bound_method.__self__, *args, **kwargs)`。

```python
class Greeter:
    def say(self, word: str) -> str:
        return f"{word}!"


g = Greeter()
# 通过类访问：返回原始 function
assert Greeter.say is Greeter.__dict__["say"]

# 通过实例访问：经过描述符 __get__ 包装为 bound method
bound = g.say
assert bound.__self__ is g
assert bound.__func__ is Greeter.say
assert bound("Hello") == Greeter.say(g, "Hello") == "Hello!"
```

### `@classmethod`：接收 `cls` 参数实现备选构造器（Factory Methods）与多态子类实例化

使用 `@classmethod` 装饰的方法，无论通过类 `Cls.method()` 还是通过实例 `obj.method()` 调用，描述符机制都会将**当前类对象本身**绑定到第一个形参（惯例命名为 `cls`）。

**两大核心工程用途**：
1. **备选构造器（Alternative Constructors）**：由于 Python 一个类只能有一个 `__init__` 方法（不支持 C++/Java 的构造器重载），标准库与工业界普遍使用 `@classmethod`（如 `dict.fromkeys()`、`datetime.fromisoformat()`、`classmethod.from_json()`）提供多种数据源的工厂构造方法。
2. **支持子类继承的多态实例化**：在备选构造器内部使用 `cls(...)` 而不是硬编码类名 `ParentClass(...)` 创建实例。这样当子类继承并调用该类方法时，`cls` 会自动指向子类，返回真正的子类实例！

```python
from datetime import date


class DateRecord:
    def __init__(self, year: int, month: int, day: int) -> None:
        self.year, self.month, self.day = year, month, day

    @classmethod
    def from_iso(cls, iso_str: str) -> "DateRecord":
        """备选构造器：通过 cls(...) 确保子类调用时返回子类实例。"""
        y, m, d = map(int, iso_str.split("-"))
        return cls(y, m, d)


class AuditDateRecord(DateRecord):
    pass


# 子类调用继承来的 @classmethod，由于内部使用 cls(y, m, d)，自动构造出 AuditDateRecord 实例
rec = AuditDateRecord.from_iso("2026-11-25")
assert isinstance(rec, AuditDateRecord)
assert (rec.year, rec.month, rec.day) == (2026, 11, 25)
```

### `@staticmethod`：无隐式首参的逻辑内聚工具函数

使用 `@staticmethod` 装饰的方法会屏蔽普通函数的描述符绑定行为：无论通过类还是实例调用，**都不会隐式传入 `self` 或 `cls`**，其行为与模块顶层的普通函数完全一致。

将工具函数声明为 `@staticmethod` 放入类内部，主要是为了**命名空间内聚性**：表明该辅助计算逻辑在领域概念上强从属于这个类（例如参数校验、格式换算），避免污染模块全局作用域。

```python
class Temperature:
    def __init__(self, celsius: float) -> None:
        self.celsius = celsius

    @staticmethod
    def celsius_to_fahrenheit(c: float) -> float:
        return c * 9 / 5 + 32


assert Temperature.celsius_to_fahrenheit(0) == 32.0
assert Temperature(100).celsius_to_fahrenheit(100) == 212.0
```

### 实例方法、类方法与静态方法的对比矩阵与工程选型

| 维度 | 实例方法（Instance Method） | 类方法（`@classmethod`） | 静态方法（`@staticmethod`） |
| :--- | :--- | :--- | :--- |
| **装饰器** | 无 | `@classmethod` | `@staticmethod` |
| **隐式首参** | `self`（绑定当前实例对象） | `cls`（绑定当前类对象，具备子类多态性） | 无隐式首参 |
| **可访问状态** | 实例属性 `self.x` 及类属性 `self.__class__.y` | 仅类属性 `cls.y`（无法访问特定实例状态） | 无法通过首参访问实例或类状态 |
| **调用方式** | `obj.method()`（或 `Cls.method(obj)`） | `Cls.method()` 或 `obj.method()` | `Cls.method()` 或 `obj.method()` |
| **典型工程选型** | 需要读写实例状态 `self` 的绝大多数常规业务方法 | **备选构造器**（`from_xxx`）、需感知当前子类类型的类级注册/工厂操作 | 与该类强相关、但完全是无状态纯计算的辅助工具函数 |

---

## 继承体系、MRO 方法解析顺序与 `super()`

### 单继承、方法重写（Override）与类型检查（`isinstance()` / `issubclass()`）

在 Python 3 中，所有未显式指定父类的类都默认继承自根基类 `object`（即 `class A:` 等价于 `class A(object):`）。子类自动获得父类的所有属性与方法，并可通过定义同名方法实现**方法重写（Method Overriding）**。

在进行运行期类型判断时，应遵循以下铁律：
- **永远优先使用 `isinstance(obj, Cls)` 和 `issubclass(Sub, Cls)`**，而不要使用 `type(obj) is Cls`！因为 `type(obj) is Cls` 无法识别子类实例，违背了面向对象设计的**里氏替换原则（Liskov Substitution Principle, LSP）**；
- `isinstance` 与 `issubclass` 的第二个参数支持传入由多个类型构成的元组，如 `isinstance(x, (int, float))`。

```python
class Animal:
    def speak(self) -> str:
        return "..."


class Dog(Animal):
    def speak(self) -> str:
        return "Woof"


dog = Dog()
assert dog.speak() == "Woof"
assert isinstance(dog, Dog) and isinstance(dog, Animal) and isinstance(dog, object)
assert issubclass(Dog, (Animal, int))
```

### 多重继承、菱形继承（Diamond Problem）与 C3 线性化算法（`cls.__mro__` / `cls.mro()`）

Python 支持一个子类同时继承多个父类：`class Sub(Base1, Base2): ...`。当继承图构成**菱形继承（Diamond Inheritance，例如 `B` 和 `C` 都继承自 `A`，而 `D` 同时继承 `B` 和 `C`）**时，属性与方法按什么顺序查找？公共基类 `A` 的方法会不会被重复调用两次？

Python 自 2.3 起统一采用 **C3 线性化算法（C3 Linearization / MRO）**，在类创建期将复杂的有向无环继承图拍平为一个确定性的无重复元组，存储在 `cls.__mro__`（或调用 `cls.mro()` 返回列表）中。

**C3 算法保证的三大核心性质**：
1. **子类优先于父类（Local Precedence）**：子类永远排在它的所有父类之前；
2. **声明顺序保持（Monotonicity）**：如果 `class D(B, C)` 中 `B` 写在 `C` 左边，那么在 `D.__mro__` 中 `B` 一定出现在 `C` 之前；
3. **公共基类殿后**：在菱形继承中，必须等所有分支子类（`B` 和 `C`）都被检索完毕后，才会去检索它们的公共基类 `A`，且每个类在 MRO 链中**仅出现一次**。

*注：如果程序员写出了违背单调性的矛盾继承关系（例如 `class X(A, B)` 而又定义 `class Y(B, A)` 后再同时继承 `class Z(X, Y)`），C3 算法将拒绝创建类并直接抛出 `TypeError: Cannot create a consistent method resolution order (MRO)`。*

```python
class A:
    def who(self) -> str:
        return "A"


class B(A):
    pass


class C(A):
    def who(self) -> str:
        return "C"


class D(B, C):
    pass


# 菱形继承 D(B, C) 的 MRO 顺序为：D -> B -> C -> A -> object
# 注意 B 虽然没有重写 who()，但不会直接回退到 A.who()，而是按 MRO 先去检查同级的 C.who()！
assert D.__mro__ == (D, B, C, A, object)
assert D().who() == "C"
```

### `super()` 的底层真相：按当前实例的 MRO 链动态查找下一节点，而非“静态调用直接父类”

这是 Python 面向对象中最重要、也最容易被误解的机制：

!!! note "底层原理：`super()` 不是“调用父类”，而是“调用 MRO 链上的下一个类”"
    `super()`（在方法内部无参调用时等价于 `super(__class__, self)`）返回的是一个代理对象。它读取 **`self` 实例所属真实类型的 `__mro__` 元组**，找到当前方法所在类（`__class__`）在 `__mro__` 中的位置，然后**向后跨一步，委托给 MRO 链上的下一个类**！

正因为 `super()` 查找的目标取决于运行期 `self` 的完整 MRO 链，在上面的菱形继承 `D(B, C)` 中，`B` 内部的 `super().method()` 实际调用的根本不是 `B` 的父类 `A`，而是 `D.__mro__` 中排在 `B` 后面的兄弟类 `C`！这种设计使得菱形继承中的每个节点只要都调用一次 `super()`，整条 MRO 链上的所有类就会像接力赛一样**各自恰好执行一次**，彻底解决了菱形继承重复初始化的难题。

```python
class Root:
    def trace(self) -> list[str]:
        return ["Root"]


class Left(Root):
    def trace(self) -> list[str]:
        # 当 self 是 Diamond 实例时，Left 在 MRO 中的下一站是 Right，而非 Root！
        return ["Left"] + super().trace()


class Right(Root):
    def trace(self) -> list[str]:
        return ["Right"] + super().trace()


class Diamond(Left, Right):
    def trace(self) -> list[str]:
        return ["Diamond"] + super().trace()


assert Diamond().trace() == ["Diamond", "Left", "Right", "Root"]
```

### 协作式多重继承中的 `super().__init__(*args, **kwargs)` 参数传递规范

在协作式多重继承（Cooperative Multiple Inheritance）中，由于每个类的 `super().__init__()` 下一站可能是声明期未知的兄弟类，各类的 `__init__` 参数签名往往各不相同。如果使用固定位置参数，中途必然因为参数个数不匹配而崩溃。

**协作式初始化黄金法则**：
1. 继承体系中的所有中间类 `__init__` 都使用**仅关键字参数（或具名关键字）抽取自己关心的参数**，并用 `**kwargs` 吸收其余未知参数；
2. 调用 `super().__init__(**kwargs)` 将剩余参数继续向 MRO 下一站传递；
3. 当到达 MRO 终点 `object.__init__()` 时（`object.__init__` 不接受任何额外参数），所有关键字参数应恰好被沿途各子类消费完毕，若仍有拼写错误的残留参数，`object.__init__` 会自动帮你抛出 `TypeError`！

```python
class BaseComponent:
    def __init__(self, **kwargs: object) -> None:
        # 确保到达 BaseComponent 时向 object.__init__() 转发，若有未识别的残留参数会自动报错
        super().__init__(**kwargs)


class NetworkNode(BaseComponent):
    def __init__(self, *, host: str, **kwargs: object) -> None:
        super().__init__(**kwargs)
        self.host = host


class AuthenticatedNode(BaseComponent):
    def __init__(self, *, token: str, **kwargs: object) -> None:
        super().__init__(**kwargs)
        self.token = token


class SecureClient(NetworkNode, AuthenticatedNode):
    def __init__(self, *, host: str, token: str, timeout: int = 5) -> None:
        super().__init__(host=host, token=token)
        self.timeout = timeout


client = SecureClient(host="10.0.0.1", token="sec_123")
assert (client.host, client.token, client.timeout) == ("10.0.0.1", "sec_123", 5)
```

### Mixin 混入类设计模式与“组合优于继承”的权衡准则

滥用深层多重继承极易导致类层次结构变成难以维护的“意大利面条”。在现代 Python 工程（如 Django CBV、标准库 `socketserver`）中，多重继承几乎**只用于 Mixin（混入类）模式**。

**编写规范的 Mixin 类应遵守四条军规**：
1. **职责单一**：一个 Mixin 只提供一种正交的横向扩展能力（例如 `JsonSerializableMixin`、`ReprMixin`）；
2. **不定义实例状态**：Mixin 尽量不定义 `__init__`，也不独占实例属性，仅通过宿主类已有的属性或协议提供增强方法；
3. **不可独立实例化**：Mixin 的类名通常以 `Mixin` 结尾，仅作为功能插件混入主业务类；
4. **继承位置靠左**：在声明 `class User(JsonMixin, BaseModel):` 时，**将 Mixin 放在主基类左侧**，确保按 MRO 优先命中 Mixin 提供的增强方法。

!!! tip "工程实践：组合优于继承（Composition over Inheritance）"
    除了清晰的名义接口继承（`is-a` 关系）和纯行为复用的轻量级 Mixin 外，绝大多数业务逻辑复用都应优先采用**对象组合（`has-a` 关系，即将依赖的组件作为实例属性注入到 `self.engine` / `self.storage` 中）**。组合不仅能在运行期动态替换策略组件，还彻底避免了父类与子类命名空间的隐式耦合。

```python
import json
from typing import Any


class JsonSerializableMixin:
    """为任意具备 __dict__ 的宿主类提供 JSON 序列化能力的正交 Mixin。"""
    def to_json(self) -> str:
        data = {k: v for k, v in self.__dict__.items() if not k.startswith("_")}
        return json.dumps(data, sort_keys=True)


class BaseEntity:
    def __init__(self, entity_id: int) -> None:
        self.entity_id = entity_id


class Product(JsonSerializableMixin, BaseEntity):
    def __init__(self, entity_id: int, name: str) -> None:
        super().__init__(entity_id)
        self.name = name
        self._internal_cache: Any = None


p = Product(101, "Mechanical Keyboard")
assert p.to_json() == '{"entity_id": 101, "name": "Mechanical Keyboard"}'
```

---

## 抽象基类（ABC）与名义接口契约

### `abc.ABC` 与 `@abstractmethod`：禁止基类直接实例化并在子类实例化时强制校验接口实现

Python 推崇“鸭子类型（Duck Typing）”，但在大型团队协作、插件架构或基础框架设计中，我们往往需要**显式的接口契约（Nominal Subtyping）**：强制所有子类必须实现指定的方法，否则连实例化都不允许通过。

标准库 `abc` 模块（PEP 3119）通过元类 `abc.ABCMeta` 和辅助基类 `abc.ABC` 提供了这一机制：
1. 继承自 `abc.ABC` 且包含未实现 `@abstractmethod` 的抽象基类**无法被直接实例化**；
2. 任何继承自该 ABC 的具体子类，如果**漏实现了哪怕一个 `@abstractmethod`**，在尝试实例化该子类时就会立即抛出 `TypeError: Can't instantiate abstract class ... without an implementation for abstract method ...`。
3. 抽象方法本身也可以包含默认实现代码，子类重写后可通过 `super().method()` 复用这部分公共逻辑。

```python
from abc import ABC, abstractmethod


class StorageBackend(ABC):
    @abstractmethod
    def save(self, key: str, data: bytes) -> bool:
        """子类必须实现的持久化接口。"""


class IncompleteBackend(StorageBackend):
    pass


class MemoryBackend(StorageBackend):
    def __init__(self) -> None:
        self._store: dict[str, bytes] = {}

    def save(self, key: str, data: bytes) -> bool:
        self._store[key] = data
        return True


# 1. 未实现全部抽象方法的子类在实例化时立即被拦截报错
try:
    IncompleteBackend()
except TypeError as exc:
    assert "abstract method 'save'" in str(exc)

# 2. 完整实现所有抽象方法的子类可正常实例化
mem = MemoryBackend()
assert mem.save("k1", b"payload") is True
```

### 抽象方法与 `@property`、`@classmethod`、`@staticmethod` 的组合使用

当需要将属性（`@property`）、类方法（`@classmethod`）或静态方法（`@staticmethod`）声明为抽象契约时，**`@abstractmethod` 必须紧贴 `def` 语句（即放在最内层、最下方）**，否则将无法正确标记或触发异常：

```python
from abc import ABC, abstractmethod


class DriverContract(ABC):
    @property
    @abstractmethod
    def protocol_name(self) -> str:
        """抽象只读属性：子类必须提供 protocol_name 属性实现。"""

    @classmethod
    @abstractmethod
    def from_dsn(cls, dsn: str) -> "DriverContract":
        """抽象类方法：子类必须提供 DSN 工厂构造器。"""


class PostgresDriver(DriverContract):
    @property
    def protocol_name(self) -> str:
        return "postgresql"

    @classmethod
    def from_dsn(cls, dsn: str) -> "PostgresDriver":
        return cls()


drv = PostgresDriver.from_dsn("postgresql://localhost/db")
assert drv.protocol_name == "postgresql"
```

### 虚拟子类注册（`ABC.register()`）与 `__subclasshook__` 自定义子类判定

抽象基类还提供了一套强大的解耦机制，允许某第三方类**无需在继承列表里显式继承 ABC**，就能通过 `isinstance()` 和 `issubclass()` 校验：

1. **`MyABC.register(ThirdPartyClass)`（虚拟子类注册）**：将某个已满足契约但无法修改源码的第三方类注册为 `MyABC` 的“虚拟子类（Virtual Subclass）”。注意：**虚拟子类不会从 ABC 继承任何方法或属性**，也不会出现在 `ThirdPartyClass.__mro__` 中，解释器也不会替虚拟子类做 `@abstractmethod` 完整性检查（由注册者背书负责）。
2. **`@classmethod def __subclasshook__(cls, C)`（结构化自动判定钩子）**：在 ABC 中重写该钩子，可以根据目标类 `C` 是否具备特定方法（如 `collections.abc.Sized` 检查类是否定义了 `__len__`）动态返回 `True`、`False` 或 `NotImplemented`，从而在运行期将名义类型与结构化鸭子类型完美融合。*(注：若仅需静态类型检查期的结构化子类型，也可使用 `typing.Protocol`)。*

```python
from abc import ABC


class Closeable(ABC):
    @classmethod
    def __subclasshook__(cls, C: type) -> bool:
        if cls is Closeable:
            # 只要类 C 的 MRO 链上定义了 close 且不为 None，即自动认定为 Closeable 的子类！
            if any("close" in B.__dict__ and B.__dict__["close"] is not None for B in C.__mro__):
                return True
        return NotImplemented


class CustomStream:
    def close(self) -> None:
        pass


# CustomStream 完全没有继承 Closeable，但通过 __subclasshook__ 自动通过了 isinstance 检查
stream = CustomStream()
assert isinstance(stream, Closeable)
assert issubclass(CustomStream, Closeable)
```

### `collections.abc` 标准容器抽象基类全景图

在编写通用函数或自定义容器类时，应当使用 `collections.abc` 中的标准抽象基类进行 `isinstance()` 运行时接口检查（例如判断一个对象是否是序列或映射），或者直接继承它们以自动获得配套的混入方法（Mixin Methods）：

| 抽象基类 (`collections.abc`) | 继承的父 ABC | 子类必须实现的抽象方法 | 自动免费赠送的 Mixin 方法 |
| :--- | :--- | :--- | :--- |
| `Iterable` | — | `__iter__` | — |
| `Iterator` | `Iterable` | `__next__` | `__iter__`（默认返回 `self`） |
| `Sized` | — | `__len__` | — |
| `Container` | — | `__contains__` | — |
| `Collection` | `Sized`, `Iterable`, `Container` | `__len__`, `__iter__`, `__contains__` | — |
| `Sequence` | `Reversible`, `Collection` | `__getitem__`, `__len__` | `__contains__`, `__iter__`, `__reversed__`, `index`, `count` |
| `MutableSequence` | `Sequence` | `__getitem__`, `__setitem__`, `__delitem__`, `__len__`, `insert` | 继承 `Sequence` 全部方法 + `append`, `reverse`, `extend`, `pop`, `remove`, `__iadd__` |
| `Mapping` | `Collection` | `__getitem__`, `__iter__`, `__len__` | `__contains__`, `keys`, `items`, `values`, `get`, `__eq__`, `__ne__` |
| `MutableMapping` | `Mapping` | `__getitem__`, `__setitem__`, `__delitem__`, `__iter__`, `__len__` | 继承 `Mapping` 全部方法 + `pop`, `popitem`, `clear`, `update`, `setdefault` |
| `Set` | `Collection` | `__contains__`, `__iter__`, `__len__` | 集合比较（`<`, `<=`, `==`）与集合运算（`&`, `\|`, `-`, `^`, `isdisjoint`） |

---

## 数据类（`dataclass`）与枚举（`Enum`）

### `@dataclass` 自动生成样板方法（`__init__`、`__repr__`、`__eq__`）与类型注解驱动字段

在日常业务开发中，大量类主要用作**数据载体（Data Holder / DTO / Value Object）**。若使用传统 `class` 编写，每次都要手写冗长重复的 `__init__`、`__repr__` 和 `__eq__`。

标准库 `dataclasses.dataclass`（PEP 557）是一个**代码生成类装饰器**：它在类创建期扫描类属性上的**类型注解（`__annotations__`）**，按字段声明顺序自动生成并注入 `__init__`、`__repr__`、`__eq__` 以及支持结构化模式匹配（`match/case`）的 `__match_args__`：
- **值相等语义**：普通类默认的 `__eq__` 比较的是内存地址（`is`），而 `@dataclass` 自动生成的 `__eq__` 会将两个同类型实例的所有字段打包成元组逐一做值比较。
- **不绑定 `ClassVar`**：如果某个带类型注解的属性被标注为 `typing.ClassVar[T]`，`@dataclass` 会将其识别为纯粹的类属性，排除在实例字段与 `__init__` 参数之外。

```python
from dataclasses import dataclass
from typing import ClassVar


@dataclass
class Point2D:
    x: float
    y: float = 0.0
    dimension: ClassVar[int] = 2  # ClassVar 不会被当作实例字段写入 __init__


p1 = Point2D(3.0, 4.0)
p2 = Point2D(3.0, 4.0)
assert p1 == p2  # 自动按字段值比较相等性
assert repr(p1) == "Point2D(x=3.0, y=4.0)"
assert Point2D.dimension == 2
```

### `field()` 精细化配置：`default_factory` 彻底规避可变默认值、`repr`、`compare`、`hash` 与 `init=False`

为了彻底杜绝多个实例共享同一个可变默认参数，**`@dataclass` 在语言层直接禁止将 `list`、`dict`、`set` 等可变字面量直接赋值为字段默认值**（会立即抛出 `ValueError: mutable default <class 'list'> for field ... is not allowed: use default_factory`）！

我们必须使用 `dataclasses.field()` 对单个字段进行精细化控制：

| `field()` 核心参数 | 默认值 | 功能说明 |
| :--- | :--- | :--- |
| `default` | `MISSING` | 字段的标量/不可变默认值 |
| `default_factory` | `MISSING` | **零参可调用对象（如 `list`、`dict`、`uuid.uuid4`）**，在每次实例化 `__init__` 时动态调用以生成全新的独立对象 |
| `init` | `True` | 设为 `False` 时，该字段不出现在 `__init__` 形参列表中（常配合 `__post_init__` 计算派生属性） |
| `repr` | `True` | 设为 `False` 时，在 `__repr__` 输出中隐藏该字段（非常适合隐藏密码 `password`、密钥或巨型缓存字段） |
| `compare` | `True` | 设为 `False` 时，在进行 `__eq__` 及排序比较（`__lt__` 等）时忽略该字段（如审计时间戳、缓存字段） |
| `hash` | `None` | 默认跟随 `compare` 设置决定是否参与 `__hash__` 计算 |
| `kw_only` | `MISSING` | 仅将该特定字段设为 Keyword-Only 参数（Python 3.10+） |

```python
from dataclasses import dataclass, field


@dataclass
class UserAccount:
    username: str
    password_hash: str = field(repr=False, compare=False)
    roles: list[str] = field(default_factory=list, compare=False)


u1 = UserAccount("alice", "sha256:secret1")
u2 = UserAccount("alice", "sha256:secret2", roles=["admin"])

# 1. default_factory 确保每个实例拥有完全独立的 list
u1.roles.append("viewer")
assert u1.roles == ["viewer"] and u2.roles == ["admin"]

# 2. repr=False 自动脱敏敏感字段；compare=False 使相等性只认业务主键 username
assert "password_hash" not in repr(u1)
assert u1 == u2
```

### 初始化扩展：`__post_init__` 派生字段校验与 `InitVar` 仅初始化参数

当自动生成的 `__init__` 执行完毕所有字段赋值后，如果类中定义了 **`__post_init__(self)`** 钩子方法，`__init__` 会在返回前自动调用它。

此外，如果某个参数**仅在初始化阶段用于计算或校验，而不希望作为实例属性长期保存在 `self` 上**，可以将其类型声明为 **`dataclasses.InitVar[T]`**。`@dataclass` 会将该参数接收进 `__init__`，然后直接作为位置参数转发给 `__post_init__(self, init_var1, ...)`，而不会向 `self` 绑定该属性！

```python
from dataclasses import InitVar, dataclass, field


@dataclass
class Rectangle:
    width: float
    height: float
    scale: InitVar[float] = 1.0
    area: float = field(init=False)  # 由 __post_init__ 派生计算，不放入 __init__ 参数

    def __post_init__(self, scale: float) -> None:
        if self.width <= 0 or self.height <= 0 or scale <= 0:
            raise ValueError("Dimensions and scale must be positive")
        self.width *= scale
        self.height *= scale
        self.area = self.width * self.height


rect = Rectangle(3.0, 4.0, scale=2.0)
assert (rect.width, rect.height, rect.area) == (6.0, 8.0, 48.0)
assert not hasattr(rect, "scale")  # InitVar 不会残留在实例属性中
```

### `@dataclass` 装饰器参数进阶：`frozen=True`（不可变与可哈希）、`slots=True`、`kw_only=True` 与 `order=True`

`@dataclass(...)` 装饰器本身支持一组极高工程价值的类级开关（Python 3.10+ 全面支持）：

- **`frozen=True`（不可变值对象与自动可哈希）**：模拟不可变结构，任何在初始化之后对实例属性赋值的操作（如 `obj.x = 1`）都会立即抛出 `dataclasses.FrozenInstanceError`。同时，因为不可变，它会自动生成 `__hash__` 方法，使其实例可以直接作为 `dict` 的键或放入 `set` 中！（若在 `frozen=True` 的类的 `__post_init__` 中需要初始化派生属性，需使用 `object.__setattr__(self, "attr", val)`）。
- **`slots=True`（Python 3.10+，内存压缩与访问加速）**：自动根据字段列表生成 `__slots__` 并创建一个全新类，取消每个实例的 `__dict__` 动态字典，不仅将大量小对象的内存占用降低 40%~50%，还防止了外部拼错属性名时的意外动态挂载。
- **`kw_only=True`（Python 3.10+）**：将所有字段统一声明为仅关键字参数，彻底解决了“子类继承带默认值字段的父 dataclass 后，无法再声明无默认值必填字段”的痛点！
- **`order=True`**：按字段声明顺序自动生成 `__lt__`、`__le__`、`__gt__`、`__ge__` 四个富比较方法，使实例原生支持 `sorted()` 与大小比较。

```python
from dataclasses import FrozenInstanceError, dataclass


@dataclass(frozen=True, slots=True, order=True, kw_only=True)
class SemanticVersion:
    major: int
    minor: int
    patch: int = 0


v1 = SemanticVersion(major=1, minor=2)
v2 = SemanticVersion(major=1, minor=10, patch=1)

# 1. order=True 支持按 (major, minor, patch) 字典序自然排序
assert v1 < v2

# 2. frozen=True 自动生成 __hash__，可放入 set / 作为 dict 的 key，且禁止篡改属性
version_set = {v1, v2}
assert v1 in version_set
try:
    v1.major = 2  # type: ignore[misc]
except FrozenInstanceError:
    pass

# 3. slots=True 移除了实例 __dict__，节省内存
assert not hasattr(v1, "__dict__")
```

### 枚举体系（`enum` 模块）：`Enum`、`IntEnum`、`StrEnum`、`Flag` / `IntFlag` 位掩码与 `@unique`、`auto()`

为了彻底消灭业务代码中散落的“魔术数字（Magic Numbers）”和“魔术字符串”，Python 标准库 `enum` 模块提供了强类型的枚举体系（并在 Python 3.11+ 新增了极好用的 `StrEnum`）：

| 枚举基类 / 工具 | 核心特性与适用场景 |
| :--- | :--- |
| `Enum` | 标准强类型枚举。成员拥有 `.name` 和 `.value` 属性；**不与原始值相等**（`Color.RED == 1` 为 `False`），类型安全性最高，推荐使用 `is` 进行身份判等 |
| `IntEnum` | 同时继承自 `int` 和 `Enum`。成员可直接参与整数比较、算术运算或传入要求 `int` 的底层 C 接口 |
| `StrEnum` (Python 3.11+) | 同时继承自 `str` 和 `Enum`。成员直接等同于字符串（`f"{Role.ADMIN}"` 直接输出其 `.value` 字符串），是 JSON API、HTTP 状态与配置项的首选 |
| `Flag` / `IntFlag` | 支持按位运算（`\|` 组合、`&` 交集、`in` 包含检测、`~` 取反）的位掩码枚举，非常适合表达文件权限（`R \| W \| X`）或多选特性开关 |
| `@unique` 装饰器 | 默认情况下相同 `.value` 的后续成员会被当作第一个成员的别名（Alias）；加上 `@unique` 后，一旦出现重复值立即在定义期抛出 `ValueError` |
| `auto()` | 自动为成员分配递增整数（在 `Enum`/`IntEnum` 中从 1 开始）、2 的幂次位掩码（在 `Flag` 中为 1, 2, 4, 8...）或小写成员名字符串（在 `StrEnum` 中为 `"member_name"`） |

```python
from enum import Flag, StrEnum, auto, unique


# 1. StrEnum + @unique + auto()：auto() 在 StrEnum 中自动生成小写成员名字符串
@unique
class Environment(StrEnum):
    DEV = auto()
    STAGING = auto()
    PROD = auto()


assert Environment.PROD == "prod"
assert f"Running in {Environment.DEV}" == "Running in dev"
assert Environment("staging") is Environment.STAGING


# 2. Flag 位掩码枚举：auto() 自动按 2 的幂次 (1, 2, 4...) 分配位标志
class Permission(Flag):
    READ = auto()
    WRITE = auto()
    EXECUTE = auto()
    RW = READ | WRITE


user_perm = Permission.READ | Permission.WRITE
assert user_perm is Permission.RW
assert Permission.READ in user_perm
assert Permission.EXECUTE not in user_perm
```

---

## 练习与实战

### 练习 1：利用 `super()` 协作式多重继承构建插件化数据处理流水线

请设计一套遵循协作式多重继承（Cooperative Multiple Inheritance）的文本处理器类体系：
1. 基类 `BaseProcessor` 定义 `process(self, text: str) -> str`，直接返回 `text`；
2. `StripProcessor(BaseProcessor)` 重写 `process`，先调用 `super().process(text)`，再去除首尾空白；
3. `LowerProcessor(BaseProcessor)` 重写 `process`，先调用 `super().process(text)`，再转为全小写；
4. `PrefixProcessor(BaseProcessor)` 通过协作式 `__init__(self, *, prefix: str, **kwargs)` 接收前缀参数，重写 `process` 在 `super().process(text)` 结果前加上 `prefix`；
5. 组合子类 `CleanTagProcessor(PrefixProcessor, LowerProcessor, StripProcessor)`，请写出其完整的 `__mro__` 顺序，并验证调用 `CleanTagProcessor(prefix="#").process("  PyTHon  ")` 为什么能按 **Strip -> Lower -> Prefix** 的顺序精准完成链式处理。

??? success "点击查看答案与解析"
    **核心解析**：在 `CleanTagProcessor(PrefixProcessor, LowerProcessor, StripProcessor)` 中，MRO 链顺序为：
    `CleanTagProcessor -> PrefixProcessor -> LowerProcessor -> StripProcessor -> BaseProcessor -> object`。
    因为每个类的 `process` 都**先调用 `super().process(text)` 获取下一站的返回值，再施加自己的转换**，所以调用栈深入到最底层的 `BaseProcessor` 返回原始字符串后，回栈顺序恰好是 **StripProcessor -> LowerProcessor -> PrefixProcessor**！

    ```python
    class BaseProcessor:
        def __init__(self, **kwargs: object) -> None:
            super().__init__(**kwargs)

        def process(self, text: str) -> str:
            return text


    class StripProcessor(BaseProcessor):
        def process(self, text: str) -> str:
            return super().process(text).strip()


    class LowerProcessor(BaseProcessor):
        def process(self, text: str) -> str:
            return super().process(text).lower()


    class PrefixProcessor(BaseProcessor):
        def __init__(self, *, prefix: str, **kwargs: object) -> None:
            super().__init__(**kwargs)
            self.prefix = prefix

        def process(self, text: str) -> str:
            return f"{self.prefix}{super().process(text)}"


    class CleanTagProcessor(PrefixProcessor, LowerProcessor, StripProcessor):
        pass


    assert CleanTagProcessor.__mro__ == (
        CleanTagProcessor,
        PrefixProcessor,
        LowerProcessor,
        StripProcessor,
        BaseProcessor,
        object,
    )
    proc = CleanTagProcessor(prefix="#")
    assert proc.process("  PyTHon  ") == "#python"
    ```

### 练习 2：结合 `abc.ABC` 与 `@classmethod` 实现支持多态备选构造器的序列化契约

请定义一个抽象基类 `SerializableEntity(ABC)`：
1. 定义抽象属性 `entity_type(self) -> str` 和抽象实例方法 `to_dict(self) -> dict[str, object]`；
2. 定义一个具体的 `@classmethod` 备选构造器 `from_dict(cls, payload: dict[str, object])`，内部先校验 `payload.get("type") == cls.expected_type()`（其中 `expected_type()` 是一个 `@classmethod @abstractmethod`），校验不通过则抛出 `ValueError`，通过则过滤掉 `"type"` 键并将其余键值对解包传给 `cls(**data)` 构造对应子类实例；
3. 实现具体子类 `OrderEntity(order_id: int, amount: float)` 并通过断言测试多态反序列化。

??? success "点击查看答案与解析"
    **核心解析**：将 `@classmethod` 与 `@abstractmethod` 组合时，`@abstractmethod` 必须位于最内层。在 `from_dict` 中通过 `cls(**rest)` 动态调用当前子类的构造器，即可让所有子类免费复用带类型校验的反序列化工厂方法。

    ```python
    from abc import ABC, abstractmethod
    from typing import Self


    class SerializableEntity(ABC):
        @classmethod
        @abstractmethod
        def expected_type(cls) -> str:
            """返回该实体类期望的序列化 type 标识。"""

        @abstractmethod
        def to_dict(self) -> dict[str, object]:
            """将实例序列化为字典。"""

        @classmethod
        def from_dict(cls, payload: dict[str, object]) -> Self:
            actual_type = payload.get("type")
            if actual_type != cls.expected_type():
                raise ValueError(f"Expected type {cls.expected_type()!r}, got {actual_type!r}")
            kwargs = {k: v for k, v in payload.items() if k != "type"}
            return cls(**kwargs)  # type: ignore[arg-type]


    class OrderEntity(SerializableEntity):
        def __init__(self, order_id: int, amount: float) -> None:
            self.order_id = order_id
            self.amount = amount

        @classmethod
        def expected_type(cls) -> str:
            return "order"

        def to_dict(self) -> dict[str, object]:
            return {"type": self.expected_type(), "order_id": self.order_id, "amount": self.amount}


    raw = {"type": "order", "order_id": 9527, "amount": 199.5}
    order = OrderEntity.from_dict(raw)
    assert isinstance(order, OrderEntity)
    assert order.to_dict() == raw
    ```

### 练习 3：使用 `@dataclass(frozen=True, slots=True)` 与 `InitVar` 构建不可变货币金额值对象

请使用 `@dataclass` 设计一个不可变的金融金额值对象 `Money`：
1. 开启 `frozen=True` 与 `slots=True`；
2. 包含字段：`cents: int`（以分为单位存储，避免浮点数精度丢失）、`currency: str = "CNY"`，以及一个不出现在 `__init__` 参数中、也不参与相等比较但用于展示的派生字段 `formatted: str = field(init=False, compare=False)`；
3. 提供一个仅初始化参数 `raw_yuan: InitVar[float | None] = None`：当调用者传入 `Money(cents=0, raw_yuan=12.34)` 时，在 `__post_init__` 中自动将 `cents` 覆盖计算为 `round(raw_yuan * 100)`，并将 `currency` 统一转为大写，最后生成 `formatted`（如 `"CNY 12.34"`）。*(提示：在 `frozen=True` 的 `__post_init__` 中需使用 `object.__setattr__`)*。

??? success "点击查看答案与解析"
    **核心解析**：当 `@dataclass(frozen=True)` 开启后，`__init__` 内部及 `__post_init__` 中若直接写 `self.attr = val` 会被自动生成的 `__setattr__` 拦截并抛出 `FrozenInstanceError`。标准做法是在 `__post_init__` 中调用 `object.__setattr__(self, "attr", val)` 完成最终的初始化归一化。

    ```python
    from dataclasses import InitVar, dataclass, field


    @dataclass(frozen=True, slots=True)
    class Money:
        cents: int = 0
        currency: str = "CNY"
        raw_yuan: InitVar[float | None] = None
        formatted: str = field(init=False, compare=False)

        def __post_init__(self, raw_yuan: float | None) -> None:
            final_cents = round(raw_yuan * 100) if raw_yuan is not None else self.cents
            norm_currency = self.currency.upper()
            object.__setattr__(self, "cents", final_cents)
            object.__setattr__(self, "currency", norm_currency)
            object.__setattr__(
                self,
                "formatted",
                f"{norm_currency} {final_cents / 100:.2f}",
            )


    m1 = Money(raw_yuan=19.99, currency="cny")
    m2 = Money(cents=1999, currency="CNY")

    assert m1.cents == 1999 and m1.currency == "CNY"
    assert m1.formatted == "CNY 19.99"
    # 值对象相等且可作为字典键
    assert m1 == m2
    ledger = {m1: "Paid"}
    assert ledger[m2] == "Paid"
    ```
