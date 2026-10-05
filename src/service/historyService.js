/**
 * 计算历史服务（Service 层）。
 *
 * 职责：
 *   - 保存每次成功计算的结果；
 *   - 分页 / 检索 / 收藏 / 删除历史；
 *   - 生成统计数据与 CSV 导出内容。
 *
 * 参数校验集中在本层，保证无论从哪个控制器进入都得到一致的规则。
 *
 * 参考：Google JavaScript Style Guide。
 */

import { CalculatorError, ErrorCode } from '../calculator/errors.js';
import * as historyModel from '../model/historyModel.js';

/** 分页默认与边界值。 */
export const PAGINATION = Object.freeze({
  defaultPage: 1,
  defaultPageSize: 8,
  maxPageSize: 50,
});

/**
 * 解析并校验分页参数。
 *
 * @param {unknown} rawPage 页码原始值。
 * @param {unknown} rawPageSize 每页条数原始值。
 * @returns {{page: number, pageSize: number}} 校验后的分页参数。
 * @throws {CalculatorError} 参数非法时抛出。
 */
function parsePagination(rawPage, rawPageSize) {
  const page = rawPage === undefined || rawPage === '' ? PAGINATION.defaultPage : Number(rawPage);
  const pageSize = rawPageSize === undefined || rawPageSize === ''
    ? PAGINATION.defaultPageSize
    : Number(rawPageSize);

  if (!Number.isInteger(page) || page < 1) {
    throw new CalculatorError(ErrorCode.VALIDATION_ERROR, '参数 page 必须是大于 0 的整数');
  }
  if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > PAGINATION.maxPageSize) {
    throw new CalculatorError(
      ErrorCode.VALIDATION_ERROR,
      `参数 pageSize 必须是 1 到 ${PAGINATION.maxPageSize} 之间的整数`,
    );
  }
  return { page, pageSize };
}

/**
 * 解析主键参数。
 *
 * @param {unknown} rawId 原始 id。
 * @returns {number} 合法的正整数 id。
 * @throws {CalculatorError} 参数非法时抛出。
 */
function parseId(rawId) {
  const id = Number(rawId);
  if (!Number.isInteger(id) || id < 1) {
    throw new CalculatorError(ErrorCode.VALIDATION_ERROR, '路径参数 id 必须是大于 0 的整数');
  }
  return id;
}

/**
 * 保存一次成功的计算。
 *
 * @param {{expression: string, normalizedExpression: string, result: number,
 *   resultText: string}} outcome 计算结果。
 * @returns {object} 入库后的历史记录。
 */
export function saveCalculation(outcome) {
  return historyModel.insert({
    expression: outcome.expression,
    normalizedExpression: outcome.normalizedExpression,
    result: outcome.result,
    resultText: outcome.resultText,
    createdAt: new Date().toISOString(),
  });
}

/**
 * 分页查询计算历史。
 *
 * @param {{page?: unknown, pageSize?: unknown, keyword?: unknown,
 *   favoriteOnly?: unknown}} query 查询参数（通常直接来自 URL Query）。
 * @returns {{items: Array<object>, total: number, page: number, pageSize: number,
 *   totalPages: number, hasNext: boolean, hasPrev: boolean}} 分页结果。
 */
export function listHistory(query = {}) {
  const { page, pageSize } = parsePagination(query.page, query.pageSize);
  const keyword = typeof query.keyword === 'string' ? query.keyword.trim() : '';
  const favoriteOnly = query.favoriteOnly === true
    || query.favoriteOnly === 'true'
    || query.favoriteOnly === '1';

  const filters = { keyword, favoriteOnly };
  const total = historyModel.count(filters);
  const totalPages = total === 0 ? 0 : Math.ceil(total / pageSize);
  const items = historyModel.findPage({ page, pageSize, keyword, favoriteOnly });

  return {
    items,
    total,
    page,
    pageSize,
    totalPages,
    hasNext: page < totalPages,
    hasPrev: page > 1 && total > 0,
  };
}

/**
 * 删除指定历史记录。
 *
 * @param {unknown} rawId 记录 id。
 * @returns {number} 被删除的记录 id。
 * @throws {CalculatorError} 记录不存在时抛出 404。
 */
export function deleteHistory(rawId) {
  const id = parseId(rawId);
  const deleted = historyModel.removeById(id);
  if (!deleted) {
    throw new CalculatorError(
      ErrorCode.HISTORY_NOT_FOUND,
      `id 为 ${id} 的计算记录不存在，可能已被删除`,
      { statusCode: 404 },
    );
  }
  return id;
}

/**
 * 清空全部历史（附加功能）。
 *
 * @returns {number} 删除的记录数。
 */
export function clearHistory() {
  return historyModel.removeAll();
}

/**
 * 设置或取消收藏（附加功能）。
 *
 * @param {unknown} rawId 记录 id。
 * @param {unknown} rawFavorite 目标收藏状态。
 * @returns {object} 更新后的记录。
 * @throws {CalculatorError} 参数非法或记录不存在时抛出。
 */
export function setFavorite(rawId, rawFavorite) {
  const id = parseId(rawId);
  if (typeof rawFavorite !== 'boolean') {
    throw new CalculatorError(ErrorCode.VALIDATION_ERROR, '参数 isFavorite 必须是布尔值');
  }
  const updated = historyModel.updateFavorite(id, rawFavorite);
  if (updated === null) {
    throw new CalculatorError(
      ErrorCode.HISTORY_NOT_FOUND,
      `id 为 ${id} 的计算记录不存在，无法更新收藏状态`,
      { statusCode: 404 },
    );
  }
  return updated;
}

/**
 * 获取统计数据（附加功能）。
 *
 * @returns {object} 统计结果。
 */
export function getStatistics() {
  return historyModel.getStatistics(7);
}

/**
 * 把历史记录导出为 CSV 文本（附加功能）。
 *
 * @param {{keyword?: unknown, favoriteOnly?: unknown}} query 过滤条件。
 * @returns {{filename: string, content: string}} 文件名与 CSV 内容。
 */
export function exportCsv(query = {}) {
  const keyword = typeof query.keyword === 'string' ? query.keyword.trim() : '';
  const favoriteOnly = query.favoriteOnly === true || query.favoriteOnly === 'true';
  const records = historyModel.findAll({ keyword, favoriteOnly }, 1000);

  const header = ['ID', '表达式', '规范化表达式', '结果', '是否收藏', '计算时间'];
  const lines = [header.map(escapeCsvField).join(',')];
  for (const record of records) {
    lines.push([
      record.id,
      record.expression,
      record.normalizedExpression,
      record.resultText,
      record.isFavorite ? '是' : '否',
      record.createdAt,
    ].map(escapeCsvField).join(','));
  }
  // 前置 BOM，保证 Excel 打开时中文不乱码。
  const content = `\uFEFF${lines.join('\r\n')}\r\n`;
  const stamp = new Date().toISOString().slice(0, 10);
  return { filename: `calculation-history-${stamp}.csv`, content };
}

/**
 * 转义单个 CSV 字段。
 *
 * @param {unknown} value 字段值。
 * @returns {string} 转义后的文本。
 */
function escapeCsvField(value) {
  const text = value === null || value === undefined ? '' : String(value);
  if (/[",\r\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}
