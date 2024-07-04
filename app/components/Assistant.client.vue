<script setup lang="ts">
import { version } from '~~/package.json'
import { parseMarkdown } from '@nuxtjs/mdc/runtime'

type Message = { role: 'user' | 'assistant', content: string, id: string }


/** Template-Ref which needs to be declared top-level */
const messageContainer = ref<HTMLElement>()

const { didUserReachBottom, updateScrollBottomUnlessOverridden, scrollToLastMessage, scrollToLastMessageUnlessOverridden, canScroll: canContainerScroll } = useBottomScroll(messageContainer)

const { retrieveKey } = useThreadKey()

const threadKey = retrieveKey()

const { messages, answer, question, parsedAnswerAst, askQuestion, didConversationStart, isAnswering, getExistingMessages } = useAssistant(threadKey)

// Fetch existing messages
await getExistingMessages()


const { isOpen, toggleMenu, closeMenu } = useMenu()

function useAssistant(threadKey: string) {
  const answer = ref<Message | null>(null);
  const parsedAnswerAst = computedAsync(() => parseMarkdown(answer.value?.content ?? ''))

  const question = ref("");
  const assistantState = ref<'INIT' | 'IDLE' | 'PENDING'>('INIT')
  const didConversationStart = computed(() => assistantState.value !== 'INIT')
  const isAnswering = computed(() => assistantState.value === 'PENDING')

  const messages = ref<Message[]>([])

  async function askQuestion(overrideQuestion?: string) {
    if (isAnswering.value) {
      return
    }

    const initialQuestion = overrideQuestion ?? question.value
    if (!initialQuestion) {
      return
    }

    assistantState.value = 'PENDING'

    messages.value.push({
      role: "user",
      content: initialQuestion,
      id: randomId()
    })

    updateScrollBottomUnlessOverridden()
    scrollToLastMessageUnlessOverridden()

    question.value = ""

    const stream = await getAnswer({ question: initialQuestion, threadKey })
    answer.value = {
      role: "assistant",
      content: "",
      id: randomId()
    }

    scrollToLastMessageUnlessOverridden()

    useChatStream({
      stream,
      onChunk: ({ data }) => {
        answer.value!.content += data
        updateScrollBottomUnlessOverridden()
        scrollToLastMessageUnlessOverridden()
      },
      onReady: () => {
        messages.value.push(answer.value!)
        answer.value = null
        scrollToLastMessageUnlessOverridden()
        assistantState.value = 'IDLE'
      },
    })
  }

  async function getExistingMessages() {
    const oldMessages = await $fetch(`/api/openai/${threadKey}/thread`)
    if (!oldMessages || !oldMessages?.length) {
      return
    }
    // Set messages and set assistant state to idle
    messages.value = oldMessages
    assistantState.value = 'IDLE'
  }

  async function getAnswer({ threadKey, question }: { threadKey: string, question: string }) {
    const body = await $fetch(`/api/openai/${threadKey}/ask`, {
      method: "POST",
      body: {
        message: question,
      },
      responseType: 'stream'
    })
    if (!body) {
      throw new Error("Unknown error")
    }

    return body as ReadableStream<Uint8Array>
  }

  type UseChatStreamArgs = {
    onChunk: (data: { data: string }) => void,
    onReady: (data: { data: string }) => void,
    stream: ReadableStream<Uint8Array>,
  }
  function useChatStream({
    onChunk, onReady, stream,
  }: UseChatStreamArgs) {
    const data = ref("")

    resolveStream({
      data,
      onChunk,
      onReady,
      stream,
    })

    return {
      data: readonly(data)
    }
  }

  type ResolveStreamArgs = {
    data: Ref<string>,
    onChunk: (data: { data: string }) => void,
    onReady: (data: { data: string }) => void,
    stream: ReadableStream<Uint8Array>,
  }
  async function resolveStream({
    data, onChunk, onReady, stream,
  }: ResolveStreamArgs) {
    const reader = stream.pipeThrough(new TextDecoderStream()).getReader()
    while (true) {
      const stream = await reader.read()
      if (stream.done) break

      onChunk({ data: stream.value })
    }

    onReady({ data: data.value })
  }

  return {
    askQuestion,
    question,
    isAnswering,
    didConversationStart: readonly(didConversationStart),
    parsedAnswerAst: readonly(parsedAnswerAst),
    messages: readonly(messages),
    getExistingMessages,
    answer: readonly(answer),
  }
}

function useMenu() {
  const isOpen = ref(false);
  const toggleMenu = () => {
    isOpen.value = !isOpen.value;
  }
  const closeMenu = () => {
    isOpen.value = false;
  }

  return {
    isOpen: readonly(isOpen),
    toggleMenu,
    closeMenu
  }
}

function useBottomScroll(messageContainer: Ref<HTMLElement | undefined>) {
  const didUserScrollManually = ref(false)
  const resetUserManualScroll = () => {
    didUserScrollManually.value = false
  }
  const didUserReachBottom = ref(false)

  function updateScrollBottomUnlessOverridden() {
    if (didUserScrollManually.value) {
      return
    }
    return updateScrollBottom()
  }

  function updateScrollBottom() {
    if (!messageContainer.value) {
      return
    }
    didUserReachBottom.value = didScrollToElBottom(messageContainer.value)
  }

  // Get scroll position from composable
  const { y: bottomScrollPositionOnScroll } = useScroll(messageContainer)

  // Update position when new bottom scroll comes in
  watch(bottomScrollPositionOnScroll, (newVal, prevVal) => {
    const didScrollToTop = prevVal - newVal > 0
    if (didScrollToTop) {
      didUserScrollManually.value = true
    }
    updateScrollBottom()
  })

  /**
   * Scrolls to last message when called unless the user already scrolled away
   */
  function scrollToLastMessageUnlessOverridden() {
    if (didUserScrollManually.value) {
      return
    }
    scrollToLastMessage()
  }

  function scrollToLastMessage() {
    const lastMessage = messageContainer.value?.lastElementChild
    if (!lastMessage) {
      console.error('No last message!')
      return
    }
    lastMessage.scrollIntoView({ behavior: 'smooth', block: 'end', inline: 'nearest' })
    resetUserManualScroll()
  }


  const canScroll = ref(false)
  const stopWatching = watch(bottomScrollPositionOnScroll, () => {
    const canActuallyScroll = canElementScroll(messageContainer.value!)
    if (canActuallyScroll) {
      canScroll.value = canActuallyScroll
      stopWatching()
    }
  })


  return {
    canScroll,
    resetUserManualScroll,
    didUserReachBottom: readonly(didUserReachBottom),
    updateScrollBottom,
    updateScrollBottomUnlessOverridden,
    scrollToLastMessageUnlessOverridden,
    scrollToLastMessage
  }
}

function canElementScroll(element: HTMLElement): boolean {
  return element.scrollHeight > element.clientHeight
}

const CHECK_OFFSET_IN_PIXEL = 50
function didScrollToElBottom(el: HTMLElement): boolean {
  // console.log({ ch: el.clientHeight, sh: el.scrollHeight, st: el.scrollTop })
  return Math.abs(el.scrollTop) + el.clientHeight >= el.scrollHeight - CHECK_OFFSET_IN_PIXEL - 1
}

function useThreadKey() {
  const threadKeyStorageEntry = useLocalStorage('threadKey', () => generateKey())
  function retrieveKey() {
    return threadKeyStorageEntry.value
  }

  function generateKey() {
    return randomId() + randomId() + randomId() + randomId()
  }

  return {
    retrieveKey
  }
}

function randomId() {
  return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
}
</script>

<template>
  <div class="flex flex-col h-dvh" @click="closeMenu">
    <header class="relative">
      <button @click.stop="toggleMenu" class="absolute top-0 right-0 p-4">
        <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16"></path>
        </svg>
      </button>
      <div v-if="isOpen" class="fixed top-0 right-0 w-52 h-full bg-gray-200 shadow-xl p-4" @click.stop>
        <!-- Close Icon -->
        <button @click.stop="toggleMenu" class="absolute top-0 right-0 p-4">
          <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
          </svg>
        </button>
        <div class="flex flex-col justify-between h-full">
          <div class="mt-8">
            <ul>
              <li><a href="https://intrinsify.de/" target="_blank" class="block py-1">intrinsify.de</a></li>
              <li><a href="https://lichter.io/" target="_blank" class="block py-1">lichter.io</a></li>
              <li><a href="https://chri.so/" target="_blank" class="block py-1">chri.so</a></li>

            </ul>
          </div>
          <div>
            <ul>
              <!-- Your Submenu items-->
              <!-- <li><a href="/imprint" target="_blank" class="block py-1">Imprint</a></li>
              <li><a href="data-policy" target="_blank" class="block py-1">Data Policy</a></li> -->
              <li><i class="text-sm">Version: {{ version }}</i></li>
            </ul>
          </div>
        </div>
      </div>
      <NuxtLink to="https://intrinsify.de" target="_blank">
        <img src="https://placehold.co/200x40" alt="Bot-Logo" class="pt-4 w-36 mx-auto" />
      </NuxtLink>
      <h1 class="text-center text-xl font-bold mt-6">Awesome Bot Name</h1>
      <div class="flex items-center justify-center w-3/4 md:w-[60%] mx-auto mt-6 text-center"
        v-if="!didConversationStart">
        <p>An intro Text</p>
      </div>
    </header>
    <main ref="messageContainer" class="flex-1 overflow-y-auto">
      <div class="flex justify-center items-center overflow-y-auto mt-12" v-if="!didConversationStart">
        <div class="flex flex-col md:flex-row gap-4 p-2">
          <button class="btn text-left" @click="askQuestion('Tell me about Nuxt?')">Tell me <br />about Nuxt</button>
          <button class="btn text-left" @click="askQuestion('Why should I use Nuxt?')">Why should <br /> I use
            Nuxt?</button>
        </div>
      </div>
      <div class="px-4 py-2 space-y-4 mt-4">
        <div v-for="message, index in messages" :key="message.id"
          :class="{ 'text-right': message.role === 'user', 'text-left': message.role === 'assistant', 'pb-4': index === (messages.length - 1) }">
          <div
            :class="{ 'bg-[#FFEB9E] p-2 inline-block rounded-lg': message.role === 'user', 'bg-gray-200 p-2 inline-block rounded-lg': message.role === 'assistant' }">
            <MDC :value="message.content" tag="div" />
          </div>
        </div>
        <div class="mt-4 pb-4" v-if="answer">
          <div class="bg-gray-200 p-2 inline-block rounded-lg text-left">
            <MDCRenderer :body="parsedAnswerAst.body" :data="parsedAnswerAst.data" />
          </div>
        </div>
      </div>
    </main>
    <footer class="flex-shrink-0 items-center justify-between m-4">
      <form @submit.prevent="() => askQuestion()" class="flex items-center p-1 w-full rounded-xl bg-gray-100">
        <textarea required v-model="question" placeholder="Talk to me..."
          class="bg-transparent p-2 resize-none border-none focus:outline-none focus:ring-transparent flex-grow plc-color"
          @keydown.enter.exact.prevent="() => askQuestion()" />
        <button type="submit" :disabled="isAnswering" class="ml-4 px-6 py-2 rounded-full">
          <Icon class="text-4xl" :class="isAnswering ? 'text-gray-400' : 'text-black'" name="ri:send-plane-fill" />
        </button>
      </form>
    </footer>
    <button
      class="cursor-pointer absolute z-10 rounded-full bg-clip-padding bg-[#FFEB9E] right-1/2 bottom-32 translate-x-1/2"
      title="To the last message" @click="scrollToLastMessage"
      v-show="canContainerScroll && messages.length && !didUserReachBottom"><svg xmlns="http://www.w3.org/2000/svg"
        width="32" height="32" viewBox="0 0 24 24">
        <path fill="currentColor"
          d="M12 21a9 9 0 1 1 9-9a9 9 0 0 1-9 9m0-16.5a7.5 7.5 0 1 0 7.5 7.5A7.5 7.5 0 0 0 12 4.5" />
        <path fill="currentColor"
          d="M12 16.75a.74.74 0 0 1-.53-.22l-4-4a.75.75 0 0 1 1.06-1.06L12 14.94l3.47-3.47a.75.75 0 0 1 1.06 1.06l-4 4a.74.74 0 0 1-.53.22" />
        <path fill="currentColor" d="M12 16.75a.76.76 0 0 1-.75-.75V8a.75.75 0 0 1 1.5 0v8a.76.76 0 0 1-.75.75" />
      </svg>
    </button>
  </div>
</template>

<style scoped>
.btn {
  padding: 1rem;
  border: 2px solid rgb(243 244 246);
  color: #57585a;
  border-radius: 0.5rem;
  white-space: nowrap;
}

.plc-color::placeholder {
  color: #000;
}
</style>