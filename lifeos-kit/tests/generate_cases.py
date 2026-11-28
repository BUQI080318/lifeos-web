# -*- coding: utf-8 -*-
"""生成 lifeos-kit 的验收用例：输入 + golden 输出。"""
import sys, json, io, os
from datetime import date

sys.stdout.reconfigure(encoding='utf-8')
sys.path.insert(0, r"C:\Users\1\Desktop\国创冲刺\lifeos-kit\src")
from engine import Task, Day, schedule, calibration_factor

OUT = r"C:\Users\1\Desktop\国创冲刺\lifeos-kit\tests"
os.makedirs(OUT, exist_ok=True)

D = lambda y, m, d: date(y, m, d)

# ---------------------------------------------------------------- C1 前置校验
c1_tasks = [
    dict(id="t1", name="没写时长", estimate_min=None, deadline=D(2026, 11, 28), priority="high",
         splittable=False, min_chunk=25, done_ratio=0.0, reschedule_count=0),
    dict(id="t2", name="既无截止也无优先级", estimate_min=60, deadline=None, priority="none",
         splittable=False, min_chunk=25, done_ratio=0.0, reschedule_count=0),
    dict(id="t3", name="还没到开始日", estimate_min=60, deadline=D(2026, 12, 5), priority="high",
         splittable=False, min_chunk=25, done_ratio=0.0, reschedule_count=0, start_date=D(2026, 12, 1)),
    dict(id="t4", name="正常任务", estimate_min=60, deadline=D(2026, 11, 30), priority="high",
         splittable=True, min_chunk=25, done_ratio=0.0, reschedule_count=0),
]
c1_days = [dict(day="2026-11-24", windows=[[540, 240]])]

# ---------------------------------------------------------------- C2 BP 案例
c2_tasks = [
    dict(id="m1", name="现代汉语章节复习", estimate_min=180, deadline=D(2026, 11, 30), priority="high",
         splittable=True, min_chunk=25, done_ratio=0.0, reschedule_count=0),
    dict(id="e1", name="英语写作练习", estimate_min=90, deadline=D(2026, 12, 2), priority="medium",
         splittable=True, min_chunk=30, done_ratio=0.0, reschedule_count=0),
    dict(id="r1", name="课外阅读", estimate_min=120, deadline=None, priority="low",
         splittable=True, min_chunk=20, done_ratio=0.0, reschedule_count=0),
]
c2_days = [
    dict(day="2026-11-24", windows=[[540, 90]]),
    dict(day="2026-11-25", windows=[[540, 180]]),
    dict(day="2026-11-26", windows=[[540, 180]]),
]

# ---------------------------------------------------------------- C3 校准
c3_tasks = [
    dict(id="a", name="小组作业汇报稿", estimate_min=45, deadline=D(2026, 11, 26), priority="asap",
         splittable=False, min_chunk=25, done_ratio=0.0, reschedule_count=0),
    dict(id="b", name="现代汉语章节复习", estimate_min=180, deadline=D(2026, 11, 30), priority="high",
         splittable=True, min_chunk=25, done_ratio=0.0, reschedule_count=4),
    dict(id="c", name="英语写作练习", estimate_min=90, deadline=D(2026, 12, 2), priority="medium",
         splittable=True, min_chunk=30, done_ratio=0.0, reschedule_count=2),
    dict(id="d", name="课外阅读", estimate_min=120, deadline=None, priority="low",
         splittable=True, min_chunk=20, done_ratio=0.0, reschedule_count=0),
]
c3_days = [
    dict(day="2026-11-24", windows=[[540, 90]]),
    dict(day="2026-11-25", windows=[[540, 120], [1140, 60]]),
    dict(day="2026-11-26", windows=[[540, 180]]),
    dict(day="2026-11-27", windows=[[540, 150]]),
    dict(day="2026-11-28", windows=[[540, 240]]),
]
c3_history = [[60, 95], [30, 40], [45, 70], [20, 25], [90, 120]]

# ---------------------------------------------------------------- C4 最小块
c4_tasks = [
    dict(id="big", name="长任务可拆", estimate_min=160, deadline=D(2026, 11, 27), priority="high",
         splittable=True, min_chunk=30, done_ratio=0.0, reschedule_count=0),
]
c4_days = [
    dict(day="2026-11-24", windows=[[540, 150]]),
    dict(day="2026-11-25", windows=[[540, 60]]),
]

# ---------------------------------------------------------------- C5 不可拆
c5_tasks = [
    dict(id="rigid", name="不可拆任务", estimate_min=100, deadline=D(2026, 11, 26), priority="high",
         splittable=False, min_chunk=25, done_ratio=0.0, reschedule_count=0),
]
c5_days = [
    dict(day="2026-11-24", windows=[[540, 90]]),
    dict(day="2026-11-25", windows=[[540, 120]]),
]

# ---------------------------------------------------------------- C6 k 钳制
c6_hist_clamp = [[10, 50], [10, 60], [10, 55]]      # 比值 5~6，应钳到 3.0
c6_hist_few = [[10, 30], [10, 20]]                   # 只有 2 条，用默认 1.0

# ---------------------------------------------------------------- 序列化

def t2obj(t):
    return dict(id=t.id, name=t.name, estimate_min=t.estimate_min,
                deadline=str(t.deadline) if t.deadline else None,
                priority=t.priority, splittable=t.splittable, min_chunk=t.min_chunk,
                done_ratio=t.done_ratio, start_date=str(t.start_date) if t.start_date else None,
                reschedule_count=t.reschedule_count)

def _d(v):
    if v is None:
        return None
    if isinstance(v, date):
        return v
    return date.fromisoformat(v)

def build_tasks(raw):
    out = []
    for r in raw:
        out.append(Task(
            id=r["id"], name=r["name"], estimate_min=r["estimate_min"],
            deadline=_d(r["deadline"]),
            priority=r["priority"], splittable=r["splittable"], min_chunk=r["min_chunk"],
            done_ratio=r["done_ratio"],
            start_date=_d(r.get("start_date")),
            reschedule_count=r["reschedule_count"],
        ))
    return out

def build_days(raw):
    return [Day(_d(d["day"]), [tuple(w) for w in d["windows"]]) for d in raw]

def run(case_id, raw_tasks, raw_days, k, horizon):
    tasks = build_tasks(raw_tasks)
    days = build_days(raw_days)
    res = schedule(tasks, days, k, D(2026, 11, 24), horizon)
    return {"case": case_id, "output": res}

cases = []
runs = []

# C1
runs.append(run("C1", c1_tasks, c1_days, 1.0, 0))
cases.append({
    "id": "C1", "title": "前置校验：无时长 / 无锚点 / 未到开始日",
    "today": "2026-11-24", "k": 1.0, "horizon_days": 0,
    "tasks": c1_tasks, "days": c1_days,
    "expect": {
        "invalid_ids": ["t1", "t2"],
        "deferred_ids": ["t3"],
        "scheduled_first": "t4"
    }
})

# C2
runs.append(run("C2", c2_tasks, c2_days, 1.0, 0))
cases.append({
    "id": "C2", "title": "BP 3.2 案例：390 分钟任务只剩 90 分钟",
    "today": "2026-11-24", "k": 1.0, "horizon_days": 0,
    "tasks": c2_tasks, "days": c2_days,
    "expect": {
        "capacity_raw_min": 90,
        "scheduled_ids_in_order": ["m1"],
        "m1_status": "partially",
        "m1_placed_min": 90,
        "remainder_ids": ["m1"],
        "remainder_min": 90,
        "dropped_ids_in_order": ["r1", "e1"],
        "dropped_costs": {"r1": 0.0, "e1": 0.0611}
    }
})

# C3
cal3 = calibration_factor([tuple(x) for x in c3_history])
runs.append(run("C3", c3_tasks, c3_days, cal3["k"], 7))
cases.append({
    "id": "C3", "title": "接个人系数 k 后的完整一周",
    "today": "2026-11-24", "k_source": c3_history, "horizon_days": 7,
    "tasks": c3_tasks, "days": c3_days,
    "expect": {
        "k": 1.333,
        "k_source_label": "personal",
        "capacity_raw_min": 840,
        "capacity_calibrated_min": 630,
        "scheduled_ids_in_order": ["a", "b", "c", "d"],
        "no_dropped": True
    }
})

# C4
runs.append(run("C4", c4_tasks, c4_days, 1.0, 1))
cases.append({
    "id": "C4", "title": "最小块边界：剩余不足 min_chunk 时不许切碎片",
    "today": "2026-11-24", "k": 1.0, "horizon_days": 1,
    "tasks": c4_tasks, "days": c4_days,
    "expect": {
        "big_placed_min": 160,
        "big_block_sizes": [130, 30],
        "rule": "任何一块都 >= min_chunk(30)；切分时若剩余会低于 min_chunk，则本次少切，留够下一块"
    }
})

# C5
runs.append(run("C5", c5_tasks, c5_days, 1.0, 1))
cases.append({
    "id": "C5", "title": "不可拆任务必须整块放进同一窗口",
    "today": "2026-11-24", "k": 1.0, "horizon_days": 1,
    "tasks": c5_tasks, "days": c5_days,
    "expect": {
        "rigid_status": "scheduled",
        "rigid_day": "2026-11-25",
        "rule": "窗口 90 < 需求 100，跳过；进入 120 的窗口整块放下"
    }
})

cases.append({
    "id": "C6", "title": "k 的边界：样本不足与钳制",
    "history_clamp": c6_hist_clamp,
    "history_few": c6_hist_few,
    "expect": {
        "clamp_k": 3.0,
        "few_k": 1.0,
        "few_source": "default",
        "rule": "样本 <3 用默认 1.0；比值中位数超过 3.0 时钳到 3.0，低于 0.5 时钳到 0.5"
    }
})

cal_clamp = calibration_factor([tuple(x) for x in c6_hist_clamp])
cal_few = calibration_factor([tuple(x) for x in c6_hist_few])
print("C6 校验: clamp =", cal_clamp, " few =", cal_few)

io.open(os.path.join(OUT, "cases.json"), "w", encoding="utf-8").write(
    json.dumps(cases, ensure_ascii=False, indent=2, default=str))
io.open(os.path.join(OUT, "expected.json"), "w", encoding="utf-8").write(
    json.dumps({"runs": runs,
                "calibration": {"C3": cal3, "C6_clamp": cal_clamp, "C6_few": cal_few}},
               ensure_ascii=False, indent=2, default=str))

print(f"\n生成 {len(cases)} 个用例 -> {OUT}")
for c in cases:
    print("  ", c["id"], c["title"])
