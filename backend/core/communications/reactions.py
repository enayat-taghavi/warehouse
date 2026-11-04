"""
مدیریت و تجمیع واکنش‌های پیام چت (Phase 4: Message Reactions)
واکنش‌های مجاز تلگرامی به صورت ۶ ایموجی ثابت هستند: 👍، ❤️، 😂، 😮، 😢، 🙏.
"""
from typing import Iterable, Any

ALLOWED_REACTION_EMOJIS = [
    ('👍', '👍'),
    ('❤️', '❤️'),
    ('😂', '😂'),
    ('😮', '😮'),
    ('😢', '😢'),
    ('🙏', '🙏'),
]

ALLOWED_REACTION_EMOJI_LIST = ['👍', '❤️', '😂', '😮', '😢', '🙏']
ALLOWED_REACTION_EMOJI_SET = set(ALLOWED_REACTION_EMOJI_LIST)


def format_reactions_summary(reactions: Iterable[Any], current_user_id: int | None = None) -> list[dict]:
    """
    تجمیع واکنش‌ها در حافظه بدون تحمیل کوئری اضافی.
    ورودی: مجموعه‌ای از نمونه‌های MessageReaction (یا شیء دارای ویژگی‌های emoji و user_id).
    خروجی: آرایه‌ای از ساختارهای تجمیع‌شده به ترتیب استاندارد ایموجی‌ها:
    [
        {
            "emoji": "👍",
            "count": 2,
            "mine": True,
            "user_ids": [1, 2]
        },
        ...
    ]
    """
    by_emoji: dict[str, list[int]] = {}
    for r in reactions:
        emo = getattr(r, 'emoji', None)
        u_id = getattr(r, 'user_id', None)
        if not emo or u_id is None:
            continue
        if emo not in by_emoji:
            by_emoji[emo] = []
        by_emoji[emo].append(int(u_id))

    summary: list[dict] = []
    current_uid_int = int(current_user_id) if current_user_id is not None else None

    # رعایت ترتیب استاندارد تعریف‌شده ۶ ایموجی
    for emo in ALLOWED_REACTION_EMOJI_LIST:
        if emo in by_emoji:
            user_ids = by_emoji[emo]
            summary.append({
                'emoji': emo,
                'count': len(user_ids),
                'mine': bool(current_uid_int is not None and current_uid_int in user_ids),
                'user_ids': user_ids,
            })

    # در صورتی که ایموجی دیگری در گذشته ثبت شده باشد
    for emo, user_ids in by_emoji.items():
        if emo not in ALLOWED_REACTION_EMOJI_SET:
            summary.append({
                'emoji': emo,
                'count': len(user_ids),
                'mine': bool(current_uid_int is not None and current_uid_int in user_ids),
                'user_ids': user_ids,
            })

    return summary
