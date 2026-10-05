/**
 * 统计面板视图（附加功能）。
 *
 * 数据全部来自后端聚合接口 GET /api/history/stats，
 * 前端只负责把数字画成柱状图与排行榜，不做任何统计计算。
 */

import { api } from './api.js';
import { formatDayLabel } from './format.js';
import { h, qs } from './dom.js';
import { showToast } from './toast.js';

/**
 * 创建统计视图。
 *
 * @returns {{refresh: () => Promise<void>}} 视图接口。
 */
export function createStats() {
  const total = qs('#statTotal');
  const today = qs('#statToday');
  const favorite = qs('#statFavorite');
  const distinct = qs('#statDistinct');
  const chart = qs('#trendChart');
  const ranking = qs('#topExpressions');

  /**
   * 渲染趋势柱状图。
   *
   * 纯 CSS + DOM 实现，不引入任何图表库，保证前端零第三方依赖。
   *
   * @param {Array<{date: string, count: number}>} dailyCounts 每日计数。
   * @returns {void}
   */
  function renderChart(dailyCounts) {
    const peak = Math.max(1, ...dailyCounts.map((item) => item.count));
    chart.replaceChildren(...dailyCounts.map((item) => h('div', {
      className: 'chart__col',
      children: [
        h('span', { className: 'chart__value', text: String(item.count) }),
        h('div', {
          className: 'chart__bar',
          attrs: {
            style: `height: ${Math.max(4, Math.round((item.count / peak) * 78))}%`,
            title: `${item.date}：${item.count} 次`,
          },
        }),
        h('span', { className: 'chart__day', text: formatDayLabel(item.date) }),
      ],
    })));
  }

  /**
   * 渲染最常用算式排行。
   *
   * @param {Array<{expression: string, count: number}>} topExpressions 排行数据。
   * @returns {void}
   */
  function renderRanking(topExpressions) {
    if (topExpressions.length === 0) {
      ranking.replaceChildren(h('li', {
        className: 'ranking__item',
        children: [h('span', { className: 'ranking__expr', text: '暂无数据' })],
      }));
      return;
    }
    ranking.replaceChildren(...topExpressions.map((item) => h('li', {
      className: 'ranking__item',
      children: [
        h('span', { className: 'ranking__expr', text: item.expression, attrs: { title: item.expression } }),
        h('span', { className: 'ranking__count', text: `${item.count} 次` }),
      ],
    })));
  }

  /**
   * 拉取并渲染统计数据。
   * @returns {Promise<void>} 无返回值。
   */
  async function refresh() {
    try {
      const data = await api.statistics();
      total.textContent = String(data.total);
      today.textContent = String(data.todayCount);
      favorite.textContent = String(data.favoriteCount);
      distinct.textContent = String(data.distinctExpressionCount);
      renderChart(data.dailyCounts);
      renderRanking(data.topExpressions);
    } catch (error) {
      showToast({
        type: 'error',
        title: '读取统计数据失败',
        text: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return { refresh };
}
