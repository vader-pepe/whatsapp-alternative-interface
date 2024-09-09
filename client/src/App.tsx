import {
  type proto,
  type Chat,
  type WAMessage,
  type AuthenticationState,
} from "@whiskeysockets/baileys";
import axios from "axios";
import { createSignal, type Component, For } from "solid-js";
import { appendIncomingMessage, chatType, setChatsRow } from "./utils/chat";
import { ChatBubbles } from "./components/chat-bubbles";

const App: Component = () => {
  const socket = new WebSocket("ws://localhost:8081");
  let containerRef: HTMLElement | null = null;
  const [qr, setQr] = createSignal<string | undefined>(undefined);
  const [isConnectionEstablished, setIsConnectionEstablished] =
    createSignal(false);
  const [chats, setChats] = createSignal<Chat[]>([]);
  const [currentChat, setCurrentChat] = createSignal<Chat>();
  const [message, setMessage] = createSignal<string>("");
  const [currentChatMessages, setCurrentChatMessages] = createSignal<
    WAMessage[]
  >([]);
  const [showChatWindow, setShowChatWindow] = createSignal(false);

  async function getChats() {
    const d = await axios.get<{ chats: Chat[] }>(`http://localhost:3001/chats`);
    if (d.data) {
      setChats(d.data.chats);
    }
  }

  async function openChatWindow(chat: Chat) {
    setCurrentChat(chat);
    setShowChatWindow(true);
    const m = await axios.get<{ messages: WAMessage[] }>(
      `http://localhost:3001/messages/${chat.id}`,
    );
    if (m.data) {
      setCurrentChatMessages(m.data.messages);
    }
    setTimeout(function () {
      if (containerRef) {
        containerRef.scrollTop = containerRef.scrollHeight;
      }
    }, 0);
  }

  function closeChatWindow() {
    setCurrentChat((_prev) => undefined);
    setShowChatWindow(false);
  }

  async function sendMessage(id: string) {
    await axios.post(`http://localhost:3001/send/${id}`, {
      text: message(),
    });
    setMessage("");
  }

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
      const incoming = appendIncomingMessage(messages, chats());
      setChats(incoming);
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
          <label class="fixed my-3 mx-4 inset-0 input input-bordered flex items-center gap-2 z-10">
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

          <div class="flex flex-col gap-2 mt-14">
            <For each={chats()}>
              {(chat, index) => {
                // WARNING: THIS WILL BE CATASTROPHIC
                if (
                  chatType(chat) !== "unknown" &&
                  chat.messages &&
                  chat.messages.length > 0
                ) {
                  if (setChatsRow(chat)) {
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
        <div>
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
            <div
              ref={(el) => (containerRef = el)}
              class="mt-2 max-w-full max-h-[700px] min-h-[300px] py-3 px-2 border border-gray-700 rounded-md overflow-y-scroll overflow-x-hidden"
            >
              <For
                each={currentChatMessages()}
                fallback={<div>Loading...</div>}
              >
                {(message, index) => {
                  return <ChatBubbles messageInfo={message} />;
                }}
              </For>
            </div>
            <form
              class="w-full"
              onsubmit={async (e) => {
                e.preventDefault();
                await sendMessage(currentChat()?.id || "");
              }}
            >
              <input
                oninput={(e) => setMessage(e.target.value)}
                value={message()}
                placeholder="Type a message"
                class="mt-2 textarea textarea-bordered w-full"
              />
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
};

export default App;
