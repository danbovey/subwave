// Unit tests for the stem-blend preset vote (music/mix.ts choosePreset —
// feature: blend preset library): which pre-rendered seam a pair's measured
// data earns. Priority is rarest-first (acapella → harmonic sustain → bass
// swap → beat carry) and every input is a measurement, so absent data must
// fall to the beat carry the station already ships.
//
// node:test style; auto-discovered by scripts/run-tests.ts.
// Run: `npm test -- blend-preset`.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { choosePreset } from '../src/music/mix.js';

const base = {
  keyCompat: 0,
  tempoLocked: false,
  outEnding: null as 'fade' | 'cold' | null,
  outVocalTail: null as boolean | null,
  inIntroMs: null as number | null,
};

test('no measurements → beat carry (the shipped default)', () => {
  assert.equal(choosePreset(base), 'beat_carry');
});

test('acapella out needs ALL THREE gates: sung tail, key lock, long intro', () => {
  const all = { ...base, outVocalTail: true, keyCompat: 0.8, inIntroMs: 15000 };
  assert.equal(choosePreset(all), 'acapella_out');
  // Drop each gate in turn — the vote falls to the next preset down, never
  // to a broken acapella.
  assert.notEqual(choosePreset({ ...all, outVocalTail: false }), 'acapella_out');
  assert.notEqual(choosePreset({ ...all, outVocalTail: null }), 'acapella_out');
  assert.notEqual(choosePreset({ ...all, keyCompat: 0.6 }), 'acapella_out');
  assert.notEqual(choosePreset({ ...all, inIntroMs: 8000 }), 'acapella_out');
  assert.notEqual(choosePreset({ ...all, inIntroMs: null }), 'acapella_out');
});

test('harmonic sustain: key lock without a sung tail', () => {
  assert.equal(choosePreset({ ...base, keyCompat: 0.8 }), 'harmonic_sustain');
  assert.equal(choosePreset({ ...base, keyCompat: 1, outVocalTail: false }), 'harmonic_sustain');
  // A sung tail blocks it (the held pad would carry the cut voice's bed) —
  // with the acapella's other gates missing, this pair drops PAST the sustain.
  const sung = choosePreset({ ...base, keyCompat: 0.8, outVocalTail: true });
  assert.notEqual(sung, 'harmonic_sustain');
  assert.notEqual(sung, 'acapella_out'); // intro gate missing too
});

test('bass swap: tempo lock on a non-fading ending, key merely adjacent or worse', () => {
  assert.equal(choosePreset({ ...base, tempoLocked: true }), 'bass_swap');
  assert.equal(choosePreset({ ...base, tempoLocked: true, outEnding: 'cold' }), 'bass_swap');
  // A fade veto: swapping basslines into a receding track swaps into silence.
  assert.equal(choosePreset({ ...base, tempoLocked: true, outEnding: 'fade' }), 'beat_carry');
  // No tempo lock → no swap.
  assert.equal(choosePreset({ ...base, tempoLocked: false, outEnding: 'cold' }), 'beat_carry');
});

test('key lock outranks the bass swap (sustain is the more musical move)', () => {
  assert.equal(
    choosePreset({ ...base, keyCompat: 0.8, tempoLocked: true, outEnding: 'cold' }),
    'harmonic_sustain',
  );
});
