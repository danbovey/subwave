// Pins the Banter structured speaker contract (issue #1512).
//
// generateBanter() validates every line against a per-call z.enum of the active
// cast's persona ids. The prompt must therefore tell the model to copy those ids
// exactly, rather than substituting a display name, cast role, or rewritten id.
// This renders the real system prompt only; no LLM or network call is involved.
//
// Run: `npm test -- banter-speaker-ids`.

import assert from 'node:assert/strict';
import test from 'node:test';

import { banterSystem } from '../src/llm/internal/prompts/banter.js';

const prompt = banterSystem({
  host: {
    id: 'p_default1',
    name: 'Default Host',
    soul: 'warm and concise',
  },
  guests: [{
    id: 'p_9751c3',
    name: 'Guest Voice',
    soul: 'curious and playful',
  }],
});

test('banter prompt renders the exact active cast persona ids', () => {
  assert.match(prompt, /- p_default1 — Default Host \(HOST\):/);
  assert.match(prompt, /- p_9751c3 — Guest Voice \(GUEST\):/);
});

test('banter prompt requires verbatim speaker ids and rejects substitutions', () => {
  assert.match(prompt, /structured "speaker" field/i);
  assert.match(prompt, /copy the persona id exactly and verbatim from the cast list/i);
  assert.match(prompt, /never use a display name/i);
  assert.match(prompt, /HOST or GUEST role/i);
  assert.match(prompt, /altered, reformatted, or rewritten persona id/i);
});
