import { afterEach, beforeEach, spyOn } from "bun:test";
import { http } from "../../src/services/api/request";

// Mock only the signed-resource HTTP boundary, not task parsing or result application.
export function useResourceAccessFixture() {
    let restore: (() => void) | undefined;
    beforeEach(() => {
        const request = spyOn(http, "post").mockImplementation(async (url: string, input: unknown) => {
            if (url !== "/resources/access" || !Array.isArray(input)) throw new Error(`Unexpected fixture request: ${url}`);
            return { items: input.map(({ resourceId }: { resourceId: string }) => ({
                resourceId, access: { url: `/api/resources/${encodeURIComponent(resourceId)}/file` },
            })) };
        });
        restore = () => request.mockRestore();
    });
    afterEach(() => restore?.());
}
