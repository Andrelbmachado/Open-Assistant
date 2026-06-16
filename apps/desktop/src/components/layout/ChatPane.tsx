import React, { useState, useRef, useEffect } from "react";
import "./ChatPane.css";

interface Message {
  role: "user" | "assistant";
  content: string;
}

export function ChatPane() {
  const [messages, setMessages] = useState<Message[]>([
    {
      role: "assistant",
      content: "Hello! I am Jarvis, your personal AI assistant. I have full access to your system.\n\nI can manage files, run scripts, search the web, and even control your computer like a real assistant. What would you like to do today?"
    }
  ]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isLoading]);

  const handleSend = async () => {
    if (!input.trim()) return;

    const apiKey = localStorage.getItem("openai_api_key");
    if (!apiKey) {
      alert("Por favor, adicione sua API Key da OpenAI na tela de Settings (canto inferior esquerdo) antes de enviar mensagens.");
      return;
    }

    const userMessage: Message = { role: "user", content: input };
    setMessages(prev => [...prev, userMessage]);
    setInput("");
    setIsLoading(true);

    try {
      const apiMessages = messages.map(m => ({ role: m.role, content: m.content }));
      apiMessages.push({ role: "user", content: userMessage.content });

      const response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: "gpt-4o",
          messages: apiMessages,
        })
      });

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error?.message || "Failed to fetch response");
      }

      const data = await response.json();
      const assistantReply = data.choices[0].message.content;

      setMessages(prev => [...prev, { role: "assistant", content: assistantReply }]);
    } catch (error: any) {
      setMessages(prev => [...prev, { 
        role: "assistant", 
        content: `**Error:** ${error.message}\nVerifique se sua API Key é válida na aba Settings.` 
      }]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <main className="chat-pane">
      <div className="chat-header">
        <h2>Jarvis Assistant</h2>
        <div className="model-selector">
          <span>Model: GPT-4o</span>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>
        </div>
      </div>

      <div className="chat-messages">
        {messages.map((msg, idx) => (
          <div key={idx} className={`message ${msg.role}`}>
            {msg.role === "assistant" && (
              <div className="avatar assistant-avatar">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2a10 10 0 1 0 10 10H12V2z"></path><path d="M12 12 2.1 7.1"></path><path d="M12 12l9.9 4.9"></path></svg>
              </div>
            )}
            <div className="message-content">
              {msg.content.split('\n').map((line, i) => (
                <p key={i} style={{minHeight: line ? 'auto' : '1rem'}}>{line}</p>
              ))}
            </div>
          </div>
        ))}

        {isLoading && (
          <div className="message assistant">
             <div className="avatar assistant-avatar">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2a10 10 0 1 0 10 10H12V2z"></path><path d="M12 12 2.1 7.1"></path><path d="M12 12l9.9 4.9"></path></svg>
            </div>
            <div className="message-content">
              <p className="typing-indicator">...</p>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <div className="chat-input-container">
        <div className="input-wrapper">
          <button className="icon-btn attachment-btn">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"></path></svg>
          </button>
          
          <textarea 
            className="chat-input" 
            placeholder="Message Jarvis or type '/' for commands..." 
            rows={1}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
          ></textarea>
          
          <button className="icon-btn mic-btn">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path><path d="M19 10v2a7 7 0 0 1-14 0v-2"></path><line x1="12" y1="19" x2="12" y2="23"></line><line x1="8" y1="23" x2="16" y2="23"></line></svg>
          </button>
          
          <button className="icon-btn send-btn" onClick={handleSend} disabled={!input.trim() || isLoading} style={{ opacity: (!input.trim() || isLoading) ? 0.5 : 1 }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>
          </button>
        </div>
        <div className="input-footer">
          Jarvis can make mistakes. Consider verifying important information.
        </div>
      </div>
    </main>
  );
}
