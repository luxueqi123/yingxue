import type { PrevisObject } from "../../../types/previs";

export function isPrevisActor(object: Pick<PrevisObject, "kind" | "primitive" | "role">): boolean {
    return object.role === "actor" || object.kind === "actor" || object.primitive === "character";
}
