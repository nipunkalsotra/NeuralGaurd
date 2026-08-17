// src/app/dataSourceContext.ts
// Split out of SourceProvider.tsx purely so that file can export only the
// SourceProvider component (react-refresh/HMR requires component-only
// files to fast-refresh cleanly — mixing a hook export in breaks it).
import { createContext, useContext } from "react";
import type { DataSource } from "../data/types";

export interface SourceContextValue {
  source: DataSource;
  kind: "live" | "simulated" | "connecting";
}

export const SourceContext = createContext<SourceContextValue | null>(null);

export function useDataSource(): SourceContextValue {
  const ctx = useContext(SourceContext);
  if (!ctx) throw new Error("useDataSource must be used within SourceProvider");
  return ctx;
}
