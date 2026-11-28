/* Pure client-side parser for .ics timetables, campus course lines, and student sticky notes. */
(function (root) {
  'use strict';

  const DAY_MS = 86400000;
  const WEEK_MAP = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 日: 7, 天: 7, '1': 1, '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7 };
  const ICS_BYDAY = { SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6 };
  const SECTION_START = {
    1: [8, 0], 2: [8, 50], 3: [9, 55], 4: [10, 45], 5: [11, 35],
    6: [14, 0], 7: [14, 50], 8: [15, 55], 9: [16, 45],
    10: [18, 30], 11: [19, 25], 12: [20, 20]
  };
  const SECTION_END = {
    1: [8, 45], 2: [9, 35], 3: [10, 40], 4: [11, 30], 5: [12, 20],
    6: [14, 45], 7: [15, 35], 8: [16, 40], 9: [17, 30],
    10: [19, 15], 11: [20, 10], 12: [21, 5]
  };

  const fmtDate = d => {
    const dt = d instanceof Date ? d : new Date(d);
    return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
  };

  const atDay = (base, offset, h = 0, m = 0) => {
    const b = new Date(base);
    return new Date(b.getFullYear(), b.getMonth(), b.getDate() + offset, h, m, 0, 0);
  };

  function periodOfMinute(totalMinutes) {
    if (totalMinutes < 12 * 60) return 'morning';
    if (totalMinutes < 13 * 60 + 15) return 'noon';
    if (totalMinutes < 18 * 60) return 'afternoon';
    return 'evening';
  }

  function periodOfHour(h, m = 0) {
    return periodOfMinute((Number(h) || 0) * 60 + (Number(m) || 0));
  }

  const MAJOR_SEC_CN = { '一': 1, '二': 2, '三': 3, '四': 4, '五': 5, '六': 6, '1': 1, '2': 2, '3': 3, '4': 4, '5': 5, '6': 6 };

  function fmtHM(totalMin) {
    const clamped = Math.max(0, Math.min(23 * 60 + 59, Math.round(totalMin)));
    return `${String(Math.floor(clamped / 60)).padStart(2, '0')}:${String(clamped % 60).padStart(2, '0')}`;
  }

  function parseClockHM(raw) {
    const m = String(raw || '').trim().match(/^(\d{1,2})[:：.](\d{2})(?::\d{2})?$/);
    if (!m) return null;
    const h = Number(m[1]), min = Number(m[2]);
    if (!Number.isInteger(h) || h < 0 || h > 23 || !Number.isInteger(min) || min < 0 || min > 59) return null;
    const total = h * 60 + min;
    return { h, m: min, total, text: fmtHM(total) };
  }

  function extractTimeRanges(line) {
    const out = [];
    const re = /(\d{1,2}[:：.]\d{2})(?::\d{2})?\s*[-~—–到至]+\s*(\d{1,2}[:：.]\d{2})(?::\d{2})?/g;
    let match;
    while ((match = re.exec(String(line || ''))) !== null) {
      const s = parseClockHM(match[1]);
      const e = parseClockHM(match[2]);
      if (s && e && e.total > s.total && (e.total - s.total) <= 240) {
        out.push({ start: s, end: e, dur: e.total - s.total });
      }
    }
    return out;
  }

  function expandBellSpan(s1, s2, startMin, endMin) {
    const lo = Math.max(1, Math.min(16, Number(s1) || 1));
    const hi = Math.max(lo, Math.min(16, Number(s2) || lo));
    const count = hi - lo + 1;
    const span = endMin - startMin;
    if (count === 1 || span < 40) {
      return [{ section: lo, start: fmtHM(startMin), end: fmtHM(endMin), period: periodOfMinute(startMin) }];
    }
    const gap = Math.max(0, Math.min(15, Math.floor((span - count * 40) / Math.max(1, count - 1))));
    const each = (span - gap * (count - 1)) / count;
    const entries = [];
    for (let i = 0; i < count; i++) {
      const curS = i === 0 ? startMin : Math.round(startMin + i * (each + gap));
      const curE = i === count - 1 ? endMin : Math.round(startMin + (i + 1) * each + i * gap);
      entries.push({
        section: lo + i,
        start: fmtHM(curS),
        end: fmtHM(Math.max(curS + 20, curE)),
        period: periodOfMinute(curS)
      });
    }
    return entries;
  }

  function normalizeBellEntries(list) {
    if (!Array.isArray(list)) return [];
    const bySec = new Map();
    for (const item of list.slice(0, 32)) {
      if (!item || typeof item !== 'object') continue;
      const st = parseClockHM(item.start);
      const en = parseClockHM(item.end);
      if (!st || !en || en.total <= st.total || st.total < 5 * 60) continue;

      const secRaw = item.section ?? item.sections ?? item.label ?? '';
      let s1 = null, s2 = null;
      if (Number.isInteger(Number(secRaw)) && String(secRaw).trim() !== '' && !/[-~到至,]/.test(String(secRaw))) {
        s1 = s2 = Number(secRaw);
      } else {
        const sStr = String(secRaw || '');
        const sm = sStr.match(/(\d{1,2})(?:\s*[-~到至,，]\s*(\d{1,2}))?/);
        const mm = sStr.match(/第?\s*([一二三四五六1-6])\s*大节/);
        if (mm && !sm) {
          const mj = MAJOR_SEC_CN[mm[1]];
          s1 = (mj - 1) * 2 + 1;
          s2 = (mj === 5 && (en.total - st.total) >= 120) ? 11 : s1 + 1;
        } else if (sm) {
          s1 = Number(sm[1]);
          s2 = Number(sm[2] || sm[1]);
        }
      }
      if (!s1 || s1 < 1 || s1 > 16) continue;
      s2 = Math.max(s1, Math.min(16, s2 || s1));
      const expanded = expandBellSpan(s1, s2, st.total, en.total);
      for (const entry of expanded) {
        bySec.set(entry.section, entry);
      }
    }
    let result = [...bySec.values()].sort((a, b) => a.section - b.section);
    // If DeepSeek returned Chinese university major blocks (e.g. sections 1..5 where each block spans >= 75m),
    // automatically expand them into consecutive small sections (1..2, 3..4, 5..6, 7..8, 9..11).
    if (result.length >= 3 && result.length <= 6 && result.every((entry, idx) => entry.section === idx + 1)) {
      const durations = result.map(entry => {
        const a = parseClockHM(entry.start), b = parseClockHM(entry.end);
        return (a && b) ? (b.total - a.total) : 0;
      });
      const majorLikeCount = durations.filter(d => d >= 75).length;
      if (majorLikeCount >= Math.ceil(result.length * 0.6)) {
        const expandedMap = new Map();
        for (const entry of result) {
          const st = parseClockHM(entry.start), en = parseClockHM(entry.end);
          if (!st || !en) continue;
          const mj = entry.section;
          const lo = (mj - 1) * 2 + 1;
          const hi = (mj === 5 && (en.total - st.total) >= 120) ? 11 : lo + 1;
          for (const item of expandBellSpan(lo, hi, st.total, en.total)) {
            expandedMap.set(item.section, item);
          }
        }
        result = [...expandedMap.values()].sort((a, b) => a.section - b.section);
      }
    }
    return result;
  }

  function canonicalCourseKey(rawTitle) {
    let s = String(rawTitle || '').trim();
    if (!s) return '';
    s = s
      .replace(/[（]/g, '(')
      .replace(/[）]/g, ')')
      .replace(/\s*·\s*第?\s*\d{1,2}(?:\s*[-~到至]\s*\d{1,2})?\s*节(?=\s|$|[·(])/g, '')
      .replace(/(?:^|\s)第?\s*\d{1,2}(?:\s*[-~到至]\s*\d{1,2})?\s*节(?=\s|$|[·(])/g, '')
      .replace(/[(]*\s*(?:\d{1,2}\s*[-~]\s*\d{1,2}\s*周|第?\d{1,2}周)\s*[)]*/g, '')
      .replace(/(?:\s*·\s*)?\([^)]*(?:幢|憧|栋|楼|室|馆|厅|区|教|阶教|实验|\d{2,}|^[A-Za-z]\d{2,})[^)]*\)/g, '')
      .replace(/\s*·\s*\([^)]*\)\s*$/g, '');
    return s.replace(/[\s·•\-_:：,，.。/\\()（）【】\[\]'"“”‘’]+/g, '').toLowerCase();
  }

  function canonicalTaskKey(rawTitle) {
    return String(rawTitle || '')
      .replace(/[（]/g, '(')
      .replace(/[）]/g, ')')
      .replace(/[\s·•\-_:：,，.。/\\()（）【】\[\]'"“”‘’]+/g, '')
      .toLowerCase();
  }

  function rebuildSectionSlotTitle(title, location, s1, s2) {
    const cleanLoc = String(location || '').trim();
    const base = String(title || '')
      .replace(/[（]/g, '(')
      .replace(/[）]/g, ')')
      .replace(/\s*·\s*(?:第?\s*\d{1,2}(?:\s*[-~到至]\s*\d{1,2})?\s*节)/g, '')
      .replace(/\s*·\s*\([^)]*\)\s*$/g, '')
      .trim();
    const secStr = s1 && s2 ? (s1 === s2 ? `${s1}节` : `${s1}-${s2}节`) : '';
    const locStr = cleanLoc && !base.includes(cleanLoc) ? `(${cleanLoc})` : '';
    return [base, secStr, locStr].filter(Boolean).join(' · ').slice(0, 120);
  }

  function mergeBlockedSlots(existingSlots = [], incomingSlots = [], { bellSchedule = [] } = {}) {
    const list = (Array.isArray(existingSlots) ? existingSlots : []).filter(b => b && typeof b === 'object').map(b => ({ ...b }));
    const rawIncoming = (Array.isArray(incomingSlots) ? incomingSlots : []).filter(b => b && typeof b === 'object').map(b => ({ ...b }));
    rawIncoming.sort((a, b) => Date.parse(a.start) - Date.parse(b.start));

    // Coalesce immediately contiguous same-day chunks of the same course & classroom (e.g. 3-4节 + 5节 -> 3-5节)
    const coalesced = [];
    for (const cur of rawIncoming) {
      const curDay = cur.day || fmtDate(cur.start);
      const curKey = canonicalCourseKey(cur.title);
      const curLoc = String(cur.location || '').replace(/[\s()（）]+/g, '').toLowerCase();
      const curS = Date.parse(cur.start), curE = Date.parse(cur.end);
      const curRng = extractSectionRange(cur);
      let prev = null;
      for (let i = coalesced.length - 1; i >= 0; i--) {
        const cand = coalesced[i];
        if ((cand.day || fmtDate(cand.start)) === curDay && curKey && canonicalCourseKey(cand.title) === curKey) {
          prev = cand;
          break;
        }
      }
      if (prev && curKey && canonicalCourseKey(prev.title) === curKey) {
        const prevLoc = String(prev.location || '').replace(/[\s()（）]+/g, '').toLowerCase();
        const sameLoc = !curLoc || !prevLoc || curLoc === prevLoc;
        const prevE = Date.parse(prev.end);
        const prevRng = extractSectionRange(prev);
        const secContiguous = prevRng && curRng && curRng.s1 <= prevRng.s2 + 1 && curRng.s2 >= prevRng.s1;
        const clockGapMin = (curS - prevE) / 60000;
        const clockContiguous = Number.isFinite(clockGapMin) && clockGapMin >= -15 && clockGapMin <= 18;
        if (sameLoc && (secContiguous || clockContiguous)) {
          const ns1 = prevRng && curRng ? Math.min(prevRng.s1, curRng.s1) : (prevRng?.s1 ?? curRng?.s1);
          const ns2 = prevRng && curRng ? Math.max(prevRng.s2, curRng.s2) : (prevRng?.s2 ?? curRng?.s2);
          const finalLoc = prev.location || cur.location || '';
          const mergedStart = Date.parse(prev.start) <= curS ? prev.start : cur.start;
          const mergedEnd = prevE >= curE ? prev.end : cur.end;
          Object.assign(prev, {
            start: mergedStart,
            end: mergedEnd,
            ...(ns1 ? { sectionStart: ns1, sectionEnd: ns2 } : {}),
            ...(finalLoc ? { location: finalLoc } : {}),
            title: ns1 ? rebuildSectionSlotTitle(prev.title, finalLoc, ns1, ns2) : prev.title,
            hideClock: Boolean(prev.hideClock && cur.hideClock),
            bellCalibrated: Boolean(prev.bellCalibrated || cur.bellCalibrated)
          });
          continue;
        }
      }
      coalesced.push(cur);
    }

    const scoreSlot = s => (s.bellCalibrated ? 8 : 0) + (s.hideClock === false ? 4 : 0) + (s.location ? 3 : 0) + (s.sectionStart ? 2 : 0) + (String(s.title || '').length > 4 ? 1 : 0);
    let addedCount = 0, upgradedCount = 0;

    for (const cur of coalesced) {
      const curDay = cur.day || fmtDate(cur.start);
      const curKey = canonicalCourseKey(cur.title);
      const curS = Date.parse(cur.start), curE = Date.parse(cur.end);
      const curRng = extractSectionRange(cur);
      let matchedIdx = -1;
      for (let i = 0; i < list.length; i++) {
        const ex = list[i];
        const exDay = ex.day || fmtDate(ex.start);
        if (exDay !== curDay) continue;
        if (ex.start === cur.start && ex.end === cur.end && (ex.title || '') === (cur.title || '')) {
          matchedIdx = i;
          break;
        }
        const exKey = canonicalCourseKey(ex.title);
        if (!curKey || !exKey || curKey !== exKey) continue;
        const exRng = extractSectionRange(ex);
        const exS = Date.parse(ex.start), exE = Date.parse(ex.end);
        const secOverlap = curRng && exRng && curRng.s1 <= exRng.s2 && curRng.s2 >= exRng.s1;
        const clockOverlap = Number.isFinite(curS) && Number.isFinite(exS) && (Math.min(curE, exE) - Math.max(curS, exS)) >= 15 * 60000;
        const uncalibratedSamePeriod = (cur.hideClock || ex.hideClock) && cur.period && ex.period && cur.period === ex.period;
        if (secOverlap || clockOverlap || uncalibratedSamePeriod) {
          matchedIdx = i;
          break;
        }
      }
      if (matchedIdx >= 0) {
        const prev = list[matchedIdx];
        if (scoreSlot(cur) >= scoreSlot(prev)) {
          list[matchedIdx] = {
            ...prev,
            ...cur,
            location: cur.location || prev.location || '',
            checked: prev.checked !== false && cur.checked !== false
          };
          upgradedCount++;
        }
      } else {
        list.push(cur);
        addedCount++;
      }
    }

    let outSlots = list;
    let calibratedCount = 0;
    if (Array.isArray(bellSchedule) && bellSchedule.length) {
      const cal = applyBellScheduleToSlots(outSlots, bellSchedule);
      outSlots = cal.slots;
      calibratedCount = cal.calibratedCount;
    }
    return { slots: outSlots, addedCount, upgradedCount, calibratedCount };
  }

  function dedupeTasksList(existingTasks = [], incomingTasks = []) {
    const seen = new Set();
    for (const t of Array.isArray(existingTasks) ? existingTasks : []) {
      if (!t || t.completed || t.archived || t.kind === 'habit') continue;
      const dueStr = t.due || (t.deadline ? fmtDate(t.deadline) : '');
      const k = canonicalTaskKey(t.title) + '|' + dueStr;
      if (canonicalTaskKey(t.title)) seen.add(k);
    }
    const unique = [];
    let skipped = 0;
    for (const t of Array.isArray(incomingTasks) ? incomingTasks : []) {
      if (!t || typeof t !== 'object') continue;
      const dueStr = t.due || (t.deadline ? fmtDate(t.deadline) : '');
      const tk = canonicalTaskKey(t.title);
      if (!tk) continue;
      const k = tk + '|' + dueStr;
      if (seen.has(k)) { skipped++; continue; }
      seen.add(k);
      unique.push(t);
    }
    return { tasks: unique, skipped };
  }

  function extractSectionRange(slotOrTitle) {
    if (!slotOrTitle) return null;
    if (typeof slotOrTitle === 'object') {
      const a = Number(slotOrTitle.sectionStart);
      const b = Number(slotOrTitle.sectionEnd || a);
      if (Number.isInteger(a) && a >= 1 && a <= 16) {
        return { s1: a, s2: Math.max(a, Math.min(16, Number.isInteger(b) ? b : a)) };
      }
      slotOrTitle = slotOrTitle.title || '';
    }
    const clean = String(slotOrTitle || '').replace(/[（(][^）)]*\d{1,2}:\d{2}[^）)]*[)）]/g, '');
    const m = clean.match(/(?:第\s*)?(\d{1,2})(?:\s*[-~到至,，]\s*(\d{1,2}))?\s*节/);
    if (!m) return null;
    const s1 = Number(m[1]);
    const s2 = Number(m[2] || m[1]);
    if (!Number.isInteger(s1) || s1 < 1 || s1 > 16) return null;
    return { s1, s2: Math.max(s1, Math.min(16, s2)) };
  }

  function applyBellScheduleToSlots(slots, bellSchedule) {
    const bell = normalizeBellEntries(bellSchedule);
    if (!bell.length || !Array.isArray(slots)) {
      return { slots: Array.isArray(slots) ? [...slots] : [], calibratedCount: 0 };
    }
    const bySec = new Map(bell.map(b => [b.section, b]));
    let calibratedCount = 0;
    const updated = slots.map(slot => {
      if (!slot || typeof slot !== 'object') return slot;
      const rng = extractSectionRange(slot);
      if (!rng) return slot;
      const b1 = bySec.get(rng.s1);
      const b2 = bySec.get(rng.s2);
      if (!b1 || !b2) return slot;
      const st = parseClockHM(b1.start);
      const en = parseClockHM(b2.end);
      if (!st || !en || en.total <= st.total) return slot;

      const base = slot.day && /^\d{4}-\d{2}-\d{2}$/.test(slot.day)
        ? slot.day.split('-').map(Number)
        : (() => { const d = new Date(slot.start); return [d.getFullYear(), d.getMonth() + 1, d.getDate()]; })();
      const sDt = new Date(base[0], base[1] - 1, base[2], st.h, st.m, 0, 0);
      const eDt = new Date(base[0], base[1] - 1, base[2], en.h, en.m, 0, 0);
      calibratedCount++;
      return {
        ...slot,
        start: sDt.toISOString(),
        end: eDt.toISOString(),
        day: fmtDate(sDt),
        period: periodOfMinute(st.total),
        sectionStart: rng.s1,
        sectionEnd: rng.s2,
        hideClock: false,
        bellCalibrated: true
      };
    });
    return { slots: updated, calibratedCount };
  }

  function parseBellSchedule(text) {
    const raw = String(text || '').trim();
    if (!raw) return { bellSchedule: [], matchedLines: new Set() };
    const lines = raw.split(/\r?\n|[；;]+/).map(s => s.trim()).filter(Boolean);
    const entries = [];
    const matchedLines = new Set();
    let pending = null;

    const flushPending = () => {
      if (!pending || !pending.ranges.length) { pending = null; return; }
      if (pending.ranges.length >= 2) {
        const startSec = pending.s1;
        pending.ranges.forEach((rg, idx) => {
          const sec = Math.min(16, startSec + idx);
          entries.push({ section: sec, start: rg.start.text, end: rg.end.text, period: periodOfMinute(rg.start.total) });
        });
      } else {
        const rg = pending.ranges[0];
        let s2 = pending.s2;
        if (pending.isMajor && pending.s1 === 9 && rg.dur >= 120) s2 = 11;
        for (const item of expandBellSpan(pending.s1, s2, rg.start.total, rg.end.total)) {
          entries.push(item);
        }
      }
      pending = null;
    };

    const isBreakOnly = l => /(?:大?课间|午休|休息|早操|晚点名|眼保健操|静校)/.test(l) && !/第?\s*[一二三四五六\d]+\s*[大]?节/.test(l);
    const looksLikeCourse = l => /(?:每周|星期|周[一二三四五六日天]|[（(][A-Za-z\u4e00-\u9fff]*\d{2,})/.test(l) && !/作息|大节/.test(l);

    lines.forEach((line, idx) => {
      if (/^【(?:文件|已按课表)/.test(line) || isBreakOnly(line) || looksLikeCourse(line)) return;
      const ranges = extractTimeRanges(line);
      const cleanForSec = line.replace(/\d{1,2}[:：.]\d{2}\s*[-~—–到至]+\s*\d{1,2}[:：.]\d{2}/g, ' ').replace(/\d{4}\s*年/g, ' ');
      const smallM = cleanForSec.match(/(?:第\s*)?(\d{1,2})(?:\s*[-~到至,，]\s*(\d{1,2}))?\s*节/);
      const majorM = cleanForSec.match(/第?\s*([一二三四五六1-6])\s*大节/);
      const leadDigitM = !smallM && !majorM && ranges.length
        ? line.match(/^(?:[第(\[（]\s*)?(\d{1,2})(?:[)\]）.\s、]+)(?=\d{1,2}[:：.]\d{2})/)
        : null;

      let s1 = null, s2 = null, isMajor = false;
      if (smallM) {
        s1 = Number(smallM[1]);
        s2 = Number(smallM[2] || smallM[1]);
      } else if (leadDigitM) {
        const n = Number(leadDigitM[1]);
        if (n >= 1 && n <= 16) { s1 = s2 = n; }
      } else if (majorM) {
        const mj = MAJOR_SEC_CN[majorM[1]];
        if (mj) {
          s1 = (mj - 1) * 2 + 1;
          s2 = s1 + 1;
          isMajor = true;
        }
      }

      if (s1 !== null && ranges.length) {
        flushPending();
        matchedLines.add(idx);
        if (ranges.length >= 2) {
          ranges.forEach((rg, rIdx) => {
            const sec = Math.min(16, s1 + rIdx);
            entries.push({ section: sec, start: rg.start.text, end: rg.end.text, period: periodOfMinute(rg.start.total) });
          });
        } else {
          const rg = ranges[0];
          let hi = Math.max(s1, s2 || s1);
          if (isMajor && s1 === 9 && rg.dur >= 120) hi = 11;
          for (const item of expandBellSpan(s1, hi, rg.start.total, rg.end.total)) {
            entries.push(item);
          }
        }
        return;
      }

      if (s1 !== null && !ranges.length) {
        flushPending();
        pending = { s1, s2: Math.max(s1, s2 || s1), isMajor, ranges: [], ttl: 3 };
        matchedLines.add(idx);
        return;
      }

      if (pending && ranges.length && !smallM && !majorM) {
        for (const rg of ranges) {
          if (rg.dur >= 30 && rg.start.total >= 6 * 60) pending.ranges.push(rg);
        }
        matchedLines.add(idx);
        if (!pending.isMajor || pending.ranges.length >= 2) flushPending();
        return;
      }

      if (pending) {
        pending.ttl--;
        if (pending.ttl <= 0) flushPending();
      }
    });
    flushPending();

    let normalized = normalizeBellEntries(entries);
    if (normalized.length < 2 && /作息|上下课|教学.*时间|节次/.test(raw)) {
      const pureRanges = [];
      const pureIdx = [];
      lines.forEach((line, idx) => {
        if (isBreakOnly(line) || looksLikeCourse(line)) return;
        const rgs = extractTimeRanges(line).filter(r => r.dur >= 35 && r.dur <= 180 && r.start.total >= 6 * 60);
        if (rgs.length && line.replace(/\d{1,2}[:：.]\d{2}|\s|[-~—–到至]/g, '').length <= 8) {
          for (const r of rgs) pureRanges.push(r);
          pureIdx.push(idx);
        }
      });
      if (pureRanges.length >= 4 && pureRanges.length <= 16) {
        const autoEntries = [];
        let cursor = 1;
        for (const r of pureRanges) {
          const step = r.dur >= 120 ? 3 : (r.dur >= 75 ? 2 : 1);
          for (const item of expandBellSpan(cursor, cursor + step - 1, r.start.total, r.end.total)) {
            autoEntries.push(item);
          }
          cursor += step;
        }
        normalized = normalizeBellEntries(autoEntries);
        pureIdx.forEach(i => matchedLines.add(i));
      }
    }

    return { bellSchedule: normalized, matchedLines };
  }

  function cnNumber(s) {
    if (/^\d+(?:\.\d+)?$/.test(s)) return Number(s);
    const map = { 半: 0.5, 一: 1, 两: 2, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10 };
    if (map[s] != null) return map[s];
    if (/^十[一二三四五六七八九]$/.test(s)) return 10 + (map[s[1]] || 0);
    return 0;
  }

  function unescapeICS(val) {
    return String(val || '')
      .replace(/\\n/gi, '\n')
      .replace(/\\,/g, ',')
      .replace(/\\;/g, ';')
      .replace(/\\\\/g, '\\')
      .trim();
  }

  function parseICSDate(raw) {
    if (!raw) return null;
    const val = String(raw).trim();
    const m = val.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?$/);
    if (!m) return null;
    const [, y, mo, d, hh, mm, ss, z] = m;
    if (hh === undefined) {
      return { date: new Date(+y, +mo - 1, +d, 0, 0, 0, 0), allDay: true };
    }
    if (z === 'Z') {
      return { date: new Date(Date.UTC(+y, +mo - 1, +d, +hh, +mm, +(ss || 0))), allDay: false };
    }
    return { date: new Date(+y, +mo - 1, +d, +hh, +mm, +(ss || 0)), allDay: false };
  }

  function parseICSDurationMs(dur) {
    const m = String(dur || '').match(/^P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/i);
    if (!m) return 0;
    const w = +(m[1] || 0), d = +(m[2] || 0), h = +(m[3] || 0), mi = +(m[4] || 0), s = +(m[5] || 0);
    return (((w * 7 + d) * 24 + h) * 60 + mi) * 60000 + s * 1000;
  }

  function parseICS(text, { now = new Date(), days = 14 } = {}) {
    const raw = String(text || '');
    if (!raw.trim()) throw Error('请选择非空的 .ics 课表文件。');
    if (!/BEGIN:VCALENDAR|BEGIN:VEVENT/i.test(raw)) throw Error('文件内容不是有效的 .ics 日历格式。');

    const unfolded = raw.replace(/\r\n[ \t]|\n[ \t]/g, '');
    const lines = unfolded.split(/\r?\n/);
    const windowStart = atDay(now, -2, 0, 0).getTime();
    const windowEnd = atDay(now, days + 1, 23, 59).getTime();
    const blockedSlots = [];
    const warnings = [];
    let cur = null;

    for (const line of lines) {
      if (line === 'BEGIN:VEVENT') { cur = { exdates: new Set() }; continue; }
      if (line === 'END:VEVENT') {
        if (cur && cur.dtstart) {
          const parsedStart = parseICSDate(cur.dtstart);
          if (parsedStart && !parsedStart.allDay) {
            const parsedEnd = cur.dtend ? parseICSDate(cur.dtend) : null;
            const durMs = parsedEnd ? (parsedEnd.date.getTime() - parsedStart.date.getTime()) : (parseICSDurationMs(cur.duration) || 90 * 60000);
            if (durMs > 0 && durMs <= 14 * 3600000) {
              const title = unescapeICS(cur.summary || '课程 / 日程').slice(0, 120);
              const location = unescapeICS(cur.location || '').slice(0, 80);
              const pushInstance = startMs => {
                const endMs = startMs + durMs;
                if (endMs <= windowStart || startMs >= windowEnd) return;
                const dKey = fmtDate(startMs);
                if (cur.exdates.has(dKey)) return;
                const sDate = new Date(startMs);
                blockedSlots.push({
                  start: sDate.toISOString(),
                  end: new Date(endMs).toISOString(),
                  title: location ? `${title} (${location})` : title,
                  location,
                  day: dKey,
                  period: periodOfHour(sDate.getHours(), sDate.getMinutes()),
                  source: 'ics'
                });
              };

              if (cur.rrule && /FREQ=WEEKLY/i.test(cur.rrule)) {
                const interval = Math.max(1, Number((cur.rrule.match(/INTERVAL=(\d+)/i) || [])[1] || 1));
                const countRaw = (cur.rrule.match(/COUNT=(\d+)/i) || [])[1];
                const countMax = countRaw ? Math.min(200, Number(countRaw)) : 60;
                const untilRaw = (cur.rrule.match(/UNTIL=([0-9TZ]+)/i) || [])[1];
                const untilMs = untilRaw ? (parseICSDate(untilRaw)?.date.getTime() ?? windowEnd) : windowEnd;
                const bydayMatch = (cur.rrule.match(/BYDAY=([A-Z,]+)/i) || [])[1];
                const targetDays = bydayMatch
                  ? bydayMatch.split(',').map(x => ICS_BYDAY[x.slice(-2)]).filter(v => v !== undefined)
                  : [parsedStart.date.getDay()];

                const baseStart = parsedStart.date;
                const hh = baseStart.getHours(), mm = baseStart.getMinutes(), ss = baseStart.getSeconds();
                let emitted = 0;
                const baseWeekStart = atDay(baseStart, -((baseStart.getDay() + 6) % 7)).getTime();
                for (let w = 0; w < 40 && emitted < countMax; w += interval) {
                  const wStartMs = baseWeekStart + w * 7 * DAY_MS;
                  if (wStartMs > Math.min(windowEnd, untilMs) + 7 * DAY_MS) break;
                  for (let offset = 0; offset < 7 && emitted < countMax; offset++) {
                    const inst = new Date(wStartMs + offset * DAY_MS);
                    inst.setHours(hh, mm, ss, 0);
                    const instMs = inst.getTime();
                    if (instMs < baseStart.getTime() - 1000) continue;
                    if (!targetDays.includes(inst.getDay())) continue;
                    if (instMs > untilMs) break;
                    emitted++;
                    pushInstance(instMs);
                  }
                }
              } else {
                pushInstance(parsedStart.date.getTime());
              }
            }
          }
        }
        cur = null;
        continue;
      }
      if (!cur) continue;
      const idx = line.indexOf(':');
      if (idx < 0) continue;
      const rawKey = line.slice(0, idx).toUpperCase();
      const key = rawKey.split(';')[0];
      const val = line.slice(idx + 1);
      if (key === 'SUMMARY') cur.summary = val;
      else if (key === 'LOCATION') cur.location = val;
      else if (key === 'DTSTART') cur.dtstart = val;
      else if (key === 'DTEND') cur.dtend = val;
      else if (key === 'DURATION') cur.duration = val;
      else if (key === 'RRULE') cur.rrule = val;
      else if (key === 'EXDATE') {
        for (const item of val.split(',')) {
          const p = parseICSDate(item);
          if (p) cur.exdates.add(fmtDate(p.date));
        }
      }
    }

    blockedSlots.sort((a, b) => Date.parse(a.start) - Date.parse(b.start));
    if (!blockedSlots.length) {
      warnings.push('所选 .ics 文件在未来 14 天内没有带具体钟点的课程或活动。');
    }
    return {
      format: 'ics',
      blockedSlots,
      tasks: [],
      dayAdjustments: [],
      warnings,
      summary: `从日历导入 ${blockedSlots.length} 节课程 / 固定日程`
    };
  }

  function resolveClockTime(hourRaw, minRaw, hint) {
    let h = Number(hourRaw);
    const m = minRaw === '半' ? 30 : (minRaw ? Number(minRaw) : 0);
    if (!Number.isInteger(h) || h < 0 || h > 23 || !Number.isInteger(m) || m < 0 || m > 59) return null;
    if (/下午|午后/.test(hint || '') && h >= 1 && h <= 7) h += 12;
    else if (/晚上|晚间|今晚|明晚|夜/.test(hint || '') && h >= 5 && h <= 11) h += 12;
    else if (/中午/.test(hint || '') && h >= 1 && h <= 3) h += 12;
    return [h, m];
  }

  function resolveDayOffsets(segment, now, days) {
    const absYmd = segment.match(/(\d{4})[-/年](\d{1,2})[-/月](\d{1,2})日?/);
    const absMd = segment.match(/(\d{1,2})月(\d{1,2})日?/) || segment.replace(/\d{1,2}\s*[-~到至]\s*\d{1,2}\s*节/g, '').match(/(?:^|\s)(\d{1,2})[-/](\d{1,2})(?=$|\s|[，。；])/);
    const abs = absYmd || absMd;
    if (abs) {
      const y = absYmd ? Number(absYmd[1]) : now.getFullYear();
      const m = absYmd ? Number(absYmd[2]) : Number(abs[1]);
      const d = absYmd ? Number(absYmd[3]) : Number(abs[2]);
      const target = new Date(y, m - 1, d, 0, 0, 0, 0);
      const diff = Math.round((target.getTime() - atDay(now, 0).getTime()) / DAY_MS);
      return diff >= -2 && diff <= days ? [diff] : [];
    }
    if (/明天|明晚|明早/.test(segment)) return [1];
    if (/后天/.test(segment)) return [2];
    if (/今天|今晚|今早/.test(segment)) return [0];

    const wk = segment.match(/(每)?(下周|本周|星期|礼拜|周)([一二三四五六日天1-7])/);
    if (wk) {
      const targetDow = WEEK_MAP[wk[3]];
      const curDow = now.getDay() || 7;
      let delta = targetDow - curDow;
      if (wk[2] === '下周') delta += 7;
      else if (delta < 0 && wk[2] !== '本周') delta += 7;
      const isRecurring = Boolean(wk[1]) || (/节|课/.test(segment) && wk[2] !== '本周' && wk[2] !== '下周');
      if (!isRecurring) return delta <= days ? [delta] : [];
      const offsets = [];
      for (let d = delta; d <= days; d += 7) {
        if (d >= 0) offsets.push(d);
      }
      return offsets;
    }
    return null;
  }

  function extractEstimateMinutes(text) {
    const clean = text.replace(/(\d{1,2})[:：点时](\d{1,2}|半)?\s*[-~到至]/g, '');
    const m = clean.match(/(?:约|预计|需要|大概|用时|耗时|共|有)?\s*([一两二三四五六七八九十半\d]+(?:\.\d+)?)\s*(?:个)?\s*(小时|分钟|min)/i);
    if (m) {
      const val = cnNumber(m[1]);
      if (val && val > 0) {
        const mins = Math.round(val * (/小时/.test(m[2]) ? 60 : 1));
        return { minutes: Math.max(10, Math.min(1440, mins)), inferred: false };
      }
    }
    if (/大块|分几次/.test(clean)) return { minutes: 150, inferred: true };
    if (/随手|一小会|片刻/.test(clean)) return { minutes: 30, inferred: true };
    return { minutes: 60, inferred: true };
  }

  function parseNoteOrTimetable(text, { now = new Date(), days = 126, bellSchedule = [] } = {}) {
    const raw = String(text || '').trim();
    if (!raw) throw Error('请先输入或粘贴课表文本、便签内容。');
    if (raw.length > 16000) throw Error('导入或合并文本请控制在 16000 字以内。');

    const bellParse = parseBellSchedule(raw);
    const bellScheduleOut = bellParse.bellSchedule;
    const effectiveBell = normalizeBellEntries([...(Array.isArray(bellSchedule) ? bellSchedule : []), ...bellScheduleOut]);
    const bellMap = new Map(effectiveBell.map(b => [b.section, b]));

    const lines = raw.split(/\r?\n|[；;]+/).map(s => s.replace(/^[\s\-*•·\d.、]+(?=\D)/, '').trim()).filter(Boolean);
    let blockedSlots = [];
    const tasks = [];
    const dayAdjustments = [];

    for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
      const line = lines[lineIdx].replace(/\[第\d+格\]\s*/g, '');
      if (/^【(?:文件|已按课表)/.test(line)) continue;
      if (bellParse.matchedLines.has(lineIdx)) continue;
      if (bellScheduleOut.length >= 2 && (/^(?:注[：:]|自\d{4}|.*教学作息|.*作息时间|上午|中午|下午|晚上|晚间|大课间|午休|休息|时间表|节次)$/.test(line) || /学期开始执行|大课间|午休时间/.test(line))) continue;
      // 1) Availability adjustments: "今晚只剩90分钟" / "今晚8点后才能学" / "今晚挺累只保底" / "明天上午有空2小时"
      const availDur = line.match(/(今天|今晚|明天|明晚|后天)?(?:上午|中午|下午|晚上|晚自习)?(?:只有|只剩|剩|空出|有空|可学)\s*([一两二三四五六七八九十半\d]+(?:\.\d+)?)\s*(?:个)?\s*(小时|分钟|min)/i);
      const afterTime = line.match(/(今天|今晚|明天|明晚|后天)?\s*(上午|中午|下午|晚上|晚)?\s*(\d{1,2})[:：点时](\d{1,2}|半)?\s*(?:以后|之后|后)(?:才能|可以|才)(?:学习|开始|自习|学)/);
      const restLowEnergy = /(今天|今晚|明天|明晚|后天)?(?:挺累|太累|很累|不想学|只保底|只想休息|早点休息|休息一[下晚])/.test(line)
        && !/作业|复习|预习|论文|报告|交|考|课|第?\d+节/.test(line);
      if (availDur || afterTime || restLowEnergy) {
        const offsets = resolveDayOffsets(line, now, days) || [0];
        const offset = offsets[0] ?? 0;
        const dayStr = fmtDate(atDay(now, offset));
        let mins = 90;
        let startHour = 19;
        let startMin = 0;
        if (availDur) {
          const val = cnNumber(availDur[2]);
          mins = Math.max(15, Math.min(720, Math.round(val * (/小时/.test(availDur[3]) ? 60 : 1))));
        } else if (afterTime) {
          const t = resolveClockTime(afterTime[3], afterTime[4], (afterTime[1] || '') + (afterTime[2] || '晚上'));
          if (t) {
            [startHour, startMin] = t;
            mins = Math.max(30, (22 * 60 + 30) - (startHour * 60 + startMin));
          }
        } else if (/只想休息|早点休息|不想学/.test(line)) {
          mins = 45;
        }
        dayAdjustments.push({ day: dayStr, totalMinutes: mins, startHour, startMin, note: line.slice(0, 120) });
        continue;
      }

      // 2) Course sections, period-based courses, or explicit time-range fixed block (classes / meetings)
      const secMatch = line.match(/第?\s*(\d{1,2})(?:\s*[-~到至,，]\s*(\d{1,2}))?\s*节/);
      const timeRange = line.match(/(上午|早上|早|中午|下午|晚上|晚间|晚)?\s*(\d{1,2})[:：点时](\d{1,2}|半)?\s*[-~到至]\s*(上午|中午|下午|晚上|晚间|晚)?\s*(\d{1,2})[:：点时](\d{1,2}|半)?/);
      const periodHintMatch = line.match(/(上午|早上|早|中午|下午|晚上|晚间|今晚|明晚|明早)/);
      const hasWeekdayExpr = /(每)?(下周|本周|星期|礼拜|周)[一二三四五六日天1-7]/.test(line);
      const isClassOrMeeting = /课|班会|例会|组会|开会|实验|实习|体育|讲座/.test(line);
      const isTaskKeyword = /作业|复习|预习|论文|报告|刷题|背诵|默写|作文|交|准备|完成|截止|ddl|考/i.test(line);

      if (secMatch || (timeRange && !/约|小时|分钟/.test(timeRange[0])) || ((periodHintMatch || hasWeekdayExpr) && isClassOrMeeting && !isTaskKeyword)) {
        let offsets = resolveDayOffsets(line, now, days);
        if (!offsets) offsets = [0];
        let sh, sm, eh, em;
        let explicitPeriod = '';
        let hideClock = false;
        if (secMatch) {
          const s1 = Math.max(1, Math.min(16, Number(secMatch[1])));
          const s2 = Math.max(s1, Math.min(16, Number(secMatch[2] || s1)));
          const b1 = bellMap.get(s1), b2 = bellMap.get(s2);
          const p1 = b1 ? parseClockHM(b1.start) : null;
          const p2 = b2 ? parseClockHM(b2.end) : null;
          if (p1 && p2 && p2.total > p1.total) {
            [sh, sm] = [p1.h, p1.m];
            [eh, em] = [p2.h, p2.m];
            hideClock = false;
          } else {
            [sh, sm] = SECTION_START[s1] || [8, 0];
            [eh, em] = SECTION_END[s2] || [sh + 1, 40];
            hideClock = true;
          }
        } else if (timeRange) {
          const hintA = timeRange[1] || (line.match(/上午|中午|下午|晚上|今晚|明晚/) || [])[0] || '';
          const hintB = timeRange[4] || hintA;
          const a = resolveClockTime(timeRange[2], timeRange[3], hintA);
          let b = resolveClockTime(timeRange[5], timeRange[6], hintB);
          if (a && b) {
            [sh, sm] = a;
            [eh, em] = b;
            if (eh * 60 + em <= sh * 60 + sm && eh < 12) eh += 12;
          }
        } else if (periodHintMatch) {
          const pWord = periodHintMatch[1];
          const pMap = { 上午: [9, 0, 11, 0, 'morning'], 早上: [8, 30, 10, 30, 'morning'], 早: [8, 30, 10, 30, 'morning'], 明早: [8, 30, 10, 30, 'morning'], 中午: [12, 30, 13, 30, 'noon'], 下午: [14, 30, 16, 30, 'afternoon'], 晚上: [19, 0, 21, 0, 'evening'], 晚间: [19, 0, 21, 0, 'evening'], 晚: [19, 0, 21, 0, 'evening'], 今晚: [19, 0, 21, 0, 'evening'], 明晚: [19, 0, 21, 0, 'evening'] };
          const hit = pMap[pWord] || [14, 30, 16, 30, 'afternoon'];
          [sh, sm, eh, em, explicitPeriod] = hit;
          hideClock = true;
        } else {
          [sh, sm, eh, em, explicitPeriod] = [9, 0, 10, 40, 'morning'];
          hideClock = true;
        }
        if (sh !== undefined && eh !== undefined && (eh * 60 + em > sh * 60 + sm)) {
          let title = line
            .replace(/(每)?(下周|本周|星期|礼拜|周)[一二三四五六日天1-7]/g, '')
            .replace(/今天|今晚|明天|明晚|后天|上午|中午|下午|晚上|晚间/g, '')
            .replace(/第?\s*\d{1,2}(?:\s*[-~到至,，]\s*\d{1,2})?\s*节/g, '')
            .replace(/\d{1,2}[:：点时](?:\d{1,2}|半)?\s*[-~到至]\s*(?:上午|中午|下午|晚上)?\s*\d{1,2}[:：点时](?:\d{1,2}|半)?/g, '')
            .replace(/^\s*[,，:：·\-]+\s*/, '')
            .trim();
          if (!title) title = secMatch ? `第${secMatch[1]}${secMatch[2] ? '-' + secMatch[2] : ''}节课程` : '固定日程';
          if (secMatch) title = `${title} · ${secMatch[1]}${secMatch[2] ? '-' + secMatch[2] : ''}节`;

          const secS1 = secMatch ? Math.max(1, Math.min(16, Number(secMatch[1]))) : undefined;
          const secS2 = secMatch ? Math.max(secS1, Math.min(16, Number(secMatch[2] || secS1))) : undefined;
          const matchedBell = Boolean(secMatch && !hideClock && bellMap.has(secS1));
          for (const offset of offsets) {
            const sDt = atDay(now, offset, sh, sm);
            const eDt = atDay(now, offset, eh, em);
            blockedSlots.push({
              start: sDt.toISOString(),
              end: eDt.toISOString(),
              title: title.slice(0, 120),
              day: fmtDate(sDt),
              period: matchedBell ? periodOfHour(sh, sm) : (explicitPeriod || periodOfHour(sh, sm)),
              ...(secS1 ? { sectionStart: secS1, sectionEnd: secS2 } : {}),
              hideClock,
              ...(matchedBell ? { bellCalibrated: true } : {}),
              source: 'note'
            });
          }
          continue;
        }
      }

      // 3) Study task / DDL
      if (isTaskKeyword || line.length >= 2) {
        const offsets = resolveDayOffsets(line, now, days);
        const targetOffset = offsets && offsets.length ? offsets[0] : null;
        const deadlineDate = targetOffset !== null ? atDay(now, targetOffset, 22, 0) : null;
        const est = extractEstimateMinutes(line);
        const urgent = /期末|考试|答辩|紧急|必须|重要|截止|ddl|今天|今晚|明天/i.test(line);
        const cleanTitle = line
          .replace(/(?:预计|需要|大概|用时|耗时|共|约)?\s*[一两二三四五六七八九十半\d]+(?:\.\d+)?\s*(?:个)?\s*(?:小时|分钟|min)/gi, '')
          .replace(/\s*(?:大块分几次做|随手就能做|坐一会能完)\s*/g, ' ')
          .replace(/[,，]\s*$/, '')
          .trim()
          .slice(0, 120);

        tasks.push({
          title: cleanTitle || line.slice(0, 120),
          deadline: deadlineDate ? deadlineDate.toISOString() : '',
          due: deadlineDate ? fmtDate(deadlineDate) : '',
          estimateMinutes: est.minutes,
          estInferred: est.inferred,
          priority: urgent ? 'high' : 'medium',
          schedulePriority: urgent ? 'high' : 'medium',
          splittable: true,
          minChunk: 25,
          notes: '由便签快速识别：' + line
        });
      }
    }

    blockedSlots = mergeBlockedSlots([], blockedSlots).slots;
    const uniqueTasks = dedupeTasksList([], tasks).tasks;

    return {
      format: 'note',
      blockedSlots,
      tasks: uniqueTasks,
      dayAdjustments,
      bellSchedule: bellScheduleOut,
      warnings: [],
      summary: (bellScheduleOut.length && !blockedSlots.length && !uniqueTasks.length)
        ? `识别出 ${bellScheduleOut.length} 个作息节次，可一键校准已导入课程的上下课时间`
        : `${bellScheduleOut.length ? `已按 ${bellScheduleOut.length} 个作息节次同步 · ` : ''}识别出 ${blockedSlots.length} 条课程/固定日程、${uniqueTasks.length} 项任务、${dayAdjustments.length} 条时间调整`
    };
  }

  function parseHeaderDay(raw, allowSingleChar = false) {
    const s = String(raw || '').replace(/\s+/g, '');
    const m = s.match(/^(?:星期|礼拜|周)([一二三四五六日天1-7])(?:[（(]?\d{1,2}(?:[./\-月]\d{1,2}日?)?[)）]?)?$/);
    if (m) return WEEK_MAP[m[1]] || 0;
    const en = s.match(/^(?:mon|monday|tue|tuesday|wed|wednesday|thu|thursday|fri|friday|sat|saturday|sun|sunday)$/i);
    if (en) {
      const k = en[1].slice(0, 3).toLowerCase();
      return ({ mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6, sun: 7 })[k] || 0;
    }
    if (allowSingleChar && /^[一二三四五六日天]$/.test(s)) return WEEK_MAP[s] || 0;
    return 0;
  }

  function reconstructTimetableFromOCR({ words = [], rows = [], imgW = 0, imgH = 0, fallbackText = '' } = {}) {
    const cleanFallback = normalizeOCRText(fallbackText);
    const items = (Array.isArray(words) ? words : [])
      .map(w => {
        const text = String(w?.text || '').trim();
        const x = Number(w?.x), y = Number(w?.y), wd = Number(w?.w), ht = Number(w?.h);
        if (!text || /^[oO口丨|｜_—\-]$/.test(text)) return null;
        if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(wd) || !Number.isFinite(ht) || wd <= 0 || ht <= 0) return null;
        return { text, x, y, w: wd, h: ht, cx: x + wd / 2, cy: y + ht / 2, right: x + wd, bottom: y + ht };
      })
      .filter(Boolean);

    if (items.length < 8) return { isGrid: false, cols: 0, text: cleanFallback };

    const W = Number(imgW) > 0 ? Number(imgW) : Math.max(...items.map(t => t.right));
    const H = Number(imgH) > 0 ? Number(imgH) : Math.max(...items.map(t => t.bottom));
    if (!W || !H) return { isGrid: false, cols: 0, text: cleanFallback };

    const hs = items.map(t => t.h).sort((a, b) => a - b);
    const medH = hs[Math.floor(hs.length / 2)] || 16;
    const median = arr => {
      if (!arr.length) return 0;
      const s = [...arr].sort((a, b) => a - b);
      const mid = Math.floor(s.length / 2);
      return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
    };

    // 1) Detect weekday header row in the top 34% of the image
    const topWords = items.filter(t => t.cy <= H * 0.34).sort((a, b) => a.cy - b.cy || a.x - b.x);
    const headerBands = [];
    for (const tok of topWords) {
      let band = headerBands.find(b => Math.abs(b.cy - tok.cy) <= Math.max(medH, tok.h) * 0.78);
      if (!band) { band = { cy: tok.cy, tokens: [] }; headerBands.push(band); }
      band.tokens.push(tok);
      band.cy = median(band.tokens.map(t => t.cy));
    }

    let bestCols = [];
    for (const band of headerBands) {
      const rowToks = [...band.tokens].sort((a, b) => a.x - b.x);
      const merged = [];
      for (const tok of rowToks) {
        const prev = merged[merged.length - 1];
        const gap = prev ? tok.x - prev.right : Infinity;
        if (prev && gap <= Math.max(prev.h * 0.95, W * 0.014) && !(parseHeaderDay(prev.text, true) && parseHeaderDay(tok.text, true))) {
          prev.text = (prev.text + tok.text).replace(/\s+/g, '');
          prev.right = Math.max(prev.right, tok.right);
          prev.bottom = Math.max(prev.bottom, tok.bottom);
          prev.y = Math.min(prev.y, tok.y);
          prev.w = prev.right - prev.x;
          prev.h = prev.bottom - prev.y;
          prev.cx = (prev.x + prev.right) / 2;
          prev.cy = (prev.y + prev.bottom) / 2;
        } else {
          merged.push({ ...tok });
        }
      }
      const explicitCols = merged.map(t => ({ ...t, day: parseHeaderDay(t.text, false) })).filter(t => t.day >= 1 && t.day <= 7);
      const singleCols = explicitCols.length >= 3 ? [] : merged.map(t => ({ ...t, day: parseHeaderDay(t.text, true) })).filter(t => t.day >= 1 && t.day <= 7);
      const cand = explicitCols.length >= 3 ? explicitCols : singleCols;
      if (cand.length < 3) continue;
      // Keep longest strictly monotonic weekday sequence left-to-right (supporting Sunday=7 first too)
      let mono = [];
      for (const c of cand) {
        if (!mono.length) { mono.push(c); continue; }
        const prevD = mono[mono.length - 1].day;
        const effPrev = (mono.length === 1 && prevD === 7) ? 0 : prevD;
        if (c.day > effPrev) mono.push(c);
      }
      // Interpolate missing weekday columns (e.g. 星期一/三/六 missed by OCR) from uniform column spacing
      if (mono.length >= 3 && mono.length < 7) {
        const pitches = [];
        for (let i = 0; i < mono.length; i++) {
          const di = (i === 0 && mono[0].day === 7) ? 0 : mono[i].day;
          for (let j = i + 1; j < mono.length; j++) {
            const dj = mono[j].day;
            if (dj > di) pitches.push((mono[j].cx - mono[i].cx) / (dj - di));
          }
        }
        const dayStep = median(pitches);
        if (dayStep && dayStep > W * 0.05) {
          const origins = mono.map((m, i) => m.cx - ((i === 0 && m.day === 7) ? 0 : m.day) * dayStep);
          const originCx = median(origins);
          const medBot = median(mono.map(m => m.bottom));
          const medTopY = median(mono.map(m => m.y));
          const byDay = new Map(mono.map(m => [m.day, m]));
          const seq = mono[0].day === 7 ? [7, 1, 2, 3, 4, 5, 6] : [1, 2, 3, 4, 5, 6, 7];
          const fullMono = [];
          seq.forEach((d, idx) => {
            const posIdx = seq[0] === 7 ? idx : d;
            if (byDay.has(d)) {
              fullMono.push(byDay.get(d));
            } else {
              const px = originCx + posIdx * dayStep;
              if (px >= W * 0.08 && px <= W * 0.96) {
                fullMono.push({ day: d, cx: px, x: px - 20, right: px + 20, w: 40, y: medTopY, h: medH, bottom: medBot, text: `星期${'日一二三四五六日'[d]}` });
              }
            }
          });
          if (fullMono.length > mono.length) mono = fullMono;
        }
      }
      if (mono.length > bestCols.length) bestCols = mono;
    }

    if (bestCols.length < 4) {
      // Horizontal row-based timetable fallback (e.g. 星期一..星期五 stacked on left edge)
      const leftToks = items.filter(t => t.cx <= W * 0.16).sort((a, b) => a.cy - b.cy || a.x - b.x);
      const rowBands = [];
      for (const tok of leftToks) {
        let band = rowBands.find(b => Math.abs(b.cy - tok.cy) <= Math.max(medH, tok.h) * 0.55);
        if (!band) { band = { cy: tok.cy, tokens: [] }; rowBands.push(band); }
        band.tokens.push(tok);
        band.cy = median(band.tokens.map(t => t.cy));
      }
      const dayCands = [];
      for (const b of rowBands) {
        const toks = [...b.tokens].sort((a, b) => a.x - b.x);
        const joined = toks.map(t => t.text).join('').replace(/\s+/g, '');
        let d = parseHeaderDay(joined.replace(/^(?:犀|星)(?:期|其)/, '星期'), false);
        if (!d && /^(?:星期|犀期|星其)=$/.test(joined)) d = 3;
        if (d >= 1 && d <= 7) {
          dayCands.push({ day: d, cy: b.cy, right: Math.max(...toks.map(t => t.right)) });
        }
      }
      const dayRows = [];
      for (const c of dayCands) {
        if (!dayRows.length) { dayRows.push(c); continue; }
        const prev = dayRows[dayRows.length - 1];
        const prevD = prev.day;
        const effPrev = (dayRows.length === 1 && prevD === 7) ? 0 : prevD;
        if (c.day > effPrev) dayRows.push(c);
        else if (c.day === prevD && (c.cy - prev.cy) >= medH * 2.5 && prevD < 7) dayRows.push({ ...c, day: prevD + 1 });
      }
      if (dayRows.length >= 2) {
        const rDiffs = [];
        for (let i = 1; i < dayRows.length; i++) rDiffs.push(dayRows[i].cy - dayRows[i - 1].cy);
        const rStep = median(rDiffs) || (H / 5);
        // Extrapolate missing top/bottom weekday rows (e.g. 星期一 or 星期五) so full week is preserved
        while (dayRows[0].day > 1 && (dayRows[0].cy - rStep) >= rStep * 0.25) {
          const firstR = dayRows[0];
          dayRows.unshift({ day: firstR.day - 1, cy: firstR.cy - rStep, right: firstR.right });
        }
        while (dayRows[dayRows.length - 1].day < 5 && (dayRows[dayRows.length - 1].cy + rStep) <= H - rStep * 0.25) {
          const lastR = dayRows[dayRows.length - 1];
          dayRows.push({ day: lastR.day + 1, cy: lastR.cy + rStep, right: lastR.right });
        }
        const axisRight = Math.max(...dayRows.map(r => r.right));
        const WEEK_CN_H = ['', '一', '二', '三', '四', '五', '六', '日'];
        const rawCells = [];
        for (let rIdx = 0; rIdx < dayRows.length; rIdx++) {
          const dr = dayRows[rIdx];
          const top = rIdx === 0 ? Math.max(0, dr.cy - rStep * 0.5) : (dayRows[rIdx - 1].cy + dr.cy) / 2;
          const bot = rIdx === dayRows.length - 1 ? Math.min(H, dr.cy + rStep * 0.55) : (dr.cy + dayRows[rIdx + 1].cy) / 2;
          const rToks = items.filter(t => t.cx > axisRight + 4 && t.cy >= top && t.cy <= bot).sort((a, b) => a.x - b.x);
          if (!rToks.length) continue;
          const cells = [];
          for (const tok of rToks) {
            const cur = cells[cells.length - 1];
            if (!cur || tok.x - cur.right > Math.max(W * 0.014, medH * 1.1)) {
              cells.push({ day: dr.day, left: tok.x, right: tok.right, tokens: [tok] });
            } else {
              cur.tokens.push(tok);
              cur.right = Math.max(cur.right, tok.right);
            }
          }
          for (const cell of cells) {
            cell.cx = (cell.left + cell.right) / 2;
            rawCells.push(cell);
          }
        }
        // Cluster cell centers horizontally across all rows to assign [第X格] column slot
        const colCenters = [];
        for (const c of [...rawCells].sort((a, b) => a.cx - b.cx)) {
          let cluster = colCenters.find(cc => Math.abs(cc.cx - c.cx) <= Math.max(W * 0.12, medH * 6));
          if (!cluster) {
            cluster = { sum: c.cx, count: 1, cx: c.cx };
            colCenters.push(cluster);
          } else {
            cluster.sum += c.cx;
            cluster.count += 1;
            cluster.cx = cluster.sum / cluster.count;
          }
        }
        colCenters.sort((a, b) => a.cx - b.cx);
        const parsedCells = [];
        const colSectionVotes = new Map();
        for (const cell of rawCells) {
          let bestCol = 1;
          let bestDist = Infinity;
          colCenters.forEach((cc, idx) => {
            const dist = Math.abs(cc.cx - cell.cx);
            if (dist < bestDist) { bestDist = dist; bestCol = idx + 1; }
          });
          const cLines = [];
          for (const tok of [...cell.tokens].sort((a, b) => a.cy - b.cy || a.x - b.x)) {
            let cl = cLines.find(l => Math.abs(l.cy - tok.cy) <= Math.max(medH, tok.h) * 0.65);
            if (!cl) { cl = { cy: tok.cy, tokens: [] }; cLines.push(cl); }
            cl.tokens.push(tok);
            cl.cy = median(cl.tokens.map(t => t.cy));
          }
          cLines.sort((a, b) => a.cy - b.cy);
          const cleanCellLines = cLines.map(cl => {
            cl.tokens.sort((a, b) => a.x - b.x);
            return normalizeOCRText(cl.tokens.map(t => t.text).join(' '))
              .replace(/^[0oO@匚曰目口£■●•·.]+\s*/g, '')
              .trim();
          }).filter(Boolean);
          if (!cleanCellLines.length) continue;
          const joinedCell = cleanCellLines.join(' ');
          let secLabel = '';
          const secM = joinedCell.match(/(?:第?\s*)?(\d{1,2})\s*[-~到至.．·一\s]\s*(\d{1,2})\s*节/);
          if (secM) {
            const a = Number(secM[1]), b = Number(secM[2]);
            if (a >= 1 && b >= a && b <= 16) secLabel = a === b ? `${a}节` : `${a}-${b}节`;
          } else if (/(?:^|\s)07\s*节/.test(joinedCell) || /(?:^|\s)67\s*节/.test(joinedCell)) {
            secLabel = '6-7节';
          } else if (/(?:^|\s)[&8]?\s*9\s*节/.test(joinedCell)) {
            secLabel = '8-9节';
          } else if (/(?:^|\s)4\s*[-~到至]?\s*[巧5]\b/.test(joinedCell)) {
            secLabel = '4-5节';
          } else if (/3\s*[-~到至]?\s*[巧345]\s*节/.test(joinedCell) || /\b351\b/.test(joinedCell)) {
            secLabel = '3-5节';
          } else if (/\b341\b/.test(joinedCell)) {
            secLabel = '3-4节';
          } else if (/10\s*11/.test(joinedCell)) {
            secLabel = '10-11节';
          } else if (bestCol === 1 && /(?:^|\s)12\s*节/.test(joinedCell)) {
            secLabel = '1-2节';
          }
          if (secLabel && /^\d{1,2}-\d{1,2}节$/.test(secLabel)) {
            if (!colSectionVotes.has(bestCol)) colSectionVotes.set(bestCol, new Map());
            const vMap = colSectionVotes.get(bestCol);
            vMap.set(secLabel, (vMap.get(secLabel) || 0) + 1);
          }
          const bodyParts = cleanCellLines.map(l => l
            .replace(/(?:第?\s*)?\d{1,2}\s*[-~到至.．·一\s]\s*\d{1,2}\s*节/g, '')
            .replace(/(?:^|\s)(?:07|67|89|35|1011|9)\s*节/g, '')
            .trim()
          ).filter(Boolean);
          if (!bodyParts.length) continue;
          parsedCells.push({ day: cell.day, colIdx: bestCol, cx: cell.cx, secLabel, body: bodyParts.join(' ') });
        }
        const colMajority = new Map();
        for (const [colIdx, vMap] of colSectionVotes.entries()) {
          let topLabel = '', topCount = 0;
          for (const [lbl, cnt] of vMap.entries()) {
            if (cnt > topCount) { topLabel = lbl; topCount = cnt; }
          }
          if (topLabel) colMajority.set(colIdx, topLabel);
        }
        parsedCells.sort((a, b) => a.day - b.day || a.colIdx - b.colIdx || a.cx - b.cx);
        // Merge fragments that landed in the same (day, colIdx) cell (e.g. wide location wrapped slightly right)
        const mergedCells = [];
        for (const pc of parsedCells) {
          const prev = mergedCells[mergedCells.length - 1];
          if (prev && prev.day === pc.day && prev.colIdx === pc.colIdx) {
            if (!prev.secLabel && pc.secLabel) prev.secLabel = pc.secLabel;
            prev.body = `${prev.body} ${pc.body}`.trim();
          } else {
            mergedCells.push({ ...pc });
          }
        }
        const hLines = mergedCells.map(pc => {
          const inferredSec = pc.secLabel || colMajority.get(pc.colIdx) || '';
          return `每周${WEEK_CN_H[pc.day]} [第${pc.colIdx}格] ${inferredSec ? inferredSec + ' ' : ''}${pc.body}`;
        });
        if (hLines.length >= 2) {
          return {
            isGrid: true,
            cols: dayRows.length,
            text: `【已按课表二维表格自动定位列与节次（检测到横向 ${dayRows.length} 行）】\n` + hLines.join('\n')
          };
        }
      }
      return { isGrid: false, cols: 0, text: cleanFallback };
    }

    const colDiffs = [];
    for (let i = 1; i < bestCols.length; i++) colDiffs.push(bestCols[i].cx - bestCols[i - 1].cx);
    const colStep = median(colDiffs) || (W / (bestCols.length + 1));

    const bounds = bestCols.map((c, i) => ({
      day: c.day,
      cx: c.cx,
      left: i === 0 ? Math.max(0, c.cx - colStep * 0.5) : (bestCols[i - 1].cx + c.cx) / 2,
      right: i === bestCols.length - 1 ? Math.min(W, c.cx + colStep * 0.55) : (c.cx + bestCols[i + 1].cx) / 2
    }));

    let headerBottom = Math.max(...bestCols.map(c => c.bottom));
    const subDates = items.filter(t => t.cy > headerBottom && t.cy <= headerBottom + medH * 2.5 && t.cx >= bounds[0].left && t.cx <= bounds[bounds.length - 1].right);
    if (subDates.length >= 3) {
      const dateLike = subDates.filter(t => /^(?:\d{1,2}(?:[\/\-月]\d{1,2}日?)?|(?:今|明|后)天|今天)$/.test(t.text.replace(/\s+/g, '')));
      if (dateLike.length >= Math.max(3, Math.floor(subDates.length * 0.6))) {
        headerBottom = Math.max(...subDates.map(t => t.bottom));
      }
    }

    // Refine boundary between left section-number axis and first weekday column
    const prelimAxisToks = items.filter(t => t.cy > headerBottom && t.cx < bounds[0].cx - colStep * 0.25 && !/\d{1,2}[:：]\d{2}/.test(t.text));
    const secMatchesRaw = [];
    const axisRows = [];
    for (const tok of [...prelimAxisToks].sort((a, b) => a.cy - b.cy || a.x - b.x)) {
      let row = axisRows.find(r => Math.abs(r.cy - tok.cy) <= Math.max(medH, tok.h) * 0.5);
      if (!row) { row = { cy: tok.cy, tokens: [] }; axisRows.push(row); }
      row.tokens.push(tok);
      row.cy = median(row.tokens.map(t => t.cy));
    }
    for (const r of axisRows) {
      const rToks = [...r.tokens].sort((a, b) => a.x - b.x);
      const joined = rToks.map(t => t.text).join('').replace(/\s+/g, '');
      if (/[:]/.test(joined)) continue;
      const single = joined.match(/^(?:第)?(\d{1,2})节?$/);
      const spanM = joined.match(/^(?:第)?(\d{1,2})[-~到至](\d{1,2})节?$/);
      if (single) {
        const n = Number(single[1]);
        if (n >= 1 && n <= 16) secMatchesRaw.push({ secCenter: n, maxSec: n, cy: r.cy, right: Math.max(...rToks.map(t => t.right)) });
      } else if (spanM) {
        const a = Number(spanM[1]), b = Number(spanM[2]);
        if (a >= 1 && b >= a && b <= 16) secMatchesRaw.push({ secCenter: (a + b) / 2, maxSec: b, cy: r.cy, right: Math.max(...rToks.map(t => t.right)) });
      }
    }

    const axisChain = [];
    for (const item of secMatchesRaw.sort((a, b) => a.cy - b.cy)) {
      if (!axisChain.length || (item.secCenter > axisChain[axisChain.length - 1].secCenter && item.cy > axisChain[axisChain.length - 1].cy + medH * 0.6)) {
        axisChain.push(item);
      }
    }

    const validRows = Array.isArray(rows)
      ? rows.map(Number).filter(Number.isFinite).sort((a, b) => a - b)
      : [];
    let bodyMaxY = H;
    if (validRows.length >= 6) {
      bodyMaxY = validRows[validRows.length - 1] + medH * 0.5;
    }

    const bodyWords = items.filter(t => t.cy > headerBottom && t.cy <= bodyMaxY && !/^(?:注[：:]|未排|实践周|本学期|选课)/.test(t.text));
    const gridMaxY = bodyWords.length ? Math.max(...bodyWords.map(t => t.bottom)) : H;
    let y0, rowH, maxSec = 10;

    if (validRows.length >= 6) {
      const rDiffs = [];
      for (let i = 1; i < validRows.length; i++) rDiffs.push(validRows[i] - validRows[i - 1]);
      rowH = median(rDiffs) || ((validRows[validRows.length - 1] - validRows[0]) / Math.max(1, validRows.length - 1));
      y0 = validRows[0] + rowH * 0.5;
      maxSec = Math.max(validRows.length - 1, axisChain.length ? Math.max(...axisChain.map(a => a.maxSec)) : 0);
    } else if (axisChain.length >= 3) {
      maxSec = Math.max(10, ...axisChain.map(a => a.maxSec));
      const slopes = [];
      for (let i = 0; i < axisChain.length; i++) {
        for (let j = i + 1; j < axisChain.length; j++) {
          const ds = axisChain[j].secCenter - axisChain[i].secCenter;
          const dy = axisChain[j].cy - axisChain[i].cy;
          if (ds > 0 && dy / ds > medH * 1.1) slopes.push(dy / ds);
        }
      }
      rowH = median(slopes) || ((gridMaxY - headerBottom) / maxSec);
      y0 = median(axisChain.map(a => a.cy - (a.secCenter - 1) * rowH));
      const axisRightMax = Math.max(...axisChain.map(a => a.right));
      const firstColWordLeft = Math.min(...bestCols[0].x ? [bestCols[0].x] : [bounds[0].cx - colStep * 0.3]);
      if (axisRightMax < firstColWordLeft) {
        bounds[0].left = Math.max(bounds[0].left, axisRightMax + 2);
      }
    } else {
      const spanBottom = (gridMaxY < headerBottom + (H - headerBottom) * 0.78)
        ? Math.max(gridMaxY, headerBottom + (H - headerBottom) * 0.91)
        : gridMaxY;
      rowH = Math.max(medH * 2.1, (spanBottom - headerBottom - 4) / maxSec);
      y0 = headerBottom + 2 + rowH * 0.5;
    }

    const clampSec = s => Math.max(1, Math.min(Math.max(12, maxSec), s));
    const secAtY = py => clampSec(Math.floor((py - y0) / rowH + 1.5));
    const looksLikeMetaTail = txt => {
      const s = String(txt || '').trim();
      if (!s) return false;
      if (/^[（(].+[)）]$/.test(s) || /^[^（(]*\d{2,}.*[)）]$/.test(s)) return true;
      if (/^@/.test(s)) return true;
      if (/^(?:\d{1,2}\s*[-~]\s*\d{1,2}\s*周|第?\d{1,2}周|[单双]周)/.test(s)) return true;
      if (s.length <= 28 && /(?:幢|憧|栋|楼|室|馆|厅|区|教[一二三四五六\d]|阶教|实验楼|\d{3,4}|^[A-Za-z]\s*\d{2,4}$)/.test(s)) return true;
      return false;
    };

    const WEEK_CN = ['', '一', '二', '三', '四', '五', '六', '日'];
    const outLines = [];

    for (const col of bounds) {
      const colToks = bodyWords.filter(t => t.cx >= col.left && t.cx <= col.right);
      if (!colToks.length) continue;

      const vLines = [];
      for (const tok of [...colToks].sort((a, b) => a.cy - b.cy || a.x - b.x)) {
        let vl = vLines.find(l => Math.abs(l.cy - tok.cy) <= Math.max(medH, tok.h) * 0.65);
        if (!vl) { vl = { y: tok.y, bottom: tok.bottom, cy: tok.cy, tokens: [] }; vLines.push(vl); }
        vl.tokens.push(tok);
        vl.y = Math.min(vl.y, tok.y);
        vl.bottom = Math.max(vl.bottom, tok.bottom);
        vl.cy = median(vl.tokens.map(t => t.cy));
      }
      vLines.sort((a, b) => a.y - b.y);
      for (const vl of vLines) {
        vl.tokens.sort((a, b) => a.x - b.x);
        vl.text = normalizeOCRText(vl.tokens.map(t => t.text).join(' ')).replace(/\n/g, ' ').trim();
      }
      const cleanLines = vLines.filter(vl => vl.text && !/^(?:0|上午|中午|下午|晚上|休息|午休)$/.test(vl.text));
      if (!cleanLines.length) continue;

      const cards = [];
      for (const vl of cleanLines) {
        const curCard = cards[cards.length - 1];
        if (!curCard) { cards.push({ lines: [vl], y: vl.y, bottom: vl.bottom }); continue; }
        const prev = curCard.lines[curCard.lines.length - 1];
        const gap = vl.y - prev.bottom;
        const isMetaCur = looksLikeMetaTail(vl.text);
        const withinBlockHeight = (vl.bottom - curCard.y) <= rowH * 3.85;
        // Keep classroom/week metadata footer lines attached to their parent 2- or 3-period course box
        if (isMetaCur && withinBlockHeight && gap < rowH * 2.55) {
          curCard.lines.push(vl);
          curCard.bottom = Math.max(curCard.bottom, vl.bottom);
          continue;
        }
        const explicitStart = /(?:^|\s)第?\d{1,2}\s*[-~到至]\s*\d{1,2}\s*节/.test(vl.text);
        const hugeGap = gap >= Math.max(rowH * 0.65, medH * 1.6);
        const metaTailBoundary = looksLikeMetaTail(prev.text) && !isMetaCur && (vl.cy - prev.cy) >= medH * 0.85;
        if (explicitStart || hugeGap || metaTailBoundary) {
          cards.push({ lines: [vl], y: vl.y, bottom: vl.bottom });
        } else {
          curCard.lines.push(vl);
          curCard.bottom = Math.max(curCard.bottom, vl.bottom);
        }
      }

      for (let idx = 0; idx < cards.length; idx++) {
        const card = cards[idx];
        const nextCard = cards[idx + 1];
        const rawJoined = card.lines.map(l => l.text).join(' ').trim();
        const explicitSec = rawJoined.match(/第?\s*(\d{1,2})\s*[-~到至]\s*(\d{1,2})\s*节/);
        let s1, s2;
        if (explicitSec) {
          s1 = clampSec(Number(explicitSec[1]));
          s2 = clampSec(Math.max(s1, Number(explicitSec[2])));
        } else {
          s1 = clampSec(Math.floor((card.y + rowH * 0.15 - y0) / rowH + 1.5));
          s2 = clampSec(Math.floor((card.bottom - rowH * 0.15 - y0) / rowH + 1.5));
          if (s2 < s1) s2 = s1;
          if (s2 === s1 && s1 % 2 === 1 && s1 < maxSec) {
            const nextTopS = nextCard ? clampSec(Math.floor((nextCard.y + rowH * 0.15 - y0) / rowH + 1.5)) : maxSec + 2;
            if (nextTopS > s1 + 1) s2 = s1 + 1;
          }
        }

        const titleParts = [];
        const metaParts = [];
        for (const l of card.lines) {
          const stripped = l.text.replace(/第?\s*\d{1,2}\s*[-~到至]\s*\d{1,2}\s*节/g, '').trim();
          if (!stripped) continue;
          if (looksLikeMetaTail(stripped) && titleParts.length > 0) metaParts.push(stripped.replace(/^[（(]|[)）]$/g, ''));
          else titleParts.push(stripped);
        }
        let courseName = normalizeOCRText(titleParts.join(' ')).replace(/\n/g, ' ').trim();
        if (courseName.endsWith('(') && !courseName.includes(')')) {
          courseName = courseName.slice(0, -1).trim();
        }
        if (!courseName) continue;
        const metaStr = metaParts.length ? ` (${metaParts.join(' · ')})` : '';
        const secLabel = s1 === s2 ? `${s1}节` : `${s1}-${s2}节`;
        outLines.push(`每周${WEEK_CN[col.day]} ${secLabel} ${courseName}${metaStr}`);
      }
    }

    if (outLines.length < 2) return { isGrid: false, cols: 0, text: cleanFallback };
    return {
      isGrid: true,
      cols: bounds.length,
      text: `【已按课表二维表格自动定位列与节次（检测到 ${bounds.length} 列）】\n` + outLines.join('\n')
    };
  }

  function normalizeOCRText(text) {
    return String(text || '')
      .replace(/\r\n?/g, '\n')
      .split('\n')
      .map(line => {
        let s = line.trim();
        if (!s) return '';
        for (let i = 0; i < 4; i++) {
          s = s
            .replace(/([\u4e00-\u9fff\u3000-\u303f\uff00-\uffef])\s+([\u4e00-\u9fff\u3000-\u303f\uff00-\uffef])/g, '$1$2')
            .replace(/(\d)\s+(\d)/g, '$1$2')
            .replace(/(\d)\s*([:：])\s*(\d)/g, '$1$2$3')
            .replace(/([\u4e00-\u9fff])\s+(\d)/g, '$1$2')
            .replace(/([A-Za-z])\s+(\d)/g, '$1$2')
            .replace(/(\d)\s+(节|月|日|周|号|点|分|小|幢|栋|楼|室)/g, '$1$2');
        }
        return s
          .replace(/[（]/g, '(')
          .replace(/[）]/g, ')')
          .replace(/(?<![0-9A-Za-z])0\s*(0\d{2,}(?:幢|栋|楼|室))/g, '(1$1')
          .replace(/(\d{1,2})\s*[一—–]\s*(\d{1,2})\s*节/g, '$1-$2节')
          .replace(/\(\s+/g, '(')
          .replace(/\s+\)/g, ')')
          .replace(/\s{2,}/g, ' ')
          .trim();
      })
      .filter(Boolean)
      .join('\n');
  }

  function splitCSVRow(line, sep) {
    const out = [];
    let cur = '';
    let quoted = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (quoted && line[i + 1] === '"') { cur += '"'; i++; }
        else quoted = !quoted;
      } else if (ch === sep && !quoted) {
        out.push(cur.trim());
        cur = '';
      } else {
        cur += ch;
      }
    }
    out.push(cur.trim());
    return out;
  }

  function parseCSVTimetable(text, { now = new Date(), days = 126, bellSchedule = [] } = {}) {
    const raw = String(text || '').replace(/^\uFEFF/, '').trim();
    if (!raw) throw Error('CSV 课表内容为空。');
    const lines = raw.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    if (!lines.length) throw Error('未检测到有效课表行。');
    const sep = lines[0].includes('\t') ? '\t' : ',';
    const rows = lines.map(l => splitCSVRow(l, sep));
    const head = rows[0].map(c => c.toLowerCase());
    const hasHeader = head.some(c => /课程|名称|科目|星期|周几|节次|开始|time|course|subject|day/.test(c));
    const col = pat => head.findIndex(c => pat.test(c));
    const titleCol = hasHeader ? col(/课程|科目|名称|title|name|course|subject/) : 0;
    const dayCol = hasHeader ? col(/星期|周几|周次|day|week/) : 1;
    const secCol = hasHeader ? col(/节次|节数|时段|time|section|period/) : 2;
    const locCol = hasHeader ? col(/教室|地点|location|room/) : 3;
    const startRow = hasHeader ? 1 : 0;

    const noteLines = [];
    for (let i = startRow; i < rows.length; i++) {
      const r = rows[i];
      if (!r || !r.some(Boolean)) continue;
      const title = r[titleCol >= 0 ? titleCol : 0] || '';
      const dayRaw = r[dayCol >= 0 ? dayCol : 1] || '';
      const secRaw = r[secCol >= 0 ? secCol : 2] || '';
      const locRaw = locCol >= 0 ? (r[locCol] || '') : '';
      if (!title && !secRaw) continue;
      const dayNorm = /^(?:[1-7])$/.test(dayRaw.trim()) ? `每周${'一二三四五六日'[Number(dayRaw.trim()) - 1]}` : (dayRaw.includes('周') || dayRaw.includes('星期') ? dayRaw : (dayRaw ? `每周${dayRaw}` : ''));
      const secNorm = /^\d{1,2}(?:\s*[-~]\s*\d{1,2})?$/.test(secRaw.trim()) ? `第${secRaw.trim()}节` : secRaw;
      noteLines.push([dayNorm, secNorm, title, locRaw ? `(${locRaw})` : ''].filter(Boolean).join(' '));
    }

    if (!noteLines.length) throw Error('CSV 表格中未能识别到课程列。');
    const parsed = parseNoteOrTimetable(noteLines.join('\n'), { now, days, bellSchedule });
    return {
      ...parsed,
      format: 'csv',
      summary: `从表格导入 ${parsed.blockedSlots.length} 节课程安排`
    };
  }

  function decodeHtmlEntities(s) {
    return String(s || '')
      .replace(/&nbsp;/gi, ' ')
      .replace(/&amp;/gi, '&')
      .replace(/&lt;/gi, '<')
      .replace(/&gt;/gi, '>')
      .replace(/&quot;/gi, '"')
      .replace(/&#39;/gi, "'")
      .replace(/&#(\d+);/g, (_, n) => {
        const code = Number(n);
        return Number.isFinite(code) && code > 0 ? String.fromCharCode(code) : '';
      });
  }

  function parsePortalCellCourseBlocks(rawCellText, defaultWeekday, defaultSection) {
    const rawLines = String(rawCellText || '')
      .replace(/\r/g, '\n')
      .split(/\n+/)
      .map(s => s.trim())
      .filter(s => s && s !== '\u00a0' && !/^调[、,]?停|^时间$|^星期[一二三四五六日天]$|^第?\d{1,2}节$/.test(s));
    if (!rawLines.length) return [];

    // Split stacked courses inside the same table cell (separated whenever a new title follows a room/teacher/week block)
    const groups = [];
    let cur = [];
    const isMetaLine = l => /^\{第|^周[一二三四五六日天1-7]第\d/.test(l) || /\d{2,}(?:幢|栋|楼|室)/.test(l) || /机房|体育馆|教学楼|实验楼/.test(l);
    for (let i = 0; i < rawLines.length; i++) {
      const l = rawLines[i];
      const hasPrevMeta = cur.some(x => /\{第/.test(x) || /\d{2,}(?:幢|栋|楼|室)|机房|体育馆/.test(x));
      if (hasPrevMeta && cur.length >= 3 && !isMetaLine(l) && !/^[A-Za-z\u4e00-\u9fa5]{1,5}(?:\/[A-Za-z\u4e00-\u9fa5]{1,5})*$/.test(l)) {
        groups.push(cur);
        cur = [l];
      } else {
        cur.push(l);
      }
    }
    if (cur.length) groups.push(cur);

    const out = [];
    for (const grp of groups) {
      let weekday = defaultWeekday;
      let section = defaultSection;
      let title = '';
      let location = '';
      let teacher = '';
      let weekStart = 1;
      let weekEnd = 18;
      let weekMode = 'all';
      for (let idx = 0; idx < grp.length; idx++) {
        let line = grp[idx];
        const explicitSec = line.match(/^(?:星期|周)([一二三四五六日天1-7])第(\d{1,2})(?:[,，\-~到至](\d{1,2}))?节/);
        if (explicitSec) {
          weekday = WEEK_MAP[explicitSec[1]] || weekday;
          const s1 = Number(explicitSec[2]);
          const s2 = Number(explicitSec[3] || s1);
          section = s2 > s1 ? `${s1}-${s2}` : `${s1}`;
          line = line.replace(explicitSec[0], '').trim();
        }
        // Match SUDA homepage cell header like "1-2节 (2-17周)" or "10-11节 (2-16|双周)" or "8-8节 (2-17周)"
        const cellSec = line.match(/^(\d{1,2})(?:\s*[-~到至]\s*(\d{1,2}))?\s*节(?:\s*[（(]([^）)]*周[^）)]*)[)）])?/);
        if (cellSec) {
          const s1 = Number(cellSec[1]);
          const s2 = Number(cellSec[2] || s1);
          section = s2 > s1 ? `${s1}-${s2}` : `${s1}`;
          if (cellSec[3]) {
            const wm = cellSec[3].match(/(\d{1,2})\s*[-~到至]\s*(\d{1,2})/);
            if (wm) {
              weekStart = Math.max(1, Math.min(25, Number(wm[1]) || 1));
              weekEnd = Math.max(weekStart, Math.min(25, Number(wm[2]) || weekStart));
            }
            if (/双周/.test(cellSec[3])) weekMode = 'even';
            else if (/单周/.test(cellSec[3])) weekMode = 'odd';
          }
          line = line.replace(cellSec[0], '').trim();
        }
        const wkM = line.match(/\{[^}]*?第?\s*(\d{1,2})\s*[-~到至]\s*(\d{1,2})\s*周([^}]*)\}/);
        if (wkM) {
          weekStart = Math.max(1, Math.min(25, Number(wkM[1]) || 1));
          weekEnd = Math.max(weekStart, Math.min(25, Number(wkM[2]) || weekStart));
          if (/双周/.test(wkM[3])) weekMode = 'even';
          else if (/单周/.test(wkM[3])) weekMode = 'odd';
        }
        line = line.replace(/\{[^}]*第[^}]*周[^}]*\}/g, '').replace(/[（(]\s*\d{1,2}\s*[-~到至]\s*\d{1,2}(?:\s*\|\s*[单双])?周\s*[)）]/g, '').trim();
        if (!line) continue;
        if (!title) {
          title = line;
        } else if (/\d{2,}(?:幢|栋|楼|室)|机房|体育馆|主馆|教室|实验室|校区/.test(line) || idx === grp.length - 1) {
          const looksLikeTeacherOnly = grp.length >= 3 && idx < grp.length - 1 && /^[\u4e00-\u9fa5]{2,4}(?:\/[\u4e00-\u9fa5]{2,4})*$/.test(line);
          if (looksLikeTeacherOnly) teacher = teacher || line;
          else location = location ? `${location} ${line}` : line;
        } else if (/^[\u4e00-\u9fa5]{2,4}(?:\/[\u4e00-\u9fa5]{2,4})*$/.test(line)) {
          teacher = teacher || line;
        }
      }
      if (title) {
        out.push({
          title: title.slice(0, 100),
          weekday,
          date: '',
          section: String(section || '1-2'),
          period: '',
          location: location.slice(0, 60),
          teacher: teacher.slice(0, 40),
          weekStart,
          weekEnd,
          weekMode,
          recurrence: 'weekly'
        });
      }
    }
    return out;
  }

  const BELL_PRESETS = Object.freeze({
    suda_12: Object.freeze({
      id: 'suda_12',
      name: '标准高校 12 节（8:00 起 · 45 分钟/节）',
      entries: [
        { section: 1, start: '08:00', end: '08:45', period: 'morning' },
        { section: 2, start: '08:50', end: '09:35', period: 'morning' },
        { section: 3, start: '09:55', end: '10:40', period: 'morning' },
        { section: 4, start: '10:45', end: '11:30', period: 'morning' },
        { section: 5, start: '11:35', end: '12:20', period: 'morning' },
        { section: 6, start: '14:00', end: '14:45', period: 'afternoon' },
        { section: 7, start: '14:50', end: '15:35', period: 'afternoon' },
        { section: 8, start: '15:55', end: '16:40', period: 'afternoon' },
        { section: 9, start: '16:45', end: '17:30', period: 'afternoon' },
        { section: 10, start: '18:30', end: '19:15', period: 'evening' },
        { section: 11, start: '19:25', end: '20:10', period: 'evening' },
        { section: 12, start: '20:20', end: '21:05', period: 'evening' }
      ]
    }),
    morning_830: Object.freeze({
      id: 'morning_830',
      name: '早八半 12 节（8:30 起 · 45 分钟/节）',
      entries: [
        { section: 1, start: '08:30', end: '09:15', period: 'morning' },
        { section: 2, start: '09:20', end: '10:05', period: 'morning' },
        { section: 3, start: '10:25', end: '11:10', period: 'morning' },
        { section: 4, start: '11:15', end: '12:00', period: 'morning' },
        { section: 5, start: '14:00', end: '14:45', period: 'afternoon' },
        { section: 6, start: '14:50', end: '15:35', period: 'afternoon' },
        { section: 7, start: '15:55', end: '16:40', period: 'afternoon' },
        { section: 8, start: '16:45', end: '17:30', period: 'afternoon' },
        { section: 9, start: '19:00', end: '19:45', period: 'evening' },
        { section: 10, start: '19:50', end: '20:35', period: 'evening' }
      ]
    })
  });

  function parseWakeUpSchedule(rawText, { now = new Date(), days = 126, bellSchedule = [] } = {}) {
    const raw = String(rawText || '').trim();
    if (!raw) throw Error('WakeUp 课表内容为空。');
    const chunks = raw.split(/\r?\n+/).map(l => l.trim()).filter(Boolean).map(line => {
      try { return JSON.parse(line); } catch { return null; }
    }).filter(Boolean);

    let timeNodes = [];
    let courseMeta = [];
    let courseDetails = [];
    if (chunks.length >= 4 && chunks.some(c => Array.isArray(c))) {
      for (const c of chunks) {
        if (!Array.isArray(c) || !c.length) continue;
        const first = c[0];
        if (first && typeof first === 'object') {
          if (Object.hasOwn(first, 'startTime') && Object.hasOwn(first, 'node')) timeNodes = c;
          else if (Object.hasOwn(first, 'courseName')) courseMeta = c;
          else if (Object.hasOwn(first, 'startNode') && Object.hasOwn(first, 'day')) courseDetails = c;
        }
      }
    } else {
      let obj = null;
      try { obj = JSON.parse(raw); } catch {}
      if (obj && Array.isArray(obj.courses || obj.details)) {
        courseMeta = obj.meta || obj.courses || [];
        courseDetails = obj.details || obj.courses || [];
        timeNodes = obj.timeNodes || obj.bellSchedule || [];
      }
    }

    if (!courseDetails.length) throw Error('未能识别出有效的 WakeUp 课表格式（请上传 .wakeup_schedule 文件）。');
    const metaMap = new Map(courseMeta.map(m => [m.id, m]));
    const bellOut = normalizeBellEntries(timeNodes.map(t => ({
      section: Number(t.node || t.section),
      start: t.startTime || t.start,
      end: t.endTime || t.end
    })));
    const classes = [];
    for (const d of courseDetails) {
      const meta = metaMap.get(d.id) || {};
      const title = String(meta.courseName || d.courseName || d.name || '').trim();
      const wd = Number(d.day || d.weekday);
      const s1 = Number(d.startNode || d.sectionStart || 1);
      const step = Math.max(1, Number(d.step || 1));
      const s2 = Number(d.sectionEnd) || Math.min(16, s1 + step - 1);
      if (!title || !(wd >= 1 && wd <= 7)) continue;
      classes.push({
        title,
        weekday: wd,
        date: '',
        section: s2 > s1 ? `${s1}-${s2}` : `${s1}`,
        period: '',
        location: String(d.room || d.location || '').trim(),
        teacher: String(d.teacher || '').trim(),
        weekStart: Number(d.startWeek) || 1,
        weekEnd: Number(d.endWeek) || 18,
        weekMode: Number(d.type) === 1 ? 'odd' : (Number(d.type) === 2 ? 'even' : 'all'),
        recurrence: 'weekly'
      });
    }
    if (!classes.length) throw Error('WakeUp 文件中未包含有效课程条目。');
    const norm = normalizeRemoteAnalysis({
      summary: `已从 WakeUp 课表无损导入 ${classes.length} 门课程${bellOut.length ? `与 ${bellOut.length} 节作息` : ''}`,
      insights: [
        `无损解析 WakeUp 原生课表，含起止周、单双周与教室信息。`,
        bellOut.length ? `已同步 WakeUp 内的 ${bellOut.length} 节上下课钟点。` : '可在「周课表 → 作息时间」中一键套用或调整钟点。'
      ],
      bellSchedule: bellOut,
      classes,
      tasks: [],
      dayAdjustments: []
    }, { now, days, bellSchedule });
    return { ...norm, mode: 'portal', format: 'wakeup', portalClasses: classes };
  }

  function parsePortalCells(cellsInput, { now = new Date(), days = 126, bellSchedule = [] } = {}) {
    const items = Array.isArray(cellsInput) ? cellsInput : (Array.isArray(cellsInput?.cells) ? cellsInput.cells : []);
    const classes = [];
    const seen = new Set();
    for (const cell of items) {
      if (!cell) continue;
      const wd = Number(cell.weekday);
      const sec = String(cell.section || '').trim();
      const rawText = String(cell.text || '').trim();
      if (!(wd >= 1 && wd <= 7) || !rawText) continue;
      const blocks = parsePortalCellCourseBlocks(rawText, wd, sec || '1-2');
      for (const b of blocks) {
        const key = `${b.weekday}|${b.section}|${canonicalCourseKey(b.title)}|${b.location}`;
        if (seen.has(key)) continue;
        seen.add(key);
        classes.push(b);
      }
    }
    if (!classes.length) throw Error('未在教务课表表格中检测到有效课程单元格。');
    const hostHint = cellsInput?.host ? `（来自 ${String(cellsInput.host).slice(0, 60)}）` : '';
    const norm = normalizeRemoteAnalysis({
      summary: `已从教务系统直连导入 ${classes.length} 门精准课程${hostHint}`,
      insights: [
        `共精确读取 ${classes.length} 门课程，已自动展开未来整学期周课表。`,
        '直接读取教务网页真实表格，无任何识图误差。'
      ],
      bellSchedule: Array.isArray(cellsInput?.bellSchedule) ? cellsInput.bellSchedule : [],
      classes,
      tasks: [],
      dayAdjustments: []
    }, { now, days, bellSchedule });
    return { ...norm, mode: 'portal', format: 'portal', portalClasses: classes };
  }

  function unwrapMhtmlIfNeeded(rawText) {
    const s = String(rawText || '');
    if (!/Content-Transfer-Encoding:\s*quoted-printable/i.test(s) && !/^MIME-Version:/im.test(s)) return s;
    // Decode quoted-printable chunks (Edge/Chrome .mhtml single-file captures keep iframe HTML inside!)
    const bytes = [];
    const unfolded = s.replace(/=\r?\n/g, '');
    const out = unfolded.replace(/((?:=[0-9A-Fa-f]{2})+)/g, seq => {
      const arr = new Uint8Array(seq.length / 3);
      for (let i = 0; i < arr.length; i++) arr[i] = parseInt(seq.slice(i * 3 + 1, i * 3 + 3), 16);
      try { return new TextDecoder('utf-8', { fatal: true }).decode(arr); } catch {}
      try { return new TextDecoder('gbk').decode(arr); } catch {}
      return seq;
    });
    return out;
  }

  function parseHtmlTimetable(htmlText, { now = new Date(), days = 126, bellSchedule = [] } = {}) {
    const raw = unwrapMhtmlIfNeeded(htmlText);
    if (!/<table\b/i.test(raw)) {
      if (/<iframe\b/i.test(raw)) {
        throw Error('这是教务系统外层框架页（课表在内部 iframe，Ctrl+S 只保存了外壳）。最简单：回到教务课表页直接全选复制（Ctrl+A → Ctrl+C），切回本弹窗按 Ctrl+V 粘贴即可 100% 精准导入；或上传“_files”文件夹里的课表子网页。');
      }
      throw Error('未在 HTML 文件中找到课表表格（<table>）。请用“全选复制→切回按 Ctrl+V 粘贴”或上传教务课表子网页。');
    }
    const tables = raw.match(/<table\b[\s\S]*?<\/table>/gi) || [];
    let bestClasses = [];
    const bellTextBlocks = [];

    for (const tbl of tables) {
      const trs = tbl.match(/<tr\b[\s\S]*?<\/tr>/gi) || [];
      if (trs.length < 3) continue;
      const grid = [];
      const occupied = [];
      const uniqueCells = [];
      for (let rIdx = 0; rIdx < trs.length; rIdx++) {
        if (!grid[rIdx]) grid[rIdx] = [];
        if (!occupied[rIdx]) occupied[rIdx] = [];
        let cIdx = 0;
        const cellMatches = trs[rIdx].match(/<t[dh]\b[\s\S]*?<\/t[dh]>/gi) || [];
        for (const rawCell of cellMatches) {
          while (occupied[rIdx][cIdx]) cIdx++;
          const openTag = (rawCell.match(/^<t[dh]\b([^>]*)>/i) || ['', ''])[1];
          const cs = Math.max(1, Math.min(12, Number((openTag.match(/\bcolspan\s*=\s*["']?(\d+)/i) || [])[1] || 1)));
          const rs = Math.max(1, Math.min(16, Number((openTag.match(/\browspan\s*=\s*["']?(\d+)/i) || [])[1] || 1)));
          const inner = rawCell
            .replace(/^<t[dh]\b[^>]*>/i, '')
            .replace(/<\/t[dh]>$/i, '')
            .replace(/<br\s*\/?>/gi, '\n')
            .replace(/<\/(?:p|div|li|tr)>/gi, '\n')
            .replace(/<[^>]+>/g, '');
          const text = decodeHtmlEntities(inner).replace(/[ \t]+/g, ' ').replace(/\n\s+/g, '\n').trim();
          const cellObj = { row: rIdx, col: cIdx, rowspan: rs, colspan: cs, text, visited: false };
          uniqueCells.push(cellObj);
          for (let dr = 0; dr < rs; dr++) {
            if (!grid[rIdx + dr]) grid[rIdx + dr] = [];
            if (!occupied[rIdx + dr]) occupied[rIdx + dr] = [];
            for (let dc = 0; dc < cs; dc++) {
              occupied[rIdx + dr][cIdx + dc] = true;
              grid[rIdx + dr][cIdx + dc] = cellObj;
            }
          }
          cIdx += cs;
        }
      }

      const plainTableText = uniqueCells.map(c => c.text).filter(Boolean).join('\n');
      if (/\d{1,2}[:：]\d{2}\s*[-~—–至]\s*\d{1,2}[:：]\d{2}/.test(plainTableText)) {
        bellTextBlocks.push(plainTableText);
      }

      // Find header row mapping column -> weekday (1..7)
      let colToDay = null;
      let headerRowIdx = -1;
      for (let r = 0; r < Math.min(4, grid.length); r++) {
        const map = new Map();
        for (let c = 0; c < (grid[r] || []).length; c++) {
          const t = (grid[r][c]?.text || '').replace(/\s+/g, '');
          const d = parseHeaderDay(t, false);
          if (d >= 1 && d <= 7) map.set(c, d);
        }
        if (map.size >= 3) {
          colToDay = map;
          headerRowIdx = r;
          break;
        }
      }
      if (colToDay) {
        const firstDayCol = Math.min(...colToDay.keys());
        const rowSecNum = new Map();
        let seqSec = 0;
        for (let r = headerRowIdx + 1; r < grid.length; r++) {
          let secNum = 0;
          for (let c = 0; c < firstDayCol; c++) {
            const axisT = (grid[r]?.[c]?.text || '').trim();
            const sm = axisT.match(/第?\s*(\d{1,2})\s*节/) || axisT.match(/^(\d{1,2})$/);
            if (sm) { secNum = Number(sm[1]); break; }
          }
          if (!secNum && (grid[r] || []).some((cell, ci) => ci >= firstDayCol && cell?.text)) {
            seqSec += 1;
            secNum = seqSec;
          } else if (secNum) {
            seqSec = secNum;
          }
          if (secNum >= 1 && secNum <= 16) rowSecNum.set(r, secNum);
        }

        const cellsOut = [];
        for (const cell of uniqueCells) {
          if (cell.row <= headerRowIdx || !cell.text) continue;
          const wd = colToDay.get(cell.col);
          if (!wd) continue;
          const s1 = rowSecNum.get(cell.row);
          if (!s1) continue;
          const s2 = rowSecNum.get(cell.row + cell.rowspan - 1) || Math.min(16, s1 + cell.rowspan - 1);
          const section = s2 > s1 ? `${s1}-${s2}` : `${s1}`;
          cellsOut.push({ weekday: wd, section, text: cell.text });
        }
        if (cellsOut.length) {
          const parsed = parsePortalCells(cellsOut, { now, days, bellSchedule });
          if ((parsed.portalClasses?.length || 0) > bestClasses.length) {
            bestClasses = parsed.portalClasses;
          }
        }
      } else {
        // Horizontal row-based HTML timetable (星期一..星期日 in left col, e.g. SUDA homepage 课表)
        let rowToDay = null;
        let dayColIdx = -1;
        for (let c = 0; c < Math.min(2, grid[0]?.length || 0); c++) {
          const map = new Map();
          for (let r = 0; r < grid.length; r++) {
            const d = parseHeaderDay((grid[r]?.[c]?.text || '').replace(/\s+/g, ''), false);
            if (d >= 1 && d <= 7) map.set(r, d);
          }
          if (map.size >= 3) {
            rowToDay = map;
            dayColIdx = c;
            break;
          }
        }
        if (rowToDay) {
          const cellsOut = [];
          for (const cell of uniqueCells) {
            if (cell.col <= dayColIdx || !cell.text) continue;
            const wd = rowToDay.get(cell.row);
            if (!wd) continue;
            const sm = cell.text.match(/(\d{1,2})(?:\s*[-~到至]\s*(\d{1,2}))?\s*节/);
            const sec = sm ? (sm[2] && Number(sm[2]) > Number(sm[1]) ? `${sm[1]}-${sm[2]}` : `${sm[1]}`) : '';
            cellsOut.push({ weekday: wd, section: sec, text: cell.text });
          }
          if (cellsOut.length) {
            const parsed = parsePortalCells(cellsOut, { now, days, bellSchedule });
            if ((parsed.portalClasses?.length || 0) > bestClasses.length) {
              bestClasses = parsed.portalClasses;
            }
          }
        }
      }
    }

    const extraBell = bellTextBlocks.length ? parseBellSchedule(bellTextBlocks.join('\n')).bellSchedule : [];
    const mergedBell = normalizeBellEntries([...(Array.isArray(bellSchedule) ? bellSchedule : []), ...extraBell]);
    if (bestClasses.length) {
      const norm = normalizeRemoteAnalysis({
        summary: `已从教务网页无损导入 ${bestClasses.length} 门精准课程`,
        insights: [
          `共精确读取 ${bestClasses.length} 门课程，已自动展开未来整学期周课表。`,
          '直接读取教务网页真实表格，无任何识图误差。'
        ],
        bellSchedule: mergedBell,
        classes: bestClasses,
        tasks: [],
        dayAdjustments: []
      }, { now, days, bellSchedule: mergedBell });
      return { ...norm, mode: 'portal', format: 'portal', portalClasses: bestClasses };
    }
    if (mergedBell.length >= 2) {
      return { mode: 'portal', format: 'html', summary: `已从网页提取 ${mergedBell.length} 个作息节次`, insights: ['已解析网页中的作息时间表，可用于校准课程上下课钟点。'], blockedSlots: [], tasks: [], dayAdjustments: [], bellSchedule: mergedBell };
    }
    if (/<iframe\b/i.test(raw)) {
      throw Error('你上传的 HTML 是教务外层框架壳子（真实课表嵌在内部 iframe 里）。最简单做法：切到教务系统个人课表页按 Ctrl+A 全选 → Ctrl+C 复制，再回本弹窗按 Ctrl+V 粘贴即可直接导入；或上传“_files”文件夹内的课表子页。');
    }
    throw Error('未能从该 HTML 文件识别出教务课表表格，请确认保存的是“个人课表/课表查询”页面，或直接在教务课表页 Ctrl+A 复制后回本弹窗按 Ctrl+V 粘贴。');
  }

  function buildPortalExtractorCode(targetUrl) {
    const dest = String(targetUrl || 'http://127.0.0.1:4821/lifeos-web/').split('#')[0].split('?')[0];
    // Self-contained DOM extractor shared by Bookmarklet and Extension: scans document + same-origin iframes
    return `(function(){try{var DEST=${JSON.stringify(dest)};var WM={'一':1,'二':2,'三':3,'四':4,'五':5,'六':6,'日':7,'天':7,'1':1,'2':2,'3':3,'4':4,'5':5,'6':6,'7':7};function pd(s){s=(s||'').replace(/\\s+/g,'');var m=s.match(/(?:星期|礼拜|周)([一二三四五六日天1-7])/);return m?WM[m[1]]||0:0;}function docsOf(w,d){var a=[];try{if(w.document)a.push(w.document);}catch(e){return a;}if(d>2)return a;var fs=w.document.querySelectorAll('iframe,frame');for(var i=0;i<fs.length;i++){try{var cw=fs[i].contentWindow;if(cw)a=a.concat(docsOf(cw,d+1));}catch(e){}}return a;}var best=[];var allDocs=docsOf(window,0);for(var di=0;di<allDocs.length;di++){var ts=allDocs[di].querySelectorAll('table');for(var ti=0;ti<ts.length;ti++){var trs=ts[ti].rows;if(!trs||trs.length<3)continue;var grid=[],occ=[],uc=[];for(var r=0;r<trs.length;r++){grid[r]=grid[r]||[];occ[r]=occ[r]||[];var c=0,cells=trs[r].cells;for(var k=0;k<cells.length;k++){while(occ[r][c])c++;var el=cells[k],rs=Math.max(1,el.rowSpan||1),cs=Math.max(1,el.colSpan||1);var obj={r:r,c:c,rs:rs,t:(el.innerText||el.textContent||'').trim()};uc.push(obj);for(var dr=0;dr<rs;dr++){grid[r+dr]=grid[r+dr]||[];occ[r+dr]=occ[r+dr]||[];for(var dc=0;dc<cs;dc++){occ[r+dr][c+dc]=1;grid[r+dr][c+dc]=obj;}}c+=cs;}}var colDay={},hr=-1;for(var r=0;r<Math.min(4,grid.length);r++){var mp={},cnt=0;for(var c=0;c<(grid[r]||[]).length;c++){var d=pd(grid[r][c]&&grid[r][c].t);if(d){mp[c]=d;cnt++;}}if(cnt>=3){colDay=mp;hr=r;break;}}if(hr<0)continue;var minC=999;for(var ck in colDay)minC=Math.min(minC,+ck);var rowSec={},seq=0;for(var r=hr+1;r<grid.length;r++){var sn=0;for(var c=0;c<minC;c++){var ax=(grid[r][c]&&grid[r][c].t||'').trim();var sm=ax.match(/第?\\s*(\\d{1,2})\\s*节/)||ax.match(/^(\\d{1,2})$/);if(sm){sn=+sm[1];break;}}if(!sn){for(var c=minC;c<(grid[r]||[]).length;c++){if(grid[r][c]&&grid[r][c].t){seq++;sn=seq;break;}}}else seq=sn;if(sn>=1&&sn<=16)rowSec[r]=sn;}var out=[];for(var ui=0;ui<uc.length;ui++){var u=uc[ui];if(u.r<=hr||!u.t)continue;var wd=colDay[u.c];if(!wd)continue;var s1=rowSec[u.r];if(!s1)continue;var s2=rowSec[u.r+u.rs-1]||Math.min(16,s1+u.rs-1);out.push({weekday:wd,section:s2>s1?(s1+'-'+s2):(''+s1),text:u.t});}if(out.length>best.length)best=out;}}if(!best.length){alert('未在当前页面检测到教务课表表格，请先进入“个人课表/课表查询”页面后再点此按钮。');return;}var payload={v:1,host:location.host,cells:best};var b64=btoa(unescape(encodeURIComponent(JSON.stringify(payload))));try{navigator.clipboard&&navigator.clipboard.writeText(JSON.stringify(payload));}catch(e){}window.open(DEST+'?import_kb='+encodeURIComponent(b64)+'#space/workbench','_blank');}catch(err){alert('课表提取失败：'+(err&&err.message||err));}})();`;
  }

  function buildPortalBookmarklet(targetUrl) {
    return 'javascript:' + buildPortalExtractorCode(targetUrl);
  }

  function buildCalmInsights(blockedSlots, tasks, dayAdjustments, now, bellSchedule = []) {
    const out = [];
    if (Array.isArray(bellSchedule) && bellSchedule.length) {
      out.push(`已提取 ${bellSchedule.length} 个作息节次，会自动同步真实上下课时间与上午/下午/晚上归属`);
    }
    if (blockedSlots.length) {
      const byDay = new Map();
      for (const b of blockedSlots) byDay.set(b.day, (byDay.get(b.day) || 0) + 1);
      const sorted = [...byDay.entries()].sort((a, b) => b[1] - a[1]);
      if (sorted[0]) {
        const [, count] = sorted[0];
        out.push(`共整理 ${blockedSlots.length} 节课程/固定日程，已自动分布到上午、下午与晚上`);
        if (count >= 3) out.push(`${sorted[0][0].slice(5)} 课程相对集中（${count} 节），建议当天只安排轻量待办`);
      }
    }
    if (tasks.length) {
      const urgent = tasks.filter(t => t.priority === 'high').length;
      out.push(`梳理出 ${tasks.length} 项待办任务${urgent ? `（其中 ${urgent} 项临近或较重要）` : ''}`);
    }
    if (dayAdjustments.length) {
      out.push(`已识别 ${dayAdjustments.length} 条可用时间或休息说明`);
    }
    if (!out.length) out.push('未发现明显冲突，其余空档可自由呼吸与休息');
    return out.slice(0, 4);
  }

  function effortInfo(raw) {
    if (raw === 'light' || raw === 'small' || Number(raw) <= 40) return { minutes: 30, feel: 'light', label: '随手就能做' };
    if (raw === 'heavy' || raw === 'large' || Number(raw) >= 110) return { minutes: 150, feel: 'heavy', label: '大块 · 分几次' };
    return { minutes: 60, feel: 'medium', label: '坐一会能完' };
  }

  function parseInlinePortalPlainText(rawText, { now = new Date(), days = 126, bellSchedule = [] } = {}) {
    const text = String(rawText || '').replace(/\r\n?/g, '\n');
    const WD_MAP = { '一': 1, '二': 2, '三': 3, '四': 4, '五': 5, '六': 6, '日': 7, '天': 7 };
    const dayHeaderRe = /(?:^|\n)[ \t]*(?:星期|礼拜|周)([一二三四五六日天])(?=\s|$|\t)/g;
    const matches = [...text.matchAll(dayHeaderRe)];
    if (!matches.length) return null;
    const cells = [];
    for (let i = 0; i < matches.length; i++) {
      const m = matches[i];
      const wd = WD_MAP[m[1]] || 0;
      if (!wd) continue;
      const start = (m.index || 0) + m[0].length;
      const end = i + 1 < matches.length ? (matches[i + 1].index || text.length) : text.length;
      const chunk = text.slice(start, end).trim();
      if (!chunk) continue;
      const parts = chunk.split(/\t+/).flatMap(seg => {
        const lines = seg.split('\n').map(s => s.trim()).filter(Boolean);
        const groups = [];
        let cur = [];
        for (const ln of lines) {
          if (/^\d{1,2}(?:\s*[-~到至]\s*\d{1,2})?\s*节/.test(ln) && cur.length) {
            groups.push(cur.join('\n'));
            cur = [ln];
          } else {
            cur.push(ln);
          }
        }
        if (cur.length) groups.push(cur.join('\n'));
        return groups;
      }).filter(Boolean);
      for (const blk of parts) {
        const sm = blk.match(/^(\d{1,2})(?:\s*[-~到至]\s*(\d{1,2}))?\s*节/);
        if (!sm) continue;
        const s1 = Number(sm[1]), s2 = sm[2] ? Number(sm[2]) : s1;
        cells.push({
          weekday: wd,
          section: s2 > s1 ? `${s1}-${s2}` : `${s1}`,
          text: blk
        });
      }
    }
    if (!cells.length) return null;
    try {
      const parsed = parsePortalCells({ v: 1, host: 'clipboard', cells }, { now, days, bellSchedule });
      if (parsed?.portalClasses?.length) return parsed;
    } catch {}
    return null;
  }

  function analyzeImportLocally(rawText, { now = new Date(), days = 126, sourceKind = 'note', bellSchedule = [] } = {}) {
    const rawTrimmed = String(rawText || '').trim();
    if (sourceKind === 'html' || (/<table\b/i.test(rawTrimmed) && /<tr\b/i.test(rawTrimmed) && /<t[dh]\b/i.test(rawTrimmed))) {
      return parseHtmlTimetable(rawTrimmed, { now, days, bellSchedule });
    }
    if (/^\s*\{\s*"v"\s*:\s*1[\s\S]*"cells"\s*:\s*\[/.test(rawTrimmed)) {
      try {
        const portalObj = JSON.parse(rawTrimmed);
        if (Array.isArray(portalObj?.cells)) return parsePortalCells(portalObj, { now, days, bellSchedule });
      } catch {}
    }
    if (sourceKind === 'wakeup' || (/"courseName"\s*:/.test(rawTrimmed) && /"startNode"\s*:/.test(rawTrimmed))) {
      return parseWakeUpSchedule(rawTrimmed, { now, days, bellSchedule });
    }
    if (sourceKind !== 'image' && /(?:星期|礼拜|周)[一二三四五六日天]/.test(rawTrimmed) && /\d{1,2}(?:\s*[-~到至]\s*\d{1,2})?\s*节/.test(rawTrimmed)) {
      const inlinePortal = parseInlinePortalPlainText(rawTrimmed, { now, days, bellSchedule });
      if (inlinePortal) return inlinePortal;
    }
    const cleaned = sourceKind === 'image' ? normalizeOCRText(rawText) : rawTrimmed;
    let parsed;
    if (/BEGIN:VCALENDAR|BEGIN:VEVENT/i.test(cleaned)) {
      parsed = parseICS(cleaned, { now, days });
    } else if (sourceKind === 'csv' || (cleaned.includes(',') && cleaned.split(/\r?\n/).length >= 2 && /课程|星期|节次|周一|周二|周三|周四|周五/.test(cleaned.split(/\r?\n/)[0]))) {
      try {
        parsed = parseCSVTimetable(cleaned, { now, days, bellSchedule });
      } catch {
        parsed = parseNoteOrTimetable(cleaned, { now, days, bellSchedule });
      }
    } else {
      parsed = parseNoteOrTimetable(cleaned, { now, days, bellSchedule });
    }

    const tasks = (parsed.tasks || []).map(t => {
      const ef = effortInfo(t.estimateMinutes);
      return { ...t, estimateMinutes: ef.minutes, effortFeel: ef.feel, effortLabel: ef.label, checked: true };
    });
    const blockedSlots = (parsed.blockedSlots || []).map(b => ({ ...b, checked: true }));
    const bellOut = parsed.bellSchedule || [];
    const insights = buildCalmInsights(blockedSlots, tasks, parsed.dayAdjustments || [], now, bellOut);
    return {
      mode: 'rules',
      rawText: cleaned,
      summary: parsed.summary || '已完成整理',
      insights,
      blockedSlots,
      tasks,
      dayAdjustments: parsed.dayAdjustments || [],
      bellSchedule: bellOut
    };
  }

  function normalizeRemoteAnalysis(raw, { now = new Date(), days = 126, bellSchedule = [] } = {}) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw Error('归纳结果格式无效');
    const validPeriods = new Set(['morning', 'noon', 'afternoon', 'evening']);
    const nominal = { morning: [9, 0, 10, 30], noon: [12, 30, 13, 30], afternoon: [14, 30, 16, 0], evening: [19, 30, 21, 0] };
    const extractedBell = normalizeBellEntries(raw.bellSchedule);
    const effectiveBell = normalizeBellEntries([...(Array.isArray(bellSchedule) ? bellSchedule : []), ...extractedBell]);
    const bellMap = new Map(effectiveBell.map(b => [b.section, b]));
    const blockedSlots = [];
    const classes = Array.isArray(raw.classes) ? raw.classes.slice(0, 40) : [];

    for (const c of classes) {
      if (!c || typeof c !== 'object') continue;
      const title = String(c.title || '').trim().slice(0, 100);
      if (!title) continue;
      const location = String(c.location || '').trim().slice(0, 60);
      const secM = String(c.section || '').match(/(\d{1,2})(?:\s*[-~到至]\s*(\d{1,2}))?/);
      let sh, sm, eh, em;
      let per = validPeriods.has(c.period) ? c.period : '';
      let hideClock = false;
      let matchedBell = false;
      let secS1, secS2;
      if (secM) {
        const s1 = Math.max(1, Math.min(16, Number(secM[1])));
        const s2 = Math.max(s1, Math.min(16, Number(secM[2] || s1)));
        secS1 = s1;
        secS2 = s2;
        const b1 = bellMap.get(s1), b2 = bellMap.get(s2);
        const p1 = b1 ? parseClockHM(b1.start) : null;
        const p2 = b2 ? parseClockHM(b2.end) : null;
        if (p1 && p2 && p2.total > p1.total) {
          [sh, sm] = [p1.h, p1.m];
          [eh, em] = [p2.h, p2.m];
          hideClock = false;
          matchedBell = true;
          per = periodOfHour(sh, sm);
        } else {
          [sh, sm] = SECTION_START[s1] || [8, 0];
          [eh, em] = SECTION_END[s2] || [sh + 1, 40];
          hideClock = true;
          if (!per) per = periodOfHour(sh, sm);
        }
      } else {
        per = per || 'morning';
        [sh, sm, eh, em] = nominal[per];
        hideClock = true;
      }

      const fullTitle = [title, secM ? `${secM[1]}${secM[2] ? '-' + secM[2] : ''}节` : '', location ? `(${location})` : ''].filter(Boolean).join(' · ').slice(0, 120);
      const dateStr = typeof c.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(c.date) ? c.date : '';
      const weekday = Number(c.weekday);
      const offsets = [];
      if (dateStr) {
        const [yy, mm, dd] = dateStr.split('-').map(Number);
        const diff = Math.round((new Date(yy, mm - 1, dd).getTime() - atDay(now, 0).getTime()) / DAY_MS);
        if (diff >= -2 && diff <= days) offsets.push(diff);
      } else if (Number.isInteger(weekday) && weekday >= 1 && weekday <= 7) {
        const curDow = now.getDay() || 7;
        let delta = weekday - curDow;
        if (c.recurrence === 'once') {
          if (delta < 0) delta += 7;
          if (delta <= days) offsets.push(delta);
        } else {
          if (delta < 0) delta += 7;
          for (let d = delta; d <= days; d += 7) offsets.push(d);
        }
      } else {
        offsets.push(0);
      }

      for (const off of offsets) {
        const sDt = atDay(now, off, sh, sm);
        const eDt = atDay(now, off, eh, em);
        blockedSlots.push({
          start: sDt.toISOString(),
          end: eDt.toISOString(),
          title: fullTitle,
          location,
          day: fmtDate(sDt),
          period: per,
          ...(secS1 ? { sectionStart: secS1, sectionEnd: secS2 } : {}),
          ...(Number.isInteger(c.weekStart) ? { weekStart: c.weekStart } : {}),
          ...(Number.isInteger(c.weekEnd) ? { weekEnd: c.weekEnd } : {}),
          ...(c.weekMode && c.weekMode !== 'all' ? { weekMode: c.weekMode } : {}),
          ...(c.teacher ? { teacher: String(c.teacher).slice(0, 40) } : {}),
          ...(Number.isInteger(c.colorIdx) ? { colorIdx: c.colorIdx } : {}),
          hideClock,
          ...(matchedBell ? { bellCalibrated: true } : {}),
          source: 'deepseek',
          checked: true
        });
      }
    }

    const tasks = [];
    const rawTasks = Array.isArray(raw.tasks) ? raw.tasks.slice(0, 20) : [];
    for (const t of rawTasks) {
      if (!t || typeof t !== 'object') continue;
      const title = String(t.title || '').trim().slice(0, 120);
      if (!title) continue;
      const course = String(t.course || '').trim().slice(0, 80);
      const notes = String(t.notes || '').trim().slice(0, 500);
      const prio = ['high', 'medium', 'low'].includes(t.priority) ? t.priority : 'medium';
      const dueStr = typeof t.due === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(t.due) ? t.due : '';
      let deadline = '';
      if (dueStr) {
        const [yy, mm, dd] = dueStr.split('-').map(Number);
        deadline = new Date(yy, mm - 1, dd, 22, 0, 0, 0).toISOString();
      }
      const ef = effortInfo(t.effortFeel || 'medium');
      tasks.push({
        title,
        course,
        deadline,
        due: dueStr,
        estimateMinutes: ef.minutes,
        effortFeel: ef.feel,
        effortLabel: ef.label,
        priority: prio,
        schedulePriority: prio,
        splittable: true,
        minChunk: 25,
        notes: notes || '由截图 / 课表归纳提取',
        checked: true
      });
    }

    const dayAdjustments = [];
    if (Array.isArray(raw.dayAdjustments)) {
      for (const a of raw.dayAdjustments.slice(0, 10)) {
        if (!a || typeof a !== 'object') continue;
        const dayStr = typeof a.day === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(a.day) ? a.day : fmtDate(now);
        const total = Math.max(30, Math.min(720, Number(a.totalMinutes) || 90));
        dayAdjustments.push({ day: dayStr, totalMinutes: total, startHour: 19, startMin: 0, note: String(a.note || '状态或时间调整').slice(0, 120) });
      }
    }

    const mergedSlots = mergeBlockedSlots([], blockedSlots).slots;
    const uniqueTasks = dedupeTasksList([], tasks).tasks;
    const summary = String(raw.summary || '').trim().slice(0, 240)
      || (extractedBell.length && !mergedSlots.length && !uniqueTasks.length
        ? `LifeOS 已识别 ${extractedBell.length} 个作息节次，可一键校准已导入课程`
        : `LifeOS 已归纳出 ${mergedSlots.length} 节课程与 ${uniqueTasks.length} 项待办`);
    const rawInsights = Array.isArray(raw.insights) ? raw.insights.map(x => String(x || '').trim().slice(0, 120)).filter(Boolean).slice(0, 4) : [];
    const insights = rawInsights.length ? rawInsights : buildCalmInsights(mergedSlots, uniqueTasks, dayAdjustments, now, extractedBell);
    mergedSlots.sort((a, b) => Date.parse(a.start) - Date.parse(b.start));

    return {
      mode: 'deepseek',
      summary,
      insights,
      blockedSlots: mergedSlots,
      tasks: uniqueTasks,
      dayAdjustments,
      bellSchedule: extractedBell
    };
  }

  const SAMPLE_STICKY_NOTE = [
    '每周一 1-2节 高等数学 (A201)',
    '每周三 3-4节 现代汉语 (204室)',
    '明天下午 2点-3点半 院里班会',
    '周五前交高数作业 大块分几次做',
    '现代汉语前三章重点整理 坐一会能完',
    '今晚挺累只保底'
  ].join('\n');

  const api = Object.freeze({
    parseICS,
    parseCSVTimetable,
    parseHtmlTimetable,
    parseWakeUpSchedule,
    parsePortalCells,
    BELL_PRESETS,
    buildPortalExtractorCode,
    buildPortalBookmarklet,
    parseNoteOrTimetable,
    normalizeOCRText,
    reconstructTimetableFromOCR,
    analyzeImportLocally,
    normalizeRemoteAnalysis,
    parseBellSchedule,
    normalizeBellEntries,
    extractSectionRange,
    applyBellScheduleToSlots,
    canonicalCourseKey,
    canonicalTaskKey,
    mergeBlockedSlots,
    dedupeTasksList,
    periodOfMinute,
    periodOfHour,
    SAMPLE_STICKY_NOTE
  });

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.LifeOSScheduleImporter = api;
})(typeof window !== 'undefined' ? window : globalThis);
