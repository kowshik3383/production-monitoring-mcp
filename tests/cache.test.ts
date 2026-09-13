import { describe, it, expect, vi } from "vitest";
import { MemoryCache } from "../src/utils/cache.js";

describe("In-Memory TTL Cache", () => {
  it("stores and retrieves cached values within TTL", () => {
    const cache = new MemoryCache<string>(5000);
    cache.set("key1", "value1");

    expect(cache.get("key1")).toBe("value1");
    expect(cache.size()).toBe(1);
  });

  it("expires entries after TTL elapses", async () => {
    const cache = new MemoryCache<string>(50); // 50ms TTL
    cache.set("tempKey", "tempValue");

    expect(cache.get("tempKey")).toBe("tempValue");

    await new Promise((resolve) => setTimeout(resolve, 60));

    expect(cache.get("tempKey")).toBeUndefined();
  });

  it("caches getOrFetch calls and avoids duplicate fetches", async () => {
    const cache = new MemoryCache<number>(5000);
    const fetchMock = vi.fn().mockResolvedValue(42);

    const first = await cache.getOrFetch("num", fetchMock);
    const second = await cache.getOrFetch("num", fetchMock);

    expect(first).toBe(42);
    expect(second).toBe(42);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
