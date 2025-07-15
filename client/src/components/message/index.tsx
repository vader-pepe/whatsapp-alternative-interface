import { proto } from "baileys";
import { JSX } from "solid-js/jsx-runtime";
import { match, P } from "ts-pattern";

const API_URL = import.meta.env.VITE_EVOLUTION_API_URL;

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
}): JSX.Element {
  let message: proto.IMessage | undefined | null = null;
  let mediaUrl = API_URL + `/media/`;
  if ("message" in messageInfo) {
    message = messageInfo.message;
  } else if ("quotedMessage" in messageInfo) {
    message = messageInfo.quotedMessage;
  } else if ("editedMessage" in messageInfo) {
    message = messageInfo.editedMessage;
  }

  if ("reactions" in messageInfo) {
    const r = messageInfo.reactions;
    if (r) {
      // reactions = r.map((x) => x.text);
    }
  }

  if (!message) return null;
  if ("key" in messageInfo) {
    let chatId = `${messageInfo.key!.remoteJid}`;
    mediaUrl += `${chatId}/${messageInfo.key!.id}`;
  }
  const res = match(message)
    .with({ conversation: P.any }, () => <small>{message.conversation}</small>)
    .with({ imageMessage: P.any }, () => {
      const caption = message.imageMessage!.caption;

      if (caption)
        return (
          <>
            <img crossorigin="anonymous" src={mediaUrl} alt="link broken or missing from server" />{" "}
            <small>{caption}</small>
          </>
        );
      return <img crossorigin="anonymous" src={mediaUrl} alt="link broken or missing from server" />;
    })
    .with({ videoMessage: P.any }, () => {
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
    .with({ viewOnceMessageV2: P.any }, () =>
      GetMessage({ messageInfo: message.viewOnceMessageV2! }),
    )
    .with({ viewOnceMessageV2Extension: P.any }, () => GetMessage({ messageInfo: message.viewOnceMessageV2Extension! }))
    .with({ viewOnceMessage: P.any }, () => GetMessage({ messageInfo: message.viewOnceMessage! }))
    .with({ editedMessage: P.any }, () =>
      GetMessage({ messageInfo: message.editedMessage! }),
    )
    .with({ protocolMessage: P.any }, () => {
      const edited = message.protocolMessage!.editedMessage;
      if (!edited) {
        return JSON.stringify(message.protocolMessage);
      }
      return GetMessage({ messageInfo: message.protocolMessage! });
    })
    .with({ viewOnceMessageV2Extension: P.any }, () =>
      GetMessage({ messageInfo: message.viewOnceMessageV2Extension! }),
    )
    // TODO: handle documents
    .with({ documentMessage: P.any }, () => "Secret Document")
    .with({ documentWithCaptionMessage: P.any }, () => "Secret Document")
    .otherwise(() => JSON.stringify(message));

  // if (message.conversation) {
  //   return <small>{message.conversation}</small>;
  // }
  //
  // if (message.imageMessage) {
  //   const text = message.imageMessage.caption;
  //   const encription = message.imageMessage.fileSha256 as unknown as
  //     | string
  //     | null
  //     | undefined;
  //   const mime = message.imageMessage.mimetype;
  //
  //   // if (text && mime && encription) {
  //   //   const ext = mime.split("/");
  //   //   return (
  //   //     <>
  //   //       <img
  //   //         src={`data:${message.imageMessage.mimetype};base64, ${message.imageMessage.jpegThumbnail}`}
  //   //       />
  //   //       <small>{text}</small>
  //   //     </>
  //   //   );
  //   // }
  //   //
  //   // if (mime && encription) {
  //   //   return (
  //   //     <img
  //   //       src={`data:${message.imageMessage.mimetype};base64, ${message.imageMessage.jpegThumbnail}`}
  //   //       alt="not yet fetched"
  //   //     />
  //   //   );
  //   // }
  //   return <span class="loading loading-spinner loading-md"></span>;
  // }
  //
  // if (message.videoMessage) {
  //   return <span class="loading loading-spinner loading-md"></span>;
  //   // return <img src="/video.jpeg" />;
  // }
  //
  // if (message.stickerMessage) {
  //   return <span class="loading loading-spinner loading-md"></span>;
  //   // const mime = message.stickerMessage.mimetype;
  //   // const encription = message.stickerMessage.fileSha256 as unknown as string;
  //   // if (mime && encription) {
  //   //   const ext = mime.split("/");
  //   //   return <img src={``} alt="not yet fetched" />;
  //   // }
  //   // return <img src="/sticker.jpeg" />;
  // }
  //
  // if (message.extendedTextMessage) {
  //   const text = message.extendedTextMessage.text;
  //   if (text) return <small>{text}</small>;
  // }
  //
  // if (message.reactionMessage) {
  //   const text = message.reactionMessage.text;
  //   if (text) {
  //     return <small>reacted: {text}</small>;
  //   }
  // }
  //
  // if (message.viewOnceMessageV2) {
  //   return GetMessage({ messageInfo: message.viewOnceMessageV2 });
  // }
  //
  // if (message.editedMessage) {
  //   return GetMessage({ messageInfo: message.editedMessage });
  // }
  //
  // if (message.protocolMessage) {
  //   const edited = message.protocolMessage.editedMessage;
  //   if (!edited) {
  //     return JSON.stringify(message.protocolMessage);
  //   }
  //   return GetMessage({ messageInfo: message.protocolMessage });
  // }
  //
  // if (message.viewOnceMessageV2Extension) {
  //   return GetMessage({ messageInfo: message.viewOnceMessageV2Extension });
  // }

  return res;
}

