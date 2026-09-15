#!/usr/bin/env python3
"""
Creates the App Router files for the ported screens.

`config/routes.rb` -> coco-v2's <Route> table -> this. Every url the Rails app
served still resolves, so links in old LINE notifications and emails keep
working. Each page.tsx is a wrapper naming one screen component; the two route
groups carry the difference that matters — (public) renders bare, (app) sits
inside the signed-in shell with its bottom navigation.
"""

from __future__ import annotations

import pathlib

PUBLIC: list[tuple[str, str, str]] = [
    # url, component, module
    ('register', 'SignupPage', 'auth/SignupPage'),
    ('users/new', 'SignupPage', 'auth/SignupPage'),
    ('users/signup', 'SignupPage showcase', 'auth/SignupPage'),
    ('cast/new', 'CastSignupPage', 'auth/CastSignupPage'),
    ('cast/signup', 'CastSignupPage showcase', 'auth/CastSignupPage'),
    ('password_restoration', 'PasswordRestorationPage', 'auth/PasswordPages'),
    ('password_reset/[token]', 'PasswordResetPage', 'auth/PasswordPages'),
    ('privacy_policy', 'PrivacyPolicyPage', 'help/HelpPages'),
    ('trade_terms', 'TradeTermsPage', 'help/HelpPages'),
    ('usage_terms', 'UsageTermsPage', 'help/HelpPages'),
    ('faq', 'FaqPage', 'help/HelpPages'),
]

APP: list[tuple[str, str, str]] = [
    ('home', 'HomePage', 'HomePage'),
    ('users/complete_registration', 'CompleteRegistrationPage', 'auth/CompleteRegistrationPage'),

    ('profiles/search', 'SearchPage', 'profile/SearchPage'),
    ('profiles/ranking', 'RankingPage', 'profile/RankingPage'),
    ('profiles/[id]', 'ProfilePage', 'profile/ProfilePage'),
    ('profile', 'MyProfilePage', 'profile/MyProfilePage'),
    ('profile/settings', 'ProfileSettingsPage', 'profile/ProfileSettingsPage'),
    ('profile/edit_basics', 'EditBasicsPage', 'profile/EditBasicsPage'),
    ('profile/edit_attributes', 'EditAttributesPage', 'profile/EditAttributesPage'),
    ('profile/edit_meeting_preferences', 'EditPreferencesPage', 'profile/EditPreferencesPage'),
    ('profile/footprints', 'FootprintsPage', 'profile/FootprintsPage'),

    ('meetings', 'MeetingListPage', 'meetings/MeetingListPage'),
    ('meetings/new', 'OrderWizardPage', 'meetings/OrderWizardPage'),
    ('meetings/[id]', 'CastSelectionPage', 'meetings/CastSelectionPage'),
    ('meetings/[id]/show_cast/[castAttendanceId]', 'CastSelectionDetailPage', 'meetings/CastSelectionDetailPage'),
    ('meetings/[id]/request', 'OrderRequestPage', 'meetings/OrderRequestPage'),
    ('meetings/[id]/review', 'ReviewPage', 'meetings/ReviewPage'),
    ('meetings/[id]/select_friends', 'SelectFriendsPage', 'meetings/SelectFriendsPage'),

    ('conversations', 'ConversationListPage', 'chat/ConversationListPage'),
    ('conversations/[id]', 'ConversationPage', 'chat/ConversationPage'),
    ('conversations/[id]/stickers/roulette/[rouletteId]', 'RoulettePage', 'chat/RoulettePage'),

    ('posts', 'PostsPage', 'posts/PostsPage'),
    ('posts/new', 'NewPostPage', 'posts/NewPostPage'),

    ('user/settings', 'SettingsPage', 'SettingsPage'),
    ('user/notification_settings', 'NotificationSettingsPage', 'NotificationSettingsPage'),
    ('user/password', 'PasswordChangePage', 'PasswordChangePage'),
    ('user/phone_number', 'PhoneNumberPage', 'PhoneNumberPage'),
    ('user/add_login_method', 'AddLoginMethodPage', 'AddLoginMethodPage'),
    ('user/blockings', 'BlockingsPage', 'BlockingsPage'),
    ('intro_messages', 'IntroMessagePage', 'IntroMessagePage'),
    ('friendships', 'FriendshipsPage', 'FriendshipsPage'),
    ('service_messages', 'ServiceMessagesPage', 'ServiceMessagesPage'),
    ('meeting_places', 'MeetingPlacesPage', 'MeetingPlacesPage'),

    ('financial/history', 'HistoryPage', 'financial/HistoryPage'),
    ('financial/history_details', 'MeetingCostsPage', 'financial/MeetingCostsPage'),
    ('financial/stickers/[id]', 'StickerDetailPage', 'financial/StickerDetailPage'),
    ('financial/charge', 'ChargePage', 'financial/ChargePage'),
    ('financial/credit_card', 'CreditCardPage', 'financial/CreditCardPage'),
    ('financial/payout', 'PayoutPage', 'financial/PayoutPage'),
    ('financial/bank_account', 'BankAccountPage', 'financial/BankAccountPage'),

    ('cast/restricted', 'CastOnboardingPage', 'cast/CastOnboardingPage'),
    ('cast/identity_check', 'IdentityCheckPage', 'cast/IdentityCheckPage'),
    ('cast/interview_request', 'IdentityCheckPage interviewOnly', 'cast/IdentityCheckPage'),
    ('cast/agreement', 'AgreementPage', 'cast/AgreementPage'),
    ('cast/customer_recommendations', 'CustomerRecommendationsPage', 'cast/CustomerRecommendationsPage'),
    ('users/cast_recommendations', 'CastRecommendationsPage', 'cast/CastRecommendationsPage'),

    ('help', 'HelpPage', 'help/HelpPages'),
]


def write(group: str, url: str, spec: str, module: str) -> None:
    name, _, prop = spec.partition(' ')
    target = pathlib.Path('src/app') / group / url
    target.mkdir(parents=True, exist_ok=True)
    props = f' {prop}' if prop else ''
    (target / 'page.tsx').write_text(
        f"import {{ Suspense }} from 'react';\n"
        f"import {{ {name} }} from '@/components/screens/{module}';\n\n"
        "/*\n"
        " * Every screen is session- or query-driven, so none of them prerender.\n"
        " * The Suspense boundary is what useSearchParams needs to read the query\n"
        " * string during streaming.\n"
        " */\n"
        "export const dynamic = 'force-dynamic';\n\n"
        f"export default function Page() {{\n"
        f"  return (\n"
        f"    <Suspense>\n"
        f"      <{name}{props} />\n"
        f"    </Suspense>\n"
        f"  );\n"
        f"}}\n"
    )


def main() -> None:
    for url, spec, module in PUBLIC:
        write('(public)', url, spec, module)
    for url, spec, module in APP:
        write('(app)', url, spec, module)
    print(f'wrote {len(PUBLIC)} public and {len(APP)} signed-in pages')


if __name__ == '__main__':
    main()
