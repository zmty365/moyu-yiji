import { YI_POOL, JI_POOL, DEFAULT_COUNT } from './const.ts';

// 从词库随机抽取 count 条。允许重复（是否去重交给前端刷新逻辑），抽取次数越少越贴近"相同结果"。
function sample(pool: readonly string[], count: number): string[] {
  const len = pool.length;
  const result: string[] = [];
  for (let i = 0; i < count; i++) {
    // Math.random 每次返回 [0,1)，乘 len 后向下取整得到 [0, len-1] 的均匀下标。
    const idx = Math.floor(Math.random() * len);
    result.push(pool[idx]);
  }
  return result;
}

export interface YijiResult {
  yi: string[];
  ji: string[];
}

// 每次调用返回本次随机生成的宜项数组与忌项数组。count 可传参控制数量，默认各 6 条。
export function generateYiji(count: number = DEFAULT_COUNT): YijiResult {
  // 同时基于两个独立词库抽样，保证"宜/忌"相互独立不串项。
  return {
    yi: sample(YI_POOL, count),
    ji: sample(JI_POOL, count),
  };
}
