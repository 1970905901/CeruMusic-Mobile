import { describe, expect, it } from "vitest"
import { filterLyricDocument, filterLyricLines, isLyricInfoLine, sanitizeLyricText } from "./lyricInfoFilter"
import type { LyricDocument } from "@/types/music"

function doc(lines: { text: string; translation?: string }[], plainText?: string): LyricDocument {
  return {
    format: "lrc",
    lines: lines.map((line, index) => ({
      startMs: index * 1000,
      endMs: (index + 1) * 1000,
      ...line
    })),
    plainText
  }
}

describe("lyric info filter", () => {
  it("removes credit lines in the default mode and keeps lyrics", () => {
    const result = filterLyricDocument(
      doc([
        { text: "作词：测试" },
        { text: "普通歌词" },
        { text: "OP: Ceru" },
        { text: "编曲 : 某人" },
        { text: "作曲 某人" }
      ]),
      { filterInfo: true }
    )
    expect(result.lines.map((line) => line.text)).toEqual(["普通歌词", "作曲 某人"])
  })

  it("keeps translations and timings of surviving lines", () => {
    const result = filterLyricDocument(
      doc([
        { text: "作词：测试", translation: "Lyrics by test" },
        { text: "你好", translation: "Hello" }
      ]),
      { filterInfo: true }
    )
    expect(result.lines).toHaveLength(1)
    expect(result.lines[0]).toMatchObject({ startMs: 1000, endMs: 2000, text: "你好", translation: "Hello" })
  })

  it("drops information from translations and romanization too", () => {
    const lines = filterLyricLines([
      { startMs: 0, text: "你好", translation: "作词：someone" },
      { startMs: 1000, text: "你好", romanization: "作曲：someone" }
    ])
    expect(lines).toHaveLength(0)
  })

  it("uses the aggressive colon rule in strict mode", () => {
    expect(isLyricInfoLine("你好：世界", true)).toBe(true)
    expect(isLyricInfoLine("你好：世界")).toBe(false)
    expect(isLyricInfoLine("[00:01.00]你好", true)).toBe(false)
    expect(
      filterLyricDocument(doc([{ text: "你好：世界" }, { text: "[00:01.00]再见" }]), {
        filterInfo: true,
        strict: true
      }).lines.map((line) => line.text)
    ).toEqual(["[00:01.00]再见"])
  })

  it("returns the same document when filtering is off or changes nothing", () => {
    const input = doc([{ text: "普通歌词" }])
    expect(filterLyricDocument(input)).toBe(input)
    expect(filterLyricDocument(input, { filterInfo: true })).toBe(input)
  })

  it("filters untimed plain text lyrics line by line", () => {
    const result = filterLyricDocument(doc([], "作词：测试\n普通歌词\n发行：某人"), { filterInfo: true })
    expect(result.plainText).toBe("普通歌词")
  })

  it("strips leaked QRC/YRC timing tokens from sidecar text", () => {
    expect(sanitizeLyricText("ying (24760,202)yin (24962,186)yi (25148,204)")).toBe("ying yin yi")
    expect(sanitizeLyricText("13010,1860")).toBe("")
    expect(sanitizeLyricText("13010,1860,0")).toBe("")
    expect(sanitizeLyricText("[1010,2690]你好")).toBe("你好")
    expect(sanitizeLyricText("<1010,2690>你好")).toBe("你好")
  })
})
