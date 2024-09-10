import { type proto, type Chat } from "@whiskeysockets/baileys";
import l from "lodash";
import { GetMessage } from "../components/message";

/**
 * Sets up the chat to only shows first message in home
 */
export function setChatsRow(chat: Chat) {
  const messages = chat.messages;

  if (messages && messages.length > 0) {
    const firstMessageInfo = messages[0].message;
    if (firstMessageInfo) {
      return GetMessage({ messageInfo: firstMessageInfo });
    }
    return null;
  }
  return null;
}

/**
 * Determine chat type
 */
export function chatType(chat: Chat): "group" | "person" | "story" | "unknown" {
  switch (true) {
    case chat.id.endsWith("@g.us"):
      return "group";
    case chat.id.endsWith("@s.whatsapp.net"):
      return "person";
    case chat.id.endsWith("@broadcast"):
      return "story";

    default:
      return "unknown";
  }
}
export type ChatType = ReturnType<typeof chatType>;

/**
 * Append incoming message to whichever chat its belong to
 */
export function setsNewMessageToChat(
  remoteMsgs: proto.IWebMessageInfo[],
  chats: Chat[],
) {
  const currentChats = l.cloneDeep(chats);
  let targetChat: Chat | undefined;
  remoteMsgs.forEach((msg) => {
    targetChat = l.find(currentChats, (c) => c.id === msg.key.remoteJid);
    if (targetChat) {
      const index = l.indexOf(currentChats, targetChat);
      const updatedChat: Chat = {
        ...targetChat,
        messages: [
          {
            message: msg,
          },
        ],
      };
      currentChats.splice(index, 1);
      currentChats.unshift(updatedChat);
    }
  });

  if (targetChat) {
    return currentChats;
  }
  return chats;
}
