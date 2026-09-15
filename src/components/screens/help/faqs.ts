import { AN } from '@/lib';

export interface Faq {
  question: string;
  answer: string;
  /** who the question is for; the public landing page shows the guest ones */
  audience: 'guest' | 'cast';
}

/** The FAQ, shared by the FAQ page and the public landing page. */
export const FAQS: Faq[] = [
  {
    question: 'ポイントとは何ですか？',
    answer: `${AN.Short}内でのご利用に使う通貨です。1,000ポイント＝1,100円（税込）でご購入いただけます。`,
    audience: 'guest',
  },
  {
    question: 'グループTOLAと個TOLAの違いは何ですか？',
    answer:
      'グループTOLAは複数のキャストを募集してマッチングする方式、個TOLAはチャットでお話したキャストを直接ご指名いただく方式です。',
    audience: 'guest',
  },
  {
    question: '深夜手当はかかりますか？',
    answer: 'グループTOLAでは00:00〜06:00にかかる場合に深夜手当が加算されます。個TOLAに深夜手当はありません。',
    audience: 'guest',
  },
  {
    question: 'キャストを自分で選べますか？',
    answer: 'キャストが集まるとキャスト選択画面からお選びいただけます。ご指名には指名料が加算されます。',
    audience: 'guest',
  },
  {
    question: '延長はできますか？',
    answer: '終了予定時刻を過ぎると自動で延長となり、延長分は1.3倍のポイント消費になります。',
    audience: 'guest',
  },
  {
    question: 'キャンセルはできますか？',
    answer: 'リクエスト確定後のキャンセルはお受けできません。募集中のオーダーは取り消しが可能です。',
    audience: 'guest',
  },
  {
    question: '出金はいつ行われますか？',
    answer: '15日までの申請は当月25日、16日以降の申請は翌月25日の振込予定です。すぐ出金は3営業日以内です。',
    audience: 'cast',
  },
  {
    question: '当月に獲得したポイントを出金できますか？',
    answer: '当月獲得分は翌月以降に出金できます。すぐ出金は全残高が対象です。',
    audience: 'cast',
  },
];
