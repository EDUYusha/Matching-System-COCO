/**
 * The editable parts of the public landing page: its photos and its reviews.
 * Prices, areas and the FAQ are not here — the page reads those from the
 * database and from help/faqs.ts, so they stay in step with the app.
 *
 * Every photo slot starts empty and renders as a labelled placeholder. To go
 * live, put the file under public/landing/ and set `src` (for example
 * '/landing/hero.jpg'); `hint` says what the slot expects.
 */

export interface ImageSlot {
  src: string | null;
  alt: string;
  hint: string;
  /** CSS object-position, for photos cropped into a frame of another shape, e.g. '50% 30%' to keep a face in view */
  position?: string;
}

export const LANDING_IMAGES: {
  hero: ImageSlot;
  /** the slideshow under 「TOLAとは」, shown one at a time in this order */
  about: ImageSlot[];
  scenes: Record<'lunch' | 'golf' | 'event' | 'dinner', ImageSlot>;
  usage: Record<'group' | 'individual', ImageSlot>;
} = {
  hero: { src: '/landing/hero-toast.png', alt: '乾杯するゲストとキャスト', hint: 'メインビジュアル・縦長（3:4 以上）' },
  about: [
    { src: '/landing/about-cafe.png', alt: 'カフェでスマートフォンを見る二人', hint: '1枚目・カフェ・横長（4:3）' },
    // the same file as the hero, so it is stored once
    { src: '/landing/hero-toast.png', alt: '乾杯するふたり', hint: '2枚目・乾杯・横長（4:3）' },
    { src: '/landing/about-street.png', alt: '夜の街で向かい合う二人', hint: '3枚目・夜の街・横長（4:3）' },
    { src: '/landing/about-walk.png', alt: '夜の街を並んで歩く二人', hint: '4枚目・夜の街・横長（4:3）' },
  ],
  scenes: {
    // the photos from the existing LP (lp.co-co.today); the strips are 16:5, so each keeps the faces in its band
    lunch: {
      src: '/landing/scene-lunch.jpg',
      alt: 'カフェで笑顔を見せる女性',
      hint: 'カフェ・ビジネスランチ・横長（16:5）',
      position: '50% 25%',
    },
    golf: {
      src: '/landing/scene-golf.jpg',
      alt: 'ゴルフクラブを持って笑う女性',
      hint: 'ゴルフ同行・横長（16:5）',
      position: '50% 35%',
    },
    event: {
      src: '/landing/scene-event.jpg',
      alt: 'パーティーでカードゲームを楽しむ女性たち',
      hint: 'イベント同行・横長（16:5）',
      position: '50% 25%',
    },
    dinner: {
      src: '/landing/scene-dinner.jpg',
      alt: 'グラスを手に談笑する男女',
      hint: '会食・食事会・横長（16:5）',
      position: '50% 40%',
    },
  },
  usage: {
    group: { src: null, alt: 'グループTOLAの様子', hint: '複数人の席・横長（4:3）' },
    individual: { src: null, alt: '個TOLAの様子', hint: '1対1の食事・横長（4:3）' },
  },
};

export interface LandingReview {
  /** who wrote it, as they agreed to be shown — e.g. 「IT企業経営・40代」 */
  author: string;
  /** e.g. 「六本木・2時間・グループTOLA」 */
  detail: string;
  title: string;
  body: string;
}

/**
 * Guest reviews. Only real reviews whose writers agreed to publication belong
 * here; the section and its menu entry stay hidden while the list is empty.
 */
export const LANDING_REVIEWS: LandingReview[] = [];
