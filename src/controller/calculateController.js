/**
 * 计算接口控制器（Controller 层）。
 *
 * 控制器的唯一职责是「把 HTTP 请求翻译成服务层调用，再把结果翻译回 HTTP 响应」，
 * 不包含任何计算逻辑与 SQL。
 *
 * 接口：POST /api/calculate
 * 请求体：{ "expression": "(1+2)*3" }
 * 成功响应：201 Created
 *   { "success": true, "message": "ok",
 *     "data": { "id": 12, "expression": "(1+2)*3", "result": 9, ... } }
 */

import { readJsonBody, sendSuccess } from '../util/http.js';
import * as calculatorService from '../service/calculatorService.js';
import * as historyService from '../service/historyService.js';

/**
 * 处理计算请求：校验 → 计算 → 落库 → 返回结果。
 *
 * 注意执行顺序：**先由后端完成计算，再把结果写入数据库**。
 * 这样「历史记录」中的每一条数据都是后端真实算出来的，
 * 前端无法伪造一个结果让后端「仅存储」。
 *
 * @param {import('node:http').IncomingMessage} req 请求对象。
 * @param {import('node:http').ServerResponse} res 响应对象。
 * @returns {Promise<void>} 无返回值。
 */
export async function calculate(req, res) {
  const body = await readJsonBody(req);
  const outcome = calculatorService.calculate(body.expression);
  const record = historyService.saveCalculation(outcome);

  sendSuccess(res, {
    id: record.id,
    expression: record.expression,
    normalizedExpression: record.normalizedExpression,
    result: record.result,
    resultText: record.resultText,
    createdAt: record.createdAt,
  }, 201);
}
