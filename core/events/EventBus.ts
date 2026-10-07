/**
 * @file core/events/EventBus.ts
 * Headless, high-performance publish-subscribe EventBus with listener exception isolation.
 * ZERO browser/DOM imports.
 */

import { CoreEventMap } from './CoreEventMap.js';
import { IEventBus, EventCallback, UnsubscribeFn, ErrorHandler } from './IEventBus.js';

export class EventBus<TMap extends Record<string, any> = CoreEventMap> implements IEventBus<TMap> {
  private listeners: Map<keyof TMap, Set<EventCallback<any>>> = new Map();
  private errorHandler: ErrorHandler;

  constructor(errorHandler?: ErrorHandler) {
    this.errorHandler = errorHandler ?? ((err, evt) => {
      if (typeof console !== 'undefined' && typeof console.warn === 'function') {
        console.warn(`[EventBus] Uncaught exception in listener for event '${String(evt)}':`, err);
      }
    });
  }

  on<K extends keyof TMap>(event: K, handler: EventCallback<TMap[K]>): UnsubscribeFn {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    const set = this.listeners.get(event)!;
    set.add(handler as EventCallback<any>);

    return () => {
      this.off(event, handler);
    };
  }

  once<K extends keyof TMap>(event: K, handler: EventCallback<TMap[K]>): UnsubscribeFn {
    const onceWrapper: EventCallback<TMap[K]> = (payload: TMap[K]) => {
      this.off(event, onceWrapper);
      handler(payload);
    };
    return this.on(event, onceWrapper);
  }

  off<K extends keyof TMap>(event: K, handler: EventCallback<TMap[K]>): void {
    const set = this.listeners.get(event);
    if (!set) return;
    set.delete(handler as EventCallback<any>);
    if (set.size === 0) {
      this.listeners.delete(event);
    }
  }

  emit<K extends keyof TMap>(event: K, payload: TMap[K]): void {
    const set = this.listeners.get(event);
    if (!set || set.size === 0) return;

    // Snapshot callbacks to prevent concurrent modification if a handler unregisters itself
    const callbacks = Array.from(set);
    for (let i = 0; i < callbacks.length; i++) {
      try {
        callbacks[i](payload);
      } catch (err) {
        this.errorHandler(err, String(event), payload);
      }
    }
  }

  publish<K extends keyof TMap>(event: K, payload: TMap[K]): void {
    this.emit(event, payload);
  }

  subscribe<K extends keyof TMap>(event: K, handler: EventCallback<TMap[K]>): UnsubscribeFn {
    return this.on(event, handler);
  }

  hasListeners<K extends keyof TMap>(event: K): boolean {
    const set = this.listeners.get(event);
    return set !== undefined && set.size > 0;
  }

  listenerCount<K extends keyof TMap>(event: K): number {
    const set = this.listeners.get(event);
    return set ? set.size : 0;
  }

  clear<K extends keyof TMap>(event?: K): void {
    if (event !== undefined) {
      this.listeners.delete(event);
    } else {
      this.listeners.clear();
    }
  }
}
