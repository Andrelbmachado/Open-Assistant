import { describe, expect, it } from "vitest";
import {
  DEFAULT_ORBITAL_SKIN,
  activityLabel,
  getOrbitalMotion,
  isOrbitalSkin,
  nextOrbitalState,
  shouldProcessVoiceTranscript,
  simulatedAudioLevel,
} from "./orbitalState";

describe("orbital state", () => {
  it("uses the robot face as the persisted default skin", () => {
    expect(DEFAULT_ORBITAL_SKIN).toBe("robot");
    expect(isOrbitalSkin(DEFAULT_ORBITAL_SKIN)).toBe(true);
  });

  it("rejects an unknown restored skin", () => {
    expect(isOrbitalSkin("nebula")).toBe(false);
    expect(isOrbitalSkin("super")).toBe(true);
  });

  it("maps the voice conversation lifecycle to visible states", () => {
    expect(nextOrbitalState("voice-start")).toBe("listening");
    expect(nextOrbitalState("request-start")).toBe("processing");
    expect(nextOrbitalState("speech-start")).toBe("speaking");
    expect(nextOrbitalState("speech-end")).toBe("idle");
  });

  it("exposes Portuguese labels for every active state", () => {
    expect(activityLabel("idle")).toBe("Pode falar");
    expect(activityLabel("listening")).toBe("Ouvindo…");
    expect(activityLabel("processing")).toBe("Pensando…");
    expect(activityLabel("speaking")).toBe("Falando…");
    expect(activityLabel("error")).toBe("Algo deu errado");
  });

  it("provides a deterministic QA signal within the drawable range", () => {
    expect(simulatedAudioLevel("speaking", 1000)).toBe(simulatedAudioLevel("speaking", 1000));
    expect(simulatedAudioLevel("idle", 1000)).toBeLessThanOrEqual(0.2);
    expect(simulatedAudioLevel("listening", 1000)).toBeGreaterThan(0.05);
  });

  it("gives every skin a distinct speaking motion profile", () => {
    const sphere = getOrbitalMotion("sphere", "speaking", .7);
    const atom = getOrbitalMotion("atom", "speaking", .7);
    const tentacles = getOrbitalMotion("tentacles", "speaking", .7);

    expect(sphere.geometry).toBe("wave");
    expect(atom.geometry).toBe("orbit");
    expect(tentacles.geometry).toBe("tentacle");
    expect(tentacles.intensity).toBeGreaterThan(sphere.intensity);
  });

  it("does not replace a voice error with an end-of-recognition transition", () => {
    expect(shouldProcessVoiceTranscript(true, "uma frase" )).toBe(false);
    expect(shouldProcessVoiceTranscript(false, "")).toBe(false);
    expect(shouldProcessVoiceTranscript(false, "uma frase")).toBe(true);
  });
});
