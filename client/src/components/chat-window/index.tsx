import { Component, createSignal, For, JSX, onMount } from "solid-js";
import { type Socket } from 'socket.io-client';
import { type BaileysEventMap, type proto } from "baileys";
import axios from "axios";
import { Chat } from "../../App";
import { ChatBubbles } from "../chat-bubbles";

const API_URL = import.meta.env.VITE_EVOLUTION_API_URL;

interface PastedImage {
  id: number;
  src: string;
  file: File;
};

type MessageType =
  | 'text'
  | 'image'
  | 'video'
  | 'sticker'
  | 'audio'
  | 'document'
  | 'status';

interface SendRequestBody {
  type: MessageType;
  to: string;
  text?: string;
  caption?: string;
  filename?: string;
  ptt?: boolean;
  statusType?: string;
  backgroundColor?: string;
  font?: number;
  allContacts?: boolean;
  statusJidList?: string[];
};

type SendResponse = {
  success: boolean;
  type: string;
  to: string | string[];
};

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
  const [images, setImages] = createSignal<PastedImage[]>([]);
  let nextId = 1;

  socket.on("messages.upsert", function(msg) {
    const webMessage = msg as BaileysEventMap['messages.upsert'];
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
  };

  async function sendMessage(
    payload: SendRequestBody
  ): Promise<SendResponse> {
    const response = await axios.post<SendResponse>(`${API_URL}/send`, payload, {
      headers: {
        'Content-Type': 'application/json'
      }
    });

    return response.data;
  };

  async function sendMedia(
    payload: Omit<SendRequestBody, 'text'> & { file: File }
  ) {
    const form = new FormData();
    Object.entries(payload).forEach(([k, v]) => {
      form.append(k, v as any);
    });

    const response = await axios.post<SendResponse>(
      `${API_URL}/send`,
      form,
      {
        headers: { 'Content-Type': 'multipart/form-data' }
      }
    );
    return response.data;
  };

  const handlePaste: JSX.EventHandler<HTMLTextAreaElement, ClipboardEvent> = (e) => {
    const items = e.clipboardData?.items;
    if (!items) return;

    for (const item of Array.from(items)) {
      if (item.type.startsWith("image/")) {
        const file = item.getAsFile();
        if (file) {
          const src = URL.createObjectURL(file);
          setImages((prev) => [
            ...prev,
            { id: nextId++, src, file },
          ]);
        }
      }
    }
  };

  const handleFileSelect = (file: File) => {
    const src = URL.createObjectURL(file);
    setImages(prev => [...prev, { id: nextId++, src, file }]);
  };

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
          {(message) => <ChatBubbles id={currentChat.jid} messageInfo={message} />}
        </For>
      </div>

      <form
        class="w-full mt-2 relative"
        onsubmit={async (e) => {
          let response: SendResponse;
          e.preventDefault();
          if (images().length > 0) {
            response = await sendMedia({
              type: "image",
              to: currentChat.jid,
              caption: "",
              file: images()[0].file
            });
          } else {
            response = await sendMessage({
              type: "text",
              to: currentChat.jid,
              text: message()
            });

          }

          if (response.success) {
            setMessage("");
            setImages([]);
          }
        }}
      >
        <div class="pasted-images absolute z-10 bottom-22 left-2 flex gap-2">
          <For each={images()}>
            {(img, index) => (
              <div class="relative">
                <img src={img.src} alt="pasted" style={{ "max-width": "80px" }} />
                <svg role="button" on:click={() => { setImages(prev => { const temp = [...prev]; temp.splice(index(), 1); return temp; }) }} viewBox="0 0 24 24" class="fill-white absolute right-0 top-0" xmlns="http://www.w3.org/2000/svg"><g id="SVGRepo_bgCarrier" stroke-width="0"></g><g id="SVGRepo_tracerCarrier" stroke-linecap="round" stroke-linejoin="round"></g><g id="SVGRepo_iconCarrier"> <path fill-rule="evenodd" clip-rule="evenodd" d="M5.29289 5.29289C5.68342 4.90237 6.31658 4.90237 6.70711 5.29289L12 10.5858L17.2929 5.29289C17.6834 4.90237 18.3166 4.90237 18.7071 5.29289C19.0976 5.68342 19.0976 6.31658 18.7071 6.70711L13.4142 12L18.7071 17.2929C19.0976 17.6834 19.0976 18.3166 18.7071 18.7071C18.3166 19.0976 17.6834 19.0976 17.2929 18.7071L12 13.4142L6.70711 18.7071C6.31658 19.0976 5.68342 19.0976 5.29289 18.7071C4.90237 18.3166 4.90237 17.6834 5.29289 17.2929L10.5858 12L5.29289 6.70711C4.90237 6.31658 4.90237 5.68342 5.29289 5.29289Z"></path> </g></svg>
              </div>
            )}
          </For>
        </div>

        <textarea
          rows={2}
          cols={40}
          onPaste={handlePaste}
          ref={(el) => (inputElement = el)}
          oninput={(e) => setMessage(e.target.value)}
          value={message()}
          placeholder={images().length > 0 ? undefined : "Type a message"}
          class="textarea textarea-bordered w-full"
        />
        <FileUploadIcon onFileSelected={handleFileSelect} />
        <button type="submit" class="btn btn-accent absolute bottom-5 right-2">Send</button>
      </form>
    </div>
  );
};

interface Props {
  onFileSelected: (file: File) => void;
}

const FileUploadIcon: Component<Props> = (props) => {
  let inputRef: HTMLInputElement | undefined;

  const handleChange: JSX.EventHandler<HTMLInputElement, Event> = (e) => {
    const file = e.currentTarget.files?.[0];
    if (file) props.onFileSelected(file);
  };

  return (
    <div class="absolute top-6 right-20">
      {/* Hidden input */}
      <input
        type="file"
        accept="image/*"
        ref={inputRef}
        onchange={handleChange}
        style={{
          opacity: 0,
          position: "absolute",
          width: "1px",
          height: "1px",
          "pointer-events": "none",
        }}
        id="file-upload-input"
      />
      {/* Icon that triggers file dialog */}
      <label for="file-upload-input" style={{ cursor: "pointer" }}>
        <svg class="fill-white w-8 cursor-pointer" role="button" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><g id="SVGRepo_bgCarrier" stroke-width="0"></g><g id="SVGRepo_tracerCarrier" stroke-linecap="round" stroke-linejoin="round"></g><g id="SVGRepo_iconCarrier"> <path fill-rule="evenodd" clip-rule="evenodd" d="M6.39252 3.83025C7.04361 2.75654 8.20958 2 9.54508 2H14.4549C15.7904 2 16.9564 2.75654 17.6075 3.83025C17.8059 4.15753 18.0281 4.50118 18.257 4.81533C18.3665 4.96564 18.5804 5.08571 18.8771 5.08571H18.9998C21.209 5.08571 23 6.87668 23 9.08571V17C23 19.2091 21.2091 21 19 21H5C2.79086 21 1 19.2091 1 17V9.08572C1 6.87668 2.79052 5.08571 4.99976 5.08571H5.12238C5.41912 5.08571 5.63348 4.96564 5.74301 4.81533C5.97193 4.50118 6.19407 4.15753 6.39252 3.83025ZM9.54508 4C8.98673 4 8.43356 4.32159 8.10267 4.86727C7.88516 5.22596 7.63139 5.61989 7.35939 5.99317C6.81056 6.74635 5.94404 7.08571 5.12286 7.08571H5.00024C3.89578 7.08571 3 7.98104 3 9.08572V17C3 18.1046 3.89543 19 5 19H19C20.1046 19 21 18.1046 21 17V9.08571C21 7.98104 20.1047 7.08571 19.0002 7.08571H18.8776C18.0564 7.08571 17.1894 6.74635 16.6406 5.99317C16.3686 5.61989 16.1148 5.22596 15.8973 4.86727C15.5664 4.32159 15.0133 4 14.4549 4H9.54508ZM12 9C10.3431 9 9 10.3431 9 12C9 13.6569 10.3431 15 12 15C13.6569 15 15 13.6569 15 12C15 10.3431 13.6569 9 12 9ZM7 12C7 9.23858 9.23858 7 12 7C14.7614 7 17 9.23858 17 12C17 14.7614 14.7614 17 12 17C9.23858 17 7 14.7614 7 12Z"></path> </g></svg>
      </label>
    </div>
  );
};

