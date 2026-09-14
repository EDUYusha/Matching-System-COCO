/**
 * Ported from `module AN` in server/config/initializers/constants.rb.
 * Kept under the same short names the Rails views used (AN::Full, AN::Short, …).
 */
export const AN = {
  Full: 'エンタメマッチングサイトTOLA (トラ)',
  Short: 'TOLA',
  Both: 'エンタメマッチングサイトTOLA',
  Kana: 'トラ',
  ShortAndKana: 'TOLA',
  Company: '株式会社グリーン',
  Domain: 'co-co.today',
  ContactMail: 'co-co-staff@co-co.today',
  ContactTel: '0123456',
  Address: '〒106-0032　東京都港区六本木４－８－７',
  PersonInCharge: '代表取締役　山口剣二',
  SendMailTo: 'co-co-staff@co-co.today',
} as const;
