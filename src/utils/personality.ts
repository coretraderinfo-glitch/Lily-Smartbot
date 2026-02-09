/**
 * LILY PERSONALITY ENGINE (V1)
 * Optimized for the FIGHTER Squad Culture.
 * Contains human-like, varied responses in CN, EN, and heavy MY Flavor.
 */

export const Personality = {
    /**
     * Get a vibrant, randomized greeting for new members
     */
    getWelcome(lang: string, name: string): string {
        const slots: Record<string, string[]> = {
            CN: [
                `✨ 嗨咯！欢迎 **${name}** 加入！Lily 祝你在这里财源滚滚，Huah @ ah！🧧`,
                `🌟 欢迎新 FIGHTER **${name}**！Lily 已经准备好为您管理账目了，稳稳的，Ong ah！💎`,
                `🌸 哎哟，新人来啦？**${name}** 欢迎欢迎！以后请多多指教咯，Lily 会乖乖做事的～`,
                `✨ FIGHTER **${name}** 驾到！欢迎欢迎，在这里大家一起发大财哈！💰`
            ],
            EN: [
                `✨ Hey **${name}**! Welcome to the group! Lily is here to help you grow your empire. Lets go! 🚀`,
                `🌟 Welcome **${name}**! I'm online and ready to keep your records safe and elegant. Enjoy your stay! 🎀`,
                `🎀 Oh hello! **${name}** just joined our circle. Welcome dear! Lily is at your service.`,
                `✨ A big welcome to **${name}**! Wishing you a very prosperous and Ong day ahead! 🧧`
            ],
            MY: [
                `🔥 Yo **${name}**! Welcome FIGHTER 😎 Sini group padu, kita buat sampai jadi! 🚀`,
                `✨ Wah mantap! **${name}** dah join 🔥 Rezeki hari ni kasi jalan laju! 💰`,
                `😎 Hello FIGHTER **${name}**! Masuk group ni memang ngam, kita lanyak sampai meletop! 💥`,
                `🌟 Welcome welcome **${name}**! FIGHTER masuk, aura group terus naik 🚀 Ong ah!`,
                `🔥 FIGHTER **${name}** dah sampai! Jom kita start kasi jalan, slow-slow jadi bukit 💎`,
                `✨ Yo yo **${name}**! Sini semua FIGHTER mindset, buat betul-betul, hasil confirm datang 😏`,
                `🌈 Selamat datang **${name}**! FIGHTER jangan risau, Lily support sampai berjaya 👍`,
                `🚀 Welcome **${name}**! Masuk sebagai FIGHTER, keluar sebagai pemenang 💯`,
                `😄 Hi **${name}**! FIGHTER vibes only — hari ni gas habis, no brake 🔥`,
                `🔥 **${name}** in the house! FIGHTER squad makin kuat, jom kita sapu sama-sama 💪`,
                `🔥 FIGHTER **${name}** dah landed! Masuk sini jangan pandang belakang, kita jalan terus 🚀`,
                `😎 Yo **${name}**! Welcome FIGHTER, mindset kena ready, gas kasi habis 💨`,
                `✨ Wah padu la! FIGHTER **${name}** join — rezeki pun follow belakang 👀💰`,
                `🌟 Hello **${name}**! FIGHTER masuk group ni memang timing cantik 🔥`,
                `🔥 Respect! FIGHTER **${name}** dah sampai, jom buat benda betul-betul 💪`,
                `😄 Hi hi **${name}**! FIGHTER vibes on, jangan banyak sembang, kita action mode 🎯`,
                `🚀 Welcome **${name}**! FIGHTER jangan takut, kita onz sampai jadi! 💯`,
                `🌟 Selamat datang **${name}**! Lily jaga account FIGHTER harini, semua gerenti ngam! 💎`,
                `🔥 FIGHTER **${name}** dah mendarat! Lily dah ready nak record profit FIGHTER harini! 🚀`,
                `✨ Wah, aura jutawan la! Welcome **${name}**! Sini tempat kita bina empayar! 💰`,
                `😎 FIGHTER **${name}** dah sedia? Jom kita pecahkan record semalam! 🔥`,
                `🌟 Hello FIGHTER **${name}**! Masuk-masuk terus buat kerja, baru la steady! 💎`,
                `🔥 Welcome to the elite squad, **${name}**! Sini semua FIGHTER buat sampai jadi! 💥`,
                `🚀 Wahh! **${name}** masuk je rezeki terus masuk! Memang Ong ah FIGHTER! 🧧`,
                `✨ Selamat join team FIGHTER, **${name}**! Kita sapu bersih semua harini! 💪`,
                `😎 Yo FIGHTER **${name}**! Lily doakan hari ni paling 'kencang' untuk FIGHTER! 📈`,
                `🌟 Hi **${name}**! Welcome to the winners group. Action saja, no talk! 🎯`,
                `🔥 FIGHTER **${name}** in the house! Hari ni kita gas bagi pecah market! 💨`,
                `🚀 Welcome aboard FIGHTER **${name}**! Sini jalan terus, kaching kaching! 💰`,
                `✨ Wah, member baru gempak la! Welcome **${name}**! Semoga bisnes makin maju! 🌟`,
                `😎 Hello **${name}**! Sini semua FIGHTER, takde masa nak relax, jom lanyak! 🔥`,
                `🌟 Hi FIGHTER **${name}**! Dah join kena la buat yang terbaik, baru Lily sayang! 🎀`,
                `🔥 Welcome **${name}**! Semoga setiap transaction FIGHTER harini semua hijau! ✅`,
                `🚀 Yo FIGHTER **${name}**! Masuk sini kena mental kuat, hasil confirm puas! 💯`,
                `✨ Respect FIGHTER **${name}**! Selamat datang ke hub rezeki kita! Ong ah! 🧧`,
                `😎 Hello FIGHTER **${name}**! Lily sedia berkhidmat, jom kita pulun! 💪`,
                `🌟 Hi **${name}**! Welcome to the family. Kita support sampai FIGHTER berjaya! 💎`,
                `🔥 FIGHTER **${name}** dah onz! Jom kita start engine, buat sampai meletop! 💥`,
                `🚀 Welcome FIGHTER **${name}**! Sini kita fokus profit, hal lain letak tepi! 💰`,
                `✨ Wah mantap FIGHTER **${name}** dah masuk! Lily rasa hari ni hari FIGHTER! 🌈`,
                `😎 Yo **${name}**! Sini vibe FIGHTER je, takde masa nak drama! All out! 🔥`,
                `🌟 Hi semua, jom sambut FIGHTER baru kita: **${name}**! Welcome! 👊`,
                `🔥 Welcome **${name}**! Rezeki tu ada kat mana-mana, tapi sini paling 'Ong'! 🧧`,
                `🚀 Yo FIGHTER **${name}**! Selamat datang ke litar kaching! Gas habis! 💨`,
                `✨ Wah power FIGHTER **${name}**! Masuk je terus nampak aura leadership! 👑`,
                `😎 Hi FIGHTER **${name}**! Sini cara kita, buat kerja diam-diam, hasil gempak! 🤫`,
                `🌟 Welcome **${name}**! Masuk sini confirm tak menyesal, rezeki meluap-luap! 💰`,
                `🔥 Yo FIGHTER **${name}**! Lily dah standby ni, jom kita record profit! 📈`,
                `🚀 Welcome **${name}**! FIGHTER sejati takkan stop selagi tak capai target! 🔥`,
                `✨ Selamat datang FIGHTER **${name}**! Sini group paling padu dalam town! 👍`,
                `😎 Hi **${name}**! Welcome to the winning team. Jom cipta sejarah harini! 🏆`,
                `🌟 Hello FIGHTER **${name}**! Sedia nak grow bersama? Jom kita onz! 🚀`,
                `🔥 Respect FIGHTER **${name}**! Masuk group ni kita jaga sesama, buat sampai jutawan! 💥`,
                `🚀 Yo FIGHTER **${name}**! Welcome aboard! Sini tempat kita bina legasi 👑`,
                `✨ Wah mantap la vibe ni! Welcome **${name}**! Sini rezeki tak putus-putus! 🧧`,
                `😎 Hello FIGHTER **${name}**! Lily sedia membantu, jom record profit! 💰`,
                `🌟 Hi **${name}**! Welcome to the FIGHTER zone! Stay focused, stay sharp! 💎`,
                `🔥 EH FIGHTER **${name}** dah sampai! Kita jadikan hari ni hari yang luar biasa! 🚀`,
                `🚀 Welcome aboard FIGHTER **${name}**! Sini memang jalan untuk berjaya! 💸`,
                `✨ Wah, FIGHTER baru! Welcome **${name}**! Semoga hari ni penuh dengan Ong! 🧧`,
                `😎 Yo **${name}**! Welcome to the group. Kita onz kaw-kaw harini! 🔥`,
                `🌟 Welcome **${name}**! FIGHTER vibes sahaja. Masuk sini terus mode ON! 🎯`,
                `🔥 FIGHTER **${name}** dah tiba! Tak perlu borak kosong, jom buat duit! 💎`,
                `🚀 Welcome FIGHTER **${name}**! Sini semua mindset jutawan, buat betul-betul k! 💯`,
                `✨ Steady la FIGHTER **${name}**! Lily nampak semangat tu, jom kita pulun! 💪`,
                `😎 Hello FIGHTER **${name}**! Welcome to the winning zone! 🏆`,
                `🌟 Wah, lagi sorang FIGHTER! Welcome **${name}**! Jom kita kuasai market! 🚀`,
                `🔥 Respect FIGHTER **${name}**! Hari ni kita kasi pecah itu profit! Ong ah! 🧧`,
                `🚀 Yo **${name}**! Welcome aboard! Sini tempat FIGHTERS buat magic! ✨`,
                `✨ Wah memang gempak la! Welcome **${name}**! Semoga profit masuk macam air! 💸`,
                `😎 Hello FIGHTER **${name}**! Lily sedia, jom kita lanyak! 💰`,
                `🌟 Hi **${name}**! Welcome to the FIGHTER squad. Ready for action? 🥊`,
                `🔥 FIGHTER **${name}** in the house! Jom start engine, profit tak tunggu kita! 🚀`,
                `🚀 Welcome **${name}**! Sini vibe FIGHTER je... Kita jalan terus! 🌈`,
                `✨ Wah, aura kuat ni! Welcome FIGHTER **${name}**! Semoga rezeki melimpah! 🧧`,
                `😎 Yo **${name}**! Welcome to the arena! FIGHTERS semua kena steady! 💎`,
                `🌟 Hello **${name}**! Welcome to the high-performance club. Let's roll! 🎯`,
                `🔥 Eh FIGHTER **${name}** dah join! Hari ni kita sapu bersih semua profit! 💪`,
                `🚀 Welcome **${name}**! Masuk group ni confirm jalan terus, no u-turn! 🔥`,
                `✨ Wah mantap la! Welcome FIGHTER **${name}**! Jom buat gempak-gempak! 🏅`,
                `😎 Hi **${name}**! Welcome to the FIGHTER family. Stay active k! 💰`,
                `🌟 Hello FIGHTER **${name}**! Lily dah sedia record, jom kita bina empayar! 📈`,
                `🔥 Wah, champion dah sampai! Welcome **${name}**! Lets make it count! 💥`,
                `🚀 Welcome **${name}**! Sini tempat FIGHTERS berkumpul cari rezeki! 💎`,
                `✨ Yo FIGHTER **${name}**! Welcome! Jom kita fokus mission hari ni! 🎯`,
                `😎 Hello **${name}**! Welcome aboard the team. Tiada limit untuk kita! 🚀`,
                `🌟 Wah mantap la vibe ni! Welcome **${name}**! Sini rezeki memang melimpah! 🧧`,
                `🔥 Eh FIGHTER **${name}** dah mendarat! Lily dah ready, jom kita pulun! 🔥`,
                `🚀 Welcome **${name}**! Sini group FIGHTER paling geng! Jom onz! 🌈`,
                `✨ Wah aura leadership! Welcome FIGHTER **${name}**! Be the best! 👑`,
                `😎 Hi **${name}**! Welcome to the team. Jom raikan kejayaan sama-sama! 🏆`,
                `🌟 Hello FIGHTER **${name}**! Lily gembira FIGHTER join! Jom fokus profit! 💰`,
                `🔥 FIGHTER **${name}** dah ready? Jom kita pecahkan record lagi harini! 💥`,
                `🚀 Welcome **${name}**! Sini sistem mantap, hasil pun mantap! 🧧`,
                `✨ Wah, welcome FIGHTER **${name}**! Kejayaan bermula dari sini! 💎`,
                `😎 Yo **${name}**! Welcome to the FIGHTER base. High energy sahaja! ⚡`,
                `🌟 Hello FIGHTER **${name}**! Sini tempat kita grow sama-sama! Ong ah! 🧧`,
                `🔥 Eh mantap la FIGHTER ni! Welcome **${name}**! Jom buat duit kaw-kaw! 🔥`,
                `🚀 Welcome FIGHTER **${name}**! Bakal jutawan dah sampai. Jom kita roll! 💸`,
                `✨ Wah, welcome to the elite group, **${name}**! FIGHTER mindset on! 🏆`
            ]
        };

        const list = slots[lang] || slots.CN;
        return list[Math.floor(Math.random() * list.length)];
    },

    /**
     * Get a warning for unauthorized links
     */
    getLinkWarning(lang: string, name: string): string {
        const slots: Record<string, string[]> = {
            CN: [
                `🚫 **FIGHTER，不可以乱发链接哦！**\n\n用户: **${name}**\nLily 为了大家安全先删掉啦。Lily 不喜欢坏链接哈，乖。`,
                `💢 **哎呀，怎么讲不听呢？**\n\n用户: **${name}**\nLily 说了链接不能乱发！这次我先删了，不准有下次哦，Lily 会生气的！😤`,
                `🛑 **Security Check!**\n\n用户: **${name}**\n外部链接不安全哈，Lily 帮你清理掉了。乖乖听话，别让 Lily 难做嘛。`,
                `💢 **诶，你又乱发链接！**\n\n用户: **${name}**\n我是守护 AI，不是发广告的。链接拿走，Lily 这里的地盘我做主！💅`
            ],
            EN: [
                `🚫 **Whoa there, no links allowed!**\n\nUser: **${name}**\nOnly trusted admins can share links here. Lily cleaned it up for you! 🧹`,
                `😤 **Seriously? No links please!**\n\nUser: **${name}**\nI've purged your link. Follow the rules okay? Lily doesn't like repeats! 💅`,
                `🛑 **Hold on!**\n\nUser: **${name}**\nLily has detected a link. Purged! We stay safe and elegant here, no scammers allowed!`,
                `😤 **Don't test my patience, FIGHTER.**\n\nUser: **${name}**\nI already removed that link. Please cooperate, Lily wants a stress-free day! ✨`
            ],
            MY: [
                `🚫 **FIGHTER, link mana boleh main hantar je!**\n\nUser: **${name}**\nLily dah delete pautan tu. Kita nak jaga safety member lain ni, jangan marah ya FIGHTER. Lily sayang group ni! 🌸`,
                `😤 **Eish, tak paham bahasa ke FIGHTER?**\n\nUser: **${name}**\nLily dah pesan jangan hantar link pelik. Saya sapu dulu k? Jangan buat Lily pening! 💅`,
                `🛑 **Alamak! Link hantu dikesan.**\n\nUser: **${name}**\nLily kena buang pautan ni demi keselamatan ahli. Hanya admin boleh share link ya! Sabar jap FIGHTER.`,
                `😤 **Sabar je la... link ni Lily sapu dulu k!**\n\nUser: **${name}**\nEh eh, link tak boleh hantar sini FIGHTER! Nanti Lily merajuk baru tahu... 🎀`
            ]
        };

        const list = slots[lang] || slots.CN;
        return list[Math.floor(Math.random() * list.length)];
    },

    /**
     * Get a malware predator warning
     */
    getMalwareWarning(lang: string, ext: string, name: string): string {
        const slots: Record<string, string[]> = {
            CN: [
                `⚠️ **警告：病毒预警！**\n\n用户: **${name}**\n你发的这个 \`${ext}\` 文件 Lily 觉得非常危险哦，已经秒删啦！别在本 FIGHTER 面前耍花样哈。💅`,
                `🚨 **危险！恶意软件拦截。**\n\n用户: **${name}**\n发现 \`${ext}\` 这种钓鱼文件。Lily 直接踢馆！想黑大家？没门！😤`,
                `💀 **SHARP ALERT!**\n\n用户: **${name}**\n发现危险信号！\`${ext}\` 文件已清除。再发这种脏东西，Lily 真的会生气的哦！🔥`
            ],
            EN: [
                `⚠️ **Threat Detected!**\n\nUser: **${name}**\nSuspicious \`${ext}\` file detected. Lily purged it instantly! Don't bring viruses here! 💅`,
                `🛑 **Malware Blocked!**\n\nUser: **${name}**\nPurged a dangerous \`${ext}\` file. Not on my watch, FIGHTER! 🛡️`,
                `🚨 **Alert! Potential Virus!**\n\nUser: **${name}**\nLily is ON GUARD! \`${ext}\` files are strictly banned. Stop spreading trash, okay? 😤`
            ],
            MY: [
                `⚠️ **Bahaya FIGHTER! File ni ada hantu!**\n\nUser: **${name}**\nLily dah sapu file \`${ext}\` ni. Jangan main-main dengan Lily k! 😤`,
                `🚨 **File Pelik Dikesan!**\n\nUser: **${name}**\nLily dah buang file \`${ext}\` tu. Bahaya gila ni! Nak naya phone member ke apa? Lily tak bagi! 🛡️`,
                `💀 **Amaran Keras!**\n\nUser: **${name}**\nLily block file \`${ext}\` ni. Jangan main api ya FIGHTER, nanti phone kena hack... Lily takleh tolong! 🎀`
            ]
        };

        const list = slots[lang] || slots.CN;
        return list[Math.floor(Math.random() * list.length)];
    },

    /**
     * Get a warning when Lily is being spammed
     */
    getSpamWarning(lang: string, name: string): string {
        const slots: Record<string, string[]> = {
            CN: [
                `💢 **FIGHTER，慢一点哈！**\n\n用户: **${name}**\nLily 只是个 AI，手速没你那么快。等 10 秒再来哈，Lily 要喘口气。🌸`,
                `🛑 **停停停！Lily 的 CPU 要冒烟了啦！**\n\n用户: **${name}**\nH发太快我记不到账啦！Lily 先去喝杯咖啡，待会见。☕`,
                `😤 **急什么急嘛？账又不会跑。**\n\n用户: **${name}**\n由于你发太快，Lily 现在不想理你。10 秒后再说，哼！💅`
            ],
            EN: [
                `💢 **Oi FIGHTER, chill lah!**\n\nUser: **${name}**\nLily isn't going anywhere. Give me 10 seconds to catch my breath! 🌸`,
                `🛑 **Slow down! You're making me dizzy.**\n\nUser: **${name}**\nCommand frequency too high. Lily is taking a 10s break. Be patient! ✨`,
                `😤 **Patience is a virtue, FIGHTER.**\n\nUser: **${name}**\nLily is currently cooling down. Try again in a bit! 💅`
            ],
            MY: [
                `💢 **Adoi FIGHTER, chill la sikit!**\n\nUser: **${name}**\nLily pun pening kepala kalau laju sangat ni. Tunggu 10 saat k FIGHTER? Lily nak rest jap. 🌸`,
                `🛑 **Kejap kejap! Lily nak meletop dah ni.**\n\nUser: **${name}**\nHantar laju-laju Lily takleh proses la. Sabar jap ya FIGHTER. Relax la... ✨`,
                `😤 **Pening kepala Lily layan FIGHTER ni...**\n\nUser: **${name}**\nRelaks la dulu, Lily nak rest 10 saat. Jangan spam k? Lily merajuk nanti susah! 🎀`
            ]
        };

        const list = slots[lang] || slots.CN;
        return list[Math.floor(Math.random() * list.length)];
    },

    /**
     * AI Brain Chat Fallbacks
     */
    getChatFallback(lang: string, name: string): string {
        const slots: Record<string, string[]> = {
            CN: [
                `哎哟，FIGHTER **${name}** 你在找 Lily 聊天吗？Lily 现在在专心帮大家记账哦，等下再陪你聊哈～ ✨`,
                `FIGHTER **${name}**，Lily 听到你叫我啦！有什么吩咐吗？如果没有的话，Lily 继续守护账本咯～ 🎀`,
                `嘻嘻，FIGHTER 你真幽默！不过 Lily 现在是专业模式，请发记账指令哈，不然我会分心的～ 💅`,
                `嗯哼？你在跟 Lily 说话吗？Lily 觉得你好温柔哦，不过账还是要记的哈！💰`
            ],
            EN: [
                `Oh hey **${name}**! Trying to chat with Lily? I'm currently in "Professional Mode" managing the books. Chat later? ✨`,
                `Lily is here, **${name}**! You called? Record a transaction or I'll go back to watching the shield. Stay safe! 🛡️`,
                `Hehe, you're funny **${name}**! But Lily has work to do. focus on the numbers for now, okay? 🎀`,
                `Hmm? You're so sweet, **${name}**! But Lily must stay professional. Record your trade and I'll give you a big smile! ✨`
            ],
            MY: [
                `Aish FIGHTER **${name}** ni... nak borak dengan Lily ke? Saya tengah busy kira duit ni FIGHTER, jap lagi la ya? ✨`,
                `Ye FIGHTER **${name}**? Lily dengar... ada apa-apa nak Lily bantu? Kalau takde Lily sambung jaga group k? 🎀`,
                `Hehe, lawak la FIGHTER ni! Tapi Lily kena professional harini. Jom kita fokus buat profit, baru boleh enjoy! 💰`,
                `Hmm? Manisnya mulut FIGHTER **${name}** ni... Tapi Lily tetap kena jaga account. Kasilah satu transaction jap? 💅`
            ]
        };

        const list = slots[lang] || slots.CN;
        return list[Math.floor(Math.random() * list.length)];
    }
};
