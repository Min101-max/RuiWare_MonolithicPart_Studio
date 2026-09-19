import { describe, expect, it } from "vitest";
import { draftEventNeedsSync, parseDraftChangedEvent } from "./draftSyncChannel";

describe("draft sync events", () => {
  it("parses a valid draft.changed payload", () => {
    expect(parseDraftChangedEvent(JSON.stringify({ draftId: "draft-1", revision: 4, actor: "agent", summary: { parameters: [] } }))).toEqual({
      draftId: "draft-1",
      revision: 4,
      actor: "agent",
      summary: undefined,
    });
  });

  it("keeps a valid business change summary from the event", () => {
    const event = parseDraftChangedEvent(JSON.stringify({
      draftId: "draft-1",
      revision: 4,
      actor: "agent",
      summary: {
        fromRevision: 3,
        toRevision: 4,
        parameters: [],
        rules: [],
        sketch: { changed: true, parts: ["entities"] },
        affectedStages: ["baseSketch"],
      },
    }));
    expect(event?.summary?.sketch.parts).toEqual(["entities"]);
    expect(event?.summary?.affectedStages).toEqual(["baseSketch"]);
  });

  it("ignores malformed or incomplete payloads", () => {
    expect(parseDraftChangedEvent("not-json")).toBeNull();
    expect(parseDraftChangedEvent(JSON.stringify({ draftId: "draft-1", revision: 0 }))).toBeNull();
  });

  it("only accepts a newer event for the selected draft", () => {
    expect(draftEventNeedsSync("draft-1", 3, { draftId: "draft-1", revision: 4 })).toBe(true);
    expect(draftEventNeedsSync("draft-1", 4, { draftId: "draft-1", revision: 4 })).toBe(false);
    expect(draftEventNeedsSync("draft-2", 3, { draftId: "draft-1", revision: 4 })).toBe(false);
  });
});
