// src/sim/eventBus.ts
// Direct port of backend/sentinel/event_bus/asyncio_queue_bus.py.
// Concurrent dispatch via Promise.all (mirrors asyncio.gather) — when
// LOOP_SUSPECTED fires, the Orchestrator and OptimizationAgent handlers
// genuinely run concurrently, not one after another.
type Handler<T = unknown> = (event: T) => Promise<void>;

export class EventBus {
  private subscribers = new Map<string, Handler[]>();

  subscribe<T>(topic: string, handler: Handler<T>): void {
    const list = this.subscribers.get(topic) ?? [];
    list.push(handler as Handler);
    this.subscribers.set(topic, list);
  }

  async publish<T>(topic: string, event: T): Promise<void> {
    const handlers = this.subscribers.get(topic) ?? [];
    await Promise.all(handlers.map((h) => h(event)));
  }
}
