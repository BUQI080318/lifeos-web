# -*- coding: utf-8 -*-
"""
验收脚本：跑 tests/cases.json，比对 tests/expected.json，全绿才算实现正确。

    python tests/run_cases.py            # 简要结果
    python tests/run_cases.py --verbose  # 失败时打印逐字段 diff
    python tests/run_cases.py --engine path/to/engine.py   # 换实现

engine 要提供：Task, Day, schedule, calibration_factor
"""
import sys, os, json, io, argparse
from datetime import date

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
sys.path.insert(0, os.path.join(ROOT, 'src'))

try:
    sys.stdout.reconfigure(encoding='utf-8')
except Exception:
    pass

ap = argparse.ArgumentParser()
ap.add_argument('--verbose', action='store_true')
ap.add_argument('--engine', default=None)
args = ap.parse_args()

if args.engine:
    import importlib.util
    spec = importlib.util.spec_from_file_location('engine_under_test', args.engine)
    E = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(E)
else:
    import engine as E

d = lambda v: date.fromisoformat(v) if isinstance(v, str) else v

def build_tasks(raw):
    return [E.Task(
        id=r['id'], name=r['name'], estimate_min=r['estimate_min'],
        deadline=d(r['deadline']), priority=r['priority'],
        splittable=r['splittable'], min_chunk=r['min_chunk'],
        done_ratio=r['done_ratio'], start_date=d(r.get('start_date')),
        reschedule_count=r['reschedule_count'],
    ) for r in raw]

def build_days(raw):
    return [E.Day(d(x['day']), [tuple(w) for w in x['windows']]) for x in raw]

cases = json.load(io.open(os.path.join(HERE, 'cases.json'), encoding='utf-8'))
expected = json.load(io.open(os.path.join(HERE, 'expected.json'), encoding='utf-8'))
golden = {r['case']: r['output'] for r in expected['runs']}

def digest(out):
    """把输出压成便于比对的形状"""
    return {
        'k': out['k'],
        'capacityRawMin': out['capacityRawMin'],
        'capacityCalibratedMin': out['capacityCalibratedMin'],
        'scheduled': [[s['task'], s['effMin'], s['status'], [b['min'] for b in s['blocks']]]
                      for s in out['scheduled']],
        'dropped': [[x['task'], x['dropCost']] for x in out['dropped']],
        'remainder': [[x['task'], x['placedMin'], x['remainderMin']] for x in out['remainder']],
        'invalid': [[x['task'], x['why']] for x in out['invalid']],
    }

fails = []
print(f'运行 {len(cases)} 个用例\n' + '-' * 60)

for c in cases:
    cid = c['id']
    if cid == 'C6':
        h1 = [tuple(x) for x in c['history_clamp']]
        h2 = [tuple(x) for x in c['history_few']]
        r1 = E.calibration_factor(h1)
        r2 = E.calibration_factor(h2)
        ok = (abs(r1['k'] - 3.0) < 1e-9 and r1['source'] == 'clamped'
              and abs(r2['k'] - 1.0) < 1e-9 and r2['source'] == 'default')
        print(f'{"PASS" if ok else "FAIL"}  {cid}  {c["title"]}')
        if not ok:
            print(f'      clamp={r1}  few={r2}')
            fails.append(cid)
        continue

    k = c.get('k', 1.0)
    if 'k_source' in c:
        k = E.calibration_factor([tuple(x) for x in c['k_source']])['k']

    out = E.schedule(build_tasks(c['tasks']), build_days(c['days']), k,
                     d(c['today']), c['horizon_days'])
    got = digest(out)
    want = digest(golden[cid])

    if got == want:
        print(f'PASS  {cid}  {c["title"]}')
    else:
        print(f'FAIL  {cid}  {c["title"]}')
        fails.append(cid)
        if args.verbose:
            for key in want:
                if got.get(key) != want[key]:
                    print(f'      {key}:')
                    print(f'        期望 {want[key]}')
                    print(f'        实际 {got.get(key)}')

print('-' * 60)
if fails:
    print(f'{len(fails)} 个失败: {fails}')
    sys.exit(1)
print(f'全部通过 {len(cases)}/{len(cases)}')
