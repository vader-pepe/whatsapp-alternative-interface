import { proto } from "baileys";
import { JSX } from "solid-js/jsx-runtime";
import { match, P } from "ts-pattern";

const API_URL = import.meta.env.VITE_EVOLUTION_API_URL;

/**
 * Function to get the contents of the said message
 */
export function GetMessage({
  messageInfo,
  jid,
}: {
  messageInfo:
  | proto.IWebMessageInfo
  | proto.IContextInfo
  | proto.Message.IFutureProofMessage
  | proto.Message.IProtocolMessage;
  jid?: string;
}): JSX.Element {
  let message: proto.IMessage | undefined | null = null;
  let mediaUrl = API_URL + `/media/`;
  let chatId: string | undefined = jid;
  let messageId: string | undefined;
  let isNewsLetter = false;

  if ("message" in messageInfo) {
    message = messageInfo.message;
  } else if ("quotedMessage" in messageInfo) {
    message = messageInfo.quotedMessage;
  } else if ("editedMessage" in messageInfo) {
    message = messageInfo.editedMessage;
  }

  if ("key" in messageInfo) {
    if (messageInfo.key?.remoteJid?.includes("@newsletter")) {
      isNewsLetter = true;
    }

    chatId = messageInfo.key?.remoteJid ?? undefined;
    messageId = messageInfo.key?.id ?? undefined;
  } else if ("stanzaId" in messageInfo) {
    messageId = messageInfo.stanzaId ?? undefined;
  }

  if ("reactions" in messageInfo) {
    const r = messageInfo.reactions;
    if (r) {
      // reactions = r.map((x) => x.text);
    }
  }

  if (!message) return null;

  const res = match(message)
    .with({ conversation: P.any }, () => <small>{message.conversation}</small>)
    .with({ imageMessage: P.any }, () => {
      if (isNewsLetter) {
        if (message.imageMessage?.url) {
          mediaUrl = `${API_URL}/mediaproxy/${encodeURIComponent(message.imageMessage.url)}`;
        } else if (message.imageMessage?.directPath) {
          mediaUrl = `${API_URL}/mediaproxy/${encodeURIComponent(`https://mmg.whatsapp.net${message!["imageMessage"]?.directPath}`)}`;
        }
      } else {
        mediaUrl = mediaUrl + `${chatId}/${messageId}`;
      }
      const caption = message.imageMessage!.caption;

      if (caption)
        return (
          <>
            <img crossorigin="anonymous" src={mediaUrl} alt="unavailable" />{" "}
            <small>{caption}</small>
          </>
        );
      return <><img crossorigin="anonymous" src={mediaUrl} alt="unavailable" /></>;
    })
    .with({ videoMessage: P.any }, () => {
      if (isNewsLetter) {
        if (message.videoMessage?.url) {
          mediaUrl = `${API_URL}/mediaproxy/${encodeURIComponent(message.videoMessage.url)}`;
        } else if (message.imageMessage?.directPath) {
          mediaUrl = `${API_URL}/mediaproxy/${encodeURIComponent(`https://mmg.whatsapp.net${message!["videoMessage"]?.directPath}`)}`;
        }
      } else {
        mediaUrl = mediaUrl + `${chatId}/${messageId}`;
      }
      const caption = message.videoMessage!.caption;
      if (caption) {
        return (
          <>
            <video crossorigin="anonymous" src={mediaUrl} /> <small>{caption}</small>
          </>
        );
      }
      return <video crossorigin="anonymous" src={mediaUrl} />;
    })
    .with({ stickerMessage: P.any }, () => {
      if (isNewsLetter) {
        if (message.stickerMessage?.url) {
          mediaUrl = `${API_URL}/mediaproxy/${encodeURIComponent(message.stickerMessage.url)}`;
        } else if (message.stickerMessage?.directPath) {
          mediaUrl = `${API_URL}/mediaproxy/${encodeURIComponent(`https://mmg.whatsapp.net${message!["stickerMessage"]?.directPath}`)}`;
        }
      } else {
        mediaUrl = mediaUrl + `${chatId}/${messageId}`;
      }
      return (
        <small>
          sticker:{" "}
          <img
            crossorigin="anonymous"
            src={mediaUrl}
            alt="link broken or missing from server"
            class="w-16"
          />
        </small>
      );
    })
    .with({ reactionMessage: P.any }, () => (
      <small>reacted: {message.reactionMessage!.text}</small>
    ))
    .with({ extendedTextMessage: P.any }, () => {
      const text = message.extendedTextMessage!.text;
      if (text) {
        return <small>{text}</small>;
      }
      return JSON.stringify(message.extendedTextMessage);
    })
    .with({ protocolMessage: P.any }, () => {
      const edited = message.protocolMessage!.editedMessage;
      if (!edited) {
        return JSON.stringify(message.protocolMessage);
      }
      return GetMessage({ messageInfo: message.protocolMessage!, jid: chatId });
    })
    // .with({ associatedChildMessage: P.any }, () => GetMessage({ messageInfo: message.associatedChildMessage!, extra: { jid: chatId, messageId } }))
    // TODO: handle documents
    .with({ documentMessage: P.any }, () => "Document")
    .with({ documentWithCaptionMessage: P.any }, () => "Document with Caption")
    .otherwise(() => JSON.stringify(message));

  return res;
}

