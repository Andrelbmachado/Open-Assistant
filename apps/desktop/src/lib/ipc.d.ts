/** Bridge from the UI to the Rust shell / Python sidecar (typed). */
export interface Ipc {
    invoke<T>(command: string, args?: Record<string, unknown>): Promise<T>;
}
export declare const ipc: Ipc;
