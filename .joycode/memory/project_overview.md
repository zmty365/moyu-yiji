---
name: 项目概览
description: 宜忌月历·摸鱼账本 整体架构与核心模块
type: project
---

## 项目定位
趣味日历应用——每天生成专属「宜/忌」，记录摸鱼时长、折算成时薪入账。支持网页版和 Chrome 扩展两种使用方式。

## 核心模块
1. **宜忌月历**：按月展示每日宜忌，日期加盐 PRNG 生成（可复现），TypeScript 源码在 src/yiji/
2. **摸鱼计时器**：三态状态机 idle/running/paused，基于真实时间戳差分累计，扩展版通过 Service Worker + chrome.alarms 后台持续计时，关浏览器自动暂停（alive 水印过期检测）
3. **薪资模型**：手填时薪优先，或按月薪/天数/日时长推算等效时薪
4. **喝水提醒（仅扩展）**：久坐到点温柔提醒，DOM 浮层 + 系统通知，防打扰机制，内置多主题文案库，提示音通过 offscreen document 播放
5. **当月总计**：月历标题栏下方汇总条，遍历当月所有日期累加摸鱼时长与入账金额，翻页/设置变更/重置时更新，不在每秒心跳中重复渲染

## 技术架构
- 网页版：纯静态 HTML/CSS/JS，localStorage，入口 index.html
- 扩展版：Manifest V3，chrome.storage.local 跨页面共享，popup.html(小窗) + full.html(完整页)，background.js(Service Worker)
- 数据域独立：网页版与扩展版互不相通

## 关键设计决策
1. 计时器用 alive 水印而非 startAt 作为权威累计基准，避免多写入者 max 虚高
2. 所有写入方走 max(旧值, acc) 幂等落账
3. 喝水提醒是扩展独有能力，依赖 chrome.alarms/scripting 等 API
4. 提示音用 offscreen document 避免 Service Worker 无法播放音频

**Why:** 后续开发时快速理解架构和设计约束，避免破坏已有决策。
**How to apply:** 修改或新增功能前先查阅此文档。