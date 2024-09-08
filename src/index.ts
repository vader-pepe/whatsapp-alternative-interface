import express from "express";
import { Socket, startSock, store } from "./wa-socket";
import { convertMsToTime } from "./utils";
import { WebSocket, WebSocketServer } from "ws";
import cors from "cors";
import { proto } from "@whiskeysockets/baileys";

const app = express();
const port = process.env.PORT || 3000;
export const wss = new WebSocketServer({
  port: 8081,
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

let currentConnection: WebSocket | null;
let s: Socket | null;
wss.on("connection", async function connection(ws) {
  console.log("selamat datang di indomaret");
  if (!s) {
    s = await startSock();
  }
  ws.send(JSON.stringify({ state: s.authState.creds }, undefined, 2));
  if (currentConnection) {
    if (currentConnection.readyState !== WebSocket.CLOSED) {
      console.log("Closing previous connection...");
      currentConnection.terminate(); // Force close the connection
      currentConnection = null;
    } else {
      console.log("Previous connection already closed.");
    }
  }
  currentConnection = ws;

  ws.on("error", console.error);

  ws.on("message", function message(data) {
    console.log("received: %s", data);
  });

  ws.on("close", () => {
    console.log("Connection closed.");
    if (s) {
      s.end(new Error("Socket Closed"));
    }
    if (currentConnection === ws) {
      currentConnection = null; // Clear the current connection if it was this one
    }
  });
});

const timestamp = new Date();

app.use(cors({}));
app.get("/", function(_req, res) {
  const timediff = new Date().getTime() - timestamp.getTime();
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.status(200).send(`Alive for: ${convertMsToTime(timediff)}`);
});

app.get("/chats", async function(_req, res) {
  if (!store) {
    return res.status(404).send("No Data");
  }

  const chats = store.chats.all();

  if (!chats) {
    return res.status(404).send("No Chats Found");
  }

  chats.forEach((chat) => {
    const messages = store!.messages[chat.id]?.array;

    if (messages && messages.length > 0) {
      const latestMessage = messages[messages.length - 1];

      // Reset the chat messages and push the latest message
      chat.messages = [
        {
          message: latestMessage,
        },
      ];
    }
  });

  return res.status(200).json({ chats });
});

app.get("/messages/:id", async function(req, res) {
  const chatId = req.params.id;

  if (!store) {
    return res.status(404).send("No Data");
  }

  const chat = store.chats.get(chatId);
  const messages = store.messages[chatId];

  if (!chat) {
    return res.status(404).send("Chat Not Found");
  }

  return res.status(200).json({ messages });
});

app.get("/contacts", async function(_req, res) {
  const contacts = store?.contacts;
  if (contacts) {
    return res.status(200).json({ contacts });
  }
  return res.status(404).send("No Data");
});

app.post("/clicked", function(_req, res) {
  res.status(200).send(`OK`);
});

app.all("*", function(_req, res) {
  res.redirect("/");
});

app.listen(port, async () => {
  console.log(`Server running at http://localhost:${port}`);
});
