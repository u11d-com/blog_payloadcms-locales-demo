import { NextRequest, NextResponse } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";

export async function POST(request: NextRequest) {
  try {
    const payload = await getPayload({ config });

    const cookies = request.cookies;
    const payloadToken = cookies.get("payload-token");

    if (!payloadToken) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
      const { user } = await payload.auth({ headers: request.headers });
      if (!user) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
    } catch (authError) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { documentId, locales, force } = body;

    if (!documentId || !locales) {
      return NextResponse.json(
        {
          error: "Missing required fields: documentId, locales",
        },
        { status: 400 },
      );
    }

    if (!Array.isArray(locales) || locales.length === 0) {
      return NextResponse.json(
        { error: "locales must be a non-empty array" },
        { status: 400 },
      );
    }

    const job = await payload.jobs.queue({
      task: "translateResource",
      input: {
        documentId,
        locales: locales.map((locale: string) => ({ locale })),
        force: force || false,
      },
      queue: "translation",
    });

    console.log(
      `Translation job queued: ${job.id} for resources:${documentId}`,
      { locales },
    );

    return NextResponse.json({
      success: true,
      jobId: job.id,
      message: "Translation job queued successfully",
    });
  } catch (error) {
    console.error("Failed to queue translation job:", error);
    return NextResponse.json(
      {
        error: "Internal server error",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
