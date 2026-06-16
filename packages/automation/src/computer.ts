/**
 * Computer control. OS-level input / screenshots / OCR are delegated to the
 * Python sidecar over a typed RPC boundary — this class is the TS-side facade.
 */
export interface SidecarRpc {
  call<T>(method: string, params: unknown): Promise<T>;
}

export class Computer {
  constructor(private rpc: SidecarRpc) {}
  screenshot(): Promise<string /* base64 */> {
    return this.rpc.call("desktop.screenshot", {});
  }
  ocr(imageBase64: string): Promise<string> {
    return this.rpc.call("desktop.ocr", { image: imageBase64 });
  }
  moveMouse(x: number, y: number): Promise<void> {
    return this.rpc.call("desktop.moveMouse", { x, y });
  }
  type(text: string): Promise<void> {
    return this.rpc.call("desktop.type", { text });
  }
  launch(app: string): Promise<void> {
    return this.rpc.call("desktop.launch", { app });
  }
}
