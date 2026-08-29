export type PhysicsTagDefinition = {
  slug: string;
  labelEn: string;
  labelZh: string;
  group: string;
  isCrossDisciplinary: boolean;
};

export const PHYSICS_TAGS = [
  {
    slug: "amo-optics",
    labelEn: "AMO and Optics",
    labelZh: "原子、分子与光学",
    group: "amo-optics",
    isCrossDisciplinary: false,
  },
  {
    slug: "condensed-matter-materials",
    labelEn: "Condensed Matter and Materials",
    labelZh: "凝聚态与材料",
    group: "condensed-matter-materials",
    isCrossDisciplinary: false,
  },
  {
    slug: "high-energy-particle",
    labelEn: "High Energy and Particle Physics",
    labelZh: "高能与粒子物理",
    group: "high-energy-nuclear-astro",
    isCrossDisciplinary: false,
  },
  {
    slug: "nuclear",
    labelEn: "Nuclear Physics",
    labelZh: "核物理",
    group: "high-energy-nuclear-astro",
    isCrossDisciplinary: false,
  },
  {
    slug: "astrophysics",
    labelEn: "Astrophysics",
    labelZh: "天体物理",
    group: "high-energy-nuclear-astro",
    isCrossDisciplinary: false,
  },
  {
    slug: "statistical-computational",
    labelEn: "Statistical and Computational Physics",
    labelZh: "统计与计算物理",
    group: "statistical-computational",
    isCrossDisciplinary: false,
  },
  {
    slug: "plasma",
    labelEn: "Plasma Physics",
    labelZh: "等离子体物理",
    group: "plasma",
    isCrossDisciplinary: false,
  },
  {
    slug: "biophysics",
    labelEn: "Biophysics",
    labelZh: "生物物理",
    group: "biophysics",
    isCrossDisciplinary: false,
  },
  {
    slug: "cross-disciplinary",
    labelEn: "Cross-disciplinary Physics",
    labelZh: "交叉物理",
    group: "cross-disciplinary",
    isCrossDisciplinary: true,
  },
] as const satisfies readonly PhysicsTagDefinition[];

type PhysicsTagSlug = (typeof PHYSICS_TAGS)[number]["slug"];

export const PHYSICS_TAG_SLUGS = PHYSICS_TAGS.map(({ slug }) => slug) as [
  PhysicsTagSlug,
  ...PhysicsTagSlug[],
];
