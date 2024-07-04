// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  future: {
    compatibilityVersion: 4
  },
  nitro: {
    storage: {
      'threads': {
        driver: 'vercelKV'
      }
    },
    devStorage: {
      'threads': {
        driver: 'memory'
      }
    },
    vercel: {
      functions: {
        maxDuration: 60
      }
    }
  },
  app: {
    head: {
      title: 'Nuxt UI for custom chatGPT Assistant',
    }
  },
  modules: [
    '@nuxtjs/tailwindcss',
    'nuxt-icon',
    '@nuxt/fonts',
    '@nuxtjs/mdc',
    "@nuxt/image",
    "@vueuse/nuxt"
  ],
  fonts: {
    experimental: {
      processCSSVariables: true,
    },
    defaults: {
      weights: [400, 700],
      styles: ['normal', 'italic'],
      subsets: [
        'latin',
        'latin-ext'
      ]
    },
  },
  mdc: {
    components: {
      map: {
        a: 'ProseA'
      }
    }
  },
  runtimeConfig: {
    openAiKey: '',
    assistantId: ''
  },
  devtools: { enabled: false }
})