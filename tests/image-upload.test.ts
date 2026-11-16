import { describe, expect, it } from 'vitest'
import { buildDishImagePath, MAX_IMAGE_BYTES, validateImageFile } from '../src/lib/image-upload'

describe('dish image upload helpers', () => {
  it('accepts JPG, PNG and WebP under 5 MB', () => {
    expect(validateImageFile({ type: 'image/jpeg', size: 1024 })).toBeNull()
    expect(validateImageFile({ type: 'image/png', size: 1024 })).toBeNull()
    expect(validateImageFile({ type: 'image/webp', size: MAX_IMAGE_BYTES })).toBeNull()
  })

  it('rejects other formats, empty files and files over the limit', () => {
    expect(validateImageFile({ type: 'image/gif', size: 1024 })).toMatch(/JPG, PNG o WebP/)
    expect(validateImageFile({ type: 'image/png', size: MAX_IMAGE_BYTES + 1 })).toMatch(/5 MB/)
    expect(validateImageFile({ type: 'image/png', size: 0 })).toMatch(/vacía/)
  })

  it('builds a safe storage path with the right extension', () => {
    expect(buildDishImagePath('Foto.PNG', 'abc')).toBe('dishes/abc.png')
    expect(buildDishImagePath('burger.jpeg', 'abc')).toBe('dishes/abc.jpg')
    expect(buildDishImagePath('archivo.sin.extension', 'abc')).toBe('dishes/abc.jpg')
    expect(buildDishImagePath('x.png')).toMatch(/^dishes\/.+\.png$/)
  })
})
