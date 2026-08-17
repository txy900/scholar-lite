// import { ref, onMounted, onBeforeUnmount, type Ref } from 'vue'

// /**
//  * 段落级同步滚动。
//  *
//  * 思路（面试时可以这样讲）：
//  * 1. 原文/译文两个容器里，每个段落的DOM节点都打上 data-segment-id 属性。
//  * 2. 给「当前正在被用户滚动的一侧」挂 IntersectionObserver，持续判断
//  *    「视口中露出最多的是第几段」——这比监听 scroll 事件手动算滚动距离更稳，
//  *    因为两栏内容长度通常不一致，按百分比换算会跟原文/译文对不上。
//  * 3. 判断出「焦点段落」后，让另一侧滚动到同一个 segment id 对应的节点。
//  * 4. 关键坑：另一侧被程序滚动时，会触发它自己的 IntersectionObserver，
//  *    如果不加处理，会反过来又把第一侧带偏，造成两栏互相拉扯、抖动。
//  *    解决方式：加一个「谁是当前发起者」的锁，程序化滚动期间忽略被动一侧
//  *    上报的焦点变化，滚动稳定后（用短延时）再解锁。
//  */
// export function useSegmentScrollSync(
//   leftContainer: Ref<HTMLElement | null>,
//   rightContainer: Ref<HTMLElement | null>,
//   enabled: Ref<boolean>
// ) {
//   const activeSegmentId = ref<number | null>(null)

//   // 'left' | 'right' | null —— 记录当前是哪一侧在主动触发滚动，
//   // 避免程序化滚动另一侧时触发的 IntersectionObserver 又反过来影响这一侧
//   let syncSource: 'left' | 'right' | null = null
//   let unlockTimer: number | undefined

//   function lockSource(side: 'left' | 'right') {
//     syncSource = side
//     window.clearTimeout(unlockTimer)
//     unlockTimer = window.setTimeout(() => {
//       syncSource = null
//     }, 150) // 滚动动画大致稳定所需时间，可按实际体验微调
//   }

//   function scrollToSegment(container: HTMLElement, segmentId: number) {
//     const el = container.querySelector<HTMLElement>(`[data-segment-id="${segmentId}"]`)
//     el?.scrollIntoView({ block: 'start', behavior: 'auto' })
//   }

//   function createObserver(
//     container: HTMLElement,
//     side: 'left' | 'right',
//     otherContainer: Ref<HTMLElement | null>
//   ) {
//     const observer = new IntersectionObserver(
//       (entries) => {
//         if (!enabled.value) return
//         // 程序化滚动导致的另一侧变化，直接忽略，防止抖动
//         if (syncSource && syncSource !== side) return

//         // 找视口中相交比例最大的段落，作为「当前焦点段」
//         let best: { id: number; ratio: number } | null = null
//         for (const entry of entries) {
//           if (!entry.isIntersecting) continue
//           const id = Number((entry.target as HTMLElement).dataset.segmentId)
//           if (!best || entry.intersectionRatio > best.ratio) {
//             best = { id, ratio: entry.intersectionRatio }
//           }
//         }
//         if (best === null || best.id === activeSegmentId.value) return

//         activeSegmentId.value = best.id
//         lockSource(side)
//         if (otherContainer.value) {
//           scrollToSegment(otherContainer.value, best.id)
//         }
//       },
//       {
//         root: container,
//         threshold: [0, 0.25, 0.5, 0.75, 1]
//       }
//     )

//     const segmentEls = container.querySelectorAll<HTMLElement>('[data-segment-id]')
//     segmentEls.forEach((el) => observer.observe(el))
//     return observer
//   }

//   let leftObserver: IntersectionObserver | null = null
//   let rightObserver: IntersectionObserver | null = null

//   // 段落数量可能在翻译流式输出过程中变化（新段落陆续出现），
//   // 所以暴露一个 reinit 方法，在段落列表变化后重新绑定观察目标
//   function reinit() {
//     leftObserver?.disconnect()
//     rightObserver?.disconnect()
//     if (!leftContainer.value || !rightContainer.value) return
//     leftObserver = createObserver(leftContainer.value, 'left', rightContainer)
//     rightObserver = createObserver(rightContainer.value, 'right', leftContainer)
//   }

//   onMounted(reinit)
//   onBeforeUnmount(() => {
//     leftObserver?.disconnect()
//     rightObserver?.disconnect()
//     window.clearTimeout(unlockTimer)
//   })

//   return { activeSegmentId, reinit }
// }


import { ref, onMounted, onBeforeUnmount, type Ref } from 'vue'

/**
 * 段落级同步滚动 —— 第二版实现。
 *
 * 第一版用 IntersectionObserver，问题是它只在元素跨过预设阈值点（如25%/50%/75%）
 * 时才触发，判断"当前焦点段落"时信息是滞后、不连续的，导致同步不准、还会抖动。
 *
 * 这一版改用：监听 scroll 事件 + requestAnimationFrame 节流 + getBoundingClientRect
 * 实时测量，每一帧都能拿到精确的"当前视口里最靠上的是第几段"，不依赖离散阈值。
 */
export function useSegmentScrollSync(
  leftContainer: Ref<HTMLElement | null>,
  rightContainer: Ref<HTMLElement | null>,
  enabled: Ref<boolean>
) {
  const activeSegmentId = ref<number | null>(null)

  // 记录「当前正在被程序滚动、应忽略其scroll事件」的容器，防止对侧联动触发反向同步造成抖动
  let suppressedContainer: HTMLElement | null = null

  function findTopVisibleSegment(container: HTMLElement): HTMLElement | null {
    const containerTop = container.getBoundingClientRect().top
    const els = Array.from(container.querySelectorAll<HTMLElement>('[data-segment-id]'))
    let result = els[0] ?? null
    for (const el of els) {
      const relTop = el.getBoundingClientRect().top - containerTop
      if (relTop <= 12) {
        result = el // 顶部还在视口顶部之上（或刚好压线），继续找更靠下的
      } else {
        break // 已经找到「刚好越过视口顶部」的那一段，停止
      }
    }
    return result
  }

  function syncOtherSide(target: HTMLElement, segmentId: number) {
    const el = target.querySelector<HTMLElement>(`[data-segment-id="${segmentId}"]`)
    if (!el) return
    suppressedContainer = target
    el.scrollIntoView({ block: 'start', behavior: 'auto' })
    // scrollIntoView触发的scroll事件是异步派发的，用两帧rAF确保事件已经走完再解除抑制
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (suppressedContainer === target) suppressedContainer = null
      })
    })
  }

  function bindScroll(container: HTMLElement, other: Ref<HTMLElement | null>) {
    let ticking = false
    const onScroll = () => {
      if (!enabled.value || suppressedContainer === container) return
      if (ticking) return
      ticking = true
      requestAnimationFrame(() => {
        ticking = false
        const topEl = findTopVisibleSegment(container)
        if (!topEl) return
        const id = Number(topEl.dataset.segmentId)
        if (id === activeSegmentId.value) return
        activeSegmentId.value = id
        if (other.value) syncOtherSide(other.value, id)
      })
    }
    container.addEventListener('scroll', onScroll, { passive: true })
    return () => container.removeEventListener('scroll', onScroll)
  }

  let cleanups: Array<() => void> = []

  function reinit() {
    cleanups.forEach((fn) => fn())
    cleanups = []
    if (!leftContainer.value || !rightContainer.value) return
    cleanups.push(bindScroll(leftContainer.value, rightContainer))
    cleanups.push(bindScroll(rightContainer.value, leftContainer))
  }

  onMounted(reinit)
  onBeforeUnmount(() => cleanups.forEach((fn) => fn()))

  return { activeSegmentId, reinit }
}