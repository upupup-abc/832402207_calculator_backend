/**
 * 元信息接口控制器。
 *
 * 接口：
 *   GET /api/health    健康检查，用于部署平台探活与助教确认服务在线
 *   GET /api/grammar   返回后端支持的运算符、函数、常量与语法说明
 *
 * 把「后端支持哪些函数」做成接口而不是写死在前端，是前后端分离的重要实践：
 * 前端只负责渲染，能力清单的唯一事实来源在后端。
 */

import { sendSuccess } from '../util/http.js';
import * as calculatorService from '../service/calculatorService.js';
import { config } from '../config/index.js';

/** 服务启动时间，用于计算运行时长。 */
const STARTED_AT = new Date();

/**
 * 健康检查。
 *
 * @param {import('node:http').IncomingMessage} req 请求对象。
 * @param {import('node:http').ServerResponse} res 响应对象。
 * @returns {void}
 */
export function health(req, res) {
  sendSuccess(res, {
    status: 'UP',
    env: config.env,
    startedAt: STARTED_AT.toISOString(),
    uptimeSeconds: Math.round(process.uptime()),
    nodeVersion: process.version,
    serverTime: new Date().toISOString(),
  });
}

/**
 * 返回后端支持的语法能力。
 *
 * @param {import('node:http').IncomingMessage} req 请求对象。
 * @param {import('node:http').ServerResponse} res 响应对象。
 * @returns {void}
 */
export function grammar(req, res) {
  sendSuccess(res, calculatorService.describeGrammar());
}
