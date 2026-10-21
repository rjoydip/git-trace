import { describe, it, expect, mock, beforeEach } from "bun:test";
import { main } from "./main";

describe("main", () => {
  beforeEach(() => {
    // Mock network, timers and randomness
    mock("react-dom/client", {
      createRoot: jest.fn(),
    });
    mock("react", {
      StrictMode: jest.fn(),
    });
    mock("navigator", {
      serviceWorker: {
        register: jest.fn(),
      },
    });
    mock("document", {
      getElementById: jest.fn(),
    });
    mock("window", {
      addEventListener: jest.fn(),
    });
    mock("./App", {
      App: jest.fn(),
    });
  });

  it("renders the app when root element exists", () => {
    // Arrange
    const root = { id: "root" };
    (document as unknown as { getElementById: jest.Mock }).getElementById.mockReturnValue(root);
    const createRootMock = (await import("react-dom/client")).createRoot;
    const renderMock = jest.fn();
    createRootMock.mockReturnValue({ render: renderMock });
    const StrictModeMock = (await import("react")).StrictMode;
    const AppMock = (await import("./App")).App;

    // Act
    main();

    // Assert
    expect(createRootMock).toHaveBeenCalledTimes(1);
    expect(createRootMock).toHaveBeenCalledWith(root);
    expect(renderMock).toHaveBeenCalledTimes(1);
    expect(renderMock).toHaveBeenCalledWith(expect.objectContaining({
      type: StrictModeMock,
      props: expect.objectContaining({
        children: expect.objectContaining({
          type: AppMock,
        }),
      }),
    }));
  });

  it("does not render the app when root element does not exist", () => {
    // Arrange
    (document as unknown as { getElementById: jest.Mock }).getElementById.mockReturnValue(null);
    const createRootMock = (await import("react-dom/client")).createRoot;
    const renderMock = jest.fn();

    // Act
    main();

    // Assert
    expect(createRootMock).not.toHaveBeenCalled();
  });

  it("registers service worker when in production and service worker is supported", () => {
    // Arrange
    (import.meta as unknown as { env: { PROD: boolean } }).env = { PROD: true };
    const registerMock = (navigator as unknown as { serviceWorker: { register: jest.Mock } }).serviceWorker?.register;
    const addEventListenerMock = (window as unknown as { addEventListener: jest.Mock }).addEventListener;

    // Act
    main();

    // Assert
    expect(addEventListenerMock).toHaveBeenCalledTimes(1);
    expect(addEventListenerMock).toHaveBeenCalledWith("load", expect.any(Function));
    expect(registerMock).not.toHaveBeenCalled();

    // Simulate load event
    const loadEvent = addEventListenerMock.mock.calls[0][1];
    loadEvent();

    expect(registerMock).toHaveBeenCalledTimes(1);
    expect(registerMock).toHaveBeenCalledWith("/sw.js");
  });

  it("does not register service worker when not in production", () => {
    // Arrange
    (import.meta as unknown as { env: { PROD: boolean } }).env = { PROD: false };
    const registerMock = (navigator as unknown as { serviceWorker: { register: jest.Mock } }).serviceWorker?.register;
    const addEventListenerMock = (window as unknown as { addEventListener: jest.Mock }).addEventListener;

    // Act
    main();

    // Assert
    expect(addEventListenerMock).not.toHaveBeenCalled();
    expect(registerMock).not.toHaveBeenCalled();
  });

  it("does not register service worker when service worker is not supported", () => {
    // Arrange
    (import.meta as unknown as { env: { PROD: boolean } }).env = { PROD: true };
    (navigator as unknown as { serviceWorker: undefined }).serviceWorker = undefined;
    const registerMock = (navigator as unknown as { serviceWorker: { register: jest.Mock } }).serviceWorker?.register;
    const addEventListenerMock = (window as unknown as { addEventListener: jest.Mock }).addEventListener;

    // Act
    main();

    // Assert
    expect(addEventListenerMock).not.toHaveBeenCalled();
    expect(registerMock).not.toHaveBeenCalled();
  });

  it("catches error when registering service worker", () => {
    // Arrange
    (import.meta as unknown as { env: { PROD: boolean } }).env = { PROD: true };
    const registerMock = (navigator as unknown as { serviceWorker: { register: jest.Mock } }).serviceWorker?.register;
    registerMock?.mockImplementation(() => {
      throw new Error("Test error");
    });
    const addEventListenerMock = (window as unknown as { addEventListener: jest.Mock }).addEventListener;

    // Act
    main();

    // Assert
    expect(addEventListenerMock).toHaveBeenCalledTimes(1);
    expect(addEventListenerMock).toHaveBeenCalledWith("load", expect.any(Function));

    // Simulate load event
    const loadEvent = addEventListenerMock.mock.calls[0][1];
    loadEvent();

    expect(registerMock).toHaveBeenCalledTimes(1);
    expect(registerMock).toHaveBeenCalledWith("/sw.js");
  });
});