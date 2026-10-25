import express from "express";
import { defineRoom, defineServer } from "colyseus";
import { join } from "node:path";
import { MidnightRoom } from "./room.js";

const port = Number(process.env.PORT ?? 2567);
const distDir = join(process.cwd(), "dist");
const server = defineServer({
  rooms: { midnight: defineRoom(MidnightRoom) },
  express: (app) => {
    app.get("/health", (_req, res) => res.json({ ok: true, game: "Midnight Escape" }));
    if (process.env.NODE_ENV === "production") {
      app.use(express.static(distDir));
      app.get(/.*/, (_req, res) => res.sendFile(join(distDir, "index.html")));
    }
  },
});
server.listen(port).then(() => console.log("Midnight Escape server listening on " + port));
