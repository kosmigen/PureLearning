# 字符串与数组

字符串用于保存和处理文本，数组用于保存固定数量、同一种元素类型的数据。它们是处理用户输入、文件内容和批量数据时最常见的基础类型。

## 字符串

`String` 是不可变类。对字符串调用 `strip()`、`replace()` 或拼接操作会产生结果字符串，原有字符串对象的内容不会因此改变。

**语法：**

```java
String title = "Java";
String cleaned = title.strip();
```

| 常用操作 | 方法或写法 |
| --- | --- |
| 获取长度 | `text.length()` |
| 比较内容 | `text.equals(other)` |
| 查找内容 | `text.contains("Java")`、`text.indexOf("a")` |
| 截取片段 | `text.substring(begin, end)`，包含起点、不包含终点 |
| 去除两端空白 | `text.strip()` |
| 分割文本 | `text.split(regex)`，参数是正则表达式 |

需要多次追加文本时，可以使用 `StringBuilder`。调用 `append()` 修改构建器的内容，最后通过 `toString()` 得到字符串。

## 数组

数组的长度在创建后固定，使用从 `0` 开始的下标访问元素。

**语法：**

```java
int[] scores = {72, 85, 93};
int[] buffer = new int[5];
```

数组长度使用字段 `array.length`，字符串长度使用方法 `text.length()`。`Arrays` 工具类提供排序、复制、比较和格式化输出等操作。

## 示例：整理课程名称与成绩

```java title="Main.java"
import java.util.Arrays;

public class Main {
    public static void main(String[] args) {
        String raw = "  Java Core  ";
        String title = raw.strip();
        String sameTitle = new String("Java Core");

        int[] scores = {82, 65, 91};
        int[] sorted = Arrays.copyOf(scores, scores.length);
        Arrays.sort(sorted);

        System.out.println(title);
        System.out.println("Same text: " + title.equals(sameTitle));
        System.out.println("Original: " + Arrays.toString(scores));
        System.out.println("Sorted: " + Arrays.toString(sorted));
    }
}
```

**输出：**

```text
Java Core
Same text: true
Original: [82, 65, 91]
Sorted: [65, 82, 91]
```

`Arrays.copyOf` 创建新数组，排序只影响副本。数组中存放引用类型元素时，这种复制不会自动复制元素指向的对象。

## 字符、代码单元与长度

`char` 表示一个 UTF-16 代码单元。某些字符需要两个代码单元，因此 `String.length()` 不一定等于用户看到的字符数量。需要按 Unicode 码点处理文本时，可以使用 `codePoints()` 或 `codePointCount()`；按视觉字符分组还可能涉及组合字符等规则。

## 注意事项

- 比较字符串内容使用 `equals`，不要依赖字符串常量池使 `==` 偶然得到正确结果。
- `Arrays.sort(array)` 会直接改变传入的数组。
- 数组赋值 `copy = original` 只是复制引用，两个变量指向同一数组。
- `split(".")` 中的点是正则语法，按普通点号分割通常需要写成 `split("\\.")`。

## 练习

接收一个以逗号分隔的课程名称字符串，分割后去掉每个名称两端的空白，再用 `StringBuilder` 组合成每行一个名称的文本。

## 参考资料

- [Tpoint Tech：Java Strings](https://www.tpointtech.com/java-string)。
- [Java 21 API：String](https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/lang/String.html)。
- [Java 21 API：Arrays](https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/util/Arrays.html)。
