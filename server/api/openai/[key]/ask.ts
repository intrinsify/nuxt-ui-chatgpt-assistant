import OpenAI from 'openai'

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig()
  const openai = new OpenAI({
    apiKey: config.openAiKey
  });

  const assistantId = config.assistantId

  const key = getRouterParam(event, 'key') ?? ''
  if (!key) {
    throw createError({
      message: 'No key set'
    })
  }

  // TODO: Parse?
  const body = await readValidatedBody(event, (body) => {
    const hasCorrectBody = typeof body === 'object' && body && 'message' in body && typeof body.message === 'string'
    if (!hasCorrectBody) {
      return false
    }
    return body
  })


  const threadId = await findThreadId(key, openai)

  // Add message to thread
  await openai.beta.threads.messages.create(threadId, {
    role: "user",
    content: body.message as string
  });

  setResponseHeader(event, 'Content-Type', 'application/octet-stream')

  return new ReadableStream({
    start(controller) {
      openai.beta.threads.runs.stream(threadId, {
        assistant_id: assistantId
      })
        .on('textDelta', (textDelta) => controller.enqueue(textDelta.value))
        .on('end', () => {
          controller.close()
        })
    }
  })

});
