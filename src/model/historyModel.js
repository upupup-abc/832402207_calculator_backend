/**
 * 计算历史数据访问对象（DAO）。
 *
 * 本文件只负责「与数据库打交道」：SQL 全部集中在这里，上层 Service 不写 SQL。
 * 这样做的收益：
 *   - 表结构变化时只需要改这一处；
 *   - SQL 注入风险收敛：所有用户输入一律走 `?` 占位参数绑定，
 *     没有任何字符串拼接 SQL；
 *   - 便于单元测试直接对 DAO 做断言。
 *
 * 参考：Google JavaScript Style Guide（命名、JSDoc 注释规范）。
 */

import { getDatabase } from './database.js';

/**
 * 把数据库行（snake_case）转换为对外 DTO（camelCase）。
 *
 * @param {object|undefined} row 数据库行。
 * @returns {object|null} 转换后的记录对象。
 */
function toRecord(row) {
  if (row === undefined || row === null) {
    return null;
  }
  return {
    id: Number(row.id),
    expression: row.expression,
    normalizedExpression: row.normalized_expression,
    result: Number(row.result),
    resultText: row.result_text,
    isFavorite: Number(row.is_favorite) === 1,
    createdAt: row.created_at,
  };
}

/**
 * 转义 SQL LIKE 中的通配符，避免用户输入的 % 与 _ 变成通配符。
 *
 * @param {string} keyword 原始关键词。
 * @returns {string} 转义后的关键词。
 */
function escapeLike(keyword) {
  return keyword.replace(/[\\%_]/g, (match) => `\\${match}`);
}

/**
 * 插入一条计算历史。
 *
 * @param {{expression: string, normalizedExpression: string, result: number,
 *   resultText: string, createdAt: string}} record 记录内容。
 * @returns {object} 插入后的完整记录（含自增主键）。
 */
export function insert(record) {
  const db = getDatabase();
  const statement = db.prepare(
    `INSERT INTO calculation_history
        (expression, normalized_expression, result, result_text, is_favorite, created_at)
     VALUES (?, ?, ?, ?, 0, ?)`,
  );
  const info = statement.run(
    record.expression,
    record.normalizedExpression,
    record.result,
    record.resultText,
    record.createdAt,
  );
  return findById(Number(info.lastInsertRowid));
}

/**
 * 按主键查询单条记录。
 *
 * @param {number} id 记录主键。
 * @returns {object|null} 记录，不存在返回 null。
 */
export function findById(id) {
  const db = getDatabase();
  const row = db.prepare('SELECT * FROM calculation_history WHERE id = ?').get(id);
  return toRecord(row);
}

/**
 * 构造列表查询的 WHERE 子句与参数。
 *
 * @param {{keyword?: string, favoriteOnly?: boolean}} filters 过滤条件。
 * @returns {{clause: string, params: Array<unknown>}} SQL 片段与参数。
 */
function buildFilters(filters) {
  const conditions = [];
  const params = [];
  const keyword = (filters.keyword || '').trim();
  if (keyword !== '') {
    conditions.push("(expression LIKE ? ESCAPE '\\' OR result_text LIKE ? ESCAPE '\\')");
    const pattern = `%${escapeLike(keyword)}%`;
    params.push(pattern, pattern);
  }
  if (filters.favoriteOnly === true) {
    conditions.push('is_favorite = 1');
  }
  return {
    clause: conditions.length === 0 ? '' : `WHERE ${conditions.join(' AND ')}`,
    params,
  };
}

/**
 * 统计满足条件的记录总数。
 *
 * @param {{keyword?: string, favoriteOnly?: boolean}} [filters] 过滤条件。
 * @returns {number} 记录数。
 */
export function count(filters = {}) {
  const db = getDatabase();
  const { clause, params } = buildFilters(filters);
  const row = db.prepare(`SELECT COUNT(*) AS total FROM calculation_history ${clause}`).get(...params);
  return Number(row.total);
}

/**
 * 分页查询计算历史，按时间倒序。
 *
 * @param {{page: number, pageSize: number, keyword?: string,
 *   favoriteOnly?: boolean}} query 查询参数。
 * @returns {Array<object>} 当前页记录列表。
 */
export function findPage(query) {
  const db = getDatabase();
  const { clause, params } = buildFilters(query);
  const offset = (query.page - 1) * query.pageSize;
  const rows = db.prepare(
    `SELECT * FROM calculation_history ${clause}
     ORDER BY created_at DESC, id DESC
     LIMIT ? OFFSET ?`,
  ).all(...params, query.pageSize, offset);
  return rows.map(toRecord);
}

/**
 * 查询全部记录（导出 CSV 使用）。
 *
 * @param {{keyword?: string, favoriteOnly?: boolean}} [filters] 过滤条件。
 * @param {number} [limit] 最大返回条数。
 * @returns {Array<object>} 记录列表。
 */
export function findAll(filters = {}, limit = 1000) {
  const db = getDatabase();
  const { clause, params } = buildFilters(filters);
  const rows = db.prepare(
    `SELECT * FROM calculation_history ${clause}
     ORDER BY created_at DESC, id DESC LIMIT ?`,
  ).all(...params, limit);
  return rows.map(toRecord);
}

/**
 * 删除指定记录。
 *
 * @param {number} id 记录主键。
 * @returns {boolean} 是否真的删除了记录。
 */
export function removeById(id) {
  const db = getDatabase();
  const info = db.prepare('DELETE FROM calculation_history WHERE id = ?').run(id);
  return Number(info.changes) > 0;
}

/**
 * 清空全部历史。
 *
 * @returns {number} 被删除的记录数。
 */
export function removeAll() {
  const db = getDatabase();
  const info = db.prepare('DELETE FROM calculation_history').run();
  return Number(info.changes);
}

/**
 * 更新收藏状态。
 *
 * @param {number} id 记录主键。
 * @param {boolean} isFavorite 目标状态。
 * @returns {object|null} 更新后的记录；记录不存在返回 null。
 */
export function updateFavorite(id, isFavorite) {
  const db = getDatabase();
  const info = db.prepare('UPDATE calculation_history SET is_favorite = ? WHERE id = ?')
    .run(isFavorite ? 1 : 0, id);
  if (Number(info.changes) === 0) {
    return null;
  }
  return findById(id);
}

/**
 * 聚合统计数据。
 *
 * @param {number} recentDays 需要统计的最近天数（用于趋势图）。
 * @returns {{total: number, favoriteCount: number, todayCount: number,
 *   firstCreatedAt: string|null, lastCreatedAt: string|null,
 *   distinctExpressionCount: number, topExpressions: Array<object>,
 *   dailyCounts: Array<{date: string, count: number}>}} 统计结果。
 */
export function getStatistics(recentDays = 7) {
  const db = getDatabase();
  const total = Number(db.prepare('SELECT COUNT(*) AS c FROM calculation_history').get().c);
  const favoriteCount = Number(
    db.prepare('SELECT COUNT(*) AS c FROM calculation_history WHERE is_favorite = 1').get().c,
  );
  const bounds = db.prepare(
    'SELECT MIN(created_at) AS first_at, MAX(created_at) AS last_at FROM calculation_history',
  ).get();
  const distinctExpressionCount = Number(
    db.prepare('SELECT COUNT(DISTINCT normalized_expression) AS c FROM calculation_history').get().c,
  );
  const topExpressions = db.prepare(
    `SELECT normalized_expression AS expression, COUNT(*) AS count
       FROM calculation_history
      GROUP BY normalized_expression
      ORDER BY count DESC, MAX(id) DESC
      LIMIT 5`,
  ).all().map((row) => ({ expression: row.expression, count: Number(row.count) }));

  const today = new Date();
  const todayKey = toDateKey(today);
  const dayKeys = [];
  for (let offset = recentDays - 1; offset >= 0; offset -= 1) {
    const day = new Date(today.getTime() - offset * 24 * 60 * 60 * 1000);
    dayKeys.push(toDateKey(day));
  }
  const earliest = `${dayKeys[0]}T00:00:00.000Z`;
  const dailyRows = db.prepare(
    'SELECT created_at FROM calculation_history WHERE created_at >= ?',
  ).all(earliest);
  const counter = new Map(dayKeys.map((key) => [key, 0]));
  for (const row of dailyRows) {
    const key = String(row.created_at).slice(0, 10);
    if (counter.has(key)) {
      counter.set(key, counter.get(key) + 1);
    }
  }

  return {
    total,
    favoriteCount,
    todayCount: counter.get(todayKey) === undefined ? 0 : counter.get(todayKey),
    distinctExpressionCount,
    firstCreatedAt: bounds.first_at === null ? null : bounds.first_at,
    lastCreatedAt: bounds.last_at === null ? null : bounds.last_at,
    topExpressions,
    dailyCounts: dayKeys.map((date) => ({ date, count: counter.get(date) || 0 })),
  };
}

/**
 * 把日期格式化为 UTC 的 YYYY-MM-DD。
 *
 * @param {Date} date 日期对象。
 * @returns {string} 日期键。
 */
function toDateKey(date) {
  return date.toISOString().slice(0, 10);
}
