/**
 * 把前端源码同步到后端的 public/ 目录。
 *
 * 背景：作业要求前端与后端分别提交到两个 GitHub 仓库，
 * 同时老师又希望有一个「点开就能用」的网站链接。
 * 为了让 Render 上的单个 Web Service 就能同时提供界面与 API，
 * 我们用这个脚本把前端产物复制一份到后端仓库的 public/ 下。
 *
 * 约定：
 *   - 前端仓库的 src/ 是唯一事实来源；
 *   - 后端仓库的 public/ 只是部署副本，不要手工修改它；
 *   - 每次改动前端后，运行 `npm run sync:public` 再提交后端仓库。
 *
 * 用法：npm run sync:public
 */

import { cp, mkdir, rm } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const BACKEND_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE_DIR = resolve(BACKEND_ROOT, '..', '832402207_calculator_frontend', 'src');
const TARGET_DIR = resolve(BACKEND_ROOT, 'public');

/**
 * 主流程：清空目标目录后整体复制。
 * @returns {Promise<void>} 无返回值。
 */
async function main() {
  await rm(TARGET_DIR, { recursive: true, force: true });
  await mkdir(TARGET_DIR, { recursive: true });
  await cp(SOURCE_DIR, TARGET_DIR, { recursive: true });
  process.stdout.write(`已同步前端资源：\n  源：${SOURCE_DIR}\n  目标：${TARGET_DIR}\n`);
}

main().catch((error) => {
  process.stderr.write(`同步失败：${error.message}\n`);
  process.exitCode = 1;
});
