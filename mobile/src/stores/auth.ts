import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import type { UserInfoResponse } from '@logto/capacitor'
import { REDIRECT_URI, logtoClient } from '@/services/authClient'
import { ceruApi } from '@/services/ceruApi'

export const useAuthStore = defineStore('auth', () => {
  const user = ref<UserInfoResponse | null>(null)
  const authenticated = ref(false)
  const loading = ref(false)
  const error = ref('')
  let initialized = false

  const displayName = computed(
    () => String((user.value as any)?.name || user.value?.username || '音乐同好')
  )
  const avatarUrl = computed(() => String((user.value as any)?.picture || ''))
  const customData = computed<Record<string, any>>(() => {
    const value = (user.value as any)?.custom_data
    return value && typeof value === 'object' ? value : {}
  })

  function reset() {
    user.value = null
    authenticated.value = false
  }

  async function refresh() {
    authenticated.value = await logtoClient.isAuthenticated()
    user.value = authenticated.value ? await logtoClient.fetchUserInfo() : null
  }

  async function init() {
    if (initialized) return
    initialized = true
    loading.value = true
    error.value = ''
    try {
      await refresh()
    } catch (cause) {
      error.value = cause instanceof Error ? cause.message : String(cause)
      reset()
    } finally {
      loading.value = false
    }
  }
  async function login() {
    loading.value = true
    error.value = ''
    try {
      await logtoClient.signIn({ redirectUri: REDIRECT_URI })
      await refresh()
    } catch (cause: any) {
      if (cause?.code !== 'user_cancelled') {
        error.value = cause instanceof Error ? cause.message : String(cause)
        throw cause
      }
    } finally {
      loading.value = false
    }
  }

  async function logout() {
    loading.value = true
    try {
      await logtoClient.signOut()
    } finally {
      reset()
      loading.value = false
    }
  }

  async function updateProfile(data: {
    name?: string
    intro?: string
    gender?: string
    birthday?: string
    region?: string
  }) {
    const custom = {
      intro: data.intro,
      gender: data.gender,
      birthday: data.birthday,
      region: data.region
    }
    const hasCustom = Object.values(custom).some((value) => value !== undefined && value !== '')
    if (data.name) {
      await ceruApi('/my-account/profile', {
        method: 'PATCH',
        body: JSON.stringify({ nickname: data.name })
      })
    }
    if (data.name || hasCustom) {
      await ceruApi('/my-account', {
        method: 'PATCH',
        body: JSON.stringify({
          ...(data.name ? { name: data.name } : {}),
          ...(hasCustom ? { customData: custom } : {})
        })
      })
    }
    await refresh()
  }

  async function uploadAvatar(file: File) {
    if (!['image/jpeg', 'image/jpg', 'image/png', 'image/gif'].includes(file.type)) {
      throw new Error('只支持 JPG、PNG、GIF 格式的图片')
    }
    if (file.size > 2 * 1024 * 1024) throw new Error('图片大小不能超过 2MB')
    const form = new FormData()
    form.append('file', file)
    await ceruApi('/user-info/avatar', { method: 'PUT', body: form })
    await refresh()
  }

  window.addEventListener('ceru:unauthorized', () => {
    reset()
    loading.value = false
  })

  return {
    user,
    authenticated,
    loading,
    error,
    displayName,
    avatarUrl,
    customData,
    init,
    refresh,
    login,
    logout,
    updateProfile,
    uploadAvatar
  }
})