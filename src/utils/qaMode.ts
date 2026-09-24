export interface OfflineQAReply {
  text: string;
  source: "QA Offline Simulator";
}

export function isQAOffline(): boolean {
  return import.meta.env.VITE_QA_OFFLINE === "true";
}

export function createOfflineQAReply(prompt: string, modelName: string): OfflineQAReply {
  const normalized = prompt.toLowerCase();

  if (normalized.includes("erro qa")) throw new Error("Falha simulada do modo QA offline");

  if (normalized.includes("código") || normalized.includes("codigo")) {
    return {
      source: "QA Offline Simulator",
      text: `Resposta simulada para ${modelName}.\n\n\`\`\`ts\nconst workspaceStatus = "qa-offline";\nconsole.log(workspaceStatus);\n\`\`\``,
    };
  }

  if (normalized.includes("multilinha")) {
    return {
      source: "QA Offline Simulator",
      text: "Resposta simulada em múltiplas linhas.\n\n• Primeiro resultado\n• Segundo resultado\n• Terceiro resultado",
    };
  }

  return {
    source: "QA Offline Simulator",
    text: `Resposta simulada localmente para: "${prompt}". Nenhuma API, credencial ou runtime externo foi usado.`,
  };
}
