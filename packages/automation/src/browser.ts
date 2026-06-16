/** Browser control via Playwright (runs on the TS side). */
export class Browser {
  // TODO: hold a Playwright BrowserContext.
  async open(_url: string): Promise<void> {}
  async fill(_selector: string, _value: string): Promise<void> {}
  async extract(_selector: string): Promise<string[]> {
    return [];
  }
  async close(): Promise<void> {}
}
