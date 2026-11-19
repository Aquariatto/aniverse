import type { GalgameEmotion } from './galgameAssets'

export interface GalgameTurn {
  reply: string
  emotion: GalgameEmotion
  scene: string | null
  affinityDelta: number
  suggestions: [string, string, string]
}

const pause = (duration: number) => new Promise<void>((resolve) => window.setTimeout(resolve, duration))

/** 离线回合 Mock：保留与 POST /api/galgame/turn 相同的返回结构。 */
export async function mockTurn(input: string): Promise<GalgameTurn> {
  const content = input.trim()
  await pause(360 + Math.min(280, content.length * 7))

  if (/讨厌|走开|别烦/.test(content)) {
    return {
      reply: '……好吧，我会给你一点空间。但等你愿意回头的时候，我还在这里。',
      emotion: '生气嘟嘴', scene: null, affinityDelta: -2,
      suggestions: ['对不起，我刚才语气太重了', '让我一个人静一会儿', '其实我不是那个意思'],
    }
  }
  if (/累|疲惫|辛苦|撑不住/.test(content)) {
    return {
      reply: '那就先把肩膀放松吧。今天不必再证明什么，你已经很努力地走到这里了。',
      emotion: '温柔微笑', scene: '现代公寓客厅', affinityDelta: 3,
      suggestions: ['你能陪我坐一会儿吗', '给我一句鼓励吧', '今天只想安静待着'],
    }
  }
  if (/海|散步|夕阳|沙滩/.test(content)) {
    return {
      reply: '好呀。趁最后一束阳光还留在海面上，我们把没说完的话慢慢讲完。',
      emotion: '开心大笑', scene: '海边沙滩', affinityDelta: 3,
      suggestions: ['那就牵着我的手吧', '我想听你小时候的故事', '我们拍张照片留念'],
    }
  }
  if (/星|宇宙|月亮|银河|流星/.test(content)) {
    return {
      reply: '你看，那颗星刚才亮了一下。也许它也在认真听我们说话呢。',
      emotion: '温柔微笑', scene: '黄昏天台', affinityDelta: 2,
      suggestions: ['哪一颗是你的星星', '许个愿吧', '下次也一起来看'],
    }
  }
  if (/喜欢|记得|想你|约定/.test(content)) {
    return {
      reply: '我当然记得。和你有关的每一个细节，都不是会轻易被风吹散的东西。',
      emotion: '害羞脸红', scene: null, affinityDelta: 3,
      suggestions: ['那就再约定一件事吧', '你最喜欢哪个瞬间', '我想更了解你'],
    }
  }
  if (/难过|伤心|想哭|失落/.test(content)) {
    return {
      reply: '不用急着把眼泪收起来。你可以先靠过来一点，我会安静听你说完。',
      emotion: '难过含泪', scene: null, affinityDelta: 2,
      suggestions: ['谢谢你愿意听我说', '可以抱抱我吗', '我不知道该怎么说'],
    }
  }
  if (/困|睡|晚安|打哈欠/.test(content)) {
    return {
      reply: '眼皮都在打架了吧？今晚的星星交给我看守，你安心去睡。晚安。',
      emotion: '困倦打哈欠', scene: '宿舍房间', affinityDelta: 2,
      suggestions: ['再陪我五分钟', '晚安，明天见', '给我讲个睡前故事'],
    }
  }
  if (/作业|课程|学习|考试|学校/.test(content)) {
    return {
      reply: '我看过你认真做笔记的样子，所以一点也不担心。我们先从最难的一小步开始？',
      emotion: '自信得意', scene: '图书馆', affinityDelta: 2,
      suggestions: ['那就一起复习吧', '帮我整理一下思路', '完成后给我奖励吗'],
    }
  }
  if (/真的|什么|怎么会|惊讶/.test(content)) {
    return {
      reply: '欸？原来你会这样想……等一下，让我也看看你发现的东西。',
      emotion: '惊讶', scene: null, affinityDelta: 1,
      suggestions: ['你看这里就明白了', '是不是很有意思', '我也没想到会这样'],
    }
  }

  const variants: GalgameTurn[] = [
    {
      reply: '嗯……我明白你的意思。你不用把每句话都整理得很完整，我愿意听那些犹豫的部分。',
      emotion: '温柔微笑', scene: null, affinityDelta: 2,
      suggestions: ['继续这个话题', '其实还有一件事', '我想听听你的看法'],
    },
    {
      reply: '这样的话，我心里也有了一点小小的期待。接下来，你想把故事写向哪里？',
      emotion: '自信得意', scene: null, affinityDelta: 2,
      suggestions: ['去一个没去过的地方', '聊聊我们的下一次约定', '由你决定吧'],
    },
    {
      reply: '欸，这个主意听起来很棒！现在就出发的话，一定能赶上最好的光线。',
      emotion: '兴奋欢呼', scene: '樱花步道', affinityDelta: 3,
      suggestions: ['那就一起出发', '先准备一点东西', '你怎么比我还兴奋'],
    },
  ]
  const index = Array.from(content).reduce((sum, char) => sum + (char.codePointAt(0) ?? 0), 0) % variants.length
  return variants[index]
}
