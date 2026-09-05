// Pins the seam talk policy grid (broadcast/seam-talk-policy.ts — fork,
// dj-mixing-plan Phase 5): a blended seam MOVES its link to after the mix
// (the DJ's talk is the station's USP — moved, never lost), a plain seam
// airs as always, and the after-mix vocal-fit maths guards the landing.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { linkDisposition, afterMixTalkFits } from '../src/broadcast/seam-talk-policy.js';

test('plain seams air their link', () => {
  assert.equal(linkDisposition({ blended: false }).disposition, 'air');
});

test('every blended seam defers the link to after the mix', () => {
  for (const preset of [undefined, null, 'beat_carry', 'bass_swap', 'harmonic_sustain', 'acapella_out']) {
    assert.equal(linkDisposition({ blended: true, preset: preset as string | null | undefined }).disposition, 'after-mix', String(preset));
  }
});

test('vocal fit: unknown data airs, instrumental always fits, a singer blocks', () => {
  assert.ok(afterMixTalkFits({ startSec: 20, wavSec: 8, vocalRanges: null }), 'unknown → fits');
  assert.ok(afterMixTalkFits({ startSec: 20, wavSec: 8, vocalRanges: [] }), 'instrumental → fits');
  // vocal 25-40s: an 8s line from 20s would end ~28.5s inside it → no fit
  assert.ok(!afterMixTalkFits({ startSec: 20, wavSec: 8, vocalRanges: [{ startMs: 25000, endMs: 40000 }] }));
  // same vocal, 3s line ends 23.5s < 25s → fits
  assert.ok(afterMixTalkFits({ startSec: 20, wavSec: 3, vocalRanges: [{ startMs: 25000, endMs: 40000 }] }));
  // vocal entirely before the start → fits
  assert.ok(afterMixTalkFits({ startSec: 20, wavSec: 8, vocalRanges: [{ startMs: 1000, endMs: 15000 }] }));
});
