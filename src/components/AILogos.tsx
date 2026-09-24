import React from "react";

export function GeminiLogo({ className = "w-6 h-6" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className}>
      <defs>
        <linearGradient id="geminiGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#ff4343" />
          <stop offset="35%" stopColor="#ff8a00" />
          <stop offset="65%" stopColor="#4285f4" />
          <stop offset="100%" stopColor="#00d26a" />
        </linearGradient>
      </defs>
      <path
        d="M12 0C12 6.627 6.627 12 0 12C6.627 12 12 17.373 12 24C12 17.373 17.373 12 24 12C17.373 12 12 6.627 12 0Z"
        fill="url(#geminiGrad)"
      />
    </svg>
  );
}

export function OpenAILogo({ className = "w-6 h-6" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path
        d="M20.5 11.2c-.3-1.6-1.5-2.8-3.1-3.2-.3-.8-.8-1.5-1.5-2-1.2-1-2.9-1.3-4.4-.7-.5-.6-1.2-1.1-2-1.3-1.6-.4-3.3.1-4.4 1.3-1.1 1.2-1.4 2.9-.9 4.4-.6.4-1.2 1-1.5 1.7-.8 1.4-.7 3.2.2 4.5.3.8.8 1.5 1.5 2 1.2 1 2.9 1.3 4.4.7.5.6 1.2 1.1 2 1.3 1.6.4 3.3-.1 4.4-1.3 1.1-1.2 1.4-2.9.9-4.4.6-.4 1.2-1 1.5-1.7.8-1.4.7-3.2-.2-4.5z"
        className="text-zinc-950"
        fill="currentColor"
        stroke="none"
      />
      <path
        d="M9.8 14.7l4.4-2.5m-4.4 2.5v-5.1m0 5.1l-4.4-2.5m8.8-.1l-4.4-2.5m4.4 2.5v5.1m-4.4-7.6l4.4-2.5"
        stroke="#ffffff"
        strokeWidth="1.2"
      />
    </svg>
  );
}

export function AnthropicLogo({ className = "w-6 h-6" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path
        d="M13.8 4.5h3.4L23 20h-3.4l-1.3-3.6h-6.2L10.8 20H7.4L13.8 4.5zm2.8 9.3l-2.1-5.8-2.1 5.8h4.2zM4.6 4.5h3.4L4.8 20H1.4l6.6-15.5z"
        className="text-zinc-950"
      />
    </svg>
  );
}

export function GrokLogo({ className = "w-6 h-6" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path
        d="M21.5 1.5L14.2 11.2C13.5 10.4 12.3 10 11 10C8.2 10 6 12.2 6 15C6 17.8 8.2 20 11 20C13.8 20 16 17.8 16 15C16 13.8 15.6 12.7 14.8 12L22.5 1.8C22.2 1.6 21.8 1.5 21.5 1.5ZM11 12.5C12.4 12.5 13.5 13.6 13.5 15C13.5 16.4 12.4 17.5 11 17.5C9.6 17.5 8.5 16.4 8.5 15C8.5 13.6 9.6 12.5 11 12.5ZM2.5 22.5L9.8 12.8C10.5 13.6 11.7 14 13 14C15.8 14 18 11.8 18 9C18 6.2 15.8 4 13 4C10.2 4 8 6.2 8 9C8 10.2 8.4 11.3 9.2 12L1.5 22.2C1.8 22.4 2.2 22.5 2.5 22.5Z"
        className="text-zinc-950"
      />
    </svg>
  );
}
