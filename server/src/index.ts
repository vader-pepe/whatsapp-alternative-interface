import express from "express";
import path from "path";
import { Socket, startSock, store } from "./wa-socket";
import { convertMsToTime } from "./utils";
import { WebSocket, WebSocketServer } from "ws";
import cors from "cors";

export interface MessageError {
  data: null;
  isBoom: boolean;
  isServer: boolean;
  output: Output;
}

export interface Output {
  statusCode: number;
  payload: Payload;
  headers: Headers;
}

export interface Headers {}

export interface Payload {
  statusCode: number;
  error: string;
  message: string;
}

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
  console.log("Websocket connection established");
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
      // s = null;
    }
    if (currentConnection === ws) {
      currentConnection = null; // Clear the current connection if it was this one
    }
  });
});

const timestamp = new Date();

app.use(cors({}));
app.use(express.json());
app.use("/public", express.static(path.join(__dirname, "public")));
app.get("/", function (_req, res) {
  const timediff = new Date().getTime() - timestamp.getTime();
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.status(200).send(`Alive for: ${convertMsToTime(timediff)}`);
});

app.get("/chats", async function (_req, res) {
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

app.get("/messages/:id/:offset/:limit", async function (req, res) {
  const chatId = req.params.id;
  const offset = Number(req.params.offset);
  const limit = Number(req.params.limit);

  if (!store) {
    return res.status(404).send("No Data");
  }

  const chat = store.chats.get(chatId);
  const messages = store.messages[chatId];

  if (messages && chat) {
    const clone = [...messages.array];
    const transform = clone.slice(-offset - limit, -offset || undefined);
    return res.status(200).json({ messages: transform });
  }

  return res.status(404).send("Chat Not Found");
});

app.get("/media", async function (_req, res) {
  return res.status(404).send("Not found");
});

app.get("/contacts", async function (_req, res) {
  const contacts = store?.contacts;
  if (contacts) {
    return res.status(200).json({ contacts });
  }
  return res.status(404).send("No Data");
});

app.post("/send/:id", async function (req, res) {
  const id = req.params.id;
  const text = req.body.text as string;
  if (s) {
    try {
      // TODO: handle sudden connection drop here
      await s.sendMessage(id, { text });
      return res.status(200).send("OK");
    } catch (error) {
      console.log(JSON.stringify(error));
      return res.status(404).send("Something went wrong");
    }
  }
  return res.status(404).send("No Data");
});

app.all("*", function (_req, res) {
  res.redirect("/");
});

app.listen(port, async () => {
  console.log(`Server running at http://localhost:${port}`);
});
