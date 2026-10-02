# 小H — 第二阶段造型素材

## 文件

- `h-original-v1.png`：原始形态，1254×1254透明RGBA图片。
- `h-traveler-v1.png`：Time Traveler形态，1254×1254透明RGBA图片。
- `reference/h-original-source.png`：用户提供的“小H原始形态.png”原图，原样保留。
- `reference/h-traveler-source.png`：早前工作区上传的“小H宇航服形态.png”原图，原样保留。

## 生成方式

两张透明角色图使用内置image_gen编辑功能，以原图为参考移除灰色背景及地面阴影。本阶段不使用CLI/API图像生成。原始小H的第一张结果边缘有残留，随后通过同一图像工具做了一次清理；不使用Python修改图片。贴图仍须视觉确认。

## 生成提示词

### 原始形态首次抠图

Use case: background-extraction. Edit target: the attached original white little H mascot. Create a production WebAR character cutout from this exact image. Remove only the grey background and the ground shadow. Preserve the original character identity exactly: soft pure white pear-shaped body, large rounded head, two round ears, black dot eyes and tiny horizontal gently curved black mouth, short oval horizontal outstretched arms, two rounded legs, glossy soft white toy material. Keep the same front facing neutral T-like pose and the same proportions. No new clothes or accessories. Entire full body visible with ears, both hands and both feet not cropped. Center the figure on a square transparent canvas with approximately 7 percent margin at the closest edge of the character; minimize excessive padding. Keep natural highlight and self shading on the body. Actual transparent alpha background including between legs and arms, not grey, white or checkerboard painted into the image. No floor or drop shadow, no text, no watermark. Do not redesign or beautify or change expression. Intended as a single static 2.5D billboard texture; preserve clean anti-aliased opaque white character edges.

### 原始形态清理（当前接入版本）

Use case: background-extraction. Edit this cutout, making only its alpha edges clean. It currently has stray white flecks, pale islands and mottled fringe in the empty space around the head and legs. Remove ALL those stray disconnected pixels and halo fragments. Output exactly ONE clean connected mascot silhouette with smooth anti-aliased boundaries, transparent empty space outside its body and a clean transparent gap between the two legs. Preserve the mascot's white toy body, face, proportions, front facing pose, hands and feet, highlights and shading exactly. Do NOT add a black stroke or white outer glow, do not change expression, do not add a shadow. Keep whole character visible on a square transparent canvas. This must be a clean WebAR PNG sprite with genuine alpha. No opaque background, no speckles or cloud haze around the silhouette. No text.

### Time Traveler形态

Use case: background-extraction. Asset: a clean transparent PNG WebAR sprite. Edit target: reference astronaut little H mascot. Preserve this exact front-facing white mascot's body proportions, two small round ears inside its clear spherical space helmet, black dot eyes, small black curved mouth, white neck ring, white suit, short horizontally extended segmented arms with mittens, short segmented legs and white rounded boots, and the exact blue and grey two-row chest controls. Keep the dark outer rim and clear glossy helmet with its reflections; the head stays visible through the visor. Remove ONLY the grey background and floor shadow, no other redesign. Center the entire full-body character with approximately 7 percent margin on a square transparent canvas. Sharp clean connected silhouette, clean anti-aliased edges, no stray flecks, no mist, no extra disconnected white pixels. True transparent alpha outside the figure and in the gap between legs. No ground, no ground shadow, no text, no watermark. Intended for 2.5D AR texture, preserve all outfit details in reference and do not add accessories.

## v0.1.8动作接入

本阶段没有修改PNG或参考图。新增js/character-rig.js，使用细分网格对原有正面图片做局部手臂和头部变形；不是骨骼动作或新增多角度素材。Idle、Fly、Wave、Point、Celebrate及两形态渐变特效代码见js/character-billboard.js。视觉效果及设备运行均未测试；现有正面贴图在较大动作下可能发生拉伸。
