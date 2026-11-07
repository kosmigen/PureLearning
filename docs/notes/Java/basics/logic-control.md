# 流程控制

流程控制用于决定代码以什么顺序执行。Java 提供条件分支、循环和跳转语句，可以根据输入选择操作，也可以重复处理一组数据。

## 条件分支

`if` 根据布尔条件决定是否执行语句块，`else` 处理条件不成立时的情况。

**语法：**

```java
if (条件) {
    // 条件成立时执行
} else {
    // 条件不成立时执行
}
```

多个条件可以使用 `else if` 连接。条件按顺序判断，进入一个分支后不会继续尝试后面的分支。

`switch` 适合按一个值的不同情况选择操作。下面使用 Java 21 可用的 switch 表达式：

```java
String label = switch (level) {
    case 1 -> "Basic";
    case 2 -> "Intermediate";
    default -> "Advanced";
};
```

表达式必须覆盖所有可能情况。箭头形式的分支不会自动落入后续分支；传统 `case ...:` 写法则需要注意贯穿执行与 `break`。

## 循环

| 写法 | 适合的情况 |
| --- | --- |
| `for` | 需要计数器或明确的初始化、条件和更新步骤 |
| 增强 `for` | 依次访问数组或可迭代对象的元素 |
| `while` | 根据条件决定是否继续，循环次数不确定 |
| `do ... while` | 先执行一次循环体，再判断条件 |

**语法：**

```java
for (初始化; 继续条件; 更新操作) {
    // 循环体
}

while (继续条件) {
    // 循环体
}
```

## 跳转语句

`break` 结束当前循环或相应的 switch 语句，`continue` 跳过当前循环中剩余的操作，`return` 则结束当前方法。它们的作用范围不同，嵌套循环中尤其需要确认目标。

## 示例：统计有效学习时长

```java title="Main.java"
public class Main {
    public static void main(String[] args) {
        int[] minutes = {25, 0, 40, -1, 30};
        int total = 0;
        int validDays = 0;

        for (int value : minutes) {
            if (value <= 0) {
                continue;
            }
            total += value;
            validDays++;
        }

        String result = total >= 90 ? "Target reached" : "Keep going";
        System.out.println("Total: " + total);
        System.out.println("Valid days: " + validDays);
        System.out.println(result);
    }
}
```

**输出：**

```text
Total: 95
Valid days: 3
Target reached
```

本例把非正数视为无效记录。`continue` 使这些值不参与累计；有效值同时更新总时长和天数。

## 注意事项

- 数组下标通常使用 `i < array.length`，写成 `<=` 会多访问一个位置。
- `while` 的循环体应使状态逐步接近退出条件，或提供明确的 `break`。
- Java 条件需要布尔表达式，不能直接把整数当作真假值。
- 对可修改集合进行结构性增删时，不应直接依赖普通增强 `for`；参见[集合框架](../collections/index.md)。

## 练习

修改示例：累计时长达到 60 分钟后立刻结束循环。说明此时总时长为什么可能大于 60，而不是恰好等于 60。

## 参考资料

- [Tpoint Tech：Control Statements in Java](https://www.tpointtech.com/control-statements-in-java)。
- [Java 21 语言规范：Blocks, Statements, and Patterns](https://docs.oracle.com/javase/specs/jls/se21/html/jls-14.html)。
