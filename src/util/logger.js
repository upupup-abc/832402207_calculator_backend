/**
 * 轻量日志工具。
 *
 * 作业项目不引入第三方日志库，使用标准输出即可满足「可观测性」需求：
 * 助教通过 Render 的日志面板就能看到每一次 API 调用与错误。
 */

const LEVEL_PREFIX = Object.freeze({
  info: 'INFO ',
  warn: 'WARN ',
  error: 'ERROR',
});

/**
 * 输出一行结构化日志。
 * @param {'info'|'warn'|'error'} level 日志级别。
 * @param {string} message 消息。
 * @param {object} [meta] 附加字段。
 * @returns {void}
 */
function write(level, message, meta) {
  const timestamp = new Date().toISOString();
  const payload = meta === undefined ? '' : ` ${JSON.stringify(meta)}`;
  const line = `[${timestamp}] ${LEVEL_PREFIX[level]} ${message}${payload}`;
  if (level === 'error') {
    process.stderr.write(`${line}\n`);
    return;
  }
  process.stdout.write(`${line}\n`);
}

/** 日志对象。 */
export const logger = Object.freeze({
  /**
   * 记录普通信息。
   * @param {string} message 消息。
   * @param {object} [meta] 附加字段。
   * @returns {void}
   */
  info(message, meta) {
    write('info', message, meta);
  },
  /**
   * 记录告警。
   * @param {string} message 消息。
   * @param {object} [meta] 附加字段。
   * @returns {void}
   */
  warn(message, meta) {
    write('warn', message, meta);
  },
  /**
   * 记录错误。
   * @param {string} message 消息。
   * @param {object} [meta] 附加字段。
   * @returns {void}
   */
  error(message, meta) {
    write('error', message, meta);
  },
});
