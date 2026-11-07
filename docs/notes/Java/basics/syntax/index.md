# 基本语法

Java 程序由类、字段、方法和语句等部分组成。基本语法决定如何声明数据、描述计算，并把重复的操作组织为方法。

## 变量与数据类型

变量有确定的类型，用于保存程序运行时需要使用的值。

**语法：**

```java
类型 变量名 = 初始值;
```

Java 有 8 种基本数据类型：

| 类型 | 含义 | 示例 |
| --- | --- | --- |
| `byte` | 8 位有符号整数 | `byte level = 3;` |
| `short` | 16 位有符号整数 | `short year = 2026;` |
| `int` | 32 位有符号整数 | `int count = 10;` |
| `long` | 64 位有符号整数 | `long total = 100L;` |
| `float` | 32 位浮点数 | `float ratio = 0.5F;` |
| `double` | 64 位浮点数 | `double price = 9.5;` |
| `char` | 一个 UTF-16 代码单元 | `char grade = 'A';` |
| `boolean` | 布尔值 | `boolean finished = false;` |

类、接口和数组等属于引用类型。引用类型的变量可以保存对象引用，也可以保存 `null`。

局部变量需要在读取前明确赋值；对象字段和数组元素则会获得对应类型的默认值。`final` 变量只能被赋值一次，但 `final` 引用指向的对象仍可能发生变化。

## 运算符与类型转换

| 类别 | 常用运算符 |
| --- | --- |
| 算术 | `+`、`-`、`*`、`/`、`%` |
| 比较 | `==`、`!=`、`>`、`>=`、`<`、`<=` |
| 逻辑 | `&&`、`||`、`!` |
| 赋值 | `=`、`+=`、`-=`、`*=` |
| 条件 | `条件 ? 值一 : 值二` |

`&&` 和 `||` 具有短路求值行为。整数相除产生整数结果，例如 `7 / 2` 为 `3`；可以用 `7 / 2.0` 得到浮点结果。

从较宽数值类型转换到较窄类型通常需要显式转换，可能丢失信息：

```java
double value = 8.9;
int whole = (int) value; // 得到 8
```

## 方法

方法把一段操作封装为可调用的单元。参数描述输入，返回类型描述结果；`void` 表示不返回值。

**语法：**

```java
访问修饰符 返回类型 方法名(参数列表) {
    // 方法体
}
```

`static` 方法属于类，可以通过类名调用。实例方法通过对象调用，能够访问这个对象的实例状态。

## 示例：计算学习进度

```java title="Main.java"
public class Main {
    static double percentage(int completed, int total) {
        return completed * 100.0 / total;
    }

    public static void main(String[] args) {
        int completed = 3;
        int total = 8;
        double progress = percentage(completed, total);

        System.out.println("Completed: " + completed);
        System.out.println("Progress: " + progress + "%");
        System.out.println("All done: " + (completed == total));
    }
}
```

**输出：**

```text
Completed: 3
Progress: 37.5%
All done: false
```

`100.0` 使计算采用浮点运算。字符串与其他值使用 `+` 连接时，结果为字符串。本例假定 `total` 大于零，输入校验将在异常处理章节中介绍。

## 包与导入

`package` 声明类所属的包，`import` 允许在代码中使用类型的简单名称：

```java
package learning;

import java.util.List;
```

`java.lang` 中的常用类型会被自动导入，例如 `String` 和 `System`。子包不会因为导入父包而自动导入。

## 注意事项

- 标识符区分大小写，`total` 和 `Total` 是不同名称。
- `var` 可以推断已初始化的局部变量类型，变量仍具有静态类型。
- 数值转换可能损失精度，整数运算也可能溢出。
- 引用类型的 `==` 比较引用身份，内容比较应查看对应类型的 `equals` 约定。

## 练习

为进度示例增加一个方法，接收“每天学习分钟数”和“天数”，返回总学习时长。分别用 `int` 和 `long` 保存结果，观察类型选择的影响。

## 参考资料

- [Tpoint Tech：Java Variables](https://www.tpointtech.com/java-variables)。
- [Java 21 语言规范：Types, Values, and Variables](https://docs.oracle.com/javase/specs/jls/se21/html/jls-4.html)。
