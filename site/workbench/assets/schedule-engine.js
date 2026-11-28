/**
 * schedule-engine.js — LifeOS·重启计划 排程引擎 v1（纯函数无依赖版）
 * 严格遵循 lifeos-kit/SPEC.md 第 3–5 节与 AGENTS.md 约束：
 *   1. 纯函数，不联网、不读文件、不修改任何入参（内部深拷贝）
 *   2. 输入与输出均为可 JSON.stringify 的普通对象，单位统一为整数分钟
 *   3. 与 Python 参考实现 engine.py 在全部黄金用例上逐字段一致
 *
 * 设计依据（见 lifeos-kit/docs/competitor-teardown.md）：
 *   - 无估时不排、最小分块约束、超载显式标记：参考 Motion §2.1 / §2.3
 *   - 二维重要·紧急映射与改期次数拖延提示：参考滴答清单 §4.1 / §4.2
 *   - 专注保护块（protectedMin）：参考 Reclaim
 *   - 个人估时校准系数 k、超载两态（partially / unschedulable）、drop_cost 排序与回填时段：本项目自研 §6
 */
(function (root) {
  'use strict';

  const PRIORITY_RANK = Object.freeze({ asap: 4, high: 3, medium: 2, low: 1, none: 0 });
  const DAY_MS = 86400000;

  function parseDayUtc(value) {
    if (!value) return null;
    if (value instanceof Date) {
      if (!Number.isFinite(value.getTime())) return null;
      return Date.UTC(value.getFullYear(), value.getMonth(), value.getDate());
    }
    const text = String(value).trim();
    const match = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!match) return null;
    const y = Number(match[1]);
    const m = Number(match[2]);
    const d = Number(match[3]);
    const utc = Date.UTC(y, m - 1, d);
    const check = new Date(utc);
    if (check.getUTCFullYear() !== y || check.getUTCMonth() !== m - 1 || check.getUTCDate() !== d) {
      return null;
    }
    return utc;
  }

  function formatDayUtc(utcMs) {
    const d = new Date(utcMs);
    const pad = n => String(n).padStart(2, '0');
    return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
  }

  function diffDays(aUtc, bUtc) {
    return Math.round((aUtc - bUtc) / DAY_MS);
  }

  function formatKForNote(k) {
    return Number.isInteger(k) ? k.toFixed(1) : String(k);
  }

  // 4.1 估时校准系数 k
  function calibrationFactor(history, fallback = 1.0) {
    const list = Array.isArray(history) ? history : [];
    const ratios = [];
    for (const item of list) {
      const est = Array.isArray(item) ? Number(item[0]) : Number(item && item.estimate);
      const act = Array.isArray(item) ? Number(item[1]) : Number(item && item.actual);
      if (Number.isFinite(est) && Number.isFinite(act) && est > 0 && act > 0) {
        ratios.push(act / est);
      }
    }
    if (ratios.length < 3) {
      return { k: fallback, n: ratios.length, source: 'default' };
    }
    ratios.sort((a, b) => a - b);
    const m = ratios.length;
    const raw = m % 2 === 1 ? ratios[(m - 1) / 2] : (ratios[m / 2 - 1] + ratios[m / 2]) / 2;
    const clamped = Math.max(0.5, Math.min(3.0, raw));
    return {
      k: Math.round(clamped * 1000) / 1000,
      n: m,
      source: Math.abs(clamped - raw) < 1e-9 ? 'personal' : 'clamped'
    };
  }

  // 4.2 校准后的真实时长（向上取整到 5 分钟）
  function effectiveMinutes(estimate, k) {
    return Math.ceil((Number(estimate) * Number(k)) / 5) * 5;
  }

  function cloneTask(raw) {
    const estimateRaw = raw.estimateMin !== undefined ? raw.estimateMin : raw.estimate_min;
    const hasEstimate = estimateRaw !== null && estimateRaw !== undefined && estimateRaw !== '';
    const estimateNum = hasEstimate ? Number(estimateRaw) : null;
    const estimateMin = estimateNum !== null && Number.isFinite(estimateNum) && estimateNum > 0
      ? Math.ceil(estimateNum / 5) * 5
      : (estimateNum !== null && Number.isFinite(estimateNum) ? Math.trunc(estimateNum) : null);
    const minChunkRaw = raw.minChunk !== undefined ? raw.minChunk : raw.min_chunk;
    const minChunkNum = minChunkRaw === undefined || minChunkRaw === null || minChunkRaw === '' ? 25 : Number(minChunkRaw);
    const doneRaw = raw.doneRatio !== undefined ? raw.doneRatio : raw.done_ratio;
    const startRaw = raw.startDate !== undefined ? raw.startDate : raw.start_date;
    const reschedRaw = raw.rescheduleCount !== undefined ? raw.rescheduleCount : raw.reschedule_count;
    const priority = Object.prototype.hasOwnProperty.call(PRIORITY_RANK, raw.priority) ? raw.priority : 'none';
    return {
      id: String(raw.id ?? ''),
      name: String(raw.name ?? raw.title ?? ''),
      rawEstimate: estimateNum !== null && Number.isFinite(estimateNum) ? Math.trunc(estimateNum) : null,
      estimateMin,
      deadlineUtc: parseDayUtc(raw.deadline),
      priority,
      splittable: Boolean(raw.splittable),
      minChunk: Number.isFinite(minChunkNum) ? Math.max(10, Math.trunc(minChunkNum)) : 25,
      doneRatio: Math.max(0, Math.min(1, Number(doneRaw) || 0)),
      startDateUtc: parseDayUtc(startRaw),
      rescheduleCount: Math.max(0, Math.trunc(Number(reschedRaw) || 0)),
      placed: [],
      status: 'pending'
    };
  }

  function cloneDay(raw) {
    const dayUtc = parseDayUtc(raw.day);
    const windows = Array.isArray(raw.windows)
      ? raw.windows
          .map(w => [Math.trunc(Number(w[0]) || 0), Math.trunc(Number(w[1]) || 0)])
          .filter(w => w[1] > 0)
      : [];
    const protectedRaw = raw.protectedMin !== undefined ? raw.protectedMin : raw.protected_min;
    return {
      dayUtc,
      dayStr: dayUtc !== null ? formatDayUtc(dayUtc) : '',
      windows,
      protectedMin: Math.max(0, Math.trunc(Number(protectedRaw) || 0)),
      totalFree() {
        return this.windows.reduce((sum, w) => sum + w[1], 0);
      }
    };
  }

  // 4.3 前置校验（供 UI 录入实时标红与引擎内部复用）
  function validateTask(rawTask, todayInput) {
    const todayUtc = parseDayUtc(todayInput);
    const t = cloneTask(rawTask || {});
    if (!t.estimateMin || t.estimateMin <= 0) {
      return { status: 'invalid', reason: '缺估时，请填写预计需要多少分钟' };
    }
    if (t.deadlineUtc === null && PRIORITY_RANK[t.priority] <= 0) {
      return { status: 'invalid', reason: '至少给一个截止日或一个优先级' };
    }
    if (t.startDateUtc !== null && todayUtc !== null && t.startDateUtc > todayUtc) {
      const d = new Date(t.startDateUtc);
      return {
        status: 'deferred',
        reason: `还没到开始日，${d.getUTCMonth() + 1} 月 ${d.getUTCDate()} 日起可排`
      };
    }
    return { status: 'pending', reason: '' };
  }

  // 4.7 放弃代价 drop_cost
  function urgencyScore(task, todayInput) {
    const deadlineUtc = task.deadlineUtc !== undefined ? task.deadlineUtc : parseDayUtc(task.deadline);
    const todayUtc = typeof todayInput === 'number' ? todayInput : parseDayUtc(todayInput);
    if (deadlineUtc === null || todayUtc === null) return 0;
    const days = diffDays(deadlineUtc, todayUtc);
    if (days < 0) return 1;
    return 1 / (1 + days);
  }

  function dropCost(task, todayInput) {
    const u = urgencyScore(task, todayInput);
    const ratioRaw = task.doneRatio !== undefined ? task.doneRatio : task.done_ratio;
    const p = Math.max(0, Math.min(1, Number(ratioRaw) || 0));
    const rigid = task.splittable ? 0 : 1;
    return Math.round((0.55 * u + 0.30 * p + 0.15 * rigid) * 10000) / 10000;
  }

  function orderKey(t) {
    return [
      t.priority === 'asap' ? 0 : 1,
      t.deadlineUtc !== null ? t.deadlineUtc : Infinity,
      -PRIORITY_RANK[t.priority]
    ];
  }

  function compareOrderKey(a, b) {
    for (let i = 0; i < a.length; i++) {
      if (a[i] < b[i]) return -1;
      if (a[i] > b[i]) return 1;
    }
    return 0;
  }

  // 4.9 理由文案
  function buildReason(t, todayUtc) {
    const bits = [];
    if (t.deadlineUtc !== null) {
      const d = diffDays(t.deadlineUtc, todayUtc);
      bits.push(d < 0 ? '已过期' : `距截止 ${d} 天`);
    } else {
      bits.push('无固定期限');
    }
    bits.push(`已完成 ${Math.trunc(t.doneRatio * 100)}%`);
    bits.push(t.splittable ? '可拆分' : '不可拆分');
    if (t.rescheduleCount >= 2) {
      bits.push(`已改期 ${t.rescheduleCount} 次`);
    }
    return bits.join('；');
  }

  // 4.8 回填时段
  function findNextSlot(t, orderedDays, need) {
    const mc = t.minChunk;
    for (const d of orderedDays) {
      if (t.deadlineUtc !== null && d.dayUtc > t.deadlineUtc) {
        return null;
      }
      for (const [start, length] of d.windows) {
        if (length >= Math.min(need, mc)) {
          return {
            day: d.dayStr,
            startMin: start,
            fitsFull: length >= need,
            window: length
          };
        }
      }
    }
    return null;
  }

  function makeDay(iso, windows, opts) {
    return cloneDay({
      day: iso,
      windows: Array.isArray(windows) ? windows : [],
      protectedMin: opts && (opts.protectedMin ?? opts.protected)
    });
  }

  // 4 主流程：校准 → 校验 → 装箱 → 分配超载 → 排序输出
  function schedule(inputTasks, inputDays, kInput = 1.0, todayInput, horizonDays = 7) {
    const k = Number.isFinite(Number(kInput)) && Number(kInput) > 0 ? Number(kInput) : 1.0;
    const todayUtc = parseDayUtc(todayInput);
    if (todayUtc === null) {
      throw new Error('today 日期格式无效，需为 YYYY-MM-DD');
    }
    const horizon = Number.isInteger(horizonDays) ? horizonDays : Math.trunc(Number(horizonDays) || 0);

    const tasks = (Array.isArray(inputTasks) ? inputTasks : []).map(cloneTask);
    const orderedDays = (Array.isArray(inputDays) ? inputDays : [])
      .map(cloneDay)
      .filter(d => d.dayUtc !== null)
      .sort((a, b) => a.dayUtc - b.dayUtc);

    // 1. 前置校验
    for (const t of tasks) {
      if (!t.estimateMin || t.estimateMin <= 0) {
        t.status = 'invalid';
      } else if (t.deadlineUtc === null && PRIORITY_RANK[t.priority] <= 0) {
        t.status = 'invalid';
      } else if (t.startDateUtc !== null && t.startDateUtc > todayUtc) {
        t.status = 'deferred';
      } else {
        t.status = 'pending';
      }
    }

    const candidates = tasks
      .filter(t => t.status === 'pending')
      .sort((a, b) => compareOrderKey(orderKey(a), orderKey(b)));

    const inHorizon = d => diffDays(d.dayUtc, todayUtc) <= horizon;

    // 2. 容量计算
    const capacityRaw = orderedDays
      .filter(inHorizon)
      .reduce((sum, d) => sum + d.totalFree(), 0);
    const capacityCal = k ? Math.floor(capacityRaw / k) : capacityRaw;

    // 3. 装箱（严格执行最小分块规则与不可拆约束）
    for (const t of candidates) {
      let need = effectiveMinutes(t.estimateMin, k);
      const mc = t.minChunk;
      for (const d of orderedDays) {
        if (!inHorizon(d)) break;
        if (t.deadlineUtc !== null && d.dayUtc > t.deadlineUtc) break;
        for (let i = 0; i < d.windows.length; i++) {
          if (need <= 0) break;
          const [start, length] = d.windows[i];
          if (length <= 0) continue;
          let take = 0;
          if (!t.splittable) {
            if (length < need) continue;
            take = need;
          } else {
            take = Math.min(length, need);
            const rest = need - take;
            if (rest > 0 && rest < mc) {
              take = length >= need ? need : need - mc;
            }
            if (take <= 0) continue;
          }
          d.windows[i] = [start + take, length - take];
          t.placed.push({ day: d.dayStr, min: take });
          need -= take;
        }
        if (need <= 0) break;
      }

      const totalPlaced = t.placed.reduce((sum, b) => sum + b.min, 0);
      if (totalPlaced === 0) {
        t.status = 'unschedulable';
        t.placed = [];
      } else if (need > 0) {
        t.status = 'partially';
      } else {
        t.status = 'scheduled';
      }
    }

    // 4. 超载分两态
    const hard = candidates
      .filter(t => t.status === 'unschedulable')
      .sort((a, b) => dropCost(a, todayUtc) - dropCost(b, todayUtc));

    const dropped = hard.map(t => ({
      task: t.id,
      name: t.name,
      dropCost: dropCost(t, todayUtc),
      reason: buildReason(t, todayUtc),
      nextSlot: findNextSlot(t, orderedDays, t.estimateMin || 0)
    }));

    const remainder = candidates
      .filter(t => t.status === 'partially')
      .map(t => {
        const placedMin = t.placed.reduce((sum, b) => sum + b.min, 0);
        const left = effectiveMinutes(t.estimateMin, k) - placedMin;
        return {
          task: t.id,
          name: t.name,
          placedMin,
          remainderMin: left,
          nextSlot: findNextSlot(t, orderedDays, left),
          reason: buildReason(t, todayUtc)
        };
      });

    const leftover = orderedDays
      .filter(inHorizon)
      .reduce((sum, d) => sum + d.totalFree(), 0);

    return {
      k,
      capacityRawMin: capacityRaw,
      capacityCalibratedMin: capacityCal,
      capacityNote: `可用 ${capacityRaw} 分钟，按 k=${formatKForNote(k)} 折算相当于 ${capacityCal} 分钟的原始估时`,
      scheduled: candidates
        .filter(t => t.placed.length > 0)
        .map(t => ({
          task: t.id,
          name: t.name,
          effMin: t.placed.reduce((sum, b) => sum + b.min, 0),
          rawMin: t.rawEstimate !== null ? t.rawEstimate : t.estimateMin,
          blocks: t.placed.map(b => ({ day: b.day, min: b.min })),
          status: t.status,
          eta: t.deadlineUtc !== null ? formatDayUtc(t.deadlineUtc) : '—'
        })),
      dropped,
      remainder,
      invalid: tasks
        .filter(t => t.status === 'invalid' || t.status === 'deferred')
        .map(t => ({ task: t.id, name: t.name, why: t.status })),
      leftoverMin: Math.max(0, leftover)
    };
  }

  const api = Object.freeze({
    calibrationFactor,
    effectiveMinutes,
    urgencyScore,
    dropCost,
    validateTask,
    schedule,
    makeDay,
    PRIORITY_RANK
  });

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.LifeOSScheduleEngine = api;
    if (!root.LifeOS) {
      root.LifeOS = api;
    }
  }
})(typeof window !== 'undefined' ? window : globalThis);
