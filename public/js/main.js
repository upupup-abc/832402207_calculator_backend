/**
 * 应用入口：负责装配各个视图模块并处理跨模块的状态同步。
 *
 * 依赖方向是单向的：
 *   main.js  →  calculator / history / stats / converter / api / ...
 * 各视图模块之间不互相引用，跨模块协作通过 main.js 传入的回调完成，
 * 避免出现循环依赖与散落各处的隐式状态。
 */

import { ApiError, api } from './api.js';
import { createCalculator } from './calculator.js';
import { createConverter } from './converter.js';
import { createHistory } from './history.js';
import { createStats } from './stats.js';
import { h, qs, qsa } from './dom.js';
import { registerShortcuts } from './keyboard.js';
import { showToast } from './toast.js';
import { API_BASE, THEME_STORAGE_KEY } from './config.js';

/** 后端健康检查间隔（毫秒）。 */
const HEALTH_INTERVAL = 30000;

/**
 * 主题管理。
 * @returns {{apply: (theme: string) => void, toggle: () => void, current: () => string}} 主题接口。
 */
function createTheme() {
  const root = document.documentElement;

  /**
   * 应用主题。
   * @param {string} theme 'dark' | 'light'。
   * @returns {void}
   */
  function apply(theme) {
    root.setAttribute('data-theme', theme);
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch {
      // 隐私模式下 localStorage 可能不可用，忽略即可，不影响功能。
    }
  }

  /**
   * 读取初始主题，优先级：
   *   1. URL 参数 `?theme=dark|light`（便于演示、截图与生成固定主题的分享链接）
   *   2. 本地存储中的用户选择
   *   3. 系统偏好
   *   4. 默认深色
   * @returns {string} 主题名。
   */
  function initial() {
    const fromQuery = new URLSearchParams(window.location.search).get('theme');
    if (fromQuery === 'dark' || fromQuery === 'light') {
      return fromQuery;
    }
    try {
      const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
      if (stored === 'dark' || stored === 'light') {
        return stored;
      }
    } catch {
      // 忽略
    }
    const prefersLight = window.matchMedia
      && window.matchMedia('(prefers-color-scheme: light)').matches;
    return prefersLight ? 'light' : 'dark';
  }

  const theme = initial();
  apply(theme);

  return {
    apply,
    current: () => root.getAttribute('data-theme') || 'dark',
    toggle: () => {
      const next = root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
      apply(next);
      showToast({
        type: 'info',
        title: next === 'dark' ? '已切换到深色主题' : '已切换到浅色主题',
        duration: 1600,
      });
    },
  };
}

/**
 * 后端健康状态指示器。
 * @returns {{check: () => Promise<void>, start: () => void}} 指示器接口。
 */
function createStatusIndicator() {
  const element = qs('#serverStatus');
  const text = qs('.status__text', element);

  /**
   * 更新状态展示。
   * @param {'online'|'offline'|'checking'} state 状态。
   * @param {string} label 文案。
   * @returns {void}
   */
  function set(state, label) {
    element.dataset.state = state;
    text.textContent = label;
  }

  /**
   * 执行一次健康检查。
   * @returns {Promise<void>} 无返回值。
   */
  async function check() {
    try {
      const data = await api.health();
      set('online', `后端在线 · 运行 ${data.uptimeSeconds}s`);
    } catch {
      set('offline', '后端离线');
    }
  }

  return {
    check,
    start: () => {
      check();
      window.setInterval(check, HEALTH_INTERVAL);
    },
  };
}

/**
 * 标签页切换。
 * @returns {(name: string) => void} 切换函数。
 */
function createTabs() {
  const items = qsa('.tabs__item');
  const panels = qsa('.panel');

  return (name) => {
    for (const item of items) {
      const active = item.dataset.tab === name;
      item.classList.toggle('is-active', active);
      item.setAttribute('aria-selected', String(active));
    }
    for (const panel of panels) {
      const active = panel.dataset.panel === name;
      panel.classList.toggle('is-active', active);
      panel.hidden = !active;
    }
  };
}

/**
 * 帮助对话框：从后端拉取语法与函数清单并渲染。
 * @returns {Promise<void>} 无返回值。
 */
async function initializeHelpDialog() {
  const dialog = /** @type {HTMLDialogElement} */ (qs('#helpDialog'));
  const syntaxList = qs('#syntaxList');
  const functionGrid = qs('#functionGrid');

  qs('#helpButton').addEventListener('click', () => dialog.showModal());
  qs('#helpClose').addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) {
      dialog.close();
    }
  });

  try {
    const grammar = await api.grammar();
    syntaxList.replaceChildren(...grammar.syntax.map((text) => h('li', { text })));
    functionGrid.replaceChildren(...grammar.functions.map((fn) => h('div', {
      className: 'function-grid__item',
      children: [
        h('div', { className: 'function-grid__name', text: `${fn.name}()` }),
        h('div', { className: 'function-grid__desc', text: fn.example }),
      ],
    })));
  } catch {
    syntaxList.replaceChildren(h('li', { text: '无法从后端获取语法清单，请确认后端服务已启动。' }));
  }
}

/**
 * 应用启动流程。
 * @returns {Promise<void>} 无返回值。
 */
async function bootstrap() {
  const theme = createTheme();
  const status = createStatusIndicator();
  const switchTab = createTabs();

  // ---------------- 视图装配 ----------------
  const stats = createStats();
  const converter = createConverter();

  const history = createHistory({
    onReuse: (expression) => {
      calculator.setExpression(expression);
      calculator.calculate();
    },
    onChanged: () => {
      stats.refresh();
    },
  });

  const calculator = createCalculator({
    onCalculated: () => {
      // 计算成功后：立刻重新查询后端，保证列表与数据库一致。
      history.refresh({ silent: true });
      stats.refresh();
    },
  });

  // ---------------- 顶部操作 ----------------
  qs('#themeToggle').addEventListener('click', () => theme.toggle());

  const refreshButton = qs('#refreshAll');
  refreshButton.addEventListener('click', async () => {
    refreshButton.classList.add('is-spinning');
    try {
      await Promise.all([status.check(), history.refresh(), stats.refresh()]);
      showToast({ type: 'success', title: '已重新从后端拉取数据' });
    } finally {
      refreshButton.classList.remove('is-spinning');
    }
  });

  qs('#shareButton').addEventListener('click', async () => {
    const expression = calculator.getExpression().trim();
    if (expression === '') {
      showToast({ type: 'info', title: '请先输入表达式', text: '分享链接会带上当前算式' });
      return;
    }
    const url = new URL(window.location.href);
    url.searchParams.set('expr', expression);
    if (API_BASE !== '') {
      url.searchParams.set('api', API_BASE);
    } else {
      url.searchParams.delete('api');
    }
    try {
      await navigator.clipboard.writeText(url.toString());
      showToast({
        type: 'success',
        title: '分享链接已复制',
        text: '打开链接后会自动带上该算式',
      });
    } catch {
      calculator.setExpression(expression);
      showToast({ type: 'error', title: '无法访问剪贴板', text: url.toString() });
    }
  });

  // ---------------- 标签页 ----------------
  // 单位清单只需要从后端拉取一次；重复进入面板时不应重置用户已选好的单位。
  let converterReady = false;

  qsa('.tabs__item').forEach((item) => {
    item.addEventListener('click', () => {
      const name = item.dataset.tab || 'history';
      switchTab(name);
      if (name === 'stats') {
        stats.refresh();
      }
      if (name === 'convert' && !converterReady) {
        converterReady = true;
        converter.initialize();
      }
    });
  });

  // ---------------- 快捷键 ----------------
  registerShortcuts({
    calculator,
    onFocusSearch: () => {
      switchTab('history');
      qs('#historySearch').focus();
    },
    onToggleTheme: () => theme.toggle(),
  });

  // ---------------- 深链：?expr=1%2B2&auto=1 ----------------
  const params = new URLSearchParams(window.location.search);
  const deepExpression = params.get('expr');
  if (deepExpression !== null && deepExpression.trim() !== '') {
    calculator.setExpression(deepExpression.trim());
  }

  // ---------------- 初次数据加载 ----------------
  status.start();
  await Promise.all([
    history.refresh(),
    stats.refresh(),
    initializeHelpDialog(),
  ]);

  if (deepExpression !== null && deepExpression.trim() !== '' && params.get('auto') === '1') {
    await calculator.calculate();
  } else {
    calculator.focus();
  }

  // 后端离线时给出一次明确提示，避免用户以为界面坏了。
  try {
    await api.health();
  } catch (error) {
    const apiError = error instanceof ApiError ? error : new ApiError('后端不可用');
    showToast({
      type: 'error',
      title: '后端服务不可用',
      text: `${apiError.message}。界面仍可正常操作，但按作业要求，前端不会自行计算结果。`,
      duration: 8000,
    });
  }
}

bootstrap().catch((error) => {
  showToast({
    type: 'error',
    title: '前端初始化失败',
    text: error instanceof Error ? error.message : String(error),
    duration: 8000,
  });
});
