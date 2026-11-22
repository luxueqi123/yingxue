export function isGuestWorkspacePath(pathname: string) {
    return pathname === "/" || pathname === "/home" || pathname === "/create";
}
