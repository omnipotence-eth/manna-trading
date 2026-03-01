/**
 * Unit tests for CircuitBreaker
 * @jest-environment node
 */
import { CircuitBreaker, CircuitState } from '@/lib/circuitBreaker';

describe('CircuitBreaker', () => {
  it('executes successfully when closed', async () => {
    const cb = new CircuitBreaker({ name: 'test', failureThreshold: 2 });
    const result = await cb.execute(async () => 42);
    expect(result).toBe(42);
    expect(cb.getStats().state).toBe(CircuitState.CLOSED);
  });

  it('opens after failure threshold', async () => {
    const cb = new CircuitBreaker({ name: 'test', failureThreshold: 2, timeout: 10000 });
    await expect(cb.execute(async () => { throw new Error('fail'); })).rejects.toThrow();
    await expect(cb.execute(async () => { throw new Error('fail'); })).rejects.toThrow();
    expect(cb.getStats().state).toBe(CircuitState.OPEN);
    await expect(cb.execute(async () => 1)).rejects.toThrow(/OPEN/);
  });

  it('getStats returns shape', async () => {
    const cb = new CircuitBreaker({ name: 'test' });
    await cb.execute(async () => true);
    const stats = cb.getStats();
    expect(stats.state).toBe(CircuitState.CLOSED);
    expect(stats.totalRequests).toBe(1);
    expect(stats.totalSuccesses).toBe(1);
    expect(typeof stats.failureRate).toBe('number');
  });
});
