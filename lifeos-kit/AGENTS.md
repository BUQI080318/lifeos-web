# AGENTS.md — 给编码 agent 的硬约束

读取顺序：`SPEC.md` → 本文件 → `tests/`。本文件与本仓库其他文档冲突时，以 `SPEC.md` 为准。

---

## 改动前

1. 先读 `SPEC.md` 第 3 节（数据模型）与第 4 节（算法），不要凭接口名猜语义
2. 跑一次 `python tests/run_cases.py`，确认基线是绿的
3. 要改算法，先在 `tests/cases.json` 里加用例，再改实现

## 改动中

| 规则 | 说明 |
|---|---|
| 只改必要的地方 | 一次提交只解决一个问题 |
| 引擎纯函数化 | `schedule()` 不读文件、不联网、不改入参（内部深拷贝） |
| 输入输出 JSON | 引擎的入参与返回都必须是可 `JSON.stringify` 的普通对象 |
| 不新增依赖 | Python 只用标准库；JS 不用框架、不用打包器 |
| 数字用分钟 | 全库统一整数分钟，不出现小时、不出现浮点分钟 |
| 字段名锁死 | camelCase，与 `SPEC.md` 第 5 节逐字一致 |

## 改动后

```bash
python tests/run_cases.py     # 必须全绿，6/6
python tests/run_cases.py --verbose   # 失败时看逐字段 diff
```

再自查一遍：

- [ ] 6 个用例全过，且**没有改过 `expected.json`**
- [ ] 新增的每个分支都有对应用例
- [ ] `drop_cost` 的权重仍是 0.55 / 0.30 / 0.15
- [ ] `partially` 的任务仍保留已排块
- [ ] 任何一块的时长都 ≥ `minChunk`
- [ ] 代码里没有出现 `AI`、`智能`、`大模型` 这类字样（注释也不行）

## 绝对不做

以下任意一条出现，视为缺陷，需回退：

1. 调用外部 API 或模型来判断、排序、打分
2. 把 `rescheduleCount` 加进 `drop_cost`
3. 把 `partially` 的任务整体移出
4. 新增任务状态（只允许 `scheduled` / `partially` / `unschedulable` / `invalid` / `deferred`）
5. 改 `expected.json` 让测试通过
6. 引入日历同步、账号、云存储、排行榜
7. 在文案里写"智能规划""AI 帮你安排"

## 卡住时

- 语义不清 → 去 `docs/competitor-teardown.md` 找对应产品是怎么做的，仍不清就按 `SPEC.md` 字面实现，不要自由发挥
- 用例冲突 → 停下，报告哪个用例和哪条 spec 冲突，不要自行调和
- 性能问题 → 单用户场景，任务数 ≤ 200，直接写 O(n·m) 循环，不做优化

## 交付格式

每次交付：

```
改了什么: 一句话
动了哪些文件: 列表
测试: 6/6 通过 / N 个失败（附失败用例 id）
没做什么: 明确列出本次未覆盖的部分
```
