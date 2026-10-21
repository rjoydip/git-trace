import { describe, it, expect, mock, beforeEach } from "bun:test";
import { getToken, setToken, useToken, TOKEN_HEADER } from "./token";

beforeEach(() => {
  mock(window.localStorage, {
    getItem: () => null,
    setItem: () => {},
    removeItem: () => {},
  });
});

describe("getToken", () => {
  it("returns empty string when no token is stored", () => {
    expect(getToken()).toBe("");
  });

  it("returns stored token", () => {
    mock(window.localStorage, {
      getItem: () => "stored-token",
    });
    expect(getToken()).toBe("stored-token");
  });

  it("returns empty string when storage throws an error", () => {
    mock(window.localStorage, {
      getItem: () => {
        throw new Error("Storage error");
      },
    });
    expect(getToken()).toBe("");
  });
});

describe("setToken", () => {
  it("trims the token", () => {
    setToken("   token   ");
    expect(getToken()).toBe("token");
  });

  it("stores the token", () => {
    const setItemSpy = mock(window.localStorage, {
      setItem: (key, value) => {
        expect(key).toBe("git-trace:token");
        expect(value).toBe("token");
      },
    });
    setToken("token");
    expect(setItemSpy.setItem).toHaveBeenCalledTimes(1);
  });

  it("removes the token when empty string is passed", () => {
    const removeItemSpy = mock(window.localStorage, {
      removeItem: (key) => {
        expect(key).toBe("git-trace:token");
      },
    });
    setToken("");
    expect(removeItemSpy.removeItem).toHaveBeenCalledTimes(1);
  });

  it("notifies listeners", () => {
    const listenerSpy = mock(() => {});
    const unsubscribe = setToken("token");
    unsubscribe();
    setToken("new-token");
    expect(listenerSpy).toHaveBeenCalledTimes(1);
  });

  it("does not throw an error when storage throws an error", () => {
    mock(window.localStorage, {
      setItem: () => {
        throw new Error("Storage error");
      },
    });
    expect(() => setToken("token")).not.toThrow();
  });
});

describe("useToken", () => {
  it("returns the current token", () => {
    setToken("token");
    const token = useToken();
    expect(token).toBe("token");
  });

  it("updates when the token changes", () => {
    const token = useToken();
    expect(token).toBe("");
    setToken("new-token");
    const newToken = useToken();
    expect(newToken).toBe("new-token");
  });
});