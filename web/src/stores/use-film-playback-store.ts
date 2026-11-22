import { create } from "zustand";

type FilmPlaybackState = {
    activePreviews: number;
    acquire: () => () => void;
};

/** Foreground films take bandwidth priority over decorative and hover videos. */
export const useFilmPlaybackStore = create<FilmPlaybackState>((set) => ({
    activePreviews: 0,
    acquire: () => {
        set(state => ({ activePreviews: state.activePreviews + 1 }));
        let released = false;
        return () => {
            if (released) return;
            released = true;
            set(state => ({ activePreviews: state.activePreviews - 1 }));
        };
    },
}));
