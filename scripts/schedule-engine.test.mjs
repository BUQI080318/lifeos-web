import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import engine from '../site/workbench/assets/schedule-engine.js';
import restartEngine from '../site/workbench/assets/restart-engine.js';
import modelModule from '../site/workbench/assets/restart-model.js';
import studyUi from '../site/workbench/assets/study-ui.js';
import contextHelper from '../site/workbench/assets/study-context.js';
import studyPlanner from '../site/workbench/assets/study-planner.js';
import promptBank from '../site/workbench/assets/prompt-bank.js';
globalThis.LifeOSStudyPlanner = studyPlanner;
globalThis.LifeOSPromptBank = promptBank;

const casesUrl = new URL('../lifeos-kit/tests/cases.json', import.meta.url);
const expectedUrl = new URL('../lifeos-kit/tests/expected.json', import.meta.url);
const engineUrl = new URL('../site/workbench/assets/schedule-engine.js', import.meta.url);

test('schedule-engine passes all 6 LifeOS-kit golden cases byte-for-byte without mutating inputs', async () => {
  const cases = JSON.parse(await readFile(casesUrl, 'utf8'));
  const expected = JSON.parse(await readFile(expectedUrl, 'utf8'));
  const golden = new Map(expected.runs.map(item => [item.case, item.output]));

  for (const c of cases) {
    if (c.id === 'C6') {
      const clampRes = engine.calibrationFactor(c.history_clamp);
      const fewRes = engine.calibrationFactor(c.history_few);
      assert.deepEqual(clampRes, expected.calibration.C6_clamp);
      assert.deepEqual(fewRes, expected.calibration.C6_few);
      continue;
    }

    let k = c.k ?? 1.0;
    if (c.k_source) {
      const cal = engine.calibrationFactor(c.k_source);
      if (expected.calibration[c.id]) {
        assert.deepEqual(cal, expected.calibration[c.id]);
      }
      k = cal.k;
    }

    const beforeTasks = JSON.stringify(c.tasks);
    const beforeDays = JSON.stringify(c.days);
    const actual = engine.schedule(c.tasks, c.days, k, c.today, c.horizon_days);

    // Must not mutate inputs
    assert.equal(JSON.stringify(c.tasks), beforeTasks, `${c.id}: mutated tasks`);
    assert.equal(JSON.stringify(c.days), beforeDays, `${c.id}: mutated days`);

    // Must match golden expected output field-for-field
    assert.deepEqual(actual, golden.get(c.id), `${c.id} output mismatch`);
  }
});

test('schedule-engine source contains no forbidden buzzwords and enforces minChunk & validateTask rules', async () => {
  const src = await readFile(engineUrl, 'utf8');
  for (const forbidden of ['AI', '智能', '大模型']) {
    assert.equal(src.includes(forbidden), false, `schedule-engine.js must not contain "${forbidden}"`);
  }

  assert.equal(engine.validateTask({ id: '1', name: 'x', estimateMin: 0, deadline: '2026-11-30', priority: 'high' }, '2026-11-24').status, 'invalid');
  assert.equal(engine.validateTask({ id: '2', name: 'x', estimateMin: 30, deadline: null, priority: 'none' }, '2026-11-24').status, 'invalid');
  assert.equal(engine.validateTask({ id: '3', name: 'x', estimateMin: 30, deadline: '2026-12-05', priority: 'high', startDate: '2026-12-01' }, '2026-11-24').status, 'deferred');
});

test('restart-model controller integrates calibration k (P2), C2 scenario, and lossless JSON export/import (P3)', async () => {
  const fixedNow = '2026-11-24T10:00:00+08:00';
  const makeStore = () => {
    let snap = { version: 1, profile: {}, goals: [{ id: 'g', title: '复习' }], tasks: [], records: [], trash: [], updatedAt: null };
    const raw = { getItem: () => (snap.updatedAt ? JSON.stringify(snap) : null) };
    return {
      storage: raw,
      snapshot: () => structuredClone(snap),
      commit(v) {
        snap = structuredClone(v);
        snap.updatedAt = new Date(Date.parse(fixedNow) + (++this.clock) * 1000).toISOString();
        return this.snapshot();
      },
      clock: 0
    };
  };

  let idSeq = 0;
  const ctrl = modelModule.createController({
    store: makeStore(),
    engine: restartEngine,
    scheduleEngine: engine,
    now: () => new Date(fixedNow),
    uid: () => `u-${++idSeq}`
  });

  // P2: fewer than 3 samples uses default 1.0; 3 samples updates to personal median 1.556
  assert.equal(ctrl.getModel().calibration.k, 1.0);
  assert.equal(ctrl.getModel().calibration.source, 'default');
  await ctrl.dispatch('add-calibration-record', { title: '现代汉语一章', estimate: 60, actual: 95 });
  await ctrl.dispatch('add-calibration-record', { title: '词汇整理', estimate: 30, actual: 40 });
  assert.equal(ctrl.getModel().calibration.k, 1.0);
  assert.equal(ctrl.getModel().calibration.source, 'default');
  await ctrl.dispatch('add-calibration-record', { title: '古代汉语练习', estimate: 45, actual: 70 });
  assert.equal(ctrl.getModel().calibration.n, 3);
  assert.equal(ctrl.getModel().calibration.source, 'personal');
  assert.ok(Math.abs(ctrl.getModel().calibration.k - 1.556) < 0.002);

  // Add tasks & set today remaining 90 min
  await ctrl.dispatch('save-task', { title: '现代汉语章节复习', deadline: '2026-11-30T23:59', estimateMinutes: 180, priority: 'high', splittable: true, minChunk: 25 });
  await ctrl.dispatch('save-task', { title: '英语写作练习', deadline: '2026-12-02T23:59', estimateMinutes: 90, priority: 'medium', splittable: true, minChunk: 30 });
  await ctrl.dispatch('save-task', { title: '课外阅读', deadline: '', estimateMinutes: 120, priority: 'low', splittable: true, minChunk: 20 });
  await ctrl.dispatch('set-today-minutes', { minutes: 90 });

  const beforeExport = ctrl.exportScheduleBundle();
  assert.equal(beforeExport.scheduleReport.capacityRawMin, 90);
  assert.deepEqual(beforeExport.scheduleReport.dropped.map(d => d.name), ['课外阅读', '英语写作练习']);

  // P3: Export and import into a fresh controller — scheduleReport must match identically
  const ctrl2 = modelModule.createController({
    store: makeStore(),
    engine: restartEngine,
    scheduleEngine: engine,
    now: () => new Date(fixedNow),
    uid: () => `u2-${++idSeq}`
  });
  await ctrl2.dispatch('import-schedule-json', { data: JSON.parse(JSON.stringify(beforeExport)) });
  assert.deepEqual(ctrl2.getModel().scheduleReport, beforeExport.scheduleReport);
  assert.equal(ctrl2.getModel().calibration.k, ctrl.getModel().calibration.k);

  // Demo C2 preset check (never touches real account data)
  await ctrl.dispatch('demo-c2');
  const demoReport = ctrl.getModel().scheduleReport;
  assert.equal(demoReport.capacityRawMin, 90);
  assert.equal(demoReport.scheduled[0].status, 'partially');
  assert.equal(demoReport.remainder[0].placedMin, 90);
  assert.equal(demoReport.remainder[0].remainderMin, 90);
  assert.deepEqual(demoReport.dropped.map(d => [d.task, d.dropCost]), [['r1', 0], ['e1', 0.0611]]);
  await ctrl.dispatch('demo-end');
  assert.equal(ctrl.getModel().calibration.n, 3);
});

test('restart-ui renders C2 three-section triage, 3-sample k calibration flow, and 2D priority validation', async () => {
  const fixedNow = '2026-11-24T10:00:00+08:00';
  let snap = { version: 1, profile: {}, goals: [{ id: 'g', title: '复习' }], tasks: [], records: [], trash: [], updatedAt: null };
  let clock = 0, idSeq = 0;
  const store = {
    storage: { getItem: () => (snap.updatedAt ? JSON.stringify(snap) : null) },
    snapshot: () => structuredClone(snap),
    commit(v) {
      snap = structuredClone(v);
      snap.updatedAt = new Date(Date.parse(fixedNow) + (++clock) * 1000).toISOString();
      return this.snapshot();
    }
  };
  const adapter = modelModule.createController({
    store,
    engine: restartEngine,
    scheduleEngine: engine,
    now: () => new Date(fixedNow),
    uid: () => `ui-${++idSeq}`
  });

  const listeners = {};
  const root = {
    contains: () => true,
    querySelectorAll: () => [],
    querySelector: () => null,
    addEventListener: (k, v) => (listeners[k] = v),
    removeEventListener: k => delete listeners[k],
    replaceChildren() {},
    innerHTML: ''
  };
  class FD {
    constructor(form) { this.data = form.data || {}; }
    get(k) { return this.data[k]; }
    has(k) { return Object.hasOwn(this.data, k); }
    getAll(k) { return this.data[k] || []; }
    entries() { return Object.entries(this.data)[Symbol.iterator](); }
    [Symbol.iterator]() { return this.entries(); }
  }
  const winListeners = {};
  const win = {
    LifeOSStudyUI: studyUi,
    LifeOSStudyContext: contextHelper,
    LifeOSStudyPlanner: studyPlanner,
    LifeOSPromptBank: promptBank,
    LifeOSScheduleEngine: engine,
    LifeOSAssistantRequest: async () => { throw Error('should not route strategy flow to legacy understand bridge'); },
    LifeOSRestartAssistant: { createIntake: () => ({ busy: false, cancel() {}, async run() { return null; } }) },
    LifeOSAccountStorage: { getItem: () => null, setItem() {} },
    location: { origin: 'http://127.0.0.1:4821' },
    addEventListener(k, v) { winListeners[k] = v; },
    removeEventListener(k) { delete winListeners[k]; }
  };
  const uiCode = await readFile(new URL('../site/workbench/assets/restart-ui.js', import.meta.url), 'utf8');
  vm.runInNewContext(uiCode, {
    window: win, FormData: FD, Date, Intl, console, setTimeout, clearTimeout,
    matchMedia: () => ({ matches: true })
  });
  const mounted = win.LifeOSRestartUI.mount(root, adapter);
  const click = async (action, id = '') => listeners.click({ target: { dataset: { rsAction: action, rsId: id }, closest() { return this; } } });
  const submit = async (rsForm, data) => listeners.submit({ target: { dataset: { rsForm }, data, closest() { return this; } }, preventDefault() {} });

  const imp = await import('../site/workbench/assets/schedule-importer.js');
  const importer = imp.default;

  // 1. Trigger demo-c2 and verify humane today-state switch + 3-level zoom + no fake clocks or quota interrogation
  await click('demo-c2');
  assert.match(root.innerHTML, /data-tl-viewport="day"/);
  assert.match(root.innerHTML, /data-rs-ruler-track/);
  for (const period of ['上午', '中午', '下午', '晚上']) assert.ok(root.innerHTML.includes(period));
  for (const st of ['只保底', '正常节奏', '状态好']) assert.ok(root.innerHTML.includes(st));
  for (const banned of ['08:00–12:00', '12:00–14:00', '14:00–18:00', '18:00–23:30', '今天还可学：', '建议推进 90′']) {
    assert.equal(root.innerHTML.includes(banned), false, `UI must not render "${banned}"`);
  }
  assert.match(root.innerHTML, /今天先做这一步|先推这一步/);
  assert.match(root.innerHTML, /现代汉语章节复习/);
  assert.match(root.innerHTML, /可用 90 分钟，按 k=1\.0 折算相当于 90 分钟的原始估时/);
  assert.match(root.innerHTML, /课外阅读/);

  await click('today-state', 'normal');
  assert.match(root.innerHTML, /已切到「正常节奏」/);
  await click('today-state', 'light');
  assert.match(root.innerHTML, /已切到「只保底」/);

  await click('set-zoom', 'month');
  assert.match(root.innerHTML, /data-tl-viewport="month"/);
  assert.match(root.innerHTML, /进入本月具体日期/);

  await click('set-zoom', 'period');
  assert.match(root.innerHTML, /class="rs-open-periods"/);
  assert.match(root.innerHTML, /今天先做这一步/);
  assert.match(root.innerHTML, /余下部分已顺延至/);

  // 2. Open standalone settings page & verify calibration record updates k cleanly, without mixing timeline
  await click('toggle-tools');
  assert.match(root.innerHTML, /设置与数据备份/);
  assert.doesNotMatch(root.innerHTML, /data-tl-viewport/);
  assert.match(root.innerHTML, /估时系数 1\.00×/);
  await submit('calibration', { title: '现代汉语一章', estimate: '60', actual: '95', taskId: '' });
  await submit('calibration', { title: '词汇整理', estimate: '30', actual: '40', taskId: '' });
  await submit('calibration', { title: '古代汉语阅读', estimate: '45', actual: '70', taskId: '' });
  assert.match(root.innerHTML, /1\.56×|1\.556/);
  await click('go-overview');
  assert.match(root.innerHTML, /可用 90 分钟，按 k=1\.556 折算相当于 57 分钟的原始估时/);

  // 3. Test sticky-note & .ics timetable parser + dispatch import
  const parsedNote = importer.parseNoteOrTimetable('周一 1-2节 高等数学\n周四前交实验报告 约2小时\n今晚只剩90分钟', { now: new Date(fixedNow) });
  assert.ok(parsedNote.blockedSlots.length >= 1, 'Course line must yield blockedSlots');
  assert.equal(parsedNote.tasks.length, 1);
  assert.equal(parsedNote.tasks[0].estimateMinutes, 120);
  assert.equal(parsedNote.dayAdjustments.length, 1);
  assert.equal(parsedNote.dayAdjustments[0].totalMinutes, 90);

  const icsText = [
    'BEGIN:VCALENDAR',
    'BEGIN:VEVENT',
    'SUMMARY:数字逻辑电路',
    'LOCATION:教一 302',
    'DTSTART:20261124T140000',
    'DTEND:20261124T154000',
    'RRULE:FREQ=WEEKLY;COUNT=2',
    'END:VEVENT',
    'END:VCALENDAR'
  ].join('\r\n');
  const parsedIcs = importer.parseICS(icsText, { now: new Date(fixedNow) });
  assert.equal(parsedIcs.blockedSlots.length, 2);
  assert.match(parsedIcs.blockedSlots[0].title, /数字逻辑电路/);

  const cleanedOcr = importer.normalizeOCRText('每 周 一 1 一 2 节 高 等 数 学 （ A201 ）');
  assert.equal(cleanedOcr, '每周一1-2节高等数学(A201)');
  const parsedCsv = importer.parseCSVTimetable('课程,星期,节次,教室\n线性代数,周二,3-4节,B102', { now: new Date(fixedNow) });
  assert.ok(parsedCsv.blockedSlots.length >= 1);
  assert.match(parsedCsv.blockedSlots[0].title, /线性代数/);
  const normalizedRemote = importer.normalizeRemoteAnalysis({
    summary: '已识别 1 门课程与 1 项待办',
    insights: ['周二上午有固定课'],
    classes: [{ title: '高等数学', weekday: 1, date: '', section: '1-2', period: 'morning', location: 'A201', recurrence: 'weekly' }],
    tasks: [{ title: '整理高数第一章', course: '高等数学', due: '2026-11-28', effortFeel: 'light', priority: 'high', notes: '' }],
    dayAdjustments: []
  }, { now: new Date(fixedNow) });
  assert.equal(normalizedRemote.mode, 'deepseek');
  assert.ok(normalizedRemote.blockedSlots.length >= 1);
  assert.equal(normalizedRemote.tasks[0].effortLabel, '随手就能做');

  // 4. Open task form and verify humane effort-feel pills + 2D priority selector inside optional details
  await click('new-task');
  for (const ef of ['随手就能做', '坐一会能完', '大块 · 分几次']) {
    assert.ok(root.innerHTML.includes(ef), `Task form must show effort-feel pill "${ef}"`);
  }
  assert.match(root.innerHTML, /紧迫度（按截止日期自动判断）/);
  assert.match(root.innerHTML, /重要程度/);
  assert.match(root.innerHTML, /最小分块（分钟）/);

  // Ensure [data-rs-unified-file] supports multi-file batch selection & no forbidden buzzwords were added
  assert.match(uiCode, /<input type="file" multiple [^>]*data-rs-unified-file/);
  for (const forbidden of ['AI 规划', '智能排程', '智能推荐', '自动优化']) {
    assert.equal(uiCode.includes(forbidden), false, `restart-ui.js must not contain "${forbidden}"`);
  }

  // 5. Verify bell schedule extraction, multi-file batch parsing, afternoon 13:30 cutoff, and model calibration + undo
  const bellParsed = importer.parseBellSchedule('教学作息时间安排表\n上午\n第一大节 08:00-09:40\n下午\n第三大节 13:30-15:05\n晚上\n第五大节 18:30-21:05');
  assert.ok(bellParsed.bellSchedule.length >= 6);
  const sec5 = bellParsed.bellSchedule.find(b => b.section === 5);
  assert.equal(sec5?.start, '13:30');
  assert.equal(sec5?.period, 'afternoon', '13:30 class must classify as afternoon, not noon');

  // Verify DeepSeek returning major blocks 1..5 auto-expands cleanly into 11 small sections
  const expandedMajorBell = importer.normalizeBellEntries([
    { section: 1, start: '08:00', end: '09:40', period: 'morning' },
    { section: 2, start: '10:00', end: '11:40', period: 'morning' },
    { section: 3, start: '13:30', end: '15:05', period: 'afternoon' },
    { section: 4, start: '15:25', end: '17:00', period: 'afternoon' },
    { section: 5, start: '18:30', end: '21:05', period: 'evening' }
  ]);
  assert.equal(expandedMajorBell.length, 11);
  assert.equal(expandedMajorBell.find(b => b.section === 5)?.start, '13:30');
  assert.equal(expandedMajorBell.find(b => b.section === 5)?.period, 'afternoon');
  assert.equal(expandedMajorBell.find(b => b.section === 11)?.end, '21:05');

  const batchText = '【文件 1：timetable.png】\n每周一 1-2节 高等数学 (A201)\n每周一 5-6节 大学英语 (B302)\n\n【文件 2：bell.png】\n第一大节 08:00-09:40\n第三大节 13:30-15:05';
  const batchAnalyzed = importer.analyzeImportLocally(batchText, { now: new Date(fixedNow), days: 14, sourceKind: 'note' });
  assert.ok(batchAnalyzed.bellSchedule.length >= 4);
  const engBatch = batchAnalyzed.blockedSlots.find(s => s.title.includes('大学英语'));
  assert.ok(engBatch, 'Batch analysis must extract course from File 1 alongside bell schedule in File 2');
  assert.equal(engBatch.period, 'afternoon');
  assert.equal(engBatch.hideClock, false);
  assert.equal(engBatch.bellCalibrated, true);

  const rawStoreData = { version: 1, profile: {}, goals: [], tasks: [], records: [], trash: [], updatedAt: null, restart: { version: 1, slots: [], schedule: [], events: [], undo: null } };
  const testStore = { snapshot: () => structuredClone(rawStoreData), commit: next => Object.assign(rawStoreData, structuredClone(next)) };
  const modelCtrl = modelModule.createController({ store: testStore, engine: restartEngine, scheduleEngine: engine, now: () => new Date(fixedNow) });
  await modelCtrl.dispatch('import-timetable-note', {
    blockedSlots: importer.parseNoteOrTimetable('每周一 1-2节 高等数学 (A201)\n每周一 5-6节 现代汉语 (C105)', { now: new Date(fixedNow), days: 7 }).blockedSlots,
    tasks: [],
    dayAdjustments: []
  });
  const beforeCal = modelCtrl.getModel().blockedSlots.find(b => b.title.includes('现代汉语'));
  assert.equal(beforeCal.hideClock, true);
  await modelCtrl.dispatch('import-timetable-note', {
    blockedSlots: [],
    tasks: [],
    dayAdjustments: [],
    bellSchedule: bellParsed.bellSchedule
  });
  const afterCal = modelCtrl.getModel().blockedSlots.find(b => b.title.includes('现代汉语'));
  assert.equal(afterCal.hideClock, false);
  assert.equal(afterCal.bellCalibrated, true);
  assert.equal(afterCal.period, 'afternoon');
  const startDt = new Date(afterCal.start);
  assert.equal(`${String(startDt.getHours()).padStart(2, '0')}:${String(startDt.getMinutes()).padStart(2, '0')}`, '13:30');
  await modelCtrl.dispatch('undo-plan');
  assert.equal(modelCtrl.getModel().bellSchedule.length, 0);
  assert.equal(modelCtrl.getModel().blockedSlots.find(b => b.title.includes('现代汉语')).hideClock, true);

  // Verify schoolProfile & customLinks persistence + export/import roundtrip
  await modelCtrl.dispatch('save-school-profile', {
    schoolName: '清华大学',
    officialDomain: 'tsinghua.edu.cn',
    note: '核对后使用',
    portals: [{ name: '教务处', category: '教务处', url: 'https://jwc.tsinghua.edu.cn/', notes: '课表与选课' }]
  });
  await modelCtrl.dispatch('add-custom-link', { name: '公开课笔记库', url: 'https://openstax.org/', category: '开源教材', notes: '参考书' });
  assert.equal(modelCtrl.getModel().schoolProfile.schoolName, '清华大学');
  assert.equal(modelCtrl.getModel().customLinks.length, 1);
  const snapBundle = modelCtrl.exportScheduleBundle();
  assert.equal(snapBundle.schoolProfile.schoolName, '清华大学');
  await modelCtrl.dispatch('clear-school-profile');
  await modelCtrl.dispatch('remove-custom-link', { id: snapBundle.customLinks[0].id });
  assert.equal(modelCtrl.getModel().schoolProfile, null);
  assert.equal(modelCtrl.getModel().customLinks.length, 0);
  await modelCtrl.dispatch('import-schedule-json', { data: snapBundle });
  assert.equal(modelCtrl.getModel().schoolProfile.schoolName, '清华大学');
  assert.equal(modelCtrl.getModel().customLinks.length, 1);

  // Verify local BYOK key module isolates keys from exports and filters non-http URLs
  const localAi = await import('../site/workbench/assets/byok-ai.js');
  const byokMod = localAi.default;
  const localMem = new Map();
  const fakeLocalStore = {
    getItem: k => localMem.get(k) ?? null,
    setItem: (k, v) => localMem.set(k, String(v)),
    removeItem: k => localMem.delete(k)
  };
  assert.equal(byokMod.hasKey(fakeLocalStore), false);
  const masked = byokMod.setKey('test_local_provider_value_1234', fakeLocalStore);
  assert.equal(byokMod.hasKey(fakeLocalStore), true);
  assert.match(masked, /^test_••••••1234$/);
  assert.equal(JSON.stringify(modelCtrl.exportScheduleBundle()).includes('test_local_provider_value_1234'), false);
  const portalRes = await byokMod.lookupSchoolPortals({
    schoolName: '清华大学',
    storage: fakeLocalStore,
    fetcher: async () => new Response(JSON.stringify({
      choices: [{
        message: {
          content: JSON.stringify({
            schoolName: '清华大学',
            officialDomain: 'tsinghua.edu.cn',
            note: '核对后使用',
            portals: [
              { name: '教务处', category: '教务处', url: 'https://www.tsinghua.edu.cn/jwc/', notes: '课表' },
              { name: '非法链接', category: '其他', url: 'javascript:alert(1)', notes: '过滤' }
            ]
          })
        }
      }]
    }), { status: 200 })
  });
  assert.equal(portalRes.portals.length, 1);
  assert.equal(portalRes.portals[0].url, 'https://www.tsinghua.edu.cn/jwc/');
  byokMod.clearKey(fakeLocalStore);
  assert.equal(byokMod.hasKey(fakeLocalStore), false);

  // Verify 2D grid OCR reconstruction preserves exact weekday columns & section rows across adjacent cards
  const gridWords = [
    // Weekday headers (Monday..Friday)
    { text: '星期一', x: 140, y: 40, w: 70, h: 24 },
    { text: '星期二', x: 310, y: 40, w: 70, h: 24 },
    { text: '星期三', x: 480, y: 40, w: 70, h: 24 },
    { text: '星期四', x: 650, y: 40, w: 70, h: 24 },
    { text: '星期五', x: 820, y: 40, w: 70, h: 24 },
    // Sub-header dates that must be skipped cleanly
    { text: '11/23', x: 148, y: 74, w: 54, h: 18 },
    { text: '11/24', x: 318, y: 74, w: 54, h: 18 },
    { text: '11/25', x: 488, y: 74, w: 54, h: 18 },
    { text: '11/26', x: 658, y: 74, w: 54, h: 18 },
    { text: '11/27', x: 828, y: 74, w: 54, h: 18 },
    // Left section axis 1..8 (rowH = 60, y0 = 140)
    ...Array.from({ length: 8 }, (_, k) => ({ text: String(k + 1), x: 32, y: 128 + k * 60, w: 22, h: 24 })),
    // Tuesday period 1-2 (y ~ 125..220) back-to-back with Tuesday period 3-4 (y ~ 245..340)
    { text: '大学生心理健康', x: 280, y: 124, w: 120, h: 22 },
    { text: '教育', x: 280, y: 150, w: 46, h: 22 },
    { text: '(301幢1114)', x: 280, y: 178, w: 110, h: 20 },
    { text: '中国古代文学(一)', x: 280, y: 244, w: 135, h: 22 },
    { text: '(1003幢3305)', x: 280, y: 274, w: 116, h: 20 },
    // Thursday period 1-2 in SAME vertical band as Tuesday period 1-2
    { text: '中外军事思想与', x: 620, y: 124, w: 126, h: 22 },
    { text: '战争实践', x: 620, y: 150, w: 80, h: 22 },
    { text: '(301幢1201)', x: 620, y: 178, w: 110, h: 20 }
  ];
  const recon = importer.reconstructTimetableFromOCR({ words: gridWords, imgW: 960, imgH: 640, fallbackText: 'fallback' });
  assert.equal(recon.isGrid, true);
  assert.equal(recon.cols, 5);
  assert.match(recon.text, /每周二 1-2节 大学生心理健康教育 \(301幢1114\)/);
  assert.match(recon.text, /每周二 3-4节 中国古代文学\(一\) \(1003幢3305\)/);
  assert.match(recon.text, /每周四 1-2节 中外军事思想与战争实践 \(301幢1201\)/);
  const parsedFromGrid = importer.parseNoteOrTimetable(recon.text, { now: new Date(fixedNow), days: 5 });
  assert.equal(parsedFromGrid.blockedSlots.filter(s => s.title.includes('心理健康')).length, 1);
  assert.equal(parsedFromGrid.blockedSlots.filter(s => s.title.includes('古代文学')).length, 1);
  assert.equal(parsedFromGrid.blockedSlots.filter(s => s.title.includes('军事思想')).length, 1);
  assert.equal(parsedFromGrid.tasks.length, 0, 'System grid header must never become a task');
  const nonGrid = importer.reconstructTimetableFromOCR({ words: [{ text: '上午', x: 20, y: 20, w: 40, h: 20 }], imgW: 400, imgH: 300, fallbackText: '第一大节 08:00-09:40' });
  assert.equal(nonGrid.isGrid, false);

  // Verify 12-row table with pixel rows + 3-period course (3-5) unsplit + leading 0->(1 OCR repair + concatenated headers
  const rows12 = Array.from({ length: 13 }, (_, k) => 120 + k * 60);
  const words12 = [
    { text: '周一23', x: 140, y: 40, w: 72, h: 24 },
    { text: '周二24', x: 310, y: 40, w: 72, h: 24 },
    { text: '周三25', x: 480, y: 40, w: 72, h: 24 },
    { text: '周四26', x: 650, y: 40, w: 72, h: 24 },
    { text: '周五27', x: 820, y: 40, w: 72, h: 24 },
    { text: '中国近现代史纲要', x: 620, y: 135, w: 140, h: 22 },
    { text: '(301幢1315)', x: 620, y: 210, w: 110, h: 20 },
    { text: '现代汉语(上)', x: 620, y: 255, w: 120, h: 22 },
    { text: '0 003幢3205)', x: 620, y: 392, w: 112, h: 20 },
    { text: '中共党史', x: 620, y: 552, w: 80, h: 22 },
    { text: '(301幢1114)', x: 620, y: 628, w: 110, h: 20 }
  ];
  const recon12 = importer.reconstructTimetableFromOCR({ words: words12, rows: rows12, imgW: 960, imgH: 880, fallbackText: '' });
  assert.equal(recon12.isGrid, true);
  assert.match(recon12.text, /每周四 1-2节 中国近现代史纲要 \(301幢1315\)/);
  assert.match(recon12.text, /每周四 3-5节 现代汉语\(上\) \(1003幢3205\)/);
  assert.match(recon12.text, /每周四 8-9节 中共党史 \(301幢1114\)/);

  // Verify consecutive same-course merge (3-4 + 5 -> 3-5) & canonical re-import dedup (zero duplicate slots or tasks)
  const modAssistant = await import('../site/workbench/assets/restart-assistant.js');
  const assistantApi = modAssistant.default;
  const noteParsed = importer.parseNoteOrTimetable(
    '每周四 3-4节 现代汉语(上) (1003幢3205)\n每周四 5节 现代汉语(上) (1003幢3205)\n今晚挺累只保底',
    {
      now: new Date(fixedNow),
      days: 5,
      bellSchedule: [
        { section: 3, start: '09:55', end: '10:40' },
        { section: 4, start: '10:45', end: '11:30' },
        { section: 5, start: '11:35', end: '12:20' }
      ]
    }
  );
  assert.equal(noteParsed.blockedSlots.length, 1, 'Adjacent 3-4 + 5 of same course should coalesce into 1 card');
  assert.equal(noteParsed.blockedSlots[0].sectionStart, 3);
  assert.equal(noteParsed.blockedSlots[0].sectionEnd, 5);
  assert.equal(noteParsed.tasks.length, 0, 'Rest intent must not become a study task');
  assert.equal(noteParsed.dayAdjustments.length, 1);

  const dedupBefore = modelCtrl.getModel().blockedSlots.length;
  const thurDay = noteParsed.blockedSlots[0].day;
  await modelCtrl.dispatch('import-timetable-note', {
    blockedSlots: [{ ...noteParsed.blockedSlots[0] }],
    tasks: [{ title: '完成现代汉语第三章练习', due: thurDay, estimateMinutes: 60, priority: 'medium' }]
  });
  const countAfterFirst = modelCtrl.getModel().blockedSlots.length;
  const taskCountAfterFirst = modelCtrl.getModel().tasks.length;
  // Re-import the exact same course with slightly shifted clock and punctuation + identical task
  await modelCtrl.dispatch('import-timetable-note', {
    blockedSlots: [{
      start: `${thurDay}T10:00:00`,
      end: `${thurDay}T12:15:00`,
      day: thurDay,
      title: '现代汉语（上） · 3-5节 · (1003幢3205)',
      location: '1003幢3205',
      period: 'morning',
      sectionStart: 3,
      sectionEnd: 5,
      bellCalibrated: true
    }],
    tasks: [{ title: '完成 现代汉语 第三章练习', due: thurDay, estimateMinutes: 60, priority: 'medium' }]
  });
  assert.equal(modelCtrl.getModel().blockedSlots.length, countAfterFirst, 'Canonical re-import must not duplicate slot');
  assert.equal(modelCtrl.getModel().tasks.length, taskCountAfterFirst, 'Canonical re-import must not duplicate task');
  assert.ok(countAfterFirst > dedupBefore);

  // Verify enhanced deterministic understand & BYOK understandPlan
  const uRest = await assistantApi.suggest('understand', { text: '今晚挺累只想休息' });
  assert.equal(uRest.value.intent, 'adjust');
  assert.deepEqual(uRest.value.tasks, []);
  const uMulti = await assistantApi.suggest('understand', { text: '明天写完高数作业；周五前复习现代汉语' });
  assert.equal(uMulti.value.intent, 'create');
  assert.equal(uMulti.value.tasks.length, 2);

  byokMod.setKey('sk-test-byok-understand-12345', fakeLocalStore);
  const uByok = await byokMod.understandPlan({
    text: '今晚挺累只保底',
    today: '2026-11-25',
    storage: fakeLocalStore,
    fetcher: async () => new Response(JSON.stringify({
      choices: [{ message: { content: JSON.stringify({
        intent: 'adjust',
        summary: '今晚先放松只做底线',
        firstStep: '减少今晚排程负荷',
        tasks: [],
        questions: [],
        adjustment: { day: 'today', reductionMinutes: 60, unavailable: false, kind: 'time', taskQuery: '', deadline: '', deadlineText: '' }
      }) } }]
    }), { status: 200 })
  });
  assert.equal(uByok.intent, 'adjust');
  assert.equal(uByok.adjustment.reductionMinutes, 60);
  byokMod.clearKey(fakeLocalStore);

  // Verify horizontal-row timetable reconstruction (weekdays stacked on left edge)
  const horizWords = [
    { text: '星期一', x: 30, y: 40, w: 60, h: 22 },
    { text: '星期二', x: 30, y: 140, w: 60, h: 22 },
    { text: '星期三', x: 30, y: 240, w: 60, h: 22 },
    { text: '1-2节', x: 160, y: 25, w: 50, h: 18 },
    { text: '通用学术英语', x: 160, y: 48, w: 110, h: 20 },
    { text: '301幢1208', x: 160, y: 72, w: 80, h: 18 },
    { text: '3-5节', x: 340, y: 125, w: 50, h: 18 },
    { text: '中国近现代史纲要', x: 340, y: 148, w: 130, h: 20 },
    { text: '301幢1315', x: 340, y: 172, w: 80, h: 18 }
  ];
  const reconH = importer.reconstructTimetableFromOCR({ words: horizWords, imgW: 1000, imgH: 320, fallbackText: '' });
  assert.equal(reconH.isGrid, true);
  assert.match(reconH.text, /每周一 \[第1格\] 1-2节 通用学术英语 301幢1208/);
  assert.match(reconH.text, /每周二 \[第2格\] 3-5节 中国近现代史纲要 301幢1315/);
  const fullSemParsed = importer.analyzeImportLocally(reconH.text, { now: new Date('2026-11-25T12:00:00') });
  assert.ok(fullSemParsed.blockedSlots.length >= 30, 'Weekly timetable should expand across full semester (~18 weeks)');
  // Verify GLM/Vision config has been removed cleanly & default 12-section timeline mapping puts section 5 in morning and section 8-9 in afternoon
  assert.equal(byokMod.setVisionConfig, undefined);
  assert.equal(byokMod.analyzeTimetableWithVision, undefined);
  const secCheck = importer.analyzeImportLocally('每周二 3-5节 中国近现代史纲要\n每周五 8-9节 基础写作', { now: new Date('2026-11-25T12:00:00') });
  const tueHist = secCheck.blockedSlots.find(b => b.title.includes('中国近现代史纲要'));
  const friWrite = secCheck.blockedSlots.find(b => b.title.includes('基础写作'));
  assert.equal(tueHist.period, 'morning', 'Section 3-5 must stay in morning, never afternoon');
  assert.equal(friWrite.period, 'afternoon', 'Section 8-9 must stay in afternoon, never evening');

  // Verify Zhengfang HTML timetable parsing (rowspan/colspan + 星期一~星期日 + explicit section)
  const zhengfangHtml = `
    <table id="Table1">
      <tr><td colspan="2">时间</td><td>星期一</td><td>星期二</td><td>星期三</td><td>星期四</td><td>星期五</td><td>星期六</td><td>星期日</td></tr>
      <tr><td rowspan="5">上午</td><td>第1节</td><td rowspan="2">通用学术英语 II<br>{第2-17周|2节/周}<br>黄婷<br>301幢1208</td><td></td><td></td><td></td><td rowspan="2">外国文学（上）<br>{第2-17周|2节/周}<br>乔敏<br>1001幢1102</td><td></td><td></td></tr>
      <tr><td>第2节</td><td></td><td></td><td></td><td></td><td></td></tr>
      <tr><td>第3节</td><td></td><td rowspan="3">中国近现代史纲要<br>{第2-17周|3节/周}<br>汤葆青<br>301幢1315</td><td rowspan="2">人工智能基础（人文艺术类）<br>周三第3,4节{第2-17周}<br>张驭茜<br>1001幢1203</td><td rowspan="2">大学生心理健康教育<br>{第2-17周|2节/周}<br>顾虑<br>301幢1114</td><td rowspan="3">中国现代文学（上）<br>{第2-17周|3节/周}<br>陈浩文/牛煜<br>1003幢3306</td><td></td><td></td></tr>
      <tr><td>第4节</td><td rowspan="2">羽毛球(男生)1<br>{第2-17周|2节/周}<br>奚启超<br>文体中心体育馆主馆（羽毛球教学）</td><td></td><td></td></tr>
      <tr><td>第5节</td><td></td><td></td><td></td><td></td><td></td></tr>
      <tr><td rowspan="4">下午</td><td>第6节</td><td></td><td></td><td></td><td></td><td rowspan="2">马克思主义文论经典选读<br>{第2-17周|2节/周}<br>刘芊玥<br>1002幢2205</td><td></td><td></td></tr>
      <tr><td>第7节</td><td></td><td></td><td></td><td></td><td></td><td></td></tr>
      <tr><td>第8节</td><td></td><td></td><td></td><td></td><td rowspan="2">基础写作<br>周五第8,9节{第2-17周}<br>李一<br>1003幢3101</td><td></td><td></td></tr>
      <tr><td>第9节</td><td></td><td></td><td></td><td></td><td></td><td></td></tr>
    </table>
  `;
  const htmlParsed = importer.parseHtmlTimetable(zhengfangHtml, { now: new Date('2026-11-25T12:00:00') });
  assert.equal(htmlParsed.mode, 'portal');
  assert.equal(htmlParsed.portalClasses.length, 9);
  const marx = htmlParsed.portalClasses.find(c => c.title.includes('马克思主义文论经典选读'));
  assert.ok(marx, 'Should parse 马克思主义文论经典选读 from HTML');
  assert.equal(marx.weekday, 5);
  assert.equal(marx.section, '6-7');
  assert.equal(marx.location, '1002幢2205');

  // Verify SUDA homepage horizontal left-column weekday HTML table (星期一..星期日 in col 0)
  const sudaHomepageHtml = `
    <table>
      <tr><td>星期一</td><td>1-2节 (2-17周)<br>通用学术英语 II<br>301幢1208</td><td>4-5节 (2-17周)<br>羽毛球(男生)1<br>文体中心体育馆主馆</td></tr>
      <tr><td>星期三</td><td>3-4节 (2-17周)<br>人工智能基础<br>1001幢1203</td><td>10-11节 (2-16|双周)<br>中共党史<br>301幢1114</td></tr>
      <tr><td>星期五</td><td>6-7节 (2-17周)<br>马克思主义文论经典选读<br>1002幢2205</td><td>8-9节 (2-17周)<br>基础写作<br>1003幢3101</td></tr>
    </table>
  `;
  const sudaParsed = importer.parseHtmlTimetable(sudaHomepageHtml, { now: new Date('2026-11-25T12:00:00') });
  assert.equal(sudaParsed.portalClasses.length, 6);
  const party = sudaParsed.portalClasses.find(c => c.title === '中共党史');
  assert.ok(party, 'Should extract exact course title without 10-11节 prefix');
  assert.equal(party.weekday, 3);
  assert.equal(party.section, '10-11');
  assert.equal(party.weekStart, 2);
  assert.equal(party.weekEnd, 16);
  assert.equal(party.weekMode, 'even');
  const pe = htmlParsed.portalClasses.find(c => c.title.includes('羽毛球'));
  assert.equal(pe.weekday, 1);
  assert.equal(pe.section, '4-5');
  const hist = htmlParsed.portalClasses.find(c => c.title.includes('中国近现代史纲要'));
  assert.equal(hist.weekday, 2);
  assert.equal(hist.section, '3-5');

  // Verify Bookmarklet builder & vertical 7-column interpolation (when 周一/周三/周六 missed)
  const bm = importer.buildPortalBookmarklet('http://127.0.0.1:4821/lifeos-web/');
  assert.ok(bm.startsWith('javascript:') && bm.includes('import_kb='));
  const sparseVertWords = [
    { text: '星期二', x: 580, y: 230, w: 60, h: 20 },
    { text: '星期四', x: 1080, y: 230, w: 60, h: 20 },
    { text: '星期五', x: 1330, y: 230, w: 60, h: 20 },
    { text: '星期日', x: 1830, y: 230, w: 60, h: 20 },
    { text: '第1节', x: 120, y: 310, w: 45, h: 18 },
    { text: '第2节', x: 120, y: 370, w: 45, h: 18 },
    { text: '通用学术英语II', x: 320, y: 315, w: 90, h: 18 },
    { text: '301幢1208', x: 320, y: 355, w: 70, h: 16 },
    { text: '大学生心理健康教育', x: 1080, y: 315, w: 110, h: 18 },
    { text: '301幢1114', x: 1080, y: 355, w: 70, h: 16 }
  ];
  const reconSparse = importer.reconstructTimetableFromOCR({ words: sparseVertWords, imgW: 2048, imgH: 1226, fallbackText: '' });
  assert.equal(reconSparse.isGrid, true);
  assert.equal(reconSparse.cols, 7, 'Should interpolate missing 星期一/三/六 to 7 columns');
  assert.match(reconSparse.text, /每周一 .*通用学术英语II/);

  // Verify Zhengfang outer iframe wrapper HTML throws helpful instruction
  assert.throws(() => importer.parseHtmlTimetable('<html><body><iframe id="iframeautoheight" src="xskbcx.aspx"></iframe></body></html>'), /外层框架页.*Ctrl\+A/);

  // Verify MHTML quoted-printable inner frame decoding
  const sampleMhtml = 'MIME-Version: 1.0\r\nContent-Type: text/html\r\nContent-Transfer-Encoding: quoted-printable\r\n\r\n' +
    '<table><tr><td>=E6=97=B6=E9=97=B4</td><td>=E6=98=9F=E6=9C=9F=E4=B8=80</td><td>=E6=98=9F=E6=9C=9F=E4=BA=8C</td><td>=E6=98=9F=E6=9C=9F=E4=B8=89</td></tr>' +
    '<tr><td>=E7=AC=AC1=E8=8A=82</td><td rowspan=3D"2">=E9=80=9A=E7=94=A8=E5=AD=A6=E6=9C=AF=E8=8B=B1=E8=AF=AD<br>301=E5=B9=A21208</td><td></td><td></td></tr><tr><td>=E7=AC=AC2=E8=8A=82</td><td></td><td></td></tr></table>';
  const mhtmlParsed = importer.parseHtmlTimetable(sampleMhtml, { now: new Date('2026-11-25T12:00:00') });
  assert.equal(mhtmlParsed.portalClasses[0].title, '通用学术英语');
  assert.equal(mhtmlParsed.portalClasses[0].section, '1-2');

  // Verify Ctrl+V HTML clipboard paste directly extracts Table1 inside open import modal
  win.LifeOSScheduleImporter = importer;
  await click('open-import');
  let pastePrevented = false;
  await winListeners.paste({
    clipboardData: {
      items: [],
      getData: kind => (kind === 'text/html' ? zhengfangHtml : '')
    },
    preventDefault() { pastePrevented = true; }
  });
  assert.equal(pastePrevented, true, 'HTML timetable paste should intercept clipboard event');
  assert.match(root.innerHTML, /已从教务网页无损导入 9 门精准课程/);
  assert.match(root.innerHTML, /马克思主义文论经典选读/);
  await click('confirm-unified-import');
  assert.match(root.innerHTML, /data-zoom="week"/, 'Confirming imported courses should show WakeUp-style week grid');
  assert.match(root.innerHTML, /rs-wk-grid/);
  assert.match(root.innerHTML, /马克思主义文论经典选读/);

  // Verify WakeUp .wakeup_schedule parser + bell editor + course edit
  const wakeUpSample = [
    JSON.stringify({ id: 1, tableName: '苏州大学课表' }),
    JSON.stringify([{ node: 1, startTime: '08:00', endTime: '08:45' }, { node: 2, startTime: '08:50', endTime: '09:35' }]),
    JSON.stringify({ maxWeek: 18 }),
    JSON.stringify([{ id: 101, courseName: '马克思主义文论', color: '#4f86f7' }, { id: 102, courseName: '中共党史', color: '#2db29a' }]),
    JSON.stringify([
      { id: 101, day: 5, startNode: 1, step: 2, startWeek: 2, endWeek: 17, type: 0, room: '1002幢2205', teacher: '刘芊玥' },
      { id: 102, day: 3, startNode: 1, step: 2, startWeek: 2, endWeek: 16, type: 2, room: '301幢1114', teacher: '郭宝付' }
    ])
  ].join('\n');
  const wkParsed = importer.parseWakeUpSchedule(wakeUpSample, { now: new Date('2026-11-25T12:00:00') });
  assert.equal(wkParsed.format, 'wakeup');
  assert.equal(wkParsed.portalClasses.length, 2);
  assert.equal(wkParsed.portalClasses[1].weekMode, 'even');
  assert.equal(wkParsed.bellSchedule.length, 2);

  await click('open-bell-editor');
  await click('apply-bell-preset', 'suda_12');
  await submit('bell-editor', new Map());
  assert.match(root.innerHTML, /作息时间已保存/);

  // Verify plain-text Ctrl+A/Ctrl+C paste from horizontal SUDA homepage
  const plainSudaCopy = '星期一\t1-2节 (2-17周)\n通用学术英语II\n301幢1208\t4-5节 (2-17周)\n羽毛球(男生)1\n文体中心体育馆主馆\n星期三\t10-11节 (2-16|双周)\n中共党史\n301幢1114';
  const plainParsed = importer.analyzeImportLocally(plainSudaCopy, { now: new Date('2026-11-25T12:00:00') });
  assert.equal(plainParsed.portalClasses.length, 3);
  assert.equal(plainParsed.portalClasses[0].title, '通用学术英语II');
  assert.equal(plainParsed.portalClasses[2].weekMode, 'even');

  // Verify browser-popup fallback opens window.open synchronously when not on interactive desktop
  let openedPortalUrl = '';
  win.open = (u) => { openedPortalUrl = String(u); return { closed: false }; };
  await click('open-import');
  await click('toggle-portal-guide');
  assert.match(root.innerHTML, /data-rs-action="portal-clipboard"/);
  await click('portal-open');
  assert.equal(openedPortalUrl, 'http://xk.suda.edu.cn/');
  assert.match(root.innerHTML, /已在浏览器新窗口打开教务系统/);
  await click('close-import');
  await click('jump-today');

  // Verify Randomized 240+ Prompt Bubble Stage, Shuffle, AI-First Strategy -> Timeline Rearrange & Minimal Obsidian Directory
  assert.ok(promptBank.count >= 200, `Prompt bank must contain >=200 entries (got ${promptBank.count})`);
  const beforeBubbles = root.innerHTML.match(/class="rs-bubble-stage"[\s\S]*?<\/div>/)?.[0] || '';
  assert.match(beforeBubbles, /rs-prompt-bubble/);
  await click('shuffle-quick-chips');
  const afterBubbles = root.innerHTML.match(/class="rs-bubble-stage"[\s\S]*?<\/div>/)?.[0] || '';
  assert.notEqual(afterBubbles, beforeBubbles, 'Shuffle must draw fresh random bubbles');
  await click('quick-chip', '下周要考高等数学，另外今晚挺累想早休息，帮我重排计划');
  assert.match(root.innerHTML, /rs-tier-board/);
  assert.match(root.innerHTML, /rs-tier-card is-featured/);
  assert.match(root.innerHTML, /选择此方案/);
  assert.doesNotMatch(root.innerHTML, /囤了 \d+ 种/);
  await click('apply-ai-strategy', 'opt_balanced');
  assert.match(root.innerHTML, /undo-plan/);
  await click('undo-plan');

  await click('view', 'resources');
  assert.match(root.innerHTML, /rs-dir-shell/);
  assert.doesNotMatch(root.innerHTML, /rs-mindmap-stage|rs-mm-hok-node|清单视图|星图网络/);
  assert.match(root.innerHTML, /OpenStax/);
  await click('filter-res', '开源教材与开发');
  assert.match(root.innerHTML, /CS 自学指南/);
  assert.match(root.innerHTML, /ai-plan-from-res/);

  await click('go-overview');
  const firstTask = adapter.getModel().tasks.find(t => t.kind !== 'habit' && !t.completed);
  assert.ok(firstTask);
  await click('start-task', firstTask.id);
  assert.match(root.innerHTML, /rs-study-spotlight/);
  assert.match(root.innerHTML, /25:00/);

  mounted.destroy();
});
