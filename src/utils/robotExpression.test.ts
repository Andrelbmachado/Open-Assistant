import { describe, expect, it } from "vitest";
import { detectSpeechExpression, robotPose } from "./robotExpression";

describe("robot expression", () => {
  it("detecta as variações a partir do texto falado", () => {
    expect(detectSpeechExpression("Claro, posso ajudar com isso.")).toBe("talking");
    expect(detectSpeechExpression("ISSO É INCRÍVEL, VAMOS LÁ")).toBe("shouting");
    expect(detectSpeechExpression("Que ótimo!!! Deu certo!")).toBe("shouting");
    expect(detectSpeechExpression("Isso é absurdo, fiquei com raiva.")).toBe("angry");
    expect(detectSpeechExpression("Vou te contar baixinho um segredo.")).toBe("whisper");
    expect(detectSpeechExpression("Respire fundo, sem pressa.")).toBe("calm");
    expect(detectSpeechExpression("Rápido, é urgente!")).toBe("fast");
  });

  it("fica vermelho quando bravo e no erro", () => {
    expect(robotPose("speaking", "angry").colorA[0]).toBeGreaterThan(.9);
    expect(robotPose("error", "idle").rim[0]).toBeGreaterThan(.9);
  });

  it("só abre a boca enquanto fala e grita mais do que sussurra", () => {
    expect(robotPose("idle", "talking").mouthAmp).toBe(0);
    expect(robotPose("listening", "talking").mouthAmp).toBe(0);
    expect(robotPose("speaking", "shouting").mouthAmp).toBeGreaterThan(robotPose("speaking", "whisper").mouthAmp);
    expect(robotPose("speaking", "fast").syllableHz).toBeGreaterThan(robotPose("speaking", "calm").syllableHz);
  });
});
