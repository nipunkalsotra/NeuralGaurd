// src/sim/serviceHealth.ts
// The root-cause control behind /fallbacks' "kill a service" buttons.
// Real backend calls fail for real reasons (an unreachable API, an
// expired key, a timeout) that no browser tab can reproduce on demand —
// this is the honest browser-side equivalent: a manual up/down switch
// the agents' fallback ladders check before "calling" a tier. Killing
// NIM doesn't fake a diagnosis; it makes SentinelAgent's embed() take
// the exact same code path the real one takes on a real NIM outage,
// which is what drives the circuit breaker open for real.
import type { ServiceName } from "./types";

type Listener = () => void;

export class ServiceHealthRegistry {
  private down = new Set<ServiceName>();
  private listeners = new Set<Listener>();

  isUp(service: ServiceName): boolean {
    return !this.down.has(service);
  }

  kill(service: ServiceName): void {
    this.down.add(service);
    this.notify();
  }

  revive(service: ServiceName): void {
    this.down.delete(service);
    this.notify();
  }

  toggle(service: ServiceName): void {
    if (this.down.has(service)) this.revive(service);
    else this.kill(service);
  }

  reviveAll(): void {
    this.down.clear();
    this.notify();
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify(): void {
    this.listeners.forEach((l) => l());
  }
}
