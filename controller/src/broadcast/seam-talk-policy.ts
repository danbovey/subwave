// Seam talk policy (fork: dj-mixing-plan Phase 5) — whether the DJ speaks
// across a given transition. One module, one decision (the house policy rule:
// this is reached from the drain today and will be reached from air-time
// rendering later; two inlined copies would drift).
//
// The v1 grid, per the plan:
//   beat carry / bass swap   NO talk — the groove hand-off IS the content;
//                            a voice over a beatmix steps on the craft.
//   acapella out             NEVER — the outgoing voice is already the voice.
//   harmonic sustain         no talk in v1. The sustained pad is the plan's
//                            designated talk canvas, but talking INTO a clip
//                            needs the render's talk-safe window machinery
//                            (a later increment); until then silence beats a
//                            line landing on the drop.
//   plain crossfade          today's behaviour — the link airs as always.
//
// Suppressing links on blended seams is also what produces MIX-SET FRAMING
// with zero extra state: links keep airing on unblended seams, so the DJ
// naturally talks INTO the first track of a run and OUT of its last — the
// classic "next twenty minutes nonstop" shape, emergent.

export type LinkDisposition = 'air' | 'drop';

export interface SeamTalkInput {
  // A rendered stem blend owns this seam (queue item.stemBlend committed).
  blended: boolean;
  // Which preset rendered it, when the worker said (older workers/beat carry
  // may omit it — unknown is treated like the groove presets: no talk).
  preset?: string | null;
}

export function linkDisposition(seam: SeamTalkInput): { disposition: LinkDisposition; reason: string } {
  if (!seam.blended) return { disposition: 'air', reason: 'plain seam — link airs as always' };
  const p = seam.preset || 'beat_carry';
  if (p === 'acapella_out') return { disposition: 'drop', reason: 'acapella seam — the outgoing voice is the voice' };
  if (p === 'harmonic_sustain') return { disposition: 'drop', reason: 'sustain seam — talk canvas reserved for the talk-window increment' };
  return { disposition: 'drop', reason: 'beatmixed seam — the blend is the content' };
}
