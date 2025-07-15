import { type proto } from "baileys";
import mime from "mime-types";

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

export async function handleFileUpload(file: File, sendAsSticker = false) {
  const arrayBuffer = await file.arrayBuffer()
  const buffer = Buffer.from(arrayBuffer)
  const mimeType = file.type || mime.lookup(file.name) || 'application/octet-stream'

  // const ext = mime.extension(mimeType) || ''
  const isImage = mimeType.startsWith('image/')
  const isVideo = mimeType.startsWith('video/')
  const isAudio = mimeType.startsWith('audio/')
  const isPDF = mimeType === 'application/pdf'

  let content

  if (isImage && sendAsSticker) {
    content = {
      sticker: { mimetype: mimeType, buffer },
    }
  } else if (isImage) {
    content = {
      image: { mimetype: mimeType, buffer },
      caption: file.name,
    }
  } else if (isVideo) {
    content = {
      video: { mimetype: mimeType, buffer },
      caption: file.name,
    }
  } else if (isAudio) {
    content = {
      audio: { mimetype: mimeType, buffer },
      ptt: true,
    }
  } else if (isPDF) {
    content = {
      document: { mimetype: mimeType, buffer },
      fileName: file.name,
    }
  } else {
    content = {
      document: { mimetype: mimeType, buffer },
      fileName: file.name,
    }
  }

  // await sendAll(sock, currentChat.jid, content)
}
