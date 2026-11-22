export function isIsolatedDevRepro(dev: boolean, pathname: string): boolean {
    return dev && (pathname === "/dev/previs-repro" || pathname === "/dev/membership");
}
