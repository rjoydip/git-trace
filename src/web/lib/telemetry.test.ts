import { describe, it, expect, mock, beforeEach } from "bun:test";
import { record, clearTelemetry, subscribeTelemetry, telemetrySnapshot } from "./telemetry";

beforeEach(() => {
  // Mock Date to avoid time-related flakiness
  mock(Date, {
    now: () => 1643723400000,
  });
});

describe("telemetry", () => {
  it("records an event", () => {
    const event: Omit<TelemetryEvent, "id" | "time"> = {
      method: "GET",
      target: "/api/path",
      kind: "api",
      status: "200 OK",
      ok: true,
      latency: 100,
      params: {},
      result: {},
    };
    record(event);
    expect(telemetrySnapshot()).toEqual([
      {
        id: "evt-1",
        time: "14:30:00.000",
        ...event,
      },
    ]);
  });

  it("records multiple events", () => {
    const event1: Omit<TelemetryEvent, "id" | "time"> = {
      method: "GET",
      target: "/api/path1",
      kind: "api",
      status: "200 OK",
      ok: true,
      latency: 100,
      params: {},
      result: {},
    };
    const event2: Omit<TelemetryEvent, "id" | "time"> = {
      method: "POST",
      target: "/api/path2",
      kind: "api",
      status: "201 Created",
      ok: true,
      latency: 200,
      params: {},
      result: {},
    };
    record(event1);
    record(event2);
    expect(telemetrySnapshot()).toEqual([
      {
        id: "evt-2",
        time: "14:30:00.000",
        ...event2,
      },
      {
        id: "evt-1",
        time: "14:30:00.000",
        ...event1,
      },
    ]);
  });

  it("limits the number of events", () => {
    for (let i = 0; i < 61; i++) {
      record({
        method: "GET",
        target: `/api/path${i}`,
        kind: "api",
        status: "200 OK",
        ok: true,
        latency: 100,
        params: {},
        result: {},
      });
    }
    expect(telemetrySnapshot()).toHaveLength(60);
  });

  it("clears the telemetry", () => {
    record({
      method: "GET",
      target: "/api/path",
      kind: "api",
      status: "200 OK",
      ok: true,
      latency: 100,
      params: {},
      result: {},
    });
    clearTelemetry();
    expect(telemetrySnapshot()).toEqual([]);
  });

  it("subscribes to telemetry updates", () => {
    const listener = jest.fn();
    const unsubscribe = subscribeTelemetry(listener);
    record({
      method: "GET",
      target: "/api/path",
      kind: "api",
      status: "200 OK",
      ok: true,
      latency: 100,
      params: {},
      result: {},
    });
    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
    record({
      method: "POST",
      target: "/api/path",
      kind: "api",
      status: "201 Created",
      ok: true,
      latency: 200,
      params: {},
      result: {},
    });
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("handles empty input", () => {
    expect(() => record({})).not.toThrow();
  });

  it("handles invalid input", () => {
    expect(() => record({ method: "GET", target: "/api/path" })).not.toThrow();
  });

  it("throws an error when recording an event with an invalid kind", () => {
    expect(() => record({ method: "GET", target: "/api/path", kind: "invalid", status: "200 OK", ok: true, latency: 100, params: {}, result: {} })).not.toThrow();
  });

  it("throws an error when recording an event with an invalid status", () => {
    expect(() => record({ method: "GET", target: "/api/path", kind: "api", status: 200, ok: true, latency: 100, params: {}, result: {} })).not.toThrow();
  });

  it("throws an error when recording an event with an invalid ok value", () => {
    expect(() => record({ method: "GET", target: "/api/path", kind: "api", status: "200 OK", ok: true, latency: 100, params: {}, result: {} })).not.toThrow();
  });

  it("throws an error when recording an event with an invalid latency value", () => {
    expect(() => record({ method: "GET", target: "/api/path", kind: "api", status: "200 OK", ok: true, latency: 100, params: {}, result: {} })).not.toThrow();
  });
});