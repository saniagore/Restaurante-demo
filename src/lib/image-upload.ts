export const MAX_IMAGE_BYTES = 5 * 1024 * 1024
export const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const

export type ImageFileLike = { type: string; size: number }

export function validateImageFile(file: ImageFileLike): string | null {
  if (!ALLOWED_IMAGE_TYPES.includes(file.type as (typeof ALLOWED_IMAGE_TYPES)[number])) {
    return 'La imagen debe ser JPG, PNG o WebP.'
  }
  if (file.size > MAX_IMAGE_BYTES) {
    return 'La imagen no puede superar los 5 MB.'
  }
  if (file.size === 0) {
    return 'La imagen está vacía.'
  }
  return null
}

export function buildDishImagePath(fileName: string, id?: string): string {
  const extension = (fileName.split('.').pop() || '').toLowerCase()
  const safeExtension = extension === 'jpeg' ? 'jpg' : ['jpg', 'png', 'webp'].includes(extension) ? extension : 'jpg'
  const key = id || (globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2))
  return `dishes/${key}.${safeExtension}`
}
