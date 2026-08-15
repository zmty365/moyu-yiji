// 桌宠图鉴：统一登记全部可切换桌宠（造型 SVG + 文案/彩蛋文字）。
// 供三处复用：
//   1. content script（pet-content.js）——注入任意网页右下角的悬浮桌宠；
//   2. full.html 完整页——「桌宠搭子」面板的切换选择器；
//   3. 未来 popup 等其它入口。
// 每个桌宠的「话术」由几类文案组成：
//   - greeting：初次/切换登场问候语
//   - idle：待机时低频冒出的劝摸气泡
//   - pat：被抚摸时（掉币之外的）回应气泡
//   - egg：与该大厂强关联的彩蛋文字（抚摸时小概率冒出）
// 全局暴露 window.MoyuPets（与 wallet.js 同构的 globalThis 写法，可在两种上下文复用）。
(function (global) {
  'use strict';

  // ---- 原「摸鱼小猫」桌宠（默认搭子，向后兼容）----
  var CAT_SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96" width="72" height="72" aria-label="摸鱼小猫">'
    + '<defs><linearGradient id="petCatBody" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f7d9a6"/><stop offset="1" stop-color="#e9b877"/></linearGradient></defs>'
    + '<ellipse cx="48" cy="86" rx="30" ry="7" fill="#3b5a4e" opacity="0.15"/>'
    + '<path d="M70 76 C 84 74, 86 60, 76 54" fill="none" stroke="#e9b877" stroke-width="7" stroke-linecap="round"/>'
    + '<path d="M28 82 C 26 60, 34 52, 48 52 C 62 52, 70 60, 68 82 Z" fill="url(#petCatBody)" stroke="#c98f45" stroke-width="2.5" stroke-linejoin="round"/>'
    + '<ellipse cx="48" cy="72" rx="12" ry="14" fill="#fff7ea" opacity="0.85"/>'
    + '<ellipse cx="38" cy="82" rx="7" ry="5" fill="#fff7ea" stroke="#c98f45" stroke-width="2"/>'
    + '<ellipse cx="58" cy="82" rx="7" ry="5" fill="#fff7ea" stroke="#c98f45" stroke-width="2"/>'
    + '<path d="M28 34 L 24 14 L 42 26 Z" fill="url(#petCatBody)" stroke="#c98f45" stroke-width="2.5" stroke-linejoin="round"/>'
    + '<path d="M68 34 L 72 14 L 54 26 Z" fill="url(#petCatBody)" stroke="#c98f45" stroke-width="2.5" stroke-linejoin="round"/>'
    + '<path d="M30 30 L 28 20 L 37 26 Z" fill="#f5a6a6"/><path d="M66 30 L 68 20 L 59 26 Z" fill="#f5a6a6"/>'
    + '<circle cx="48" cy="40" r="24" fill="url(#petCatBody)" stroke="#c98f45" stroke-width="2.5"/>'
    + '<path d="M48 17 v7 M40 18 l2 6 M56 18 l-2 6" stroke="#c98f45" stroke-width="2.4" stroke-linecap="round" opacity="0.7"/>'
    + '<ellipse class="mp-eye" cx="39" cy="42" rx="5.5" ry="6.5" fill="#3a3328"/>'
    + '<ellipse class="mp-eye" cx="57" cy="42" rx="5.5" ry="6.5" fill="#3a3328"/>'
    + '<circle cx="41" cy="39.5" r="1.8" fill="#fff"/><circle cx="59" cy="39.5" r="1.8" fill="#fff"/>'
    + '<path d="M46 49 L 50 49 L 48 51.5 Z" fill="#f5a6a6"/>'
    + '<path d="M48 51.5 v2 M48 53.5 Q 44 56, 41 54 M48 53.5 Q 52 56, 55 54" stroke="#3a3328" stroke-width="1.6" fill="none" stroke-linecap="round"/>'
    + '<ellipse cx="33" cy="48" rx="4" ry="2.6" fill="#f5a6a6" opacity="0.55"/><ellipse cx="63" cy="48" rx="4" ry="2.6" fill="#f5a6a6" opacity="0.55"/>'
    + '</svg>';

  // ---- 腾讯 QQ 企鹅（标志性：胖圆黑身 + 大红围巾 + 橙色喙/脚 + 大白眼斑）----
  var PENGUIN_SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96" width="72" height="72" aria-label="腾讯企鹅">'
    + '<defs><linearGradient id="petPenguinBody" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3c4a60"/><stop offset="1" stop-color="#141a25"/></linearGradient></defs>'
    + '<ellipse cx="35" cy="89" rx="9" ry="4.6" fill="#f59e0b" stroke="#d97706" stroke-width="1.4"/>'
    + '<ellipse cx="61" cy="89" rx="9" ry="4.6" fill="#f59e0b" stroke="#d97706" stroke-width="1.4"/>'
    + '<path d="M28 84 l-1 2 M35 86 l-1 2 M33 88 l-1 2" stroke="#d97706" stroke-width="1.1" stroke-linecap="round" opacity="0.85"/>'
    + '<path d="M54 84 l-1 2 M61 86 l-1 2 M59 88 l-1 2" stroke="#d97706" stroke-width="1.1" stroke-linecap="round" opacity="0.85"/>'
    + '<path d="M48 9 C 27 9, 16 32, 16 54 C 16 77, 31 89, 48 89 C 65 89, 80 77, 80 54 C 80 32, 69 9, 48 9 Z" fill="url(#petPenguinBody)" stroke="#0b0f16" stroke-width="2.5"/>'
    + '<path d="M34 60 C 34 78, 41 86, 48 86 C 55 86, 62 78, 62 60 C 62 48, 58 42, 48 42 C 38 42, 34 48, 34 60 Z" fill="#f6f8fb"/>'
    + '<path d="M23 44 C 16 52, 18 68, 25 76 C 27 78, 29 76, 28 72 C 24 60, 26 50, 30 46 Z" fill="url(#petPenguinBody)" stroke="#0b0f16" stroke-width="2.2" stroke-linejoin="round"/>'
    + '<path d="M73 44 C 80 52, 78 68, 71 76 C 69 78, 67 76, 68 72 C 72 60, 70 50, 66 46 Z" fill="url(#petPenguinBody)" stroke="#0b0f16" stroke-width="2.2" stroke-linejoin="round"/>'
    + '<ellipse cx="37" cy="33" rx="11" ry="12" fill="#f6f8fb"/>'
    + '<ellipse cx="59" cy="33" rx="11" ry="12" fill="#f6f8fb"/>'
    + '<ellipse class="mp-eye" cx="38" cy="34" rx="4" ry="5" fill="#0b0f16"/>'
    + '<ellipse class="mp-eye" cx="58" cy="34" rx="4" ry="5" fill="#0b0f16"/>'
    + '<circle cx="39.4" cy="32.4" r="1.5" fill="#fff"/><circle cx="59.4" cy="32.4" r="1.5" fill="#fff"/>'
    + '<path d="M43 44 L 53 44 L 48 53 Z" fill="#f59e0b" stroke="#d97706" stroke-width="1.6" stroke-linejoin="round"/>'
    + '<path d="M25 50 Q 48 63, 71 50 L 72 57 Q 48 71, 24 57 Z" fill="#e11d48" stroke="#b3123a" stroke-width="1.4"/>'
    + '<path d="M57 55 C 60 63, 58 70, 60 77 C 62 77, 65 75, 64 71 C 66 67, 63 60, 62 54 Z" fill="#e11d48" stroke="#b3123a" stroke-width="1.4"/>'
    + '<path d="M60 77 l-1 2.4 M63 74 l-1 2.4" stroke="#b3123a" stroke-width="1.3" stroke-linecap="round"/>'
    + '<ellipse cx="29" cy="43" rx="3.8" ry="2.4" fill="#f5a6a6" opacity="0.5"/>'
    + '<ellipse cx="67" cy="43" rx="3.8" ry="2.4" fill="#f5a6a6" opacity="0.5"/>'
    + '</svg>';

  // ---- 京东 Joy ----
  var JOY_SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96" width="72" height="72" aria-label="京东Joy">'
    + '<defs><linearGradient id="petJoyBody" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#e4eaf2"/></linearGradient></defs>'
    + '<ellipse cx="22" cy="25" rx="9.5" ry="15" fill="#e8edf4" stroke="#a8b1c1" stroke-width="2.2" transform="rotate(-20 22 25)"/>'
    + '<ellipse cx="74" cy="25" rx="9.5" ry="15" fill="#e8edf4" stroke="#a8b1c1" stroke-width="2.2" transform="rotate(20 74 25)"/>'
    + '<ellipse cx="22" cy="25" rx="4.5" ry="9" fill="#f3f6fa" transform="rotate(-20 22 25)"/>'
    + '<ellipse cx="74" cy="25" rx="4.5" ry="9" fill="#f3f6fa" transform="rotate(20 74 25)"/>'
    + '<path d="M28 84 C 26 60, 34 54, 48 54 C 62 54, 70 60, 68 84 Z" fill="url(#petJoyBody)" stroke="#a8b1c1" stroke-width="2.5" stroke-linejoin="round"/>'
    + '<ellipse cx="48" cy="74" rx="11" ry="12" fill="#f3f6fa"/>'
    + '<circle cx="48" cy="38" r="27" fill="url(#petJoyBody)" stroke="#a8b1c1" stroke-width="2.5"/>'
    + '<ellipse class="mp-eye" cx="38" cy="35" rx="5.2" ry="6.2" fill="#26292e"/>'
    + '<ellipse class="mp-eye" cx="58" cy="35" rx="5.2" ry="6.2" fill="#26292e"/>'
    + '<circle cx="40.2" cy="32.6" r="1.9" fill="#fff"/><circle cx="60.2" cy="32.6" r="1.9" fill="#fff"/>'
    + '<ellipse cx="48" cy="46" rx="5.4" ry="4.2" fill="#26292e"/>'
    + '<path d="M48 50 v2.6 M48 52.6 Q 44 55.6, 41 53.6 M48 52.6 Q 52 55.6, 55 53.6" stroke="#26292e" stroke-width="1.7" fill="none" stroke-linecap="round"/>'
    + '<ellipse cx="48" cy="57.5" rx="3.4" ry="2.6" fill="#f5a6a6"/>'
    + '<path d="M27 59 Q 48 67, 69 59 L 69 64 Q 48 72, 27 64 Z" fill="#e1251b"/>'
    + '<circle cx="48" cy="71.5" r="3.6" fill="#f2b63b" stroke="#c98a1b" stroke-width="1.4"/>'
    + '<ellipse cx="31" cy="44" rx="4.4" ry="2.8" fill="#f5a6a6" opacity="0.5"/>'
    + '<ellipse cx="65" cy="44" rx="4.4" ry="2.8" fill="#f5a6a6" opacity="0.5"/>'
    + '</svg>';

  // ---- 美团袋鼠 ----
  var KANGAROO_SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96" width="72" height="72" aria-label="美团袋鼠">'
    + '<defs><linearGradient id="petKangarooBody" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffd100"/><stop offset="1" stop-color="#f0a500"/></linearGradient></defs>'
    + '<ellipse cx="34" cy="12" rx="7" ry="15" fill="url(#petKangarooBody)" stroke="#c98a00" stroke-width="2.4" transform="rotate(-10 34 12)"/>'
    + '<ellipse cx="62" cy="12" rx="7" ry="15" fill="url(#petKangarooBody)" stroke="#c98a00" stroke-width="2.4" transform="rotate(10 62 12)"/>'
    + '<ellipse cx="34" cy="12" rx="3.6" ry="10" fill="#fde9b0"/><ellipse cx="62" cy="12" rx="3.6" ry="10" fill="#fde9b0"/>'
    + '<ellipse cx="48" cy="30" rx="19" ry="17" fill="url(#petKangarooBody)" stroke="#c98a00" stroke-width="2.5"/>'
    + '<ellipse cx="48" cy="40" rx="10" ry="8" fill="#fde9b0"/>'
    + '<path d="M30 82 C 28 58, 36 48, 48 48 C 60 48, 68 58, 66 82 Z" fill="url(#petKangarooBody)" stroke="#c98a00" stroke-width="2.5" stroke-linejoin="round"/>'
    + '<ellipse cx="48" cy="58" rx="13" ry="15" fill="#fde9b0"/>'
    + '<path d="M35 64 Q 48 76, 61 64 L 61 72 Q 48 82, 35 72 Z" fill="#e09b00" stroke="#c98a00" stroke-width="1.8"/>'
    + '<circle cx="48" cy="71" r="5.6" fill="#ffdf70" stroke="#c98a00" stroke-width="1.4"/>'
    + '<circle cx="45.8" cy="70.2" r="1" fill="#3a2b12"/><circle cx="50.2" cy="70.2" r="1" fill="#3a2b12"/>'
    + '<path d="M62 78 C 76 76, 84 68, 86 56" fill="none" stroke="#f0a500" stroke-width="7" stroke-linecap="round"/>'
    + '<path d="M62 78 C 76 76, 84 68, 86 56" fill="none" stroke="#c98a00" stroke-width="7" stroke-linecap="round" stroke-dasharray="2 7" opacity="0.5"/>'
    + '<ellipse class="mp-eye" cx="40" cy="28" rx="5" ry="6" fill="#3a2b12"/>'
    + '<ellipse class="mp-eye" cx="56" cy="28" rx="5" ry="6" fill="#3a2b12"/>'
    + '<circle cx="42" cy="25.6" r="1.7" fill="#fff"/><circle cx="58" cy="25.6" r="1.7" fill="#fff"/>'
    + '<ellipse cx="48" cy="42" rx="4" ry="3.2" fill="#3a2b12"/>'
    + '<path d="M48 45 Q 44 48, 41 46 M48 45 Q 52 48, 55 46" stroke="#3a2b12" stroke-width="1.6" fill="none" stroke-linecap="round"/>'
    + '<ellipse cx="31" cy="34" rx="3.6" ry="2.4" fill="#f5a6a6" opacity="0.5"/>'
    + '<ellipse cx="65" cy="34" rx="3.6" ry="2.4" fill="#f5a6a6" opacity="0.5"/>'
    + '</svg>';

  // ---- 瑞幸梅花鹿 ----
  var DEER_SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96" width="72" height="72" aria-label="瑞幸梅花鹿">'
    + '<defs><linearGradient id="petDeerBody" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3f6fe0"/><stop offset="1" stop-color="#1e2f97"/></linearGradient></defs>'
    + '<path d="M30 18 C 22 2, 12 2, 6 0 M30 18 C 26 8, 18 5, 12 9 M30 18 L 24 10" fill="none" stroke="#c49a6a" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"/>'
    + '<path d="M66 18 C 74 2, 84 2, 90 0 M66 18 C 70 8, 78 5, 84 9 M66 18 L 72 10" fill="none" stroke="#c49a6a" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"/>'
    + '<ellipse cx="31" cy="24" rx="6.5" ry="11" fill="url(#petDeerBody)" stroke="#16266e" stroke-width="2.2" transform="rotate(-16 31 24)"/>'
    + '<ellipse cx="65" cy="24" rx="6.5" ry="11" fill="url(#petDeerBody)" stroke="#16266e" stroke-width="2.2" transform="rotate(16 65 24)"/>'
    + '<ellipse cx="31" cy="24" rx="3" ry="7" fill="#cbd6ff"/><ellipse cx="65" cy="24" rx="3" ry="7" fill="#cbd6ff"/>'
    + '<ellipse cx="48" cy="38" rx="20" ry="18" fill="url(#petDeerBody)" stroke="#16266e" stroke-width="2.5"/>'
    + '<ellipse cx="48" cy="46" rx="9" ry="7" fill="#eef1ff"/>'
    + '<path d="M29 84 C 27 62, 36 54, 48 54 C 60 54, 69 62, 67 84 Z" fill="url(#petDeerBody)" stroke="#16266e" stroke-width="2.5" stroke-linejoin="round"/>'
    + '<ellipse cx="48" cy="70" rx="13" ry="14" fill="#eef1ff"/>'
    + '<circle cx="38" cy="68" r="2.6" fill="#fff" opacity="0.95"/><circle cx="58" cy="68" r="2.6" fill="#fff" opacity="0.95"/><circle cx="48" cy="77" r="2.2" fill="#fff" opacity="0.95"/>'
    + '<circle cx="34" cy="78" r="1.8" fill="#fff" opacity="0.9"/><circle cx="62" cy="78" r="1.8" fill="#fff" opacity="0.9"/>'
    + '<ellipse class="mp-eye" cx="39" cy="36" rx="5" ry="6" fill="#141a2e"/>'
    + '<ellipse class="mp-eye" cx="57" cy="36" rx="5" ry="6" fill="#141a2e"/>'
    + '<circle cx="41" cy="33.6" r="1.7" fill="#fff"/><circle cx="59" cy="33.6" r="1.7" fill="#fff"/>'
    + '<ellipse cx="48" cy="45" rx="3.6" ry="2.8" fill="#3a3328"/>'
    + '<path d="M48 48 v1.6 M48 49.6 Q 45 52, 42.6 50.4 M48 49.6 Q 51 52, 53.4 50.4" stroke="#3a3328" stroke-width="1.6" fill="none" stroke-linecap="round"/>'
    + '<ellipse cx="31" cy="42" rx="3.6" ry="2.4" fill="#f5a6a6" opacity="0.5"/>'
    + '<ellipse cx="65" cy="42" rx="3.6" ry="2.4" fill="#f5a6a6" opacity="0.5"/>'
    + '</svg>';

  // ---- 百度小熊 ----
  var BEAR_SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96" width="72" height="72" aria-label="百度小熊">'
    + '<defs><linearGradient id="petBearBody" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fbf8f1"/><stop offset="1" stop-color="#d9d2c5"/></linearGradient></defs>'
    + '<circle cx="30" cy="16" r="9" fill="url(#petBearBody)" stroke="#b7af9e" stroke-width="2.4"/>'
    + '<circle cx="66" cy="16" r="9" fill="url(#petBearBody)" stroke="#b7af9e" stroke-width="2.4"/>'
    + '<circle cx="30" cy="16" r="4.6" fill="#e9ddc8"/><circle cx="66" cy="16" r="4.6" fill="#e9ddc8"/>'
    + '<circle cx="48" cy="36" r="27" fill="url(#petBearBody)" stroke="#b7af9e" stroke-width="2.5"/>'
    + '<ellipse cx="48" cy="44" rx="14" ry="11" fill="#fffaf0"/>'
    + '<ellipse class="mp-eye" cx="38" cy="31" rx="4.8" ry="5.8" fill="#3a3328"/>'
    + '<ellipse class="mp-eye" cx="58" cy="31" rx="4.8" ry="5.8" fill="#3a3328"/>'
    + '<circle cx="40" cy="28.8" r="1.7" fill="#fff"/><circle cx="60" cy="28.8" r="1.7" fill="#fff"/>'
    + '<ellipse cx="48" cy="43" rx="4.6" ry="3.6" fill="#3a3328"/>'
    + '<path d="M48 46.6 v2 M48 48.6 Q 44 51.6, 41 49.6 M48 48.6 Q 52 51.6, 55 49.6" stroke="#3a3328" stroke-width="1.6" fill="none" stroke-linecap="round"/>'
    + '<path d="M28 84 C 26 62, 34 56, 48 56 C 62 56, 70 62, 68 84 Z" fill="url(#petBearBody)" stroke="#b7af9e" stroke-width="2.5" stroke-linejoin="round"/>'
    + '<ellipse cx="48" cy="72" rx="12" ry="13" fill="#fffaf0"/>'
    + '<path d="M30 54 Q 48 62, 66 54 L 66 60 Q 48 68, 30 60 Z" fill="#2932e1"/>'
    + '<path d="M56 58 L 60 74 L 64 72 L 60 56 Z" fill="#2932e1"/>'
    + '<ellipse cx="32" cy="40" rx="4" ry="2.6" fill="#f5a6a6" opacity="0.5"/>'
    + '<ellipse cx="64" cy="40" rx="4" ry="2.6" fill="#f5a6a6" opacity="0.5"/>'
    + '</svg>';

  // ---- 桌宠清单（id 唯一，get() 据此取用；DEFAULT 为默认搭子）----
  var pets = [
    {
      id: 'cat',
      name: '摸鱼小猫',
      company: '摸鱼搭子 · 原始猫',
      emoji: '🐱',
      accent: '#c98f45',
      svg: CAT_SVG,
      greeting: '嗨，我是你的摸鱼搭子 😼',
      idle: [
        '哥们儿…要不摸一会儿？',
        '工位这么安静，不像你啊',
        '老板不在，良辰吉时',
        '闲着也是闲着，摸一把？'
      ],
      pat: [
        '喵，蹭到你了',
        '今天也要开心摸鱼哦',
        '别卷了，卷不动了',
        '这一下值一个亿（情绪价值）',
        '摸鱼使我快乐 🫧'
      ],
      egg: [
        '喵——本猫认证：你是今日摸鱼之星 🐟',
        '九条命的猫都在打盹，你还在卷什么 😹'
      ]
    },
    {
      id: 'penguin',
      name: '腾讯企鹅',
      company: '腾讯 · QQ',
      emoji: '🐧',
      accent: '#1e6fff',
      svg: PENGUIN_SVG,
      greeting: '滴滴滴，你的 QQ 企鹅摸鱼搭子上线啦 🐧',
      idle: [
        '工位静音中…要不咱挂个 Q 摸会儿鱼？',
        '你的企鹅好友拍了拍你：摸鱼走起',
        '在线状态已自动改成「摸鱼中」',
        '南极没网，只好来陪你摸鱼了 ❄️'
      ],
      pat: [
        '蹭到你了，企鹅转圈圈 🐧',
        '这一下，红钻给你亮一亮',
        '摸一下，送你个「摸鱼气泡」'
      ],
      egg: [
        '滴滴滴！你的摸鱼等级已升到「皇冠」👑',
        '恭喜集齐红钻黄钻绿钻，就差一枚「摸鱼钻」💎',
        '群主已把群名改为「摸鱼研究所」',
        'QQ 空间提醒：你有一条来自 2008 年的摸鱼留言',
        '来自南极的问候：老板不知道你在摸鱼 ❄️'
      ]
    },
    {
      id: 'joy',
      name: '京东 Joy',
      company: '京东',
      emoji: '🐶',
      accent: '#e1251b',
      svg: JOY_SVG,
      greeting: '叮咚～京东 Joy 来给你送摸鱼包裹啦 📦',
      idle: [
        '您的摸鱼包裹已到工位，请签收',
        '汪！今日份摸鱼，211 限时达',
        '物流更新：你的快乐正在派送中'
      ],
      pat: [
        '汪汪，给个五星好评呗 ⭐',
        '这一下，是 PLUS 会员的专属抚摸',
        'Joy 转了个圈，掉出一张摸鱼券'
      ],
      egg: [
        '叮咚！您的摸鱼包裹已送达，记得五星好评 ⭐',
        '211 限时达：你摸鱼的速度，比快递还快 📦',
        '京东 PLUS：今日摸鱼免运费，还送双倍快乐',
        '这不是普通的狗，是会送摸鱼快乐的 Joy 🐶',
        '自营摸鱼，次日达，假一赔十（快乐加倍）'
      ]
    },
    {
      id: 'kangaroo',
      name: '美团袋鼠',
      company: '美团',
      emoji: '🦘',
      accent: '#ffc300',
      svg: KANGAROO_SVG,
      greeting: '美团袋鼠：你的下午茶和摸鱼套餐，我都揣兜里啦 🦘',
      idle: [
        '袋鼠的口袋里，藏着你的奶茶和快乐',
        '骑手已接单，你的摸鱼套餐马上到',
        '跳三下，快乐就送到你工位'
      ],
      pat: [
        '蹭到啦，袋鼠给你跳个「摸鱼之舞」',
        '口袋里的糖，分你一颗',
        '这一下，值一份免配送费'
      ],
      egg: [
        '美团外卖，送啥都快——摸鱼也不例外 🛵',
        '骑手已接单，预计 5 分钟后把快乐送到工位',
        '袋鼠的口袋里，装着你点的「摸鱼自由」🧋',
        '团购提醒：今天摸鱼 9 折，第二杯快乐半价',
        '您的「摸鱼套餐」已出餐，正在飞奔而来'
      ]
    },
    {
      id: 'deer',
      name: '瑞幸梅花鹿',
      company: '瑞幸咖啡',
      emoji: '🦌',
      accent: '#1e2f97',
      svg: DEER_SVG,
      greeting: '这一杯，谁不爱？瑞幸小鹿陪你摸鱼 ☕',
      idle: [
        '小蓝杯在手，摸鱼更有劲',
        '生椰拿铁 · 摸鱼版，正在萃取快乐',
        '鹿由器已连接，摸鱼信号满格 📶'
      ],
      pat: [
        '蹭到你了，小鹿给你一个「9.9 的快乐」',
        '梅花鹿的斑点，是快乐的小按钮',
        '这一下，续上一杯咖啡的劲儿'
      ],
      egg: [
        '这一杯，谁不爱？摸鱼也不例外 ☕',
        '9.9 的快乐，摸鱼加倍，生椰拿铁续命',
        '小蓝杯提醒：您的「摸鱼咖啡」已准备好',
        '鹿由器？不，是「摸鱼器」，信号满格 📶',
        '瑞幸说：咖啡续命，摸鱼续快乐'
      ]
    },
    {
      id: 'bear',
      name: '百度小熊',
      company: '百度',
      emoji: '🐻',
      accent: '#2932e1',
      svg: BEAR_SVG,
      greeting: '百度一下，你就知道：我是爱摸鱼的度熊 🐻',
      idle: [
        '熊掌一拍，帮你搜「今天怎么摸鱼」',
        '众里寻他千百度，摸鱼就在工位处',
        '搜索结果：本熊也建议你歇会儿'
      ],
      pat: [
        '蹭到啦，度熊给你点个「熊掌赞」',
        '这一下，搜出好多快乐',
        '熊抱一个，摸鱼更香'
      ],
      egg: [
        '百度一下，你就知道：如何优雅地摸鱼 🔍',
        '搜索结果：约 1,000,000 条「摸鱼」相关内容',
        '度熊温馨提示：您搜索的「工作」暂无结果',
        '众里寻他千百度，蓦然回首，鱼在工位处 🐟',
        '李彦宏拍了拍你：搜索很好，摸鱼也很重要'
      ]
    }
  ];

  var byId = {};
  pets.forEach(function (p) { byId[p.id] = p; });

  global.MoyuPets = {
    DEFAULT: 'cat',
    list: pets,
    byId: byId,
    get: function (id) {
      return byId[id] || byId[this.DEFAULT] || pets[0];
    }
  };
})(typeof globalThis !== 'undefined' ? globalThis : window);
