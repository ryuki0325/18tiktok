import Link from "next/link";
import { Icon } from "@/components/Icon";
import { TakedownForm } from "./TakedownForm";

export const metadata = { title: "削除・権利侵害の申告" };

export default function Takedown() {
  return (
    <main className="shell">
      <div className="navbar"><Link className="iconbtn" href="/settings" aria-label="戻る"><Icon name="back" /></Link><h1>削除・権利侵害の申告</h1><span className="sp44" /></div>
      <div className="sec" style={{ gap: 16, paddingBottom: 32 }}>
        <p className="muted" style={{ margin: 0, fontSize: 14 }}>無断転載・無断撮影・出演同意の取消しなどの申告を受け付けます。流れは<Link href="/legal/takedown-policy" style={{ textDecoration: "underline" }}>削除・権利侵害申告ポリシー</Link>をご覧ください。ログインは不要です。</p>
        <TakedownForm />
      </div>
    </main>
  );
}
