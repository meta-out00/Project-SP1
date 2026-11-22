import { Bot, Send, Settings2, Trash2, User } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import type { Provider } from '../types'

type Message = {
  role: 'user' | 'assistant'
  content: string
}

export function PlaygroundPage({ models }: { models: Provider[] }) {
  const [virtualKey, setVirtualKey] = useState('')
  const [providerKey, setProviderKey] = useState('')
  const [model, setModel] = useState(models[0]?.default_model || '')
  const [temperature, setTemperature] = useState(0.7)
  const [maxTokens, setMaxTokens] = useState(512)
  const [stream, setStream] = useState(false)
  const [mockDelay, setMockDelay] = useState(0)
  const [mockErrorCode, setMockErrorCode] = useState('')
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const modelOptions = useMemo(
    () =>
      Array.from(
        new Set([
          ...models.map((provider) => provider.default_model),
          'gemini-flash-lite-latest',
          'gemini-2.0-flash',
          'gpt-4o-mini',
        ]),
      ),
    [models],
  )

  useEffect(() => {
    if (!model && modelOptions.length) {
      setModel(modelOptions[0])
    }
  }, [model, modelOptions])

  async function sendMessage() {
    const content = input.trim()
    if (!content || loading) return
    if (!virtualKey.trim()) {
      setError('Enter a Virtual API Key.')
      return
    }
    if (!model) {
      setError('Select a model.')
      return
    }

    const nextMessages: Message[] = [...messages, { role: 'user', content }]
    setMessages(nextMessages)
    setInput('')
    setLoading(true)
    setError('')

    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${virtualKey.trim()}`,
      }
      if (providerKey.trim()) {
        headers['X-Provider-Api-Key'] = providerKey.trim()
      }

      const response = await fetch('/api/v1/chat/completions', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model,
          messages: nextMessages,
          temperature,
          max_tokens: maxTokens,
          stream,
          mock_delay: mockDelay,
          mock_error_code: mockErrorCode ? Number(mockErrorCode) : null,
        }),
      })

      if (!response.ok) {
        const data = await response.json().catch(() => null)
        throw new Error(data?.detail || `Request failed (${response.status})`)
      }

      if (stream) {
        const reader = response.body?.getReader()
        if (!reader) throw new Error('Streaming is not supported by this browser response.')

        const decoder = new TextDecoder()
        let assistantText = ''
        setMessages([...nextMessages, { role: 'assistant', content: '' }])

        while (true) {
          const { value, done } = await reader.read()
          if (done) break
          const chunk = decoder.decode(value, { stream: true })
          for (const line of chunk.split('\n')) {
            if (!line.startsWith('data: ') || line.includes('[DONE]')) continue
            try {
              const payload = JSON.parse(line.slice(6))
              const delta = payload.choices?.[0]?.delta?.content
              if (typeof delta === 'string') {
                assistantText += delta
                setMessages([...nextMessages, { role: 'assistant', content: assistantText }])
              }
            } catch {
              // Ignore incomplete SSE frames and continue with the next frame.
            }
          }
        }
      } else {
        const data = await response.json()
        const assistantText =
          data?.choices?.[0]?.message?.content ||
          data?.error?.message ||
          'No response was returned.'
        setMessages([...nextMessages, { role: 'assistant', content: assistantText }])
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to send message')
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <section className="page-heading">
        <div><p className="eyebrow">TEST CONSOLE</p><h1>Playground</h1></div>
        <button className="secondary-button" onClick={() => setMessages([])}>
          <Trash2 size={15} /> Clear chat
        </button>
      </section>

      <section className="playground-layout">
        <aside className="playground-settings">
          <div className="playground-settings-title"><Settings2 size={16} /><strong>Configuration</strong></div>

          <label>Virtual API Key
            <input
              type="password"
              value={virtualKey}
              onChange={(event) => setVirtualKey(event.target.value)}
              placeholder="sk-gw-..."
            />
          </label>

          <label>BYOK Provider Key
            <input
              type="password"
              value={providerKey}
              onChange={(event) => setProviderKey(event.target.value)}
              placeholder="Optional provider key"
            />
          </label>

          <label>Model
            <select
              value={model}
              onChange={(event) => setModel(event.target.value)}
            >
              {modelOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>

          <label>
            <span className="range-label"><span>Temperature</span><strong>{temperature}</strong></span>
            <input
              className="range-input"
              type="range"
              min="0"
              max="2"
              step="0.1"
              value={temperature}
              onChange={(event) => setTemperature(Number(event.target.value))}
            />
          </label>

          <label>Max tokens
            <input
              type="number"
              min="1"
              max="100000"
              value={maxTokens}
              onChange={(event) => setMaxTokens(Number(event.target.value))}
            />
          </label>

          <label>Mock delay (seconds)
            <input
              type="number"
              min="0"
              max="60"
              step="0.1"
              value={mockDelay}
              onChange={(event) => setMockDelay(Number(event.target.value))}
            />
          </label>

          <label>Mock error
            <select value={mockErrorCode} onChange={(event) => setMockErrorCode(event.target.value)}>
              <option value="">None</option>
              <option value="429">429 Too Many Requests</option>
              <option value="500">500 Internal Server Error</option>
              <option value="503">503 Service Unavailable</option>
            </select>
          </label>

          <label className="toggle-row">
            <span><strong>Streaming</strong><small>Receive server-sent events</small></span>
            <input type="checkbox" checked={stream} onChange={(event) => setStream(event.target.checked)} />
          </label>
        </aside>

        <div className="chat-panel">
          <div className="chat-heading">
            <div>
              <p className="eyebrow">CHAT COMPLETION</p>
              <strong>{model || 'Select a model'}</strong>
            </div>
            {loading && <span className="typing-status">Generating...</span>}
          </div>

          <div className="chat-messages">
            {!messages.length ? (
              <div className="chat-empty">
                <div className="chat-empty-icon"><Bot size={24} /></div>
                <strong>Start a conversation</strong>
                <p>Select a model and send a message through the AI Gateway.</p>
              </div>
            ) : (
              messages.map((message, index) => (
                <div key={`${message.role}-${index}`} className={`chat-message ${message.role}`}>
                  <div className="chat-avatar">{message.role === 'assistant' ? <Bot size={17} /> : <User size={17} />}</div>
                  <div className="chat-bubble">{message.content}</div>
                </div>
              ))
            )}
          </div>

          {error && <div className="chat-error">{error}</div>}

          <div className="chat-composer">
            <textarea
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault()
                  void sendMessage()
                }
              }}
              placeholder="Send a message..."
              rows={3}
            />
            <button
              className="send-button"
              onClick={() => void sendMessage()}
              disabled={loading || !input.trim()}
              aria-label="Send message"
            >
              <Send size={17} />
            </button>
          </div>
        </div>
      </section>
    </>
  )
}
