import {
  type proto,
  type Chat,
  type AuthenticationState,
} from "@whiskeysockets/baileys";
import axios from "axios";
import { createSignal, type Component, For, createMemo } from "solid-js";
import { setsNewMessageToChat, chatType, setChatsRow } from "./utils/chat";
import { createVirtualizer } from "@tanstack/solid-virtual";
import { ChatWindow } from "./components/chat-window";

const App: Component = () => {
  const socket = new WebSocket("ws://localhost:8081");
  let container: HTMLElement | null = null;
  const [qr, setQr] = createSignal<string | undefined>(undefined);
  const [isConnectionEstablished, setIsConnectionEstablished] =
    createSignal(false);
  const [chats, setChats] = createSignal<Chat[]>([]);
  const [currentChat, setCurrentChat] = createSignal<Chat>();
  const [showChatWindow, setShowChatWindow] = createSignal(false);

  const rowVirtualizer = createMemo(() =>
    createVirtualizer({
      count: chats().length,
      getScrollElement: () => container,
      estimateSize: () => 85, // estimated height of each item in px
      overscan: 5, // number of extra items to render in the viewport
    }),
  );

  async function getChats() {
    const d = await axios.get<{ chats: Chat[] }>(`http://localhost:3001/chats`);
    if (d.data) {
      const transform = d.data.chats.filter(function (chat) {
        if (
          chatType(chat) !== "unknown" &&
          chat.messages &&
          chat.messages.length > 0 &&
          setChatsRow(chat)
        ) {
          return true;
        }
        return false;
      });
      setChats(transform);
    }
  }

  async function openChatWindow(chatId: Chat) {
    setCurrentChat(chatId);
    setShowChatWindow(true);
  }

  function closeChatWindow() {
    setCurrentChat();
    setShowChatWindow(false);
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
      const incoming = setsNewMessageToChat(messages, chats());
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
      class={`relative py-3 px-4 ${!isConnectionEstablished() ? "flex justify-center items-center" : ""} `}
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

          <div
            ref={(e) => (container = e)}
            class={`overflow-y-scroll overflow-x-hidden relative mt-16 mb-32 max-h-[700px]`}
          >
            <div
              style={{
                height: `${rowVirtualizer().getTotalSize().toString()}px`,
              }}
            >
              <For each={rowVirtualizer().getVirtualItems()}>
                {(virtualRow) => {
                  return (
                    <div
                      class={`absolute w-full`}
                      style={{ top: `${virtualRow.start}px` }}
                    >
                      <div
                        onclick={() =>
                          openChatWindow(chats()[virtualRow.index])
                        }
                        role="button"
                        class="cursor-pointer relative transition duration-150 border text-justify break-words border-gray-700 hover:border-gray-300 px-3 py-2 rounded-sm min-h-[80px] max-h-[80px] overflow-hidden"
                      >
                        <h1>
                          {chats()[virtualRow.index].name ||
                            chats()[virtualRow.index].id}
                        </h1>
                        <small class="">
                          {setChatsRow(chats()[virtualRow.index])}
                        </small>
                      </div>
                    </div>
                  );
                }}
              </For>
            </div>
          </div>

          {showChatWindow() ? (
            <ChatWindow
              currentChat={currentChat()}
              closeChatWindow={closeChatWindow}
              socket={socket}
            />
          ) : null}
        </>
      ) : (
        <h1 class="text-5xl">{`:(`}</h1>
      )}
    </div>
  );
};

export default App;
