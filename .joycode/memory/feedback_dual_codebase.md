---
name: 根目录与 extension 双份代码需同步改动
description: 本项目网页版(根目录)与 Chrome 扩展版(extension/)是两套并行代码，改动其一时须同步另一份对应文件
type: feedback
---

规则：修改代码时，根目录的网页版代码与 `extension/` 的扩展版代码需**同时改动**，保持逻辑一致。

**Why:** 用户明确要求。项目有两套并行实现——根目录网页版(`index.html` + `js/app.js` + `css/` + `assets/`)和 Chrome 扩展版(`extension/` 下有自己的 `js/`、`css/`、`popup.html`/`full.html`)，二者存在同名共享文件(如 `js/moyu-timer.js`、`js/yiji-data.js`、`css/style.css`)，逻辑相近但各自维护一份。

**How to apply:** 实现新功能或修 bug 时，先判断改动是否落在两边都有的模块；若是，两份都要改并保持一致，不要只改一边。文档统一放根目录 `docs/`。