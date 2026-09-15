'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import { AN } from '@/lib';
import { useApiQuery } from '@/client/hooks';
import { PageHeader } from '@/components/ui';

interface CompanyInfo {
  appName: string;
  appShortName: string;
  company: string;
  address: string;
  building: string | null;
  zipCode: string | null;
  phone: string;
  personInCharge: string;
  contactMail: string;
  domain: string;
}

/** HelpController#index — the help hub. */
export function HelpPage(): ReactNode {
  return (
    <div>
      <PageHeader title="ヘルプ・お問い合わせ" back="/user/settings" />

      <div className="mx-4 mt-4 card">
        <p className="text-sm font-semibold">お問い合わせ</p>
        <p className="mt-1 text-[11px] leading-relaxed text-ink-500">
          ご不明な点は「{AN.Short} 運営局　お問合せ用」のチャットルームからお気軽にご連絡ください。
        </p>
        <Link href="/conversations" className="btn-primary mt-3 w-full no-underline">
          運営局に問い合わせる
        </Link>
      </div>

      <ul className="mt-4 divide-y divide-ink-200 border-y border-ink-200">
        {[
          { to: '/faq', label: 'よくある質問' },
          { to: '/usage_terms', label: '利用規約' },
          { to: '/privacy_policy', label: 'プライバシーポリシー' },
          { to: '/trade_terms', label: '特定商取引法に基づく表記' },
        ].map((link) => (
          <li key={link.to}>
            <Link href={link.to} className="flex items-center px-4 py-3.5 text-sm no-underline hover:bg-ink-50">
              <span className="flex-1">{link.label}</span>
              <span className="text-ink-500">›</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * The four static pages. The Rails versions were long ERB templates of legal
 * copy; the structure and the company details are reproduced, and the clauses
 * themselves should be pasted in from the originals before going live.
 */
function StaticPage({ title, children }: { title: string; children: ReactNode }): ReactNode {
  const { data } = useApiQuery<CompanyInfo>(['help', 'company'], '/help/company');

  return (
    <div>
      <PageHeader title={title} back="/help" />
      <article className="space-y-4 px-4 py-5 text-[12px] leading-relaxed text-ink-700">{children}</article>

      {data ? (
        <footer className="border-t border-ink-200 px-4 py-5 text-[11px] leading-relaxed text-ink-500">
          <p className="font-semibold text-ink-700">{data.company}</p>
          {data.zipCode ? <p>〒{data.zipCode}</p> : null}
          <p>
            {data.address} {data.building ?? ''}
          </p>
          <p>{data.personInCharge}</p>
          <p>
            お問い合わせ：<a href={`mailto:${data.contactMail}`}>{data.contactMail}</a>
          </p>
        </footer>
      ) : null}
    </div>
  );
}

export function FaqPage(): ReactNode {
  const faqs: Array<[string, string]> = [
    ['ポイントとは何ですか？', `${AN.Short}内でのご利用に使う通貨です。1,000ポイント＝1,100円（税込）でご購入いただけます。`],
    [
      'グループTOLAと個TOLAの違いは何ですか？',
      'グループTOLAは複数のキャストを募集してマッチングする方式、個TOLAはチャットでお話したキャストを直接ご指名いただく方式です。',
    ],
    [
      '深夜手当はかかりますか？',
      'グループTOLAでは00:00〜06:00にかかる場合に深夜手当が加算されます。個TOLAに深夜手当はありません。',
    ],
    ['キャストを自分で選べますか？', 'キャストが集まるとキャスト選択画面からお選びいただけます。ご指名には指名料が加算されます。'],
    ['延長はできますか？', '終了予定時刻を過ぎると自動で延長となり、延長分は1.3倍のポイント消費になります。'],
    ['キャンセルはできますか？', 'リクエスト確定後のキャンセルはお受けできません。募集中のオーダーは取り消しが可能です。'],
    ['出金はいつ行われますか？', '15日までの申請は当月25日、16日以降の申請は翌月25日の振込予定です。すぐ出金は3営業日以内です。'],
    ['当月に獲得したポイントを出金できますか？', '当月獲得分は翌月以降に出金できます。すぐ出金は全残高が対象です。'],
  ];

  return (
    <StaticPage title="よくある質問">
      {faqs.map(([question, answer]) => (
        <section key={question}>
          <h2 className="text-sm font-semibold text-ink-900">Q. {question}</h2>
          <p className="mt-1">A. {answer}</p>
        </section>
      ))}
    </StaticPage>
  );
}

export function UsageTermsPage(): ReactNode {
  return (
    <StaticPage title="利用規約">
      <p className="rounded-lg border border-gold-300 bg-gold-50 p-3 text-[11px] text-gold-800">
        この画面には、移行前のRailsアプリの利用規約本文をそのまま掲載してください。
        下記は条文の構成のみを引き継いだ見出しです。
      </p>
      {[
        ['第1条（適用）', '本規約は、本サービスの利用に関する条件を定めるものです。'],
        ['第2条（定義）', '本規約で使用する用語の定義を定めます。'],
        ['第3条（登録）', '登録の申請、承認および登録事項の変更について定めます。'],
        ['第4条（年齢制限）', '18歳未満の方はご利用いただけません。'],
        ['第5条（禁止事項）', '個人情報の交換、他サービスへの誘導、金銭の直接授受等を禁止します。'],
        ['第6条（ポイント）', 'ポイントの購入、利用および有効期限について定めます。'],
        ['第7条（キャストの報酬）', '報酬の計算方法および出金について定めます。'],
        ['第8条（禁止行為への措置）', '違反時のアカウント停止等について定めます。'],
        ['第9条（免責）', '当社の責任範囲について定めます。'],
        ['第10条（キャンセル）', 'リクエスト確定後のキャンセル費の負担について定めます。'],
        ['第11条（規約の変更）', '本規約の変更手続について定めます。'],
      ].map(([heading, body]) => (
        <section key={heading}>
          <h2 className="text-sm font-semibold text-ink-900">{heading}</h2>
          <p className="mt-1">{body}</p>
        </section>
      ))}
    </StaticPage>
  );
}

export function PrivacyPolicyPage(): ReactNode {
  return (
    <StaticPage title="プライバシーポリシー">
      <p className="rounded-lg border border-gold-300 bg-gold-50 p-3 text-[11px] text-gold-800">
        この画面には、移行前のRailsアプリのプライバシーポリシー本文をそのまま掲載してください。
      </p>
      {[
        ['1. 取得する情報', '氏名、生年月日、電話番号、メールアドレス、身分証明書の画像、決済に関する情報等。'],
        ['2. 利用目的', '本人確認、サービスの提供、マッチング、決済、お問い合わせ対応、サービス改善のため。'],
        ['3. 第三者提供', '法令に基づく場合および決済代行会社等の委託先を除き、第三者に提供しません。'],
        ['4. 外部送信', 'LINE（通知）、Twilio（SMS認証）、決済代行会社、Firebase（プッシュ通知）。'],
        ['5. 保管と削除', '利用目的の達成に必要な期間保管し、その後適切に削除します。'],
        ['6. 開示請求', 'ご本人からの開示、訂正、削除のご請求に対応します。'],
      ].map(([heading, body]) => (
        <section key={heading}>
          <h2 className="text-sm font-semibold text-ink-900">{heading}</h2>
          <p className="mt-1">{body}</p>
        </section>
      ))}
    </StaticPage>
  );
}

export function TradeTermsPage(): ReactNode {
  return (
    <StaticPage title="特定商取引法に基づく表記">
      {[
        ['販売事業者', '下記のとおりです。'],
        ['販売価格', '各ポイント購入画面に表示される金額（税込）。'],
        ['代金の支払時期・方法', 'クレジットカード決済。ご購入時に決済されます。'],
        ['サービスの提供時期', '決済完了後、ただちにポイントが付与されます。'],
        ['返品・キャンセル', 'サービスの性質上、購入後のポイントの返金はお受けできません。'],
        ['動作環境', '最新のブラウザ（Safari／Chrome）でのご利用を推奨します。'],
      ].map(([heading, body]) => (
        <section key={heading}>
          <h2 className="text-sm font-semibold text-ink-900">{heading}</h2>
          <p className="mt-1">{body}</p>
        </section>
      ))}
    </StaticPage>
  );
}
