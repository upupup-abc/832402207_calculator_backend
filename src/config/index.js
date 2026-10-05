/**
 * 应用配置。
 *
 * 所有可变项都通过环境变量注入，代码中只保留「对开发环境友好」的默认值，
 * 这样同一份代码可以在本地、Docker、Render 等环境直接运行而无需改动源码。
 *
 * 参考：十二要素应用（The Twelve-Factor App）—— 配置与代码分离。
 */

import { existsSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** 后端项目根目录（src/config/index.js 向上两级）。 */
export const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

/**
 * 把可能是相对路径的配置项解析为绝对路径。
 * @param {string} value 原始路径。
 * @param {string} fallback 相对项目根目录的兜底路径。
 * @returns {string} 绝对路径。
 */
function resolvePath(value, fallback) {
  const target = value && value.trim() !== '' ? value : fallback;
  return isAbsolute(target) ? target : resolve(PROJECT_ROOT, target);
}

/** 静态资源目录：优先使用 public/（部署副本），其次使用同级前端仓库源码。 */
function resolveStaticDir() {
  if (process.env.STATIC_DIR && process.env.STATIC_DIR.trim() !== '') {
    return resolvePath(process.env.STATIC_DIR);
  }
  const candidates = [
    join(PROJECT_ROOT, 'public'),
    resolve(PROJECT_ROOT, '..', '832402207_calculator_frontend', 'src'),
  ];
  const found = candidates.find((candidate) => existsSync(join(candidate, 'index.html')));
  return found === undefined ? candidates[0] : found;
}

/** 解析 CORS 白名单，`*` 表示允许任意来源。 */
function resolveCorsOrigin() {
  const raw = (process.env.CORS_ORIGIN || '*').trim();
  if (raw === '*' || raw === '') {
    return '*';
  }
  return raw.split(',').map((item) => item.trim()).filter(Boolean);
}

/**
 * 读取整数型环境变量。
 * @param {string|undefined} raw 原始值。
 * @param {number} fallback 兜底值。
 * @returns {number} 解析结果。
 */
function readInt(raw, fallback) {
  const parsed = Number.parseInt(String(raw ?? ''), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

/** 运行时配置对象。 */
export const config = Object.freeze({
  env: process.env.NODE_ENV || 'development',
  host: process.env.HOST || '0.0.0.0',
  port: readInt(process.env.PORT, 3000),
  dbPath: resolvePath(process.env.DB_PATH, 'data/calculator.db'),
  staticDir: resolveStaticDir(),
  corsOrigin: resolveCorsOrigin(),
  /** 单个请求体上限（字节），防止超大 JSON 打爆内存。 */
  maxBodyBytes: readInt(process.env.MAX_BODY_BYTES, 16 * 1024),
  /** 请求日志开关。 */
  accessLog: process.env.ACCESS_LOG !== 'false',
});
