import { type proto } from "baileys";
import { JSX } from "solid-js/jsx-runtime";

import { ChatBubble } from "./chat-bubble";
import { checkMessageType } from "../../utils";
import { GetMessage } from "../message";

export function ChatBubbles({
  messageInfo,
  id
}: {
  messageInfo: proto.IWebMessageInfo;
  id?: string;
}) {
  const msgType = checkMessageType(messageInfo);
  const message = messageInfo.message;
  let extendedContent: JSX.Element | null = null;
  let participant: string | null | undefined = null;

  const setContextAndParticipant = (context: proto.IContextInfo) => {
    extendedContent = GetMessage({ messageInfo: context, jid: id });
    // TODO: WA sialan ini ilang lagi
    participant = null;
  };

  if (message && msgType !== null) {
    participant = message.chat?.displayName;

    if ("extendedTextMessage" in message) {
      const context = message.extendedTextMessage!.contextInfo;
      if (context) {
        setContextAndParticipant(context);
      }
    } else if ("stickerMessage" in message) {
      const context = message.stickerMessage!.contextInfo;
      if (context) {
        setContextAndParticipant(context);
      }
    } else if ("videoMessage" in message) {
      const context = message.videoMessage!.contextInfo;
      if (context) {
        setContextAndParticipant(context);
      }
    } else if ("imageMessage" in message) {
      const context = message.imageMessage!.contextInfo;
      if (context) {
        setContextAndParticipant(context);
      }
    } else if ("audioMessage" in message) {
      const context = message.audioMessage!.contextInfo;
      if (context) {
        setContextAndParticipant(context);
      }
    } else if ("locationMessage" in message) {
      const context = message.locationMessage!.contextInfo;
      if (context) {
        setContextAndParticipant(context);
      }
    } else if ("liveLocationMessage" in message) {
      const context = message.locationMessage!.contextInfo;
      if (context) {
        setContextAndParticipant(context);
      }
    } else if ("ptvMessage" in message) {
      const context = message.ptvMessage!.contextInfo;
      if (context) {
        setContextAndParticipant(context);
      }
    } else if ("eventMessage" in message) {
      const context = message.eventMessage!.contextInfo;
      if (context) {
        setContextAndParticipant(context);
      }
    }

    const content = GetMessage({ messageInfo });

    return (
      <>
        {messageInfo.key.fromMe ? (
          <div id={id} class="chat chat-end">
            <ChatBubble
              participant={participant}
              extendedContent={extendedContent}
              mainContent={content}
              bubbleStyle="chat-bubble-info"
              isFromMe={true}
            />
          </div>
        ) : (
          <div id={id}>
            <small class="ml-4">
              {messageInfo.pushName || messageInfo.key.remoteJid}
            </small>
            <div class="flex flex-col chat chat-start">
              <ChatBubble
                participant={participant}
                extendedContent={extendedContent}
                mainContent={content}
                bubbleStyle=""
                isFromMe={false}
              />
            </div>
          </div>
        )}
      </>
    );
  }

  return null;

};
