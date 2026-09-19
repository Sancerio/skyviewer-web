import { describe, expect, it, vi } from "vitest";
import { createMotionPermissionGate } from "./permissions";
describe("document-scoped motion permission", () => {
  it("requests synchronously in the click stack and deduplicates pending calls", async () => {
    const gate = createMotionPermissionGate();
    let resolve!: (value: PermissionState) => void;
    const request = vi.fn(() => new Promise<PermissionState>(r => { resolve = r; }));
    const first = gate.request(request), second = gate.request(request);
    expect(request).toHaveBeenCalledTimes(1); expect(first).toBe(second);
    resolve("granted"); await first;
    expect(await gate.request(request)).toBe("granted"); expect(request).toHaveBeenCalledTimes(1);
  });
  it("does not persist a grant into another document", async () => {
    const request = vi.fn(async (): Promise<PermissionState> => "granted");
    await createMotionPermissionGate().request(request); await createMotionPermissionGate().request(request);
    expect(request).toHaveBeenCalledTimes(2);
  });
  it("rechecks after invalidation and does not cache denials", async () => {
    const gate = createMotionPermissionGate();
    const request = vi.fn(async (): Promise<PermissionState> => "denied");
    await gate.request(request); await gate.request(request); expect(request).toHaveBeenCalledTimes(2);
    request.mockResolvedValue("granted"); await gate.request(request); gate.invalidate(); await gate.request(request);
    expect(request).toHaveBeenCalledTimes(4);
  });
  it("does not let an obsolete request restore an invalidated grant", async () => {
    const gate = createMotionPermissionGate(); let resolve!: (value: PermissionState) => void;
    const first = gate.request(() => new Promise<PermissionState>(r => { resolve = r; }));
    gate.invalidate(); resolve("granted"); await first;
    const request = vi.fn(async (): Promise<PermissionState> => "granted"); await gate.request(request);
    expect(request).toHaveBeenCalledOnce();
  });
  it("recovers from thrown and rejected browser requests", async () => {
    const gate = createMotionPermissionGate();
    await expect(gate.request(() => { throw new Error("blocked"); })).rejects.toThrow("blocked");
    await expect(gate.request(() => Promise.reject(new Error("blocked")))).rejects.toThrow("blocked");
    expect(await gate.request(async () => "granted")).toBe("granted");
  });
  it("does not request permissions where the request API is absent", async () => {
    expect(await createMotionPermissionGate().request()).toBe("granted");
  });
});
