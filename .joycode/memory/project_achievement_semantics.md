---
name: 成就系统判定语义与"重置"删除决策
description: 成就的历史标记(unlocked)与当前达标(matched)区别，刷新弹窗须用 matched；「重置」按钮已删除的产品理由
type: project
---

成就 entry 有两个易混字段：`entry.unlocked`(存储里的历史解锁标记，永久保留、只增不减) 与 `entry.progress.matched`(按当前数据快照实时重算是否达标)。

**刷新弹窗过滤必须用 `entry.progress.matched`**，而非 `entry.unlocked`。
- Why: 早前用 unlocked 过滤导致 bug——数据回退后仍弹出"当前不达标却有历史标记"的成就。
- How to apply: 成就卡片区的解锁计数(unlockedCount)仍用 unlocked(展示历史成就)；但"刷新按钮触发的弹窗"逻辑(js/app.js popUnlockedAchievements、extension/js/popup.js popUnlockedFromData)必须用 matched。

**「重置」按钮已删除**(2026-08-12)。
- Why: 与"摸鱼账本"记录累积的核心定位冲突，且它主动制造"数据回退但成就不撤销"的矛盾，是 bug 温床。用户认可"当时一拍脑袋加的"应删。
- How to apply: 计时控制只保留 开始/暂停/继续 三态。若未来要恢复清零能力，勿加回一级按钮；且注意成就系统故意不做撤销(unlockNew 只加不删)，任何数据回退入口都会与之冲突。