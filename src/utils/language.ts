export type ScriptLanguage = 'han' | 'ja' | 'ko' | 'latin'

const KANA = /[\u3040-\u30ff\u31f0-\u31ff]/
const HANGUL = /[\uac00-\ud7af\u1100-\u11ff\u3130-\u318f]/
const HAN = /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/
const LATIN = /[A-Za-z\u00c0-\u024f]/

/**
 * A lightweight script classifier for font fallback and annotation controls.
 * Lines with kana are treated as Japanese, hangul as Korean, remaining Han as
 * Chinese, and everything else as Latin.
 */
export function detectScript(text: string): ScriptLanguage {
  if (KANA.test(text)) return 'ja'
  if (HANGUL.test(text)) return 'ko'
  if (HAN.test(text)) return 'han'
  if (LATIN.test(text)) return 'latin'
  return 'latin'
}
