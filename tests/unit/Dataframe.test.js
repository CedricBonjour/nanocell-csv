import { describe, it, expect } from 'vitest';
import { Dataframe } from '../../app/js/Dataframe.js';

describe('Dataframe', () => {
  it('should initialize with default empty data', () => {
    const df = new Dataframe();
    expect(df.width).toBe(1);
    expect(df.height).toBe(1);
    expect(df.get(0, 0)).toBe('');
  });

  it('should initialize with provided data', () => {
    const df = new Dataframe([['A', 'B'], ['C', 'D']]);
    expect(df.width).toBe(2);
    expect(df.height).toBe(2);
    expect(df.get(0, 0)).toBe('A');
    expect(df.get(1, 1)).toBe('D');
  });

  it('should insert a column', () => {
    const df = new Dataframe([['1', '2']]);
    df.insertCol(1);
    expect(df.width).toBe(3);
    expect(df.get(1, 0)).toBe('');
    expect(df.get(2, 0)).toBe('2');
  });
});
