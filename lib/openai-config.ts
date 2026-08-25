function runtimeEnv(name: string): string {
  return String((process.env as Record<string, string | undefined>)[name] || '').trim()
}

/** 웹 한 줄 견적 AI. 키는 서버 전용이며 NEXT_PUBLIC_ 으로 노출하지 않는다. */
export function openaiConfig() {
  const apiKey = runtimeEnv('OPENAI_API_KEY')
  const model =
    runtimeEnv('OPENAI_ORDER_MODEL') || runtimeEnv('OPENAI_MODEL') || 'gpt-4o-mini'
  return {
    apiKey,
    model,
    configured: apiKey.length > 0,
  }
}
