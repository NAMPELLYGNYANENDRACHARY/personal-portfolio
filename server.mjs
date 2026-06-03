import { createServer } from "node:http";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));
const port = 5500;
const types = {
  ".html": "text/html; charset=utf-8",
  ".css":  "text/css; charset=utf-8",
  ".js":   "text/javascript; charset=utf-8",
  ".mjs":  "text/javascript; charset=utf-8",
  ".pdf":  "application/pdf",
  ".jpg":  "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png":  "image/png",
  ".webp": "image/webp",
  ".svg":  "image/svg+xml",
  ".ico":  "image/x-icon",
};

createServer(async (request, response) => {
  if (request.method === "OPTIONS") {
    response.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    });
    response.end();
    return;
  }

  if (request.method === "POST" && request.url.split("?")[0] === "/api/contact") {
    await handleContactRequest(request, response);
    return;
  }

  try {
    const requestPath = decodeURIComponent(request.url.split("?")[0]);
    const filePath = path.normalize(path.join(root, requestPath === "/" ? "index.html" : requestPath));

    if (!filePath.startsWith(root)) {
      response.writeHead(403);
      response.end("Forbidden");
      return;
    }

    const data = await readFile(filePath);
    response.writeHead(200, {
      "Content-Type": types[path.extname(filePath).toLowerCase()] || "application/octet-stream",
    });
    response.end(data);
  } catch {
    response.writeHead(404);
    response.end("Not found");
  }
}).listen(port, "127.0.0.1", () => {
  console.log(`Portfolio running at http://127.0.0.1:${port}`);
});

async function handleContactRequest(request, response) {
  try {
    const body = await readBody(request);
    const contentType = request.headers["content-type"] || "";
    const data = contentType.includes("application/json")
      ? JSON.parse(body || "{}")
      : Object.fromEntries(new URLSearchParams(body));

    const name = clean(data.name);
    const email = clean(data.email);
    const subject = clean(data.subject);
    const message = clean(data.message);

    if (!name || !email || !subject || !message) {
      sendResult(request, response, 400, {
        success: false,
        message: "Please send name, email, subject, and message.",
      });
      return;
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      sendResult(request, response, 400, {
        success: false,
        message: "Please send a valid email address.",
      });
      return;
    }

    console.log("New contact message:", { name, email, subject, message });

    // Save message locally to a JSON file
    const messagesPath = path.join(root, "messages.json");
    let messages = [];
    try {
      const existingData = await readFile(messagesPath, "utf-8");
      messages = JSON.parse(existingData || "[]");
    } catch {
      // File doesn't exist or is empty
    }
    messages.push({
      timestamp: new Date().toISOString(),
      name,
      email,
      subject,
      message,
    });
    try {
      await writeFile(messagesPath, JSON.stringify(messages, null, 2), "utf-8");
    } catch (writeError) {
      console.error("Failed to write to messages.json:", writeError);
    }

    sendResult(request, response, 200, {
      success: true,
      message: "Message received successfully.",
      data: { name, email, subject, message },
    });
  } catch (error) {
    console.error(error);
    sendResult(request, response, 500, {
      success: false,
      message: "Request could not be processed.",
    });
  }
}

function readBody(request) {
  return new Promise((resolve, reject) => {
    let body = "";

    request.on("data", (chunk) => {
      body += chunk;

      if (body.length > 10000) {
        reject(new Error("Request body is too large."));
        request.destroy();
      }
    });

    request.on("end", () => resolve(body));
    request.on("error", reject);
  });
}

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
  });
  response.end(JSON.stringify(payload));
}

function sendResult(request, response, statusCode, payload) {
  const acceptsHtml = (request.headers.accept || "").includes("text/html");

  if (!acceptsHtml) {
    sendJson(response, statusCode, payload);
    return;
  }

  response.writeHead(statusCode, {
    "Content-Type": "text/html; charset=utf-8",
  });
  response.end(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${payload.success ? "Message Sent" : "Message Error"}</title>
  <style>
    body{margin:0;min-height:100vh;display:grid;place-items:center;background:#15120f;color:#f7f4ef;font-family:Arial,sans-serif}
    main{width:min(92vw,520px);padding:32px;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.14)}
    h1{margin:0 0 12px;font-size:2rem}p{color:rgba(247,244,239,.72);line-height:1.6}
    a{display:inline-flex;margin-top:18px;color:#f7f4ef;background:#c8502a;padding:12px 18px;text-decoration:none;font-weight:700}
  </style>
</head>
<body>
  <main>
    <h1>${payload.success ? "Message sent" : "Could not send message"}</h1>
    <p>${escapeHtml(payload.message)}</p>
    <a href="/">Back to portfolio</a>
  </main>
</body>
</html>`);
}

function clean(value) {
  return String(value || "").trim();
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
