import { describe, it, expect, mock, beforeEach } from "bun:test";
import { getToken, setToken, useToken, TOKEN_HEADER } from "./token";

beforeEach(() => {
  mock(window.localStorage, {
    getItem: () => "",
    setItem: () => {},
    removeItem: () => {},
  });
});

describe("getToken", () => {
  it("returns an empty string when no token is set", () => {
    expect(getToken()).toBe("");
  });

  it("returns the token when it is set", () => {
    setToken("token");
    expect(getToken()).toBe("token");
  });

  it("trims the token when it is set", () => {
    setToken("  token  ");
    expect(getToken()).toBe("token");
  });
});

describe("setToken", () => {
  it("sets the token in local storage", () => {
    const setItemSpy = mock(window.localStorage, "setItem");
    setToken("token");
    expect(setItemSpy).toHaveBeenCalledTimes(1);
    expect(setItemSpy).toHaveBeenCalledWith("git-trace:token", "token");
  });

  it("removes the token from local storage when an empty string is passed", () => {
    const removeItemSpy = mock(window.localStorage, "removeItem");
    setToken("");
    expect(removeItemSpy).toHaveBeenCalledTimes(1);
    expect(removeItemSpy).toHaveBeenCalledWith("git-trace:token");
  });

  it("trims the token before setting it", () => {
    const setItemSpy = mock(window.localStorage, "setItem");
    setToken("  token  ");
    expect(setItemSpy).toHaveBeenCalledTimes(1);
    expect(setItemSpy).toHaveBeenCalledWith("git-trace:token", "token");
  });

  it("calls all listeners when the token is set", () => {
    const listener1 = mock.fn();
    const listener2 = mock.fn();
    const unsubscribe1 = setToken(listener1);
    const unsubscribe2 = setToken(listener2);
    unsubscribe1();
    unsubscribe2();
    setToken("token");
    expect(listener1).toHaveBeenCalledTimes(1);
    expect(listener2).toHaveBeenCalledTimes(1);
  });
});

describe("useToken", () => {
  it("returns the current token", () => {
    setToken("token");
    expect(useToken()).toBe("token");
  });

  it("updates when the token changes", () => {
    const token = useToken();
    setToken("new token");
    expect(useToken()).toBe("new token");
  });
});

describe("TOKEN_HEADER", () => {
  it("is set to 'x-github-token'", () => {
    expect(TOKEN_HEADER).toBe("x-github-token");
  });
});

describe("error handling", () => {
  it("catches errors when reading from local storage", () => {
    mock(window.localStorage, {
      getItem: () => {
        throw new Error("Error reading from local storage");
      },
    });
    expect(getToken()).toBe("");
  });

  it("catches errors when writing to local storage", () => {
    mock(window.localStorage, {
      setItem: () => {
        throw new Error("Error writing to local storage");
      },
    });
    setToken("token");
    expect(getToken()).toBe("token");
  });
});