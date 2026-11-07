# 函数式编程

Java 支持通过函数式接口传递行为。Lambda 和方法引用简化了这种写法，Stream 则把筛选、转换和汇总等操作组合成数据处理流水线。

## 函数式接口

函数式接口具有一个符合规则的抽象方法。`@FunctionalInterface` 可以让编译器检查这个约定；接口仍可以包含默认方法和静态方法。

| 接口 | 典型用途 | 核心方法 |
| --- | --- | --- |
| `Predicate<T>` | 判断元素是否符合条件 | `test` |
| `Function<T, R>` | 把输入转换为结果 | `apply` |
| `Consumer<T>` | 消费一个值 | `accept` |
| `Supplier<T>` | 提供一个值 | `get` |

## Lambda 与方法引用

**语法：**

```java
(参数列表) -> 表达式
(参数列表) -> { 语句块; }
```

例如，`name -> name.length()` 表示接收名称并返回长度，可以在合适的目标类型下简写为 `String::length`。

Lambda 捕获的局部变量必须是 `final` 或实际不再重新赋值的变量。这不意味着被引用对象的内容也不可修改。

## Stream 流水线

Stream 本身不保存一份新的数据集合，它描述对数据源执行的操作。

| 阶段 | 示例 | 说明 |
| --- | --- | --- |
| 创建流 | `list.stream()` | 从数据源建立流水线 |
| 中间操作 | `filter`、`map`、`sorted` | 继续返回流，通常惰性执行 |
| 终止操作 | `toList`、`count`、`reduce` | 触发处理并产生结果或副作用 |

## 示例：筛选并整理课程名称

```java title="Main.java"
import java.util.List;
import java.util.function.Predicate;

public class Main {
    public static void main(String[] args) {
        List<String> topics = List.of(" Java ", "IO", "", "Collections");
        Predicate<String> longEnough = name -> name.length() >= 4;

        List<String> result = topics.stream()
                .map(String::strip)
                .filter(longEnough)
                .sorted()
                .toList();

        System.out.println(result);
        System.out.println("Count: " + result.size());
    }
}
```

**输出：**

```text
[Collections, Java]
Count: 2
```

`map` 清理名称，`filter` 筛选长度，`sorted` 排序，`toList` 收集结果。Java 21 中的 `Stream.toList()` 返回不可修改的列表。

## 汇总与分组

数值计算可以先转换为基本类型流，再调用 `sum()` 等方法。需要按条件分组时，可以使用 `Collectors.groupingBy`：

```java
int totalLength = topics.stream().mapToInt(String::length).sum();

Map<Integer, List<String>> byLength = topics.stream()
        .collect(Collectors.groupingBy(String::length));
```

以上是片段，需要导入 `Map` 和 `Collectors`。分组结果的遍历顺序取决于使用的映射实现。

## 注意事项

- 一个 Stream 只能消费一次，需要再次计算时重新创建流。
- 流中的函数应尽量不修改数据源，也不依赖不断变化的外部状态。
- `parallelStream()` 不保证更快，阻塞操作、共享状态和任务规模都会影响结果。
- `Files.lines()` 等持有外部资源的流需要关闭；普通集合生成的流通常不需要。

## 练习

为课程列表增加重复项，清理空白后使用 `distinct()` 去重，再按名称长度排序。为长度相同的名称补充一个明确的排序规则。

## 参考资料

- [Tpoint Tech：Java Lambda Expressions](https://www.tpointtech.com/java-lambda-expressions)。
- [Java 21 API：Stream](https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/util/stream/Stream.html)。
