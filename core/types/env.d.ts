/**
 * @file core/types/env.d.ts
 * Minimal ambient runtime typings for headless environments (Node.js, Web Workers)
 * without pulling in DOM library globals (window, document, HTMLElement, etc.).
 */

interface TextDecoderOptions {
  fatal?: boolean;
  ignoreBOM?: boolean;
}

interface TextDecodeOptions {
  stream?: boolean;
}

declare class TextDecoder {
  readonly encoding: string;
  readonly fatal: boolean;
  readonly ignoreBOM: boolean;
  constructor(label?: string, options?: TextDecoderOptions);
  decode(input?: ArrayBufferView | ArrayBuffer | Uint8Array, options?: TextDecodeOptions): string;
}

declare interface Console {
  log(...data: any[]): void;
  warn(...data: any[]): void;
  error(...data: any[]): void;
  info(...data: any[]): void;
  debug(...data: any[]): void;
}

declare var console: Console;
