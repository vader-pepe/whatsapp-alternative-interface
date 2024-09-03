import {
  getAggregateVotesInPollMessage,
  isJidNewsletter,
  proto,
  type BaileysEventMap,
} from "@whiskeysockets/baileys";
import { type WebSocket } from "ws";

const doReplies = process.argv.includes("--do-reply");

export class WSSingleton {
  baileys: Partial<BaileysEventMap> | null;
  ws: WebSocket | null;

  constructor(baileys: Partial<BaileysEventMap>, ws: WebSocket) {
    this.baileys = baileys;
    this.ws = ws;
  }

  public async start() {
    if (this.baileys) {
      // history received
      if (this.baileys["messaging-history.set"]) {
        const { chats, contacts, messages, isLatest, progress, syncType } =
          this.baileys["messaging-history.set"];
        // ws.send(chats)
        if (syncType === proto.HistorySync.HistorySyncType.ON_DEMAND) {
          console.log("received on-demand history sync, messages=", messages);
        }
        console.log(
          `recv ${chats.length} chats, ${contacts.length} contacts, ${messages.length} msgs (is latest: ${isLatest}, progress: ${progress}%), type: ${syncType}`,
        );
      }

      // received a new message
      if (this.baileys["messages.upsert"]) {
        const upsert = this.baileys["messages.upsert"];
        console.log("recv messages ", JSON.stringify(upsert, undefined, 2));

        if (upsert.type === "notify") {
          for (const msg of upsert.messages) {
            if (
              msg.message?.conversation ||
              msg.message?.extendedTextMessage?.text
            ) {
              const text =
                msg.message?.conversation ||
                msg.message?.extendedTextMessage?.text;
              // if (text == "requestPlaceholder" && !upsert.requestId) {
              //   const messageId = await sock.requestPlaceholderResend(msg.key);
              //   console.log("requested placeholder resync, id=", messageId);
              // } else if (upsert.requestId) {
              //   console.log(
              //     "Message received from phone, id=",
              //     upsert.requestId,
              //     msg,
              //   );
              // }

              // go to an old chat and send this
              // if (text == "onDemandHistSync") {
              //   const messageId = await sock.fetchMessageHistory(
              //     50,
              //     msg.key,
              //     msg.messageTimestamp!,
              //   );
              //   console.log("requested on-demand sync, id=", messageId);
              // }
            }

            // if (
            //   !msg.key.fromMe &&
            //   doReplies &&
            //   !isJidNewsletter(msg.key?.remoteJid!)
            // ) {
            //   console.log("replying to", msg.key.remoteJid);
            //   await sock!.readMessages([msg.key]);
            //   await sendMessageWTyping(
            //     { text: "Hello there!" },
            //     msg.key.remoteJid!,
            //   );
            // }
          }
        }
      }

      // messages updated like status delivered, message deleted etc.
      if (this.baileys["messages.update"]) {
        console.log(
          JSON.stringify(this.baileys["messages.update"], undefined, 2),
        );

        for (const { key, update } of this.baileys["messages.update"]) {
          // if (update.pollUpdates) {
          //   const pollCreation = await getMessage(key);
          //   if (pollCreation) {
          //     console.log(
          //       "got poll update, aggregation: ",
          //       getAggregateVotesInPollMessage({
          //         message: pollCreation,
          //         pollUpdates: update.pollUpdates,
          //       }),
          //     );
          //   }
          // }
        }
      }
    }
  }
}
