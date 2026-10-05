/**
 * 数据库连接与建表脚本（Model 层基础设施）。
 *
 * 选型说明：使用 Node.js 22.5+ 内置的 `node:sqlite` 模块。
 *   - 它是官方标准库的一部分，无需 npm 安装任何依赖，因此项目可以在
 *     任何装有 Node 24 的机器上「开箱即跑」，也便于在 Render 免费实例上部署；
 *   - SQLite 是文件型数据库，符合作业「后端数据库持久化」的要求，
 *     同时避免了为评分环境额外准备 MySQL 服务的负担；
 *   - 通过 DB_PATH 环境变量可以指向任意磁盘路径（例如 Render 的持久磁盘），
 *     未来若迁移到 PostgreSQL，只需替换本文件与 historyModel 的实现。
 *
 * 参考：SQLite 官方建议 —— 开启 WAL 提升并发读写可靠性。
 */

import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

import { config } from '../config/index.js';
import { logger } from '../util/logger.js';

/** 建表语句集合，按顺序执行，全部使用 IF NOT EXISTS 保证幂等。 */
const SCHEMA_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS calculation_history (
      id                    INTEGER PRIMARY KEY AUTOINCREMENT,
      expression            TEXT    NOT NULL,
      normalized_expression TEXT    NOT NULL,
      result                REAL    NOT NULL,
      result_text           TEXT    NOT NULL,
      is_favorite           INTEGER NOT NULL DEFAULT 0,
      created_at            TEXT    NOT NULL
   )`,
  `CREATE INDEX IF NOT EXISTS idx_calc_history_created_at
      ON calculation_history (created_at DESC, id DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_calc_history_favorite
      ON calculation_history (is_favorite, created_at DESC)`,
];

/** 单例数据库句柄。 */
let database = null;

/**
 * 初始化数据库：创建目录、打开连接、执行建表脚本。
 *
 * @param {string} [dbPath] 覆盖配置中的数据库路径（单元测试使用 :memory:）。
 * @returns {DatabaseSync} 数据库句柄。
 */
export function initDatabase(dbPath = config.dbPath) {
  if (database !== null) {
    return database;
  }
  const isMemory = dbPath === ':memory:';
  if (!isMemory) {
    mkdirSync(dirname(resolve(dbPath)), { recursive: true });
  }
  database = new DatabaseSync(dbPath);
  // WAL 模式让读操作不阻塞写操作；内存库不支持 WAL，需要跳过。
  if (!isMemory) {
    database.prepare('PRAGMA journal_mode = WAL').get();
  }
  database.exec('PRAGMA foreign_keys = ON');
  database.exec('PRAGMA busy_timeout = 5000');
  for (const statement of SCHEMA_STATEMENTS) {
    database.exec(statement);
  }
  logger.info('数据库初始化完成', { dbPath: isMemory ? ':memory:' : resolve(dbPath) });
  return database;
}

/**
 * 获取数据库句柄，未初始化时自动初始化。
 * @returns {DatabaseSync} 数据库句柄。
 */
export function getDatabase() {
  return database === null ? initDatabase() : database;
}

/**
 * 关闭数据库连接（进程退出或测试收尾时调用）。
 * @returns {void}
 */
export function closeDatabase() {
  if (database !== null) {
    database.close();
    database = null;
  }
}
