---
date: 2026-11-08
slug: attention-is-all-your-need-paper-notes
image: https://raw.githubusercontent.com/kosmigen/picgo-pictures/master/20261108200322294.jpg
draft: true
categories:
 - AI 
 - 思考
 - Transformer
---

# Attention is all your need 精读

用注意力取代循环，让模型并行学习序列中的依赖关系。

<!-- more -->

2013 年，word2vec 把词表示成向量，AlexNet 带来的震动还没过去。序列建模仍主要依赖 RNN 和 LSTM，模型得按顺序一个词一个词算下去，训练慢，也难以并行。当时的研究大多围绕这套方法继续改进。

四年后，Google 的八位研究者尝试去掉循环和卷积，以注意力为核心构建模型。团队里最年轻的 Aidan Gomez，20 岁就以多伦多本科生的身份到 Google Brain 实习。八个人的署名顺序随机排列，脚注注明“同等贡献”。2017 年 6 月 12 日，他们把《Attention Is All You Need》上传到 arXiv。

这篇论文当年以海报形式在 NeurIPS 展示。此后，八位作者陆续离开 Google，分别投身 Cohere、Character.AI、Sakana AI、Essential AI、NEAR 等公司和项目。海报上的那套架构，则被广泛用于后来的大模型。

## Intro

这篇文章就是要做**序列**到**序列**的生成，介绍了当时主流的方法是基于复杂循环或者 RNN 。

// TODO 循环和卷积是之前效果比较好的方法，这两个的原理是啥？

// TODO 纯用 attention 并行度高，为什么？

// 跟你论文相关的论文是谁？这些论文和我的论文的联系是什么？区别是什么？

## 模型架构

