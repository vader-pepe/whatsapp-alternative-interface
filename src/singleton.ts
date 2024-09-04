import { Boom } from "@hapi/boom";
import {
  AnyMessageContent,
  BinaryInfo,
  delay,
  DisconnectReason,
  encodeWAM,
  proto,
} from "@whiskeysockets/baileys";
import { type WebSocket } from "ws";
import { type Socket, startSock } from "./wa-socket";
import fs from "fs/promises";

export class WSSingleton {
  socket: Socket;
  ws: WebSocket;

  constructor(sc: Socket, ws: WebSocket) {
    this.socket = sc;
    this.ws = ws;
  }

  public async start() {
    this.socket.ev.process(async (e) => {
      if (e["connection.update"]) {
        const update = e["connection.update"];
        const { connection, lastDisconnect } = update;
        if (connection === "close") {
          // reconnect if not logged out
          if (
            (lastDisconnect?.error as Boom)?.output?.statusCode !==
            DisconnectReason.loggedOut
          ) {
            startSock();
          } else {
            console.log("Connection closed. You are logged out.");
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

          const result = await this.socket.sendWAMBuffer(buffer);
          console.log(result);
        }

        if (update.qr) {
          this.ws.send(update.qr.toString());
        }
      }

      // history received
      if (e["messaging-history.set"]) {
        const { chats, contacts, messages, isLatest, progress, syncType } =
          e["messaging-history.set"];
        this.ws.send(chats);
        if (syncType === proto.HistorySync.HistorySyncType.ON_DEMAND) {
          console.log("received on-demand history sync, messages=", messages);
        }
        console.log(
          `recv ${chats.length} chats, ${contacts.length} contacts, ${messages.length} msgs (is latest: ${isLatest}, progress: ${progress}%), type: ${syncType}`,
        );
      }
    });
  }

  private async sendMessageWTyping(msg: AnyMessageContent, jid: string) {
    await this.socket.presenceSubscribe(jid);
    await delay(500);

    await this.socket.sendPresenceUpdate("composing", jid);
    await delay(2000);

    await this.socket.sendPresenceUpdate("paused", jid);

    await this.socket.sendMessage(jid, msg);
  }
}
