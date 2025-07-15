import { createSignal, For, onMount } from "solid-js";
import { type Socket } from 'socket.io-client';
import { type BaileysEventMap, type proto } from "baileys";
import axios from "axios";
import { Chat } from "../../App";
import { ChatBubbles } from "../chat-bubbles";

const API_URL = import.meta.env.VITE_EVOLUTION_API_URL;

export function ChatWindow({
  currentChat,
  closeChatWindow,
  socket
}: {
  currentChat: Chat | undefined;
  closeChatWindow: () => void;
  socket: Socket
}) {
  if (!currentChat) return null;

  const [messages, setMessages] = createSignal<proto.IWebMessageInfo[]>([]);
  const [message, setMessage] = createSignal("");
  const [offset, setOffset] = createSignal(0);
  let container: HTMLElement | null = null;
  let inputElement: HTMLElement | null = null;

  socket.on("messages.upsert", function(msg) {
    const webMessage = msg as BaileysEventMap['messages.upsert'];
    // webMessage.messages
    setMessages(prev => [...prev, ...webMessage.messages.filter(msg => msg.key.remoteJid === currentChat.jid)])
  });

  async function fetchData(newOffset = 0) {
    const m = await axios.get<proto.IWebMessageInfo[]>(
      `${API_URL}/messages/${currentChat!.jid}/50/${newOffset}`,
    );
    if (m.data) {
      setOffset(newOffset);
      setMessages((prev) => [...m.data, ...prev]);
    }
  }

  onMount(async () => {
    if (inputElement) {
      inputElement.focus();
    }
    await fetchData();
    // prevent race condition
    setTimeout(function() {
      if (container) {
        container.scrollTop = container.scrollHeight;
      }
    }, 0);
  });

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
          {currentChat.name || currentChat.jid}
        </h1>
      </div>

      <div
        ref={(el) => (container = el)}
        class="mt-2 max-w-full h-full py-3 px-2 border border-gray-700 rounded-md overflow-y-scroll overflow-x-hidden"
        ondragover={(e) => e.preventDefault()}
        ondrop={(e) => {
          e.preventDefault();
          const file = e.dataTransfer?.files?.[0];
          // if (file) handleFileUpload(file);
        }}
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
        <For each={messages()} fallback={<span class="loading loading-spinner loading-md block"></span>}>
          {(message) => <ChatBubbles messageInfo={message} />}
        </For>
      </div>

      <form
        class="w-full mt-2"
        onsubmit={async (e) => {
          e.preventDefault();
          // await sendMessage(currentChat.id);
        }}
      >
        <input
          ref={(el) => (inputElement = el)}
          oninput={(e) => setMessage(e.target.value)}
          value={message()}
          placeholder="Type a message"
          class="textarea textarea-bordered w-full"
        />
      </form>

      <div class="flex items-center gap-4 mt-2">
        <input
          type="file"
          accept="image/*,video/*,audio/*,application/pdf"
          onchange={(e) => {
            const file = e.currentTarget.files?.[0];
            // if (file) handleFileUpload(file);
          }}
        />
        <label class="flex items-center gap-2">
          <input
            type="checkbox"
          // checked={sendAsSticker()}
          // onchange={(e) => setSendAsSticker(e.currentTarget.checked)}
          />
          <span class="text-white">Send as sticker</span>
        </label>
      </div>
    </div>
  );
};

