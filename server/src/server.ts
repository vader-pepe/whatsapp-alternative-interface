import cors from "cors";
import express, { type Express } from "express";
import helmet from "helmet";
import { pino } from "pino";
import { Transform } from "stream";
import { getContentType, downloadMediaMessage, downloadContentFromMessage } from "baileys";

import { healthCheckRouter } from "@/api/healthCheck/healthCheckRouter";
import { userRouter } from "@/api/user/userRouter";
import { openAPIRouter } from "@/api-docs/openAPIRouter";
import errorHandler from "@/common/middleware/errorHandler";
import requestLogger from "@/common/middleware/requestLogger";
import { env } from "@/common/utils/envConfig";
import { store, sock, getMimeType, sendMessageWTyping } from ".";

export async function transformToBuffer(
  transformStream: Transform,
): Promise<Buffer> {
  const chunks: Buffer[] = [];

  return new Promise<Buffer>((resolve, reject) => {
    transformStream.on("data", (chunk: Buffer) => {
      chunks.push(chunk);
    });

    transformStream.on("end", () => {
      resolve(Buffer.concat(chunks));
    });

    transformStream.on("error", (err) => {
      reject(err);
    });
  });
}

const logger = pino({
  level: "info",
  transport: {
    targets: [
      { target: "pino-pretty", options: { colorize: true }, level: "info" },
      { target: "pino/file", options: { destination: "./logs.txt" }, level: "info" }
    ]
  }
});

const app: Express = express();

// Set the application to trust the reverse proxy
app.set("trust proxy", true);

// Middlewares
app.use(express.json({ limit: '500mb' }));
app.use(express.urlencoded({ extended: true, limit: '500mb' }));
app.use(cors({ origin: env.CORS_ORIGIN, credentials: true }));
app.use(helmet());

// Request logging
app.use(requestLogger);

// Routes
app.use("/health-check", healthCheckRouter);
app.use("/users", userRouter);
app.get("/chats", function(_req, res) {
  const msg = store.getAllChats();
  res.send(msg);
});
app.get("/messages/:jid/:limit/:offset", function(req, res) {
  const jid = req.params.jid;
  const limit = Number(req.params.limit) ?? 50;
  const offset = Number(req.params.offset) ?? 0;
  const messages = store.getMessagesPaginated(jid, limit, offset).reverse();

  res.send(messages);
});
app.get("/media/:jid/:id", async function(req, res) {
  const jid = req.params.jid;
  const id = req.params.id;
  const messages = store.getAllMessages(jid);
  const clone = [...messages];
  const filtered = clone.filter(function(m) {
    const keyId = m.key.id;
    if (keyId === id) {
      return true;
    }
    return false;
  });
  const m = filtered[0];
  if (!sock) {
    return res.status(404);
  }
  const type = getContentType(m.message!)!;
  const mimeType = getMimeType(type);
  if (type === "stickerMessage") {
    if (m.message!["stickerMessage"]!.mediaKey) {
      const stream = await downloadContentFromMessage(
        {
          url: `https://mmg.whatsapp.net${m.message!["stickerMessage"]!.directPath}`,
          mediaKey: m.message!["stickerMessage"]!.mediaKey,
          directPath: m.message!["stickerMessage"]!.directPath,
        },
        "sticker",
        {},
      );
      const buffer = await transformToBuffer(stream);
      res.set("Content-Type", mimeType);
      return res.status(200).send(buffer);
    }

    return res.status(404);
  }

  if (type === "imageMessage") {
    const buffer = await downloadMediaMessage(
      m,
      "buffer",
      {},
      { logger: logger, reuploadRequest: sock.updateMediaMessage },
    );

    res.set("Content-Type", mimeType);
    return res.status(200).send(buffer);
  }

  if (type === "videoMessage") {
    if (m.message!["videoMessage"]!.mediaKey) {
      const stream = await downloadContentFromMessage(
        {
          url: m.message!["videoMessage"]!.url,
          mediaKey: m.message!["videoMessage"]!.mediaKey,
          directPath: m.message!["videoMessage"]!.directPath,
        },
        "video",
        {},
      );
      const buffer = await transformToBuffer(stream);
      res.set("Content-Type", mimeType);
      return res.status(200).send(buffer);
    }

    return res.status(404);
  }

  return res.send(type);
});

app.post('/send', async (req, res) => {
  const { jid, content, quoted, timestamp } = req.body;

  if (!jid || !content) {
    return res.status(400).json({ error: 'jid and content are required' });
  }

  if (!sock) {
    return res.status(404);
  }

  try {
    await sock.sendMessage(
      jid,
      content,
      {
        quoted,
        timestamp: timestamp ? new Date(timestamp) : new Date(),
      }
    );

    res.status(200).json({ message: "Sent!" });
  } catch (err) {
    logger.error({ err }, 'Failed to send message:');
    res.status(500).json({ error: 'Failed to send message' });
  }
});

// Swagger UI
app.use(openAPIRouter);

// Error handlers
app.use(errorHandler());

export { app, logger };
