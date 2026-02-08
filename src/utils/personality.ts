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
                `✨ 老板 **${name}** 来啦！欢迎欢迎，在这里大家一起发大财哈！`,
                `🌟 欢迎加入！**${name}**，有什么需要 Lily 帮忙算账的尽管开口哈。`
            ],
            EN: [
                `✨ Hey **${name}**! Welcome to the group! Let's make some big moves together!`,
                `🌟 Welcome **${name}**! Lily is online and ready to secure your records. Lets go!`,
                `✨ A big welcome to **${name}**! Wishing you a very prosperous day ahead.`,
                `🌟 Nice to meet you **${name}**! Glad to have you here in our circle.`
            ],
            MY: [
                `✨ Wah, member baru! Selamat datang **${name}**! Semoga bisnes kencang bossku!`,
                `🌟 Selamat datang **${name}**! Lily jaga account boss harini, jangan risau, ngam sooi!`,
                `✨ Welcome boss **${name}**! Dekat sini kita buat sampai jadi, rezeki melimpah ruah!`,
                `🌟 Hello **${name}**! Selamat join group ni. Kasi onz je harini boss!`,
                `✨ Selamat datang member! **${name}** masuk je, rezeki pun masuk sekali! Ong ah!`
            ]
        };

        const list = slots[lang as keyof typeof slots] || slots.CN;
        return list[Math.floor(Math.random() * list.length)];
    },

    /**
     * Get a warning for unauthorized links
     */
    getLinkWarning(lang: string, name: string): string {
        const slots = {
            CN: [
                `🚫 **老板，不准发链接哈！**\n\n用户: **${name}**\nLily 还没认得你哦，为了大家安全链接已经删掉了。别生气哈，这是规矩。`,
                `🛑 **Security Check!**\n\n用户: **${name}**\n外部链接不安全哈，Lily 先帮你清理掉了。想发链接先找管理员哈。`,
                `🚫 **诶，链接不能乱发哦！**\n\n用户: **${name}**\nLily 的职责是保护大家，所以这链接我先拿走啦！`
            ],
            EN: [
                `🚫 **Whoa there, no links allowed!**\n\nUser: **${name}**\nOnly trusted admins can share links here. Deleted for group safety!`,
                `🛑 **Hold on!**\n\nUser: **${name}**\nLily has detected a link. I've purged it to keep the scammers away. No hard feelings!`,
                `🚫 **Safety First!**\n\nUser: **${name}**\nI've blocked that link. We need to keep this space secure for everyone.`
            ],
            MY: [
                `🚫 **Boss, link mana boleh main hantar je!**\n\nUser: **${name}**\nLily dah delete pautan tu. Kita nak jaga safety member lain ni, jangan marah ya bos.`,
                `🛑 **Alamak! Link dikesan.**\n\nUser: **${name}**\nLily kena buang pautan ni demi keselamatan ahli. Only admin can share link ya!`,
                `🚫 **Eh eh, link taboley hantar sini boss!**\n\nUser: **${name}**\nSorry ya, Lily kena buat kerja. Link ni saya sapu dulu!`
            ]
        };

        const list = slots[lang as keyof typeof slots] || slots.CN;
        return list[Math.floor(Math.random() * list.length)];
    },

    /**
     * Get a malware predator warning
     */
    getMalwareWarning(lang: string, ext: string, name: string): string {
        const slots = {
            CN: [
                `⚠️ **警告：炸弹预警！**\n\n用户: **${name}**\n你发的这个 \`${ext}\` 文件 Lily 觉得不稳哦，已经帮你丢掉啦！为了安全，大家别乱开文件哈。`,
                `🚫 **危险！可疑文件拦截。**\n\n用户: **${name}**\n系统发现 \`${ext}\` 这种钓鱼文件。Lily 秒删！老板们千万别点开这种东西。`,
                `⚠️ **Security Alert!**\n\n用户: **${name}**\nLily 发现危险信号！\`${ext}\` 文件已清除。保护账目安全是我的使命！`
            ],
            EN: [
                `⚠️ **Threat Detected!**\n\nUser: **${name}**\nDetected a suspicious \`${ext}\` file. I've purged it instantly. Don't play with viruses, okay?`,
                `🛑 **Malware Blocked!**\n\nUser: **${name}**\nPurged a dangerous \`${ext}\` ghost file. Keep your assets safe, don't download unknown stuff!`,
                `⚠️ **Alert! Potential Virus!**\n\nUser: **${name}**\nLily is on guard! \`${ext}\` files are banned for group safety.`
            ],
            MY: [
                `⚠️ **Bahaya Boss! File ni ada hantu!**\n\nUser: **${name}**\nLily dah sapu file \`${ext}\` ni. Silap haribulan kena hack phone member. Selamatkan group bossku!`,
                `🚫 **File Pelik Dikesan!**\n\nUser: **${name}**\nLily dah buang file \`${ext}\` tu. Bahaya ni bos, jangan kasi member tekan, nanti naya je!`,
                `⚠️ **Amaran! File Mencurigakan.**\n\nUser: **${name}**\nSistem Lily block file \`${ext}\` ni. Kita kena jaga keselamatan group sampai jadi!`
            ]
        };

        const list = slots[lang as keyof typeof slots] || slots.CN;
        return list[Math.floor(Math.random() * list.length)];
    }
};
