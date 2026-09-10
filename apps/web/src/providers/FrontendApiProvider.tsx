"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";

import { ApiClient } from "@/lib/api-client";

const FrontendApiContext = createContext<ApiClient | null>(null);

export function FrontendApiProvider({ children }: { children: ReactNode }) {
  const api = useMemo(() => new ApiClient(), []);
  return <FrontendApiContext.Provider value={api}>{children}</FrontendApiContext.Provider>;
}

export function useFrontendApi() {
  const api = useContext(FrontendApiContext);
  if (!api) throw new Error("useFrontendApi must be used within FrontendApiProvider");
  return api;
}
