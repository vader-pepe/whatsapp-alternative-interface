import { Component, createSignal, For, JSX, onMount } from "solid-js";
import { type Socket } from 'socket.io-client';
import { type BaileysEventMap, type proto } from "baileys";
import axios from "axios";
import { Chat } from "../../App";
import { ChatBubbles } from "../chat-bubbles";

const API_URL = import.meta.env.VITE_API_URL;

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
  to?: string;
  text?: string;
  caption?: string;
  filename?: string;
  ptt?: boolean;
  statusType?: string;
  backgroundColor?: string;
  font?: number;
  allContacts?: boolean;
  statusJidList?: string[];
  quote?: proto.IWebMessageInfo | string;
};

type SendResponse = {
  success: boolean;
  type: string;
  to: string | string[];
};

// Example usage
// const webpFile = await convertToWebP(file);
// const webpUrl = URL.createObjectURL(webpFile);
async function convertToWebP(file: File): Promise<File> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(url);
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');

      if (!ctx) return reject("Canvas context not available");

      ctx.drawImage(img, 0, 0);
      canvas.toBlob(
        (blob) => {
          if (blob) {
            const webpFile = new File([blob], file.name.replace(/\.[^.]+$/, ".webp"), {
              type: "image/webp",
              lastModified: Date.now(),
            });
            resolve(webpFile);
          } else {
            reject("Failed to convert to WebP");
          }
        },
        "image/webp",
        0.9 // quality
      );
    };

    img.onerror = (err) => reject("Image load failed: " + err);
    img.src = url;
  });
};

function newAbortSignal(timeoutMs: number) {
  const abortController = new AbortController();
  setTimeout(() => {
    abortController.abort();
  }, timeoutMs || 0);

  return abortController.signal;
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
  const [images, setImages] = createSignal<PastedImage[]>([]);
  const [isSending, setIsSending] = createSignal(false);
  const [replyingTo, setReplyingTo] = createSignal<proto.IWebMessageInfo>();

  let container: HTMLElement | null = null;
  let inputElement: HTMLElement | null = null;
  let nextId = 1;

  socket.on("messages.upsert", function(msg) {
    const webMessage = msg as BaileysEventMap['messages.upsert'];
    setMessages(prev => [...prev, ...webMessage.messages.filter(msg => msg.key.remoteJid === currentChat.jid)])
  });

  async function fetchData(newOffset = 0) {
    const m = await axios.get<proto.IWebMessageInfo[]>(
      `${API_URL}/messages/${currentChat!.jid}/50/${newOffset}`,
      {
        signal: newAbortSignal(5000)
      }
    );
    if (m.data) {
      setOffset(newOffset);
      setMessages((prev) => [...m.data, ...prev]);
    }
  };

  async function sendMessage(
    payload: SendRequestBody
  ): Promise<SendResponse> {
    setIsSending(true);
    const response = await axios.post<SendResponse>(`${API_URL}/send`, payload, {
      headers: {
        'Content-Type': 'application/json'
      },
      signal: newAbortSignal(5000)
    }).finally(() => {
      setIsSending(false);
      setMessage("");
      setImages([]);
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

    setIsSending(true);
    const response = await axios.post<SendResponse>(
      `${API_URL}/send`,
      form,
      {
        headers: { 'Content-Type': 'multipart/form-data' },
        signal: newAbortSignal(5000)
      },
    ).finally(() => {
      setIsSending(false);
      setMessage("");
      setImages([]);
    });

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

  async function handleSubmit() {
    let quote: proto.IWebMessageInfo;

    if (replyingTo()) {
      quote = { ...replyingTo()! };
    }

    // TODO: sending image can be more than 1 you moron
    if (currentChat!.jid === "status@broadcast" && images().length > 0) {
      setIsSending(true);
      const form = new FormData();
      form.append('type', 'status');
      form.append('statusType', 'image');
      form.append('caption', message());
      form.append('allContacts', 'true');
      form.append('file', images()[0].file);

      await axios.post(
        `${API_URL}/send`,
        form,
        {
          headers: {
            'Content-Type': 'multipart/form-data'
          }
        }
      ).finally(() => {
        setIsSending(false);
        setMessage("");
        setImages([]);
      });


      return;
    } else if (currentChat!.jid === "status@broadcast") {
      // TODO: remove this duplicate!
      setIsSending(true);
      await axios.post(
        `${API_URL}/send`,
        // '{"type": "status","statusType": "text","text": "Good evening, friends!","backgroundColor": "#DDDDDD","font": 2,"allContacts": "true"}',
        {
          'type': 'status',
          'statusType': 'text',
          'text': message(),
          'backgroundColor': '#DDDDDD',
          'font': 2,
          'allContacts': 'true'
        },
        {
          headers: { 'Content-Type': 'application/json' },
        }
      ).finally(() => {
        setIsSending(false);
        setMessage("");
        setImages([]);
      });
      return;
    }

    if (message().startsWith("sticker:") && images().length > 0) {
      const webpFile = await convertToWebP(images()[0].file);
      await sendMedia({
        type: "sticker",
        to: currentChat!.jid,
        caption: "",
        file: webpFile,
        quote: JSON.stringify(quote!)
      });
      return;
    }

    if (images().length > 0) {
      await sendMedia({
        type: "image",
        to: currentChat!.jid,
        caption: message(),
        file: images()[0].file,
        quote: quote!
      });
    } else {
      await sendMessage({
        type: "text",
        to: currentChat!.jid,
        text: message(),
        quote: quote!
      });
    }

  };

  const handleKeyDown: JSX.EventHandlerUnion<HTMLTextAreaElement, KeyboardEvent> = async (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      await handleSubmit();
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
    <div class="flex flex-col fixed inset-0 backdrop-blur-md z-10 px-3 py-4 max-h-[100dvh]">
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
          {currentChat.name || currentChat.notify || currentChat.jid}
        </h1>
      </div>

      <div
        ref={(el) => (container = el)}
        class="flex-1 overflow-y-auto mt-2 py-3 px-2 border border-gray-700 rounded-md"
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
          {(message) => <><ChatBubbles id={currentChat.jid} messageInfo={message} /><small on:click={() => setReplyingTo(message)} role="link" class="mt-[-200px] text-cyan-300 cursor-pointer">Reply</small></>}
        </For>
      </div>

      <form
        class="w-full mt-2"
        onsubmit={async (e) => {
          e.preventDefault();
          await handleSubmit();
        }}
      >
        <div class="pasted-images flex gap-2">
          <For each={images()}>
            {(img, index) => (
              <div class="flex flex-col items-center">
                <img src={img.src} alt="pasted" style={{ "max-height": "80px" }} />
                <div class="rounded-full bg-black">
                  <svg role="button" on:click={() => { setImages(prev => { const temp = [...prev]; temp.splice(index(), 1); return temp; }) }} viewBox="0 0 24 24" class="fill-white w-[25px]" xmlns="http://www.w3.org/2000/svg"><g id="SVGRepo_bgCarrier" stroke-width="0"></g><g id="SVGRepo_tracerCarrier" stroke-linecap="round" stroke-linejoin="round"></g><g id="SVGRepo_iconCarrier"> <path fill-rule="evenodd" clip-rule="evenodd" d="M5.29289 5.29289C5.68342 4.90237 6.31658 4.90237 6.70711 5.29289L12 10.5858L17.2929 5.29289C17.6834 4.90237 18.3166 4.90237 18.7071 5.29289C19.0976 5.68342 19.0976 6.31658 18.7071 6.70711L13.4142 12L18.7071 17.2929C19.0976 17.6834 19.0976 18.3166 18.7071 18.7071C18.3166 19.0976 17.6834 19.0976 17.2929 18.7071L12 13.4142L6.70711 18.7071C6.31658 19.0976 5.68342 19.0976 5.29289 18.7071C4.90237 18.3166 4.90237 17.6834 5.29289 17.2929L10.5858 12L5.29289 6.70711C4.90237 6.31658 4.90237 5.68342 5.29289 5.29289Z"></path> </g></svg>
                </div>
              </div>
            )}
          </For>
        </div>

        <div class="flex gap-2 relative">
          {replyingTo() ? <>
            <div class="absolute bottom-22 left-10">
              <div class="bg-blue-300 text-black z-10 min-w-[100px] max-w-full">{JSON.stringify(replyingTo()?.message) ?? "unimplemented"}</div>
            </div>
            <small on:click={() => setReplyingTo()} class="z-10 bottom-21 absolute w-[32px] left-0 cursor-pointer" role="button">
              <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><g id="SVGRepo_bgCarrier" stroke-width="0"></g><g id="SVGRepo_tracerCarrier" stroke-linecap="round" stroke-linejoin="round"></g><g id="SVGRepo_iconCarrier"> <path d="M9.70711 8.29289C9.31658 7.90237 8.68342 7.90237 8.29289 8.29289C7.90237 8.68342 7.90237 9.31658 8.29289 9.70711L10.5858 12L8.29289 14.2929C7.90237 14.6834 7.90237 15.3166 8.29289 15.7071C8.68342 16.0976 9.31658 16.0976 9.70711 15.7071L12 13.4142L14.2929 15.7071C14.6834 16.0976 15.3166 16.0976 15.7071 15.7071C16.0976 15.3166 16.0976 14.6834 15.7071 14.2929L13.4142 12L15.7071 9.70711C16.0976 9.31658 16.0976 8.68342 15.7071 8.29289C15.3166 7.90237 14.6834 7.90237 14.2929 8.29289L12 10.5858L9.70711 8.29289Z" fill="#ffffff"></path> <path fill-rule="evenodd" clip-rule="evenodd" d="M12 2C6.47715 2 2 6.47715 2 12C2 17.5228 6.47715 22 12 22C17.5228 22 22 17.5228 22 12C22 6.47715 17.5228 2 12 2ZM4 12C4 7.58172 7.58172 4 12 4C16.4183 4 20 7.58172 20 12C20 16.4183 16.4183 20 12 20C7.58172 20 4 16.4183 4 12Z" fill="#ffffff"></path> </g></svg>
            </small>
          </> : null}

          <textarea
            rows={2}
            cols={40}
            onPaste={handlePaste}
            ref={(el) => (inputElement = el)}
            oninput={(e) => setMessage(e.target.value)}
            value={message()}
            on:keydown={handleKeyDown}
            disabled={isSending()}
            placeholder={images().length > 0 ? undefined : "Type a message"}
            class="textarea textarea-bordered flex-1"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              const file = e.dataTransfer?.files?.[0];
              if (file && file.type.startsWith("image/")) {
                const src = URL.createObjectURL(file);
                setImages(prev => [...prev, { id: nextId++, src, file }]);
              }
            }}
          />
          {isSending() ? <div class="absolute w-[32px] h-[32px] animate-spin">
            <svg class="" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" stroke="#ffffff"><g id="SVGRepo_bgCarrier" stroke-width="0"></g><g id="SVGRepo_tracerCarrier" stroke-linecap="round" stroke-linejoin="round"></g><g id="SVGRepo_iconCarrier"> <path d="M20.0001 12C20.0001 13.3811 19.6425 14.7386 18.9623 15.9405C18.282 17.1424 17.3022 18.1477 16.1182 18.8587C14.9341 19.5696 13.5862 19.9619 12.2056 19.9974C10.825 20.0328 9.45873 19.7103 8.23975 19.0612" stroke="#ffffff" stroke-width="3.55556" stroke-linecap="round"></path> </g></svg>
          </div> : null}
          <div class="flex items-center">
            <FileUploadIcon onFileSelected={handleFileSelect} />
            <button type="submit" class="btn btn-accent">Send</button>
          </div>
        </div>
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
    <div class="w-[32px] h-[32px]">
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
      <label for="file-upload-input" >
        <svg class="fill-white w-8 cursor-pointer" role="button" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><g id="SVGRepo_bgCarrier" stroke-width="0"></g><g id="SVGRepo_tracerCarrier" stroke-linecap="round" stroke-linejoin="round"></g><g id="SVGRepo_iconCarrier"> <path fill-rule="evenodd" clip-rule="evenodd" d="M6.39252 3.83025C7.04361 2.75654 8.20958 2 9.54508 2H14.4549C15.7904 2 16.9564 2.75654 17.6075 3.83025C17.8059 4.15753 18.0281 4.50118 18.257 4.81533C18.3665 4.96564 18.5804 5.08571 18.8771 5.08571H18.9998C21.209 5.08571 23 6.87668 23 9.08571V17C23 19.2091 21.2091 21 19 21H5C2.79086 21 1 19.2091 1 17V9.08572C1 6.87668 2.79052 5.08571 4.99976 5.08571H5.12238C5.41912 5.08571 5.63348 4.96564 5.74301 4.81533C5.97193 4.50118 6.19407 4.15753 6.39252 3.83025ZM9.54508 4C8.98673 4 8.43356 4.32159 8.10267 4.86727C7.88516 5.22596 7.63139 5.61989 7.35939 5.99317C6.81056 6.74635 5.94404 7.08571 5.12286 7.08571H5.00024C3.89578 7.08571 3 7.98104 3 9.08572V17C3 18.1046 3.89543 19 5 19H19C20.1046 19 21 18.1046 21 17V9.08571C21 7.98104 20.1047 7.08571 19.0002 7.08571H18.8776C18.0564 7.08571 17.1894 6.74635 16.6406 5.99317C16.3686 5.61989 16.1148 5.22596 15.8973 4.86727C15.5664 4.32159 15.0133 4 14.4549 4H9.54508ZM12 9C10.3431 9 9 10.3431 9 12C9 13.6569 10.3431 15 12 15C13.6569 15 15 13.6569 15 12C15 10.3431 13.6569 9 12 9ZM7 12C7 9.23858 9.23858 7 12 7C14.7614 7 17 9.23858 17 12C17 14.7614 14.7614 17 12 17C9.23858 17 7 14.7614 7 12Z"></path> </g></svg>
      </label>
    </div>
  );
};

