import { expect, test } from "bun:test";
import { useFilmPlaybackStore } from "../src/stores/use-film-playback-store";

test("closing one of multiple film previews keeps decorative playback suspended", () => {
    const first = useFilmPlaybackStore.getState().acquire();
    const second = useFilmPlaybackStore.getState().acquire();
    try {
        expect(useFilmPlaybackStore.getState().activePreviews).toBe(2);
        first();
        expect(useFilmPlaybackStore.getState().activePreviews).toBe(1);
        first();
        expect(useFilmPlaybackStore.getState().activePreviews).toBe(1);
    } finally {
        first();
        second();
    }
    expect(useFilmPlaybackStore.getState().activePreviews).toBe(0);
});
