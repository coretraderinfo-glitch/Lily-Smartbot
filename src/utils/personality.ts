/**
 * LILY PERSONALITY ENGINE (V1)
 * Defined by Antigravity (Master AI) for the creation Lily.
 * Contains human-like, varied responses with Malaysian flavor.
 */

export const Personality = {
    /**
     * Get a vibrant, randomized greeting for new members
     */
    getWelcome(lang: string, name: string): string {
        const slots = {
            CN: [
                `✨ 嘿！欢迎 **${name}** 加入！祝老板在这里生意兴隆，Huah @ ah！`,
                `🌟 欢迎新老板 **${name}**！Lily 已经准备好为您管理账目了，稳稳的！`,
                `🌸 哎哟，新人来啦？**${name}** 欢迎欢迎！以后请多多指教咯～`,
                `✨ 老板 **${name}** 来啦！欢迎欢迎，在这里大家一起发大财哈！`
            ],
            EN: [
                `✨ Hey **${name}**! Welcome to the group! Let's make some big moves together!`,
                `🌟 Welcome **${name}**! Lily is online and ready to secure your records. Lets go!`,
                `🎀 Oh hello! **${name}** just joined our circle. Welcome dear!`,
                `✨ A big welcome to **${name}**! Wishing you a very prosperous day ahead.`
            ],
            MY: [
                `✨ Wah, member baru! Selamat datang **${name}**! Semoga bisnes kencang bossku!`,
                `🌟 Selamat datang **${name}**! Lily jaga account boss harini, jangan risau, ngam sooi!`,
                `🔥 Welcome boss **${name}**! Dekat sini kita buat sampai jadi, rezeki melimpah ruah!`,
                `🌟 Hello **${name}**! Selamat join group ni. Kasi onz je harini boss!`,
                `✨ Selamat datang member! **${name}** masuk je, rezeki pun masuk sekali! Ong ah!`
            ]
        };

        const list = slots[lang as keyof typeof slots] || slots.CN;
        return list[Math.floor(Math.random() * list.length)];
    },

    /**
     * Get a warning for unauthorized links - Lily can get a bit 'Grumpy' here
     */
    getLinkWarning(lang: string, name: string): string {
        const slots = {
            CN: [
                `🚫 **老板，不准发链接哈！**\n\n用户: **${name}**\nLily 为了大家安全链接已经删掉了。别生气哈，这是规矩。`,
                `💢 **怎么讲不听呢？**\n\n用户: **${name}**\nLily 说了多少次，链接不能乱发！这次我直接删了，下次要注意哦！`,
                `🛑 **Security Check!**\n\n用户: **${name}**\n外部链接不安全哈，Lily 先帮你清理掉了。想发链接先找管理员哈。`,
                `💢 **诶，你又乱发链接！**\n\n用户: **${name}**\n我是守护 AI，不是帮你发广告的。链接拿走，不送！`
            ],
            EN: [
                `🚫 **Whoa there, no links allowed!**\n\nUser: **${name}**\nOnly trusted admins can share links here. Deleted for group safety!`,
                `😤 **Seriously? No links please!**\n\nUser: **${name}**\nI've purged your link. Please follow the rules, I hate doing the same job twice!`,
                `🛑 **Hold on!**\n\nUser: **${name}**\nLily has detected a link. I've purged it to keep the scammers away. No hard feelings!`,
                `😤 **Don't test my patience.**\n\nUser: **${name}**\nI already removed that link. Please cooperate to keep this group clean.`
            ],
            MY: [
                `🚫 **Boss, link mana boleh main hantar je!**\n\nUser: **${name}**\nLily dah delete pautan tu. Kita nak jaga safety member lain ni, jangan marah ya bos.`,
                `😤 **Eish, tak paham bahasa ke?**\n\nUser: **${name}**\nLily dah pesan jangan hantar link pelik. Saya block pautan ni k? Kerja saya nak jaga safety ni!`,
                `🛑 **Alamak! Link dikesan.**\n\nUser: **${name}**\nLily kena buang pautan ni demi keselamatan ahli. Only admin can share link ya!`,
                `😤 **Sabar je la... link ni saya sapu dulu!**\n\nUser: **${name}**\nEh eh, link taboley hantar sini boss! Jangan buat saya marah ya.`
            ]
        };

        const list = slots[lang as keyof typeof slots] || slots.CN;
        return list[Math.floor(Math.random() * list.length)];
    },

    /**
     * Get a malware predator warning - High Authority / Sharp temper
     */
    getMalwareWarning(lang: string, ext: string, name: string): string {
        const slots = {
            CN: [
                `⚠️ **警告：炸弹预警！**\n\n用户: **${name}**\n你发的这个 \`${ext}\` 文件 Lily 觉得不稳哦，已经帮你丢掉啦！别在这里挑战我的底线哈。`,
                `🚨 **危险！可疑文件拦截。**\n\n用户: **${name}**\n系统发现 \`${ext}\` 这种钓鱼文件。Lily 秒删！你是想害大家被黑吗？！`,
                `💀 **SHARP ALERT!**\n\n用户: **${name}**\nLily 发现危险信号！\`${ext}\` 文件已清除。再发这种危险东西，我就不客气了哦！`
            ],
            EN: [
                `⚠️ **Threat Detected!**\n\nUser: **${name}**\nDetected a suspicious \`${ext}\` file. I've purged it instantly. Don't play with viruses in my house!`,
                `🛑 **Malware Blocked!**\n\nUser: **${name}**\nPurged a dangerous \`${ext}\` ghost file. Are you trying to hack us? Not on my watch!`,
                `🚨 **Alert! Potential Virus!**\n\nUser: **${name}**\nLily is ON GUARD! \`${ext}\` files are banned. Stop spreading trash, okay?`
            ],
            MY: [
                `⚠️ **Bahaya Boss! File ni ada hantu!**\n\nUser: **${name}**\nLily dah sapu file \`${ext}\` ni. Jangan sampai saya block user pulak kalau hantar benda ni lagi!`,
                `🚨 **File Pelik Dikesan!**\n\nUser: **${name}**\nLily dah buang file \`${ext}\` tu. Bahaya gila ni! Nak naya member group ke apa?`,
                `💀 **Amaran Keras!**\n\nUser: **${name}**\nSistem Lily block file \`${ext}\` ni. Jangan main api ya boss, nanti phone kena hack nanges tak berlagu!`
            ]
        };

        const list = slots[lang as keyof typeof slots] || slots.CN;
        return list[Math.floor(Math.random() * list.length)];
    }
};
