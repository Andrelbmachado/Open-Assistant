/** Artifacts: versioned, editable outputs. */

export type ArtifactKind =
  | "document"
  | "pdf"
  | "presentation"
  | "spreadsheet"
  | "code"
  | "website"
  | "report"
  | "image"
  | "video";

export interface ArtifactVersion {
  version: number;
  content: string; // text or a reference/URI for binary kinds
  at: number;
  authorAgentId?: string;
}

export interface Artifact {
  id: string;
  kind: ArtifactKind;
  title: string;
  current: ArtifactVersion;
  history: ArtifactVersion[];
  shareable?: boolean;
}
