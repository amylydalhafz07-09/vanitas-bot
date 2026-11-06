import { makeWASocket, useMultiFileAuthState, DisconnectReason } from '@whiskeysockets/baileys';
import pino from 'pino';

let activeGame = null;
let gameRounds = 3;
let currentRound = 1;
let scores = {};
let targetAnswer = '';

// وقت تشغيل البوت بالثواني (لمنع الرد على الرسائل القديمة)
const botStartTime = Math.floor(Date.now() / 1000);

// قائمة المشرفين والنخبة
let eliteUsers = new Set();

const fruitsList = [
    { emoji: '🍎', name: 'تفاح' },
    { emoji: '🍌', name: 'موز' },
    { emoji: '🍇', name: 'عنب' },
    { emoji: '🍉', name: 'بطيخ' },
    { emoji: '🍓', name: 'فراولة' },
    { emoji: '🍍', name: 'اناناس' },
    { emoji: '🥝', name: 'كيوي' },
    { emoji: '🍑', name: 'خوخ' },
    { emoji: '🍒', name: 'كرز' },
    { emoji: '🥭', name: 'مانجو' }
];

// قائمة التفكيك: (البوت يعطي الاسم الصحيح، والجمهور يكتبه مفرّق)
const animeList = [
    { name: 'ن ا ر و ت و', original: 'ناروتو' },
    { name: 'ل و ف ي', original: 'لوفي' },
    { name: 'س ا ي ت ا م ا', original: 'سايتاما' },
    { name: 'س ا س ك ي', original: 'ساسكي' },
    { name: 'ز و ر و', original: 'زورو' },
    { name: 'غ و ك و', original: 'غوكو' },
    { name: 'ف ي ج ي ت ا', original: 'فيجيتا' },
    { name: 'ا ت ش ي ج و', original: 'اتشيجو' },
    { name: 'ك ا ك ا ش ي', original: 'كاكاشي' },
    { name: 'ا ي ت ا ت ش ي', original: 'ايتاتشي' },
    { name: 'م ا د ا ر ا', original: 'مادارا' },
    { name: 'ب ا ي ن', original: 'باين' },
    { name: 'ك ي ل و ا', original: 'كيلوا' },
    { name: 'غ و ن', original: 'غون' },
    { name: 'ك و ر و م ا', original: 'كوروما' }
];

// قائمة التجميع: (البوت يعطي الحروف مفرقة، والجمهور يجمعها كلمة واحدة)
const scrambleList = [
    { spaced: 'ت و ر ا ن', name: 'ناروتو' },
    { spaced: 'ي ف و ل', name: 'لوفي' },
    { spaced: 'ا م ا ت ي س', name: 'سايتاما' },
    { spaced: 'ي ك س ا س', name: 'ساسكي' },
    { spaced: 'و ر و ز', name: 'زورو' },
    { spaced: 'و ك و غ', name: 'غوكو' },
    { spaced: 'ا ت ي ج ي ف', name: 'فيجيتا' },
    { spaced: 'ا و ل ي ك', name: 'كيلوا' },
    { spaced: 'ن و غ', name: 'غون' },
    { spaced: 'ي ش ا ك ا ك', name: 'كاكاشي' }
];

async function startBot() {
    const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');
    
    const sock = makeWASocket({
        auth: state,
        logger: pino({ level: 'silent' }),
        browser: ['Ubuntu', 'Edge', '22.04.4']
    });

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect } = update;
        if (connection === 'close') {
            const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
            if (shouldReconnect) startBot();
        } else if (connection === 'open') {
            console.log('✨ [Vanitas Bot] متصل وجاهز بنجاح تام! 🚀');
        }
    });

    if (!sock.authState.creds.registered) {
        setTimeout(async () => {
            try {
                let code = await sock.requestPairingCode('22222508178');
                code = code?.match(/.{1,4}/g)?.join('-') || code;
                console.log('\n========================================');
                console.log('🔑 رمز الربط الخاص بك هو: ' + code);
                console.log('========================================\n');
            } catch (err) {
                console.log('خطأ في طلب الرمز:', err);
            }
        }, 4000);
    }

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('messages.upsert', async ({ messages, type }) => {
        // الرد فقط على الرسائل المباشرة الجديدة (notify)
        if (type !== 'notify') return;

        const m = messages[0];
        if (!m.message) return;

        // تجاهل أي رسائل أُرسلت قبل تشغيل البوت لمنع السبام
        const msgTimestamp = m.messageTimestamp ? (typeof m.messageTimestamp === 'number' ? m.messageTimestamp : m.messageTimestamp.low) : 0;
        if (msgTimestamp < botStartTime) return;

        const sender = m.key.remoteJid;
        const participant = m.key.participant || sender; 
        const messageType = Object.keys(m.message)[0];
        let textBody = '';
        
        if (messageType === 'conversation') {
            textBody = m.message.conversation;
        } else if (messageType === 'extendedTextMessage') {
            textBody = m.message.extendedTextMessage.text;
        }

        const isOwner = sender.includes('22222508178') || participant.includes('22222508178') || m.key.fromMe;
        const isElite = isOwner || eliteUsers.has(participant);

        if (!textBody) return;
        const args = textBody.trim().split(/\s+/);
        const command = args[0];

        // --- إدارة النخبة ---
        if (command === '.نخبه') {
            if (!isOwner) {
                await sock.sendMessage(sender, { text: '❌ هذا الأمر للمطور فانيتاس فقط!' }, { quoted: m });
                return;
            }
            const mentioned = m.message.extendedTextMessage?.contextInfo?.mentionedJid;
            if (mentioned && mentioned.length > 0) {
                const targetUser = mentioned[0];
                eliteUsers.add(targetUser);
                await sock.sendMessage(sender, { text: `👑 تم إضافة @${targetUser.split('@')[0]} إلى قائمة النخبة بنجاح!`, mentions: [targetUser] }, { quoted: m });
            } else {
                await sock.sendMessage(sender, { text: '⚠️ يرجى منشن الشخص المراد إضافته (مثال: .نخبه @منشن)' }, { quoted: m });
            }
            return;
        }

        if (command === '.نخبه_ازاله') {
            if (!isOwner) {
                await sock.sendMessage(sender, { text: '❌ هذا الأمر للمطور فانيتاس فقط!' }, { quoted: m });
                return;
            }
            const mentioned = m.message.extendedTextMessage?.contextInfo?.mentionedJid;
            if (mentioned && mentioned.length > 0) {
                const targetUser = mentioned[0];
                eliteUsers.delete(targetUser);
                await sock.sendMessage(sender, { text: `🗑️ تم إزالة @${targetUser.split('@')[0]} من قائمة النخبة.`, mentions: [targetUser] }, { quoted: m });
            } else {
                await sock.sendMessage(sender, { text: '⚠️ يرجى منشن الشخص المراد إزالته.' }, { quoted: m });
            }
            return;
        }

        // --- قائمة الأوامر المحدثة (.اوامر) ---
        if (command === '.اوامر' || command === '.menu' || command === '.أوامر') {
            const menuText = '╭━━━〔 𝖵𝖠𝖭𝖨𝖳𝖠𝖲 • 𝖡𝖮𝖳 〕━━━╮\n┃ 👑 المطورين:\n┃     فانيتاس + لونا\n┣━━━━━━━━━━━━━━━━━━━━━━\n┃ 🎮 .فواكه [عدد الجولات]\n┃ 🧩 .تفكيك [عدد الجولات]\n┃ 🔠 .تجميع [عدد الجولات]\n┃ 👑 .نخبه @منشن (للمالك)\n┃ 🗑️ .نخبه_ازاله @منشن (للمالك)\n┃ ⏹️ .ايقاف فعاليه\n╰━━━━━━━━━━━━━━━━━━━━━━╯';
            await sock.sendMessage(sender, { text: menuText }, { quoted: m });
            return;
        }

        // --- إيقاف الفعالية ---
        if (command === '.ايقاف' || command === '.ايقاف_فعالية' || command === '.ايقاف فعاليه') {
            if (!isElite) {
                await sock.sendMessage(sender, { text: '❌ هذا الأمر خاص بالمشرفين والنخبة فقط!' }, { quoted: m });
                return;
            }
            if (activeGame) {
                activeGame = null;
                scores = {};
                await sock.sendMessage(sender, { text: '🛑 تم إيقاف الفعالية الحالية تماماً بنجاح!' }, { quoted: m });
            } else {
                await sock.sendMessage(sender, { text: '⚠️ لا توجد أي فعالية شغالة حالياً.' }, { quoted: m });
            }
            return;
        }

        // --- فعالية الفواكه ---
        if (command === '.fruits' || command === '.فواكه') {
            if (!isElite) {
                await sock.sendMessage(sender, { text: '❌ عذراً، تشغيل الفعاليات مقتصر على المشرفين ونخبة فانيتاس فقط!' }, { quoted: m });
                return;
            }
            gameRounds = parseInt(args[1]) || 3;
            currentRound = 1;
            activeGame = 'fruits';
            scores = {};
            const randomFruit = fruitsList[Math.floor(Math.random() * fruitsList.length)];
            targetAnswer = randomFruit.name;
            await sock.sendMessage(sender, { text: `🍎 ──〔 لعبة الفواكه 〕── 🍎\n📊 عدد الجولات: ${gameRounds}\n\nالحق اكتب اسم الفاكهة:\n${randomFruit.emoji}` }, { quoted: m });
            return;
        }

        // --- فعالية تفكيك الأنمي (البوت يعطي الاسم، الجمهور يفكك) ---
        if (command === '.anime' || command === '.تفكيك') {
            if (!isElite) {
                await sock.sendMessage(sender, { text: '❌ عذراً، تشغيل الفعاليات مقتصر على المشرفين ونخبة فانيتاس فقط!' }, { quoted: m });
                return;
            }
            gameRounds = parseInt(args[1]) || 3;
            currentRound = 1;
            activeGame = 'unscramble';
            scores = {};
            const randomAnime = animeList[Math.floor(Math.random() * animeList.length)];
            targetAnswer = randomAnime.name;
            await sock.sendMessage(sender, { text: `🧩 ──〔 لعبة التفكيك 〕── 🧩\n📊 عدد الجولات: ${gameRounds}\n\nفكك الشخصية التالية:\n${randomAnime.original}` }, { quoted: m });
            return;
        }

        // --- فعالية تجميع الأنمي (البوت يعطي مفرّق، الجمهور يجمع) ---
        if (command === '.تجميع') {
            if (!isElite) {
                await sock.sendMessage(sender, { text: '❌ عذراً، تشغيل الفعاليات مقتصر على المشرفين ونخبة فانيتاس فقط!' }, { quoted: m });
                return;
            }
            gameRounds = parseInt(args[1]) || 3;
            currentRound = 1;
            activeGame = 'assemble';
            scores = {};
            const randomItem = scrambleList[Math.floor(Math.random() * scrambleList.length)];
            targetAnswer = randomItem.name;
            await sock.sendMessage(sender, { text: `🔠 ──〔 لعبة التجميع 〕── 🔠\n📊 عدد الجولات: ${gameRounds}\n\nاجمع الحروف لتكوين اسم الشخصية:\n${randomItem.spaced}` }, { quoted: m });
            return;
        }

        // --- استقبال الإجابات للفعاليات ---
        if (activeGame) {
            const userCleanAnswer = textBody.trim().toLowerCase();
            const targetCleanAnswer = targetAnswer.trim().toLowerCase();
            if (userCleanAnswer === targetCleanAnswer) {
                scores[sender] = (scores[sender] || 0) + 1;
                await sock.sendMessage(sender, { text: `🎉 كفو @${sender.split('@')[0]}! أجبْت بشكل صحيح ونقطة لك 🎯\n(نقاطك الحالية: ${scores[sender]})`, mentions: [sender] }, { quoted: m });
                currentRound++;
                if (currentRound > gameRounds) {
                    let resultText = `🏆 ──〔 النتائج النهائية للفعالية 〕── 🏆\n`;
                    for (let [user, pts] of Object.entries(scores)) {
                        resultText += `• @${user.split('@')[0]} : ${pts} نقاط\n`;
                    }
                    await sock.sendMessage(sender, { text: resultText, mentions: Object.keys(scores) });
                    activeGame = null;
                } else {
                    if (activeGame === 'fruits') {
                        const randomFruit = fruitsList[Math.floor(Math.random() * fruitsList.length)];
                        targetAnswer = randomFruit.name;
                        await sock.sendMessage(sender, { text: `🔄 الجولة (${currentRound}/${gameRounds})\nاكتب اسم الفاكهة:\n${randomFruit.emoji}` });
                    } else if (activeGame === 'unscramble') {
                        const randomAnime = animeList[Math.floor(Math.random() * animeList.length)];
                        targetAnswer = randomAnime.name;
                        await sock.sendMessage(sender, { text: `🔄 الجولة (${currentRound}/${gameRounds})\nفكك الشخصية:\n${randomAnime.original}` });
                    } else if (activeGame === 'assemble') {
                        const randomItem = scrambleList[Math.floor(Math.random() * scrambleList.length)];
                        targetAnswer = randomItem.name;
                        await sock.sendMessage(sender, { text: `🔄 الجولة (${currentRound}/${gameRounds})\nاجمع الحروف:\n${randomItem.spaced}` });
                    }
                }
            }
        }
    });
}
startBot();