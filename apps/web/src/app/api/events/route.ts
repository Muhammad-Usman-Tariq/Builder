import { eq } from "drizzle-orm";
import { db, schema } from "@builder/db";
import {
  createRedisConnection,
  getJobProgressChannel,
  type JobProgressEvent,
  type JobStatus,
} from "@builder/jobs";

export const dynamic = "force-dynamic";

export async function GET(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const jobId = url.searchParams.get("jobId");

  if (!jobId) {
    return new Response(JSON.stringify({ error: "Missing jobId query parameter" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const subscriber = createRedisConnection();

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();

      // 1. Initial snapshot from database
      try {
        const [job] = await db
          .select()
          .from(schema.jobs)
          .where(eq(schema.jobs.id, jobId));

        if (job) {
          const initialEvent: JobProgressEvent = {
            jobId: job.id,
            status: job.status as JobStatus,
            progress: job.progress,
            output: job.output,
            error: job.error ?? undefined,
            timestamp: Date.now(),
          };

          controller.enqueue(encoder.encode(`data: ${JSON.stringify(initialEvent)}\n\n`));

          if (
            job.status === "succeeded" ||
            job.status === "failed" ||
            job.status === "cancelled"
          ) {
            controller.close();
            await subscriber.quit();
            return;
          }
        }
      } catch (err) {
        console.warn(`[SSE] Error fetching initial job status for ${jobId}:`, err);
      }

      // 2. Subscribe to Redis pub/sub channel
      const channel = getJobProgressChannel(jobId);
      await subscriber.subscribe(channel);

      subscriber.on("message", (_ch, message) => {
        try {
          controller.enqueue(encoder.encode(`data: ${message}\n\n`));

          const parsed = JSON.parse(message) as JobProgressEvent;
          if (
            parsed.status === "succeeded" ||
            parsed.status === "failed" ||
            parsed.status === "cancelled"
          ) {
            controller.close();
            subscriber.quit().catch(() => {});
          }
        } catch {
          // ignore streaming encode errors
        }
      });

      // Cleanup on disconnect
      req.signal.addEventListener("abort", () => {
        subscriber.quit().catch(() => {});
      });
    },
    cancel() {
      subscriber.quit().catch(() => {});
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
