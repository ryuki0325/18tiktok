# 本番公開のセットアップ手順（VYBE）

コードは設定を読み込む準備ができています。ここでは、実際に動かすために
**あなたが各サービスで行う設定**を順番に書きます。すべて無料枠からでも始められますが、
写真の保存だけは有料ディスクが必要です（後述）。

> ⚠️ **大前提**：Bunny・Supabase・Render の各利用規約が、成人向けコンテンツの
> 取り扱いを認めているかを必ずご自身で確認してください。アカウント停止は
> サービス停止に直結します。これはコードでは保証できません。

---

## 0. 全体像

| サービス | 役割 | 無料で動く？ |
| --- | --- | --- |
| Render | アプリ本体（Next.js）の実行 | 動くが、写真保存には有料ディスクが必要 |
| Supabase | データベース（PostgreSQL） | 動く |
| Bunny Stream | 動画の変換・配信 | 標準エンコードは無料枠あり |
| Resend | 通知・確認メール | 無料枠あり |
| GitHub Actions | 定期処理の自動実行 | 無料 |

設定する環境変数はすべて **Render の Environment** に入れます。

---

## 1. データベース（Supabase）

1. Supabase でプロジェクトを作る。
2. **Project Settings → Database → Connection string → Session pooler（ポート5432）** の
   文字列をコピーする。
   （`postgresql://postgres.xxxx:[PASSWORD]@aws-0-….pooler.supabase.com:5432/postgres`）
3. `[PASSWORD]` を自分のDBパスワードに置き換える。
4. Render の Environment の `DATABASE_URL` に貼る。

- コードが Supabase を自動判別し、SSL必須＋専用スキーマ `glow` にテーブルを作ります
  （`public` には置かないので anon key からは読めません）。
- 「Direct connection」(db.xxxx.supabase.co) は IPv6専用でRenderから繋がらないことがあります。
  必ず Session pooler を使ってください。

## 2. 動画（Bunny Stream）

1. Bunny で **Stream ライブラリ**を作る。
2. 次の3つを Render の Environment に入れる。
   - `BUNNY_STREAM_LIBRARY_ID`（ライブラリID）
   - `BUNNY_STREAM_API_KEY`（ライブラリの API キー）
   - `BUNNY_STREAM_CDN_HOST`（`xxxx.b-cdn.net` のような配信ホスト）
3. **変換完了をすぐ反映する Webhook**（任意だが推奨）
   - Render に `BUNNY_WEBHOOK_SECRET`（適当な長い文字列）を入れる。
   - Bunny のライブラリ設定の Webhook URL に
     `https://<あなたのドメイン>/api/v1/webhooks/bunny?t=<BUNNY_WEBHOOK_SECRETの値>` を登録。
- 設定前は投稿画面の「動画」が「準備中」表示になります（写真は保存先に関係なく使えます）。
- 管理画面 → 設定 → 「動画の保存・配信」の **接続を確認する** で疎通を確かめられます。

## 3. 写真（サーバー保存・要 有料ディスク）

写真は Bunny ではなく**このアプリのサーバー**（`/media/photos/...`）に保存します。
Render の通常インスタンスはディスクが揮発性のため、**再起動で写真が消えます**。

1. Render のサービスに **Disk（永続ディスク）** を追加する（有料）。
2. マウント先を決め、Render の Environment に `MEDIA_DIR` を
   そのマウント先＋`/media`（例：`/data/media`）に設定する。
3. 必要なら枚数・サイズの上限を調整：
   - `UPLOAD_MAX_IMAGES`（1投稿の枚数、既定30）
   - `UPLOAD_MAX_IMAGE_MB`（1枚の上限MB、既定6）

> 将来、写真もCDN配信にしたくなったら Bunny Storage への切り替え口を用意できます
> （今はサーバー保存のみ）。

## 4. メール（Resend）

1. Resend でアカウントを作り、**送信元ドメインを認証**する（DNSに数レコード追加）。
   これをしないと送信できません。
2. Render の Environment に入れる。
   - `MAIL_PROVIDER=resend`
   - `RESEND_API_KEY`（Resend の API キー）
   - `MAIL_FROM`（例：`VYBE <noreply@あなたのドメイン>`）
   - `APP_URL`（例：`https://あなたのドメイン`。メール内リンクに使う）
- 未設定でも運用は止まりません（サイト内の「お知らせ」は必ず残ります）。
- 管理画面 → 設定 → 「通知メール」の **自分宛てにテスト送信** で確認できます。

## 5. 定期処理（GitHub Actions）

期限切れデータの削除・措置の自動解除・外部リンクの死活確認を1日1回呼びます。

1. Render の Environment に `CRON_SECRET`（長い文字列）を入れる。
2. GitHub のリポジトリ → **Settings → Secrets and variables → Actions** で2つ登録。
   - `SITE_URL`（例：`https://あなたのドメイン`、末尾スラッシュなし）
   - `CRON_SECRET`（Render と同じ値）
- ワークフローは `.github/workflows/cron.yml`（毎日 日本時間4:10）。
  手動実行も「Actions」タブからできます。
- 管理画面 → 設定 → 「定期処理」に最後の実行日時が出ます。2日以上空くと警告が出ます。
- ⚠️ GitHub Actions は、リポジトリに60日間まったく動きがないと自動で止まります。

## 6. 管理者と初期データ

Render の Environment（`render.yaml` にも定義あり）。

- `AUTH_SECRET`：32文字以上のランダム文字列（`render.yaml` で自動生成）。
- `ADMIN_EMAIL` / `ADMIN_PASSWORD`：最初の管理者。初回アクセス時に2段階認証を設定します。
- `SEED_DEMO`：`true` のままだとデモ投稿者・デモ動画が入ります。本番では **`false` 推奨**。

## 7. 送客先の登録（投稿を始める前に）

投稿者はアフィリエイトIDの登録が必須で、登録できるのは**運営が承認したサービス**だけです。

1. 管理画面 → **送客先** で、提携先サービス（ドメイン・URLの形）を追加し「承認」する。
2. これがないと、投稿者の登録画面に「登録できるサービスがありません」と出ます。

---

## 公開前チェックリスト

- [ ] `DATABASE_URL`（Supabase, Session pooler）を設定した
- [ ] `BUNNY_STREAM_*` 3つを設定し、接続確認が通った
- [ ] 写真用に永続ディスクを追加し、`MEDIA_DIR` を設定した
- [ ] `MAIL_PROVIDER=resend` ほかを設定し、テスト送信が届いた
- [ ] `CRON_SECRET` と GitHub Secrets（`SITE_URL`/`CRON_SECRET`）を設定した
- [ ] `SEED_DEMO=false` にした（本番）
- [ ] 送客先を1つ以上「承認」した
- [ ] 各社（Bunny/Supabase/Render/Resend）の規約で成人向けの取り扱いを確認した
- [ ] 利用規約・プライバシーポリシー・運営者情報・特定商取引法の表記を、専門家に確認した

> このチェックリストの法務項目（最後の2つ）は、私（Claude）では可否を判断できません。
> 必ず専門家にご確認ください。
