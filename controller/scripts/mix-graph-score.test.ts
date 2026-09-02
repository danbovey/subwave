// Unit tests for the mix-intelligence pure maths (music/mix.ts): tempo
// stability (tempoStabilityCv — the grid-trust signal that stops beatmixes on
// drifting material) and the directed seam score (mixEdgeScore — the mix
// graph's edge weight and the `mix` stamp on picker candidates).
//
// node:test style; auto-discovered. Run: `npm test -- mix-graph-score`.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tempoStabilityCv, TEMPO_STABLE_CV, mixEdgeScore } from '../src/music/mix.js';

function grid(bpm: number, beats: number, jitterMs = 0): number[] {
  const step = 60000 / bpm;
  const out: number[] = [];
  for (let i = 0; i < beats; i++) {
    out.push(Math.round(i * step + (i % 2 ? jitterMs : -jitterMs)));
  }
  return out;
}

test('tempoStabilityCv: quantised grid reads stable, drifting grid does not', () => {
  const tight = tempoStabilityCv(grid(124, 60));
  assert.ok(tight != null && tight <= TEMPO_STABLE_CV, `machine grid CV ${tight} within threshold`);
  // ±60ms alternating jitter at 124bpm (~484ms beat) is a sloppy live feel.
  const loose = tempoStabilityCv(grid(124, 60, 60));
  assert.ok(loose != null && loose > TEMPO_STABLE_CV, `drifting grid CV ${loose} over threshold`);
});

test('tempoStabilityCv: too few beats → null (unknown, never "unstable")', () => {
  assert.equal(tempoStabilityCv(grid(124, 5)), null);
  assert.equal(tempoStabilityCv(null), null);
  assert.equal(tempoStabilityCv([]), null);
});

test('mixEdgeScore: locked pair scores high, clash scores low', () => {
  const locked = mixEdgeScore(
    { bpm: 124, key: '8A', keyEnd: '8A', ending: 'cold' },
    { bpm: 124, key: '8A', keyStart: '8A' },
  );
  assert.ok(locked >= 0.9, `locked pair ${locked}`);
  const clash = mixEdgeScore(
    { bpm: 124, key: '8A', keyEnd: '8A' },
    { bpm: 96, key: '3B', keyStart: '3B' },
  );
  assert.ok(clash < 0.3, `clash ${clash}`);
});

test('mixEdgeScore: stretch window earns partial tempo credit', () => {
  // 5% apart — bpmCompat tier 0.3, but a render can lock it: expect more than
  // the raw crossfade tier gives, less than truly locked.
  const stretched = mixEdgeScore(
    { bpm: 120, key: '8A', keyEnd: '8A' },
    { bpm: 126, key: '8A', keyStart: '8A' },
  );
  const raw = 0.55 * 0.3 + 0.45 * 1;
  assert.ok(stretched > raw, `stretch credit ${stretched} > raw ${raw}`);
});

test('mixEdgeScore: an unstable grid caps the tempo term', () => {
  const stable = mixEdgeScore(
    { bpm: 124, key: '8A', keyEnd: '8A' },
    { bpm: 124, key: '8A', keyStart: '8A' },
  );
  const wobbly = mixEdgeScore(
    { bpm: 124, key: '8A', keyEnd: '8A', stabilityCv: 0.12 },
    { bpm: 124, key: '8A', keyStart: '8A' },
  );
  assert.ok(wobbly < stable, `unstable ${wobbly} < stable ${stable}`);
  // Null CV = unknown → no penalty (an un-measured library keeps old scores).
  const unknown = mixEdgeScore(
    { bpm: 124, key: '8A', keyEnd: '8A', stabilityCv: null },
    { bpm: 124, key: '8A', keyStart: '8A' },
  );
  assert.equal(unknown, stable);
});

test('mixEdgeScore: a measured fade softens but does not kill the edge', () => {
  const cold = mixEdgeScore(
    { bpm: 124, key: '8A', keyEnd: '8A', ending: 'cold' },
    { bpm: 124, key: '8A', keyStart: '8A' },
  );
  const fade = mixEdgeScore(
    { bpm: 124, key: '8A', keyEnd: '8A', ending: 'fade' },
    { bpm: 124, key: '8A', keyStart: '8A' },
  );
  assert.ok(fade < cold && fade > 0.5, `fade ${fade} softened vs ${cold}`);
});
