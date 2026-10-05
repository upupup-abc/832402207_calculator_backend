# 832402207_calculator_backend

前后端分离计算器系统 —— **后端服务**

学号：832402207 · 姓名：Zhijun Chen · 课程：软件工程（第一次作业）

> 本仓库只包含后端。前端仓库为 `832402207_calculator_frontend`。
> 两个仓库通过 HTTP / JSON 接口通信，可以独立开发、独立部署。

---

## 一、项目介绍

本服务是「前后端分离计算器系统」的后端，承担**全部**核心计算与数据持久化职责：

| 职责 | 说明 |
| --- | --- |
| 接收计算请求 | `POST /api/calculate`，请求体只包含表达式字符串 |
| 校验输入 | 非空校验、长度上限（200 字符）、Token 数量上限、嵌套深度上限（64 层） |
| 解析表达式 | 自研**词法分析 → 递归下降语法分析 → AST** 三步流水线 |
| 执行计算 | 遍历 AST 求值，支持四则运算、幂、取余、阶乘、21 个数学函数与 3 个常量 |
| 处理异常 | 除零、取余除零、函数定义域、浮点溢出、语法错误等，各有独立错误码 |
| 存储历史 | 每次**成功**计算写入 SQLite 数据库 |
| 读取历史 | 分页 + 关键词检索 + 仅看收藏 |
| 删除历史 | 删除指定记录 / 清空全部 |
| 返回标准响应 | 统一信封结构 + 恰当的 HTTP 状态码 |

**安全要点：全程未使用 `eval` / `exec` / `new Function` / `child_process`。**
用户输入只会进入词法分析器，最终由 `switch` 分支解释执行 AST，不存在任意代码执行的可能。
仓库内置的单元测试会扫描计算链路源码，确认其中不出现上述危险 API。

---

## 二、技术栈

| 项目 | 选型 | 说明 |
| --- | --- | --- |
| 运行时 | Node.js 24 | 使用内置 `node:sqlite`，**无需安装任何第三方依赖** |
| HTTP 服务 | `node:http` | 手写最小路由，代码即文档，请求链路一目了然 |
| 数据库 | SQLite（`node:sqlite`） | 文件型数据库，零配置，满足持久化要求 |
| 表达式解析 | 自研 Tokenizer + 递归下降 Parser | 不使用 `eval`，不使用第三方表达式库 |
| 日志 | 自定义轻量 logger | 结构化输出，便于在 Render 日志面板排查 |
| 测试 | `node:test` + `node:assert` | 65 个测试用例，含 API 集成测试、安全合规测试与能力清单一致性测试 |

`dependencies` 与 `devDependencies` **均为空对象**，这是刻意设计：
助教拿到仓库后只需 `npm start` 即可运行，不存在依赖安装失败的风险。

---

## 三、运行环境

- **Node.js ≥ 22.13.0（推荐 24）**
  本项目使用的 `node:sqlite` 从 Node 22.13 / 23.4 起已无需实验性开关，所以 22.13 及以上都能跑；
  但开发与部署统一按 **Node 24.21.0** 配置 —— 仓库里的 `.node-version` 与 `render.yaml` 的
  `NODE_VERSION` 都写的是完整版本号 `24.21.0`（Render 要求完整版本号，只写 `24` 无效），
  `package.json` 的 `engines` 写的是带**上界**的范围 `>=22.13.0 <25.0.0`
  （带上界是有意为之：Render 官方文档提醒，像 `>=22.13.0` 这种无上界的范围会被解析成"最新版"，
  将来 Node 发布 25、26 时会自动升级，可能带来意外不兼容）。
- 操作系统：Windows / macOS / Linux 均可
- 无需额外安装数据库服务

检查版本：

```bash
node -v     # 应输出 v24.x.x 或更高
```

---

## 四、安装方法

```bash
git clone https://github.com/upupup-abc/832402207_calculator_backend.git
cd 832402207_calculator_backend
npm install      # 没有任何依赖，此步骤秒完成；也可以直接跳过
```

---

## 五、启动方法

```bash
npm start        # 生产模式启动
npm run dev      # 开发模式（--watch 自动重启）
```

启动成功后终端会输出：

```
[2026-10-04T10:43:12.439Z] INFO  数据库初始化完成 {"dbPath":".../data/calculator.db"}
[2026-10-04T10:43:12.501Z] INFO  计算器后端服务已启动 {"url":"http://localhost:3000", ...}
[2026-10-04T10:43:12.501Z] INFO  浏览器打开 http://localhost:3000 即可使用计算器
```

然后直接访问 <http://localhost:3000>：

- 如果本机存在 `public/` 目录（已同步的前端静态资源），会直接打开计算器页面；
- 如果不存在，也会尝试加载同级目录 `../832402207_calculator_frontend/src`；
- 无论哪种情况，API 都在 `http://localhost:3000/api/**` 下可用。

### 运行测试

```bash
npm test
```

预期输出：`tests 65 / pass 65 / fail 0`。

---

## 六、配置说明

所有配置通过环境变量注入，代码里只有对开发环境友好的默认值。

| 环境变量 | 默认值 | 说明 |
| --- | --- | --- |
| `PORT` | `3000` | 监听端口 |
| `HOST` | `0.0.0.0` | 监听地址 |
| `DB_PATH` | `data/calculator.db` | SQLite 数据库文件路径，可以是绝对路径 |
| `STATIC_DIR` | 自动探测 | 静态资源目录；优先级 `public/` > 同级前端仓库 `src/` |
| `CORS_ORIGIN` | `*` | CORS 白名单，逗号分隔多个来源；`*` 表示允许任意来源 |
| `MAX_BODY_BYTES` | `16384` | 单个请求体上限（字节） |
| `ACCESS_LOG` | `true` | 是否输出访问日志，设为 `false` 可关闭 |
| `NODE_ENV` | `development` | 运行环境标识 |

示例：

```bash
# Windows PowerShell
$env:PORT="8080"; $env:DB_PATH="D:\calc\calculator.db"; npm start

# Linux / macOS
PORT=8080 DB_PATH=/var/lib/calc/calculator.db npm start
```

---

## 七、数据库初始化方法

**不需要手动执行任何 SQL 脚本。** 服务启动时会自动：

1. 若 `DB_PATH` 所在目录不存在，则递归创建；
2. 打开 SQLite 连接，开启 WAL 模式与 5 秒忙等待超时；
3. 执行幂等的 `CREATE TABLE IF NOT EXISTS` 建表语句与索引语句。

### 表结构

```sql
CREATE TABLE IF NOT EXISTS calculation_history (
    id                    INTEGER PRIMARY KEY AUTOINCREMENT,  -- 主键，自增
    expression            TEXT    NOT NULL,                   -- 用户输入的原始表达式
    normalized_expression TEXT    NOT NULL,                   -- 归一化后的表达式（去掉空白、统一符号）
    result                REAL    NOT NULL,                   -- 计算结果数值
    result_text           TEXT    NOT NULL,                   -- 结果的展示文本（用于检索与导出）
    is_favorite           INTEGER NOT NULL DEFAULT 0,         -- 是否收藏，0/1
    created_at            TEXT    NOT NULL                    -- 计算时间（ISO 8601 UTC）
);

CREATE INDEX IF NOT EXISTS idx_calc_history_created_at
    ON calculation_history (created_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_calc_history_favorite
    ON calculation_history (is_favorite, created_at DESC);
```

字段设计说明：

- `expression` 与 `normalized_expression` 分开存储：前者保留用户原始写法（如 `12 × 8`），
  后者用于归并相同算式、统计「最常使用的算式」以及前端一键复用；
- `is_favorite` 使用 INTEGER 存储，因为 SQLite 没有布尔类型；
- `created_at` 统一存 UTC 的 ISO 8601 字符串，由**前端按浏览器本地时区格式化**展示，
  这样服务器部署在任何时区都不会让助教看到错误的时间。

### 重置数据库

```bash
# 直接删除数据库文件即可，下次启动会自动重建
rm -f data/calculator.db data/calculator.db-wal data/calculator.db-shm
```

### 写入演示数据（可选）

统计面板（7 天趋势、最常使用算式）需要多天累积的数据才有展示效果。
仓库提供了一个**明确标注为示例数据**的种子脚本：

```bash
npm run seed:demo
```

它会先清空现有记录，再写入 64 条时间分布在最近 7 天的示例计算记录
（其中约 1/9 被标记为收藏）。脚本运行时会打印实际写入数量，可随时用
`DELETE /api/history` 或删除数据库文件清空。

---

## 八、API 文档

- 所有接口前缀：`/api`
- 请求与响应均为 `application/json; charset=utf-8`
- 全部查询参数都经过类型与范围校验

### 统一响应格式

成功（HTTP 200 / 201）：

```json
{
  "success": true,
  "message": "ok",
  "data": { }
}
```

失败（HTTP 400 / 404 / 405 / 413 / 500）：

```json
{
  "success": false,
  "message": "除数不能为 0",
  "error": {
    "code": "DIVISION_BY_ZERO",
    "message": "除数不能为 0",
    "position": 1
  }
}
```

`position` 是出错字符在表达式中的下标，前端可以据此高亮定位。

### 接口一览

| 方法 | 路径 | 说明 | 成功状态码 |
| --- | --- | --- | --- |
| `GET` | `/api/health` | 健康检查（部署平台探活用） | 200 |
| `GET` | `/api/grammar` | 返回后端支持的运算符 / 函数 / 常量 / 语法说明 | 200 |
| `POST` | `/api/calculate` | **核心接口**：计算表达式并写入历史 | 201 |
| `GET` | `/api/history` | 分页查询历史，支持 `page` `pageSize` `keyword` `favoriteOnly` | 200 |
| `GET` | `/api/history/stats` | 统计数据（总数、今日、收藏、去重算式数、7 天趋势、Top5） | 200 |
| `GET` | `/api/history/export` | 导出 CSV（后端生成，带 UTF-8 BOM） | 200 |
| `DELETE` | `/api/history/:id` | 删除指定记录 | 200 |
| `DELETE` | `/api/history` | 清空全部记录 | 200 |
| `PATCH` | `/api/history/:id/favorite` | 收藏 / 取消收藏 | 200 |
| `GET` | `/api/convert/units` | 单位换算的类别与单位清单 | 200 |
| `POST` | `/api/convert` | 单位换算（附加功能，同样在后端计算） | 200 |

### 示例

**计算**

```http
POST /api/calculate
Content-Type: application/json

{ "expression": "(1+2)*3" }
```

```json
{
  "success": true,
  "message": "ok",
  "data": {
    "id": 12,
    "expression": "(1+2)*3",
    "normalizedExpression": "(1+2)*3",
    "result": 9,
    "resultText": "9",
    "createdAt": "2026-10-04T10:43:20.053Z"
  }
}
```

**查询历史**

```http
GET /api/history?page=1&pageSize=8&keyword=sin&favoriteOnly=true
```

```json
{
  "success": true,
  "message": "ok",
  "data": {
    "items": [
      {
        "id": 163,
        "expression": "sin(pi/6)+log(1000)+5!",
        "normalizedExpression": "sin(pi/6)+log(1000)+5!",
        "result": 123.5,
        "resultText": "123.5",
        "isFavorite": true,
        "createdAt": "2026-10-04T10:49:57.182Z"
      }
    ],
    "total": 1,
    "page": 1,
    "pageSize": 8,
    "totalPages": 1,
    "hasNext": false,
    "hasPrev": false
  }
}
```

**删除**

```http
DELETE /api/history/164
```

```json
{ "success": true, "message": "已删除 id 为 164 的计算记录", "data": { "id": 164 } }
```

### 错误码一览

| 错误码 | HTTP | 含义 |
| --- | --- | --- |
| `EMPTY_EXPRESSION` | 400 | 表达式为空或缺少 `expression` 参数 |
| `EXPRESSION_TOO_LONG` | 400 | 表达式超过 200 字符 |
| `EXPRESSION_TOO_COMPLEX` | 400 | Token 数超过 512 或括号嵌套超过 64 层 |
| `INVALID_CHARACTER` | 400 | 出现无法识别的字符 |
| `INVALID_NUMBER` | 400 | 数字字面量非法 |
| `UNKNOWN_IDENTIFIER` | 400 | 未知的函数或常量 |
| `UNEXPECTED_TOKEN` | 400 | 语法上无法继续解析 |
| `MISSING_OPERAND` | 400 | 运算符缺少操作数（如 `1+*2`） |
| `UNCLOSED_PARENTHESIS` | 400 | 左括号没有匹配的右括号 |
| `UNEXPECTED_PARENTHESIS` | 400 | 右括号没有匹配的左括号 |
| `DIVISION_BY_ZERO` | 400 | 除数为 0 |
| `MODULO_BY_ZERO` | 400 | 取余的除数为 0 |
| `INVALID_FUNCTION_ARGUMENT` | 400 | 函数定义域错误（如 `sqrt(-1)`、`ln(0)`、`1.5!`） |
| `UNDEFINED_RESULT` | 400 | 结果不是实数 |
| `NUMBER_OVERFLOW` | 400 | 结果溢出（如 `200!`） |
| `VALIDATION_ERROR` | 400 | 分页 / 路径 / 换算参数非法 |
| `HISTORY_NOT_FOUND` | 404 | 要删除或收藏的记录不存在 |
| `ROUTE_NOT_FOUND` | 404 | 接口不存在 |
| `METHOD_NOT_ALLOWED` | 405 | HTTP 方法不被该接口支持 |
| `INTERNAL_ERROR` | 500 | 服务器内部错误 |

---

## 九、支持的表达式语法

| 语法 | 示例 | 说明 |
| --- | --- | --- |
| 四则运算 | `12+8` `96-37` `15*24` `144/12` | 也接受全角 `×` `÷` `−`，后端自动归一化 |
| 中文输入法全角字符 | `１２＋８` → 20 | 全角数字、全角小数点、全角括号与运算符都会被归一化 |
| 运算符优先级 | `1+2*3` → 7 | 乘除优先于加减 |
| 括号 | `(1+2)*3` → 9 | 最多嵌套 64 层 |
| 一元正负号 | `-5+8` `3*-2` | 一元运算优先级高于幂运算：`-2^2` = -4 |
| 幂运算 | `2^10` `2^3^2` → 512 | 右结合；`**` 也会被归一化为 `^` |
| 取余 | `10%3` → 1 | 除数为 0 时报 `MODULO_BY_ZERO` |
| 阶乘 | `5!` → 120 | 仅支持非负整数，上限 170! |
| 小数与科学计数法 | `3.14` `.5` `1.5e-3` | |
| 隐式乘法 | `2(3+4)` `3pi` `2sin(0)` | |
| 函数 | `sin(pi/6)` `log(1000)` `log10(1000)` `sqrt(144)` `cbrt(27)` | 共 21 个，见 `GET /api/grammar` |
| 常量 | `pi` `e` `tau` `π` | |

### 浮点处理策略

二进制浮点无法精确表示十进制小数，因此后端在返回结果前会：

1. **归一化到 12 位有效数字**，消除末位噪声：`0.1+0.2` 返回 `0.3` 而不是 `0.30000000000000004`；
2. 对**使用了超越函数**的表达式，把绝对值小于 `1e-12` 的结果归零：
   `sin(pi)` 理论值为 0，实际浮点计算得 `1.22e-16`，归一化后返回 `0`；
   而用户直接输入的 `1e-13` 不会被误判为 0。

---

## 十、项目目录结构

```
832402207_calculator_backend/
├── src/
│   ├── server.js                 # 服务入口：初始化数据库、创建 HTTP 服务、优雅退出
│   ├── app.js                    # 中间件 + 手写路由表（URL → 控制器）
│   ├── config/
│   │   └── index.js              # 环境变量解析与默认值
│   ├── calculator/               # ★ 表达式计算内核（纯函数，无 IO）
│   │   ├── errors.js             # 错误码枚举与 CalculatorError
│   │   ├── tokenizer.js          # 词法分析：字符串 → Token 序列
│   │   ├── parser.js             # 语法分析：Token 序列 → AST（递归下降）
│   │   └── evaluator.js          # 求值：AST → 数值（含定义域与溢出检查）
│   ├── controller/               # 接口层：HTTP 请求/响应翻译
│   │   ├── calculateController.js
│   │   ├── historyController.js
│   │   ├── convertController.js
│   │   └── metaController.js
│   ├── service/                  # 业务层：校验、编排、事务性逻辑
│   │   ├── calculatorService.js
│   │   ├── historyService.js
│   │   └── convertService.js
│   ├── model/                    # 数据层：SQL 与行对象映射
│   │   ├── database.js           # 连接管理与建表脚本
│   │   └── historyModel.js       # 历史记录 DAO
│   └── util/
│       ├── http.js               # 统一响应信封、请求体解析、CORS
│       ├── static.js             # 静态资源托管（含路径穿越防御）
│       └── logger.js             # 轻量结构化日志
├── test/
│   ├── calculator.test.js        # 计算引擎与异常处理单元测试
│   ├── api.test.js               # 真实 HTTP 集成测试
│   └── convert.test.js           # 单位换算测试
├── scripts/
│   ├── seed-demo.mjs             # 写入示例数据（用于展示统计功能）
│   └── sync-public.mjs           # 把前端仓库 src/ 同步到 public/（部署用）
├── public/                       # 前端静态资源部署副本（由脚本同步，勿手改）
├── data/                         # SQLite 数据文件目录（已 gitignore）
├── Dockerfile
├── render.yaml
├── package.json
├── codestyle.md
└── README.md
```

分层依赖方向严格单向：`app → controller → service → model`，
`calculator/` 是被 `service` 引用的纯计算内核，不依赖任何其他层。

---

## 十一、前后端连接方式

| 场景 | 前端访问方式 | 说明 |
| --- | --- | --- |
| **本地开发（推荐）** | 后端同时托管前端 | 访问 `http://localhost:3000`，前端用相对路径 `/api/**` 请求，同源无跨域 |
| 本地前后端独立运行 | `http://localhost:5173` | 在 `832402207_calculator_frontend` 执行 `node serve.mjs`；前端会自动把 API 指向 `http://localhost:3000`，此时走 CORS |
| 生产：单服务 | Render Web Service 地址 | 后端托管前端 + API，只要一个链接 |
| 生产：分离部署 | Render Static Site | 在静态站点配置 `Rewrite` 规则把 `/api/*` 反代到后端域名 |

前端也支持用 `?api=https://xxx.onrender.com` 临时指定后端地址，便于联调。

CORS 默认允许任意来源（`CORS_ORIGIN=*`）；如需收紧，把它设为前端域名即可：

```bash
CORS_ORIGIN=https://832402207-calculator-frontend.onrender.com
```

---

## 十二、部署

### Render 一键部署

1. 把本仓库推送到 GitHub；
2. 在 Render 控制台选择 **New → Blueprint**，选中本仓库（仓库根目录已包含 `render.yaml`）；
3. Render 会读取 `render.yaml` 自动创建 Web Service，无需手工填写构建/启动命令；
4. 部署完成后访问 `https://<服务名>.onrender.com` 即可看到计算器页面。

详细步骤（含可选的前后端分离部署方案）见仓库同级的 `docs/DEPLOYMENT.md`。

### Docker

```bash
docker build -t calculator-backend .
docker run -p 3000:3000 -v $(pwd)/data:/app/data calculator-backend
```

`-v` 把 `data/` 挂载到宿主机，保证容器重建后历史记录不丢失。

---

## 十三、代码规范

见 [codestyle.md](./codestyle.md)。本文档说明了规范来源（Google JavaScript Style Guide
与 Node.js 官方最佳实践）、命名规则、注释要求、分层与错误处理约定。

---

## 十四、常见问题

**Q：启动时报 `ERR_UNKNOWN_BUILTIN_MODULE: node:sqlite`？**
A：Node 版本过低。`node:sqlite` 需要 Node 22.13 及以上，本项目推荐 Node 24。用 `node -v` 确认。

**Q：启动时报 `ExperimentalWarning: SQLite is an experimental feature`？**
A：只是警告，不影响运行。`npm start` 已经加上了 `--disable-warning=ExperimentalWarning` 来隐藏它。

**Q：端口被占用？**
A：用 `PORT=8080 npm start` 换端口。

**Q：历史记录没有持久化？**
A：确认 `DB_PATH` 指向的是持久化磁盘。Render 免费实例的容器文件系统是临时的，
容器重建（重新部署、长时间空闲后被回收）会重置 `data/` 目录下的文件。
如果需要严格的持久化，可以挂载 Render Disk（付费）或改为 PostgreSQL。

**Q：前端页面打不开、只看到 404？**
A：说明 `public/` 目录为空。请先在前端仓库运行 `node serve.mjs` 单独访问，
或在后端仓库执行 `npm run sync:public` 同步前端资源。

---

## 十五、许可证

MIT
