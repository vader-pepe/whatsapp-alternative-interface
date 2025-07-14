import { createSignal, For, type Component } from 'solid-js';
import { type proto } from "baileys";
import { io } from 'socket.io-client';
import axios from 'axios';

const API_URL = import.meta.env.VITE_EVOLUTION_API_URL;
const WEBHOOK_URL = import.meta.env.VITE_WEBHOOK_URL;
const INSTANCE_NAME = import.meta.env.VITE_INSTANCE_NAME;
const API_KEY = import.meta.env.VITE_API_KEY;

interface Chat {
  id: string;
  remoteJid: string | null;
  name: string;
  labels: string | null;
  createdAt: Date;
  updatedAt: Date;
  pushName: string | null;
  profilePicUrl: string;
  lastConversation?: string;
}

const App: Component = () => {
  const [isConnectionEstablished, setIsConnectionEstablished] =
    createSignal(false);

  const [chats, setChats] = createSignal<Chat[]>([]);

  const socket = io(WEBHOOK_URL);

  socket.on('connect', async () => {
    console.log('Connected via Socket.IO');
    setIsConnectionEstablished(true);

    const raw = await axios.post<Chat[]>(API_URL + `/chat/findChats/${INSTANCE_NAME}`, '', {
      headers: {
        'apikey': API_KEY
      }
    });

    if (raw.data) {
      setChats(raw.data);
    }

  });

  socket.on('disconnect', () => {
    console.log('Disconnected');
    setIsConnectionEstablished(false);
  });

  socket.on('new_message', (msg) => {
    const webMessage = msg as proto.WebMessageInfo;

    setChats(prev => {
      const index = prev.findIndex(v => v.remoteJid === webMessage.key.remoteJid);

      if (index !== -1) {
        // Update existing chat with full type preservation
        const updatedChat: Chat = {
          ...prev[index],
          lastConversation: webMessage.message?.conversation ?? "TODO: Not yet implemented"
        };

        // Remove and reinsert at top
        const newChats = [
          ...prev.slice(0, index),
          ...prev.slice(index + 1)
        ];

        return [updatedChat, ...newChats];
      } else {

        return [...prev];
      }
    });

    console.log('Received message:', webMessage);
  });

  return (
    <div class="h-full flex flex-col items-center">
      <label class=" my-3 mx-4 inset-0 input input-bordered flex items-center gap-2 z-10">
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

      <div class="relative mb-32 max-h-screen mx-4 flex flex-col">
        <For each={chats()}>
          {(chat) => <button class="mb-2 cursor-pointer relative transition duration-150 border text-justify break-words border-gray-700 hover:border-gray-300 px-3 py-2 rounded-sm min-h-[80px] max-h-[80px] overflow-hidden">
            <h1 class="">{(chat.pushName ?? chat.remoteJid)}</h1>
            <small class="my-2">{chat.lastConversation}</small>
          </button>}
        </For>
      </div>
    </div>
  );
};

export default App;
