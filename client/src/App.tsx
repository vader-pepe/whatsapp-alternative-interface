import { type Chat } from "@whiskeysockets/baileys";
import { createSignal, type Component, For } from "solid-js";

const App: Component = () => {
  const [chats, setChats] = createSignal<Chat[]>([
    {
      id: "",
      name: "",
    },
  ]);
  const socket = new WebSocket("ws://localhost:8080");
  // Connection opened
  socket.addEventListener("open", (event) => {
    socket.send("Hello Server!");
  });

  return (
    <div class="py-3 px-4">
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
          {(chat) => {
            return (
              <div class="border border-gray-700 hover:border-gray-300 px-3 py-2 rounded-sm min-h-[80px]">
                {JSON.stringify(chat)}
              </div>
            );
          }}
        </For>
      </div>
    </div>
  );
};

export default App;
