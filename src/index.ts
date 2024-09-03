import express from "express";
import { startSock } from "./wa-socket";
import { convertMsToTime } from "./utils";
import { join } from "path";
import { WebSocketServer } from "ws";
import { WSSingleton } from "./singleton";

const app = express();
const port = process.env.PORT || 3000;
const wss = new WebSocketServer({
  port: 8080,
  perMessageDeflate: {
    zlibDeflateOptions: {
      // See zlib defaults.
      chunkSize: 1024,
      memLevel: 7,
      level: 3,
    },
    zlibInflateOptions: {
      chunkSize: 10 * 1024,
    },
    // Other options settable:
    clientNoContextTakeover: true, // Defaults to negotiated value.
    serverNoContextTakeover: true, // Defaults to negotiated value.
    serverMaxWindowBits: 10, // Defaults to negotiated value.
    // Below options specified as default values.
    concurrencyLimit: 10, // Limits zlib concurrency for perf.
    threshold: 1024, // Size (in bytes) below which messages
    // should not be compressed if context takeover is disabled.
  },
});

const timestamp = new Date();

app.get("/check", function (_req, res) {
  const timediff = new Date().getTime() - timestamp.getTime();
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.status(200).send(`Alive for: ${convertMsToTime(timediff)}`);
});

app.post("/clicked", function (_req, res) {
  res.status(200).send(`OK`);
});

app.use("/public", express.static(join(__dirname, "public")));
app.get("/", (_req, res) => {
  res.sendFile(join(__dirname, "index.html"));
});

app.all("*", function (_req, res) {
  res.redirect("/");
});

app.listen(port, async () => {
  console.log(`Server running at http://localhost:${port}`);
  const socket = await startSock();

  wss.on("connection", function connection(ws) {
    console.log("selamat datang di indomaret");

    socket.ev.process(async (events) => {
      const singleton = new WSSingleton(events, ws);
      await singleton.start();
    });

    ws.on("error", console.error);

    ws.on("message", function message(data) {
      console.log("received: %s", data);
    });

    ws.send("something");
  });
});
