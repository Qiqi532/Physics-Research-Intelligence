INSERT INTO "PhysicsTag" ("slug", "labelEn", "labelZh", "group", "isCrossDisciplinary")
VALUES
  ('amo-optics', 'AMO and Optics', '原子、分子与光学', 'amo-optics', false),
  ('condensed-matter-materials', 'Condensed Matter and Materials', '凝聚态与材料', 'condensed-matter-materials', false),
  ('high-energy-particle', 'High Energy and Particle Physics', '高能与粒子物理', 'high-energy-nuclear-astro', false),
  ('nuclear', 'Nuclear Physics', '核物理', 'high-energy-nuclear-astro', false),
  ('astrophysics', 'Astrophysics', '天体物理', 'high-energy-nuclear-astro', false),
  ('statistical-computational', 'Statistical and Computational Physics', '统计与计算物理', 'statistical-computational', false),
  ('plasma', 'Plasma Physics', '等离子体物理', 'plasma', false),
  ('biophysics', 'Biophysics', '生物物理', 'biophysics', false),
  ('cross-disciplinary', 'Cross-disciplinary Physics', '交叉物理', 'cross-disciplinary', true)
ON CONFLICT ("slug") DO UPDATE SET
  "labelEn" = EXCLUDED."labelEn",
  "labelZh" = EXCLUDED."labelZh",
  "group" = EXCLUDED."group",
  "isCrossDisciplinary" = EXCLUDED."isCrossDisciplinary";
