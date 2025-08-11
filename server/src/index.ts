import { env } from "@/common/utils/envConfig";
import { app, logger } from "@/server";
import { getNowPlaying } from "@/spotify";

import { Boom } from '@hapi/boom'
import { Server, type Socket } from "socket.io";
import path from "path";
import NodeCache from '@cacheable/node-cache'
import readline from 'readline'
import makeWASocket, {
  delay,
  encodeWAM,
  fetchLatestBaileysVersion,
  getAggregateVotesInPollMessage,
  isJidNewsletter,
  makeCacheableSignalKeyStore,
  proto,
  initAuthCreds,
  BufferJSON,
  BinaryInfo,
  DisconnectReason,
  type AnyMessageContent,
  type GroupMetadata,
  type WAMessageKey,
  type WASocket,
  type AuthenticationState,
  type AuthenticationCreds,
  type MiscMessageGenerationOptions,
} from 'baileys';
import fs from 'fs'
import Database from "better-sqlite3";
import axios, { AxiosResponse } from "axios";

const db = new Database(path.resolve("app-data/store.db"));
db.exec(`
  CREATE TABLE IF NOT EXISTS auth_creds (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    creds TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS auth_keys (
    type TEXT NOT NULL,
    id TEXT NOT NULL,
    data TEXT NOT NULL,
    PRIMARY KEY (type, id)
  );
  CREATE TABLE IF NOT EXISTS contacts (
    jid TEXT PRIMARY KEY,
    name TEXT,
    notify TEXT,
    imgUrl TEXT,
    status TEXT
  );
`);

db.exec(`
CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  jid TEXT NOT NULL,
  timestamp INTEGER,
  message BLOB NOT NULL
)`);

db.exec(`
CREATE INDEX IF NOT EXISTS idx_messages_jid_timestamp ON messages(jid, timestamp)
`);

db.exec(`CREATE TABLE IF NOT EXISTS tokens (
  id INTEGER PRIMARY KEY,
  access_token TEXT NOT NULL,
  token_type TEXT NOT NULL,
  expires_in INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
)`);

const upsertContact = db.prepare(`
  INSERT INTO contacts (jid, name, notify, imgUrl, status)
  VALUES (?, ?, ?, ?, ?)
  ON CONFLICT(jid) DO UPDATE SET
    name = excluded.name,
    notify = excluded.notify,
    imgUrl = excluded.imgUrl,
    status = excluded.status
`)

const doReplies = process.argv.includes('--do-reply')
const usePairingCode = process.argv.includes('--use-pairing-code')
let isHistorySyncRunning = false;
export let sock: WASocket | null = null;
export let sendMessageWTyping: (msg: AnyMessageContent, jid: string, options?: MiscMessageGenerationOptions) => Promise<void>

// external map to store retry counts of messages when decryption/encryption fails
// keep this out of the socket itself, so as to prevent a message decryption/encryption loop across socket restarts
const msgRetryCounterCache = new NodeCache<any>();

// const onDemandMap = new Map<string, string>()

// Read line interface
const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
const question = (text: string) => new Promise<string>((resolve) => rl.question(text, resolve))

interface MessageRow {
  id: string;         // TEXT PRIMARY KEY
  jid: string;        // TEXT NOT NULL
  timestamp: number;  // INTEGER
  message: Buffer;    // BLOB
}

interface MetadataRow {
  count: number
  latest: number | null
  jid: string
  name: string | null
  notify: string | null
  imgUrl: string | null
  status: string | null
}

interface AuthCredsRow {
  id: 1;             // INTEGER PRIMARY KEY, always 1
  creds: string;     // JSON text (serialized via BufferJSON.replacer)
}

interface AuthKeyRow {
  type: string;      // e.g. "app-state-sync-key"
  id: string;        // key identifier
  data: string;      // JSON text (serialized)
}

async function useSqliteAuthState(): Promise<{
  state: AuthenticationState
  saveCreds: () => Promise<void>
}> {
  // Load stored credentials or initialize new ones
  let creds: AuthenticationCreds
  const row = db.prepare(`SELECT creds FROM auth_creds WHERE id = 1`).get() as AuthCredsRow;
  if (row) {
    creds = JSON.parse(row.creds, BufferJSON.reviver)
  } else {
    creds = initAuthCreds()
    db.prepare(`INSERT INTO auth_creds (id, creds) VALUES (1, ?)`)
      .run(JSON.stringify(creds, BufferJSON.replacer))
  }

  const state: AuthenticationState = {
    creds,
    keys: {
      get: async (type, ids) => {
        const stmt = db.prepare(`SELECT id, data FROM auth_keys WHERE type = ? AND id IN (${ids.map(() => '?').join(',')})`)
        const rows = stmt.all(type, ...ids) as AuthKeyRow[];
        const result: { [id: string]: any } = {}
        for (const { id, data } of rows) {
          const parsed = JSON.parse(data, BufferJSON.reviver)
          result[id] = type === 'app-state-sync-key'
            ? proto.Message.AppStateSyncKeyData.fromObject(parsed)
            : parsed
        }
        return result
      },
      set: async data => {
        const insert = db.prepare(`INSERT OR REPLACE INTO auth_keys (type, id, data) VALUES (@type, @id, @data)`)
        const del = db.prepare(`DELETE FROM auth_keys WHERE type = ? AND id = ?`)
        const tx = db.transaction((entries: Record<string, Record<string, any>>) => {
          for (const [type, sub] of Object.entries(entries)) {
            for (const [id, value] of Object.entries(sub)) {
              if (value == null) {
                del.run(type, id)
              } else {
                const ser = JSON.stringify(value, BufferJSON.replacer)
                insert.run({ type, id, data: ser })
              }
            }
          }
        })
        tx(data)
      }
    }
  }

  const saveCreds = async () => {
    db.prepare(`UPDATE auth_creds SET creds = ? WHERE id = 1`)
      .run(JSON.stringify(creds, BufferJSON.replacer))
  }

  return { state, saveCreds }
}

interface TokenRow {
  access_token: string;
  updated_at: number;
  token_type: string;
  expires_in: number;
};

function spotifyUtils() {
  const now = Math.floor(Date.now() / 1000);
  return {
    getCachedToken() {
      const row = db.prepare('SELECT access_token, expires_in, token_type, updated_at FROM tokens WHERE id = 1').get() as TokenRow;

      if (row && now - row.updated_at < 3600) {
        return row;
      }
    },
    setToken(token: TokenRow) {
      db.prepare(`INSERT INTO tokens (id, access_token, expires_in, token_type, updated_at)
              VALUES (1, ?, ?, ?, ?)
              ON CONFLICT(id) DO UPDATE SET
              access_token = excluded.access_token,
              expires_in = excluded.expires_in,
              token_type = excluded.token_type,
              updated_at = excluded.updated_at`)
        .run(token.access_token, token.expires_in, token.token_type, token.updated_at);
    }
  }
};

function makeSqliteMessageStore() {
  const insertStmt = db.prepare('INSERT OR REPLACE INTO messages (id, jid, timestamp, message) VALUES (?, ?, ?, ?)')
  const selectPaginatedStmt = db.prepare('SELECT message FROM messages WHERE jid = ? ORDER BY timestamp DESC LIMIT ? OFFSET ?')
  const searchStmt = db.prepare('SELECT message FROM messages WHERE jid = ? AND message LIKE ? ORDER BY timestamp DESC LIMIT ? OFFSET ?')
  const selectMetadataStmt = db.prepare('SELECT COUNT(*) as count, MAX(timestamp) as latest FROM messages WHERE jid = ?')
  const selectAllMessagesStmt = db.prepare(
    'SELECT message FROM messages WHERE jid = ? ORDER BY timestamp ASC'
  );
  const selectAllChatsStmt = db.prepare(`
  SELECT
    m.jid,
    COUNT(*) AS msgCount,
    MAX(m.timestamp) AS latestTimestamp,
    c.name,
    c.notify,
    c.imgUrl,
    c.status
  FROM messages AS m
  LEFT JOIN contacts AS c
    ON m.jid = c.jid
  GROUP BY m.jid
  ORDER BY latestTimestamp DESC
`)

  return {
    getMessagesPaginated(jid: string, limit = 50, offset = 0): proto.IWebMessageInfo[] {
      return (selectPaginatedStmt.all(jid, limit, offset) as MessageRow[]).map(row =>
        proto.WebMessageInfo.decode(row.message)
      )
    },

    getAllMessages(jid: string): proto.IWebMessageInfo[] {
      return (selectAllMessagesStmt.all(jid) as MessageRow[]).map(row =>
        proto.WebMessageInfo.decode(row.message)
      );
    },

    searchMessages(jid: string, keyword: string, limit = 50, offset = 0): proto.IWebMessageInfo[] {
      const pattern = `%${keyword}%`
      return (searchStmt.all(jid, pattern, limit, offset) as MessageRow[]).map(row =>
        proto.WebMessageInfo.decode(row.message)
      )
    },

    getChatMetadata(jid: string): MetadataRow {
      return selectMetadataStmt.get(jid) as MetadataRow;
    },

    getAllChats(): MetadataRow[] {
      return selectAllChatsStmt.all() as MetadataRow[];
    },

    bind(sock: WASocket) {
      sock.ev.on('messages.upsert', async ({ messages: upserts }) => {
        for (const msg of upserts) {
          if (isHistorySyncRunning) return
          const jid = msg.key.remoteJid!
          const id = msg.key.id!
          const timestamp = Number(msg.messageTimestamp?.toString() || Date.now())
          const buffer = proto.WebMessageInfo.encode(msg).finish()
          insertStmt.run(id, jid, timestamp, buffer)
        }
      });

      sock.ev.on('messaging-history.set', ({ messages: history }) => {
        if (isHistorySyncRunning) return
        isHistorySyncRunning = true;
        try {
          const transaction = db.transaction((msgs: typeof history) => {
            for (const msg of msgs) {
              const jid = msg.key.remoteJid!;
              const id = msg.key.id!;
              const timestamp = Number(msg.messageTimestamp?.toString() || Date.now());
              const buffer = proto.WebMessageInfo.encode(msg).finish();
              insertStmt.run(id, jid, timestamp, buffer)
            }
          });
          transaction(history);
        } catch (error) {
          logger.error({ error }, `failed during messaging-history set insert`);
        } finally {
          isHistorySyncRunning = false;
        }
      });
    }
  }
}

export const store = makeSqliteMessageStore();
export const spotify = spotifyUtils();
const groupCache = new NodeCache({
  stdTTL: 300,
  useClones: false
});

// start a connection
const startSock = async () => {
  const { state, saveCreds } = await useSqliteAuthState();
  // fetch latest version of WA Web
  const { version, isLatest } = await fetchLatestBaileysVersion();
  logger.info(`using WA v${version.join('.')}, isLatest: ${isLatest}`);

  sock = makeWASocket({
    version,
    logger,
    printQRInTerminal: !usePairingCode,
    auth: {
      creds: state.creds,
      /** caching makes the store faster to send/recv messages */
      keys: makeCacheableSignalKeyStore(state.keys, logger),
    },
    msgRetryCounterCache,
    cachedGroupMetadata: async (jid: string) => {
      const data = groupCache.get(jid) as GroupMetadata;
      if (data) return data;
      // // Fallback: if not in cache, fetch and store it
      const metadata = await sock!.groupMetadata(jid);
      groupCache.set(jid, metadata);
      return metadata;
    },
    generateHighQualityLinkPreview: true,
    // ignore all broadcast messages -- to receive the same
    // comment the line below out
    // shouldIgnoreJid: jid => isJidBroadcast(jid),
    // implement to handle retries & poll updates
    getMessage,
  });

  store.bind(sock);

  // Pairing code for Web clients
  if (usePairingCode && !sock.authState.creds.registered) {
    // todo move to QR event
    const phoneNumber = await question('Please enter your phone number:\n')
    const code = await sock.requestPairingCode(phoneNumber)
    logger.info(`Pairing code: ${code}`)
  }

  sendMessageWTyping = async (msg: AnyMessageContent, jid: string, options?: MiscMessageGenerationOptions) => {
    await sock!.presenceSubscribe(jid);
    await delay(500);

    await sock!.sendPresenceUpdate('composing', jid);
    await delay(2000);

    await sock!.sendPresenceUpdate('paused', jid);

    await sock!.sendMessage(jid, msg, options);
  }

  // the process function lets you process all events that just occurred
  // efficiently in a batch
  sock.ev.process(
    // events is a map for event name => event data
    async (events) => {
      // something about the connection changed
      // maybe it closed, or we received all offline message or connection opened
      if (events['connection.update']) {
        const update = events['connection.update']
        const { connection, lastDisconnect } = update
        if (connection === 'close') {
          // reconnect if not logged out
          if ((lastDisconnect?.error as Boom)?.output?.statusCode !== DisconnectReason.loggedOut) {
            startSock()
          } else {
            logger.info('Connection closed. You are logged out.')
          }
        }

        // WARNING: THIS WILL SEND A WAM EXAMPLE AND THIS IS A ****CAPTURED MESSAGE.****
        // DO NOT ACTUALLY ENABLE THIS UNLESS YOU MODIFIED THE FILE.JSON!!!!!
        // THE ANALYTICS IN THE FILE ARE OLD. DO NOT USE THEM.
        // YOUR APP SHOULD HAVE GLOBALS AND ANALYTICS ACCURATE TO TIME, DATE AND THE SESSION
        // THIS FILE.JSON APPROACH IS JUST AN APPROACH I USED, BE FREE TO DO THIS IN ANOTHER WAY.
        // THE FIRST EVENT CONTAINS THE CONSTANT GLOBALS, EXCEPT THE seqenceNumber(in the event) and commitTime
        // THIS INCLUDES STUFF LIKE ocVersion WHICH IS CRUCIAL FOR THE PREVENTION OF THE WARNING
        const sendWAMExample = false;
        if (connection === 'open' && sendWAMExample) {
          /// sending WAM EXAMPLE
          const {
            header: {
              wamVersion,
              eventSequenceNumber,
            },
            events,
          } = JSON.parse(await fs.promises.readFile("./boot_analytics_test.json", "utf-8"))

          const binaryInfo = new BinaryInfo({
            protocolVersion: wamVersion,
            sequence: eventSequenceNumber,
            events: events
          })

          const buffer = encodeWAM(binaryInfo);

          const result = await sock!.sendWAMBuffer(buffer)
          logger.info(result)
        }

        logger.info({ update }, 'connection update');
      }

      // credentials updated -- save them
      if (events['creds.update']) {
        await saveCreds()
      }

      if (events['labels.association']) {
        logger.info(events['labels.association'])
      }

      if (events['labels.edit']) {
        logger.info(events['labels.edit'])
      }

      if (events['groups.update']) {
        for (const event of events['groups.update']) {
          if (!event.id) {
            logger.warn({ event }, 'Received group update without id:');
            continue;
          }

          try {
            const meta = await sock!.groupMetadata(event.id!)
            groupCache.set(event.id, meta)
          } catch {
            groupCache.del(event.id)
          }
        }
      }

      if (events['group-participants.update']) {
        const evt = events['group-participants.update'];
        try {
          const m = await sock!.groupMetadata(evt.id)
          groupCache.set(evt.id, m)
        } catch {
          groupCache.del(evt.id)
        }
      }

      if (events.call) {
        logger.info({ call: events.call }, 'recv call event')
      }

      // history received
      if (events['messaging-history.set']) {
        const { chats, contacts, messages, isLatest, progress, syncType } = events['messaging-history.set']
        for (const contact of contacts) {
          if (isHistorySyncRunning) return
          upsertContact.run(contact.id, contact.name ?? null, contact.notify ?? null, contact.imgUrl ?? null, contact.status ?? null);
        }

        if (syncType === proto.HistorySync.HistorySyncType.ON_DEMAND) {
          logger.info({ messages }, 'received on-demand history sync, messages=')
        }
        logger.info(`recv ${chats.length} chats, ${contacts.length} contacts, ${messages.length} msgs (is latest: ${isLatest}, progress: ${progress}%), type: ${syncType}`)
      }

      // received a new message
      if (events['messages.upsert']) {
        const upsert = events['messages.upsert'];
        logger.info({ messages: upsert }, 'recv messages ');
        // const x = extractMessageContent();
        io.emit('messages.upsert', upsert);

        if (upsert.type === 'notify') {
          for (const msg of upsert.messages) {
            //TODO: More built-in implementation of this
            /* if (
              msg.message?.protocolMessage?.type ===
              proto.Message.ProtocolMessage.Type.HISTORY_SYNC_NOTIFICATION
              ) {
              const historySyncNotification = getHistoryMsg(msg.message)
              if (
                historySyncNotification?.syncType ==
                proto.HistorySync.HistorySyncType.ON_DEMAND
              ) {
                const { messages } =
                await downloadAndProcessHistorySyncNotification(
                  historySyncNotification,
                  {}
                )

                const chatId = onDemandMap.get(
                  historySyncNotification!.peerDataRequestSessionId!
                )

                logger.info(messages)

                onDemandMap.delete(
                historySyncNotification!.peerDataRequestSessionId!
                )

                /*
                // 50 messages is the limit imposed by whatsapp
                //TODO: Add ratelimit of 7200 seconds
                //TODO: Max retries 10
                const messageId = await sock.fetchMessageHistory(
                  50,
                  oldestMessageKey,
                  oldestMessageTimestamp
                )
                onDemandMap.set(messageId, chatId)
              }
              } */

            if (msg.message?.conversation || msg.message?.extendedTextMessage?.text) {
              const text = msg.message?.conversation || msg.message?.extendedTextMessage?.text
              if (text == "requestPlaceholder" && !upsert.requestId) {
                const messageId = await sock!.requestPlaceholderResend(msg.key)
                logger.info({ messageId }, 'requested placeholder resync, id=')
              } else if (upsert.requestId) {
                logger.info({ requestID: upsert.requestId, msg }, 'Message received from phone, id=')
              }

              // go to an old chat and send this
              if (text == "onDemandHistSync") {
                const messageId = await sock!.fetchMessageHistory(50, msg.key, msg.messageTimestamp!)
                logger.info({ messageId }, 'requested on-demand sync, id=')
              }
            }

            if (!msg.key.fromMe && doReplies && !isJidNewsletter(msg.key?.remoteJid!)) {

              logger.info({ remoteJid: msg.key.remoteJid! }, 'replying to')
              await sock!.readMessages([msg.key])
              await sendMessageWTyping({ text: 'Hello there!' }, msg.key.remoteJid!)
            }
          }
        }
      }

      // messages updated like status delivered, message deleted etc.
      if (events['messages.update']) {
        logger.info(
          events['messages.update']
        )

        for (const { key, update } of events['messages.update']) {
          if (update.pollUpdates) {
            const pollCreation: proto.IMessage = {} // get the poll creation message somehow
            if (pollCreation) {
              logger.info(
                {
                  vote: getAggregateVotesInPollMessage({
                    message: pollCreation,
                    pollUpdates: update.pollUpdates,
                  })
                },
                'got poll update, aggregation: '
              )
            }
          }
        }
      }

      if (events['message-receipt.update']) {
        logger.info(events['message-receipt.update'])
      }

      if (events['messages.reaction']) {
        logger.info(events['messages.reaction'])
      }

      if (events['presence.update']) {
        logger.info(events['presence.update'])
      }

      if (events['chats.update']) {
        logger.info(events['chats.update'])
      }

      if (events['contacts.upsert']) {
        logger.info({ contacts: events['chats.upsert'] }, 'recv contacts upsert: ');
        const contacts = events['contacts.upsert'];
        for (const contact of contacts) {
          if (isHistorySyncRunning) return
          upsertContact.run(contact.id, contact.name ?? null, contact.notify ?? null, contact.imgUrl ?? null, contact.status ?? null);
        }
      }

      if (events['contacts.update']) {
        logger.info({ contacts: events['contacts.update'] }, 'recv contacts update: ');
        for (const contact of events['contacts.update']) {
          if (typeof contact.imgUrl !== 'undefined') {
            const newUrl = contact.imgUrl === null
              ? null
              : await sock!.profilePictureUrl(contact.id!).catch(() => null)
            logger.info(
              `contact ${contact.id} has a new profile pic: ${newUrl}`,
            )
          }
        }
      }

      if (events['chats.delete']) {
        logger.info({ deleted: events['chats.delete'] }, 'chats deleted ')
      }
    }
  )

  return sock

  async function getMessage(key: WAMessageKey): Promise<proto.IMessage | undefined> {
    const selectByIdStmt = db.prepare('SELECT message FROM messages WHERE id = ?')
    const row = selectByIdStmt.get(key.id) as { message: Buffer } | undefined
    if (!row) return undefined

    const msgInfo = proto.WebMessageInfo.decode(row.message)
    return msgInfo.message ?? undefined
  }
}

startSock();

const server = app.listen(env.PORT, () => {
  const { NODE_ENV, HOST, PORT } = env;
  logger.info(`Server (${NODE_ENV}) running on port http://${HOST}:${PORT}`);
});

export const io = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] }
});

const clientMap = new Map<string, Socket>();

io.on('connection', (socket: Socket) => {
  const ip = socket.handshake.address;
  const ua = socket.handshake.headers['user-agent'] || '';
  const key = `${ip}::${ua}`;

  if (clientMap.has(key)) {
    const existing = clientMap.get(key);
    if (existing && existing.id !== socket.id) {
      logger.info(`Disconnecting previous socket for: ${key}`);
      existing.disconnect(true);
    }
  }

  clientMap.set(key, socket);

  logger.info(`Client connected: ${socket.id} (${key})`);

  socket.on('disconnect', () => {
    logger.info(`Client disconnected: ${socket.id}`);
    if (clientMap.get(key)?.id === socket.id) {
      clientMap.delete(key);
    }
  });
});

let lastUri: string | null = null;
setInterval(async () => {
  const pollNowPlaying = async () => {
    const data = (await getNowPlaying());
    if (data.is_playing) {
      const uri = data.item.uri;
      const remaining = data.item.duration_ms ?? 0 - (data.progress_ms ?? 0);
      if (uri !== lastUri) {
        lastUri = uri;
        const encodedUri = encodeURIComponent(uri);
        const url = `https://scannables.scdn.co/uri/plain/jpeg/000000/white/640/${encodedUri}`;
        const response: AxiosResponse<ArrayBuffer> = await axios.get(url, { responseType: 'arraybuffer' });
        const image = new Uint8Array(response.data);
        const blobData = new Blob([image]);

        const form = new FormData();
        form.append('type', 'status');
        form.append('statusType', 'image');
        form.append('caption', 'now playing');
        form.append('allContacts', 'true');
        form.append('file', blobData);

        await axios.post(`http://${env.HOST}:${env.PORT}/send`, form, {
          headers: {
            'Content-Type': 'multipart/form-data'
          }
        }).catch(e => {
          logger.error(e);
        });
      }
      setTimeout(pollNowPlaying, remaining + 1000);
    } else {
      setTimeout(pollNowPlaying, 30_000);
    }
  };
}, 30_000);

const onCloseSignal = () => {
  logger.info("sigint received, shutting down");
  server.close(() => {
    logger.info("server closed");
    process.exit();
  });
  setTimeout(() => process.exit(1), 10000).unref(); // Force shutdown after 10s
};

process.on("SIGINT", onCloseSignal);
process.on("SIGTERM", onCloseSignal);
