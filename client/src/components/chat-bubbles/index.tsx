import { type proto } from "@whiskeysockets/baileys";
import { checkMessageType, getMessage } from "../../utils/message";
import { ChatBubble } from "./chat-bubble";
import l from "lodash";

export function ChatBubbles({
  messageInfo,
  id,
}: {
  messageInfo: proto.IWebMessageInfo;
  id?: string;
}) {
  const msgType = checkMessageType(messageInfo);
  const message = messageInfo.message;
  let extendedContent: string | null = null;
  let participant: string | null | undefined = null;

  if (message && msgType !== null) {
    participant = message.chat?.displayName;
    if (l.includes(msgType, "extendedTextMessage")) {
      const extendedMessage = message.extendedTextMessage;
      if (extendedMessage) {
        const context = extendedMessage.contextInfo;
        if (context) {
          extendedContent = getMessage(context);
        }
      }
      participant = extendedMessage?.contextInfo?.participant;
    }

    const content = getMessage(messageInfo);

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
