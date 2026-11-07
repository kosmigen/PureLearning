---
title: Java
description: Java 的由来、发展历史、运行方式与关键字速查，以 JDK 21 为示例基准。
---

# Java

Java 是一种静态类型、以类和对象为主要组织方式的通用编程语言。学习 Java，既需要掌握语言语法，也需要理解标准库和 Java 虚拟机提供的运行环境。

本栏目以 **JDK 21** 为示例基准，使用正式发布的语言特性。每个专题先解释概念，再通过语法、示例和运行结果说明用法。

## Java 的由来

Java 源于 Sun Microsystems 在 1991 年启动的 Green 项目，James Gosling 是主要设计者之一。早期语言名为 Oak，最初面向消费电子设备；后来团队将重点转向互联网应用，并在 1995 年以 Java 的名称公开发布。JDK 1.0 于 1996 年发布。

Java 的一个重要设计目标是让程序能够跨平台运行。编译器先把源代码转换为字节码，再由目标平台上的 Java 虚拟机执行。实际部署时，仍需考虑 JDK 版本、原生依赖、文件路径和操作系统差异。

## 发展历史

| 阶段 | 主要变化 |
| --- | --- |
| 1991—1996 | 从 Green 项目、Oak 发展为 Java，发布 JDK 1.0 |
| Java 5，2004 年 | 引入泛型、枚举、注解、自动装箱等特性 |
| Java 8，2014 年 | 引入 Lambda、Stream 和新的日期时间 API |
| Java 9，2017 年 | 引入模块系统，进一步组织平台和应用的依赖关系 |
| Java 11、17 | 持续改进语言、标准库与运行时，是理解现代 Java 演进的重要节点 |
| Java 21，2023 年 | 虚拟线程、记录模式、模式匹配 switch 等特性正式发布 |

学习时需要区分语言版本和具体的 JDK 发行版。使用同一语言版本的不同发行版，也可能有不同的支持周期和许可条件。

## Java 可以做什么

Java 常见于后端服务、企业应用、数据处理和基础设施软件。标准库提供集合、文件、网络和并发等能力，框架与第三方库则在此基础上提供更完整的应用开发支持。

Java 的静态类型和编译检查便于在运行前发现一部分错误；垃圾回收简化了对象内存管理。同时，启动时间、内存占用、依赖管理和运行时诊断也是实际开发中需要关注的内容。

## JDK、运行环境与 JVM

| 名称 | 作用 |
| --- | --- |
| JVM | 执行 Java 字节码，提供类加载、运行时内存管理等机制 |
| Java 运行环境 | JVM 与运行程序需要的标准库、配置等资源 |
| JDK | 开发工具包，包含运行环境、`javac` 编译器和诊断工具等 |

JRE 是 Java Runtime Environment 的缩写。理解概念时可以用它表示运行环境；安装和发布时应查看具体发行版的打包方式，也可以使用 `jlink` 构建应用需要的运行时。

## 第一个 Java 程序

保存为 `Main.java`：

```java title="Main.java"
public class Main {
    public static void main(String[] args) {
        System.out.println("Start learning Java.");
    }
}
```

编译并运行：

```sh
javac -encoding UTF-8 Main.java
java Main
```

**输出：**

```text
Start learning Java.
```

`javac` 生成 `Main.class`，`java Main` 从类路径中加载并运行这个类。`main` 是本例的程序入口，`System.out.println` 向标准输出写入一行文本。后续完整示例采用相同的编译方式；多个示例中的 `Main` 应分别保存和运行。

## 关键字速查

以下列表以 **Java 21 语言规范**为准，区分保留关键字和上下文关键字。

### 保留关键字

Java 21 定义了 51 个保留关键字，不能用作普通标识符：

```text
abstract   assert       boolean      break        byte
case       catch        char         class        const
continue   default      do           double       else
enum       extends      final        finally      float
for        goto         if           implements   import
instanceof int          interface    long         native
new        package      private      protected    public
return     short        static       strictfp     super
switch     synchronized this         throw        throws
transient  try          void         volatile     while
_
```

其中 `const` 和 `goto` 被保留但没有对应的语言功能，`strictfp` 在 Java 21 中已过时，单独的 `_` 也属于保留关键字。

### 上下文关键字

以下 17 个名称只在特定语法环境中被解释为关键字，它们在其他位置的可用性还受到具体语法规则约束：

```text
exports    module       non-sealed   open         opens
permits    provides     record       requires     sealed
to         transitive   uses         var          when
with       yield
```

例如，`var` 用于局部变量类型推断，`record` 用于声明记录类，`yield` 用于在 switch 表达式的语句块中产生结果。

!!! note "关键字与字面量"
    `true`、`false` 和 `null` 是字面量。`String`、`System` 是类名，`main` 是方法名，它们都不属于关键字。

## 阅读顺序

| 分类 | 内容 |
| --- | --- |
| [核心](basics/index.md) | 基本语法、流程控制、面向对象、字符串与数组、集合、泛型、异常和 IO |
| [进阶](advanced/index.md) | 函数式编程、反射与注解、网络、并发和 JVM |
| [框架](framework/index.md) | 框架的职责、依赖注入与应用组织方式 |
| [第三方库](third-party/index.md) | 引入依赖、使用外部 API 与管理版本 |

## 参考资料

- [Tpoint Tech：Java Tutorial](https://www.tpointtech.com/java-tutorial)，参考专题组织与示例讲解形式。
- [Tpoint Tech：History of Java](https://www.tpointtech.com/history-of-java)。
- [Java 21 语言规范：Keywords](https://docs.oracle.com/javase/specs/jls/se21/html/jls-3.html#jls-3.9)。
