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
}

export const LANDING_IMAGES: {
  hero: ImageSlot;
  scenes: Record<'settai' | 'nijikai' | 'nomikai' | 'golf', ImageSlot>;
  usage: Record<'group' | 'individual', ImageSlot>;
} = {
  hero: { src: null, alt: 'TOLAのキャスト', hint: 'メインビジュアル・縦長（3:4 以上）' },
  scenes: {
    settai: { src: null, alt: '接待の様子', hint: '接待のシーン・横長（16:5）' },
    nijikai: { src: null, alt: '二次会の様子', hint: '二次会のシーン・横長（16:5）' },
    nomikai: { src: null, alt: '飲み会の様子', hint: '飲み会のシーン・横長（16:5）' },
    golf: { src: null, alt: 'ゴルフの様子', hint: 'ゴルフのシーン・横長（16:5）' },
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
