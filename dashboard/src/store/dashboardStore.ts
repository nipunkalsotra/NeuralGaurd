import { create } from 'zustand';

interface Worker {
  id: string;
  state: string;
  similarity: number;
}

interface AuditRecord {
  timestamp: string;
  worker_id: string;
  from_state: string;
  to_state: string;
  [key: string]: unknown;
}

interface DashboardState {
  workers: Worker[];
  auditLog: AuditRecord[];
  circuitBreakers: Record<string, string>;
  throughput: number;
  currentView: string;
  setWorkers: (workers: Worker[]) => void;
  addAuditRecord: (record: AuditRecord) => void;
  setCircuitBreakerStatus: (service: string, status: string) => void;
  setThroughput: (value: number) => void;
  setCurrentView: (view: string) => void;
}

export const useDashboardStore = create<DashboardState>((set) => ({
  workers: [],
  auditLog: [],
  circuitBreakers: {},
  throughput: 100,
  currentView: 'overview',

  setWorkers: (workers) => set({ workers }),
  addAuditRecord: (record) =>
    set((state) => ({ auditLog: [...state.auditLog, record] })),
  setCircuitBreakerStatus: (service, status) =>
    set((state) => ({
      circuitBreakers: { ...state.circuitBreakers, [service]: status },
    })),
  setThroughput: (value) => set({ throughput: value }),
  setCurrentView: (view) => set({ currentView: view }),
}));
