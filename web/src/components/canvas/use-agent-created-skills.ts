import { useQuery } from "@tanstack/react-query";
import { listSkills } from "@/services/api/skills";

export function useAgentCreatedSkills(userId: string | undefined, open: boolean) {
    return useQuery({
        queryKey: ["agent-created-skills", userId],
        queryFn: () => listSkills({ scope: "created", pageSize: 50 }),
        enabled: Boolean(userId) && open,
        staleTime: 30_000,
        retry: false,
        refetchOnWindowFocus: true,
        refetchOnReconnect: true,
    });
}
