'use client';

import Link from 'next/link';
import { Zen_Maru_Gothic } from 'next/font/google';
import clsx from 'clsx';
import { useEffect, useState, type ComponentType, type ReactNode } from 'react';
import { AN, config } from '@/lib';
import { numberToCredits } from '@/client/format';
import { api } from '@/client/api';
import {
  ArrowRightIcon,
  BlockIcon,
  ChatIcon,
  ChevronDownIcon,
  CloseIcon,
  EyeIcon,
  HeadsetIcon,
  ImageIcon,
  MailIcon,
  MapPinIcon,
  MenuIcon,
  ShieldCheckIcon,
} from '@/components/icons';
import { FAQS } from '@/components/screens/help/faqs';
import { LANDING_IMAGES, LANDING_REVIEWS, type ImageSlot } from '@/components/screens/landing/landing-content';

/**
 * The public landing page at the root url, for signed-out visitors.
 *
 * A phone-width column, as the app is. On a phone a sign-up bar rises from the
 * bottom once the hero has scrolled away; on a wide screen the column sits
 * between a brand panel and a sticky menu that carries the same buttons.
 *
 * Prices and areas come from the tables the order form reads (see app/page.tsx)
 * and the questions from help/faqs.ts, so the page never quotes a number the app
 * does not charge. Photos and reviews are the only hand-edited parts; they live
 * in landing-content.ts.
 */

export interface LandingRank {
  id: number;
  name: string;
  baseCostPerTime: number;
  prolongCostPerTime: number;
  /** priced per order rather than per interval */
  fixedPrice: boolean;
}

export interface LandingArea {
  id: number;
  name: string;
  subAreas: string[];
  /** a guest may type in a meeting place outside the list */
  acceptsOtherPlaces: boolean;
  ranks: LandingRank[];
}

export interface LandingData {
  areas: LandingArea[];
  /** the range of the rates cast have set for 個TOLA */
  individualFee: { min: number; max: number } | null;
}

interface NavSection {
  id: string;
  label: string;
}

type Icon = ComponentType<{ className?: string; strokeWidth?: number }>;

export function LandingPage({ data }: { data: LandingData }): ReactNode {
  const [menuOpen, setMenuOpen] = useState(false);

  const sections: NavSection[] = [
    { id: 'about', label: `${AN.Short}とは` },
    { id: 'reasons', label: '選ばれる理由' },
    { id: 'pricing', label: '使い方・料金' },
    { id: 'steps', label: 'はじめ方' },
    { id: 'safety', label: '安心・安全' },
    ...(LANDING_REVIEWS.length ? [{ id: 'reviews', label: 'ご利用者の声' }] : []),
    ...(data.areas.length ? [{ id: 'areas', label: '対応エリア' }] : []),
    { id: 'faq', label: 'よくある質問' },
  ];

  return (
    // diagonal tiles (two crossing sets of joints, each a light line with a faint shadow) over a grey circle,
    // fixed to the window so the pattern does not stretch over the long page
    <div className="min-h-dvh bg-white bg-[repeating-linear-gradient(45deg,rgba(255,255,255,.3)_0_1px,rgba(0,0,0,.06)_1px_2px,transparent_2px_24px),repeating-linear-gradient(135deg,rgba(255,255,255,.3)_0_1px,rgba(0,0,0,.06)_1px_2px,transparent_2px_24px),radial-gradient(circle_at_50%_45%,#e4e6e9_0%,#cdd0d5_40%,#a8acb3_100%)] bg-fixed text-ink-900 lg:grid lg:grid-cols-[minmax(0,1fr)_30rem_minmax(24rem,1fr)]">
      <BrandPanel />

      {/* placed explicitly: below xl the brand panel is hidden and would otherwise shift the columns */}
      <div className="relative min-w-0 bg-cream-50 text-ink-900 lg:col-start-2 lg:shadow-[0_0_60px_rgba(17,17,19,.18)]">
        <TopBar onMenu={() => setMenuOpen(true)} />
        <Hero />
        <About />
        <Scenes data={data} />
        <Reasons />
        <Pricing data={data} />
        <Steps />
        <Safety />
        {LANDING_REVIEWS.length ? <Reviews /> : null}
        {data.areas.length ? <Areas data={data} /> : null}
        <Faq />
        <FinalCta />
        <Footer />
        <BottomBar />
        {menuOpen ? <MenuDrawer sections={sections} onClose={() => setMenuOpen(false)} /> : null}
      </div>

      <NavPanel sections={sections} />
    </div>
  );
}

/* ---------------------------------------------------------------------------
 * Frame: the wide-screen side panels, the top bar, the menu and the sign-up bar
 * ------------------------------------------------------------------------- */

/** A line is made of parts so the words worth stressing can be set a size larger. */
interface MessagePart {
  text: string;
  em?: boolean;
}

/** What the left column says, one line at a time. Every line is something the app actually does. */
const BRAND_MESSAGES: MessagePart[][] = [
  [{ text: '審査を通過した' }, { text: 'キャストだけ', em: true }, { text: 'が登録' }],
  [{ text: '最短' }, { text: '30分後', em: true }, { text: 'から、あなたの席に' }],
  [{ text: 'エリア・人数・時間を' }, { text: '選ぶだけ', em: true }],
  [{ text: 'グループでも、' }, { text: '1対1', em: true }, { text: 'でも' }],
  [{ text: '接待にも、' }, { text: 'いつもの飲み会', em: true }, { text: 'にも' }],
  [{ text: '領収書の発行', em: true }, { text: 'にも対応' }],
  [{ text: '困ったときは、' }, { text: '運営局', em: true }, { text: 'へ' }],
];

/** How long a line rests, and how slowly it fades out or back in. */
const HOLD_MS = 6000;
const FADE_MS = 1200;

// a gently rounded gothic for the left column; next/font self-hosts it and serves only the ranges used
// `subsets` only picks what is preloaded — the Japanese ranges still come with the font and load on demand
const roundedGothic = Zen_Maru_Gothic({ subsets: ['latin'], weight: ['500', '700'], display: 'swap' });

const plainText = (parts: MessagePart[]): string => parts.map((part) => part.text).join('');

/**
 * The left column, from xl up where the menu column leaves room: one line at a time, plain white gothic on
 * the grey ground. A line rests, fades out, and the next one rises in.
 */
function BrandPanel(): ReactNode {
  const [index, setIndex] = useState(0);
  const [shown, setShown] = useState(true);

  useEffect(() => {
    const timer = window.setTimeout(() => setShown(false), HOLD_MS);
    return () => window.clearTimeout(timer);
  }, [index]);

  useEffect(() => {
    if (shown) return;
    const timer = window.setTimeout(() => {
      setIndex((current) => (current + 1) % BRAND_MESSAGES.length);
      setShown(true);
    }, FADE_MS);
    return () => window.clearTimeout(timer);
  }, [shown]);

  return (
    <aside className="sticky top-0 hidden h-dvh items-center justify-center self-start px-8 xl:flex">
      {/* the whole list for screen readers; the changing line beside it is decorative */}
      <ul className="sr-only">
        {BRAND_MESSAGES.map((parts) => (
          <li key={plainText(parts)}>{plainText(parts)}</li>
        ))}
      </ul>
      <p
        aria-hidden
        className={clsx(
          roundedGothic.className,
          'w-full text-center text-2xl leading-relaxed tracking-[0.14em] text-white transition-opacity ease-in-out motion-reduce:transition-none',
          shown ? 'opacity-100' : 'opacity-0',
        )}
        style={{ transitionDuration: `${FADE_MS}ms` }}
      >
        {BRAND_MESSAGES[index].map((part, position) => (
          <span key={`${position}-${part.text}`} className={part.em ? 'text-[1.25em]' : undefined}>
            {part.text}
          </span>
        ))}
      </p>
    </aside>
  );
}

/** Pinned to the window's top-right corner, as a tab hanging from the edge. */
function NavPanel({ sections }: { sections: NavSection[] }): ReactNode {
  return (
    <aside className="sticky top-0 hidden max-h-dvh self-start overflow-y-auto lg:col-start-3 lg:block">
      <div className="ml-auto w-full max-w-[24rem] rounded-bl-2xl border-b border-l border-white/10 bg-night-950/55 px-6 pb-6 pt-4 shadow-[0_12px_40px_-20px_rgba(17,17,19,.5)] backdrop-blur">
        <SectionNav sections={sections} />
        <div className="mt-6">
          <CtaButtons size="sm" />
        </div>
        <div className="mt-5 space-y-2 text-center text-xs">
          <Link href="/cast/new" className="block font-medium text-white no-underline hover:underline">
            キャストとして登録する
          </Link>
          <Link href="/login" className="block text-white/80 no-underline hover:underline">
            ログインはこちら
          </Link>
        </div>
      </div>
    </aside>
  );
}

function TopBar({ onMenu }: { onMenu: () => void }): ReactNode {
  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-3 bg-night-950/80 px-4 text-white backdrop-blur">
      <Link href="/" className="font-serif text-2xl tracking-[0.08em] text-gold-300 no-underline">
        {AN.Short}
      </Link>
      <Link
        href="/login"
        className="ml-auto rounded-full border border-gold-300/50 px-3.5 py-1.5 text-xs font-bold text-gold-200 no-underline hover:bg-white/5"
      >
        ログイン
      </Link>
      <button
        type="button"
        onClick={onMenu}
        className="-mr-1.5 flex h-10 w-10 items-center justify-center rounded-full text-white hover:bg-white/10 lg:hidden"
        aria-label="メニューを開く"
        aria-haspopup="dialog"
      >
        <MenuIcon className="h-6 w-6" />
      </button>
    </header>
  );
}

/** The numbered section links, on the dark phone menu and the dark desktop panel. */
function SectionNav({ sections, onNavigate }: { sections: NavSection[]; onNavigate?: () => void }): ReactNode {
  return (
    <nav aria-label="ページ内メニュー">
      <ol className="divide-y divide-white/10">
        {sections.map((section, index) => (
          <li key={section.id}>
            <a
              href={`#${section.id}`}
              onClick={onNavigate}
              className="flex items-center gap-4 py-3 text-base text-white no-underline transition hover:text-gold-200"
            >
              <span className="w-8 font-serif text-xl text-gold-400">{String(index + 1).padStart(2, '0')}</span>
              {section.label}
            </a>
          </li>
        ))}
      </ol>
    </nav>
  );
}

function MenuDrawer({ sections, onClose }: { sections: NavSection[]; onClose: () => void }): ReactNode {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="メニュー"
      className="fixed inset-0 z-50 mx-auto flex max-w-app flex-col overflow-y-auto bg-night-950/95 px-6 pb-8 text-white backdrop-blur lg:hidden"
    >
      <div className="flex h-14 shrink-0 items-center justify-between">
        <span className="font-serif text-2xl tracking-[0.08em] text-gold-300">{AN.Short}</span>
        <button
          type="button"
          onClick={onClose}
          className="-mr-1.5 flex h-10 w-10 items-center justify-center rounded-full hover:bg-white/10"
          aria-label="メニューを閉じる"
        >
          <CloseIcon className="h-6 w-6" />
        </button>
      </div>
      <div className="mt-4">
        <SectionNav sections={sections} onNavigate={onClose} />
      </div>
      <div className="mt-8">
        <CtaButtons />
      </div>
      <div className="mt-6 flex justify-center gap-6 text-[13px]">
        <Link href="/login" className="text-white/80 no-underline hover:underline">
          ログイン
        </Link>
        <Link href="/cast/new" className="text-gold-200 no-underline hover:underline">
          キャスト登録
        </Link>
      </div>
    </div>
  );
}

/** The phone sign-up bar. It waits until the hero, which has its own buttons, is out of view. */
function BottomBar(): ReactNode {
  const [visible, setVisible] = useState(false);
  const line = useLineStart();

  useEffect(() => {
    const update = () => setVisible(window.scrollY > 520);
    update();
    window.addEventListener('scroll', update, { passive: true });
    return () => window.removeEventListener('scroll', update);
  }, []);

  return (
    <div
      className={clsx(
        'fixed inset-x-0 bottom-0 z-40 mx-auto max-w-app border-t border-white/10 bg-night-950/90 px-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-3 backdrop-blur transition duration-300 lg:hidden',
        visible ? 'translate-y-0' : 'pointer-events-none translate-y-full',
      )}
      aria-hidden={!visible}
    >
      {line.error ? (
        <p role="alert" className="pb-2 text-center text-[11px] text-red-300">
          {line.error}
        </p>
      ) : null}
      <div className="grid grid-cols-2 gap-2">
        <button type="button" onClick={line.start} className={clsx(CTA_BASE, CTA_LINE, 'h-11 text-sm')} tabIndex={visible ? 0 : -1}>
          <ChatIcon className="h-5 w-5" strokeWidth={2} />
          LINEで始める
        </button>
        <Link href="/register" className={clsx(CTA_BASE, CTA_GOLD, 'h-11 text-sm')} tabIndex={visible ? 0 : -1}>
          <MailIcon className="h-5 w-5" strokeWidth={2} />
          メールで登録
        </Link>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------------
 * Shared pieces
 * ------------------------------------------------------------------------- */

const CTA_BASE =
  'flex w-full items-center justify-center gap-2 rounded-xl font-medium no-underline shadow-lg shadow-black/20 transition hover:brightness-110';
// LINE's own green, as the login screen's LINE button uses
const CTA_LINE = 'bg-[#06c755] text-white';
// white on gold needs the faint shadow to stay legible over the light middle of the gradient
const CTA_GOLD = 'bg-gradient-to-r from-gold-600 via-gold-400 to-gold-600 text-white [text-shadow:0_1px_2px_rgba(0,0,0,.35)]';

/** SessionsController#sns_login_redirection: a new LINE user continues to sign-up. */
function useLineStart(): { start: () => void; error: string | null } {
  const [error, setError] = useState<string | null>(null);
  function start(): void {
    setError(null);
    api
      .get<{ url: string }>('/sns_login_redirection')
      .then(({ url }) => {
        window.location.href = url;
      })
      .catch((caught: unknown) => {
        setError(caught instanceof Error && caught.message ? caught.message : 'LINEでの登録を開始できませんでした');
      });
  }
  return { start, error };
}

function CtaButtons({ size = 'md' }: { size?: 'md' | 'sm' }): ReactNode {
  const line = useLineStart();
  const height = size === 'sm' ? 'h-11 text-sm' : 'h-12 text-[15px]';
  return (
    <div>
      <div className="grid gap-2.5">
        <button type="button" onClick={line.start} className={clsx(CTA_BASE, CTA_LINE, height)}>
          <ChatIcon className="h-5 w-5" strokeWidth={2} />
          LINEで始める
        </button>
        <Link href="/register" className={clsx(CTA_BASE, CTA_GOLD, height)}>
          <MailIcon className="h-5 w-5" strokeWidth={2} />
          メールアドレスで登録
        </Link>
      </div>
      {line.error ? (
        <p role="alert" className="mt-2 text-xs text-red-300">
          {line.error}
        </p>
      ) : null}
    </div>
  );
}

/** A photo slot: the image once `src` is set, a labelled placeholder until then. */
function Photo({ slot, label = 'center' }: { slot: ImageSlot; label?: 'center' | 'top' | 'left' | 'right' }): ReactNode {
  if (slot.src) {
    // eslint-disable-next-line @next/next/no-img-element
    return (
      <img
        src={slot.src}
        alt={slot.alt}
        loading="lazy"
        className="h-full w-full object-cover"
        style={slot.position ? { objectPosition: slot.position } : undefined}
      />
    );;
  }
  return (
    <div
      role="img"
      aria-label={slot.alt}
      className={clsx(
        'relative flex h-full w-full overflow-hidden bg-[radial-gradient(circle_at_30%_20%,#3b3b41,#18181b_70%)]',
        {
          center: 'items-center justify-center',
          top: 'items-start justify-center pt-24',
          left: 'items-center justify-start pl-8',
          right: 'items-center justify-end pr-8',
        }[label],
      )}
    >
      <div className="absolute inset-3 rounded-xl border border-dashed border-gold-300/30" aria-hidden />
      <div className="relative flex flex-col items-center gap-1 text-center text-gold-200/80" aria-hidden>
        <ImageIcon className="h-6 w-6" />
        <span className="text-[11px] font-bold tracking-wide">写真を差し替えてください</span>
        <span className="text-[10px] text-white/50">{slot.hint}</span>
      </div>
    </div>
  );
}

function Section({
  id,
  tone,
  className,
  children,
}: {
  id?: string;
  tone: 'cream' | 'white' | 'dark';
  /** extra classes, e.g. a gradient laid over the tone's flat colour */
  className?: string;
  children: ReactNode;
}): ReactNode {
  return (
    <section
      id={id}
      className={clsx(
        'relative scroll-mt-14 overflow-hidden px-5 py-16',
        { cream: 'bg-cream-50 text-ink-900', white: 'bg-white text-ink-900', dark: 'bg-night-900 text-white' }[tone],
        className,
      )}
    >
      {children}
    </section>
  );
}

/** A section title over a faint Latin word, with a short gold rule. */
function SectionHeading({
  en,
  eyebrow,
  tone = 'light',
  children,
}: {
  en: string;
  eyebrow?: string;
  tone?: 'light' | 'dark';
  children: ReactNode;
}): ReactNode {
  const dark = tone === 'dark';
  return (
    <div className="relative text-center">
      <p
        aria-hidden
        className={clsx(
          'pointer-events-none absolute inset-x-0 top-1/2 -translate-y-1/2 select-none whitespace-nowrap font-serif text-[3.5rem] italic leading-none',
          dark ? 'text-white/[0.06]' : 'text-night-950/[0.05]',
        )}
      >
        {en}
      </p>
      {eyebrow ? (
        <p className={clsx('relative text-xs font-bold tracking-widest', dark ? 'text-gold-300' : 'text-gold-700')}>
          {eyebrow}
        </p>
      ) : null}
      <h2
        className={clsx(
          roundedGothic.className,
          'relative mt-1 text-[1.6rem] font-bold leading-snug tracking-wide',
          dark ? 'text-white' : 'text-night-950',
        )}
      >
        {children}
      </h2>
      <span aria-hidden className="relative mx-auto mt-4 block h-px w-10 bg-gold-500" />
    </div>
  );
}

/** 1,000P costs config.thousand_points_in_yen yen, tax included. */
function pointsInYen(points: number): string {
  return `¥${Math.round((points * config.thousand_points_in_yen) / 1000).toLocaleString('ja-JP')}`;
}

/* ---------------------------------------------------------------------------
 * Sections, top to bottom
 * ------------------------------------------------------------------------- */

function Hero(): ReactNode {
  return (
    <section className="relative -mt-14 flex min-h-[640px] flex-col justify-end overflow-hidden bg-night-900 text-white [height:min(100svh,780px)]">
      <div className="absolute inset-0">
        <Photo slot={LANDING_IMAGES.hero} label="top" />
      </div>
      <div
        className="absolute inset-0 bg-gradient-to-b from-night-950/60 via-transparent via-35% to-night-950"
        aria-hidden
      />
      <div className="relative px-6 pb-8">
        {/* the words carrying the promise are set a size larger than the particles around them */}
        <h1
          className={clsx(
            roundedGothic.className,
            'text-[1.9rem] font-bold leading-[1.45] tracking-[0.08em] text-white',
          )}
        >
          特別な
          <br />
          <span className="text-[1.2em]">パートナー</span>と、
          <br />
          <span className="text-[1.2em]">上質な時間</span>を
        </h1>
        <p className={clsx(roundedGothic.className, 'mt-4 text-sm leading-[1.9] tracking-[0.06em] text-white/80')}>
          エリア・人数・時間を選ぶだけで、
          <br />
          <span className="text-[1.15em]">最短30分後</span>から合流できます
        </p>
        <div className="mt-6">
          <CtaButtons />
        </div>
      </div>
    </section>
  );
}

/** How long a slide is held, and how long it takes to cross-fade into the next one. */
const SLIDE_HOLD_MS = 4000;
const SLIDE_FADE_MS = 700;

/**
 * The slideshow under 「TOLAとは」: one image at a time, advancing on its own and wrapping round for ever.
 * The slides are stacked and cross-faded rather than moved on a track, so the loop has no seam to hide.
 */
function AboutSlides(): ReactNode {
  const slides = LANDING_IMAGES.about;
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const timer = window.setInterval(() => setIndex((current) => (current + 1) % slides.length), SLIDE_HOLD_MS);
    return () => window.clearInterval(timer);
  }, [slides.length]);

  return (
    <div className="mt-10">
      <div
        role="group"
        aria-roledescription="スライド"
        aria-label={`${AN.Short}の様子`}
        className="relative aspect-[7/6] overflow-hidden bg-night-900 shadow-[0_10px_30px_-18px_rgba(17,17,19,.35)]"
      >
        {slides.map((slot, position) => (
          <div
            key={slot.hint}
            aria-hidden={position !== index}
            className={clsx(
              'absolute inset-0 transition-opacity ease-in-out motion-reduce:transition-none',
              position === index ? 'opacity-100' : 'opacity-0',
            )}
            style={{ transitionDuration: `${SLIDE_FADE_MS}ms` }}
          >
            <Photo slot={slot} />
          </div>
        ))}
      </div>

      <div className="mt-3 flex justify-center gap-2">
        {slides.map((slot, position) => (
          <button
            key={slot.hint}
            type="button"
            onClick={() => setIndex(position)}
            aria-label={`${position + 1}枚目を表示`}
            aria-current={position === index}
            className={clsx(
              'h-1.5 rounded-full transition-all',
              position === index ? 'w-6 bg-gold-600' : 'w-1.5 bg-ink-300 hover:bg-ink-400',
            )}
          />
        ))}
      </div>
    </div>
  );
}

function About(): ReactNode {
  return (
    <Section id="about" tone="cream">
      <SectionHeading en="About" eyebrow="エンタメマッチングサイト">
        {AN.Short}とは
      </SectionHeading>
      <p className="mt-6 text-center text-[13px] leading-relaxed text-night-950">
        ビジネス会食・ゴルフ・イベント同行など、
        <br />
        あらゆるシーンで厳選されたキャストと
        <br />
        マッチングできるプレミアムサービスです。
      </p>
      <AboutSlides />
    </Section>
  );
}

function Scenes({ data }: { data: LandingData }): ReactNode {
  // golf is only offered where an area has a golf price type
  const offersGolf = data.areas.some((area) => area.ranks.some((rank) => rank.name.includes('ゴルフ')));
  // the four scenes the existing TOLA site lists, in its order and words
  const scenes = [
    {
      slot: LANDING_IMAGES.scenes.lunch,
      title: 'カフェ・ビジネスランチ',
      body: '日中のランチや休憩時間に、会話を楽しめる同席者と過ごす上質な時間。',
    },
    ...(offersGolf
      ? [
          {
            slot: LANDING_IMAGES.scenes.golf,
            title: 'ゴルフ同行',
            body: 'ゴルフラウンドに明るく爽やかなキャストが同行。プレーをより楽しく演出します。',
          },
        ]
      : []),
    {
      slot: LANDING_IMAGES.scenes.event,
      title: 'イベント同行',
      body: 'パーティーや各種イベントへの同行。場を華やかに彩り、特別なシーンを演出します。',
    },
    {
      slot: LANDING_IMAGES.scenes.dinner,
      title: '会食・食事会',
      body: '男女が集う上質な食事会に。会話が弾み、忘れられないひとときをお届けします。',
    },
  ];

  return (
    <section className="overflow-hidden bg-white py-16">
      <div className="px-5">
        <SectionHeading en="Scene">
          こんな時に、{AN.Short}
        </SectionHeading>
      </div>
      <ul className="mt-10 space-y-1">
        {scenes.map((scene, index) => {
          const flip = index % 2 === 1;
          return (
            <li key={scene.title} className="relative h-32 overflow-hidden">
              <Photo slot={scene.slot} label={flip ? 'left' : 'right'} />
              <div
                aria-hidden
                className={clsx(
                  'absolute inset-0 from-night-950/85 via-night-950/40 to-transparent',
                  flip ? 'bg-gradient-to-l' : 'bg-gradient-to-r',
                )}
              />
              <div
                className={clsx(
                  // capped so the two-sentence descriptions stay over the dark half of the gradient
                  'absolute inset-y-0 flex max-w-[75%] flex-col justify-center px-6 text-white',
                  flip ? 'right-0 items-end text-right' : 'left-0',
                )}
              >
                <p className="font-serif text-xs tracking-widest text-gold-200">
                  SCENE {String(index + 1).padStart(2, '0')}
                </p>
                <p className="mt-0.5 text-xl font-bold">{scene.title}</p>
                <p className="mt-0.5 text-xs text-white/80">{scene.body}</p>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function Reasons(): ReactNode {
  // the four reasons the existing TOLA site gives (lp.co-co.today), in its order and words
  const reasons: Array<{ title: string; body: string }> = [
    {
      title: '厳選されたキャスト',
      body: '容姿・会話力・マナーの三拍子が揃った、厳格な審査を通過した魅力的なキャストのみが登録。どのシーンでも安心してお任せいただけます。',
    },
    {
      title: '多彩なシーンに対応',
      body: '会食・ゴルフ・ビジネスランチ・イベント同行など、お好きなシチュエーションでご利用いただけます。',
    },
    {
      title: '全国でご利用可能',
      body: `${AN.Short}では全国各地でご利用いただけるよう、サービスの普及活動を積極的に展開中。出張先でも安心してご利用いただけます。`,
    },
    {
      title: '安心の決済システム',
      body: '決済はSBIグループ・株式会社AXES Paymentを採用。明朗な料金体系で安心・安全にご利用いただけます。※当日の飲食代は別途ご負担ください。',
    },
  ];

  return (
    <Section
      id="reasons"
      tone="dark"
      // three flat diagonal bands with hard edges, dark grey at the top-left to light grey at the bottom-right
      className="bg-[linear-gradient(135deg,#46494f_0%,#46494f_34%,#5d6066_34%,#5d6066_67%,#777a81_67%,#777a81_100%)]"
    >
      <SectionHeading en="Reasons" eyebrow="WHY TOLA" tone="dark">
        {AN.Short}が選ばれる理由
      </SectionHeading>
      <ol className="mt-10 space-y-4">
        {reasons.map((reason, index) => (
          // a plain white card on the dark diagonal ground
          <li key={reason.title} className="bg-white p-4 shadow-[0_18px_40px_-24px_rgba(0,0,0,.7)]">
            <span className="block font-serif text-3xl leading-none text-gold-700">
              {String(index + 1).padStart(2, '0')}
            </span>
            <h3 className="mt-2 text-lg font-bold leading-snug text-night-950">{reason.title}</h3>
            <p className="mt-1.5 text-[13px] leading-relaxed text-ink-700">{reason.body}</p>
          </li>
        ))}
      </ol>
      <Link
        href="/cast/new"
        className="mt-10 flex h-12 items-center justify-center gap-2 rounded-full border border-gold-300/50 text-sm font-bold text-gold-200 no-underline transition hover:bg-white/5"
      >
        キャストとして登録したい方はこちら
        <ArrowRightIcon className="h-4 w-4" strokeWidth={2} />
      </Link>
    </Section>
  );
}

function Pricing({ data }: { data: LandingData }): ReactNode {
  const [areaId, setAreaId] = useState(data.areas[0]?.id ?? 0);
  const area = data.areas.find((candidate) => candidate.id === areaId) ?? data.areas[0];
  const intervalRanks = area?.ranks.filter((rank) => !rank.fixedPrice) ?? [];
  const fixedRanks = area?.ranks.filter((rank) => rank.fixedPrice) ?? [];

  return (
    <Section id="pricing" tone="cream">
      <SectionHeading en="Price" eyebrow="シーンに合わせて">
        2つの使い方と料金
      </SectionHeading>
      <p className="mt-6 text-center text-[13px] leading-relaxed text-ink-700">
        席を華やかにしたい時は「グループTOLA」、
        <br />
        気になるキャストとゆっくり話したい時は「個TOLA」。
      </p>

      {data.areas.length > 1 ? (
        <div role="tablist" aria-label="料金のエリア" className="mx-auto mt-8 flex w-fit gap-1 rounded-full bg-white p-1 shadow-sm">
          {data.areas.map((candidate) => (
            <button
              key={candidate.id}
              type="button"
              role="tab"
              aria-selected={candidate.id === area?.id}
              onClick={() => setAreaId(candidate.id)}
              className={clsx(
                'rounded-full px-5 py-1.5 text-[13px] font-bold transition',
                candidate.id === area?.id ? 'bg-night-900 text-gold-200' : 'text-ink-600 hover:text-ink-900',
              )}
            >
              {candidate.name}
            </button>
          ))}
        </div>
      ) : null}

      <PlanCard
        en="Group"
        title="グループTOLA"
        lead="複数のキャストを呼びたい時に"
        photo={LANDING_IMAGES.usage.group}
        body="人数・エリア・時間・料金タイプを指定して募集。集まったキャストから選んで確定します。"
      >
        <PriceTable
          caption={`料金（30分ごと）${area && data.areas.length > 1 ? `・${area.name}` : ''}`}
          rows={[
            ...intervalRanks.map((rank) => ({
              key: rank.id,
              label: rank.name,
              value: numberToCredits(rank.baseCostPerTime),
              sub: `${pointsInYen(rank.baseCostPerTime)}相当`,
            })),
            ...fixedRanks.map((rank) => ({
              key: rank.id,
              label: rank.name,
              value: numberToCredits(rank.baseCostPerTime),
              sub: '1回あたり',
            })),
          ]}
          notes={['延長は1.3倍のポイント消費になります。', '00:00〜06:00にかかる場合は深夜手当が加算されます。']}
        />
      </PlanCard>

      <PlanCard
        en="Private"
        title="個TOLA"
        lead="気になるキャストと1対1で"
        photo={LANDING_IMAGES.usage.individual}
        body="「探す」でキャストを見つけて「いいね」。チャットで日程を相談して、そのまま依頼できます。"
      >
        <PriceTable
          caption="料金（30分ごと）"
          rows={[
            {
              key: 'fee',
              label: '料金の目安',
              value: data.individualFee
                ? `${numberToCredits(data.individualFee.min)}〜${numberToCredits(data.individualFee.max)}`
                : 'キャストごとに設定',
              sub: data.individualFee ? 'キャストが設定した料金です' : undefined,
            },
          ]}
          notes={['延長は1.3倍のポイント消費になります。', '個TOLAに深夜手当はありません。']}
        />
      </PlanCard>

      <p className="mt-6 text-center text-[11px] text-ink-500">
        ※ 1,000P＝{config.thousand_points_in_yen.toLocaleString('ja-JP')}円（税込）でご購入いただけます。
      </p>
    </Section>
  );
}

function PlanCard({
  en,
  title,
  lead,
  body,
  photo,
  children,
}: {
  en: string;
  title: string;
  lead: string;
  body: string;
  photo: ImageSlot;
  children: ReactNode;
}): ReactNode {
  return (
    <article className="relative mt-8 overflow-hidden rounded-2xl bg-white shadow-[0_18px_40px_-24px_rgba(17,17,19,.45)]">
      <span aria-hidden className="absolute inset-x-0 top-0 z-10 h-1 bg-gradient-to-r from-gold-600 via-gold-400 to-gold-600" />
      <header className="relative px-5 pb-4 pt-6 text-center">
        <p
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-2 select-none font-serif text-5xl italic text-night-950/[0.05]"
        >
          {en}
        </p>
        <h3 className="relative text-xl font-bold text-night-950">{title}</h3>
        <p className="relative mt-1 text-xs font-bold text-gold-700">{lead}</p>
      </header>
      <div className="aspect-[4/3]">
        <Photo slot={photo} />
      </div>
      <p className="px-5 pt-4 text-[13px] leading-relaxed text-ink-700">{body}</p>
      <div className="p-5 pt-4">{children}</div>
    </article>
  );
}

function PriceTable({
  caption,
  rows,
  notes,
}: {
  caption: string;
  rows: Array<{ key: string | number; label: string; value: string; sub?: string }>;
  notes: string[];
}): ReactNode {
  return (
    <div>
      <div className="overflow-hidden rounded-xl border border-cream-200">
        <p className="bg-night-900 py-2 text-center text-xs font-bold tracking-wider text-gold-200">{caption}</p>
        <dl className="divide-y divide-cream-200">
          {rows.map((row) => (
            <div key={row.key} className="flex items-center gap-3 px-4 py-3">
              <dt className="flex-1 text-[13px] font-bold text-ink-800">{row.label}</dt>
              <dd className="text-right">
                <span className="text-lg font-bold text-night-950">{row.value}</span>
                {row.sub ? <span className="block text-[11px] text-ink-500">{row.sub}</span> : null}
              </dd>
            </div>
          ))}
        </dl>
      </div>
      <ul className="mt-3 space-y-1 text-[11px] leading-relaxed text-ink-500">
        {notes.map((note) => (
          <li key={note}>※ {note}</li>
        ))}
      </ul>
    </div>
  );
}

function Steps(): ReactNode {
  const [plan, setPlan] = useState<'group' | 'individual'>('group');
  const steps =
    plan === 'group'
      ? [
          { title: 'オーダーを作成', body: 'エリア・日時・人数・料金タイプと、ご希望を選んで募集します。' },
          { title: 'キャストを選んで確定', body: '応募したキャストのプロフィールを見て、来てほしいキャストを選びます。' },
          { title: '合流して楽しむ', body: '専用チャットで待ち合わせ場所を伝えて、キャストと合流します。' },
        ]
      : [
          { title: 'キャストを探す', body: '「探す」でプロフィールを見て、気になるキャストに「いいね」を送ります。' },
          { title: 'チャットで相談', body: 'チャットで日程や場所を相談し、そのまま個TOLAを依頼します。' },
          { title: '合流して楽しむ', body: 'キャストが依頼を承認したら、約束の場所で合流します。' },
        ];

  return (
    <Section id="steps" tone="dark">
      <SectionHeading en="Steps" tone="dark">
        はじめ方
      </SectionHeading>

      <div className="mt-10 flex items-center gap-4 rounded-2xl border border-white/10 bg-white/[0.04] p-4">
        <span className="flex h-12 w-12 shrink-0 flex-col items-center justify-center rounded-full bg-gold-500 text-night-950">
          <span className="text-[8px] font-bold leading-none tracking-wider">STEP</span>
          <span className="font-serif text-lg font-bold leading-none">0</span>
        </span>
        <p className="text-[13px] leading-relaxed text-white/80">
          <span className="block text-[15px] font-bold text-white">会員登録</span>
          LINEまたはメールアドレスで登録します。
        </p>
      </div>

      <div role="tablist" aria-label="使い方" className="mt-6 grid grid-cols-2 rounded-full bg-white/[0.06] p-1">
        {(
          [
            ['group', 'グループTOLA'],
            ['individual', '個TOLA'],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={plan === value}
            onClick={() => setPlan(value)}
            className={clsx(
              'rounded-full py-2 text-[13px] font-bold transition',
              plan === value ? 'bg-gold-500 text-night-950' : 'text-white/70 hover:text-white',
            )}
          >
            {label}
          </button>
        ))}
      </div>

      <ol className="relative mt-8 space-y-7 before:absolute before:bottom-5 before:left-[23px] before:top-5 before:w-px before:bg-gold-500/40">
        {steps.map((step, index) => (
          <li key={step.title} className="relative flex gap-4">
            <span className="relative z-10 flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-gold-400/60 bg-night-900 font-serif text-xl text-gold-300">
              {index + 1}
            </span>
            <div className="pt-1.5">
              <p className="text-[15px] font-bold text-white">{step.title}</p>
              <p className="mt-1 text-[13px] leading-relaxed text-white/70">{step.body}</p>
            </div>
          </li>
        ))}
      </ol>
    </Section>
  );
}

function Safety(): ReactNode {
  const items: Array<{ icon: Icon; title: string; body: string }> = [
    {
      icon: ShieldCheckIcon,
      title: '本人確認',
      body: 'キャストは身分証明書の提出、ゲストは電話番号の登録を行っています。',
    },
    {
      icon: BlockIcon,
      title: 'ブロック機能',
      body: '気になる相手はブロックでき、そのユーザーのメッセージは表示されなくなります。',
    },
    {
      icon: HeadsetIcon,
      title: '運営局に相談できる',
      body: `「${AN.Short} 運営局 お問合せ用」のチャットから、困ったときに運営局へ相談できます。`,
    },
    {
      icon: EyeIcon,
      title: '公開範囲を選べる',
      body: '年齢の公開や通知の設定は、マイページからいつでも変更できます。',
    },
  ];

  return (
    <Section id="safety" tone="cream">
      <SectionHeading en="Safety">
        安心してご利用
        <br />
        いただくために
      </SectionHeading>
      <ul className="mt-10 space-y-3">
        {items.map((item) => (
          <li key={item.title} className="flex items-start gap-4 rounded-2xl bg-white p-5">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gold-50 text-gold-700">
              <item.icon className="h-6 w-6" />
            </span>
            <div>
              <h3 className="text-[15px] font-bold text-night-950">{item.title}</h3>
              <p className="mt-1 text-[13px] leading-relaxed text-ink-700">{item.body}</p>
            </div>
          </li>
        ))}
      </ul>
    </Section>
  );
}

function Reviews(): ReactNode {
  return (
    <Section id="reviews" tone="white">
      <SectionHeading en="Voices">ご利用者の声</SectionHeading>
      <ul className="no-scrollbar -mx-5 mt-10 flex snap-x snap-mandatory gap-3 overflow-x-auto px-5 pb-2">
        {LANDING_REVIEWS.map((review) => (
          <li
            key={`${review.author}-${review.title}`}
            className="w-[82%] shrink-0 snap-center rounded-2xl border border-cream-200 bg-cream-50 p-5"
          >
            <p className="text-[11px] font-bold text-gold-700">{review.detail}</p>
            <h3 className="mt-2 text-base font-bold leading-snug text-night-950">{review.title}</h3>
            <p className="mt-2 text-[13px] leading-relaxed text-ink-700">{review.body}</p>
            <p className="mt-4 text-xs text-ink-500">{review.author}</p>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-right text-[11px] text-ink-500">※ 個人の感想です</p>
    </Section>
  );
}

function Areas({ data }: { data: LandingData }): ReactNode {
  return (
    <Section id="areas" tone="dark">
      <SectionHeading en="Area" tone="dark">
        対応エリア
      </SectionHeading>
      <ul className="mt-10 space-y-3">
        {data.areas.map((area) => (
          <li key={area.id} className="rounded-2xl bg-white p-5 text-ink-900">
            <p className="flex items-center gap-2 text-base font-bold">
              <MapPinIcon className="h-5 w-5 text-gold-700" strokeWidth={2} />
              {area.name}
            </p>
            {area.subAreas.length ? (
              <p className="mt-2 text-[13px] leading-relaxed text-ink-600">{area.subAreas.join(' / ')}</p>
            ) : null}
          </li>
        ))}
      </ul>
      {data.areas.some((area) => area.acceptsOtherPlaces) ? (
        <p className="mt-4 text-[11px] leading-relaxed text-white/60">
          ※ 一覧にない場所も、オーダー時に「その他」を選んで待ち合わせ場所を入力できます。
        </p>
      ) : null}
    </Section>
  );
}

function Faq(): ReactNode {
  return (
    <Section id="faq" tone="cream">
      <SectionHeading en="Q&A">よくある質問</SectionHeading>
      <div className="mt-10 divide-y divide-cream-200 overflow-hidden rounded-2xl bg-white">
        {FAQS.filter((faq) => faq.audience === 'guest').map((faq) => (
          <details key={faq.question} className="group">
            <summary className="flex cursor-pointer list-none items-start gap-3 px-5 py-4 [&::-webkit-details-marker]:hidden">
              <span className="font-serif text-lg font-bold leading-none text-gold-700">Q</span>
              <span className="flex-1 text-sm font-bold leading-snug text-night-950">{faq.question}</span>
              <ChevronDownIcon className="h-5 w-5 shrink-0 text-ink-400 transition group-open:rotate-180" />
            </summary>
            <p className="flex gap-3 px-5 pb-5 text-[13px] leading-relaxed text-ink-700">
              <span className="font-serif text-lg font-bold leading-none text-ink-400">A</span>
              <span>{faq.answer}</span>
            </p>
          </details>
        ))}
      </div>
    </Section>
  );
}

function FinalCta(): ReactNode {
  return (
    <section className="relative overflow-hidden bg-night-950 px-6 py-16 text-center text-white">
      <div
        aria-hidden
        className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(230,179,36,.25),transparent_60%)]"
      />
      <p className="relative font-serif text-sm italic tracking-[0.3em] text-gold-300">{AN.Short}</p>
      <h2 className="relative mt-3 text-2xl font-bold leading-snug text-white">
        今夜の飲み会に、
        <br />
        {AN.Short}を。
      </h2>
      <p className="relative mt-3 text-[13px] text-white/70">LINEかメールアドレスで、すぐに始められます。</p>
      <div className="relative mt-8 text-left">
        <CtaButtons />
      </div>
      <Link
        href="/cast/new"
        className="relative mt-6 inline-flex items-center gap-1 text-[13px] font-bold text-gold-200 no-underline hover:underline"
      >
        キャストとして登録する
        <ArrowRightIcon className="h-4 w-4" strokeWidth={2} />
      </Link>
    </section>
  );
}

function Footer(): ReactNode {
  const links: Array<[string, string]> = [
    ['/login', 'ログイン'],
    ['/register', '会員登録'],
    ['/cast/new', 'キャスト登録'],
    ['/usage_terms', '利用規約'],
    ['/privacy_policy', 'プライバシーポリシー'],
    ['/trade_terms', '特定商取引法に基づく表記'],
  ];

  return (
    <footer className="border-t border-white/10 bg-night-950 px-6 pb-28 pt-12 text-center text-white/70 lg:pb-12">
      <p className="font-serif text-4xl tracking-[0.08em] text-gold-300">{AN.Short}</p>
      <p className="mt-2 text-[11px] tracking-widest">{AN.Full}</p>
      <nav aria-label="フッター" className="mt-8">
        <ul className="flex flex-wrap justify-center gap-x-5 gap-y-3 text-xs">
          {links.map(([href, label]) => (
            <li key={href}>
              <Link href={href} className="text-white/70 no-underline hover:text-gold-200">
                {label}
              </Link>
            </li>
          ))}
          <li>
            <a href={`mailto:${AN.ContactMail}`} className="text-white/70 no-underline hover:text-gold-200">
              お問い合わせ
            </a>
          </li>
        </ul>
      </nav>
      <p className="mt-8 text-[11px]">運営会社　{AN.Company}</p>
      <p className="mt-1 text-[11px] text-white/50">
        © {new Date().getFullYear()} {AN.Company}
      </p>
    </footer>
  );
}
