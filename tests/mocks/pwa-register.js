export let lastRegisteredSWOptions = null;

export function registerSW(options) {
  lastRegisteredSWOptions = options;
  return () => {};
}

