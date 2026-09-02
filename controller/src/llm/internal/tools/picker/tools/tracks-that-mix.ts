import { tool } from 'ai';
import { z } from 'zod';
import * as db from '../../../../../music/library-db.js';
import * as mixGraph from '../../../../../music/mix-graph.js';
import { definePickerTool } from '../defs.js';

// Tracks measured to MIX cleanly out of a seed track (fork: mix intelligence)
// — the mix graph's top edges: outgoing ENDING key vs incoming OPENING key on
// the Camelot wheel, tempo locked or inside the beatmatch stretch window,
// tempo-stability vetted. Registered only when a mixSeedId rides the scope
// (there is an on-air track to mix out of) AND the graph actually holds edges
// — a dead tool spends the forced-tool provider's single discovery call on
// nothing (the registry rule).
export default definePickerTool({
  name: 'tracksThatMix',
  available: ({ scope }) => !!scope.mixSeedId && mixGraph.hasEdges(),
  build: ({ collect, emptyResult, scope }) => tool({
    description: 'Tracks MEASURED to beatmix cleanly out of a given track — harmonic (Camelot) key agreement at the actual seam plus locked or stretch-lockable tempo. The strongest signal for a DJ-mode mixed segue; results carry `mix` (0..1, higher = tighter blend). Pass the on-air song id.',
    inputSchema: z.object({
      songId: z.string().describe('the song id to mix out of — normally the on-air track'),
    }),
    execute: async ({ songId }) => {
      try {
        // Resolve against the graph; an unknown/mistyped id falls back to the
        // scope's own seed so the tool degrades to "what mixes out of the
        // on-air track" rather than an empty answer.
        let seed = songId?.trim() || '';
        let edges = mixGraph.edgesFor(seed, 40);
        if (!edges.length && scope.mixSeedId && seed !== scope.mixSeedId) {
          seed = scope.mixSeedId;
          edges = mixGraph.edgesFor(seed, 40);
        }
        if (!edges.length) {
          return emptyResult(0, 'no measured mix partners for that track — its tempo/key have no analysed neighbours; pick for flow with the other tools instead');
        }
        const tracks = edges
          .map(e => db.getTrack(e.toId))
          .filter((t): t is NonNullable<typeof t> => !!t)
          .map(t => ({
            id: t.id,
            title: t.title,
            artist: t.artist,
            album: t.album,
            genres: t.genres,
            bpm: t.bpm,
            musicalKey: t.musicalKey,
            duration: t.durationSec,
            moods: t.moods,
            energy: t.energy,
          }));
        const shown = collect(tracks);
        if (!shown.length) {
          return emptyResult(tracks.length, 'every measured mix partner was played recently or already shown this pick — mix another time; choose for flow instead');
        }
        return shown;
      } catch (err) {
        return { error: (err as Error).message };
      }
    },
  }),
});
