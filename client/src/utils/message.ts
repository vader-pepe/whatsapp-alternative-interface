import { type proto } from "@whiskeysockets/baileys";
import l from "lodash";

const messageType = [
  "conversation",
  "senderKeyDistributionMessage",
  "imageMessage",
  "contactMessage",
  "locationMessage",
  "extendedTextMessage",
  "documentMessage",
  "audioMessage",
  "videoMessage",
  "call",
  "chat",
  "protocolMessage",
  "contactsArrayMessage",
  "highlyStructuredMessage",
  "fastRatchetKeySenderKeyDistributionMessage",
  "sendPaymentMessage",
  "liveLocationMessage",
  "requestPaymentMessage",
  "declinePaymentRequestMessage",
  "cancelPaymentRequestMessage",
  "templateMessage",
  "stickerMessage",
  "groupInviteMessage",
  "templateButtonReplyMessage",
  "productMessage",
  "deviceSentMessage",
  "messageContextInfo",
  "listMessage",
  "viewOnceMessage",
  "orderMessage",
  "listResponseMessage",
  "ephemeralMessage",
  "invoiceMessage",
  "buttonsMessage",
  "buttonsResponseMessage",
  "paymentInviteMessage",
  "interactiveMessage",
  "reactionMessage",
  "stickerSyncRmrMessage",
  "interactiveResponseMessage",
  "pollCreationMessage",
  "pollUpdateMessage",
  "keepInChatMessage",
  "documentWithCaptionMessage",
  "requestPhoneNumberMessage",
  "viewOnceMessageV2",
  "encReactionMessage",
  "editedMessage",
  "viewOnceMessageV2Extension",
  "pollCreationMessageV2",
  "scheduledCallCreationMessage",
  "groupMentionedMessage",
  "pinInChatMessage",
  "pollCreationMessageV3",
  "scheduledCallEditMessage",
  "ptvMessage",
  "botInvokeMessage",
  "callLogMesssage",
  "messageHistoryBundle",
  "encCommentMessage",
  "bcallMessage",
  "lottieStickerMessage",
  "eventMessage",
  "commentMessage",
  "newsletterAdminInviteMessage",
  "extendedTextMessageWithParentKey",
  "placeholderMessage",
  "encEventUpdateMessage",
];

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

/**
 * Function to get the contents of the said message
 */
export function getMessage(
  messageInfo:
    | proto.IWebMessageInfo
    | proto.IContextInfo
    | proto.Message.IFutureProofMessage
    | null,
): null | string {
  if (!messageInfo) return null;
  let message: proto.IMessage | undefined | null = null;
  if ("message" in messageInfo) {
    message = messageInfo.message;
  } else if ("quotedMessage" in messageInfo) {
    message = messageInfo.quotedMessage;
  }

  if (!message) return null;

  if ("reactions" in messageInfo) {
    const r = messageInfo.reactions;
    if (r) {
      // reactions = r.map((x) => x.text);
    }
  }

  if (message.conversation) {
    return message.conversation;
  }
  if (message.imageMessage) {
    const text = message.imageMessage.caption;
    if (text) {
      return `<img src="data:${message.imageMessage.mimetype};base64, ${message.imageMessage.jpegThumbnail}" alt="missing from server" /> ${text} `;
    }
    return `<img src="data:${message.imageMessage.mimetype};base64, ${message.imageMessage.jpegThumbnail}" alt="missing from server" /> `;
  }

  if (message.extendedTextMessage) {
    const context = message.extendedTextMessage.contextInfo;
    if (context) {
      getMessage(context);
    }
    const text = message.extendedTextMessage.text;
    if (text) {
      return text;
    }
  }

  if (message.viewOnceMessageV2) {
    getMessage(message.viewOnceMessageV2);
  }

  if (message.stickerMessage) {
    return `<img src="public/sticker.jpeg" /> `;
  }

  if (message.videoMessage) {
    return `<img src="public/video.jpeg" /> `;
  }

  if (message.reactionMessage) {
    const msg = message.reactionMessage.text;
    if (msg) {
      return `reacted ${msg}`;
    }
  }

  return `<img src="public/unimplemented.jpeg" /> `;
}
