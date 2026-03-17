import { NextRequest, NextResponse } from "next/server";
import { CollectionSlug, getPayload } from "payload";
import config from "@/payload.config";
import { get } from "radash";
import { LRUCache } from "lru-cache";

// LRU cache with size limit and TTL
const cache = new LRUCache<string, { value: string | null }>({
  max: 500, // Maximum 500 entries
  ttl: 60000, // 1 minute TTL
});

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

    const cacheKey = `${collectionSlug}:${documentId}:${fieldPath}`;
    const cached = cache.get(cacheKey);

    if (cached !== undefined) {
      return NextResponse.json({ value: cached.value });
    }

    const doc = await payload.findByID({
      collection: collectionSlug,
      id: documentId,
      locale: "en",
      depth: 0,
    });

    if (!doc) {
      return NextResponse.json({ value: null });
    }

    // Navigate to the field using the path (e.g., "title" or "list.0.name")
    const pathParts = fieldPath.split(".");
    let value = doc;

    for (const part of pathParts) {
      if (value === null || value === undefined) {
        cache.set(cacheKey, { value: null });
        return NextResponse.json({ value: null });
      }

      value = get(value, part);
    }

    const result = typeof value === "string" ? value : null;

    cache.set(cacheKey, { value: result });

    return NextResponse.json({ value: result });
  } catch (error) {
    console.error("Failed to fetch English value:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
