/**
 * API 客户端 —— 前端与后端之间唯一的通信出口。
 *
 * 设计意图：
 *   1. 把「怎么发请求」收敛到一个文件，视图层只调用语义化方法；
 *   2. 统一解析后端的信封式响应 { success, message, data }，
 *      失败时抛出携带 error.code 的 ApiError，供视图层区分处理；
 *   3. 网络层失败（后端未启动）单独识别为 CONNECTION_ERROR，
 *      这正是作业要求里「停止后端服务后前端无法拿到结果」的验证点。
 */

import { API_PREFIX } from './config.js';

/** 业务/传输错误的统一异常类型。 */
export class ApiError extends Error {
  /**
   * @param {string} message 面向用户的提示。
   * @param {{code?: string, status?: number, position?: number|null}} [info] 附加信息。
   */
  constructor(message, info = {}) {
    super(message);
    this.name = 'ApiError';
    this.code = info.code || 'UNKNOWN_ERROR';
    this.status = info.status === undefined ? 0 : info.status;
    this.position = info.position === undefined ? null : info.position;
  }

  /** 是否为「连不上后端」类错误。 @returns {boolean} 是否连接失败。 */
  get isConnectionError() {
    return this.code === 'CONNECTION_ERROR';
  }
}

/**
 * 把查询参数对象拼接为查询串。
 *
 * @param {Record<string, unknown>} [params] 参数集合，值为 undefined/null/'' 时忽略。
 * @returns {string} 以 `?` 开头的查询串或空串。
 */
function buildQuery(params) {
  if (params === undefined) {
    return '';
  }
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') {
      continue;
    }
    search.set(key, String(value));
  }
  const text = search.toString();
  return text === '' ? '' : `?${text}`;
}

/**
 * 发起一次 API 请求。
 *
 * @param {string} path 以 `/` 开头的接口路径（不含 /api 前缀）。
 * @param {{method?: string, body?: object, query?: Record<string, unknown>}} [options] 请求选项。
 * @returns {Promise<any>} 响应中的 data 字段。
 * @throws {ApiError} 网络失败或后端返回 success=false 时抛出。
 */
async function request(path, options = {}) {
  const method = options.method || 'GET';
  const url = `${API_PREFIX}${path}${buildQuery(options.query)}`;

  let response;
  try {
    response = await fetch(url, {
      method,
      headers: options.body === undefined ? { Accept: 'application/json' } : {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    });
  } catch (cause) {
    // fetch 直接 reject 说明根本没连上后端：DNS、端口未监听、被防火墙拦截等。
    throw new ApiError('无法连接到后端服务，请确认后端已启动', {
      code: 'CONNECTION_ERROR',
      status: 0,
    });
  }

  const text = await response.text();
  let payload = null;
  if (text !== '') {
    try {
      payload = JSON.parse(text);
    } catch {
      throw new ApiError('后端返回的不是合法 JSON', {
        code: 'INVALID_RESPONSE',
        status: response.status,
      });
    }
  }

  if (!response.ok || payload === null || payload.success !== true) {
    const error = payload && payload.error ? payload.error : {};
    throw new ApiError(
      payload && payload.message ? payload.message : `请求失败（HTTP ${response.status}）`,
      {
        code: error.code || 'HTTP_ERROR',
        status: response.status,
        position: error.position === undefined ? null : error.position,
      },
    );
  }

  return payload.data;
}

/** 后端接口的语义化封装。 */
export const api = Object.freeze({
  /**
   * 健康检查。
   * @returns {Promise<object>} 服务状态。
   */
  health() {
    return request('/health');
  },

  /**
   * 获取后端支持的语法清单。
   * @returns {Promise<object>} 运算符 / 函数 / 常量 / 语法说明。
   */
  grammar() {
    return request('/grammar');
  },

  /**
   * 请求后端计算表达式（核心接口）。
   * @param {string} expression 表达式文本。
   * @returns {Promise<object>} 计算结果。
   */
  calculate(expression) {
    return request('/calculate', { method: 'POST', body: { expression } });
  },

  /**
   * 分页查询计算历史。
   * @param {{page?: number, pageSize?: number, keyword?: string,
   *   favoriteOnly?: boolean}} query 查询条件。
   * @returns {Promise<object>} 分页结果。
   */
  listHistory(query) {
    return request('/history', { query });
  },

  /**
   * 删除指定历史记录。
   * @param {number} id 记录 id。
   * @returns {Promise<object>} 删除结果。
   */
  deleteHistory(id) {
    return request(`/history/${id}`, { method: 'DELETE' });
  },

  /**
   * 清空全部历史。
   * @returns {Promise<object>} 删除条数。
   */
  clearHistory() {
    return request('/history', { method: 'DELETE' });
  },

  /**
   * 更新收藏状态。
   * @param {number} id 记录 id。
   * @param {boolean} isFavorite 目标状态。
   * @returns {Promise<object>} 更新后的记录。
   */
  setFavorite(id, isFavorite) {
    return request(`/history/${id}/favorite`, { method: 'PATCH', body: { isFavorite } });
  },

  /**
   * 获取统计数据。
   * @returns {Promise<object>} 统计结果。
   */
  statistics() {
    return request('/history/stats');
  },

  /**
   * 生成 CSV 导出地址（浏览器直接下载，内容由后端生成）。
   * @param {{keyword?: string, favoriteOnly?: boolean}} [query] 过滤条件。
   * @returns {string} 下载地址。
   */
  exportUrl(query) {
    return `${API_PREFIX}/history/export${buildQuery(query)}`;
  },

  /**
   * 获取可换算的单位清单。
   * @returns {Promise<object>} 类别与单位。
   */
  convertUnits() {
    return request('/convert/units');
  },

  /**
   * 请求后端执行单位换算。
   * @param {{category: string, from: string, to: string, value: number}} payload 换算参数。
   * @returns {Promise<object>} 换算结果。
   */
  convert(payload) {
    return request('/convert', { method: 'POST', body: payload });
  },
});
