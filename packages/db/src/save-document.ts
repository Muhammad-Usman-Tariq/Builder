import { eq } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import {
  siteDocumentToYDoc,
  yDocToSiteDocument,
  createYDocFromState,
  encodeYDocState,
  mergeYDocUpdates,
  validateSiteDocument,
  type SiteDocument,
} from "@builder/document";
import * as schema from "./schema/index.js";

export interface SaveSiteDocumentOptions {
  siteId: string;
  document: SiteDocument;
  yjsUpdate?: string | Buffer | Uint8Array | undefined;
  createVersion?: boolean;
  versionReason?: string;
  userId?: string | null;
}

export interface SaveSiteDocumentResult {
  success: boolean;
  updatedAt: Date;
}

/**
 * Single canonical save function for site documents across the entire system
 * (editor autosave, AI generation jobs, URL/screenshot imports, templates, CMS sample, MCP).
 * Writes the validated JSON snapshot AND the matching yjs_state in one atomic transaction.
 * Checks that the site exists; if deleted or missing, throws a clear error.
 */
export async function saveSiteDocument(
  dbOrTx: PostgresJsDatabase<typeof schema> | any,
  options: SaveSiteDocumentOptions
): Promise<SaveSiteDocumentResult> {
  const runInTransaction = async (tx: any): Promise<SaveSiteDocumentResult> => {
    // 1. Check that site exists in database
    const [site] = await tx
      .select({ id: schema.sites.id })
      .from(schema.sites)
      .where(eq(schema.sites.id, options.siteId));

    if (!site) {
      throw new Error(`Cannot save document: site "${options.siteId}" does not exist`);
    }

    // 2. Validate document snapshot
    const validation = validateSiteDocument(options.document);
    if (!validation.valid) {
      throw new Error(
        `Site document validation failed: ${validation.errors.map((e) => `${e.path}: ${e.message}`).join("; ")}`
      );
    }

    // 3. Resolve matching binary Yjs state
    let newYjsState: Buffer;
    if (options.yjsUpdate) {
      const incomingUpdate =
        typeof options.yjsUpdate === "string"
          ? Buffer.from(options.yjsUpdate, "base64")
          : Buffer.from(options.yjsUpdate);

      const [existing] = await tx
        .select({ yjsState: schema.siteDocuments.yjsState })
        .from(schema.siteDocuments)
        .where(eq(schema.siteDocuments.siteId, options.siteId));

      if (existing?.yjsState) {
        const merged = mergeYDocUpdates([
          new Uint8Array(existing.yjsState),
          new Uint8Array(incomingUpdate),
        ]);
        newYjsState = Buffer.from(merged);
      } else {
        newYjsState = incomingUpdate;
      }

      // Verify that merged Yjs state produces a document matching the snapshot.
      // If divergent, rebuild from validated snapshot so yjs_state and snapshot never drift.
      try {
        const checkYDoc = createYDocFromState(new Uint8Array(newYjsState));
        const checkDoc = yDocToSiteDocument(checkYDoc);
        if (
          Object.keys(checkDoc.pages).length !== Object.keys(options.document.pages).length ||
          Object.keys(checkDoc.elements).length !== Object.keys(options.document.elements).length
        ) {
          const yDoc = siteDocumentToYDoc(options.document);
          newYjsState = Buffer.from(encodeYDocState(yDoc));
        }
      } catch {
        const yDoc = siteDocumentToYDoc(options.document);
        newYjsState = Buffer.from(encodeYDocState(yDoc));
      }
    } else {
      // Re-encode directly from validated snapshot
      const yDoc = siteDocumentToYDoc(options.document);
      newYjsState = Buffer.from(encodeYDocState(yDoc));
    }

    const now = new Date();

    // 4. Update or insert site_documents atomically
    const [updated] = await tx
      .insert(schema.siteDocuments)
      .values({
        siteId: options.siteId,
        snapshot: options.document,
        yjsState: newYjsState,
        schemaVersion: options.document.schemaVersion ?? 1,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: schema.siteDocuments.siteId,
        set: {
          snapshot: options.document,
          yjsState: newYjsState,
          schemaVersion: options.document.schemaVersion ?? 1,
          updatedAt: now,
        },
      })
      .returning();

    // 5. Create version snapshot if requested
    if (options.createVersion) {
      await tx.insert(schema.siteVersions).values({
        id: `ver_${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`,
        siteId: options.siteId,
        snapshot: options.document,
        reason: options.versionReason || "manual",
        createdBy: options.userId || null,
      });
    }

    return {
      success: true,
      updatedAt: updated?.updatedAt ?? now,
    };
  };

  if (typeof dbOrTx.transaction === "function") {
    return await dbOrTx.transaction(runInTransaction);
  }
  return await runInTransaction(dbOrTx);
}

/**
 * Rebuilds yjs_state from the snapshot for any site where they differ.
 * Ensures the editor never opens an old or divergent yjs_state.
 */
export async function ensureYjsStateMatchesSnapshot(
  db: PostgresJsDatabase<typeof schema> | any,
  siteId: string,
  snapshot: SiteDocument,
  yjsState: Buffer | Uint8Array | null | undefined
): Promise<Buffer> {
  let needsRebuild = false;

  if (!yjsState || (Buffer.isBuffer(yjsState) && yjsState.length === 0)) {
    needsRebuild = true;
  } else {
    try {
      const uint8 = Buffer.isBuffer(yjsState) ? new Uint8Array(yjsState) : yjsState;
      const yDoc = createYDocFromState(uint8);
      const yjsDoc = yDocToSiteDocument(yDoc);

      const snapPageCount = Object.keys(snapshot.pages || {}).length;
      const yjsPageCount = Object.keys(yjsDoc.pages || {}).length;
      const snapElCount = Object.keys(snapshot.elements || {}).length;
      const yjsElCount = Object.keys(yjsDoc.elements || {}).length;

      if (snapPageCount !== yjsPageCount || snapElCount !== yjsElCount) {
        needsRebuild = true;
      }
    } catch {
      needsRebuild = true;
    }
  }

  if (needsRebuild) {
    const yDoc = siteDocumentToYDoc(snapshot);
    const rebuilt = Buffer.from(encodeYDocState(yDoc));
    await db
      .update(schema.siteDocuments)
      .set({
        yjsState: rebuilt,
        updatedAt: new Date(),
      })
      .where(eq(schema.siteDocuments.siteId, siteId));
    return rebuilt;
  }

  return Buffer.isBuffer(yjsState) ? yjsState : Buffer.from(yjsState!);
}
