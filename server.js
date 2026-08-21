const express = require('express');
const axios = require('axios');
const path = require('path');
const fs = require('fs');
const { GoogleGenAI } = require('@google/genai');

// ==========================================
// 🔑 ดึง GEMINI API KEY จากการตั้งค่าของเซิร์ฟเวอร์ Render (ป้องกันการโดนแบน)
// ==========================================
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const genAI = new GoogleGenAI({ apiKey: GEMINI_API_KEY });
// ==========================================

// นำเข้าโมดูลสร้างการ์ด Flex Message ที่เราแยกไฟล์ไว้
const { getSmartFactoryFlexMessage } = require('./public/FlexDesign/flex-message');

const app = express();
const PORT = 4000;

// Middleware สำหรับจัดการ JSON และการเสิร์ฟไฟล์หน้าเว็บ
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public/Web')));

// การตั้งค่า LINE API (เอาไว้ให้ผู้ใช้มากรอกทีหลัง)
// หมายเหตุ: อย่าลืมใส่ Channel Access Token ของคุณ
const LINE_ACCESS_TOKEN = 'LwYN7y7w9mLrlQaVpXNvkwyRI3HWriFviAiY0+Ub/8GWxDBIFtkhYiuvLerflX5JkG/iD4FSbj5CNW77vhPnt2Pvpm5w3p3mQ7vQofbVmMhj5ic5vLhlmVt2zuUhQR5BmgDW8Pk212banIe5X24eTQdB04t89/1O/w1cDnyilFU='; 

// API สำหรับรับข้อความจากหน้าเว็บ แล้วส่งไปหาผู้ใช้ (Push Message)
app.post('/api/send-message', async (req, res) => {
    const { userId, message } = req.body;

    if (!userId || !message) {
        return res.status(400).json({ success: false, error: 'กรุณากรอก User ID และข้อความให้ครบถ้วน' });
    }

    if (LINE_ACCESS_TOKEN === 'YOUR_CHANNEL_ACCESS_TOKEN') {
        return res.status(400).json({ success: false, error: 'คุณยังไม่ได้ใส่ Channel Access Token ในโค้ด server.js' });
    }

    try {
        const response = await axios.post(
            'https://api.line.me/v2/bot/message/push',
            {
                to: userId,
                messages: [
                    {
                        type: 'text',
                        text: message
                    }
                ]
            },
            {
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${LINE_ACCESS_TOKEN}`
                }
            }
        );

        res.json({ success: true, data: response.data });
    } catch (error) {
        console.error('Error sending message:', error.response ? error.response.data : error.message);
        res.status(500).json({ 
            success: false, 
            error: error.response ? error.response.data.message : 'ไม่สามารถส่งข้อความได้' 
        });
    }
});

// API สำหรับเช็คโควต้าข้อความที่ส่งได้
app.get('/api/quota', async (req, res) => {
    if (LINE_ACCESS_TOKEN === 'YOUR_CHANNEL_ACCESS_TOKEN') {
        return res.status(400).json({ success: false, error: 'คุณยังไม่ได้ใส่ Channel Access Token' });
    }

    try {
        // 1. ดึงข้อมูลจำนวนที่ส่งไปแล้วในเดือนนี้
        const consumptionRes = await axios.get('https://api.line.me/v2/bot/message/quota/consumption', {
            headers: { 'Authorization': `Bearer ${LINE_ACCESS_TOKEN}` }
        });
        
        // 2. ดึงข้อมูลโควต้ารวม
        const quotaRes = await axios.get('https://api.line.me/v2/bot/message/quota', {
            headers: { 'Authorization': `Bearer ${LINE_ACCESS_TOKEN}` }
        });

        res.json({ 
            success: true, 
            data: {
                totalUsage: consumptionRes.data.totalUsage,
                type: quotaRes.data.type,
                value: quotaRes.data.value
            }
        });
    } catch (error) {
        console.error('Error fetching quota:', error.response ? error.response.data : error.message);
        res.status(500).json({ success: false, error: 'ไม่สามารถดึงข้อมูลโควต้าได้' });
    }
});

// ฟังก์ชันสำหรับอ่านและบันทึกผู้ใช้
const USERS_FILE = path.join(__dirname, 'users.json');
function getSavedUsers() {
    try {
        if (!fs.existsSync(USERS_FILE)) fs.writeFileSync(USERS_FILE, '[]');
        return JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
    } catch (e) {
        return [];
    }
}
function saveUser(id, type) {
    const users = getSavedUsers();
    if (!users.find(u => u.id === id)) {
        users.push({ id, type, timestamp: new Date().toISOString() });
        fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
    }
}

const CHAT_FILE = path.join(__dirname, 'chat_history.json');
function getChatHistory() {
    try {
        if (!fs.existsSync(CHAT_FILE)) fs.writeFileSync(CHAT_FILE, '[]');
        return JSON.parse(fs.readFileSync(CHAT_FILE, 'utf8'));
    } catch (e) {
        return [];
    }
}
function saveChatMessage(userId, text) {
    const chats = getChatHistory();
    // เก็บแค่ 50 ข้อความล่าสุด จะได้ไม่ล้น
    if (chats.length >= 50) chats.shift();
    chats.push({ userId, text, timestamp: new Date().toISOString() });
    fs.writeFileSync(CHAT_FILE, JSON.stringify(chats, null, 2));
}

// API สำหรับให้ LINE ส่ง Webhook เข้ามา
app.post('/webhook', async (req, res) => {
    // ตอบกลับ LINE ทันทีว่าได้รับแล้ว (ต้องตอบ 200 ไม่งั้น LINE จะถือว่า error)
    res.status(200).send('OK');

    const events = req.body.events;
    if (events && events.length > 0) {
        for (const event of events) {
            // 1. ดักจับ ID ผู้ใช้/กลุ่ม
            const source = event.source;
            if (source) {
                if (source.type === 'user' && source.userId) {
                    saveUser(source.userId, 'User');
                } else if (source.type === 'group' && source.groupId) {
                    saveUser(source.groupId, 'Group');
                }
            }

            // 2. ตรวจสอบข้อความและตอบกลับ (Reply Message)
            if (event.type === 'message' && event.message.type === 'text') {
                const userText = event.message.text.trim();
                const replyToken = event.replyToken;
                
                // บันทึกข้อความลงไฟล์เพื่อให้หน้าเว็บดึงไปโชว์
                const senderId = (source && source.userId) ? source.userId : 'Unknown';
                saveChatMessage(senderId, userText);

                let messagesPayload = [];

                // 1. ถ้าพิมพ์ "เมนู" ให้โชว์แผงควบคุมเหมือนเดิม
                if (userText === 'เมนู' || userText === '?') {
                    messagesPayload = [getSmartFactoryFlexMessage()];
                }
                // 1.1 ปุ่มทักทาย (จากการ์ด Flex)
                else if (userText === 'สวัสดี') {
                    messagesPayload = [{ type: 'text', text: 'สวัสดีค่ะพี่! 👋😄 วันนี้มีงานอะไรให้น้องช่วยบ้างคะ? พิมพ์ "Bot" แล้วตามด้วยคำถามได้เลยนะคะ~' }];
                }
                // 1.2 ปุ่มออกจากระบบ (จากการ์ด Flex)
                else if (userText === 'ขอบคุณครับ' || userText === 'ขอบคุณ' || userText === 'ขอบคุณค่ะ') {
                    messagesPayload = [{ type: 'text', text: 'ยินดีให้บริการเสมอค่ะพี่! 🙏💕 ถ้าต้องการน้องอีกก็เรียกได้เลยนะคะ~ ไปทำงานต่อได้เล้ยยย!' }];
                }
                // 2. ถ้าพิมพ์ "โควต้า" ให้เช็คจำนวนข้อความ
                else if (userText === 'โควต้า') {
                    try {
                        const consumptionRes = await axios.get('https://api.line.me/v2/bot/message/quota/consumption', {
                            headers: { 'Authorization': `Bearer ${LINE_ACCESS_TOKEN}` }
                        });
                        const quotaRes = await axios.get('https://api.line.me/v2/bot/message/quota', {
                            headers: { 'Authorization': `Bearer ${LINE_ACCESS_TOKEN}` }
                        });
                        
                        const lineUsage = consumptionRes.data.totalUsage;
                        const lineLimit = quotaRes.data.type === 'limited' ? quotaRes.data.value : 'ไม่จำกัด';
                        
                        const quotaText = `📊 รายงานสถานะโควต้าประจำเดือน\n\n🟢 LINE ข้อความตอบกลับ (Reply): ฟรีไม่จำกัด\n🟢 LINE ข้อความส่งหา (Push): ใช้ไป ${lineUsage} / ${lineLimit} ข้อความ\n\n🧠 AI (Gemini): ฟรี 1,500 ครั้ง/วัน (ไม่จำกัดข้อความ)`;
                        messagesPayload = [{ type: 'text', text: quotaText }];
                    } catch (err) {
                        messagesPayload = [{ type: 'text', text: '❌ ไม่สามารถดึงข้อมูลโควต้าได้ กรุณาตรวจสอบ LINE Access Token ค่ะ' }];
                    }
                }
                // 3. ถ้าขึ้นต้นด้วย "Bot" หรือ "bot" ให้ส่งไปหา AI ผู้หญิงติดตลก
                else if (userText.toLowerCase().startsWith('bot')) {
                    const question = userText.substring(3).trim(); // ตัดคำว่า bot ออก
                    
                    if (question === '') {
                        messagesPayload = [{ type: 'text', text: 'เรียกชื่อน้องแล้ว มีอะไรให้ช่วยไหมคะ? 🥺' }];
                    } else {
                        // ดึงประวัติการเรียก AI แล้วลบข้อมูลที่เก่ากว่า 1 นาที (60000 ms) ทิ้งไป
                        const now = Date.now();
                        global.aiRequestTimestamps = (global.aiRequestTimestamps || []).filter(timestamp => now - timestamp < 60000);
                        
                        // ตรวจสอบว่าใน 1 นาทีที่ผ่านมา มีคนถามเกิน 10 ครั้งหรือยัง
                        if (global.aiRequestTimestamps.length >= 10) {
                            messagesPayload = [{ type: 'text', text: 'ใจเย็นๆ ก่อนนะคะพี่ๆ ถามรัวเกิน 10 คำถามใน 1 นาทีแล้ว สมองน้องบอทร้อนไปหมดแล้วค่ะ! ขอพักหายใจสักแป๊บนะคะ 😵‍💫💦' }];
                        } else {
                            try {
                                if (!GEMINI_API_KEY) {
                                    messagesPayload = [{ type: 'text', text: 'รอแป๊บนะคะ ช่างยังไม่ได้ใส่กุญแจสมอง AI ใน Render ให้หนูเลยค่ะ 🧠🗝️' }];
                                } else {
                                    // บันทึกเวลาที่เรียกใช้งานครั้งนี้
                                    global.aiRequestTimestamps.push(now);
                                    
                                    // สั่งให้ AI สวมบทบาทเป็นผู้หญิง ติดตลก และจำกัดคำตอบไม่เกิน 30 คำ
                                    const prompt = `คุณคือผู้ช่วย AI ประจำโรงงานอุตสาหกรรม ชื่อ "น้องบอท" เป็นเพศหญิง นิสัยร่าเริง กวนนิดๆ ติดตลกหน่อยๆ คุยเก่งและเป็นกันเอง คอยช่วยงานช่างและวิศวกร\n\nกฎสำคัญมากที่ต้องปฏิบัติตามเสมอ:\n1. ตอบสั้นๆ ไม่เกิน 30 คำเท่านั้น ถ้าเกินให้สรุปให้สั้นลงก่อนส่ง\n2. ห้ามแสดงโค้ดหรือตัวอย่างยาวๆ ถ้าถามเรื่องโค้ดให้บอกแนวทางสั้นๆ แทน\n3. ลงท้ายด้วย 'ค่ะ' หรือ 'นะคะ' เสมอ\n\nคำถาม: ${question}`;
                                    
                                    // ใช้ SDK ใหม่ @google/genai (v1alpha - รองรับโมเดลล่าสุด)
                                    const result = await genAI.models.generateContent({
                                        model: "gemini-3.6-flash",
                                        contents: prompt
                                    });
                                    const aiResponse = result.text;
                                    
                                    messagesPayload = [{ type: 'text', text: aiResponse }];
                                }
                            } catch (error) {
                                console.error("Gemini Error:", error);
                                messagesPayload = [{ type: 'text', text: 'ขออภัยค่ะ ตอนนี้สมอง AI ของหนูกำลังช็อตชั่วคราว 😵‍💫' }];
                            }
                        }
                    }
                }

                // ส่งข้อความตอบกลับเฉพาะเมื่อมีการสร้าง Payload ไว้
                if (messagesPayload.length > 0) {
                    try {
                        await axios.post(
                            'https://api.line.me/v2/bot/message/reply',
                            {
                                replyToken: replyToken,
                                messages: messagesPayload
                            },
                            {
                                headers: {
                                    'Content-Type': 'application/json',
                                    'Authorization': `Bearer ${LINE_ACCESS_TOKEN}`
                                }
                            }
                        );
                    } catch (error) {
                        console.error('Error replying message:', error.response ? error.response.data : error.message);
                    }
                }
            }
        }
    }
});

// API สำหรับดึงรายชื่อ ID ทั้งหมดไปโชว์ที่หน้าเว็บ
app.get('/api/users', (req, res) => {
    res.json({ success: true, data: getSavedUsers() });
});

// API สำหรับดึงประวัติข้อความแชท
app.get('/api/messages', (req, res) => {
    res.json({ success: true, data: getChatHistory() });
});

// API สำหรับเช็ครุ่นของ AI (ใช้แก้ปัญหา 404)
app.get('/api/models', async (req, res) => {
    try {
        const response = await axios.get(`https://generativelanguage.googleapis.com/v1beta/models?key=${process.env.GEMINI_API_KEY}`);
        res.json({ success: true, models: response.data.models.map(m => m.name) });
    } catch (error) {
        res.json({ success: false, error: error.message });
    }
});

app.listen(PORT, () => {
    console.log(`🚀 LINE Bot Dashboard เปิดทำงานแล้วที่ http://localhost:${PORT}`);
});
