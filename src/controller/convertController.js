/**
 * 单位换算接口控制器（附加功能）。
 *
 *   GET  /api/convert/units   返回可换算的类别与单位清单
 *   POST /api/convert         执行换算
 */

import { readJsonBody, sendSuccess } from '../util/http.js';
import * as convertService from '../service/convertService.js';

/**
 * 返回单位类别清单。
 *
 * @param {import('node:http').IncomingMessage} req 请求对象。
 * @param {import('node:http').ServerResponse} res 响应对象。
 * @returns {void}
 */
export function listUnits(req, res) {
  sendSuccess(res, { categories: convertService.describeUnits() });
}

/**
 * 执行单位换算。
 *
 * @param {import('node:http').IncomingMessage} req 请求对象。
 * @param {import('node:http').ServerResponse} res 响应对象。
 * @returns {Promise<void>} 无返回值。
 */
export async function convert(req, res) {
  const body = await readJsonBody(req);
  sendSuccess(res, convertService.convert(body));
}
