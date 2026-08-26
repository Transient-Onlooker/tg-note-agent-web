import { Hono } from "hono";
import { cors } from "hono/cors";

const app = new Hono();

app.use(
  "/api/*",
  cors({
    origin: [
      "http://localhost:5173",
      "https://transient-onlooker.github.io"
    ],
    allowMethods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type"]
  })
);

app.get("/health", (c) => {
  return c.json({
    ok: true,
    service: "note-relay-api"
  });
});

app.get("/api/health", (c) => {
  return c.json({
    ok: true,
    service: "note-relay-api"
  });
});

export default app;
