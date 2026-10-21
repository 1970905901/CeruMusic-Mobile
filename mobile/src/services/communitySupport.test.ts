import { afterEach, describe, expect, it, vi } from 'vitest'

const present = vi.fn()
type AlertOptions = Record<string, unknown>
const create = vi.fn(async (_options: AlertOptions) => ({ present }))

vi.mock('@ionic/vue', () => ({ alertController: { create } }))

const { buildSupportMessage, showSupportNotice } = await import('./communitySupport')

describe('community support notice', () => {
  afterEach(() => {
    create.mockClear()
    present.mockClear()
  })

  it('shows a blocking alert and puts the hotline in the body', async () => {
    await showSupportNotice({
      title: '你并不孤单',
      text: '可以拨打心理援助热线，也可以告诉身边信任的人',
      hotline: '12356'
    })

    expect(create).toHaveBeenCalledTimes(1)
    const options = create.mock.calls[0][0]
    expect(options.header).toBe('你并不孤单')
    expect(String(options.message)).toContain('12356')
    expect(present).toHaveBeenCalledTimes(1)
  })

  it('stays silent when the backend has no support payload', async () => {
    await showSupportNotice(undefined)
    await showSupportNotice(null)

    expect(create).not.toHaveBeenCalled()
    expect(present).not.toHaveBeenCalled()
  })

  it('omits the hotline line when no hotline is provided', () => {
    expect(buildSupportMessage({ text: '照顾好自己' })).toBe('照顾好自己')
  })
})
