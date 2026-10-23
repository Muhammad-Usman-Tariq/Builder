import * as Y from "yjs";

export interface HistoryManagerOptions {
  trackedOrigins?: Set<any>;
}

/**
 * Wraps Y.UndoManager over all mutable collections in the site document.
 */
export class HistoryManager {
  public readonly undoManager: Y.UndoManager;

  constructor(yDoc: Y.Doc, options: HistoryManagerOptions = {}) {
    const scope = [
      yDoc.getMap("elements"),
      yDoc.getMap("styles"),
      yDoc.getMap("pages"),
      yDoc.getMap("tokens"),
      yDoc.getMap("components"),
    ];

    // By default track user, ai, and template operations as undoable actions
    const trackedOrigins =
      options.trackedOrigins ?? new Set([null, undefined, "user", "ai", "template"]);

    this.undoManager = new Y.UndoManager(scope, {
      trackedOrigins,
    });
  }

  public undo(): void {
    this.undoManager.undo();
  }

  public redo(): void {
    this.undoManager.redo();
  }

  public canUndo(): boolean {
    return this.undoManager.canUndo();
  }

  public canRedo(): boolean {
    return this.undoManager.canRedo();
  }

  public clear(): void {
    this.undoManager.clear();
  }

  public stopCapturing(): void {
    this.undoManager.stopCapturing();
  }
}
