import { type Chat } from "@whiskeysockets/baileys";

function getFirstMessage(chat: Chat) {
  return "ayam";
}

export function Chat({ chat }: { chat: Chat }) {
  return (
    <>
      <div
        role="button"
        class="cursor-pointer relative transition duration-150 border text-justify break-words border-gray-700 hover:border-gray-300 px-3 py-2 rounded-sm min-h-[80px] max-h-[80px] overflow-hidden"
      >
        <h1>{chat.name || chat.id}</h1>

        <small class="">{getFirstMessage(chat)}</small>
        {chat.unreadCount && chat.unreadCount > 0 ? (
          <div class="absolute right-0 top-0 badge badge-primary badge-lg h-8">
            {chat.unreadCount}
          </div>
        ) : null}
      </div>
    </>
  );
}
