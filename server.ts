import express from "express";
import path from "path";
import { GoogleGenAI } from "@google/genai";
import { createServer as createViteServer } from "vite";

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // Health endpoint
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  // Chat API using GoogleGenAI SDK
  app.post("/api/chat", async (req, res) => {
    const { message, systemInstruction, history } = req.body;

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      // Return a professional simulation response if key is not configured
      console.warn("GEMINI_API_KEY is not defined. Simulating agent response.");
      return res.json({
        text: `[MOCK - Adicione a GEMINI_API_KEY nas Configurações para obter respostas reais do Gemini]\n\nEntendi sua solicitação sobre "${message}". Como o Assistente Pessoal, estou pronto para ajudar a automatizar essa tarefa.`,
        modelUsed: "Simulation Mode",
        blocks: [
          {
            type: "action-plan",
            title: "Simulação de Automação",
            steps: [
              { title: "Verificar diretório de trabalho", description: "Analisando caminhos locais", done: true },
              { title: "Executar processamento de IA", description: "Usando inteligência local simulada", done: false }
            ]
          }
        ]
      });
    }

    try {
      const ai = new GoogleGenAI({
        apiKey: apiKey,
        httpOptions: {
          headers: {
            "User-Agent": "aistudio-build",
          },
        },
      });

      // Prepare contents with optional history
      const formattedContents = [];
      if (history && Array.isArray(history)) {
        for (const turn of history) {
          formattedContents.push({
            role: turn.sender === "user" ? "user" : "model",
            parts: [{ text: turn.text }]
          });
        }
      }
      formattedContents.push({
        role: "user",
        parts: [{ text: message }]
      });

      // Define standard model for tasks
      const model = "gemini-3.5-flash";

      const response = await ai.models.generateContent({
        model: model,
        contents: formattedContents,
        config: {
          systemInstruction: systemInstruction || "Você é o Open Assistant, um assistente de desenvolvimento inteligente para macOS. Responda em português de forma clara e profissional.",
          temperature: 0.7,
        }
      });

      const responseText = response.text || "Sem resposta do modelo.";
      
      // Parse any custom interactive blocks if needed, or send as is
      res.json({
        text: responseText,
        modelUsed: "Gemini 3.5 Flash",
        blocks: []
      });

    } catch (error: any) {
      console.error("Gemini API Error:", error);
      res.status(500).json({
        error: "Erro na comunicação com a API do Gemini",
        details: error.message
      });
    }
  });

  // Vite integration
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error("Failed to start server:", err);
});
