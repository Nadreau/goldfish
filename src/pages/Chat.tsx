/**
 * Chat Page — Talk to your memory with Gemini
 */
import { useState, useRef, useEffect } from 'react';
import { Send, Sparkles, Bot, User, Loader2, Trash2 } from 'lucide-react';
import { searchMemories, type Memory } from '../lib/api';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

// Gemini API call (using Google AI Studio free tier)
async function queryGemini(prompt: string, context: string): Promise<string> {
  const apiKey = localStorage.getItem('gemini_api_key');
  
  if (!apiKey) {
    return "Please add your Gemini API key in Settings to enable chat.";
  }
  
  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [{
              text: `You are a helpful AI assistant that helps users understand their computer activity. You have access to OCR captures from their screen - text that was visible on their screen at different times.

Here is the captured screen text from their recent activity:
---
${context}
---

Based on this captured text, answer the user's question. Be specific and reference actual content you can see in the captures. If you see app names, window titles, or specific text, mention them.

If the context doesn't contain relevant information for the question, say so honestly and suggest what kind of activity might help find the answer.

User's question: ${prompt}`
            }]
          }],
          generationConfig: {
            temperature: 0.7,
            maxOutputTokens: 1024,
          }
        })
      }
    );
    
    const data = await response.json();
    
    if (data.error) {
      if (data.error.message?.includes('API_KEY_INVALID')) {
        return "❌ Invalid API key. Please check your Gemini API key in Settings.";
      }
      return `❌ API Error: ${data.error.message || 'Unknown error'}`;
    }
    
    if (data.candidates?.[0]?.content?.parts?.[0]?.text) {
      return data.candidates[0].content.parts[0].text;
    }
    
    return "I couldn't generate a response. Please try again.";
  } catch (error) {
    console.error('Gemini API error:', error);
    return "Error connecting to Gemini. Please check your API key.";
  }
}

export default function Chat() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [contextCount, setContextCount] = useState(0);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  
  // Check context availability
  useEffect(() => {
    searchMemories('', 100).then(memories => {
      setContextCount(memories.length);
    }).catch(console.error);
  }, []);
  
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };
  
  useEffect(() => {
    scrollToBottom();
  }, [messages]);
  
  const handleSend = async () => {
    if (!input.trim() || isLoading) return;
    
    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: input.trim(),
      timestamp: new Date(),
    };
    
    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);
    
    try {
      // Search memories for relevant context
      const relevantMemories = await searchMemories(input, 20);
      
      // Build context from memories
      const context = relevantMemories
        .map((m: Memory) => `[${m.timestamp}] ${m.source_app || 'Unknown'}: ${m.content}`)
        .join('\n');
      
      // Query Gemini
      const response = await queryGemini(input, context || 'No relevant memories found.');
      
      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: response,
        timestamp: new Date(),
      };
      
      setMessages(prev => [...prev, assistantMessage]);
    } catch (error) {
      console.error('Chat error:', error);
      setMessages(prev => [...prev, {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: 'Sorry, something went wrong. Please try again.',
        timestamp: new Date(),
      }]);
    } finally {
      setIsLoading(false);
    }
  };
  
  return (
    <div className="h-full flex flex-col bg-[#09090b]">
      {/* Header */}
      <div className="px-6 py-4 border-b border-white/[0.04]">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500/20 to-purple-500/10 flex items-center justify-center">
              <Sparkles size={20} className="text-violet-400" />
            </div>
            <div>
              <h1 className="text-lg font-semibold text-white">Ask Your Memory</h1>
              <p className="text-xs text-zinc-500">Gemini 1.5 Flash · {contextCount} memories</p>
            </div>
          </div>
          {messages.length > 0 && (
            <button
              onClick={() => setMessages([])}
              className="p-2 rounded-lg text-zinc-500 hover:text-rose-400 hover:bg-rose-500/10 transition-colors"
              title="Clear chat"
            >
              <Trash2 size={18} />
            </button>
          )}
        </div>
      </div>
      
      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <div className="w-16 h-16 rounded-2xl bg-violet-500/10 flex items-center justify-center mb-4">
              <Bot size={32} className="text-violet-400" />
            </div>
            <h2 className="text-lg font-medium text-zinc-300 mb-2">Ask Your Memory</h2>
            <p className="text-sm text-zinc-500 max-w-md mb-2">
              Ask questions about your day, what you were working on, or anything from your captured context.
            </p>
            <p className="text-xs text-violet-400 mb-6">
              {contextCount > 0 
                ? `✓ ${contextCount} memories available for context`
                : '○ No memories yet - turn on capture first'}
            </p>
            <div className="space-y-2 w-full max-w-sm">
              {[
                "What was I working on this morning?",
                "Summarize my recent activity",
                "What apps have I been using?",
                "What websites did I visit?",
              ].map((suggestion, i) => (
                <button
                  key={i}
                  onClick={() => setInput(suggestion)}
                  className="block w-full px-4 py-2 rounded-lg bg-zinc-800/50 text-sm text-zinc-400 hover:bg-zinc-800 hover:text-zinc-300 transition-colors text-left"
                >
                  → {suggestion}
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              {msg.role === 'assistant' && (
                <div className="w-8 h-8 rounded-lg bg-violet-500/20 flex items-center justify-center flex-shrink-0">
                  <Bot size={16} className="text-violet-400" />
                </div>
              )}
              <div
                className={`max-w-[70%] px-4 py-3 rounded-2xl ${
                  msg.role === 'user'
                    ? 'bg-violet-600 text-white'
                    : 'bg-zinc-800 text-zinc-200'
                }`}
              >
                <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
              </div>
              {msg.role === 'user' && (
                <div className="w-8 h-8 rounded-lg bg-zinc-700 flex items-center justify-center flex-shrink-0">
                  <User size={16} className="text-zinc-300" />
                </div>
              )}
            </div>
          ))
        )}
        {isLoading && (
          <div className="flex gap-3">
            <div className="w-8 h-8 rounded-lg bg-violet-500/20 flex items-center justify-center flex-shrink-0">
              <Loader2 size={16} className="text-violet-400 animate-spin" />
            </div>
            <div className="px-4 py-3 rounded-2xl bg-zinc-800">
              <p className="text-sm text-zinc-400">Thinking...</p>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>
      
      {/* Input */}
      <div className="px-6 py-4 border-t border-white/[0.04]">
        <div className="flex gap-3">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleSend()}
            placeholder="Ask about your day..."
            className="flex-1 px-4 py-3 rounded-xl bg-zinc-800 border border-white/[0.04] text-white text-sm placeholder:text-zinc-500 focus:outline-none focus:border-violet-500/50"
            disabled={isLoading}
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || isLoading}
            className="px-4 py-3 rounded-xl bg-violet-600 hover:bg-violet-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <Send size={18} className="text-white" />
          </button>
        </div>
      </div>
    </div>
  );
}
