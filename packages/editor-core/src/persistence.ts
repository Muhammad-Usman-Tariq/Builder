import type { SiteDocument } from "@builder/document";
import type { SaveStatus } from "./types.js";

export interface PersistenceManagerOptions {
  debounceMs?: number;
  onSave: (doc: SiteDocument, yjsUpdate?: string) => Promise<void>;
  onStatusChange?: (status: SaveStatus) => void;
}

export class PersistenceManager {
  private timer: NodeJS.Timeout | null = null;
  private readonly debounceMs: number;
  private readonly onSave: (doc: SiteDocument, yjsUpdate?: string) => Promise<void>;
  private readonly onStatusChange?: ((status: SaveStatus) => void) | undefined;
  private latestDoc: SiteDocument | null = null;
  private latestYjsUpdate: string | undefined = undefined;
  private isSaving = false;

  constructor(options: PersistenceManagerOptions) {
    this.debounceMs = options.debounceMs ?? 1000;
    this.onSave = options.onSave;
    this.onStatusChange = options.onStatusChange;
  }

  public scheduleSave(doc: SiteDocument, yjsUpdate?: string): void {
    this.latestDoc = doc;
    this.latestYjsUpdate = yjsUpdate;
    this.onStatusChange?.("unsaved");

    if (this.timer) {
      clearTimeout(this.timer);
    }

    this.timer = setTimeout(() => {
      void this.flush();
    }, this.debounceMs);
  }

  public async flush(): Promise<void> {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }

    if (!this.latestDoc || this.isSaving) return;

    const docToSave = this.latestDoc;
    const updateToSave = this.latestYjsUpdate;
    this.latestDoc = null;
    this.latestYjsUpdate = undefined;
    this.isSaving = true;
    this.onStatusChange?.("saving");

    try {
      await this.onSave(docToSave, updateToSave);
      this.onStatusChange?.("saved");
    } catch (err) {
      console.error("[PersistenceManager] Autosave failed:", err);
      this.onStatusChange?.("error");
      // Put doc back to retry on next tick
      this.latestDoc = docToSave;
      this.latestYjsUpdate = updateToSave;
    } finally {
      this.isSaving = false;
    }
  }

  public destroy(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.latestDoc = null;
  }
}
