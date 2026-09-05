// Pins the seam talk policy grid (broadcast/seam-talk-policy.ts — fork,
// dj-mixing-plan Phase 5): a blended seam never carries a link in v1, a plain
// seam always may, and the acapella stays 'drop' even when the talk-window
// increment later opens the sustain canvas.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { linkDisposition } from '../src/broadcast/seam-talk-policy.js';

test('plain seams air their link', () => {
  assert.equal(linkDisposition({ blended: false }).disposition, 'air');
});

test('every blended seam drops the link in v1, whatever the preset', () => {
  for (const preset of [undefined, null, 'beat_carry', 'bass_swap', 'harmonic_sustain', 'acapella_out', 'future_preset']) {
    assert.equal(linkDisposition({ blended: true, preset: preset as string | null | undefined }).disposition, 'drop', String(preset));
  }
});

test('reasons name the seam kind (booth-log legibility)', () => {
  assert.match(linkDisposition({ blended: true, preset: 'acapella_out' }).reason, /voice/);
  assert.match(linkDisposition({ blended: true, preset: 'harmonic_sustain' }).reason, /talk/);
});
