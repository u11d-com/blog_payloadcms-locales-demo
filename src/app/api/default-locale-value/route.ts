import { NextRequest, NextResponse } from "next/server";
import { unstable_cacheLife as cacheLife } from "next/cache";
import { CollectionSlug, getPayload } from "payload";
import config from "@/payload.config";
import { get } from "radash";

async function getDefaultLocaleValue(
  collectionSlug: CollectionSlug,
  documentId: string,
  fieldPath: string,
) {
  "use cache";
  cacheLife("minutes");

  const payload = await getPayload({ config });

  const doc = await payload.findByID({
    collection: collectionSlug,
    id: documentId,
    locale: "en",
    depth: 0,
  });

  if (!doc) {
    return null;
  }

  const pathParts = fieldPath.split(".");
  let value = doc;

  for (const part of pathParts) {
    if (value === null || value === undefined) {
      return null;
    }

    value = get(value, part);
  }

  return typeof value === "string" ? value : null;
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const collectionSlug = searchParams.get("collectionSlug") as CollectionSlug;
    const documentId = searchParams.get("documentId");
    const fieldPath = searchParams.get("fieldPath");

    if (!collectionSlug || !documentId || !fieldPath) {
      return NextResponse.json(
        { error: "Missing required parameters" },
        { status: 400 },
      );
    }

    const cookies = request.cookies;
    const payloadToken = cookies.get("payload-token");

    if (!payloadToken) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const payload = await getPayload({ config });

    try {
      const { user } = await payload.auth({ headers: request.headers });
      if (!user) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }

      const value = await getDefaultLocaleValue(
        collectionSlug,
        documentId,
        fieldPath,
      );

      return NextResponse.json({ value });
    } catch (authError) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  } catch (error) {
    console.error("Failed to fetch English value:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
