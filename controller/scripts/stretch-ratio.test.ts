// Unit tests for the beatmatch stretch helper (music/mix.ts stretchBpmRatio —
// feature: stem-blend tempo lock): the ±STRETCH_MAX_RATIO window that lets the
// stem-blend tempo gate widen past bpmCompat's <3% tier when the analyzer can
// time-stretch the borrowed loop onto the incoming grid.
//
// node:test style (per-assertion reporting); auto-discovered by
// scripts/run-tests.ts. Run: `npm test -- stretch-ratio`.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { stretchBpmRatio, STRETCH_MAX_RATIO, bpmCompat } from '../src/music/mix.js';

test('locked tempos still report a (unity-ish) ratio', () => {
  assert.equal(stretchBpmRatio(124, 124), 1, 'identical tempos → 1');
  // 124 → 126 is inside bpmCompat's <3% tier AND inside the stretch window;
  // the caller (stem-blend) only consults this after bpmCompat fails, so the
  // overlap is harmless — but the maths must still be right.
  assert.equal(stretchBpmRatio(124, 126), 0.984, '124→126 ≈ 0.984 (speed up slightly)');
});

test('the widened window: gaps bpmCompat rejects but a stretch can lock', () => {
  // 120 vs 126 = 5% — bpmCompat 0.6 (below the blend gate's 0.7 floor), but
  // well inside the ±8% stretch window. This pair is the feature.
  assert.ok(bpmCompat(120, 126) < 0.7, 'precondition: 5% gap fails the plain gate');
  assert.equal(stretchBpmRatio(120, 126), 0.952, '120→126 → ratio 0.952');
  // And the direction flips with the pair: slowing down lengthens the loop.
  assert.equal(stretchBpmRatio(126, 120), 1.05, '126→120 → ratio 1.05');
});

test('beyond the window → null (callers keep the plain gate)', () => {
  // 9% out — past STRETCH_MAX_RATIO.
  assert.equal(stretchBpmRatio(120, 110), null, '120 vs 110 (9%) → null');
  assert.equal(stretchBpmRatio(110, 120), null, 'other direction too');
  // Exactly at the edge stays allowed: 8% on the nose.
  const edge = 100 * (1 + STRETCH_MAX_RATIO);
  assert.notEqual(stretchBpmRatio(edge, 100), null, 'exact +8% edge is inside the window');
});

test('deliberately UNFOLDED: half/double-time pairs are not stretch candidates', () => {
  // 124 vs 62 is bpmCompat 1 (clean double) — the tile-and-truncate path
  // already locks it bar-for-bar; a 2x "stretch" would be nonsense.
  assert.equal(bpmCompat(124, 62), 1, 'precondition: clean half-time is compat 1');
  assert.equal(stretchBpmRatio(124, 62), null, 'half-time → null (unfolded by design)');
});

test('unknown/degenerate tempos → null', () => {
  assert.equal(stretchBpmRatio(null, 124), null, 'null outgoing');
  assert.equal(stretchBpmRatio(124, null), null, 'null incoming');
  assert.equal(stretchBpmRatio(0, 124), null, 'zero outgoing');
  assert.equal(stretchBpmRatio(124, -1), null, 'negative incoming');
});
