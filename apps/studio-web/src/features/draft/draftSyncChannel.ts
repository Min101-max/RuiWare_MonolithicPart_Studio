import { useEffect, useRef } from "react";
import { api } from "../../api";

export type DraftChangedEvent = {
  draftId: string;
  revision: number;
  actor?: string;
  source?: string;
  operation?: string;
  summary?: DraftChangeSummary;
};

export type DraftChangeItem = {
  id: string;
  label: string;
  changeType: "added" | "removed" | "updated";
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
};

export type DraftChangeSummary = {
  fromRevision: number | null;
  toRevision: number;
  parameters: DraftChangeItem[];
  rules: DraftChangeItem[];
  sketch: { changed: boolean; parts: string[] };
  affectedStages: string[];
};

export function parseDraftChangedEvent(data: string): DraftChangedEvent | null {
  try {
    const payload: unknown = JSON.parse(data);
    if (
      !payload ||
      typeof payload !== "object" ||
      typeof (payload as { draftId?: unknown }).draftId !== "string" ||
      !Number.isInteger((payload as { revision?: unknown }).revision) ||
      ((payload as { revision: number }).revision ?? 0) < 1
    ) {
      return null;
    }
    return {
      draftId: (payload as { draftId: string }).draftId,
      revision: (payload as { revision: number }).revision,
      actor: typeof (payload as { actor?: unknown }).actor === "string" ? (payload as { actor: string }).actor : undefined,
      source: typeof (payload as { source?: unknown }).source === "string" ? (payload as { source: string }).source : undefined,
      operation: typeof (payload as { operation?: unknown }).operation === "string" ? (payload as { operation: string }).operation : undefined,
      summary: parseDraftChangeSummary((payload as { summary?: unknown }).summary),
    };
  } catch {
    return null;
  }
}

function parseDraftChangeSummary(value: unknown): DraftChangeSummary | undefined {
  if (!value || typeof value !== "object") return undefined;
  const summary = value as Partial<DraftChangeSummary>;
  if (!Array.isArray(summary.parameters) || !Array.isArray(summary.rules) || !summary.sketch || !Array.isArray(summary.affectedStages)) return undefined;
  return {
    fromRevision: typeof summary.fromRevision === "number" ? summary.fromRevision : null,
    toRevision: typeof summary.toRevision === "number" ? summary.toRevision : 0,
    parameters: summary.parameters as DraftChangeItem[],
    rules: summary.rules as DraftChangeItem[],
    sketch: summary.sketch as DraftChangeSummary["sketch"],
    affectedStages: summary.affectedStages.filter((stage): stage is string => typeof stage === "string"),
  };
}

export function draftEventNeedsSync(selectedDraftId: string, localRevision: number, event: DraftChangedEvent): boolean {
  return event.draftId === selectedDraftId && event.revision > localRevision;
}

type DraftSyncChannelOptions = {
  draftId: string | null;
  revision: number;
  onDraftChanged: (event: DraftChangedEvent) => void;
  onStatus?: (status: "connecting" | "connected" | "disconnected") => void;
};

export function useDraftSyncChannel({ draftId, revision, onDraftChanged, onStatus }: DraftSyncChannelOptions) {
  const revisionRef = useRef(revision);
  const onDraftChangedRef = useRef(onDraftChanged);
  const onStatusRef = useRef(onStatus);
  revisionRef.current = revision;
  onDraftChangedRef.current = onDraftChanged;
  onStatusRef.current = onStatus;

  useEffect(() => {
    if (!draftId) return;
    const eventSource = new EventSource(api.draftEventsUrl(draftId));
    onStatusRef.current?.("connecting");

    const handleOpen = () => onStatusRef.current?.("connected");
    const handleError = () => onStatusRef.current?.("disconnected");
    const handleDraftChanged = (event: Event) => {
      const changed = parseDraftChangedEvent((event as MessageEvent<string>).data);
      if (changed && draftEventNeedsSync(draftId, revisionRef.current, changed)) {
        onDraftChangedRef.current(changed);
      }
    };

    eventSource.addEventListener("open", handleOpen);
    eventSource.addEventListener("error", handleError);
    eventSource.addEventListener("draft.changed", handleDraftChanged);
    return () => {
      eventSource.removeEventListener("open", handleOpen);
      eventSource.removeEventListener("error", handleError);
      eventSource.removeEventListener("draft.changed", handleDraftChanged);
      eventSource.close();
    };
  }, [draftId]);
}
