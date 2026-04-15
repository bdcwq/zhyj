import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock ioredis before importing the module
const mockPing = vi.fn();
vi.mock('ioredis', () => {
  return {
    default: vi.fn().mockImplementation(() => ({
      ping: mockPing,
    })),
  };
});

describe('Redis client', () => {
  beforeEach(() => {
    vi.resetModules();
    mockPing.mockReset();
  });

  it('redis is null when REDIS_URL is not set', async () => {
    const originalUrl = process.env.REDIS_URL;
    delete process.env.REDIS_URL;

    // Reset the globalThis cache so createRedisClient runs fresh
    const g = globalThis as Record<string, unknown>;
    delete g.redis;

    const { redis } = await import('../index');
    expect(redis).toBeNull();

    process.env.REDIS_URL = originalUrl;
  });

  it('getRedisStatus() returns { status: "disabled" } when REDIS_URL is not set', async () => {
    const originalUrl = process.env.REDIS_URL;
    delete process.env.REDIS_URL;

    const g = globalThis as Record<string, unknown>;
    delete g.redis;

    const { getRedisStatus } = await import('../index');
    const result = await getRedisStatus();
    expect(result).toEqual({ status: 'disabled' });

    process.env.REDIS_URL = originalUrl;
  });

  it('getRedisStatus() returns { status: "ok" } when Redis ping succeeds', async () => {
    process.env.REDIS_URL = 'redis://localhost:6379';
    mockPing.mockResolvedValue('PONG');

    const g = globalThis as Record<string, unknown>;
    delete g.redis;

    const { getRedisStatus } = await import('../index');
    const result = await getRedisStatus();
    expect(result).toEqual({ status: 'ok' });

    delete process.env.REDIS_URL;
  });

  it('getRedisStatus() returns { status: "error", error } when Redis ping fails', async () => {
    process.env.REDIS_URL = 'redis://localhost:6379';
    mockPing.mockRejectedValue(new Error('Connection refused'));

    const g = globalThis as Record<string, unknown>;
    delete g.redis;

    const { getRedisStatus } = await import('../index');
    const result = await getRedisStatus();
    expect(result.status).toBe('error');
    expect(result.error).toBe('Connection refused');

    delete process.env.REDIS_URL;
  });
});
