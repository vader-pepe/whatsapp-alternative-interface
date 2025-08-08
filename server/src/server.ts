import cors from "cors";
import express, { type Request, type Response, type Express } from "express";
import helmet from "helmet";
import { pino } from "pino";
import { v4 } from "uuid";
import { type proto, AnyMessageContent, downloadMediaMessage } from "baileys";
import axios, { AxiosResponse } from "axios";
import multer from "multer";
import fs from "fs";
import path from "path";

import { healthCheckRouter } from "@/api/healthCheck/healthCheckRouter";
import { userRouter } from "@/api/user/userRouter";
import { openAPIRouter } from "@/api-docs/openAPIRouter";
import errorHandler from "@/common/middleware/errorHandler";
import requestLogger from "@/common/middleware/requestLogger";
import { env } from "@/common/utils/envConfig";
import { store, sock, sendMessageWTyping } from ".";
import { getNowPlayingUri } from "./spotify";
import { IncomingMessage } from "http";

const upload = multer({ dest: path.resolve('app-data/uploads/') });

const logger = pino({
  level: "info",
  transport: {
    targets: [
      { target: "pino-pretty", options: { colorize: true }, level: "info" },
      { target: "pino/file", options: { destination: path.resolve("./app-data/logs.txt") }, level: "info" }
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
  // NOTE: dont forget to encode first!
  const encoded = req.params.url;
  const upstreamUrl = decodeURIComponent(encoded);
  const response = await axios.get(upstreamUrl, { responseType: 'stream' });
  if (!response.data) {
    return res.status(404);
  }
  const contentType = response.headers['content-type'] || 'application/octet-stream'
  res.setHeader('Content-Type', contentType)
  res.setHeader('Access-Control-Allow-Origin', '*')
  return response.data.pipe(res);
});

async function formatStatusMessage(params: {
  type: 'text' | 'image' | 'video' | 'audio'
  content: string        // either a path or base64/text
  caption?: string
  backgroundColor?: string
  font?: number
  statusJidList: string[]
}) {
  switch (params.type) {
    case 'text':
      if (!params.backgroundColor || !params.font) {
        throw new Error('text status needs backgroundColor & font')
      }
      return {
        content: { text: params.content },
        options: {
          backgroundColor: params.backgroundColor,
          font: params.font,
          statusJidList: params.statusJidList
        }
      }

    case 'image':
    case 'video':
      return {
        content:
          params.type === 'image'
            ? { image: { url: params.content }, caption: params.caption }
            : { video: { url: params.content }, caption: params.caption },
        options: { statusJidList: params.statusJidList }
      }

    case 'audio':
      return {
        content: {
          audio: { url: params.content },
          ptt: true as const,
          mimetype: 'audio/ogg; codecs=opus'
        },
        options: { statusJidList: params.statusJidList }
      }

    default:
      throw new Error(`Unsupported status type ${params.type}`)
  }
};

function getAllContactJids() {
  return store.getAllChats().map(c => c.jid).filter(jid => jid.endsWith('@s.whatsapp.net'));
};

export type MessageType =
  | 'text'
  | 'image'
  | 'video'
  | 'sticker'
  | 'audio'
  | 'document'
  | 'status';

export type StatusType = 'text' | 'image' | 'video' | 'audio';

export interface SendRequestBody {
  to: string;
  type: MessageType;
  text?: string;
  caption?: string;
  filename?: string;
  ptt?: 'true' | 'false';       // multer gives you strings
  // status‐specific
  statusType?: StatusType;
  backgroundColor?: string;
  font?: string;                // parse to number later
  allContacts?: 'true' | 'false';
  statusJidList?: string[];
  quote?: string;
};

app.post(
  '/send',
  upload.single('file'),
  async (req: Request<{}, {}, SendRequestBody>, res: Response) => {
    const {
      to = "",
      type,
      text,
      caption,
      filename,
      ptt,
      statusType,
      backgroundColor,
      font,
      allContacts,
      statusJidList,
      quote,
    } = req.body;

    const useAll = allContacts === 'true';
    const baseJid = to.includes('@') ? to : `${to}@s.whatsapp.net`;
    const needsFile = ['image', 'video', 'sticker', 'audio', 'document'] as const;
    if (needsFile.includes(type as any) && !req.file) {
      return res.status(400).json({ success: false, error: `Missing file for ${type}` });
    }

    const targets = type === 'status'
      ? ['status@broadcast']
      : useAll
        ? getAllContactJids()
        : [baseJid];

    try {
      if (type === 'status') {
        const list = useAll ? getAllContactJids() : statusJidList;
        const fontNum = parseInt(font ?? '0', 10);
        if (isNaN(fontNum)) {
          return res.status(400).json({ success: false, error: 'font must be a number' });
        }
        const { content: statusContent, options: statusOptions } = await formatStatusMessage({
          type: statusType ?? 'text',
          content: req.file ? req.file.path : text!,
          caption,
          backgroundColor,
          font: fontNum,
          statusJidList: list ?? [],
        });

        for (const jid of targets) {
          await sendMessageWTyping(statusContent, jid, statusOptions);
        }
        if (req.file) fs.unlink(req.file.path, () => { });
        return res.json({ success: true, type: 'status', to: targets });
      }

      let message: AnyMessageContent;
      switch (type) {
        case 'text':
          message = { text: text ?? '' };
          break;
        case 'image':
          message = { image: { url: req.file!.path }, caption: caption ?? '', mimetype: req.file!.mimetype };
          break;
        case 'video':
          message = { video: { url: req.file!.path }, caption: caption ?? '', mimetype: req.file!.mimetype };
          break;
        case 'sticker':
          message = { sticker: { url: req.file!.path }, mimetype: req.file!.mimetype };
          break;
        case 'audio':
          message = { audio: { url: req.file!.path }, mimetype: req.file!.mimetype, ptt: ptt === 'true' };
          break;
        case 'document':
          message = { document: { url: req.file!.path }, fileName: filename, mimetype: req.file!.mimetype };
          break;
        default:
          return res.status(400).json({ success: false, error: `Unsupported message type "${type}"` });
      }

      for (const jid of targets) {
        if (quote && quote !== "undefined") {
          await sendMessageWTyping(message, jid, { quoted: JSON.parse(JSON.parse(quote)) as proto.IWebMessageInfo });
        } else {
          await sendMessageWTyping(message, jid);
        }
      }
      if (req.file) fs.unlink(req.file.path, () => { });
      return res.json({ success: true, type, to: targets });
    } catch (err: any) {
      logger.error(err);
      if (req.file) fs.unlink(req.file.path, () => { });
      return res.status(500).json({ success: false, error: err.message || String(err) });
    }
  }
);

app.get("/nowplaying", async function(req, res) {
  const uri = await getNowPlayingUri();
  const encodedUri = encodeURIComponent(uri);
  const url = `https://scannables.scdn.co/uri/plain/jpeg/000000/white/640/${encodedUri}`;
  const response: AxiosResponse<IncomingMessage> = await axios.get(url, { responseType: 'stream' });
  res.setHeader('Content-Type', 'image/png');
  response.data.pipe(res);
});

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
};

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

      // if ('messageContextInfo' in mm && Object.keys(mm).length === 1) {
      //   throw 'The message is messageContextInfo';
      // }

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
};

// Swagger UI
app.use(openAPIRouter);

// Error handlers
app.use(errorHandler());

export { app, logger };
