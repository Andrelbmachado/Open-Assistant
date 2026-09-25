import { describe, expect, it } from "vitest";
import { findMention } from "./composerMentions";

describe("findMention", () => {
  it("opens the skill menu on / and the connector menu on @", () => {
    expect(findMention("/con", 4)).toEqual({ kind: "skill", query: "con", start: 0 });
    expect(findMention("use o @fe", 9)).toEqual({ kind: "mcp", query: "fe", start: 6 });
    expect(findMention("@", 1)).toEqual({ kind: "mcp", query: "", start: 0 });
  });

  it("ignores URLs, e-mails and text after the caret", () => {
    expect(findMention("https://x.com/a", 15)).toBeUndefined();
    expect(findMention("andre@ymail.com", 15)).toBeUndefined();
    expect(findMention("/controle depois", 16)).toBeUndefined();
  });
});
