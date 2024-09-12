import { type WAMessage, type Chat, type proto } from "@whiskeysockets/baileys";
import axios from "axios";
import { createSignal, For, onMount } from "solid-js";
import { ChatBubbles } from "../chat-bubbles";
import l from "lodash";

export function ChatWindow({
  currentChat,
  closeChatWindow,
  socket,
}: {
  currentChat: Chat | undefined;
  closeChatWindow: () => void;
  socket: WebSocket;
}) {
  if (!currentChat) {
    return null;
  }

  const [messages, setMessages] = createSignal<WAMessage[]>([]);
  let container: HTMLElement | null = null;
  let inputElement: HTMLElement | null = null;
  const [message, setMessage] = createSignal("");
  const [offset, setOffset] = createSignal(0);

  socket.addEventListener("message", async (event) => {
    const data = event.data as string;
    const raw = JSON.parse(data);

    if (raw.messages) {
      const incomingMessages = JSON.parse(
        raw.messages,
      ) as proto.IWebMessageInfo[];
      const current = l.cloneDeep(messages());
      incomingMessages.forEach((incmg) => {
        if (incmg.key.remoteJid === currentChat.id) {
          current.push(incmg);
        }
      });
      setMessages(current);
    }
  });

  onMount(async () => {
    if (inputElement) {
      inputElement.focus();
    }
    await fetchData();
    // prevent race condition
    setTimeout(function () {
      if (container) {
        container.scrollTop = container.scrollHeight;
      }
    }, 0);
  });

  async function fetchData(newOffset = 0) {
    const m = await axios.get<{ messages: WAMessage[] }>(
      `http://localhost:3001/messages/${currentChat!.id}/${newOffset}/5`,
    );
    if (m.data) {
      setOffset((prev) => prev + newOffset);
      setMessages((prev) => [...m.data.messages, ...prev]);
    }
  }

  async function sendMessage(id: string) {
    await axios.post(`http://localhost:3001/send/${id}`, {
      text: message(),
    });
    setMessage("");
  }

  return (
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
          {currentChat.name || currentChat.id}
        </h1>
      </div>
      <div
        ref={(el) => (container = el)}
        class="mt-2 max-w-full h-full py-3 px-2 border border-gray-700 rounded-md overflow-y-scroll overflow-x-hidden"
      >
        <div class="w-full flex justify-center items-center">
          <button
            onclick={async () => {
              await fetchData(offset() + 5);
            }}
            class="btn btn-outline"
          >
            Load Previous
          </button>
        </div>
        <For
          each={messages()}
          fallback={
            <span class="loading loading-spinner loading-md block"></span>
          }
        >
          {(message) => {
            return <ChatBubbles messageInfo={message} />;
          }}
        </For>
      </div>
      <form
        class="w-full"
        onsubmit={async (e) => {
          e.preventDefault();
          await sendMessage(currentChat.id);
        }}
      >
        <input
          ref={(el) => (inputElement = el)}
          oninput={(e) => setMessage(e.target.value)}
          value={message()}
          placeholder="Type a message"
          class="mt-2 textarea textarea-bordered w-full"
        />
      </form>
    </div>
  );
}
