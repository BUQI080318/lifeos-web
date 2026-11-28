const destInput = document.getElementById('dest');
const grabBtn = document.getElementById('grab');
const statusEl = document.getElementById('status');

try {
  const saved = localStorage.getItem('lifeos-dest-url');
  if (saved) destInput.value = saved;
} catch {}

function extractTimetableInPage() {
  const WM = { '一': 1, '二': 2, '三': 3, '四': 4, '五': 5, '六': 6, '日': 7, '天': 7, '1': 1, '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7 };
  function parseDay(s) {
    const clean = String(s || '').replace(/\s+/g, '');
    const m = clean.match(/(?:星期|礼拜|周)([一二三四五六日天1-7])/);
    return m ? (WM[m[1]] || 0) : 0;
  }
  function collectDocs(win, depth) {
    const out = [];
    try { if (win.document) out.push(win.document); } catch { return out; }
    if (depth > 2) return out;
    const frames = win.document.querySelectorAll('iframe,frame');
    for (const f of frames) {
      try { if (f.contentWindow) out.push(...collectDocs(f.contentWindow, depth + 1)); } catch {}
    }
    return out;
  }

  let best = [];
  for (const doc of collectDocs(window, 0)) {
    const tables = doc.querySelectorAll('table');
    for (const tbl of tables) {
      const trs = tbl.rows;
      if (!trs || trs.length < 3) continue;
      const grid = [], occ = [], uniqueCells = [];
      for (let r = 0; r < trs.length; r++) {
        grid[r] = grid[r] || [];
        occ[r] = occ[r] || [];
        let c = 0;
        for (const el of trs[r].cells) {
          while (occ[r][c]) c++;
          const rs = Math.max(1, el.rowSpan || 1);
          const cs = Math.max(1, el.colSpan || 1);
          const obj = { r, c, rs, t: (el.innerText || el.textContent || '').trim() };
          uniqueCells.push(obj);
          for (let dr = 0; dr < rs; dr++) {
            grid[r + dr] = grid[r + dr] || [];
            occ[r + dr] = occ[r + dr] || [];
            for (let dc = 0; dc < cs; dc++) {
              occ[r + dr][c + dc] = 1;
              grid[r + dr][c + dc] = obj;
            }
          }
          c += cs;
        }
      }
      let colDay = {}, headerRow = -1;
      for (let r = 0; r < Math.min(4, grid.length); r++) {
        const mp = {};
        let cnt = 0;
        for (let c = 0; c < (grid[r] || []).length; c++) {
          const d = parseDay(grid[r][c]?.t);
          if (d) { mp[c] = d; cnt++; }
        }
        if (cnt >= 3) { colDay = mp; headerRow = r; break; }
      }
      if (headerRow < 0) continue;
      const minC = Math.min(...Object.keys(colDay).map(Number));
      const rowSec = {};
      let seq = 0;
      for (let r = headerRow + 1; r < grid.length; r++) {
        let sn = 0;
        for (let c = 0; c < minC; c++) {
          const ax = (grid[r][c]?.t || '').trim();
          const sm = ax.match(/第?\s*(\d{1,2})\s*节/) || ax.match(/^(\d{1,2})$/);
          if (sm) { sn = Number(sm[1]); break; }
        }
        if (!sn) {
          for (let c = minC; c < (grid[r] || []).length; c++) {
            if (grid[r][c]?.t) { seq++; sn = seq; break; }
          }
        } else {
          seq = sn;
        }
        if (sn >= 1 && sn <= 16) rowSec[r] = sn;
      }
      const out = [];
      for (const u of uniqueCells) {
        if (u.r <= headerRow || !u.t) continue;
        const wd = colDay[u.c];
        if (!wd) continue;
        const s1 = rowSec[u.r];
        if (!s1) continue;
        const s2 = rowSec[u.r + u.rs - 1] || Math.min(16, s1 + u.rs - 1);
        out.push({ weekday: wd, section: s2 > s1 ? `${s1}-${s2}` : String(s1), text: u.t });
      }
      if (out.length > best.length) best = out;
    }
  }
  return { host: location.host, cells: best };
}

grabBtn.addEventListener('click', async () => {
  const destBase = (destInput.value || 'http://127.0.0.1:4821/lifeos-web/').trim().split('#')[0].split('?')[0];
  try { localStorage.setItem('lifeos-dest-url', destBase); } catch {}
  grabBtn.disabled = true;
  statusEl.className = 'msg';
  statusEl.textContent = '正在读取当前教务页课表表格…';
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) throw Error('未找到当前标签页');
    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id, allFrames: true },
      func: extractTimetableInPage
    });
    let bestPayload = null;
    for (const r of results || []) {
      const val = r?.result;
      if (val?.cells?.length && (!bestPayload || val.cells.length > bestPayload.cells.length)) {
        bestPayload = val;
      }
    }
    if (!bestPayload?.cells?.length) {
      throw Error('未在当前页面检测到教务课表表格，请确认已打开“个人课表”页面。');
    }
    const payload = { v: 1, host: bestPayload.host || '', cells: bestPayload.cells };
    const b64 = btoa(unescape(encodeURIComponent(JSON.stringify(payload))));
    statusEl.textContent = `已抓取 ${payload.cells.length} 个课程格，正在打开 LifeOS…`;
    await chrome.tabs.create({ url: `${destBase}?import_kb=${encodeURIComponent(b64)}#space/workbench` });
  } catch (err) {
    statusEl.className = 'msg err';
    statusEl.textContent = err?.message || '抓取失败';
  } finally {
    grabBtn.disabled = false;
  }
});
