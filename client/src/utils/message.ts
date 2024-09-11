import { type Chat, type WAMessage, type proto } from "@whiskeysockets/baileys";
import l from "lodash";

export type MessageType = keyof proto.IMessage;
/**
 * Simple function to check message type
 */
export function checkMessageType(
  messageInfo: proto.IWebMessageInfo | proto.IContextInfo,
) {
  let message: proto.IMessage | undefined | null = null;
  if ("message" in messageInfo) {
    message = messageInfo.message;
  } else if ("quotedMessage" in messageInfo) {
    message = messageInfo.quotedMessage;
  }
  if (!message) return null;
  const keys = Object.keys(message);
  return keys as MessageType[];
}
