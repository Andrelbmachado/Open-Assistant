/** Bridge from the UI to the Rust shell / Python sidecar (typed). */
export interface Ipc {
  invoke<T>(command: string, args?: Record<string, unknown>): Promise<T>;
}

// In Tauri, this wraps @tauri-apps/api `invoke`. Stubbed for now.
export const ipc: Ipc = {
  async invoke<T>(): Promise<T> {
    throw new Error("IPC not wired yet");
  },
};
