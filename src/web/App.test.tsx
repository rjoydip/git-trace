import { describe, it, expect, mock, beforeEach } from "bun:test";
import App from "./App";

describe("App", () => {
  beforeEach(() => {
    // Mock network, timers and randomness
    mock(window, "localStorage", {
      getItem: () => null,
      setItem: () => {},
    });
    mock(window, "sessionStorage", {
      getItem: () => null,
      setItem: () => {},
    });
    mock(window, "setTimeout", () => {});
    mock(window, "setInterval", () => {});
    mock(window, "clearTimeout", () => {});
    mock(window, "clearInterval", () => {});
    mock(navigator, "clipboard", {
      writeText: () => Promise.resolve(),
    });
  });

  it("renders without crashing", () => {
    const app = new App();
    expect(app).toBeTruthy();
  });

  it("reads recent repositories from local storage", () => {
    const recent = ["repo1", "repo2"];
    mock(window, "localStorage", {
      getItem: () => JSON.stringify(recent),
    });
    const app = new App();
    expect(app.state.recent).toEqual(recent);
  });

  it("pushes recent repository to local storage", () => {
    const recent = ["repo1", "repo2"];
    mock(window, "localStorage", {
      getItem: () => JSON.stringify(recent),
      setItem: (key, value) => {
        expect(key).toBe("git-trace:recent");
        expect(JSON.parse(value)).toEqual(["repo3", ...recent]);
      },
    });
    const app = new App();
    app.pushRecent(recent, "repo3");
  });

  it("runs with a valid repository name", async () => {
    const repo = "valid-repo";
    mock(loadTrace, () => Promise.resolve({ repo, stats: {}, meta: {} }));
    const app = new App();
    await app.run(repo);
    expect(app.state.data).toBeTruthy();
    expect(app.state.repo).toBe(repo);
  });

  it("handles error when running with an invalid repository name", async () => {
    const repo = "invalid-repo";
    mock(loadTrace, () => Promise.reject(new Error("Invalid repository")));
    const app = new App();
    await app.run(repo);
    expect(app.state.error).toBeTruthy();
  });

  it("dismisses limits notice", () => {
    const app = new App();
    app.dismissLimits();
    expect(app.state.showLimits).toBe(false);
  });

  it("toggles live streaming", () => {
    const app = new App();
    app.setLive(true);
    expect(app.state.live).toBe(true);
    app.setLive(false);
    expect(app.state.live).toBe(false);
  });

  it("opens and closes settings dialog", () => {
    const app = new App();
    app.setSettingsOpen(true);
    expect(app.state.settingsOpen).toBe(true);
    app.setSettingsOpen(false);
    expect(app.state.settingsOpen).toBe(false);
  });

  it("inspects a record", () => {
    const app = new App();
    const record = { title: "Record", payload: {} };
    app.setInspect(record);
    expect(app.state.inspect).toEqual(record);
  });

  it("closes inspect dialog", () => {
    const app = new App();
    app.setInspect(null);
    expect(app.state.inspect).toBe(null);
  });
});