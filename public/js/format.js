/**
 * 展示层格式化工具。
 *
 * 说明：前端只做「格式化显示」，绝不做数值计算。
 * 这里出现的 toLocaleString / toPrecision 都只作用于「后端已经算好的结果」，
 * 不会参与表达式的求值过程。
 */

/**
 * 格式化数值用于展示。
 *
 * @param {number|string} value 后端返回的数值。
 * @param {{grouping?: boolean}} [options] 是否使用千分位。
 * @returns {string} 展示文本。
 */
export function formatNumber(value, options = {}) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return String(value);
  }
  if (numeric === 0) {
    return '0';
  }
  const abs = Math.abs(numeric);

  // 极大 / 极小的数值保持科学计数法，避免出现一屏的 0。
  if (abs >= 1e15 || abs < 1e-6) {
    return trimExponential(numeric.toExponential(8));
  }

  if (options.grouping === true && abs >= 1000) {
    return numeric.toLocaleString('en-US', { maximumFractionDigits: 10 });
  }
  // 去掉浮点尾数噪声后输出。
  return String(Number(numeric.toPrecision(12)));
}

/**
 * 去掉科学计数法尾数里多余的 0。
 * @param {string} text 形如 1.22464680e-16 的文本。
 * @returns {string} 形如 1.2246468e-16 的文本。
 */
function trimExponential(text) {
  return text.replace(/\.?0+e/, 'e');
}

/**
 * 把 ISO 时间格式化为 `YYYY-MM-DD HH:mm:ss`（浏览器本地时区）。
 *
 * @param {string} iso ISO 8601 时间字符串。
 * @returns {string} 格式化结果。
 */
export function formatDateTime(iso) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return String(iso);
  }
  const pad = (value) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} `
    + `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

/**
 * 把 ISO 时间格式化为列表用的简短形式：今天只显示时间。
 *
 * @param {string} iso ISO 8601 时间字符串。
 * @returns {string} 简短时间文本。
 */
export function formatTimeShort(iso) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return String(iso);
  }
  const now = new Date();
  const pad = (value) => String(value).padStart(2, '0');
  const clock = `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
  const sameDay = date.getFullYear() === now.getFullYear()
    && date.getMonth() === now.getMonth()
    && date.getDate() === now.getDate();
  if (sameDay) {
    return `今天 ${clock}`;
  }
  return `${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${clock}`;
}

/**
 * 把日期键（YYYY-MM-DD）格式化为图表用的 `M/D`。
 *
 * @param {string} dateKey 日期键。
 * @returns {string} 例如 `10/1`。
 */
export function formatDayLabel(dateKey) {
  const parts = String(dateKey).split('-');
  if (parts.length !== 3) {
    return dateKey;
  }
  return `${Number(parts[1])}/${Number(parts[2])}`;
}
