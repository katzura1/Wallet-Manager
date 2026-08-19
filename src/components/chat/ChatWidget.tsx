import { useState } from "react";
import { ChatButton } from "./ChatButton";
import { ChatPanel } from "./ChatPanel";

export function ChatWidget() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <ChatButton
        onClick={() => setIsOpen(true)}
        hasNewMessage={false}
      />
      <ChatPanel
        open={isOpen}
        onClose={() => setIsOpen(false)}
      />
    </>
  );
}
