# 顶刊物理论文语料（journal-corpus）

面向后续「AI 解读」与「收藏库 RAG」研究准备的本地物理论文语料。清单记录与权威物理期刊论文相匹配的 arXiv 版本和公开元数据；PDF 仅供本地个人研读。arXiv 可访问不等于获得任意再分发或外部模型处理授权，使用全文前仍须逐篇核对对应版本的许可条款。

## 规模与构成（共 45 篇，截至 2026-09-01）

| 期刊 | 篇数 | 说明 |
|---|---|---|
| Science | 9 | 含核物理（STAR 重子数）、量子气体相位显微镜、冷放射性分子、Weyl 半导体、系外行星、活性物质等 |
| Physical Review Letters | 12 | 含拓扑物态、量子计量、超强耦合、核物质、量子非局域性、量子行走等 |
| Nature | 8 | 含太阳系固态起源、白矮星行星大气、硅基量子处理器、anyonic 量子门、代数磁性、中微子等 |
| Nature Communications | 10 | 含体光伏效应、拓扑量子几何、skyrmion、超导、α 散射核物理、中红外成像等 |
| Nature Photonics | 6 | 含光热力学路由、量子记忆、城域量子中继、Kerr 孤子微梳、孪生场 QKD 等 |

覆盖方向：AMO/光学、凝聚态与材料、高能、核、天体、统计/计算、等离子体及交叉方向，
与项目九个物理标签体系对齐，可直接作为后续分类/解读/RAG 的验证语料。

## 为什么用 arXiv 全文而非出版社付费 PDF

- 项目既定边界（见 `findings.md`）：**订阅全文不入库、不批量下载、不发送给模型**；
  学校订阅只用于用户浏览器跳转原文。
- Nature.com 对自动化抓取有反爬保护（程序化请求返回 HTML 而非 PDF），且付费墙内全文
  批量下载/存储违反出版社许可条款。
- 因此本地语料保存这些期刊论文在 **arXiv 的作者提交版本 PDF**，用于个人研读和后续许可评估；
  不假定预印本与期刊排版版本完全一致，也不把可下载自动解释为允许发送给外部 AI。
- Science/Nature 等付费期刊论文在 arXiv 的 `journal_ref` 常缺失或不规范，已通过
  Crossref/OpenAlex 交叉核对 DOI 与标题、作者确认对应关系（见 `manifest.json` 的 DOI 与来源说明）。

## 目录结构

```
data/journal-corpus/
├── manifest.json          # 语料清单（权威事实层）：arxiv_id、期刊、DOI、标题、作者、摘要、SHA-256、大小
├── candidates.json        # arXiv 按期刊检索的候选结果（用于复现选目）
├── science_arxiv_meta.json# Science 篇目的 arXiv 元数据（含 Crossref/OpenAlex 核对信息）
├── pdfs/                  # 45 篇 PDF（Git 忽略，不入库；metadata 保留在 manifest）
└── scripts/
    ├── query_arxiv.py     # arXiv jr: 期刊检索
    ├── build_corpus.py    # 组装清单 + 下载 + 校验（幂等，可重跑）
    └── verify_corpus.py   # 独立复核：PDF 签名 + 大小 + SHA-256
```

## 下载与校验

- 全部从官方 arXiv PDF 端点下载，校验 `%PDF` 签名、字节数与 SHA-256，全部 45/45 通过；
  清单内每个 PDF 的 SHA-256 与磁盘文件逐一比对一致。
- 重新构建：`python data/journal-corpus/scripts/build_corpus.py`
- 独立复核：`python data/journal-corpus/scripts/verify_corpus.py`

## 许可与使用边界

- PDF 为 arXiv 作者提交版本，必须遵守所用版本的具体许可条款；仅供个人本地研读，**不得**提交到 Git 或由本项目再分发。
- 应用导入与模型处理仍应遵守项目边界：受限全文不入自动采集与模型输入；
  使用本地 PDF 全文前需有明确的许可/手动导入状态（对应阶段 9B 的资产元数据设计）。
- `manifest.json` 中的 DOI 用于在站内以 DOI 为键访问详情页（与现有 `Paper` 键一致）。

## English safety boundary

- `manifest.json` contains public metadata and abstracts for 45 selected records.
- Local PDFs must not be committed to Git or redistributed by this project.
- An accessible arXiv version does not automatically authorize external-model processing; verify the version-specific license first.
- The current application trial imports public metadata and abstracts only. It does not read or send PDF bytes.

## 与路线图的关系

- 本语料是阶段 9B（合法本地 PDF 资产）、阶段 10（单篇阅读助手）与阶段 11（收藏库 RAG）
  的**数据准备输入**，不属于任何代码阶段，不替代 `data/review-corpus/`（那是人工评审语料）。
- 后续实现阶段 9B 时，可据此语料建立「论文标识 → 资产元数据（SHA-256/大小/许可决策）」的导入边界。
