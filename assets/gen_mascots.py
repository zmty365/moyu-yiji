#!/usr/bin/env python3
"""生成小型 SVG 吉祥物：摸鱼小猫 + 摸鱼小鱼（纯标准库，离线可用）。

配色与"通胜/月历"暖调相融：
  墨色 #3a3328 / 宣纸米 #f7efdf / 朱砂红 #8c1b12 / 稻金黄 #c49a4a / 黛绿 #3b5a4e

用法：python3 assets/gen_mascots.py
输出：assets/mascot-cat.svg、assets/mascot-fish.svg
"""
import os

OUT_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)))

INK = '#3a3328'      # 墨色描边
PAPER = '#f7efdf'    # 宣纸米底
RED = '#b3261e'      # 朱砂红
GOLD = '#c49a4a'     # 稻金黄
GREEN = '#3b5a4e'    # 黛绿
CREAM = '#ffedd6'    # 奶油猫肚皮

CAT = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96" width="96" height="96" role="img" aria-label="摸鱼小猫">
  <defs>
    <linearGradient id="catBody" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#f2c78f"/>
      <stop offset="1" stop-color="#e0a96b"/>
    </linearGradient>
  </defs>
  <!-- 睡垫：黛绿椭圆 -->
  <ellipse cx="48" cy="80" rx="36" ry="10" fill="{PAPER}" stroke="{GREEN}" stroke-width="2"/>
  <ellipse cx="48" cy="80" rx="36" ry="6" fill="none" stroke="{GOLD}" stroke-width="1.5" opacity="0.7"/>
  <!-- 尾巴 -->
  <path d="M60 74 C 74 78, 78 64, 70 56" fill="none" stroke="{INK}" stroke-width="4" stroke-linecap="round"/>
  <!-- 身体（趴伏） -->
  <ellipse cx="48" cy="66" rx="30" ry="16" fill="url(#catBody)" stroke="{INK}" stroke-width="2.5"/>
  <!-- 前爪并拢 -->
  <path d="M34 72 L 40 72 M 56 72 L 62 72" stroke="{INK}" stroke-width="2.5" stroke-linecap="round" opacity="0.6"/>
  <!-- 头 -->
  <circle cx="48" cy="40" r="21" fill="url(#catBody)" stroke="{INK}" stroke-width="2.5"/>
  <path d="M32 34 L 37 24 L 44 33 Z" fill="url(#catBody)" stroke="{INK}" stroke-width="2.5" stroke-linejoin="round"/>
  <path d="M64 34 L 59 24 L 52 33 Z" fill="url(#catBody)" stroke="{INK}" stroke-width="2.5" stroke-linejoin="round"/>
  <!-- 闭眼（打盹） -->
  <path d="M40 39 Q 44 42, 48 39" stroke="{INK}" stroke-width="2.5" fill="none" stroke-linecap="round"/>
  <path d="M48 39 Q 52 42, 56 39" stroke="{INK}" stroke-width="2.5" fill="none" stroke-linecap="round"/>
  <!-- 鼻子 -->
  <path d="M47 44 L 49 44 M46 45 Q 48 46, 50 45" stroke="{INK}" stroke-width="1.8" fill="none" stroke-linecap="round"/>
  <!-- 胡须 -->
  <path d="M34 43 L 24 41 M32 47 L 22 48 M62 43 L 72 41 M64 47 L 74 48" stroke="{INK}" stroke-width="1.5" stroke-linecap="round" opacity="0.6"/>
  <!-- 腮红 -->
  <circle cx="35" cy="47" r="3" fill="{RED}" opacity="0.35"/>
  <circle cx="61" cy="47" r="3" fill="{RED}" opacity="0.35"/>
  <!-- 头顶鱼骨 -->
  <path d="M45 6 h6 M48 6 v6" stroke="{GOLD}" stroke-width="2" stroke-linecap="round"/>
  <path d="M45 12 M51 12 M45 6 M51 6" stroke="none"/>
  <text x="48" y="7" font-size="12" text-anchor="middle" fill="{GOLD}" font-family="sans-serif">🐟</text>
</svg>'''

FISH = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96" width="96" height="96" role="img" aria-label="摸鱼小鱼">
  <defs>
    <linearGradient id="fishBody" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#f2b56b"/>
      <stop offset="1" stop-color="#d97a2e"/>
    </linearGradient>
  </defs>
  <!-- 水波 -->
  <path d="M12 80 Q 22 74, 32 80 T 52 80" fill="none" stroke="{GREEN}" stroke-width="2.5" stroke-linecap="round" opacity="0.6"/>
  <path d="M44 88 Q 54 82, 64 88 T 84 88" fill="none" stroke="{GREEN}" stroke-width="2.5" stroke-linecap="round" opacity="0.6"/>
  <!-- 尾鳍 -->
  <path d="M60 44 L 72 34 L 72 54 Z" fill="url(#fishBody)" stroke="{INK}" stroke-width="2.5" stroke-linejoin="round"/>
  <!-- 鱼身 -->
  <path d="M18 42 Q 28 26, 50 30 Q 68 34, 62 48 Q 68 62, 50 66 Q 28 70, 18 54 Z"
        fill="url(#fishBody)" stroke="{INK}" stroke-width="2.5"/>
  <!-- 鳞纹 -->
  <path d="M30 40 Q 36 46, 44 40 Q 50 46, 56 42" fill="none" stroke="{GOLD}" stroke-width="1.6" opacity="0.7"/>
  <path d="M28 52 Q 34 58, 42 52 Q 48 58, 54 54" fill="none" stroke="{GOLD}" stroke-width="1.6" opacity="0.7"/>
  <!-- 眼睛 -->
  <circle cx="26" cy="45" r="3.2" fill="{INK}"/>
  <circle cx="27" cy="44" r="1.1" fill="#fff"/>
  <!-- 微笑嘴 -->
  <path d="M24 52 Q 28 55, 32 53" fill="none" stroke="{INK}" stroke-width="1.8" stroke-linecap="round"/>
  <!-- 鱼鳍 -->
  <path d="M42 34 L 46 26 L 52 34 Z" fill="url(#fishBody)" stroke="{INK}" stroke-width="2" stroke-linejoin="round"/>
  <!-- 气泡 -->
  <circle cx="70" cy="40" r="3" fill="none" stroke="{GREEN}" stroke-width="1.6" opacity="0.7"/>
  <circle cx="77" cy="34" r="2" fill="none" stroke="{GREEN}" stroke-width="1.4" opacity="0.6"/>
  <circle cx="83" cy="28" r="1.4" fill="none" stroke="{GREEN}" stroke-width="1.2" opacity="0.5"/>
</svg>'''


def main():
    for name, svg in (('mascot-cat.svg', CAT), ('mascot-fish.svg', FISH)):
        path = os.path.join(OUT_DIR, name)
        with open(path, 'w', encoding='utf-8') as f:
            f.write(svg + '\n')
        print('wrote', os.path.basename(path), os.path.getsize(path), 'bytes')


if __name__ == '__main__':
    main()
