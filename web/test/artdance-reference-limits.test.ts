import { test } from "node:test";
import assert from "node:assert/strict";
import { artdance25Resolution, videoGenerationsReferenceError } from "../src/lib/video-generations-constraints";

test("documented ArtDance 2.5 limits do not expand other NewAPI models", () => {
    assert.equal(videoGenerationsReferenceError(30, 10, 10, "Artdance 2.5-720p"), "");
    assert.match(videoGenerationsReferenceError(31, 10, 10, "Artdance 2.5-720p"), /30/);
    assert.match(videoGenerationsReferenceError(10, 0, 0, "Artdance 2.0-1080p"), /9/);
    assert.match(videoGenerationsReferenceError(10, 0, 0, "Seedance 2.5"), /9/);
    assert.equal(artdance25Resolution("Artdance 2.5-720p"), "720p");
    assert.equal(artdance25Resolution("Other Artdance 2.5-720p"), undefined);
});
