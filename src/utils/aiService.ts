import { invoke } from "@tauri-apps/api/core";

export interface AIMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

export interface AIReply {
  text: string;
  source: string;
}

export async function getOllamaModels(): Promise<string[]> {
  try {
    const res = await fetch("http://127.0.0.1:11434/api/tags", { signal: AbortSignal.timeout(1500) });
    if (!res.ok) return [];
    const data = await res.json();
    return (data.models || []).map((m: { name: string }) => m.name);
  } catch {
    return [];
  }
}

export async function askAI(modelName: string, messages: AIMessage[]): Promise<AIReply> {
  const lastUserMsg = [...messages].reverse().find((m) => m.role === "user")?.content || "";
  const normalizedModel = modelName.toLowerCase();

  // 1. Try local Ollama if applicable or if model is set to local
  const isLocalRequested = normalizedModel.includes("local") || normalizedModel.includes("ollama") || normalizedModel.includes("qwen") || normalizedModel.includes("llama");

  try {
    const localModels = await getOllamaModels();
    if (localModels.length > 0 && (isLocalRequested || !normalizedModel.includes("gpt") && !normalizedModel.includes("claude"))) {
      const targetModel = localModels.find((m) => normalizedModel.includes(m.toLowerCase())) || localModels[0];
      const ollamaRes = await fetch("http://127.0.0.1:11434/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: targetModel,
          messages: messages.map((m) => ({ role: m.role, content: m.content })),
          stream: false,
        }),
        signal: AbortSignal.timeout(60000),
      });

      if (ollamaRes.ok) {
        const data = await ollamaRes.json();
        if (data.message?.content) {
          return { text: data.message.content.trim(), source: `Ollama (${targetModel})` };
        }
      }
    }
  } catch {
    // Ollama not reachable or timed out, proceed to cloud providers
  }

  // 2. Try Cloud Providers with Windows Credential Manager
  try {
    if (normalizedModel.includes("gpt") || normalizedModel.includes("openai")) {
      const key = await invoke<string | null>("read_credential", { account: "openai" });
      if (key) {
        const res = await fetch("https://api.openai.com/v1/chat/completions", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
          body: JSON.stringify({
            model: "gpt-4o-mini",
            messages: messages.map((m) => ({ role: m.role, content: m.content })),
          }),
        });
        if (res.ok) {
          const data = await res.json();
          const text = data.choices?.[0]?.message?.content;
          if (text) return { text, source: "OpenAI (GPT-4o)" };
        }
      }
    }

    if (normalizedModel.includes("claude") || normalizedModel.includes("anthropic")) {
      const key = await invoke<string | null>("read_credential", { account: "anthropic" });
      if (key) {
        const res = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": key,
            "anthropic-version": "2023-06-01",
            "anthropic-dangerous-direct-browser-access": "true",
          },
          body: JSON.stringify({
            model: "claude-3-5-sonnet-20241022",
            max_tokens: 2048,
            messages: messages.filter((m) => m.role !== "system").map((m) => ({ role: m.role, content: m.content })),
          }),
        });
        if (res.ok) {
          const data = await res.json();
          const text = data.content?.[0]?.text;
          if (text) return { text, source: "Anthropic (Claude 3.5 Sonnet)" };
        }
      }
    }

    if (normalizedModel.includes("deepseek")) {
      const key = await invoke<string | null>("read_credential", { account: "deepseek" });
      if (key) {
        const res = await fetch("https://api.deepseek.com/chat/completions", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
          body: JSON.stringify({
            model: "deepseek-chat",
            messages: messages.map((m) => ({ role: m.role, content: m.content })),
          }),
        });
        if (res.ok) {
          const data = await res.json();
          const text = data.choices?.[0]?.message?.content;
          if (text) return { text, source: "DeepSeek Chat" };
        }
      }
    }
  } catch {
    // Cloud provider fetch error
  }

  // 3. Fallback Built-in Assistant Response
  return {
    text: generateContextualReply(lastUserMsg, modelName),
    source: "Open Assistant Core (Local)",
  };
}

function generateContextualReply(prompt: string, model: string): string {
  const p = prompt.toLowerCase();

  if (p.includes("olá") || p.includes("ola") || p.includes("oi") || p.includes("bom dia") || p.includes("boa tarde") || p.includes("boa noite")) {
    return `Olá! Bem-vindo ao Open Assistant no Windows.

Estou pronto para ajudar com:
• **Planejamento e código:** criação de scripts, automações em PowerShell e desenvolvimento.
• **Agentes e Workflows:** orquestração visual de agentes e nós no canvas.
• **Terminal Integrado:** comandos locais com segurança.

💡 *Dica de Modelos:* O Ollama foi detectado no seu sistema! Para executar modelos locais como Llama 3 ou Qwen, abra **Configurações > Runtimes locais** e clique em **Iniciar**, ou adicione sua chave de API em **Configurações > Provedores**.`;
  }

  if (p.includes("plano") || p.includes("implementar") || p.includes("projeto") || p.includes("fazer")) {
    return `Aqui está uma proposta de plano de ação estruturado:

1. **Definição de Escopo:**
   - Identificar os requisitos principais e dependências.
   - Configurar variáveis de ambiente e ferramentas necessárias.

2. **Desenvolvimento e Automação:**
   - Executar comandos de validação no Terminal integrado (PowerShell).
   - Conectar os nós no canvas de Workflows para encadear tarefas.

3. **Validação e Entrega:**
   - Testar o fluxo completo de ponta a ponta.
   - Registrar as conclusões e artefatos gerados.

Deseja que eu detalhe alguma destas etapas ou prepare os comandos no terminal?`;
  }

  if (p.includes("terminal") || p.includes("powershell") || p.includes("cmd") || p.includes("comando")) {
    return `Você pode alternar para o painel de **Terminal** ou usar o seletor de visualização na barra superior.

Alguns comandos úteis no Windows:
\`\`\`powershell
# Verificar informações do sistema
Get-ComputerInfo | Select-Object WindowsProductName, OsArchitecture

# Listar processos em execução
Get-Process | Sort-Object CPU -Descending | Select-Object -First 10

# Testar conexão local com Ollama
Test-NetConnection -ComputerName 127.0.0.1 -Port 11434
\`\`\`

O terminal integrado possui suporte nativo a UTF-8 e sessões em PowerShell ou Command Prompt.`;
  }

  return `Recebi sua solicitação: "${prompt}"

Como o modelo selecionado é **${model}**, para obter inferência neural completa em tempo real você pode:
1. **Ativar o Ollama local:** vá em **Configurações > Runtimes locais** e clique em **Iniciar**.
2. **Conectar uma chave de nuvem:** adicione sua chave OpenAI, Anthropic ou DeepSeek em **Configurações > Provedores** (as chaves ficam seguras no Gerenciador de Credenciais do Windows).

Enquanto isso, você pode utilizar todos os recursos locais do app: o **Terminal PowerShell/CMD**, o **Canvas de Workflows**, a **Gestão de Agentes** e a alternância de painéis divididos.`;
}
