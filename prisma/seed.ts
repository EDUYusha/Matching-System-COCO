/**
 * Port of server/db/seeds.rb.
 *
 * The reference data (branches, areas, levels, ranks, the attribute and matching
 * schemas) is created in every environment — the app does not work without it.
 * The sample accounts, chats, orders and posts are created only outside
 * production, as the original guarded with `if Rails.env.development? || …`.
 *
 * Re-runnable: it bails out if the system user already exists.
 */
import { PrismaClient, type Prisma } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

const isProduction = process.env.NODE_ENV === 'production';
const DEV_PASSWORD = 'qweasd';

function sample<T>(items: readonly T[]): T {
  return items[Math.floor(Math.random() * items.length)];
}

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomBirthday(): Date {
  return new Date(`${randomInt(1980, 1999)}-0${randomInt(1, 9)}-1${randomInt(0, 9)}T00:00:00+09:00`);
}

function daysAgo(days: number): Date {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

function monthsAgo(months: number): Date {
  const date = new Date();
  date.setMonth(date.getMonth() - months);
  return date;
}

const LOREM = [
  'はじめまして！お酒が好きで、楽しい時間を過ごせたら嬉しいです。',
  'カラオケと美味しいご飯が大好きです。よろしくお願いします。',
  '聞き上手だとよく言われます。気軽に話しかけてください。',
  '週末はだいたい空いています。ワイワイ飲みたい気分です。',
  'しっとり落ち着いたお店が好みです。',
];

async function main(): Promise<void> {
  const existingSystem = await prisma.user.findFirst({ where: { userType: 'system' } });
  if (existingSystem) {
    console.log('seed: system user already exists, nothing to do');
    return;
  }

  // --- the system user must be id 1: SystemMessage pins sender_id to it ---
  const system = await prisma.user.create({
    data: {
      email: 'system@re-creation.co.jp',
      userType: 'system',
      nickName: 'System',
      birthday: new Date('1970-01-01T00:00:00+09:00'),
      joinDate: new Date(),
      publicProfile: false,
      loggedOut: true,
    },
  });
  if (system.id !== 1) {
    throw new Error('Check your DB, system user must have id 1!');
  }

  await prisma.companyInformation.create({
    data: {
      name: '株式会社リ・クリエーション',
      zipCode: '153-0061',
      address: '東京都渋谷区広尾3-1-17',
      building: '広尾グリッスンヒルズ101',
      phone: '03-6427-7633',
      personInCharge: '新開',
    },
  });

  // --- branches and areas -------------------------------------------------

  const tokyo = await prisma.businessArea.create({ data: { name: '東京', active: true, sortIndex: 1 } });
  const tokyoAreaNames = ['銀座', '渋谷', '六本木', '西麻布', '赤坂', '恵比寿', '中目黒', '新宿'];
  for (const [index, name] of tokyoAreaNames.entries()) {
    await prisma.area.create({ data: { name, businessAreaId: tokyo.id, sortIndex: index + 1 } });
  }
  await prisma.area.create({
    data: { name: 'その他', businessAreaId: tokyo.id, sortIndex: 1000, custom: true },
  });

  // --- cast levels and price menus ---------------------------------------

  const castLevel1 = await prisma.castLevel.create({ data: { name: 'ハニータイプド', sortIndex: 1 } });
  const castLevel2 = await prisma.castLevel.create({ data: { name: 'スウィートタイプ', sortIndex: 2 } });
  const castLevel3 = await prisma.castLevel.create({ data: { name: 'ロイヤルタイプ', sortIndex: 3 } });

  const makeRank = async (
    name: string,
    baseCostPerTime: number,
    options: { proposedPrice?: boolean; fixedPrice?: boolean; prolong?: number } = {},
  ) =>
    prisma.castRank.create({
      data: {
        businessAreaId: tokyo.id,
        name,
        baseCostPerTime,
        prolongCostPerTime: options.prolong ?? Math.trunc(baseCostPerTime * 1.3),
        proposedPrice: options.proposedPrice ?? false,
        fixedPrice: options.fixedPrice ?? false,
      },
    });

  const rank1 = await makeRank('ハニータイプ', 3000);
  const rank2 = await makeRank('スウィートタイプ', 4900);
  const rank3 = await makeRank('ロイヤルタイプ', 7500);
  const rank4 = await makeRank('提案価格', 1000, { proposedPrice: true });
  const rank5 = await makeRank('ゴルフ', 10000, { fixedPrice: true, prolong: 0 });

  // which levels may see which price menu
  const linkRank = async (castRankId: number, castLevelIds: number[]) =>
    prisma.castLevelsRank.createMany({
      data: castLevelIds.map((castLevelId) => ({ castRankId, castLevelId })),
      skipDuplicates: true,
    });

  await linkRank(rank1.id, [castLevel1.id, castLevel2.id, castLevel3.id]); // standard: everyone
  await linkRank(rank2.id, [castLevel2.id, castLevel3.id]); // next tier
  await linkRank(rank3.id, [castLevel3.id]); // only the best
  await linkRank(rank4.id, [castLevel1.id, castLevel2.id, castLevel3.id]); // price proposition
  await linkRank(rank5.id, [castLevel1.id, castLevel2.id, castLevel3.id]); // fixed price

  // --- customer levels ----------------------------------------------------

  await prisma.customerLevel.create({ data: { name: '紹介新ゲスト', sortIndex: 1 } });
  await prisma.customerLevel.create({ data: { name: '新ゲスト', sortIndex: 2 } });

  const rankedLevelSpecs = [
    { name: 'グリーン', color: '3cc16c', sortIndex: 3 },
    { name: 'パープル', color: '#967aa9', entrySpending: 30_000, holdSpending: 0, sortIndex: 4 },
    { name: 'ブロンズ', color: '#97761b', entrySpending: 200_000, holdSpending: 100_000, sortIndex: 5 },
    { name: 'シルバー', color: '#7d7b76', entrySpending: 600_000, holdSpending: 200_000, sortIndex: 6 },
    { name: 'ゴールド', color: '#e6b324', entrySpending: 1_200_000, holdSpending: 500_000, sortIndex: 7 },
    { name: 'プラチナ', color: '#608180', entrySpending: 3_000_000, holdSpending: 1_500_000, sortIndex: 8 },
    { name: 'ブラック', color: '#000000', entrySpending: 6_000_000, holdSpending: 3_000_000, sortIndex: 9 },
  ];
  const rankedLevels = [];
  for (const spec of rankedLevelSpecs) {
    rankedLevels.push(await prisma.customerLevel.create({ data: spec }));
  }
  // link the ladder in both directions
  for (let i = 0; i < rankedLevels.length - 1; i += 1) {
    await prisma.customerLevel.update({
      where: { id: rankedLevels[i].id },
      data: { nextLevelId: rankedLevels[i + 1].id },
    });
    await prisma.customerLevel.update({
      where: { id: rankedLevels[i + 1].id },
      data: { prevLevelId: rankedLevels[i].id },
    });
  }
  const cocoKing = await prisma.customerLevel.create({ data: { name: 'coco王', sortIndex: 10 } });
  await prisma.customerLevel.create({ data: { name: 'coco福王', sortIndex: 11 } });

  // --- profile attribute schema ------------------------------------------

  const attributesSchema: Prisma.AttributesSchemaCreateManyInput[] = [
    { name: '自己紹介', validity: 'all', attributeType: 'Text', category: '自己紹介', sortIndex: 1 },
    { name: '居住地', validity: 'all', attributeType: 'String', category: '基本情報', sortIndex: 1 },
    { name: '対応 都道府県', validity: 'all', attributeType: 'String', category: '基本情報', sortIndex: 2 },
    {
      name: '学歴',
      validity: 'all',
      attributeType: 'String',
      category: '基本情報',
      valueList: ['中卒', '高卒', '大卒', '大学院卒', '専門卒', 'その他'],
      sortIndex: 3,
    },
    {
      name: '年収',
      validity: 'all',
      attributeType: 'String',
      category: '基本情報',
      valueList: [
        '500万以下',
        '500万～1000万',
        '1000万～1500万',
        '1500万～2000万',
        '2000万～3000万',
        '3000万～5000万',
        '5000万～1億',
        '1億以上',
      ],
      sortIndex: 4,
    },
    { name: 'お仕事', validity: 'all', attributeType: 'String', category: '基本情報', sortIndex: 5 },
    { name: 'よく飲む地域', validity: 'all', attributeType: 'String', category: '基本情報', sortIndex: 6 },
    { name: 'お酒', validity: 'all', attributeType: 'String', category: '基本情報', sortIndex: 7 },
    { name: 'タバコ', validity: 'all', attributeType: 'String', category: '基本情報', sortIndex: 8 },
    { name: '兄弟姉妹', validity: 'cast', attributeType: 'String', category: '基本情報', sortIndex: 9 },
    { name: '同居人', validity: 'cast', attributeType: 'String', category: '基本情報', sortIndex: 10 },
    { name: '外国語', validity: 'all', attributeType: 'String', category: '基本情報', sortIndex: 11 },
    { name: '身長', validity: 'all', attributeType: 'Integer', category: '外見', comment: 'cm', sortIndex: 1 },
    {
      name: 'スタイル',
      validity: 'cast',
      attributeType: 'String',
      category: '外見',
      valueList: ['細身', '普通', 'グラマラス'],
      sortIndex: 2,
    },
    // note: two rows share the name 'スタイル', one per audience
    {
      name: 'スタイル',
      validity: 'customer',
      attributeType: 'String',
      category: '外見',
      valueList: ['細身', '普通', 'ガッチリ', 'ぽっちゃり', '太め'],
      sortIndex: 2,
    },
    { name: '髪色・髪型', validity: 'all', attributeType: 'String', category: '外見', sortIndex: 3 },
    { name: '似ている芸能人', validity: 'all', attributeType: 'String', category: '外見', sortIndex: 4 },
    { name: 'チャームポイント', validity: 'all', attributeType: 'String', category: '外見', sortIndex: 5 },
    { name: '性格', validity: 'cast', attributeType: 'String', category: '性格', sortIndex: 1 },
    { name: '話し上手？聞き上手？', validity: 'cast', attributeType: 'String', category: 'お話', sortIndex: 1 },
    {
      name: 'こんな話を話したい・聞きたい',
      validity: 'cast',
      attributeType: 'String',
      category: 'お話',
      sortIndex: 2,
    },
    { name: '好きな女性のタイプ', validity: 'customer', attributeType: 'String', category: '好みのタイプ', sortIndex: 1 },
    { name: '好きな服装', validity: 'customer', attributeType: 'String', category: '好みのタイプ', sortIndex: 2 },
    { name: 'こういうタイプはNG', validity: 'customer', attributeType: 'String', category: '好みのタイプ', sortIndex: 3 },
    {
      name: '個人料金設定',
      validity: 'cast',
      attributeType: 'Text',
      category: '料金',
      comment: 'Special Value',
      sortIndex: 1,
    },
  ];
  await prisma.attributesSchema.createMany({ data: attributesSchema });

  // --- matching preference schema ----------------------------------------

  const situations = [
    'プライベート',
    '接待',
    'パーリー',
    'ワイワイ',
    'サクッと',
    'しっとり',
    '朝まで飲むよ',
    '酔いの先まで',
    'カラオケ',
    '無限延長',
    'ギフト大盤振る舞い',
  ];
  const mpsData: Prisma.MeetingPreferencesSchemaCreateManyInput[] = situations.map((name, index) => ({
    name,
    category: 'シチュエーション',
    sortIndex: index + 1,
    score: 10,
  }));

  const statuses: Array<[string, string, number, boolean?]> = [
    ['お酒飲める', 'タイプ', 1],
    ['話し上手', 'タイプ', 2],
    ['聞き上手', 'タイプ', 3],
    ['カラオケ好き', 'タイプ', 4],
    ['清楚系', 'ルックス', 5],
    ['可愛い系', 'ルックス', 6],
    ['キレイ系', 'ルックス', 7],
    ['ギャル系', 'ルックス', 8],
    ['ハーフ系', 'ルックス', 9],
    ['細身', 'スタイル', 10],
    ['普通（体型）', 'スタイル', 11],
    ['グラマー', 'スタイル', 12],
    ['高い（身長）', '身長', 13, true],
    ['普通（身長）', '身長', 13, true],
    ['低い（身長）', '身長', 14, true],
    ['20代前半', '年齢', 15, true],
    ['20代後半', '年齢', 16, true],
    ['30代', '年齢', 17, true],
    ['学生', '職業', 18, true],
    ['OL', '職業', 19, true],
    ['モデル芸能人', '職業', 20, true],
    ['自由業', '職業', 21, true],
  ];
  for (const [name, subcategory, sortIndex, mutuallyExclusive] of statuses) {
    mpsData.push({
      name,
      category: 'ステータス',
      subcategory,
      sortIndex,
      score: 10,
      mutuallyExclusive: mutuallyExclusive ?? false,
    });
  }

  // the 条件 group: two are hints for cast only, and 知り合い率 drives the
  // familiarity scoring in AutoSelectCast rather than being pickable
  mpsData.push(
    { name: 'タバコNG', category: '条件', sortIndex: 1, castPreference: false, score: 0 },
    { name: 'タバコ大好き', category: '条件', sortIndex: 2, castPreference: false, score: 0 },
    { name: '英語OK', category: '条件', sortIndex: 3, score: 100 },
    {
      name: '知り合い率',
      category: '条件',
      sortIndex: 4,
      castPreference: false,
      customerPreference: false,
      score: 1000,
    },
  );
  await prisma.meetingPreferencesSchema.createMany({ data: mpsData });
  const allPreferences = await prisma.meetingPreferencesSchema.findMany();

  // the running company cash balance starts at zero
  await prisma.companyBalance.create({ data: { balance: 0 } });

  if (isProduction) {
    console.log('seed: reference data created (production mode, no sample data)');
    return;
  }

  // ----------------------------------------------------------------------
  // development / staging sample data
  // ----------------------------------------------------------------------

  const passwordDigest = await bcrypt.hash(DEV_PASSWORD, 10);

  await prisma.admin.create({
    data: { loginName: 'm_administrator', businessAreaId: tokyo.id, passwordDigest },
  });
  await prisma.admin.create({
    data: { loginName: 'tokyo_admin', businessAreaId: tokyo.id, passwordDigest },
  });

  const kyoto = await prisma.businessArea.create({ data: { name: '京都', active: true, sortIndex: 2 } });
  const kyotoAreaNames = ['伏見区', '東山区', '上京区', '北区', '南区', '中京区'];
  const areaCount = await prisma.area.count();
  for (const [index, name] of kyotoAreaNames.entries()) {
    await prisma.area.create({
      data: { name, businessAreaId: kyoto.id, sortIndex: index + 1 + areaCount },
    });
  }
  await prisma.area.create({
    data: { name: 'その他', businessAreaId: kyoto.id, sortIndex: 1000, custom: true },
  });
  await prisma.castRank.create({
    data: { businessAreaId: kyoto.id, name: '京都ハニー', baseCostPerTime: 3000, prolongCostPerTime: 3900 },
  });
  await prisma.castRank.create({
    data: { businessAreaId: kyoto.id, name: '京都王女', baseCostPerTime: 9000, prolongCostPerTime: 11700 },
  });

  /** Mirrors the `usual_init` flag: settings, blank attributes and both system rooms. */
  async function createUser(
    data: Prisma.UserUncheckedCreateInput,
    options: { attributes?: Record<string, string> } = {},
  ) {
    const user = await prisma.user.create({ data });

    await prisma.userSettings.create({ data: { userId: user.id } });

    // attributes_schema.validity only holds cast / customer / all, so other
    // user types match 'all' alone — same as the Ruby's IN (user_type, 'all')
    const validities: Array<'cast' | 'customer' | 'all'> =
      user.userType === 'cast' ? ['cast', 'all'] : user.userType === 'customer' ? ['customer', 'all'] : ['all'];
    const schema = await prisma.attributesSchema.findMany({ where: { validity: { in: validities } } });
    if (schema.length) {
      await prisma.attribute.createMany({
        data: schema.map((entry) => ({
          userId: user.id,
          name: entry.name,
          category: entry.category,
          valueType: entry.attributeType,
        })),
        skipDuplicates: true,
      });
    }

    await prisma.conversation.create({
      data: {
        category: 'system',
        name: 'TOLA運営局からのお知らせ',
        speakers: { create: [{ userId: user.id }] },
      },
    });

    if (user.userType !== 'admin') {
      const admins = await prisma.user.findMany({ where: { userType: 'admin' }, select: { id: true } });
      await prisma.conversation.create({
        data: {
          category: 'admin',
          name: 'TOLA 運営局　お問合せ用',
          speakers: {
            create: [{ userId: user.id }, ...admins.map((admin) => ({ userId: admin.id, role: 'support' }))],
          },
        },
      });
    }

    for (const [name, value] of Object.entries(options.attributes ?? {})) {
      await prisma.attribute
        .update({ where: { userId_name: { userId: user.id, name } }, data: { value } })
        .catch(() => undefined);
    }

    return user;
  }

  const boss = await createUser({
    email: 'admin@a.bc',
    passwordDigest,
    userType: 'admin',
    nickName: 'Boss',
    birthday: randomBirthday(),
    joinDate: new Date(),
    profilePicUrl: '/samples/profile-pic-admin.png',
    loggedOut: true,
  });

  const fay = await createUser({
    email: 'cast@a.bc',
    passwordDigest,
    userType: 'cast',
    nickName: 'Fay',
    realName: 'F. Ay',
    birthday: randomBirthday(),
    joinDate: new Date(),
    profilePicUrl: '/samples/profile-pic-cast.png',
    businessAreaId: tokyo.id,
    castLevelId: castLevel3.id,
    serviceFeePermille: 700,
    orderFeePerTime: 5000,
    phone: '59949102',
    customersSelected: true,
    firstExperienceRewardPermille: 10,
    loggedOut: true,
  });

  const ivy = await createUser({
    email: 'inviter@a.bc',
    passwordDigest,
    userType: 'inviter',
    nickName: 'Ivy',
    birthday: randomBirthday(),
    joinDate: new Date(),
    profilePicUrl: '/samples/profile-pic-inviter.png',
    loggedOut: true,
  });

  const max = await createUser({
    email: 'customer@a.bc',
    passwordDigest,
    userType: 'customer',
    nickName: 'Max',
    birthday: randomBirthday(),
    joinDate: new Date(),
    // the magic token that makes the payment gateway stub always succeed
    creditcardToken: 'ALWAYS_SUCCEED',
    profilePicUrl: '/samples/profile-pic-customer.png',
    customerLevelId: cocoKing.id,
    inviterId: ivy.id,
    creditBalance: 10_000,
    loggedOut: true,
  });
  await prisma.creditCard.create({
    data: {
      userId: max.id,
      status: 'valid',
      nameOnCard: 'MAX SAMPLE',
      maskedCardNumber: '************0000',
      expiryYear: new Date().getFullYear() + 3,
      expiryMonth: 12,
    },
  });

  await createUser({
    email: 'operator1@a.bc',
    passwordDigest,
    userType: 'operator',
    nickName: 'Opi',
    birthday: randomBirthday(),
    joinDate: new Date(),
    profilePicUrl: '/samples/profile-pic-operator.png',
    businessAreaId: tokyo.id,
    loggedOut: true,
  });
  await createUser({
    email: 'operator2@a.bc',
    passwordDigest,
    userType: 'operator',
    nickName: 'Opipi',
    birthday: randomBirthday(),
    joinDate: new Date(),
    profilePicUrl: '/samples/profile-pic-operator.png',
    businessAreaId: kyoto.id,
    loggedOut: true,
  });

  // --- reward rules (a few are redundant, as the original notes) -----------

  const rewardingRules: Prisma.RewardingRuleCreateManyInput[] = [
    { category: 'being_reviewed', userType: 'cast', policy: 'fixed_steps', each: 1, limit: 1, minStars: 5, serviceFeeReset: 750 },
    { category: 'being_reviewed', userType: 'cast', policy: 'fixed_steps', each: 5, limit: 1, minStars: 5, serviceFeeReset: 800 },
    { category: 'invitation', userType: 'cast', inviteeUserType: 'customer', policy: 'fixed_steps', each: 1, limit: 1, payout: 8000 },
    { category: 'invitation', userType: 'cast', inviteeUserType: 'customer', policy: 'relative_turnover', payoutPermille: 10 },
    { category: 'invitation', userType: 'cast', inviteeUserType: 'cast', policy: 'fixed_steps', each: 1, limit: 1, payout: 8000 },
    { category: 'invitation', userType: 'customer', inviteeUserType: 'customer', policy: 'fixed_steps', each: 1, limit: 1, payout: 8000 },
    { category: 'invitation', userType: 'customer', inviteeUserType: 'cast', policy: 'fixed_steps', each: 1, limit: 1, payout: 8000 },
    { category: 'invitation', userType: 'inviter', inviteeUserType: 'customer', policy: 'fixed_steps', each: 1, limit: 1, payout: 8000 },
    { category: 'invitation', userType: 'inviter', inviteeUserType: 'customer', policy: 'relative_turnover', payoutPermille: 10 },
    { category: 'invitation', userType: 'inviter', inviteeUserType: 'cast', policy: 'fixed_steps', each: 1, limit: 1, payout: 8000 },
    { category: 'invitation', userType: 'inviter', inviteeUserType: 'cast', policy: 'relative_turnover', payoutPermille: 10 },
  ];
  await prisma.rewardingRule.createMany({ data: rewardingRules });

  // --- venues -------------------------------------------------------------

  const tagNames = ['restaurant', 'bar', 'sushi', 'bbq', 'udon', 'beer', 'cocktails'];
  const tags = new Map<string, number>();
  for (const name of tagNames) {
    const tag = await prisma.meetingPlaceTag.create({ data: { name } });
    tags.set(name, tag.id);
  }

  const ebisu = await prisma.area.findFirstOrThrow({ where: { name: '恵比寿' } });
  const shibuya = await prisma.area.findFirstOrThrow({ where: { name: '渋谷' } });

  const places: Array<[string, number, string[]]> = [
    ['恵比寿寿司', ebisu.id, ['restaurant', 'sushi']],
    ['恵比寿バーベーキュー', ebisu.id, ['restaurant', 'bbq']],
    ['恵比寿うどん', ebisu.id, ['restaurant', 'udon']],
    ['恵比寿ドリンク！', ebisu.id, ['bar', 'beer']],
    ['恵比寿飲む？', ebisu.id, ['bar', 'cocktails']],
    ['渋谷寿司', shibuya.id, ['restaurant', 'sushi']],
    ['渋谷鶏尾', shibuya.id, ['bar', 'cocktails']],
    ['渋谷うどん', shibuya.id, ['restaurant', 'udon']],
  ];
  for (const [name, areaId, placeTags] of places) {
    const place = await prisma.meetingPlace.create({
      data: {
        name,
        areaId,
        phone: `03-${randomInt(1000, 9999)}-${randomInt(1000, 9999)}`,
        address: `東京都${name.slice(0, 3)}1-2-3`,
        description: sample(LOREM),
      },
    });
    await prisma.meetingPlaceTagEntry.createMany({
      data: placeTags.map((tagName) => ({ meetingPlaceId: place.id, meetingPlaceTagId: tags.get(tagName)! })),
      skipDuplicates: true,
    });
  }

  // --- gifts and the roulette --------------------------------------------

  const stickerTemplates = [];
  for (let i = 1; i <= 3; i += 1) {
    stickerTemplates.push(
      await prisma.stickerTemplate.create({
        data: {
          pictureUrl: `/samples/sticker_sample_${i}.svg`,
          name: `Sticker${i}`,
          businessAreaId: tokyo.id,
          price: 1000 * i,
          transactionPriceAbs: 1000 * i - 100,
          active: true,
        },
      }),
    );
  }
  // a free gift for the event-campaign flow (キャストチョコ)
  const eventGift = await prisma.stickerTemplate.create({
    data: {
      pictureUrl: '/samples/sticker_sample_event.svg',
      name: 'キャストチョコ',
      businessAreaId: tokyo.id,
      price: 0,
      transactionPriceAbs: 0,
      active: true,
    },
  });
  await prisma.eventCampaign.create({
    data: {
      name: 'バレンタインキャンペーン',
      stickerTemplateId: eventGift.id,
      castRewardAmount: 100,
      castDailyLimit: 5,
      startAt: daysAgo(3),
      endAt: new Date(Date.now() + 27 * 24 * 60 * 60 * 1000),
      milestoneGiftThreshold: 70,
      limitedStickerTemplateIds: stickerTemplates.map((template) => template.id).join(','),
    },
  });

  const roulette = await prisma.roulette.create({
    data: { name: 'ギフトルーレット', fee: 3000, sortIndex: 1, active: true },
  });
  // the chances must sum to 1000
  const chances = [600, 300, 100];
  for (const [index, template] of stickerTemplates.entries()) {
    await prisma.rouletteEntry.create({
      data: {
        rouletteId: roulette.id,
        stickerTemplateId: template.id,
        chancePermille: chances[index],
        displayChance: `${chances[index] / 10}%`,
        highValue: index === stickerTemplates.length - 1,
      },
    });
  }
  await prisma.customerLevelsRoulette.create({
    data: { rouletteId: roulette.id, customerLevelId: cocoKing.id },
  });

  await prisma.trophy.create({
    data: { name: '初オーダー', imageUrl: '/samples/trophy_first.svg', description: '初めてのオーダーを達成', active: true },
  });
  await prisma.trophy.create({
    data: { name: 'リピーター', imageUrl: '/samples/trophy_repeat.svg', description: '10回以上のご利用', active: true },
  });

  await prisma.serviceMessage.create({
    data: {
      title: 'TOLAへようこそ',
      content: 'ご登録ありがとうございます。ご利用方法はヘルプをご覧ください。',
      forCast: true,
      forCustomers: true,
      forInviters: true,
      active: true,
    },
  });

  await prisma.highlighting.create({
    data: { categoryName: '今週の注目キャスト', userType: 'cast', active: true, sortIndex: 1 },
  });

  // --- sample members, chats, orders and posts ----------------------------

  const castUsers = [];
  const customerUsers = [];
  const cities = ['東京都港区', '東京都渋谷区', '東京都新宿区', '東京都目黒区'];
  const jobs = ['会社員', 'モデル', '学生', 'デザイナー', '経営者'];
  const educations = ['中卒', '高卒', '大卒', '大学院卒', '専門卒', 'その他'];
  const styles = ['細い', '太い', '普通', 'ぽっちゃり'];

  const castPreferences = allPreferences.filter((preference) => preference.castPreference);
  const exclusiveBySubcategory = new Map<string, typeof castPreferences>();
  for (const preference of castPreferences.filter((candidate) => candidate.mutuallyExclusive)) {
    const key = preference.subcategory ?? '';
    exclusiveBySubcategory.set(key, [...(exclusiveBySubcategory.get(key) ?? []), preference]);
  }
  const nonExclusive = castPreferences.filter((preference) => !preference.mutuallyExclusive);

  for (let i = 0; i < 10; i += 1) {
    const castUser = await createUser(
      {
        email: `cast_${i}@example.com`,
        passwordDigest,
        userType: 'cast',
        nickName: `cast_${i}`,
        realName: `キャスト ${i}`,
        phone: '000000000',
        motto: sample(LOREM),
        birthday: randomBirthday(),
        joinDate: daysAgo(randomInt(0, 60)),
        businessAreaId: tokyo.id,
        profilePicUrl: `/samples/coco_sample_pic${randomInt(1, 16)}.png`,
        castLevelId: sample([castLevel1.id, castLevel2.id, castLevel3.id]),
        serviceFeePermille: 700,
        orderFeePerTime: sample([1000, 5000, 10000]),
        customersSelected: true,
        firstExperienceRewardPermille: 10,
        lastActivity: daysAgo(randomInt(0, 3)),
        lastLogin: daysAgo(randomInt(0, 3)),
        loggedOut: true,
      },
      {
        attributes: {
          居住地: sample(cities),
          身長: String(randomInt(140, 190)),
          スタイル: sample(styles),
          学歴: sample(educations),
          お仕事: sample(jobs),
        },
      },
    );

    // one pick per mutually-exclusive group, plus five free choices
    for (const group of exclusiveBySubcategory.values()) {
      await prisma.meetingPreference.create({
        data: { userId: castUser.id, parentId: sample(group).id },
      });
    }
    const shuffled = [...nonExclusive].sort(() => Math.random() - 0.5).slice(0, 5);
    for (const preference of shuffled) {
      await prisma.meetingPreference
        .create({ data: { userId: castUser.id, parentId: preference.id } })
        .catch(() => undefined);
    }

    await prisma.picture.create({
      data: {
        userId: castUser.id,
        public: true,
        profilePic: true,
        fileData: {
          id: `../samples/coco_sample_pic${randomInt(1, 16)}.png`,
          storage: 'store',
          metadata: { filename: 'sample.png', size: 228008, mime_type: 'image/png' },
        },
      },
    });
    castUsers.push(castUser);

    const customer = await createUser(
      {
        email: `customer_${i}@example.com`,
        passwordDigest,
        userType: 'customer',
        nickName: `guest_${i}`,
        motto: sample(LOREM),
        birthday: randomBirthday(),
        joinDate: daysAgo(randomInt(0, 60)),
        profilePicUrl: `/samples/coco_sample_pic${randomInt(1, 16)}.png`,
        creditcardToken: 'ALWAYS_SUCCEED',
        creditBalance: randomInt(0, 50_000),
        lastActivity: daysAgo(randomInt(0, 5)),
        lastLogin: daysAgo(randomInt(0, 5)),
        daysElapsed: randomInt(0, 40),
        loggedOut: true,
      },
      {
        attributes: {
          居住地: sample(cities),
          身長: String(randomInt(140, 190)),
          スタイル: sample(styles),
          学歴: sample(educations),
          お仕事: sample(jobs),
        },
      },
    );
    await prisma.picture.create({
      data: {
        userId: customer.id,
        public: true,
        profilePic: true,
        fileData: {
          id: `../samples/coco_sample_pic${randomInt(1, 16)}.png`,
          storage: 'store',
          metadata: { filename: 'sample.png', size: 228008, mime_type: 'image/png' },
        },
      },
    });
    customerUsers.push(customer);
  }

  /** Conversation.create_for_2p! */
  async function createPrivateConversation(userA: { id: number; nickName: string }, userB: { id: number; nickName: string }) {
    return prisma.conversation.create({
      data: {
        category: 'private',
        name: 'Private Chat',
        speakers: {
          create: [
            { userId: userA.id, conversationName: userB.nickName },
            { userId: userB.id, conversationName: userA.nickName },
          ],
        },
      },
    });
  }

  async function createMessage(
    conversationId: number,
    senderId: number,
    content: string,
    sentAt: Date,
    withUnread = false,
  ) {
    const message = await prisma.message.create({
      data: { conversationId, senderId, content, sentAt, createdAt: sentAt, category: 'text' },
    });
    if (withUnread) {
      const speakers = await prisma.speaker.findMany({ where: { conversationId }, select: { userId: true } });
      await prisma.unreadMessage.createMany({
        data: speakers
          .filter((speaker) => speaker.userId !== senderId)
          .map((speaker) => ({ userId: speaker.userId, messageId: message.id, conversationId })),
      });
    }
    const sender = await prisma.user.findUniqueOrThrow({ where: { id: senderId }, select: { nickName: true } });
    await prisma.conversation.update({
      where: { id: conversationId },
      data: {
        lastContent: content.slice(0, 100),
        lastSenderName: sender.nickName,
        lastSenderId: senderId,
        updatedAt: sentAt,
      },
    });
    return message;
  }

  const fayMax = await createPrivateConversation(fay, max);
  await createMessage(fayMax.id, fay.id, 'はじめまして！よろしくお願いします♪', daysAgo(4));
  await createMessage(fayMax.id, max.id, 'こちらこそ、よろしくお願いします。', daysAgo(4));

  const chitChat = [
    '今週末は空いていますか？',
    'ありがとうございます！',
    '恵比寿あたりでどうでしょう？',
    '了解しました、楽しみです。',
    'お店を予約しておきますね。',
  ];

  for (let i = 0; i < castUsers.length; i += 1) {
    const fayToCustomer = await createPrivateConversation(fay, customerUsers[i]);
    const maxToCast = await createPrivateConversation(max, castUsers[i]);

    await createMessage(fayToCustomer.id, fay.id, 'First♥', daysAgo(3));
    await createMessage(maxToCast.id, max.id, 'First!', daysAgo(3));

    for (let j = 1; j <= 5; j += 1) {
      const at = new Date(Date.now() - j * 60 * 1000);
      await createMessage(fayToCustomer.id, fay.id, sample(chitChat), at, true);
      await createMessage(maxToCast.id, max.id, sample(chitChat), at, true);
      await createMessage(
        fayToCustomer.id,
        customerUsers[i].id,
        sample(chitChat),
        new Date(at.getTime() + 30_000),
        true,
      );
      await createMessage(maxToCast.id, castUsers[i].id, sample(chitChat), new Date(at.getTime() + 30_000), true);
    }
  }

  // five settled orders, so the history and ranking screens have data
  const ginza = await prisma.area.findFirstOrThrow({ where: { name: '銀座' } });
  let lastMeetingId = 0;

  for (let i = 1; i <= 5; i += 1) {
    const start = monthsAgo(i);
    const end = new Date(start.getTime() + 60 * 60 * 1000);
    const rank = sample([rank1, rank2, rank3]);
    const secondCast = sample(castUsers);

    const meeting = await prisma.meeting.create({
      data: {
        ownerId: max.id,
        areaId: ginza.id,
        areaName: ginza.name,
        plannedStartTime: start,
        plannedEndTime: end,
        realEndTime: end,
        status: 'completed',
        category: 'general',
        neededPersonCount: 2,
        castRankId: rank.id,
        baseCostPerTime: rank.baseCostPerTime,
        prolongCostPerTime: rank.prolongCostPerTime,
        finalCosts: rank.baseCostPerTime * 2 * 2,
        calculationSettings: {
          night_surcharge: 4000,
          night_interval: { start: '00:00', end: '06:00' },
          cast_selection_surcharge: 2000,
          night_earnings_permille: 'cast_dependent',
          selection_earnings_permille: 0,
        },
        castAttendances: {
          create: [
            { userId: fay.id, role: 'attending', startTime: start, endTime: end, serviceFeePermille: 700 },
            {
              userId: secondCast.id,
              role: 'attending',
              startTime: start,
              endTime: new Date(start.getTime() + 2 * 60 * 60 * 1000),
              serviceFeePermille: 700,
            },
          ],
        },
      },
      include: { castAttendances: true },
    });
    lastMeetingId = meeting.id;

    // the group room, plus one ledger row per cast
    const conversation = await prisma.conversation.create({
      data: {
        category: 'meeting',
        name: `合流: ${ginza.name}`,
        speakers: {
          create: [
            { userId: max.id, role: 'owner' },
            ...meeting.castAttendances.map((attendance) => ({ userId: attendance.userId, role: 'cast' })),
          ],
        },
      },
    });
    await prisma.meeting.update({ where: { id: meeting.id }, data: { conversationId: conversation.id } });

    for (const attendance of meeting.castAttendances) {
      const charged = rank.baseCostPerTime * 2;
      const credited = Math.floor((charged * 700) / 1000);
      const transaction = await prisma.creditTransaction.create({
        data: {
          chargedUserId: max.id,
          chargedAmount: charged,
          creditedUserId: attendance.userId,
          creditedAmount: credited,
          reason: `合流 ${meeting.id}`,
          category: 'meeting',
          createdAt: end,
        },
      });
      await prisma.castAttendance.update({
        where: { id: attendance.id },
        data: { creditTransactionId: transaction.id },
      });
      await prisma.user.update({
        where: { id: attendance.userId },
        data: { creditBalance: { increment: credited } },
      });
    }
  }

  const lastMeeting = await prisma.meeting.findUniqueOrThrow({
    where: { id: lastMeetingId },
    include: { castAttendances: true, conversation: true },
  });
  if (lastMeeting.conversationId) {
    await createMessage(lastMeeting.conversationId, fay.id, 'I am so looking forward to this!', daysAgo(1), true);
    await createMessage(lastMeeting.conversationId, max.id, '楽しみにしています♥', daysAgo(1), true);
  }

  // posts
  const firstPost = await prisma.post.create({
    data: { userId: fay.id, content: '今日も元気に営業中です！', category: 'public' },
  });
  for (const castUser of castUsers) {
    await prisma.postLike.create({ data: { postId: firstPost.id, userId: castUser.id } });
  }
  await prisma.post.update({
    where: { id: firstPost.id },
    data: { postLikesCount: castUsers.length },
  });
  await prisma.post.create({ data: { userId: fay.id, content: '明日は休みます。', category: 'public' } });
  for (let i = 0; i < 20; i += 1) {
    await prisma.post.create({
      data: {
        userId: sample(castUsers).id,
        content: sample(LOREM),
        category: i % 5 === 0 ? 'cast_only' : 'public',
        createdAt: new Date(Date.now() - (i + 1) * 60 * 60 * 1000),
      },
    });
  }

  // mutual friendships, which the team-entry flow needs
  for (const castUser of castUsers.slice(0, 5)) {
    await prisma.friendship.create({ data: { userId: castUser.id, friendId: fay.id, mutual: true } });
    await prisma.friendship.create({ data: { userId: fay.id, friendId: castUser.id, mutual: true } });
  }

  console.log(`seed: done.
  admin panel : m_administrator / ${DEV_PASSWORD}
  cast        : cast@a.bc / ${DEV_PASSWORD}
  guest       : customer@a.bc / ${DEV_PASSWORD}
  inviter     : inviter@a.bc / ${DEV_PASSWORD}
  operator    : operator1@a.bc / ${DEV_PASSWORD}
  site admin  : admin@a.bc / ${DEV_PASSWORD}   (user id ${boss.id})`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
