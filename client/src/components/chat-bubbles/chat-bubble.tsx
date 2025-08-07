import { JSX } from "solid-js/jsx-runtime";

export function ChatBubble({
  participant,
  extendedContent,
  mainContent,
  bubbleStyle,
  isFromMe,
}: {
  participant?: string | null;
  extendedContent?: JSX.Element;
  mainContent: JSX.Element;
  bubbleStyle: string;
  isFromMe: boolean;
}) {
  return (
    <div class="mb-2 w-full">
      <div class={`break-words text-pretty chat-bubble ${bubbleStyle} max-w-[300px]`}>
        {extendedContent ? (
          <div
            class={`"px-2 py-1 ${isFromMe ? "bg-blue-300" : "bg-gray-700"} ${isFromMe ? "text-black" : "text-white"} rounded-t-md flex flex-col text-left`}
          >
            {participant ? <small>{participant}</small> : null}
            {extendedContent}
          </div>
        ) : null}
        {mainContent}
      </div>
      {/* TODO: handle reaction */}
      <small role="link" class="text-cyan-300 cursor-pointer">Reply</small>
    </div>
  );
}

