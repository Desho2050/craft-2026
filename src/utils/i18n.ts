/**
 * Minimal i18n: Arabic (default, RTL) + English (LTR).
 * UI components call useT() and pass keys; item names resolve via itemToken.
 */
import { useGameStore } from '../store/useGameStore'

export type Lang = 'ar' | 'en'

const STRINGS: Record<string, { ar: string; en: string }> = {
  'game.title': { ar: 'ميدو كرافت ٢٠٢٦', en: 'MedoCraft 2026' },
  'game.subtitle': { ar: 'عالم مكعبات مفتوح — انجُ وابدع', en: 'Open voxel world — survive & create' },
  'menu.play': { ar: 'ابدأ اللعب', en: 'Play' },
  'menu.survival': { ar: 'وضع النجاة', en: 'Survival' },
  'menu.creative': { ar: 'وضع الإبداع', en: 'Creative' },
  'menu.seed': { ar: 'بذرة العالم', en: 'World seed' },
  'menu.seedHint': { ar: 'اتركه فارغًا لبذرة عشوائية', en: 'Leave blank for a random seed' },
  'menu.language': { ar: 'English', en: 'العربية' },
  'menu.continue': { ar: 'متابعة اللعبة المحفوظة', en: 'Continue saved game' },
  'menu.help': { ar: 'تحكم: WASD للحركة، مسافة للقفز، Shift للركض، F للطيران، نقرة يسرى للكسر، يمنرى للبناء، 1-9 للشريط، E للحقيبة، Esc للقائمة',
    en: 'Controls: WASD move, Space jump, Shift sprint, F fly toggle, LMB break, RMB place, 1-9 hotbar, E inventory, Esc menu' },
  'hud.health': { ar: 'الصحة', en: 'Health' },
  'hud.hunger': { ar: 'الجوع', en: 'Hunger' },
  'menu.mp': { ar: 'لعب أونلاين (٢+ لاعبين)', en: 'Online multiplayer (2+ players)' },
  'menu.mpName': { ar: 'اسمك', en: 'Your name' },
  'menu.mpUrl': { ar: 'عنوان السيرفر', en: 'Server URL' },
  'menu.mpHint': { ar: 'شغّل السيرفر (npm run dev:mp) وشاركوا نفس البذرة لنفس العالم',
    en: 'Run the server (npm run dev:mp) and share the same seed to enter the same world' },
  'hud.online': { ar: 'متصل', en: 'online' },
  'inv.title': { ar: 'الحقيبة والصناعة', en: 'Inventory & Crafting' },
  'inv.crafting': { ar: 'الصناعة', en: 'Crafting' },
  'inv.creativeBlocks': { ar: 'بلوكات وضع الإبداع', en: 'Creative blocks' },
  'inv.close': { ar: 'إغلاق', en: 'Close' },
  'craft.result': { ar: 'الناتج', en: 'Result' },
  'item.grass': { ar: 'كتلة عشب', en: 'Grass Block' },
  'item.dirt': { ar: 'تراب', en: 'Dirt' },
  'item.stone': { ar: 'حجر', en: 'Stone' },
  'item.cobblestone': { ar: 'حجر مكسر', en: 'Cobblestone' },
  'item.sand': { ar: 'رمل', en: 'Sand' },
  'item.sandstone': { ar: 'حجر رملي', en: 'Sandstone' },
  'item.log': { ar: 'جذع شجرة', en: 'Wood Log' },
  'item.planks': { ar: 'ألواح خشبية', en: 'Planks' },
  'item.leaves': { ar: 'أوراق شجر', en: 'Leaves' },
  'item.cactus': { ar: 'صبّار', en: 'Cactus' },
  'item.snow': { ar: 'عشب مغطى بالثلج', en: 'Snowy Grass' },
  'item.glass': { ar: 'زجاج', en: 'Glass' },
  'item.water': { ar: 'ماء', en: 'Water' },
  'item.bedrock': { ar: 'صخر الأساس', en: 'Bedrock' },
  'item.stick': { ar: 'عصا', en: 'Stick' },
  'item.pickaxe': { ar: 'فأس حفر خشبي', en: 'Wooden Pickaxe' },
  'item.axe': { ar: 'فأس خشبي', en: 'Wooden Axe' },
  'item.shovel': { ar: 'مجرفة خشبية', en: 'Wooden Shovel' },
  'item.sword': { ar: 'سيف خشبي', en: 'Wooden Sword' },
  'item.unknown': { ar: 'غير معروف', en: 'Unknown' },
  'mob.zombie': { ar: 'زومبي', en: 'Zombie' },
  'toast.needsTool': { ar: 'تحتاج أداة مناسبة لكسر هذا البلوك!', en: 'You need the right tool to break this!' },
  'toast.noSpace': { ar: 'الحقيبة ممتلئة', en: 'Inventory full' },
  'pause.title': { ar: 'إيقاف مؤقت', en: 'Paused' },
  'pause.resume': { ar: 'استئناف', en: 'Resume' },
  'pause.save': { ar: 'حفظ وخروج للقائمة', en: 'Save & quit to menu' },
  'death.title': { ar: 'لقد مُت!', en: 'You died!' },
  'death.respawn': { ar: 'إحياء', en: 'Respawn' },
}

export function translate(lang: Lang, key: string): string {
  const e = STRINGS[key]
  return e ? e[lang] : key
}

/** Hook version — re-renders when language changes */
export function useT(): (key: string) => string {
  const lang = useGameStore((s) => s.lang)
  return (key) => translate(lang, key)
}

export const dirFor = (lang: Lang): 'rtl' | 'ltr' => (lang === 'ar' ? 'rtl' : 'ltr')
