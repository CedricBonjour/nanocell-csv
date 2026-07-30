import { describe, test, expect, beforeEach, vi } from 'vitest';
import { StateManager } from '../app/js/StateManager.js';

describe('StateManager Pub/Sub & Application Event Bus', () => {
  beforeEach(() => {
    StateManager.clear();
  });

  // Tier 1: Feature Coverage
  test('on registers listener and emit triggers listener with payload', () => {
    const callback = vi.fn();
    StateManager.on('cell:edited', callback);
    StateManager.emit('cell:edited', { x: 0, y: 0, value: 'Hello' });

    expect(callback).toHaveBeenCalledTimes(1);
    expect(callback).toHaveBeenCalledWith({ x: 0, y: 0, value: 'Hello' });
  });

  test('off unregisters listener from event topic', () => {
    const callback = vi.fn();
    StateManager.on('theme:changed', callback);
    StateManager.off('theme:changed', callback);
    StateManager.emit('theme:changed', { theme: 'night' });

    expect(callback).not.toHaveBeenCalled();
  });

  test('unsubscribe function returned by on removes listener', () => {
    const callback = vi.fn();
    const unsubscribe = StateManager.on('sheet:updated', callback);
    unsubscribe();
    StateManager.emit('sheet:updated', { width: 10 });

    expect(callback).not.toHaveBeenCalled();
  });

  test('setState stores value and getState retrieves value', () => {
    StateManager.setState('currentFile', 'sample.csv');
    expect(StateManager.getState('currentFile')).toBe('sample.csv');
  });

  test('setState emits state change event with key, value, and oldValue', () => {
    const callback = vi.fn();
    StateManager.on('state:activeCell', callback);
    StateManager.setState('activeCell', { x: 1, y: 2 });
    StateManager.setState('activeCell', { x: 3, y: 4 });

    expect(callback).toHaveBeenCalledTimes(2);
    expect(callback).toHaveBeenLastCalledWith({
      key: 'activeCell',
      value: { x: 3, y: 4 },
      oldValue: { x: 1, y: 2 }
    });
  });

  // Tier 2: Boundary & Corner Cases
  test('multiple listeners registered on same topic all execute', () => {
    const cb1 = vi.fn();
    const cb2 = vi.fn();
    StateManager.on('dataframe:changed', cb1);
    StateManager.on('dataframe:changed', cb2);
    StateManager.emit('dataframe:changed', { action: 'insertRow' });

    expect(cb1).toHaveBeenCalledTimes(1);
    expect(cb2).toHaveBeenCalledTimes(1);
  });

  test('emitting unregistered topic does not throw', () => {
    expect(() => {
      StateManager.emit('unknown:event', { foo: 'bar' });
    }).not.toThrow();
  });

  test('off on non-existent topic or callback does not throw', () => {
    expect(() => {
      StateManager.off('nonexistent', () => {});
    }).not.toThrow();
  });

  test('getState for uninitialized key returns undefined', () => {
    expect(StateManager.getState('nonexistent_key')).toBeUndefined();
  });

  test('instance methods on StateManager work independently', () => {
    const instance = new StateManager();
    const cb = vi.fn();
    instance.on('custom', cb);
    instance.emit('custom', 42);

    expect(cb).toHaveBeenCalledWith(42);
    expect(StateManager.getState('custom')).toBeUndefined();
  });

  // Tier 3: Cross-Feature Combinations
  test('decouples core application lifecycle events', () => {
    const eventsLogged = [];
    const coreEvents = [
      'sheet:updated',
      'dataframe:changed',
      'cell:edited',
      'selection:changed',
      'theme:changed',
      'file:loaded'
    ];

    coreEvents.forEach((evt) => {
      StateManager.on(evt, (data) => {
        eventsLogged.push({ evt, data });
      });
    });

    StateManager.emit('file:loaded', { filename: 'test.csv' });
    StateManager.emit('cell:edited', { x: 0, y: 0, val: 'New' });
    StateManager.emit('theme:changed', { theme: 'dark' });

    expect(eventsLogged).toHaveLength(3);
    expect(eventsLogged[0].evt).toBe('file:loaded');
    expect(eventsLogged[1].evt).toBe('cell:edited');
    expect(eventsLogged[2].evt).toBe('theme:changed');
  });
});
