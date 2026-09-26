import { describe, expect, it } from "vitest";
import { autoLayout, blankWorkflow, buildWorkflow, isDue, NODE_KINDS, renderTemplate, validateWorkflow, WORKFLOW_TEMPLATES } from "./workflow";
import { runWorkflow, type WorkflowHost } from "./workflowEngine";

function fakeHost(overrides: Partial<WorkflowHost> = {}) {
  const log: string[] = [];
  const written: { folder: string; name: string; content: string }[] = [];
  const host: WorkflowHost = {
    folders: { desktop: "C:\\Users\\x\\Desktop", documents: "C:\\Users\\x\\Documents" },
    openUrl: async (url) => { log.push(`open ${url}`); },
    readUrl: async (url) => `texto de ${url}`,
    webSearch: async (query) => `resultados de ${query}`,
    http: async () => ({ status: 200, text: "{\"ok\":true}" }),
    listFiles: async () => [{ path: "C:\\f\\a.png", name: "a.png", size: 1, modified: 1 }],
    readFile: async (path) => `conteúdo de ${path}`,
    writeFile: async (folder, name, content) => { written.push({ folder, name, content }); return `${folder}\\${name}`; },
    copyFile: async (from, folder) => `${folder}\\${from.split("\\").pop()}`,
    cloudList: async () => [
      { name: "ata.docx", path: "Entrada/ata.docx", size: 10, modified: "2026-09-25T10:00:00Z", isDir: false },
      { name: "contrato.pdf", path: "Entrada/contrato.pdf", size: 20, modified: "2026-09-25T11:00:00Z", isDir: false },
    ],
    cloudDownload: async (_remote, path, folder) => `${folder}\\${path.split("/").pop()}`,
    cloudUpload: async (local, remote, folder) => `${remote}:${folder}/${local}`,
    ai: async (prompt) => `resumo(${prompt.match(/"([^"]+)"/)?.[1] ?? "?"})`,
    generateImage: async (_prompt, _model, edit) => edit ? `${edit.path}.editada.png` : "C:\\img\\nova.png",
    runCommand: async (command) => `saída de ${command}`,
    runAgent: async (instruction) => `feito: ${instruction}`,
    postToChat: (title, text) => { log.push(`chat ${title}: ${text}`); },
    notify: async (title, message) => { log.push(`notify ${title}: ${message}`); },
    ...overrides,
  };
  return { host, log, written };
}

describe("workflow catalog", () => {
  it("every template is valid and every kind has a label and description", () => {
    for (const template of WORKFLOW_TEMPLATES) expect(validateWorkflow(template.build()), template.id).toEqual([]);
    for (const spec of NODE_KINDS) { expect(spec.label).toBeTruthy(); expect(spec.description).toBeTruthy(); }
  });

  it("explains mistakes so the AI can fix them", () => {
    const doc = buildWorkflow({ name: "x", nodes: [{ id: "a", kind: "file.read", params: { caminho: "x" } }, { id: "b", kind: "voar" }] });
    const messages = validateWorkflow(doc).map((issue) => issue.message).join("\n");
    expect(messages).toContain("não tem o parâmetro \"caminho\"");
    expect(messages).toContain("kind desconhecido: voar");
    expect(messages).toContain("Falta um gatilho");
    expect(messages).toContain("não recebe nada");
  });

  it("fills templates with item fields, dates and user folders", () => {
    const text = renderTemplate("{desktop}\\resumos\\{{name}} {{date}}.md", { name: "ata" }, { date: "2026-09-25" }, { desktop: "C:\\D" });
    expect(text).toBe("C:\\D\\resumos\\ata 2026-09-25.md");
    expect(renderTemplate("{{json.a}}-{{falta}}", { json: { a: 1 } })).toBe("1-");
  });

  it("lays nodes out left to right by dependency", () => {
    const doc = buildWorkflow({ name: "x", nodes: [{ id: "a", kind: "trigger.manual" }, { id: "b", kind: "web.open" }, { id: "c", kind: "web.open" }], connections: [{ from: "a", to: "b" }, { from: "a", to: "c" }] });
    const [a, b, c] = autoLayout(doc.nodes, doc.connections);
    expect(b.x).toBeGreaterThan(a.x);
    expect(c.x).toBe(b.x);
    expect(c.y).toBeGreaterThan(b.y);
  });

  it("schedules by the trigger interval", () => {
    const doc = WORKFLOW_TEMPLATES.find((item) => item.id === "drive-resumos")!.build();
    expect(isDue(doc, 1_000)).toBe(true);
    expect(isDue({ ...doc, lastRunAt: 0 }, 29 * 60_000)).toBe(false);
    expect(isDue({ ...doc, lastRunAt: 0 }, 30 * 60_000)).toBe(true);
    expect(isDue({ ...doc, lastRunAt: 0, scheduleEnabled: false }, 90 * 60_000)).toBe(false);
    expect(isDue(blankWorkflow("x"), 90 * 60_000)).toBe(false);
  });
});

describe("runWorkflow", () => {
  it("opens a site", async () => {
    const { host, log } = fakeHost();
    const result = await runWorkflow(WORKFLOW_TEMPLATES[0].build(), host);
    expect(result.ok).toBe(true);
    expect(log).toEqual(["open https://g1.globo.com"]);
  });

  it("summarizes new Google Drive documents into Desktop\\resumos and remembers what it saw", async () => {
    const { host, log, written } = fakeHost();
    const doc = WORKFLOW_TEMPLATES.find((item) => item.id === "drive-resumos")!.build();
    const states: string[] = [];
    const first = await runWorkflow(doc, host, { onNode: (id, info) => states.push(`${id}:${info.state}`) });
    expect(first.ok).toBe(true);
    expect(written).toHaveLength(1);
    expect(written[0].folder).toBe("C:\\Users\\x\\Desktop\\resumos");
    expect(written[0].name).toMatch(/^resumos \d{4}-\d{2}-\d{2} \d{2}-\d{2}\.md$/);
    expect(written[0].content).toContain("2 documentos novos");
    expect(written[0].content).toContain("## ata.docx\n\nresumo(ata.docx)");
    expect(written[0].content).toContain("## contrato.pdf");
    expect(log.some((line) => line.startsWith("notify Resumos prontos"))).toBe(true);
    expect(states).toContain("salvar:ok");

    // Segunda passada: nada novo → para em silêncio, sem relatório vazio.
    const second = await runWorkflow({ ...doc, memory: first.memory }, host);
    expect(second.ok).toBe(true);
    expect(second.stopped).toBe(true);
    expect(written).toHaveLength(1);
  });

  it("edits photos with AI and copies the result", async () => {
    const { host } = fakeHost();
    const result = await runWorkflow(WORKFLOW_TEMPLATES.find((item) => item.id === "editar-foto")!.build(), host);
    expect(result.ok).toBe(true);
    expect(result.outputs.copiar[0].path).toBe("C:\\Users\\x\\Desktop\\Fotos editadas\\a.png.editada.png");
  });

  it("stops at the failing node and keeps the old memory", async () => {
    const { host } = fakeHost({ cloudDownload: async () => { throw new Error("sem internet"); } });
    const doc = WORKFLOW_TEMPLATES.find((item) => item.id === "drive-resumos")!.build();
    const states: Record<string, string> = {};
    const result = await runWorkflow(doc, host, { onNode: (id, info) => { states[id] = info.state; } });
    expect(result.ok).toBe(false);
    expect(result.error).toBe("Baixar da nuvem: sem internet");
    expect(states.baixar).toBe("error");
    expect(states.salvar).toBe("skipped");
    expect(result.memory).toEqual({});
  });
});
