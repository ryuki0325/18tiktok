import Link from "next/link";
import { Icon } from "./Icon";

export function NavBar({ title, back, right }: { title: string; back?: string; right?: React.ReactNode }) {
  return (
    <div className="navbar">
      {back ? <Link className="iconbtn" href={back} aria-label="戻る"><Icon name="back" /></Link> : <span className="sp44" />}
      <h1>{title}</h1>
      {right ?? <span className="sp44" />}
    </div>
  );
}
