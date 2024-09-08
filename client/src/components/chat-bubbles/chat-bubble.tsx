import { Content } from "../content";

export function ChatBubble({
  participant,
  extendedContent,
  mainContent,
  bubbleStyle,
  isFromMe,
}: {
  participant?: string | null;
  extendedContent?: string | null;
  mainContent: string | null;
  bubbleStyle: string;
  isFromMe: boolean;
}) {
  return (
    <div class={`break-words text-wrap chat-bubble ${bubbleStyle}`}>
      {extendedContent ? (
        <div
          class={`"px-2 py-1 ${isFromMe ? "bg-blue-300" : "bg-gray-700"} ${isFromMe ? "text-black" : "text-white"} rounded-t-md flex flex-col text-left`}
        >
          {participant ? <small>{participant}</small> : null}
          <Content c={extendedContent} />
        </div>
      ) : null}
      <Content c={mainContent} />
    </div>
  );
}
