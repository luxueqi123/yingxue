import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import vm from "node:vm";

const source = (path) => readFileSync(new URL(path, import.meta.url), "utf8");

test("legacy welcome redirect preserves the configured SEO title", () => {
    const page = source("../src/pages/welcome/index.tsx")
        .replace(/^import .*;\r?\n/gm, "")
        .replace("export default function", "function");
    for (const title of ["Custom SEO Title", "Custom Site Name"]) {
        const document = { title };
        const destinations = [];
        vm.runInNewContext(`${page}\nWelcomePage();`, {
            document,
            useEffect: (effect) => effect(),
            window: { location: { replace: (destination) => destinations.push(destination) } },
        });
        assert.deepEqual(destinations, ["/home"]);
        assert.equal(document.title, title);
    }
});
