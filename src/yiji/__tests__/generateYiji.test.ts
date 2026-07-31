import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateYiji, YI_POOL, JI_POOL, DEFAULT_COUNT } from '../index.ts';

test('词库数量达标', () => {
  assert.ok(YI_POOL.length >= 30, `宜词库应不少于30条，当前 ${YI_POOL.length}`);
  assert.ok(JI_POOL.length >= 30, `忌词库应不少于30条，当前 ${JI_POOL.length}`);
});

test('generateYiji 默认返回数量正确的宜/忌数组', () => {
  const r = generateYiji();
  assert.equal(r.yi.length, DEFAULT_COUNT);
  assert.equal(r.ji.length, DEFAULT_COUNT);
});

test('generateYiji 支持自定义 count', () => {
  const r = generateYiji(4);
  assert.equal(r.yi.length, 4);
  assert.equal(r.ji.length, 4);
});

test('generateYiji 返回的词条均来自对应词库', () => {
  const r = generateYiji();
  for (const w of r.yi) assert.ok(YI_POOL.includes(w), `宜项 ${w} 不在词库`);
  for (const w of r.ji) assert.ok(JI_POOL.includes(w), `忌项 ${w} 不在词库`);
});

test('generateYiji 同一次调用内宜/忌来源于独立词库，不串项', () => {
  const r = generateYiji();
  for (const w of [...r.yi, ...r.ji]) {
    assert.ok(YI_POOL.includes(w) || JI_POOL.includes(w));
  }
});

test('大规模抽样仍稳定返回非空结果', () => {
  for (let i = 0; i < 1000; i++) {
    const r = generateYiji();
    assert.equal(r.yi.length, DEFAULT_COUNT);
    assert.equal(r.ji.length, DEFAULT_COUNT);
  }
});
