# 集合框架

集合框架提供保存和操作一组对象的接口、实现类与工具方法。与长度固定的数组相比，常见集合可以根据操作调整元素数量，也能表达去重、键值映射和队列等需求。

## 常见接口

| 接口 | 特点 | 常见实现 |
| --- | --- | --- |
| `List` | 按位置组织元素，允许重复 | `ArrayList`、`LinkedList` |
| `Set` | 不保存重复元素 | `HashSet`、`LinkedHashSet`、`TreeSet` |
| `Map` | 保存键值映射，键不能重复 | `HashMap`、`LinkedHashMap`、`TreeMap` |
| `Queue` | 按队列规则处理元素 | `ArrayDeque`、`PriorityQueue` |
| `Deque` | 可以从两端添加或移除元素 | `ArrayDeque` |

`List`、`Set` 和 `Queue` 属于 `Collection` 体系，`Map` 是独立的接口。`Collections` 则是包含排序、反转等静态方法的工具类。

## 基本语法

通常用接口声明变量，再选择合适的实现类：

```java
List<String> topics = new ArrayList<>();
topics.add("Java");
topics.add("IO");
String first = topics.get(0);
```

尖括号中的 `String` 限制元素类型。集合使用引用类型；保存整数时通常使用包装类 `Integer`。

## 示例：整理学习主题

```java title="Main.java"
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

public class Main {
    public static void main(String[] args) {
        List<String> topics = new ArrayList<>(List.of("Java", "IO", "Java"));
        Set<String> unique = new LinkedHashSet<>(topics);
        Map<String, Integer> counts = new LinkedHashMap<>();

        for (String topic : topics) {
            counts.merge(topic, 1, Integer::sum);
        }

        System.out.println("List: " + topics);
        System.out.println("Set: " + unique);
        System.out.println("Counts: " + counts);
    }
}
```

**输出：**

```text
List: [Java, IO, Java]
Set: [Java, IO]
Counts: {Java=2, IO=1}
```

列表保留重复元素，集合负责去重，映射记录每个主题出现的次数。这里使用 `LinkedHashSet` 和 `LinkedHashMap` 保留首次插入顺序，使输出便于观察。

## 遍历与修改

只读取元素时可以使用增强 `for`。需要按条件删除元素时，可以使用 `removeIf`，或使用支持删除的迭代器：

```java
topics.removeIf(topic -> topic.isBlank());
```

对映射通常通过 `entrySet()` 同时访问键和值。不要在普通增强 `for` 中直接调用集合的 `remove` 进行结构性修改；部分迭代器可能因此抛出 `ConcurrentModificationException`。

## 如何选择实现

| 需求 | 可以先考虑 |
| --- | --- |
| 按下标访问、依次追加 | `ArrayList` |
| 去重，无需固定遍历顺序 | `HashSet` |
| 去重并保留插入顺序 | `LinkedHashSet` |
| 按键查找值 | `HashMap` |
| 按键排序或范围查询 | `TreeMap` |
| 栈或双端队列操作 | `ArrayDeque` |

具体选择还要考虑数据规模、修改频率和并发需求，不能仅根据单次操作的复杂度判断。

## 注意事项

- `List.of`、`Set.of`、`Map.of` 创建不可修改集合，并且不接受 `null` 元素、键或值。
- `HashMap`、`HashSet` 不承诺固定遍历顺序。
- 自定义对象作为哈希键或集合元素时，应正确实现 `equals` 与 `hashCode`，并避免修改参与计算的字段。
- 普通集合通常不适合被多个线程无保护地并发修改，相关内容见[并发编程](../../advanced/concurrency/index.md)。

## 练习

使用一个 `Map<String, Integer>` 保存课程名称和学习分钟数。重复录入同一课程时累计时长，最后按插入顺序输出结果。

## 参考资料

- [Tpoint Tech：Collections in Java](https://www.tpointtech.com/collections-in-java)。
- [Java 21 API：Collections Framework](https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/util/package-summary.html#CollectionsFramework)。
