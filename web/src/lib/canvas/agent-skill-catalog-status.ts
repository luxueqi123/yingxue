/** Catalog reads are live UI status, not durable conversation errors. */
export function isAgentSkillCatalogNotice(message: { id: string; role: string }) {
    return message.role === "error" && (message.id === "created-skills-error" || message.id === "skills-load-error");
}
