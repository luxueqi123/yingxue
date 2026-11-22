import type { ComponentType } from "react";

type WorkspaceNavIconProps = {
    id: string;
    icon: ComponentType<{ className?: string; strokeWidth?: number }>;
};

const filledPaths: Record<string, string> = {
    home: "M10.1 2.8a3 3 0 0 1 3.8 0l6 4.9a3 3 0 0 1 1.1 2.3v8a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3v-8a3 3 0 0 1 1.1-2.3ZM8 16.5a.75.75 0 0 0 0 1.5h8a.75.75 0 0 0 0-1.5Z",
    projects: "M5 3h14a3 3 0 0 1 3 3v12a3 3 0 0 1-3 3H5a3 3 0 0 1-3-3V6a3 3 0 0 1 3-3Zm.4 2L3.9 8H7l1.5-3Zm6 0L9.9 8H13l1.5-3Zm6 0L15.9 8H19l1.5-3ZM4 10v1.5h16V10Z",
    canvas: "M5 3h14a3 3 0 0 1 3 3v12a3 3 0 0 1-3 3H5a3 3 0 0 1-3-3V6a3 3 0 0 1 3-3ZM4 7v1.5h16V7Zm4 3v9h1.5v-9Z",
    "toolbox-image": "M5 3h14a3 3 0 0 1 3 3v12a3 3 0 0 1-3 3H5a3 3 0 0 1-3-3V6a3 3 0 0 1 3-3Zm2.5 3a2 2 0 1 0 0 4 2 2 0 0 0 0-4ZM4 18.5h16l-5-6-4 4-3-3Z",
    "toolbox-video": "M4 5h10a3 3 0 0 1 3 3v8a3 3 0 0 1-3 3H4a3 3 0 0 1-3-3V8a3 3 0 0 1 3-3Zm14 4 4-3v12l-4-3Z",
    skills: "M3 3h4v18H3Zm6 0h4v18H9Zm6 1 3-1 5 17-3 1Zm-11 2v1.5h2V6Zm6 0v1.5h2V6Zm7.1.5.4 1.4 1.5-.4-.4-1.4Z",
    assets: "M5 3h6l3 3h5a3 3 0 0 1 3 3v9a3 3 0 0 1-3 3H5a3 3 0 0 1-3-3V6a3 3 0 0 1 3-3Zm-1 7h16V8.5H4Z",
    tasks: "M12 2a10 10 0 1 1 0 20 10 10 0 0 1 0-20Zm-.75 4v6.4l4.4 2.6.8-1.3-3.7-2.2V6Z",
};

export function WorkspaceNavIcon({ id, icon: Icon }: WorkspaceNavIconProps) {
    const filledPath = filledPaths[id];
    return (
        <span className="app-workspace-nav-icon" data-filled={Boolean(filledPath)} aria-hidden>
            <Icon className="app-workspace-nav-icon-outline" strokeWidth={1.6} />
            {filledPath ? (
                <svg className="app-workspace-nav-icon-filled" viewBox="0 0 24 24" fill="currentColor">
                    <path d={filledPath} fillRule="evenodd" clipRule="evenodd" />
                </svg>
            ) : null}
        </span>
    );
}
