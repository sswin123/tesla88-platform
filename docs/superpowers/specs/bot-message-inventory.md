# Bot Message Inventory — Phase 5.8

> Scanned: bot/ — all customer-facing Telegram text
> Total unique keys: 97
> Language: Simplified Chinese (primary)

---

## Category: WELCOME / START

| message_key | default_text | location | variables |
|---|---|---|---|
| `start_returning_user` | 欢迎回来，{first_name}！\n状态：{status_emoji} {status}\n\n请选择操作： | handlers/user/registration.py:54 | first_name, status_emoji, status |
| `start_new_user` | 欢迎注册会员\n\n请选择： | handlers/user/registration.py:62 | — |
| `home_returned` | 🏠 已返回主菜单 | handlers/common.py:22 | — |
| `cancel_done` | ❌ 已取消操作 | handlers/common.py:32 | — |

---

## Category: REGISTER

| message_key | default_text | location | variables |
|---|---|---|---|
| `register_enter_phone` | 请输入您的电话号码：\n\n支持格式：\n  0123456789\n  60123456789\n  +60123456789 | handlers/user/registration.py:29 | — |
| `register_phone_invalid` | 电话号码格式不正确，请重新输入：\n\n支持格式：\n  0123456789\n  60123456789\n  +60123456789 | handlers/user/registration.py:147 | — |
| `register_phone_exists` | 此电话号码已注册。 | handlers/user/registration.py:158 | — |
| `register_telegram_exists` | 此 Telegram 已注册。 | handlers/user/registration.py:75 | — |
| `register_select_bank` | 请选择您的银行或电子钱包： | handlers/user/registration.py:164 | — |
| `register_enter_custom_bank` | 请输入您的银行或电子钱包名称： | handlers/user/registration.py:174 | — |
| `register_bank_selected` | 已选择：{bank_name}\n\n请输入银行账号： | handlers/user/registration.py:131 | bank_name |
| `register_bank_name_empty` | 银行名称不能为空，请重新输入： | handlers/user/registration.py:197 | — |
| `register_account_empty` | 银行账号不能为空，请重新输入： | handlers/user/registration.py:215 | — |
| `register_account_exists` | 此银行账号已被使用，请输入其他账号：| handlers/user/registration.py:220 | — |
| `register_enter_holder_name` | 请输入银行户口姓名（请与银行资料一致）： | handlers/user/registration.py:225 | — |
| `register_holder_name_empty` | 银行户口姓名不能为空，请重新输入： | handlers/user/registration.py:236 | — |
| `register_conflict_error` | 注册失败：信息冲突，请重新注册。 | handlers/user/registration.py:258 | — |
| `register_success` | ✅ 注册成功！\n\n📱 电话：{phone}\n🏦 银行：{bank_name}\n💳 账号：{bank_account}\n👤 户口姓名：{bank_holder_name}\n\n欢迎加入会员系统。\n\n请从下方菜单开始使用。 | handlers/user/registration.py:261 | phone, bank_name, bank_account, bank_holder_name |
| `register_back_to_phone` | 请重新输入电话号码：\n\n{hint}支持格式：\n  0123456789\n  60123456789\n  +60123456789 | handlers/user/registration.py:98 | hint |
| `register_back_to_bank` | 请重新选择银行或电子钱包： | handlers/user/registration.py:111 | — |
| `register_back_to_account` | 已选择：{bank_name}\n\n请输入银行账号： | handlers/user/registration.py:187 | bank_name |

---

## Category: DEPOSIT

| message_key | default_text | location | variables |
|---|---|---|---|
| `deposit_not_registered` | 您尚未注册。请发送 /start 开始注册。 | handlers/user/deposit.py:65 | — |
| `deposit_account_frozen` | ❌ 您的账号已被冻结，无法提交充值申请。 | handlers/user/deposit.py:68 | — |
| `deposit_pending_exists` | ⚠️ 您有一个待审核的充值申请，请等待处理后再提交新申请。 | handlers/user/deposit.py:71 | — |
| `deposit_no_game_account` | ⚠️ 您尚未领取任何游戏账号，请先在「🎮 我的游戏账号」领取账号。 | handlers/user/deposit.py:76 | — |
| `deposit_select_platform` | 💰 充值\n\n请选择游戏平台： | handlers/user/deposit.py:89 | — |
| `deposit_select_promo` | 💰 充值 — {provider}\n\n请选择优惠： | handlers/user/deposit.py:168 | provider |
| `deposit_enter_amount` | 请输入充值金额（RM）\n\nExample：\n100\n300\n500 | handlers/user/deposit.py:253 | — |
| `deposit_amount_invalid` | ⚠️ 输入格式错误\n\n请输入正确金额，例如：\n\n100\n300\n500 | handlers/user/deposit.py:514 | — |
| `deposit_min_not_met` | ⚠️ 使用「{promo_name}」最低充值为 RM {min_deposit:.2f}\n\n您的金额不符合条件，请重新输入： | handlers/user/deposit.py:529 | promo_name, min_deposit |
| `deposit_no_bank_available` | ⚠️ 暂无可用收款账号，请联系客服。 | handlers/user/deposit.py:576 | — |
| `deposit_preview` | 💰 充值预览\n\n🎮 平台：{provider}\n👤 游戏账号：{game_username}\n\n💵 充值金额：RM {amount:.2f}\n{credit_block}\n━━━━━━━━━━━━━━\n\n🏦 请选择收款账号： | handlers/user/deposit.py:583 | provider, game_username, amount, credit_block |
| `deposit_bank_invalid` | ❌ 收款账号已失效，请重新选择。 | handlers/user/deposit.py:444 | — |
| `deposit_confirm` | 💰 充值确认\n\n🎮 平台：{provider}\n👤 游戏账号：{game_username}\n\n💵 充值金额：RM {amount:.2f}\n{credit_block}\n━━━━━━━━━━━━━━\n\n🏦 收款账号：\n银行：{bank_name}\n账户名：{account_name}\n账号：{account_number}\n\n📷 请上传转账收据截图\n\n支持格式：\n✅ JPG / PNG\n✅ Telegram 图片 | handlers/user/deposit.py:474 | provider, game_username, amount, credit_block, bank_name, account_name, account_number |
| `deposit_receipt_invalid` | ⚠️ 格式不正确\n\n请上传图片截图（JPG / PNG / Telegram 图片） | handlers/user/deposit.py:691 | — |
| `deposit_submitted` | ✅ 充值申请已提交！\n申请编号：#{req_id}\n请等待管理员审核。 | handlers/user/deposit.py:683 | req_id |
| `deposit_cancelled` | ❌ 已取消充值申请。 | handlers/user/deposit.py:698 | — |
| `deposit_promo_unavailable` | ⚠️ 该优惠已下线 | handlers/user/deposit.py:112 | — |
| `deposit_promo_invalid` | 该优惠不可用。 | handlers/user/deposit.py:212 | — |
| `deposit_promo_first_only` | 此优惠每位用户只能领取一次，您已达到领取上限。 | handlers/user/deposit.py:227 | — |
| `deposit_promo_daily_limit` | 此优惠今日已领取，请明天再来。 | handlers/user/deposit.py:228 | — |
| `deposit_promo_weekly_limit` | 此优惠本周已领取，请下周再来。 | handlers/user/deposit.py:229 | — |

---

## Category: WITHDRAW

| message_key | default_text | location | variables |
|---|---|---|---|
| `withdraw_not_registered` | 您尚未注册。请发送 /start 开始注册。 | handlers/user/withdrawal.py:46 | — |
| `withdraw_account_frozen` | ❌ 您的账号已被冻结，无法提交提款申请。 | handlers/user/withdrawal.py:49 | — |
| `withdraw_pending_exists` | ⚠️ 您有一个待审核的提款申请，请等待处理后再提交新申请。 | handlers/user/withdrawal.py:52 | — |
| `withdraw_no_game_account` | ⚠️ 您尚未领取任何游戏账号，请先在「🎮 我的游戏账号」领取账号。 | handlers/user/withdrawal.py:57 | — |
| `withdraw_select_platform` | 💸 提款\n\n请选择游戏平台： | handlers/user/withdrawal.py:70 | — |
| `withdraw_enter_amount` | 请输入提款金额（RM）\n\n例如：\n100\n300\n500 | handlers/user/withdrawal.py:96 | — |
| `withdraw_amount_invalid` | ⚠️ 输入格式错误\n\n请输入正确金额，例如：\n\n100\n300\n500 | handlers/user/withdrawal.py:130 | — |
| `withdraw_min_not_met` | ⚠️ 最低提款金额为 RM {min_amount:.2f}\n\n请重新输入金额： | handlers/user/withdrawal.py:136 | min_amount |
| `withdraw_confirm` | 💸 提款确认\n\n🎮 平台：{provider}\n👤 游戏账号：{game_username}\n💵 提款金额：RM {amount:.2f}\n\n🏦 收款银行：{bank_name}\n💳 收款账号：{bank_account}\n👤 账户名：{bank_holder_name} | handlers/user/withdrawal.py:145 | provider, game_username, amount, bank_name, bank_account, bank_holder_name |
| `withdraw_submitted` | ✅ 提款申请已提交！\n申请编号：#{req_id}\n请等待管理员审核。 | handlers/user/withdrawal.py:225 | req_id |
| `withdraw_cancelled` | ❌ 已取消提款申请。 | handlers/user/withdrawal.py:235 | — |
| `withdraw_invalid_platform` | 无效平台。 | handlers/user/withdrawal.py:81 | — |

---

## Category: GAME

| message_key | default_text | location | variables |
|---|---|---|---|
| `game_not_registered` | 您尚未注册。请发送 /start 开始注册。 | handlers/user/game_accounts.py:30 | — |
| `game_no_stock_available` | 🎮 当前没有可领取的账号，请联系客服。 | handlers/user/game_accounts.py:65 | — |
| `game_invalid_platform` | 无效的平台。 | handlers/user/game_accounts.py:81 | — |
| `game_no_stock_callback` | ⚠️ 当前暂无可用账号，请稍后再试或联系客服。 | handlers/user/game_accounts.py:93 | — |
| `game_claim_success` | ✅ 领取成功\n\n🎮 平台：{provider}\n👤 账号：{username}\n🔑 密码：{password} | handlers/user/game_accounts.py:99 | provider, username, password |
| `game_no_accounts_to_change` | 您尚未领取任何游戏账号。\n请先在「🎮 我的游戏账号」领取账号。 | handlers/user/game_accounts.py:119 | — |
| `game_select_change_platform` | 请选择要更换的游戏平台： | handlers/user/game_accounts.py:124 | — |
| `game_change_cooldown` | ❌ {provider} 距上次更换不足 {cooldown_hours} 小时。\n请于 {next_time} 后再试。 | handlers/user/game_accounts.py:150 | provider, cooldown_hours, next_time |
| `game_no_new_stock` | ⚠️ 当前没有可用的新账号。\n您的现有账号保持不变。{current_info} | handlers/user/game_accounts.py:169 | current_info |
| `game_change_success` | ✅ 更换成功\n\n🎮 平台：{provider}\n\n📤 旧账号：{old_username}\n📥 新账号：{new_username}\n🔑 密码：{new_password} | handlers/user/game_accounts.py:187 | provider, old_username, new_username, new_password |
| `game_account_not_found` | 找不到该平台账号。 | handlers/user/game_accounts.py:208 | — |

---

## Category: BONUS / PROMOTION

| message_key | default_text | location | variables |
|---|---|---|---|
| `promo_none_active` | 目前暂无进行中的优惠。敬请期待！ | handlers/user/promotions.py:134 | — |
| `promo_list_header` | 🎁 <b>优惠中心</b>\n\n请选择您感兴趣的优惠： | handlers/user/promotions.py:136 | — |
| `promo_not_registered` | 您尚未注册。请发送 /start 开始注册。 | handlers/user/promotions.py:150 | — |
| `promo_unavailable` | ⚠️ 该优惠已下线 | handlers/user/promotions.py:183 | — |
| `promo_enter_amount` | 🧮 请输入充值金额（RM）\n\n例如：\n100\n300\n500 | handlers/user/promotions.py:217 | — |
| `promo_expired` | ❌ 优惠已失效，已返回主菜单。 | handlers/user/promotions.py:247 | — |
| `promo_amount_invalid` | ⚠️ 输入格式错误\n\n请输入正确金额，例如：\n\n100\n300\n500 | handlers/user/promotions.py:263 | — |
| `promo_min_not_met` | ⚠️ 此优惠最低充值为 RM{min_dep:.2f}\n\n请重新输入金额： | handlers/user/promotions.py:279 | min_dep |
| `promo_my_claims_empty` | 🎁 <b>我的优惠</b>\n\n您目前没有进行中的优惠。\n\n点击「🎁 优惠中心」查看可选择的优惠！ | handlers/user/promotions.py:336 | — |
| `bonus_disclaimer` | 🚫 <b>违规声明</b>\n\n🔥 如发现任何违规、套利、对冲、对刷、刷流水或滥用优惠行为\n\n🔥 所有分数一律 BURN\n\n📋 平台保留最终决定权 | constants.py | — |

---

## Category: SUPPORT (Live Chat)

| message_key | default_text | location | variables |
|---|---|---|---|
| `support_not_registered` | 您尚未注册。请发送 /start 开始注册。 | handlers/user/livechat.py:170 | — |
| `support_account_frozen` | ❌ 您的账号已被冻结，无法联系客服。 | handlers/user/livechat.py:173 | — |
| `support_session_exists` | ⚠️ 您已有进行中的客服会话。\n\n会话编号：#{session_id}\n\n请直接发送消息继续沟通。 | handlers/user/livechat.py:234 | session_id |
| `support_menu` | 💬 联系客服\n\n请描述您遇到的问题。\n\n支持：\n✅ 文字\n✅ 图片\n✅ 文件\n✅ 语音\n\n客服会尽快回复您。 | handlers/user/livechat.py:183 | — |
| `support_cancelled` | ❌ 已取消客服请求。 | handlers/user/livechat.py:204 | — |
| `support_system_busy` | ⚠️ 系统繁忙，请稍后重试。 | handlers/user/livechat.py:276 | — |
| `support_submitted` | ✅ 客服请求已提交\n\n会话编号：\n#{session_id}\n\n客服将尽快为您服务。\n\n请保持在线。 | handlers/user/livechat.py:374 | session_id |
| `support_agent_joined` | ✅ 客服已接入您的会话。\n\n请直接发送消息与客服沟通。 | handlers/admin/livechat_agent.py:156 | — |
| `support_session_closed_user` | 🔚 客服会话已结束\n\n会话编号：\n#{session_id}\n\n如需再次咨询，\n请点击「📞 联系客服」。 | handlers/admin/livechat_agent.py:241 | session_id |

---

## Category: HISTORY

| message_key | default_text | location | variables |
|---|---|---|---|
| `history_deposit_empty` | 📜 充值记录\n\n暂无充值记录。 | handlers/user/transaction_history.py:37 | — |
| `history_deposit_header` | 📜 充值记录（最近 10 条） | handlers/user/transaction_history.py:40 | — |
| `history_withdraw_empty` | 📜 提款记录\n\n暂无提款记录。 | handlers/user/transaction_history.py:67 | — |
| `history_withdraw_header` | 📜 提款记录（最近 10 条） | handlers/user/transaction_history.py:70 | — |

---

## Category: MENU (Main keyboard buttons)

| message_key | default_text | location | type |
|---|---|---|---|
| `btn_my_profile` | 📋 我的资料 | keyboards/game_accounts.py | BUTTON |
| `btn_game_accounts` | 🎮 我的游戏账号 | keyboards/game_accounts.py | BUTTON |
| `btn_deposit` | 💰 充值 | keyboards/common.py | BUTTON |
| `btn_withdraw` | 💸 提款 | keyboards/common.py | BUTTON |
| `btn_deposit_history` | 📜 充值记录 | keyboards/common.py | BUTTON |
| `btn_withdraw_history` | 📜 提款记录 | keyboards/common.py | BUTTON |
| `btn_promotions` | 🎁 优惠中心 | keyboards/promotions.py | BUTTON |
| `btn_my_promotions` | 🎁 我的优惠 | keyboards/promotions.py | BUTTON |
| `btn_change_account` | 🔄 更换游戏账号 | keyboards/game_accounts.py | BUTTON |
| `btn_support` | 📞 联系客服 | keyboards/livechat.py | BUTTON |
| `btn_back` | ⬅️ 返回 | keyboards/common.py | BUTTON |
| `btn_home` | 🏠 主菜单 | keyboards/common.py | BUTTON |
| `btn_cancel` | ❌ 取消 | keyboards/common.py | BUTTON |
| `btn_register` | ✅ 注册会员 | keyboards/registration.py | BUTTON |
| `btn_no_promo` | 无优惠 | keyboards/deposit.py | BUTTON |
| `btn_calculate_bonus` | 🧮 计算奖金 | keyboards/promotions.py | BUTTON |
| `btn_deposit_now` | 💰 立即充值 | keyboards/promotions.py | BUTTON |
| `btn_back_to_promos` | ⬅️ 返回优惠列表 | keyboards/promotions.py | BUTTON |
| `btn_recalculate` | 🔄 重新计算 | keyboards/promotions.py | BUTTON |

---

## Category: PROFILE

| message_key | default_text | location | variables |
|---|---|---|---|
| `profile_header` | 👤 会员资料 | utils/formatters.py:53 | — |
| `profile_phone` | 📱 电话号码：{phone} | utils/formatters.py:54 | phone |
| `profile_bank_name` | 🏦 银行名称：{bank_name} | utils/formatters.py:55 | bank_name |
| `profile_bank_account` | 💳 银行账号：{bank_account} | utils/formatters.py:56 | bank_account |
| `profile_holder_name` | 👤 户口姓名：{bank_holder_name} | utils/formatters.py:57 | bank_holder_name |
| `profile_registered_at` | 📅 注册时间：{registered_at} | utils/formatters.py:58 | registered_at |
| `profile_game_accounts_header` | 🎮 游戏平台账号 | utils/formatters.py:71 | — |
| `profile_no_accounts` | 尚未领取任何账号 | utils/formatters.py:71 | — |
| `profile_unclaimed` | 尚未领取：{providers} | utils/formatters.py:82 | providers |

---

## Summary

| Category | Count |
|---|---|
| WELCOME | 4 |
| REGISTER | 17 |
| DEPOSIT | 21 |
| WITHDRAW | 12 |
| GAME | 11 |
| BONUS/PROMO | 10 |
| SUPPORT | 9 |
| HISTORY | 4 |
| MENU/BUTTON | 19 |
| PROFILE | 9 |
| **Total** | **116** |

## Variables Used Across All Messages

| Variable | Description |
|---|---|
| `{first_name}` | User's first name from Telegram |
| `{phone}` | User's registered phone number |
| `{bank_name}` | Bank or e-wallet name |
| `{bank_account}` | Bank account number |
| `{bank_holder_name}` | Bank account holder name |
| `{provider}` | Game platform name (e.g. SCR888, Mega888) |
| `{game_username}` | Game account username |
| `{password}` | Game account password |
| `{amount}` | Transaction amount (RM) |
| `{promo_name}` | Promotion name |
| `{min_deposit}` | Minimum deposit amount |
| `{min_amount}` | Minimum withdrawal amount |
| `{req_id}` | Request/transaction ID |
| `{session_id}` | Live chat session ID |
| `{cooldown_hours}` | Hours until account change allowed |
| `{next_time}` | Next allowed change time |
| `{old_username}` | Previous game account username |
| `{new_username}` | New game account username |
| `{new_password}` | New game account password |
| `{providers}` | List of unclaimed game platforms |
| `{credit_block}` | Formatted bonus credit block |
| `{current_info}` | Current account info block |
| `{hint}` | Optional hint text |
| `{brand_name}` | *(to be added)* Platform brand name from system_settings |
