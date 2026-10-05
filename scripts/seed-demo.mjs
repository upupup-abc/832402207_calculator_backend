/**
 * 演示数据种子脚本（可选，用于展示统计功能）。
 *
 * 用途：
 *   「最近 7 天计算趋势」「最常使用的算式」这类统计图表，
 *   只有累积了多天数据才有展示价值。这个脚本会向数据库写入一批
 *   时间分布在最近 7 天的示例计算记录，方便自己演示、也方便助教
 *   快速看到统计面板的效果。
 *
 * 诚实声明：这些是脚本生成的**示例数据**，不是真实操作记录。
 * 脚本会在控制台明确打印写入数量，随时可以用
 * `DELETE /api/history` 或删除 data/calculator.db 清空。
 *
 * 用法：
 *   npm run seed:demo        # 写入示例数据（幂等：先清空再写入）
 */

import { closeDatabase, initDatabase } from '../src/model/database.js';
import * as historyModel from '../src/model/historyModel.js';
import { calculate } from '../src/service/calculatorService.js';
import { logger } from '../src/util/logger.js';

/** 示例表达式池，覆盖四则运算、括号、科学函数等场景。 */
const SAMPLE_EXPRESSIONS = [
  '12+8', '96-37', '15*24', '144/12', '1+2*3', '(1+2)*3', '10/2+7', '8-3*2',
  '-5+8', '3*-2', '2^10', '5!', '0.1+0.2', '3.14*2', 'sqrt(144)', 'log(1000)',
  'ln(e)', 'sin(pi/6)', 'cos(0)', '2(3+4)', 'abs(-3.5)', '100%7', '1/3',
  'round(2.5)', '(8+4)/3', '7*(6-2)', '1024/8', '99+1', '45*2-30',
];

/** 写入的记录条数。 */
const RECORD_COUNT = 64;

/**
 * 生成一个分布在最近 7 天内的随机时间戳（ISO 字符串）。
 *
 * @param {() => number} random 随机数发生器，便于复现。
 * @param {number} index 记录序号。
 * @returns {string} ISO 时间。
 */
function randomTimestamp(random, index) {
  const now = Date.now();
  // 最近的记录更密集一些，让趋势图有起伏。
  const dayOffset = Math.floor(random() * 7);
  const hour = 9 + Math.floor(random() * 11);
  const minute = Math.floor(random() * 60);
  const second = Math.floor(random() * 60);
  const base = new Date(now - dayOffset * 24 * 60 * 60 * 1000);
  base.setHours(hour, minute, second, 0);
  // 保证不会出现「未来时间」。
  const stamp = Math.min(base.getTime(), now - index * 1000);
  return new Date(stamp).toISOString();
}

/**
 * 简单的可复现随机数发生器（线性同余），避免每次运行结果差异过大。
 *
 * @param {number} seed 随机种子。
 * @returns {() => number} 返回 [0, 1) 随机数的函数。
 */
function createRandom(seed) {
  let state = seed;
  return () => {
    state = (state * 1103515245 + 12345) % 2147483648;
    return state / 2147483648;
  };
}

/**
 * 主流程。
 * @returns {void}
 */
function main() {
  initDatabase();
  const removed = historyModel.removeAll();
  if (removed > 0) {
    logger.info('已清空原有记录', { removed });
  }

  const random = createRandom(20261007);
  let inserted = 0;
  const failures = [];

  for (let index = 0; index < RECORD_COUNT; index += 1) {
    const expression = SAMPLE_EXPRESSIONS[Math.floor(random() * SAMPLE_EXPRESSIONS.length)];
    try {
      const outcome = calculate(expression);
      const record = historyModel.insert({
        expression: outcome.expression,
        normalizedExpression: outcome.normalizedExpression,
        result: outcome.result,
        resultText: outcome.resultText,
        createdAt: randomTimestamp(random, index),
      });
      // 让部分记录成为收藏，便于演示「仅看收藏」筛选。
      if (index % 9 === 0) {
        historyModel.updateFavorite(record.id, true);
      }
      inserted += 1;
    } catch (error) {
      failures.push(`${expression}: ${error.message}`);
    }
  }

  logger.info('演示数据写入完成', { inserted, failed: failures.length });
  if (failures.length > 0) {
    logger.warn('以下表达式写入失败', { failures });
  }
}

// 顶层兜底：把底层异常翻译成看得懂的提示，避免直接抛出一堆 Node 堆栈。
// 最常见的失败原因是后端服务正在运行并占用了数据库文件（SQLITE_BUSY）。
try {
  main();
} catch (error) {
  logger.error('演示数据写入失败', { message: error.message });
  process.stderr.write(
    '\n可能的原因与处理办法：\n'
    + '  1. 后端服务正在运行并占用了数据库 → 先在后端目录按 Ctrl+C 停止服务，再运行本脚本；\n'
    + '  2. 数据库文件被其他程序打开 → 关闭 DB Browser 之类的工具后重试；\n'
    + '  3. 确认 data/ 目录有写入权限。\n\n',
  );
  process.exitCode = 1;
} finally {
  closeDatabase();
}
