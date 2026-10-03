import { viewerContext } from "@/lib/viewer";
import { Quiz } from "./Quiz";

export const metadata = { title: "はじめに" };

export default async function Welcome() {
  const ctx = await viewerContext();
  return <Quiz initialAudience={ctx.audience} initialTags={ctx.preferredTags} initialIntensity={ctx.maxIntensity} />;
}
