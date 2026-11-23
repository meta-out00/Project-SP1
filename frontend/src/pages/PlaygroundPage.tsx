import { useEffect, useMemo, useState } from 'react'
import { Activity, Trash2 } from 'lucide-react'
import { PageHeading } from '../components/Shared'
import type { Provider } from '../types'

type Message = { role: 'user' | 'assistant'; content: string }

export function PlaygroundPage({ providers }: { providers: Provider[] }) {
  const [virtualKey, setVirtualKey] = useState('')
  const [providerKey, setProviderKey] = useState('')
  const [model, setModel] = useState('')
  const [temperature, setTemperature] = useState(0.7)
  const [maxTokens, setMaxTokens] = useState(512)
  const [stream, setStream] = useState(false)
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const modelOptions = useMemo(
    () => Array.from(new Set(providers.map((provider) => provider.default_model))),
    [providers],
  )

  useEffect(() => {
    if (!model && modelOptions.length) setModel(modelOptions[0])
  }, [model, modelOptions])

  async function sendMessage() {
    const content = input.trim()
    if (!content || loading) return
    if (!virtualKey.trim()) {
      setError('Enter a Virtual API Key.')
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
      if (providerKey.trim()) headers['X-Provider-Api-Key'] = providerKey.trim()

      const response = await fetch('http://localhost:8000/v1/chat/completions', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model,
          messages: nextMessages,
          temperature,
          max_tokens: maxTokens,
          stream,
        }),
      })

      if (!response.ok) {
        const data = await response.json().catch(() => null)
        throw new Error(data?.detail || `Request failed (${response.status})`)
      }

      if (stream) {
        const reader = response.body?.getReader()
        if (!reader) throw new Error('Streaming is not supported.')
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
              // Ignore incomplete SSE frames.
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
      <PageHeading eyebrow="TEST CONSOLE" title="Chat Playground" action={
        <button className="secondary-button" onClick={() => setMessages([])}><Trash2 size={15} /> Clear chat</button>
      } />
      <section className="playground-layout">
        <aside className="playground-settings">
          <div className="panel-heading"><div><p className="panel-kicker">Configuration</p><h2>Request</h2></div></div>
          <label>Virtual API Key<input type="password" value={virtualKey} onChange={(event) => setVirtualKey(event.target.value)} placeholder="sk-gw-..." /></label>
          <label>BYOK Provider Key<input type="password" value={providerKey} onChange={(event) => setProviderKey(event.target.value)} placeholder="Optional provider key" /></label>
          <label>Model<select value={model} onChange={(event) => setModel(event.target.value)}>{modelOptions.map((option) => <option key={option} value={option}>{option}</option>)}</select></label>
          <label><span className="range-label"><span>Temperature</span><strong>{temperature}</strong></span><input className="range-input" type="range" min="0" max="2" step="0.1" value={temperature} onChange={(event) => setTemperature(Number(event.target.value))} /></label>
          <label>Max tokens<input type="number" min="1" value={maxTokens} onChange={(event) => setMaxTokens(Number(event.target.value))} /></label>
          <label className="toggle-row"><span>Streaming</span><input type="checkbox" checked={stream} onChange={(event) => setStream(event.target.checked)} /></label>
        </aside>
        <section className="chat-panel">
          <div className="chat-messages">
            {messages.map((message, index) => (
              <div key={index} className={`chat-message ${message.role}`}>
                <div className="chat-avatar">{message.role === 'assistant' ? 'AI' : 'You'}</div>
                <div><strong>{message.role === 'assistant' ? 'Assistant' : 'You'}</strong><p>{message.content}</p></div>
              </div>
            ))}
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
            />
            <button className="primary-button" onClick={() => void sendMessage()} disabled={loading}>
              {loading ? 'Sending...' : <><Activity size={15} /> Send</>}
            </button>
          </div>
        </section>
      </section>
    </>
  )
}
