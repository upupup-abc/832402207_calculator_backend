# 后端代码规范（codestyle.md）

## 规范来源

本项目的后端代码规范**并非自行发明**，而是依据以下主流官方规范裁剪而成，
并针对「Node.js 原生 ESM + SQLite + 无第三方依赖」这一技术栈做了取舍：

| 来源 | 采纳内容 |
| --- | --- |
| [Google JavaScript Style Guide](https://google.github.io/styleguide/jsguide.html) | 文件命名、命名大小写规则、JSDoc 注释要求、`const`/`let` 使用、避免可变导出 |
| [Node.js 官方最佳实践](https://github.com/goldbergyoni/nodebestpractices) | 分层架构与关注点分离、配置与代码分离、优雅关闭、统一错误处理 |
| [The Twelve-Factor App](https://12factor.net/zh_cn/) | 配置通过环境变量注入、日志作为事件流输出到 stdout |
| [SQLite 官方建议](https://www.sqlite.org/wal.html) | 启用 WAL 模式提升并发读写可靠性 |
| [MDN JavaScript 参考](https://developer.mozilla.org/zh-CN/docs/Web/JavaScript) | 优先使用标准库 API，避免自造轮子 |

**对 Google 规范的两点有意偏离**（均已在代码注释中说明原因）：

1. Google 规范建议行宽 80 字符。本项目放宽到 **100 字符**，因为中文 JSDoc 注释在
   80 字符内会被迫频繁换行，反而降低可读性。
2. Google 规范建议使用 `const` 定义的模块级导出直接导出对象。本项目对配置与常量表
   额外使用 `Object.freeze()` 冻结，防止运行期被意外修改。

---

## 一、文件与目录

- 目录名与文件名一律使用**小写**，多个单词用**连字符**或直接连写，不使用下划线：
  - 目录：`calculator/`、`controller/`、`service/`、`model/`、`util/`
  - 文件：`historyModel.js`、`calculateController.js`（类文件用 camelCase，与导出的主要对象同名）
- 单元测试文件与被测对象同名，加 `.test.js` 后缀，统一放在 `test/` 目录。
- 脚本文件放在 `scripts/`，使用 `.mjs` 后缀以明确表示不受 `package.json` 的 `type` 影响。

---

## 二、分层与依赖方向

```
app.js（路由 / 中间件）
   ↓
controller/（HTTP 语义翻译，禁止写业务逻辑，禁止写 SQL）
   ↓
service/（业务校验与编排，禁止直接操作 req/res）
   ↓
model/（SQL 与行对象映射，禁止抛 HTTP 状态码）
   ↓
database.js（连接管理）

calculator/（纯计算内核，不依赖以上任何一层，也不做任何 IO）
```

**硬性规则：**

1. 依赖只能**向下**，禁止反向引用，禁止跨层跳跃（例如 controller 不得直接 `import model/`）。
2. `calculator/` 与 `util/` 是可复用的纯逻辑，不得依赖 `config` 之外的项目模块。
3. SQL 只允许出现在 `model/` 目录下，其他层不允许出现 SQL 字符串。

---

## 三、命名规范

| 类别 | 规则 | 示例 |
| --- | --- | --- |
| 变量、函数、方法 | `camelCase` | `normalizedExpression`、`parsePagination()` |
| 类、构造函数 | `PascalCase` | `CalculatorError`、`Parser` |
| 常量（模块级、`Object.freeze` 的对象） | `UPPER_SNAKE_CASE` | `MAX_EXPRESSION_LENGTH`、`ERROR_CODE` |
| 模块私有函数 | `camelCase`，不导出 | `escapeLike()`、`buildFilters()` |
| 布尔变量 / 返回布尔值的函数 | 以 `is` / `has` / `can` / `should` 开头 | `isFavorite`、`hasNext`、`canParse` |
| 数据库字段（SQL 中） | `snake_case` | `normalized_expression`、`created_at` |
| 对外 JSON 字段 | `camelCase` | `normalizedExpression`、`createdAt` |

**SQL 的 snake_case 与 API 的 camelCase 之间的转换，只允许在 `model/` 层完成**
（见 `historyModel.js` 的 `toRecord()` 函数），这样数据库命名习惯与 API 命名习惯
各自保持地道，且转换点唯一。

---

## 四、注释与文档

1. **所有对外导出的函数、类、常量都必须有 JSDoc 注释**，包含 `@param` 与 `@returns`；
   可能抛错时必须写 `@throws`，并注明错误码。
2. 每个文件顶部必须有**文件级块注释**，说明：这个文件负责什么、为什么这样设计、
   参考了哪个规范。涉及安全或设计取舍时，必须写明理由。
3. 注释解释**为什么**，而不是重复代码在做什么。

```javascript
/**
 * 转义 SQL LIKE 中的通配符，避免用户输入的 % 与 _ 变成通配符。
 *
 * @param {string} keyword 原始关键词。
 * @returns {string} 转义后的关键词。
 */
function escapeLike(keyword) {
  return keyword.replace(/[\\%_]/g, (match) => `\\${match}`);
}
```

4. 允许使用 `// ---- 分节标题 ----` 形式在长文件中划分小节。

---

## 五、JavaScript 语法约定

- 统一使用 **ES Module**（`import` / `export`），`package.json` 中声明 `"type": "module"`。
- 禁止使用 `var`；能用 `const` 就不用 `let`。
- 优先使用 `Object.freeze()` 冻结模块级导出的配置对象与常量表。
- 使用**可选链** `?.` 与**空值合并** `??`，但不滥用。
- 字符串统一使用**单引号**；模板字符串仅在需要插值时使用。
- 语句末尾必须带分号。
- 使用 `===` / `!==`，不使用 `==` / `!=`。
- 单个函数不超过约 50 行；超过时拆分为私有小函数。

---

## 六、错误处理

1. **业务错误**统一抛出 `CalculatorError`，构造时携带：
   - `code`：机器可读错误码（来自 `ErrorCode` 枚举），前端据此做差异化处理；
   - `message`：面向用户的中文提示；
   - `position`：出错字符下标（可选）；
   - `statusCode`：建议的 HTTP 状态码。
2. **禁止用字符串比较来判断错误类型**，必须比较 `error.code`。
3. `app.js` 是**唯一的错误出口**：所有异常在此被捕获并转换成统一响应信封，
   未预期的异常记录完整堆栈后对外只返回「服务器内部错误」，不泄漏内部细节。
4. 不允许吞掉异常。确实需要忽略时（例如 `localStorage` 不可用），
   必须写明注释说明为什么可以忽略。
5. 所有 `Promise` 必须有 `.catch` 或处于 `try/catch` 中。

---

## 七、安全规范（本项目强制）

1. **严禁使用 `eval`、`exec`、`new Function`、`vm.runIn*`、`child_process`**
   处理任何用户输入。仓库内置的单元测试会自动扫描计算链路源码来确保这一点。
2. **禁止字符串拼接 SQL**。所有用户输入必须通过 `?` 占位符参数绑定传入。
3. 所有外部输入（URL 参数、请求体、路径参数）都必须经过类型与范围校验，
   校验逻辑集中在 `service/` 层。
4. 设置请求体大小上限、表达式长度上限、Token 数量上限、递归嵌套深度上限，
   防止构造超长/超深输入消耗 CPU 或导致栈溢出。
5. 静态文件服务必须防御路径穿越：`path.resolve` 之后校验目标是否仍在根目录内。
6. 不在响应中返回堆栈信息、文件绝对路径等内部细节。

---

## 八、日志规范

- 使用 `util/logger.js`，禁止直接 `console.log`。
- 日志输出到 **stdout / stderr**，不写日志文件（由部署平台负责收集）。
- 采用**结构化**格式：先给一句人类可读的消息，再跟一个 JSON 对象承载字段。

```javascript
logger.info('计算器后端服务已启动', { url, env, dbPath });
logger.error('未捕获异常', { message, stack });
```

---

## 九、测试规范

- 使用 Node.js 内置 `node:test` 与 `node:assert/strict`，不引入第三方测试框架。
- 测试文件放在 `test/`，命名 `<模块名>.test.js`。
- 断言必须写**失败提示信息**，便于定位：

```javascript
assert.equal(outcome.result, 9, '(1+2)*3 应等于 9');
```

- 每个错误分支都要有对应的测试用例，断言的是 `error.code` 而不是错误文案。
- 涉及数据库的测试使用 `:memory:` 数据库（通过 `process.env.DB_PATH` 注入），
  绝不污染开发用的 `data/calculator.db`。
- 测试之间必须相互独立，不依赖执行顺序（分页总数这类断言使用 `>=` 而非 `===`）。

---

## 十、提交前自检清单

- [ ] `npm test` 全部通过
- [ ] 新增的导出函数都有 JSDoc 注释
- [ ] 没有出现 `eval` / `exec` / `new Function`
- [ ] SQL 中所有用户输入都使用了 `?` 占位符
- [ ] 新增的接口有对应的集成测试
- [ ] 环境相关的值都通过 `config` 读取，代码里没有硬编码的路径或端口
