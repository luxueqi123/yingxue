import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { WorkspaceErrorState, WorkspaceLoadingState } from "../src/components/layout/workspace-state";

test("page reads keep the loading name accessible without showing recovery copy", () => {
    const html = renderToStaticMarkup(<WorkspaceLoadingState label="Reading saved canvases" detail="Restoring account data" rows={2} />);
    expect(html).toContain('aria-busy="true"');
    expect(html).toContain('aria-label="Reading saved canvases"');
    expect(html).not.toContain(">Reading saved canvases<");
    expect(html).not.toContain("Restoring account data");
});

test("explicit progress views can still show a real loading label", () => {
    const html = renderToStaticMarkup(<WorkspaceLoadingState quiet={false} label="Reading saved canvases" detail="Restoring account data" />);
    expect(html).toContain(">Reading saved canvases<");
    expect(html).toContain("Restoring account data");
});

test("a failed read still shows its error and retry action", () => {
    const html = renderToStaticMarkup(<WorkspaceErrorState title="Read failed" description="Connection timed out" actionLabel="Retry" onRetry={() => {}} />);
    expect(html).toContain('role="alert"');
    expect(html).toContain("Read failed");
    expect(html).toContain("Connection timed out");
    expect(html).toContain(">Retry<");
});
