import { expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { mergeProductionCaseMedia, type ProductionCatalog, type ProductionItem } from "../src/services/production-library";
import { cleanedCaseMediaBinding, resolveProductionCover, resolveProductionMedia } from "../src/lib/cleaned-case-media";
import { isCaseWithdrawn } from "../src/lib/case-publication-policy";

const id = "case-31b600ea119b48e0bf69ca0672d18856";
const sha256 = "99cc5f437f20c1de15328aa28b33e2d7f147169c9449ced608922ac40b6aad66";
const path = `/production-library/case-media/${id.slice(5)}-${sha256}.mp4`;
const item: ProductionItem = {
    id, kind: "case", name: "坠星", description: "", category: "drama",
    source: "archive", author: "Marley Cove", available: true,
    media: "https://source.invalid/original.mp4",
};
const info = { bytes: 707700808, sha256, durationSeconds: 414.677333, format: "mp4", videoCodec: "h264", audioCodec: "aac" };

test("rank 1122 plays its verified local opening repair and blocks the marked source", () => {
    const caseId = "case-92878f444e344575bd587e608fa07f2e";
    const hash = "9017e1496ef4d31d80e9b2500700cc6701aaa4b97d3ca260916cd6ee5b3d8ba6";
    const localMedia = `/production-library/case-media/${caseId.slice(5)}-${hash}.mp4`;
    const source = { ...item, id: caseId, name: "非自然调查局-应声3", author: "原作者" };
    const localMediaInfo = { ...info, sha256: hash, bytes: 205274777, durationSeconds: 152.648005 };
    expect(resolveProductionMedia(source)).toEqual({ local: undefined, remote: undefined });
    const admitted = mergeProductionCaseMedia({ ...catalog, items: [source] }, {
        ...manifest, entries: [{ id: caseId, localMedia, localMediaInfo }],
    }).items[0];
    expect(resolveProductionMedia(admitted)).toEqual({ local: localMedia, remote: undefined });
    expect(admitted.name).toBe(source.name);
    expect(admitted.author).toBe(source.author);
    expect(admitted.media).toBeUndefined();
    for (const stale of [
        { localMedia: `/production-library/case-media/${caseId.slice(5)}.mp4`, localMediaInfo },
        { localMedia, localMediaInfo: { ...localMediaInfo, bytes: 205274776 } },
        { localMedia, localMediaInfo: { ...localMediaInfo, sha256: "fff14b32e45ba67dfa379135172eb948852979b35b3ae435148514be1c39cafe" } },
    ]) expect(resolveProductionMedia({ ...source, ...stale })).toEqual({ local: undefined, remote: undefined });
});

test("rank 300 admits its qualified opening repair and retains the work and author", () => {
    const caseId = "case-95fe0bfbb9f9475e8bafd16f2c555b02";
    const hash = "26614849bc3e7367688faba982355a3dc386a958b7c3fbc9d8d6774bea4c8bbf";
    const localMedia = `/production-library/case-media/${caseId.slice(5)}-${hash}.mp4`;
    const source = { ...item, id: caseId, name: "雾山川", author: "@吃药都要可乐送" };
    const localMediaInfo = { ...info, sha256: hash, bytes: 1109243528 };
    expect(resolveProductionMedia(source)).toEqual({ local: undefined, remote: undefined });
    const admitted = mergeProductionCaseMedia({ ...catalog, items: [source] }, {
        ...manifest, entries: [{ id: caseId, localMedia, localMediaInfo }],
    }).items[0];
    expect(resolveProductionMedia(admitted)).toEqual({ local: localMedia, remote: undefined });
    expect(admitted.name).toBe(source.name);
    expect(admitted.author).toBe(source.author);
    expect(admitted.media).toBeUndefined();
    for (const stale of [
        { localMedia: `/production-library/case-media/${caseId.slice(5)}.mp4`, localMediaInfo },
        { localMedia, localMediaInfo: { ...localMediaInfo, bytes: 1109243527 } },
        { localMedia, localMediaInfo: { ...localMediaInfo, sha256: "4ea8f3ed5c0358d81546c13025443ce235a4b6fe8c1231a1b4ca0a3a19bf1f24" } },
    ]) expect(resolveProductionMedia({ ...source, ...stale })).toEqual({ local: undefined, remote: undefined });
});

test("rank 488 admits the verified author slate repair and rejects stale source fallback", () => {
    const caseId = "case-c9f2c24c3a0d40539277e0cdfce49669";
    const hash = "284cbf43feed54805dafdb1880ea3e322d50a8fe637711b25014c8e5910f2c29";
    const localMedia = `/production-library/case-media/${caseId.slice(5)}-${hash}.mp4`;
    const source = { ...item, id: caseId, name: "原作品", author: "原作者" };
    const localMediaInfo = { ...info, sha256: hash, bytes: 1245993927, durationSeconds: 231.766667 };
    const admitted = mergeProductionCaseMedia({ ...catalog, items: [source] }, {
        ...manifest, entries: [{ id: caseId, localMedia, localMediaInfo }],
    }).items[0];
    expect(resolveProductionMedia(admitted)).toEqual({ local: localMedia, remote: undefined });
    expect(admitted.author).toBe(source.author);
    expect(resolveProductionMedia(source)).toEqual({ local: undefined, remote: undefined });
    for (const stale of [
        { localMedia: `/production-library/case-media/${caseId.slice(5)}.mp4`, localMediaInfo },
        { localMedia, localMediaInfo: { ...localMediaInfo, bytes: 1245993926 } },
        { localMedia, localMediaInfo: { ...localMediaInfo, sha256: "5f5b2f069fe7590f9723e6e3c80f530fb690fa3249373c0d9f20dd3edeae3934" } },
    ]) expect(resolveProductionMedia({ ...source, ...stale })).toEqual({ local: undefined, remote: undefined });
});
const catalog: ProductionCatalog = {
    version: 1,
    stats: { sourceSkills: 0, portableSkills: 0, agents: 0, referenceSkills: 0, cases: 1, voices: 0, localCovers: 0 },
    items: [item],
};
const manifest = { version: 1, kind: "ltv-case-media", metadataCount: 1, entries: [{ id, localMedia: path, localMediaInfo: info }] };

test("rank 229 admits only its qualified opening repair and preserves creator metadata", () => {
    const caseId = "case-8056e8dfc2db4d04bc81f8c36d9dfb49";
    const hash = "cb39207e383ea0d34efb14162b5ad996283445cedc95aceb44148c02a9b725fd";
    const localMedia = `/production-library/case-media/${caseId.slice(5)}-${hash}.mp4`;
    const source = { ...item, id: caseId, name: "原作品", author: "原作者" };
    const localMediaInfo = { ...info, sha256: hash, bytes: 737143809, durationSeconds: 392.255011 };
    const admitted = mergeProductionCaseMedia({ ...catalog, items: [source] }, {
        ...manifest, entries: [{ id: caseId, localMedia, localMediaInfo }],
    }).items[0];
    expect(resolveProductionMedia(admitted)).toEqual({ local: localMedia, remote: undefined });
    expect(admitted.name).toBe(source.name);
    expect(admitted.author).toBe(source.author);
    const originalInfo = { ...localMediaInfo, bytes: 513496126,
        sha256: "857841e5ce0e8b48ab68258ce59edb56adcf0275f11cff3b7fb9bf1e7740e417" };
    for (const stale of [
        source,
        { ...source, localMedia: `/production-library/case-media/${caseId.slice(5)}.mp4`, localMediaInfo: originalInfo },
        { ...source, localMedia, localMediaInfo: originalInfo },
        { ...source, localMedia, localMediaInfo: { ...localMediaInfo, bytes: localMediaInfo.bytes - 1 } },
        { ...source, localMedia: `/production-library/case-media/${caseId.slice(5)}.mp4`, localMediaInfo },
    ]) expect(resolveProductionMedia(stale)).toEqual({ local: undefined, remote: undefined });
});

test("rank 326 admits the qualified opening repair and rejects the marked original", () => {
    const caseId = "case-cfe62e60c5594ea080b575581e0ef5d5";
    const hash = "84cacb10f6f0aecc0eb1ac50f9a5d644f8c69fe4154a3302810c69ff099100c1";
    const localMedia = `/production-library/case-media/${caseId.slice(5)}-${hash}.mp4`;
    const source = { ...item, id: caseId, name: "原作品", author: "原作者" };
    const localMediaInfo = { ...info, sha256: hash, bytes: 672131614, durationSeconds: 427.386485 };
    const admitted = mergeProductionCaseMedia({ ...catalog, items: [source] }, {
        ...manifest, entries: [{ id: caseId, localMedia, localMediaInfo }],
    }).items[0];
    expect(resolveProductionMedia(admitted)).toEqual({ local: localMedia, remote: undefined });
    expect(admitted.name).toBe(source.name);
    expect(admitted.author).toBe(source.author);
    for (const stale of [
        source,
        { ...source, localMedia: `/production-library/case-media/${caseId.slice(5)}.mp4`, localMediaInfo },
        { ...source, localMedia, localMediaInfo: { ...localMediaInfo, bytes: 646783578,
            sha256: "e075b6f5aa5424156d50c25f155dbb71ba94115cf9a885f88272d82289e62ac0" } },
        { ...source, localMedia, localMediaInfo: { ...localMediaInfo, bytes: 672131613 } },
    ]) expect(resolveProductionMedia(stale)).toEqual({ local: undefined, remote: undefined });
});

test("rank 399 admits only its verified book repair and blocks the marked source", () => {
    const caseId = "case-1507fd7c6dec4976becac97107e06e2d";
    const hash = "02497abebd1ee60f3a8dbc0aeecd43fbd80c8289123b762e7aeeac9ee1f5acd4";
    const localMedia = `/production-library/case-media/${caseId.slice(5)}-${hash}.mp4`;
    const source = { ...item, id: caseId, name: "书封面修补作品", author: "原作者" };
    const localMediaInfo = { ...info, sha256: hash, bytes: 492566085, durationSeconds: 312.656689, videoCodec: "hevc" };
    const admitted = mergeProductionCaseMedia({ ...catalog, items: [source] }, {
        ...manifest, entries: [{ id: caseId, localMedia, localMediaInfo }],
    }).items[0];
    expect(resolveProductionMedia(admitted)).toEqual({ local: localMedia, remote: undefined });
    expect(admitted.name).toBe(source.name);
    expect(admitted.author).toBe(source.author);
    expect(resolveProductionMedia(source)).toEqual({ local: undefined, remote: undefined });
    for (const stale of [
        { localMedia: `/production-library/case-media/${caseId.slice(5)}.mp4`, localMediaInfo },
        { localMedia, localMediaInfo: { ...localMediaInfo, sha256: "763f463e7163159cfb03f251a322585300990386b5932075c34fe1dd8a433b0a" } },
        { localMedia, localMediaInfo: { ...localMediaInfo, bytes: localMediaInfo.bytes - 1 } },
    ]) {
        const rejected = mergeProductionCaseMedia({ ...catalog, items: [source] }, {
            ...manifest, entries: [{ id: caseId, ...stale }],
        }).items[0];
        expect(resolveProductionMedia(rejected)).toEqual({ local: undefined, remote: undefined });
        expect(resolveProductionMedia({ ...source, ...stale })).toEqual({ local: undefined, remote: undefined });
    }
});

test("rank 353 admits its qualified corner repair and rejects the marked source", () => {
    const caseId = "case-256287f63b1f40609ff96ef96eb0e1d9";
    const hash = "42b9aba79db8b2be6047e0842ae52fd97b5543c396da39e57b5a044cd7395591";
    const localMedia = `/production-library/case-media/${caseId.slice(5)}-${hash}.mp4`;
    const source = { ...item, id: caseId, name: "原作品", author: "AI创可贴" };
    const localMediaInfo = { ...info, sha256: hash, bytes: 415953356, durationSeconds: 329.653991 };
    const marked = {
        ...source,
        localMedia: `/production-library/case-media/${caseId.slice(5)}.mp4`,
        localMediaInfo: { ...localMediaInfo, sha256: "e081d10e3c535b388bfaba4061c364151104b494a77038f30a758ffa59c8c530", bytes: 400513491 },
    };
    expect(resolveProductionMedia(marked)).toEqual({ local: undefined, remote: undefined });
    expect(resolveProductionMedia(source)).toEqual({ local: undefined, remote: undefined });
    const admitted = mergeProductionCaseMedia({ ...catalog, items: [source] }, {
        ...manifest, entries: [{ id: caseId, localMedia, localMediaInfo }],
    }).items[0];
    expect(resolveProductionMedia(admitted)).toEqual({ local: localMedia, remote: undefined });
    expect(admitted.name).toBe(source.name);
    expect(admitted.author).toBe(source.author);
    for (const stale of [
        { localMedia: marked.localMedia, localMediaInfo },
        { localMedia, localMediaInfo: marked.localMediaInfo },
        { localMedia, localMediaInfo: { ...localMediaInfo, bytes: localMediaInfo.bytes - 1 } },
    ]) expect(resolveProductionMedia({ ...source, ...stale })).toEqual({ local: undefined, remote: undefined });
});

test("rank 50 admits its verified native 10-bit tail repair and rejects the marked original", () => {
    const caseId = "case-fe406b2f1ed24d5ba88ecd67f2ecbd64";
    const hash = "e52a2cbd2f74ef1c5be9c7b737d6833b433d1fb7288d95672351f81506302d4b";
    const localMedia = `/production-library/case-media/${caseId.slice(5)}-${hash}.mp4`;
    const source = { ...item, id: caseId, name: "飞来一颗大荔枝", author: "原作者" };
    const localMediaInfo = { ...info, sha256: hash, bytes: 501517099, durationSeconds: 263.477007, videoCodec: "hevc" };
    expect(resolveProductionMedia(source)).toEqual({ local: undefined, remote: undefined });
    const admitted = mergeProductionCaseMedia({ ...catalog, items: [source] }, {
        ...manifest, entries: [{ id: caseId, localMedia, localMediaInfo }],
    }).items[0];
    expect(resolveProductionMedia(admitted)).toEqual({ local: localMedia, remote: undefined });
    expect(admitted.name).toBe(source.name);
    expect(admitted.author).toBe(source.author);
    for (const stale of [
        { localMedia: `/production-library/case-media/${caseId.slice(5)}.mp4`, localMediaInfo },
        { localMedia, localMediaInfo: { ...localMediaInfo, sha256: "457b712e5c25413894a11fe210c9be91e6edea2daa6c17e8fde61d013c03088b" } },
        { localMedia, localMediaInfo: { ...localMediaInfo, bytes: localMediaInfo.bytes - 1 } },
    ]) expect(resolveProductionMedia({ ...source, ...stale })).toEqual({ local: undefined, remote: undefined });
});

test("rank 1074 uses only the verified opening repair and cannot fall back to its marked original", () => {
    const caseId = "case-becb9a0a6b3942fbbd1fea12dab7690b";
    const hash = "56373653836ce7d2304f34df3f99ee3d446c72f2e2c9b9f45227ab7c0562e7dd";
    const localMedia = `/production-library/case-media/${caseId.slice(5)}-${hash}.mp4`;
    const source = { ...item, id: caseId, name: "父亲", author: "原作者" };
    const localMediaInfo = { ...info, sha256: hash, bytes: 422011257, durationSeconds: 267.400998 };
    expect(resolveProductionMedia(source)).toEqual({ local: undefined, remote: undefined });
    const admitted = mergeProductionCaseMedia({ ...catalog, items: [source] }, {
        ...manifest, entries: [{ id: caseId, localMedia, localMediaInfo }],
    }).items[0];
    expect(resolveProductionMedia(admitted)).toEqual({ local: localMedia, remote: undefined });
    expect(admitted.author).toBe(source.author);
    for (const stale of [
        { localMedia: `/production-library/case-media/${caseId.slice(5)}.mp4`, localMediaInfo },
        { localMedia, localMediaInfo: { ...localMediaInfo, sha256: "cdd4e2a2e2adb4c08edaa0e5312c6d422b6167281863587821891ca20a016b93" } },
        { localMedia, localMediaInfo: { ...localMediaInfo, bytes: localMediaInfo.bytes - 1 } },
    ]) expect(resolveProductionMedia({ ...source, ...stale })).toEqual({ local: undefined, remote: undefined });
});

test("rank 559 rejects its marked original and preserves creator metadata", () => {
    const caseId = "case-2ffd9c37669e40a2a593822369af1f27";
    const hash = "2d236ac13408e059d112a1bec3db08d942f3707a69cf173f25a35d74d9ad67ce";
    const localMedia = `/production-library/case-media/${caseId.slice(5)}-${hash}.mp4`;
    const localMediaInfo = { ...info, sha256: hash, bytes: 706521926, durationSeconds: 121.138005 };
    const source = { ...item, id: caseId, name: "翻山计划作品", author: "原作者" };
    const marked = {
        ...source,
        localMedia: `/production-library/case-media/${caseId.slice(5)}.mp4`,
        localMediaInfo: { ...info, bytes: 423579789, sha256: "b3a8ca18fa13aa4caa9aef87146dd4bf2a708f644c89f3ada3c3aac32bb9c770" },
    };
    expect(resolveProductionMedia(marked)).toEqual({ local: undefined, remote: undefined });
    expect(resolveProductionMedia(source)).toEqual({ local: undefined, remote: undefined });
    expect(marked.author).toBe(source.author);
    expect(marked.name).toBe(source.name);
    const admitted = mergeProductionCaseMedia({ ...catalog, items: [source] }, {
        ...manifest, entries: [{ id: caseId, localMedia, localMediaInfo }],
    }).items[0];
    expect(resolveProductionMedia(admitted)).toEqual({ local: localMedia, remote: undefined });
    expect(admitted.author).toBe(source.author);
    expect(admitted.name).toBe(source.name);
    for (const stale of [
        { localMedia, localMediaInfo: { ...localMediaInfo, sha256: marked.localMediaInfo.sha256 } },
        { localMedia, localMediaInfo: { ...localMediaInfo, bytes: localMediaInfo.bytes - 1 } },
        { localMedia: marked.localMedia, localMediaInfo },
    ]) expect(resolveProductionMedia({ ...source, ...stale })).toEqual({ local: undefined, remote: undefined });
});

test("rank 445 serves only its qualified footer repair and keeps source attribution", () => {
    const caseId = "case-e1dba5483b2c459f89ce5087ac11e085";
    const hash = "cfc90d434bae158a30a9b2da397f7f646d854c56b709cabba2975c3f062ca639";
    const localMedia = `/production-library/case-media/${caseId.slice(5)}-${hash}.mp4`;
    const source = { ...item, id: caseId, author: "retained-source-author", name: "retained-source-title" };
    const localMediaInfo = { ...info, sha256: hash, bytes: 1074054720, videoCodec: "hevc", audioCodec: "flac" };
    const merge = (metadata = localMediaInfo, mediaPath = localMedia) => mergeProductionCaseMedia({ ...catalog, items: [source] }, {
        ...manifest, entries: [{ id: caseId, localMedia: mediaPath, localMediaInfo: metadata }],
    }).items[0];
    const admitted = merge();
    expect(resolveProductionMedia(admitted)).toEqual({ local: localMedia, remote: undefined });
    expect(admitted.author).toBe(source.author);
    expect(admitted.name).toBe(source.name);
    expect(admitted.localMediaInfo?.audioCodec).toBe("flac");
    for (const rejected of [
        merge({ ...localMediaInfo, bytes: 1074054719 }),
        merge({ ...localMediaInfo, sha256: "222a72723eff5fffe2e01288c5e4014b2e026952f5ae34aa69819c0b73b3300c", bytes: 177886242 }),
        merge(localMediaInfo, `/production-library/case-media/${caseId.slice(5)}.mp4`),
        source,
    ]) {
        expect(resolveProductionMedia(rejected)).toEqual({ local: undefined, remote: undefined });
    }
});

test("rank 307 rejects its marked mango original and remote fallback", () => {
    const caseId = "case-dbac0c58f75c407cba521fdb2bdb84f7";
    const source = { ...item, id: caseId, author: "retained-source-author" };
    const localMedia = `/production-library/case-media/${caseId.slice(5)}.mp4`;
    const localMediaInfo = { ...info, sha256: "7ac0b939436108ee4bf7c043664b7e265dc3159e526db5260542811f679a6ba5", bytes: 184391689 };
    const merged = mergeProductionCaseMedia({ ...catalog, items: [source] }, {
        ...manifest, entries: [{ id: caseId, localMedia, localMediaInfo }],
    }).items[0];
    expect(resolveProductionMedia(merged)).toEqual({ local: undefined, remote: undefined });
    expect(resolveProductionMedia(source)).toEqual({ local: undefined, remote: undefined });
    expect(merged.author).toBe(source.author);
});

test("rank 307 admits only its exact qualified mango repair and retains attribution", () => {
    const caseId = "case-dbac0c58f75c407cba521fdb2bdb84f7";
    const hash = "16975e077267251be675a6a6690b7486c5b8895c230b8a4cf7eea002fb50f189";
    const localMedia = `/production-library/case-media/${caseId.slice(5)}-${hash}.mp4`;
    const source = { ...item, id: caseId, author: "retained-source-author", name: "retained-source-title" };
    const localMediaInfo = { ...info, sha256: hash, bytes: 3497925899, durationSeconds: 102.701995, videoCodec: "hevc" };
    const merge = (metadata = localMediaInfo, mediaPath = localMedia) => mergeProductionCaseMedia({ ...catalog, items: [source] }, {
        ...manifest, entries: [{ id: caseId, localMedia: mediaPath, localMediaInfo: metadata }],
    }).items[0];
    expect(resolveProductionMedia(merge())).toEqual({ local: localMedia, remote: undefined });
    expect(merge().author).toBe(source.author);
    expect(merge().name).toBe(source.name);
    for (const bad of [
        { ...localMediaInfo, bytes: 3497925898 },
        { ...localMediaInfo, sha256: "7ac0b939436108ee4bf7c043664b7e265dc3159e526db5260542811f679a6ba5", bytes: 184391689 },
    ]) expect(resolveProductionMedia(merge(bad))).toEqual({ local: undefined, remote: undefined });
    expect(resolveProductionMedia(merge(localMediaInfo, `/production-library/case-media/${caseId.slice(5)}.mp4`)))
        .toEqual({ local: undefined, remote: undefined });
});

test("rank 599 rejects the marked original and remote fallback", () => {
    const caseId = "case-1a6e6499f9db4b3ca6bc5076a013165b";
    const source = { ...item, id: caseId, author: "retained-source-author" };
    const localMedia = `/production-library/case-media/${caseId.slice(5)}.mp4`;
    const localMediaInfo = { ...info, sha256: "d3659e666f358a3a55a57bcd8545c293b34b1f489425e82ae286bd0a317d3049", bytes: 86802670 };
    const merged = mergeProductionCaseMedia({ ...catalog, items: [source] }, {
        ...manifest, entries: [{ id: caseId, localMedia, localMediaInfo }],
    }).items[0];
    expect(resolveProductionMedia(merged)).toEqual({ local: undefined, remote: undefined });
    expect(resolveProductionMedia(source)).toEqual({ local: undefined, remote: undefined });
    expect(merged.author).toBe(source.author);
});

test("rank 599 admits the exact timed region repair and retains attribution", () => {
    const caseId = "case-1a6e6499f9db4b3ca6bc5076a013165b";
    const hash = "42ff52ecd21e86e90deb34501ef51628cd089e34c79660dd2ad37081c3a95dc4";
    const localMedia = `/production-library/case-media/${caseId.slice(5)}-${hash}.mp4`;
    const source = { ...item, id: caseId, author: "retained-source-author", name: "retained-source-title" };
    const localMediaInfo = { ...info, sha256: hash, bytes: 1042475588, durationSeconds: 83.197098, videoCodec: "hevc" };
    const merge = (metadata = localMediaInfo, mediaPath = localMedia) => mergeProductionCaseMedia({ ...catalog, items: [source] }, {
        ...manifest, entries: [{ id: caseId, localMedia: mediaPath, localMediaInfo: metadata }],
    }).items[0];
    expect(resolveProductionMedia(merge())).toEqual({ local: localMedia, remote: undefined });
    expect(merge().author).toBe(source.author);
    expect(merge().name).toBe(source.name);
    expect(resolveProductionMedia(merge({ ...localMediaInfo, bytes: 1042475587 }))).toEqual({ local: undefined, remote: undefined });
    expect(resolveProductionMedia(merge(localMediaInfo, `/production-library/case-media/${caseId.slice(5)}.mp4`))).toEqual({ local: undefined, remote: undefined });
});

test("rank 675 rejects its original scene with LibTV signs and remote fallback", () => {
    const caseId = "case-3ba73662079d47ffae98c0b985c0b7da";
    const originalHash = "1d8094d61542c4a03ac7b12c955beb0092e09af4a45e4d24cda56954ab01a646";
    const source = { ...item, id: caseId, author: "retained-source-author" };
    const localMedia = `/production-library/case-media/${caseId.slice(5)}.mp4`;
    const localMediaInfo = { ...info, sha256: originalHash, bytes: 82904680, durationSeconds: 66.004, videoCodec: "hevc" };
    const merged = mergeProductionCaseMedia({ ...catalog, items: [source] }, {
        ...manifest, entries: [{ id: caseId, localMedia, localMediaInfo }],
    }).items[0];
    expect(resolveProductionMedia(merged)).toEqual({ local: undefined, remote: undefined });
    expect(resolveProductionMedia(source)).toEqual({ local: undefined, remote: undefined });
    expect(merged.author).toBe(source.author);
});

test("rank 675 admits only its qualified 10-bit sign repair and retains attribution", () => {
    const caseId = "case-3ba73662079d47ffae98c0b985c0b7da";
    const hash = "09854c96c664dee3ffe109d2ee42f10f848169d8f2cf93261c9b694ab6c71011";
    const localMedia = `/production-library/case-media/${caseId.slice(5)}-${hash}.mp4`;
    const source = { ...item, id: caseId, author: "retained-source-author", name: "retained-source-title" };
    const localMediaInfo = { ...info, sha256: hash, bytes: 1573692691, durationSeconds: 66.004, videoCodec: "hevc" };
    const merge = (metadata = localMediaInfo) => mergeProductionCaseMedia({ ...catalog, items: [source] }, {
        ...manifest, entries: [{ id: caseId, localMedia, localMediaInfo: metadata }],
    }).items[0];
    expect(resolveProductionMedia(merge())).toEqual({ local: localMedia, remote: undefined });
    expect(merge().author).toBe(source.author);
    expect(merge().name).toBe(source.name);
    for (const bad of [
        { ...localMediaInfo, bytes: 1573692690 },
        { ...localMediaInfo, sha256: "1d8094d61542c4a03ac7b12c955beb0092e09af4a45e4d24cda56954ab01a646", bytes: 82904680 },
    ]) expect(resolveProductionMedia(merge(bad))).toEqual({ local: undefined, remote: undefined });
});

test("rank 292 requires the qualified presentation clip and retains case attribution", () => {
    const caseId = "case-82981b6f4f4c43cfb56d04555041d3c4";
    const hash = "5a19840e72b629b8c9e1b75c1c78044dbaca1a5648a6554fa2f41b1c79bd18d9";
    const localMedia = `/production-library/case-media/${caseId.slice(5)}-${hash}.mp4`;
    const source = { ...item, id: caseId, name: "retained-source-title", author: "retained-source-author" };
    const localMediaInfo = { ...info, sha256: hash, bytes: 45334824, durationSeconds: 28.866667 };
    const merge = (metadata = localMediaInfo, mediaPath = localMedia) => mergeProductionCaseMedia({ ...catalog, items: [source] }, {
        ...manifest, entries: [{ id: caseId, localMedia: mediaPath, localMediaInfo: metadata }],
    }).items[0];
    expect(resolveProductionMedia(merge())).toEqual({ local: localMedia, remote: undefined });
    expect(merge().name).toBe(source.name);
    expect(merge().author).toBe(source.author);
    expect(resolveProductionMedia(source)).toEqual({ local: undefined, remote: undefined });
    for (const bad of [
        { ...localMediaInfo, bytes: 45334823 },
        { ...localMediaInfo, sha256: "5e4152fe0c643470126b3a61d6bc536af80e94b13d0ae6b18899e5902d016b23", bytes: 45837659 },
        { ...localMediaInfo, sha256: "f".repeat(64) },
    ]) {
        expect(resolveProductionMedia(merge(bad))).toEqual({ local: undefined, remote: undefined });
    }
    expect(resolveProductionMedia(merge(localMediaInfo, `/production-library/case-media/${caseId.slice(5)}.mp4`)))
        .toEqual({ local: undefined, remote: undefined });
});

test("rank 944 plays only its qualified glyph copy and preserves attribution", () => {
    const caseId = "case-9183bb8545fe4b41ae00e4e2fa19ef2a";
    const hash = "16883e37ace4630bd3bcf6ad6a5b16b2ae3b001012506c956c84ce0cf846fbf5";
    const localMedia = `/production-library/case-media/${caseId.slice(5)}-${hash}.mp4`;
    const source = { ...item, id: caseId, name: "亚空间·入侵天庭：第4集", author: "retained-source-author" };
    const localMediaInfo = { ...info, sha256: hash, bytes: 1699297393, durationSeconds: 136.966667, videoCodec: "hevc" };
    const merge = (metadata = localMediaInfo) => mergeProductionCaseMedia({ ...catalog, items: [source] }, {
        ...manifest, entries: [{ id: caseId, localMedia, localMediaInfo: metadata }],
    }).items[0];
    expect(resolveProductionMedia(merge())).toEqual({ local: localMedia, remote: undefined });
    expect(merge().name).toBe(source.name);
    expect(merge().author).toBe(source.author);
    expect(resolveProductionMedia(source)).toEqual({ local: undefined, remote: undefined });
    for (const bad of [
        { ...localMediaInfo, bytes: 1699297392 },
        { ...localMediaInfo, sha256: "7448285e1643323ce0a26b83cc3f4a5b58ab69a0dea59d89cc60089c2eb9e949", bytes: 1699327413 },
        { ...localMediaInfo, sha256: "b8e0e5f5a9b5c42be3fa5ea4741d0df47c23147e12d386866e3d831aa338083e", bytes: 24367916 },
    ]) {
        expect(resolveProductionMedia(merge(bad))).toEqual({ local: undefined, remote: undefined });
    }
});

test("rank 823 uses only its qualified retimed film and preserves attribution", () => {
    const caseId = "case-78b2c0972a454deb8518e6513a19b113";
    const hash = "452fb36a45a02eba27fe51161ef2413db199bd4b5bbd6e79760f9dd8251a7736";
    const localMedia = `/production-library/case-media/${caseId.slice(5)}-${hash}.mp4`;
    const source = { ...item, id: caseId, name: "铭记", author: "retained-source-author" };
    const localMediaInfo = { ...info, sha256: hash, bytes: 1248732482, durationSeconds: 74.884354, videoCodec: "hevc" };
    const merged = mergeProductionCaseMedia({ ...catalog, items: [source] }, {
        ...manifest, entries: [{ id: caseId, localMedia, localMediaInfo }],
    }).items[0];
    expect(resolveProductionMedia(merged)).toEqual({ local: localMedia, remote: undefined });
    expect(merged.author).toBe(source.author);
    expect(merged.name).toBe(source.name);
    expect(merged.media).toBeUndefined();
    expect(resolveProductionMedia(source)).toEqual({ local: undefined, remote: undefined });
    for (const invalid of [
        { ...source, localMedia: `/production-library/case-media/${caseId.slice(5)}.mp4`, localMediaInfo },
        { ...source, localMedia, localMediaInfo: { ...localMediaInfo, bytes: localMediaInfo.bytes - 1 } },
        { ...source, localMedia, localMediaInfo: { ...localMediaInfo, sha256: "fa822373812beada3bd292f13fcd587739f766922eb029b3b2c4ad9c98ff0f41" } },
    ]) expect(resolveProductionMedia(invalid)).toEqual({ local: undefined, remote: undefined });
});

test("rank 939 admits the exact audio-first copy and rejects earlier layouts", () => {
    const caseId = "case-5cbc6e8aec094b018776745836447788";
    const hash = "11d8a2f45f2bc6dc80149bcf844bf8bd7087274ea4a594f6299cdf58fd09e9c7";
    const localMedia = `/production-library/case-media/${caseId.slice(5)}-${hash}.mp4`;
    const source = { ...item, id: caseId, author: "retained-source-author" };
    const localMediaInfo = { ...info, sha256: hash, bytes: 3943769291, durationSeconds: 68.051667 };
    const merged = mergeProductionCaseMedia({ ...catalog, items: [source] }, {
        ...manifest, entries: [{ id: caseId, localMedia, localMediaInfo }],
    }).items[0];
    expect(cleanedCaseMediaBinding(caseId)?.playbackHeld).toBeUndefined();
    expect(resolveProductionMedia(merged)).toEqual({ local: localMedia, remote: undefined });
    expect(merged.author).toBe(source.author);
    expect(merged.media).toBeUndefined();
    expect(resolveProductionMedia(source)).toEqual({ local: undefined, remote: undefined });
    for (const invalid of [
        { ...source, localMedia: `/production-library/case-media/${caseId.slice(5)}-32c98cd3272861361b7997c714b162fd24d65bd4848e1e77a6ff151db11ecc9e.mp4`,
            localMediaInfo: { ...localMediaInfo, sha256: "32c98cd3272861361b7997c714b162fd24d65bd4848e1e77a6ff151db11ecc9e", bytes: 3943767131 } },
        { ...source, localMedia: `/production-library/case-media/${caseId.slice(5)}-88b0111b6ce91e35bae63a7f382e97371dc9efa0c7953a9a909075043370b892.mp4`,
            localMediaInfo: { ...localMediaInfo, sha256: "88b0111b6ce91e35bae63a7f382e97371dc9efa0c7953a9a909075043370b892", bytes: 3943769291 } },
        { ...source, localMedia: `/production-library/case-media/${caseId.slice(5)}.mp4`, localMediaInfo },
        { ...source, localMedia, localMediaInfo: { ...localMediaInfo, bytes: localMediaInfo.bytes - 1 } },
        { ...source, localMedia, localMediaInfo: { ...localMediaInfo, sha256: "a".repeat(64) } },
    ]) expect(resolveProductionMedia(invalid)).toEqual({ local: undefined, remote: undefined });
});

test("rank 938 uses its verified complete film and blocks original or stale fallback", () => {
    const caseId = "case-e729f94db2204eaeab3dec7f8d6720a0";
    const hash = "b1a4b00078a92319fb27b1cafe3786c8ac9d87105fe2fa73e212bad4d363a7e7";
    const localMedia = `/production-library/case-media/${caseId.slice(5)}-${hash}.mp4`;
    const source = { ...item, id: caseId, author: "retained-source-author" };
    const localMediaInfo = { ...info, sha256: hash, bytes: 4053549368, durationSeconds: 360.373991 };
    const merged = mergeProductionCaseMedia({ ...catalog, items: [source] }, {
        ...manifest, entries: [{ id: caseId, localMedia, localMediaInfo }],
    }).items[0];
    expect(resolveProductionMedia(merged)).toEqual({ local: localMedia, remote: undefined });
    expect(merged.author).toBe(source.author);
    expect(merged.media).toBeUndefined();
    expect(resolveProductionMedia(source)).toEqual({ local: undefined, remote: undefined });
    for (const invalid of [
        { ...source, localMedia: `/production-library/case-media/${caseId.slice(5)}.mp4`, localMediaInfo },
        { ...source, localMedia, localMediaInfo: { ...localMediaInfo, bytes: localMediaInfo.bytes - 1 } },
        { ...source, localMedia, localMediaInfo: { ...localMediaInfo, sha256: "a".repeat(64) } },
    ]) expect(resolveProductionMedia(invalid)).toEqual({ local: undefined, remote: undefined });
});

test("rank 930 uses only its qualified overlay copy and retains attribution", () => {
    const caseId = "case-81569a2a45d843288a7b9484245dfae1";
    const hash = "4b5f303c5b6ca058291b95a0a7b9466fee59849060ed1946272bb73f99f22068";
    const localMedia = `/production-library/case-media/${caseId.slice(5)}-${hash}.mp4`;
    const source = { ...item, id: caseId, author: "retained-source-author" };
    const localMediaInfo = { ...info, sha256: hash, bytes: 774538286, durationSeconds: 153.437007 };
    const merged = mergeProductionCaseMedia({ ...catalog, items: [source] }, {
        ...manifest, entries: [{ id: caseId, localMedia, localMediaInfo }],
    }).items[0];
    expect(resolveProductionMedia(merged)).toEqual({ local: localMedia, remote: undefined });
    expect(merged.author).toBe(source.author);
    expect(merged.media).toBeUndefined();
    expect(resolveProductionMedia(source)).toEqual({ local: undefined, remote: undefined });
    for (const invalid of [
        { ...source, localMedia: `/production-library/case-media/${caseId.slice(5)}.mp4`, localMediaInfo },
        { ...source, localMedia, localMediaInfo: { ...localMediaInfo, bytes: localMediaInfo.bytes - 1 } },
        { ...source, localMedia, localMediaInfo: { ...localMediaInfo, sha256: "a".repeat(64) } },
    ]) expect(resolveProductionMedia(invalid)).toEqual({ local: undefined, remote: undefined });
});

test("rank 269 adopts the body glyph repair and blocks original or earlier copies", () => {
    const caseId = "case-707a5d8bab4b45c7b9dba39b2ea6214d";
    const hash = "9f9ab489a0bdf9affd4fd1a682e93b2714e6fb951c2357c71298d7e7ec21f9b7";
    const localMedia = `/production-library/case-media/${caseId.slice(5)}-${hash}.mp4`;
    const source = { ...item, id: caseId, name: "IRON SOLDIER", author: "Babula" };
    const localMediaInfo = { ...info, sha256: hash, bytes: 612687009, durationSeconds: 40.25, videoCodec: "vp9" };
    const merged = mergeProductionCaseMedia({ ...catalog, items: [source] }, {
        ...manifest, entries: [{ id: caseId, localMedia, localMediaInfo }],
    }).items[0];
    expect(resolveProductionMedia(merged)).toEqual({ local: localMedia, remote: undefined });
    expect(merged.author).toBe(source.author);
    expect(merged.name).toBe(source.name);
    expect(merged.media).toBeUndefined();
    expect(resolveProductionMedia(source)).toEqual({ local: undefined, remote: undefined });
    for (const stale of [
        { localMedia: `/production-library/case-media/${caseId.slice(5)}.mp4`, localMediaInfo },
        { localMedia, localMediaInfo: { ...localMediaInfo, sha256: "de53de6f6787a31824a7f08da961c98636b59dd7911ded5b9c62397146101f44" } },
        { localMedia, localMediaInfo: { ...localMediaInfo, sha256: "f67c3e4d474cee246012c597e31652d6da5a12a1373e8d3dbcae1505a3e94e93" } },
        { localMedia: `/production-library/case-media/${caseId.slice(5)}-5c6535ec86d7d00fc2e11cd9d37e44bc63b0cdea926dec10ca8434ad4914a2dd.mp4`,
            localMediaInfo: { ...localMediaInfo, sha256: "5c6535ec86d7d00fc2e11cd9d37e44bc63b0cdea926dec10ca8434ad4914a2dd", bytes: 610608683 } },
        { localMedia, localMediaInfo: { ...localMediaInfo, bytes: localMediaInfo.bytes - 1 } },
    ]) expect(resolveProductionMedia({ ...source, ...stale })).toEqual({ local: undefined, remote: undefined });
});

test("rank 625 adopts its qualified outro-free HEVC copy and rejects original or stale sources", () => {
    const caseId = "case-dabd44bd7e5843e48ff3c9465c579390";
    const hash = "d707f0e9fe7132eed9c08a6f346c6b65da177f58b6862c0c347a5d213026c56f";
    const localMedia = `/production-library/case-media/${caseId.slice(5)}-${hash}.mp4`;
    const source = { ...item, id: caseId, author: "Zhang" };
    const localMediaInfo = { ...info, sha256: hash, bytes: 1087732218, durationSeconds: 31.466667, videoCodec: "hevc", audioCodec: "flac" };
    const merged = mergeProductionCaseMedia({ ...catalog, items: [source] }, {
        ...manifest, entries: [{ id: caseId, localMedia, localMediaInfo }],
    }).items[0];
    expect(resolveProductionMedia(merged)).toEqual({ local: localMedia, remote: undefined });
    expect(merged.author).toBe(source.author);
    expect(merged.media).toBeUndefined();
    expect(resolveProductionMedia(source)).toEqual({ local: undefined, remote: undefined });
    for (const stale of [
        { localMedia: `/production-library/case-media/${caseId.slice(5)}.mp4`, localMediaInfo },
        { localMedia, localMediaInfo: { ...localMediaInfo, sha256: "383c6080d7d766b6befc7ca3f4396f928c75236934a540109d8c053252398da4" } },
        { localMedia: `/production-library/case-media/${caseId.slice(5)}-8d10cbc5a03fd30b658e090e6bc48a3d1dfe3dc27934504b615b868949574dd1.mp4`,
            localMediaInfo: { ...localMediaInfo, sha256: "8d10cbc5a03fd30b658e090e6bc48a3d1dfe3dc27934504b615b868949574dd1", bytes: 1101290731, durationSeconds: 33.645714 } },
        { localMedia: `/production-library/case-media/${caseId.slice(5)}-aeec7e0caddea366b2e5944193dc1ecb574ca8c5c23aa21981a02bab04c0ab78.mp4`,
            localMediaInfo: { ...localMediaInfo, sha256: "aeec7e0caddea366b2e5944193dc1ecb574ca8c5c23aa21981a02bab04c0ab78", bytes: 1170550740 } },
        { localMedia, localMediaInfo: { ...localMediaInfo, bytes: localMediaInfo.bytes - 1 } },
    ]) expect(resolveProductionMedia({ ...source, ...stale })).toEqual({ local: undefined, remote: undefined });
});

test("rank 690 rejects its original corner mark instead of falling back to the source", () => {
    const caseId = "case-1f17dc351ef7439b82253ce709525f97";
    const source = { ...item, id: caseId };
    expect(resolveProductionMedia(source)).toEqual({ local: undefined, remote: undefined });
    expect(resolveProductionMedia({ ...source,
        localMedia: `/production-library/case-media/${caseId.slice(5)}.mp4`,
        localMediaInfo: { ...info, sha256: "c336242bd88512d169ac36fe8fa8a100e35441f9fa1863d4d5fa5d53998239b4", bytes: 336270453 },
    })).toEqual({ local: undefined, remote: undefined });
});

test("rank 690 holds the audio-first layout after incomplete native playback", () => {
    const caseId = "case-1f17dc351ef7439b82253ce709525f97";
    const hash = "195adfae1c644da6bdd9c64cdb49d6018c5b90ed4a70cf4e35c4ac85dc192449";
    const localMedia = `/production-library/case-media/${caseId.slice(5)}-${hash}.mp4`;
    const source = { ...item, id: caseId, author: "原作者" };
    const localMediaInfo = { ...info, sha256: hash, bytes: 13252718482, durationSeconds: 114.149002, videoCodec: "hevc" };
    const merged = mergeProductionCaseMedia({ ...catalog, items: [source] }, {
        ...manifest, entries: [{ id: caseId, localMedia, localMediaInfo }],
    }).items[0];
    expect(cleanedCaseMediaBinding(caseId)).toMatchObject({ path: localMedia, sha256: hash, bytes: localMediaInfo.bytes });
    expect(resolveProductionMedia(merged)).toEqual({ local: undefined, remote: undefined });
    expect(cleanedCaseMediaBinding(caseId)?.playbackHeld).toBe(true);
    expect(merged.author).toBe(source.author);
    expect(merged.media).toBeUndefined();
    for (const stale of [
        { localMedia: `/production-library/case-media/${caseId.slice(5)}-98af2c7ed6ac257ba7128476bc3c60a65c298348efbb51605c8476948cacabb6.mp4`,
            localMediaInfo: { ...localMediaInfo, sha256: "98af2c7ed6ac257ba7128476bc3c60a65c298348efbb51605c8476948cacabb6" } },
        { localMedia: `/production-library/case-media/${caseId.slice(5)}.mp4`, localMediaInfo },
        { localMedia, localMediaInfo: { ...localMediaInfo, sha256: "c336242bd88512d169ac36fe8fa8a100e35441f9fa1863d4d5fa5d53998239b4" } },
        { localMedia, localMediaInfo: { ...localMediaInfo, bytes: localMediaInfo.bytes - 1 } },
    ]) expect(resolveProductionMedia({ ...source, ...stale })).toEqual({ local: undefined, remote: undefined });
});

test("rank 430 admits the qualified opening and rolling word repair and rejects earlier films", () => {
    const caseId = "case-9a952f05e4d9421592512bf86ac32e97";
    const hash = "d4e93e048835c0fafafa709b5ab6d6af52b1df595e2200b38a785ef95f5c0aa2";
    const localMedia = `/production-library/case-media/${caseId.slice(5)}-${hash}.mp4`;
    const source = { ...item, id: caseId };
    const localMediaInfo = { ...info, sha256: hash, bytes: 827082203, durationSeconds: 486.933333, videoCodec: "hevc" };
    expect(resolveProductionMedia(source)).toEqual({ local: undefined, remote: undefined });
    const merged = mergeProductionCaseMedia({ ...catalog, items: [source] }, {
        ...manifest, entries: [{ id: caseId, localMedia, localMediaInfo }],
    }).items[0];
    expect(resolveProductionMedia(merged)).toEqual({ local: localMedia, remote: undefined });
    expect(merged.author).toBe(source.author);
    expect(merged.media).toBeUndefined();
    expect(isCaseWithdrawn(caseId)).toBe(false);
    for (const stale of [
        { localMedia: `/production-library/case-media/${caseId.slice(5)}.mp4`, localMediaInfo },
        { localMedia, localMediaInfo: { ...localMediaInfo, sha256: "269ea4bca1d1c31b52cf5a8bbc63f89d0a942169981bff0e9895ad6a3bf2192b" } },
        { localMedia, localMediaInfo: { ...localMediaInfo, bytes: localMediaInfo.bytes - 1 } },
        ...[
            { sha256: "5396a1268da0b44e200d8d2748c3fe6e0be6340aeeb4d24946786ff05ed2ab7c", bytes: 784190958 },
            { sha256: "499a325f221d0468663f27446d2965075b65d4b899682c26ce2e4300eadfd9c7", bytes: 811342822 },
        ].map(previous => ({
            localMedia: `/production-library/case-media/${caseId.slice(5)}-${previous.sha256}.mp4`,
            localMediaInfo: { ...localMediaInfo, ...previous },
        })),
    ]) expect(resolveProductionMedia({ ...source, ...stale })).toEqual({ local: undefined, remote: undefined });
});

test("rank 418 admits the verified opening repair and blocks both earlier branded versions", () => {
    const caseId = "case-cb25fe95bd1146d5a02b5b77508e8222";
    const hash = "d19870a2606e539169bd1f06cf37f8f90677c3672a58b7851e331a763c89f347";
    const localMedia = `/production-library/case-media/${caseId.slice(5)}-${hash}.mp4`;
    const source = { ...item, id: caseId, name: "云下村", author: "陈不沾MoreSoul" };
    const localMediaInfo = { ...info, sha256: hash, bytes: 1767492914, durationSeconds: 1151.733333 };
    expect(resolveProductionMedia(source)).toEqual({ local: undefined, remote: undefined });
    const merged = mergeProductionCaseMedia({ ...catalog, items: [source] }, {
        ...manifest, entries: [{ id: caseId, localMedia, localMediaInfo }],
    }).items[0];
    expect(resolveProductionMedia(merged)).toEqual({ local: localMedia, remote: undefined });
    expect(merged.name).toBe(source.name);
    expect(merged.author).toBe(source.author);
    expect(merged.media).toBeUndefined();
    expect(isCaseWithdrawn(caseId)).toBe(false);
    for (const stale of [
        { localMedia: `/production-library/case-media/${caseId.slice(5)}.mp4`, localMediaInfo },
        { localMedia, localMediaInfo: { ...localMediaInfo, sha256: "9d672e0c454860658afbad6de42c11c875be160a370586d3cea9540f611cc203" } },
        { localMedia, localMediaInfo: { ...localMediaInfo, bytes: localMediaInfo.bytes - 1 } },
        {
            localMedia: `/production-library/case-media/${caseId.slice(5)}-a7c6d91a26ad7e17dad91374a6d4f22fac891be7147bbf8ac805fffcc2cbf541.mp4`,
            localMediaInfo: { ...localMediaInfo, sha256: "a7c6d91a26ad7e17dad91374a6d4f22fac891be7147bbf8ac805fffcc2cbf541", bytes: 1768255392 },
        },
        {
            localMedia: `/production-library/case-media/${caseId.slice(5)}-9d672e0c454860658afbad6de42c11c875be160a370586d3cea9540f611cc203.mp4`,
            localMediaInfo: { ...localMediaInfo, sha256: "9d672e0c454860658afbad6de42c11c875be160a370586d3cea9540f611cc203" },
        },
    ]) expect(resolveProductionMedia({ ...source, ...stale })).toEqual({ local: undefined, remote: undefined });
});

test("rank 355 and 732 preserve credits and reject branded original-film fallbacks", () => {
    for (const [caseId, hash, bytes, durationSeconds, originalHash, author] of [
        ["case-83bd0ef9a6d14a318cc99cf8e2531d21", "de170d1979e7dd5a3bba817ca5345403c97525ce818e32010d9cf6e325dcd97b", 2715208875, 263.018667, "a2ff1aff9be6395e3d08d5ca7fb8826ca43790b5566e601255e5c8c33a31a42c", "青蝉AIGC"],
        ["case-796515a4554443c883acd374d7fef3be", "a000d3eb723990419eb886a90fb49ccf238da61095e1cdba5a83a3f1b5f4dcc0", 635559487, 82.196, "1c8719726396d4855dc77b776fb625596e53872749f2dd5b28f77e2b4d971951", "BoliSuna"],
    ] as const) {
        const localMedia = `/production-library/case-media/${caseId.slice(5)}-${hash}.mp4`;
        const source = { ...item, id: caseId, author };
        const localMediaInfo = { sha256: hash, bytes, durationSeconds };
        expect(resolveProductionMedia(source)).toEqual({ local: undefined, remote: undefined });
        const merged = mergeProductionCaseMedia({ ...catalog, items: [source] }, {
            ...manifest, entries: [{ id: caseId, localMedia, localMediaInfo }],
        }).items[0];
        expect(resolveProductionMedia(merged)).toEqual({ local: localMedia, remote: undefined });
        expect(merged.author).toBe(author);
        expect(merged.media).toBeUndefined();
        expect(isCaseWithdrawn(caseId)).toBe(false);
        for (const stale of [
            { localMedia: `/production-library/case-media/${caseId.slice(5)}.mp4`, localMediaInfo },
            { localMedia, localMediaInfo: { ...localMediaInfo, sha256: originalHash } },
            { localMedia, localMediaInfo: { ...localMediaInfo, bytes: bytes - 1 } },
        ]) expect(resolveProductionMedia({ ...source, ...stale })).toEqual({ local: undefined, remote: undefined });
    }
});

test("rank 352 keeps its complete work card and rejects the marked opening copy", () => {
    const caseId = "case-7f3f545aa73c40efb7fb2edd1079b341";
    const hash = "26ddf6e3875dd35fa97f3dfff46f46fceccf7d07a1854e6c3bd96ed037556426";
    const localMedia = `/production-library/case-media/${caseId.slice(5)}-${hash}.mp4`;
    const source = { ...item, id: caseId };
    const localMediaInfo = { sha256: hash, bytes: 161816452, durationSeconds: 124.319002 };
    expect(resolveProductionMedia(source)).toEqual({ local: undefined, remote: undefined });
    const merged = mergeProductionCaseMedia({ ...catalog, items: [source] }, {
        ...manifest, entries: [{ id: caseId, localMedia, localMediaInfo }],
    }).items[0];
    expect(resolveProductionMedia(merged)).toEqual({ local: localMedia, remote: undefined });
    expect(merged.author).toBe(source.author);
    expect(merged.media).toBeUndefined();
    expect(isCaseWithdrawn(caseId)).toBe(false);
    for (const stale of [
        { localMedia: `/production-library/case-media/${caseId.slice(5)}.mp4`, localMediaInfo },
        { localMedia, localMediaInfo: { ...localMediaInfo, sha256: "4cff78f8a934bf234a7e48e4dde5d943eefef90717b23de18de2c04d6cd14365" } },
        { localMedia, localMediaInfo: { ...localMediaInfo, bytes: 144980545 } },
        {
            localMedia: `/production-library/case-media/${caseId.slice(5)}-8b1b669f9ae8ea0e8ae2233dc79733b47731283a5e10080d1247216cf898d855.mp4`,
            localMediaInfo: { ...localMediaInfo, sha256: "8b1b669f9ae8ea0e8ae2233dc79733b47731283a5e10080d1247216cf898d855", bytes: 145402258 },
        },
    ]) expect(resolveProductionMedia({ ...source, ...stale })).toEqual({ local: undefined, remote: undefined });
});

test("rank 357 keeps MIKE X and the work text and rejects original-film fallback", () => {
    const caseId = "case-f984e7dfce07408db5a7fc5f97cbcca7";
    const hash = "e52d203d1e7e077a2360465abb21e048e96b3471e83929eca91c2a478a1a9b66";
    const localMedia = `/production-library/case-media/${caseId.slice(5)}-${hash}.mp4`;
    const source = { ...item, id: caseId, author: "MIKE X" };
    const localMediaInfo = { sha256: hash, bytes: 2817508170, durationSeconds: 81.82712 };
    expect(resolveProductionMedia(source)).toEqual({ local: undefined, remote: undefined });
    const merged = mergeProductionCaseMedia({ ...catalog, items: [source] }, {
        ...manifest, entries: [{ id: caseId, localMedia, localMediaInfo }],
    }).items[0];
    expect(resolveProductionMedia(merged)).toEqual({ local: localMedia, remote: undefined });
    expect(merged.author).toBe("MIKE X");
    expect(merged.media).toBeUndefined();
    expect(isCaseWithdrawn(caseId)).toBe(false);
    for (const stale of [
        { localMedia: `/production-library/case-media/${caseId.slice(5)}.mp4`, localMediaInfo },
        { localMedia, localMediaInfo: { ...localMediaInfo, sha256: "8e0b690bcd661b4be77c65b8875ea2ab231c5b291749a891060319bebda2b94e" } },
        { localMedia, localMediaInfo: { ...localMediaInfo, bytes: 281567587 } },
    ]) expect(resolveProductionMedia({ ...source, ...stale })).toEqual({ local: undefined, remote: undefined });
});

test("rank 243 keeps the complete verified content prefix and rejects the branded original", () => {
    const caseId = "case-09b6b2e3ed634f0e8cd73d1afe5c97bc";
    const hash = "add7b225d660efe60ddcd3f2d15f4876e2761125d75121e9ad530019a069be8b";
    const localMedia = `/production-library/case-media/${caseId.slice(5)}-${hash}.mp4`;
    const source = { ...item, id: caseId };
    const localMediaInfo = { sha256: hash, bytes: 708400780, durationSeconds: 86.935011 };
    expect(resolveProductionMedia(source)).toEqual({ local: undefined, remote: undefined });
    const merged = mergeProductionCaseMedia({ ...catalog, items: [source] }, {
        ...manifest, entries: [{ id: caseId, localMedia, localMediaInfo }],
    }).items[0];
    expect(resolveProductionMedia(merged)).toEqual({ local: localMedia, remote: undefined });
    expect(merged.author).toBe(source.author);
    expect(merged.media).toBeUndefined();
    expect(isCaseWithdrawn(caseId)).toBe(false);
    for (const stale of [
        { localMedia: `/production-library/case-media/${caseId.slice(5)}.mp4`, localMediaInfo },
        { localMedia, localMediaInfo: { ...localMediaInfo, sha256: "029eb23ed4e2d9faca3dfc81db25380f3cd9b4968750613ebba67821f1554b84" } },
        { localMedia, localMediaInfo: { ...localMediaInfo, bytes: 102828208 } },
    ]) expect(resolveProductionMedia({ ...source, ...stale })).toEqual({ local: undefined, remote: undefined });
});

test("rank 413 retains creator credit and rejects unverified original-film fallbacks", () => {
    const caseId = "case-3e0948e91da046c08b275c04d3e9c91f";
    const hash = "28013c6114f106f4ea1c3bf4b274c1b514b3bb235ad88ce8d59e85e17f41de26";
    const localMedia = `/production-library/case-media/${caseId.slice(5)}-${hash}.mp4`;
    const source = { ...item, id: caseId, author: "张嘉豪" };
    const localMediaInfo = { sha256: hash, bytes: 3819702152, durationSeconds: 281.100998 };
    expect(resolveProductionMedia(source)).toEqual({ local: undefined, remote: undefined });
    const merged = mergeProductionCaseMedia({ ...catalog, items: [source] }, {
        ...manifest, entries: [{ id: caseId, localMedia, localMediaInfo }],
    }).items[0];
    expect(resolveProductionMedia(merged)).toEqual({ local: localMedia, remote: undefined });
    expect(merged.author).toBe(source.author);
    expect(merged.media).toBeUndefined();
    expect(isCaseWithdrawn(caseId)).toBe(false);
    for (const stale of [
        { localMedia: `/production-library/case-media/${caseId.slice(5)}.mp4`, localMediaInfo },
        { localMedia, localMediaInfo: { ...localMediaInfo, sha256: "cb08218e85893a589a5ce25965741be66561a0cd8e42131eeca7e4ad797673a0" } },
        { localMedia, localMediaInfo: { ...localMediaInfo, bytes: 254770023 } },
    ]) expect(resolveProductionMedia({ ...source, ...stale })).toEqual({ local: undefined, remote: undefined });
});

test("rank 611 retains creator credit and accepts only the verified localized lossless copy", () => {
    const caseId = "case-92c2b31406f54a2aa46d69f7d22dead0";
    const hash = "80882a6cc9270689cdbf079a2226306119d8210497e012426dd7945432b41706";
    const localMedia = `/production-library/case-media/${caseId.slice(5)}-${hash}.mp4`;
    const source = { ...item, id: caseId, author: "张嘉豪" };
    const localMediaInfo = { sha256: hash, bytes: 989340756, durationSeconds: 177.701995 };
    expect(resolveProductionMedia(source)).toEqual({ local: undefined, remote: undefined });
    const merged = mergeProductionCaseMedia({ ...catalog, items: [source] }, {
        ...manifest, entries: [{ id: caseId, localMedia, localMediaInfo }],
    }).items[0];
    expect(resolveProductionMedia(merged)).toEqual({ local: localMedia, remote: undefined });
    expect(merged.author).toBe(source.author);
    expect(merged.media).toBeUndefined();
    expect(isCaseWithdrawn(caseId)).toBe(false);
    for (const stale of [
        { localMedia: `/production-library/case-media/${caseId.slice(5)}.mp4`, localMediaInfo },
        { localMedia, localMediaInfo: { ...localMediaInfo, sha256: "2dfcc6353b8131f116568d294c21b9824777e6309c7951b02ee2c0ba3a9a2faf" } },
        { localMedia, localMediaInfo: { ...localMediaInfo, bytes: 177000567 } },
    ]) expect(resolveProductionMedia({ ...source, ...stale })).toEqual({ local: undefined, remote: undefined });
});

test.each([
    ["case-48339006e0ff4e71b7310e25a252622b", "a898fe64c94d0aa3aeae72681de966b80269f224c9e540f63040be7f2774d3dc", 91034653, 51.516667, false],
    ["case-83f1356b44ed47ef8ef0ab91e2c966be", "320862078456cd139f485f3669ce0b4b330eb898a204a31f6bd86e9c03049251", 305256176, 173.833333, false],
    ["case-05823d8aa02046d1a9a89e2c59ff1a08", "f3dd2e3b3764e9e59a4fad837fd367bafdc1ea4730794ea81eba6c2d937bccdd", 102968350, 41.166667, false],
    ["case-dfbede815d2d441290e5f5f89252c018", "9c2837919a99e74d21b5a7a218757b3f7a38d3d9f02d25fb49c90113003e9dbb", 54827870, 63.033333, false],
    ["case-ec76b8b28c7f4e739a1d6fc800f6bb61", "3ad6c64266d4c924ba3dbdf55703e4f4eeccd5b100f36468367ad6a0b7603b13", 510136102, 167.067574, false],
    ["case-e6709a1f0ebf49f4bbb012444a90aa12", "e09854f3276dc6b3abdd4c1de1e01d8dca3dfbf2349df7a5cdb467b4ef460ca7", 72812627, 55.633333, false],
    ["case-0a06056b853447bbbd7ed14bd5035b02", "5255c42b460cb3f76f3c2aeab3f037527be5ccd11bb2b8b23ccae3ea5d2f611a", 1155209624, 1040.426667, false],
    ["case-e7d893aad24a47898584323824e5b6cc", "f417aadb2246af622de471a6b4b715549ec5b39eb1f9b609878b5fa5067b3f9f", 686126370, 254.792562, false],
    ["case-b462577e8a5c49c2a0ccc09bc5e16d16", "e3f938a3497061458afc18f5e3dd38bceb1cfdb127f02a315c74cfe4bd86e527", 2861971810, 299.932154, false],
] as const)("newly installed complete derivative %s loads without source fallback", (caseId, hash, bytes, duration, withdrawn) => {
    const source = { ...item, id: caseId, author: "Original author" };
    const localMedia = `/production-library/case-media/${caseId.slice(5)}-${hash}.mp4`;
    const localMediaInfo = { sha256: hash, bytes, durationSeconds: duration };
    const actual = mergeProductionCaseMedia({ ...catalog, items: [source] }, {
        version: 1, kind: "ltv-case-media", metadataCount: 1,
        entries: [{ id: caseId, localMedia, localMediaInfo }],
    }).items[0];
    expect(resolveProductionMedia(actual)).toEqual({ local: localMedia, remote: undefined });
    expect(actual.author).toBe(source.author);
    expect(isCaseWithdrawn(caseId)).toBe(withdrawn);
    expect(resolveProductionMedia(source)).toEqual({ local: undefined, remote: undefined });
    for (const stale of [
        { ...actual, localMedia: `/production-library/case-media/${caseId.slice(5)}.mp4` },
        { ...actual, localMediaInfo: { ...localMediaInfo, sha256: "0".repeat(64) } },
        { ...actual, localMediaInfo: { ...localMediaInfo, bytes: bytes - 1 } },
    ]) expect(resolveProductionMedia(stale)).toEqual({ local: undefined, remote: undefined });
});

test("cleaned media never falls back to the source, including stale cards", () => {
    expect(resolveProductionMedia(item)).toEqual({ local: undefined, remote: undefined });
    expect(resolveProductionMedia({ ...item, localMedia: path, localMediaInfo: info })).toEqual({ local: path, remote: undefined });
    for (const bad of [
        { localMedia: `/production-library/case-media/${id.slice(5)}.mp4`, localMediaInfo: info },
        { localMedia: path, localMediaInfo: { ...info, sha256: "a".repeat(64) } },
        { localMedia: path, localMediaInfo: { ...info, bytes: 1 } },
    ]) expect(resolveProductionMedia({ ...item, ...bad })).toEqual({ local: undefined, remote: undefined });
    expect(isCaseWithdrawn(id)).toBe(true);
});

test("the media manifest binds cleaned bytes and immutable path, without releasing the case", () => {
    const merged = mergeProductionCaseMedia(catalog, manifest);
    expect(merged.items[0].localMedia).toBe(path);
    expect(merged.items[0].media).toBeUndefined();
    expect(merged.items[0].mediaStatus).toBe("local");
    const absent = mergeProductionCaseMedia(catalog, { ...manifest, entries: [] }).items[0];
    expect(absent.media).toBeUndefined();
    expect(absent.localMedia).toBeUndefined();
    expect(absent.mediaStatus).toBe("unavailable");
    const mismatched = mergeProductionCaseMedia(catalog, { ...manifest, entries: [{ ...manifest.entries[0], localMediaInfo: { ...info, sha256: "b".repeat(64) } }] }).items[0];
    expect(resolveProductionMedia(mismatched)).toEqual({ local: undefined, remote: undefined });
    expect(mismatched.mediaStatus).toBe("unavailable");
});

test("a stale bound entry is isolated without discarding another case's cleaned local media", () => {
    const otherId = `case-${"a".repeat(32)}`;
    const otherPath = `/production-library/case-media/${otherId.slice(5)}.mp4`;
    const two = { ...catalog, items: [item, { ...item, id: otherId }] };
    const stale = { id, localMedia: `/production-library/case-media/${id.slice(5)}.mp4`, localMediaInfo: info };
    const mixed = { ...manifest, metadataCount: 2, entries: [stale, { id: otherId, localMedia: otherPath, localMediaInfo: info }] };
    const result = mergeProductionCaseMedia(two, mixed);
    expect(result.stats.localCases).toBe(1);
    expect(resolveProductionMedia(result.items.find(value => value.id === id)!)).toEqual({ local: undefined, remote: undefined });
    expect(result.items.find(value => value.id === otherId)?.localMedia).toBe(otherPath);
    expect(() => mergeProductionCaseMedia(two, { ...mixed, entries: [...mixed.entries, stale] })).toThrow();
    expect(() => mergeProductionCaseMedia(two, { ...mixed, entries: [{ ...stale, localMedia: "https://outside.invalid/old.mp4" }] })).toThrow();
});

test("rank 83 admits its current glyph film while rejecting the previous revision and source fallback", () => {
    const caseId = "case-2f8f8c74e16b4036b9d10950e765b4d7";
    const hash = "f4f2eceecba292c9ac0f7a99d43d94dc64b883e6edf756b9c1f615964144d852";
    const cleanedPath = `/production-library/case-media/${caseId.slice(5)}-${hash}.mp4`;
    const source = { ...item, id: caseId, name: "CHOICE™", author: "沈北辰" };
    const mediaInfo = { ...info, sha256: hash, bytes: 765023659, durationSeconds: 102.4 };
    const merged = mergeProductionCaseMedia({ ...catalog, items: [source] }, {
        ...manifest, entries: [{ id: caseId, localMedia: cleanedPath, localMediaInfo: mediaInfo }],
    }).items[0];
    expect(resolveProductionMedia(merged)).toEqual({ local: cleanedPath, remote: undefined });
    expect(merged.author).toBe(source.author);
    expect(merged.media).toBeUndefined();
    expect(isCaseWithdrawn(caseId)).toBe(false);
    expect(resolveProductionMedia(source)).toEqual({ local: undefined, remote: undefined });
    const priorHash = "1a87d66df8dadbe44330953a2d15338437a1fd219912fdd2d5008570fd39ee31";
    for (const stale of [
        { localMedia: `/production-library/case-media/${caseId.slice(5)}-${priorHash}.mp4`, localMediaInfo: { ...mediaInfo, sha256: priorHash, bytes: 764493529 } },
        { localMedia: cleanedPath, localMediaInfo: { ...mediaInfo, sha256: "a".repeat(64) } },
        { localMedia: cleanedPath, localMediaInfo: { ...mediaInfo, bytes: 1 } },
    ]) expect(resolveProductionMedia({ ...source, ...stale })).toEqual({ local: undefined, remote: undefined });
    expect(isCaseWithdrawn("case-0a06056b853447bbbd7ed14bd5035b02")).toBe(false);
    expect(isCaseWithdrawn("case-19a5252f8c8044a682b220a4c359ac19")).toBe(true);
});

test("rank 165 retains its verified 10-bit derivative after title readmission", () => {
    const caseId = "case-89d84659abc04965bb1872a1d966400d";
    const hash = "b69ab7577cf4944f2d5974f2f55860ed6422bd8ab4fddccffa4dad68d886255e";
    const cleanedPath = `/production-library/case-media/${caseId.slice(5)}-${hash}.mp4`;
    const source = { ...item, id: caseId, name: "霓虹 · 次元", author: "原作者" };
    const mediaInfo = { ...info, sha256: hash, bytes: 125183881, durationSeconds: 74.489002, videoCodec: "hevc" };
    expect(resolveProductionMedia(source)).toEqual({ local: undefined, remote: undefined });
    const merged = mergeProductionCaseMedia({ ...catalog, items: [source] }, {
        ...manifest, entries: [{ id: caseId, localMedia: cleanedPath, localMediaInfo: mediaInfo }],
    }).items[0];
    expect(resolveProductionMedia(merged)).toEqual({ local: cleanedPath, remote: undefined });
    expect(merged.author).toBe(source.author);
    expect(merged.media).toBeUndefined();
    expect(isCaseWithdrawn(caseId)).toBe(false);
    for (const stale of [
        { localMedia: `/production-library/case-media/${caseId.slice(5)}.mp4`, localMediaInfo: mediaInfo },
        { localMedia: cleanedPath, localMediaInfo: { ...mediaInfo, sha256: "a".repeat(64) } },
        { localMedia: cleanedPath, localMediaInfo: { ...mediaInfo, bytes: 1 } },
    ]) expect(resolveProductionMedia({ ...source, ...stale })).toEqual({ local: undefined, remote: undefined });
    expect(resolveProductionMedia({ ...source, id: caseId.slice(5) })).toEqual({ local: undefined, remote: undefined });
});

test("rank 183 admits its preserved slate derivative without reviving the branded original", () => {
    const caseId = "case-784f1408ab5b44a58996de6c0ee222d9";
    const hash = "aef578ae8f615b621531019d39510964930fa264bf13f3fa54e885a3ad3d6843";
    const localMedia = `/production-library/case-media/${caseId.slice(5)}-${hash}.mp4`;
    const source = { ...item, id: caseId, name: "东方志怪短片《换骨》", author: "Lane Lake" };
    const merged = mergeProductionCaseMedia({ ...catalog, items: [source] }, {
        ...manifest, entries: [{ id: caseId, localMedia, localMediaInfo: { ...info, sha256: hash, bytes: 252783187, durationSeconds: 211.115828 } }],
    }).items[0];
    expect(resolveProductionMedia(merged)).toEqual({ local: localMedia, remote: undefined });
    expect(merged.author).toBe(source.author);
    expect(isCaseWithdrawn(caseId)).toBe(false);
    expect(resolveProductionMedia(source)).toEqual({ local: undefined, remote: undefined });
    expect(resolveProductionMedia({ ...merged, localMediaInfo: { ...merged.localMediaInfo!, bytes: 1 } })).toEqual({ local: undefined, remote: undefined });
    expect(isCaseWithdrawn("case-19a5252f8c8044a682b220a4c359ac19")).toBe(true);
});

test("rank 11 admits its frame-preserved corner repair while retaining the author and source guard", () => {
    const caseId = "case-6bc8b8d159d04627a881c39bfa58a5fb";
    const hash = "602e68d6db7c4a4e98a547fcaebfa0bf21af7c279c5b9dd4ff2fd9edca3aa415";
    const localMedia = `/production-library/case-media/${caseId.slice(5)}-${hash}.mp4`;
    const source = { ...item, id: caseId, name: "《长安异闻录》第一卷 | 算命", author: "余晚舟" };
    const merged = mergeProductionCaseMedia({ ...catalog, items: [source] }, {
        ...manifest, entries: [{ id: caseId, localMedia, localMediaInfo: { ...info, sha256: hash, bytes: 1214904563, durationSeconds: 877.767 } }],
    }).items[0];
    expect(resolveProductionMedia(merged)).toEqual({ local: localMedia, remote: undefined });
    expect(merged.author).toBe(source.author);
    expect(isCaseWithdrawn(caseId)).toBe(false);
    expect(resolveProductionMedia(source)).toEqual({ local: undefined, remote: undefined });
    expect(resolveProductionMedia({ ...merged, localMediaInfo: { ...merged.localMediaInfo!, sha256: "a".repeat(64) } })).toEqual({ local: undefined, remote: undefined });
    expect(isCaseWithdrawn("case-19a5252f8c8044a682b220a4c359ac19")).toBe(true);
});

test("rank 40 admits the verified middle-film derivative and preserves source suppression", () => {
    const caseId = "case-124497eb790146cd9c4d878bee318605";
    const hash = "e1922745c40ea00f8dffd1d692e18883dc437f009388249baed125c66b41ad29";
    const cleanedPath = `/production-library/case-media/${caseId.slice(5)}-${hash}.mp4`;
    const source = { ...item, id: caseId, name: "第40例", author: "原作者" };
    const mediaInfo = { ...info, sha256: hash, bytes: 713258900, durationSeconds: 435.189002, videoCodec: "hevc" };
    expect(resolveProductionMedia(source)).toEqual({ local: undefined, remote: undefined });
    const merged = mergeProductionCaseMedia({ ...catalog, items: [source] }, {
        ...manifest, entries: [{ id: caseId, localMedia: cleanedPath, localMediaInfo: mediaInfo }],
    }).items[0];
    expect(resolveProductionMedia(merged)).toEqual({ local: cleanedPath, remote: undefined });
    expect(merged.author).toBe(source.author);
    expect(merged.media).toBeUndefined();
    expect(isCaseWithdrawn(caseId)).toBe(false);
    for (const stale of [
        { localMedia: `/production-library/case-media/${caseId.slice(5)}.mp4`, localMediaInfo: mediaInfo },
        { localMedia: cleanedPath, localMediaInfo: { ...mediaInfo, sha256: "a".repeat(64) } },
        { localMedia: cleanedPath, localMediaInfo: { ...mediaInfo, bytes: 1 } },
    ]) expect(resolveProductionMedia({ ...source, ...stale })).toEqual({ local: undefined, remote: undefined });
});

test("rank 538 accepts only its pixel-preserved independent LibTV endcard removal", () => {
    const caseId = "case-2c94101fec434bf89d534d2b2208afee";
    const hash = "9a2bbdb5f6e057ecc0aa1c9aaf0b0c8727c367a6b2bfd5b4cef79d84a33264c4";
    const cleanedPath = `/production-library/case-media/${caseId.slice(5)}-${hash}.mp4`;
    const source = { ...item, id: caseId, author: "原作者" };
    const mediaInfo = { ...info, sha256: hash, bytes: 43905506, durationSeconds: 60.366667 };
    expect(resolveProductionMedia(source)).toEqual({ local: undefined, remote: undefined });
    const merged = mergeProductionCaseMedia({ ...catalog, items: [source] }, {
        ...manifest, entries: [{ id: caseId, localMedia: cleanedPath, localMediaInfo: mediaInfo }],
    }).items[0];
    expect(resolveProductionMedia(merged)).toEqual({ local: cleanedPath, remote: undefined });
    expect(merged.author).toBe(source.author);
    expect(merged.media).toBeUndefined();
    for (const stale of [
        { localMedia: `/production-library/case-media/${caseId.slice(5)}.mp4`, localMediaInfo: mediaInfo },
        { localMedia: cleanedPath, localMediaInfo: { ...mediaInfo, sha256: "6709d4852de2e096f578f96614aae5ba8094d6b83a35cc6643222bc729a9b031" } },
        { localMedia: cleanedPath, localMediaInfo: { ...mediaInfo, bytes: 44397279 } },
    ]) expect(resolveProductionMedia({ ...source, ...stale })).toEqual({ local: undefined, remote: undefined });
});

test("unbound media retains its existing local and remote behavior", () => {
    expect(resolveProductionMedia({ ...item, id: "case-other" })).toEqual({ local: undefined, remote: item.media });
    expect(resolveProductionMedia({ ...item, id: "case-other", localMedia: "/local.mp4", localMediaInfo: info }))
        .toEqual({ local: `/local.mp4?sha256=${sha256}`, remote: item.media });
});

test("rank 45 uses the qualified lossless credit derivative without source fallback", () => {
    const caseId = "case-2ecf3c93255d473dab56a7aee73116a2";
    const hash = "ad15e270ac10e26a4f528cf4ff13f76f74776341df74ec758d7b2ae73754a885";
    const cleanedPath = `/production-library/case-media/${caseId.slice(5)}-${hash}.mp4`;
    const source = { ...item, id: caseId, name: "第45例", author: "原作者" };
    const mediaInfo = { ...info, sha256: hash, bytes: 2920900437 };
    expect(resolveProductionMedia(source)).toEqual({ local: undefined, remote: undefined });
    const merged = mergeProductionCaseMedia({ ...catalog, items: [source] }, {
        ...manifest, entries: [{ id: caseId, localMedia: cleanedPath, localMediaInfo: mediaInfo }],
    }).items[0];
    expect(resolveProductionMedia(merged)).toEqual({ local: cleanedPath, remote: undefined });
    expect(merged.author).toBe(source.author);
    expect(merged.media).toBeUndefined();
    for (const stale of [
        { localMedia: `/production-library/case-media/${caseId.slice(5)}.mp4`, localMediaInfo: mediaInfo },
        { localMedia: cleanedPath, localMediaInfo: { ...mediaInfo, sha256: "a".repeat(64) } },
        { localMedia: cleanedPath, localMediaInfo: { ...mediaInfo, bytes: 1 } },
    ]) expect(resolveProductionMedia({ ...source, ...stale })).toEqual({ local: undefined, remote: undefined });
});

test("rank 5 uses the verified LibTV-tail derivative and suppresses original fallback", () => {
    const caseId = "case-d3f34a5ebd584bbcb79b1e1ab146b28a";
    const hash = "b31a8f48bd1c3b1764a44b68e7b31e5816a1d3487dc807dee6222b6e55f84309";
    const cleanedPath = `/production-library/case-media/${caseId.slice(5)}-${hash}.mp4`;
    const source = { ...item, id: caseId, name: "第5例", author: "原作者" };
    const mediaInfo = { ...info, sha256: hash, bytes: 239262389, durationSeconds: 61.045011 };
    expect(resolveProductionMedia(source)).toEqual({ local: undefined, remote: undefined });
    const merged = mergeProductionCaseMedia({ ...catalog, items: [source] }, {
        ...manifest, entries: [{ id: caseId, localMedia: cleanedPath, localMediaInfo: mediaInfo }],
    }).items[0];
    expect(resolveProductionMedia(merged)).toEqual({ local: cleanedPath, remote: undefined });
    expect(merged.author).toBe(source.author);
    expect(merged.media).toBeUndefined();
    expect(resolveProductionMedia({ ...source, localMedia: `/production-library/case-media/${caseId.slice(5)}.mp4`, localMediaInfo: mediaInfo }))
        .toEqual({ local: undefined, remote: undefined });
    expect(resolveProductionMedia({ ...source, localMedia: cleanedPath, localMediaInfo: { ...mediaInfo, sha256: "a".repeat(64) } }))
        .toEqual({ local: undefined, remote: undefined });
});

test("rank 712 keeps the verified platform-credit derivative and author without source fallback", () => {
    const caseId = "case-c22e773d62514490b2c8005490a83bbc";
    const hash = "f025cb584a8032fda0f9db28f820a393727a96ca05c6d69a43212945915270c5";
    const cleanedPath = `/production-library/case-media/${caseId.slice(5)}-${hash}.mp4`;
    const source = { ...item, id: caseId, name: "醉入景阳冈", author: "朱大大大超人" };
    const mediaInfo = { ...info, sha256: hash, bytes: 1932022958, durationSeconds: 238.8 };
    expect(resolveProductionMedia(source)).toEqual({ local: undefined, remote: undefined });
    const merged = mergeProductionCaseMedia({ ...catalog, items: [source] }, {
        ...manifest, entries: [{ id: caseId, localMedia: cleanedPath, localMediaInfo: mediaInfo }],
    }).items[0];
    expect(resolveProductionMedia(merged)).toEqual({ local: cleanedPath, remote: undefined });
    expect(merged.author).toBe(source.author);
    expect(merged.media).toBeUndefined();
    expect(resolveProductionMedia({ ...source, localMedia: `/production-library/case-media/${caseId.slice(5)}.mp4`, localMediaInfo: mediaInfo }))
        .toEqual({ local: undefined, remote: undefined });
    expect(resolveProductionMedia({ ...source, localMedia: cleanedPath, localMediaInfo: { ...mediaInfo, bytes: mediaInfo.bytes - 1 } }))
        .toEqual({ local: undefined, remote: undefined });
});

test("a cleaned cover never returns an old local or remote author watermark", () => {
    const skeleton = { ...item, id: "case-27337682288f48ad9d7dec698e45ca17", cover: "https://source.invalid/old.webp", localCover: "/old.webp" };
    const binding = cleanedCaseMediaBinding(skeleton.id)!;
    expect(binding.coverPath).toBe("/production-library/covers/cases/27337682288f48ad9d7dec698e45ca17-c7efb1d707c1a6a41ab58719423a3c37653b2419feb22a1c8d277da0a8ef1470.webp");
    expect(resolveProductionCover(skeleton)).toEqual({ local: binding.coverPath, remote: undefined });
    expect(resolveProductionMedia(skeleton)).toEqual({ local: undefined, remote: undefined });
    expect(resolveProductionCover({ ...skeleton, id: "case-other" })).toEqual({ local: "/old.webp", remote: skeleton.cover });
    expect(cleanedCaseMediaBinding(skeleton.id.slice(5))).toEqual(binding);
});

test("the packaged immutable cover matches its declared content hash", async () => {
    const binding = cleanedCaseMediaBinding("case-27337682288f48ad9d7dec698e45ca17")!;
    const bytes = await Bun.file(new URL(`../public${binding.coverPath}`, import.meta.url)).arrayBuffer();
    expect(createHash("sha256").update(new Uint8Array(bytes)).digest("hex")).toBe(binding.coverSha256!);
});
