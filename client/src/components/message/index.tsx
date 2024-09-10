import { proto } from "@whiskeysockets/baileys";

/**
 * Function to get the contents of the said message
 */
export function GetMessage({
  messageInfo,
}: {
  messageInfo:
    | proto.IWebMessageInfo
    | proto.IContextInfo
    | proto.Message.IFutureProofMessage
    | proto.Message.IProtocolMessage;
}) {
  let message: proto.IMessage | undefined | null = null;
  if ("message" in messageInfo) {
    message = messageInfo.message;
  } else if ("quotedMessage" in messageInfo) {
    message = messageInfo.quotedMessage;
  } else if ("editedMessage" in messageInfo) {
    message = messageInfo.editedMessage;
  }

  if (!message) return null;

  if ("reactions" in messageInfo) {
    const r = messageInfo.reactions;
    if (r) {
      // reactions = r.map((x) => x.text);
    }
  }

  if (message.conversation) {
    return <small>{message.conversation}</small>;
  }

  if (message.imageMessage) {
    const text = message.imageMessage.caption;
    const encription = message.imageMessage.fileSha256 as unknown as
      | string
      | null
      | undefined;
    const mime = message.imageMessage.mimetype;

    if (text && mime && encription) {
      const ext = mime.split("/");
      return (
        <>
          <img
            src={`data:${message.imageMessage.mimetype};base64, ${message.imageMessage.jpegThumbnail}`}
          />
          <small>{text}</small>
        </>
      );
    }

    if (mime && encription) {
      return (
        <img
          src={`data:${message.imageMessage.mimetype};base64, ${message.imageMessage.jpegThumbnail}`}
          alt="not yet fetched"
        />
      );
    }
  }

  if (message.videoMessage) {
    return <img src="/video.jpeg" />;
  }

  if (message.stickerMessage) {
    const mime = message.stickerMessage.mimetype;
    const encription = message.stickerMessage.fileSha256 as unknown as string;
    if (mime && encription) {
      const ext = mime.split("/");
      return <img src={``} alt="not yet fetched" />;
    }
    return <img src="/sticker.jpeg" />;
  }

  if (message.extendedTextMessage) {
    const text = message.extendedTextMessage.text;
    if (text) return <small>{text}</small>;
  }

  if (message.reactionMessage) {
    const text = message.reactionMessage.text;
    if (text) {
      return <small>reacted: {text}</small>;
    }
  }

  if (message.viewOnceMessageV2) {
    return GetMessage({ messageInfo: message.viewOnceMessageV2 });
  }

  if (message.editedMessage) {
    return GetMessage({ messageInfo: message.editedMessage });
  }

  if (message.protocolMessage) {
    const edited = message.protocolMessage.editedMessage;
    if (!edited) {
      return JSON.stringify(message.protocolMessage);
    }
    return GetMessage({ messageInfo: message.protocolMessage });
  }

  if (message.viewOnceMessageV2Extension) {
    return GetMessage({ messageInfo: message.viewOnceMessageV2Extension });
  }

  return (
    <>
      <img src="/unimplemented.jpeg" />
      debug: {JSON.stringify(message)}
    </>
  );
}
