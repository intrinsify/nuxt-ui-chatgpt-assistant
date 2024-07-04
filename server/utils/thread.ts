import type OpenAI from "openai";

const THREAD_STORAGE_KEY = 'threads'
export async function findThreadId(key: string, openai: OpenAI) {
  const possibleThreadId = await useStorage(THREAD_STORAGE_KEY).getItem<string>(key)
  if (possibleThreadId) {
    return possibleThreadId
  }
  const thread = await openai.beta.threads.create();
  await useStorage(THREAD_STORAGE_KEY).setItem(key, thread.id)
  return thread.id
}