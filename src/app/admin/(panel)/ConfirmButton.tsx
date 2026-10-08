"use client";

/** 送信前に確認ダイアログを出す submit ボタン。フォーム内の値はそのまま送られる。 */
export function ConfirmButton({
  message, children, ...rest
}: { message: string } & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...rest}
      onClick={(e) => { if (!confirm(message)) e.preventDefault(); }}
    >
      {children}
    </button>
  );
}
