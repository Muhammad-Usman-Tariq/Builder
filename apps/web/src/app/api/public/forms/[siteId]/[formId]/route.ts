import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { db, schema } from "@builder/db";
import { getSharedRedis } from "@builder/jobs";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Accept",
};

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: CORS_HEADERS,
  });
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ siteId: string; formId: string }> }
) {
  try {
    const { siteId, formId } = await params;

    if (!siteId || !formId) {
      return NextResponse.json(
        { error: "siteId and formId are required" },
        { status: 400, headers: CORS_HEADERS }
      );
    }

    // 1. Rate limiting via Redis sliding window (5 submissions / 60 seconds per IP & form)
    const forwarded = req.headers.get("x-forwarded-for");
    const clientIp =
      (forwarded ? forwarded.split(",")[0]?.trim() : null) ||
      req.headers.get("x-real-ip") ||
      "127.0.0.1";

    try {
      const redis = getSharedRedis();
      const windowMs = 60000;
      const now = Date.now();
      const clearBefore = now - windowMs;
      const rateLimitKey = `ratelimit:form:${siteId}:${formId}:${clientIp}`;

      await redis.zremrangebyscore(rateLimitKey, 0, clearBefore);
      const count = await redis.zcard(rateLimitKey);

      if (count >= 5) {
        return NextResponse.json(
          { error: "Too many submissions. Please wait a minute before submitting again." },
          { status: 429, headers: CORS_HEADERS }
        );
      }

      await redis.zadd(rateLimitKey, now, `${now}-${Math.random()}`);
      await redis.pexpire(rateLimitKey, windowMs);
    } catch (rErr) {
      console.warn("[Form Submission Rate Limit] Redis check skipped:", rErr);
    }

    // 2. Verify site exists
    const [site] = await db
      .select()
      .from(schema.sites)
      .where(eq(schema.sites.id, siteId));

    if (!site) {
      return NextResponse.json(
        { error: "Site not found" },
        { status: 404, headers: CORS_HEADERS }
      );
    }

    // 3. Parse request payload
    let rawData: Record<string, unknown> = {};
    const contentType = req.headers.get("content-type") || "";

    if (contentType.includes("application/json")) {
      rawData = (await req.json()) as Record<string, unknown>;
    } else if (
      contentType.includes("application/x-www-form-urlencoded") ||
      contentType.includes("multipart/form-data")
    ) {
      const formData = await req.formData();
      formData.forEach((value, key) => {
        rawData[key] = value.toString();
      });
    } else {
      try {
        rawData = (await req.json()) as Record<string, unknown>;
      } catch {
        return NextResponse.json(
          { error: "Unsupported Content-Type" },
          { status: 415, headers: CORS_HEADERS }
        );
      }
    }

    // 4. Honeypot spam check
    const honeypotKeys = ["_gotcha", "_hp", "honeypot", "_honey"];
    let spamScore = 0;
    const cleanData: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(rawData)) {
      if (honeypotKeys.includes(key.toLowerCase())) {
        if (value && String(value).trim() !== "") {
          spamScore = 100;
        }
      } else {
        cleanData[key] = value;
      }
    }

    // 5. Save submission in DB
    const submissionId = randomUUID();
    await db.insert(schema.formSubmissions).values({
      id: submissionId,
      siteId,
      formId,
      data: cleanData,
      spamScore,
    });

    // 6. Email notification dispatch based on EMAIL_PROVIDER
    const emailProvider = process.env.EMAIL_PROVIDER || "none";
    const recipient = process.env.EMAIL_FROM || "admin@example.com";

    if (emailProvider === "resend" && process.env.RESEND_API_KEY) {
      try {
        await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            from: process.env.EMAIL_FROM || "noreply@example.com",
            to: recipient,
            subject: `New form submission: ${site.name} (${formId})`,
            html: `<p>New submission received for form <strong>${formId}</strong> on site <strong>${site.name}</strong>:</p><pre>${JSON.stringify(cleanData, null, 2)}</pre>`,
          }),
        });
      } catch (err) {
        console.error("[Form Submission] Failed to send email via Resend:", err);
      }
    } else if (emailProvider === "smtp" && process.env.SMTP_HOST) {
      try {
        const nodemailer = await import("nodemailer");
        const transporter = nodemailer.createTransport({
          host: process.env.SMTP_HOST,
          port: Number(process.env.SMTP_PORT || 587),
          secure: Number(process.env.SMTP_PORT || 587) === 465,
          auth: process.env.SMTP_USER
            ? {
                user: process.env.SMTP_USER,
                pass: process.env.SMTP_PASS,
              }
            : undefined,
        });

        await transporter.sendMail({
          from: process.env.EMAIL_FROM || "noreply@example.com",
          to: recipient,
          subject: `New form submission: ${site.name} (${formId})`,
          text: `New submission received for form ${formId} on site ${site.name}:\n\n${JSON.stringify(cleanData, null, 2)}`,
        });
      } catch (err) {
        console.error("[Form Submission] Failed to send email via SMTP:", err);
      }
    } else {
      console.log(
        `[Form Submission] [Site: ${siteId}, Form: ${formId}] Submission recorded (provider: ${emailProvider}):`,
        JSON.stringify(cleanData)
      );
    }

    return NextResponse.json(
      { ok: true, submissionId },
      { status: 200, headers: CORS_HEADERS }
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error";
    console.error("[Form Submission API Error]:", message);
    return NextResponse.json(
      { error: "Failed to process form submission" },
      { status: 500, headers: CORS_HEADERS }
    );
  }
}
