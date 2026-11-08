/** Resolves persisted queue IDs against the current library. */
export function normalizeQueue(
  persisted: string[] | null | undefined,
  libraryOrder: string[],
  validIds: Set<string>
): string[] {
  const source = persisted ?? libraryOrder
  const seen = new Set<string>()
  const queue: string[] = []
  for (const id of source) {
    if (!validIds.has(id) || seen.has(id)) continue
    seen.add(id)
    queue.push(id)
  }
  return queue
}

export function sequentialNextIndex(length: number, current: number, direction: 1 | -1): number {
  if (length <= 0) return -1
  if (current < 0) return direction === 1 ? 0 : length - 1
  return (current + direction + length) % length
}

/** Picks another queue item; avoids repeating the current item when possible. */
export function randomNextIndex(length: number, current: number, random = Math.random): number {
  if (length <= 0) return -1
  if (length === 1) return 0
  if (current < 0) return Math.floor(random() * length)
  const offset = 1 + Math.floor(random() * (length - 1))
  return (current + offset) % length
}

export function moveQueueItem<T>(items: T[], from: number, to: number): T[] {
  if (
    from === to ||
    from < 0 ||
    to < 0 ||
    from >= items.length ||
    to >= items.length
  ) {
    return items.slice()
  }
  const next = items.slice()
  const [moved] = next.splice(from, 1)
  next.splice(to, 0, moved)
  return next
}
