import { NextRequest, NextResponse } from "next/server";

const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:8888";

// Only forward these safe headers to the backend
const FORWARD_HEADERS = [
  "accept",
  "accept-language",
  "content-type",
  "authorization",
  "x-request-id",
];

async function proxyRequest(req: NextRequest) {
  const url = new URL(req.url);
  // Forward the full path + query to the backend
  const backendUrl = `${BACKEND_URL}${url.pathname}${url.search}`;

  const headers: Record<string, string> = {};
  // Only forward safe, known headers — tunnel headers cause fetch failures
  for (const key of FORWARD_HEADERS) {
    const value = req.headers.get(key);
    if (value) {
      headers[key] = value;
    }
  }

  try {
    const response = await fetch(backendUrl, {
      method: req.method,
      headers,
      body: req.method !== "GET" && req.method !== "HEAD" ? await req.text() : undefined,
      redirect: "follow",
    });

    const responseHeaders = new Headers();
    for (const [key, value] of response.headers.entries()) {
      if (!["transfer-encoding", "connection"].includes(key.toLowerCase())) {
        responseHeaders.set(key, value);
      }
    }
    // Allow any origin (the proxy is same-origin, CORS is irrelevant)
    responseHeaders.set("Access-Control-Allow-Origin", "*");

    const body = await response.arrayBuffer();
    return new NextResponse(body, {
      status: response.status,
      statusText: response.statusText,
      headers: responseHeaders,
    });
  } catch (error: unknown) {
    const err = error as Error & { cause?: unknown };
    return NextResponse.json(
      {
        error: "Backend unavailable",
        detail: String(error),
        cause: err.cause ? String(err.cause) : undefined,
        url: backendUrl,
      },
      { status: 502 }
    );
  }
}

export async function GET(req: NextRequest) { return proxyRequest(req); }
export async function POST(req: NextRequest) { return proxyRequest(req); }
export async function PUT(req: NextRequest) { return proxyRequest(req); }
export async function PATCH(req: NextRequest) { return proxyRequest(req); }
export async function DELETE(req: NextRequest) { return proxyRequest(req); }
export async function OPTIONS(req: NextRequest) {
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    },
  });
}
