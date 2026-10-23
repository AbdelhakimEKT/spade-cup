import { describe, expect, it } from 'vitest';
import { retryOnRateLimit } from '../src/screens';

describe('retryOnRateLimit : un seul nouveau navigateur toutes les 20 secondes', () => {
  it('refusé pour cause de quota : patiente 21 s puis réessaie', async () => {
    const waits: number[] = [];
    let calls = 0;
    const result = await retryOnRateLimit(
      async () => {
        calls++;
        if (calls === 1)
          throw new Error('Unable to create new browser: code: 429: message: Rate limit exceeded');
        return 'navigateur';
      },
      async (ms) => void waits.push(ms),
    );
    expect(result).toBe('navigateur');
    expect(waits).toEqual([21_000]);
  });

  it('abandonne après 3 essais', async () => {
    let calls = 0;
    const task = async () => {
      calls++;
      throw new Error('Rate limit exceeded');
    };
    await expect(retryOnRateLimit(task, async () => {})).rejects.toThrow('Rate limit');
    expect(calls).toBe(3);
  });

  it('une autre erreur ne fait pas réessayer', async () => {
    let calls = 0;
    const task = async () => {
      calls++;
      throw new Error('Page introuvable');
    };
    await expect(retryOnRateLimit(task, async () => {})).rejects.toThrow('Page introuvable');
    expect(calls).toBe(1);
  });
});
