// Mix graph (fork: mix intelligence, dj-mixing-plan Phase 4) — top-K "mixes
// cleanly into" adjacency over the analysed library, built from per-track
// measurements only (mix.mixEdgeScore). Deliberately O(n·K) storage and
// in-memory: mixability factorises into per-track features, so a persisted
// pair matrix would store derivable data that staled on every analysis pass.
// The bpm-window bucketing keeps the build sub-quadratic on large catalogues
// (each track is only compared against candidates inside the stretch window
// and its half/double folds).
//
// Consumers:
//   - the tracksThatMix picker tool (edges for a seed id)
//   - the `mix` score stamped on every picker candidate (mixScore)
// Rebuilds lazily on first use and after every analysis pass (invalidate() is
// called from runAnalysisPass); a graph is never persisted, so there is no
// migration and nothing to drift.

import * as db from './library-db.js';
import * as mix from './mix.js';

export interface MixEdge {
  toId: string;
  score: number;
}

// Keep this many outgoing edges per track. 30 ≈ a working crate for one seam;
// the picker tool caps its answer far lower.
const TOP_K = 30;
// Edges below this aren't a mix, they're a crossfade — don't store them.
const EDGE_MIN_SCORE = 0.5;

interface SeamSide {
  out: mix.MixEdgeSide; // this track as the OUTGOING side of a seam
  inn: mix.MixEdgeSide; // this track as the INCOMING side
}

let _edges: Map<string, MixEdge[]> | null = null;
let _sides: Map<string, SeamSide> | null = null;

export function invalidate(): void {
  _edges = null;
  _sides = null;
}

function sideFor(r: db.MixGraphRow): SeamSide {
  const durMs = r.durationSec && r.durationSec > 0 ? r.durationSec * 1000 : null;
  const key = r.musicalKey;
  const ending = r.outro?.ending === 'fade' || r.outro?.ending === 'cold' ? r.outro.ending : null;
  const stabilityCv = mix.tempoStabilityCv(r.beatsMs);
  return {
    out: {
      // The tail tempo is what the seam actually meets when measured.
      bpm: r.outro?.bpm ?? r.bpm,
      key,
      keyEnd: mix.endingKeyFrom(r.keyRanges, durMs, key),
      ending,
      stabilityCv,
    },
    inn: {
      bpm: r.bpm,
      key,
      keyStart: mix.openingKeyFrom(r.keyRanges, key),
      stabilityCv,
    },
  };
}

function build(): void {
  const rows = db.mixGraphRows();
  const sides = new Map<string, SeamSide>();
  for (const r of rows) sides.set(r.id, sideFor(r));

  // BPM-window bucketing: sort once, then for each track walk only the
  // candidates whose bpm sits inside the stretch window around its own tempo
  // or a clean half/double of it. On a 400-track library this is cosmetic; on
  // a 200k one it is the difference between a rebuild and a hang.
  const sorted = rows
    .filter(r => r.bpm != null && r.bpm > 0)
    .map(r => ({ id: r.id, bpm: r.bpm as number }))
    .sort((a, b) => a.bpm - b.bpm);
  const bpms = sorted.map(s => s.bpm);
  const lowerBound = (v: number) => {
    let lo = 0, hi = bpms.length;
    while (lo < hi) { const m = (lo + hi) >> 1; if (bpms[m] < v) lo = m + 1; else hi = m; }
    return lo;
  };
  const windowIds = (center: number): string[] => {
    const ids: string[] = [];
    for (const c of [center, center * 2, center / 2]) {
      const lo = lowerBound(c * (1 - mix.STRETCH_MAX_RATIO) - 1e-9);
      const hi = lowerBound(c * (1 + mix.STRETCH_MAX_RATIO) + 1e-9);
      for (let i = lo; i < hi; i++) ids.push(sorted[i].id);
    }
    return ids;
  };

  const edges = new Map<string, MixEdge[]>();
  for (const r of rows) {
    const from = sides.get(r.id);
    const outBpm = from?.out.bpm;
    if (!from || outBpm == null || outBpm <= 0) continue;
    const scored: MixEdge[] = [];
    for (const toId of windowIds(outBpm)) {
      if (toId === r.id) continue;
      const to = sides.get(toId);
      if (!to) continue;
      const score = mix.mixEdgeScore(from.out, to.inn);
      if (score >= EDGE_MIN_SCORE) scored.push({ toId, score });
    }
    scored.sort((a, b) => b.score - a.score);
    edges.set(r.id, scored.slice(0, TOP_K));
  }
  _edges = edges;
  _sides = sides;
}

function ensure(): void {
  if (_edges == null || _sides == null) build();
}

// Whether the graph has anything to say — gates the picker tool off on an
// un-analysed library rather than offering a dead tool (the registry rule).
export function hasEdges(): boolean {
  try {
    ensure();
    for (const list of _edges!.values()) if (list.length > 0) return true;
    return false;
  } catch {
    return false;
  }
}

// Top mixable successors for a seed track id. [] when the seed is unknown or
// has no measured partners.
export function edgesFor(seedId: string, limit = TOP_K): MixEdge[] {
  try {
    ensure();
    return (_edges!.get(seedId) ?? []).slice(0, Math.max(1, limit));
  } catch {
    return [];
  }
}

// Directed seam score seed → candidate, or null when either side is unknown.
// Used to stamp `mix` on picker candidates; reads the prebuilt per-track sides
// so a 100-candidate stamp costs map lookups, not row parses.
export function mixScore(seedId: string | null | undefined, candidateId: string | null | undefined): number | null {
  if (!seedId || !candidateId || seedId === candidateId) return null;
  try {
    ensure();
    const from = _sides!.get(seedId);
    const to = _sides!.get(candidateId);
    if (!from || !to) return null;
    return mix.mixEdgeScore(from.out, to.inn);
  } catch {
    return null;
  }
}
