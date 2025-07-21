import cors from "cors";
import express, { type Express } from "express";
import helmet from "helmet";
import { pino } from "pino";
import { Transform } from "stream";
import { v4 } from "uuid";
import { type proto, downloadMediaMessage } from "baileys";

import { healthCheckRouter } from "@/api/healthCheck/healthCheckRouter";
import { userRouter } from "@/api/user/userRouter";
import { openAPIRouter } from "@/api-docs/openAPIRouter";
import errorHandler from "@/common/middleware/errorHandler";
import requestLogger from "@/common/middleware/requestLogger";
import { env } from "@/common/utils/envConfig";
import { store, sock } from ".";

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

  const b64 = (await getBase64FromMediaMessage({ message: m })) ?? { base64: "" };
  return res.send(b64.base64);
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

// TODO: handle audio
// async function processAudioMp4(audio: string) {
//   let inputStream: PassThrough;
//
//   if (isURL(audio)) {
//     const response = await axios.get(audio, { responseType: 'stream' });
//     inputStream = response.data;
//   } else {
//     const audioBuffer = Buffer.from(audio, 'base64');
//     inputStream = new PassThrough();
//     inputStream.end(audioBuffer);
//   }
//
//   return new Promise<Buffer>((resolve, reject) => {
//     const ffmpegProcess = spawn(ffmpegPath.path, [
//       '-i',
//       'pipe:0',
//       '-vn',
//       '-ab',
//       '128k',
//       '-ar',
//       '44100',
//       '-f',
//       'mp4',
//       '-movflags',
//       'frag_keyframe+empty_moov',
//       'pipe:1',
//     ]);
//
//     const outputChunks: Buffer[] = [];
//     let stderrData = '';
//
//     ffmpegProcess.stdout.on('data', (chunk) => {
//       outputChunks.push(chunk);
//     });
//
//     ffmpegProcess.stderr.on('data', (data) => {
//       stderrData += data.toString();
//       this.logger.verbose(`ffmpeg stderr: ${data}`);
//     });
//
//     ffmpegProcess.on('error', (error) => {
//       console.error('Error in ffmpeg process', error);
//       reject(error);
//     });
//
//     ffmpegProcess.on('close', (code) => {
//       if (code === 0) {
//         this.logger.verbose('Audio converted to mp4');
//         const outputBuffer = Buffer.concat(outputChunks);
//         resolve(outputBuffer);
//       } else {
//         this.logger.error(`ffmpeg exited with code ${code}`);
//         this.logger.error(`ffmpeg stderr: ${stderrData}`);
//         reject(new Error(`ffmpeg exited with code ${code}: ${stderrData}`));
//       }
//     });
//
//     inputStream.pipe(ffmpegProcess.stdin);
//
//     inputStream.on('error', (err) => {
//       console.error('Error in inputStream', err);
//       ffmpegProcess.stdin.end();
//       reject(err);
//     });
//   });
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
    // const convertToMp4 = data?.convertToMp4 ?? false;

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
      //   if (msg.message![subtype] && subtype === "ephemeralMessage" || subtype === "documentWithCaptionMessage" || subtype === "viewOnceMessage" || subtype === "viewOnceMessageV2") {
      //     msg.message = msg.message![subtype]?.message;
      //   }
      // }
      if ('messageContextInfo' in mm && Object.keys(mm).length === 1) {
        throw 'The message is messageContextInfo';
      }

      interface ISize {
        fileLength: number | Long;
        height: number;
        width: number;
      }

      let mediaMessage: proto.Message.IImageMessage | proto.Message.IDocumentMessage | proto.Message.IAudioMessage | proto.Message.IVideoMessage | proto.Message.IStickerMessage | undefined = undefined;
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


    // if (typeof mediaMessage['mediaKey'] === 'object') {
    //   msg.message = JSON.parse(JSON.stringify(msg.message));
    // }

    // const buffer = await downloadMediaMessage(
    //   { key: msg?.key, message: msg?.message },
    //   'buffer',
    //   {},
    //   { logger: P({ level: 'error' }) as any, reuploadRequest: this.client.updateMediaMessage },
    // );

    // const typeMessage = getContentType(msg.message!);


    // if (convertToMp4 && typeMessage === 'audioMessage') {
    //   try {
    //     const convert = await this.processAudioMp4(buffer.toString('base64'));
    //
    //     if (Buffer.isBuffer(convert)) {
    //       const result = {
    //         mediaType,
    //         fileName,
    //         caption: mediaMessage['caption'],
    //         size: {
    //           fileLength: mediaMessage['fileLength'],
    //           height: mediaMessage['height'],
    //           width: mediaMessage['width'],
    //         },
    //         mimetype: 'audio/mp4',
    //         base64: convert.toString('base64'),
    //         buffer: getBuffer ? convert : null,
    //       };
    //
    //       return result;
    //     }
    //   } catch (error) {
    //     this.logger.error('Error converting audio to mp4:');
    //     this.logger.error(error);
    //     throw new BadRequestException('Failed to convert audio to MP4');
    //   }
    // }

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
