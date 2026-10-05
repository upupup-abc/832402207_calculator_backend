/**
 * 计算历史视图。
 *
 * 关键要求：列表数据只能来自 GET /api/history，
 * 前端不使用 localStorage / 内存缓存来「假装」历史记录还在，
 * 因此刷新、关闭、重开页面后看到的内容与数据库完全一致。
 */

import { api, ApiError } from './api.js';
import { PAGE_SIZE } from './config.js';
import { formatTimeShort } from './format.js';
import { h, icon, qs } from './dom.js';
import { showToast } from './toast.js';

/** 图标路径常量，避免在渲染函数里重复书写。 */
const ICONS = Object.freeze({
  reuse: 'M4 12a8 8 0 0 1 13.7-5.7L20 8.5M20 4v4.5h-4.5M20 12a8 8 0 0 1-13.7 5.7L4 15.5M4 20v-4.5h4.5',
  copy: 'M9 9h9.5A2.5 2.5 0 0 1 21 11.5v7A2.5 2.5 0 0 1 18.5 21h-9A2.5 2.5 0 0 1 7 18.5v-7A2.5 2.5 0 0 1 9.5 9zM4 15V5.5A2.5 2.5 0 0 1 6.5 3H14',
  star: 'M12 3.6l2.5 5.2 5.7.8-4.1 4 1 5.7L12 16.6 6.9 19.3l1-5.7-4.1-4 5.7-.8z',
  trash: 'M4 7h16M9.5 7V4.8h5V7M6.5 7l.9 12.2A2 2 0 0 0 9.4 21h5.2a2 2 0 0 0 2-1.8L17.5 7',
});

/**
 * 创建历史视图。
 *
 * @param {{onReuse: (expression: string) => void,
 *   onChanged: () => void}} hooks 交互回调。
 * @returns {{refresh: (options?: {silent?: boolean}) => Promise<void>,
 *   reset: () => Promise<void>, setKeyword: (keyword: string) => void}} 视图接口。
 */
export function createHistory(hooks) {
  const list = qs('#historyList');
  const empty = qs('#historyEmpty');
  const searchInput = /** @type {HTMLInputElement} */ (qs('#historySearch'));
  const filterAll = qs('#filterAll');
  const filterFavorite = qs('#filterFavorite');
  const prevButton = qs('#prevPage');
  const nextButton = qs('#nextPage');
  const pageLabel = qs('#pageLabel');
  const exportButton = qs('#exportButton');
  const clearButton = qs('#clearButton');
  const countBadge = qs('#historyCount');

  const state = {
    page: 1,
    keyword: '',
    favoriteOnly: false,
    totalPages: 1,
  };

  /**
   * 生成一个操作按钮。
   *
   * @param {string} action 动作名。
   * @param {string} label 无障碍标签。
   * @param {string} pathData 图标路径。
   * @param {string} [extraClass] 附加 class。
   * @returns {HTMLElement} 按钮元素。
   */
  function actionButton(action, label, pathData, extraClass = '') {
    const button = h('button', {
      className: `history__action${extraClass}`,
      attrs: { type: 'button', 'data-action': action, title: label, 'aria-label': label },
      children: [icon(pathData, 15)],
    });
    return button;
  }

  /**
   * 渲染单条历史记录。
   *
   * 全部使用 textContent / setAttribute 赋值，不拼接 HTML 字符串，
   * 避免表达式内容造成 XSS。
   *
   * @param {object} record 历史记录。
   * @returns {HTMLElement} 列表项元素。
   */
  function renderItem(record) {
    const expressionButton = h('button', {
      className: 'history__expr',
      text: record.expression,
      attrs: { type: 'button', title: '点击复用该表达式' },
    });
    expressionButton.addEventListener('click', () => {
      hooks.onReuse(record.expression);
      showToast({ type: 'info', title: '已填入表达式', text: record.expression });
    });

    const star = record.isFavorite
      ? h('span', { className: 'history__star', text: '★ 已收藏' })
      : null;

    const head = h('div', {
      className: 'history__head',
      children: [expressionButton, h('span', { className: 'history__id', text: `#${record.id}` })],
    });

    const result = h('div', {
      className: 'history__result',
      text: `= ${record.resultText}`,
    });

    const meta = h('div', {
      className: 'history__meta',
      children: [
        h('time', {
          text: formatTimeShort(record.createdAt),
          attrs: { datetime: record.createdAt, title: record.createdAt },
        }),
        star,
      ].filter(Boolean),
    });

    const favoriteButton = actionButton(
      'favorite',
      record.isFavorite ? '取消收藏' : '加入收藏',
      ICONS.star,
      record.isFavorite ? ' is-on' : '',
    );
    favoriteButton.addEventListener('click', async () => {
      try {
        await api.setFavorite(record.id, !record.isFavorite);
        showToast({
          type: 'success',
          title: record.isFavorite ? '已取消收藏' : '已加入收藏',
          text: record.expression,
        });
        await refresh();
        hooks.onChanged();
      } catch (error) {
        reportError(error, '收藏操作失败');
      }
    });

    const copyButton = actionButton('copy', '复制表达式', ICONS.copy);
    copyButton.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(record.expression);
        showToast({ type: 'success', title: '表达式已复制', text: record.expression });
      } catch {
        showToast({ type: 'error', title: '复制失败', text: '浏览器拒绝了剪贴板访问权限' });
      }
    });

    const reuseButton = actionButton('reuse', '复用并重新计算', ICONS.reuse);
    reuseButton.addEventListener('click', () => {
      hooks.onReuse(record.expression);
    });

    const deleteButton = actionButton('delete', '删除该记录', ICONS.trash, ' history__action--danger');
    deleteButton.addEventListener('click', async () => {
      const item = deleteButton.closest('.history__item');
      try {
        await api.deleteHistory(record.id);
        if (item !== null) {
          item.classList.add('is-removing');
        }
        showToast({
          type: 'success',
          title: '已从后端数据库删除',
          text: `记录 #${record.id}：${record.expression}`,
        });
        // 删除后重新查询，保证列表与数据库状态严格一致。
        await refresh({ silent: true });
        hooks.onChanged();
      } catch (error) {
        reportError(error, '删除失败');
      }
    });

    return h('li', {
      className: `history__item${record.isFavorite ? ' is-favorite' : ''}`,
      attrs: { 'data-id': String(record.id) },
      children: [
        head,
        result,
        meta,
        h('div', {
          className: 'history__actions',
          children: [reuseButton, copyButton, favoriteButton, deleteButton],
        }),
      ],
    });
  }

  /**
   * 统一展示错误。
   *
   * @param {unknown} error 异常对象。
   * @param {string} fallbackTitle 兜底标题。
   * @returns {void}
   */
  function reportError(error, fallbackTitle) {
    const apiError = error instanceof ApiError ? error : new ApiError('操作失败');
    showToast({
      type: 'error',
      title: apiError.isConnectionError ? '无法连接后端' : fallbackTitle,
      text: apiError.message,
    });
  }

  /**
   * 拉取并渲染历史列表。
   *
   * @param {{silent?: boolean}} [options] 选项。
   * @returns {Promise<void>} 无返回值。
   */
  async function refresh(options = {}) {
    try {
      const data = await api.listHistory({
        page: state.page,
        pageSize: PAGE_SIZE,
        keyword: state.keyword,
        favoriteOnly: state.favoriteOnly ? 'true' : '',
      });

      // 当前页被删空时自动回退一页。
      if (data.items.length === 0 && data.total > 0 && state.page > data.totalPages) {
        state.page = Math.max(1, data.totalPages);
        await refresh(options);
        return;
      }

      state.totalPages = Math.max(1, data.totalPages);
      list.replaceChildren(...data.items.map(renderItem));
      empty.hidden = data.items.length > 0;
      list.hidden = data.items.length === 0;
      countBadge.textContent = String(data.total);
      pageLabel.textContent = `第 ${state.page} / ${state.totalPages} 页`;
      prevButton.disabled = !data.hasPrev;
      nextButton.disabled = !data.hasNext;
      prevButton.style.opacity = data.hasPrev ? '1' : '0.4';
      nextButton.style.opacity = data.hasNext ? '1' : '0.4';
    } catch (error) {
      if (options.silent !== true) {
        reportError(error, '读取历史记录失败');
      }
      list.replaceChildren();
      empty.hidden = false;
      countBadge.textContent = '0';
      pageLabel.textContent = '第 1 / 1 页';
    }
  }

  /** 重置到第一页并重新加载。 @returns {Promise<void>} 无返回值。 */
  async function reset() {
    state.page = 1;
    await refresh();
  }

  // ------------------------------------------------------------ 事件绑定

  /** 搜索输入防抖，避免每敲一个字符就请求一次后端。 */
  let searchTimer = 0;
  searchInput.addEventListener('input', () => {
    window.clearTimeout(searchTimer);
    searchTimer = window.setTimeout(() => {
      state.keyword = searchInput.value.trim();
      state.page = 1;
      refresh();
    }, 260);
  });

  filterAll.addEventListener('click', () => {
    state.favoriteOnly = false;
    state.page = 1;
    filterAll.classList.add('is-active');
    filterFavorite.classList.remove('is-active');
    refresh();
  });

  filterFavorite.addEventListener('click', () => {
    state.favoriteOnly = true;
    state.page = 1;
    filterFavorite.classList.add('is-active');
    filterAll.classList.remove('is-active');
    refresh();
  });

  prevButton.addEventListener('click', () => {
    if (state.page > 1) {
      state.page -= 1;
      refresh();
    }
  });

  nextButton.addEventListener('click', () => {
    if (state.page < state.totalPages) {
      state.page += 1;
      refresh();
    }
  });

  exportButton.addEventListener('click', () => {
    // 直接请求后端的导出接口，文件内容由后端从数据库生成。
    window.location.href = api.exportUrl({
      keyword: state.keyword,
      favoriteOnly: state.favoriteOnly ? 'true' : '',
    });
    showToast({ type: 'info', title: '正在从后端导出 CSV…' });
  });

  clearButton.addEventListener('click', async () => {
    const confirmed = window.confirm('确定要清空后端数据库中的全部计算历史吗？该操作不可撤销。');
    if (!confirmed) {
      return;
    }
    try {
      const data = await api.clearHistory();
      showToast({
        type: 'success',
        title: '已清空历史记录',
        text: `后端数据库删除了 ${data.deleted} 条记录`,
      });
      await reset();
      hooks.onChanged();
    } catch (error) {
      reportError(error, '清空失败');
    }
  });

  return {
    refresh,
    reset,
    setKeyword: (keyword) => {
      searchInput.value = keyword;
      state.keyword = keyword;
    },
  };
}
