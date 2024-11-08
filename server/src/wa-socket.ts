// import { Boom } from "@hapi/boom";
import NodeCache from "node-cache";
import readline from "readline";
import makeWASocket, {
  AnyMessageContent,
  BinaryInfo,
  // BinaryInfo,
  delay,
  DisconnectReason,
  downloadContentFromMessage,
  downloadMediaMessage,
  encodeWAM,
  // DisconnectReason,
  // downloadAndProcessHistorySyncNotification,
  // encodeWAM,
  fetchLatestBaileysVersion,
  getAggregateVotesInPollMessage,
  // getHistoryMsg,
  isJidNewsletter,
  makeCacheableSignalKeyStore,
  makeInMemoryStore,
  // PHONENUMBER_MCC,
  proto,
  useMultiFileAuthState,
  WAMessageContent,
  WAMessageKey,
} from "@whiskeysockets/baileys";
import fs from "fs/promises";
import path from "path";
//import MAIN_LOGGER from '../src/Utils/logger'
// import fs from "fs";
import P from "pino";
import { Boom } from "@hapi/boom";
import { wss } from "src";
import QRCode from "qrcode-svg";
import { Transform } from "stream";

export let sendMessageWTyping: (
  msg: AnyMessageContent,
  jid: string,
) => Promise<void> | null;
export type Socket = ReturnType<typeof makeWASocket>;
export const logger = P(
  { timestamp: () => `,"time":"${new Date().toJSON()}"` },
  P.destination("./wa-logs.txt"),
);
logger.level = "trace";

const useStore = !process.argv.includes("--no-store");
const doReplies = process.argv.includes("--do-reply");
const usePairingCode = process.argv.includes("--use-pairing-code");
const useMobile = process.argv.includes("--mobile");

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

// external map to store retry counts of messages when decryption/encryption fails
// keep this out of the socket itself, so as to prevent a message decryption/encryption loop across socket restarts
const msgRetryCounterCache = new NodeCache();

// Read line interface
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});
const question = (text: string) =>
  new Promise<string>((resolve) => rl.question(text, resolve));

// const onDemandMap = new Map<string, string>();

// the store maintains the data of the WA connection in memory
// can be written out to a file & read from it
export const store = useStore ? makeInMemoryStore({ logger }) : undefined;
store?.readFromFile("./baileys_store_multi.json");
// save every 10s
setInterval(() => {
  store?.writeToFile("./baileys_store_multi.json");
}, 10_000);

// start a connection
export const startSock = async () => {
  const { state, saveCreds } = await useMultiFileAuthState("baileys_auth_info");
  // fetch latest version of WA Web
  const { version, isLatest } = await fetchLatestBaileysVersion();
  console.log(`using WA v${version.join(".")}, isLatest: ${isLatest}`);

  const sock = makeWASocket({
    version,
    defaultQueryTimeoutMs: undefined,
    logger,
    printQRInTerminal: false,
    mobile: useMobile,
    auth: {
      creds: state.creds,
      /** caching makes the store faster to send/recv messages */
      keys: makeCacheableSignalKeyStore(state.keys, logger),
    },
    msgRetryCounterCache,
    generateHighQualityLinkPreview: true,
    // ignore all broadcast messages -- to receive the same
    // comment the line below out
    // shouldIgnoreJid: jid => isJidBroadcast(jid),
    // implement to handle retries & poll updates
    getMessage,
  });

  store?.bind(sock.ev);

  // Pairing code for Web clients
  if (usePairingCode && !sock.authState.creds.registered) {
    if (useMobile) {
      throw new Error("Cannot use pairing code with mobile api");
    }

    const phoneNumber = await question(
      "Please enter your mobile phone number:\n",
    );
    const code = await sock.requestPairingCode(phoneNumber);
    console.log(`Pairing code: ${code}`);
  }

  sendMessageWTyping = async (msg: AnyMessageContent, jid: string) => {
    await sock.presenceSubscribe(jid);
    await delay(500);

    await sock.sendPresenceUpdate("composing", jid);
    await delay(2000);

    await sock.sendPresenceUpdate("paused", jid);

    await sock.sendMessage(jid, msg);
  };

  // the process function lets you process all events that just occurred
  // efficiently in a batch
  sock.ev.process(
    // events is a map for event name => event data
    async (events) => {
      // something about the connection changed
      // maybe it closed, or we received all offline message or connection opened

      // credentials updated -- save them
      if (events["creds.update"]) {
        await saveCreds();
      }

      if (events["connection.update"]) {
        const update = events["connection.update"];
        const { connection, lastDisconnect } = update;
        if (connection === "close") {
          // reconnect if not logged out
          if (
            (lastDisconnect?.error as Boom)?.output?.statusCode !==
            DisconnectReason.loggedOut
          ) {
            await startSock();
          } else {
            console.log("Connection closed. You are logged out.");
            wss.clients.forEach((client) => {
              client.close();
            });
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
        if (connection === "open" && sendWAMExample) {
          /// sending WAM EXAMPLE
          const {
            header: { wamVersion, eventSequenceNumber },
            events,
          } = JSON.parse(
            await fs.readFile("./boot_analytics_test.json", "utf-8"),
          );

          const binaryInfo = new BinaryInfo({
            protocolVersion: wamVersion,
            sequence: eventSequenceNumber,
            events: events,
          });

          const buffer = encodeWAM(binaryInfo);

          const result = await sock.sendWAMBuffer(buffer);
          console.log(result);
        }
        console.log("connection update", update);

        if (update.connection === "open") {
          console.log("qr already scanned");
          wss.clients.forEach((client) => {
            client.send(JSON.stringify({ state: state.creds }, undefined, 2));
          });
        }

        if (update.qr) {
          wss.clients.forEach((client) => {
            const qr = new QRCode(update.qr || "").svg();
            const cleanedQR = qr.replace(
              `<?xml version="1.0" standalone="yes"?>`,
              "",
            );
            client.send(JSON.stringify({ qr: cleanedQR }));
          });
        }
      }

      // if (events["labels.association"]) {
      //   console.log(events["labels.association"]);
      // }
      //
      // if (events["labels.edit"]) {
      //   console.log(events["labels.edit"]);
      // }
      //
      // if (events.call) {
      //   console.log("recv call event", events.call);
      // }

      // history received
      if (events["messaging-history.set"]) {
        const { chats, contacts, messages, isLatest, progress, syncType } =
          events["messaging-history.set"];
        if (syncType === proto.HistorySync.HistorySyncType.ON_DEMAND) {
          console.log("received on-demand history sync, messages=", messages);
        }
        console.log(
          `recv ${chats.length} chats, ${contacts.length} contacts, ${messages.length} msgs (is latest: ${isLatest}, progress: ${progress}%), type: ${syncType}`,
        );
      }

      if (events["chats.upsert"]) {
        const chats = events["chats.upsert"];
        console.log("chat upsert", chats);
        wss.clients.forEach((client) => {
          client.send(JSON.stringify({ chats }));
        });
      }

      // received a new message
      if (events["messages.upsert"]) {
        const upsert = events["messages.upsert"];

        console.log("recv messages ", JSON.stringify(upsert, undefined, 2));
        wss.clients.forEach((client) => {
          client.send(
            JSON.stringify({
              messages: JSON.stringify(upsert.messages, undefined, 2),
            }),
          );
        });
        if (upsert.type === "notify") {
          for (const msg of upsert.messages) {
            if (
              msg.message?.conversation ||
              msg.message?.extendedTextMessage?.text
            ) {
              const text =
                msg.message?.conversation ||
                msg.message?.extendedTextMessage?.text;
              if (text == "requestPlaceholder" && !upsert.requestId) {
                const messageId = await sock.requestPlaceholderResend(msg.key);
                console.log("requested placeholder resync, id=", messageId);
              } else if (upsert.requestId) {
                console.log(
                  "Message received from phone, id=",
                  upsert.requestId,
                  msg,
                );
              }

              // go to an old chat and send this
              if (text == "onDemandHistSync") {
                const messageId = await sock.fetchMessageHistory(
                  50,
                  msg.key,
                  msg.messageTimestamp!,
                );
                console.log("requested on-demand sync, id=", messageId);
              }
            }

            if (
              !msg.key.fromMe &&
              doReplies &&
              !isJidNewsletter(msg.key?.remoteJid!)
            ) {
              console.log("replying to", msg.key.remoteJid);
              await sock!.readMessages([msg.key]);
              await sendMessageWTyping(
                { text: "Hello there!" },
                msg.key.remoteJid!,
              );
            }
          }
        }
      }

      // messages updated like status delivered, message deleted etc.
      if (events["messages.update"]) {
        console.log(JSON.stringify(events["messages.update"], undefined, 2));

        for (const { key, update } of events["messages.update"]) {
          if (update.pollUpdates) {
            const pollCreation = await getMessage(key);
            if (pollCreation) {
              console.log(
                "got poll update, aggregation: ",
                getAggregateVotesInPollMessage({
                  message: pollCreation,
                  pollUpdates: update.pollUpdates,
                }),
              );
            }
          }
        }
      }

      // if (events["message-receipt.update"]) {
      //   console.log(events["message-receipt.update"]);
      // }
      //
      // if (events["messages.reaction"]) {
      //   console.log(events["messages.reaction"]);
      // }
      //
      // if (events["presence.update"]) {
      //   console.log(events["presence.update"]);
      // }
      //
      // if (events["chats.update"]) {
      //   console.log(events["chats.update"]);
      // }
      //
      // if (events["contacts.update"]) {
      //   for (const contact of events["contacts.update"]) {
      //     if (typeof contact.imgUrl !== "undefined") {
      //       const newUrl =
      //         contact.imgUrl === null
      //           ? null
      //           : await sock!.profilePictureUrl(contact.id!).catch(() => null);
      //       console.log(
      //         `contact ${contact.id} has a new profile pic: ${newUrl}`,
      //       );
      //     }
      //   }
      // }
      //
      // if (events["chats.delete"]) {
      //   console.log("chats deleted ", events["chats.delete"]);
      // }
    },
  );

  return sock;

  async function getMessage(
    key: WAMessageKey,
  ): Promise<WAMessageContent | undefined> {
    if (store) {
      const msg = await store.loadMessage(key.remoteJid!, key.id!);
      return msg?.message || undefined;
    }

    // only if store is present
    return proto.Message.fromObject({});
  }
};
