import {
  type proto,
  type Chat,
  type Contact,
  type WAMessage,
  type AuthenticationState,
  type makeInMemoryStore,
} from "@whiskeysockets/baileys";
import axios from "axios";
import { createSignal, type Component, For } from "solid-js";

type Store = ReturnType<typeof makeInMemoryStore>;

const App: Component = () => {
  const [qr, setQr] = createSignal<string | undefined>(undefined);
  const [isConnectionEstablished, setIsConnectionEstablished] =
    createSignal(false);
  const [chats, setChats] = createSignal<Chat[]>([]);
  const [showChatWindow, setShowChatWindow] = createSignal(false);

  async function getChats() {
    const c = await axios.get<{ chats: Store["chats"] }>(
      `http://127.0.0.1:3001/chats`,
    );
    const m = await axios.get<{ messages: Store["messages"] }>(
      `http://127.0.0.1:3001/messages`,
    );
    console.log(m.data);
    console.log(c.data);
  }

  function setChatsRow(chat: Chat) {
    const msg = chat.messages?.[0].message?.message;
    if (msg) {
      switch (true) {
        // group
        case Object.keys(msg)[0].includes("conversation"):
          return msg.conversation;
        // image
        case Object.keys(msg)[0].includes("imageMessage"):
          return "imageMessage";
        // video
        case Object.keys(msg)[0].includes("videoMessage"):
          return "videoMessage";
        // reply
        case Object.keys(msg)[0].includes("extendedTextMessage"):
          return msg.extendedTextMessage!.text;
        // sticker
        case Object.keys(msg)[0].includes("stickerMessage"):
          return "stickerMessage";

        default:
          // TODO: unimplemented
          return null;
      }
    }
    return null;
  }

  // if got new incoming message, loop over chats, look for matching msg, then append
  function appendIncomingMessage(remoteMsgs: proto.IWebMessageInfo[]) {
    const tempChats = [...(chats() || [])];
    let targetChat: Chat | undefined;
    remoteMsgs.forEach((msg) => {
      targetChat = tempChats.find((c) => c.id === msg.key.remoteJid);
      if (targetChat) {
        if (!targetChat.messages) {
          targetChat.messages = [];
        }
        const newMessage: proto.IHistorySyncMsg = {
          message: msg,
        };
        targetChat.messages[0] = newMessage;
      }
    });
    if (targetChat) {
      moveElementToStart(tempChats, targetChat);
      setChats(tempChats);
    }
  }

  function determineChat(chat: Chat): "group" | "person" | "unknown" {
    switch (true) {
      case chat.id.endsWith("@g.us"):
        return "group";
      case chat.id.endsWith("@s.whatsapp.net"):
        return "person";

      default:
        return "unknown";
    }
  }

  function moveElementToStart(chats: Chat[], chat: Chat) {
    const chatIndex = chats.indexOf(chat);
    if (chatIndex === -1 || chatIndex === 0) return;

    const currentChatAtStart = chats[0];
    chats[0] = chat;
    chats[chatIndex] = currentChatAtStart;
  }

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
                        onclick={() => setShowChatWindow(true)}
                        role="button"
                        class="cursor-pointer relative transition duration-150 border text-justify break-words border-gray-700 hover:border-gray-300 px-3 py-2 rounded-sm min-h-[80px]"
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
          <div class="h-screen absolute inset-0 backdrop-blur-md z-10 px-3 py-4">
            <button onclick={() => setShowChatWindow(false)}>
              <svg
                class="w-4 fill-white"
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 448 512"
              >
                <path d="M9.4 233.4c-12.5 12.5-12.5 32.8 0 45.3l160 160c12.5 12.5 32.8 12.5 45.3 0s12.5-32.8 0-45.3L109.2 288 416 288c17.7 0 32-14.3 32-32s-14.3-32-32-32l-306.7 0L214.6 118.6c12.5-12.5 12.5-32.8 0-45.3s-32.8-12.5-45.3 0l-160 160z" />
              </svg>
            </button>
          </div>
        </>
      ) : null}
    </div>
  );
};

export default App;
