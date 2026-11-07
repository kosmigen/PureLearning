# 面向对象

面向对象编程通过对象组织状态与行为。类描述一类对象具有哪些字段和方法，对象则保存一次具体使用中的状态。

## 类与对象

**语法：**

```java
class 类名 {
    // 字段
    // 构造器
    // 方法
}
```

使用 `new` 创建对象时会调用构造器。构造器与类同名，没有返回类型；`this` 表示当前对象，可以用来区分字段与同名参数。

| 概念 | 作用 |
| --- | --- |
| 封装 | 通过字段可见性和方法维护对象状态的有效性 |
| 继承 | 通过 `extends` 建立已有类与新类的关系 |
| 抽象 | 用接口或抽象类描述调用方需要的能力 |
| 多态 | 调用相同接口时，根据实际对象执行不同的实现 |
| 组合 | 一个对象持有并使用其他对象，协作完成任务 |

Java 类只能直接继承一个类，但可以实现多个接口。接口可以声明抽象方法，也可以提供默认方法、静态方法等。

## 访问控制

| 修饰方式 | 可访问范围 |
| --- | --- |
| `public` | 满足类型可见性及模块规则的外部代码 |
| `protected` | 同包代码，以及符合访问规则的子类代码 |
| 不写访问修饰符 | 同一个包 |
| `private` | 声明它的顶层类所包含的代码范围 |

封装不仅是添加 getter 和 setter。对象的方法应维护规则，例如余额不能随意变成负数，学习时长不能无条件减少。

## 示例：通过接口安排学习任务

```java title="Main.java"
interface StudyTask {
    String summary();
}

class ReadingTask implements StudyTask {
    private final String title;
    private final int pages;

    ReadingTask(String title, int pages) {
        if (pages <= 0) {
            throw new IllegalArgumentException("pages must be positive");
        }
        this.title = title;
        this.pages = pages;
    }

    @Override
    public String summary() {
        return title + ": " + pages + " pages";
    }
}

public class Main {
    public static void main(String[] args) {
        StudyTask task = new ReadingTask("Java basics", 12);
        System.out.println(task.summary());
    }
}
```

**输出：**

```text
Java basics: 12 pages
```

`task` 的声明类型是 `StudyTask`，实际对象是 `ReadingTask`。调用 `summary()` 时执行实际对象的实现，这体现了接口多态。字段通过 `private final` 限制访问和重新赋值，构造器负责检查页数。

## 重载与重写

| 比较项 | 重载 | 重写 |
| --- | --- | --- |
| 发生位置 | 同一类型可见的方法集合中 | 子类或接口实现关系中 |
| 方法名 | 相同 | 相同 |
| 参数 | 参数列表不同 | 与被重写方法匹配 |
| 选择依据 | 主要在编译期根据参数类型选择 | 实例方法调用可在运行时根据对象选择实现 |

仅改变返回类型不能形成方法重载。重写时建议使用 `@Override`，让编译器检查方法是否确实覆盖了目标声明。

## 继承与组合

存在稳定的“是一种”关系时可以考虑继承，例如某个具体任务是一种任务。需要复用协作能力时可以采用组合，例如学习服务持有一个消息发送器。

`static` 成员属于类。`final` 方法不能被重写，`final` 类不能被继承。父类构造器通过 `super(...)` 调用，构造器本身不会被继承。

## 注意事项

- Java 方法参数始终按值传递；传入对象时复制的是引用的值。
- 实例字段属于各自的对象，静态字段由类的实例共享使用。
- `protected` 的跨包访问有额外限制，不能简单理解成任何子类都能访问任意父类对象的字段。
- 设计继承关系时需要保证子类符合父类型的使用约定。

## 练习

新增一个实现 `StudyTask` 的 `CodingTask`，让 `summary()` 返回练习名称和题目数量。将两种任务放进同一个数组，统一调用 `summary()`。

## 参考资料

- [Tpoint Tech：OOPs Concepts in Java](https://www.tpointtech.com/java-oops-concepts)。
- [Java 21 语言规范：Classes](https://docs.oracle.com/javase/specs/jls/se21/html/jls-8.html)。
