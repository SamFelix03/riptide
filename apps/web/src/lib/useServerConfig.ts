"use client";

import { useQuery } from "@tanstack/react-query";
import type { PublicDeploymentConfig } from "@riptide/contracts/networks";

export function useServerConfig() {
  return useQuery({
    queryKey: ["server-config"],
    queryFn: async () => {
      const res = await fetch("/api/config");
      if (!res.ok) throw new Error("config fetch failed");
      return res.json() as Promise<PublicDeploymentConfig>;
    },
  });
}
