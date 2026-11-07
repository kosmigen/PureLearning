# 文件与 IO

IO 是 Input/Output 的缩写，表示程序与外部来源之间的数据输入和输出。文件、控制台、网络连接都可以成为数据来源或目标。

本章先介绍文件读写的基本方式，再通过[File 对象](1.File对象.md)说明传统文件路径 API。

## 路径、文件与数据流

| 概念 | 作用 |
| --- | --- |
| `Path` | 表示文件系统路径，可以指向尚不存在的文件 |
| `Files` | 提供读写、复制、移动和创建文件等静态方法 |
| `File` | 传统路径表示与文件属性操作，见[File 对象](1.File对象.md) |
| 字节流 | 通过 `InputStream`、`OutputStream` 等读写字节 |
| 字符流 | 通过 `Reader`、`Writer` 等处理字符与编码转换 |

`java.io` 提供传统 IO 类，`java.nio.file` 提供 `Path`、`Files` 等文件 API。

## 基本语法

```java
Path path = Path.of("notes", "plan.txt");
Files.writeString(path, "Learn Java", StandardCharsets.UTF_8);
String text = Files.readString(path, StandardCharsets.UTF_8);
```

`Path.of` 只创建路径对象。写文件前需要保证父目录存在；必要时可以调用 `Files.createDirectories(path.getParent())`。`writeString` 的默认行为会创建文件，或覆盖已有文件内容。

## 示例：保存并读取学习记录

下面在临时目录中完成读写，并在结束后清理本例创建的文件。

```java title="Main.java"
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;

public class Main {
    public static void main(String[] args) throws IOException {
        Path directory = Files.createTempDirectory("java-io-");
        Path file = directory.resolve("plan.txt");
        try {
            Files.writeString(file, "Java\nIO\n", StandardCharsets.UTF_8);
            String content = Files.readString(file, StandardCharsets.UTF_8);
            System.out.println("Content:");
            System.out.print(content);
        } finally {
            Files.deleteIfExists(file);
            Files.deleteIfExists(directory);
        }
    }
}
```

**输出：**

```text
Content:
Java
IO
```

`resolve` 在目录路径后拼接文件名。显式指定 UTF-8，可以使写入和读取采用一致的编码。

## 逐行读取与缓冲

`readString` 会把内容整体读入内存。处理较大文本时，可以用缓冲字符流逐行读取：

```java
try (BufferedReader reader = Files.newBufferedReader(path, StandardCharsets.UTF_8)) {
    String line;
    while ((line = reader.readLine()) != null) {
        System.out.println(line);
    }
}
```

`readLine()` 返回 `null` 表示到达文件末尾。空行的返回值是空字符串，不能据此判断读取结束。

## 常见操作

| 操作 | API 示例 |
| --- | --- |
| 创建目录 | `Files.createDirectories(directory)` |
| 复制文件 | `Files.copy(source, target)` |
| 移动文件 | `Files.move(source, target)` |
| 读取字节 | `Files.readAllBytes(path)` |
| 追加文本 | `Files.writeString(path, text, UTF_8, CREATE, APPEND)` |
| 删除文件 | `Files.delete(path)`、`Files.deleteIfExists(path)` |

上表中的 `UTF_8`、`CREATE`、`APPEND` 需要对应的导入或完整限定名。复制、移动和覆盖行为应根据需要选择选项。

## 注意事项

- 相对路径基于进程的工作目录，通常与源文件所在目录不同。
- 文本使用字符编码，图片、压缩包等二进制数据应按字节处理。
- 文件、目录遍历流和网络资源应及时关闭，优先采用 try-with-resources。
- 文件存在性检查与后续操作之间可能发生变化，操作本身的异常仍需处理。

## 练习

给示例增加第二次写入，使用追加模式保存新课程，再逐行读取文件。确认旧内容被保留，并保持临时文件清理逻辑。

## 参考资料

- [Tpoint Tech：Java I/O Tutorial](https://www.tpointtech.com/java-io)。
- [Java 21 API：Files](https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/nio/file/Files.html)。
