export function Field({ label, hint, children, htmlFor }: { label: string; hint?: string; children: React.ReactNode; htmlFor?: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <label className="label" htmlFor={htmlFor}>{label}{hint && <small>{hint}</small>}</label>
      {children}
    </div>
  );
}

export function Check({ name, children, required, defaultChecked }: { name: string; children: React.ReactNode; required?: boolean; defaultChecked?: boolean }) {
  return (
    <label className="check">
      <input type="checkbox" name={name} required={required} defaultChecked={defaultChecked} />
      <span className="box"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg></span>
      <span>{children}</span>
    </label>
  );
}

export function FormMessage({ state }: { state?: { error?: string; info?: string; devLink?: string } }) {
  if (!state) return null;
  return (
    <>
      {state.error && <div className="notice bad" role="alert">{state.error}</div>}
      {state.info && (
        <div className="notice info" role="status" style={{ flexDirection: "column", gap: 6 }}>
          <span>{state.info}</span>
          {state.devLink && <span className="cap">メール送信の設定前のため、確認リンクをここに表示しています：<a href={state.devLink} style={{ color: "var(--accent)", textDecoration: "underline", fontWeight: 600 }}>メールアドレスを確認する</a></span>}
        </div>
      )}
    </>
  );
}
