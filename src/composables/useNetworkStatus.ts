import { ref, onMounted, onBeforeUnmount } from 'vue'

/**
 * 监听浏览器的 online/offline 事件，给出即时的网络状态反馈。
 * 这个和 translateApi.ts 里的空闲超时是两层不同的保护：
 * - 这里能立刻感知"断网"这个明确信号，用户体验更及时
 * - 但断网不是唯一会卡住的原因（比如服务端无响应但网络本身正常），
 *   所以还需要空闲超时兜底，两者互补
 */
export function useNetworkStatus() {
  const isOnline = ref(navigator.onLine)

  function handleOnline() {
    isOnline.value = true
  }
  function handleOffline() {
    isOnline.value = false
  }

  onMounted(() => {
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
  })
  onBeforeUnmount(() => {
    window.removeEventListener('online', handleOnline)
    window.removeEventListener('offline', handleOffline)
  })

  return { isOnline }
}