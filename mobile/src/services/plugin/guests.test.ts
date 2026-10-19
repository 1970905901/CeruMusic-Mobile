import { describe, expect, it } from 'vitest'
import { privateHost, readGuestInfo } from './guests'

describe('guest compatibility helpers', () => {
  it('reads legacy script metadata from the header comment', () => {
    const info = readGuestInfo(
      '/**\n * @name 洛雪音源\n * @version 1.2.3\n * @author Tester\n */\nvar loaded = true',
      'fallback'
    )
    expect(info.name).toBe('洛雪音源')
    expect(info.version).toBe('1.2.3')
    expect(info.author).toBe('Tester')
  })

  it('classifies private and public hosts', () => {
    expect(privateHost('127.0.0.1')).toBe(true)
    expect(privateHost('192.168.1.2')).toBe(true)
    expect(privateHost('localhost')).toBe(true)
    expect(privateHost('api.example.com')).toBe(false)
    expect(privateHost('8.8.8.8')).toBe(false)
  })
})
