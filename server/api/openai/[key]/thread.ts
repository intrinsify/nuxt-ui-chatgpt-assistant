import OpenAI from 'openai'

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig()
  const openai = new OpenAI({
    apiKey: config.openAiKey
  });

  const key = getRouterParam(event, 'key') ?? ''
  if (!key) {
    throw createError({
      message: 'No key set'
    })
  }

  const threadId = await findThreadId(key, openai)

  const resp = await openai.beta.threads.messages.list(threadId)
  return resp.data.map((d) => {
    return {
      role: d.role,
      content: d.content[0].type === 'text' && d.content[0].text.value,
      id: d.id
    }
  })
});