# VYBE

18歳以上限定の縦型ショート動画プラットフォーム（Webファースト / モバイル最優先）。
TikTok と同じ「縦スワイプ・自動再生・次の動画の先読み・無限スクロール」の操作感を、独自のデザインとテーマ切り替えで提供します。

- 設計書：[docs/README.md](./docs/README.md)
- 画面デザインの試作（単体HTML）：[prototype/](./prototype/)

## 公開する（Render）

> **データベース（PostgreSQL）は必須です。** 組み込みDB（PGlite）は約500MBのメモリを使うため、Render の無料プラン（512MB）では落ちます。
> PostgreSQL につないだ場合のメモリは約190MBです。本番で `DATABASE_URL` が未設定のときは、起動はしますが「データベースが未接続」と表示します。

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/ryuki0325/18tiktok)

1. 上のボタンを押す（または Render → **New → Blueprint** → このリポジトリを選ぶ）。初回は Render に GitHub の接続を許可する
2. `ADMIN_EMAIL`（運営のメールアドレス）と `ADMIN_PASSWORD`（運営のパスワード）を入力して **Apply**
3. Webサービスと PostgreSQL が作られ、数分で `https://glow-xxxx.onrender.com` が発行される
4. スマホでそのURLを開き、「ホーム画面に追加」

- うまく動かないときは `https://（あなたのURL）/api/health` を開くと、データベースの接続や設定の状態が分かります。
- 手動で Web Service を作った場合も動きます（`AUTH_SECRET` が未設定なら自動生成、`ADMIN_PASSWORD` が未設定なら初期パスワードを自動で作ってサーバーのログに表示）。ただし、ディスクが消えると年齢確認とログインがやり直しになるため、`AUTH_SECRET` の設定を推奨します。
- `render.yaml` に設定が入っています（無料プラン・シンガポール）。`AUTH_SECRET` は自動で作られます。
- 以後、`main` にプッシュするたびに自動で更新されます。
- 無料プランは、しばらくアクセスがないと止まり、次のアクセスで起動するまで数十秒かかります。無料の PostgreSQL には利用期限があります。本番運用では有料プランにしてください。
- **公開前に**：Render の利用規約が成人向けコンテンツを認めているかを必ず確認してください（今は動画が抽象的なプレースホルダーのみ）。

## Supabase を使う場合
1. Supabase の **Project Settings → Database → Connection string** を開き、**Session pooler**（ポート 5432）の接続文字列をコピーする
   （`postgresql://postgres.xxxx:[YOUR-PASSWORD]@aws-0-….pooler.supabase.com:5432/postgres`。`[YOUR-PASSWORD]` はデータベースのパスワードに置き換える）
2. Render の Environment の `DATABASE_URL` に貼る
- Supabase のときは自動で **SSL を使い、テーブルを専用スキーマ `glow` に作ります**。`public` スキーマは Supabase のAPI（anon key）から読めるため、そこにはユーザー情報を置きません。
- 「Direct connection」（db.xxxx.supabase.co）は IPv6 専用のため、Render からはつながらないことがあります。Session pooler を使ってください。

## 動かし方

```bash
npm install
cp .env.example .env.local   # AUTH_SECRET に32文字以上のランダム文字列を入れる（開発中は空でも動く）
npm run dev                  # http://localhost:3000
```

- データベースの準備は不要です。`DATABASE_URL` が空なら、組み込みの PostgreSQL（PGlite）を `.data/` に作り、マイグレーションとデモデータを自動で入れます。
- 本番では `DATABASE_URL` に PostgreSQL の接続文字列を入れるだけで切り替わります。
- やり直したいときは `npm run db:reset`（`.data/` を消す）。

### デモ用アカウント
| 用途 | メール | パスワード |
|---|---|---|
| 運営（スーパー管理者） | admin@example.com | 開発中は `glow-admin-dev`（`ADMIN_PASSWORD` で変更） |
| 投稿者 | mio_gold@demo.example など | glow-demo-password |
| 閲覧者 | viewer@demo.example | glow-demo-password |

管理画面（`/admin`）は初回ログイン時に2段階認証（認証アプリ）の登録が必要です。

## テスト

```bash
npm test          # ユニットテスト（URL検証・テーマ・TOTP・年齢確認Cookie・通報・審査・クリック計測・追記型ログ）
npm run build && npm run test:e2e   # ブラウザでのE2E（年齢ゲート・API直叩き・通報→非公開・外部リンク・権限）
npm run lint && npm run typecheck
```

## スマホ向けの作り
- **ホーム画面に追加（PWA）**：アプリのように全画面で開く。アイコン・起動時の色・縦向き固定を設定済み（設定画面とマイページに「ホーム画面に追加」の案内）
- **iPhoneの画面端**：ノッチ・ステータスバー・ホームバーに重ならないよう、上下の余白を端末に合わせて確保
- **操作**：縦スワイプで次の動画、タップで停止、**ダブルタップでいいね**（ハートが出る・Androidは軽く振動）、長押しでUIを隠す、**左スワイプで投稿者ページ**、シートは**下にスワイプで閉じる**
- **誤操作の防止**：入力欄は16px以上（iPhoneでフォーカス時に勝手に拡大しない）、タップ時の灰色のハイライトなし、動画の長押しメニューなし、引っ張って更新の誤動作なし
- **PCで開いた場合**：スマホ幅の画面の横に「スマホで開いてください」のQRコードを表示（管理画面はPC向け）
- **2回目以降の高速化**：ハッシュ付きの静的ファイル（JS/CSS/アイコン）だけをService Workerでキャッシュ。ページ・API・動画はキャッシュしない（年齢確認と公開状態を常にサーバーで判定するため）

## TikTok に寄せたスワイプ（`src/components/feed/usePager.ts`）
- ブラウザのスクロールではなく、指の動きを自分で処理して `transform` で動かす（GPUだけで描画、60fpsを保ちやすい）
- 指に吸い付いて動き、離したときの**速さ**と**距離**で「次へ／戻る／元の位置」を決める（短くても素早く弾けば次へ）
- **滑り止め**：どれだけ大きく・速く弾いても、1回で進むのは1本だけ。指でも1本先より向こうへは引っ張れない
- 止まり方はほぼ臨界減衰のばね（行き過ぎずにスッと止まる）。動いている途中で指を置くと、その位置でつかめる
- 端ではゴムのように伸びて戻る。**先頭で下に引くと更新**
- トラックパッド・ホイールは慣性の余韻を無視して、1回の操作で1本。キーボードは ↑↓ / J K / PageUp・PageDown
- 次の動画の描画は優先度を下げて行い、アニメーション中のコマ落ちを防ぐ（CPUを1/4に落とした状態で約60fps）
- タップ＝一時停止、ダブルタップ＝いいね、長押し＝UIを隠す、左スワイプ＝投稿者ページ

## 軽さ・速さのための仕組み
- フィードは最初の6本だけをサーバーで描画し、残り3本になったら次の8本を読み込む（無限スクロール）
- 描画するのは「今の1本と前後1本」だけ。それ以外は空の箱を置き、メモリと描画負荷を一定に保つ
- アニメーションするのは表示中の1本だけ。プレースホルダーは `filter: blur` を使わず、GPU合成だけで動く
- 動画はHLS（2秒ごとの小さなセグメント × 複数の画質）。回線に合わせてプレイヤーが画質を自動で選ぶ（iPhoneは標準のプレイヤー、それ以外は hls.js を必要な時だけ読み込む）
- 表示中の1本は30秒分、次の1本は最初の4秒分だけ先読み → スワイプした瞬間に再生が始まる。2本先はサムネイルだけ先読み
- 横長の動画は切らずに全体を表示（上下は黒帯）。縦長は画面いっぱい

## 動画の保存と配信（DBには場所だけ）
```
一覧：スマホ → API → DB（動画ID・投稿者ID・タイトル・投稿日時・サムネイルURL・動画URL・縦横・いいね数・再生数）
本体：スマホ → CDN（HLS の .m3u8 と小さなセグメント）
```
- DBに動画ファイルは入れない。`videos.playback_url` / `thumbnail_url` に「場所」だけを持つ
- いいね数・再生数は `videos.like_count` / `view_count`（DBトリガーで増減）。一覧のたびに数え直さない
- インデックス：最新の動画 `(status, published_at)`、特定ユーザーの動画 `(creator_id, published_at)`
- **アップロードはチャンク方式（tus）**：「初期化 → 8MBずつ送信 → 完了」。回線が切れても続きから再開でき、同じファイルを選び直しても続きから送る
  - `POST /api/v1/uploads` 初期化 → `PATCH`（チャンク）/ `HEAD`（受け取り済みの位置）→ `POST /api/v1/uploads/:id/complete`
- 保存先は2種類（`src/lib/media.ts`）
  - **Bunny Stream（本番の推奨）**：ブラウザから Bunny に直接アップロード（APIキーは渡さず署名だけ渡す）。HLS変換・サムネイル・CDN配信は Bunny 側。`BUNNY_STREAM_*` の3つを設定するだけで切り替わる
  - 通信量＝料金なので、先読みは「再生中12秒・次の動画2秒」まで。画面を隠している間は読み込みを止め、通信量の節約がオンの端末ではさらに控えめにする
  - スマホの画面には 720p で十分なので、それ以上の画質があっても使わない
  - 削除された動画のファイルは7日後に保存先からも消す（置いてあるだけで保存料がかかるため）。中断されたアップロードも片付ける
  - 1本あたりの長さは5分まで（`UPLOAD_MAX_SEC`）。長い動画は保存も配信も高くつく
  - **local**：このサーバーに保存し、ffmpeg で 360p/540p/720p/1080p の HLS に変換して `/media/...` から配信（開発用。本番で使う場合は消えないディスクと ffmpeg が必要）
- テーマはCookieに保存し、サーバー側で `<head>` に色を埋め込むので、表示のちらつきがない

## 構成
| 層 | 使っているもの |
|---|---|
| 画面 | Next.js 16（App Router）/ React 19 / TypeScript / Tailwind CSS v4 + CSS変数（テーマトークン） |
| DB | PostgreSQL（開発は PGlite）/ Drizzle ORM / マイグレーションは `drizzle/` |
| 認証 | 自前（scrypt・HttpOnly Cookie セッション）、管理者は TOTP 2段階認証 |
| 年齢確認 | 署名付きCookie。`src/proxy.ts` で一次チェック、サーバー側（ページ・API・DB）で再確認 |

## 定期処理
- `POST /api/cron/link-health`：外部リンクの死活確認（転送先が許可外のドメインなら無効化、3回失敗で無効化）
- `POST /api/cron/purge`：期限切れのセッション・トークン・古い閲覧記録などを削除
- `Authorization: Bearer $CRON_SECRET` を付けて外部のcronサービスから呼ぶ。管理画面の「設定」から今すぐ実行もできる

## まだ入っていないもの
- 動画の保存先（Bunny Stream など）のアカウント設定（設定するまで本番の投稿画面は「準備中」表示。デモ動画は抽象的なプレースホルダー）
- 投稿者の本人確認（運用方針の決定待ち）
- メール送信の設定（Resend に対応済み。`MAIL_PROVIDER=resend` などを設定すると送られる。未設定の間は、登録時の確認リンクを画面に、パスワード再設定のリンクはサーバーログにだけ出す）
- 重複動画の検知・違法コンテンツの自動検知（差し込み口のみ設計済み）
