import { type proto } from "@whiskeysockets/baileys";

/**
 * Simple function to check message type
 */
export function checkMessageType(messageInfo: proto.IWebMessageInfo) {
  const message = messageInfo.message;
  if (!message) return null;
  if ("conversation" in message) return "conversation";
  if ("imageMessage" in message) return "imageMessage";
  if ("videoMessage" in message) return "videoMessage";
  if ("stickerMessage" in message) return "stickerMessage";
  if ("extendedTextMessage" in message) return "extendedTextMessage";
  if ("groupInviteMessage" in message) return "groupInviteMessage";
  return "unimplemented";
}
export type MessageType = keyof proto.IMessage;

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
