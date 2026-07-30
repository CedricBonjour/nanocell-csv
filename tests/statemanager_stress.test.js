import { describe, test, expect, beforeEach, vi } from 'vitest';
import { StateManager } from '../app/js/StateManager.js';

describe('StateManager Empirical Stress & Robustness Suite', () => {
  beforeEach(() => {
    StateManager.clear();
  });

  test('High-frequency state mutations: 100,000 rapid setState calls', () => {
    let callCount = 0;
    let lastValue = null;

    StateManager.on('state:counter', ({ value }) => {
      callCount++;
      lastValue = value;
    });

    const startTime = Date.now();
    const ITERATIONS = 100000;
    for (let i = 0; i < ITERATIONS; i++) {
      StateManager.setState('counter', i);
    }
    const duration = Date.now() - startTime;

    expect(callCount).toBe(ITERATIONS);
    expect(lastValue).toBe(ITERATIONS - 1);
    expect(StateManager.getState('counter')).toBe(ITERATIONS - 1);
    // Performance assertion: 100k state mutations should execute in reasonable time (< 1000ms)
    expect(duration).toBeLessThan(1000);
  });

  test('Multi-subscriber scaling: 1,000 subscribers receive 1,000 event dispatches (1,000,000 callback executions)', () => {
    const SUBSCRIBERS = 1000;
    const DISPATCHES = 1000;
    let totalExecutions = 0;

    const unsubscribers = [];
    for (let i = 0; i < SUBSCRIBERS; i++) {
      const unsub = StateManager.on('stress:multi', () => {
        totalExecutions++;
      });
      unsubscribers.push(unsub);
    }

    for (let d = 0; d < DISPATCHES; d++) {
      StateManager.emit('stress:multi', { seq: d });
    }

    expect(totalExecutions).toBe(SUBSCRIBERS * DISPATCHES);

    // Unsubscribe all
    unsubscribers.forEach(unsub => unsub());
    StateManager.emit('stress:multi', { seq: -1 });
    expect(totalExecutions).toBe(SUBSCRIBERS * DISPATCHES); // No further calls
  });

  test('Re-entrant unregistration: Listener unregisters itself during emit', () => {
    let countA = 0;
    let countB = 0;

    let unsubA;
    unsubA = StateManager.on('evt:self_unsub', () => {
      countA++;
      unsubA();
    });

    StateManager.on('evt:self_unsub', () => {
      countB++;
    });

    StateManager.emit('evt:self_unsub', 1);
    StateManager.emit('evt:self_unsub', 2);
    StateManager.emit('evt:self_unsub', 3);

    expect(countA).toBe(1); // Executed only on first emit
    expect(countB).toBe(3); // Executed on all 3 emits
  });

  test('Re-entrant unregistration: Subscriber A unregisters Subscriber B during emit snapshot execution', () => {
    let callOrder = [];
    let unsubB;

    StateManager.on('evt:cross_unsub', () => {
      callOrder.push('A');
      if (unsubB) unsubB();
    });

    unsubB = StateManager.on('evt:cross_unsub', () => {
      callOrder.push('B');
    });

    StateManager.on('evt:cross_unsub', () => {
      callOrder.push('C');
    });

    // First emit: B is in the Array.from snapshot so B executes during this emit
    StateManager.emit('evt:cross_unsub', 1);
    expect(callOrder).toEqual(['A', 'B', 'C']);

    // Second emit: B has been removed from listeners map, so B will NOT execute
    callOrder = [];
    StateManager.emit('evt:cross_unsub', 2);
    expect(callOrder).toEqual(['A', 'C']);
  });

  test('Re-entrant registration: Subscriber A registers Subscriber D during emit snapshot execution', () => {
    let callOrder = [];

    StateManager.on('evt:dynamic_reg', () => {
      callOrder.push('A');
      StateManager.on('evt:dynamic_reg', () => {
        callOrder.push('D');
      });
    });

    // First emit: D was registered during A's execution, not in original snapshot
    StateManager.emit('evt:dynamic_reg', 1);
    expect(callOrder).toEqual(['A']);

    // Second emit: D is now registered and will execute
    callOrder = [];
    StateManager.emit('evt:dynamic_reg', 2);
    expect(callOrder).toEqual(['A', 'D']);
  });

  test('Duplicate callback registration: Same function reference registered multiple times', () => {
    const callback = vi.fn();
    StateManager.on('evt:dup', callback);
    StateManager.on('evt:dup', callback);
    StateManager.on('evt:dup', callback);

    StateManager.emit('evt:dup', 'test');
    // Set deduplication guarantees single execution per emit
    expect(callback).toHaveBeenCalledTimes(1);
  });

  test('Exception handling during emit: Error in listener halts remaining sync listeners in same emit', () => {
    const cb1 = vi.fn();
    const cbErr = vi.fn(() => {
      throw new Error('Listener Failure');
    });
    const cb2 = vi.fn();

    StateManager.on('evt:err', cb1);
    StateManager.on('evt:err', cbErr);
    StateManager.on('evt:err', cb2);

    expect(() => {
      StateManager.emit('evt:err', { data: 'test' });
    }).toThrow('Listener Failure');

    expect(cb1).toHaveBeenCalledTimes(1);
    expect(cbErr).toHaveBeenCalledTimes(1);
    expect(cb2).not.toHaveBeenCalled(); // Halted by exception
  });

  test('State mutation referential update and oldValue tracking', () => {
    const history = [];
    StateManager.on('state:user', (data) => {
      history.push(data);
    });

    StateManager.setState('user', { name: 'Alice', role: 'admin' });
    StateManager.setState('user', { name: 'Bob', role: 'editor' });

    expect(history).toHaveLength(2);
    expect(history[0]).toEqual({
      key: 'user',
      value: { name: 'Alice', role: 'admin' },
      oldValue: undefined
    });
    expect(history[1]).toEqual({
      key: 'user',
      value: { name: 'Bob', role: 'editor' },
      oldValue: { name: 'Alice', role: 'admin' }
    });
  });

  test('Multiple isolated StateManager instances operate independently under high load', () => {
    const sm1 = new StateManager();
    const sm2 = new StateManager();

    let sm1Calls = 0;
    let sm2Calls = 0;

    sm1.on('data', () => sm1Calls++);
    sm2.on('data', () => sm2Calls++);

    for (let i = 0; i < 5000; i++) {
      sm1.emit('data', i);
      if (i % 2 === 0) sm2.emit('data', i);
    }

    expect(sm1Calls).toBe(5000);
    expect(sm2Calls).toBe(2500);

    sm1.clear();
    sm1.emit('data', 1);
    sm2.emit('data', 1);
    expect(sm1Calls).toBe(5000);
    expect(sm2Calls).toBe(2501);
  });
});
