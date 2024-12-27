import express from "express";
import path from "path";
import {
  logger,
  sendMessageWTyping,
  Socket,
  startSock,
  store,
  transformToBuffer,
} from "./wa-socket";
import { convertMsToTime } from "./utils";
import { WebSocket, WebSocketServer } from "ws";
import cors from "cors";
import {
  delay,
  downloadContentFromMessage,
  downloadMediaMessage,
  type proto,
} from "@whiskeysockets/baileys";

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

export interface Headers { }

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
    // if (s) {
    // s.end(new Error("Socket Closed"));
    // s = null;
    // }
    if (currentConnection === ws) {
      currentConnection = null; // Clear the current connection if it was this one
    }
  });
});

const timestamp = new Date();

app.use(cors({}));
app.use(express.json());
app.use("/public", express.static(path.join(__dirname, "public")));
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

app.get("/messages/:id/:offset/:limit", async function(req, res) {
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

app.get("/media/:chatId/:id", async function(req, res) {
  const chatId = req.params.chatId;
  const id = req.params.id;
  if (!store) {
    return res.status(404).send("No Data");
  }

  const messages = store.messages[chatId];
  if (messages) {
    const clone = [...messages.array];
    const filtered = clone.filter(function(m) {
      const keyId = m.key.id;
      if (keyId === id) {
        return true;
      }
      return false;
    });
    const m = filtered[0];
    if (m) {
      const message = m.message;
      if (message) {
        if ("senderKeyDistributionMessage" in message) {
          delete message["senderKeyDistributionMessage"];
        }
        const messageType = Object.keys(message)[0] as
          | keyof proto.IMessage
          | undefined;
        if (messageType) {
          if (messageType === "videoMessage") {
            const mime = message["videoMessage"]!.mimetype;
            if (mime) {
              try {
                const stream = await downloadContentFromMessage(
                  {
                    url: message["videoMessage"]!.url,
                    mediaKey: message["videoMessage"]!.mediaKey,
                    directPath: message["videoMessage"]!.directPath,
                  },
                  "video",
                  {},
                );
                const buffer = await transformToBuffer(stream);
                res.set("Content-Type", mime);
                return res.status(200).send(buffer);
              } catch (error) {
                console.log(JSON.stringify(error));
                return res.status(400).send("Something went wrong");
              }
            }
          }

          if (messageType === "imageMessage") {
            const mime = message["imageMessage"]!.mimetype;
            if (mime && s) {
              try {
                const buffer = await downloadMediaMessage(
                  m,
                  "buffer",
                  {},
                  { logger: logger, reuploadRequest: s.updateMediaMessage },
                );
                res.set("Content-Type", mime);
                return res.status(200).send(buffer);
              } catch (error) {
                console.log(JSON.stringify(error));
                return res.status(400).send("Something went wrong");
              }
            }
          }

          if (messageType === "stickerMessage") {
            const mime = message[messageType]!.mimetype;
            if (mime) {
              try {
                const stream = await downloadContentFromMessage(
                  {
                    url: `https://mmg.whatsapp.net${message["stickerMessage"]!.directPath}`,
                    mediaKey: message["stickerMessage"]!.mediaKey,
                    directPath: message["stickerMessage"]!.directPath,
                  },
                  "sticker",
                  {},
                );
                const buffer = await transformToBuffer(stream);
                res.set("Content-Type", mime);
                return res.status(200).send(buffer);
              } catch (error) {
                console.log(JSON.stringify(error));
                return res.status(400).send("Something went wrong");
              }
            }
          }
        }
        console.log(JSON.stringify(message));
        return res.status(404).send("Wrongly formatted data!");
      }
    }
  }
  return res.status(404).send("No chat found");
});

app.get("/contacts", async function(_req, res) {
  const contacts = store?.contacts;
  if (contacts) {
    return res.status(200).json({ contacts });
  }
  return res.status(404).send("No Data");
});

// TODO: wait 30s for first message send to prevent
//'Precondition Required' error
app.post("/send/:id", async function(req, res) {
  const id = req.params.id;
  const text = req.body.text as string;
  if (s) {
    try {
      // TODO: handle sudden connection drop here
      sendMessageWTyping({ text }, id);
      return res.status(200).send("OK");
    } catch (error) {
      console.log(JSON.stringify(error));
      return res.status(404).send("Something went wrong");
    }
  }

  return res.status(404).send("No Data");
});

app.all("*", function(_req, res) {
  res.redirect("/");
});

app.listen(port, async () => {
  console.log(`Server running at http://localhost:${port}`);
});
