import { afterEach, describe, expect, it, vi } from "vitest";
import { isOnline, shouldRegisterServiceWorker, subscribeOnlineStatus } from "./online-status";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("isOnline", () => {
  it("reflects navigator.onLine when available", () => {
    vi.stubGlobal("navigator", { onLine: false });
    expect(isOnline()).toBe(false);

    vi.stubGlobal("navigator", { onLine: true });
    expect(isOnline()).toBe(true);
  });

  it("defaults to true when navigator is unavailable (SSR)", () => {
    vi.stubGlobal("navigator", undefined);
    expect(isOnline()).toBe(true);
  });
});

describe("subscribeOnlineStatus", () => {
  it("invokes the callback on online/offline events and cleans up listeners", () => {
    const listeners: Record<string, ((...a: unknown[]) => void)[]> = {};
    const fakeWindow = {
      addEventListener: (type: string, fn: (...a: unknown[]) => void) => {
        (listeners[type] ??= []).push(fn);
      },
      removeEventListener: (type: string, fn: (...a: unknown[]) => void) => {
        listeners[type] = (listeners[type] ?? []).filter((l) => l !== fn);
      },
    };
    vi.stubGlobal("window", fakeWindow);

    const onChange = vi.fn();
    const unsubscribe = subscribeOnlineStatus(onChange);

    listeners.offline.forEach((fn) => fn());
    expect(onChange).toHaveBeenLastCalledWith(false);

    listeners.online.forEach((fn) => fn());
    expect(onChange).toHaveBeenLastCalledWith(true);

    unsubscribe();
    expect(listeners.online.length).toBe(0);
    expect(listeners.offline.length).toBe(0);
  });

  it("is a no-op outside the browser", () => {
    vi.stubGlobal("window", undefined);
    const onChange = vi.fn();
    const unsubscribe = subscribeOnlineStatus(onChange);
    expect(() => unsubscribe()).not.toThrow();
    expect(onChange).not.toHaveBeenCalled();
  });
});

describe("shouldRegisterServiceWorker", () => {
  it("is false outside the browser regardless of NODE_ENV", () => {
    vi.stubGlobal("window", undefined);
    vi.stubEnv("NODE_ENV", "production");
    expect(shouldRegisterServiceWorker()).toBe(false);
  });

  it("is false in development even with serviceWorker support", () => {
    vi.stubGlobal("window", {});
    vi.stubGlobal("navigator", { serviceWorker: {} });
    vi.stubEnv("NODE_ENV", "development");
    expect(shouldRegisterServiceWorker()).toBe(false);
  });

  it("is false in production without serviceWorker support", () => {
    vi.stubGlobal("window", {});
    vi.stubGlobal("navigator", {});
    vi.stubEnv("NODE_ENV", "production");
    expect(shouldRegisterServiceWorker()).toBe(false);
  });

  it("is true in production, in-browser, with serviceWorker support", () => {
    vi.stubGlobal("window", {});
    vi.stubGlobal("navigator", { serviceWorker: {} });
    vi.stubEnv("NODE_ENV", "production");
    expect(shouldRegisterServiceWorker()).toBe(true);
  });
});
