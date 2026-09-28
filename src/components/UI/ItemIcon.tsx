/** DOM icon for any item: block texture canvas for blocks, glyph for tools. */
import { Block } from '../../utils/blocks'
import { blockIconSrc } from '../../utils/textures'
import { isBlockItem, itemGlyph, type ItemId } from '../../utils/recipes'

export default function ItemIcon({ item, size = 32 }: { item: ItemId; size?: number }) {
  if (isBlockItem(item)) {
    return (
      <img
        src={blockIconSrc(item as Block)}
        width={size}
        height={size}
        alt=""
        draggable={false}
        style={{ imageRendering: 'pixelated' }}
        className="select-none"
      />
    )
  }
  return (
    <span
      className="flex items-center justify-center font-bold text-amber-200"
      style={{ width: size, height: size, fontSize: size * 0.6 }}
    >
      {itemGlyph(item)}
    </span>
  )
}
