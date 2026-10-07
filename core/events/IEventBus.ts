/**
 * @file core/events/IEventBus.ts
 * Type-safe, compile-time verified Event Bus contract.
 * ZERO browser/DOM imports.
 */

import { CoreEventMap } from './CoreEventMap.js';

export type EventCallback<T = any> = (payload: T) => void;
export type UnsubscribeFn = () => void;
export type ErrorHandler = (error: unknown, event: string, payload: unknown) => void;

export interface IEventBus<TMap extends Record<string, any> = CoreEventMap> {
  on<K extends keyof TMap>(event: K, handler: EventCallback<TMap[K]>): UnsubscribeFn;
  once<K extends keyof TMap>(event: K, handler: EventCallback<TMap[K]>): UnsubscribeFn;
  off<K extends keyof TMap>(event: K, handler: EventCallback<TMap[K]>): void;
  emit<K extends keyof TMap>(event: K, payload: TMap[K]): void;
  publish?<K extends keyof TMap>(event: K, payload: TMap[K]): void;
  subscribe?<K extends keyof TMap>(event: K, handler: EventCallback<TMap[K]>): UnsubscribeFn;
  hasListeners<K extends keyof TMap>(event: K): boolean;
  listenerCount<K extends keyof TMap>(event: K): number;
  clear<K extends keyof TMap>(event?: K): void;
}
