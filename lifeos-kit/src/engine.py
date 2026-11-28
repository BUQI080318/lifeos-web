# -*- coding: utf-8 -*-
"""
LifeOS 排程引擎 — 参考实现（camelCase 输出，与 SPEC.md 第 5 节一致）
纯标准库。这是能过 tests/run_cases.py 的基准版本，agent 可以重写，但必须保持行为一致。

对外 API：
    calibration_factor(history) -> dict
    schedule(tasks, days, k, today, horizon_days) -> dict
数据类：
    Task, Day
"""
from __future__ import annotations

import math
import sys
from dataclasses import dataclass, field
from datetime import date, timedelta
from statistics import median
from typing import Iterable

PRIORITY_RANK = {"asap": 4, "high": 3, "medium": 2, "low": 1, "none": 0}


# ---------------------------------------------------------------- 数据模型

@dataclass
class Task:
    id: str
    name: str
    estimate_min: int | None
    deadline: date | None = None
    priority: str = "none"
    splittable: bool = False
    min_chunk: int = 25
    done_ratio: float = 0.0
    start_date: date | None = None
    reschedule_count: int = 0
    actual_min: int | None = None

    placed: list = field(default_factory=list)
    status: str = "pending"

    def clone(self) -> "Task":
        t = Task(self.id, self.name, self.estimate_min, self.deadline, self.priority,
                 self.splittable, self.min_chunk, self.done_ratio, self.start_date,
                 self.reschedule_count, self.actual_min)
        return t


@dataclass
class Day:
    day: date
    windows: list[tuple[int, int]] = field(default_factory=list)
    protected_min: int = 0

    def total_free(self) -> int:
        return sum(w[1] for w in self.windows)

    def clone(self) -> "Day":
        return Day(self.day, list(self.windows), self.protected_min)


# ---------------------------------------------------------------- 校准

def calibration_factor(history: Iterable[tuple[int, int]], fallback: float = 1.0) -> dict:
    pairs = [(e, a) for e, a in history if e and a and e > 0 and a > 0]
    ratios = [a / e for e, a in pairs]
    if len(ratios) < 3:
        return {"k": fallback, "n": len(ratios), "source": "default"}
    raw = median(ratios)
    k = max(0.5, min(3.0, raw))
    return {
        "k": round(k, 3),
        "n": len(ratios),
        "source": "personal" if abs(k - raw) < 1e-9 else "clamped",
    }


def effective_minutes(estimate: int, k: float) -> int:
    return int(math.ceil(estimate * k / 5.0) * 5)


# ---------------------------------------------------------------- 打分

def urgency_score(t: Task, today: date) -> float:
    if t.deadline is None:
        return 0.0
    days = (t.deadline - today).days
    if days < 0:
        return 1.0
    return 1.0 / (1.0 + days)


def drop_cost(t: Task, today: date) -> float:
    u = urgency_score(t, today)
    p = max(0.0, min(1.0, t.done_ratio))
    rigid = 0.0 if t.splittable else 1.0
    return round(0.55 * u + 0.30 * p + 0.15 * rigid, 4)


def order_key(t: Task, today: date):
    return (0 if t.priority == "asap" else 1,
            t.deadline or date.max,
            -PRIORITY_RANK.get(t.priority, 0))


# ---------------------------------------------------------------- 主流程

def schedule(tasks: list[Task], days: list[Day], k: float,
             today: date, horizon_days: int = 7) -> dict:
    # 不改入参
    tasks = [t.clone() for t in tasks]
    days = [d.clone() for d in days]

    ordered = sorted(days, key=lambda d: d.day)

    # 1. 前置校验
    for t in tasks:
        if not t.estimate_min or t.estimate_min <= 0:
            t.status = "invalid"
        elif t.deadline is None and PRIORITY_RANK.get(t.priority, 0) <= 0:
            t.status = "invalid"
        elif t.start_date and t.start_date > today:
            t.status = "deferred"
        else:
            t.status = "pending"

    cand = sorted([t for t in tasks if t.status == "pending"],
                  key=lambda t: order_key(t, today))

    in_h = lambda d: (d.day - today).days <= horizon_days

    # 2. 容量
    capacity_raw = sum(d.total_free() for d in ordered if in_h(d))
    capacity_cal = int(math.floor(capacity_raw / k)) if k else capacity_raw

    # 3. 装箱
    for t in cand:
        need = effective_minutes(t.estimate_min, k)
        mc = t.min_chunk
        for d in ordered:
            if not in_h(d):
                break
            if t.deadline and d.day > t.deadline:
                break
            for i, (start, length) in enumerate(list(d.windows)):
                if need <= 0:
                    break
                if length <= 0:
                    continue
                if not t.splittable:
                    if length < need:
                        continue
                    take = need
                else:
                    take = min(length, need)
                    rest = need - take
                    if 0 < rest < mc:
                        take = need if length >= need else need - mc
                    if take <= 0:
                        continue
                d.windows[i] = (start + take, length - take)
                t.placed.append((d.day, take))
                need -= take
            if need <= 0:
                break

        total = sum(m for _, m in t.placed)
        if total == 0:
            t.status = "unschedulable"
            t.placed = []
        elif need > 0:
            t.status = "partially"
        else:
            t.status = "scheduled"

    # 4. 超载分两态
    hard = sorted([t for t in cand if t.status == "unschedulable"],
                  key=lambda t: drop_cost(t, today))
    dropped = [{
        "task": t.id,
        "name": t.name,
        "dropCost": drop_cost(t, today),
        "reason": _reason(t, today),
        "nextSlot": _next_slot(t, ordered, today, t.estimate_min or 0),
    } for t in hard]

    remainder = []
    for t in cand:
        if t.status != "partially":
            continue
        placed = sum(m for _, m in t.placed)
        left = effective_minutes(t.estimate_min, k) - placed
        remainder.append({
            "task": t.id,
            "name": t.name,
            "placedMin": placed,
            "remainderMin": left,
            "nextSlot": _next_slot(t, ordered, today, left),
            "reason": _reason(t, today),
        })

    leftover = sum(d.total_free() for d in ordered if in_h(d))

    return {
        "k": k,
        "capacityRawMin": capacity_raw,
        "capacityCalibratedMin": capacity_cal,
        "capacityNote": f"可用 {capacity_raw} 分钟，按 k={k} 折算相当于 {capacity_cal} 分钟的原始估时",
        "scheduled": [{
            "task": t.id,
            "name": t.name,
            "effMin": sum(m for _, m in t.placed),
            "rawMin": t.estimate_min,
            "blocks": [{"day": str(d), "min": m} for d, m in t.placed],
            "status": t.status,
            "eta": str(t.deadline) if t.deadline else "—",
        } for t in cand if t.placed],
        "dropped": dropped,
        "remainder": remainder,
        "invalid": [{"task": t.id, "name": t.name, "why": t.status}
                    for t in tasks if t.status in ("invalid", "deferred")],
        "leftoverMin": max(0, leftover),
    }


def _reason(t: Task, today: date) -> str:
    bits = []
    if t.deadline:
        d = (t.deadline - today).days
        bits.append("已过期" if d < 0 else f"距截止 {d} 天")
    else:
        bits.append("无固定期限")
    bits.append(f"已完成 {int(t.done_ratio * 100)}%")
    bits.append("可拆分" if t.splittable else "不可拆分")
    if t.reschedule_count >= 2:
        bits.append(f"已改期 {t.reschedule_count} 次")
    return "；".join(bits)


def _next_slot(t: Task, days: list[Day], today: date, need: int):
    mc = t.min_chunk
    for d in days:
        if t.deadline and d.day > t.deadline:
            return None
        for start, length in d.windows:
            if length >= min(need, mc):
                return {"day": str(d.day), "startMin": start,
                        "fitsFull": length >= need, "window": length}
    return None


# ---------------------------------------------------------------- CLI

def _demo():
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass
    today = date(2026, 11, 24)
    print("=" * 66)
    print("场景 A  BP 3.2：原排 390 分钟，临时活动后只剩 90 分钟")
    print("=" * 66)
    tasks = [
        Task("m1", "现代汉语章节复习", 180, deadline=date(2026, 11, 30),
             priority="high", splittable=True, min_chunk=25),
        Task("e1", "英语写作练习", 90, deadline=date(2026, 12, 2),
             priority="medium", splittable=True, min_chunk=30),
        Task("r1", "课外阅读", 120, priority="low", splittable=True, min_chunk=20),
    ]
    days = [
        Day(date(2026, 11, 24), [(540, 90)]),
        Day(date(2026, 11, 25), [(540, 180)]),
        Day(date(2026, 11, 26), [(540, 180)]),
    ]
    r = schedule(tasks, days, 1.0, today, 0)
    print(r["capacityNote"])
    for s in r["scheduled"]:
        blocks = " + ".join(f"{b['day'][5:]} {b['min']}min" for b in s["blocks"])
        print(f"  排入 {s['name']:<12} 估{s['rawMin']:>3} → {s['effMin']:>3}min  {blocks}")
    for x in r["remainder"]:
        print(f"  部分 {x['name']:<12} 已排 {x['placedMin']}min，剩 {x['remainderMin']}min")
    for d in r["dropped"]:
        ns = d["nextSlot"]
        tail = f"{ns['day'][5:]} 起 {ns['startMin']//60:02d}:{ns['startMin']%60:02d}" if ns else "本周无可用时段"
        print(f"  移出 {d['name']:<12} cost={d['dropCost']:<7} {d['reason']}  → {tail}")


if __name__ == "__main__":
    _demo()
