import { createSignal, For, type Component } from 'solid-js';
import { type BaileysEventMap, type proto } from "baileys";
import { io } from 'socket.io-client';
import axios from 'axios';
import { match, P } from "ts-pattern";
import { ChatWindow } from './components/chat-window';

const API_URL = import.meta.env.VITE_EVOLUTION_API_URL;
const WEBHOOK_URL = import.meta.env.VITE_WEBHOOK_URL;
const INSTANCE_NAME = import.meta.env.VITE_INSTANCE_NAME;
const API_KEY = import.meta.env.VITE_API_KEY;

export interface Chat {
  count: number
  latest: number | null
  jid: string
  name: string | null
  notify: string | null
  imgUrl: string | null
  status: string | null
  lastConversation?: string
}

function GeneratePreviewMessage(msg: proto.IMessage) {
  const res = match(msg)
    .with({ conversation: P.any }, () => msg.conversation ?? "")
    .with({ imageMessage: P.any }, () => "Photo")
    .with({ videoMessage: P.any }, () => "Video")
    .with({ stickerMessage: P.any }, () => "Sticker")
    .with({ reactionMessage: P.any }, () => "Reaction")
    .with({ viewOnceMessage: P.any }, () => "View Once")
    .with({ editedMessage: P.any }, () => "Edited")
    .with({ extendedTextMessage: P.any }, () => {
      const text = msg.extendedTextMessage!.text;
      if (text) {
        return text;
      }
      return JSON.stringify(msg.extendedTextMessage);
    })
    .otherwise(() => JSON.stringify(msg))
  return res;
};

const App: Component = () => {
  const [isConnectionEstablished, setIsConnectionEstablished] =
    createSignal(false);
  const [currentChat, setCurrentChat] = createSignal<Chat>();
  const [showChatWindow, setShowChatWindow] = createSignal(false);
  const [chats, setChats] = createSignal<Chat[]>([]);

  const socket = io(WEBHOOK_URL);

  function closeChatWindow() {
    setCurrentChat();
    setShowChatWindow(false);
  }

  async function openChatWindow(chat: Chat) {
    setCurrentChat(chat);
    setShowChatWindow(true);
  }

  socket.on('connect', async () => {
    console.log('Connected via Socket.IO');
    setIsConnectionEstablished(true);

    const raw = await axios.get<Chat[]>(API_URL + `/chats`);

    if (raw.data) {
      setChats(raw.data);
    }

  });

  socket.on('disconnect', () => {
    console.log('Disconnected');
    setIsConnectionEstablished(false);
  });

  socket.on('messages.upsert', (msg) => {
    const webMessage = msg as BaileysEventMap['messages.upsert'];
    for (const message of webMessage.messages) {
      setChats(prev => {
        const index = prev.findIndex(v => v.jid === message.key.remoteJid);
        if (index !== -1) {
          const updatedChat: Chat = {
            ...prev[index],
            lastConversation: `${message.key.fromMe ? 'Me' : message.pushName ?? message.key.remoteJid!}: ${GeneratePreviewMessage(message.message!)}`
          };

          const newChats = [
            ...prev.slice(0, index),
            ...prev.slice(index + 1),
          ];

          return [updatedChat, ...newChats];
        } else {
          return prev;
        }
      });
    }
    console.log('Received message:', webMessage);
  });

  return (
    <div class="h-full flex flex-col items-center">
      <div class="fixed w-full h-[65px] z-10 flex justify-center">
        <label class=" my-3 mx-4 inset-0 input input-bordered flex gap-2 max-w-[600px] min-w-[300px]">
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
      </div>

      <div class="relative mb-32 max-h-screen mx-4 flex flex-col mt-16">
        <For each={chats()}>
          {(chat) => <button onclick={() =>
            openChatWindow(chat)
          } class="max-w-[600px] min-w-[300px] mb-2 cursor-pointer relative transition duration-150 border text-justify break-words border-gray-700 hover:border-gray-300 px-3 py-2 rounded-sm min-h-[80px] max-h-[80px] overflow-hidden">
            <h1 class="">{(chat.name ?? chat.jid)}</h1>
            <small class="my-2 text-ellipsis">{chat.lastConversation}</small>
          </button>}
        </For>
      </div>

      {showChatWindow() ? (
        <ChatWindow
          currentChat={currentChat()}
          closeChatWindow={closeChatWindow}
          socket={socket}
        />
      ) : null}

    </div>
  );
};

export default App;
