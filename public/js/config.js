/**
 * 前端运行时配置。
 *
 * 前后端分离带来的第一个问题就是「前端怎么知道后端在哪」。
 * 这里按以下优先级解析 API 基地址：
 *
 *   1. URL 查询参数 `?api=https://xxx.onrender.com`（临时指向任意后端，便于联调与演示）
 *   2. 全局变量 window.__API_BASE__（部署平台可在 HTML 中注入）
 *   3. 独立前端开发服务器（端口 5173）→ 默认指向 http://localhost:3000
 *   4. 其余情况 → 空字符串，表示与页面同源（后端同时托管了前端静态文件）
 *
 * 之所以把「同源」作为默认值，是因为生产部署时最省事、也最不容易出错：
 * 前端始终请求相对路径 /api/**，由部署平台通过反向代理或同域部署转发给后端，
 * 从而完全避免跨域与硬编码域名的问题。
 */

const DEV_FRONTEND_PORT = '5173';
const DEFAULT_DEV_BACKEND = 'http://localhost:3000';

/**
 * 去掉末尾斜杠。
 * @param {string} value 原始地址。
 * @returns {string} 规范化地址。
 */
function trimTrailingSlash(value) {
  return String(value).replace(/\/+$/, '');
}

/**
 * 解析 API 基地址。
 * @returns {string} 形如 '' 或 'https://host' 的地址（不含 /api 后缀）。
 */
function resolveApiBase() {
  const fromQuery = new URLSearchParams(window.location.search).get('api');
  if (fromQuery !== null && fromQuery.trim() !== '') {
    return trimTrailingSlash(fromQuery.trim());
  }
  if (typeof window.__API_BASE__ === 'string' && window.__API_BASE__.trim() !== '') {
    return trimTrailingSlash(window.__API_BASE__.trim());
  }
  if (window.location.port === DEV_FRONTEND_PORT) {
    return DEFAULT_DEV_BACKEND;
  }
  return '';
}

/** API 基地址（不含 /api 后缀）。 */
export const API_BASE = resolveApiBase();

/** 所有业务接口的统一前缀。 */
export const API_PREFIX = `${API_BASE}/api`;

/** 默认分页大小。 */
export const PAGE_SIZE = 8;

/** 主题本地存储键名。 */
export const THEME_STORAGE_KEY = 'calculator.theme';
