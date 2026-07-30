/**
 * StateManager - Central Vanilla JS State Manager using the Pub/Sub / Observer Pattern.
 * Manages central application state and decouples singletons and event handling.
 * @module StateManager
 */
class StateManager {
  static #defaultInstance = new StateManager();

  /**
   * Registers an event listener on the singleton instance.
   * @param {string} event - Name of the event to subscribe to.
   * @param {Function} callback - Function executed when the event is emitted.
   * @returns {Function} Unsubscribe function to remove the listener.
   */
  static on(event, callback) {
    return StateManager.#defaultInstance.on(event, callback);
  }

  /**
   * Removes an event listener from the singleton instance.
   * @param {string} event - Name of the event.
   * @param {Function} callback - Callback function reference to remove.
   */
  static off(event, callback) {
    StateManager.#defaultInstance.off(event, callback);
  }

  /**
   * Emits an event with optional data payload to all registered listeners on the singleton instance.
   * @param {string} event - Name of the event to emit.
   * @param {*} [data] - Event payload data.
   */
  static emit(event, data) {
    StateManager.#defaultInstance.emit(event, data);
  }

  /**
   * Sets a state property on the singleton instance and emits a `state:<key>` change event.
   * @param {string} key - State key identifier.
   * @param {*} value - State value to store.
   * @returns {*} The assigned value.
   */
  static setState(key, value) {
    return StateManager.#defaultInstance.setState(key, value);
  }

  /**
   * Retrieves a state property value by key from the singleton instance.
   * @param {string} key - State key identifier.
   * @returns {*} The stored state value, or undefined if not found.
   */
  static getState(key) {
    return StateManager.#defaultInstance.getState(key);
  }

  /**
   * Resets all state values and clears all event listeners on the singleton instance.
   */
  static clear() {
    StateManager.#defaultInstance.clear();
  }

  /**
   * Instantiates a new StateManager instance with empty state and listeners maps.
   */
  constructor() {
    /** @type {Map<string, Set<Function>>} Map of event names to listener callback sets. */
    this.listeners = new Map();
    /** @type {Map<string, *>} Central key-value state store. */
    this.state = new Map();
  }

  /**
   * Subscribes a listener callback to an event.
   * @param {string} event - Name of the event.
   * @param {Function} callback - Function invoked on event dispatch.
   * @returns {Function} Unsubscribe function.
   */
  on(event, callback) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event).add(callback);
    return () => this.off(event, callback);
  }

  /**
   * Unsubscribes a listener callback from an event.
   * @param {string} event - Name of the event.
   * @param {Function} callback - Callback function reference to remove.
   */
  off(event, callback) {
    if (this.listeners.has(event)) {
      this.listeners.get(event).delete(callback);
    }
  }

  /**
   * Dispatches an event to all subscribed listener callbacks.
   * @param {string} event - Name of the event.
   * @param {*} [data] - Event payload data.
   */
  emit(event, data) {
    if (this.listeners.has(event)) {
      const callbacks = Array.from(this.listeners.get(event));
      for (const cb of callbacks) {
        cb(data);
      }
    }
  }

  /**
   * Updates state store and emits change event.
   * @param {string} key - State key.
   * @param {*} value - New value.
   * @returns {*} Settled value.
   */
  setState(key, value) {
    const oldValue = this.state.get(key);
    this.state.set(key, value);
    this.emit(`state:${key}`, { key, value, oldValue });
    return value;
  }

  /**
   * Gets state store value.
   * @param {string} key - State key.
   * @returns {*} Stored value or undefined.
   */
  getState(key) {
    return this.state.get(key);
  }

  /**
   * Clears state maps and listeners.
   */
  clear() {
    this.listeners.clear();
    this.state.clear();
  }
}

export { StateManager };
export default StateManager;

