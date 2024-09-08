import { type proto } from "@whiskeysockets/baileys";
import l from "lodash";

export type MessageType = keyof proto.IMessage;

/**
 * Simple function to check message type
 */
export function checkMessageType(messageInfo: proto.IWebMessageInfo | proto.IContextInfo) {
  let message: proto.IMessage | undefined | null = null;
  if ("message" in messageInfo) {
    message = messageInfo.message
  } else if ("quotedMessage" in messageInfo) {
    message = messageInfo.quotedMessage
  }
  if (!message) return null;
  const keys = Object.keys(message);
  return keys as MessageType[]
}

type Handler = (key: string, value: any) => void;
const keysToCheck: MessageType[] = []
function handleKeys<T extends Record<string, any>>(obj: T, keysToCheck: string[], handler: Handler): void {
  keysToCheck.forEach(key => {
    if (key in obj) {
      handler(key, obj[key]);
    }
  });
}

/**
 * Function to get the contents of the said message
 */
export function returnMessageBasedOnMessageType(
  messageInfo: proto.IWebMessageInfo | proto.IContextInfo | null,
): null | string {
  if (!messageInfo) return null;
  let message: proto.IMessage | undefined | null = null;
  if ("message" in messageInfo) {
    message = messageInfo.message;
  } else if ("quotedMessage" in messageInfo) {
    message = messageInfo.quotedMessage;
  }

  if (!message) return null;

  if (message.conversation) return message.conversation;
  if (message.imageMessage) {
    const text = message.imageMessage.caption;
    if (text) {
      return `<img src="data:${message.imageMessage.mimetype};base64, ${message.imageMessage.jpegThumbnail}" alt="generated" /> ${text}`;
    }
    return `<img src="data:${message.imageMessage.mimetype};base64, ${message.imageMessage.jpegThumbnail}" alt="generated" />`;
  }
  if (message.videoMessage) {
    const text = message.videoMessage.caption;
    if (text) {
      return text;
    }
    return JSON.stringify(message.videoMessage) + "unimplementedVideoMessage";
  }
  if (message.extendedTextMessage) {
    const context = message.extendedTextMessage.contextInfo;
    if (context) {
      returnMessageBasedOnMessageType(context);
    }
    const text = message.extendedTextMessage.text;
    if (text) {
      return text;
    }
    return (
      JSON.stringify(message.extendedTextMessage) +
      "unimplementedExtendedMessage"
    );
  }
  if (message.stickerMessage)
    return (
      JSON.stringify(message.stickerMessage) + "unimplementedStickerMessage"
    );
  return "unimplementedUnknownMessage";
}
