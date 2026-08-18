import type { Segment } from '@/types/translation'

// 为什么用IndexedDB而不是localStorage：
// 1. localStorage是同步API，数据量大时会阻塞主线程；IndexedDB是异步的，不卡UI
// 2. localStorage只能存字符串，存segments这种结构化数据需要手动JSON.stringify/parse，
//    数据量大了性能和维护成本都上升；IndexedDB原生支持存对象
// 3. localStorage单个域名一般只有5MB左右容量，IndexedDB容量大得多，適合存多篇翻译历史

const DB_NAME = 'scholar-lite-db'
const DB_VERSION = 1
const STORE_NAME = 'history'

export interface HistoryEntry {
  id: string
  createdAt: number
  preview: string // 取原文第一段的前若干字符，用于历史列表展示
  segments: Segment[]
}

export type HistorySummary = Pick<HistoryEntry, 'id' | 'createdAt' | 'preview'>

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)

    // onupgradeneeded：数据库首次创建、或版本号变化时触发，用来定义表结构（object store）
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' })
      }
    }

    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

export async function addHistoryEntry(entry: HistoryEntry): Promise<void> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite')
    tx.objectStore(STORE_NAME).put(entry)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

export async function getAllHistoryEntries(): Promise<HistoryEntry[]> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly')
    const req = tx.objectStore(STORE_NAME).getAll()
    req.onsuccess = () => resolve(req.result as HistoryEntry[])
    req.onerror = () => reject(req.error)
  })
}

export async function getHistoryEntry(id: string): Promise<HistoryEntry | undefined> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly')
    const req = tx.objectStore(STORE_NAME).get(id)
    req.onsuccess = () => resolve(req.result as HistoryEntry | undefined)
    req.onerror = () => reject(req.error)
  })
}

export async function deleteHistoryEntry(id: string): Promise<void> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite')
    tx.objectStore(STORE_NAME).delete(id)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}