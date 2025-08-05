import cors from "cors";
import express, { type Express } from "express";
import helmet from "helmet";
import { pino } from "pino";
import { Transform } from "stream";
import { v4 } from "uuid";
import { type proto, AnyMessageContent, downloadMediaMessage } from "baileys";
import axios from "axios";
import multer from "multer";
import fs from "fs";

import { healthCheckRouter } from "@/api/healthCheck/healthCheckRouter";
import { userRouter } from "@/api/user/userRouter";
import { openAPIRouter } from "@/api-docs/openAPIRouter";
import errorHandler from "@/common/middleware/errorHandler";
import requestLogger from "@/common/middleware/requestLogger";
import { env } from "@/common/utils/envConfig";
import { store, sock, sendMessageWTyping } from ".";

const upload = multer({ dest: 'uploads/' });

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

  const data = (await getBase64FromMediaMessage({ message: m }, true)) ?? { base64: "", buffer: null, mimetype: "" };
  res.set("Content-Type", data.mimetype);
  return res.status(200).send(data.buffer);
});

app.get("/mediaproxy/:url", async function(req, res) {
  const encoded = req.params.url;
  const upstreamUrl = decodeURIComponent(encoded);
  const raw = await axios.get(upstreamUrl, { responseType: "arraybuffer" });
  if (!raw.data) {
    return res.status(404);
  }
  res.set("Content-Type", raw.headers["content-type"] || "application/octet-stream");
  // TODO: fix show buffer
  res.send(raw.data);
});

app.post('/send', upload.single('file'), async (req, res) => {
  const { to, type, text, caption } = req.body;
  const jid = to.includes('@') ? to : `${to}@s.whatsapp.net`;

  const file = req.file;

  if (!file) return res.status(404);

  try {
    let message: AnyMessageContent;

    switch (type) {
      case 'text':
        message = { text };
        break;

      case 'image':
        message = {
          image: { url: file.path },
          caption: caption ?? '',
          mimetype: file.mimetype,
        };
        break;

      case 'video':
        message = {
          video: { url: file.path },
          caption: caption ?? '',
          mimetype: file.mimetype,
        };
        break;

      case 'sticker':
        message = {
          sticker: { url: file.path },
          mimetype: file.mimetype,
        };
        break;

      case 'audio':
        message = {
          audio: { url: file.path },
          mimetype: file.mimetype,
          ptt: req.body.ptt === 'true',
        };
        break;

      case 'document':
        message = {
          document: { url: file.path },
          fileName: req.body.filename,
          mimetype: file.mimetype,
        };
        break;

      default:
        return res.status(400).json({ success: false, error: 'Unsupported message type' });
    }

    await sendMessageWTyping(message, jid);

    // Clean-up uploaded file
    if (req.file) fs.unlinkSync(req.file.path);

    res.json({ success: true, type, to: jid });
  } catch (err) {
    logger.error(err);
    if (req.file) fs.unlinkSync(req.file.path);
    res.status(500).json({ success: false, error: err ?? "" });
  }
});


// function isEmoji(str: string) {
//   if (str === '') return true;
//
//   const emojiRegex =
//     /^[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F000}-\u{1F02F}\u{1F0A0}-\u{1F0FF}\u{1F100}-\u{1F64F}\u{1F680}-\u{1F6FF}]$/u;
//   return emojiRegex.test(str);
// }

async function getMessage(key: proto.IMessageKey, full = false) {
  try {
    const webMessageInfo = store.getAllMessages(key.remoteJid!);

    if (full) {
      return webMessageInfo[0];
    }
    if (webMessageInfo[0].message?.pollCreationMessage) {
      const messageSecretBase64 = webMessageInfo[0].message?.messageContextInfo?.messageSecret;

      if (typeof messageSecretBase64 === 'string') {
        const messageSecret = Buffer.from(messageSecretBase64, 'base64');

        const msg = {
          messageContextInfo: { messageSecret },
          pollCreationMessage: webMessageInfo[0].message?.pollCreationMessage,
        };

        return msg;
      }
    }

    return webMessageInfo[0].message;
  } catch (error) {
    return { conversation: '' };
  }
}

interface IgetBase64FromMediaMessage {
  message: proto.IWebMessageInfo;
  convertToMp4?: boolean;
};

async function getBase64FromMediaMessage(data: IgetBase64FromMediaMessage, getBuffer = false) {
  try {
    const m = data?.message;
    const msg = m?.message ? m : ((await getMessage(m.key, true)) as proto.IWebMessageInfo);

    if (!msg) {
      throw 'Message not found';
    }

    if (msg.message) {
      const mm = msg.message;
      if ("ephemeralMessage" in mm) {
        msg.message = mm['ephemeralMessage']?.message;
      } else if ("documentWithCaptionMessage" in mm) {
        msg.message = mm['documentWithCaptionMessage']?.message;
      } else if ("viewOnceMessage" in mm) {
        msg.message = mm['viewOnceMessage']?.message;
      } else if ("viewOnceMessageV2" in mm) {
        msg.message = mm['viewOnceMessageV2']?.message;
      }

      if ('messageContextInfo' in mm && Object.keys(mm).length === 1) {
        throw 'The message is messageContextInfo';
      }

      interface ISize {
        fileLength: number | Long;
        height: number;
        width: number;
      }

      let size: ISize | undefined;
      let mediaType: string = "";
      let caption: string = "";
      let mimetype: string = "";
      let ext: string | boolean = "";

      if (!sock) {
        throw 'socket not ready!';
      }

      const buffer = await downloadMediaMessage(
        { key: msg.key, message: mm },
        "buffer",
        {},
        { logger: logger, reuploadRequest: sock.updateMediaMessage },
      );

      const fileName = `${msg.key.id}.${ext}` || `${v4()}.${ext}`;

      return {
        mediaType,
        fileName,
        caption,
        size,
        mimetype,
        base64: buffer.toString('base64'),
        buffer: getBuffer ? buffer : null,
      };
    }
  } catch (error) {
    logger.error('Error processing media message:');
    logger.error(error);
    throw new Error("Error processing media message:");
  }
}

// Swagger UI
app.use(openAPIRouter);

// Error handlers
app.use(errorHandler());

export { app, logger };
