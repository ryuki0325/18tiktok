import { describe, expect, it } from "vitest";
import { normalizeEmbed } from "@/lib/embed-normalize";

describe("埋め込みURLの正規化", () => {
  it("YouTube の視聴URLを自動再生の embed URL に変換する", () => {
    const yt = "https://www.youtube.com/embed/abc123?autoplay=1&mute=1&playsinline=1&loop=1&playlist=abc123&rel=0&modestbranding=1";
    expect(normalizeEmbed("https://www.youtube.com/watch?v=abc123")).toBe(yt);
    expect(normalizeEmbed("https://youtu.be/abc123")).toBe(yt);
    expect(normalizeEmbed("https://www.youtube.com/shorts/xyz789")).toContain("https://www.youtube.com/embed/xyz789?autoplay=1");
  });

  it("Vimeo / Dailymotion を自動再生の embed URL に変換する", () => {
    expect(normalizeEmbed("https://vimeo.com/12345678")).toBe("https://player.vimeo.com/video/12345678?autoplay=1&muted=1&loop=1&playsinline=1");
    expect(normalizeEmbed("https://www.dailymotion.com/video/x7xyz")).toBe("https://www.dailymotion.com/embed/video/x7xyz?autoplay=1&mute=1");
    expect(normalizeEmbed("https://dai.ly/x7xyz")).toBe("https://www.dailymotion.com/embed/video/x7xyz?autoplay=1&mute=1");
  });

  it("X / Twitter の投稿URLを公式の埋め込み iframe に変換する", () => {
    expect(normalizeEmbed("https://x.com/foo/status/2109035336806572053?s=46")).toBe("https://platform.twitter.com/embed/Tweet.html?id=2109035336806572053");
    expect(normalizeEmbed("https://twitter.com/foo/status/12345")).toBe("https://platform.twitter.com/embed/Tweet.html?id=12345");
  });

  it("Instagram / TikTok の投稿URLを埋め込みに変換する", () => {
    expect(normalizeEmbed("https://www.instagram.com/reel/AbC123/")).toBe("https://www.instagram.com/reel/AbC123/embed");
    expect(normalizeEmbed("https://www.tiktok.com/@user/video/7200000000000000000")).toBe("https://www.tiktok.com/embed/v2/7200000000000000000");
  });

  it("<iframe> 埋め込みコードから src を取り出す", () => {
    expect(normalizeEmbed('<iframe src="https://example.com/embed/1" width="640"></iframe>')).toBe("https://example.com/embed/1");
    expect(normalizeEmbed("<iframe  src='//cdn.example.com/player/2' allowfullscreen></iframe>")).toBe("https://cdn.example.com/player/2");
  });

  it("すでに埋め込み用URLはそのまま使う", () => {
    expect(normalizeEmbed("https://www.youtube.com/embed/abc123")).toBe("https://www.youtube.com/embed/abc123");
    expect(normalizeEmbed("https://player.vimeo.com/video/99")).toBe("https://player.vimeo.com/video/99");
  });

  it("空・不正な入力は null", () => {
    expect(normalizeEmbed("")).toBeNull();
    expect(normalizeEmbed("   ")).toBeNull();
    expect(normalizeEmbed("not a url")).toBeNull();
  });
});
