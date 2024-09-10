import { type proto } from "@whiskeysockets/baileys";
import { checkMessageType } from "../../utils/message";
import { ChatBubble } from "./chat-bubble";
import l from "lodash";
import { GetMessage } from "../message";
import { JSX } from "solid-js/jsx-runtime";

export function ChatBubbles({
  messageInfo,
  id,
}: {
  messageInfo: proto.IWebMessageInfo;
  id?: string;
}) {
  const msgType = checkMessageType(messageInfo);
  const message = messageInfo.message;
  let extendedContent: JSX.Element | null = null;
  let participant: string | null | undefined = null;

  const setContextAndParticipant = (context: proto.IContextInfo) => {
    extendedContent = GetMessage({ messageInfo: context });
    participant = context.participant;
  };

  if (message && msgType !== null) {
    participant = message.chat?.displayName;
    if (l.includes(msgType, "extendedTextMessage")) {
      const context = message.extendedTextMessage!.contextInfo;
      if (context) {
        setContextAndParticipant(context);
      }
    } else if (l.includes(msgType, "stickerMessage")) {
      const context = message.stickerMessage!.contextInfo;
      if (context) {
        setContextAndParticipant(context);
      }
    } else if (l.includes(msgType, "videoMessage")) {
      const context = message.videoMessage!.contextInfo;
      if (context) {
        setContextAndParticipant(context);
      }
    } else if (l.includes(msgType, "imageMessage")) {
      const context = message.imageMessage!.contextInfo;
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
}
