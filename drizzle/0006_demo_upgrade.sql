-- すでにデモデータが入っているDB（Supabase など）向け：デモ動画に刺激の強さと新しいタグを付ける。デモ以外の動画には触れない
INSERT INTO tags (slug, name) VALUES ('%E3%82%A4%E3%83%81%E3%83%A3%E3%82%A4%E3%83%81%E3%83%A3', 'イチャイチャ'), ('%E3%82%B0%E3%83%A9%E3%83%9E%E3%83%BC', 'グラマー'), ('%E3%82%BB%E3%82%AF%E3%82%B7%E3%83%BC', 'セクシー'), ('%E3%83%8A%E3%82%A4%E3%83%88%E3%83%97%E3%83%BC%E3%83%AB', 'ナイトプール'), ('%E3%83%90%E3%82%B9%E3%83%AB%E3%83%BC%E3%83%A0', 'バスルーム'), ('%E3%83%99%E3%83%83%E3%83%89%E3%83%AB%E3%83%BC%E3%83%A0', 'ベッドルーム'), ('%E3%83%9B%E3%83%86%E3%83%AB', 'ホテル'), ('%E3%83%A9%E3%83%96%E3%83%A9%E3%83%96', 'ラブラブ'), ('%E3%83%A9%E3%83%B3%E3%82%B8%E3%82%A7%E3%83%AA%E3%83%BC', 'ランジェリー'), ('%E3%83%AA%E3%82%A2%E3%83%AB%E3%81%AA%E9%96%A2%E4%BF%82', 'リアルな関係'), ('%E5%88%BA%E6%BF%80%E7%9A%84', '刺激的'), ('%E5%9B%81%E3%81%8D', '囁き'), ('%E5%A4%A7%E4%BA%BA%E3%81%AE%E8%89%B2%E6%B0%97', '大人の色気'), ('%E5%B9%B4%E4%B8%8A%E3%81%AE%E5%A5%B3%E6%80%A7', '年上の女性'), ('%E7%AD%8B%E8%82%89%E8%B3%AA', '筋肉質'), ('%E7%B4%B0%E3%83%9E%E3%83%83%E3%83%81%E3%83%A7', '細マッチョ'), ('%E7%BE%8E%E8%84%9A', '美脚'), ('%E8%AA%98%E6%83%91', '誘惑'), ('%E8%BB%8A%E5%86%85', '車内') ON CONFLICT DO NOTHING;
--> statement-breakpoint
UPDATE videos SET intensity = 2 WHERE title = '雨上がりの窓辺' AND creator_id IN (SELECT id FROM users WHERE email LIKE '%@demo.example');
--> statement-breakpoint
INSERT INTO video_tags (video_id, tag_id) SELECT v.id, t.id FROM videos v CROSS JOIN tags t WHERE v.title = '雨上がりの窓辺' AND t.name IN ('セクシー', '大人の色気', 'ベッドルーム', 'ランジェリー') AND v.creator_id IN (SELECT id FROM users WHERE email LIKE '%@demo.example') ON CONFLICT DO NOTHING;
--> statement-breakpoint
UPDATE videos SET intensity = 3 WHERE title = '紫の時間' AND creator_id IN (SELECT id FROM users WHERE email LIKE '%@demo.example');
--> statement-breakpoint
INSERT INTO video_tags (video_id, tag_id) SELECT v.id, t.id FROM videos v CROSS JOIN tags t WHERE v.title = '紫の時間' AND t.name IN ('ランジェリー', '誘惑', 'ホテル') AND v.creator_id IN (SELECT id FROM users WHERE email LIKE '%@demo.example') ON CONFLICT DO NOTHING;
--> statement-breakpoint
UPDATE videos SET intensity = 1 WHERE title = '深夜のドライブ' AND creator_id IN (SELECT id FROM users WHERE email LIKE '%@demo.example');
--> statement-breakpoint
INSERT INTO video_tags (video_id, tag_id) SELECT v.id, t.id FROM videos v CROSS JOIN tags t WHERE v.title = '深夜のドライブ' AND t.name IN ('車内', '細マッチョ', '大人の色気') AND v.creator_id IN (SELECT id FROM users WHERE email LIKE '%@demo.example') ON CONFLICT DO NOTHING;
--> statement-breakpoint
UPDATE videos SET intensity = 2 WHERE title = '湾岸の灯り' AND creator_id IN (SELECT id FROM users WHERE email LIKE '%@demo.example');
--> statement-breakpoint
INSERT INTO video_tags (video_id, tag_id) SELECT v.id, t.id FROM videos v CROSS JOIN tags t WHERE v.title = '湾岸の灯り' AND t.name IN ('バスルーム', '筋肉質', '囁き') AND v.creator_id IN (SELECT id FROM users WHERE email LIKE '%@demo.example') ON CONFLICT DO NOTHING;
--> statement-breakpoint
UPDATE videos SET intensity = 3 WHERE title = 'ベルベットと低いジャズ' AND creator_id IN (SELECT id FROM users WHERE email LIKE '%@demo.example');
--> statement-breakpoint
INSERT INTO video_tags (video_id, tag_id) SELECT v.id, t.id FROM videos v CROSS JOIN tags t WHERE v.title = 'ベルベットと低いジャズ' AND t.name IN ('ラブラブ', 'イチャイチャ', 'ホテル', 'リアルな関係') AND v.creator_id IN (SELECT id FROM users WHERE email LIKE '%@demo.example') ON CONFLICT DO NOTHING;
--> statement-breakpoint
UPDATE videos SET intensity = 1 WHERE title = '琥珀色のラウンジ' AND creator_id IN (SELECT id FROM users WHERE email LIKE '%@demo.example');
--> statement-breakpoint
INSERT INTO video_tags (video_id, tag_id) SELECT v.id, t.id FROM videos v CROSS JOIN tags t WHERE v.title = '琥珀色のラウンジ' AND t.name IN ('ホテル', '美脚', '年上の女性') AND v.creator_id IN (SELECT id FROM users WHERE email LIKE '%@demo.example') ON CONFLICT DO NOTHING;
--> statement-breakpoint
UPDATE videos SET intensity = 2 WHERE title = '仕事終わりのバー' AND creator_id IN (SELECT id FROM users WHERE email LIKE '%@demo.example');
--> statement-breakpoint
INSERT INTO video_tags (video_id, tag_id) SELECT v.id, t.id FROM videos v CROSS JOIN tags t WHERE v.title = '仕事終わりのバー' AND t.name IN ('ナイトプール', 'グラマー', '刺激的') AND v.creator_id IN (SELECT id FROM users WHERE email LIKE '%@demo.example') ON CONFLICT DO NOTHING;
