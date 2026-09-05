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

export type LinkDisposition = 'air' | 'after-mix';

export interface SeamTalkInput {
  // A rendered stem blend owns this seam (queue item.stemBlend committed).
  blended: boolean;
  // Which preset rendered it, when the worker said (older workers/beat carry
  // may omit it — unknown is treated like the groove presets).
  preset?: string | null;
}

// The DJ's talk is the station's USP, and the persona only speaks every few
// tracks — a policy that DROPS links on blended seams silences him almost
// entirely once mix runs chain (operator call, 2026-09-05). So a blended
// seam never loses its link: it moves to AFTER the mix completes (clip end +
// a breathing pad), where the voice lands in the pocket instead of on the
// hand-off. The only outright loss is the fire-time vocal-fit guard below —
// never talk over a singer outranks never lose a line.
export function linkDisposition(seam: SeamTalkInput): { disposition: LinkDisposition; reason: string } {
  if (!seam.blended) return { disposition: 'air', reason: 'plain seam — link airs as always' };
  const p = seam.preset || 'beat_carry';
  if (p === 'acapella_out') return { disposition: 'after-mix', reason: 'acapella seam — voice waits until the outgoing singer has finished' };
  return { disposition: 'after-mix', reason: 'beatmixed seam — voice lands after the hand-off' };
}

// Breathing pad between the clip's end and the voice — the incoming track
// establishes itself before the DJ speaks.
export const AFTER_MIX_PAD_SEC = 2.0;

// Does a link of `wavSec` fit the incoming track's vocal-free pocket after
// the mix? The link starts at inCueSec + delay-from-clip-end (all absolute on
// the incoming track's own timeline) and must END before the next measured
// vocal onset, with half a second of grace. Unknown vocal data (null) fits —
// un-analysed tracks keep the link, mirroring every other measured-field
// posture. `[]` = measured instrumental: always fits.
export function afterMixTalkFits(args: {
  startSec: number; // absolute position on the incoming track where speech begins
  wavSec: number;
  vocalRanges: Array<{ startMs: number; endMs: number }> | null | undefined;
}): boolean {
  const { startSec, wavSec, vocalRanges } = args;
  if (vocalRanges == null) return true;
  const endSec = startSec + wavSec + 0.5;
  return !vocalRanges.some(r => r.startMs / 1000 < endSec && r.endMs / 1000 > startSec);
}
