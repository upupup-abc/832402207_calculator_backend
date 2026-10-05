/**
 * 计算历史接口控制器（Controller 层）。
 *
 * 接口一览：
 *   GET    /api/history                 分页 + 关键词检索 + 仅看收藏
 *   GET    /api/history/stats           统计数据（附加功能）
 *   GET    /api/history/export          导出 CSV（附加功能）
 *   DELETE /api/history/:id             删除指定记录
 *   DELETE /api/history                 清空全部（附加功能）
 *   PATCH  /api/history/:id/favorite    收藏 / 取消收藏（附加功能）
 */

import { corsHeaders, readJsonBody, sendJson, sendSuccess } from '../util/http.js';
import * as historyService from '../service/historyService.js';

/**
 * 把 URLSearchParams 转成服务层使用的普通对象。
 *
 * @param {URLSearchParams} searchParams 查询参数。
 * @returns {Record<string, string>} 普通对象。
 */
function toQueryObject(searchParams) {
  const query = {};
  for (const [key, value] of searchParams.entries()) {
    query[key] = value;
  }
  return query;
}

/**
 * 分页查询历史记录。
 *
 * @param {import('node:http').IncomingMessage} req 请求对象。
 * @param {import('node:http').ServerResponse} res 响应对象。
 * @param {URL} url 解析后的 URL。
 * @returns {void}
 */
export function listHistory(req, res, url) {
  const result = historyService.listHistory(toQueryObject(url.searchParams));
  sendSuccess(res, result);
}

/**
 * 查询统计数据。
 *
 * @param {import('node:http').IncomingMessage} req 请求对象。
 * @param {import('node:http').ServerResponse} res 响应对象。
 * @returns {void}
 */
export function getStatistics(req, res) {
  sendSuccess(res, historyService.getStatistics());
}

/**
 * 导出 CSV 文件。
 *
 * @param {import('node:http').IncomingMessage} req 请求对象。
 * @param {import('node:http').ServerResponse} res 响应对象。
 * @param {URL} url 解析后的 URL。
 * @returns {void}
 */
export function exportHistory(req, res, url) {
  const { filename, content } = historyService.exportCsv(toQueryObject(url.searchParams));
  const payload = Buffer.from(content, 'utf8');
  res.writeHead(200, {
    ...corsHeaders(req.headers.origin),
    'Content-Type': 'text/csv; charset=utf-8',
    'Content-Length': payload.byteLength,
    'Content-Disposition': `attachment; filename="${filename}"`,
    'Cache-Control': 'no-store',
  });
  res.end(payload);
}

/**
 * 删除指定历史记录。
 *
 * @param {import('node:http').IncomingMessage} req 请求对象。
 * @param {import('node:http').ServerResponse} res 响应对象。
 * @param {string} rawId 路径中的 id。
 * @returns {void}
 */
export function deleteHistory(req, res, rawId) {
  const id = historyService.deleteHistory(rawId);
  sendSuccess(res, { id }, 200, `已删除 id 为 ${id} 的计算记录`);
}

/**
 * 清空全部历史记录。
 *
 * @param {import('node:http').IncomingMessage} req 请求对象。
 * @param {import('node:http').ServerResponse} res 响应对象。
 * @returns {void}
 */
export function clearHistory(req, res) {
  const deleted = historyService.clearHistory();
  sendJson(res, 200, {
    success: true,
    message: `已清空 ${deleted} 条计算记录`,
    data: { deleted },
  });
}

/**
 * 更新收藏状态。
 *
 * @param {import('node:http').IncomingMessage} req 请求对象。
 * @param {import('node:http').ServerResponse} res 响应对象。
 * @param {string} rawId 路径中的 id。
 * @returns {Promise<void>} 无返回值。
 */
export async function updateFavorite(req, res, rawId) {
  const body = await readJsonBody(req);
  const record = historyService.setFavorite(rawId, body.isFavorite);
  sendSuccess(res, record, 200, record.isFavorite ? '已加入收藏' : '已取消收藏');
}
