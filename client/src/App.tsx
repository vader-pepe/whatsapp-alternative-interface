import {
  type proto,
  type Chat,
  type WAMessage,
  type AuthenticationState,
} from "@whiskeysockets/baileys";
import axios from "axios";
import { createSignal, type Component, For, JSX } from "solid-js";
import l from "lodash";

const App: Component = () => {
  let virtualScrollContainer: HTMLElement;
  const [qr, setQr] = createSignal<string | undefined>(undefined);
  const [isConnectionEstablished, setIsConnectionEstablished] =
    createSignal(false);
  const [chats, setChats] = createSignal<Chat[]>([]);
  const [currentChat, setCurrentChat] = createSignal<Chat>();
  const [currentChatMessages, setCurrentChatMessages] = createSignal<
    WAMessage[]
  >([]);
  const [showChatWindow, setShowChatWindow] = createSignal(false);

  async function getChats() {
    const d = await axios.get<{ chats: Chat[] }>(`http://127.0.0.1:3001/chats`);
    if (d.data) {
      setChats(d.data.chats);
    }
  }

  function sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function checkMessageType(messageInfo: proto.IWebMessageInfo) {
    const message = messageInfo.message;
    if (!message) return null;
    if ("conversation" in message) return "conversation";
    if ("imageMessage" in message) return "imageMessage";
    if ("videoMessage" in message) return "videoMessage";
    if ("stickerMessage" in message) return "stickerMessage";
    if ("extendedTextMessage" in message) return "extendedTextMessage";
    return "unimplemented";
  }
  type MessageType = ReturnType<typeof checkMessageType>;

  function ChatBubbles({
    messageInfo,
  }: {
    messageInfo: proto.IWebMessageInfo;
  }) {
    const msgType = checkMessageType(messageInfo);
    const message = messageInfo.message;
    let extendedContent: string | null = null;
    let participant: string | null | undefined = null;

    if (message && msgType !== null) {
      participant = message.chat?.displayName;
      if (msgType === "extendedTextMessage") {
        const extendedMessage = message.extendedTextMessage;
        extendedContent = returnMessageBasedOnMessageType(
          extendedMessage?.contextInfo || null,
        );
        participant = extendedMessage?.contextInfo?.participant;
      }

      // Define a reusable chat bubble component
      const ChatBubble = ({
        participant,
        extendedContent,
        mainContent,
        bubbleStyle,
        isFromMe,
      }: {
        participant?: string | null;
        extendedContent?: string | null;
        mainContent: JSX.Element | null;
        bubbleStyle: string;
        isFromMe: boolean;
      }) => (
        <div class={`break-words text-wrap chat-bubble ${bubbleStyle}`}>
          {extendedContent ? (
            <div
              class={`"px-2 py-1 ${isFromMe ? "bg-blue-300" : "bg-gray-700"} ${isFromMe ? "text-black" : "text-white"} rounded-t-md flex flex-col text-left`}
            >
              {participant ? <small>{participant}</small> : null}
              {extendedContent}
            </div>
          ) : null}
          {mainContent}
        </div>
      );

      // Rendering based on whether the message is from the user
      return (
        <>
          {messageInfo.key.fromMe ? (
            <div class="chat chat-end">
              <ChatBubble
                participant={participant}
                extendedContent={extendedContent}
                mainContent={returnMessageBasedOnMessageType(messageInfo)}
                bubbleStyle="chat-bubble-info"
                isFromMe={true}
              />
            </div>
          ) : (
            <>
              <small class="ml-4">
                {messageInfo.pushName || messageInfo.key.remoteJid}
              </small>
              <div class="flex flex-col chat chat-start">
                <ChatBubble
                  participant={participant}
                  extendedContent={extendedContent}
                  mainContent={returnMessageBasedOnMessageType(messageInfo)}
                  bubbleStyle=""
                  isFromMe={false}
                />
              </div>
            </>
          )}
        </>
      );
    }

    return null;
  }

  function returnMessageBasedOnMessageType(
    messageInfo: proto.IWebMessageInfo | proto.IContextInfo | null,
  ): null | string {
    if (!messageInfo) return null;
    let message: proto.IMessage | undefined | null = null;
    let msgType: MessageType = "conversation";
    if ("message" in messageInfo) {
      message = messageInfo.message;
      msgType = checkMessageType(messageInfo);
    } else if ("quotedMessage" in messageInfo) {
      message = messageInfo.quotedMessage;
    }

    if (!message) return null;

    switch (msgType) {
      case "conversation":
        return message.conversation!;
      case "imageMessage":
        return (
          JSON.stringify(message.imageMessage!) + "unimplementedImageMessage"
        );
      case "videoMessage":
        return (
          JSON.stringify(message.videoMessage!) + "unimplementedVideoMessage"
        );
      case "stickerMessage":
        return (
          JSON.stringify(message.stickerMessage!) +
          "unimplementedStickerMessage"
        );
      case "extendedTextMessage":
        // TODO: fix this
        // const context = message.extendedTextMessage!.contextInfo;
        // if (context) {
        //   const extra = returnMessageBasedOnMessageType(context);
        //   if (extra) {
        //     return extra;
        //   }
        //   return message.extendedTextMessage!.text || null;
        // }
        return message.extendedTextMessage!.text || null;
      default:
        return JSON.stringify(message);
    }
  }

  function setChatsRow(chat: Chat) {
    const messages = chat.messages;

    if (messages && messages.length > 0) {
      // Get the first message info
      const firstMessageInfo = messages[0].message;
      if (firstMessageInfo) {
        // Return the type of the first message
        return returnMessageBasedOnMessageType(firstMessageInfo);
      }
      return null;
    }

    // Default case if no messages or no message info
    return null;
  }

  async function openChatWindow(chat: Chat) {
    setCurrentChat(chat);
    setShowChatWindow(true);
    const m = await axios.get<{ messages: WAMessage[] }>(
      `http://127.0.0.1:3001/messages/${chat.id}`,
    );
    if (m.data) {
      setCurrentChatMessages(m.data.messages);
    }
  }

  function closeChatWindow() {
    setCurrentChat((_prev) => undefined);
    setShowChatWindow(false);
  }

  // if got new incoming message, loop over chats, look for matching msg, then append
  function appendIncomingMessage(remoteMsgs: proto.IWebMessageInfo[]) {
    const currentChats = l.cloneDeep(chats());
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
      setChats(currentChats);
    }
  }

  function determineChat(chat: Chat): "group" | "person" | "story" | "unknown" {
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
  type ChatType = ReturnType<typeof determineChat>;

  const socket = new WebSocket("ws://localhost:8081");
  // Connection opened
  socket.addEventListener("open", (_event) => {
    setIsConnectionEstablished(true);
  });

  socket.addEventListener("close", (_event) => {
    setIsConnectionEstablished(false);
  });

  socket.addEventListener("message", async (event) => {
    const data = event.data as string;
    const raw = JSON.parse(data);
    if (raw.qr) {
      setQr(raw.qr);
    }

    if (raw.messages) {
      const messages = JSON.parse(raw.messages) as proto.IWebMessageInfo[];
      appendIncomingMessage(messages);
    }

    if (raw.state) {
      const state = raw.state as AuthenticationState["creds"];
      if (state.account) {
        await getChats();
      }
    }
  });

  return (
    <div
      ref={(el) => (virtualScrollContainer = el)}
      class={`relative py-3 px-4 h-screen ${!isConnectionEstablished() ? "flex justify-center items-center" : ""} `}
    >
      {qr() ? (
        <div class="h-screen flex justify-center items-center absolute inset-0 backdrop-blur-md z-10">
          <div class="bg-white" innerHTML={qr()}></div>
        </div>
      ) : null}

      {isConnectionEstablished() ? (
        <>
          <label class="input input-bordered flex items-center gap-2">
            <input type="text" class="grow" placeholder="Search Contact..." />
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 16 16"
              fill="currentColor"
              class="h-4 w-4 opacity-70"
            >
              <path
                fill-rule="evenodd"
                d="M9.965 11.026a5 5 0 1 1 1.06-1.06l2.755 2.754a.75.75 0 1 1-1.06 1.06l-2.755-2.754ZM10.5 7a3.5 3.5 0 1 1-7 0 3.5 3.5 0 0 1 7 0Z"
                clip-rule="evenodd"
              />
            </svg>
          </label>

          <div class="flex flex-col gap-2 mt-4">
            <For each={chats()}>
              {(chat, index) => {
                // WARNING: THIS WILL BE CATASTROPHIC
                if (determineChat(chat) !== "unknown" && setChatsRow(chat)) {
                  return (
                    <>
                      <div
                        onclick={() => openChatWindow(chat)}
                        role="button"
                        class="cursor-pointer relative transition duration-150 border text-justify break-words border-gray-700 hover:border-gray-300 px-3 py-2 rounded-sm min-h-[80px] max-h-[80px] overflow-hidden"
                      >
                        <h1>{chat.name || chat.id}</h1>
                        <small class="">{setChatsRow(chat)}</small>
                        {chat.unreadCount && chat.unreadCount > 0 ? (
                          <div class="absolute right-0 top-0 badge badge-primary badge-lg h-8">
                            {chat.unreadCount}
                          </div>
                        ) : null}
                      </div>
                    </>
                  );
                }
                return null;
              }}
            </For>
          </div>
        </>
      ) : (
        <h1 class="text-5xl">{`:(`}</h1>
      )}

      {showChatWindow() ? (
        <>
          <div class="flex flex-col h-screen fixed inset-0 backdrop-blur-md z-10 px-3 py-4">
            <div class="flex gap-4">
              <button onclick={() => closeChatWindow()}>
                <svg
                  class="w-6 fill-white"
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 448 512"
                >
                  <path d="M9.4 233.4c-12.5 12.5-12.5 32.8 0 45.3l160 160c12.5 12.5 32.8 12.5 45.3 0s12.5-32.8 0-45.3L109.2 288 416 288c17.7 0 32-14.3 32-32s-14.3-32-32-32l-306.7 0L214.6 118.6c12.5-12.5 12.5-32.8 0-45.3s-32.8-12.5-45.3 0l-160 160z" />
                </svg>
              </button>
              <h1 class="font-semibold text-xl">
                {currentChat()?.name || currentChat()?.id}
              </h1>
            </div>
            <div class="mt-2 max-w-full max-h-[700px] min-h-[300px] py-3 px-2 border border-gray-700 rounded-md overflow-y-scroll overflow-x-hidden">
              <For
                each={currentChatMessages()}
                fallback={<div>Loading...</div>}
              >
                {(message) => {
                  return <ChatBubbles messageInfo={message} />;
                }}
              </For>
            </div>
            <textarea
              class="mt-2 textarea textarea-bordered"
              placeholder="Type a message"
            ></textarea>
          </div>
        </>
      ) : null}
    </div>
  );
};

export default App;
